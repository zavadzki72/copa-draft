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

console.log('\n' + passed + ' checks passed.');
