const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/shotPoker');

// '10H' → { rank: 10, suit: 'H' }; 'AS' → ace of spades.
const R = { A: 14, K: 13, Q: 12, J: 11 };
const c = (s) => ({ rank: R[s.slice(0, -1)] || Number(s.slice(0, -1)), suit: s.slice(-1) });
const cards = (s) => s.split(' ').map(c);
const best = (s) => game.bestHand(cards(s));

// Deals fixed hole cards and a fixed board for the current hand.
function rig(t, holes, board) {
  const g = t.room.game;
  holes.forEach((h, i) => { g.hands[`p${i}`] = cards(h); });
  // The board comes off the deck after a burn card each street.
  const b = cards(board);
  const order = [c('2C'), b[0], b[1], b[2], c('2C'), b[3], c('2C'), b[4]];
  g.deck.push(...order.reverse());
}

test('hand ranks, best five of seven', () => {
  const names = [
    ['AS KS QS JS 10S 2D 3C', 'Royal flush'],
    ['9H 8H 7H 6H 5H AS AD', 'Straight flush, 9 high'],
    ['7C 7D 7H 7S KD 2C 3C', 'Four 7s'],
    ['KC KD KH 4S 4D 2C 3C', 'Full house, Kings over 4s'],
    ['AH 9H 7H 4H 2H KS KD', 'Flush, Ace high'],
    ['AS 2D 3C 4H 5S KD KC', 'Straight, 5 high'],
    ['QC QD QH 9S 4D 2C 3C', 'Three Queens'],
    ['JC JD 6H 6S AD 2C 3C', 'Two pair, Jacks and Sixes'],
    ['10C 10D 6H 8S AD 2C 3C', 'Pair of 10s'],
    ['AC JD 6H 8S 4D 2C 3H', 'Ace high'],
  ];
  for (const [hand, name] of names) assert.strictEqual(game.handName(best(hand).score), name, hand);
  const order = names.map(([h]) => best(h).score);
  for (let i = 1; i < order.length; i++) assert.ok(game.compare(order[i - 1], order[i]) > 0, names[i - 1][1]);
});

test('kickers and ties', () => {
  const ak = best('AS KD 9C 9H 4S 3D 2C');
  const aq = best('AS QD 9C 9H 4S 3D 2C');
  assert.ok(game.compare(ak.score, aq.score) > 0, 'pair of 9s, King kicker beats Queen kicker');
  // The board plays for both: a tie.
  assert.strictEqual(game.compare(best('2C 3D AS KS QS JS 10S').score, best('4C 5D AS KS QS JS 10S').score), 0);
});

test('shots and sips', () => {
  assert.strictEqual(game.shotText(8, 5), '1 shot + 3 sips');
  assert.strictEqual(game.shotText(10, 5), '2 shots');
  assert.strictEqual(game.shotText(1, 5), '1 sip');
  assert.strictEqual(game.shotText(0, 5), '0 sips');
});

test('everyone antes; folding drinks what you put in; last one standing drinks nothing', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  assert.strictEqual(g.phase, 'betting');
  assert.strictEqual(g.turnId, 'p0', 'the player after the dealer acts first');
  assert.deepStrictEqual(t.view(0).seats.map((s) => s.committed), [1, 1, 1]);
  t.act(1, 'check'); // not their turn
  assert.strictEqual(g.turnId, 'p0');
  t.act(0, 'raise', { to: '4' });
  t.act(1, 'fold');
  assert.deepStrictEqual(t.drinks(), [0, 1, 0], 'p1 folds on their ante');
  t.act(2, 'call');
  assert.strictEqual(g.street, 'flop');
  assert.strictEqual(g.community.length, 3);
  t.act(0, 'raise', { to: '3' });
  t.act(2, 'fold');
  assert.deepStrictEqual(t.drinks(), [0, 1, 5]);
  assert.strictEqual(g.phase, 'showdown');
  assert.deepStrictEqual(t.view(0).result.winners, ['p0']);
  assert.deepStrictEqual(t.view(0).result.hands, {}, 'nobody has to show when everyone folds');
});

test('showdown: best hand drinks nothing, the rest drink what they put in', () => {
  const t = setup(game, 3);
  rig(t, ['AS AD', 'KS KD', '7C 2D'], 'AC 9H 5S 3D QH');
  t.act(0, 'raise', { to: 2 }).act(1, 'call').act(2, 'call'); // 3 each
  for (let street = 0; street < 3; street++) t.act(0, 'check').act(1, 'check').act(2, 'check');
  const g = t.room.game;
  assert.strictEqual(g.phase, 'showdown');
  const v = t.view(1);
  assert.deepStrictEqual(v.result.winners, ['p0']);
  assert.strictEqual(v.result.hands.p0.name, 'Three Aces');
  assert.deepStrictEqual(v.result.hands.p1.cards, cards('KS KD'), 'showdown hands are shown');
  assert.deepStrictEqual(t.drinks(), [0, 3, 3]);
});

test('bets stop at the max shots; owing a whole shot needs ☠️🥃 before the next hand', () => {
  const t = setup(game, 2, { perShot: 5, maxShots: 2 }); // cap 10 a hand
  const g = t.room.game;
  rig(t, ['AS AD', 'KS KD'], 'AC 9H 5S 3D QH');
  assert.strictEqual(t.view(0).maxTo, 9, '10 less the 1 sip ante');
  t.act(0, 'raise', { to: 10 }); // too much
  assert.strictEqual(g.currentBet, 0);
  t.act(0, 'raise', { to: 9 }).act(1, 'call');
  // Both all in: the board is dealt out with no more betting.
  assert.strictEqual(g.phase, 'showdown');
  assert.strictEqual(g.community.length, 5);
  assert.deepStrictEqual(t.drinks(), [0, 10]);
  assert.deepStrictEqual(g.debts.p1, { sips: 10, text: '2 shots', paid: false });
  assert.ok(t.events.some((e) => e.playerId === 'p1' && e.data.title === 'TAKE 2 SHOTS'));
  assert.deepStrictEqual(t.view(0).waitingOn, ['p1']);
  t.act(0, 'deal'); // blocked
  assert.strictEqual(g.phase, 'showdown');
  t.act(0, 'paid'); // nothing to pay
  t.act(1, 'paid');
  assert.deepStrictEqual(t.view(0).waitingOn, []);
  t.act(0, 'deal');
  assert.strictEqual(g.phase, 'betting');
  assert.strictEqual(g.hand, 2);
  assert.strictEqual(g.dealerId, 'p0', 'the button moves on');
});

test('every debt, even a sip, has to be settled before the next hand', () => {
  const t = setup(game, 2);
  t.act(0, 'fold');
  assert.deepStrictEqual(t.room.game.debts.p0, { sips: 1, text: '1 sip', paid: false });
  assert.deepStrictEqual(t.view(1).waitingOn, ['p0']);
  t.act(1, 'deal');
  assert.strictEqual(t.room.game.phase, 'showdown');
  t.act(0, 'paid');
  assert.deepStrictEqual(t.view(1).waitingOn, []);
});

test('a raise reopens the betting for everyone still in', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  t.act(0, 'check').act(1, 'raise', { to: 2 });
  assert.strictEqual(g.turnId, 'p2');
  t.act(2, 'call');
  assert.strictEqual(g.turnId, 'p0', 'p0 has to answer the raise');
  t.act(0, 'raise', { to: 4 });
  t.act(1, 'call').act(2, 'call');
  assert.strictEqual(g.street, 'flop');
  assert.deepStrictEqual(t.view(0).seats.map((s) => s.committed), [5, 5, 5]);
});

test('a player who drops on their turn folds; late joiners wait for the next hand', () => {
  const t = setup(game, 3);
  t.disconnect(0);
  assert.ok(t.room.game.folded.p0);
  assert.strictEqual(t.room.game.turnId, 'p1');
  t.room.players.push({ id: 'p3', name: 'Late', drinks: 0, connected: true });
  game.onJoin(t.room, t.room.players[3], t.ctx);
  assert.strictEqual(t.view(3).inHand, false);
  t.act(1, 'fold');
  t.room.players[0].connected = true;
  t.act(0, 'paid').act(1, 'paid'); // everyone settles their tab first
  t.act(0, 'deal');
  assert.strictEqual(t.view(3).inHand, true);
  assert.strictEqual(t.view(3).myCards.length, 2);
});

test("tonight's tab counts every sip and finished drink across games", () => {
  const t = setup(game, 2);
  t.act(0, 'fold');
  t.ctx.finishDrink(t.room, 'p1', 'test');
  t.room.players[0].drinks = 0; // a new game resets this game's count, not the night's
  assert.strictEqual(t.room.players[0].total, 1);
  assert.strictEqual(t.room.players[1].finished, 1);
});
