namespace CopaDraft.Engine;

/// <summary>
/// Faithful C# port of lib/rng.js — a seeded mulberry32 PRNG plus the same
/// convenience helpers. It MUST match the JS implementation bit-for-bit so the
/// ported engine is reproducible against the JS reference (see golden vectors
/// in CopaDraft.Engine.Tests/golden/rng.json).
///
/// Parity notes vs JS:
///   • `a |= 0`, `(x) | 0`        -> int32 (C# `int` under `unchecked`)
///   • `x >>> n` (unsigned shift) -> `(int)((uint)x >> n)`
///   • `Math.imul(x, y)`          -> `unchecked(x * y)` on `int`
///   • final `>>> 0` / 2^32       -> `(uint)t / 4294967296.0`
/// </summary>
public sealed class Rng
{
    private int _a;

    /// <param name="seed">Mirrors JS `seed >>> 0`; the closure's `a |= 0` then
    /// views it as int32, so we store the int32 reinterpretation directly.</param>
    public Rng(uint seed) => _a = unchecked((int)seed);

    /// <summary>Next float in [0, 1) — the mulberry32 step.</summary>
    public double Next()
    {
        unchecked
        {
            _a |= 0;
            _a = _a + 0x6D2B79F5;
            int t = Imul(_a ^ (int)((uint)_a >> 15), 1 | _a);
            t = (t + Imul(t ^ (int)((uint)t >> 7), 61 | t)) ^ t;
            uint u = (uint)(t ^ (int)((uint)t >> 14));
            return u / 4294967296.0;
        }
    }

    /// <summary>JS `Math.imul`: low-32-bit signed integer multiply.</summary>
    private static int Imul(int x, int y) => unchecked(x * y);

    public double Range(double min, double max) => min + Next() * (max - min);

    /// <summary>JS `int(min, max)` — inclusive on both ends.</summary>
    public int NextInt(int min, int max) => (int)Math.Floor(min + Next() * (max - min + 1));

    public bool Chance(double p) => Next() < p;

    public T Pick<T>(IReadOnlyList<T> arr) => arr[(int)Math.Floor(Next() * arr.Count)];

    /// <summary>Weighted pick. Items carry a weight; walks the same order as JS.</summary>
    public T Weighted<T>(IReadOnlyList<(T Item, double W)> items)
    {
        double total = 0;
        for (int i = 0; i < items.Count; i++) total += items[i].W;

        double t = Next() * total;
        for (int i = 0; i < items.Count; i++)
        {
            t -= items[i].W;
            if (t <= 0) return items[i].Item;
        }
        return items[items.Count - 1].Item;
    }

    /// <summary>FNV-1a 32-bit hash of a string — JS `seedFrom`. Iterates UTF-16
    /// code units (matching `charCodeAt`).</summary>
    public static uint SeedFrom(string s)
    {
        unchecked
        {
            uint h = 2166136261u;
            foreach (char c in s)
            {
                h ^= c;
                h *= 16777619u;
            }
            return h;
        }
    }
}
