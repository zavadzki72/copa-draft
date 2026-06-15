namespace CopaDraft.Engine;

/// <summary>
/// Mirror of the balance constants in <c>config.js</c> that the deterministic
/// engine and tournament generator read. Property names intentionally keep the
/// SCREAMING_CASE of config.js to make JS↔C# parity auditing trivial — every
/// value here MUST match config.js, or determinism breaks.
/// </summary>
public sealed class GameConfig
{
    // ---------- Match engine ----------
    public double BASE_LAMBDA { get; init; } = 1.35;
    public double LAMBDA_EXP { get; init; } = 1.85;  // maior = força pesa mais, menos zebra
    public double ZEBRA_Z { get; init; } = 0.14;     // menor = menos zebra (amplitude do fator "dia")
    public int MINUTES { get; init; } = 90;
    public int ET_MINUTES { get; init; } = 30;
    public double ET_LAMBDA_SCALE { get; init; } = 30.0 / 90.0;

    public int EVENTS_MIN { get; init; } = 6;
    public int EVENTS_MAX { get; init; } = 10;

    // ---------- Attribute clamp ----------
    public int ATTR_MIN { get; init; } = 30;
    public int ATTR_MAX { get; init; } = 99;

    // ---------- Captain & chemistry ----------
    public int CAPTAIN_OVR_BOOST { get; init; } = 4;
    public int CHEMISTRY_OVR_BOOST { get; init; } = 2;

    // ---------- Pressure (youth) ----------
    public int PRESSURE_PER_ROUND { get; init; } = 2;
    public int PRESSURE_U_AGE { get; init; } = 23;
    public bool LEADER_HALVES_PRESSURE { get; init; } = true;

    // ---------- Fatigue (mirror de config.js) ----------
    public int FATIGUE_OLD_AGE { get; init; } = 30;
    public int FATIGUE_OLD { get; init; } = 2;     // 30+: +2 de cansaço por jogo
    public int FATIGUE_YOUNG { get; init; } = 1;   // <30: +1
    public int FATIGUE_MAX { get; init; } = 14;    // teto acumulado
    public int FATIGUE_PENALTY_MAX { get; init; } = 5;  // teto da penalidade no overall efetivo
    public int SUBS_MAX { get; init; } = 3;

    // ---------- Events with impact (red card, penalty, injury) ----------
    public double FOUL_PM { get; init; } = 0.05;
    public double FOUL_YELLOW_P { get; init; } = 0.22;
    public double FOUL_RED_P { get; init; } = 0.012;
    public double PENALTY_PM { get; init; } = 0.0016;
    public double PEN_CONVERT_BASE { get; init; } = 0.78;
    public double INJURY_PM { get; init; } = 0.0009;
    public double MAN_DOWN_ATK { get; init; } = 0.82;
    public double MAN_DOWN_DEF { get; init; } = 0.86;

    // ---------- Formations (each sums to 11) ----------
    public IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>> FORMATIONS { get; init; } =
        new Dictionary<string, IReadOnlyDictionary<string, int>>
        {
            ["4-3-3"] = new Dictionary<string, int> { ["GOL"] = 1, ["ZAG"] = 2, ["LAT"] = 2, ["MEI"] = 3, ["ATA"] = 3 },
            ["4-4-2"] = new Dictionary<string, int> { ["GOL"] = 1, ["ZAG"] = 2, ["LAT"] = 2, ["MEI"] = 4, ["ATA"] = 2 },
            ["3-5-2"] = new Dictionary<string, int> { ["GOL"] = 1, ["ZAG"] = 3, ["LAT"] = 0, ["MEI"] = 5, ["ATA"] = 2 },
            ["4-5-1"] = new Dictionary<string, int> { ["GOL"] = 1, ["ZAG"] = 2, ["LAT"] = 2, ["MEI"] = 5, ["ATA"] = 1 },
            ["5-3-2"] = new Dictionary<string, int> { ["GOL"] = 1, ["ZAG"] = 3, ["LAT"] = 2, ["MEI"] = 3, ["ATA"] = 2 },
            ["3-4-3"] = new Dictionary<string, int> { ["GOL"] = 1, ["ZAG"] = 3, ["LAT"] = 0, ["MEI"] = 4, ["ATA"] = 3 },
        };

    public IReadOnlyList<string> BENCH_GROUPS { get; init; } = new[] { "GOL", "ZAG", "LAT", "MEI", "ATA" };
    public int BENCH_MIN { get; init; } = 4;

    // ---------- Knockout rounds ----------
    public IReadOnlyList<Round> ROUNDS { get; init; } = new[]
    {
        new Round("oitavas", "Oitavas de final", "Oitavas", 1),
        new Round("quartas", "Quartas de final", "Quartas", 2),
        new Round("semi",    "Semifinal",        "Semi",    3),
        new Round("final",   "Final",            "Final",   4),
    };

    // ---------- Group stage ----------
    public int GROUP_SIZE { get; init; } = 4;
    public int GROUP_QUALIFY { get; init; } = 2;
    public GroupPoints GROUP_POINTS { get; init; } = new();

    // ---------- Opponent strength scaling by phase ----------
    public IReadOnlyDictionary<string, double> PHASE_STRENGTH { get; init; } =
        new Dictionary<string, double>
        {
            ["grupos"] = 0.12, ["oitavas"] = 0.34, ["quartas"] = 0.56, ["semi"] = 0.78, ["final"] = 1.0,
        };
    public double OPP_STRENGTH_BIAS { get; init; } = 7;  // mais alto = seleções mais fortes/conhecidas nas fases finais

    // ---------- Draft draw bias ----------
    public double DRAFT_STRENGTH_BIAS { get; init; } = 0.15;

    /// <summary>Shared default config mirroring config.js.</summary>
    public static GameConfig Default { get; } = new();
}

/// <summary>Points awarded per group-stage result (mirror of GROUP_POINTS).</summary>
public sealed record GroupPoints
{
    public int Win { get; init; } = 3;
    public int Draw { get; init; } = 1;
    public int Loss { get; init; } = 0;
}

/// <summary>A knockout round descriptor (mirror of an entry in CONFIG.ROUNDS).</summary>
public sealed record Round(string Id, string Label, string Short, int N);
