/* ============================================================
   COPA DRAFT — lib/sharecard.js
   Share card (Phase 4). Renders a portrait PNG of the campaign
   on a canvas (no external assets) and offers download + a text
   summary copy. Colors pulled from the design tokens.
   data = { champion, teamName, mode, path:[{short,opp,cup,score,pen,won}],
            achCount, achTotal, bestName }
   ============================================================ */
(function () {
  const W = 1080, H = 1350;
  const GREEN = '#00A859', GREENB = '#2BD97B', YELLOW = '#FFDF00',
        BG = '#0D120E', S1 = '#151B16', S2 = '#1E261F', FG = '#F2F5F1', FG3 = '#7E8A80',
        LOSS = '#E5484D', HAIR = '#2A352B';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function render(data) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}

    // bg
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#10160F'); bg.addColorStop(1, BG);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // faint radial glow
    const glow = ctx.createRadialGradient(W / 2, 250, 50, W / 2, 250, 700);
    glow.addColorStop(0, 'rgba(0,168,89,0.18)'); glow.addColorStop(1, 'rgba(0,168,89,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    // top rail
    const rail = ctx.createLinearGradient(0, 0, W, 0);
    rail.addColorStop(0, GREEN); rail.addColorStop(0.6, GREENB); rail.addColorStop(1, YELLOW);
    ctx.fillStyle = rail; ctx.fillRect(0, 0, W, 12);

    const champ = data.champion;
    const accent = champ ? YELLOW : LOSS;

    // wordmark
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 38px Archivo, sans-serif';
    const wmX = 80;
    ctx.fillStyle = GREENB; ctx.fillText('{', wmX, 112);
    ctx.fillStyle = FG; ctx.fillText(' copa ', wmX + 22, 112);
    ctx.fillStyle = GREENB; ctx.fillText('}', wmX + 168, 112);
    ctx.fillStyle = FG3; ctx.font = '500 26px Archivo, sans-serif';
    ctx.fillText('draft', wmX + 200, 112);

    // crest
    const cx = W / 2, cy = 300, cs = 150;
    rr(ctx, cx - cs / 2, cy - cs / 2, cs, cs, 28);
    const cg = ctx.createLinearGradient(cx - cs / 2, cy - cs / 2, cx + cs / 2, cy + cs / 2);
    cg.addColorStop(0, '#0B7C43'); cg.addColorStop(1, GREEN);
    ctx.fillStyle = cg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.stroke();
    // star
    ctx.fillStyle = YELLOW; star(ctx, cx, cy, 5, 46, 20); ctx.fill();

    // title
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = '700 92px Archivo, sans-serif';
    ctx.fillText(champ ? 'CAMPEÃO' : 'ELIMINADO', cx, 500);
    ctx.fillStyle = FG; ctx.font = '600 46px Archivo, sans-serif';
    ctx.fillText(data.teamName, cx, 565);
    ctx.fillStyle = FG3; ctx.font = '500 28px Archivo, sans-serif';
    const modeTxt = data.mode === 'almanaque' ? 'modo De Almanaque' : 'modo Clássico';
    ctx.fillText('campanha de mata-mata · ' + modeTxt, cx, 610);

    // path rows
    let y = 690;
    (data.path || []).forEach(r => {
      rr(ctx, 80, y, W - 160, 96, 18);
      ctx.fillStyle = S1; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = r.won ? 'rgba(0,168,89,.45)' : 'rgba(229,72,77,.4)'; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = GREENB; ctx.font = '600 30px Archivo, sans-serif';
      ctx.fillText(r.short, 110, y + 58);
      ctx.fillStyle = FG; ctx.font = '500 30px Archivo, sans-serif';
      ctx.fillText(`${r.opp} ${r.cup || ''}`.trim(), 320, y + 58);
      ctx.textAlign = 'right';
      ctx.fillStyle = r.won ? GREENB : LOSS; ctx.font = '700 34px Archivo, sans-serif';
      const sc = r.score + (r.pen ? ` (${r.pen})` : '');
      ctx.fillText(sc, W - 110, y + 58);
      y += 112;
    });

    // achievements footer chip
    y += 6;
    rr(ctx, 80, y, W - 160, 92, 18);
    ctx.fillStyle = S2; ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = '34px Archivo, sans-serif'; ctx.fillStyle = YELLOW;
    ctx.fillText('★', 116, y + 58);
    ctx.fillStyle = FG; ctx.font = '600 30px Archivo, sans-serif';
    ctx.fillText(`${data.achCount} de ${data.achTotal} conquistas desbloqueadas`, 160, y + 58);

    // footer
    ctx.textAlign = 'center'; ctx.fillStyle = FG3; ctx.font = '500 24px Archivo, sans-serif';
    ctx.fillText('monte o time dos sonhos no dado · ganhe a Copa', cx, H - 50);

    return cv;
  }

  function star(ctx, cx, cy, spikes, outer, inner) {
    let rot = -Math.PI / 2, step = Math.PI / spikes;
    ctx.beginPath(); ctx.moveTo(cx, cy - outer);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outer, yv = cy + Math.sin(rot) * outer; ctx.lineTo(x, yv); rot += step;
      x = cx + Math.cos(rot) * inner; yv = cy + Math.sin(rot) * inner; ctx.lineTo(x, yv); rot += step;
    }
    ctx.lineTo(cx, cy - outer); ctx.closePath();
  }

  async function download(data, filename) {
    const cv = await render(data);
    cv.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = (filename || 'copa-draft') + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  function summaryText(data) {
    const lines = [];
    lines.push(`⚽ {copa} draft — ${data.champion ? '🏆 CAMPEÃO!' : 'eliminado'}`);
    lines.push(`${data.teamName} · ${data.mode === 'almanaque' ? 'De Almanaque' : 'Clássico'}`);
    (data.path || []).forEach(r => lines.push(`${r.won ? '✅' : '❌'} ${r.short}: ${r.opp} ${r.score}${r.pen ? ` (${r.pen} pen)` : ''}`));
    lines.push(`★ ${data.achCount}/${data.achTotal} conquistas`);
    return lines.join('\n');
  }

  async function copySummary(data) {
    const txt = summaryText(data);
    try { await navigator.clipboard.writeText(txt); return true; }
    catch (e) { return false; }
  }

  window.SHARECARD = { render, download, summaryText, copySummary };
})();
