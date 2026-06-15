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
    IServiceScopeFactory scopes, IHubContext<LobbyHub> hub, IOptions<MpOptions> mp,
    PresenceTracker presence, ILogger<TournamentOrchestrator> logger)
{
    public const string TournamentStateEvent = "TournamentState";
    public const string RoundReadyEvent = "RoundReady";
    public const string RoundReadyProgressEvent = "RoundReadyProgress";
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
        /// <summary>Logs da rodada corrente (espectador: "acompanhar campeonato").</summary>
        public Dictionary<string, (string HomeId, string AwayId, MatchLog Log)> CurrentRoundLogs { get; } = new();
        public string? ChampionTeamId { get; set; }
        public CancellationTokenSource Cts { get; } = new();
        public string? Error { get; set; }

        /// <summary>Pace do ticker (ms/min) — da velocidade escolhida no lobby.</summary>
        public int PaceMs { get; set; }

        /// <summary>Cansaço acumulado por time (mecânica do solo no MP):
        /// titulares cansam por jogo, banco descansa; penaliza o overall efetivo.</summary>
        public Dictionary<string, Dictionary<string, double>> Fatigue { get; } = new();

        /// <summary>Suspensões (vermelho) e lesões por time, carregadas entre as
        /// fases (mecânica do solo no MP).</summary>
        public Dictionary<string, Dictionary<string, PlayerStatusEntry>> Status { get; } = new();

        /// <summary>Acúmulo de stats do torneio inteiro (prêmios de fim de copa).</summary>
        public Dictionary<string, PlayerTally> Tally { get; } = new();

        // ready-gate da rodada: quem precisa clicar "iniciar" e quem já clicou
        public HashSet<Guid> RoundRequired { get; } = new();
        public HashSet<Guid> RoundReady { get; } = new();
        public TaskCompletionSource<bool>? RoundGate { get; set; }
        // pular rodada: humanos que já terminaram de assistir a própria partida
        public HashSet<Guid> RoundDone { get; } = new();
        public TaskCompletionSource<bool>? RoundSkip { get; set; }
        /// <summary>Sem humanos vivos: simula o resto sem relógio nem gate.</summary>
        public bool FastForward { get; set; }
        public object GateLock { get; } = new();
    }

    /// <summary>Last fatal error of a room's runner (diagnostics).</summary>
    public string? LastError(string code)
        => _running.TryGetValue(code.ToUpperInvariant(), out RunningTournament? rt) ? rt.Error : null;

    public bool IsRunning(string code) => _running.ContainsKey(code);

    public TournamentSnapshotDto? Snapshot(string code)
        => _running.TryGetValue(code, out RunningTournament? rt) ? BuildSnapshot(rt) : null;

    /// <summary>Snapshot da memória ou, para torneios encerrados/evictados (ou
    /// após restart), do TournamentRecord persistido.</summary>
    public async Task<TournamentSnapshotDto?> SnapshotOrPersistedAsync(string code, CancellationToken ct = default)
    {
        code = code.ToUpperInvariant();
        TournamentSnapshotDto? live = Snapshot(code);
        if (live is not null) return live;

        using IServiceScope scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Room? room = await db.Rooms.AsNoTracking().SingleOrDefaultAsync(r => r.Code == code, ct);
        if (room is null) return null;
        TournamentRecord? rec = await db.Tournaments.AsNoTracking().SingleOrDefaultAsync(x => x.RoomId == room.Id, ct);
        if (rec is null) return null;
        try { return JsonSerializer.Deserialize<TournamentSnapshotDto>(rec.StateJson); }
        catch (JsonException) { return null; }
    }

    public YourMatchDto? YourMatch(string code, Guid userId)
        => _running.TryGetValue(code, out RunningTournament? rt)
           && rt.YourMatches.TryGetValue(userId, out YourMatchDto? m) ? m : null;

    /// <summary>Log de uma partida da rodada corrente (modo espectador).</summary>
    public (string HomeId, string AwayId, MatchLog Log)? GetFixtureLog(string code, string fixtureId)
        => _running.TryGetValue(code.ToUpperInvariant(), out RunningTournament? rt)
           && rt.CurrentRoundLogs.TryGetValue(fixtureId, out (string, string, MatchLog) entry)
            ? entry : null;

    /// <summary>Marca o jogador como pronto para a rodada; quando todos os
    /// exigidos clicam, o gate abre e a rodada começa. Devolve (prontos, total)
    /// para o broadcast de progresso, ou null se não há gate ativo.</summary>
    public (int Ready, int Total)? MarkRoundReady(string code, Guid userId)
    {
        if (!_running.TryGetValue(code.ToUpperInvariant(), out RunningTournament? rt)) return null;
        lock (rt.GateLock)
        {
            if (rt.RoundGate is null || !rt.RoundRequired.Contains(userId)) return null;
            rt.RoundReady.Add(userId);
            if (rt.RoundReady.Count >= rt.RoundRequired.Count)
                rt.RoundGate.TrySetResult(true);
            return (rt.RoundReady.Count, rt.RoundRequired.Count);
        }
    }

    /// <summary>"Terminei de assistir": quando TODOS os humanos da rodada
    /// terminam (ou pulam), o relógio resolve o resto na hora.</summary>
    public void MarkDoneWatching(string code, Guid userId)
    {
        if (!_running.TryGetValue(code.ToUpperInvariant(), out RunningTournament? rt)) return;
        lock (rt.GateLock)
        {
            if (rt.RoundSkip is null || !rt.RoundRequired.Contains(userId)) return;
            rt.RoundDone.Add(userId);
            if (rt.RoundDone.Count >= rt.RoundRequired.Count)
                rt.RoundSkip.TrySetResult(true);
        }
    }

    /// <summary>Builds and launches the tournament for a room whose draft is
    /// complete. Idempotent — only the first call wins.</summary>
    public Task<bool> TryStartAsync(string code, CancellationToken ct = default)
        => StartCoreAsync(code, resume: false, ct);

    /// <summary>Retoma um torneio interrompido por restart da API: a sala já
    /// está em Groups/Knockout com todos os times persistidos. Determinístico —
    /// a re-simulação reproduz exatamente o mesmo torneio (mesma seed).</summary>
    public Task<bool> ResumeAsync(string code, CancellationToken ct = default)
        => StartCoreAsync(code, resume: true, ct);

    private async Task<bool> StartCoreAsync(string code, bool resume, CancellationToken ct)
    {
        code = code.ToUpperInvariant();
        using IServiceScope scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Room room = await db.Rooms
            .Include(r => r.Participants).ThenInclude(p => p.User)
            .Include(r => r.Participants).ThenInclude(p => p.Team)
            .SingleOrDefaultAsync(r => r.Code == code, ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");

        bool stateOk = resume
            ? room.State is RoomState.Groups or RoomState.Knockout
            : room.State == RoomState.Draft;
        if (!stateOk) return false;
        if (room.Participants.Any(p => p.Team is null)) return false;

        // humans in deterministic join order
        var humans = room.Participants.OrderBy(p => p.JoinOrder).Select(p => new TeamEntry
        {
            Id = "h:" + p.UserId,
            IsHuman = true,
            DisplayName = p.User?.Name ?? "Jogador",
            Side = DraftService.ToSide(p.Team!, p.User?.Name ?? "Jogador"),
        }).ToList();

        // range de copas (era das seleções): filtra o pool de IA; 0/0 = todas
        IReadOnlyList<Squad>? pool = (room.CupFrom > 0 && room.CupTo > 0)
            ? SquadRepository.All.Where(s => s.Cup >= room.CupFrom && s.Cup <= room.CupTo).ToList()
            : null;
        GeneratedTournament t = TournamentGenerator.Generate(
            humans, (uint)room.Seed, GameConfig.Default, pool: pool,
            aiStrengthTarget: mp.Value.AiStrengthTargetFor(room.Level));
        var rt = new RunningTournament
        {
            T = t,
            UserByTeamId = room.Participants.ToDictionary(p => "h:" + p.UserId, p => p.UserId),
        };
        rt.PaceMs = mp.Value.PaceFor(room.Speed);
        if (!_running.TryAdd(code, rt)) return false;

        room.State = RoomState.Groups;
        TournamentRecord? rec = await db.Tournaments.SingleOrDefaultAsync(x => x.RoomId == room.Id, ct);
        if (rec is null)
        {
            db.Tournaments.Add(new TournamentRecord
            {
                Id = Guid.NewGuid(), RoomId = room.Id,
                StateJson = JsonSerializer.Serialize(BuildSnapshot(rt)),
                UpdatedAt = DateTimeOffset.UtcNow,
            });
        }
        else
        {
            rec.StateJson = JsonSerializer.Serialize(BuildSnapshot(rt));
            rec.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);

        logger.LogInformation("[{Code}] torneio {Mode}: {Humans} humanos, {Groups} grupos, seed {Seed}",
            code, resume ? "RETOMADO" : "iniciado", humans.Count, t.Groups.Count, room.Seed);
        _ = Task.Run(() => RunSafelyAsync(code, rt), CancellationToken.None);
        return true;
    }

    private async Task RunSafelyAsync(string code, RunningTournament rt)
    {
        try
        {
            await RunAsync(code, rt, rt.Cts.Token);
            // encerrou: o snapshot final está persistido (SnapshotOrPersistedAsync
            // cobre resyncs tardios) — libera a memória da sala.
            _running.TryRemove(code, out _);
            logger.LogInformation("[{Code}] campeão: {Champion} — sala evictada da memória",
                code, rt.ChampionTeamId);
        }
        catch (OperationCanceledException) { /* sala encerrada */ }
        catch (Exception e)
        {
            // erro fatal: mantém a entrada para diagnóstico via LastError.
            rt.Error = e.ToString();
            logger.LogError(e, "[{Code}] torneio abortado por erro fatal", code);
        }
    }

    private async Task RunAsync(string code, RunningTournament rt, CancellationToken ct)
    {
        GameConfig cfg = GameConfig.Default;
        GeneratedTournament t = rt.T;

        Dictionary<string, double> FatigueOf(string teamId)
            => rt.Fatigue.TryGetValue(teamId, out var m) ? m : (rt.Fatigue[teamId] = new());
        Dictionary<string, PlayerStatusEntry> StatusOf(string teamId)
            => rt.Status.TryGetValue(teamId, out var m) ? m : (rt.Status[teamId] = new());
        // side efetiva: cansaço + indisponíveis (suspensos/lesionados) trocados por reservas
        SideInput SideOf(string teamId)
            => MpStatus.ApplyAvailability(MpFatigue.Apply(t.Teams[teamId].Side, FatigueOf(teamId)), StatusOf(teamId));
        // após a partida: cansaço (titulares cansam/banco descansa) + status (decrementa,
        // aplica vermelhos/lesões deste jogo). Usa a side EFETIVA (quem realmente jogou).
        void Rest(string homeId, string awayId, MatchLog log)
        {
            MpFatigue.UpdateAfterMatch(FatigueOf(homeId), SideOf(homeId), cfg);
            MpFatigue.UpdateAfterMatch(FatigueOf(awayId), SideOf(awayId), cfg);
            RestOut(homeId); RestOut(awayId);   // quem ficou fora (suspenso/lesão) descansa (como no solo)
            MpStatus.AdvanceAfterMatch(StatusOf(homeId), log, "home", cfg);
            MpStatus.AdvanceAfterMatch(StatusOf(awayId), log, "away", cfg);
            MpStats.Accumulate(rt.Tally, log, cfg);   // prêmios de fim de copa
        }
        // zera o cansaço de quem ficou de fora (não entrou na side efetiva, então
        // o MpFatigue não os tocou). Antes do AdvanceAfterMatch: descanso vale para
        // o status DESTA rodada (espelha o solo, onde o reserva fora descansa).
        void RestOut(string teamId)
        {
            Dictionary<string, PlayerStatusEntry> st = StatusOf(teamId);
            if (st.Count == 0) return;
            Dictionary<string, double> fat = FatigueOf(teamId);
            SideInput side = t.Teams[teamId].Side;
            foreach (EnginePlayer p in side.Starters.Concat(side.Bench))
                if (MpStatus.IsOut(st, p.Id)) fat[p.Id] = 0;
        }

        // ---------- group stage: 3 rounds ----------
        int groupRounds = t.Groups[0].Fixtures.Max(f => f.Round) + 1;
        for (int round = 0; round < groupRounds; round++)
        {
            List<GroupFixture> fixtures = t.Groups.SelectMany(g => g.Fixtures).Where(f => f.Round == round).ToList();
            var logs = new Dictionary<string, MatchLog>();
            foreach (GroupFixture fx in fixtures)
            {
                logs[fx.FixtureId] = MatchEngine.SimulateMatch(
                    SideOf(fx.HomeId), SideOf(fx.AwayId), cfg,
                    TournamentGenerator.MatchSeed(t.Seed, fx.FixtureId),
                    new EngineOptions { Fatigue = true, Pressure = true, RoundN = 0 });
            }

            await StartRoundAsync(code, rt, "group", $"Rodada {round + 1}",
                fixtures.Select(fx => (fx.FixtureId, fx.HomeId, fx.AwayId, Log: logs[fx.FixtureId])).ToList(), ct);

            // apply results + fatigue (titulares cansam, banco descansa)
            foreach (GroupFixture fx in fixtures)
            {
                fx.Result = logs[fx.FixtureId].Score;
                Rest(fx.HomeId, fx.AwayId, logs[fx.FixtureId]);
            }
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
            // sem humanos vivos no chaveamento? resolve o resto na hora,
            // sem relógio nem ready-gate (ninguém está assistindo de dentro)
            if (!rt.FastForward && !ties.Any(tie => tie.HomeId.StartsWith("h:") || tie.AwayId.StartsWith("h:")))
            {
                rt.FastForward = true;
                logger.LogInformation("[{Code}] todos os humanos eliminados — fast-forward até o campeão", code);
            }

            string roundId = rt.T.KnockoutRounds[r];
            rt.Bracket.Add((roundId, ties));
            var logs = new Dictionary<string, MatchLog>();
            foreach (KnockoutTie tie in ties)
            {
                MatchLog log = MatchEngine.SimulateMatch(
                    SideOf(tie.HomeId), SideOf(tie.AwayId), cfg,
                    TournamentGenerator.MatchSeed(t.Seed, tie.TieId),
                    new EngineOptions { Knockout = true, Fatigue = true, Pressure = true, RoundN = r + 1 });
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
                Rest(tie.HomeId, tie.AwayId, logs[tie.TieId]);
            }
            rt.CurrentRound = null;
            await BroadcastSnapshotAsync(code, rt);
            await PersistAsync(code, rt);

            if (ties.Count == 1)
            {
                rt.ChampionTeamId = ties[0].WinnerId;
                break;
            }
            if (!rt.FastForward) await InterRoundPauseAsync(ct);
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

        rt.CurrentRound = new RoundInfoDto(kind, label, maxMinute, rt.PaceMs,
            "aguardando", mp.Value.RoundReadySeconds,
            DateTimeOffset.UtcNow.AddSeconds(mp.Value.RoundReadySeconds),
            matches.Select(m => new FixtureRefDto(m.FixtureId, m.HomeId, m.AwayId, LastMinute(m.Log))).ToList());

        // spectator pool: every match of the round is watchable
        rt.CurrentRoundLogs.Clear();
        foreach ((string fxId, string homeId, string awayId, MatchLog fxLog) in matches)
            rt.CurrentRoundLogs[fxId] = (homeId, awayId, fxLog);

        logger.LogInformation("[{Code}] rodada {Label} ({Kind}): {N} partidas, até {Max}'",
            code, label, kind, matches.Count, maxMinute);

        // private: each human gets their own full log for the ticker
        rt.YourMatches.Clear();
        foreach ((string fixtureId, string homeId, string awayId, MatchLog log) in matches)
        {
            foreach ((string teamId, string side) in new[] { (homeId, "home"), (awayId, "away") })
            {
                if (rt.UserByTeamId.TryGetValue(teamId, out Guid userId))
                {
                    var bench = rt.T.Teams[teamId].Side.Bench
                        .Select(p => new StarterRef(p.Id, p.Name, p.Pos)).ToList();
                    List<OutPlayerDto> outs = rt.Status.TryGetValue(teamId, out var st)
                        ? MpStatus.OutStarters(rt.T.Teams[teamId].Side, st) : new List<OutPlayerDto>();
                    var payload = new YourMatchDto(fixtureId, side, log, bench, outs);
                    rt.YourMatches[userId] = payload;
                    await hub.Clients.User(userId.ToString()).SendAsync(YourMatchEvent, payload, ct);
                }
            }
        }

        await BroadcastSnapshotAsync(code, rt);

        // ---------- fast-forward: sem humanos vivos, resolve sem relógio ----------
        if (rt.FastForward)
        {
            foreach ((string fixtureId, _, _, MatchLog fxLog) in matches)
                await hub.Clients.Group(code).SendAsync(MatchFinishedEvent, new
                {
                    fixtureId, score = fxLog.Score, penalties = fxLog.Penalties, result = fxLog.Result,
                }, ct);
            return;
        }

        // ---------- ready-gate: a rodada só começa quando os humanos vivos e
        // conectados clicam "iniciar partida" (ou após o timeout) ----------
        TaskCompletionSource<bool> gate;
        TaskCompletionSource<bool> skip;
        int requiredCount;
        lock (rt.GateLock)
        {
            rt.RoundRequired.Clear();
            rt.RoundReady.Clear();
            rt.RoundDone.Clear();
            foreach ((_, string homeId, string awayId, _) in matches)
                foreach (string teamId in new[] { homeId, awayId })
                    if (rt.UserByTeamId.TryGetValue(teamId, out Guid uid) && presence.IsOnline(code, uid))
                        rt.RoundRequired.Add(uid);
            gate = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            skip = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            rt.RoundGate = gate;
            rt.RoundSkip = skip;
            requiredCount = rt.RoundRequired.Count;
        }
        await hub.Clients.Group(code).SendAsync(RoundReadyEvent, new
        {
            round = rt.CurrentRound,
            readySeconds = mp.Value.RoundReadySeconds,
            required = requiredCount,
        }, ct);
        logger.LogInformation("[{Code}] gate da rodada {Label}: aguardando {N} jogadores (timeout {S}s)",
            code, label, requiredCount, mp.Value.RoundReadySeconds);
        if (requiredCount > 0 && mp.Value.RoundReadySeconds > 0)
            await Task.WhenAny(gate.Task, Task.Delay(TimeSpan.FromSeconds(mp.Value.RoundReadySeconds), ct));
        lock (rt.GateLock) rt.RoundGate = null;
        logger.LogInformation("[{Code}] gate da rodada {Label} aberto ({Via})",
            code, label, gate.Task.IsCompleted ? "todos prontos" : "timeout");

        // status no SNAPSHOT: o cliente deriva a transição pré-jogo → ao vivo daqui
        rt.CurrentRound = rt.CurrentRound with { Status = "rolando" };
        await BroadcastSnapshotAsync(code, rt);
        await hub.Clients.Group(code).SendAsync(RoundStartedEvent, rt.CurrentRound, ct);

        // se ninguém precisa assistir (todos offline/IA), resolve sem espera
        if (requiredCount == 0) skip.TrySetResult(true);
        var clock = new RoundClock(rt.PaceMs);
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
        }, ct, skip.Task);
        lock (rt.GateLock) rt.RoundSkip = null;
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

        CampaignAwardsDto? awards = rt.Tally.Count > 0 ? MpStats.Awards(rt.Tally, cfg) : null;
        return new TournamentSnapshotDto(rt.Phase, groups, bracket, rt.ChampionTeamId, rt.CurrentRound, awards);
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
