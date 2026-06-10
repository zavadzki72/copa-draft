using CopaDraft.Engine;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Guards the narration parity that matters for determinism: each rng.pick'd
/// array MUST keep the same length as lib/i18n.js (PT). Lengths below were read
/// directly from lib/i18n.js — an independent check against the generated file.
/// </summary>
public class NarrationParityTests
{
    // RNG-critical: arrays consumed via rng.Pick(Arr(key)) in the engine.
    public static readonly TheoryData<string, int> ExpectedArrayLengths = new()
    {
        { "goal", 6 }, { "assist", 4 }, { "bigchance", 4 }, { "save", 4 },
        { "woodwork", 3 }, { "yellow", 3 }, { "foul", 3 }, { "counter", 3 },
        { "red", 3 }, { "red2", 2 }, { "injury", 3 },
        { "penGoal", 3 }, { "penSave", 2 }, { "penMiss", 2 },
    };

    [Theory]
    [MemberData(nameof(ExpectedArrayLengths))]
    public void Narration_Array_Lengths_Match_Js(string key, int expectedLength)
    {
        Assert.Equal(expectedLength, Narration.Pt.Arr(key).Length);
    }

    [Theory]
    [InlineData("kickoff")]
    [InlineData("halfTime")]
    [InlineData("etStart")]
    [InlineData("pensDecision")]
    [InlineData("fullTime")]
    [InlineData("pensLine")]
    [InlineData("injSub")]
    [InlineData("injDown")]
    [InlineData("gkFallback")]
    public void Engine_String_Keys_Resolve(string key)
    {
        // i18n.t returns the key itself when missing; a resolved template differs.
        Assert.NotEqual(key, Narration.Pt.T(key));
    }

    [Fact]
    public void Arr_Returns_Empty_For_Unknown_Key()
    {
        Assert.Empty(Narration.Pt.Arr("does-not-exist"));
    }

    [Fact]
    public void T_Returns_Key_When_Missing()
    {
        Assert.Equal("nope", Narration.Pt.T("nope"));
    }

    [Fact]
    public void Fill_Replaces_Known_Placeholders_And_Blanks_Missing()
    {
        var vars = new Dictionary<string, object?> { ["home"] = "Brasil", ["away"] = "Itália", ["hs"] = 3, ["as"] = 1 };
        // pensLine = "Nos pênaltis: {home} {hs} x {away} {as}."
        Assert.Equal("Nos pênaltis: Brasil 3 x Itália 1.", Narration.Pt.T("pensLine", vars));
    }

    [Fact]
    public void Fill_Blanks_Unprovided_Placeholders()
    {
        // {player} not provided -> "" (mirrors JS fill)
        Assert.Equal("a  b", Narration.Pt.Fill("a {player} b", new Dictionary<string, object?>()));
    }

    [Fact]
    public void Kickoff_Fills_Both_Teams()
    {
        var vars = new Dictionary<string, object?> { ["home"] = "Brasil", ["away"] = "Itália" };
        Assert.Equal("Bola rolando! Brasil x Itália.", Narration.Pt.T("kickoff", vars));
    }
}
