/* E2E COMPLETO contra a stack real (localhost:8090) — 2 jogadores com o
   cliente SignalR oficial, cobrindo: lobby+velocidade, draft com reservas,
   ready-gate/Avançar, skip de rodada (DoneWatching), torneio inteiro até o
   campeão, espectador de eliminado, tela final e REVANCHE (PlayAgain). */
import signalR from '@microsoft/signalr';
import fs from 'fs';

const BASE = 'http://localhost:8090';
const { TOKEN_A, TOKEN_B, USER_A, USER_B, CODE } = process.env;

let failed = 0;
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const ok = (name, cond) => {
  console.log(`${cond ? '  ok ' : 'FALHA'} [${ts()}] ${name}`);
  if (!cond) failed++;
};
const info = (m) => console.log(`   ·  [${ts()}] ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- times válidos (com 1 reserva GOL) a partir do squads.json ----
const squads = JSON.parse(fs.readFileSync(new URL('./squads.json', import.meta.url)));
function pickTeam(squad) {
  const need = { GOL: 1, ZAG: 2, LAT: 2, MEI: 3, ATA: 3 };
  const xi = [];
  for (const [pos, n] of Object.entries(need)) {
    xi.push(...squad.players.filter(p => p.pos === pos).sort((a, b) => b.overall - a.overall).slice(0, n));
  }
  if (xi.length !== 11) return null;
  const taken = new Set(xi.map(p => p.id));
  const benchGk = squad.players.find(p => p.pos === 'GOL' && !taken.has(p.id));
  if (!benchGk) return null;
  return { formation: '4-3-3', starters: xi.map(p => p.id), bench: [benchGk.id], captainId: xi[0].id };
}
const teams = squads.map(pickTeam).filter(Boolean);

function client(name, token) {
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${BASE}/hubs/lobby`, {
      accessTokenFactory: () => token,
      transport: signalR.HttpTransportType.WebSockets,
      skipNegotiation: true,
    })
    .build();
  const st = {
    name, conn, snap: null, yourMatch: null, room: null, lastErr: null,
    minuteTicks: 0, lastMinute: 0, progress: null, watch: null, finished: null,
  };
  conn.on('RoomState', (s) => { st.room = s; });
  conn.on('TournamentState', (s) => { st.snap = s; });
  conn.on('YourMatch', (m) => { st.yourMatch = m; });
  conn.on('WatchMatch', (m) => { st.watch = m; });
  conn.on('RoundReadyProgress', (p) => { st.progress = p; });
  conn.on('MinuteTick', (m) => { st.minuteTicks++; st.lastMinute = m; });
  conn.on('TournamentFinished', (f) => { st.finished = f; });
  conn.on('LobbyError', (e) => { st.lastErr = e; });
  return st;
}

async function waitUntil(desc, fn, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await sleep(120);
  }
  console.log(`  (timeout: ${desc})`);
  return false;
}

const round = (c) => c.snap?.currentRound || null;
const myTeam = (uid) => 'h:' + uid;
const inRound = (c, uid) => !!round(c)?.fixtures.some(f => f.homeId === myTeam(uid) || f.awayId === myTeam(uid));

const A = client('A', TOKEN_A);
const B = client('B', TOKEN_B);
await A.conn.start(); await B.conn.start();

// ================= LOBBY =================
await A.conn.invoke('JoinRoom', CODE);
await B.conn.invoke('JoinRoom', CODE);
ok('lobby: 2 jogadores na sala', await waitUntil('2p', () => A.room?.players?.length === 2));
ok('lobby: velocidade padrão "rapido"', A.room.speed === 'rapido');

// (#2) velocidade: não-host rejeitado; host troca e volta
B.lastErr = null;
await B.conn.invoke('SetRoomSpeed', CODE, 'super');
ok('lobby: convidado NÃO muda a velocidade', await waitUntil('err', () => (B.lastErr || '').includes('anfitrião')));
await A.conn.invoke('SetRoomSpeed', CODE, 'super');
ok('lobby: anfitrião muda p/ super (broadcast)', await waitUntil('spd', () => B.room?.speed === 'super'));
await A.conn.invoke('SetRoomSpeed', CODE, 'rapido');
await waitUntil('spd2', () => A.room?.speed === 'rapido');

// ================= DRAFT =================
await A.conn.invoke('StartDraft', CODE);
await A.conn.invoke('SubmitTeam', CODE, teams[0]);
await B.conn.invoke('SubmitTeam', CODE, teams[9]);

// ================= RODADA 1: gate + payloads =================
ok('r1 anunciada (status aguardando no snapshot)',
  await waitUntil('announce', () => round(A)?.status === 'aguardando'));
ok('(#3) readyDeadline presente e no futuro',
  !!round(A).readyDeadline && new Date(round(A).readyDeadline) > new Date());
ok('(#2) pace da sala aplicado no torneio (rapido=250ms/min)', round(A).paceMsPerMinute === 250);
ok('(#6) YourMatch traz os RESERVAS (banco de 1 GOL)',
  await waitUntil('ym', () => A.yourMatch?.bench?.length === 1 && B.yourMatch?.bench?.length === 1));
ok('pré-jogo renderizável p/ ambos (fixture na rodada)', inRound(A, USER_A) && inRound(B, USER_B));

await sleep(2500);
ok('gate SEGURA sem cliques (0 ticks)', A.minuteTicks === 0);
await A.conn.invoke('ReadyForRound', CODE);
ok('progresso 1/2', await waitUntil('prog', () => A.progress?.ready === 1));
await B.conn.invoke('ReadyForRound', CODE);
ok('2º clique abre a rodada', await waitUntil('live', () => round(A)?.status === 'rolando', 8000));

// (#1) skip: todos terminaram de assistir → resolve na hora
await waitUntil('ticks', () => A.minuteTicks >= 2, 5000);
const skipAt = Date.now();
await A.conn.invoke('DoneWatching', CODE);
await B.conn.invoke('DoneWatching', CODE);
ok('(#1) rodada PULA quando todos terminam (fim < 8s; cheia seria 22s)',
  await waitUntil('skip', () => !round(A) || round(A).label !== 'Rodada 1', 8000)
  && (Date.now() - skipAt) < 8000);
ok('(#1) mesmo pulando, todos os 90 ticks/MatchFinished saíram', A.lastMinute === 90);

// ================= TORNEIO ATÉ O CAMPEÃO (adaptativo) =================
const labels = ['Rodada 1'];
let spectChecked = false;
for (let guard = 0; guard < 12 && A.snap?.phase !== 'encerrada'; guard++) {
  if (!await waitUntil('próx. anúncio/fim', () => round(A)?.status === 'aguardando' || A.snap?.phase === 'encerrada', 30000)) break;
  if (A.snap.phase === 'encerrada') break;
  const label = round(A).label;
  labels.push(label);
  info(`rodada: ${label} (fase ${A.snap.phase}) — A joga? ${inRound(A, USER_A)} B joga? ${inRound(B, USER_B)}`);

  // espectador: se exatamente um humano caiu, o eliminado assiste o vivo
  if (!spectChecked && A.snap.phase === 'mata-mata') {
    const aIn = inRound(A, USER_A), bIn = inRound(B, USER_B);
    if (aIn !== bIn) {
      const dead = aIn ? B : A;
      const aliveTeam = myTeam(aIn ? USER_A : USER_B);
      await A.conn.invoke('ReadyForRound', CODE).catch(() => {});
      await B.conn.invoke('ReadyForRound', CODE).catch(() => {});
      await waitUntil('live spect', () => round(dead)?.status === 'rolando', 70000);
      const fx = round(dead).fixtures.find(f => f.homeId === aliveTeam || f.awayId === aliveTeam);
      await dead.conn.invoke('WatchFixture', CODE, fx.fixtureId);
      ok('espectador: eliminado recebe WatchMatch do time vivo',
        await waitUntil('watch', () => dead.watch?.fixtureId === fx.fixtureId, 5000));
      spectChecked = true;
      await A.conn.invoke('DoneWatching', CODE).catch(() => {});
      await B.conn.invoke('DoneWatching', CODE).catch(() => {});
      await waitUntil('fim rodada', () => !round(A) || round(A).label !== label || A.snap.phase === 'encerrada', 30000);
      continue;
    }
  }

  await A.conn.invoke('ReadyForRound', CODE).catch(() => {});
  await B.conn.invoke('ReadyForRound', CODE).catch(() => {});
  await waitUntil('rolando', () => round(A)?.status === 'rolando' || A.snap.phase === 'encerrada', 75000);
  await A.conn.invoke('DoneWatching', CODE).catch(() => {});
  await B.conn.invoke('DoneWatching', CODE).catch(() => {});
  await waitUntil('fim rodada', () => !round(A) || round(A).label !== label || A.snap.phase === 'encerrada', 30000);
}
ok('torneio 1 chegou ao campeão', await waitUntil('fim', () => A.snap?.phase === 'encerrada' && !!A.snap.championTeamId, 60000));
ok('TournamentFinished recebido', !!A.finished);
ok('grupos completos antes do mata-mata', labels.filter(l => l.startsWith('Rodada')).length === 3);
info(`rodadas: ${labels.join(' → ')} | campeão: ${A.snap.championTeamId}`);
if (!spectChecked) info('cenário espectador: humanos não divergiram nesta seed (ok)');

// ================= REVANCHE (PlayAgain) =================
B.lastErr = null;
await B.conn.invoke('PlayAgain', CODE);
ok('revanche: convidado rejeitado', await waitUntil('err', () => (B.lastErr || '').includes('anfitrião')));
await A.conn.invoke('PlayAgain', CODE);
ok('revanche: sala volta ao lobby', await waitUntil('lobby', () => A.room?.state === 'aguardando'));
ok('revanche: ready zerado e times limpos',
  A.room.players.every(p => !p.ready && !p.hasTeam));
ok('revanche: velocidade da sala PRESERVADA', A.room.speed === 'rapido');

// torneio 2 inteiro (rápido, com skips)
A.snap = null; A.finished = null; A.minuteTicks = 0;
await A.conn.invoke('StartDraft', CODE);
await A.conn.invoke('SubmitTeam', CODE, teams[3]);
await B.conn.invoke('SubmitTeam', CODE, teams[12]);
for (let guard = 0; guard < 12 && A.snap?.phase !== 'encerrada'; guard++) {
  if (!await waitUntil('anúncio t2', () => round(A)?.status === 'aguardando' || A.snap?.phase === 'encerrada', 30000)) break;
  if (A.snap.phase === 'encerrada') break;
  const label = round(A).label;
  await A.conn.invoke('ReadyForRound', CODE).catch(() => {});
  await B.conn.invoke('ReadyForRound', CODE).catch(() => {});
  await waitUntil('rolando t2', () => round(A)?.status === 'rolando' || A.snap.phase === 'encerrada', 75000);
  await A.conn.invoke('DoneWatching', CODE).catch(() => {});
  await B.conn.invoke('DoneWatching', CODE).catch(() => {});
  await waitUntil('fim t2', () => !round(A) || round(A).label !== label || A.snap.phase === 'encerrada', 30000);
}
ok('REVANCHE também chega ao campeão', await waitUntil('fim2', () => A.snap?.phase === 'encerrada' && !!A.snap.championTeamId, 60000));
info(`campeão da revanche: ${A.snap.championTeamId}`);

await A.conn.stop(); await B.conn.stop();
console.log(failed === 0
  ? `\n✅ E2E COMPLETO (${ts()}): lobby+velocidade, gate, skip, torneio, espectador, fim e revanche OK`
  : `\n❌ ${failed} verificações falharam`);
process.exit(failed === 0 ? 0 : 1);
