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
  const SPOTS = 8; // places round the lap for the room's own props
  const SPOT_R = 20; // room for one (no prop is wider than twice this)

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

  // ---------- Weather ----------
  //
  // Each race's weather comes with the state (the server picks it: games/trackRacing.js). From the
  // car: `light` on everything (with the room's colours still in the sky, mixed toward `sky`), the
  // haze it fades into and how far off (`far`), colours washed out (`mute`), the asphalt wet and
  // shining (`wet`), headlights (`lamps`: the barriers' white tyres and the gantry glow too),
  // snow on the verges and trees, and rain or snow falling (`fall`). On the TV, the same as a tint
  // and a layer of rain or snow over the track (style.css: .tr-wx, .tr-fall).
  const WX = {
    clear: { light: [1, 1, 1], far: 700 },
    sunset: { light: [1.06, 0.84, 0.7], sky: ['#2a2450', '#ff8a4a'], haze: [0.93, 0.6, 0.45], far: 700 },
    night: { light: [0.32, 0.36, 0.52], sky: ['#02040a', '#0e1830'], haze: [0.03, 0.04, 0.08], far: 620, lamps: true, flat: 'rgba(8, 12, 40, 0.55)' },
    rain: { light: [0.62, 0.66, 0.72], sky: ['#262c34', '#5a626c'], haze: [0.34, 0.37, 0.41], far: 480, wet: 1, fall: 'rain', flat: 'rgba(30, 40, 60, 0.3)' },
    fog: { light: [0.86, 0.87, 0.89], sky: ['#9aa2aa', '#c4c8cc'], haze: [0.72, 0.74, 0.76], far: 230, mute: 0.45, flat: 'rgba(200, 205, 210, 0.4)' },
    snow: { light: [0.9, 0.93, 1.02], sky: ['#6d7a8c', '#d8dee6'], haze: [0.8, 0.83, 0.88], far: 460, mute: 0.15, snow: true, fall: 'snow' },
  };
  const weatherOf = (s = PB.state) => (WX[s?.game?.weather] ? s.game.weather : 'clear');

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
    // The room's own props (see VENUE_PROPS): a spot every so often round the lap, just behind the
    // barrier on one side or the other, wherever there's room (nudged on down the track if not).
    // `bx, by` is the foot of the barrier behind it and `ox, oy` the way out from the track; the
    // prop stands as far out from there as it's wide, so it never leans into the tyres.
    const every = Math.floor(N / SPOTS);
    let made = 0;
    for (let k = 0; k < SPOTS; k++) {
      let done = false;
      for (let t = 0; t < every * 0.6 && !done; t++) {
        const i = at(startI + Math.round(every * (k + 0.5)) + t);
        for (const side of k % 2 ? [1, -1] : [-1, 1]) {
          if (!walls[side > 0 ? 1 : 0].ok[i]) continue;
          const base = edge + BARRIER + 5;
          const x = xs[i] + nx[i] * (base + SPOT_R) * side;
          const y = ys[i] + ny[i] * (base + SPOT_R) * side;
          if (!inside(x, y, SPOT_R) || near(x, y) < base + SPOT_R - 1 || !free(x, y, SPOT_R)) continue;
          props.push({ kind: 'venue', which: made++ % 2, x, y, r: SPOT_R, bx: xs[i] + nx[i] * base * side, by: ys[i] + ny[i] * base * side, ox: nx[i] * side, oy: ny[i] * side });
          done = true;
          break;
        }
      }
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
    const snow = WX[weatherOf()].snow;
    c.fillStyle = `rgba(0, 0, 0, ${snow ? 0.14 : 0.42})`;
    c.fillRect(0, 0, tr.world.w, tr.world.h);
    // Inside the barriers, the felt (grass) shows through, a little lighter.
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = (edge + BARRIER) * 2;
    c.stroke(path);
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = (edge + BARRIER) * 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    c.stroke(path);
    // Snow: white over the grass, and greyer beyond the barriers (under what's there already).
    if (snow) {
      c.globalCompositeOperation = 'destination-over';
      c.fillStyle = '#e9eef4';
      c.fillRect(0, 0, tr.world.w, tr.world.h);
      c.globalCompositeOperation = 'source-over';
    }
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
    const snowy = WX[weatherOf()].snow;
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
        if (snowy) {
          c.fillStyle = 'rgba(250, 252, 255, 0.45)';
          c.fill();
        }
        c.fillStyle = snowy ? 'rgba(250, 252, 255, 0.8)' : 'rgba(255, 255, 255, 0.14)';
        c.beginPath();
        c.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    // The room's props, standing up (the way the TV's scenery shows things), each over its shadow.
    const art = propArt(pal);
    for (const p of sh.props) {
      if (p.kind !== 'venue') continue;
      const it = art.items[p.which] || art.items[0];
      const [x, y] = propAt(p, it);
      const size = Math.min(it.size, 40);
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      c.beginPath();
      c.ellipse(x + 3, y + size * 0.38, it.half * 0.9, it.half * 0.4, 0, 0, Math.PI * 2);
      c.fill();
      c.drawImage(art.cv, it.cell * CELL, 0, CELL, CELL, x - size / 2, y - size / 2 - (it.lift ? 8 : 0), size, size);
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

  // ---------- The room's own props ----------
  //
  // Beside the track, a few times round the lap, a thing or two from the room you're racing in:
  // giant beer bottles and a BAR sign at the dive, a tiki and palms at the tiki bar, a Christmas
  // tree and a snowman at Christmas. Each is an emoji, or a few shapes drawn after the room's own
  // art (the frat's ΒΩΩΛ board, the saloon's wanted poster with the host on it), painted once into
  // one picture for the room, a square each. From above (the TV, the maps) they're drawn standing
  // up, like the TV's scenery; from the car they're cut-outs that turn to face you (see fp).
  //
  // Each: [emoji or drawing (ART), height, how much of its square's width it fills, how high it
  // floats]. Tall thin ones fill less of it; none is wider than SPOT_R * 2.
  const VENUE_PROPS = {
    classic: [['🏆', 32, 0.8], ['🏁', 34, 0.85]],
    dive: [['bottle', 48, 0.34], ['neon:BAR', 34, 1]],
    tavern: [['keg', 30, 0.66], ['🍺', 34, 0.85]],
    club: [['mirrorball', 44, 0.8], ['🍸', 32, 0.8]],
    castle: [['banner', 52, 0.6], ['shield', 34, 0.85]],
    jazz: [['🎷', 38, 0.8], ['neon:♫', 34, 1]],
    diner: [['jukebox', 40, 0.64], ['🍔', 30, 0.9]],
    tiki: [['🗿', 40, 0.7], ['🌴', 46, 0.85]],
    speakeasy: [['door', 40, 0.6], ['🥃', 28, 0.85]],
    casino: [['🎲', 30, 0.9], ['roulette', 38, 0.8]],
    saloon: [['🌵', 44, 0.7], ['wanted', 40, 0.62]],
    pirate: [['wheel', 36, 0.9], ['chest', 28, 0.86]],
    beerhall: [['keg', 30, 0.66], ['🥨', 30, 0.9]],
    space: [['🪐', 40, 0.95, 18], ['🛰️', 30, 0.9, 26]],
    lighthouse: [['lighthouse', 80, 0.3], ['⚓', 32, 0.8]],
    vineyard: [['cypress', 64, 0.24], ['wine', 30, 0.66]],
    frat: [['frat', 38, 1], ['cups', 34, 0.9]],
    garage: [['⛽', 36, 0.8], ['tyres', 34, 0.5]],
    chateau: [['⛲', 38, 0.9], ['topiary', 40, 0.5]],
    christmas: [['🎄', 50, 0.8], ['⛄', 36, 0.7]],
    halloween: [['🎃', 30, 0.9], ['tomb', 32, 0.46]],
    stpatricks: [['whisky', 30, 0.66], ['stone', 50, 0.4]],
  };
  const CELL = 256; // pixels a prop's square

  // The room the race is in (an easter egg or a mood is still its room).
  function venueOf(s = PB.state) {
    const look = s?.look || s?.style || 'classic';
    const room = window.ROOM_STYLES?.roomOf ? ROOM_STYLES.roomOf(look) : look;
    return VENUE_PROPS[room] ? room : 'classic';
  }

  // Where a prop stands: out from the barrier by as much as it's wide.
  function propAt(p, it) {
    const out = it.half + 0.5;
    return [p.bx + p.ox * out, p.by + p.oy * out];
  }

  // The drawings, on a square 100 across, standing on its bottom edge, centred.
  const fillRound = (c, x, y, w, h, r, col) => { c.fillStyle = col; roundRect(c, x, y, w, h, r); c.fill(); };
  const poly = (c, col, d) => { c.fillStyle = col; c.fill(new Path2D(d)); };
  const write = (c, text, x, y, font, col) => { c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(text, x, y); };
  const glow = (c, col, blur) => { c.shadowColor = col; c.shadowBlur = blur * (CELL / 100); };
  function barrel(c, wood, hoop, label) {
    poly(c, wood, 'M22 12 Q12 55 22 99 H78 Q88 55 78 12Z');
    c.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    c.lineWidth = 1.4;
    for (const x of [34, 50, 66]) c.stroke(new Path2D(`M${x} 13 Q${x + (x - 50) * 0.3} 55 ${x} 98`));
    for (const y of [22, 88]) fillRound(c, 16, y - 3, 68, 6, 2, hoop);
    poly(c, 'rgba(255, 255, 255, 0.12)', 'M26 14 Q18 55 26 97 H32 Q26 55 32 14Z');
    c.fillStyle = '#c69a62';
    c.beginPath();
    c.ellipse(50, 12, 28, 6, 0, 0, Math.PI * 2);
    c.fill();
    if (label) { fillRound(c, 30, 44, 40, 20, 2, '#efe2bf'); write(c, label, 50, 54.5, 'bold 10px Georgia, serif', '#3b2512'); }
  }
  const ART = {
    // The dive: a beer bottle, the label in the room's colour.
    bottle(c, pal) {
      fillRound(c, 43, 3, 14, 6, 2, '#d8b040');
      poly(c, '#6e3a12', 'M45 8 H55 V34 Q66 42 66 54 V96 Q66 99 62 99 H38 Q34 99 34 96 V54 Q34 42 45 34Z');
      fillRound(c, 38, 50, 4, 42, 2, 'rgba(255, 255, 255, 0.25)');
      fillRound(c, 34, 58, 32, 24, 0, pal.accent);
      write(c, 'BEER', 50, 70.5, 'bold 10px system-ui, sans-serif', '#fff');
    },
    // A neon sign on two posts: the word (or a note) in tubes of the room's colour.
    neon(c, pal, text) {
      for (const x of [20, 76]) fillRound(c, x, 58, 4, 42, 1, '#2a2622');
      fillRound(c, 4, 18, 92, 46, 6, '#141018');
      c.font = `bold ${text.length > 1 ? 34 : 40}px "Arial Black", Impact, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      glow(c, pal.accent, 6);
      c.lineWidth = 4;
      c.strokeStyle = pal.accent;
      c.strokeText(text, 50, 43);
      c.shadowBlur = 0;
      c.lineWidth = 1.4;
      c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      c.strokeText(text, 50, 43);
    },
    keg: (c) => barrel(c, '#8a5a2e', '#3a3836'),
    wine: (c) => barrel(c, '#6e2a2a', '#2e2a28', 'VINO'),
    whisky: (c) => barrel(c, '#7a4a22', '#2a2826', 'WHISKY'),
    // The club's mirror ball, hung from an arm on a pole, glinting.
    mirrorball(c) {
      fillRound(c, 16, 4, 4, 96, 1, '#3a3a44');
      fillRound(c, 16, 4, 42, 4, 1, '#3a3a44');
      fillRound(c, 55, 6, 2, 16, 1, '#9a9aa8');
      c.save();
      c.beginPath();
      c.arc(56, 46, 24, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = '#b8bcc8';
      c.fillRect(30, 20, 52, 52);
      const rand = seeded('mirrorball');
      for (let y = 22; y < 70; y += 6) for (let x = 32; x < 80; x += 6) { c.fillStyle = `rgba(255, 255, 255, ${rand() * 0.6})`; c.fillRect(x, y, 5, 5); }
      c.fillStyle = 'rgba(30, 20, 60, 0.35)';
      c.fillRect(56, 20, 30, 52);
      c.restore();
      c.fillStyle = '#fff';
      for (const [x, y, r] of [[44, 34, 5], [66, 58, 3.5], [80, 26, 4]]) poly(c, '#fff', `M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3}Z`);
    },
    // The castle's banner (the TV scenery's gonfalon, in the room's colour, a crown on it).
    banner(c, pal) {
      fillRound(c, 48, 2, 4, 98, 1, '#3a2a1a');
      fillRound(c, 20, 6, 60, 4, 1, '#e8c15a');
      c.save();
      c.translate(21, 6);
      c.scale(0.97, 0.62);
      const cloth = new Path2D('M2 5 H58 V100 L44 118 L30 102 L16 118 L2 100Z');
      c.fillStyle = pal.accent;
      c.fill(cloth);
      c.lineWidth = 3;
      c.strokeStyle = '#e8c15a';
      c.stroke(cloth);
      c.restore();
      emoji(c, '👑', 26, 50, 40);
    },
    shield(c) { emoji(c, '⚔️', 78, 50, 52); emoji(c, '🛡️', 60, 50, 66); },
    // The diner's jukebox: the arch of coloured lights, the record window, the grille.
    jukebox(c) {
      poly(c, '#8a2a1e', 'M18 99 V42 Q18 4 50 4 Q82 4 82 42 V99Z');
      c.lineWidth = 4;
      ['#ff4d6d', '#ffd23f', '#29f0ff'].forEach((col, k) => {
        const r = 26 - k * 5;
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(50 - r, 74);
        c.lineTo(50 - r, 42);
        c.arc(50, 42, r, Math.PI, 0);
        c.lineTo(50 + r, 74);
        c.stroke();
      });
      fillRound(c, 38, 34, 24, 16, 3, '#ffe9b0');
      fillRound(c, 34, 76, 32, 18, 2, '#2a1a14');
      c.fillStyle = '#c9a050';
      for (let x = 37; x < 66; x += 5) c.fillRect(x, 78, 1.6, 14);
      fillRound(c, 14, 94, 72, 6, 2, '#c9ccd1');
    },
    // The speakeasy's door: the slot (someone's looking out), the knob, a lamp over it.
    door(c) {
      fillRound(c, 20, 10, 60, 90, 2, '#22160e');
      fillRound(c, 26, 16, 48, 84, 1, '#5a3418');
      c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      c.lineWidth = 1.6;
      c.strokeRect(32, 46, 36, 20);
      c.strokeRect(32, 72, 36, 22);
      fillRound(c, 38, 26, 24, 9, 1, '#0a0604');
      fillRound(c, 43, 29, 4, 3, 1, '#ffd27a');
      fillRound(c, 53, 29, 4, 3, 1, '#ffd27a');
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.arc(66, 62, 3, 0, Math.PI * 2);
      c.fill();
      glow(c, '#ffc860', 6);
      fillRound(c, 44, 1, 12, 7, 3, '#ffd27a');
      c.shadowBlur = 0;
    },
    // A roulette wheel stood on its edge.
    roulette(c) {
      poly(c, '#5a3418', 'M38 78 H62 L70 99 H30Z');
      c.fillStyle = '#6a3a1a';
      c.beginPath();
      c.arc(50, 44, 40, 0, Math.PI * 2);
      c.fill();
      for (let k = 0; k < 18; k++) {
        c.fillStyle = k === 0 ? '#1a8a3a' : k % 2 ? '#c8202e' : '#141414';
        c.beginPath();
        c.moveTo(50, 44);
        c.arc(50, 44, 34, (k / 18) * Math.PI * 2, ((k + 1) / 18) * Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.arc(50, 44, 15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#8a6a20';
      c.beginPath();
      c.arc(50, 44, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(66, 22, 3, 0, Math.PI * 2);
      c.fill();
    },
    // The saloon's wanted poster (as in its scenery): the host's face, dead or alive.
    wanted(c, pal, text, s) {
      fillRound(c, 47, 60, 6, 40, 1, '#5a3a1e');
      c.save();
      c.translate(20, 2);
      c.scale(1, 0.84);
      poly(c, '#e7d3a6', 'M2 2 H58 V80 L52 82 L46 79 L38 82 L30 79 L22 82 L14 79 L8 82 L2 80Z');
      c.strokeStyle = '#a8875a';
      c.lineWidth = 0.8;
      c.strokeRect(6, 6, 48, 70);
      write(c, 'WANTED', 30, 15, 'bold 11px Georgia, serif', '#3b2512');
      const host = s?.hostId ? PB.look(s.hostId) : null;
      emoji(c, host?.avatar || '🤠', 20, 30, 48);
      write(c, String((s?.hostId && name(s.hostId)) || 'The Host').toUpperCase().slice(0, 12), 30, 61, 'bold 7px Georgia, serif', '#3b2512');
      write(c, 'DEAD OR ALIVE · $500', 30, 71, '6px Georgia, serif', '#6b4524');
      c.restore();
    },
    // The pirate's ship's wheel on its post, and a treasure chest, open.
    wheel(c) {
      poly(c, '#4a2c14', 'M44 74 H56 L62 99 H38Z');
      c.strokeStyle = '#7a4a22';
      c.lineCap = 'round';
      c.lineWidth = 5;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(50, 42);
        c.lineTo(50 + Math.cos(a) * 42, 42 + Math.sin(a) * 42);
        c.stroke();
      }
      c.lineWidth = 6;
      c.strokeStyle = '#8a5a2a';
      c.beginPath();
      c.arc(50, 42, 30, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.arc(50, 42, 8, 0, Math.PI * 2);
      c.fill();
    },
    chest(c) {
      poly(c, '#5e3818', 'M16 54 L20 24 Q50 12 82 24 L84 54Z');
      const rand = seeded('chest');
      for (let k = 0; k < 26; k++) {
        c.fillStyle = rand() < 0.5 ? '#ffd23f' : '#e8a820';
        c.beginPath();
        c.arc(20 + rand() * 60, 46 + rand() * 10, 4, 0, Math.PI * 2);
        c.fill();
      }
      fillRound(c, 12, 56, 76, 43, 3, '#7a4a22');
      for (const x of [22, 74]) fillRound(c, x, 56, 5, 43, 0, '#c9a050');
      fillRound(c, 45, 62, 10, 12, 2, '#d4af37');
      emoji(c, '💎', 14, 64, 44);
    },
    // The lighthouse: red and white, its lamp lit, the beams going out.
    lighthouse(c) {
      c.fillStyle = 'rgba(255, 236, 160, 0.6)';
      c.fill(new Path2D('M50 16 L2 6 L2 26Z M50 16 L98 6 L98 26Z'));
      c.save();
      const tower = new Path2D('M37 98 L43 24 H57 L63 98Z');
      c.clip(tower);
      for (let y = 24; y < 98; y += 12) { c.fillStyle = (y / 12) % 2 < 1 ? '#f4f1ea' : '#c8302e'; c.fillRect(30, y, 40, 12); }
      c.restore();
      fillRound(c, 39, 21, 22, 4, 1, '#222');
      glow(c, '#ffe9a0', 8);
      fillRound(c, 43, 10, 14, 11, 1, '#fff2b0');
      c.shadowBlur = 0;
      poly(c, '#c8302e', 'M41 11 L50 2 L59 11Z');
      fillRound(c, 32, 94, 36, 6, 1, '#8a8a8a');
    },
    // The vineyard's cypress, tall and dark.
    cypress(c) {
      fillRound(c, 48, 86, 4, 14, 1, '#5a3a1e');
      poly(c, '#1f4a28', 'M50 2 Q63 30 61 60 Q59 84 50 90 Q41 84 39 60 Q37 30 50 2Z');
      poly(c, 'rgba(255, 255, 255, 0.1)', 'M50 4 Q43 30 42 60 Q42 80 48 88 Q46 60 50 4Z');
    },
    // The frat's ΒΩΩΛ board (from the basement wall), and a pyramid of red cups.
    frat(c) {
      for (const x of [8, 88]) fillRound(c, x, 30, 4, 70, 1, '#3a2414');
      fillRound(c, 2, 24, 96, 40, 4, '#1b3f8e');
      c.lineWidth = 3;
      c.strokeStyle = '#d4af37';
      c.stroke();
      write(c, 'ΒΩΩΛ', 50, 45, 'bold 27px Georgia, serif', '#f4f4f4');
    },
    cups(c) {
      for (const [x, y] of [[22, 72], [50, 72], [78, 72], [36, 44], [64, 44], [50, 16]]) {
        poly(c, '#d62828', `M${x - 13} ${y} H${x + 13} L${x + 9} ${y + 27} H${x - 9}Z`);
        fillRound(c, x - 14, y - 1, 28, 4, 2, '#f4f4f4');
        c.fillStyle = 'rgba(0, 0, 0, 0.18)';
        c.fillRect(x - 11, y + 9, 22, 1.4);
        c.fillStyle = 'rgba(255, 255, 255, 0.22)';
        c.fillRect(x - 9, y + 4, 3, 20);
      }
    },
    // The garage's stack of tyres, in its colour.
    tyres(c, pal) {
      for (let k = 0; k < 5; k++) {
        const y = 82 - k * 16;
        fillRound(c, 26 - (k === 4 ? 2 : 0), y, 48, 17, 7, '#161616');
        fillRound(c, 30, y + 7, 40, 3, 1, k % 2 ? pal.accent : '#3a3a3a');
      }
    },
    // The château's topiary: a clipped ball on a stem, in a pot.
    topiary(c) {
      poly(c, '#b5562a', 'M34 82 H66 L61 99 H39Z');
      fillRound(c, 32, 80, 36, 5, 1, '#c86a3a');
      fillRound(c, 48, 50, 4, 32, 1, '#5a3a1e');
      c.fillStyle = '#2f6e34';
      c.beginPath();
      c.arc(50, 34, 22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.14)';
      c.beginPath();
      c.arc(43, 27, 11, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a6230';
      c.beginPath();
      c.arc(50, 70, 9, 0, Math.PI * 2);
      c.fill();
    },
    // Halloween's tombstone, and the Highlands' standing stone.
    tomb(c) {
      poly(c, '#8a8f96', 'M26 99 V40 Q26 12 50 12 Q74 12 74 40 V99Z');
      poly(c, 'rgba(0, 0, 0, 0.18)', 'M62 15 Q74 22 74 40 V99 H66 V40 Q66 24 62 15Z');
      write(c, 'RIP', 50, 46, 'bold 16px Georgia, serif', '#3a3e44');
      poly(c, '#3c6a2a', 'M20 99 L26 88 L30 96 L36 86 L40 99Z M60 99 L66 86 L70 96 L76 88 L80 99Z');
    },
    stone(c) {
      poly(c, '#7d8085', 'M34 99 L30 62 Q32 22 46 8 Q60 4 64 24 Q70 60 68 99Z');
      poly(c, 'rgba(0, 0, 0, 0.2)', 'M58 8 Q64 12 64 24 Q70 60 68 99 H58 Q62 60 58 8Z');
      c.fillStyle = '#8a9a5a';
      for (const [x, y, r] of [[40, 40, 3], [46, 64, 4], [38, 80, 2.5], [54, 30, 2]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    },
  };
  // An emoji, sized and standing on (x, y) at the bottom of its glyph.
  function emoji(c, ch, size, x, y) {
    c.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const m = c.measureText(ch);
    const w = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || size);
    c.fillStyle = '#000';
    c.fillText(ch, x - w / 2 + (m.actualBoundingBoxLeft || 0), y - (m.actualBoundingBoxDescent || 0));
  }

  // The room's props, painted once (a square each, side by side), and how big each stands.
  let propCache = null;
  function propArt(pal = palette()) {
    const s = PB.state;
    const venue = venueOf(s);
    const host = venue === 'saloon' && s?.hostId ? `${PB.look(s.hostId).avatar}${name(s.hostId)}` : '';
    const key = `${venue}:${pal.accent}:${host}`;
    if (propCache?.key === key) return propCache;
    const list = VENUE_PROPS[venue];
    const cv = document.createElement('canvas');
    cv.width = CELL * 2;
    cv.height = CELL;
    const c = cv.getContext('2d');
    const items = list.map(([what, size, wide, lift = 0], cell) => {
      c.save();
      c.translate(cell * CELL, 0);
      c.scale(CELL / 100, CELL / 100);
      // (Inside its square, with a little room round it, so the next one doesn't bleed in.)
      c.translate(3, 3);
      c.scale(0.94, 0.94);
      const [kind, text] = what.split(':');
      if (ART[kind]) ART[kind](c, pal, text, s);
      else emoji(c, what, 84, 50, 99);
      c.restore();
      return { cell, size, lift, half: Math.min(SPOT_R, (size * wide) / 2) };
    });
    propCache = { key, cv, items };
    return propCache;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
  }

  // A little car, nose along +x, in its driver's colour.
  function drawCar(c, car, look, { label, mine, honk, lamps }) {
    const [x, y, a, flags] = car;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.scale(1.2, 1.2);
    if (lamps) {
      // Headlights: a pool of light ahead (the gradient's in the car's own frame, so one does all).
      if (!c.trBeam) {
        c.trBeam = c.createLinearGradient(12, 0, 64, 0);
        c.trBeam.addColorStop(0, 'rgba(255, 240, 190, 0.55)');
        c.trBeam.addColorStop(1, 'rgba(255, 240, 190, 0)');
      }
      c.fillStyle = c.trBeam;
      c.beginPath();
      c.moveTo(12, -5);
      c.lineTo(64, -20);
      c.lineTo(64, 20);
      c.lineTo(12, 5);
      c.fill();
    }
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
    const lamps = !!WX[weatherOf(s)].lamps;
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
        drawCar(c, car, PB.look(id), { label: !v.mini || PB.isTV, mine: id === s.me && !PB.isTV, honk: now - (honked[id] || -1e9) < 900, lamps });
      }
    }
    if (fp.el) fp.frame(s, cars, ids, ms || now);
    frame = requestAnimationFrame(draw);
  }

  function stage(s, { mini = false } = {}) {
    const g = s.game;
    return `<div class="tr-stage ${mini ? 'mini' : ''}" data-race="${g.race}">
      <canvas class="tr-bg"></canvas><canvas class="tr-marks"></canvas><div class="tr-wx tr-wx-${weatherOf(s)}"></div><canvas class="tr-fg"></canvas>
      ${WX[weatherOf(s)].fall ? `<div class="tr-fall tr-fall-${WX[weatherOf(s)].fall}"></div>` : ''}
      ${mini ? '' : countHtml(s)}
    </div>`;
  }

  // ---------- The view from the car ----------
  //
  // One WebGL canvas (and a 2D one over it for the names) for the whole visit: each time the
  // driving screen is drawn they're moved into it, so the textures and models stay loaded.

  const GROUND_VS = 'attribute vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }';
  // The weather's light on a spot on the ground (or a model): the sky's (uLight), and at night the
  // cars' headlights (uCars: each car's x, y and which way it points; uHead 1 when they're on).
  const LIGHT_GLSL = `
    uniform vec3 uLight;
    uniform float uHead, uMute;
    uniform vec4 uCars[8];
    vec3 lit(vec2 w) {
      vec3 l = uLight;
      if (uHead > 0.5) {
        for (int i = 0; i < 8; i++) {
          vec4 c = uCars[i];
          vec2 d = w - c.xy;
          float a = dot(d, c.zw);
          if (a < -4.0 || a > 170.0 || c.z * c.z + c.w * c.w < 0.5) continue;
          float s = abs(d.x * c.w - d.y * c.z);
          l += vec3(1.0, 0.9, 0.7) * 1.6 * (1.0 - a / 170.0) * (1.0 - smoothstep(0.5, 1.0, s / (a * 0.42 + 8.0)));
        }
      }
      return l;
    }
    vec3 washed(vec3 c) { return mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uMute); }`;
  // Each pixel's ray from the camera, to where it meets the ground (or the sky, above the horizon).
  const GROUND_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uGround, uSky;
    uniform vec2 uC, uWorld;
    uniform float uFocal, uFar, uWet;
    uniform vec3 uCam, uF, uR, uU, uHaze, uOut;
    ${LIGHT_GLSL}
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
      if (uWet > 0.0) {
        // Wet: the asphalt (grey, dark) darker still, with the sky shining in it, more so far off.
        float hi = max(col.r, max(col.g, col.b));
        float tarmac = (1.0 - smoothstep(0.03, 0.09, hi - min(col.r, min(col.g, col.b)))) * (1.0 - smoothstep(0.3, 0.5, hi));
        vec3 sky = texture2D(uSky, vec2(atan(d.y, d.x) / 6.2831853, 0.9)).rgb;
        col = mix(col, col * 0.62 + sky * 0.45 * (1.0 - smoothstep(0.05, 0.5, -d.z / hl)), tarmac * uWet);
      }
      col = washed(col * lit(w));
      float f = clamp((t * hl - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uHaze, f * f), 1.0);
    }`;
  // Models: a colour each corner (the light baked in), and a tint: 1 the car's own colour, 2 a
  // brake light, 3 the start lights, 4 lit up at night (the headlights, the barriers' white
  // tyres, the gantry). Cars are placed by uM (x, y, cos, sin of their heading).
  const MODEL_VS = `
    attribute vec3 aP;
    attribute vec4 aC;
    uniform mat4 uVP;
    uniform vec4 uM;
    uniform vec3 uTint, uLamp, uCam;
    uniform float uBrake, uFar, uGlow;
    varying vec3 vC;
    varying float vFog;
    ${LIGHT_GLSL}
    void main() {
      vec3 w = vec3(uM.x + uM.z * aP.x - uM.w * aP.y, uM.y + uM.w * aP.x + uM.z * aP.y, aP.z);
      vec3 c = aC.rgb;
      vec3 l = lit(w.xy);
      if (aC.a > 3.5) c *= mix(l, vec3(1.0), uGlow);
      else if (aC.a > 2.5) c *= uLamp;
      else if (aC.a > 1.5) c = mix(c * 0.45 * mix(l, vec3(1.0), uGlow), vec3(1.0, 0.15, 0.1), max(uBrake, uGlow * 0.6));
      else if (aC.a > 0.5) c *= uTint * l;
      else c *= l;
      vC = washed(c);
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
  // The room's props: cut-outs standing on the ground, turned to face the camera (about the
  // upright, so they stay standing). Each corner: where it stands (x, y), how far to the side and
  // how high it is (aP), and where it is in the picture (aT). All of them, one draw.
  const PROP_VS = `
    attribute vec4 aP;
    attribute vec2 aT;
    uniform mat4 uVP;
    uniform vec2 uSide;
    uniform vec3 uCam;
    uniform float uFar;
    varying vec2 vT;
    varying float vFog;
    void main() {
      vec3 w = vec3(aP.xy + uSide * aP.z, aP.w);
      vT = aT;
      float f = clamp((distance(w.xy, uCam.xy) - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      vFog = f * f;
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  const PROP_FS = `
    precision mediump float;
    uniform sampler2D uArt;
    uniform vec3 uHaze, uLight;
    uniform float uMute;
    vec3 washed(vec3 c) { return mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uMute); }
    varying vec2 vT;
    varying float vFog;
    void main() {
      vec4 c = texture2D(uArt, vT);
      if (c.a < 0.5) discard;
      gl_FragColor = vec4(mix(washed(c.rgb * uLight), uHaze, vFog), 1.0);
    }`;

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
  function sceneModel(tr, sh, pal, wx) {
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
        m.box(x, y, a, hl, 3, 0, H, i % 2 ? black : rim, i % 2 ? 0 : 4);
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
        const top = wx.snow ? mix(col, [0.95, 0.97, 1], 0.75) : col.map((c) => c * 1.12);
        m.cyl(p.x, p.y, 0, p.h * 0.35, 1.6, 1.4, [0.4, 0.27, 0.15], 6);
        m.cyl(p.x, p.y, p.h * 0.25, p.h * 0.75, p.r, 0, wx.snow ? mix(col, [0.95, 0.97, 1], 0.35) : col, 7);
        m.cyl(p.x, p.y, p.h * 0.5, p.h, p.r * 0.72, 0, top, 7);
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
      m.box(s.x, s.y, s.a, s.len / 2 + 2, s.depth / 2 + 2, 26, 27.5, pal.accentRgb, 4);
    }
    // The gantry: posts either side of the start line, a beam across, five lights.
    const i = sh.startI;
    const a = sh.head[i];
    const span = tr.width / 2 + 12;
    const post = [0.85, 0.85, 0.87];
    for (const side of [-1, 1]) m.box(sh.xs[i] + sh.nx[i] * span * side, sh.ys[i] + sh.ny[i] * span * side, a, 1.8, 1.8, 0, 36, post);
    m.box(sh.xs[i], sh.ys[i], a, 2.4, span + 2, 30, 38, [0.15, 0.15, 0.17]);
    m.box(sh.xs[i] - Math.cos(a) * 2.6, sh.ys[i] - Math.sin(a) * 2.6, a, 0.3, span - 4, 31, 37, pal.accentRgb, 4, false);
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
    for (const y of [-4.6, 4.6]) m.box(15.2, y, 0, 0.2, 1.6, 3, 4.6, [1, 0.97, 0.85], 4, false); // headlights
    return new Float32Array(m.v);
  }

  // The sky all the way round: the room's colours, hills, a treeline, a few lights far off.
  // The sky's colours: the room's, or mostly the weather's.
  function skyColours(pal, wx) {
    const top = mix(pal.bg, [0, 0, 0], 0.2);
    const horizon = mix(mix(pal.card2, pal.accentRgb, 0.22), [1, 1, 1], 0.12);
    if (!wx.sky) return [top, horizon];
    return [mix(top, rgb(wx.sky[0]), 0.8), mix(horizon, rgb(wx.sky[1]), 0.8)];
  }
  function skyCanvas(pal, wx) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 256;
    const c = cv.getContext('2d');
    const [top, horizon] = skyColours(pal, wx);
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(top));
    g.addColorStop(0.6, hex(mix(top, horizon, 0.55)));
    g.addColorStop(1, hex(horizon));
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 256);
    const rand = seeded('sky');
    const stars = !wx.sky || wx.lamps ? 1 : 0; // (none through cloud, fog or a sunset)
    for (let k = 0; k < 60; k++) {
      c.fillStyle = `rgba(255, 255, 255, ${(0.15 + rand() * 0.45) * stars})`;
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
    const art = propArt(pal);
    for (const p of sh.props) {
      if (p.kind === 'stand') continue;
      c.beginPath();
      if (p.kind === 'venue') {
        const it = art.items[p.which] || art.items[0];
        const [x, y] = propAt(p, it);
        c.ellipse(x + 2, y + 2, it.half * 0.8, it.half * 0.8, 0, 0, Math.PI * 2);
      } else c.arc(p.x + 2, p.y + 2, p.r + 1.5, 0, Math.PI * 2);
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
    heads: new Float32Array(32), // the cars' headlights (see LIGHT_GLSL)
    drops: null, // rain or snow falling over the view: x, y (0 to 1) and how fast, each
    wasAt: new Float32Array(16), // where each car was last frame, for the spray

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
        return { p, u, aP: gl.getAttribLocation(p, 'aP'), aC: gl.getAttribLocation(p, 'aC'), aT: gl.getAttribLocation(p, 'aT') };
      };
      this.ground = prog(GROUND_VS, GROUND_FS);
      this.model = prog(MODEL_VS, MODEL_FS);
      this.sprite = prog(PROP_VS, PROP_FS);
      if (!this.ground || !this.model || !this.sprite) return false;
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
      const quick = `${tr.id}:${s.look || s.style}:${weatherOf(s)}`;
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
      const wx = WX[weatherOf(s)];
      this.wx = wx;
      this.skyTex = texture(skyCanvas(pal, wx), true, false);
      const sh = shapeOf(tr);
      const scene = sceneModel(tr, sh, pal, wx);
      this.sceneBuf ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneBuf);
      gl.bufferData(gl.ARRAY_BUFFER, scene, gl.STATIC_DRAW);
      this.sceneCount = scene.length / 7;
      // The room's props: their picture, and a cut-out each (two triangles: x, y, how far to the
      // side, how high, and where in the picture).
      const art = propArt(pal);
      if (this.propTex) gl.deleteTexture(this.propTex);
      this.propTex = texture(art.cv, false, true);
      const v = [];
      for (const p of sh.props) {
        if (p.kind !== 'venue') continue;
        const it = art.items[p.which] || art.items[0];
        const [x, y] = propAt(p, it);
        const u0 = (it.cell + 0.005) / 2;
        const u1 = (it.cell + 0.995) / 2;
        const h = it.size / 2;
        const z0 = it.lift;
        const z1 = it.lift + it.size;
        for (const [o, z, u, t] of [[-h, z0, u0, 1], [h, z0, u1, 1], [h, z1, u1, 0], [-h, z0, u0, 1], [h, z1, u1, 0], [-h, z1, u0, 0]]) v.push(x, y, o, z, u, t);
      }
      this.propBuf ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      this.propCount = v.length / 6;
      const [, horizon] = skyColours(pal, wx);
      this.haze = wx.haze ? mix(horizon, wx.haze, 0.85) : horizon;
      this.out = wx.snow ? [0.78, 0.81, 0.86] : mix(pal.felt[pal.felt.length - 1], [0, 0, 0], 0.55);
      this.propLight = mix(wx.light, [1, 1, 1], 0.3);
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
      const wx = this.wx;
      const far = wx.far;
      // The weather's light, for the ground and the models alike: the cars' headlights at night.
      const heads = this.heads;
      heads.fill(0);
      if (wx.lamps) {
        for (let i = 0; i < cars.length && i < 8; i++) {
          if (!cars[i] || !ids[i]) continue;
          heads[i * 4] = cars[i][0];
          heads[i * 4 + 1] = cars[i][1];
          heads[i * 4 + 2] = Math.cos(cars[i][2]);
          heads[i * 4 + 3] = Math.sin(cars[i][2]);
        }
      }
      const weather = (P) => {
        gl.uniform3f(P.u.uLight, wx.light[0], wx.light[1], wx.light[2]);
        gl.uniform1f(P.u.uHead, wx.lamps ? 1 : 0);
        gl.uniform1f(P.u.uMute, wx.mute || 0);
        gl.uniform4fv(P.u['uCars[0]'], heads);
      };
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
      gl.uniform1f(G.u.uWet, wx.wet || 0);
      weather(G);
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
      gl.uniform1f(M.u.uGlow, wx.lamps ? 1 : 0);
      weather(M);
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
      // The room's props, turned to face the camera: all of them in one go.
      if (this.propCount) {
        const P = this.sprite;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
        const side = Math.hypot(cam.r[0], cam.r[1]) || 1;
        gl.uniform2f(P.u.uSide, cam.r[0] / side, cam.r[1] / side);
        gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
        gl.uniform1f(P.u.uFar, far);
        gl.uniform3f(P.u.uHaze, this.haze[0], this.haze[1], this.haze[2]);
        gl.uniform3f(P.u.uLight, this.propLight[0], this.propLight[1], this.propLight[2]);
        gl.uniform1f(P.u.uMute, wx.mute || 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.propTex);
        gl.uniform1i(P.u.uArt, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuf);
        gl.enableVertexAttribArray(P.aP);
        gl.enableVertexAttribArray(P.aT);
        gl.vertexAttribPointer(P.aP, 4, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(P.aT, 2, gl.FLOAT, false, 24, 16);
        gl.drawArrays(gl.TRIANGLES, 0, this.propCount);
        gl.disableVertexAttribArray(P.aP);
        gl.disableVertexAttribArray(P.aT);
      }
      this.labels(s, cars, ids, mine, ms);
      this.spray(s, cars, ids, ms);
      this.fall(s, wx, car, ms);
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

    // Rain: spray thrown up behind the cars going at a lick.
    spray(s, cars, ids, ms) {
      const dt = (ms - (this.sprayAt || ms)) / 1000;
      this.sprayAt = ms;
      if (!this.wx.wet || s.phase !== 'race' || dt <= 0 || dt > 0.25) return;
      const c = this.hud.getContext('2d');
      c.fillStyle = 'rgba(222, 230, 240, 0.16)';
      c.beginPath();
      for (let i = 0; i < cars.length && i < 8; i++) {
        const car = cars[i];
        if (!car || !ids[i]) continue;
        const v = Math.hypot(car[0] - this.wasAt[i * 2], car[1] - this.wasAt[i * 2 + 1]) / dt;
        this.wasAt[i * 2] = car[0];
        this.wasAt[i * 2 + 1] = car[1];
        if (v < 40 || v > 400) continue;
        const ca = Math.cos(car[2]);
        const sa = Math.sin(car[2]);
        for (let k = 0; k < 3; k++) {
          if (!this.project(car[0] - ca * (17 + k * 9), car[1] - sa * (17 + k * 9), 3 + k * 2) || at.d > 400) continue;
          const r = Math.min(26 * this.k, at.s * (4 + k * 3) * Math.min(1, v / 150));
          c.moveTo(at.x + r, at.y);
          c.ellipse(at.x, at.y, r, r * 0.55, 0, 0, Math.PI * 2);
        }
      }
      c.fill();
    },

    // Rain or snow falling past (over the view from the car, or the map): the same few hundred
    // numbers moved along each frame, all drawn in one go. Turning sweeps them sideways.
    fall(s, wx, car, ms) {
      if (!wx.fall) return;
      const rain = wx.fall === 'rain';
      const n = rain ? 110 : 150;
      if (!this.drops || this.drops.length !== n * 3) {
        this.drops = new Float32Array(n * 3);
        const rand = seeded('drops');
        for (let i = 0; i < n * 3; i++) this.drops[i] = rand();
      }
      const dt = Math.min(0.1, Math.max(0, (ms - (this.fallAt || ms)) / 1000));
      this.fallAt = ms;
      let turn = car[2] - (this.fallYaw ?? car[2]);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.fallYaw = car[2];
      const speed = Math.min(1, this.cam.speed / 175);
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      const k = this.k || 1;
      const d = this.drops;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const sp = 0.5 + d[i * 3 + 2] * 0.5;
        let x = d[i * 3] - turn * 0.8;
        let y = d[i * 3 + 1] + dt * sp * (rain ? 1.5 + speed : 0.16 + speed * 0.3);
        if (!rain) x += Math.sin(ms * 0.0013 + i) * 0.0006;
        x -= Math.floor(x);
        y -= Math.floor(y);
        d[i * 3] = x;
        d[i * 3 + 1] = y;
        if (rain) {
          const len = (0.025 + 0.035 * speed) * H * sp;
          c.moveTo(x * W, y * H);
          c.lineTo(x * W - len * 0.12, y * H + len);
        } else {
          const r = (1 + sp * 2) * k;
          c.rect(x * W - r, y * H - r, r * 2, r * 2);
        }
      }
      if (rain) {
        c.lineWidth = Math.max(1, k);
        c.strokeStyle = 'rgba(205, 218, 238, 0.42)';
        c.stroke();
      } else {
        c.fillStyle = 'rgba(255, 255, 255, 0.85)';
        c.fill();
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
      const flatKey = `${tr.id}:${venueOf(s)}:${weatherOf(s)}`;
      if (!this.flatBg || this.flatKey !== flatKey) {
        this.flatBg = document.createElement('canvas');
        this.flatBg.width = tr.world.w * 2;
        this.flatBg.height = tr.world.h * 2;
        drawStatic(this.flatBg, tr, 2, 2);
        this.flatKey = flatKey;
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
      const wx = WX[weatherOf(s)];
      if (wx.flat || wx.snow) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = wx.flat || 'rgba(255, 255, 255, 0.1)';
        c.fillRect(0, 0, W, H);
        c.setTransform(z, 0, 0, z, W / 2, H * 0.68);
        c.rotate(-car[2] - Math.PI / 2);
        c.translate(-car[0], -car[1]);
      }
      for (let i = 0; i < cars.length; i++) if (cars[i] && ids[i]) drawCar(c, cars[i], PB.look(ids[i]), { label: ids[i] !== s.me, mine: ids[i] === s.me, honk: now - (honked[ids[i]] || -1e9) < 900, lamps: wx.lamps });
      this.fall(s, wx, car, performance.now());
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
