/* ============================================================
   COPA DRAFT — lib/mp-realtime.js
   SignalR client wrapper: one connection to /hubs/lobby carrying
   lobby, draft and tournament events. Subscribers attach via on().
   ============================================================ */
(function () {
  // ATENÇÃO: todo evento novo do hub PRECISA entrar nesta lista, senão o
  // wrapper nunca o entrega aos assinantes (tests/mp.test.js cobre a lista).
  const EVENTS = [
    'RoomState', 'DraftStarted', 'DraftProgress', 'DraftComplete', 'DraftTeams', 'LobbyError',
    'TournamentState', 'RoundReady', 'RoundReadyProgress', 'RoundStarted',
    'YourMatch', 'WatchMatch', 'MinuteTick', 'MatchFinished', 'TournamentFinished',
  ];

  let conn = null;
  const subs = {};       // event -> [fn]
  const reconnSubs = [];

  function apiBase() { return (window.CONFIG.MP && window.CONFIG.MP.API_BASE) || ''; }

  function dispatch(evt) {
    return (...args) => (subs[evt] || []).slice().forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } });
  }

  async function connect() {
    if (conn) return conn;
    if (!window.signalR) throw new Error('Multiplayer indisponível no momento.');
    conn = new window.signalR.HubConnectionBuilder()
      .withUrl(apiBase() + '/hubs/lobby', { accessTokenFactory: () => window.MPAUTH.token() })
      .withAutomaticReconnect()
      .build();
    EVENTS.forEach(evt => conn.on(evt, dispatch(evt)));
    conn.onreconnected(() => reconnSubs.slice().forEach(fn => { try { fn(); } catch (e) { console.error(e); } }));
    await conn.start();
    return conn;
  }

  // subscribe; returns an unsubscribe fn
  function on(evt, fn) {
    (subs[evt] = subs[evt] || []).push(fn);
    return () => { subs[evt] = (subs[evt] || []).filter(f => f !== fn); };
  }

  async function invoke() {
    if (!conn) throw new Error('Multiplayer desconectado.');
    return conn.invoke.apply(conn, arguments);
  }

  async function disconnect() {
    if (!conn) return;
    const c = conn;
    conn = null;
    try { await c.stop(); } catch (e) {}
  }

  window.MPRT = {
    connect, disconnect, on, invoke,
    onReconnected: (fn) => reconnSubs.push(fn),
    isConnected: () => !!conn,
  };
})();
