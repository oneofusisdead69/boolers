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

  const left = inGame(g);
  if (left.length <= 1) {
    g.winnerId = left[0] || null;
    g.phase = 'over';
    if (g.winnerId) ctx.log(room, `🏆 ${ctx.name(room, g.winnerId)} wins Liar's Dice`);
  } else {
    g.phase = 'reveal';
  }
}

module.exports = {
  id: 'liarsDice',
  name: "Liar's Dice",
  description: 'Roll in secret, bid on what the whole table rolled, and call out the liars.',
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
    const order = room.players.map((p) => p.id);
    const each = options.dice === 3 ? 3 : 5;
    Object.assign(room.game, {
      order,
      dice: Object.fromEntries(order.map((id) => [id, each])),
      sips: [1, 2, 3].includes(options.sips) ? options.sips : 2,
      wild: options.wild !== false,
      spotOn: options.spotOn !== false,
      loseDice: options.loseDice !== false,
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
    if (g.phase === 'bidding' && !ctx.turns.isActive(room, g.turnId)) {
      const next = nextBidder(room, ctx, g.turnId);
      if (next) g.turnId = next;
    }
  },

  // Late joiners watch until the next game.
  onJoin(room, player) {
    const g = room.game;
    g.order.push(player.id);
    g.dice[player.id] = 0;
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
