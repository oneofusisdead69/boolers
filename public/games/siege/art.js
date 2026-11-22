// Storm the Keep: all the art, drawn by code (no image files). Everything is drawn at its true pixel
// size on small canvases and scaled up by the screen with `image-rendering: pixelated`, smoothing
// off, so rotated weapons stay crisp pixels too.
//
// - Heroes and soldiers share one body (frames: idle, two run frames, jump, a crouched block), each
//   in its own colours, with its own 10×9 head. Letters in the maps are palette slots: K outline,
//   A/a the main colour and its shade, C/c the chest, B boots and belt, G gold, S/s skin, E eyes,
//   R an accent (plume, beard, hair), H/h hood or hair, W white, M mask.
// - Weapons are maps pointing straight up, drawn from the hand at an angle: a swing is an angle over
//   time. Each knows where its grip is.
// - Bosses are drawn from rectangles, mirrored left to right, then outlined.
// - Tiles are painted from each zone's colours with a little seeded noise, so no two bricks match.
//
// Needs SiegeLevels (lib/siegeLevels.js) for the tile numbers. Exposes window.SiegeArt.
(function (root) {
  const L = root.SiegeLevels;
  const T = L.T;
  const K = '#1b1424';

  // ---------- Canvas helpers ----------
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return c;
  }
  // A sprite from a map (an array of strings) and a palette ({ letter: colour }).
  function fromMap(rows, pal) {
    const w = Math.max(...rows.map((r) => r.length));
    const c = canvas(w, rows.length);
    const x = c.getContext('2d');
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const col = pal[row[i]];
        if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
      }
    });
    return c;
  }
  // A 1-pixel outline round everything drawn on a canvas (the canvas grows by 1 each side).
  function outline(src, color = K) {
    const w = src.width, h = src.height;
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const out = canvas(w + 2, h + 2);
    const x = out.getContext('2d');
    const on = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 0;
    x.fillStyle = color;
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      if (on(i, j)) continue;
      if (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1)) x.fillRect(i + 1, j + 1, 1, 1);
    }
    x.drawImage(src, 1, 1);
    return out;
  }
  // A small painter for bosses and props: rect, mirrored rect, pixel.
  function painter(w, h) {
    const c = canvas(w, h);
    const x = c.getContext('2d');
    const r = (x0, y0, w0, h0, col) => { x.fillStyle = col; x.fillRect(x0, y0, w0, h0); };
    return {
      c, x, r,
      sym: (x0, y0, w0, h0, col) => { r(x0, y0, w0, h0, col); r(w - x0 - w0, y0, w0, h0, col); },
      px: (x0, y0, col) => r(x0, y0, 1, 1, col),
    };
  }
  // The same number in [0, 1) for the same position: per-tile variety that never flickers.
  function hash(a, b, c = 0) {
    let h = 2166136261 ^ (a * 374761393) ^ (b * 668265263) ^ (c * 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // A pixel line (for arms, chains, ropes).
  function line(x, x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    x.fillStyle = col;
    for (;;) {
      x.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
    return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
  }

  // ---------- Bodies (16 wide; torso and legs, drawn under the head) ----------
  const TORSO = [
    '....KKKKKKKK....',
    '...KAAAAAAAaK...',
    '...KACCCCCCaK...',
    '...KACCGCCCaK...',
    '...KACCCCCCaK...',
    '...KBBBGBBBBK...',
  ];
  const BODY = {
    idle: [...TORSO,
      '...KAAaKKAAaK...',
      '...KAaK..KAaK...',
      '...KAaK..KAaK...',
      '...KAaK..KAaK...',
      '...KBBBBKKBBBBK.',
      '...KKKKKKKKKKKK.'],
    run1: [...TORSO,
      '...KAAaKKAAaK...',
      '..KAaK....KAaK..',
      '.KAaK......KAaK.',
      '.KBBK......KAaK.',
      '.KKKK......KBBBK',
      '...........KKKKK'],
    run2: [...TORSO,
      '....KAAaAaK.....',
      '....KAaAaK......',
      '....KAaKAaK.....',
      '...KAaK.KAaK....',
      '...KBBBKKBBBBK..',
      '...KKKKKKKKKKK..'],
    jump: [...TORSO,
      '...KAAaKKAAaK...',
      '..KAaK...KAaK...',
      '..KBBBK..KBBBK..',
      '..KKKKK..KKKKK..'],
    block: [...TORSO,
      '..KAAaK..KAAaK..',
      '.KAaK......KAaK.',
      'KBBBBK....KBBBBK',
      'KKKKKK....KKKKKK'],
  };

  // ---------- Heads (10 × 9, facing right) ----------
  const HEADS = {
    knight: [
      '...RRR....',
      '..KKKKKK..',
      '.KAAAAAAK.',
      '.KAAAAAAaK',
      '.KAAKKKKKK',
      '.KAAAAaAaK',
      '.KaAAAaAaK',
      '..KaaaaaK.',
      '...KKKKK..'],
    reaver: [
      'W........W',
      'WW......WW',
      '.WKKKKKKW.',
      '.KAAGAAAaK',
      '.KSSSSSESK',
      '.KSSSSSSSK',
      '.KRRRSRRRK',
      '..KRRRRRK.',
      '...KRRRK..'],
    friar: [
      '..KKKKK...',
      '.KSSSSSK..',
      'KHSSSSSSK.',
      'KHHSSSESK.',
      'KHSSSSSSSK',
      '.KSSSSSsK.',
      '.KSSSSRsK.',
      '..KSSSsK..',
      '...KKKK...'],
    rogue: [
      '...KKKK...',
      '..KHHHHK..',
      '.KHHHHHHK.',
      'KHhSSSSSK.',
      'KHhSSSESK.',
      'KHhMMMMMK.',
      'KHhMMMMMK.',
      '.KHhhhhK..',
      '..KKKKK...'],
    kettle: [
      '..KKKKKK..',
      '.KAAAAAAK.',
      'KAAAAAAAAK',
      'KKKKKKKKKK',
      '.KSSSSESK.',
      '.KSSSSSSK.',
      '.KsSSRSSK.',
      '..KsSSSK..',
      '...KKKK...'],
    wizard: [
      '.......KK.',
      '......KHK.',
      '.....KHHK.',
      '...KKHHHK.',
      '.KHHHHHHHK',
      'KKKKKKKKKK',
      '.KSSSSESK.',
      '.KWWWWWWK.',
      '..KWWWWK..'],
    peasant: [
      '..KKKKK...',
      '.KHHHHHK..',
      'KHHSSSSSK.',
      'KHSSSESSK.',
      '.KSSSSSSK.',
      '.KSSKKSSK.',
      '..KSSSSK..',
      '...KKKK...'],
  };

  const SKIN = { S: '#f1bd8f', s: '#c98b62', E: K, K };

  // ---------- Weapons (pointing up; grip = where the hand holds it) ----------
  const WPAL = {
    K, W: '#eef2f6', w: '#9aa7b5', G: '#e9b43b', b: '#8a5a32', d: '#4a2e18', I: '#6c7480', i: '#40454e',
    R: '#d9412e', F: '#9fdcff', f: '#5aa6d8', Y: '#ffd23a', y: '#e2a21c', O: '#ff8a2a', P: '#b06cff', p: '#ffe6ff',
  };
  const shaft = (n, ch = '..b..') => Array(n).fill(ch);
  const WEAPON_MAPS = {
    sword: { grip: [2, 12], map: ['..W..', '.WWw.', '.WWw.', '.WWw.', '.WWw.', '.WWw.', '.WWw.', '.WWw.', '.WWw.', '.WWw.', 'GGGGG', '..b..', '..b..', '..b..', '..G..'] },
    hammer: { grip: [3, 14], map: ['.IIIII.', 'IIIIIII', 'IiIIIiI', 'IIIIIII', '.IIIII.', '...d...', ...shaft(10, '...b...'), '...I...'] },
    axe: { grip: [2, 13], map: ['..I.....', '..bWW...', '..bWWW..', '..bWWWw.', '..bWWWw.', '..bWWW..', '..bWW...', ...shaft(7, '..b.....'), '..I.....'] },
    spear: { grip: [1, 16], map: ['.W.', '.W.', 'WWw', 'WWw', '.w.', '.I.', ...shaft(15, '.b.'), '.I.'] },
    flail: { grip: [1, 6], map: ['.I.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.I.'] },
    daggers: { grip: [1, 6], map: ['.W.', 'WWw', 'WWw', 'WWw', 'GGG', '.b.', '.b.', '.G.'] },
    halberd: { grip: [2, 19], map: ['..W...', '..W...', '..WWW.', '.IWWWw', 'IIbWWw', '..bWW.', '..bW..', ...shaft(15, '..b...'), '..I...'] },
    mace: { grip: [3, 12], map: ['...I...', '.I.I.I.', '..iII..', 'IIIIiII', '..IIi..', '.I.I.I.', '...I...', '...d...', ...shaft(5, '...b...'), '...I...'] },
    fish: { grip: [2, 11], map: ['..FF..', '.FFFf.', '.FKFf.', '.FFFf.', '.FFFf.', '.FFFf.', '.FFFf.', '.FFFf.', '..Ff..', '..Ff..', '.FFFf.', 'FF..ff'] },
    chicken: { grip: [3, 12], map: ['..RR...', '.YYYY..', '.YKYYOO', '.YYYY..', '..YY...', '..YY...', '..YY...', '.YYYY..', '.YYYYy.', '.YYYYy.', '..YYy..', '...O...', '...O...', '..OOO..'] },
    spoon: { grip: [2, 12], map: ['.bbb.', 'bbbbb', 'bdddb', 'bbbbb', '.bbb.', ...shaft(9, '..b..'), '..d..'] },
    // Soldiers' gear
    bow: { grip: [1, 5], map: ['.b.', 'b.K', 'b.K', 'b.K', 'b.K', 'b.K', 'b.K', 'b.K', 'b.K', 'b.K', '.b.'] },
    crossbow: { grip: [3, 4], map: ['b.....b', '.bbIbb.', '...b...', '...b...', '...b...', '..bbb..'] },
    staff: { grip: [1, 9], map: ['.P.', 'PpP', '.P.', '.b.', ...shaft(10, '.b.'), '.d.'] },
    pot: { grip: [3, 1], map: ['..OO..', '.KKKK.', 'KIIIIK', 'KIiiIK', 'KIIIIK', '.KIIK.'] },
  };
  const BALL = ['...I...', '.IiIiI.', '.iIIIi.', 'IIIIIII', '.iIIIi.', '.IiIiI.', '...I...'];
  const SHIELD = ['KKKKKKK', 'KAAAAaK', 'KACCCaK', 'KACGCaK', 'KACCCaK', 'KACCCaK', 'KAAAAaK', '.KAAaK.', '..KKK..'];

  const WEAPONS = [
    { id: 'sword', name: 'Longsword', special: 'Charge Thrust', does: 'Dash forward through everything in the way.', reach: 3, speed: 3, power: 3 },
    { id: 'hammer', name: 'Warhammer', special: 'Quake Slam', does: 'Leap and slam: a shockwave along the ground that breaks the blocks underneath.', reach: 2, speed: 1, power: 5 },
    { id: 'axe', name: 'Battle Axe', special: 'Whirlwind', does: 'Spin and hit everything round you. You can keep moving while you spin.', reach: 2, speed: 2, power: 4 },
    { id: 'spear', name: 'Spear', special: 'Pogo', does: 'In the air: stab straight down and bounce off heads, again and again.', reach: 5, speed: 3, power: 2 },
    { id: 'flail', name: 'Flail', special: 'Wrecking Ball', does: 'Swing the ball in a huge arc. It smashes through walls.', reach: 4, speed: 1, power: 4 },
    { id: 'daggers', name: 'Twin Daggers', special: 'Shadow Step', does: 'Blink behind the nearest enemy and stab them in the back for triple damage.', reach: 1, speed: 5, power: 2 },
    { id: 'halberd', name: 'Halberd', special: 'Sweep', does: 'A low, wide sweep that knocks a whole crowd back, off ledges and into pits.', reach: 5, speed: 2, power: 3 },
    { id: 'mace', name: 'Morningstar', special: 'Stun', does: 'An overhead crack that leaves enemies seeing stars for a few seconds.', reach: 2, speed: 2, power: 3 },
    { id: 'fish', name: 'Frozen Fish', special: 'Slap', does: 'Slap someone so hard they freeze solid. Frozen enemies shatter in one hit.', reach: 2, speed: 4, power: 1, joke: true },
    { id: 'chicken', name: 'Rubber Chicken', special: 'Honk', does: 'HONK. Every enemy in earshot drops what they’re doing and runs away.', reach: 2, speed: 4, power: 1, joke: true },
    { id: 'spoon', name: 'Wooden Spoon', special: 'Bonk', does: 'Barely hurts. Sends whoever it hits flying right off the screen.', reach: 1, speed: 5, power: 1, joke: true },
  ];

  // ---------- Characters ----------
  const HEROES = [
    {
      id: 'brickwell', name: 'Sir Brickwell', role: 'The Knight', head: 'knight', weapon: 'sword', hearts: 4, speed: 2,
      perk: 'Blocking bounces arrows and bolts back at whoever fired them.',
      blurb: 'Too heavy to swim, too proud to take the stairs.',
      pal: { A: '#c7cfd8', a: '#7f8a99', C: '#3a66d6', c: '#24428f', B: '#5b3a24', G: '#e9b43b', R: '#d9412e', F: '#c7cfd8' },
    },
    {
      id: 'hilda', name: 'Hilda Gorehorn', role: 'The Reaver', head: 'reaver', weapon: 'axe', hearts: 3, speed: 3,
      perk: 'Rage: every knockout makes her swing faster for a few seconds.',
      blurb: 'Came for the siege. Stayed for the snacks.',
      pal: { A: '#8c6239', a: '#5e3f22', C: '#b8452f', c: '#7e2a1c', B: '#3f2a1a', G: '#d9d2c0', R: '#e06a2a', W: '#efe6d0', F: '#f1bd8f' },
      headPal: { A: '#9aa3ad', a: '#666e78' },
    },
    {
      id: 'thunk', name: 'Brother Thunk', role: 'The Friar', head: 'friar', weapon: 'flail', hearts: 3, speed: 2,
      perk: 'Gets fallen friends back on their feet twice as fast.',
      blurb: 'Took a vow of silence. Breaks it every time he swings.',
      pal: { A: '#7a5636', a: '#563a22', C: '#7a5636', c: '#563a22', B: '#d6b77a', G: '#d6b77a', H: '#6b4a2f', R: '#a8513f', F: '#f1bd8f' },
    },
    {
      id: 'nim', name: 'Nim Quickfingers', role: 'The Rogue', head: 'rogue', weapon: 'daggers', hearts: 2, speed: 5,
      perk: 'Double jump, and the fastest feet in the kingdom.',
      blurb: 'Says she’s here for the king. Is here for the treasury.',
      pal: { A: '#3f7d3a', a: '#28552a', C: '#6b4a2f', c: '#4a3220', B: '#3a2a1f', G: '#b9c2c9', H: '#2f6a2f', h: '#1f4720', M: '#2b2433', F: '#3a2a1f' },
    },
  ];

  const ENEMIES = {
    footman: { name: 'Footman', head: 'kettle', weapon: 'spear', angle: 0.25, does: 'Pokes with a spear. Comes in crowds.', pal: { A: '#8b8f98', a: '#5f636c', C: '#a63434', c: '#6e1f1f', B: '#4a3020', G: '#d6b77a', F: '#8b8f98' } },
    archer: { name: 'Archer', head: 'rogue', weapon: 'bow', angle: 0, does: 'Keeps its distance and fires arrows. Block them.', pal: { A: '#6a6e3a', a: '#474a25', C: '#a63434', c: '#6e1f1f', B: '#3a2a1f', G: '#d6b77a', H: '#a63434', h: '#6e1f1f', M: '#2b2433', F: '#f1bd8f' } },
    hound: { name: 'War Hound', does: 'Fast, low and bitey. Jump over it or swat it.' },
    crossbow: { name: 'Crossbowman', head: 'kettle', weapon: 'crossbow', angle: Math.PI / 2, does: 'Slow to reload, but the bolts go through planks.', pal: { A: '#7a6a52', a: '#544632', C: '#3f5a8a', c: '#2a3c5e', B: '#3a2a1f', G: '#d6b77a', F: '#f1bd8f' } },
    shield: { name: 'Shieldbearer', head: 'knight', weapon: 'sword', angle: 0.4, shield: true, does: 'Blocks from the front. Get behind it, or smash the floor under it.', pal: { A: '#8f97a6', a: '#5c6372', C: '#4c4f8a', c: '#33355e', B: '#3a2a1f', G: '#c9b56a', R: '#4c4f8a', F: '#8f97a6' } },
    oiler: { name: 'Oil Pourer', head: 'kettle', weapon: 'pot', angle: 0, does: 'Lobs pots of burning oil from the battlements.', pal: { A: '#5a4e44', a: '#3c332c', C: '#8a6a3a', c: '#5e4826', B: '#2a201a', G: '#c08a3a', F: '#f1bd8f' } },
    guard: { name: 'Royal Guard', head: 'knight', weapon: 'halberd', angle: 0.15, does: 'Long reach, heavy armour, four hits to drop.', pal: { A: '#d8b84a', a: '#9a7e2a', C: '#7a2a6a', c: '#511a46', B: '#3a2a1f', G: '#f6e6a0', R: '#7a2a6a', F: '#d8b84a' } },
    mage: { name: 'Court Mage', head: 'wizard', weapon: 'staff', angle: 0, does: 'Teleports about and throws purple fire.', pal: { A: '#5a2f8a', a: '#3c1f5e', C: '#5a2f8a', c: '#3c1f5e', B: '#2a1a3a', G: '#e9b43b', H: '#5a2f8a', W: '#e8e8f0', F: '#f1bd8f' } },
  };
  const PEASANT = { head: 'peasant', pal: { A: '#9b8a6a', a: '#6e5f44', C: '#b49a6a', c: '#8a7450', B: '#5a4630', G: '#9b8a6a', H: '#8a5a2b', F: '#f1bd8f' } };

  // Sprites are built once per character and cached.
  const cache = new Map();
  function cached(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  }
  function parts(def) {
    return cached(`fig:${def.id || def.name || def.head}`, () => {
      const pal = { ...SKIN, ...def.pal };
      const headPal = { ...pal, ...(def.headPal || {}) };
      const bodies = {};
      for (const k of Object.keys(BODY)) bodies[k] = fromMap(BODY[k], pal);
      const flash = {};
      const white = Object.fromEntries(Object.keys(pal).map((k) => [k, k === 'K' ? K : '#ffffff']));
      for (const k of Object.keys(BODY)) flash[k] = fromMap(BODY[k], white);
      return { bodies, flash, head: fromMap(HEADS[def.head], headPal), headFlash: fromMap(HEADS[def.head], white), shield: def.shield ? fromMap(SHIELD, pal) : null, pal };
    });
  }
  function weaponSprite(id) {
    return cached(`w:${id}`, () => fromMap(WEAPON_MAPS[id].map, WPAL));
  }
  function ballSprite() { return cached('ball', () => fromMap(BALL, WPAL)); }

  // Draw a weapon with its grip at (hx, hy), turned `angle` radians clockwise from straight up.
  function drawWeapon(x, id, hx, hy, angle) {
    const w = WEAPON_MAPS[id];
    const spr = weaponSprite(id);
    x.save();
    x.translate(Math.round(hx), Math.round(hy));
    x.rotate(angle);
    x.drawImage(spr, -w.grip[0], -w.grip[1]);
    x.restore();
  }

  // A soldier or hero. (fx, fy) = between their feet. opts: facing (1 right, -1 left), pose
  // ('idle' | 'run1' | 'run2' | 'jump' | 'block'), weapon id, angle (radians from straight up, toward
  // where they face), hand (where the hand is, relative to the shoulder; optional), flash (white, hit).
  const SHOULDER = [9, 10];
  function drawFigure(x, def, fx, fy, opts = {}) {
    const p = parts(def);
    const pose = opts.pose || 'idle';
    const facing = opts.facing || 1;
    const body = (opts.flash ? p.flash : p.bodies)[pose];
    const head = opts.flash ? p.headFlash : p.head;
    const drop = pose === 'block' ? 2 : pose === 'run1' ? 1 : 0;
    const angle = opts.angle != null ? opts.angle : def.angle != null ? def.angle : 0.5;
    const weapon = opts.weapon === undefined ? def.weapon : opts.weapon;
    x.save();
    x.translate(Math.round(fx), Math.round(fy));
    if (facing < 0) x.scale(-1, 1);
    x.translate(-8, -20);
    // The hand: on an arc round the shoulder, by the weapon's angle (held forward and low at rest).
    const sh = [SHOULDER[0], SHOULDER[1] + drop];
    const reach = opts.reach != null ? opts.reach : 4;
    const ha = Math.max(-2.2, Math.min(2.6, angle));
    const hand = opts.hand || [sh[0] + Math.sin(ha) * reach + 1, sh[1] - Math.cos(ha) * reach + 4];
    if (weapon === 'daggers') drawWeapon(x, 'daggers', 5, 13 + drop, angle - 0.6); // the other hand
    if (p.shield) x.drawImage(p.shield, 3, 9 + drop);
    x.drawImage(body, 0, 8 + drop);
    x.drawImage(head, 3, drop);
    if (weapon && weapon !== 'flail') drawWeapon(x, weapon, hand[0], hand[1], angle);
    if (weapon === 'flail') {
      drawWeapon(x, 'flail', hand[0], hand[1], angle);
      // The chain hangs off the end of the handle, toward opts.ball (or down and forward at rest).
      const tip = [hand[0] + Math.sin(angle) * 6, hand[1] - Math.cos(angle) * 6];
      const ball = opts.ball || [tip[0] + 3, tip[1] + 7];
      const n = 6;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        x.fillStyle = i % 2 ? '#6c7480' : '#40454e';
        x.fillRect(Math.round(tip[0] + (ball[0] - tip[0]) * t), Math.round(tip[1] + (ball[1] - tip[1]) * t + Math.sin(t * Math.PI) * 2), 1, 1);
      }
      x.drawImage(ballSprite(), Math.round(ball[0] - 3), Math.round(ball[1] - 3));
    }
    // The arm, shoulder to hand, and the fist over the grip.
    line(x, sh[0], sh[1], hand[0], hand[1], p.pal.a);
    x.fillStyle = K;
    x.fillRect(Math.round(hand[0]) - 1, Math.round(hand[1]) - 1, 3, 3);
    x.fillStyle = p.pal.F;
    x.fillRect(Math.round(hand[0]) - 1, Math.round(hand[1]) - 1, 2, 2);
    x.restore();
  }

  // ---------- The war hound ----------
  const HOUND = [
    '.............KK...',
    '............KHK...',
    '.K.........KHHHKK.',
    'KHK........KHHEHHK',
    '.KHKKKKKKKKHHHHKKK',
    '..KHHHHHHHHHHHHK..',
    '..KHHHHHHHHHHHK...',
    '..KHhHHHHHHhHK....',
    '..KhK.KhK.KhK.KhK.',
    '..KK..KK..KK..KK..',
  ];
  const HOUND2 = [
    '.............KK...',
    '............KHK...',
    '...........KHHHKK.',
    '.KK........KHHEHHK',
    'KHHKKKKKKKKHHHHKKK',
    '.KKHHHHHHHHHHHHK..',
    '..KHHHHHHHHHHHK...',
    '..KHhHHHHHHhHK....',
    '.KhK..KhK..KhK.KhK',
    '.KK...KK...KK..KK.',
  ];
  function drawHound(x, fx, fy, t = 0, facing = 1) {
    const pal = { K, H: '#7a5a3a', h: '#4e3824', E: '#ffd23a' };
    const spr = cached(`hound:${Math.floor(t * 8) % 2}`, () => fromMap(Math.floor(t * 8) % 2 ? HOUND2 : HOUND, pal));
    x.save();
    x.translate(Math.round(fx), Math.round(fy));
    if (facing < 0) x.scale(-1, 1);
    x.drawImage(spr, -9, -10);
    x.restore();
  }
  function drawEnemy(x, kind, fx, fy, opts = {}) {
    if (kind === 'hound') return drawHound(x, fx, fy, opts.t || 0, opts.facing || -1);
    const def = ENEMIES[kind];
    drawFigure(x, { id: `enemy:${kind}`, ...def }, fx, fy, { facing: -1, ...opts });
  }
  function drawPeasant(x, fx, fy, opts = {}) {
    drawFigure(x, { id: 'peasant', ...PEASANT }, fx, fy, { weapon: null, ...opts });
  }

  // ---------- Bosses (48 × 44, mirrored, then outlined) ----------
  const BOSSES = {
    gatekeeper: {
      name: 'Grumbold the Gatekeeper', zone: 0,
      does: 'An ogre with a tree trunk for a club. Slams the ground (jump it), charges (block it), and throws rocks.',
      paint(b, t) {
        const S = '#7aa04a', s = '#557a32', L = '#7a5636', l = '#563a22', A = '#7d8592', E = '#ffd23a', W = '#f2ead0', B = '#3f2a1a';
        b.sym(12, 32, 8, 9, L); b.sym(10, 40, 10, 4, B); // legs, feet
        b.r(10, 17, 28, 16, S); b.r(13, 25, 22, 8, s); // belly
        b.r(10, 30, 28, 5, L); b.r(10, 30, 28, 1, l); b.r(21, 30, 6, 2, '#e9b43b'); // loincloth + buckle
        b.sym(4, 13, 10, 8, S); b.sym(1, 19, 7, 12, S); b.sym(1, 26, 7, 2, A); b.sym(0, 30, 8, 6, s); // shoulders, arms, cuffs, fists
        b.r(16, 3, 16, 13, S); b.r(16, 3, 16, 4, A); b.r(23, 0, 2, 3, A); // head, iron cap, spike
        b.r(17, 8, 14, 1, s); // brow
        const blink = Math.floor(t * 1.3) % 6 === 0 && (t * 1.3) % 1 < 0.15;
        b.sym(18, 9, 3, 2, blink ? s : E); if (!blink) b.sym(19, 9, 1, 2, '#1b1424');
        b.r(23, 10, 2, 3, s); // nose
        b.r(18, 14, 12, 1, '#1b1424'); b.sym(18, 12, 2, 2, W); // mouth, tusks
        b.r(16, 18, 16, 1, s); // double chin
      },
      extra(x, t, ox, oy) {
        // The club, in his right hand (our left).
        const a = -0.35 + Math.sin(t * 2) * 0.08;
        x.save(); x.translate(ox + 5, oy + 34); x.rotate(a);
        x.fillStyle = '#1b1424'; x.fillRect(-4, -30, 9, 32);
        x.fillStyle = '#8a5a32'; x.fillRect(-3, -29, 7, 30);
        x.fillStyle = '#6b4226'; x.fillRect(-3, -29, 2, 30);
        x.fillStyle = '#c9d1d9'; for (let i = 0; i < 4; i++) { x.fillRect(-5, -27 + i * 6, 2, 1); x.fillRect(4, -24 + i * 6, 2, 1); }
        x.restore();
      },
    },
    marshal: {
      name: 'The Iron Marshal', zone: 1,
      does: 'A knight the size of a barn door. Greatsword sweeps (duck under or block), and a shield bash that sends you flying.',
      paint(b, t) {
        const A = '#c3cad4', a = '#808a99', d = '#555e6b', C = '#a63434', c = '#6e1f1f', G = '#e9b43b', R = '#d9412e';
        b.sym(13, 30, 8, 10, A); b.sym(17, 30, 3, 10, a); b.sym(11, 40, 10, 4, d); // legs, sabatons
        b.r(11, 14, 26, 17, A); b.r(15, 16, 18, 15, C); b.r(15, 16, 3, 15, c); b.r(21, 19, 6, 6, G); b.r(23, 20, 2, 4, C); // torso, tabard, emblem
        b.sym(3, 11, 11, 7, A); b.sym(3, 15, 11, 2, a); b.sym(5, 8, 2, 3, a); b.sym(9, 9, 2, 2, a); // pauldrons + spikes
        b.sym(5, 18, 6, 10, a); b.sym(4, 28, 8, 5, A); // arms, gauntlets
        b.r(17, 1, 14, 13, A); b.r(17, 1, 14, 2, a); b.r(18, 6, 12, 2, '#1b1424'); // helm, visor slit
        const glow = (Math.sin(t * 3) + 1) / 2 > 0.5 ? '#ff5a3a' : '#c0302a';
        b.sym(19, 6, 2, 2, glow);
        b.r(19, 9, 10, 1, d); for (let i = 0; i < 5; i++) b.px(19 + i * 2, 11, d); // breaths
        b.r(23, 0, 2, 2, R); b.r(22, -1, 4, 1, R);
      },
      extra(x, t, ox, oy) {
        // The greatsword, held point down at his side.
        const lift = Math.round(Math.sin(t * 2) * 1);
        x.fillStyle = '#1b1424'; x.fillRect(ox + 40, oy + 6 + lift, 6, 34); x.fillRect(ox + 36, oy + 28 + lift, 14, 4);
        x.fillStyle = '#eef2f6'; x.fillRect(ox + 41, oy + 7 + lift, 4, 21);
        x.fillStyle = '#9aa7b5'; x.fillRect(ox + 44, oy + 7 + lift, 1, 21);
        x.fillStyle = '#e9b43b'; x.fillRect(ox + 37, oy + 29 + lift, 12, 2);
        x.fillStyle = '#5b3a24'; x.fillRect(ox + 42, oy + 31 + lift, 2, 7);
        x.fillStyle = '#e9b43b'; x.fillRect(ox + 41, oy + 38 + lift, 4, 2);
      },
    },
    gargoyle: {
      name: 'Old Granite', zone: 2,
      does: 'The castle’s gargoyle, awake and furious. Swoops across the battlements, then perches and spits fire. Hit it while it rests.',
      paint(b, t) {
        const S = '#8a8f9e', s = '#62677a', d = '#44485a', E = '#ff9a2a';
        const flap = Math.sin(t * 6) > 0 ? 0 : 2;
        // Wings, scalloped along the bottom.
        b.sym(0, 6 + flap, 14, 16, s);
        for (let i = 0; i < 4; i++) b.sym(i * 3 + 1, 22 + flap, 2, 2, s);
        b.sym(2, 8 + flap, 1, 12, d); b.sym(6, 7 + flap, 1, 13, d); b.sym(10, 7 + flap, 1, 12, d);
        b.r(14, 16, 20, 16, S); b.r(16, 24, 16, 8, s); // body
        b.r(15, 6, 18, 12, S); b.sym(14, 1, 3, 6, d); b.sym(16, 3, 2, 3, s); // head, horns
        b.r(16, 9, 16, 1, s); b.sym(18, 10, 3, 2, E); // brow, eyes
        b.r(18, 14, 12, 3, '#1b1424'); b.sym(19, 14, 1, 2, '#f2ead0'); b.sym(22, 14, 1, 1, '#f2ead0'); // jaw, fangs
        b.sym(11, 30, 9, 8, S); b.sym(10, 38, 10, 3, d); for (let i = 0; i < 3; i++) b.sym(10 + i * 3, 41, 1, 2, d); // haunches, claws
        b.sym(8, 18, 6, 10, s); b.sym(6, 28, 6, 3, d); // arms
      },
    },
    king: {
      name: 'The Usurper King', zone: 3,
      does: 'Stole the crown and won’t give it back. Flaming sword, summons his guards, and at half health he throws off his robe and gets fast.',
      paint(b, t) {
        const R = '#a3263a', r = '#6e1426', P = '#5a2f8a', p = '#3c1f5e', W = '#f2ecf6', G = '#e9b43b', S = '#f1bd8f', s = '#c98b62', H = '#4a3220';
        b.sym(4, 12, 12, 30, R); b.sym(4, 12, 3, 30, r); // cape
        b.r(14, 14, 20, 27, P); b.r(14, 30, 20, 11, p); b.r(22, 14, 4, 27, '#e9b43b'); // robe + gold stripe
        b.r(13, 14, 22, 4, W); for (let i = 0; i < 5; i++) b.px(15 + i * 4, 15, '#1b1424'); // ermine collar
        b.r(14, 26, 20, 2, G); // belt
        b.sym(9, 16, 5, 13, P); b.sym(9, 29, 5, 3, S); // arms, hands
        b.r(17, 4, 14, 11, S); b.r(17, 4, 2, 11, s); // face
        b.sym(19, 8, 2, 1, '#1b1424'); b.r(17, 11, 14, 6, H); b.r(21, 12, 6, 1, s); // eyes, beard, mouth
        b.r(16, 0, 16, 4, G); b.sym(16, -2, 2, 2, G); b.r(23, -2, 2, 2, G); b.sym(20, -1, 1, 1, G); // crown
        const gem = Math.sin(t * 4) > 0 ? '#ff4a6a' : '#d9412e'; b.r(23, 1, 2, 2, gem); b.sym(18, 1, 1, 1, '#4ad9ff');
      },
      extra(x, t, ox, oy) {
        // The flaming sword, raised.
        x.fillStyle = '#1b1424'; x.fillRect(ox + 41, oy + 2, 5, 28); x.fillRect(ox + 37, oy + 28, 13, 3);
        x.fillStyle = '#ffe6a0'; x.fillRect(ox + 42, oy + 3, 3, 25);
        x.fillStyle = '#e9b43b'; x.fillRect(ox + 38, oy + 29, 11, 1);
        x.fillStyle = '#5b3a24'; x.fillRect(ox + 42, oy + 31, 3, 7);
        for (let i = 0; i < 9; i++) {
          const fy = oy + 26 - ((t * 30 + i * 7) % 28);
          const fx = ox + 43 + Math.round(Math.sin(t * 9 + i * 2) * 2);
          x.fillStyle = i % 3 === 0 ? '#ffd23a' : i % 3 === 1 ? '#ff8a2a' : '#d9412e';
          x.fillRect(fx - 1, fy, 2 + (i % 2), 2);
        }
      },
    },
  };
  const BOSS_W = 48, BOSS_H = 44;
  // A boss at (fx, fy) = between its feet, `t` seconds in (it breathes, blinks, flaps).
  function drawBoss(x, id, fx, fy, t = 0, opts = {}) {
    const boss = BOSSES[id];
    const frame = Math.floor(t * 8);
    const spr = cached(`boss:${id}:${frame % 48}`, () => {
      const b = painter(BOSS_W, BOSS_H + 2);
      b.x.translate(0, 2);
      boss.paint(b, frame / 8);
      return outline(b.c);
    });
    if (cache.size > 2000) cache.clear();
    const bob = Math.round(Math.sin(t * 2.2));
    x.save();
    x.translate(Math.round(fx), Math.round(fy));
    if (opts.facing < 0) x.scale(-1, 1);
    const ox = -BOSS_W / 2 - 1, oy = -BOSS_H - 3 + bob;
    x.drawImage(spr, ox, oy);
    if (boss.extra) boss.extra(x, t, ox, oy);
    x.restore();
  }

  // ---------- Zones: colours, tiles, backdrops ----------
  const ZONES = [
    {
      ...L.ZONES[0], blurb: 'Outside the walls at dawn. Mud, tents, palisades and the moat.',
      sky: ['#5b4a8a', '#c86a7a', '#f6b06a'], far: '#8a6a8a', hills: '#4e6e46',
      keep: { scale: 0.45, color: '#6a5470', lit: '#f6c46a' },
      ground: '#7a5232', ground2: '#5e3d22', top: '#6cbf4b', top2: '#4e9a3a', brick: '#9a9488', brick2: '#7b766c', mortar: '#4d4a44',
      wood: '#a8743f', wood2: '#7a5028', accent: '#d9412e',
    },
    {
      ...L.ZONES[1], blurb: 'Through the gate: stables, barracks and the market square.',
      sky: ['#5aa0d8', '#9ad0ee', '#d8eef2'], far: '#9ab0c0', hills: '#7a9a8a',
      keep: { scale: 0.7, color: '#7a8696', lit: '#ffe08a' },
      ground: '#8a8a8e', ground2: '#6a6a70', top: '#a8a6a2', top2: '#86847e', brick: '#a8a090', brick2: '#86806e', mortar: '#55504a',
      wood: '#8a5a32', wood2: '#5e3d22', plaster: '#e8dcc0', hay: '#e8c45a', accent: '#3f5a8a',
    },
    {
      ...L.ZONES[2], blurb: 'Up on the walls at night. Battlements, towers and burning oil.',
      sky: ['#0b0d26', '#1e1c46', '#3a2f5e'], far: '#2a2850', hills: '#1c1a3a',
      keep: { scale: 1.0, color: '#24233f', lit: '#ffc44a' },
      ground: '#5f6680', ground2: '#454b62', top: '#7a819a', top2: '#5f6680', brick: '#6f7590', brick2: '#555b74', mortar: '#2e3146',
      wood: '#7a5028', wood2: '#553818', accent: '#ffb02a',
    },
    {
      ...L.ZONES[3], blurb: 'Inside the keep. The great hall, the gallery and the throne.',
      sky: ['#1e1626', '#2a1f33', '#33263e'], far: '#2a2033', hills: '#241a2c', interior: true,
      keep: null,
      ground: '#5a4e5e', ground2: '#423848', top: '#a3263a', top2: '#6e1426', brick: '#5e5266', brick2: '#4a3f52', mortar: '#2a222f',
      wood: '#6e1426', wood2: '#4a0e1a', gold: '#e9b43b', accent: '#e9b43b',
    },
  ];

  const TILE = 16;
  // One tile at (px, py) on the canvas; (gx, gy) is its place in the level (for variety), `lv`
  // answers what's next to it.
  function drawTile(x, z, type, px, py, gx, gy, at, t = 0) {
    const Z = ZONES[z];
    const r = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(px + a, py + b, w, h); };
    const above = at ? at(gx, gy - 1) : T.EMPTY;
    const openAbove = above === T.EMPTY || above === T.LADDER || above === T.CAGE || above === T.GATE || above === T.SPIKES;
    switch (type) {
      case T.GROUND: {
        if (z >= 2) return drawBricks(x, Z.ground, Z.ground2, Z.mortar, px, py, gx, gy, openAbove ? Z.top : null);
        r(0, 0, 16, 16, Z.ground);
        for (let i = 0; i < 7; i++) {
          const hx = Math.floor(hash(gx, gy, i) * 15), hy = Math.floor(hash(gy, gx, i) * 15);
          r(hx, hy, 2, 1, Z.ground2);
        }
        if (hash(gx, gy, 99) < 0.25) { r(5, 8, 3, 2, Z.brick2); r(5, 8, 3, 1, Z.brick); }
        if (openAbove) {
          if (z === 0) {
            r(0, 0, 16, 4, Z.top); r(0, 4, 16, 1, Z.top2);
            for (let i = 0; i < 16; i += 2) if (hash(gx, i) < 0.6) r(i, 4, 1, 1 + Math.floor(hash(i, gx) * 2), Z.top2);
            for (let i = 0; i < 3; i++) r(Math.floor(hash(gx, gy, i + 20) * 15), -1, 1, 1, Z.top);
          } else {
            // Cobbles on the bailey's ground.
            r(0, 0, 16, 5, Z.top2);
            for (let i = 0; i < 4; i++) { const o = (gx % 2) * 2; r(i * 4 + o, 0, 3, 2, Z.top); r(i * 4 + 2 - o, 3, 3, 1, Z.top); }
          }
        }
        return;
      }
      case T.BRICK: return drawBricks(x, Z.brick, Z.brick2, Z.mortar, px, py, gx, gy, openAbove && z === 3 ? Z.top : null);
      case T.BEDROCK: {
        // The unbreakable layer: the zone's own ground, darker and heavier.
        const a = shade(z >= 2 ? Z.ground : Z.ground, -0.3), b = shade(Z.ground2, -0.35);
        if (z >= 2) { drawBricks(x, a, b, shade(Z.mortar, -0.3), px, py, gx, gy, openAbove ? Z.top : null); return; }
        r(0, 0, 16, 16, a);
        for (let i = 0; i < 5; i++) r(Math.floor(hash(gx, gy, i) * 13), Math.floor(hash(gy, gx, i) * 13), 3, 2, b);
        if (openAbove) {
          if (z === 0) { r(0, 0, 16, 4, Z.top); r(0, 4, 16, 1, Z.top2); }
          else { r(0, 0, 16, 5, Z.top2); for (let i = 0; i < 4; i++) { const o = (gx % 2) * 2; r(i * 4 + o, 0, 3, 2, Z.top); r(i * 4 + 2 - o, 3, 3, 1, Z.top); } }
        }
        return;
      }
      case T.PLANK: case T.CARPET: {
        const a = type === T.CARPET ? Z.top : Z.wood, b = type === T.CARPET ? Z.top2 : Z.wood2;
        r(0, 0, 16, 5, K); r(0, 0, 16, 4, a); r(0, 3, 16, 1, b);
        if (type === T.CARPET) { r(0, 1, 16, 1, Z.gold); }
        else { r(4, 0, 1, 3, b); r(11, 0, 1, 3, b); }
        r(1, 5, 2, 3, b); r(13, 5, 2, 3, b);
        return;
      }
      case T.CRATE: {
        r(0, 0, 16, 16, K); r(1, 1, 14, 14, Z.wood); r(1, 1, 14, 2, Z.wood2); r(1, 13, 14, 2, Z.wood2);
        line(x, px + 2, py + 3, px + 13, py + 12, Z.wood2); line(x, px + 2, py + 4, px + 12, py + 12, Z.wood2);
        r(1, 1, 1, 14, Z.wood2); r(14, 1, 1, 14, Z.wood2);
        return;
      }
      case T.HAY: {
        r(0, 2, 16, 14, K); r(1, 3, 14, 12, Z.hay || '#e8c45a');
        for (let i = 0; i < 6; i++) r(1 + Math.floor(hash(gx, i) * 13), 4 + i * 2, 3, 1, '#c8a03a');
        r(1, 7, 14, 1, '#8a5a32'); r(1, 11, 14, 1, '#8a5a32');
        return;
      }
      case T.TIMBER: {
        if (z === 0) {
          // A palisade: sharpened logs.
          for (let i = 0; i < 2; i++) {
            r(i * 8, 0, 8, 16, K); r(i * 8 + 1, 0, 6, 16, Z.wood); r(i * 8 + 5, 0, 2, 16, Z.wood2);
            if (!(above === T.TIMBER)) { r(i * 8, 0, 8, 3, 'rgba(0,0,0,0)'); x.clearRect(px + i * 8, py, 2, 3); x.clearRect(px + i * 8 + 6, py, 2, 3); r(i * 8 + 2, 0, 4, 1, Z.wood); }
          }
          return;
        }
        r(0, 0, 16, 16, Z.plaster || Z.brick); r(0, 0, 16, 2, Z.wood); r(0, 14, 16, 2, Z.wood);
        r(0, 0, 2, 16, Z.wood); r(14, 0, 2, 16, Z.wood); line(x, px + 2, py + 2, px + 13, py + 13, Z.wood);
        return;
      }
      case T.MERLON: {
        drawBricks(x, Z.brick, Z.brick2, Z.mortar, px, py + 4, gx, gy, Z.top, 12);
        return;
      }
      case T.PILLAR: {
        r(2, 0, 12, 16, K); r(3, 0, 10, 16, Z.brick); r(3, 0, 3, 16, shade(Z.brick, 0.15)); r(10, 0, 3, 16, Z.brick2);
        if (gy % 3 === 0) r(2, 0, 12, 2, Z.gold || Z.brick2);
        return;
      }
      case T.LADDER: {
        r(2, 0, 2, 16, K); r(12, 0, 2, 16, K); r(2, 0, 1, 16, Z.wood); r(12, 0, 1, 16, Z.wood);
        r(2, 3, 12, 2, K); r(2, 3, 12, 1, Z.wood); r(2, 11, 12, 2, K); r(2, 11, 12, 1, Z.wood);
        return;
      }
      case T.SPIKES: {
        r(0, 13, 16, 3, Z.mortar);
        for (let i = 0; i < 4; i++) { const sx = i * 4; r(sx + 1, 6, 2, 7, K); r(sx + 1, 7, 1, 6, '#c9d1d9'); r(sx + 1, 4, 1, 2, K); }
        return;
      }
      case T.WATER: {
        const surface = at && at(gx, gy - 1) !== T.WATER;
        r(0, 0, 16, 16, '#2a5a8a');
        if (surface) { r(0, 2, 16, 14, '#2a5a8a'); r(0, 0, 16, 2, 'rgba(0,0,0,0)'); x.clearRect(px, py, 16, 3); r(0, 3, 16, 2, '#6ab0e0'); r(Math.floor((t * 6 + gx * 5) % 16), 3, 4, 1, '#cfeaff'); }
        r(Math.floor(hash(gx, gy) * 12), 9, 4, 1, '#3a74a8');
        return;
      }
      case T.CAGE: {
        drawPeasant(x, px + 8, py + 16, { pose: 'idle', facing: Math.sin(t * 2 + gx) > 0 ? 1 : -1, flash: false });
        r(0, 0, 16, 2, '#40454e'); r(0, 14, 16, 2, '#40454e');
        for (let i = 0; i < 5; i++) r(i * 3 + 1, 0, 1, 16, '#6c7480');
        r(0, 0, 16, 1, '#8a929c');
        return;
      }
      case T.GATE: {
        // The portcullis, raised: just its bottom teeth show under the arch.
        r(0, 0, 16, 16, Z.mortar);
        for (let i = 0; i < 4; i++) r(i * 4 + 1, 0, 2, 16, '#40454e');
        r(0, 6, 16, 2, '#40454e');
        return;
      }
      default:
    }
  }
  function drawBricks(x, a, b, mortar, px, py, gx, gy, topColor, h = 16) {
    x.fillStyle = mortar; x.fillRect(px, py, 16, h);
    for (let row = 0; row < h / 4; row++) {
      const off = (row + gy * 4) % 2 ? 4 : 0;
      for (let c = -1; c < 2; c++) {
        const bx = c * 8 + off;
        const v = hash(gx * 3 + c, gy * 4 + row);
        x.fillStyle = v < 0.2 ? b : v > 0.85 ? shade(a, 0.08) : a;
        const x0 = Math.max(0, bx), x1 = Math.min(16, bx + 7);
        if (x1 > x0) x.fillRect(px + x0, py + row * 4, x1 - x0, 3);
        if (x1 > x0) { x.fillStyle = shade(a, 0.18); x.fillRect(px + x0, py + row * 4, x1 - x0, 1); }
      }
    }
    if (topColor) { x.fillStyle = topColor; x.fillRect(px, py, 16, 2); x.fillStyle = shade(topColor, -0.3); x.fillRect(px, py + 2, 16, 1); }
  }

  // The castle far away: smaller the further out you are. (cx, base) = its middle, on the horizon.
  function drawKeepSilhouette(x, cx, base, scale, color, lit, t = 0) {
    const s = scale;
    const r = (a, b, w, h, c = color) => { x.fillStyle = c; x.fillRect(Math.round(cx + a * s), Math.round(base - b * s - h * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
    const tower = (a, w, h) => { r(a, 0, w, h); for (let i = 0; i < w; i += 6) r(a + i, h, 3, 4); };
    r(-130, 0, 260, 50); for (let i = -130; i < 130; i += 10) r(i, 50, 5, 6); // the curtain wall
    tower(-150, 30, 85); tower(120, 30, 85); tower(-70, 24, 70); tower(46, 24, 70);
    tower(-40, 80, 130); // the keep
    r(-10, 130, 20, 40); r(-4, 170, 8, 14); r(-2, 184, 2, 22, '#1b1424');
    // Its flag.
    const wave = Math.sin(t * 3);
    r(0, 196, 24, 10, '#a63434'); r(24, 196 + Math.round(wave), 6, 8, '#a63434');
    // Windows.
    for (const [a, b] of [[-28, 90], [10, 90], [-28, 60], [10, 60], [-145, 60], [125, 60], [-9, 140]]) r(a, b, 8, 12, lit);
    r(-16, 0, 32, 30, '#1b1424'); // the gate
  }
  // The sky and everything behind the level, `camX` pixels along it.
  function drawBackdrop(x, z, w, h, camX = 0, t = 0) {
    const Z = ZONES[z];
    if (Z.interior) {
      x.fillStyle = Z.sky[1]; x.fillRect(0, 0, w, h);
      // The hall's back wall: big dark stones, banners, and stained glass catching the light.
      const off = -Math.round(camX * 0.5) % 32;
      for (let yy = 0; yy < h; yy += 16) for (let xx = off - 32; xx < w + 32; xx += 32) {
        x.fillStyle = (Math.floor(yy / 16) % 2) ? '#2e2238' : '#30243b';
        x.fillRect(xx + ((yy / 16) % 2) * 16, yy, 30, 14);
      }
      const span = 160;
      const off2 = -Math.round(camX * 0.5) % span;
      for (let xx = off2 - span; xx < w + span; xx += span) {
        drawStainedGlass(x, xx + 40, 40, t);
        x.fillStyle = '#6e1426'; x.fillRect(xx + 115, 28, 18, 56); x.fillStyle = '#e9b43b'; x.fillRect(xx + 115, 28, 18, 3); x.fillRect(xx + 122, 50, 4, 8);
        x.fillStyle = '#6e1426'; x.beginPath(); x.moveTo(xx + 115, 84); x.lineTo(xx + 124, 92); x.lineTo(xx + 133, 84); x.fill();
      }
      return;
    }
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, Z.sky[0]); g.addColorStop(0.6, Z.sky[1]); g.addColorStop(1, Z.sky[2]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // Banded, so the gradient reads as pixel art.
    for (let yy = 0; yy < h; yy += 6) { x.fillStyle = 'rgba(0,0,0,0.04)'; x.fillRect(0, yy, w, 3); }
    if (z === 2) {
      for (let i = 0; i < 60; i++) {
        const sx = Math.floor(hash(i, 1) * w), sy = Math.floor(hash(i, 2) * h * 0.6);
        x.fillStyle = hash(i, 3) + Math.sin(t * 2 + i) * 0.2 > 0.7 ? '#ffffff' : '#9a9ad0';
        x.fillRect(sx, sy, 1, 1);
      }
      x.fillStyle = '#f2ecd0'; x.beginPath(); x.arc(w * 0.18, 34, 14, 0, Math.PI * 2); x.fill();
      x.fillStyle = Z.sky[0]; x.beginPath(); x.arc(w * 0.18 + 6, 30, 12, 0, Math.PI * 2); x.fill();
    } else if (z === 0) {
      x.fillStyle = '#ffd89a'; x.beginPath(); x.arc(w * 0.78, h * 0.62, 18, 0, Math.PI * 2); x.fill();
    } else {
      for (let i = 0; i < 4; i++) {
        const cx = ((hash(i, 9) * w * 1.5 - camX * 0.05 - t * 4) % (w * 1.5) + w * 1.5) % (w * 1.5) - 40;
        x.fillStyle = '#ffffff'; x.fillRect(Math.round(cx), 20 + i * 14, 40, 6); x.fillRect(Math.round(cx) + 8, 15 + i * 14, 22, 6);
      }
    }
    // The keep, further off the further out you are; it slides slowly as you move.
    const k = Z.keep;
    const horizon = h * 0.72;
    drawKeepSilhouette(x, w * 0.6 - camX * 0.04, horizon, k.scale * (h / 224), k.color, k.lit, t);
    // Hills (or the wall's far side) in front of it.
    x.fillStyle = Z.hills;
    for (let xx = 0; xx < w; xx += 4) {
      const wx = xx + camX * 0.25;
      const hh = 18 + Math.sin(wx * 0.013) * 10 + Math.sin(wx * 0.031) * 5;
      x.fillRect(xx, Math.round(horizon + 18 - hh * 0.5), 4, h);
    }
    if (z === 0) {
      // Siege tents and banners on the hills.
      const off = -Math.round(camX * 0.25) % 140;
      for (let xx = off - 140; xx < w + 140; xx += 140) {
        x.fillStyle = '#e8dcc0'; x.beginPath(); x.moveTo(xx + 20, horizon + 18); x.lineTo(xx + 34, horizon - 4); x.lineTo(xx + 48, horizon + 18); x.fill();
        x.fillStyle = '#c8b898'; x.fillRect(xx + 33, horizon + 2, 2, 16);
        x.fillStyle = '#d9412e'; x.fillRect(xx + 34, horizon - 12, 6, 4);
      }
    }
  }
  function drawStainedGlass(x, cx, top, t) {
    x.fillStyle = '#1b1424'; x.fillRect(cx - 13, top - 1, 26, 52); x.beginPath(); x.arc(cx, top + 2, 13, Math.PI, 0); x.fill();
    const cols = ['#d9412e', '#3a66d6', '#e9b43b', '#3f9a5a', '#8a4ad9'];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) {
      x.fillStyle = cols[(i + j * 2) % cols.length];
      x.globalAlpha = 0.75 + Math.sin(t * 1.5 + i + j) * 0.15;
      x.fillRect(cx - 11 + i * 8, top + 2 + j * 8, 6, 6);
    }
    x.globalAlpha = 1;
    x.fillStyle = '#e9b43b'; x.beginPath(); x.arc(cx, top + 2, 10, Math.PI, 0); x.fill();
    x.fillStyle = 'rgba(255,220,150,0.08)'; x.beginPath(); x.moveTo(cx - 12, top + 50); x.lineTo(cx + 12, top + 50); x.lineTo(cx + 40, top + 170); x.lineTo(cx - 40, top + 170); x.fill();
  }

  // Soft light round a flame.
  function glow(x, cx, cy, r, rgb, a) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // Props that aren't tiles: torches, banners, tents… at tile (gx, gy).
  function drawDecor(x, z, d, ox, oy, t = 0) {
    const Z = ZONES[z];
    const px = ox + d.x * TILE, py = oy + d.y * TILE;
    const r = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(px + a, py + b, w, h); };
    switch (d.kind) {
      case 'torch': {
        r(6, 6, 4, 8, K); r(7, 7, 2, 6, '#8a5a32'); r(5, 5, 6, 2, '#40454e');
        const f = Math.floor(t * 10 + d.x) % 3;
        r(6, 1 - f % 2, 4, 5, '#ff8a2a'); r(7, 0 - f, 2, 4, '#ffd23a'); if (f === 1) r(8, -2, 1, 2, '#ffd23a');
        glow(x, px + 8, py + 3, 26, '255,170,60', 0.22);
        return;
      }
      case 'banner': {
        r(4, 0, 8, 1, '#e9b43b'); r(4, 1, 8, 26, '#a3263a'); r(4, 1, 8, 2, '#e9b43b'); r(7, 9, 2, 7, '#e9b43b'); r(6, 11, 4, 2, '#e9b43b');
        r(4, 27, 2, 3, '#a3263a'); r(10, 27, 2, 3, '#a3263a');
        return;
      }
      case 'tent': {
        x.fillStyle = K; x.beginPath(); x.moveTo(px - 2, py + 16); x.lineTo(px + 20, py - 18); x.lineTo(px + 42, py + 16); x.fill();
        x.fillStyle = '#e8dcc0'; x.beginPath(); x.moveTo(px, py + 16); x.lineTo(px + 20, py - 16); x.lineTo(px + 40, py + 16); x.fill();
        x.fillStyle = '#c9b898'; x.fillRect(px + 16, py + 2, 8, 14); r(19, -24, 2, 8, '#5b3a24'); r(21, -24, 6, 4, Z.accent);
        for (let i = 0; i < 5; i++) r(4 + i * 7, 4 + Math.abs(i - 2) * 3, 4, 1, '#d6c6a6');
        return;
      }
      case 'house': {
        // The plaster wall behind the timber frame, and a pitched roof above.
        const w = d.w * TILE;
        x.fillStyle = '#d8ccb0'; x.fillRect(px + 2, py + TILE, w - 4, TILE * 4);
        x.fillStyle = '#8a5a32'; for (let i = 0; i < d.w; i += 2) x.fillRect(px + i * TILE + 6, py + TILE, 3, TILE * 4);
        x.fillStyle = K; x.beginPath(); x.moveTo(px - 4, py + 1); x.lineTo(px + w / 2, py - 22); x.lineTo(px + w + 4, py + 1); x.fill();
        x.fillStyle = '#a3463a'; x.beginPath(); x.moveTo(px - 1, py); x.lineTo(px + w / 2, py - 20); x.lineTo(px + w + 1, py); x.fill();
        x.fillStyle = '#7e2a1c'; for (let i = 0; i < 4; i++) x.fillRect(px + w / 2 - 10 - i * 8, py - 14 + i * 4, w / 6, 1);
        x.fillStyle = '#ffe08a'; x.fillRect(px + w / 2 - 4, py - 10, 8, 6); x.fillStyle = K; x.fillRect(px + w / 2 - 1, py - 10, 1, 6);
        return;
      }
      case 'well': {
        r(0, 4, 16, 12, K); r(1, 5, 14, 10, Z.brick); r(1, 5, 14, 2, shade(Z.brick, 0.2)); r(1, -14, 2, 18, '#5e3d22'); r(13, -14, 2, 18, '#5e3d22'); r(0, -16, 16, 3, '#a3463a');
        r(7, -12, 1, 10, '#c8b898'); r(5, -3, 5, 4, '#8a5a32');
        return;
      }
      case 'slit': r(6, 2, 4, 12, K); r(7, 3, 2, 10, '#ffc44a'); return;
      case 'window': {
        r(2, 0, 12, 22, K); r(3, 1, 10, 20, '#3a66d6'); r(3, 1, 10, 4, '#e9b43b'); r(7, 5, 2, 16, '#1b1424'); r(3, 12, 10, 1, '#1b1424');
        return;
      }
      case 'chandelier': {
        r(7, 0, 2, 20, K); r(-8, 20, 32, 3, '#e9b43b'); r(-8, 23, 32, 1, '#9a7e2a');
        for (let i = 0; i < 5; i++) {
          const cx = -8 + i * 7 + 1;
          r(cx, 15, 2, 5, '#f2ecd0');
          r(cx, 12 - (Math.floor(t * 8 + i) % 2), 2, 3, '#ffd23a');
        }
        glow(x, px + 8, py + 22, 44, '255,210,120', 0.16);
        return;
      }
      case 'arch': {
        x.fillStyle = Z.brick2; x.beginPath(); x.arc(px + 8, py, 9, 0, Math.PI); x.fill();
        x.fillStyle = '#1e1626'; x.beginPath(); x.arc(px + 8, py, 5, 0, Math.PI); x.fill();
        return;
      }
      case 'gate': {
        // The raised portcullis: the arch and the teeth.
        r(-8, -16, 32, 8, Z.brick2 || '#555'); r(-8, -16, 32, 2, Z.brick);
        for (let i = 0; i < 4; i++) { r(i * 4 + 1, -8, 2, 12, '#40454e'); r(i * 4 + 1, 4, 2, 3, '#8a929c'); }
        return;
      }
      case 'flag': {
        r(2, -46, 2, 62, '#c9d1d9'); r(1, -48, 4, 2, '#e9b43b');
        const wave = Math.round(Math.sin(t * 4) * 1);
        r(4, -44, 18, 12, '#a63434'); r(22, -44 + wave, 6, 10, '#a63434'); r(8, -41, 8, 6, '#e9b43b');
        return;
      }
      case 'throne': {
        r(-4, -30, 24, 46, K); r(-3, -29, 22, 44, '#e9b43b'); r(0, -24, 16, 20, '#a3263a'); r(-3, 4, 22, 4, '#9a7e2a'); r(-4, -34, 4, 6, '#e9b43b'); r(16, -34, 4, 6, '#e9b43b');
        return;
      }
      default:
    }
  }

  // A whole level (from SiegeLevels.generate) onto a canvas that's lv.w × lv.h tiles, with the
  // heroes at the start, the enemies and cages where they'll be, and the boss in its arena.
  function drawLevel(x, lv, t = 0, opts = {}) {
    const W = lv.w * TILE, Hh = lv.h * TILE;
    drawBackdrop(x, lv.zone, W, Hh, 0, t);
    for (const d of lv.decor) if (d.kind === 'house' || d.kind === 'tent' || d.kind === 'window' || d.kind === 'banner' || d.kind === 'well') drawDecor(x, lv.zone, d, 0, 0, t);
    for (let gy = 0; gy < lv.h; gy++) for (let gx = 0; gx < lv.w; gx++) {
      const type = lv.tiles[gy * lv.w + gx];
      if (type) drawTile(x, lv.zone, type, gx * TILE, gy * TILE, gx, gy, lv.at, t);
    }
    for (const d of lv.decor) if (!(d.kind === 'house' || d.kind === 'tent' || d.kind === 'window' || d.kind === 'banner' || d.kind === 'well')) drawDecor(x, lv.zone, d, 0, 0, t);
    for (const s of lv.spawns) drawEnemy(x, s.kind, s.x * TILE + 8, (s.y + 1) * TILE, { t: t + s.x, pose: 'idle' });
    drawBoss(x, lv.boss.kind, lv.boss.x * TILE, (lv.boss.y + 1) * TILE, t, { facing: -1 });
    (opts.heroes || HEROES).forEach((h, i) => drawFigure(x, h, lv.start.x * TILE + i * 14 - 6, (lv.start.y + 1) * TILE, { pose: 'idle' }));
  }

  root.SiegeArt = {
    K, TILE, HEROES, WEAPONS, ENEMIES, BOSSES, ZONES, PEASANT,
    canvas, fromMap, outline, shade, hash, line,
    drawFigure, drawWeapon, drawEnemy, drawHound, drawPeasant, drawBoss, drawTile, drawBricks, drawBackdrop, drawDecor, drawLevel, drawKeepSilhouette,
  };
})(typeof window !== 'undefined' ? window : this);
