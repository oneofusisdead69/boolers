// Screens for Shooting Gallery. Server logic: games/shootingGallery.js
//
// The gallery (the TV's, or each phone's without a TV) is two canvases: the booth drawn once (the
// venue's back wall, rails, shelf and counter, or the duck pond), and everything that moves drawn
// every frame: the targets (each from a sprite drawn once per kind), the crosshairs, muzzle
// flashes, score popups and bits flying off what's hit (a fixed pool, nothing allocated per
// frame). Targets move on fixed paths (posAt, a copy of the server's), so they're drawn at the
// gallery's time, worked out from the 'gallery' signals the server sends every tick (see clock):
// only the crosshairs are streamed.
//
// The phone is a light gun. Its orientation (alpha, beta, gamma) gives the direction it points:
// with a TV, the top edge (held sideways like a pistol, the screen showing the gun side on);
// without, the back, held up like a camera at its own screen. That
// direction's heading and pitch, against the two calibration points (the middle of the screen,
// then the top-right corner), is where on the gallery it's aiming. The gallery is always 16:9
// (letterboxed to fit), and the calibration dots are on it, not on the screen, so every TV in
// the room shows every crosshair in the same place, whichever TV each player calibrated to. The phone keeps its calibration
// (localStorage); the server only ever hears where the crosshair is.
(() => {
  const { esc, name } = PB;
  const W = 1600;
  const H = 900;
  const ASPECT = 16 / 9;
  const DELAY = 0.06; // the gallery is drawn this far behind the newest tick (seconds)
  const SEND_MS = 40; // the crosshair goes to the server at most this often
  const CORNER = { x: 0.94, y: 0.08 }; // the second calibration dot, a little in from the corner
  const RELOAD_PITCH = 55; // degrees above the middle: muzzle up, and it reloads...
  const RELOAD_HOLD = 200; // ...held this long (ms)
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  // Where a target is at gallery time t (games/shootingGallery.js has the same).
  function posAt(tg, t, out) {
    const d = t - tg.t0;
    switch (tg.p) {
      case 'rail':
        out.x = tg.x + tg.vx * d;
        out.y = tg.y + tg.a * Math.sin(tg.w * d + tg.ph);
        break;
      case 'arc':
        out.x = tg.x + tg.vx * d;
        out.y = tg.y + tg.vy * d + 0.5 * tg.g * d * d;
        break;
      case 'pop': {
        const up = clamp(Math.min(d, tg.life - d) / 0.25, 0, 1);
        out.x = tg.x;
        out.y = tg.y + tg.a * (1 - up);
        break;
      }
      case 'swing': {
        const th = tg.a * Math.sin(tg.w * d + tg.ph);
        const up = tg.vy ? clamp(Math.min(d, tg.life - d) / 0.6, 0, 1) : 1;
        out.x = tg.x + Math.sin(th) * tg.l;
        out.y = tg.y + Math.cos(th) * tg.l * (tg.vy ? -1 : 1) + tg.vy * (1 - up);
        out.th = th;
        break;
      }
      default:
        out.x = tg.x + tg.a * Math.cos(tg.w * d + tg.ph);
        out.y = tg.y + tg.a * 0.6 * Math.sin(tg.w * d + tg.ph);
    }
    return out;
  }

  // ---------- The gallery's clock ----------
  // Each tick says what gallery time it is. The quickest of the last couple of seconds' arrivals
  // is the best guess at how far behind the server this screen is; the gallery's drawn at that,
  // less DELAY. The phone's shots are stamped with the same time, so what it hits is what the
  // screen showed.
  const clock = {
    offs: new Float64Array(40),
    n: 0,
    i: 0,
    off: null,
    round: -1,
    reset() { this.n = this.i = 0; this.off = null; },
    arrive(now, t) {
      this.offs[this.i] = now - t;
      this.i = (this.i + 1) % this.offs.length;
      if (this.n < this.offs.length) this.n++;
      let m = Infinity;
      for (let k = 0; k < this.n; k++) if (this.offs[k] < m) m = this.offs[k];
      // (Eased, so the targets never jump.)
      this.off = this.off == null || Math.abs(m - this.off) > 0.5 ? m : this.off + (m - this.off) * 0.1;
    },
    now() { return this.off == null ? null : performance.now() / 1000 - this.off - DELAY; },
  };

  // ---------- What's on the gallery ----------
  const targets = new Map(); // id -> target (as the server sent it), plus hitAt, hitBy
  let order = []; // the players, in the order the crosshairs come in
  const aimNow = []; // [x, y] per player, as last heard
  const aimShown = []; // ...and where it's drawn (eased toward it)
  let scores = []; // this round's, per player
  let ammoNow = []; // rounds left, per player (-1 reloading)
  const tmp = { x: 0, y: 0, th: 0 };

  // Fixed pools: bits flying off a hit target, muzzle flashes, score popups.
  const BITS = 160;
  const bits = Array.from({ length: BITS }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff', s: 4 }));
  let bitAt = 0;
  const FLASHES = 24;
  const flashes = Array.from({ length: FLASHES }, () => ({ on: false, x: 0, y: 0, at: 0, c: '#fff' }));
  let flashAt = 0;
  const POPS = 24;
  const pops = Array.from({ length: POPS }, () => ({ on: false, x: 0, y: 0, at: 0, c: '#fff', text: '' }));
  let popAt = 0;

  function burst(x, y, colors, n = 14) {
    for (let k = 0; k < n; k++) {
      const b = bits[bitAt];
      bitAt = (bitAt + 1) % BITS;
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 380;
      b.on = true;
      b.x = x;
      b.y = y;
      b.vx = Math.cos(a) * v;
      b.vy = Math.sin(a) * v - 200;
      b.life = 0.5 + Math.random() * 0.5;
      b.c = colors[k % colors.length];
      b.s = 3 + Math.random() * 6;
    }
  }

  function addTarget(tg) {
    if (!targets.has(tg.id)) targets.set(tg.id, tg);
  }

  // ---------- Colours ----------
  const cssVar = (k, fb) => getComputedStyle(document.documentElement).getPropertyValue(`--${k}`).trim() || fb;
  function mix(a, b, f) {
    const p = (c) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(c);
      return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
    };
    const A = p(a);
    const B = p(b);
    return `#${A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join('')}`;
  }

  // ---------- The targets' pictures ----------
  // Each kind drawn once into its own little canvas (by gallery and size), then stamped.
  function ring(c, r, fill) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
  function circ(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
  function ell(c, x, y, rx, ry, fill, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
  function rr(c, x, y, w, h, r, fill) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); }
  function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); }
  function outline(c, w = 3, col = 'rgba(20,12,8,0.85)') { c.lineWidth = w; c.strokeStyle = col; c.stroke(); }
  // A cardboard cut-out: the shape, a pale card edge round it, on a stick.
  function stick(c, s) { rr(c, -s * 0.06, s * 0.55, s * 0.12, s * 0.5, 2, '#6a4a2a'); }
  function duckShape(c, s, body, bill, flap = 0) {
    c.save();
    // body
    ell(c, -s * 0.05, s * 0.15, s * 0.62, s * 0.36, body);
    // tail
    poly(c, [-s * 0.6, s * 0.05, -s * 0.9, -s * 0.15, -s * 0.62, s * 0.3], body);
    // head
    circ(c, s * 0.45, -s * 0.32, s * 0.27, body);
    // bill
    poly(c, [s * 0.66, -s * 0.36, s * 0.98, -s * 0.26, s * 0.66, -s * 0.2], bill);
    // wing
    if (flap) {
      c.save();
      c.translate(-s * 0.05, s * 0.05);
      c.rotate(flap);
      ell(c, -s * 0.1, -s * 0.32, s * 0.38, s * 0.16, mix(body, '#000000', 0.18), -0.5);
      c.restore();
    } else ell(c, -s * 0.12, s * 0.12, s * 0.36, s * 0.17, mix(body, '#000000', 0.15), -0.15);
    circ(c, s * 0.52, -s * 0.38, s * 0.05, '#111');
    c.restore();
  }
  function mallard(c, s, flap, gold = false) {
    // A wild mallard, in colour: green head, white collar, chestnut breast, grey body.
    const body = gold ? '#e8c040' : '#9a9a8e';
    c.save();
    ell(c, -s * 0.05, s * 0.1, s * 0.6, s * 0.3, body);
    ell(c, s * 0.25, s * 0.12, s * 0.28, s * 0.26, gold ? '#f0d060' : '#7a3a22');
    poly(c, [-s * 0.6, 0, -s * 0.85, -s * 0.12, -s * 0.6, s * 0.2], gold ? '#d0a020' : '#2a2a2a');
    circ(c, s * 0.48, -s * 0.22, s * 0.22, gold ? '#ffe070' : '#1f6a3a');
    c.beginPath(); c.arc(s * 0.42, -s * 0.04, s * 0.17, 0.2, Math.PI - 0.2); c.lineWidth = s * 0.05; c.strokeStyle = '#f4f4f0'; c.stroke();
    poly(c, [s * 0.66, -s * 0.26, s * 0.94, -s * 0.18, s * 0.66, -s * 0.12], '#e8b030');
    circ(c, s * 0.54, -s * 0.27, s * 0.045, '#111');
    // The wing, up or down (flapping).
    c.save();
    c.translate(-s * 0.05, -s * 0.02);
    c.rotate(flap);
    ell(c, -s * 0.15, -s * 0.35, s * 0.42, s * 0.15, gold ? '#f8e080' : '#b8b0a0', -0.4);
    ell(c, -s * 0.05, -s * 0.28, s * 0.14, s * 0.06, gold ? '#fff0a0' : '#3a5ac8', -0.4);
    c.restore();
    c.restore();
  }

  // Each kind: draws itself centred on (0, 0), about s across (s = radius in pixels).
  const DRAW = {
    can(c, s) {
      rr(c, -s * 0.55, -s * 0.85, s * 1.1, s * 1.7, s * 0.12, '#c8ccd2');
      rr(c, -s * 0.55, -s * 0.5, s * 1.1, s * 0.95, 2, '#d8302f');
      rr(c, -s * 0.55, -s * 0.14, s * 1.1, s * 0.22, 2, '#f4e8c8');
      rr(c, -s * 0.3, -s * 0.85, s * 0.16, s * 1.7, 2, 'rgba(255,255,255,0.35)');
      ell(c, 0, -s * 0.85, s * 0.55, s * 0.1, '#e8eaee');
    },
    bottle(c, s) {
      rr(c, -s * 0.42, -s * 0.2, s * 0.84, s * 1.15, s * 0.18, '#2e8a4a');
      poly(c, [-s * 0.42, -s * 0.1, -s * 0.15, -s * 0.55, s * 0.15, -s * 0.55, s * 0.42, -s * 0.1], '#2e8a4a');
      rr(c, -s * 0.14, -s * 1.0, s * 0.28, s * 0.5, 3, '#2e8a4a');
      rr(c, -s * 0.16, -s * 1.05, s * 0.32, s * 0.12, 2, '#d8b050');
      rr(c, -s * 0.32, s * 0.15, s * 0.64, s * 0.4, 3, '#f0e4c4');
      rr(c, -s * 0.28, -s * 0.15, s * 0.1, s * 0.9, 3, 'rgba(255,255,255,0.3)');
    },
    duckCut(c, s) {
      stick(c, s);
      c.save(); c.translate(0, -s * 0.05);
      c.lineJoin = 'round';
      // the card edge
      c.save(); c.scale(1.12, 1.15); duckShape(c, s * 0.9, '#f4ead0', '#f4ead0'); c.restore();
      duckShape(c, s * 0.9, '#f2c230', '#ff8a1f');
      c.restore();
    },
    bullseye(c, s) {
      const cols = ['#f4f0e8', '#d8302f', '#f4f0e8', '#d8302f', '#f4f0e8'];
      cols.forEach((col, i) => ring(c, s * (1 - i * 0.2), col));
      circ(c, 0, 0, s * 0.1, '#d8302f');
      c.beginPath(); c.arc(0, 0, s, 0, Math.PI * 2); outline(c, s * 0.06, '#5a3a22');
    },
    clay(c, s) {
      ell(c, 0, 0, s, s * 0.45, '#e86a20');
      ell(c, 0, -s * 0.08, s * 0.7, s * 0.28, '#f49048');
      ell(c, 0, -s * 0.12, s * 0.3, s * 0.12, '#c85010');
    },
    star(c, s) {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.45 : s;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fillStyle = '#ffd23f';
      c.fill();
      outline(c, s * 0.1, '#b07a10');
      circ(c, -s * 0.2, -s * 0.25, s * 0.14, 'rgba(255,255,255,0.8)');
    },
    // A "don't shoot" cut-out: a faceless silhouette (the art kit's people) on a card sign.
    bystander(c, s, set) {
      stick(c, s);
      rr(c, -s * 0.75, -s * 1.0, s * 1.5, s * 1.6, s * 0.12, '#f4ecd8');
      c.save(); c.beginPath(); c.roundRect(-s * 0.75, -s * 1.0, s * 1.5, s * 1.6, s * 0.12); outline(c, s * 0.06, '#8a6a4a'); c.restore();
      const k = '#1a1412';
      circ(c, 0, -s * 0.48, s * 0.24, k);
      poly(c, [-s * 0.45, s * 0.42, -s * 0.38, -s * 0.12, -s * 0.15, -s * 0.22, s * 0.15, -s * 0.22, s * 0.38, -s * 0.12, s * 0.45, s * 0.42], k);
      // a hat for the room
      const hat = { saloon: 'cowboy', pirate: 'tricorn', castle: 'crown', christmas: 'santa', space: 'helmet', tiki: 'flower', casino: 'topper', speakeasy: 'fedora', jazz: 'fedora', chateau: 'topper' }[set];
      if (hat === 'cowboy') { ell(c, 0, -s * 0.68, s * 0.42, s * 0.08, k); rr(c, -s * 0.2, -s * 0.9, s * 0.4, s * 0.24, 6, k); }
      if (hat === 'tricorn') poly(c, [-s * 0.4, -s * 0.62, 0, -s * 0.95, s * 0.4, -s * 0.62], k);
      if (hat === 'crown') poly(c, [-s * 0.22, -s * 0.66, -s * 0.24, -s * 0.92, -s * 0.1, -s * 0.78, 0, -s * 0.95, s * 0.1, -s * 0.78, s * 0.24, -s * 0.92, s * 0.22, -s * 0.66], '#d4af37');
      if (hat === 'santa') { poly(c, [-s * 0.26, -s * 0.62, s * 0.32, -s * 0.98, s * 0.26, -s * 0.62], '#c8302f'); circ(c, s * 0.32, -s * 0.98, s * 0.07, '#fff'); }
      if (hat === 'helmet') { c.beginPath(); c.arc(0, -s * 0.48, s * 0.34, 0, Math.PI * 2); outline(c, s * 0.08, '#9ab'); }
      if (hat === 'flower') circ(c, s * 0.2, -s * 0.66, s * 0.1, '#ff5a8a');
      if (hat === 'topper') { ell(c, 0, -s * 0.68, s * 0.32, s * 0.06, k); rr(c, -s * 0.18, -s * 1.0, s * 0.36, s * 0.34, 3, k); }
      if (hat === 'fedora') { ell(c, 0, -s * 0.68, s * 0.36, s * 0.07, k); rr(c, -s * 0.2, -s * 0.86, s * 0.4, s * 0.2, 6, k); }
      rr(c, -s * 0.7, s * 0.28, s * 1.4, s * 0.3, 4, '#d8302f');
      c.fillStyle = '#fff';
      c.font = `900 ${Math.round(s * 0.2)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('DON’T SHOOT', 0, s * 0.44);
    },
    cat(c, s) {
      stick(c, s);
      rr(c, -s * 0.75, -s * 1.0, s * 1.5, s * 1.6, s * 0.12, '#e8e0f0');
      const k = '#1a1418';
      ell(c, 0, s * 0.05, s * 0.36, s * 0.3, k);
      circ(c, 0, -s * 0.38, s * 0.26, k);
      poly(c, [-s * 0.24, -s * 0.5, -s * 0.22, -s * 0.8, -s * 0.04, -s * 0.6], k);
      poly(c, [s * 0.24, -s * 0.5, s * 0.22, -s * 0.8, s * 0.04, -s * 0.6], k);
      circ(c, -s * 0.1, -s * 0.4, s * 0.05, '#9aff6a');
      circ(c, s * 0.1, -s * 0.4, s * 0.05, '#9aff6a');
      rr(c, -s * 0.7, s * 0.28, s * 1.4, s * 0.3, 4, '#7a3ad8');
      c.fillStyle = '#fff';
      c.font = `900 ${Math.round(s * 0.2)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('DON’T SHOOT', 0, s * 0.44);
    },
    barrel(c, s) {
      rr(c, -s * 0.7, -s * 0.9, s * 1.4, s * 1.8, s * 0.5, '#8a5a2e');
      for (const y of [-0.55, 0.45]) rr(c, -s * 0.72, s * y, s * 1.44, s * 0.14, 2, '#3a3a40');
      for (const x of [-0.35, 0, 0.35]) rr(c, s * x - 1, -s * 0.85, 2, s * 1.7, 1, 'rgba(0,0,0,0.25)');
    },
    gull(c, s, set, t) {
      const f = Math.sin(t * 12) * 0.6;
      c.save();
      c.fillStyle = '#f4f4f0';
      ell(c, 0, 0, s * 0.55, s * 0.22, '#f4f4f0');
      circ(c, s * 0.5, -s * 0.08, s * 0.18, '#f4f4f0');
      poly(c, [s * 0.64, -s * 0.1, s * 0.86, -s * 0.04, s * 0.64, 0], '#f0b030');
      for (const side of [-1, 1]) {
        c.save(); c.rotate(side * f * 0.3);
        poly(c, [-s * 0.2, -s * 0.05, -s * 0.5, -s * 0.75 * (side < 0 ? 1 : 0.7) - f * s * 0.4, s * 0.25, -s * 0.05], side < 0 ? '#c8ccd2' : '#e0e4e8');
        c.restore();
      }
      circ(c, s * 0.56, -s * 0.12, s * 0.04, '#111');
      c.restore();
    },
    tentacle(c, s) {
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, s * 2.2); c.quadraticCurveTo(s * 0.7, s * 0.9, 0, 0); c.quadraticCurveTo(-s * 0.4, -s * 0.6, s * 0.2, -s * 0.9);
      c.lineWidth = s * 0.55; c.strokeStyle = '#6a3a8a'; c.stroke();
      c.lineWidth = s * 0.3; c.strokeStyle = '#8a5aa8'; c.stroke();
      for (let i = 0; i < 5; i++) circ(c, s * 0.18 - i * 0.02 * s, s * 1.6 - i * s * 0.5, s * 0.08, '#e8b8d8');
    },
    asteroid(c, s) {
      poly(c, [-s, -s * 0.2, -s * 0.6, -s * 0.85, s * 0.1, -s * 0.95, s * 0.8, -s * 0.5, s, s * 0.2, s * 0.5, s * 0.9, -s * 0.3, s * 0.85, -s * 0.9, s * 0.45], '#7a6a5e');
      circ(c, -s * 0.3, -s * 0.2, s * 0.22, '#5a4c44');
      circ(c, s * 0.35, s * 0.3, s * 0.16, '#5a4c44');
      circ(c, s * 0.2, -s * 0.5, s * 0.1, '#5a4c44');
    },
    ufo(c, s, set, t) {
      ell(c, 0, -s * 0.2, s * 0.42, s * 0.36, 'rgba(160,240,255,0.75)');
      ell(c, 0, s * 0.1, s, s * 0.32, '#9aa4b8');
      ell(c, 0, s * 0.02, s * 0.9, s * 0.12, '#c8d0e0');
      for (let i = 0; i < 5; i++) circ(c, -s * 0.64 + i * s * 0.32, s * 0.2, s * 0.07, Math.floor(t * 6 + i) % 2 ? '#ffd23f' : '#ff5ad8');
    },
    ghost(c, s) {
      c.beginPath(); c.moveTo(-s * 0.7, s * 0.8);
      c.lineTo(-s * 0.7, -s * 0.1); c.arc(0, -s * 0.1, s * 0.7, Math.PI, 0); c.lineTo(s * 0.7, s * 0.8);
      for (let i = 0; i < 4; i++) c.quadraticCurveTo(s * (0.7 - i * 0.35 - 0.17), s * 0.5, s * (0.7 - (i + 1) * 0.35), s * 0.8);
      c.fillStyle = 'rgba(240,244,255,0.92)'; c.fill();
      ell(c, -s * 0.25, -s * 0.15, s * 0.1, s * 0.16, '#1a1428');
      ell(c, s * 0.25, -s * 0.15, s * 0.1, s * 0.16, '#1a1428');
      ell(c, 0, s * 0.2, s * 0.12, s * 0.16, '#1a1428');
    },
    pumpkin(c, s) {
      for (const [x, w] of [[-0.45, 0.42], [0.45, 0.42], [0, 0.5]]) ell(c, s * x, s * 0.1, s * w, s * 0.7, x ? '#e8701a' : '#ff8a2a');
      rr(c, -s * 0.08, -s * 0.85, s * 0.16, s * 0.3, 3, '#4a6a2a');
      poly(c, [-s * 0.4, -s * 0.05, -s * 0.2, -s * 0.3, -s * 0.05, -s * 0.05], '#3a1a08');
      poly(c, [s * 0.4, -s * 0.05, s * 0.2, -s * 0.3, s * 0.05, -s * 0.05], '#3a1a08');
      poly(c, [-s * 0.45, s * 0.3, -s * 0.2, s * 0.45, 0, s * 0.3, s * 0.2, s * 0.45, s * 0.45, s * 0.3, s * 0.2, s * 0.6, -s * 0.2, s * 0.6], '#3a1a08');
    },
    bat(c, s, set, t) {
      const f = Math.sin(t * 16) * 0.5;
      const k = '#1e1426';
      ell(c, 0, 0, s * 0.22, s * 0.3, k);
      circ(c, 0, -s * 0.3, s * 0.18, k);
      poly(c, [-s * 0.12, -s * 0.42, -s * 0.16, -s * 0.6, -s * 0.02, -s * 0.45], k);
      poly(c, [s * 0.12, -s * 0.42, s * 0.16, -s * 0.6, s * 0.02, -s * 0.45], k);
      for (const side of [-1, 1]) poly(c, [side * s * 0.15, -s * 0.1, side * s, -s * 0.35 - f * s * 0.5, side * s * 0.8, s * 0.05, side * s * 0.55, -s * 0.05, side * s * 0.4, s * 0.2], k);
      circ(c, -s * 0.07, -s * 0.32, s * 0.04, '#ff5a3a');
      circ(c, s * 0.07, -s * 0.32, s * 0.04, '#ff5a3a');
    },
    bauble(c, s) {
      circ(c, 0, s * 0.1, s * 0.85, '#c8302f');
      c.save(); c.beginPath(); c.arc(0, s * 0.1, s * 0.85, 0, Math.PI * 2); c.clip();
      rr(c, -s, -s * 0.05, s * 2, s * 0.22, 0, '#e8b84a');
      c.restore();
      rr(c, -s * 0.18, -s * 0.9, s * 0.36, s * 0.22, 2, '#d4af37');
      circ(c, -s * 0.3, -s * 0.2, s * 0.16, 'rgba(255,255,255,0.6)');
    },
    present(c, s) {
      rr(c, -s * 0.8, -s * 0.6, s * 1.6, s * 1.4, 4, '#2a8a4a');
      rr(c, -s * 0.12, -s * 0.6, s * 0.24, s * 1.4, 0, '#e8b84a');
      rr(c, -s * 0.8, s * 0.0, s * 1.6, s * 0.2, 0, '#e8b84a');
      ell(c, -s * 0.25, -s * 0.72, s * 0.28, s * 0.14, '#e8b84a', -0.4);
      ell(c, s * 0.25, -s * 0.72, s * 0.28, s * 0.14, '#e8b84a', 0.4);
    },
    snowman(c, s) {
      circ(c, 0, s * 0.45, s * 0.55, '#f4f8ff');
      circ(c, 0, -s * 0.35, s * 0.38, '#f4f8ff');
      rr(c, -s * 0.28, -s * 0.95, s * 0.56, s * 0.3, 3, '#1e1e22');
      rr(c, -s * 0.4, -s * 0.7, s * 0.8, s * 0.08, 2, '#1e1e22');
      poly(c, [0, -s * 0.32, s * 0.4, -s * 0.26, 0, -s * 0.22], '#ff8a1f');
      circ(c, -s * 0.13, -s * 0.42, s * 0.05, '#1e1e22');
      circ(c, s * 0.13, -s * 0.42, s * 0.05, '#1e1e22');
      rr(c, -s * 0.4, -s * 0.08, s * 0.8, s * 0.14, 4, '#c8302f');
      for (const y of [0.25, 0.5, 0.75]) circ(c, 0, s * y, s * 0.05, '#1e1e22');
    },
    sign(c, s) {
      c.beginPath(); c.moveTo(-s * 0.6, -s * 0.6); c.lineTo(0, -s * 1.6); c.lineTo(s * 0.6, -s * 0.6); c.lineWidth = 3; c.strokeStyle = '#2a1a0e'; c.stroke();
      rr(c, -s, -s * 0.6, s * 2, s * 1.2, s * 0.12, '#8a5a2e');
      c.beginPath(); c.roundRect(-s, -s * 0.6, s * 2, s * 1.2, s * 0.12); outline(c, s * 0.08, '#4a2e14');
      c.fillStyle = '#f4e0b0';
      c.font = `${Math.round(s * 0.42)}px Rye, Georgia, serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('SALOON', 0, s * 0.02);
    },
    coconut(c, s) {
      circ(c, 0, 0, s * 0.85, '#6a4428');
      for (const [x, y] of [[-0.2, -0.3], [0.2, -0.3], [0, -0.05]]) circ(c, s * x, s * y, s * 0.1, '#3a2414');
      circ(c, -s * 0.35, -s * 0.4, s * 0.12, 'rgba(255,255,255,0.15)');
    },
    tikiMask(c, s) {
      rr(c, -s * 0.6, -s, s * 1.2, s * 2, s * 0.3, '#a8703a');
      rr(c, -s * 0.5, -s * 0.55, s * 0.4, s * 0.3, s * 0.1, '#3a1e0e');
      rr(c, s * 0.1, -s * 0.55, s * 0.4, s * 0.3, s * 0.1, '#3a1e0e');
      circ(c, -s * 0.3, -s * 0.4, s * 0.08, '#ffd23f');
      circ(c, s * 0.3, -s * 0.4, s * 0.08, '#ffd23f');
      poly(c, [-s * 0.1, -s * 0.2, s * 0.1, -s * 0.2, s * 0.15, s * 0.15, -s * 0.15, s * 0.15], '#8a5428');
      rr(c, -s * 0.45, s * 0.35, s * 0.9, s * 0.35, s * 0.1, '#3a1e0e');
      for (let i = 0; i < 4; i++) rr(c, -s * 0.38 + i * s * 0.2, s * 0.4, s * 0.12, s * 0.25, 2, '#f4e8c8');
      poly(c, [-s * 0.6, -s, -s * 0.3, -s * 1.3, 0, -s, s * 0.3, -s * 1.3, s * 0.6, -s], '#2a8a4a');
    },
    parrot(c, s, set, t) {
      const f = Math.sin(t * 14) * 0.5;
      ell(c, 0, 0, s * 0.5, s * 0.3, '#e83a2a');
      poly(c, [-s * 0.4, 0, -s * 1.1, s * 0.2, -s * 0.4, s * 0.2], '#2a6ae8');
      circ(c, s * 0.45, -s * 0.15, s * 0.25, '#e83a2a');
      poly(c, [s * 0.62, -s * 0.22, s * 0.85, -s * 0.05, s * 0.6, 0], '#f4e8c8');
      c.save(); c.rotate(f * 0.6);
      poly(c, [-s * 0.2, -s * 0.1, -s * 0.3, -s * 0.85, s * 0.2, -s * 0.15], '#2ab84a');
      poly(c, [-s * 0.25, -s * 0.5, -s * 0.3, -s * 0.85, -s * 0.05, -s * 0.5], '#ffd23f');
      c.restore();
      circ(c, s * 0.5, -s * 0.2, s * 0.05, '#111');
    },
    shield(c, s) {
      c.beginPath(); c.moveTo(-s * 0.8, -s * 0.8); c.lineTo(s * 0.8, -s * 0.8); c.lineTo(s * 0.8, 0); c.quadraticCurveTo(s * 0.7, s * 0.7, 0, s); c.quadraticCurveTo(-s * 0.7, s * 0.7, -s * 0.8, 0); c.closePath();
      c.fillStyle = '#2a4a9a'; c.fill(); outline(c, s * 0.1, '#d4af37');
      c.save(); c.clip(); rr(c, -s * 0.12, -s, s * 0.24, s * 2, 0, '#d4af37'); rr(c, -s, -s * 0.3, s * 2, s * 0.22, 0, '#d4af37'); c.restore();
    },
    crow(c, s, set, t) {
      const f = Math.sin(t * 12) * 0.6;
      const k = '#18161c';
      ell(c, 0, 0, s * 0.55, s * 0.24, k);
      circ(c, s * 0.45, -s * 0.1, s * 0.2, k);
      poly(c, [s * 0.6, -s * 0.14, s * 0.9, -s * 0.06, s * 0.6, 0], '#3a3a3a');
      poly(c, [-s * 0.5, 0, -s * 0.9, -s * 0.15, -s * 0.85, s * 0.15], k);
      poly(c, [-s * 0.2, -s * 0.05, -s * 0.4, -s * 0.8 - f * s * 0.4, s * 0.25, -s * 0.05], '#26222c');
      circ(c, s * 0.52, -s * 0.14, s * 0.04, '#ffcf3f');
    },
    disco(c, s) {
      circ(c, 0, 0, s * 0.9, '#b8c0d0');
      c.save(); c.beginPath(); c.arc(0, 0, s * 0.9, 0, Math.PI * 2); c.clip();
      for (let y = -1; y < 1; y += 0.2) for (let x = -1; x < 1; x += 0.2) rr(c, s * x + 1, s * y + 1, s * 0.18, s * 0.18, 1, (Math.round((x + y) * 10) % 3) ? '#dfe6f4' : '#ff5ad8');
      c.restore();
      rr(c, -1, -s * 1.6, 2, s * 0.7, 1, '#888');
    },
    record(c, s) {
      circ(c, 0, 0, s * 0.95, '#141414');
      for (const r of [0.8, 0.65, 0.5]) { c.beginPath(); c.arc(0, 0, s * r, 0, Math.PI * 2); outline(c, 1, 'rgba(255,255,255,0.12)'); }
      circ(c, 0, 0, s * 0.32, '#e3b04b');
      circ(c, 0, 0, s * 0.05, '#141414');
      ell(c, -s * 0.4, -s * 0.4, s * 0.25, s * 0.08, 'rgba(255,255,255,0.15)', -0.8);
    },
    cocktail(c, s) {
      poly(c, [-s * 0.8, -s * 0.8, s * 0.8, -s * 0.8, 0, s * 0.1], 'rgba(220,240,255,0.55)');
      poly(c, [-s * 0.62, -s * 0.62, s * 0.62, -s * 0.62, 0, s * 0.0], '#ff5ad8');
      rr(c, -2, 0, 4, s * 0.8, 1, 'rgba(220,240,255,0.8)');
      ell(c, 0, s * 0.82, s * 0.4, s * 0.08, 'rgba(220,240,255,0.8)');
      circ(c, s * 0.4, -s * 0.8, s * 0.14, '#2ab84a');
    },
    chip(c, s) {
      circ(c, 0, 0, s * 0.9, '#c8302f');
      for (let i = 0; i < 8; i++) { c.save(); c.rotate((i * Math.PI) / 4); rr(c, -s * 0.12, -s * 0.9, s * 0.24, s * 0.25, 2, '#f4f4f0'); c.restore(); }
      circ(c, 0, 0, s * 0.55, '#f4f4f0');
      circ(c, 0, 0, s * 0.45, '#c8302f');
      c.fillStyle = '#f5c542'; c.font = `900 ${Math.round(s * 0.45)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, 0);
    },
    dice(c, s) {
      rr(c, -s * 0.75, -s * 0.75, s * 1.5, s * 1.5, s * 0.25, '#f4f4f0');
      for (const [x, y] of [[-0.4, -0.4], [0.4, 0.4], [0, 0], [0.4, -0.4], [-0.4, 0.4]]) circ(c, s * x, s * y, s * 0.13, '#c8302f');
    },
    stein(c, s) {
      rr(c, -s * 0.6, -s * 0.7, s * 1.1, s * 1.6, s * 0.1, '#e8b030');
      c.beginPath(); c.arc(s * 0.55, s * 0.05, s * 0.35, -1.3, 1.3); outline(c, s * 0.16, '#c8ccd2');
      ell(c, -s * 0.05, -s * 0.75, s * 0.65, s * 0.25, '#fffaf0');
      circ(c, -s * 0.4, -s * 0.85, s * 0.2, '#fffaf0');
      circ(c, s * 0.25, -s * 0.85, s * 0.22, '#fffaf0');
      for (const x of [-0.35, 0, 0.3]) rr(c, s * x, -s * 0.4, s * 0.06, s * 1.1, 2, 'rgba(255,255,255,0.25)');
    },
    pretzel(c, s) {
      c.lineWidth = s * 0.28; c.strokeStyle = '#a8602a'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-s * 0.3, s * 0.7); c.bezierCurveTo(-s * 1.2, -s * 0.2, -s * 0.4, -s * 1, 0, -s * 0.2); c.bezierCurveTo(s * 0.4, -s * 1, s * 1.2, -s * 0.2, s * 0.3, s * 0.7); c.moveTo(-s * 0.5, s * 0.1); c.lineTo(s * 0.5, s * 0.1); c.stroke();
      for (const [x, y] of [[-0.6, -0.2], [0.5, -0.4], [0, 0.1], [-0.2, -0.5]]) circ(c, s * x, s * y, s * 0.05, '#fff');
    },
    buoy(c, s) {
      circ(c, 0, 0, s * 0.85, '#f4f4f0');
      c.save(); c.beginPath(); c.arc(0, 0, s * 0.85, 0, Math.PI * 2); c.arc(0, 0, s * 0.42, 0, Math.PI * 2, true); c.clip('evenodd');
      for (let i = 0; i < 4; i++) { c.save(); c.rotate((i * Math.PI) / 2); poly(c, [0, 0, s, -s * 0.4, s, s * 0.4], '#d8302f'); c.restore(); }
      c.restore();
      c.save(); c.beginPath(); c.arc(0, 0, s * 0.42, 0, Math.PI * 2); c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
    },
    grapes(c, s) {
      for (const [x, y] of [[-0.4, -0.4], [0, -0.45], [0.4, -0.4], [-0.2, -0.05], [0.2, -0.05], [0, 0.3], [-0.4, 0.25], [0.4, 0.25], [0, 0.65]]) circ(c, s * x, s * y, s * 0.24, '#6a2a8a');
      for (const [x, y] of [[-0.45, -0.48], [0.15, -0.1], [-0.05, 0.25]]) circ(c, s * x, s * y, s * 0.07, 'rgba(255,255,255,0.35)');
      ell(c, s * 0.2, -s * 0.85, s * 0.35, s * 0.16, '#4a8a2a', -0.4);
    },
    cup(c, s) {
      poly(c, [-s * 0.65, -s * 0.8, s * 0.65, -s * 0.8, s * 0.45, s * 0.85, -s * 0.45, s * 0.85], '#d62828');
      rr(c, -s * 0.66, -s * 0.85, s * 1.32, s * 0.16, 3, '#f4f4f0');
      for (const y of [-0.3, 0.1]) rr(c, -s * 0.58, s * y, s * 1.16, s * 0.05, 1, 'rgba(0,0,0,0.2)');
    },
    hubcap(c, s) {
      circ(c, 0, 0, s * 0.92, '#2a2a2e');
      circ(c, 0, 0, s * 0.75, '#c8ccd2');
      for (let i = 0; i < 5; i++) { c.save(); c.rotate((i * Math.PI * 2) / 5); rr(c, -s * 0.08, -s * 0.72, s * 0.16, s * 0.5, 3, '#8a9098'); c.restore(); }
      circ(c, 0, 0, s * 0.2, '#e8eaee');
    },
    oilcan(c, s) {
      rr(c, -s * 0.6, -s * 0.6, s * 1.2, s * 1.4, s * 0.1, '#2a6ae8');
      rr(c, -s * 0.6, -s * 0.15, s * 1.2, s * 0.4, 0, '#ffd23f');
      poly(c, [s * 0.2, -s * 0.6, s * 0.9, -s * 1.0, s * 0.95, -s * 0.9, s * 0.4, -s * 0.5], '#2a6ae8');
    },
    champagne(c, s) {
      rr(c, -s * 0.4, -s * 0.15, s * 0.8, s * 1.1, s * 0.15, '#1a4a2a');
      poly(c, [-s * 0.4, -s * 0.05, -s * 0.14, -s * 0.5, s * 0.14, -s * 0.5, s * 0.4, -s * 0.05], '#1a4a2a');
      rr(c, -s * 0.16, -s * 1.0, s * 0.32, s * 0.55, 3, '#e6c06a');
      rr(c, -s * 0.34, s * 0.15, s * 0.68, s * 0.42, 3, '#f4ecd8');
    },
    donut(c, s) {
      circ(c, 0, 0, s * 0.9, '#d8a060');
      circ(c, 0, -s * 0.05, s * 0.78, '#ff7ab8');
      for (let i = 0; i < 10; i++) { const a = i * 0.63; rr(c, Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.18, s * 0.05, 1, ['#fff', '#ffd23f', '#29f0ff'][i % 3]); }
      c.save(); c.beginPath(); c.arc(0, 0, s * 0.3, 0, Math.PI * 2); c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
    },
    tankard(c, s) {
      rr(c, -s * 0.6, -s * 0.7, s * 1.1, s * 1.6, s * 0.1, '#7a5a3a');
      for (const y of [-0.5, 0.6]) rr(c, -s * 0.62, s * y, s * 1.14, s * 0.12, 2, '#9aa0a6');
      c.beginPath(); c.arc(s * 0.55, s * 0.05, s * 0.35, -1.3, 1.3); outline(c, s * 0.16, '#9aa0a6');
      ell(c, -s * 0.05, -s * 0.75, s * 0.62, s * 0.22, '#f8f0dc');
    },
    duck(c, s, set, t) { mallard(c, s, Math.sin(t * 13) * 0.9 - 0.2); },
    duckSwim(c, s) { mallard(c, s, 0.15); c.fillStyle = 'rgba(180,210,230,0.5)'; c.fillRect(-s, s * 0.32, s * 2, s * 0.2); },
    goldDuck(c, s, set, t) { mallard(c, s, Math.sin(t * 15) * 0.9 - 0.2, true); },
    swan(c, s) {
      ell(c, -s * 0.05, s * 0.3, s * 0.75, s * 0.35, '#fbfbf6');
      ell(c, -s * 0.2, s * 0.15, s * 0.5, s * 0.25, '#ecece4', -0.2);
      c.lineCap = 'round'; c.beginPath(); c.moveTo(s * 0.5, s * 0.25); c.quadraticCurveTo(s * 0.75, -s * 0.2, s * 0.45, -s * 0.6); c.lineWidth = s * 0.2; c.strokeStyle = '#fbfbf6'; c.stroke();
      circ(c, s * 0.45, -s * 0.65, s * 0.15, '#fbfbf6');
      poly(c, [s * 0.56, -s * 0.7, s * 0.82, -s * 0.6, s * 0.56, -s * 0.56], '#f08a20');
      circ(c, s * 0.48, -s * 0.7, s * 0.04, '#111');
      // Its sign: please don't.
      rr(c, -s * 0.85, -s * 1.15, s * 1.0, s * 0.36, 4, '#d8302f');
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(s * 0.17)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DON’T SHOOT', -s * 0.35, -s * 0.97);
    },
  };
  // Kinds that animate (wings): drawn fresh each frame, not from a sprite.
  const LIVE = new Set(['gull', 'bat', 'parrot', 'crow', 'duck', 'goldDuck', 'ufo']);
  // Kinds that spin as they go.
  const SPIN = { bullseye: 1.4, asteroid: 0.8, record: 3, hubcap: 2.5, chip: 2, disco: 1, clay: 0, buoy: 0.6, shield: 0.8, bauble: 0.4, pumpkin: 0.3 };
  // Hit colours (the bits that fly off).
  const BITS_OF = { can: ['#c8ccd2', '#d8302f'], bottle: ['#2e8a4a', '#8ad8a0', '#fff'], champagne: ['#1a4a2a', '#e6c06a'], clay: ['#e86a20', '#f49048'], star: ['#ffd23f', '#fff'], goldDuck: ['#ffd23f', '#fff'], duck: ['#9a9a8e', '#1f6a3a', '#fff'], duckSwim: ['#9a9a8e', '#fff'], ghost: ['#fff', '#cfe'], pumpkin: ['#ff8a2a', '#4a6a2a'], bauble: ['#c8302f', '#e8b84a', '#fff'], asteroid: ['#7a6a5e', '#5a4c44'], cocktail: ['#ff5ad8', '#cfefff'], grapes: ['#6a2a8a', '#9a5aba'] };

  const sprites = new Map();
  let spriteSet = '';
  function sprite(kind, s, set) {
    if (spriteSet !== set) { sprites.clear(); spriteSet = set; }
    const key = `${kind}:${s}`;
    let cv = sprites.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    const pad = kind === 'tentacle' ? 2.6 : kind === 'sign' ? 1.8 : 1.4;
    cv.width = cv.height = Math.ceil(s * pad * 2);
    const c = cv.getContext('2d');
    c.translate(cv.width / 2, cv.height / 2);
    (DRAW[kind] || DRAW.bullseye)(c, s, set, 0);
    sprites.set(key, cv);
    return cv;
  }

  // ---------- The booth (drawn once) ----------
  const BOOTH = {
    // Per gallery: what's on the back wall. (The colours come from the room's own.)
    space: 'stars', halloween: 'moon', christmas: 'snow', pirate: 'sea', lighthouse: 'sea', tiki: 'sunset', club: 'neon', saloon: 'planks', castle: 'stone', dive: 'bricks', garage: 'bricks', frat: 'bricks',
  };
  function drawBooth(c, set) {
    c.save();
    c.scale(c.canvas.width / W, c.canvas.height / H);
    if (set === 'duckPond') { drawPond(c); c.restore(); return; }
    const bg = cssVar('bg', '#1c1a26');
    const card = cssVar('card', '#2a2833');
    const card2 = cssVar('card-2', '#3a3644');
    const accent = cssVar('accent', '#e8a83c');
    const wall = BOOTH[set];
    // The back wall.
    const grd = c.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, mix(card, '#000000', 0.25));
    grd.addColorStop(1, mix(bg, '#000000', 0.1));
    c.fillStyle = grd;
    c.fillRect(0, 0, W, H);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    if (wall === 'stars') for (let i = 0; i < 220; i++) circ(c, r() * W, r() * H * 0.8, r() * 2 + 0.4, `rgba(255,255,255,${0.3 + r() * 0.7})`);
    if (wall === 'stars') { circ(c, 1280, 200, 70, '#c86a4a'); ell(c, 1280, 200, 120, 18, 'rgba(255,220,180,0.4)', -0.3); }
    if (wall === 'moon') { circ(c, 1300, 170, 80, '#f4ecc8'); circ(c, 1330, 150, 14, '#e0d6a8'); circ(c, 1275, 200, 10, '#e0d6a8'); }
    if (wall === 'snow') for (let i = 0; i < 160; i++) circ(c, r() * W, r() * H * 0.8, r() * 3 + 1, 'rgba(255,255,255,0.7)');
    if (wall === 'sunset') { const s = c.createLinearGradient(0, 0, 0, 600); s.addColorStop(0, '#2a1a4a'); s.addColorStop(0.6, '#ff7a3a'); s.addColorStop(1, '#ffd070'); c.fillStyle = s; c.fillRect(0, 0, W, 600); circ(c, 800, 560, 120, '#ffe080'); }
    if (wall === 'sea' || wall === 'sunset') { c.fillStyle = mix('#13304d', bg, 0.3); c.fillRect(0, 560, W, 200); for (let i = 0; i < 30; i++) ell(c, r() * W, 580 + r() * 160, 40, 4, 'rgba(255,255,255,0.15)'); }
    if (wall === 'neon') for (let i = 0; i < 6; i++) { c.strokeStyle = i % 2 ? '#29f0ff' : '#ff2bd6'; c.globalAlpha = 0.35; c.lineWidth = 6; c.beginPath(); c.moveTo(i * 300, 0); c.lineTo(i * 300 + 400, 700); c.stroke(); c.globalAlpha = 1; }
    if (wall === 'planks' || wall === 'bricks' || wall === 'stone') {
      c.globalAlpha = 0.18;
      const bw = wall === 'planks' ? 0 : wall === 'stone' ? 140 : 90;
      const bh = wall === 'planks' ? 70 : wall === 'stone' ? 70 : 40;
      for (let y = 0; y < H; y += bh) {
        c.fillStyle = '#000';
        c.fillRect(0, y, W, 3);
        if (bw) for (let x = ((y / bh) % 2) * bw * 0.5; x < W; x += bw) c.fillRect(x, y, 3, bh);
      }
      c.globalAlpha = 1;
    }
    // Light from above.
    const glow = c.createRadialGradient(W / 2, 0, 50, W / 2, 0, 900);
    glow.addColorStop(0, 'rgba(255,240,200,0.18)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    // The rails the cut-outs ride (brass rods), with a slot behind each.
    for (const y of [0.35, 0.6]) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, y * H, W, 26);
      c.fillStyle = mix(accent, '#ffffff', 0.25);
      c.fillRect(0, y * H - 4, W, 8);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(0, y * H + 3, W, 3);
    }
    // The shelf and the counter in front of it.
    const wood = mix(card2, '#8a5a2e', 0.55);
    c.fillStyle = mix(wood, '#000000', 0.25);
    c.fillRect(0, 0.86 * H, W, 12);
    c.fillStyle = wood;
    c.fillRect(0, 0.86 * H + 12, W, H);
    for (let x = 0; x < W; x += 160) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, 0.86 * H + 12, 4, H); }
    c.fillStyle = mix(wood, '#ffffff', 0.18);
    c.fillRect(0, 0.86 * H + 12, W, 6);
    // The striped awning along the top, scalloped.
    const sw = 100;
    for (let x = 0; x < W; x += sw) {
      c.fillStyle = (x / sw) % 2 ? mix(card2, '#ffffff', 0.7) : accent;
      c.fillRect(x, 0, sw, 46);
      c.beginPath();
      c.arc(x + sw / 2, 46, sw / 2, 0, Math.PI);
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, 0, W, 6);
    // Curtains either side.
    for (const side of [0, 1]) {
      const x = side ? W - 70 : 0;
      const cg = c.createLinearGradient(x, 0, x + 70, 0);
      const cc = mix(cssVar('danger', '#c8303f'), '#000000', 0.35);
      cg.addColorStop(side ? 1 : 0, cc);
      cg.addColorStop(side ? 0 : 1, mix(cc, '#000000', 0.5));
      c.fillStyle = cg;
      c.fillRect(x, 0, 70, H);
      for (let k = 0; k < 4; k++) { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(x + 10 + k * 16, 0, 5, H); }
    }
    c.restore();
  }

  // The duck pond at dawn: a pale sky going gold at the horizon, a low sun, a line of far trees,
  // still water with the light on it, reeds and cattails along the bank, and the wooden hide
  // you're shooting from framing it all.
  function drawPond(c) {
    const sky = c.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, '#5a6ea8');
    sky.addColorStop(0.45, '#c8a0b8');
    sky.addColorStop(0.8, '#ffc890');
    sky.addColorStop(1, '#ffe0a8');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, 560);
    const sun = c.createRadialGradient(1100, 540, 10, 1100, 540, 260);
    sun.addColorStop(0, 'rgba(255,250,220,1)');
    sun.addColorStop(0.2, 'rgba(255,230,160,0.8)');
    sun.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = sun;
    c.fillRect(800, 300, 600, 300);
    // wisps of cloud
    for (const [x, y, w] of [[300, 160, 260], [900, 110, 200], [1300, 230, 220], [560, 260, 160]]) ell(c, x, y, w, 14, 'rgba(255,230,230,0.45)');
    // far hills and trees
    c.fillStyle = '#6a5a7a';
    c.beginPath(); c.moveTo(0, 520);
    for (let x = 0; x <= W; x += 80) c.lineTo(x, 470 + Math.sin(x * 0.006) * 30 + Math.sin(x * 0.02) * 8);
    c.lineTo(W, 560); c.lineTo(0, 560); c.fill();
    c.fillStyle = '#3e3a52';
    for (let x = 0; x < W; x += 36) { const h = 40 + ((x * 37) % 50); ell(c, x, 548 - h / 2, 22, h / 2 + 6, '#3e3a52'); }
    c.fillRect(0, 530, W, 30);
    // the water
    const water = c.createLinearGradient(0, 560, 0, H);
    water.addColorStop(0, '#f0c8a0');
    water.addColorStop(0.15, '#a89ab8');
    water.addColorStop(1, '#3a4a6a');
    c.fillStyle = water;
    c.fillRect(0, 560, W, H - 560);
    c.fillStyle = 'rgba(255,240,200,0.55)';
    for (let i = 0; i < 14; i++) c.fillRect(1100 - 120 + ((i * 53) % 240) - i * 4, 570 + i * 14, 60 + ((i * 31) % 80), 3);
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect((i * 137) % W, 600 + ((i * 71) % 250), 50, 2); }
    // reeds and cattails along the near bank (left and right clumps, and a ragged line at the
    // bottom where the ducks come up from)
    const reed = (x, base, h, lean) => {
      c.beginPath(); c.moveTo(x, base); c.quadraticCurveTo(x + lean * 0.5, base - h * 0.6, x + lean, base - h);
      c.lineWidth = 4; c.strokeStyle = ['#4a6a2a', '#5a7a32', '#3a5a22', '#6a7a3a'][Math.abs(Math.round(x)) % 4]; c.stroke();
    };
    const cattail = (x, base, h, lean) => {
      reed(x, base, h, lean);
      ell(c, x + lean * 0.95, base - h * 0.9, 7, 26, '#6a3a1e', lean * 0.004);
      c.beginPath(); c.moveTo(x + lean, base - h - 20); c.lineTo(x + lean * 1.02, base - h - 38); c.lineWidth = 2; c.strokeStyle = '#5a6a2a'; c.stroke();
    };
    for (let i = 0; i < 70; i++) {
      const x = (i * 97) % W;
      const h = 70 + ((i * 53) % 90);
      reed(x, H, h, ((i * 29) % 40) - 20);
    }
    for (const [x0, w] of [[0, 260], [1340, 260]]) {
      for (let i = 0; i < 40; i++) {
        const x = x0 + ((i * 61) % w);
        const h = 180 + ((i * 47) % 200);
        if (i % 5 === 0) cattail(x, H, h, ((i * 13) % 50) - 25);
        else reed(x, H, h, ((i * 17) % 60) - 30);
      }
    }
    // The hide: rough planks along the bottom and posts either side.
    c.fillStyle = '#5a3e26';
    c.fillRect(0, H - 40, W, 40);
    for (let x = 0; x < W; x += 120) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, H - 40, 3, 40); }
    c.fillStyle = '#7a5434';
    c.fillRect(0, H - 44, W, 6);
    for (const x of [0, W - 46]) { c.fillStyle = '#4a3220'; c.fillRect(x, 0, 46, H); c.fillStyle = 'rgba(255,220,160,0.12)'; c.fillRect(x + (x ? 0 : 38), 0, 8, H); }
    c.fillStyle = '#4a3220';
    c.fillRect(0, 0, W, 26);
    // A camouflage net of leaves hanging from the top beam.
    for (let i = 0; i < 60; i++) ell(c, (i * 89) % W, 26 + ((i * 31) % 26), 18, 8, ['#4a5a2a', '#5a6a32', '#3a4a22'][i % 3], ((i * 7) % 10) / 5 - 1);
  }

  // ---------- Guns ----------
  // Each venue's house gun (games/shootingGallery.js picks it): its name, its colours (finish and
  // accent, which the player can change), how it's drawn (side on, muzzle to the right, in a
  // 120 × 48 box) and how it sounds.
  // (Possible later: collect guns across venues.)
  const GUNS = {
    corkRifle: { name: 'Carnival Cork Rifle', finish: '#8a5a2e', accent: '#c8ccd2', snd: { n: 1800, len: 0.06, tone: 520, to: 260, ng: 0.5, tg: 0.18 } },
    tapPistol: { name: 'Tap-Handle Pistol', finish: '#3a3f47', accent: '#ff5a36', snd: { n: 1200, len: 0.08, tone: 220, to: 110, ng: 0.55, tg: 0.2 } },
    musket: { name: 'Old Musket', finish: '#6a4428', accent: '#c9a24a', snd: { n: 700, len: 0.16, tone: 140, to: 70, ng: 0.6, tg: 0.2 } },
    neonLaser: { name: 'Neon Laser', finish: '#1e1e22', accent: '#ff2bd6', snd: { n: 0, len: 0.14, tone: 1400, to: 300, ng: 0, tg: 0.16, type: 'square' } },
    crossbow: { name: 'Crossbow', finish: '#6a4428', accent: '#c8ccd2', snd: { n: 3000, len: 0.05, tone: 180, to: 160, ng: 0.3, tg: 0.22, type: 'triangle' } },
    trumpetBuss: { name: 'Trumpet-Bell Blunderbuss', finish: '#e3b23c', accent: '#8a1a2a', snd: { n: 600, len: 0.12, tone: 330, to: 300, ng: 0.4, tg: 0.18, type: 'sawtooth' } },
    ketchup: { name: 'Ketchup Squirter', finish: '#c8302f', accent: '#f4f4f4', snd: { n: 900, len: 0.12, tone: 300, to: 600, ng: 0.35, tg: 0.1 } },
    blowpipe: { name: 'Blowpipe', finish: '#a8703a', accent: '#2a8a4a', snd: { n: 2600, len: 0.1, tone: 0, ng: 0.35, tg: 0 } },
    drumRepeater: { name: 'Drum Repeater', finish: '#1e1e22', accent: '#8a5a2e', snd: { n: 1400, len: 0.05, tone: 180, to: 90, ng: 0.55, tg: 0.18 } },
    derringer: { name: 'Gold Derringer', finish: '#e3b23c', accent: '#f4f4f4', snd: { n: 2200, len: 0.05, tone: 600, to: 300, ng: 0.4, tg: 0.14 } },
    sixShooter: { name: 'Six-Shooter', finish: '#c8ccd2', accent: '#8a5a2e', snd: { n: 1100, len: 0.1, tone: 160, to: 80, ng: 0.6, tg: 0.22 } },
    flintlock: { name: 'Flintlock', finish: '#6a4428', accent: '#c9a24a', snd: { n: 800, len: 0.15, tone: 120, to: 60, ng: 0.6, tg: 0.2, click: true } },
    corkPopper: { name: 'Cork Popper', finish: '#2a6fdb', accent: '#f4f4f4', snd: { n: 2000, len: 0.05, tone: 700, to: 400, ng: 0.3, tg: 0.2, type: 'sine' } },
    rayGun: { name: 'Ray Gun', finish: '#c8ccd2', accent: '#7cf0ff', snd: { n: 0, len: 0.22, tone: 1800, to: 200, ng: 0, tg: 0.14, type: 'sine', wob: 30 } },
    flarePistol: { name: 'Flare Pistol', finish: '#ff8a1f', accent: '#1e1e22', snd: { n: 900, len: 0.2, tone: 260, to: 520, ng: 0.4, tg: 0.1 } },
    slingshot: { name: 'Vine Slingshot', finish: '#8a5a2e', accent: '#c0392b', snd: { n: 3500, len: 0.06, tone: 400, to: 900, ng: 0.25, tg: 0.12, type: 'triangle' } },
    foamBlaster: { name: 'Foam Dart Blaster', finish: '#ff8a1f', accent: '#2a8af0', snd: { n: 1500, len: 0.08, tone: 500, to: 380, ng: 0.35, tg: 0.12, type: 'triangle' } },
    nailGun: { name: 'Nail Gun', finish: '#ffd23f', accent: '#1e1e22', snd: { n: 2500, len: 0.04, tone: 300, to: 200, ng: 0.5, tg: 0.15, type: 'square' } },
    duelPistol: { name: 'Duelling Pistol', finish: '#3a3f47', accent: '#e6c06a', snd: { n: 900, len: 0.12, tone: 150, to: 75, ng: 0.55, tg: 0.2 } },
    candyPopgun: { name: 'Candy-Cane Popgun', finish: '#f4f4f4', accent: '#c8302f', snd: { n: 2200, len: 0.05, tone: 900, to: 500, ng: 0.3, tg: 0.18, type: 'sine', bell: true } },
    pumpkinBlaster: { name: 'Pumpkin Blaster', finish: '#ff7a1a', accent: '#2a1a35', snd: { n: 500, len: 0.18, tone: 90, to: 45, ng: 0.5, tg: 0.22, type: 'triangle' } },
    stalkingRifle: { name: 'Stalking Rifle', finish: '#5a3e26', accent: '#3a3f47', snd: { n: 1000, len: 0.13, tone: 130, to: 65, ng: 0.6, tg: 0.2 } },
    sideBySide: { name: 'Side-by-Side Shotgun', finish: '#5a3e26', accent: '#9aa0a6', snd: { n: 650, len: 0.2, tone: 100, to: 50, ng: 0.65, tg: 0.22 } },
  };
  const HOUSE = { classic: 'corkRifle', dive: 'tapPistol', tavern: 'musket', club: 'neonLaser', castle: 'crossbow', jazz: 'trumpetBuss', diner: 'ketchup', tiki: 'blowpipe', speakeasy: 'drumRepeater', casino: 'derringer', saloon: 'sixShooter', pirate: 'flintlock', beerhall: 'corkPopper', space: 'rayGun', lighthouse: 'flarePistol', vineyard: 'slingshot', frat: 'foamBlaster', garage: 'nailGun', chateau: 'duelPistol', christmas: 'candyPopgun', halloween: 'pumpkinBlaster', stpatricks: 'stalkingRifle' };
  const FINISHES = ['#3a3f47', '#23324a', '#c9a24a', '#c8ccd2', '#e3b23c', '#8a5a2e', '#c8302f', '#5ad8a6', '#ff6ab4', '#f4f4f4', '#1e1e22', '#7a4ad8', '#2a8af0', '#ff8a1f'];
  const SIGHTS = { ring: '◯ Ring', dot: '• Dot', cross: '✚ Cross', star: '✦ Star' };
  // The house gun where the room is (the lobby has no game view: from the look).
  const houseOf = (s) => {
    if (s?.game?.gun) return s.game.gun;
    const room = window.ROOM_STYLES?.roomOf ? ROOM_STYLES.roomOf(s?.look || s?.style || 'classic') : s?.style;
    if (s?.look === 'stpatricksDuckPond' || (room === 'stpatricks' && s?.selectedGame === 'shootingGallery' && s?.phase !== 'lobby')) return 'sideBySide';
    return HOUSE[room] || HOUSE.classic;
  };

  // Side-on drawings. f: finish, a: accent; dark metal and wood are shades of them.
  const dk = (c) => mix(c, '#000000', 0.35);
  const lt = (c) => mix(c, '#ffffff', 0.3);
  const GUN_ART = {
    corkRifle: (f, a) => `<path d="M4 30 L34 24 L40 34 L14 42 Z" fill="${f}"/><rect x="32" y="20" width="80" height="7" rx="2" fill="${a}"/><rect x="34" y="27" width="40" height="5" fill="${dk(f)}"/><path d="M50 32 q4 8 10 0" fill="none" stroke="${dk(a)}" stroke-width="2.5"/><circle cx="114" cy="23.5" r="4" fill="#d8b070"/>`,
    tapPistol: (f, a) => `<rect x="30" y="16" width="70" height="12" rx="3" fill="${f}"/><path d="M36 28 L58 28 L52 46 L34 46 Z" fill="${dk(f)}"/><rect x="40" y="2" width="9" height="16" rx="4" fill="${a}"/><rect x="96" y="18" width="10" height="8" fill="${lt(f)}"/><path d="M58 28 q4 8 10 0" fill="none" stroke="${lt(f)}" stroke-width="2.5"/>`,
    musket: (f, a) => `<path d="M2 32 L36 22 L44 34 L10 44 Z" fill="${f}"/><rect x="36" y="20" width="82" height="6" rx="2" fill="${dk(a)}"/><rect x="40" y="26" width="58" height="5" fill="${f}"/><rect x="44" y="16" width="8" height="6" fill="${a}"/><path d="M48 31 q4 8 10 0" fill="none" stroke="${a}" stroke-width="2.5"/>`,
    neonLaser: (f, a) => `<path d="M24 14 L96 14 L104 22 L96 30 L40 30 L34 46 L22 46 L26 30 Z" fill="${f}"/><rect x="30" y="19" width="66" height="4" rx="2" fill="${a}"/><rect x="104" y="19" width="14" height="6" rx="3" fill="${a}"/><circle cx="50" cy="38" r="3" fill="${a}"/>`,
    crossbow: (f, a) => `<rect x="10" y="22" width="92" height="8" rx="3" fill="${f}"/><path d="M84 2 Q74 26 84 46" fill="none" stroke="${a}" stroke-width="5"/><path d="M84 4 L40 26 L84 44" fill="none" stroke="#e8e0d0" stroke-width="1.5"/><rect x="40" y="24" width="72" height="3" fill="${lt(a)}"/><path d="M112 22 l8 3.5 l-8 3.5z" fill="${lt(a)}"/><path d="M20 30 L30 30 L26 44 L16 44 Z" fill="${dk(f)}"/>`,
    trumpetBuss: (f, a) => `<path d="M4 32 L30 24 L36 34 L12 42 Z" fill="${a}"/><rect x="28" y="21" width="60" height="7" fill="${f}"/><path d="M86 24 L118 8 L118 42 L86 26 Z" fill="${f}"/><ellipse cx="117" cy="25" rx="3" ry="17" fill="${dk(f)}"/><circle cx="50" cy="18" r="3" fill="${lt(f)}"/><circle cx="60" cy="18" r="3" fill="${lt(f)}"/><circle cx="70" cy="18" r="3" fill="${lt(f)}"/>`,
    ketchup: (f, a) => `<rect x="30" y="10" width="40" height="34" rx="12" fill="${f}"/><path d="M70 18 L104 22 L104 26 L70 30 Z" fill="${a}"/><rect x="104" y="22" width="12" height="4" rx="2" fill="${dk(f)}"/><rect x="38" y="18" width="24" height="10" rx="3" fill="${a}"/><text x="50" y="26" font-size="7" text-anchor="middle" fill="${f}" font-family="sans-serif" font-weight="900">57</text>`,
    blowpipe: (f, a) => `<rect x="2" y="21" width="116" height="7" rx="3.5" fill="${f}"/>${[16, 40, 64, 88].map((x) => `<rect x="${x}" y="20" width="5" height="9" rx="1" fill="${a}"/>`).join('')}<path d="M2 18 q-2 6 0 12" fill="none" stroke="${dk(f)}" stroke-width="3"/><path d="M60 29 q2 10 -4 14 M66 29 q2 10 6 13" stroke="${a}" stroke-width="2" fill="none"/>`,
    drumRepeater: (f, a) => `<path d="M2 30 L28 24 L32 34 L8 40 Z" fill="${a}"/><rect x="28" y="20" width="84" height="8" rx="2" fill="${f}"/><circle cx="52" cy="34" r="10" fill="${dk(f)}"/><circle cx="52" cy="34" r="4" fill="${lt(f)}"/><path d="M78 28 L86 28 L84 42 L76 42 Z" fill="${a}"/><rect x="100" y="16" width="4" height="5" fill="${f}"/>`,
    derringer: (f, a) => `<rect x="40" y="16" width="48" height="12" rx="4" fill="${f}"/><rect x="40" y="16" width="48" height="5" rx="2" fill="${lt(f)}"/><path d="M40 26 L54 26 L46 46 L32 44 Z" fill="${a}"/><path d="M54 28 q3 7 8 0" fill="none" stroke="${dk(f)}" stroke-width="2"/>`,
    sixShooter: (f, a) => `<rect x="44" y="16" width="70" height="8" rx="2" fill="${f}"/><rect x="40" y="14" width="26" height="16" rx="5" fill="${dk(f)}"/><path d="M42 26 L58 28 L50 48 L34 46 Z" fill="${a}"/><path d="M56 30 q4 8 10 0" fill="none" stroke="${dk(f)}" stroke-width="2.5"/><rect x="110" y="12" width="3" height="5" fill="${f}"/><path d="M40 16 l-6 -6" stroke="${f}" stroke-width="3"/>`,
    flintlock: (f, a) => `<path d="M30 22 L102 20 L104 28 L34 30 Z" fill="${dk(a)}"/><path d="M30 22 Q16 26 18 44 L32 46 Q30 34 40 30 Z" fill="${f}"/><path d="M40 14 l8 2 l-2 8 z" fill="${a}"/><circle cx="20" cy="44" r="3.5" fill="${a}"/><path d="M42 30 q4 8 10 0" fill="none" stroke="${a}" stroke-width="2.5"/>`,
    corkPopper: (f, a) => `<rect x="26" y="16" width="70" height="12" rx="6" fill="${f}"/><path d="M30 28 L48 28 L42 46 L28 46 Z" fill="${dk(f)}"/><rect x="96" y="17" width="16" height="10" rx="3" fill="#c8a070"/><path d="M48 28 q4 8 10 0" fill="none" stroke="${a}" stroke-width="2.5"/>${[40, 60, 80].map((x) => `<rect x="${x}" y="16" width="4" height="12" fill="${a}"/>`).join('')}`,
    rayGun: (f, a) => `<ellipse cx="52" cy="22" rx="26" ry="11" fill="${f}"/>${[60, 70, 80].map((x, i) => `<ellipse cx="${x + 12}" cy="22" rx="3" ry="${10 - i * 2}" fill="${a}"/>`).join('')}<rect x="78" y="19" width="28" height="6" fill="${f}"/><circle cx="110" cy="22" r="6" fill="${a}"/><path d="M36 30 L52 30 L44 46 L30 44 Z" fill="${dk(f)}"/><circle cx="44" cy="18" r="4" fill="${lt(a)}"/>`,
    flarePistol: (f, a) => `<rect x="34" y="12" width="64" height="18" rx="5" fill="${f}"/><rect x="92" y="10" width="10" height="22" rx="3" fill="${dk(f)}"/><path d="M36 28 L54 28 L48 46 L32 46 Z" fill="${a}"/><path d="M54 30 q4 7 9 0" fill="none" stroke="${a}" stroke-width="2.5"/>`,
    slingshot: (f, a) => `<path d="M60 46 L60 28 L46 4 M60 28 L74 4" fill="none" stroke="${f}" stroke-width="7" stroke-linecap="round"/><path d="M46 6 Q60 40 74 6" fill="none" stroke="${a}" stroke-width="2.5"/><circle cx="60" cy="24" r="5" fill="#6a2a8a"/>`,
    foamBlaster: (f, a) => `<rect x="24" y="12" width="76" height="16" rx="6" fill="${f}"/><rect x="40" y="6" width="40" height="7" rx="3" fill="${a}"/><path d="M30 28 L48 28 L42 46 L28 46 Z" fill="${a}"/><rect x="100" y="16" width="12" height="8" rx="2" fill="${dk(f)}"/><path d="M112 18 h6 v4 h-6z" fill="${a}"/><circle cx="62" cy="20" r="3" fill="#fff"/>`,
    nailGun: (f, a) => `<path d="M30 10 L96 10 L96 26 L44 26 L40 44 L26 44 L30 26 Z" fill="${f}"/><rect x="96" y="12" width="18" height="12" rx="2" fill="${a}"/><rect x="58" y="26" width="30" height="8" fill="${a}"/><rect x="34" y="14" width="30" height="5" rx="2" fill="${dk(f)}"/>`,
    duelPistol: (f, a) => `<rect x="36" y="18" width="78" height="7" rx="2" fill="${f}"/><path d="M36 18 Q18 22 20 44 L34 46 Q34 32 44 26 Z" fill="${dk(a)}"/><path d="M36 18 L50 16 L50 26 L38 26Z" fill="${a}"/><path d="M44 26 q4 8 10 0" fill="none" stroke="${a}" stroke-width="2.5"/><circle cx="22" cy="44" r="3" fill="${a}"/>`,
    candyPopgun: (f, a) => `<rect x="30" y="17" width="80" height="10" rx="5" fill="${f}"/>${[34, 46, 58, 70, 82, 94].map((x) => `<path d="M${x} 27 l8 -10 h5 l-8 10z" fill="${a}"/>`).join('')}<path d="M36 27 Q16 30 20 46" fill="none" stroke="${a}" stroke-width="7" stroke-linecap="round"/><path d="M36 27 Q16 30 20 46" fill="none" stroke="${f}" stroke-width="3" stroke-dasharray="4 4"/><circle cx="112" cy="22" r="5" fill="${a}"/>`,
    pumpkinBlaster: (f, a) => `<ellipse cx="54" cy="22" rx="22" ry="16" fill="${f}"/><path d="M42 10 q-3 12 0 24 M66 10 q3 12 0 24" stroke="${dk(f)}" stroke-width="2" fill="none"/><rect x="74" y="18" width="40" height="8" rx="2" fill="${a}"/><path d="M48 20 l4 -5 l4 5z M58 20 l4 -5 l4 5z" fill="${dk(a)}"/><path d="M38 34 L50 34 L44 47 L32 46 Z" fill="${a}"/><rect x="52" y="2" width="4" height="7" fill="#4a6a2a"/>`,
    stalkingRifle: (f, a) => `<path d="M2 32 L36 24 L42 34 L10 44 Z" fill="${f}"/><rect x="36" y="22" width="82" height="5" rx="2" fill="${a}"/><rect x="38" y="27" width="50" height="5" fill="${f}"/><rect x="48" y="12" width="34" height="7" rx="3" fill="${dk(a)}"/><path d="M54 19 v3 M76 19 v3" stroke="${dk(a)}" stroke-width="2"/><path d="M50 32 q4 8 10 0" fill="none" stroke="${a}" stroke-width="2.5"/>`,
    sideBySide: (f, a) => `<path d="M2 32 L36 22 L44 34 L10 44 Z" fill="${f}"/><rect x="38" y="18" width="80" height="5" rx="2" fill="${a}"/><rect x="38" y="23" width="80" height="5" rx="2" fill="${dk(a)}"/><rect x="40" y="28" width="40" height="5" fill="${f}"/><path d="M52 33 q4 8 10 0" fill="none" stroke="${a}" stroke-width="2.5"/>`,
  };
  function gunOf(s, id) {
    const model = houseOf(s);
    const look = s?.game?.guns?.[id] || (id === s?.me ? myLook() : null) || {};
    const def = GUNS[model] || GUNS.corkRifle;
    return { model, def, finish: look.finish || def.finish, accent: look.accent || def.accent, sight: look.sight || 'ring' };
  }
  function gunSvg(gun, cls = '') {
    return `<svg class="sg-gun ${cls}" viewBox="0 0 120 48" aria-label="${esc(gun.def.name)}">${(GUN_ART[gun.model] || GUN_ART.corkRifle)(gun.finish, gun.accent)}</svg>`;
  }
  // The TV's little picture of each player's gun, by its crosshair.
  const gunImgs = new Map();
  function gunImg(gun) {
    const key = `${gun.model}:${gun.finish}:${gun.accent}`;
    let img = gunImgs.get(key);
    if (!img) {
      img = new Image();
      img.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 48" width="240" height="96">${(GUN_ART[gun.model] || GUN_ART.corkRifle)(gun.finish, gun.accent)}</svg>`)}`;
      gunImgs.set(key, img);
    }
    return img;
  }

  // The shot, per gun: a short filtered noise burst (the bang) and a falling tone (the punch),
  // both soft at the top so nothing's harsh. On/off on the phone like Track Racing's car sound.
  let noise = null;
  const soundOn = () => { try { return localStorage.getItem('sg-sound') !== 'off'; } catch { return true; } };
  function shotSound(model, level = 1) {
    if (!soundOn()) return;
    const ac = window.Prefs?.audio?.();
    if (!ac) return;
    const p = (GUNS[model] || GUNS.corkRifle).snd;
    try {
      const t = ac.currentTime + 0.005;
      const vol = (window.Prefs?.get?.().volume ?? 1) * 0.5 * level;
      const out = ac.createGain();
      out.gain.value = vol;
      out.connect(ac.destination);
      if (p.n) {
        if (!noise) {
          noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
          const d = noise.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const src = ac.createBufferSource();
        src.buffer = noise;
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(p.n, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(120, p.n * 0.3), t + p.len);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(p.ng, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + p.len);
        src.connect(f).connect(g).connect(out);
        src.start(t, Math.random() * 0.3);
        src.stop(t + p.len + 0.02);
      }
      if (p.tone) {
        const o = ac.createOscillator();
        o.type = p.type || 'triangle';
        o.frequency.setValueAtTime(p.tone, t);
        o.frequency.exponentialRampToValueAtTime(p.to || p.tone, t + p.len);
        if (p.wob) {
          const l = ac.createOscillator();
          const lg = ac.createGain();
          l.frequency.value = p.wob;
          lg.gain.value = p.tone * 0.15;
          l.connect(lg).connect(o.frequency);
          l.start(t);
          l.stop(t + p.len + 0.02);
        }
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(p.tg, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + p.len * 1.3);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + p.len * 1.3 + 0.02);
      }
      if (p.bell) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = 2093;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.06, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g).connect(out);
        o.start(t + 0.03);
        o.stop(t + 0.32);
      }
    } catch {}
  }

  // An empty gun's click, and the reload (per gun, a little rattle and a rising tone).
  function clickSound() {
    const ac = soundOn() && window.Prefs?.audio?.();
    if (!ac) return;
    try {
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square';
      o.frequency.value = 1800;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.04);
    } catch {}
  }
  function reloadSound(model) {
    const ac = soundOn() && window.Prefs?.audio?.();
    if (!ac) return;
    const p = (GUNS[model] || GUNS.corkRifle).snd;
    try {
      const t = ac.currentTime;
      const zap = !p.n; // the laser and the ray gun recharge; everything else clicks home
      for (let i = 0; i < (zap ? 1 : 3); i++) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = zap ? 'sine' : 'triangle';
        const at = t + i * 0.09;
        o.frequency.setValueAtTime(zap ? 300 : 900 + i * 200, at);
        o.frequency.exponentialRampToValueAtTime(zap ? 1600 : 500, at + (zap ? 0.5 : 0.05));
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(zap ? 0.06 : 0.08, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + (zap ? 0.55 : 0.07));
        o.connect(g).connect(ac.destination);
        o.start(at);
        o.stop(at + 0.6);
      }
    } catch {}
  }

  // Your gun's finish, accent and crosshair: kept on this phone, and sent when a game starts.
  const SAVED = 'sg-gun';
  const myLook = () => { try { return JSON.parse(localStorage.getItem(SAVED) || 'null'); } catch { return null; } };
  function setLook(k, v) {
    const look = { finish: null, accent: null, sight: 'ring', ...(myLook() || {}) };
    look[k] = v || null;
    try { localStorage.setItem(SAVED, JSON.stringify(look)); } catch {}
    if (PB.state?.gameType === 'shootingGallery' && PB.state.game && !PB.isTV) PB.act('gun', look);
  }
  function gunPanel(s, { open = false } = {}) {
    const gun = gunOf(s, s.me);
    const sw = (k, cur, def) => [[null, def], ...FINISHES.map((c) => [c, ''])].map(([v, label]) => `<button class="tr-swatch ${cur === v ? 'selected' : ''} ${v ? '' : 'none'}" data-sg="look" data-k="${k}" data-v="${esc(v || '')}" style="--sw:${esc(v || 'transparent')}" aria-label="${esc(label || v)}">${label ? `<span>${esc(label)}</span>` : ''}</button>`).join('');
    const look = myLook() || {};
    return `<details class="card sg-armory" ${open ? 'open' : ''}>
      <summary>🔫 Your gun <small>${esc(gun.def.name)}</small></summary>
      <div class="sg-armory-in">
        <div class="sg-gun-show">${gunSvg(gun)}${sightSvg(gun.sight, PB.look(s.me).color)}</div>
        <p class="muted sg-house">Tonight’s piece: <b>the ${esc(gun.def.name)}</b>, the house gun here. Make it yours:</p>
        <h3>Finish</h3><div class="tr-swatches">${sw('finish', look.finish || null, 'House')}</div>
        <h3>Accent</h3><div class="tr-swatches">${sw('accent', look.accent || null, 'House')}</div>
        <h3>Crosshair</h3><div class="tr-chips">${Object.entries(SIGHTS).map(([k, label]) => `<button class="${gun.sight === k ? 'selected' : ''}" data-sg="look" data-k="sight" data-v="${k}">${label}</button>`).join('')}</div>
        <button class="secondary tr-small" data-sg="sound">${soundOn() ? '🔈 Gun sound on' : '🔇 Gun sound off'}</button>
      </div>
    </details>`;
  }
  function sightSvg(kind, color) {
    const c = esc(color);
    const body = {
      ring: `<circle r="14" fill="none" stroke="${c}" stroke-width="4"/><circle r="2.5" fill="${c}"/>`,
      dot: `<circle r="7" fill="${c}" stroke="#fff" stroke-width="2"/>`,
      cross: `<path d="M-16 0H-5M5 0H16M0 -16V-5M0 5V16" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`,
      star: `<path d="M0 -16 L4 -5 L16 -5 L6 2 L10 14 L0 7 L-10 14 L-6 2 L-16 -5 L-4 -5Z" fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round"/>`,
    }[kind] || '';
    return `<svg class="sg-sight" viewBox="-20 -20 40 40">${body}</svg>`;
  }

  // ---------- Drawing the gallery, every frame ----------
  let views = [];
  let frame = null;
  const zs = []; // the live targets, in drawing order (reused)
  function attachViews() {
    const s = PB.state;
    views = [...document.querySelectorAll('.sg-stage')].map((el) => {
      const [bg, fg] = el.querySelectorAll('canvas');
      const scale = PB.isTV ? 1 : Math.min(1, (el.clientWidth * (window.devicePixelRatio || 1)) / W);
      for (const cv of [bg, fg]) { cv.width = Math.round(W * scale); cv.height = Math.round(H * scale); }
      drawBooth(bg.getContext('2d'), s.game.set);
      return { el, fg, c: fg.getContext('2d'), scale, time: el.querySelector('.sg-time'), score: el.querySelector('.sg-score-now') };
    });
    kick();
  }
  const kick = () => { if (!frame && !document.hidden && views.length) frame = requestAnimationFrame(draw); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && frame) { cancelAnimationFrame(frame); frame = null; } else kick(); });

  let lastDraw = 0;
  function draw(ms) {
    frame = null;
    views = views.filter((v) => v.el.isConnected);
    const s = PB.state;
    if (!views.length || s?.gameType !== 'shootingGallery' || !s.game) return;
    const dt = Math.min(0.05, (ms - lastDraw) / 1000 || 0.016);
    lastDraw = ms;
    const t = clock.now();
    const round = s.phase === 'round';
    // Who's where (eased: low lag beats smooth, so only a little).
    for (let i = 0; i < order.length; i++) {
      const a = aimNow[i];
      if (!a) continue;
      const b = (aimShown[i] ||= [a[0], a[1]]);
      const k = 0.55;
      b[0] += (a[0] - b[0]) * k;
      b[1] += (a[1] - b[1]) * k;
    }
    // This phone's own crosshair is its own, not the server's echo.
    const meIdx = PB.isTV ? -1 : order.indexOf(s.me);
    if (meIdx >= 0 && aim.ok) aimShown[meIdx] = [aim.x, aim.y];
    zs.length = 0;
    if (round && t != null) for (const tg of targets.values()) {
      if (t > tg.t0 + tg.life + 0.7) { targets.delete(tg.id); continue; }
      if (t >= tg.t0 && (!tg.hitAt || t - tg.hitAt < 0.6)) zs.push(tg);
    }
    zs.sort((a, b) => a.z - b.z || a.id - b.id);
    for (const b of bits) if (b.on) { b.life -= dt; if (b.life <= 0) b.on = false; else { b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; } }
    const now = performance.now();
    for (const v of views) {
      const c = v.c;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, v.fg.width, v.fg.height);
      c.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      for (const tg of zs) drawTarget(c, tg, t, s.game.set);
      for (const b of bits) if (b.on) { c.globalAlpha = Math.min(1, b.life * 2); c.fillStyle = b.c; c.fillRect(b.x - b.s / 2, b.y - b.s / 2, b.s, b.s); }
      c.globalAlpha = 1;
      // Muzzle flashes, at the shot.
      for (const f of flashes) {
        if (!f.on) continue;
        const age = (now - f.at) / 1000;
        if (age > 0.18) { f.on = false; continue; }
        const r = 30 + age * 260;
        c.globalAlpha = 1 - age / 0.18;
        circ(c, f.x, f.y, r, 'rgba(255,240,190,0.55)');
        circ(c, f.x, f.y, r * 0.45, f.c);
        c.globalAlpha = 1;
      }
      for (let i = 0; i < order.length; i++) {
        const b = aimShown[i];
        if (!b || b[0] < -1) continue;
        drawSight(c, s, order[i], b[0] * W, b[1] * H, i === meIdx);
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const p of pops) {
        if (!p.on) continue;
        const age = (now - p.at) / 1000;
        if (age > 1.1) { p.on = false; continue; }
        c.globalAlpha = Math.min(1, (1.1 - age) * 3);
        c.font = '900 54px system-ui, sans-serif';
        c.lineWidth = 8;
        c.strokeStyle = 'rgba(0,0,0,0.6)';
        c.strokeText(p.text, p.x, p.y - age * 90);
        c.fillStyle = p.c;
        c.fillText(p.text, p.x, p.y - age * 90);
        c.globalAlpha = 1;
      }
      if (v.time) {
        const left = round && t != null ? Math.max(0, Math.ceil(s.game.length - t)) : s.game.length;
        if (v.time.dataset.v !== String(left)) { v.time.dataset.v = left; v.time.textContent = `${left}s`; v.time.classList.toggle('low', left <= 10 && round); }
      }
    }
    // The phone's FIRE screen clock.
    const pt = document.getElementById('sg-phone-time');
    if (pt && round && t != null) {
      const left = String(Math.max(0, Math.ceil(s.game.length - t)));
      if (pt.textContent !== left) pt.textContent = left;
    }
    frame = requestAnimationFrame(draw);
  }

  function drawTarget(c, tg, t, set) {
    const at = tg.hitAt ? tg.hitAt : t;
    posAt(tg, at, tmp);
    let x = tmp.x * W;
    let y = tmp.y * H;
    const s = Math.round(tg.r * H);
    const spin = SPIN[tg.k] || 0;
    let rot = tg.p === 'swing' && tg.k === 'sign' ? -tmp.th : spin * (t - tg.t0);
    let alpha = 1;
    if (tg.hitAt) {
      // Knocked off: it flips back and drops.
      const age = t - tg.hitAt;
      y += age * age * 1400;
      rot += age * 8 * (tg.id % 2 ? 1 : -1);
      alpha = Math.max(0, 1 - age / 0.6);
    }
    // Facing the way it's going.
    const flip = (tg.p === 'rail' || tg.p === 'arc') && tg.vx < 0;
    c.save();
    c.globalAlpha = alpha;
    // (The shelf's pop-ups are hidden behind the counter's front.)
    if (tg.p === 'pop') { c.beginPath(); c.rect(0, 0, W, 0.86 * H); c.clip(); }
    if (tg.p === 'swing' && tg.k === 'sign') {
      // The ropes up to where it hangs.
      c.beginPath(); c.moveTo(tg.x * W, tg.y * H); c.lineTo(x, y - s * 1.5); c.lineWidth = 3; c.strokeStyle = '#2a1a0e'; c.stroke();
    }
    c.translate(x, y);
    if (rot) c.rotate(rot);
    if (flip) c.scale(-1, 1);
    if (LIVE.has(tg.k)) DRAW[tg.k](c, s, set, t);
    else {
      const img = sprite(tg.k, s, set);
      c.drawImage(img, -img.width / 2, -img.height / 2);
    }
    if (tg.gold && !tg.hitAt) { c.globalAlpha = 0.35 + 0.25 * Math.sin(t * 10); circ(c, 0, 0, s * 1.4, 'rgba(255,220,80,0.5)'); }
    c.restore();
  }

  function drawSight(c, s, id, x, y, mine) {
    const look = PB.look(id);
    const gun = gunOf(s, id);
    const col = look.color;
    c.save();
    c.translate(x, y);
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.fillStyle = col;
    const R = mine && !PB.isTV ? 30 : 26;
    const shape = () => {
      c.beginPath();
      if (gun.sight === 'dot') { c.arc(0, 0, R * 0.42, 0, Math.PI * 2); return 'fill'; }
      if (gun.sight === 'cross') { for (const [a, b, e, f] of [[-R, 0, -R * 0.3, 0], [R * 0.3, 0, R, 0], [0, -R, 0, -R * 0.3], [0, R * 0.3, 0, R]]) { c.moveTo(a, b); c.lineTo(e, f); } return 'stroke'; }
      if (gun.sight === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.42 : R; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); return 'stroke'; }
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.moveTo(3, 0);
      c.arc(0, 0, 3, 0, Math.PI * 2);
      return 'stroke';
    };
    const how = shape();
    c.lineCap = 'round';
    if (how === 'fill') { c.lineWidth = 9; c.stroke(); c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke(); } else { c.lineWidth = 10; c.stroke(); c.lineWidth = 5; c.strokeStyle = col; c.stroke(); }
    // Their avatar and gun beside it.
    c.font = '30px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(look.avatar, R + 6, -R * 0.6);
    const img = gunImg(gun);
    if (img.complete && img.naturalWidth) c.drawImage(img, R + 4, -R * 0.2, 60, 24);
    // Rounds left, under it (R when it's empty, a bar while it reloads).
    const i = order.indexOf(id);
    const left = mine && !PB.isTV ? mag.left : ammoNow[i];
    const max = s.game.gunStats?.mag || 6;
    if (left != null && s.phase === 'round') {
      if (left === 0) { c.font = '900 26px system-ui'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 5; c.strokeText('R', R + 8, R * 0.95); c.fillText('R', R + 8, R * 0.95); }
      else if (left < 0) { c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(R + 6, R * 0.8, 40 * ((performance.now() / 300) % 1), 5); }
      else { const n = Math.min(max, 12); const w = Math.min(7, 56 / n); for (let k = 0; k < n; k++) { c.fillStyle = k < Math.ceil((left / max) * n) ? col : 'rgba(0,0,0,0.45)'; c.fillRect(R + 6 + k * (w + 2), R * 0.8, w, 7); } }
    }
    c.restore();
  }

  // ---------- Signals ----------
  function onGallery(d) {
    const s = PB.state;
    if (s?.gameType !== 'shootingGallery' || !s.game) return;
    order = s.game.order;
    for (let i = 0; i < order.length; i++) {
      const x = d.a[i * 2];
      aimNow[i] = x < -1 ? null : [x, d.a[i * 2 + 1]];
      if (!aimNow[i]) aimShown[i] = null;
    }
    if (d.t >= 0) {
      if (d.r !== clock.round) { clock.reset(); clock.round = d.r; targets.clear(); mag.left = -2; }
      clock.arrive(performance.now() / 1000, d.t);
    }
    for (const tg of d.n || []) addTarget(tg);
    if (d.m) {
      ammoNow = d.m;
      const mine = order.indexOf(s.me);
      // (The server's count wins, unless this phone has just fired or started a reload it hasn't
      // heard back about.)
      if (mine >= 0 && !PB.isTV && performance.now() - lastFire > 400 && !(mag.left === -1 && d.m[mine] >= 0 && performance.now() < mag.until)) {
        mag.left = d.m[mine];
        if (mag.left === -1 && mag.until < performance.now()) mag.until = performance.now() + 300;
        showAmmo(s);
      }
    }
    const now = performance.now();
    for (const [i, x, y, id, pts] of d.f || []) {
      const who = order[i];
      const col = PB.look(who).color;
      const f = flashes[flashAt];
      flashAt = (flashAt + 1) % FLASHES;
      Object.assign(f, { on: true, x: x * W, y: y * H, at: now, c: col });
      if (who !== s.me && (PB.isTV || !s.tv)) shotSound(gunOf(s, who).model, PB.isTV ? 0.6 : 0.35);
      if (!id) continue;
      const tg = targets.get(id);
      if (tg) {
        tg.hitAt = clock.now() ?? tg.t0;
        tg.hitBy = who;
        posAt(tg, tg.hitAt, tmp);
        burst(tmp.x * W, tmp.y * H, BITS_OF[tg.k] || ['#fff', col, '#ffd23f']);
      }
      const p = pops[popAt];
      popAt = (popAt + 1) % POPS;
      Object.assign(p, { on: true, x: x * W, y: y * H - 40, at: now, c: pts < 0 ? '#ff4a4a' : col, text: pts > 0 ? `+${pts}` : `${pts}` });
      if (who === s.me && !PB.isTV) {
        PB.buzz(pts < 0 ? 'turn' : 'hit');
        const el = document.getElementById('sg-hitnote');
        if (el) { el.textContent = pts > 0 ? `+${pts}` : `${pts} 🙈`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
      }
    }
    if (d.s) {
      scores = d.s;
      const mine = order.indexOf(s.me);
      const el = document.getElementById('sg-my-score');
      if (el && mine >= 0) el.textContent = scores[mine];
      updateBoard(s);
    }
    kick();
  }

  // ---------- Aiming ----------
  const aim = { x: 0.5, y: 0.5, ok: false, sent: 0, sx: -1, sy: -1, yaw: 0, pitch: 0, live: false };
  const motion = { listening: false, live: false, granted: false, denied: false, last: null };
  // The calibration: hold ('remote' with a TV: the top edge points; 'camera' without: the back),
  // the middle's heading and pitch, and how many degrees reach the corner. step: 1 the middle,
  // 2 the corner, 0 done (or not started).
  let cal = { step: 0, hold: null, yaw0: 0, pitch0: 0, kx: 0, ky: 0, done: false };
  const CAL_SAVED = 'sg-cal';
  const savedCal = () => { try { return JSON.parse(localStorage.getItem(CAL_SAVED) || 'null'); } catch { return null; } };
  const needsPermission = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  const holdFor = (s) => (s?.tv ? 'remote' : 'camera');

  const R2D = 180 / Math.PI;
  // Which way the phone points (heading and pitch, in degrees) from its orientation. The
  // pointer's direction in the world is R·d, R from alpha, beta, gamma (Z-X'-Y'), d the top
  // edge (0, 1, 0) or the back (0, 0, −1). Turning the phone about the pointer (rolling it)
  // doesn't move it, and the 0/360 wrap is taken care of by working in vectors.
  function pointing(e, hold) {
    const a = (e.alpha || 0) / R2D;
    const b = (e.beta || 0) / R2D;
    const g = (e.gamma || 0) / R2D;
    const sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b), sg = Math.sin(g), cg = Math.cos(g);
    let vx, vy, vz;
    if (hold === 'remote') { vx = -sa * cb; vy = ca * cb; vz = sb; } else { vx = -ca * sg - sa * sb * cg; vy = -sa * sg + ca * sb * cg; vz = -cb * cg; }
    return { yaw: Math.atan2(vx, vy) * R2D, pitch: Math.asin(clamp(vz, -1, 1)) * R2D };
  }
  const wrap = (d) => ((d + 540) % 360) - 180;

  function onOrient(e) {
    if (e.alpha == null && e.beta == null) return;
    motion.last = e;
    if (!motion.live) { motion.live = true; lastKey = ''; PB.rerender(); }
    const s = PB.state;
    if (s?.gameType !== 'shootingGallery' || PB.isTV) return;
    const hold = cal.hold || holdFor(s);
    const p = pointing(e, hold);
    // A light smoothing (low lag beats smooth).
    if (!aim.live) { aim.yaw = p.yaw; aim.pitch = p.pitch; aim.live = true; } else {
      aim.yaw += wrap(p.yaw - aim.yaw) * 0.6;
      aim.pitch += (p.pitch - aim.pitch) * 0.6;
    }
    if (cal.done) {
      aim.x = clamp(0.5 + ((CORNER.x - 0.5) * wrap(aim.yaw - cal.yaw0)) / cal.kx, -0.12, 1.12);
      aim.y = clamp(0.5 - ((0.5 - CORNER.y) * (aim.pitch - cal.pitch0)) / cal.ky, -0.12, 1.12);
      aim.ok = true;
      sendAim();
      // Muzzle to the ceiling: reload.
      const up = (aim.pitch - cal.pitch0) * Math.sign(cal.ky);
      if (up > RELOAD_PITCH) {
        tiltAt ??= performance.now();
        if (performance.now() - tiltAt > RELOAD_HOLD) { tiltAt = Infinity; startReload(); }
      } else if (up < RELOAD_PITCH - 15) tiltAt = null;
    }
  }
  function listen() {
    if (motion.listening || PB.isTV || typeof window === 'undefined') return;
    motion.listening = true;
    window.addEventListener('deviceorientation', onOrient);
  }
  function askMotion() {
    DeviceOrientationEvent.requestPermission().then((st) => {
      motion.granted = st === 'granted';
      motion.denied = !motion.granted;
      lastKey = '';
      PB.rerender();
    }).catch(() => { motion.denied = true; lastKey = ''; PB.rerender(); });
  }
  let tiltAt = null;
  let sendTimer = null;
  function sendAim() {
    const wait = SEND_MS - (performance.now() - aim.sent);
    if (wait > 0) { sendTimer ??= setTimeout(() => { sendTimer = null; sendAim(); }, wait); return; }
    if (Math.abs(aim.x - aim.sx) < 0.0015 && Math.abs(aim.y - aim.sy) < 0.0015) return;
    aim.sent = performance.now();
    aim.sx = aim.x;
    aim.sy = aim.y;
    PB.act('aim', { x: +aim.x.toFixed(4), y: +aim.y.toFixed(4) });
  }
  // No motion sensor (a laptop) or none allowed: drag on the pad to move the crosshair.
  function dragAim(el) {
    let from = null;
    el.onpointerdown = (e) => { from = { x: e.clientX, y: e.clientY, ax: aim.x, ay: aim.y }; el.setPointerCapture?.(e.pointerId); };
    el.onpointermove = (e) => {
      if (!from) return;
      const w = el.clientWidth || 300;
      aim.x = clamp(from.ax + ((e.clientX - from.x) * 1.4) / w, -0.1, 1.1);
      aim.y = clamp(from.ay + ((e.clientY - from.y) * 1.4 * ASPECT) / w, -0.1, 1.1);
      aim.ok = true;
      sendAim();
    };
    el.onpointerup = el.onpointercancel = () => { from = null; };
  }

  // Calibration taps.
  function calTap() {
    const s = PB.state;
    if (!aim.live) return;
    if (cal.step !== 2) {
      cal = { step: 2, hold: holdFor(s), yaw0: aim.yaw, pitch0: aim.pitch, kx: 0, ky: 0, done: false };
      PB.act('calib', { step: 2 });
    } else {
      let kx = wrap(aim.yaw - cal.yaw0);
      let ky = aim.pitch - cal.pitch0;
      // Too little turn to tell (a tap without moving): ask again.
      if (Math.abs(kx) < 2.5 || Math.abs(ky) < 1.2) { calNote = 'Turn a bit further: right up to the top-right corner, then tap.'; lastKey = ''; PB.rerender(); return; }
      // Odd up-down against across (a sloppy corner): go by the across, and the gallery's shape.
      const ratio = Math.abs(ky / kx);
      if (ratio < 0.3 || ratio > 1.2) ky = Math.sign(ky) * Math.abs(kx) * (9 / 16);
      finishCal(kx, ky);
    }
    calNote = '';
    PB.buzz();
    lastKey = '';
    PB.rerender();
  }
  function finishCal(kx, ky) {
    Object.assign(cal, { step: 0, kx, ky, done: true });
    try { localStorage.setItem(CAL_SAVED, JSON.stringify({ hold: cal.hold, kx, ky })); } catch {}
    PB.act('calibrated');
  }
  function useLast() {
    const last = savedCal();
    if (!last || cal.step !== 2) return;
    finishCal(last.kx, last.ky);
    lastKey = '';
    PB.rerender();
  }
  function recalibrate() {
    cal = { step: 1, hold: holdFor(PB.state), yaw0: 0, pitch0: 0, kx: 0, ky: 0, done: false };
    aim.ok = false;
    PB.act('calib', { step: 1 });
    lastKey = '';
    PB.rerender();
  }
  let calNote = '';

  // ---------- Shooting ----------
  // The magazine, as this phone sees it (the server has the last word: its count comes back
  // with every tick).
  const mag = { left: -2, until: 0 };
  function magNow(s) {
    const st = s.game.gunStats || { mag: 6 };
    if (mag.left === -2) mag.left = st.mag;
    if (mag.left === -1 && performance.now() >= mag.until) mag.left = st.mag;
    return mag.left;
  }
  function startReload() {
    const s = PB.state;
    if (s?.phase !== 'round' && s?.phase !== 'countdown') return;
    const st = s.game.gunStats || { mag: 6, reload: 1200 };
    if (magNow(s) < 0 || magNow(s) >= st.mag) return;
    mag.left = -1;
    mag.until = performance.now() + st.reload;
    PB.act('reload');
    reloadSound(houseOf(s));
    try { navigator.vibrate?.([10, 40, 10, 40, 10]); } catch {}
    showAmmo(s);
  }
  function showAmmo(s) {
    const el = document.getElementById('sg-ammo');
    if (!el) return;
    const st = s.game.gunStats || { mag: 6 };
    const left = magNow(s);
    const key = `${left}:${st.mag}`;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.innerHTML = left < 0 ? '<b class="sg-reloading">RELOADING…</b>'
      : `${'<i class="on"></i>'.repeat(left)}${'<i></i>'.repeat(Math.max(0, st.mag - left))}${left === 0 ? '<b class="sg-empty">TILT UP TO RELOAD</b>' : ''}`;
    document.querySelector('.sg-fire')?.classList.toggle('empty', left === 0);
    document.querySelector('.sg-fire')?.classList.toggle('reloading', left < 0);
  }
  let lastFire = 0;
  function fire() {
    const s = PB.state;
    if (s?.phase !== 'round' || !aim.ok) return;
    const now = performance.now();
    const st = s.game.gunStats || { rate: 250 };
    if (magNow(s) < 0) return;
    if (magNow(s) === 0) { clickSound(); try { navigator.vibrate?.(5); } catch {} return; }
    if (now - lastFire < st.rate) return;
    lastFire = now;
    mag.left -= 1;
    showAmmo(s);
    const t = clock.now();
    PB.act('shoot', { x: +aim.x.toFixed(4), y: +aim.y.toFixed(4), ...(t != null ? { t: +t.toFixed(3) } : {}) });
    try { navigator.vibrate?.(15); } catch {}
    shotSound(houseOf(s));
    const g = document.querySelector('.sg-fire .sg-gun');
    if (g) { g.classList.remove('kick'); void g.getBoundingClientRect(); g.classList.add('kick'); }
    // Without a TV the flash is on this phone's gallery at once (the server's comes back later).
    if (!s.tv) {
      const f = flashes[flashAt];
      flashAt = (flashAt + 1) % FLASHES;
      Object.assign(f, { on: true, x: aim.x * W, y: aim.y * H, at: now, c: PB.look(s.me).color });
    }
  }

  // Held sideways, the phone may turn its screen to landscape: the FIRE screen turns back, so the
  // gun always points at the phone's own top edge.
  function turnWithScreen() {
    const el = document.querySelector('.sg-phone.has-tv');
    if (!el) return;
    const a = ((screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    el.classList.toggle('rot90', a === 90);
    el.classList.toggle('rot270', a === 270);
  }
  window.addEventListener('orientationchange', () => setTimeout(turnWithScreen, 50));
  screen.orientation?.addEventListener?.('change', turnWithScreen);

  // Which hand holds it: the gun's drawn the other way round for a left hand.
  const hand = () => { try { return localStorage.getItem('sg-hand') || 'right'; } catch { return 'right'; } };

  // ---------- Screens ----------
  function stage(s, { overlay = true } = {}) {
    return `<div class="sg-stage ${s.game.set === 'duckPond' ? 'pond' : ''}"><canvas></canvas><canvas></canvas>
      ${overlay ? `<div class="sg-hud"><span class="sg-round">Round ${Math.max(1, s.game.round)}/${s.game.rounds}</span><span class="sg-time">${s.game.length}s</span></div>` : ''}
      <div class="sg-over-layer" id="sg-layer">${layer(s)}</div></div>`;
  }
  // What's over the gallery: the calibration dots, the countdown.
  function layer(s) {
    const g = s.game;
    if (s.phase === 'countdown') return `<div class="sg-count">${g.count}</div>`;
    const steps = g.calStep || {};
    const on = (n) => Object.keys(steps).filter((id) => steps[id] === n);
    const middle = s.phase === 'calibrate' ? s.players.filter((p) => !g.cal[p.id] && steps[p.id] !== 2).map((p) => p.id) : on(1);
    const corner = on(2);
    const who = (ids) => ids.map((id) => PB.avatar(id, 'sm')).join('');
    let html = '';
    if (middle.length || s.phase === 'calibrate') html += `<div class="sg-dot mid ${middle.length ? '' : 'idle'}"><i></i><b>Aim here</b><span>${who(middle)}</span></div>`;
    if (corner.length) html += `<div class="sg-dot corner"><i></i><b>Now here</b><span>${who(corner)}</span></div>`;
    if (s.phase === 'calibrate') html += `<div class="sg-callist">${s.players.map((p) => `<span class="${g.cal[p.id] ? 'ok' : ''}">${PB.avatar(p.id, 'sm')}${g.cal[p.id] ? '✓' : '…'}</span>`).join('')}</div>`;
    return html;
  }

  function board(s) {
    const g = s.game;
    const ids = g.order.filter((id) => s.players.some((p) => p.id === id));
    const live = s.phase === 'round';
    const rows = ids.map((id, i) => ({ id, pts: live ? scores[g.order.indexOf(id)] ?? g.stats[id]?.round ?? 0 : g.stats[id]?.score ?? 0 })).sort((a, b) => b.pts - a.pts);
    return `<div class="card sg-scores"><h2>${live ? `Round ${g.round}` : 'Scores'}</h2><ol>${rows.map((r) => {
      const gun = gunOf(s, r.id);
      return `<li style="--pc:${esc(PB.look(r.id).color)}">${PB.avatar(r.id, 'sm')}<span>${esc(name(r.id))}</span>${gunSvg(gun, 'mini')}<b>${r.pts}</b></li>`;
    }).join('')}</ol></div>`;
  }
  let boardKey = '';
  function updateBoard(s) {
    const el = document.querySelector('.sg-scores');
    if (!el) return;
    const html = board(s);
    if (html === boardKey) return;
    boardKey = html;
    el.outerHTML = html;
  }

  function results(s) {
    const g = s.game;
    const r = g.result;
    if (!r) return '';
    const over = s.phase === 'over';
    const rows = over ? g.order.filter((id) => s.players.some((p) => p.id === id)).map((id) => ({ id, points: g.stats[id].score, hits: g.stats[id].hits, shots: g.stats[id].shots })).sort((a, b) => b.points - a.points) : r.rows;
    return `<div class="card sg-results">
      ${over ? `<div class="drink win sg-win"><div class="big">🏆 ${g.winnerId === s.me && !PB.isTV ? 'You win!' : `${esc(name(g.winnerId))} wins!`}</div><div class="sips">${g.stats[g.winnerId]?.score ?? 0} points</div></div>` : `<h2>Round ${r.round} of ${g.rounds}</h2>`}
      <table><tr><th></th><th>${over ? 'Total' : 'Points'}</th><th>Hits</th><th>Accuracy</th></tr>
      ${rows.map((x, i) => `<tr class="${i === 0 ? 'top' : ''}"><td class="sg-who">${PB.avatar(x.id, 'sm')}<span>${esc(name(x.id))}</span></td><td><b>${x.points}</b></td><td>${x.hits}</td><td>${x.shots ? Math.round((x.hits / x.shots) * 100) : 0}%</td></tr>`).join('')}</table>
      ${!over && !PB.isTV ? (s.isHost ? '<button data-act="nextRound">Next round ▶</button>' : `<p class="muted center">Waiting for ${esc(name(s.hostId))} to start the next round…</p>`) : ''}
      ${!over && PB.isTV ? `<p class="muted center">${esc(name(s.hostId))} starts the next round</p>` : ''}
    </div>`;
  }

  // The phone held like a remote at a TV (or up like a camera, without one), for the calibration.
  function holdPicture(hold) {
    if (hold === 'remote') {
      // Side on: a hand holding the phone like a pistol, its top edge at the TV, the thumb on the
      // screen where the gun's hammer is.
      return `<svg class="sg-hold" viewBox="0 0 220 110" aria-hidden="true">
        <rect x="140" y="12" width="76" height="48" rx="4" fill="#1a1a22" stroke="#888" stroke-width="3"/><circle cx="178" cy="36" r="6" fill="var(--accent)"/><rect x="170" y="60" width="16" height="8" fill="#555"/>
        <g transform="translate(58 58) rotate(-12)"><rect x="-6" y="-14" width="62" height="28" rx="5" fill="#ddd" stroke="#333" stroke-width="2"/><rect x="-1" y="-10" width="52" height="20" rx="2" fill="#4a6aa8"/>
          <path d="M6 -2 h30 v4 h-30z M14 2 l-4 10 h6 l3 -10z" fill="#e3b23c"/>
          <path d="M-8 -10 C-30 -6 -34 22 -20 34 L-4 38 C2 26 4 14 0 12 Z" fill="#c68c60"/><path d="M-6 -8 C4 -16 14 -14 16 -8 L8 -2 Z" fill="#c68c60"/></g>
        <path d="M118 48 L170 36" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6 5"/><path d="M170 36 l-11 -3 l2 9z" fill="var(--accent)"/>
        <text x="4" y="106" font-size="11" fill="currentColor">Sideways like a pistol, top edge at the TV</text></svg>`;
    }
    return `<svg class="sg-hold" viewBox="0 0 220 110" aria-hidden="true">
      <g transform="translate(80 12)"><rect x="0" y="0" width="56" height="90" rx="8" fill="#ddd" stroke="#333" stroke-width="2"/><rect x="5" y="8" width="46" height="72" rx="3" fill="#2a4a2a"/><circle cx="28" cy="44" r="6" fill="none" stroke="var(--accent)" stroke-width="2.5"/></g>
      <text x="20" y="108" font-size="11" fill="currentColor">Hold it up in front of you, like a camera</text></svg>`;
  }

  function calibrateCard(s) {
    const tv = !!s.tv;
    const last = savedCal();
    if (!motion.live) {
      if (needsPermission() && !motion.granted) return `<div class="card sg-cal"><h2>🔫 Your phone is the gun</h2>${holdPicture(holdFor(s))}<p>It aims by how you turn it. Allow motion to start:</p><button class="sg-big" data-sg="motion">🎯 Enable motion aiming</button></div>`;
      return `<div class="card sg-cal"><h2>🔫 Aim by dragging</h2><p class="muted">No motion sensor here${motion.denied ? ' (not allowed)' : ''}: drag on the pad to move your crosshair, tap FIRE to shoot.</p>${cal.done ? '<p>✅ Ready</p>' : '<button class="sg-big" data-sg="ready">✅ Ready</button>'}</div>`;
    }
    const step = cal.step || 1;
    const where = step === 1 ? (tv ? 'the big dot in the middle of the gallery' : 'straight ahead, comfortably') : (tv ? 'the dot in the gallery’s top-right corner' : 'up and to the right, as far as is comfortable');
    return `<div class="card sg-cal">
      <div class="sg-steps"><span class="${step === 1 ? 'on' : 'done'}">1 Middle</span><span class="${step === 2 ? 'on' : ''}">2 Corner</span></div>
      ${holdPicture(holdFor(s))}
      <h2>${step === 1 ? 'Point at the dot on the TV' : 'Now the top-right corner'}</h2>
      <p>${tv ? 'Aim at the TV you’re facing. ' : ''}Point the top of your phone at <b>${where}</b>, then tap.</p>
      ${calNote ? `<p class="sg-note">${esc(calNote)}</p>` : ''}
      <button class="sg-big" data-sg="cal">${step === 1 ? '🎯 I’m aiming at the middle: tap' : '🎯 I’m aiming at the corner: tap'}</button>
      ${step === 2 && last ? '<button class="secondary" data-sg="last">Same seat as last time? Use last time’s size</button>' : ''}
    </div>`;
  }

  // The FIRE screen: your score, the clock, your gun, and the button.
  function fireScreen(s) {
    const g = s.game;
    const gun = gunOf(s, s.me);
    const mine = g.order.indexOf(s.me);
    const pts = s.phase === 'round' ? scores[mine] ?? g.stats[s.me]?.round ?? 0 : g.stats[s.me]?.round ?? 0;
    return `<div class="sg-phone ${s.tv ? 'has-tv' : 'no-tv'}">
      <div class="sg-top">
        <div class="sg-stat"><small>Points</small><b id="sg-my-score">${pts}</b></div>
        <div class="sg-stat"><small>${s.phase === 'countdown' ? 'Get ready' : 'Time'}</small><b id="sg-phone-time">${s.phase === 'countdown' ? g.count : g.length}</b></div>
        <button class="secondary sg-recal" data-sg="recal">🎯 Recalibrate</button>
      </div>
      ${s.tv ? '' : stage(s, { overlay: false })}
      ${s.tv && !motion.live ? '<div class="sg-pad" id="sg-pad"><p class="muted">No motion sensor: drag here to aim</p></div>' : ''}
      <span id="sg-hitnote" class="sg-hitnote"></span>
      <button class="sg-fire ${hand() === 'left' ? 'left' : ''}" id="sg-fire" style="--pc:${esc(PB.look(s.me).color)}">${gunSvg(gun)}<span class="sg-fire-word">TAP TO FIRE</span></button>
      <div class="sg-ammo" id="sg-ammo"></div>
      <div class="sg-foot">${PB.endButton()}<button class="secondary tr-small" data-sg="hand">${hand() === 'left' ? '🫲 Left-handed' : '🫱 Right-handed'}</button>${motion.live ? '' : '<button class="secondary tr-small" data-sg="reload">🔄 Reload</button>'}</div>
    </div>`;
  }

  function phoneScreen(s) {
    const g = s.game;
    if (s.phase === 'roundEnd' || s.phase === 'over') return `${results(s)}${s.phase === 'over' ? '' : gunPanel(s)}${PB.feed(3)}`;
    if (s.phase === 'calibrate' || cal.step) {
      const done = g.cal[s.me] && !cal.step;
      return `${done ? `<div class="card sg-cal"><h2>✅ Calibrated</h2><p>Your crosshair should follow your phone${s.tv ? ' on the TV' : ''}. Waiting for ${PB.plural(Object.values(s.players).filter((p) => p.connected && !g.cal[p.id]).length, 'more player')}…</p><button class="secondary" data-sg="recal">🎯 Recalibrate</button></div>` : calibrateCard(s)}
        ${s.isHost && s.phase === 'calibrate' ? '<button class="secondary" data-act="start" data-confirm="Start the first round now?">▶ Start now</button>' : ''}
        ${!s.tv ? stage(s, { overlay: false }) : ''}
        ${gunPanel(s, { open: false })}
        ${s.phase !== 'calibrate' ? '<button class="link" data-sg="cancelcal">Cancel</button>' : ''}`;
    }
    return fireScreen(s);
  }

  function tvScreen(s) {
    if (s.phase === 'roundEnd' || s.phase === 'over') return `${results(s)}${board(s)}`;
    return `${stage(s)}${board(s)}`;
  }

  let lastKey = '';
  function keyOf(s) {
    const g = s.game;
    return JSON.stringify([s.phase, s.tv, g.round, g.set, PB.isTV ? '' : [g.cal[s.me], cal.step, cal.done, motion.live, motion.granted, motion.denied, calNote],
      s.phase === 'countdown' && !PB.isTV ? g.count : '', s.phase === 'calibrate' && !PB.isTV ? g.cal : '',
      s.phase === 'roundEnd' || s.phase === 'over' ? [g.result, s.isHost] : '', g.guns, s.players.map((p) => [p.id, p.connected, p.avatar, p.color]), s.look]);
  }

  PB.register('shootingGallery', {
    reset() {
      targets.clear();
      clock.reset();
      clock.round = -1;
      lastKey = '';
      boardKey = '';
      gunSent = false;
      scores = [];
      aimNow.length = 0;
      aimShown.length = 0;
      if (cal.step) cal.step = 0;
    },
    get fullscreen() {
      const s = PB.state;
      return !PB.isTV && (s?.phase === 'round' || s?.phase === 'countdown') && !cal.step;
    },
    stage: '.sg-stage',
    tvTable: false,
    tvStage: '.sg-stage, .sg-scores, .sg-results',
    tvLeft: '.sg-scores',
    sounds(prev, s) {
      if (s.phase === 'round' && prev.phase === 'countdown') return ['go'];
      if (s.phase === 'countdown' && (prev.phase !== 'countdown' || s.game.count !== prev.game.count)) return ['beep'];
      if (s.phase === 'roundEnd' && prev.phase === 'round') return ['bell'];
      return [];
    },
    render(s) {
      listen();
      if (s.game.order) order = s.game.order;
      // (A reconnect mid-round: the targets out now.)
      for (const tg of s.game.live || []) addTarget(tg);
      if (s.phase === 'calibrate' && !PB.isTV && cal.done && !s.game.cal[s.me]) PB.act('calibrated');
      const key = keyOf(s);
      if (key === lastKey && document.querySelector('.sg-stage, .sg-phone, .sg-cal, .sg-results')) {
        const el = document.getElementById('sg-layer');
        if (el) el.innerHTML = layer(s);
        updateBoard(s);
        return null;
      }
      lastKey = key;
      boardKey = '';
      return PB.isTV ? tvScreen(s) : phoneScreen(s);
    },
    afterRender(s) {
      sendGun(s);
      attachViews();
      if (document.getElementById('sg-ammo')) { document.getElementById('sg-ammo').dataset.k = ''; showAmmo(s); }
      turnWithScreen();
      const fireBtn = document.getElementById('sg-fire');
      if (fireBtn) {
        fireBtn.onpointerdown = (e) => { e.preventDefault(); fire(); };
        fireBtn.onclick = (e) => e.preventDefault();
      }
      const pad = document.getElementById('sg-pad') || (!motion.live && document.querySelector('.sg-phone .sg-stage'));
      if (pad && !motion.live) dragAim(pad);
      document.querySelectorAll('[data-sg]').forEach((b) => {
        b.onclick = (e) => {
          e.preventDefault();
          const what = b.dataset.sg;
          if (what === 'motion') return askMotion();
          if (what === 'cal') return calTap();
          if (what === 'last') return useLast();
          if (what === 'recal') return recalibrate();
          if (what === 'ready') { cal.done = true; aim.ok = true; PB.act('calibrated'); lastKey = ''; return PB.rerender(); }
          if (what === 'cancelcal') { cal.step = 0; PB.act('calib', { step: 0 }); lastKey = ''; return PB.rerender(); }
          if (what === 'hand') { try { localStorage.setItem('sg-hand', hand() === 'left' ? 'right' : 'left'); } catch {} }
          if (what === 'reload') return startReload();
          if (what === 'sound') { try { localStorage.setItem('sg-sound', soundOn() ? 'off' : 'on'); } catch {} }
          if (what === 'look') setLook(b.dataset.k, b.dataset.v);
          // (Keep the panel open while you pick.)
          lastKey = '';
          PB.rerender();
          document.querySelector('.sg-armory')?.setAttribute('open', '');
        };
      });
    },
    onGallery,
    // The lobby, with this game picked: your gun, to set up before the game.
    lobby(s) { return gunPanel({ ...s, me: s.me, game: null }, { open: false }); },
    lobbyBind() {
      document.querySelectorAll('.sg-armory [data-sg]').forEach((b) => {
        b.onclick = (e) => {
          e.preventDefault();
          if (b.dataset.sg === 'sound') { try { localStorage.setItem('sg-sound', soundOn() ? 'off' : 'on'); } catch {} }
          if (b.dataset.sg === 'look') setLook(b.dataset.k, b.dataset.v);
          PB.rerender();
          document.querySelector('.sg-armory')?.setAttribute('open', '');
        };
      });
    },
    // (For tests and the preview.)
    GUNS,
    HOUSE,
    posAt,
    pointing,
  });

  // A new game: this phone's gun, as it was last time.
  let gunSent = false;
  function sendGun(s) {
    if (gunSent || PB.isTV || PB.passAndPlay || s.game.myGun) return;
    gunSent = true;
    const look = myLook();
    if (look) PB.act('gun', look);
  }
})();
