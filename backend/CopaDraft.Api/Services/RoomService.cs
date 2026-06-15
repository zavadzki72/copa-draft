using CopaDraft.Api.Data;
using CopaDraft.Engine;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CopaDraft.Api.Services;

public sealed record PlayerDto(Guid UserId, string Name, string? Avatar, bool IsHost, bool Ready, string Presence, bool HasTeam);
public sealed record RoomStateDto(
    string Code, string State, Guid HostUserId, int MaxPlayers,
    DateTimeOffset? DraftDeadline, string Speed, string Level, string Mode, int DraftSeconds,
    int CupFrom, int CupTo, DateTimeOffset ServerNow, IReadOnlyList<PlayerDto> Players);

public class RoomServiceException(string message) : Exception(message);

/// <summary>Room lifecycle: create/join/leave, ready-check and host start.</summary>
public sealed class RoomService(AppDbContext db, IOptions<MpOptions> mp)
{
    private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

    private MpOptions Mp => mp.Value;

    // anos de copa disponíveis + tamanho mínimo de pool (copa cheia = 8×4 = 32).
    private static readonly int MinCup = SquadRepository.All.Min(s => s.Cup);
    private static readonly int MaxCup = SquadRepository.All.Max(s => s.Cup);
    private static readonly int RequiredPool = TournamentGenerator.GroupCount * GameConfig.Default.GROUP_SIZE;
    private static int PoolCount(int from, int to) => SquadRepository.All.Count(s => s.Cup >= from && s.Cup <= to);

    public async Task<RoomStateDto> CreateAsync(Guid hostUserId, CancellationToken ct = default)
    {
        string code = await UniqueCodeAsync(ct);
        var room = new Room
        {
            Id = Guid.NewGuid(), Code = code, HostUserId = hostUserId,
            State = RoomState.Waiting, Seed = Random.Shared.Next(),
            MaxPlayers = Mp.MaxPlayers, CreatedAt = DateTimeOffset.UtcNow,
            Speed = Mp.DefaultSpeed, Level = Mp.DefaultLevel, Mode = Mp.DefaultMode,
            DraftSeconds = Mp.DraftTimerSeconds, CupFrom = MinCup, CupTo = MaxCup,
        };
        db.Rooms.Add(room);
        db.Participants.Add(new Participant
        {
            Id = Guid.NewGuid(), RoomId = room.Id, UserId = hostUserId, IsHost = true,
            Presence = Presence.Connected, JoinOrder = 0, JoinedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    public async Task<RoomStateDto> JoinAsync(string code, Guid userId, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        Participant? existing = room.Participants.SingleOrDefault(p => p.UserId == userId);
        if (existing is not null)
        {
            // rejoining is always allowed (reconnection path)
            existing.Presence = Presence.Connected;
            await db.SaveChangesAsync(ct);
            return await GetStateAsync(code, ct);
        }
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("Esta sala já começou.");
        if (room.Participants.Count >= room.MaxPlayers)
            throw new RoomServiceException("Sala cheia.");

        db.Participants.Add(new Participant
        {
            Id = Guid.NewGuid(), RoomId = room.Id, UserId = userId,
            Presence = Presence.Connected,
            JoinOrder = room.Participants.Max(p => p.JoinOrder) + 1,
            JoinedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    public async Task<RoomStateDto?> LeaveAsync(string code, Guid userId, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        Participant? part = room.Participants.SingleOrDefault(p => p.UserId == userId);
        if (part is null) return await GetStateAsync(code, ct);

        if (room.State == RoomState.Waiting)
        {
            db.Participants.Remove(part);
            List<Participant> rest = room.Participants.Where(p => p.Id != part.Id).OrderBy(p => p.JoinOrder).ToList();
            if (rest.Count == 0)
            {
                db.Rooms.Remove(room);
                await db.SaveChangesAsync(ct);
                return null; // sala encerrada
            }
            if (part.IsHost)
            {
                rest[0].IsHost = true;
                room.HostUserId = rest[0].UserId;
            }
        }
        else
        {
            // in-tournament: never remove — AI takes over (RN10/RN11)
            part.Presence = Presence.Left;
        }
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    public async Task<RoomStateDto> SetReadyAsync(string code, Guid userId, bool ready, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("A sala já saiu do lobby.");
        Participant part = room.Participants.SingleOrDefault(p => p.UserId == userId)
            ?? throw new RoomServiceException("Você não está nesta sala.");
        part.Ready = ready;
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    /// <summary>Host starts the room: Waiting → Draft with a deadline.</summary>
    public async Task<RoomStateDto> StartDraftAsync(string code, Guid userId, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("A sala já começou.");
        if (room.HostUserId != userId)
            throw new RoomServiceException("Só o anfitrião pode iniciar.");
        if (room.Participants.Count < Mp.MinPlayers)
            throw new RoomServiceException($"Mínimo de {Mp.MinPlayers} jogadores para iniciar.");

        room.State = RoomState.Draft;
        int secs = room.DraftSeconds > 0 ? room.DraftSeconds : Mp.DraftTimerSeconds;
        room.DraftDeadline = DateTimeOffset.UtcNow.AddSeconds(secs);
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    /// <summary>Velocidade do ticker da sala (anfitrião, ainda no lobby).</summary>
    public async Task<RoomStateDto> SetSpeedAsync(string code, Guid userId, string speed, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.HostUserId != userId)
            throw new RoomServiceException("Só o anfitrião pode mudar a velocidade.");
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("A velocidade só pode mudar no lobby.");
        if (!Mp.Speeds.ContainsKey(speed))
            throw new RoomServiceException("Velocidade inválida.");
        room.Speed = speed;
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    /// <summary>Nível/dificuldade da sala (anfitrião, ainda no lobby): define a
    /// força das seleções de IA que preenchem a copa.</summary>
    public async Task<RoomStateDto> SetLevelAsync(string code, Guid userId, string level, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.HostUserId != userId)
            throw new RoomServiceException("Só o anfitrião pode mudar o nível.");
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("O nível só pode mudar no lobby.");
        if (!Mp.Levels.ContainsKey(level))
            throw new RoomServiceException("Nível inválido.");
        room.Level = level;
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    /// <summary>Modo do draft da sala (anfitrião, ainda no lobby).</summary>
    public async Task<RoomStateDto> SetModeAsync(string code, Guid userId, string mode, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.HostUserId != userId)
            throw new RoomServiceException("Só o anfitrião pode mudar o modo.");
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("O modo só pode mudar no lobby.");
        if (!Mp.Modes.Contains(mode))
            throw new RoomServiceException("Modo inválido.");
        room.Mode = mode;
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    /// <summary>Era das seleções (range de copas) da sala (anfitrião, no lobby).
    /// O pool filtrado precisa de ao menos uma copa cheia de seleções.</summary>
    public async Task<RoomStateDto> SetCupRangeAsync(string code, Guid userId, int from, int to, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.HostUserId != userId)
            throw new RoomServiceException("Só o anfitrião pode mudar a era das seleções.");
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("A era só pode mudar no lobby.");
        if (from < MinCup || to > MaxCup || from > to)
            throw new RoomServiceException("Intervalo de copas inválido.");
        if (PoolCount(from, to) < RequiredPool)
            throw new RoomServiceException($"Intervalo curto demais: a copa precisa de pelo menos {RequiredPool} seleções.");
        room.CupFrom = from;
        room.CupTo = to;
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    /// <summary>Tempo do draft da sala em segundos (anfitrião, ainda no lobby).</summary>
    public async Task<RoomStateDto> SetDraftTimeAsync(string code, Guid userId, int seconds, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.HostUserId != userId)
            throw new RoomServiceException("Só o anfitrião pode mudar o tempo do draft.");
        if (room.State != RoomState.Waiting)
            throw new RoomServiceException("O tempo do draft só pode mudar no lobby.");
        if (!Mp.DraftTimeOptions.Contains(seconds))
            throw new RoomServiceException("Tempo de draft inválido.");
        room.DraftSeconds = seconds;
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    /// <summary>Revanche: sala encerrada volta ao lobby — novo seed, ready
    /// zerado, times e registro do torneio descartados. Só o anfitrião.</summary>
    public async Task<RoomStateDto> ResetForRematchAsync(string code, Guid userId, CancellationToken ct = default)
    {
        Room room = await RequireRoomAsync(code, ct);
        if (room.State != RoomState.Finished)
            throw new RoomServiceException("A revanche só pode começar depois do torneio encerrar.");
        if (room.HostUserId != userId)
            throw new RoomServiceException("Só o anfitrião pode iniciar a revanche.");

        room.State = RoomState.Waiting;
        room.Seed = Random.Shared.Next();
        room.DraftDeadline = null;
        foreach (Participant p in room.Participants)
        {
            p.Ready = false;
            if (p.Presence == Presence.AiControlled) p.Presence = Presence.Connected;
        }
        List<Guid> partIds = room.Participants.Select(p => p.Id).ToList();
        db.Teams.RemoveRange(db.Teams.Where(t => partIds.Contains(t.ParticipantId)));
        db.Tournaments.RemoveRange(db.Tournaments.Where(t => t.RoomId == room.Id));
        await db.SaveChangesAsync(ct);
        return await GetStateAsync(code, ct);
    }

    public async Task SetPresenceAsync(string code, Guid userId, Presence presence, CancellationToken ct = default)
    {
        Room? room = await db.Rooms.Include(r => r.Participants)
            .SingleOrDefaultAsync(r => r.Code == code, ct);
        Participant? part = room?.Participants.SingleOrDefault(p => p.UserId == userId);
        if (part is null) return;
        part.Presence = presence;
        await db.SaveChangesAsync(ct);
    }

    public async Task<RoomStateDto> GetStateAsync(string code, CancellationToken ct = default)
    {
        Room room = await db.Rooms.AsNoTracking()
            .Include(r => r.Participants).ThenInclude(p => p.User)
            .Include(r => r.Participants).ThenInclude(p => p.Team)
            .SingleOrDefaultAsync(r => r.Code == code, ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");

        var players = room.Participants.OrderBy(p => p.JoinOrder).Select(p => new PlayerDto(
            p.UserId, p.User?.Name ?? "Jogador", p.User?.AvatarUrl,
            p.IsHost, p.Ready, PresenceName(p.Presence), p.Team is not null)).ToList();

        return new RoomStateDto(room.Code, StateName(room.State), room.HostUserId,
            room.MaxPlayers, room.DraftDeadline, room.Speed, room.Level, room.Mode, room.DraftSeconds,
            room.CupFrom, room.CupTo, DateTimeOffset.UtcNow, players);
    }

    public static string StateName(RoomState s) => s switch
    {
        RoomState.Waiting => "aguardando", RoomState.Draft => "draft",
        RoomState.Groups => "grupos", RoomState.Knockout => "mata-mata",
        _ => "encerrada",
    };

    public static string PresenceName(Presence p) => p switch
    {
        Presence.Connected => "conectado", Presence.AiControlled => "ia", _ => "saiu",
    };

    private async Task<Room> RequireRoomAsync(string code, CancellationToken ct)
        => await db.Rooms.Include(r => r.Participants).SingleOrDefaultAsync(r => r.Code == code.ToUpperInvariant(), ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");

    private async Task<string> UniqueCodeAsync(CancellationToken ct)
    {
        for (int attempt = 0; attempt < 20; attempt++)
        {
            char[] chars = new char[6];
            for (int i = 0; i < chars.Length; i++)
                chars[i] = CodeAlphabet[Random.Shared.Next(CodeAlphabet.Length)];
            var code = new string(chars);
            if (!await db.Rooms.AnyAsync(r => r.Code == code, ct)) return code;
        }
        throw new RoomServiceException("Não foi possível gerar um código de sala.");
    }
}
