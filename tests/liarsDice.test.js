const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/liarsDice');

// Replaces everyone's roll with fixed dice.
function rig(t, hands) {
  t.room.game.hands = Object.fromEntries(hands.map((h, i) => [`p${i}`, h]));
}

test('bids must go up: more dice, or the same number of a higher face', () => {
  assert.ok(game.validBid({ qty: 2, face: 3 }, null, 10, true));
  assert.ok(game.validBid({ qty: 2, face: 4 }, { qty: 2, face: 3 }, 10, true));
  assert.ok(game.validBid({ qty: 3, face: 2 }, { qty: 2, face: 6 }, 10, true));
  assert.ok(!game.validBid({ qty: 2, face: 3 }, { qty: 2, face: 3 }, 10, true), 'same bid');
  assert.ok(!game.validBid({ qty: 2, face: 2 }, { qty: 2, face: 3 }, 10, true), 'lower face');
  assert.ok(!game.validBid({ qty: 11, face: 3 }, null, 10, true), 'more dice than the table has');
  assert.ok(!game.validBid({ qty: 2, face: 1 }, null, 10, true), 'no bidding 1s when they are wild');
  assert.ok(game.validBid({ qty: 2, face: 1 }, null, 10, false));
  assert.ok(!game.validBid({ qty: 1.5, face: 3 }, null, 10, false));
});

test('ones count as every face when wild', () => {
  const hands = { a: [1, 3, 3], b: [1, 5, 6] };
  assert.strictEqual(game.countFace(hands, 3, true), 4);
  assert.strictEqual(game.countFace(hands, 3, false), 2);
});

test('players bid in turn, and only the bidder may act', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  assert.strictEqual(g.phase, 'bidding');
  assert.strictEqual(g.turnId, 'p0');
  assert.strictEqual(t.view(0).myDice.length, 5);
  t.act(1, 'bid', { qty: '2', face: '3' }); // not their turn
  assert.strictEqual(g.bid, null);
  t.act(0, 'liar'); // nothing to call yet
  assert.strictEqual(g.phase, 'bidding');
  t.act(0, 'bid', { qty: '2', face: '3' });
  assert.deepStrictEqual(g.bid, { qty: 2, face: 3, by: 'p0' });
  assert.strictEqual(g.turnId, 'p1');
  t.act(1, 'bid', { qty: '2', face: '2' }); // too low
  assert.strictEqual(g.turnId, 'p1');
  t.act(1, 'bid', { qty: '2', face: '4' });
  assert.strictEqual(g.turnId, 'p2');
});

test("nobody sees anyone else's dice until a call", () => {
  const t = setup(game, 2);
  rig(t, [[2, 2, 3, 4, 6], [1, 1, 5, 5, 5]]);
  assert.deepStrictEqual(t.view(0).myDice, [2, 2, 3, 4, 6]);
  assert.strictEqual(t.view(0).reveal, null);
  assert.ok(!JSON.stringify(t.view(0)).includes('[1,1,5,5,5]'));
  t.act(0, 'bid', { qty: 3, face: 5 });
  t.act(1, 'liar');
  assert.deepStrictEqual(t.view(0).reveal.hands.p1, [1, 1, 5, 5, 5]);
});

test('calling liar on a true bid: the caller drinks and loses a die, then starts', () => {
  const t = setup(game, 2, { sips: 3 });
  rig(t, [[2, 2, 3, 4, 6], [1, 1, 5, 5, 5]]);
  t.act(0, 'bid', { qty: 5, face: 5 }); // 3 fives + 2 wild ones
  t.act(1, 'liar');
  const g = t.room.game;
  assert.strictEqual(g.phase, 'reveal');
  assert.strictEqual(g.reveal.count, 5);
  assert.deepStrictEqual(t.drinks(), [0, 3]);
  assert.deepStrictEqual(g.dice, { p0: 5, p1: 4 });
  t.act(0, 'next'); // p1 starts, but the host may move on too
  assert.strictEqual(g.phase, 'bidding');
  assert.strictEqual(g.turnId, 'p1');
  assert.strictEqual(g.hands.p1.length, 4);
});

test('calling liar on a lie: the bidder drinks', () => {
  const t = setup(game, 3);
  rig(t, [[2, 2, 3, 4, 6], [1, 1, 5, 5, 5], [6, 6, 6, 6, 6]]);
  t.act(0, 'bid', { qty: 6, face: 2 }); // 2 twos + 2 ones = 4
  t.act(1, 'liar');
  assert.deepStrictEqual(t.drinks(), [2, 0, 0]);
  assert.strictEqual(t.room.game.nextStarter, 'p0');
});

test('without wild ones, 1s count only as 1s', () => {
  const t = setup(game, 2, { wild: false });
  rig(t, [[2, 2, 3, 4, 6], [1, 1, 5, 5, 5]]);
  t.act(0, 'bid', { qty: 4, face: 5 });
  t.act(1, 'liar');
  assert.deepStrictEqual(t.drinks(), [2, 0]);
});

test('spot on: exactly right and everyone else drinks; wrong and the caller does', () => {
  const t = setup(game, 3);
  rig(t, [[2, 2, 3, 4, 6], [1, 1, 5, 5, 5], [6, 6, 6, 6, 6]]);
  t.act(0, 'bid', { qty: 5, face: 5 });
  t.act(1, 'spotOn');
  assert.deepStrictEqual(t.drinks(), [2, 0, 2]);
  assert.deepStrictEqual(t.room.game.dice, { p0: 5, p1: 5, p2: 5 }, 'nobody loses a die');
  t.act(1, 'next');
  assert.strictEqual(t.room.game.turnId, 'p1');
  rig(t, [[2, 2, 3, 4, 6], [1, 1, 5, 5, 5], [6, 6, 6, 6, 6]]);
  t.act(1, 'bid', { qty: 7, face: 6 }); // 6 sixes + 2 ones = 8
  t.act(2, 'spotOn');
  assert.deepStrictEqual(t.drinks(), [2, 0, 4]);
  assert.strictEqual(t.room.game.dice.p2, 4);
});

test('spot on can be turned off', () => {
  const t = setup(game, 2, { spotOn: false });
  t.act(0, 'bid', { qty: 1, face: 2 });
  t.act(1, 'spotOn');
  assert.strictEqual(t.room.game.phase, 'bidding');
});

test('lose your last die: finish your drink, and the last one with dice wins', () => {
  const t = setup(game, 3, { dice: 3 });
  const g = t.room.game;
  g.dice = { p0: 1, p1: 1, p2: 3 };
  rig(t, [[4], [2], [3, 3, 3]]);
  g.turnId = 'p0';
  t.act(0, 'bid', { qty: 2, face: 4 }); // only one 4
  t.act(1, 'liar');
  assert.strictEqual(g.dice.p0, 0);
  assert.deepStrictEqual(g.reveal.out, ['p0']);
  assert.ok(t.events.some((e) => e.playerId === 'p0' && e.data.title === 'FINISH YOUR DRINK'));
  t.act(0, 'next');
  assert.strictEqual(g.turnId, 'p1', 'the player after the one who went out starts');
  assert.deepStrictEqual(Object.keys(g.hands), ['p1', 'p2']);
  rig(t, [null, [2], [3, 3, 3]]);
  delete g.hands.p0;
  t.act(1, 'bid', { qty: 4, face: 2 }); // 1 two
  assert.strictEqual(g.turnId, 'p2', 'players who are out are skipped');
  t.act(2, 'liar');
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winnerId, 'p2');
});

test('with losing dice off, a lost call is just a drink', () => {
  const t = setup(game, 2, { loseDice: false });
  rig(t, [[2, 2, 3, 4, 6], [1, 1, 5, 5, 5]]);
  t.act(0, 'bid', { qty: 9, face: 6 });
  t.act(1, 'liar');
  assert.deepStrictEqual(t.room.game.dice, { p0: 5, p1: 5 });
  assert.strictEqual(t.room.game.phase, 'reveal');
});

test('a bidder who disconnects is skipped, and late joiners watch', () => {
  const t = setup(game, 3);
  t.act(0, 'bid', { qty: 1, face: 2 });
  t.disconnect(1);
  assert.strictEqual(t.room.game.turnId, 'p2');
  t.room.players.push({ id: 'p3', name: 'Late', drinks: 0, connected: true });
  game.onJoin(t.room, t.room.players[3], t.ctx);
  assert.deepStrictEqual(t.view(3).myDice, []);
  t.act(2, 'bid', { qty: 2, face: 2 });
  assert.strictEqual(t.room.game.turnId, 'p0', 'the newcomer has no dice to bid with');
});
