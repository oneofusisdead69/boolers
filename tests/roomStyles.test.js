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
