const test = require('node:test');
const assert = require('node:assert');
const night = require('../lib/night');

test('water reminders come when the game changes, or after three games', () => {
  const room = { players: [] };
  const due = (type) => night.waterDue(room, type);
  assert.deepStrictEqual(['darts', 'darts', 'darts', 'darts'].map(due), [false, false, false, true]);
  assert.strictEqual(due('kingsCup'), true); // switched games
  assert.strictEqual(due('kingsCup'), false);
  assert.strictEqual(due('liarsDice'), true);
});
