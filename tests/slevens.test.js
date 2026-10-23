const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/slevens');

// Rolls with fixed dice, then ends the spin so the 3-second window opens.
function rollAs(t, i, dice) {
  const real = t.ctx.dice.roll;
  t.ctx.dice.roll = () => dice;
  t.act(i, 'roll');
  t.ctx.dice.roll = real;
  t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'window');
}

// Roller i rolls a hit and keeps their hands off for the 3 seconds.
function hit(t, i) {
  rollAs(t, i, [3, 4]);
  t.fireTimer();
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

test('the next roll dot shows as soon as the dice land', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [1, 2]);
  assert.strictEqual(t.room.game.dots.length, 1);
  assert.ok(!game.inDiceZone(t.room.game.dots[0]), 'it never hides the dice');
  t.cleanup();
});

test('on a non-hit the roller can roll again straight away; the count stays the same', () => {
  const t = setup(game, 3);
  hit(t, 0);
  rollAs(t, 0, [1, 2]);
  t.act(0, 'press'); // pressing on a non-hit is fine
  assert.strictEqual(t.room.game.phase, 'window');
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'spinning');
  t.room.game.dice = [2, 4];
  t.fireTimer();
  t.fireTimer(); // the 3 seconds pass on a non-hit
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.room.game.rollerId, 'p0');
  assert.strictEqual(t.view(0).traceLen, 2);
  assert.ok(!t.room.game.hit);
  t.cleanup();
});

test('leaving a hit alone for 3 seconds counts: HIT, same roller, one more dot', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [5, 6]);
  t.act(0, 'roll'); // can't roll on through a hit
  assert.strictEqual(t.room.game.phase, 'window');
  t.fireTimer();
  assert.ok(t.view(1).hit, 'everyone sees the HIT');
  assert.strictEqual(t.room.game.rollerId, 'p0');
  assert.strictEqual(t.view(0).traceLen, 2);
  assert.strictEqual(t.room.game.dots.length, 2);
  t.act(0, 'roll');
  assert.ok(!t.room.game.hit, 'HIT clears once the next roll starts');
  t.cleanup();
});

test('each hit in a row adds exactly one dot', () => {
  const t = setup(game, 3);
  hit(t, 0);
  hit(t, 0);
  hit(t, 0);
  assert.strictEqual(t.view(0).traceLen, 4);
  assert.strictEqual(t.room.game.dots.length, 4);
  t.cleanup();
});

test('touching the dot within 3 seconds of a hit is a REVERSE; the roller picks who is next', () => {
  const t = setup(game, 3);
  hit(t, 0);
  rollAs(t, 0, [2, 2]);
  t.act(1, 'press'); // only the roller's touch counts
  assert.strictEqual(t.room.game.phase, 'window');
  t.act(0, 'press');
  assert.strictEqual(t.room.game.phase, 'reverse');
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'reverse', 'no rolling during a REVERSE');
  t.act(1, 'pick', { targetId: 'p1' }); // only the roller picks
  t.act(0, 'pick', { targetId: 'p0' }); // can't pick yourself
  assert.strictEqual(t.room.game.phase, 'reverse');
  t.act(0, 'pick', { targetId: 'p2' });
  assert.strictEqual(t.room.game.rollerId, 'p2');
  assert.strictEqual(t.room.game.phase, 'ready');
  assert.strictEqual(t.view(0).traceLen, 1, 'the new roller starts at a single tap');
  t.cleanup();
});

test('touching the dot after the 3 seconds is just the next roll', () => {
  const t = setup(game, 3);
  rollAs(t, 0, [3, 4]);
  t.fireTimer();
  t.act(0, 'press');
  assert.strictEqual(t.room.game.phase, 'ready');
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

test('dots are spread apart, on screen and clear of the arrow; the first stays off the dice', () => {
  const t = setup(game, 2);
  for (let i = 0; i < 6; i++) hit(t, 0);
  for (let n = 0; n < 30; n++) {
    rollAs(t, 0, [1, 2]);
    const { dots } = t.room.game;
    assert.strictEqual(dots.length, 7);
    assert.ok(!game.inDiceZone(dots[0]));
    for (let i = 0; i < dots.length; i++) {
      assert.ok(dots[i].x >= 10 && dots[i].x <= 90 && dots[i].y >= 8 && dots[i].y <= 90);
      assert.ok(!game.inArrowZone(dots[i]));
      if (i > 0) assert.ok(Math.hypot(dots[i].x - dots[i - 1].x, dots[i].y - dots[i - 1].y) >= 29);
    }
  }
  t.cleanup();
});

test('lobby options: hands-off time and dot connect', () => {
  const t = setup(game, 2, { seconds: 5, dotConnect: false });
  assert.strictEqual(t.room.game.windowMs, 5000);
  assert.strictEqual(t.view(0).seconds, 5);
  hit(t, 0);
  hit(t, 0);
  assert.strictEqual(t.room.game.hits, 2, 'hits still count');
  assert.strictEqual(t.view(0).traceLen, 1, 'every roll stays a single tap');
  assert.strictEqual(t.room.game.dots.length, 1);
  t.cleanup();
});

test('options default to 3 seconds with dot connect on', () => {
  const t = setup(game, 2);
  assert.strictEqual(t.room.game.windowMs, 3000);
  hit(t, 0);
  assert.strictEqual(t.view(0).traceLen, 2);
  t.cleanup();
});

test('the hands-off timer uses the chosen time', () => {
  const t = setup(game, 2, { seconds: 2 });
  rollAs(t, 0, [3, 4]);
  assert.ok(t.room.deadline - Date.now() <= 2300 + 50);
  t.cleanup();
});

test('the dice roll for the chosen time before they land', () => {
  const t = setup(game, 2, { spinMs: 3000 });
  t.act(0, 'roll');
  assert.strictEqual(t.room.game.phase, 'spinning');
  assert.ok(t.room.deadline - Date.now() > 2900 && t.room.deadline - Date.now() <= 3000);
  t.cleanup();
  const d = setup(game, 2);
  d.act(0, 'roll');
  assert.ok(d.room.deadline - Date.now() > 900 && d.room.deadline - Date.now() <= 1000, 'defaults to 1 second');
  d.cleanup();
  const q = setup(game, 2, { spinMs: 100 });
  q.act(0, 'roll');
  assert.ok(q.room.deadline - Date.now() <= 100, 'fastest setting is 0.1 seconds');
  q.cleanup();
});
