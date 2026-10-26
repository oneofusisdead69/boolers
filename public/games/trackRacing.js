// Screens for Track Racing. Server logic: games/trackRacing.js
//
// The track is drawn on canvases: the track itself once (grass is the room's felt showing through),
// skid marks as they're laid, and the cars every frame. The cars' positions arrive 20 times a
// second ('cars' signals); screens draw them a moment behind, sliding between the last two
// updates, so they move smoothly whatever the network does.
//
// Phones are steering wheels. Tilt: the phone's angle in the plane of its screen (worked out from
// gravity, so it's the same held upright like a wheel, sideways in landscape, or tipped back
// toward you), relative to where you hold it level. On iPhones, motion needs a tap to allow it
// (DeviceOrientationEvent.requestPermission). With no tilt (a laptop, or permission refused) there
// are ◀ ▶ buttons, and the arrow keys. Right pedal: gas. Left: brake, and reverse.
(() => {
  const { esc, name } = PB;
  const DELAY = 0.09; // seconds behind the latest update the cars are drawn
  const FULL_LOCK = 40; // degrees of tilt for full steering
  const SEND_GAP = 66; // ms between steering updates to the server

  // ---------- Track drawing ----------

  const css = (v, fallback) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;

  function trackPath(line) {
    const p = new Path2D();
    const n = line.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(line[n - 1], line[0]);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(line[i], line[(i + 1) % n]);
      p.quadraticCurveTo(line[i][0], line[i][1], m[0], m[1]);
    }
    p.closePath();
    return p;
  }

  // The track, the grass beside it and the wall round it (outside the wall is darker).
  function drawStatic(cv, tr, scale) {
    const c = cv.getContext('2d');
    const path = trackPath(tr.line);
    const edge = tr.width / 2 + tr.band;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.clearRect(0, 0, tr.world.w, tr.world.h);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.fillStyle = 'rgba(0, 0, 0, 0.42)';
    c.fillRect(0, 0, tr.world.w, tr.world.h);
    // The wall: tyres in the room's trim colour and black.
    c.lineWidth = edge * 2 + 10;
    c.strokeStyle = css('--rim', '#d8d8d8');
    c.stroke(path);
    c.lineCap = 'butt';
    c.setLineDash([9, 9]);
    c.strokeStyle = '#151515';
    c.stroke(path);
    c.setLineDash([]);
    // Inside the wall, the felt (grass) shows through.
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = edge * 2;
    c.stroke(path);
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = edge * 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    c.stroke(path);
    // Kerbs, the asphalt and its centre line.
    c.lineWidth = tr.width + 9;
    c.strokeStyle = '#f4f4f4';
    c.stroke(path);
    c.setLineDash([12, 12]);
    c.strokeStyle = css('--accent', '#e53950');
    c.stroke(path);
    c.setLineDash([]);
    c.lineWidth = tr.width;
    c.strokeStyle = '#3a3a40';
    c.stroke(path);
    c.lineWidth = tr.width - 16;
    c.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    c.stroke(path);
    c.lineWidth = 2;
    c.setLineDash([14, 18]);
    c.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    c.stroke(path);
    c.setLineDash([]);
    // The start line, chequered, and the grid behind it.
    const [sx, sy, sa] = tr.start;
    c.save();
    c.translate(sx, sy);
    c.rotate(sa);
    const sq = tr.width / 8;
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 8; k++) {
        c.fillStyle = (row + k) % 2 ? '#111' : '#fafafa';
        c.fillRect(-sq + row * sq, -tr.width / 2 + k * sq, sq, sq);
      }
    }
    c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    c.lineWidth = 1.5;
    for (let n = 0; n < 8; n++) {
      const back = 34 + Math.floor(n / 2) * 32;
      const side = (n % 2 ? 1 : -1) * 15;
      c.beginPath();
      c.moveTo(-back + 14, side - 8);
      c.lineTo(-back + 14, side + 8);
      c.stroke();
    }
    c.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
  }

  // A little car, nose along +x, in its driver's colour.
  function drawCar(c, car, look, { label, mine, honk }) {
    const [x, y, a, flags] = car;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.scale(1.2, 1.2);
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundRect(c, -11, -4, 24, 13, 4);
    c.fill();
    c.fillStyle = '#111';
    for (const [wx, wy] of [[-7, -6.5], [7, -6.5], [-7, 6.5], [7, 6.5]]) c.fillRect(wx - 3.5, wy - 2.2, 7, 4.4);
    c.fillStyle = look.color;
    roundRect(c, -12, -6, 24, 12, 4);
    c.fill();
    c.lineWidth = mine ? 2 : 1;
    c.strokeStyle = mine ? '#fff' : 'rgba(0, 0, 0, 0.55)';
    c.stroke();
    c.fillStyle = 'rgba(15, 25, 45, 0.85)';
    roundRect(c, 1.5, -4.5, 5, 9, 1.5);
    c.fill();
    roundRect(c, -8.5, -4, 3, 8, 1);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    c.fillRect(-5, -1, 6, 2);
    if (flags & 8) {
      c.fillStyle = '#ff2a2a';
      c.fillRect(-12.5, -5, 2, 3);
      c.fillRect(-12.5, 2, 2, 3);
    }
    c.restore();
    if (label) {
      c.font = '15px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(look.avatar, x, y - 19);
    }
    if (honk) {
      c.font = 'bold 13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      c.lineWidth = 3;
      c.strokeText('BEEP!', x + 20, y - 26);
      c.fillText('BEEP!', x + 20, y - 26);
    }
  }

  // ---------- Where the cars are ----------

  let snaps = []; // the latest 'cars' updates of this race
  let snapRace = 0;
  let clockOff = null; // local seconds minus race seconds, for the freshest update
  const honked = {}; // id -> local time of their last toot
  let lastMine = { place: 0, lap: 0 };

  function carIds() {
    return PB.state?.game?.carIds || [];
  }

  function carsNow() {
    const g = PB.state?.game;
    if (!g) return [];
    const racing = PB.state.phase === 'race';
    if (!racing || !snaps.length || snapRace !== g.race) return g.cars.c;
    const t = performance.now() / 1000 - clockOff - DELAY;
    let i = snaps.length - 1;
    while (i > 0 && snaps[i].t > t) i--;
    const a = snaps[i];
    const b = snaps[i + 1];
    if (!b) {
      // Past the latest update: carry on a little in the way they were going.
      const p = snaps[i - 1];
      if (!p) return a.c;
      const k = Math.min(0.12, Math.max(0, t - a.t)) / (a.t - p.t || 0.05);
      return a.c.map((c, n) => lerpCar(p.c[n] || c, c, 1 + k));
    }
    const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
    return a.c.map((c, n) => lerpCar(c, b.c[n] || c, f));
  }

  // Between two updates (f from 0 to 1), or a little past the second (f over 1).
  function lerpCar(a, b, f) {
    let da = b[2] - a[2];
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + da * f, b[3], b[4], b[5]];
  }

  // ---------- The canvases on screen ----------

  let views = [];
  let frame = null;

  function attachViews() {
    const s = PB.state;
    const tr = s.game.track;
    views = [...document.querySelectorAll('.tr-stage')].map((el) => {
      const [bg, marks, fg] = el.querySelectorAll('canvas');
      // The TV's stage is a fixed size, zoomed to fit: draw it sharp at twice that.
      const scale = PB.isTV ? 2 : Math.max(0.3, (el.clientWidth / tr.world.w) * (window.devicePixelRatio || 1));
      for (const cv of [bg, marks, fg]) {
        cv.width = Math.round(tr.world.w * scale);
        cv.height = Math.round(tr.world.h * scale);
      }
      drawStatic(bg, tr, scale);
      return { el, fg, marks, scale, mini: el.classList.contains('mini') };
    });
    if (views.length && !frame) frame = requestAnimationFrame(draw);
  }

  function draw() {
    frame = null;
    views = views.filter((v) => v.el.isConnected);
    const s = PB.state;
    if (!views.length || s?.gameType !== 'trackRacing' || !s.game) return;
    const cars = carsNow();
    const ids = carIds();
    const now = performance.now();
    for (const v of views) {
      const c = v.fg.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, v.fg.width, v.fg.height);
      c.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      const m = v.marks.getContext('2d');
      m.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      // The leader on top.
      const order = cars.map((car, i) => i).sort((a, b) => (cars[b][4] || 0) - (cars[a][4] || 0));
      for (const i of order) {
        const car = cars[i];
        const id = ids[i];
        if (!car || !id) continue;
        // Skid marks where the back wheels slide (drifting, or on the grass).
        if (s.phase === 'race' && car[3] & 1) {
          m.fillStyle = car[3] & 2 ? 'rgba(40, 25, 10, 0.18)' : 'rgba(10, 10, 10, 0.22)';
          for (const side of [-6, 6]) {
            m.beginPath();
            m.arc(car[0] - Math.cos(car[2]) * 8 - Math.sin(car[2]) * side, car[1] - Math.sin(car[2]) * 8 + Math.cos(car[2]) * side, 1.8, 0, Math.PI * 2);
            m.fill();
          }
        }
        drawCar(c, car, PB.look(id), { label: !v.mini || PB.isTV, mine: id === s.me && !PB.isTV, honk: now - (honked[id] || -1e9) < 900 });
      }
    }
    frame = requestAnimationFrame(draw);
  }

  function stage(s, { mini = false } = {}) {
    const g = s.game;
    return `<div class="tr-stage ${mini ? 'mini' : ''}" data-race="${g.race}">
      <canvas class="tr-bg"></canvas><canvas class="tr-marks"></canvas><canvas class="tr-fg"></canvas>
      ${countHtml(s)}
    </div>`;
  }

  // 3, 2, 1, GO over the track (and on the wheel).
  function countText(s) {
    if (s.phase === 'countdown') return String(s.game.count);
    if (s.phase === 'race' && (!snaps.length || snaps[snaps.length - 1].t < 1.2)) return 'GO!';
    return '';
  }
  const countHtml = (s) => {
    const text = countText(s);
    return `<div class="tr-count ${text === 'GO!' ? 'go' : ''}" data-count>${text ? `<b>${text}</b>` : ''}</div>`;
  };
  function updateCount(s) {
    const text = countText(s);
    document.querySelectorAll('[data-count]').forEach((el) => {
      if (el.dataset.shown === text) return;
      el.dataset.shown = text;
      el.className = `tr-count ${text === 'GO!' ? 'go' : ''}`;
      el.innerHTML = text ? `<b>${text}</b>` : '';
    });
  }

  // ---------- Standings ----------

  const backers = (s, id) => Object.entries(s.game.bets).filter(([, b]) => b.pick === id).map(([pid]) => pid);
  const fmt = (t) => (t == null ? 'DNF' : `${t.toFixed(1)}s`);

  function placesNow(s) {
    const g = s.game;
    const latest = s.phase === 'race' && snaps.length && snapRace === g.race ? snaps[snaps.length - 1].c : g.cars.c;
    return g.carIds.map((id, i) => ({ id, place: latest[i]?.[4] || i + 1, lap: latest[i]?.[5] || 1, done: !!(latest[i]?.[3] & 4) }))
      .sort((a, b) => a.place - b.place);
  }

  function boardRows(s) {
    const g = s.game;
    return placesNow(s).map((r) => `
      <div class="tr-row ${r.id === s.me && !PB.isTV ? 'me' : ''}">
        <b class="tr-pos">${r.place}</b>${PB.avatar(r.id, 'sm')}<span class="tr-name">${esc(PB.state.players.find((p) => p.id === r.id)?.name || '?')}
          <small class="tr-lap">${r.done ? '🏁 Finished' : s.phase === 'race' ? `Lap ${r.lap}/${g.laps}` : g.wins[r.id] ? `🏆×${g.wins[r.id]}` : ''}</small></span>
        <span class="tr-backers">${backers(s, r.id).map((id) => `${PB.avatar(id, 'sm')}<i>${g.bets[id].sips}</i>`).join('')}</span>
      </div>`).join('');
  }
  const board = (s) => `<div class="card tr-board"><h2>${s.phase === 'betting' ? '💰 The bets' : '🏁 Standings'}</h2><div id="tr-board">${boardRows(s)}</div></div>`;

  let boardKey = '';
  function updateBoard(s) {
    const el = document.getElementById('tr-board');
    if (!el) return;
    const key = JSON.stringify(placesNow(s));
    if (key === boardKey) return;
    boardKey = key;
    el.innerHTML = boardRows(s);
  }

  // ---------- Steering ----------

  const input = { steer: 0, gas: 0, brake: 0 };
  const held = { left: 0, right: 0, kLeft: 0, kRight: 0 };
  let sent = { steer: 0, gas: 0, brake: 0 };
  let lastSend = 0;
  let sendTimer = null;
  const tilt = {
    live: false, // tilt events are arriving
    granted: false, // iPhone: allowed
    denied: false,
    raw: 0, // the phone's angle now (degrees, + = clockwise)
    zero: null, // ...when held level
    listening: false,
  };
  // (An iPhone: tilt needs asking for, and nothing arrives till it's allowed.)
  const needsPermission = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  const canAsk = () => needsPermission() && !tilt.granted && !tilt.denied && !tilt.live;
  let mode = (() => { try { return localStorage.getItem('tr-controls'); } catch { return null; } })(); // 'tilt' | 'buttons' | null
  const useTilt = () => mode !== 'buttons' && tilt.live;
  const setMode = (m) => {
    mode = m;
    try { localStorage.setItem('tr-controls', m); } catch {}
  };

  const driving = () => {
    const s = PB.state;
    return s?.gameType === 'trackRacing' && (s.phase === 'race' || s.phase === 'countdown') && s.game?.racers.includes(s.me) && !PB.isTV;
  };

  // Steering and pedals go to the server when they change, never more than every SEND_GAP ms.
  function pushInput() {
    if (!driving()) return;
    const q = { steer: Math.round(input.steer * 20) / 20, gas: input.gas, brake: input.brake };
    if (q.steer === sent.steer && q.gas === sent.gas && q.brake === sent.brake) return;
    const wait = SEND_GAP - (Date.now() - lastSend);
    if (wait > 0) {
      sendTimer ??= setTimeout(() => { sendTimer = null; pushInput(); }, wait);
      return;
    }
    lastSend = Date.now();
    sent = q;
    PB.act('drive', q);
  }

  function setSteer() {
    const buttons = held.right + held.kRight - held.left - held.kLeft;
    if (useTilt() && !buttons) {
      let d = tilt.raw - (tilt.zero ?? 0);
      d = ((d + 540) % 360) - 180;
      input.steer = Math.abs(d) < 2 ? 0 : Math.max(-1, Math.min(1, d / FULL_LOCK));
    } else {
      input.steer = Math.max(-1, Math.min(1, buttons));
    }
    const wheel = document.getElementById('tr-wheel');
    if (wheel) wheel.style.transform = `rotate(${(input.steer * 100).toFixed(1)}deg)`;
    pushInput();
  }

  // The phone's angle in the plane of its screen. Gravity in the phone's own frame comes from
  // beta (tipped forward or back) and gamma (tipped left or right); turned into the screen's frame
  // (portrait or either landscape) its direction across the screen is the wheel's angle. When the
  // phone is nearly flat that angle would jump about, so the lean counts against a floor instead.
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const r = Math.PI / 180;
    const b = e.beta * r;
    const gm = e.gamma * r;
    const gx = Math.sin(gm) * Math.cos(b);
    const gy = -Math.sin(b);
    const o = (screen.orientation?.angle ?? window.orientation ?? 0) * r;
    const sx = gx * Math.cos(o) - gy * Math.sin(o);
    const sy = gx * Math.sin(o) + gy * Math.cos(o);
    const angle = Math.atan2(sx, Math.max(0.5, -sy)) / r;
    tilt.raw = tilt.zero == null ? angle : tilt.raw + (angle - tilt.raw) * 0.5;
    if (tilt.zero == null) tilt.zero = 0; // straight up is straight on, till you recentre
    if (!tilt.live) {
      tilt.live = true;
      if (PB.state?.gameType === 'trackRacing') PB.rerender();
    }
    setSteer();
  }
  function listen() {
    if (tilt.listening || typeof window.DeviceOrientationEvent === 'undefined') return;
    tilt.listening = true;
    window.addEventListener('deviceorientation', onOrient);
  }
  // iPhone: asked from a tap.
  function askTilt() {
    DeviceOrientationEvent.requestPermission().then((state) => {
      tilt.granted = state === 'granted';
      tilt.denied = !tilt.granted;
      if (tilt.granted) setMode('tilt');
      PB.rerender();
    }).catch(() => { tilt.denied = true; PB.rerender(); });
  }

  // Desktop: arrow keys (or WASD), space for the horn.
  const KEYS = { ArrowLeft: 'kLeft', a: 'kLeft', A: 'kLeft', ArrowRight: 'kRight', d: 'kRight', D: 'kRight', ArrowUp: 'gas', w: 'gas', W: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake' };
  function onKey(e) {
    if (!driving() || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const k = KEYS[e.key];
    const down = e.type === 'keydown' ? 1 : 0;
    if (e.key === ' ' && down && !e.repeat) { e.preventDefault(); PB.act('honk'); return; }
    if (!k) return;
    e.preventDefault();
    if (k === 'gas' || k === 'brake') { input[k] = down; pedalLook(); pushInput(); } else { held[k] = down; setSteer(); }
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  function pedalLook() {
    document.querySelectorAll('[data-pedal]').forEach((el) => el.classList.toggle('on', !!input[el.dataset.pedal]));
  }

  function bindControls() {
    // Each pedal and button follows its own finger (several at once).
    document.querySelectorAll('[data-pedal], [data-steer]').forEach((el) => {
      const set = (v) => {
        if (el.dataset.pedal) { input[el.dataset.pedal] = v; pedalLook(); pushInput(); } else { held[el.dataset.steer] = v; el.classList.toggle('on', !!v); setSteer(); }
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture?.(e.pointerId); } catch {}
        set(1);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => set(0));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  function wheelSvg(s) {
    const look = PB.look(s.me);
    return `<svg class="tr-wheel" id="tr-wheel" viewBox="-50 -50 100 100" aria-hidden="true" style="transform:rotate(${(input.steer * 100).toFixed(1)}deg)">
      <circle r="44" fill="none" stroke="#1d1d22" stroke-width="10"/>
      <circle r="44" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" stroke-dasharray="4 6"/>
      <path d="M -40 4 L -14 8 M 40 4 L 14 8 M 0 16 L 0 41" stroke="#2a2a30" stroke-width="9" stroke-linecap="round"/>
      <rect x="-4" y="-49" width="8" height="10" rx="2" fill="${esc(look.color)}"/>
      <circle r="17" fill="#2a2a30"/><circle r="14" fill="${esc(look.color)}"/>
      <text y="5.5" text-anchor="middle" font-size="16">${esc(look.avatar)}</text>
    </svg>`;
  }

  // The buttons under the wheel: allowing tilt, switching between tilt and buttons, recentring.
  function modeBar() {
    if (useTilt()) return '<button class="secondary tr-small" data-tr="centre">⟲ This is straight</button><button class="secondary tr-small" data-tr="buttons">Use buttons</button>';
    if (canAsk()) return '<button class="tr-enable" data-tr="tilt-enable">🎮 Enable tilt steering</button>';
    return tilt.live ? '<button class="secondary tr-small" data-tr="tilt">📱 Steer by tilting</button>' : '';
  }

  // ---------- Screens ----------

  function hud(s) {
    const g = s.game;
    return `<div class="tr-hud">
      <div class="tr-place"><b id="tr-place">${lastMine.place ? ordinal(lastMine.place) : '–'}</b><small>of ${g.racers.length}</small></div>
      <div class="tr-laps" id="tr-lap">Lap ${lastMine.lap || 1}/${g.laps}</div>
      <button class="tr-horn" data-tr="horn" aria-label="Horn">📯</button>
      ${PB.endButton('end-mini')}
    </div>`;
  }

  const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

  // Portrait: the map (with no TV) over the pedals, the wheel between them. Sideways, held like a
  // wheel: a pedal (or the steering buttons) under each thumb, the map or the wheel in the middle.
  function driveScreen(s) {
    const tiltOn = useTilt();
    const land = PB.landscape();
    const left = tiltOn
      ? '<button class="tr-pedal brake" data-pedal="brake">BRAKE<small>and reverse</small></button>'
      : '<div class="tr-steer"><button class="tr-arrow" data-steer="left" aria-label="Steer left">◀</button><button class="tr-arrow" data-steer="right" aria-label="Steer right">▶</button></div>';
    const right = tiltOn
      ? '<button class="tr-pedal gas" data-pedal="gas">GAS</button>'
      : '<div class="tr-pedals"><button class="tr-pedal brake" data-pedal="brake">BRAKE</button><button class="tr-pedal gas" data-pedal="gas">GAS</button></div>';
    const map = s.tv ? '' : stage(s, { mini: true });
    return `<div class="tr-drive ${tiltOn ? 'tilt' : 'buttons'} ${land ? 'land' : 'port'} ${s.tv ? 'has-tv' : ''}">
      ${hud(s)}
      ${land ? '' : map}
      <div class="tr-cockpit">
        ${left}
        <div class="tr-center">${land ? map : ''}<div class="tr-wheel-box">${wheelSvg(s)}</div>${s.tv || (!land && !map) ? countHtml(s) : ''}</div>
        ${right}
      </div>
      <div class="tr-modes">${modeBar()}</div>
    </div>`;
  }

  // Betting: whose car, and how many sips.
  let draft = null;
  let draftFor = null;
  function bettingScreen(s) {
    const g = s.game;
    if (draftFor !== g.race) { draft = { car: g.myBet?.pick || null, sips: g.myBet?.sips || 1 }; draftFor = g.race; }
    if (draft.car && !g.racers.includes(draft.car)) draft.car = null;
    const changed = !g.myBet || g.myBet.pick !== draft.car || g.myBet.sips !== draft.sips;
    const missing = s.players.filter((p) => p.connected && !g.bets[p.id]);
    const anyBets = Object.keys(g.bets).length > 0;
    const carName = (id) => (id === s.me ? 'your car' : `${esc(name(id))}'s car`);
    return `
      <div class="turn">🏎️ Race ${g.race}<span>${esc(g.track.name)} · ${g.laps} laps · place your bets</span></div>
      ${s.tv ? '' : stage(s, { mini: true })}
      <div class="card tr-place-bet">
        <div class="tr-pick">${g.racers.map((id) => `
          <button class="${draft.car === id ? 'selected' : ''}" data-tr="pick" data-car="${esc(id)}">
            ${PB.avatar(id)}<span>${esc(name(id))}${id === s.me ? ' (you)' : ''}</span>
            <small>${g.wins[id] ? `🏆×${g.wins[id]} ` : ''}${backers(s, id).map((b) => PB.avatar(b, 'sm')).join('')}</small>
          </button>`).join('')}</div>
        <div class="ld-qty">
          <button class="secondary" data-tr="sips" data-step="-1" ${draft.sips <= 1 ? 'disabled' : ''}>−</button>
          <b>${draft.sips}</b>
          <button class="secondary" data-tr="sips" data-step="1" ${draft.sips >= g.maxBet ? 'disabled' : ''}>+</button>
        </div>
        <button data-act="bet" data-car="${esc(draft.car || '')}" data-sips="${draft.sips}" ${draft.car && changed ? '' : 'disabled'}>
          ${!draft.car ? 'Pick a car' : !changed ? `✓ ${PB.plural(g.myBet.sips, 'sip')} on ${carName(g.myBet.pick)}` : `Bet ${PB.plural(draft.sips, 'sip')} on ${carName(draft.car)}`}
        </button>
        <p class="center muted">Lose: drink your bet. Win: hand out ${g.multiplier === 2 ? 'double it' : 'your bet'}.${g.lastSips ? ` Last place drinks ${PB.plural(g.lastSips, 'sip')}.` : ''}</p>
      </div>
      ${g.racers.includes(s.me) ? `<div class="card tr-ready">${tiltNote()}</div>` : ''}
      ${missing.length ? `<p class="center muted">Still betting: ${missing.map((p) => esc(name(p.id))).join(', ')}</p>` : ''}
      ${s.isHost
        ? `<button data-act="startRace" ${anyBets ? '' : 'disabled'} ${missing.length ? `data-confirm="${missing.length} still betting. Start anyway?"` : ''}>${anyBets ? '🚦 Start the race' : 'Waiting for bets'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the race once everyone has bet</p>`}
      ${s.tv ? '' : board(s)}`;
  }

  // Before the race: how you'll steer.
  function tiltNote() {
    if (canAsk()) {
      return '<p>📱 Your phone is the wheel: hold it sideways and tilt to steer.</p><button class="tr-enable" data-tr="tilt-enable">🎮 Enable tilt steering</button>';
    }
    if (tilt.live) return `<p>📱 <b>Tilt steering is on.</b> Hold your phone like a wheel; the right side is gas, the left brakes.</p>${mode === 'buttons' ? '<button class="secondary tr-small" data-tr="tilt">Steer by tilting</button>' : ''}`;
    if (tilt.denied) return '<p>No tilt allowed, so you\'ll steer with ◀ ▶ buttons (or the arrow keys).</p>';
    return '<p>🎮 Steer with ◀ ▶ (or the arrow keys); on a phone, tilt it like a wheel.</p>';
  }

  function watchScreen(s) {
    return `
      <div class="turn">🏎️ Race ${s.game.race}<span>${esc(s.game.track.name)} · you're watching this one</span></div>
      ${stage(s)}
      ${board(s)}`;
  }

  function finishScreen(s) {
    const g = s.game;
    const winner = g.winner;
    const won = backers(s, winner);
    return `
      <div class="drink win tr-winner" style="--pc:${esc(PB.look(winner).color)}"><div class="big">${PB.avatar(winner, 'lg')} ${winner === s.me && !PB.isTV ? 'You win!' : `${esc(name(winner))} wins!`}</div>
        <div class="sips">${won.length ? `Backed by ${won.map((id) => esc(name(id))).join(', ')}` : 'Nobody backed the winner. Everyone drinks!'}</div></div>
      ${s.phase === 'payout' ? PB.handOut(s, `tr${g.race}`) : PB.raceDrinks(s)}
      ${PB.isTV ? '' : s.isHost
        ? `<button data-act="nextRace" ${s.phase === 'payout' ? 'class="secondary" data-confirm="Some winners haven\'t handed out their sips. Start the next race anyway?"' : ''}>🏁 Next race</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the next race…</p>`}
      <div class="card tr-results"><h2>🏁 Race ${g.race}</h2>${g.result.map((r, i) => `
        <div class="tr-row ${r.id === s.me && !PB.isTV ? 'me' : ''}"><b class="tr-pos">${i + 1}</b>${PB.avatar(r.id, 'sm')}<span class="tr-name">${esc(PB.state.players.find((p) => p.id === r.id)?.name || '?')}
          <small class="tr-lap">${fmt(r.time)}${g.last === r.id ? ` · last: 🍺 ${g.lastSips}` : ''}</small></span></div>`).join('')}</div>
      ${s.tv && !PB.isTV ? '' : stage(s)}
      ${PB.isTV ? '' : PB.feed(4)}`;
  }

  // TV: the track and the standings or bets down the left.
  function tvScreen(s) {
    if (s.phase === 'payout' || s.phase === 'results') return finishScreen(s);
    return `
      ${stage(s)}
      ${board(s)}
      ${s.phase === 'betting' ? `<p class="center muted tr-note">🏎️ ${esc(s.game.track.name)} · ${s.game.laps} laps · bet on your phones, then ${esc(name(s.hostId))} starts the race</p>` : ''}`;
  }

  function screenFor(s) {
    if (PB.isTV) return tvScreen(s);
    if (s.phase === 'betting') return bettingScreen(s);
    if (s.phase === 'countdown' || s.phase === 'race') return s.game.racers.includes(s.me) ? driveScreen(s) : watchScreen(s);
    return finishScreen(s);
  }

  // What would change the screen (positions don't: they're drawn into the canvases).
  let lastKey = '';
  function keyOf(s) {
    const g = s.game;
    const live = s.phase === 'countdown' || s.phase === 'race';
    return JSON.stringify([
      live ? 'live' : s.phase, PB.isTV && live ? s.phase : '', g.race, g.racers, g.carIds, s.tv, PB.landscape(),
      live ? useTilt() : '', live ? modeBar() : '',
      live ? null : [g.bets, g.payout, g.drank, g.result, s.players.map((p) => [p.id, p.name, p.connected, p.avatar, p.color]), s.feed.length && s.feed[s.feed.length - 1].id, PB.handOut.alloc],
      PB.isTV && s.phase === 'countdown' ? g.count : '',
      s.phase === 'betting' ? draft : '',
    ]);
  }

  PB.register('trackRacing', {
    reset() {
      snaps = [];
      snapRace = 0;
      clockOff = null;
      draft = null;
      draftFor = null;
      lastKey = '';
      lastMine = { place: 0, lap: 0 };
    },
    // Racing, the phone is all wheel and pedals.
    get fullscreen() {
      return driving();
    },
    stage: '.tr-stage',
    tvTable: false,
    tvStage: '.tr-stage, .tr-board, .tr-note, .tr-winner, .tr-results, .ar-bets, .ar-give, .center.muted',
    tvLeft: '.tr-board, .tr-results, .ar-bets, .ar-give, .center.muted',
    tvBanner: '.tr-winner',
    sounds(prev, s) {
      const g = s.game;
      const p = prev.game;
      if (g.result && !p.result) return ['win'];
      if (s.phase === 'race' && prev.phase === 'countdown') return ['go'];
      if (s.phase === 'countdown' && (prev.phase !== 'countdown' || g.count !== p.count)) return ['beep'];
      return [];
    },
    render(s) {
      listen();
      if (s.phase !== 'race' && s.phase !== 'countdown') {
        // Back to the pedals' resting state between races.
        Object.assign(input, { steer: input.steer, gas: 0, brake: 0 });
        sent = { steer: 0, gas: 0, brake: 0 };
      }
      const key = keyOf(s);
      if (key === lastKey && document.querySelector('.tr-stage, .tr-drive')) {
        updateCount(s);
        updateBoard(s);
        return null;
      }
      lastKey = key;
      boardKey = '';
      return screenFor(s);
    },
    afterRender(s) {
      if (s.game.race !== snapRace) { snaps = []; snapRace = s.game.race; }
      attachViews();
      bindControls();
      if (driving()) setSteer();
      document.querySelectorAll('[data-tr]').forEach((b) => {
        b.onclick = (e) => {
          const what = b.dataset.tr;
          if (what === 'horn') { e.preventDefault(); PB.act('honk'); return; }
          if (what === 'pick') draft.car = b.dataset.car;
          else if (what === 'sips') draft.sips = Math.min(s.game.maxBet, Math.max(1, draft.sips + Number(b.dataset.step)));
          else if (what === 'tilt-enable') return askTilt();
          else if (what === 'buttons') setMode('buttons');
          else if (what === 'tilt') {
            setMode('tilt');
            if (needsPermission() && !tilt.granted) return askTilt();
          } else if (what === 'centre') tilt.zero = tilt.raw;
          lastKey = '';
          PB.rerender();
        };
      });
    },
    // Where the cars are now (20 times a second).
    onCars(d) {
      const s = PB.state;
      if (s?.gameType !== 'trackRacing' || !s.game || d.r !== s.game.race) return;
      if (d.r !== snapRace) { snaps = []; snapRace = d.r; clockOff = null; }
      const now = performance.now() / 1000;
      const off = now - d.t;
      clockOff = clockOff == null || off < clockOff ? off : clockOff + (off - clockOff) * 0.02;
      snaps.push(d);
      if (snaps.length > 40) snaps.shift();
      const ids = carIds();
      const loud = PB.isTV || !s.tv;
      for (const id of d.h || []) {
        honked[id] = performance.now();
        if (loud) window.Prefs?.play('horn');
      }
      if (PB.isTV) { updateBoard(s); updateCount(s); return; }
      if ((d.b || []).includes(s.me)) PB.buzz('hit');
      const mine = d.c[ids.indexOf(s.me)];
      if (mine) {
        if (lastMine.lap && mine[5] > lastMine.lap) PB.buzz();
        if (mine[4] !== lastMine.place || mine[5] !== lastMine.lap) {
          lastMine = { place: mine[4], lap: mine[5] };
          const pl = document.getElementById('tr-place');
          if (pl) pl.textContent = ordinal(mine[4]);
          const lp = document.getElementById('tr-lap');
          if (lp) lp.textContent = mine[3] & 4 ? 'Finished!' : `Lap ${mine[5]}/${s.game.laps}`;
        }
      }
      updateCount(s);
      updateBoard(s);
    },
  });
})();
