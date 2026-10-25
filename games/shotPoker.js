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

// ---------- Bots ----------

// A bot's rough read of its hand: the chance it beats one random hand, from its own two cards and
// the board (never the deck, so no peeking at what's to come). Played out deals would be truer
// but far too slow to run on every turn; this is close enough to bet on.
function headsUp(hole, board) {
  const [hi, lo] = hole.map((c) => c.rank).sort((a, b) => b - a);
  if (!board.length) {
    if (hi === lo) return 0.47 + ((hi - 2) / 12) * 0.38; // 2s ~ even, Aces ~ 85%
    const suited = hole[0].suit === hole[1].suit ? 0.03 : 0;
    const connected = hi - lo <= 2 ? 0.02 : 0;
    return 0.3 + ((hi - 2) / 12) * 0.25 + ((lo - 2) / 12) * 0.1 + suited + connected;
  }
  const [cat, top] = bestHand([...hole, ...board]).score;
  // What the board makes on its own counts for everyone: only what the bot's cards add is its edge.
  const boardCat = board.length === 5 ? score5(board)[0] : boardGroups(board);
  const made = cat > boardCat ? cat : 0;
  let p = [0.3, 0.55, 0.8, 0.88, 0.92, 0.94, 0.97, 0.99, 0.995][made];
  if (made === 1) p += ((top - 2) / 12) * 0.2; // a pair of Aces beats a pair of 3s
  if (made === 0) p += ((hi - 2) / 12) * 0.12;
  // Draws are worth something while cards are still to come.
  const left = 5 - board.length;
  if (left && made < 4) {
    const all = [...hole, ...board];
    const flushDraw = hole.some((h) => all.filter((c) => c.suit === h.suit).length === 4);
    const ranks = new Set(all.map((c) => c.rank));
    if (ranks.has(14)) ranks.add(1);
    const straightDraw = [...ranks].some((r) => [1, 2, 3].every((k) => ranks.has(r + k)));
    p += (flushDraw ? 0.08 : 0) * left + (straightDraw ? 0.05 : 0) * left;
  }
  return Math.min(0.995, p);
}

// The best category the board's own ranks make before it has five cards: trips, two pair, a pair.
function boardGroups(board) {
  const counts = Object.values(board.reduce((m, c) => ({ ...m, [c.rank]: (m[c.rank] || 0) + 1 }), {})).sort((a, b) => b - a);
  if (counts[0] >= 3) return 3;
  if (counts[0] === 2) return counts[1] === 2 ? 2 : 1;
  return 0;
}

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

  // A bot weighs its chance of winning against what calling costs: folding drinks what it's in
  // for, calling and losing drinks that plus the call. Skill is how well it reads its hand, how
  // tight it plays and how often it bluffs; a bad bot calls too much and now and then does
  // something at random.
  bot(room, me, ctx, skill) {
    const g = room.game;
    const id = me.id;
    // Tabs are paid straight away, and the next dealer deals once everyone's settled.
    if (g.debts?.[id] && !g.debts[id].paid) return { type: 'paid' };
    if (g.phase === 'showdown') {
      const dealer = id === room.hostId || id === ctx.turns.next(room, g.order, g.dealerId);
      return dealer && !unpaid(room, ctx).length && ctx.connectedPlayers(room).length >= 2 ? { type: 'deal' } : null;
    }
    if (g.phase !== 'betting' || id !== g.turnId) return null;

    const toCall = g.currentBet - g.roundBet[id];
    const most = g.roundBet[id] + (g.cap - g.committed[id]);
    const canRaise = most > g.currentBet;
    const opponents = alive(g).length - 1;
    const sloppy = 1 - skill;
    // To win it has to beat everyone still in; a bad bot's read of that is way off.
    const read = Math.min(1, Math.max(0, headsUp(g.hands[id], g.community) + (Math.random() - 0.5) * sloppy * 0.4));
    const win = read ** opponents;
    // 1 is an average hand at this table; 2 wins twice its share.
    const strength = win * (opponents + 1);
    const raise = () => {
      const size = Math.max(1, Math.round((strength - 1) * g.perShot * Math.random() + Math.random() * 2));
      return { type: 'raise', to: Math.min(most, g.currentBet + size) };
    };
    const stay = toCall ? { type: 'call' } : { type: 'check' };

    // A bad bot plays on a whim now and then (but never folds when it could check).
    if (Math.random() < sloppy * 0.3) {
      const moves = [stay, ...(canRaise ? [raise()] : []), ...(toCall ? [{ type: 'fold' }] : [])];
      return moves[Math.floor(Math.random() * moves.length)];
    }
    if (canRaise && (strength > 1.6 - 0.3 * skill || (Math.random() < 0.12 * skill && !toCall))) return raise();
    if (!toCall) return stay;
    // Break even: calling and losing costs (in + call), folding costs in.
    const breakEven = toCall / (g.committed[id] + toCall);
    return win > breakEven - sloppy * 0.25 ? stay : { type: 'fold' };
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
