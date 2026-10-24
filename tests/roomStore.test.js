const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoomStore } = require('../lib/roomStore');

const games = { darts: { name: 'Darts', options: [{ id: 'sips', default: 2 }] }, kingsCup: { name: 'Kings Cup' } };

test('rooms are saved and come back after a restart, minus the game in progress', async () => {
  const file = path.join(os.tmpdir(), `rooms-${process.pid}.json`);
  const store = createRoomStore({ kind: 'file', file });
  const room = {
    code: 'ABCD', hostId: 'p0', selectedGame: 'darts', options: { darts: { sips: 3 } }, style: 'tavern', feed: [],
    players: [{ id: 'p0', name: 'Alex', drinks: 4, total: 9, connected: true, socketId: 'x' }],
    game: { type: 'darts', phase: 'throwing' }, updatedAt: Date.now(),
  };
  store.save(room);
  await store.flush();
  const lines = [];
  const [back] = await createRoomStore({ kind: 'file', file }).load({ games, log: (r, text) => lines.push(text) });
  assert.strictEqual(back.code, 'ABCD');
  assert.strictEqual(back.style, 'tavern');
  assert.strictEqual(back.game, null);
  assert.deepStrictEqual(back.options.darts, { sips: 3 });
  assert.deepStrictEqual(back.options.kingsCup, {});
  assert.strictEqual(back.players[0].total, 9);
  assert.strictEqual(back.players[0].connected, false);
  assert.match(lines[0], /Darts went back to the lobby/);
  await store.remove('ABCD');
  assert.deepStrictEqual(await createRoomStore({ kind: 'file', file }).load({ games, log() {} }), []);
  fs.rmSync(file, { force: true });
});

test('without a store, nothing is saved', async () => {
  const store = createRoomStore({ kind: undefined });
  assert.strictEqual(store.enabled, false);
  store.save({ code: 'X' });
  assert.deepStrictEqual(await store.load({ games, log() {} }), []);
});
