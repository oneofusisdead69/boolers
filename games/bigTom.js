// Big Tom: Quiplash but worse. Everyone writes a question (or taps Generate for one from the list),
// and each question goes to two other players, who answer it secretly. Then the matchups are
// shown one at a time: the question and the two answers, no names, and everyone else votes for
// the better one. The losing answer drinks; the winner hands out sips. Tie: both drink.
//
// With n players, the question written by seat i goes to seats i+1 and i+2, so everyone answers
// two questions and never their own. Needs 3 players.

const { shuffle } = require('../lib/cards');
const { NORMAL, NSFW } = require('../lib/bigTomQuestions');

const VOTE_MS = 30 * 1000;
const clean = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const BIG_TOM = 'bigtom'; // the author of questions nobody wrote

// ---------- Questions ----------

// The next question off the generate deck (reshuffled when it runs out).
function generate(g) {
  if (!g.deck.length) g.deck = shuffle(g.pool);
  return g.deck.pop();
}

// ---------- Rounds ----------

function startRound(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.round += 1;
  g.phase = 'write';
  g.questions = {};
  g.suggest = {};
  g.matchups = [];
  g.current = 0;
  g.give = null;
}

// Hands out the questions: seat i's question to seats i+1 and i+2.
function startAnswering(room, ctx) {
  const g = room.game;
  const seats = shuffle(ctx.connectedPlayers(room).map((p) => p.id));
  if (seats.length < 3) return;
  g.matchups = seats.map((author, i) => {
    const writer = g.questions[author] ? author : BIG_TOM;
    const pair = shuffle([seats[(i + 1) % seats.length], seats[(i + 2) % seats.length]]);
    return { question: g.questions[author] || generate(g), author: writer, a: pair[0], b: pair[1], answers: {}, votes: {}, result: null };
  });
  g.phase = 'answer';
  if (g.answerTime) ctx.setTimer(room, g.answerTime * 1000, () => startVoting(room, ctx));
  else ctx.clearTimer(room);
}

const answerersDone = (room, ctx) => room.game.matchups.every((m) =>
  [m.a, m.b].every((id) => m.answers[id] !== undefined || !ctx.turns.isActive(room, id)));

function startVoting(room, ctx) {
  const g = room.game;
  if (g.phase !== 'answer') return;
  g.current = 0;
  openMatchup(room, ctx);
}

// Who may vote on a matchup: everyone here except its two answerers.
const voters = (room, ctx, m) => ctx.connectedPlayers(room).map((p) => p.id).filter((id) => id !== m.a && id !== m.b);

function openMatchup(room, ctx) {
  const g = room.game;
  const m = g.matchups[g.current];
  g.give = null;
  g.phase = 'vote';
  // A missing answer loses without a vote; two missing answers both drink.
  if (!m.answers[m.a] || !m.answers[m.b] || !voters(room, ctx, m).length) return reveal(room, ctx);
  ctx.setTimer(room, VOTE_MS, () => reveal(room, ctx));
}

function reveal(room, ctx) {
  const g = room.game;
  if (g.phase !== 'vote') return;
  ctx.clearTimer(room);
  const m = g.matchups[g.current];
  const count = (side) => Object.values(m.votes).filter((v) => v === side).length;
  let winner = null;
  if (!m.answers[m.a] && m.answers[m.b]) winner = m.b;
  else if (m.answers[m.a] && !m.answers[m.b]) winner = m.a;
  else if (m.answers[m.a] && m.answers[m.b]) winner = count('a') > count('b') ? m.a : count('b') > count('a') ? m.b : null;
  m.result = { a: count('a'), b: count('b'), winner };
  if (winner) {
    const loser = winner === m.a ? m.b : m.a;
    g.wins[winner] = (g.wins[winner] || 0) + 1;
    ctx.drink(room, loser, g.sips, 'lost the vote');
    g.give = { from: winner, sips: g.sips };
    ctx.log(room, `🎤 ${ctx.name(room, winner)} beat ${ctx.name(room, loser)}`);
  } else {
    for (const id of [m.a, m.b]) ctx.drink(room, id, g.sips, m.answers[m.a] ? 'tied' : 'no answer');
    ctx.log(room, `🎤 ${ctx.name(room, m.a)} and ${ctx.name(room, m.b)} tied: both drink`);
  }
  g.phase = 'reveal';
}

// ---------- Module ----------

module.exports = {
  id: 'bigTom',
  name: 'Big Tom',
  description: 'Quiplash but worse',
  minPlayers: 3,
  order: 1,
  options: [
    { id: 'questions', label: 'Generated questions', default: 'normal', choices: [{ value: 'normal', label: 'Normal' }, { value: 'nsfw', label: '🔞 NSFW' }] },
    { id: 'sips', label: 'Sips for losing (the winner hands out the same)', default: 3, choices: [2, 3, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'answerTime', label: 'Time to answer', default: 90, choices: [{ value: 60, label: '60s' }, { value: 90, label: '90s' }, { value: 120, label: '2 min' }, { value: 0, label: 'No limit' }] },
  ],
  custom: [
    {
      id: 'questions',
      kind: 'list',
      label: 'Your questions',
      hint: 'One per line. 🎲 Generate mixes these in with the built-in ones.',
      maxItems: 200,
      maxLen: 140,
    },
  ],

  start(room, ctx, options = {}) {
    const nsfw = options.questions === 'nsfw';
    const pool = [...(nsfw ? NSFW : NORMAL), ...(options.custom?.questions || [])];
    Object.assign(room.game, {
      nsfw,
      pool,
      deck: shuffle(pool),
      sips: [2, 3, 5].includes(options.sips) ? options.sips : 3,
      answerTime: [60, 90, 120, 0].includes(options.answerTime) ? options.answerTime : 90,
      round: 0,
      wins: {},
    });
    startRound(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const host = me === room.hostId;

    if (action.type === 'generate' && g.phase === 'write' && !g.questions[me]) {
      g.suggest[me] = generate(g);
    } else if (action.type === 'question' && g.phase === 'write' && !g.questions[me]) {
      const text = clean(action.text, 140);
      if (!text) return;
      g.questions[me] = text;
      if (ctx.connectedPlayers(room).every((p) => g.questions[p.id])) startAnswering(room, ctx);
    } else if (action.type === 'answer' && g.phase === 'answer') {
      const m = g.matchups[Number(action.m)];
      const text = clean(action.text, 140);
      if (!m || (m.a !== me && m.b !== me) || !text) return;
      m.answers[me] = text;
      if (answerersDone(room, ctx)) startVoting(room, ctx);
    } else if (action.type === 'vote' && g.phase === 'vote') {
      const m = g.matchups[g.current];
      if (!['a', 'b'].includes(action.side) || !voters(room, ctx, m).includes(me)) return;
      m.votes[me] = action.side;
      if (voters(room, ctx, m).every((id) => m.votes[id])) reveal(room, ctx);
    } else if (action.type === 'give' && g.phase === 'reveal' && g.give?.from === me) {
      const target = ctx.player(room, action.targetId);
      if (!target || target.id === me) return;
      ctx.drink(room, target.id, g.give.sips, 'Big Tom winner', me);
      g.give = null;
    } else if (action.type === 'moveOn' && host) {
      // The host can hurry things along: missing questions come from Big Tom, missing answers lose.
      if (g.phase === 'write' && ctx.connectedPlayers(room).length >= 3) startAnswering(room, ctx);
      else if (g.phase === 'answer') startVoting(room, ctx);
      else if (g.phase === 'vote') reveal(room, ctx);
    } else if (action.type === 'next' && g.phase === 'reveal' && host) {
      g.current += 1;
      if (g.current < g.matchups.length) openMatchup(room, ctx);
      else { g.phase = 'summary'; g.give = null; }
    } else if (action.type === 'nextRound' && g.phase === 'summary' && host) {
      startRound(room, ctx);
    }
  },

  // Nobody who has left holds up a phase.
  check(room, ctx) {
    const g = room.game;
    const here = ctx.connectedPlayers(room);
    if (g.phase === 'write' && here.length >= 3 && here.every((p) => g.questions[p.id])) startAnswering(room, ctx);
    else if (g.phase === 'answer' && answerersDone(room, ctx)) startVoting(room, ctx);
    else if (g.phase === 'vote') {
      const m = g.matchups[g.current];
      if (voters(room, ctx, m).every((id) => m.votes[id])) reveal(room, ctx);
    }
  },

  view(room, player, ctx) {
    const g = room.game;
    const me = player.id;
    const m = g.matchups[g.current];
    const showing = (g.phase === 'vote' || g.phase === 'reveal') && m;
    const revealed = g.phase === 'reveal';
    return {
      round: g.round,
      nsfw: g.nsfw,
      sips: g.sips,
      written: Object.keys(g.questions),
      myQuestion: g.questions[me] || null,
      suggestion: g.suggest[me] || null,
      myTasks: g.phase === 'answer'
        ? g.matchups.map((x, i) => ({ m: i, question: x.question, answer: x.answers[me] ?? null, mine: x.a === me || x.b === me })).filter((x) => x.mine)
        : [],
      answered: g.phase === 'answer'
        ? ctx.connectedPlayers(room).map((p) => p.id).filter((id) => g.matchups.every((x) => (x.a !== id && x.b !== id) || x.answers[id] !== undefined))
        : [],
      matchup: showing && {
        index: g.current,
        total: g.matchups.length,
        question: m.question,
        author: m.author,
        answers: { a: m.answers[m.a] || null, b: m.answers[m.b] || null },
        // Who wrote which answer, and who voted how, only once it's revealed.
        players: revealed ? { a: m.a, b: m.b } : null,
        votes: revealed ? m.votes : null,
        result: revealed ? m.result : null,
        myVote: m.votes[me] || null,
        canVote: voters(room, ctx, m).includes(me),
        mine: m.a === me || m.b === me,
        voted: Object.keys(m.votes).length,
        voters: voters(room, ctx, m).length,
      },
      give: g.give,
      wins: g.wins,
      results: g.phase === 'summary' ? g.matchups.map((x) => ({ question: x.question, a: x.a, b: x.b, winner: x.result?.winner ?? null })) : null,
    };
  },

  BIG_TOM,
};
