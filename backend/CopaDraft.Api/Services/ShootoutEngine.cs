using CopaDraft.Engine;

namespace CopaDraft.Api.Services;

/// <summary>
/// Uma cobrança da disputa de pênaltis (persistida e transmitida). É a unidade
/// de replay: a sequência completa reconstrói a disputa fielmente, inclusive
/// após um crash no meio dela.
/// </summary>
public sealed record ShootoutKick(
    int Index, string Side, string TakerId, string TakerName,
    string Zone, string GkZone, string Outcome, bool Scored);

/// <summary>
/// Lógica PURA da disputa de pênaltis server-authoritative — espelho fiel das
/// fórmulas e regras de ui/penalty.jsx (PenaltyShootout). Sem IO: o orquestrador
/// pluga a fonte do canto (humano via hub ou IA seedada), a persistência e o
/// broadcast por cima. RNG seedado POR cobrança (KickSeed) → a máquina é
/// determinística dada a mesma entrada e resumível independente de ordem.
/// </summary>
public static class ShootoutEngine
{
    public static readonly IReadOnlyList<string> Zones = new[] { "esq", "meio", "dir" };

    public static bool IsZone(string? z) => z is "esq" or "meio" or "dir";

    /// <summary>Seed dedicado por cobrança: cada chute reseed independente, então
    /// o replay de uma disputa interrompida não depende de avançar o RNG.</summary>
    public static uint KickSeed(uint baseSeed, int index)
        => unchecked(baseSeed + (uint)index * 2654435761u);

    /// <summary>IA cobra: prefere os cantos ao meio (espelho de aiShoot no solo).</summary>
    public static string AiShoot(Rng r)
        => r.Chance(0.8) ? (r.Chance(0.5) ? "esq" : "dir") : "meio";

    /// <summary>Goleiro (sempre resolvido pelo servidor): "lê" o canto do cobrador
    /// uma fração das vezes, senão chuta um canto (espelho de aiGuess no solo).</summary>
    public static string AiGuess(Rng r, string shooterZone, GameConfig c)
        => r.Chance(c.PK_AI_READ) ? shooterZone : r.Pick(Zones);

    /// <summary>Gol? Espelho de computeGoal em ui/penalty.jsx (literais do solo).</summary>
    public static bool Scored(string shoot, string gk, double finishing, double keeperOvr, GameConfig c, Rng r)
    {
        if (shoot != gk)
        {
            double missP = Math.Max(0.03, 0.09 - (finishing - 80) * 0.0015);
            return !r.Chance(missP);   // quase sempre gol quando o goleiro vai pro lado errado
        }
        double saveP = c.PK_SAVE_BASE + (keeperOvr - 80) * 0.01 - (finishing - 80) * 0.006;
        saveP = Math.Max(0.25, Math.Min(0.9, saveP));
        return !r.Chance(saveP);       // goleiro acertou o lado: defende com prob saveP
    }

    public static string Outcome(bool scored, string shoot, string gk)
        => scored ? "goal" : (shoot == gk ? "save" : "miss");

    /// <summary>Espelho de resolveDecided em ui/penalty.jsx — melhor-de-`rounds`
    /// e depois morte súbita. Retorna "home"/"away" quando decidido, senão null.</summary>
    public static string? Decided(int sh, int sa, int kh, int ka, bool sudden, int rounds)
    {
        if (!sudden)
        {
            int hRem = Math.Max(0, rounds - kh);
            int aRem = Math.Max(0, rounds - ka);
            if (sh > sa + aRem) return "home";
            if (sa > sh + hRem) return "away";
            return null;
        }
        // morte súbita: decide só quando ambos cobraram o mesmo número de vezes
        if (kh == ka && sh != sa) return sh > sa ? "home" : "away";
        return null;
    }

    public sealed record Taker(string Id, string Name, double Shooting);

    /// <summary>Disputa 100% IA a partir de um seed — usado em testes de
    /// determinismo. Mesma ordem de cobranças/RNG da máquina real (sem humanos).</summary>
    public static ShootoutProgress PlayAuto(
        uint baseSeed,
        IReadOnlyList<Taker> homeTakers, double homeGk,
        IReadOnlyList<Taker> awayTakers, double awayGk,
        GameConfig c, int maxKicks = 200)
        => ContinueAuto(new ShootoutProgress(), baseSeed, homeTakers, homeGk, awayTakers, awayGk, c, maxKicks);

    /// <summary>Continua uma disputa (possivelmente já parcialmente jogada via
    /// replay das cobranças persistidas) com cobranças 100% IA. As cobranças já
    /// presentes em <paramref name="p"/> são preservadas — replay fiel.</summary>
    public static ShootoutProgress ContinueAuto(
        ShootoutProgress p, uint baseSeed,
        IReadOnlyList<Taker> homeTakers, double homeGk,
        IReadOnlyList<Taker> awayTakers, double awayGk,
        GameConfig c, int maxKicks = 200)
    {
        while (p.Winner is null && p.Kicks.Count < maxKicks)
        {
            int idx = p.NextIndex;
            string side = p.NextSide;
            IReadOnlyList<Taker> takers = side == "home" ? homeTakers : awayTakers;
            Taker taker = takers[(side == "home" ? p.KicksHome : p.KicksAway) % takers.Count];
            double gkOvr = side == "home" ? awayGk : homeGk;
            var rng = new Rng(KickSeed(baseSeed, idx));
            string zone = AiShoot(rng);
            string gkZone = AiGuess(rng, zone, c);
            bool scored = Scored(zone, gkZone, taker.Shooting, gkOvr, c, rng);
            p.ApplyAndCheck(new ShootoutKick(idx, side, taker.Id, taker.Name, zone, gkZone,
                Outcome(scored, zone, gkZone), scored), c.PK_ROUNDS);
        }
        return p;
    }
}

/// <summary>
/// Estado mutável de uma disputa em andamento (placar, cobranças, morte súbita).
/// Reconstrutível por replay das cobranças persistidas.
/// </summary>
public sealed class ShootoutProgress
{
    public int ScoreHome { get; private set; }
    public int ScoreAway { get; private set; }
    public int KicksHome { get; private set; }
    public int KicksAway { get; private set; }
    public bool Sudden { get; private set; }
    public string? Winner { get; private set; }   // "home"|"away"|null
    public List<ShootoutKick> Kicks { get; } = new();

    public int NextIndex => Kicks.Count;
    public string NextSide => NextIndex % 2 == 0 ? "home" : "away";

    public IReadOnlyList<string> DotsHome
        => Kicks.Where(k => k.Side == "home").Select(k => k.Scored ? "goal" : "miss").ToList();
    public IReadOnlyList<string> DotsAway
        => Kicks.Where(k => k.Side == "away").Select(k => k.Scored ? "goal" : "miss").ToList();

    /// <summary>Aplica a cobrança e reavalia a decisão (mesma sequência do solo:
    /// checa decisão e só então liga a morte súbita). Define Winner se decidiu.</summary>
    public string? ApplyAndCheck(ShootoutKick k, int rounds)
    {
        Kicks.Add(k);
        if (k.Side == "home") { if (k.Scored) ScoreHome++; KicksHome++; }
        else { if (k.Scored) ScoreAway++; KicksAway++; }

        bool regOver = KicksHome >= rounds && KicksAway >= rounds;
        bool suddenForCheck = Sudden || (regOver && KicksHome == KicksAway);
        string? dec = ShootoutEngine.Decided(ScoreHome, ScoreAway, KicksHome, KicksAway, suddenForCheck, rounds);
        if (!Sudden && regOver) Sudden = true;
        if (dec is not null) Winner = dec;
        return dec;
    }
}
