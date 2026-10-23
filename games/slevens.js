// Slevens (7-Eleven Doubles): a race between the roller and a drinker.
//
// The roller rolls two dice. After each roll a blue dot appears for 5 seconds: if the roll is a
// 7, 11 or doubles, tapping it in time is a REVERSE and the roller picks someone to drink.
// As soon as the drinker's cup touches their lips (they tap START), the roller may roll again,
// racing to hit before the drinker finishes. Every hit in a row makes rolling one dot harder:
// a single tap, then tracing 2 dots, then 3, and so on. If the drinker taps DONE first, the
// dice pass to the next player, back to a single tap. The red arrow passes the dice any time.

const SPIN_MS = 800;
const CLAIM_MS = 5000;
const CLAIM_GRACE_MS = 600; // allowance for network lag on the 5-second window

const AMOUNTS = {
  sip: 'Take a sip',
  three: 'Take 3 sips',
  half: 'Drink half your cup',
  all: 'Finish your cup',
};

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

// A fresh turn: no drinker, no streak, a single tap to roll.
function newTurn(room, ctx, playerId) {
  const g = room.game;
  g.rollerId = playerId;
  g.hits = 0;
  g.drinkerId = null;
  g.drinking = false;
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
  options: [
    {
      id: 'amount',
      label: 'A hit means…',
      default: 'three',
      choices: Object.entries(AMOUNTS).map(([value, label]) => ({ value, label })),
    },
  ],

  start(room, ctx, options) {
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      amount: AMOUNTS[options.amount] || AMOUNTS.three,
      rollNo: 0,
      notice: '',
    });
    newTurn(room, ctx, ctx.turns.first(room, room.game.order));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const isRoller = player.id === g.rollerId;
    const isDrinker = player.id === g.drinkerId;

    if (action.type === 'roll' && isRoller && (g.phase === 'ready' || g.phase === 'claim')) {
      // Rolling on instead of tapping the blue dot means passing on a hit.
      if (g.phase === 'claim' && isHit(g.dice)) missedHit(room, ctx);
      else g.notice = '';
      ctx.clearTimer(room);
      g.dice = ctx.dice.roll(2);
      g.phase = 'spinning';
      ctx.setTimer(room, SPIN_MS, () => openClaimWindow(room, ctx));
    } else if (action.type === 'claim' && isRoller && g.phase === 'claim') {
      if (isHit(g.dice)) {
        ctx.clearTimer(room);
        g.phase = 'pick';
        g.hits += 1;
        g.drinking = false;
        g.notice = '';
        ctx.log(room, `🔄 ${player.name} rolled ${g.dice.join(' + ')}. REVERSE!`);
      } else {
        g.notice = 'Not a hit!';
        ctx.log(room, `🙈 ${player.name} tapped on a ${g.dice.join(' + ')}`);
        ready(room, ctx, { keepDots: true });
      }
    } else if (action.type === 'pick' && isRoller && g.phase === 'pick') {
      const target = ctx.player(room, action.targetId);
      if (!target || target.id === player.id) return;
      g.drinkerId = target.id;
      g.drinking = false;
      g.phase = 'waiting';
      ctx.log(room, `🍺 ${player.name} picked ${target.name} to drink`);
    } else if (action.type === 'start' && (isDrinker || isRoller) && g.phase === 'waiting') {
      // The drinker's cup touched their lips: the race is on.
      g.drinking = true;
      ready(room, ctx);
    } else if (action.type === 'done' && isDrinker && g.drinking && ['ready', 'spinning', 'claim'].includes(g.phase)) {
      const next = ctx.turns.next(room, g.order, g.rollerId);
      ctx.log(room, `🏁 ${player.name} finished first! Dice go to ${ctx.name(room, next)}`);
      g.notice = '';
      newTurn(room, ctx, next);
    } else if (action.type === 'pass' && isRoller && g.phase !== 'spinning') {
      const next = ctx.turns.next(room, g.order, player.id);
      if (!next || next === player.id) return;
      ctx.log(room, `➡️ ${player.name} passed the dice to ${ctx.name(room, next)}`);
      g.notice = '';
      newTurn(room, ctx, next);
    }
  },

  // If the roller leaves, the dice move on. (A drinker whose phone drops out doesn't end the
  // race; the roller can pass with the red arrow if things stall.)
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
      drinkerId: g.drinkerId,
      drinking: g.drinking,
      amount: g.amount,
      hits: g.hits,
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
