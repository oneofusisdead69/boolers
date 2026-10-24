// Bool Games phone client. This file handles joining, the lobby, and shared UI pieces.
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

// Your avatar and colour, remembered on this phone. Until you pick one yourself, the room hands
// you one nobody else has (and the phone remembers that).
function myLook() {
  let look = { avatar: store.get('avatar'), color: store.get('color') };
  if (!LOOKS.AVATARS.includes(look.avatar) || !LOOKS.COLORS.includes(look.color)) {
    look = LOOKS.choose(look, [], true);
    store.set('avatar', look.avatar);
    store.set('color', look.color);
  }
  return look;
}
const lookToSend = () => (store.get('lookPicked') ? myLook() : {});

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
  if (seat) return Prefs.button();
  const fs = !fullscreen.active() && fullscreen.canRequest() ? '<button class="fs-btn secondary" id="fs">⛶ Full screen</button>' : '';
  const stay = stayOn.supported ? `<button class="stay-btn secondary ${stayOn.wanted ? 'on' : ''}" id="stay">${stayOn.label()}</button>` : '';
  return fs + stay + Prefs.button() + Prefs.feedbackButton();
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
    socket.emit('join', { code: room, playerId, name: store.get('name'), ...lookToSend() }, (res) => {
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
  playSounds(PB.state, s);
  PB.state = s;
  store.set('room', s.code);
  if (!s.players.some((p) => p.id === playerId)) return leaveRoom();
  // Keep the look the room gave you, if you haven't picked your own.
  const meNow = s.players.find((p) => p.id === playerId);
  if (!store.get('lookPicked') && meNow.avatar) {
    store.set('avatar', meNow.avatar);
    store.set('color', meNow.color);
  }
  render();
});

socket.on('kicked', () => {
  store.del('room');
  PB.state = null;
  homeError = 'You were removed from the room';
  render();
});

// ---------- Avatar picker ----------
// Opened from your avatar on the home screen or in the lobby. In a room, changes go straight to
// everyone else.

let lookPicker = null;
function openLookPicker() {
  const look = myLook();
  if (!lookPicker) {
    lookPicker = document.createElement('div');
    lookPicker.className = 'prefs-overlay';
    lookPicker.addEventListener('click', (e) => {
      if (e.target === lookPicker || e.target.closest('[data-look-done]')) {
        lookPicker.remove();
        const typed = document.getElementById('name')?.value.trim();
        if (typed) store.set('name', typed); // the home screen redraws; keep what was typed
        return render();
      }
      const b = e.target.closest('[data-av], [data-color]');
      if (!b) return;
      store.set('lookPicked', '1');
      if (b.dataset.av) store.set('avatar', b.dataset.av);
      if (b.dataset.color) store.set('color', b.dataset.color);
      if (PB.state) socket.emit('setLook', myLook());
      openLookPicker();
    });
  }
  lookPicker.innerHTML = `
    <div class="prefs-panel look-panel" role="dialog" aria-modal="true" aria-label="Your avatar">
      <header><h2>Your avatar</h2>${PB.avatarOf(look, 'lg')}</header>
      <div class="look-colors">${LOOKS.COLORS.map((c) => `
        <button class="${c === look.color ? 'on' : ''}" data-color="${c}" style="--pc:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
      <div class="look-avatars">${LOOKS.AVATARS.map((a) => `
        <button class="${a === look.avatar ? 'on' : ''}" data-av="${a}" style="--pc:${look.color}">${a}</button>`).join('')}</div>
      <button data-look-done>Done</button>
    </div>`;
  if (!lookPicker.isConnected) document.body.appendChild(lookPicker);
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-look]')) openLookPicker();
});

// ---------- Sound effects ----------
// Compares each new state with the last: a game's screens say which of its moments make a sound
// (dice rolled, card flipped), and the app adds "your turn" and the game ending.

function playSounds(prev, s) {
  if (s.tv) return; // the TV plays the sounds
  if (!prev || !s.game || prev.gameType !== s.gameType || prev.code !== s.code) return;
  const screens = PB.screens[s.gameType];
  const sounds = new Set(screens?.sounds?.(prev, s) || []);
  const turn = (x) => x.game?.turnId ?? x.game?.rollerId ?? null;
  if (turn(s) === s.me && turn(prev) !== s.me) sounds.add('turn');
  if (s.phase === 'over' && prev.phase !== 'over') sounds.add('win');
  // One at a time, the most important first.
  const pick = ['win', 'bell', 'dice', 'dart', 'card', 'turn'].find((x) => sounds.has(x));
  if (pick) Prefs.play(pick);
  if (pick !== 'turn' && pick !== 'win' && sounds.has('turn')) setTimeout(() => Prefs.play('turn'), 600);
}

// Full-screen "drink!" alert when someone hands you sips.
// Sips of water (water mode, or over the room's hourly limit) come up blue.
socket.on('drink', ({ sips, reason, from, title, water, why }) => {
  navigator.vibrate?.([200, 100, 200]);
  if (!PB.state?.tv) Prefs.play('drink'); // with a TV, the TV buzzes
  const heading = title || `DRINK ${sips} SIP${sips === 1 ? '' : 'S'}`;
  showAlert(`<div class="big">${water ? '💧' : '🍺'} ${PB.esc(heading)}</div><div>${from ? `from ${PB.esc(from)}` : ''}${from && reason ? ' · ' : ''}${PB.esc(reason)}</div>${why ? `<div class="why">${PB.esc(why)}</div>` : ''}`, water ? 'water' : '', 4000);
});

// A water break (or another message for the whole room).
socket.on('notice', ({ title, text }) => {
  navigator.vibrate?.([100, 60, 100]);
  showAlert(`<div class="big">${PB.esc(title)}</div><div>${PB.esc(text)}</div>`, 'water', 8000);
});

function showAlert(html, kind, ms) {
  const el = document.getElementById('drink-alert');
  el.className = `drink-alert ${kind}`;
  el.innerHTML = `${html}<small>tap to dismiss</small>`;
  el.hidden = false;
  clearTimeout(el.t);
  el.t = setTimeout(() => (el.hidden = true), ms);
}
document.getElementById('drink-alert').onclick = (e) => (e.currentTarget.hidden = true);

// ---------- Screens ----------

function renderHome() {
  const savedName = store.get('name') || (seat ? `Player ${seat}` : '');
  $app.innerHTML = `
    <h1 class="ls-l"><span class="logo-emoji">🍻</span> Bool <span>Games</span> <span class="logo-emoji">🎲</span></h1>
    <p class="tagline ls-l">Drinking games for your phones</p>
    <div class="card name-card ls-l">
      <button class="av-btn" data-look aria-label="Pick your avatar">${PB.avatarOf(myLook(), 'lg')}</button>
      <input id="name" placeholder="Your name" maxlength="16" autocomplete="off" value="${PB.esc(savedName)}">
    </div>
    <div class="card ls-l">
      <input id="code" class="code" placeholder="CODE" maxlength="4" autocomplete="off" autocapitalize="characters" value="${PB.esc(urlRoom || '')}">
      <button id="join">Join room</button>
    </div>
    <p class="or ls-l">or</p>
    <button id="create" class="secondary ls-l">Create a new room</button>
    <p class="error ls-l" id="err">${PB.esc(homeError)}</p>
    <div class="card">
      <h2>📱 Pass and play</h2>
      <p class="muted">One phone, passed around. No room code needed.</p>
      <div class="pass-play">
        <a class="btn-link" href="/play/slevens.html">🎲 Slevens</a>
        <a class="btn-link" href="/play/madmax.html">🃏 Mad Max</a>
        <a class="btn-link" href="/play/local.html?game=rideTheBus">🚌 Ride the Bus</a>
        <a class="btn-link" href="/play/local.html?game=kingsCup">👑 Kings Cup</a>
        <a class="btn-link" href="/play/local.html?game=liarsDice">🤥 Liar's Dice</a>
        <a class="btn-link" href="/play/local.html?game=shotPoker">☠️ Shot Poker</a>
        <a class="btn-link" href="/play/local.html?game=horseRace">🏇 Horse Race</a>
        <a class="btn-link" href="/play/local.html?game=aceRace">♠️ Ace Race</a>
        <a class="btn-link" href="/play/local.html?game=darts">🎯 Darts</a>
      </div>
    </div>
    <div class="spacer"></div>
    ${fullscreenButtons()}
  `;
  PB.layout($app, '.ls-l');
  bindFullscreenButtons();
  const $name = document.getElementById('name');
  const $code = document.getElementById('code');
  const $err = document.getElementById('err');

  function go(event, payload) {
    const name = $name.value.trim();
    if (!name) { $err.textContent = 'Enter your name'; $name.focus(); return; }
    store.set('name', name);
    fullscreen.enter();
    socket.emit(event, { ...payload, name, playerId, ...lookToSend() }, (res) => {
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
      ${p.id === s.me ? `<button class="av-btn" data-look aria-label="Change your avatar">${PB.avatar(p.id)}</button>` : PB.avatar(p.id)}
      <span class="name">${PB.esc(p.name)}${p.id === s.me ? ' (you) <small class="muted">tap your avatar to change it</small>' : ''}</span>
      ${p.id === s.hostId ? '<span class="tag">👑 host</span>' : ''}
      ${!p.connected ? '<span class="tag">offline</span>' : ''}
      ${showKick && p.id !== s.me ? `<button class="kick" data-cmd="kick" data-player-id="${PB.esc(p.id)}" data-confirm="Remove ${PB.esc(p.name)}?">✕</button>` : ''}
    </li>`).join('')}</ul>`;
}

function renderOptions() {
  const s = PB.state;
  if (!s.options.length) return '';
  const values = Object.fromEntries(s.options.map((o) => [o.id, o.value]));
  return s.options.filter((o) => PB.optionShown(o, values)).map((o) => `
    <div class="option">
      <span class="muted">${PB.esc(o.label)}</span>
      ${s.isHost
        ? `<div class="segmented">${o.choices.map((c) => `
            <button class="${c.value === o.value ? 'selected' : ''}" data-option="${PB.esc(o.id)}" data-value='${PB.esc(JSON.stringify(c.value))}'>${PB.esc(c.label)}</button>`).join('')}</div>`
        : `<strong>${PB.esc(o.choices.find((c) => c.value === o.value)?.label)}</strong>`}
    </div>`).join('');
}

// Switch yourself to water (and back) any time.
function waterButton() {
  const me = PB.state.players.find((p) => p.id === PB.state.me);
  return `<button class="prefs-btn ${me?.waterMode ? 'on' : ''}" data-cmd="setWater" data-on="${!me?.waterMode}">💧 ${me?.waterMode ? 'On water' : 'Water'}</button>`;
}

// Pacing: an hourly sip limit (sips past it become water) and water breaks. The host sets it.
function pacingCard(s) {
  const { cap, breaks } = s.settings;
  const seg = (id, choices, value) => `<div class="segmented">${choices.map(([v, label]) =>
    `<button class="${v === value ? 'selected' : ''}" data-cmd="setSetting" data-id="${id}" data-value="${v}">${label}</button>`).join('')}</div>`;
  const me = s.players.find((p) => p.id === s.me);
  return `<div class="card pacing-card">
      <h2>💧 Pacing</h2>
      ${s.isHost ? `
        <div class="option"><span class="muted">Sips per person per hour (then it's water)</span>${seg('cap', [[0, 'No limit'], [10, '10'], [15, '15'], [20, '20'], [30, '30']], cap)}</div>
        <div class="option"><span class="muted">Water breaks for everyone</span>${seg('breaks', [[true, 'On'], [false, 'Off']], breaks)}</div>`
        : `<p class="muted">${cap ? `Up to ${cap} sips each an hour, then water.` : 'No hourly limit.'} Water breaks ${breaks ? 'on' : 'off'}.</p>`}
      <button class="${me?.waterMode ? '' : 'secondary'}" data-cmd="setWater" data-on="${!me?.waterMode}">${me?.waterMode ? '💧 You’re on water · tap to switch back' : '💧 Switch me to water'}</button>
    </div>`;
}

// The host picks how the room looks; everyone's phone (and the TV) follows.
function roomStyleCard(s) {
  const { STYLES } = ROOM_STYLES;
  const style = STYLES[s.style] || STYLES.classic;
  if (!s.isHost) return style.welcome ? `<p class="center room-welcome"><b>${PB.esc(style.emoji)} ${PB.esc(style.label)}</b><br><span class="muted">${PB.esc(style.welcome)}</span></p>` : '';
  return `<div class="card room-style-card">
      <h2>Room style</h2>
      <div class="room-styles">${Object.entries(STYLES).map(([id, st]) => `
        <button class="${id === s.style ? 'selected' : ''}" data-cmd="setStyle" data-style="${PB.esc(id)}"><span>${PB.esc(st.emoji)}</span>${PB.esc(st.label)}</button>`).join('')}</div>
      ${style.welcome ? `<p class="muted center">${PB.esc(style.welcome)}</p>` : ''}
    </div>`;
}

function renderLobby() {
  const s = PB.state;
  const host = s.isHost;
  const game = s.games.find((g) => g.id === s.selectedGame);
  const online = s.players.filter((p) => p.connected).length;
  const canStart = online >= game.minPlayers;

  $app.innerHTML = `
    <div class="card center ls-l">
      <h2>Room code</h2>
      <div class="room-code">${PB.esc(s.code)}</div>
      <img class="qr" src="/qr/${PB.esc(s.code)}" alt="QR code to join">
      <button id="share" class="secondary">Share invite link</button>
    </div>
    <div class="card ls-l">
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
      ${host && s.custom.length ? `
        <div class="custom-row">
          <small>${PB.hasCustom(game.id) ? '✏️ Using your edits' : 'Write your own questions and rules'}</small>
          <button class="secondary" id="customize">✏️ Customize</button>
        </div>` : ''}
    </div>
    ${roomStyleCard(s)}
    ${pacingCard(s)}
    <div class="card tv-card">
      ${s.tv
        ? '<p>📺 <b>TV connected.</b> The table, scores and sounds are on the big screen.</p>'
        : `<p>📺 <b>Got a TV?</b> Open <b>${PB.esc(location.host)}/tv</b> on it and enter <b>${PB.esc(s.code)}</b>.</p>`}
    </div>
    ${s.players.some((p) => p.total || p.finished) ? PB.tab() : ''}
    ${host
      ? `<button id="start" ${canStart ? '' : 'disabled'}>${canStart ? 'Start game' : `Need ${PB.plural(game.minPlayers - online, 'more player')}`}</button>`
      : `<p class="center muted">Waiting for ${PB.esc(PB.name(s.hostId))} to start…</p>`}
    ${fullscreenButtons()}
    <button id="leave" class="link">Leave room</button>
  `;
  PB.layout($app, '.ls-l');
  bindFullscreenButtons();

  document.getElementById('share').onclick = async () => {
    const url = joinUrl();
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my Bool Games room', text: `Room code ${s.code}`, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
    }
  };
  document.getElementById('leave').onclick = leaveRoom;
  $app.querySelectorAll('[data-option]').forEach((b) => {
    b.onclick = () => socket.emit('setOption', { id: b.dataset.option, value: JSON.parse(b.dataset.value) });
  });
  document.getElementById('customize')?.addEventListener('click', () => PB.editCustom(game.id, game.name, s.custom, render));
  const $start = document.getElementById('start');
  if ($start) {
    $start.onclick = () => {
      fullscreen.enter();
      socket.emit('start', { custom: PB.customFor(game.id) }, (res) => res.error && toast(res.error));
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
    <div class="game-foot">${PB.tabButton()}${waterButton()}${Prefs.button()}${PB.endButton()}</div>
  `;
  if (!screens.fullscreen) PB.layout($app, screens.stage);
  screens.afterRender?.(s);
}

function render() {
  ROOM_STYLES.apply(PB.state?.style);
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
