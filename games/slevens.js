// Slevens (7-Eleven Doubles). The roller rolls two dice. After each roll a dot appears for
// 5 seconds: if the roll is a 7, 11 or doubles, tapping it in time is a REVERSE and the roller
// picks who rolls next. Every roll that doesn't end in a REVERSE makes the next roll harder:
// roll 1 is a single tap, roll 2 means tracing 2 dots, roll 3 means 3 dots, and so on.
// When the dice change hands, it goes back to a single tap.

const SPIN_MS = 1200;
const CLAIM_MS = 5000;
const CLAIM_GRACE_MS = 600; // allowance for network lag on the 5-second window
const FALSE_CLAIM_PENALTY = 2; // dots added for tapping the dot when it wasn't a hit

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

function randomDots(count, { avoidDice = false } = {}) {
  const dots = [];
  while (dots.length < count) {
    const dot = { x: Math.round(10 + Math.random() * 80), y: Math.round(8 + Math.random() * 82) };
    const prev = dots[dots.length - 1];
    if (inArrowZone(dot) || (avoidDice && inDiceZone(dot))) continue;
    if (prev && Math.hypot(dot.x - prev.x, dot.y - prev.y) < 30) continue;
    dots.push(dot);
  }
  return dots;
}

function ready(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.phase = 'ready';
  g.rollNo += 1;
  g.dots = g.traceLen > 1 ? randomDots(g.traceLen) : [];
  g.claimDot = null;
}

function giveDice(room, ctx, playerId) {
  const g = room.game;
  g.rollerId = playerId;
  g.traceLen = 1;
  g.dice = null;
  ready(room, ctx);
}

function endClaimWindow(room, ctx) {
  const g = room.game;
  if (g.phase !== 'claim') return;
  if (isHit(g.dice)) {
    g.notice = 'Missed it! That was a hit.';
    ctx.log(room, `😬 ${ctx.name(room, g.rollerId)} missed a hit (${g.dice.join(' + ')})`);
  } else {
    g.notice = '';
  }
  g.traceLen += 1;
  ready(room, ctx);
}

module.exports = {
  id: 'slevens',
  name: 'Slevens',
  description: '7, 11 or doubles to reverse. Every miss makes the next roll harder.',
  minPlayers: 2,
  order: 2,

  start(room, ctx) {
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      rollNo: 0,
      dice: null,
      notice: '',
    });
    giveDice(room, ctx, ctx.turns.first(room, room.game.order));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    if (player.id !== g.rollerId) return;

    if (action.type === 'roll' && g.phase === 'ready') {
      g.dice = ctx.dice.roll(2);
      g.notice = '';
      g.phase = 'spinning';
      ctx.setTimer(room, SPIN_MS, () => {
        g.phase = 'claim';
        g.claimDot = randomDots(1, { avoidDice: true })[0];
        g.claimEndsAt = Date.now() + CLAIM_MS;
        ctx.setTimer(room, CLAIM_MS + CLAIM_GRACE_MS, () => endClaimWindow(room, ctx));
      });
    } else if (action.type === 'claim' && g.phase === 'claim') {
      ctx.clearTimer(room);
      if (isHit(g.dice)) {
        g.phase = 'reverse';
        ctx.log(room, `🔄 ${player.name} rolled ${g.dice.join(' + ')}. REVERSE!`);
      } else {
        g.notice = `Not a hit! +${FALSE_CLAIM_PENALTY} dots.`;
        ctx.log(room, `🙈 ${player.name} tapped on a ${g.dice.join(' + ')}`);
        g.traceLen += FALSE_CLAIM_PENALTY;
        ready(room, ctx);
      }
    } else if (action.type === 'pick' && g.phase === 'reverse') {
      const target = ctx.player(room, action.targetId);
      if (!target || target.id === player.id) return;
      ctx.log(room, `🎲 ${player.name} picked ${target.name} to roll`);
      g.notice = '';
      giveDice(room, ctx, target.id);
    } else if (action.type === 'pass' && g.phase !== 'spinning') {
      const next = ctx.turns.next(room, g.order, player.id);
      if (!next || next === player.id) return;
      ctx.log(room, `➡️ ${player.name} passed the dice to ${ctx.name(room, next)}`);
      g.notice = '';
      giveDice(room, ctx, next);
    }
  },

  // If the roller leaves, the dice move on.
  check(room, ctx) {
    const g = room.game;
    if (ctx.turns.isActive(room, g.rollerId)) return;
    const next = ctx.turns.next(room, g.order, g.rollerId);
    if (next) giveDice(room, ctx, next);
  },

  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room) {
    const g = room.game;
    return {
      rollerId: g.rollerId,
      rollNo: g.rollNo,
      traceLen: g.traceLen,
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
