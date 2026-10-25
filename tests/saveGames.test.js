const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers');

// A game that carries on after a restart is saved as JSON: every game's state has to come back
// from that exactly as it was.
test('every game can be saved and read back as it was', () => {
  const dir = path.join(__dirname, '../games');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const game = require(path.join(dir, file));
    if (!game.start) continue;
    const t = setup(game, Math.max(game.minPlayers || 2, 3));
    const g = t.room.game;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(g)), g, game.id);
    t.cleanup?.();
  }
});
