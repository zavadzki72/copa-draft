/* ============================================================
   COPA DRAFT — tools/gen-narration.js
   Extracts the PT-BR narration subtree from lib/i18n.js into
   backend/CopaDraft.Engine/Data/narration.pt.json, so the C# engine
   produces byte-identical narration AND consumes the rng.pick stream
   with the same array lengths/indices as the JS engine.

   Run: node tools/gen-narration.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
['config.js', 'lib/i18n.js'].forEach(rel => {
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend', rel), 'utf8'), sandbox, { filename: rel });
});

const narration = sandbox.window.I18N._dict.pt.narration;
if (!narration || typeof narration !== 'object') {
  console.error('ERRO: narration PT não encontrada em I18N._dict.pt.narration');
  process.exit(1);
}

// NB: filename avoids a `.pt.` culture token — MSBuild would treat
// `narration.pt.json` as a Portuguese-culture (satellite) resource.
const out = path.join(root, 'backend/CopaDraft.Engine/Data/narration-pt.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(narration, null, 2) + '\n', 'utf8');

const arrs = Object.entries(narration).filter(([, v]) => Array.isArray(v));
const strs = Object.entries(narration).filter(([, v]) => typeof v === 'string');
console.log(`narration.pt.json gerado: ${arrs.length} arrays, ${strs.length} strings -> ${out}`);
console.log('lengths:', Object.fromEntries(arrs.map(([k, v]) => [k, v.length])));
