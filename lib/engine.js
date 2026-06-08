/* ============================================================
   COPA DRAFT — lib/engine.js
   PURE minute-by-minute match engine.
   Input:  two sides + config + numeric seed  ->  Output: match log.
   No DOM, no globals mutated. Same input => same log (testable,
   server-side ready). The minute loop is a single CAUSAL timeline:
   goals AND impactful events (cards → sending-off → playing a man
   down) share the same pass, and a red card lowers the offending
   side's effective strength for the rest of the match.

   i18n (generate-time): narration templates are read from
   window.I18N in the CURRENT language at simulation time, so
   `event.text` is a ready string. Because narration arrays have the
   SAME LENGTH across languages, rng.pick draws the same variant index
   in any language → the RESULT is identical regardless of language
   (determinism preserved). Flow decisions never read `event.text`:
   milestone events carry a stable semantic `key` instead.

   side = {
     key:'home'|'away', name, code, cup,
     starters:[player,...],   // exactly 11, each player has .pos
     formation:'4-3-3'
   }
   ============================================================ */
(function () {
  // ---- narration accessors (read the current language at call time) ----
  // narr(key) -> template array for rng.pick; ntxt(key, vars) -> filled string.
  function narr(key) { return window.I18N.arr('narration.' + key); }
  function ntxt(key, vars) { return window.I18N.t('narration.' + key, vars); }
  function gkName(gk) { return gk ? gk.name : window.I18N.t('narration.gkFallback'); }

  function group(starters) {
    const g = { GOL: [], ZAG: [], LAT: [], MEI: [], ATA: [] };
    starters.forEach(p => (g[p.pos] || g.MEI).push(p));
    return g;
  }
  const avg = (arr) => arr.length ? arr.reduce((s, p) => s + p.eff, 0) / arr.length : 70;

  // effective overall = base, minus optional pressure/fatigue modifiers,
  // plus the captain & same-selection chemistry boost (dream side only).
  function effective(p, ctx) {
    const C = ctx.config;
    let v = p.overall;
    if (ctx.pressure && p.age < C.PRESSURE_U_AGE) {
      let pen = ctx.roundN * C.PRESSURE_PER_ROUND;
      if (ctx.hasLeader && C.LEADER_HALVES_PRESSURE) pen /= 2;
      v -= pen;
    }
    if (ctx.fatigue && p.fatigue) {
      v -= (C.FATIGUE_PENALTY_MAX != null ? Math.min(C.FATIGUE_PENALTY_MAX, p.fatigue) : p.fatigue);
    }
    if (ctx.captain) {
      const cap = ctx.captain;
      if (p.id === cap.id) v += C.CAPTAIN_OVR_BOOST || 0;
      else if (p.team === cap.team && p.cup === cap.cup) v += C.CHEMISTRY_OVR_BOOST || 0;
    }
    return v;
  }

  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : '');
  }

  // weighted scorer / assister / fouler selection (reads the LIVE group,
  // so a sent-off player drops out automatically)
  function scorerWeights(g) {
    const w = [];
    const push = (arr, base) => arr.forEach(p => w.push({ item: p, w: base * (p.attrs.shooting / 80) }));
    push(g.ATA, 5.0); push(g.MEI, 2.4); push(g.LAT, 0.8); push(g.ZAG, 0.6); push(g.GOL, 0.02);
    return w;
  }
  function assistWeights(g, exclude) {
    const w = [];
    const push = (arr, base) => arr.forEach(p => {
      if (p === exclude) return;
      w.push({ item: p, w: base * (p.attrs.passing / 80) });
    });
    push(g.MEI, 3.0); push(g.ATA, 2.2); push(g.LAT, 1.6); push(g.ZAG, 0.4); push(g.GOL, 0.05);
    return w;
  }
  // who tends to commit fouls — defenders & midfielders, rarely a keeper
  function foulWeights(g) {
    const w = [];
    const push = (arr, base) => arr.forEach(p => w.push({ item: p, w: base }));
    push(g.MEI, 2.4); push(g.ZAG, 2.2); push(g.LAT, 2.0); push(g.ATA, 1.0); push(g.GOL, 0.1);
    return w;
  }

  function expectedGoals(atk, def, day, C, scale) {
    return C.BASE_LAMBDA * Math.pow((atk * day) / def, C.LAMBDA_EXP) * scale;
  }

  // simulate one continuous period; mutates score/events/stats/cards/sentOff/manDown.
  // λ is recomputed each minute from the CURRENT man-down state, so a red card
  // lowers the offending side's attack and raises the opponent's chances.
  function runPeriod(opts) {
    const { rng, sides, base, day, manDown, C, scale, periodLen,
      minuteStart, minuteEnd, score, events, stats, cards, sentOff, injuries, matchPens, etTag } = opts;

    for (let m = minuteStart; m <= minuteEnd; m++) {
      // ---- goals ----
      ['home', 'away'].forEach(side => {
        const opp = side === 'home' ? 'away' : 'home';
        const curAtk = base.atk[side] * Math.pow(C.MAN_DOWN_ATK, manDown[side]);
        const curDef = base.def[opp] * Math.pow(C.MAN_DOWN_DEF, manDown[opp]);
        const rate = expectedGoals(curAtk, curDef, day[side], C, scale) / periodLen;
        if (rng.chance(rate)) {
          const g = sides[side].g;
          const sw = scorerWeights(g);
          if (!sw.length) return;
          const scorer = rng.weighted(sw);
          const hasAssist = rng.chance(0.72);
          const assist = hasAssist ? rng.weighted(assistWeights(g, scorer)) : null;
          score[side]++;
          stats[scorer.id].goals++;
          if (assist) stats[assist.id].assists++;
          let text = fill(rng.pick(narr('goal')), { player: scorer.name, team: sides[side].name, TEAM: sides[side].name.toUpperCase() });
          if (assist) text += fill(rng.pick(narr('assist')), { assist: assist.name });
          events.push({ minute: m, type: 'goal', side, etTag, text, score: { ...score },
            players: assist ? [scorer.id, assist.id] : [scorer.id] });
        }
      });

      // ---- fouls / cards (causal: a red card sends a player off for good) ----
      ['home', 'away'].forEach(side => {
        if (!rng.chance(C.FOUL_PM)) return;
        const g = sides[side].g;
        const fw = foulWeights(g);
        if (!fw.length) return;
        const off = rng.weighted(fw);
        const teamName = sides[side].name;
        let red = false, second = false, yellow = false;
        if (rng.chance(C.FOUL_RED_P)) {
          red = true;
        } else if (rng.chance(C.FOUL_YELLOW_P)) {
          yellow = true;
          stats[off.id].yellows++;
          if (stats[off.id].yellows >= 2) { red = true; second = true; }
        }
        if (red) {
          manDown[side]++;
          stats[off.id].reds = 1;
          const arr = g[off.pos];                 // remove from the live group
          const ix = arr.indexOf(off);
          if (ix >= 0) arr.splice(ix, 1);
          sentOff.push({ id: off.id, side, minute: m, secondYellow: second });
          cards.push({ id: off.id, side, minute: m, type: 'red', secondYellow: second });
          const tplArr = second ? narr('red2') : narr('red');
          events.push({ minute: m, type: 'red', side, etTag,
            text: fill(rng.pick(tplArr), { player: off.name, team: teamName }), players: [off.id] });
        } else if (yellow) {
          cards.push({ id: off.id, side, minute: m, type: 'yellow' });
          events.push({ minute: m, type: 'yellow', side, etTag,
            text: fill(rng.pick(narr('yellow')), { player: off.name, team: teamName }), players: [off.id] });
        } else {
          events.push({ minute: m, type: 'foul', side, etTag,
            text: fill(rng.pick(narr('foul')), { player: off.name, team: teamName }), players: [off.id] });
        }
      });

      // ---- injuries (rare): player leaves; a same-position reserve comes on
      //      if a sub is available, otherwise the side plays a man down ----
      ['home', 'away'].forEach(side => {
        if (!rng.chance(C.INJURY_PM)) return;
        const S = sides[side];
        const g = S.g;
        const pool = [...g.GOL, ...g.ZAG, ...g.LAT, ...g.MEI, ...g.ATA];
        if (!pool.length) return;
        const hurt = rng.pick(pool);
        const arr = g[hurt.pos];
        const ix = arr.indexOf(hurt);
        if (ix >= 0) arr.splice(ix, 1);

        let reserve = null;
        if (S.subsLeft > 0) {
          const bi = S.bench.findIndex(p => p.pos === hurt.pos);
          if (bi >= 0) {
            reserve = S.bench.splice(bi, 1)[0];
            arr.push(reserve);
            S.subsLeft--;
          }
        }
        if (!reserve) manDown[side]++;     // no like-for-like sub: down a man

        injuries.push({ id: hurt.id, side, minute: m, replacedBy: reserve ? reserve.id : null });
        let text = fill(rng.pick(narr('injury')), { player: hurt.name });
        text += reserve ? ntxt('injSub', { player: reserve.name }) : ntxt('injDown', { team: S.name });
        events.push({ minute: m, type: 'injury', side, etTag, text,
          players: reserve ? [hurt.id, reserve.id] : [hurt.id] });
      });

      // ---- penalties: a designated taker vs the opposing keeper. The outcome
      //      is SEEDED here (deterministic); the interactive UI (Phase: pênalti)
      //      may later override the player-side kick via finalizeInMatchPenalty. ----
      ['home', 'away'].forEach(side => {
        if (!rng.chance(C.PENALTY_PM)) return;
        const opp = side === 'home' ? 'away' : 'home';
        const g = sides[side].g;
        const takerPool = [...g.ATA, ...g.MEI, ...g.LAT, ...g.ZAG]; // keeper never takes
        if (!takerPool.length) return;
        const taker = takerPool.reduce((b, p) => p.attrs.shooting > b.attrs.shooting ? p : b, takerPool[0]);
        const gk = sides[opp].g.GOL[0];
        const gkOvr = gk ? gk.overall : 75;
        const teamName = sides[side].name;

        let p = C.PEN_CONVERT_BASE + (taker.attrs.shooting - 80) * 0.004 - (gkOvr - 80) * 0.005;
        p = Math.max(0.35, Math.min(0.95, p));
        const scored = rng.chance(p);
        let outcome;
        if (scored) outcome = 'goal';
        else outcome = rng.chance(Math.max(0.3, Math.min(0.8, 0.55 + (gkOvr - 80) * 0.01))) ? 'save' : 'miss';

        const penId = 'pk' + (matchPens.length + 1);
        if (outcome === 'goal') {
          score[side]++;
          stats[taker.id].goals++;
          events.push({ minute: m, type: 'goal', side, etTag, pen: true, penId,
            text: fill(rng.pick(narr('penGoal')), { player: taker.name, team: teamName }),
            score: { ...score }, players: [taker.id] });
        } else if (outcome === 'save') {
          if (gk) stats[gk.id].saves++;
          events.push({ minute: m, type: 'penalty', side, etTag, penId, outcome,
            text: fill(rng.pick(narr('penSave')), { player: taker.name, team: teamName, gk: gkName(gk) }),
            players: gk ? [gk.id, taker.id] : [taker.id] });
        } else {
          events.push({ minute: m, type: 'penalty', side, etTag, penId, outcome,
            text: fill(rng.pick(narr('penMiss')), { player: taker.name, team: teamName }),
            players: [taker.id] });
        }
        matchPens.push({ penId, side, minute: m, taker: taker.id, takerName: taker.name,
          gk: gk ? gk.id : null, outcome, scored });
      });
    }
  }

  function simulateMatch(homeSide, awaySide, config, seed, opts) {
    const C = config;
    opts = opts || {};
    const rng = window.RNG.makeRng(seed);

    // prep sides: derive attrs, eff overall, group
    function prep(side, key) {
      const ctx = { config: C, pressure: opts.pressure, fatigue: opts.fatigue,
        roundN: opts.roundN || 0, hasLeader: side.starters.some(p => p.leader),
        captain: side.captainId ? (side.starters.find(p => p.id === side.captainId) || null) : null };
      const prepP = (p) => ({ ...p, attrs: p.attrs || window.DERIVE.deriveAttrs(p), eff: effective(p, ctx) });
      const starters = side.starters.map(prepP);
      const bench = (side.bench || []).map(prepP);
      return { key, name: side.name, code: side.code, cup: side.cup, dream: side.dream,
        formation: side.formation, starters, bench, subsLeft: side.subsLeft || 0, g: group(starters) };
    }
    const H = prep(homeSide, 'home');
    const A = prep(awaySide, 'away');

    const base = {
      atk: { home: avg([...H.g.MEI, ...H.g.ATA]), away: avg([...A.g.MEI, ...A.g.ATA]) },
      def: { home: avg([...H.g.GOL, ...H.g.ZAG, ...H.g.LAT]), away: avg([...A.g.GOL, ...A.g.ZAG, ...A.g.LAT]) },
    };

    const day = { home: 1 + rng.range(-C.ZEBRA_Z, C.ZEBRA_Z), away: 1 + rng.range(-C.ZEBRA_Z, C.ZEBRA_Z) };
    const lambda = {
      home: expectedGoals(base.atk.home, base.def.away, day.home, C, 1),
      away: expectedGoals(base.atk.away, base.def.home, day.away, C, 1),
    };

    const score = { home: 0, away: 0 };
    const events = [];
    const stats = {};
    const cards = [];
    const sentOff = [];
    const injuries = [];
    const matchPens = [];
    const manDown = { home: 0, away: 0 };
    let needsShootout = false;
    [...H.starters, ...H.bench, ...A.starters, ...A.bench].forEach(p => {
      stats[p.id] = { goals: 0, assists: 0, saves: 0, bigChances: 0, yellows: 0, reds: 0 };
    });

    const sides = { home: H, away: A };

    events.push({ minute: 0, type: 'kickoff', key: 'kickoff', text: ntxt('kickoff', { home: H.name, away: A.name }) });

    // regulation
    runPeriod({ rng, sides, base, day, manDown, C, scale: 1, periodLen: C.MINUTES,
      minuteStart: 1, minuteEnd: C.MINUTES, score, events, stats, cards, sentOff, injuries, matchPens });

    // non-goal flavour events (save/woodwork/counter/bigchance). Cards now come
    // from the causal pass above, so they are no longer drawn here.
    const nEvents = rng.int(C.EVENTS_MIN, C.EVENTS_MAX);
    for (let i = 0; i < nEvents; i++) {
      const minute = rng.int(3, C.MINUTES - 1);
      const side = rng.chance(0.5) ? 'home' : 'away';
      const oppKey = side === 'home' ? 'away' : 'home';
      const type = rng.weighted([
        { item: 'bigchance', w: 3 }, { item: 'save', w: 3 },
        { item: 'woodwork', w: 1.2 }, { item: 'counter', w: 2 },
      ]);
      const g = sides[side].g;
      const sw = scorerWeights(g);
      if (!sw.length) continue;
      const oppGk = sides[oppKey].g.GOL[0];
      const attacker = rng.weighted(sw);
      let vars = { team: sides[side].name, player: attacker.name, gk: gkName(oppGk) };
      if (type === 'save' && oppGk) { stats[oppGk.id].saves++; stats[attacker.id].bigChances++; }
      if (type === 'bigchance' || type === 'woodwork' || type === 'counter') stats[attacker.id].bigChances++;
      const text = fill(rng.pick(narr(type)), vars);
      events.push({ minute, type, side, text,
        players: type === 'save' && oppGk ? [oppGk.id, attacker.id] : [attacker.id] });
    }

    events.push({ minute: 45, type: 'half', key: 'halfTime', text: ntxt('halfTime') });

    // knockout draw -> extra time, then (Phase 1) auto penalty decision
    let extraTime = false;
    let penalties = null;
    if (opts.knockout && score.home === score.away) {
      extraTime = true;
      events.push({ minute: C.MINUTES, type: 'half', key: 'etStart', text: ntxt('etStart') });
      runPeriod({ rng, sides, base, day, manDown, C, scale: C.ET_LAMBDA_SCALE, periodLen: C.ET_MINUTES,
        minuteStart: C.MINUTES + 1, minuteEnd: C.MINUTES + C.ET_MINUTES, score, events, stats, cards, sentOff, injuries, matchPens, etTag: true });

      if (score.home === score.away) {
        events.push({ minute: C.MINUTES + C.ET_MINUTES, type: 'half', key: 'pensDecision', text: ntxt('pensDecision') });
        if (opts.interactiveShootout) {
          needsShootout = true;
        } else {
          const pk = autoShootout(rng, sides, base.def);
          penalties = pk;
          events.push({ minute: C.MINUTES + C.ET_MINUTES, type: 'pens', key: 'pens',
            text: ntxt('pensLine', { home: H.name, hs: pk.home, away: A.name, as: pk.away }) });
        }
      }
    }

    events.push({ minute: 90, type: 'full', key: 'fullTime', text: ntxt('fullTime') });
    events.sort((a, b) => a.minute - b.minute);

    let result;
    if (score.home > score.away) result = 'home';
    else if (score.away > score.home) result = 'away';
    else if (penalties) result = penalties.home > penalties.away ? 'home' : 'away';
    else if (needsShootout) result = 'pending';
    else result = 'draw';

    return {
      home: { name: H.name, code: H.code, cup: H.cup, dream: H.dream, formation: H.formation,
        starters: H.starters.map(p => ({ id: p.id, name: p.name, pos: p.pos })) },
      away: { name: A.name, code: A.code, cup: A.cup, dream: A.dream, formation: A.formation,
        starters: A.starters.map(p => ({ id: p.id, name: p.name, pos: p.pos })) },
      score, events, stats,
      conceded: { home: score.away, away: score.home },
      result, extraTime, penalties, needsShootout,
      cards, sentOff, injuries, matchPens, manDown,
      strength: { atk: base.atk, def: base.def, day, lambda },
      seed,
    };
  }

  // simple deterministic shootout used only when ET stays level (Phase 1)
  function autoShootout(rng, sides, def) {
    const score = { home: 0, away: 0 };
    const takers = {
      home: [...sides.home.starters].sort((a, b) => b.attrs.shooting - a.attrs.shooting),
      away: [...sides.away.starters].sort((a, b) => b.attrs.shooting - a.attrs.shooting),
    };
    const gkOvr = { home: (sides.home.g.GOL[0]?.overall) || 75, away: (sides.away.g.GOL[0]?.overall) || 75 };
    for (let i = 0; i < 5; i++) {
      ['home', 'away'].forEach(side => {
        const opp = side === 'home' ? 'away' : 'home';
        const taker = takers[side][i % takers[side].length];
        const p = 0.75 + (taker.attrs.shooting - 80) / 200 - (gkOvr[opp] - 80) / 300;
        if (rng.chance(Math.max(0.45, Math.min(0.92, p)))) score[side]++;
      });
    }
    // sudden death if level
    let guard = 0;
    while (score.home === score.away && guard < 10) {
      ['home', 'away'].forEach(side => { if (rng.chance(0.72)) score[side]++; });
      guard++;
    }
    if (score.home === score.away) score[rng.chance(0.5) ? 'home' : 'away']++;
    return score;
  }

  // Phase 2: patch a paused log with the interactive shootout outcome.
  // pen = { home, away }. Mutates a shallow clone and returns it.
  function finalizeShootout(log, pen) {
    const result = pen.home > pen.away ? 'home' : 'away';
    const minute = log.extraTime ? 120 : 90;
    const evt = { minute, type: 'pens', key: 'pens',
      text: ntxt('pensLine', { home: log.home.name, hs: pen.home, away: log.away.name, as: pen.away }) };
    const events = [...log.events.filter(e => e.type !== 'full'), evt,
      { minute, type: 'full', key: 'fullTime', text: ntxt('fullTime') }];
    events.sort((a, b) => a.minute - b.minute);
    return { ...log, penalties: pen, needsShootout: false, result, events };
  }

  // deterministic fallback shootout (used only when an override leaves the
  // match level with no extra-time tail to fall back on)
  function fallbackShootout(seed) {
    const rng = window.RNG.makeRng(seed >>> 0);
    let h = 0, a = 0;
    for (let i = 0; i < 5; i++) { if (rng.chance(0.75)) h++; if (rng.chance(0.75)) a++; }
    let guard = 0;
    while (h === a && guard < 12) { if (rng.chance(0.72)) h++; if (rng.chance(0.72)) a++; guard++; }
    if (h === a) { if (rng.chance(0.5)) h++; else a++; }
    return { home: h, away: a };
  }

  // replay goals in minute order to fix each goal event's score snapshot and
  // return the regulation-only and full scores.
  function replayScores(events) {
    const run = { home: 0, away: 0 };
    const reg = { home: 0, away: 0 };
    const out = events.map(e => {
      if (e.type === 'goal') {
        run[e.side]++;
        if (!e.etTag) reg[e.side]++;
        return { ...e, score: { home: run.home, away: run.away } };
      }
      return e;
    });
    return { events: out, reg: { ...reg }, full: { ...run } };
  }

  // interactive penalty narration (player perspective), by semantic key
  function penText(side, outcome) {
    const map = side === 'home'
      ? { goal: 'penYouGoal', save: 'penYouSave', miss: 'penYouMiss' }
      : { goal: 'penOppGoal', save: 'penOppSave', miss: 'penOppMiss' };
    return window.I18N.t('narration.' + (map[outcome] || map.miss));
  }

  // Phase: pênalti — override one in-match penalty (the player's interactive
  // kick) and recompute score/extra-time/result + the offender's stats.
  // Pure: returns the same object reference when nothing changes.
  function finalizeInMatchPenalty(log, penId, outcome) {
    const pens = log.matchPens || [];
    const pen = pens.find(p => p.penId === penId);
    if (!pen || pen.outcome === outcome) return log;
    const side = pen.side;

    // 1) replace the penalty's event with one reflecting the new outcome
    let events = log.events.map(e => {
      if (e.penId !== penId) return e;
      if (outcome === 'goal') {
        return { minute: e.minute, type: 'goal', side, etTag: e.etTag, pen: true, penId,
          text: penText(side, 'goal'), players: [pen.taker], score: null };
      }
      return { minute: e.minute, type: 'penalty', side, etTag: e.etTag, penId, outcome,
        text: penText(side, outcome), players: e.players };
    });

    // 2) adjust the offender/keeper stats (revert seeded effect, apply new)
    const stats = { ...log.stats };
    const adj = (id, key, d) => { if (id && stats[id]) stats[id] = { ...stats[id], [key]: (stats[id][key] || 0) + d }; };
    if (pen.outcome === 'goal') adj(pen.taker, 'goals', -1);
    else if (pen.outcome === 'save') adj(pen.gk, 'saves', -1);
    if (outcome === 'goal') adj(pen.taker, 'goals', 1);
    else if (outcome === 'save') adj(pen.gk, 'saves', 1);

    const matchPens = pens.map(p => p.penId === penId ? { ...p, outcome, scored: outcome === 'goal' } : p);

    // 3) replay scores, then recompute the result / extra-time / shootout tail
    const r = replayScores(events);
    events = r.events;
    let { reg, full } = r;
    let extraTime = log.extraTime, penalties = log.penalties, needsShootout = log.needsShootout, result;

    if (reg.home !== reg.away) {
      // decided in regulation -> drop any extra-time / shootout tail.
      // NOTE: flow decision keys, never translatable text (RNF02): the
      // extra-time / penalty milestones are matched by their semantic `key`.
      events = events.filter(e => !e.etTag && e.type !== 'pens'
        && e.key !== 'etStart' && e.key !== 'pensDecision');
      extraTime = false; penalties = null; needsShootout = false;
      full = { ...reg };
      result = reg.home > reg.away ? 'home' : 'away';
    } else if (extraTime) {
      if (full.home !== full.away) { result = full.home > full.away ? 'home' : 'away'; penalties = null; needsShootout = false; }
      else if (penalties) result = penalties.home > penalties.away ? 'home' : 'away';
      else if (needsShootout) result = 'pending';
      else { needsShootout = true; result = 'pending'; }
    } else {
      // regulation now level but there was no extra time -> deterministic shootout
      const pk = fallbackShootout((log.seed ^ 0x9e3779b9) >>> 0);
      penalties = pk; extraTime = false; needsShootout = false;
      events = [...events.filter(e => e.type !== 'full'),
        { minute: 90, type: 'pens', key: 'pens', text: ntxt('pensDecisionLine', { home: log.home.name, hs: pk.home, away: log.away.name, as: pk.away }) },
        { minute: 90, type: 'full', key: 'fullTime', text: ntxt('fullTime') }];
      result = pk.home > pk.away ? 'home' : 'away';
    }
    events.sort((a, b) => a.minute - b.minute);

    return { ...log, events, stats, matchPens, score: full,
      conceded: { home: full.away, away: full.home }, result, extraTime, penalties, needsShootout };
  }

  window.ENGINE = { simulateMatch, autoShootout, finalizeShootout, finalizeInMatchPenalty, expectedGoals };
})();
