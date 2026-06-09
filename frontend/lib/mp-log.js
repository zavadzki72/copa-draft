/* ============================================================
   COPA DRAFT — lib/mp-log.js
   Pure helpers do multiplayer (sem React/DOM) — extraídos de
   ui/mp.jsx para serem testáveis em Node (tests/mp.test.js).
   ============================================================ */
(function () {
  /* my side must render as 'home' (solo invariant: player == home).
     When the server says I'm 'away', mirror the log. */
  function flipLog(log) {
    const swapScore = (s) => (s ? { home: s.away, away: s.home } : s);
    const swapSide = (side) => (side === 'home' ? 'away' : side === 'away' ? 'home' : side);
    return {
      ...log,
      home: log.away, away: log.home,
      score: swapScore(log.score),
      conceded: swapScore(log.conceded),
      penalties: swapScore(log.penalties),
      manDown: log.manDown ? { home: log.manDown.away, away: log.manDown.home } : log.manDown,
      result: log.result === 'home' ? 'away' : log.result === 'away' ? 'home' : log.result,
      events: (log.events || []).map(e => ({ ...e, side: swapSide(e.side), score: swapScore(e.score) })),
      matchPens: (log.matchPens || []).map(p => ({ ...p, side: swapSide(p.side) })),
    };
  }

  /* resolve a snapshot team id to display info (flag from the shared pool) */
  function teamInfo(snap, teamId) {
    let entry = null;
    if (snap) {
      for (const g of snap.groups) {
        entry = g.teams.find(t => t.id === teamId);
        if (entry) break;
      }
    }
    const name = entry ? entry.name : teamId;
    if (teamId && teamId.startsWith('ai:')) {
      const sq = (window.SQUADS || []).find(s => 'ai:' + s.id === teamId);
      return { name, code: sq ? sq.code : null, isHuman: false };
    }
    return { name, isHuman: true };
  }

  /* find the teamId on a given side of a fixture/tie in the snapshot */
  function findFixtureSide(snap, fixtureId, side) {
    if (!snap) return null;
    for (const g of snap.groups) {
      const f = g.fixtures.find(x => x.fixtureId === fixtureId);
      if (f) return side === 'home' ? f.homeId : f.awayId;
    }
    for (const r of snap.bracket) {
      const tie = r.ties.find(x => x.tieId === fixtureId);
      if (tie) return side === 'home' ? tie.homeId : tie.awayId;
    }
    return null;
  }

  window.MPLOG = { flipLog, teamInfo, findFixtureSide };
})();
