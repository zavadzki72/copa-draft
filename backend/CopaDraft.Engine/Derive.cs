using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>The six FIFA-style derived attributes (mirror of lib/derive.js KEYS).</summary>
public readonly record struct Attrs(
    int Pace, int Shooting, int Passing, int Dribbling, int Defending, int Physical);

/// <summary>
/// Faithful C# port of lib/derive.js: derives the six attributes from
/// (overall + position + archetype) with deterministic offsets, clamped to
/// [ATTR_MIN, ATTR_MAX]. Values must match the JS reference (golden/derive.json).
/// </summary>
public static class Derive
{
    // Position offsets (complete: all six keys).
    private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>> Pos =
        new Dictionary<string, IReadOnlyDictionary<string, int>>
        {
            ["GOL"] = new Dictionary<string, int> { ["pace"] = -22, ["shooting"] = -38, ["passing"] = -12, ["dribbling"] = -28, ["defending"] = -4,  ["physical"] = 0 },
            ["ZAG"] = new Dictionary<string, int> { ["pace"] = -6,  ["shooting"] = -26, ["passing"] = -8,  ["dribbling"] = -16, ["defending"] = -2,  ["physical"] = 5 },
            ["LAT"] = new Dictionary<string, int> { ["pace"] = 5,   ["shooting"] = -16, ["passing"] = 0,   ["dribbling"] = -2,  ["defending"] = -6,  ["physical"] = 0 },
            ["MEI"] = new Dictionary<string, int> { ["pace"] = -2,  ["shooting"] = -6,  ["passing"] = 6,   ["dribbling"] = 2,   ["defending"] = -8,  ["physical"] = -2 },
            ["ATA"] = new Dictionary<string, int> { ["pace"] = -2,  ["shooting"] = 6,   ["passing"] = -6,  ["dribbling"] = 4,   ["defending"] = -40, ["physical"] = -2 },
        };

    // Archetype offsets (partial: missing keys default to 0).
    private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>> Arch =
        new Dictionary<string, IReadOnlyDictionary<string, int>>
        {
            ["craque"]      = new Dictionary<string, int> { ["dribbling"] = 6, ["passing"] = 4, ["shooting"] = 3, ["pace"] = 1 },
            ["velocista"]   = new Dictionary<string, int> { ["pace"] = 6, ["defending"] = -5, ["dribbling"] = 3, ["physical"] = -2 },
            ["cerebral"]    = new Dictionary<string, int> { ["passing"] = 8, ["dribbling"] = 2, ["pace"] = -4, ["defending"] = 1 },
            ["muralha"]     = new Dictionary<string, int> { ["defending"] = 5, ["physical"] = 6, ["pace"] = -4, ["dribbling"] = -6 },
            ["motorzinho"]  = new Dictionary<string, int> { ["physical"] = 6, ["defending"] = 4, ["pace"] = 2, ["shooting"] = -3 },
            ["finalizador"] = new Dictionary<string, int> { ["shooting"] = 9, ["dribbling"] = 2, ["defending"] = -6, ["pace"] = 1 },
            ["lider"]       = new Dictionary<string, int> { ["passing"] = 3, ["defending"] = 3, ["physical"] = 4 },
        };

    private static readonly IReadOnlyDictionary<string, int> EmptyArch = new Dictionary<string, int>();

    public static Attrs DeriveAttrs(Player player, GameConfig config)
    {
        IReadOnlyDictionary<string, int> pos = Pos.TryGetValue(player.Pos, out var pv) ? pv : Pos["MEI"];
        IReadOnlyDictionary<string, int> arch =
            player.Archetype is not null && Arch.TryGetValue(player.Archetype, out var av) ? av : EmptyArch;

        int Value(string key) => Clamp(player.Overall + Off(pos, key) + Off(arch, key), config);

        return new Attrs(
            Pace: Value("pace"),
            Shooting: Value("shooting"),
            Passing: Value("passing"),
            Dribbling: Value("dribbling"),
            Defending: Value("defending"),
            Physical: Value("physical"));
    }

    private static int Off(IReadOnlyDictionary<string, int> d, string key) => d.TryGetValue(key, out int v) ? v : 0;

    // JS clamp: Math.max(MIN, Math.min(MAX, Math.round(v))). Math.round is half-up,
    // replicated as Math.Floor(v + 0.5) (inputs are integral here, so exact either way).
    private static int Clamp(double v, GameConfig c) =>
        Math.Max(c.ATTR_MIN, Math.Min(c.ATTR_MAX, (int)Math.Floor(v + 0.5)));
}
