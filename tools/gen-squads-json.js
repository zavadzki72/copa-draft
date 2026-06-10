/* ============================================================
   COPA DRAFT — tools/gen-squads-json.js
   Generates the shared `squads.json` (consumed by the .NET backend)
   from `data/squads.js` (the browser source of truth, loaded as a
   plain <script> without a build step).

   This keeps a SINGLE source of squad data: `data/squads.js` stays the
   synchronous browser/Node-VM source; `squads.json` is a generated view
   for the server so the C# engine and the JS engine agree on the pool.

   Run: node tools/gen-squads-json.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

// load data/squads.js in a tiny VM (same trick as tests/_shim.js): it only
// assigns window.SQUADS, so no other libs are needed.
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'frontend', 'data/squads.js'), 'utf8'), sandbox, { filename: 'data/squads.js' });

const squads = sandbox.window.SQUADS;
if (!Array.isArray(squads) || !squads.length) {
  console.error('ERRO: window.SQUADS vazio ou ausente após carregar data/squads.js');
  process.exit(1);
}

const out = path.join(root, 'squads.json');
fs.writeFileSync(out, JSON.stringify(squads, null, 2) + '\n', 'utf8');

const players = squads.reduce((s, sq) => s + (sq.players ? sq.players.length : 0), 0);
console.log(`squads.json gerado: ${squads.length} seleções, ${players} jogadores -> ${out}`);
