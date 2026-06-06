/* ============================================================
   COPA DRAFT — ui/match.jsx
   Pre-match (lineup on the pitch + opponent preview) and the
   live minute-by-minute ticker.
   ============================================================ */
function StaminaBar({ fatigue }) {
  const pct = window.TEAM.staminaPct(fatigue);
  const lvl = window.TEAM.staminaLevel(fatigue);
  return (
    <span className={`stamina ${lvl}`} title={`Energia ${pct}%`}>
      <span className="stamina-bar"><i style={{ width: pct + '%' }}></i></span>
    </span>
  );
}

function PreMatchScreen({ me, starters, bench, formation, starId, round, fatigue, playerStatus, opponentXI, opponentAvg, onStart }) {
  const C = window.CONFIG;
  const opp = round.opponent;
  const keyMen = [...opponentXI].sort((a, b) => b.overall - a.overall).slice(0, 3);

  const [xi, setXi] = useState(starters);
  const [res, setRes] = useState(bench);
  const [sel, setSel] = useState(null);       // selected bench id to swap in

  const origIds = useMemo(() => new Set(starters.map(p => p.id)), [starters]);
  const stOf = (id) => window.TEAM.statusOf(playerStatus, id);   // null when available
  const sameKind = (a, b) => (a.pos === 'GOL') === (b.pos === 'GOL'); // keeper<->keeper, outfield<->outfield
  const xiIds = new Set(xi.map(p => p.id));
  // only TACTICAL rotations (swapping out an AVAILABLE starter) count toward the budget;
  // replacing a suspended/injured starter is a forced, free substitution.
  const subsUsed = starters.filter(o => !xiIds.has(o.id) && !stOf(o.id)).length;
  const blockedXI = xi.filter(p => stOf(p.id));                  // unavailable players still in the XI
  const canStart = blockedXI.length === 0;

  const hasLeader = xi.some(p => p.leader);
  const pressOf = (p) => window.TEAM.pressureOf(p, round.n, hasLeader);
  const effOvr = (p) => window.TEAM.effInMatch(p, fatigue, round.n, hasLeader);
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
    // tactical sub: exact position; forced replacement: same kind (avoids softlock w/o an exact reserve)
    if (forcedOut ? !sameKind(bp, sp) : bp.pos !== sp.pos) return;
    if (origIds.has(sp.id) && !forcedOut && subsUsed >= C.SUBS_MAX) return;
    const nx = [...xi]; nx[starterIdx] = bp;
    const nr = res.map(p => p.id === sel ? sp : p);
    setXi(nx); setRes(nr); setSel(null);
  }

  function outTag(id) {
    const s = stOf(id);
    if (!s) return null;
    const label = s.kind === 'suspended' ? 'SUSPENSO' : `LESIONADO ${s.n}f`;
    return <span className="out-tag" title={s.kind === 'suspended' ? 'Suspenso nesta fase' : `Lesionado por ${s.n} fase(s)`}>{label}</span>;
  }

  const grpStarters = (pos) => xi.map((p, i) => ({ p, i })).filter(o => o.p.pos === pos);
  const POS_ORDER = ['GOL', 'ZAG', 'LAT', 'MEI', 'ATA'];

  return (
    <div className="stage screen-fade">
      <div className="shead">
        <div>
          <span className="tok">{round.id}</span>
          <h2 style={{ marginTop: 4 }}>{round.label}</h2>
        </div>
        <button className="btn btn-yellow start-top" disabled={!canStart}
          onClick={() => canStart && onStart(xi, res)}>▶ Iniciar partida</button>
      </div>

      <div className="vs-panel" style={{ marginBottom: 22 }}>
        <div className="vs-side">
          <Crest />
          <span className="tn">{me.name}</span>
          <span className="cup">all-star</span>
          <span className="ovr">{playerAvg}</span>
        </div>
        <div className="vs-mid">
          <span className="x">×</span>
          <span className="rnd">{round.short}</span>
        </div>
        <div className="vs-side">
          <Flag code={opp.code} />
          <span className="tn">{opp.team}</span>
          <span className="cup">{opp.cup}</span>
          <span className="ovr" style={{ color: 'var(--fg2)' }}>{opponentAvg}</span>
        </div>
      </div>

      <div className="prematch-grid">
        <div>
          <div className="shead"><span className="tok">escalação</span><span className="meta">{formation}</span></div>
          <Pitch starters={xi} formation={formation} starId={starId} />
        </div>

        <div>
          {diff < 0 ? (
            <div className="warn" style={{ marginBottom: 14 }}>
              <span aria-hidden="true">⚠️</span>
              <span><b>Azarão.</b> Na média efetiva o adversário leva vantagem ({opponentAvg} vs {playerAvg}).
                {tiredCount > 0 && ' Há titulares no vermelho — pense em rodar o elenco.'}</span>
            </div>
          ) : (
            <div className="warn" style={{ marginBottom: 14, background: 'rgba(0,168,89,.08)', borderColor: 'rgba(0,168,89,.25)' }}>
              <span aria-hidden="true">✅</span>
              <span><b>Favorito.</b> Sua média efetiva é superior ({playerAvg} vs {opponentAvg}).
                {tiredCount > 0 && ' Mas cuidado com o desgaste de alguns titulares.'}</span>
            </div>
          )}

          {youngUnder.length > 0 && (
            <div className="warn" style={{ marginBottom: 14, background: 'rgba(79,134,255,.08)', borderColor: 'rgba(79,134,255,.28)' }}>
              <span aria-hidden="true">🎓</span>
              <span><b>Pressão da garotada.</b> {pressuredCount > 0
                ? <>Os sub-23 sentem o peso do mata-mata (−{round.n * C.PRESSURE_PER_ROUND} no overall nesta fase). {hasLeader
                    ? <>Um <b>líder</b> em campo reduz isso pela metade.</>
                    : <>Escale um <b>líder</b> para amenizar.</>}</>
                : <>Sem pressão nesta fase inicial — ela cresce a cada rodada do mata-mata.</>}</span>
            </div>
          )}

          {!canStart && (
            <div className="warn" style={{ marginBottom: 14, background: 'rgba(229,72,77,.1)', borderColor: 'rgba(229,72,77,.35)' }}>
              <span aria-hidden="true">🚫</span>
              <span><b>Desfalques na escalação.</b> {blockedXI.map((p, i) => (
                <React.Fragment key={p.id}>{i > 0 ? ', ' : ''}<b>{p.name}</b> ({stOf(p.id).kind === 'suspended' ? 'suspenso' : `lesionado ${stOf(p.id).n}f`})</React.Fragment>
              ))}. Substitua por reservas disponíveis antes de iniciar — trocas forçadas não gastam substituição.</span>
            </div>
          )}

          {/* SUBSTITUTIONS / rotation */}
          <div className="squadbox">
            <div className="hd">
              <h3>Substituições</h3>
              <span className={`cnt ${subsUsed > 0 ? 'full' : ''}`} style={subsUsed === 0 ? { color: 'var(--fg3)' } : {}}>
                {subsUsed}/{C.SUBS_MAX} usadas
              </span>
            </div>
            {sel != null && (
              <div className="sub-hint">
                Entrando: <b>{res.find(p => p.id === sel).name}</b> ({C.POS_LABEL[res.find(p => p.id === sel).pos]}).
                Toque num titular <b>{res.find(p => p.id === sel).pos}</b> para trocar.
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
                      {p.leader && <span className="lead-tag">LÍDER</span>}
                      {p.age < C.PRESSURE_U_AGE && <span className="young-tag" title={`${p.age} anos`}>SUB-23</span>}
                      {pr > 0 && <span className="press-tag" title="Pressão do mata-mata">pressão −{pr}</span>}
                    </span>
                    <StaminaBar fatigue={f} />
                    <span className="ov">{effOvr(p)}{(f + pr) > 0 && <span className="ov-pen"> −{f + pr}</span>}</span>
                  </div>
                );
              })}
            </div>
            <div className="bench-head">Reservas</div>
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
                    <button className="swapbtn" title={out ? 'Indisponível' : 'Escalar este reserva'} disabled={!!out}
                      onClick={(e) => { e.stopPropagation(); if (!out) setSel(active ? null : p.id); }}>
                      {active ? '✕' : '⇄'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="squadbox" style={{ marginTop: 16 }}>
            <div className="hd"><h3>Adversário</h3><span className="cnt" style={{ color: 'var(--fg3)' }}>destaques</span></div>
            <div className="slot-list">
              {keyMen.map(p => (
                <div className="slot" key={p.id}>
                  <span className="pp">{p.pos}</span>
                  <span className="nm">{p.name}</span>
                  <span className="ov" style={{ color: 'var(--fg2)' }}>{p.overall}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
        <button className="btn btn-yellow" style={{ fontSize: 16, padding: '15px 40px' }}
          disabled={!canStart} onClick={() => canStart && onStart(xi, res)}>
          ▶ Iniciar partida
        </button>
      </div>
    </div>
  );
}

/* ---------- LIVE MATCH TICKER ---------- */
function MatchScreen({ log, me, round, sfx, onFinish, onShootout, onPenalty, pendingPen }) {
  const beep = sfx || (() => {});
  const maxMinute = log.extraTime ? 120 : 90;
  const DURATION_MS = 34000;
  const TICK = 90;
  const step = maxMinute / (DURATION_MS / TICK);

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
    const gc = shown.filter(e => e.type === 'goal').length;
    if (gc > goalsSeen.current) { goalsSeen.current = gc; beep('goal'); }
    if (done && !whistled.current) { whistled.current = true; beep('whistle'); }
  }); // eslint-disable-line

  useEffect(() => {
    if (reduced) { finishNow(); return; }
    const iv = setInterval(() => {
      if (pausedRef.current) return;               // frozen for an open penalty
      clockRef.current += step;

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
  const clockTxt = cm <= 90 ? `${cm}'` : `${cm}' (PRO)`;
  const pct = (clock / maxMinute) * 100;

  // reverse for newest-on-top feed
  const feed = [...shown].reverse();

  return (
    <div className="stage narrow screen-fade">
      <div className="scoreboard" aria-label={`Placar ${log.home.name} ${score.home}, ${log.away.name} ${score.away}`}>
        <div className="sb-team">
          <TeamMark code={log.home.code} dream={log.home.dream} />
          <span className="tn">{log.home.name}</span>
        </div>
        <div className="sb-mid">
          <div className="sb-score">{score.home}<span style={{ color: 'var(--fg3)', margin: '0 10px' }}>–</span>{score.away}</div>
          <div className="sb-clock">
            {!done && <span className="clock-dot"></span>}
            {done ? 'Fim de jogo' : clockTxt}
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
          {round.label} · {me.name}
        </span>
        {!done
          ? <button className="btn-mini" onClick={finishNow}>Pular ⏭</button>
          : log.needsShootout
            ? <button className="btn btn-yellow" onClick={onShootout}>Ir para os pênaltis →</button>
            : <button className="btn btn-green" onClick={onFinish}>Ver resultado →</button>}
      </div>

      <div className="ticker" role="log" aria-live="polite" ref={tickerRef}>
        {feed.map((e, i) => (
          <div className={`tk ${e.type}`} key={`${e.minute}-${i}-${e.text.slice(0, 8)}`}>
            <span className="mn">{e.minute > 0 ? `${e.minute}'` : '•'}</span>
            <span className="tx">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { StaminaBar, PreMatchScreen, MatchScreen });
