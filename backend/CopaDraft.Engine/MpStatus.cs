using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>Status de campanha de um jogador no multiplayer.</summary>
public sealed record PlayerStatusEntry(int Suspended, int Injured);

/// <summary>Um jogador indisponível na rodada (para exibir no pré-jogo).</summary>
public sealed record OutPlayerDto(string Id, string Name, string Pos, string Reason, int N);

/// <summary>
/// Suspensões (cartão vermelho) e lesões entre fases no multiplayer — espelha a
/// regra do solo (lib/team.js advancePlayerStatus): após cada partida os
/// contadores caem 1; um vermelho suspende SUSPENSION_MATCHES e uma lesão tira
/// INJURY_PHASES_MIN..MAX fases (duração determinística por seed+id). Antes de
/// cada jogo o time troca automaticamente o indisponível por um reserva da
/// mesma posição (ou mesmo tipo). Puro e determinístico (resume reproduz igual).
/// </summary>
public static class MpStatus
{
    public static bool IsOut(IReadOnlyDictionary<string, PlayerStatusEntry> status, string id)
        => status.TryGetValue(id, out PlayerStatusEntry? s) && (s.Suspended > 0 || s.Injured > 0);

    /// <summary>Duração da lesão (fases) — determinística por seed + id.</summary>
    public static int InjuryDuration(uint seed, string id, GameConfig c)
    {
        uint h = Rng.SeedFrom("inj-" + seed + "-" + id);
        int span = c.INJURY_PHASES_MAX - c.INJURY_PHASES_MIN + 1;
        return c.INJURY_PHASES_MIN + (int)(h % (uint)span);
    }

    /// <summary>Após a partida: decrementa todos e aplica os vermelhos/lesões
    /// DESTE lado (side = "home"|"away").</summary>
    public static void AdvanceAfterMatch(
        Dictionary<string, PlayerStatusEntry> status, MatchLog log, string side, GameConfig c)
    {
        foreach (string id in status.Keys.ToList())
        {
            PlayerStatusEntry s = status[id];
            int sus = Math.Max(0, s.Suspended - 1);
            int inj = Math.Max(0, s.Injured - 1);
            if (sus > 0 || inj > 0) status[id] = new PlayerStatusEntry(sus, inj);
            else status.Remove(id);
        }
        foreach (SentOffEntry e in log.SentOff.Where(e => e.Side == side))
        {
            PlayerStatusEntry prev = status.GetValueOrDefault(e.Id) ?? new PlayerStatusEntry(0, 0);
            status[e.Id] = prev with { Suspended = c.SUSPENSION_MATCHES };
        }
        foreach (InjuryEntry e in log.Injuries.Where(e => e.Side == side))
        {
            PlayerStatusEntry prev = status.GetValueOrDefault(e.Id) ?? new PlayerStatusEntry(0, 0);
            status[e.Id] = prev with { Injured = InjuryDuration(log.Seed, e.Id, c) };
        }
    }

    private static bool SameKind(string a, string b) => (a == "GOL") == (b == "GOL");

    /// <summary>Monta a side efetiva da rodada: tira os indisponíveis do XI e
    /// promove um reserva da mesma posição (ou mesmo tipo). Sem reserva, o time
    /// joga com um a menos.</summary>
    public static SideInput ApplyAvailability(SideInput side, IReadOnlyDictionary<string, PlayerStatusEntry> status)
    {
        if (status.Count == 0 || !side.Starters.Any(p => IsOut(status, p.Id))) return side;

        var usedBench = new HashSet<string>();
        List<EnginePlayer> avail = side.Bench.Where(b => !IsOut(status, b.Id)).ToList();
        var newStarters = new List<EnginePlayer>();
        foreach (EnginePlayer st in side.Starters)
        {
            if (!IsOut(status, st.Id)) { newStarters.Add(st); continue; }
            EnginePlayer? rep = avail.FirstOrDefault(b => !usedBench.Contains(b.Id) && b.Pos == st.Pos)
                             ?? avail.FirstOrDefault(b => !usedBench.Contains(b.Id) && SameKind(b.Pos, st.Pos));
            if (rep is not null) { usedBench.Add(rep.Id); newStarters.Add(rep); }
            // sem reserva compatível: o time joga com um a menos
        }
        List<EnginePlayer> newBench = side.Bench.Where(b => !usedBench.Contains(b.Id) && !IsOut(status, b.Id)).ToList();
        return new SideInput
        {
            Name = side.Name, Code = side.Code, Cup = side.Cup, Dream = side.Dream,
            Formation = side.Formation, Starters = newStarters, Bench = newBench,
            SubsLeft = side.SubsLeft, CaptainId = side.CaptainId,
        };
    }

    /// <summary>Lista (nome+motivo) dos titulares indisponíveis de uma side —
    /// para o pré-jogo mostrar quem ficou de fora.</summary>
    public static List<OutPlayerDto> OutStarters(SideInput side, IReadOnlyDictionary<string, PlayerStatusEntry> status)
    {
        var outs = new List<OutPlayerDto>();
        foreach (EnginePlayer p in side.Starters)
        {
            if (!status.TryGetValue(p.Id, out PlayerStatusEntry? s)) continue;
            if (s.Suspended > 0) outs.Add(new OutPlayerDto(p.Id, p.Name, p.Pos, "suspended", s.Suspended));
            else if (s.Injured > 0) outs.Add(new OutPlayerDto(p.Id, p.Name, p.Pos, "injured", s.Injured));
        }
        return outs;
    }
}
