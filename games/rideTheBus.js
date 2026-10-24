// Ride the Bus: guess your cards, dump them on the pyramid, and whoever is left holding the most
// rides the bus.
//
// Round 1 (guessing): four times around the table, each player guesses their next card before it
// flips: red or black, higher or lower than their first card, inside or outside their first two,
// then the suit. Wrong: drink. Right: give that many sips (1, 2, 3, 4 by round).
// Round 2 (pyramid): a pyramid of face-down cards flips one at a time from the bottom row up.
// Anyone holding the same rank plays it and gives sips: 1 on the bottom row, 2 on the next, and so
// on. With bluffing on, you may play any card; whoever receives the sips can call bluff, and the
// loser of the call drinks double.
// Round 3 (the bus): the player left with the most cards rides the bus, guessing along a row of
// face-down cards. A wrong guess means a drink (one per card reached) and a fresh row.

const { newDeck, draw, color, rankName } = require('../lib/cards');

const ROUND_TYPES = ['color', 'highlow', 'inout', 'suit'];
const ROUND_SIPS = [1, 2, 3, 4];
const GUESSES = {
  color: ['red', 'black'],
  highlow: ['higher', 'lower'],
  inout: ['inside', 'outside'],
  suit: ['S', 'H', 'D', 'C'],
};

// Is the guess right for this card, given the reference cards it's compared with?
function guessRight(type, guess, card, refs) {
  switch (type) {
    case 'color': return color(card) === guess;
    case 'highlow': {
      const ref = refs[refs.length - 1];
      return guess === 'higher' ? card.rank > ref.rank : card.rank < ref.rank;
    }
    case 'inout': {
      const [a, b] = refs.slice(-2);
      const lo = Math.min(a.rank, b.rank);
      const hi = Math.max(a.rank, b.rank);
      return guess === 'inside' ? card.rank > lo && card.rank < hi : card.rank < lo || card.rank > hi;
    }
    case 'suit': return card.suit === guess;
    default: return false;
  }
}

// ---------- Round 1: guessing ----------

// Next player to guess, going round the table one round at a time. Anyone who isn't connected
// sits that turn out. After round 4, on to the pyramid.
function nextGuesser(room, ctx, from = room.game.turnIdx + 1) {
  const g = room.game;
  let i = from;
  for (let guard = 0; guard <= g.order.length * (ROUND_TYPES.length + 1); guard++) {
    if (i >= g.order.length) {
      g.round += 1;
      if (g.round >= ROUND_TYPES.length) return startPyramid(room, ctx);
      i = 0;
    }
    if (ctx.turns.isActive(room, g.order[i])) {
      g.turnIdx = i;
      g.phase = 'guess';
      return;
    }
    i += 1;
  }
  startPyramid(room, ctx);
}

// ---------- Round 2: pyramid ----------

function startPyramid(room, ctx) {
  const g = room.game;
  const rows = [];
  for (let size = g.rows; size >= 1; size--) rows.push(Array.from({ length: size }, () => draw(g.deck)));
  g.pyramid = { rows, flipped: 0, plays: [] };
  g.phase = 'pyramid';
  ctx.log(room, '🔺 The pyramid is out. Match a flipped card to give sips');
}

// Position of the n-th flip: bottom row left to right, then up.
function pyramidSpot(g, n) {
  let left = n;
  for (let r = 0; r < g.pyramid.rows.length; r++) {
    if (left < g.pyramid.rows[r].length) return { row: r, col: left, card: g.pyramid.rows[r][left], sips: r + 1 };
    left -= g.pyramid.rows[r].length;
  }
  return null;
}

const pyramidSize = (g) => g.pyramid.rows.reduce((n, r) => n + r.length, 0);
const currentSpot = (g) => (g.pyramid.flipped > 0 ? pyramidSpot(g, g.pyramid.flipped - 1) : null);

// Anyone who hasn't answered a bluff by the next flip takes the sips.
function settleClaims(room, ctx) {
  const g = room.game;
  for (const p of g.pyramid.plays) {
    if (p.status === 'pending') {
      p.status = 'accepted';
      ctx.drink(room, p.targetId, p.sips, 'pyramid', p.by);
    }
  }
}

// ---------- Round 3: the bus ----------

function startBus(room, ctx) {
  const g = room.game;
  settleClaims(room, ctx);
  // Most cards rides. Ties go to the highest total; still tied, earliest seat.
  const score = (id) => g.hands[id].length * 1000 + g.hands[id].reduce((s, c) => s + c.rank, 0);
  const riderId = g.order
    .filter((id) => room.players.some((p) => p.id === id))
    .reduce((best, id) => (best === null || score(id) > score(best) ? id : best), null);
  g.bus = { riderId, length: g.busLength, attempts: 0 };
  newBusRow(g);
  g.phase = 'bus';
  ctx.log(room, `🚌 ${ctx.name(room, riderId)} rides the bus with ${g.hands[riderId].length} cards left`);
}

function newBusRow(g) {
  g.bus.start = draw(g.deck); // face-up card to compare the first guess with
  g.bus.row = Array.from({ length: g.bus.length }, () => draw(g.deck));
  g.bus.pos = 0;
  g.bus.attempts += 1;
}

function busType(g) {
  if (g.busGuess === 'sequence') return ROUND_TYPES[g.bus.pos % ROUND_TYPES.length];
  return g.busGuess;
}

// ---------- Module ----------

module.exports = {
  id: 'rideTheBus',
  name: 'Ride the Bus',
  description: 'Guess your cards, dump them on the pyramid, and whoever holds the most rides the bus.',
  minPlayers: 2,
  order: 4,
  options: [
    { id: 'rows', label: 'Pyramid rows', default: 4, choices: [{ value: 4, label: '4' }, { value: 5, label: '5' }] },
    { id: 'busLength', label: 'Bus length', default: 5, choices: [5, 7, 9].map((n) => ({ value: n, label: `${n} cards` })) },
    {
      id: 'busGuess',
      label: 'On the bus, guess',
      default: 'color',
      choices: [
        { value: 'color', label: 'Red / black' },
        { value: 'highlow', label: 'Higher / lower' },
        { value: 'sequence', label: 'All four' },
      ],
    },
    { id: 'bluff', label: 'Bluffing in the pyramid', default: false, choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] },
  ],

  start(room, ctx, options = {}) {
    const order = room.players.map((p) => p.id);
    Object.assign(room.game, {
      order,
      deck: newDeck({ decks: order.length > 8 ? 2 : 1 }),
      hands: Object.fromEntries(order.map((id) => [id, []])),
      round: 0,
      turnIdx: -1,
      rows: options.rows === 5 ? 5 : 4,
      busLength: [5, 7, 9].includes(options.busLength) ? options.busLength : 5,
      busGuess: ['color', 'highlow', 'sequence'].includes(options.busGuess) ? options.busGuess : 'color',
      bluff: options.bluff === true,
      last: null,
      give: null,
      pyramid: null,
      bus: null,
    });
    nextGuesser(room, ctx, 0);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const target = action.targetId && action.targetId !== me ? ctx.player(room, action.targetId) : null;

    if (action.type === 'guess' && g.phase === 'guess' && me === g.order[g.turnIdx]) {
      const type = ROUND_TYPES[g.round];
      if (!GUESSES[type].includes(action.guess)) return;
      const hand = g.hands[me];
      const card = draw(g.deck);
      const right = guessRight(type, action.guess, card, hand);
      hand.push(card);
      const sips = ROUND_SIPS[g.round];
      g.last = { by: me, round: g.round, type, guess: action.guess, card, right, sips };
      if (right) {
        g.give = { from: me, sips, reason: 'right guess' };
        g.phase = 'give';
      } else {
        ctx.drink(room, me, sips, 'wrong guess');
        nextGuesser(room, ctx);
      }
    } else if (action.type === 'give' && g.phase === 'give' && me === g.give.from && target) {
      ctx.drink(room, target.id, g.give.sips, g.give.reason, me);
      g.give = null;
      nextGuesser(room, ctx);
    } else if (action.type === 'flip' && g.phase === 'pyramid' && me === room.hostId) {
      settleClaims(room, ctx);
      if (g.pyramid.flipped >= pyramidSize(g)) return startBus(room, ctx);
      g.pyramid.flipped += 1;
      const spot = currentSpot(g);
      ctx.log(room, `🃏 Pyramid row ${spot.row + 1}: ${rankName(spot.card.rank)} (${spot.sips} sip${spot.sips === 1 ? '' : 's'})`);
    } else if (action.type === 'play' && g.phase === 'pyramid' && target) {
      const spot = currentSpot(g);
      const hand = g.hands[me];
      const i = Number(action.cardIdx);
      if (!spot || !hand[i]) return;
      if (!g.bluff && hand[i].rank !== spot.card.rank) return;
      const [card] = hand.splice(i, 1);
      const play = { id: g.pyramid.plays.length, by: me, targetId: target.id, card, sips: spot.sips, flip: g.pyramid.flipped };
      g.pyramid.plays.push(play);
      if (g.bluff) {
        play.status = 'pending'; // the receiver decides: drink, or call bluff
      } else {
        play.status = 'accepted';
        ctx.drink(room, target.id, spot.sips, `pyramid ${rankName(card.rank)}`, me);
      }
    } else if ((action.type === 'accept' || action.type === 'callBluff') && g.phase === 'pyramid') {
      const play = g.pyramid.plays[Number(action.playId)];
      if (!play || play.status !== 'pending' || play.targetId !== me) return;
      if (action.type === 'accept') {
        play.status = 'accepted';
        ctx.drink(room, me, play.sips, 'pyramid', play.by);
        return;
      }
      const spotCard = pyramidSpot(g, play.flip - 1).card;
      const honest = play.card.rank === spotCard.rank;
      play.status = honest ? 'honest' : 'bluff';
      const loser = honest ? me : play.by;
      ctx.drink(room, loser, play.sips * 2, honest ? 'called a bluff that was true' : 'caught bluffing');
      ctx.log(room, honest
        ? `😬 ${player.name} called bluff, but ${ctx.name(room, play.by)} really had a ${rankName(play.card.rank)}`
        : `🕵️ ${player.name} caught ${ctx.name(room, play.by)} bluffing with a ${rankName(play.card.rank)}`);
    } else if (action.type === 'busGuess' && g.phase === 'bus' && me === g.bus.riderId) {
      const type = busType(g);
      if (!GUESSES[type].includes(action.guess)) return;
      const b = g.bus;
      const card = b.row[b.pos];
      const refs = [b.start, ...b.row.slice(0, b.pos)];
      const right = guessRight(type, action.guess, card, refs);
      b.last = { pos: b.pos, type, guess: action.guess, card, right };
      if (right) {
        b.pos += 1;
        if (b.pos >= b.length) {
          g.phase = 'over';
          ctx.log(room, `🎉 ${player.name} got off the bus after ${b.attempts} ${b.attempts === 1 ? 'try' : 'tries'}`);
        }
      } else {
        b.failedRow = { start: b.start, row: b.row.slice(0, b.pos + 1) };
        ctx.drink(room, me, b.pos + 1, 'fell off the bus');
        newBusRow(g);
      }
    }
  },

  // If the guesser or giver drops out, play moves on.
  check(room, ctx) {
    const g = room.game;
    if (g.phase === 'guess' && !ctx.turns.isActive(room, g.order[g.turnIdx])) nextGuesser(room, ctx);
    else if (g.phase === 'give' && !ctx.turns.isActive(room, g.give.from)) {
      g.give = null;
      nextGuesser(room, ctx);
    }
  },

  onJoin(room, player) {
    const g = room.game;
    g.order.push(player.id);
    g.hands[player.id] = [];
  },

  view(room, player) {
    const g = room.game;
    const me = player.id;
    const spot = g.pyramid && currentSpot(g);
    const pyramid = g.pyramid && {
      // Unflipped cards stay hidden.
      rows: g.pyramid.rows.map((row, r) => row.map((card, c) => {
        let n = c;
        for (let k = 0; k < r; k++) n += g.pyramid.rows[k].length;
        return n < g.pyramid.flipped ? card : null;
      })),
      flipped: g.pyramid.flipped,
      total: pyramidSize(g),
      current: spot,
      // In bluff mode, played cards stay secret until a bluff is called.
      plays: g.pyramid.plays.map((p) => ({ ...p, card: !g.bluff || p.status === 'honest' || p.status === 'bluff' || p.by === me ? p.card : null })),
    };
    const b = g.bus;
    return {
      round: g.round,
      roundType: ROUND_TYPES[g.round],
      roundSips: ROUND_SIPS[g.round],
      turnId: g.phase === 'guess' ? g.order[g.turnIdx] : null,
      myHand: g.hands[me] || [],
      counts: Object.fromEntries(g.order.map((id) => [id, g.hands[id].length])),
      last: g.last,
      give: g.give,
      pyramid,
      bus: b && {
        riderId: b.riderId,
        length: b.length,
        pos: b.pos,
        attempts: b.attempts,
        start: b.start,
        revealed: b.row.slice(0, b.pos),
        type: g.phase === 'bus' ? busType(g) : null,
        last: b.last,
        failedRow: b.failedRow,
      },
      bluff: g.bluff,
      busGuess: g.busGuess,
    };
  },

  guessRight,
};
