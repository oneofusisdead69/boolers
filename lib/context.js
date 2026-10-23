// The toolkit every game module receives as `ctx`. The server and the tests both build one
// with createContext, so games behave the same in both.
//
//   emit(room, playerId, event, data)  send a one-off event to one player's phone
//   broadcast(room)                    push fresh state to every phone in the room

const cards = require('./cards');
const dice = require('./dice');
const turns = require('./turns');

const FEED_SIZE = 20;

function createContext({ emit, broadcast }) {
  let feedId = 0;

  const ctx = {
    cards,
    dice,
    turns,

    player(room, id) {
      return room.players.find((p) => p.id === id) || null;
    },

    connectedPlayers(room) {
      return room.players.filter((p) => p.connected);
    },

    name(room, id) {
      return ctx.player(room, id)?.name ?? '???';
    },

    // Runs fn after ms, then re-broadcasts. Only one timer per room; setting a new one
    // replaces the old. room.deadline lets phones show a countdown.
    setTimer(room, ms, fn) {
      ctx.clearTimer(room);
      room.deadline = Date.now() + ms;
      room.timerFn = () => {
        ctx.clearTimer(room);
        fn();
        broadcast(room);
      };
      room.timer = setTimeout(room.timerFn, ms);
    },

    clearTimer(room) {
      if (room.timer) clearTimeout(room.timer);
      room.timer = null;
      room.timerFn = null;
      room.deadline = null;
    },

    // Adds a line to the room's activity feed, shown on every phone.
    log(room, text) {
      room.feed.push({ id: ++feedId, text, at: Date.now() });
      if (room.feed.length > FEED_SIZE) room.feed.shift();
    },

    // Gives a player sips: adds to their tally, logs it and buzzes their phone.
    // `from` is the id of the player who handed them out, if any.
    drink(room, playerId, sips, reason = '', from = null) {
      const p = ctx.player(room, playerId);
      if (!p || sips <= 0) return;
      p.drinks += sips;
      const s = `${sips} sip${sips === 1 ? '' : 's'}`;
      const by = from ? ` from ${ctx.name(room, from)}` : '';
      ctx.log(room, `🍺 ${p.name} drinks ${s}${by}${reason ? ` (${reason})` : ''}`);
      emit(room, playerId, 'drink', { sips, reason, from: from ? ctx.name(room, from) : null });
    },

    // Sends everyone back to the lobby.
    endGame(room) {
      ctx.clearTimer(room);
      room.game = null;
    },
  };
  return ctx;
}

module.exports = { createContext };
