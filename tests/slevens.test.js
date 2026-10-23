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

// Roller i rolls a hit and claims it.
function hit(t, i) {
  rollAs(t, i, [3, 4]);
  t.act(i, 'claim');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.ok(t.room.game.hit);
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

test('misses keep the same roller and dot count, and the next roll is available right away', () => {
  const t = setup(game, 3);
  hit(t, 0);
  rollAs(t, 0, [1, 2]);
  assert.strictEqual(t.room.game.dots.length, 2, 'next roll dots are already showing');
  t.act(0, 'roll'); // roll again without waiting out the window
  assert.strictEqual(t.room.game.phase, 'spinning');
  t.room.game.dice = [1, 2];
  t.fireTimer();
  t.fireTimer(); // window runs out on a non-hit
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.room.game.rollerId, 'p0');
  assert.strictEqual(t.view(0).traceLen, 2);
  t.cleanup();
});

test('missing a hit by waiting out the 5 seconds is a REVERSE', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [3, 4]);
  t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'reverse');
  t.cleanup();
});

test('rolling on past a hit is a REVERSE too, and the dice do not roll', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [6, 6]);
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'reverse');
  assert.deepStrictEqual(t.room.game.dice, [6, 6]);
  t.cleanup();
});

test('on a REVERSE the roller picks the next roller, who starts at a single tap', () => {
  const t = setup(game, 3);
  hit(t, 0);
  hit(t, 0);
  rollAs(t, 0, [5, 6]);
  t.fireTimer();
  t.act(1, 'pick', { targetId: 'p1' }); // only the roller picks
  t.act(0, 'pick', { targetId: 'p0' }); // can't pick yourself
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'reverse');
  t.act(0, 'pick', { targetId: 'p2' });
  assert.strictEqual(t.room.game.rollerId, 'p2');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.view(0).traceLen, 1);
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

test('a claimed hit keeps the dice with the roller, one dot harder', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [5, 6]);
  t.act(1, 'claim'); // only the roller can claim
  assert.strictEqual(t.room.game.phase, 'claim');
  t.act(0, 'claim');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.ok(t.view(1).hit, 'everyone sees the HIT');
  assert.strictEqual(t.room.game.rollerId, 'p0', 'the roller keeps the dice');
  assert.strictEqual(t.view(0).traceLen, 2);
  assert.strictEqual(t.room.game.dots.length, 2);
  t.act(0, 'roll');
  assert.ok(!t.room.game.hit, 'HIT clears once the next roll starts');
  t.cleanup();
});

test('each hit in a row adds exactly one dot; misses add none', () => {
  const t = setup(game, 3);
  hit(t, 0);
  assert.strictEqual(t.view(0).traceLen, 2);
  rollAs(t, 0, [1, 2]);
  t.fireTimer();
  assert.strictEqual(t.view(0).traceLen, 2);
  assert.strictEqual(t.room.game.rollerId, 'p0');
  hit(t, 0);
  assert.strictEqual(t.view(0).traceLen, 3);
  hit(t, 0);
  assert.strictEqual(t.view(0).traceLen, 4);
  t.cleanup();
});

test('the red arrow passes to the next player and resets', () => {
  const t = setup(game, 3);
  hit(t, 0);
  t.act(1, 'pass'); // only the roller can pass
  assert.strictEqual(t.room.game.rollerId, 'p0');
  t.act(0, 'pass');
  assert.strictEqual(t.room.game.rollerId, 'p1');
  assert.strictEqual(t.view(0).traceLen, 1);
  t.act(1, 'pass').act(2, 'pass');
  assert.strictEqual(t.room.game.rollerId, 'p0', 'wraps around');
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
  for (let i = 0; i < 6; i++) hit(t, 0);
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
