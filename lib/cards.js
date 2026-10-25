// Standard playing cards. A card is { rank, suit } where rank is 2..14 (11=J, 12=Q, 13=K, 14=A)
// and suit is one of 'S', 'H', 'D', 'C'. Jokers are { rank: 0, suit: 'X' }.

const { shuffle } = require('./random');

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs', X: 'Joker' };
const RANK_NAMES = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace', 0: 'Joker' };

function newDeck({ jokers = 0, decks = 1 } = {}) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) cards.push({ rank, suit });
    for (let j = 0; j < jokers; j++) cards.push({ rank: 0, suit: 'X' });
  }
  return shuffle(cards);
}

// Draws one card, reshuffling a fresh deck in if the pile runs out.
function draw(deck, opts) {
  if (deck.length === 0) deck.push(...newDeck(opts));
  return deck.pop();
}

function color(card) {
  if (card.suit === 'X') return 'joker';
  return card.suit === 'H' || card.suit === 'D' ? 'red' : 'black';
}

// Numeric value for comparisons. Aces are high (14) unless aceLow is set (1).
function value(card, { aceLow = false } = {}) {
  return aceLow && card.rank === 14 ? 1 : card.rank;
}

function rankName(rank) {
  return RANK_NAMES[rank] || String(rank);
}

function label(card) {
  if (card.suit === 'X') return 'Joker';
  return `${rankName(card.rank)} of ${SUIT_NAMES[card.suit]}`;
}

module.exports = { SUITS, SUIT_NAMES, shuffle, newDeck, draw, color, value, rankName, label };
