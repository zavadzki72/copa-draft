/* ============================================================
   COPA DRAFT — lib/engine.js
   PURE minute-by-minute match engine.
   Input:  two sides + config + numeric seed  ->  Output: match log.
   No DOM, no globals mutated. Same input => same log (testable,
   server-side ready).

   side = {
     key:'home'|'away', name, code, cup,
     starters:[player,...],   // exactly 11, each player has .pos
     formation:'4-3-3'
   }
   ============================================================ */
(function () {
  const GOAL_T = [
    "GOOOOL DO {TEAM}! {player} finaliza e não perdoa!",
    "É GOL! {player} aproveita e marca para o {team}.",
    "GOOOOL! {player} acha o canto e estufa a rede!",
    "NA REDE! {player} marca um golaço para o {team}!",
    "GOL! {player} sobe mais que a marcação e cabeceia pro fundo!",
    "GOOOOL! {player} apareceu na hora certa e empurrou pro gol!",
  ];
  const ASSIST_T = [
    " Assistência de {assist}.",
    " Tudo começou nos pés de {assist}.",
    " Belo passe de {assist} para deixar o atacante na cara do gol.",
    " {assist} deu o passe açucarado.",
  ];
  const EVENT_T = {
    bigchance: [
      "{player} recebe na entrada da área… PRA FORA! Quase o gol.",
      "Que chance! {player} fica cara a cara, mas manda por cima.",
      "{player} chuta forte… raspando a trave! Uhh, quase.",
      "{player} cabeceia livre na pequena área e isola. Inacreditável!",
    ],
    save: [
      "Defesaça de {gk}! Salvou o {team}.",
      "{gk} voa no ângulo e espalma! Que defesa.",
      "{player} bate firme, mas {gk} faz a defesa e segura o {team}.",
      "Milagre de {gk}! Tirou de baixo da trave.",
    ],
    woodwork: [
      "NA TRAVE! {player} carimba o travessão.",
      "No poste! {player} quase abre o placar.",
      "A bola explode na trave após chute de {player}!",
    ],
    yellow: [
      "Cartão amarelo para {player} após falta dura.",
      "{player} chega atrasado e vê o amarelo.",
      "Amarelo! {player} segura o contra-ataque com falta.",
    ],
    foul: [
      "Falta no meio-campo, {player} interrompe a jogada.",
      "Jogo truncado, mais uma falta de {player}.",
      "{player} comete falta e o juiz manda parar.",
    ],
    counter: [
      "Contra-ataque puxado por {player}, mas a zaga afasta.",
      "{player} lança em velocidade… a defesa corta no susto.",
      "Arrancada de {player} pela ponta, cruzou e a zaga tirou.",
    ],
  };

  function group(starters) {
    const g = { GOL: [], ZAG: [], LAT: [], MEI: [], ATA: [] };
    starters.forEach(p => (g[p.pos] || g.MEI).push(p));
    return g;
  }
  const avg = (arr) => arr.length ? arr.reduce((s, p) => s + p.eff, 0) / arr.length : 70;

  // effective overall = base, minus optional pressure/fatigue modifiers.
  // Phase 1 leaves modifiers off; hooks ready for later phases.
  function effective(p, ctx) {
    const C = ctx.config;
    let v = p.overall;
    if (ctx.pressure && p.age < C.PRESSURE_U_AGE) {
      let pen = ctx.roundN * C.PRESSURE_PER_ROUND;
      if (ctx.hasLeader && C.LEADER_HALVES_PRESSURE) pen /= 2;
      v -= pen;
    }
    if (ctx.fatigue && p.fatigue) v -= p.fatigue;
    return v;
  }

  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : '');
  }

  // weighted scorer / assister selection
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

  function expectedGoals(atk, def, day, C, scale) {
    return C.BASE_LAMBDA * Math.pow((atk * day) / def, C.LAMBDA_EXP) * scale;
  }

  // simulate one continuous period; mutates score + pushes events
  function runPeriod(opts) {
    const { rng, sides, lambdas, minuteStart, minuteEnd, score, events, stats, etTag } = opts;
    // distribute each team's expected goals evenly across the period's minutes
    const span = minuteEnd - minuteStart + 1;
    const pm = { home: lambdas.home / span, away: lambdas.away / span };

    for (let m = minuteStart; m <= minuteEnd; m++) {
      ['home', 'away'].forEach(side => {
        if (rng.chance(pm[side])) {
          const g = sides[side].g;
          const scorer = rng.weighted(scorerWeights(g));
          const hasAssist = rng.chance(0.72);
          const assist = hasAssist ? rng.weighted(assistWeights(g, scorer)) : null;
          score[side]++;
          stats[scorer.id].goals++;
          if (assist) stats[assist.id].assists++;
          let text = fill(rng.pick(GOAL_T), { player: scorer.name, team: sides[side].name, TEAM: sides[side].name.toUpperCase() });
          if (assist) text += fill(rng.pick(ASSIST_T), { assist: assist.name });
          events.push({ minute: m, type: 'goal', side, etTag, text, score: { ...score },
            players: assist ? [scorer.id, assist.id] : [scorer.id] });
        }
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
        roundN: opts.roundN || 0, hasLeader: side.starters.some(p => p.leader) };
      const starters = side.starters.map(p => ({
        ...p,
        attrs: p.attrs || window.DERIVE.deriveAttrs(p),
        eff: effective(p, ctx),
      }));
      return { key, name: side.name, code: side.code, cup: side.cup, dream: side.dream,
        formation: side.formation, starters, g: group(starters) };
    }
    const H = prep(homeSide, 'home');
    const A = prep(awaySide, 'away');

    const atk = { home: avg([...H.g.MEI, ...H.g.ATA]), away: avg([...A.g.MEI, ...A.g.ATA]) };
    const def = { home: avg([...H.g.GOL, ...H.g.ZAG, ...H.g.LAT]), away: avg([...A.g.GOL, ...A.g.ZAG, ...A.g.LAT]) };

    const day = { home: 1 + rng.range(-C.ZEBRA_Z, C.ZEBRA_Z), away: 1 + rng.range(-C.ZEBRA_Z, C.ZEBRA_Z) };
    const lambda = {
      home: expectedGoals(atk.home, def.away, day.home, C, 1),
      away: expectedGoals(atk.away, def.home, day.away, C, 1),
    };

    const score = { home: 0, away: 0 };
    const events = [];
    const stats = {};
    let needsShootout = false;
    [...H.starters, ...A.starters].forEach(p => { stats[p.id] = { goals: 0, assists: 0, saves: 0, bigChances: 0 }; });

    const sides = { home: H, away: A };

    events.push({ minute: 0, type: 'kickoff', text: `Bola rolando! ${H.name} x ${A.name}.` });

    // regulation
    runPeriod({ rng, sides, lambdas: lambda, minuteStart: 1, minuteEnd: C.MINUTES, score, events, stats, C });

    // non-goal narration events (~6-10)
    const nEvents = rng.int(C.EVENTS_MIN, C.EVENTS_MAX);
    const types = ['bigchance', 'save', 'woodwork', 'yellow', 'foul', 'counter'];
    for (let i = 0; i < nEvents; i++) {
      const minute = rng.int(3, C.MINUTES - 1);
      const side = rng.chance(0.5) ? 'home' : 'away';
      const oppKey = side === 'home' ? 'away' : 'home';
      const type = rng.weighted([
        { item: 'bigchance', w: 3 }, { item: 'save', w: 3 }, { item: 'woodwork', w: 1.2 },
        { item: 'yellow', w: 2 }, { item: 'foul', w: 2.5 }, { item: 'counter', w: 2 },
      ]);
      const g = sides[side].g;
      const oppGk = sides[oppKey].g.GOL[0];
      const attacker = rng.weighted(scorerWeights(g));
      let vars = { team: sides[side].name, player: attacker.name, gk: oppGk ? oppGk.name : 'o goleiro' };
      if (type === 'save' && oppGk) { stats[oppGk.id].saves++; stats[attacker.id].bigChances++; }
      if (type === 'bigchance' || type === 'woodwork' || type === 'counter') stats[attacker.id].bigChances++;
      const text = fill(rng.pick(EVENT_T[type]), vars);
      events.push({ minute, type, side, text,
        players: type === 'save' && oppGk ? [oppGk.id, attacker.id] : [attacker.id] });
    }

    events.push({ minute: 45, type: 'half', text: 'Fim do primeiro tempo.' });

    // knockout draw -> extra time, then (Phase 1) auto penalty decision
    let extraTime = false;
    let penalties = null;
    if (opts.knockout && score.home === score.away) {
      extraTime = true;
      events.push({ minute: C.MINUTES, type: 'half', text: 'Empate no tempo normal. Vamos à prorrogação!' });
      const etScale = C.ET_LAMBDA_SCALE;
      const etLambda = { home: lambda.home * etScale, away: lambda.away * etScale };
      runPeriod({ rng, sides, lambdas: etLambda, minuteStart: C.MINUTES + 1,
        minuteEnd: C.MINUTES + C.ET_MINUTES, score, events, stats, C, etTag: true });

      if (score.home === score.away) {
        events.push({ minute: C.MINUTES + C.ET_MINUTES, type: 'half', text: 'Persiste o empate. Decisão nos pênaltis!' });
        if (opts.interactiveShootout) {
          // Phase 2: pause here — the UI runs the interactive shootout and
          // finalizes penalties + result afterwards (see ENGINE.finalizeShootout).
          needsShootout = true;
        } else {
          const pk = autoShootout(rng, sides, def);
          penalties = pk;
          events.push({ minute: C.MINUTES + C.ET_MINUTES, type: 'pens',
            text: `Nos pênaltis: ${H.name} ${pk.home} x ${pk.away} ${A.name}.` });
        }
      }
    }

    events.push({ minute: 90, type: 'full', text: 'Fim de jogo!' });
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
      strength: { atk, def, day, lambda },
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
    const evt = { minute: log.extraTime ? 120 : 90, type: 'pens',
      text: `Nos pênaltis: ${log.home.name} ${pen.home} x ${pen.away} ${log.away.name}.` };
    const events = [...log.events.filter(e => e.type !== 'full'), evt,
      { minute: log.extraTime ? 120 : 90, type: 'full', text: 'Fim de jogo!' }];
    events.sort((a, b) => a.minute - b.minute);
    return { ...log, penalties: pen, needsShootout: false, result, events };
  }

  window.ENGINE = { simulateMatch, autoShootout, finalizeShootout };
})();
