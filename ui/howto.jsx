/* ============================================================
   COPA DRAFT — ui/howto.jsx
   "How to play?" — overlay explaining the mechanics and the math.
   ALL numbers are read from window.CONFIG / window.DERIVE at render
   time, so the text never goes stale when balancing changes. The
   prose is localized via window.I18N; numeric {placeholders} in each
   string render as highlight chips. Read-only — never mutates state.
   ============================================================ */
function HowToPlay({ onClose }) {
  const C = window.CONFIG;
  const D = window.DERIVE;
  const t = (k, v) => window.I18N.t(k, v);

  // close on Esc; lock the background scroll while open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // ---- values derived from CONFIG (no hardcode) ----
  const formations = Object.keys(C.FORMATIONS).join(' · ');
  const attrs = D.KEYS.map(k => D.ATTR_FULL[k]).join(', ');
  const zebraPct = Math.round(C.ZEBRA_Z * 100);

  // render a localized string, turning {token} placeholders into highlight
  // chips so the styled numbers survive translation.
  function rich(key, vars) {
    const str = t(key);
    return str.split(/(\{\w+\})/g).map((seg, i) => {
      const m = seg.match(/^\{(\w+)\}$/);
      if (m) return <span className="howto-k" key={i}>{vars && vars[m[1]] != null ? vars[m[1]] : ''}</span>;
      return seg;
    });
  }

  return (
    <div className="howto-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('ui.howto.aria')}>
      <div className="howto-panel" onClick={(e) => e.stopPropagation()}>
        <div className="howto-head">
          <div>
            <span className="tok">{t('ui.howto.tok')}</span>
            <h2>{t('ui.howto.title')}</h2>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label={t('ui.modal.close')} title={t('ui.modal.closeEsc')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <p className="howto-intro">{t('ui.howto.intro')}</p>

        <div className="howto-sec">
          <h3><span className="ic">🎲</span> {t('ui.howto.s1h')}</h3>
          <p>{rich('ui.howto.s1p1', { benchMin: C.BENCH_MIN })}</p>
          <p>{rich('ui.howto.s1p2', { formations })}</p>
          <p>{t('ui.howto.s1p3')}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">📊</span> {t('ui.howto.s2h')}</h3>
          <p>{rich('ui.howto.s2p1', { attrs })}</p>
          <p>{rich('ui.howto.s2p2', { min: C.ATTR_MIN, max: C.ATTR_MAX })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">⚔️</span> {t('ui.howto.s3h')}</h3>
          <p>{t('ui.howto.s3p1')}</p>
          <p className="howto-f">{rich('ui.howto.formula', { base: C.BASE_LAMBDA, exp: C.LAMBDA_EXP })}</p>
          <p>{rich('ui.howto.s3p2', { minutes: C.MINUTES })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🍀</span> {t('ui.howto.s4h')}</h3>
          <p>{rich('ui.howto.s4p1', { z: C.ZEBRA_Z, pct: zebraPct })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🔋</span> {t('ui.howto.s5h')}</h3>
          <p>{rich('ui.howto.s5p1', { oldAge: C.FATIGUE_OLD_AGE, old: C.FATIGUE_OLD, young: C.FATIGUE_YOUNG, max: C.FATIGUE_MAX })}</p>
          <p>{rich('ui.howto.s5p2', { stamina: C.STAMINA_PER_PT, penMax: C.FATIGUE_PENALTY_MAX, subs: C.SUBS_MAX })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🎓</span> {t('ui.howto.s6h')}</h3>
          <p>{rich('ui.howto.s6p1', { uAge: C.PRESSURE_U_AGE, perRound: C.PRESSURE_PER_ROUND })}</p>
          {C.LEADER_HALVES_PRESSURE && <p>{t('ui.howto.s6p2')}</p>}
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🧑‍✈️</span> {t('ui.howto.capH')}</h3>
          <p>{rich('ui.howto.capP1', { cap: C.CAPTAIN_OVR_BOOST })}</p>
          <p>{rich('ui.howto.capP2', { chem: C.CHEMISTRY_OVR_BOOST })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🟥</span> {t('ui.howto.s7h')}</h3>
          <p>{t('ui.howto.s7p1')}</p>
          <p>{rich('ui.howto.s7p2', { atk: Math.round((1 - C.MAN_DOWN_ATK) * 100), def: Math.round((1 - C.MAN_DOWN_DEF) * 100) })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🚑</span> {t('ui.howto.s8h')}</h3>
          <p>{rich('ui.howto.s8p1', { pct: Math.round((1 - Math.pow(1 - C.INJURY_PM, C.MINUTES)) * 100) })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">⏱️</span> {t('ui.howto.s9h')}</h3>
          <p>{rich('ui.howto.s9p1', { etMin: C.ET_MINUTES, pkRounds: C.PK_ROUNDS })}</p>
          <p>{t('ui.howto.s9p2')}</p>
          <p>{rich('ui.howto.s9p3', { penPct: Math.round(C.PEN_CONVERT_BASE * 100) })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">⭐</span> {t('ui.howto.s10h')}</h3>
          <p>{rich('ui.howto.s10p1', { base: C.RATING_BASE })}</p>
          <ul>
            <li>{rich('ui.howto.s10li1', { goal: C.RATING_GOAL, assist: C.RATING_ASSIST })}</li>
            <li>{rich('ui.howto.s10li2', { save: C.RATING_SAVE, bigchance: C.RATING_BIGCHANCE })}</li>
            <li>{rich('ui.howto.s10li3', { concede: C.RATING_CONCEDE })}</li>
          </ul>
          <p>{rich('ui.howto.s10p2', { min: C.RATING_MIN, max: C.RATING_MAX })}</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🏆</span> {t('ui.howto.s11h')}</h3>
          <p>{rich('ui.howto.s11p1', { count: window.ACHIEVEMENTS.LIST.length })}</p>
        </div>

        <div className="howto-foot">
          <button className="btn btn-green" onClick={onClose}>{t('ui.howto.foot')}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HowToPlay });
