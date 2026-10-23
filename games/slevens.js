// Slevens (7-Eleven Doubles). The app only follows the roller; the drinking happens at the table.
//
// The roller rolls two dice. After each roll a blue dot appears for 5 seconds: if the roll is a
// 7, 11 or doubles, tapping it in time is a REVERSE. Someone at the table drinks, and as soon as
// their cup touches their lips the roller rolls again, racing to hit before they finish. Every
// hit in a row makes rolling one dot harder: a single tap, then tracing 2 dots, then 3, and so
// on. Misses don't change the count. If the drinker finishes first, the roller taps the red
// arrow and the dice pass to the next player, back to a single tap.

const SPIN_MS = 800;
const CLAIM_MS = 5000;
const CLAIM_GRACE_MS = 600; // allowance for network lag on the 5-second window

function isHit([a, b]) {
  return a + b === 7 || a + b === 11 || a === b;
}

// Random dot positions as percentages of the touch pad. Dots stay clear of the pass arrow in
// the corner, and consecutive dots are kept apart so every trace needs a real drag. Trace dots
// may cover the dice; the claim dot doesn't (avoidDice), so the roll stays readable.
function inDiceZone(d) {
  return d.x > 14 && d.x < 86 && d.y > 36 && d.y < 64;
}
function inArrowZone(d) {
  return d.x > 76 && d.y > 82;
}

function randomDots(count, { avoidDice = false, awayFrom = null } = {}) {
  const dots = [];
  while (dots.length < count) {
    const dot = { x: Math.round(10 + Math.random() * 80), y: Math.round(8 + Math.random() * 82) };
    const prev = dots[dots.length - 1] || awayFrom;
    if (inArrowZone(dot) || (avoidDice && inDiceZone(dot))) continue;
    if (prev && Math.hypot(dot.x - prev.x, dot.y - prev.y) < 30) continue;
    dots.push(dot);
  }
  return dots;
}

const traceLen = (g) => g.hits + 1;

// Ready to roll. The next roll's dots are made here; keepDots leaves them where they are
// (they were already on screen during the claim window).
function ready(room, ctx, { keepDots = false } = {}) {
  const g = room.game;
  ctx.clearTimer(room);
  g.phase = 'ready';
  g.claimDot = null;
  if (!keepDots) {
    g.rollNo += 1;
    g.dots = randomDots(traceLen(g));
  }
}

// A fresh turn: no streak, a single tap to roll.
function newTurn(room, ctx, playerId) {
  const g = room.game;
  g.rollerId = playerId;
  g.hits = 0;
  g.reverse = false;
  g.dice = null;
  ready(room, ctx);
}

function openClaimWindow(room, ctx) {
  const g = room.game;
  g.phase = 'claim';
  // The next roll's dots appear straight away, so a miss doesn't cost the roller 5 seconds.
  g.rollNo += 1;
  g.dots = randomDots(traceLen(g));
  g.claimDot = randomDots(1, { avoidDice: true, awayFrom: g.dots[0] })[0];
  g.claimEndsAt = Date.now() + CLAIM_MS;
  ctx.setTimer(room, CLAIM_MS + CLAIM_GRACE_MS, () => {
    if (isHit(g.dice)) missedHit(room, ctx);
    ready(room, ctx, { keepDots: true });
  });
}

function missedHit(room, ctx) {
  const g = room.game;
  g.notice = 'Missed it! That was a hit.';
  ctx.log(room, `😬 ${ctx.name(room, g.rollerId)} missed a hit (${g.dice.join(' + ')})`);
}

module.exports = {
  id: 'slevens',
  name: 'Slevens',
  description: 'Hit 7, 11 or doubles to make someone drink, then race to hit again before they finish.',
  minPlayers: 2,
  order: 2,

  start(room, ctx) {
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      rollNo: 0,
      notice: '',
    });
    newTurn(room, ctx, ctx.turns.first(room, room.game.order));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    if (player.id !== g.rollerId) return;

    if (action.type === 'roll' && (g.phase === 'ready' || g.phase === 'claim')) {
      // Rolling on instead of tapping the blue dot means passing on a hit.
      if (g.phase === 'claim' && isHit(g.dice)) missedHit(room, ctx);
      else g.notice = '';
      ctx.clearTimer(room);
      g.reverse = false;
      g.dice = ctx.dice.roll(2);
      g.phase = 'spinning';
      ctx.setTimer(room, SPIN_MS, () => openClaimWindow(room, ctx));
    } else if (action.type === 'claim' && g.phase === 'claim') {
      if (isHit(g.dice)) {
        g.hits += 1;
        g.reverse = true;
        g.notice = '';
        ctx.log(room, `🔄 ${player.name} rolled ${g.dice.join(' + ')}. REVERSE!`);
        ready(room, ctx); // next roll, one dot harder
      } else {
        g.notice = 'Not a hit!';
        ctx.log(room, `🙈 ${player.name} tapped on a ${g.dice.join(' + ')}`);
        ready(room, ctx, { keepDots: true });
      }
    } else if (action.type === 'pass' && g.phase !== 'spinning') {
      const next = ctx.turns.next(room, g.order, player.id);
      if (!next || next === player.id) return;
      ctx.log(room, `➡️ ${player.name} passed the dice to ${ctx.name(room, next)}`);
      g.notice = '';
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
      reverse: g.reverse,
      traceLen: traceLen(g),
      rollNo: g.rollNo,
      dots: g.dots,
      claimDot: g.claimDot,
      claimEndsAt: g.claimEndsAt,
      claimMs: CLAIM_MS,
      dice: g.phase === 'spinning' ? null : g.dice, // keep the result secret while spinning
      notice: g.notice,
    };
  },

  isHit,
  inDiceZone,
  inArrowZone,
};
