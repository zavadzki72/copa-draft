using System.Collections.Concurrent;
using System.Text.Json;
using CopaDraft.Api.Data;
using CopaDraft.Api.Hubs;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CopaDraft.Api.Services;

/// <summary>
/// Server-authoritative tournament runner. Once every participant has a team,
/// it builds the multi-group tournament (humans in distinct groups + AI fill),
/// simulates every match with the deterministic engine, and drives a canonical
/// round clock over SignalR: each human receives their own match log (ticker),
/// while the room receives minute ticks, finished matches, standings and the
/// bracket — live and coherent for everyone.
/// </summary>
public sealed class TournamentOrchestrator(
    IServiceScopeFactory scopes, IHubContext<LobbyHub> hub, IOptions<MpOptions> mp)
{
    public const string TournamentStateEvent = "TournamentState";
    public const string RoundStartedEvent = "RoundStarted";
    public const string YourMatchEvent = "YourMatch";
    public const string MinuteTickEvent = "MinuteTick";
    public const string MatchFinishedEvent = "MatchFinished";
    public const string TournamentFinishedEvent = "TournamentFinished";

    private readonly ConcurrentDictionary<string, RunningTournament> _running = new();

    private sealed class RunningTournament
    {
        public required GeneratedTournament T { get; init; }
        public required Dictionary<string, Guid> UserByTeamId { get; init; }
        public string Phase { get; set; } = "grupos";
        public List<(string RoundId, List<KnockoutTie> Ties)> Bracket { get; } = new();
        public Dictionary<string, (Score Score, Score? Pens, string? WinnerId, bool Played)> TieResults { get; } = new();
        public RoundInfoDto? CurrentRound { get; set; }
        public Dictionary<Guid, YourMatchDto> YourMatches { get; } = new();
        public string? ChampionTeamId { get; set; }
        public CancellationTokenSource Cts { get; } = new();
        public string? Error { get; set; }
    }

    /// <summary>Last fatal error of a room's runner (diagnostics).</summary>
    public string? LastError(string code)
        => _running.TryGetValue(code.ToUpperInvariant(), out RunningTournament? rt) ? rt.Error : null;

    public bool IsRunning(string code) => _running.ContainsKey(code);

    public TournamentSnapshotDto? Snapshot(string code)
        => _running.TryGetValue(code, out RunningTournament? rt) ? BuildSnapshot(rt) : null;

    public YourMatchDto? YourMatch(string code, Guid userId)
        => _running.TryGetValue(code, out RunningTournament? rt)
           && rt.YourMatches.TryGetValue(userId, out YourMatchDto? m) ? m : null;

    /// <summary>Builds and launches the tournament for a room whose draft is
    /// complete. Idempotent — only the first call wins.</summary>
    public async Task<bool> TryStartAsync(string code, CancellationToken ct = default)
    {
        code = code.ToUpperInvariant();
        using IServiceScope scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Room room = await db.Rooms
            .Include(r => r.Participants).ThenInclude(p => p.User)
            .Include(r => r.Participants).ThenInclude(p => p.Team)
            .SingleOrDefaultAsync(r => r.Code == code, ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");

        if (room.State != RoomState.Draft) return false;
        if (room.Participants.Any(p => p.Team is null)) return false;

        // humans in deterministic join order
        var humans = room.Participants.OrderBy(p => p.JoinOrder).Select(p => new TeamEntry
        {
            Id = "h:" + p.UserId,
            IsHuman = true,
            DisplayName = p.User?.Name ?? "Jogador",
            Side = DraftService.ToSide(p.Team!, p.User?.Name ?? "Jogador"),
        }).ToList();

        GeneratedTournament t = TournamentGenerator.Generate(humans, (uint)room.Seed, GameConfig.Default);
        var rt = new RunningTournament
        {
            T = t,
            UserByTeamId = room.Participants.ToDictionary(p => "h:" + p.UserId, p => p.UserId),
        };
        if (!_running.TryAdd(code, rt)) return false;

        room.State = RoomState.Groups;
        db.Tournaments.Add(new TournamentRecord
        {
            Id = Guid.NewGuid(), RoomId = room.Id,
            StateJson = JsonSerializer.Serialize(BuildSnapshot(rt)),
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);

        _ = Task.Run(() => RunSafelyAsync(code, rt), CancellationToken.None);
        return true;
    }

    private async Task RunSafelyAsync(string code, RunningTournament rt)
    {
        try { await RunAsync(code, rt, rt.Cts.Token); }
        catch (OperationCanceledException) { /* sala encerrada */ }
        catch (Exception e)
        {
            rt.Error = e.ToString();
            Console.Error.WriteLine($"[orchestrator] sala {code}: {e}");
        }
    }

    private async Task RunAsync(string code, RunningTournament rt, CancellationToken ct)
    {
        GameConfig cfg = GameConfig.Default;
        GeneratedTournament t = rt.T;

        // ---------- group stage: 3 rounds ----------
        int groupRounds = t.Groups[0].Fixtures.Max(f => f.Round) + 1;
        for (int round = 0; round < groupRounds; round++)
        {
            List<GroupFixture> fixtures = t.Groups.SelectMany(g => g.Fixtures).Where(f => f.Round == round).ToList();
            var logs = new Dictionary<string, MatchLog>();
            foreach (GroupFixture fx in fixtures)
            {
                logs[fx.FixtureId] = MatchEngine.SimulateMatch(
                    t.Teams[fx.HomeId].Side, t.Teams[fx.AwayId].Side, cfg,
                    TournamentGenerator.MatchSeed(t.Seed, fx.FixtureId), new EngineOptions());
            }

            await StartRoundAsync(code, rt, "group", $"Rodada {round + 1}",
                fixtures.Select(fx => (fx.FixtureId, fx.HomeId, fx.AwayId, Log: logs[fx.FixtureId])).ToList(), ct);

            // apply results + standings, persist, broadcast
            foreach (GroupFixture fx in fixtures) fx.Result = logs[fx.FixtureId].Score;
            rt.CurrentRound = null;
            await BroadcastSnapshotAsync(code, rt);
            await PersistAsync(code, rt);
            await InterRoundPauseAsync(ct);
        }

        // ---------- qualification ----------
        var qualified = new Dictionary<int, IReadOnlyList<string>>();
        foreach (TournamentGroup g in t.Groups)
            qualified[g.Index] = Standings.Compute(g, cfg).Take(cfg.GROUP_QUALIFY).Select(r => r.TeamId).ToList();

        rt.Phase = "mata-mata";
        await SetRoomStateAsync(code, RoomState.Knockout);
        List<KnockoutTie> ties = TournamentGenerator.BuildFirstKnockoutRound(t, qualified, cfg);

        // ---------- knockout rounds ----------
        for (int r = 0; ; r++)
        {
            string roundId = rt.T.KnockoutRounds[r];
            rt.Bracket.Add((roundId, ties));
            var logs = new Dictionary<string, MatchLog>();
            foreach (KnockoutTie tie in ties)
            {
                MatchLog log = MatchEngine.SimulateMatch(
                    t.Teams[tie.HomeId].Side, t.Teams[tie.AwayId].Side, cfg,
                    TournamentGenerator.MatchSeed(t.Seed, tie.TieId), new EngineOptions { Knockout = true });
                logs[tie.TieId] = log;
                tie.WinnerId = log.Result == "home" ? tie.HomeId : tie.AwayId;
                rt.TieResults[tie.TieId] = (log.Score, log.Penalties, tie.WinnerId, false);
            }

            await StartRoundAsync(code, rt, "knockout", roundId,
                ties.Select(tie => (tie.TieId, tie.HomeId, tie.AwayId, Log: logs[tie.TieId])).ToList(), ct);

            foreach (KnockoutTie tie in ties)
            {
                (Score s, Score? p, string? w, _) = rt.TieResults[tie.TieId];
                rt.TieResults[tie.TieId] = (s, p, w, true);
            }
            rt.CurrentRound = null;
            await BroadcastSnapshotAsync(code, rt);
            await PersistAsync(code, rt);

            if (ties.Count == 1)
            {
                rt.ChampionTeamId = ties[0].WinnerId;
                break;
            }
            await InterRoundPauseAsync(ct);
            ties = TournamentGenerator.BuildNextKnockoutRound(rt.T.KnockoutRounds[r + 1], ties);
        }

        // ---------- champion ----------
        rt.Phase = "encerrada";
        await SetRoomStateAsync(code, RoomState.Finished);
        await PersistAsync(code, rt);
        await hub.Clients.Group(code).SendAsync(TournamentFinishedEvent, new
        {
            championTeamId = rt.ChampionTeamId,
            championName = t.Teams[rt.ChampionTeamId!].DisplayName,
        });
        await BroadcastSnapshotAsync(code, rt);
    }

    /// <summary>Announces the round, delivers private logs and runs the clock.</summary>
    private async Task StartRoundAsync(
        string code, RunningTournament rt, string kind, string label,
        List<(string FixtureId, string HomeId, string AwayId, MatchLog Log)> matches, CancellationToken ct)
    {
        int LastMinute(MatchLog log) => log.ExtraTime ? 120 : 90;
        int maxMinute = matches.Max(m => LastMinute(m.Log));

        rt.CurrentRound = new RoundInfoDto(kind, label, maxMinute, mp.Value.PaceMsPerMinute,
            matches.Select(m => new FixtureRefDto(m.FixtureId, m.HomeId, m.AwayId, LastMinute(m.Log))).ToList());

        // private: each human gets their own full log for the ticker
        rt.YourMatches.Clear();
        foreach ((string fixtureId, string homeId, string awayId, MatchLog log) in matches)
        {
            foreach ((string teamId, string side) in new[] { (homeId, "home"), (awayId, "away") })
            {
                if (rt.UserByTeamId.TryGetValue(teamId, out Guid userId))
                {
                    var payload = new YourMatchDto(fixtureId, side, log);
                    rt.YourMatches[userId] = payload;
                    await hub.Clients.User(userId.ToString()).SendAsync(YourMatchEvent, payload, ct);
                }
            }
        }

        await BroadcastSnapshotAsync(code, rt);
        await hub.Clients.Group(code).SendAsync(RoundStartedEvent, rt.CurrentRound, ct);

        var clock = new RoundClock(mp.Value.PaceMsPerMinute);
        await clock.RunAsync(maxMinute, async minute =>
        {
            await hub.Clients.Group(code).SendAsync(MinuteTickEvent, minute, ct);
            foreach ((string fixtureId, _, _, MatchLog log) in matches)
            {
                if (LastMinute(log) != minute) continue;
                await hub.Clients.Group(code).SendAsync(MatchFinishedEvent, new
                {
                    fixtureId,
                    score = log.Score,
                    penalties = log.Penalties,
                    result = log.Result,
                }, ct);
            }
        }, ct);
    }

    private TournamentSnapshotDto BuildSnapshot(RunningTournament rt)
    {
        GameConfig cfg = GameConfig.Default;
        var groups = rt.T.Groups.Select(g => new GroupDto(
            g.Label,
            g.Entries.Select(e => new TeamRefDto(e.Id, e.DisplayName, e.IsHuman,
                rt.UserByTeamId.TryGetValue(e.Id, out Guid u) ? u : null)).ToList(),
            Standings.Compute(g, cfg).Select(r => new StandingDto(
                r.TeamId, r.P, r.J, r.V, r.E, r.D, r.GP, r.GC, r.SG)).ToList(),
            g.Fixtures.Select(f => new FixtureDto(
                f.FixtureId, f.Round, f.HomeId, f.AwayId,
                f.Result?.Home, f.Result?.Away, f.Result is not null)).ToList()
        )).ToList();

        var bracket = rt.Bracket.Select(b => new BracketRoundDto(
            b.RoundId,
            b.Ties.Select(tie =>
            {
                bool has = rt.TieResults.TryGetValue(tie.TieId, out (Score Score, Score? Pens, string? WinnerId, bool Played) res);
                return new TieDto(tie.TieId, tie.RoundId, tie.HomeId, tie.AwayId,
                    has && res.Played ? res.Score.Home : null,
                    has && res.Played ? res.Score.Away : null,
                    has && res.Played ? res.Pens?.Home : null,
                    has && res.Played ? res.Pens?.Away : null,
                    has && res.Played ? res.WinnerId : null,
                    has && res.Played);
            }).ToList()
        )).ToList();

        return new TournamentSnapshotDto(rt.Phase, groups, bracket, rt.ChampionTeamId, rt.CurrentRound);
    }

    private Task BroadcastSnapshotAsync(string code, RunningTournament rt)
        => hub.Clients.Group(code).SendAsync(TournamentStateEvent, BuildSnapshot(rt));

    private async Task PersistAsync(string code, RunningTournament rt)
    {
        using IServiceScope scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Room? room = await db.Rooms.SingleOrDefaultAsync(r => r.Code == code);
        if (room is null) return;
        TournamentRecord? rec = await db.Tournaments.SingleOrDefaultAsync(x => x.RoomId == room.Id);
        if (rec is null) return;
        rec.StateJson = JsonSerializer.Serialize(BuildSnapshot(rt));
        rec.ChampionTeamId = rt.ChampionTeamId;
        rec.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
    }

    private async Task SetRoomStateAsync(string code, RoomState state)
    {
        using IServiceScope scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Room? room = await db.Rooms.SingleOrDefaultAsync(r => r.Code == code);
        if (room is null) return;
        room.State = state;
        await db.SaveChangesAsync();
    }

    private async Task InterRoundPauseAsync(CancellationToken ct)
    {
        if (mp.Value.InterRoundSeconds > 0)
            await Task.Delay(TimeSpan.FromSeconds(mp.Value.InterRoundSeconds), ct);
    }
}
