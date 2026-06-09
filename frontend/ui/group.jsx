/* ============================================================
   COPA DRAFT — ui/group.jsx
   Group-stage screen: standings table + round-by-round calendar.
   The player plays GROUP_SIZE-1 matches; the rival AI×AI games are
   simulated by the engine. Top GROUP_QUALIFY advance to the knockout.
   ============================================================ */
function GroupStageScreen({ group, standings, groupRound, me, qualify, complete, playerQualified, onPlay, onProceed }) {
  const C = window.CONFIG;
  const t = (k, v) => window.I18N.t(k, v);
  const rounds = C.GROUP_SIZE - 1;

  // resolve a team id ('me' or a squad id) to display info
  const info = (id) => {
    if (id === 'me') return { name: me.name, dream: true };
    const s = group.rivals.find(sq => sq.id === id);
    return s ? { name: s.team, code: s.code, cup: s.cup } : { name: id };
  };
  const Mark = ({ id }) => {
    const t = info(id);
    return t.dream ? <Crest className="cr-inline" /> : <Flag code={t.code} />;
  };

  const myRow = standings.findIndex(r => r.teamRef === 'me');
  const nextOpp = (() => {
    if (complete) return null;
    const fx = group.fixtures.find(f => f.round === groupRound && f.isPlayer);
    if (!fx) return null;
    const oppId = fx.home === 'me' ? fx.away : fx.home;
    return info(oppId);
  })();

  // fixtures grouped by round
  const byRound = [];
  for (let r = 0; r < rounds; r++) byRound.push(group.fixtures.filter(f => f.round === r));

  return (
    <div className="stage narrow screen-fade">
      <div className="shead">
        <div>
          <span className="tok">{t('ui.group.tok')}</span>
          <h2 style={{ marginTop: 4 }}>{t('ui.group.title', { n: C.GROUP_SIZE })}</h2>
        </div>
        <span className="meta">{complete ? t('ui.group.metaDone', { q: qualify }) : t('ui.group.metaRound', { q: qualify, r: groupRound + 1, rounds })}</span>
      </div>

      {/* standings */}
      <div className="group-table" role="table" aria-label={t('ui.group.tableAria')}>
        <div className="gt-row gt-head" role="row">
          <span className="gt-pos"></span>
          <span className="gt-team">{t('ui.group.team')}</span>
          <span>P</span><span>J</span><span>V</span><span>E</span><span>D</span>
          <span>GP</span><span>GC</span><span>SG</span>
        </div>
        {standings.map((r, i) => {
          const t = info(r.teamRef);
          const zona = i < qualify;
          const isMe = r.teamRef === 'me';
          return (
            <div className={`gt-row ${zona ? 'qualify' : ''} ${isMe ? 'me' : ''}`} role="row" key={r.teamRef}>
              <span className="gt-pos">{i + 1}</span>
              <span className="gt-team"><Mark id={r.teamRef} /> {t.name}{t.cup ? <span className="gt-cup">{t.cup}</span> : ''}</span>
              <span className="gt-p">{r.P}</span><span>{r.J}</span><span>{r.V}</span><span>{r.E}</span><span>{r.D}</span>
              <span>{r.GP}</span><span>{r.GC}</span><span>{r.SG > 0 ? '+' + r.SG : r.SG}</span>
            </div>
          );
        })}
      </div>
      <div className="group-legend"><span className="dot-qualify"></span> {t('ui.group.zone', { q: qualify })}</div>

      {/* calendar */}
      <div className="shead" style={{ margin: '26px 0 12px' }}><span className="tok">{t('ui.group.calendar')}</span></div>
      <div className="group-cal">
        {byRound.map((fixtures, r) => (
          <div className={`gcal-round ${!complete && r === groupRound ? 'current' : ''}`} key={r}>
            <div className="gcal-rlabel">{t('ui.group.calRound', { n: r + 1 })}{!complete && r === groupRound ? t('ui.group.yourTurn') : ''}</div>
            {fixtures.map((f, j) => {
              const h = info(f.home), a = info(f.away);
              const played = !!f.result;
              return (
                <div className={`gcal-fx ${f.isPlayer ? 'mine' : ''}`} key={j}>
                  <span className="gcal-h"><Mark id={f.home} /> {h.name}</span>
                  <span className="gcal-sc">{played ? `${f.result.home} – ${f.result.away}` : t('ui.group.toPlay')}</span>
                  <span className="gcal-a">{a.name} <Mark id={f.away} /></span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
        {!complete ? (
          <button className="btn btn-yellow" style={{ fontSize: 16, padding: '14px 36px' }} onClick={onPlay}>
            {nextOpp ? t('ui.group.playVs', { opp: nextOpp.name }) : t('ui.group.playNext')}
          </button>
        ) : (
          <button className={`btn ${playerQualified ? 'btn-green' : 'btn-yellow'}`} style={{ fontSize: 16, padding: '14px 36px' }} onClick={onProceed}>
            {playerQualified ? t('ui.group.toKo') : t('ui.group.seeResult')}
          </button>
        )}
      </div>
      {complete && (
        <p className="p" style={{ textAlign: 'center', marginTop: 14, color: playerQualified ? 'var(--green-bright)' : 'var(--loss)' }}>
          {playerQualified
            ? t('ui.group.advanced', { pos: myRow + 1 })
            : t('ui.group.eliminated', { pos: myRow + 1 })}
        </p>
      )}
    </div>
  );
}

Object.assign(window, { GroupStageScreen });
