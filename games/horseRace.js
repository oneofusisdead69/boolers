// Horse Race: six horses on an oval track, like the electric race games where the horses lurch
// forward at random. Everyone bets sips on a horse, then the race runs on its own: every tick each
// horse has a chance of being pushed forward a random amount. First past the post after the set
// number of laps wins; everyone who backed another horse drinks their bet, and the winners hand
// out their winnings (their bet, or double) to whoever they like.
//
// Jockey mode: each horse can be backed by only one player, who rides it. Their phone shows a dial
// with a needle sweeping across red, yellow and green: a tap on green speeds the horse up, red
// slows it down, yellow does nothing. The faster the horse, the faster the needle.

const betting = require('../lib/betting');

const HORSES = [
  { id: '1', name: 'Thunder', color: '#e53950' },
  { id: '2', name: 'Lucky Lager', color: '#3d7cff' },
  { id: '3', name: 'Tipsy Tina', color: '#f5c518' },
  { id: '4', name: 'Last Call', color: '#2fbf71' },
  { id: '5', name: 'Hangover Hank', color: '#9b5cff' },
  { id: '6', name: 'Jägerbomb', color: '#ff8a1f' },
];
const IDS = HORSES.map((h) => h.id);
const horseName = (id) => HORSES.find((h) => h.id === id)?.name ?? '?';

// One tick of the motor. Each horse gets a push with probability PUSH_CHANCE, of PUSH_MIN to
// PUSH_MAX of a lap: about 25 seconds a lap at normal speed.
const TICK_MS = { normal: 400, fast: 250 };
const PUSH_CHANCE = 0.4;
const PUSH_MIN = 0.015;
const PUSH_MAX = 0.065;

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
  for (const id of IDS) {
    if (rand() < PUSH_CHANCE) g.progress[id] += (PUSH_MIN + rand() * (PUSH_MAX - PUSH_MIN)) * g.mult[id];
  }
  const done = IDS.filter((id) => g.progress[id] >= g.laps);
  if (done.length) {
    // A photo finish goes to whoever got furthest.
    const winner = done.reduce((a, b) => (g.progress[b] > g.progress[a] ? b : a));
    ctx.clearTimer(room);
    ctx.log(room, `🏆 ${horseName(winner)} wins the race!`);
    betting.settle(room, ctx, winner, horseName);
    return;
  }
  ctx.setTimer(room, TICK_MS[g.speed], () => tick(room, ctx));
}

module.exports = {
  id: 'horseRace',
  name: 'Horse Race',
  description: 'Bet sips on one of six horses lurching round an oval track. Losers drink their bet; winners hand out theirs.',
  minPlayers: 2,
  order: 8,
  HORSES,
  options: [
    { id: 'laps', label: 'Laps', default: 2, choices: [1, 2, 3, 5].map((n) => ({ value: n, label: `${n}` })) },
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
      ctx.setTimer(room, TICK_MS[g.speed], () => tick(room, ctx));
    } else if (action.type === 'give') {
      betting.give(room, ctx, me, action.alloc, `${horseName(g.winner)} won`);
    } else if (action.type === 'nextRace' && (g.phase === 'results' || g.phase === 'payout') && host) {
      newRace(room, ctx);
    }
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
      tickMs: TICK_MS[g.speed],
      jockey: g.jockey,
      mult: g.mult,
      progress: g.progress,
      ticks: g.ticks,
    };
  },

  tick,
  HIT,
};
