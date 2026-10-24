const test = require('node:test');
const assert = require('node:assert');
const { createTrips, isDone } = require('../lib/trip');
const { createContext } = require('../lib/context');
const { waterLine, BY_STYLE } = require('../lib/water');

const games = {
  darts: { id: 'darts', name: 'Darts', minPlayers: 1 },
  kingsCup: { id: 'kingsCup', name: 'Kings Cup', minPlayers: 2 },
  liarsDice: { id: 'liarsDice', name: "Liar's Dice", minPlayers: 2 },
  bigTom: { id: 'bigTom', name: 'Big Tom', minPlayers: 3 },
};

function setup() {
  const ctx = createContext({ emit() {}, broadcast() {} });
  const room = { players: ['p0', 'p1'].map((id) => ({ id, name: id, drinks: 0, connected: true })), feed: [], game: null };
  const log = { started: [], finished: 0 };
  const trips = createTrips({
    games, ctx,
    startGame: (r, id) => { log.started.push(id); r.game = { type: id, phase: 'playing' }; },
    stopGame: (r) => { r.game = null; },
    broadcast: (r) => trips.check(r),
    finish: () => { log.finished += 1; },
  });
  return { room, trips, log };
}

test('around the world: vote, play, move on when done, and finish after the last stop', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, trips, log } = setup();
  trips.start(room, { stops: 2, mode: 'vote' });
  const v = trips.view(room, 'p0');
  assert.strictEqual(v.phase, 'voting');
  assert.strictEqual(v.options.length, 3);
  assert.ok(!v.options.includes('bigTom'), 'Big Tom needs 3 players');
  const pick = v.options[1];
  trips.vote(room, 'p0', pick);
  assert.strictEqual(trips.view(room, 'p0').phase, 'voting');
  trips.vote(room, 'p1', pick); // everyone's voted: no waiting for the clock
  assert.strictEqual(trips.view(room, 'p0').nextGame, pick);
  t.mock.timers.tick(4000);
  assert.deepStrictEqual(log.started, [pick]);
  assert.strictEqual(trips.view(room, 'p0').stop, 1);
  // The game ends: a few seconds later, the next vote, without the game just played.
  room.game.phase = 'over';
  trips.check(room);
  t.mock.timers.tick(7000);
  assert.strictEqual(room.game, null);
  assert.strictEqual(trips.view(room, 'p0').phase, 'voting');
  assert.ok(!trips.view(room, 'p0').options.slice(0, 2).includes(pick), 'new games come first');
  t.mock.timers.tick(25000); // nobody votes: one of the options wins anyway
  t.mock.timers.tick(4000);
  assert.strictEqual(log.started.length, 2);
  trips.skip(room); // the host moves on
  assert.strictEqual(room.trip, null);
  assert.strictEqual(log.finished, 1);
});

test('surprise me skips the vote', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, trips, log } = setup();
  trips.start(room, { stops: 3, mode: 'random' });
  assert.strictEqual(trips.view(room, 'p0').phase, 'next');
  t.mock.timers.tick(4000);
  assert.strictEqual(log.started.length, 1);
  trips.end(room);
});

test('endless games count as done after a few rounds', () => {
  assert.strictEqual(isDone({ type: 'horseRace', phase: 'results', race: 2 }), false);
  assert.strictEqual(isDone({ type: 'horseRace', phase: 'results', race: 3 }), true);
  assert.strictEqual(isDone({ type: 'shotPoker', phase: 'showdown', hand: 5, debts: { p0: { paid: false } } }), false);
  assert.strictEqual(isDone({ type: 'darts', phase: 'over' }), true);
});

test('water lines change, some in the room style\'s voice', () => {
  const lines = new Set(Array.from({ length: 40 }, () => waterLine('pirate')));
  assert.ok(lines.size > 3);
  assert.ok(lines.has(BY_STYLE.pirate[0]));
});
