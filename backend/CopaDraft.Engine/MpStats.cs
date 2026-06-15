using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>Acúmulo de um jogador ao longo da copa (todas as partidas).</summary>
public sealed class PlayerTally
{
    public required string Id { get; init; }
    public string Name { get; set; } = "";
    public string Pos { get; set; } = "";
    public int Goals, Assists, Saves, BigChances, Yellows, Reds, CleanSheets, Matches;
    public double RatingSum;
}

public sealed record AwardDto(
    string Id, string Name, string Pos,
    int Goals, int Assists, int Saves, int CleanSheets, double Avg, int Matches);

/// <summary>Prêmios de fim de copa (artilheiro, craque, goleiro, maestro).</summary>
public sealed record CampaignAwardsDto(
    AwardDto? TopScorer, AwardDto? BestPlayer, AwardDto? BestKeeper, AwardDto? Playmaker);

/// <summary>
/// Estatísticas e prêmios de fim de copa no multiplayer — espelha stats.js +
/// ratings.js do solo, mas TORNEIO INTEIRO (todos os times) e sem o ruído da
/// nota (determinístico). Artilheiro/maestro/goleiro não dependem de nota; só o
/// "craque" usa a média.
/// </summary>
public static class MpStats
{
    private static readonly HashSet<string> DefPos = new() { "GOL", "ZAG", "LAT" };

    /// <summary>Soma uma partida (os dois lados) ao acumulado.</summary>
    public static void Accumulate(Dictionary<string, PlayerTally> tally, MatchLog log, GameConfig c)
    {
        Fold(tally, log.Home, log.Stats, log.Conceded.Home, c);
        Fold(tally, log.Away, log.Stats, log.Conceded.Away, c);
    }

    private static void Fold(Dictionary<string, PlayerTally> tally, SideSummary side,
        IReadOnlyDictionary<string, PlayerStats> stats, int conceded, GameConfig c)
    {
        foreach (StarterRef sr in side.Starters)
        {
            if (!stats.TryGetValue(sr.Id, out PlayerStats? st)) continue;
            PlayerTally a = tally.TryGetValue(sr.Id, out PlayerTally? ex)
                ? ex : (tally[sr.Id] = new PlayerTally { Id = sr.Id });
            a.Name = sr.Name; a.Pos = sr.Pos;
            a.Goals += st.Goals; a.Assists += st.Assists; a.Saves += st.Saves;
            a.BigChances += st.BigChances; a.Yellows += st.Yellows; a.Reds += st.Reds;
            if (conceded == 0) a.CleanSheets++;
            a.RatingSum += Rating(sr.Pos, st, conceded, c);
            a.Matches++;
        }
    }

    private static double Rating(string pos, PlayerStats st, int conceded, GameConfig c)
    {
        double r = c.RATING_BASE + st.Goals * c.RATING_GOAL + st.Assists * c.RATING_ASSIST
                   + st.BigChances * c.RATING_BIGCHANCE;
        if (pos == "GOL") r += st.Saves * c.RATING_SAVE;
        if (DefPos.Contains(pos)) r += conceded * c.RATING_CONCEDE;
        if (st.Reds > 0) r += st.Reds * c.RATING_RED;
        return Math.Max(c.RATING_MIN, Math.Min(c.RATING_MAX, r));
    }

    public static CampaignAwardsDto Awards(IReadOnlyDictionary<string, PlayerTally> tally, GameConfig c)
    {
        List<PlayerTally> ps = tally.Values.ToList();
        static double Avg(PlayerTally p) => p.Matches > 0 ? p.RatingSum / p.Matches : 0;
        AwardDto Map(PlayerTally p) => new(p.Id, p.Name, p.Pos, p.Goals, p.Assists, p.Saves,
            p.CleanSheets, Math.Round(Avg(p), 1), p.Matches);

        PlayerTally? top = ps.Where(p => p.Goals > 0)
            .OrderByDescending(p => p.Goals).ThenByDescending(p => p.Assists).ThenBy(p => p.Matches).FirstOrDefault();
        PlayerTally? best = ps.Where(p => p.Matches >= c.AWARD_MIN_MATCHES)
            .OrderByDescending(Avg).ThenByDescending(p => p.Goals + p.Assists).FirstOrDefault();
        PlayerTally? gk = ps.Where(p => p.Pos == "GOL")
            .OrderByDescending(p => p.CleanSheets).ThenByDescending(p => p.Saves).ThenByDescending(Avg).FirstOrDefault();
        PlayerTally? maestro = ps.Where(p => p.Assists > 0)
            .OrderByDescending(p => p.Assists).ThenByDescending(p => p.Goals).FirstOrDefault();

        return new CampaignAwardsDto(
            top is null ? null : Map(top),
            best is null ? null : Map(best),
            gk is null ? null : Map(gk),
            maestro is null ? null : Map(maestro));
    }
}
