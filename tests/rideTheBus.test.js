const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/rideTheBus');

const c = (rank, suit) => ({ rank, suit });

// Makes the given cards the next ones drawn, in order.
function deal(t, ...cards) {
  t.room.game.deck.push(...cards.slice().reverse());
}

// Plays round 1 for everyone with guesses that are always wrong or always right as given.
function guessAs(t, i, guess, card) {
  deal(t, card);
  t.act(i, 'guess', { guess });
}

test('guessing goes round the table, one round at a time', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  assert.strictEqual(g.phase, 'guess');
  assert.strictEqual(t.view(0).turnId, 'p0');
  assert.strictEqual(t.view(0).roundType, 'color');
  guessAs(t, 1, 'red', c(5, 'H')); // not their turn
  assert.strictEqual(g.hands.p1.length, 0);
  guessAs(t, 0, 'black', c(5, 'H')); // wrong
  assert.strictEqual(t.view(0).turnId, 'p1');
  guessAs(t, 1, 'black', c(5, 'H'));
  guessAs(t, 2, 'black', c(5, 'H'));
  assert.strictEqual(g.round, 1);
  assert.strictEqual(t.view(0).roundType, 'highlow');
  assert.strictEqual(t.view(0).turnId, 'p0');
  t.cleanup();
});

test('a wrong guess drinks the round number; a right guess gives it out', () => {
  const t = setup(game, 2);
  guessAs(t, 0, 'black', c(5, 'H'));
  assert.deepStrictEqual(t.drinks(), [1, 0]);
  guessAs(t, 1, 'red', c(9, 'D')); // right
  assert.strictEqual(t.room.game.phase, 'give');
  t.act(1, 'give', { targetId: 'p1' }); // not yourself
  assert.strictEqual(t.room.game.phase, 'give');
  t.act(1, 'give', { targetId: 'p0' });
  assert.deepStrictEqual(t.drinks(), [2, 0]);
  // Round 2 (higher/lower, 2 sips)
  guessAs(t, 0, 'higher', c(10, 'S')); // 10 vs 5: right
  t.act(0, 'give', { targetId: 'p1' });
  assert.deepStrictEqual(t.drinks(), [2, 2]);
  guessAs(t, 1, 'higher', c(9, 'C')); // 9 vs 9: equal is wrong
  assert.deepStrictEqual(t.drinks(), [2, 4]);
  t.cleanup();
});

test('inside/outside and suit rounds', () => {
  assert.ok(game.guessRight('inout', 'inside', c(7, 'S'), [c(5, 'H'), c(10, 'D')]));
  assert.ok(!game.guessRight('inout', 'inside', c(5, 'S'), [c(5, 'H'), c(10, 'D')]), 'equal to an edge is wrong');
  assert.ok(game.guessRight('inout', 'outside', c(14, 'S'), [c(10, 'H'), c(5, 'D')]));
  assert.ok(!game.guessRight('inout', 'outside', c(10, 'S'), [c(10, 'H'), c(5, 'D')]));
  assert.ok(game.guessRight('suit', 'H', c(2, 'H'), []));
  assert.ok(game.guessRight('color', 'black', c(2, 'C'), []));
});

// One guess per round that's always wrong with a 2 of hearts (so nobody has to give sips).
const WRONG = ['black', 'higher', 'inside', 'S'];

function toPyramid(t, players, hands) {
  const g = t.room.game;
  for (const guess of WRONG) for (let i = 0; i < players; i++) guessAs(t, i, guess, c(2, 'H'));
  assert.strictEqual(g.phase, 'pyramid');
  hands.forEach((h, i) => { g.hands[`p${i}`] = h.slice(); });
  return g;
}

test('after four rounds the pyramid comes out; matches give sips by row', () => {
  const t = setup(game, 3);
  const g = toPyramid(t, 3, [[c(7, 'S'), c(9, 'D')], [c(7, 'H')], [c(3, 'C')]]);
  assert.strictEqual(t.view(0).pyramid.total, 10);
  assert.ok(t.view(0).pyramid.rows.flat().every((x) => x === null), 'all face down');
  g.pyramid.rows[0][0] = c(7, 'C');
  g.pyramid.rows[1][0] = c(9, 'C');
  t.act(1, 'flip'); // only the host flips
  assert.strictEqual(g.pyramid.flipped, 0);
  t.act(0, 'flip');
  assert.deepStrictEqual(t.view(2).pyramid.current, { row: 0, col: 0, card: c(7, 'C'), sips: 1 });
  t.act(2, 'play', { cardIdx: 0, targetId: 'p0' }); // a 3 doesn't match
  assert.strictEqual(g.pyramid.plays.length, 0);
  const before = t.drinks();
  t.act(0, 'play', { cardIdx: 0, targetId: 'p2' });
  t.act(1, 'play', { cardIdx: 0, targetId: 'p2' });
  assert.strictEqual(t.drinks()[2] - before[2], 2);
  assert.strictEqual(g.hands.p0.length, 1);
  assert.strictEqual(g.hands.p1.length, 0);
  for (let k = 0; k < 4; k++) t.act(0, 'flip'); // rest of the bottom row
  assert.strictEqual(t.view(0).pyramid.current.sips, 2, 'second row is 2 sips');
  t.act(0, 'play', { cardIdx: 0, targetId: 'p1' }); // the 9
  assert.strictEqual(t.drinks()[1] - before[1], 2);
  t.cleanup();
});

test('bluffing: play any card; the receiver drinks or calls it, and the loser drinks double', () => {
  const t = setup(game, 3, { bluff: true });
  const g = toPyramid(t, 3, [[c(4, 'S'), c(8, 'D')], [c(8, 'H')], [c(3, 'C')]]);
  g.pyramid.rows[0][0] = c(8, 'C');
  t.act(0, 'flip');
  const start = t.drinks();
  t.act(0, 'play', { cardIdx: 0, targetId: 'p1' }); // bluff with a 4
  assert.strictEqual(t.view(1).pyramid.plays[0].card, null, 'the receiver cannot see the card');
  t.act(1, 'callBluff', { playId: 0 });
  assert.strictEqual(t.drinks()[0] - start[0], 2, 'caught: the bluffer drinks double');
  t.act(1, 'play', { cardIdx: 0, targetId: 'p2' }); // a real 8
  t.act(2, 'callBluff', { playId: 1 });
  assert.strictEqual(t.drinks()[2] - start[2], 2, 'wrong call: the caller drinks double');
  t.act(0, 'play', { cardIdx: 0, targetId: 'p2' }); // the other 8, left pending
  t.act(0, 'flip');
  assert.strictEqual(t.drinks()[2] - start[2], 3, 'unanswered plays are taken at the next flip');
  t.cleanup();
});

test('the player with the most cards rides the bus; ties go to the highest total', () => {
  const t = setup(game, 3);
  const g = toPyramid(t, 3, [[c(2, 'S'), c(3, 'S')], [c(14, 'S'), c(2, 'D')], [c(9, 'C')]]);
  for (let k = 0; k <= 10; k++) t.act(0, 'flip');
  assert.strictEqual(g.phase, 'bus');
  assert.strictEqual(t.view(0).bus.riderId, 'p1');
  t.cleanup();
});

function toBus(t, opts) {
  const g = t.room.game;
  for (const guess of WRONG) for (let i = 0; i < 2; i++) guessAs(t, i, guess, c(2, 'H'));
  g.hands.p0 = [c(2, 'S'), c(3, 'S')];
  g.hands.p1 = [];
  for (let k = 0; k <= g.pyramid.rows.flat().length; k++) t.act(0, 'flip');
  assert.strictEqual(g.phase, 'bus');
  return g;
}

test('riding the bus: a wrong guess drinks one per card reached and starts a fresh row', () => {
  const t = setup(game, 2);
  const g = toBus(t);
  assert.strictEqual(g.bus.riderId, 'p0');
  g.bus.row = [c(2, 'H'), c(3, 'S'), c(4, 'D'), c(5, 'C'), c(6, 'H')];
  const start = t.drinks()[0];
  t.act(1, 'busGuess', { guess: 'red' }); // only the rider
  assert.strictEqual(g.bus.pos, 0);
  t.act(0, 'busGuess', { guess: 'red' });
  t.act(0, 'busGuess', { guess: 'black' });
  assert.strictEqual(g.bus.pos, 2);
  t.act(0, 'busGuess', { guess: 'black' }); // 4 of diamonds is red: wrong on the 3rd card
  assert.strictEqual(t.drinks()[0] - start, 3);
  assert.strictEqual(g.bus.pos, 0);
  assert.strictEqual(g.bus.attempts, 2);
  g.bus.row = [c(2, 'H'), c(3, 'H'), c(4, 'D'), c(5, 'D'), c(6, 'H')];
  for (let k = 0; k < 5; k++) t.act(0, 'busGuess', { guess: 'red' });
  assert.strictEqual(g.phase, 'over');
  t.cleanup();
});

test('bus options: length, higher/lower, and all four in turn', () => {
  const t = setup(game, 2, { busLength: 7, busGuess: 'sequence' });
  const g = toBus(t);
  assert.strictEqual(g.bus.row.length, 7);
  g.bus.start = c(8, 'C');
  g.bus.row = [c(5, 'H'), c(10, 'S'), c(7, 'D'), c(2, 'C'), c(3, 'H'), c(9, 'S'), c(9, 'H')];
  const types = [];
  const guesses = ['red', 'higher', 'inside', 'C', 'red', 'higher', 'inside'];
  for (const guess of guesses) {
    types.push(t.view(0).bus.type);
    t.act(0, 'busGuess', { guess });
  }
  assert.deepStrictEqual(types, ['color', 'highlow', 'inout', 'suit', 'color', 'highlow', 'inout']);
  assert.strictEqual(g.phase, 'bus', 'last card (9 between 3 and 9) is not inside');
  assert.strictEqual(g.bus.attempts, 2);
  t.cleanup();
});

test('a random full game always reaches the end', () => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (let n = 0; n < 200; n++) {
    const players = 2 + (n % 6);
    const t = setup(game, players, { rows: n % 2 ? 5 : 4, bluff: n % 3 === 0, busGuess: pick(['color', 'highlow', 'sequence']) });
    const g = t.room.game;
    let steps = 0;
    while (g.phase !== 'over' && steps++ < 5000) {
      const idx = (id) => Number(id.slice(1));
      if (g.phase === 'guess') {
        const v = t.view(0);
        const opts = { color: ['red', 'black'], highlow: ['higher', 'lower'], inout: ['inside', 'outside'], suit: ['S', 'H', 'D', 'C'] }[v.roundType];
        t.act(idx(v.turnId), 'guess', { guess: pick(opts) });
      } else if (g.phase === 'give') {
        t.act(idx(g.give.from), 'give', { targetId: pick(g.order.filter((id) => id !== g.give.from)) });
      } else if (g.phase === 'pyramid') {
        const i = Math.floor(Math.random() * players);
        const hand = g.hands[`p${i}`];
        if (hand.length && Math.random() < 0.4) t.act(i, 'play', { cardIdx: Math.floor(Math.random() * hand.length), targetId: `p${(i + 1) % players}` });
        else if (g.bluff && Math.random() < 0.3) {
          const pending = g.pyramid.plays.find((p) => p.status === 'pending');
          if (pending) t.act(idx(pending.targetId), pick(['accept', 'callBluff']), { playId: pending.id });
        } else t.act(0, 'flip');
      } else if (g.phase === 'bus') {
        const type = t.view(0).bus.type;
        const opts = { color: ['red', 'black'], highlow: ['higher', 'lower'], inout: ['inside', 'outside'], suit: ['S', 'H', 'D', 'C'] }[type];
        t.act(idx(g.bus.riderId), 'busGuess', { guess: pick(opts) });
      }
    }
    assert.strictEqual(g.phase, 'over', `game ${n} finished`);
    t.cleanup();
  }
});

test('bots: a sharp bot guesses the odds on its turn only and gives sips to a human', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  t.player(0).bot = 'booler';
  t.player(2).bot = 'npv';
  assert.strictEqual(t.bot(1, 1), null, 'not its turn');
  g.hands.p0.push(c(5, 'H'), c(3, 'S'));
  g.round = 1;
  assert.deepStrictEqual(t.bot(0, 1), { type: 'guess', guess: 'higher' }, 'higher than a 3');
  g.hands.p0[1] = c(13, 'S');
  assert.deepStrictEqual(t.bot(0, 1), { type: 'guess', guess: 'lower' }, 'lower than a king');
  g.round = 2; // 5 and king: more ranks inside than out
  assert.deepStrictEqual(t.bot(0, 1), { type: 'guess', guess: 'inside' });
  g.hands.p0[1] = c(6, 'S'); // 5 and 6: nothing inside
  assert.deepStrictEqual(t.bot(0, 1), { type: 'guess', guess: 'outside' });

  g.round = 0;
  deal(t, c(9, 'D'));
  t.act(0, 'guess', { guess: 'red' });
  assert.strictEqual(g.phase, 'give');
  for (let n = 0; n < 10; n++) assert.deepStrictEqual(t.bot(0, 0.25), { type: 'give', targetId: 'p1' });
  t.cleanup();
});

test('bots: in the pyramid a bot plays its match, and calls a bluff that cannot be true', () => {
  const t = setup(game, 2, { bluff: true });
  const g = t.room.game;
  g.order.forEach((id, i) => { g.hands[id] = i ? [c(2, 'C')] : [c(7, 'H'), c(9, 'S')]; });
  g.round = 4;
  g.pyramid = { rows: [[c(9, 'D'), c(4, 'D')], [c(5, 'D')]], flipped: 1, plays: [] };
  g.phase = 'pyramid';
  for (let n = 0; n < 10; n++) {
    const a = t.bot(0, 1);
    assert.ok(a.type === 'play' && a.cardIdx === 1 && a.targetId === 'p1', 'plays the 9');
  }
  // p1 plays a "9" to p0, who holds the other three 9s (the fourth is the pyramid card): a bluff.
  g.hands.p0.push(c(9, 'H'), c(9, 'C'));
  t.act(1, 'play', { cardIdx: 0, targetId: 'p0' });
  assert.deepStrictEqual(t.bot(0, 1), { type: 'callBluff', playId: 0 });
  t.cleanup();
});
