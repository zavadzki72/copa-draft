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

    /// <summary>Canonical ticker pace for MP matches (ms per simulated minute).
    /// Fallback — o valor efetivo vem da velocidade escolhida na sala.</summary>
    public int PaceMsPerMinute { get; set; } = 250;

    /// <summary>Velocidades selecionáveis no lobby (nome → ms por minuto simulado).</summary>
    public Dictionary<string, int> Speeds { get; set; } = new()
    {
        ["normal"] = 375,   // ~34s por partida
        ["rapido"] = 250,   // ~22s
        ["super"] = 125,    // ~11s
    };

    public string DefaultSpeed { get; set; } = "rapido";

    public int PaceFor(string? speed)
        => speed is not null && Speeds.TryGetValue(speed, out int ms) ? ms : PaceMsPerMinute;

    /// <summary>Níveis selecionáveis no lobby (nome → alvo de força 0..1 das
    /// seleções de IA que preenchem a copa). Quanto maior o alvo, mais fortes e
    /// conhecidas as seleções adversárias. 'normal' espelha o antigo alvo da
    /// fase de grupos (PHASE_STRENGTH["grupos"] = 0.12).</summary>
    public Dictionary<string, double> Levels { get; set; } = new()
    {
        ["facil"] = 0.05,    // seleções fracas/obscuras
        ["normal"] = 0.12,   // equilíbrio (comportamento padrão anterior)
        ["dificil"] = 0.45,  // seleções fortes
        ["lenda"] = 0.80,    // os gigantes históricos
    };

    public string DefaultLevel { get; set; } = "normal";

    /// <summary>Alvo de força das seleções de IA para o nível, ou null (cai no
    /// alvo da fase de grupos) quando o nível é desconhecido.</summary>
    public double? AiStrengthTargetFor(string? level)
        => level is not null && Levels.TryGetValue(level, out double t) ? t : null;

    /// <summary>Modos de draft selecionáveis no lobby. Puramente client-side
    /// (re-rolls, espiar overs, draft às cegas); o servidor só valida e propaga.</summary>
    public HashSet<string> Modes { get; set; } = new() { "classico", "medium", "almanaque" };

    public string DefaultMode { get; set; } = "classico";

    /// <summary>Pause between rounds so players can read tables/bracket.</summary>
    public int InterRoundSeconds { get; set; } = 5;

    /// <summary>Ready-gate antes de cada rodada: ela só começa quando todos os
    /// humanos vivos/conectados clicam "iniciar" — ou após este timeout.</summary>
    public int RoundReadySeconds { get; set; } = 60;
}
