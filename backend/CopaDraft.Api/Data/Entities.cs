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
    /// <summary>Modo do draft escolhido no lobby (classico|medium|almanaque):
    /// só afeta a experiência do draft no cliente; o servidor apenas o propaga.</summary>
    public string Mode { get; set; } = "classico";
    /// <summary>Tempo do draft em segundos, escolhido no lobby (prazo p/ montar
    /// o time; expirado/ausente é autocompletado).</summary>
    public int DraftSeconds { get; set; } = 180;
    /// <summary>Range de copas (anos) escolhido no lobby: filtra quais seleções
    /// entram na copa (draft + IA). 0/0 = todas as copas.</summary>
    public int CupFrom { get; set; }
    public int CupTo { get; set; }

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

/// <summary>
/// Resultado de uma disputa de pênaltis INTERATIVA de uma tie do mata-mata.
/// Diferente do resto do torneio, uma disputa decidida por humano NÃO é
/// reproduzível pelo seed — então é persistida cobrança a cobrança e
/// REAPLICADA no resume (em vez de re-simular/re-perguntar), senão um restart
/// trocaria o vencedor da fase. <see cref="KicksJson"/> guarda a sequência
/// completa para replay fiel inclusive após um crash no meio da disputa.
/// </summary>
public class ShootoutRecord
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    /// <summary>Id da tie do mata-mata (chave junto de RoomId).</summary>
    public required string TieId { get; set; }
    /// <summary>JSON da lista ordenada de cobranças (canto/defesa/resultado).</summary>
    public required string KicksJson { get; set; }
    /// <summary>True quando a disputa terminou (placar + vencedor finais).</summary>
    public bool Decided { get; set; }
    public int PensHome { get; set; }
    public int PensAway { get; set; }
    public string? WinnerId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
