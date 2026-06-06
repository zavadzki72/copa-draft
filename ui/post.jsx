/* ============================================================
   COPA DRAFT — ui/post.jsx
   Post-match ratings, the knockout bracket, and the campaign end.
   Player is always the HOME side.
   ============================================================ */
function PostMatchScreen({ log, ratings, draw, round, onNext }) {
  const [tab, setTab] = useState('home');
  const won = log.result === 'home';
  const isFinal = round.id === 'final';
  const sweep = won && log.score.home === 7 && log.score.away === 0;

  const goals = log.events.filter(e => e.type === 'goal');
  const motm = ratings.players[ratings.motm];

  const sideName = tab === 'home' ? log.home.name : log.away.name;
  const rows = Object.values(ratings.players)
    .filter(p => p.side === tab)
    .sort((a, b) => b.rating - a.rating);

  function evText(p) {
    const bits = [];
    if (p.goals) bits.push(`${p.goals}G`);
    if (p.assists) bits.push(`${p.assists}A`);
    if (p.pos === 'GOL' && p.saves) bits.push(`${p.saves} def`);
    return bits.join(' · ');
  }

  const nextLabel = !won ? 'Fim da campanha →' : isFinal ? 'Erguer a taça 🏆' : 'Próxima fase →';

  return (
    <div className="stage narrow screen-fade">
      <div className="shead"><span className="tok">resultado</span><span className="meta">{round.label}</span></div>

      <div className="final-score">
        <div className={`res ${won ? 'win' : 'loss'}`}>{won ? '✦ Classificado ✦' : 'Eliminado'}</div>
        <div className="big">
          <div>
            <TeamMark code={log.home.code} dream={log.home.dream} />
            <div className="tn">{log.home.name}</div>
          </div>
          <div>
            <span className="sc" style={{ color: won ? 'var(--green-bright)' : 'var(--fg1)' }}>{log.score.home}</span>
            <span className="sc" style={{ color: 'var(--fg3)', margin: '0 8px' }}>–</span>
            <span className="sc" style={{ color: !won ? 'var(--loss)' : 'var(--fg1)' }}>{log.score.away}</span>
          </div>
          <div>
            <Flag code={log.away.code} />
            <div className="tn">{log.away.name}</div>
          </div>
        </div>
        {log.penalties && <div className="pk">decisão nos pênaltis: {log.penalties.home} × {log.penalties.away}</div>}
        {log.extraTime && !log.penalties && <div className="pk">após prorrogação</div>}
      </div>

      {sweep && (
        <div className="motm" style={{ background: 'linear-gradient(145deg, rgba(255,223,0,.16), rgba(30,38,31,.5))', borderColor: 'var(--yellow)' }}>
          <span className="badge badge-yellow">★ LENDA</span>
          <div className="motm-mid">
            <div className="nm" style={{ color: 'var(--yellow)' }}>7 a 0</div>
            <div className="meta">Você desbloqueou a goleada histórica que dá nome ao jogo.</div>
          </div>
        </div>
      )}

      {motm && (
        <div className="motm">
          <span className="badge badge-yellow">★ Craque do jogo</span>
          <div className="motm-mid">
            <div className="nm">{motm.name}</div>
            <div className="meta"><PosPill pos={motm.pos} /> {motm.side === 'home' ? log.home.name : log.away.name} · {evText(motm) || 'atuação consistente'}</div>
          </div>
          <span className="rt">{motm.rating.toFixed(1)}</span>
        </div>
      )}

      {goals.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="shead" style={{ margin: '0 0 12px' }}><span className="tok">gols</span></div>
          <div className="ratings-list">
            {goals.map((g, i) => {
              const scorer = ratings.players[g.players[0]];
              const assist = g.players[1] ? ratings.players[g.players[1]] : null;
              return (
                <div className="rrow" key={i} style={{ gridTemplateColumns: '46px 1fr auto' }}>
                  <span className="pp" style={{ color: 'var(--green-bright)' }}>{g.minute}'</span>
                  <span className="nm">{scorer ? scorer.name : '—'}
                    {assist && <span className="ev">assist. {assist.name}</span>}</span>
                  <span className="pp">{g.side === 'home' ? log.home.name : log.away.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="shead" style={{ margin: '0 0 12px' }}><span className="tok">notas</span></div>
      <div className="subtabs">
        <button className={`chip ${tab === 'home' ? 'on' : ''}`} onClick={() => setTab('home')}>{log.home.name}</button>
        <button className={`chip ${tab === 'away' ? 'on' : ''}`} onClick={() => setTab('away')}>{log.away.name}</button>
      </div>
      <div className="ratings-list">
        {rows.map(p => (
          <div className="rrow" key={p.id}>
            <span className="pp">{p.pos}</span>
            <span className="nm">{p.name}
              {p.id === ratings.motm && <span className="ev">★ craque</span>}
              {evText(p) && <span className="ev">{evText(p)}</span>}</span>
            <span className={`rt ${ratingClass(p.rating)}`}>{p.rating.toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
        <button className="btn btn-green" style={{ fontSize: 16, padding: '14px 36px' }} onClick={onNext}>{nextLabel}</button>
      </div>
    </div>
  );
}

/* ---------- KNOCKOUT BRACKET ---------- */
function BracketScreen({ bracket, currentIdx, me, playerAvg, onContinue }) {
  return (
    <div className="stage narrow screen-fade">
      <div className="shead">
        <div><span className="tok">campanha</span><h2 style={{ marginTop: 4 }}>Caminho até o título</h2></div>
        <span className="meta"><Crest className="cr-inline" /> {me.name} · méd {playerAvg}</span>
      </div>

      <div className="bracket">
        {bracket.map((r, i) => {
          const state = r.played ? 'done' : i === currentIdx ? 'current' : 'locked';
          const won = r.played && r.log.result === 'home';
          return (
            <div className={`brow ${state}`} key={r.id}>
              <div className="rlabel">{r.label}<span className="sub">{r.opponent.team} {r.opponent.cup}</span></div>
              <div className="matchup">
                <span className="vsteam"><Flag code={r.opponent.code} />{r.opponent.team}</span>
                {r.played ? (
                  <span className={`rscore ${won ? 'win' : 'loss'}`}>
                    {r.log.score.home}–{r.log.score.away}{r.log.penalties ? ` (${r.log.penalties.home}-${r.log.penalties.away} pen)` : ''}
                  </span>
                ) : (
                  <span className="rscore" style={{ color: 'var(--fg3)' }}>vs · força {r.oppAvg}</span>
                )}
              </div>
              <span className={`rstatus ${state === 'current' ? 'next' : state === 'locked' ? 'locked' : ''}`}>
                {r.played ? (won ? '✓ avançou' : '✕ eliminado') : i === currentIdx ? 'próximo' : 'bloqueado'}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
        <button className="btn btn-yellow" style={{ fontSize: 16, padding: '14px 36px' }} onClick={onContinue}>
          {currentIdx === 0 ? 'Começar pelas oitavas →' : `Disputar ${bracket[currentIdx].short.toLowerCase()} →`}
        </button>
      </div>
    </div>
  );
}

/* ---------- CAMPAIGN END ---------- */
function CampaignEndScreen({ won, me, bracket, unlocked, mode, stats, onRestart }) {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['var(--green-bright)', 'var(--yellow)', 'var(--blue-bright)', '#fff'];
  const unlockedSet = new Set(unlocked || []);
  const [shareMsg, setShareMsg] = useState('');

  function shareData() {
    const played = bracket.filter(r => r.played);
    return {
      champion: won, teamName: me.name, mode,
      path: played.map(r => ({
        short: r.short, opp: r.opponent.team, cup: r.opponent.cup,
        won: r.log.result === 'home',
        score: `${r.log.score.home}\u2013${r.log.score.away}`,
        pen: r.log.penalties ? `${r.log.penalties.home}-${r.log.penalties.away} pen` : null,
      })),
      achCount: unlockedSet.size, achTotal: window.ACHIEVEMENTS.LIST.length,
    };
  }
  async function onDownload() {
    setShareMsg('Gerando imagem\u2026');
    try { await window.SHARECARD.download(shareData(), won ? 'copa-draft-campeao' : 'copa-draft'); setShareMsg('Card baixado \u2713'); }
    catch (e) { setShareMsg('N\u00e3o foi poss\u00edvel gerar.'); }
    setTimeout(() => setShareMsg(''), 2500);
  }
  async function onCopy() {
    const ok = await window.SHARECARD.copySummary(shareData());
    setShareMsg(ok ? 'Resumo copiado \u2713' : 'C\u00f3pia bloqueada pelo navegador');
    setTimeout(() => setShareMsg(''), 2500);
  }

  const pieces = (won && !reduced)
    ? Array.from({ length: 44 }).map((_, i) => ({
        left: Math.random() * 100, bg: colors[i % colors.length],
        delay: Math.random() * 2.5, dur: 2.6 + Math.random() * 2.4,
      })) : [];

  const s = stats || {};
  const awards = [
    s.artilheiro && { icon: '⚽', title: 'Artilheiro', p: s.artilheiro, big: s.artilheiro.goals, meta: `${s.artilheiro.goals} gol(s) em ${s.artilheiro.matches} jogo(s)` },
    s.melhorJogador && { icon: '🏅', title: 'Melhor Jogador', p: s.melhorJogador, big: s.melhorJogador.avg.toFixed(1), meta: `média de nota · ${s.melhorJogador.goals}G ${s.melhorJogador.assists}A` },
    s.melhorGoleiro && { icon: '🧤', title: 'Melhor Goleiro', p: s.melhorGoleiro, big: s.melhorGoleiro.cleanSheets, meta: `${s.melhorGoleiro.cleanSheets} jogo(s) sem sofrer · ${s.melhorGoleiro.saves} defesas` },
    s.maestro && { icon: '🎩', title: 'Maestro', p: s.maestro, big: s.maestro.assists, meta: `${s.maestro.assists} assistência(s)` },
  ].filter(Boolean);

  return (
    <div className="stage narrow screen-fade endwrap">
      {pieces.length > 0 && (
        <div className="confetti" aria-hidden="true">
          {pieces.map((p, i) => (
            <span className="cf" key={i} style={{ left: p.left + '%', background: p.bg, animationDelay: p.delay + 's', animationDuration: p.dur + 's' }}></span>
          ))}
        </div>
      )}
      <div className="trophy">{won ? '🏆' : '🥀'}</div>
      <h1 className={won ? 'win' : ''}>{won ? `${me.name} é Campeão!` : 'Campanha encerrada'}</h1>
      <p className="sub">
        {won
          ? `Você montou um time dos sonhos no dado e levantou a taça. Está escrito na história.`
          : `Seu time dos sonhos caiu antes da glória. O mata-mata é cruel — monte outro elenco e tente de novo.`}
      </p>

      <div className="bracket" style={{ marginTop: 30, textAlign: 'left' }}>
        {bracket.filter(r => r.played).map(r => {
          const w = r.log.result === 'home';
          return (
            <div className={`brow ${w ? 'done' : ''}`} key={r.id}>
              <div className="rlabel">{r.short}</div>
              <div className="matchup">
                <span className="vsteam"><Flag code={r.opponent.code} />{r.opponent.team} {r.opponent.cup}</span>
                <span className={`rscore ${w ? 'win' : 'loss'}`}>{r.log.score.home}–{r.log.score.away}{r.log.penalties ? ` (${r.log.penalties.home}-${r.log.penalties.away} pen)` : ''}</span>
              </div>
              <span className={`rstatus ${w ? '' : ''}`}>{w ? '✓' : '✕'}</span>
            </div>
          );
        })}
      </div>

      <div className="share-row">
        <button className="btn btn-yellow" onClick={onDownload}>📸 Baixar card</button>
        <button className="btn btn-ghost" onClick={onCopy}>📋 Copiar resumo</button>
        <button className="btn btn-green" onClick={onRestart}>↻ Jogar novamente</button>
      </div>
      {shareMsg && <div className="share-msg">{shareMsg}</div>}

      {awards.length > 0 && (
        <>
          <div className="shead" style={{ margin: '40px 0 14px', textAlign: 'left' }}>
            <span className="tok">estatísticas da copa</span>
            <span className="meta">premiações da campanha</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {awards.map((a, i) => (
              <div className="motm" key={i}>
                <span className="badge badge-yellow">{a.icon} {a.title}</span>
                <div className="motm-mid">
                  <div className="nm">{a.p.name}</div>
                  <div className="meta"><PosPill pos={a.p.pos} /> {a.meta}</div>
                </div>
                <span className="rt">{a.big}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="shead" style={{ margin: '40px 0 14px', textAlign: 'left' }}>
        <span className="tok">conquistas</span>
        <span className="meta">{unlockedSet.size}/{window.ACHIEVEMENTS.LIST.length} desbloqueadas</span>
      </div>
      <div className="ach-grid">
        {window.ACHIEVEMENTS.LIST.map(a => {
          const got = unlockedSet.has(a.id);
          return (
            <div className={`ach-card ${got ? 'got' : 'locked'}`} key={a.id}>
              <span className="ach-card-ic">{got ? a.icon : '🔒'}</span>
              <div className="ach-card-tx">
                <span className="ach-card-name">{a.name}</span>
                <span className="ach-card-desc">{a.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { PostMatchScreen, BracketScreen, CampaignEndScreen });
