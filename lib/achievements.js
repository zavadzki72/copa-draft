/* ============================================================
   COPA DRAFT — lib/achievements.js
   Conquistas (Phase 3). A pure catalog + evaluators.
   - matchAchievements(ctx)    -> ids unlocked by a single match
   - campaignAchievements(ctx) -> ids unlocked at the end (champion/out)
   The app keeps the unlocked Set and shows toasts + an end panel.
   ============================================================ */
(function () {
  // catalog order = display order in the end panel
  const LIST = [
    { id: 'campeao',    icon: '🏆', name: 'Campeão do Mundo',  desc: 'Levante a taça da Copa.' },
    { id: 'lenda',      icon: '⭐', name: 'Lenda 7 a 0',        desc: 'Vença uma partida por 7 a 0.' },
    { id: 'goleada',    icon: '💥', name: 'Goleada',            desc: 'Vença por 5 gols de diferença.' },
    { id: 'muralha',    icon: '🧱', name: 'Muralha',            desc: 'Vença sem sofrer gols.' },
    { id: 'artilheiro', icon: '🎩', name: 'Chapéu na História', desc: 'Um jogador seu marca 3+ num jogo.' },
    { id: 'nervos',     icon: '🧊', name: 'Nervos de Aço',      desc: 'Vença uma decisão por pênaltis.' },
    { id: 'guerreiro',  icon: '⏱️', name: 'No Sufoco',          desc: 'Vença na prorrogação.' },
    { id: 'zebra',      icon: '🦓', name: 'Zebra',              desc: 'Vença um adversário mais forte na média.' },
    { id: 'garotada',   icon: '🌱', name: 'Aposta na Garotada', desc: 'Vença com 3+ titulares sub-23.' },
    { id: 'invicto',    icon: '🛡️', name: 'Campanha Imbatível',  desc: 'Seja campeão vencendo tudo no tempo normal.' },
    { id: 'almanaque',  icon: '📖', name: 'Mestre do Almanaque', desc: 'Seja campeão no modo De Almanaque.' },
  ];
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
