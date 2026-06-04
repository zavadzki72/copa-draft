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
  RATING_MIN: 4.0,
  RATING_MAX: 10.0,

  /* ---------- Pressure (youth) — Phase 3 ---------- */
  PRESSURE_PER_ROUND: 2,  // sub-23 perdem rodada*2 de overall efetivo
  PRESSURE_U_AGE: 23,
  LEADER_HALVES_PRESSURE: true,  // um líder em campo reduz a pressão pela metade

  /* ---------- Fatigue (age) — Phase 2 ---------- */
  FATIGUE_OLD_AGE: 30,
  FATIGUE_OLD: 2,         // 30+ : +2 cansaço por jogo disputado
  FATIGUE_YOUNG: 1,       // <30 : +1 cansaço por jogo disputado
  FATIGUE_REST_RECOVERY: 2, // reserva não utilizado recupera por rodada
  FATIGUE_MAX: 14,        // teto de cansaço acumulado
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
};
