using System.Text.Json;
using CopaDraft.Api.Data;
using CopaDraft.Api.Services;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// O coração da restrição de resume: uma disputa de pênaltis decidida NÃO é
/// reproduzível pela seed, então o vencedor persistido tem de ser REAPLICADO no
/// resume — nunca re-simulado. Este teste roda um torneio com humanos até surgir
/// uma disputa real, TROCA o vencedor persistido (reescrevendo as cobranças) e
/// retoma: o bracket tem de honrar o resultado persistido, não a re-simulação.
/// </summary>
public class ShootoutResumeTests : IClassFixture<ApiTestHost>
{
    private readonly ApiTestHost _host;

    public ShootoutResumeTests(ApiTestHost host) => _host = host;

    private static SubmitTeamRequest ValidTeam(int nth)
    {
        Squad squad = SquadRepository.All
            .Where(s => TeamHelpers.BestXI(s, "4-3-3", GameConfig.Default).Count == 11)
            .ElementAt(nth);
        List<EnginePlayer> xi = TeamHelpers.BestXI(squad, "4-3-3", GameConfig.Default);
        return new SubmitTeamRequest("4-3-3", xi.Select(p => p.Id).ToList(), Array.Empty<string>(), null);
    }

    /// <summary>Sala congelada mid-torneio (State=Groups, sem runner em memória),
    /// com seed FIXA — como após um restart da API.</summary>
    private async Task<string> InterruptedRoomAsync(long seed)
    {
        using IServiceScope scope = _host.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rooms = scope.ServiceProvider.GetRequiredService<RoomService>();
        var draft = scope.ServiceProvider.GetRequiredService<DraftService>();

        (Guid hostId, _) = _host.NewUser("S-host-" + Guid.NewGuid().ToString("N")[..6]);
        (Guid guestId, _) = _host.NewUser("S-guest-" + Guid.NewGuid().ToString("N")[..6]);
        RoomStateDto room = await rooms.CreateAsync(hostId);
        await rooms.JoinAsync(room.Code, guestId);
        await rooms.StartDraftAsync(room.Code, hostId);
        await draft.SubmitAsync(room.Code, hostId, ValidTeam(0));
        await draft.SubmitAsync(room.Code, guestId, ValidTeam(4));

        Room entity = await db.Rooms.SingleAsync(r => r.Code == room.Code);
        entity.State = RoomState.Groups;
        entity.Seed = seed;   // seed fixa → torneio reproduzível
        await db.SaveChangesAsync();
        return room.Code;
    }

    private async Task<string?> RunToFinishAsync(string code)
    {
        var orchestrator = _host.Factory.Services.GetRequiredService<TournamentOrchestrator>();
        Assert.True(await orchestrator.ResumeAsync(code), "resume deveria iniciar o runner");
        for (int i = 0; i < 300; i++)
        {
            using IServiceScope scope = _host.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Room room = await db.Rooms.AsNoTracking().SingleAsync(r => r.Code == code);
            if (room.State == RoomState.Finished)
            {
                // espera a eviction da memória (snapshot final já persistido)
                for (int j = 0; j < 100 && orchestrator.IsRunning(code); j++) await Task.Delay(20);
                return room.Code;
            }
            await Task.Delay(50);
        }
        return null;
    }

    private async Task<ShootoutRecord?> FirstDecidedShootoutAsync(string code)
    {
        using IServiceScope scope = _host.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Room room = await db.Rooms.AsNoTracking().SingleAsync(r => r.Code == code);
        return await db.Shootouts.AsNoTracking()
            .Where(s => s.RoomId == room.Id && s.Decided)
            .OrderBy(s => s.TieId)
            .FirstOrDefaultAsync();
    }

    [Fact]
    public async Task Persisted_Shootout_Is_Reapplied_On_Resume_Not_Resimulated()
    {
        // 1) procura (deterministicamente) uma seed cujo torneio produz uma
        //    disputa de pênaltis interativa decidida envolvendo humano.
        string? code = null;
        ShootoutRecord? rec = null;
        for (long seed = 1; seed <= 80 && rec is null; seed++)
        {
            code = await InterruptedRoomAsync(seed);
            string? finished = await RunToFinishAsync(code);
            Assert.False(finished is null, "torneio deveria terminar");
            rec = await FirstDecidedShootoutAsync(code);
        }
        Assert.False(rec is null, "nenhuma disputa de pênaltis surgiu em 80 seeds — improvável");

        var orchestrator = _host.Factory.Services.GetRequiredService<TournamentOrchestrator>();
        TournamentSnapshotDto? before = await orchestrator.SnapshotOrPersistedAsync(code!);
        Assert.NotNull(before);
        TieDto tie = before!.Bracket.SelectMany(b => b.Ties).Single(t => t.TieId == rec!.TieId);
        Assert.Equal(tie.WinnerId, rec!.WinnerId);   // o bracket reflete a disputa

        // 2) TROCA o vencedor persistido reescrevendo as cobranças: o lado perdedor
        //    converte tudo, o vencedor original erra tudo.
        string flippedWinnerId = rec.WinnerId == tie.HomeId ? tie.AwayId! : tie.HomeId;
        string flippedSide = rec.WinnerId == tie.HomeId ? "away" : "home";
        var prog = new ShootoutProgress();
        int k = 0;
        while (prog.Winner is null)
        {
            string side = prog.NextSide;
            bool scored = side == flippedSide;
            prog.ApplyAndCheck(new ShootoutKick(k, side, side, side, "meio",
                scored ? "esq" : "meio", scored ? "goal" : "save", scored), GameConfig.Default.PK_ROUNDS);
            k++;
        }
        Assert.Equal(flippedSide, prog.Winner);

        using (IServiceScope scope = _host.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Room room = await db.Rooms.SingleAsync(r => r.Code == code);
            ShootoutRecord stored = await db.Shootouts.SingleAsync(s => s.RoomId == room.Id && s.TieId == rec.TieId);
            stored.KicksJson = JsonSerializer.Serialize(prog.Kicks);
            stored.PensHome = prog.ScoreHome;
            stored.PensAway = prog.ScoreAway;
            stored.WinnerId = flippedWinnerId;
            stored.Decided = true;
            // volta a sala para Knockout para permitir o resume
            room.State = RoomState.Knockout;
            await db.SaveChangesAsync();
        }

        // 3) retoma: a re-simulação reproduz a mesma tie pendente, mas REAPLICA a
        //    disputa persistida (trocada) em vez de re-simular → o vencedor muda.
        string? finished2 = await RunToFinishAsync(code!);
        Assert.False(finished2 is null, "resume deveria terminar de novo");

        TournamentSnapshotDto? after = await orchestrator.SnapshotOrPersistedAsync(code!);
        Assert.NotNull(after);
        TieDto tieAfter = after!.Bracket.SelectMany(b => b.Ties).Single(t => t.TieId == rec.TieId);
        Assert.Equal(flippedWinnerId, tieAfter.WinnerId);
        Assert.NotEqual(tie.WinnerId, tieAfter.WinnerId);
    }
}
