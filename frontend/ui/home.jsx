/* ============================================================
   COPA DRAFT — ui/home.jsx
   Home / hero, dice draw, how-it-works, mode & formation pickers,
   and the team-draw reveal.
   ============================================================ */
const PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, rolling }) {
  const on = new Set(PIPS[value] || PIPS[1]);
  return (
    <div className={`die ${rolling ? 'rolling' : ''}`} aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={`pip ${on.has(i) ? '' : 'off'}`}></span>
      ))}
    </div>
  );
}

function Segmented({ options, value, onChange, className }) {
  return (
    <div className={`seg ${className || ''}`}>
      {options.map(o => (
        <button key={o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
          {o.hint && <span className="hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/* styled dropdown select (dark theme) */
function FormationSelect({ options, value, onChange }) {
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
  const cur = options.find(o => o.id === value) || options[0];
  return (
    <div className={`fsel ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="fsel-trigger" onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="fsel-val"><b>{cur.label}</b><span className="fsel-hint">{cur.hint}</span></span>
        <svg className="fsel-chev" width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      {open && (
        <div className="fsel-menu" role="listbox">
          {options.map(o => (
            <button type="button" key={o.id} role="option" aria-selected={o.id === value}
              className={`fsel-opt ${o.id === value ? 'on' : ''}`}
              onClick={() => { onChange(o.id); setOpen(false); }}>
              <b>{o.label}</b><span className="fsel-hint">{o.hint}</span>
              {o.id === value && <span className="fsel-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MpButton({ hero, onClick }) {
  return (
    <button className={`btn btn-ghost${hero ? ' btn-hero' : ''}`} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
      {window.I18N.t('mp.homeBtn')}
    </button>
  );
}

function HomeScreen({ mode, setMode, formation, setFormation, cupRange, setCupRange, canResume, onResume, profile, onStart, onHowTo, onMultiplayer }) {
  const t = (k, v) => window.I18N.t(k, v);
  const cupYears = window.TEAM.cupYears();
  const range = cupRange || { from: cupYears[0], to: cupYears[cupYears.length - 1] };
  const setFrom = (y) => setCupRange && setCupRange({ from: y, to: Math.max(y, range.to) });
  const setTo = (y) => setCupRange && setCupRange({ from: Math.min(y, range.from), to: y });
  const fHint = { '4-3-3': 'fOfensivo', '4-4-2': 'fEquilibrado', '3-5-2': 'fAlas', '4-5-1': 'fCauteloso', '5-3-2': 'fDefensivo', '3-4-3': 'fOusado' };
  const formationOpts = Object.keys(window.CONFIG.FORMATIONS).map(id => ({ id, label: id, hint: t('ui.home.' + (fHint[id] || 'fEquilibrado')) }));
  return (
    <div className="stage screen-fade">
      <div className="home-hero">
        <span className="eyebrow">{t('ui.home.eyebrow')}</span>
        <h1>{t('ui.home.title1')} <span className="hl">{t('ui.home.titleDream')}</span><br />{t('ui.home.title2')} <span className="yl">{t('ui.home.titleCup')}</span>.</h1>
        <p className="sub">{t('ui.home.sub')}</p>
      </div>

      <div className="dice-wrap">
        <Die value={5} rolling={false} />
        <div className="home-cta-row">
          {canResume && (
            <button className="btn btn-yellow btn-hero" onClick={onResume}>
              {t('ui.home.resume')}
            </button>
          )}
          <button className={`btn ${canResume ? 'btn-ghost' : 'btn-green'} btn-hero`} onClick={onStart}>
            🎲 {canResume ? t('ui.home.startNew') : t('ui.home.startDraft')}
          </button>
          {!canResume && onMultiplayer && <MpButton hero onClick={onMultiplayer} />}
        </div>
        <div className="home-cta-row">
          {canResume && onMultiplayer && <MpButton onClick={onMultiplayer} />}
          {onHowTo && (
            <button className="btn btn-ghost" onClick={onHowTo}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"></path>
                <line x1="12" y1="17" x2="12" y2="17"></line>
              </svg>
              {t('ui.home.howto')}
            </button>
          )}
        </div>
        {profile && profile.plays > 0 && (
          <span className="home-stats">{t('ui.home.stats', { plays: profile.plays, titles: profile.titles, ach: (profile.achievements || []).length, total: window.ACHIEVEMENTS.LIST.length })}</span>
        )}
      </div>

      <div className="steps">
        <div className="step">
          <div className="n">01</div>
          <h4>{t('ui.home.s1t')}</h4>
          <p>{t('ui.home.s1d')}</p>
        </div>
        <div className="step">
          <div className="n">02</div>
          <h4>{t('ui.home.s2t')}</h4>
          <p>{t('ui.home.s2d')}</p>
        </div>
        <div className="step">
          <div className="n">03</div>
          <h4>{t('ui.home.s3t')}</h4>
          <p>{t('ui.home.s3d')}</p>
        </div>
      </div>

      <div className="setgrid">
        <div className="setcard">
          <span className="lab">{t('ui.home.modeLabel')}</span>
          <Segmented
            value={mode} onChange={setMode}
            options={[
              { id: 'classico', label: t('ui.home.modeClassic'), hint: t('ui.home.modeClassicHint') },
              { id: 'medium', label: t('ui.home.modeMedium'), hint: t('ui.home.modeMediumHint') },
              { id: 'almanaque', label: t('ui.home.modeAlmanac'), hint: t('ui.home.modeAlmanacHint') },
            ]}
          />
        </div>
        <div className="setcard">
          <span className="lab">{t('ui.home.formationLabel')}</span>
          <FormationSelect value={formation} onChange={setFormation} options={formationOpts} />
        </div>
        <div className="setcard">
          <span className="lab">{t('ui.home.cupRangeLabel')}</span>
          <div className="cup-range">
            <label>{t('ui.home.cupFrom')}
              <select value={range.from} onChange={e => setFrom(Number(e.target.value))}>
                {cupYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>{t('ui.home.cupTo')}
              <select value={range.to} onChange={e => setTo(Number(e.target.value))}>
                {cupYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// FormationSelect é reusado pelo multiplayer (ui/mp.jsx), que no build de
// produção roda num IIFE separado — sem isto no window dá "FormationSelect is
// not defined" e tela preta no MP. Die/Segmented/HomeScreen idem.
Object.assign(window, { Die, Segmented, FormationSelect, HomeScreen });
