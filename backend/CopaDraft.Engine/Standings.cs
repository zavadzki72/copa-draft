namespace CopaDraft.Engine;

/// <summary>One row of a group table — mirror of the JS standing row.</summary>
public sealed class StandingRow
{
    public required string TeamId { get; init; }
    /// <summary>Stable tiebreaker: entry order in the group (draw order).</summary>
    public int Order { get; init; }
    public int J { get; set; }
    public int V { get; set; }
    public int E { get; set; }
    public int D { get; set; }
    public int GP { get; set; }
    public int GC { get; set; }
    public int SG { get; set; }
    public int P { get; set; }
}

/// <summary>
/// Port of team.js groupStandings — pure table computation with the same
/// tiebreakers: points → goal difference → goals for → stable draw order.
/// </summary>
public static class Standings
{
    public static List<StandingRow> Compute(TournamentGroup group, GameConfig c)
    {
        var table = new Dictionary<string, StandingRow>();
        for (int i = 0; i < group.Entries.Count; i++)
            table[group.Entries[i].Id] = new StandingRow { TeamId = group.Entries[i].Id, Order = i };

        foreach (GroupFixture fx in group.Fixtures)
        {
            if (fx.Result is null) continue;
            if (!table.TryGetValue(fx.HomeId, out StandingRow? h) ||
                !table.TryGetValue(fx.AwayId, out StandingRow? a)) continue;
            int hg = fx.Result.Home, ag = fx.Result.Away;
            h.J++; a.J++; h.GP += hg; h.GC += ag; a.GP += ag; a.GC += hg;
            if (hg > ag) { h.V++; a.D++; h.P += c.GROUP_POINTS.Win; a.P += c.GROUP_POINTS.Loss; }
            else if (ag > hg) { a.V++; h.D++; a.P += c.GROUP_POINTS.Win; h.P += c.GROUP_POINTS.Loss; }
            else { h.E++; a.E++; h.P += c.GROUP_POINTS.Draw; a.P += c.GROUP_POINTS.Draw; }
        }

        foreach (StandingRow r in table.Values) r.SG = r.GP - r.GC;
        return table.Values
            .OrderByDescending(r => r.P)
            .ThenByDescending(r => r.SG)
            .ThenByDescending(r => r.GP)
            .ThenBy(r => r.Order)
            .ToList();
    }
}
