/* ============================================================
   COPA DRAFT — lib/derive.js
   Derive the six FIFA-style attributes from
   (overall + position + archetype) with DETERMINISTIC offsets.
   Never hand-authored. Clamped to [ATTR_MIN, ATTR_MAX].

   Calibration anchors (from spec):
     • velocista ATA : pace = overall+4, defending = overall-45
     • muralha  ZAG  : defending = overall+3, pace = overall-10
   ============================================================ */
(function () {
  const POS = {
    GOL: { pace: -22, shooting: -38, passing: -12, dribbling: -28, defending: -4,  physical: 0 },
    ZAG: { pace: -6,  shooting: -26, passing: -8,  dribbling: -16, defending: -2,  physical: 5 },
    LAT: { pace: 5,   shooting: -16, passing: 0,   dribbling: -2,  defending: -6,  physical: 0 },
    MEI: { pace: -2,  shooting: -6,  passing: 6,   dribbling: 2,   defending: -8,  physical: -2 },
    ATA: { pace: -2,  shooting: 6,   passing: -6,  dribbling: 4,   defending: -40, physical: -2 },
  };

  const ARCH = {
    craque:      { dribbling: 6, passing: 4, shooting: 3, pace: 1 },
    velocista:   { pace: 6, defending: -5, dribbling: 3, physical: -2 },
    cerebral:    { passing: 8, dribbling: 2, pace: -4, defending: 1 },
    muralha:     { defending: 5, physical: 6, pace: -4, dribbling: -6 },
    motorzinho:  { physical: 6, defending: 4, pace: 2, shooting: -3 },
    finalizador: { shooting: 9, dribbling: 2, defending: -6, pace: 1 },
    lider:       { passing: 3, defending: 3, physical: 4 },
  };

  const KEYS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];

  function clamp(v) {
    const C = window.CONFIG;
    return Math.max(C.ATTR_MIN, Math.min(C.ATTR_MAX, Math.round(v)));
  }

  function deriveAttrs(player) {
    const pos = POS[player.pos] || POS.MEI;
    const arch = ARCH[player.archetype] || {};
    const out = {};
    for (const k of KEYS) {
      out[k] = clamp(player.overall + (pos[k] || 0) + (arch[k] || 0));
    }
    return out;
  }

  // Attribute labels are localized: each key resolves from window.I18N at
  // access time (short label for the bars, full label for the tutorial).
  const ATTR_LABELS = {};
  const ATTR_FULL = {};
  KEYS.forEach(k => {
    Object.defineProperty(ATTR_LABELS, k, { enumerable: true, get() { return window.I18N.t('attr.' + k + '.short'); } });
    Object.defineProperty(ATTR_FULL, k, { enumerable: true, get() { return window.I18N.t('attr.' + k + '.full'); } });
  });

  window.DERIVE = { deriveAttrs, ATTR_LABELS, ATTR_FULL, KEYS };
})();
