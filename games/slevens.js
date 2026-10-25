// Slevens (7-Eleven Doubles). The app only follows the roller; the drinking happens at the table.
//
// The roller rolls two dice, and the dot for the next roll appears straight away. On a 7, 11 or
// doubles the roller must leave it alone for 3 seconds: that's a HIT. Someone at the table
// drinks, and the next roll takes one more dot to trace (a single tap, then 2 dots, then 3...),
// racing to hit again before they finish. Touching the dot within 3 seconds of a hit means the
// roller wasn't reading the dice: that's a REVERSE, and the roller picks who rolls next.
// On anything else the roller just presses the dot and traces to roll again.
// Snake eyes: if a turn's first hit is 1 + 1, only another 1 + 1 counts as a hit until one comes up.
// The red arrow passes the dice to the next player (the drinker finished first). The dice only
// change hands on a REVERSE or the arrow, and a new roller starts at a single tap.

const { steady } = require('../lib/random');
const { pickHuman } = require('../lib/bots');
const { optionValues } = require('../lib/options');
const { isActive } = require('../lib/turns');

const SPIN_MS = [100, 1000, 2000, 3000]; // host picks how long the dice roll in the lobby
const WINDOW_SECONDS = [2, 3, 4, 5]; // host picks the hands-off time in the lobby
const WINDOW_GRACE_MS = 300; // allowance for network lag on the hands-off window

function isHit([a, b]) {
  return a + b === 7 || a + b === 11 || a === b;
}

const isSnakeEyes = ([a, b]) => a === 1 && b === 1;

// What counts as a hit right now: in snake eyes mode, only another snake eyes.
const hits = (g) => (g.snakeEyes ? isSnakeEyes(g.dice) : isHit(g.dice));

// Random dot positions as percentages of the touch pad. Dots stay clear of the pass arrow in
// the corner, and consecutive dots are kept apart so every trace needs a real drag. The first
// dot stays off the dice so it never hides the roll; the rest may cover them.
function inDiceZone(d) {
  return d.x > 14 && d.x < 86 && d.y > 36 && d.y < 64;
}
function inArrowZone(d) {
  return d.x > 76 && d.y > 82;
}

function randomDots(count) {
  const dots = [];
  while (dots.length < count) {
    const dot = { x: Math.round(10 + Math.random() * 80), y: Math.round(8 + Math.random() * 82) };
    const prev = dots[dots.length - 1];
    if (inArrowZone(dot) || (dots.length === 0 && inDiceZone(dot))) continue;
    if (prev && Math.hypot(dot.x - prev.x, dot.y - prev.y) < 30) continue;
    dots.push(dot);
  }
  return dots;
}

// With dot connect off, every roll is a single tap.
const traceLen = (g) => (g.dotConnect ? g.hits + 1 : 1);

// Ready to roll, with a fresh set of dots.
function ready(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.phase = 'ready';
  g.rollNo += 1;
  g.dots = randomDots(traceLen(g));
}

// A fresh turn: no streak, a single tap to roll.
function newTurn(room, ctx, playerId) {
  const g = room.game;
  g.rollerId = playerId;
  g.hits = 0;
  g.hit = false;
  g.snakeEyes = false;
  g.dice = null;
  ready(room, ctx);
}

// The dice have landed and the next roll's dot is showing. Until the hands-off time is up,
// touching it on a hit is a REVERSE; after that, a hit counts and the next roll gets one more dot.
function openWindow(room, ctx) {
  const g = room.game;
  ready(room, ctx);
  g.phase = 'window';
  ctx.setTimer(room, g.windowMs + WINDOW_GRACE_MS, () => {
    if (hits(g)) {
      const snake = isSnakeEyes(g.dice);
      // A first hit of snake eyes starts snake eyes mode; the next snake eyes ends it.
      g.snakeEyes = snake && !g.snakeEyes && g.hits === 0;
      g.hits += 1;
      g.hit = snake ? 'snake' : true;
      ctx.log(room, snake
        ? `🐍 ${ctx.name(room, g.rollerId)} hit snake eyes!${g.snakeEyes ? ' Only snake eyes hits now' : ''}`
        : `🍺 ${ctx.name(room, g.rollerId)} hit ${g.dice.join(' + ')}!`);
      ready(room, ctx); // one more dot
    } else {
      g.phase = 'ready'; // same dots, roll whenever
    }
  });
}

// ---------- Bots ----------

// How long a bot takes to trace this roll's dots (ms): a good one is quick and steady.
const traceMs = (g, skill) => (250 + 300 * g.dots.length) * (1.7 - skill) + Math.random() * 200;

function bot(room, me, ctx, skill) {
  const g = room.game;
  if (me.id !== g.rollerId || g.phase === 'spinning') return null;
  // A flinch or a pass is decided once per roll (see steady), not re-rolled each time it's asked.
  const seed = (tag) => steady(me.id, g.rollNo, g.dots[0]?.x, g.dots[0]?.y, tag);

  // A REVERSE: hand the dice to someone else.
  if (g.phase === 'reverse') {
    const targetId = pickHuman(room, me.id, g.order.filter((id) => ctx.turns.isActive(room, id)));
    return targetId ? { type: 'pick', targetId } : null;
  }

  // A miss after a streak: the drinker may have finished by now, so sometimes pass the dice on.
  const missed = g.dice && (g.phase === 'window' ? !hits(g) : !g.hit);
  if (missed && g.hits > 0 && seed('pass') < 0.3) return { type: 'pass', delay: 600 + Math.random() * 600 };

  if (g.phase === 'window') {
    if (hits(g)) {
      // Hands off! A bad bot sometimes touches the dot anyway before the time's up: a REVERSE.
      if (seed('flinch') < (1 - skill) * 0.4) return { type: 'press', delay: 200 + seed('when') * g.windowMs * 0.8 };
      return null;
    }
    // Not a hit: a good bot reads the dice and rolls again at once. A bad one sometimes doesn't
    // trust it and waits the hands-off time out first.
    if (seed('slow') < (1 - skill) * 0.5) return null;
    return { type: 'roll', delay: 300 * (1.5 - skill) + traceMs(g, skill) };
  }

  // Ready: trace the dots and roll. Right after a hit it's a race against the drinker.
  if (g.phase === 'ready') return { type: 'roll', delay: traceMs(g, skill) };
  return null;
}

module.exports = {
  id: 'slevens',
  name: 'Slevens',
  description: 'Roll 7, 11 or doubles and keep your hands off. Each hit adds a dot to trace.',
  // A reminder of the rules, shown on the TV.
  rules: [
    "Roll 7, 11 or doubles: that's a hit.",
    "After a hit, hands off the dice for a few seconds, or it's a REVERSE.",
    "Every hit means the next roll takes one more dot to trace.",
    "Snake eyes first? Only another snake eyes hits until it comes up.",
    "The arrow passes the dice on.",
  ],
  minPlayers: 2,
  order: 2,
  options: [
    {
      id: 'spinMs',
      label: 'Dice roll time',
      default: 1000,
      choices: SPIN_MS.map((ms) => ({ value: ms, label: `${ms / 1000} sec` })),
    },
    {
      id: 'seconds',
      label: 'Hands-off time after a hit',
      default: 3,
      choices: WINDOW_SECONDS.map((n) => ({ value: n, label: `${n} sec` })),
    },
    {
      id: 'dotConnect',
      label: 'Dot connect (one more dot per hit)',
      default: true,
      choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }],
    },
  ],

  start(room, ctx, options = {}) {
    const o = optionValues(module.exports.options, options);
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      spinMs: o.spinMs,
      windowMs: o.seconds * 1000,
      dotConnect: o.dotConnect,
      rollNo: 0,
    });
    newTurn(room, ctx, ctx.turns.first(room, room.game.order));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    if (player.id !== g.rollerId) return;

    if (action.type === 'press' && g.phase === 'window' && hits(g)) {
      // Touched the dot on a hit before the 3 seconds were up.
      ctx.clearTimer(room);
      g.phase = 'reverse';
      ctx.log(room, `🔄 ${player.name} touched the dot on a ${g.dice.join(' + ')}. REVERSE!`);
    } else if (action.type === 'roll' && (g.phase === 'ready' || (g.phase === 'window' && !hits(g)))) {
      ctx.clearTimer(room);
      g.hit = false;
      g.dice = ctx.dice.roll(2);
      g.phase = 'spinning';
      ctx.setTimer(room, g.spinMs, () => openWindow(room, ctx));
    } else if (action.type === 'pick' && g.phase === 'reverse') {
      const target = ctx.player(room, action.targetId);
      if (!target || target.id === player.id || !ctx.turns.isActive(room, target.id)) return;
      ctx.log(room, `🎲 ${player.name} picked ${target.name} to roll`);
      newTurn(room, ctx, target.id);
    } else if (action.type === 'pass' && g.phase !== 'spinning') {
      const next = ctx.turns.next(room, g.order, player.id);
      if (!next || next === player.id) return;
      ctx.log(room, `➡️ ${player.name} passed the dice to ${ctx.name(room, next)}`);
      newTurn(room, ctx, next);
    }
  },

  // If the roller leaves, the dice move on.
  check(room, ctx) {
    const g = room.game;
    if (ctx.turns.isActive(room, g.rollerId)) return;
    const next = ctx.turns.next(room, g.order, g.rollerId);
    if (next) newTurn(room, ctx, next);
  },

  // The roller holds the dice the whole turn: to roll, to keep their hands off (or not) after a
  // hit, to pick who's next. While the dice spin it's on the clock.
  waitingOn(room) {
    const g = room.game;
    return g.phase !== 'spinning' && isActive(room, g.rollerId) ? [g.rollerId] : [];
  },

  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room) {
    const g = room.game;
    return {
      rollerId: g.rollerId,
      hits: g.hits,
      hit: g.hit,
      snakeEyes: g.snakeEyes,
      traceLen: traceLen(g),
      seconds: g.windowMs / 1000,
      dotConnect: g.dotConnect,
      rollNo: g.rollNo,
      dots: g.dots,
      dice: g.phase === 'spinning' ? null : g.dice, // keep the result secret while spinning
    };
  },

  bot,

  isHit,
  inDiceZone,
  inArrowZone,
};
