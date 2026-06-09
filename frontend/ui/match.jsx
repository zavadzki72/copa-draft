/* ============================================================
   COPA DRAFT — ui/match.jsx
   Pre-match (lineup on the pitch + opponent preview) and the
   live minute-by-minute ticker.
   ============================================================ */
function StaminaBar({ fatigue }) {
  const pct = window.TEAM.staminaPct(fatigue);
  const lvl = window.TEAM.staminaLevel(fatigue);
  return (
    <span className={`stamina ${lvl}`} title={window.I18N.t('ui.match.energyTitle', { pct })}>
      <span className="stamina-bar"><i style={{ width: pct + '%' }}></i></span>
    </span>
  );
}

function PreMatchScreen({ me, starters, bench, formation, starId, round, fatigue, playerStatus, opponentXI, opponentAvg, onStart }) {
  const C = window.CONFIG;
  const Modal = window.Modal;
  const t = (k, v) => window.I18N.t(k, v);
  const opp = round.opponent;
  const oppMen = [...opponentXI].sort((a, b) => b.overall - a.overall);

  const [xi, setXi] = useState(starters);
  const [res, setRes] = useState(bench);
  const [sel, setSel] = useState(null);       // selected bench id to swap in
  const [ovrInfo, setOvrInfo] = useState(null);   // player whose overall breakdown is open
  const [showOpp, setShowOpp] = useState(false);  // opponent scouting modal

  const origIds = useMemo(() => new Set(starters.map(p => p.id)), [starters]);
  const stOf = (id) => window.TEAM.statusOf(playerStatus, id);   // null when available
  const sameKind = (a, b) => (a.pos === 'GOL') === (b.pos === 'GOL'); // keeper<->keeper, outfield<->outfield
  const xiIds = new Set(xi.map(p => p.id));
  const blockedXI = xi.filter(p => stOf(p.id));                  // unavailable players still in the XI
  const canStart = blockedXI.length === 0;

  const hasLeader = xi.some(p => p.leader);
  // the captain boost only counts while the captain is actually in the XI
  const captain = xiIds.has(starId) ? xi.find(p => p.id === starId) : null;
  const boostOf = (p) => window.TEAM.captainChemBoost(p, captain, C);
  const fatPen = (p) => window.TEAM.fatiguePenalty(fatigue, p.id);  // capped fatigue hit
  const pressOf = (p) => window.TEAM.pressureOf(p, round.n, hasLeader);
  const effOvr = (p) => window.TEAM.effInMatch(p, fatigue, round.n, hasLeader) + boostOf(p);
  const playerAvg = xi.length ? Math.round(xi.reduce((s, p) => s + effOvr(p), 0) / xi.length) : 0;
  const diff = playerAvg - opponentAvg;
  const tiredCount = xi.filter(p => window.TEAM.staminaLevel(window.TEAM.fatigueOf(fatigue, p.id)) === 'spent').length;
  const youngUnder = xi.filter(p => p.age < C.PRESSURE_U_AGE);
  const pressuredCount = youngUnder.filter(p => pressOf(p) > 0).length;

  function swapInto(starterIdx) {
    if (sel == null) return;
    const bp = res.find(p => p.id === sel);
    const sp = xi[starterIdx];
    if (!bp || stOf(bp.id)) return;                   // cannot field a suspended/injured reserve
    const forcedOut = origIds.has(sp.id) && !!stOf(sp.id);   // replacing an unavailable starter is free
    // lineup arrangement before kick-off is unlimited; only the position must match
    // (forced replacement of an unavailable starter relaxes to same kind).
    if (forcedOut ? !sameKind(bp, sp) : bp.pos !== sp.pos) return;
    const nx = [...xi]; nx[starterIdx] = bp;
    const nr = res.map(p => p.id === sel ? sp : p);
    setXi(nx); setRes(nr); setSel(null);
  }

  function outTag(id) {
    const s = stOf(id);
    if (!s) return null;
    const label = s.kind === 'suspended' ? t('ui.match.tagSuspended') : t('ui.match.tagInjured', { n: s.n });
    return <span className="out-tag" title={s.kind === 'suspended' ? t('ui.match.suspendedTitle') : t('ui.match.injuredTitle', { n: s.n })}>{label}</span>;
  }

  const grpStarters = (pos) => xi.map((p, i) => ({ p, i })).filter(o => o.p.pos === pos);
  const POS_ORDER = ['GOL', 'ZAG', 'LAT', 'MEI', 'ATA'];

  // matchup advisories — shown at the very TOP of the pre-match screen
  const warningsBlocks = (
    <>
      {diff < 0 ? (
        <div className="warn" style={{ marginBottom: 10 }}>
          <span aria-hidden="true">⚠️</span>
          <span><b>{t('ui.match.underdogB')}</b> {t('ui.match.underdog', { opp: opponentAvg, you: playerAvg })}
            {tiredCount > 0 && t('ui.match.tiredHint')}</span>
        </div>
      ) : (
        <div className="warn" style={{ marginBottom: 10, background: 'rgba(0,168,89,.08)', borderColor: 'rgba(0,168,89,.25)' }}>
          <span aria-hidden="true">✅</span>
          <span><b>{t('ui.match.favB')}</b> {t('ui.match.fav', { you: playerAvg, opp: opponentAvg })}
            {tiredCount > 0 && t('ui.match.favTired')}</span>
        </div>
      )}
      {youngUnder.length > 0 && (
        <div className="warn" style={{ marginBottom: 10, background: 'rgba(79,134,255,.08)', borderColor: 'rgba(79,134,255,.28)' }}>
          <span aria-hidden="true">🎓</span>
          <span><b>{t('ui.match.youthB')}</b> {pressuredCount > 0
            ? <>{t('ui.match.youthOn', { pen: round.n * C.PRESSURE_PER_ROUND })}{hasLeader ? t('ui.match.youthLeader') : t('ui.match.youthNoLeader')}</>
            : t('ui.match.youthNone')}</span>
        </div>
      )}
      {!canStart && (
        <div className="warn" style={{ marginBottom: 10, background: 'rgba(229,72,77,.1)', borderColor: 'rgba(229,72,77,.35)' }}>
          <span aria-hidden="true">🚫</span>
          <span><b>{t('ui.match.missingB')}</b> {blockedXI.map((p, i) => (
            <React.Fragment key={p.id}>{i > 0 ? ', ' : ' '}<b>{p.name}</b> ({stOf(p.id).kind === 'suspended' ? t('ui.match.suspended') : t('ui.match.injured', { n: stOf(p.id).n })})</React.Fragment>
          ))}{t('ui.match.missingTail')}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="stage screen-fade">
      <div className="prematch-warnings">{warningsBlocks}</div>
      <div className="shead">
        <div>
          <span className="tok">{window.roundText(round, 'short').toLowerCase()}</span>
          <h2 style={{ marginTop: 4 }}>{window.roundText(round, 'label')}</h2>
        </div>
        <button className="btn btn-yellow start-top" disabled={!canStart}
          onClick={() => canStart && onStart(xi, res)}>{t('ui.match.start')}</button>
      </div>

      <div className="vs-panel" style={{ marginBottom: 22 }}>
        <div className="vs-side">
          <Crest />
          <span className="tn">{me.name}</span>
          <span className="cup">{t('ui.match.allstar')}</span>
          <span className="ovr">{playerAvg}</span>
        </div>
        <div className="vs-mid">
          <span className="x">×</span>
          <span className="rnd">{window.roundText(round, 'short')}</span>
        </div>
        <button className="vs-side vs-opp" onClick={() => setShowOpp(true)} title={t('ui.match.oppView')}>
          <Flag code={opp.code} />
          <span className="tn">{opp.team}</span>
          <span className="cup">{opp.cup}</span>
          <span className="ovr" style={{ color: 'var(--fg2)' }}>{opponentAvg}</span>
          <span className="vs-opp-hint">{t('ui.match.oppView')} →</span>
        </button>
      </div>

      <div className="prematch-grid">
        <div>
          <div className="shead"><span className="tok">{t('ui.match.lineupTok')}</span><span className="meta">{formation}</span></div>
          <Pitch starters={xi} formation={formation} starId={starId} />
        </div>

        <div>
          {/* SUBSTITUTIONS / rotation */}
          <div className="squadbox">
            <div className="hd">
              <h3>{t('ui.match.subs')}</h3>
              <span className="cnt" style={{ color: 'var(--fg3)' }}>{t('ui.match.subsFree')}</span>
            </div>
            {sel != null && (
              <div className="sub-hint">
                {t('ui.match.subHint', { name: res.find(p => p.id === sel).name, pos: res.find(p => p.id === sel).pos })}
              </div>
            )}
            <div className="slot-list">
              {POS_ORDER.flatMap(pos => grpStarters(pos)).map(({ p, i }) => {
                const f = window.TEAM.fatigueOf(fatigue, p.id);
                const pr = pressOf(p);
                const selP = sel != null ? res.find(x => x.id === sel) : null;
                const eligible = !!selP && (stOf(p.id) ? sameKind(selP, p) : selP.pos === p.pos);
                return (
                  <div className={`slot stamina-row ${eligible ? 'swap-target' : ''} ${stOf(p.id) ? 'out' : ''}`} key={p.id}
                    onClick={() => eligible && swapInto(i)} style={eligible ? { cursor: 'pointer' } : {}}>
                    <span className="pp">{p.pos}</span>
                    <span className="nm">
                      {p.id === starId && <span className="star-dot">★ </span>}
                      {p.code && <Flag code={p.code} className="slot-flag" />} {p.name}
                      {outTag(p.id)}
                      {p.leader && <span className="lead-tag">{t('ui.common.leader')}</span>}
                      {p.age < C.PRESSURE_U_AGE && <span className="young-tag" title={t('ui.common.age', { n: p.age })}>{t('ui.match.young')}</span>}
                      {pr > 0 && <span className="press-tag" title={t('ui.match.pressTitle')}>{t('ui.match.pressTag', { n: pr })}</span>}
                      {boostOf(p) > 0 && p.id !== starId && <span className="chem-tag" title={t('ui.match.chemTitle', { team: p.team, cup: p.cup })}>{t('ui.match.chemTag')}</span>}
                    </span>
                    <StaminaBar fatigue={f} />
                    <button className="ovbox" onClick={() => setOvrInfo(p)} title={t('ui.match.ovrInfoTitle')} aria-label={t('ui.match.ovrInfoTitle')}>
                      {effOvr(p) - p.overall !== 0 && (
                        <span className={`ov-delta ${effOvr(p) - p.overall > 0 ? 'up' : 'down'}`}>
                          {effOvr(p) - p.overall > 0 ? '+' : '−'}{Math.abs(effOvr(p) - p.overall)}
                        </span>
                      )}
                      <b className="ov-num">{effOvr(p)}</b>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="bench-head">{t('ui.match.bench')}</div>
            <div className="slot-list">
              {res.map(p => {
                const f = window.TEAM.fatigueOf(fatigue, p.id);
                const active = sel === p.id;
                const out = stOf(p.id);
                return (
                  <div className={`slot stamina-row bench ${active ? 'swapping' : ''} ${out ? 'out' : ''}`} key={p.id}
                    onClick={() => !out && setSel(active ? null : p.id)} style={{ cursor: out ? 'not-allowed' : 'pointer' }}>
                    <span className="pp">{p.pos}</span>
                    <span className="nm">{p.code && <Flag code={p.code} className="slot-flag" />} {p.name}{outTag(p.id)}</span>
                    <StaminaBar fatigue={f} />
                    <span className="ov">{effOvr(p)}</span>
                    <button className="swapbtn" title={out ? t('ui.match.unavailable') : t('ui.match.fieldReserve')} disabled={!!out}
                      onClick={(e) => { e.stopPropagation(); if (!out) setSel(active ? null : p.id); }}>
                      {active ? '✕' : '⇄'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
        <button className="btn btn-yellow" style={{ fontSize: 16, padding: '15px 40px' }}
          disabled={!canStart} onClick={() => canStart && onStart(xi, res)}>
          {t('ui.match.start')}
        </button>
      </div>

      {ovrInfo && Modal && (
        <Modal title={t('ui.match.ovrInfoTitle')} eyebrow={ovrInfo.name} onClose={() => setOvrInfo(null)}>
          <div className="ovr-breakdown">
            <div className="ovr-line"><span>{t('ui.match.ovrBase')}</span><b>{ovrInfo.overall}</b></div>
            {fatPen(ovrInfo) > 0 && <div className="ovr-line down"><span>{t('ui.match.ovrFatigue')}</span><b>−{fatPen(ovrInfo)}</b></div>}
            {pressOf(ovrInfo) > 0 && <div className="ovr-line down"><span>{t('ui.match.ovrPressure')}</span><b>−{pressOf(ovrInfo)}</b></div>}
            {boostOf(ovrInfo) > 0 && <div className="ovr-line up"><span>{ovrInfo.id === starId ? t('ui.match.ovrCaptain') : t('ui.match.ovrChem')}</span><b>+{boostOf(ovrInfo)}</b></div>}
            <div className="ovr-line total"><span>{t('ui.match.ovrEff')}</span><b>{effOvr(ovrInfo)}</b></div>
          </div>
          <p className="p" style={{ marginTop: 16, fontSize: 13 }}>{t('ui.match.ovrExplain', { cap: C.CAPTAIN_OVR_BOOST, chem: C.CHEMISTRY_OVR_BOOST, penMax: C.FATIGUE_PENALTY_MAX })}</p>
        </Modal>
      )}

      {showOpp && Modal && (
        <Modal title={`${opp.team} ${opp.cup}`} eyebrow={t('ui.match.oppTok')} onClose={() => setShowOpp(false)}>
          <p className="p" style={{ marginTop: 0, marginBottom: 14, fontSize: 13 }}>{t('ui.match.oppAvgLine', { avg: opponentAvg })}</p>
          <div className="slot-list">
            {oppMen.map(p => (
              <div className="slot" key={p.id}>
                <span className="pp">{p.pos}</span>
                <span className="nm">{p.code && <Flag code={p.code} className="slot-flag" />} {p.name}</span>
                <span className="ov" style={{ color: 'var(--fg2)' }}>{p.overall}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- LIVE MATCH TICKER ---------- */
function MatchScreen({ log, me, round, sfx, speed, onSpeedChange, onFinish, onShootout, onPenalty, pendingPen }) {
  const beep = sfx || (() => {});
  const C = window.CONFIG;
  const t = (k, v) => window.I18N.t(k, v);
  const spLabel = (id) => t('ui.home.' + ({ normal: 'spNormal', rapido: 'spRapido', super: 'spSuper' }[id] || 'spNormal'));
  const SP = C.MATCH_SPEEDS;
  const maxMinute = log.extraTime ? 120 : 90;
  const TICK = 90;
  // pacing only — the result is fixed in `log`. Speed is changeable mid-match;
  // stepRef is read each tick so a change takes effect without resetting the clock.
  const [localSpeed, setLocalSpeed] = useState(speed && SP[speed] ? speed : C.MATCH_SPEED_DEFAULT);
  const durationMs = (SP[localSpeed] || SP[C.MATCH_SPEED_DEFAULT]).durationMs;
  const stepRef = useRef(0);
  stepRef.current = maxMinute / (durationMs / TICK);
  useEffect(() => { if (speed && SP[speed]) setLocalSpeed(speed); }, [speed]); // eslint-disable-line
  function changeSpeed(v) { setLocalSpeed(v); if (onSpeedChange) onSpeedChange(v); beep('select'); }

  const [clock, setClock] = useState(0);
  const [done, setDone] = useState(false);
  const clockRef = useRef(0);
  const tickerRef = useRef(null);
  const pausedRef = useRef(false);                 // frozen while a penalty mini-game is open
  const handledRef = useRef(new Set());            // penIds already presented
  const skipRef = useRef(false);                   // "Pular" / reduced-motion => no penalty pauses
  const iPens = log.matchPens || [];

  // events that should be visible at the current clock
  const shown = log.events.filter(e => e.minute <= Math.ceil(clock));
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // play SFX as new goals / final whistle surface
  const goalsSeen = useRef(0);
  const whistled = useRef(false);
  useEffect(() => {
    const goalsShown = shown.filter(e => e.type === 'goal');
    const gc = goalsShown.length;
    if (gc > goalsSeen.current) {
      goalsSeen.current = gc;
      // SFX depends on the side of the just-revealed goal: celebratory for the
      // player (home), sober for the opponent (away). Neutral events have no side.
      const last = goalsShown[gc - 1];
      beep(last && last.side === 'away' ? 'goalAway' : 'goal');
    }
    if (done && !whistled.current) { whistled.current = true; beep('whistle'); }
  }); // eslint-disable-line

  useEffect(() => {
    if (reduced) { finishNow(); return; }
    const iv = setInterval(() => {
      if (pausedRef.current) return;               // frozen for an open penalty
      clockRef.current += stepRef.current;

      // pause just before revealing an interactive penalty (hand it to the UI)
      if (!skipRef.current && onPenalty) {
        const cm = Math.ceil(clockRef.current);
        const due = iPens.find(p => p.minute <= cm && p.minute <= maxMinute && !handledRef.current.has(p.penId));
        if (due) {
          handledRef.current.add(due.penId);
          pausedRef.current = true;
          clockRef.current = Math.max(0, due.minute - 1);   // keep the outcome hidden until resume
          setClock(clockRef.current);
          onPenalty(due);
          return;
        }
      }

      if (clockRef.current >= maxMinute) {
        clockRef.current = maxMinute;
        setClock(maxMinute);
        clearInterval(iv);
        setTimeout(() => setDone(true), 600);
      } else {
        setClock(clockRef.current);
      }
    }, TICK);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, []);

  // resume the ticker once the penalty mini-game closes
  useEffect(() => {
    if (pendingPen == null) pausedRef.current = false;
  }, [pendingPen]);

  function finishNow() {
    skipRef.current = true;
    pausedRef.current = false;
    clockRef.current = maxMinute;
    setClock(maxMinute);
    setDone(true);
  }

  // current score from revealed goal events
  const lastGoal = [...shown].reverse().find(e => e.type === 'goal');
  const score = lastGoal ? lastGoal.score : { home: 0, away: 0 };

  const cm = Math.min(Math.ceil(clock), maxMinute);
  const clockTxt = cm <= 90 ? `${cm}'` : `${cm}'${t('ui.match.etSuffix')}`;
  const pct = (clock / maxMinute) * 100;

  // reverse for newest-on-top feed
  const feed = [...shown].reverse();

  return (
    <div className="stage narrow screen-fade">
      <div className="scoreboard" aria-label={t('ui.match.scoreAria', { home: log.home.name, hs: score.home, away: log.away.name, as: score.away })}>
        <div className="sb-team">
          <TeamMark code={log.home.code} dream={log.home.dream} />
          <span className="tn">{log.home.name}</span>
        </div>
        <div className="sb-mid">
          <div className="sb-score">{score.home}<span style={{ color: 'var(--fg3)', margin: '0 10px' }}>–</span>{score.away}</div>
          <div className="sb-clock">
            {!done && <span className="clock-dot"></span>}
            {done ? t('ui.match.fullTime') : clockTxt}
          </div>
        </div>
        <div className="sb-team away">
          <Flag code={log.away.code} />
          <span className="tn">{log.away.name}</span>
        </div>
      </div>
      <div className="progress"><i style={{ width: pct + '%' }}></i></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <span className="meta" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg3)', fontSize: 13 }}>
          {window.roundText(round, 'label')} · {me.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!done && (
            <div className="speed-mini" role="group" aria-label={t('ui.home.speedLabel')}>
              {Object.keys(SP).map(id => (
                <button key={id} className={localSpeed === id ? 'on' : ''}
                  title={spLabel(id)} onClick={() => changeSpeed(id)}>{spLabel(id)}</button>
              ))}
            </div>
          )}
          {!done
            ? <button className="btn-mini" onClick={finishNow}>{t('ui.match.skip')}</button>
            : log.needsShootout
              ? <button className="btn btn-yellow" onClick={onShootout}>{t('ui.match.toShootout')}</button>
              : <button className="btn btn-green" onClick={onFinish}>{t('ui.match.seeResult')}</button>}
        </div>
      </div>

      <div className="ticker" role="log" aria-live="polite" ref={tickerRef}>
        {feed.map((e, i) => (
          <div className={`tk ${e.type} ${e.side === 'away' ? 'away' : e.side === 'home' ? 'mine' : ''}`} key={`${e.minute}-${i}-${e.text.slice(0, 8)}`}>
            <span className="mn">{e.minute > 0 ? `${e.minute}'` : '•'}</span>
            <span className="tx">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { StaminaBar, PreMatchScreen, MatchScreen });
