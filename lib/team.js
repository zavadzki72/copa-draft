/* ============================================================
   COPA DRAFT — lib/team.js
   Squad → lineup helpers, the dice-draft slot system, opponent
   generation, knockout bracket. The player's team is a custom
   "dream team" drafted player-by-player across many selections.
   ============================================================ */
(function () {
  const byOvr = (a, b) => b.overall - a.overall;

  function withAttrs(p) {
    return { ...p, attrs: window.DERIVE.deriveAttrs(p) };
  }

  function squadAvg(squad) {
    const top = [...squad.players].sort(byOvr).slice(0, 11);
    return Math.round(top.reduce((s, p) => s + p.overall, 0) / top.length);
  }

  function byGroup(players) {
    const g = { GOL: [], ZAG: [], LAT: [], MEI: [], ATA: [] };
    players.forEach(p => g[p.pos].push(p));
    Object.values(g).forEach(arr => arr.sort(byOvr));
    return g;
  }

  // best XI for a formation (used for AI opponents)
  function bestXI(squad, formation) {
    const need = window.CONFIG.FORMATIONS[formation];
    const g = byGroup(squad.players);
    const xi = [];
    Object.keys(need).forEach(pos => xi.push(...g[pos].slice(0, need[pos])));
    return xi.map(withAttrs);
  }

  // ----- DICE DRAFT -----
  // ordered slot queue: the starting XI (by formation) then the bench
  function draftSlots(formation) {
    const need = window.CONFIG.FORMATIONS[formation];
    const order = ['GOL', 'ZAG', 'LAT', 'MEI', 'ATA'];
    const slots = [];
    order.forEach(pos => { for (let i = 0; i < need[pos]; i++) slots.push({ pos, group: 'xi' }); });
    window.CONFIG.DRAFT_BENCH.forEach(b => slots.push({ pos: b.pos, allow: b.allow, group: 'bench' }));
    return slots.map((s, i) => ({ ...s, idx: i }));
  }

  function slotLabel(slot) {
    const L = window.CONFIG.POS_LABEL;
    return (slot.group === 'bench' ? 'Reserva · ' : '') + L[slot.pos];
  }

  // which players of a drawn squad can fill this slot (excluding already-picked ids)
  function eligible(slot, squad, takenIds) {
    return squad.players
      .filter(p => (slot.allow ? slot.allow.includes(p.pos) : p.pos === slot.pos))
      .filter(p => !takenIds.has(p.id))
      .map(withAttrs)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }

  // pitch layout rows (back -> front)
  function formationRows(formation) {
    const need = window.CONFIG.FORMATIONS[formation];
    const defRow = [];
    for (let i = 0; i < need.LAT; i++) defRow.push('LAT');
    const insertAt = Math.ceil(defRow.length / 2);
    defRow.splice(insertAt, 0, ...Array(need.ZAG).fill('ZAG'));
    return [
      Array(need.GOL).fill('GOL'),
      defRow,
      Array(need.MEI).fill('MEI'),
      Array(need.ATA).fill('ATA'),
    ];
  }

  // pick N distinct opponent squads, ascending strength (ramping difficulty)
  function drawOpponents(rng, n) {
    const shuffled = [...window.SQUADS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const chosen = shuffled.slice(0, n);
    chosen.sort((a, b) => squadAvg(a) - squadAvg(b));
    return chosen;
  }

  function buildBracket(rng) {
    const rounds = window.CONFIG.ROUNDS;
    const opps = drawOpponents(rng, rounds.length);
    return rounds.map((r, i) => ({
      ...r, opponent: opps[i], oppAvg: squadAvg(opps[i]), played: false, log: null,
    }));
  }

  // sides for the engine
  function makeSide(squad, starters, formation, key) {
    return { key, name: squad.team, code: squad.code, cup: squad.cup, formation, starters };
  }
  function makeDreamSide(starters, formation, key) {
    return { key, name: window.CONFIG.TEAM_NAME, code: null, cup: null, dream: true, formation, starters };
  }

  // ----- FATIGUE (Phase 2) -----
  // squadState: { [playerId]: fatiguePoints }
  function initFatigue(players) {
    const s = {};
    players.forEach(p => { s[p.id] = 0; });
    return s;
  }
  function fatigueOf(state, id) { return state[id] || 0; }

  // effective overall after fatigue (clamped to a sane floor)
  function effOverall(player, state) {
    return Math.max(40, player.overall - fatigueOf(state, player.id));
  }

  // 0..100 energy for display
  function staminaPct(fatigue) {
    const C = window.CONFIG;
    return Math.max(C.STAMINA_FLOOR, Math.round(100 - fatigue * C.STAMINA_PER_PT));
  }
  function staminaLevel(fatigue) {
    const pct = staminaPct(fatigue);
    return pct >= 75 ? 'fresh' : pct >= 45 ? 'tired' : 'spent';
  }

  // after a match: starters accumulate fatigue (more if 30+, +ET bump),
  // unused reserves recover. Returns a NEW state object.
  function updateFatigue(state, starters, bench, extraTime) {
    const C = window.CONFIG;
    const next = { ...state };
    const startedIds = new Set(starters.map(p => p.id));
    starters.forEach(p => {
      const cost = (p.age >= C.FATIGUE_OLD_AGE ? C.FATIGUE_OLD : C.FATIGUE_YOUNG) + (extraTime ? C.ET_FATIGUE_BUMP : 0);
      next[p.id] = Math.min(C.FATIGUE_MAX, fatigueOf(next, p.id) + cost);
    });
    bench.forEach(p => {
      if (!startedIds.has(p.id)) next[p.id] = Math.max(0, fatigueOf(next, p.id) - C.FATIGUE_REST_RECOVERY);
    });
    return next;
  }

  // attach .fatigue to each starter so the pure engine can read it
  function applyFatigue(players, state) {
    return players.map(p => ({ ...p, fatigue: fatigueOf(state, p.id) }));
  }

  // ----- PRESSURE (Phase 3) -----
  // sub-23 players lose roundN * PRESSURE_PER_ROUND effective overall;
  // a leader anywhere in the XI halves it.
  function pressureOf(player, roundN, hasLeader) {
    const C = window.CONFIG;
    if (player.age >= C.PRESSURE_U_AGE) return 0;
    let pen = (roundN || 0) * C.PRESSURE_PER_ROUND;
    if (hasLeader && C.LEADER_HALVES_PRESSURE) pen = Math.round(pen / 2);
    return pen;
  }
  // full in-match effective overall: base − fatigue − pressure (floored)
  function effInMatch(player, state, roundN, hasLeader) {
    return Math.max(40, player.overall - fatigueOf(state, player.id) - pressureOf(player, roundN, hasLeader));
  }

  window.TEAM = {
    withAttrs, squadAvg, byGroup, bestXI,
    draftSlots, slotLabel, eligible,
    formationRows, drawOpponents, buildBracket, makeSide, makeDreamSide,
    initFatigue, fatigueOf, effOverall, staminaPct, staminaLevel, updateFatigue, applyFatigue,
    pressureOf, effInMatch,
  };
})();
