// Helpers for testing game modules without a server or phones.
//
//   const { setup } = require('./helpers');
//   const t = setup(require('../games/myGame'), 4);   // room with 4 players, game started
//   t.act(0, 'roll');                                  // player 0 sends { type: 'roll' }
//   t.view(1);                                         // what player 1's phone would get
//   t.fireTimer();                                     // skip ahead to the current timer

const { createContext } = require('../lib/context');
const { createQuestionBank } = require('../lib/questionBank');

function makeRoom(count) {
  return {
    code: 'TEST',
    hostId: 'p0',
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i}`, name: `Player${i}`, drinks: 0, connected: true,
    })),
    feed: [],
    game: null,
    timer: null,
    deadline: null,
  };
}

// As on the server, Big Tom gets a question bank: a fresh one in memory, unless `bank` is given
// (null for none, as in pass and play).
function setup(game, count, options = {}, { bank = createQuestionBank({ kind: 'memory' }) } = {}) {
  const room = makeRoom(count);
  const events = [];
  const ctx = createContext({
    emit: (r, playerId, event, data) => events.push({ playerId, event, data }),
    broadcast: () => {},
    bank,
  });
  const opts = Object.fromEntries((game.options || []).map((o) => [o.id, o.default]));
  room.game = { type: game.id };
  game.start(room, ctx, { ...opts, ...options });

  const t = {
    room,
    ctx,
    events,
    player: (i) => room.players[i],
    act(i, type, data = {}) {
      game.handle(room, room.players[i], { type, ...data }, ctx);
      return t;
    },
    view: (i) => game.view(room, room.players[i], ctx),
    fireTimer() {
      if (!room.timerFn) throw new Error('No timer is set');
      room.timerFn();
      return t;
    },
    disconnect(i) {
      room.players[i].connected = false;
      game.check?.(room, ctx);
      return t;
    },
    drinks: () => room.players.map((p) => p.drinks),
    // What player i would do as a bot at this skill (see games/README.md, Bots).
    bot: (i, skill = 0.6) => game.bot?.(room, room.players[i], ctx, skill) ?? null,
    cleanup: () => ctx.clearTimer(room),
  };
  return t;
}

module.exports = { makeRoom, setup };
