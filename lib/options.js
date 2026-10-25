// A game's lobby options, as its start() should use them. What arrives isn't to be trusted: a
// phone can send anything, and a room saved before an option changed can hold a pick that's no
// longer one of its choices.

// Each option the game declares: the value picked, if it's one of that option's choices (exactly:
// the number 3, not the text "3"), else its default. Anything else in `picked` (like `custom`) is
// left out.
function optionValues(declared = [], picked = {}) {
  return Object.fromEntries(declared.map((o) => [
    o.id,
    o.choices.some((c) => c.value === picked?.[o.id]) ? picked[o.id] : o.default,
  ]));
}

module.exports = { optionValues };
