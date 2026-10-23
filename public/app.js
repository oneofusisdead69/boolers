const socket = io();
const $app = document.getElementById('app');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let playerId = store.get('pb_id');
if (!playerId) {
  playerId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set('pb_id', playerId);
}

let state = null; // latest room state from the server; null = home screen
let clockOffset = 0; // serverNow - localNow
let lastDrinkRound = null;
let homeError = '';

const urlRoom = new URLSearchParams(location.search).get('room');

// ---------- helpers ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2500);
}

function playerName(id) {
  return state.players.find((p) => p.id === id)?.name ?? '???';
}

function joinUrl() {
  return `${location.origin}/?room=${state.code}`;
}

function leaveRoom() {
  socket.emit('leave');
  store.del('pb_room');
  state = null;
  history.replaceState(null, '', '/');
  render();
}

// ---------- connection ----------

socket.on('connect', () => {
  // Rejoin automatically after a refresh or a dropped connection.
  const room = store.get('pb_room');
  if (room) {
    socket.emit('join', { code: room, playerId, name: store.get('pb_name') }, (res) => {
      if (res.error) {
        store.del('pb_room');
        state = null;
        render();
      }
    });
  }
});

socket.on('state', (s) => {
  clockOffset = s.serverNow - Date.now();
  state = s;
  store.set('pb_room', s.code);
  if (!s.players.some((p) => p.id === playerId)) return leaveRoom();
  render();
});

socket.on('kicked', () => {
  store.del('pb_room');
  state = null;
  homeError = 'You were removed from the room';
  render();
});

// ---------- screens ----------

function renderHome() {
  const savedName = store.get('pb_name') || '';
  $app.innerHTML = `
    <h1>Party<span>Box</span></h1>
    <p class="tagline">Drinking games for your phones</p>
    <div class="card">
      <input id="name" placeholder="Your name" maxlength="16" autocomplete="off" value="${esc(savedName)}">
    </div>
    <div class="card">
      <input id="code" class="code" placeholder="CODE" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(urlRoom || '')}">
      <button id="join">Join room</button>
    </div>
    <p class="or">or</p>
    <button id="create" class="secondary">Create a new room</button>
    <p class="error" id="err">${esc(homeError)}</p>
  `;
  const $name = document.getElementById('name');
  const $code = document.getElementById('code');
  const $err = document.getElementById('err');

  function go(event, payload) {
    const name = $name.value.trim();
    if (!name) { $err.textContent = 'Enter your name'; $name.focus(); return; }
    store.set('pb_name', name);
    socket.emit(event, { ...payload, name, playerId }, (res) => {
      if (res.error) { $err.textContent = res.error; return; }
      homeError = '';
      store.set('pb_room', res.code);
      history.replaceState(null, '', `/?room=${res.code}`);
    });
  }

  document.getElementById('join').onclick = () => {
    const code = $code.value.trim().toUpperCase();
    if (code.length !== 4) { $err.textContent = 'Room codes are 4 letters'; $code.focus(); return; }
    go('join', { code });
  };
  document.getElementById('create').onclick = () => go('create', {});
  $code.addEventListener('keydown', (e) => e.key === 'Enter' && document.getElementById('join').click());
  (urlRoom && !savedName ? $name : urlRoom ? $code : $name).focus();
}

function playerList({ showKick }) {
  return `<ul class="players">${state.players.map((p) => `
    <li class="${p.connected ? '' : 'offline'}">
      <span class="name">${esc(p.name)}${p.id === state.me ? ' (you)' : ''}</span>
      ${p.id === state.hostId ? '<span class="tag">👑 host</span>' : ''}
      ${!p.connected ? '<span class="tag">offline</span>' : ''}
      ${showKick && p.id !== state.me ? `<button class="kick" data-kick="${esc(p.id)}">✕</button>` : ''}
    </li>`).join('')}</ul>`;
}

function renderLobby() {
  const host = state.isHost;
  const game = state.games.find((g) => g.id === state.selectedGame);
  const online = state.players.filter((p) => p.connected).length;
  const canStart = online >= game.minPlayers;

  $app.innerHTML = `
    <div class="card center">
      <h2>Room code</h2>
      <div class="room-code">${esc(state.code)}</div>
      <img class="qr" src="/qr/${esc(state.code)}" alt="QR code to join">
      <button id="share" class="secondary">Share invite link</button>
    </div>
    <div class="card">
      <h2>Players (${state.players.length})</h2>
      ${playerList({ showKick: host })}
    </div>
    <div class="card">
      <h2>Game</h2>
      ${host
        ? `<div class="games">${state.games.map((g) => `
            <button class="game-option ${g.id === state.selectedGame ? 'selected' : ''}" data-game="${esc(g.id)}">
              ${esc(g.name)}<small>${esc(g.description)}</small>
            </button>`).join('')}</div>`
        : `<p><strong>${esc(game.name)}</strong></p><p class="muted">${esc(game.description)}</p>`}
    </div>
    ${host
      ? `<button id="start" ${canStart ? '' : 'disabled'}>${canStart ? 'Start game' : `Need ${game.minPlayers - online} more player${game.minPlayers - online === 1 ? '' : 's'}`}</button>`
      : `<p class="center muted">Waiting for ${esc(playerName(state.hostId))} to start…</p>`}
    <button id="leave" class="link">Leave room</button>
  `;

  document.getElementById('share').onclick = async () => {
    const url = joinUrl();
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my PartyBox room', text: `Room code ${state.code}`, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
    }
  };
  document.getElementById('leave').onclick = leaveRoom;
  $app.querySelectorAll('[data-kick]').forEach((b) => {
    b.onclick = () => confirm(`Remove ${playerName(b.dataset.kick)}?`) && socket.emit('kick', { playerId: b.dataset.kick });
  });
  $app.querySelectorAll('[data-game]').forEach((b) => {
    b.onclick = () => socket.emit('selectGame', { gameId: b.dataset.game });
  });
  const $start = document.getElementById('start');
  if ($start) $start.onclick = () => socket.emit('start', {}, (res) => res.error && toast(res.error));
}

function hostMenu() {
  return state.isHost ? '<button id="end" class="link">End game</button>' : '';
}

function bindHostMenu() {
  const $end = document.getElementById('end');
  if ($end) $end.onclick = () => confirm('End the game for everyone?') && socket.emit('endGame');
}

function renderMostLikelyQuestion() {
  const g = state.game;
  const online = state.players.filter((p) => p.connected);
  const voted = online.filter((p) => g.votedIds.includes(p.id)).length;

  $app.innerHTML = `
    <div class="topbar"><span>Round ${g.round}</span><span class="timer" id="timer"></span></div>
    <div class="prompt"><small>Who's most likely to…</small>${esc(g.question)}?</div>
    <div class="vote-grid">${state.players.map((p) => `
      <button data-vote="${esc(p.id)}" class="${g.myVote === p.id ? 'selected' : ''}">
        ${esc(p.name)}${p.id === state.me ? ' (you)' : ''}
        ${g.votedIds.includes(p.id) ? '<span class="check">✓ voted</span>' : ''}
      </button>`).join('')}</div>
    <p class="center muted">${voted} / ${online.length} voted${g.myVote ? ' · tap to change your vote' : ''}</p>
    <div class="spacer"></div>
    ${hostMenu()}
  `;
  $app.querySelectorAll('[data-vote]').forEach((b) => {
    b.onclick = () => socket.emit('action', { type: 'vote', targetId: b.dataset.vote });
  });
  bindHostMenu();
}

function renderMostLikelyReveal() {
  const g = state.game;
  const { counts, drinkers, sips, noVotes } = g.result;
  const iDrink = drinkers.includes(state.me);

  if (iDrink && lastDrinkRound !== g.round) {
    lastDrinkRound = g.round;
    navigator.vibrate?.([200, 100, 200]);
  }

  const sipText = `${sips} sip${sips === 1 ? '' : 's'}`;
  let banner;
  if (noVotes) {
    banner = `<div class="drink me"><div class="big">Nobody voted 🤷</div><div class="sips">Everybody drinks ${sipText}!</div></div>`;
  } else if (iDrink) {
    const others = drinkers.filter((id) => id !== state.me).map(playerName);
    banner = `<div class="drink me"><div class="big">🍺 YOU DRINK!</div><div class="sips">${sipText}${others.length ? ` · with ${esc(others.join(', '))}` : ''}</div></div>`;
  } else {
    banner = `<div class="drink"><div class="big">${esc(drinkers.map(playerName).join(' & '))}</div><div class="sips">drink${drinkers.length === 1 ? 's' : ''} ${sipText} 🍺</div></div>`;
  }

  const rows = state.players
    .map((p) => ({ p, voters: counts[p.id] || [] }))
    .sort((a, b) => b.voters.length - a.voters.length)
    .filter((r) => r.voters.length > 0);

  const tally = state.players.slice().sort((a, b) => b.drinks - a.drinks);

  $app.innerHTML = `
    <div class="topbar"><span>Round ${g.round}</span></div>
    <div class="prompt"><small>Most likely to…</small>${esc(g.question)}</div>
    ${banner}
    ${rows.length ? `<div class="card results"><h2>Votes</h2><ul class="players">${rows.map((r) => `
      <li><span class="name">${esc(r.p.name)}<span class="voters">${esc(r.voters.map(playerName).join(', '))}</span></span>
      <span class="count">${r.voters.length}</span></li>`).join('')}</ul></div>` : ''}
    <div class="card results"><h2>Total sips</h2><ul class="players">${tally.map((p) => `
      <li><span class="name">${esc(p.name)}</span><span class="count">${p.drinks}</span></li>`).join('')}</ul></div>
    <div class="spacer"></div>
    ${state.isHost ? '<button id="next">Next question</button>' : `<p class="center muted">Waiting for ${esc(playerName(state.hostId))} to continue…</p>`}
    ${hostMenu()}
  `;
  const $next = document.getElementById('next');
  if ($next) $next.onclick = () => socket.emit('action', { type: 'next' });
  bindHostMenu();
}

const SCREENS = {
  mostLikely: { question: renderMostLikelyQuestion, reveal: renderMostLikelyReveal },
};

function render() {
  if (!state) return renderHome();
  if (state.phase === 'lobby') return renderLobby();
  SCREENS[state.gameType][state.phase]();
  updateTimer();
}

function updateTimer() {
  const el = document.getElementById('timer');
  if (!el || !state?.deadline) return;
  const left = Math.max(0, Math.ceil((state.deadline - (Date.now() + clockOffset)) / 1000));
  el.textContent = `⏱ ${left}s`;
}
setInterval(updateTimer, 250);

render();
