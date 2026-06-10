namespace CopaDraft.Engine.Models;

/// <summary>
/// A player as fed to the engine — mirrors the JS side.starters/bench entries
/// (squad player shape, optionally with campaign fatigue).
/// </summary>
public sealed class EnginePlayer
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Pos { get; init; }
    public int Age { get; init; }
    public int Overall { get; init; }
    public string? Archetype { get; init; }
    public bool Leader { get; init; }
    public string? Team { get; init; }
    public string? Code { get; init; }
    public int Cup { get; init; }
    /// <summary>Campaign fatigue points (solo feature; 0 in MP).</summary>
    public double Fatigue { get; init; }

    public static EnginePlayer From(Player p) => new()
    {
        Id = p.Id, Name = p.Name, Pos = p.Pos, Age = p.Age, Overall = p.Overall,
        Archetype = p.Archetype, Leader = p.Leader, Team = p.Team, Code = p.Code, Cup = p.Cup,
    };
}

/// <summary>One side's input to SimulateMatch — mirrors the JS `side` object.</summary>
public sealed class SideInput
{
    public required string Name { get; init; }
    public string? Code { get; init; }
    public int Cup { get; init; }
    public bool Dream { get; init; }
    public required string Formation { get; init; }
    public required IReadOnlyList<EnginePlayer> Starters { get; init; }
    public IReadOnlyList<EnginePlayer> Bench { get; init; } = Array.Empty<EnginePlayer>();
    public int SubsLeft { get; init; }
    public string? CaptainId { get; init; }
}

/// <summary>Engine options — mirrors the JS `opts` argument.</summary>
public sealed record EngineOptions
{
    public bool Knockout { get; init; }
    public bool Pressure { get; init; }
    public bool Fatigue { get; init; }
    public int RoundN { get; init; }
    /// <summary>Always false on the server (interactive shootout is a solo-UI feature).</summary>
    public bool InteractiveShootout { get; init; }
}

/// <summary>A match-log event — field-for-field mirror of the JS event objects.</summary>
public sealed class MatchEvent
{
    public int Minute { get; set; }
    public required string Type { get; init; }
    public string? Side { get; init; }
    public bool EtTag { get; init; }
    public bool Pen { get; init; }
    public string? PenId { get; init; }
    public string? Outcome { get; init; }
    /// <summary>Stable semantic key for milestone events (kickoff/halfTime/...).</summary>
    public string? Key { get; init; }
    public required string Text { get; init; }
    public IReadOnlyList<string>? Players { get; init; }
    /// <summary>Score snapshot right after a goal (goal events only).</summary>
    public Score? Score { get; set; }
}

public sealed class Score
{
    public int Home { get; set; }
    public int Away { get; set; }
    public Score Clone() => new() { Home = Home, Away = Away };
}

public sealed class PlayerStats
{
    public int Goals { get; set; }
    public int Assists { get; set; }
    public int Saves { get; set; }
    public int BigChances { get; set; }
    public int Yellows { get; set; }
    public int Reds { get; set; }
}

public sealed record CardEntry(string Id, string Side, int Minute, string Type, bool SecondYellow);
public sealed record SentOffEntry(string Id, string Side, int Minute, bool SecondYellow);
public sealed record InjuryEntry(string Id, string Side, int Minute, string? ReplacedBy);

public sealed class MatchPen
{
    public required string PenId { get; init; }
    public required string Side { get; init; }
    public int Minute { get; init; }
    public required string Taker { get; init; }
    public required string TakerName { get; init; }
    public string? Gk { get; init; }
    public required string Outcome { get; init; }
    public bool Scored { get; init; }
}

public sealed record SideSummary(
    string Name, string? Code, int Cup, bool Dream, string Formation,
    IReadOnlyList<StarterRef> Starters);

public sealed record StarterRef(string Id, string Name, string Pos);

/// <summary>The full match log — mirror of the JS simulateMatch return value.</summary>
public sealed class MatchLog
{
    public required SideSummary Home { get; init; }
    public required SideSummary Away { get; init; }
    public required Score Score { get; init; }
    public required IReadOnlyList<MatchEvent> Events { get; init; }
    public required IReadOnlyDictionary<string, PlayerStats> Stats { get; init; }
    public required Score Conceded { get; init; }
    public required string Result { get; init; }
    public bool ExtraTime { get; init; }
    public Score? Penalties { get; init; }
    public bool NeedsShootout { get; init; }
    public required IReadOnlyList<CardEntry> Cards { get; init; }
    public required IReadOnlyList<SentOffEntry> SentOff { get; init; }
    public required IReadOnlyList<InjuryEntry> Injuries { get; init; }
    public required IReadOnlyList<MatchPen> MatchPens { get; init; }
    public required IReadOnlyDictionary<string, int> ManDown { get; init; }
    public uint Seed { get; init; }
}
