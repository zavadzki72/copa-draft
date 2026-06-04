/* ============================================================
   COPA DRAFT — ui/draft.jsx
   DICE DRAFT.
   • Pick ANY open slot to draft next (start with the striker if
     you like). • Roll the die → a selection is drawn → choose one
     of its players. • Clássico: 2 re-rolls per slot. Almanaque:
     none. • Once full, swap starters ↔ reserves and crown a
     captain, then confirm. Your team is a mosaic of icons.
   ============================================================ */
function DraftScreen({ formation, mode, sfx, onConfirm }) {
  const C = window.CONFIG;
  const beep = sfx || (() => {});
  const slots = useMemo(() => window.TEAM.draftSlots(formation), [formation]);
  const total = slots.length;
  const MAX_REROLL = mode === 'almanaque' ? 0 : 2;

  const [fills, setFills] = useState(() => Array(total).fill(undefined));
  const [activeSlot, setActiveSlot] = useState(0);
  const [step, setStep] = useState('roll');     // roll | rolling | choose
  const [drawn, setDrawn] = useState(null);      // { squad, eligible }
  const [dieValue, setDieValue] = useState(5);
  const [rerollsLeft, setRerollsLeft] = useState(MAX_REROLL);
  const [starId, setStarId] = useState(null);
  const [swapBench, setSwapBench] = useState(null);  // bench slot idx selected to swap
  const rollTimer = useRef(null);

  const filledCount = fills.filter(Boolean).length;
  const allFilled = filledCount === total;
  const takenIds = new Set(fills.filter(Boolean).map(p => p.id));

  // reset the roll state whenever the active slot (or mode) changes
  useEffect(() => {
    setStep('roll'); setDrawn(null); setRerollsLeft(MAX_REROLL);
    return () => rollTimer.current && clearInterval(rollTimer.current);
  }, [activeSlot, mode]); // eslint-disable-line

  const sameGroup = (a, b) => a.pos === b.pos;

  function doDraw() {
    setStep('rolling');
    beep('dice');
    if (rollTimer.current) clearInterval(rollTimer.current);
    rollTimer.current = setInterval(() => setDieValue(1 + Math.floor(Math.random() * 6)), 70);
    const slot = slots[activeSlot];
    setTimeout(() => {
      clearInterval(rollTimer.current);
      let squad = null, elig = [];
      for (let t = 0; t < 40 && !squad; t++) {
        const cand = window.SQUADS[Math.floor(Math.random() * window.SQUADS.length)];
        const e = window.TEAM.eligible(slot, cand, takenIds);
        if (e.length) { squad = cand; elig = e; }
      }
      if (!squad) for (const cand of window.SQUADS) {
        const e = window.TEAM.eligible(slot, cand, takenIds);
        if (e.length) { squad = cand; elig = e; break; }
      }
      setDieValue(1 + Math.floor(Math.random() * 6));
      setDrawn({ squad, eligible: elig });
      setStep('choose');
    }, 620);
  }

  function reroll() {
    if (rerollsLeft <= 0) return;
    setRerollsLeft(n => n - 1);
    doDraw();
  }

  function pick(p) {
    beep('pick');
    const nf = [...fills]; nf[activeSlot] = p;
    setFills(nf); setDrawn(null); setStep('roll');
    if (nf.every(Boolean)) {
      const cap = [...nf.slice(0, 11)].sort((a, b) => b.overall - a.overall)[0];
      setStarId(cap.id);
    } else {
      const next = nf.findIndex(x => !x);
      setActiveSlot(next);
    }
  }

  function selectSlot(i) {
    if (allFilled) return;          // in review, slot clicks do captain/swap
    if (fills[i]) {                 // re-draft a filled slot
      const nf = [...fills]; const removed = nf[i]; nf[i] = undefined; setFills(nf);
      if (removed && removed.id === starId) setStarId(null);
    }
    setActiveSlot(i);
  }

  // fill every still-empty slot with a random eligible player from a random squad
  function randomFill() {
    const next = [...fills];
    const taken = new Set(next.filter(Boolean).map(p => p.id));
    for (let i = 0; i < total; i++) {
      if (next[i]) continue;
      const slot = slots[i];
      const order = [...window.SQUADS].sort(() => Math.random() - 0.5);
      for (const sq of order) {
        const elig = window.TEAM.eligible(slot, sq, taken);
        if (elig.length) {
          const pickP = elig[Math.floor(Math.random() * elig.length)];
          next[i] = pickP; taken.add(pickP.id); break;
        }
      }
    }
    setFills(next); setDrawn(null); setStep('roll');
    if (!starId) {
      const cap = [...next.slice(0, 11)].filter(Boolean).sort((a, b) => b.overall - a.overall)[0];
      if (cap) setStarId(cap.id);
    }
    beep('pick');
  }

  function ensureCaptain(nf) {
    const xiIds = nf.slice(0, 11).map(p => p.id);
    if (!xiIds.includes(starId)) {
      setStarId([...nf.slice(0, 11)].sort((a, b) => b.overall - a.overall)[0].id);
    }
  }

  function onStarterClick(i) {
    const p = fills[i];
    if (!p) return;
    if (swapBench != null) {
      const b = fills[swapBench];
      if (b && sameGroup(p, b)) {           // perform swap
        const nf = [...fills]; nf[i] = b; nf[swapBench] = p; setFills(nf);
        ensureCaptain(nf); setSwapBench(null);
      }
      return;
    }
    setStarId(p.id);                         // otherwise crown captain
  }

  function confirm() { onConfirm(fills.slice(0, 11), fills.slice(11), starId); }

  const xiSlots = slots.filter(s => s.group === 'xi');
  const benchSlots = slots.filter(s => s.group === 'bench');
  const xiAvg = filledCount
    ? Math.round(fills.slice(0, 11).filter(Boolean).reduce((s, p) => s + p.overall, 0) / Math.max(1, fills.slice(0, 11).filter(Boolean).length)) : 0;

  // ---------- shared team panel ----------
  function TeamPanel() {
    const swapActive = swapBench != null ? fills[swapBench] : null;
    return (
      <>
        <div className="squadbox">
          <div className="hd">
            <h3>Titulares</h3>
            <span className={`cnt ${fills.slice(0, 11).every(Boolean) ? 'full' : 'part'}`}>
              {fills.slice(0, 11).filter(Boolean).length}/11{xiAvg ? ` · méd ${xiAvg}` : ''}
            </span>
          </div>
          <div className="slot-list">
            {xiSlots.map((s, i) => {
              const p = fills[i];
              const active = !allFilled && i === activeSlot;
              const swapTarget = swapActive && p && sameGroup(p, swapActive);
              const cls = ['slot', active ? 'active' : '', allFilled && p ? 'pick-cap' : '',
                swapTarget ? 'swap-target' : '', !allFilled && p ? 'redraft' : ''].join(' ');
              return (
                <div className={cls} key={i}
                  onClick={() => allFilled ? onStarterClick(i) : selectSlot(i)}>
                  <span className="pp">{s.pos}</span>
                  {p ? (
                    <>
                      <span className="nm">
                        {p.id === starId && <span className="star-dot">★ </span>}
                        {p.code && <Flag code={p.code} className="slot-flag" />} {p.name}
                      </span>
                      {mode !== 'almanaque' && <span className="ov">{p.overall}</span>}
                    </>
                  ) : <span className="nm empty">{active ? 'sua vez ›' : 'toque para sortear'}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="squadbox bench-strip">
          <div className="hd">
            <h3>Banco</h3>
            <span className={`cnt ${fills.slice(11).every(Boolean) ? 'full' : 'part'}`}>
              {fills.slice(11).filter(Boolean).length}/{total - 11}
            </span>
          </div>
          <div className="slot-list">
            {benchSlots.map((s, bi) => {
              const idx = 11 + bi;
              const p = fills[idx];
              const active = !allFilled && idx === activeSlot;
              const isSwapping = swapBench === idx;
              const cls = ['slot', active ? 'active' : '', isSwapping ? 'swapping' : ''].join(' ');
              return (
                <div className={cls} key={bi}
                  onClick={() => { if (!allFilled) selectSlot(idx); }}>
                  <span className="pp">{s.allow ? 'DEF' : s.pos}</span>
                  {p ? (
                    <>
                      <span className="nm">{p.code && <Flag code={p.code} className="slot-flag" />} {p.name}</span>
                      {mode !== 'almanaque' && <span className="ov">{p.overall}</span>}
                      {allFilled && (
                        <button className="swapbtn" title="Trocar com um titular"
                          onClick={(e) => { e.stopPropagation(); setSwapBench(isSwapping ? null : idx); }}>
                          {isSwapping ? '✕' : '⇄'}
                        </button>
                      )}
                    </>
                  ) : <span className="nm empty">{active ? 'sua vez ›' : 'toque para sortear'}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // ============ REVIEW (all slots filled) ============
  if (allFilled) {
    return (
      <div className="stage screen-fade">
        <div className="shead">
          <div>
            <span className="tok">elenco</span>
            <h2 style={{ marginTop: 4 }}><Crest className="cr-h2" /> Time dos Sonhos</h2>
          </div>
          <span className="meta">elenco completo · méd {xiAvg}</span>
        </div>

        {swapBench != null && (
          <div className="warn" style={{ marginBottom: 16, background: 'rgba(255,223,0,.08)', borderColor: 'rgba(255,223,0,.3)' }}>
            <span aria-hidden="true">⇄</span>
            <span>Trocando <b>{fills[swapBench].name}</b> — toque num titular da mesma posição
              ({window.CONFIG.POS_LABEL[fills[swapBench].pos]}) para trocar, ou ✕ para cancelar.</span>
          </div>
        )}

        <div className="draftgrid">
          <div className="draft-pool">
            <div className="pitch-head">
              <span className="tok">escalação</span>
              <span className="pitch-hint">toque num titular para definir o capitão ★</span>
            </div>
            <Pitch starters={fills.slice(0, 11)} formation={formation} starId={starId} hideOvr={mode === 'almanaque'} />
          </div>
          <div className="draft-side">
            <TeamPanel />
            <div className="actionbar" style={{ flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-yellow btn-block" onClick={confirm}>Confirmar elenco →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ DRAFTING ============
  const slot = slots[activeSlot];
  const posWord = window.CONFIG.POS_LABEL[slot.allow ? 'DEF' : slot.pos].toLowerCase();
  return (
    <div className="stage screen-fade">
      <div className="shead">
        <div>
          <span className="tok">draft</span>
          <h2 style={{ marginTop: 4 }}>Monte o time, vaga a vaga</h2>
        </div>
        <span className="meta">escalados {filledCount} de {total} · {formation}</span>
      </div>

      <div className="progress" style={{ marginBottom: 14 }}>
        <i style={{ width: (filledCount / total) * 100 + '%' }}></i>
      </div>

      <div className="draft-instruct">
        <span>Toque numa vaga ao lado para escolher qual posição sortear primeiro.</span>
        <button className="btn-mini random-btn" onClick={randomFill}>
          🎲 {filledCount > 0 ? 'Completar aleatório' : 'Time aleatório'}
        </button>
      </div>

      <div className="draftgrid">
        <div className="draft-pool">
          <div className="rollpanel">
            <div className="rp-head">
              <span className="rp-step">Sorteando para</span>
              <span className="rp-pos">{window.TEAM.slotLabel(slot)}</span>
            </div>

            {step !== 'choose' && (
              <div className="rp-roll">
                <Die value={dieValue} rolling={step === 'rolling'} />
                {step === 'roll' && (
                  <>
                    <p className="rp-hint">Role o dado para sortear a seleção que vai te oferecer um {posWord}. Escolha outra vaga ao lado se preferir começar por outra posição.</p>
                    <button className="btn btn-green" style={{ fontSize: 16, padding: '14px 34px' }} onClick={doDraw}>🎲 Rolar o dado</button>
                  </>
                )}
                {step === 'rolling' && <p className="rp-hint">Sorteando seleção…</p>}
              </div>
            )}

            {step === 'choose' && drawn && (
              <div className="rp-choose">
                <div className="drawn-banner">
                  <Flag code={drawn.squad.code} />
                  <div>
                    <div className="db-team">{drawn.squad.team} <span>{drawn.squad.cup}</span></div>
                    <div className="db-sub">sorteada! escolha um {posWord} desta seleção</div>
                  </div>
                  {MAX_REROLL > 0 && (
                    <button className="btn-mini reroll" disabled={rerollsLeft <= 0}
                      onClick={reroll} style={rerollsLeft <= 0 ? { opacity: .4, cursor: 'not-allowed' } : {}}>
                      🎲 Sortear de novo ({rerollsLeft})
                    </button>
                  )}
                </div>
                {MAX_REROLL === 0 && (
                  <p className="rp-hint" style={{ margin: '0 0 12px', fontSize: 13 }}>Modo De Almanaque: sem nova rolagem — escolha de memória.</p>
                )}
                <div className="poolcols">
                  {drawn.eligible.map(p => (
                    <PlayerTile key={p.id} p={p} mode={mode} picked={false} isStar={false}
                      onClick={() => pick(p)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="draft-side">
          <TeamPanel />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   AlmanaqueReveal — payoff for drafting blind. Reveals the hidden
   team average + grade after the player committed by memory.
   ============================================================ */
function AlmanaqueReveal({ me, starters, bench, onContinue }) {
  const avg = starters.length ? Math.round(starters.reduce((s, p) => s + p.overall, 0) / starters.length) : 0;
  const grade = avg >= 89 ? 'S' : avg >= 85 ? 'A' : avg >= 81 ? 'B' : avg >= 77 ? 'C' : 'D';
  const gradeWord = { S: 'Lendário', A: 'Excelente', B: 'Sólido', C: 'Mediano', D: 'Arriscado' }[grade];
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 450); return () => clearTimeout(t); }, []);
  const best = [...starters].sort((a, b) => b.overall - a.overall)[0];

  return (
    <div className="stage narrow screen-fade reveal">
      <div className="shead" style={{ justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="tok">de almanaque</span>
          <h2 style={{ marginTop: 4 }}>Hora da verdade</h2>
        </div>
      </div>
      <p className="p" style={{ maxWidth: 440, margin: '0 auto 26px', textAlign: 'center' }}>
        Você montou o elenco no escuro, só pela memória. Veja como ficou.
      </p>
      <div className={`alm-card ${shown ? 'on' : ''}`}>
        <div className={`alm-grade g-${grade}`}>{grade}</div>
        <div className="alm-meta">
          <div className="alm-avg">{shown ? avg : '—'}</div>
          <div className="alm-lbl">média do elenco · {gradeWord}</div>
          {best && <div className="alm-best">Craque do grupo: <b>{best.name}</b> {best.code && <Flag code={best.code} className="slot-flag" />}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
        <button className="btn btn-yellow" style={{ fontSize: 16, padding: '14px 38px' }} onClick={onContinue}>
          Rumo ao mata-mata →
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { DraftScreen, AlmanaqueReveal });
