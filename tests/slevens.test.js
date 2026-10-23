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

test('7, 11 and doubles are hits', () => {
  assert.ok(game.isHit([3, 4]));
  assert.ok(game.isHit([5, 6]));
  assert.ok(game.isHit([2, 2]));
  assert.ok(!game.isHit([1, 2]));
  assert.ok(!game.isHit([2, 4]));
});

test('first roll is a single tap; only the roller can roll', () => {
  const t = setup(game, 3);
  assert.strictEqual(t.room.game.rollerId, 'p0');
  assert.strictEqual(t.room.game.traceLen, 1);
  assert.deepStrictEqual(t.room.game.dots, []);
  t.act(1, 'roll');
  assert.strictEqual(t.room.game.phase, 'ready');
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'spinning');
  assert.strictEqual(t.view(1).dice, null, 'dice stay hidden while spinning');
  t.cleanup();
});

test('each roll without a reverse adds a dot', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [1, 2]);
  t.fireTimer(); // claim window runs out
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.room.game.traceLen, 2);
  assert.strictEqual(t.room.game.dots.length, 2);
  rollAs(t, 0, [1, 3]);
  t.fireTimer();
  assert.strictEqual(t.room.game.dots.length, 3);
  t.cleanup();
});

test('missing a hit counts as a miss', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [3, 4]);
  t.fireTimer();
  assert.strictEqual(t.room.game.traceLen, 2);
  assert.match(t.room.game.notice, /Missed/);
  t.cleanup();
});

test('claiming a hit reverses and the roller picks the next roller, who starts at 1 dot', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [1, 2]);
  t.fireTimer();
  rollAs(t, 0, [5, 6]);
  t.act(0, 'claim');
  assert.strictEqual(t.room.game.phase, 'reverse');
  t.act(0, 'pick', { targetId: 'p0' }); // can't pick yourself
  assert.strictEqual(t.room.game.phase, 'reverse');
  t.act(0, 'pick', { targetId: 'p2' });
  assert.strictEqual(t.room.game.rollerId, 'p2');
  assert.strictEqual(t.room.game.traceLen, 1);
  assert.strictEqual(t.room.game.phase, 'ready');
  t.cleanup();
});

test('tapping on a non-hit costs two extra dots', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [1, 2]);
  t.act(0, 'claim');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.room.game.traceLen, 3);
  t.cleanup();
});

test('the red arrow passes to the next player and resets the dots', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [1, 2]);
  t.fireTimer();
  t.act(0, 'pass');
  assert.strictEqual(t.room.game.rollerId, 'p1');
  assert.strictEqual(t.room.game.traceLen, 1);
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

test('trace dots are spread apart and on screen', () => {
  const t = setup(game, 2);
  t.room.game.traceLen = 8;
  rollAs(t, 0, [1, 2]);
  t.fireTimer();
  const dots = t.room.game.dots;
  assert.strictEqual(dots.length, 9);
  for (let i = 0; i < dots.length; i++) {
    assert.ok(dots[i].x >= 12 && dots[i].x <= 88 && dots[i].y >= 12 && dots[i].y <= 88);
    if (i > 0) assert.ok(Math.hypot(dots[i].x - dots[i - 1].x, dots[i].y - dots[i - 1].y) >= 29);
  }
  t.cleanup();
});
