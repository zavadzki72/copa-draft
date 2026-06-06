/* ============================================================
   COPA DRAFT — app.jsx
   Top-level state machine.
   Phase 1 core loop: home → dice DRAFT (roll a selection per slot,
   pick a player) → bracket → pre-match → live match → post-match
   → (repeat / campaign end). The player commands a custom all-star
   "Time dos Sonhos"; opponents are historic national squads.
   ============================================================ */
const {
  GameHeader, HomeScreen, DraftScreen, PreMatchScreen, MatchScreen,
  PostMatchScreen, BracketScreen, CampaignEndScreen, PenaltyShootout,
  AlmanaqueReveal, AchievementToast, HowToPlay, InMatchPenalty,
} = window;

function findPlayer(list, id) { return (list || []).find(p => p.id === id); }

function avgOverall(players) {
  return players.length ? Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length) : 0;
}

function App() {
  const C = window.CONFIG;
  const ME = { name: C.TEAM_NAME, dream: true };
  const profile0 = window.STORE.loadProfile();

  const [phase, setPhase] = useState('home');   // home|draft|reveal|bracket|prematch|match|shootout|post|end
  const [mode, setMode] = useState('classico');
  const [formation, setFormation] = useState('4-3-3');
  const [sound, setSound] = useState(profile0.sound);
  const [canResume, setCanResume] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  const [team, setTeam] = useState({ starters: [], bench: [], starId: null });
  const [fatigue, setFatigue] = useState({});      // { playerId: fatiguePoints }
  const [playerStatus, setPlayerStatus] = useState({}); // { playerId: {suspended, injured} } across phases
  const [campaignStats, setCampaignStats] = useState({}); // per-player tally for end-of-cup awards (home only)
  const [lineup, setLineup] = useState({ starters: [], bench: [] }); // lineup used for the current match
  const [bracket, setBracket] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [oppXI, setOppXI] = useState([]);
  const [match, setMatch] = useState(null);      // {log, ratings}
  const [pendingPen, setPendingPen] = useState(null); // in-match penalty awaiting the player
  const [won, setWon] = useState(false);
  const [unlocked, setUnlocked] = useState([]);  // achievement ids (in order)
  const [toasts, setToasts] = useState([]);      // [{key, ach}]
  const [history, setHistory] = useState([]);    // per-match summaries
  const toastKey = useRef(0);
  const restored = useRef(false);
  const sfxOn = useRef(profile0.sound);

  // ---- restore an in-progress run on first mount ----
  const RESUMABLE = ['bracket', 'prematch', 'match', 'shootout', 'post'];
  useEffect(() => {
    window.SFX.setEnabled(profile0.sound);
    const snap = window.STORE.loadRun();
    if (snap && RESUMABLE.includes(snap.phase) && snap.team && snap.team.starters.length) {
      setCanResume(true);   // offer resume from the home screen
    }
    restored.current = true;
  }, []); // eslint-disable-line

  function snapshot() {
    return { phase, mode, formation, team, fatigue, playerStatus, campaignStats, lineup, bracket,
      currentIdx, oppXI, match, won, unlocked, history };
  }
  function resumeRun() {
    const s = window.STORE.loadRun();
    if (!s) return;
    setMode(s.mode); setFormation(s.formation); setTeam(s.team);
    setFatigue(s.fatigue || {}); setPlayerStatus(s.playerStatus || {});
    setCampaignStats(s.campaignStats || {});
    setLineup(s.lineup || { starters: [], bench: [] });
    setBracket(s.bracket || []); setCurrentIdx(s.currentIdx || 0);
    setOppXI(s.oppXI || []); setMatch(s.match || null); setWon(!!s.won);
    setUnlocked(s.unlocked || []); setHistory(s.history || []);
    setCanResume(false);
    setPhase(s.phase);
  }

  // ---- persist the run whenever meaningful state changes ----
  useEffect(() => {
    if (!restored.current) return;
    if (phase === 'home') return;            // don't clobber a saved run from the menu
    if (phase === 'end') { window.STORE.clearRun(); return; }
    window.STORE.saveRun(snapshot());
  }); // run after every render — cheap JSON to localStorage

  function toggleSound() {
    const v = !sound; setSound(v); sfxOn.current = v;
    window.SFX.setEnabled(v); window.STORE.setSetting('sound', v);
    if (v) window.SFX.play('select');
  }
  function sfx(name) { window.SFX.play(name); }

  function unlock(ids) {
    if (!ids.length) return;
    setUnlocked(prev => {
      const have = new Set(prev);
      const fresh = ids.filter(id => !have.has(id));
      if (!fresh.length) return prev;
      fresh.forEach(id => {
        const ach = window.ACHIEVEMENTS.BY_ID[id];
        const key = ++toastKey.current;
        setToasts(t => [...t, { key, ach }]);
        setTimeout(() => setToasts(t => t.filter(x => x.key !== key)), 4000);
      });
      window.SFX.play('ach');
      window.STORE.mergeAchievements(fresh);   // lifetime profile
      return [...prev, ...fresh];
    });
  }

  const playerAvg = team.starters.length
    ? Math.round(team.starters.reduce((s, p) => s + window.TEAM.effOverall(p, fatigue), 0) / team.starters.length) : 0;
  const round = bracket[currentIdx];
  const hasTeam = team.starters.length > 0;

  function confirmDraft(starters, bench, starId) {
    setTeam({ starters, bench, starId });
    setFatigue(window.TEAM.initFatigue([...starters, ...bench]));
    setPlayerStatus({}); setCampaignStats({});
    const rng = window.RNG.makeRng(window.RNG.seedFrom('copa-' + Date.now()));
    setBracket(window.TEAM.buildBracket(rng));
    setCurrentIdx(0);
    setHistory([]);
    setUnlocked([]);
    window.SFX.play('whistle');
    // De Almanaque: blind draft pays off with a reveal before the campaign
    setPhase(mode === 'almanaque' ? 'reveal' : 'bracket');
  }

  function gotoPrematch() {
    setOppXI(window.TEAM.bestXI(round.opponent, formation));
    setPhase('prematch');
  }

  // PreMatch hands back the (possibly rotated) lineup
  function startMatch(starters, bench) {
    setLineup({ starters, bench });
    const tiredStarters = window.TEAM.applyFatigue(starters, fatigue);
    const tiredBench = window.TEAM.applyFatigue(bench, fatigue);
    // remaining substitutions = budget minus rotations already made vs the drafted XI
    const origIds = new Set(team.starters.map(p => p.id));
    const subsLeft = Math.max(0, C.SUBS_MAX - starters.filter(p => !origIds.has(p.id)).length);
    const home = window.TEAM.makeDreamSide(tiredStarters, formation, 'home', tiredBench, subsLeft);
    const away = window.TEAM.makeSide(round.opponent, oppXI, formation, 'away');
    const seed = window.RNG.seedFrom(`dream-${round.id}-${currentIdx}-${round.opponent.id}`);
    const log = window.ENGINE.simulateMatch(home, away, C, seed,
      { knockout: true, roundN: round.n, fatigue: true, pressure: true, interactiveShootout: true });
    const ratings = window.RATINGS.computeRatings(log, C);
    setMatch({ log, ratings });
    setPhase('match');
  }

  // interactive shootout resolved -> patch log, recompute ratings-independent result
  function resolveShootout(pen) {
    const finalLog = window.ENGINE.finalizeShootout(match.log, pen);
    setMatch(m => ({ ...m, log: finalLog }));
    recordAndPost(finalLog);
  }

  // interactive in-match penalty resolved -> override the seeded outcome,
  // recompute the log + ratings, and let the ticker resume.
  function resolveInMatchPenalty(outcome) {
    if (!pendingPen) return;
    const finalLog = window.ENGINE.finalizeInMatchPenalty(match.log, pendingPen.penId, outcome);
    setMatch({ log: finalLog, ratings: window.RATINGS.computeRatings(finalLog, C) });
    setPendingPen(null);
  }

  function recordAndPost(finalLog) {
    // fatigue: starters tire, unused reserves recover
    setFatigue(prev => window.TEAM.updateFatigue(prev, lineup.starters, lineup.bench, finalLog.extraTime));
    // campaign status: a phase passed -> decrement, then apply this match's red cards / injuries
    setPlayerStatus(prev => window.TEAM.advancePlayerStatus(prev, finalLog, C));
    // accumulate end-of-cup stats from this match (player's team only)
    setCampaignStats(prev => window.STATS.accumulate(prev, match.ratings, finalLog, C));
    setBracket(prev => prev.map((r, i) => i === currentIdx ? { ...r, played: true, log: finalLog } : r));
    // achievements (match-level)
    const wonMatch = finalLog.result === 'home';
    const homePlayers = Object.values(match.ratings.players).filter(p => p.side === 'home');
    unlock(window.ACHIEVEMENTS.matchAchievements({
      won: wonMatch, score: finalLog.score, conceded: finalLog.score.away,
      penalties: finalLog.penalties, extraTime: finalLog.extraTime,
      homePlayers, starters: lineup.starters,
      playerAvg, oppAvg: avgOverall(oppXI),
    }));
    setHistory(h => [...h, { won: wonMatch, extraTime: finalLog.extraTime,
      penalties: finalLog.penalties, score: finalLog.score,
      opp: finalLog.away.name, code: finalLog.away.code, cup: finalLog.away.cup,
      short: round.short }]);
    window.SFX.play(wonMatch ? 'win' : 'lose');
    setPhase('post');
  }

  function finishMatch() {
    recordAndPost(match.log);
  }

  function nextAfterPost() {
    const playerWon = match.log.result === 'home';
    if (!playerWon) {
      window.STORE.bumpCounters({ champion: false });
      setWon(false); setPhase('end'); return;
    }
    if (round.id === 'final') {
      unlock(window.ACHIEVEMENTS.campaignAchievements({
        champion: true, history, mode,
      }));
      window.STORE.bumpCounters({ champion: true });
      window.SFX.play('win');
      setWon(true); setPhase('end'); return;
    }
    setCurrentIdx(i => i + 1);
    setPhase('bracket');
  }

  function reset() {
    window.STORE.clearRun();
    setPhase('home');
    setTeam({ starters: [], bench: [], starId: null });
    setFatigue({}); setPlayerStatus({}); setCampaignStats({}); setLineup({ starters: [], bench: [] });
    setBracket([]); setCurrentIdx(0); setMatch(null); setPendingPen(null); setWon(false);
    setUnlocked([]); setToasts([]); setHistory([]);
    setCanResume(false);
  }

  return (
    <div className="app">
      <GameHeader
        phase={phase === 'home' ? 'home' : phase === 'draft' ? 'draft' : 'campaign'}
        hasTeam={hasTeam && phase !== 'home'}
        round={['prematch', 'match', 'post'].includes(phase) ? round : null}
        sound={sound} onToggleSound={toggleSound}
        onReset={reset} onHowTo={() => setShowHowTo(true)} />

      {phase === 'home' && (
        <HomeScreen mode={mode} setMode={setMode} formation={formation} setFormation={setFormation}
          canResume={canResume} onResume={resumeRun} profile={profile0}
          onHowTo={() => setShowHowTo(true)}
          onStart={() => { window.SFX.prime(); reset(); setPhase('draft'); }} />
      )}

      {phase === 'draft' && (
        <DraftScreen formation={formation} mode={mode} sfx={sfx} onConfirm={confirmDraft} />
      )}

      {phase === 'reveal' && (
        <AlmanaqueReveal me={ME} starters={team.starters} bench={team.bench}
          onContinue={() => setPhase('bracket')} />
      )}

      {phase === 'bracket' && round && (
        <BracketScreen bracket={bracket} currentIdx={currentIdx} me={ME}
          playerAvg={playerAvg} onContinue={gotoPrematch} />
      )}

      {phase === 'prematch' && round && (
        <PreMatchScreen me={ME} starters={team.starters} bench={team.bench} starId={team.starId}
          formation={formation} round={round} fatigue={fatigue} playerStatus={playerStatus}
          opponentXI={oppXI} opponentAvg={avgOverall(oppXI)} onStart={startMatch} />
      )}

      {phase === 'match' && match && (
        <MatchScreen log={match.log} me={ME} round={round} sfx={sfx}
          onFinish={finishMatch} onShootout={() => setPhase('shootout')}
          onPenalty={(pen) => setPendingPen(pen)} pendingPen={pendingPen} />
      )}

      {phase === 'shootout' && match && (
        <PenaltyShootout
          home={{ name: ME.name, dream: true, starters: lineup.starters }}
          away={{ name: round.opponent.team, code: round.opponent.code, starters: oppXI }}
          sfx={sfx} onComplete={resolveShootout} />
      )}

      {phase === 'post' && match && (
        <PostMatchScreen log={match.log} ratings={match.ratings} round={round} onNext={nextAfterPost} />
      )}

      {phase === 'end' && (
        <CampaignEndScreen won={won} me={ME} bracket={bracket} unlocked={unlocked}
          mode={mode} stats={window.STATS.compute(campaignStats, C)} onRestart={reset} />
      )}

      {toasts.length > 0 && (
        <div className="ach-toast-wrap" aria-live="polite">
          {toasts.map(t => <AchievementToast key={t.key} ach={t.ach} />)}
        </div>
      )}

      {showHowTo && <HowToPlay onClose={() => setShowHowTo(false)} />}

      {phase === 'match' && pendingPen && (() => {
        const home = pendingPen.side === 'home';
        const mySquad = [...(lineup.starters || []), ...(lineup.bench || [])];
        const taker = home ? findPlayer(mySquad, pendingPen.taker) : findPlayer(oppXI, pendingPen.taker);
        const gk = home
          ? (findPlayer(oppXI, pendingPen.gk) || (oppXI || []).find(p => p.pos === 'GOL'))
          : (findPlayer(mySquad, pendingPen.gk) || mySquad.find(p => p.pos === 'GOL'));
        return <InMatchPenalty youKick={home} taker={taker} gk={gk} sfx={sfx} onComplete={resolveInMatchPenalty} />;
      })()}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
