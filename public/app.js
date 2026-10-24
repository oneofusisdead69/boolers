// Boolers phone client. This file handles joining, the lobby, and shared UI pieces.
// Each game's screens live in /games/<gameId>.js and are loaded the first time they're needed.
// See /games/README.md in the repo for how to write one.

const socket = io();
const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const urlRoom = params.get('room');

// ?seat=N gives each tab/iframe its own identity (used by dev.html to fake several phones).
const seat = params.get('seat');
const prefix = seat ? `pb${seat}_` : 'pb_';
const store = {
  get(k) { try { return localStorage.getItem(prefix + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(prefix + k, v); } catch {} },
  del(k) { try { localStorage.removeItem(prefix + k); } catch {} },
};

let playerId = store.get('id');
if (!playerId) {
  playerId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set('id', playerId);
}

let homeError = '';
const loading = {};

// Shared screen helpers (cards, dice, pickers…) live in /pb.js; this page plugs in the server.
PB.socket = socket;
PB.send = (type, data) => socket.emit('action', { type, ...data });
PB.redraw = () => render();

// ---------- Full screen ----------
// Browsers that allow it (Android) go full screen when you create, join or start a game, and
// show a button to get back to it. iPhone Safari doesn't allow websites to go full screen.

const fullscreen = {
  canRequest() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  },
  active() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },
  // Must run inside a tap. Quietly does nothing where it isn't allowed.
  enter() {
    if (seat || fullscreen.active() || !fullscreen.canRequest()) return;
    const el = document.documentElement;
    try {
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' })?.catch?.(() => {});
    } catch {}
  },
};

// ---------- Keep screen on ----------
// A screen wake lock stops the phone sleeping (and dropping out of the game). The setting is
// remembered per phone; the browser releases the lock when you switch apps, so it's taken
// again when you come back.

const stayOn = {
  supported: 'wakeLock' in navigator,
  wanted: store.get('stayOn') === '1',
  lock: null,
  async acquire() {
    if (!stayOn.supported || !stayOn.wanted || stayOn.lock || document.visibilityState !== 'visible') return;
    try {
      stayOn.lock = await navigator.wakeLock.request('screen');
      stayOn.lock.addEventListener('release', () => { stayOn.lock = null; stayOn.update(); });
    } catch {
      stayOn.lock = null; // not allowed right now (e.g. low battery); tried again on the next tap
    }
    stayOn.update();
  },
  async toggle() {
    stayOn.wanted = !stayOn.wanted;
    store.set('stayOn', stayOn.wanted ? '1' : '0');
    if (stayOn.wanted) await stayOn.acquire();
    else await stayOn.lock?.release().catch(() => {});
    stayOn.update();
  },
  // Updates the button text in place.
  update() {
    document.querySelectorAll('.stay-btn').forEach((b) => {
      b.textContent = stayOn.label();
      b.classList.toggle('on', stayOn.wanted);
    });
  },
  label() {
    if (!stayOn.wanted) return '☀️ Keep screen on: Off';
    return stayOn.lock ? '☀️ Keep screen on: On' : '☀️ Keep screen on: On (tap anywhere)';
  },
};
document.addEventListener('visibilitychange', () => stayOn.acquire());
// Some phones only allow it after a tap, so try again on any tap until it sticks.
document.addEventListener('click', () => stayOn.acquire());
stayOn.acquire();

function fullscreenButtons() {
  if (seat) return '';
  const fs = !fullscreen.active() && fullscreen.canRequest() ? '<button class="fs-btn secondary" id="fs">⛶ Full screen</button>' : '';
  const stay = stayOn.supported ? `<button class="stay-btn secondary ${stayOn.wanted ? 'on' : ''}" id="stay">${stayOn.label()}</button>` : '';
  return fs + stay;
}

function bindFullscreenButtons() {
  document.getElementById('fs')?.addEventListener('click', () => fullscreen.enter());
  document.getElementById('stay')?.addEventListener('click', (e) => {
    e.stopPropagation(); // the tap-anywhere retry shouldn't race the toggle
    stayOn.toggle();
  });
}

// Hide the button once full screen (no full redraw, so typed text isn't lost).
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => document.querySelectorAll('.fs-btn').forEach((b) => (b.hidden = fullscreen.active())));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2500);
}

function joinUrl() {
  return `${location.origin}/?room=${PB.state.code}`;
}

function leaveRoom() {
  socket.emit('leave');
  store.del('room');
  PB.state = null;
  history.replaceState(null, '', seat ? `/?seat=${seat}` : '/');
  render();
}

// Taps on anything with data-act send a game action; data-cmd sends a room command.
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-cmd]');
  if (!el || el.disabled) return;
  if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
  const { act, cmd, confirm: _, ...data } = el.dataset;
  if (act) PB.act(act, data);
  else socket.emit(cmd, data);
});

// ---------- Connection ----------

socket.on('connect', () => {
  // Rejoin automatically after a refresh or a dropped connection.
  const room = store.get('room');
  if (room) {
    socket.emit('join', { code: room, playerId, name: store.get('name') }, (res) => {
      if (res.error) {
        store.del('room');
        PB.state = null;
        render();
      }
    });
  }
});

socket.on('state', (s) => {
  PB.clockOffset = s.serverNow - Date.now();
  PB.state = s;
  store.set('room', s.code);
  if (!s.players.some((p) => p.id === playerId)) return leaveRoom();
  render();
});

socket.on('kicked', () => {
  store.del('room');
  PB.state = null;
  homeError = 'You were removed from the room';
  render();
});

// Full-screen "drink!" alert when someone hands you sips.
socket.on('drink', ({ sips, reason, from, title }) => {
  navigator.vibrate?.([200, 100, 200]);
  const el = document.getElementById('drink-alert');
  const heading = title || `DRINK ${sips} SIP${sips === 1 ? '' : 'S'}`;
  el.innerHTML = `<div class="big">🍺 ${PB.esc(heading)}</div><div>${from ? `from ${PB.esc(from)}` : ''}${from && reason ? ' · ' : ''}${PB.esc(reason)}</div><small>tap to dismiss</small>`;
  el.hidden = false;
  clearTimeout(el.t);
  el.t = setTimeout(() => (el.hidden = true), 4000);
});
document.getElementById('drink-alert').onclick = (e) => (e.currentTarget.hidden = true);

// ---------- Screens ----------

function renderHome() {
  const savedName = store.get('name') || (seat ? `Player ${seat}` : '');
  $app.innerHTML = `
    <h1><span class="logo-emoji">🍻</span> Bool<span>ers</span> <span class="logo-emoji">🎲</span></h1>
    <p class="tagline">Drinking games for your phones</p>
    <div class="card">
      <input id="name" placeholder="Your name" maxlength="16" autocomplete="off" value="${PB.esc(savedName)}">
    </div>
    <div class="card">
      <input id="code" class="code" placeholder="CODE" maxlength="4" autocomplete="off" autocapitalize="characters" value="${PB.esc(urlRoom || '')}">
      <button id="join">Join room</button>
    </div>
    <p class="or">or</p>
    <button id="create" class="secondary">Create a new room</button>
    <p class="error" id="err">${PB.esc(homeError)}</p>
    <div class="card">
      <h2>📱 Pass and play</h2>
      <p class="muted">One phone, passed around. No room code needed.</p>
      <div class="pass-play">
        <a class="btn-link" href="/play/slevens.html">🎲 Slevens</a>
        <a class="btn-link" href="/play/madmax.html">🃏 Mad Max</a>
        <a class="btn-link" href="/play/local.html?game=rideTheBus">🚌 Ride the Bus</a>
        <a class="btn-link" href="/play/local.html?game=kingsCup">👑 Kings Cup</a>
      </div>
    </div>
    <div class="spacer"></div>
    ${fullscreenButtons()}
  `;
  bindFullscreenButtons();
  const $name = document.getElementById('name');
  const $code = document.getElementById('code');
  const $err = document.getElementById('err');

  function go(event, payload) {
    const name = $name.value.trim();
    if (!name) { $err.textContent = 'Enter your name'; $name.focus(); return; }
    store.set('name', name);
    fullscreen.enter();
    socket.emit(event, { ...payload, name, playerId }, (res) => {
      if (res.error) { $err.textContent = res.error; return; }
      homeError = '';
      store.set('room', res.code);
      if (!seat) history.replaceState(null, '', `/?room=${res.code}`);
    });
  }

  document.getElementById('join').onclick = () => {
    const code = $code.value.trim().toUpperCase();
    if (code.length !== 4) { $err.textContent = 'Room codes are 4 letters'; $code.focus(); return; }
    go('join', { code });
  };
  document.getElementById('create').onclick = () => go('create', {});
  $code.addEventListener('keydown', (e) => e.key === 'Enter' && document.getElementById('join').click());
  if (!seat) (urlRoom && !savedName ? $name : urlRoom ? $code : $name).focus();
}

function playerList({ showKick }) {
  const s = PB.state;
  return `<ul class="players">${s.players.map((p) => `
    <li class="${p.connected ? '' : 'offline'}">
      <span class="name">${PB.esc(p.name)}${p.id === s.me ? ' (you)' : ''}</span>
      ${p.id === s.hostId ? '<span class="tag">👑 host</span>' : ''}
      ${!p.connected ? '<span class="tag">offline</span>' : ''}
      ${showKick && p.id !== s.me ? `<button class="kick" data-cmd="kick" data-player-id="${PB.esc(p.id)}" data-confirm="Remove ${PB.esc(p.name)}?">✕</button>` : ''}
    </li>`).join('')}</ul>`;
}

function renderOptions() {
  const s = PB.state;
  if (!s.options.length) return '';
  return s.options.map((o) => `
    <div class="option">
      <span class="muted">${PB.esc(o.label)}</span>
      ${s.isHost
        ? `<div class="segmented">${o.choices.map((c) => `
            <button class="${c.value === o.value ? 'selected' : ''}" data-option="${PB.esc(o.id)}" data-value='${PB.esc(JSON.stringify(c.value))}'>${PB.esc(c.label)}</button>`).join('')}</div>`
        : `<strong>${PB.esc(o.choices.find((c) => c.value === o.value)?.label)}</strong>`}
    </div>`).join('');
}

function renderLobby() {
  const s = PB.state;
  const host = s.isHost;
  const game = s.games.find((g) => g.id === s.selectedGame);
  const online = s.players.filter((p) => p.connected).length;
  const canStart = online >= game.minPlayers;

  $app.innerHTML = `
    <div class="card center">
      <h2>Room code</h2>
      <div class="room-code">${PB.esc(s.code)}</div>
      <img class="qr" src="/qr/${PB.esc(s.code)}" alt="QR code to join">
      <button id="share" class="secondary">Share invite link</button>
    </div>
    <div class="card">
      <h2>Players (${s.players.length})</h2>
      ${playerList({ showKick: host })}
    </div>
    <div class="card">
      <h2>Game</h2>
      ${host
        ? `<div class="games">${s.games.map((g) => `
            <button class="game-option ${g.id === s.selectedGame ? 'selected' : ''}" data-cmd="selectGame" data-game-id="${PB.esc(g.id)}">
              ${PB.esc(g.name)}<small>${PB.esc(g.description)}</small>
            </button>`).join('')}</div>`
        : `<p><strong>${PB.esc(game.name)}</strong></p><p class="muted">${PB.esc(game.description)}</p>`}
      ${renderOptions()}
    </div>
    ${host
      ? `<button id="start" ${canStart ? '' : 'disabled'}>${canStart ? 'Start game' : `Need ${PB.plural(game.minPlayers - online, 'more player')}`}</button>`
      : `<p class="center muted">Waiting for ${PB.esc(PB.name(s.hostId))} to start…</p>`}
    ${fullscreenButtons()}
    <button id="leave" class="link">Leave room</button>
  `;
  bindFullscreenButtons();

  document.getElementById('share').onclick = async () => {
    const url = joinUrl();
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my Boolers room', text: `Room code ${s.code}`, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
    }
  };
  document.getElementById('leave').onclick = leaveRoom;
  $app.querySelectorAll('[data-option]').forEach((b) => {
    b.onclick = () => socket.emit('setOption', { id: b.dataset.option, value: JSON.parse(b.dataset.value) });
  });
  const $start = document.getElementById('start');
  if ($start) {
    $start.onclick = () => {
      fullscreen.enter();
      socket.emit('start', {}, (res) => res.error && toast(res.error));
    };
  }
}

function loadGame(gameId) {
  if (loading[gameId]) return;
  loading[gameId] = true;
  const script = document.createElement('script');
  script.src = `/games/${encodeURIComponent(gameId)}.js`;
  script.onload = render;
  script.onerror = () => { $app.innerHTML = `<p class="error">Couldn't load ${PB.esc(gameId)}</p>`; };
  document.head.appendChild(script);
}

function renderGame() {
  const s = PB.state;
  const screens = PB.screens[s.gameType];
  if (!screens) {
    $app.innerHTML = '<p class="center muted">Loading…</p>';
    return loadGame(s.gameType);
  }
  // A screen returns null to keep what's showing (e.g. while a finger is mid-gesture).
  const html = screens.render(s);
  if (html === null) return;
  // Full-screen games place PB.endButton() themselves.
  $app.innerHTML = screens.fullscreen ? html : `
    ${html}
    <div class="spacer"></div>
    ${PB.endButton()}
  `;
  screens.afterRender?.(s);
}

function render() {
  if (!PB.state) return renderHome();
  if (PB.state.phase === 'lobby') return renderLobby();
  renderGame();
  updateTimer();
}

function updateTimer() {
  const el = document.getElementById('timer');
  if (!el || !PB.state?.deadline) return;
  const left = Math.max(0, Math.ceil((PB.state.deadline - PB.now()) / 1000));
  el.textContent = `⏱ ${left}s`;
}
setInterval(updateTimer, 250);

render();
