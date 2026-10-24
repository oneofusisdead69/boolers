// Bool Games on a TV. The TV joins a room as a watcher (not a player): the host runs the game from
// their phone, and the TV shows the table. Everyone's seat goes round a felt table with the game
// in the middle (each game's shared screen, scaled up), and a sidebar holds the leaderboard, a
// reminder of the rules and what just happened. The TV plays the sound effects; phones go quiet.
//
// The middle of the table reuses each game's own phone screens, drawn for a spectator: the TV
// picks out the shared parts (a game's `tvStage`, or its sideways `stage`), or uses the game's
// own `tv(state)` screen where it has one.

const socket = io();
const $tv = document.getElementById('tv');
const $hidden = document.getElementById('tv-hidden');
const $drinks = document.getElementById('tv-drinks');
const params = new URLSearchParams(location.search);
const store = {
  get: () => { try { return localStorage.getItem('tv-room'); } catch { return null; } },
  set: (code) => { try { localStorage.setItem('tv-room', code); } catch {} },
};
let code = (params.get('room') || store.get() || '').toUpperCase();
let error = '';
let soundOn = false; // browsers only allow sound after the first click
const loading = {};
const { esc } = PB;

// The TV never acts; it only watches.
PB.send = () => {};
PB.redraw = () => render();
PB.passAndPlay = true; // names, never "you"

// ---------- Connection ----------

function watch(c) {
  socket.emit('watch', { code: c }, (res) => {
    if (res.error) {
      error = res.error;
      code = '';
      PB.state = null;
      return render();
    }
    code = res.code;
    error = '';
    store.set(code);
    history.replaceState(null, '', `/tv?room=${code}`);
  });
}

socket.on('connect', () => (code ? watch(code) : render()));

socket.on('state', (s) => {
  const prev = PB.state;
  PB.clockOffset = s.serverNow - Date.now();
  PB.state = s;
  playSounds(prev, s);
  render();
});

// Every drink pops up on the TV, with a buzz.
socket.on('drink', (d) => {
  const el = document.createElement('div');
  el.className = 'tv-drink';
  el.innerHTML = `${PB.avatar(d.playerId)}<div><b>${esc(d.who)}</b>${d.title ? `: ${esc(d.title)}` : ` drinks ${PB.plural(d.sips, 'sip')}`}
    ${d.from ? `<small>from ${esc(d.from)}</small>` : ''}${d.reason ? `<small>${esc(d.reason)}</small>` : ''}</div>`;
  $drinks.prepend(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
  Prefs.play('drink');
});

// ---------- Sound ----------

document.addEventListener('pointerdown', () => {
  if (soundOn) return;
  soundOn = true;
  document.getElementById('tv-sound')?.remove();
}, { capture: true });

function playSounds(prev, s) {
  if (!prev || !s.game || prev.gameType !== s.gameType) return;
  const screens = PB.screens[s.gameType];
  const sounds = new Set(screens?.sounds?.(prev, s) || []);
  if (s.phase === 'over' && prev.phase !== 'over') sounds.add('win');
  const pick = ['win', 'bell', 'dice', 'card', 'turn'].find((x) => sounds.has(x));
  if (pick) Prefs.play(pick);
}

// ---------- Screens ----------

function joinScreen() {
  $tv.innerHTML = `
    <div class="tv-join">
      <h1><span class="logo-emoji">🍻</span> Bool <span>Games</span> <span class="logo-emoji">🎲</span></h1>
      <p class="tagline">TV mode: the table, the scores and the sounds on the big screen</p>
      <div class="card">
        <h2>Create a room on your phone, then enter its code here</h2>
        <input id="tv-code" class="code" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters">
        <button id="tv-go">Show this room</button>
        <p class="error">${esc(error)}</p>
      </div>
    </div>`;
  const $code = document.getElementById('tv-code');
  const go = () => {
    const c = $code.value.trim().toUpperCase();
    if (c.length === 4) watch(c);
  };
  document.getElementById('tv-go').onclick = go;
  $code.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  $code.focus();
}

const soundButton = () => (soundOn ? '' : '<button id="tv-sound" class="tv-sound">🔊 Click anywhere for sound</button>');

function lobbyScreen(s) {
  const game = s.games.find((g) => g.id === s.selectedGame);
  $tv.innerHTML = `
    <div class="tv-lobby">
      <div class="tv-lobby-join">
        <h1><span class="logo-emoji">🍻</span> Bool <span>Games</span> <span class="logo-emoji">🎲</span></h1>
        <p class="tagline">Join on your phone: scan the code, or go to <b>${esc(location.host)}</b></p>
        <div class="tv-room">
          <img class="qr" src="/qr/${esc(s.code)}" alt="QR code to join">
          <div><small>Room code</small><div class="room-code">${esc(s.code)}</div></div>
        </div>
        <div class="tv-lobby-players">${s.players.map((p) => `
          <div class="tv-player ${p.connected ? '' : 'offline'}">${PB.avatar(p.id, 'lg')}<span>${esc(p.name)}${p.id === s.hostId ? ' 👑' : ''}</span></div>`).join('') || '<p class="muted">Nobody here yet</p>'}</div>
      </div>
      <div class="card tv-lobby-game">
        <h2>Up next</h2>
        <div class="tv-game-name">${esc(game.name)}</div>
        <p class="muted">${esc(game.description)}</p>
        ${game.rules.length ? `<ol class="tv-rules">${game.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}
        <p class="muted">${esc(PB.name(s.hostId))} starts the game from their phone</p>
      </div>
    </div>
    ${soundButton()}`;
}

// Seats round an oval table: everyone's avatar, name and sips, glowing on their turn.
function seats(s) {
  const g = s.game || {};
  const turn = g.turnId || g.rollerId || g.give?.from || g.bus?.riderId || null;
  const n = s.players.length;
  return s.players.map((p, i) => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n; // first seat at the bottom, going round
    const x = 50 + 45 * Math.cos(a);
    const y = 50 + 41 * Math.sin(a);
    return `<div class="tv-seat ${p.id === turn ? 'turn' : ''} ${p.connected ? '' : 'offline'}" style="left:${x}%;top:${y}%">
      ${PB.avatar(p.id, 'lg')}<b>${esc(p.name)}</b><small>🍺 ${p.drinks}</small></div>`;
  }).join('');
}

function sidebar(s) {
  const game = s.games.find((x) => x.id === s.gameType);
  const board = s.players.slice().sort((a, b) => b.drinks - a.drinks || (b.total || 0) - (a.total || 0));
  return `
    <div class="card tv-board"><h2>🍺 Leaderboard</h2><ol>${board.map((p) => `
      <li>${PB.avatar(p.id, 'sm')}<span>${esc(p.name)}</span><b>${p.drinks}</b><small>${p.total || 0} tonight</small></li>`).join('')}</ol></div>
    ${game?.rules.length ? `<div class="card tv-rules-card"><h2>📜 ${esc(game.name)}</h2><ul class="tv-rules">${game.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${PB.feed(5)}`;
}

// The shared parts of a game's screen: its TV screen, or the parts of its phone screen everyone
// can see. Returns false if the screen asked to be left as it is (a race in progress).
function fillCenter(s, screens) {
  const own = screens.tv?.(s);
  const html = own ?? screens.render(s);
  if (html === null) return false;
  $hidden.innerHTML = html;
  const center = document.getElementById('tv-center');
  center.innerHTML = '';
  const turn = $hidden.querySelector('.turn');
  document.getElementById('tv-turn').innerHTML = turn ? turn.innerHTML : '';
  if (own != null) {
    center.append(...$hidden.childNodes);
  } else {
    const pick = screens.tvStage || screens.stage;
    // The outermost matches only, in page order.
    const found = pick ? [...$hidden.querySelectorAll(pick)].filter((el, _, all) => !all.some((o) => o !== el && o.contains(el))) : [];
    if (found.length) center.append(...found);
    else center.innerHTML = '<p class="center muted tv-wait">Over to the phones…</p>';
  }
  screens.afterRender?.(s);
  return true;
}

// Scales the middle of the table to fill its space.
function fit() {
  const box = document.querySelector('.tv-center-box');
  const inner = document.getElementById('tv-center');
  if (!box || !inner) return;
  inner.style.zoom = 1;
  const z = Math.min(box.clientWidth / inner.scrollWidth, box.clientHeight / inner.scrollHeight, 2.6);
  inner.style.zoom = Math.max(0.5, z).toFixed(3);
}
window.addEventListener('resize', fit);

function gameScreen(s) {
  const screens = PB.screens[s.gameType];
  if (!screens) {
    if (!loading[s.gameType]) {
      loading[s.gameType] = true;
      const script = document.createElement('script');
      script.src = `/games/${encodeURIComponent(s.gameType)}.js`;
      script.onload = () => render();
      document.head.appendChild(script);
    }
    $tv.innerHTML = '<p class="center muted tv-wait">Loading…</p>';
    return;
  }
  const game = s.games.find((x) => x.id === s.gameType);
  // Keep the table (and the middle, if the game is mid-animation); redraw the seats and sidebar.
  if (!document.getElementById('tv-center') || $tv.dataset.game !== s.gameType) {
    $tv.dataset.game = s.gameType;
    $tv.innerHTML = `
      <div class="tv-game">
        <header class="tv-head"><b class="tv-title">${esc(game.name)}</b><div id="tv-turn" class="tv-turn"></div><span class="tv-code">Join: <b>${esc(s.code)}</b></span></header>
        <div class="tv-table"><div class="tv-felt"></div><div id="tv-seats"></div><div class="tv-center-box"><div id="tv-center"></div></div></div>
        <aside class="tv-side" id="tv-side"></aside>
      </div>
      ${soundButton()}`;
  }
  document.getElementById('tv-seats').innerHTML = seats(s);
  document.getElementById('tv-side').innerHTML = sidebar(s);
  if (fillCenter(s, screens)) fit();
  updateTimer();
}

function render() {
  const s = PB.state;
  if (!s) return joinScreen();
  if (s.phase === 'lobby' || !s.gameType) {
    delete $tv.dataset.game;
    return lobbyScreen(s);
  }
  gameScreen(s);
}

function updateTimer() {
  const el = document.getElementById('timer');
  if (!el || !PB.state?.deadline) return;
  el.textContent = `⏱ ${Math.max(0, Math.ceil((PB.state.deadline - PB.now()) / 1000))}s`;
}
setInterval(updateTimer, 250);

render();
