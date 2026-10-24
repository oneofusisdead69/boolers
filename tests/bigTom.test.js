const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/bigTom');
const { NORMAL, NSFW } = require('../lib/bigTomQuestions');

// Everyone sends a question; returns the matchups.
function writeAll(t, n) {
  for (let i = 0; i < n; i++) t.act(i, 'question', { text: `Question from ${i}?` });
  return t.room.game.matchups;
}
// Everyone answers their questions with "<name> answer".
function answerAll(t, n) {
  for (let i = 0; i < n; i++) for (const task of t.view(i).myTasks) t.act(i, 'answer', { m: task.m, text: `answer by ${i}` });
}
const idx = (id) => Number(id.slice(1));

test('100+ questions in each list', () => {
  assert.ok(NORMAL.length >= 100 && NSFW.length >= 100);
});

test('Generate suggests from the chosen list, plus your own questions', () => {
  const t = setup(game, 3, { questions: 'nsfw', custom: { questions: ['My own question'] } });
  t.act(0, 'generate');
  const q = t.view(0).suggestion;
  assert.ok(NSFW.includes(q) || q === 'My own question');
  assert.strictEqual(t.view(1).suggestion, null, 'suggestions are private');
  assert.strictEqual(t.room.game.pool.length, NSFW.length + 1);
  t.cleanup();
});

test('each question goes to two other players; everyone answers two', () => {
  const t = setup(game, 5);
  const ms = writeAll(t, 5);
  assert.strictEqual(t.room.game.phase, 'answer');
  assert.strictEqual(ms.length, 5);
  const load = {};
  for (const m of ms) {
    assert.notStrictEqual(m.a, m.b);
    const author = `p${m.question.match(/from (\d)/)[1]}`;
    assert.ok(m.a !== author && m.b !== author, 'nobody answers their own question');
    load[m.a] = (load[m.a] || 0) + 1;
    load[m.b] = (load[m.b] || 0) + 1;
  }
  assert.deepStrictEqual(Object.values(load), [2, 2, 2, 2, 2]);
  assert.strictEqual(t.view(0).myTasks.length, 2);
  t.cleanup();
});

test('vote, reveal: loser drinks, winner hands out the same', () => {
  const t = setup(game, 4, { sips: 3 });
  writeAll(t, 4);
  answerAll(t, 4);
  const g = t.room.game;
  assert.strictEqual(g.phase, 'vote');
  const m = g.matchups[0];
  const v = t.view(idx(m.a)).matchup;
  assert.strictEqual(v.players, null, 'answers are anonymous until the reveal');
  assert.strictEqual(v.canVote, false, 'answerers do not vote');
  const voters = [0, 1, 2, 3].filter((i) => `p${i}` !== m.a && `p${i}` !== m.b);
  for (const i of voters) t.act(i, 'vote', { side: 'a' });
  assert.strictEqual(g.phase, 'reveal');
  assert.deepStrictEqual(t.view(0).matchup.result, { a: 2, b: 0, winner: m.a });
  const drinks = t.drinks();
  assert.strictEqual(drinks[idx(m.b)], 3);
  t.act(idx(m.a), 'give', { targetId: m.a }); // not yourself
  t.act(idx(m.a), 'give', { targetId: 'p' + voters[0] });
  assert.strictEqual(t.drinks()[voters[0]], drinks[voters[0]] + 3);
  assert.strictEqual(g.give, null);
  assert.strictEqual(g.wins[m.a], 1);
  t.act(0, 'next');
  assert.strictEqual(g.current, 1);
  assert.strictEqual(g.phase, 'vote');
  t.cleanup();
});

test('a tie makes both drink; a missing answer loses without a vote', () => {
  const t = setup(game, 4, { sips: 2 });
  writeAll(t, 4);
  const g = t.room.game;
  // Everyone answers except the first answerer of matchup 1.
  const skip = g.matchups[1].a;
  for (let i = 0; i < 4; i++) {
    for (const task of t.view(i).myTasks) if (!(`p${i}` === skip && task.m === 1)) t.act(i, 'answer', { m: task.m, text: 'x' });
  }
  t.act(0, 'moveOn'); // host starts voting
  const m0 = g.matchups[0];
  const [v1, v2] = [0, 1, 2, 3].filter((i) => `p${i}` !== m0.a && `p${i}` !== m0.b);
  const before = t.drinks();
  t.act(v1, 'vote', { side: 'a' }).act(v2, 'vote', { side: 'b' });
  assert.strictEqual(g.matchups[0].result.winner, null);
  assert.strictEqual(t.drinks()[idx(m0.a)], before[idx(m0.a)] + 2);
  assert.strictEqual(t.drinks()[idx(m0.b)], before[idx(m0.b)] + 2);
  t.act(0, 'next');
  assert.strictEqual(g.phase, 'reveal', 'matchup 1 is decided straight away');
  assert.strictEqual(g.matchups[1].result.winner, g.matchups[1].b);
  t.cleanup();
});

test('the host can start answering early; Big Tom writes the missing questions', () => {
  const t = setup(game, 3);
  t.act(0, 'question', { text: 'Mine?' });
  t.act(1, 'moveOn'); // not the host
  assert.strictEqual(t.room.game.phase, 'write');
  t.act(0, 'moveOn');
  const g = t.room.game;
  assert.strictEqual(g.phase, 'answer');
  assert.strictEqual(g.matchups.filter((m) => m.author === game.BIG_TOM).length, 2);
  t.cleanup();
});

test('rounds end with a summary, then a new round', () => {
  const t = setup(game, 3);
  writeAll(t, 3);
  answerAll(t, 3);
  const g = t.room.game;
  for (let k = 0; k < 3; k++) {
    const m = g.matchups[k];
    const voter = [0, 1, 2].find((i) => `p${i}` !== m.a && `p${i}` !== m.b);
    t.act(voter, 'vote', { side: 'b' });
    t.act(0, 'next');
  }
  assert.strictEqual(g.phase, 'summary');
  assert.strictEqual(t.view(0).results.length, 3);
  t.act(0, 'nextRound');
  assert.strictEqual(g.phase, 'write');
  assert.strictEqual(g.round, 2);
  t.cleanup();
});
