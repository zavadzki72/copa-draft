using System.Text.Json;
using CopaDraft.Api.Data;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.EntityFrameworkCore;

namespace CopaDraft.Api.Services;

public sealed record SubmitTeamRequest(
    string Formation, IReadOnlyList<string> Starters, IReadOnlyList<string> Bench, string? CaptainId);

public sealed record DraftProgressDto(int Submitted, int Total, IReadOnlyList<Guid> SubmittedUserIds);

/// <summary>A resolved player line for the "ver times enviados" view.</summary>
public sealed record DraftPlayerDto(string Id, string Name, string Pos, string? Code, int Cup, int Overall);

/// <summary>A participant's submitted team, players resolved for display.</summary>
public sealed record SubmittedTeamDto(
    Guid UserId, string Name, string Formation, string? CaptainId, bool AutoFilled,
    IReadOnlyList<DraftPlayerDto> Starters, IReadOnlyList<DraftPlayerDto> Bench);

/// <summary>
/// Receives submitted dream teams during the draft phase, validates them
/// against the shared squad pool + formation rules, and autofills expired or
/// absent players (seeded per participant — deterministic).
/// </summary>
public sealed class DraftService(AppDbContext db)
{
    private static readonly string[] BenchSlots = { "GOL", "DEF", "MEI", "ATA" }; // mirrors CONFIG.DRAFT_BENCH
    private static readonly string[] DefAllow = { "ZAG", "LAT" };

    public async Task SubmitAsync(string code, Guid userId, SubmitTeamRequest req, CancellationToken ct = default)
    {
        (Room room, Participant part) = await RequireDraftAsync(code, userId, ct);
        Validate(req);

        SubmittedTeam? team = await db.Teams.SingleOrDefaultAsync(t => t.ParticipantId == part.Id, ct);
        if (team is null)
        {
            team = new SubmittedTeam
            {
                Id = Guid.NewGuid(), ParticipantId = part.Id,
                Formation = req.Formation, StartersJson = "[]", BenchJson = "[]",
            };
            db.Teams.Add(team);
        }
        team.Formation = req.Formation;
        team.CaptainId = req.CaptainId;
        team.StartersJson = JsonSerializer.Serialize(req.Starters);
        team.BenchJson = JsonSerializer.Serialize(req.Bench);
        team.AutoFilled = false;
        team.SubmittedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Autofills every participant without a team (deadline/absence path).</summary>
    public async Task<int> AutofillMissingAsync(string code, CancellationToken ct = default)
    {
        Room room = await db.Rooms.Include(r => r.Participants).ThenInclude(p => p.Team)
            .SingleOrDefaultAsync(r => r.Code == code, ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");

        int filled = 0;
        foreach (Participant part in room.Participants.Where(p => p.Team is null))
        {
            uint seed = Rng.SeedFrom(room.Seed + ":" + part.UserId);
            (List<string> starters, List<string> bench) = RandomTeam(new Rng(seed), "4-3-3");
            db.Teams.Add(new SubmittedTeam
            {
                Id = Guid.NewGuid(), ParticipantId = part.Id, Formation = "4-3-3",
                StartersJson = JsonSerializer.Serialize(starters),
                BenchJson = JsonSerializer.Serialize(bench),
                AutoFilled = true, SubmittedAt = DateTimeOffset.UtcNow,
            });
            filled++;
        }
        if (filled > 0) await db.SaveChangesAsync(ct);
        return filled;
    }

    public async Task<DraftProgressDto> ProgressAsync(string code, CancellationToken ct = default)
    {
        Room room = await db.Rooms.AsNoTracking()
            .Include(r => r.Participants).ThenInclude(p => p.Team)
            .SingleOrDefaultAsync(r => r.Code == code, ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");
        List<Guid> done = room.Participants.Where(p => p.Team is not null).Select(p => p.UserId).ToList();
        return new DraftProgressDto(done.Count, room.Participants.Count, done);
    }

    public async Task<bool> AllSubmittedAsync(string code, CancellationToken ct = default)
    {
        DraftProgressDto p = await ProgressAsync(code, ct);
        return p.Submitted == p.Total;
    }

    /// <summary>Times já enviados (submetidos ou autocompletados) da sala, com os
    /// jogadores resolvidos — usado pra "ver os times dos outros" durante a
    /// espera do draft.</summary>
    public async Task<IReadOnlyList<SubmittedTeamDto>> SubmittedTeamsAsync(
        string code, Guid callerId, CancellationToken ct = default)
    {
        Room room = await db.Rooms.AsNoTracking()
            .Include(r => r.Participants).ThenInclude(p => p.User)
            .Include(r => r.Participants).ThenInclude(p => p.Team)
            .SingleOrDefaultAsync(r => r.Code == code, ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");
        // só membros da sala veem os times enviados (evita vazamento entre salas)
        if (room.Participants.All(p => p.UserId != callerId))
            throw new RoomServiceException("Você não está nesta sala.");

        static DraftPlayerDto Resolve(string id)
        {
            Player p = SquadRepository.PlayersById[id];
            return new DraftPlayerDto(p.Id, p.Name, p.Pos, p.Code, p.Cup, p.Overall);
        }

        var list = new List<SubmittedTeamDto>();
        foreach (Participant part in room.Participants.Where(p => p.Team is not null).OrderBy(p => p.JoinOrder))
        {
            SubmittedTeam team = part.Team!;
            List<DraftPlayerDto> starters = JsonSerializer.Deserialize<List<string>>(team.StartersJson)!.Select(Resolve).ToList();
            List<DraftPlayerDto> bench = JsonSerializer.Deserialize<List<string>>(team.BenchJson)!.Select(Resolve).ToList();
            list.Add(new SubmittedTeamDto(part.UserId, part.User?.Name ?? "Jogador",
                team.Formation, team.CaptainId, team.AutoFilled, starters, bench));
        }
        return list;
    }

    /// <summary>Builds the engine side for a participant's submitted team.</summary>
    public static SideInput ToSide(SubmittedTeam team, string displayName)
    {
        var starters = JsonSerializer.Deserialize<List<string>>(team.StartersJson)!
            .Select(id => EnginePlayer.From(SquadRepository.PlayersById[id])).ToList();
        var bench = JsonSerializer.Deserialize<List<string>>(team.BenchJson)!
            .Select(id => EnginePlayer.From(SquadRepository.PlayersById[id])).ToList();
        return new SideInput
        {
            Name = displayName, Code = null, Cup = 0, Dream = true,
            Formation = team.Formation, Starters = starters, Bench = bench,
            SubsLeft = 3, CaptainId = team.CaptainId,
        };
    }

    // ---- validation ----
    private void Validate(SubmitTeamRequest req)
    {
        IReadOnlyDictionary<string, int> need = GameConfig.Default.FORMATIONS.TryGetValue(req.Formation, out var f)
            ? f : throw new RoomServiceException("Formação inválida.");

        if (req.Starters.Count != 11) throw new RoomServiceException("O time precisa de 11 titulares.");
        List<string> all = req.Starters.Concat(req.Bench).ToList();
        if (all.Distinct().Count() != all.Count) throw new RoomServiceException("Jogador repetido no elenco.");

        var counts = new Dictionary<string, int> { ["GOL"] = 0, ["ZAG"] = 0, ["LAT"] = 0, ["MEI"] = 0, ["ATA"] = 0 };
        foreach (string id in req.Starters)
        {
            if (!SquadRepository.PlayersById.TryGetValue(id, out Player? p))
                throw new RoomServiceException($"Jogador desconhecido: {id}");
            counts[p.Pos]++;
        }
        foreach ((string pos, int n) in need)
            if (counts[pos] != n)
                throw new RoomServiceException($"A formação {req.Formation} exige {n} {pos}, recebeu {counts[pos]}.");

        foreach (string id in req.Bench)
            if (!SquadRepository.PlayersById.ContainsKey(id))
                throw new RoomServiceException($"Reserva desconhecido: {id}");

        if (req.CaptainId is not null && !req.Starters.Contains(req.CaptainId))
            throw new RoomServiceException("O capitão precisa estar entre os titulares.");
    }

    private async Task<(Room, Participant)> RequireDraftAsync(string code, Guid userId, CancellationToken ct)
    {
        Room room = await db.Rooms.Include(r => r.Participants)
            .SingleOrDefaultAsync(r => r.Code == code, ct)
            ?? throw new RoomServiceException("Esta sala não está disponível.");
        if (room.State != RoomState.Draft)
            throw new RoomServiceException("A sala não está em fase de draft.");
        Participant part = room.Participants.SingleOrDefault(p => p.UserId == userId)
            ?? throw new RoomServiceException("Você não está nesta sala.");
        return (room, part);
    }

    // ---- random team (autofill) — per-slot draw across random squads,
    //      mirroring the solo Random fill behaviour ----
    private static (List<string> Starters, List<string> Bench) RandomTeam(Rng rng, string formation)
    {
        IReadOnlyDictionary<string, int> need = GameConfig.Default.FORMATIONS[formation];
        IReadOnlyList<Squad> pool = SquadRepository.All;
        var taken = new HashSet<string>();

        string DrawFor(string pos, string[]? allow)
        {
            for (int attempt = 0; attempt < 200; attempt++)
            {
                Squad squad = rng.Pick(pool);
                List<Player> eligible = squad.Players
                    .Where(p => allow is not null ? allow.Contains(p.Pos) : p.Pos == pos)
                    .Where(p => !taken.Contains(p.Id))
                    .ToList();
                if (eligible.Count == 0) continue;
                Player pick = rng.Pick(eligible);
                taken.Add(pick.Id);
                return pick.Id;
            }
            throw new RoomServiceException("Autofill não encontrou jogador elegível.");
        }

        var starters = new List<string>();
        foreach (string pos in new[] { "GOL", "ZAG", "LAT", "MEI", "ATA" })
            for (int i = 0; i < need[pos]; i++)
                starters.Add(DrawFor(pos, null));

        var bench = new List<string>();
        foreach (string slot in BenchSlots)
            bench.Add(slot == "DEF" ? DrawFor(slot, DefAllow) : DrawFor(slot, null));

        return (starters, bench);
    }
}
