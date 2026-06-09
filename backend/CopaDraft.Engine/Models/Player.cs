namespace CopaDraft.Engine.Models;

/// <summary>
/// A squad player, mirroring the shape used by the JS frontend
/// (see data/squads.js / squads.json). Fields map 1:1 to the JSON keys.
/// </summary>
public sealed record Player
{
    public required string Id { get; init; }
    public required string Name { get; init; }

    /// <summary>Position: GOL | ZAG | LAT | MEI | ATA.</summary>
    public required string Pos { get; init; }

    public int Age { get; init; }
    public int Overall { get; init; }

    /// <summary>craque | velocista | cerebral | muralha | motorzinho | finalizador | lider.</summary>
    public string? Archetype { get; init; }

    public bool Leader { get; init; }

    public string? Team { get; init; }
    public string? Code { get; init; }
    public int Cup { get; init; }
}
