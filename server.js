const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

// Every game module exports: id, name, description, minPlayers, start, handle, check, view.
// To add a game, write a module in ./games and list it here.
const GAMES = Object.fromEntries(
  [require('./games/mostLikely')].map((g) => [g.id, g])
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

function connectedPlayers(room) {
  return room.players.filter((p) => p.connected);
}

function ensureHost(room) {
  const host = room.players.find((p) => p.id === room.hostId);
  if (host && host.connected) return;
  const next = connectedPlayers(room)[0];
  if (next) room.hostId = next.id;
}

function setTimer(room, ms, fn) {
  clearTimer(room);
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null;
    room.deadline = null;
    fn();
    broadcast(room);
  }, ms);
}

function clearTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.deadline = null;
}

const ctx = { setTimer, clearTimer, connectedPlayers };

function viewFor(room, player) {
  const game = room.game && GAMES[room.game.type];
  return {
    code: room.code,
    me: player.id,
    hostId: room.hostId,
    isHost: room.hostId === player.id,
    selectedGame: room.selectedGame,
    games: Object.values(GAMES).map(({ id, name, description, minPlayers }) => ({ id, name, description, minPlayers })),
    players: room.players.map(({ id, name, connected, drinks }) => ({ id, name, connected, drinks })),
    phase: room.game ? room.game.phase : 'lobby',
    gameType: room.game ? room.game.type : null,
    game: game ? game.view(room, player) : null,
    deadline: room.deadline,
    serverNow: Date.now(),
  };
}

function broadcast(room) {
  room.updatedAt = Date.now();
  for (const p of room.players) {
    if (p.connected && p.socketId) io.to(p.socketId).emit('state', viewFor(room, p));
  }
}

function removePlayer(room, playerId) {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.game) GAMES[room.game.type].check?.(room, ctx);
  ensureHost(room);
}

function endGame(room) {
  clearTimer(room);
  room.game = null;
}

// ---------- Sockets ----------

io.on('connection', (socket) => {
  let room = null;
  let player = null;

  function attach(r, p) {
    room = r;
    player = p;
    p.socketId = socket.id;
    p.connected = true;
    clearTimeout(p.dropTimer);
    ensureHost(r);
  }

  socket.on('create', ({ name, playerId } = {}, ack = () => {}) => {
    name = cleanName(name);
    if (!name) return ack({ error: 'Enter your name' });
    if (!playerId) return ack({ error: 'Missing player id' });
    const code = makeCode();
    const r = {
      code,
      hostId: playerId,
      players: [],
      selectedGame: Object.keys(GAMES)[0],
      game: null,
      timer: null,
      deadline: null,
      updatedAt: Date.now(),
    };
    rooms.set(code, r);
    const p = { id: playerId, name, drinks: 0, connected: true, socketId: socket.id };
    r.players.push(p);
    attach(r, p);
    ack({ ok: true, code });
    broadcast(r);
  });

  socket.on('join', ({ code, name, playerId } = {}, ack = () => {}) => {
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
      p = { id: playerId, name, drinks: 0, connected: true, socketId: socket.id };
      r.players.push(p);
    }
    attach(r, p);
    ack({ ok: true, code });
    broadcast(r);
  });

  function hostOnly() {
    return room && player && room.hostId === player.id;
  }

  socket.on('selectGame', ({ gameId } = {}) => {
    if (!hostOnly() || room.game || !GAMES[gameId]) return;
    room.selectedGame = gameId;
    broadcast(room);
  });

  socket.on('start', (_ = {}, ack = () => {}) => {
    if (!hostOnly() || room.game) return ack({ error: 'Only the host can start' });
    const game = GAMES[room.selectedGame];
    if (connectedPlayers(room).length < game.minPlayers) {
      return ack({ error: `${game.name} needs at least ${game.minPlayers} players` });
    }
    for (const p of room.players) p.drinks = 0;
    room.game = { type: game.id };
    game.start(room, ctx);
    ack({ ok: true });
    broadcast(room);
  });

  socket.on('action', (action = {}) => {
    if (!room || !player || !room.game) return;
    GAMES[room.game.type].handle(room, player, action, ctx);
    broadcast(room);
  });

  socket.on('endGame', () => {
    if (!hostOnly()) return;
    endGame(room);
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

  socket.on('disconnect', () => {
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
    if (connectedPlayers(r).length === 0 && now - r.updatedAt > ROOM_IDLE_MS) {
      clearTimer(r);
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`PartyBox running on http://localhost:${PORT}`);
});
