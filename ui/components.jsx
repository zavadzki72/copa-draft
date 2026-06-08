/* ============================================================
   COPA DRAFT — ui/components.jsx
   Shared presentational components. Exposed on window for the
   other babel scripts (each gets its own scope).
   ============================================================ */
const { useState, useEffect, useRef, useMemo } = React;

function Flag({ code, className = '' }) {
  return <span className={`fi fi-${code} ${className}`}></span>;
}

/* the player's custom all-star team emblem — a minimalist abstract mark
   (stacked chevrons) coloured by token, legible in light and dark themes */
function Crest({ className = '' }) {
  return (
    <span className={`crest ${className}`} role="img" aria-label={window.I18N.t('team.name')}>
      {/* footballer striking a ball — white silhouette on the brand disc */}
      <svg className="cr-mark" viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 7.6 L12.4 12.4"></path>
          <path d="M12.4 12.4 L9 19.6"></path>
          <path d="M12.4 12.4 L15.8 13 L18.4 10.3"></path>
          <path d="M11.4 9 L7.5 10.2"></path>
          <path d="M11.8 8.6 L15.3 7.6"></path>
        </g>
        <circle cx="10.4" cy="4.6" r="2.3" fill="currentColor"></circle>
        <circle cx="19.8" cy="12.1" r="2.1" fill="currentColor"></circle>
      </svg>
    </span>
  );
}

/* renders a national flag, or the dream-team crest for the player */
function TeamMark({ code, dream, className = '' }) {
  return dream ? <Crest className={className} /> : <Flag code={code} className={className} />;
}

/* localized round label/short. Knockout rounds resolve from I18N by id;
   group rounds already carry their own (localized) text. */
function roundText(r, kind) {
  if (!r) return '';
  if (r.stage === 'group') return r[kind] || '';
  return window.I18N.t('round.' + r.id + '.' + kind);
}

function ovrClass(o) { return o >= 90 ? 'ovr-elite' : o >= 82 ? 'ovr-high' : 'ovr-mid'; }
function ratingClass(r) { return r >= 7.5 ? 'r-hi' : r >= 6.0 ? 'r-mid' : 'r-low'; }

function PosPill({ pos }) {
  return <span className={`pos-pill pos-${pos}`}>{pos}</span>;
}

/* the six derived FIFA-style attributes as mini-bars */
function AttrBars({ attrs, masked = false }) {
  const L = window.DERIVE.ATTR_LABELS;
  const keys = window.DERIVE.KEYS;
  return (
    <div className="attrs">
      {keys.map(k => {
        const v = attrs[k];
        const hi = v >= 88;
        return (
          <div key={k} className={`attr ${hi ? 'hi' : ''} ${masked ? 'masked' : ''}`}>
            <div className="row">
              <span className="k">{L[k]}</span>
              <span className="v">{masked ? '—' : v}</span>
            </div>
            <div className="bar"><i style={{ width: (masked ? 50 : v) + '%' }}></i></div>
          </div>
        );
      })}
    </div>
  );
}

/* language picker — DS "compact" variant: a pill (flag + full name + chevron)
   that opens a dropdown of the supported languages. Closes on outside click / Esc. */
function LangPicker({ lang, langs, onSet, label }) {
  const t = (k) => window.I18N.t(k);
  const FLAG = { pt: 'br', en: 'us', es: 'es' };
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className={`lang-wrap ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="lang-pill" aria-haspopup="listbox" aria-expanded={open}
        aria-label={label} onClick={() => setOpen(o => !o)}>
        <Flag code={FLAG[lang]} />
        <span className="lang-pill-label">{t('lang.' + lang + 'Full')}</span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
      </button>
      <div className="lang-menu" role="listbox" aria-label={label}>
        {langs.map(code => (
          <button key={code} type="button" role="option" aria-selected={lang === code}
            className={lang === code ? 'on' : ''} onClick={() => { onSet(code); setOpen(false); }}>
            <Flag code={FLAG[code]} />{t('lang.' + code + 'Full')}
          </button>
        ))}
      </div>
    </div>
  );
}

/* compact game header with breadcrumb trail, theme toggle + language picker */
function GameHeader({ phase, hasTeam, round, sound, onToggleSound, theme, onToggleTheme, lang, onSetLang, onReset, onHowTo }) {
  const t = (k, v) => window.I18N.t(k, v);
  const C = window.CONFIG;
  const steps = [
    { id: 'home', label: t('step.home') },
    { id: 'draft', label: t('step.squad') },
    { id: 'campaign', label: t('step.campaign') },
  ];
  const activeIdx = phase === 'home' ? 0 : phase === 'draft' ? 1 : 2;
  const themeAria = theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark');
  return (
    <header className="ghdr">
      <div className="ghdr-in">
        <span className="wm"><b>{'{'}</b>copa<b>{'}'}</b> draft</span>
        <div className="crumbs">
          {phase === 'campaign' ? (
            <span className="campaign-tag"><Crest className="cr-inline" /> {t('team.name')}
              {round && <span className="ct-round"> · {round.label}</span>}</span>
          ) : (
            <div className="psteps" role="list" aria-label={t('header.progress')}>
              {steps.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <span className={`pline ${i <= activeIdx ? 'done' : ''}`} aria-hidden="true"></span>}
                  <span className={`pstep ${i < activeIdx ? 'done' : i === activeIdx ? 'on' : ''}`} role="listitem"
                    aria-current={i === activeIdx ? 'step' : undefined}>
                    <span className="pdot">{i < activeIdx ? '✓' : i + 1}</span>
                    <span className="plabel">{s.label}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        <div className="ghdr-controls">
          {onSetLang && C.LANGS && (
            <LangPicker lang={lang} langs={C.LANGS} onSet={onSetLang} label={t('header.lang')} />
          )}
          {onToggleTheme && (
            <button className="btn-icon" onClick={onToggleTheme} aria-label={themeAria} title={themeAria}>
              {theme === 'dark' ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path>
                </svg>
              )}
            </button>
          )}
          {onHowTo && (
            <button className="btn-icon" onClick={onHowTo} aria-label={t('header.howtoAria')} title={t('header.howto')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"></path>
                <line x1="12" y1="17" x2="12" y2="17"></line>
              </svg>
            </button>
          )}
          <button className="btn-icon" onClick={onToggleSound} aria-label={sound ? t('header.soundDisable') : t('header.soundEnable')}
            title={sound ? t('header.soundOn') : t('header.soundOff')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
              {sound
                ? <><path d="M16.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 6a8.5 8.5 0 0 1 0 12"></path></>
                : <><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></>}
            </svg>
          </button>
          {phase !== 'home' && (
            <button className="btn-icon" onClick={onReset} aria-label={t('header.reset')} title={t('header.reset')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* a player tile used in the draft pool */
function PlayerTile({ p, picked, isStar, disabled, mode, onClick }) {
  const hideRatings = mode === 'almanaque';
  return (
    <button
      className={`ptile ${picked ? 'picked' : ''} ${isStar ? 'star' : ''} ${disabled ? 'dim' : ''}`}
      onClick={onClick} disabled={disabled} aria-pressed={picked}
    >
      <div className="ptile-top">
        <Flag code={p.code} />
        <span className="nm">{p.name}</span>
        {!hideRatings && <span className={`ovr ${ovrClass(p.overall)}`}>{p.overall}</span>}
      </div>
      <div className="ptile-sub">
        <PosPill pos={p.pos} />
        <span>{window.I18N.t('ui.common.age', { n: p.age })}</span>
        {p.leader && <span className="lead-tag">{window.I18N.t('ui.common.leader')}</span>}
        {isStar && <span className="star-tag">{window.I18N.t('ui.common.star')}</span>}
      </div>
      <AttrBars attrs={p.attrs} masked={hideRatings} />
    </button>
  );
}

/* top-down pitch markings — grass stripes + lines (DS PitchLineup, vertical) */
function PitchMarkings() {
  const stroke = { fill: 'none', stroke: 'rgba(255,255,255,0.22)', strokeWidth: 0.8 };
  const spot = { fill: 'rgba(255,255,255,0.22)' };
  const goal = { fill: 'rgba(255,255,255,0.10)', stroke: 'rgba(255,255,255,0.28)', strokeWidth: 0.6 };
  const stripes = [];
  for (let i = 0; i < 6; i++) stripes.push(<rect key={i} x="0" y={i * 25} width="100" height="25" fill={i % 2 ? '#0F2A1B' : '#0C2316'} />);
  return (
    <svg viewBox="0 0 100 150" preserveAspectRatio="none" className="pl-svg" aria-hidden="true">
      {stripes}
      <g {...stroke}>
        <rect x="3" y="3" width="94" height="144" />
        <line x1="3" y1="75" x2="97" y2="75" />
        <circle cx="50" cy="75" r="9" />
        <rect x="21" y="117" width="58" height="30" />
        <rect x="36" y="137" width="28" height="10" />
        <path d="M38,117 A 9 9 0 0 1 62,117" />
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

/* football pitch — top-down lineup board. Ports the DS PitchLineup visual
   (gradient badges, yellow GK, hover labels) but derives x/y from the app's
   formationRows so it works for every formation. Badge = overall ('?' when
   masked in almanaque); captain gets a star; flag + position in the label. */
function Pitch({ starters, formation, starId, hideOvr }) {
  const rows = window.TEAM.formationRows(formation);
  const g = { GOL: [], ZAG: [], LAT: [], MEI: [], ATA: [] };
  starters.forEach(p => g[p.pos] && g[p.pos].push(p));
  const cursor = { GOL: 0, ZAG: 0, LAT: 0, MEI: 0, ATA: 0 };

  // map each row to a vertical band (GK at own goal → attackers near the top)
  // and spread players across the width; x raw, y kept off the touchlines.
  // The GK sits well clear of the defence so its (downward) label never
  // collides with the defenders' labels.
  const nRows = rows.length;
  const yForRow = (ri) => ri === 0 ? 88 : 66 - ((ri - 1) / Math.max(1, nRows - 2)) * 48;
  const xForCol = (ci, count) => {
    if (count <= 1) return 50;
    const margin = count >= 5 ? 12 : count >= 4 ? 15 : 22;
    return margin + ci * (100 - 2 * margin) / (count - 1);
  };
  const insetY = (v) => 4 + v * 0.92;

  const marks = [];
  rows.forEach((row, ri) => {
    const y = yForRow(ri);
    row.forEach((pos, ci) => {
      const p = g[pos][cursor[pos]++];
      if (p) marks.push({ p, x: xForCol(ci, row.length), y });
    });
  });

  return (
    <div className="pl-pitch" role="img" aria-label={window.I18N.t('ui.common.lineupAria')}>
      <PitchMarkings />
      {marks.map(({ p, x, y }, i) => {
        const isStar = p.id === starId;
        const isGk = p.pos === 'GOL';
        return (
          <div key={p.id || i} className="pl-mark"
            style={{ left: x + '%', top: insetY(y) + '%' }}>
            <div className={`pl-badge ${isGk ? 'gk' : ''} ${isStar ? 'cap' : ''}`}>
              {isStar && <span className="pl-cap" aria-hidden="true">★</span>}
              {hideOvr ? '?' : p.overall}
            </div>
            <div className="pl-label">
              <span className="pl-name">{p.name.split(' ').slice(-1)[0]}</span>
              <span className="pl-meta">
                {p.code && <Flag code={p.code} className="pl-flag" />}
                <span className="pl-pos">{p.pos}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* achievement unlock toast */
function AchievementToast({ ach }) {
  return (
    <div className="ach-toast" role="status">
      <span className="ach-ic">{ach.icon}</span>
      <div className="ach-tx">
        <span className="ach-eyebrow">{window.I18N.t('ach.unlocked')}</span>
        <span className="ach-name">{ach.name}</span>
      </div>
    </div>
  );
}

Object.assign(window, { Flag, Crest, TeamMark, roundText, ovrClass, ratingClass, PosPill, AttrBars, GameHeader, PlayerTile, Pitch, AchievementToast });
