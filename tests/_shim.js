/* ============================================================
   COPA DRAFT — tests/_shim.js
   Loads the browser libs (which attach to `window`) inside a Node
   VM context, so the pure logic can be smoke-tested without a build
   step or any dependency. Run with: node tests/<name>.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

// the sandbox IS the global object of the VM context; making `window`
// point back to it lets the libs use both `window.X` and bare `window`.
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);

// load order mirrors index.html (config → rng → derive → engine → ratings)
['config.js', 'lib/i18n.js', 'lib/rng.js', 'lib/derive.js', 'data/squads.js', 'lib/team.js', 'lib/engine.js', 'lib/ratings.js', 'lib/stats.js'].forEach(rel => {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  vm.runInContext(code, sandbox, { filename: rel });
});

module.exports = sandbox; // -> { CONFIG, RNG, DERIVE, ENGINE, RATINGS, window, ... }
