// Handing out sips (lib/give.js), and how each game uses it: all to one, split, and nobody left
// waiting on a giver who's gone quiet (the clock, the host's skip).
const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const giving = require('../lib/give');

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('a give: all to one, or split adding up exactly, only to someone else who is here', () => {
  const t = setup(require('../games/quarters'), 4);
  t.room.players[3].connected = false;
  const parse = (action, total = 3) => giving.parse(t.room, 'p0', action, total);
  assert.deepStrictEqual(parse({ targetId: 'p1' }), [['p1', 3]]);
  assert.deepStrictEqual(parse({ alloc: '{"p1":2,"p2":1}' }), [['p1', 2], ['p2', 1]]);
  assert.deepStrictEqual(parse({ alloc: { p1: 1, p2: 2, p3: 0 } }), [['p1', 1], ['p2', 2]], 'zeros are ignored');
  assert.strictEqual(parse({ alloc: '{"p1":2}' }), null, 'too few');
  assert.strictEqual(parse({ alloc: '{"p1":4}' }), null, 'too many');
  assert.strictEqual(parse({ alloc: '{"p0":3}' }), null, 'not yourself');
  assert.strictEqual(parse({ alloc: '{"p3":3}' }), null, 'not someone offline');
  assert.strictEqual(parse({ alloc: '{"p1":1.5,"p2":1.5}' }), null, 'whole sips');
  assert.strictEqual(parse({ alloc: 'nope' }), null);
  assert.strictEqual(parse({}), null);
  const alloc = giving.randomAlloc(t.room, 'p0', 5);
  assert.strictEqual(sum(Object.values(alloc)), 5);
  assert.ok(Object.keys(alloc).every((id) => id === 'p1' || id === 'p2'));
  t.cleanup();
});

test('Quarters: a sink can be split; a quiet shooter has theirs go out at random; the host can skip', () => {
  const t = setup(require('../games/quarters'), 3, { sips: 2 });
  const g = t.room.game;
  g.phase = 'give'; // (as after a sink)
  t.act(0, 'give', { alloc: JSON.stringify({ p1: 1, p2: 1 }) });
  assert.deepStrictEqual(t.drinks(), [0, 1, 1]);
  assert.strictEqual(g.phase, 'shooting');
  // A real sink starts the clock.
  g.phase = 'shooting';
  require('../games/quarters').handle(t.room, t.player(0), { type: 'throw', x: 0, angle: 0, speed: 1 }, t.ctx);
  if (g.phase === 'give') {
    assert.ok(t.room.timerFn, 'on the clock');
    t.fireTimer();
    assert.strictEqual(g.phase, 'shooting');
    assert.strictEqual(sum(t.drinks()), 4, 'handed out at random');
    assert.ok(t.room.feed.some((f) => /took too long/.test(f.text)));
  }
  g.phase = 'give';
  t.act(1, 'skipGive'); // not the host
  assert.strictEqual(g.phase, 'give');
  t.act(0, 'skipGive');
  assert.strictEqual(g.phase, 'shooting');
  t.cleanup();
});

test('Darts: a give waits on the clock, then goes out at random and play moves on', () => {
  const t = setup(require('../games/darts'), 3, { mode: 'drinking', sips: 2 });
  const g = t.room.game;
  g.gives.push({ from: 'p0', sips: 4, reason: 'a bullseye' });
  g.phase = 'turnEnd';
  require('../games/darts').check(t.room, t.ctx); // (afterTurn, as the turn's pause ends)
  assert.strictEqual(g.phase, 'give');
  assert.strictEqual(t.room.deadline > Date.now(), true, 'phones show the countdown');
  t.fireTimer();
  assert.strictEqual(g.phase, 'throwing');
  assert.strictEqual(sum(t.drinks()), 4);
  assert.strictEqual(t.drinks()[0], 0, 'never to the giver');
  t.cleanup();
});

test('Kings Cup 2: split between two, mates drink along, and the clock hands them out', () => {
  const game = require('../games/kingsCup');
  const t = setup(game, 3);
  const g = t.room.game;
  const two = { rank: 2, suit: 'H' };
  const drawTwo = (i) => {
    const slot = g.deck.findIndex((_, s) => !g.taken.includes(s));
    g.deck[slot] = two;
    t.act(i, 'draw', { slot });
  };
  g.circle = false;
  g.mates.push(['p2', 'p0']);
  drawTwo(0);
  assert.ok(t.room.timerFn, 'on the clock');
  t.act(0, 'give', { alloc: JSON.stringify({ p1: 1, p2: 1 }) });
  assert.deepStrictEqual(t.drinks(), [0, 1, 1], "the giver's own mate doesn't drink along");
  assert.strictEqual(g.resolved, true);
  t.act(0, 'next');
  drawTwo(1);
  t.fireTimer();
  assert.strictEqual(g.resolved, true);
  assert.strictEqual(t.drinks()[1], 1, 'never to the giver');
  assert.ok(sum(t.drinks()) >= 4, 'both handed out (and mates drink along)');
  assert.ok(t.room.feed.some((f) => /took too long/.test(f.text)));
  t.cleanup();
});

test('race payouts: a quiet winner has theirs handed out at random, by the clock or the host', () => {
  const game = require('../games/horseRace');
  const t = setup(game, 3, { multiplier: 1 });
  const g = t.room.game;
  t.act(0, 'bet', { horse: '1', sips: 2 }).act(1, 'bet', { horse: '1', sips: 3 }).act(2, 'bet', { horse: '2', sips: 1 });
  t.act(0, 'startRace');
  t.ctx.clearTimer(t.room);
  require('../lib/betting').settle(t.room, t.ctx, '1', () => 'Thunder');
  assert.strictEqual(g.phase, 'payout');
  t.act(0, 'give', { targetId: 'p2' }); // all to one works for races too
  assert.deepStrictEqual(g.payout.p0.done, true);
  assert.strictEqual(g.phase, 'payout', 'still waiting on p1');
  t.act(1, 'skipGive'); // only the host
  assert.strictEqual(g.phase, 'payout');
  t.fireTimer();
  assert.strictEqual(g.phase, 'results');
  assert.strictEqual(g.drank.p0 + g.drank.p2, 1 + 2 + 3, 'every sip counted in the race');
  assert.ok(!t.room.timer, 'the clock stops once everyone has handed out');
  t.cleanup();
});
