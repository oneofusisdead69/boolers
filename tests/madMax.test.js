const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/madMax');

const c = (rank, suit) => ({ rank, suit });

// Puts known cards in play: hands by player index, and the pile (last card is on top).
function rig(t, hands, pile) {
  const g = t.room.game;
  hands.forEach((h, i) => { g.hands[`p${i}`] = h.slice(); });
  g.pile = pile.slice();
  g.run = pile.slice();
}

const total = (g) => Object.values(g.hands).flat().length + g.pile.length
  + (g.war ? Object.values(g.war.cards).flat().filter(Boolean).length * (g.phase === 'warResult' || g.phase === 'over' ? 0 : 1) : 0);

test('the decks are dealt evenly; leftovers start the pile', () => {
  const t = setup(game, 3, { decks: 2 });
  const g = t.room.game;
  assert.deepStrictEqual(Object.values(g.hands).map((h) => h.length), [34, 34, 34]);
  assert.strictEqual(g.pile.length, 2);
  assert.strictEqual(total(g), 104);
  assert.strictEqual(g.turnId, 'p0');
  assert.strictEqual(t.view(1).counts.p0, 34);
  assert.ok(!('hands' in t.view(0)), 'nobody sees the face-down cards');
  t.cleanup();
});

test('a right call passes play on', () => {
  const t = setup(game, 3, { finalBattle: false });
  rig(t, [[c(9, 'H')], [c(2, 'S')], [c(3, 'S')]], [c(5, 'S')]);
  t.act(1, 'call', { call: 'higher' }); // not their turn
  assert.strictEqual(t.room.game.pile.length, 1);
  t.act(0, 'call', { call: 'higher' });
  assert.strictEqual(t.room.game.lastFlip.right, true);
  assert.strictEqual(t.room.game.turnId, 'p1');
  assert.deepStrictEqual(t.drinks(), [0, 0, 0]);
  t.cleanup();
});

test('a wrong call is a sip and you go again; a wrong suit is two', () => {
  const t = setup(game, 3, { finalBattle: false });
  rig(t, [[c(9, 'H'), c(4, 'C'), c(12, 'D')], [c(2, 'S')], [c(3, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'lower' }); // 9 on 5: wrong
  assert.deepStrictEqual(t.drinks(), [1, 0, 0]);
  assert.strictEqual(t.room.game.turnId, 'p0');
  assert.strictEqual(t.room.game.phase, 'call');
  t.act(0, 'call', { call: 'H' }); // 4 of clubs: wrong suit
  assert.deepStrictEqual(t.drinks(), [3, 0, 0]);
  t.act(0, 'call', { call: 'different' }); // Q of diamonds on 4 of clubs: different colour
  assert.strictEqual(t.room.game.turnId, 'p1');
  t.cleanup();
});

test('running out of cards on a wrong call puts you out', () => {
  const t = setup(game, 3, { finalBattle: false });
  rig(t, [[c(9, 'H')], [c(2, 'S')], [c(4, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'lower' });
  assert.strictEqual(t.room.game.turnId, 'p1');
  assert.strictEqual(t.view(1).counts.p0, 0);
  t.cleanup();
});

test('same number is an automatic war: no drink, the flipper picks an opponent', () => {
  const t = setup(game, 3);
  rig(t, [[c(5, 'H'), c(2, 'C')], [c(9, 'S')], [c(3, 'S'), c(4, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  assert.strictEqual(t.room.game.phase, 'pick');
  assert.deepStrictEqual(t.drinks(), [0, 0, 0]);
  assert.deepStrictEqual(t.view(0).pickable, ['p1', 'p2']);
  t.act(0, 'pick', { targetId: 'p0' }); // not yourself
  assert.strictEqual(t.room.game.phase, 'pick');
  t.act(0, 'pick', { targetId: 'p2' });
  assert.strictEqual(t.room.game.phase, 'terms');
  assert.deepStrictEqual(t.room.game.war.challengers, ['p0']);
  assert.strictEqual(t.room.game.war.challengedId, 'p2');
  t.cleanup();
});

test('one higher or lower opens a war chance; once everyone passes the call stands', () => {
  const t = setup(game, 3);
  rig(t, [[c(6, 'H'), c(2, 'C')], [c(9, 'S')], [c(3, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'lower' }); // 6 on 5: one off, and wrong
  assert.strictEqual(t.room.game.phase, 'challenge');
  assert.strictEqual(t.room.timer, null, 'no countdown');
  assert.ok(t.view(1).canChallenge);
  assert.ok(!t.view(0).canChallenge, 'the flipper cannot challenge themselves');
  t.act(0, 'pass'); // the flipper can't pass for everyone
  t.act(1, 'pass');
  assert.strictEqual(t.room.game.phase, 'challenge', 'still waiting on Player2');
  assert.ok(!t.view(1).canChallenge, 'passed players cannot call war');
  t.act(1, 'war');
  assert.strictEqual(t.room.game.phase, 'challenge');
  assert.deepStrictEqual(t.drinks(), [0, 0, 0], 'no drink until the chance closes');
  t.act(2, 'pass');
  assert.deepStrictEqual(t.drinks(), [1, 0, 0]);
  assert.strictEqual(t.room.game.turnId, 'p0');
  t.cleanup();
});

test('a disconnected player never holds up a war chance', () => {
  const t = setup(game, 3);
  rig(t, [[c(6, 'H'), c(2, 'C')], [c(9, 'S')], [c(3, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  t.act(1, 'pass');
  t.disconnect(2);
  assert.strictEqual(t.room.game.phase, 'call');
  assert.strictEqual(t.room.game.turnId, 'p1');
  t.cleanup();
});

test('a sandwich (matches the card two plays back) opens a challenge window', () => {
  const t = setup(game, 3);
  rig(t, [[c(9, 'H')], [c(2, 'S')], [c(3, 'S')]], [c(9, 'S'), c(4, 'D')]);
  t.act(0, 'call', { call: 'higher' });
  assert.strictEqual(t.room.game.phase, 'challenge');
  assert.strictEqual(t.room.game.lastFlip.chance, 'sandwich');
  t.cleanup();
});

test('a challenge skips the call and starts a war against the flipper', () => {
  const t = setup(game, 3);
  rig(t, [[c(6, 'H'), c(2, 'C')], [c(9, 'S')], [c(3, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'lower' });
  t.act(2, 'war');
  assert.strictEqual(t.room.game.phase, 'terms');
  assert.deepStrictEqual(t.room.game.war.challengers, ['p2']);
  assert.strictEqual(t.room.game.war.challengedId, 'p0');
  assert.deepStrictEqual(t.drinks(), [0, 0, 0], 'just war, no drink for the call');
  t.cleanup();
});

test('others can join before the terms; several challengers means high/low only', () => {
  const t = setup(game, 4);
  rig(t, [[c(6, 'H'), ...Array(3).fill(c(2, 'C'))], Array(4).fill(c(9, 'S')), Array(4).fill(c(3, 'S')), Array(4).fill(c(4, 'D'))], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  t.act(1, 'war');
  assert.ok(t.view(2).war.canJoin);
  assert.ok(!t.view(0).war.canJoin, 'the challenged player cannot join');
  t.act(2, 'join');
  assert.deepStrictEqual(t.room.game.war.challengers, ['p1', 'p2']);
  t.act(2, 'terms', { terms: 'high' }); // only the lead challenger sets terms
  assert.strictEqual(t.room.game.phase, 'terms');
  t.act(1, 'terms', { terms: 'color' });
  assert.strictEqual(t.room.game.phase, 'terms', 'colour not allowed with two challengers');
  t.act(1, 'terms', { terms: 'high' });
  assert.strictEqual(t.room.game.phase, 'war');
  t.act(3, 'join');
  assert.deepStrictEqual(t.room.game.war.challengers, ['p1', 'p2'], 'too late to join');
  t.cleanup();
});

test('a 1v1 high/low war: the challenged calls each round, most rounds wins it all', () => {
  const t = setup(game, 3);
  rig(t, [
    [c(5, 'H'), c(10, 'C'), c(12, 'C'), c(3, 'C'), c(7, 'D')], // p0 flips the 5, then war cards 10, Q, 3
    [c(4, 'S'), c(9, 'S'), c(13, 'S'), c(2, 'S')], // p1 war cards 4, 9, K
    [c(8, 'D')],
  ], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' }); // same number
  t.act(0, 'pick', { targetId: 'p1' });
  t.act(0, 'terms', { terms: 'high' });
  assert.strictEqual(t.room.game.war.callerId, 'p1', 'the challenged player calls');
  assert.deepStrictEqual(t.view(2).war.laid, { p1: 3, p0: 3 });
  t.act(0, 'warCall', { call: 'high' }); // only the caller
  assert.strictEqual(t.room.game.war.rounds.length, 0);
  t.act(1, 'warCall', { call: 'high' }); // 4 vs 10: p0
  t.act(1, 'warCall', { call: 'low' }); // 9 vs Q, low wins: p1
  t.act(1, 'warCall', { call: 'high' }); // K vs 3: p1
  const g = t.room.game;
  assert.strictEqual(g.phase, 'warResult');
  assert.strictEqual(g.war.winnerId, 'p1');
  assert.strictEqual(g.hands.p1.length, 1 + 6);
  assert.deepStrictEqual(g.war.outright, []);
  t.act(0, 'startPile');
  assert.strictEqual(g.phase, 'warResult', 'only the winner starts the pile');
  t.act(1, 'startPile');
  assert.strictEqual(g.run.length, 1, 'a new pile');
  assert.strictEqual(g.turnId, 'p2', 'play continues after the winner');
  t.cleanup();
});

test('losing every round means finishing your drink', () => {
  const t = setup(game, 2, { finalBattle: false });
  rig(t, [[c(5, 'H'), c(2, 'C'), c(3, 'C'), c(4, 'C'), c(9, 'C')], [c(10, 'S'), c(11, 'S'), c(12, 'S'), c(8, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  t.act(0, 'pick', { targetId: 'p1' });
  t.act(0, 'terms', { terms: 'high' });
  t.act(1, 'warCall', { call: 'high' }).act(1, 'warCall', { call: 'high' }).act(1, 'warCall', { call: 'high' });
  assert.deepStrictEqual(t.room.game.war.outright, ['p0']);
  assert.ok(t.events.some((e) => e.playerId === 'p0' && e.data.title === 'FINISH YOUR DRINK'));
  t.cleanup();
});

test('a tied war goes to a called tiebreak card', () => {
  const t = setup(game, 2, { finalBattle: false });
  rig(t, [
    [c(5, 'H'), c(10, 'C'), c(2, 'C'), c(7, 'C'), c(9, 'C'), c(6, 'C')],
    [c(4, 'S'), c(3, 'S'), c(7, 'S'), c(12, 'S'), c(8, 'S')],
  ], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  t.act(0, 'pick', { targetId: 'p1' });
  t.act(0, 'terms', { terms: 'high' });
  t.act(1, 'warCall', { call: 'high' }); // 10 vs 4: p0
  t.act(1, 'warCall', { call: 'high' }); // 2 vs 3: p1
  t.act(1, 'warCall', { call: 'high' }); // 7 vs 7: tie
  const g = t.room.game;
  assert.strictEqual(g.phase, 'war');
  assert.deepStrictEqual(g.war.inRound.sort(), ['p0', 'p1']);
  t.act(1, 'warCall', { call: 'high' }); // tiebreak 9 vs Q: p1
  assert.strictEqual(g.phase, 'warResult');
  assert.strictEqual(g.war.winnerId, 'p1');
  assert.strictEqual(g.war.cardsWon, 8);
  t.cleanup();
});

test('colour terms: a right call wins the round for the challenged player', () => {
  const t = setup(game, 2, { finalBattle: false });
  rig(t, [[c(5, 'H'), c(2, 'H'), c(3, 'H'), c(4, 'H'), c(9, 'C')], [c(10, 'D'), c(11, 'S'), c(12, 'D'), c(8, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  t.act(0, 'pick', { targetId: 'p1' });
  t.act(0, 'terms', { terms: 'color' });
  t.act(1, 'warCall', { call: 'high' }); // wrong kind of call for colour terms
  assert.strictEqual(t.room.game.war.rounds.length, 0);
  t.act(1, 'warCall', { call: 'same' }); // D vs H: same, right -> p1
  t.act(1, 'warCall', { call: 'same' }); // S vs H: different, wrong -> p0
  t.act(1, 'warCall', { call: 'same' }); // D vs H: same, right -> p1
  assert.strictEqual(t.room.game.war.winnerId, 'p1');
  t.cleanup();
});

test('a three-way war: the highest (or lowest) card takes each round', () => {
  const t = setup(game, 3, { finalBattle: false });
  rig(t, [
    [c(6, 'H'), c(2, 'C'), c(3, 'C'), c(4, 'C'), c(9, 'C')],
    [c(13, 'S'), c(12, 'S'), c(2, 'D'), c(8, 'S')],
    [c(10, 'D'), c(14, 'D'), c(5, 'D'), c(8, 'D')],
  ], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' }); // one off
  t.act(1, 'war');
  t.act(2, 'join');
  t.act(1, 'terms', { terms: 'high' });
  t.act(0, 'warCall', { call: 'high' }); // 2, K, 10: p1
  t.act(0, 'warCall', { call: 'high' }); // 3, Q, A: p2
  t.act(0, 'warCall', { call: 'low' }); // 4, 2, 5: p1
  assert.strictEqual(t.room.game.war.winnerId, 'p1');
  assert.strictEqual(t.room.game.war.cardsWon, 9);
  assert.deepStrictEqual(t.room.game.war.outright, ['p0']);
  t.cleanup();
});

test('winner takes the pile when that option is on', () => {
  const t = setup(game, 2, { takePile: true, finalBattle: false });
  rig(t, [[c(5, 'H'), c(10, 'C'), c(11, 'C'), c(12, 'C'), c(9, 'C')], [c(2, 'S'), c(3, 'S'), c(4, 'S'), c(8, 'S')]], [c(7, 'C'), c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  t.act(0, 'pick', { targetId: 'p1' });
  t.act(0, 'terms', { terms: 'high' });
  t.act(1, 'warCall', { call: 'high' }).act(1, 'warCall', { call: 'high' }).act(1, 'warCall', { call: 'high' });
  const g = t.room.game;
  assert.strictEqual(g.war.winnerId, 'p0');
  assert.strictEqual(g.war.pileWon, 3);
  assert.strictEqual(g.pile.length, 0);
  assert.strictEqual(g.hands.p0.length, 1 + 6 + 3);
  t.cleanup();
});

test('an out-of-cards player can start a war, borrowing from the pile, and pays it back on a win', () => {
  const t = setup(game, 3, { finalBattle: false });
  rig(t, [[c(6, 'H'), c(2, 'C'), c(3, 'C'), c(4, 'C'), c(9, 'C')], [], [c(8, 'D')]],
    [c(14, 'S'), c(13, 'S'), c(12, 'H'), c(11, 'D'), c(5, 'S')]);
  const before = total(t.room.game);
  t.act(1, 'join'); // out players can't join other wars (no war yet anyway)
  t.act(0, 'call', { call: 'higher' }); // 6 on 5: one off
  assert.ok(t.view(1).canChallenge, 'out players may call war');
  t.act(1, 'war');
  t.act(1, 'terms', { terms: 'high' });
  const g = t.room.game;
  assert.deepStrictEqual(g.war.borrowed.p1, { n: 3, from: 'pile' });
  t.act(0, 'warCall', { call: 'high' }).act(0, 'warCall', { call: 'high' }).act(0, 'warCall', { call: 'high' });
  assert.strictEqual(g.war.winnerId, 'p1', 'the big pile cards win');
  assert.strictEqual(g.hands.p1.length, 3, 'won 6, gave 3 back');
  assert.strictEqual(g.war.paidBack, 3);
  assert.strictEqual(total(g), before, 'no cards created or lost');
  t.cleanup();
});

test('out players cannot join a war they did not start', () => {
  const t = setup(game, 3, { finalBattle: false });
  rig(t, [[c(6, 'H'), c(2, 'C'), c(3, 'C'), c(4, 'C')], [], Array(4).fill(c(8, 'D'))], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' });
  t.act(2, 'war');
  assert.ok(!t.view(1).war.canJoin);
  t.act(1, 'join');
  assert.deepStrictEqual(t.room.game.war.challengers, ['p2']);
  t.cleanup();
});

test('when winners take the pile, the biggest stack supplies a short player', () => {
  const t = setup(game, 3, { takePile: true, finalBattle: false });
  rig(t, [[c(5, 'H'), c(2, 'C')], Array(10).fill(c(9, 'S')), [c(3, 'D'), c(4, 'D'), c(6, 'D'), c(7, 'D')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'higher' }); // same number
  t.act(0, 'pick', { targetId: 'p2' });
  t.act(0, 'terms', { terms: 'high' });
  assert.deepStrictEqual(t.room.game.war.borrowed.p0, { n: 2, from: 'p1' });
  assert.strictEqual(t.room.game.hands.p1.length, 8);
  t.cleanup();
});

test('final battle: the last two play a 5-card war, winner takes all', () => {
  const t = setup(game, 3);
  rig(t, [[c(9, 'H')], Array(6).fill(c(10, 'S')), Array(6).fill(c(2, 'D'))], [c(5, 'S')]);
  t.act(0, 'call', { call: 'lower' }); // wrong, and p0 is out
  const g = t.room.game;
  assert.strictEqual(g.phase, 'terms');
  assert.ok(g.war.final);
  assert.strictEqual(g.war.size, 5);
  assert.ok(!t.view(0).war.canJoin);
  t.act(g.war.challengers[0] === 'p1' ? 1 : 2, 'terms', { terms: 'high' });
  const caller = g.war.callerId === 'p1' ? 1 : 2;
  for (let i = 0; i < 5; i++) t.act(caller, 'warCall', { call: 'high' });
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winnerId, 'p1');
  assert.strictEqual(g.hands.p1.length, 14, 'every card: both hands and the pile');
  t.cleanup();
});

test('without the final battle, the last player holding cards wins', () => {
  const t = setup(game, 2, { finalBattle: false });
  rig(t, [[c(9, 'H')], [c(10, 'S')]], [c(5, 'S')]);
  t.act(0, 'call', { call: 'lower' });
  assert.strictEqual(t.room.game.phase, 'over');
  assert.strictEqual(t.room.game.winnerId, 'p1');
  t.cleanup();
});

test('random full games always finish without losing or creating cards', () => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (let n = 0; n < 300; n++) {
    const players = 2 + (n % 4);
    const opts = { decks: 1 + (n % 3), takePile: n % 2 === 0, finalBattle: n % 3 !== 0 };
    const t = setup(game, players, opts);
    const g = t.room.game;
    const cards = 52 * opts.decks;
    let steps = 0;
    while (g.phase !== 'over' && steps++ < 20000) {
      const v = t.view(0);
      if (g.phase === 'call') t.act(Number(g.turnId.slice(1)), 'call', { call: pick(['same', 'different', 'higher', 'lower', 'S', 'H']) });
      else if (g.phase === 'challenge') {
        const others = t.room.players.map((p, i) => i).filter((i) => `p${i}` !== g.lastFlip.by && !g.passed.includes(`p${i}`));
        t.act(pick(others), Math.random() < 0.3 ? 'war' : 'pass');
      } else if (g.phase === 'pick') t.act(Number(g.lastFlip.by.slice(1)), 'pick', { targetId: pick(t.view(0).pickable) });
      else if (g.phase === 'terms') {
        const joiner = t.room.players.findIndex((p) => t.view(t.room.players.indexOf(p)).war.canJoin);
        if (joiner >= 0 && Math.random() < 0.3) t.act(joiner, 'join');
        else t.act(Number(g.war.challengers[0].slice(1)), 'terms', { terms: g.war.challengers.length > 1 ? 'high' : pick(['high', 'color']) });
      } else if (g.phase === 'war') {
        t.act(Number(g.war.callerId.slice(1)), 'warCall', { call: g.war.terms === 'color' ? pick(['same', 'different']) : pick(['high', 'low']) });
      } else if (g.phase === 'warResult') t.act(Number(g.war.winnerId.slice(1)), 'startPile');
      assert.ok(v);
      const inPlay = g.phase === 'war' || g.phase === 'terms' ? Object.values(g.war.cards).flat().filter(Boolean).length : 0;
      assert.strictEqual(Object.values(g.hands).flat().length + g.pile.length + inPlay, cards, `cards conserved (game ${n}, ${g.phase})`);
    }
    assert.strictEqual(g.phase, 'over', `game ${n} finished`);
    t.cleanup();
  }
});

test('a short player who wins the final battle keeps everything', () => {
  const t = setup(game, 3, { takePile: true });
  rig(t, [[c(9, 'H')], [c(14, 'S'), c(14, 'C')], Array(8).fill(c(2, 'D'))], [c(5, 'S')]);
  t.act(0, 'call', { call: 'lower' }); // p0 is out: final battle between p1 (2 cards) and p2
  const g = t.room.game;
  assert.ok(g.war.final);
  assert.strictEqual(g.war.challengers[0], 'p1');
  t.act(1, 'terms', { terms: 'high' });
  assert.strictEqual(g.war.borrowed.p1.n, 3);
  for (let i = 0; i < 5; i++) t.act(2, 'warCall', { call: 'high' });
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winnerId, 'p1');
  assert.strictEqual(g.hands.p1.length, 12, 'all the cards');
  assert.strictEqual(g.hands.p2.length, 0);
  t.cleanup();
});
