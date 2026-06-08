/* ============================================================
   COPA DRAFT — ui/post.jsx
   Post-match (hero + modals) and the campaign end (hero + modals).
   Player is always the HOME side. Group matches reuse this screen
   with a draw-aware hero and a "back to the group" next action.
   ============================================================ */
function evLine(p) {
  const bits = [];
  if (p.goals) bits.push(`${p.goals}G`);
  if (p.assists) bits.push(`${p.assists}A`);
  if (p.pos === 'GOL' && p.saves) bits.push(`${p.saves} ${window.I18N.t('ui.post.saveAbbr')}`);
  return bits.join(' · ');
}

function PostMatchScreen({ log, ratings, round, me, group, standings, onNext }) {
  const Modal = window.Modal;
  const C = window.CONFIG;
  const t = (k, v) => window.I18N.t(k, v);
  const [modal, setModal] = useState(null);   // 'notes' | 'goals' | 'group' | null
  const [tab, setTab] = useState('home');

  const isGroup = round.stage === 'group';
  // resolve a team id ('me' or a squad id) for the group modal
  const ginfo = (id) => {
    if (id === 'me') return { name: me ? me.name : log.home.name, dream: true };
    const sq = group && group.rivals.find(x => x.id === id);
    return sq ? { name: sq.team, code: sq.code, cup: sq.cup } : { name: id };
  };
  const won = log.result === 'home';
  const drew = log.result === 'draw';
  const isFinal = round.id === 'final';
  const sweep = won && log.score.home === 7 && log.score.away === 0;
  const goals = log.events.filter(e => e.type === 'goal');
  const motm = ratings.players[ratings.motm];

  const resText = isGroup ? (won ? t('ui.post.win') : drew ? t('ui.post.draw') : t('ui.post.loss'))
    : (won ? t('ui.post.classified') : t('ui.post.eliminated'));
  const resClass = won ? 'win' : (drew ? 'draw' : 'loss');
  const nextLabel = isGroup ? t('ui.post.backToGroup')
    : (!won ? t('ui.post.endCampaign') : isFinal ? t('ui.post.lift') : t('ui.post.nextPhase'));

  const rows = (side) => Object.values(ratings.players).filter(p => p.side === side).sort((a, b) => b.rating - a.rating);

  return (
    <div className="stage narrow screen-fade">
      <div className="shead"><span className="tok">{t('ui.post.tok')}</span><span className="meta">{window.roundText(round, 'label')}</span></div>

      <div className="final-score">
        <div className={`res ${resClass}`}>{resText}</div>
        <div className="big">
          <div>
            <TeamMark code={log.home.code} dream={log.home.dream} />
            <div className="tn">{log.home.name}</div>
          </div>
          <div>
            <span className="sc" style={{ color: won ? 'var(--green-bright)' : 'var(--fg1)' }}>{log.score.home}</span>
            <span className="sc" style={{ color: 'var(--fg3)', margin: '0 8px' }}>–</span>
            <span className="sc" style={{ color: (!won && !drew) ? 'var(--loss)' : 'var(--fg1)' }}>{log.score.away}</span>
          </div>
          <div>
            <Flag code={log.away.code} />
            <div className="tn">{log.away.name}</div>
          </div>
        </div>
        {log.penalties && <div className="pk">{t('ui.post.pens', { home: log.penalties.home, away: log.penalties.away })}</div>}
        {log.extraTime && !log.penalties && <div className="pk">{t('ui.post.afterEt')}</div>}
      </div>

      {sweep && (
        <div className="motm" style={{ background: 'linear-gradient(145deg, rgba(255,223,0,.16), rgba(30,38,31,.5))', borderColor: 'var(--yellow)' }}>
          <span className="badge badge-yellow">★ {t('ui.post.legend')}</span>
          <div className="motm-mid">
            <div className="nm" style={{ color: 'var(--yellow)' }}>{t('ui.post.legendScore')}</div>
            <div className="meta">{t('ui.post.legendDesc')}</div>
          </div>
        </div>
      )}

      {motm && (
        <div className="motm">
          <span className="badge badge-yellow">{t('ui.post.motm')}</span>
          <div className="motm-mid">
            <div className="nm">{motm.name}</div>
            <div className="meta"><PosPill pos={motm.pos} /> {motm.side === 'home' ? log.home.name : log.away.name} · {evLine(motm) || t('ui.post.consistent')}</div>
          </div>
          <span className="rt">{motm.rating.toFixed(1)}</span>
        </div>
      )}

      <div className="post-actions">
        <button className="btn btn-ghost" onClick={() => { setTab('home'); setModal('notes'); }}>{t('ui.post.notesBtn')}</button>
        {goals.length > 0 && <button className="btn btn-ghost" onClick={() => setModal('goals')}>{t('ui.post.goalsBtn', { n: goals.length })}</button>}
        {isGroup && group && standings && <button className="btn btn-ghost" onClick={() => setModal('group')}>{t('ui.post.groupBtn')}</button>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
        <button className="btn btn-green" style={{ fontSize: 16, padding: '14px 36px' }} onClick={onNext}>{nextLabel}</button>
      </div>

      {modal === 'notes' && Modal && (
        <Modal title={t('ui.post.notesTitle')} eyebrow={t('ui.post.notesTok')} onClose={() => setModal(null)}>
          <div className="subtabs">
            <button className={`chip ${tab === 'home' ? 'on' : ''}`} onClick={() => setTab('home')}>{log.home.name}</button>
            <button className={`chip ${tab === 'away' ? 'on' : ''}`} onClick={() => setTab('away')}>{log.away.name}</button>
          </div>
          <div className="ratings-list">
            {rows(tab).map(p => (
              <div className="rrow" key={p.id}>
                <span className="pp">{p.pos}</span>
                <span className="nm">{p.name}
                  {p.id === ratings.motm && <span className="ev">{t('ui.post.star')}</span>}
                  {evLine(p) && <span className="ev">{evLine(p)}</span>}</span>
                <span className={`rt ${ratingClass(p.rating)}`}>{p.rating.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal === 'goals' && Modal && (
        <Modal title={t('ui.post.goalsTitle')} eyebrow={t('ui.post.goalsTok')} onClose={() => setModal(null)}>
          <div className="ratings-list">
            {goals.map((g, i) => {
              const scorer = ratings.players[g.players[0]];
              const assist = g.players[1] ? ratings.players[g.players[1]] : null;
              return (
                <div className="rrow" key={i} style={{ gridTemplateColumns: '46px 1fr auto' }}>
                  <span className="pp" style={{ color: g.side === 'home' ? 'var(--green-bright)' : 'var(--loss)' }}>{g.minute}'</span>
                  <span className="nm">{scorer ? scorer.name : '—'}
                    {assist && <span className="ev">{t('ui.post.assist', { name: assist.name })}</span>}</span>
                  <span className="pp">{g.side === 'home' ? log.home.name : log.away.name}</span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {modal === 'group' && Modal && group && standings && (
        <Modal title={t('ui.post.groupTitle')} eyebrow={t('ui.post.groupTok')} onClose={() => setModal(null)} wide>
          <div className="group-table" style={{ marginBottom: 18 }}>
            <div className="gt-row gt-head">
              <span className="gt-pos"></span><span className="gt-team">{t('ui.post.team')}</span>
              <span>P</span><span>J</span><span>V</span><span>E</span><span>D</span><span>GP</span><span>GC</span><span>SG</span>
            </div>
            {standings.map((r, i) => {
              const gi = ginfo(r.teamRef);
              return (
                <div className={`gt-row ${i < C.GROUP_QUALIFY ? 'qualify' : ''} ${r.teamRef === 'me' ? 'me' : ''}`} key={r.teamRef}>
                  <span className="gt-pos">{i + 1}</span>
                  <span className="gt-team">{gi.dream ? <Crest className="cr-inline" /> : <Flag code={gi.code} />} {gi.name}</span>
                  <span className="gt-p">{r.P}</span><span>{r.J}</span><span>{r.V}</span><span>{r.E}</span><span>{r.D}</span>
                  <span>{r.GP}</span><span>{r.GC}</span><span>{r.SG > 0 ? '+' + r.SG : r.SG}</span>
                </div>
              );
            })}
          </div>
          <div className="shead" style={{ margin: '0 0 8px' }}><span className="tok">{t('ui.post.groupResults')}</span></div>
          <div className="post-group-results">
            {group.fixtures.filter(f => f.result).map((f, i) => {
              const h = ginfo(f.home), a = ginfo(f.away);
              return (
                <div className={`gcal-fx ${f.isPlayer ? 'mine' : ''}`} key={i}>
                  <span className="gcal-h">{h.dream ? <Crest className="cr-inline" /> : <Flag code={h.code} />} {h.name}</span>
                  <span className="gcal-sc">{f.result.home} – {f.result.away}</span>
                  <span className="gcal-a">{a.name} {a.dream ? <Crest className="cr-inline" /> : <Flag code={a.code} />}</span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- KNOCKOUT BRACKET ---------- */
function BracketScreen({ bracket, currentIdx, me, playerAvg, onContinue }) {
  const t = (k, v) => window.I18N.t(k, v);
  return (
    <div className="stage narrow screen-fade">
      <div className="shead">
        <div><span className="tok">{t('ui.bracket.tok')}</span><h2 style={{ marginTop: 4 }}>{t('ui.bracket.title')}</h2></div>
        <span className="meta"><Crest className="cr-inline" /> {me.name} · {t('ui.bracket.avg', { avg: playerAvg })}</span>
      </div>

      <div className="bracket">
        {bracket.map((r, i) => {
          const state = r.played ? 'done' : i === currentIdx ? 'current' : 'locked';
          const won = r.played && r.log.result === 'home';
          return (
            <div className={`brow ${state}`} key={r.id}>
              <div className="rlabel">{window.roundText(r, 'label')}<span className="sub">{r.opponent.team} {r.opponent.cup}</span></div>
              <div className="matchup">
                <span className="vsteam"><Flag code={r.opponent.code} />{r.opponent.team}</span>
                {r.played ? (
                  <span className={`rscore ${won ? 'win' : 'loss'}`}>
                    {r.log.score.home}–{r.log.score.away}{r.log.penalties ? ` (${r.log.penalties.home}-${r.log.penalties.away} pen)` : ''}
                  </span>
                ) : (
                  <span className="rscore" style={{ color: 'var(--fg3)' }}>{t('ui.bracket.vsForce', { avg: r.oppAvg })}</span>
                )}
              </div>
              <span className={`rstatus ${state === 'current' ? 'next' : state === 'locked' ? 'locked' : ''}`}>
                {r.played ? (won ? t('ui.bracket.advanced') : t('ui.bracket.out')) : i === currentIdx ? t('ui.bracket.next') : t('ui.bracket.locked')}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
        <button className="btn btn-yellow" style={{ fontSize: 16, padding: '14px 36px' }} onClick={onContinue}>
          {currentIdx === 0 ? t('ui.bracket.startR16') : t('ui.bracket.play', { round: window.roundText(bracket[currentIdx], 'short').toLowerCase() })}
        </button>
      </div>
    </div>
  );
}

/* ---------- CAMPAIGN END ---------- */
function CampaignEndScreen({ won, me, bracket, unlocked, mode, stats, group, standings, eliminatedInGroup, onRestart }) {
  const Modal = window.Modal;
  const t = (k, v) => window.I18N.t(k, v);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['var(--green-bright)', 'var(--yellow)', 'var(--blue-bright)', '#fff'];
  const unlockedSet = new Set(unlocked || []);
  const [shareMsg, setShareMsg] = useState('');
  const [modal, setModal] = useState(null);   // 'stats' | 'campaign' | 'ach' | null

  const myPos = (standings && standings.length) ? standings.findIndex(r => r.teamRef === 'me') + 1 : 0;

  function shareData() {
    const played = (bracket || []).filter(r => r.played);
    return {
      champion: won, teamName: me.name, mode,
      groupStage: group ? { pos: myPos, qualified: !eliminatedInGroup } : null,
      path: played.map(r => ({
        short: r.short, opp: r.opponent.team, cup: r.opponent.cup,
        won: r.log.result === 'home',
        score: `${r.log.score.home}–${r.log.score.away}`,
        pen: r.log.penalties ? `${r.log.penalties.home}-${r.log.penalties.away} pen` : null,
      })),
      achCount: unlockedSet.size, achTotal: window.ACHIEVEMENTS.LIST.length,
    };
  }
  async function onCopy() {
    const ok = await window.SHARECARD.copySummary(shareData());
    setShareMsg(ok ? t('ui.end.copyOk') : t('ui.end.copyErr'));
    setTimeout(() => setShareMsg(''), 2500);
  }

  const pieces = (won && !reduced)
    ? Array.from({ length: 44 }).map((_, i) => ({
        left: Math.random() * 100, bg: colors[i % colors.length],
        delay: Math.random() * 2.5, dur: 2.6 + Math.random() * 2.4,
      })) : [];

  const s = stats || {};
  const awards = [
    s.artilheiro && { icon: '⚽', title: t('ui.end.awScorer'), p: s.artilheiro, big: s.artilheiro.goals, meta: t('ui.end.awScorerMeta', { goals: s.artilheiro.goals, matches: s.artilheiro.matches }) },
    s.melhorJogador && { icon: '🏅', title: t('ui.end.awBest'), p: s.melhorJogador, big: s.melhorJogador.avg.toFixed(1), meta: t('ui.end.awBestMeta', { g: s.melhorJogador.goals, a: s.melhorJogador.assists }) },
    s.melhorGoleiro && { icon: '🧤', title: t('ui.end.awGk'), p: s.melhorGoleiro, big: s.melhorGoleiro.cleanSheets, meta: t('ui.end.awGkMeta', { cs: s.melhorGoleiro.cleanSheets, saves: s.melhorGoleiro.saves }) },
    s.maestro && { icon: '🎩', title: t('ui.end.awMaestro'), p: s.maestro, big: s.maestro.assists, meta: t('ui.end.awMaestroMeta', { assists: s.maestro.assists }) },
  ].filter(Boolean);

  const playedBracket = (bracket || []).filter(r => r.played);
  const title = won ? t('ui.end.champion', { name: me.name }) : eliminatedInGroup ? t('ui.end.groupOut') : t('ui.end.over');
  const sub = won
    ? t('ui.end.subChampion')
    : eliminatedInGroup
      ? t('ui.end.subGroupOut', { pos: myPos })
      : t('ui.end.subOver');

  // group-table resolver for the campaign modal
  const ginfo = (id) => {
    if (id === 'me') return { name: me.name, dream: true };
    const sq = group && group.rivals.find(x => x.id === id);
    return sq ? { name: sq.team, code: sq.code, cup: sq.cup } : { name: id };
  };

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
      <h1 className={won ? 'win' : ''}>{title}</h1>
      <p className="sub">{sub}</p>

      <div className="share-row">
        <button className="btn btn-ghost" onClick={onCopy}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2"></rect>
            <path d="M5 15V5a2 2 0 0 1 2-2h10"></path>
          </svg>
          {t('ui.end.copy')}
        </button>
        <button className="btn btn-green" onClick={onRestart}>{t('ui.end.restart')}</button>
      </div>
      {shareMsg && <div className="share-msg">{shareMsg}</div>}

      <div className="end-cards">
        {awards.length > 0 && (
          <button className="end-card" onClick={() => setModal('stats')}>
            <span className="ec-ic">🏆</span><span className="ec-tx">{t('ui.end.statsCard')}</span><span className="ec-arrow">→</span>
          </button>
        )}
        {(group || playedBracket.length > 0) && (
          <button className="end-card" onClick={() => setModal('campaign')}>
            <span className="ec-ic">📊</span><span className="ec-tx">{t('ui.end.campaignCard')}</span><span className="ec-arrow">→</span>
          </button>
        )}
        <button className="end-card" onClick={() => setModal('ach')}>
          <span className="ec-ic">🎖️</span><span className="ec-tx">{t('ui.end.achCard', { n: unlockedSet.size, total: window.ACHIEVEMENTS.LIST.length })}</span><span className="ec-arrow">→</span>
        </button>
      </div>

      {modal === 'stats' && Modal && (
        <Modal title={t('ui.end.statsTitle')} eyebrow={t('ui.end.statsTok')} onClose={() => setModal(null)}>
          <p className="p" style={{ marginTop: 0, marginBottom: 14, fontSize: 13 }}>{t('ui.end.statsIntro')}</p>
          <div className="stat-awards">
            {awards.map((a, i) => (
              <div className="stat-award" key={i}>
                <span className="sa-ic">{a.icon}</span>
                <div className="sa-mid">
                  <div className="sa-title">{a.title}</div>
                  <div className="sa-name"><PosPill pos={a.p.pos} /> {a.p.name}</div>
                  <div className="sa-meta">{a.meta}</div>
                </div>
                <span className="sa-big">{a.big}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal === 'campaign' && Modal && (
        <Modal title={t('ui.end.campaignTitle')} eyebrow={t('ui.end.campaignTok')} onClose={() => setModal(null)} wide>
          {group && standings && (
            <>
              <div className="shead" style={{ margin: '0 0 10px' }}><span className="tok">{t('ui.end.groupTok')}</span></div>
              <div className="group-table" style={{ marginBottom: 20 }}>
                <div className="gt-row gt-head">
                  <span className="gt-pos"></span><span className="gt-team">{t('ui.end.team')}</span>
                  <span>P</span><span>J</span><span>V</span><span>E</span><span>D</span><span>GP</span><span>GC</span><span>SG</span>
                </div>
                {standings.map((r, i) => {
                  const t = ginfo(r.teamRef);
                  return (
                    <div className={`gt-row ${i < window.CONFIG.GROUP_QUALIFY ? 'qualify' : ''} ${r.teamRef === 'me' ? 'me' : ''}`} key={r.teamRef}>
                      <span className="gt-pos">{i + 1}</span>
                      <span className="gt-team">{t.dream ? <Crest className="cr-inline" /> : <Flag code={t.code} />} {t.name}</span>
                      <span className="gt-p">{r.P}</span><span>{r.J}</span><span>{r.V}</span><span>{r.E}</span><span>{r.D}</span>
                      <span>{r.GP}</span><span>{r.GC}</span><span>{r.SG > 0 ? '+' + r.SG : r.SG}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {playedBracket.length > 0 && (
            <>
              <div className="shead" style={{ margin: '0 0 10px' }}><span className="tok">{t('ui.end.koTok')}</span></div>
              <div className="bracket" style={{ textAlign: 'left' }}>
                {playedBracket.map(r => {
                  const w = r.log.result === 'home';
                  return (
                    <div className={`brow ${w ? 'done' : ''}`} key={r.id}>
                      <div className="rlabel">{window.roundText(r, 'short')}</div>
                      <div className="matchup">
                        <span className="vsteam"><Flag code={r.opponent.code} />{r.opponent.team} {r.opponent.cup}</span>
                        <span className={`rscore ${w ? 'win' : 'loss'}`}>{r.log.score.home}–{r.log.score.away}{r.log.penalties ? ` (${r.log.penalties.home}-${r.log.penalties.away} pen)` : ''}</span>
                      </div>
                      <span className="rstatus">{w ? '✓' : '✕'}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Modal>
      )}

      {modal === 'ach' && Modal && (
        <Modal title={t('ui.end.achTitle')} eyebrow={t('ui.end.achTok', { n: unlockedSet.size, total: window.ACHIEVEMENTS.LIST.length })} onClose={() => setModal(null)} wide>
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
        </Modal>
      )}
    </div>
  );
}

Object.assign(window, { PostMatchScreen, BracketScreen, CampaignEndScreen });
