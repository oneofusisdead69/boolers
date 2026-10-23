// Slevens (7-Eleven Doubles). The app only follows the roller; the drinking happens at the table.
//
// The roller rolls two dice, and the dot for the next roll appears straight away. On a 7, 11 or
// doubles the roller must leave it alone for 5 seconds: that's a HIT. Someone at the table
// drinks, and the next roll takes one more dot to trace (a single tap, then 2 dots, then 3...),
// racing to hit again before they finish. Touching the dot within 5 seconds of a hit means the
// roller wasn't reading the dice: that's a REVERSE, and the roller picks who rolls next.
// On anything else the roller just presses the dot and traces to roll again.
// The red arrow passes the dice to the next player (the drinker finished first). The dice only
// change hands on a REVERSE or the arrow, and a new roller starts at a single tap.

const SPIN_MS = 800;
const WINDOW_MS = 5000;
const WINDOW_GRACE_MS = 600; // allowance for network lag on the 5-second window

function isHit([a, b]) {
  return a + b === 7 || a + b === 11 || a === b;
}

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

const traceLen = (g) => g.hits + 1;

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
  g.dice = null;
  ready(room, ctx);
}

// The dice have landed and the next roll's dot is showing. For 5 seconds, touching it on a
// hit is a REVERSE; once the 5 seconds pass, a hit counts and the next roll gets one more dot.
function openWindow(room, ctx) {
  const g = room.game;
  ready(room, ctx);
  g.phase = 'window';
  g.windowEndsAt = Date.now() + WINDOW_MS;
  ctx.setTimer(room, WINDOW_MS + WINDOW_GRACE_MS, () => {
    if (isHit(g.dice)) {
      g.hits += 1;
      g.hit = true;
      ctx.log(room, `🍺 ${ctx.name(room, g.rollerId)} hit ${g.dice.join(' + ')}!`);
      ready(room, ctx); // one more dot
    } else {
      g.phase = 'ready'; // same dots, roll whenever
    }
  });
}

module.exports = {
  id: 'slevens',
  name: 'Slevens',
  description: 'Roll 7, 11 or doubles and keep your hands off for 5 seconds. Each hit adds a dot to trace.',
  minPlayers: 2,
  order: 2,

  start(room, ctx) {
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      rollNo: 0,
    });
    newTurn(room, ctx, ctx.turns.first(room, room.game.order));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    if (player.id !== g.rollerId) return;

    if (action.type === 'press' && g.phase === 'window' && isHit(g.dice)) {
      // Touched the dot on a hit before the 5 seconds were up.
      ctx.clearTimer(room);
      g.phase = 'reverse';
      ctx.log(room, `🔄 ${player.name} touched the dot on a ${g.dice.join(' + ')}. REVERSE!`);
    } else if (action.type === 'roll' && (g.phase === 'ready' || (g.phase === 'window' && !isHit(g.dice)))) {
      ctx.clearTimer(room);
      g.hit = false;
      g.dice = ctx.dice.roll(2);
      g.phase = 'spinning';
      ctx.setTimer(room, SPIN_MS, () => openWindow(room, ctx));
    } else if (action.type === 'pick' && g.phase === 'reverse') {
      const target = ctx.player(room, action.targetId);
      if (!target || target.id === player.id) return;
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

  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room) {
    const g = room.game;
    return {
      rollerId: g.rollerId,
      hits: g.hits,
      hit: g.hit,
      traceLen: traceLen(g),
      rollNo: g.rollNo,
      dots: g.dots,
      dice: g.phase === 'spinning' ? null : g.dice, // keep the result secret while spinning
    };
  },

  isHit,
  inDiceZone,
  inArrowZone,
};
