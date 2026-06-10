using CopaDraft.Engine;
using CopaDraft.Engine.Models;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Asserts Derive.DeriveAttrs matches lib/derive.js for EVERY player in the
/// shared pool, using golden/derive.json (tools/gen-derive-golden.js).
/// </summary>
public class DeriveParityTests
{
    private static readonly DeriveGolden G = Golden.Load<DeriveGolden>("derive.json");

    [Fact]
    public void DeriveAttrs_Matches_Js_For_Every_Player()
    {
        int count = 0;
        foreach (Player p in SquadRepository.All.SelectMany(s => s.Players))
        {
            Assert.True(G.Attrs.TryGetValue(p.Id, out AttrsDto? expected),
                $"golden missing player {p.Id}");

            Attrs a = Derive.DeriveAttrs(p, GameConfig.Default);
            Assert.True(
                a.Pace == expected!.Pace && a.Shooting == expected.Shooting &&
                a.Passing == expected.Passing && a.Dribbling == expected.Dribbling &&
                a.Defending == expected.Defending && a.Physical == expected.Physical,
                $"{p.Id}: expected ({expected.Pace},{expected.Shooting},{expected.Passing}," +
                $"{expected.Dribbling},{expected.Defending},{expected.Physical}) " +
                $"got ({a.Pace},{a.Shooting},{a.Passing},{a.Dribbling},{a.Defending},{a.Physical})");
            count++;
        }

        Assert.Equal(G.Attrs.Count, count);
    }

    [Fact]
    public void Attributes_Are_Clamped_To_Config_Range()
    {
        foreach (Player p in SquadRepository.All.SelectMany(s => s.Players))
        {
            Attrs a = Derive.DeriveAttrs(p, GameConfig.Default);
            foreach (int v in new[] { a.Pace, a.Shooting, a.Passing, a.Dribbling, a.Defending, a.Physical })
                Assert.InRange(v, GameConfig.Default.ATTR_MIN, GameConfig.Default.ATTR_MAX);
        }
    }
}

public sealed record DeriveGolden(Dictionary<string, AttrsDto> Attrs);
public sealed record AttrsDto(int Pace, int Shooting, int Passing, int Dribbling, int Defending, int Physical);
