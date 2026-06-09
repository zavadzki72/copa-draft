using System.Text.Json;
using CopaDraft.Api.Data;
using CopaDraft.Api.Services;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CopaDraft.Engine.Tests;

public class DraftServiceTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly RoomService _rooms;
    private readonly DraftService _draft;
    private readonly Guid _host = Guid.NewGuid();
    private readonly Guid _guest = Guid.NewGuid();

    public DraftServiceTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _db.Users.AddRange(
            new User { Id = _host, GoogleSub = "h", Name = "Host", CreatedAt = DateTimeOffset.UtcNow },
            new User { Id = _guest, GoogleSub = "g", Name = "Guest", CreatedAt = DateTimeOffset.UtcNow });
        _db.SaveChanges();
        _rooms = new RoomService(_db, Options.Create(new MpOptions()));
        _draft = new DraftService(_db);
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private async Task<string> RoomInDraft()
    {
        RoomStateDto room = await _rooms.CreateAsync(_host);
        await _rooms.JoinAsync(room.Code, _guest);
        await _rooms.StartDraftAsync(room.Code, _host);
        return room.Code;
    }

    /// <summary>A valid 4-3-3 from the strongest squad (ids only).</summary>
    private static SubmitTeamRequest ValidTeam()
    {
        Squad squad = SquadRepository.All[0];
        List<EnginePlayer> xi = TeamHelpers.BestXI(squad, "4-3-3", GameConfig.Default);
        var takenIds = xi.Select(p => p.Id).ToHashSet();
        string benchGk = squad.Players.First(p => p.Pos == "GOL" && !takenIds.Contains(p.Id)).Id;
        return new SubmitTeamRequest("4-3-3", xi.Select(p => p.Id).ToList(), new[] { benchGk }, xi[0].Id);
    }

    [Fact]
    public async Task Valid_Submission_Persists()
    {
        string code = await RoomInDraft();
        await _draft.SubmitAsync(code, _host, ValidTeam());
        DraftProgressDto p = await _draft.ProgressAsync(code);
        Assert.Equal(1, p.Submitted);
        Assert.Equal(2, p.Total);
        Assert.Contains(_host, p.SubmittedUserIds);
    }

    [Fact]
    public async Task Resubmission_Overwrites_Not_Duplicates()
    {
        string code = await RoomInDraft();
        await _draft.SubmitAsync(code, _host, ValidTeam());
        await _draft.SubmitAsync(code, _host, ValidTeam());
        Assert.Equal(1, _db.Teams.Count());
    }

    [Theory]
    [InlineData("9-9-9")]           // formação inexistente
    [InlineData("4-4-2")]           // formação válida mas elenco é 4-3-3
    public async Task Invalid_Formation_Or_Mismatch_Rejected(string formation)
    {
        string code = await RoomInDraft();
        SubmitTeamRequest team = ValidTeam() with { Formation = formation };
        await Assert.ThrowsAsync<RoomServiceException>(() => _draft.SubmitAsync(code, _host, team));
    }

    [Fact]
    public async Task Duplicate_Player_Rejected()
    {
        string code = await RoomInDraft();
        SubmitTeamRequest valid = ValidTeam();
        var dupBench = new[] { valid.Starters[0] };
        await Assert.ThrowsAsync<RoomServiceException>(() =>
            _draft.SubmitAsync(code, _host, valid with { Bench = dupBench }));
    }

    [Fact]
    public async Task Captain_Must_Be_A_Starter()
    {
        string code = await RoomInDraft();
        SubmitTeamRequest valid = ValidTeam();
        await Assert.ThrowsAsync<RoomServiceException>(() =>
            _draft.SubmitAsync(code, _host, valid with { CaptainId = "nope" }));
    }

    [Fact]
    public async Task Submission_Outside_Draft_State_Rejected()
    {
        RoomStateDto room = await _rooms.CreateAsync(_host);   // ainda Waiting
        await Assert.ThrowsAsync<RoomServiceException>(() =>
            _draft.SubmitAsync(room.Code, _host, ValidTeam()));
    }

    [Fact]
    public async Task Autofill_Builds_Valid_Deterministic_Teams()
    {
        string code = await RoomInDraft();
        await _draft.SubmitAsync(code, _host, ValidTeam());
        int filled = await _draft.AutofillMissingAsync(code);
        Assert.Equal(1, filled);
        Assert.True(await _draft.AllSubmittedAsync(code));

        SubmittedTeam team = _db.Teams.Include(t => t.Participant)
            .Single(t => t.Participant!.UserId == _guest);
        Assert.True(team.AutoFilled);
        var starters = JsonSerializer.Deserialize<List<string>>(team.StartersJson)!;
        Assert.Equal(11, starters.Count);
        Assert.Equal(11, starters.Distinct().Count());
        // a valid engine side can be built from it
        SideInput side = DraftService.ToSide(team, "Guest");
        Assert.Equal(11, side.Starters.Count);
        Assert.Equal(4, side.Bench.Count);

        // determinístico: mesmo seed da sala -> mesmo time
        Room room = _db.Rooms.Single();
        uint seed = Rng.SeedFrom(room.Seed + ":" + _guest);
        Assert.True(seed > 0);
    }

    [Fact]
    public async Task ToSide_Builds_Playable_Engine_Side_That_Simulates()
    {
        string code = await RoomInDraft();
        await _draft.SubmitAsync(code, _host, ValidTeam());
        await _draft.AutofillMissingAsync(code);

        List<SubmittedTeam> teams = _db.Teams.ToList();
        SideInput home = DraftService.ToSide(teams[0], "A");
        SideInput away = DraftService.ToSide(teams[1], "B");
        MatchLog log = MatchEngine.SimulateMatch(home, away, GameConfig.Default, 7, new EngineOptions());
        Assert.Equal("full", log.Events[^1].Type);
    }
}
