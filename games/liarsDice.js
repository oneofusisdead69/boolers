// Liar's Dice: everyone rolls their dice in secret, then takes turns bidding on how many of one
// face are on the whole table ("four 5s"). Each bid must go higher: more dice, or the same number
// of a higher face. Instead of raising, call the last bid a lie. Everyone shows their dice: if
// there are at least that many, the caller was wrong; if not, the bidder was lying. The loser
// drinks and (with losing dice on) gives up a die, then starts the next round.
//
// Ones wild (optional): 1s count as every face, so nobody can bid on 1s.
// Spot on (optional): instead of calling liar, say the bid is exactly right. Right and everyone
// else drinks; wrong and you drink and lose a die like any lost call.
// Lose your last die and you finish your drink and you're out. Last one with dice wins.

const { optionValues } = require('../lib/options');
const { isActive } = require('../lib/turns');

const FACES = [1, 2, 3, 4, 5, 6];

// How many dice on the table show `face`, counting 1s as wild when they are.
function countFace(hands, face, wild) {
  let n = 0;
  for (const dice of Object.values(hands)) {
    for (const d of dice) if (d === face || (wild && d === 1 && face !== 1)) n += 1;
  }
  return n;
}

// Is `bid` a legal raise on `prev` (null for the opening bid)?
function validBid(bid, prev, totalDice, wild) {
  const { qty, face } = bid;
  if (!Number.isInteger(qty) || !Number.isInteger(face)) return false;
  if (qty < 1 || qty > totalDice || !FACES.includes(face)) return false;
  if (wild && face === 1) return false;
  if (!prev) return true;
  return qty > prev.qty || (qty === prev.qty && face > prev.face);
}

const totalDice = (g) => Object.values(g.dice).reduce((n, c) => n + c, 0);
const inGame = (g) => g.order.filter((id) => g.dice[id] > 0);

function startRound(room, ctx, starterId) {
  const g = room.game;
  g.round += 1;
  g.hands = Object.fromEntries(inGame(g).map((id) => [id, ctx.dice.roll(g.dice[id]).sort((a, b) => a - b)]));
  g.bid = null;
  g.bids = [];
  g.reveal = null;
  // The starter leads if they still can; otherwise the next player with dice after them.
  g.turnId = g.dice[starterId] > 0 && ctx.turns.isActive(room, starterId)
    ? starterId
    : nextBidder(room, ctx, starterId) || inGame(g)[0];
  g.phase = 'bidding';
}

// The next player still holding dice after `id`, skipping anyone who isn't connected.
function nextBidder(room, ctx, id) {
  const g = room.game;
  const order = g.order.filter((x) => g.dice[x] > 0 || x === id);
  return ctx.turns.next(room, order, id);
}

function loseDie(room, ctx, id) {
  const g = room.game;
  if (!g.loseDice) return;
  g.dice[id] = Math.max(0, g.dice[id] - 1);
  if (g.dice[id] === 0) {
    g.reveal.out.push(id);
    ctx.finishDrink(room, id, 'out of dice');
  }
}

// Shows everyone's dice and settles a liar or spot-on call.
function settle(room, ctx, callerId, call) {
  const g = room.game;
  const bid = g.bid;
  const count = countFace(g.hands, bid.face, g.wild);
  g.reveal = { call, callerId, bidderId: bid.by, bid, count, hands: g.hands, out: [], losers: [] };
  const caller = ctx.name(room, callerId);
  const what = `${bid.qty} × ${bid.face}${bid.qty === 1 ? '' : 's'}`;

  if (call === 'liar') {
    const lie = count < bid.qty;
    const loser = lie ? bid.by : callerId;
    g.reveal.losers = [loser];
    if (lie) ctx.highlight(room, 'bigLie', bid.by, bid.qty - count, `🤥 ${ctx.name(room, bid.by)} bid ${what} when there were only ${count}`);
    ctx.log(room, lie
      ? `🤥 ${caller} called liar on ${what}: only ${count}. ${ctx.name(room, bid.by)} was lying`
      : `😬 ${caller} called liar on ${what}, but there were ${count}`);
    ctx.drink(room, loser, g.sips, lie ? 'caught lying' : 'wrong liar call');
    loseDie(room, ctx, loser);
    g.nextStarter = loser;
  } else {
    const exact = count === bid.qty;
    if (exact) {
      g.reveal.losers = inGame(g).filter((id) => id !== callerId);
      ctx.log(room, `🎯 ${caller} called spot on: exactly ${count} × ${bid.face}${count === 1 ? '' : 's'}! Everyone else drinks`);
      for (const id of g.reveal.losers) ctx.drink(room, id, g.sips, 'spot on', callerId);
      g.nextStarter = callerId;
    } else {
      g.reveal.losers = [callerId];
      ctx.log(room, `❌ ${caller} called spot on for ${what}, but there were ${count}`);
      ctx.drink(room, callerId, g.sips, 'wrong spot-on call');
      loseDie(room, ctx, callerId);
      g.nextStarter = callerId;
    }
  }

  // Players who've left don't count: the last one here with dice wins.
  const left = inGame(g).filter((id) => ctx.turns.isActive(room, id));
  if (left.length <= 1) {
    g.winnerId = left[0] || null;
    g.phase = 'over';
    if (g.winnerId) ctx.log(room, `🏆 ${ctx.name(room, g.winnerId)} wins Liar's Dice`);
  } else {
    g.phase = 'reveal';
  }
}

// The chance that exactly `k` of `n` dice show a face that each comes up with chance `p`.
function exactly(n, k, p) {
  if (k < 0 || k > n) return 0;
  let ways = 1;
  for (let i = 0; i < k; i++) ways = (ways * (n - i)) / (i + 1);
  return ways * p ** k * (1 - p) ** (n - k);
}

// ...and that at least `k` do.
function atLeast(n, k, p) {
  if (k <= 0) return 1;
  let sum = 0;
  for (let i = k; i <= n; i++) sum += exactly(n, i, p);
  return sum;
}

// How a bot rates a bid from what it can see: its own dice, plus the odds on everyone else's
// (which it can't). A face shows on a die one time in six, or two (the face or a wild 1).
function botOdds(g, mine, bid) {
  const unknown = totalDice(g) - mine.length;
  const p = (g.wild && bid.face !== 1 ? 2 : 1) / 6;
  const need = bid.qty - countFace({ mine }, bid.face, g.wild);
  return { true: atLeast(unknown, need, p), exact: exactly(unknown, need, p) };
}

module.exports = {
  id: 'liarsDice',
  name: "Liar's Dice",
  description: 'Roll in secret, bid on what the whole table rolled, and call out the liars.',
  // A reminder of the rules, shown on the TV.
  rules: [
    "Everyone rolls in secret.",
    "Bid on how many of a face are on the whole table. Each bid goes higher.",
    "Call LIAR on the last bid: if it's short, the bidder drinks; if not, you do.",
    "Spot on: exactly right and everyone else drinks.",
    "Lose a call, lose a die. Out of dice? Finish your drink.",
  ],
  minPlayers: 2,
  order: 6,
  options: [
    { id: 'dice', label: 'Dice each', default: 5, choices: [3, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'sips', label: 'Sips for losing a call', default: 2, choices: [1, 2, 3].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'wild', label: 'Ones wild', default: true, choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
    { id: 'spotOn', label: 'Spot-on calls', default: true, choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
    {
      id: 'loseDice',
      label: 'Losing a call',
      default: true,
      choices: [{ value: true, label: 'Lose a die' }, { value: false, label: 'Just drink' }],
    },
  ],

  start(room, ctx, options = {}) {
    const o = optionValues(module.exports.options, options);
    const order = room.players.map((p) => p.id);
    Object.assign(room.game, {
      order,
      dice: Object.fromEntries(order.map((id) => [id, o.dice])), // how many each still has
      sips: o.sips,
      wild: o.wild,
      spotOn: o.spotOn,
      loseDice: o.loseDice,
      round: 0,
      hands: {},
      bid: null,
      bids: [],
      reveal: null,
      nextStarter: null,
      winnerId: null,
    });
    startRound(room, ctx, ctx.turns.first(room, order));
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;

    if (g.phase === 'bidding' && me === g.turnId) {
      if (action.type === 'bid') {
        const bid = { qty: Number(action.qty), face: Number(action.face) };
        if (!validBid(bid, g.bid, totalDice(g), g.wild)) return;
        g.bid = { ...bid, by: me };
        g.bids.push(g.bid);
        g.turnId = nextBidder(room, ctx, me) || me;
      } else if (action.type === 'liar' && g.bid) {
        settle(room, ctx, me, 'liar');
      } else if (action.type === 'spotOn' && g.bid && g.spotOn) {
        settle(room, ctx, me, 'spotOn');
      }
    } else if (action.type === 'next' && g.phase === 'reveal' && (me === g.nextStarter || me === room.hostId || !ctx.turns.isActive(room, g.nextStarter))) {
      startRound(room, ctx, g.nextStarter);
    }
  },

  // If the bidder drops out, the next player with dice takes the turn.
  check(room, ctx) {
    const g = room.game;
    // Everyone else with dice has gone: the one still here wins.
    const here = inGame(g).filter((id) => ctx.turns.isActive(room, id));
    if (g.phase !== 'over' && here.length === 1 && inGame(g).length > 1) {
      g.winnerId = here[0];
      g.phase = 'over';
      ctx.log(room, `🏆 ${ctx.name(room, here[0])} wins Liar's Dice (everyone else left)`);
      return;
    }
    if (g.phase === 'bidding' && !ctx.turns.isActive(room, g.turnId)) {
      const next = nextBidder(room, ctx, g.turnId);
      if (next) g.turnId = next;
    }
  },

  // The bidder; after a call, whoever starts the next round (the host, if they've gone; the host
  // may also start it for them).
  waitingOn(room) {
    const g = room.game;
    if (g.phase === 'bidding') return isActive(room, g.turnId) ? [g.turnId] : [];
    if (g.phase === 'reveal') return [isActive(room, g.nextStarter) ? g.nextStarter : room.hostId];
    return [];
  },

  // Late joiners watch until the next game.
  onJoin(room, player) {
    const g = room.game;
    g.order.push(player.id);
    g.dice[player.id] = 0;
  },

  // A bot bids what it thinks is likely to be there and calls liar when the last bid is less
  // likely to be true than its own best raise. Skill is how true its sense of the odds is, and how
  // bold it bids: a bad bot misjudges, overbids and now and then just calls.
  bot(room, me, ctx, skill) {
    const g = room.game;
    if (g.phase === 'reveal') return me.id === g.nextStarter || room.hostId === me.id ? { type: 'next' } : null;
    if (g.phase !== 'bidding' || me.id !== g.turnId) return null;
    const mine = g.hands[me.id] || [];
    const total = totalDice(g);
    const prev = g.bid;
    const sloppy = 1 - skill;
    const misjudge = (p) => Math.min(1, Math.max(0, p + (Math.random() - 0.5) * sloppy * 0.6));

    if (prev && Math.random() < sloppy * 0.2) return { type: g.spotOn && Math.random() < 0.3 ? 'spotOn' : 'liar' };

    // Every raise up to a few dice more, with how likely the bot thinks it is.
    const low = prev ? prev.qty : 1;
    const raises = [];
    for (let qty = low; qty <= Math.min(total, low + 6); qty++) {
      for (const face of FACES) {
        const bid = { qty, face };
        if (validBid(bid, prev, total, g.wild)) raises.push({ ...bid, p: misjudge(botOdds(g, mine, bid).true) });
      }
    }
    // The boldest bid it still believes in (a bad bot believes in more), else its safest one.
    const aim = 0.2 + 0.45 * skill;
    const sure = raises.filter((b) => b.p >= aim);
    const safest = raises.reduce((a, b) => (!a || b.p > a.p ? b : a), null);
    const bold = sure.reduce((a, b) => (!a || b.qty > a.qty || (b.qty === a.qty && b.p > a.p) ? b : a), null);
    const raise = bold || safest;

    if (prev) {
      const odds = botOdds(g, mine, prev);
      const lie = 1 - misjudge(odds.true);
      const exact = misjudge(odds.exact);
      // Calling is worth it when the last bid is likelier a lie than the bot's safest raise is true.
      const best = safest ? safest.p : 0;
      if (g.spotOn && exact > 0.35 && exact > lie && exact > best) return { type: 'spotOn' };
      if (lie > best) return { type: 'liar' };
    }
    return raise && { type: 'bid', qty: raise.qty, face: raise.face };
  },

  view(room, player) {
    const g = room.game;
    const me = player.id;
    const showAll = g.phase === 'reveal' || g.phase === 'over';
    return {
      round: g.round,
      turnId: g.phase === 'bidding' ? g.turnId : null,
      myDice: g.hands[me] || [],
      counts: Object.fromEntries(g.order.map((id) => [id, g.dice[id]])),
      totalDice: Object.values(g.hands).reduce((n, h) => n + h.length, 0),
      bid: g.bid,
      bids: g.bids.slice(-6),
      // Everyone else's dice stay hidden until a call.
      reveal: showAll ? g.reveal : null,
      nextStarter: g.phase === 'reveal' ? g.nextStarter : null,
      winnerId: g.winnerId,
      sips: g.sips,
      wild: g.wild,
      spotOn: g.spotOn,
      loseDice: g.loseDice,
    };
  },

  countFace,
  validBid,
};
