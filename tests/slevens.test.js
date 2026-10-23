const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/slevens');

// Rolls with fixed dice, then ends the spin so the claim window opens.
function rollAs(t, i, dice) {
  const real = t.ctx.dice.roll;
  t.ctx.dice.roll = () => dice;
  t.act(i, 'roll');
  t.ctx.dice.roll = real;
  t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'claim');
}

// Roller i hits, picks drinker j, and the drinker starts drinking.
function hitAndPick(t, i, j) {
  rollAs(t, i, [3, 4]);
  t.act(i, 'claim').act(i, 'pick', { targetId: `p${j}` }).act(j, 'start');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.ok(t.room.game.drinking);
}

test('7, 11 and doubles are hits', () => {
  assert.ok(game.isHit([3, 4]));
  assert.ok(game.isHit([5, 6]));
  assert.ok(game.isHit([2, 2]));
  assert.ok(!game.isHit([1, 2]));
  assert.ok(!game.isHit([2, 4]));
});

test('a turn starts with a single tap; only the roller can roll', () => {
  const t = setup(game, 3);
  assert.strictEqual(t.room.game.rollerId, 'p0');
  assert.strictEqual(t.view(0).traceLen, 1);
  t.act(1, 'roll');
  assert.strictEqual(t.room.game.phase, 'ready');
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'spinning');
  assert.strictEqual(t.view(1).dice, null, 'dice stay hidden while spinning');
  t.cleanup();
});

test('misses keep the same dot count, and the next roll is available right away', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [1, 2]);
  assert.strictEqual(t.room.game.dots.length, 1, 'next roll dot is already showing');
  t.act(0, 'roll'); // roll again without waiting out the window
  assert.strictEqual(t.room.game.phase, 'spinning');
  t.fireTimer();
  t.fireTimer(); // window runs out
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.view(0).traceLen, 1);
  t.cleanup();
});

test('rolling on past a hit, or letting the window run out, misses it', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [3, 4]);
  t.act(0, 'roll');
  assert.match(t.room.game.notice, /Missed/);
  t.fireTimer();
  t.room.game.dice = [5, 5];
  t.fireTimer();
  assert.match(t.room.game.notice, /Missed/);
  assert.strictEqual(t.room.game.phase, 'ready');
  t.cleanup();
});

test('tapping the blue dot on a non-hit just says so', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [1, 2]);
  t.act(0, 'claim');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.room.game.notice, 'Not a hit!');
  assert.strictEqual(t.view(0).traceLen, 1);
  t.cleanup();
});

test('a hit lets the roller pick a drinker; rolling waits until the drinker starts', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [5, 6]);
  t.act(0, 'claim');
  assert.strictEqual(t.room.game.phase, 'pick');
  t.act(0, 'pick', { targetId: 'p0' }); // can't pick yourself
  assert.strictEqual(t.room.game.phase, 'pick');
  t.act(0, 'pick', { targetId: 'p2' });
  assert.strictEqual(t.room.game.phase, 'waiting');
  assert.strictEqual(t.room.game.drinkerId, 'p2');
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'waiting', 'no rolling before the cup touches lips');
  t.act(1, 'start'); // a bystander can't start it
  assert.strictEqual(t.room.game.phase, 'waiting');
  t.act(2, 'start');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.view(0).traceLen, 2, 'one more dot after a hit');
  assert.strictEqual(t.room.game.dots.length, 2);
  t.cleanup();
});

test('the roller can also start the race for the drinker', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [3, 4]);
  t.act(0, 'claim').act(0, 'pick', { targetId: 'p1' }).act(0, 'start');
  assert.ok(t.room.game.drinking);
  t.cleanup();
});

test('each hit in a row adds exactly one dot', () => {
  const t = setup(game, 3);
  hitAndPick(t, 0, 1);
  assert.strictEqual(t.view(0).traceLen, 2);
  hitAndPick(t, 0, 2);
  assert.strictEqual(t.view(0).traceLen, 3);
  hitAndPick(t, 0, 1);
  assert.strictEqual(t.view(0).traceLen, 4);
  assert.strictEqual(t.room.game.rollerId, 'p0', 'the roller keeps the dice while they keep hitting');
  t.cleanup();
});

test('if the drinker finishes first the dice pass on and reset', () => {
  const t = setup(game, 3);
  hitAndPick(t, 0, 2);
  hitAndPick(t, 0, 2);
  t.act(1, 'done'); // only the drinker can finish
  assert.strictEqual(t.room.game.rollerId, 'p0');
  t.act(2, 'done');
  assert.strictEqual(t.room.game.rollerId, 'p1', 'next player after the roller');
  assert.strictEqual(t.view(0).traceLen, 1);
  assert.strictEqual(t.room.game.drinkerId, null);
  t.cleanup();
});

test('the drinker can finish while the dice are still spinning', () => {
  const t = setup(game, 3);
  hitAndPick(t, 0, 1);
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'spinning');
  t.act(1, 'done');
  assert.strictEqual(t.room.game.rollerId, 'p1');
  assert.strictEqual(t.room.game.phase, 'ready');
  t.cleanup();
});

test('once the roller hits, the drinker can no longer finish that round', () => {
  const t = setup(game, 3);
  hitAndPick(t, 0, 1);
  rollAs(t, 0, [6, 6]);
  t.act(0, 'claim');
  t.act(1, 'done');
  assert.strictEqual(t.room.game.phase, 'pick');
  assert.strictEqual(t.room.game.rollerId, 'p0');
  t.cleanup();
});

test('the red arrow passes to the next player and resets', () => {
  const t = setup(game, 3);
  hitAndPick(t, 0, 2);
  t.act(0, 'pass');
  assert.strictEqual(t.room.game.rollerId, 'p1');
  assert.strictEqual(t.view(0).traceLen, 1);
  t.act(1, 'pass').act(2, 'pass');
  assert.strictEqual(t.room.game.rollerId, 'p0', 'wraps around');
  t.cleanup();
});

test('the drink amount comes from the lobby option', () => {
  const t = setup(game, 2, { amount: 'all' });
  assert.strictEqual(t.view(0).amount, 'Finish your cup');
  t.cleanup();
});

test('if the roller disconnects the dice move on', () => {
  const t = setup(game, 3);
  t.disconnect(0);
  assert.strictEqual(t.room.game.rollerId, 'p1');
  t.cleanup();
});

test('dots are spread apart, on screen, clear of the arrow; the blue dot never covers the dice', () => {
  const t = setup(game, 2);
  for (let i = 0; i < 6; i++) hitAndPick(t, 0, 1);
  rollAs(t, 0, [1, 2]);
  const { dots, claimDot } = t.room.game;
  assert.strictEqual(dots.length, 7);
  for (let i = 0; i < dots.length; i++) {
    assert.ok(dots[i].x >= 10 && dots[i].x <= 90 && dots[i].y >= 8 && dots[i].y <= 90);
    assert.ok(!game.inArrowZone(dots[i]));
    if (i > 0) assert.ok(Math.hypot(dots[i].x - dots[i - 1].x, dots[i].y - dots[i - 1].y) >= 29);
  }
  assert.ok(!game.inDiceZone(claimDot) && !game.inArrowZone(claimDot));
  assert.ok(Math.hypot(claimDot.x - dots[0].x, claimDot.y - dots[0].y) >= 29, 'blue dot is apart from the next roll dot');
  t.cleanup();
});
