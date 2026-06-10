/* ============================================================
   COPA DRAFT — lib/ratings.js
   Per-player match ratings + man-of-the-match, from a match log.
   Pure & deterministic (own RNG seeded off the match seed).
   ============================================================ */
(function () {
  const DEF_POS = { GOL: 1, ZAG: 1, LAT: 1 };

  // build {playerId: {name,pos,side,rating, goals, assists, saves, bigChances}}
  function computeRatings(log, config) {
    const C = config;
    const rng = window.RNG.makeRng((log.seed + 7919) >>> 0);
    const out = {};

    function rate(side, sideKey) {
      const conceded = log.conceded[sideKey];
      side.starters.forEach(p => {
        const st = log.stats[p.id] || { goals: 0, assists: 0, saves: 0, bigChances: 0, yellows: 0, reds: 0 };
        let r = C.RATING_BASE;
        r += st.goals * C.RATING_GOAL;
        r += st.assists * C.RATING_ASSIST;
        if (p.pos === 'GOL') r += st.saves * C.RATING_SAVE;
        r += st.bigChances * C.RATING_BIGCHANCE;
        if (DEF_POS[p.pos]) r += conceded * C.RATING_CONCEDE;
        if (st.reds) r += st.reds * C.RATING_RED;
        r += rng.range(-C.RATING_NOISE, C.RATING_NOISE);
        r = Math.max(C.RATING_MIN, Math.min(C.RATING_MAX, r));
        out[p.id] = {
          id: p.id, name: p.name, pos: p.pos, side: sideKey,
          rating: Math.round(r * 10) / 10,
          goals: st.goals, assists: st.assists, saves: st.saves, bigChances: st.bigChances,
          yellows: st.yellows || 0, reds: st.reds || 0,
        };
      });
    }
    rate(log.home, 'home');
    rate(log.away, 'away');

    // man of the match: highest rating overall, tiebreak goals then assists
    const all = Object.values(out);
    all.sort((a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists);
    const motm = all[0] ? all[0].id : null;

    return { players: out, motm };
  }

  window.RATINGS = { computeRatings };
})();
