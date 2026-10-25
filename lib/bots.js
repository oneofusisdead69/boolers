// Bots: players the host adds from the lobby, at three levels: Booler (great), Baller (medium)
// and NPV (bad). No more than MAX in a room. A bot is a player who's always connected but has no
// phone: whenever the room changes, each game is asked what its bots would do (its `bot()`, see
// games/README.md), and after a moment's thought (a human-ish pause) the bot does it.
//
//   room.players: { ..., bot: 'booler' | 'baller' | 'npv' }

const LEVELS = {
  booler: { name: 'Booler', skill: 0.9, avatar: '😎' },
  baller: { name: 'Baller', skill: 0.6, avatar: '🤖' },
  npv: { name: 'NPV', skill: 0.25, avatar: '🥴' },
};
const MAX = 3;
// How long a bot thinks before it acts (ms): longer for the bad ones, and never the same twice.
const think = (skill) => 900 + Math.random() * 1400 + (1 - skill) * 700;

const isBot = (p) => !!p?.bot;
const humans = (room) => room.players.filter((p) => !p.bot);

function createBots({ games, ctx, broadcast, trips }) {
  const timers = new Map(); // `${room.code}:${botId}` -> timeout
  const stuck = new Map(); // the same key -> { sig, n }: moves the game wouldn't take, in a row

  // Adds a bot at a level, named after it (Booler, Booler 2, ...). Returns the bot, or null.
  function add(room, level, choose) {
    const L = LEVELS[level];
    if (!L || room.players.filter(isBot).length >= MAX) return null;
    let name = L.name;
    for (let n = 2; room.players.some((p) => p.name.toLowerCase() === name.toLowerCase()); n++) name = `${L.name} ${n}`;
    const bot = {
      id: `bot-${level}-${Math.random().toString(36).slice(2, 8)}`,
      key: null,
      name,
      bot: level,
      drinks: 0,
      connected: true,
      socketId: null,
      ...choose({ avatar: L.avatar }, room.players),
    };
    room.players.push(bot);
    if (room.game) games[room.game.type].onJoin?.(room, bot, ctx);
    return bot;
  }

  // What a bot would do now, or null. A game's bot() that throws is a bot that sits still.
  function decide(room, bot) {
    try {
      if (room.game) return games[room.game.type].bot?.(room, bot, ctx, LEVELS[bot.bot].skill) || null;
      // Between games on a trip: everyone votes for the next game.
      const t = room.trip;
      if (t?.phase === 'voting' && !t.votes?.[bot.id] && t.options?.length) {
        return { type: '_tripVote', gameId: t.options[Math.floor(Math.random() * t.options.length)] };
      }
    } catch (err) {
      console.error(`[${room.code}] bot ${bot.name} couldn't decide`, err);
    }
    return null;
  }

  // Called whenever the room changes (after every broadcast): each bot with something to do gets
  // a timer; when it fires the bot looks again (things may have moved on) and acts.
  function schedule(room) {
    const sig = () => JSON.stringify(room.game || room.trip || null);
    for (const bot of room.players.filter(isBot)) {
      const id = `${room.code}:${bot.id}`;
      if (timers.has(id)) continue;
      // A bot whose last few moves the game wouldn't take waits for something to change.
      if (stuck.get(id)?.n >= 3 && stuck.get(id).sig === sig()) continue;
      const first = decide(room, bot);
      if (!first) continue;
      timers.set(id, setTimeout(() => {
        timers.delete(id);
        if (!room.players.includes(bot)) return;
        const action = decide(room, bot);
        if (!action) return;
        const { delay, ...move } = action;
        const before = sig();
        let result;
        try {
          if (move.type === '_tripVote') trips.vote(room, bot.id, move.gameId);
          else result = games[room.game.type].handle(room, bot, move, ctx);
        } catch (err) {
          console.error(`[${room.code}] bot ${bot.name} move failed`, move, err);
        }
        // Nothing changed: the game didn't take it. (Three of those and the bot waits.)
        const after = sig();
        stuck.set(id, after === before ? { sig: after, n: (stuck.get(id)?.n || 0) + 1 } : { sig: after, n: 0 });
        if (result !== 'quiet') broadcast(room);
        else schedule(room);
      }, first.delay ?? think(LEVELS[bot.bot].skill)));
    }
  }

  // A bot (or a room) going: its timers go too.
  function forget(room, botId = null) {
    for (const [id, t] of timers) {
      if (id.startsWith(`${room.code}:`) && (!botId || id.endsWith(`:${botId}`))) {
        clearTimeout(t);
        timers.delete(id);
        stuck.delete(id);
      }
    }
  }

  return { add, schedule, forget };
}

module.exports = { createBots, LEVELS, MAX, isBot, humans };
