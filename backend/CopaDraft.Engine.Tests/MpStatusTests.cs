using CopaDraft.Engine;
using CopaDraft.Engine.Models;

namespace CopaDraft.Engine.Tests;

public class MpStatusTests
{
    private static EnginePlayer P(string id, string pos) => new() { Id = id, Name = id, Pos = pos };

    private static SideInput Side() => new()
    {
        Name = "T", Formation = "4-3-3",
        Starters = new List<EnginePlayer>
        {
            P("g", "GOL"), P("z1", "ZAG"), P("z2", "ZAG"), P("l1", "LAT"), P("l2", "LAT"),
            P("m1", "MEI"), P("m2", "MEI"), P("m3", "MEI"), P("a1", "ATA"), P("a2", "ATA"), P("a3", "ATA"),
        },
        Bench = new List<EnginePlayer> { P("bz", "ZAG"), P("ba", "ATA") },
    };

    [Fact]
    public void Out_Starter_Replaced_By_Same_Position_Reserve()
    {
        var status = new Dictionary<string, PlayerStatusEntry> { ["z1"] = new(1, 0) };
        SideInput s = MpStatus.ApplyAvailability(Side(), status);
        Assert.Equal(11, s.Starters.Count);
        Assert.DoesNotContain(s.Starters, p => p.Id == "z1");
        Assert.Contains(s.Starters, p => p.Id == "bz");        // reserva da mesma posição promovido
        Assert.DoesNotContain(s.Bench, p => p.Id == "bz");     // saiu do banco
    }

    [Fact]
    public void No_Compatible_Reserve_Means_A_Man_Short()
    {
        // goleiro lesionado, sem GOL no banco -> joga com 10
        var status = new Dictionary<string, PlayerStatusEntry> { ["g"] = new(0, 1) };
        SideInput s = MpStatus.ApplyAvailability(Side(), status);
        Assert.Equal(10, s.Starters.Count);
        Assert.DoesNotContain(s.Starters, p => p.Id == "g");
    }

    [Fact]
    public void Available_Side_Is_Returned_Unchanged()
    {
        SideInput s = MpStatus.ApplyAvailability(Side(), new Dictionary<string, PlayerStatusEntry>());
        Assert.Equal(11, s.Starters.Count);
    }

    [Fact]
    public void InjuryDuration_Deterministic_And_In_Range()
    {
        GameConfig c = GameConfig.Default;
        int d1 = MpStatus.InjuryDuration(123u, "player-x", c);
        int d2 = MpStatus.InjuryDuration(123u, "player-x", c);
        Assert.Equal(d1, d2);
        Assert.InRange(d1, c.INJURY_PHASES_MIN, c.INJURY_PHASES_MAX);
    }

    [Fact]
    public void OutStarters_Lists_Reason_And_Count()
    {
        var status = new Dictionary<string, PlayerStatusEntry> { ["z1"] = new(1, 0), ["a1"] = new(0, 2) };
        List<OutPlayerDto> outs = MpStatus.OutStarters(Side(), status);
        Assert.Equal(2, outs.Count);
        Assert.Contains(outs, o => o.Id == "z1" && o.Reason == "suspended");
        Assert.Contains(outs, o => o.Id == "a1" && o.Reason == "injured" && o.N == 2);
    }
}
