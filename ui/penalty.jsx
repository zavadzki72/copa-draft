/* ============================================================
   COPA DRAFT — ui/penalty.jsx
   Interactive shootout mini-game (Phase 2).
   You COBRA (pick a corner) and you DEFENDE (pick a side to dive).
   Finishing biases your kicks, the keeper overall biases saves.
   Player is always 'home'. onComplete({home,away}) finalizes.
   ============================================================ */
function PenaltyShootout({ home, away, sfx, onComplete }) {
  const C = window.CONFIG;
  const beep = sfx || (() => {});
  const ZONES = C.PK_ZONES;            // ['esq','meio','dir']
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sideData = (s) => {
    const gk = s.starters.find(p => p.pos === 'GOL') || s.starters[0];
    const takers = [...s.starters].sort((a, b) => b.attrs.shooting - a.attrs.shooting);
    return { gkOvr: gk ? gk.overall : 75, takers };
  };
  const HD = useMemo(() => sideData(home), [home]);
  const AD = useMemo(() => sideData(away), [away]);

  const [score, setScore] = useState({ home: 0, away: 0 });
  const [dots, setDots] = useState({ home: [], away: [] });   // 'goal'|'miss'
  const [kicks, setKicks] = useState({ home: 0, away: 0 });
  const [turn, setTurn] = useState('home');                   // whose kick
  const [phase, setPhase] = useState('aim');                  // aim|anim|between|done
  const [anim, setAnim] = useState(null);                     // {shoot,gk,scored,youKicked,kicker,outcome}
  const [sudden, setSudden] = useState(false);
  const [winner, setWinner] = useState(null);
  const doneRef = useRef(false);   // guards stray kick timeouts after a finish
  useEffect(() => () => { doneRef.current = true; }, []);

  const youKick = turn === 'home';
  const kicker = youKick ? HD.takers[kicks.home % HD.takers.length] : AD.takers[kicks.away % AD.takers.length];
  const gkOvr = youKick ? AD.gkOvr : HD.gkOvr;                 // keeper facing this kick

  function computeGoal(shootZone, gkZone, finishing, keeperOvr) {
    if (shootZone !== gkZone) {
      const missP = Math.max(0.03, 0.09 - (finishing - 80) * 0.0015);
      return Math.random() > missP;                           // usually a goal
    }
    let saveP = C.PK_SAVE_BASE + (keeperOvr - 80) * 0.01 - (finishing - 80) * 0.006;
    saveP = Math.max(0.25, Math.min(0.9, saveP));
    return Math.random() > saveP;                             // keeper guessed right
  }

  function aiGuess(playerZone) {
    // keeper reads the corner a fraction of the time, else guesses
    if (Math.random() < C.PK_AI_READ) return playerZone;
    return ZONES[Math.floor(Math.random() * ZONES.length)];
  }
  function aiShoot() {
    // AI prefers the corners slightly over the middle
    if (Math.random() < 0.8) return Math.random() < 0.5 ? 'esq' : 'dir';
    return 'meio';
  }

  function resolveDecided(ns, nk, isSudden) {
    const hRem = isSudden ? 0 : Math.max(0, C.PK_ROUNDS - nk.home);
    const aRem = isSudden ? 0 : Math.max(0, C.PK_ROUNDS - nk.away);
    if (!isSudden) {
      if (ns.home > ns.away + aRem) return 'home';
      if (ns.away > ns.home + hRem) return 'away';
      return null;
    }
    // sudden death: decide only when both have taken equal kicks
    if (nk.home === nk.away && ns.home !== ns.away) return ns.home > ns.away ? 'home' : 'away';
    return null;
  }

  function commit(shootZone) {
    if (phase !== 'aim' || doneRef.current) return;
    const gkZone = youKick ? aiGuess(shootZone) : shootZone;   // when you defend, you pick the dive (shootZone arg = your dive)
    let actualShoot, actualGk, scored;
    if (youKick) {
      actualShoot = shootZone; actualGk = gkZone;
      scored = computeGoal(actualShoot, actualGk, kicker.attrs.shooting, gkOvr);
    } else {
      actualShoot = aiShoot(); actualGk = shootZone;           // your dive
      scored = computeGoal(actualShoot, actualGk, kicker.attrs.shooting, gkOvr);
    }
    const outcome = scored ? 'goal' : (actualShoot === actualGk ? 'save' : 'miss');
    beep(outcome === 'goal' ? 'goal' : outcome === 'save' ? 'save' : 'miss');
    setAnim({ shoot: actualShoot, gk: actualGk, scored, youKick, kicker, outcome });
    setPhase('anim');

    const advance = () => {
      const ns = { ...score, [turn]: score[turn] + (scored ? 1 : 0) };
      const nk = { ...kicks, [turn]: kicks[turn] + 1 };
      const nd = { ...dots, [turn]: [...dots[turn], scored ? 'goal' : 'miss'] };
      if (doneRef.current) return;
      setScore(ns); setKicks(nk); setDots(nd);

      const regOver = nk.home >= C.PK_ROUNDS && nk.away >= C.PK_ROUNDS;
      const dec = resolveDecided(ns, nk, sudden || (regOver && nk.home === nk.away));
      setPhase('between');
      setTimeout(() => {
        if (doneRef.current) return;
        if (dec) { doneRef.current = true; setWinner(dec); setPhase('done'); return; }
        if (!sudden && regOver) setSudden(true);
        setTurn(turn === 'home' ? 'away' : 'home');
        setAnim(null);
        setPhase('aim');
      }, reduced ? 200 : 950);
    };
    setTimeout(advance, reduced ? 50 : 1050);
  }

  function autoResolve() {
    doneRef.current = true;   // cancel any in-flight kick timeouts
    let ns = { ...score }, nk = { ...kicks }, nd = { home: [...dots.home], away: [...dots.away] };
    let t = turn, sd = sudden, guard = 0, win = null;
    while (!win && guard < 60) {
      guard++;
      const yk = t === 'home';
      const kk = yk ? HD.takers[nk.home % HD.takers.length] : AD.takers[nk.away % AD.takers.length];
      const keeper = yk ? AD.gkOvr : HD.gkOvr;
      const sZone = ZONES[Math.floor(Math.random() * 3)];
      const gZone = ZONES[Math.floor(Math.random() * 3)];
      const scored = computeGoal(sZone, gZone, kk.attrs.shooting, keeper);
      ns[t] += scored ? 1 : 0; nk[t] += 1; nd[t].push(scored ? 'goal' : 'miss');
      const regOver = nk.home >= C.PK_ROUNDS && nk.away >= C.PK_ROUNDS;
      win = resolveDecided(ns, nk, sd || (regOver && nk.home === nk.away));
      if (!sd && regOver) sd = true;
      t = t === 'home' ? 'away' : 'home';
    }
    setScore(ns); setKicks(nk); setDots(nd); setSudden(sd);
    setWinner(win); setPhase('done'); setAnim(null);
  }

  const promptTxt = phase === 'done' ? ''
    : youKick ? `Cobrança de ${kicker.name} — escolha o canto`
      : `${kicker.name} (${away.name}) vai bater — escolha o lado para defender`;

  const zoneCenter = { esq: 22, meio: 50, dir: 78 };
  const ballStyle = () => {
    if (!anim) return {};
    const x = zoneCenter[anim.shoot];
    return { left: x + '%', top: '34%', transform: 'translate(-50%,-50%) scale(.7)' };
  };
  const gkStyle = () => {
    const z = anim ? anim.gk : 'meio';
    const x = zoneCenter[z];
    const rot = z === 'esq' ? -38 : z === 'dir' ? 38 : 0;
    return { left: x + '%', transform: `translateX(-50%) rotate(${rot}deg)` };
  };

  const Dots = ({ list, n }) => (
    <div className="pk-dots">
      {Array.from({ length: Math.max(n, list.length) }).map((_, i) => {
        const v = list[i];
        return <span key={i} className={`pk-dot ${v || 'pending'}`}></span>;
      })}
    </div>
  );

  return (
    <div className="stage narrow screen-fade">
      <div className="shead">
        <div><span className="tok">pênaltis</span><h2 style={{ marginTop: 4 }}>Decisão por pênaltis</h2></div>
        <span className="meta">{sudden ? 'morte súbita' : `melhor de ${C.PK_ROUNDS}`}</span>
      </div>

      {/* shootout scoreboard */}
      <div className="pk-board">
        <div className="pk-team">
          <div className="pk-name"><Crest className="cr-inline" /> {home.name}</div>
          <Dots list={dots.home} n={C.PK_ROUNDS} />
        </div>
        <div className="pk-score">{score.home}<span>–</span>{score.away}</div>
        <div className="pk-team away">
          <div className="pk-name">{away.name} <Flag code={away.code} className="slot-flag" /></div>
          <Dots list={dots.away} n={C.PK_ROUNDS} />
        </div>
      </div>

      {/* goal + pitch */}
      <div className={`pk-stage ${anim ? 'shot-' + anim.outcome : ''}`}>
        <div className="pk-goal">
          <div className="pk-net"></div>
          <div className="pk-post left"></div>
          <div className="pk-post right"></div>
          <div className="pk-bar"></div>
          {/* keeper */}
          <div className={`pk-keeper ${phase === 'anim' || phase === 'between' ? 'dive' : ''}`} style={gkStyle()}>
            <span className="pk-gk-body"></span>
          </div>
          {/* ball */}
          <div className={`pk-ball ${anim ? 'fly' : ''}`} style={anim ? ballStyle() : {}}></div>
          {/* target buttons */}
          {phase === 'aim' && (
            <div className="pk-targets">
              {ZONES.map(z => (
                <button key={z} className="pk-target" onClick={() => commit(z)} aria-label={z}>
                  <span className="pk-target-ic">{youKick ? '🎯' : '🧤'}</span>
                  <span className="pk-target-lb">{z === 'esq' ? 'Esquerda' : z === 'meio' ? 'Meio' : 'Direita'}</span>
                </button>
              ))}
            </div>
          )}
          {/* outcome flash */}
          {anim && phase !== 'aim' && (
            <div className={`pk-flash ${anim.outcome}`}>
              {anim.outcome === 'goal' ? 'GOL!' : anim.outcome === 'save' ? 'DEFENDEU!' : 'PRA FORA!'}
            </div>
          )}
        </div>
        <div className="pk-grass"></div>
      </div>

      <div className="pk-prompt">
        {phase === 'done'
          ? <span className={`pk-result ${winner === 'home' ? 'win' : 'loss'}`}>
              {winner === 'home' ? `✦ ${home.name} venceu nos pênaltis! ✦` : `${away.name} venceu nos pênaltis.`}
            </span>
          : <span className={youKick ? 'you-kick' : 'you-save'}>{promptTxt}</span>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 14 }}>
        {phase === 'done'
          ? <button className="btn btn-green" style={{ fontSize: 16, padding: '14px 36px' }}
              onClick={() => onComplete(score)}>Ver resultado →</button>
          : phase === 'aim'
            ? <button className="btn-mini" onClick={autoResolve}>Simular o resto ⏭</button>
            : null}
      </div>
    </div>
  );
}

/* ---------- IN-MATCH PENALTY (single kick) ----------
   Reuses the shootout mechanic for ONE kick during a match. You COBRA
   (pick a corner) when the penalty is yours, or DEFENDE (pick a side)
   when it is against you. onComplete('goal'|'save'|'miss') hands the
   outcome back so the engine can finalize it. Interactive => Math.random
   is fine here (same accepted exception as the shootout). */
function InMatchPenalty({ youKick, taker, gk, sfx, onComplete }) {
  const C = window.CONFIG;
  const beep = sfx || (() => {});
  const ZONES = C.PK_ZONES;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tShoot = (taker && taker.attrs && taker.attrs.shooting) ||
    (taker && window.DERIVE.deriveAttrs(taker).shooting) || 80;
  const gkOvr = (gk && gk.overall) || 75;

  const [phase, setPhase] = useState('aim');   // aim|anim|done
  const [anim, setAnim] = useState(null);       // {shoot, gk, outcome}
  const doneRef = useRef(false);
  useEffect(() => () => { doneRef.current = true; }, []);

  function computeGoal(shootZone, gkZone) {
    if (shootZone !== gkZone) {
      const missP = Math.max(0.03, 0.09 - (tShoot - 80) * 0.0015);
      return Math.random() > missP;
    }
    let saveP = C.PK_SAVE_BASE + (gkOvr - 80) * 0.01 - (tShoot - 80) * 0.006;
    saveP = Math.max(0.25, 0.9 < saveP ? 0.9 : saveP);
    return Math.random() > saveP;
  }
  const aiGuess = (z) => Math.random() < C.PK_AI_READ ? z : ZONES[Math.floor(Math.random() * ZONES.length)];
  const aiShoot = () => Math.random() < 0.8 ? (Math.random() < 0.5 ? 'esq' : 'dir') : 'meio';

  function commit(pick) {
    if (phase !== 'aim' || doneRef.current) return;
    let shoot, gkZone;
    if (youKick) { shoot = pick; gkZone = aiGuess(pick); }
    else { shoot = aiShoot(); gkZone = pick; }
    const scored = computeGoal(shoot, gkZone);
    const outcome = scored ? 'goal' : (shoot === gkZone ? 'save' : 'miss');
    beep(outcome === 'goal' ? 'goal' : outcome === 'save' ? 'save' : 'miss');
    setAnim({ shoot, gk: gkZone, outcome });
    setPhase('anim');
    setTimeout(() => { if (!doneRef.current) setPhase('done'); }, reduced ? 120 : 950);
  }

  const zoneCenter = { esq: 22, meio: 50, dir: 78 };
  const ballStyle = () => anim ? { left: zoneCenter[anim.shoot] + '%', top: '34%', transform: 'translate(-50%,-50%) scale(.7)' } : {};
  const gkStyle = () => {
    const z = anim ? anim.gk : 'meio';
    const rot = z === 'esq' ? -38 : z === 'dir' ? 38 : 0;
    return { left: zoneCenter[z] + '%', transform: `translateX(-50%) rotate(${rot}deg)` };
  };
  const flashTxt = anim && (anim.outcome === 'goal' ? 'GOL!' : anim.outcome === 'save' ? 'DEFENDEU!' : 'PRA FORA!');
  const prompt = youKick
    ? `Pênalti a favor! ${taker ? taker.name : 'O cobrador'} vai bater — escolha o canto.`
    : `Pênalti contra! ${taker ? taker.name : 'O adversário'} vai bater — escolha o lado para defender.`;

  return (
    <div className="howto-overlay" role="dialog" aria-modal="true" aria-label="Pênalti">
      <div className="howto-panel" style={{ maxWidth: 560 }}>
        <div className="shead" style={{ marginBottom: 12 }}>
          <div><span className="tok">pênalti</span><h2 style={{ marginTop: 4 }}>Cobrança de pênalti</h2></div>
          <span className="meta">{youKick ? 'você cobra' : 'você defende'}</span>
        </div>

        <div className={`pk-stage ${anim ? 'shot-' + anim.outcome : ''}`}>
          <div className="pk-goal">
            <div className="pk-net"></div>
            <div className="pk-post left"></div>
            <div className="pk-post right"></div>
            <div className="pk-bar"></div>
            <div className={`pk-keeper ${phase === 'anim' ? 'dive' : ''}`} style={gkStyle()}>
              <span className="pk-gk-body"></span>
            </div>
            <div className={`pk-ball ${anim ? 'fly' : ''}`} style={anim ? ballStyle() : {}}></div>
            {phase === 'aim' && (
              <div className="pk-targets">
                {ZONES.map(z => (
                  <button key={z} className="pk-target" onClick={() => commit(z)} aria-label={z}>
                    <span className="pk-target-ic">{youKick ? '🎯' : '🧤'}</span>
                    <span className="pk-target-lb">{z === 'esq' ? 'Esquerda' : z === 'meio' ? 'Meio' : 'Direita'}</span>
                  </button>
                ))}
              </div>
            )}
            {anim && phase !== 'aim' && <div className={`pk-flash ${anim.outcome}`}>{flashTxt}</div>}
          </div>
          <div className="pk-grass"></div>
        </div>

        <div className="pk-prompt">
          {phase === 'done'
            ? <span className={`pk-result ${anim.outcome === 'goal' ? (youKick ? 'win' : 'loss') : (youKick ? 'loss' : 'win')}`}>{flashTxt}</span>
            : <span className={youKick ? 'you-kick' : 'you-save'}>{prompt}</span>}
        </div>

        <div className="howto-foot">
          {phase === 'done' && (
            <button className="btn btn-green" onClick={() => onComplete(anim.outcome)}>Continuar →</button>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PenaltyShootout, InMatchPenalty });
