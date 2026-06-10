/* ============================================================
   COPA DRAFT — tests/team.test.js
   Campaign player-status (suspension / injury) helpers.
   Run: node tests/team.test.js
   ============================================================ */
const { CONFIG, TEAM } = require('./_shim');

let passed = 0;
function ok(name, cond) {
  if (!cond) { console.error('FAIL: ' + name); process.exit(1); }
  console.log('ok   - ' + name);
  passed++;
}
const fakeLog = (seed, sentOff, injuries) => ({ seed, sentOff: sentOff || [], injuries: injuries || [] });

// 1) sending-off -> suspended for SUSPENSION_MATCHES
let st = TEAM.advancePlayerStatus({}, fakeLog(1, [{ id: 'p1', side: 'home', minute: 30 }], []), CONFIG);
ok('expulsao gera suspensao', st.p1 && st.p1.suspended === CONFIG.SUSPENSION_MATCHES);
ok('statusOf reporta suspenso', TEAM.statusOf(st, 'p1').kind === 'suspended');

// 2) one phase later (player sat out) -> available again
let st2 = TEAM.advancePlayerStatus(st, fakeLog(2, [], []), CONFIG);
ok('suspensao some apos cumprir uma fase', !TEAM.statusOf(st2, 'p1'));

// 3) injury -> out for MIN..MAX phases, deterministic length
let sti = TEAM.advancePlayerStatus({}, fakeLog(7, [], [{ id: 'p2', side: 'home', minute: 40, replacedBy: null }]), CONFIG);
ok('lesao gera afastamento na faixa', sti.p2 && sti.p2.injured >= CONFIG.INJURY_PHASES_MIN && sti.p2.injured <= CONFIG.INJURY_PHASES_MAX);
ok('duracao de lesao e deterministica', TEAM.injuryDuration(7, 'p2', CONFIG) === TEAM.injuryDuration(7, 'p2', CONFIG));

// 4) opponent (away) cards/injuries are ignored — only my team carries status
let sta = TEAM.advancePlayerStatus({}, fakeLog(3, [{ id: 'o1', side: 'away', minute: 10 }], [{ id: 'o2', side: 'away', minute: 20 }]), CONFIG);
ok('cartoes/lesoes do adversario sao ignorados', Object.keys(sta).length === 0);

// 5) an N-phase injury blocks exactly N matches, then frees
const dur = TEAM.injuryDuration(7, 'p2', CONFIG);
let s = sti;
for (let i = 0; i < dur; i++) {
  ok('lesionado bloqueado na fase ' + (i + 1), !!TEAM.statusOf(s, 'p2'));
  s = TEAM.advancePlayerStatus(s, fakeLog(100 + i, [], []), CONFIG);
}
ok('liberado apos cumprir a lesao', !TEAM.statusOf(s, 'p2'));

// ---------- ETAPA 6: phase strength scaling ----------
const { RNG } = require('./_shim');

// 6a) determinism: same seed => same bracket opponents per phase
const bA = TEAM.buildBracket(RNG.makeRng(12345));
const bB = TEAM.buildBracket(RNG.makeRng(12345));
ok('bracket deterministico por seed', bA.every((r, i) => r.opponent.id === bB[i].opponent.id));

// 6b) monotonicity (expected): averaging over many seeds, the final's opponent
// average is >= the first round's. Scaling pulls later phases toward stronger squads.
function avgFirstLast(nSeeds) {
  let firstSum = 0, lastSum = 0;
  for (let s = 0; s < nSeeds; s++) {
    const b = TEAM.buildBracket(RNG.makeRng(1000 + s * 7));
    firstSum += b[0].oppAvg;
    lastSum += b[b.length - 1].oppAvg;
  }
  return { first: firstSum / nSeeds, last: lastSum / nSeeds };
}
const mono = avgFirstLast(200);
ok('escala de forca: final mais forte que a 1a fase (media)', mono.last > mono.first);

// 6c) phaseWeight peaks at the target strength
const { SQUADS } = require('./_shim');
const pool = SQUADS;
const strongest = [...pool].sort((a, b) => TEAM.squadAvg(b) - TEAM.squadAvg(a))[0];
const weakest = [...pool].sort((a, b) => TEAM.squadAvg(a) - TEAM.squadAvg(b))[0];
ok('forte pesa mais para alvo alto', TEAM.phaseWeight(strongest, pool, 1.0, 5) > TEAM.phaseWeight(weakest, pool, 1.0, 5));
ok('fraco pesa mais para alvo baixo', TEAM.phaseWeight(weakest, pool, 0.0, 5) > TEAM.phaseWeight(strongest, pool, 0.0, 5));

// 6d) draft weight grows with squad average; bias 0 => uniform
ok('peso do draft cresce com a forca', TEAM.squadDrawWeight(strongest, CONFIG) >= TEAM.squadDrawWeight(weakest, CONFIG));
ok('bias 0 => peso uniforme', TEAM.squadDrawWeight(strongest, { DRAFT_STRENGTH_BIAS: 0 }) === TEAM.squadDrawWeight(weakest, { DRAFT_STRENGTH_BIAS: 0 }));

// ---------- ETAPA 7: buildGroup + groupStandings ----------
// 7a) buildGroup deterministic + shape
const g1 = TEAM.buildGroup(RNG.makeRng(999));
const g2 = TEAM.buildGroup(RNG.makeRng(999));
ok('buildGroup deterministico', g1.rivals.map(r => r.id).join() === g2.rivals.map(r => r.id).join());
ok('grupo tem GROUP_SIZE-1 rivais', g1.rivals.length === CONFIG.GROUP_SIZE - 1);
ok('round-robin: cada time joga GROUP_SIZE-1 vezes', (() => {
  const counts = {};
  g1.teams.forEach(t => { counts[t] = 0; });
  g1.fixtures.forEach(f => { counts[f.home]++; counts[f.away]++; });
  return Object.values(counts).every(c => c === CONFIG.GROUP_SIZE - 1);
})());
ok('jogador joga GROUP_SIZE-1 partidas', g1.fixtures.filter(f => f.isPlayer).length === CONFIG.GROUP_SIZE - 1);

// 7b) standings points/goals from a constructed group
const A = 'me', B = g1.teams[1], Cc = g1.teams[2], Dd = g1.teams[3];
const grp = { teams: [A, B, Cc, Dd], rivals: g1.rivals, fixtures: [
  { round: 0, home: A, away: B, result: { home: 2, away: 0 } }, // A win
  { round: 0, home: Cc, away: Dd, result: { home: 1, away: 1 } }, // draw
  { round: 1, home: A, away: Cc, result: { home: 1, away: 0 } }, // A win
  { round: 1, home: B, away: Dd, result: { home: 0, away: 3 } }, // D win
  { round: 2, home: A, away: Dd, result: { home: 0, away: 0 } }, // draw
  { round: 2, home: B, away: Cc, result: { home: 2, away: 2 } }, // draw
]};
const tbl = TEAM.groupStandings(grp);
const row = id => tbl.find(r => r.teamRef === id);
ok('A: 2V 1E => 7 pts', row(A).P === 7 && row(A).V === 2 && row(A).E === 1);
ok('A no topo', tbl[0].teamRef === A);
ok('A GP/GC/SG corretos', row(A).GP === 3 && row(A).GC === 0 && row(A).SG === 3);
ok('D: 1V 2E => 5 pts', row(Dd).P === 5 && row(Dd).V === 1 && row(Dd).E === 2 && row(Dd).D === 0);

// 7c) tiebreak stability: equal P/SG/GP -> stable draw order
const tieGrp = { teams: ['me', 'x', 'y', 'z'], rivals: [], fixtures: [
  { round: 0, home: 'me', away: 'x', result: { home: 1, away: 0 } },
  { round: 0, home: 'y', away: 'z', result: { home: 1, away: 0 } },
]};
const tieTbl = TEAM.groupStandings(tieGrp);
// 'me' and 'y' both 3pts/SG+1/GP1 — 'me' (order 0) ranks above 'y' (order 2)
ok('desempate estavel pela ordem de sorteio', tieTbl[0].teamRef === 'me' && tieTbl[1].teamRef === 'y');

console.log('\n' + passed + ' checks passed.');
