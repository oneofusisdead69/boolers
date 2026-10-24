// Keeps rooms across server restarts (a redeploy, or Cloud Run moving the server). Each room is
// saved a moment after it changes, and loaded back when the server starts. What comes back is the
// room itself: its code, players, tonight's sip counts, the chosen game, options and style. A game
// that was in the middle of being played starts over from the lobby (its timers can't be saved).
//
// Where rooms are kept is set with the ROOM_STORE environment variable:
//   firestore  Google Cloud Firestore, collection "rooms" (on Cloud Run it needs no keys)
//   file       a JSON file (ROOM_STORE_FILE, default .rooms.json), handy for trying it locally
//   (unset)    nowhere: rooms live in memory only, as before

const fs = require('fs');

const SAVE_DELAY_MS = 1500;
const KEEP_MS = 12 * 60 * 60 * 1000; // rooms idle longer than this aren't brought back

// The parts of a room worth keeping.
function snapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map(({ id, name, drinks = 0, total = 0, finished = 0, avatar, color }) => ({ id, name, drinks, total, finished, avatar, color })),
    selectedGame: room.selectedGame,
    options: room.options,
    style: room.style || 'classic',
    feed: room.feed.slice(-20),
    night: room.night || null,
    playing: room.game ? room.game.type : null,
    updatedAt: room.updatedAt || Date.now(),
  };
}

// A saved room, ready to use again: everyone is offline until their phone reconnects.
function restore(saved, { games, log }) {
  const room = {
    ...saved,
    players: saved.players.map((p) => ({ ...p, connected: false, socketId: null })),
    options: saved.options || {},
    feed: saved.feed || [],
    game: null,
    timer: null,
    deadline: null,
  };
  // New games added since it was saved get their default options.
  for (const [id, g] of Object.entries(games)) {
    room.options[id] = { ...Object.fromEntries((g.options || []).map((o) => [o.id, o.default])), ...room.options[id] };
  }
  if (!games[room.selectedGame]) room.selectedGame = Object.keys(games)[0];
  if (saved.playing && games[saved.playing]) {
    log(room, `🔄 The server restarted, so ${games[saved.playing].name} went back to the lobby. Sip counts are safe.`);
  }
  delete room.playing;
  return room;
}

function fileBackend(file) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  return {
    async loadAll() { return Object.values(read()); },
    async put(code, data) {
      const all = read();
      all[code] = data;
      fs.writeFileSync(file, JSON.stringify(all));
    },
    async remove(code) {
      const all = read();
      delete all[code];
      fs.writeFileSync(file, JSON.stringify(all));
    },
  };
}

function firestoreBackend() {
  const { Firestore } = require('@google-cloud/firestore');
  const col = new Firestore({ ignoreUndefinedProperties: true }).collection('rooms');
  return {
    async loadAll() {
      const snap = await col.get();
      return snap.docs.map((d) => JSON.parse(d.get('json')));
    },
    // Stored as one JSON string, so nested game options never trip Firestore's rules.
    async put(code, data) { await col.doc(code).set({ json: JSON.stringify(data), updatedAt: data.updatedAt }); },
    async remove(code) { await col.doc(code).delete(); },
  };
}

function createRoomStore({ kind = process.env.ROOM_STORE, file = process.env.ROOM_STORE_FILE || '.rooms.json' } = {}) {
  let backend = null;
  try {
    if (kind === 'firestore') backend = firestoreBackend();
    else if (kind === 'file') backend = fileBackend(file);
  } catch (err) {
    console.error('Room store unavailable, keeping rooms in memory only:', err.message);
  }
  const pending = new Map(); // code -> timeout
  const latest = new Map(); // code -> room

  const write = async (code) => {
    pending.delete(code);
    const room = latest.get(code);
    latest.delete(code);
    if (!room) return;
    try {
      await backend.put(code, snapshot(room));
    } catch (err) {
      console.error(`Couldn't save room ${code}:`, err.message);
    }
  };

  return {
    enabled: !!backend,

    // Saved rooms that are recent enough to bring back.
    async load(opts) {
      if (!backend) return [];
      try {
        const now = Date.now();
        return (await backend.loadAll())
          .filter((r) => r && r.code && now - (r.updatedAt || 0) < KEEP_MS)
          .map((r) => restore(r, opts));
      } catch (err) {
        console.error("Couldn't load saved rooms:", err.message);
        return [];
      }
    },

    // Saves a room a moment after it changes (many changes in a row make one write).
    save(room) {
      if (!backend) return;
      latest.set(room.code, room);
      if (!pending.has(room.code)) pending.set(room.code, setTimeout(() => write(room.code), SAVE_DELAY_MS));
    },

    async remove(code) {
      if (!backend) return;
      clearTimeout(pending.get(code));
      pending.delete(code);
      latest.delete(code);
      try { await backend.remove(code); } catch {}
    },

    // Writes everything still waiting, e.g. when the server is told to shut down.
    async flush() {
      if (!backend) return;
      const codes = [...pending.keys()];
      for (const code of codes) clearTimeout(pending.get(code));
      await Promise.all(codes.map(write));
    },
  };
}

module.exports = { createRoomStore, snapshot, restore };
