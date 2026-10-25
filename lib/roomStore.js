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
    players: room.players.map(({ id, key = null, name, drinks = 0, total = 0, finished = 0, avatar, color }) => ({ id, key, name, drinks, total, finished, avatar, color })),
    selectedGame: room.selectedGame,
    options: room.options,
    style: room.style || 'classic',
    venue: room.venue || '',
    away: room.away || {},
    feed: room.feed.slice(-20),
    night: room.night || null,
    playing: room.game ? room.game.type : null,
    // Around the World picks up again (with a fresh vote) after a restart.
    trip: room.trip ? { stops: room.trip.stops, stop: room.trip.stop, mode: room.trip.mode, played: room.trip.played } : room.tripResume || null,
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
    trip: null,
    tripResume: saved.trip || null,
    savedAt: saved.updatedAt || 0, // to tell whether another server has saved it since
    restored: true,
  };
  // New games added since it was saved get their default options.
  for (const [id, g] of Object.entries(games)) {
    room.options[id] = { ...Object.fromEntries((g.options || []).map((o) => [o.id, o.default])), ...room.options[id] };
  }
  if (!games[room.selectedGame]) room.selectedGame = Object.keys(games)[0];
  if (saved.playing && games[saved.playing]) {
    log(room, `🔄 The server restarted, so ${games[saved.playing].name} went back to the lobby. Sip counts are safe.`);
  }
  if (saved.trip) log(room, '🌍 Around the World carries on with a new vote');
  delete room.playing;
  return room;
}

function fileBackend(file) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  return {
    async loadAll() { return Object.values(read()); },
    async get(code) { return read()[code] || null; },
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
    async get(code) {
      const doc = await col.doc(code).get();
      return doc.exists ? JSON.parse(doc.get('json')) : null;
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
  const written = new Map(); // code -> the JSON last saved, to skip saves that change nothing
  const inFlight = new Set(); // saves under way, which a shutdown waits for
  let closing = false;

  const write = async (code) => {
    pending.delete(code);
    const room = latest.get(code);
    latest.delete(code);
    if (!room) return;
    const data = snapshot(room);
    // updatedAt changes on every broadcast; only save when something else did.
    const json = JSON.stringify({ ...data, updatedAt: 0 });
    if (written.get(code) === json) return;
    written.set(code, json);
    const job = backend.put(code, data).catch((err) => {
      written.delete(code);
      console.error(`Couldn't save room ${code}:`, err.message);
    });
    inFlight.add(job);
    await job;
    inFlight.delete(job);
  };

  return {
    enabled: !!backend,

    // Saved rooms that are recent enough to bring back.
    async load(opts) {
      if (!backend) return [];
      try {
        const now = Date.now();
        const rooms = [];
        for (const r of await backend.loadAll()) {
          if (!r || !r.code || now - (r.updatedAt || 0) >= KEEP_MS) continue;
          // One damaged room doesn't stop the others coming back.
          try {
            rooms.push(restore(r, opts));
          } catch (err) {
            console.error(`Couldn't restore room ${r.code}:`, err.message);
          }
        }
        return rooms;
      } catch (err) {
        console.error("Couldn't load saved rooms:", err.message);
        return [];
      }
    },

    // One saved room, read fresh: for a code this server hasn't got (another server made it, e.g.
    // during a deploy) or to check a room loaded at start hasn't been saved since.
    async loadOne(code, opts) {
      if (!backend) return null;
      try {
        const r = await backend.get(code);
        if (!r || !r.code || Date.now() - (r.updatedAt || 0) >= KEEP_MS) return null;
        return restore(r, opts);
      } catch (err) {
        console.error(`Couldn't load room ${code}:`, err.message);
        return null;
      }
    },

    // Saves a room a moment after it changes (many changes in a row make one write).
    save(room) {
      if (!backend || closing) return;
      latest.set(room.code, room);
      if (!pending.has(room.code)) pending.set(room.code, setTimeout(() => write(room.code), SAVE_DELAY_MS));
    },

    async remove(code) {
      if (!backend) return;
      clearTimeout(pending.get(code));
      pending.delete(code);
      latest.delete(code);
      written.delete(code);
      try { await backend.remove(code); } catch {}
    },

    // Writes everything still waiting, e.g. when the server is told to shut down.
    async flush() {
      if (!backend) return;
      closing = true;
      const codes = [...pending.keys()];
      for (const code of codes) clearTimeout(pending.get(code));
      await Promise.all([...codes.map(write), ...inFlight]);
    },
  };
}

module.exports = { createRoomStore, snapshot, restore };
