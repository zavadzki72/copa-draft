using System.Reflection;
using System.Text.Json;

namespace CopaDraft.Engine.Tests;

/// <summary>Loads golden-vector JSON embedded in the test assembly.</summary>
internal static class Golden
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    /// <param name="fileName">e.g. "rng.json" — matched by resource name suffix.</param>
    public static T Load<T>(string fileName)
    {
        Assembly asm = typeof(Golden).Assembly;
        string resource = asm.GetManifestResourceNames()
            .Single(n => n.EndsWith("." + fileName, StringComparison.Ordinal)
                      || n.EndsWith(fileName, StringComparison.Ordinal));

        using Stream stream = asm.GetManifestResourceStream(resource)!;
        return JsonSerializer.Deserialize<T>(stream, Options)
            ?? throw new InvalidOperationException($"Golden '{fileName}' deserialized to null.");
    }
}
