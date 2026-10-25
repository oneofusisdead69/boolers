const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoomStore } = require('../lib/roomStore');

const games = { darts: { name: 'Darts', options: [{ id: 'sips', default: 2 }] }, kingsCup: { name: 'Kings Cup' } };

test('rooms are saved and come back after a restart, with the game carrying on', async () => {
  const file = path.join(os.tmpdir(), `rooms-${process.pid}.json`);
  const store = createRoomStore({ kind: 'file', file });
  const room = {
    code: 'ABCD', hostId: 'p0', selectedGame: 'darts', options: { darts: { sips: 3 } }, style: 'lighthouse', mood: 'lighthouseFog', moodUntil: 123, feed: [],
    players: [{ id: 'p0', name: 'Alex', drinks: 4, total: 9, connected: true, socketId: 'x', drink: '🍹' }],
    game: { type: 'darts', phase: 'throwing', darts: [{ seg: { n: 20, m: 3 } }] }, gameNo: 2, updatedAt: Date.now(),
  };
  store.save(room);
  await store.flush();
  const lines = [];
  const [back] = await createRoomStore({ kind: 'file', file }).load({ games, log: (r, text) => lines.push(text) });
  assert.strictEqual(back.code, 'ABCD');
  assert.strictEqual(back.style, 'lighthouse');
  assert.strictEqual(back.mood, 'lighthouseFog');
  assert.deepStrictEqual(back.game, room.game);
  assert.strictEqual(back.gameNo, 2);
  assert.ok(back.graceUntil > Date.now(), 'everyone gets a moment to reconnect');
  assert.deepStrictEqual(back.options.darts, { sips: 3 });
  assert.deepStrictEqual(back.options.kingsCup, {});
  assert.strictEqual(back.players[0].total, 9);
  assert.strictEqual(back.players[0].drink, '🍹');
  assert.strictEqual(back.players[0].connected, false);
  assert.match(lines[0], /Darts carries on where it was/);
  await store.remove('ABCD');
  assert.deepStrictEqual(await createRoomStore({ kind: 'file', file }).load({ games, log() {} }), []);
  fs.rmSync(file, { force: true });
});

test('a game caught on a timer, or on Around the World, goes back to the lobby after a restart', async () => {
  const file = path.join(os.tmpdir(), `rooms-timer-${process.pid}.json`);
  const store = createRoomStore({ kind: 'file', file });
  const base = { hostId: 'p0', selectedGame: 'darts', options: {}, feed: [], players: [{ id: 'p0', name: 'Alex', connected: true }], updatedAt: Date.now() };
  store.save({ ...base, code: 'TIME', game: { type: 'darts', phase: 'turnEnd' }, timer: {} });
  store.save({ ...base, code: 'TRIP', game: { type: 'darts', phase: 'throwing' }, trip: { stops: 3, stop: 1, mode: 'vote', played: [] } });
  await store.flush();
  const lines = [];
  const back = await createRoomStore({ kind: 'file', file }).load({ games, log: (r, text) => lines.push(`${r.code} ${text}`) });
  for (const r of back) assert.strictEqual(r.game, null, r.code);
  assert.ok(lines.some((l) => /^TIME .*went back to the lobby/.test(l)));
  fs.rmSync(file, { force: true });
});

test('without a store, nothing is saved', async () => {
  const store = createRoomStore({ kind: undefined });
  assert.strictEqual(store.enabled, false);
  store.save({ code: 'X' });
  assert.deepStrictEqual(await store.load({ games, log() {} }), []);
});
