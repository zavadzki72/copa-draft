using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>One competitor in a room tournament: a human's dream team or an AI squad.</summary>
public sealed class TeamEntry
{
    /// <summary>"h:{participantId}" for humans, "ai:{squadId}" for AI.</summary>
    public required string Id { get; init; }
    public required bool IsHuman { get; init; }
    public required string DisplayName { get; init; }
    public string? SquadId { get; init; }
    /// <summary>Engine side (built from the submitted team or the AI best XI).</summary>
    public required SideInput Side { get; init; }
}

public sealed class GroupFixture
{
    public required string FixtureId { get; init; }
    public int GroupIndex { get; init; }
    public int Round { get; init; }
    public required string HomeId { get; init; }
    public required string AwayId { get; init; }
    public Score? Result { get; set; }
}

public sealed class TournamentGroup
{
    public int Index { get; init; }
    /// <summary>"A", "B", ...</summary>
    public required string Label { get; init; }
    public required List<TeamEntry> Entries { get; init; }
    public required List<GroupFixture> Fixtures { get; init; }
}

public sealed class KnockoutTie
{
    public required string TieId { get; init; }
    /// <summary>Round id from GameConfig.ROUNDS ('oitavas'..'final').</summary>
    public required string RoundId { get; init; }
    public int IndexInRound { get; init; }
    public required string HomeId { get; init; }
    public required string AwayId { get; init; }
    public string? WinnerId { get; set; }
}

public sealed class GeneratedTournament
{
    public uint Seed { get; init; }
    public required List<TournamentGroup> Groups { get; init; }
    public required Dictionary<string, TeamEntry> Teams { get; init; }
    /// <summary>Knockout round ids in play order (tail of GameConfig.ROUNDS).</summary>
    public required List<string> KnockoutRounds { get; init; }
}

/// <summary>
/// Builds a room tournament: humans seeded into DIFFERENT groups, remaining
/// slots filled with AI squads (group-phase strength pool), round-robin
/// fixtures per group, and a cross-pair bracket where same-group teams (and
/// thus humans) can only meet from the knockout onward. Deterministic by seed.
/// </summary>
public static class TournamentGenerator
{
    /// <summary>Group counts that produce a clean knockout (2×G qualifiers, power of two).</summary>
    private static readonly int[] ValidGroupCounts = { 2, 4, 8 };

    public static int GroupCountFor(int humanCount)
    {
        foreach (int g in ValidGroupCounts)
            if (g >= humanCount) return g;
        throw new ArgumentOutOfRangeException(nameof(humanCount),
            $"Sala suporta no máximo {ValidGroupCounts[^1]} jogadores.");
    }

    /// <param name="humans">Human entries in deterministic order (join order).</param>
    public static GeneratedTournament Generate(
        IReadOnlyList<TeamEntry> humans, uint seed, GameConfig c, IReadOnlyList<Squad>? pool = null)
    {
        if (humans.Count < 2)
            throw new ArgumentException("Torneio exige pelo menos 2 jogadores.", nameof(humans));
        pool ??= SquadRepository.All;

        var rng = new Rng(seed);
        int groupCount = GroupCountFor(humans.Count);
        int aiNeeded = groupCount * c.GROUP_SIZE - humans.Count;

        // AI fill: one 'grupos'-phase draw per empty slot (distinct squads)
        List<Squad> aiSquads = TeamHelpers.DrawScaledSquads(
            rng, Enumerable.Repeat("grupos", aiNeeded).ToList(), new HashSet<string>(), pool, c);
        var aiEntries = aiSquads.Select(sq => new TeamEntry
        {
            Id = "ai:" + sq.Id, IsHuman = false, DisplayName = sq.Team + " " + sq.Cup,
            SquadId = sq.Id, Side = TeamHelpers.AiSide(sq, "4-3-3", c),
        }).ToList();

        // seat humans round-robin into distinct groups; AI fills the rest
        var groupEntries = Enumerable.Range(0, groupCount).Select(_ => new List<TeamEntry>()).ToList();
        for (int i = 0; i < humans.Count; i++) groupEntries[i % groupCount].Add(humans[i]);
        int ai = 0;
        foreach (List<TeamEntry> g in groupEntries)
            while (g.Count < c.GROUP_SIZE) g.Add(aiEntries[ai++]);

        var teams = new Dictionary<string, TeamEntry>();
        var groups = new List<TournamentGroup>();
        for (int gi = 0; gi < groupCount; gi++)
        {
            List<TeamEntry> entries = groupEntries[gi];
            foreach (TeamEntry e in entries) teams[e.Id] = e;
            List<(int Round, string Home, string Away)> rr = TeamHelpers.RoundRobin(entries.Select(e => e.Id).ToList());
            string label = ((char)('A' + gi)).ToString();
            groups.Add(new TournamentGroup
            {
                Index = gi, Label = label, Entries = entries,
                Fixtures = rr.Select((f, i) => new GroupFixture
                {
                    FixtureId = $"g{label}-r{f.Round}-{i}",
                    GroupIndex = gi, Round = f.Round, HomeId = f.Home, AwayId = f.Away,
                }).ToList(),
            });
        }

        // knockout rounds: tail of CONFIG.ROUNDS sized to the qualifier count
        int qualifiers = groupCount * c.GROUP_QUALIFY;          // 4, 8 or 16
        int knockoutDepth = (int)Math.Log2(qualifiers);          // 2, 3 or 4 rounds
        List<string> rounds = c.ROUNDS.TakeLast(knockoutDepth).Select(r => r.Id).ToList();

        return new GeneratedTournament { Seed = seed, Groups = groups, Teams = teams, KnockoutRounds = rounds };
    }

    /// <summary>
    /// First knockout round from group standings: cross pairing
    /// (winner of 2k × runner-up of 2k+1, winner of 2k+1 × runner-up of 2k),
    /// so same-group teams can only re-meet as late as possible.
    /// </summary>
    public static List<KnockoutTie> BuildFirstKnockoutRound(
        GeneratedTournament t, IReadOnlyDictionary<int, IReadOnlyList<string>> qualifiedByGroup, GameConfig c)
    {
        string roundId = t.KnockoutRounds[0];
        var first = new List<KnockoutTie>();
        var second = new List<KnockoutTie>();
        for (int k = 0; k + 1 < t.Groups.Count; k += 2)
        {
            IReadOnlyList<string> ga = qualifiedByGroup[k];
            IReadOnlyList<string> gb = qualifiedByGroup[k + 1];
            first.Add(new KnockoutTie
            {
                TieId = $"{roundId}-{first.Count + second.Count}", RoundId = roundId,
                HomeId = ga[0], AwayId = gb[1],
            });
            second.Add(new KnockoutTie
            {
                TieId = $"{roundId}-x{second.Count}", RoundId = roundId,
                HomeId = gb[0], AwayId = ga[1],
            });
        }
        List<KnockoutTie> ties = first.Concat(second).ToList();
        for (int i = 0; i < ties.Count; i++)
        {
            ties[i] = new KnockoutTie
            {
                TieId = $"{roundId}-{i}", RoundId = roundId, IndexInRound = i,
                HomeId = ties[i].HomeId, AwayId = ties[i].AwayId,
            };
        }
        return ties;
    }

    /// <summary>Next knockout round: winners of tie 2i × 2i+1.</summary>
    public static List<KnockoutTie> BuildNextKnockoutRound(
        string roundId, IReadOnlyList<KnockoutTie> previous)
    {
        var ties = new List<KnockoutTie>();
        for (int i = 0; i + 1 < previous.Count; i += 2)
        {
            ties.Add(new KnockoutTie
            {
                TieId = $"{roundId}-{ties.Count}", RoundId = roundId, IndexInRound = ties.Count,
                HomeId = previous[i].WinnerId!, AwayId = previous[i + 1].WinnerId!,
            });
        }
        return ties;
    }

    /// <summary>Deterministic per-fixture match seed derived from the tournament seed.</summary>
    public static uint MatchSeed(uint tournamentSeed, string fixtureId)
        => Rng.SeedFrom(tournamentSeed + ":" + fixtureId);
}
