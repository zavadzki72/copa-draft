/* ============================================================
   COPA DRAFT — tools/gen-rng-golden.js
   Emits golden vectors from the JS RNG (lib/rng.js) so the C# port
   (backend/CopaDraft.Engine/Rng.cs) can be asserted bit-for-bit.

   Run: node tools/gen-rng-golden.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'frontend', 'lib/rng.js'), 'utf8'), sandbox, { filename: 'lib/rng.js' });
const { makeRng, seedFrom } = sandbox.window.RNG;

const nextValues = (seed, n) => { const r = makeRng(seed); return Array.from({ length: n }, () => r.next()); };
const intValues = (seed, min, max, n) => { const r = makeRng(seed); return Array.from({ length: n }, () => r.int(min, max)); };
// pick over [0..n-1] so the returned element IS the chosen index
const pickIdx = (seed, n, count) => { const r = makeRng(seed); const arr = Array.from({ length: n }, (_, i) => i); return Array.from({ length: count }, () => r.pick(arr)); };
// weighted over items {item:i, w} so the returned item IS the chosen index
const weightedIdx = (seed, weights, count) => { const r = makeRng(seed); const items = weights.map((w, i) => ({ item: i, w })); return Array.from({ length: count }, () => r.weighted(items)); };

const golden = {
  nextMulti: [1, 2, 12345, 0, 4294967295, 2166136261].map(seed => ({ seed, values: nextValues(seed, 25) })),
  int: [{ seed: 999, min: 0, max: 1000 }, { seed: 7, min: 3, max: 89 }, { seed: 42, min: 0, max: 1 }]
    .map(c => ({ ...c, values: intValues(c.seed, c.min, c.max, 25) })),
  pick: [{ seed: 77, n: 7, count: 25 }, { seed: 5, n: 2, count: 25 }]
    .map(c => ({ ...c, indices: pickIdx(c.seed, c.n, c.count) })),
  weighted: [{ seed: 55, weights: [5, 2.4, 0.8, 0.6, 0.02], count: 25 }, { seed: 3, weights: [1, 1, 1, 1], count: 25 }]
    .map(c => ({ ...c, picks: weightedIdx(c.seed, c.weights, c.count) })),
  seedFrom: ['', 'a', 'abc', 'Alemanha Ocidental', 'grupos', 'me', 'pk1', 'São Paulo 1970', '🙂']
    .map(s => ({ s, h: seedFrom(s) })),
};

const out = path.join(root, 'backend/CopaDraft.Engine.Tests/golden/rng.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(golden, null, 2) + '\n', 'utf8');
console.log('rng golden gerado ->', out);
