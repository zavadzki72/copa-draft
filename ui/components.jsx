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
      <svg className="cr-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 13.5 L12 7 L19 13.5"></path>
        <path d="M5 17.5 L12 11 L19 17.5"></path>
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
            <div className="lang-seg" role="group" aria-label={t('header.lang')}>
              {C.LANGS.map(code => (
                <button key={code} className={lang === code ? 'on' : ''} aria-pressed={lang === code}
                  title={t('lang.' + code + 'Full')} onClick={() => onSetLang(code)}>{t('lang.' + code)}</button>
              ))}
            </div>
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

/* football pitch with positioned tokens */
function Pitch({ starters, formation, starId, hideOvr }) {
  const rows = window.TEAM.formationRows(formation);
  const g = { GOL: [], ZAG: [], LAT: [], MEI: [], ATA: [] };
  starters.forEach(p => g[p.pos] && g[p.pos].push(p));
  const cursor = { GOL: 0, ZAG: 0, LAT: 0, MEI: 0, ATA: 0 };
  return (
    <div className="pitch" role="img" aria-label={window.I18N.t('ui.common.lineupAria')}>
      <div className="mid"></div>
      <div className="circle"></div>
      <div className="box top"></div>
      <div className="box bot"></div>
      <div className="pitch-rows">
        {rows.map((row, ri) => (
          <div className="prow" key={ri}>
            {row.map((pos, ci) => {
              const p = g[pos][cursor[pos]++];
              if (!p) return <div className="token" key={ci}></div>;
              const isStar = p.id === starId;
              return (
                <div className={`token ${isStar ? 'star' : ''}`} key={ci}>
                  <span className="disc">{hideOvr ? '?' : p.overall}</span>
                  <span className="nm">{p.name.split(' ').slice(-1)[0]}</span>
                  <span className="pp">{p.code && <Flag code={p.code} className="tok-flag" />}{p.pos}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
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
