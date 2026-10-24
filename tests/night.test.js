const test = require('node:test');
const assert = require('node:assert');
const night = require('../lib/night');
const { createContext } = require('../lib/context');

test('the recap has the games, the best moments and awards from the tab', () => {
  const ctx = createContext({ emit() {}, broadcast() {} });
  const room = {
    players: ['Alex', 'Bea', 'Cam'].map((name, i) => ({ id: `p${i}`, name, drinks: 0, connected: true })),
    feed: [],
    settings: { breaks: false },
  };
  ctx.drink(room, 'p1', 3, 'lost', 'p0');
  ctx.drink(room, 'p1', 2, 'lost', 'p0');
  ctx.drink(room, 'p2', 1, 'missed');
  ctx.finishDrink(room, 'p2', 'out');
  ctx.highlight(room, 'dartsBest', 'p0', 100, 'Alex threw 100');
  ctx.highlight(room, 'dartsBest', 'p2', 80, 'Cam threw 80'); // not better: ignored
  room.game = { type: 'darts', phase: 'over', winnerId: 'p0' };
  night.gamePlayed(room, 'darts', 'Darts');
  room.game = { type: 'darts', phase: 'over', winnerId: 'p0' };
  night.gamePlayed(room, 'darts', 'Darts');
  const r = night.summary(room, 'Tavern');
  assert.strictEqual(r.totalSips, 6);
  assert.deepStrictEqual(r.games.map((g) => g.winnerId), ['p0', 'p0']);
  assert.deepStrictEqual(r.highlights.map((h) => h.text), ['Alex threw 100']);
  const award = (title) => r.awards.find((a) => a.title === title)?.playerId;
  assert.strictEqual(award('Thirstiest'), 'p1');
  assert.strictEqual(award('Most generous'), 'p0');
  assert.strictEqual(award('Bottoms up'), 'p2');
  assert.strictEqual(award('Champion'), 'p0');
});
