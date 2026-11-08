const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/jeopardy');
const { CATEGORIES, VENUES, venueOf } = require('../lib/jeopardyQuestions');
const ROOM_STYLES = require('../lib/roomStyles');

// A game past the vote, on the board, with p0 picking and no Daily Double unless asked for.
function ready(players = 3, options = {}, { dd = false } = {}) {
  const t = setup(game, players, options);
  for (let i = 0; i < players; i++) t.act(i, 'lockIn', { picks: '0,1,2,3,4' });
  assert.strictEqual(t.room.game.phase, 'voted');
  t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'board');
  const g = t.room.game;
  for (const c of g.cats) for (const x of c.clues) x.dd = false;
  if (dd) g.cats[0].clues[2].dd = true;
  g.pickerId = 'p0';
  return t;
}
const clue = (t) => t.room.game.clue;
const rightI = (t) => clue(t).answer;
const wrongI = (t, n = 0) => [0, 1, 2, 3].filter((i) => i !== clue(t).answer)[n];
// Picks a clue and gets through the read beat to open buzzers.
function open(t, c = 0, r = 0, by = 0) {
  t.act(by, 'pick', { c, r });
  assert.strictEqual(t.room.game.stage, 'read');
  t.act(1, 'buzz'); // too early: nothing
  assert.strictEqual(t.room.game.buzzerId, null);
  t.fireTimer();
  assert.strictEqual(t.room.game.stage, 'open');
  return t;
}

test('the vote: up to four picks each, lock in, the top four make the board, then the house category', () => {
  const t = setup(game, 3);
  t.room.style = 'pirate'; // (the venue is read when the game starts)
  t.room.game = { type: 'jeopardy' };
  t.ctx.clearTimer(t.room);
  game.start(t.room, t.ctx, {});
  const g = t.room.game;
  assert.strictEqual(g.phase, 'vote');
  assert.strictEqual(t.view(0).vote.pool.length, 10);
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0', 'p1', 'p2']);
  const house = t.view(0).vote.house;
  assert.ok(VENUES.pirate.categories.some((c) => c.name === house.name), 'a pirate category');
  assert.strictEqual(house.emoji, VENUES.pirate.emoji);
  const pooled = t.view(0).vote.pool;
  assert.ok(!Object.values(VENUES).some((v) => v.categories.some((c) => pooled.includes(c.name))), 'no venue categories in the vote');
  for (const i of [0, 1, 2, 3, 4]) t.act(0, 'toggle', { i: String(i) });
  assert.deepStrictEqual(g.votes.p0, [0, 1, 2, 3], 'no more than four');
  t.act(0, 'toggle', { i: 3 });
  assert.deepStrictEqual(g.votes.p0, [0, 1, 2]);
  t.act(0, 'toggle', { i: 9 });
  t.act(0, 'lockIn');
  t.act(0, 'toggle', { i: 0 });
  assert.deepStrictEqual(g.votes.p0, [0, 1, 2, 9], 'locked in: no more changes');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p1', 'p2']);
  assert.deepStrictEqual(t.view(1).vote.counts, [1, 1, 1, 0, 0, 0, 0, 0, 0, 1]);
  t.act(1, 'lockIn', { picks: '9,8,7' });
  t.act(2, 'lockIn', { picks: [9, 8, 0] });
  assert.strictEqual(g.phase, 'voted');
  // 9 has 3 votes, 0 and 8 two, then 1, 2, 7 one each: one of those three, at random.
  assert.strictEqual(g.chosen.length, 4);
  assert.deepStrictEqual(g.chosen.slice(0, 3).sort(), [0, 8, 9].sort());
  assert.ok([1, 2, 7].includes(g.chosen[3]));
  assert.deepStrictEqual(g.cats.map((c) => c.name), [...g.chosen.map((i) => CATEGORIES[g.pool[i]].name), house.name]);
  assert.strictEqual(t.view(0).board[4].emoji, VENUES.pirate.emoji, 'the house column wears the venue\'s emoji');
  assert.ok(t.view(0).board.slice(0, 4).every((c) => !c.emoji));
  const finalFrom = g.pool.filter((_, i) => !g.chosen.includes(i)).map((i) => CATEGORIES[i].name);
  assert.ok(finalFrom.includes(g.finalClue.cat), 'the Final comes from the categories that weren\'t chosen');
  assert.strictEqual(g.cats.reduce((n, c) => n + c.clues.filter((x) => x.dd).length, 0), 1, 'one Daily Double');
  assert.ok(g.cats.every((c) => !c.clues[0].dd), 'never a $200');
  assert.deepStrictEqual(game.waitingOn(t.room), []);
  t.fireTimer();
  assert.strictEqual(g.phase, 'board');
  assert.deepStrictEqual(game.waitingOn(t.room), [g.pickerId]);
  t.cleanup();
});

test('the vote closes when time is up, with whatever was ticked', () => {
  const t = setup(game, 3);
  t.act(0, 'toggle', { i: 3 });
  t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'voted');
  assert.strictEqual(t.room.game.chosen[0], 3);
  assert.strictEqual(t.room.game.cats.length, 5);
  t.cleanup();
});

test('pick, buzz, right: +$ and they pick next; others see who buzzed', () => {
  const t = ready();
  t.act(1, 'pick', { c: 0, r: 0 });
  assert.strictEqual(t.room.game.phase, 'board', 'only the picker picks');
  open(t, 0, 2);
  assert.deepStrictEqual(game.waitingOn(t.room), [], 'the buzzers are open to anyone');
  assert.strictEqual(t.view(1).clue.options, null, 'no options before someone buzzes');
  t.act(1, 'buzz');
  t.act(2, 'buzz');
  assert.strictEqual(t.room.game.buzzerId, 'p1', 'first in wins');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p1']);
  assert.strictEqual(t.view(2).clue.options.length, 4);
  assert.strictEqual(t.view(2).clue.answer, null, 'no peeking');
  t.act(2, 'answer', { i: rightI(t) });
  assert.strictEqual(t.room.game.stage, 'answer', 'only the buzzer answers');
  t.act(1, 'answer', { i: String(rightI(t)) });
  const g = t.room.game;
  assert.strictEqual(g.phase, 'reveal');
  assert.strictEqual(g.scores.p1, 600);
  assert.strictEqual(g.pickerId, 'p1');
  assert.strictEqual(t.view(0).clue.answer, rightI(t));
  assert.deepStrictEqual(t.drinks(), [0, 0, 0]);
  t.fireTimer();
  assert.strictEqual(g.phase, 'board');
  assert.ok(g.cats[0].clues[2].used);
  t.act(1, 'pick', { c: 0, r: 2 });
  assert.strictEqual(g.phase, 'board', 'a used clue can\'t be picked again');
  t.act(1, 'pick', { c: 1, r: 0 });
  assert.strictEqual(g.phase, 'clue');
  t.cleanup();
});

test('wrong: −$, sips on the tab Shot Poker style, locked out, buzzers open again; the tab holds up the next pick', () => {
  const t = ready(3, { perShot: 3 });
  open(t, 0, 3); // $800: 4 sips, more than a 3-sip shot
  t.act(1, 'buzz');
  t.act(1, 'answer', { i: wrongI(t) });
  const g = t.room.game;
  assert.strictEqual(g.scores.p1, -800);
  assert.deepStrictEqual(t.drinks(), [0, 4, 0]);
  assert.deepStrictEqual(g.debts.p1, { sips: 4, text: '1 shot + 1 sip', paid: false });
  const alert = t.events.find((e) => e.playerId === 'p1' && e.event === 'drink');
  assert.strictEqual(alert.data.title, 'TAKE 1 SHOT + 1 SIP');
  assert.strictEqual(g.stage, 'open', 'the others can buzz again');
  assert.deepStrictEqual(t.view(0).clue.wrong, [wrongI(t)]);
  t.act(1, 'buzz');
  assert.strictEqual(g.buzzerId, null, 'locked out');
  t.act(2, 'buzz');
  t.act(2, 'answer', { i: wrongI(t) });
  assert.strictEqual(g.stage, 'answer', 'a crossed-out option can\'t be picked again');
  t.act(2, 'answer', { i: wrongI(t, 1) });
  assert.strictEqual(g.scores.p2, -800);
  t.act(0, 'buzz');
  t.act(0, 'answer', { i: rightI(t) });
  assert.strictEqual(g.scores.p0, 800);
  t.fireTimer();
  assert.strictEqual(g.phase, 'board');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p1', 'p2'], 'the tabs first');
  t.act(0, 'pick', { c: 1, r: 1 });
  assert.strictEqual(g.phase, 'board', 'no pick while anyone owes');
  t.act(1, 'paid');
  t.act(2, 'paid');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0']);
  t.act(0, 'pick', { c: 1, r: 1 });
  assert.strictEqual(g.phase, 'clue');
  assert.deepStrictEqual(g.debts, {});
  t.cleanup();
});

test('the tab is capped at the max shots', () => {
  const t = ready(2, { perShot: 3, maxShots: 1 });
  open(t, 0, 4); // $1000: 5 sips, but the cap is 3
  t.act(1, 'buzz');
  t.act(1, 'answer', { i: wrongI(t) });
  assert.deepStrictEqual(t.drinks(), [0, 3]);
  assert.strictEqual(t.room.game.debts.p1.text, '1 shot');
  t.cleanup();
});

test('out of time: counts as wrong; everyone locked out: the answer, same picker', () => {
  const t = ready(2);
  open(t, 0, 0);
  t.act(1, 'buzz');
  t.fireTimer(); // too slow
  const g = t.room.game;
  assert.strictEqual(g.scores.p1, -200);
  assert.deepStrictEqual(t.drinks(), [0, 1]);
  assert.strictEqual(g.stage, 'open');
  t.act(0, 'buzz');
  t.act(0, 'answer', { i: wrongI(t) });
  assert.strictEqual(g.phase, 'reveal', 'nobody left to buzz');
  assert.strictEqual(g.pickerId, 'p0');
  t.cleanup();
});

test('nobody buzzes: the answer is shown, nobody pays, same picker', () => {
  const t = ready(3);
  open(t, 2, 1);
  t.fireTimer();
  const g = t.room.game;
  assert.strictEqual(g.phase, 'reveal');
  assert.deepStrictEqual(t.drinks(), [0, 0, 0]);
  assert.deepStrictEqual(Object.values(g.scores), [0, 0, 0]);
  assert.strictEqual(t.view(1).clue.answer, rightI(t));
  t.fireTimer();
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0']);
  t.cleanup();
});

test('Daily Double, right: only the picker plays, +wager × $200, and they hand the wager out', () => {
  const t = ready(3, {}, { dd: true });
  t.act(0, 'pick', { c: 0, r: 2 });
  const g = t.room.game;
  assert.strictEqual(g.phase, 'ddWager');
  assert.strictEqual(t.view(1).clue.q, null, 'the clue stays hidden until the wager is in');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0']);
  t.act(0, 'wager', { sips: 11 });
  assert.strictEqual(g.phase, 'ddWager', 'no more than the cap (10)');
  t.act(0, 'wager', { sips: '4' });
  assert.strictEqual(g.phase, 'clue');
  t.fireTimer();
  assert.strictEqual(g.stage, 'answer');
  assert.strictEqual(g.buzzerId, 'p0');
  t.act(1, 'buzz');
  assert.strictEqual(g.buzzerId, 'p0', 'nobody else buzzes');
  t.act(0, 'answer', { i: rightI(t) });
  assert.strictEqual(g.scores.p0, 800);
  assert.deepStrictEqual(g.give, { from: 'p0', sips: 4 });
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0']);
  t.act(0, 'give', { alloc: JSON.stringify({ p1: 3, p2: 1 }) });
  assert.deepStrictEqual(t.drinks(), [0, 3, 1]);
  assert.strictEqual(g.phase, 'board');
  assert.deepStrictEqual(g.debts, {}, 'handed out, not owed');
  t.cleanup();
});

test('Daily Double, wrong: −wager × $200 and the wager goes on the tab; a quiet winner\'s sips go out at random', () => {
  const t = ready(3, {}, { dd: true });
  t.act(0, 'pick', { c: 0, r: 2 });
  t.act(0, 'wager', { sips: 7 });
  t.fireTimer();
  t.act(0, 'answer', { i: wrongI(t) });
  const g = t.room.game;
  assert.strictEqual(g.phase, 'reveal');
  assert.strictEqual(g.scores.p0, -1400);
  assert.deepStrictEqual(g.debts.p0, { sips: 7, text: '1 shot + 2 sips', paid: false });
  assert.deepStrictEqual(t.drinks(), [7, 0, 0]);

  const u = ready(3, {}, { dd: true });
  u.act(0, 'pick', { c: 0, r: 2 });
  u.act(0, 'wager', { sips: 2 });
  u.fireTimer();
  u.act(0, 'answer', { i: u.room.game.clue.answer });
  u.fireTimer(); // the give clock
  assert.deepStrictEqual(u.drinks().reduce((a, b) => a + b, 0), 2);
  assert.strictEqual(u.room.game.phase, 'board');
  t.cleanup();
  u.cleanup();
});

// Plays out every clue on the board with nobody buzzing.
function clearBoard(t) {
  const g = t.room.game;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) {
    if (g.cats[c].clues[r].used) continue;
    t.act(0, 'pick', { c, r });
    t.fireTimer(); // read
    t.fireTimer(); // nobody buzzes
    t.fireTimer(); // reveal
  }
}

test('Final: wagers, then the clue; the top score drinks nothing; the wrong ones owe their wager', () => {
  const t = ready(4);
  const g = t.room.game;
  clearBoard(t);
  assert.strictEqual(g.phase, 'finalWager');
  assert.strictEqual(t.view(0).finalRound.q, null, 'only the category before the wagers');
  g.scores = { p0: 1000, p1: 600, p2: 0, p3: 200 };
  t.act(0, 'finalWager', { sips: 2 });
  t.act(1, 'finalWager', { sips: 3 });
  t.act(2, 'finalWager', { sips: 1 });
  assert.deepStrictEqual(game.waitingOn(t.room), ['p3']);
  assert.strictEqual(t.view(1).finalRound.myWager, 3);
  assert.strictEqual(t.view(0).finalRound.myWager, 2);
  t.act(3, 'finalWager', { sips: 5 });
  assert.strictEqual(g.phase, 'finalAnswer');
  const a = g.finalClue.answer;
  const w = [0, 1, 2, 3].find((i) => i !== a);
  t.act(0, 'finalAnswer', { i: w }); // the leader is wrong: 1000 − 400 = 600
  t.act(1, 'finalAnswer', { i: a }); // 600 + 600 = 1200: the new leader
  t.act(2, 'finalAnswer', { i: w });
  assert.deepStrictEqual(game.waitingOn(t.room), ['p3']);
  t.fireTimer(); // p3 never answers: wrong
  assert.strictEqual(g.phase, 'over');
  assert.deepStrictEqual(g.scores, { p0: 600, p1: 1200, p2: -200, p3: -800 });
  assert.deepStrictEqual(g.winners, ['p1']);
  assert.deepStrictEqual(t.drinks(), [2, 0, 1, 5]);
  assert.strictEqual(g.debts.p3.text, '1 shot');
  assert.deepStrictEqual(game.waitingOn(t.room), []);
  assert.strictEqual(t.view(2).finalRound.answer, a);
  t.act(3, 'paid');
  assert.strictEqual(g.debts.p3.paid, true);
  t.cleanup();
});

test('Final: the leader drinks nothing even if wrong; no Final: straight to the end', () => {
  const t = ready(2);
  const g = t.room.game;
  clearBoard(t);
  g.scores = { p0: 5000, p1: 0 };
  t.act(0, 'finalWager', { sips: 3 });
  t.act(1, 'finalWager', { sips: 3 });
  const w = [0, 1, 2, 3].find((i) => i !== g.finalClue.answer);
  t.act(0, 'finalAnswer', { i: w });
  t.act(1, 'finalAnswer', { i: w });
  assert.deepStrictEqual(t.drinks(), [0, 3]);
  assert.deepStrictEqual(g.winners, ['p0']);

  const u = ready(2, { final: false });
  clearBoard(u);
  assert.strictEqual(u.room.game.phase, 'over');
  t.cleanup();
  u.cleanup();
});

test('a tab still owed holds up the Final', () => {
  const t = ready(2);
  const g = t.room.game;
  clearBoard(t);
  // (Back to the last clue, missed.)
  g.phase = 'board';
  g.cats[4].clues[4].used = false;
  t.act(0, 'pick', { c: 4, r: 4 });
  t.fireTimer();
  t.act(1, 'buzz');
  t.act(1, 'answer', { i: wrongI(t) });
  t.act(0, 'buzz');
  t.act(0, 'answer', { i: wrongI(t, 1) });
  t.fireTimer();
  assert.strictEqual(g.phase, 'board');
  assert.deepStrictEqual(game.waitingOn(t.room).sort(), ['p0', 'p1']);
  t.act(0, 'paid');
  assert.strictEqual(g.phase, 'board');
  t.act(1, 'paid');
  assert.strictEqual(g.phase, 'finalWager');
  t.cleanup();
});

test('a buzzer who leaves mid-answer: out of the clue, no drink, no $; a picker who leaves is replaced', () => {
  const t = ready(3);
  open(t, 0, 1);
  t.act(1, 'buzz');
  t.disconnect(1);
  const g = t.room.game;
  assert.strictEqual(g.stage, 'open');
  assert.deepStrictEqual(t.drinks(), [0, 0, 0]);
  assert.strictEqual(g.scores.p1, 0);
  assert.ok(g.locked.includes('p1'));
  t.act(2, 'buzz');
  t.act(2, 'answer', { i: rightI(t) });
  t.fireTimer();
  assert.strictEqual(g.pickerId, 'p2');
  t.disconnect(2);
  assert.strictEqual(g.pickerId, 'p0');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0']);
  t.cleanup();
});

test('late joiners play from $0', () => {
  const t = ready(2);
  const p = { id: 'p9', name: 'Late', drinks: 0, connected: true };
  t.room.players.push(p);
  game.onJoin(t.room, p, t.ctx);
  assert.strictEqual(t.room.game.scores.p9, 0);
  open(t, 0, 0);
  game.handle(t.room, p, { type: 'buzz' }, t.ctx);
  assert.strictEqual(t.room.game.buzzerId, 'p9');
  t.cleanup();
});

test('pass and play: no clocks on the vote or the Final', () => {
  const { createContext } = require('../lib/context');
  const room = { code: 'X', hostId: 'p0', players: [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, drinks: 0, connected: true })), feed: [], game: { type: 'jeopardy' } };
  const ctx = createContext({ emit: () => {}, broadcast: () => {}, giveMs: 0 });
  game.start(room, ctx, {});
  assert.ok(!room.timer);
  assert.deepStrictEqual(game.waitingOn(room), ['p0', 'p1']);
});

test('a room doesn\'t get the same categories again until it has seen the rest', () => {
  const t = setup(game, 2);
  const first = t.room.game.pool.slice();
  t.fireTimer();
  const seen = t.room.jeopardySeen.slice();
  assert.strictEqual(seen.length, 6, 'the board and the Final');
  t.room.game = { type: 'jeopardy' };
  game.start(t.room, t.ctx, {});
  const names = t.room.game.pool.map((i) => CATEGORIES[i].name);
  assert.ok(names.every((n) => !seen.includes(n)), 'fresh ones first');
  assert.ok(first.length === 10);
  t.cleanup();
});

test('the question bank: 40+ categories of five, each with three distinct wrong answers', () => {
  assert.ok(CATEGORIES.length >= 40, `${CATEGORIES.length} categories`);
  const qs = new Set();
  const names = new Set();
  const venueCats = Object.values(VENUES).flatMap((v) => v.categories);
  assert.ok(venueCats.length >= Object.keys(VENUES).length);
  for (const c of [...CATEGORIES, ...venueCats]) {
    assert.ok(c.name && !names.has(c.name), `category name ${c.name}`);
    names.add(c.name);
    assert.strictEqual(c.clues.length, 5, c.name);
    for (const x of c.clues) {
      assert.ok(typeof x.q === 'string' && x.q.length > 5, `${c.name}: question`);
      assert.ok(typeof x.a === 'string' && x.a, `${c.name}: answer`);
      assert.strictEqual(x.wrong.length, 3, `${x.q}: three wrong answers`);
      const all = [x.a, ...x.wrong].map((s) => s.toLowerCase());
      assert.strictEqual(new Set(all).size, 4, `${x.q}: four different options`);
      assert.ok(!qs.has(x.q), `duplicate question: ${x.q}`);
      qs.add(x.q);
    }
  }
});

test('every venue has a house category; looks within a room use the room\'s; anything else is bar trivia', () => {
  for (const id of ROOM_STYLES.IDS) {
    const room = ROOM_STYLES.roomOf(id);
    assert.ok(VENUES[room], `${id} (room ${room}) has a house category`);
    // (A room's style is always the room itself: server.js and the pass-and-play page keep the
    // look, a weather or an easter egg, apart from it.)
    assert.strictEqual(venueOf(room), room, `${id} resolves to ${room}`);
    if (id.startsWith(room)) assert.strictEqual(venueOf(id), room, `${id} itself resolves to ${room}`);
    if (room !== 'classic') assert.strictEqual(VENUES[room].emoji, ROOM_STYLES.STYLES[room].emoji, `${room}: its emoji`);
  }
  for (const v of Object.keys(VENUES)) assert.ok(ROOM_STYLES.STYLES[v], `${v} is a room`);
  assert.strictEqual(venueOf(undefined), 'classic');
  assert.strictEqual(venueOf('nowhere'), 'classic');
  assert.strictEqual(VENUES.classic.categories[0].name, 'Bar Trivia');
  // A room with no style gets bar trivia; two categories a venue, so it varies.
  const t = setup(game, 2);
  assert.ok(VENUES.classic.categories.some((c) => c.name === t.view(0).vote.house.name));
  t.cleanup();
  const names = new Set();
  for (let i = 0; i < 40; i++) {
    const u = setup(game, 2);
    u.room.style = 'castle';
    u.room.game = { type: 'jeopardy' };
    u.ctx.clearTimer(u.room);
    game.start(u.room, u.ctx, {});
    names.add(u.view(0).vote.house.name);
    u.cleanup();
  }
  assert.strictEqual(names.size, VENUES.castle.categories.length);
});
