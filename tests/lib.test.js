const test = require('node:test');
const assert = require('node:assert');
const cards = require('../lib/cards');
const dice = require('../lib/dice');
const turns = require('../lib/turns');
const { makeRoom } = require('./helpers');

test('a deck has 52 unique cards, plus jokers when asked', () => {
  const deck = cards.newDeck();
  assert.strictEqual(deck.length, 52);
  assert.strictEqual(new Set(deck.map((c) => c.rank + c.suit)).size, 52);
  assert.strictEqual(cards.newDeck({ jokers: 2 }).length, 54);
});

test('draw reshuffles when the deck runs out', () => {
  const deck = [];
  const card = cards.draw(deck);
  assert.ok(card.rank >= 2 && card.rank <= 14);
  assert.strictEqual(deck.length, 51);
});

test('card color, value and label', () => {
  assert.strictEqual(cards.color({ rank: 5, suit: 'H' }), 'red');
  assert.strictEqual(cards.color({ rank: 5, suit: 'S' }), 'black');
  assert.strictEqual(cards.value({ rank: 14, suit: 'S' }), 14);
  assert.strictEqual(cards.value({ rank: 14, suit: 'S' }, { aceLow: true }), 1);
  assert.strictEqual(cards.label({ rank: 12, suit: 'D' }), 'Queen of Diamonds');
});

test('dice roll in range, sum and doubles', () => {
  for (let i = 0; i < 200; i++) {
    const r = dice.roll(2);
    assert.ok(r.every((v) => v >= 1 && v <= 6));
  }
  assert.strictEqual(dice.sum([3, 4]), 7);
  assert.ok(dice.isDouble([5, 5]));
  assert.ok(!dice.isDouble([5, 6]));
  assert.ok(!dice.isDouble([5]));
});

test('turn order wraps and skips disconnected players', () => {
  const room = makeRoom(4);
  const order = room.players.map((p) => p.id);
  assert.strictEqual(turns.next(room, order, 'p0'), 'p1');
  assert.strictEqual(turns.next(room, order, 'p3'), 'p0');
  room.players[1].connected = false;
  assert.strictEqual(turns.next(room, order, 'p0'), 'p2');
  room.players = room.players.filter((p) => p.id !== 'p2');
  assert.strictEqual(turns.next(room, order, 'p0'), 'p3');
  assert.strictEqual(turns.first(room, order), 'p0');
});
