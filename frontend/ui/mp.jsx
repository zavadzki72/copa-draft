/* ============================================================
   COPA DRAFT — ui/mp.jsx
   Multiplayer Online (PRD_004 MVP). Server-authoritative: the .NET
   backend owns lobby, draft deadline and the tournament; this UI
   renders what the server streams (SignalR) and reuses the solo
   components (DraftScreen, MatchScreen, tables) wherever possible.
   Strings are PT-only in the MVP (decision documented in the PLAN).
   ============================================================ */
// MVP: multiplayer é PT-BR (i18n fica para um follow-up).
// Helpers puros (espelho de log, resolução de times no snapshot) vivem em
// lib/mp-log.js (window.MPLOG) para serem testáveis em Node.
const mpTeamInfo = (snap, teamId) => window.MPLOG.teamInfo(snap, teamId);

/* um grupo (tabela + calendário) — usado na tela principal (só o MEU grupo)
   e no modal "todos os grupos" (#6) */
function MpGroupBlock({ snap, g, myTeamId }) {
  return (
    <div className="mp-group">
      <div className="shead" style={{ margin: '20px 0 10px' }}>
        <span className="tok">GRUPO {g.label}</span>
      </div>
      <div className="group-table" role="table">
        <div className="gt-row gt-head" role="row">
          <span className="gt-pos"></span><span className="gt-team">Seleção</span>
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
            <div className="gcal-rlabel">Rodada {r + 1}</div>
            {g.fixtures.filter(f => f.round === r).map(f => (
              <div className={`gcal-fx ${[f.homeId, f.awayId].includes(myTeamId) ? 'mine' : ''}`} key={f.fixtureId}>
                <span className="gcal-h"><MpMark snap={snap} id={f.homeId} /> <MpTeamName snap={snap} id={f.homeId} /></span>
                <span className="gcal-sc">{f.played ? `${f.homeGoals} – ${f.awayGoals}` : 'a jogar'}</span>
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
    const tick = () => setLeft(Math.max(0, Math.round((new Date(deadline) - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [deadline]);
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  return <span className={`mp-timer ${left <= 20 ? 'low' : ''}`}>⏱ {mm}:{ss}</span>;
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
      if (session) onDone(session); else setErr(e ? e.message : 'Falha no login.');
    });
    if (tryRender()) return;
    const iv = setInterval(() => {
      if (tryRender()) { clearInterval(iv); setErr(null); return; }
      if (++tries >= 20) { clearInterval(iv); setErr('Login do Google indisponível. Recarregue a página.'); }
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
      <span className="tok">MULTIPLAYER ONLINE</span>
      <h2>{hasInvite ? 'Você foi convidado!' : 'Jogue a Copa com seus amigos'}</h2>
      <p className="sub">{hasInvite
        ? 'Diga seu nome e entre na sala — ou use sua conta Google.'
        : 'Crie uma sala, mande o convite, cada um monta seu time — e o torneio rola ao vivo, com todos em grupos diferentes até se cruzarem no mata-mata.'}</p>

      <div className="mp-guest-row">
        <input className="mp-input mp-input-name" value={guestName} maxLength={30}
          placeholder="Seu nome" onChange={e => setGuestName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && guestName.trim().length >= 2) enterAsGuest(); }} />
        <button className="btn btn-yellow" disabled={busy || guestName.trim().length < 2} onClick={enterAsGuest}>
          🎟 Entrar como convidado
        </button>
      </div>
      <p className="p mp-hint">Convidados entram em salas existentes. Para <strong>criar</strong> uma sala, use o Google:</p>

      {cid
        ? <div ref={btnRef} className="mp-google-btn" />
        : <p className="mp-error">⚠ Login Google não configurado (CONFIG.MP.GOOGLE_CLIENT_ID).</p>}
      {err && <p className="mp-error">{err}</p>}
      <button className="btn btn-ghost" onClick={onExit}>← Voltar</button>
    </div>
  );
}

function MpMenu({ user, busy, error, onCreate, onJoin, onLogout, onExit }) {
  const [code, setCode] = useState('');
  const guest = !!user.guest;
  return (
    <div className="stage narrow screen-fade mp-center">
      <span className="tok">MULTIPLAYER ONLINE</span>
      <h2>Olá, {user.name.split(' ')[0]}!{guest ? ' 🎟' : ''}</h2>
      <div className="setgrid mp-menu">
        <div className="setcard">
          <span className="lab">Criar sala</span>
          {guest ? (
            <p className="p">Convidados não criam salas — entre com o Google para ser o anfitrião.</p>
          ) : (
            <p className="p">Você vira o anfitrião e recebe um código para convidar os amigos.</p>
          )}
          <button className="btn btn-green" disabled={busy || guest} onClick={onCreate}>➕ Criar sala</button>
        </div>
        <div className="setcard">
          <span className="lab">Entrar numa sala</span>
          <p className="p">Recebeu um convite? Cole o código aqui.</p>
          <div className="mp-join-row">
            <input className="mp-input" value={code} maxLength={6}
              placeholder="CÓDIGO" onChange={e => setCode(e.target.value.toUpperCase())} />
            <button className="btn btn-yellow" disabled={busy || code.length < 6}
              onClick={() => onJoin(code)}>Entrar</button>
          </div>
        </div>
      </div>
      {error && <p className="mp-error">{error}</p>}
      <div className="mp-foot">
        <button className="btn btn-ghost" onClick={onExit}>← Voltar</button>
        <button className="btn btn-ghost" onClick={onLogout}>Sair da conta</button>
      </div>
    </div>
  );
}

function MpLobby({ room, meId, error, onReady, onStart, onLeave, onSpeed }) {
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
          <span className="tok">SALA · LOBBY</span>
          <h2 style={{ marginTop: 4 }}>Convide os amigos</h2>
        </div>
        <span className="meta">{room.players.length}/{room.maxPlayers} jogadores</span>
      </div>

      <div className="mp-invite setcard">
        <span className="lab">Código da sala</span>
        <div className="mp-code">{room.code}</div>
        <button className="btn btn-ghost" onClick={copy}>{copied ? '✓ Copiado!' : '📋 Copiar link de convite'}</button>
      </div>

      <div className="setcard mp-speed">
        <span className="lab">Velocidade das partidas</span>
        {isHost ? (
          <Segmented value={room.speed} onChange={onSpeed} options={[
            { id: 'normal', label: 'Normal', hint: '~34s' },
            { id: 'rapido', label: 'Rápida', hint: '~22s' },
            { id: 'super', label: 'Super', hint: '~11s' },
          ]} />
        ) : (
          <p className="p mp-speed-view">
            {{ normal: 'Normal (~34s)', rapido: 'Rápida (~22s)', super: 'Super (~11s)' }[room.speed] || room.speed}
            <span className="mp-hint"> · definida pelo anfitrião 👑</span>
          </p>
        )}
      </div>

      <div className="mp-players">
        {room.players.map(p => (
          <div className={`mp-player ${p.userId === meId ? 'me' : ''}`} key={p.userId}>
            {p.avatar ? <img className="mp-avatar" src={p.avatar} alt="" referrerPolicy="no-referrer" /> : <Crest className="cr-inline" />}
            <span className="mp-pname">{p.name}{p.isHost ? ' 👑' : ''}</span>
            <span className={`mp-presence ${p.presence}`}>{p.presence === 'conectado' ? '' : p.presence === 'ia' ? '🤖 IA' : '⌀ saiu'}</span>
            <span className={`mp-ready ${p.ready ? 'on' : ''}`}>{p.ready ? '✓ pronto' : 'aguardando'}</span>
          </div>
        ))}
      </div>

      {error && <p className="mp-error">{error}</p>}
      <div className="mp-foot">
        <button className="btn btn-ghost" onClick={onLeave}>← Sair da sala</button>
        <button className={`btn ${me && me.ready ? 'btn-ghost' : 'btn-yellow'}`} onClick={() => onReady(!(me && me.ready))}>
          {me && me.ready ? 'Desmarcar pronto' : '✓ Estou pronto'}
        </button>
        {isHost && (
          <button className="btn btn-green" disabled={room.players.length < 2} onClick={onStart}>
            🚀 Iniciar ({readyCount}/{room.players.length} prontos)
          </button>
        )}
      </div>
      {isHost && room.players.length < 2 && <p className="p mp-hint">Convide pelo menos mais 1 amigo para iniciar.</p>}
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
  const stageLabel = elim.stage === 'grupos' ? 'fase de grupos'
    : elim.stage ? window.roundText({ id: elim.stage }, 'label') : null;
  const followFixture = follow ? window.MPLOG.fixtureOfTeam(roundInfo, follow) : null;
  const followAlive = follow && elim.aliveHumans.some(h => h.id === follow);

  return (
    <div className="stage narrow screen-fade">
      <div className="shead">
        <div>
          <span className="tok">TORNEIO DA SALA · {phase.toUpperCase()}</span>
          <h2 style={{ marginTop: 4 }}>
            {phase === 'encerrada'
              ? (iAmChampion ? '🏆 Você é o campeão!' : `🏆 Campeão: ${champion ? teamName(champion) : '—'}`)
              : roundInfo ? `${roundInfo.label} em andamento` : 'Aguardando próxima rodada…'}
          </h2>
        </div>
        {roundInfo && phase !== 'encerrada' && !announcing && <span className="meta">⏱ minuto {minute || 0}</span>}
        {phase === 'encerrada' && onBackToEnd && (
          <button className="btn btn-yellow" onClick={onBackToEnd}>🏁 Resultado final</button>
        )}
      </div>

      {/* pré-jogo da rodada: Avançar (quem joga) / confirmando (demais) */}
      {announcing && phase !== 'encerrada' && (
        <div className="mp-yourmatch setcard">
          {myCurrentFixture && !advanced ? (
            <>
              <span className="lab">⚽ {roundInfo.label}: sua partida está montada</span>
              <div className="mp-advance-row">
                <button className="btn btn-green" onClick={onAdvance}>▶ Avançar para o pré-jogo</button>
                <MpTimer deadline={roundInfo.readyDeadline} />
              </div>
              <p className="p mp-hint">Se o tempo zerar, a rodada começa automaticamente.</p>
            </>
          ) : (
            <>
              <span className="lab">⏳ {roundInfo.label}: jogadores confirmando
                {readyProgress ? ` (${readyProgress.ready}/${readyProgress.total})` : ''}…</span>
              <div className="mp-advance-row"><MpTimer deadline={roundInfo.readyDeadline} /></div>
            </>
          )}
        </div>
      )}

      {/* eliminado: feedback + acompanhar campeonato */}
      {elim.eliminated && phase !== 'encerrada' && (
        <div className="mp-elim setcard">
          <span className="lab">⛔ Você foi eliminado{stageLabel ? ` — ${stageLabel}` : ''}</span>
          {follow && followAlive ? (
            <p className="p">Acompanhando <strong>{teamName(follow)}</strong>.{' '}
              <a className="mp-link" onClick={() => setShowPicker(true)}>trocar</a></p>
          ) : follow && !followAlive ? (
            <p className="p"><strong>{teamName(follow)}</strong> também caiu — escolha outro time.</p>
          ) : (
            <p className="p">O torneio continua — acompanhe a campanha de outro jogador.</p>
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
              <p className="p mp-hint">Nenhum jogador humano segue vivo — só IAs até a final.</p>
            )
          )}
        </div>
      )}

      {/* minha partida rolando agora */}
      {phase !== 'encerrada' && myMatchLive && (
        <div className="mp-yourmatch setcard">
          <span className="lab">Sua partida está rolando</span>
          <button className="btn btn-yellow" onClick={onWatch}>▶ Assistir minha partida</button>
        </div>
      )}

      {/* partida do time acompanhado (só com a rodada em andamento de verdade) */}
      {follow && followAlive && followFixture && !announcing && phase !== 'encerrada' && (
        <div className="mp-yourmatch setcard">
          <span className="lab">Partida de {teamName(follow)} está rolando</span>
          <button className="btn btn-yellow" onClick={() => onSpectate(followFixture.fixtureId)}>
            ▶ Assistir
          </button>
        </div>
      )}

      {/* só o MEU grupo na tela principal — o resto vai pro modal (#6) */}
      {(() => {
        const mine = snap.groups.find(g => g.teams.some(t => t.id === myTeamId)) || snap.groups[0];
        return <MpGroupBlock snap={snap} g={mine} myTeamId={myTeamId} />;
      })()}

      <div className="mp-foot" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={() => setShowGroups(true)}>🗂 Ver todos os grupos</button>
      </div>

      {showGroups && Modal && (
        <Modal title="Todos os grupos" eyebrow="FASE DE GRUPOS" wide onClose={() => setShowGroups(false)}>
          {snap.groups.map(g => <MpGroupBlock key={g.label} snap={snap} g={g} myTeamId={myTeamId} />)}
        </Modal>
      )}

      {snap.bracket.length > 0 && (
        <div className="mp-bracket">
          <div className="shead" style={{ margin: '24px 0 10px' }}><span className="tok">MATA-MATA</span></div>
          {snap.bracket.map(round => (
            <div key={round.roundId} className="gcal-round" style={{ marginBottom: 10 }}>
              <div className="gcal-rlabel">{window.roundText({ id: round.roundId }, 'label')}</div>
              {round.ties.map(tie => (
                <div className={`gcal-fx ${[tie.homeId, tie.awayId].includes(myTeamId) ? 'mine' : ''}`} key={tie.tieId}>
                  <span className="gcal-h"><MpMark snap={snap} id={tie.homeId} /> <MpTeamName snap={snap} id={tie.homeId} /></span>
                  <span className="gcal-sc">
                    {tie.played
                      ? `${tie.homeGoals} – ${tie.awayGoals}${tie.pensHome != null ? ` (${tie.pensHome}–${tie.pensAway} pen)` : ''}`
                      : 'a jogar'}
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

function MpEnd({ snap, meId, isHost, onExit, onBackToTables, onPlayAgain }) {
  const myTeamId = 'h:' + meId;
  const champion = snap.championTeamId;
  const iAmChampion = champion === myTeamId;

  // medalha/feedback coerente com até onde EU cheguei (não 🥈 genérico)
  const elim = window.MPLOG.eliminationInfo(snap, myTeamId);
  const stageIcons = { final: '🥈', semi: '🥉' };
  const emoji = iAmChampion ? '🏆' : (stageIcons[elim.stage] || '⚽');
  const stageLabel = elim.stage === 'grupos' ? 'na fase de grupos'
    : elim.stage ? `em ${window.roundText({ id: elim.stage }, 'label')}` : '';
  const title = iAmChampion ? 'CAMPEÃO DA SALA!'
    : elim.stage === 'final' ? 'Vice-campeão!'
    : `Você caiu ${stageLabel}`;

  return (
    <div className="stage narrow screen-fade mp-center">
      <div className="mp-end-hero">
        <div className="mp-end-emoji">{emoji}</div>
        <span className="tok">TORNEIO ENCERRADO</span>
        <h2>{title}</h2>
        {!iAmChampion && <p className="sub">Campeão da sala: <strong>{champion ? mpTeamInfo(snap, champion).name : '—'}</strong></p>}
        <p className="sub">{iAmChampion
          ? 'Seu time dos sonhos levou a taça contra seus amigos. Respeito eterno no grupo.'
          : 'Confira a campanha completa — ou jogue de novo pra buscar a forra.'}</p>
      </div>
      <div className="mp-foot">
        <button className="btn btn-ghost" onClick={onBackToTables}>📊 Ver campanha</button>
        {isHost
          ? <button className="btn btn-green" onClick={onPlayAgain}>🔁 Jogar novamente</button>
          : <span className="p mp-hint">O anfitrião pode iniciar uma revanche 🔁</span>}
        <button className="btn btn-ghost" onClick={onExit}>← Sair da sala</button>
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
          setMinute(0);
          announcedRoundRef.current = null;
          openedRoundRef.current = null;
          busyWatchingRef.current = false;
          setStage('lobby');
        }
      }),
      window.MPRT.on('DraftStarted', (info) => { setDeadline(info.deadline); setStage('draft'); }),
      window.MPRT.on('DraftProgress', setProgress),
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
      setError(e.message || 'Não foi possível entrar na sala.');
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
      setError(e.message || 'Não foi possível criar a sala.');
    } finally { setBusy(false); }
  }

  // deep link ?sala=CODE
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('sala');
    if (code && window.MPAUTH.isLoggedIn() && stage === 'menu') enterRoom(code.toUpperCase());
  }, []);

  async function leaveAll() {
    try { if (room) await window.MPRT.invoke('LeaveRoom', room.code); } catch (e) {}
    await window.MPRT.disconnect();
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
    } catch (e) { setError(e.message || 'Falha ao enviar o time.'); }
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
      onLeave={leaveAll} />;

  if (stage === 'draft') {
    if (!formationChosen) {
      const fHint = { '4-3-3': 'fOfensiva', '4-4-2': 'fEquilibrado', '3-5-2': 'fMeio', '4-5-1': 'fDefensiva', '5-3-2': 'fRetranca', '3-4-3': 'fLouca' };
      const opts = Object.keys(window.CONFIG.FORMATIONS).map(id => ({ id, label: id }));
      return (
        <div className="stage narrow screen-fade mp-center">
          <div className="mp-draft-head">
            <span className="tok">DRAFT MULTIPLAYER</span>
            {deadline && <MpTimer deadline={deadline} />}
          </div>
          <h2>Escolha sua formação</h2>
          <p className="sub">Todos estão montando seus times agora. Quem não terminar a tempo recebe um time automático.</p>
          <FormationSelect value={formation} onChange={setFormation} options={opts} />
          <button className="btn btn-green" style={{ marginTop: 18 }} onClick={() => setFormationChosen(true)}>
            🎲 Começar o draft
          </button>
        </div>
      );
    }
    return (
      <div>
        <div className="mp-draft-head stage narrow">
          <span className="tok">DRAFT MULTIPLAYER</span>
          {deadline && <MpTimer deadline={deadline} />}
          {progress && <span className="meta">{progress.submitted}/{progress.total} times enviados</span>}
        </div>
        <DraftScreen formation={formation} mode="classico" sfx={sfx} onConfirm={confirmDraft} />
      </div>
    );
  }

  if (stage === 'draft-wait')
    return (
      <div className="stage narrow screen-fade mp-center">
        <span className="tok">DRAFT MULTIPLAYER</span>
        <h2>Time enviado! ✓</h2>
        <p className="sub">Aguardando os outros jogadores{progress ? ` (${progress.submitted}/${progress.total})` : ''}…
          O torneio começa assim que todos terminarem (ou o tempo acabar).</p>
        {deadline && <MpTimer deadline={deadline} />}
      </div>
    );

  // rótulo de rodada (PreMatch/Match/PostMatch) a partir da info do servidor
  const mpRound = () => {
    const info = (snap && snap.currentRound) || lastRoundRef.current;
    if (info && info.kind === 'knockout') return { id: info.label };
    return { stage: 'group', label: info ? info.label : 'Fase de grupos' };
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
          <span className="tok">{rInfo.label.toUpperCase()}</span>
          <h2>Pronto! ✓</h2>
          <p className="sub">Aguardando os outros jogadores
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
          <span className="tok">PRÉ-JOGO · {rInfo.label.toUpperCase()}</span>
          <MpTimer deadline={rInfo.readyDeadline} />
        </div>
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
        <span className="tok">{rInfo.label.toUpperCase()} · EM ANDAMENTO</span>
        <h2>Partidas rolando — minuto {minute || 0}</h2>
        <p className="sub">As tabelas e o chaveamento liberam quando a rodada terminar.</p>
        <button className="btn btn-yellow" onClick={() => setWatching(true)}>▶ Voltar à minha partida</button>
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
      onExit={leaveAll}
      onBackToTables={() => setStage('tournament')}
      onPlayAgain={() => window.MPRT.invoke('PlayAgain', room.code).catch(() => {})} />;

  // fallback: conectando…
  return (
    <div className="stage narrow screen-fade mp-center">
      <span className="tok">MULTIPLAYER</span>
      <h2>Conectando…</h2>
      {error && <p className="mp-error">{error}</p>}
      <button className="btn btn-ghost" onClick={onExit}>← Voltar</button>
    </div>
  );
}

Object.assign(window, { MultiplayerApp });
