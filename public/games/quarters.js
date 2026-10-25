// Screens for Quarters. Server logic: games/quarters.js
//
// Everyone sees the table in 3D from the shooter's end, the glass down the far end (on the TV when
// there is one). The shooter also gets the pad, with a quarter: drag to line it up, flick up to
// throw. The quarter flies in, bounces off the table, and drops in the glass (or doesn't).
(() => {
  const { esc, name } = PB;
  const IDEAL_SPEED = 2.5; // a perfect flick crosses this many screen heights per second

  // ---------- The table, in 3D ----------
  // Table units (x across, d away from you; the glass at d = 1) to the picture, 360 × 260, and how
  // big things are there.
  const view = (x, d) => {
    const f = 1 / (1 + d * 0.6);
    return { x: 180 + x * 420 * f, y: 250 - (1 - f) * 380, f };
  };

  let shown = 0; // the last throw drawn flying in
  function table(s) {
    const g = s.game;
    const glass = view(0, 1);
    const rx = g.glassR * 420 * glass.f;
    const ry = rx * 0.45;
    const h = (g.glass === 'shot' ? 60 : 120) * glass.f * (g.glass === 'shot' ? 1 : 0.9);
    const base = rx * (g.glass === 'shot' ? 0.75 : 0.7);
    const top = glass.y - h;
    const pct = (x, d) => { const p = view(x, d); return `${((p.x / 360) * 100).toFixed(2)}% ${((p.y / 260) * 100).toFixed(2)}%`; };
    const felt = `<div class="qt-felt" style="clip-path:polygon(${pct(-0.6, -0.1)}, ${pct(0.6, -0.1)}, ${pct(0.6, 1.25)}, ${pct(-0.6, 1.25)})"></div>`;
    const corner = (x, d) => { const p = view(x, d); return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; };
    // The quarter: where the last one came down (in the glass, or on the table), flying in if new.
    let coin = '';
    const L = g.last;
    if (L) {
      const end = L.hit ? { x: glass.x + L.x * 120 * glass.f, y: top + ry * 0.6, f: glass.f } : view(L.x, L.d);
      const bounce = view(L.x * 0.6, Math.max(0.2, L.d * 0.55));
      const fresh = L.n !== shown;
      coin = `<g transform="translate(${end.x.toFixed(1)} ${end.y.toFixed(1)})"><g class="qt-coin ${fresh ? 'fresh' : ''} ${L.hit ? 'in' : ''}"
        style="--sx:${(180 - end.x).toFixed(1)}px;--sy:${(290 - end.y).toFixed(1)}px;--bx:${(bounce.x - end.x).toFixed(1)}px;--by:${(bounce.y - end.y).toFixed(1)}px">
        <ellipse rx="${(9 * end.f).toFixed(1)}" ry="${(4 * end.f).toFixed(1)}" fill="#c8ccd2" stroke="#8a9098" stroke-width="1"/></g></g>`;
    }
    const aim = g.aim != null && s.phase === 'shooting' ? view(g.aim, 1) : null;
    return `<div class="qt-view">${felt}<svg viewBox="0 0 360 260" aria-label="The table and the glass">
      <defs><linearGradient id="qt-glass" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.2" stop-color="#fff" stop-opacity="0.08"/>
        <stop offset="0.7" stop-color="#fff" stop-opacity="0.05"/><stop offset="0.85" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0.1"/></linearGradient>
        <linearGradient id="qt-beer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4c430"/><stop offset="1" stop-color="#c8871a"/></linearGradient></defs>
      <path d="M${corner(-0.6, -0.1)} L${corner(-0.6, 1.25)} L${corner(0.6, 1.25)} L${corner(0.6, -0.1)}" class="bp-edge"/>
      <ellipse cx="${glass.x}" cy="${glass.y}" rx="${base * 1.2}" ry="${ry * 0.7}" fill="rgba(0,0,0,0.35)"/>
      <path d="M${glass.x - rx * 0.92} ${top + h * 0.35} L${glass.x - base} ${glass.y} A${base} ${ry * 0.7} 0 0 0 ${glass.x + base} ${glass.y} L${glass.x + rx * 0.92} ${top + h * 0.35} Z" fill="url(#qt-beer)" opacity="0.9"/>
      <ellipse cx="${glass.x}" cy="${top + h * 0.35}" rx="${rx * 0.92}" ry="${ry * 0.9}" fill="#fff6dc" opacity="0.9"/>
      <path d="M${glass.x - rx} ${top} L${glass.x - base} ${glass.y} A${base} ${ry * 0.7} 0 0 0 ${glass.x + base} ${glass.y} L${glass.x + rx} ${top} Z" fill="url(#qt-glass)" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>
      <ellipse cx="${glass.x}" cy="${top}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1.6"/>
      ${coin}
      ${aim ? `<path id="qt-aim" class="qt-aim" d="M180 255 L${aim.x.toFixed(1)} ${aim.y.toFixed(1)}"/>` : '<path id="qt-aim" class="qt-aim" d=""/>'}
    </svg></div>`;
  }

  // ---------- Throwing ----------
  let aimState = { key: '', x: 0 };
  function localAim(s) {
    const key = `${s.game.turnId}:${s.game.last?.n || 0}`;
    if (aimState.key !== key) aimState = { key, x: s.game.aim ?? 0 };
    return aimState;
  }
  let feedback = '';

  function pad(s) {
    return `<div class="dt-pad qt-pad" id="qt-pad">
      <p class="dt-hint">Drag to line up · flick up to bounce it</p>
      <p class="dt-readout" id="qt-readout">${esc(feedback || (s.game.streak ? `${s.game.streak} in a row!` : 'Your quarter'))}</p>
      <svg class="dt-held qt-held" id="qt-held" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#c8ccd2" stroke="#8a9098" stroke-width="2"/><circle cx="20" cy="20" r="12" fill="none" stroke="#9aa0a8" stroke-width="1.5"/><text x="20" y="25" font-size="13" text-anchor="middle" fill="#6a7078" font-weight="700">25¢</text></svg>
    </div>`;
  }

  let lastSent = 0;
  function sendAim(force) {
    const now = Date.now();
    if (!force && now - lastSent < 90) return;
    lastSent = now;
    PB.act('aim', { x: +aimState.x.toFixed(3) });
  }
  function showAim(x) {
    const p = view(x, 1);
    document.getElementById('qt-aim')?.setAttribute('d', `M180 255 L${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }

  function setupPad() {
    const el = document.getElementById('qt-pad');
    const held = document.getElementById('qt-held');
    if (!el) return;
    let hist = [];
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      start = { x: e.clientX, y: e.clientY, ax: aimState.x };
      hist = [{ t: e.timeStamp, x: e.clientX, y: e.clientY, ax: aimState.x }];
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      aimState.x = Math.max(-0.6, Math.min(0.6, start.ax + ((e.clientX - start.x) * 1.2) / el.clientWidth));
      hist.push({ t: e.timeStamp, x: e.clientX, y: e.clientY, ax: aimState.x });
      if (hist.length > 40) hist.shift();
      if (held) held.style.transform = `translate(${e.clientX - start.x}px, ${Math.min(0, e.clientY - start.y) * 0.3}px)`;
      feedback = '';
      showAim(aimState.x);
      sendAim(false);
    });
    const release = (e) => {
      if (!start) return;
      start = null;
      const now = e.timeStamp;
      const end = hist[hist.length - 1];
      const from = hist.find((h) => h.t >= now - 90) || hist[0];
      const dt = Math.max(1, end.t - from.t);
      const vx = (end.x - from.x) / dt;
      const vy = (end.y - from.y) / dt;
      if (vy < -0.5 && from.y - end.y > 30) {
        // Lined up where it was before the flick started moving it.
        let i = hist.length - 1;
        while (i > 0 && hist[i].y < hist[i - 1].y - 2) i--;
        aimState.x = hist[i].ax;
        const angle = (Math.atan2(vx, -vy) * 180) / Math.PI;
        const speed = (-vy * 1000) / window.innerHeight / IDEAL_SPEED;
        const lean = Math.abs(angle) > 3 ? `, leaning ${Math.round(Math.abs(angle))}° ${angle > 0 ? 'right' : 'left'}` : ', dead straight';
        feedback = `${Math.abs(speed - 1) < 0.05 ? 'Perfect bounce' : speed < 1 ? `Too soft (${Math.round(speed * 100)}%)` : `Too hard (${Math.round(speed * 100)}%)`}${lean}`;
        if (held) {
          held.style.transition = 'transform 0.3s ease-in, opacity 0.3s';
          held.style.transform = `translate(${vx * 60}px, -${el.clientHeight}px) scale(0.4)`;
          held.style.opacity = '0';
        }
        PB.buzz();
        PB.act('throw', { x: +aimState.x.toFixed(3), angle: +angle.toFixed(1), speed: +speed.toFixed(3) });
      } else {
        if (held) held.style.transform = '';
        sendAim(true);
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  // ---------- Screens ----------

  function scores(s) {
    const g = s.game;
    return `<div class="card qt-scores"><h2>Round ${Math.min(g.round, g.rounds)} of ${g.rounds}</h2>${g.order.filter((id) => s.players.some((p) => p.id === id)).map((id) => `
      <div class="qt-score ${id === g.turnId ? 'up' : ''}">${PB.avatar(id, 'sm')}<span class="qt-name">${esc(name(id))}</span><b>${g.sinks[id] || 0} 🪙</b></div>`).join('')}</div>`;
  }

  function lastLine(s) {
    const g = s.game;
    const L = g.last;
    // (Your own: "You miss", not "You misses".)
    const me = (id) => id === s.me && !PB.passAndPlay;
    if (!L) return `<p class="qt-last muted">${me(g.turnId) ? 'You’re' : `${esc(name(g.turnId))} is`} up first</p>`;
    const who = esc(name(L.by));
    const verb = (you, them) => (me(L.by) ? you : them);
    return `<p class="qt-last ${L.hit ? 'hit' : ''}">${L.hit ? `🪙 ${who} ${verb('sink', 'sinks')} it!` : L.rim ? `😩 ${who} ${verb('rim', 'rims')} it` : `💨 ${who} ${verb('miss', 'misses')}`}</p>`;
  }

  function middle(s) {
    const g = s.game;
    if (s.phase !== 'give') return '';
    const rule = g.rule === g.last?.n ? '<div class="drink win"><div class="big">📜 Three in a row!</div><div class="sips">Make a rule</div></div>' : '';
    const mine = g.turnId === s.me && !PB.isTV;
    return `${rule}${mine
      ? `<div class="card"><p class="center"><b>Sunk it! Who drinks ${PB.plural(g.sips, 'sip')}?</b></p>${PB.playerPicker('give', { exclude: [s.me] })}</div>`
      : `<p class="center muted qt-wait">${esc(name(g.turnId))} is picking who drinks…</p>`}`;
  }

  function render(s) {
    const g = s.game;
    if (s.phase === 'over') {
      return `<div class="drink win"><div class="big">🏆 ${g.winners.map((id) => esc(name(id))).join(' & ')} ${g.winners.length > 1 ? 'tie' : 'wins'}!</div>
        <div class="sips">${g.sinks[g.winners[0]] || 0} quarters in</div></div>${scores(s)}${PB.feed(4)}`;
    }
    const mine = g.turnId === s.me && s.phase === 'shooting' && !PB.isTV;
    const showTable = PB.isTV || !s.tv || mine;
    return `
      ${PB.turn(g.turnId, g.streak ? `${g.streak} in a row` : `Round ${g.round} of ${g.rounds}`)}
      ${showTable ? table(s) : ''}
      ${lastLine(s)}
      ${mine ? pad(s) : ''}
      ${middle(s)}
      ${scores(s)}
      ${mine ? '' : PB.feed(3)}`;
  }

  let lastKey = '';
  const keyOf = (s) => JSON.stringify([s.phase, s.tv, PB.landscape(), { ...s.game, aim: null }, s.players.map((p) => [p.id, p.connected, p.drinks])]);

  PB.register('quarters', {
    reset() {
      aimState = { key: '', x: 0 };
      feedback = '';
      lastKey = '';
      shown = 0;
    },
    stage: '.qt-view',
    tvTable: false,
    tvStage: '.qt-view, .qt-last, .drink, .qt-wait, .qt-scores',
    tvLeft: '.qt-scores',
    sounds(prev, s) {
      const n = s.game.last?.n;
      if (!n || n === prev.game.last?.n) return [];
      return s.game.last.hit ? ['bell'] : ['dice'];
    },
    render(s) {
      // Lining up only moves the aim line (and mustn't interrupt the shooter's drag).
      const key = keyOf(s);
      if (key === lastKey && document.getElementById('qt-pad')) return null;
      lastKey = key;
      localAim(s);
      return render(s);
    },
    afterRender(s) {
      setupPad();
      // Yours went in: a little buzz as it drops.
      const L = s.game.last;
      if (L && L.n !== shown && L.hit && L.by === s.me && !PB.isTV) setTimeout(() => PB.buzz('hit'), 900);
      if (s.game.last) setTimeout(() => { shown = s.game.last.n; }, 50);
    },
    onAim(aim) {
      const s = PB.state;
      if (!s?.game || s.phase !== 'shooting') return;
      s.game.aim = aim.x;
      if (s.game.turnId === s.me && !PB.isTV) return;
      showAim(aim.x);
    },
  });
})();
