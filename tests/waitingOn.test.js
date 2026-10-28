// waitingOn(room): the players a game is waiting on right now (see games/README.md). Pass and play
// and the "your turn" chime go by it, so it has to agree with what the game will actually take:
// played by bots only, whenever a bot has a move, that bot is one the game is waiting on.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers');
const { optionValues } = require('../lib/options');
const { pickHuman } = require('../lib/bots');
const teams = require('../lib/teams');

const ids = fs.readdirSync(path.join(__dirname, '../games')).filter((f) => f.endsWith('.js')).map((f) => path.basename(f, '.js'));

// Moves anyone may make without the game waiting on them (it carries on either way), and the
// host's moves on someone else's behalf (starting the next round for a slow player).
const OPTIONAL = {
  rideTheBus: ['play'], // anyone holding a match plays it on the pyramid
  madMax: ['join'], // anyone with cards may pile into a war
  horseRace: ['ride'], // jockeys tap while the race runs itself
  shotPoker: ['paid'], // a tab is paid straight away, though only the next deal waits for it
  boatRace: ['cheer'], // bots cheer from the side
  trackRacing: ['honk'], // a toot of the horn mid-race, whenever you like
  bigTom: ['bestQuestion'], // the end-of-round poll: the next round goes ahead without it
};
const HOST_MAY = { liarsDice: ['next'], shotPoker: ['deal'], bigTom: ['moveOn'] };
// Options that reach phases the defaults rarely do (a ton in 501 hands out sips; bluffs to answer).
const VARIANTS = {
  darts: [{ mode: 501 }, { mode: 'cricket' }],
  rideTheBus: [{ bluff: true }],
  horseRace: [{ jockey: true }],
  aceRace: [{ speed: 'manual' }],
  liarsDice: [{ loseDice: false }],
};

function check(game, t, where) {
  const list = game.waitingOn(t.room);
  assert.ok(Array.isArray(list), `${game.id}: waitingOn is an array (${where})`);
  for (const id of list) assert.ok(t.room.players.some((p) => p.id === id), `${game.id}: ${id} is a player (${where})`);
  assert.strictEqual(new Set(list).size, list.length, `${game.id}: nobody twice (${where})`);
  return list;
}

function play(game, players, skill, options = {}, steps = 1500) {
  const t = setup(game, players, options);
  for (const p of t.room.players) p.bot = 'baller';
  let idle = 0;
  for (let n = 0; n < steps && t.room.game.phase !== 'over'; n++) {
    let moved = false;
    for (let i = 0; i < players; i++) {
      const where = `phase ${t.room.game.phase}`;
      const list = check(game, t, where);
      const action = t.bot(i, skill);
      if (!action) continue;
      const { delay, ...move } = action;
      const me = t.room.players[i].id;
      const excused = OPTIONAL[game.id]?.includes(move.type) || (me === t.room.hostId && HOST_MAY[game.id]?.includes(move.type));
      if (!excused) assert.ok(list.includes(me), `${game.id}: ${me} wants to ${move.type} in ${where}, but waitingOn is [${list}]`);
      const before = JSON.stringify(t.room.game);
      game.handle(t.room, t.room.players[i], move, t.ctx);
      if (JSON.stringify(t.room.game) !== before) moved = true;
    }
    if (moved) { idle = 0; continue; }
    // Nobody had a move: the game's on the clock.
    if (t.room.timerFn) { t.fireTimer(); idle = 0; continue; }
    if (++idle > 3) break;
  }
  check(game, t, 'the end');
  if (t.room.game.phase === 'over') assert.deepStrictEqual(game.waitingOn(t.room), [], `${game.id}: a finished game waits on nobody`);
  t.cleanup();
}

for (const id of ids) {
  const game = require(`../games/${id}`);
  test(`${game.name}: waitingOn agrees with what bots do`, () => {
    assert.strictEqual(typeof game.waitingOn, 'function', `${game.id} exports waitingOn`);
    // A game bots sit out still says who it's waiting on.
    if (game.botsSitOut) {
      const t = setup(game, Math.max(2, game.minPlayers));
      assert.deepStrictEqual(check(game, t, 'start'), [t.room.hostId]);
      return;
    }
    for (const skill of [0.9, 0.25]) {
      for (const players of [Math.max(2, game.minPlayers), 4]) {
        for (const options of [{}, ...(VARIANTS[game.id] || [])]) play(game, players, skill, options);
      }
    }
  });
}

test('a turn game waits on whoever is up, and not on someone who has left', () => {
  const t = setup(require('../games/quarters'), 3);
  assert.deepStrictEqual(t.room.game.order.length, 3);
  const game = require('../games/quarters');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0']);
  t.room.players[0].connected = false;
  assert.deepStrictEqual(game.waitingOn(t.room), []);
});

test('ctx.giveTo: only to someone else who is here', () => {
  const t = setup(require('../games/kingsCup'), 3);
  t.room.players[2].connected = false;
  assert.strictEqual(t.ctx.giveTo(t.room, 'p0', 'p0', 2, 'x'), false, 'not yourself');
  assert.strictEqual(t.ctx.giveTo(t.room, 'p0', 'nobody', 2, 'x'), false, 'not someone unknown');
  assert.strictEqual(t.ctx.giveTo(t.room, 'p0', 'p2', 2, 'x'), false, 'not someone offline');
  assert.deepStrictEqual(t.drinks(), [0, 0, 0]);
  assert.strictEqual(t.ctx.giveTo(t.room, 'p0', 'p1', 2, 'x'), true);
  assert.deepStrictEqual(t.drinks(), [0, 2, 0]);
  assert.ok(t.events.some((e) => e.playerId === 'p1' && e.event === 'drink' && e.data.from === 'Player0'));
});

test('optionValues: each declared option, if it is one of the choices, else the default', () => {
  const declared = [
    { id: 'sips', default: 2, choices: [{ value: 1 }, { value: 2 }, { value: 3 }] },
    { id: 'mode', default: 'drinking', choices: [{ value: 'drinking' }, { value: 301 }] },
    { id: 'on', default: true, choices: [{ value: true }, { value: false }] },
  ];
  assert.deepStrictEqual(optionValues(declared, {}), { sips: 2, mode: 'drinking', on: true });
  assert.deepStrictEqual(optionValues(declared, { sips: 3, mode: 301, on: false, custom: { x: 1 } }), { sips: 3, mode: 301, on: false });
  assert.deepStrictEqual(optionValues(declared, { sips: '3', mode: '301', on: 'false' }), { sips: 2, mode: 'drinking', on: true });
  assert.deepStrictEqual(optionValues(undefined, undefined), {});
});

test('pickHuman: someone else, a human when there is one', () => {
  const t = setup(require('../games/kingsCup'), 4);
  t.room.players[1].bot = 'npc';
  t.room.players[3].connected = false;
  for (let i = 0; i < 30; i++) assert.strictEqual(pickHuman(t.room, 'p0'), 'p2');
  assert.strictEqual(pickHuman(t.room, 'p2'), 'p0');
  assert.strictEqual(pickHuman(t.room, 'p0', ['p0', 'p1']), 'p1', 'a bot when it is the only one');
  assert.strictEqual(pickHuman(t.room, 'p0', ['p0']), null);
});

test('teams: dealt round, moved along, joined smallest first', () => {
  const g = { teams: teams.deal(['a', 'b', 'c', 'd', 'e'], 3) };
  assert.deepStrictEqual(g.teams.map((x) => x.length), [2, 2, 1]);
  assert.strictEqual(teams.join(g, 'f'), true);
  assert.strictEqual(teams.teamOf(g, 'f'), 2);
  assert.strictEqual(teams.join(g, 'f'), false, 'already on a team');
  const from = teams.teamOf(g, 'a');
  assert.strictEqual(teams.move(g, 'a'), true);
  assert.strictEqual(teams.teamOf(g, 'a'), (from + 1) % 3);
  assert.strictEqual(teams.move(g, 'zz'), false);
  assert.deepStrictEqual(teams.view(g)[0].name, 'Red');
});
