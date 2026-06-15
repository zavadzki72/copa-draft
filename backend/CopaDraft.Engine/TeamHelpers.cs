using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>
/// C# ports of the lib/team.js helpers the server needs: squad strength,
/// best XI for AI sides, round-robin fixtures and phase-strength weighting.
/// </summary>
public static class TeamHelpers
{
    /// <summary>Mirror of squadAvg — average overall of the squad's top-11, rounded.</summary>
    public static int SquadAvg(Squad squad)
    {
        var top = squad.Players.OrderByDescending(p => p.Overall).Take(11).ToList();
        double sum = 0;
        foreach (Player p in top) sum += p.Overall;
        return (int)Math.Floor(sum / top.Count + 0.5);
    }

    /// <summary>Mirror of bestXI — strongest players per position for a formation.</summary>
    public static List<EnginePlayer> BestXI(Squad squad, string formation, GameConfig c)
    {
        IReadOnlyDictionary<string, int> need = c.FORMATIONS[formation];
        var xi = new List<EnginePlayer>();
        foreach ((string pos, int count) in need)
        {
            xi.AddRange(squad.Players
                .Where(p => p.Pos == pos)
                .OrderByDescending(p => p.Overall)
                .Take(count)
                .Select(EnginePlayer.From));
        }
        return xi;
    }

    /// <summary>AI opponent side (no bench/subs — mirrors solo AI opponents).</summary>
    public static SideInput AiSide(Squad squad, string formation, GameConfig c) => new()
    {
        Name = squad.Team, Code = squad.Code, Cup = squad.Cup,
        Formation = formation, Starters = BestXI(squad, formation, c),
    };

    /// <summary>
    /// Mirror of roundRobin (circle method): all-vs-all fixtures with
    /// home/away alternating by round for a fairer schedule.
    /// </summary>
    public static List<(int Round, string Home, string Away)> RoundRobin(IReadOnlyList<string> teamIds)
    {
        var ids = new List<string?>(teamIds);
        if (ids.Count % 2 != 0) ids.Add(null);
        int n = ids.Count;
        int rounds = n - 1, half = n / 2;
        var arr = new List<string?>(ids);
        var fixtures = new List<(int, string, string)>();
        for (int r = 0; r < rounds; r++)
        {
            for (int i = 0; i < half; i++)
            {
                string? a = arr[i], b = arr[n - 1 - i];
                if (a is null || b is null) continue;
                string home = r % 2 == 0 ? a : b;
                string away = r % 2 == 0 ? b : a;
                fixtures.Add((r, home, away));
            }
            string? last = arr[^1];
            arr.RemoveAt(arr.Count - 1);
            arr.Insert(1, last);
        }
        return fixtures;
    }

    /// <summary>
    /// Mirror of drawScaledOpponents — draws distinct squads with strength
    /// weighted toward a phase target (seeded, deterministic).
    /// </summary>
    public static List<Squad> DrawScaledSquads(
        Rng rng, IReadOnlyList<string> phaseKeys, ISet<string> excludeIds,
        IReadOnlyList<Squad> pool, GameConfig c)
        => DrawScaledSquads(rng, phaseKeys, excludeIds, pool, c, null);

    /// <summary>
    /// As DrawScaledSquads, but <paramref name="targetOverride"/> (0..1), when
    /// given, replaces every phase key's strength target — used by the MP room
    /// "level" so all AI fill is drawn toward one difficulty target.
    /// </summary>
    public static List<Squad> DrawScaledSquads(
        Rng rng, IReadOnlyList<string> phaseKeys, ISet<string> excludeIds,
        IReadOnlyList<Squad> pool, GameConfig c, double? targetOverride)
    {
        double bias = c.OPP_STRENGTH_BIAS;
        var avgById = new Dictionary<string, double>();
        double min = double.PositiveInfinity, max = double.NegativeInfinity;
        foreach (Squad sq in pool)
        {
            double a = SquadAvg(sq);
            avgById[sq.Id] = a;
            if (a < min) min = a;
            if (a > max) max = a;
        }
        double span = max - min;
        double TOf(Squad sq) => span == 0 ? 0.5 : (avgById[sq.Id] - min) / span;

        List<Squad> avail = pool.Where(s => !excludeIds.Contains(s.Id)).ToList();
        var chosen = new List<Squad>();
        foreach (string key in phaseKeys)
        {
            if (avail.Count == 0) avail = pool.ToList();
            double target = targetOverride
                ?? (c.PHASE_STRENGTH.TryGetValue(key, out double t) ? t : 0.5);
            var items = avail.Select(sq => (Item: sq, W: Math.Exp(-bias * Math.Abs(TOf(sq) - target)))).ToList();
            Squad pick = rng.Weighted(items);
            chosen.Add(pick);
            avail = avail.Where(s => s.Id != pick.Id).ToList();
        }
        return chosen;
    }
}
