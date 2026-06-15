/* ============================================================
   COPA DRAFT — ui/draft.jsx
   DICE DRAFT.
   • Roll the die → a WHOLE selection is drawn → pick any of its
     players whose position still has an open slot (it fills the
     first matching slot). This gives access to the selection's best
     names regardless of position. • Re-rolls: clássico/medium 2,
     almanaque 0. • Overs: clássico always visible, almanaque always
     hidden, medium hidden with 2 "peek" reveals per draft.
   • Once full, swap starters ↔ reserves and crown a captain, then
     confirm. Your team is a mosaic of icons.
   ============================================================ */
function DraftScreen({ formation, mode, sfx, onConfirm }) {
  const C = window.CONFIG;
  const t = (k, v) => window.I18N.t(k, v);
  const beep = sfx || (() => {});
  const slots = useMemo(() => window.TEAM.draftSlots(formation), [formation]);
  const total = slots.length;
  const MAX_REROLL = mode === 'almanaque' ? 0 : 2;
  const MAX_PEEK = mode === 'medium' ? 2 : 0;

  const [fills, setFills] = useState(() => Array(total).fill(undefined));
  const [step, setStep] = useState('roll');     // roll | rolling | choose
  const [drawn, setDrawn] = useState(null);      // { squad, players:[{...,pickable,slotIdx}] }
  const [dieValue, setDieValue] = useState(5);
  const [rerollsLeft, setRerollsLeft] = useState(MAX_REROLL);
  const [peeksLeft, setPeeksLeft] = useState(MAX_PEEK);  // "ver overs": orçamento do draft (medium)
  const [peeked, setPeeked] = useState(false);   // overs revelados no sorteio ATUAL (medium)
  const [starId, setStarId] = useState(null);
  const [swapBench, setSwapBench] = useState(null);  // bench slot idx selected to swap
  const rollTimer = useRef(null);

  const filledCount = fills.filter(Boolean).length;
  const allFilled = filledCount === total;
  const takenIds = new Set(fills.filter(Boolean).map(p => p.id));

  useEffect(() => () => rollTimer.current && clearInterval(rollTimer.current), []);
  // re-rolls e peeks são orçamento do draft INTEIRO — (re)seta só quando o modo muda
  useEffect(() => { setRerollsLeft(MAX_REROLL); setPeeksLeft(MAX_PEEK); }, [mode]); // eslint-disable-line

  const sameGroup = (a, b) => a.pos === b.pos;

  // interactive (non-seeded) weighted pick: stronger selections come up a touch
  // more often (CONFIG.DRAFT_STRENGTH_BIAS). Never excludes an eligible squad.
  function weightedPickSquad(squads) {
    const C = window.CONFIG;
    const weights = squads.map(sq => window.TEAM.squadDrawWeight(sq, C));
    const total = weights.reduce((s, w) => s + w, 0);
    let t = Math.random() * total;
    for (let i = 0; i < squads.length; i++) { t -= weights[i]; if (t <= 0) return squads[i]; }
    return squads[squads.length - 1];
  }

  // NOVO SORTEIO: o dado sorteia uma SELEÇÃO INTEIRA (entre as que ainda têm
  // jogador aproveitável); o jogador escolhe quem levar — qualquer posição que
  // ainda tenha vaga aberta. Isso dá acesso aos melhores nomes da seleção.
  function doDraw() {
    setStep('rolling'); setPeeked(false);
    beep('dice');
    if (rollTimer.current) clearInterval(rollTimer.current);
    rollTimer.current = setInterval(() => setDieValue(1 + Math.floor(Math.random() * 6)), 70);
    setTimeout(() => {
      clearInterval(rollTimer.current);
      const candidates = window.SQUADS.filter(sq => window.TEAM.squadHasPickable(sq, slots, fills, takenIds));
      let squad = null, players = [];
      if (candidates.length) {
        squad = weightedPickSquad(candidates);
        // clássico mostra overs → ordena por força; medium/almanaque escondem →
        // ordena por nome pra não vazar quem é o craque da seleção
        players = window.TEAM.squadPickables(squad, slots, fills, takenIds, mode === 'classico');
      }
      setDieValue(1 + Math.floor(Math.random() * 6));
      setDrawn({ squad, players });
      setStep('choose');
    }, 620);
  }

  function reroll() {
    if (rerollsLeft <= 0) return;
    setRerollsLeft(n => n - 1);
    doDraw();
  }

  // "ver overs" (medium): revela os ratings da seleção sorteada AGORA, gastando
  // um do orçamento. Vale só pro sorteio atual.
  function peek() {
    if (peeksLeft <= 0 || peeked) return;
    setPeeksLeft(n => n - 1); setPeeked(true); beep('pick');
  }

  function pick(p) {
    if (!p.pickable) return;
    const idx = window.TEAM.openSlotFor(slots, fills, p.pos);  // recomputa do estado atual
    if (idx < 0) return;
    beep('pick');
    const { pickable, slotIdx, ...clean } = p;  // não persiste campos internos do sorteio
    const nf = [...fills]; nf[idx] = clean;
    setFills(nf); setDrawn(null); setStep('roll'); setPeeked(false);
    if (nf.every(Boolean)) {
      const cap = [...nf.slice(0, 11)].sort((a, b) => b.overall - a.overall)[0];
      setStarId(cap.id);
    }
  }

  // completa todas as vagas abertas: sorteia seleções e escolhe um jogador
  // aproveitável aleatório, até o elenco encher.
  function randomFill() {
    const next = [...fills];
    const taken = new Set(next.filter(Boolean).map(p => p.id));
    let guard = 0;
    while (next.some(x => !x) && guard < 500) {
      guard++;
      const candidates = window.SQUADS.filter(sq => window.TEAM.squadHasPickable(sq, slots, next, taken));
      if (!candidates.length) break;
      const squad = weightedPickSquad(candidates);
      const picks = window.TEAM.squadPickables(squad, slots, next, taken).filter(p => p.pickable);
      if (!picks.length) continue;
      const pickP = picks[Math.floor(Math.random() * picks.length)];
      const idx = window.TEAM.openSlotFor(slots, next, pickP.pos);
      if (idx < 0) continue;
      const { pickable, slotIdx, ...clean } = pickP;  // não persiste campos internos
      next[idx] = clean; taken.add(clean.id);
    }
    setFills(next); setDrawn(null); setStep('roll'); setPeeked(false);
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
            <h3>{t('ui.draft.xiTitle')}</h3>
            <span className={`cnt ${fills.slice(0, 11).every(Boolean) ? 'full' : 'part'}`}>
              {fills.slice(0, 11).filter(Boolean).length}/11{xiAvg ? ` · ${t('ui.draft.avgShort')} ${xiAvg}` : ''}
            </span>
          </div>
          <div className="slot-list">
            {xiSlots.map((s, i) => {
              const p = fills[i];
              const swapTarget = swapActive && p && sameGroup(p, swapActive);
              const cls = ['slot', allFilled && p ? 'pick-cap' : '',
                swapTarget ? 'swap-target' : '', !allFilled && p ? 'locked' : ''].join(' ');
              return (
                <div className={cls} key={i}
                  onClick={() => { if (allFilled) onStarterClick(i); }}>
                  <span className="pp">{s.pos}</span>
                  {p ? (
                    <>
                      <span className="nm">
                        {p.id === starId && <span className="star-dot">★ </span>}
                        {p.code && <Flag code={p.code} className="slot-flag" />} {p.name}
                      </span>
                      {mode !== 'almanaque' && <span className="ov">{p.overall}</span>}
                    </>
                  ) : <span className="nm empty">{t('ui.draft.slotEmpty')}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="squadbox bench-strip">
          <div className="hd">
            <h3>{t('ui.draft.benchTitle')}</h3>
            <span className={`cnt ${fills.slice(11).every(Boolean) ? 'full' : 'part'}`}>
              {fills.slice(11).filter(Boolean).length}/{total - 11}
            </span>
          </div>
          <div className="slot-list">
            {benchSlots.map((s, bi) => {
              const idx = 11 + bi;
              const p = fills[idx];
              const isSwapping = swapBench === idx;
              const cls = ['slot', isSwapping ? 'swapping' : '',
                !allFilled && p ? 'locked' : ''].join(' ');
              return (
                <div className={cls} key={bi}>
                  <span className="pp">{s.allow ? 'DEF' : s.pos}</span>
                  {p ? (
                    <>
                      <span className="nm">{p.code && <Flag code={p.code} className="slot-flag" />} {p.name}</span>
                      {mode !== 'almanaque' && <span className="ov">{p.overall}</span>}
                      {allFilled && (
                        <button className="swapbtn" title={t('ui.draft.swapTitle')}
                          onClick={(e) => { e.stopPropagation(); setSwapBench(isSwapping ? null : idx); }}>
                          {isSwapping ? '✕' : '⇄'}
                        </button>
                      )}
                    </>
                  ) : <span className="nm empty">{t('ui.draft.slotEmpty')}</span>}
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
            <span className="tok">{t('ui.draft.tokSquad')}</span>
            <h2 style={{ marginTop: 4 }}><Crest className="cr-h2" /> {t('team.name')}</h2>
          </div>
          <span className="meta">{t('ui.draft.reviewMeta', { avg: xiAvg })}</span>
        </div>

        {swapBench != null && (
          <div className="warn" style={{ marginBottom: 16, background: 'rgba(255,223,0,.08)', borderColor: 'rgba(255,223,0,.3)' }}>
            <span aria-hidden="true">⇄</span>
            <span>{t('ui.draft.swapHint', { name: fills[swapBench].name, pos: window.I18N.t('pos.' + fills[swapBench].pos) })}</span>
          </div>
        )}

        <div className="draftgrid">
          <div className="draft-pool">
            <div className="pitch-head">
              <span className="tok">{t('ui.draft.tokLineup')}</span>
              <span className="pitch-hint">{t('ui.draft.captainHint', { cap: C.CAPTAIN_OVR_BOOST, chem: C.CHEMISTRY_OVR_BOOST })}</span>
            </div>
            <Pitch starters={fills.slice(0, 11)} formation={formation} starId={starId} hideOvr={mode === 'almanaque'} />
          </div>
          <div className="draft-side">
            <TeamPanel />
            <div className="actionbar" style={{ flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-yellow btn-block" onClick={confirm}>{t('ui.draft.confirm')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ DRAFTING ============
  return (
    <div className="stage screen-fade">
      <div className="shead">
        <div>
          <h2>{t('ui.draft.draftTitle')}</h2>
        </div>
        <span className="meta">{t('ui.draft.draftMeta', { n: filledCount, total, formation })}</span>
      </div>

      <div className="progress" style={{ marginBottom: 14 }}>
        <i style={{ width: (filledCount / total) * 100 + '%' }}></i>
      </div>

      <div className="draft-instruct">
        <span>{t('ui.draft.instruct')}</span>
        <button className="btn-mini random-btn" onClick={randomFill}>
          🎲 {filledCount > 0 ? t('ui.draft.randomComplete') : t('ui.draft.randomAll')}
        </button>
      </div>

      <div className="draftgrid">
        <div className="draft-pool">
          <div className="rollpanel">
            <div className="rp-head">
              <span className="rp-step">{t('ui.draft.rollTitle')}</span>
              <span className="rp-pos">{filledCount}/{total}</span>
            </div>

            {step !== 'choose' && (
              <div className="rp-roll">
                <Die value={dieValue} rolling={step === 'rolling'} />
                {step === 'roll' && (
                  <>
                    <p className="rp-hint">{t('ui.draft.rollAnyHint')}</p>
                    <button className="btn btn-green" style={{ fontSize: 16, padding: '14px 34px' }} onClick={doDraw}>{t('ui.draft.rollBtn')}</button>
                  </>
                )}
                {step === 'rolling' && <p className="rp-hint">{t('ui.draft.drawing')}</p>}
              </div>
            )}

            {step === 'choose' && drawn && drawn.squad && (
              <div className="rp-choose">
                <div className="drawn-banner">
                  <Flag code={drawn.squad.code} />
                  <div>
                    <div className="db-team">{drawn.squad.team} <span>{drawn.squad.cup}</span></div>
                    <div className="db-sub">{t('ui.draft.drawnPickSub')}</div>
                  </div>
                  <div className="drawn-actions">
                    {MAX_PEEK > 0 && (
                      <button className="btn-mini peek" disabled={peeked || peeksLeft <= 0}
                        onClick={peek} style={(peeked || peeksLeft <= 0) ? { opacity: .4, cursor: 'not-allowed' } : {}}>
                        {peeked ? t('ui.draft.peeked') : t('ui.draft.peek', { n: peeksLeft })}
                      </button>
                    )}
                    {MAX_REROLL > 0 && (
                      <button className="btn-mini reroll" disabled={rerollsLeft <= 0}
                        onClick={reroll} style={rerollsLeft <= 0 ? { opacity: .4, cursor: 'not-allowed' } : {}}>
                        {t('ui.draft.reroll', { n: rerollsLeft })}
                      </button>
                    )}
                  </div>
                </div>
                {MAX_REROLL === 0 && (
                  <p className="rp-hint" style={{ margin: '0 0 12px', fontSize: 13 }}>{t('ui.draft.almanacNote')}</p>
                )}
                <div className="poolcols">
                  {drawn.players.map(p => (
                    <PlayerTile key={p.id} p={p} mode={mode} revealRatings={peeked}
                      picked={false} isStar={false} disabled={!p.pickable}
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
  const t = (k, v) => window.I18N.t(k, v);
  const avg = starters.length ? Math.round(starters.reduce((s, p) => s + p.overall, 0) / starters.length) : 0;
  const grade = avg >= 89 ? 'S' : avg >= 85 ? 'A' : avg >= 81 ? 'B' : avg >= 77 ? 'C' : 'D';
  const gradeWord = t('ui.draft.grade' + grade);
  const [shown, setShown] = useState(false);
  useEffect(() => { const tm = setTimeout(() => setShown(true), 450); return () => clearTimeout(tm); }, []);
  const best = [...starters].sort((a, b) => b.overall - a.overall)[0];

  return (
    <div className="stage narrow screen-fade reveal">
      <div className="shead" style={{ justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="tok">{t('ui.draft.revealTok')}</span>
          <h2 style={{ marginTop: 4 }}>{t('ui.draft.revealTitle')}</h2>
        </div>
      </div>
      <p className="p" style={{ maxWidth: 440, margin: '0 auto 26px', textAlign: 'center' }}>
        {t('ui.draft.revealIntro')}
      </p>
      <div className={`alm-card ${shown ? 'on' : ''}`}>
        <div className={`alm-grade g-${grade}`}>{grade}</div>
        <div className="alm-meta">
          <div className="alm-avg">{shown ? avg : '—'}</div>
          <div className="alm-lbl">{t('ui.draft.revealAvg', { grade: gradeWord })}</div>
          {best && <div className="alm-best">{t('ui.draft.revealBest')} <b>{best.name}</b> {best.code && <Flag code={best.code} className="slot-flag" />}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
        <button className="btn btn-yellow" style={{ fontSize: 16, padding: '14px 38px' }} onClick={onContinue}>
          {t('ui.draft.revealContinue')}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { DraftScreen, AlmanaqueReveal });
