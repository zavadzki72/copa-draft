using CopaDraft.Engine;
using CopaDraft.Engine.Models;

namespace CopaDraft.Engine.Tests;

public class SquadRepositoryTests
{
    // Parity anchors: these counts come from data/squads.js via
    // tools/gen-squads-json.js. If the squad pool changes, regenerate
    // squads.json and update these expected values.
    private const int ExpectedSquads = 416;
    private const int ExpectedPlayers = 9621;

    private static readonly HashSet<string> ValidPositions = new() { "GOL", "ZAG", "LAT", "MEI", "ATA" };

    [Fact]
    public void Loads_All_Squads_From_Embedded_Json()
    {
        Assert.Equal(ExpectedSquads, SquadRepository.All.Count);
    }

    [Fact]
    public void Total_Player_Count_Matches_Source()
    {
        int players = SquadRepository.All.Sum(s => s.Players.Count);
        Assert.Equal(ExpectedPlayers, players);
    }

    [Fact]
    public void Every_Squad_Has_Id_Team_And_Players()
    {
        foreach (Squad s in SquadRepository.All)
        {
            Assert.False(string.IsNullOrWhiteSpace(s.Id));
            Assert.False(string.IsNullOrWhiteSpace(s.Team));
            Assert.NotEmpty(s.Players);
        }
    }

    [Fact]
    public void Every_Player_Has_Required_Fields_And_Valid_Position()
    {
        foreach (Player p in SquadRepository.All.SelectMany(s => s.Players))
        {
            Assert.False(string.IsNullOrWhiteSpace(p.Id));
            Assert.False(string.IsNullOrWhiteSpace(p.Name));
            Assert.Contains(p.Pos, ValidPositions);
            Assert.InRange(p.Overall, 1, 99);
        }
    }

    [Fact]
    public void Squad_Ids_Are_Unique()
    {
        int distinct = SquadRepository.All.Select(s => s.Id).Distinct().Count();
        Assert.Equal(SquadRepository.All.Count, distinct);
    }
}

public class GameConfigTests
{
    [Fact]
    public void Default_Mirrors_Key_ConfigJs_Values()
    {
        GameConfig c = GameConfig.Default;
        Assert.Equal(0.95, c.BASE_LAMBDA);
        Assert.Equal(3.0, c.LAMBDA_EXP);
        Assert.Equal(90, c.MINUTES);
        Assert.Equal(30, c.ATTR_MIN);
        Assert.Equal(99, c.ATTR_MAX);
        Assert.Equal(4, c.GROUP_SIZE);
        Assert.Equal(2, c.GROUP_QUALIFY);
        Assert.Equal(3, c.GROUP_POINTS.Win);
    }

    [Fact]
    public void Every_Formation_Sums_To_Eleven()
    {
        foreach ((string name, IReadOnlyDictionary<string, int> rows) in GameConfig.Default.FORMATIONS)
        {
            Assert.Equal(11, rows.Values.Sum());
        }
    }

    [Fact]
    public void Phase_Strength_Ramps_From_Group_To_Final()
    {
        IReadOnlyDictionary<string, double> ps = GameConfig.Default.PHASE_STRENGTH;
        Assert.True(ps["grupos"] < ps["oitavas"]);
        Assert.True(ps["oitavas"] < ps["quartas"]);
        Assert.True(ps["quartas"] < ps["semi"]);
        Assert.True(ps["semi"] < ps["final"]);
    }
}
