// Horse Race: six horses on an oval track. Everyone bets sips on a horse, then the race runs on its
// own. Each horse has a running speed that changes the way a real race does: they break from the
// gate, settle into a pace (each horse's form is a little different every race), and at random
// moments one kicks on for a couple of seconds or fades. Speeds change gradually, so a horse
// moves smoothly, but who's in front keeps changing. First past the post after the set
// number of laps wins; everyone who backed another horse drinks their bet, and the winners hand
// out their winnings (their bet, or double) to whoever they like.
//
// Jockey mode: each horse can be backed by only one player, who rides it. Their phone shows a dial
// with a needle sweeping across red, yellow and green: a tap on green speeds the horse up, red
// slows it down, yellow does nothing. The faster the horse, the faster the needle.

const betting = require('../lib/betting');

const HORSES = [
  { id: '1', name: 'Thunder', silk: '#e53950', coat: 'bay' },
  { id: '2', name: 'Lucky Lager', silk: '#3d7cff', coat: 'black' },
  { id: '3', name: 'Tipsy Tina', silk: '#f5c518', coat: 'chestnut' },
  { id: '4', name: 'Last Call', silk: '#2fbf71', coat: 'grey' },
  { id: '5', name: 'Hangover Hank', silk: '#9b5cff', coat: 'palomino' },
  { id: '6', name: 'Jägerbomb', silk: '#ff8a1f', coat: 'white' },
];
const IDS = HORSES.map((h) => h.id);
// Colours a backer can pick: jockey silks (the horse's colour in lists too) and the horse's coat.
const SILKS = ['#e53950', '#3d7cff', '#f5c518', '#2fbf71', '#9b5cff', '#ff8a1f', '#ff5cc8', '#22c3e6', '#8d5a3b', '#111111', '#f4f4f4', '#7fdb3f'];
const COATS = ['bay', 'chestnut', 'black', 'grey', 'palomino', 'white'];
const horseName = (g, id) => g.horses.find((h) => h.id === id)?.name ?? '?';

// The race runs in ticks. Speeds are in laps a second: about 25 seconds a lap at normal pace.
const TICK_MS = 300;
const PACE = { normal: 1 / 25, fast: 1 / 15 };
const FORM = 0.06; // each horse runs up to 6% faster or slower than the pace this race
const KICK_CHANCE = 0.05; // per tick, a horse starts a kick (or a fade)
const KICK = [1.18, 1.4]; // a kick: this much faster for a couple of seconds
const FADE = [0.78, 0.9]; // a fade: this much slower
const SURGE_TICKS = [4, 12]; // how long a kick or fade lasts
const RESPONSE = 0.3; // how quickly a horse's speed moves toward what it's aiming for each tick
const WOBBLE = 0.05; // random wobble in speed each tick, as a share of the pace

// Jockey mode: each horse's speed multiplier, and how a tap on the dial changes it.
const SPEED_MIN = 0.4;
const SPEED_MAX = 2.2;
const HIT = { green: 0.12, yellow: 0, red: -0.25 };
const TAP_GAP_MS = 250; // fastest a jockey can tap

function newRace(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.race += 1;
  g.progress = Object.fromEntries(IDS.map((id) => [id, 0])); // in laps
  g.vel = Object.fromEntries(IDS.map((id) => [id, 0])); // laps a second: everyone starts from the gate
  g.form = Object.fromEntries(IDS.map((id) => [id, 1 + (Math.random() * 2 - 1) * FORM]));
  g.surge = Object.fromEntries(IDS.map((id) => [id, { factor: 1, left: 0 }]));
  g.mult = Object.fromEntries(IDS.map((id) => [id, 1]));
  g.lastTap = {};
  g.ticks = 0;
  betting.reset(g);
  g.phase = 'betting';
}

function tick(room, ctx, rand = Math.random) {
  const g = room.game;
  if (g.phase !== 'race') return;
  g.ticks += 1;
  const pace = PACE[g.speed];
  const between = ([lo, hi]) => lo + rand() * (hi - lo);
  for (const id of IDS) {
    // Now and then a horse kicks on (more often) or fades for a couple of seconds.
    const s = g.surge[id];
    if (!s.left && rand() < KICK_CHANCE) {
      s.factor = rand() < 0.65 ? between(KICK) : between(FADE);
      s.left = Math.round(between(SURGE_TICKS));
    }
    const aim = pace * g.form[id] * (s.left ? s.factor : 1) * g.mult[id];
    if (s.left) s.left -= 1;
    const wobble = (rand() * 2 - 1) * WOBBLE * pace;
    g.vel[id] = Math.max(pace * 0.25, g.vel[id] + (aim - g.vel[id]) * RESPONSE + wobble);
    g.progress[id] += g.vel[id] * (TICK_MS / 1000);
  }
  const done = IDS.filter((id) => g.progress[id] >= g.laps);
  if (done.length) {
    // A photo finish goes to whoever got furthest.
    const winner = done.reduce((a, b) => (g.progress[b] > g.progress[a] ? b : a));
    ctx.clearTimer(room);
    ctx.log(room, `🏆 ${horseName(g, winner)} wins the race!`);
    betting.settle(room, ctx, winner, (id) => horseName(g, id));
    return;
  }
  ctx.setTimer(room, TICK_MS, () => tick(room, ctx));
}

// ---------- Bots ----------

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

// A bot's bet: good bots keep it modest (a sip or two), bad ones go big. Nothing on the screen says
// which horse will win (form is hidden), so everyone picks at random.
function botSips(maxBet, skill) {
  const cap = Math.min(maxBet, Math.max(1, Math.round(maxBet * (1.1 - skill))));
  const floor = Math.max(1, Math.round(cap * (1 - skill)));
  return floor + Math.floor(Math.random() * (cap - floor + 1));
}

// A winning bot's sips, each to someone at random: a human here when there is one.
function botAlloc(room, me, total) {
  const others = room.players.filter((p) => p.id !== me.id && p.connected);
  const pool = others.some((p) => !p.bot) ? others.filter((p) => !p.bot) : others;
  if (!pool.length) return null;
  const alloc = {};
  for (let i = 0; i < total; i++) {
    const to = pickOne(pool).id;
    alloc[to] = (alloc[to] || 0) + 1;
  }
  return JSON.stringify(alloc);
}

// A jockey bot's tap. The phone judges where the needle was and sends the colour, so a bot
// "aims" by choosing it: good bots hit green nearly every time, bad ones often miss into red.
function botHit(skill) {
  const r = Math.random();
  if (r < 0.3 + 0.6 * skill) return 'green';
  return r < 1 - (1 - skill) * 0.4 ? 'yellow' : 'red';
}

module.exports = {
  id: 'horseRace',
  name: 'Horse Race',
  description: 'Bet sips on one of six horses lurching round an oval track. Losers drink their bet; winners hand out theirs.',
  // A reminder of the rules, shown on the TV.
  rules: [
    "Bet sips on a horse.",
    "The race runs itself: horses kick on and fade at random.",
    "Losers drink their bet; winners hand out theirs (or double).",
    "Jockey mode: tap green on the dial to speed up, red slows you down.",
  ],
  minPlayers: 2,
  order: 8,
  HORSES,
  options: [
    { id: 'laps', label: 'Laps', default: 2, choices: [1, 2, 3, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'racers', label: 'Racers', default: 'horses', choices: [{ value: 'horses', label: '🏇 Racehorses' }, { value: 'animals', label: '🐘 Animals' }] },
    {
      id: 'jockey',
      label: 'Be the jockey: one player per horse, ride it with a dial',
      default: false,
      choices: [{ value: false, label: 'Off' }, { value: true, label: 'On' }],
    },
    ...betting.options,
    { id: 'speed', label: 'Race speed', default: 'normal', choices: [{ value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }] },
  ],

  start(room, ctx, options = {}) {
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      laps: [1, 2, 3, 5].includes(options.laps) ? options.laps : 2,
      speed: options.speed === 'fast' ? 'fast' : 'normal',
      jockey: options.jockey === true,
      racers: options.racers === 'animals' ? 'animals' : 'horses',
      // Names and colours: backers can change them, and they last the whole game.
      horses: HORSES.map((h) => ({ ...h })),
      ...betting.fromOptions(options),
      race: 0,
    });
    newRace(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const host = me === room.hostId;

    if (action.type === 'bet' && g.phase === 'betting') {
      // Jockey mode: one rider per horse.
      const taken = g.jockey && Object.entries(g.bets).some(([id, b]) => id !== me && b.pick === action.horse);
      if (!taken) betting.bet(g, me, action.horse, action.sips, IDS);
    } else if (action.type === 'ride' && g.phase === 'race' && g.jockey && g.bets[me] && Object.hasOwn(HIT, action.hit)) {
      const now = Date.now();
      if (now - (g.lastTap[me] || 0) < TAP_GAP_MS) return;
      g.lastTap[me] = now;
      const h = g.bets[me].pick;
      g.mult[h] = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round((g.mult[h] + HIT[action.hit]) * 100) / 100));
    } else if (action.type === 'startRace' && g.phase === 'betting' && host && Object.keys(g.bets).length) {
      g.phase = 'race';
      ctx.log(room, `🔔 Race ${g.race} is off: ${g.laps} lap${g.laps === 1 ? '' : 's'}!`);
      ctx.setTimer(room, TICK_MS, () => tick(room, ctx));
    } else if (action.type === 'style' && g.phase === 'betting' && g.bets[me]) {
      // Rename or recolour the horse you've backed. Silks must differ from the other horses'.
      const h = g.horses.find((x) => x.id === g.bets[me].pick);
      const name = typeof action.name === 'string' ? action.name.replace(/\s+/g, ' ').trim().slice(0, 16) : '';
      if (name && !g.horses.some((x) => x !== h && x.name.toLowerCase() === name.toLowerCase())) h.name = name;
      if (SILKS.includes(action.silk) && !g.horses.some((x) => x !== h && x.silk === action.silk)) h.silk = action.silk;
      if (COATS.includes(action.coat)) h.coat = action.coat;
    } else if (action.type === 'give') {
      betting.give(room, ctx, me, action.alloc, `${horseName(g, g.winner)} won`);
    } else if (action.type === 'nextRace' && (g.phase === 'results' || g.phase === 'payout') && host) {
      newRace(room, ctx);
    }
  },

  bot(room, me, ctx, skill) {
    const g = room.game;
    const host = room.hostId === me.id;
    if (g.phase === 'betting') {
      if (!g.bets[me.id]) {
        // Jockey mode: only a horse nobody else rides.
        const free = IDS.filter((id) => !g.jockey || !Object.values(g.bets).some((b) => b.pick === id));
        if (!free.length) return null;
        return { type: 'bet', horse: pickOne(free), sips: botSips(g.maxBet, skill) };
      }
      // The host's bot starts once everyone who can bet has (in jockey mode, horses run out).
      const full = g.jockey && Object.keys(g.bets).length >= IDS.length;
      const waiting = ctx.connectedPlayers(room).some((p) => !g.bets[p.id]);
      if (host && (full || !waiting)) return { type: 'startRace' };
      return null;
    }
    if (g.phase === 'race' && g.jockey && g.bets[me.id]) {
      // A tap every so often, never faster than the dial allows; good jockeys tap quicker.
      return { type: 'ride', hit: botHit(skill), delay: TAP_GAP_MS + 100 + Math.random() * 400 + (1 - skill) * 700 };
    }
    if (g.phase === 'payout' && g.payout[me.id] && !g.payout[me.id].done) {
      const alloc = botAlloc(room, me, g.payout[me.id].total);
      return alloc && { type: 'give', alloc };
    }
    if (g.phase === 'results' && host) return { type: 'nextRace' };
    return null;
  },

  // A winner who leaves doesn't hold up the payout.
  check(room, ctx) {
    betting.checkPayout(room, ctx);
  },

  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room, player) {
    const g = room.game;
    return {
      ...betting.view(g, player.id),
      race: g.race,
      laps: g.laps,
      speed: g.speed,
      tickMs: TICK_MS,
      vel: g.vel,
      jockey: g.jockey,
      racers: g.racers,
      horses: g.horses,
      silks: SILKS,
      coats: COATS,
      mult: g.mult,
      progress: g.progress,
      ticks: g.ticks,
    };
  },

  tick,
  HIT,
};
