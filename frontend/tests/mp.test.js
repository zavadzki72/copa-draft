/* ============================================================
   COPA DRAFT — tests/mp.test.js
   Multiplayer client logic (pure/no-DOM): mp-log (espelho de log,
   resolução de times), mp-auth (sessão), mp-api (REST autenticada)
   e mp-realtime (subscribe/dispatch) — com fetch/localStorage/signalR
   falsos. Run: node tests/mp.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const front = path.resolve(__dirname, '..');

let passed = 0;
function ok(name, cond) {
  if (!cond) { console.error('FAIL: ' + name); process.exit(1); }
  console.log('ok   - ' + name);
  passed++;
}

// ---- sandbox com fakes de browser ----
function makeSandbox() {
  const storage = {};
  const sb = {
    console,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    },
    _storage: storage,
    fetchCalls: [],
    fetchResponse: { ok: true, status: 200, json: async () => ({}) },
  };
  sb.window = sb;
  sb.fetch = (url, opts) => {
    sb.fetchCalls.push({ url, opts });
    return Promise.resolve(sb.fetchResponse);
  };
  vm.createContext(sb);
  ['config.js', 'lib/mp-log.js', 'lib/mp-auth.js', 'lib/mp-api.js', 'lib/mp-realtime.js'].forEach(rel => {
    vm.runInContext(fs.readFileSync(path.join(front, rel), 'utf8'), sb, { filename: rel });
  });
  return sb;
}

const sb = makeSandbox();
const { MPLOG, MPAUTH, MPAPI, MPRT } = sb.window;

// ============ mp-log: flipLog ============
const log = {
  home: { name: 'Amigo', dream: true }, away: { name: 'Eu', dream: true },
  score: { home: 2, away: 1 },
  conceded: { home: 1, away: 2 },
  penalties: { home: 4, away: 3 },
  manDown: { home: 1, away: 0 },
  result: 'home',
  stats: { x: { goals: 2 } },
  events: [
    { minute: 0, type: 'kickoff', key: 'kickoff', text: 'Bola rolando!' },              // neutro
    { minute: 10, type: 'goal', side: 'home', score: { home: 1, away: 0 }, text: 'g1' },
    { minute: 50, type: 'yellow', side: 'away', text: 'c1' },
  ],
  matchPens: [{ penId: 'pk1', side: 'home', outcome: 'goal' }],
};
const flipped = MPLOG.flipLog(log);
ok('flipLog: troca os lados (home<->away)', flipped.home.name === 'Eu' && flipped.away.name === 'Amigo');
ok('flipLog: espelha placar e conceded', flipped.score.home === 1 && flipped.score.away === 2 && flipped.conceded.home === 2);
ok('flipLog: espelha pênaltis e manDown', flipped.penalties.home === 3 && flipped.manDown.home === 0 && flipped.manDown.away === 1);
ok('flipLog: inverte o result', flipped.result === 'away');
ok('flipLog: evento neutro fica sem side', flipped.events[0].side === undefined && flipped.events[0].type === 'kickoff');
ok('flipLog: gol home vira away com snapshot espelhado',
  flipped.events[1].side === 'away' && flipped.events[1].score.home === 0 && flipped.events[1].score.away === 1);
ok('flipLog: matchPens espelha o lado', flipped.matchPens[0].side === 'away');
ok('flipLog: stats preservadas (por id, sem lado)', flipped.stats.x.goals === 2);
ok('flipLog: original não é mutado', log.result === 'home' && log.events[1].side === 'home');

// ============ mp-log: teamInfo / findFixtureSide ============
sb.window.SQUADS = [{ id: 'brasil1970', code: 'br' }];
const snap = {
  groups: [{
    label: 'A',
    teams: [{ id: 'h:u1', name: 'Zava', isHuman: true }, { id: 'ai:brasil1970', name: 'Brasil 1970', isHuman: false }],
    fixtures: [{ fixtureId: 'gA-r0-0', homeId: 'h:u1', awayId: 'ai:brasil1970' }],
  }],
  bracket: [{ roundId: 'final', ties: [{ tieId: 'final-0', homeId: 'h:u1', awayId: 'ai:brasil1970' }] }],
};
ok('teamInfo: humano usa nome do snapshot', MPLOG.teamInfo(snap, 'h:u1').name === 'Zava' && MPLOG.teamInfo(snap, 'h:u1').isHuman);
ok('teamInfo: IA resolve bandeira do pool', MPLOG.teamInfo(snap, 'ai:brasil1970').code === 'br');
ok('findFixtureSide: acha em grupo', MPLOG.findFixtureSide(snap, 'gA-r0-0', 'away') === 'ai:brasil1970');
ok('findFixtureSide: acha no bracket', MPLOG.findFixtureSide(snap, 'final-0', 'home') === 'h:u1');
ok('findFixtureSide: desconhecido -> null', MPLOG.findFixtureSide(snap, 'nope', 'home') === null);

// ============ mp-log: isFixturePlayed (bug: "rever" antes de jogar) ============
const playSnap = {
  groups: [{ label: 'A', teams: [], fixtures: [{ fixtureId: 'gA-r0-0', played: false }] }],
  bracket: [{ roundId: 'semi', ties: [{ tieId: 'semi-0', played: true }] }],
};
ok('isFixturePlayed: partida futura -> false (sem "rever" na rodada 1)',
  MPLOG.isFixturePlayed(playSnap, 'gA-r0-0') === false);
playSnap.groups[0].fixtures[0].played = true;
ok('isFixturePlayed: depois de jogada -> true', MPLOG.isFixturePlayed(playSnap, 'gA-r0-0') === true);
ok('isFixturePlayed: acha no bracket', MPLOG.isFixturePlayed(playSnap, 'semi-0') === true);
ok('isFixturePlayed: desconhecido/null -> false',
  MPLOG.isFixturePlayed(playSnap, 'nope') === false && MPLOG.isFixturePlayed(null, 'x') === false);

// ============ mp-log: fixtureOfTeam / eliminationInfo ============
const roundInfo = { fixtures: [{ fixtureId: 'oitavas-0', homeId: 'h:u1', awayId: 'ai:x' }] };
ok('fixtureOfTeam: acha a partida do time na rodada', MPLOG.fixtureOfTeam(roundInfo, 'h:u1').fixtureId === 'oitavas-0');
ok('fixtureOfTeam: fora da rodada -> null', MPLOG.fixtureOfTeam(roundInfo, 'h:u2') === null
  && MPLOG.fixtureOfTeam(null, 'h:u1') === null);

const elimSnap = {
  groups: [
    { label: 'A', teams: [{ id: 'h:u1', name: 'Zava', isHuman: true }, { id: 'ai:a', name: 'IA A', isHuman: false }], fixtures: [] },
    { label: 'B', teams: [{ id: 'h:u2', name: 'Amigo', isHuman: true }, { id: 'ai:b', name: 'IA B', isHuman: false }], fixtures: [] },
    { label: 'C', teams: [{ id: 'h:u3', name: 'Outra', isHuman: true }], fixtures: [] },
  ],
  bracket: [],
  championTeamId: null,
};
ok('elim: grupos em andamento -> ninguém eliminado', MPLOG.eliminationInfo(elimSnap, 'h:u1').eliminated === false);

// bracket começou: u1 ficou fora (caiu nos grupos); u2 e u3 avançaram
elimSnap.bracket = [{
  roundId: 'oitavas',
  ties: [
    { tieId: 'o0', homeId: 'h:u2', awayId: 'ai:a', played: true, winnerId: 'h:u2' },
    { tieId: 'o1', homeId: 'h:u3', awayId: 'ai:b', played: true, winnerId: 'ai:b' },
  ],
}];
let info = MPLOG.eliminationInfo(elimSnap, 'h:u1');
ok('elim: fora do bracket -> eliminado nos grupos', info.eliminated && info.stage === 'grupos');
ok('elim: humanos vivos exclui eliminados e a mim', info.aliveHumans.length === 1 && info.aliveHumans[0].id === 'h:u2');

info = MPLOG.eliminationInfo(elimSnap, 'h:u3');
ok('elim: perdeu tie jogado -> eliminado na fase certa', info.eliminated && info.stage === 'oitavas');

info = MPLOG.eliminationInfo(elimSnap, 'h:u2');
ok('elim: vencedor segue vivo', info.eliminated === false);

// ============ mp-auth: sessão ============
(async () => {
  ok('auth: começa deslogado', !MPAUTH.isLoggedIn());
  sb.fetchResponse = { ok: true, status: 200, json: async () => ({ token: 'jwt-1', user: { id: 'u1', name: 'Zava' } }) };
  await MPAUTH.loginWithCredential('google-credential');
  ok('auth: login troca credential por JWT', MPAUTH.token() === 'jwt-1' && MPAUTH.user().name === 'Zava');
  ok('auth: login chamou o endpoint certo', sb.fetchCalls[0].url.endsWith('/api/auth/google')
    && JSON.parse(sb.fetchCalls[0].opts.body).idToken === 'google-credential');
  ok('auth: sessão persistida no localStorage (chave isolada do solo)',
    !!sb._storage.copa_draft_mp_session_v1 && !sb._storage.copa_draft_run_v2);

  // nova "aba": outro sandbox compartilhando o mesmo storage restaura a sessão
  const sb2 = makeSandbox();
  Object.assign(sb2._storage, sb._storage);
  vm.runInContext(fs.readFileSync(path.join(front, 'lib/mp-auth.js'), 'utf8'), sb2, { filename: 'lib/mp-auth.js' });
  ok('auth: sessão sobrevive a reload', sb2.window.MPAUTH.isLoggedIn() && sb2.window.MPAUTH.token() === 'jwt-1');

  // ============ mp-api ============
  sb.fetchCalls.length = 0;
  sb.fetchResponse = { ok: true, status: 200, json: async () => ({ code: 'ABC123' }) };
  const room = await MPAPI.createRoom();
  ok('api: createRoom envia Bearer e retorna sala', room.code === 'ABC123'
    && sb.fetchCalls[0].opts.headers.Authorization === 'Bearer jwt-1');

  sb.fetchResponse = { ok: false, status: 409, json: async () => ({ error: 'Sala cheia.' }) };
  let threw = null;
  try { await MPAPI.joinRoom('XYZ999'); } catch (e) { threw = e.message; }
  ok('api: erro do servidor vira exceção com a mensagem', threw === 'Sala cheia.');

  sb.fetchResponse = { ok: false, status: 401, json: async () => ({}) };
  try { await MPAPI.getRoom('XYZ999'); } catch (e) { threw = e.message; }
  ok('api: 401 desloga e avisa', !MPAUTH.isLoggedIn() && threw.includes('Sessão expirada'));

  // ============ convidado ============
  sb.fetchCalls.length = 0;
  sb.fetchResponse = { ok: true, status: 200, json: async () => ({ token: 'jwt-guest', user: { id: 'g1', name: 'Maria', guest: true } }) };
  await MPAUTH.loginAsGuest('Maria');
  ok('guest: login por apelido chama /api/auth/guest', sb.fetchCalls[0].url.endsWith('/api/auth/guest')
    && JSON.parse(sb.fetchCalls[0].opts.body).name === 'Maria');
  ok('guest: sessão marcada como convidado', MPAUTH.isLoggedIn() && MPAUTH.isGuest() && MPAUTH.user().name === 'Maria');

  sb.fetchResponse = { ok: false, status: 400, json: async () => ({ error: 'O nome precisa ter entre 2 e 30 caracteres.' }) };
  try { await MPAUTH.loginAsGuest('a'); } catch (e) { threw = e.message; }
  ok('guest: nome inválido vira erro amigável', threw.includes('entre 2 e 30'));

  // ============ mp-realtime ============
  const handlers = {};
  const fakeConn = {
    on: (evt, fn) => { handlers[evt] = fn; },
    onreconnected: () => {},
    start: async () => {},
    stop: async () => {},
    invoke: (...args) => Promise.resolve(args),
  };
  sb.window.signalR = {
    HubConnectionBuilder: function () {
      this.withUrl = () => this; this.withAutomaticReconnect = () => this; this.build = () => fakeConn;
    },
  };
  await MPRT.connect();
  ok('rt: conexão registra os eventos no hub', typeof handlers.RoomState === 'function' && typeof handlers.YourMatch === 'function');
  // regressão: TODO evento que o servidor emite precisa estar registrado no
  // wrapper — RoundReady fora da lista deixou o pré-jogo invisível e prendeu
  // o jogador no pós-jogo (bug real de 2026-06-10)
  const SERVER_EVENTS = ['RoomState', 'DraftStarted', 'DraftProgress', 'DraftComplete', 'DraftTeams', 'LobbyError',
    'TournamentState', 'RoundReady', 'RoundReadyProgress', 'RoundStarted',
    'YourMatch', 'WatchMatch', 'MinuteTick', 'MatchFinished', 'TournamentFinished',
    'ShootoutStarted', 'ShootoutState', 'ShootoutAwaitKick', 'ShootoutFinished'];
  const missing = SERVER_EVENTS.filter(e => typeof handlers[e] !== 'function');
  ok('rt: todos os eventos do servidor estão assinados (' + SERVER_EVENTS.length + ')', missing.length === 0
    || (console.error('faltando: ' + missing.join(', ')), false));

  let got = null;
  const off = MPRT.on('RoomState', (s) => { got = s; });
  handlers.RoomState({ code: 'ABC123', players: [] });
  ok('rt: dispatch entrega ao assinante', got && got.code === 'ABC123');

  off();
  got = null;
  handlers.RoomState({ code: 'OUTRA' });
  ok('rt: unsubscribe para de receber', got === null);

  const inv = await MPRT.invoke('JoinRoom', 'ABC123');
  ok('rt: invoke proxia para a conexão', inv[0] === 'JoinRoom' && inv[1] === 'ABC123');

  console.log('\n' + passed + ' checks passed.');
})().catch(e => { console.error('FAIL (async): ' + e.message); process.exit(1); });
