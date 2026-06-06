/* ============================================================
   COPA DRAFT — lib/achievements.js
   Conquistas (Phase 3). A pure catalog + evaluators.
   - matchAchievements(ctx)    -> ids unlocked by a single match
   - campaignAchievements(ctx) -> ids unlocked at the end (champion/out)
   The app keeps the unlocked Set and shows toasts + an end panel.
   ============================================================ */
(function () {
  // catalog order = display order in the end panel.
  // id + icon are stable; name/desc are localized getters resolved from
  // window.I18N at access time, so they always reflect the current language
  // (the evaluators below never touch presentation).
  const IDS = [
    { id: 'campeao',    icon: '🏆' },
    { id: 'lenda',      icon: '⭐' },
    { id: 'goleada',    icon: '💥' },
    { id: 'muralha',    icon: '🧱' },
    { id: 'artilheiro', icon: '🎩' },
    { id: 'nervos',     icon: '🧊' },
    { id: 'guerreiro',  icon: '⏱️' },
    { id: 'zebra',      icon: '🦓' },
    { id: 'garotada',   icon: '🌱' },
    { id: 'invicto',    icon: '🛡️' },
    { id: 'almanaque',  icon: '📖' },
  ];
  const LIST = IDS.map(a => {
    const o = { id: a.id, icon: a.icon };
    Object.defineProperty(o, 'name', { enumerable: true, get() { return window.I18N.t('ach.' + a.id + '.name'); } });
    Object.defineProperty(o, 'desc', { enumerable: true, get() { return window.I18N.t('ach.' + a.id + '.desc'); } });
    return o;
  });
  const BY_ID = Object.fromEntries(LIST.map(a => [a.id, a]));

  // ctx (match): { won, score:{home,away}, conceded, penalties, extraTime,
  //   homePlayers:[{goals,...}], starters:[{age}], playerAvg, oppAvg }
  function matchAchievements(ctx) {
    const out = [];
    const { won, score, conceded, penalties, extraTime, homePlayers, starters, playerAvg, oppAvg } = ctx;
    if (!won) return out;
    if (score.home >= 7 && conceded === 0) out.push('lenda');
    if (score.home - score.away >= 5) out.push('goleada');
    if (conceded === 0) out.push('muralha');
    if (homePlayers.some(p => p.goals >= 3)) out.push('artilheiro');
    if (penalties) out.push('nervos');
    if (extraTime) out.push('guerreiro');
    if (oppAvg > playerAvg) out.push('zebra');
    if (starters.filter(p => p.age < window.CONFIG.PRESSURE_U_AGE).length >= 3) out.push('garotada');
    return out;
  }

  // ctx (campaign): { champion, history:[{won,extraTime,penalties}], mode }
  function campaignAchievements(ctx) {
    const out = [];
    if (!ctx.champion) return out;
    out.push('campeao');
    if (ctx.history.every(h => h.won && !h.extraTime)) out.push('invicto');
    if (ctx.mode === 'almanaque') out.push('almanaque');
    return out;
  }

  window.ACHIEVEMENTS = { LIST, BY_ID, matchAchievements, campaignAchievements };
})();
