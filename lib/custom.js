// Custom game content: a game can let the host write their own (Kings Cup rules, categories…).
// The game lists what can be customised in `custom`:
//
//   { id: 'categories', kind: 'list', label, hint, maxItems, maxLen, defaults? }
//       one line per item; with defaults, the host edits the built-in list instead of adding to it
//   { id: 'cards', kind: 'cards', label, items: [{ key, label, title, text }] }
//       a title and text per item; blank means keep the built-in one
//
// The host's phone keeps their edits and sends them when the game starts. clean() keeps only what
// the game asked for, trimmed and within limits, so a phone can't send anything else; the game
// gets the result as options.custom.

const text = (max) => (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function clean(schema = [], raw = {}) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const f of schema) {
    const value = raw[f.id];
    if (f.kind === 'list' && Array.isArray(value)) {
      const items = [...new Set(value.map(text(f.maxLen || 120)).filter(Boolean))].slice(0, f.maxItems || 200);
      if (items.length) out[f.id] = items;
    } else if (f.kind === 'cards' && value && typeof value === 'object') {
      const cards = {};
      for (const item of f.items) {
        const c = value[item.key];
        if (!c || typeof c !== 'object') continue;
        const title = text(24)(c.title);
        const body = text(160)(c.text);
        if (title || body) cards[item.key] = { ...(title && { title }), ...(body && { text: body }) };
      }
      if (Object.keys(cards).length) out[f.id] = cards;
    }
  }
  return out;
}

module.exports = { clean };
