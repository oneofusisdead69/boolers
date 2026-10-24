// "Most Likely To": everyone votes for who fits the prompt best. Whoever gets the
// most votes drinks one sip per vote.

const { shuffle } = require('../lib/cards');

const VOTE_MS = 30 * 1000;

const QUESTIONS = [
  'be late to their own wedding',
  'text their ex tonight',
  'start a fight at a bar',
  'become famous',
  'cry during a kids movie',
  'get lost in their own city',
  'fall asleep at the party first',
  'eat food off the floor',
  'win a reality TV show',
  'forget a close friend\'s birthday',
  'get kicked out of a bar',
  'adopt way too many pets',
  'survive a zombie apocalypse',
  'die first in a horror movie',
  'join a cult by accident',
  'spend their whole paycheck in one night',
  'go viral for something embarrassing',
  'marry someone they just met',
  'laugh at the worst possible moment',
  'get a tattoo they regret',
  'talk their way out of a speeding ticket',
  'still be at the party at 4am',
  'send a text to the wrong person',
  'become a millionaire',
  'end up in jail for something stupid',
  'cheat at a board game',
  'sing karaoke without being asked',
  'move to another country on a whim',
  'drunk-order food at 3am',
  'show up to the wrong party',
  'get recognized by strangers',
  'ghost someone after one date',
  'lie about their age',
  'run for president',
  'have a secret second family',
  'befriend the bartender',
  'fake being sick to skip work',
  'eat something past its expiration date',
  'start a podcast nobody listens to',
  'cry at a commercial',
  'trip over nothing',
  'say "one more drink" and mean ten',
  'get a hangover from two drinks',
  'stalk someone\'s Instagram back to 2012',
  'bring a date to a funeral',
  'accidentally like an old photo',
  'buy something useless at 2am',
  'forget where they parked',
  'climb something they shouldn\'t',
  'have the worst search history',
  'befriend a celebrity',
  'win an argument they\'re wrong about',
  'show up without a gift',
  'dance on a table',
  'pretend to know a song they\'ve never heard',
  'give terrible advice confidently',
  'fall in love on vacation',
  'get banned from a restaurant',
  'call their mom when drunk',
  'still be single at 50',
];

// A question the host typed, tidied to fit "Who's most likely to…": no lead-in, no question mark.
function tidy(q) {
  return q.replace(/^\s*who('s| is)?\s+(the\s+)?most\s+likely\s+to\s+/i, '').replace(/[\s?]+$/, '').trim();
}

function nextQuestion(room, ctx) {
  const g = room.game;
  if (g.deck.length === 0) g.deck = shuffle(g.pool);
  g.question = g.deck.pop();
  g.round += 1;
  g.phase = 'question';
  g.votes = {};
  g.result = null;
  ctx.setTimer(room, VOTE_MS, () => reveal(room, ctx));
}

function reveal(room, ctx) {
  const g = room.game;
  if (!g || g.phase !== 'question') return;
  ctx.clearTimer(room);

  const counts = {};
  for (const [voterId, targetId] of Object.entries(g.votes)) {
    if (!room.players.some((p) => p.id === targetId)) continue;
    (counts[targetId] ||= []).push(voterId);
  }
  const max = Math.max(0, ...Object.values(counts).map((v) => v.length));
  // Nobody voted? Everyone drinks one.
  const noVotes = max === 0;
  const drinkers = noVotes
    ? ctx.connectedPlayers(room).map((p) => p.id)
    : Object.keys(counts).filter((id) => counts[id].length === max);
  const sips = noVotes ? 1 : max;
  for (const id of drinkers) ctx.drink(room, id, sips, noVotes ? 'nobody voted' : 'most votes');

  g.phase = 'reveal';
  g.result = { counts, drinkers, sips, noVotes };
}

module.exports = {
  id: 'mostLikely',
  name: 'Most Likely To',
  description: 'Vote on who fits the prompt best. Most votes drinks.',
  minPlayers: 3,
  order: 1,
  options: [
    {
      id: 'questions',
      label: 'Questions',
      default: 'both',
      choices: [{ value: 'both', label: 'Built-in + yours' }, { value: 'mine', label: 'Only yours' }, { value: 'builtIn', label: 'Built-in only' }],
    },
  ],
  custom: [
    {
      id: 'questions',
      kind: 'list',
      label: 'Your questions',
      hint: 'One per line, finishing "Who\'s most likely to…", e.g. "steal the aux cord"',
      maxItems: 200,
      maxLen: 120,
    },
  ],

  start(room, ctx, options = {}) {
    const mine = (options.custom?.questions || []).map(tidy).filter(Boolean);
    // "Only yours" with none written falls back to the built-in questions.
    const pool = options.questions === 'builtIn' || !mine.length ? QUESTIONS
      : options.questions === 'mine' ? mine
        : [...QUESTIONS, ...mine];
    Object.assign(room.game, { pool, deck: shuffle(pool), round: 0 });
    nextQuestion(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    if (action.type === 'vote' && g.phase === 'question') {
      if (!room.players.some((p) => p.id === action.targetId)) return;
      g.votes[player.id] = action.targetId;
      this.check(room, ctx);
    } else if (action.type === 'next' && g.phase === 'reveal' && room.hostId === player.id) {
      nextQuestion(room, ctx);
    }
  },

  // Reveal early once every connected player has voted.
  check(room, ctx) {
    const g = room.game;
    if (g.phase !== 'question') return;
    const voters = ctx.connectedPlayers(room);
    if (voters.length > 0 && voters.every((p) => g.votes[p.id])) reveal(room, ctx);
  },

  view(room, player) {
    const g = room.game;
    return {
      round: g.round,
      question: g.question,
      myVote: g.votes[player.id] || null,
      votedIds: Object.keys(g.votes),
      result: g.result,
    };
  },
};
