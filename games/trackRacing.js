// Track Racing: arcade racing. The TV shows the whole track from above, Micro Machines style;
// each phone shows the race from its own car (first person, a chase cam behind it) and is the
// steering wheel: tilt it to steer, hold the pedals to go and stop. Before each race everyone bets sips on a car (anyone's, their own
// included), as in Horse Race: losers drink their bet, winners hand out theirs. Last place can
// drink extra.
//
// The server runs the race: phones send what their driver is doing ({ type: 'drive', steer, gas,
// brake }, a few times a second and only when it changes), and a fixed-step simulation moves the
// cars, on the wall clock (see tick). Every tick the cars' positions go out to every screen with
// ctx.signal('cars'), not as a whole new state: places and laps ride along in it. The full state
// is only re-sent when a car finishes (its line in the feed, then the results).
//
// Bots drive inside the simulation (their bot() is far too slow to steer with): each step their
// pedals and wheel come from the track ahead, steadier and faster the better the bot.

const betting = require('../lib/betting');
const { LEVELS } = require('../lib/bots');
const { shuffle, pick, clamp, steady } = require('../lib/random');
const { optionValues } = require('../lib/options');
const { COLORS } = require('../lib/looks');

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
  // A true oval, NASCAR style: two long straights joined by two big, even turns.
  oval: {
    name: 'The Bool 500',
    points: [[360, 104], [460, 104], [560, 104], [660, 104], [710, 104], [790, 120], [857, 165], [902, 232], [918, 312], [902, 392], [857, 459], [790, 504], [710, 520], [610, 520], [510, 520], [410, 520], [290, 520], [210, 504], [143, 459], [98, 392], [82, 312], [98, 232], [143, 165], [210, 120], [290, 104]],
  },
  chicanes: {
    name: 'Chicane City',
    points: [[150, 100], [330, 100], [390, 145], [450, 100], [600, 100], [660, 145], [720, 100], [860, 110], [925, 200], [925, 420], [860, 520], [700, 525], [640, 480], [580, 525], [420, 525], [360, 480], [300, 525], [150, 520], [80, 430], [80, 190]],
  },
  // ---- The hard maps (🔥 in the Track option, and their own Mix it up) ----
  // Each has its own `width` (asphalt) and `band` (grass before the wall), and hills: a height
  // for each point, [x, y, z], smoothed round the loop like the rest. Hills slow you going up and
  // speed you up coming down; the grass slows you more than on the normal tracks.
  //
  // A narrow ribbon: a fast straight over a crest, two tight hairpins, then a long sweeping S along
  // the top, up on the hill, and down the far side. Hardly any grass before the wall.
  needle: {
    name: 'The Needle',
    hard: true,
    width: 42,
    band: 16,
    points: [[160, 545, 0], [300, 548, 0], [400, 548, 18], [470, 548, 0], [620, 545, 0], [740, 540, 4], [805, 520, 6], [828, 478, 8], [800, 438, 10], [720, 428, 12], [560, 428, 14], [390, 428, 16], [318, 410, 18], [300, 368, 20], [325, 330, 22], [400, 315, 24], [540, 320, 26], [660, 290, 30], [775, 225, 34], [860, 160, 36], [870, 95, 34], [800, 72, 32], [680, 95, 30], [560, 140, 28], [440, 120, 24], [320, 80, 20], [200, 95, 14], [115, 160, 10], [82, 280, 6], [86, 420, 2], [105, 510, 0]],
  },
  // A true figure of eight: the loop crosses itself in the middle, one leg on a bridge over the
  // other. The cars on the bridge and the ones under it never touch (they're on different levels),
  // and where you are in the race is how far along the loop you are, never just the nearest road.
  figure8: {
    name: 'Figure Eight',
    hard: true,
    crossing: true,
    width: 50,
    band: 22,
    points: [[937, 389, 0], [879, 509, 0], [794, 558, 6], [710, 545, 19], [638, 496, 32], [578, 427, 36], [525, 351, 36], [475, 273, 36], [422, 197, 36], [362, 128, 32], [290, 79, 19], [206, 66, 6], [121, 115, 0], [63, 235, 8], [63, 389, 12], [121, 509, 4], [206, 558, 0], [290, 545, 0], [362, 496, 0], [422, 427, 0], [475, 351, 0], [525, 273, 0], [578, 197, 0], [638, 128, 0], [710, 79, 0], [794, 66, 8], [879, 115, 18], [937, 235, 8]],
  },
  // Long, twisty and technical: a chicane, a corner that keeps tightening, a hairpin, esses, more
  // chicanes along the top, a wiggle down the left. The walls close in all the way round.
  spaghetti: {
    name: 'Spaghetti Junction',
    hard: true,
    width: 52,
    band: 14,
    points: [[170, 555, 0], [300, 555, 0], [355, 555, 2], [392, 528, 4], [430, 528, 6], [468, 555, 8], [560, 557, 10], [680, 552, 14], [760, 548, 18], [835, 528, 20], [872, 490, 20], [876, 455, 18], [853, 433, 16], [812, 440, 14], [700, 450, 12], [620, 450, 10], [560, 450, 26], [500, 440, 12], [462, 395, 8], [495, 352, 8], [580, 345, 10], [650, 330, 12], [720, 352, 14], [800, 340, 16], [880, 300, 20], [895, 240, 24], [850, 215, 26], [760, 222, 28], [680, 230, 28], [610, 205, 26], [585, 150, 22], [620, 100, 18], [600, 82, 16], [520, 92, 14], [470, 118, 10], [420, 92, 6], [330, 90, 4], [270, 116, 6], [210, 90, 8], [130, 95, 8], [88, 150, 8], [95, 240, 6], [170, 262, 4], [260, 262, 6], [325, 300, 8], [325, 370, 10], [255, 410, 8], [150, 435, 4], [100, 480, 2], [110, 535, 0]],
  },
};
const TRACK_IDS = Object.keys(TRACKS);
const NORMAL_IDS = TRACK_IDS.filter((id) => !TRACKS[id].hard);
const HARD_IDS = TRACK_IDS.filter((id) => TRACKS[id].hard);

// The centreline, sampled every STEP units, with each sample's direction. Built once per track.
const STEP = 10;
const built = {};
function trackOf(id) {
  if (built[id]) return built[id];
  const def = TRACKS[id];
  // (A hard map's points can have a height too, [x, y, z]: it's carried round the same spline.)
  const pts = def.points.map((p) => [p[0], p[1], p[2] || 0]);
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
      const lerp = (A, B, ta, tb) => [0, 1, 2].map((j) => ((tb - t) * A[j] + (t - ta) * B[j]) / (tb - ta));
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
  const zs = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    xs.push(a[0] + (b[0] - a[0]) * f);
    ys.push(a[1] + (b[1] - a[1]) * f);
    zs.push(a[2] + (b[2] - a[2]) * f);
  }
  const dir = xs.map((_, i) => {
    const k = (i + 1) % count;
    return Math.atan2(ys[k] - ys[i], xs[k] - xs[i]);
  });
  // How steep the road is at each sample, going round (height per unit along: + uphill).
  const slope = zs.map((_, i) => (zs[(i + 1) % count] - zs[(i - 1 + count) % count]) / (2 * step));
  const width = def.width || WIDTH;
  const band = def.band ?? BAND;
  built[id] = {
    id, name: def.name, xs, ys, zs, slope, dir, count, step, length,
    width, band, edge: width / 2 + band, hard: !!def.hard, crossing: !!def.crossing,
    hilly: zs.some((z) => z !== 0),
    topGrass: def.hard ? CAR.topGrass * 0.82 : CAR.topGrass,
  };
  return built[id];
}

// How high the road is at a spot on the track (`loc` from locate): 0 on the flat tracks.
const heightAt = (tr, loc) => {
  if (!tr.hilly) return 0;
  const a = loc.i;
  const f = clamp(loc.s / tr.step - a, 0, 1);
  return tr.zs[a] + (tr.zs[(a + 1) % tr.count] - tr.zs[a]) * f;
};

// Where a point is relative to the track: the nearest spot on the centreline (its index `i`,
// distance along the loop `s`), how far off it the point is, and which way is back to it.
function locate(tr, x, y, hint = -1) {
  let best = Infinity;
  let bi = 0;
  // Near where the car was last time, or everywhere when we don't know (or it's lost).
  // (Where the loop crosses itself, a car lost near the crossing is only looked for on its own
  // level: the bridge, or the road under it.)
  const level = hint >= 0 && tr.crossing ? tr.zs[hint] : null;
  const scan = (from, to) => {
    for (let k = from; k <= to; k++) {
      const i = ((k % tr.count) + tr.count) % tr.count;
      if (level != null && Math.abs(tr.zs[i] - level) > 15) continue;
      const d = (tr.xs[i] - x) ** 2 + (tr.ys[i] - y) ** 2;
      if (d < best) { best = d; bi = i; }
    }
  };
  if (hint >= 0) scan(hint - 12, hint + 12);
  if (hint < 0 || best > (tr.edge + 20) ** 2) { best = Infinity; scan(0, tr.count - 1); }
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
const LEVEL_GAP = 12; // ... if they're on the same level (not one on a bridge over the other)
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
  gravity: 230, // how much a slope slows you (or speeds you up): this, times how steep it is
};
// How fast the car turns (radians a second) at full lock, going at `speed`.
const turnRate = (speed) => CAR.turn * clamp(Math.abs(speed) / 60, 0, 1) * (1 - CAR.turnFast * clamp(speed / CAR.top, 0, 1));

const carOf = (g, id) => g.cars.find((c) => c.id === id);

// ---------- Cars ----------
// What each car looks like is up to its driver (a 🔧 panel on the phone while the bets go on, or
// after a race): the body, the paint (their own colour unless they pick another), a stripe in a
// second colour, and one extra on it. Purely for show: every car has the same circle to bump with
// and the same handling. Kept per player for the whole game, so it lasts from race to race.
const BODIES = ['sports', 'pickup', 'van', 'buggy', 'hotrod', 'trolley'];
const EXTRAS = ['none', 'spoiler', 'keg', 'flames', 'number', 'cone'];
const PAINTS = [...COLORS, '#f4f4f4', '#26262b']; // the players' colours, and white and black
const CAR_LOOK = { body: 'sports', paint: null, stripe: null, extra: 'none' }; // paint null: the driver's own colour

// A look as a phone sent it, cleaned: anything unknown falls back to the plain car's (an old
// phone's saved choice still works if a body's been dropped since).
function carLook(a = {}) {
  return {
    body: BODIES.includes(a.body) ? a.body : CAR_LOOK.body,
    paint: PAINTS.includes(a.paint) ? a.paint : null,
    stripe: PAINTS.includes(a.stripe) ? a.stripe : null,
    extra: EXTRAS.includes(a.extra) ? a.extra : CAR_LOOK.extra,
  };
}

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
const NIGHT_ROOMS = ['space', 'club', 'speakeasy', 'jazz'];
const HOT_ROOMS = ['tiki', 'saloon', 'vineyard', 'space']; // (no snow)
function pickWeather(room) {
  const style = room.style === 'storm' ? 'lighthouse' : room.style || 'classic'; // (an old saved room)
  if (style === 'christmas') return 'snow';
  // Rainbow Road (below): out among the stars, it's always night.
  if (rainbow(room)) return 'night';
  // Halloween: always dark. A full moon, mostly; now and then the graveyard fog rolls in.
  if (style === 'halloween') return Math.random() < 0.7 ? 'night' : 'fog';
  if (MOOD_ROOMS.includes(style)) return MOOD_WEATHER[room.mood] || MOOD_WEATHER[room.style] || 'clear';
  // (The tiki bar races at dusk, mostly: the torches lit, the sun going down over the sea.)
  const odds = NIGHT_ROOMS.includes(style)
    ? { night: 6, clear: 1, rain: 1, fog: 1 }
    : style === 'tiki'
      ? { sunset: 6, clear: 2, night: 2, rain: 1 }
      : { clear: 5, sunset: 2, night: 2, rain: 2, fog: 1.5, snow: HOT_ROOMS.includes(style) ? 0 : 0.5 };
  let r = Math.random() * Object.values(odds).reduce((a, b) => a + b, 0);
  for (const [w, n] of Object.entries(odds)) if ((r -= n) < 0) return w;
  return 'clear';
}

// Halloween races in the haunted graveyard: the screens dress it up
// (public/games/trackRacing.js), and the feed tells it spookily.
const spooky = (room) => room.style === 'halloween';
const SPOOKY_WEATHER = {
  night: '🌕 A full moon over {track}: headlights on, and don’t look back…',
  fog: '🌫️ The graveyard fog rolls over {track}: something’s out there…',
};

// ---------- Rainbow Road ----------
// Track Racing at the Space lounge is an easter egg (EGGS in lib/roomStyles.js: 'space:trackRacing'
// is the spaceRainbow look): the track floats among the stars, a glowing rainbow, with no walls
// and no grass. Drive off its edge and you fall: you're dropped back on at the nearest point of
// the road, stopped, for a moment (`respawn`), and you drink a sip (not more often than every
// `cooldown` seconds, so a bad patch can't run up a tab). The server decides who falls: the
// screens only show it (flag 16 while a car's being put back, and who fell in each 'cars').
const RAINBOW_ROOM = 'space';
const RAINBOW = { respawn: 1.2, cooldown: 10, sips: 1 };
const rainbow = (room) => room.style === RAINBOW_ROOM;

// The car's gone over the edge: back on the road at the nearest point, facing the way round.
function fall(g, tr, c, at) {
  c.x = at.px;
  c.y = at.py;
  c.a = tr.dir[at.i];
  c.vx = 0;
  c.vy = 0;
  c.drift = false;
  c.respawn = RAINBOW.respawn;
  c.falls = (c.falls || 0) + 1;
  c.fell = true; // (the tick sees to the sip)
  if (c.bot) { c.bot.stuck = 0; c.bot.backing = 0; c.bot.slip = 0; }
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
      z: tr.zs[i], // how high up it is (the hard maps' hills, and the figure eight's bridge)
      steer: 0,
      gas: 0,
      brake: 0,
      grass: false,
      drift: false,
      finished: null, // race time, once over the line
      honkAt: -99,
      respawn: 0, // Rainbow Road: seconds till it's back in the race after a fall
      drankAt: -99, // ...and when it last drank for one
      bot: null, // a bot's driving state
    };
  });
}

function newRace(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.race += 1;
  // Mixing it up: a different one each race, from the normal tracks (or from the hard maps).
  const mixFrom = g.track === 'random' ? NORMAL_IDS : g.track === 'hard' ? HARD_IDS : null;
  g.trackId = mixFrom ? pick(mixFrom.filter((id) => id !== g.trackId)) : g.track;
  g.racers = room.players.filter((p) => p.connected).map((p) => p.id);
  g.cars = gridCars(room, g);
  g.t = 0;
  g.count = 0;
  g.result = null;
  g.firstIn = null;
  g.last = null;
  g.bumps = [];
  g.honks = [];
  g.rainbow = rainbow(room);
  g.weather = pickWeather(room);
  g.falls = [];
  betting.reset(g);
  // Everyone starts with the least bet on their own car, already placed: change it if you like.
  g.autoBets = {};
  for (const id of g.racers) autoBet(g, id);
  g.bettingAt = Date.now();
  g.phase = 'betting';
  const wx = WEATHERS[g.weather];
  const name = trackOf(g.trackId).name;
  if (g.rainbow) ctx.log(room, `🌈 Rainbow Road: ${name}, floating among the stars. No walls: fall off and you drink!`);
  else if (spooky(room) && SPOOKY_WEATHER[g.weather]) ctx.log(room, SPOOKY_WEATHER[g.weather].replace('{track}', name));
  else ctx.log(room, `${wx.emoji} ${wx.label} at ${name}: ${wx.says}`);
}

// A racer's bet before they've made one: a sip (the least there is) on themselves.
function autoBet(g, id) {
  if (g.bets[id] || !betting.bet(g, id, id, 1, g.racers)) return;
  (g.autoBets ||= {})[id] = true;
}

function countdown(room, ctx) {
  const g = room.game;
  g.count -= 1;
  if (g.count > 0) return ctx.setTimer(room, COUNT_MS, () => countdown(room, ctx));
  g.phase = 'race';
  g.clock = Date.now() + TICK_MS; // when the first step is due (see tick)
  const off = `Race ${g.race} is off: ${g.laps} laps of ${trackOf(g.trackId).name}`;
  ctx.log(room, g.rainbow ? `🌈 ${off}. Mind the edge!` : spooky(room) ? `👻 BOO! ${off}, if you dare!` : `🏁 ${off}!`);
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
  b.line = clamp(b.line + (Math.random() - 0.5) * 6 * (1.2 - skill), -tr.width * 0.35 * (1.1 - skill), tr.width * 0.35 * (1.1 - skill));
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
  // Rainbow Road, with no walls to lean on: easier into the bends, and if it's about to go over
  // the edge, back toward the middle and off the gas (a good driver sees it coming sooner).
  if (g.rainbow) {
    want *= 0.82 + 0.1 * skill;
    const soon = 0.2 + 0.3 * skill;
    const at = locate(tr, c.x + c.vx * soon, c.y + c.vy * soon, c.seg);
    if (at.dist > tr.edge - 2 - tr.width * 0.25 * skill && b.slip <= 0) {
      let back = Math.atan2(at.py - c.y, at.px - c.x) - c.a;
      back = Math.atan2(Math.sin(back), Math.cos(back));
      const k = Math.random() < 0.3 + 0.7 * skill ? 1 : 0.3; // (a bad one is slow to react)
      steer = clamp(steer * (1 - k) + back * 3 * k, -1, 1);
      if (speed > 70) return { steer, gas: 0, brake: 1 };
    }
  }
  return { steer, gas: speed < want ? 1 : 0, brake: speed > want + 20 ? 1 : 0 };
}

// One step of the physics for one car.
function moveCar(g, tr, c, dt) {
  const fx = Math.cos(c.a);
  const fy = Math.sin(c.a);
  let fwd = c.vx * fx + c.vy * fy;
  let side = -c.vx * fy + c.vy * fx;
  const loc = locate(tr, c.x, c.y, c.seg);
  // (Rainbow Road has no grass: it's road, or it's space.)
  c.grass = !g.rainbow && loc.dist > tr.width / 2 + 2;
  // Being put back after a fall: stopped where it was dropped till it's back in the race.
  if (c.respawn > 0) {
    c.respawn = Math.max(0, c.respawn - dt);
    c.vx = 0;
    c.vy = 0;
    return null;
  }
  const top = c.grass ? tr.topGrass : CAR.top;
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
  // Hills (the hard maps): slower uphill, faster down.
  if (tr.hilly) fwd -= CAR.gravity * tr.slope[loc.i] * Math.cos(c.a - tr.dir[loc.i]) * dt;
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
  // The wall: past the grass, back you come. (Rainbow Road: past the edge, down you go.)
  const at = locate(tr, c.x, c.y, loc.i);
  const edge = tr.edge;
  if (g.rainbow) {
    if (at.dist > edge && g.phase === 'race' && c.finished == null) {
      fall(g, tr, c, at);
      return null;
    }
  } else if (at.dist > edge) {
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
  c.z = heightAt(tr, now);
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
      // (One on the bridge and one under it pass each other; nor does anyone hit a car that's being
      // put back on Rainbow Road.)
      if (Math.abs(a.z - b.z) > LEVEL_GAP || a.respawn > 0 || b.respawn > 0) continue;
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
// Flags: 1 drifting, 2 on the grass, 4 finished, 8 braking, 16 being put back after a fall (Rainbow
// Road). `f`: who fell this tick, [id, 1 if they drink for it].
function snapshot(g) {
  const order = standings(g);
  return {
    r: g.race,
    t: Math.round(g.t * 1000) / 1000,
    c: g.cars.map((c) => [
      Math.round(c.x * 10) / 10,
      Math.round(c.y * 10) / 10,
      Math.round(c.a * 100) / 100,
      (c.drift ? 1 : 0) | (c.grass ? 2 : 0) | (c.finished != null ? 4 : 0) | (c.brake && g.phase === 'race' ? 8 : 0) | (c.respawn > 0 ? 16 : 0),
      order.indexOf(c.id) + 1,
      lapOf(g, c),
    ]),
    b: g.bumps,
    h: g.honks,
    ...(g.falls?.length ? { f: g.falls } : {}),
  };
}

function tick(room, ctx) {
  const g = room.game;
  if (g.phase !== 'race') return undefined;
  const tr = trackOf(g.trackId);
  // A fixed step on the wall clock: g.clock is when the next step is due. A timer is always a
  // little late, so the next one is set for that step's time, not TICK_MS from now (chained 50 ms
  // timers ran the race ~2 % slow, and the screens, drawing on the race's own clock, kept slipping
  // behind it). A late tick catches up (a step or two); after a long stall the race just carries
  // on from now rather than leaping ahead.
  const now = Date.now();
  const due = Math.floor((now - g.clock) / TICK_MS) + 1;
  const steps = clamp(due, 1, 3);
  g.clock = due > 3 ? now + TICK_MS : g.clock + steps * TICK_MS;
  g.bumps = [];
  g.falls = [];
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
        if (what === 'finish') {
          c.finished = g.t;
          news = true;
          const place = g.cars.filter((x) => x.finished != null).length;
          if (place === 1) g.firstIn = g.t;
          const icon = spooky(room) ? (place === 1 ? '🎃' : '🦇') : place === 1 ? '🏆' : '🏁';
          ctx.log(room, `${icon} ${ctx.name(room, c.id)} finishes ${ordinal(place)} (${g.t.toFixed(1)}s)`);
        }
        if (c.fell) {
          // Off Rainbow Road: a sip, unless they've only just had one for it.
          c.fell = false;
          const drinks = g.t - c.drankAt >= RAINBOW.cooldown;
          if (drinks) {
            c.drankAt = g.t;
            ctx.drink(room, c.id, RAINBOW.sips, 'fell off Rainbow Road');
            g.drank[c.id] = (g.drank[c.id] || 0) + RAINBOW.sips;
            news = true;
          }
          g.falls.push([c.id, drinks ? 1 : 0]);
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
  ctx.setTimer(room, Math.max(0, g.clock - Date.now()), () => tick(room, ctx));
  // Only a finish needs the whole state sent again (its line in the feed). A lap doesn't: every
  // screen has the laps and places from the 'cars' it gets anyway, and with a dozen cars a whole
  // state for each lap of each was a broadcast every second or so.
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
  ctx.log(room, spooky(room) ? `🎃 ${ctx.name(room, winner)} wins race ${g.race}, and escapes the graveyard alive!` : `🏆 ${ctx.name(room, winner)} wins race ${g.race}!`);
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
      choices: [
        { value: 'random', label: '🔀 Mix it up' },
        ...NORMAL_IDS.map((id) => ({ value: id, label: TRACKS[id].name })),
        { value: 'hard', label: '🔥 Mix it up (hard)' },
        ...HARD_IDS.map((id) => ({ value: id, label: `🔥 ${TRACKS[id].name}` })),
      ],
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
      looks: {}, // id -> their car's look (see carLook), once they've picked one
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
    if (action.type === 'car') {
      // Not while the cars are on the grid or racing (what you're driving stays put till the flag).
      if (g.phase === 'countdown' || g.phase === 'race') return 'quiet';
      g.looks[me] = carLook(action);
      return undefined;
    }
    if (action.type === 'bet' && g.phase === 'betting') {
      if (betting.bet(g, me, action.car, action.sips, g.racers) && g.autoBets) delete g.autoBets[me];
    } else if (action.type === 'startRace' && g.phase === 'betting' && host && Object.keys(g.bets).length) {
      g.phase = 'countdown';
      g.count = 3;
      g.rainbow = rainbow(room); // (the room may have changed while the bets went on)
      ctx.setTimer(room, COUNT_MS, () => countdown(room, ctx));
    } else if (action.type === 'give') {
      betting.give(room, ctx, me, action.alloc, `${ctx.name(room, g.winner)} won`);
    } else if (action.type === 'skipGive' && host) {
      betting.skip(room, ctx); // (lib/give.js: don't wait on a winner who's gone quiet)
    } else if (action.type === 'nextRace' && (g.phase === 'results' || g.phase === 'payout') && host) {
      newRace(room, ctx);
    }
    return undefined;
  },

  bot(room, me, ctx, skill) {
    const g = room.game;
    const host = room.hostId === me.id;
    if (g.phase === 'betting') {
      // A car of its own first (any old one), then its own bet in place of the one it was given.
      const fresh = !g.bets[me.id] || g.autoBets?.[me.id];
      if (!g.looks[me.id] && fresh) return { type: 'car', body: pick(BODIES), paint: Math.random() < 0.5 ? null : pick(PAINTS), stripe: Math.random() < 0.5 ? null : pick(PAINTS), extra: pick(EXTRAS) };
      if (fresh) return { type: 'bet', car: botPick(room, g, me, skill), sips: betting.botSips(g.maxBet, skill) };
      // (A bot host gives the people a while to change their bets, then goes.)
      const players = ctx.connectedPlayers(room);
      const botsBetting = players.some((p) => p.bot && (!g.bets[p.id] || g.autoBets?.[p.id]));
      const peopleBetting = players.some((p) => !p.bot && g.autoBets?.[p.id]) && Date.now() - (g.bettingAt || 0) < 15000;
      return host && !botsBetting && !peopleBetting ? { type: 'startRace' } : null;
    }
    if (g.phase === 'race') {
      // A toot now and then: at whoever's in the way, or just because. The race doesn't broadcast
      // (bots are asked again on every broadcast), so a bot with nothing to toot about looks again
      // every couple of seconds, about as often as the laps used to wake it.
      const car = carOf(g, me.id);
      if (!car || car.finished != null) return null;
      const later = { type: '_wait', delay: 2000 + Math.random() * 1000 };
      if (g.t - car.honkAt < HONK_GAP_S + 1) return later;
      const near = g.cars.some((c) => c !== car && Math.hypot(c.x - car.x, c.y - car.y) < 60);
      return near || steady(me.id, g.race, Math.floor(g.t / 5)) < 0.5 ? { type: 'honk', delay: 300 } : later;
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
    // (Everyone has a bet from the start, so betting only waits on the host to start.)
    return betting.waitingOn(room, { full: true });
  },

  onJoin(room, player) {
    const g = room.game;
    g.order.push(player.id);
    // Here before the lights: they get a car in this race, at the back of the grid.
    if (g.phase === 'betting' && !g.racers.includes(player.id)) {
      g.racers.push(player.id);
      g.cars = gridCars(room, g);
      autoBet(g, player.id);
    }
  },

  view(room, player) {
    const g = room.game;
    const tr = trackOf(g.trackId);
    return {
      ...betting.view(g, player.id),
      autoBet: !!g.autoBets?.[player.id], // (still the sip on yourself everyone starts with)
      race: g.race,
      laps: g.laps,
      weather: g.weather || 'clear',
      rainbow: !!g.rainbow,
      count: g.count,
      tickMs: TICK_MS,
      track: {
        id: tr.id,
        name: tr.name,
        width: tr.width,
        band: tr.band,
        hard: tr.hard,
        world: WORLD,
        crossing: tr.crossing,
        // The centreline, every other sample (screens smooth it again), and on the hilly hard maps
        // how high it is there too. (Made once per track: it's in every view of every broadcast.)
        line: (tr.line ||= tr.xs.filter((_, i) => i % 2 === 0).map((x, i) => (tr.hilly ? [Math.round(x), Math.round(tr.ys[i * 2]), Math.round(tr.zs[i * 2] * 10) / 10] : [Math.round(x), Math.round(tr.ys[i * 2])]))),
        start: (tr.start ||= [Math.round(tr.xs[0]), Math.round(tr.ys[0]), Math.round(tr.dir[0] * 100) / 100]),
      },
      racers: g.racers,
      carIds: g.cars.map((c) => c.id), // the order cars come in, in every 'cars' update
      cars: snapshot(g),
      result: g.result,
      last: g.last,
      lastSips: g.lastSips,
      wins: g.wins,
      // Everyone's car (the plain one for anyone who hasn't picked), with their seat for a number
      // on it; and what this phone picked, if it has (or it sends the one it remembers).
      looks: Object.fromEntries(room.players.map((p) => [p.id, { ...(g.looks[p.id] || CAR_LOOK), n: g.order.indexOf(p.id) + 1 || room.players.indexOf(p) + 1 }])),
      myLook: g.looks[player.id] || null,
      carParts: { bodies: BODIES, extras: EXTRAS, paints: PAINTS },
    };
  },

  // For tests.
  trackOf,
  NORMAL_IDS,
  HARD_IDS,
  locate,
  standings,
  tick,
  pickWeather,
  carLook,
  BODIES,
  EXTRAS,
  PAINTS,
  WEATHERS,
  WIDTH,
  BAND,
  RAINBOW,
  RAINBOW_ROOM,
};
