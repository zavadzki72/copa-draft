namespace CopaDraft.Api.Services;

/// <summary>
/// Multiplayer balance/rule knobs (server-side counterpart of the MP section in
/// config.js). Bound from the "Mp" configuration section; defaults here are the
/// single source of server-side defaults.
/// </summary>
public sealed class MpOptions
{
    public const string Section = "Mp";

    /// <summary>Minimum players to start a tournament.</summary>
    public int MinPlayers { get; set; } = 2;

    /// <summary>Maximum players per room (8 ⇒ up to 8 groups bracket).</summary>
    public int MaxPlayers { get; set; } = 8;

    /// <summary>Draft time limit; expired/absent players get autofilled.</summary>
    public int DraftTimerSeconds { get; set; } = 180;

    /// <summary>Canonical ticker pace for MP matches (ms per simulated minute).</summary>
    public int PaceMsPerMinute { get; set; } = 250;

    /// <summary>Pause between rounds so players can read tables/bracket.</summary>
    public int InterRoundSeconds { get; set; } = 12;
}
