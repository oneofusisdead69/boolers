const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const compression = require('compression');
const { createContext } = require('./lib/context');
const LOOKS = require('./lib/looks');
const ROOM_STYLES = require('./lib/roomStyles');
const night = require('./lib/night');
const { createTrips } = require('./lib/trip');
const { waterLine } = require('./lib/water');
const custom = require('./lib/custom');
const analytics = require('./lib/analytics');
const { createRoomStore } = require('./lib/roomStore');

// Every file in ./games is a game. See games/README.md for the module shape.
const GAMES = Object.fromEntries(
  fs.readdirSync(path.join(__dirname, 'games'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => require(`./games/${f}`))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name))
    .map((g) => [g.id, g])
);

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 16;
const LOBBY_GRACE_MS = 30 * 1000; // drop disconnected players from the lobby after this
const ROOM_IDLE_MS = 10 * 60 * 1000; // delete rooms nobody's in (no host, no players) after this

const app = express();
// Cloud Run's front end is the one proxy in front of us: its X-Forwarded-For entry is the real client.
app.set('trust proxy', 1);
const server = http.createServer(app);
// Bigger messages (a full game state) are compressed.
const io = new Server(server, { perMessageDeflate: { threshold: 1024 } });

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public/tv.html')));
// Avatar and colour lists, shared with the phones.
app.get('/looks.js', (req, res) => res.sendFile(path.join(__dirname, 'lib/looks.js')));
// Room styles (dive bar, tavern…), shared with the phones and the TV.
app.get('/room-styles.js', (req, res) => res.sendFile(path.join(__dirname, 'lib/roomStyles.js')));

// Pass-and-play pages report their games here (multiplayer games are counted below), and the
// feedback form posts here. Both just write a log line.
const allowEvent = analytics.rateLimiter(30);
const allowFeedback = analytics.rateLimiter(5);
app.post('/api/event', express.json({ limit: '2kb' }), (req, res) => {
  const event = allowEvent(req.ip) && analytics.cleanEvent(req.body, Object.keys(GAMES));
  if (event) analytics.track(event.event, event);
  res.status(204).end();
});
app.post('/api/feedback', express.json({ limit: '8kb' }), (req, res) => {
  if (!allowFeedback(req.ip)) return res.status(429).json({ error: 'Too much feedback at once. Try again in a minute.' });
  const feedback = analytics.cleanFeedback(req.body, Object.keys(GAMES));
  if (!feedback) return res.status(400).json({ error: 'Write something first' });
  analytics.track('feedback', feedback);
  res.json({ ok: true });
});

// The game rules, packed for pass-and-play games that run entirely on one phone.
const sharedBundle = require('./lib/bundle').buildBundle(__dirname);
app.get('/shared/bundle.js', (req, res) => res.type('application/javascript').send(sharedBundle));

// A Big Tom drawing, once the final vote has started: each phone fetches it once (and caches it)
// instead of every drawing riding along with every update.
app.get('/drawing/:code/:key/:i', (req, res) => {
  const g = rooms.get(String(req.params.code).toUpperCase())?.game;
  const ready = g?.type === 'bigTom' && (g.phase === 'finalVote' || g.phase === 'final') && g.drawingKey === req.params.key;
  const image = ready && g.drawings[g.finalOrder[Number(req.params.i)]];
  const match = typeof image === 'string' && image.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=3600').type('image/png').send(Buffer.from(match[1], 'base64'));
});

// QR code that links straight to the join screen for a room.
app.get('/qr/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const url = `${req.protocol}://${req.get('host')}/?room=${code}`;
  res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 1 }));
});

// ---------- Rooms ----------

const rooms = new Map();
// Rooms survive a restart when ROOM_STORE is set (see lib/roomStore.js).
const roomStore = createRoomStore();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion with 1/0

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// A room by its code. One this server doesn't have may have been made by another server (during a
// deploy both run for a moment), and one loaded when this server started may have been saved by the
// old server since: either way the saved copy is read before anyone joins.
async function findRoom(code) {
  const here = rooms.get(code);
  if (here && !here.restored) return here;
  if (!roomStore.enabled) return here || null;
  const saved = await roomStore.loadOne(code, { games: GAMES, log: ctx.log });
  const now = rooms.get(code); // someone else may have loaded it meanwhile
  if (now && !now.restored) return now;
  if (saved && (!now || saved.savedAt > now.savedAt)) {
    rooms.set(code, { ...saved, restored: false, updatedAt: Date.now() });
    forgetAbsent(rooms.get(code));
  } else if (now) {
    now.restored = false;
  }
  return rooms.get(code) || null;
}

// After a restart, people who don't come back within a couple of minutes leave the list (their
// tab is kept, as for anyone who misses a game).
const RESTORE_GRACE_MS = 2 * 60 * 1000;
function forgetAbsent(room) {
  setTimeout(() => {
    if (rooms.get(room.code) !== room || room.game) return;
    const gone = room.players.filter((p) => !p.connected);
    if (!gone.length) return;
    room.away ||= {};
    for (const p of gone) room.away[p.id] = { key: p.key, name: p.name, total: p.total || 0, finished: p.finished || 0, avatar: p.avatar, color: p.color };
    room.players = room.players.filter((p) => p.connected);
    ensureHost(room);
    broadcast(room);
  }, RESTORE_GRACE_MS).unref();
}

const MAX_ROOMS = 2000;
// Player ids and keys come from phones: short strings only.
const validId = (x) => typeof x === 'string' && x.length >= 4 && x.length <= 64;
// Per address, per minute: making rooms, and wrong room codes (guessing codes to find rooms).
const allowCreate = analytics.rateLimiter(10);
const misses = new Map(); // address -> times a code wasn't found, in the last minute
function guessing(ip, missed = false) {
  const now = Date.now();
  const recent = (misses.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (missed) recent.push(now);
  if (recent.length) misses.set(ip, recent);
  else misses.delete(ip);
  if (misses.size > 5000) misses.clear();
  return recent.length > 20;
}
// The phone's own address: Cloud Run's front end adds it as the last X-Forwarded-For entry.
const clientIp = (socket) => String(socket.handshake.headers['x-forwarded-for'] || '').split(',').pop().trim() || socket.handshake.address;

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

// The host stays host through a reload or a moment's lost signal (or a server restart): someone
// else takes over only once they've been gone a little while.
const HOST_GRACE_MS = 20 * 1000;
function ensureHost(room) {
  const host = room.players.find((p) => p.id === room.hostId);
  if (host && host.connected) return;
  const away = host ? Date.now() - (host.leftAt || 0) : Infinity;
  if (away < HOST_GRACE_MS) {
    clearTimeout(room.hostTimer);
    room.hostTimer = setTimeout(() => {
      if (rooms.get(room.code) !== room) return;
      const before = room.hostId;
      ensureHost(room);
      if (room.hostId !== before) broadcast(room);
    }, HOST_GRACE_MS - away + 50);
    room.hostTimer.unref?.();
    return;
  }
  const next = ctx.connectedPlayers(room)[0];
  if (next) room.hostId = next.id;
}

function defaultOptions(game) {
  return Object.fromEntries((game.options || []).map((o) => [o.id, o.default]));
}

function viewFor(room, player) {
  const game = room.game && GAMES[room.game.type];
  const selected = GAMES[room.selectedGame];
  return {
    code: room.code,
    me: player.id,
    hostId: room.hostId,
    isHost: room.hostId === player.id,
    selectedGame: room.selectedGame,
    style: room.style || 'classic',
    look: lookOf(room), // what the room looks like right now (the Lighthouse's weather)
    venue: room.venue || '',
    trip: trips.view(room, player.id),
    // The end-of-night recap, while the host has it open.
    recap: room.recap ? night.summary(room, room.venue || ROOM_STYLES.STYLES[room.style]?.label, !!room.venue) : null,
    options: (selected.options || []).map((o) => ({ ...o, value: room.options[selected.id][o.id] })),
    custom: room.hostId === player.id ? selected.custom || [] : [],
    players: room.players.map(({ id, name, connected, drinks, total = 0, finished = 0, avatar, color, drink = null }) => ({ id, name, connected, drinks, total, finished, avatar, color, drink })),
    phase: room.game ? room.game.phase : 'lobby',
    gameType: room.game ? room.game.type : null,
    gameNo: room.gameNo || 0, // changes with every new game (screens forget the last one)
    game: game ? game.view(room, player, ctx) : null,
    feed: room.feed.slice(-8),
    deadline: room.deadline,
    serverNow: Date.now(),
    tv: (room.tvs?.size || 0) > 0, // phones go quiet while a TV plays the sounds
  };
}

// ---------- Preview (on your own computer only) ----------
// /preview opens the TV on a made-up room with pretend players, to check how a screen looks in one
// step: ?style=stpatricks&look=stpatricksRain&game=kingsCup&players=4 (all optional), and &moment=2
// to play one of the scenery's moments straight away (see tools/preview.js for screenshots of many
// at once). It never exists on Cloud Run (K_SERVICE is set there).
if (!process.env.K_SERVICE) {
  const NAMES = ['Ann', 'Cal', 'Dee', 'Eve', 'Finn', 'Gus', 'Hal', 'Ivy'];
  app.get('/preview', (req, res) => {
    const q = req.query;
    const r = newRoom('p1');
    const n = Math.min(8, Math.max(2, Number(q.players) || 4));
    for (let i = 0; i < n; i++) {
      r.players.push({ id: `p${i + 1}`, key: null, name: NAMES[i], drinks: i, total: i * 2, connected: true, socketId: null, ...LOOKS.choose({}, r.players) });
    }
    const look = String(q.look || '');
    r.style = ROOM_STYLES.PICKABLE.includes(q.style) ? q.style : ROOM_STYLES.roomOf(look) || 'classic';
    if (!ROOM_STYLES.PICKABLE.includes(r.style)) r.style = 'classic';
    newMood(r);
    if (ROOM_STYLES.STYLES[r.style]?.moods?.some(([id]) => id === look)) r.mood = look;
    if (GAMES[q.game]) startGame(r, q.game);
    res.redirect(`/tv?room=${r.code}&preview=1${q.moment !== undefined ? `&moment=${Number(q.moment) || 0}` : ''}`);
  });
}

// ---------- TVs ----------
// A TV watches a room: it isn't a player, and sees what everyone at the table can see (each game's
// view for someone who isn't playing never includes anyone's hidden cards or dice).
const TV = { id: '__tv', name: 'TV' };

// ---------- Moods ----------
// Some rooms change on their own: the Lighthouse moves between night, day, fog and a storm every
// few minutes while a game is on. The server picks, so every phone and the TV see the same sky.
const MOOD_MS = [6 * 60 * 1000, 12 * 60 * 1000];
function newMood(room) {
  if (!ROOM_STYLES.STYLES[room.style]?.moods) {
    delete room.mood;
    delete room.moodUntil;
    return;
  }
  room.mood = ROOM_STYLES.pickMood(room.style, room.mood);
  room.moodUntil = Date.now() + MOOD_MS[0] + Math.random() * (MOOD_MS[1] - MOOD_MS[0]);
}
function lookOf(room) {
  // A room saved on the old 'Lighthouse in a storm' style is the Lighthouse, in a storm.
  if (ROOM_STYLES.STYLES[room.style]?.mood) {
    room.mood = room.style;
    room.style = ROOM_STYLES.roomOf(room.style);
    room.moodUntil ??= Date.now() + MOOD_MS[0];
  }
  // An easter egg (Kings Cup at the château...) while its game is on.
  const egg = room.game && ROOM_STYLES.eggOf(room.style, room.game.type);
  if (egg) return egg;
  const moods = ROOM_STYLES.STYLES[room.style]?.moods;
  if (!moods) return room.style || 'classic';
  if (!moods.some(([look]) => look === room.mood)) newMood(room);
  return room.mood;
}
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.game && room.moodUntil && Date.now() >= room.moodUntil) {
      newMood(room);
      broadcast(room);
    }
  }
}, 15 * 1000).unref();
const tvView = (room) => ({ ...viewFor(room, TV), isHost: false, custom: [] });

function broadcast(room) {
  // Nobody is ever left waiting on a player who's gone: each game moves past them (but just after
  // a restart, give everyone a moment to reconnect first).
  if (room.game && ctx.connectedPlayers(room).length && !(room.graceUntil > Date.now())) {
    try {
      GAMES[room.game.type].check?.(room, ctx);
    } catch (err) {
      console.error(`[${room.code}] ${room.game.type} check failed`, err);
    }
  }
  trips.check(room);
  room.updatedAt = Date.now();
  roomStore.save(room);
  for (const p of room.players) {
    if (p.connected && p.socketId) io.to(p.socketId).emit('state', viewFor(room, p));
  }
  if (room.tvs?.size) {
    const view = tvView(room);
    for (const id of room.tvs) io.to(id).emit('state', view);
  }
}

function emit(room, playerId, event, data) {
  const p = room.players.find((x) => x.id === playerId);
  if (p?.socketId) io.to(p.socketId).emit(event, data);
  // The TV shows (and sounds) every drink, with who it's for.
  if (event === 'drink' && room.tvs?.size && p) {
    for (const id of room.tvs) io.to(id).emit('drink', { ...data, who: p.name, playerId: p.id });
  }
}

// A message for every phone in the room (not the TV), e.g. the water reminder.
function notifyPhones(room, event, data) {
  for (const p of room.players) if (p.socketId) io.to(p.socketId).emit(event, data);
}

// A small message for every phone and TV in the room (see ctx.signal).
function signal(room, event, data) {
  for (const p of room.players) if (p.socketId) io.to(p.socketId).emit(event, data);
  for (const id of room.tvs || []) io.to(id).emit(event, data);
}

const ctx = createContext({ emit, broadcast, signal });

// Starts a game in the room: the host's pick, or the next stop of Around the World. `mine` is the
// host's custom content (questions, rules…), if they wrote any.
function newRoom(hostId) {
  const code = makeCode();
  const r = {
    code,
    hostId,
    players: [],
    selectedGame: Object.keys(GAMES)[0],
    options: Object.fromEntries(Object.values(GAMES).map((g) => [g.id, defaultOptions(g)])),
    game: null,
    feed: [],
    timer: null,
    deadline: null,
    updatedAt: Date.now(),
  };
  rooms.set(code, r);
  return r;
}

function startGame(room, gameId, mine = {}) {
  const game = GAMES[gameId];
  room.selectedGame = gameId;
  // Disconnected players don't carry into a new game, but their tab is kept for when they're back.
  room.away ||= {};
  for (const p of room.players.filter((x) => !x.connected)) {
    room.away[p.id] = { key: p.key, name: p.name, total: p.total || 0, finished: p.finished || 0, avatar: p.avatar, color: p.color };
  }
  room.players = room.players.filter((p) => p.connected);
  for (const p of room.players) p.drinks = 0;
  room.feed = [];
  room.recap = false;
  room.game = { type: game.id };
  game.start(room, ctx, { ...room.options[game.id], custom: custom.clean(game.custom, mine) });
  room.gameStartedAt = Date.now();
  room.gameNo = (room.gameNo || 0) + 1;
  analytics.track('game_started', { game: game.id, players: room.players.length, mode: 'online', customized: Object.keys(custom.clean(game.custom, mine)).length > 0 });
  broadcast(room);
  // A different game (or the third in a row): a nudge to drink some water, on the phones.
  if (night.waterDue(room, game.id)) notifyPhones(room, 'notice', { kind: 'water', text: waterLine(room.style) });
}

function stopGame(room, how) {
  gameEnded(room, how);
  ctx.endGame(room);
}

// Around the World (lib/trip.js): games back to back, voted on, until the recap.
const trips = createTrips({
  games: GAMES,
  ctx,
  startGame: (room, id) => startGame(room, id),
  stopGame: (room) => stopGame(room, 'trip'),
  broadcast,
  finish: (room) => { room.recap = true; },
});

// Logs how a game went when it stops: the host ended it (or started another), or everyone left.
function gameEnded(room, how) {
  if (room.game && how !== 'abandoned') night.gamePlayed(room, room.game.type, GAMES[room.game.type].name);
  if (!room.game || !room.gameStartedAt) return;
  analytics.track('game_ended', {
    game: room.game.type,
    players: room.players.length,
    minutes: Math.round((Date.now() - room.gameStartedAt) / 6000) / 10,
    finished: room.game.phase === 'over',
    how,
  });
  room.gameStartedAt = null;
}

function removePlayer(room, playerId) {
  room.players = room.players.filter((p) => p.id !== playerId);
  ensureHost(room);
  if (room.game) GAMES[room.game.type].check?.(room, ctx);
}

// ---------- Sockets ----------

// The list of games never changes, so each phone and TV gets it once, when it connects.
const GAME_LIST = Object.values(GAMES).map(({ id, name, description, minPlayers, rules = [], bestWithTv = false }) => ({ id, name, description, minPlayers, rules, bestWithTv }));

io.on('connection', (socket) => {
  socket.emit('games', GAME_LIST);
  let room = null;
  let player = null;
  let watching = null; // the room this socket shows, if it's a TV

  // Every handler gets an object payload and a callable ack, whatever a client sends, and an error
  // in one never takes the server down.
  const on = (event, fn) => socket.on(event, (data, ack) => {
    const failed = (err) => console.error(`[${room?.code || '----'}] ${event} failed`, err);
    try {
      Promise.resolve(fn(data && typeof data === 'object' && !Array.isArray(data) ? data : {}, typeof ack === 'function' ? ack : () => {})).catch(failed);
    } catch (err) {
      failed(err);
    }
  });

  // Leaving a room for another (or a new one) counts as leaving the old one.
  function detach() {
    if (!room || !player || player.socketId !== socket.id) return;
    const r = room;
    player.connected = false;
    player.socketId = null;
    player.leftAt = Date.now();
    ensureHost(r);
    if (r.game) GAMES[r.game.type].check?.(r, ctx);
    broadcast(r);
  }

  function attach(r, p) {
    if (room && room !== r) detach();
    room = r;
    player = p;
    p.socketId = socket.id;
    p.connected = true;
    clearTimeout(p.dropTimer);
    ensureHost(r);
  }

  on('create', ({ name, playerId, key, avatar, color, drink } = {}, ack = () => {}) => {
    name = cleanName(name);
    if (!name) return ack({ error: 'Enter your name' });
    if (!validId(playerId)) return ack({ error: 'Missing player id' });
    if (!allowCreate(clientIp(socket)) || rooms.size >= MAX_ROOMS) return ack({ error: 'Too many rooms right now. Try again in a minute.' });
    const r = newRoom(playerId);
    const { code } = r;
    analytics.track('room_created');
    const p = { id: playerId, key: validId(key) ? key : null, name, drinks: 0, connected: true, socketId: socket.id, ...LOOKS.choose({ avatar, color, drink }) };
    r.players.push(p);
    attach(r, p);
    ack({ ok: true, code });
    broadcast(r);
  });

  on('join', async ({ code, name, playerId, key, avatar, color, drink } = {}, ack = () => {}) => {
    code = String(code || '').toUpperCase().trim().slice(0, 4);
    if (guessing(clientIp(socket))) return ack({ error: 'Too many tries. Wait a minute and try again.' });
    const r = await findRoom(code);
    if (!r) {
      guessing(clientIp(socket), true);
      return ack({ error: `No room called ${code || '????'}` });
    }
    if (!validId(playerId)) return ack({ error: 'Missing player id' });

    let p = r.players.find((x) => x.id === playerId);
    // Coming back to your seat needs the key your phone joined with, so nobody can take it over.
    if (p && p.key && p.key !== key) return ack({ error: 'Someone is already in that seat' });
    if (!p) {
      name = cleanName(name);
      if (!name) return ack({ error: 'Enter your name' });
      if (r.players.length >= MAX_PLAYERS) return ack({ error: 'Room is full' });
      if (r.players.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
        return ack({ error: 'That name is taken in this room' });
      }
      p = { id: playerId, key: validId(key) ? key : null, name, drinks: 0, connected: true, socketId: socket.id, ...LOOKS.choose({ avatar, color, drink }, r.players) };
      // Back after missing a game: tonight's tab is still theirs.
      const back = r.away?.[playerId];
      if (back && (!back.key || back.key === key)) {
        Object.assign(p, { total: back.total, finished: back.finished });
        delete r.away[playerId];
      }
      r.players.push(p);
      if (r.game) GAMES[r.game.type].onJoin?.(r, p, ctx);
    }
    attach(r, p);
    ack({ ok: true, code });
    // Back after a restart in the middle of Around the World: it carries on with a new vote.
    // (Once a couple of people are back, so there's something to vote on.)
    if (r.tripResume && !r.trip && !r.game && ctx.connectedPlayers(r).length >= 2) {
      const saved = r.tripResume;
      r.tripResume = null;
      trips.resume(r, saved);
    }
    broadcast(r);
  });

  function hostOnly() {
    return room && player && room.hostId === player.id;
  }

  // Change your avatar or colour, any time.
  on('setLook', ({ avatar, color, drink } = {}) => {
    if (!room || !player) return;
    if (LOOKS.AVATARS.includes(avatar)) player.avatar = avatar;
    if (LOOKS.COLORS.includes(color)) player.color = color;
    // No drink (or an unknown one) is the house drink.
    if (LOOKS.DRINKS.includes(drink)) player.drink = drink;
    else delete player.drink;
    broadcast(room);
  });

  // The host wraps up the night: everyone's phone (and the TV) shows the recap.
  on('recap', ({ open } = {}) => {
    if (!hostOnly() || room.game) return;
    room.recap = open === true || open === 'true';
    broadcast(room);
  });

  // A new night: everyone's tab starts again from zero.
  on('newNight', () => {
    if (!hostOnly() || room.game) return;
    for (const p of room.players) Object.assign(p, { drinks: 0, total: 0, finished: 0 });
    room.away = {};
    room.night = null;
    room.recap = false;
    room.feed = [];
    ctx.log(room, '🌙 A new night begins');
    broadcast(room);
  });

  // The host names the venue ("Noah's Basement"), shown in the lobby, on the TV and in the recap.
  on('setVenue', ({ venue } = {}) => {
    if (!hostOnly()) return;
    room.venue = String(venue || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    broadcast(room);
  });

  // The host dresses the room up (any time, even mid-game).
  on('setStyle', ({ style } = {}) => {
    if (!hostOnly() || !ROOM_STYLES.PICKABLE.includes(style)) return;
    if (room.style !== style) {
      room.style = style;
      newMood(room);
    }
    broadcast(room);
  });

  on('selectGame', ({ gameId } = {}) => {
    if (!hostOnly() || room.game || !GAMES[gameId]) return;
    room.selectedGame = gameId;
    broadcast(room);
  });

  on('setOption', ({ id, value } = {}) => {
    if (!hostOnly() || room.game) return;
    const opt = (GAMES[room.selectedGame].options || []).find((o) => o.id === id);
    if (!opt || !opt.choices.some((c) => c.value === value)) return;
    room.options[room.selectedGame][id] = value;
    broadcast(room);
  });

  // The host's phone sends its custom content (questions, rules…) along with the start.
  on('start', ({ custom: mine } = {}, ack = () => {}) => {
    if (!hostOnly() || room.game) return ack({ error: 'Only the host can start' });
    const game = GAMES[room.selectedGame];
    if (ctx.connectedPlayers(room).length < game.minPlayers) {
      return ack({ error: `${game.name} needs at least ${game.minPlayers} players` });
    }
    trips.end(room);
    ack({ ok: true });
    startGame(room, game.id, mine);
  });

  // Around the World: the host sets the number of stops and how the next game is picked.
  on('startTrip', ({ stops, mode } = {}) => {
    if (!hostOnly() || room.game) return;
    stops = [3, 5, 8].includes(Number(stops)) ? Number(stops) : 5;
    trips.start(room, { stops, mode: mode === 'random' ? 'random' : 'vote' });
    broadcast(room);
  });
  on('tripVote', ({ gameId } = {}) => {
    if (!room || !player) return;
    trips.vote(room, player.id, gameId);
    broadcast(room);
  });
  // The host moves on now (skips the rest of this game, or closes the vote), or ends the trip.
  on('nextStop', () => {
    if (!hostOnly()) return;
    trips.skip(room);
    broadcast(room);
  });
  on('endTrip', () => {
    if (!hostOnly() || !room.trip) return;
    trips.end(room);
    if (room.game) stopGame(room, 'host');
    broadcast(room);
  });

  on('action', (action = {}) => {
    if (!room || !player || !room.game) return;
    let result;
    try {
      result = GAMES[room.game.type].handle(room, player, action, ctx);
    } catch (err) {
      console.error(`[${room.code}] ${room.game?.type} action failed`, action, err);
    }
    // A game returns 'quiet' when it has already sent everyone what changed (ctx.signal).
    if (result !== 'quiet') broadcast(room);
  });

  // Ending a game on the trip just moves on to the next stop.
  on('endGame', () => {
    if (!hostOnly() || !room.game) return;
    if (room.trip) trips.skip(room);
    else stopGame(room, 'host');
    broadcast(room);
  });

  on('kick', ({ playerId } = {}) => {
    if (!hostOnly() || playerId === player.id) return;
    const target = room.players.find((p) => p.id === playerId);
    if (!target) return;
    if (target.socketId) io.to(target.socketId).emit('kicked');
    removePlayer(room, playerId);
    broadcast(room);
  });

  on('leave', () => {
    if (!room || !player) return;
    const r = room;
    removePlayer(r, player.id);
    room = player = null;
    broadcast(r);
  });

  // A TV joins a room to show it on a big screen.
  on('watch', async ({ code } = {}, ack = () => {}) => {
    if (guessing(clientIp(socket))) return ack({ error: 'Too many tries. Wait a minute and try again.' });
    const r = await findRoom(String(code || '').toUpperCase().trim().slice(0, 4));
    if (!r) {
      guessing(clientIp(socket), true);
      return ack({ error: `No room called ${code || '????'}` });
    }
    for (const other of rooms.values()) other.tvs?.delete(socket.id);
    (r.tvs ||= new Set()).add(socket.id);
    watching = r;
    ack({ ok: true, code: r.code });
    broadcast(r);
  });

  // The TV leaves the room (its Leave button).
  on('unwatch', () => {
    if (!watching) return;
    watching.tvs?.delete(socket.id);
    broadcast(watching);
    watching = null;
  });

  socket.on('disconnect', () => {
    if (watching) {
      watching.tvs?.delete(socket.id);
      broadcast(watching);
      watching = null;
    }
    if (!room || !player || player.socketId !== socket.id) return;
    const r = room;
    const p = player;
    p.connected = false;
    p.socketId = null;
    p.leftAt = Date.now();
    ensureHost(r);
    if (r.game) GAMES[r.game.type].check?.(r, ctx);
    // In the lobby, people who close the page drop off the list after a short grace period.
    p.dropTimer = setTimeout(() => {
      if (!p.connected && !r.game && r.players.includes(p)) {
        removePlayer(r, p.id);
        broadcast(r);
      }
    }, LOBBY_GRACE_MS);
    broadcast(r);
  });
});

// Clean up rooms nobody is in anymore.
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (ctx.connectedPlayers(r).length === 0 && now - r.updatedAt > ROOM_IDLE_MS) {
      gameEnded(r, 'abandoned');
      ctx.clearTimer(r);
      trips.end(r);
      rooms.delete(code);
      roomStore.remove(code);
    }
  }
}, 60 * 1000).unref();

// A bug in a timer (a game's or a trip's) is logged rather than taking every room down.
process.on('uncaughtException', (err) => console.error('Uncaught error', err));

// Cloud Run says it's about to stop the server with SIGTERM: save every room first.
// During a deploy the new server is already taking new connections: once every room is saved,
// close everyone's connection so their phones and TVs reconnect straight away, to the new one.
// (Otherwise a phone can stay on this one for a minute or more, in a copy of the room that people
// joining the new server can't see.)
process.on('SIGTERM', () => retire('shutting down', { exit: true }));

// A newer server is up (see announce in lib/roomStore.js), or this one's being stopped: save every
// room and send everyone off, so they reconnect to the new one. A moment first, for the front end
// to start sending connections there. Anyone who still reaches this one is turned away (and tries
// again: see app.js and tv.js). Handing over, it stays up (idle) rather than exiting: Cloud Run
// would start it again while its revision still has traffic. It's stopped (SIGTERM) when it's done.
// Being stopped, it exits.
const SERVER_ID = `${process.env.K_REVISION || 'local'}-${Math.random().toString(36).slice(2, 10)}`;
// The deploy's number, from Cloud Run's revision name (boolers-00016-qfv): later deploys are newer.
const REVISION = Number(String(process.env.K_REVISION || '').match(/-(\d+)-/)?.[1] || 0);
const HANDOVER_MS = 2500;
let retired = false;
io.use((socket, next) => (retired ? next(new Error('moving')) : next()));
async function retire(why, { delay = 0, exit = false } = {}) {
  if (!retired) {
    retired = true;
    console.log(`Handing over (${why}): saving ${rooms.size} room(s)`);
    await new Promise((r) => setTimeout(r, delay));
    await roomStore.flush();
    // Tell every phone and TV to go (they reconnect at once, see app.js), then drop what's left.
    io.disconnectSockets(true);
    io.engine.close();
    // And close every open connection, so a browser can't reuse one to come back here.
    setTimeout(() => server.closeAllConnections?.(), 200);
  }
  if (exit) setTimeout(() => process.exit(0), 1000);
}

roomStore.load({ games: GAMES, log: ctx.log }).then((saved) => {
  // Everyone gets the usual idle window to reconnect, counted from now.
  for (const r of saved) {
    if (rooms.has(r.code)) continue;
    rooms.set(r.code, { ...r, updatedAt: Date.now() });
    forgetAbsent(rooms.get(r.code));
  }
  if (roomStore.enabled) console.log(`Room store on (${process.env.ROOM_STORE}): ${saved.length} room(s) restored`);
  server.listen(PORT, () => {
    listening();
    roomStore.announce(SERVER_ID, REVISION, () => retire('a newer server took over', { delay: HANDOVER_MS }));
  });
});

function listening() {
  console.log(`Bool Games running on http://localhost:${PORT}`);
  console.log(`Games: ${Object.values(GAMES).map((g) => g.name).join(', ')}`);
  console.log(`Test with several phones at once: http://localhost:${PORT}/dev.html`);
}
