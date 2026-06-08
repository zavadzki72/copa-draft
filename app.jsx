/* ============================================================
   COPA DRAFT — app.jsx
   Top-level state machine.
   Loop: home → dice DRAFT → [reveal (Almanaque)] → GROUP STAGE
   (3 player matches + AI×AI rivals, top-2 advance) → bracket →
   pre-match → live match → [shootout] → post → (repeat / end).
   The player commands a custom all-star "Time dos Sonhos".
   ============================================================ */
const {
  GameHeader, HomeScreen, DraftScreen, PreMatchScreen, MatchScreen,
  PostMatchScreen, BracketScreen, CampaignEndScreen, PenaltyShootout,
  AlmanaqueReveal, AchievementToast, HowToPlay, InMatchPenalty, GroupStageScreen,
} = window;

function findPlayer(list, id) { return (list || []).find(p => p.id === id); }

function avgOverall(players) {
  return players.length ? Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length) : 0;
}

function App() {
  const C = window.CONFIG;
  const profile0 = window.STORE.loadProfile();

  // ---- theme & language ----
  const systemPrefersLight = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
  function initTheme() {
    const saved = profile0.theme;
    if (saved === 'light' || saved === 'dark') return saved;          // explicit choice wins
    return systemPrefersLight() ? 'light' : 'dark';                   // else follow the system
  }
  function initLang() {
    const langs = C.LANGS || ['pt'];
    return langs.indexOf(profile0.lang) >= 0 ? profile0.lang : (C.DEFAULT_LANG || 'pt');
  }
  const [theme, setThemeState] = useState(initTheme);
  const [lang, setLangState] = useState(initLang);
  // keep the i18n engine in sync with `lang` for THIS render (idempotent),
  // so t()/narration templates always resolve in the current language.
  window.I18N.setLang(lang);
  const ME = { name: window.I18N.t('team.name'), dream: true };

  const [phase, setPhase] = useState('home');   // home|draft|reveal|group|bracket|prematch|match|shootout|post|end
  const [mode, setMode] = useState('classico');
  const [formation, setFormation] = useState('4-3-3');
  const [sound, setSound] = useState(profile0.sound);
  const [speed, setSpeed] = useState(profile0.speed || C.MATCH_SPEED_DEFAULT);
  const [canResume, setCanResume] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  const [team, setTeam] = useState({ starters: [], bench: [], starId: null });
  const [fatigue, setFatigue] = useState({});
  const [playerStatus, setPlayerStatus] = useState({});
  const [campaignStats, setCampaignStats] = useState({});
  const [lineup, setLineup] = useState({ starters: [], bench: [] });

  // ---- group stage ----
  const [runSeed, setRunSeed] = useState(0);
  const [group, setGroup] = useState(null);        // { rivals, teams, fixtures }
  const [groupRound, setGroupRound] = useState(0); // index of the player's next group round
  const [eliminatedInGroup, setEliminatedInGroup] = useState(false);
  const [groupResult, setGroupResult] = useState(null); // this round's fixtures (incl. results) — computed at post time

  // ---- knockout ----
  const [bracket, setBracket] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [activeRound, setActiveRound] = useState(null); // the round being played (group or knockout)

  const [oppXI, setOppXI] = useState([]);
  const [match, setMatch] = useState(null);
  const [pendingPen, setPendingPen] = useState(null);
  const [won, setWon] = useState(false);
  const [unlocked, setUnlocked] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState([]);
  const toastKey = useRef(0);
  const restored = useRef(false);
  const sfxOn = useRef(profile0.sound);

  const standings = useMemo(() => (group ? window.TEAM.groupStandings(group) : []), [group]);
  const groupRounds = C.GROUP_SIZE - 1;
  const groupComplete = !!group && groupRound >= groupRounds;
  const playerQualified = standings.length ? (standings.findIndex(r => r.teamRef === 'me') + 1) <= C.GROUP_QUALIFY : false;

  // ---- restore an in-progress run on first mount ----
  const RESUMABLE = ['group', 'bracket', 'prematch', 'match', 'shootout', 'post'];
  useEffect(() => {
    window.SFX.setEnabled(profile0.sound);
    const snap = window.STORE.loadRun();
    if (snap && RESUMABLE.includes(snap.phase) && snap.team && snap.team.starters.length) {
      setCanResume(true);
    }
    restored.current = true;
  }, []); // eslint-disable-line

  function snapshot() {
    return { phase, mode, formation, team, fatigue, playerStatus, campaignStats, lineup,
      runSeed, group, groupRound, eliminatedInGroup,
      bracket, currentIdx, activeRound, oppXI, match, won, unlocked, history };
  }
  function resumeRun() {
    const s = window.STORE.loadRun();
    if (!s) return;
    setMode(s.mode); setFormation(s.formation); setTeam(s.team);
    setFatigue(s.fatigue || {}); setPlayerStatus(s.playerStatus || {});
    setCampaignStats(s.campaignStats || {});
    setLineup(s.lineup || { starters: [], bench: [] });
    setRunSeed(s.runSeed || 0);
    setGroup(s.group || null); setGroupRound(s.groupRound || 0);
    setEliminatedInGroup(!!s.eliminatedInGroup);
    setBracket(s.bracket || []); setCurrentIdx(s.currentIdx || 0);
    setActiveRound(s.activeRound || null);
    setOppXI(s.oppXI || []); setMatch(s.match || null); setWon(!!s.won);
    setUnlocked(s.unlocked || []); setHistory(s.history || []);
    setCanResume(false);
    setPhase(s.phase);
  }

  useEffect(() => {
    if (!restored.current) return;
    if (phase === 'home') return;
    if (phase === 'end') { window.STORE.clearRun(); return; }
    window.STORE.saveRun(snapshot());
  });

  function toggleSound() {
    const v = !sound; setSound(v); sfxOn.current = v;
    window.SFX.setEnabled(v); window.STORE.setSetting('sound', v);
    if (v) window.SFX.play('select');
  }
  function setSpeedPref(v) { setSpeed(v); window.STORE.setSetting('speed', v); }
  function sfx(name) { window.SFX.play(name); }

  // ---- apply theme / language side effects ----
  // first visit only APPLIES (no persistence) so prefers-color-scheme keeps
  // deciding until the player explicitly toggles; the handlers persist.
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { window.I18N.setLang(lang); }, [lang]);

  function setTheme(v) {
    if (v !== 'light' && v !== 'dark') v = C.DEFAULT_THEME || 'dark';   // guard invalid
    setThemeState(v);
    document.documentElement.dataset.theme = v;
    window.STORE.setSetting('theme', v);
    window.SFX.play('select');
  }
  function toggleTheme() { setTheme(theme === 'light' ? 'dark' : 'light'); }

  function changeLang(v) {
    const langs = C.LANGS || ['pt'];
    if (langs.indexOf(v) < 0 || v === lang) return;                    // guard invalid / no-op
    setLangState(v);
    window.I18N.setLang(v);
    window.STORE.setSetting('lang', v);
    window.SFX.play('select');
  }

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
      window.STORE.mergeAchievements(fresh);
      return [...prev, ...fresh];
    });
  }

  const playerAvg = team.starters.length
    ? Math.round(team.starters.reduce((s, p) => s + window.TEAM.effOverall(p, fatigue), 0) / team.starters.length) : 0;
  const hasTeam = team.starters.length > 0;

  // ---- group-stage helpers ----
  function makeGroupRound(grp, r) {
    const fx = grp.fixtures.find(f => f.round === r && f.isPlayer);
    const oppId = fx.home === 'me' ? fx.away : fx.home;
    const rival = grp.rivals.find(srv => srv.id === oppId);
    return { id: 'grupo', stage: 'group', fixtureRound: r,
      label: window.I18N.t('ui.group.roundLabel', { n: r + 1 }), short: window.I18N.t('ui.group.roundShort', { n: r + 1 }),
      n: 0, opponent: rival, oppAvg: window.TEAM.squadAvg(rival) };
  }

  function confirmDraft(starters, bench, starId) {
    setTeam({ starters, bench, starId });
    setFatigue(window.TEAM.initFatigue([...starters, ...bench]));
    setPlayerStatus({}); setCampaignStats({});
    const seed = window.RNG.seedFrom('copa-' + Date.now());
    setRunSeed(seed);
    setGroup(window.TEAM.buildGroup(window.RNG.makeRng(seed)));
    setGroupRound(0);
    setEliminatedInGroup(false);
    setBracket([]); setCurrentIdx(0); setActiveRound(null);
    setHistory([]); setUnlocked([]);
    window.SFX.play('whistle');
    setPhase(mode === 'almanaque' ? 'reveal' : 'group');
  }

  // start the player's match for the current group round
  function playGroupMatch() {
    const ar = makeGroupRound(group, groupRound);
    setActiveRound(ar);
    setOppXI(window.TEAM.bestXI(ar.opponent, formation));
    setPhase('prematch');
  }

  // group finished: top-N advance to the knockout, else eliminated
  function proceedFromGroup() {
    const table = window.TEAM.groupStandings(group);
    const pos = table.findIndex(t => t.teamRef === 'me') + 1;
    if (pos <= C.GROUP_QUALIFY) {
      const rng = window.RNG.makeRng(window.RNG.seedFrom('bracket-' + runSeed));
      setBracket(window.TEAM.buildBracket(rng, group.rivals.map(srv => srv.id)));
      setCurrentIdx(0);
      window.SFX.play('whistle');
      setPhase('bracket');
    } else {
      setEliminatedInGroup(true);
      setWon(false);
      setPhase('end');
    }
  }

  // knockout: go to the pre-match for the current bracket round
  function gotoPrematch() {
    const r = bracket[currentIdx];
    setActiveRound(r);
    setOppXI(window.TEAM.bestXI(r.opponent, formation));
    setPhase('prematch');
  }

  function startMatch(starters, bench) {
    setLineup({ starters, bench });
    // persist the pre-match arrangement: subbed-out players become reserves and
    // the ones brought in become starters for the rest of the campaign.
    setTeam(t => ({ ...t, starters, bench }));
    const ar = activeRound;
    const isGroup = ar.stage === 'group';
    const tiredStarters = window.TEAM.applyFatigue(starters, fatigue);
    const tiredBench = window.TEAM.applyFatigue(bench, fatigue);
    // the in-match sub budget (injury cover) is independent of how freely you
    // arranged the XI before kick-off; the captain lifts his selection-mates.
    const home = window.TEAM.makeDreamSide(tiredStarters, formation, 'home', tiredBench, C.SUBS_MAX, team.starId);
    const away = window.TEAM.makeSide(ar.opponent, oppXI, formation, 'away');
    const seed = isGroup
      ? window.RNG.seedFrom(`grp-player-${runSeed}-${ar.fixtureRound}-${ar.opponent.id}`)
      : window.RNG.seedFrom(`dream-${ar.id}-${currentIdx}-${ar.opponent.id}`);
    const log = window.ENGINE.simulateMatch(home, away, C, seed,
      { knockout: !isGroup, roundN: ar.n, fatigue: true, pressure: !isGroup, interactiveShootout: !isGroup });
    const ratings = window.RATINGS.computeRatings(log, C);
    setMatch({ log, ratings });
    setPhase('match');
  }

  function resolveShootout(pen) {
    const finalLog = window.ENGINE.finalizeShootout(match.log, pen);
    setMatch(m => ({ ...m, log: finalLog }));
    recordAndPost(finalLog);
  }

  function resolveInMatchPenalty(outcome) {
    if (!pendingPen) return;
    const finalLog = window.ENGINE.finalizeInMatchPenalty(match.log, pendingPen.penId, outcome);
    setMatch({ log: finalLog, ratings: window.RATINGS.computeRatings(finalLog, C) });
    setPendingPen(null);
  }

  function recordAndPost(finalLog) {
    const ar = activeRound;
    const isGroup = ar.stage === 'group';
    setFatigue(prev => window.TEAM.updateFatigue(prev, lineup.starters, lineup.bench, finalLog.extraTime));
    setPlayerStatus(prev => window.TEAM.advancePlayerStatus(prev, finalLog, C));
    setCampaignStats(prev => window.STATS.accumulate(prev, match.ratings, finalLog, C));
    if (!isGroup) {
      setBracket(prev => prev.map((r, i) => i === currentIdx ? { ...r, played: true, log: finalLog } : r));
    }
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
      short: ar.short, stage: isGroup ? 'group' : 'knockout' }]);
    // for a group match, resolve this round's rivals NOW so the post screen can
    // show the other results + the updated table; advanceGroup reuses it.
    setGroupResult(isGroup ? groupFixturesAfter(finalLog) : null);
    window.SFX.play(wonMatch ? 'win' : 'lose');
    setPhase('post');
  }

  function finishMatch() { recordAndPost(match.log); }

  // this round's fixtures with results filled in: the player's score + the
  // seeded AI×AI rival simulations. Pure for a given (log, group, round).
  function groupFixturesAfter(log) {
    const r = activeRound.fixtureRound;
    const pg = log.score.home, og = log.score.away;
    return group.fixtures.map(f => {
      if (f.result || f.round !== r) return f;
      if (f.isPlayer) {
        return { ...f, result: f.home === 'me' ? { home: pg, away: og } : { home: og, away: pg } };
      }
      const homeSq = group.rivals.find(srv => srv.id === f.home);
      const awaySq = group.rivals.find(srv => srv.id === f.away);
      const hs = window.TEAM.makeSide(homeSq, window.TEAM.bestXI(homeSq, formation), formation, 'home');
      const as = window.TEAM.makeSide(awaySq, window.TEAM.bestXI(awaySq, formation), formation, 'away');
      const seed = window.RNG.seedFrom(`grp-ai-${runSeed}-${f.round}-${f.home}-${f.away}`);
      const lg = window.ENGINE.simulateMatch(hs, as, C, seed, { knockout: false, fatigue: false, pressure: false });
      return { ...f, result: { home: lg.score.home, away: lg.score.away } };
    });
  }

  // advance to the next round (or mark the group complete), reusing the
  // already-resolved fixtures from post time.
  function advanceGroup() {
    const fixtures = groupResult || groupFixturesAfter(match.log);
    setGroup({ ...group, fixtures });
    setGroupRound(activeRound.fixtureRound + 1);
    setGroupResult(null);
    setPhase('group');
  }

  function nextAfterPost() {
    if (activeRound && activeRound.stage === 'group') { advanceGroup(); return; }
    const playerWon = match.log.result === 'home';
    if (!playerWon) {
      window.STORE.bumpCounters({ champion: false });
      setWon(false); setPhase('end'); return;
    }
    if (activeRound.id === 'final') {
      unlock(window.ACHIEVEMENTS.campaignAchievements({ champion: true, history, mode }));
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
    setRunSeed(0); setGroup(null); setGroupRound(0); setEliminatedInGroup(false); setGroupResult(null);
    setBracket([]); setCurrentIdx(0); setActiveRound(null);
    setMatch(null); setPendingPen(null); setWon(false);
    setUnlocked([]); setToasts([]); setHistory([]);
    setCanResume(false);
  }

  return (
    <div className="app">
      <GameHeader
        phase={phase === 'home' ? 'home' : phase === 'draft' ? 'draft' : 'campaign'}
        hasTeam={hasTeam && phase !== 'home'}
        round={['prematch', 'match', 'post'].includes(phase) ? activeRound : null}
        sound={sound} onToggleSound={toggleSound}
        theme={theme} onToggleTheme={toggleTheme}
        lang={lang} onSetLang={changeLang}
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
          onContinue={() => setPhase('group')} />
      )}

      {phase === 'group' && group && (
        <GroupStageScreen group={group} standings={standings} groupRound={groupRound}
          me={ME} qualify={C.GROUP_QUALIFY} complete={groupComplete} playerQualified={playerQualified}
          onPlay={playGroupMatch} onProceed={proceedFromGroup} />
      )}

      {phase === 'bracket' && bracket[currentIdx] && (
        <BracketScreen bracket={bracket} currentIdx={currentIdx} me={ME}
          playerAvg={playerAvg} onContinue={gotoPrematch} />
      )}

      {phase === 'prematch' && activeRound && (
        <PreMatchScreen me={ME} starters={team.starters} bench={team.bench} starId={team.starId}
          formation={formation} round={activeRound} fatigue={fatigue} playerStatus={playerStatus}
          opponentXI={oppXI} opponentAvg={avgOverall(oppXI)} onStart={startMatch} />
      )}

      {phase === 'match' && match && (
        <MatchScreen log={match.log} me={ME} round={activeRound} sfx={sfx}
          speed={speed} onSpeedChange={setSpeedPref}
          onFinish={finishMatch} onShootout={() => setPhase('shootout')}
          onPenalty={(pen) => setPendingPen(pen)} pendingPen={pendingPen} />
      )}

      {phase === 'shootout' && match && activeRound && (
        <PenaltyShootout
          home={{ name: ME.name, dream: true, starters: lineup.starters }}
          away={{ name: activeRound.opponent.team, code: activeRound.opponent.code, starters: oppXI }}
          sfx={sfx} onComplete={resolveShootout} />
      )}

      {phase === 'post' && match && (
        <PostMatchScreen log={match.log} ratings={match.ratings} round={activeRound} me={ME}
          group={groupResult ? { ...group, fixtures: groupResult } : group}
          standings={groupResult ? window.TEAM.groupStandings({ ...group, fixtures: groupResult }) : standings}
          onNext={nextAfterPost} />
      )}

      {phase === 'end' && (
        <CampaignEndScreen won={won} me={ME} bracket={bracket} unlocked={unlocked}
          mode={mode} stats={window.STATS.compute(campaignStats, C)}
          group={group} standings={standings} eliminatedInGroup={eliminatedInGroup}
          onRestart={reset} />
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
