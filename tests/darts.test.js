const test = require('node:test');
const assert = require('node:assert');
const darts = require('../games/darts');
const { setup } = require('./helpers');

const { score, RINGS } = darts;

// Where to aim for a segment: the middle of `n`'s wedge at radius r.
function spot(n, r) {
  const i = darts.SECTORS.indexOf(n);
  const a = (i * 18 * Math.PI) / 180;
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}
const SINGLE = 0.4;
const TRIPLE = (RINGS.tripleIn + RINGS.tripleOut) / 2;
const DOUBLE = (RINGS.doubleIn + 1) / 2;

// A perfect throw lands exactly where it's aimed (no wobble).
function throwAt(t, i, at) {
  const orig = Math.random;
  // gauss() uses cos(2π·r2), so r2 = 0.25 gives exactly 0.
  Math.random = () => 0.25;
  try {
    t.act(i, 'throw', { ...at, angle: 0, speed: 1 });
  } finally {
    Math.random = orig;
  }
}

test('the board scores like a real one', () => {
  assert.deepStrictEqual(score(0, 0), { n: 25, m: 2, label: 'Bull' });
  assert.strictEqual(score(0, -0.07).label, '25');
  assert.strictEqual(score(0, -SINGLE).label, '20');
  assert.strictEqual(score(0, -TRIPLE).label, 'T20');
  assert.strictEqual(score(0, -DOUBLE).label, 'D20');
  assert.strictEqual(score(0, -1.05).label, 'Miss');
  for (const n of [1, 6, 3, 11, 5, 19]) {
    assert.strictEqual(score(spot(n, SINGLE).x, spot(n, SINGLE).y).n, n);
    assert.strictEqual(score(spot(n, TRIPLE).x, spot(n, TRIPLE).y).label, `T${n}`);
  }
});

test('a crooked or weak flick goes astray', () => {
  const orig = Math.random;
  Math.random = () => 0.25;
  try {
    const straight = darts.land({ x: 0, y: 0 }, 0, 1, 0.06);
    assert.ok(Math.abs(straight.x) < 1e-9 && Math.abs(straight.y) < 1e-9);
    assert.ok(darts.land({ x: 0, y: 0 }, 15, 1, 0).x > 0.2); // leaned right
    assert.ok(darts.land({ x: 0, y: 0 }, 0, 0.6, 0).y > 0.2); // too soft: drops low
    assert.ok(darts.land({ x: 0, y: 0 }, 0, 1.5, 0).y < -0.2); // too hard: flies high
  } finally {
    Math.random = orig;
  }
});

test('drinking darts: lowest round score drinks, bulls hand out sips, misses drink', () => {
  const t = setup(darts, 2, { mode: 'drinking', sips: 2 });
  throwAt(t, 0, { x: 0, y: 0 }); // bull
  throwAt(t, 0, spot(20, TRIPLE));
  throwAt(t, 0, spot(20, SINGLE));
  assert.strictEqual(t.view(0).lastTurn.total, 50 + 60 + 20);
  t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'give');
  assert.strictEqual(t.view(1).turnId, 'p0');
  t.act(0, 'give', { targetId: 'p1' });
  assert.deepStrictEqual(t.drinks(), [0, 4]);
  assert.strictEqual(t.view(0).turnId, 'p1');
  throwAt(t, 1, { x: 0, y: -1.2 }); // miss
  throwAt(t, 1, spot(1, SINGLE));
  throwAt(t, 1, spot(1, SINGLE));
  assert.deepStrictEqual(t.drinks(), [0, 5]);
  t.fireTimer(); // turn over: end of round 1
  assert.strictEqual(t.room.game.phase, 'roundEnd');
  assert.deepStrictEqual(t.drinks(), [0, 7]);
  assert.deepStrictEqual(t.room.game.total, { p0: 130, p1: 2 });
  t.fireTimer();
  assert.strictEqual(t.view(0).round, 2);
  assert.strictEqual(t.view(0).turnId, 'p0');
  t.cleanup();
});

test('301: count down, bust back to the start of the turn, finish to win', () => {
  const t = setup(darts, 2, { mode: 301, sips: 1 });
  t.room.game.left.p0 = 40;
  t.room.game.turnStart = 40;
  throwAt(t, 0, spot(20, SINGLE)); // 20 left
  throwAt(t, 0, spot(20, TRIPLE)); // -40: bust
  assert.strictEqual(t.room.game.left.p0, 40);
  assert.strictEqual(t.view(0).lastTurn.note, 'bust');
  assert.deepStrictEqual(t.drinks(), [1, 0]);
  t.fireTimer();
  throwAt(t, 1, spot(20, SINGLE));
  throwAt(t, 1, spot(20, SINGLE));
  throwAt(t, 1, spot(20, SINGLE));
  assert.strictEqual(t.room.game.left.p1, 241);
  t.fireTimer();
  throwAt(t, 0, spot(20, DOUBLE)); // exactly 40
  assert.strictEqual(t.room.game.phase, 'over');
  assert.strictEqual(t.view(1).winnerId, 'p0');
  assert.deepStrictEqual(t.drinks(), [1, 1]);
  t.cleanup();
});

test('double out: finishing on a single busts', () => {
  const t = setup(darts, 2, { mode: 301, doubleOut: true });
  t.room.game.left.p0 = 20;
  t.room.game.turnStart = 20;
  throwAt(t, 0, spot(20, SINGLE));
  assert.strictEqual(t.room.game.left.p0, 20);
  assert.strictEqual(t.view(0).lastTurn.note, 'bust');
  t.cleanup();
});

test('a ton hands out sips in 301', () => {
  const t = setup(darts, 2, { mode: 501, sips: 3 });
  throwAt(t, 0, spot(20, TRIPLE));
  throwAt(t, 0, spot(20, TRIPLE));
  throwAt(t, 0, spot(20, TRIPLE));
  assert.strictEqual(t.room.game.left.p0, 321);
  t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'give');
  t.act(0, 'give', { targetId: 'p1' });
  assert.deepStrictEqual(t.drinks(), [0, 3]);
  t.cleanup();
});

test('around the clock: hits move you on, a turn without one drinks', () => {
  const t = setup(darts, 2, { mode: 'clock', sips: 2 });
  throwAt(t, 0, spot(1, SINGLE));
  throwAt(t, 0, spot(2, TRIPLE));
  throwAt(t, 0, spot(20, SINGLE));
  assert.strictEqual(t.room.game.target.p0, 3);
  t.fireTimer();
  for (let i = 0; i < 3; i++) throwAt(t, 1, spot(20, SINGLE));
  assert.deepStrictEqual(t.drinks(), [0, 2]);
  t.fireTimer();
  t.room.game.target.p0 = 21;
  throwAt(t, 0, { x: 0, y: -0.07 }); // the 25 counts as the bull
  assert.strictEqual(t.view(0).winnerId, 'p0');
  t.cleanup();
});

test('cricket: closing a number makes everyone still open drink; extra marks score', () => {
  const t = setup(darts, 3, { mode: 'cricket', sips: 1 });
  throwAt(t, 0, spot(20, TRIPLE)); // closes 20
  assert.deepStrictEqual(t.drinks(), [0, 1, 1]);
  throwAt(t, 0, spot(20, DOUBLE)); // 40 points
  throwAt(t, 0, spot(5, SINGLE)); // not a cricket number
  assert.strictEqual(t.room.game.points.p0, 40);
  t.fireTimer();
  for (let i = 0; i < 3; i++) throwAt(t, 1, spot(1, SINGLE));
  assert.deepStrictEqual(t.drinks(), [0, 2, 1]); // no marks
  t.cleanup();
});

test('only the thrower can aim or throw, and a thrower who leaves is skipped', () => {
  const t = setup(darts, 3, {});
  t.act(1, 'throw', { x: 0, y: 0, angle: 0, speed: 1 });
  t.act(1, 'aim', { x: 0.5, y: 0.5 });
  assert.strictEqual(t.room.game.darts.length, 0);
  assert.strictEqual(t.room.game.aim, null);
  t.act(0, 'aim', { x: 9, y: 0.2 });
  assert.deepStrictEqual(t.room.game.aim, { x: 1.4, y: 0.2 });
  t.disconnect(0);
  assert.strictEqual(t.view(1).turnId, 'p1');
  t.cleanup();
});

test('hard mode is passed to the phones', () => {
  assert.strictEqual(setup(darts, 2, {}).view(0).hard, false);
  assert.strictEqual(setup(darts, 2, { hard: true }).view(0).hard, true);
});
