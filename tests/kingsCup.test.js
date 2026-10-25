const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/kingsCup');

const c = (rank, suit = 'S') => ({ rank, suit });

// Puts the given cards in the next free spots of the ring, so they're drawn next, in order.
function deal(t, ...cards) {
  const g = t.room.game;
  const free = g.deck.map((_, i) => i).filter((i) => !g.taken.includes(i));
  cards.forEach((card, k) => { g.deck[free[k]] = card; });
}

function drawAs(t, i, card) {
  deal(t, card);
  t.act(i, 'draw');
}

test('the deck is laid in a ring of 52; you draw the card you pick, once', () => {
  const t = setup(game, 2);
  const g = t.room.game;
  assert.strictEqual(t.view(0).ringSize, 52);
  g.deck[17] = c(5); // Guys: nothing to resolve before moving on
  const chosen = g.deck[17];
  t.act(0, 'draw', { slot: 17 });
  assert.deepStrictEqual(g.card, chosen);
  assert.deepStrictEqual(t.view(1).taken, [17]);
  assert.strictEqual(t.view(1).deckLeft, 51);
  t.act(0, 'next');
  t.act(1, 'draw', { slot: 17 }); // already taken: falls back to the first free spot
  assert.deepStrictEqual(g.taken, [17, 0]);
  t.cleanup();
});

test('every rank has a rule', () => {
  for (let r = 2; r <= 14; r++) assert.ok(game.CARDS[r].title, `rank ${r}`);
});

test('turns go round the table; only the drawer can draw or move on', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  assert.strictEqual(g.turnId, 'p0');
  t.act(1, 'draw');
  assert.strictEqual(g.card, null);
  drawAs(t, 0, c(5));
  assert.strictEqual(t.view(1).rule.title, 'Guys');
  t.act(1, 'next');
  assert.strictEqual(g.turnId, 'p0');
  t.act(0, 'next');
  assert.strictEqual(g.turnId, 'p1');
  assert.strictEqual(g.phase, 'draw');
  t.cleanup();
});

test('2 is You: pick someone to drink 2. 3 is Me: drink 3', () => {
  const t = setup(game, 3);
  drawAs(t, 0, c(2));
  t.act(0, 'next'); // must pick first
  assert.strictEqual(t.room.game.turnId, 'p0');
  t.act(0, 'pick', { targetId: 'p2' });
  assert.deepStrictEqual(t.drinks(), [0, 0, 2]);
  t.act(0, 'next');
  drawAs(t, 1, c(3));
  assert.deepStrictEqual(t.drinks(), [0, 3, 2]);
  t.cleanup();
});

test('mates drink together', () => {
  const t = setup(game, 3);
  drawAs(t, 0, c(8));
  t.act(0, 'mate', { targetId: 'p1' });
  assert.deepStrictEqual(t.room.game.mates, [['p0', 'p1']]);
  t.act(0, 'next');
  drawAs(t, 1, c(3)); // p1 drinks 3, so their mate p0 does too
  assert.deepStrictEqual(t.drinks(), [3, 3, 0]);
  t.act(1, 'next');
  drawAs(t, 2, c(2));
  t.act(2, 'pick', { targetId: 'p0' });
  assert.deepStrictEqual(t.drinks(), [5, 5, 0]);
  t.cleanup();
});

test('picking the same mate twice makes one pair', () => {
  const t = setup(game, 2);
  drawAs(t, 0, c(8));
  t.act(0, 'mate', { targetId: 'p1' }).act(0, 'next');
  drawAs(t, 1, c(8));
  t.act(1, 'mate', { targetId: 'p0' });
  assert.deepStrictEqual(t.room.game.mates, [['p0', 'p1']]);
  t.cleanup();
});

test('a giver does not drink when picking their own mate', () => {
  const t = setup(game, 2);
  drawAs(t, 0, c(8));
  t.act(0, 'mate', { targetId: 'p1' });
  t.act(0, 'next');
  t.act(1, 'next');
  drawAs(t, 1, c(2));
  t.act(1, 'pick', { targetId: 'p0' });
  assert.deepStrictEqual(t.drinks(), [2, 0]);
  t.cleanup();
});

test('Floor and Heaven: the last to tap drinks', () => {
  const t = setup(game, 4);
  drawAs(t, 0, c(7));
  assert.strictEqual(t.room.game.phase, 'race');
  t.act(2, 'tap').act(0, 'tap').act(0, 'tap');
  assert.strictEqual(t.room.game.phase, 'race');
  t.act(3, 'tap');
  assert.strictEqual(t.room.game.phase, 'card');
  assert.deepStrictEqual(t.room.game.race.losers, ['p1']);
  assert.deepStrictEqual(t.drinks(), [0, 2, 0, 0]);
  t.cleanup();
});

test('a race that times out: everyone who never tapped drinks', () => {
  const t = setup(game, 4);
  drawAs(t, 0, c(4));
  t.act(1, 'tap');
  t.fireTimer();
  assert.deepStrictEqual(t.drinks(), [2, 0, 2, 2]);
  t.cleanup();
});

test('without reactions, the drawer names who was last', () => {
  const t = setup(game, 3, { reactions: false });
  drawAs(t, 0, c(7));
  assert.strictEqual(t.room.game.phase, 'card');
  t.act(0, 'pick', { targetId: 'p1' });
  assert.deepStrictEqual(t.drinks(), [0, 2, 0]);
  t.cleanup();
});

test('Jack makes a rule everyone sees; Queen makes a question master', () => {
  const t = setup(game, 3);
  drawAs(t, 0, c(11));
  t.act(0, 'rule', { text: '   ' });
  assert.strictEqual(t.room.game.rules.length, 0);
  t.act(0, 'rule', { text: 'No   pointing' });
  assert.deepStrictEqual(t.view(2).rules, [{ by: 'p0', text: 'No pointing' }]);
  t.act(0, 'next');
  drawAs(t, 1, c(12));
  assert.strictEqual(t.view(0).qm, 'p1');
  t.cleanup();
});

test('9 and 10 come with a rhyme word or a category', () => {
  const t = setup(game, 2);
  drawAs(t, 0, c(9));
  assert.ok(t.view(0).prompt);
  t.act(0, 'next');
  drawAs(t, 1, c(10));
  assert.ok(t.view(0).prompt);
  t.cleanup();
});

test('the fourth king drinks the cup and ends the game', () => {
  const t = setup(game, 2);
  for (let k = 1; k <= 3; k++) {
    drawAs(t, (k - 1) % 2, c(13));
    assert.strictEqual(t.room.game.kings, k);
    t.act((k - 1) % 2, 'next');
  }
  drawAs(t, 1, c(13));
  assert.strictEqual(t.room.game.phase, 'over');
  assert.strictEqual(t.room.game.loserId, 'p1');
  assert.ok(t.events.some((e) => e.playerId === 'p1' && e.data.title === 'FINISH YOUR DRINK'));
  t.cleanup();
});

test('a full random game always ends on the fourth king', () => {
  for (let n = 0; n < 200; n++) {
    const players = 2 + (n % 6);
    const t = setup(game, players, { reactions: n % 2 === 0 });
    const g = t.room.game;
    let steps = 0;
    while (g.phase !== 'over' && steps++ < 2000) {
      const turn = Number(g.turnId.slice(1));
      const other = `p${(turn + 1) % players}`;
      if (g.phase === 'draw') t.act(turn, 'draw');
      else if (g.phase === 'race') t.act(Math.floor(Math.random() * players), 'tap');
      else if (!g.resolved) {
        const kind = game.CARDS[g.card.rank].kind;
        if (kind === 'mate') t.act(turn, 'mate', { targetId: other });
        else if (kind === 'rule') t.act(turn, 'rule', { text: 'Drink with your left hand' });
        else t.act(turn, 'pick', { targetId: other });
      } else t.act(turn, 'next');
    }
    assert.strictEqual(g.phase, 'over', `game ${n} ended`);
    assert.strictEqual(g.kings, 4);
    t.cleanup();
  }
});

test('break the circle: a card next to a gap means finish your drink', () => {
  const t = setup(game, 2);
  const g = t.room.game;
  const finished = (id) => t.events.filter((e) => e.playerId === id && e.data.title === 'FINISH YOUR DRINK').length;
  for (const slot of [10, 30, 11]) g.deck[slot] = c(5); // Guys: no choices to make
  t.act(0, 'draw', { slot: 10 }); // the first card can't break anything
  assert.strictEqual(t.view(0).broke, false);
  t.act(0, 'next');
  t.act(1, 'draw', { slot: 30 }); // nowhere near the gap
  assert.strictEqual(finished('p1'), 0);
  t.act(1, 'next');
  t.act(0, 'draw', { slot: 11 }); // right next to slot 10's gap
  assert.strictEqual(t.view(1).broke, true);
  assert.strictEqual(finished('p0'), 1);
  t.cleanup();
});

test('break the circle can be switched off; spots wrap round the ring', () => {
  const t = setup(game, 2, { circle: false });
  t.act(0, 'draw', { slot: 0 }).act(0, 'next');
  assert.strictEqual(t.room.game.broke, false);
  t.cleanup();
  const u = setup(game, 2);
  u.room.game.deck[0] = c(5);
  u.room.game.deck[51] = c(5);
  u.act(0, 'draw', { slot: 0 }).act(0, 'next');
  u.act(1, 'draw', { slot: 51 }); // 51 sits next to 0 in the ring
  assert.strictEqual(u.room.game.broke, true);
  u.cleanup();
});

test('bots draw away from the gaps, hand sips to humans, make rules and race', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  t.player(0).bot = 'booler';
  t.player(2).bot = 'npv';
  assert.strictEqual(t.bot(1), null, 'not its turn');
  g.taken = [5];
  const draw = t.bot(0, 1);
  assert.strictEqual(draw.type, 'draw');
  assert.ok(![4, 5, 6].includes(draw.slot), 'a good bot keeps the circle whole');
  drawAs(t, 0, c(2));
  assert.deepStrictEqual(t.bot(0, 0.9), { type: 'pick', targetId: 'p1' }, 'the human drinks, not the other bot');
  t.act(0, 'pick', { targetId: 'p1' });
  assert.deepStrictEqual(t.bot(0), { type: 'next' });
  t.act(0, 'next');
  drawAs(t, 1, c(5));
  t.act(1, 'next');
  drawAs(t, 2, c(11));
  const rule = t.bot(2, 0.25);
  assert.strictEqual(rule.type, 'rule');
  t.act(2, 'rule', { text: rule.text });
  assert.strictEqual(g.rules.length, 1);
  t.act(2, 'next');
  drawAs(t, 0, c(7));
  const quick = t.bot(0, 0.9);
  const slow = t.bot(2, 0.25);
  assert.strictEqual(quick.type, 'tap');
  assert.ok(quick.delay < slow.delay && slow.delay < 10000, 'a good bot taps first, a bad one still beats the clock');
  t.cleanup();
});
