const test = require('node:test');
const assert = require('node:assert');
const ROOM_STYLES = require('../lib/roomStyles');

test('every room style has a full set of colours, a font and a table', () => {
  assert.ok(ROOM_STYLES.IDS.includes('classic'));
  for (const id of ROOM_STYLES.IDS.filter((x) => x !== 'classic')) {
    const s = ROOM_STYLES.STYLES[id];
    for (const v of ['bg', 'card', 'card-2', 'text', 'muted', 'accent', 'accent-text', 'danger', 'ok']) assert.ok(s.vars[v], `${id} ${v}`);
    assert.ok(s.font && s.felt && s.rim && s.bg && s.label && s.emoji, id);
  }
  assert.match(ROOM_STYLES.css(), /html\[data-room="dive"\]/);
});

test('the Lighthouse is one room whose weather changes: night, day, fog and storm', () => {
  const { STYLES, PICKABLE, roomOf, pickMood } = ROOM_STYLES;
  const moods = STYLES.lighthouse.moods.map(([look]) => look);
  assert.deepStrictEqual(moods, ['lighthouse', 'lighthouseDay', 'lighthouseFog', 'storm']);
  // Only the Lighthouse itself is on the list to pick from.
  assert.ok(PICKABLE.includes('lighthouse'));
  for (const look of moods.slice(1)) {
    assert.ok(!PICKABLE.includes(look), look);
    assert.strictEqual(roomOf(look), 'lighthouse');
  }
  assert.strictEqual(roomOf('dive'), 'dive');
  // A new mood is never the one it's already in, and every mood comes up.
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const next = pickMood('lighthouse', 'lighthouseFog');
    assert.notStrictEqual(next, 'lighthouseFog');
    seen.add(next);
  }
  assert.deepStrictEqual([...seen].sort(), ['lighthouse', 'lighthouseDay', 'storm']);
  assert.strictEqual(pickMood('dive'), null);
});
