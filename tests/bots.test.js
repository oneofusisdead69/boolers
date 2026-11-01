// Every game, played by bots only, from start to finish (or for a good while, for games that go on
// until someone stops them). Player 0 stands in as the host. Each step every bot is asked what it
// would do (as the server does); when none has a move, the game's timer runs on.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers');

const ids = fs.readdirSync(path.join(__dirname, '../games')).filter((f) => f.endsWith('.js')).map((f) => path.basename(f, '.js'));

function play(game, players, skill, steps = 3000) {
  const t = setup(game, players);
  for (const p of t.room.players) p.bot = 'baller';
  let moves = 0;
  let idle = 0;
  for (let n = 0; n < steps && t.room.game.phase !== 'over'; n++) {
    let moved = false;
    for (let i = 0; i < players; i++) {
      const action = t.bot(i, skill);
      // (A bot that's only waiting to look again has nothing to do now: lib/bots.js.)
      if (!action || action.type === '_wait') continue;
      const { delay, ...move } = action;
      const before = JSON.stringify(t.room.game);
      game.handle(t.room, t.room.players[i], move, t.ctx);
      if (JSON.stringify(t.room.game) !== before) { moved = true; moves++; }
    }
    if (moved) { idle = 0; continue; }
    // Nobody had a move: let the clock run (a countdown, a race, a pause between turns).
    if (t.room.timerFn) { t.fireTimer(); idle = 0; continue; }
    if (++idle > 3) break;
  }
  t.cleanup();
  return { t, moves };
}

for (const id of ids) {
  const game = require(`../games/${id}`);
  // (A game bots only watch, like Boat Race, can't be played by bots alone.)
  if (!game.bot || game.botsSitOut) continue;
  test(`bots play ${game.name}`, () => {
    for (const skill of [0.9, 0.25]) {
      for (const players of [Math.max(2, game.minPlayers), 4]) {
        const { t, moves } = play(game, players, skill);
        assert.ok(moves > 5, `${game.name}: the bots made moves (${players} bots at ${skill})`);
        assert.ok(t.room.game.phase === 'over' || moves > 40, `${game.name}: the game got somewhere (${players} bots at ${skill}: phase ${t.room.game.phase}, ${moves} moves)`);
      }
    }
  });
}

// lib/bots.js on its own: a bot that's only waiting looks again later, without a broadcast.
test("a bot's _wait asks it again after the delay, and nothing is played or broadcast meanwhile", async () => {
  const { createBots } = require('../lib/bots');
  let asked = 0;
  const played = [];
  let broadcasts = 0;
  const games = { fake: {
    // (Nothing to do the first few times it's asked, then a move till it's made.)
    bot: () => (++asked < 4 ? { type: '_wait', delay: 5 } : played.length ? null : { type: 'go', delay: 5 }),
    handle: (room, bot, move) => { played.push(move.type); return 'quiet'; },
  } };
  const room = { code: 'TEST', players: [{ id: 'b1', bot: 'baller', connected: true }], game: { type: 'fake' } };
  const bots = createBots({ games, ctx: {}, broadcast: () => broadcasts++, trips: {} });
  bots.schedule(room);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepStrictEqual(played, ['go']);
  assert.strictEqual(broadcasts, 0);
  assert.ok(asked >= 4, `asked again each time (${asked})`);
  bots.forget(room);
});
