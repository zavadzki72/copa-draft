/* ============================================================
   COPA DRAFT — config.js
   ALL balance constants live here. Tune freely without touching
   engine logic. The engine reads everything from window.CONFIG.
   ============================================================ */
window.CONFIG = {
  /* ---------- Match engine ---------- */
  BASE_LAMBDA: 1.35,      // base expected goals scalar
  LAMBDA_EXP: 1.6,        // attack/defense ratio exponent
  ZEBRA_Z: 0.25,          // "dia" form multiplier amplitude: day = 1 + rand(-z,+z)
  MINUTES: 90,            // regulation minutes
  ET_MINUTES: 30,         // extra time total (15 + 15)
  ET_LAMBDA_SCALE: 30 / 90, // expected-goals scaling for the shorter ET period
  ET_FATIGUE_BUMP: 1,     // extra fatigue applied in ET (Phase 2 hook)

  EVENTS_MIN: 6,          // min non-goal narration events per match
  EVENTS_MAX: 10,         // max non-goal narration events per match

  /* attribute clamp */
  ATTR_MIN: 30,
  ATTR_MAX: 99,

  /* ---------- Ratings (section 9) ---------- */
  RATING_BASE: 6.0,
  RATING_GOAL: 1.0,
  RATING_ASSIST: 0.5,
  RATING_SAVE: 0.4,       // GK only
  RATING_BIGCHANCE: 0.3,  // big-chance involvement
  RATING_CONCEDE: -0.3,   // per goal conceded, to GK + ZAG/LAT
  RATING_NOISE: 0.3,      // ± random noise
  RATING_RED: -1.5,       // sending-off penalty applied to the offender's rating
  RATING_MIN: 4.0,
  RATING_MAX: 10.0,

  /* ---------- Captain & chemistry boost ----------
     The chosen captain performs above himself, and lifts teammates drafted
     from his SAME historical selection (same team + cup) — reward for building
     a core around one squad. Applied to effective overall in the match. */
  CAPTAIN_OVR_BOOST: 4,     // o capitão ganha +N de overall efetivo
  CHEMISTRY_OVR_BOOST: 2,   // parceiros da mesma seleção do capitão ganham +N

  /* ---------- Pressure (youth) — Phase 3 ---------- */
  PRESSURE_PER_ROUND: 2,  // sub-23 perdem rodada*2 de overall efetivo
  PRESSURE_U_AGE: 23,
  LEADER_HALVES_PRESSURE: true,  // um líder em campo reduz a pressão pela metade

  /* ---------- Fatigue (age) — Phase 2 ---------- */
  FATIGUE_OLD_AGE: 30,
  FATIGUE_OLD: 2,         // 30+ : +2 cansaço por jogo disputado
  FATIGUE_YOUNG: 1,       // <30 : +1 cansaço por jogo disputado
  // reserva que fica de fora da partida descansa por INTEIRO (cansaço zera)
  FATIGUE_MAX: 14,        // teto de cansaço acumulado (afeta só a barra de energia)
  FATIGUE_PENALTY_MAX: 5, // teto da PENALIDADE de cansaço no overall efetivo (mais leve)
  STAMINA_PER_PT: 7,      // % de energia perdida por ponto de cansaço (display)
  STAMINA_FLOOR: 12,      // energia mínima exibida
  SUBS_MAX: 3,            // substituições de rodízio permitidas por partida

  /* ---------- Penalty shootout (interactive) — Phase 2 ---------- */
  PK_ROUNDS: 5,                       // série inicial antes da morte súbita
  PK_ZONES: ['esq', 'meio', 'dir'],   // cantos de cobrança/defesa
  PK_BASE_SCORE: 0.90,                // gol quando o goleiro vai pro lado errado
  PK_FINISH_BONUS: 0.18,              // peso da finalização do cobrador
  PK_SAVE_BASE: 0.55,                 // chance de defesa quando o goleiro acerta o lado
  PK_GK_WEIGHT: 0.22,                 // peso do overall do goleiro na defesa
  PK_AI_READ: 0.30,                   // o quanto a IA "lê" o canto do cobrador

  /* ---------- Match events with impact (red card, penalty, injury) ---------- */
  /* All chances are evaluated minute-by-minute with the SEEDED rng, so the
     auto-simulated match stays deterministic. Tune freely. */
  FOUL_PM: 0.05,            // relevant-foul chance per minute, per side (base for cards)
  FOUL_YELLOW_P: 0.22,      // given a foul, chance it becomes a yellow card
  FOUL_RED_P: 0.012,        // given a foul, chance it becomes a straight red card
  // a 2nd yellow to the same player in a match = sending off (rule, no constant)
  PENALTY_PM: 0.0016,       // penalty chance per minute, per side (~0.14 per 90')
  PEN_CONVERT_BASE: 0.78,   // base conversion of a seeded in-match penalty
  INJURY_PM: 0.0009,        // injury chance per minute, per side (rare, ~0.08 per 90')
  MAN_DOWN_ATK: 0.82,       // attack scalar for a side reduced to 10 men
  MAN_DOWN_DEF: 0.86,       // defense scalar for a side reduced to 10 men (raises opp. λ)

  /* ---------- Campaign consequences (carry across phases) ---------- */
  SUSPENSION_MATCHES: 1,    // a sending-off suspends the player for the next N matches
  INJURY_PHASES_MIN: 1,     // an injury rules a player out for MIN..MAX phases
  INJURY_PHASES_MAX: 2,

  /* ---------- Campaign awards (end-of-cup stats) ---------- */
  AWARD_MIN_MATCHES: 2,     // minimum matches played to qualify for "best player"

  /* ---------- Formations ---------- */
  FORMATIONS: {
    '4-3-3': { GOL: 1, ZAG: 2, LAT: 2, MEI: 3, ATA: 3 },
    '4-4-2': { GOL: 1, ZAG: 2, LAT: 2, MEI: 4, ATA: 2 },
    '3-5-2': { GOL: 1, ZAG: 3, LAT: 0, MEI: 5, ATA: 2 },
    '4-5-1': { GOL: 1, ZAG: 2, LAT: 2, MEI: 5, ATA: 1 },
    '5-3-2': { GOL: 1, ZAG: 3, LAT: 2, MEI: 3, ATA: 2 },
    '3-4-3': { GOL: 1, ZAG: 3, LAT: 0, MEI: 4, ATA: 3 },
  },

  /* bench: one reserve per position group, min 4 */
  BENCH_GROUPS: ['GOL', 'ZAG', 'LAT', 'MEI', 'ATA'],
  BENCH_MIN: 4,

  /* ---------- Draft (dice rolls per slot) ---------- */
  TEAM_NAME: 'Time dos Sonhos',
  // bench slots drafted after the XI — one reserve per group (min 4)
  DRAFT_BENCH: [
    { pos: 'GOL' },
    { pos: 'DEF', allow: ['ZAG', 'LAT'] },
    { pos: 'MEI' },
    { pos: 'ATA' },
  ],
  POS_LABEL: { GOL: 'Goleiro', ZAG: 'Zagueiro', LAT: 'Lateral', MEI: 'Meio-campo', ATA: 'Atacante', DEF: 'Defensor' },

  /* ---------- Knockout campaign ---------- */
  ROUNDS: [
    { id: 'oitavas', label: 'Oitavas de final', short: 'Oitavas', n: 1 },
    { id: 'quartas', label: 'Quartas de final', short: 'Quartas', n: 2 },
    { id: 'semi',    label: 'Semifinal',        short: 'Semi',    n: 3 },
    { id: 'final',   label: 'Final',            short: 'Final',   n: 4 },
  ],

  /* ---------- Group stage (before the knockout) ---------- */
  GROUP_SIZE: 4,                                  // teams per group (player + GROUP_SIZE-1 rivals)
  GROUP_QUALIFY: 2,                               // top-N advance to the knockout
  GROUP_POINTS: { win: 3, draw: 1, loss: 0 },     // points per result for the table

  /* ---------- Opponent strength scaling by phase ----------
     Each phase pulls opponents toward a target spot in the squad-strength
     range (0 = weakest pool, 1 = strongest). The group is the softest pool;
     difficulty ramps up to the final. OPP_STRENGTH_BIAS sharpens the seeded
     weighting toward that target (0 = uniform draw). Keys: 'grupos' + ROUND ids. */
  PHASE_STRENGTH: { grupos: 0.12, oitavas: 0.34, quartas: 0.56, semi: 0.78, final: 1.0 },
  OPP_STRENGTH_BIAS: 5,

  /* ---------- Draft draw bias ----------
     Stronger selections (by squad average) are more likely to come up on the
     die. Higher = stronger pull toward top squads; every eligible selection
     still stays possible (weights are floored at 0.05). 0 = uniform. */
  DRAFT_STRENGTH_BIAS: 0.15,

  /* ---------- Match speed (ticker pacing only — result is unaffected) ---------- */
  MATCH_SPEEDS: {
    normal: { durationMs: 34000, label: 'Normal' },
    rapido: { durationMs: 18000, label: 'Rápido' },
    super:  { durationMs: 9000,  label: 'Super rápido' },
  },
  MATCH_SPEED_DEFAULT: 'normal',

  /* ---------- Internationalization (i18n) ---------- */
  LANGS: ['pt', 'en', 'es'],   // supported UI/narration languages
  DEFAULT_LANG: 'pt',          // fallback language (and dictionary fallback)

  /* ---------- Theme ---------- */
  THEMES: ['dark', 'light'],   // supported color themes
  DEFAULT_THEME: 'dark',       // used only when the system preference is unknown

  /* ---------- Multiplayer Online (PRD_004) ----------
     Server-authoritative mode: lobby, accounts (Google) and the tournament run
     on the .NET backend. The client only displays what the server streams. */
  MP: {
    API_BASE: '',                 // '' = same origin (nginx proxy); dev: 'http://localhost:5080'
    GOOGLE_CLIENT_ID: '',         // OAuth client id (Google Cloud Console) — required for login
    DRAFT_TIMER_SECONDS: 180,     // display only — the server enforces its own deadline
    SPEED: 'rapido',              // fixed ticker pace in MP (server clock is the authority)
    MAX_PLAYERS: 8,               // display only — server enforces via MpOptions
  },
};
