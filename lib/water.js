// The water reminder between games: a different line each time, some in the room style's voice.

const ANY = [
  'Hydration check! Everyone have some water before the next game.',
  'Water: the official chaser of champions.',
  'Pro tip: water now, legend later.',
  'Your liver called. It would like a glass of water.',
  'Halftime! Grab some water, you magnificent people.',
  'Tomorrow-you says thanks for this glass of water.',
  'Plot twist: the next drink is water.',
];

const BY_STYLE = {
  dive: ["The bartender's cutting you off… from dehydration. Have some water."],
  tavern: ['The innkeeper insists: a cup of water before the next round, traveller.'],
  club: ['Hydrate before you dance-floor-ate.'],
  castle: ['By royal decree, everyone drinks a goblet of water.'],
  jazz: ['Take five. And a glass of water.'],
  diner: ['Free refills on water, hon.'],
  tiki: ['Coconut water counts. Regular water counts more.'],
  speakeasy: ["The coppers are coming. Look innocent: drink some water."],
  casino: ['The house buys this round: water.'],
  saloon: ['Even cowboys drink water, partner.'],
  pirate: ['Arr, even pirates need fresh water, matey.'],
  beerhall: ['Prost! (With water this time.)'],
  space: ['Ground control to Major Thirst: drink some water.'],
  christmas: ["Santa's watching. Have some water."],
  halloween: ["Don't end up a mummy: drink some water. 💀"],
  stpatricks: ['Even leprechauns hydrate. Water before the next pint!'],
};

// A line for this room. Its own style's line comes up about half the time.
function waterLine(style, rand = Math.random) {
  const own = BY_STYLE[style] || [];
  const pool = own.length && rand() < 0.5 ? own : ANY;
  return pool[Math.floor(rand() * pool.length)];
}

module.exports = { waterLine, ANY, BY_STYLE };
