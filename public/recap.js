// The end-of-night recap: awards, the games played and who won, the best moments and everyone's
// tab. Shown on every phone and the TV when the host wraps up the night, and saved as an image to
// share.
//
//   Recap.html(s, { tv })   the recap screen for state s (s.recap is the summary from lib/night.js)
//   Recap.share(s)          draws it as an image and opens the phone's share sheet (or downloads it)
(() => {
  const { esc } = PB;
  const name = (s, id) => s.players.find((p) => p.id === id)?.name ?? '???';
  const place = (r) => (r.roomName && r.roomName !== 'Classic' ? `the ${r.roomName.toLowerCase()}` : 'Bool Games');
  const date = (r) => new Date(r.startedAt || Date.now()).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function html(s, { tv = false } = {}) {
    const r = s.recap;
    return `
      <div class="recap ${tv ? 'tv' : ''}">
        <div class="recap-head">
          <h1>Tonight at ${esc(place(r))}</h1>
          <p class="muted">${esc(date(r))} · ${r.totalSips} sips · ${r.games.length} game${r.games.length === 1 ? '' : 's'}</p>
        </div>
        ${r.awards.length ? `<div class="recap-awards">${r.awards.map((a) => `
          <div class="card recap-award"><span class="recap-emoji">${a.emoji}</span><small>${esc(a.title)}</small>
            ${PB.avatar(a.playerId, 'lg')}<b>${esc(name(s, a.playerId))}</b><span class="muted">${esc(a.text)}</span></div>`).join('')}</div>` : ''}
        <div class="recap-cols">
          ${r.games.length ? `<div class="card"><h2>🎲 Games</h2><ul class="recap-list">${r.games.map((g) => `
            <li><b>${esc(g.name)}</b>${g.winnerId ? ` <span class="muted">won by</span> ${PB.avatar(g.winnerId, 'sm')} ${esc(name(s, g.winnerId))}` : ''}</li>`).join('')}</ul></div>` : ''}
          ${r.highlights.length ? `<div class="card"><h2>✨ Moments</h2><ul class="recap-list">${r.highlights.map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul></div>` : ''}
          <div class="card"><h2>🍺 The tab</h2><ul class="recap-list">${r.players.map((p) => `
            <li>${PB.avatar(p.id, 'sm')} ${esc(p.name)} <span class="recap-n">${p.sips}${p.finished ? ` · 🥃×${p.finished}` : ''}${p.water ? ` · 💧${p.water}` : ''}</span></li>`).join('')}</ul></div>
        </div>
        ${tv ? '' : `
          <button id="recap-share">📸 Share the night</button>
          ${s.isHost ? `<div class="recap-host">
            <button class="secondary" data-cmd="recap" data-open="false">Back to the lobby</button>
            <button class="link" data-cmd="newNight" data-confirm="Start a new night? Everyone's tab goes back to zero.">🌙 Start a new night</button>
          </div>` : ''}`}
      </div>`;
  }

  // ---------- The image ----------

  function wrap(c, text, x, y, width, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (c.measureText(test).width > width && line) {
        c.fillText(line, x, y);
        y += lineHeight;
        line = w;
      } else line = test;
    }
    c.fillText(line, x, y);
    return y + lineHeight;
  }

  async function image(s) {
    const r = s.recap;
    const css = getComputedStyle(document.documentElement);
    const v = (k, d) => css.getPropertyValue(`--${k}`).trim() || d;
    const style = window.ROOM_STYLES?.STYLES[s.style];
    const display = style?.font ? `"${style.font}"` : 'system-ui';
    try { await document.fonts.load(`64px ${display}`); } catch {}
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    c.fillStyle = v('bg', '#14111f');
    c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(W / 2, 0, 50, W / 2, 0, 900);
    glow.addColorStop(0, `${v('accent', '#ffcc33')}55`);
    glow.addColorStop(1, 'transparent');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.fillStyle = v('accent', '#ffcc33');
    c.font = `72px ${display}`;
    let y = wrap(c, `Tonight at ${place(r)}`, W / 2, 140, W - 120, 84);
    c.fillStyle = v('muted', '#a59fc2');
    c.font = '34px system-ui, sans-serif';
    c.fillText(`${date(r)} · ${r.totalSips} sips · ${r.games.length} game${r.games.length === 1 ? '' : 's'}`, W / 2, y + 6);
    y += 80;

    // Awards, two to a row.
    c.textAlign = 'left';
    const card = (x, yy, w, h) => {
      c.fillStyle = v('card', '#221d33');
      c.beginPath();
      c.roundRect(x, yy, w, h, 28);
      c.fill();
    };
    r.awards.slice(0, 4).forEach((a, i) => {
      const x = 60 + (i % 2) * 490;
      const yy = y + Math.floor(i / 2) * 170;
      card(x, yy, 470, 150);
      c.font = '64px system-ui, sans-serif';
      c.fillStyle = '#fff';
      c.fillText(a.emoji, x + 28, yy + 96);
      c.fillStyle = v('muted', '#a59fc2');
      c.font = '28px system-ui, sans-serif';
      c.fillText(a.title, x + 120, yy + 50);
      c.fillStyle = v('text', '#fff');
      c.font = 'bold 40px system-ui, sans-serif';
      c.fillText(name(s, a.playerId), x + 120, yy + 96);
      c.fillStyle = v('muted', '#a59fc2');
      c.font = '26px system-ui, sans-serif';
      c.fillText(a.text, x + 120, yy + 130);
    });
    y += Math.ceil(Math.min(4, r.awards.length) / 2) * 170 + 20;

    // Games and moments.
    const lines = [
      ...r.games.slice(-6).map((g) => `${g.name}${g.winnerId ? `: ${name(s, g.winnerId)} won` : ''}`),
      ...r.highlights.slice(0, 4).map((h) => h.text),
    ];
    if (lines.length) {
      const top = y;
      c.font = '32px system-ui, sans-serif';
      let yy = top + 64;
      const height = lines.length * 52 + 60;
      card(60, top, W - 120, Math.min(height, H - top - 140));
      c.fillStyle = v('text', '#fff');
      for (const line of lines) {
        if (yy > H - 170) break;
        yy = wrap(c, line, 100, yy, W - 200, 46) + 6;
      }
      y = Math.min(yy + 10, H);
    }

    // The tab, as much of it as fits.
    const rows = Math.min(r.players.length, Math.floor((H - 150 - y - 70) / 50));
    if (rows > 0) {
      card(60, y, W - 120, rows * 50 + 70);
      c.fillStyle = v('muted', '#a59fc2');
      c.font = '28px system-ui, sans-serif';
      c.fillText("🍺 The tab", 100, y + 46);
      r.players.slice(0, rows).forEach((p, i) => {
        const yy = y + 96 + i * 50;
        c.textAlign = 'left';
        c.fillStyle = v('text', '#fff');
        c.font = '32px system-ui, sans-serif';
        c.fillText(p.name, 100, yy);
        c.textAlign = 'right';
        c.font = 'bold 32px system-ui, sans-serif';
        c.fillText(`${p.sips}${p.finished ? ` · 🥃×${p.finished}` : ''}${p.water ? ` · 💧${p.water}` : ''}`, W - 100, yy);
      });
      c.textAlign = 'left';
    }

    c.textAlign = 'center';
    c.fillStyle = v('accent', '#ffcc33');
    c.font = `44px ${display}`;
    c.fillText('bool.games', W / 2, H - 60);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  async function share(s) {
    const blob = await image(s);
    const file = new File([blob], 'bool-games-tonight.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Tonight on Bool Games' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  window.Recap = { html, image, share };
})();
