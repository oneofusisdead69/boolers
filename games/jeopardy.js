// Bool Jeopardy: a trivia board of five categories × five values ($200 to $1000).
//
// First everyone votes on the categories: ten are drawn from the bank (ones the room hasn't had
// yet first), everyone ticks up to four and locks in, and the four with the most votes make the
// board (ties broken at random). The fifth column is always the house category: one about the
// venue the room is dressed as (the pirate tavern gets pirates, the château French wine; a plain
// room gets bar trivia).
//
// The picker (a random player to start; then whoever last answered right) picks a clue. It shows
// on the TV and every phone; after a short beat the buzzers light up and the first to buzz gets four
// options and a few seconds to answer. Right: +the value in $, and they pick next. Wrong (or out of
// time): −the value, they're locked out of that clue, and the buzzers open again for everyone else.
// Nobody buzzes in time, or everyone's locked out: the answer's shown, nobody pays, same picker.
//
// Drinks run the way Shot Poker's do (games/shotPoker.js): a wrong answer puts sips on your tab
// ($200 = 1 sip … $1000 = 5), a set number of sips makes a shot, and nobody owes more than the max
// shots at once. Owe something and you tap ☠️🥃 "Tab settled" once it's down: every tab has to be
// settled before the next clue can be picked (players who've left don't hold it up).
//
// One clue hides a Daily Double: only the picker plays it, wagering sips before seeing it. Right:
// +wager × $200 and they hand the wager out; wrong: −wager × $200 and the wager goes on their tab.
//
// Once the board's cleared, the Final round (unless it's switched off): everyone sees the
// category, wagers sips in secret, then answers the clue privately. Right +wager × $200, wrong
// −wager × $200. Whoever has the most $ after the Final drinks nothing; everyone else who got it
// wrong owes their wager.

const { shuffle, pick, steady } = require('../lib/random');
const { optionValues } = require('../lib/options');
const { isActive, next } = require('../lib/turns');
const { pickHuman } = require('../lib/bots');
const giving = require('../lib/give');
const { shotText } = require('./shotPoker');
const { CATEGORIES, VENUES, venueOf } = require('../lib/jeopardyQuestions');

const COLS = 5; // categories on the board: the top VOTED from the vote, then the house category
const VOTED = 4;
const ROWS = 5; // clues in each ($200 … $1000)
const POOL = 10; // categories to vote on
const MAX_PICKS = 4; // categories each player can vote for
const VALUE = 200; // $ a row (and $ a sip wagered)

const VOTE_MS = 30 * 1000;
const VOTED_MS = 4500; // the vote's result, before the board
const READ_MS = 1500; // the clue on screen before the buzzers light
const BUZZ_MS = 10 * 1000; // the buzzers are open this long
const ANSWER_MS = 7 * 1000; // the buzzer has this long to answer
const DD_ANSWER_MS = 10 * 1000; // the Daily Double (they haven't been reading it while others buzz)
const REVEAL_MS = 4000; // the answer on screen before the board comes back
const FINAL_WAGER_MS = 30 * 1000;
const FINAL_ANSWER_MS = 15 * 1000;

// ---------- Tabs (as in Shot Poker) ----------

// Everyone with a tab still to settle (players who've left don't hold anything up).
const unpaid = (room) => Object.entries(room.game.debts)
  .filter(([id, d]) => !d.paid && isActive(room, id))
  .map(([id]) => id);

// Puts sips on someone's tab (never more than the max shots), buzzing their phone: a whole shot
// or more gets the big "TAKE 1 SHOT + 2 SIPS".
function owe(room, ctx, id, sips, reason) {
  const g = room.game;
  const n = Math.min(sips, g.cap);
  if (n <= 0) return;
  const text = shotText(n, g.perShot);
  g.debts[id] = { sips: n, text, paid: false };
  ctx.drink(room, id, n, reason, null, n >= g.perShot ? { title: `TAKE ${text.toUpperCase()}` } : {});
}

// ---------- The category vote ----------

// Ten categories to vote on: ones the room hasn't played tonight first.
function drawPool(room) {
  const seen = (room.jeopardySeen ||= []);
  const all = CATEGORIES.map((_, i) => i);
  const fresh = shuffle(all.filter((i) => !seen.includes(CATEGORIES[i].name)));
  const again = shuffle(all.filter((i) => seen.includes(CATEGORIES[i].name)));
  return [...fresh, ...again].slice(0, POOL);
}

// The house category: one of the venue's own (lib/jeopardyQuestions.js VENUES), one the room
// hasn't had tonight if there is one.
function drawHouse(room) {
  const venue = venueOf(room.style);
  const seen = room.jeopardySeen || [];
  const list = VENUES[venue].categories.map((_, i) => i);
  const fresh = list.filter((i) => !seen.includes(VENUES[venue].categories[i].name));
  return { venue, i: pick(fresh.length ? fresh : list) };
}
const houseCat = (g) => VENUES[g.house.venue].categories[g.house.i];

// How many votes each category in the pool has (everyone's ticks, locked in or not).
function tally(g) {
  const counts = g.pool.map(() => 0);
  for (const picks of Object.values(g.votes)) for (const i of picks) counts[i] += 1;
  return counts;
}

function closeVote(room, ctx) {
  const g = room.game;
  if (g.phase !== 'vote') return;
  ctx.clearTimer(room);
  const counts = tally(g);
  // Most votes first; ties at random (shuffled first, and the sort keeps that order for ties).
  const ranked = shuffle(g.pool.map((_, i) => i)).sort((a, b) => counts[b] - counts[a]);
  g.chosen = ranked.slice(0, VOTED);
  g.counts = counts;
  const cat = (i) => CATEGORIES[g.pool[i]];
  // The Final comes from the best of the categories that didn't make it.
  buildBoard(room, [...g.chosen.map(cat), { ...houseCat(g), emoji: VENUES[g.house.venue].emoji }], cat(ranked[VOTED]));
  ctx.log(room, `🗳️ The board: ${g.cats.map((c) => c.name).join(', ')}`);
  g.phase = 'voted';
  ctx.setTimer(room, VOTED_MS, () => toBoard(room, ctx));
}

// The board from its categories, in order (each clue's options shuffled), with one Daily Double
// hidden off the top row; the Final's clue is `final`'s $800 one.
function buildBoard(room, cats, final) {
  const g = room.game;
  const clue = (x) => {
    const options = shuffle([x.a, ...x.wrong]);
    return { q: x.q, options, answer: options.indexOf(x.a) };
  };
  g.cats = cats.map((cat) => ({
    name: cat.name,
    emoji: cat.emoji || null,
    clues: cat.clues.slice(0, ROWS).map((x, r) => ({ ...clue(x), value: (r + 1) * VALUE, used: false, dd: false })),
  }));
  g.cats[Math.floor(Math.random() * g.cats.length)].clues[1 + Math.floor(Math.random() * (ROWS - 1))].dd = true;
  g.finalClue = { cat: final.name, ...clue(final.clues[3]) };
  const seen = (room.jeopardySeen ||= []);
  for (const name of [...g.cats.map((c) => c.name), g.finalClue.cat]) if (!seen.includes(name)) seen.push(name);
}

// ---------- The board ----------

const cellsLeft = (g) => (g.cats || []).reduce((n, c) => n + c.clues.filter((x) => !x.used).length, 0);

// The picker for the next clue: whoever it was, or the next one along if they've gone.
function ensurePicker(room) {
  const g = room.game;
  if (!isActive(room, g.pickerId)) g.pickerId = next(room, g.order, g.pickerId) || g.pickerId;
}

function toBoard(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.phase = 'board';
  g.give = null;
  ensurePicker(room);
  maybeFinish(room, ctx);
}

// Board cleared and every tab settled: on to the Final (or the end).
function maybeFinish(room, ctx) {
  const g = room.game;
  if (g.phase !== 'board' || cellsLeft(g) || unpaid(room).length) return;
  if (g.final && g.finalClue) startFinal(room, ctx);
  else finish(room, ctx);
}

function pickClue(room, ctx, c, r) {
  const g = room.game;
  const cell = g.cats[c].clues[r];
  cell.used = true;
  g.clueNo += 1;
  g.debts = {}; // (all settled: that's what let the pick through)
  g.clue = {
    c, r,
    cat: g.cats[c].name,
    value: cell.value,
    sips: Math.min(r + 1, g.cap),
    q: cell.q,
    options: cell.options,
    answer: cell.answer,
    dd: cell.dd,
    wager: null,
  };
  g.stage = null;
  g.buzzerId = null;
  g.locked = [];
  g.wrong = [];
  g.results = [];
  ctx.log(room, `🟦 ${ctx.name(room, g.pickerId)} picks ${g.clue.cat} for $${g.clue.value}`);
  if (cell.dd) {
    g.phase = 'ddWager';
    ctx.clearTimer(room);
    ctx.log(room, `💥 Daily Double for ${ctx.name(room, g.pickerId)}!`);
    return;
  }
  g.phase = 'clue';
  g.stage = 'read';
  ctx.setTimer(room, READ_MS, () => openBuzzers(room, ctx));
}

// Who can still buzz in on this clue.
const canBuzz = (room) => room.players.filter((p) => p.connected && !room.game.locked.includes(p.id)).map((p) => p.id);

function openBuzzers(room, ctx) {
  const g = room.game;
  if (g.phase !== 'clue') return;
  g.buzzerId = null;
  // A Daily Double goes straight to the picker.
  if (g.clue.dd) {
    g.stage = 'answer';
    g.buzzerId = g.pickerId;
    ctx.setTimer(room, DD_ANSWER_MS, () => answered(room, ctx, g.pickerId, null));
    return;
  }
  if (!canBuzz(room).length) return reveal(room, ctx);
  g.stage = 'open';
  ctx.setTimer(room, BUZZ_MS, () => reveal(room, ctx));
}

// The buzzer's answer: an option, or null for out of time. `left`: they've gone (no drink, no $).
function answered(room, ctx, id, pickIndex, { left = false } = {}) {
  const g = room.game;
  if (g.phase !== 'clue' || g.stage !== 'answer' || g.buzzerId !== id) return;
  ctx.clearTimer(room);
  const k = g.clue;
  const right = pickIndex === k.answer;
  const stake = k.dd ? k.wager * VALUE : k.value;
  const sips = k.dd ? k.wager : k.sips;
  const delta = left ? 0 : right ? stake : -stake;
  g.scores[id] = (g.scores[id] || 0) + delta;
  g.results.push({ id, pick: pickIndex, right, delta, timeout: pickIndex === null, left });
  const who = ctx.name(room, id);
  if (right) {
    g.pickerId = id;
    ctx.log(room, `✅ ${who} got it: +$${stake}`);
    if (k.dd) g.give = { from: id, sips };
    return reveal(room, ctx);
  }
  if (left) ctx.log(room, `🚪 ${who} left mid-answer`);
  else {
    ctx.log(room, `❌ ${who} ${pickIndex === null ? 'ran out of time' : 'got it wrong'}: −$${stake}`);
    owe(room, ctx, id, sips, k.dd ? 'missed the Daily Double' : `missed a $${k.value} clue`);
  }
  g.locked.push(id);
  if (pickIndex !== null && !g.wrong.includes(pickIndex)) g.wrong.push(pickIndex);
  if (k.dd) return reveal(room, ctx);
  openBuzzers(room, ctx);
}

function reveal(room, ctx) {
  const g = room.game;
  if (g.phase !== 'clue' && g.phase !== 'ddWager') return;
  ctx.clearTimer(room);
  g.phase = 'reveal';
  g.stage = null;
  g.buzzerId = null;
  const k = g.clue;
  if (!g.results.some((x) => x.right)) ctx.log(room, `💡 It was ${k.options[k.answer]}`);
  g.last = { cat: k.cat, value: k.value, dd: k.dd, answer: k.options[k.answer], results: g.results.slice() };
  if (g.give) giveClock(room, ctx);
  else ctx.setTimer(room, REVEAL_MS, () => toBoard(room, ctx));
}

// A Daily Double winner handing out their wager is on the clock (none in pass and play); when it's
// up, or the host skips the wait, it goes out at random.
function giveClock(room, ctx) {
  const g = room.game;
  const give = g.give;
  giving.clock(room, ctx, () => g.give === give && autoGive(room, ctx));
}
function autoGive(room, ctx, skipped = false) {
  const g = room.game;
  giving.auto(room, ctx, g.give.from, g.give.sips, 'Daily Double', { skipped });
  g.give = null;
  toBoard(room, ctx);
}

// ---------- The Final ----------

function startFinal(room, ctx) {
  const g = room.game;
  g.phase = 'finalWager';
  g.finalWagers = {};
  g.finalAnswers = {};
  g.debts = {};
  ctx.log(room, `🏁 The Final: ${g.finalClue.cat}`);
  if (g.relaxed) ctx.clearTimer(room);
  else ctx.setTimer(room, FINAL_WAGER_MS, () => closeWagers(room, ctx));
}

// Time's up on the wagers: anyone here who hasn't wagered is in for 1 sip.
function closeWagers(room, ctx) {
  const g = room.game;
  if (g.phase !== 'finalWager') return;
  for (const p of ctx.connectedPlayers(room)) if (!g.finalWagers[p.id]) g.finalWagers[p.id] = 1;
  startFinalAnswer(room, ctx);
}

function startFinalAnswer(room, ctx) {
  const g = room.game;
  g.phase = 'finalAnswer';
  if (g.relaxed) ctx.clearTimer(room);
  else ctx.setTimer(room, FINAL_ANSWER_MS, () => finishFinal(room, ctx));
}

// Who still has to wager / answer in the Final.
const toWager = (room) => room.players.filter((p) => p.connected && !room.game.finalWagers[p.id]).map((p) => p.id);
const toAnswer = (room) => room.players.filter((p) => p.connected && room.game.finalWagers[p.id] && room.game.finalAnswers[p.id] === undefined).map((p) => p.id);

function finishFinal(room, ctx) {
  const g = room.game;
  if (g.phase !== 'finalAnswer') return;
  ctx.clearTimer(room);
  const k = g.finalClue;
  const rows = Object.entries(g.finalWagers).map(([id, wager]) => {
    const pickIndex = g.finalAnswers[id] ?? null;
    const right = pickIndex === k.answer;
    const here = isActive(room, id);
    const delta = !here && pickIndex === null ? 0 : (right ? 1 : -1) * wager * VALUE;
    g.scores[id] = (g.scores[id] || 0) + delta;
    return { id, wager, pick: pickIndex, right, delta, here };
  });
  const top = Math.max(...g.order.filter((id) => isActive(room, id)).map((id) => g.scores[id] || 0));
  for (const r of rows) {
    r.top = (g.scores[r.id] || 0) === top;
    r.drinks = !r.right && !r.top && r.here ? r.wager : 0;
    if (r.drinks) owe(room, ctx, r.id, r.drinks, 'missed the Final');
  }
  g.finalResults = rows;
  ctx.log(room, `💡 The Final's answer: ${k.options[k.answer]}`);
  finish(room, ctx);
}

function finish(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.phase = 'over';
  const here = g.order.filter((id) => isActive(room, id));
  const top = Math.max(...here.map((id) => g.scores[id] || 0));
  g.winners = here.filter((id) => (g.scores[id] || 0) === top);
  const names = g.winners.map((id) => ctx.name(room, id)).join(' & ');
  if (names) ctx.log(room, `🏆 ${names} win${g.winners.length === 1 ? 's' : ''} Bool Jeopardy with $${top}`);
  if (g.winners.length === 1 && top > 0) ctx.highlight(room, 'jeopardyBest', g.winners[0], top, `🟦 ${names} won Bool Jeopardy with $${top}`);
}

// ---------- Bots ----------

// A bot "knows" a clue with a chance that's its skill, less for harder rows. It's the same answer
// however many times it's asked (lib/random.js steady): it only uses the right answer to act on
// that chance, never to see more than a player would.
function botAnswer(g, me, skill, options, answer, row, key) {
  const knows = steady(g.seed, me, key, 'knows') < skill * (1.1 - row * 0.1);
  if (knows) return answer;
  const wrongs = options.map((_, i) => i).filter((i) => i !== answer && !g.wrong?.includes(i));
  return wrongs[Math.floor(steady(g.seed, me, key, 'guess') * wrongs.length)] ?? answer;
}

// A bot's wager: bolder with skill, and when it's behind.
function botWager(g, me, skill) {
  const scores = Object.values(g.scores);
  const behind = (g.scores[me] || 0) < Math.max(0, ...scores) ? 0.2 : 0;
  return Math.max(1, Math.min(g.cap, Math.round(g.cap * (0.15 + 0.45 * skill * Math.random() + behind))));
}

// ---------- Module ----------

module.exports = {
  id: 'jeopardy',
  name: 'Bool Jeopardy',
  description: 'Vote on categories, pick a clue, race to buzz in. Wrong answers go on your tab, Shot Poker style.',
  rules: [
    'Vote for the categories: the top four make the board, plus a house category for the venue.',
    'The picker picks a clue; first to buzz in answers.',
    'Right: win the $ and pick next. Wrong: lose the $, and $200 a sip goes on your tab.',
    'A shot is a set number of sips. Every tab is settled before the next clue.',
    'Daily Double: wager sips. Final: everyone wagers; the leader drinks nothing.',
  ],
  minPlayers: 2,
  order: 14,
  bestWithTv: true,
  options: [
    { id: 'perShot', label: 'Sips in a shot', default: 5, choices: [3, 4, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'maxShots', label: 'Max shots on a tab', default: 2, choices: [1, 2, 3, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'final', label: 'Final round', default: true, choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  ],

  start(room, ctx, options = {}) {
    const o = optionValues(module.exports.options, options);
    const order = room.players.map((p) => p.id);
    Object.assign(room.game, {
      ...o, // perShot, maxShots, final
      cap: o.perShot * o.maxShots,
      order,
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      debts: {},
      pickerId: pick(order.filter((id) => isActive(room, id))) || order[0],
      // Pass and play (no clock on handing out sips: lib/context.js) passes one phone round for
      // the Final, so nobody's on a clock there either.
      relaxed: !ctx.giveMs,
      seed: Math.random().toString(36).slice(2, 8),
      clueNo: 0,
      pool: drawPool(room),
      house: drawHouse(room),
      votes: {},
      lockedIn: {},
      cats: null,
      clue: null,
      last: null,
      give: null,
      phase: 'vote',
    });
    if (!room.game.relaxed) ctx.setTimer(room, VOTE_MS, () => closeVote(room, ctx));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const here = isActive(room, me);
    const int = (v, lo, hi) => {
      const n = typeof v === 'number' ? v : /^-?\d+$/.test(String(v)) ? Number(v) : NaN;
      return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
    };

    if (action.type === 'paid') {
      if (g.debts[me] && !g.debts[me].paid) {
        g.debts[me].paid = true;
        ctx.log(room, `✅ ${player.name} settled their tab (${g.debts[me].text})`);
        maybeFinish(room, ctx);
      }
    } else if (g.phase === 'vote') {
      if (!here || g.lockedIn[me]) return;
      const mine = (g.votes[me] ||= []);
      if (action.type === 'toggle') {
        const i = int(action.i, 0, g.pool.length - 1);
        if (i === null) return;
        if (mine.includes(i)) mine.splice(mine.indexOf(i), 1);
        else if (mine.length < MAX_PICKS) mine.push(i);
      } else if (action.type === 'lockIn') {
        // A bot (or a phone) can send its picks with it: "3,0,7" or a list.
        if (action.picks != null) {
          const list = (Array.isArray(action.picks) ? action.picks : String(action.picks).split(',')).map((x) => int(x, 0, g.pool.length - 1));
          if (list.some((x) => x === null)) return;
          g.votes[me] = [...new Set(list)].slice(0, MAX_PICKS);
        }
        g.lockedIn[me] = true;
        if (ctx.connectedPlayers(room).every((p) => g.lockedIn[p.id])) closeVote(room, ctx);
      }
    } else if (action.type === 'pick' && g.phase === 'board' && me === g.pickerId) {
      const c = int(action.c, 0, COLS - 1);
      const r = int(action.r, 0, ROWS - 1);
      if (c === null || r === null || g.cats[c].clues[r].used || unpaid(room).length) return;
      pickClue(room, ctx, c, r);
    } else if (action.type === 'wager' && g.phase === 'ddWager' && me === g.pickerId) {
      const w = int(action.sips, 1, g.cap);
      if (w === null) return;
      g.clue.wager = w;
      g.phase = 'clue';
      g.stage = 'read';
      ctx.log(room, `💥 ${player.name} wagers ${shotText(w, g.perShot)}`);
      ctx.setTimer(room, READ_MS, () => openBuzzers(room, ctx));
    } else if (action.type === 'buzz' && g.phase === 'clue' && g.stage === 'open' && here && !g.locked.includes(me)) {
      // First in wins (the server takes them in the order they arrive); buzzing early does nothing.
      g.buzzerId = me;
      g.stage = 'answer';
      ctx.log(room, `🔔 ${player.name} buzzes in`);
      ctx.setTimer(room, ANSWER_MS, () => answered(room, ctx, me, null));
    } else if (action.type === 'answer' && g.phase === 'clue' && g.stage === 'answer' && me === g.buzzerId) {
      const i = int(action.i, 0, g.clue.options.length - 1);
      if (i === null || g.wrong.includes(i)) return;
      answered(room, ctx, me, i);
    } else if (action.type === 'give' && g.phase === 'reveal' && g.give?.from === me) {
      if (giving.give(room, ctx, me, action, g.give.sips, 'Daily Double')) {
        g.give = null;
        toBoard(room, ctx);
      }
    } else if (action.type === 'skipGive' && g.phase === 'reveal' && g.give && me === room.hostId) {
      autoGive(room, ctx, true);
    } else if (action.type === 'finalWager' && g.phase === 'finalWager' && here && !g.finalWagers[me]) {
      const w = int(action.sips, 1, g.cap);
      if (w === null) return;
      g.finalWagers[me] = w;
      if (!toWager(room).length) startFinalAnswer(room, ctx);
    } else if (action.type === 'finalAnswer' && g.phase === 'finalAnswer' && toAnswer(room).includes(me)) {
      const i = int(action.i, 0, g.finalClue.options.length - 1);
      if (i === null) return;
      g.finalAnswers[me] = i;
      if (!toAnswer(room).length) finishFinal(room, ctx);
    }
  },

  // Nobody who's left holds anything up. A buzzer who leaves mid-answer is out of that clue with
  // no drink and no $. (Timers lost to a restart are started again.)
  check(room, ctx) {
    const g = room.game;
    switch (g.phase) {
      case 'vote':
        if (ctx.connectedPlayers(room).length && ctx.connectedPlayers(room).every((p) => g.lockedIn[p.id])) closeVote(room, ctx);
        else if (!room.timer && !g.relaxed) ctx.setTimer(room, VOTE_MS, () => closeVote(room, ctx));
        break;
      case 'voted':
        if (!room.timer) toBoard(room, ctx);
        break;
      case 'board':
        ensurePicker(room);
        maybeFinish(room, ctx);
        break;
      case 'ddWager':
        if (!isActive(room, g.pickerId)) reveal(room, ctx);
        break;
      case 'clue':
        if (g.stage === 'answer' && !isActive(room, g.buzzerId)) answered(room, ctx, g.buzzerId, null, { left: true });
        else if (g.stage === 'open' && !canBuzz(room).length) reveal(room, ctx);
        else if (!room.timer) {
          if (g.stage === 'answer') ctx.setTimer(room, ANSWER_MS, () => answered(room, ctx, g.buzzerId, null));
          else if (g.stage === 'open') ctx.setTimer(room, BUZZ_MS, () => reveal(room, ctx));
          else ctx.setTimer(room, READ_MS, () => openBuzzers(room, ctx));
        }
        break;
      case 'reveal':
        if (g.give && !isActive(room, g.give.from)) toBoard(room, ctx);
        else if (!room.timer && g.give) giveClock(room, ctx);
        else if (!room.timer && !g.give) toBoard(room, ctx);
        break;
      case 'finalWager':
        if (ctx.connectedPlayers(room).length && !toWager(room).length) startFinalAnswer(room, ctx);
        else if (!room.timer && !g.relaxed) ctx.setTimer(room, FINAL_WAGER_MS, () => closeWagers(room, ctx));
        break;
      case 'finalAnswer':
        if (!toAnswer(room).length) finishFinal(room, ctx);
        else if (!room.timer && !g.relaxed) ctx.setTimer(room, FINAL_ANSWER_MS, () => finishFinal(room, ctx));
        break;
      default:
    }
  },

  // Late joiners play from $0 (and vote, if the vote's still on).
  onJoin(room, player) {
    const g = room.game;
    if (!g.order.includes(player.id)) g.order.push(player.id);
    g.scores[player.id] ??= 0;
  },

  // Everyone still to vote; whoever has a tab to settle, else the picker; the Daily Double's
  // player; the buzzer once someone's in (while the buzzers are open it's anyone's: nobody); the
  // Daily Double winner handing out; everyone still to wager or answer in the Final.
  waitingOn(room) {
    const g = room.game;
    const here = room.players.filter((p) => p.connected).map((p) => p.id);
    switch (g.phase) {
      case 'vote': return here.filter((id) => !g.lockedIn[id]);
      case 'board': {
        const debts = unpaid(room);
        if (debts.length) return debts;
        return cellsLeft(g) && here.includes(g.pickerId) ? [g.pickerId] : [];
      }
      case 'ddWager': return here.includes(g.pickerId) ? [g.pickerId] : [];
      case 'clue': return g.stage === 'answer' && here.includes(g.buzzerId) ? [g.buzzerId] : [];
      case 'reveal': return g.give && here.includes(g.give.from) ? [g.give.from] : [];
      case 'finalWager': return toWager(room);
      case 'finalAnswer': return toAnswer(room);
      default: return [];
    }
  },

  bot(room, me, ctx, skill) {
    const g = room.game;
    const id = me.id;
    // Tabs are paid straight away.
    if (g.debts[id] && !g.debts[id].paid) return { type: 'paid' };
    switch (g.phase) {
      case 'vote': {
        if (g.lockedIn[id]) return null;
        const n = 2 + Math.floor(Math.random() * (MAX_PICKS - 1));
        return { type: 'lockIn', picks: shuffle(g.pool.map((_, i) => i)).slice(0, n).join(','), delay: 2000 + Math.random() * 5000 };
      }
      case 'board': {
        if (id !== g.pickerId || unpaid(room).length) return null;
        const open = [];
        g.cats.forEach((cat, c) => cat.clues.forEach((x, r) => !x.used && open.push({ c, r })));
        const cell = pick(open);
        return cell ? { type: 'pick', ...cell } : null;
      }
      case 'ddWager':
        return id === g.pickerId ? { type: 'wager', sips: botWager(g, id, skill) } : null;
      case 'clue': {
        if (g.stage === 'open' && !g.locked.includes(id)) {
          // Not every clue: the same yes or no however often it's asked (a fresh one after a miss).
          const key = `${g.clueNo}:${g.locked.length}`;
          if (steady(g.seed, id, key, 'buzz') >= 0.4 + 0.5 * skill) return null;
          return { type: 'buzz', delay: 1200 + (1 - skill) * 2000 + steady(g.seed, id, key, 'fast') * 800 };
        }
        if (g.stage === 'answer' && g.buzzerId === id) {
          const i = botAnswer(g, id, skill, g.clue.options, g.clue.answer, g.clue.r, `${g.clueNo}`);
          return { type: 'answer', i, delay: 1500 + Math.random() * 2500 };
        }
        return null;
      }
      case 'reveal': {
        if (g.give?.from !== id) return null;
        const targetId = pickHuman(room, id);
        return targetId && { type: 'give', targetId };
      }
      case 'finalWager':
        return g.finalWagers[id] ? null : { type: 'finalWager', sips: botWager(g, id, skill), delay: 2000 + Math.random() * 4000 };
      case 'finalAnswer':
        if (!g.finalWagers[id] || g.finalAnswers[id] !== undefined) return null;
        return { type: 'finalAnswer', i: botAnswer(g, id, skill, g.finalClue.options, g.finalClue.answer, 3, 'final'), delay: 3000 + Math.random() * 6000 };
      default:
        return null;
    }
  },

  view(room, player) {
    const g = room.game;
    const me = player.id;
    const k = g.clue;
    const onClue = (g.phase === 'clue' || g.phase === 'reveal' || g.phase === 'ddWager') && k;
    const revealed = g.phase === 'reveal';
    const finalPhase = g.phase === 'finalWager' || g.phase === 'finalAnswer' || (g.phase === 'over' && g.finalResults);
    const fc = g.finalClue;
    return {
      perShot: g.perShot,
      maxShots: g.maxShots,
      cap: g.cap,
      final: g.final,
      relaxed: g.relaxed,
      order: g.order,
      scores: g.scores,
      pickerId: g.pickerId,
      stage: g.stage || null,
      clueNo: g.clueNo,
      maxPicks: MAX_PICKS,
      // The vote: the categories, and how many votes each has (not who voted for what).
      vote: g.phase === 'vote' || g.phase === 'voted' ? {
        pool: g.pool.map((i) => CATEGORIES[i].name),
        house: { name: houseCat(g).name, emoji: VENUES[g.house.venue].emoji },
        voted: VOTED,
        counts: g.phase === 'voted' ? g.counts : tally(g),
        mine: g.votes[me] || [],
        lockedIn: Object.keys(g.lockedIn).filter((id) => isActive(room, id)),
        chosen: g.phase === 'voted' ? g.chosen : null,
      } : null,
      board: g.cats ? g.cats.map((c) => ({ name: c.name, emoji: c.emoji, cells: c.clues.map((x) => ({ value: x.value, used: x.used })) })) : null,
      left: cellsLeft(g),
      // The clue in play. The Daily Double's question stays hidden until the wager's in; the
      // options show once someone's buzzed in; the answer only at the reveal.
      clue: onClue ? {
        c: k.c,
        r: k.r,
        cat: k.cat,
        value: k.value,
        sips: k.sips,
        dd: k.dd,
        wager: k.wager,
        q: g.phase === 'ddWager' ? null : k.q,
        options: g.stage === 'answer' || g.results.length || revealed ? k.options : null,
        answer: revealed ? k.answer : null,
        buzzerId: g.buzzerId,
        locked: g.locked,
        wrong: g.wrong,
        results: g.results,
      } : null,
      last: g.last,
      give: g.give,
      debts: g.debts,
      unpaid: unpaid(room),
      // The Final: the category first, then the clue; your own wager and answer; everyone's at the end.
      finalRound: finalPhase ? {
        cat: fc.cat,
        q: g.phase === 'finalWager' ? null : fc.q,
        options: g.phase === 'finalWager' ? null : fc.options,
        answer: g.phase === 'over' ? fc.answer : null,
        wagered: Object.keys(g.finalWagers || {}),
        answered: Object.keys(g.finalAnswers || {}),
        myWager: g.finalWagers?.[me] ?? null,
        myAnswer: g.finalAnswers?.[me] ?? null,
        results: g.phase === 'over' ? g.finalResults : null,
      } : null,
      winners: g.phase === 'over' ? g.winners : null,
    };
  },

  CATEGORIES,
  VENUES,
  venueOf,
  VALUE,
  __buildBoard: buildBoard, // (for the tests)
};
