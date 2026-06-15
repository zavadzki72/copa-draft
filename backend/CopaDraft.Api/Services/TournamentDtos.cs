using CopaDraft.Engine;
using CopaDraft.Engine.Models;

namespace CopaDraft.Api.Services;

public sealed record TeamRefDto(string Id, string Name, bool IsHuman, Guid? UserId);

public sealed record StandingDto(string TeamId, int P, int J, int V, int E, int D, int GP, int GC, int SG);

public sealed record FixtureDto(
    string FixtureId, int Round, string HomeId, string AwayId,
    int? HomeGoals, int? AwayGoals, bool Played);

public sealed record GroupDto(
    string Label, IReadOnlyList<TeamRefDto> Teams,
    IReadOnlyList<StandingDto> Standings, IReadOnlyList<FixtureDto> Fixtures);

public sealed record TieDto(
    string TieId, string RoundId, string HomeId, string AwayId,
    int? HomeGoals, int? AwayGoals, int? PensHome, int? PensAway, string? WinnerId, bool Played);

public sealed record BracketRoundDto(string RoundId, IReadOnlyList<TieDto> Ties);

/// <summary>Full public tournament snapshot, broadcast to the room.</summary>
public sealed record TournamentSnapshotDto(
    string Phase, // grupos | mata-mata | encerrada
    IReadOnlyList<GroupDto> Groups,
    IReadOnlyList<BracketRoundDto> Bracket,
    string? ChampionTeamId,
    RoundInfoDto? CurrentRound);

/// <summary>Pacing info for the round in progress (server clock authority).
/// O STATUS faz parte do snapshot — o cliente deriva a UI dele (fonte única
/// da verdade), em vez de depender de eventos avulsos chegarem na ordem.</summary>
public sealed record RoundInfoDto(
    string Kind,           // group | knockout
    string Label,          // "Rodada 1" | round id
    int MaxMinute,         // 90 (groups) or up to 120 (knockout/ET)
    int PaceMsPerMinute,
    string Status,         // aguardando (pré-jogo/ready-gate) | rolando (relógio ativo)
    int ReadySeconds,      // timeout do ready-gate (exibição do countdown)
    DateTimeOffset ReadyDeadline,  // instante-limite do gate (countdown no cliente)
    IReadOnlyList<FixtureRefDto> Fixtures);

public sealed record FixtureRefDto(string FixtureId, string HomeId, string AwayId, int LastMinute);

/// <summary>Private payload: the full log of YOUR match for the ticker —
/// inclui seus reservas (o log só carrega titulares).</summary>
public sealed record YourMatchDto(
    string FixtureId, string Side, MatchLog Log, IReadOnlyList<StarterRef> Bench,
    IReadOnlyList<OutPlayerDto> Out);
