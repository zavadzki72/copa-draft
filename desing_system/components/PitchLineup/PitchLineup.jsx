/* ============================================================
   Marccu's Copa — PitchLineup
   A top-down football pitch with a lineup of players arranged
   in a tactical formation. Dark, green-tinted grass to match
   the system; green player markers, yellow goalkeeper, hover
   reveals the position label. Optional formation switcher.
   ============================================================ */

/* ---------- Default lineups: Seleção Brasileira (titular) ----------
   Coords are normalised 0–100 in VERTICAL space (attack points UP):
   x = left→right across the pitch, y = top(attack)→bottom(own goal). */
const selecaoLineups = {
  '4-3-3': [
    { num: 1,  name: 'Alisson',    pos: 'GOL', x: 50, y: 92, gk: true },
    { num: 6,  name: 'Wendell',    pos: 'LE',  x: 13, y: 71 },
    { num: 3,  name: 'Marquinhos', pos: 'ZAG', x: 35, y: 74 },
    { num: 4,  name: 'Gabriel',    pos: 'ZAG', x: 65, y: 74 },
    { num: 2,  name: 'Danilo',     pos: 'LD',  x: 87, y: 71 },
    { num: 5,  name: 'Casemiro',   pos: 'VOL', x: 50, y: 58 },
    { num: 8,  name: 'Bruno G.',   pos: 'MC',  x: 27, y: 46 },
    { num: 10, name: 'Paquetá',    pos: 'MC',  x: 73, y: 46 },
    { num: 7,  name: 'Vini Jr.',   pos: 'PE',  x: 20, y: 24 },
    { num: 9,  name: 'Endrick',    pos: 'CA',  x: 50, y: 19 },
    { num: 11, name: 'Raphinha',   pos: 'PD',  x: 80, y: 24 },
  ],
  '4-4-2': [
    { num: 1,  name: 'Alisson',    pos: 'GOL', x: 50, y: 92, gk: true },
    { num: 6,  name: 'Wendell',    pos: 'LE',  x: 13, y: 71 },
    { num: 3,  name: 'Marquinhos', pos: 'ZAG', x: 35, y: 74 },
    { num: 4,  name: 'Gabriel',    pos: 'ZAG', x: 65, y: 74 },
    { num: 2,  name: 'Danilo',     pos: 'LD',  x: 87, y: 71 },
    { num: 11, name: 'Vini Jr.',   pos: 'PE',  x: 14, y: 50 },
    { num: 5,  name: 'Casemiro',   pos: 'VOL', x: 38, y: 52 },
    { num: 8,  name: 'Bruno G.',   pos: 'MC',  x: 62, y: 52 },
    { num: 7,  name: 'Raphinha',   pos: 'PD',  x: 86, y: 50 },
    { num: 9,  name: 'Endrick',    pos: 'CA',  x: 36, y: 24 },
    { num: 19, name: 'Rodrygo',    pos: 'SA',  x: 64, y: 24 },
  ],
  '4-2-3-1': [
    { num: 1,  name: 'Alisson',    pos: 'GOL', x: 50, y: 92, gk: true },
    { num: 6,  name: 'Wendell',    pos: 'LE',  x: 13, y: 72 },
    { num: 3,  name: 'Marquinhos', pos: 'ZAG', x: 35, y: 75 },
    { num: 4,  name: 'Gabriel',    pos: 'ZAG', x: 65, y: 75 },
    { num: 2,  name: 'Danilo',     pos: 'LD',  x: 87, y: 72 },
    { num: 5,  name: 'Casemiro',   pos: 'VOL', x: 36, y: 58 },
    { num: 15, name: 'J. Gomes',   pos: 'VOL', x: 64, y: 58 },
    { num: 7,  name: 'Vini Jr.',   pos: 'PE',  x: 20, y: 38 },
    { num: 10, name: 'Paquetá',    pos: 'MEI', x: 50, y: 36 },
    { num: 11, name: 'Raphinha',   pos: 'PD',  x: 80, y: 38 },
    { num: 9,  name: 'Endrick',    pos: 'CA',  x: 50, y: 18 },
  ],
  '3-5-2': [
    { num: 1,  name: 'Alisson',    pos: 'GOL', x: 50, y: 92, gk: true },
    { num: 3,  name: 'Marquinhos', pos: 'ZAG', x: 27, y: 74 },
    { num: 4,  name: 'Gabriel',    pos: 'ZAG', x: 50, y: 76 },
    { num: 14, name: 'Beraldo',    pos: 'ZAG', x: 73, y: 74 },
    { num: 6,  name: 'Wendell',    pos: 'ALA', x: 13, y: 52 },
    { num: 5,  name: 'Casemiro',   pos: 'VOL', x: 32, y: 57 },
    { num: 8,  name: 'Bruno G.',   pos: 'MC',  x: 50, y: 59 },
    { num: 10, name: 'Paquetá',    pos: 'MC',  x: 68, y: 57 },
    { num: 2,  name: 'Danilo',     pos: 'ALA', x: 87, y: 52 },
    { num: 7,  name: 'Vini Jr.',   pos: 'CA',  x: 38, y: 25 },
    { num: 9,  name: 'Endrick',    pos: 'CA',  x: 62, y: 25 },
  ],
};

const FORMATIONS = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'];

/* ---------- Pitch markings (returns an <svg>, not a component) ---------- */
function pitchMarkings(vertical) {
  const stroke = { fill: 'none', stroke: 'rgba(255,255,255,0.22)', strokeWidth: 0.8 };
  const spot = { fill: 'rgba(255,255,255,0.22)' };
  const goal = { fill: 'rgba(255,255,255,0.10)', stroke: 'rgba(255,255,255,0.28)', strokeWidth: 0.6 };

  if (vertical) {
    const stripes = [];
    for (let i = 0; i < 6; i++) {
      stripes.push(
        <rect key={i} x="0" y={i * 25} width="100" height="25"
          fill={i % 2 ? '#0F2A1B' : '#0C2316'} />
      );
    }
    return (
      <svg viewBox="0 0 100 150" preserveAspectRatio="none" className="pl-svg">
        {stripes}
        <g {...stroke}>
          <rect x="3" y="3" width="94" height="144" />
          <line x1="3" y1="75" x2="97" y2="75" />
          <circle cx="50" cy="75" r="9" />
          {/* own goal (bottom) */}
          <rect x="21" y="117" width="58" height="30" />
          <rect x="36" y="137" width="28" height="10" />
          <path d="M38,117 A 9 9 0 0 1 62,117" />
          {/* opponent goal (top) */}
          <rect x="21" y="3" width="58" height="30" />
          <rect x="36" y="3" width="28" height="10" />
          <path d="M38,33 A 9 9 0 0 0 62,33" />
        </g>
        <circle cx="50" cy="75" r="0.9" {...spot} />
        <circle cx="50" cy="129" r="0.9" {...spot} />
        <circle cx="50" cy="21" r="0.9" {...spot} />
        <rect x="42" y="146.4" width="16" height="3" {...goal} />
        <rect x="42" y="0.6" width="16" height="3" {...goal} />
      </svg>
    );
  }

  /* horizontal — own goal LEFT, attack RIGHT */
  const stripes = [];
  for (let i = 0; i < 6; i++) {
    stripes.push(
      <rect key={i} x={i * 25} y="0" width="25" height="100"
        fill={i % 2 ? '#0F2A1B' : '#0C2316'} />
    );
  }
  return (
    <svg viewBox="0 0 150 100" preserveAspectRatio="none" className="pl-svg">
      {stripes}
      <g {...stroke}>
        <rect x="3" y="3" width="144" height="94" />
        <line x1="75" y1="3" x2="75" y2="97" />
        <circle cx="75" cy="50" r="9" />
        {/* own goal (left) */}
        <rect x="3" y="21" width="30" height="58" />
        <rect x="3" y="36" width="10" height="28" />
        <path d="M33,38 A 9 9 0 0 1 33,62" />
        {/* opponent goal (right) */}
        <rect x="117" y="21" width="30" height="58" />
        <rect x="137" y="36" width="10" height="28" />
        <path d="M117,38 A 9 9 0 0 0 117,62" />
      </g>
      <circle cx="75" cy="50" r="0.9" {...spot} />
      <circle cx="21" cy="50" r="0.9" {...spot} />
      <circle cx="129" cy="50" r="0.9" {...spot} />
      <rect x="0.6" y="42" width="3" height="16" {...goal} />
      <rect x="146.4" y="42" width="3" height="16" {...goal} />
    </svg>
  );
}

/* ---------- Small flag chip (square / diamond / circle primitives) ---------- */
function plFlag(nation) {
  if (nation === 'br') {
    return (
      <svg className="pl-flag" viewBox="0 0 28 20" aria-hidden="true">
        <rect width="28" height="20" fill="#009B3A" />
        <polygon points="14,2.5 25.5,10 14,17.5 2.5,10" fill="#FFDF00" />
        <circle cx="14" cy="10" r="4.1" fill="#002776" />
      </svg>
    );
  }
  return <span className="pl-flag" style={{ background: 'var(--surface-3)' }} aria-hidden="true" />;
}

const PL_CSS = `
.pl-root{ font-family:var(--font-sans); color:var(--fg1); width:var(--pl-w,360px); max-width:100%; }
.pl-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.pl-title{ display:flex; flex-direction:column; gap:2px; }
.pl-tk{ font-family:var(--font-mono); color:var(--green-bright); font-weight:500; font-size:0.8rem; letter-spacing:.01em; }
.pl-tk::before{ content:':'; opacity:.7; }
.pl-team{ font-size:1.4rem; font-weight:600; line-height:1.1; }
.pl-seg{ display:inline-flex; gap:2px; padding:3px; background:var(--surface-2); border:1px solid var(--hairline); border-radius:var(--r-pill); }
.pl-seg button{ font:inherit; font-size:0.78rem; font-weight:500; color:var(--fg2); background:none; border:none; cursor:pointer; padding:5px 11px; border-radius:var(--r-pill); white-space:nowrap; transition:color .25s, background .25s; }
.pl-seg button:hover{ color:var(--fg1); }
.pl-seg button.on{ background:var(--green); color:var(--on-green); box-shadow:var(--glow-green); }

.pl-pitch{ position:relative; width:100%; border-radius:var(--r-card); overflow:visible;
  border:1px solid rgba(0,168,89,0.22); background:#0C2316; box-shadow:var(--shadow-card);
  container-type:inline-size; }
.pl-pitch.vertical{ aspect-ratio:68/104; }
.pl-pitch.horizontal{ aspect-ratio:104/68; }
.pl-svg{ position:absolute; inset:0; width:100%; height:100%; display:block;
  border-radius:var(--r-card); overflow:hidden; }

.pl-mark{ position:absolute; transform:translate(-50%,-50%);
  width:9.6cqi; height:9.6cqi; z-index:2; }
.pl-pitch.horizontal .pl-mark{ width:6.8cqi; height:6.8cqi; }
.pl-badge{ width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-family:var(--font-mono); font-weight:700; font-size:4.4cqi; line-height:1;
  color:var(--on-green);
  background:radial-gradient(circle at 36% 28%, var(--green-bright), var(--green) 58%, var(--green-deep));
  box-shadow:0 3px 9px rgba(0,0,0,.5), inset 0 0 0 1.6px rgba(255,255,255,.28), inset 0 -3px 7px rgba(0,0,0,.28);
  transition:transform .35s var(--ease-pop), box-shadow .35s var(--ease-pop); }
.pl-pitch.horizontal .pl-badge{ font-size:3.1cqi; }
.pl-badge.gk{ color:var(--on-yellow);
  background:radial-gradient(circle at 36% 28%, #FFEC66, var(--yellow) 58%, var(--yellow-deep)); }

/* Stacked label: name on top, flag + position beneath */
.pl-label{ position:absolute; top:120%; left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:1.6cqi;
  padding:2cqi 2.6cqi; border-radius:2.2cqi; white-space:nowrap;
  background:rgba(8,15,11,.66); border:1px solid rgba(255,255,255,.09);
  -webkit-backdrop-filter:blur(5px); backdrop-filter:blur(5px);
  box-shadow:0 4px 12px rgba(0,0,0,.45);
  transition:border-color .3s var(--ease-pop), box-shadow .3s var(--ease-pop); }
.pl-pitch.horizontal .pl-label{ gap:1.3cqi; padding:1.4cqi 2cqi; border-radius:1.6cqi; }
.pl-mark.up .pl-label{ top:auto; bottom:120%; }
.pl-name{ font-size:2.85cqi; font-weight:600; color:#fff; letter-spacing:.005em; line-height:1; }
.pl-pitch.horizontal .pl-name{ font-size:2.1cqi; }
.pl-meta{ display:flex; align-items:center; gap:1.5cqi; line-height:1; }
.pl-flag{ width:3.8cqi; height:2.7cqi; border-radius:0.6cqi; display:block;
  box-shadow:0 0 0 1px rgba(255,255,255,.18); }
.pl-pitch.horizontal .pl-flag{ width:2.8cqi; height:2cqi; }
.pl-pos{ font-family:var(--font-mono); font-size:2.3cqi; font-weight:600; letter-spacing:.06em;
  text-transform:uppercase; color:var(--green-bright); }
.pl-pitch.horizontal .pl-pos{ font-size:1.8cqi; }

.pl-mark:hover{ z-index:4; }
.pl-mark:hover .pl-badge{ transform:scale(1.16);
  box-shadow:0 7px 20px rgba(0,168,89,.5), inset 0 0 0 1.6px rgba(255,255,255,.55), inset 0 -3px 7px rgba(0,0,0,.25); }
.pl-mark:hover .pl-label{ border-color:rgba(43,217,123,.55); box-shadow:0 6px 18px rgba(0,168,89,.3); }

@media (prefers-reduced-motion: reduce){
  .pl-badge,.pl-label{ transition:none; }
}`;

export function PitchLineup({
  formation = '4-3-3',
  orientation = 'vertical',
  teamName = 'Brasil',
  players = null,
  showNames = true,
  interactive = true,
  width,
}) {
  const [fm, setFm] = React.useState(FORMATIONS.includes(formation) ? formation : '4-3-3');
  const vertical = orientation !== 'horizontal';

  React.useEffect(() => {
    if (document.getElementById('pl-styles')) return;
    const el = document.createElement('style');
    el.id = 'pl-styles';
    el.textContent = PL_CSS;
    document.head.appendChild(el);
  }, []);

  const list = players || selecaoLineups[fm] || selecaoLineups['4-3-3'];
  const rootW = width != null ? (typeof width === 'number' ? width + 'px' : width)
                              : (vertical ? '360px' : '560px');

  const place = (p) => {
    const inset = (v) => 3 + v * 0.9; // keep markers/labels off the touchlines
    return vertical
      ? { left: p.x + '%', top: inset(p.y) + '%' }
      : { left: inset(100 - p.y) + '%', top: inset(p.x) + '%' };
  };

  return (
    <div className="pl-root" style={{ '--pl-w': rootW }}>
      <div className="pl-head">
        <div className="pl-title">
          <span className="pl-tk">escalação</span>
          <span className="pl-team">{teamName}</span>
        </div>
        {interactive && !players && (
          <div className="pl-seg" role="tablist" aria-label="Formação">
            {FORMATIONS.map((f) => (
              <button key={f} className={f === fm ? 'on' : ''}
                aria-pressed={f === fm} onClick={() => setFm(f)}>{f}</button>
            ))}
          </div>
        )}
      </div>

      <div className={`pl-pitch ${vertical ? 'vertical' : 'horizontal'}`}>
        {pitchMarkings(vertical)}
        {list.map((p) => (
          <div key={p.num + '-' + p.name} className="pl-mark" style={place(p)}>
            <div className={`pl-badge ${p.gk ? 'gk' : ''}`}>{p.num}</div>
            <div className="pl-label">
              {showNames && <span className="pl-name">{p.name}</span>}
              <span className="pl-meta">
                {plFlag(p.nation || 'br')}
                <span className="pl-pos">{p.pos}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
