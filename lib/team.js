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
    const prefix = slot.group === 'bench' ? window.I18N.t('ui.draft.reservePrefix') : '';
    return prefix + window.I18N.t('pos.' + slot.pos);
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

  // ----- DRAFT DRAW BIAS (Feature 5) -----
  // a small, configurable weight so stronger selections (by squad average)
  // come up a touch more often on the die. bias 0 => uniform (weight 1).
  // No selection is ever excluded: the floor keeps every weight positive.
  function squadDrawWeight(squad, config, pool) {
    const C = config || window.CONFIG;
    const bias = C.DRAFT_STRENGTH_BIAS || 0;
    if (!bias) return 1;
    const all = pool || window.SQUADS;
    const mean = all.reduce((s, sq) => s + squadAvg(sq), 0) / all.length;
    return Math.max(0.05, 1 + bias * (squadAvg(squad) - mean));
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

  // ----- PHASE STRENGTH SCALING (Feature 1a) -----
  // Normalise a squad's average into 0..1 across the pool (0 = weakest).
  function squadStrengthT(squad, pool) {
    const avgs = pool.map(squadAvg);
    const min = Math.min(...avgs), max = Math.max(...avgs);
    if (max === min) return 0.5;
    return (squadAvg(squad) - min) / (max - min);
  }
  // target strength (0..1) for a phase key ('grupos' or a ROUND id).
  function phaseTarget(phaseKey, config) {
    const ps = (config || window.CONFIG).PHASE_STRENGTH || {};
    return ps[phaseKey] != null ? ps[phaseKey] : 0.5;
  }
  // weight that peaks when the squad sits at the phase's target strength;
  // OPP_STRENGTH_BIAS sharpens the peak (0 => uniform).
  function phaseWeight(squad, pool, target, bias) {
    const t = squadStrengthT(squad, pool);
    return Math.exp(-(bias || 0) * Math.abs(t - target));
  }
  // Draw one distinct opponent per phase key, scaling strength by phase, all
  // from the SEEDED rng (deterministic). excludeIds keeps a campaign's group
  // rivals and knockout opponents from repeating (best-effort within the pool).
  function drawScaledOpponents(rng, phaseKeys, excludeIds, config) {
    const C = config || window.CONFIG;
    const pool = window.SQUADS;
    const bias = C.OPP_STRENGTH_BIAS || 0;
    // precompute each squad's normalised strength (0..1) ONCE — the pool can be
    // large, so we must not recompute averages per weight lookup.
    const avgById = new Map();
    let min = Infinity, max = -Infinity;
    pool.forEach(sq => { const a = squadAvg(sq); avgById.set(sq.id, a); if (a < min) min = a; if (a > max) max = a; });
    const span = max - min;
    const tOf = sq => (span === 0 ? 0.5 : (avgById.get(sq.id) - min) / span);
    const exclude = new Set(excludeIds || []);
    let avail = pool.filter(s => !exclude.has(s.id));
    const chosen = [];
    phaseKeys.forEach(key => {
      if (!avail.length) avail = pool.slice();   // ran out of distinct squads — reuse the pool
      const target = phaseTarget(key, C);
      const items = avail.map(sq => ({ item: sq, w: Math.exp(-bias * Math.abs(tOf(sq) - target)) }));
      const pick = rng.weighted(items);
      chosen.push(pick);
      avail = avail.filter(s => s.id !== pick.id);
    });
    return chosen;
  }

  function buildBracket(rng, excludeIds) {
    const rounds = window.CONFIG.ROUNDS;
    const opps = drawScaledOpponents(rng, rounds.map(r => r.id), excludeIds);
    return rounds.map((r, i) => ({
      ...r, opponent: opps[i], oppAvg: squadAvg(opps[i]), played: false, log: null,
    }));
  }

  // ----- GROUP STAGE (Feature 1b) -----
  // round-robin fixtures for the given team ids (circle method). The player id
  // 'me' is one of the entries. Returns [{ round, home, away, isPlayer }].
  function roundRobin(teamIds) {
    const ids = teamIds.slice();
    if (ids.length % 2 !== 0) ids.push(null);     // bye (not expected for even GROUP_SIZE)
    const n = ids.length;
    const rounds = n - 1, half = n / 2;
    const arr = ids.slice();
    const fixtures = [];
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < half; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (a == null || b == null) continue;
        // alternate home/away by round for a fairer schedule
        const home = (r % 2 === 0) ? a : b;
        const away = (r % 2 === 0) ? b : a;
        fixtures.push({ round: r, home, away, isPlayer: home === 'me' || away === 'me' });
      }
      // rotate all but the first element
      arr.splice(1, 0, arr.pop());
    }
    return fixtures;
  }

  // build a group: GROUP_SIZE-1 rivals drawn from the weakest pool (phase
  // 'grupos'), plus the round-robin schedule. Deterministic given the rng.
  function buildGroup(rng, excludeIds, config) {
    const C = config || window.CONFIG;
    const nRivals = C.GROUP_SIZE - 1;
    const rivals = drawScaledOpponents(rng, Array(nRivals).fill('grupos'), excludeIds, C);
    const teams = ['me', ...rivals.map(r => r.id)];
    const fixtures = roundRobin(teams);
    return { rivals, teams, fixtures };
  }

  // PURE: compute the ordered standings table from played fixtures.
  // Tiebreakers: points -> goal difference -> goals for -> stable draw order.
  function groupStandings(group, config) {
    const C = config || window.CONFIG;
    const pts = C.GROUP_POINTS;
    const table = {};
    group.teams.forEach((id, i) => {
      table[id] = { teamRef: id, order: i, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, P: 0 };
    });
    group.fixtures.forEach(fx => {
      if (!fx.result) return;
      const H = table[fx.home], A = table[fx.away];
      if (!H || !A) return;
      const hg = fx.result.home, ag = fx.result.away;
      H.J++; A.J++; H.GP += hg; H.GC += ag; A.GP += ag; A.GC += hg;
      if (hg > ag) { H.V++; A.D++; H.P += pts.win; A.P += pts.loss; }
      else if (ag > hg) { A.V++; H.D++; A.P += pts.win; H.P += pts.loss; }
      else { H.E++; A.E++; H.P += pts.draw; A.P += pts.draw; }
    });
    Object.values(table).forEach(r => { r.SG = r.GP - r.GC; });
    return Object.values(table).sort((a, b) =>
      b.P - a.P || b.SG - a.SG || b.GP - a.GP || a.order - b.order);
  }

  // sides for the engine
  function makeSide(squad, starters, formation, key) {
    return { key, name: squad.team, code: squad.code, cup: squad.cup, formation, starters };
  }
  function makeDreamSide(starters, formation, key, bench, subsLeft) {
    const name = window.I18N ? window.I18N.t('team.name') : window.CONFIG.TEAM_NAME;
    return { key, name, code: null, cup: null, dream: true,
      formation, starters, bench: bench || [], subsLeft: subsLeft || 0 };
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

  // ----- CAMPAIGN STATUS (suspension / injury) -----
  // status: { [playerId]: { suspended: nMatches, injured: nPhases } }
  // deterministic injury length from the match seed + player id
  function injuryDuration(seed, id, config) {
    const h = window.RNG.seedFrom('inj-' + seed + '-' + id);
    const span = config.INJURY_PHASES_MAX - config.INJURY_PHASES_MIN + 1;
    return config.INJURY_PHASES_MIN + (h % span);
  }

  // a match/phase has passed: decrement everyone, then apply this match's
  // sending-offs and injuries (player's HOME side only). Returns a NEW map.
  function advancePlayerStatus(status, log, config) {
    const next = {};
    Object.keys(status || {}).forEach(id => {
      const s = status[id] || {};
      const suspended = Math.max(0, (s.suspended || 0) - 1);
      const injured = Math.max(0, (s.injured || 0) - 1);
      if (suspended > 0 || injured > 0) next[id] = { suspended, injured };
    });
    (log.sentOff || []).filter(e => e.side === 'home').forEach(e => {
      next[e.id] = { suspended: config.SUSPENSION_MATCHES, injured: (next[e.id] && next[e.id].injured) || 0 };
    });
    (log.injuries || []).filter(e => e.side === 'home').forEach(e => {
      next[e.id] = { suspended: (next[e.id] && next[e.id].suspended) || 0, injured: injuryDuration(log.seed, e.id, config) };
    });
    return next;
  }

  // null when available, else { kind:'suspended'|'injured', n }
  function statusOf(status, id) {
    const s = (status || {})[id];
    if (!s) return null;
    if (s.suspended > 0) return { kind: 'suspended', n: s.suspended };
    if (s.injured > 0) return { kind: 'injured', n: s.injured };
    return null;
  }

  window.TEAM = {
    withAttrs, squadAvg, byGroup, bestXI,
    draftSlots, slotLabel, eligible,
    squadDrawWeight,
    squadStrengthT, phaseTarget, phaseWeight, drawScaledOpponents,
    roundRobin, buildGroup, groupStandings,
    formationRows, drawOpponents, buildBracket, makeSide, makeDreamSide,
    initFatigue, fatigueOf, effOverall, staminaPct, staminaLevel, updateFatigue, applyFatigue,
    pressureOf, effInMatch,
    injuryDuration, advancePlayerStatus, statusOf,
  };
})();
