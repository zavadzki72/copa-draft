namespace CopaDraft.Api.Data;

/// <summary>Room lifecycle states.</summary>
public enum RoomState { Waiting = 0, Draft = 1, Groups = 2, Knockout = 3, Finished = 4 }

/// <summary>Participant presence: connected, AI took over, or left for good.</summary>
public enum Presence { Connected = 0, AiControlled = 1, Left = 2 }

public class User
{
    public Guid Id { get; set; }
    /// <summary>Google subject claim (stable external id).</summary>
    public required string GoogleSub { get; set; }
    public required string Name { get; set; }
    public string? Email { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Room
{
    public Guid Id { get; set; }
    /// <summary>Short invite code (unique).</summary>
    public required string Code { get; set; }
    public Guid HostUserId { get; set; }
    public RoomState State { get; set; }
    /// <summary>Tournament seed (uint stored as long).</summary>
    public long Seed { get; set; }
    public int MaxPlayers { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    /// <summary>Draft deadline while State == Draft.</summary>
    public DateTimeOffset? DraftDeadline { get; set; }
    /// <summary>Velocidade do ticker escolhida no lobby (normal|rapido|super).</summary>
    public string Speed { get; set; } = "rapido";
    /// <summary>Nível (dificuldade) escolhido no lobby: controla a força das
    /// seleções de IA que preenchem a copa (facil|normal|dificil|lenda).</summary>
    public string Level { get; set; } = "normal";

    public List<Participant> Participants { get; set; } = new();
}

public class Participant
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public Guid UserId { get; set; }
    public bool IsHost { get; set; }
    public Presence Presence { get; set; }
    public bool Ready { get; set; }
    /// <summary>Stable join order — used for deterministic group seeding.</summary>
    public int JoinOrder { get; set; }
    public DateTimeOffset JoinedAt { get; set; }

    public Room? Room { get; set; }
    public User? User { get; set; }
    public SubmittedTeam? Team { get; set; }
}

public class SubmittedTeam
{
    public Guid Id { get; set; }
    public Guid ParticipantId { get; set; }
    public required string Formation { get; set; }
    public string? CaptainId { get; set; }
    /// <summary>JSON array of squad-player ids (11 titulares).</summary>
    public required string StartersJson { get; set; }
    /// <summary>JSON array of squad-player ids (reservas).</summary>
    public required string BenchJson { get; set; }
    public bool AutoFilled { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }

    public Participant? Participant { get; set; }
}

public class TournamentRecord
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    /// <summary>Serialized tournament structure + results (groups, fixtures,
    /// standings, bracket). Deterministically re-derivable from seed + teams;
    /// stored as a blob for resume/inspection (MVP pragmatism).</summary>
    public required string StateJson { get; set; }
    public string? ChampionTeamId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
