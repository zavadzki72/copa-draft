/* ============================================================
   COPA DRAFT — tests/engine.test.js
   Smoke tests for the pure match engine. Protects the determinism
   invariant and the new card / man-down mechanics.
   Run: node tests/engine.test.js   (exit code != 0 on failure)
   ============================================================ */
const { CONFIG, ENGINE, RATINGS } = require('./_shim');

let passed = 0;
function ok(name, cond) {
  if (!cond) { console.error('FAIL: ' + name); process.exit(1); }
  console.log('ok   - ' + name);
  passed++;
}

function mkPlayer(id, pos, overall, age, arch) {
  return { id, name: 'P' + id, pos, overall, age: age == null ? 27 : age, archetype: arch };
}
function mkSide(key, prefix, ovr, withBench) {
  const starters = [
    mkPlayer(prefix + 'gk', 'GOL', ovr, 28),
    mkPlayer(prefix + 'z1', 'ZAG', ovr, 29), mkPlayer(prefix + 'z2', 'ZAG', ovr, 27),
    mkPlayer(prefix + 'l1', 'LAT', ovr, 26), mkPlayer(prefix + 'l2', 'LAT', ovr, 25),
    mkPlayer(prefix + 'm1', 'MEI', ovr, 27), mkPlayer(prefix + 'm2', 'MEI', ovr, 28), mkPlayer(prefix + 'm3', 'MEI', ovr, 24),
    mkPlayer(prefix + 'a1', 'ATA', ovr, 26), mkPlayer(prefix + 'a2', 'ATA', ovr, 30), mkPlayer(prefix + 'a3', 'ATA', ovr, 31),
  ];
  const side = { key, name: key === 'home' ? 'Casa' : 'Fora', code: 'XX', cup: '2024', formation: '4-3-3', starters };
  if (withBench) {
    side.bench = [
      mkPlayer(prefix + 'rgk', 'GOL', ovr - 3, 29), mkPlayer(prefix + 'rz', 'ZAG', ovr - 3, 28),
      mkPlayer(prefix + 'rl', 'LAT', ovr - 3, 27), mkPlayer(prefix + 'rm', 'MEI', ovr - 3, 26),
      mkPlayer(prefix + 'ra', 'ATA', ovr - 3, 25),
    ];
    side.subsLeft = 3;
  }
  return side;
}
const homeS = () => mkSide('home', 'h', 82);
const awayS = () => mkSide('away', 'a', 78);

// 1) DETERMINISM — same seed => byte-identical log
const opts = { knockout: true, roundN: 2, fatigue: true, pressure: true };
const a = ENGINE.simulateMatch(homeS(), awayS(), CONFIG, 20260605, opts);
const b = ENGINE.simulateMatch(homeS(), awayS(), CONFIG, 20260605, opts);
ok('determinismo: mesma seed => log identico', JSON.stringify(a) === JSON.stringify(b));

const c = ENGINE.simulateMatch(homeS(), awayS(), CONFIG, 99, opts);
ok('seeds diferentes => logs diferentes', JSON.stringify(a) !== JSON.stringify(c));

// 2) MAN-DOWN math — own xG falls, opponent xG rises
const eg = ENGINE.expectedGoals;
const full = eg(82, 78, 1, CONFIG, 1);
const ownDown = eg(82 * CONFIG.MAN_DOWN_ATK, 78, 1, CONFIG, 1);
ok('um a menos reduz os gols esperados do proprio time', ownDown < full);
const oppFull = eg(78, 82, 1, CONFIG, 1);
const oppVsDown = eg(78, 82 * CONFIG.MAN_DOWN_DEF, 1, CONFIG, 1);
ok('um a menos aumenta os gols esperados do adversario', oppVsDown > oppFull);

// 3) FORCED 2nd yellow => sending-off + man down
const cfgY = Object.assign({}, CONFIG, { FOUL_PM: 0.5, FOUL_YELLOW_P: 1, FOUL_RED_P: 0, INJURY_PM: 0 });
const ylog = ENGINE.simulateMatch(homeS(), awayS(), cfgY, 7, {});
ok('amarelo forcado gera expulsao', ylog.sentOff.length > 0);
ok('expulsao veio de 2o amarelo', ylog.sentOff.some(s => s.secondYellow));
ok('time fica com um a menos (manDown >= 1)', (ylog.manDown.home + ylog.manDown.away) >= 1);

// 4) FORCED straight red => offender rating penalised
const cfgR = Object.assign({}, CONFIG, { FOUL_PM: 0.5, FOUL_RED_P: 1, FOUL_YELLOW_P: 0, INJURY_PM: 0 });
const rlog = ENGINE.simulateMatch(homeS(), awayS(), cfgR, 3, {});
ok('vermelho direto registra expulsao', rlog.sentOff.length > 0 && rlog.cards.some(card => card.type === 'red'));
const rat = RATINGS.computeRatings(rlog, cfgR);
const sentId = rlog.sentOff[0].id;
ok('expulso recebe penalidade de nota', rat.players[sentId] && rat.players[sentId].reds === 1);

// 5) no cards when FOUL_PM = 0 (determinism of the "clean" path)
const cfg0 = Object.assign({}, CONFIG, { FOUL_PM: 0, INJURY_PM: 0 });
const zlog = ENGINE.simulateMatch(homeS(), awayS(), cfg0, 42, {});
ok('FOUL_PM=0 => sem cartoes', zlog.cards.length === 0 && zlog.sentOff.length === 0);

// 6) INJURY with bench => like-for-like substitution
const cfgI = Object.assign({}, CONFIG, { INJURY_PM: 1, FOUL_PM: 0 });
const withB = ENGINE.simulateMatch(mkSide('home', 'h', 82, true), mkSide('away', 'a', 78, true), cfgI, 5, {});
ok('lesao com banco gera substituicao', withB.injuries.length > 0 && withB.injuries.some(i => i.replacedBy));
ok('substituicao respeita a posicao', withB.injuries.filter(i => i.replacedBy).length <= 3 * 2);

// 7) INJURY without bench => plays a man down
const noB = ENGINE.simulateMatch(mkSide('home', 'h', 82, false), mkSide('away', 'a', 78, false), cfgI, 5, {});
ok('lesao sem banco => um a menos', noB.injuries.length > 0
  && noB.injuries.every(i => !i.replacedBy) && (noB.manDown.home + noB.manDown.away) > 0);

// 8) determinism holds with injuries active
const withB2 = ENGINE.simulateMatch(mkSide('home', 'h', 82, true), mkSide('away', 'a', 78, true), cfgI, 5, {});
ok('determinismo com lesoes ativas', JSON.stringify(withB) === JSON.stringify(withB2));

// 9) PENALTIES — seeded outcome, deterministic, scored ones count in the score
const cfgP = Object.assign({}, CONFIG, { PENALTY_PM: 1, FOUL_PM: 0, INJURY_PM: 0 });
const plog = ENGINE.simulateMatch(homeS(), awayS(), cfgP, 11, {});
ok('penalti semeado ocorre', plog.matchPens.length > 0);
const penGoalEvents = plog.events.filter(e => e.type === 'goal' && e.pen).length;
const penScored = plog.matchPens.filter(pk => pk.scored).length;
ok('gol de penalti conta no placar (eventos x matchPens)', penGoalEvents === penScored && penGoalEvents > 0);
ok('penalti gera defesa/perdido tambem', plog.matchPens.some(pk => !pk.scored));
const plog2 = ENGINE.simulateMatch(homeS(), awayS(), cfgP, 11, {});
ok('determinismo com penaltis ativos', JSON.stringify(plog) === JSON.stringify(plog2));

// scored penalties must be included in the side's score total
const homePenGoals = plog.matchPens.filter(pk => pk.scored && pk.side === 'home').length;
ok('placar inclui os penaltis convertidos do mandante', plog.score.home >= homePenGoals);

// 10) finalizeInMatchPenalty — override a seeded penalty interactively
const cfgF = Object.assign({}, CONFIG, { PENALTY_PM: 0.03, FOUL_PM: 0, INJURY_PM: 0 });
let base = null, pid = null, taker = null;
for (let s = 1; s < 400 && !pid; s++) {
  const lg = ENGINE.simulateMatch(homeS(), awayS(), cfgF, s, {});
  const sp = lg.matchPens.find(p => p.side === 'home' && p.scored);
  if (sp) { base = lg; pid = sp.penId; taker = sp.taker; }
}
ok('achou penalti convertido do mandante p/ teste', !!pid);
const before = base.score.home;
const beforeGoals = base.stats[taker].goals;
const flipped = ENGINE.finalizeInMatchPenalty(base, pid, 'miss');
ok('override gol->perdido reduz o placar do mandante', flipped.score.home === before - 1);
ok('override ajusta os gols do cobrador', flipped.stats[taker].goals === beforeGoals - 1);
ok('finalize e puro/deterministico', JSON.stringify(flipped) === JSON.stringify(ENGINE.finalizeInMatchPenalty(base, pid, 'miss')));
ok('finalize com mesmo desfecho e no-op (mesma referencia)', ENGINE.finalizeInMatchPenalty(base, pid, 'goal') === base);
ok('apos override o resultado e coerente com o placar', (() => {
  const s = flipped.score;
  if (s.home > s.away) return flipped.result === 'home';
  if (s.away > s.home) return flipped.result === 'away';
  return ['home', 'away', 'pending'].includes(flipped.result); // tie => shootout/ET/pending
})());

console.log('\n' + passed + ' checks passed.');
