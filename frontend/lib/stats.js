/* ============================================================
   COPA DRAFT — lib/stats.js
   Campaign awards (end of cup). PURE: accumulates per-match ratings
   into a running tally for the PLAYER's team only, then derives the
   awards (top scorer, best player, best keeper, playmaker).
   Source is ratings.players (home side) — names/positions/ratings all
   come from there, so it covers the XI that played each match.
   ============================================================ */
(function () {
  // fold one match into the running tally. Returns a NEW object.
  // accum: { [id]: { id,name,pos, goals,assists,saves,bigChances,yellows,reds,
  //                  cleanSheets, ratingSum, matches } }
  function accumulate(accum, ratings, log, config) {
    const next = {};
    Object.keys(accum || {}).forEach(id => { next[id] = Object.assign({}, accum[id]); });

    const conceded = log.conceded && log.conceded.home != null
      ? log.conceded.home : (log.score ? log.score.away : 0);

    Object.values(ratings.players).filter(p => p.side === 'home').forEach(p => {
      const a = next[p.id] || { id: p.id, name: p.name, pos: p.pos,
        goals: 0, assists: 0, saves: 0, bigChances: 0, yellows: 0, reds: 0,
        cleanSheets: 0, ratingSum: 0, matches: 0 };
      a.name = p.name; a.pos = p.pos;
      a.goals += p.goals || 0;
      a.assists += p.assists || 0;
      a.saves += p.saves || 0;
      a.bigChances += p.bigChances || 0;
      a.yellows += p.yellows || 0;
      a.reds += p.reds || 0;
      if (conceded === 0) a.cleanSheets += 1;
      a.ratingSum += p.rating || 0;
      a.matches += 1;
      next[p.id] = a;
    });
    return next;
  }

  // derive the awards from the running tally
  function compute(accum, config) {
    const players = Object.values(accum || {}).map(p => Object.assign({}, p, {
      avg: p.matches ? Math.round((p.ratingSum / p.matches) * 10) / 10 : 0,
    }));

    const artilheiro = players.filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.matches - b.matches)[0] || null;

    const eligible = players.filter(p => p.matches >= config.AWARD_MIN_MATCHES);
    const melhorJogador = [...eligible]
      .sort((a, b) => b.avg - a.avg || (b.goals + b.assists) - (a.goals + a.assists))[0] || null;

    const melhorGoleiro = players.filter(p => p.pos === 'GOL')
      .sort((a, b) => b.cleanSheets - a.cleanSheets || b.saves - a.saves || b.avg - a.avg)[0] || null;

    const maestro = players.filter(p => p.assists > 0)
      .sort((a, b) => b.assists - a.assists || b.goals - a.goals)[0] || null;

    return { artilheiro, melhorJogador, melhorGoleiro, maestro };
  }

  window.STATS = { accumulate, compute };
})();
