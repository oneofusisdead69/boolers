// Kings Cup: the deck is laid face down in a ring around the King's Cup. Take turns picking a card
// from the ring; every card has a rule. The first three kings pour into the King's Cup, and
// whoever draws the fourth drinks it.
//
// The phones do the bookkeeping: they remember mates (your mate drinks when you do), the question
// master and any rules people make, and they run the reaction cards (4 Floor, 7 Heaven) as a
// tap race where the last to tap drinks. Without reactions (pass and play), the drawer says who
// was last.
//
// Break the circle (optional): pick a card next to a spot that's already empty and you've broken
// the circle, so you finish your drink.

const { newDeck, rankName } = require('../lib/cards');

const RACE_MS = 10000;

const CARDS = {
  14: { title: 'Waterfall', kind: 'info', text: 'Everyone starts drinking. You can stop only when the person before you stops. You start, and stop whenever you like.' },
  2: { title: 'You', kind: 'pick', sips: 2, text: 'Pick someone to drink 2 sips.' },
  3: { title: 'Me', kind: 'self', sips: 3, text: 'You drink 3 sips.' },
  4: { title: 'Floor', kind: 'race', sips: 2, text: 'Everyone touch the floor! Last one drinks 2 sips.' },
  5: { title: 'Guys', kind: 'info', text: 'All the guys drink.' },
  6: { title: 'Girls', kind: 'info', text: 'All the girls drink.' },
  7: { title: 'Heaven', kind: 'race', sips: 2, text: 'Hands up to heaven! Last one drinks 2 sips.' },
  8: { title: 'Mate', kind: 'mate', text: 'Pick a mate. For the rest of the game, whenever one of you drinks, so does the other.' },
  9: { title: 'Rhyme', kind: 'prompt', text: 'Go around saying words that rhyme with the word below. First to stall or repeat drinks.' },
  10: { title: 'Categories', kind: 'prompt', text: 'Go around naming things in the category below. First to stall or repeat drinks.' },
  11: { title: 'Make a rule', kind: 'rule', text: 'Make a rule everyone must follow for the rest of the game. Break it, drink.' },
  12: { title: 'Question master', kind: 'qm', text: 'You are the question master until the next queen. Anyone who answers a question you ask drinks.' },
  13: { title: "King's Cup", kind: 'king', text: 'Pour some of your drink into the King\'s Cup.' },
};

const RHYMES = ['cat', 'bed', 'light', 'cake', 'shot', 'beer', 'fun', 'night', 'game', 'dance', 'drink', 'ring', 'star', 'bus', 'king', 'cup', 'house', 'blue', 'fly', 'tree', 'hat', 'rain', 'phone', 'goal', 'ice', 'bar', 'moon', 'dog', 'fire', 'cheese'];
const CATEGORIES = ['Beers', 'Cocktails', 'Car brands', 'Pizza toppings', 'Countries in Europe', 'Disney movies', 'Breakfast cereals', 'Things in a kitchen', 'Superheroes', 'Fast food chains', 'Card games', 'Dog breeds', 'Sports teams', 'Things that are yellow', 'Board games', 'Famous Taylors', 'Fruits', 'TV sitcoms', 'Video game characters', 'Words that start with Q', 'Ice cream flavors', 'US states', 'Rappers', 'Things you find at a party', 'Ways to say drunk', 'Shoe brands', 'Musicals', 'Animals in a zoo', 'Things in a bathroom', 'Candy bars'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Drinks for a player and, one step out, their mates.
function drinkWithMates(room, ctx, id, sips, reason, from = null) {
  const g = room.game;
  ctx.drink(room, id, sips, reason, from);
  for (const [a, b] of g.mates) {
    const mate = a === id ? b : b === id ? a : null;
    if (mate && mate !== from) ctx.drink(room, mate, sips, `${ctx.name(room, id)}'s mate`);
  }
}

function nextTurn(room, ctx) {
  const g = room.game;
  ctx.clearTimer(room);
  g.turnId = ctx.turns.next(room, g.order, g.turnId) || g.turnId;
  g.phase = 'draw';
  g.card = null;
  g.resolved = false;
  g.race = null;
  g.broke = false;
}

function endRace(room, ctx) {
  const g = room.game;
  if (g.phase !== 'race') return;
  ctx.clearTimer(room);
  const rule = g.cards[g.card.rank];
  const waiting = ctx.connectedPlayers(room).filter((p) => !g.race.tapped.includes(p.id)).map((p) => p.id);
  // Last one in: whoever is left when everyone else has tapped (or everyone who hadn't by the deadline).
  const losers = waiting.length ? waiting : g.race.tapped.slice(-1);
  g.race.losers = losers;
  for (const id of losers) drinkWithMates(room, ctx, id, rule.sips, `last for ${rule.title}`);
  g.phase = 'card';
  g.resolved = true;
}

module.exports = {
  id: 'kingsCup',
  name: 'Kings Cup',
  description: 'Draw a card, follow its rule. Whoever draws the fourth king drinks the cup.',
  minPlayers: 2,
  order: 5,
  options: [
    {
      id: 'reactions',
      label: 'Floor & Heaven: last to tap on their phone drinks',
      default: true,
      choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }],
    },
    {
      id: 'circle',
      label: 'Break the circle: pick a card next to a gap, finish your drink',
      default: true,
      choices: [{ value: true, label: 'On' }, { value: false, label: 'Off' }],
    },
  ],
  custom: [
    {
      id: 'cards',
      kind: 'cards',
      label: 'Card rules',
      hint: 'Change what a card says. Leave a box blank to keep the usual rule. What the phones do stays the same (2 still has you pick who drinks, 8 a mate…).',
      items: [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => ({ key: String(r), label: { 14: 'A', 11: 'J', 12: 'Q', 13: 'K' }[r] || String(r), title: CARDS[r].title, text: CARDS[r].text })),
    },
    { id: 'categories', kind: 'list', label: 'Categories (10)', hint: 'One per line', maxItems: 200, maxLen: 60, defaults: CATEGORIES },
    { id: 'rhymes', kind: 'list', label: 'Words to rhyme with (9)', hint: 'One per line', maxItems: 200, maxLen: 30, defaults: RHYMES },
  ],
  CARDS,

  start(room, ctx, options = {}) {
    const order = room.players.map((p) => p.id);
    const custom = options.custom || {};
    Object.assign(room.game, {
      order,
      // The host's own wording for any card, on top of the usual rules.
      cards: Object.fromEntries(Object.entries(CARDS).map(([r, card]) => [r, { ...card, ...custom.cards?.[r] }])),
      categories: custom.categories || CATEGORIES,
      rhymes: custom.rhymes || RHYMES,
      deck: newDeck(), // the ring: deck[slot] is the card lying in that spot
      taken: [], // slots already drawn
      reactions: options.reactions !== false,
      circle: options.circle !== false,
      broke: false, // the card just drawn broke the circle
      turnId: order[0],
      phase: 'draw',
      card: null,
      prompt: null,
      resolved: false,
      kings: 0,
      mates: [],
      qm: null,
      rules: [],
      race: null,
      history: [],
      loserId: null,
    });
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const myTurn = me === g.turnId;
    const target = action.targetId && action.targetId !== me ? ctx.player(room, action.targetId) : null;
    const rule = g.card && g.cards[g.card.rank];

    if (action.type === 'draw' && g.phase === 'draw' && myTurn) {
      // You pick your card from the ring (or, with no pick, the first one still there).
      let slot = Number(action.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= g.deck.length || g.taken.includes(slot)) {
        slot = g.deck.findIndex((_, i) => !g.taken.includes(i));
      }
      const card = g.deck[slot];
      const n = g.deck.length;
      g.broke = g.circle && [(slot + 1) % n, (slot + n - 1) % n].some((s) => g.taken.includes(s));
      g.taken.push(slot);
      g.card = card;
      g.history.push({ by: me, card, slot });
      const r = g.cards[card.rank];
      g.prompt = card.rank === 9 ? pick(g.rhymes) : card.rank === 10 ? pick(g.categories) : null;
      g.resolved = ['info', 'prompt', 'self', 'qm', 'king'].includes(r.kind);
      g.phase = 'card';
      ctx.log(room, `🃏 ${player.name} drew ${rankName(card.rank)}: ${r.title}`);
      if (g.broke) {
        ctx.log(room, `💥 ${player.name} broke the circle`);
        ctx.finishDrink(room, me, 'broke the circle');
      }
      if (r.kind === 'self') drinkWithMates(room, ctx, me, r.sips, 'Me');
      else if (r.kind === 'qm') g.qm = me;
      else if (r.kind === 'king') {
        g.kings += 1;
        if (g.kings === 4) {
          g.phase = 'over';
          g.loserId = me;
          ctx.finishDrink(room, me, "drew the fourth king: drink the King's Cup");
        }
      } else if (r.kind === 'race' && g.reactions) {
        g.phase = 'race';
        g.race = { tapped: [], losers: null };
        g.raceEndsAt = Date.now() + RACE_MS;
        ctx.setTimer(room, RACE_MS, () => endRace(room, ctx));
      }
    } else if (action.type === 'tap' && g.phase === 'race' && !g.race.tapped.includes(me)) {
      g.race.tapped.push(me);
      const waiting = ctx.connectedPlayers(room).filter((p) => !g.race.tapped.includes(p.id));
      if (waiting.length <= 1) endRace(room, ctx);
    } else if (action.type === 'pick' && g.phase === 'card' && myTurn && !g.resolved && target) {
      // 2 (You), or a race card without reactions: the drawer names who drinks.
      drinkWithMates(room, ctx, target.id, rule.sips, rule.kind === 'race' ? `last for ${rule.title}` : rule.title, rule.kind === 'pick' ? me : null);
      g.resolved = true;
    } else if (action.type === 'mate' && g.phase === 'card' && myTurn && !g.resolved && rule.kind === 'mate' && target) {
      // Picking someone who's already your mate doesn't make a second pair.
      if (!g.mates.some(([a, b]) => (a === me && b === target.id) || (a === target.id && b === me))) g.mates.push([me, target.id]);
      g.resolved = true;
      ctx.log(room, `🤝 ${player.name} and ${target.name} are mates`);
    } else if (action.type === 'rule' && g.phase === 'card' && myTurn && !g.resolved && rule.kind === 'rule') {
      const text = String(action.text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!text) return;
      g.rules.push({ by: me, text });
      g.resolved = true;
      ctx.log(room, `📜 New rule from ${player.name}: ${text}`);
    } else if (action.type === 'next' && g.phase === 'card' && myTurn && g.resolved) {
      nextTurn(room, ctx);
    }
  },

  // If the player whose turn it is drops out, play moves on; a dropped phone never holds up a race.
  check(room, ctx) {
    const g = room.game;
    if (g.phase === 'race') {
      const waiting = ctx.connectedPlayers(room).filter((p) => !g.race.tapped.includes(p.id));
      if (waiting.length <= 1) endRace(room, ctx);
    } else if ((g.phase === 'draw' || g.phase === 'card') && !ctx.turns.isActive(room, g.turnId)) {
      nextTurn(room, ctx);
    }
  },

  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room, player) {
    const g = room.game;
    return {
      turnId: g.turnId,
      card: g.card,
      rule: g.card ? g.cards[g.card.rank] : null,
      prompt: g.prompt,
      resolved: g.resolved,
      kings: g.kings,
      mates: g.mates,
      qm: g.qm,
      rules: g.rules,
      race: g.race && { ...g.race, endsAt: g.raceEndsAt, ms: RACE_MS, iTapped: g.race.tapped.includes(player.id) },
      reactions: g.reactions,
      circle: g.circle,
      broke: g.broke,
      ringSize: g.deck.length,
      taken: g.taken,
      deckLeft: g.deck.length - g.taken.length,
      history: g.history.slice(-6),
      loserId: g.loserId,
    };
  },
};
