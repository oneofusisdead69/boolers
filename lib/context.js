// The toolkit every game module receives as `ctx`. The server and the tests both build one
// with createContext, so games behave the same in both.
//
//   emit(room, playerId, event, data)  send a one-off event to one player's phone
//   broadcast(room)                    push fresh state to every phone in the room

const cards = require('./cards');
const dice = require('./dice');
const turns = require('./turns');

const FEED_SIZE = 20;
const HOUR = 60 * 60 * 1000;
// A water break comes round after this many sips per person in the room.
const SIPS_PER_BREAK = 12;

// Pacing (room.settings): `cap` sips per person per hour (0 = no limit), after which their sips
// turn into sips of water; `breaks` calls a water break for everyone every so often. A player can
// also switch to water mode themselves (player.waterMode): their sips are all water.

function createContext({ emit, broadcast, notifyAll }) {
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
    // `from` is the id of the player who handed them out, if any; `title` replaces the alert's
    // "DRINK 3 SIPS" heading (e.g. "TAKE 1 SHOT + 3 SIPS").
    drink(room, playerId, sips, reason = '', from = null, { title } = {}) {
      const p = ctx.player(room, playerId);
      if (!p || sips <= 0) return;
      const pacing = ctx.pacing(room, p, sips);
      if (pacing) {
        p.water = (p.water || 0) + sips;
        const s = `${sips} sip${sips === 1 ? '' : 's'}`;
        ctx.log(room, `💧 ${p.name} sips water ×${sips}${reason ? ` (${reason})` : ''}`);
        emit(room, playerId, 'drink', {
          sips, reason, from: from ? ctx.name(room, from) : null, water: true,
          title: `${s.toUpperCase()} OF WATER`,
          why: pacing === 'cap' ? `That's ${room.settings.cap} sips this hour, so water for now` : 'Water mode',
        });
        return;
      }
      (p.log ||= []).push([Date.now(), sips]);
      ctx.waterBreak(room, sips);
      p.drinks += sips;
      p.total = (p.total || 0) + sips; // the whole night in this room, across games
      const s = `${sips} sip${sips === 1 ? '' : 's'}`;
      const by = from ? ` from ${ctx.name(room, from)}` : '';
      ctx.log(room, `🍺 ${p.name} drinks ${s}${by}${reason ? ` (${reason})` : ''}`);
      emit(room, playerId, 'drink', { sips, reason, from: from ? ctx.name(room, from) : null, ...(title && { title }) });
    },

    // Tells a player to finish their whole drink.
    finishDrink(room, playerId, reason = '') {
      const p = ctx.player(room, playerId);
      if (!p) return;
      if (ctx.pacing(room, p, 0)) {
        ctx.log(room, `💧 ${p.name} finishes a glass of water${reason ? ` (${reason})` : ''}`);
        emit(room, playerId, 'drink', { title: 'FINISH YOUR WATER', reason, water: true });
        return;
      }
      p.finished = (p.finished || 0) + 1;
      ctx.log(room, `🍺 ${p.name} finishes their drink${reason ? ` (${reason})` : ''}`);
      emit(room, playerId, 'drink', { title: 'FINISH YOUR DRINK', reason });
    },

    // Why this player's next sips should be water, if they should: 'mode' (they asked for water)
    // or 'cap' (they've hit the room's hourly limit).
    pacing(room, p, sips) {
      if (p.waterMode) return 'mode';
      const cap = room.settings?.cap || 0;
      if (!cap) return null;
      const now = Date.now();
      p.log = (p.log || []).filter(([t]) => now - t < HOUR);
      const recent = p.log.reduce((n, [, x]) => n + x, 0);
      return recent + Math.max(sips, 1) > cap ? 'cap' : null;
    },

    // Every so often (by how much the room has drunk), everyone has a glass of water.
    waterBreak(room, sips) {
      if (room.settings?.breaks === false) return;
      room.sipsSinceBreak = (room.sipsSinceBreak || 0) + sips;
      const people = Math.max(2, ctx.connectedPlayers(room).length);
      if (room.sipsSinceBreak < SIPS_PER_BREAK * people) return;
      room.sipsSinceBreak = 0;
      ctx.log(room, '💧 Water break! Everyone have a glass of water');
      const notice = { title: '💧 WATER BREAK', text: 'Everyone have a glass of water before carrying on.' };
      if (notifyAll) notifyAll(room, 'notice', notice);
      else for (const p of room.players) emit(room, p.id, 'notice', notice);
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
