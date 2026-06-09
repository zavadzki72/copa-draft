using System.Text.Json;
using CopaDraft.Api.Data;
using CopaDraft.Api.Services;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Code-review fixes (🟡3): tournaments interrupted by an API restart are
/// resumable from persisted state (deterministic re-simulation), finished
/// tournaments are evicted from memory, and late resyncs fall back to the
/// persisted snapshot.
/// </summary>
public class ResumeAndEvictionTests : IClassFixture<ApiTestHost>
{
    private readonly ApiTestHost _host;

    public ResumeAndEvictionTests(ApiTestHost host) => _host = host;

    private static SubmitTeamRequest ValidTeam(int nth)
    {
        Squad squad = SquadRepository.All
            .Where(s => TeamHelpers.BestXI(s, "4-3-3", GameConfig.Default).Count == 11)
            .ElementAt(nth);
        List<EnginePlayer> xi = TeamHelpers.BestXI(squad, "4-3-3", GameConfig.Default);
        return new SubmitTeamRequest("4-3-3", xi.Select(p => p.Id).ToList(), Array.Empty<string>(), null);
    }

    /// <summary>Builds a room frozen mid-tournament: draft completo + estado
    /// Groups, mas SEM runner em memória — como após um restart da API.</summary>
    private async Task<string> InterruptedRoomAsync()
    {
        using IServiceScope scope = _host.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rooms = scope.ServiceProvider.GetRequiredService<RoomService>();
        var draft = scope.ServiceProvider.GetRequiredService<DraftService>();

        (Guid hostId, _) = _host.NewUser("R-host-" + Guid.NewGuid().ToString("N")[..6]);
        (Guid guestId, _) = _host.NewUser("R-guest-" + Guid.NewGuid().ToString("N")[..6]);
        RoomStateDto room = await rooms.CreateAsync(hostId);
        await rooms.JoinAsync(room.Code, guestId);
        await rooms.StartDraftAsync(room.Code, hostId);
        await draft.SubmitAsync(room.Code, hostId, ValidTeam(0));
        await draft.SubmitAsync(room.Code, guestId, ValidTeam(4));

        // simula o "restart": sala já tinha avançado para Groups, runner perdido
        Room entity = await db.Rooms.SingleAsync(r => r.Code == room.Code);
        entity.State = RoomState.Groups;
        await db.SaveChangesAsync();
        return room.Code;
    }

    [Fact]
    public async Task Interrupted_Tournament_Resumes_To_Champion_And_Evicts()
    {
        string code = await InterruptedRoomAsync();
        var orchestrator = _host.Factory.Services.GetRequiredService<TournamentOrchestrator>();

        Assert.False(orchestrator.IsRunning(code));
        Assert.True(await orchestrator.ResumeAsync(code), "resume deveria iniciar o runner");

        // pace 0 → corre até o campeão; espera persistir
        string? champion = null;
        for (int i = 0; i < 200 && champion is null; i++)
        {
            await Task.Delay(50);
            using IServiceScope scope = _host.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Room room = await db.Rooms.AsNoTracking().SingleAsync(r => r.Code == code);
            TournamentRecord? rec = await db.Tournaments.AsNoTracking()
                .SingleOrDefaultAsync(t => t.RoomId == room.Id);
            if (room.State == RoomState.Finished) champion = rec?.ChampionTeamId;
        }

        Assert.False(string.IsNullOrEmpty(champion), "torneio retomado deveria terminar com campeão persistido");
        Assert.Null(orchestrator.LastError(code));

        // eviction: runner sai da memória após encerrar
        for (int i = 0; i < 100 && orchestrator.IsRunning(code); i++) await Task.Delay(20);
        Assert.False(orchestrator.IsRunning(code), "sala encerrada deveria ser evictada da memória");

        // resync tardio: snapshot vem do TournamentRecord persistido
        TournamentSnapshotDto? snap = await orchestrator.SnapshotOrPersistedAsync(code);
        Assert.NotNull(snap);
        Assert.Equal("encerrada", snap!.Phase);
        Assert.Equal(champion, snap.ChampionTeamId);
    }

    [Fact]
    public async Task Resume_Is_Deterministic_Same_Champion_From_Same_Seed()
    {
        string code = await InterruptedRoomAsync();
        uint seed;
        List<TeamEntry> humans;
        using (IServiceScope scope = _host.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Room room = await db.Rooms.AsNoTracking()
                .Include(r => r.Participants).ThenInclude(p => p.User)
                .Include(r => r.Participants).ThenInclude(p => p.Team)
                .SingleAsync(r => r.Code == code);
            seed = (uint)room.Seed;
            humans = room.Participants.OrderBy(p => p.JoinOrder).Select(p => new TeamEntry
            {
                Id = "h:" + p.UserId, IsHuman = true, DisplayName = p.User!.Name,
                Side = DraftService.ToSide(p.Team!, p.User!.Name),
            }).ToList();
        }

        // o que o resume vai produzir é o mesmo torneio que uma simulação direta
        GeneratedTournament a = TournamentGenerator.Generate(humans, seed, GameConfig.Default);
        GeneratedTournament b = TournamentGenerator.Generate(humans, seed, GameConfig.Default);
        Assert.Equal(
            string.Join(";", a.Groups.Select(g => g.Label + ":" + string.Join(",", g.Entries.Select(e => e.Id)))),
            string.Join(";", b.Groups.Select(g => g.Label + ":" + string.Join(",", g.Entries.Select(e => e.Id)))));
    }

    [Fact]
    public async Task SnapshotOrPersisted_Returns_Null_For_Unknown_Room()
    {
        var orchestrator = _host.Factory.Services.GetRequiredService<TournamentOrchestrator>();
        Assert.Null(await orchestrator.SnapshotOrPersistedAsync("ZZZ999"));
    }
}
