// Betting on a race, shared by Ace Race and Horse Race. Everyone bets sips on one pick (a suit, a
// horse). When the race is won, everyone who backed another pick drinks their bet, and the
// winners hand out their winnings (bet × multiplier) to whoever they like.
//
// The game keeps g.maxBet and g.multiplier; this keeps g.bets, g.winner, g.payout and g.drank,
// and moves g.phase to 'payout' and then 'results'.

const { isActive } = require('./turns');
const { pickHuman } = require('./bots');

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
      ctx.highlight(room, 'bigBet', id, b.sips * g.multiplier, `🏇 ${ctx.name(room, id)} backed ${label(pick)} and won ${b.sips * g.multiplier} sips to hand out`);
    } else {
      ctx.drink(room, id, b.sips, `bet on ${label(b.pick)}`);
      g.drank[id] = (g.drank[id] || 0) + b.sips;
    }
  }
  g.phase = 'payout';
  checkPayout(room);
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
  checkPayout(room);
  return true;
}

// Winners still to hand theirs out (anyone who's left doesn't count).
const owed = (room) => Object.entries(room.game.payout).filter(([id, p]) => !p.done && isActive(room, id)).map(([id]) => id);

// Payout ends once every winner who's still here has handed theirs out.
function checkPayout(room) {
  const g = room.game;
  if (g.phase !== 'payout') return;
  if (!owed(room).length) g.phase = 'results';
}

// Who the game is waiting on, except during the race itself (each game knows its own): everyone
// here yet to bet, then the host to start (straight away when `full`: nobody else can bet); the
// winners handing out; and the host, for the next race.
function waitingOn(room, { full = false } = {}) {
  const g = room.game;
  if (g.phase === 'betting') {
    const yet = room.players.filter((p) => p.connected && !g.bets[p.id]).map((p) => p.id);
    return yet.length && !full ? yet : [room.hostId];
  }
  if (g.phase === 'payout') return owed(room);
  if (g.phase === 'results') return [room.hostId];
  return [];
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

// Bots. A bot's bet: good bots keep it modest (a sip or two), bad ones go big. Nothing on the
// screen says who'll win, so a bot picks at random (the game does that).
function botSips(maxBet, skill) {
  const cap = Math.min(maxBet, Math.max(1, Math.round(maxBet * (1.1 - skill))));
  const floor = Math.max(1, Math.round(cap * (1 - skill)));
  return floor + Math.floor(Math.random() * (cap - floor + 1));
}

// A winning bot's sips (as give() takes them), each to someone at random: a human here when
// there is one. Null with nobody to give to.
function botAlloc(room, meId, total) {
  if (!pickHuman(room, meId)) return null;
  const alloc = {};
  for (let i = 0; i < total; i++) {
    const to = pickHuman(room, meId);
    alloc[to] = (alloc[to] || 0) + 1;
  }
  return JSON.stringify(alloc);
}

module.exports = { reset, bet, settle, give, checkPayout, waitingOn, view, options, botSips, botAlloc };
