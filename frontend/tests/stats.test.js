/* ============================================================
   COPA DRAFT — tests/stats.test.js
   Campaign awards aggregator (player's team only).
   Run: node tests/stats.test.js
   ============================================================ */
const { CONFIG, STATS } = require('./_shim');

let passed = 0;
function ok(name, cond) {
  if (!cond) { console.error('FAIL: ' + name); process.exit(1); }
  console.log('ok   - ' + name);
  passed++;
}

// rating entry for one player in one match
const P = (id, pos, goals, assists, saves, rating) =>
  ({ id, name: id.toUpperCase(), pos, side: 'home', goals, assists, saves, bigChances: 0, yellows: 0, reds: 0, rating });
const mkRatings = (arr) => {
  const players = {};
  arr.forEach(p => { players[p.id] = p; });
  // an opponent player that must be ignored (away side)
  players.opp1 = { id: 'opp1', name: 'OPP', pos: 'ATA', side: 'away', goals: 9, assists: 9, saves: 0, bigChances: 0, yellows: 0, reds: 0, rating: 9.9 };
  return { players, motm: null };
};
const mkLog = (concededHome) => ({ conceded: { home: concededHome, away: 0 }, score: { home: 0, away: concededHome } });

// ---- a 2-match campaign ----
let acc = {};
acc = STATS.accumulate(acc, mkRatings([
  P('a', 'ATA', 2, 0, 0, 8.0),
  P('b', 'MEI', 1, 2, 0, 7.5),
  P('c', 'GOL', 0, 0, 4, 7.0),
  P('d', 'ATA', 1, 0, 0, 9.0),
]), mkLog(0), CONFIG);   // clean sheet
acc = STATS.accumulate(acc, mkRatings([
  P('a', 'ATA', 1, 0, 0, 7.0),
  P('b', 'MEI', 0, 1, 0, 8.5),
  P('c', 'GOL', 0, 0, 2, 6.5),
]), mkLog(1), CONFIG);   // conceded 1 (d did not play match 2)

ok('adversario (away) e ignorado', !acc.opp1);
ok('acumula gols ao longo da campanha', acc.a.goals === 3 && acc.a.matches === 2);
ok('goleiro acumula defesas e clean sheets', acc.c.saves === 6 && acc.c.cleanSheets === 1);

const aw = STATS.compute(acc, CONFIG);
ok('artilheiro = maior goleador', aw.artilheiro.id === 'a' && aw.artilheiro.goals === 3);
ok('melhor jogador respeita participacao minima', aw.melhorJogador.id === 'b'); // d tem 9.0 mas so 1 jogo
ok('d (1 jogo) nao e melhor jogador', acc.d.matches === 1 && aw.melhorJogador.id !== 'd');
ok('melhor goleiro = c', aw.melhorGoleiro.id === 'c' && aw.melhorGoleiro.cleanSheets === 1);
ok('maestro = mais assistencias', aw.maestro.id === 'b' && aw.maestro.assists === 3);

// ---- tiebreak: equal goals -> more assists wins ----
let acc2 = {};
acc2 = STATS.accumulate(acc2, mkRatings([
  P('x', 'ATA', 3, 1, 0, 7.0),
  P('y', 'ATA', 3, 0, 0, 7.0),
]), mkLog(2), CONFIG);
acc2 = STATS.accumulate(acc2, mkRatings([P('x', 'ATA', 0, 0, 0, 7.0), P('y', 'ATA', 0, 0, 0, 7.0)]), mkLog(2), CONFIG);
ok('desempate de artilheiro por assistencias', STATS.compute(acc2, CONFIG).artilheiro.id === 'x');

// ---- empty campaign -> no awards, no crash ----
const none = STATS.compute({}, CONFIG);
ok('campanha vazia nao quebra', none.artilheiro === null && none.melhorGoleiro === null);

console.log('\n' + passed + ' checks passed.');
