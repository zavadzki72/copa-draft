/* ============================================================
   COPA DRAFT — lib/sharecard.js
   Campaign summary (Phase 4). Builds a plain-text summary of the
   campaign and copies it to the clipboard. The PNG share-card
   (canvas render + download) was removed.
   data = { champion, teamName, mode, path:[{short,opp,cup,score,pen,won}],
            groupStage, achCount, achTotal }
   ============================================================ */
(function () {
  function summaryText(data) {
    const T = (k, v) => window.I18N.t(k, v);
    const lines = [];
    lines.push(`⚽ {copa} draft — ${data.champion ? T('share.champion') : T('share.eliminated')}`);
    lines.push(`${data.teamName} · ${data.mode === 'almanaque' ? T('share.modeAlmanacShort') : T('share.modeClassicShort')}`);
    if (data.groupStage) {
      const status = data.groupStage.qualified ? T('share.groupQualified') : T('share.groupEliminated');
      lines.push(`${data.groupStage.qualified ? '✅' : '❌'} ${T('share.groupResult', { pos: data.groupStage.pos })} (${status})`);
    }
    (data.path || []).forEach(r => lines.push(`${r.won ? '✅' : '❌'} ${r.short}: ${r.opp} ${r.score}${r.pen ? ` (${r.pen} pen)` : ''}`));
    lines.push(`★ ${T('share.achText', { n: data.achCount, total: data.achTotal })}`);
    return lines.join('\n');
  }

  async function copySummary(data) {
    const txt = summaryText(data);
    try { await navigator.clipboard.writeText(txt); return true; }
    catch (e) { return false; }
  }

  window.SHARECARD = { summaryText, copySummary };
})();
