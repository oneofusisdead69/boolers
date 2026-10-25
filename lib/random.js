// Chance, for the games and the bots. Plain JS with no Node APIs: games/ run in the browser too
// (pass and play, via lib/bundle.js), so everything here has to.

// A shuffled copy (the list itself is left alone).
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A normally distributed random number (mean 0, spread 1): how far off a throw or a flick goes.
function gauss() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// One of the list at random (undefined if it's empty).
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// n kept between lo and hi. Anything that isn't a number (a phone can send anything) counts as 0.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));

// A number in [0, 1) that's always the same for the same parts. A bot is asked twice before it
// acts (once to schedule, once to act), so a choice it makes once per roll or card (a flinch, not
// noticing a match) can't be a fresh coin each time it's asked.
function steady(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

module.exports = { shuffle, gauss, pick, clamp, steady };
