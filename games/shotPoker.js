// Shot Poker: Texas Hold'em where you bet sips. Everyone antes, gets two private cards, and bets
// through the flop, turn and river. Fold and you drink everything you've put in so far. At the
// showdown the best hand drinks nothing; everyone else who stayed in drinks what they put in.
//
// A set number of sips makes a shot (usually 5), and nobody can put in more than the max shots in
// one hand. Owe a whole shot or more and you tap ☠️🥃 once it's down: all debts must be paid
// before the next hand is dealt.
//
// There are no chip stacks: everyone can always cover a bet up to the cap, so there are no side
// pots.

const { newDeck, draw } = require('../lib/cards');

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const SINGLE = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack' };
const PLURAL = { 14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 6: 'Sixes' };
const one = (r) => SINGLE[r] || String(r);
const many = (r) => PLURAL[r] || `${r}s`;

// ---------- Hand ranking ----------

// Scores five cards as [category, ...tiebreakers]; a higher score (compared left to right) wins.
// Categories: 8 straight flush, 7 four of a kind, 6 full house, 5 flush, 4 straight, 3 three of a
// kind, 2 two pair, 1 pair, 0 high card.
function score5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const distinct = [...new Set(ranks)];
  let straight = 0;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straight = distinct[0];
    else if (distinct.join() === '14,5,4,3,2') straight = 5; // the wheel: A-2-3-4-5
  }
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  // [count, rank] groups, biggest group first, then highest rank.
  const groups = Object.entries(counts).map(([r, n]) => [n, Number(r)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kickers = (...skip) => ranks.filter((r) => !skip.includes(r));

  if (straight && flush) return [8, straight];
  if (groups[0][0] === 4) return [7, groups[0][1], ...kickers(groups[0][1])];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][0] === 3) return [3, groups[0][1], ...kickers(groups[0][1])];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, groups[0][1], groups[1][1], ...kickers(groups[0][1], groups[1][1])];
  if (groups[0][0] === 2) return [1, groups[0][1], ...kickers(groups[0][1])];
  return [0, ...ranks];
}

function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

// The best five of any number of cards (two in your hand plus up to five on the table).
function bestHand(cards) {
  let best = null;
  const pick = (start, chosen) => {
    if (chosen.length === 5) {
      const score = score5(chosen);
      if (!best || compare(score, best.score) > 0) best = { score, cards: chosen };
      return;
    }
    for (let i = start; i <= cards.length - (5 - chosen.length); i++) pick(i + 1, [...chosen, cards[i]]);
  };
  pick(0, []);
  return best;
}

function handName(score) {
  const [cat, a, b] = score;
  switch (cat) {
    case 8: return a === 14 ? 'Royal flush' : `Straight flush, ${one(a)} high`;
    case 7: return `Four ${many(a)}`;
    case 6: return `Full house, ${many(a)} over ${many(b)}`;
    case 5: return `Flush, ${one(a)} high`;
    case 4: return `Straight, ${one(a)} high`;
    case 3: return `Three ${many(a)}`;
    case 2: return `Two pair, ${many(a)} and ${many(b)}`;
    case 1: return `Pair of ${many(a)}`;
    default: return `${one(a)} high`;
  }
}

// "8 sips" → "1 shot + 3 sips" (with 5 sips a shot).
function shotText(sips, perShot) {
  const shots = Math.floor(sips / perShot);
  const rest = sips % perShot;
  const parts = [];
  if (shots) parts.push(`${shots} shot${shots === 1 ? '' : 's'}`);
  if (rest || !shots) parts.push(`${rest} sip${rest === 1 ? '' : 's'}`);
  return parts.join(' + ');
}

// ---------- Hand flow ----------

const alive = (g) => g.order.filter((id) => g.inHand[id] && !g.folded[id]);
const capped = (g, id) => g.committed[id] >= g.cap;

// The next player after `from` (round the table) who still has to act this street.
function nextActor(g, from) {
  const start = g.order.indexOf(from);
  for (let step = 1; step <= g.order.length; step++) {
    const id = g.order[(start + step) % g.order.length];
    if (g.toAct.includes(id)) return id;
  }
  return null;
}

function startHand(room, ctx) {
  const g = room.game;
  g.hand += 1;
  // Everyone here and connected plays; anyone who joined mid-hand is dealt in now.
  const playing = g.order.filter((id) => ctx.turns.isActive(room, id));
  g.dealerId = ctx.turns.next(room, playing, g.dealerId) || playing[0];
  g.deck = newDeck();
  g.community = [];
  g.street = 'preflop';
  g.inHand = {};
  g.folded = {};
  g.committed = {};
  g.roundBet = {};
  g.last = {};
  g.hands = {};
  g.debts = {};
  g.result = null;
  for (const id of playing) {
    g.inHand[id] = true;
    g.committed[id] = g.ante;
    g.roundBet[id] = 0;
    g.hands[id] = [draw(g.deck), draw(g.deck)];
  }
  g.currentBet = 0;
  g.phase = 'betting';
  if (g.ante) ctx.log(room, `🃏 Hand ${g.hand}: everyone antes ${g.ante} sip${g.ante === 1 ? '' : 's'}`);
  else ctx.log(room, `🃏 Hand ${g.hand}`);
  startStreet(room, ctx, false);
}

// Opens betting on the current street, or deals on through if nobody can bet.
function startStreet(room, ctx, deal = true) {
  const g = room.game;
  if (deal) {
    g.street = STREETS[STREETS.indexOf(g.street) + 1];
    const n = g.street === 'flop' ? 3 : 1;
    draw(g.deck); // burn
    for (let i = 0; i < n; i++) g.community.push(draw(g.deck));
    for (const id of alive(g)) g.roundBet[id] = 0;
    g.currentBet = 0;
    g.last = Object.fromEntries(Object.entries(g.last).filter(([id]) => g.folded[id]));
  }
  g.toAct = alive(g).filter((id) => !capped(g, id));
  // Betting needs two people who can still put sips in.
  if (g.toAct.length < 2) {
    g.toAct = [];
    return g.street === 'river' ? showdown(room, ctx) : startStreet(room, ctx);
  }
  g.turnId = nextActor(g, g.dealerId);
}

// After each action: the hand is won, the street is over, or the next player is up.
function advance(room, ctx, from) {
  const g = room.game;
  const left = alive(g);
  if (left.length === 1) return finishByFolds(room, ctx, left[0]);
  if (!g.toAct.length) return g.street === 'river' ? showdown(room, ctx) : startStreet(room, ctx);
  g.turnId = nextActor(g, from);
}

// Every debt has to be settled (the player taps "Tab settled") before the next hand.
function owe(room, ctx, id, reason) {
  const g = room.game;
  const sips = g.committed[id];
  if (!sips) return;
  const big = sips >= g.perShot;
  g.debts[id] = { sips, text: shotText(sips, g.perShot), paid: false };
  ctx.drink(room, id, sips, reason, null, big ? { title: `TAKE ${shotText(sips, g.perShot).toUpperCase()}` } : {});
}

function fold(room, ctx, id) {
  const g = room.game;
  g.folded[id] = true;
  g.last[id] = 'Fold';
  g.toAct = g.toAct.filter((x) => x !== id);
  ctx.log(room, `🏳️ ${ctx.name(room, id)} folds`);
  owe(room, ctx, id, 'folded');
}

function finishByFolds(room, ctx, winnerId) {
  const g = room.game;
  g.toAct = [];
  g.turnId = null;
  g.result = { byFold: true, winners: [winnerId], hands: {} };
  g.phase = 'showdown';
  ctx.log(room, `🏆 ${ctx.name(room, winnerId)} wins: everyone else folded`);
}

function showdown(room, ctx) {
  const g = room.game;
  // Any cards still to come are dealt out first.
  while (g.community.length < 5) {
    draw(g.deck);
    g.community.push(draw(g.deck));
  }
  g.street = 'river';
  g.toAct = [];
  g.turnId = null;
  const hands = {};
  for (const id of alive(g)) {
    const best = bestHand([...g.hands[id], ...g.community]);
    hands[id] = { cards: g.hands[id], best: best.cards, score: best.score, name: handName(best.score) };
  }
  const top = Object.values(hands).reduce((a, h) => (compare(h.score, a) > 0 ? h.score : a), [-1]);
  const winners = Object.keys(hands).filter((id) => compare(hands[id].score, top) === 0);
  g.result = { byFold: false, winners, hands };
  g.phase = 'showdown';
  const names = winners.map((id) => ctx.name(room, id)).join(' & ');
  ctx.log(room, `🏆 ${names} win${winners.length === 1 ? 's' : ''} with ${hands[winners[0]].name}`);
  for (const id of Object.keys(hands)) if (!winners.includes(id)) owe(room, ctx, id, `lost to ${hands[winners[0]].name}`);
  const pot = Object.values(g.committed).reduce((a, b) => a + b, 0);
  if (winners.length === 1) ctx.highlight(room, 'bigPot', winners[0], pot, `☠️ ${names} took a ${pot}-sip pot with ${hands[winners[0]].name}`);
}

// Debts still blocking the next hand (players who've left don't hold it up).
const unpaid = (room, ctx) => Object.entries(room.game.debts)
  .filter(([id, d]) => !d.paid && ctx.turns.isActive(room, id))
  .map(([id]) => id);

// ---------- Module ----------

module.exports = {
  id: 'shotPoker',
  name: 'Shot Poker',
  description: "Texas Hold'em for sips. Fold and drink what you put in; the winner drinks nothing.",
  // A reminder of the rules, shown on the TV.
  rules: [
    "Texas Hold'em, betting sips.",
    "Fold and you drink what you've put in.",
    "Best hand at the showdown drinks nothing; everyone else drinks their bets.",
    "A shot is a set number of sips, and there's a max per hand.",
    "All debts must be paid before the next round.",
  ],
  minPlayers: 2,
  order: 7,
  options: [
    { id: 'perShot', label: 'Sips in a shot', default: 5, choices: [3, 4, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'maxShots', label: 'Max shots a hand', default: 2, choices: [1, 2, 3, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'ante', label: 'Ante', default: 1, choices: [{ value: 0, label: 'None' }, { value: 1, label: '1 sip' }, { value: 2, label: '2 sips' }] },
  ],

  start(room, ctx, options = {}) {
    const perShot = [3, 4, 5].includes(options.perShot) ? options.perShot : 5;
    const maxShots = [1, 2, 3, 5].includes(options.maxShots) ? options.maxShots : 2;
    const order = room.players.map((p) => p.id);
    Object.assign(room.game, {
      order,
      perShot,
      maxShots,
      cap: perShot * maxShots,
      ante: [0, 1, 2].includes(options.ante) ? options.ante : 1,
      hand: 0,
      // The button moves on before each hand, so the first hand's dealer is the last seat and the
      // first seat acts first.
      dealerId: order[order.length - 2],
      toAct: [],
      turnId: null,
    });
    startHand(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;

    if (g.phase === 'betting' && me === g.turnId) {
      const toCall = g.currentBet - g.roundBet[me];
      const put = (n) => { g.roundBet[me] += n; g.committed[me] += n; };
      if (action.type === 'fold') {
        fold(room, ctx, me);
      } else if (action.type === 'check' && toCall === 0) {
        g.last[me] = 'Check';
      } else if (action.type === 'call' && toCall > 0) {
        put(toCall);
        g.last[me] = `Call ${toCall}`;
      } else if (action.type === 'raise') {
        const to = Number(action.to);
        const most = g.roundBet[me] + (g.cap - g.committed[me]);
        if (!Number.isInteger(to) || to <= g.currentBet || to > most) return;
        put(to - g.roundBet[me]);
        g.currentBet = to;
        g.last[me] = g.committed[me] >= g.cap ? `All in: ${to}` : `${toCall ? 'Raise' : 'Bet'} ${to}`;
        ctx.log(room, `💰 ${player.name} ${toCall ? 'raises' : 'bets'} to ${to}`);
        // Everyone else still in (and able to) has to answer the raise.
        g.toAct = alive(g).filter((id) => id !== me && !capped(g, id));
      } else {
        return;
      }
      g.toAct = g.toAct.filter((id) => id !== me);
      advance(room, ctx, me);
    } else if (action.type === 'paid' && g.debts[me] && !g.debts[me].paid) {
      g.debts[me].paid = true;
      ctx.log(room, `✅ ${player.name} settled their tab (${g.debts[me].text})`);
    } else if (action.type === 'deal' && g.phase === 'showdown' && (me === room.hostId || me === ctx.turns.next(room, g.order, g.dealerId))) {
      if (unpaid(room, ctx).length) return;
      if (ctx.connectedPlayers(room).length < 2) return;
      startHand(room, ctx);
    }
  },

  // Whoever's turn it is drops out: they fold.
  check(room, ctx) {
    const g = room.game;
    for (let i = 0; i < g.order.length && g.phase === 'betting' && g.turnId && !ctx.turns.isActive(room, g.turnId); i++) {
      const id = g.turnId;
      fold(room, ctx, id);
      advance(room, ctx, id);
    }
  },

  // Late joiners sit out until the next hand.
  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room, player, ctx) {
    const g = room.game;
    const me = player.id;
    const inHand = !!g.inHand[me];
    const r = g.result;
    return {
      hand: g.hand,
      street: g.street,
      community: g.community,
      dealerId: g.dealerId,
      turnId: g.phase === 'betting' ? g.turnId : null,
      perShot: g.perShot,
      maxShots: g.maxShots,
      cap: g.cap,
      ante: g.ante,
      pot: Object.values(g.committed).reduce((a, b) => a + b, 0),
      currentBet: g.currentBet,
      myCards: inHand ? g.hands[me] : [],
      inHand,
      toCall: inHand ? g.currentBet - g.roundBet[me] : 0,
      maxTo: inHand ? g.roundBet[me] + (g.cap - g.committed[me]) : 0,
      seats: g.order.filter((id) => g.inHand[id]).map((id) => ({
        id,
        folded: !!g.folded[id],
        committed: g.committed[id],
        roundBet: g.roundBet[id],
        allIn: capped(g, id) && !g.folded[id],
        last: g.last[id] || null,
      })),
      // Hands are shown only for the players who made it to the showdown.
      result: r && {
        byFold: r.byFold,
        winners: r.winners,
        hands: Object.fromEntries(Object.entries(r.hands).map(([id, h]) => [id, { cards: h.cards, best: h.best, name: h.name }])),
      },
      debts: g.debts,
      waitingOn: g.phase === 'showdown' ? unpaid(room, ctx) : [],
      nextDealerId: ctx.turns.next(room, g.order, g.dealerId),
    };
  },

  score5,
  bestHand,
  compare,
  handName,
  shotText,
};
