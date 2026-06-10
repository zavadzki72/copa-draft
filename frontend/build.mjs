/* ============================================================
   COPA DRAFT — frontend/build.mjs
   Build de PRODUÇÃO (usado só pelo Dockerfile): transpila os .jsx
   com esbuild e reescreve o index.html para dispensar o Babel no
   navegador e usar o React de produção. O fluxo de DEV continua
   sem build: o index.html do repo segue funcionando como sempre.
   Saída em ./dist. Rode com: node build.mjs (exige `npm i esbuild`).
   ============================================================ */
import { transform } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'dist';

// React de produção (UMD) — pares de troca no index.html, com SRI próprio.
const REACT_SWAPS = [
  ['react@18.3.1/umd/react.development.js', 'react@18.3.1/umd/react.production.min.js',
   'sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L',
   'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z'],
  ['react-dom@18.3.1/umd/react-dom.development.js', 'react-dom@18.3.1/umd/react-dom.production.min.js',
   'sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm',
   'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1'],
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// estáticos que o nginx serve (mesma lista do Dockerfile antigo)
for (const item of ['config.js', 'game.css', 'manifest.webmanifest', 'lib', 'data', 'styles', 'images'])
  await cp(item, path.join(OUT, item), { recursive: true });

// .jsx -> .js, cada arquivo embrulhado em IIFE: o Babel standalone executa
// cada script num escopo de função próprio (compartilhamento só via window.*),
// e arquivos diferentes declaram nomes iguais no topo — sem o IIFE eles
// colidiriam como globais lexicais.
async function buildJsx(rel) {
  const src = await readFile(rel, 'utf8');
  const { code } = await transform(src, {
    loader: 'jsx', charset: 'utf8', format: 'iife',
    minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
  });
  const out = path.join(OUT, rel.replace(/\.jsx$/, '.js'));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, code);
}
await buildJsx('app.jsx');
for (const f of await readdir('ui')) if (f.endsWith('.jsx')) await buildJsx(path.join('ui', f));

// index.html de produção: scripts babel -> js puro, sem o Babel standalone,
// e React de produção no lugar do development.
let html = await readFile('index.html', 'utf8');
html = html.replace(/^\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^>]*><\/script>\n/m, '');
html = html.replace(/<script type="text\/babel" src="([^"]+)\.jsx"><\/script>/g, '<script src="$1.js"></script>');
for (const [dev, prod, sriDev, sriProd] of REACT_SWAPS)
  html = html.replace(dev, prod).replace(sriDev, sriProd);
if (html.includes('text/babel') || html.includes('.development.js'))
  throw new Error('index.html ainda referencia babel/react dev — reescrita incompleta');
await writeFile(path.join(OUT, 'index.html'), html);

console.log('build ok -> ' + OUT);
