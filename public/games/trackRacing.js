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
//
// And each phone is its own car's sound: the engine, the tyres, the knocks (see "Your car's
// sounds"), TV or no TV.
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

  // ---------- Halloween ----------
  //
  // At the Halloween venue the track's a haunted graveyard (after its room art: lib/roomArt.js,
  // hauntedHill()): always dark (the server only picks night or fog there), a full moon low over a
  // purple and green sky, a haunted house on the hill, dead grass and graveyard earth for verges,
  // orange and black kerbs, an iron cemetery fence for the barriers, dead trees, gravestones and
  // jack-o'-lanterns, a gothic arch over the start, ghosts and skeletons in the grandstand. Low fog
  // drifts over the ground (`low`), bats flit over the sky, will-o'-the-wisps float about, lightning
  // flashes now and then, and a phantom car drives a lap every so often (only for show: it goes
  // through everything). All of it's decoration: the road, the walls and the cars are the same.
  const haunted = (s = PB.state) => venueOf(s) === 'halloween';
  const HAUNTED_WX = {
    night: { light: [0.34, 0.3, 0.5], sky: ['#06030d', '#24463a'], haze: [0.1, 0.12, 0.13], far: 560, lamps: true, flat: 'rgba(22, 8, 40, 0.5)', moon: true, low: [0.3, 0.28, 0.4], lowK: 0.55 },
    fog: { light: [0.52, 0.5, 0.64], sky: ['#1a1228', '#4e5a58'], haze: [0.34, 0.35, 0.4], far: 250, mute: 0.3, lamps: true, flat: 'rgba(110, 100, 140, 0.45)', moon: true, low: [0.46, 0.45, 0.52], lowK: 0.32 },
  };
  // The weather as this venue sees it.
  const wxOf = (s = PB.state) => (haunted(s) && HAUNTED_WX[weatherOf(s)]) || WX[weatherOf(s)];
  const calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // Lightning, now and then (0 to 1): a flash, a gap, a second flash fading. Not for reduced motion.
  function lightning(ms) {
    if (calm.matches) return 0;
    const n = Math.floor(ms / 12000);
    const into = ms - n * 12000 - ((n * 7919) % 6) * 900;
    if (into < 0) return 0;
    if (into < 90) return 1;
    if (into < 170) return 0;
    if (into < 600) return 0.7 * (1 - (into - 170) / 430);
    return 0;
  }
  // A jack-o'-lantern's flicker (around 1), each one its own way.
  const flicker = (ms, k) => 0.82 + 0.12 * Math.sin(ms * 0.017 + k * 1.7) + 0.06 * Math.sin(ms * 0.043 + k * 2.3);

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
          props.push({ kind: 'venue', which: made++, x, y, r: SPOT_R, bx: xs[i] + nx[i] * base * side, by: ys[i] + ny[i] * base * side, ox: nx[i] * side, oy: ny[i] * side });
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

  // Halloween's extras round a track (worked out once a track): jack-o'-lanterns along the fence,
  // gravestones and crosses out in the fields, where the will-o'-the-wisps float, and the
  // centreline's length so far at each point (for the phantom car's lap).
  const haunts = {};
  function hauntOf(tr) {
    const key = `${tr.id}:${tr.line.length}`;
    if (haunts[key]) return haunts[key];
    const sh = shapeOf(tr);
    const rand = seeded(`${tr.id}:haunt`);
    const W = tr.world.w;
    const H = tr.world.h;
    const edge = tr.width / 2 + tr.band;
    const near = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < sh.N; i++) best = Math.min(best, (sh.xs[i] - x) ** 2 + (sh.ys[i] - y) ** 2);
      return Math.sqrt(best);
    };
    const taken = sh.props.map((p) => [p.x, p.y, p.r]);
    const free = (x, y, r) => taken.every(([px, py, pr]) => (px - x) ** 2 + (py - y) ** 2 > (pr + r + 3) ** 2);
    const inside = (x, y, m) => x > m && y > m && x < W - m && y < H - m;
    const things = []; // { kind, x, y, size }
    for (let i = 0, k = 0; i < sh.N; i += 9, k++) {
      const side = k % 2 ? 1 : -1;
      if (!sh.walls[side > 0 ? 1 : 0].ok[i]) continue;
      const d = edge + BARRIER + 7;
      const x = sh.xs[i] + sh.nx[i] * d * side;
      const y = sh.ys[i] + sh.ny[i] * d * side;
      if (!inside(x, y, 8) || near(x, y) < d - 1 || !free(x, y, 5)) continue;
      things.push({ kind: 'lantern', x, y, size: 11 + rand() * 4 });
      taken.push([x, y, 5]);
    }
    for (let k = 0, graves = 0; k < 900 && graves < 44; k++) {
      const x = 10 + rand() * (W - 20);
      const y = 10 + rand() * (H - 20);
      const d = near(x, y);
      if (d < edge + BARRIER + 12 || d > edge + 160 || !free(x, y, 6)) continue;
      things.push({ kind: rand() < 0.62 ? 'tomb' : 'cross', x, y, size: 13 + rand() * 6 });
      taken.push([x, y, 6]);
      graves++;
    }
    const wisps = [];
    for (let k = 0; k < 600 && wisps.length < 12; k++) {
      const x = 20 + rand() * (W - 40);
      const y = 20 + rand() * (H - 40);
      const d = near(x, y);
      if (d < edge + BARRIER + 10 || d > edge + 130) continue;
      wisps.push({ x, y, k: rand() * 100 });
    }
    const cum = new Float32Array(sh.N + 1);
    for (let i = 1; i <= sh.N; i++) cum[i] = cum[i - 1] + Math.hypot(sh.xs[i % sh.N] - sh.xs[i - 1], sh.ys[i % sh.N] - sh.ys[i - 1]);
    haunts[key] = { things, wisps, cum, len: cum[sh.N] };
    return haunts[key];
  }

  // The phantom car: every so often (race time, so every screen has it in the same place), a lap of
  // the track, weaving a little, quicker than anyone. Where it is now (filled in, not made), or null.
  const PHANTOM = { first: 7, every: 42, speed: 205 };
  const PHANTOM_LOOK = { body: 'hotrod', paint: null, stripe: null, extra: 'flames' };
  let phantomPic = null;
  function phantomSprite() {
    if (phantomPic) return phantomPic;
    phantomPic = document.createElement('canvas');
    phantomPic.width = SPRITE.x * 2 * SPRITE_K;
    phantomPic.height = SPRITE.y * 2 * SPRITE_K;
    drawFlat(phantomPic.getContext('2d'), flatModel(carModel(PHANTOM_LOOK, { shadow: false }).v, '#a8ffd0'), (x, y, z, out, k) => {
      out[k] = (x + SPRITE.x) * SPRITE_K;
      out[k + 1] = (y + SPRITE.y) * SPRITE_K;
      return -z;
    });
    return phantomPic;
  }
  const phantom = { x: 0, y: 0, a: 0, fade: 0 };
  function phantomAt(s, tr) {
    if (s.phase !== 'race' || !snaps.length || snapRace !== s.game.race || clockOff == null || !haunted(s)) return null;
    const t = performance.now() / 1000 - clockOff - DELAY - PHANTOM.first;
    if (t < 0) return null;
    const sh = shapeOf(tr);
    const hs = hauntOf(tr);
    const lap = hs.len / PHANTOM.speed;
    const into = t % PHANTOM.every;
    if (into > lap) return null;
    const d = (hs.cum[sh.startI] + into * PHANTOM.speed) % hs.len;
    let lo = 0;
    let hi = sh.N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hs.cum[mid] <= d) lo = mid; else hi = mid; }
    const j = (lo + 1) % sh.N;
    const f = (d - hs.cum[lo]) / (hs.cum[lo + 1] - hs.cum[lo] || 1);
    const weave = Math.sin(into * 0.9) * 9;
    phantom.x = sh.xs[lo] + (sh.xs[j] - sh.xs[lo]) * f + sh.nx[lo] * weave;
    phantom.y = sh.ys[lo] + (sh.ys[j] - sh.ys[lo]) * f + sh.ny[lo] * weave;
    phantom.a = Math.atan2(sh.ys[j] - sh.ys[lo], sh.xs[j] - sh.xs[lo]) + Math.cos(into * 0.9) * 0.12;
    phantom.fade = Math.max(0, Math.min(1, into / 1.2, (lap - into) / 1.2));
    return phantom;
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

  // Halloween's verges: dead grass on graveyard earth, a pebble or two.
  let earth = null;
  function earthPattern(c) {
    if (!earth) {
      earth = document.createElement('canvas');
      earth.width = earth.height = 96;
      const g = earth.getContext('2d');
      g.fillStyle = '#2a2219';
      g.fillRect(0, 0, 96, 96);
      const rand = seeded('earth');
      for (let k = 0; k < 40; k++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(14, 10, 8, 0.4)' : 'rgba(58, 44, 30, 0.45)';
        g.beginPath();
        g.arc(rand() * 96, rand() * 96, 2 + rand() * 6, 0, Math.PI * 2);
        g.fill();
      }
      g.lineWidth = 1;
      for (let k = 0; k < 260; k++) {
        const x = rand() * 96;
        const y = rand() * 96;
        g.strokeStyle = ['#5e4f2c', '#4a3e22', '#6d5c34', '#3a3018'][Math.floor(rand() * 4)];
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rand() - 0.5) * 5, y - 2 - rand() * 4);
        g.stroke();
      }
      for (let k = 0; k < 14; k++) {
        g.fillStyle = rand() < 0.5 ? '#4a4258' : '#3a3346';
        g.fillRect(rand() * 96, rand() * 96, 1.5 + rand() * 2, 1.5 + rand() * 1.5);
      }
    }
    return c.createPattern(earth, 'repeat');
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
    const snow = wxOf().snow;
    const spooky = haunted();
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
    // Halloween: dead grass and earth (and darker beyond the fence).
    if (spooky) {
      c.globalCompositeOperation = 'destination-over';
      c.fillStyle = earthPattern(c);
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
    c.strokeStyle = spooky ? '#d4cab4' : '#ececec';
    c.stroke(path);
    c.lineWidth = tr.width - 4;
    c.strokeStyle = grainPattern(c);
    c.stroke(path);
    // Kerbs round the bends, both sides, in the room's colour and white (Halloween: black).
    const kerb = spooky ? '#141016' : '#f4f4f4';
    for (const odd of [0, 1]) {
      quads(half - 4, half + 6, (i) => (bendy(i) > 0.2 && i % 2 === odd ? 1 : 0), odd ? kerb : pal.accent);
      quads(half - 4, half + 6, (i) => (bendy(i) > 0.2 && i % 2 === odd ? -1 : 0), odd ? pal.accent : kerb);
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
    // Halloween: an iron cemetery fence, a stone pillar every so often.
    if (spooky) {
      for (const w of sh.walls) {
        c.strokeStyle = '#08060a';
        c.lineWidth = 2.2;
        c.beginPath();
        for (let i = 0; i < sh.N; i++) {
          const j = (i + 1) % sh.N;
          if (!w.ok[i] || !w.ok[j]) continue;
          c.moveTo(w.x[i], w.y[i]);
          c.lineTo(w.x[j], w.y[j]);
        }
        c.stroke();
        for (let i = 0; i < sh.N; i++) {
          if (!w.ok[i]) continue;
          c.fillStyle = i % 10 ? '#4a4258' : '#7a7090';
          const r = i % 10 ? 1.2 : 2.8;
          c.fillRect(w.x[i] - r, w.y[i] - r, r * 2, r * 2);
        }
      }
    }
    // The tyre wall: tyres in the room's trim colour and black.
    for (const w of spooky ? [] : sh.walls) {
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
    const snowy = wxOf().snow;
    const spooky = haunted();
    const art = propArt(pal);
    for (const p of sh.props) {
      if (p.kind === 'tyres' && spooky) {
        // Halloween: a gravestone and a cross where the tyres would be.
        c.fillStyle = 'rgba(0, 0, 0, 0.35)';
        c.fillRect(p.x - 3, p.y - 1, 9, 6);
        c.fillStyle = '#6a6478';
        roundRect(c, p.x - 5, p.y - 5, 7, 8, [3.5, 3.5, 0.5, 0.5]);
        c.fill();
        c.fillStyle = '#5a546a';
        c.fillRect(p.x + 3, p.y - 5, 1.6, 8);
        c.fillRect(p.x + 1.4, p.y - 3, 4.8, 1.6);
      } else if (p.kind === 'tyres') {
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
      } else if (p.kind === 'tree' && spooky) {
        // A dead tree: bare, twisted branches (and their shadow).
        const rand = seeded(`${Math.round(p.x)}:${Math.round(p.y)}`);
        const limbs = [];
        const n = 4 + Math.floor(rand() * 2);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rand() * 0.9;
          const len = p.r * (0.8 + rand() * 0.5);
          const bend = (rand() - 0.5) * 1.2;
          limbs.push([a, len, bend]);
        }
        c.lineCap = 'round';
        for (const [dx, col] of [[4, 'rgba(0, 0, 0, 0.4)'], [0, '#100a14']]) {
          c.strokeStyle = col;
          for (const [a, len, bend] of limbs) {
            const mx = p.x + dx + Math.cos(a) * len * 0.55;
            const my = p.y + dx + Math.sin(a) * len * 0.55;
            c.lineWidth = 2.2;
            c.beginPath();
            c.moveTo(p.x + dx, p.y + dx);
            c.lineTo(mx, my);
            c.lineTo(mx + Math.cos(a + bend) * len * 0.5, my + Math.sin(a + bend) * len * 0.5);
            c.stroke();
            c.lineWidth = 0.9;
            c.beginPath();
            c.moveTo(mx, my);
            c.lineTo(mx + Math.cos(a - bend * 1.4) * len * 0.4, my + Math.sin(a - bend * 1.4) * len * 0.4);
            c.stroke();
          }
          c.fillStyle = col;
          c.beginPath();
          c.arc(p.x + dx, p.y + dx, 2.2, 0, Math.PI * 2);
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
    // Halloween's gravestones, crosses and jack-o'-lanterns, standing up like the room's props.
    if (spooky) {
      for (const p of hauntOf(tr).things) {
        const it = art.byKind[p.kind];
        if (!it) continue;
        if (p.kind === 'lantern') {
          c.drawImage(glowSprite('orange'), p.x - p.size * 1.2, p.y - p.size * 1.3, p.size * 2.4, p.size * 2.4);
        } else {
          c.fillStyle = 'rgba(0, 0, 0, 0.3)';
          c.beginPath();
          c.ellipse(p.x + 2, p.y + p.size * 0.42, p.size * 0.3, p.size * 0.14, 0, 0, Math.PI * 2);
          c.fill();
        }
        c.drawImage(art.cv, it.cell * CELL, 0, CELL, CELL, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    // The room's props, standing up (the way the TV's scenery shows things), each over its shadow.
    for (const p of sh.props) {
      if (p.kind !== 'venue') continue;
      const it = art.items[p.which % art.items.length];
      const [x, y] = propAt(p, it);
      const size = Math.min(it.size, 40);
      if (it.glow) c.drawImage(glowSprite('orange'), x - size, y - size, size * 2, size * 2);
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
      c.fillStyle = spooky ? '#3e3848' : '#8d939b';
      c.fillRect(-s.len / 2, -s.depth / 2, s.len, s.depth);
      // Rows of people (the front row nearest the track). Halloween: ghosts and skeletons.
      const rand = seeded(`${tr.id}:crowd`);
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 30; k++) {
          const h = rand();
          const l = rand();
          const x = -s.len / 2 + 4 + k * 5.4;
          const y = (-s.depth / 2 + 4 + row * 6) * s.side - 2;
          if (spooky) {
            c.fillStyle = h < 0.6 ? `rgba(226, 240, 255, ${0.6 + l * 0.35})` : '#d8d0b4';
            c.beginPath();
            c.arc(x + 1.8, y + 1.8, 1.9, 0, Math.PI * 2);
            c.fill();
          } else {
            c.fillStyle = `hsl(${Math.floor(h * 360)}, 70%, ${45 + l * 25}%)`;
            c.fillRect(x, y, 3.6, 3.6);
          }
        }
      }
      c.fillStyle = pal.accent;
      c.fillRect(-s.len / 2, (s.depth / 2 - 3) * s.side - 1.5, s.len, 3);
      c.restore();
    }
    // The gantry over the start line (Halloween: a stone arch, a jack-o'-lantern on each pillar).
    const i = sh.startI;
    const span = tr.width / 2 + 12;
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(sh.xs[i] - sh.nx[i] * span + 6, sh.ys[i] - sh.ny[i] * span + 6);
    c.lineTo(sh.xs[i] + sh.nx[i] * span + 6, sh.ys[i] + sh.ny[i] * span + 6);
    c.stroke();
    c.strokeStyle = spooky ? '#4a4258' : '#26262b';
    c.lineWidth = spooky ? 6 : 5;
    c.beginPath();
    c.moveTo(sh.xs[i] - sh.nx[i] * span, sh.ys[i] - sh.ny[i] * span);
    c.lineTo(sh.xs[i] + sh.nx[i] * span, sh.ys[i] + sh.ny[i] * span);
    c.stroke();
    c.strokeStyle = pal.accent;
    c.lineWidth = 2;
    c.stroke();
    if (spooky && art.byKind.lantern) {
      const it = art.byKind.lantern;
      for (const side of [-1, 1]) {
        const x = sh.xs[i] + sh.nx[i] * span * side;
        const y = sh.ys[i] + sh.ny[i] * span * side;
        c.fillStyle = '#5e5670';
        c.fillRect(x - 4, y - 4, 8, 8);
        c.drawImage(glowSprite('orange'), x - 16, y - 18, 32, 32);
        c.drawImage(art.cv, it.cell * CELL, 0, CELL, CELL, x - 8, y - 11, 16, 16);
      }
    }
  }

  // A soft glow (a jack-o'-lantern's, a will-o'-the-wisp's), painted once each.
  const glows = {};
  function glowSprite(kind) {
    if (glows[kind]) return glows[kind];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [r, gg, b] = kind === 'green' ? [140, 255, 170] : [255, 150, 40];
    g.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${kind === 'green' ? 0.9 : 0.6})`);
    g.addColorStop(kind === 'green' ? 0.18 : 0.3, `rgba(${r}, ${gg}, ${b}, ${kind === 'green' ? 0.45 : 0.28})`);
    g.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    if (kind === 'green') {
      c.fillStyle = '#f0fff4';
      c.beginPath();
      c.arc(32, 32, 3.2, 0, Math.PI * 2);
      c.fill();
    }
    glows[kind] = cv;
    return cv;
  }

  // Bats against the sky, wings up and down (painted once).
  let batPics = null;
  function batSprites() {
    if (batPics) return batPics;
    batPics = [0, 1].map((up) => {
      const cv = document.createElement('canvas');
      cv.width = 64;
      cv.height = 32;
      const c = cv.getContext('2d');
      c.fillStyle = '#07040b';
      const wy = up ? -10 : 8;
      c.beginPath();
      c.moveTo(32, 15);
      c.quadraticCurveTo(20, 14 + wy, 2, 12 + wy * 0.6);
      c.quadraticCurveTo(10, 18 + wy * 0.3, 8, 22 + wy * 0.2);
      c.quadraticCurveTo(18, 17, 24, 22);
      c.quadraticCurveTo(28, 18, 32, 20);
      c.quadraticCurveTo(36, 18, 40, 22);
      c.quadraticCurveTo(46, 17, 56, 22 + wy * 0.2);
      c.quadraticCurveTo(54, 18 + wy * 0.3, 62, 12 + wy * 0.6);
      c.quadraticCurveTo(44, 14 + wy, 32, 15);
      c.fill();
      c.beginPath();
      c.ellipse(32, 17, 3.6, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(29, 13);
      c.lineTo(29.5, 8);
      c.lineTo(31.5, 12);
      c.lineTo(32.5, 12);
      c.lineTo(34.5, 8);
      c.lineTo(35, 13);
      c.fill();
      return cv;
    });
    return batPics;
  }

  // Halloween over the track from above, each frame (the TV, the maps, the phone with no WebGL):
  // the jack-o'-lanterns flickering, the will-o'-the-wisps drifting and the phantom car.
  function hauntAbove(c, s, tr, ms) {
    const hs = hauntOf(tr);
    const glow = glowSprite('orange');
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < hs.things.length; k++) {
      const p = hs.things[k];
      if (p.kind !== 'lantern') continue;
      c.globalAlpha = Math.max(0, (flicker(ms, k) - 0.7) * 2.2);
      c.drawImage(glow, p.x - p.size * 1.3, p.y - p.size * 1.4, p.size * 2.6, p.size * 2.6);
    }
    const green = glowSprite('green');
    for (const w of hs.wisps) {
      const t = ms / 1000 + w.k;
      c.globalAlpha = 0.55 + 0.35 * Math.sin(t * 1.3);
      c.drawImage(green, w.x + Math.sin(t * 0.4) * 14 - 9, w.y + Math.cos(t * 0.33) * 10 - 9, 18, 18);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    const ph = phantomAt(s, tr);
    if (ph) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.7 * ph.fade;
      c.drawImage(green, ph.x - 26, ph.y - 26, 52, 52);
      c.globalCompositeOperation = 'source-over';
      c.save();
      c.globalAlpha = 0.6 * ph.fade;
      c.translate(ph.x, ph.y);
      c.rotate(ph.a);
      c.drawImage(phantomSprite(), -SPRITE.x, -SPRITE.y, SPRITE.x * 2, SPRITE.y * 2);
      c.restore();
      c.globalAlpha = ph.fade;
      c.font = '14px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('👻', ph.x, ph.y - 20);
      c.globalAlpha = 1;
    }
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
  // floats, whether it glows]. Tall thin ones fill less of it; none is wider than SPOT_R * 2.
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
    // (Halloween's jack-o'-lantern glows and flickers: the fifth, `glow`. Its tomb and cross stand
    // in the fields too, and more lanterns along the fence: see hauntOf.)
    halloween: [['lantern', 30, 0.9, 0, true], ['tomb', 32, 0.46], ['scarecrow', 52, 0.66], ['cross', 40, 0.5]],
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
      poly(c, '#8a8696', 'M26 99 V40 Q26 12 50 12 Q74 12 74 40 V99Z');
      poly(c, 'rgba(0, 0, 0, 0.18)', 'M62 15 Q74 22 74 40 V99 H66 V40 Q66 24 62 15Z');
      c.strokeStyle = 'rgba(30, 26, 36, 0.6)';
      c.lineWidth = 1.2;
      c.stroke(new Path2D('M34 30 L40 38 L37 46 M66 70 L60 78'));
      write(c, 'RIP', 50, 46, 'bold 16px Georgia, serif', '#3a3644');
      poly(c, '#6a5a2e', 'M20 99 L26 88 L30 96 L36 86 L40 99Z M60 99 L66 86 L70 96 L76 88 L80 99Z');
    },
    // Halloween: a jack-o'-lantern (as on the room's haunted hill), lit inside.
    lantern(c) {
      poly(c, '#3c5a1e', 'M46 34 Q44 18 54 12 L59 18 Q52 21 54 34Z');
      c.fillStyle = '#c4500f';
      for (const x of [28, 72]) { c.beginPath(); c.ellipse(x, 66, 24, 32, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#e0641a';
      c.beginPath();
      c.ellipse(50, 66, 28, 33, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#f07a2a';
      c.beginPath();
      c.ellipse(50, 66, 13, 32, 0, 0, Math.PI * 2);
      c.fill();
      glow(c, '#ffb040', 5);
      poly(c, '#ffd23f', 'M24 56 L36 42 L42 60Z M76 56 L64 42 L58 60Z M50 62 L44 72 H56Z M22 76 Q50 104 78 76 L70 79 L64 72 L56 82 L50 75 L44 82 L36 72 L30 79Z');
      c.shadowBlur = 0;
      poly(c, '#fff1a8', 'M30 54 L36 47 L39 56Z M70 54 L64 47 L61 56Z');
    },
    // Halloween: a stone cross, a little crooked, dead grass round its foot.
    cross(c) {
      c.save();
      c.translate(50, 99);
      c.rotate(0.06);
      poly(c, '#7e788c', 'M-6 0 V-90 H6 V0Z M-24 -70 H24 V-58 H-24Z');
      poly(c, 'rgba(0, 0, 0, 0.22)', 'M2 0 V-90 H6 V0Z M-24 -61 H24 V-58 H-24Z');
      c.restore();
      poly(c, '#6a5a2e', 'M30 99 L36 88 L40 96 L46 86 L50 99Z M52 99 L58 86 L62 96 L68 88 L72 99Z');
    },
    // Halloween: a scarecrow on its post, a sack for a head, a crow on its arm.
    scarecrow(c) {
      fillRound(c, 47, 30, 6, 70, 1, '#4a3018');
      fillRound(c, 8, 34, 84, 5, 1, '#4a3018');
      poly(c, '#5a3a5e', 'M30 34 H70 L74 72 Q62 68 56 76 L50 70 L44 76 Q38 68 26 72Z');
      poly(c, '#7a4a2a', 'M36 46 h10 v10 h-10Z M56 56 h9 v8 h-9Z');
      for (const x of [10, 90]) poly(c, '#e0c060', `M${x} 32 l${x < 50 ? -6 : 6} 4 l${x < 50 ? 2 : -2} 4 l${x < 50 ? -6 : 6} 2 l${x < 50 ? 8 : -8} 0Z`);
      for (const x of [28, 36, 44, 56, 64, 72]) poly(c, '#d8b050', `M${x} 72 l3 8 l3 -9Z`);
      c.fillStyle = '#c8a870';
      c.beginPath();
      c.ellipse(50, 24, 13, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#3a2410';
      c.lineWidth = 1.4;
      c.stroke(new Path2D('M43 21 l4 3 M47 21 l-4 3 M53 21 l4 3 M57 21 l-4 3 M42 30 Q50 34 58 30 M44 29 v3 M48 30 v3 M52 30 v3 M56 29 v3'));
      poly(c, '#241a26', 'M30 14 H70 L64 10 L58 1 L46 5 L40 10Z');
      fillRound(c, 40, 10, 22, 3, 1, '#8a2a2a');
      poly(c, '#0a080c', 'M78 34 Q76 26 82 24 L86 22 L84 26 Q90 28 88 34Z');
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
    // (A power of two across, for the mipmaps.)
    const cols = 2 ** Math.ceil(Math.log2(Math.max(2, list.length)));
    cv.width = CELL * cols;
    cv.height = CELL;
    const c = cv.getContext('2d');
    const items = list.map(([what, size, wide, lift = 0, glows = false], cell) => {
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
      return { cell, size, lift, glow: glows, kind: what.split(':')[0], half: Math.min(SPOT_R, (size * wide) / 2) };
    });
    propCache = { key, cv, items, cols, byKind: Object.fromEntries(items.map((it) => [it.kind, it])) };
    return propCache;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
  }

  // A car from above (its picture: spriteOf), nose along +x, at its place on the track.
  function drawCar(c, car, id, { label, mine, honk, lamps, big }) {
    const [x, y, a, flags] = car;
    const look = PB.look(id);
    c.save();
    c.translate(x, y);
    c.rotate(a);
    if (big) c.scale(1.25, 1.25); // (the TV: big enough to tell a trolley from a van)
    if (lamps) {
      // Headlights: a pool of light ahead (the gradient's in the car's own frame, so one does all).
      if (!c.trBeam) {
        c.trBeam = c.createLinearGradient(14, 0, 66, 0);
        c.trBeam.addColorStop(0, 'rgba(255, 240, 190, 0.55)');
        c.trBeam.addColorStop(1, 'rgba(255, 240, 190, 0)');
      }
      c.fillStyle = c.trBeam;
      c.beginPath();
      c.moveTo(14, -6);
      c.lineTo(66, -24);
      c.lineTo(66, 24);
      c.lineTo(14, 6);
      c.fill();
    }
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundRect(c, -13, -6, 28, 16, 5);
    c.fill();
    // Your own car glows white (on your phone's map).
    if (mine) {
      c.shadowColor = '#fff';
      c.shadowBlur = 6;
    }
    c.drawImage(spriteOf(id), -SPRITE.x, -SPRITE.y, SPRITE.x * 2, SPRITE.y * 2);
    c.shadowBlur = 0;
    if (flags & 8) {
      c.fillStyle = '#ff2a2a';
      c.fillRect(-15, -6, 2.4, 3.4);
      c.fillRect(-15, 2.6, 2.4, 3.4);
    }
    c.restore();
    if (label) {
      c.font = '15px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(look.avatar, x, y - (big ? 25 : 21));
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
    spriteGen++; // (each car's picture is looked at again: someone may have changed theirs)
    paintPics();
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
    if (s?.gameType !== 'trackRacing' || !s.game) { sound.stop('left'); return; }
    if (fp.el && !fp.el.isConnected) fp.detach();
    if (!views.length && !fp.el) return;
    const cars = carsNow();
    const ids = carIds();
    const now = performance.now();
    order.length = cars.length;
    for (let i = 0; i < cars.length; i++) order[i] = i;
    // The leader on top.
    order.sort((a, b) => (cars[b][4] || 0) - (cars[a][4] || 0));
    const lamps = !!wxOf(s).lamps;
    const spooky = haunted(s);
    for (const v of views) {
      const c = v.fg.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, v.fg.width, v.fg.height);
      c.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      if (spooky && !v.mini) hauntAbove(c, s, s.game.track, now);
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
        drawCar(c, car, id, { label: !v.mini || PB.isTV, mine: id === s.me && !PB.isTV, honk: now - (honked[id] || -1e9) < 900, lamps, big: PB.isTV });
      }
    }
    if (fp.el) {
      fp.frame(s, cars, ids, ms || now);
      if (driving()) sound.drive(s, cars, ids, now);
    }
    frame = requestAnimationFrame(draw);
  }

  function stage(s, { mini = false } = {}) {
    const g = s.game;
    return `<div class="tr-stage ${mini ? 'mini' : ''} ${haunted(s) ? 'haunted' : ''}" data-race="${g.race}">
      <canvas class="tr-bg"></canvas><canvas class="tr-marks"></canvas><div class="tr-wx tr-wx-${weatherOf(s)}"></div><canvas class="tr-fg"></canvas>
      ${WX[weatherOf(s)].fall ? `<div class="tr-fall tr-fall-${WX[weatherOf(s)].fall}"></div>` : ''}
      ${haunted(s) && !mini ? '<div class="tr-haunt" aria-hidden="true"><i class="tr-fog"></i><i class="tr-bats"></i><i class="tr-flash"></i></div>' : ''}
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
  // Halloween's low fog: drifting banks of it over the ground (uLowK how thick, 0 for none), thinning
  // out a few units up.
  const LOW_GLSL = `
    uniform float uTime, uLowK;
    float lowFog(vec3 w) {
      if (uLowK <= 0.0) return 0.0;
      float n = 0.55 + 0.28 * sin(w.x * 0.021 + uTime * 0.31) * sin(w.y * 0.027 - uTime * 0.23) + 0.17 * sin((w.x - w.y) * 0.013 + uTime * 0.17);
      return clamp(uLowK * n * (1.0 - smoothstep(0.0, 9.0, w.z)), 0.0, 1.0);
    }`;
  // Each pixel's ray from the camera, to where it meets the ground (or the sky, above the horizon).
  const GROUND_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uGround, uSky;
    uniform vec2 uC, uWorld;
    uniform float uFocal, uFar, uWet, uFlash;
    uniform vec3 uCam, uF, uR, uU, uHaze, uOut, uLow;
    ${LIGHT_GLSL}
    ${LOW_GLSL}
    void main() {
      vec2 p = (gl_FragCoord.xy - uC) / uFocal;
      vec3 d = uF + uR * p.x + uU * p.y;
      float hl = length(d.xy);
      if (d.z > -0.0015 * hl) {
        float el = atan(d.z, hl);
        vec3 sky = texture2D(uSky, vec2(atan(d.y, d.x) / 6.2831853, 1.0 - clamp(el / 0.55, 0.0, 1.0))).rgb;
        sky += uFlash * vec3(0.42, 0.4, 0.55);
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
      col = mix(col, uLow, lowFog(vec3(w, 0.0)));
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
    varying float vFog, vLow;
    ${LIGHT_GLSL}
    ${LOW_GLSL}
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
      vLow = lowFog(w);
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  // (uGhost: Halloween's phantom car, pale green and see-through.)
  const MODEL_FS = `
    precision mediump float;
    uniform vec3 uHaze, uLow;
    uniform float uGhost;
    varying vec3 vC;
    varying float vFog, vLow;
    void main() {
      vec3 c = mix(mix(vC, uLow, vLow), vec3(0.55, 1.0, 0.75) * (0.45 + dot(vC, vec3(0.5))), uGhost * 0.75);
      gl_FragColor = vec4(mix(c, uHaze, vFog), 1.0 - uGhost * 0.5);
    }`;
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
    varying float vFog, vLow;
    ${LOW_GLSL}
    void main() {
      vec3 w = vec3(aP.xy + uSide * aP.z, aP.w);
      vT = aT;
      float f = clamp((distance(w.xy, uCam.xy) - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      vFog = f * f;
      vLow = lowFog(w);
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  const PROP_FS = `
    precision mediump float;
    uniform sampler2D uArt;
    uniform vec3 uHaze, uLight, uLow;
    uniform float uMute;
    vec3 washed(vec3 c) { return mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uMute); }
    varying vec2 vT;
    varying float vFog, vLow;
    void main() {
      vec4 c = texture2D(uArt, vT);
      if (c.a < 0.5) discard;
      gl_FragColor = vec4(mix(mix(washed(c.rgb * uLight), uLow, vLow), uHaze, vFog), 1.0);
    }`;

  // A shader program, and where its uniforms and attributes are (null if it won't compile).
  function program(gl, vs, fsrc) {
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
  }

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
      // A triangle, coloured as it comes.
      tri,
      // A cylinder, or a cone (r1 0), with n sides.
      cyl(x, y, z0, z1, r0, r1, col, n = 8, t = 0) {
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          const p = (a, r, z) => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
          if (r1 > 0) m.quad(p(a0, r0, z0), p(a1, r0, z0), p(a1, r1, z1), p(a0, r1, z1), col, t);
          else {
            const am = (a0 + a1) / 2;
            const k = shade(Math.cos(am) * 0.8, Math.sin(am) * 0.8, 0.6);
            tri(p(a0, r0, z0), p(a1, r0, z0), [x, y, z1], col.map((q) => q * k), t);
          }
          if (r1 > 0) tri([x, y, z1], p(a0, r1, z1), p(a1, r1, z1), col.map((q) => q * shade(0, 0, 1)), t);
        }
      },
      // A four-sided beam from one point to another (a branch, a stone of an arch), r0 thick at
      // the start and r1 at the end.
      limb(a, b, r0, r1, col, t = 0) {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const L = Math.hypot(dx, dy, dz) || 1;
        const d0 = dx / L, d1 = dy / L, d2 = dz / L;
        let ux = d1, uy = -d0;
        const ul = Math.hypot(ux, uy);
        if (ul < 1e-3) { ux = 1; uy = 0; } else { ux /= ul; uy /= ul; }
        const vx = uy * d2, vy = -ux * d2, vz = ux * d1 - uy * d0; // (across both d and u)
        const P = (p, r, su, sv) => [p[0] + (ux * su + vx * sv) * r, p[1] + (uy * su + vy * sv) * r, p[2] + vz * sv * r];
        const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
        for (let i = 0; i < 4; i++) {
          const [s0, v0] = c[i];
          const [s1, v1] = c[(i + 1) % 4];
          m.quad(P(a, r0, s0, v0), P(a, r0, s1, v1), P(b, r1, s1, v1), P(b, r1, s0, v0), col, t);
        }
      },
      // A cylinder lying along x (a keg on its side), centred on (x, y, z), ends and all.
      drum(x, y, z, hl, r, col, n = 10) {
        const p = (a, u) => [x + u, y + Math.cos(a) * r, z + Math.sin(a) * r];
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          m.quad(p(a0, -hl), p(a1, -hl), p(a1, hl), p(a0, hl), col);
          for (const u of [-hl, hl]) tri([x + u, y, z], p(a0, u), p(a1, u), col.map((q) => q * shade(1, 0, 0)), 0);
        }
      },
    };
    return m;
  }

  // The barriers, the scenery and the gantry, as one model.
  function sceneModel(tr, sh, pal, wx) {
    if (haunted()) return hauntedModel(tr, sh, pal);
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
  // Halloween's: the iron fence, gravestones, dead trees, a stand full of ghosts and skeletons, and
  // a gothic arch over the start, jack-o'-lanterns on its pinnacles (their faces lit: tint 4).
  function pumpkin(m, x, y, z, r, a) {
    const orange = [0.85, 0.36, 0.07];
    m.cyl(x, y, z, z + r * 0.55, r * 0.7, r, orange, 8);
    m.cyl(x, y, z + r * 0.55, z + r * 1.1, r, r * 0.6, orange, 8);
    m.box(x, y, 0, r * 0.1, r * 0.1, z + r * 1.1, z + r * 1.45, [0.25, 0.4, 0.12]);
    const fx = Math.cos(a), fy = Math.sin(a);
    const lit = [1, 0.82, 0.25];
    const at = (out, side) => [x + fx * out - fy * side, y + fy * out + fx * side];
    for (const sd of [-1, 1]) {
      const [ex, ey] = at(r * 0.93, sd * r * 0.36);
      m.box(ex, ey, a, 0.2, r * 0.17, z + r * 0.62, z + r * 0.86, lit, 4, false);
    }
    const [mx, my] = at(r * 0.97, 0);
    m.box(mx, my, a, 0.2, r * 0.46, z + r * 0.24, z + r * 0.42, lit, 4, false);
  }
  function hauntedModel(tr, sh, pal) {
    const m = mesher();
    const rand = seeded(`${tr.id}:haunted`);
    const iron = [0.17, 0.15, 0.2];
    const stone = [0.36, 0.33, 0.41];
    const dark = [0.15, 0.11, 0.14];
    for (const w of sh.walls) {
      for (let i = 0; i < sh.N; i++) {
        const j = (i + 1) % sh.N;
        if (!w.ok[i] || !w.ok[j]) continue;
        const x = (w.x[i] + w.x[j]) / 2;
        const y = (w.y[i] + w.y[j]) / 2;
        const a = Math.atan2(w.y[j] - w.y[i], w.x[j] - w.x[i]);
        const hl = Math.hypot(w.x[j] - w.x[i], w.y[j] - w.y[i]) / 2 + 0.2;
        // Two rails, railings with spear tips, and a stone pillar every so often.
        m.box(x, y, a, hl, 0.35, 2.6, 3.4, iron, 0, false);
        m.box(x, y, a, hl, 0.35, 9.2, 10, iron, 0, false);
        for (const f of [0, 0.5]) {
          const px = w.x[i] + (w.x[j] - w.x[i]) * f;
          const py = w.y[i] + (w.y[j] - w.y[i]) * f;
          if (f === 0 && i % 10 === 0) {
            m.box(px, py, a, 2, 2, 0, 13, stone);
            m.box(px, py, a, 2.5, 2.5, 13, 14.2, stone);
            continue;
          }
          m.box(px, py, a, 0.35, 0.35, 0, 11.4, iron, 0, false);
          m.cyl(px, py, 11.4, 13.4, 0.8, 0, iron, 4);
        }
      }
    }
    for (const p of sh.props) {
      if (p.kind === 'tyres') {
        // A gravestone and a cross, a little askew, facing the track.
        const a = rand() * Math.PI;
        const ca = Math.cos(a), sa = Math.sin(a);
        const tx = p.x - ca * 2.5, ty = p.y - sa * 2.5;
        m.box(tx, ty, a, 0.9, 3.4, 0, 7.4, stone);
        m.box(tx, ty, a, 0.9, 2.6, 7.4, 8.6, stone);
        m.box(tx, ty, a, 0.9, 1.5, 8.6, 9.3, stone);
        const cx = p.x + ca * 3, cy = p.y + sa * 3;
        m.box(cx, cy, a, 0.7, 0.7, 0, 11.5, stone);
        m.box(cx, cy, a, 0.7, 3.2, 7.4, 8.8, stone);
      } else if (p.kind === 'tree') {
        // A dead tree: a leaning, twisted trunk, bare branches, twigs off them.
        const h = p.h * 1.15;
        const la = rand() * Math.PI * 2;
        const lean = (rand() - 0.5) * 0.35;
        const mid = [p.x + Math.cos(la) * lean * h * 0.3, p.y + Math.sin(la) * lean * h * 0.3, h * 0.35];
        const top = [p.x + Math.cos(la) * lean * h, p.y + Math.sin(la) * lean * h, h * 0.66];
        m.limb([p.x, p.y, 0], mid, 2.1, 1.6, dark);
        m.limb(mid, top, 1.6, 0.8, dark);
        const n = 3 + Math.floor(rand() * 2);
        for (let k = 0; k < n; k++) {
          const a = la + (k / n) * Math.PI * 2 + rand() * 0.9;
          const from = k === 0 ? top : [mid[0] + (top[0] - mid[0]) * (0.3 + k * 0.2), mid[1] + (top[1] - mid[1]) * (0.3 + k * 0.2), mid[2] + (top[2] - mid[2]) * (0.3 + k * 0.2)];
          const len = h * (0.28 + rand() * 0.22);
          const end = [from[0] + Math.cos(a) * len * 0.8, from[1] + Math.sin(a) * len * 0.8, from[2] + len * (0.3 + rand() * 0.5)];
          m.limb(from, end, 0.75, 0.3, dark);
          const a2 = a + (rand() - 0.5) * 1.8;
          const l2 = len * 0.55;
          m.limb(end, [end[0] + Math.cos(a2) * l2, end[1] + Math.sin(a2) * l2, end[2] + l2 * (rand() * 0.9 - 0.2)], 0.3, 0.1, dark);
        }
      }
    }
    if (sh.stand) {
      // Crumbling stone seats, rising away from the track, full of ghosts (pale, glowing) and
      // skeletons (bone), under a roof in the room's colour.
      const s = sh.stand;
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      const nx = -sa * s.side, ny = ca * s.side;
      const crowd = seeded(`${tr.id}:crowd`);
      const seat = [0.3, 0.28, 0.34];
      for (let row = 0; row < 4; row++) {
        const off = -s.depth / 2 + 4 + row * 6.5;
        m.box(s.x + nx * off, s.y + ny * off, s.a, s.len / 2, 3.25, 0, 4 + row * 4, seat);
        for (let k = 0; k < 30; k++) {
          const u = -s.len / 2 + 4 + k * 5.6 + (crowd() - 0.5);
          const ghost = crowd() < 0.6;
          crowd();
          const z = 4 + row * 4;
          const tall = crowd() * 0.8;
          const x = s.x + nx * off + ca * u;
          const y = s.y + ny * off + sa * u;
          if (ghost) {
            const col = [0.78, 0.86, 0.94];
            m.box(x, y, s.a, 1.7, 1.5, z, z + 2.4, col, 4);
            m.box(x, y, s.a, 1.3, 1.2, z + 2.4, z + 4.6 + tall, col, 4);
            for (const e of [-0.55, 0.55]) m.box(x - nx * 1.25 + ca * e, y - ny * 1.25 + sa * e, s.a, 0.3, 0.12, z + 3.2 + tall, z + 4 + tall, [0.05, 0.05, 0.08], 0, false);
          } else {
            const bone = [0.82, 0.78, 0.66];
            m.box(x, y, s.a, 0.9, 0.7, z, z + 3.4, bone, 4);
            m.box(x, y, s.a, 1.1, 1.1, z + 3.6 + tall * 0.5, z + 5.6 + tall * 0.5, bone, 4);
            for (const e of [-0.45, 0.45]) m.box(x - nx * 1.15 + ca * e, y - ny * 1.15 + sa * e, s.a, 0.38, 0.12, z + 4.4 + tall * 0.5, z + 5.1 + tall * 0.5, [0.05, 0.04, 0.05], 0, false);
          }
        }
      }
      const back = s.depth / 2;
      m.box(s.x + nx * back, s.y + ny * back, s.a, s.len / 2, 1.2, 0, 26, seat);
      for (const u of [-s.len / 2 + 2, 0, s.len / 2 - 2]) m.box(s.x - nx * (back - 3) + ca * u, s.y - ny * (back - 3) + sa * u, s.a, 0.8, 0.8, 0, 26, seat);
      m.box(s.x, s.y, s.a, s.len / 2 + 2, s.depth / 2 + 2, 26, 27.5, pal.accentRgb, 4);
    }
    // The gothic arch: pillars either side with pinnacles (a jack-o'-lantern on each), a pointed
    // arch over the road, the beam across with the start lights.
    const i = sh.startI;
    const a = sh.head[i];
    const span = tr.width / 2 + 12;
    const P = (off, z) => [sh.xs[i] + sh.nx[i] * off, sh.ys[i] + sh.ny[i] * off, z];
    for (const side of [-1, 1]) {
      const [x, y] = P(span * side, 0);
      m.box(x, y, a, 3, 3, 0, 44, stone);
      m.box(x, y, a, 3.6, 3.6, 36, 38, stone);
      m.cyl(x, y, 44, 47, 3.4, 3.4, stone, 4);
      pumpkin(m, x, y, 47, 4.4, a + Math.PI);
    }
    // (Each side an arc, from the pillar up to the point.)
    const R = (span - 3) * 1.4;
    const top = Math.acos(0.4 / 1.4);
    for (const side of [-1, 1]) {
      let prev = null;
      for (let k = 0; k <= 8; k++) {
        const phi = (k / 8) * top;
        const p = P(side * (-0.4 * (span - 3) + R * Math.cos(phi)), 38 + 0.42 * R * Math.sin(phi));
        if (prev) m.limb(prev, p, 1.9, 1.9, stone);
        prev = p;
      }
    }
    const [ax, ay] = P(0, 0);
    pumpkin(m, ax, ay, 38 + 0.42 * R * Math.sin(top) + 0.5, 3.2, a + Math.PI);
    m.box(sh.xs[i], sh.ys[i], a, 2.2, span - 2, 30, 36, iron);
    m.box(sh.xs[i] - Math.cos(a) * 2.4, sh.ys[i] - Math.sin(a) * 2.4, a, 0.3, span - 6, 31, 35, pal.accentRgb, 4, false);
    for (let k = -2; k <= 2; k++) {
      m.box(sh.xs[i] - Math.cos(a) * 3 + sh.nx[i] * k * 6, sh.ys[i] - Math.sin(a) * 3 + sh.ny[i] * k * 6, a, 0.5, 2, 31.6, 34.4, [1, 1, 1], 3, false);
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

  // ---------- The cars ----------
  //
  // Each driver picks their car (games/trackRacing.js: the body, a paint, a stripe, one extra),
  // and every screen builds it from the same few boxes: in 3D from the car, and from above on the
  // TV, the maps and the garage's preview (the same model, drawn flat: see flatModel). Nose along
  // +x, its right side +y; the body in the paint (tint 1, so one model does any colour), the
  // stripe and the extras in their own colours.
  const PLAIN = { body: 'sports', paint: null, stripe: null, extra: 'none', n: 0 };
  const BODY_NAMES = { sports: '🏎️ Sports car', pickup: '🛻 Pickup', van: '🚐 Minibus', buggy: '🏖️ Beach buggy', hotrod: '🔥 Hot rod', trolley: '🛒 Trolley' };
  const EXTRA_NAMES = { none: 'Nothing', spoiler: '✈️ Spoiler', keg: '🛢️ A keg', flames: '🔥 Flames', number: '#️⃣ Your number', cone: '🚧 Traffic cone' };
  const lookOf = (id, s = PB.state) => s?.game?.looks?.[id] || PLAIN;
  const paintOf = (id, s = PB.state) => lookOf(id, s).paint || PB.look(id).color;

  const WHITE = [1, 1, 1];
  const GLASS = [0.08, 0.1, 0.16];
  const TYRE = [0.07, 0.07, 0.08];
  const CHROME = [0.72, 0.74, 0.78];
  const DARK = [0.13, 0.13, 0.15];
  // Tail lights (tint 2: the brake lights) and headlights (tint 4: lit at night), both sides.
  function lights(m, tail, nose, y, z0, z1) {
    for (const s of [-y, y]) m.box(tail - 0.15, s, 0, 0.2, 1.6, z0, z1, [1, 0.3, 0.25], 2, false);
    for (const s of [-y, y]) m.box(nose + 0.15, s, 0, 0.2, 1.5, z0 - 0.4, z1 - 0.4, [1, 0.97, 0.85], 4, false);
  }
  const wheels = (m, spots) => { for (const [x, y, hl, hw, h] of spots) m.box(x, y, 0, hl, hw, 0, h, TYRE); };
  // Each body, built into m; what it says back is where the extras go: the roof (x, z, half its
  // length and width), the tail (x) and how high a spoiler stands on it, the bonnet (from x0 to x1
  // at z, half as wide) and the sides (for flames), where a keg rides, the back for a number, and
  // the flat tops a stripe runs over ([x, half length, z, half width]).
  const BODIES = {
    sports(m, look) {
      m.box(0, 0, 0, 14, 7, 1.6, 5.6, WHITE, 1);
      m.box(10.5, 0, 0, 4.5, 6.2, 1.6, 4.4, WHITE, 1);
      m.box(-2, 0, 0, 6.5, 5.6, 5.6, 9.4, GLASS);
      m.box(-2.5, 0, 0, 5, 5.7, 9.4, 9.9, WHITE, 1);
      if (look.extra !== 'spoiler') {
        m.box(-13.4, 0, 0, 1.4, 7.4, 8, 9, WHITE, 1);
        for (const y of [-4.5, 4.5]) m.box(-13, y, 0, 0.6, 0.6, 5.6, 8, TYRE);
      }
      wheels(m, [[-8.5, -7.4, 3.3, 1.5, 5], [8.5, -7.4, 3.3, 1.5, 5], [-8.5, 7.4, 3.3, 1.5, 5], [8.5, 7.4, 3.3, 1.5, 5]]);
      lights(m, -14, 15, 4.6, 3.6, 5.2);
      m.box(15.1, 0, 0, 0.2, 4.5, 2, 3.4, [0.12, 0.12, 0.14], 0, false);
      return { roof: [-2.5, 9.9, 5, 5.7], tail: -14, deck: 5.6, hood: [4.6, 14, 5.6, 6], side: [-12, 12, 2, 5.4, 7], keg: [-2.5, 9.9, true], back: [-14, 3.4], tops: [[-2.5, 5, 9.9, 5.7], [9.3, 4.7, 5.6, 7], [-11, 3, 5.6, 7]] };
    },
    // A cab up front and an open bed behind, on big tyres.
    pickup(m) {
      m.box(0, 0, 0, 15, 7, 2.2, 5.4, WHITE, 1);
      m.box(10.5, 0, 0, 4.5, 6.8, 5.4, 6.8, WHITE, 1);
      m.box(2.5, 0, 0, 3.5, 6.8, 5.4, 11.6, WHITE, 1);
      m.box(2.5, 0, 0, 3.6, 6.9, 7.6, 10.8, GLASS);
      m.box(-8.4, 0, 0, 6.6, 5.9, 5.4, 5.6, DARK);
      for (const y of [-6.5, 6.5]) m.box(-8.4, y, 0, 6.6, 0.5, 5.4, 8, WHITE, 1);
      m.box(-14.6, 0, 0, 0.4, 7, 5.4, 8, WHITE, 1);
      m.box(15.1, 0, 0, 0.3, 5.5, 2.4, 4.6, CHROME, 0, false);
      wheels(m, [[-9, -7.6, 3.8, 1.8, 6], [9, -7.6, 3.8, 1.8, 6], [-9, 7.6, 3.8, 1.8, 6], [9, 7.6, 3.8, 1.8, 6]]);
      lights(m, -15, 15, 5, 4.6, 6.2);
      return { roof: [2.5, 11.6, 3.5, 6.8], tail: -15, deck: 8, hood: [6, 14.6, 6.8, 6.4], side: [-14, 14, 2.6, 5.2, 7], keg: [-8.4, 5.6, false], back: [-15, 6.6], tops: [[2.5, 3.5, 11.6, 6.8], [10.5, 4.5, 6.8, 6.8]] };
    },
    // A tall box with a band of windows all round.
    van(m) {
      m.box(0, 0, 0, 14.5, 7, 1.8, 12.6, WHITE, 1);
      m.box(0.8, 0, 0, 13.9, 7.1, 7.8, 11.2, GLASS);
      m.box(-14.6, 0, 0, 0.1, 5, 8, 11, GLASS, 0, false);
      m.box(14.6, 0, 0, 0.3, 6, 2.2, 4.4, [0.85, 0.85, 0.88], 0, false);
      wheels(m, [[-9.5, -7.3, 3, 1.4, 4.6], [9.5, -7.3, 3, 1.4, 4.6], [-9.5, 7.3, 3, 1.4, 4.6], [9.5, 7.3, 3, 1.4, 4.6]]);
      lights(m, -14.5, 14.5, 5, 4.8, 6.6);
      return { roof: [-0.5, 12.6, 11, 6.6], tail: -14.5, deck: 12.6, hood: [9, 14.2, 12.6, 6], side: [-13, 13, 2.4, 7.4, 7], keg: [-0.5, 12.6, true], back: [-14.5, 4], tops: [[0, 14.5, 12.6, 7]] };
    },
    // An open tub with a roll bar, fat tyres at the back, the engine out in the open.
    buggy(m) {
      m.box(-1, 0, 0, 11, 6, 2.6, 5.4, WHITE, 1);
      m.box(11, 0, 0, 3.6, 5, 2.6, 4.6, WHITE, 1);
      for (const x of [-4, 2.5]) m.box(x, 0, 0, 2, 4.4, 5.4, 6.6, DARK);
      for (const x of [-4, 2.5]) m.box(x - 1.8, 0, 0, 0.5, 4.4, 6.6, 9.6, DARK);
      for (const y of [-5, 5]) m.box(-6.8, y, 0, 0.5, 0.5, 5.4, 11.4, DARK);
      m.box(-6.8, 0, 0, 0.55, 5.5, 11, 11.8, DARK);
      m.box(-12.6, 0, 0, 1.6, 3.2, 3, 6.4, CHROME);
      wheels(m, [[9.5, -6.8, 2.8, 1.4, 4.6], [9.5, 6.8, 2.8, 1.4, 4.6], [-8, -7.4, 4.2, 2.2, 7.2], [-8, 7.4, 4.2, 2.2, 7.2]]);
      lights(m, -12, 14.6, 3.8, 3.6, 5);
      return { roof: [-6.8, 11.8, 0.6, 5.5], tail: -12, deck: 5.4, hood: [6, 14.4, 5.4, 4.6], side: [-11, 9, 2.8, 5.2, 6], keg: [-9.6, 6.4, false], back: [-14.3, 4.6], tops: [[-1, 11, 5.4, 6], [11, 3.6, 4.6, 5]] };
    },
    // A long bonnet with the engine poking out of it, a chopped little cab, big wheels at the back.
    hotrod(m) {
      m.box(0, 0, 0, 14, 5.2, 2.2, 5.6, WHITE, 1);
      m.box(6, 0, 0, 8, 4.4, 5.6, 7.2, WHITE, 1);
      m.box(4.8, 0, 0, 3, 3, 7.2, 9.2, CHROME);
      for (const y of [-1.6, 1.6]) m.cyl(3, y, 9.2, 11.2, 0.7, 0.7, CHROME, 6);
      m.box(14.3, 0, 0, 0.4, 3.6, 2.4, 7, CHROME);
      for (const y of [-5.8, 5.8]) m.box(3, y, 0, 6.5, 0.5, 2, 2.9, CHROME);
      m.box(-7, 0, 0, 4.5, 5.2, 5.6, 11, WHITE, 1);
      m.box(-6.6, 0, 0, 4.2, 5.3, 8, 10.2, GLASS);
      for (const y of [-6.4, 6.4]) m.box(-8.5, y, 0, 4.6, 1.4, 4.4, 7.6, WHITE, 1);
      wheels(m, [[10, -6, 2.6, 1.3, 4.6], [10, 6, 2.6, 1.3, 4.6], [-8.5, -6.6, 4, 2, 7.2], [-8.5, 6.6, 4, 2, 7.2]]);
      lights(m, -14, 14.5, 3.4, 3.6, 5.2);
      return { roof: [-7, 11, 4.5, 5.2], tail: -14, deck: 5.6, hood: [-1.5, 13.6, 7.2, 4.4], side: [-12, 13, 2.6, 5.4, 5.2], keg: [-7, 11, true], back: [-14, 3.4], tops: [[-7, 4.5, 11, 5.2], [10.5, 3.5, 7.2, 4.4]] };
    },
    // A shopping trolley: a wire basket on castors, plastic panels and handle in the paint, and
    // its driver sitting in it in a helmet.
    trolley(m) {
      for (const y of [-5, 5]) m.box(0, y, 0, 12, 0.4, 1.8, 2.4, CHROME);
      m.box(1, 0, 0, 11.6, 6.4, 4.6, 5.2, WHITE, 1);
      for (const y of [-6.5, 6.5]) m.box(1, y, 0, 11.6, 0.25, 5.2, 8.6, WHITE, 1);
      m.box(12.5, 0, 0, 0.25, 6.4, 5.2, 8.6, WHITE, 1);
      for (let x = -10; x <= 12; x += 2.75) for (const y of [-6.5, 6.5]) m.box(x, y, 0, 0.18, 0.18, 8.6, 12.8, CHROME, 0, false);
      for (let y = -5.2; y <= 5.2; y += 2.6) for (const x of [-10.6, 12.6]) m.box(x, y, 0, 0.18, 0.18, 5.2, 12.8, CHROME, 0, false);
      for (const z of [10.6, 12.8]) {
        for (const y of [-6.5, 6.5]) m.box(1, y, 0, 11.7, 0.3, z - 0.3, z + 0.3, CHROME);
        for (const x of [-10.6, 12.6]) m.box(x, 0, 0, 0.3, 6.6, z - 0.3, z + 0.3, CHROME);
      }
      for (const y of [-5.5, 5.5]) m.box(-12, y, 0, 1.4, 0.3, 12.8, 13.4, CHROME);
      m.box(-13.4, 0, 0, 0.6, 6.4, 12.8, 14.2, WHITE, 1);
      m.cyl(-1.5, 0, 5.2, 10, 3.4, 3.4, [0.85, 0.66, 0.5], 8);
      m.cyl(-1.5, 0, 10, 13.6, 3, 3, WHITE, 8, 1);
      m.box(1.4, 0, 0, 0.3, 2.4, 11.2, 12.6, GLASS);
      wheels(m, [[-10, -5, 1.6, 0.8, 2.2], [11, -5, 1.6, 0.8, 2.2], [-10, 5, 1.6, 0.8, 2.2], [11, 5, 1.6, 0.8, 2.2]]);
      lights(m, -10.6, 12.6, 4, 5.6, 7.4);
      return { roof: [6, 12.8, 5, 6.4], tail: -10.6, deck: 13.4, hood: [4, 12.6, 5.2, 5.6], side: [-10, 12, 5.4, 8.4, 6.5], keg: [6.5, 5.2, false], back: [-10.8, 7], tops: [[1, 11.6, 5.2, 6.4], [-13.4, 0.6, 14.2, 6.4]] };
    },
  };

  // A number in seven-segment bars, in a square (u across, v up) centred on 0, ~3 tall each.
  const SEGS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  function digitBars(n, put) {
    const text = String(n);
    const w = 1.5, h = 1.4, t = 0.28; // half width, half height, half thickness
    const bars = { a: [0, h, w, t], d: [0, -h, w, t], g: [0, 0, w, t], f: [-w, h / 2, t, h / 2 + t], b: [w, h / 2, t, h / 2 + t], e: [-w, -h / 2, t, h / 2 + t], c: [w, -h / 2, t, h / 2 + t] };
    [...text].forEach((ch, k) => {
      const du = (k - (text.length - 1) / 2) * (w * 2 + 1.1);
      for (const seg of SEGS[ch] || '') { const [u, v, hu, hv] = bars[seg]; put(u + du, v, hu, hv); }
    });
  }

  // The whole car: its body, the stripe, the extra. Its shadow too, but not for the views from
  // above (they draw their own, off to one side).
  function carModel(look = PLAIN, { shadow = true } = {}) {
    const m = mesher();
    if (shadow) m.quad([-15, -9, 0.15], [16, -9, 0.15], [16, 9, 0.15], [-15, 9, 0.15], [0.05, 0.05, 0.06]);
    const at = (BODIES[look.body] || BODIES.sports)(m, look);
    const stripe = look.stripe ? rgb(look.stripe) : null;
    // Twin stripes nose to tail over every flat top.
    if (stripe) for (const [x, hl, z, hw] of at.tops) for (const y of [-hw * 0.28, hw * 0.28]) m.box(x, y, 0, hl + 0.05, hw * 0.13, z, z + 0.12, stripe);
    const [rx, rz, rl, rw] = at.roof;
    if (look.extra === 'spoiler') {
      const wing = stripe || DARK;
      const x = at.tail + 1.4;
      for (const y of [-4, 4]) m.box(x, y, 0, 0.5, 0.5, at.deck, at.deck + 3.4, DARK);
      m.box(x - 0.2, 0, 0, 1.8, 7.6, at.deck + 3.2, at.deck + 4.2, wing);
      for (const y of [-7.6, 7.6]) m.box(x - 0.2, y, 0, 1.9, 0.2, at.deck + 2.4, at.deck + 4.6, DARK);
    } else if (look.extra === 'keg') {
      // Lying along the car on a roof rack (or in the back), so from behind it's a keg's end.
      const [kx, kz, rack] = at.keg;
      if (rack) {
        for (const y of [-rw + 0.6, rw - 0.6]) m.box(rx, y, 0, rl, 0.35, kz, kz + 1, DARK);
        for (const x of [rx - rl + 1, rx + rl - 1]) m.box(x, 0, 0, 0.35, rw - 0.4, kz + 0.6, kz + 1, DARK);
      }
      const z = kz + (rack ? 1 : 0.1) + 2.7;
      m.drum(kx, 0, z, 3.6, 2.7, CHROME, 10);
      for (const x of [kx - 2.6, kx + 2.6]) m.drum(x, 0, z, 0.4, 2.85, DARK, 10);
      m.box(kx, 0, 0, 0.6, 0.6, z + 2.6, z + 3.6, DARK);
    } else if (look.extra === 'cone') {
      const z = rz + 0.05;
      const orange = [1, 0.42, 0.08];
      m.box(rx, 0, 0, 2.6, 2.6, z, z + 0.6, orange);
      m.cyl(rx, 0, z + 0.6, z + 2.6, 2.1, 1.55, orange, 8);
      m.cyl(rx, 0, z + 2.6, z + 3.7, 1.55, 1.15, WHITE, 8);
      m.cyl(rx, 0, z + 3.7, z + 6.4, 1.15, 0, orange, 8);
    } else if (look.extra === 'number') {
      // A white roundel on the roof, and a plate on the back: the driver's seat number.
      const n = look.n || 1;
      const z = rz + 0.05;
      m.box(rx, 0, 0, Math.min(rl, 3.4), Math.min(rw, 2.6 + String(n).length * 1.4), z, z + 0.15, WHITE);
      digitBars(n, (u, v, hu, hv) => m.box(rx + v, u, 0, hv, hu, z + 0.15, z + 0.3, DARK));
      const [bx, bz] = at.back;
      m.box(bx - 0.1, 0, 0, 0.12, 1.4 + String(n).length * 1.5, bz - 2, bz + 2, WHITE);
      digitBars(n, (u, v, hu, hv) => m.box(bx - 0.3, u, 0, 0.1, hu, bz + v - hv, bz + v + hv, DARK));
    } else if (look.extra === 'flames') {
      // Flames licking back over the bonnet, and along both sides.
      const [x0, x1, z, hw] = at.hood;
      const len = x1 - x0;
      const up = shade(0, 0, 1);
      for (let k = 0; k < 5; k++) {
        const y = -hw * 0.8 + (k * hw * 1.6) / 4;
        const reach = len * (k % 2 ? 0.62 : 0.92);
        const bend = (k - 2) * 0.5;
        m.tri([x1 - 0.3, y - 1.3, z + 0.1], [x1 - 0.3, y + 1.3, z + 0.1], [x1 - reach, y + bend, z + 0.1], [1 * up, 0.42 * up, 0.05 * up]);
        m.tri([x1 - 0.3, y - 0.6, z + 0.16], [x1 - 0.3, y + 0.6, z + 0.16], [x1 - reach * 0.55, y + bend * 0.6, z + 0.16], [1 * up, 0.85 * up, 0.2 * up]);
      }
      const [sx0, sx1, sz0, sz1, sw] = at.side;
      for (const y of [-sw - 0.06, sw + 0.06]) {
        for (let k = 0; k < 3; k++) {
          const zc = sz0 + ((k + 0.5) * (sz1 - sz0)) / 3;
          const reach = (sx1 - sx0) * (k === 1 ? 0.75 : 0.5);
          m.tri([sx1, y, zc - (sz1 - sz0) / 6], [sx1, y, zc + (sz1 - sz0) / 6], [sx1 - reach, y, zc + 0.6], [0.95, 0.4, 0.05]);
        }
      }
    }
    return { v: new Float32Array(m.v), top: Math.max(rz, ...at.tops.map((t) => t[2])) + ({ keg: 7, cone: 6.4, spoiler: 0 }[look.extra] || 0) };
  }
  const meshKey = (look) => `${look.body}:${look.stripe}:${look.extra}:${look.extra === 'number' ? look.n : ''}`;

  // A model drawn with a 2D canvas: each triangle flat, back to front. `place(x, y, z, out, k)`
  // puts a corner on the canvas (out[k], out[k + 1]) and says how far off it is. The colours are
  // worked out once (the paint in, for tint 1); each frame only the corners move.
  function flatModel(v, paint) {
    const n = v.length / 21;
    const tint = rgb(paint, [0.9, 0.3, 0.3]);
    const fill = [];
    for (let i = 0; i < n; i++) {
      const o = i * 21;
      const t = v[o + 6];
      let col = [v[o + 3], v[o + 4], v[o + 5]];
      if (t > 1.5 && t < 2.5) col = mix(col.map((q) => q * 0.45), [1, 0.15, 0.1], 0.35);
      else if (t > 0.5 && t < 1.5) col = col.map((q, j) => q * tint[j]);
      fill.push(hex(col));
    }
    const order = Array.from({ length: n }, (_, i) => i);
    const fm = { v, n, fill, order, xy: new Float32Array(n * 6), depth: new Float32Array(n), area: new Float32Array(n) };
    fm.cmp = (a, b) => fm.depth[b] - fm.depth[a];
    return fm;
  }
  function drawFlat(c, fm, place) {
    const { v, xy, depth, area } = fm;
    for (let i = 0; i < fm.n; i++) {
      const o = i * 21;
      depth[i] = (place(v[o], v[o + 1], v[o + 2], xy, i * 6) + place(v[o + 7], v[o + 8], v[o + 9], xy, i * 6 + 2) + place(v[o + 14], v[o + 15], v[o + 16], xy, i * 6 + 4)) / 3;
      const k = i * 6;
      area[i] = (xy[k + 2] - xy[k]) * (xy[k + 5] - xy[k + 1]) - (xy[k + 4] - xy[k]) * (xy[k + 3] - xy[k + 1]);
    }
    fm.order.sort(fm.cmp);
    c.lineWidth = 0.6;
    c.lineJoin = 'round';
    for (const i of fm.order) {
      if (Math.abs(area[i]) < 0.05) continue; // (seen edge on)
      const k = i * 6;
      c.fillStyle = c.strokeStyle = fm.fill[i];
      c.beginPath();
      c.moveTo(xy[k], xy[k + 1]);
      c.lineTo(xy[k + 2], xy[k + 3]);
      c.lineTo(xy[k + 4], xy[k + 5]);
      c.closePath();
      c.fill();
      c.stroke(); // (so the seams don't show)
    }
  }

  // Each car seen from above, painted once into a little picture (redone when its look or paint
  // changes: checked once per screen drawn, not every frame).
  const SPRITE_K = 4; // pixels a unit
  const SPRITE = { x: 18, y: 12 }; // half its size, in units
  const sprites = {}; // id -> { key, cv, gen }
  let spriteGen = 0;
  function spriteOf(id) {
    const have = sprites[id];
    if (have && have.gen === spriteGen) return have.cv;
    const look = lookOf(id);
    const paint = paintOf(id);
    const key = `${meshKey(look)}:${paint}`;
    if (have && have.key === key) { have.gen = spriteGen; return have.cv; }
    const cv = document.createElement('canvas');
    cv.width = SPRITE.x * 2 * SPRITE_K;
    cv.height = SPRITE.y * 2 * SPRITE_K;
    const fm = flatModel(carModel(look, { shadow: false }).v, paint);
    drawFlat(cv.getContext('2d'), fm, (x, y, z, out, k) => {
      out[k] = (x + SPRITE.x) * SPRITE_K;
      out[k + 1] = (y + SPRITE.y) * SPRITE_K;
      return -z;
    });
    sprites[id] = { key, cv, gen: spriteGen };
    return cv;
  }

  // Little pictures of the cars in the lists (bets, standings, results): <canvas data-carpic>.
  function carPic(id) { return `<canvas class="tr-carpic" data-carpic="${esc(id)}" width="${SPRITE.x * 2 * 2}" height="${SPRITE.y * 2 * 2}" aria-hidden="true"></canvas>`; }
  function paintPics(root = document) {
    root.querySelectorAll('canvas[data-carpic]').forEach((cv) => {
      const c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      c.drawImage(spriteOf(cv.dataset.carpic), 0, 0, cv.width, cv.height);
    });
  }

  // The sky all the way round: the room's colours, hills, a treeline, a few lights far off.
  // The sky's colours: the room's, or mostly the weather's.
  function skyColours(pal, wx) {
    const top = mix(pal.bg, [0, 0, 0], 0.2);
    const horizon = mix(mix(pal.card2, pal.accentRgb, 0.22), [1, 1, 1], 0.12);
    if (!wx.sky) return [top, horizon];
    return [mix(top, rgb(wx.sky[0]), 0.8), mix(horizon, rgb(wx.sky[1]), 0.8)];
  }
  // Halloween's sky (after the room's haunted hill): purple overhead going green at the horizon,
  // stars, a big full moon low down with bats across it, hills with dead trees and crosses on them,
  // and the haunted house on its hill, its windows lit. 2048 across (more of it's seen up close).
  // (The moon rises a little off the start's heading, so it's there as the lights go out.)
  const MOON = { az: 1.9, el: 0.135, r: 0.085 };
  const moonFor = (tr) => { MOON.az = (((tr.start[2] + 0.3) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); };
  function hauntedSky(pal, wx) {
    const W = 2048;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 256;
    const c = cv.getContext('2d');
    const kx = W / (Math.PI * 2); // pixels a radian, round
    const ky = 256 / 0.55; // ...and up (see GROUND_FS)
    const fog = !!wx.mute;
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, wx.sky[0]);
    g.addColorStop(0.45, fog ? '#2a2040' : '#1a0b2e');
    g.addColorStop(0.75, fog ? '#40345a' : '#3a1d4c');
    g.addColorStop(0.92, fog ? '#4a5254' : '#2c4438');
    g.addColorStop(1, wx.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, 256);
    const rand = seeded('haunted-sky');
    if (!fog) {
      for (let k = 0; k < 140; k++) {
        c.fillStyle = `rgba(232, 224, 255, ${0.2 + rand() * 0.55})`;
        c.fillRect(rand() * W, rand() * 170, 1.5, 1.5);
      }
    }
    // The moon: a glow round it, the moon, its seas, a wisp of cloud (twice near the join, so it
    // wraps round).
    for (const wrap of [-W, 0, W]) {
    c.save();
    c.translate(MOON.az * kx + wrap, 256 - MOON.el * ky);
    c.scale(kx, ky);
    const halo = c.createRadialGradient(0, 0, MOON.r * 0.8, 0, 0, MOON.r * 4);
    halo.addColorStop(0, `rgba(255, 240, 210, ${fog ? 0.32 : 0.45})`);
    halo.addColorStop(0.35, 'rgba(220, 190, 255, 0.12)');
    halo.addColorStop(1, 'rgba(200, 160, 255, 0)');
    c.fillStyle = halo;
    c.fillRect(-MOON.r * 4, -MOON.r * 4, MOON.r * 8, MOON.r * 8);
    c.fillStyle = fog ? '#e8e0cc' : '#fff2cc';
    c.beginPath();
    c.arc(0, 0, MOON.r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(214, 196, 150, 0.6)';
    for (const [x, y, r] of [[-0.3, 0.25, 0.18], [0.3, -0.2, 0.24], [0.18, 0.4, 0.1], [-0.36, -0.3, 0.12], [0.48, 0.14, 0.08]]) {
      c.beginPath();
      c.arc(x * MOON.r, y * MOON.r, r * MOON.r, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(18, 10, 30, 0.85)';
    c.beginPath();
    c.ellipse(-0.02, -0.035, 0.16, 0.012, 0, 0, Math.PI * 2);
    c.ellipse(0.06, -0.062, 0.1, 0.008, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    const [up, down] = batSprites();
    for (const [da, de, sz, k] of [[-0.06, 0.03, 14, 0], [0.05, -0.01, 18, 1], [0.1, 0.07, 10, 0], [-0.12, 0.09, 9, 1], [0.02, 0.12, 8, 0]]) {
      c.drawImage(k ? up : down, (MOON.az + da) * kx + wrap - sz / 2, 256 - (MOON.el + de) * ky - sz / 4, sz, sz / 2);
    }
    }
    // The hills (whole numbers of waves round, so the join doesn't show).
    const hill = (x, base, amp, waves, phase) => {
      const t = (x / W) * Math.PI * 2;
      return 256 - base - amp * (0.6 * Math.sin(t * waves[0] + phase) + 0.3 * Math.sin(t * waves[1] + phase * 2) + 0.1 * Math.sin(t * waves[2]));
    };
    const ridge = (col, ...a) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, 256);
      for (let x = 0; x <= W; x += 8) c.lineTo(x, hill(x, ...a));
      c.lineTo(W, 256);
      c.fill();
    };
    const far = [30, 22, [2, 5, 13], 1];
    const near = [12, 10, [3, 7, 31], 4];
    ridge(fog ? '#3a3446' : '#1a1028', ...far);
    // The haunted house on its hill (the room's, shrunk: 0.7 as wide as high, as the sky's stretched).
    const hx = ((MOON.az + 0.32) * kx) % (W - 80) + 40;
    const hy = hill(hx, ...far) + 4;
    c.fillStyle = fog ? '#363042' : '#140c20';
    c.beginPath();
    c.ellipse(hx, hy + 6, 60, 22, 0, Math.PI, 0);
    c.fill();
    c.save();
    c.translate(hx, hy - 4);
    c.scale(0.2 * 0.7, 0.2);
    c.translate(-1090, -500);
    c.fillStyle = fog ? '#2e2838' : '#0c0814';
    c.fill(new Path2D('M980 300 H1200 V500 H980Z M970 304 L1090 230 L1210 304Z M960 240 H1020 V500 H960Z M952 244 L990 150 L1028 244Z M1150 220 H1168 V280 H1150Z M1050 210 H1130 V236 H1050Z M988 150 V118 H992 V150Z'));
    for (const [x, y, k] of [[972, 270, 1], [1000, 330, 1], [1060, 330, 2], [1120, 330, 1], [1160, 330, 0], [1000, 410, 1], [1080, 410, 1], [1150, 410, 2], [972, 420, 0]]) {
      c.fillStyle = ['#1a1024', '#ffb040', '#7cff9a'][k];
      c.fillRect(x, y, 26, 38);
    }
    c.fillStyle = '#ffb040';
    c.fillRect(1078, 460, 24, 40);
    c.restore();
    ridge(fog ? '#2c2836' : '#0e0816', ...near);
    // Dead trees and crosses along the nearer hills.
    c.strokeStyle = c.fillStyle = fog ? '#24202c' : '#07040b';
    c.lineCap = 'round';
    for (let k = 0; k < 22; k++) {
      const x = rand() * W;
      if (Math.abs(x - hx) < 70 || Math.abs(x - MOON.az * kx) < 30) continue;
      const y = hill(x, ...near) + 2;
      const s = 0.5 + rand() * 0.7;
      if (rand() < 0.35) {
        c.fillRect(x - 0.8, y - 9 * s, 1.6, 9 * s);
        c.fillRect(x - 2.6 * s, y - 7 * s, 5.2 * s, 1.4);
        continue;
      }
      const h = 26 * s;
      c.lineWidth = 2.4 * s;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + (rand() - 0.5) * 6, y - h * 0.5, x + (rand() - 0.5) * 5, y - h);
      for (const [f, dx, dy] of [[0.55, -10, -10], [0.7, 9, -12], [0.85, -6, -8], [0.6, 12, -4]]) {
        const bx = x;
        const by = y - h * f;
        c.moveTo(bx, by);
        c.quadraticCurveTo(bx + dx * s * 0.5, by + dy * s * 0.3, bx + dx * s * 0.7 * 1.4, by + dy * s);
      }
      c.stroke();
    }
    // Lights in the valley: a lantern or two, the odd green glow.
    for (let k = 0; k < 30; k++) {
      c.fillStyle = rand() < 0.75 ? `rgba(255, 150, 50, ${0.4 + rand() * 0.4})` : `rgba(124, 255, 154, ${0.4 + rand() * 0.4})`;
      c.fillRect(rand() * W, 240 + rand() * 10, 2, 2);
    }
    return cv;
  }

  function skyCanvas(pal, wx) {
    if (wx.moon) return hauntedSky(pal, wx);
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
        const it = art.items[p.which % art.items.length];
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
    light: new Float32Array(3), // the weather's light this frame (lightning and all)
    drops: null, // rain or snow falling over the view: x, y (0 to 1) and how fast, each
    wasAt: new Float32Array(16), // where each car was last frame, for the spray

    attach(s) {
      const el = document.querySelector('.tr-view');
      if (!el) { this.el = null; return; }
      if (!this.cv) this.create();
      this.models(s);
      el.prepend(this.cv, this.hud);
      this.el = el;
      this.w = 0; // sized on the next frame
    },
    detach() { this.el = null; this.last = 0; },

    // Each car's model, built when the screen is (a car only changes between races), and the
    // chase cam lifted over your own if it's a tall one (a minibus, a keg on the roof).
    models(s) {
      const gl = this.gl;
      if (!gl || this.failed) return;
      this.meshes ||= {};
      this.lift = 0;
      for (const id of s.game.carIds || []) {
        const look = lookOf(id, s);
        const key = meshKey(look);
        let have = this.meshes[id];
        if (!have || have.key !== key) {
          const { v, top } = carModel(look);
          have ||= this.meshes[id] = { buf: gl.createBuffer() };
          gl.bindBuffer(gl.ARRAY_BUFFER, have.buf);
          gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
          Object.assign(have, { key, count: v.length / 7, top });
        }
        if (id === s.me) this.lift = Math.max(0, Math.min(9, (have.top - 10) * 0.9));
      }
    },

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
      const prog = (vs, fsrc) => program(gl, vs, fsrc);
      this.ground = prog(GROUND_VS, GROUND_FS);
      this.model = prog(MODEL_VS, MODEL_FS);
      this.sprite = prog(PROP_VS, PROP_FS);
      if (!this.ground || !this.model || !this.sprite) return false;
      this.quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const car = carModel().v;
      this.carBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.carBuf);
      gl.bufferData(gl.ARRAY_BUFFER, car, gl.STATIC_DRAW);
      this.carCount = car.length / 7;
      const ghost = carModel(PHANTOM_LOOK, { shadow: false }).v;
      this.ghostBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ghostBuf);
      gl.bufferData(gl.ARRAY_BUFFER, ghost, gl.STATIC_DRAW);
      this.ghostCount = ghost.length / 7;
      for (const id in this.meshes) gl.deleteBuffer(this.meshes[id].buf);
      this.meshes = {};
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
      const wx = wxOf(s);
      this.wx = wx;
      this.spooky = haunted(s);
      if (wx.moon) moonFor(tr);
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
      // (The ones that glow go last, drawn on their own: lit from inside, flickering. At Halloween,
      // its gravestones and jack-o'-lanterns round the track too.)
      const v = [];
      const lit = [];
      const glowAt = [];
      const cutout = (it, x, y, size, lift) => {
        const u0 = (it.cell + 0.005) / art.cols;
        const u1 = (it.cell + 0.995) / art.cols;
        const h = size / 2;
        const z0 = lift;
        const z1 = lift + size;
        const out = it.glow ? lit : v;
        for (const [o, z, u, t] of [[-h, z0, u0, 1], [h, z0, u1, 1], [h, z1, u1, 0], [-h, z0, u0, 1], [h, z1, u1, 0], [-h, z1, u0, 0]]) out.push(x, y, o, z, u, t);
        if (it.glow) glowAt.push(x, y, lift + size * 0.45, size);
      };
      for (const p of sh.props) {
        if (p.kind !== 'venue') continue;
        const it = art.items[p.which % art.items.length];
        const [x, y] = propAt(p, it);
        cutout(it, x, y, it.size, it.lift);
      }
      const hs = this.spooky ? hauntOf(tr) : null;
      for (const p of hs ? hs.things : []) if (art.byKind[p.kind]) cutout(art.byKind[p.kind], p.x, p.y, p.size, 0);
      this.propBuf ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v.concat(lit)), gl.STATIC_DRAW);
      this.propCount = v.length / 6;
      this.glowCount = lit.length / 6;
      // Where the glows are (x, y, z, size), and the will-o'-the-wisps (x, y, phase).
      this.glowAt = new Float32Array(glowAt);
      this.wisps = new Float32Array(hs ? hs.wisps.flatMap((w) => [w.x, w.y, w.k]) : []);
      const [, horizon] = skyColours(pal, wx);
      this.haze = wx.haze ? mix(horizon, wx.haze, 0.85) : horizon;
      this.out = wx.snow ? [0.78, 0.81, 0.86] : this.spooky ? [0.07, 0.055, 0.05] : mix(pal.felt[pal.felt.length - 1], [0, 0, 0], 0.55);
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
      const height = (portrait ? 30 : 18) + (this.lift || 0);
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
      // Halloween: lightning now and then (everything lit up), the low fog drifting.
      const flash = this.spooky ? lightning(ms) * (wx.mute ? 0.5 : 1) : 0;
      const L = this.light;
      L[0] = wx.light[0] + flash * 0.75;
      L[1] = wx.light[1] + flash * 0.72;
      L[2] = wx.light[2] + flash * 0.9;
      const low = wx.low || this.light;
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
        gl.uniform3f(P.u.uLight, L[0], L[1], L[2]);
        gl.uniform1f(P.u.uTime, (ms / 1000) % 1000);
        gl.uniform1f(P.u.uLowK, wx.lowK || 0);
        gl.uniform3f(P.u.uLow, low[0], low[1], low[2]);
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
      gl.uniform1f(G.u.uFlash, flash);
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
      gl.uniform1f(M.u.uGhost, 0);
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
        // (Not one right under the camera: on the grid it hangs over the car behind yours.)
        if (i !== mine && (c[0] - cam.x) ** 2 + (c[1] - cam.y) ** 2 < 400) continue;
        const col = this.colour(ids[i]);
        gl.uniform4f(M.u.uM, c[0], c[1], Math.cos(c[2]), Math.sin(c[2]));
        gl.uniform3f(M.u.uTint, col[0], col[1], col[2]);
        gl.uniform1f(M.u.uBrake, c[3] & 8 ? 1 : 0);
        const mesh = this.meshes?.[ids[i]];
        if (mesh) draw(mesh.buf, mesh.count);
        else draw(this.carBuf, this.carCount);
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
        const pl = this.propLight;
        gl.uniform3f(P.u.uLight, pl[0] + flash * 0.6, pl[1] + flash * 0.6, pl[2] + flash * 0.7);
        gl.uniform1f(P.u.uMute, wx.mute || 0);
        gl.uniform1f(P.u.uTime, (ms / 1000) % 1000);
        gl.uniform1f(P.u.uLowK, wx.lowK || 0);
        gl.uniform3f(P.u.uLow, low[0], low[1], low[2]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.propTex);
        gl.uniform1i(P.u.uArt, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuf);
        gl.enableVertexAttribArray(P.aP);
        gl.enableVertexAttribArray(P.aT);
        gl.vertexAttribPointer(P.aP, 4, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(P.aT, 2, gl.FLOAT, false, 24, 16);
        gl.drawArrays(gl.TRIANGLES, 0, this.propCount);
        // The ones lit from inside (a jack-o'-lantern), whatever the weather, flickering.
        if (this.glowCount) {
          const f = flicker(ms, 0) * 1.15;
          gl.uniform3f(P.u.uLight, f, f * 0.96, f * 0.9);
          gl.uniform1f(P.u.uMute, 0);
          gl.drawArrays(gl.TRIANGLES, this.propCount, this.glowCount);
        }
        gl.disableVertexAttribArray(P.aP);
        gl.disableVertexAttribArray(P.aT);
      }
      // Halloween's phantom car: see-through, pale green, through anything in its way.
      const ph = this.spooky ? phantomAt(s, s.game.track) : null;
      // (Not when it's on top of the camera: a see-through car filling the screen is all blending.)
      if (ph && (ph.x - cam.x) ** 2 + (ph.y - cam.y) ** 2 > 2500) {
        gl.useProgram(M.p);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.uniform1f(M.u.uGhost, ph.fade);
        gl.uniform4f(M.u.uM, ph.x, ph.y, Math.cos(ph.a), Math.sin(ph.a));
        gl.uniform3f(M.u.uTint, 0.7, 1, 0.85);
        gl.uniform1f(M.u.uBrake, 0);
        gl.enableVertexAttribArray(M.aP);
        gl.enableVertexAttribArray(M.aC);
        draw(this.ghostBuf, this.ghostCount);
        gl.disableVertexAttribArray(M.aP);
        gl.disableVertexAttribArray(M.aC);
        gl.uniform1f(M.u.uGhost, 0);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      this.labels(s, cars, ids, mine, ms);
      if (this.spooky) this.haunt(s, ph, flash, ms);
      this.spray(s, cars, ids, ms);
      this.fall(s, wx, car, ms);
    },

    // The car's paint (its driver's own colour, unless they picked another).
    colour(id) {
      const paint = lookOf(id).paint || PB.look(id).color;
      const c = (this.colours ||= {})[id];
      if (c && c.from === paint) return c.rgb;
      this.colours[id] = { from: paint, rgb: rgb(paint, [0.9, 0.3, 0.3]) };
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

    // Halloween over the view from the car: the jack-o'-lanterns' glow, will-o'-the-wisps drifting
    // about, the phantom's aura, bats flitting over the sky (round the moon, mostly), and the flash
    // of the lightning. Everything from what's made already: nothing new each frame.
    haunt(s, ph, flash, ms) {
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      const k = this.k || 1;
      const cam = this.cam;
      const reach = this.wx.mute ? 260 : 440;
      const t = ms / 1000;
      c.globalCompositeOperation = 'lighter';
      const orange = glowSprite('orange');
      const g = this.glowAt;
      for (let i = 0; i < g.length; i += 4) {
        if (!this.project(g[i], g[i + 1], g[i + 2]) || at.d > reach) continue;
        const size = at.s * g[i + 3] * 2.4;
        if (size < 3) continue;
        c.globalAlpha = Math.max(0, Math.min(1, (flicker(ms, i) - 0.62) * 2.4)) * (1 - at.d / reach);
        c.drawImage(orange, at.x - size / 2, at.y - size / 2, size, size);
      }
      const green = glowSprite('green');
      const w = this.wisps;
      for (let i = 0; i < w.length; i += 3) {
        const q = t + w[i + 2];
        if (!this.project(w[i] + Math.sin(q * 0.4) * 14, w[i + 1] + Math.cos(q * 0.33) * 10, 8 + Math.sin(q * 1.1) * 3) || at.d > reach) continue;
        const size = Math.max(5 * k, at.s * 10);
        c.globalAlpha = (0.6 + 0.35 * Math.sin(q * 1.3)) * Math.min(1, (reach - at.d) / 120);
        c.drawImage(green, at.x - size / 2, at.y - size / 2, size, size);
      }
      // (Capped: right next to the camera its glow would cover the screen in an additive blend,
      // which is what made phones stutter as the phantom went by.)
      if (ph && this.project(ph.x, ph.y, 6) && at.d < reach && at.d > 30) {
        const size = Math.min(at.s * 46, 160 * k);
        c.globalAlpha = 0.4 * ph.fade;
        c.drawImage(green, at.x - size / 2, at.y - size / 2, size, size);
      }
      c.globalCompositeOperation = 'source-over';
      const bats = batSprites();
      c.globalAlpha = 1;
      for (let i = 0; i < 9; i++) {
        const moon = i < 5;
        const az = moon ? MOON.az + Math.sin(t * 0.15 + i * 1.9) * 0.32 : i * 1.3 + t * 0.04 * (i % 2 ? 1 : -1);
        const el = (moon ? MOON.el + 0.02 : 0.16 + 0.05 * (i % 3)) + 0.04 * Math.sin(t * 0.7 + i * 2.3);
        if (!this.project(cam.x + Math.cos(az) * 600, cam.y + Math.sin(az) * 600, cam.z + Math.tan(el) * 600)) continue;
        const size = (moon ? 22 : 16) * k * (0.7 + (i % 3) * 0.2);
        c.drawImage(bats[Math.sin(t * 17 + i * 1.3) > 0 ? 0 : 1], at.x - size / 2, at.y - size / 4, size, size / 2);
      }
      if (flash > 0) {
        c.globalAlpha = flash * 0.16;
        c.fillStyle = '#e8e0ff';
        c.fillRect(0, 0, W, H);
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
      const flatKey = `${tr.id}:${venueOf(s)}:${weatherOf(s)}`; // (Halloween: its own look)
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
      const wx = wxOf(s);
      if (haunted(s)) hauntAbove(c, s, tr, now);
      if (wx.flat || wx.snow) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = wx.flat || 'rgba(255, 255, 255, 0.1)';
        c.fillRect(0, 0, W, H);
        c.setTransform(z, 0, 0, z, W / 2, H * 0.68);
        c.rotate(-car[2] - Math.PI / 2);
        c.translate(-car[0], -car[1]);
      }
      for (let i = 0; i < cars.length; i++) if (cars[i] && ids[i]) drawCar(c, cars[i], ids[i], { label: ids[i] !== s.me, mine: ids[i] === s.me, honk: now - (honked[ids[i]] || -1e9) < 900, lamps: wx.lamps });
      this.fall(s, wx, car, performance.now());
    },
  };

  // 3, 2, 1, GO over the track (and over the view from the car). Halloween: 3… 2… 1… BOO!
  function countText(s) {
    const spooky = haunted(s);
    if (s.phase === 'countdown') return `${s.game.count}${spooky ? '…' : ''}`;
    if (s.phase === 'race' && (!snaps.length || snaps[snaps.length - 1].t < 1.2)) return spooky ? 'BOO!' : 'GO!';
    return '';
  }
  const countClass = (text) => `tr-count ${text === 'GO!' ? 'go' : text === 'BOO!' ? 'go boo' : text.endsWith('…') ? 'spooky' : ''}`;
  const countHtml = (s) => {
    const text = countText(s);
    return `<div class="${countClass(text)}" data-count>${text ? `<b>${text}</b>` : ''}</div>`;
  };
  function updateCount(s) {
    const text = countText(s);
    document.querySelectorAll('[data-count]').forEach((el) => {
      if (el.dataset.shown === text) return;
      el.dataset.shown = text;
      el.className = countClass(text);
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
        <b class="tr-pos">${r.place}</b>${PB.avatar(r.id, 'sm')}${carPic(r.id)}<span class="tr-name">${esc(PB.state.players.find((p) => p.id === r.id)?.name || '?')}
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
    paintPics(el);
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

  // ---------- Your car's sounds ----------
  //
  // On your own phone, TV or not (the TV plays the room's sounds for everyone, but an engine that
  // follows your foot only makes sense in your hand). Made with Web Audio on the phone's one sound
  // context (Prefs.audio), so the ⚙️ sound switch and volume rule them, and it only wakes up after
  // a tap (the pedals, the tilt button, a bet: the phone won't play before one).
  //
  // One graph a race, built when you first drive and kept till the race is over: oscillators for
  // the engine (the note from a pretend gearbox, the loudness from your foot), and one looping
  // noise feeding the tyres' screech, the grass's rumble and a trolley's rattle, each a filter and
  // a gain that sit at nothing till they're wanted. Knocks, laps and passing cars are one-shots that
  // tidy themselves away. Anything that stops the frames (the race over, leaving, a locked phone)
  // stops the engine: it's only kept going by them.
  //
  // Each body's engine: the firing note at idle and at the redline (Hz), the oscillator, how much
  // of the lower octave, how lumpy the idle is, how bright, how loud, and the top of each gear
  // (units a second; the last runs to top speed).
  const ENGINES = {
    sports: { idle: 52, top: 195, wave: 'sawtooth', sub: 0.3, lump: 0.2, tone: 1, loud: 1, gears: [55, 95, 135] },
    pickup: { idle: 40, top: 140, wave: 'sawtooth', sub: 0.55, lump: 0.35, tone: 0.75, loud: 1, gears: [50, 100] },
    van: { idle: 34, top: 108, wave: 'square', sub: 0.6, lump: 0.3, tone: 0.5, loud: 0.95, gears: [40, 80, 120] }, // a tired minibus
    buggy: { idle: 60, top: 215, wave: 'square', sub: 0.15, lump: 0.45, tone: 0.85, loud: 0.85, gears: [60, 115] }, // a buzzy air-cooled one
    hotrod: { idle: 30, top: 125, wave: 'sawtooth', sub: 0.85, lump: 0.8, tone: 0.8, loud: 1.1, gears: [65, 125] }, // the big lazy V8 lope
    // No engine to speak of: a little electric whine, and the rattle of the cage.
    trolley: { idle: 160, top: 700, wave: 'triangle', sub: 0, lump: 0, tone: 0.5, loud: 0.3, gears: [], rattle: true },
  };
  const TOP_SPEED = 175; // (the server's CAR.top)

  // Which gear the pretend gearbox is in at speed v, and how far up its revs are (0 to 1). Straight
  // after a change up the revs drop back, which is the dip you hear at speed.
  function gearAt(e, v) {
    let lo = 0;
    for (let n = 0; n <= e.gears.length; n++) {
      const hi = n < e.gears.length ? e.gears[n] : TOP_SPEED * 1.4; // (flat out isn't the redline: no screaming)
      if (v < hi || n === e.gears.length) {
        const from = n ? 0.42 : 0.06;
        return { gear: n, rpm: from + (1 - from) * Math.max(0, Math.min(1, (v - lo) / (hi - lo))) };
      }
      lo = hi;
    }
    return { gear: 0, rpm: 0 };
  }

  const sound = {
    g: null, // this race's graph
    v: 0, // your speed, smoothed (units a second)
    side: 0, // ...and how fast you're sliding sideways
    gas: 0, // your foot, smoothed
    rpm: 0,
    gear: 0,
    shift: 0, // when the last change up was (ms)
    was: null, // where your car was last frame: [x, y, t]
    near: [], // each other car: which side of you it was last frame (+1 ahead, -1 behind, 0 not close)
    passed: [], // ...and when it last whooshed past
    hitAt: 0,
    seen: '', // the race moment last drawn: race, phase and count
    stats: { built: 0, stopped: 0, screech: 0, thud: 0, crunch: 0, whoosh: 0, lap: 0, final: 0, finish: 0, beep: 0, go: 0, horn: 0, shots: 0, why: {} }, // (for tests)

    // The context, if sound's on and the phone has been tapped (before that, the phone won't
    // start one, and grumbles about being asked).
    audio() {
      if (!window.Prefs?.get().sound || document.hidden) return null;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
      return window.Prefs.audio();
    },
    volume: () => window.Prefs?.get().volume ?? 0.7,

    noiseBuf: null,
    noise(ac) {
      if (!this.noiseBuf || this.noiseBuf.sampleRate !== ac.sampleRate) {
        this.noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf;
      return src;
    },

    build(ac, s) {
      const e = ENGINES[lookOf(s.me, s).body] || ENGINES.sports;
      const t = ac.currentTime;
      const osc = (type, freq) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; o.start(t); return o; };
      const gain = (v) => { const n = ac.createGain(); n.gain.value = v; return n; };
      const filter = (type, freq, q) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
      const master = gain(0);
      master.gain.setTargetAtTime(this.volume() * 0.55, t, 0.05);
      master.connect(ac.destination);
      // The engine: the note, a second one a hair off it (the beat makes it rough), the octave
      // below, through a low-pass that opens with the throttle; then a wobble in the loudness at
      // half the note, which is the idle's lumpiness, fading as it revs.
      const a = osc(e.wave, e.idle);
      const b = osc('sawtooth', e.idle * 1.007);
      const sub = osc('square', e.idle / 2);
      const mixer = gain(0.5);
      const subGain = gain(e.sub * 0.6);
      a.connect(mixer);
      b.connect(gain(0.35)).connect(mixer);
      sub.connect(subGain).connect(mixer);
      const tone = filter('lowpass', 400, 1.2);
      const lump = gain(1);
      const lfo = osc('sine', e.idle / 2);
      const lumpDepth = gain(0);
      lfo.connect(lumpDepth).connect(lump.gain);
      const engine = gain(0);
      mixer.connect(tone).connect(lump).connect(engine).connect(master);
      // The tyres and the ground, all from one noise.
      const hiss = this.noise(ac);
      hiss.loop = true;
      hiss.start(t, Math.random());
      // A screech: a narrow band, wavering.
      const squeal = filter('bandpass', 1800, 9);
      const waver = osc('sine', 7);
      const waverDepth = gain(120);
      waver.connect(waverDepth).connect(squeal.frequency);
      const screech = gain(0);
      hiss.connect(squeal).connect(screech).connect(master);
      // The grass and gravel: a rumble, shaken (low, but not so low a phone can't play it).
      const low = filter('lowpass', 420, 0.7);
      const rumble = gain(0);
      const shake = gain(0.6);
      const shaker = osc('square', 11);
      shaker.connect(gain(0.4)).connect(shake.gain);
      hiss.connect(low).connect(rumble).connect(shake).connect(master);
      // A trolley's cage rattling, faster as it goes.
      let rattle = null;
      let rattler = null;
      if (e.rattle) {
        const band = filter('bandpass', 3000, 1.6);
        rattle = gain(0);
        const chatter = gain(0.5);
        rattler = osc('square', 9);
        rattler.connect(gain(0.5)).connect(chatter.gain);
        hiss.connect(band).connect(rattle).connect(chatter).connect(master);
      }
      this.stats.built++;
      return {
        race: s.game.race, e, ac, master, a, b, sub, lfo, lumpDepth, tone, engine, squeal, screech, rumble, shaker, rattle, rattler, finished: 0,
        sources: [a, b, sub, lfo, hiss, waver, shaker, rattler].filter(Boolean),
        skidding: false,
        alive: performance.now(),
      };
    },

    // Every frame you're driving: your car's sounds follow it.
    drive(s, cars, ids, now) {
      const mine = ids.indexOf(s.me);
      const car = cars[mine];
      const ac = car && this.audio();
      if (!ac) { this.stop('no sound'); return; }
      if (this.g && this.g.race !== s.game.race) this.stop('new race');
      if (!this.g) {
        this.g = this.build(ac, s);
        this.was = null;
        this.v = this.side = this.gas = this.rpm = 0;
        this.near.length = 0;
        this.watch();
      }
      const g = this.g;
      const e = g.e;
      g.alive = performance.now();
      const T = ac.currentTime;
      // How fast you're going, and how much of it is sideways (the car's own heading against the
      // way it's actually moving), from where it's drawn: smoothed, as the camera does.
      const was = this.was;
      const dt = was ? Math.min(0.1, Math.max(0.001, (now - was[2]) / 1000)) : 0;
      if (dt) {
        const vx = (car[0] - was[0]) / dt;
        const vy = (car[1] - was[1]) / dt;
        const k = 1 - Math.exp(-dt * 6);
        this.v += (Math.min(260, Math.hypot(vx, vy)) - this.v) * k;
        this.side += (Math.min(200, Math.abs(-vx * Math.sin(car[2]) + vy * Math.cos(car[2]))) - this.side) * k;
        this.gas += ((input.gas ? 1 : 0) - this.gas) * (1 - Math.exp(-dt * 10));
      }
      this.was = was || [0, 0, 0];
      this.was[0] = car[0]; this.was[1] = car[1]; this.was[2] = now;
      const racing = s.phase === 'race';
      const done = !!(car[3] & 4);
      if (done && !g.finished) g.finished = now;
      const foot = done ? 0 : this.gas;
      // The revs: the gearbox's, or with your foot down and going nowhere (the grid, the
      // wheels spinning off the line), revving freely.
      const box = gearAt(e, this.v);
      let rpm = box.rpm;
      if (foot > 0.1 && this.v < 40) rpm = Math.max(rpm, racing ? 0.3 + this.v / 70 : 0.72 * foot);
      if (box.gear > this.gear && foot > 0.5) this.shift = now;
      this.gear = box.gear;
      this.rpm += (rpm - this.rpm) * (dt ? 1 - Math.exp(-dt * (rpm > this.rpm ? 7 : 4)) : 1);
      const shifting = now - this.shift < 140;
      const fade = g.finished ? Math.max(0, 1 - (now - g.finished) / 3000) : 1; // idling down over the line
      const f = e.idle + (e.top - e.idle) * this.rpm;
      g.a.frequency.setTargetAtTime(f, T, 0.03);
      g.b.frequency.setTargetAtTime(f * 1.007, T, 0.03);
      g.sub.frequency.setTargetAtTime(f / 2, T, 0.03);
      g.lfo.frequency.setTargetAtTime(f / 2, T, 0.05);
      g.lumpDepth.gain.setTargetAtTime(e.lump * 0.5 * (1 - this.rpm), T, 0.05);
      // (Never darker than the low hundreds: a phone's speaker can't play the note itself, only
      // what's over it.)
      g.tone.frequency.setTargetAtTime(e.tone * (500 + 900 * this.rpm + 1600 * foot * this.rpm) * (shifting ? 0.6 : 1), T, 0.04);
      // Quieter off the gas, and for a moment as it changes up.
      g.engine.gain.setTargetAtTime(e.loud * 0.32 * (0.4 + 0.45 * foot + 0.25 * this.rpm) * (shifting ? 0.45 : 1) * fade, T, shifting ? 0.02 : 0.06);
      g.master.gain.setTargetAtTime(this.volume() * 0.55, T, 0.1);
      // Tyres: a screech when the back's out (the server says so: flag 1) or you slide sideways
      // hard, or stand on the brakes flat out; on the grass, a rumble instead.
      const grass = !!(car[3] & 2);
      let skid = 0;
      if (racing && !grass) {
        if (car[3] & 1 || this.side > 45) skid = Math.min(1, Math.max(0.35, (this.side - 20) / 60));
        if (car[3] & 8 && this.v > 110) skid = Math.max(skid, 0.4 * Math.min(1, (this.v - 110) / 50));
      }
      if (skid > 0.1 && !g.skidding) this.stats.screech++;
      g.skidding = skid > 0.1;
      g.screech.gain.setTargetAtTime(0.16 * skid, T, skid ? 0.03 : 0.08);
      g.squeal.frequency.setTargetAtTime(1500 + 700 * skid, T, 0.05);
      const rough = grass && this.v > 4 ? Math.min(1, this.v / 60) : 0;
      g.rumble.gain.setTargetAtTime(0.6 * rough, T, 0.06);
      g.shaker.frequency.setTargetAtTime(8 + this.v / 8, T, 0.1);
      if (g.rattle) {
        g.rattle.gain.setTargetAtTime(0.1 * Math.min(1, this.v / 70) + (grass ? 0.08 : 0), T, 0.06);
        g.rattler.frequency.setTargetAtTime(7 + this.v / 5, T, 0.1);
      }
      if (racing) this.passing(s, cars, mine, now);
    },

    // Another car going by close (either of you overtaking): a whoosh from its side.
    passing(s, cars, mine, now) {
      const me = cars[mine];
      const fx = Math.cos(me[2]);
      const fy = Math.sin(me[2]);
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (i === mine || !c) continue;
        const dx = c[0] - me[0];
        const dy = c[1] - me[1];
        const close = dx * dx + dy * dy < 40 * 40;
        const ahead = dx * fx + dy * fy > 0 ? 1 : -1;
        const was = this.near[i] || 0;
        this.near[i] = close ? ahead : 0;
        if (!close || !was || was === ahead || this.v < 50 || now - (this.passed[i] || 0) < 2500) continue;
        this.passed[i] = now;
        this.whoosh(dx * -fy + dy * fx > 0 ? 1 : -1);
      }
    },

    // Stops the engine there and then, and lets the graph go.
    stop(why = 'off') {
      const g = this.g;
      if (!g) return;
      this.g = null;
      clearInterval(this.timer);
      this.timer = null;
      this.stats.stopped++;
      this.stats.why[why] = (this.stats.why[why] || 0) + 1;
      const t = g.ac.currentTime;
      try {
        g.master.gain.cancelScheduledValues(t);
        g.master.gain.setTargetAtTime(0, t, 0.01);
        for (const src of g.sources) src.stop(t + 0.06);
      } catch {}
      setTimeout(() => { try { g.master.disconnect(); } catch {} }, 120);
    },
    // Only the frames keep it going. Leaving, the race ending and hiding the page stop it there
    // and then (stop's callers); this is in case the frames stop some other way: quiet soon after,
    // let go if they don't come back (not at the first stall: a slow phone can drop a few frames
    // loading the track, and a gap in the engine would be heard).
    watch() {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        const g = this.g;
        const idle = g ? performance.now() - g.alive : 0;
        if (idle > 2000) this.stop('no frames');
        else if (idle > 700) g.master.gain.setTargetAtTime(0, g.ac.currentTime, 0.02);
      }, 150);
    },

    // ---- One-shots ----

    // Somewhere for one sound to go, cleared away once it's done.
    out(gain, len, pan = 0) {
      const ac = this.audio();
      if (!ac) return null;
      const out = ac.createGain();
      out.gain.value = gain * this.volume();
      if (pan && ac.createStereoPanner) {
        const p = ac.createStereoPanner();
        p.pan.value = pan;
        out.connect(p).connect(ac.destination);
        setTimeout(() => { try { p.disconnect(); } catch {} }, (len + 0.3) * 1000);
      } else out.connect(ac.destination);
      setTimeout(() => { try { out.disconnect(); } catch {} }, (len + 0.3) * 1000);
      this.stats.shots++;
      return { ac, out, t: ac.currentTime };
    },
    note(o, { freq, to, type = 'sine', at = 0, len = 0.2, gain = 0.3 }) {
      const { ac, out } = o;
      const t = o.t + at;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + len + 0.02);
    },
    hiss(o, { at = 0, len = 0.1, type = 'bandpass', freq = 1000, to, q = 1, gain = 0.3 }) {
      const { ac, out } = o;
      const t = o.t + at;
      const src = this.noise(ac);
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (to) f.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, len / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + len + 0.02);
    },

    // A knock (the moment the phone buzzes): a thud off the wall, a crunch off another car.
    hit(withCar) {
      const now = performance.now();
      if (now - this.hitAt < 150) return;
      this.hitAt = now;
      const k = 0.45 + 0.55 * Math.min(1, this.v / 150);
      const o = this.out(0.8 * k, 0.35);
      if (!o) return;
      this.note(o, { freq: 120, to: 42, len: 0.25, gain: 0.6 });
      this.note(o, { freq: 190, to: 90, type: 'triangle', len: 0.12, gain: 0.35 });
      this.hiss(o, { type: 'lowpass', freq: 900, to: 200, len: 0.16, gain: 0.5 });
      if (withCar) {
        this.stats.crunch++;
        for (let i = 0; i < 4; i++) this.hiss(o, { at: i * 0.025 + Math.random() * 0.015, len: 0.05, freq: 2200 + Math.random() * 1800, q: 3, gain: 0.3 });
        this.note(o, { freq: 340, to: 290, type: 'square', at: 0.01, len: 0.07, gain: 0.07 });
      } else this.stats.thud++;
    },
    whoosh(pan) {
      const o = this.out(0.5, 0.6, pan * 0.7);
      if (!o) return;
      this.stats.whoosh++;
      this.hiss(o, { len: 0.5, freq: 2600, to: 700, q: 0.9, gain: 0.25 });
      this.note(o, { freq: 160, to: 110, type: 'sawtooth', len: 0.5, gain: 0.06 });
    },
    // Each lap a two-note chime; the last one a little fanfare.
    lap(final) {
      const o = this.out(1, final ? 1 : 0.6);
      if (!o) return;
      if (final) {
        this.stats.final++;
        [523, 659, 784].forEach((freq, i) => this.note(o, { freq, type: 'triangle', at: i * 0.1, len: 0.14, gain: 0.25 }));
        this.note(o, { freq: 1047, type: 'triangle', at: 0.3, len: 0.6, gain: 0.25 });
        this.note(o, { freq: 1047, type: 'square', at: 0.3, len: 0.35, gain: 0.04 });
      } else {
        this.stats.lap++;
        this.note(o, { freq: 988, len: 0.25, gain: 0.2 });
        this.note(o, { freq: 1319, at: 0.11, len: 0.4, gain: 0.2 });
      }
    },
    // Over the line: the fanfare for a win, a bright ding-ding for a place, and the sad trombone
    // for last (who drinks).
    finish(place, of) {
      this.stats.finish++;
      if (place === 1) return window.Prefs?.play('win');
      const last = of > 1 && place === of;
      const o = this.out(1, 1.6);
      if (!o) return;
      if (last) {
        [392, 370, 349].forEach((freq, i) => this.note(o, { freq, type: 'sawtooth', at: i * 0.3, len: 0.28, gain: 0.08 }));
        this.note(o, { freq: 330, to: 300, type: 'sawtooth', at: 0.9, len: 0.6, gain: 0.08 });
      } else {
        this.note(o, { freq: 784, type: 'triangle', len: 0.18, gain: 0.25 });
        this.note(o, { freq: 1175, type: 'triangle', at: 0.14, len: 0.45, gain: 0.25 });
      }
    },

    // The race's moments on a driver's phone with a TV (with none, the app plays them: the screen's
    // `sounds`, below); and the engine off once the race is.
    moments(s) {
      const g = s.game;
      const live = s.phase === 'countdown' || s.phase === 'race';
      if (!live) this.stop('race over');
      const seen = `${g.race}:${s.phase}:${g.count}`;
      if (seen === this.seen) return;
      const was = this.seen.split(':');
      this.seen = seen;
      if (!s.tv || PB.isTV || !g.racers.includes(s.me) || was[0] !== String(g.race)) return;
      if (s.phase === 'countdown') { this.stats.beep++; window.Prefs?.play('beep'); }
      if (s.phase === 'race' && was[1] === 'countdown') { this.stats.go++; window.Prefs?.play('go'); }
    },
  };
  // A locked phone or another tab: quiet at once.
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.stop('hidden'); });

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

  // ---------- Your car ----------
  //
  // The garage: pick a body, a paint, a stripe and an extra, with the car turning slowly above
  // (its own model, drawn flat: see flatModel). Each tap goes straight to the server, and into
  // this phone's memory, so the next game starts with the same car (sent as soon as it starts).
  const SAVED = 'tr-car';
  const saved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || 'null'); } catch { return null; } };
  let carDraft = null; // what the garage shows (yours, as far as this phone knows)
  let garageOpen = null; // null: open if you've never picked a car on this phone
  let editing = false; // the results screen: "Edit car" tapped (till the next race)
  let autoSent = false;

  let seenLook = '';
  function myDraft(s) {
    const g = s.game;
    // (What the server has wins when it changes: this car was picked on another screen, or a
    // reload. Pass and play: whoever's holding the phone.)
    const theirs = JSON.stringify(g.myLook);
    if (!carDraft || PB.passAndPlay || theirs !== seenLook) {
      seenLook = theirs;
      carDraft = { ...PLAIN, ...(g.myLook || (!PB.passAndPlay && saved()) || {}) };
    }
    return carDraft;
  }

  function garage(s) {
    const g = s.game;
    const look = myDraft(s);
    const parts = g.carParts || { bodies: Object.keys(BODY_NAMES), extras: Object.keys(EXTRA_NAMES), paints: [] };
    const open = garageOpen ?? !saved();
    const own = PB.look(s.me).color;
    const chips = (k, list, names) => list.map((v) => `<button class="${look[k] === v ? 'selected' : ''}" data-tr="look" data-k="${k}" data-v="${esc(v)}">${esc(names[v] || v)}</button>`).join('');
    const swatches = (k, first) => [[null, first], ...parts.paints.map((c) => [c, ''])].map(([v, label]) => `<button class="tr-swatch ${look[k] === v ? 'selected' : ''} ${v ? '' : 'none'}" data-tr="look" data-k="${k}" data-v="${esc(v || '')}" style="--sw:${esc(v || (k === 'paint' ? own : 'transparent'))}" aria-label="${esc(label || v)}">${label ? `<span>${esc(label)}</span>` : ''}</button>`).join('');
    return `<details class="card tr-garage" ${open ? 'open' : ''}>
      <summary>🔧 Your car <small>${esc(BODY_NAMES[look.body] || '')}${look.extra !== 'none' ? ` · ${esc(EXTRA_NAMES[look.extra] || '')}` : ''}</small></summary>
      <div class="tr-garage-in">
        <div class="tr-preview" role="img" aria-label="Your car"></div>
        <div class="tr-garage-opts">
          <h3>Body</h3><div class="tr-chips">${chips('body', parts.bodies, BODY_NAMES)}</div>
          <h3>Paint</h3><div class="tr-swatches">${swatches('paint', 'Yours')}</div>
          <h3>Stripes</h3><div class="tr-swatches">${swatches('stripe', 'None')}</div>
          <h3>Extra</h3><div class="tr-chips">${chips('extra', parts.extras, EXTRA_NAMES)}</div>
        </div>
      </div>
    </details>`;
  }

  // A tap in the garage: the car changes here at once, and goes to the server.
  function pickPart(s, k, v) {
    const look = myDraft(s);
    look[k] = v || null;
    const send = { body: look.body, paint: look.paint, stripe: look.stripe, extra: look.extra };
    if (!PB.passAndPlay) { try { localStorage.setItem(SAVED, JSON.stringify(send)); } catch {} }
    PB.act('car', send);
  }

  // A new game: this phone's car, as it was last time (it's only remembered once it's picked).
  function sendSaved(s) {
    if (autoSent || PB.isTV || PB.passAndPlay || s.game.myLook || s.phase === 'race' || s.phase === 'countdown') return;
    autoSent = true;
    const look = saved();
    if (look) PB.act('car', look);
  }

  // The preview: the car turning slowly, seen from a little above. Its own small WebGL canvas
  // (the same model shader as the view from the car), kept for the visit and moved into the
  // garage each time it's drawn. With no WebGL, the model drawn flat (good enough to pick by).
  const preview = { cv: null, gl: null, M: null, buf: null, count: 0, key: '', tint: [1, 1, 1], fm: null, yaw: 0.6, frame: null, at: 0, vp: new Float32Array(16), flat: false };
  function startPreview(s) {
    const box = document.querySelector('.tr-preview');
    if (!box) return;
    if (!preview.cv) {
      preview.cv = document.createElement('canvas');
      preview.gl = preview.cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
      preview.M = preview.gl && program(preview.gl, MODEL_VS, MODEL_FS);
      preview.flat = !preview.M;
      if (!preview.flat) preview.buf = preview.gl.createBuffer();
    }
    box.append(preview.cv);
    const look = { ...myDraft(s), n: lookOf(s.me, s).n };
    const paint = look.paint || PB.look(s.me).color;
    const key = `${meshKey(look)}:${paint}`;
    if (key !== preview.key) {
      preview.key = key;
      const { v } = carModel(look, { shadow: !preview.flat });
      if (preview.flat) preview.fm = flatModel(v, paint);
      else {
        const gl = preview.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
        gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
        preview.count = v.length / 7;
        preview.tint = rgb(paint, [0.9, 0.3, 0.3]);
      }
    }
    if (!preview.frame) preview.frame = requestAnimationFrame(drawPreview);
  }
  const placePreview = (x, y, z, out, k) => {
    const { ca, sa, cx, cy, S } = preview;
    const xr = x * ca - y * sa;
    const yr = x * sa + y * ca;
    out[k] = cx + xr * S;
    out[k + 1] = cy - (z * 0.86 + yr * 0.5) * S;
    return yr * 0.86 - z * 0.5;
  };
  function drawPreview(ms) {
    preview.frame = null;
    const cv = preview.cv;
    if (!cv || !cv.isConnected || document.hidden) return;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) { preview.frame = requestAnimationFrame(drawPreview); return; }
    const k = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * k) || cv.height !== Math.round(h * k)) { cv.width = Math.round(w * k); cv.height = Math.round(h * k); }
    const dt = Math.min(0.1, (ms - (preview.at || ms)) / 1000);
    preview.at = ms;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) preview.yaw += dt * 0.7;
    const W = cv.width;
    const H = cv.height;
    if (preview.flat) {
      const c = cv.getContext('2d');
      if (c) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, W, H);
        preview.ca = Math.cos(preview.yaw);
        preview.sa = Math.sin(preview.yaw);
        preview.S = Math.min(W / 40, H / 30);
        preview.cx = W / 2;
        preview.cy = H * 0.6;
        drawFlat(c, preview.fm, placePreview);
      }
      preview.frame = requestAnimationFrame(drawPreview);
      return;
    }
    // The camera goes round the car, a little above it, looking at its middle.
    const gl = preview.gl;
    const M = preview.M;
    const D = 58;
    const ex = Math.cos(preview.yaw) * D, ey = Math.sin(preview.yaw) * D, ez = 30;
    let f0 = -ex, f1 = -ey, f2 = 5 - ez;
    const fl = Math.hypot(f0, f1, f2);
    f0 /= fl; f1 /= fl; f2 /= fl;
    const rl = Math.hypot(f0, f1);
    const r0 = -f1 / rl, r1 = f0 / rl; // (r2 0: the camera doesn't roll)
    const u0 = -f2 * r1, u1 = f2 * r0, u2 = f0 * r1 - f1 * r0;
    const focal = Math.min(W * 1.5, H * 2.3);
    const fx = focal / (W / 2);
    const fy = focal / (H / 2);
    const near = 2, far = 400;
    const A = (far + near) / (far - near);
    const B = (-2 * far * near) / (far - near);
    const m = preview.vp;
    m[0] = fx * r0; m[4] = fx * r1; m[8] = 0; m[12] = -fx * (r0 * ex + r1 * ey);
    m[1] = fy * u0; m[5] = fy * u1; m[9] = fy * u2; m[13] = -fy * (u0 * ex + u1 * ey + u2 * ez);
    m[2] = A * f0; m[6] = A * f1; m[10] = A * f2; m[14] = -A * (f0 * ex + f1 * ey + f2 * ez) + B;
    m[3] = f0; m[7] = f1; m[11] = f2; m[15] = -(f0 * ex + f1 * ey + f2 * ez);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(M.p);
    gl.uniformMatrix4fv(M.u.uVP, false, m);
    gl.uniform4f(M.u.uM, 0, 0, 1, 0);
    gl.uniform3f(M.u.uTint, preview.tint[0], preview.tint[1], preview.tint[2]);
    gl.uniform3f(M.u.uLamp, 0.2, 1, 0.35);
    gl.uniform3f(M.u.uCam, ex, ey, ez);
    gl.uniform3f(M.u.uHaze, 0, 0, 0);
    gl.uniform3f(M.u.uLight, 1, 1, 1);
    gl.uniform1f(M.u.uFar, 1e5);
    gl.uniform1f(M.u.uBrake, 0);
    gl.uniform1f(M.u.uGlow, 0);
    gl.uniform1f(M.u.uHead, 0);
    gl.uniform1f(M.u.uMute, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
    gl.enableVertexAttribArray(M.aP);
    gl.enableVertexAttribArray(M.aC);
    gl.vertexAttribPointer(M.aP, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(M.aC, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(gl.TRIANGLES, 0, preview.count);
    preview.frame = requestAnimationFrame(drawPreview);
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
            <span class="tr-pick-car">${PB.avatar(id)}${carPic(id)}</span><span>${esc(name(id))}${id === s.me ? ' (you)' : ''}</span>
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
      ${g.racers.includes(s.me) ? `${garage(s)}<div class="card tr-ready">${tiltNote()}</div>` : ''}
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
      ${PB.isTV ? '' : editing ? garage(s) : '<button class="secondary tr-small tr-edit-car" data-tr="garage">🔧 Edit car</button>'}
      <div class="card tr-results"><h2>🏁 Race ${g.race}</h2>${g.result.map((r, i) => `
        <div class="tr-row ${r.id === s.me && !PB.isTV ? 'me' : ''}"><b class="tr-pos">${i + 1}</b>${PB.avatar(r.id, 'sm')}${carPic(r.id)}<span class="tr-name">${esc(PB.state.players.find((p) => p.id === r.id)?.name || '?')}
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
      live ? '' : [g.looks, carDraft, garageOpen, editing],
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
      carDraft = null;
      seenLook = '';
      garageOpen = null;
      editing = false;
      autoSent = false;
      sound.stop('new game');
      sound.seen = '';
    },
    audio: sound, // (for tests: what it's playing)
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
      sound.moments(s);
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
      if (s.phase === 'race') editing = false;
      sendSaved(s);
      attachViews();
      startPreview(s);
      document.querySelector('.tr-garage')?.addEventListener('toggle', (e) => { garageOpen = e.target.open; });
      bindControls();
      if (driving()) setSteer();
      document.querySelectorAll('[data-tr]').forEach((b) => {
        b.onclick = (e) => {
          const what = b.dataset.tr;
          if (what === 'horn') { e.preventDefault(); PB.act('honk'); return; }
          if (what === 'pick') draft.car = b.dataset.car;
          else if (what === 'look') pickPart(s, b.dataset.k, b.dataset.v);
          else if (what === 'garage') { editing = true; garageOpen = true; }
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
      // (With a TV the horns are its sound, but a driver's phone hoots too: it's in the race.)
      const loud = PB.isTV || !s.tv || driving();
      for (const id of d.h || []) {
        honked[id] = performance.now();
        if (loud) { sound.stats.horn++; window.Prefs?.play('horn'); }
      }
      if (PB.isTV) { updateBoard(s); updateCount(s); return; }
      const mine = d.c[ids.indexOf(s.me)];
      if ((d.b || []).includes(s.me)) {
        PB.buzz('hit');
        fp.cam.shake = 1;
        // Into another car if one's touching (they bump at twice the cars' radius), else the wall.
        if (driving() && mine) sound.hit(d.c.some((c) => c !== mine && Math.hypot(c[0] - mine[0], c[1] - mine[1]) < 26));
      }
      if (mine) {
        const done = !!(mine[3] & 4);
        if (lastMine.lap && mine[5] > lastMine.lap) {
          PB.buzz();
          banner(mine[5] === s.game.laps ? (haunted(s) ? '💀 Final lap!' : 'Final lap!') : `Lap ${mine[5]}`);
          if (driving()) sound.lap(mine[5] === s.game.laps);
        }
        if (done && !lastMine.done && lastMine.place) {
          banner(`${haunted(s) ? '🎃' : '🏁'} ${ordinal(mine[4])}!`, true);
          if (driving()) sound.finish(mine[4], d.c.length);
        }
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
