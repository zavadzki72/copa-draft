/* ============================================================
   COPA DRAFT — ui/mp.jsx
   Multiplayer Online (PRD_004 MVP). Server-authoritative: the .NET
   backend owns lobby, draft deadline and the tournament; this UI
   renders what the server streams (SignalR) and reuses the solo
   components (DraftScreen, MatchScreen, tables) wherever possible.
   UI strings come from I18N (mp.*); the server-side narration of the
   ticker stays PT (engine limitation documented in the PLAN).
   ============================================================ */
// Helpers puros (espelho de log, resolução de times no snapshot) vivem em
// lib/mp-log.js (window.MPLOG) para serem testáveis em Node.
const mpTeamInfo = (snap, teamId) => window.MPLOG.teamInfo(snap, teamId);
const t = (k, v) => window.I18N.t(k, v);

// desvio (ms) entre o relógio do SERVIDOR e o do cliente, medido no último
// RoomState (state.serverNow). Os prazos vêm em tempo do servidor, então sem
// isso o contador fica errado em máquinas com relógio dessincronizado — só
// acertava por acaso pra quem tinha o relógio igual ao do servidor.
let mpClockOffset = 0;
const mpServerNow = () => Date.now() + mpClockOffset;

// conquistas (achievements) do humano a partir do SEU jogo (log já com home = eu).
// Reaproveita o catálogo/avaliador do solo (window.ACHIEVEMENTS).
function mpMatchAchievements(log) {
  const me = log.home, opp = log.away, sc = log.score;
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, p) => a + (p.overall || 75), 0) / arr.length) : 75;
  const starters = me.starters.map(s => window.MPLOG.playerById(s.id) || { age: 27, overall: 75 });
  const oppPl = opp.starters.map(s => window.MPLOG.playerById(s.id) || { overall: 75 });
  return window.ACHIEVEMENTS.matchAchievements({
    won: log.result === 'home', score: { home: sc.home, away: sc.away }, conceded: sc.away,
    penalties: log.penalties, extraTime: log.extraTime,
    homePlayers: me.starters.map(s => log.stats[s.id] || { goals: 0 }),
    starters, playerAvg: avg(starters), oppAvg: avg(oppPl),
  });
}

// rótulo de rodada traduzido: mata-mata resolve pelo dicionário de rounds
// (o label do servidor É o id: 'oitavas'…); fase de grupos extrai o número
// do label PT do servidor ("Rodada N")
const mpRoundLabel = (info) => {
  if (!info) return '';
  if (info.kind === 'knockout') return window.roundText({ id: info.label }, 'label');
  const m = /(\d+)/.exec(info.label || '');
  return m ? t('ui.group.calRound', { n: m[1] }) : (info.label || '');
};

// fase do torneio (valores do servidor em PT) -> rótulo traduzido
const mpPhaseLabel = (ph) =>
  ({ grupos: t('mp.phase.grupos'), 'mata-mata': t('mp.phase.mataMata'), encerrada: t('mp.phase.encerrada') }[ph]
    || String(ph || '').toUpperCase());

/* um grupo (tabela + calendário) — usado na tela principal (só o MEU grupo)
   e no modal "todos os grupos" (#6) */
function MpGroupBlock({ snap, g, myTeamId }) {
  return (
    <div className="mp-group">
      <div className="shead" style={{ margin: '20px 0 10px' }}>
        <span className="tok">{t('mp.t.group', { label: g.label })}</span>
      </div>
      <div className="group-table" role="table">
        <div className="gt-row gt-head" role="row">
          <span className="gt-pos"></span><span className="gt-team">{t('ui.group.team')}</span>
          <span>P</span><span>J</span><span>V</span><span>E</span><span>D</span>
          <span>GP</span><span>GC</span><span>SG</span>
        </div>
        {g.standings.map((r, i) => {
          const isMe = r.teamId === myTeamId;
          return (
            <div className={`gt-row ${i < 2 ? 'qualify' : ''} ${isMe ? 'me' : ''}`} role="row" key={r.teamId}>
              <span className="gt-pos">{i + 1}</span>
              <span className="gt-team"><MpMark snap={snap} id={r.teamId} /> <MpTeamName snap={snap} id={r.teamId} /></span>
              <span className="gt-p">{r.p}</span><span>{r.j}</span><span>{r.v}</span><span>{r.e}</span><span>{r.d}</span>
              <span>{r.gp}</span><span>{r.gc}</span><span>{r.sg > 0 ? '+' + r.sg : r.sg}</span>
            </div>
          );
        })}
      </div>
      <div className="group-cal" style={{ marginTop: 8 }}>
        {[0, 1, 2].map(r => (
          <div className="gcal-round" key={r}>
            <div className="gcal-rlabel">{t('ui.group.calRound', { n: r + 1 })}</div>
            {g.fixtures.filter(f => f.round === r).map(f => (
              <div className={`gcal-fx ${[f.homeId, f.awayId].includes(myTeamId) ? 'mine' : ''}`} key={f.fixtureId}>
                <span className="gcal-h"><MpMark snap={snap} id={f.homeId} /> <MpTeamName snap={snap} id={f.homeId} /></span>
                <span className="gcal-sc">{f.played ? `${f.homeGoals} – ${f.awayGoals}` : t('mp.t.toPlay')}</span>
                <span className="gcal-a"><MpTeamName snap={snap} id={f.awayId} /> <MpMark snap={snap} id={f.awayId} /></span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* nome com destaque quando o time é de um humano (#4) */
function MpTeamName({ snap, id }) {
  const info = mpTeamInfo(snap, id);
  return <span className={info.isHuman ? 'mp-human' : ''}>{info.isHuman ? '👤 ' : ''}{info.name}</span>;
}

function MpMark({ snap, id }) {
  const info = mpTeamInfo(snap, id);
  return info.isHuman ? <Crest className="cr-inline" /> : <Flag code={info.code} />;
}

/* countdown chip for the draft deadline (server enforces the real one) */
function MpTimer({ deadline }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    // compara o prazo (tempo do servidor) com o "agora" do servidor estimado,
    // não com o relógio local cru — corrige desvio de relógio entre jogadores
    const tick = () => setLeft(Math.max(0, Math.round((new Date(deadline) - mpServerNow()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [deadline]);
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  return <span className={`mp-timer ${left <= 20 ? 'low' : ''}`}>⏱ {mm}:{ss}</span>;
}

/* um time enviado (ver os times dos outros durante a espera do draft) */
function MpSubmittedTeam({ team, meId }) {
  const isMe = team.userId === meId;
  const xiByPos = {};
  team.starters.forEach(p => { (xiByPos[p.pos] = xiByPos[p.pos] || []).push(p); });
  const order = ['GOL', 'ZAG', 'LAT', 'MEI', 'ATA'];
  const avg = team.starters.length
    ? Math.round(team.starters.reduce((s, p) => s + p.overall, 0) / team.starters.length) : 0;
  const line = (p) => (
    <span className="mp-team-pl" key={p.id}>
      {team.captainId === p.id && <span className="star-dot">★ </span>}
      {p.code && <Flag code={p.code} className="slot-flag" />} {p.name}
      <b className="ov">{p.overall}</b>
    </span>
  );
  return (
    <div className="mp-team-card">
      <div className="shead" style={{ margin: '14px 0 8px' }}>
        <span className="tok">👤 {team.name}{isMe ? ` · ${t('mp.draft.teamYou')}` : ''}{team.autoFilled ? ` · ${t('mp.draft.teamAuto')}` : ''}</span>
        <span className="meta">{team.formation} · {t('ui.draft.avgShort')} {avg}</span>
      </div>
      <div className="mp-team-xi">{order.flatMap(pos => (xiByPos[pos] || []).map(line))}</div>
    </div>
  );
}

function MpTeamsModal({ teams, meId, onClose }) {
  const Modal = window.Modal;
  if (!Modal) return null;
  return (
    <Modal title={t('mp.draft.teamsTitle')} eyebrow={t('mp.draft.teamsEyebrow')} wide onClose={onClose}>
      {!teams || teams.length === 0
        ? <p className="p mp-hint">{t('mp.draft.teamsNone')}</p>
        : teams.map(tm => <MpSubmittedTeam key={tm.userId} team={tm} meId={meId} />)}
    </Modal>
  );
}

function MpLogin({ onDone, onExit }) {
  const btnRef = useRef(null);
  const [err, setErr] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [busy, setBusy] = useState(false);
  const cid = window.CONFIG.MP.GOOGLE_CLIENT_ID;
  // convite na URL? convidado provavelmente só quer entrar e jogar
  const hasInvite = !!new URLSearchParams(location.search).get('sala');
  useEffect(() => {
    if (!cid) return;
    // o script do GIS é async/defer — em primeira visita (aba anônima) ele pode
    // ainda não ter carregado quando a tela monta. Tenta por até ~8s antes de
    // desistir, em vez de falhar de cara.
    let tries = 0;
    const tryRender = () => window.MPAUTH.renderGoogleButton(btnRef.current, (session, e) => {
      if (session) onDone(session); else setErr(e ? e.message : t('mp.err.login'));
    });
    if (tryRender()) return;
    const iv = setInterval(() => {
      if (tryRender()) { clearInterval(iv); setErr(null); return; }
      if (++tries >= 20) { clearInterval(iv); setErr(t('mp.err.googleDown')); }
    }, 400);
    return () => clearInterval(iv);
  }, []);
  async function enterAsGuest() {
    setBusy(true); setErr(null);
    try { onDone(await window.MPAUTH.loginAsGuest(guestName)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="stage narrow screen-fade mp-center">
      <span className="tok">{t('mp.tok')}</span>
      <h2>{hasInvite ? t('mp.login.invitedTitle') : t('mp.login.title')}</h2>
      <p className="sub">{hasInvite ? t('mp.login.invitedSub') : t('mp.login.sub')}</p>

      <div className="mp-guest-row">
        <input className="mp-input mp-input-name" value={guestName} maxLength={30}
          placeholder={t('mp.login.namePh')} onChange={e => setGuestName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && guestName.trim().length >= 2) enterAsGuest(); }} />
        <button className="btn btn-yellow" disabled={busy || guestName.trim().length < 2} onClick={enterAsGuest}>
          {t('mp.login.guestBtn')}
        </button>
      </div>
      <p className="p mp-hint">{t('mp.login.hint1')} <strong>{t('mp.login.hintCreate')}</strong> {t('mp.login.hint2')}</p>

      {cid
        ? <div ref={btnRef} className="mp-google-btn" />
        : <p className="mp-error">{t('mp.err.googleCfg')}</p>}
      {err && <p className="mp-error">{err}</p>}
      <button className="btn btn-ghost" onClick={onExit}>{t('mp.back')}</button>
    </div>
  );
}

function MpMenu({ user, busy, error, onCreate, onJoin, onLogout, onExit }) {
  const [code, setCode] = useState('');
  const guest = !!user.guest;
  return (
    <div className="stage narrow screen-fade mp-center">
      <span className="tok">{t('mp.tok')}</span>
      <h2>{t('mp.menu.hello', { name: user.name.split(' ')[0] })}{guest ? ' 🎟' : ''}</h2>
      <div className="setgrid mp-menu">
        <div className="setcard">
          <span className="lab">{t('mp.menu.createLab')}</span>
          {guest ? (
            <p className="p">{t('mp.menu.createGuest')}</p>
          ) : (
            <p className="p">{t('mp.menu.createHint')}</p>
          )}
          <button className="btn btn-green" disabled={busy || guest} onClick={onCreate}>{t('mp.menu.createBtn')}</button>
        </div>
        <div className="setcard">
          <span className="lab">{t('mp.menu.joinLab')}</span>
          <p className="p">{t('mp.menu.joinHint')}</p>
          <div className="mp-join-row">
            <input className="mp-input" value={code} maxLength={6}
              placeholder={t('mp.menu.codePh')} onChange={e => setCode(e.target.value.toUpperCase())} />
            <button className="btn btn-yellow" disabled={busy || code.length < 6}
              onClick={() => onJoin(code)}>{t('mp.menu.joinBtn')}</button>
          </div>
        </div>
      </div>
      {error && <p className="mp-error">{error}</p>}
      <div className="mp-foot">
        <button className="btn btn-ghost" onClick={onExit}>{t('mp.back')}</button>
        <button className="btn btn-ghost" onClick={onLogout}>{t('mp.menu.logout')}</button>
      </div>
    </div>
  );
}

function MpLobby({ room, meId, error, onReady, onStart, onLeave, onSpeed, onLevel, onMode, onDraftTime, onCupRange }) {
  const me = room.players.find(p => p.userId === meId);
  const isHost = room.hostUserId === meId;
  const readyCount = room.players.filter(p => p.ready).length;
  const link = location.origin + location.pathname + '?sala=' + room.code;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch (e) {}
  };
  return (
    <div className="stage narrow screen-fade">
      <div className="shead">
        <div>
          <span className="tok">{t('mp.lobby.tok')}</span>
          <h2 style={{ marginTop: 4 }}>{t('mp.lobby.title')}</h2>
        </div>
        <span className="meta">{t('mp.lobby.players', { n: room.players.length, max: room.maxPlayers })}</span>
      </div>

      <div className="mp-invite setcard">
        <span className="lab">{t('mp.lobby.codeLab')}</span>
        <div className="mp-code">{room.code}</div>
        <button className="btn btn-ghost" onClick={copy}>{copied ? t('mp.lobby.copied') : t('mp.lobby.copy')}</button>
      </div>

      <div className="setcard mp-speed">
        <span className="lab">{t('mp.lobby.speedLab')}</span>
        {isHost ? (
          <Segmented value={room.speed} onChange={onSpeed} options={[
            { id: 'normal', label: t('mp.lobby.speedNormal'), hint: '~34s' },
            { id: 'rapido', label: t('mp.lobby.speedFast'), hint: '~22s' },
            { id: 'super', label: t('mp.lobby.speedSuper'), hint: '~11s' },
          ]} />
        ) : (
          <p className="p mp-speed-view">
            {(sp => sp ? `${t('mp.lobby.' + sp[0])} (${sp[1]})` : room.speed)(
              { normal: ['speedNormal', '~34s'], rapido: ['speedFast', '~22s'], super: ['speedSuper', '~11s'] }[room.speed])}
            <span className="mp-hint">{t('mp.lobby.byHost')}</span>
          </p>
        )}
      </div>

      <div className="setcard mp-speed">
        <span className="lab">{t('mp.lobby.levelLab')}</span>
        {isHost ? (
          <Segmented value={room.level || 'normal'} onChange={onLevel} options={[
            { id: 'facil', label: t('mp.lobby.levelEasy') },
            { id: 'normal', label: t('mp.lobby.levelNormal') },
            { id: 'dificil', label: t('mp.lobby.levelHard') },
            { id: 'lenda', label: t('mp.lobby.levelLegend') },
          ]} />
        ) : (
          <p className="p mp-speed-view">
            {t('mp.lobby.' + ({ facil: 'levelEasy', normal: 'levelNormal', dificil: 'levelHard', lenda: 'levelLegend' }[room.level] || 'levelNormal'))}
            <span className="mp-hint">{t('mp.lobby.byHost')}</span>
          </p>
        )}
        <p className="p mp-hint">{t('mp.lobby.levelHint')}</p>
      </div>

      <div className="setcard mp-speed">
        <span className="lab">{t('mp.lobby.modeLab')}</span>
        {isHost ? (
          <Segmented value={room.mode || 'classico'} onChange={onMode} options={[
            { id: 'classico', label: t('mp.lobby.modeClassic') },
            { id: 'medium', label: t('mp.lobby.modeMedium') },
            { id: 'almanaque', label: t('mp.lobby.modeHard') },
          ]} />
        ) : (
          <p className="p mp-speed-view">
            {t('mp.lobby.' + ({ classico: 'modeClassic', medium: 'modeMedium', almanaque: 'modeHard' }[room.mode] || 'modeClassic'))}
            <span className="mp-hint">{t('mp.lobby.byHost')}</span>
          </p>
        )}
        <p className="p mp-hint">{t('mp.lobby.modeHint')}</p>
      </div>

      <div className="setcard mp-speed">
        <span className="lab">{t('mp.lobby.draftTimeLab')}</span>
        {isHost ? (
          <Segmented value={room.draftSeconds || 180} onChange={onDraftTime} options={[
            { id: 60, label: t('mp.lobby.draftTime1') },
            { id: 180, label: t('mp.lobby.draftTime3') },
            { id: 300, label: t('mp.lobby.draftTime5') },
          ]} />
        ) : (
          <p className="p mp-speed-view">
            {t('mp.lobby.' + ({ 60: 'draftTime1', 180: 'draftTime3', 300: 'draftTime5' }[room.draftSeconds] || 'draftTime3'))}
            <span className="mp-hint">{t('mp.lobby.byHost')}</span>
          </p>
        )}
        <p className="p mp-hint">{t('mp.lobby.draftTimeHint')}</p>
      </div>

      {(() => {
        const ys = window.TEAM.cupYears();
        const from = room.cupFrom || ys[0], to = room.cupTo || ys[ys.length - 1];
        return (
          <div className="setcard mp-speed">
            <span className="lab">{t('mp.lobby.cupRangeLab')}</span>
            {isHost ? (
              <div className="cup-range">
                <label>{t('ui.home.cupFrom')}
                  <select value={from} onChange={e => onCupRange(Number(e.target.value), Math.max(Number(e.target.value), to))}>
                    {ys.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label>{t('ui.home.cupTo')}
                  <select value={to} onChange={e => onCupRange(Math.min(from, Number(e.target.value)), Number(e.target.value))}>
                    {ys.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
              </div>
            ) : (
              <p className="p mp-speed-view">{from} – {to}<span className="mp-hint">{t('mp.lobby.byHost')}</span></p>
            )}
          </div>
        );
      })()}

      <div className="mp-players">
        {room.players.map(p => (
          <div className={`mp-player ${p.userId === meId ? 'me' : ''}`} key={p.userId}>
            {p.avatar ? <img className="mp-avatar" src={p.avatar} alt="" referrerPolicy="no-referrer" /> : <Crest className="cr-inline" />}
            <span className="mp-pname">{p.name}{p.isHost ? ' 👑' : ''}</span>
            <span className={`mp-presence ${p.presence}`}>{p.presence === 'conectado' ? '' : p.presence === 'ia' ? t('mp.lobby.ia') : t('mp.lobby.left')}</span>
            <span className={`mp-ready ${p.ready ? 'on' : ''}`}>{p.ready ? t('mp.lobby.ready') : t('mp.lobby.waiting')}</span>
          </div>
        ))}
      </div>

      {error && <p className="mp-error">{error}</p>}
      <div className="mp-foot">
        <button className="btn btn-ghost" onClick={onLeave}>{t('mp.lobby.leave')}</button>
        <button className={`btn ${me && me.ready ? 'btn-ghost' : 'btn-yellow'}`} onClick={() => onReady(!(me && me.ready))}>
          {me && me.ready ? t('mp.lobby.unready') : t('mp.lobby.imReady')}
        </button>
        {isHost && (
          <button className="btn btn-green" disabled={room.players.length < 2} onClick={onStart}>
            {t('mp.lobby.start', { ready: readyCount, total: room.players.length })}
          </button>
        )}
      </div>
      {isHost && room.players.length < 2 && <p className="p mp-hint">{t('mp.lobby.inviteMore')}</p>}
    </div>
  );
}

/* groups + bracket, fed live by server snapshots */
function MpTournament({ snap, meId, minute, yourMatch, onWatch, readyProgress, follow, onFollow, onSpectate, advanced, onAdvance, onBackToEnd }) {
  const phase = snap.phase;
  const roundInfo = snap.currentRound;
  // fase da rodada derivada do SNAPSHOT (fonte única da verdade)
  const announcing = !!(roundInfo && roundInfo.status === 'aguardando');
  const teamName = (id) => mpTeamInfo(snap, id).name;
  const champion = snap.championTeamId;
  const myTeamId = 'h:' + meId;
  const iAmChampion = champion === myTeamId;
  const [showPicker, setShowPicker] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const Modal = window.Modal;

  // estou jogando NESTA rodada? (evita o card "rolando" preso entre rodadas)
  // durante o pré-jogo a rodada ainda não rola — nada de "ao vivo"
  const myCurrentFixture = window.MPLOG.fixtureOfTeam(roundInfo, myTeamId);
  const myMatchLive = !announcing && !!(yourMatch && myCurrentFixture && yourMatch.fixtureId === myCurrentFixture.fixtureId);

  // eliminação + humanos vivos (pra acompanhar)
  const elim = window.MPLOG.eliminationInfo(snap, myTeamId);
  const stageLabel = elim.stage === 'grupos' ? t('mp.t.groupStageLower')
    : elim.stage ? window.roundText({ id: elim.stage }, 'label') : null;
  const followFixture = follow ? window.MPLOG.fixtureOfTeam(roundInfo, follow) : null;
  const followAlive = follow && elim.aliveHumans.some(h => h.id === follow);

  return (
    <div className="stage narrow screen-fade">
      <div className="shead">
        <div>
          <span className="tok">{t('mp.t.tok')} · {mpPhaseLabel(phase)}</span>
          <h2 style={{ marginTop: 4 }}>
            {phase === 'encerrada'
              ? (iAmChampion ? t('mp.t.youChampion') : t('mp.t.champion', { name: champion ? teamName(champion) : '—' }))
              : roundInfo ? t('mp.t.inProgress', { label: mpRoundLabel(roundInfo) }) : t('mp.t.waitingNext')}
          </h2>
        </div>
        {roundInfo && phase !== 'encerrada' && !announcing && <span className="meta">{t('mp.t.minute', { m: minute || 0 })}</span>}
        {phase === 'encerrada' && onBackToEnd && (
          <button className="btn btn-yellow" onClick={onBackToEnd}>{t('mp.t.finalResult')}</button>
        )}
      </div>

      {/* pré-jogo da rodada: Avançar (quem joga) / confirmando (demais) */}
      {announcing && phase !== 'encerrada' && (
        <div className="mp-yourmatch setcard">
          {myCurrentFixture && !advanced ? (
            <>
              <span className="lab">{t('mp.t.matchReady', { label: mpRoundLabel(roundInfo) })}</span>
              <div className="mp-advance-row">
                <button className="btn btn-green" onClick={onAdvance}>{t('mp.t.advance')}</button>
                <MpTimer deadline={roundInfo.readyDeadline} />
              </div>
              <p className="p mp-hint">{t('mp.t.autoStart')}</p>
            </>
          ) : (
            <>
              <span className="lab">{t('mp.t.confirming', { label: mpRoundLabel(roundInfo) })}
                {readyProgress ? ` (${readyProgress.ready}/${readyProgress.total})` : ''}…</span>
              <div className="mp-advance-row"><MpTimer deadline={roundInfo.readyDeadline} /></div>
            </>
          )}
        </div>
      )}

      {/* eliminado: feedback + acompanhar campeonato */}
      {elim.eliminated && phase !== 'encerrada' && (
        <div className="mp-elim setcard">
          <span className="lab">{t('mp.t.eliminated')}{stageLabel ? ` — ${stageLabel}` : ''}</span>
          {follow && followAlive ? (
            <p className="p">{t('mp.t.followingPre')} <strong>{teamName(follow)}</strong>.{' '}
              <a className="mp-link" onClick={() => setShowPicker(true)}>{t('mp.t.change')}</a></p>
          ) : follow && !followAlive ? (
            <p className="p"><strong>{teamName(follow)}</strong> {t('mp.t.fellToo')}</p>
          ) : (
            <p className="p">{t('mp.t.followCta')}</p>
          )}
          {(!follow || !followAlive || showPicker) && (
            elim.aliveHumans.length > 0 ? (
              <div className="mp-follow-row">
                {elim.aliveHumans.map(h => (
                  <button key={h.id} className="btn btn-yellow"
                    onClick={() => { onFollow(h.id); setShowPicker(false); }}>
                    👀 {teamName(h.id)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="p mp-hint">{t('mp.t.noHumans')}</p>
            )
          )}
        </div>
      )}

      {/* minha partida rolando agora */}
      {phase !== 'encerrada' && myMatchLive && (
        <div className="mp-yourmatch setcard">
          <span className="lab">{t('mp.t.yourLive')}</span>
          <button className="btn btn-yellow" onClick={onWatch}>{t('mp.t.watchMine')}</button>
        </div>
      )}

      {/* partida do time acompanhado (só com a rodada em andamento de verdade) */}
      {follow && followAlive && followFixture && !announcing && phase !== 'encerrada' && (
        <div className="mp-yourmatch setcard">
          <span className="lab">{t('mp.t.followLive', { name: teamName(follow) })}</span>
          <button className="btn btn-yellow" onClick={() => onSpectate(followFixture.fixtureId)}>
            {t('mp.t.watch')}
          </button>
        </div>
      )}

      {/* só o MEU grupo na tela principal — o resto vai pro modal (#6) */}
      {(() => {
        const mine = snap.groups.find(g => g.teams.some(t => t.id === myTeamId)) || snap.groups[0];
        return <MpGroupBlock snap={snap} g={mine} myTeamId={myTeamId} />;
      })()}

      <div className="mp-foot" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={() => setShowGroups(true)}>{t('mp.t.allGroups')}</button>
      </div>

      {showGroups && Modal && (
        <Modal title={t('mp.t.modalTitle')} eyebrow={t('mp.t.modalEyebrow')} wide onClose={() => setShowGroups(false)}>
          {snap.groups.map(g => <MpGroupBlock key={g.label} snap={snap} g={g} myTeamId={myTeamId} />)}
        </Modal>
      )}

      {snap.bracket.length > 0 && (
        <div className="mp-bracket">
          <div className="shead" style={{ margin: '24px 0 10px' }}><span className="tok">{t('mp.t.bracket')}</span></div>
          {snap.bracket.map(round => (
            <div key={round.roundId} className="gcal-round" style={{ marginBottom: 10 }}>
              <div className="gcal-rlabel">{window.roundText({ id: round.roundId }, 'label')}</div>
              {round.ties.map(tie => (
                <div className={`gcal-fx ${[tie.homeId, tie.awayId].includes(myTeamId) ? 'mine' : ''}`} key={tie.tieId}>
                  <span className="gcal-h"><MpMark snap={snap} id={tie.homeId} /> <MpTeamName snap={snap} id={tie.homeId} /></span>
                  <span className="gcal-sc">
                    {tie.played
                      ? `${tie.homeGoals} – ${tie.awayGoals}${tie.pensHome != null ? ` (${tie.pensHome}–${tie.pensAway} pen)` : ''}`
                      : t('mp.t.toPlay')}
                  </span>
                  <span className="gcal-a"><MpTeamName snap={snap} id={tie.awayId} /> <MpMark snap={snap} id={tie.awayId} /></span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MpEnd({ snap, meId, isHost, achUnlocked, achHistory, mode, onExit, onBackToTables, onPlayAgain }) {
  const myTeamId = 'h:' + meId;
  const champion = snap.championTeamId;
  const iAmChampion = champion === myTeamId;
  // conquistas: das partidas (achUnlocked) + as de campanha (campeão/invicto/almanaque)
  const campaignIds = window.ACHIEVEMENTS.campaignAchievements({
    champion: iAmChampion, history: achHistory || [], mode });
  const achIds = [...new Set([...(achUnlocked || []), ...campaignIds])];
  const achList = window.ACHIEVEMENTS.LIST.filter(a => achIds.includes(a.id));

  // medalha/feedback coerente com até onde EU cheguei (não 🥈 genérico)
  const elim = window.MPLOG.eliminationInfo(snap, myTeamId);
  const stageIcons = { final: '🥈', semi: '🥉' };
  const emoji = iAmChampion ? '🏆' : (stageIcons[elim.stage] || '⚽');
  const title = iAmChampion ? t('mp.end.champTitle')
    : elim.stage === 'final' ? t('mp.end.viceTitle')
    : elim.stage === 'grupos' || !elim.stage ? t('mp.end.fellGroups')
    : t('mp.end.fellAt', { round: window.roundText({ id: elim.stage }, 'label') });

  return (
    <div className="stage narrow screen-fade mp-center">
      <div className="mp-end-hero">
        <div className="mp-end-emoji">{emoji}</div>
        <span className="tok">{t('mp.end.tok')}</span>
        <h2>{title}</h2>
        {!iAmChampion && <p className="sub">{t('mp.end.championLine')} <strong>{champion ? mpTeamInfo(snap, champion).name : '—'}</strong></p>}
        <p className="sub">{iAmChampion ? t('mp.end.champSub') : t('mp.end.fellSub')}</p>
      </div>

      {snap.awards && (() => {
        const a = snap.awards;
        const cards = [
          { ic: '👟', lab: t('mp.end.awTopScorer'), p: a.topScorer, stat: p => t('mp.end.awGoals', { n: p.goals }) },
          { ic: '⭐', lab: t('mp.end.awBestPlayer'), p: a.bestPlayer, stat: p => t('mp.end.awAvg', { n: p.avg }) },
          { ic: '🧤', lab: t('mp.end.awKeeper'), p: a.bestKeeper, stat: p => t('mp.end.awCleanSheets', { n: p.cleanSheets }) },
          { ic: '🎩', lab: t('mp.end.awPlaymaker'), p: a.playmaker, stat: p => t('mp.end.awAssists', { n: p.assists }) },
        ].filter(c => c.p);
        if (!cards.length) return null;
        return (
          <div className="mp-awards">
            <div className="shead" style={{ margin: '6px 0 8px' }}><span className="tok">{t('mp.end.awardsTok')}</span></div>
            <div className="setgrid">
              {cards.map((c, i) => (
                <div className="setcard mp-award" key={i}>
                  <span className="mp-award-ic">{c.ic}</span>
                  <div>
                    <span className="lab">{c.lab}</span>
                    <div className="mp-award-name">{c.p.name}</div>
                    <div className="mp-award-stat">{c.stat(c.p)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {achList.length > 0 && (
        <div className="mp-awards">
          <div className="shead" style={{ margin: '6px 0 8px' }}><span className="tok">{t('mp.end.achTok')}</span></div>
          <div className="mp-ach-grid">
            {achList.map(a => (
              <div className="mp-ach" key={a.id} title={a.desc}>
                <span className="mp-ach-ic">{a.icon}</span>
                <span className="mp-ach-name">{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mp-foot">
        <button className="btn btn-ghost" onClick={onBackToTables}>{t('mp.end.seeCampaign')}</button>
        {isHost
          ? <button className="btn btn-green" onClick={onPlayAgain}>{t('mp.end.playAgain')}</button>
          : <span className="p mp-hint">{t('mp.end.hostRematch')}</span>}
        <button className="btn btn-ghost" onClick={onExit}>{t('mp.lobby.leave')}</button>
      </div>
    </div>
  );
}

function MultiplayerApp({ sfx, onExit, onStage }) {
  const [session, setSession] = useState(window.MPAUTH.session());
  const [stage, setStage] = useState(window.MPAUTH.isLoggedIn() ? 'menu' : 'login');
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState(null);
  const [progress, setProgress] = useState(null);
  const [formation, setFormation] = useState('4-3-3');
  const [formationChosen, setFormationChosen] = useState(false);
  const [snap, setSnap] = useState(null);
  const [minute, setMinute] = useState(0);
  const [yourMatch, setYourMatch] = useState(null);
  const [watching, setWatching] = useState(false);
  const [follow, setFollow] = useState(null);        // teamId humano acompanhado (eliminado)
  const [spectMatch, setSpectMatch] = useState(null); // {fixtureId, homeId, awayId, log}
  const [readyProgress, setReadyProgress] = useState(null); // {ready, total}
  const [clickedRound, setClickedRound] = useState(null);   // chave da rodada em que já cliquei "iniciar"
  const [advancedRound, setAdvancedRound] = useState(null); // rodada em que cliquei "Avançar" (#5)
  const [postMatch, setPostMatch] = useState(null);  // {log, ratings} — pós-jogo (reuso do solo)
  const [draftTeams, setDraftTeams] = useState(null); // times já enviados (ver os outros)
  const [showTeams, setShowTeams] = useState(false);  // modal "ver times enviados" aberto
  const [achUnlocked, setAchUnlocked] = useState([]); // conquistas do humano (das partidas)
  const [achHistory, setAchHistory] = useState([]);   // {won,extraTime,penalties} por jogo
  const meId = session ? session.user.id : null;

  const stageRef = useRef(stage);
  stageRef.current = stage;
  // o GameHeader do app reflete o estágio do MP (senão fica preso em "início")
  useEffect(() => { if (onStage) onStage(stage); }, [stage]); // eslint-disable-line
  const yourMatchRef = useRef(null);
  yourMatchRef.current = yourMatch;
  const lastRoundRef = useRef(null);                 // info da rodada corrente p/ rótulos
  const busyWatchingRef = useRef(false);             // assistindo/pós-jogo: não puxar pra tela final
  const announcedRoundRef = useRef(null);            // rodada cujo pré-jogo já processei
  const openedRoundRef = useRef(null);               // rodada cuja partida já auto-abri

  // ---- FONTE ÚNICA DA VERDADE: deriva a fase da rodada do SNAPSHOT ----
  // (eventos avulsos podem se perder; o snapshot sempre chega e se autocorrige)
  const rInfo = snap ? snap.currentRound : null;
  const roundKey = rInfo ? rInfo.kind + ':' + rInfo.label : null;
  const announcing = !!(rInfo && rInfo.status === 'aguardando');
  const roundLive = !!(rInfo && rInfo.status === 'rolando');
  const myFixtureInRound = rInfo && yourMatch
    && rInfo.fixtures.some(f => f.fixtureId === yourMatch.fixtureId);

  useEffect(() => {
    if (!rInfo) return;
    lastRoundRef.current = rInfo;
    if (announcing && announcedRoundRef.current !== roundKey) {
      // rodada anunciada: limpa restos da anterior; pós-jogo só de quem vai jogar
      announcedRoundRef.current = roundKey;
      setSpectMatch(null);
      setWatching(false);
      setReadyProgress(null);
      setMinute(0);
      setAdvancedRound(null);
      if (myFixtureInRound) { busyWatchingRef.current = false; setPostMatch(null); }
    }
    if (roundLive && myFixtureInRound && openedRoundRef.current !== roundKey) {
      // rodada abriu: dono entra direto na própria partida (uma vez por rodada)
      openedRoundRef.current = roundKey;
      busyWatchingRef.current = false;
      setPostMatch(null);
      setSpectMatch(null);
      setWatching(true);
    }
  }, [snap, yourMatch]); // eslint-disable-line

  // wire server events once
  useEffect(() => {
    const offs = [
      window.MPRT.on('RoomState', (state) => {
        // ancora os timers no relógio do servidor (corrige desvio entre clientes)
        if (state && state.serverNow) mpClockOffset = Date.parse(state.serverNow) - Date.now();
        roomRef.current = state; // síncrono: enterRoom lê logo após o JoinRoom resolver
        setRoom(state);
        if (state.state === 'draft' && ['lobby'].includes(stageRef.current)) setStage('draft');
        // entrei/recarreguei com torneio em andamento → resync completo
        if (['grupos', 'mata-mata', 'encerrada'].includes(state.state) && stageRef.current === 'lobby') {
          window.MPRT.invoke('GetTournament', state.code).catch(() => {});
          setStage('tournament');
        }
        // revanche: a sala voltou ao lobby — zera todo o estado do torneio anterior
        if (state.state === 'aguardando' && !['login', 'menu', 'lobby'].includes(stageRef.current)) {
          setSnap(null); setYourMatch(null); setFollow(null); setSpectMatch(null);
          setPostMatch(null); setWatching(false); setReadyProgress(null);
          setClickedRound(null); setAdvancedRound(null); setFormationChosen(false); setDeadline(null); setProgress(null);
          setDraftTeams(null); setShowTeams(false);
          setAchUnlocked([]); setAchHistory([]);
          setMinute(0);
          announcedRoundRef.current = null;
          openedRoundRef.current = null;
          busyWatchingRef.current = false;
          setStage('lobby');
        }
      }),
      window.MPRT.on('DraftStarted', (info) => { setDeadline(info.deadline); setStage('draft'); }),
      window.MPRT.on('DraftProgress', setProgress),
      window.MPRT.on('DraftTeams', setDraftTeams),
      window.MPRT.on('TournamentState', (s) => {
        setSnap(s);
        if (['draft', 'draft-wait', 'lobby'].includes(stageRef.current)) setStage('tournament');
        // só vai pra tela final quando o jogador não está no meio do ticker/pós-jogo
        if (s.phase === 'encerrada' && stageRef.current === 'tournament' && !busyWatchingRef.current)
          setStage('end');
      }),
      window.MPRT.on('YourMatch', (m) => setYourMatch(m)),     // payload privado (ticker)
      window.MPRT.on('WatchMatch', (m) => setSpectMatch(m)),
      window.MPRT.on('RoundReadyProgress', setReadyProgress),
      // RoundReady/RoundStarted: a transição de fase vem do SNAPSHOT (efeito
      // acima); aqui só zeramos o relógio na largada.
      window.MPRT.on('RoundStarted', () => setMinute(0)),
      window.MPRT.on('MinuteTick', setMinute),
      window.MPRT.on('TournamentFinished', () => { /* snapshot 'encerrada' cuida da UI */ }),
      window.MPRT.on('LobbyError', (msg) => setError(msg)),
    ];
    window.MPRT.onReconnected(() => {
      const code = roomRef.current?.code;
      if (code) {
        window.MPRT.invoke('JoinRoom', code).catch(() => {});
        window.MPRT.invoke('GetTournament', code).catch(() => {});
      }
    });
    return () => offs.forEach(off => off());
  }, []);

  const roomRef = useRef(null);
  roomRef.current = room;

  async function enterRoom(code) {
    setBusy(true); setError(null);
    try {
      await window.MPRT.connect();
      await window.MPRT.invoke('JoinRoom', code);
      // o RoomState do join chega ANTES do invoke resolver (stage ainda é
      // 'menu'), então o handler não cobre refresh/deep-link com sala em jogo:
      // a transição tem que ser decidida aqui, pelo estado real da sala.
      const st = roomRef.current;
      if (st && st.state === 'draft') {
        setDeadline(st.draftDeadline || null);
        setStage('draft');
      } else if (st && ['grupos', 'mata-mata', 'encerrada'].includes(st.state)) {
        window.MPRT.invoke('GetTournament', code).catch(() => {});
        setStage('tournament');
      } else setStage('lobby');
    } catch (e) {
      setError(e.message || t('mp.err.join'));
    } finally { setBusy(false); }
  }

  async function createRoom() {
    setBusy(true); setError(null);
    try {
      const created = await window.MPAPI.createRoom();
      await window.MPRT.connect();
      await window.MPRT.invoke('JoinRoom', created.code);
      setStage('lobby');
    } catch (e) {
      setError(e.message || t('mp.err.create'));
    } finally { setBusy(false); }
  }

  // deep link ?sala=CODE
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('sala');
    if (code && window.MPAUTH.isLoggedIn() && stage === 'menu') enterRoom(code.toUpperCase());
  }, []);

  // ver os times dos outros: enquanto espero o draft, busca os já enviados
  // (atualiza sozinho conforme mais gente envia)
  useEffect(() => {
    if (stage === 'draft-wait' && room) window.MPRT.invoke('GetDraftTeams', room.code).catch(() => {});
  }, [stage, progress]); // eslint-disable-line

  // era das seleções da sala: o draft do cliente só oferece seleções no range
  useEffect(() => {
    if (room && room.cupFrom > 0 && room.cupTo > 0)
      window.TEAM.setSquadPool(window.TEAM.poolInRange(room.cupFrom, room.cupTo));
  }, [room && room.cupFrom, room && room.cupTo]); // eslint-disable-line

  async function leaveAll() {
    try { if (room) await window.MPRT.invoke('LeaveRoom', room.code); } catch (e) {}
    await window.MPRT.disconnect();
    window.TEAM.setSquadPool(null);   // some o filtro de era ao sair do MP
    onExit();
  }

  async function confirmDraft(starters, bench, starId) {
    try {
      await window.MPRT.invoke('SubmitTeam', room.code, {
        formation,
        starters: starters.map(p => p.id),
        bench: bench.map(p => p.id),
        captainId: starId,
      });
      setStage('draft-wait');
    } catch (e) { setError(e.message || t('mp.err.submit')); }
  }

  // ---- render por estágio ----
  if (stage === 'login')
    return <MpLogin onExit={onExit} onDone={(s) => {
      setSession(s);
      setStage('menu');
      const code = new URLSearchParams(location.search).get('sala');
      if (code) enterRoom(code.toUpperCase());
    }} />;

  if (stage === 'menu')
    return <MpMenu user={session.user} busy={busy} error={error} onExit={onExit}
      onCreate={createRoom} onJoin={enterRoom}
      onLogout={() => { window.MPAUTH.logout(); window.MPRT.disconnect(); setSession(null); setStage('login'); }} />;

  if (stage === 'lobby' && room)
    return <MpLobby room={room} meId={meId} error={error}
      onReady={(r) => window.MPRT.invoke('SetReady', room.code, r).catch(() => {})}
      onStart={() => window.MPRT.invoke('StartDraft', room.code).catch(() => {})}
      onSpeed={(v) => window.MPRT.invoke('SetRoomSpeed', room.code, v).catch(() => {})}
      onLevel={(v) => window.MPRT.invoke('SetRoomLevel', room.code, v).catch(() => {})}
      onMode={(v) => window.MPRT.invoke('SetRoomMode', room.code, v).catch(() => {})}
      onDraftTime={(v) => window.MPRT.invoke('SetRoomDraftTime', room.code, v).catch(() => {})}
      onCupRange={(f, tt) => window.MPRT.invoke('SetRoomCupRange', room.code, f, tt).catch(() => {})}
      onLeave={leaveAll} />;

  if (stage === 'draft') {
    if (!formationChosen) {
      const opts = Object.keys(window.CONFIG.FORMATIONS).map(id => ({ id, label: id }));
      return (
        <div className="stage narrow screen-fade mp-center">
          <div className="mp-draft-head">
            <span className="tok">{t('mp.draft.tok')}</span>
            {deadline && <MpTimer deadline={deadline} />}
          </div>
          <h2>{t('mp.draft.chooseTitle')}</h2>
          <p className="sub">{t('mp.draft.chooseSub')}</p>
          <FormationSelect value={formation} onChange={setFormation} options={opts} />
          <button className="btn btn-green" style={{ marginTop: 18 }} onClick={() => setFormationChosen(true)}>
            {t('mp.draft.start')}
          </button>
        </div>
      );
    }
    return (
      <div>
        <div className="mp-draft-head stage narrow">
          <span className="tok">{t('mp.draft.tok')}</span>
          {deadline && <MpTimer deadline={deadline} />}
          {progress && <span className="meta">{t('mp.draft.submitted', { done: progress.submitted, total: progress.total })}</span>}
        </div>
        <DraftScreen formation={formation} mode={(room && room.mode) || 'classico'} sfx={sfx} onConfirm={confirmDraft} />
      </div>
    );
  }

  if (stage === 'draft-wait')
    return (
      <div className="stage narrow screen-fade mp-center">
        <span className="tok">{t('mp.draft.tok')}</span>
        <h2>{t('mp.draft.sentTitle')}</h2>
        <p className="sub">{t('mp.draft.waitingOthers')}{progress ? ` (${progress.submitted}/${progress.total})` : ''}…
          {' '}{t('mp.draft.startsWhenDone')}</p>
        {deadline && <MpTimer deadline={deadline} />}
        <div className="mp-foot" style={{ marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={() => {
            setShowTeams(true);
            if (room) window.MPRT.invoke('GetDraftTeams', room.code).catch(() => {});
          }}>
            {t('mp.draft.seeTeams')}{draftTeams ? ` (${draftTeams.length})` : ''}
          </button>
        </div>
        {showTeams && <MpTeamsModal teams={draftTeams} meId={meId} onClose={() => setShowTeams(false)} />}
      </div>
    );

  // rótulo de rodada (PreMatch/Match/PostMatch) a partir da info do servidor
  const mpRound = () => {
    const info = (snap && snap.currentRound) || lastRoundRef.current;
    if (info && info.kind === 'knockout') return { id: info.label };
    return { stage: 'group', label: info ? mpRoundLabel(info) : t('mp.t.groupStage') };
  };
  const mpPace = () => {
    const info = (snap && snap.currentRound) || lastRoundRef.current;
    return (info && info.paceMsPerMinute) || window.CONFIG.MP.PACE_MS_PER_MINUTE;
  };
  const fullPlayer = (ref) => {
    const p = window.MPLOG.playerById(ref.id) || ref;
    return { ...p, attrs: window.DERIVE.deriveAttrs(p) };
  };

  // ---- pré-jogo (reuso do PreMatchScreen do solo): "iniciar partida" = pronto ----
  // só entra depois do "Avançar" (#5); o gate do servidor é o teto de espera
  if (stage === 'tournament' && announcing && myFixtureInRound && advancedRound === roundKey) {
    if (clickedRound === roundKey) {
      return (
        <div className="stage narrow screen-fade mp-center">
          <span className="tok">{mpRoundLabel(rInfo).toUpperCase()}</span>
          <h2>{t('mp.pre.readyTitle')}</h2>
          <p className="sub">{t('mp.draft.waitingOthers')}
            {readyProgress ? ` (${readyProgress.ready}/${readyProgress.total})` : ''}…</p>
          <MpTimer deadline={rInfo.readyDeadline} />
        </div>
      );
    }
    const log = yourMatch.log;
    const meSideKey = yourMatch.side;
    const oppSideKey = meSideKey === 'home' ? 'away' : 'home';
    const meSide = log[meSideKey], oppSide = log[oppSideKey];
    const myXI = meSide.starters.map(fullPlayer);
    const myBench = (yourMatch.bench || []).map(fullPlayer);   // reservas reais (#6)
    const oppXI = oppSide.starters.map(fullPlayer);
    const oppAvg = Math.round(oppXI.reduce((s, p) => s + p.overall, 0) / Math.max(1, oppXI.length));
    const round = { ...mpRound(), n: 0,
      opponent: { team: oppSide.name, code: oppSide.code || null, cup: oppSide.cup || '', dream: !!oppSide.dream } };
    return (
      <div>
        <div className="mp-draft-head stage narrow">
          <span className="tok">{t('mp.pre.tok')} · {mpRoundLabel(rInfo).toUpperCase()}</span>
          <MpTimer deadline={rInfo.readyDeadline} />
        </div>
        {(yourMatch.out && yourMatch.out.length > 0) && (
          <div className="stage narrow" style={{ paddingTop: 0 }}>
            <div className="warn" style={{ background: 'rgba(255,90,90,.1)', borderColor: 'rgba(255,90,90,.3)' }}>
              <span aria-hidden="true">🚑</span>
              <span>{t('mp.pre.outTitle')} {yourMatch.out.map(o =>
                `${o.name} (${o.reason === 'suspended' ? t('mp.pre.outSuspended') : t('mp.pre.outInjured', { n: o.n })})`).join(', ')}. {t('mp.pre.outSub')}</span>
            </div>
          </div>
        )}
        <PreMatchScreen me={{ name: session.user.name, dream: true }}
          starters={myXI} bench={myBench} formation={meSide.formation} starId={null}
          round={round} fatigue={{}} playerStatus={{}} lockLineup={true}
          opponentXI={oppXI} opponentAvg={oppAvg}
          onStart={() => {
            setClickedRound(roundKey);
            window.MPRT.invoke('ReadyForRound', room.code).catch(() => {});
          }} />
      </div>
    );
  }

  // ---- pós-jogo (reuso do PostMatchScreen do solo) ----
  if (stage === 'tournament' && postMatch) {
    busyWatchingRef.current = true;
    return (
      <PostMatchScreen log={postMatch.log} ratings={postMatch.ratings} round={postMatch.round}
        me={{ name: session.user.name, dream: true }} group={null} standings={null}
        onNext={() => {
          busyWatchingRef.current = false;
          setPostMatch(null);
          if (snap && snap.phase === 'encerrada') setStage('end');
        }} />
    );
  }

  if (stage === 'tournament' && watching && yourMatch) {
    busyWatchingRef.current = true;
    const log = yourMatch.side === 'away' ? window.MPLOG.flipLog(yourMatch.log) : yourMatch.log;
    const me = { name: session.user.name, dream: true };
    const round = mpRound();
    // ritmo canônico do SERVIDOR; quem (re)entra cai no minuto corrente
    return (
      <MatchScreen log={log} me={me} round={round} sfx={sfx}
        speed={null} onSpeedChange={null} fixedPace={mpPace()} startAtMinute={minute}
        onFinish={() => {
          // avisa o servidor: se TODOS terminarem/pularem, a rodada resolve na hora (#1)
          window.MPRT.invoke('DoneWatching', room.code).catch(() => {});
          setWatching(false);
          setPostMatch({ log, round, ratings: window.RATINGS.computeRatings(log, window.CONFIG) });
          // conquistas: acumula as do meu jogo (catálogo do solo)
          const ids = mpMatchAchievements(log);
          if (ids.length) setAchUnlocked(prev => [...new Set([...prev, ...ids])]);
          setAchHistory(prev => [...prev, { won: log.result === 'home', extraTime: log.extraTime, penalties: !!log.penalties }]);
        }}
        onShootout={null} onPenalty={null} pendingPen={null} />
    );
  }

  // espectador: partida do time humano acompanhado (perspectiva dele = home)
  if (stage === 'tournament' && spectMatch && follow) {
    busyWatchingRef.current = true;
    const log = spectMatch.awayId === follow ? window.MPLOG.flipLog(spectMatch.log) : spectMatch.log;
    const me = { name: mpTeamInfo(snap, follow).name, dream: true };
    return (
      <MatchScreen log={log} me={me} round={mpRound()} sfx={sfx}
        speed={null} onSpeedChange={null} fixedPace={mpPace()} startAtMinute={minute}
        onFinish={() => {
          busyWatchingRef.current = false;
          setSpectMatch(null);
          if (snap && snap.phase === 'encerrada') setStage('end');
        }}
        onShootout={null} onPenalty={null} pendingPen={null} />
    );
  }

  // (#4) minha rodada está rolando: tabelas só liberam quando ela terminar
  if (stage === 'tournament' && roundLive && myFixtureInRound && !watching && !spectMatch) {
    return (
      <div className="stage narrow screen-fade mp-center">
        <span className="tok">{mpRoundLabel(rInfo).toUpperCase()} · {t('mp.live.tok')}</span>
        <h2>{t('mp.live.rolling', { m: minute || 0 })}</h2>
        <p className="sub">{t('mp.live.tablesLater')}</p>
        <button className="btn btn-yellow" onClick={() => setWatching(true)}>{t('mp.live.backToMatch')}</button>
      </div>
    );
  }

  if (stage === 'tournament' && snap)
    return <MpTournament snap={snap} meId={meId} minute={minute}
      yourMatch={yourMatch} onWatch={() => setWatching(true)}
      readyProgress={readyProgress}
      advanced={advancedRound === roundKey} onAdvance={() => setAdvancedRound(roundKey)}
      onBackToEnd={() => setStage('end')}
      follow={follow} onFollow={setFollow}
      onSpectate={(fixtureId) => window.MPRT.invoke('WatchFixture', room.code, fixtureId).catch(() => {})} />;

  if (stage === 'end' && snap)
    return <MpEnd snap={snap} meId={meId} isHost={room && room.hostUserId === meId}
      achUnlocked={achUnlocked} achHistory={achHistory} mode={room && room.mode}
      onExit={leaveAll}
      onBackToTables={() => setStage('tournament')}
      onPlayAgain={() => window.MPRT.invoke('PlayAgain', room.code).catch(() => {})} />;

  // fallback: conectando…
  return (
    <div className="stage narrow screen-fade mp-center">
      <span className="tok">{t('mp.connTok')}</span>
      <h2>{t('mp.connecting')}</h2>
      {error && <p className="mp-error">{error}</p>}
      <button className="btn btn-ghost" onClick={onExit}>{t('mp.back')}</button>
    </div>
  );
}

Object.assign(window, { MultiplayerApp });
