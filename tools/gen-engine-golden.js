/* ============================================================
   COPA DRAFT — tools/gen-engine-golden.js
   Runs the JS reference engine over a fixed matrix of matches and
   serializes inputs + full logs, so the C# port can be asserted for
   exact parity (CopaDraft.Engine.Tests/golden/engine.json).

   Coverage: regulation, knockout+ET, knockout+ET+auto-shootout,
   injuries (with/without sub), red cards, in-match penalties,
   captain/chemistry, pressure and fatigue.

   Run: node tools/gen-engine-golden.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
['config.js', 'lib/i18n.js', 'lib/rng.js', 'lib/derive.js', 'data/squads.js', 'lib/team.js', 'lib/engine.js']
  .forEach(rel => vm.runInContext(fs.readFileSync(path.join(root, 'frontend', rel), 'utf8'), sandbox, { filename: rel }));

const { SQUADS, TEAM, ENGINE, CONFIG } = sandbox.window;

// strip derived attrs from input players (C# re-derives; values are identical
// by the DERIVE parity suite) and keep only the raw fields the engine reads.
const rawPlayer = (p) => ({
  id: p.id, name: p.name, pos: p.pos, age: p.age, overall: p.overall,
  archetype: p.archetype, leader: !!p.leader, team: p.team, code: p.code, cup: p.cup,
  fatigue: p.fatigue || 0,
});

// bench: best remaining player per position group (stable, deterministic)
function makeBench(squad, starters) {
  const taken = new Set(starters.map(p => p.id));
  const bench = [];
  ['GOL', 'ZAG', 'LAT', 'MEI', 'ATA'].forEach(pos => {
    const cand = squad.players.filter(p => p.pos === pos && !taken.has(p.id))
      .sort((a, b) => b.overall - a.overall)[0];
    if (cand) bench.push(cand);
  });
  return bench;
}

function makeSide(squad, formation, { bench = false, subsLeft = 0, captain = false, fatigue = null } = {}) {
  let starters = TEAM.bestXI(squad, formation);
  if (fatigue) starters = starters.map((p, i) => ({ ...p, fatigue: fatigue[i % fatigue.length] }));
  const side = {
    name: squad.team, code: squad.code, cup: squad.cup, formation,
    starters, subsLeft,
    bench: bench ? makeBench(squad, starters) : [],
  };
  if (captain) side.captainId = starters[0].id;
  return side;
}

const serializeSide = (s) => ({
  name: s.name, code: s.code, cup: s.cup, dream: !!s.dream, formation: s.formation,
  subsLeft: s.subsLeft || 0, captainId: s.captainId || null,
  starters: s.starters.map(rawPlayer), bench: (s.bench || []).map(rawPlayer),
});

const vectors = [];
function addVector(name, home, away, seed, opts) {
  const log = ENGINE.simulateMatch(home, away, CONFIG, seed, opts);
  vectors.push({ name, seed, opts: opts || {}, home: serializeSide(home), away: serializeSide(away), log });
  return log;
}

// scan seeds until the produced log satisfies pred
function scanSeed(home, away, opts, pred, from, tries = 6000) {
  for (let seed = from; seed < from + tries; seed++) {
    const log = ENGINE.simulateMatch(home, away, CONFIG, seed, opts);
    if (pred(log)) return seed;
  }
  throw new Error('seed scan exhausted');
}

const pairs = [
  { h: SQUADS[0], a: SQUADS[50], f: '4-3-3' },
  { h: SQUADS[100], a: SQUADS[150], f: '4-4-2' },
  { h: SQUADS[200], a: SQUADS[250], f: '3-5-2' },
  { h: SQUADS[300], a: SQUADS[350], f: '5-3-2' },
];

pairs.forEach((pr, pi) => {
  const home = makeSide(pr.h, pr.f, { bench: true, subsLeft: CONFIG.SUBS_MAX });
  const away = makeSide(pr.a, pr.f, { bench: true, subsLeft: CONFIG.SUBS_MAX });
  // regulation (group-stage style)
  for (let k = 0; k < 4; k++) addVector(`p${pi}-reg-${k}`, home, away, 100 + pi * 10 + k, { knockout: false });
  // knockout (may or may not go to ET)
  for (let k = 0; k < 3; k++) addVector(`p${pi}-ko-${k}`, home, away, 500 + pi * 10 + k, { knockout: true });
  // guaranteed ET + auto shootout
  const sPens = scanSeed(home, away, { knockout: true }, l => l.extraTime && l.penalties, 1000 + pi * 100);
  addVector(`p${pi}-ko-pens`, home, away, sPens, { knockout: true });
  // ET decided without shootout
  const sEt = scanSeed(home, away, { knockout: true }, l => l.extraTime && !l.penalties, 2000 + pi * 100);
  addVector(`p${pi}-ko-et`, home, away, sEt, { knockout: true });
});

// injury WITH substitution (bench + subsLeft)
{
  const home = makeSide(pairs[0].h, '4-3-3', { bench: true, subsLeft: CONFIG.SUBS_MAX });
  const away = makeSide(pairs[0].a, '4-3-3', { bench: true, subsLeft: CONFIG.SUBS_MAX });
  const s = scanSeed(home, away, { knockout: false }, l => l.injuries.some(i => i.replacedBy), 3000);
  addVector('injury-sub', home, away, s, { knockout: false });
}
// injury WITHOUT substitution (no bench)
{
  const home = makeSide(pairs[1].h, '4-4-2');
  const away = makeSide(pairs[1].a, '4-4-2');
  const s = scanSeed(home, away, { knockout: false }, l => l.injuries.some(i => !i.replacedBy), 3500);
  addVector('injury-nosub', home, away, s, { knockout: false });
}
// red card (sent off)
{
  const home = makeSide(pairs[2].h, '3-5-2');
  const away = makeSide(pairs[2].a, '3-5-2');
  const s = scanSeed(home, away, { knockout: false }, l => l.sentOff.length > 0, 4000);
  addVector('redcard', home, away, s, { knockout: false });
}
// in-match penalty
{
  const home = makeSide(pairs[3].h, '5-3-2');
  const away = makeSide(pairs[3].a, '5-3-2');
  const s = scanSeed(home, away, { knockout: false }, l => l.matchPens.length > 0, 4500);
  addVector('matchpen', home, away, s, { knockout: false });
}
// captain + chemistry, pressure and fatigue (solo-campaign flavours)
{
  const home = makeSide(pairs[0].h, '4-3-3', { bench: true, subsLeft: 3, captain: true, fatigue: [0, 2, 5, 9] });
  const away = makeSide(pairs[1].h, '4-3-3');
  addVector('flavours-1', home, away, 7777, { knockout: true, pressure: true, fatigue: true, roundN: 3 });
  addVector('flavours-2', home, away, 8888, { knockout: false, pressure: true, fatigue: true, roundN: 1 });
}

const out = path.join(root, 'backend/CopaDraft.Engine.Tests/golden/engine.json');
fs.writeFileSync(out, JSON.stringify({ vectors }, null, 0) + '\n', 'utf8');
const sizeKb = Math.round(fs.statSync(out).size / 1024);
console.log(`engine golden: ${vectors.length} vetores (${sizeKb} KB) -> ${out}`);
console.log('cobertura:', {
  et: vectors.filter(v => v.log.extraTime).length,
  pens: vectors.filter(v => v.log.penalties).length,
  injuries: vectors.filter(v => v.log.injuries.length).length,
  reds: vectors.filter(v => v.log.sentOff.length).length,
  matchPens: vectors.filter(v => v.log.matchPens.length).length,
});
