/* ============================================================
   COPA DRAFT — tools/gen-derive-golden.js
   Emits derived attributes for EVERY player from the JS lib/derive.js,
   so the C# port (Derive.cs) can be asserted for full parity.

   Run: node tools/gen-derive-golden.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
// deriveAttrs only needs CONFIG (for clamp); load config -> derive -> squads.
['config.js', 'lib/derive.js', 'data/squads.js'].forEach(rel => {
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend', rel), 'utf8'), sandbox, { filename: rel });
});

const { deriveAttrs } = sandbox.window.DERIVE;
const attrs = {};
sandbox.window.SQUADS.forEach(sq => sq.players.forEach(p => { attrs[p.id] = deriveAttrs(p); }));

const out = path.join(root, 'backend/CopaDraft.Engine.Tests/golden/derive.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ attrs }, null, 0) + '\n', 'utf8');
console.log(`derive golden gerado: ${Object.keys(attrs).length} jogadores -> ${out}`);
