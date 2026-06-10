namespace CopaDraft.Engine.Models;

/// <summary>
/// A historical World Cup squad (selection × cup), mirroring data/squads.js /
/// squads.json. ~18 players each.
/// </summary>
public sealed record Squad
{
    public required string Id { get; init; }
    public required string Team { get; init; }
    public string? Code { get; init; }
    public int Cup { get; init; }
    public string? Host { get; init; }
    public required IReadOnlyList<Player> Players { get; init; }
}
