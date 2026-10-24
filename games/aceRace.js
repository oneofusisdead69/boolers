// Ace Race: the four aces race up a track. Everyone bets sips on a suit, then the deck flips one
// card at a time and that suit's ace moves up a step. A row of face-down track cards runs beside
// the track; once every horse has passed one, it flips and that suit's horse is knocked back a
// step. First ace over the finish line wins: everyone who backed another suit drinks their bet,
// and the winners hand out their winnings (their bet, or double) to whoever they like.

const { SUITS, SUIT_NAMES, shuffle, newDeck } = require('../lib/cards');
const betting = require('../lib/betting');

const SPEEDS = { normal: 1600, fast: 900 };

// A fresh deck without the aces (they're the horses).
const raceDeck = () => newDeck().filter((c) => c.rank !== 14);

function newRace(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.race += 1;
  g.deck = raceDeck();
  g.track = g.deck.splice(0, g.length);
  g.trackFlipped = g.track.map(() => false);
  g.pile = [];
  g.positions = Object.fromEntries(SUITS.map((s) => [s, 0]));
  g.flips = 0;
  g.last = null;
  betting.reset(g);
  g.phase = 'betting';
}

// Flips the next card: its horse moves up, and maybe a track card knocks one back.
function step(room, ctx) {
  const g = room.game;
  if (g.phase !== 'race') return;
  if (!g.deck.length) {
    g.deck = shuffle(g.pile);
    g.pile = [];
  }
  const card = g.deck.pop();
  g.pile.push(card);
  g.flips += 1;
  g.positions[card.suit] += 1;
  g.last = { card, moved: card.suit, back: null };
  if (g.positions[card.suit] > g.length) return finish(room, ctx, card.suit);

  // The first track card every horse has passed (and that hasn't flipped yet) turns over.
  const behind = Math.min(...SUITS.map((s) => g.positions[s]));
  for (let row = 1; row <= Math.min(behind, g.length); row++) {
    if (g.trackFlipped[row - 1]) continue;
    g.trackFlipped[row - 1] = true;
    const knocked = g.track[row - 1].suit;
    g.positions[knocked] = Math.max(0, g.positions[knocked] - 1);
    g.last.back = { suit: knocked, row };
    ctx.log(room, `💥 Track card ${row}: ${SUIT_NAMES[knocked]} knocked back`);
    break;
  }
  if (g.speed !== 'manual') ctx.setTimer(room, SPEEDS[g.speed], () => step(room, ctx));
}

function finish(room, ctx, suit) {
  ctx.clearTimer(room);
  ctx.log(room, `🏆 ${SUIT_NAMES[suit]} win the race!`);
  betting.settle(room, ctx, suit, (s) => SUIT_NAMES[s]);
}

module.exports = {
  id: 'aceRace',
  name: 'Ace Race',
  description: 'Bet sips on a suit and watch the aces race. Losers drink their bet; winners hand out theirs.',
  minPlayers: 2,
  order: 9,
  options: [
    { id: 'length', label: 'Track length', default: 7, choices: [5, 7, 9].map((n) => ({ value: n, label: `${n}` })) },
    ...betting.options,
    {
      id: 'speed',
      label: 'Race',
      default: 'normal',
      choices: [{ value: 'normal', label: 'Auto' }, { value: 'fast', label: 'Auto, fast' }, { value: 'manual', label: 'Host flips' }],
    },
  ],

  start(room, ctx, options = {}) {
    Object.assign(room.game, {
      order: room.players.map((p) => p.id),
      length: [5, 7, 9].includes(options.length) ? options.length : 7,
      ...betting.fromOptions(options),
      speed: ['normal', 'fast', 'manual'].includes(options.speed) ? options.speed : 'normal',
      race: 0,
    });
    newRace(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const host = me === room.hostId;

    if (action.type === 'bet' && g.phase === 'betting') {
      betting.bet(g, me, action.suit, action.sips, SUITS);
    } else if (action.type === 'startRace' && g.phase === 'betting' && host && Object.keys(g.bets).length) {
      g.phase = 'race';
      ctx.log(room, `🏇 Race ${g.race} is off!`);
      if (g.speed !== 'manual') ctx.setTimer(room, SPEEDS[g.speed], () => step(room, ctx));
    } else if (action.type === 'flip' && g.phase === 'race' && g.speed === 'manual' && host) {
      step(room, ctx);
    } else if (action.type === 'give') {
      betting.give(room, ctx, me, action.alloc, `${SUIT_NAMES[g.winner]} won`);
    } else if (action.type === 'nextRace' && (g.phase === 'results' || g.phase === 'payout') && host) {
      newRace(room, ctx);
    }
  },

  // A winner who leaves doesn't hold up the payout.
  check(room, ctx) {
    betting.checkPayout(room, ctx);
  },

  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room, player) {
    const g = room.game;
    return {
      ...betting.view(g, player.id),
      race: g.race,
      length: g.length,
      speed: g.speed,
      positions: g.positions,
      track: g.track.map((c, i) => (g.trackFlipped[i] ? c : null)),
      flips: g.flips,
      last: g.last,
    };
  },
};
