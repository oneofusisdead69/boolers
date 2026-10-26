// Screens for Track Racing. Server logic: games/trackRacing.js
//
// The TV shows the whole track from above. The track is drawn on canvases: the track itself once
// (grass is the room's felt showing through), skid marks as they're laid, and the cars every
// frame. The cars' positions arrive 20 times a second ('cars' signals); screens draw them a moment
// behind, sliding between the last two updates, so they move smoothly whatever the network does.
//
// Phones show the race from their own car: a chase cam just behind and above it, looking down the
// track, like an arcade racer. That's WebGL: the same top-down track, painted once into a texture,
// is the ground (each pixel below the horizon traced back to the spot on the ground it shows, so
// there's no geometry to it), and the barriers, the scenery and the cars are little 3D models.
// Names (avatars) and the hooting go on a 2D canvas over it. With no WebGL, a top-down map that
// turns with the car stands in.
//
// Phones are steering wheels. Tilt: the phone's angle in the plane of its screen (worked out from
// gravity, so it's the same held upright like a wheel, sideways in landscape, or tipped back
// toward you), relative to where you hold it level. On iPhones, motion needs a tap to allow it
// (DeviceOrientationEvent.requestPermission). With no tilt (a laptop, or permission refused) there
// are ◀ ▶ buttons, and the arrow keys. Right half of the screen: gas. Left: brake, and reverse.
(() => {
  const { esc, name } = PB;
  const DELAY = 0.09; // seconds behind the latest update the cars are drawn
  const FULL_LOCK = 40; // degrees of tilt for full steering
  const SEND_GAP = 66; // ms between steering updates to the server
  const BARRIER = 7; // the tyre wall stands this far past the edge the cars bounce off

  // ---------- Colours ----------

  const css = (v, fallback) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;
  // '#rrggbb' (or '#rgb') to [r, g, b] from 0 to 1.
  function rgb(hex, fallback = [0.5, 0.5, 0.5]) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return fallback;
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
  // The room's felt is a CSS background (gradients, stripes): its plain colours, for the grass.
  function feltColours() {
    const list = (css('--felt', '').match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map((h) => rgb(h));
    return list.length ? list : [[0.25, 0.56, 0.31], [0.18, 0.48, 0.24], [0.14, 0.37, 0.19]];
  }
  // The colours the track is painted in, from the room's look (read once per track drawn).
  function palette() {
    return { accent: css('--accent', '#e53950'), rim: css('--rim', '#d8d8d8'), bg: rgb(css('--bg', '#14111f')), card: rgb(css('--card', '#221d33')), card2: rgb(css('--card-2', '#2d2644')), accentRgb: rgb(css('--accent', '#e53950')), felt: feltColours() };
  }

  // The same random scenery on every screen.
  function seeded(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- The track's shape ----------

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

  // The centreline every 10 units or so (the curve trackPath draws), which way it's going, how
  // hard it's bending, where the barriers stand and the scenery round it. Worked out once a track.
  const shapes = {};
  function shapeOf(tr) {
    const key = `${tr.id}:${tr.line.length}`;
    if (shapes[key]) return shapes[key];
    const L = tr.line;
    const n = L.length;
    const xs = [];
    const ys = [];
    for (let i = 0; i < n; i++) {
      const p0 = L[(i - 1 + n) % n];
      const p1 = L[i];
      const p2 = L[(i + 1) % n];
      const ax = (p0[0] + p1[0]) / 2;
      const ay = (p0[1] + p1[1]) / 2;
      const bx = (p1[0] + p2[0]) / 2;
      const by = (p1[1] + p2[1]) / 2;
      for (const t of [0, 0.5]) {
        const u = 1 - t;
        xs.push(u * u * ax + 2 * u * t * p1[0] + t * t * bx);
        ys.push(u * u * ay + 2 * u * t * p1[1] + t * t * by);
      }
    }
    const N = xs.length;
    const at = (i) => ((i % N) + N) % N;
    const head = xs.map((x, i) => Math.atan2(ys[at(i + 1)] - ys[at(i - 1)], xs[at(i + 1)] - xs[at(i - 1)]));
    // The right-hand side of the road (going round), and how much it turns over the next few metres
    // either side (+ = to the right).
    const nx = head.map((a) => -Math.sin(a));
    const ny = head.map((a) => Math.cos(a));
    const bend = head.map((a, i) => {
      const d = head[at(i + 2)] - head[at(i - 2)];
      return Math.atan2(Math.sin(d), Math.cos(d));
    });
    const near = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < N; i++) best = Math.min(best, (xs[i] - x) ** 2 + (ys[i] - y) ** 2);
      return Math.sqrt(best);
    };
    const edge = tr.width / 2 + tr.band;
    // The barriers either side, except where one would fold back on itself (inside a hairpin).
    const walls = [-1, 1].map((side) => {
      const off = (edge + BARRIER) * side;
      const w = { x: xs.map((x, i) => x + nx[i] * off), y: ys.map((y, i) => y + ny[i] * off) };
      w.ok = w.x.map((x, i) => near(x, w.y[i]) > edge + BARRIER - 2);
      return w;
    });
    // The start line, and the grid behind it (as the server lines the cars up: games/trackRacing.js).
    let startI = 0;
    for (let i = 1; i < N; i++) if ((xs[i] - tr.start[0]) ** 2 + (ys[i] - tr.start[1]) ** 2 < (xs[startI] - tr.start[0]) ** 2 + (ys[startI] - tr.start[1]) ** 2) startI = i;
    const back = (dist) => {
      let i = startI;
      let d = 0;
      while (d < dist) { d += Math.hypot(xs[i] - xs[at(i - 1)], ys[i] - ys[at(i - 1)]); i = at(i - 1); }
      return i;
    };
    const grid = Array.from({ length: 8 }, (_, k) => {
      const i = back(34 + Math.floor(k / 2) * 32);
      const side = (k % 2 ? 1 : -1) * 15;
      return { x: xs[i] + nx[i] * side, y: ys[i] + ny[i] * side, a: head[i] };
    });
    // Scenery: a grandstand by the start (on whichever side has room), tyre stacks behind the
    // barriers on the outside of the bends, and trees scattered round.
    const rand = seeded(tr.id);
    const W = tr.world.w;
    const H = tr.world.h;
    const inside = (x, y, m) => x > m && y > m && x < W - m && y < H - m;
    const props = [];
    const free = (x, y, r) => props.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > (p.r + r + 4) ** 2);
    let stand = null;
    for (const side of [-1, 1]) {
      const i = at(startI - 6);
      const d = edge + BARRIER + 26;
      const cx = xs[i] + nx[i] * d * side;
      const cy = ys[i] + ny[i] * d * side;
      const a = head[i];
      const ok = [-1, -0.5, 0, 0.5, 1].every((f) => [-1, 1].every((g) => {
        const x = cx + Math.cos(a) * f * 85 + nx[i] * side * g * 16;
        const y = cy + Math.sin(a) * f * 85 + ny[i] * side * g * 16;
        return inside(x, y, 6) && near(x, y) > edge + BARRIER + 6;
      }));
      if (ok) { stand = { x: cx, y: cy, a, side, len: 170, depth: 30 }; break; }
    }
    if (stand) props.push({ kind: 'stand', x: stand.x, y: stand.y, r: 90 });
    for (let i = 0; i < N; i += 3) {
      if (Math.abs(bend[i]) < 0.3) continue;
      const side = -Math.sign(bend[i]);
      const d = edge + BARRIER + 12;
      const x = xs[i] + nx[i] * d * side;
      const y = ys[i] + ny[i] * d * side;
      if (inside(x, y, 8) && near(x, y) > edge + BARRIER + 6 && free(x, y, 7)) props.push({ kind: 'tyres', x, y, r: 7 });
    }
    for (let k = 0; k < 900 && props.length < 110; k++) {
      const x = 12 + rand() * (W - 24);
      const y = 12 + rand() * (H - 24);
      const r = 7 + rand() * 6;
      const d = near(x, y);
      if (d < edge + BARRIER + r + 6 || d > edge + 240 || !free(x, y, r)) continue;
      props.push({ kind: 'tree', x, y, r, h: 20 + rand() * 18, tone: rand() });
    }
    shapes[key] = { N, xs, ys, nx, ny, head, bend, walls, startI, grid, stand, props };
    return shapes[key];
  }

  // ---------- Track drawing (from above) ----------

  // A speckled grey, so the asphalt has some grain to it (and you can see it go by).
  let grain = null;
  function grainPattern(c) {
    if (!grain) {
      grain = document.createElement('canvas');
      grain.width = grain.height = 64;
      const g = grain.getContext('2d');
      g.fillStyle = '#3a3a40';
      g.fillRect(0, 0, 64, 64);
      const rand = seeded('grain');
      for (let k = 0; k < 700; k++) {
        const v = rand();
        g.fillStyle = v < 0.5 ? `rgba(0, 0, 0, ${0.12 + v * 0.2})` : `rgba(255, 255, 255, ${(v - 0.5) * 0.12})`;
        g.fillRect(Math.floor(rand() * 64), Math.floor(rand() * 64), 1 + Math.floor(rand() * 2), 1);
      }
    }
    return c.createPattern(grain, 'repeat');
  }

  // The track, the grass beside it and the barriers round it (outside them is darker). `sx`, `sy`:
  // canvas pixels a unit. `scenery`: the trees and stands too, seen from above (the TV; the
  // first-person view builds them in 3D instead).
  function drawStatic(cv, tr, sx, sy = sx, { scenery = true } = {}) {
    const c = cv.getContext('2d');
    const path = trackPath(tr.line);
    const sh = shapeOf(tr);
    const pal = palette();
    const edge = tr.width / 2 + tr.band;
    const half = tr.width / 2;
    c.setTransform(sx, 0, 0, sy, 0, 0);
    c.clearRect(0, 0, tr.world.w, tr.world.h);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.fillStyle = 'rgba(0, 0, 0, 0.42)';
    c.fillRect(0, 0, tr.world.w, tr.world.h);
    // Inside the barriers, the felt (grass) shows through, a little lighter.
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = (edge + BARRIER) * 2;
    c.stroke(path);
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = (edge + BARRIER) * 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    c.stroke(path);
    // Gravel on the outside of the bends.
    const quads = (from, to, test, style) => {
      c.beginPath();
      for (let i = 0; i < sh.N; i++) {
        const j = (i + 1) % sh.N;
        const side = test(i);
        if (!side) continue;
        c.moveTo(sh.xs[i] + sh.nx[i] * from * side, sh.ys[i] + sh.ny[i] * from * side);
        c.lineTo(sh.xs[j] + sh.nx[j] * from * side, sh.ys[j] + sh.ny[j] * from * side);
        c.lineTo(sh.xs[j] + sh.nx[j] * to * side, sh.ys[j] + sh.ny[j] * to * side);
        c.lineTo(sh.xs[i] + sh.nx[i] * to * side, sh.ys[i] + sh.ny[i] * to * side);
        c.closePath();
      }
      c.fillStyle = style;
      c.fill();
    };
    const bendy = (i) => Math.max(Math.abs(sh.bend[i]), Math.abs(sh.bend[(i + 1) % sh.N]), Math.abs(sh.bend[(i - 1 + sh.N) % sh.N]));
    quads(half + 6, edge - 2, (i) => (bendy(i) > 0.24 ? -Math.sign(sh.bend[i]) : 0), 'rgba(214, 192, 150, 0.55)');
    // The asphalt, with a white line down each edge.
    c.lineWidth = tr.width + 2;
    c.strokeStyle = '#ececec';
    c.stroke(path);
    c.lineWidth = tr.width - 4;
    c.strokeStyle = grainPattern(c);
    c.stroke(path);
    // Kerbs round the bends, both sides, in the room's colour and white.
    for (const odd of [0, 1]) {
      quads(half - 4, half + 6, (i) => (bendy(i) > 0.2 && i % 2 === odd ? 1 : 0), odd ? '#f4f4f4' : pal.accent);
      quads(half - 4, half + 6, (i) => (bendy(i) > 0.2 && i % 2 === odd ? -1 : 0), odd ? pal.accent : '#f4f4f4');
    }
    // The start line, chequered, and the grid boxes behind it.
    const [stx, sty, sa] = tr.start;
    c.save();
    c.translate(stx, sty);
    c.rotate(sa);
    const sq = tr.width / 8;
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 8; k++) {
        c.fillStyle = (row + k) % 2 ? '#111' : '#fafafa';
        c.fillRect(-sq + row * sq, -tr.width / 2 + k * sq, sq, sq);
      }
    }
    c.restore();
    c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    c.lineWidth = 1.6;
    c.lineCap = 'butt';
    for (const g of sh.grid) {
      c.save();
      c.translate(g.x, g.y);
      c.rotate(g.a);
      c.beginPath();
      c.moveTo(6, -9);
      c.lineTo(17, -9);
      c.lineTo(17, 9);
      c.lineTo(6, 9);
      c.stroke();
      c.restore();
    }
    // The tyre wall: tyres in the room's trim colour and black.
    for (const w of sh.walls) {
      for (let i = 0; i < sh.N; i++) {
        if (!w.ok[i]) continue;
        c.fillStyle = i % 2 ? '#151515' : pal.rim;
        c.beginPath();
        c.arc(w.x[i], w.y[i], 4.6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(0, 0, 0, 0.45)';
        c.beginPath();
        c.arc(w.x[i], w.y[i], 1.8, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (scenery) drawScenery(c, tr, sh, pal);
  }

  // The scenery seen from above (the TV and the phones' maps).
  function drawScenery(c, tr, sh, pal) {
    const greens = ['#2f7d3a', '#3c8f45', '#2a6b34', '#4d9a3e'];
    for (const p of sh.props) {
      if (p.kind === 'tyres') {
        for (const [dx, dy] of [[-3, -2], [3, -2], [0, 3]]) {
          c.fillStyle = '#141414';
          c.beginPath();
          c.arc(p.x + dx, p.y + dy, 3.6, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = pal.rim;
          c.beginPath();
          c.arc(p.x + dx, p.y + dy, 1.4, 0, Math.PI * 2);
          c.fill();
        }
      } else if (p.kind === 'tree') {
        c.fillStyle = 'rgba(0, 0, 0, 0.3)';
        c.beginPath();
        c.arc(p.x + 4, p.y + 4, p.r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = greens[Math.floor(p.tone * greens.length)];
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255, 255, 255, 0.14)';
        c.beginPath();
        c.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (sh.stand) {
      const s = sh.stand;
      c.save();
      c.translate(s.x, s.y);
      c.rotate(s.a);
      c.fillStyle = 'rgba(0, 0, 0, 0.35)';
      c.fillRect(-s.len / 2 + 4, -s.depth / 2 + 4, s.len, s.depth);
      c.fillStyle = '#8d939b';
      c.fillRect(-s.len / 2, -s.depth / 2, s.len, s.depth);
      // Rows of people (the front row nearest the track).
      const rand = seeded(`${tr.id}:crowd`);
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 30; k++) {
          c.fillStyle = `hsl(${Math.floor(rand() * 360)}, 70%, ${45 + rand() * 25}%)`;
          c.fillRect(-s.len / 2 + 4 + k * 5.4, (-s.depth / 2 + 4 + row * 6) * s.side - 2, 3.6, 3.6);
        }
      }
      c.fillStyle = pal.accent;
      c.fillRect(-s.len / 2, (s.depth / 2 - 3) * s.side - 1.5, s.len, 3);
      c.restore();
    }
    // The gantry over the start line.
    const i = sh.startI;
    const span = tr.width / 2 + 12;
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(sh.xs[i] - sh.nx[i] * span + 6, sh.ys[i] - sh.ny[i] * span + 6);
    c.lineTo(sh.xs[i] + sh.nx[i] * span + 6, sh.ys[i] + sh.ny[i] * span + 6);
    c.stroke();
    c.strokeStyle = '#26262b';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(sh.xs[i] - sh.nx[i] * span, sh.ys[i] - sh.ny[i] * span);
    c.lineTo(sh.xs[i] + sh.nx[i] * span, sh.ys[i] + sh.ny[i] * span);
    c.stroke();
    c.strokeStyle = pal.accent;
    c.lineWidth = 2;
    c.stroke();
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
    for (const [wx, wy] of WHEELS) c.fillRect(wx - 3.5, wy - 2.2, 7, 4.4);
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
  const WHEELS = [[-7, -6.5], [7, -6.5], [-7, 6.5], [7, 6.5]];

  // ---------- Where the cars are ----------

  let snaps = []; // the latest 'cars' updates of this race
  let snapRace = 0;
  let clockOff = null; // local seconds minus race seconds, for the freshest update
  const honked = {}; // id -> local time of their last toot
  let lastMine = { place: 0, lap: 0, done: false };

  function carIds() {
    return PB.state?.game?.carIds || [];
  }

  // Every frame: the same arrays filled in again, not new ones.
  const nowCars = [];
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
    const n = a.c.length;
    nowCars.length = n;
    for (let k = 0; k < n; k++) nowCars[k] ||= [0, 0, 0, 0, 0, 0];
    if (!b) {
      // Past the latest update: carry on a little in the way they were going.
      const p = snaps[i - 1];
      if (!p) return a.c;
      const f = Math.min(0.12, Math.max(0, t - a.t)) / (a.t - p.t || 0.05);
      for (let k = 0; k < n; k++) lerpCar(p.c[k] || a.c[k], a.c[k], 1 + f, nowCars[k]);
      return nowCars;
    }
    const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
    for (let k = 0; k < n; k++) lerpCar(a.c[k], b.c[k] || a.c[k], f, nowCars[k]);
    return nowCars;
  }

  // Between two updates (f from 0 to 1), or a little past the second (f over 1).
  function lerpCar(a, b, f, out) {
    let da = b[2] - a[2];
    da = Math.atan2(Math.sin(da), Math.cos(da));
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + da * f;
    out[3] = b[3];
    out[4] = b[4];
    out[5] = b[5];
    return out;
  }

  // ---------- The canvases on screen ----------

  let views = [];
  let frame = null;
  const order = []; // cars by place, for drawing (reused)

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
      const mini = el.classList.contains('mini');
      drawStatic(bg, tr, scale, scale, { scenery: !mini || el.clientWidth > 300 });
      return { el, fg, marks, scale, mini };
    });
    fp.attach(s);
    kick();
  }

  const kick = () => { if (!frame && !document.hidden && (views.length || fp.el)) frame = requestAnimationFrame(draw); };
  // Nothing's drawn while the page is hidden (a locked phone, another tab).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame) { cancelAnimationFrame(frame); frame = null; } else kick();
  });

  function draw(ms) {
    frame = null;
    if (views.length) views = views.filter((v) => v.el.isConnected);
    const s = PB.state;
    if (s?.gameType !== 'trackRacing' || !s.game) return;
    if (fp.el && !fp.el.isConnected) fp.detach();
    if (!views.length && !fp.el) return;
    const cars = carsNow();
    const ids = carIds();
    const now = performance.now();
    order.length = cars.length;
    for (let i = 0; i < cars.length; i++) order[i] = i;
    // The leader on top.
    order.sort((a, b) => (cars[b][4] || 0) - (cars[a][4] || 0));
    for (const v of views) {
      const c = v.fg.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, v.fg.width, v.fg.height);
      c.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      const m = v.marks.getContext('2d');
      m.setTransform(v.scale, 0, 0, v.scale, 0, 0);
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
    if (fp.el) fp.frame(s, cars, ids, ms || now);
    frame = requestAnimationFrame(draw);
  }

  function stage(s, { mini = false } = {}) {
    const g = s.game;
    return `<div class="tr-stage ${mini ? 'mini' : ''}" data-race="${g.race}">
      <canvas class="tr-bg"></canvas><canvas class="tr-marks"></canvas><canvas class="tr-fg"></canvas>
      ${mini ? '' : countHtml(s)}
    </div>`;
  }

  // ---------- The view from the car ----------
  //
  // One WebGL canvas (and a 2D one over it for the names) for the whole visit: each time the
  // driving screen is drawn they're moved into it, so the textures and models stay loaded.

  const GROUND_VS = 'attribute vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }';
  // Each pixel's ray from the camera, to where it meets the ground (or the sky, above the horizon).
  const GROUND_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uGround, uSky;
    uniform vec2 uC, uWorld;
    uniform float uFocal, uFar;
    uniform vec3 uCam, uF, uR, uU, uHaze, uOut;
    void main() {
      vec2 p = (gl_FragCoord.xy - uC) / uFocal;
      vec3 d = uF + uR * p.x + uU * p.y;
      float hl = length(d.xy);
      if (d.z > -0.0015 * hl) {
        float el = atan(d.z, hl);
        vec3 sky = texture2D(uSky, vec2(atan(d.y, d.x) / 6.2831853, 1.0 - clamp(el / 0.55, 0.0, 1.0))).rgb;
        gl_FragColor = vec4(mix(uHaze, sky, smoothstep(0.0, 0.035, el)), 1.0);
        return;
      }
      float t = uCam.z / -d.z;
      vec2 w = uCam.xy + d.xy * t;
      vec2 uv = w / uWorld;
      vec3 col = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? uOut : texture2D(uGround, uv).rgb;
      float f = clamp((t * hl - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uHaze, f * f), 1.0);
    }`;
  // Models: a colour each corner (the light baked in), and a tint: 1 the car's own colour, 2 a
  // brake light, 3 the start lights. Cars are placed by uM (x, y, cos, sin of their heading).
  const MODEL_VS = `
    attribute vec3 aP;
    attribute vec4 aC;
    uniform mat4 uVP;
    uniform vec4 uM;
    uniform vec3 uTint, uLamp, uCam;
    uniform float uBrake, uFar;
    varying vec3 vC;
    varying float vFog;
    void main() {
      vec3 w = vec3(uM.x + uM.z * aP.x - uM.w * aP.y, uM.y + uM.w * aP.x + uM.z * aP.y, aP.z);
      vec3 c = aC.rgb;
      if (aC.a > 2.5) c *= uLamp;
      else if (aC.a > 1.5) c = mix(c * 0.45, vec3(1.0, 0.15, 0.1), uBrake);
      else if (aC.a > 0.5) c *= uTint;
      vC = c;
      float f = clamp((distance(w.xy, uCam.xy) - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      vFog = f * f;
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  const MODEL_FS = `
    precision mediump float;
    uniform vec3 uHaze;
    varying vec3 vC;
    varying float vFog;
    void main() { gl_FragColor = vec4(mix(vC, uHaze, vFog), 1.0); }`;

  // Building models: triangles of [x, y, z, r, g, b, tint].
  const LIGHT = [0.45, -0.35, 0.82];
  const shade = (nx, ny, nz) => 0.58 + 0.42 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  function mesher() {
    const v = [];
    const tri = (a, b, c, col, t) => { for (const p of [a, b, c]) v.push(p[0], p[1], p[2], col[0], col[1], col[2], t); };
    const m = {
      v,
      // A face (four corners in order), shaded by which way it faces.
      quad(a, b, c, d, col, t = 0) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        // (Whichever way round the corners came, light the side that faces up and out.)
        const k = Math.max(shade(nx, ny, nz), shade(-nx, -ny, -nz));
        const cc = col.map((x) => x * k);
        tri(a, b, c, cc, t);
        tri(a, c, d, cc, t);
      },
      // A box, turned by `a` about (x, y), from z0 to z1.
      box(x, y, a, hl, hw, z0, z1, col, t = 0, tops = true) {
        const ca = Math.cos(a), sa = Math.sin(a);
        const P = (u, w, z) => [x + ca * u - sa * w, y + sa * u + ca * w, z];
        const c = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
        for (let i = 0; i < 4; i++) {
          const [u0, w0] = c[i];
          const [u1, w1] = c[(i + 1) % 4];
          m.quad(P(u0, w0, z0), P(u1, w1, z0), P(u1, w1, z1), P(u0, w0, z1), col, t);
        }
        if (tops) m.quad(P(-hl, -hw, z1), P(hl, -hw, z1), P(hl, hw, z1), P(-hl, hw, z1), col, t);
      },
      // A cylinder, or a cone (r1 0), with n sides.
      cyl(x, y, z0, z1, r0, r1, col, n = 8) {
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          const p = (a, r, z) => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
          if (r1 > 0) m.quad(p(a0, r0, z0), p(a1, r0, z0), p(a1, r1, z1), p(a0, r1, z1), col);
          else {
            const am = (a0 + a1) / 2;
            const k = shade(Math.cos(am) * 0.8, Math.sin(am) * 0.8, 0.6);
            tri(p(a0, r0, z0), p(a1, r0, z0), [x, y, z1], col.map((q) => q * k), 0);
          }
          if (r1 > 0) tri([x, y, z1], p(a0, r1, z1), p(a1, r1, z1), col.map((q) => q * shade(0, 0, 1)), 0);
        }
      },
    };
    return m;
  }

  // The barriers, the scenery and the gantry, as one model.
  function sceneModel(tr, sh, pal) {
    const m = mesher();
    const rim = rgb(pal.rim, [0.85, 0.85, 0.85]);
    const black = [0.09, 0.09, 0.1];
    const H = 7;
    for (const w of sh.walls) {
      for (let i = 0; i < sh.N; i++) {
        const j = (i + 1) % sh.N;
        if (!w.ok[i] || !w.ok[j]) continue;
        // A stack of tyres: a short box each, alternating colours.
        const x = (w.x[i] + w.x[j]) / 2;
        const y = (w.y[i] + w.y[j]) / 2;
        const a = Math.atan2(w.y[j] - w.y[i], w.x[j] - w.x[i]);
        const hl = Math.hypot(w.x[j] - w.x[i], w.y[j] - w.y[i]) / 2 + 0.3;
        m.box(x, y, a, hl, 3, 0, H, i % 2 ? black : rim);
      }
    }
    const greens = [[0.18, 0.49, 0.23], [0.24, 0.56, 0.27], [0.16, 0.42, 0.2], [0.3, 0.6, 0.24]];
    for (const p of sh.props) {
      if (p.kind === 'tyres') {
        for (const [dx, dy] of [[-3, -2], [3, -2], [0, 3]]) {
          m.cyl(p.x + dx, p.y + dy, 0, 9, 3.6, 3.6, black, 8);
          m.cyl(p.x + dx, p.y + dy, 9, 9.6, 3.6, 3.6, rim, 8);
        }
      } else if (p.kind === 'tree') {
        const col = greens[Math.floor(p.tone * greens.length)];
        m.cyl(p.x, p.y, 0, p.h * 0.35, 1.6, 1.4, [0.4, 0.27, 0.15], 6);
        m.cyl(p.x, p.y, p.h * 0.25, p.h * 0.75, p.r, 0, col, 7);
        m.cyl(p.x, p.y, p.h * 0.5, p.h, p.r * 0.72, 0, col.map((c) => c * 1.12), 7);
      }
    }
    if (sh.stand) {
      // Stepped seats, rising away from the track, full of people, under a roof.
      const s = sh.stand;
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      const nx = -sa * s.side, ny = ca * s.side; // away from the track
      const rand = seeded(`${tr.id}:crowd`);
      const grey = [0.55, 0.58, 0.62];
      for (let row = 0; row < 4; row++) {
        const off = -s.depth / 2 + 4 + row * 6.5;
        m.box(s.x + nx * off, s.y + ny * off, s.a, s.len / 2, 3.25, 0, 4 + row * 4, grey);
        for (let k = 0; k < 30; k++) {
          const u = -s.len / 2 + 4 + k * 5.6 + (rand() - 0.5);
          const col = hsl(rand(), 0.7, 0.45 + rand() * 0.25);
          m.box(s.x + nx * off + ca * u, s.y + ny * off + sa * u, s.a, 1.6, 1.4, 4 + row * 4, 7.5 + row * 4 + rand(), col);
        }
      }
      const back = s.depth / 2;
      m.box(s.x + nx * back, s.y + ny * back, s.a, s.len / 2, 1.2, 0, 26, grey);
      for (const u of [-s.len / 2 + 2, 0, s.len / 2 - 2]) m.box(s.x - nx * (back - 3) + ca * u, s.y - ny * (back - 3) + sa * u, s.a, 0.8, 0.8, 0, 26, grey);
      m.box(s.x, s.y, s.a, s.len / 2 + 2, s.depth / 2 + 2, 26, 27.5, pal.accentRgb);
    }
    // The gantry: posts either side of the start line, a beam across, five lights.
    const i = sh.startI;
    const a = sh.head[i];
    const span = tr.width / 2 + 12;
    const post = [0.85, 0.85, 0.87];
    for (const side of [-1, 1]) m.box(sh.xs[i] + sh.nx[i] * span * side, sh.ys[i] + sh.ny[i] * span * side, a, 1.8, 1.8, 0, 36, post);
    m.box(sh.xs[i], sh.ys[i], a, 2.4, span + 2, 30, 38, [0.15, 0.15, 0.17]);
    m.box(sh.xs[i] - Math.cos(a) * 2.6, sh.ys[i] - Math.sin(a) * 2.6, a, 0.3, span - 4, 31, 37, pal.accentRgb, 0, false);
    for (let k = -2; k <= 2; k++) {
      m.box(sh.xs[i] - Math.cos(a) * 3.2 + sh.nx[i] * k * 6, sh.ys[i] - Math.sin(a) * 3.2 + sh.ny[i] * k * 6, a, 0.5, 2, 32.2, 35.8, [1, 1, 1], 3, false);
    }
    return new Float32Array(m.v);
  }
  function hsl(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }

  // A car, nose along +x, its right side +y: the body in the driver's colour (tint 1).
  function carModel() {
    const m = mesher();
    const white = [1, 1, 1];
    const glass = [0.08, 0.1, 0.16];
    const tyre = [0.07, 0.07, 0.08];
    m.quad([-15, -9, 0.15], [16, -9, 0.15], [16, 9, 0.15], [-15, 9, 0.15], [0.05, 0.05, 0.06]); // its shadow
    m.box(0, 0, 0, 14, 7, 1.6, 5.6, white, 1);
    m.box(10.5, 0, 0, 4.5, 6.2, 1.6, 4.4, white, 1);
    m.box(-2, 0, 0, 6.5, 5.6, 5.6, 9.4, glass);
    m.box(-2.5, 0, 0, 5, 5.7, 9.4, 9.9, white, 1);
    m.box(-13.4, 0, 0, 1.4, 7.4, 8, 9, white, 1);
    for (const y of [-4.5, 4.5]) m.box(-13, y, 0, 0.6, 0.6, 5.6, 8, tyre);
    for (const [x, y] of [[-8.5, -7.4], [8.5, -7.4], [-8.5, 7.4], [8.5, 7.4]]) m.box(x, y, 0, 3.3, 1.5, 0, 5, tyre);
    for (const y of [-4.6, 4.6]) m.box(-14.15, y, 0, 0.2, 1.7, 3.6, 5.2, [1, 0.3, 0.25], 2, false);
    m.box(15.1, 0, 0, 0.2, 4.5, 2, 3.4, [0.12, 0.12, 0.14], 0, false);
    return new Float32Array(m.v);
  }

  // The sky all the way round: the room's colours, hills, a treeline, a few lights far off.
  function skyCanvas(pal) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 256;
    const c = cv.getContext('2d');
    const top = mix(pal.bg, [0, 0, 0], 0.2);
    const horizon = mix(mix(pal.card2, pal.accentRgb, 0.22), [1, 1, 1], 0.12);
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(top));
    g.addColorStop(0.6, hex(mix(top, horizon, 0.55)));
    g.addColorStop(1, hex(horizon));
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 256);
    const rand = seeded('sky');
    for (let k = 0; k < 60; k++) {
      c.fillStyle = `rgba(255, 255, 255, ${0.15 + rand() * 0.45})`;
      c.fillRect(rand() * 1024, rand() * 150, 1.5, 1.5);
    }
    // Whole numbers of waves round the 1024 pixels, so the join doesn't show.
    const ridge = (base, amp, waves, phase) => {
      c.beginPath();
      c.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 8) {
        const t = (x / 1024) * Math.PI * 2;
        c.lineTo(x, 256 - base - amp * (0.6 * Math.sin(t * waves[0] + phase) + 0.3 * Math.sin(t * waves[1] + phase * 2) + 0.1 * Math.sin(t * waves[2])));
      }
      c.lineTo(1024, 256);
      c.fill();
    };
    c.fillStyle = hex(mix(horizon, pal.card, 0.45));
    ridge(26, 26, [2, 5, 13], 1);
    c.fillStyle = hex(mix(horizon, pal.card, 0.75));
    ridge(10, 12, [3, 7, 31], 4);
    for (let k = 0; k < 40; k++) {
      c.fillStyle = `rgba(${pal.accentRgb.map((v) => Math.round(v * 255)).join(', ')}, ${0.35 + rand() * 0.4})`;
      c.fillRect(rand() * 1024, 238 + rand() * 12, 2, 2);
    }
    return cv;
  }

  // The ground, from above, as a texture: the felt's colours (with a mown stripe) under the track.
  function groundCanvas(tr, pal) {
    const cv = document.createElement('canvas');
    cv.width = 2048;
    cv.height = 1024;
    const c = cv.getContext('2d');
    const sx = cv.width / tr.world.w;
    const sy = cv.height / tr.world.h;
    const felt = pal.felt;
    const g = c.createRadialGradient(cv.width / 2, cv.height / 2, 0, cv.width / 2, cv.height / 2, cv.width * 0.6);
    felt.forEach((col, i) => g.addColorStop(felt.length === 1 ? 0 : i / (felt.length - 1), hex(col)));
    c.fillStyle = g;
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let x = 0; x < cv.width; x += 48 * sx) c.fillRect(x, 0, 24 * sx, cv.height);
    const rand = seeded('felt');
    for (let k = 0; k < 9000; k++) {
      c.fillStyle = rand() < 0.5 ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.07)';
      c.fillRect(rand() * cv.width, rand() * cv.height, 2, 2);
    }
    const top = document.createElement('canvas');
    top.width = cv.width;
    top.height = cv.height;
    drawStatic(top, tr, sx, sy, { scenery: false });
    c.drawImage(top, 0, 0);
    // A soft shadow under the barriers and the scenery.
    const sh = shapeOf(tr);
    c.setTransform(sx, 0, 0, sy, 0, 0);
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (const p of sh.props) {
      if (p.kind === 'stand') continue;
      c.beginPath();
      c.arc(p.x + 2, p.y + 2, p.r + 1.5, 0, Math.PI * 2);
      c.fill();
    }
    return cv;
  }

  // Where things land on screen (the camera of this frame). Filled in, not made, each time.
  const at = { x: 0, y: 0, s: 0, d: 0 };

  const fp = {
    el: null, // the .tr-view on screen, when racing
    cv: null, // WebGL
    hud: null, // 2D, over it
    gl: null,
    failed: false,
    lost: false,
    key: '', // what's in the textures and models now
    w: 0,
    h: 0,
    vp: new Float32Array(16),
    cam: { x: 0, y: 0, z: 12, yaw: 0, roll: 0, speed: 0, px: 0, py: 0, pa: 0, race: -1, shake: 0, t: 0, f: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1], focal: 1 },
    avatars: {}, // id -> canvas

    attach(s) {
      const el = document.querySelector('.tr-view');
      if (!el) { this.el = null; return; }
      if (!this.cv) this.create();
      el.prepend(this.cv, this.hud);
      this.el = el;
      this.w = 0; // sized on the next frame
    },
    detach() { this.el = null; this.last = 0; },

    create() {
      this.cv = document.createElement('canvas');
      this.cv.className = 'tr-gl';
      this.hud = document.createElement('canvas');
      this.hud.className = 'tr-hudcv';
      this.cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      this.cv.addEventListener('webglcontextrestored', () => { this.lost = false; this.setup(); });
      this.gl = this.cv.getContext('webgl', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!this.gl || !this.setup()) { this.failed = true; this.gl = null; }
    },

    // Shaders and buffers (again after the phone takes the GPU away and gives it back).
    setup() {
      const gl = this.gl;
      const prog = (vs, fsrc) => {
        const p = gl.createProgram();
        for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fsrc]]) {
          const sh = gl.createShader(type);
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; }
          gl.attachShader(p, sh);
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
        return { p, u, aP: gl.getAttribLocation(p, 'aP'), aC: gl.getAttribLocation(p, 'aC') };
      };
      this.ground = prog(GROUND_VS, GROUND_FS);
      this.model = prog(MODEL_VS, MODEL_FS);
      if (!this.ground || !this.model) return false;
      this.quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const car = carModel();
      this.carBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.carBuf);
      gl.bufferData(gl.ARRAY_BUFFER, car, gl.STATIC_DRAW);
      this.carCount = car.length / 7;
      this.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      this.key = '';
      this.quick = '';
      return true;
    },

    // The track's textures and scenery, when the track (or the room's look) changes.
    load(s, ms) {
      const tr = s.game.track;
      // (The room's colours are looked at again now and then: its stylesheet can come in late.)
      const quick = `${tr.id}:${s.look || s.style}`;
      if (quick === this.quick && ms - this.checked < 1500) return;
      this.quick = quick;
      this.checked = ms;
      const pal = palette();
      const key = `${quick}:${pal.accent}:${pal.rim}:${pal.felt.join()}`;
      if (key === this.key) return;
      this.key = key;
      const gl = this.gl;
      const texture = (img, repeat, mips) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (mips) {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          // Looking along the ground, it's the sideways blur that keeps the distance from shimmering.
          if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        return t;
      };
      if (this.groundTex) gl.deleteTexture(this.groundTex);
      if (this.skyTex) gl.deleteTexture(this.skyTex);
      this.groundTex = texture(groundCanvas(tr, pal), false, true);
      this.skyTex = texture(skyCanvas(pal), true, false);
      const scene = sceneModel(tr, shapeOf(tr), pal);
      this.sceneBuf ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneBuf);
      gl.bufferData(gl.ARRAY_BUFFER, scene, gl.STATIC_DRAW);
      this.sceneCount = scene.length / 7;
      const horizon = mix(mix(pal.card2, pal.accentRgb, 0.22), [1, 1, 1], 0.12);
      this.haze = horizon;
      this.out = mix(pal.felt[pal.felt.length - 1], [0, 0, 0], 0.55);
      this.lamp = [0.25, 0.05, 0.05];
    },

    // The canvases' size: the screen's, at a modest resolution (scaled up by the browser): half the
    // phone's pixels, or less on a phone that can't keep up (see slow()).
    size(ms) {
      const w = this.el.clientWidth;
      const h = this.el.clientHeight;
      this.slow(ms);
      if (w === this.w && h === this.h && this.k === this.want) return;
      this.w = w;
      this.h = h;
      this.want ||= Math.max(0.75, Math.min(1.5, (window.devicePixelRatio || 1) * 0.5));
      const k = this.want;
      for (const cv of [this.cv, this.hud]) {
        cv.width = Math.max(2, Math.round(w * k));
        cv.height = Math.max(2, Math.round(h * k));
      }
      this.k = k;
    },

    // Frames coming slower than ~40 a second for a couple of seconds: a quarter fewer pixels (it
    // never goes back up, so it can't see-saw).
    slow(ms) {
      const dt = ms - (this.last || ms);
      this.last = ms;
      if (dt <= 0 || dt > 250) return;
      this.avg = this.avg ? this.avg + (dt - this.avg) * 0.05 : dt;
      this.judged ||= ms; // (not on the first few frames, which load the textures)
      if (ms - this.judged < 2500) return;
      this.judged = ms;
      if (this.avg > 25 && this.want > 0.5) this.want = Math.max(0.5, this.want * 0.85);
    },

    // The chase cam: behind the car, a little above, swinging round after it (so you see the car
    // turn), leaning into the corners, shaken by a bump, rumbling on the grass.
    aim(car, ms, portrait) {
      const cam = this.cam;
      const dt = Math.min(0.1, Math.max(0.001, (ms - cam.t) / 1000));
      const fresh = cam.race !== PB.state.game.race;
      cam.t = ms;
      if (fresh) { cam.race = PB.state.game.race; cam.yaw = car[2]; cam.px = car[0]; cam.py = car[1]; cam.pa = car[2]; cam.speed = 0; cam.roll = 0; cam.shake = 0; }
      const moved = Math.hypot(car[0] - cam.px, car[1] - cam.py) / dt;
      cam.speed += (Math.min(260, moved) - cam.speed) * (1 - Math.exp(-dt * 6));
      let turn = car[2] - cam.pa;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
      cam.px = car[0];
      cam.py = car[1];
      cam.pa = car[2];
      let d = car[2] - cam.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.yaw += d * (1 - Math.exp(-dt * 7));
      const lean = Math.max(-0.07, Math.min(0.07, turn * 0.025 * Math.min(1, cam.speed / 120)));
      cam.roll += (lean - cam.roll) * (1 - Math.exp(-dt * 5));
      cam.shake *= Math.exp(-dt * 5);
      const wobble = cam.shake * Math.sin(ms * 0.05) + (car[3] & 2 && cam.speed > 25 ? 0.25 * Math.sin(ms * 0.09) : 0);
      const back = portrait ? 38 : 54;
      const height = portrait ? 30 : 18;
      const F0 = Math.cos(cam.yaw);
      const F1 = Math.sin(cam.yaw);
      cam.x = car[0] - F0 * back;
      cam.y = car[1] - F1 * back;
      cam.z = height + wobble * 1.4;
      // Looking down a touch (more, from higher up, when upright: the tall screen fills with road).
      const pitch = Math.atan(portrait ? 0.42 : 0.17);
      const roll = cam.roll + wobble * 0.025;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cr = Math.cos(roll), sr = Math.sin(roll);
      // forward, right and up, for the ground's rays and the models' matrix alike
      const f = cam.f, r = cam.r, u = cam.u;
      f[0] = F0 * cp; f[1] = F1 * cp; f[2] = -sp;
      const r0 = -F1, r1 = F0;
      const u0 = F0 * sp, u1 = F1 * sp, u2 = cp;
      r[0] = r0 * cr - u0 * sr; r[1] = r1 * cr - u1 * sr; r[2] = -u2 * sr;
      u[0] = r0 * sr + u0 * cr; u[1] = r1 * sr + u1 * cr; u[2] = u2 * cr;
      // A wide view, a little wider the faster you go.
      const W = this.cv.width;
      const H = this.cv.height;
      const base = portrait ? W * 0.8 : Math.min(W / 2 / Math.tan(0.68), H * 1.05);
      cam.focal = base * (1 - 0.12 * Math.min(1, cam.speed / 175));
      const fx = cam.focal / (W / 2);
      const fy = cam.focal / (H / 2);
      const near = 2;
      const far = 1600;
      const A = (far + near) / (far - near);
      const B = (-2 * far * near) / (far - near);
      const cx = cam.x, cy = cam.y, cz = cam.z;
      const dot = (v) => v[0] * cx + v[1] * cy + v[2] * cz;
      const m = this.vp;
      // (Column by column.)
      m[0] = fx * r[0]; m[4] = fx * r[1]; m[8] = fx * r[2]; m[12] = -fx * dot(r);
      m[1] = fy * u[0]; m[5] = fy * u[1]; m[9] = fy * u[2]; m[13] = -fy * dot(u);
      m[2] = A * f[0]; m[6] = A * f[1]; m[10] = A * f[2]; m[14] = -A * dot(f) + B;
      m[3] = f[0]; m[7] = f[1]; m[11] = f[2]; m[15] = -dot(f);
    },

    // A point in the world to the 2D canvas (false if it's behind the camera).
    project(x, y, z) {
      const cam = this.cam;
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const f = cam.f, r = cam.r, u = cam.u;
      const d = dx * f[0] + dy * f[1] + dz * f[2];
      if (d < 3) return false;
      at.d = d;
      at.s = cam.focal / d;
      at.x = this.cv.width / 2 + (dx * r[0] + dy * r[1] + dz * r[2]) * at.s;
      at.y = this.cv.height / 2 - (dx * u[0] + dy * u[1] + dz * u[2]) * at.s;
      return true;
    },

    frame(s, cars, ids, ms) {
      const mine = ids.indexOf(s.me);
      const car = cars[mine];
      if (!car) return;
      this.size(ms);
      const portrait = this.h > this.w;
      if (this.failed || this.lost) { this.flat(s, cars, ids, car, portrait); return; }
      const gl = this.gl;
      this.load(s, ms);
      this.aim(car, ms, portrait);
      const cam = this.cam;
      const W = this.cv.width;
      const H = this.cv.height;
      const far = 700;
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      // The ground and the sky.
      const G = this.ground;
      gl.useProgram(G.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
      gl.uniform1i(G.u.uGround, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
      gl.uniform1i(G.u.uSky, 1);
      gl.uniform2f(G.u.uC, W / 2, H / 2);
      gl.uniform2f(G.u.uWorld, s.game.track.world.w, s.game.track.world.h);
      gl.uniform1f(G.u.uFocal, cam.focal);
      gl.uniform1f(G.u.uFar, far);
      gl.uniform3f(G.u.uCam, cam.x, cam.y, cam.z);
      gl.uniform3f(G.u.uF, cam.f[0], cam.f[1], cam.f[2]);
      gl.uniform3f(G.u.uR, cam.r[0], cam.r[1], cam.r[2]);
      gl.uniform3f(G.u.uU, cam.u[0], cam.u[1], cam.u[2]);
      gl.uniform3f(G.u.uHaze, this.haze[0], this.haze[1], this.haze[2]);
      gl.uniform3f(G.u.uOut, this.out[0], this.out[1], this.out[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(G.aP);
      gl.vertexAttribPointer(G.aP, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(G.aP);
      // The barriers, the scenery and the cars.
      const M = this.model;
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(M.p);
      gl.uniformMatrix4fv(M.u.uVP, false, this.vp);
      gl.uniform3f(M.u.uCam, cam.x, cam.y, cam.z);
      gl.uniform1f(M.u.uFar, far);
      gl.uniform3f(M.u.uHaze, this.haze[0], this.haze[1], this.haze[2]);
      // The start lights: red through the countdown, then green.
      const lit = s.phase === 'countdown' ? 1 : 0;
      gl.uniform3f(M.u.uLamp, lit ? 1 : 0.2, lit ? 0.12 : 1, lit ? 0.1 : 0.35);
      gl.enableVertexAttribArray(M.aP);
      gl.enableVertexAttribArray(M.aC);
      const draw = (buf, count) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.vertexAttribPointer(M.aP, 3, gl.FLOAT, false, 28, 0);
        gl.vertexAttribPointer(M.aC, 4, gl.FLOAT, false, 28, 12);
        gl.drawArrays(gl.TRIANGLES, 0, count);
      };
      gl.uniform4f(M.u.uM, 0, 0, 1, 0);
      gl.uniform3f(M.u.uTint, 1, 1, 1);
      gl.uniform1f(M.u.uBrake, 0);
      draw(this.sceneBuf, this.sceneCount);
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c || !ids[i]) continue;
        const col = this.colour(ids[i]);
        gl.uniform4f(M.u.uM, c[0], c[1], Math.cos(c[2]), Math.sin(c[2]));
        gl.uniform3f(M.u.uTint, col[0], col[1], col[2]);
        gl.uniform1f(M.u.uBrake, c[3] & 8 ? 1 : 0);
        draw(this.carBuf, this.carCount);
      }
      gl.disableVertexAttribArray(M.aP);
      gl.disableVertexAttribArray(M.aC);
      this.labels(s, cars, ids, mine, ms);
    },

    colour(id) {
      const look = PB.look(id);
      const c = (this.colours ||= {})[id];
      if (c && c.from === look.color) return c.rgb;
      this.colours[id] = { from: look.color, rgb: rgb(look.color, [0.9, 0.3, 0.3]) };
      return this.colours[id].rgb;
    },

    // Who's who (their avatar over their car), who's tooting, and who's right behind you.
    labels(s, cars, ids, mine, ms) {
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      const me = cars[mine];
      const F0 = Math.cos(this.cam.yaw);
      const F1 = Math.sin(this.cam.yaw);
      const now = performance.now();
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (i === mine || !car || !ids[i]) continue;
        const dx = car[0] - me[0];
        const dy = car[1] - me[1];
        const along = dx * F0 + dy * F1;
        const side = -dx * F1 + dy * F0;
        if (along < -4 && along > -110 && Math.abs(side) < 70) {
          // Close behind: an arrow at the bottom, on their side, brighter the closer they are.
          const x = W / 2 + (side / 70) * W * 0.4;
          c.globalAlpha = Math.min(1, 1.3 + along / 110);
          c.fillStyle = PB.look(ids[i]).color;
          c.beginPath();
          c.moveTo(x, H - 26 * this.k);
          c.lineTo(x - 13 * this.k, H - 6 * this.k);
          c.lineTo(x + 13 * this.k, H - 6 * this.k);
          c.fill();
          c.globalAlpha = 1;
          continue;
        }
        if (!this.project(car[0], car[1], 15) || at.d > 520) continue;
        const size = Math.max(16 * this.k, Math.min(46 * this.k, at.s * 13));
        c.globalAlpha = at.d > 380 ? (520 - at.d) / 140 : 1;
        c.drawImage(this.avatar(ids[i]), at.x - size / 2, at.y - size, size, size);
        if (now - (honked[ids[i]] || -1e9) < 900) {
          c.font = `bold ${Math.round(size * 0.42)}px system-ui, sans-serif`;
          c.textAlign = 'center';
          c.lineWidth = 3;
          c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
          c.fillStyle = '#fff';
          c.strokeText('BEEP!', at.x, at.y - size * 1.1);
          c.fillText('BEEP!', at.x, at.y - size * 1.1);
        }
        c.globalAlpha = 1;
      }
    },

    // An avatar in a bubble of its driver's colour, drawn once.
    avatar(id) {
      const look = PB.look(id);
      const have = this.avatars[id];
      if (have && have.from === `${look.avatar}${look.color}`) return have.cv;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      c.fillStyle = 'rgba(0, 0, 0, 0.55)';
      c.beginPath();
      c.arc(32, 28, 26, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = look.color;
      c.stroke();
      c.beginPath();
      c.moveTo(24, 52);
      c.lineTo(32, 62);
      c.lineTo(40, 52);
      c.fillStyle = look.color;
      c.fill();
      c.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(look.avatar, 32, 30);
      this.avatars[id] = { from: `${look.avatar}${look.color}`, cv };
      return cv;
    },

    // No WebGL: the map from above, turned so the car points up the screen, close in.
    flat(s, cars, ids, car, portrait) {
      const tr = s.game.track;
      if (!this.flatBg || this.flatKey !== tr.id) {
        this.flatBg = document.createElement('canvas');
        this.flatBg.width = tr.world.w * 2;
        this.flatBg.height = tr.world.h * 2;
        drawStatic(this.flatBg, tr, 2, 2);
        this.flatKey = tr.id;
      }
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      const z = (portrait ? W : H) / 170;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#1b1b1f';
      c.fillRect(0, 0, W, H);
      c.setTransform(z, 0, 0, z, W / 2, H * 0.68);
      c.rotate(-car[2] - Math.PI / 2);
      c.translate(-car[0], -car[1]);
      c.drawImage(this.flatBg, 0, 0, tr.world.w, tr.world.h);
      const now = performance.now();
      for (let i = 0; i < cars.length; i++) if (cars[i] && ids[i]) drawCar(c, cars[i], PB.look(ids[i]), { label: ids[i] !== s.me, mine: ids[i] === s.me, honk: now - (honked[ids[i]] || -1e9) < 900 });
    },
  };

  // 3, 2, 1, GO over the track (and over the view from the car).
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

  // A word across the view for a moment: a new lap, the last lap, the flag.
  let bannerTimer = null;
  function banner(text, stay = false) {
    const el = document.getElementById('tr-banner');
    if (!el) return;
    el.innerHTML = `<b>${esc(text)}</b>`;
    el.classList.remove('on');
    void el.offsetWidth; // (to play the animation again)
    el.classList.add('on');
    clearTimeout(bannerTimer);
    if (!stay) bannerTimer = setTimeout(() => el.classList.remove('on'), 1800);
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

  // The buttons over the view: allowing tilt, switching between tilt and buttons, recentring.
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
      <div class="tr-laps" id="tr-lap">${lastMine.done ? 'Finished!' : `Lap ${lastMine.lap || 1}/${g.laps}`}</div>
      <button class="tr-horn" data-tr="horn" aria-label="Horn">📯</button>
      ${PB.endButton('end-mini')}
    </div>`;
  }

  const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

  // The race from your car, filling the screen. Over it: your place and lap along the top (and,
  // with no TV, the map in a corner), the wheel small at the bottom. Touch anywhere on the right
  // half for gas, the left half to brake; steering by buttons, each half splits in two.
  function driveScreen(s) {
    const tiltOn = useTilt();
    const land = PB.landscape();
    const zones = tiltOn
      ? '<button class="tr-zone brake" data-pedal="brake"><span>BRAKE</span></button><button class="tr-zone gas" data-pedal="gas"><span>GAS</span></button>'
      : `<button class="tr-zone steer" data-steer="left" aria-label="Steer left"><span>◀</span></button><button class="tr-zone steer" data-steer="right" aria-label="Steer right"><span>▶</span></button>
         <button class="tr-zone brake" data-pedal="brake"><span>BRAKE</span></button><button class="tr-zone gas" data-pedal="gas"><span>GAS</span></button>`;
    return `<div class="tr-drive ${tiltOn ? 'tilt' : 'buttons'} ${land ? 'land' : 'port'} ${s.tv ? 'has-tv' : ''}">
      <div class="tr-view">${countHtml(s)}<div class="tr-banner" id="tr-banner"></div></div>
      <div class="tr-zones">${zones}</div>
      ${hud(s)}
      ${s.tv ? '' : `<div class="tr-minimap">${stage(s, { mini: true })}</div>`}
      <div class="tr-wheel-box">${wheelSvg(s)}</div>
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
      live ? 'live' : s.phase, PB.isTV && live ? s.phase : '', g.race, g.racers, g.carIds, s.tv, PB.landscape(), s.look || s.style,
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
      lastMine = { place: 0, lap: 0, done: false };
    },
    // Racing, the phone is all view, wheel and pedals.
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
      if (s.phase === 'betting') lastMine = { place: 0, lap: 0, done: false };
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
      if ((d.b || []).includes(s.me)) { PB.buzz('hit'); fp.cam.shake = 1; }
      const mine = d.c[ids.indexOf(s.me)];
      if (mine) {
        const done = !!(mine[3] & 4);
        if (lastMine.lap && mine[5] > lastMine.lap) {
          PB.buzz();
          banner(mine[5] === s.game.laps ? 'Final lap!' : `Lap ${mine[5]}`);
        }
        if (done && !lastMine.done && lastMine.place) banner(`🏁 ${ordinal(mine[4])}!`, true);
        if (mine[4] !== lastMine.place || mine[5] !== lastMine.lap || done !== lastMine.done) {
          lastMine = { place: mine[4], lap: mine[5], done };
          const pl = document.getElementById('tr-place');
          if (pl) pl.textContent = ordinal(mine[4]);
          const lp = document.getElementById('tr-lap');
          if (lp) lp.textContent = done ? 'Finished!' : `Lap ${mine[5]}/${s.game.laps}`;
        }
      }
      updateCount(s);
      updateBoard(s);
    },
  });
})();
