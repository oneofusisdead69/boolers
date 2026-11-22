// Shooting Gallery: phones are light guns. Everyone aims at the shared screen (the TV, or their
// own phone without one) by turning their phone, and shoots what pops up: rounds on the clock,
// most points wins. Points only, no sips.
//
// Aiming happens on the phone: it turns the phone's orientation into a spot on the screen, from a
// two-point calibration it keeps to itself (public/games/shootingGallery.js). It streams that spot
// here (`aim`, 20-30 times a second, never broadcast), and every tick the server sends all the
// crosshairs to every screen in one ctx.signal('gallery'). A shot is `{ type: 'shoot', x, y, t }`:
// where the shooter's crosshair was, at the gallery time their screen was showing, so their lag
// doesn't count against them (t is held to the last LAG_MAX seconds).
//
// The targets are the server's. Each one moves on a fixed path, a function of time and its own
// numbers (see posAt, the same on every screen), and goes out once, in the tick it's spawned
// (a moment before it shows), so screens animate them without being sent where they are. The
// spawner is seeded, so a round's targets are the same however the ticks fall.
//
// Bots aim inside the tick (their crosshair eases toward a target, quicker and steadier the
// better the bot, and goes out with everyone's), and shoot through bot(), on the clock.

const { clamp } = require('../lib/random');
const { optionValues } = require('../lib/options');
const { LEVELS } = require('../lib/bots');

const TICK_MS = 50;
const DT = TICK_MS / 1000;
const COUNT_MS = 1000;
const ASPECT = 16 / 9; // the gallery's shape: x and y run 0..1 across and down it
const LEAD = 0.6; // targets go out this long before they show
const LAG_MAX = 0.45; // how far back a shot's time may be
const SLACK = 0.012; // a little give round every target (screen heights)

// ---------- What there is to shoot ----------
// r: hit radius (screen heights), pts: points (bad: points lost). The screens draw each kind.
const KINDS = {
  can: { r: 0.054, pts: 10 },
  bottle: { r: 0.061, pts: 10 },
  duckCut: { r: 0.074, pts: 15 },
  bullseye: { r: 0.081, pts: 20 },
  clay: { r: 0.043, pts: 25 },
  star: { r: 0.041, pts: 50, gold: true },
  bystander: { r: 0.088, pts: 25, bad: true },
  barrel: { r: 0.074, pts: 10 },
  gull: { r: 0.061, pts: 25 },
  tentacle: { r: 0.081, pts: 30 },
  asteroid: { r: 0.068, pts: 20 },
  ufo: { r: 0.061, pts: 25 },
  ghost: { r: 0.074, pts: 15 },
  pumpkin: { r: 0.068, pts: 10 },
  bat: { r: 0.047, pts: 25 },
  cat: { r: 0.074, pts: 25, bad: true },
  bauble: { r: 0.054, pts: 10 },
  present: { r: 0.068, pts: 10 },
  snowman: { r: 0.081, pts: 15 },
  sign: { r: 0.081, pts: 20 },
  coconut: { r: 0.054, pts: 10 },
  tikiMask: { r: 0.074, pts: 15 },
  parrot: { r: 0.054, pts: 25 },
  shield: { r: 0.074, pts: 15 },
  crow: { r: 0.054, pts: 25 },
  disco: { r: 0.068, pts: 20 },
  record: { r: 0.074, pts: 20 },
  cocktail: { r: 0.061, pts: 10 },
  chip: { r: 0.061, pts: 20 },
  dice: { r: 0.054, pts: 10 },
  stein: { r: 0.068, pts: 10 },
  pretzel: { r: 0.061, pts: 15 },
  buoy: { r: 0.068, pts: 15 },
  grapes: { r: 0.061, pts: 10 },
  cup: { r: 0.054, pts: 10 },
  hubcap: { r: 0.074, pts: 20 },
  oilcan: { r: 0.061, pts: 10 },
  champagne: { r: 0.061, pts: 10 },
  donut: { r: 0.061, pts: 15 },
  tankard: { r: 0.061, pts: 10 },
  duck: { r: 0.068, pts: 25 },
  duckSwim: { r: 0.068, pts: 15 },
  goldDuck: { r: 0.054, pts: 50, gold: true },
  swan: { r: 0.088, pts: 25, bad: true },
};

// Each venue's gallery: what rides the rails, sits on the shelf, flies across, spins up top, the
// rare gold one and the one not to shoot. `fall` is how hard flyers fall (0 in space). `swing`:
// a thing on a pendulum (a sign, a tentacle rising out of the sea).
const SETS = {
  classic: { rail: ['duckCut', 'duckCut', 'bullseye'], shelf: ['can', 'bottle', 'can'], fly: ['clay'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  dive: { rail: ['duckCut', 'can'], shelf: ['bottle', 'can', 'bottle'], fly: ['clay'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  tavern: { rail: ['tankard', 'shield'], shelf: ['tankard', 'bottle'], fly: ['crow'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  club: { rail: ['cocktail', 'record'], shelf: ['cocktail', 'bottle'], fly: ['clay'], spin: ['disco'], gold: 'star', bad: 'bystander' },
  castle: { rail: ['shield', 'shield', 'bullseye'], shelf: ['tankard', 'bottle'], fly: ['crow'], spin: ['shield'], gold: 'star', bad: 'bystander' },
  jazz: { rail: ['record', 'cocktail'], shelf: ['bottle', 'cocktail'], fly: ['clay'], spin: ['record'], gold: 'star', bad: 'bystander' },
  diner: { rail: ['donut', 'duckCut'], shelf: ['cup', 'can', 'bottle'], fly: ['donut'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  tiki: { rail: ['tikiMask', 'coconut'], shelf: ['coconut', 'cocktail'], fly: ['parrot'], spin: ['tikiMask'], gold: 'star', bad: 'bystander' },
  speakeasy: { rail: ['bottle', 'record'], shelf: ['bottle', 'cocktail', 'bottle'], fly: ['clay'], spin: ['record'], gold: 'star', bad: 'bystander' },
  casino: { rail: ['chip', 'dice'], shelf: ['dice', 'cocktail'], fly: ['chip'], spin: ['chip'], gold: 'star', bad: 'bystander' },
  saloon: { rail: ['bottle', 'can', 'duckCut'], shelf: ['bottle', 'can', 'bottle'], fly: ['clay'], spin: ['bullseye'], swing: 'sign', gold: 'star', bad: 'bystander' },
  pirate: { rail: ['barrel', 'bottle'], shelf: ['bottle', 'barrel'], fly: ['gull'], spin: ['bullseye'], swing: 'tentacle', gold: 'star', bad: 'bystander' },
  beerhall: { rail: ['stein', 'pretzel'], shelf: ['stein', 'bottle'], fly: ['pretzel'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  space: { rail: ['ufo', 'asteroid'], shelf: ['can', 'cocktail'], fly: ['asteroid', 'asteroid', 'ufo'], spin: ['asteroid'], gold: 'star', bad: 'bystander', fall: 0 },
  lighthouse: { rail: ['buoy', 'barrel'], shelf: ['bottle', 'can'], fly: ['gull'], spin: ['buoy'], gold: 'star', bad: 'bystander' },
  vineyard: { rail: ['grapes', 'bottle'], shelf: ['bottle', 'grapes'], fly: ['clay'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  frat: { rail: ['cup', 'can'], shelf: ['cup', 'can', 'cup'], fly: ['cup'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  garage: { rail: ['hubcap', 'oilcan'], shelf: ['oilcan', 'can'], fly: ['clay'], spin: ['hubcap'], gold: 'star', bad: 'bystander' },
  chateau: { rail: ['champagne', 'grapes'], shelf: ['champagne', 'bottle'], fly: ['clay'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  christmas: { rail: ['present', 'snowman'], shelf: ['bauble', 'present', 'bauble'], fly: ['bauble'], spin: ['bauble'], gold: 'star', bad: 'bystander' },
  halloween: { rail: ['pumpkin', 'ghost'], shelf: ['pumpkin', 'bottle'], fly: ['bat', 'bat', 'ghost'], spin: ['pumpkin'], gold: 'star', bad: 'cat' },
  stpatricks: { rail: ['tankard', 'duckCut'], shelf: ['tankard', 'bottle'], fly: ['crow'], spin: ['bullseye'], gold: 'star', bad: 'bystander' },
  // The easter egg (EGGS in lib/roomStyles.js: 'stpatricks:shootingGallery'): a reedy pond at
  // dawn. Ducks swim across the water and flap up out of the reeds; a rare golden one; leave the
  // swan alone. No rails, no shelf: it's all water.
  duckPond: { pond: true, rail: ['duckSwim'], shelf: [], fly: ['duck'], spin: [], gold: 'goldDuck', bad: 'swan', fall: 0.22 },
};
// The Highlands pub (St Patrick's, as it began) has the duck pond out the back.
const POND_ROOM = 'stpatricks';
const setIdOf = (room) => (room.style === POND_ROOM ? 'duckPond' : SETS[room.style] ? room.style : 'classic');

// ---------- Guns ----------
// Every venue has its own house gun, and that's what everyone shoots with there (each has its
// own look and sound: public/games/shootingGallery.js). Purely for show: every gun shoots the
// same. Players pick its finish, a second (accent) colour and their crosshair.
// (Possible later: collect guns across venues.)
const GUNS = {
  classic: 'corkRifle', dive: 'tapPistol', tavern: 'musket', club: 'neonLaser', castle: 'crossbow', jazz: 'trumpetBuss',
  diner: 'ketchup', tiki: 'blowpipe', speakeasy: 'drumRepeater', casino: 'derringer', saloon: 'sixShooter', pirate: 'flintlock',
  beerhall: 'corkPopper', space: 'rayGun', lighthouse: 'flarePistol', vineyard: 'slingshot', frat: 'foamBlaster', garage: 'nailGun',
  chateau: 'duelPistol', christmas: 'candyPopgun', halloween: 'pumpkinBlaster', stpatricks: 'stalkingRifle', duckPond: 'sideBySide',
};
// How each fires (the same for everyone in a venue, so it's fair; across venues roughly even):
// ms between shots, rounds in the magazine, ms to reload (tilt the phone up), and `spread`: extra
// reach round its shot (screen heights), so a one-shot blunderbuss is forgiving and a nail gun's
// many small nails need to be on the money.
const GUN_STATS = {
  corkRifle: { rate: 350, mag: 5, reload: 1200, spread: 0.005 },
  tapPistol: { rate: 250, mag: 6, reload: 1200, spread: 0 },
  musket: { rate: 400, mag: 1, reload: 1000, spread: 0.03 },
  neonLaser: { rate: 180, mag: 10, reload: 1400, spread: 0 },
  crossbow: { rate: 400, mag: 1, reload: 900, spread: 0.02 },
  trumpetBuss: { rate: 400, mag: 1, reload: 1100, spread: 0.04 },
  ketchup: { rate: 160, mag: 12, reload: 1500, spread: -0.004 },
  blowpipe: { rate: 400, mag: 1, reload: 700, spread: 0.012 },
  drumRepeater: { rate: 140, mag: 16, reload: 1700, spread: -0.006 },
  derringer: { rate: 200, mag: 2, reload: 900, spread: 0.01 },
  sixShooter: { rate: 220, mag: 6, reload: 1300, spread: 0 },
  flintlock: { rate: 400, mag: 1, reload: 1000, spread: 0.03 },
  corkPopper: { rate: 350, mag: 4, reload: 1000, spread: 0.008 },
  rayGun: { rate: 300, mag: 8, reload: 1400, spread: 0.008 },
  flarePistol: { rate: 400, mag: 1, reload: 900, spread: 0.03 },
  slingshot: { rate: 400, mag: 1, reload: 700, spread: 0.014 },
  foamBlaster: { rate: 220, mag: 8, reload: 1300, spread: 0 },
  nailGun: { rate: 120, mag: 20, reload: 1600, spread: -0.008 },
  duelPistol: { rate: 400, mag: 1, reload: 900, spread: 0.025 },
  candyPopgun: { rate: 300, mag: 5, reload: 1100, spread: 0.005 },
  pumpkinBlaster: { rate: 500, mag: 3, reload: 1300, spread: 0.025 },
  stalkingRifle: { rate: 600, mag: 4, reload: 1300, spread: 0.004 },
  sideBySide: { rate: 300, mag: 2, reload: 1300, spread: 0.03 },
};
const FINISHES = ['#3a3f47', '#23324a', '#c9a24a', '#c8ccd2', '#e3b23c', '#8a5a2e', '#c8302f', '#5ad8a6', '#ff6ab4', '#f4f4f4', '#1e1e22', '#7a4ad8', '#2a8af0', '#ff8a1f'];
// Crosshairs: the classic cross, a red dot, a holographic circle-dot, a hunting scope's duplex, a
// sniper's mil-dot, a chevron (aim with its tip), a T and an old scope's ring-and-cross.
const SIGHTS = ['cross', 'dot', 'holo', 'duplex', 'mildot', 'chevron', 'tcross', 'scope'];
// A gun as a phone sent it, cleaned (null finish or accent: the gun's own colours).
function gunLook(a = {}) {
  return {
    finish: FINISHES.includes(a.finish) ? a.finish : null,
    accent: FINISHES.includes(a.accent) ? a.accent : null,
    sight: SIGHTS.includes(a.sight) ? a.sight : 'cross',
    bold: a.bold !== false && a.bold !== 'false', // a bold line (or thin)
    pip: a.pip === true || a.pip === 'true', // a dot in the middle too
  };
}

// ---------- Crosshair colours ----------
// Everyone's crosshair is told apart by its colour alone, so no two in a game share one: each
// player gets one of these (as many as a room has players), their own colour's nearest if it's
// free and close, else the first free one, in the order they joined. Kept for the whole game.
const SIGHT_COLORS = [
  ['Red', '#ff3b30'], ['Orange', '#ff8c1a'], ['Yellow', '#ffe14d'], ['Lime', '#8cff3a'], ['Cyan', '#2ee6ff'], ['Blue', '#3a6bff'],
  ['Purple', '#a04dff'], ['Magenta', '#ff3ad8'], ['White', '#ffffff'], ['Black', '#111111'], ['Pink', '#ffa6c9'], ['Teal', '#14a88f'],
  ['Brown', '#9a5a2a'], ['Lavender', '#c8b0ff'], ['Olive', '#8a9a2a'], ['Grey', '#8a8f98'],
];
const rgbOf = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
function assignColor(g, player) {
  if (g.colors[player.id] != null) return;
  const taken = new Set(Object.values(g.colors));
  const own = rgbOf(player.color);
  let pick = -1;
  if (own) {
    let best = Infinity;
    SIGHT_COLORS.forEach(([, hex], i) => {
      const c = rgbOf(hex);
      const d = Math.hypot(c[0] - own[0], c[1] - own[1], c[2] - own[2]);
      if (!taken.has(i) && d < best && d < 130) { best = d; pick = i; }
    });
  }
  if (pick < 0) pick = SIGHT_COLORS.findIndex((_, i) => !taken.has(i));
  // (More players than colours: round again.)
  if (pick < 0) pick = Object.keys(g.colors).length % SIGHT_COLORS.length;
  g.colors[player.id] = pick;
}

// ---------- The gallery's layout ----------
const RAILS = [{ y: 0.33, dir: 1 }, { y: 0.53, dir: -1 }, { y: 0.73, dir: 1 }];
const POND_LANES = [{ y: 0.72, dir: 1 }, { y: 0.84, dir: -1 }];
const SHELF_Y = 0.9;
const SHELF_SLOTS = [0.12, 0.23, 0.34, 0.45, 0.56, 0.67, 0.78, 0.89];
const SHELF_MAX = 4;
// What's drawn over what (and so what a shot hits first, where two overlap).
// (Each rail is its own layer, front to back: a target's `lane`.)
const Z = { shelf: 1, rail: 2, swing: 3, spin: 4, fly: 5, gold: 6 };

// A small seeded random number generator (mulberry32): its state is a number in room.game.
function rnd(g) {
  let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickR = (g, list) => list[Math.floor(rnd(g) * list.length)];

// Where a target is at gallery time t: the same function on the server and every screen
// (public/games/shootingGallery.js has a copy). `out` is filled in and returned.
function posAt(tg, t, out = { x: 0, y: 0 }) {
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
      // Up from behind the counter, a while there, then back down.
      const up = clamp(Math.min(d, tg.life - d) / 0.25, 0, 1);
      out.x = tg.x;
      out.y = tg.y + tg.a * (1 - up);
      break;
    }
    case 'swing': {
      // On a pendulum from (x, y), `l` long; a rising one (the tentacle) comes up first.
      const th = tg.a * Math.sin(tg.w * d + tg.ph);
      const up = tg.vy ? clamp(Math.min(d, tg.life - d) / 0.6, 0, 1) : 1;
      out.x = tg.x + Math.sin(th) * tg.l;
      out.y = tg.y + Math.cos(th) * tg.l * (tg.vy ? -1 : 1) + tg.vy * (1 - up);
      break;
    }
    case 'orbit':
    default:
      out.x = tg.x + tg.a * Math.cos(tg.w * d + tg.ph);
      out.y = tg.y + tg.a * 0.6 * Math.sin(tg.w * d + tg.ph);
      break;
  }
  return out;
}

const alive = (tg, t) => !tg.hit && t >= tg.t0 && t <= tg.t0 + tg.life;

function newTarget(g, role, kind, fields) {
  const k = KINDS[kind];
  const tg = { id: ++g.nextId, k: kind, z: Z[role], lane: -1, r: k.r, pts: k.pts, ...(k.bad ? { bad: 1 } : {}), ...(k.gold ? { gold: 1 } : {}), a: 0, w: 0, ph: 0, vx: 0, vy: 0, g: 0, l: 0, ...fields };
  for (const key of ['x', 'y', 'vx', 'vy', 'g', 'a', 'w', 'ph', 'l', 'life', 't0']) tg[key] = Math.round(tg[key] * 1e4) / 1e4;
  g.live.push(tg);
  g.fresh.push(tg);
  return tg;
}

// The spawner: each kind of slot comes round on its own clock. Everything's from the seed.
function spawn(g, upTo) {
  const set = SETS[g.set];
  const s = g.spawn;
  const lanes = set.pond ? POND_LANES : RAILS;
  const badOdds = 0.16;
  lanes.forEach((lane, i) => {
    while (s.rail[i] <= upTo) {
      const t0 = s.rail[i];
      const bad = rnd(g) < badOdds;
      const kind = bad ? set.bad : pickR(g, set.rail);
      const speed = (set.pond ? 0.07 + rnd(g) * 0.05 : 0.09 + rnd(g) * 0.06) * lane.dir;
      const r = KINDS[kind].r;
      newTarget(g, 'rail', kind, { p: 'rail', lane: i, z: 2 + i * 0.1, t0, x: lane.dir > 0 ? -0.08 : 1.08, y: lane.y - r * 0.9, vx: speed, a: set.pond ? 0.005 : 0.004, w: set.pond ? 2.2 : 7, ph: rnd(g) * 6.28, life: 1.2 / Math.abs(speed) });
      s.rail[i] = t0 + (set.pond ? 1.8 : 1.5) + rnd(g) * 1.2;
    }
  });
  while (set.shelf.length && s.shelf <= upTo) {
    const t0 = s.shelf;
    const busy = g.live.filter((tg) => tg.p === 'pop' && tg.t0 + tg.life > t0).map((tg) => tg.x);
    const free = SHELF_SLOTS.filter((x) => !busy.includes(x));
    if (busy.length < SHELF_MAX && free.length) {
      const kind = rnd(g) < badOdds ? set.bad : pickR(g, set.shelf);
      const r = KINDS[kind].r;
      newTarget(g, 'shelf', kind, { p: 'pop', t0, x: pickR(g, free), y: SHELF_Y - r, a: r * 2.4, life: 3 + rnd(g) * 3 });
    }
    s.shelf = t0 + 0.6 + rnd(g) * 0.9;
  }
  while (s.fly <= upTo) {
    const t0 = s.fly;
    const left = rnd(g) < 0.5;
    const kind = pickR(g, set.fly);
    const fall = set.fall ?? 0.55;
    if (set.pond) {
      // Up out of the reeds along the bottom, flapping off over the top or away to a side.
      const vx = (0.08 + rnd(g) * 0.16) * (left ? 1 : -1);
      newTarget(g, 'fly', kind, { p: 'arc', t0, x: left ? 0.1 + rnd(g) * 0.35 : 0.55 + rnd(g) * 0.35, y: 0.92, vx, vy: -(0.32 + rnd(g) * 0.14), g: fall * 0.5, life: 3.6 });
    } else if (!fall) {
      // Drifting straight across (space).
      const vx = (0.09 + rnd(g) * 0.07) * (left ? 1 : -1);
      newTarget(g, 'fly', kind, { p: 'arc', t0, x: left ? -0.06 : 1.06, y: 0.12 + rnd(g) * 0.5, vx, vy: (rnd(g) - 0.5) * 0.06, life: 1.14 / Math.abs(vx) });
    } else {
      // Thrown up from low at one side, in an arc across.
      const vx = (0.26 + rnd(g) * 0.14) * (left ? 1 : -1);
      newTarget(g, 'fly', kind, { p: 'arc', t0, x: left ? -0.04 : 1.04, y: 0.7 + rnd(g) * 0.12, vx, vy: -(0.62 + rnd(g) * 0.18), g: fall * 1.6, life: 1.1 / Math.abs(vx) });
    }
    s.fly = t0 + (set.pond ? 0.9 : 1.6) + rnd(g) * (set.pond ? 1.1 : 1.6);
  }
  while (set.spin.length && s.spin <= upTo) {
    const t0 = s.spin;
    newTarget(g, 'spin', pickR(g, set.spin), { p: 'orbit', t0, x: 0.2 + rnd(g) * 0.6, y: 0.16, a: 0.03, w: 1.6, ph: rnd(g) * 6.28, life: 5 + rnd(g) * 2 });
    s.spin = t0 + 7 + rnd(g) * 3;
  }
  while (set.swing && s.swing <= upTo) {
    const t0 = s.swing;
    const rising = set.swing === 'tentacle';
    newTarget(g, 'swing', set.swing, rising
      ? { p: 'swing', t0, x: 0.15 + rnd(g) * 0.7, y: 1.02, l: 0.3, a: 0.35, w: 1.8, ph: rnd(g) * 6.28, vy: 0.4, life: 4.5 }
      : { p: 'swing', t0, x: 0.2 + rnd(g) * 0.6, y: -0.02, l: 0.24, a: 0.6, w: 2.1, ph: rnd(g) * 6.28, life: 6 });
    s.swing = t0 + 9 + rnd(g) * 5;
  }
  while (s.gold <= upTo) {
    const t0 = s.gold;
    const left = rnd(g) < 0.5;
    const vx = (set.pond ? 0.3 : 0.38) * (left ? 1 : -1);
    newTarget(g, 'gold', set.gold, { p: 'rail', t0, x: left ? -0.05 : 1.05, y: 0.08 + rnd(g) * 0.1, vx, a: 0.025, w: 5, ph: rnd(g) * 6.28, life: 1.1 / Math.abs(vx) });
    s.gold = t0 + 9 + rnd(g) * 6;
  }
}

// What a shot at (x, y) at time t hits: the target on top, then the nearest. Null for a miss.
const tmp = { x: 0, y: 0 };
function hitTest(g, x, y, t, spread = 0) {
  let best = null;
  let bestZ = -1;
  let bestD = Infinity;
  for (const tg of g.live) {
    if (!alive(tg, t)) continue;
    posAt(tg, t, tmp);
    const d = Math.hypot((tmp.x - x) * ASPECT, tmp.y - y) / (tg.r + SLACK + spread);
    if (d > 1) continue;
    if (tg.z > bestZ || (tg.z === bestZ && d < bestD)) { best = tg; bestZ = tg.z; bestD = d; }
  }
  return best;
}

// ---------- The game ----------

const active = (room) => room.players.filter((p) => p.connected);

// Between rounds (and while everyone calibrates) the crosshairs still go out, ten times a
// second, so everyone can see theirs follow their phone. (t: -1, not a round's time.)
function relay(room, ctx) {
  const g = room.game;
  if (g.phase !== 'calibrate' && g.phase !== 'roundEnd') return undefined;
  ctx.signal(room, 'gallery', { r: g.round, t: -1, a: snapshot(g).a });
  ctx.setTimer(room, 100, () => relay(room, ctx));
  return 'quiet';
}

function stat(g, id) {
  return (g.stats[id] ||= { score: 0, round: 0, hits: 0, shots: 0, roundHits: 0, roundShots: 0, streak: 0, best: 0, bad: 0 });
}

function startCountdown(room, ctx) {
  const g = room.game;
  g.phase = 'countdown';
  g.count = 3;
  g.round += 1;
  ctx.setTimer(room, COUNT_MS, () => countdown(room, ctx));
}

function countdown(room, ctx) {
  const g = room.game;
  g.count -= 1;
  if (g.count > 0) return ctx.setTimer(room, COUNT_MS, () => countdown(room, ctx));
  g.phase = 'round';
  g.t = 0;
  g.live = [];
  g.fresh = [];
  g.shots = [];
  g.rng = (g.seed + g.round * 7919) >>> 0;
  g.spawn = { rail: [0.2, 1.1, 0.6], shelf: 0.4, fly: 2.5, spin: 1.5, swing: 5, gold: 8 + rnd(g) * 6 };
  for (const id of g.order) {
    const st = stat(g, id);
    st.round = 0;
    st.roundHits = 0;
    st.roundShots = 0;
    st.streak = 0;
  }
  g.ammo = {};
  g.reloading = {};
  g.lastShot = {};
  g.clock = Date.now() + TICK_MS;
  spawn(g, LEAD);
  ctx.log(room, `🎯 Round ${g.round} of ${g.rounds}: ${g.length} seconds. Fire away!`);
  ctx.setTimer(room, TICK_MS, () => tick(room, ctx));
  return undefined;
}

// Every screen, once a tick: [x, y] for each player in g.order (-9 for none yet), new targets,
// the shots since last time ([player index, x, y, target id or 0, points]) and, after any shot,
// the round's scores.
function snapshot(g) {
  const a = [];
  for (const id of g.order) {
    const p = g.aims[id];
    if (p) a.push(Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000);
    else a.push(-9, -9);
  }
  const out = { r: g.round, t: Math.round(g.t * 1000) / 1000, a, m: g.order.map((id) => ammo(g, id)) };
  if (g.fresh.length) out.n = g.fresh;
  if (g.shots.length) {
    out.f = g.shots;
    out.s = g.order.map((id) => stat(g, id).round);
  }
  return out;
}

function tick(room, ctx) {
  const g = room.game;
  if (g.phase !== 'round') return undefined;
  const now = Date.now();
  const due = Math.floor((now - g.clock) / TICK_MS) + 1;
  const steps = clamp(due, 1, 3);
  g.clock = due > 3 ? now + TICK_MS : g.clock + steps * TICK_MS;
  for (let n = 0; n < steps; n++) {
    g.t += DT;
    botsAim(room, g);
  }
  spawn(g, g.t + LEAD);
  // (A target stays known a little past its end, for a late shot's time.)
  g.live = g.live.filter((tg) => g.t < tg.t0 + tg.life + LAG_MAX);
  ctx.signal(room, 'gallery', snapshot(g));
  g.fresh = [];
  g.shots = [];
  if (g.t >= g.length) {
    endRound(room, ctx);
    return undefined;
  }
  ctx.setTimer(room, Math.max(0, g.clock - Date.now()), () => tick(room, ctx));
  return 'quiet';
}

function endRound(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.live = [];
  g.fresh = [];
  const ids = g.order.filter((id) => ctx.player(room, id));
  const ranked = ids.slice().sort((a, b) => stat(g, b).round - stat(g, a).round);
  g.result = {
    round: g.round,
    rows: ranked.map((id) => {
      const st = stat(g, id);
      return { id, points: st.round, hits: st.roundHits, shots: st.roundShots, total: st.score };
    }),
  };
  const top = ranked[0];
  if (top) ctx.log(room, `🏅 ${ctx.name(room, top)} tops round ${g.round} with ${stat(g, top).round} points`);
  if (g.round >= g.rounds) {
    const best = ids.slice().sort((a, b) => stat(g, b).score - stat(g, a).score)[0];
    g.winnerId = best || null;
    g.phase = 'over';
    if (best) {
      ctx.log(room, `🏆 ${ctx.name(room, best)} wins the Shooting Gallery with ${stat(g, best).score} points!`);
      ctx.highlight(room, 'galleryBest', best, stat(g, best).score, `🎯 ${ctx.name(room, best)} scored ${stat(g, best).score} at the Shooting Gallery`);
    }
  } else {
    g.phase = 'roundEnd';
    ctx.setTimer(room, 100, () => relay(room, ctx));
  }
}

// ---------- Bots ----------
// Inside the tick: each bot's crosshair eases toward the target it's after (or drifts about the
// middle with none), quicker and steadier the better the bot. bot() shoots when it's on.
const skillOf = (p) => LEVELS[p.bot]?.skill ?? 0.6;
function botsAim(room, g) {
  for (const p of room.players) {
    if (!p.bot || !p.connected) continue;
    const skill = skillOf(p);
    const b = (g.bots[p.id] ||= { x: 0.5, y: 0.5, target: 0, ready: 0 });
    let tg = b.target && g.live.find((x) => x.id === b.target);
    if (tg && !alive(tg, g.t)) tg = null;
    if (tg) {
      posAt(tg, g.t, tmp);
      if (tmp.x < -0.02 || tmp.x > 1.02 || tmp.y < -0.02 || tmp.y > 1.02) tg = null;
    }
    if (!tg) {
      // The nearest worth having (a bad bot now and then goes for one it shouldn't).
      let best = null;
      let bestD = Infinity;
      const careless = Math.random() < (1 - skill) * 0.12;
      for (const x of g.live) {
        if (!alive(x, g.t) || (x.bad && !careless)) continue;
        posAt(x, g.t, tmp);
        if (tmp.x < 0.04 || tmp.x > 0.96 || tmp.y < 0.03 || tmp.y > 0.97) continue;
        const d = Math.hypot((tmp.x - b.x) * ASPECT, tmp.y - b.y) - (x.gold ? 0.3 : 0);
        if (d < bestD) { best = x; bestD = d; }
      }
      b.target = best ? best.id : 0;
      b.ready = g.t + 0.45 + (1 - skill) * 0.8 + Math.random() * 0.4;
      tg = best;
    }
    const wobble = 0.004 + (1 - skill) * 0.02;
    if (tg) {
      posAt(tg, g.t + 0.1 * skill, tmp); // (a good one leads a moving target)
      const k = 1 - Math.exp(-(1.8 + 5 * skill) * DT);
      b.x += (tmp.x - b.x) * k + (Math.random() - 0.5) * wobble;
      b.y += (tmp.y - b.y) * k + (Math.random() - 0.5) * wobble;
    } else {
      b.x += (0.5 - b.x) * 0.02 + (Math.random() - 0.5) * wobble;
      b.y += (0.5 - b.y) * 0.02 + (Math.random() - 0.5) * wobble;
    }
    g.aims[p.id] = [clamp(b.x, -0.1, 1.1), clamp(b.y, -0.1, 1.1)];
  }
}

// The gun everyone has here, and how it fires.
const gunHere = (g) => GUNS[g.set] || GUNS.classic;
const statsHere = (g) => GUN_STATS[gunHere(g)];
// Rounds left in someone's gun (a reload that's done fills it). -1 while reloading.
function ammo(g, id) {
  const r = g.reloading[id];
  if (r != null) {
    if (g.t < r - 1e-6) return -1;
    delete g.reloading[id];
    g.ammo[id] = statsHere(g).mag;
  }
  return (g.ammo[id] ??= statsHere(g).mag);
}
// Whether this gun can fire now (loaded, not reloading, and its rate allows).
function ready(g, id) {
  return ammo(g, id) > 0 && g.t - (g.lastShot[id] ?? -9) >= statsHere(g).rate / 1000 - 1e-6;
}
function reload(g, id) {
  const left = ammo(g, id);
  if (left < 0 || left >= statsHere(g).mag) return false;
  g.reloading[id] = g.t + statsHere(g).reload / 1000;
  g.ammo[id] = 0;
  return true;
}

function shoot(room, ctx, id, x, y, t) {
  const g = room.game;
  const st = stat(g, id);
  if (!ready(g, id)) return false;
  g.lastShot[id] = g.t;
  g.ammo[id] -= 1;
  st.shots += 1;
  st.roundShots += 1;
  const tg = hitTest(g, x, y, t, statsHere(g).spread);
  let pts = 0;
  if (tg) {
    tg.hit = id;
    if (tg.bad) {
      pts = -tg.pts;
      st.streak = 0;
      st.bad += 1;
    } else {
      pts = tg.pts + Math.min(5, st.streak);
      st.streak += 1;
      st.hits += 1;
      st.roundHits += 1;
      st.best = Math.max(st.best, st.streak);
    }
    st.score += pts;
    st.round += pts;
  } else {
    st.streak = 0;
  }
  const i = g.order.indexOf(id);
  g.shots.push([i, Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, tg ? tg.id : 0, pts]);
  return true;
}

module.exports = {
  id: 'shootingGallery',
  name: 'Shooting Gallery',
  description: '🔫 Your phone is a light gun: aim it at the TV and shoot the targets, all at once. Most points wins.',
  rules: [
    'First, calibrate: point your phone at the dot in the middle, tap, then at the top-right corner, tap.',
    'Hold your phone sideways like a pistol, top edge at the TV. Tap the gun to fire.',
    'Out of ammo? Tip the phone up (muzzle to the ceiling) to reload.',
    'Gold targets are worth 50. Hit a few in a row for a bonus.',
    'Don’t shoot the cut-outs that say so: they cost you points.',
    'Most points after the last round wins.',
  ],
  minPlayers: 1,
  bestWithTv: true,
  order: 10.5,
  menu: 'notBool', // in the (Not) Bool Games menu: points only, nothing to drink
  lobbyPanel: true, // the lobby shows your gun to set up (public/games/shootingGallery.js lobby())
  options: [
    { id: 'length', label: 'Round length', default: 60, choices: [45, 60, 90].map((n) => ({ value: n, label: `${n} s` })) },
    { id: 'rounds', label: 'Rounds', default: 3, choices: [1, 3, 5].map((n) => ({ value: n, label: `${n}` })) },
  ],

  start(room, ctx, options = {}) {
    const o = optionValues(module.exports.options, options);
    Object.assign(room.game, {
      ...o, // length, rounds
      order: room.players.map((p) => p.id),
      set: setIdOf(room),
      seed: Math.floor(Math.random() * 2 ** 31),
      rng: 0,
      round: 0,
      t: 0,
      count: 0,
      phase: 'calibrate',
      cal: {}, // id -> true once calibrated
      calStep: {}, // id -> 1 or 2 while calibrating (so the TV shows the dot)
      aims: {}, // id -> [x, y]
      guns: {}, // id -> gunLook
      colors: {}, // id -> their crosshair colour (an index into SIGHT_COLORS)
      stats: {},
      lastShot: {},
      ammo: {},
      reloading: {},
      bots: {},
      live: [],
      fresh: [],
      shots: [],
      nextId: 0,
      spawn: null,
      result: null,
      winnerId: null,
    });
    for (const id of room.game.order) stat(room.game, id);
    for (const p of room.players) assignColor(room.game, p);
    ctx.setTimer(room, 100, () => relay(room, ctx));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const host = me === room.hostId;
    const type = action.type;

    if (type === 'aim') {
      const x = Number(action.x);
      const y = Number(action.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 'quiet';
      g.aims[me] = [clamp(x, -0.15, 1.15), clamp(y, -0.15, 1.15)];
      return 'quiet';
    }
    if (type === 'shoot') {
      if (g.phase !== 'round') return 'quiet';
      const x = Number(action.x);
      const y = Number(action.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 'quiet';
      const at = Number(action.t);
      const t = clamp(Number.isFinite(at) ? at : g.t, g.t - LAG_MAX, g.t);
      shoot(room, ctx, me, clamp(x, -0.2, 1.2), clamp(y, -0.2, 1.2), t);
      return 'quiet';
    }
    if (type === 'reload') {
      if (g.phase === 'round' || g.phase === 'countdown') reload(g, me);
      return 'quiet';
    }
    if (type === 'gun') {
      g.guns[me] = gunLook(action);
      return undefined;
    }
    if (type === 'calib') {
      // Where someone is in calibrating (1: the middle, 2: the corner, 0: done or stopped), so the
      // TV can show them the dot.
      const step = Number(action.step);
      if (step === 1 || step === 2) g.calStep[me] = step;
      else delete g.calStep[me];
      return undefined;
    }
    if (type === 'calibrated') {
      delete g.calStep[me];
      if (g.cal[me]) return undefined;
      g.cal[me] = true;
      if (g.phase === 'calibrate' && active(room).every((p) => g.cal[p.id])) startCountdown(room, ctx);
      return undefined;
    }
    if (type === 'start' && host && g.phase === 'calibrate') {
      startCountdown(room, ctx);
      return undefined;
    }
    if (type === 'nextRound' && host && g.phase === 'roundEnd') {
      startCountdown(room, ctx);
      return undefined;
    }
    return 'quiet';
  },

  bot(room, me, ctx, skill) {
    const g = room.game;
    if (g.phase === 'calibrate') return g.cal[me.id] ? null : { type: 'calibrated' };
    if (g.phase === 'roundEnd') return room.hostId === me.id ? { type: 'nextRound' } : null;
    if (g.phase !== 'round') return null;
    // On the clock: look again in a moment, or shoot if it's on a target and ready.
    const later = { type: '_wait', delay: 90 + Math.random() * 60 };
    // Empty: tilt up and reload (a bad bot takes a moment to notice).
    if (ammo(g, me.id) === 0) return { type: 'reload', delay: 150 + (1 - skill) * 500 };
    const b = g.bots[me.id];
    if (!b || !b.target || g.t < b.ready || !ready(g, me.id)) return later;
    const tg = g.live.find((x) => x.id === b.target);
    if (!tg || !alive(tg, g.t)) return later;
    posAt(tg, g.t, tmp);
    const d = Math.hypot((tmp.x - b.x) * ASPECT, tmp.y - b.y);
    if (d > tg.r * (0.4 + 0.6 * (1 - skill))) return later;
    const shake = (1 - skill) * 0.03;
    return { type: 'shoot', x: b.x + (Math.random() - 0.5) * shake, y: b.y + (Math.random() - 0.5) * shake, t: g.t, delay: 20 };
  },

  // Someone leaving: calibration may now be complete; and a round's tick lost in a restart
  // carries on.
  check(room, ctx) {
    const g = room.game;
    if (g.phase === 'calibrate' && active(room).length && active(room).every((p) => g.cal[p.id])) startCountdown(room, ctx);
    else if (g.phase === 'round' && !room.timer) {
      g.clock = Date.now() + TICK_MS;
      ctx.setTimer(room, TICK_MS, () => tick(room, ctx));
    } else if (g.phase === 'countdown' && !room.timer) {
      ctx.setTimer(room, COUNT_MS, () => countdown(room, ctx));
    } else if ((g.phase === 'calibrate' || g.phase === 'roundEnd') && !room.timer) {
      relay(room, ctx);
    }
  },

  onJoin(room, player) {
    const g = room.game;
    if (!g.order.includes(player.id)) g.order.push(player.id);
    stat(g, player.id);
    assignColor(g, player);
  },

  waitingOn(room) {
    const g = room.game;
    if (g.phase === 'calibrate') return active(room).filter((p) => !g.cal[p.id]).map((p) => p.id);
    if (g.phase === 'roundEnd') return room.players.some((p) => p.id === room.hostId && p.connected) ? [room.hostId] : [];
    return [];
  },

  view(room, player) {
    const g = room.game;
    return {
      order: g.order,
      set: g.set,
      gun: GUNS[g.set] || GUNS.classic,
      guns: g.guns,
      // Everyone's crosshair colour: [name, hex].
      colors: Object.fromEntries(Object.entries(g.colors || {}).map(([id, i]) => [id, SIGHT_COLORS[i]])),
      myGun: g.guns[player.id] || null,
      round: g.round,
      rounds: g.rounds,
      length: g.length,
      count: g.count,
      t: g.t,
      tickMs: TICK_MS,
      gunStats: statsHere(g),
      ammo: g.order.map((id) => ammo(g, id)),
      aspect: ASPECT,
      cal: g.cal,
      calStep: g.calStep,
      live: g.phase === 'round' ? g.live.filter((tg) => !tg.hit) : [],
      aims: g.order.map((id) => g.aims[id] || null),
      stats: Object.fromEntries(g.order.map((id) => {
        const st = stat(g, id);
        return [id, { score: st.score, round: st.round, hits: st.hits, shots: st.shots, best: st.best, bad: st.bad }];
      })),
      result: g.result,
      winnerId: g.winnerId,
    };
  },

  // For tests (and the screens' copy of posAt).
  KINDS,
  SETS,
  GUNS,
  FINISHES,
  SIGHTS,
  POND_ROOM,
  posAt,
  hitTest,
  spawn,
  tick,
  gunLook,
  setIdOf,
  GUN_STATS,
  SIGHT_COLORS,
  LAG_MAX,
};
