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

// Plays a whole round: questions, answers, and a vote for side b in every matchup.
function playRound(t, n) {
  writeAll(t, n);
  answerAll(t, n);
  const g = t.room.game;
  for (let k = 0; k < g.matchups.length; k++) {
    const m = g.matchups[k];
    for (let i = 0; i < n; i++) if (`p${i}` !== m.a && `p${i}` !== m.b) t.act(i, 'vote', { side: 'b' });
    t.act(0, 'next');
  }
}
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('three rounds, then a final round answered by drawing', () => {
  const t = setup(game, 3);
  const g = t.room.game;
  playRound(t, 3);
  assert.strictEqual(g.phase, 'summary');
  assert.strictEqual(t.view(0).results.length, 3);
  t.act(0, 'nextRound');
  assert.strictEqual(g.round, 2);
  playRound(t, 3);
  t.act(0, 'nextRound');
  playRound(t, 3);
  assert.strictEqual(g.round, game.ROUNDS);
  t.act(0, 'nextRound');
  assert.strictEqual(g.phase, 'draw');
  assert.ok(require('../lib/bigTomQuestions').DRAW_NORMAL.includes(t.view(1).finalQuestion), 'the final asks for a drawing');
  t.cleanup();
});

test('final: drawings are checked, voted on anonymously; fewest votes drink double, winner hands out double', () => {
  const t = setup(game, 4, { sips: 2 });
  const g = t.room.game;
  for (let r = 0; r < game.ROUNDS; r++) { playRound(t, 4); t.act(0, 'nextRound'); }
  assert.strictEqual(g.phase, 'draw');
  t.act(0, 'drawing', { image: 'javascript:alert(1)' });
  t.act(0, 'drawing', { image: `data:image/png;base64,${'A'.repeat(400000)}` });
  assert.deepStrictEqual(g.drawings, {});
  for (let i = 0; i < 4; i++) t.act(i, 'drawing', { image: PNG });
  assert.strictEqual(g.phase, 'finalVote');
  const v = t.view(0);
  assert.strictEqual(v.drawings.length, 4);
  assert.ok(v.drawings.every((d) => d.by === null), 'no names while voting');
  const indexOf = (id) => g.finalOrder.indexOf(id);
  const before = t.drinks();
  const pointsBefore = { ...g.points };
  t.act(0, 'finalVote', { i: indexOf('p0') }); // not your own
  assert.strictEqual(g.finalVotes.p0, undefined);
  // p1 gets 2 votes, p2 gets 1, p3 gets 1, p0 gets 0.
  t.act(0, 'finalVote', { i: indexOf('p1') }).act(2, 'finalVote', { i: indexOf('p1') });
  t.act(1, 'finalVote', { i: indexOf('p3') }).act(3, 'finalVote', { i: indexOf('p2') });
  assert.strictEqual(g.phase, 'final');
  assert.deepStrictEqual(g.finalResult.winners, ['p1']);
  assert.deepStrictEqual(g.finalResult.losers, ['p0']);
  assert.strictEqual(t.drinks()[0], before[0] + 4);
  assert.deepStrictEqual(g.give, { from: 'p1', sips: 4 });
  t.act(1, 'give', { targetId: 'p3' });
  assert.strictEqual(t.drinks()[3], before[3] + 4);
  assert.strictEqual(g.points.p1, (pointsBefore.p1 || 0) + 2, 'final votes are points');
  // Drawings are linked, not sent: the link points at p1's drawing.
  const link = t.view(2).drawings.find((d) => d.by === 'p1').image;
  const [, , , key, i] = link.split('/');
  assert.strictEqual(key, t.room.game.drawingKey);
  assert.strictEqual(t.room.game.drawings[t.room.game.finalOrder[Number(i)]], PNG);
  t.act(0, 'playAgain');
  assert.strictEqual(g.phase, 'write');
  assert.strictEqual(g.round, 1);
  assert.deepStrictEqual(g.points, {});
  t.cleanup();
});

test('final: the host can move on; anyone who did not draw drinks double', () => {
  const t = setup(game, 3, { sips: 3 });
  const g = t.room.game;
  for (let r = 0; r < game.ROUNDS; r++) { playRound(t, 3); t.act(0, 'nextRound'); }
  t.act(0, 'drawing', { image: PNG }).act(1, 'drawing', { image: PNG });
  t.act(0, 'moveOn');
  assert.strictEqual(g.phase, 'finalVote');
  const before = t.drinks();
  t.act(0, 'moveOn');
  assert.strictEqual(g.phase, 'final');
  assert.ok(g.finalResult.losers.includes('p2'));
  assert.ok(t.drinks()[2] >= before[2] + 6);
  t.cleanup();
});
