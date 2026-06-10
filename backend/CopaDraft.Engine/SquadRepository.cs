using System.Reflection;
using System.Text.Json;
using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>
/// Loads the shared squad pool from the embedded <c>squads.json</c> (generated
/// from data/squads.js via tools/gen-squads-json.js — the single source of
/// squad data shared between the JS frontend and the C# engine).
/// </summary>
public static class SquadRepository
{
    private const string ResourceName = "squads.json";

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private static readonly Lazy<IReadOnlyList<Squad>> LazyAll = new(Load);

    private static readonly Lazy<IReadOnlyDictionary<string, Player>> LazyById = new(() =>
        LazyAll.Value.SelectMany(s => s.Players).ToDictionary(p => p.Id));

    /// <summary>All squads in the shared pool (deserialized once, cached).</summary>
    public static IReadOnlyList<Squad> All => LazyAll.Value;

    /// <summary>Every player in the pool, indexed by id.</summary>
    public static IReadOnlyDictionary<string, Player> PlayersById => LazyById.Value;

    private static IReadOnlyList<Squad> Load()
    {
        Assembly asm = typeof(SquadRepository).Assembly;
        using Stream stream = asm.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"Embedded resource '{ResourceName}' not found in {asm.GetName().Name}.");

        List<Squad> squads = JsonSerializer.Deserialize<List<Squad>>(stream, Options)
            ?? throw new InvalidOperationException("Failed to deserialize squads.json (null).");

        return squads;
    }
}
