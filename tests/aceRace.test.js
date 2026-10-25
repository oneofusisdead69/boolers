const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/aceRace');

const c = (s) => ({ rank: Number(s.slice(0, -1)) || 10, suit: s.slice(-1) });
// Makes the given cards the next ones flipped, in order.
const stack = (t, ...cards) => t.room.game.deck.push(...cards.map(c).reverse());
const flip = (t, n = 1) => { for (let i = 0; i < n; i++) t.act(0, 'flip'); };

test('no aces in the deck or the track; bets are checked and can change', () => {
  const t = setup(game, 3, { speed: 'manual', maxBet: 5 });
  const g = t.room.game;
  assert.ok(![...g.deck, ...g.track].some((x) => x.rank === 14));
  assert.strictEqual(g.track.length, 7);
  assert.deepStrictEqual(t.view(1).track, Array(7).fill(null), 'track cards start face down');
  t.act(1, 'bet', { suit: 'H', sips: '6' }); // over the max
  t.act(1, 'bet', { suit: 'X', sips: '2' });
  assert.deepStrictEqual(g.bets, {});
  t.act(1, 'bet', { suit: 'H', sips: '2' }).act(1, 'bet', { suit: 'S', sips: '3' });
  assert.deepStrictEqual(t.view(0).bets, { p1: { pick: 'S', sips: 3 } });
  t.act(1, 'startRace'); // only the host starts
  assert.strictEqual(g.phase, 'betting');
  t.act(0, 'startRace');
  assert.strictEqual(g.phase, 'race');
  t.act(2, 'bet', { suit: 'D', sips: '1' }); // too late
  assert.strictEqual(g.bets.p2, undefined);
});

test('each flip moves its horse; a track card flips once everyone has passed it', () => {
  const t = setup(game, 2, { speed: 'manual', length: 5 });
  const g = t.room.game;
  g.track[0] = c('5S');
  t.act(0, 'bet', { suit: 'H', sips: 1 }).act(0, 'startRace');
  stack(t, '2S', '2H', '2D');
  flip(t, 3);
  assert.deepStrictEqual(g.positions, { S: 1, H: 1, D: 1, C: 0 });
  assert.strictEqual(g.trackFlipped[0], false, 'clubs are still at the start');
  stack(t, '3C');
  flip(t);
  assert.strictEqual(g.trackFlipped[0], true);
  assert.deepStrictEqual(g.positions, { S: 0, H: 1, D: 1, C: 1 }, 'the 5 of spades knocks spades back');
  assert.deepStrictEqual(t.view(1).last.back, { suit: 'S', row: 1 });
  assert.deepStrictEqual(t.view(1).track[0], c('5S'));
});

test('the winner crosses the line; losers drink, winners hand out double', () => {
  const t = setup(game, 3, { speed: 'manual', length: 5 });
  const g = t.room.game;
  t.act(0, 'bet', { suit: 'H', sips: 2 }).act(1, 'bet', { suit: 'S', sips: 3 }).act(2, 'bet', { suit: 'H', sips: 1 });
  t.act(0, 'startRace');
  g.positions = { S: 0, H: 5, D: 0, C: 0 };
  stack(t, '9H');
  flip(t);
  assert.strictEqual(g.winner, 'H');
  assert.strictEqual(g.phase, 'payout');
  assert.deepStrictEqual(t.drinks(), [0, 3, 0]);
  assert.deepStrictEqual(g.payout, { p0: { total: 4, done: false }, p2: { total: 2, done: false } });
  t.act(0, 'give', { alloc: JSON.stringify({ p1: 3 }) }); // must hand out exactly 4
  t.act(0, 'give', { alloc: JSON.stringify({ p0: 4 }) }); // not to yourself
  assert.strictEqual(g.payout.p0.done, false);
  t.act(0, 'give', { alloc: JSON.stringify({ p1: 3, p2: 1 }) });
  assert.deepStrictEqual(t.drinks(), [0, 6, 1]);
  assert.strictEqual(g.phase, 'payout', 'waiting on the other winner');
  t.act(2, 'give', { alloc: JSON.stringify({ p1: 2 }) });
  assert.strictEqual(g.phase, 'results');
  assert.deepStrictEqual(t.view(0).drank, { p1: 8, p2: 1 });
  t.act(0, 'nextRace');
  assert.strictEqual(g.phase, 'betting');
  assert.strictEqual(g.race, 2);
  assert.deepStrictEqual(g.bets, {});
});

test('a winner who leaves does not hold up the payout', () => {
  const t = setup(game, 2, { speed: 'manual', length: 5 });
  const g = t.room.game;
  t.act(1, 'bet', { suit: 'C', sips: 1 }).act(0, 'startRace');
  g.positions.C = 5;
  stack(t, '4C');
  flip(t);
  assert.strictEqual(g.phase, 'payout');
  t.disconnect(1);
  assert.strictEqual(g.phase, 'results');
});

test('auto races flip on a timer and the deck reshuffles if it runs out', () => {
  const t = setup(game, 2, { length: 9 });
  const g = t.room.game;
  t.act(0, 'bet', { suit: 'D', sips: 1 }).act(0, 'startRace');
  let guard = 0;
  while (g.phase === 'race' && guard++ < 500) t.fireTimer();
  assert.notStrictEqual(g.phase, 'race', 'someone always wins');
  assert.ok(g.winner);
  t.cleanup();
});

test('bots bet once, flip as host in manual mode, and hand out their winnings', () => {
  const t = setup(game, 2, { speed: 'manual', maxBet: 5 });
  const g = t.room.game;
  t.player(1).bot = 'npv';
  const bad = t.bot(1, 0.25);
  assert.ok(bad.type === 'bet' && bad.sips >= 3 && bad.sips <= 5, `bad bot bets ${bad.sips}`);
  t.act(1, 'bet', bad);
  assert.strictEqual(t.bot(1, 0.25), null, 'once a race');
  assert.strictEqual(t.bot(0, 0.9).type, 'bet');
  assert.ok(t.bot(0, 0.9).sips <= 1, 'good bots bet modestly');
  t.act(0, 'bet', { suit: bad.suit, sips: 1 });
  assert.strictEqual(t.bot(0, 0.9).type, 'startRace');
  assert.strictEqual(t.bot(1, 0.9), null, 'only the host starts');
  t.act(0, 'startRace');
  // Their suit is one step from the line; the host bot flips it over.
  g.positions[bad.suit] = g.length;
  stack(t, `2${bad.suit}`);
  t.act(0, t.bot(0, 0.9).type);
  assert.strictEqual(g.winner, bad.suit);
  // Both backed the winner: the bot hands its sips to the human.
  const give = t.bot(1, 0.25);
  assert.deepStrictEqual(JSON.parse(give.alloc), { p0: bad.sips * 2 });
  t.act(1, 'give', give).act(0, 'give', { alloc: JSON.stringify({ p1: 2 }) });
  assert.strictEqual(g.phase, 'results');
  assert.strictEqual(t.bot(0, 0.9).type, 'nextRace');
  t.cleanup();
});
