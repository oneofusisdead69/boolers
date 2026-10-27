// Track Racing: arcade racing. The TV shows the whole track from above, Micro Machines style;
// each phone shows the race from its own car (first person, a chase cam behind it) and is the
// steering wheel: tilt it to steer, hold the pedals to go and stop. Before each race everyone bets sips on a car (anyone's, their own
// included), as in Horse Race: losers drink their bet, winners hand out theirs. Last place can
// drink extra.
//
// The server runs the race: phones send what their driver is doing ({ type: 'drive', steer, gas,
// brake }, a few times a second and only when it changes), and a fixed-step simulation moves the
// cars. Every tick the cars' positions go out to every screen with ctx.signal('cars'), not as a
// whole new state; the full state is only re-sent when something changes (a lap, a finish).
//
// Bots drive inside the simulation (their bot() is far too slow to steer with): each step their
// pedals and wheel come from the track ahead, steadier and faster the better the bot.

const betting = require('../lib/betting');
const { LEVELS } = require('../lib/bots');
const { shuffle, pick, clamp, steady } = require('../lib/random');
const { optionValues } = require('../lib/options');

// ---------- Tracks ----------
// The world is 1000 × 625 units (a 16:10 screen). Each track is a closed loop through these
// points (a centripetal Catmull-Rom spline, so corners never kink), drawn the same on every screen.

const WORLD = { w: 1000, h: 625 };
const WIDTH = 64; // asphalt, edge to edge
const BAND = 30; // grass beyond each edge, then the wall
const TRACKS = {
  bar: {
    name: 'Bar Top GP',
    points: [[170, 110], [500, 80], [830, 110], [920, 250], [880, 470], [700, 540], [560, 430], [440, 430], [300, 540], [120, 470], [80, 260]],
  },
  pretzel: {
    name: 'The Pretzel',
    points: [[120, 150], [300, 80], [480, 190], [660, 90], [870, 120], [930, 320], [830, 540], [680, 545], [600, 450], [540, 375], [460, 375], [400, 450], [330, 545], [160, 545], [75, 350]],
  },
  hairpin: {
    name: 'Hairpin Alley',
    points: [[150, 95], [850, 95], [912, 118], [932, 165], [912, 212], [850, 235], [430, 235], [330, 250], [285, 312], [330, 375], [430, 390], [850, 390], [912, 413], [932, 460], [912, 507], [850, 530], [160, 530], [95, 475], [95, 150]],
  },
  speedway: {
    name: 'The Speedway',
    points: [[230, 92], [770, 92], [875, 117], [922, 210], [922, 410], [875, 508], [770, 533], [620, 533], [560, 498], [500, 468], [440, 498], [380, 533], [230, 533], [125, 508], [78, 410], [78, 210], [125, 117]],
  },
  chicanes: {
    name: 'Chicane City',
    points: [[150, 100], [330, 100], [390, 145], [450, 100], [600, 100], [660, 145], [720, 100], [860, 110], [925, 200], [925, 420], [860, 520], [700, 525], [640, 480], [580, 525], [420, 525], [360, 480], [300, 525], [150, 520], [80, 430], [80, 190]],
  },
};
const TRACK_IDS = Object.keys(TRACKS);

// The centreline, sampled every STEP units, with each sample's direction. Built once per track.
const STEP = 10;
const built = {};
function trackOf(id) {
  if (built[id]) return built[id];
  const pts = TRACKS[id].points;
  const n = pts.length;
  const dense = [];
  const knot = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;
  for (let i = 0; i < n; i++) {
    const P0 = pts[(i - 1 + n) % n];
    const P1 = pts[i];
    const P2 = pts[(i + 1) % n];
    const P3 = pts[(i + 2) % n];
    const t1 = knot(P0, P1);
    const t2 = t1 + knot(P1, P2);
    const t3 = t2 + knot(P2, P3);
    for (let k = 0; k < 40; k++) {
      const t = t1 + ((t2 - t1) * k) / 40;
      const lerp = (A, B, ta, tb) => [0, 1].map((j) => ((tb - t) * A[j] + (t - ta) * B[j]) / (tb - ta));
      const A1 = lerp(P0, P1, 0, t1);
      const A2 = lerp(P1, P2, t1, t2);
      const A3 = lerp(P2, P3, t2, t3);
      dense.push(lerp(lerp(A1, A2, 0, t2), lerp(A2, A3, t1, t3), t1, t2));
    }
  }
  // Even spacing along the loop.
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[cum.length - 1];
  const count = Math.round(length / STEP);
  const step = length / count;
  const xs = [];
  const ys = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    xs.push(a[0] + (b[0] - a[0]) * f);
    ys.push(a[1] + (b[1] - a[1]) * f);
  }
  const dir = xs.map((_, i) => {
    const k = (i + 1) % count;
    return Math.atan2(ys[k] - ys[i], xs[k] - xs[i]);
  });
  built[id] = { id, name: TRACKS[id].name, xs, ys, dir, count, step, length };
  return built[id];
}

// Where a point is relative to the track: the nearest spot on the centreline (its index `i`,
// distance along the loop `s`), how far off it the point is, and which way is back to it.
function locate(tr, x, y, hint = -1) {
  let best = Infinity;
  let bi = 0;
  // Near where the car was last time, or everywhere when we don't know (or it's lost).
  const scan = (from, to) => {
    for (let k = from; k <= to; k++) {
      const i = ((k % tr.count) + tr.count) % tr.count;
      const d = (tr.xs[i] - x) ** 2 + (tr.ys[i] - y) ** 2;
      if (d < best) { best = d; bi = i; }
    }
  };
  if (hint >= 0) scan(hint - 12, hint + 12);
  if (hint < 0 || best > (WIDTH / 2 + BAND + 20) ** 2) { best = Infinity; scan(0, tr.count - 1); }
  // Project onto the segment either side of the nearest sample.
  let out = null;
  for (const a of [(bi - 1 + tr.count) % tr.count, bi]) {
    const b = (a + 1) % tr.count;
    const ax = tr.xs[a];
    const ay = tr.ys[a];
    const dx = tr.xs[b] - ax;
    const dy = tr.ys[b] - ay;
    const len2 = dx * dx + dy * dy || 1;
    const f = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
    const px = ax + dx * f;
    const py = ay + dy * f;
    const dist = Math.hypot(x - px, y - py);
    if (!out || dist < out.dist) out = { i: a, s: (a + f) * tr.step, px, py, dist };
  }
  return out;
}

// ---------- The race ----------

const TICK_MS = 50; // the simulation runs (and the cars go out) 20 times a second
const DT = TICK_MS / 1000;
const SUBSTEPS = 2;
const COUNT_MS = 1000; // 3, 2, 1, GO
const CHECKPOINTS = 8; // per lap, evenly spaced: a lap only counts if you pass them all in order
const RADIUS = 10; // cars, for bumping into each other
const GRACE_S = 20; // after the winner crosses the line, the rest have this long to finish
const LAP_LIMIT_S = 75; // and the race is called after this long a lap, whatever happens
const HONK_GAP_S = 2;

// How a car handles (units a second, and a second squared).
const CAR = {
  accel: 180, // engine
  brake: 420,
  reverse: 140,
  top: 175, // on asphalt
  topGrass: 75,
  topReverse: 80,
  drag: 0.5, // rolling resistance, per second
  turn: 2.7, // radians a second at full lock...
  turnFast: 0.45, // ...less this share of it flat out, so fast corners need a lift (or a drift)
  grip: 8, // how quickly sideways slide dies away
  gripDrift: 2.4, // ... at full lock, flat out: the back steps out
  bounce: 0.45, // walls
};
// How fast the car turns (radians a second) at full lock, going at `speed`.
const turnRate = (speed) => CAR.turn * clamp(Math.abs(speed) / 60, 0, 1) * (1 - CAR.turnFast * clamp(speed / CAR.top, 0, 1));

const carOf = (g, id) => g.cars.find((c) => c.id === id);

// ---------- Weather ----------
// Each race has its own, picked here when it's set up so every screen shows the same. Mostly it's
// just the look of it; on rain and snow the tyres grip a little less and the brakes take a little
// longer (`grip`, `brake`: shares of the dry figures).
const WEATHERS = {
  clear: { emoji: '☀️', label: 'Clear skies', says: 'perfect racing weather.' },
  sunset: { emoji: '🌇', label: 'Sunset', says: 'mind the glare.' },
  night: { emoji: '🌙', label: 'Night racing', says: 'headlights on!' },
  rain: { emoji: '🌧️', label: 'Rain', says: 'it’s slippery!', grip: 0.85, brake: 0.88 },
  fog: { emoji: '🌫️', label: 'Fog', says: 'you can’t see a thing.' },
  snow: { emoji: '❄️', label: 'Snow', says: 'easy on the corners!', grip: 0.78, brake: 0.82 },
};
// Rooms with weather of their own (their moods in lib/roomStyles.js) race in the one they're in
// now: the Lighthouse's fog, the Highlands' rain, the château at night...
const MOOD_ROOMS = ['lighthouse', 'stpatricks', 'vineyard', 'chateau'];
const MOOD_WEATHER = { lighthouse: 'night', lighthouseFog: 'fog', storm: 'rain', stpatricksRain: 'rain', stpatricksFog: 'fog', vineyardSunset: 'sunset', chateauNight: 'night' };
const NIGHT_ROOMS = ['space', 'club', 'speakeasy', 'halloween', 'jazz'];
const HOT_ROOMS = ['tiki', 'saloon', 'vineyard', 'space']; // (no snow)
function pickWeather(room) {
  const style = room.style === 'storm' ? 'lighthouse' : room.style || 'classic'; // (an old saved room)
  if (style === 'christmas') return 'snow';
  if (MOOD_ROOMS.includes(style)) return MOOD_WEATHER[room.mood] || MOOD_WEATHER[room.style] || 'clear';
  const odds = NIGHT_ROOMS.includes(style)
    ? { night: 6, clear: 1, rain: 1, fog: 1 }
    : { clear: 5, sunset: 2, night: 2, rain: 2, fog: 1.5, snow: HOT_ROOMS.includes(style) ? 0 : 0.5 };
  let r = Math.random() * Object.values(odds).reduce((a, b) => a + b, 0);
  for (const [w, n] of Object.entries(odds)) if ((r -= n) < 0) return w;
  return 'clear';
}

function gridCars(room, g) {
  const tr = trackOf(g.trackId);
  // The first race's grid is drawn at random; after that the last race's winner starts at the back.
  const ids = g.lastOrder ? [...g.lastOrder].reverse().filter((id) => g.racers.includes(id)) : shuffle(g.racers);
  for (const id of g.racers) if (!ids.includes(id)) ids.unshift(id);
  return ids.map((id, n) => {
    const back = 34 + Math.floor(n / 2) * 32;
    const i = (tr.count - Math.round(back / tr.step)) % tr.count;
    const a = tr.dir[i];
    const side = (n % 2 ? 1 : -1) * 15;
    return {
      id,
      x: tr.xs[i] - Math.sin(a) * side,
      y: tr.ys[i] + Math.cos(a) * side,
      a,
      vx: 0,
      vy: 0,
      cp: 0, // checkpoints passed
      seg: i,
      s: i * tr.step,
      steer: 0,
      gas: 0,
      brake: 0,
      grass: false,
      drift: false,
      finished: null, // race time, once over the line
      honkAt: -99,
      bot: null, // a bot's driving state
    };
  });
}

function newRace(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.race += 1;
  g.trackId = g.track === 'random' ? (g.race === 1 ? pick(TRACK_IDS) : pick(TRACK_IDS.filter((id) => id !== g.trackId))) : g.track;
  g.racers = room.players.filter((p) => p.connected).map((p) => p.id);
  g.cars = gridCars(room, g);
  g.t = 0;
  g.count = 0;
  g.result = null;
  g.firstIn = null;
  g.last = null;
  g.bumps = [];
  g.honks = [];
  g.weather = pickWeather(room);
  betting.reset(g);
  g.phase = 'betting';
  const wx = WEATHERS[g.weather];
  ctx.log(room, `${wx.emoji} ${wx.label} at ${trackOf(g.trackId).name}: ${wx.says}`);
}

function countdown(room, ctx) {
  const g = room.game;
  g.count -= 1;
  if (g.count > 0) return ctx.setTimer(room, COUNT_MS, () => countdown(room, ctx));
  g.phase = 'race';
  g.clock = Date.now();
  ctx.log(room, `🏁 Race ${g.race} is off: ${g.laps} laps of ${trackOf(g.trackId).name}!`);
  ctx.setTimer(room, TICK_MS, () => tick(room, ctx));
}

// Where a car is in the race: checkpoints passed, plus how far it is towards the next one.
function progress(g, tr, c) {
  if (c.finished != null) return g.laps * CHECKPOINTS + 1 - c.finished / 1e4;
  const gap = tr.length / CHECKPOINTS;
  let along = c.s - (c.cp % CHECKPOINTS) * gap;
  along -= Math.round(along / tr.length) * tr.length; // wrapped to the nearest way round
  return c.cp + clamp(along / gap, -0.9, 0.99);
}

const lapOf = (g, c) => Math.min(g.laps, Math.floor(c.cp / CHECKPOINTS) + 1);

// Places, best first.
function standings(g) {
  const tr = trackOf(g.trackId);
  return g.cars.slice().sort((a, b) => progress(g, tr, b) - progress(g, tr, a)).map((c) => c.id);
}

// A bot's pedals and wheel for this step, from the track ahead of it.
function botDrive(g, tr, c, skill) {
  const b = (c.bot ||= { line: 0, stuck: 0, backing: 0, wobble: 0, slip: 0 });
  const speed = Math.hypot(c.vx, c.vy);
  // Its line drifts about the centre, more for a bad driver; now and then a bad one loses focus.
  b.line = clamp(b.line + (Math.random() - 0.5) * 6 * (1.2 - skill), -WIDTH * 0.35 * (1.1 - skill), WIDTH * 0.35 * (1.1 - skill));
  if (b.slip > 0) b.slip -= DT;
  else if (Math.random() < 0.004 * (1 - skill)) b.slip = 0.4 + Math.random() * 0.6;
  // Aim for a point further ahead the faster it's going.
  const ahead = Math.round((45 + speed * 0.35) / tr.step);
  const i = (c.seg + ahead) % tr.count;
  const ta = tr.dir[i];
  const tx = tr.xs[i] - Math.sin(ta) * b.line;
  const ty = tr.ys[i] + Math.cos(ta) * b.line;
  let diff = Math.atan2(ty - c.y, tx - c.x) - c.a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  // Backing out after getting stuck (against a wall, facing the wrong way).
  if (b.backing > 0) {
    b.backing -= DT;
    return { steer: -Math.sign(diff) || 1, gas: 0, brake: 1 };
  }
  const forward = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
  if (forward < 15 && (Math.abs(diff) > 1.9 || c.gas)) b.stuck += DT;
  else b.stuck = Math.max(0, b.stuck - DT);
  if (b.stuck > 1.2) { b.stuck = 0; b.backing = 0.8 + Math.random() * 0.4; }
  // How fast it can take each bend coming up, and so how fast it can be going now and still
  // brake for it in time. A good driver pushes it (and drifts); a bad one is timid.
  const nerve = 0.75 + 0.33 * skill;
  let want = CAR.top * (0.76 + 0.24 * skill);
  for (const k of [20, 60, 110, 170, 240]) {
    const j = (c.seg + Math.round(k / tr.step)) % tr.count;
    const j2 = (j + Math.round(60 / tr.step)) % tr.count;
    const bend = Math.abs(Math.atan2(Math.sin(tr.dir[j2] - tr.dir[j]), Math.cos(tr.dir[j2] - tr.dir[j]))) || 1e-3;
    const r = 60 / bend; // the bend's radius
    let v = Math.min(CAR.top, r * CAR.turn);
    v = r * turnRate(v) * nerve;
    want = Math.min(want, Math.sqrt(v * v + 2 * 260 * k));
  }
  const noise = (Math.random() - 0.5) * 0.5 * (1 - skill);
  let steer = clamp(diff * 2.6 + noise, -1, 1);
  if (b.slip > 0) steer = clamp(steer * 0.2 + (b.slip > 0.5 ? 0.7 : -0.7), -1, 1);
  return { steer, gas: speed < want ? 1 : 0, brake: speed > want + 20 ? 1 : 0 };
}

// One step of the physics for one car.
function moveCar(g, tr, c, dt) {
  const fx = Math.cos(c.a);
  const fy = Math.sin(c.a);
  let fwd = c.vx * fx + c.vy * fy;
  let side = -c.vx * fy + c.vy * fx;
  const loc = locate(tr, c.x, c.y, c.seg);
  c.grass = loc.dist > WIDTH / 2 + 2;
  const top = c.grass ? CAR.topGrass : CAR.top;
  const racing = g.phase === 'race' && c.finished == null;
  // After the line a car rolls to a stop on its own.
  const gas = racing ? c.gas : 0;
  const wx = WEATHERS[g.weather] || WEATHERS.clear;
  const brake = racing ? c.brake : c.finished != null ? 0.4 : 0;
  if (gas) fwd += CAR.accel * dt * (fwd < 0 ? 2 : 1);
  if (brake) {
    if (fwd > 5) fwd -= CAR.brake * (wx.brake || 1) * dt;
    else if (racing) fwd = Math.max(-CAR.topReverse, fwd - CAR.reverse * dt);
    else fwd *= 0.8;
  }
  fwd -= fwd * CAR.drag * dt;
  // Over the top speed (or onto the grass), it slows down hard.
  if (fwd > top) fwd = top + (fwd - top) * Math.exp(-4 * dt);
  if (!gas && !brake && Math.abs(fwd) < 3) fwd = 0;
  // Steering turns the car more at speed, a bit less flat out; backwards it turns the other way.
  const steer = racing ? c.steer : 0;
  c.a += steer * turnRate(fwd) * Math.sign(fwd) * dt;
  c.a = Math.atan2(Math.sin(c.a), Math.cos(c.a));
  // The tyres kill sideways slide: less of it at full lock and speed (a drift), and on the grass.
  const load = Math.abs(steer) * clamp(fwd / CAR.top, 0, 1);
  const wet = wx.grip || 1;
  const grip = Math.max(1.5, (CAR.grip - (CAR.grip - CAR.gripDrift) * load * load * 1.3) * wet - (brake && racing ? 2 : 0) - (c.grass ? 2.5 : 0));
  side *= Math.exp(-grip * dt);
  c.drift = Math.abs(side) > 38;
  const nx = Math.cos(c.a);
  const ny = Math.sin(c.a);
  c.vx = nx * fwd - ny * side;
  c.vy = ny * fwd + nx * side;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  // The wall: past the grass, back you come.
  const at = locate(tr, c.x, c.y, loc.i);
  const edge = WIDTH / 2 + BAND;
  if (at.dist > edge) {
    const ux = (c.x - at.px) / at.dist;
    const uy = (c.y - at.py) / at.dist;
    const vn = c.vx * ux + c.vy * uy;
    c.x = at.px + ux * edge;
    c.y = at.py + uy * edge;
    if (vn > 0) {
      c.vx -= (1 + CAR.bounce) * vn * ux;
      c.vy -= (1 + CAR.bounce) * vn * uy;
      c.vx *= 0.85;
      c.vy *= 0.85;
      if (vn > 45) bump(g, c);
    }
  }
  // (And the edge of the world.)
  for (const [k, v, max] of [['x', 'vx', WORLD.w], ['y', 'vy', WORLD.h]]) {
    if (c[k] < RADIUS || c[k] > max - RADIUS) {
      c[k] = clamp(c[k], RADIUS, max - RADIUS);
      c[v] *= -CAR.bounce;
    }
  }
  const now = locate(tr, c.x, c.y, at.i);
  c.seg = now.i;
  c.s = now.s;
  // Checkpoints, in order: the next one counts once the car is just past it.
  if (c.finished == null && g.phase === 'race') {
    const gap = tr.length / CHECKPOINTS;
    let past = c.s - ((c.cp + 1) % CHECKPOINTS) * gap;
    past -= Math.round(past / tr.length) * tr.length;
    if (past >= 0 && past < gap / 2) {
      c.cp += 1;
      if (c.cp % CHECKPOINTS === 0) return c.cp >= g.laps * CHECKPOINTS ? 'finish' : 'lap';
    }
  }
  return null;
}

function bump(g, c) {
  if (!g.bumps.includes(c.id)) g.bumps.push(c.id);
}

// Cars are circles: when two overlap they're pushed apart and trade some speed.
function collide(g) {
  const cars = g.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= RADIUS * 2) continue;
      if (d < 0.01) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
      const push = (RADIUS * 2 - (d || 0)) / 2;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
      const rel = (a.vx - b.vx) * dx + (a.vy - b.vy) * dy;
      if (rel <= 0) continue;
      const k = rel * 0.8;
      a.vx -= k * dx;
      a.vy -= k * dy;
      b.vx += k * dx;
      b.vy += k * dy;
      if (rel > 35) { bump(g, a); bump(g, b); }
    }
  }
}

// The cars, as they go out to every screen each tick: [x, y, heading, flags, place, lap].
// Flags: 1 drifting, 2 on the grass, 4 finished, 8 braking.
function snapshot(g) {
  const order = standings(g);
  return {
    r: g.race,
    t: Math.round(g.t * 1000) / 1000,
    c: g.cars.map((c) => [
      Math.round(c.x * 10) / 10,
      Math.round(c.y * 10) / 10,
      Math.round(c.a * 100) / 100,
      (c.drift ? 1 : 0) | (c.grass ? 2 : 0) | (c.finished != null ? 4 : 0) | (c.brake && g.phase === 'race' ? 8 : 0),
      order.indexOf(c.id) + 1,
      lapOf(g, c),
    ]),
    b: g.bumps,
    h: g.honks,
  };
}

function tick(room, ctx) {
  const g = room.game;
  if (g.phase !== 'race') return undefined;
  const tr = trackOf(g.trackId);
  // A slow server catches up (a step or two), but never races ahead of the clock.
  const now = Date.now();
  const steps = clamp(Math.round((now - g.clock) / TICK_MS), 1, 3);
  g.clock = steps === 1 ? now : g.clock + steps * TICK_MS;
  g.bumps = [];
  let news = false;
  for (let n = 0; n < steps; n++) {
    g.t += DT;
    for (const c of g.cars) {
      const p = ctx.player(room, c.id);
      if (p?.bot && c.finished == null) Object.assign(c, botDrive(g, tr, c, LEVELS[p.bot]?.skill ?? 0.6));
    }
    for (let k = 0; k < SUBSTEPS; k++) {
      for (const c of g.cars) {
        const what = moveCar(g, tr, c, DT / SUBSTEPS);
        if (what === 'lap') news = true;
        if (what === 'finish') {
          c.finished = g.t;
          news = true;
          const place = g.cars.filter((x) => x.finished != null).length;
          if (place === 1) g.firstIn = g.t;
          ctx.log(room, `${place === 1 ? '🏆' : '🏁'} ${ctx.name(room, c.id)} finishes ${ordinal(place)} (${g.t.toFixed(1)}s)`);
        }
      }
      collide(g);
    }
  }
  ctx.signal(room, 'cars', snapshot(g));
  g.honks = [];
  const allIn = g.cars.every((c) => c.finished != null);
  const called = (g.firstIn != null && g.t - g.firstIn > GRACE_S) || g.t > g.laps * LAP_LIMIT_S;
  if (allIn || called) {
    finish(room, ctx);
    return undefined;
  }
  ctx.setTimer(room, TICK_MS, () => tick(room, ctx));
  // Only a lap or a finish needs the whole state sent again (the places and laps on the phones).
  return news ? undefined : 'quiet';
}

const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

function finish(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  const order = standings(g);
  g.result = order.map((id) => ({ id, time: carOf(g, id).finished }));
  g.lastOrder = order;
  const winner = order[0];
  g.wins[winner] = (g.wins[winner] || 0) + 1;
  ctx.log(room, `🏆 ${ctx.name(room, winner)} wins race ${g.race}!`);
  ctx.highlight(room, 'trackWin', winner, g.wins[winner], `🏎️ ${ctx.name(room, winner)} won ${g.wins[winner]} race${g.wins[winner] === 1 ? '' : 's'} at Track Racing`);
  betting.settle(room, ctx, winner, (id) => `${ctx.name(room, id)}'s car`);
  // The back marker drinks too (if that's on, and there was anyone to beat).
  const last = order[order.length - 1];
  if (g.lastSips && order.length >= 2 && ctx.player(room, last)) {
    g.last = last;
    ctx.drink(room, last, g.lastSips, 'came last');
    g.drank[last] = (g.drank[last] || 0) + g.lastSips;
  }
}

// ---------- Bots ----------

// Who a bot backs: a good bot backs the best driver it knows of (whoever's won most, or itself if
// it's a Booler); a bad one picks anyone.
function botPick(room, g, me, skill) {
  if (Math.random() > skill) return pick(g.racers);
  const best = g.racers.slice().sort((a, b) => (g.wins[b] || 0) - (g.wins[a] || 0) || skillOf(room, b) - skillOf(room, a))[0];
  return best;
}
const skillOf = (room, id) => {
  const p = room.players.find((x) => x.id === id);
  return p?.bot ? LEVELS[p.bot]?.skill ?? 0.5 : 0.7;
};

module.exports = {
  id: 'trackRacing',
  name: 'Track Racing',
  description: '🏎️ Arcade racing: the track on the TV, the view from your car on your phone, which is the steering wheel: tilt to steer. Bet sips on a car; losers drink, winners hand out.',
  rules: [
    'Bet sips on a car before each race: anyone\'s, even your own.',
    'Tilt your phone like a steering wheel. Right pedal goes, left pedal brakes (and reverses).',
    'Grass slows you down; walls bounce you back. Floor it into a corner to drift.',
    'Losers drink their bet; winners hand out theirs (or double).',
    'Last place drinks extra (if that\'s on).',
  ],
  minPlayers: 2,
  bestWithTv: true,
  order: 9.5,
  TRACKS,
  options: [
    { id: 'laps', label: 'Laps', default: 3, choices: [2, 3, 5, 8].map((n) => ({ value: n, label: `${n}` })) },
    {
      id: 'track',
      label: 'Track',
      default: 'random',
      choices: [{ value: 'random', label: '🔀 Mix it up' }, ...TRACK_IDS.map((id) => ({ value: id, label: TRACKS[id].name }))],
    },
    ...betting.options,
    {
      id: 'lastSips',
      label: 'Last place drinks',
      default: 2,
      choices: [{ value: 0, label: 'Nothing' }, { value: 1, label: '1 sip' }, { value: 2, label: '2 sips' }, { value: 3, label: '3 sips' }],
    },
  ],

  start(room, ctx, options = {}) {
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      ...optionValues(module.exports.options, options), // laps, track, maxBet, multiplier, lastSips
      race: 0,
      wins: {},
      lastOrder: null,
    });
    newRace(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const host = me === room.hostId;
    const car = carOf(g, me);

    if (action.type === 'drive') {
      // Several a second from each phone: nothing to send back (the next tick shows it).
      if (!car || (g.phase !== 'race' && g.phase !== 'countdown')) return 'quiet';
      car.steer = Math.round(clamp(Number(action.steer), -1, 1) * 100) / 100;
      car.gas = action.gas === 1 || action.gas === '1' || action.gas === true ? 1 : 0;
      car.brake = action.brake === 1 || action.brake === '1' || action.brake === true ? 1 : 0;
      return 'quiet';
    }
    if (action.type === 'honk') {
      if (!car || g.phase !== 'race' || g.t - car.honkAt < HONK_GAP_S) return 'quiet';
      car.honkAt = g.t;
      g.honks.push(me);
      return 'quiet';
    }
    if (action.type === 'bet' && g.phase === 'betting') {
      betting.bet(g, me, action.car, action.sips, g.racers);
    } else if (action.type === 'startRace' && g.phase === 'betting' && host && Object.keys(g.bets).length) {
      g.phase = 'countdown';
      g.count = 3;
      ctx.setTimer(room, COUNT_MS, () => countdown(room, ctx));
    } else if (action.type === 'give') {
      betting.give(room, ctx, me, action.alloc, `${ctx.name(room, g.winner)} won`);
    } else if (action.type === 'nextRace' && (g.phase === 'results' || g.phase === 'payout') && host) {
      newRace(room, ctx);
    }
    return undefined;
  },

  bot(room, me, ctx, skill) {
    const g = room.game;
    const host = room.hostId === me.id;
    if (g.phase === 'betting') {
      if (!g.bets[me.id]) return { type: 'bet', car: botPick(room, g, me, skill), sips: betting.botSips(g.maxBet, skill) };
      const waiting = ctx.connectedPlayers(room).some((p) => !g.bets[p.id]);
      return host && !waiting ? { type: 'startRace' } : null;
    }
    if (g.phase === 'race') {
      // A toot now and then: at whoever's in the way, or just because.
      const car = carOf(g, me.id);
      if (!car || car.finished != null || g.t - car.honkAt < HONK_GAP_S + 1) return null;
      const near = g.cars.some((c) => c !== car && Math.hypot(c.x - car.x, c.y - car.y) < 60);
      return near || steady(me.id, g.race, Math.floor(g.t / 5)) < 0.5 ? { type: 'honk', delay: 300 } : null;
    }
    if (g.phase === 'payout' && g.payout[me.id] && !g.payout[me.id].done) {
      const alloc = betting.botAlloc(room, me.id, g.payout[me.id].total);
      return alloc && { type: 'give', alloc };
    }
    if (g.phase === 'results' && host) return { type: 'nextRace' };
    return null;
  },

  check(room) {
    betting.checkPayout(room);
  },

  // Betting and payout as in lib/betting.js. The countdown and the race run on the clock: drivers
  // steer when they like, nobody waits on them.
  waitingOn(room) {
    const g = room.game;
    if (g.phase === 'countdown' || g.phase === 'race') return [];
    return betting.waitingOn(room);
  },

  onJoin(room, player) {
    const g = room.game;
    g.order.push(player.id);
    // Here before the lights: they get a car in this race, at the back of the grid.
    if (g.phase === 'betting' && !g.racers.includes(player.id)) {
      g.racers.push(player.id);
      g.cars = gridCars(room, g);
    }
  },

  view(room, player) {
    const g = room.game;
    const tr = trackOf(g.trackId);
    return {
      ...betting.view(g, player.id),
      race: g.race,
      laps: g.laps,
      weather: g.weather || 'clear',
      count: g.count,
      tickMs: TICK_MS,
      track: {
        id: tr.id,
        name: tr.name,
        width: WIDTH,
        band: BAND,
        world: WORLD,
        // The centreline, every other sample (screens smooth it again).
        line: tr.xs.filter((_, i) => i % 2 === 0).map((x, i) => [Math.round(x), Math.round(tr.ys[i * 2])]),
        start: [Math.round(tr.xs[0]), Math.round(tr.ys[0]), Math.round(tr.dir[0] * 100) / 100],
      },
      racers: g.racers,
      carIds: g.cars.map((c) => c.id), // the order cars come in, in every 'cars' update
      cars: snapshot(g),
      result: g.result,
      last: g.last,
      lastSips: g.lastSips,
      wins: g.wins,
    };
  },

  // For tests.
  trackOf,
  locate,
  standings,
  tick,
  pickWeather,
  WEATHERS,
  WIDTH,
  BAND,
};
