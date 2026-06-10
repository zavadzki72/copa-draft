using CopaDraft.Engine;
using CopaDraft.Engine.Models;

namespace CopaDraft.Engine.Tests;

public class TournamentTests
{
    private static TeamEntry Human(int i) => new()
    {
        Id = $"h:player{i}", IsHuman = true, DisplayName = $"Player {i}",
        Side = TeamHelpers.AiSide(SquadRepository.All[i * 7], "4-3-3", GameConfig.Default),
    };

    private static List<TeamEntry> Humans(int n) => Enumerable.Range(0, n).Select(Human).ToList();

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(5)]
    [InlineData(8)]
    public void Always_Full_Cup_Eight_Groups(int humans)
    {
        GeneratedTournament t = TournamentGenerator.Generate(Humans(humans), 42, GameConfig.Default);
        Assert.Equal(TournamentGenerator.GroupCount, t.Groups.Count);
        Assert.Equal(32, t.Groups.Sum(g => g.Entries.Count));
    }

    [Fact]
    public void More_Than_Eight_Humans_Rejected()
        => Assert.Throws<ArgumentOutOfRangeException>(() =>
            TournamentGenerator.Generate(Humans(9), 1, GameConfig.Default));

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(8)]
    public void Humans_Never_Share_A_Group(int n)
    {
        GeneratedTournament t = TournamentGenerator.Generate(Humans(n), 42, GameConfig.Default);
        foreach (TournamentGroup g in t.Groups)
            Assert.True(g.Entries.Count(e => e.IsHuman) <= 1,
                $"grupo {g.Label} tem {g.Entries.Count(e => e.IsHuman)} humanos");
    }

    [Fact]
    public void Groups_Are_Full_And_Ai_Squads_Are_Distinct()
    {
        GeneratedTournament t = TournamentGenerator.Generate(Humans(3), 7, GameConfig.Default);
        Assert.All(t.Groups, g => Assert.Equal(GameConfig.Default.GROUP_SIZE, g.Entries.Count));
        List<string> aiIds = t.Groups.SelectMany(g => g.Entries).Where(e => !e.IsHuman).Select(e => e.SquadId!).ToList();
        Assert.Equal(aiIds.Count, aiIds.Distinct().Count());
    }

    [Fact]
    public void Fixtures_Are_Complete_Round_Robin()
    {
        GeneratedTournament t = TournamentGenerator.Generate(Humans(2), 9, GameConfig.Default);
        foreach (TournamentGroup g in t.Groups)
        {
            // 4 teams -> 6 fixtures, every unordered pair exactly once
            Assert.Equal(6, g.Fixtures.Count);
            var pairs = g.Fixtures.Select(f => string.CompareOrdinal(f.HomeId, f.AwayId) < 0
                ? f.HomeId + "|" + f.AwayId : f.AwayId + "|" + f.HomeId).ToList();
            Assert.Equal(6, pairs.Distinct().Count());
        }
    }

    [Fact]
    public void Generation_Is_Deterministic_By_Seed()
    {
        GeneratedTournament a = TournamentGenerator.Generate(Humans(4), 123, GameConfig.Default);
        GeneratedTournament b = TournamentGenerator.Generate(Humans(4), 123, GameConfig.Default);
        GeneratedTournament d = TournamentGenerator.Generate(Humans(4), 124, GameConfig.Default);

        string Sig(GeneratedTournament t) => string.Join(";", t.Groups.Select(g =>
            g.Label + ":" + string.Join(",", g.Entries.Select(e => e.Id))));
        Assert.Equal(Sig(a), Sig(b));
        Assert.NotEqual(Sig(a), Sig(d));
    }

    [Fact]
    public void Knockout_Always_Runs_Oitavas_To_Final()
    {
        // copa completa: 8 grupos -> 16 classificados -> oitavas..final, sempre
        Assert.Equal(new[] { "oitavas", "quartas", "semi", "final" },
            TournamentGenerator.Generate(Humans(2), 1, GameConfig.Default).KnockoutRounds);
        Assert.Equal(new[] { "oitavas", "quartas", "semi", "final" },
            TournamentGenerator.Generate(Humans(8), 1, GameConfig.Default).KnockoutRounds);
    }

    [Fact]
    public void First_Knockout_Round_Cross_Pairs_Groups()
    {
        GeneratedTournament t = TournamentGenerator.Generate(Humans(2), 5, GameConfig.Default);
        var qualified = new Dictionary<int, IReadOnlyList<string>>();
        for (int g = 0; g < t.Groups.Count; g++)
            qualified[g] = new[] { $"G{g}-1", $"G{g}-2" };
        List<KnockoutTie> ties = TournamentGenerator.BuildFirstKnockoutRound(t, qualified, GameConfig.Default);

        Assert.Equal(8, ties.Count);
        Assert.All(ties, tie => Assert.Equal("oitavas", tie.RoundId));
        // cruzamento clássico: 1º do grupo 2k × 2º do 2k+1 (e o espelho na outra metade)
        Assert.Equal(("G0-1", "G1-2"), (ties[0].HomeId, ties[0].AwayId));
        Assert.Equal(("G1-1", "G0-2"), (ties[4].HomeId, ties[4].AwayId));
        // mesmos-grupo nunca se cruzam nas oitavas
        Assert.All(ties, tie => Assert.NotEqual(tie.HomeId[..2], tie.AwayId[..2]));
    }

    [Fact]
    public void Next_Round_Pairs_Winners_Sequentially()
    {
        var prev = new List<KnockoutTie>
        {
            new() { TieId = "semi-0", RoundId = "semi", HomeId = "x", AwayId = "y", WinnerId = "x" },
            new() { TieId = "semi-1", RoundId = "semi", HomeId = "z", AwayId = "w", WinnerId = "w" },
        };
        List<KnockoutTie> final = TournamentGenerator.BuildNextKnockoutRound("final", prev);
        Assert.Single(final);
        Assert.Equal(("x", "w"), (final[0].HomeId, final[0].AwayId));
    }

    [Fact]
    public void Full_Tournament_Simulates_To_A_Champion_Deterministically()
    {
        GameConfig c = GameConfig.Default;
        string RunOnce()
        {
            GeneratedTournament t = TournamentGenerator.Generate(Humans(3), 99, c);
            // group stage
            foreach (TournamentGroup g in t.Groups)
            {
                foreach (GroupFixture fx in g.Fixtures)
                {
                    MatchLog log = MatchEngine.SimulateMatch(
                        t.Teams[fx.HomeId].Side, t.Teams[fx.AwayId].Side, c,
                        TournamentGenerator.MatchSeed(t.Seed, fx.FixtureId), new EngineOptions());
                    fx.Result = log.Score;
                }
            }
            var qualified = new Dictionary<int, IReadOnlyList<string>>();
            foreach (TournamentGroup g in t.Groups)
                qualified[g.Index] = Standings.Compute(g, c).Take(c.GROUP_QUALIFY).Select(r => r.TeamId).ToList();

            List<KnockoutTie> ties = TournamentGenerator.BuildFirstKnockoutRound(t, qualified, c);
            for (int r = 0; ; r++)
            {
                foreach (KnockoutTie tie in ties)
                {
                    MatchLog log = MatchEngine.SimulateMatch(
                        t.Teams[tie.HomeId].Side, t.Teams[tie.AwayId].Side, c,
                        TournamentGenerator.MatchSeed(t.Seed, tie.TieId), new EngineOptions { Knockout = true });
                    tie.WinnerId = log.Result == "home" ? tie.HomeId : tie.AwayId;
                }
                if (ties.Count == 1) return ties[0].WinnerId!;
                ties = TournamentGenerator.BuildNextKnockoutRound(t.KnockoutRounds[r + 1], ties);
            }
        }

        string champ1 = RunOnce();
        string champ2 = RunOnce();
        Assert.Equal(champ1, champ2);
        Assert.NotNull(champ1);
    }

    [Fact]
    public void Standings_Apply_Tiebreakers()
    {
        GeneratedTournament t = TournamentGenerator.Generate(Humans(2), 11, GameConfig.Default);
        TournamentGroup g = t.Groups[0];
        string[] ids = g.Entries.Select(e => e.Id).ToArray();
        // everyone draws except: ids[0] beats ids[1] 3x0; ids[2] beats ids[3] 1x0
        foreach (GroupFixture fx in g.Fixtures)
        {
            if (fx.HomeId == ids[0] && fx.AwayId == ids[1]) fx.Result = new Score { Home = 3, Away = 0 };
            else if (fx.HomeId == ids[1] && fx.AwayId == ids[0]) fx.Result = new Score { Home = 0, Away = 3 };
            else if (fx.HomeId == ids[2] && fx.AwayId == ids[3]) fx.Result = new Score { Home = 1, Away = 0 };
            else if (fx.HomeId == ids[3] && fx.AwayId == ids[2]) fx.Result = new Score { Home = 0, Away = 1 };
            else fx.Result = new Score { Home = 1, Away = 1 };
        }
        List<StandingRow> table = Standings.Compute(g, GameConfig.Default);
        // ids[0] and ids[2] both won once + drew twice (5 pts) — SG decides: +3 vs +1
        Assert.Equal(ids[0], table[0].TeamId);
        Assert.Equal(ids[2], table[1].TeamId);
        Assert.Equal(5, table[0].P);
    }
}
