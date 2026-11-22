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
  // A painted backdrop for the venue, then the booth in front of it: the striped awning with its
  // bulbs and bunting, three rails the targets ride (each with a row of painted wooden waves in
  // front, drawn over its targets: see railFront), the shelf and the counter with its prizes, and
  // curtains either side. The colours come from the room's own (its CSS variables).
  const RAIL_Y = [0.33, 0.53, 0.73];
  const POND_Y = [0.72, 0.84];
  const SHELF = 0.9;
  function seeded(n) { let x = n; return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646; }
  function sky(c, stops, h = H) { const g = c.createLinearGradient(0, 0, 0, h); stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col)); c.fillStyle = g; c.fillRect(0, 0, W, h); }
  function hills(c, y, amp, freq, col, ph = 0) {
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.7 + ph * 2) * amp * 0.3);
    c.lineTo(W, H); c.closePath(); c.fillStyle = col; c.fill();
  }
  function cloud(c, x, y, s, col = 'rgba(255,255,255,0.92)') { for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.2, 0.75], [-0.9, 0.25, 0.7], [0.4, -0.45, 0.7], [-0.4, -0.35, 0.6]]) circ(c, x + dx * s, y + dy * s, r * s, col); }
  function stars(c, n, ymax, r) { for (let i = 0; i < n; i++) circ(c, r() * W, r() * ymax, r() * 2.2 + 0.5, `rgba(255,255,255,${0.35 + r() * 0.65})`); }
  function palm(c, x, y, h, col = '#1e3a22') {
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 30, y - h * 0.5, x + 10, y - h); c.lineWidth = 14; c.strokeStyle = '#5a3a22'; c.stroke();
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.55; c.beginPath(); c.moveTo(x + 10, y - h); c.quadraticCurveTo(x + 10 + Math.cos(a) * 70, y - h + Math.sin(a) * 40 - 20, x + 10 + Math.cos(a) * 130, y - h + Math.sin(a) * 40 + 40); c.lineWidth = 14; c.strokeStyle = col; c.stroke(); }
  }
  function pine(c, x, y, h, col) { for (let k = 0; k < 3; k++) poly(c, [x, y - h + k * h * 0.22, x - h * (0.22 + k * 0.08), y - h * (0.45 - k * 0.2), x + h * (0.22 + k * 0.08), y - h * (0.45 - k * 0.2)], col); rr(c, x - 5, y - h * 0.25, 10, h * 0.25, 2, '#3a2414'); }
  function bareTree(c, x, y, h, col) {
    const br = (x0, y0, a, len, w) => { if (len < 12) return; const x1 = x0 + Math.cos(a) * len; const y1 = y0 + Math.sin(a) * len; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); br(x1, y1, a - 0.45, len * 0.68, w * 0.65); br(x1, y1, a + 0.4, len * 0.62, w * 0.6); };
    br(x, y, -Math.PI / 2, h * 0.4, 16);
  }
  function deco(c, x, y, r, col) { for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x, y, r - k * r * 0.15, Math.PI, 0); c.lineWidth = 4; c.strokeStyle = col; c.stroke(); } }
  function sign(c, x, y, text, col, size = 54) {
    c.save(); c.font = `900 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = col; c.shadowBlur = 26; c.fillStyle = col; c.fillText(text, x, y); c.shadowBlur = 0; c.fillStyle = '#fff'; c.globalAlpha = 0.6; c.fillText(text, x, y); c.restore();
  }

  // The venue's painted backdrop (P: the room's colours).
  const BACKDROPS = {
    classic(c, P, r) {
      sky(c, ['#4aa8e8', '#9ad4f4', '#e8f6ff']);
      circ(c, 1320, 150, 70, '#fff2a0'); circ(c, 1320, 150, 100, 'rgba(255,240,160,0.3)');
      cloud(c, 260, 160, 50); cloud(c, 760, 110, 40); cloud(c, 1060, 220, 34);
      // A big wheel on the far hill.
      c.save(); c.translate(1150, 430); c.strokeStyle = '#d8402a'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 170, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 170, Math.sin(a) * 170); c.lineWidth = 2.5; c.stroke(); rr(c, Math.cos(a) * 170 - 14, Math.sin(a) * 170, 28, 22, 5, ['#ffd23f', '#2a8af0', '#ff6ab4'][i % 3]); }
      c.restore(); poly(c, [1150, 430, 1060, 720, 1240, 720], '#8a2a1a');
      hills(c, 610, 30, 0.004, '#6ac04a'); hills(c, 690, 24, 0.006, '#4aa03a', 2);
    },
    dive(c, P, r) {
      c.fillStyle = '#3a2218'; c.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 40) for (let x = ((y / 40) % 2) * 45; x < W; x += 90) rr(c, x + 3, y + 3, 84, 34, 3, ['#6a3424', '#7a3c28', '#5a2c1e'][Math.floor(r() * 3)]);
      sign(c, 360, 200, 'BAR', '#ff4a2e', 110); sign(c, 1180, 180, 'OPEN', '#3ae0ff', 80); sign(c, 800, 120, '★ LIVE DARTS ★', '#ffd23f', 40);
    },
    tavern(c, P, r) {
      c.fillStyle = '#4a2e1a'; c.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 120) rr(c, x, 0, 116, H, 0, x % 240 ? '#56361e' : '#4e3018');
      for (const x of [200, 560, 1040, 1400]) { c.save(); c.translate(x, 190); DRAW.shield(c, 46); c.restore(); }
      for (const x of [380, 1220]) { c.save(); c.translate(x, 210); DRAW.tankard(c, 34); c.restore(); }
      const g = c.createRadialGradient(800, H, 50, 800, H, 600); g.addColorStop(0, 'rgba(255,140,40,0.45)'); g.addColorStop(1, 'rgba(255,140,40,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    },
    club(c, P, r) {
      sky(c, ['#07060d', '#1a0e36']);
      for (let i = 0; i < 9; i++) { c.globalAlpha = 0.3; c.strokeStyle = i % 2 ? '#29f0ff' : '#ff2bd6'; c.lineWidth = 5; c.beginPath(); c.moveTo(800, -20); c.lineTo(i * 200, H); c.stroke(); }
      c.globalAlpha = 1; for (let i = 0; i < 300; i++) circ(c, r() * W, r() * H, 2, ['#ff2bd6', '#29f0ff', '#fff'][i % 3]);
      c.save(); c.translate(800, 130); DRAW.disco(c, 70); c.restore();
    },
    castle(c, P, r) {
      c.fillStyle = '#4a4656'; c.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 70) for (let x = ((y / 70) % 2) * 70; x < W; x += 140) rr(c, x + 3, y + 3, 134, 64, 6, ['#5a5668', '#524e60', '#625e70'][Math.floor(r() * 3)]);
      for (const x of [260, 800, 1340]) { poly(c, [x - 70, 70, x + 70, 70, x + 70, 420, x, 370, x - 70, 420], P.accent); poly(c, [x - 56, 90, x + 56, 90, x + 56, 390, x, 350, x - 56, 390], mix(P.danger, '#000000', 0.2)); c.save(); c.translate(x, 210); DRAW.crow(c, 0, '', 0); c.restore(); }
      for (const x of [530, 1070]) { rr(c, x - 8, 200, 16, 60, 3, '#3a2a1a'); circ(c, x, 186, 26, 'rgba(255,170,60,0.5)'); ell(c, x, 186, 10, 20, '#ffb040'); }
    },
    jazz(c, P, r) {
      for (let x = 0; x < W; x += 60) { const g = c.createLinearGradient(x, 0, x + 60, 0); g.addColorStop(0, '#5a0e1a'); g.addColorStop(0.5, '#a81e2e'); g.addColorStop(1, '#4a0a14'); c.fillStyle = g; c.fillRect(x, 0, 60, H); }
      const g = c.createRadialGradient(800, 120, 40, 800, 300, 700); g.addColorStop(0, 'rgba(255,230,170,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (const x of [200, 800, 1400]) deco(c, x, 260, 160, '#e3b04b');
    },
    diner(c, P, r) {
      sky(c, ['#f6efe2', '#f1e4cf']);
      c.fillStyle = '#1e1e22';
      for (let y = 500; y < H; y += 50) for (let x = ((y / 50) % 2) * 50; x < W; x += 100) c.fillRect(x, y, 50, 50);
      rr(c, 0, 470, W, 30, 0, '#e63946'); rr(c, 0, 500, W, 8, 0, '#c8ccd2');
      sign(c, 800, 200, 'EAT', '#e63946', 140); sign(c, 340, 250, 'PIE', '#2a9d8f', 70); sign(c, 1260, 250, 'SHAKES', '#ff6ab4', 60);
    },
    tiki(c, P, r) {
      sky(c, ['#2a1a4a', '#c84a5a', '#ff8a3d', '#ffd070'], 620); circ(c, 800, 590, 130, '#ffe080');
      c.fillStyle = '#1e5a6a'; c.fillRect(0, 600, W, H); for (let i = 0; i < 40; i++) ell(c, r() * W, 620 + r() * 260, 50, 4, 'rgba(255,220,160,0.35)');
      palm(c, 130, 900, 520); palm(c, 1470, 900, 480); palm(c, 1330, 900, 360, '#24442a');
    },
    speakeasy(c, P, r) {
      c.fillStyle = '#1e2a22'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(201,162,74,0.55)'; c.lineWidth = 2.5;
      for (let x = 0; x < W + 100; x += 100) for (let y = 0; y < H; y += 140) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 50, y + 70); c.lineTo(x, y + 140); c.lineTo(x - 50, y + 70); c.closePath(); c.stroke(); deco(c, x, y + 70, 24, 'rgba(201,162,74,0.4)'); }
    },
    casino(c, P, r) {
      c.fillStyle = '#5a0a12'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(245,197,66,0.16)'; for (let x = 0; x < W; x += 80) for (let y = 0; y < H; y += 80) poly(c, [x + 40, y, x + 80, y + 40, x + 40, y + 80, x, y + 40], 'rgba(245,197,66,0.12)');
      for (const x of [300, 800, 1300]) { const g = c.createRadialGradient(x, 0, 10, x, 200, 400); g.addColorStop(0, 'rgba(255,230,150,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - 400, 0, 800, 700); }
      for (let i = 0; i < 5; i++) { c.save(); c.translate(200 + i * 300, 200 + (i % 2) * 60); c.rotate(i); DRAW.chip(c, 40); c.restore(); }
    },
    saloon(c, P, r) {
      sky(c, ['#f8b860', '#ffd890', '#ffe8c0'], 640); circ(c, 1200, 300, 90, '#fff0b0');
      c.fillStyle = '#c86a3a'; for (const [x, w, h] of [[150, 300, 220], [700, 220, 150], [1100, 380, 260]]) { c.fillRect(x, 640 - h, w, h); poly(c, [x - 30, 640, x, 640 - h, x + w, 640 - h, x + w + 40, 640], '#b85a2a'); }
      c.fillStyle = '#e0a860'; c.fillRect(0, 630, W, H);
      for (const [x, h] of [[480, 220], [1460, 170]]) { rr(c, x - 16, 630 - h, 32, h, 14, '#4a7a3a'); rr(c, x - 60, 630 - h * 0.7, 18, h * 0.4, 9, '#4a7a3a'); rr(c, x - 60, 630 - h * 0.7 + h * 0.3, 60, 16, 8, '#4a7a3a'); rr(c, x + 40, 630 - h * 0.85, 18, h * 0.35, 9, '#4a7a3a'); rr(c, x, 630 - h * 0.85 + h * 0.27, 58, 16, 8, '#4a7a3a'); }
    },
    pirate(c, P, r) {
      sky(c, ['#1a2a4a', '#c85a4a', '#ffb060'], 560); circ(c, 400, 540, 90, '#ffd890');
      c.fillStyle = '#1a3a5a'; c.fillRect(0, 540, W, H); for (let i = 0; i < 50; i++) ell(c, r() * W, 560 + r() * 320, 60, 5, 'rgba(255,255,255,0.18)');
      // A ship on the horizon, sails up.
      c.save(); c.translate(1150, 540); c.fillStyle = '#1a120e';
      poly(c, [-150, 0, 150, 0, 120, 40, -120, 40], '#2a1a12'); for (const [x, h] of [[-70, 200], [30, 240], [110, 170]]) { c.fillRect(x - 3, -h, 6, h); poly(c, [x - 50, -h + 20, x + 50, -h + 20, x + 56, -h * 0.35, x - 56, -h * 0.35], '#e8dcc0'); }
      poly(c, [30, -240, 30, -275, 70, -258], '#111'); c.restore();
    },
    beerhall(c, P, r) {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
      for (let x = 0; x < W + 120; x += 120) for (let y = 0; y < H; y += 120) poly(c, [x, y - 60, x + 60, y, x, y + 60, x - 60, y], (x / 120 + y / 120) % 2 ? '#2a6fdb' : '#d8e6fa');
      c.globalAlpha = 0.85; sky(c, ['rgba(160,200,255,1)', 'rgba(230,240,255,1)'], 0); c.globalAlpha = 1;
      for (const x of [260, 800, 1340]) { c.save(); c.translate(x, 230); DRAW.pretzel(c, 60); c.restore(); }
    },
    space(c, P, r) {
      sky(c, ['#03020c', '#120a2e', '#1a0e40']); stars(c, 320, H, r);
      const n = c.createRadialGradient(400, 300, 20, 400, 300, 420); n.addColorStop(0, 'rgba(255,90,216,0.35)'); n.addColorStop(1, 'rgba(90,60,255,0)'); c.fillStyle = n; c.fillRect(0, 0, W, H);
      circ(c, 1250, 260, 120, '#c86a4a'); ell(c, 1250, 260, 210, 34, 'rgba(255,220,180,0.55)', -0.35); circ(c, 1210, 230, 30, 'rgba(0,0,0,0.15)');
      circ(c, 300, 620, 46, '#7cf0ff'); circ(c, 290, 610, 46, 'rgba(255,255,255,0.25)');
    },
    lighthouse(c, P, r) {
      sky(c, ['#0b1626', '#1b3050'], 560); stars(c, 120, 500, r); circ(c, 300, 160, 56, '#f4ecc8');
      c.fillStyle = '#10243a'; c.fillRect(0, 560, W, H); for (let i = 0; i < 40; i++) ell(c, r() * W, 580 + r() * 300, 50, 4, 'rgba(255,255,255,0.15)');
      poly(c, [1180, 560, 1280, 560, 1260, 260, 1200, 260], '#f4f0e8'); for (const y of [320, 420, 510]) poly(c, [1188 + (560 - y) * 0.05, y, 1272 - (560 - y) * 0.05, y, 1270, y + 30, 1190, y + 30], '#d8302f');
      rr(c, 1196, 220, 68, 40, 4, '#ffe080'); poly(c, [1230, 240, 0, 120, 0, 340], 'rgba(255,240,160,0.18)');
      hills(c, 560, 10, 0.01, '#1a1a22');
    },
    vineyard(c, P, r) {
      sky(c, ['#8ac4f0', '#f0e0b0']); circ(c, 1300, 180, 70, '#fff4c0');
      hills(c, 430, 40, 0.004, '#8aa050'); hills(c, 520, 36, 0.005, '#6a8a3a', 1);
      for (let y = 560; y < H; y += 34) { c.strokeStyle = '#3a5a22'; c.lineWidth = 10; c.setLineDash([16, 10]); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y - 40); c.stroke(); } c.setLineDash([]);
      for (const x of [220, 300, 1400]) ell(c, x, 470, 18, 90, '#2a4a22');
    },
    frat(c, P, r) {
      c.fillStyle = '#5a2a1a'; c.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 40) for (let x = ((y / 40) % 2) * 45; x < W; x += 90) rr(c, x + 3, y + 3, 84, 34, 3, ['#7a3a24', '#6a3220', '#843e26'][Math.floor(r() * 3)]);
      for (const [x, col] of [[220, '#d62828'], [560, '#2a6fdb'], [1040, '#2b9a5a'], [1380, '#ffd23f']]) { poly(c, [x - 90, 150, x + 90, 190, x - 90, 230], col); c.fillStyle = '#fff'; c.font = '900 34px system-ui'; c.fillText('ΒΩΩΛ', x - 80, 200); }
      for (let x = 0; x < W; x += 50) circ(c, x + 25, 300 + Math.sin(x / 120) * 20, 8, ['#ffd23f', '#ff6ab4', '#7dff9e'][(x / 50) % 3]);
    },
    garage(c, P, r) {
      c.fillStyle = '#c8b088'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 20; x < W; x += 40) for (let y = 20; y < H; y += 40) c.fillRect(x, y, 5, 5);
      c.fillStyle = '#3a3f47'; for (const [x, y] of [[200, 200], [480, 170], [1100, 190], [1380, 220]]) { rr(c, x - 10, y, 20, 150, 4, '#3a3f47'); circ(c, x, y, 34, '#3a3f47'); circ(c, x, y, 16, '#c8b088'); }
      for (const x of [760, 840]) { rr(c, x - 30, 150, 60, 200, 6, '#d8302f'); }
    },
    chateau(c, P, r) {
      sky(c, ['#a8d0f0', '#f0f4e8']); cloud(c, 300, 150, 40); cloud(c, 1200, 120, 46);
      c.fillStyle = '#e8e0cc'; c.fillRect(500, 260, 600, 260); for (const x of [470, 1100]) { c.fillRect(x, 220, 60, 300); poly(c, [x - 10, 220, x + 30, 140, x + 70, 220], '#4a5a7a'); }
      poly(c, [500, 260, 800, 180, 1100, 260], '#4a5a7a'); for (let x = 540; x < 1080; x += 60) rr(c, x, 300, 30, 50, 12, '#6a8aaa');
      hills(c, 520, 6, 0.01, '#5f8a36'); for (let x = 0; x < W; x += 120) ell(c, x + 60, 560, 50, 30, '#3a6a2a');
    },
    christmas(c, P, r) {
      sky(c, ['#0a1a3a', '#2a4a7a']); stars(c, 100, 500, r); circ(c, 1300, 160, 60, '#f4f0e0');
      hills(c, 560, 40, 0.004, '#e8f0ff'); hills(c, 660, 30, 0.006, '#d8e4f8', 2);
      for (const [x, h] of [[160, 300], [300, 220], [1250, 260], [1420, 320]]) pine(c, x, 680, h, '#1a4a2a');
      for (let i = 0; i < 180; i++) circ(c, r() * W, r() * H, r() * 3 + 1, 'rgba(255,255,255,0.8)');
    },
    halloween(c, P, r) {
      sky(c, ['#0d0812', '#2a1a35', '#4a2a5a']); stars(c, 80, 400, r); circ(c, 1250, 190, 110, '#f8e8b0'); circ(c, 1290, 160, 18, '#e8d8a0');
      hills(c, 600, 30, 0.004, '#1a1020');
      bareTree(c, 220, 640, 420, '#120a14'); bareTree(c, 1450, 640, 360, '#120a14');
      for (const x of [500, 640, 900, 1060]) { rr(c, x - 22, 560, 44, 70, 20, '#3a3444'); }
      for (let i = 0; i < 6; i++) { c.save(); c.translate(600 + i * 110, 140 + (i % 3) * 40); DRAW.bat(c, 18, '', i); c.restore(); }
    },
    stpatricks(c, P, r) {
      sky(c, ['#8ab4d8', '#d8e8f0']); cloud(c, 400, 160, 50, 'rgba(240,244,250,0.95)'); cloud(c, 1100, 120, 40, 'rgba(240,244,250,0.95)');
      hills(c, 420, 50, 0.003, '#5a8a4a'); hills(c, 520, 40, 0.005, '#4a7a3a', 1); hills(c, 620, 30, 0.007, '#3a6a2e', 3);
      c.strokeStyle = '#8a8a80'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, 600); c.quadraticCurveTo(800, 540, W, 620); c.stroke();
      for (const [x, y] of [[300, 640], [380, 660], [1200, 600]]) { ell(c, x, y, 26, 18, '#f4f0e8'); circ(c, x + 24, y - 6, 9, '#2a2a2a'); }
    },
  };
  // Prizes hanging from the awning at the sides: drawn in colour (animals and toys).
  const PRIZES = ['🧸', '🦒', '🐙', '🦄', '🐻', '🐸'];

  function drawBooth(c, set) {
    c.save();
    c.scale(c.canvas.width / W, c.canvas.height / H);
    if (set === 'duckPond') { drawPond(c); c.restore(); return; }
    const P = { bg: cssVar('bg', '#1c1a26'), card: cssVar('card', '#2a2833'), card2: cssVar('card-2', '#3a3644'), accent: cssVar('accent', '#e8a83c'), danger: cssVar('danger', '#c8303f') };
    const r = seeded(11);
    (BACKDROPS[set] || BACKDROPS.classic)(c, P, r);
    // The rails: a dark slot, the chain and a brass rod.
    for (const y of RAIL_Y) {
      const Y = y * H;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, Y - 2, W, 26);
      c.fillStyle = '#2a2a2e'; for (let x = 0; x < W; x += 22) c.fillRect(x, Y + 8, 14, 6);
      const g = c.createLinearGradient(0, Y - 6, 0, Y + 6); g.addColorStop(0, '#fff2c0'); g.addColorStop(0.5, mix(P.accent, '#c9a24a', 0.5)); g.addColorStop(1, '#6a4a1a');
      c.fillStyle = g; c.fillRect(0, Y - 6, W, 11);
    }
    // The shelf and the counter, with a painted sign along it.
    const wood = '#8a5a2e';
    c.fillStyle = '#4a2e14'; c.fillRect(0, SHELF * H - 10, W, 12);
    const cg = c.createLinearGradient(0, SHELF * H, 0, H); cg.addColorStop(0, mix(wood, '#ffffff', 0.15)); cg.addColorStop(1, mix(wood, '#000000', 0.35));
    c.fillStyle = cg; c.fillRect(0, SHELF * H, W, H);
    for (let x = 0; x < W; x += 150) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, SHELF * H, 3, H); }
    rr(c, 560, SHELF * H + 14, 480, 62, 10, P.danger); rr(c, 566, SHELF * H + 20, 468, 50, 8, mix(P.danger, '#000000', 0.25));
    c.fillStyle = '#fff4d0'; c.font = '900 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★ SHOOTING GALLERY ★', 800, SHELF * H + 46);
    for (let x = 60; x < W; x += 110) if (x < 540 || x > 1060) circ(c, x, SHELF * H + 46, 9, x % 220 < 110 ? '#ffe080' : '#ffffff');
    // The awning: stripes, a scalloped edge with a bulb on each scallop, and bunting below it.
    const sw = 100;
    for (let x = 0; x < W; x += sw) {
      c.fillStyle = (x / sw) % 2 ? '#fff6e8' : P.danger;
      c.fillRect(x, 0, sw, 60);
      c.beginPath(); c.arc(x + sw / 2, 60, sw / 2, 0, Math.PI); c.fill();
      circ(c, x + sw / 2, 112, 11, 'rgba(255,230,140,0.35)'); circ(c, x + sw / 2, 112, 6, '#fff2b0');
    }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, W, 8);
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(70, 130); for (let x = 70; x <= W - 70; x += 20) c.lineTo(x, 130 + Math.sin(((x - 70) / (W - 140)) * Math.PI) * 26); c.stroke();
    for (let i = 0; i < 26; i++) { const x = 90 + i * 55; const y = 130 + Math.sin(((x - 70) / (W - 140)) * Math.PI) * 26; poly(c, [x - 15, y, x + 15, y, x, y + 30], [P.accent, '#2a8af0', '#ffffff', '#2ab84a', P.danger][i % 5]); }
    // Posts and curtains either side, with a column of bulbs, and prizes hanging.
    for (const side of [0, 1]) {
      const x = side ? W - 80 : 0;
      const g = c.createLinearGradient(x, 0, x + 80, 0); const cc = mix(P.danger, '#000000', 0.3);
      g.addColorStop(side ? 1 : 0, cc); g.addColorStop(side ? 0 : 1, mix(cc, '#000000', 0.55));
      c.fillStyle = g; c.fillRect(x, 0, 80, H);
      for (let k = 0; k < 4; k++) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 12 + k * 18, 0, 6, H); }
      for (let y = 160; y < SHELF * H; y += 70) { circ(c, x + 40, y, 12, 'rgba(255,230,140,0.35)'); circ(c, x + 40, y, 7, '#fff2b0'); }
    }
    c.font = '64px system-ui, sans-serif';
    PRIZES.forEach((p, i) => { const x = i < 3 ? 120 + i * 70 : W - 120 - (i - 3) * 70; c.strokeStyle = '#3a2a1a'; c.beginPath(); c.moveTo(x, 60); c.lineTo(x, 150); c.stroke(); c.fillText(p, x, 190); });
    c.restore();
  }

  // In front of each rail: a row of painted wooden waves (over the targets riding it, which stand
  // behind them on sticks). On the pond, ripples. One canvas per rail, made with the booth.
  function railFront(set, lane, scale) {
    const pond = set === 'duckPond';
    const y = (pond ? POND_Y : RAIL_Y)[lane];
    if (y == null) return null;
    const h = 60;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * scale);
    cv.height = Math.round(h * scale);
    const c = cv.getContext('2d');
    c.scale(scale, scale);
    if (pond) {
      c.fillStyle = 'rgba(70,90,130,0.55)';
      c.fillRect(0, 26, W, 34);
      for (let x = 0; x < W; x += 40) ell(c, x + 20, 28, 26, 4, 'rgba(255,240,210,0.4)');
    } else {
      const acc = cssVar('accent', '#e8a83c');
      const cols = [mix('#2a8af0', '#1a3a6a', lane * 0.25), mix('#4ab0ff', '#2a5a9a', lane * 0.25)];
      for (let k = 0; k < 2; k++) {
        c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= W; x += 8) c.lineTo(x, 18 + k * 12 + Math.sin((x + k * 60 + lane * 90) / 46) * 10);
        c.lineTo(W, h); c.closePath(); c.fillStyle = cols[k]; c.fill(); c.lineWidth = 2.5; c.strokeStyle = k ? '#ffffff' : acc; c.stroke();
      }
    }
    return { cv, y: (y * H) - 22, h, z: 2 + lane * 0.1 };
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
    corkRifle: { mag: 5, name: 'Carnival Cork Rifle', finish: '#8a5a2e', accent: '#c8ccd2', snd: { n: 1800, len: 0.06, tone: 520, to: 260, ng: 0.5, tg: 0.18 } },
    tapPistol: { mag: 6, name: 'Tap-Handle Pistol', finish: '#3a3f47', accent: '#ff5a36', snd: { n: 1200, len: 0.08, tone: 220, to: 110, ng: 0.55, tg: 0.2 } },
    musket: { mag: 1, name: 'Old Musket', finish: '#6a4428', accent: '#c9a24a', snd: { n: 700, len: 0.16, tone: 140, to: 70, ng: 0.6, tg: 0.2 } },
    neonLaser: { mag: 10, name: 'Neon Laser', finish: '#1e1e22', accent: '#ff2bd6', snd: { n: 0, len: 0.14, tone: 1400, to: 300, ng: 0, tg: 0.16, type: 'square' } },
    crossbow: { mag: 1, name: 'Crossbow', finish: '#6a4428', accent: '#c8ccd2', snd: { n: 3000, len: 0.05, tone: 180, to: 160, ng: 0.3, tg: 0.22, type: 'triangle' } },
    trumpetBuss: { mag: 1, name: 'Trumpet-Bell Blunderbuss', finish: '#e3b23c', accent: '#8a1a2a', snd: { n: 600, len: 0.12, tone: 330, to: 300, ng: 0.4, tg: 0.18, type: 'sawtooth' } },
    ketchup: { mag: 12, name: 'Ketchup Squirter', finish: '#c8302f', accent: '#f4f4f4', snd: { n: 900, len: 0.12, tone: 300, to: 600, ng: 0.35, tg: 0.1 } },
    blowpipe: { mag: 1, name: 'Blowpipe', finish: '#a8703a', accent: '#2a8a4a', snd: { n: 2600, len: 0.1, tone: 0, ng: 0.35, tg: 0 } },
    drumRepeater: { mag: 16, name: 'Drum Repeater', finish: '#1e1e22', accent: '#8a5a2e', snd: { n: 1400, len: 0.05, tone: 180, to: 90, ng: 0.55, tg: 0.18 } },
    derringer: { mag: 2, name: 'Gold Derringer', finish: '#e3b23c', accent: '#f4f4f4', snd: { n: 2200, len: 0.05, tone: 600, to: 300, ng: 0.4, tg: 0.14 } },
    sixShooter: { mag: 6, name: 'Six-Shooter', finish: '#c8ccd2', accent: '#8a5a2e', snd: { n: 1100, len: 0.1, tone: 160, to: 80, ng: 0.6, tg: 0.22 } },
    flintlock: { mag: 1, name: 'Flintlock', finish: '#6a4428', accent: '#c9a24a', snd: { n: 800, len: 0.15, tone: 120, to: 60, ng: 0.6, tg: 0.2, click: true } },
    corkPopper: { mag: 4, name: 'Cork Popper', finish: '#2a6fdb', accent: '#f4f4f4', snd: { n: 2000, len: 0.05, tone: 700, to: 400, ng: 0.3, tg: 0.2, type: 'sine' } },
    rayGun: { mag: 8, name: 'Ray Gun', finish: '#c8ccd2', accent: '#7cf0ff', snd: { n: 0, len: 0.22, tone: 1800, to: 200, ng: 0, tg: 0.14, type: 'sine', wob: 30 } },
    flarePistol: { mag: 1, name: 'Flare Pistol', finish: '#ff8a1f', accent: '#1e1e22', snd: { n: 900, len: 0.2, tone: 260, to: 520, ng: 0.4, tg: 0.1 } },
    slingshot: { mag: 1, name: 'Vine Slingshot', finish: '#8a5a2e', accent: '#c0392b', snd: { n: 3500, len: 0.06, tone: 400, to: 900, ng: 0.25, tg: 0.12, type: 'triangle' } },
    foamBlaster: { mag: 8, name: 'Foam Dart Blaster', finish: '#ff8a1f', accent: '#2a8af0', snd: { n: 1500, len: 0.08, tone: 500, to: 380, ng: 0.35, tg: 0.12, type: 'triangle' } },
    nailGun: { mag: 20, name: 'Nail Gun', finish: '#ffd23f', accent: '#1e1e22', snd: { n: 2500, len: 0.04, tone: 300, to: 200, ng: 0.5, tg: 0.15, type: 'square' } },
    duelPistol: { mag: 1, name: 'Duelling Pistol', finish: '#3a3f47', accent: '#e6c06a', snd: { n: 900, len: 0.12, tone: 150, to: 75, ng: 0.55, tg: 0.2 } },
    candyPopgun: { mag: 5, name: 'Candy-Cane Popgun', finish: '#f4f4f4', accent: '#c8302f', snd: { n: 2200, len: 0.05, tone: 900, to: 500, ng: 0.3, tg: 0.18, type: 'sine', bell: true } },
    pumpkinBlaster: { mag: 3, name: 'Pumpkin Blaster', finish: '#ff7a1a', accent: '#2a1a35', snd: { n: 500, len: 0.18, tone: 90, to: 45, ng: 0.5, tg: 0.22, type: 'triangle' } },
    stalkingRifle: { mag: 4, name: 'Stalking Rifle', finish: '#5a3e26', accent: '#3a3f47', snd: { n: 1000, len: 0.13, tone: 130, to: 65, ng: 0.6, tg: 0.2 } },
    sideBySide: { mag: 2, name: 'Side-by-Side Shotgun', finish: '#5a3e26', accent: '#9aa0a6', snd: { n: 650, len: 0.2, tone: 100, to: 50, ng: 0.65, tg: 0.22 } },
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

  // ---------- The guns, side on ----------
  // Drawn into a 240 × 96 box, muzzle to the right, from a kit of parts (barrels, a hammer, the
  // trigger guard, a checkered or grained grip...), shaded with gradients of the finish (f) and
  // accent (a) colours and inked like the rest of the art. Each drawing also says where its muzzle
  // is (the flash), where the thumb goes (the hammer: the FIRE screen marks it) and shows its
  // rounds on the gun (class sg-rounds: the FIRE screen greys out the spent ones).
  const INK = '#16110d';
  const dk = (c, k = 0.35) => mix(c, '#000000', k);
  const lt = (c, k = 0.3) => mix(c, '#ffffff', k);
  function kit(u, f, a) {
    const st = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"`;
    const grad = (id, c) => `<linearGradient id="${u}${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lt(c, 0.5)}"/><stop offset="0.38" stop-color="${c}"/><stop offset="1" stop-color="${dk(c, 0.5)}"/></linearGradient>`;
    const F = (c = 'f') => (c.startsWith('#') ? c : `url(#${u}${c})`);
    const K = {
      defs: `<defs>${grad('f', f)}${grad('a', a)}${grad('s', '#a8aeb8')}${grad('b', '#d8a84a')}${grad('w', '#7a4a26')}${grad('d', '#2a2a30')}
        <pattern id="${u}k" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H3.2M0 0V3.2" stroke="rgba(0,0,0,0.4)" stroke-width="0.7"/></pattern>
        <pattern id="${u}g" width="46" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.5 Q11 0.6 23 2.5 T46 2.5" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="0.7"/></pattern>
        <pattern id="${u}e" width="10" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 q2.5 -4 5 0 t5 0" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/></pattern>
        <radialGradient id="${u}x"><stop offset="0" stop-color="#fff"/><stop offset="0.3" stop-color="#ffe680"/><stop offset="0.65" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient></defs>`,
      st,
      F,
      shape: (d, c = 'f') => `<path d="${d}" fill="${F(c)}" ${st}/>`,
      // A shape with a texture over it: g grain, k checkering, e engraving.
      tex: (d, c = 'f', t = 'g') => `<path d="${d}" fill="${F(c)}" ${st}/><path d="${d}" fill="url(#${u}${t})"/>`,
      shine: (d, w = 2) => `<path d="${d}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="${w}" stroke-linecap="round"/>`,
      line: (d, w = 1.2, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`,
      barrel: (x0, x1, y, h, c = 'f') => `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" rx="${Math.min(3, h / 3)}" fill="${F(c)}" ${st}/><path d="M${x0 + 3} ${y + h * 0.28}H${x1 - 4}" stroke="rgba(255,255,255,0.5)" stroke-width="${Math.max(1, h * 0.13)}" stroke-linecap="round"/><rect x="${x1 - 5}" y="${y - 1.2}" width="6" height="${h + 2.4}" rx="1.5" fill="${F(c)}" ${st}/>`,
      band: (x, y, h, w = 4, c = 'b') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${F(c)}" ${st}/>`,
      screw: (x, y, r = 2.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${lt(f, 0.55)}" stroke="${INK}" stroke-width="1"/><path d="M${x - r * 0.7} ${y - r * 0.3}L${x + r * 0.7} ${y + r * 0.3}" stroke="${INK}" stroke-width="0.8"/>`,
      sight: (x, y, h = 5, c = 'f') => `<path d="M${x} ${y} l1.5 -${h} h3.5 l1 ${h}z" fill="${F(c)}" ${st}/>`,
      hammer: (x, y, c = 'f') => `<path d="M${x} ${y} l-3 -9 q-5 -6 -12 -2 q6 1 7 5 l2 7z" fill="${F(c)}" ${st}/>`,
      guard: (x, y, r = 11, c = 'f') => `<path d="M${x - r} ${y} q0 ${r * 1.25} ${r} ${r * 1.25} q${r} 0 ${r * 1.1} -${r * 1.25}" fill="none" stroke="${INK}" stroke-width="6.2"/><path d="M${x - r} ${y} q0 ${r * 1.25} ${r} ${r * 1.25} q${r} 0 ${r * 1.1} -${r * 1.25}" fill="none" stroke="${F(c)}" stroke-width="3.4"/><path d="M${x + 2} ${y} q-1 ${r * 0.7} -6 ${r * 0.9}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`,
      flash: (x, y) => `<g class="sg-muzzle" transform="translate(${x} ${y})"><ellipse cx="14" rx="30" ry="17" fill="url(#${u}x)"/><path d="M2 0 L44 -8 L30 0 L44 8Z M2 0 L22 -20 L16 -3Z M2 0 L22 20 L16 3Z" fill="#fff3b0"/></g>`,
      // The rounds: shells (or dots, or anything) in a row; the FIRE screen greys the spent ones.
      rounds: (x, y, n, { dx = 6.5, dy = 0, kind = 'shell', w = 4.4, h = 10, rot = 0 } = {}) => `<g class="sg-rounds">${Array.from({ length: n }, (_, i) => {
        const X = +(x + i * dx).toFixed(1);
        const Y = +(y + i * dy).toFixed(1);
        if (kind === 'dot') return `<circle cx="${X}" cy="${Y}" r="${w / 2}" fill="url(#${u}b)" stroke="${INK}" stroke-width="0.9"/>`;
        if (kind === 'cell') return `<rect x="${X - w / 2}" y="${Y - h / 2}" width="${w}" height="${h}" rx="1.5" fill="${a}" stroke="${INK}" stroke-width="0.9"/>`;
        return `<g transform="translate(${X} ${Y}) rotate(${rot})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="url(#${u}b)" stroke="${INK}" stroke-width="0.8"/><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h * 0.36}" rx="${w / 2}" fill="#c8602a"/></g>`;
      }).join('')}</g>`,
      group: (inner) => `<g class="sg-rounds">${inner}</g>`,
    };
    return K;
  }
  // Each: (K, f, a, n rounds) -> { body, m: [muzzle x, y], t: [thumb x, y] }.
  const GUN_ART = {
    corkRifle: (K, f, a, n) => ({ m: [232, 37], t: [96, 26], body: `
      ${K.tex('M8 46 L64 32 L104 32 L104 50 L74 52 Q44 62 14 76 Q4 66 8 46Z', 'f')}${K.shine('M14 50 L62 37', 1.5)}
      ${K.barrel(98, 232, 32, 10, 'a')}${K.barrel(104, 200, 44, 7, 'a')}
      ${K.shape('M92 30 H122 V52 H92Z', 'a')}${K.screw(100, 41)}${K.screw(114, 41)}
      ${K.sight(224, 32)}${K.sight(150, 32, 4)}${K.guard(102, 54)}${K.band(196, 42, 10)}
      ${K.rounds(132, 47.5, n, { dx: 12, kind: 'dot', w: 6.4 })}` }),
    tapPistol: (K, f, a, n) => ({ m: [214, 34], t: [96, 14], body: `
      ${K.tex('M84 44 L118 46 Q110 68 108 90 L72 90 Q72 66 84 44Z', 'a', 'k')}
      ${K.shape('M70 22 H206 Q210 22 210 26 V42 H70Z', 'f')}${K.shine('M74 26 H204')}
      ${Array.from({ length: 7 }, (_, i) => K.line(`M${78 + i * 4} 27 V38`, 1.2)).join('')}
      ${K.barrel(204, 216, 28, 10, 'd')}${K.sight(196, 22)}
      ${K.shape('M90 4 Q90 0 96 0 H104 Q110 0 110 4 V22 H90Z', 'a')}${K.shape('M93 4 H107 V12 H93Z', '#f4ecd8')}${K.line('M96 8 H104', 1.6, dk(a))}
      ${K.guard(126, 44)}${K.screw(94, 66)}
      ${K.rounds(140, 33, n, { dx: 8.5 })}` }),
    musket: (K, f, a, n) => ({ m: [236, 36], t: [90, 22], body: `
      ${K.tex('M4 50 L60 34 L100 32 L100 48 L64 52 Q36 66 10 80 Q0 70 4 50Z', 'f')}${K.shine('M12 54 L60 39', 1.4)}
      ${K.barrel(90, 236, 31, 9, 's')}${K.line('M100 46 H226', 2.2, dk(f))}
      ${K.shape('M76 32 Q80 26 104 28 L108 42 Q90 46 78 42Z', 's')}${K.screw(90, 37)}
      ${K.shape('M84 28 L80 16 Q86 10 92 14 L90 28Z', 's')}${K.shape('M80 14 l8 -4 l2 4 l-8 4z', '#4a4a50')}
      ${[130, 172, 214].map((x) => K.band(x, 29, 13)).join('')}${K.guard(100, 48, 10, 'b')}${K.sight(228, 31, 4)}
      ${K.rounds(116, 24, n, { kind: 'dot', w: 7 })}` }),
    neonLaser: (K, f, a, n) => ({ m: [226, 34], t: [96, 16], body: `
      ${K.shape('M70 20 L196 20 L214 28 L214 40 L196 46 L112 46 L102 54 L106 88 L78 90 L80 50 L66 46 Z', 'f')}
      <path d="M78 28 H198 M84 40 H190" stroke="${a}" stroke-width="3.2" stroke-linecap="round" opacity="0.95"/><path d="M78 28 H198" stroke="${a}" stroke-width="9" opacity="0.25" stroke-linecap="round"/>
      ${K.shape('M214 28 H228 Q232 34 228 40 H214Z', 'a')}<circle cx="230" cy="34" r="8" fill="${a}" opacity="0.3"/>
      ${K.shape('M150 12 H184 V20 H150Z', 'd')}${K.line('M86 60 V82', 2.5, a)}${K.guard(122, 50, 9)}
      ${K.rounds(120, 34, n, { kind: 'cell', dx: 7, w: 4, h: 6 })}` }),
    crossbow: (K, f, a, n) => ({ m: [234, 34], t: [96, 26], body: `
      ${K.tex('M4 46 L60 34 L210 34 L210 42 L120 42 L96 46 Q50 58 12 76 Q0 64 4 46Z', 'f')}${K.shine('M64 37 H206', 1.4)}
      <path d="M190 2 Q170 38 190 94" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M190 2 Q170 38 190 94" fill="none" stroke="${K.F('a')}" stroke-width="6" stroke-linecap="round"/>
      ${K.line('M190 4 L120 37 L190 92', 1.4, '#e8e0d0')}${K.shape('M176 30 H192 V44 H176Z', 's')}
      ${K.group(`<path d="M122 32 H226" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M122 32 H226" stroke="#c8b088" stroke-width="2"/><path d="M224 28 L236 32 L224 36Z" fill="#b8bcc4" stroke="${INK}"/><path d="M122 32 l-8 -6 h10z M122 32 l-8 6 h10z" fill="${a}" stroke="${INK}" stroke-width="0.8"/>`)}
      ${K.shape('M96 44 L104 44 L100 64 L94 64Z', 's')}${K.screw(84, 40)}` }),
    trumpetBuss: (K, f, a, n) => ({ m: [234, 36], t: [86, 24], body: `
      ${K.tex('M6 52 L58 36 L94 34 L94 50 L66 54 Q38 68 12 82 Q2 72 6 52Z', 'a')}
      ${K.barrel(86, 186, 30, 12, 'f')}${K.shape('M184 30 Q206 26 232 6 Q240 36 232 66 Q206 46 184 42Z', 'f')}
      <ellipse cx="233" cy="36" rx="5" ry="29" fill="${dk(f, 0.6)}" stroke="${INK}" stroke-width="1.6"/>${K.shine('M190 32 Q210 24 228 12', 2)}
      ${[112, 130, 148].map((x) => `${K.shape(`M${x} 30 V16 H${x + 9} V30Z`, 'f')}${K.shape(`M${x - 1.5} 16 H${x + 10.5} V11 H${x - 1.5}Z`, 'a')}`).join('')}
      ${K.hammer(88, 30)}${K.guard(96, 50, 9, 'f')}
      ${K.rounds(166, 36, n, { kind: 'dot', w: 7 })}` }),
    ketchup: (K, f, a, n) => ({ m: [234, 36], t: [100, 18], body: `
      ${K.shape('M70 14 Q70 8 80 8 H150 Q166 8 166 22 V54 Q166 64 150 64 H80 Q70 64 70 54Z', 'f')}${K.shine('M80 14 H150', 3)}
      ${K.shape('M166 24 L208 30 L208 42 L166 48Z', 'a')}${K.shape('M206 32 H230 Q234 36 230 40 H206Z', 'a')}
      ${K.shape('M90 20 H146 V50 H90Z', '#f4ecd8')}<text x="118" y="40" font-size="13" text-anchor="middle" fill="${f}" font-family="sans-serif" font-weight="900">FIRE</text>
      ${K.shape('M84 64 L112 64 Q106 76 104 92 L80 92 Q78 76 84 64Z', 'a')}${K.guard(124, 62, 9, 'a')}
      ${K.rounds(96, 26, n, { kind: 'dot', dx: 4.6, w: 3.6 })}` }),
    blowpipe: (K, f, a, n) => ({ m: [236, 38], t: [70, 30], body: `
      ${K.barrel(6, 236, 32, 12, 'f')}${[28, 70, 112, 154, 196].map((x) => K.band(x, 30, 16, 5, 'a')).join('')}
      ${K.shape('M2 30 Q-2 38 2 46 H10 V30Z', 'a')}
      ${[0, 1, 2].map((i) => `<path d="M${90 + i * 6} 44 q${2 - i * 2} 18 ${-4 + i * 4} 34" fill="none" stroke="${['#e83a2a', '#ffd23f', '#2a6ae8'][i]}" stroke-width="3" stroke-linecap="round"/>`).join('')}
      ${K.group(`<path d="M132 22 H196" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M132 22 H196" stroke="#e8d8b0" stroke-width="1.4"/><path d="M130 22 l-10 -6 l2 6 l-2 6z" fill="${a}" stroke="${INK}" stroke-width="0.8"/>`)}` }),
    drumRepeater: (K, f, a, n) => ({ m: [234, 34], t: [96, 18], body: `
      ${K.tex('M4 46 L58 34 L92 32 L92 46 L66 50 Q36 62 10 76 Q0 66 4 46Z', 'a')}
      ${K.shape('M86 24 H170 V46 H86Z', 'f')}${K.barrel(168, 234, 29, 10, 'f')}
      ${K.shape('M176 22 H212 V48 H176Z', 'd')}${Array.from({ length: 6 }, (_, i) => K.line(`M${180 + i * 5.5} 24 V46`, 1.6, '#55555c')).join('')}
      <circle cx="128" cy="62" r="24" fill="${K.F('f')}" ${K.st}/><circle cx="128" cy="62" r="7" fill="${lt(f, 0.4)}" ${K.st}/>
      ${K.tex('M186 48 L204 48 Q208 64 200 80 L186 80 Q190 64 186 48Z', 'a', 'k')}${K.hammer(90, 26)}${K.guard(104, 46, 8)}
      ${K.group(Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return `<circle cx="${(128 + Math.cos(t) * 15).toFixed(1)}" cy="${(62 + Math.sin(t) * 15).toFixed(1)}" r="2.6" fill="url(#U b)" stroke="${INK}" stroke-width="0.8"/>`; }).join('').replace(/#U b/g, '#Ub'))}` }),
    derringer: (K, f, a, n) => ({ m: [214, 40], t: [98, 22], body: `
      ${K.tex('M76 46 Q70 56 60 74 Q52 92 70 92 Q86 90 92 74 L112 50Z', 'a', 'k')}
      ${K.shape('M80 24 H206 Q212 24 212 30 V52 Q212 58 206 58 H96 L82 50Z', 'f')}<path d="M84 28 H204 V54 H96Z" fill="url(#${'U'}e)"/>
      ${K.line('M100 41 H210', 1.4)}${K.shine('M88 28 H204', 2.4)}${K.hammer(90, 26)}${K.screw(124, 36)}
      ${K.shape('M112 58 Q116 72 128 72 L124 58Z', 'f')}${K.sight(196, 24)}
      ${K.rounds(208, 33, n, { kind: 'dot', dx: 0, dy: 15, w: 6 })}` }),
    sixShooter: (K, f, a, n) => ({ m: [232, 34], t: [78, 16], body: `
      ${K.tex('M72 44 L100 50 Q92 70 90 92 L58 92 Q52 76 66 52 Z', 'a', 'k')}${K.screw(78, 70)}
      ${K.shape('M70 22 H134 V44 L124 58 H98 L88 50 L70 46 Z', 'f')}
      ${K.barrel(130, 232, 27, 13, 'f')}${K.barrel(134, 200, 42, 6, 'f')}${K.sight(222, 27, 6)}
      ${K.shape('M92 20 H130 Q134 34 130 50 H92 Q88 34 92 20Z', 'f')}${K.line('M100 24 V46 M110 24 V46 M120 24 V46', 2, dk(f, 0.5))}${K.shine('M94 24 H128', 1.6)}
      ${K.hammer(76, 24)}${K.guard(106, 56, 10)}
      ${K.rounds(96.5, 35, n, { kind: 'dot', dx: 5.6, w: 4.6 })}` }),
    flintlock: (K, f, a, n) => ({ m: [234, 33], t: [92, 18], body: `
      ${K.tex('M84 26 L232 26 L232 38 L96 40 Q76 46 66 70 Q60 86 44 90 Q30 92 32 80 Q42 58 60 38 Z', 'f')}
      ${K.barrel(104, 234, 26, 12, 'b')}${[150, 200].map((x) => K.band(x, 24, 16, 4, 'b')).join('')}
      ${K.shape('M78 28 Q88 22 110 24 L112 40 Q92 44 82 40Z', 's')}${K.shape('M90 26 L84 12 Q92 6 98 12 L96 26Z', 's')}${K.shape('M84 10 l10 -4 l2 4 l-10 4z', '#4a4a50')}
      ${K.shape('M30 80 Q28 94 44 92 Q40 84 46 78Z', 'b')}${K.guard(104, 42, 9, 'b')}
      ${K.rounds(126, 18, n, { kind: 'dot', w: 7 })}` }),
    corkPopper: (K, f, a, n) => ({ m: [234, 34], t: [92, 20], body: `
      ${K.shape('M80 48 L108 48 Q100 68 98 90 L70 90 Q70 68 80 48Z', 'a')}
      ${K.shape('M68 22 Q68 14 78 14 H206 Q214 14 214 22 V46 Q214 52 206 52 H78 Q68 52 68 46Z', 'f')}${K.shine('M78 20 H204', 3)}
      ${[100, 136, 172].map((x) => K.band(x, 14, 38, 6, 'a')).join('')}
      ${K.shape('M212 22 H230 Q236 24 236 34 Q236 44 230 46 H212Z', '#c8a070')}${K.line('M218 26 V42 M224 26 V42', 0.8, '#8a6a40')}
      ${K.guard(118, 50, 9, 'a')}
      ${K.group(Array.from({ length: n }, (_, i) => `<rect x="${140 + i * 15}" y="58" width="11" height="9" rx="2" fill="#c8a070" stroke="${INK}" stroke-width="0.9"/>`).join(''))}${K.line('M136 56 H206', 1.2, '#888')}` }),
    rayGun: (K, f, a, n) => ({ m: [234, 34], t: [92, 16], body: `
      ${K.shape('M86 52 L114 52 L106 90 L78 90Z', 'd')}${K.line('M84 62 H108 M83 70 H106 M82 78 H104', 1.6, '#555')}
      <ellipse cx="118" cy="34" rx="48" ry="22" fill="${K.F('f')}" ${K.st}/>${K.shine('M84 24 Q118 12 150 22', 3)}
      ${[164, 180, 196].map((x, i) => `<ellipse cx="${x}" cy="34" rx="5" ry="${18 - i * 4}" fill="${K.F('a')}" ${K.st}/>`).join('')}
      ${K.barrel(160, 216, 30, 8, 'f')}<circle cx="222" cy="34" r="10" fill="${a}" ${K.st}/><circle cx="222" cy="34" r="16" fill="${a}" opacity="0.25"/>
      ${K.shape('M84 14 L70 2 L98 12Z', 'a')}${K.shape('M84 54 L68 64 L100 56Z', 'a')}
      ${K.rounds(96, 38, n, { kind: 'cell', dx: 6.5, w: 4.4, h: 8 })}` }),
    flarePistol: (K, f, a, n) => ({ m: [224, 34], t: [96, 16], body: `
      ${K.tex('M82 50 L112 50 Q104 70 104 90 L72 90 Q70 70 82 50Z', 'a', 'k')}
      ${K.shape('M74 18 H200 Q206 18 206 24 V48 H74Z', 'f')}${K.shine('M80 23 H198', 3)}
      ${K.shape('M196 12 H222 Q226 12 226 16 V52 Q226 56 222 56 H196Z', 'f')}<ellipse cx="224" cy="34" rx="3" ry="18" fill="${dk(f, 0.6)}"/>
      ${K.hammer(80, 22)}${K.guard(124, 50, 9, 'a')}${K.screw(130, 34, 3)}
      ${K.group(`<rect x="140" y="27" width="50" height="14" rx="4" fill="#e83a2a" stroke="${INK}"/><rect x="140" y="27" width="10" height="14" rx="2" fill="url(#${'U'}b)" stroke="${INK}"/>`)}` }),
    slingshot: (K, f, a, n) => ({ m: [232, 46], t: [70, 44], body: `
      ${K.tex('M10 40 Q40 36 120 42 L120 52 Q40 58 10 54 Q4 47 10 40Z', 'f')}${K.line('M30 40 V54 M44 40 V54', 3, a)}
      ${K.tex('M116 40 Q150 30 210 8 L218 16 Q164 40 130 48Z', 'f')}${K.tex('M116 54 Q150 64 210 86 L218 78 Q164 54 130 46Z', 'f')}
      <path d="M214 12 Q160 46 214 82" fill="none" stroke="${a}" stroke-width="3"/><path d="M150 40 h16 v14 h-16z" fill="#6a3a22" stroke="${INK}"/>
      ${K.group(`<circle cx="158" cy="47" r="7" fill="#6a2a8a" stroke="${INK}"/><circle cx="156" cy="44" r="2" fill="rgba(255,255,255,0.5)"/>`)}` }),
    foamBlaster: (K, f, a, n) => ({ m: [234, 38], t: [94, 22], body: `
      ${K.shape('M80 52 L110 52 Q102 70 100 90 L72 90 Q70 70 80 52Z', 'a')}
      ${K.shape('M66 26 Q66 20 72 20 H206 Q212 20 212 26 V54 H66Z', 'f')}${K.shine('M72 25 H204', 3)}
      ${K.shape('M206 30 H232 V46 H206Z', 'a')}${K.shape('M86 8 H190 Q196 8 196 14 V20 H86Z', 'a')}
      <circle cx="150" cy="38" r="6" fill="#fff" ${K.st}/>${K.line('M140 48 H200', 3, a)}${K.guard(122, 54, 9, 'a')}
      ${K.group(Array.from({ length: n }, (_, i) => `<g transform="translate(${92 + i * 12} 2)"><rect width="8" height="12" rx="2" fill="#2a8af0" stroke="${INK}" stroke-width="0.8"/><rect width="8" height="4" rx="2" fill="#ff8a1f"/></g>`).join(''))}` }),
    nailGun: (K, f, a, n) => ({ m: [228, 40], t: [74, 22], body: `
      ${K.shape('M60 16 H180 Q192 16 192 28 V44 H104 L98 52 Q96 72 100 90 H70 Q66 70 74 46 L60 40Z', 'f')}${K.shine('M66 21 H178', 3)}
      ${K.shape('M190 30 H226 V50 H190Z', 'd')}${K.shape('M224 34 H234 V46 H224Z', 'd')}
      ${K.shape('M108 46 L200 52 L196 66 L104 60Z', 'a')}${K.line('M112 52 L194 58', 0.8)}
      ${K.shape('M54 24 H62 V34 H54Z', 'd')}${K.screw(84, 30)}${K.screw(170, 28)}${K.guard(118, 44, 8, 'd')}
      ${K.rounds(116, 56, n, { kind: 'cell', dx: 4.1, dy: 0.28, w: 2, h: 6 })}` }),
    duelPistol: (K, f, a, n) => ({ m: [234, 31], t: [90, 18], body: `
      ${K.tex('M82 28 L120 26 L120 40 L96 42 Q78 48 70 70 Q64 88 48 90 Q34 90 36 78 Q46 58 62 38Z', '#6a3e1e')}
      ${K.barrel(100, 234, 25, 12, 'f')}<path d="M104 31 H228" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
      ${K.shape('M78 28 Q88 22 108 24 L110 38 Q92 42 82 38Z', 'a')}<path d="M82 28 L108 26 L108 36 Z" fill="url(#${'U'}e)"/>
      ${K.hammer(88, 26, 'a')}${K.shape('M34 78 Q32 92 48 90 Q44 84 50 76Z', 'a')}${K.guard(102, 40, 9, 'a')}${K.band(224, 24, 14, 4, 'a')}
      ${K.rounds(140, 46, n, { kind: 'dot', w: 7 })}` }),
    candyPopgun: (K, f, a, n) => ({ m: [234, 34], t: [92, 18], body: `
      <path d="M84 40 Q60 44 56 66 Q54 84 70 88" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M84 40 Q60 44 56 66 Q54 84 70 88" fill="none" stroke="${f}" stroke-width="12" stroke-linecap="round"/><path d="M84 40 Q60 44 56 66 Q54 84 70 88" fill="none" stroke="${a}" stroke-width="12" stroke-dasharray="6 7" stroke-linecap="butt"/>
      ${K.shape('M76 24 H224 Q232 24 232 34 Q232 44 224 44 H76Z', '#ffffff')}
      ${Array.from({ length: 12 }, (_, i) => `<path d="M${84 + i * 12} 44 l8 -20 h5 l-8 20z" fill="${a}"/>`).join('')}${K.shape('M76 24 H224 Q232 24 232 34 Q232 44 224 44 H76Z', 'rgba(0,0,0,0)')}${K.shine('M80 28 H224', 2.2)}
      ${K.shape('M96 16 q-12 -10 -4 -14 q8 2 8 12z M100 16 q12 -10 4 -14 q-8 2 -8 12z', '#2a8a4a')}<circle cx="98" cy="17" r="4" fill="#2a8a4a" ${K.st}/>
      ${K.guard(108, 44, 9, 'a')}
      ${K.group(Array.from({ length: n }, (_, i) => `<path d="M${140 + i * 14} 62 q6 -12 12 0z" fill="${['#e83a2a', '#2ab84a', '#ffd23f', '#2a6ae8', '#ff6ab4'][i % 5]}" stroke="${INK}" stroke-width="0.9"/>`).join(''))}` }),
    pumpkinBlaster: (K, f, a, n) => ({ m: [234, 36], t: [88, 14], body: `
      ${K.shape('M84 54 L108 54 L104 90 L80 90Z', 'a')}
      ${[0, 1, 2].map((i) => `<ellipse cx="${110 + (i - 1) * 16}" cy="36" rx="${i === 1 ? 26 : 20}" ry="26" fill="${K.F('f')}" ${K.st}/>`).join('')}
      ${K.shape('M96 30 l6 -8 l6 8z M118 30 l6 -8 l6 8z', '#2a1408')}${K.shape('M96 42 l6 6 l6 -4 l6 4 l6 -4 l6 6 q-12 8 -30 0z', '#2a1408')}
      ${K.shape('M106 10 q-2 -8 6 -8', '#4a6a2a')}
      ${K.barrel(138, 230, 30, 12, '#ece6dc')}<circle cx="232" cy="31" r="6" fill="#ece6dc" ${K.st}/><circle cx="232" cy="41" r="6" fill="#ece6dc" ${K.st}/>
      ${K.guard(116, 62, 8, 'a')}
      ${K.group(Array.from({ length: n }, (_, i) => `<ellipse cx="${160 + i * 18}" cy="58" rx="7" ry="6" fill="#ff8a1f" stroke="${INK}" stroke-width="0.9"/>`).join(''))}` }),
    stalkingRifle: (K, f, a, n) => ({ m: [236, 38], t: [104, 22], body: `
      ${K.tex('M4 48 L60 36 L176 36 L176 48 L120 50 L100 54 Q44 64 12 80 Q2 70 4 48Z', 'f')}${K.tex('M60 40 L96 40 L94 52 L64 54Z', 'f', 'k')}
      ${K.barrel(120, 236, 31, 8, 'a')}${K.shape('M96 26 H140 V40 H96Z', 'a')}${K.shape('M120 24 L132 24 L132 20 L140 20 L140 24Z', 'a')}
      ${K.shape('M90 12 H156 Q160 16 156 20 H90 Q86 16 90 12Z', 'd')}<ellipse cx="156" cy="16" rx="3" ry="6" fill="#6ab0ff" opacity="0.6"/>${K.shape('M108 20 h6 v6 h-6z M134 20 h6 v6 h-6z', 'd')}
      ${K.shape('M104 30 h-8 v-6 h8 Q108 27 104 30Z', 'a')}${K.guard(118, 50, 9, 'a')}
      ${K.rounds(138, 46, n, { dx: 8 })}` }),
    sideBySide: (K, f, a, n) => ({ m: [236, 34], t: [98, 22], body: `
      ${K.tex('M4 50 L62 36 L104 34 L104 50 L72 54 Q40 66 12 82 Q2 72 4 50Z', 'f')}${K.tex('M64 40 L98 38 L96 50 L68 54Z', 'f', 'k')}${K.shine('M12 54 L60 41', 1.4)}
      ${K.barrel(100, 236, 26, 8, 'a')}${K.barrel(100, 236, 34, 8, 'a')}${K.shape('M120 42 H200 V48 H120Z', 'f')}
      ${K.shape('M92 26 H122 V50 H92Z', 'a')}<path d="M94 28 H120 V48 H94Z" fill="url(#${'U'}e)"/>${K.hammer(98, 28, 'a')}${K.hammer(104, 28, 'a')}
      ${K.guard(108, 52, 9, 'a')}${K.sight(230, 26, 3)}
      ${K.rounds(150, 60, n, { dx: 18, w: 8, h: 14, rot: 90 })}` }),
  };
  let gunUid = 0;
  function gunMarkup(gun, n = gun.def.mag || 6, { flash = false, thumb = false } = {}) {
    const u = `g${++gunUid}`;
    const K = kit(u, gun.finish, gun.accent);
    const art = (GUN_ART[gun.model] || GUN_ART.corkRifle)(K, gun.finish, gun.accent, n);
    return `${K.defs}${art.body.replace(/#U/g, `#${u}`)}${flash ? K.flash(...art.m) : ''}${thumb ? `<g class="sg-thumb" transform="translate(${art.t[0]} ${art.t[1]})"><circle r="16" fill="rgba(255,255,255,0.12)" stroke="#fff" stroke-width="2.2" stroke-dasharray="5 4"/><circle r="5" fill="#fff" opacity="0.85"/></g>` : ''}`;
  }
  function gunOf(s, id) {
    const model = houseOf(s);
    const look = s?.game?.guns?.[id] || (id === s?.me ? myLook() : null) || {};
    const def = GUNS[model] || GUNS.corkRifle;
    return { model, def, finish: look.finish || def.finish, accent: look.accent || def.accent, sight: look.sight || 'ring' };
  }
  function gunSvg(gun, cls = '', opts = {}) {
    return `<svg class="sg-gun ${cls}" viewBox="${opts.flash ? '-44 -4 328 104' : '0 0 240 96'}" aria-label="${esc(gun.def.name)}">${gunMarkup(gun, opts.n, opts)}</svg>`;
  }
  // The TV's little picture of each player's gun, by its crosshair.
  const gunImgs = new Map();
  function gunImg(gun) {
    const key = `${gun.model}:${gun.finish}:${gun.accent}`;
    let img = gunImgs.get(key);
    if (!img) {
      img = new Image();
      img.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" width="240" height="96">${gunMarkup(gun)}</svg>`)}`;
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
      const fronts = [0, 1, 2].map((i) => railFront(s.game.set, i, scale)).filter(Boolean);
      return { el, fg, bgCv: bg, c: fg.getContext('2d'), scale, fronts, time: el.querySelector('.sg-time'), score: el.querySelector('.sg-score-now') };
    });
    kick();
  }
  const kick = () => { if (!frame && !document.hidden && (views.length || document.getElementById('sg-phone-time'))) frame = requestAnimationFrame(draw); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && frame) { cancelAnimationFrame(frame); frame = null; } else kick(); });

  let lastDraw = 0;
  function draw(ms) {
    frame = null;
    views = views.filter((v) => v.el.isConnected);
    const s = PB.state;
    if ((!views.length && !document.getElementById('sg-phone-time')) || s?.gameType !== 'shootingGallery' || !s.game) return;
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
      // Back to front, each rail's waves over the targets riding it.
      let f = 0;
      for (const tg of zs) {
        while (f < v.fronts.length && v.fronts[f].z < tg.z - 1e-6) { const fr = v.fronts[f++]; c.drawImage(fr.cv, 0, fr.y, W, fr.h); }
        drawTarget(c, tg, t, s.game.set);
      }
      while (f < v.fronts.length) { const fr = v.fronts[f++]; c.drawImage(fr.cv, 0, fr.y, W, fr.h); }
      if (s.game.set !== 'duckPond') { c.drawImage(v.bgCv, 0, 0, 80 * v.scale, H * v.scale, 0, 0, 80, H); c.drawImage(v.bgCv, (W - 80) * v.scale, 0, 80 * v.scale, H * v.scale, W - 80, 0, 80, H); }
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
        c.font = '900 64px system-ui, sans-serif';
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
    // (Inside the booth's curtains, but for what flies over them.)
    if (tg.z < 5 && set !== 'duckPond') { c.beginPath(); c.rect(80, 0, W - 160, H); c.clip(); }
    // (The shelf's pop-ups are hidden behind the counter's front.)
    if (tg.p === 'pop') { c.beginPath(); c.rect(0, 0, W, SHELF * H - 8); c.clip(); }
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
    const R = 38;
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
    if (how === 'fill') { c.lineWidth = 12; c.stroke(); c.fill(); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke(); } else { c.lineWidth = 15; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke(); c.lineWidth = 8; c.strokeStyle = col; c.stroke(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke(); }
    // Their avatar and gun beside it.
    c.font = '38px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(look.avatar, R + 6, -R * 0.6);
    const img = gunImg(gun);
    if (img.complete && img.naturalWidth) c.drawImage(img, R + 4, -R * 0.15, 80, 32);
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
    // ...and on the gun itself: the spent rounds greyed.
    document.querySelectorAll('.sg-fire .sg-rounds > *').forEach((r, i, all) => r.classList.toggle('spent', left >= 0 && i >= left && all.length > 0));
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
      <button class="sg-fire ${hand() === 'left' ? 'left' : ''}" id="sg-fire" style="--pc:${esc(PB.look(s.me).color)}">${gunSvg(gun, '', { flash: true, thumb: true, n: g.gunStats?.mag || gun.def.mag })}<span class="sg-fire-word">TAP TO FIRE</span></button>
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
