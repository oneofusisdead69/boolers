const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { createContext } = require('./lib/context');
const LOOKS = require('./lib/looks');
const custom = require('./lib/custom');
const analytics = require('./lib/analytics');

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
const ROOM_IDLE_MS = 30 * 60 * 1000; // delete empty rooms after this

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public/tv.html')));
// Avatar and colour lists, shared with the phones.
app.get('/looks.js', (req, res) => res.sendFile(path.join(__dirname, 'lib/looks.js')));

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

// QR code that links straight to the join screen for a room.
app.get('/qr/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const url = `${req.protocol}://${req.get('host')}/?room=${code}`;
  res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 1 }));
});

// ---------- Rooms ----------

const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion with 1/0

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function ensureHost(room) {
  const host = room.players.find((p) => p.id === room.hostId);
  if (host && host.connected) return;
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
    games: Object.values(GAMES).map(({ id, name, description, minPlayers, rules = [] }) => ({ id, name, description, minPlayers, rules })),
    options: (selected.options || []).map((o) => ({ ...o, value: room.options[selected.id][o.id] })),
    custom: room.hostId === player.id ? selected.custom || [] : [],
    players: room.players.map(({ id, name, connected, drinks, total = 0, finished = 0, avatar, color }) => ({ id, name, connected, drinks, total, finished, avatar, color })),
    phase: room.game ? room.game.phase : 'lobby',
    gameType: room.game ? room.game.type : null,
    game: game ? game.view(room, player, ctx) : null,
    feed: room.feed.slice(-8),
    deadline: room.deadline,
    serverNow: Date.now(),
    tv: (room.tvs?.size || 0) > 0, // phones go quiet while a TV plays the sounds
  };
}

// ---------- TVs ----------
// A TV watches a room: it isn't a player, and sees what everyone at the table can see (each game's
// view for someone who isn't playing never includes anyone's hidden cards or dice).
const TV = { id: '__tv', name: 'TV' };
const tvView = (room) => ({ ...viewFor(room, TV), isHost: false, custom: [] });

function broadcast(room) {
  room.updatedAt = Date.now();
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

const ctx = createContext({ emit, broadcast });

// Logs how a game went when it stops: the host ended it (or started another), or everyone left.
function gameEnded(room, how) {
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

io.on('connection', (socket) => {
  let room = null;
  let player = null;
  let watching = null; // the room this socket shows, if it's a TV

  function attach(r, p) {
    room = r;
    player = p;
    p.socketId = socket.id;
    p.connected = true;
    clearTimeout(p.dropTimer);
    ensureHost(r);
  }

  socket.on('create', ({ name, playerId, avatar, color } = {}, ack = () => {}) => {
    name = cleanName(name);
    if (!name) return ack({ error: 'Enter your name' });
    if (!playerId) return ack({ error: 'Missing player id' });
    const code = makeCode();
    const r = {
      code,
      hostId: playerId,
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
    analytics.track('room_created');
    const p = { id: playerId, name, drinks: 0, connected: true, socketId: socket.id, ...LOOKS.choose({ avatar, color }) };
    r.players.push(p);
    attach(r, p);
    ack({ ok: true, code });
    broadcast(r);
  });

  socket.on('join', ({ code, name, playerId, avatar, color } = {}, ack = () => {}) => {
    code = String(code || '').toUpperCase().trim();
    const r = rooms.get(code);
    if (!r) return ack({ error: `No room called ${code || '????'}` });
    if (!playerId) return ack({ error: 'Missing player id' });

    let p = r.players.find((x) => x.id === playerId);
    if (!p) {
      name = cleanName(name);
      if (!name) return ack({ error: 'Enter your name' });
      if (r.players.length >= MAX_PLAYERS) return ack({ error: 'Room is full' });
      if (r.players.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
        return ack({ error: 'That name is taken in this room' });
      }
      p = { id: playerId, name, drinks: 0, connected: true, socketId: socket.id, ...LOOKS.choose({ avatar, color }, r.players) };
      r.players.push(p);
      if (r.game) GAMES[r.game.type].onJoin?.(r, p, ctx);
    }
    attach(r, p);
    ack({ ok: true, code });
    broadcast(r);
  });

  function hostOnly() {
    return room && player && room.hostId === player.id;
  }

  // Change your avatar or colour, any time.
  socket.on('setLook', ({ avatar, color } = {}) => {
    if (!room || !player) return;
    if (LOOKS.AVATARS.includes(avatar)) player.avatar = avatar;
    if (LOOKS.COLORS.includes(color)) player.color = color;
    broadcast(room);
  });

  socket.on('selectGame', ({ gameId } = {}) => {
    if (!hostOnly() || room.game || !GAMES[gameId]) return;
    room.selectedGame = gameId;
    broadcast(room);
  });

  socket.on('setOption', ({ id, value } = {}) => {
    if (!hostOnly() || room.game) return;
    const opt = (GAMES[room.selectedGame].options || []).find((o) => o.id === id);
    if (!opt || !opt.choices.some((c) => c.value === value)) return;
    room.options[room.selectedGame][id] = value;
    broadcast(room);
  });

  // The host's phone sends its custom content (questions, rules…) along with the start.
  socket.on('start', ({ custom: mine } = {}, ack = () => {}) => {
    if (!hostOnly() || room.game) return ack({ error: 'Only the host can start' });
    const game = GAMES[room.selectedGame];
    if (ctx.connectedPlayers(room).length < game.minPlayers) {
      return ack({ error: `${game.name} needs at least ${game.minPlayers} players` });
    }
    // Disconnected players don't carry into a new game.
    room.players = room.players.filter((p) => p.connected);
    for (const p of room.players) p.drinks = 0;
    room.feed = [];
    room.game = { type: game.id };
    game.start(room, ctx, { ...room.options[game.id], custom: custom.clean(game.custom, mine) });
    room.gameStartedAt = Date.now();
    analytics.track('game_started', { game: game.id, players: room.players.length, mode: 'online', customized: Object.keys(custom.clean(game.custom, mine)).length > 0 });
    ack({ ok: true });
    broadcast(room);
  });

  socket.on('action', (action = {}) => {
    if (!room || !player || !room.game) return;
    try {
      GAMES[room.game.type].handle(room, player, action, ctx);
    } catch (err) {
      console.error(`[${room.code}] ${room.game?.type} action failed`, action, err);
    }
    broadcast(room);
  });

  socket.on('endGame', () => {
    if (!hostOnly() || !room.game) return;
    gameEnded(room, 'host');
    ctx.endGame(room);
    broadcast(room);
  });

  socket.on('kick', ({ playerId } = {}) => {
    if (!hostOnly() || playerId === player.id) return;
    const target = room.players.find((p) => p.id === playerId);
    if (!target) return;
    if (target.socketId) io.to(target.socketId).emit('kicked');
    removePlayer(room, playerId);
    broadcast(room);
  });

  socket.on('leave', () => {
    if (!room || !player) return;
    const r = room;
    removePlayer(r, player.id);
    room = player = null;
    broadcast(r);
  });

  // A TV joins a room to show it on a big screen.
  socket.on('watch', ({ code } = {}, ack = () => {}) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return ack({ error: `No room called ${code || '????'}` });
    for (const other of rooms.values()) other.tvs?.delete(socket.id);
    (r.tvs ||= new Set()).add(socket.id);
    watching = r;
    ack({ ok: true, code: r.code });
    broadcast(r);
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
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Bool Games running on http://localhost:${PORT}`);
  console.log(`Games: ${Object.values(GAMES).map((g) => g.name).join(', ')}`);
  console.log(`Test with several phones at once: http://localhost:${PORT}/dev.html`);
});
