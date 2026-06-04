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

function HomeScreen({ mode, setMode, formation, setFormation, canResume, onResume, profile, onStart }) {
  return (
    <div className="stage screen-fade">
      <div className="home-hero">
        <span className="eyebrow">⚽ jogo de copa do mundo</span>
        <h1>Monte o <span className="hl">time dos sonhos</span><br />e ganhe a <span className="yl">Copa</span>.</h1>
        <p className="sub">
          A cada vaga do elenco você rola o dado, recebe uma seleção da história e escala
          um craque dela. Junte ídolos de várias Copas num só time e dispute o mata-mata
          numa simulação minuto a minuto estilo Brasfoot.
        </p>
      </div>

      <div className="dice-wrap">
        <Die value={5} rolling={false} />
        {canResume && (
          <button className="btn btn-yellow" style={{ fontSize: 17, padding: '15px 38px' }} onClick={onResume}>
            ▶ Continuar campanha
          </button>
        )}
        <button className={`btn ${canResume ? 'btn-ghost' : 'btn-green'}`} style={{ fontSize: 17, padding: '15px 38px' }} onClick={onStart}>
          🎲 {canResume ? 'Começar de novo' : 'Começar o draft'}
        </button>
        {profile && profile.plays > 0 && (
          <span className="home-stats">{profile.plays} campanha(s) · {profile.titles} título(s) · {(profile.achievements || []).length}/{window.ACHIEVEMENTS.LIST.length} conquistas</span>
        )}
      </div>

      <div className="steps">
        <div className="step">
          <div className="n">01</div>
          <h4>Role</h4>
          <p>A cada vaga do time, o dado sorteia uma seleção de uma Copa da história.</p>
        </div>
        <div className="step">
          <div className="n">02</div>
          <h4>Escolha</h4>
          <p>Escale um jogador daquela seleção para a posição — e siga até completar o elenco.</p>
        </div>
        <div className="step">
          <div className="n">03</div>
          <h4>Conquiste</h4>
          <p>Encare oitavas, quartas, semi e final. Vencer 7 a 0 desbloqueia a lenda.</p>
        </div>
      </div>

      <div className="setgrid">
        <div className="setcard">
          <span className="lab">Modo de jogo</span>
          <Segmented
            value={mode} onChange={setMode}
            options={[
              { id: 'classico', label: 'Clássico', hint: 'notas visíveis' },
              { id: 'almanaque', label: 'De Almanaque', hint: 'escale de memória' },
            ]}
          />
        </div>
        <div className="setcard">
          <span className="lab">Formação</span>
          <FormationSelect
            value={formation} onChange={setFormation}
            options={[
              { id: '4-3-3', label: '4-3-3', hint: 'ofensivo' },
              { id: '4-4-2', label: '4-4-2', hint: 'equilibrado' },
              { id: '3-5-2', label: '3-5-2', hint: 'alas' },
              { id: '4-5-1', label: '4-5-1', hint: 'cauteloso' },
              { id: '5-3-2', label: '5-3-2', hint: 'defensivo' },
              { id: '3-4-3', label: '3-4-3', hint: 'ousado' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Die, Segmented, HomeScreen });
