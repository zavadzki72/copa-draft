/* E2E real contra a stack em localhost:8090 — simula 2 jogadores (mesmo
   cliente SignalR do navegador) e valida o fluxo do pré-jogo/ready-gate. */
import signalR from '@microsoft/signalr';
import fs from 'fs';

const BASE = 'http://localhost:8090';
const { TOKEN_A, TOKEN_B, USER_A, USER_B, CODE } = process.env;

let failed = 0;
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';
const ok = (name, cond) => {
  console.log(`${cond ? '  ok ' : 'FALHA'} [${ts()}] ${name}`);
  if (!cond) failed++;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- times válidos a partir do squads.json (mesma regra do bestXI) ----
const squads = JSON.parse(fs.readFileSync(new URL('./squads.json', import.meta.url)));
function bestXI(squad) {
  const need = { GOL: 1, ZAG: 2, LAT: 2, MEI: 3, ATA: 3 };
  const xi = [];
  for (const [pos, n] of Object.entries(need)) {
    const ps = squad.players.filter(p => p.pos === pos).sort((a, b) => b.overall - a.overall).slice(0, n);
    xi.push(...ps);
  }
  return xi.length === 11 ? xi : null;
}
const fullSquads = squads.map(s => ({ s, xi: bestXI(s) })).filter(x => x.xi);
const teamOf = (i) => ({
  formation: '4-3-3',
  starters: fullSquads[i].xi.map(p => p.id),
  bench: [],
  captainId: null,
});

// ---- conexão de um "navegador" ----
function client(name, token) {
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${BASE}/hubs/lobby`, {
      accessTokenFactory: () => token,
      transport: signalR.HttpTransportType.WebSockets,
      skipNegotiation: true,
    })
    .build();
  const st = {
    name, conn,
    snap: null, yourMatch: null, room: null,
    minuteTicks: 0, lastMinute: 0,
    progress: null, roundStartedCount: 0,
    log: [],
  };
  conn.on('RoomState', (s) => { st.room = s; });
  conn.on('TournamentState', (s) => {
    st.snap = s;
    const r = s.currentRound;
    st.log.push(`[${ts()}] snap fase=${s.phase} rodada=${r ? r.label + '/' + r.status : '-'}`);
  });
  conn.on('YourMatch', (m) => { st.yourMatch = m; st.log.push(`[${ts()}] YourMatch ${m.fixtureId} (${m.side})`); });
  conn.on('RoundReadyProgress', (p) => { st.progress = p; });
  conn.on('RoundStarted', () => { st.roundStartedCount++; st.log.push(`[${ts()}] RoundStarted`); });
  conn.on('MinuteTick', (m) => { st.minuteTicks++; st.lastMinute = m; });
  conn.on('LobbyError', (e) => st.log.push(`[${ts()}] LobbyError: ${e}`));
  return st;
}

// condição EXATA que o mp.jsx usa pra mostrar o PreMatchScreen
const wouldShowPrematch = (c) => {
  const r = c.snap && c.snap.currentRound;
  return !!(r && r.status === 'aguardando' && c.yourMatch
    && r.fixtures.some(f => f.fixtureId === c.yourMatch.fixtureId));
};
const roundLabel = (c) => c.snap?.currentRound?.label || '-';

async function waitUntil(desc, fn, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await sleep(150);
  }
  console.log(`  (timeout esperando: ${desc})`);
  return false;
}

const A = client('Anfitrião', TOKEN_A);
const B = client('Convidado', TOKEN_B);
await A.conn.start();
await B.conn.start();
await A.conn.invoke('JoinRoom', CODE);
await B.conn.invoke('JoinRoom', CODE);
ok('lobby: os dois entraram na sala', await waitUntil('2 players', () => A.room?.players?.length === 2));

await A.conn.invoke('StartDraft', CODE);
await A.conn.invoke('SubmitTeam', CODE, teamOf(0));
await B.conn.invoke('SubmitTeam', CODE, teamOf(7));

// ---------- BUG 1: pré-jogo da PRIMEIRA rodada ----------
ok('rodada 1 anunciada com status "aguardando" no snapshot',
  await waitUntil('announce r1', () => A.snap?.currentRound?.status === 'aguardando'));
ok('os dois receberam YourMatch da rodada 1',
  await waitUntil('YourMatch', () => A.yourMatch && B.yourMatch));
ok('PRÉ-JOGO renderizaria para o anfitrião (condição exata da UI)', wouldShowPrematch(A));
ok('PRÉ-JOGO renderizaria para o convidado', wouldShowPrematch(B));

await sleep(3000);
ok('gate SEGURA a rodada: nenhum MinuteTick após 3s sem cliques',
  A.minuteTicks === 0 && A.roundStartedCount === 0);

await A.conn.invoke('ReadyForRound', CODE);
ok('progresso 1/2 após 1º clique',
  await waitUntil('progress', () => A.progress?.ready === 1 && A.progress?.total === 2));
await sleep(2000);
ok('gate ainda segura com 1/2 (sem ticks)', A.minuteTicks === 0);

await B.conn.invoke('ReadyForRound', CODE);
ok('2º clique abre a rodada (RoundStarted + status "rolando")',
  await waitUntil('start', () => A.roundStartedCount >= 1 && A.snap?.currentRound?.status === 'rolando', 8000));
ok('relógio do servidor andando (MinuteTicks chegando)',
  await waitUntil('ticks', () => A.minuteTicks >= 3, 8000));

// ---------- BUG 2/3: transição para rodadas 2 e 3 ----------
ok('rodada 1 terminou e a RODADA 2 foi anunciada (status "aguardando")',
  await waitUntil('announce r2', () => roundLabel(A) === 'Rodada 2' && A.snap.currentRound.status === 'aguardando', 60000));
ok('novo YourMatch da rodada 2 chegou',
  await waitUntil('ym2', () => A.yourMatch && A.snap.currentRound.fixtures.some(f => f.fixtureId === A.yourMatch.fixtureId), 5000));
ok('PRÉ-JOGO renderizaria de novo na rodada 2 (anfitrião)', wouldShowPrematch(A));
ok('PRÉ-JOGO renderizaria de novo na rodada 2 (convidado)', wouldShowPrematch(B));

const ticksBeforeR2 = A.minuteTicks;
await sleep(2500);
ok('gate da rodada 2 também segura sem cliques', A.minuteTicks === ticksBeforeR2);

await A.conn.invoke('ReadyForRound', CODE);
await B.conn.invoke('ReadyForRound', CODE);
ok('rodada 2 abriu após os 2 cliques',
  await waitUntil('r2 rolando', () => A.snap?.currentRound?.status === 'rolando', 8000));

ok('RODADA 3 anunciada após a 2 (o torneio NÃO trava)',
  await waitUntil('announce r3', () => roundLabel(A) === 'Rodada 3' && A.snap.currentRound.status === 'aguardando', 60000));
ok('PRÉ-JOGO renderizaria na rodada 3', wouldShowPrematch(A) && wouldShowPrematch(B));

await A.conn.stop();
await B.conn.stop();

console.log('\n--- timeline do anfitrião ---');
A.log.slice(0, 25).forEach(l => console.log('   ' + l));
console.log(failed === 0 ? '\n✅ E2E COMPLETO: fluxo do pré-jogo OK nas rodadas 1, 2 e 3'
  : `\n❌ ${failed} verificações falharam`);
process.exit(failed === 0 ? 0 : 1);
