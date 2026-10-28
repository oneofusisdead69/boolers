// The toolkit every game module receives as `ctx`. The server and the tests both build one
// with createContext, so games behave the same in both.
//
//   emit(room, playerId, event, data)  send a one-off event to one player's phone
//   broadcast(room)                    push fresh state to every phone in the room

const cards = require('./cards');
const dice = require('./dice');
const turns = require('./turns');
const night = require('./night');

const FEED_SIZE = 20;

// signal(room, event, data): a small message for every phone and TV in the room, for updates too
// frequent to send the whole state for (where a dart is aimed).
// bank: Big Tom's saved questions (lib/questionBank.js), on the server only. Pass and play has
// none, so the game goes without (no best-question poll, only the built-in questions).
function createContext({ emit, broadcast, signal = () => {}, bank = null }) {
  let feedId = 0;

  const ctx = {
    cards,
    dice,
    turns,
    bank,

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
    // replaces the old. room.deadline lets phones show a countdown. An fn that returns 'quiet'
    // has already told everyone what changed (ctx.signal), as a game's handle can: no broadcast
    // (a race ticking many times a second).
    setTimer(room, ms, fn) {
      ctx.clearTimer(room);
      room.deadline = Date.now() + ms;
      room.timerFn = () => {
        ctx.clearTimer(room);
        if (fn() !== 'quiet') broadcast(room);
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
      if (from) night.given(room, from, sips);
      p.drinks += sips;
      p.total = (p.total || 0) + sips; // the whole night in this room, across games
      const s = `${sips} sip${sips === 1 ? '' : 's'}`;
      const by = from ? ` from ${ctx.name(room, from)}` : '';
      ctx.log(room, `🍺 ${p.name} drinks ${s}${by}${reason ? ` (${reason})` : ''}`);
      emit(room, playerId, 'drink', { sips, reason, from: from ? ctx.name(room, from) : null, ...(title && { title }) });
    },

    // A player hands out sips they've won (`fromId` picked `targetId`): to anyone else who's here.
    // Returns false, and gives nothing, for themselves, someone unknown, or someone who's left or
    // is offline (a stale pick from a phone), so the giver can pick again.
    giveTo(room, fromId, targetId, sips, reason = '') {
      if (!targetId || targetId === fromId || !turns.isActive(room, targetId)) return false;
      ctx.drink(room, targetId, sips, reason, fromId);
      return true;
    },

    // Tells a player to finish their whole drink.
    finishDrink(room, playerId, reason = '') {
      const p = ctx.player(room, playerId);
      if (!p) return;
      p.finished = (p.finished || 0) + 1;
      ctx.log(room, `🍺 ${p.name} finishes their drink${reason ? ` (${reason})` : ''}`);
      emit(room, playerId, 'drink', { title: 'FINISH YOUR DRINK', reason });
    },

    // A moment worth remembering in the end-of-night recap. The biggest `value` for each `key`
    // is kept, e.g. ctx.highlight(room, 'dartsBest', id, 140, 'Bea threw 140 in one turn').
    highlight(room, key, playerId, value, text) {
      night.highlight(room, key, playerId, value, text);
    },

    // A quick update for everyone, without sending the whole state (see createContext).
    signal(room, event, data) {
      signal(room, event, data);
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
