using System.Text.Json;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Full-log parity between MatchEngine.SimulateMatch (C#) and the JS reference
/// (lib/engine.js), over the 42 golden vectors in golden/engine.json
/// (tools/gen-engine-golden.js). Any divergence — score, event order, text,
/// cards, pens — fails with the vector name and field.
/// </summary>
public class MatchEngineParityTests
{
    private static readonly JsonElement Root = JsonDocument.Parse(LoadBytes()).RootElement;

    private static byte[] LoadBytes()
    {
        using Stream s = typeof(MatchEngineParityTests).Assembly
            .GetManifestResourceStream(typeof(MatchEngineParityTests).Assembly
                .GetManifestResourceNames().Single(n => n.EndsWith("engine.json")))!;
        using var ms = new MemoryStream();
        s.CopyTo(ms);
        return ms.ToArray();
    }

    public static TheoryData<string> VectorNames()
    {
        var data = new TheoryData<string>();
        foreach (JsonElement v in Root.GetProperty("vectors").EnumerateArray())
            data.Add(v.GetProperty("name").GetString()!);
        return data;
    }

    [Theory]
    [MemberData(nameof(VectorNames))]
    public void Match_Log_Matches_Js(string name)
    {
        JsonElement v = Root.GetProperty("vectors").EnumerateArray()
            .Single(e => e.GetProperty("name").GetString() == name);

        SideInput home = ParseSide(v.GetProperty("home"));
        SideInput away = ParseSide(v.GetProperty("away"));
        uint seed = v.GetProperty("seed").GetUInt32();
        EngineOptions opts = ParseOpts(v.GetProperty("opts"));

        MatchLog log = MatchEngine.SimulateMatch(home, away, GameConfig.Default, seed, opts);
        JsonElement exp = v.GetProperty("log");

        // score / outcome
        AssertEq(name, "score.home", exp.GetProperty("score").GetProperty("home").GetInt32(), log.Score.Home);
        AssertEq(name, "score.away", exp.GetProperty("score").GetProperty("away").GetInt32(), log.Score.Away);
        AssertEq(name, "result", exp.GetProperty("result").GetString()!, log.Result);
        AssertEq(name, "extraTime", exp.GetProperty("extraTime").GetBoolean(), log.ExtraTime);
        AssertEq(name, "needsShootout", exp.GetProperty("needsShootout").GetBoolean(), log.NeedsShootout);

        bool expPens = exp.TryGetProperty("penalties", out JsonElement pens) && pens.ValueKind == JsonValueKind.Object;
        AssertEq(name, "penalties?", expPens, log.Penalties is not null);
        if (expPens)
        {
            AssertEq(name, "penalties.home", pens.GetProperty("home").GetInt32(), log.Penalties!.Home);
            AssertEq(name, "penalties.away", pens.GetProperty("away").GetInt32(), log.Penalties.Away);
        }

        // events — count, then field-by-field in order
        JsonElement[] expEvents = exp.GetProperty("events").EnumerateArray().ToArray();
        AssertEq(name, "events.length", expEvents.Length, log.Events.Count);
        for (int i = 0; i < expEvents.Length; i++)
        {
            JsonElement e = expEvents[i];
            MatchEvent a = log.Events[i];
            string ctx = $"events[{i}]({a.Type}@{a.Minute})";
            AssertEq(name, ctx + ".minute", e.GetProperty("minute").GetInt32(), a.Minute);
            AssertEq(name, ctx + ".type", e.GetProperty("type").GetString()!, a.Type);
            AssertEq(name, ctx + ".side", StrOrNull(e, "side"), a.Side);
            AssertEq(name, ctx + ".text", e.GetProperty("text").GetString()!, a.Text);
            AssertEq(name, ctx + ".etTag", BoolProp(e, "etTag"), a.EtTag);
            AssertEq(name, ctx + ".pen", BoolProp(e, "pen"), a.Pen);
            AssertEq(name, ctx + ".penId", StrOrNull(e, "penId"), a.PenId);
            AssertEq(name, ctx + ".outcome", StrOrNull(e, "outcome"), a.Outcome);
            AssertEq(name, ctx + ".key", StrOrNull(e, "key"), a.Key);
            string[]? expPlayers = e.TryGetProperty("players", out JsonElement pl) && pl.ValueKind == JsonValueKind.Array
                ? pl.EnumerateArray().Select(x => x.GetString()!).ToArray() : null;
            AssertEq(name, ctx + ".players", Join(expPlayers), Join(a.Players));
            if (e.TryGetProperty("score", out JsonElement sc) && sc.ValueKind == JsonValueKind.Object)
            {
                Assert.NotNull(a.Score);
                AssertEq(name, ctx + ".score", $"{sc.GetProperty("home").GetInt32()}x{sc.GetProperty("away").GetInt32()}",
                    $"{a.Score!.Home}x{a.Score.Away}");
            }
        }

        // stats per player
        foreach (JsonProperty p in exp.GetProperty("stats").EnumerateObject())
        {
            PlayerStats a = log.Stats[p.Name];
            JsonElement s = p.Value;
            string ctx = $"stats[{p.Name}]";
            AssertEq(name, ctx, Join(new[]
            {
                s.GetProperty("goals").GetInt32().ToString(), s.GetProperty("assists").GetInt32().ToString(),
                s.GetProperty("saves").GetInt32().ToString(), s.GetProperty("bigChances").GetInt32().ToString(),
                s.GetProperty("yellows").GetInt32().ToString(), s.GetProperty("reds").GetInt32().ToString(),
            }), Join(new[]
            {
                a.Goals.ToString(), a.Assists.ToString(), a.Saves.ToString(),
                a.BigChances.ToString(), a.Yellows.ToString(), a.Reds.ToString(),
            }));
        }
        AssertEq(name, "stats.count", exp.GetProperty("stats").EnumerateObject().Count(), log.Stats.Count);

        // cards / sentOff / injuries / matchPens / manDown
        CompareList(name, "cards", exp, log.Cards.Select(x => $"{x.Id}|{x.Side}|{x.Minute}|{x.Type}|{x.SecondYellow}").ToArray(),
            e => $"{e.GetProperty("id").GetString()}|{e.GetProperty("side").GetString()}|{e.GetProperty("minute").GetInt32()}|{e.GetProperty("type").GetString()}|{BoolProp(e, "secondYellow")}");
        CompareList(name, "sentOff", exp, log.SentOff.Select(x => $"{x.Id}|{x.Side}|{x.Minute}|{x.SecondYellow}").ToArray(),
            e => $"{e.GetProperty("id").GetString()}|{e.GetProperty("side").GetString()}|{e.GetProperty("minute").GetInt32()}|{BoolProp(e, "secondYellow")}");
        CompareList(name, "injuries", exp, log.Injuries.Select(x => $"{x.Id}|{x.Side}|{x.Minute}|{x.ReplacedBy ?? "-"}").ToArray(),
            e => $"{e.GetProperty("id").GetString()}|{e.GetProperty("side").GetString()}|{e.GetProperty("minute").GetInt32()}|{StrOrNull(e, "replacedBy") ?? "-"}");
        CompareList(name, "matchPens", exp, log.MatchPens.Select(x => $"{x.PenId}|{x.Side}|{x.Minute}|{x.Taker}|{x.Gk ?? "-"}|{x.Outcome}|{x.Scored}").ToArray(),
            e => $"{e.GetProperty("penId").GetString()}|{e.GetProperty("side").GetString()}|{e.GetProperty("minute").GetInt32()}|{e.GetProperty("taker").GetString()}|{StrOrNull(e, "gk") ?? "-"}|{e.GetProperty("outcome").GetString()}|{e.GetProperty("scored").GetBoolean()}");

        AssertEq(name, "manDown.home", exp.GetProperty("manDown").GetProperty("home").GetInt32(), log.ManDown["home"]);
        AssertEq(name, "manDown.away", exp.GetProperty("manDown").GetProperty("away").GetInt32(), log.ManDown["away"]);
    }

    // ---- helpers ----
    private static void AssertEq<T>(string vec, string field, T expected, T actual)
        => Assert.True(EqualityComparer<T>.Default.Equals(expected, actual),
            $"[{vec}] {field}: expected «{expected}», got «{actual}»");

    private static void CompareList(string vec, string field, JsonElement exp, string[] actual, Func<JsonElement, string> fmt)
    {
        string[] expected = exp.GetProperty(field).EnumerateArray().Select(fmt).ToArray();
        AssertEq(vec, field + ".length", expected.Length, actual.Length);
        for (int i = 0; i < expected.Length; i++) AssertEq(vec, $"{field}[{i}]", expected[i], actual[i]);
    }

    private static string Join(IReadOnlyList<string>? a) => a is null ? "-" : string.Join(",", a);
    private static string? StrOrNull(JsonElement e, string prop)
        => e.TryGetProperty(prop, out JsonElement v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    private static bool BoolProp(JsonElement e, string prop)
        => e.TryGetProperty(prop, out JsonElement v) && v.ValueKind == JsonValueKind.True;

    private static EngineOptions ParseOpts(JsonElement o) => new()
    {
        Knockout = BoolProp(o, "knockout"),
        Pressure = BoolProp(o, "pressure"),
        Fatigue = BoolProp(o, "fatigue"),
        RoundN = o.TryGetProperty("roundN", out JsonElement r) && r.ValueKind == JsonValueKind.Number ? r.GetInt32() : 0,
    };

    private static SideInput ParseSide(JsonElement s) => new()
    {
        Name = s.GetProperty("name").GetString()!,
        Code = StrOrNull(s, "code"),
        Cup = s.GetProperty("cup").GetInt32(),
        Dream = BoolProp(s, "dream"),
        Formation = s.GetProperty("formation").GetString()!,
        SubsLeft = s.GetProperty("subsLeft").GetInt32(),
        CaptainId = StrOrNull(s, "captainId"),
        Starters = s.GetProperty("starters").EnumerateArray().Select(ParsePlayer).ToList(),
        Bench = s.GetProperty("bench").EnumerateArray().Select(ParsePlayer).ToList(),
    };

    private static EnginePlayer ParsePlayer(JsonElement p) => new()
    {
        Id = p.GetProperty("id").GetString()!,
        Name = p.GetProperty("name").GetString()!,
        Pos = p.GetProperty("pos").GetString()!,
        Age = p.GetProperty("age").GetInt32(),
        Overall = p.GetProperty("overall").GetInt32(),
        Archetype = StrOrNull(p, "archetype"),
        Leader = BoolProp(p, "leader"),
        Team = StrOrNull(p, "team"),
        Code = StrOrNull(p, "code"),
        Cup = p.GetProperty("cup").GetInt32(),
        Fatigue = p.GetProperty("fatigue").GetDouble(),
    };
}
