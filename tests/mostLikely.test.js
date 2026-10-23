const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/mostLikely');

test('most votes drinks one sip per vote', () => {
  const t = setup(game, 3);
  t.act(0, 'vote', { targetId: 'p1' }).act(2, 'vote', { targetId: 'p1' }).act(1, 'vote', { targetId: 'p0' });
  assert.strictEqual(t.room.game.phase, 'reveal');
  assert.deepStrictEqual(t.drinks(), [0, 2, 0]);
  assert.ok(t.events.some((e) => e.playerId === 'p1' && e.event === 'drink'));
  t.cleanup();
});

test('a tie makes everyone tied drink', () => {
  const t = setup(game, 4);
  t.act(0, 'vote', { targetId: 'p1' }).act(1, 'vote', { targetId: 'p2' });
  t.act(2, 'vote', { targetId: 'p1' }).act(3, 'vote', { targetId: 'p2' });
  assert.deepStrictEqual(t.drinks(), [0, 2, 2, 0]);
  t.cleanup();
});

test('timer runs out with no votes: everyone drinks one', () => {
  const t = setup(game, 3);
  t.fireTimer();
  assert.deepStrictEqual(t.drinks(), [1, 1, 1]);
  t.cleanup();
});

test('a disconnected player does not hold up the vote', () => {
  const t = setup(game, 3);
  t.act(0, 'vote', { targetId: 'p1' }).act(1, 'vote', { targetId: 'p0' });
  assert.strictEqual(t.room.game.phase, 'question');
  t.disconnect(2);
  assert.strictEqual(t.room.game.phase, 'reveal');
  t.cleanup();
});

test('only the host can advance to the next question', () => {
  const t = setup(game, 3);
  t.fireTimer();
  t.act(1, 'next');
  assert.strictEqual(t.room.game.phase, 'reveal');
  t.act(0, 'next');
  assert.strictEqual(t.room.game.phase, 'question');
  assert.strictEqual(t.room.game.round, 2);
  t.cleanup();
});
