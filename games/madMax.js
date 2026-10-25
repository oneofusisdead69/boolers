// Mad Max: a card game of calls and wars. Last player holding cards wins.
//
// The decks are dealt face down; one card starts the pile. On your turn you call how your next
// card compares with the top of the pile (same/different colour, higher/lower, or the suit), then
// flip it onto the pile. Right: play passes on. Wrong: drink (2 sips for a wrong suit) and go again.
//
// War:
//   Same number as the card before: automatic war. The flipper picks an opponent.
//   One higher/lower, or a sandwich (matches the card two plays back): anyone may challenge the
//   flipper, even players who are out of cards. The chance stays open until everyone else has
//   either called war or tapped ✕ to pass.
// Others with cards can join as extra challengers until the lead challenger sets the terms:
// high/low (the only choice with several challengers) or same/different colour. Everyone lays out
// 3 cards and the challenged player calls each round. Most rounds wins; ties go to a called
// tiebreak card. The winner takes the war cards (and the pile, if that option is on) and starts a
// new pile. Anyone who wins no rounds finishes their drink.
// Short of cards for a war? Top up at random from the pile, or, when winners take the pile, from
// the player with the most cards. A short player who wins gives that many cards back.
// Final battle (option): when two players are left, a 5-card war for everything. The two take
// turns calling the rounds.

const { newDeck, shuffle, color } = require('../lib/cards');
const { pick } = require('../lib/random');
const { optionValues } = require('../lib/options');
const { isActive } = require('../lib/turns');

const WAR_CARDS = 3;
const FINAL_CARDS = 5;
const SUITS = ['S', 'H', 'D', 'C'];
const CALLS = ['same', 'different', 'higher', 'lower', ...SUITS];
const CALL_NAMES = {
  same: 'same color', different: 'different color', higher: 'higher', lower: 'lower',
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
  high: 'highest wins', low: 'lowest wins',
};
const RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT_SYMBOLS = { S: '♠\uFE0E', H: '♥\uFE0E', D: '♦\uFE0E', C: '♣\uFE0E' };
const cardName = (c) => `${RANKS[c.rank] || c.rank}${SUIT_SYMBOLS[c.suit]}`;

// ---------- Helpers ----------

// Only real hands count (not "constructor" and other built-in names a phone could send).
const count = (g, id) => (Object.hasOwn(g.hands, id) ? g.hands[id].length : 0);
const top = (g, back = 0) => g.run[g.run.length - 1 - back] || null;

// Players still holding cards, in seat order.
function holders(room, g) {
  return g.order.filter((id) => count(g, id) > 0 && room.players.some((p) => p.id === id));
}

// Next player after `fromId` who still has cards (preferring connected players).
function nextTurn(room, ctx, g, fromId) {
  const active = holders(room, g);
  const connected = active.filter((id) => ctx.turns.isActive(room, id));
  const pool = connected.length ? connected : active;
  const start = g.order.indexOf(fromId);
  for (let step = 1; step <= g.order.length; step++) {
    const id = g.order[(start + step) % g.order.length];
    if (pool.includes(id)) return id;
  }
  return pool[0] || null;
}

function takeRandom(cards, n) {
  const taken = [];
  for (let i = 0; i < n && cards.length; i++) taken.push(...cards.splice(Math.floor(Math.random() * cards.length), 1));
  return taken;
}

function callIsRight(call, card, prev) {
  switch (call) {
    case 'same': return color(card) === color(prev);
    case 'different': return color(card) !== color(prev);
    case 'higher': return card.rank > prev.rank;
    case 'lower': return card.rank < prev.rank;
    default: return card.suit === call;
  }
}

// ---------- Turn flow ----------

function startTurn(room, ctx, id) {
  const g = room.game;
  ctx.clearTimer(room);
  g.turnId = id;
  g.phase = 'call';
}

// Game over, or the final battle, once few enough players hold cards. Returns true if so.
function checkEnd(room, ctx) {
  const g = room.game;
  const active = holders(room, g);
  if (active.length <= 1) {
    ctx.clearTimer(room);
    g.phase = 'over';
    g.winnerId = active[0] || null;
    if (g.winnerId) ctx.log(room, `🏆 ${ctx.name(room, g.winnerId)} wins Mad Max!`);
    return true;
  }
  if (active.length === 2 && g.finalBattle && !g.finalDone) {
    g.finalDone = true;
    // The player with fewer cards challenges and sets the terms.
    const [a, b] = active;
    const challenger = count(g, a) <= count(g, b) ? a : b;
    ctx.log(room, '⚔️ Final battle! 5 cards, winner takes all');
    startWar(room, ctx, [challenger], challenger === a ? b : a, { final: true });
    return true;
  }
  return false;
}

// Applies the call once no war came of the flip.
function resolveCall(room, ctx) {
  const g = room.game;
  const f = g.lastFlip;
  ctx.clearTimer(room);
  if (f.right) {
    if (!checkEnd(room, ctx)) startTurn(room, ctx, nextTurn(room, ctx, g, f.by));
    return;
  }
  const isSuit = SUITS.includes(f.call);
  ctx.drink(room, f.by, isSuit ? 2 : 1, `wrong call: ${CALL_NAMES[f.call]}`);
  if (checkEnd(room, ctx)) return;
  if (count(g, f.by) > 0) startTurn(room, ctx, f.by); // go again
  else {
    ctx.log(room, `💀 ${ctx.name(room, f.by)} is out of cards`);
    startTurn(room, ctx, nextTurn(room, ctx, g, f.by));
  }
}

function flip(room, ctx, player, call) {
  const g = room.game;
  const card = g.hands[player.id].shift();
  const prev = top(g);
  const before = top(g, 1);
  g.pile.push(card);
  g.run.push(card);
  const right = callIsRight(call, card, prev);
  g.lastFlip = { by: player.id, call, card, prev, right };

  if (card.rank === prev.rank) {
    ctx.log(room, `⚔️ ${player.name} flipped ${cardName(card)} on ${cardName(prev)}. Same number: WAR!`);
    if (holders(room, g).some((id) => id !== player.id)) {
      g.phase = 'pick';
      return;
    }
  } else if (Math.abs(card.rank - prev.rank) === 1 || (before && card.rank === before.rank)) {
    g.lastFlip.chance = Math.abs(card.rank - prev.rank) === 1 ? 'one off' : 'sandwich';
    g.phase = 'challenge';
    g.passed = [];
    return;
  }
  resolveCall(room, ctx);
}

// The war chance closes once every other connected player has passed.
function checkChallenge(room, ctx) {
  const g = room.game;
  const waiting = room.players.filter((p) => p.connected && p.id !== g.lastFlip.by && !g.passed.includes(p.id));
  if (waiting.length === 0) resolveCall(room, ctx);
}

// ---------- War ----------

function startWar(room, ctx, challengers, challengedId, { final = false } = {}) {
  const g = room.game;
  ctx.clearTimer(room);
  g.phase = 'terms';
  g.war = {
    challengers,
    challengedId,
    final,
    size: final ? FINAL_CARDS : WAR_CARDS,
    terms: null,
    cards: {}, // id -> cards laid out, in round order
    borrowed: {}, // id -> { n, from } where from is a player id or 'pile'
    rounds: [], // { call, cards: {id: card}, winnerId, tiebreak }
    inRound: [],
    callerId: challengedId,
    winnerId: null,
  };
}

const warPlayers = (w) => [w.challengedId, ...w.challengers];

// Takes n cards for the war from a player's hand, topping up from the pile or the biggest stack.
function layOut(room, ctx, id, n) {
  const g = room.game;
  const w = g.war;
  const cards = g.hands[id].splice(0, n);
  const missing = n - cards.length;
  if (missing > 0) {
    let from = 'pile';
    let got = [];
    if (!g.takePile && g.pile.length) got = takeRandom(g.pile, missing);
    if (got.length < missing) {
      const supplier = g.order
        .filter((pid) => pid !== id && count(g, pid) > 0)
        .sort((a, b) => count(g, b) - count(g, a))[0];
      if (supplier) {
        from = got.length ? from : supplier;
        got.push(...takeRandom(g.hands[supplier], missing - got.length));
      }
    }
    // Nobody else has a card either (everyone's in the war with empty hands): then it comes from the
    // pile after all, even when the winner's due to take it.
    if (got.length < missing && g.pile.length) {
      if (!got.length) from = 'pile';
      got.push(...takeRandom(g.pile, missing - got.length));
    }
    if (got.length) {
      const prev = w.borrowed[id];
      w.borrowed[id] = { n: (prev?.n || 0) + got.length, from: prev?.from || from };
      ctx.log(room, `🃏 ${ctx.name(room, id)} borrows ${got.length} card${got.length === 1 ? '' : 's'} from ${from === 'pile' ? 'the pile' : ctx.name(room, from)}`);
    }
    cards.push(...got);
  }
  (w.cards[id] ||= []).push(...cards);
}

function setTerms(room, ctx, terms) {
  const g = room.game;
  const w = g.war;
  w.terms = terms;
  for (const id of warPlayers(w)) layOut(room, ctx, id, w.size);
  w.inRound = warPlayers(w);
  w.callerId = w.challengedId;
  g.phase = 'war';
}

// The cards each player in the round turns over now.
function roundCards(w) {
  const r = w.rounds.length;
  const cards = {};
  for (const id of w.inRound) {
    const tiebreakIdx = w.size + w.rounds.filter((x) => x.tiebreak).length;
    cards[id] = w.cards[id][w.rounds.length < w.size ? r : tiebreakIdx] || null;
  }
  return cards;
}

function playRound(room, ctx, call) {
  const g = room.game;
  const w = g.war;
  const tiebreak = w.rounds.length >= w.size;
  const cards = roundCards(w);
  let winnerId = null;
  if (w.terms === 'color') {
    // One on one: a right call wins the round for whoever made it.
    const caller = w.callerId;
    const other = warPlayers(w).find((id) => id !== caller);
    const mine = cards[caller];
    const theirs = cards[other];
    if (!mine) winnerId = other;
    else if (!theirs) winnerId = caller;
    else winnerId = (call === 'same') === (color(mine) === color(theirs)) ? caller : other;
  } else {
    const played = Object.entries(cards).filter(([, c]) => c);
    const ranks = played.map(([, c]) => c.rank);
    const best = call === 'high' ? Math.max(...ranks) : Math.min(...ranks);
    const leaders = played.filter(([, c]) => c.rank === best);
    if (leaders.length === 1) winnerId = leaders[0][0];
  }
  w.rounds.push({ call, cards, winnerId, tiebreak, players: [...w.inRound], callerId: w.callerId });
  // In the final battle the two players take turns calling.
  const nextCaller = w.final ? warPlayers(w).find((id) => id !== w.callerId) : w.callerId;

  // After the last regular round (or a tiebreak), see who has the most round wins.
  if (w.rounds.length < w.size) {
    w.callerId = nextCaller;
    return;
  }
  const wins = winsFor(w);
  const most = Math.max(...warPlayers(w).map((id) => wins[id]));
  const leaders = warPlayers(w).filter((id) => wins[id] === most);
  if (leaders.length === 1) return finishWar(room, ctx, leaders[0]);

  // Tiebreak: the tied players each lay out one more card and play a called round.
  w.inRound = leaders;
  w.callerId = w.final ? nextCaller : leaders.includes(w.challengedId) ? w.challengedId : leaders[0];
  for (const id of leaders) layOut(room, ctx, id, 1);
  ctx.log(room, `🤝 The war is tied. Tiebreak between ${leaders.map((id) => ctx.name(room, id)).join(' and ')}`);
}

function winsFor(w) {
  const wins = Object.fromEntries(warPlayers(w).map((id) => [id, 0]));
  for (const r of w.rounds) if (r.winnerId) wins[r.winnerId] += 1;
  return wins;
}

function finishWar(room, ctx, winnerId) {
  const g = room.game;
  const w = g.war;
  w.winnerId = winnerId;
  const spoils = Object.values(w.cards).flat().filter(Boolean);
  const winnings = shuffle(spoils);
  w.cardsWon = winnings.length;
  if (g.takePile || w.final) {
    w.pileWon = g.pile.length;
    winnings.push(...g.pile);
    g.pile = [];
  }
  if (w.final) {
    // Winner takes all.
    for (const id of g.order) if (id !== winnerId) winnings.push(...g.hands[id].splice(0));
  }
  g.hands[winnerId].push(...shuffle(winnings));

  // A short winner gives back what they borrowed (not in the final battle: winner takes all).
  const debt = w.borrowed[winnerId];
  if (debt && !w.final) {
    const back = takeRandom(g.hands[winnerId], debt.n);
    if (debt.from === 'pile') g.pile.push(...back);
    else g.hands[debt.from].push(...back);
    w.paidBack = back.length;
  }

  const wins = winsFor(w);
  ctx.log(room, `🏅 ${ctx.name(room, winnerId)} wins the war (${wins[winnerId]} of ${w.rounds.length})`);
  w.outright = warPlayers(w).filter((id) => id !== winnerId && wins[id] === 0);
  for (const id of w.outright) ctx.finishDrink(room, id, 'lost a war without winning a round');

  if (w.final) {
    g.phase = 'over';
    g.winnerId = winnerId;
    ctx.log(room, `🏆 ${ctx.name(room, winnerId)} wins Mad Max!`);
    return;
  }
  if (holders(room, g).length <= 1) {
    checkEnd(room, ctx);
    return;
  }
  g.phase = 'warResult';
}

// The war winner lays the first card of a new pile, then play carries on after them.
function startPile(room, ctx) {
  const g = room.game;
  const winnerId = g.war.winnerId;
  const card = g.hands[winnerId].shift();
  g.pile.push(card);
  g.run = [card];
  g.lastFlip = null;
  g.war = null;
  ctx.log(room, `🃏 ${ctx.name(room, winnerId)} starts a new pile with ${cardName(card)}`);
  if (!checkEnd(room, ctx)) startTurn(room, ctx, nextTurn(room, ctx, g, winnerId));
}

// ---------- Bots ----------

// The call most likely to be right against the top card, from what's face up: the cards played
// on this pile are gone, the rest (hands and the pile underneath) could be anything. Suits are
// right a quarter of the time and cost double, so they're never the best call.
function bestCall(g) {
  const prev = top(g);
  const left = newDeck({ decks: g.decks });
  for (const c of g.run) {
    const i = left.findIndex((x) => x.rank === c.rank && x.suit === c.suit);
    if (i >= 0) left.splice(i, 1);
  }
  const odds = ['same', 'different', 'higher', 'lower'].map((call) => ({
    call,
    p: left.filter((c) => callIsRight(call, c, prev)).length,
  }));
  return odds.reduce((best, o) => (o.p > best.p ? o : best)).call;
}

// Wars are coin flips: even on cards, but a chance to swing. The player behind wants that chance;
// the one ahead doesn't. An out player has nothing to lose but a drink.
const wantsWar = (g, me, rivalId) => count(g, me) === 0 || count(g, me) < count(g, rivalId);

function bot(room, me, ctx, skill) {
  const g = room.game;
  const w = g.war;
  const id = me.id;
  const smart = Math.random() < skill;

  if (g.phase === 'call' && id === g.turnId && count(g, id) > 0) {
    return { type: 'call', call: smart ? bestCall(g) : pick(CALLS) };
  }
  if (g.phase === 'challenge' && id !== g.lastFlip.by && !g.passed.includes(id)) {
    const war = smart ? wantsWar(g, id, g.lastFlip.by) : Math.random() < 0.4;
    return { type: war ? 'war' : 'pass' };
  }
  if (g.phase === 'pick' && id === g.lastFlip.by) {
    const targets = holders(room, g).filter((pid) => pid !== id);
    if (!targets.length) return null;
    // A good bot takes on the leader: winning hurts the biggest stack most.
    const leader = targets.reduce((a, b) => (count(g, b) > count(g, a) ? b : a));
    return { type: 'pick', targetId: smart ? leader : pick(targets) };
  }
  if (g.phase === 'terms') {
    if (id === w.challengers[0]) {
      // Every round is a blind call either way; high/low is always allowed.
      const terms = w.challengers.length > 1 || smart ? 'high' : pick(['high', 'color']);
      return { type: 'terms', terms };
    }
    if (!w.final && !warPlayers(w).includes(id) && count(g, id) > 0) {
      // Join when behind everyone in it (a good bot); a bad one sometimes piles in anyway.
      const behind = warPlayers(w).every((pid) => count(g, id) < count(g, pid));
      if (smart ? behind : Math.random() < 0.25) return { type: 'join', delay: 500 + Math.random() * 800 };
    }
    return null;
  }
  // The laid-out cards are face down: any call is a guess.
  if (g.phase === 'war' && id === w.callerId) {
    return { type: 'warCall', call: pick(w.terms === 'color' ? ['same', 'different'] : ['high', 'low']) };
  }
  if (g.phase === 'warResult' && id === w.winnerId) return { type: 'startPile' };
  return null;
}

// ---------- Module ----------

module.exports = {
  id: 'madMax',
  name: 'Mad Max',
  description: 'Call your next card. Wrong calls drink. Same numbers mean war. Last one holding cards wins.',
  // A reminder of the rules, shown on the TV.
  rules: [
    "Call your next card against the pile: colour, higher/lower, or the suit.",
    "Wrong: drink (2 for a wrong suit) and go again.",
    "Same number: WAR. One off or a sandwich: anyone can call war.",
    "Win no rounds in a war? Finish your drink.",
    "Last one holding cards wins.",
  ],
  minPlayers: 2,
  order: 3,
  options: [
    { id: 'decks', label: 'Decks', default: 1, choices: [1, 2, 3].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'takePile', label: 'War winner takes the pile', default: false, choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
    { id: 'finalBattle', label: 'Final battle (5-card war for the last two)', default: true, choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  ],

  start(room, ctx, options = {}) {
    const o = optionValues(module.exports.options, options);
    const order = room.players.map((p) => p.id);
    const deck = newDeck({ decks: o.decks });
    const first = deck.pop();
    const each = Math.floor(deck.length / order.length);
    const hands = Object.fromEntries(order.map((id) => [id, deck.splice(0, each)]));
    Object.assign(room.game, {
      order,
      hands,
      pile: [...deck, first], // leftovers sit under the starting card
      run: [first], // cards played since this pile started, for comparisons
      ...o, // decks, takePile, finalBattle
      finalDone: false,
      lastFlip: null,
      war: null,
      winnerId: null,
    });
    startTurn(room, ctx, order[0]);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const w = g.war;
    const me = player.id;

    if (action.type === 'call' && g.phase === 'call' && me === g.turnId && CALLS.includes(action.call) && count(g, me) > 0) {
      flip(room, ctx, player, action.call);
    } else if (action.type === 'pass' && g.phase === 'challenge' && me !== g.lastFlip.by && !g.passed.includes(me)) {
      g.passed.push(me);
      checkChallenge(room, ctx);
    } else if (action.type === 'war' && g.phase === 'challenge' && me !== g.lastFlip.by && !g.passed.includes(me)) {
      // Anyone, even a player who is out of cards, may challenge.
      ctx.log(room, `⚔️ ${player.name} challenges ${ctx.name(room, g.lastFlip.by)} to WAR!`);
      startWar(room, ctx, [me], g.lastFlip.by);
    } else if (action.type === 'pick' && g.phase === 'pick' && me === g.lastFlip.by) {
      const target = action.targetId;
      if (target === me || count(g, target) === 0) return;
      ctx.log(room, `⚔️ ${player.name} goes to war with ${ctx.name(room, target)}`);
      startWar(room, ctx, [me], target);
    } else if (action.type === 'join' && g.phase === 'terms' && !w.final && !warPlayers(w).includes(me) && count(g, me) > 0) {
      w.challengers.push(me);
      ctx.log(room, `⚔️ ${player.name} joins the war`);
    } else if (action.type === 'terms' && g.phase === 'terms' && me === w.challengers[0]) {
      if (action.terms !== 'high' && action.terms !== 'color') return;
      if (action.terms === 'color' && w.challengers.length > 1) return; // several challengers: high/low only
      setTerms(room, ctx, action.terms);
    } else if (action.type === 'warCall' && g.phase === 'war' && me === w.callerId) {
      const allowed = w.terms === 'color' ? ['same', 'different'] : ['high', 'low'];
      if (!allowed.includes(action.call)) return;
      playRound(room, ctx, action.call);
    } else if (action.type === 'startPile' && g.phase === 'warResult' && me === w.winnerId) {
      startPile(room, ctx);
    }
  },

  // If the player whose turn it is drops out, play moves on; a dropped phone never holds up a
  // war chance.
  check(room, ctx) {
    const g = room.game;
    const w = g.war;
    const away = (id) => !ctx.turns.isActive(room, id);
    // Whoever has to decide something in a war has gone: it's decided for them.
    if (g.phase === 'pick' && away(g.lastFlip.by)) {
      const targets = holders(room, g).filter((id) => id !== g.lastFlip.by && !away(id));
      if (targets.length) startWar(room, ctx, [g.lastFlip.by], pick(targets));
      else startPile(room, ctx);
    } else if (g.phase === 'terms' && away(w.challengers[0])) {
      setTerms(room, ctx, 'high');
    } else if (g.phase === 'war' && away(w.callerId)) {
      playRound(room, ctx, pick(w.terms === 'color' ? ['same', 'different'] : ['high', 'low']));
    } else if (g.phase === 'warResult' && away(w.winnerId)) {
      startPile(room, ctx);
    }
    if (g.phase === 'challenge') checkChallenge(room, ctx);
    if (g.phase === 'call' && !ctx.turns.isActive(room, g.turnId)) {
      const next = nextTurn(room, ctx, g, g.turnId);
      if (next && next !== g.turnId) startTurn(room, ctx, next);
    }
  },

  // Whoever has to call, pick or decide in a war; after a one-off or a sandwich, everyone else
  // here who hasn't passed or called war. (Joining a war is up to anyone with cards: it isn't
  // waited on.)
  waitingOn(room) {
    const g = room.game;
    const w = g.war;
    if (g.phase === 'challenge') return room.players.filter((p) => p.connected && p.id !== g.lastFlip.by && !g.passed.includes(p.id)).map((p) => p.id);
    const id = { call: g.turnId, pick: g.lastFlip?.by, terms: w?.challengers[0], war: w?.callerId, warResult: w?.winnerId }[g.phase];
    return id && isActive(room, id) ? [id] : [];
  },

  onJoin(room, player) {
    const g = room.game;
    g.order.push(player.id);
    g.hands[player.id] = []; // joins out of cards; can still call optional wars
  },

  view(room, player) {
    const g = room.game;
    const w = g.war;
    const me = player.id;
    let war = null;
    if (w) {
      const wins = winsFor(w);
      // Laid-out cards stay face down until their round is played.
      const laid = Object.fromEntries(warPlayers(w).map((id) => [id, (w.cards[id] || []).length]));
      war = {
        challengers: w.challengers,
        challengedId: w.challengedId,
        final: w.final,
        size: w.size,
        terms: w.terms,
        rounds: w.rounds,
        inRound: w.inRound,
        callerId: w.callerId,
        wins,
        laid,
        borrowed: w.borrowed,
        winnerId: w.winnerId,
        cardsWon: w.cardsWon,
        pileWon: w.pileWon,
        paidBack: w.paidBack,
        outright: w.outright,
        canJoin: g.phase === 'terms' && !w.final && !warPlayers(w).includes(me) && count(g, me) > 0,
      };
    }
    return {
      turnId: g.turnId,
      counts: Object.fromEntries(g.order.map((id) => [id, count(g, id)])),
      top: top(g),
      prev: top(g, 1),
      prev2: top(g, 2),
      pileSize: g.pile.length,
      lastFlip: g.lastFlip,
      passed: g.phase === 'challenge' ? g.passed : [],
      canChallenge: g.phase === 'challenge' && me !== g.lastFlip?.by && !g.passed.includes(me),
      pickable: g.phase === 'pick' ? holders(room, g).filter((id) => id !== g.lastFlip.by) : [],
      war,
      winnerId: g.winnerId,
      takePile: g.takePile,
      finalBattle: g.finalBattle,
    };
  },

  bot,

  callIsRight,
};
