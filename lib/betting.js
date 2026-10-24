// Betting on a race, shared by Ace Race and Horse Race. Everyone bets sips on one pick (a suit, a
// horse). When the race is won, everyone who backed another pick drinks their bet, and the
// winners hand out their winnings (bet × multiplier) to whoever they like.
//
// The game keeps g.maxBet and g.multiplier; this keeps g.bets, g.winner, g.payout and g.drank,
// and moves g.phase to 'payout' and then 'results'.

function reset(g) {
  g.bets = {};
  g.winner = null;
  g.payout = {};
  g.drank = {};
}

// Places or changes a bet. Returns false if it isn't a valid one.
function bet(g, id, pick, sips, picks) {
  sips = Number(sips);
  if (!picks.includes(pick) || !Number.isInteger(sips) || sips < 1 || sips > g.maxBet) return false;
  g.bets[id] = { pick, sips };
  return true;
}

// The race is won by `pick` (named `label` in drink reasons).
function settle(room, ctx, pick, label) {
  const g = room.game;
  g.winner = pick;
  for (const [id, b] of Object.entries(g.bets)) {
    if (b.pick === pick) {
      g.payout[id] = { total: b.sips * g.multiplier, done: false };
    } else {
      ctx.drink(room, id, b.sips, `bet on ${label(b.pick)}`);
      g.drank[id] = (g.drank[id] || 0) + b.sips;
    }
  }
  g.phase = 'payout';
  checkPayout(room, ctx);
}

// A winner hands out their sips: `alloc` is JSON like '{"p1":2,"p3":2}', and must add up to
// exactly what they won, to anyone but themselves.
function give(room, ctx, id, alloc, reason) {
  const g = room.game;
  const mine = g.payout[id];
  if (g.phase !== 'payout' || !mine || mine.done) return false;
  let parsed;
  try { parsed = JSON.parse(alloc); } catch { return false; }
  if (!parsed || typeof parsed !== 'object') return false;
  const entries = Object.entries(parsed).filter(([, n]) => n);
  const valid = entries.every(([to, n]) => Number.isInteger(n) && n > 0 && to !== id && ctx.player(room, to));
  if (!valid || entries.reduce((a, [, n]) => a + n, 0) !== mine.total) return false;
  for (const [to, n] of entries) {
    ctx.drink(room, to, n, reason, id);
    g.drank[to] = (g.drank[to] || 0) + n;
  }
  mine.done = true;
  checkPayout(room, ctx);
  return true;
}

// Payout ends once every winner who's still here has handed theirs out.
function checkPayout(room, ctx) {
  const g = room.game;
  if (g.phase !== 'payout') return;
  const waiting = Object.entries(g.payout).filter(([id, p]) => !p.done && ctx.turns.isActive(room, id));
  if (!waiting.length) g.phase = 'results';
}

// What phones see.
const view = (g, me) => ({
  maxBet: g.maxBet,
  multiplier: g.multiplier,
  bets: g.bets,
  myBet: g.bets[me] || null,
  winner: g.winner,
  payout: g.payout,
  drank: g.drank,
});

// Lobby options both races share.
const options = [
  { id: 'maxBet', label: 'Max bet', default: 5, choices: [3, 5, 10].map((n) => ({ value: n, label: `${n} sips` })) },
  { id: 'multiplier', label: 'Winners hand out', default: 2, choices: [{ value: 1, label: 'Their bet' }, { value: 2, label: 'Double' }] },
];

const fromOptions = (o = {}) => ({
  maxBet: [3, 5, 10].includes(o.maxBet) ? o.maxBet : 5,
  multiplier: o.multiplier === 1 ? 1 : 2,
});

module.exports = { reset, bet, settle, give, checkPayout, view, options, fromOptions };
