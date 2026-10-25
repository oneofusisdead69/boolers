const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/quarters');

// No wobble, so a perfect, straight flick goes in.
game.WOBBLE.none = 0;
const sink = { x: '0', angle: '0', speed: '1' };
const miss = { x: '0', angle: '0', speed: '0.5' };
function ready(players = 3, options = {}) {
  const t = setup(game, players, options);
  t.room.game.wobble = 'none';
  return t;
}

test('sink it: you pick who drinks and go again; miss: the next player', () => {
  const t = ready(3, { sips: 2 });
  const g = t.room.game;
  t.act(1, 'throw', sink); // not their go
  assert.strictEqual(g.shots, 0);
  t.act(0, 'throw', sink);
  assert.strictEqual(g.phase, 'give');
  assert.ok(t.view(1).last.hit);
  t.act(0, 'give', { targetId: 'p0' }); // not yourself
  assert.strictEqual(g.phase, 'give');
  t.act(0, 'give', { targetId: 'p2' });
  assert.deepStrictEqual(t.drinks(), [0, 0, 2]);
  assert.strictEqual(g.turnId, 'p0', 'and goes again');
  t.act(0, 'throw', miss);
  assert.strictEqual(g.turnId, 'p1');
  assert.strictEqual(g.sinks.p0, 1);
});

test('three in a row makes a rule; a miss can cost a sip', () => {
  const t = ready(2, { missDrinks: true });
  const g = t.room.game;
  for (let i = 0; i < 3; i++) { t.act(0, 'throw', sink); t.act(0, 'give', { targetId: 'p1' }); }
  assert.strictEqual(g.rule, 3);
  t.act(0, 'throw', miss);
  assert.deepStrictEqual(t.drinks(), [1, 3]);
});

test('after the rounds, most quarters in wins', () => {
  const t = ready(2, { rounds: 2 });
  const g = t.room.game;
  t.act(0, 'throw', sink); t.act(0, 'give', { targetId: 'p1' });
  t.act(0, 'throw', miss); t.act(1, 'throw', miss);
  assert.strictEqual(g.round, 2);
  t.act(0, 'throw', miss); t.act(1, 'throw', miss);
  assert.strictEqual(g.phase, 'over');
  assert.deepStrictEqual(t.view(0).winners, ['p0']);
});

test('too soft falls short, too hard goes long, leaning goes sideways', () => {
  assert.ok(game.land(0, 0, 0.7, 0).d < 0.8);
  assert.ok(game.land(0, 0, 1.3, 0).d > 1.2);
  assert.strictEqual(game.land(0, 0, 1.02, 0).d, 1);
  assert.ok(game.land(0, 15, 1, 0).x > 0.2);
});
