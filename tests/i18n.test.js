/* ============================================================
   COPA DRAFT — tests/i18n.test.js
   Smoke tests for the i18n core: per-language resolution,
   PT fallback, setLang validation, and key parity across langs.
   Run: node tests/i18n.test.js   (exit code != 0 on failure)
   ============================================================ */
const { I18N, CONFIG } = require('./_shim');

let passed = 0;
function ok(name, cond) {
  if (!cond) { console.error('FAIL: ' + name); process.exit(1); }
  console.log('ok   - ' + name);
  passed++;
}

// 1) team.name resolves per language
I18N.setLang('pt');
ok('pt team.name', I18N.t('team.name') === 'Seu Time');
I18N.setLang('en');
ok('en team.name', I18N.t('team.name') === 'Your Team');
I18N.setLang('es');
ok('es team.name', I18N.t('team.name') === 'Tu Equipo');

// 2) interpolation works
I18N.setLang('pt');
ok('interpola {x}', I18N.t('narration.kickoff', { home: 'A', away: 'B' }) === 'Bola rolando! A x B.');

// 3) missing key in a language falls back to PT
//    (inject a PT-only key for the test)
I18N._dict.pt.__test = { onlyPt: 'somente-pt' };
I18N.setLang('en');
ok('chave ausente em EN cai no PT', I18N.t('__test.onlyPt') === 'somente-pt');
delete I18N._dict.pt.__test;

// 4) unknown key returns the key itself (last resort)
ok('chave inexistente retorna a propria chave', I18N.t('nope.nada') === 'nope.nada');

// 5) setLang rejects invalid codes (keeps previous language)
I18N.setLang('pt');
const okSet = I18N.setLang('zz');
ok('setLang invalido e rejeitado', okSet === false && I18N.lang === 'pt');
ok('setLang valido aceito', I18N.setLang('es') === true && I18N.lang === 'es');

// 6) arr() returns the narration array for the current language
I18N.setLang('pt');
const goalPt = I18N.arr('narration.goal');
I18N.setLang('en');
const goalEn = I18N.arr('narration.goal');
ok('arr() retorna array', Array.isArray(goalPt) && goalPt.length > 0);
ok('arrays de narracao com mesmo comprimento entre idiomas', goalPt.length === goalEn.length);

// 7) KEY PARITY — every PT leaf key must exist in EN and ES (and vice-versa)
const langs = CONFIG.LANGS;
const keysByLang = {};
langs.forEach(l => { keysByLang[l] = new Set(I18N.keysOf(l)); });
const base = keysByLang[langs[0]];
let parityOk = true;
const missing = [];
langs.forEach(l => {
  base.forEach(k => { if (!keysByLang[l].has(k)) { parityOk = false; missing.push(l + ':' + k); } });
  keysByLang[l].forEach(k => { if (!base.has(k)) { parityOk = false; missing.push(langs[0] + ':' + k + ' (extra in ' + l + ')'); } });
});
if (!parityOk) console.error('Key parity gaps:\n  ' + missing.slice(0, 40).join('\n  '));
ok('paridade de chaves PT/EN/ES', parityOk);

// 8) narration array length parity across ALL narration arrays
const narrKeys = ['goal','assist','bigchance','save','woodwork','yellow','foul','counter','red','red2','injury','penGoal','penSave','penMiss'];
let arrLenOk = true; const lenGaps = [];
narrKeys.forEach(k => {
  const lens = langs.map(l => { I18N.setLang(l); return I18N.arr('narration.' + k).length; });
  if (new Set(lens).size !== 1) { arrLenOk = false; lenGaps.push(k + ': ' + lens.join('/')); }
});
if (!arrLenOk) console.error('Array length gaps: ' + lenGaps.join(', '));
ok('comprimento identico em todos os arrays de narracao', arrLenOk);

console.log('\n' + passed + ' checks passed.');
