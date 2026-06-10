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

  /* a partida (grupo ou mata-mata) já foi jogada? — usado pra só oferecer
     "rever" depois que ela de fato aconteceu (#bug: banner na rodada 1) */
  function isFixturePlayed(snap, fixtureId) {
    if (!snap || !fixtureId) return false;
    for (const g of snap.groups) {
      const f = g.fixtures.find(x => x.fixtureId === fixtureId);
      if (f) return !!f.played;
    }
    for (const r of snap.bracket) {
      const t = r.ties.find(x => x.tieId === fixtureId);
      if (t) return !!t.played;
    }
    return false;
  }

  /* the current-round fixture a team is playing (or null) */
  function fixtureOfTeam(currentRound, teamId) {
    if (!currentRound || !teamId) return null;
    return currentRound.fixtures.find(f => f.homeId === teamId || f.awayId === teamId) || null;
  }

  /* elimination status of `myTeamId` + remaining HUMAN teams (for the
     "acompanhar campeonato" picker). Stage: 'grupos' | roundId do mata-mata. */
  function eliminationInfo(snap, myTeamId) {
    const humans = [];
    if (snap) {
      for (const g of snap.groups)
        for (const t of g.teams)
          if (t.isHuman) humans.push({ id: t.id, name: t.name });
    }
    const none = { eliminated: false, stage: null, aliveHumans: [] };
    if (!snap || !snap.bracket.length) return none; // grupos em andamento: ninguém caiu ainda

    const inTie = (tie, id) => tie.homeId === id || tie.awayId === id;
    const firstRound = snap.bracket[0];
    const alive = new Set(firstRound.ties.flatMap(t => [t.homeId, t.awayId]));
    for (const round of snap.bracket)
      for (const tie of round.ties)
        if (tie.played && tie.winnerId) {
          alive.delete(tie.homeId === tie.winnerId ? tie.awayId : tie.homeId);
        }

    let eliminated = false, stage = null;
    if (!firstRound.ties.some(t => inTie(t, myTeamId))) {
      eliminated = true; stage = 'grupos';
    } else if (!alive.has(myTeamId)) {
      eliminated = true;
      for (const round of snap.bracket)
        for (const tie of round.ties)
          if (inTie(tie, myTeamId) && tie.played && tie.winnerId !== myTeamId) stage = round.roundId;
    }
    if (snap.championTeamId && snap.championTeamId !== myTeamId) eliminated = true;

    const aliveHumans = humans.filter(h => h.id !== myTeamId && alive.has(h.id));
    return { eliminated, stage, aliveHumans };
  }

  /* full player objects from the shared pool, by id (lazy index) */
  let byId = null;
  function playerById(id) {
    if (!byId) {
      byId = new Map();
      (window.SQUADS || []).forEach(sq => sq.players.forEach(p => byId.set(p.id, p)));
    }
    return byId.get(id) || null;
  }

  window.MPLOG = { flipLog, teamInfo, findFixtureSide, isFixturePlayed, fixtureOfTeam, eliminationInfo, playerById };
})();
