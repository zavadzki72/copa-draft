using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CopaDraft.Engine;

/// <summary>
/// PT-BR narration provider mirroring lib/i18n.js (arr / t / fill) for the
/// engine. Loaded from the embedded narration.pt.json (generated from
/// lib/i18n.js by tools/gen-narration.js).
///
/// Parity is critical: the engine draws variants via <c>rng.Pick(Arr(key))</c>,
/// so each array MUST keep the same length as the JS source or the RNG stream
/// desyncs and results diverge.
/// </summary>
public sealed partial class Narration
{
    private const string ResourceName = "narration-pt.json";

    private readonly IReadOnlyDictionary<string, string[]> _arrays;
    private readonly IReadOnlyDictionary<string, string> _strings;

    /// <summary>Shared PT-BR narration instance.</summary>
    public static Narration Pt { get; } = new();

    private Narration()
    {
        Assembly asm = typeof(Narration).Assembly;
        using Stream stream = asm.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded resource '{ResourceName}' not found.");
        using JsonDocument doc = JsonDocument.Parse(stream);

        var arrays = new Dictionary<string, string[]>();
        var strings = new Dictionary<string, string>();
        foreach (JsonProperty prop in doc.RootElement.EnumerateObject())
        {
            switch (prop.Value.ValueKind)
            {
                case JsonValueKind.Array:
                    arrays[prop.Name] = prop.Value.EnumerateArray().Select(e => e.GetString()!).ToArray();
                    break;
                case JsonValueKind.String:
                    strings[prop.Name] = prop.Value.GetString()!;
                    break;
            }
        }

        _arrays = arrays;
        _strings = strings;
    }

    /// <summary>Mirror of I18N.arr — the variant array (empty if missing).</summary>
    public string[] Arr(string key) => _arrays.TryGetValue(key, out string[]? v) ? v : Array.Empty<string>();

    /// <summary>Mirror of I18N.t — filled string, or the key itself if missing.</summary>
    public string T(string key, IReadOnlyDictionary<string, object?>? vars = null)
        => _strings.TryGetValue(key, out string? v) ? Fill(v, vars) : key;

    /// <summary>Mirror of I18N.fill — replaces {word} with vars[word], or "" if absent/null.</summary>
    public string Fill(string tpl, IReadOnlyDictionary<string, object?>? vars)
        => PlaceholderRegex().Replace(tpl, m =>
        {
            string k = m.Groups[1].Value;
            if (vars is not null && vars.TryGetValue(k, out object? val) && val is not null)
                return Convert.ToString(val, CultureInfo.InvariantCulture) ?? string.Empty;
            return string.Empty;
        });

    [GeneratedRegex(@"\{(\w+)\}")]
    private static partial Regex PlaceholderRegex();
}
