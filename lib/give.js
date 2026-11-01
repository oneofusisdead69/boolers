// Handing out sips: every game where a player gives away sips they've won (a ton at darts, a sunk
// quarter, a right guess, a winning bet…) takes the same move from the phone's give panel
// (PB.giveSips in public/pb.js):
//
//   { type: 'give', targetId: 'p2' }               all of them to one person
//   { type: 'give', alloc: '{"p1":2,"p3":1}' }     split, adding up to exactly what's owed
//
// Nobody waits forever on a giver who's gone quiet: the game starts a clock on the give (clock),
// and whatever's still owed when it runs out, or when the host skips the wait, goes out at random
// (auto), with a line in the feed.

const { isActive } = require('./turns');
const { pick } = require('./random');

// How long a giver gets before their sips go out at random. Long enough to think about it; short
// enough that the table isn't left staring at a phone.
const GIVE_MS = 25000;

// Who `fromId` can give to: anyone else who's here.
const eligible = (room, fromId) => room.players.filter((p) => p.id !== fromId && isActive(room, p.id)).map((p) => p.id);

// A give the phone sent, as [[id, sips], ...] adding up to `total`, or null if it isn't a valid one
// (to yourself, to someone who's left, the wrong number of sips: a stale or tampered phone).
function parse(room, fromId, action, total) {
  let alloc = action.alloc;
  if (alloc == null && action.targetId) alloc = { [action.targetId]: total };
  if (typeof alloc === 'string') {
    try { alloc = JSON.parse(alloc); } catch { return null; }
  }
  if (!alloc || typeof alloc !== 'object' || Array.isArray(alloc)) return null;
  const ok = eligible(room, fromId);
  const entries = Object.entries(alloc).filter(([, n]) => n);
  if (!entries.length || !entries.every(([id, n]) => Number.isInteger(n) && n > 0 && ok.includes(id))) return null;
  return entries.reduce((a, [, n]) => a + n, 0) === total ? entries : null;
}

// Hands out `total` sips as the phone asked. False (nothing given) if it isn't a valid give, so
// the giver can try again. `drink(id, sips, reason)` gives one person theirs: by default a plain
// drink from the giver (Kings Cup's mates drink along; a race keeps count of who drank what).
function give(room, ctx, fromId, action, total, reason, drink = (id, n, why) => ctx.drink(room, id, n, why, fromId)) {
  const entries = parse(room, fromId, action, total);
  if (!entries) return false;
  for (const [id, n] of entries) drink(id, n, reason);
  return true;
}

// `total` sips, each to someone at random (anyone else who's here), as a give's alloc. Null with
// nobody to give to.
function randomAlloc(room, fromId, total) {
  const pool = eligible(room, fromId);
  if (!pool.length) return null;
  const alloc = {};
  for (let i = 0; i < total; i++) {
    const id = pick(pool);
    alloc[id] = (alloc[id] || 0) + 1;
  }
  return alloc;
}

// Time's up, or the host skipped the wait: what `fromId` owes goes out at random. `skipped` says
// which, for the feed. False if there was nobody to give to.
function auto(room, ctx, fromId, total, reason, { skipped = false, drink } = {}) {
  const alloc = randomAlloc(room, fromId, total);
  if (!alloc) return false;
  const who = ctx.name(room, fromId);
  const sips = `${total} sip${total === 1 ? '' : 's'}`;
  ctx.log(room, skipped ? `🎲 Host skipped the wait: ${who}'s ${sips} went out at random` : `⏱ ${who} took too long: ${sips} handed out at random`);
  return give(room, ctx, fromId, { alloc }, total, reason ? `${reason}, at random` : 'at random', drink);
}

// Starts the clock on a give: `onTimeout` runs once it's up (it should check the give is still
// owed). ctx.giveMs is how long; none in pass and play, where the giver is holding the phone.
function clock(room, ctx, onTimeout) {
  if (ctx.giveMs) ctx.setTimer(room, ctx.giveMs, onTimeout);
}

module.exports = { GIVE_MS, eligible, parse, give, randomAlloc, auto, clock };
