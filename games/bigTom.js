// Big Tom: Quiplash but worse. Everyone writes a question (or taps Generate for one from the list),
// and each question goes to two other players, who answer it secretly. Then the matchups are
// shown one at a time: the question and the two answers, no names, and everyone else votes for
// the better one. The losing answer drinks; the winner hands out sips. Tie: both drink.
//
// With n players, the question written by seat i goes to seats i+1 and i+2, so everyone answers
// two questions and never their own. Needs 3 players.
//
// Three rounds like that, then the final round: one question for everyone, answered by drawing a
// picture. Everyone votes for their favourite drawing (not their own); the least-voted drawings
// drink double and the winner hands out double. Most points (matchups won + final votes) is the
// Big Tom champion.

const { shuffle } = require('../lib/cards');
const { NORMAL, NSFW, DRAW_NORMAL, DRAW_NSFW } = require('../lib/bigTomQuestions');

const VOTE_MS = 30 * 1000;
const FINAL_VOTE_MS = 45 * 1000;
const ROUNDS = 3;
const MAX_IMAGE = 300 * 1000; // characters of a PNG data URL
const isImage = (s) => typeof s === 'string' && s.length <= MAX_IMAGE && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(s);
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
    g.points[winner] = (g.points[winner] || 0) + 1;
    ctx.drink(room, loser, g.sips, 'lost the vote');
    g.give = { from: winner, sips: g.sips };
    ctx.log(room, `🎤 ${ctx.name(room, winner)} beat ${ctx.name(room, loser)}`);
  } else {
    for (const id of [m.a, m.b]) ctx.drink(room, id, g.sips, m.answers[m.a] ? 'tied' : 'no answer');
    ctx.log(room, `🎤 ${ctx.name(room, m.a)} and ${ctx.name(room, m.b)} tied: both drink`);
  }
  g.phase = 'reveal';
}

// ---------- Final round: draw it ----------

function startFinal(room, ctx) {
  const g = room.game;
  g.round = ROUNDS + 1;
  g.phase = 'draw';
  g.finalQuestion = shuffle(g.nsfw ? DRAW_NSFW : DRAW_NORMAL)[0];
  g.drawings = {};
  g.finalOrder = [];
  g.finalVotes = {};
  g.give = null;
  g.finalResult = null;
  const ms = g.answerTime ? Math.max(g.answerTime, 90) * 1000 : 0;
  if (ms) ctx.setTimer(room, ms, () => startFinalVote(room, ctx));
  else ctx.clearTimer(room);
}

// Everyone here votes, as long as there's a drawing that isn't theirs.
const finalVoters = (room, ctx) => ctx.connectedPlayers(room).map((p) => p.id)
  .filter((id) => room.game.finalOrder.some((d) => d !== id));

function startFinalVote(room, ctx) {
  const g = room.game;
  if (g.phase !== 'draw') return;
  // Drawings are shown in a random order, without names, until the reveal.
  g.finalOrder = shuffle(Object.keys(g.drawings));
  // Drawings are fetched once as images (server.js /drawing/…) rather than sent with every update.
  g.drawingKey = Math.random().toString(36).slice(2, 10);
  g.phase = 'finalVote';
  if (g.finalOrder.length < 2) return finalReveal(room, ctx);
  ctx.setTimer(room, FINAL_VOTE_MS, () => finalReveal(room, ctx));
}

function finalReveal(room, ctx) {
  const g = room.game;
  if (g.phase !== 'finalVote') return;
  ctx.clearTimer(room);
  const counts = Object.fromEntries(g.finalOrder.map((id) => [id, 0]));
  for (const target of Object.values(g.finalVotes)) if (target in counts) counts[target] += 1;
  for (const [id, n] of Object.entries(counts)) g.points[id] = (g.points[id] || 0) + n;
  const values = Object.values(counts);
  const top = Math.max(0, ...values);
  const bottom = Math.min(...values);
  const solo = g.finalOrder.length === 1; // the only drawing wins by default
  const winners = solo ? g.finalOrder.slice() : g.finalOrder.filter((id) => counts[id] === top && top > 0);
  // Least votes drink double; so does anyone who didn't draw. Everyone tied: everyone drinks.
  const tied = !solo && top === bottom;
  const losers = solo ? [] : tied ? g.finalOrder.slice() : g.finalOrder.filter((id) => counts[id] === bottom);
  const blank = ctx.connectedPlayers(room).map((p) => p.id).filter((id) => !g.drawings[id]);
  for (const id of losers) ctx.drink(room, id, g.sips * 2, 'fewest votes in the final');
  for (const id of blank) ctx.drink(room, id, g.sips * 2, 'no drawing in the final');
  g.give = winners.length === 1 && !tied ? { from: winners[0], sips: g.sips * 2 } : null;
  g.finalResult = { counts, winners: tied ? [] : winners, losers: [...losers, ...blank] };
  if (g.finalResult.winners.length) ctx.log(room, `🎨 ${g.finalResult.winners.map((id) => ctx.name(room, id)).join(' & ')} won the final`);
  g.phase = 'final';
}

// ---------- Bots ----------

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

// Questions a bot writes when it doesn't tap Generate.
const BOT_QUESTIONS = [
  'The worst thing to find in your pocket after a night out',
  'A terrible name for a cocktail',
  'What the bouncer is really thinking',
  'The worst thing to text your ex at 3am',
  'A rejected flavour of crisps',
  'The real reason the party ended early',
  'Something you should never say at a wedding',
  'The worst superpower to have while drunk',
];

// Canned answers, funniest first: better bots pick from nearer the top.
const ANSWERS = [
  'Your mum, probably',
  'A haunted kebab',
  'Three raccoons in a trench coat',
  'Tax fraud, but fun',
  'Emotional damage',
  'Big Tom himself',
  'A suspiciously wet sock',
  'Crying in the Uber',
  'Grandma\'s secret OnlyFans',
  'A goose with a knife',
  'Pineapple, unfortunately',
  'Whatever Kevin did last summer',
  'Accidentally liking an old photo',
  'Jägerbombs for breakfast',
  'A strongly worded email',
  'The pigeon mafia',
  'Moist',
  'Divorce',
  'A cursed group chat',
  'Seven ferrets',
  'Free trial of regret',
  'Vibes, mostly',
  'Nickelback\'s greatest hits',
  'A lukewarm Capri-Sun',
  'Your browser history',
  'Gas station sushi',
  'Sir Barks-a-lot',
  'The fifth Teletubby',
  'Just a lot of glitter',
  'A sad trombone',
  'Soup',
  'Feet',
  'Nothing, it was fine',
  'I don\'t know, a dog?',
  'Yes',
];
// Answers that fit a kind of question better: good bots usually notice.
const THEMED = [
  { re: /\bname|title|slogan|band|boat|call/i, list: ['Sir Sips-a-Lot', 'The Moist Avengers', 'Unsinkable II', 'Liquid Courage', 'Big Tom Energy', 'Wet Bandits'] },
  { re: /\bsay|yell|hear|text|tell|ask/i, list: ['"Is this thing on?"', '"I\'ve made a huge mistake"', '"Who wants to see my rash?"', '"Hold my beer"', '"Mum, come pick me up"', '"It\'s not what it looks like"'] },
  { re: /\bfood|eat|pizza|flavou?r|ingredient|burrito|sushi|chip|crisp/i, list: ['Ketchup ice cream', 'A single wet crouton', 'Mayonnaise, warm', 'Expired yoghurt', 'Gravy, by the pint'] },
];

// A bot's answer to a question: nearer the top of the list the better it is, and one that fits
// the question when it spots one. Never the same answer twice in a round.
function botAnswer(question, used, skill) {
  const theme = THEMED.find((t) => t.re.test(question));
  const fresh = (list) => list.filter((a) => !used.includes(a));
  // Themed answers are all as good as each other: any one (so two bots rarely say the same).
  if (theme && Math.random() < skill && fresh(theme.list).length) return pickOne(fresh(theme.list));
  const list = fresh(ANSWERS);
  return list[Math.floor(Math.random() ** (0.5 + skill * 3) * list.length)];
}

// How good an answer looks to a bot: its own canned ones by their place in the list, anything
// else (a human's) a bit better than average, and short, punchy answers beat rambling ones.
function botScore(text) {
  const i = ANSWERS.indexOf(text);
  const base = i >= 0 ? 1 - i / ANSWERS.length : 0.6;
  return base + (text.length <= 40 ? 0.2 : 0);
}

// ----- A bot's drawing: a little 1-bit PNG, made by hand (games run in the browser too) -----

const W = 96;
const H = 72;
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type, data) => {
  const body = [...type].map((ch) => ch.charCodeAt(0)).concat(data);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
};
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

// Black ink on white: pixels[y][x] is true where there's ink.
function png(pixels) {
  const rowBytes = W / 8;
  const raw = [];
  for (let y = 0; y < H; y++) {
    raw.push(0); // no filter
    for (let x = 0; x < rowBytes; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) if (!pixels[y][x * 8 + bit]) byte |= 0x80 >> bit; // 1 is white
      raw.push(byte);
    }
  }
  // zlib with one uncompressed block (it's small), and its Adler-32.
  let s1 = 1;
  let s2 = 0;
  for (const b of raw) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
  const zlib = [0x78, 0x01, 0x01, raw.length & 255, raw.length >> 8, ~raw.length & 255, (~raw.length >> 8) & 255, ...raw, ...u32(((s2 << 16) | s1) >>> 0)];
  const ihdr = [...u32(W), ...u32(H), 1, 0, 0, 0, 0]; // 1-bit greyscale
  const bytes = [137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr), ...chunk('IDAT', zlib), ...chunk('IEND', [])];
  return `data:image/png;base64,${base64(bytes)}`;
}

// Good bots draw a little face and a doodle; bad ones just scribble.
function botDrawing(skill) {
  const pixels = Array.from({ length: H }, () => Array(W).fill(false));
  const dot = (x, y) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px >= 0 && px < W && py >= 0 && py < H) pixels[py][px] = true;
    }
  };
  const line = (x0, y0, x1, y1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
    for (let i = 0; i <= n; i++) dot(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  };
  if (Math.random() < skill) {
    const [cx, cy, r] = [30 + Math.random() * 36, 36, 18 + Math.random() * 8];
    for (let a = 0; a < 360; a += 4) dot(cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180));
    dot(cx - r / 3, cy - r / 3);
    dot(cx + r / 3, cy - r / 3);
    for (let a = 20; a <= 160; a += 8) dot(cx + (r / 2) * Math.cos((a * Math.PI) / 180), cy + r / 6 + (r / 3) * Math.sin((a * Math.PI) / 180));
  }
  // A scribble or two: a few random strokes.
  for (let s = 0; s < 1 + Math.floor(Math.random() * 3); s++) {
    let [x, y] = [Math.random() * W, Math.random() * H];
    for (let k = 0; k < 4 + Math.floor(Math.random() * 5); k++) {
      const [nx, ny] = [Math.max(0, Math.min(W - 1, x + (Math.random() - 0.5) * 40)), Math.max(0, Math.min(H - 1, y + (Math.random() - 0.5) * 40))];
      line(x, y, nx, ny);
      [x, y] = [nx, ny];
    }
  }
  return png(pixels);
}

// Someone for a bot to hand sips to: a human here when there is one.
function botTarget(room, me) {
  const others = room.players.filter((p) => p.id !== me.id && p.connected);
  const humans = others.filter((p) => !p.bot);
  return others.length ? pickOne(humans.length ? humans : others).id : null;
}

// ---------- Module ----------

module.exports = {
  id: 'bigTom',
  name: 'Big Tom',
  description: 'Quiplash but worse',
  // A reminder of the rules, shown on the TV.
  rules: [
    "Write a question; two other players answer it.",
    "Vote for the better answer. Loser drinks; winner hands out.",
    "Three rounds, then the final: answer by drawing.",
    "Fewest votes in the final drinks double. Most points is Big Tom champion.",
  ],
  minPlayers: 3,
  order: 1,
  options: [
    { id: 'questions', label: 'Generated questions', default: 'normal', choices: [{ value: 'normal', label: 'Normal' }, { value: 'nsfw', label: '🥴 We are already drunk' }] },
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
      points: {},
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
    } else if (action.type === 'give' && (g.phase === 'reveal' || g.phase === 'final') && g.give?.from === me) {
      const target = ctx.player(room, action.targetId);
      if (!target || target.id === me) return;
      ctx.drink(room, target.id, g.give.sips, 'Big Tom winner', me);
      g.give = null;
    } else if (action.type === 'moveOn' && host) {
      // The host can hurry things along: missing questions come from Big Tom, missing answers lose.
      if (g.phase === 'write' && ctx.connectedPlayers(room).length >= 3) startAnswering(room, ctx);
      else if (g.phase === 'answer') startVoting(room, ctx);
      else if (g.phase === 'vote') reveal(room, ctx);
      else if (g.phase === 'draw') startFinalVote(room, ctx);
      else if (g.phase === 'finalVote') finalReveal(room, ctx);
    } else if (action.type === 'next' && g.phase === 'reveal' && host) {
      g.current += 1;
      if (g.current < g.matchups.length) openMatchup(room, ctx);
      else { g.phase = 'summary'; g.give = null; }
    } else if (action.type === 'nextRound' && g.phase === 'summary' && host) {
      if (g.round < ROUNDS) startRound(room, ctx);
      else startFinal(room, ctx);
    } else if (action.type === 'drawing' && g.phase === 'draw' && isImage(action.image)) {
      g.drawings[me] = action.image;
      if (ctx.connectedPlayers(room).every((p) => g.drawings[p.id])) startFinalVote(room, ctx);
    } else if (action.type === 'finalVote' && g.phase === 'finalVote') {
      const target = g.finalOrder[Number(action.i)];
      if (!target || target === me) return;
      g.finalVotes[me] = target;
      if (finalVoters(room, ctx).every((id) => g.finalVotes[id])) finalReveal(room, ctx);
    } else if (action.type === 'playAgain' && g.phase === 'final' && host) {
      g.round = 0;
      g.wins = {};
      g.points = {};
      startRound(room, ctx);
    }
  },

  bot(room, me, ctx, skill) {
    const g = room.game;
    const host = room.hostId === me.id;
    if (g.phase === 'write' && !g.questions[me.id]) {
      // Tap Generate and send what it suggests; now and then a bot writes its own instead.
      if (g.suggest[me.id]) return { type: 'question', text: g.suggest[me.id] };
      if (Math.random() < 0.5 + skill / 2) return { type: 'generate' };
      return { type: 'question', text: pickOne(BOT_QUESTIONS), delay: 3000 + Math.random() * 4000 };
    }
    if (g.phase === 'answer') {
      const mine = g.matchups.map((m, i) => ({ m, i })).filter(({ m }) => m.a === me.id || m.b === me.id);
      const todo = mine.find(({ m }) => m.answers[me.id] === undefined);
      if (!todo) return null;
      const used = mine.map(({ m }) => m.answers[me.id]).filter(Boolean);
      // Typing an answer takes a few seconds.
      return { type: 'answer', m: todo.i, text: botAnswer(todo.m.question, used, skill), delay: 2500 + Math.random() * 4000 };
    }
    if (g.phase === 'vote') {
      const m = g.matchups[g.current];
      if (m.votes[me.id] || !voters(room, ctx, m).includes(me.id)) return null;
      const [a, b] = [botScore(m.answers[m.a]), botScore(m.answers[m.b])];
      // Good bots usually go with the better-looking answer; bad ones vote at random.
      const side = Math.random() < skill && a !== b ? (a > b ? 'a' : 'b') : pickOne(['a', 'b']);
      return { type: 'vote', side };
    }
    if ((g.phase === 'reveal' || g.phase === 'final') && g.give?.from === me.id) {
      const targetId = botTarget(room, me);
      return targetId && { type: 'give', targetId };
    }
    // The host moves on once the winner has handed out their sips.
    if (g.phase === 'reveal' && host && !g.give) return { type: 'next' };
    if (g.phase === 'summary' && host) return { type: 'nextRound' };
    if (g.phase === 'draw' && !g.drawings[me.id]) return { type: 'drawing', image: botDrawing(skill), delay: 5000 + Math.random() * 6000 };
    if (g.phase === 'finalVote' && !g.finalVotes[me.id]) {
      // Drawings can't be judged from here: any one that isn't the bot's own.
      const others = g.finalOrder.map((id, i) => ({ id, i })).filter(({ id }) => id !== me.id);
      return others.length ? { type: 'finalVote', i: pickOne(others).i } : null;
    }
    return null;
  },

  // Nobody who has left holds up a phase.
  check(room, ctx) {
    const g = room.game;
    if (g.give && !ctx.turns.isActive(room, g.give.from)) g.give = null;
    const here = ctx.connectedPlayers(room);
    if (g.phase === 'write' && here.length >= 3 && here.every((p) => g.questions[p.id])) startAnswering(room, ctx);
    else if (g.phase === 'answer' && answerersDone(room, ctx)) startVoting(room, ctx);
    else if (g.phase === 'vote') {
      const m = g.matchups[g.current];
      if (voters(room, ctx, m).every((id) => m.votes[id])) reveal(room, ctx);
    } else if (g.phase === 'draw' && here.length && here.every((p) => g.drawings[p.id])) startFinalVote(room, ctx);
    else if (g.phase === 'finalVote' && finalVoters(room, ctx).every((id) => g.finalVotes[id])) finalReveal(room, ctx);
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
      points: g.points,
      rounds: ROUNDS,
      // Final round
      finalQuestion: g.finalQuestion || null,
      drew: g.drawings ? Object.keys(g.drawings) : [],
      drawings: (g.phase === 'finalVote' || g.phase === 'final')
        ? g.finalOrder.map((id, i) => ({ i, image: `/drawing/${room.code}/${g.drawingKey}/${i}`, mine: id === me, by: g.phase === 'final' ? id : null }))
        : [],
      myFinalVote: g.phase === 'finalVote' && g.finalVotes[me] ? g.finalOrder.indexOf(g.finalVotes[me]) : null,
      finalVoted: g.phase === 'finalVote' ? Object.keys(g.finalVotes).length : 0,
      finalVoters: g.phase === 'finalVote' ? finalVoters(room, ctx).length : 0,
      finalVotes: g.phase === 'final' ? g.finalVotes : null,
      finalResult: g.phase === 'final' ? g.finalResult : null,
      results: g.phase === 'summary' ? g.matchups.map((x) => ({ question: x.question, a: x.a, b: x.b, winner: x.result?.winner ?? null })) : null,
    };
  },

  BIG_TOM,
  ROUNDS,
};
