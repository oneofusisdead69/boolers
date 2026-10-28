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

test('bots write, answer, vote (never on their own), draw a real PNG and hand out to humans', () => {
  const zlib = require('node:zlib');
  const t = setup(game, 4);
  const g = t.room.game;
  for (const p of t.room.players.slice(1)) p.bot = 'baller';
  // Player 0 is a human host; the bots do everything else.
  const step = (skill) => {
    for (let i = 1; i < 4; i++) {
      const a = t.bot(i, skill);
      if (a) t.act(i, a.type, a);
    }
  };
  for (let n = 0; n < 5; n++) step(0.9);
  assert.strictEqual(Object.keys(g.questions).length, 3, 'every bot wrote a question');
  t.act(0, 'question', { text: 'Why?' });
  assert.strictEqual(g.phase, 'answer');
  for (let n = 0; n < 3; n++) step(0.9);
  for (const m of g.matchups) for (const id of [m.a, m.b]) if (id !== 'p0') assert.ok(m.answers[id], 'bots answer');
  for (const task of t.view(0).myTasks) t.act(0, 'answer', { m: task.m, text: 'Mine' });
  assert.strictEqual(g.phase, 'vote');
  const m = g.matchups[g.current];
  for (const id of [m.a, m.b]) if (id !== 'p0') assert.strictEqual(t.bot(idx(id), 0.9), null, 'no vote on your own matchup');
  step(0.25);
  if (g.phase === 'vote') t.act(0, 'vote', { side: 'a' });
  assert.strictEqual(g.phase, 'reveal');
  if (g.give && g.give.from !== 'p0') {
    assert.deepStrictEqual(t.bot(idx(g.give.from), 0.6), { type: 'give', targetId: 'p0' }, 'sips go to the human');
  }
  // The final: the drawing is a valid PNG the game accepts.
  t.room.hostId = 'p1';
  g.round = game.ROUNDS;
  g.phase = 'summary';
  assert.strictEqual(t.bot(1, 0.9).type, 'nextRound', 'the host moves on');
  t.act(1, 'nextRound');
  assert.strictEqual(g.phase, 'draw');
  const draw = t.bot(2, 0.9);
  const png = Buffer.from(draw.image.split(',')[1], 'base64');
  assert.strictEqual(png.readUInt32BE(16), 96);
  const idat = png.indexOf('IDAT');
  assert.ok(zlib.inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4))).length > 0);
  for (let i = 1; i < 4; i++) t.act(i, 'drawing', t.bot(i, 0.6));
  t.act(0, 'drawing', { image: draw.image });
  assert.strictEqual(g.phase, 'finalVote');
  for (let i = 1; i < 4; i++) {
    const v = t.bot(i, 0.6);
    assert.notStrictEqual(g.finalOrder[v.i], `p${i}`, 'never its own drawing');
  }
  t.cleanup();
});

// ---------- Best question of the game, and the question bank ----------

const { createQuestionBank, normalise, keyOf, winner, weight } = require('../lib/questionBank');

// What each player sends in a round: their own text, 'generate' (tap Generate, send it as it
// is), or a function that edits the suggestion before sending it.
function send(t, i, q) {
  if (typeof q === 'string' && q !== 'generate') return t.act(i, 'question', { text: q });
  t.act(i, 'generate');
  const s = t.view(i).suggestion;
  t.act(i, 'question', { text: q === 'generate' ? s : q(s) });
}
// Plays one round to its summary, with these questions (one per player).
function round(t, n, questions) {
  for (let i = 0; i < n; i++) send(t, i, questions[i]);
  answerAll(t, n);
  const g = t.room.game;
  for (let k = 0; k < g.matchups.length; k++) {
    const m = g.matchups[k];
    for (let i = 0; i < n; i++) if (`p${i}` !== m.a && `p${i}` !== m.b) t.act(i, 'vote', { side: 'a' });
    t.act(0, 'next');
  }
  assert.strictEqual(g.phase, 'summary');
}
// Plays the whole game to the final results: `rounds` is each round's questions (the same every
// round if only one is given).
function toFinal(t, n, ...rounds) {
  const g = t.room.game;
  for (let r = 0; r < game.ROUNDS; r++) {
    round(t, n, rounds[r] || rounds[rounds.length - 1]);
    assert.strictEqual(g.poll, null, 'no poll between rounds');
    assert.strictEqual(t.view(0).poll, null, 'no poll between rounds');
    t.act(0, 'nextRound');
  }
  for (let i = 0; i < n; i++) t.act(i, 'drawing', { image: PNG });
  t.act(0, 'moveOn');
  assert.strictEqual(g.phase, 'final');
  return g;
}
const QS = ['Worst thing to find in a sock', 'A bad name for a hamster', 'The real reason Kevin left', 'Never say this to a goose'];
const QS2 = ['What Kevin keeps in the shed', 'The worst wedding toast', 'A terrible pub name', 'Why the goose is angry'];

test('poll: only at the end, over every question players wrote all game; no names; one pick each; the TV only a count', () => {
  const t = setup(game, 4);
  const g = toFinal(t, 4, QS, QS2, QS); // round 3 asks round 1's again: once in the poll
  const v = t.view(0).poll;
  assert.deepStrictEqual(v.options.slice().sort(), [...QS, ...QS2].sort());
  assert.strictEqual(v.myPick, null);
  assert.deepStrictEqual([v.picked, v.of], [0, 4]);
  t.act(1, 'bestQuestion', { pick: '2' });
  t.act(1, 'bestQuestion', { pick: '0' }); // already picked: stays
  t.act(2, 'bestQuestion', { pick: '9' }); // not a question
  t.act(2, 'bestQuestion', { pick: null });
  assert.deepStrictEqual(g.poll.votes, { p1: 2 });
  assert.strictEqual(t.view(1).poll.myPick, 2);
  assert.strictEqual(t.view(0).poll.picked, 1);
  const tv = game.view(t.room, { id: '__tv' }, t.ctx).poll;
  assert.strictEqual(tv.options, null, 'the TV gets no list');
  assert.strictEqual(tv.picked, 1);
  assert.ok(!JSON.stringify(t.view(0).poll).match(/p\d|Player/), 'nobody sees who picked or wrote what');
  t.cleanup();
});

test('poll: only questions players wrote; not Generate\'s sent as they are, nor bots\'', () => {
  const t = setup(game, 4);
  t.room.players[3].bot = 'baller';
  const bot = 'The worst thing to text your ex at 3am'; // one of the bots' own
  const g = toFinal(t, 4, [QS[0], 'generate', 'generate', bot], ['generate', QS[1], 'generate', 'generate']);
  assert.deepStrictEqual(g.poll.options.slice().sort(), [QS[0], QS[1]].sort());
  assert.ok(g.matchups.some((m) => m.author === 'p0'), 'the generated ones were asked all the same');
  t.cleanup();
});

test('poll: an edited suggestion is written only if a word changed (case, spaces, punctuation don\'t count)', () => {
  const t = setup(game, 4);
  const g = toFinal(t, 4, [
    (s) => `  ${s.toUpperCase().replace(/[^\w\s]/g, '')}?!  `, // tidied up: still Generate's
    (s) => `${s} at a funeral`, // a word added: written
    (s) => s.split(' ').slice(1).join(' '), // a word dropped: written
    'generate',
  ]);
  const options = g.poll.options;
  assert.strictEqual(options.length, 2 * game.ROUNDS, 'two written each round');
  assert.ok(options.some((q) => q.endsWith('at a funeral')));
  assert.ok(!options.some((q) => q.endsWith('?!')), 'tidying a suggestion is not writing it');
  // A built-in question typed out word for word isn't the player's either.
  const t2 = setup(game, 3);
  const g2 = toFinal(t2, 3, [NORMAL[0].toLowerCase(), 'Mine, all mine', 'generate']);
  assert.deepStrictEqual(g2.poll.options, ['Mine, all mine']);
  t.cleanup();
  t2.cleanup();
});

test('poll: no questions written, no poll; one written, still asked (with None of these)', () => {
  const t = setup(game, 3);
  const g = toFinal(t, 3, ['generate', 'generate', 'generate']);
  assert.strictEqual(g.poll, null);
  assert.strictEqual(t.view(0).poll, null);
  t.act(0, 'bestQuestion', { pick: '0' });
  assert.notStrictEqual(t.bot(1)?.type, 'bestQuestion', 'nothing for a bot to pick');
  t.act(0, 'playAgain');
  assert.strictEqual(g.phase, 'write');
  t.cleanup();

  const bank = createQuestionBank({ kind: 'memory' });
  const t2 = setup(game, 3, {}, { bank });
  const g2 = toFinal(t2, 3, ['Just the one', 'generate', 'generate'], ['generate', 'generate', 'generate']);
  assert.deepStrictEqual(t2.view(1).poll.options, ['Just the one']);
  t2.act(0, 'bestQuestion', { pick: '0' }).act(1, 'bestQuestion', { pick: '0' }).act(2, 'bestQuestion', { pick: 'none' });
  assert.strictEqual(g2.poll.closed, true);
  assert.deepStrictEqual(bank.list().map((e) => [e.text, e.votes, e.nones]), [['Just the one', 2, 1]]);
  t2.cleanup();
});

test('poll: a clear winner goes in the bank; "None of these" beating it keeps it out', () => {
  const bank = createQuestionBank({ kind: 'memory' });
  const t = setup(game, 4, {}, { bank });
  const g = toFinal(t, 4, QS);
  const at = (q) => String(g.poll.options.indexOf(q));
  t.act(0, 'bestQuestion', { pick: at(QS[1]) });
  t.act(1, 'bestQuestion', { pick: at(QS[1]) });
  t.act(2, 'bestQuestion', { pick: 'none' });
  assert.strictEqual(bank.list().length, 0, 'not counted until everyone has picked or the host moves on');
  t.act(3, 'bestQuestion', { pick: at(QS[0]) });
  assert.strictEqual(g.poll.closed, true, 'everyone picked: counted');
  assert.deepStrictEqual(bank.list().map((e) => [e.text, e.mode, e.votes, e.shown, e.picked, e.nones]), [[QS[1], 'normal', 2, 1, 1, 1]]);
  assert.ok(!JSON.stringify(bank.list()).match(/p\d|Player|TEST/), 'no names or room codes');
  t.cleanup();

  // None of these wins: nothing saved.
  const bank2 = createQuestionBank({ kind: 'memory' });
  const t2 = setup(game, 4, {}, { bank: bank2 });
  const g2 = toFinal(t2, 4, QS);
  t2.act(0, 'bestQuestion', { pick: String(g2.poll.options.indexOf(QS[1])) });
  t2.act(1, 'bestQuestion', { pick: String(g2.poll.options.indexOf(QS[1])) });
  t2.act(2, 'bestQuestion', { pick: 'none' });
  t2.act(3, 'bestQuestion', { pick: 'none' });
  assert.deepStrictEqual(bank2.list(), []);
  t2.cleanup();
});

test('poll: only the poll\'s questions have their bank scores updated; Generate\'s can\'t be voted in', () => {
  const bank = createQuestionBank({ kind: 'memory' });
  bank.record({ mode: 'normal', questions: [{ text: 'Saved one', votes: 2 }], none: 0 });
  bank.record({ mode: 'normal', questions: [{ text: QS[2], votes: 2 }], none: 0 });
  bank.chance = 1;
  const t = setup(game, 4, {}, { bank });
  // p3 gets 'Saved one' from Generate and sends it; the others write theirs (QS[2] is saved already).
  const g = toFinal(t, 4, [QS[0], QS[1], QS[2], 'generate'], ['generate', 'generate', 'generate', 'generate']);
  assert.ok(g.used.includes('Saved one'), 'the saved one was asked');
  assert.ok(!g.poll.options.includes('Saved one'), 'but not in the poll');
  const at = String(g.poll.options.indexOf(QS[2]));
  for (let i = 0; i < 4; i++) t.act(i, 'bestQuestion', { pick: at });
  const e = (q) => bank.list().find((x) => x.text === q);
  assert.deepStrictEqual([e('Saved one').shown, e('Saved one').votes], [1, 2], 'untouched');
  assert.deepStrictEqual([e(QS[2]).shown, e(QS[2]).votes, e(QS[2]).picked], [2, 6, 2]);
  assert.strictEqual(bank.list().length, 2);
  t.cleanup();
});

test('poll: never holds the game up; play again or back to the lobby counts what it has', () => {
  const bank = createQuestionBank({ kind: 'memory' });
  const t = setup(game, 4, {}, { bank });
  const g = toFinal(t, 4, QS);
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0'], 'only the host, to play again');
  const at = String(g.poll.options.indexOf(QS[3]));
  t.act(1, 'bestQuestion', { pick: at });
  t.act(2, 'bestQuestion', { pick: at });
  t.act(0, 'playAgain');
  assert.strictEqual(g.phase, 'write');
  assert.strictEqual(g.round, 1);
  assert.strictEqual(g.poll, null);
  assert.deepStrictEqual(bank.list().map((e) => e.text), [QS[3]]);
  // The new game's poll starts afresh: only what's written in it.
  toFinal(t, 4, ['Brand new', 'generate', 'generate', 'generate']);
  assert.deepStrictEqual(t.view(0).poll.options, ['Brand new']);
  t.cleanup();

  // Back to the lobby (the server calls stop before it ends the game).
  const bank2 = createQuestionBank({ kind: 'memory' });
  const t2 = setup(game, 4, {}, { bank: bank2 });
  const g2 = toFinal(t2, 4, QS);
  const at2 = String(g2.poll.options.indexOf(QS[0]));
  t2.act(0, 'bestQuestion', { pick: at2 }).act(3, 'bestQuestion', { pick: at2 });
  game.stop(t2.room, t2.ctx);
  t2.ctx.endGame(t2.room);
  assert.strictEqual(t2.room.game, null);
  assert.deepStrictEqual(bank2.list().map((e) => e.text), [QS[0]]);
  t2.cleanup();
});

test('poll: someone leaving doesn\'t hold it open', () => {
  const bank = createQuestionBank({ kind: 'memory' });
  const t = setup(game, 4, {}, { bank });
  const g = toFinal(t, 4, QS);
  const at = String(g.poll.options.indexOf(QS[1]));
  for (let i = 0; i < 3; i++) t.act(i, 'bestQuestion', { pick: at });
  assert.strictEqual(g.poll.closed, false);
  t.disconnect(3);
  assert.strictEqual(g.poll.closed, true);
  assert.deepStrictEqual(bank.list().map((e) => e.text), [QS[1]]);
  t.cleanup();
});

test('poll: bots pick too (a question or none), but only humans\' picks go in the bank', () => {
  const bank = createQuestionBank({ kind: 'memory' });
  const t = setup(game, 4, {}, { bank });
  const g = toFinal(t, 4, QS);
  t.room.players[3].bot = 'baller';
  t.room.players[2].bot = 'npc';
  const seen = new Set();
  for (let n = 0; n < 60; n++) {
    const a = t.bot(3, 0.6);
    assert.strictEqual(a.type, 'bestQuestion');
    seen.add(a.pick === 'none' ? 'none' : 'question');
    assert.ok(a.pick === 'none' || g.poll.options[Number(a.pick)]);
  }
  assert.deepStrictEqual([...seen].sort(), ['none', 'question']);
  for (const i of [2, 3]) {
    t.act(i, 'bestQuestion', { pick: String(g.poll.options.indexOf(QS[0])) });
    assert.strictEqual(t.bot(i, 0.6), null, 'once is enough');
  }
  t.act(0, 'playAgain');
  assert.deepStrictEqual(bank.list(), [], 'two bot votes save nothing');
  t.cleanup();
});

test('pass and play (no bank): no poll, and Generate uses the built-in list', () => {
  const t = setup(game, 3, {}, { bank: null });
  t.act(0, 'generate');
  assert.ok(NORMAL.includes(t.view(0).suggestion));
  const g = toFinal(t, 3, QS);
  assert.strictEqual(g.poll, null);
  assert.strictEqual(t.view(0).poll, null);
  t.act(0, 'bestQuestion', { pick: '0' });
  t.act(0, 'playAgain');
  assert.strictEqual(g.round, 1);
  t.cleanup();
});

test('a broken bank never breaks the game', () => {
  const bank = { chance: 1, draw() { throw new Error('down'); }, record() { throw new Error('down'); } };
  const t = setup(game, 3, {}, { bank });
  t.act(0, 'generate');
  assert.ok(NORMAL.includes(t.view(0).suggestion), 'falls back to the built-in list');
  const err = console.error;
  console.error = () => {};
  const g = toFinal(t, 3, QS);
  for (let i = 0; i < 3; i++) t.act(i, 'bestQuestion', { pick: '0' });
  console.error = err;
  assert.strictEqual(g.poll.closed, true);
  t.act(0, 'playAgain');
  assert.strictEqual(g.round, 1);
  t.cleanup();
});

test('Generate sometimes draws a saved question, of the same mode, never one already asked this game', () => {
  const bank = createQuestionBank({ kind: 'memory' });
  bank.record({ mode: 'normal', questions: [{ text: 'Saved one', votes: 3 }], none: 0 });
  bank.record({ mode: 'nsfw', questions: [{ text: 'Saved spicy', votes: 3 }], none: 0 });
  bank.chance = 1;
  const t = setup(game, 3, {}, { bank });
  t.act(0, 'generate');
  assert.strictEqual(t.view(0).suggestion, 'Saved one');
  t.act(1, 'generate');
  assert.ok(NORMAL.includes(t.view(1).suggestion), 'the only saved one is taken: the built-in list');
  t.act(0, 'generate'); // again: still not the same one
  assert.notStrictEqual(t.view(0).suggestion, 'Saved one');
  t.cleanup();
  const spicy = setup(game, 3, { questions: 'nsfw' }, { bank });
  spicy.act(0, 'generate');
  assert.strictEqual(spicy.view(0).suggestion, 'Saved spicy');
  spicy.cleanup();
  // A written question counts as asked too.
  const t2 = setup(game, 3, {}, { bank });
  t2.act(1, 'question', { text: '  saved ONE?  ' });
  t2.act(0, 'generate');
  assert.notStrictEqual(t2.view(0).suggestion, 'Saved one');
  t2.cleanup();
  // At the usual chance, mostly the built-in list.
  bank.chance = 0.3;
  let saved = 0;
  for (let n = 0; n < 300; n++) {
    const t3 = setup(game, 3, {}, { bank });
    t3.act(0, 'generate');
    if (t3.view(0).suggestion === 'Saved one') saved++;
    t3.cleanup();
  }
  assert.ok(saved > 50 && saved < 140, `about 30% from the bank (${saved} / 300)`);
});

test('bank: the save rule', () => {
  assert.strictEqual(winner([2, 0, 0], 0), 0, '2 votes, clear winner');
  assert.strictEqual(winner([1, 0, 0], 0), -1, 'one vote is not enough');
  assert.strictEqual(winner([2, 2, 0], 0), -1, 'a tie saves nothing');
  assert.strictEqual(winner([0, 2, 1], 2), -1, 'has to beat None of these');
  assert.strictEqual(winner([0, 3, 1], 2), 1);
  assert.strictEqual(winner([0, 0], 3), -1);
});

test('bank: dedupes on case, spaces and a trailing question mark; caps the length', () => {
  assert.strictEqual(normalise('  A  bad\n name  '), 'A bad name');
  assert.strictEqual(normalise('x'.repeat(300)).length, 140);
  assert.strictEqual(keyOf('normal', 'A bad name?'), keyOf('normal', ' a BAD  name '));
  assert.notStrictEqual(keyOf('normal', 'A bad name'), keyOf('nsfw', 'A bad name'));
  const bank = createQuestionBank({ kind: 'memory' });
  bank.record({ mode: 'normal', questions: [{ text: 'A bad  name', votes: 2 }, { text: 'Other', votes: 0 }], none: 0 });
  bank.record({ mode: 'normal', questions: [{ text: 'a BAD name?', votes: 3 }], none: 1 });
  const list = bank.list('normal');
  assert.strictEqual(list.length, 1);
  assert.deepStrictEqual([list[0].text, list[0].votes, list[0].shown, list[0].picked, list[0].nones], ['A bad name', 5, 2, 2, 1]);
});

test('bank: draws by weight; a question that keeps being shown and not picked fades', () => {
  const bank = createQuestionBank({ kind: 'memory' });
  bank.record({ mode: 'normal', questions: [{ text: 'Loved', votes: 4 }], none: 0 });
  bank.record({ mode: 'normal', questions: [{ text: 'Meh', votes: 2 }], none: 0 });
  // Meh keeps coming up and losing to "None of these".
  for (let n = 0; n < 4; n++) bank.record({ mode: 'normal', questions: [{ text: 'Meh', votes: 0 }, { text: 'New', votes: 0 }], none: 2 });
  const [loved, meh] = ['Loved', 'Meh'].map((q) => bank.list().find((e) => e.text === q));
  assert.ok(loved.weight > meh.weight * 10, `${loved.weight} vs ${meh.weight}`);
  assert.ok(weight({ votes: 2, shown: 5, picked: 1, nones: 0 }) < weight({ votes: 2, shown: 2, picked: 1, nones: 0 }) / 4, 'the safety net');
  assert.strictEqual(bank.list().find((e) => e.text === 'New'), undefined, 'never won: never saved');
  const counts = { Loved: 0, Meh: 0 };
  for (let n = 0; n < 500; n++) counts[bank.draw('normal')]++;
  assert.ok(counts.Loved > counts.Meh * 5, JSON.stringify(counts));
  assert.strictEqual(bank.draw('normal', ['loved', 'MEH?']), null, 'all used: nothing (the built-in list takes over)');
  assert.strictEqual(bank.draw('nsfw'), null);
});

test('bank: memory keeps nothing across a restart; the file does', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const mem = createQuestionBank({ kind: 'memory' });
  mem.record({ mode: 'normal', questions: [{ text: 'Kept in memory', votes: 2 }], none: 0 });
  await mem.flush();
  assert.strictEqual(mem.draw('normal'), 'Kept in memory');
  const fresh = createQuestionBank({ kind: 'memory' });
  await fresh.load();
  assert.deepStrictEqual(fresh.list(), []);

  const file = path.join(os.tmpdir(), `bigTomBank-${process.pid}.json`);
  const a = createQuestionBank({ kind: 'file', file });
  a.record({ mode: 'normal', questions: [{ text: 'On disk', votes: 2 }], none: 0 });
  await a.flush();
  const b = createQuestionBank({ kind: 'file', file });
  await b.load();
  assert.deepStrictEqual(b.list().map((e) => [e.text, e.votes, e.picked]), [['On disk', 2, 1]]);
  fs.rmSync(file, { force: true });
  // A file that can't be written: the game never hears about it.
  const err = console.error;
  const errors = [];
  console.error = (...x) => errors.push(x.join(' '));
  const bad = createQuestionBank({ kind: 'file', file: '/nonexistent-dir/bank.json' });
  bad.record({ mode: 'normal', questions: [{ text: 'Lost', votes: 2 }], none: 0 });
  await bad.flush();
  console.error = err;
  assert.ok(errors.some((e) => /Couldn't save/.test(e)));
  assert.strictEqual(bad.draw('normal'), 'Lost', 'still drawn from memory');
});
