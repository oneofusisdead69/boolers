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
PB.isTV = true; // games can draw things only the TV shows

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

// The list of games comes once, when we connect (see server.js); every state gets it added.
let gameList = [];
socket.on('games', (list) => { gameList = list; });

socket.on('state', (s) => {
  s.games = gameList;
  PB.track(s);
  const prev = PB.state;
  PB.clockOffset = s.serverNow - Date.now();
  PB.state = s;
  playSounds(prev, s);
  render();
});

// Quick updates a game sends without the whole state (where a dart is aimed).
socket.on('aim', (aim) => PB.screens[PB.state?.gameType]?.onAim?.(aim));

// Every drink pops up on the TV, with a buzz, and the drinker's glass tips up.
const sipping = new Set();
socket.on('drink', (d) => {
  sipping.add(d.playerId);
  document.querySelector(`.tv-glass[data-player="${CSS.escape(d.playerId)}"]`)?.classList.add('sip');
  setTimeout(() => {
    sipping.delete(d.playerId);
    document.querySelector(`.tv-glass[data-player="${CSS.escape(d.playerId)}"]`)?.classList.remove('sip');
  }, 1800);
  const el = document.createElement('div');
  el.className = 'tv-drink';
  el.innerHTML = `${PB.avatar(d.playerId)}<div><b>${esc(d.who)}</b>${d.title ? `: ${esc(d.title)}` : ` drinks ${PB.plural(d.sips, 'sip')}`}
    ${d.from ? `<small>from ${esc(d.from)}</small>` : ''}${d.reason ? `<small>${esc(d.reason)}</small>` : ''}</div>`;
  $drinks.prepend(el);
  // Only the latest few stay up.
  [...$drinks.children].slice(4).forEach((old) => old.remove());
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
  Prefs.play('drink');
});



// ---------- Sound ----------

document.addEventListener('pointerdown', () => {
  if (soundOn) return;
  soundOn = true;
  document.getElementById('tv-sound')?.remove();
  music();
}, { capture: true });

// Background sound to match the room style (public/ambience.js): off, low or high, remembered.
const MUSIC = [['Off', 0], ['Low', 0.5], ['High', 1]];
let musicLevel = 1;
try { musicLevel = Number(localStorage.getItem('tv-music') ?? 1) % MUSIC.length; } catch {}
function music() {
  if (soundOn) Ambience.set(PB.state?.look || PB.state?.style, MUSIC[musicLevel][1]);
  let btn = document.getElementById('tv-music');
  // It appears once sound is on (the "click for sound" button sits in the same corner till then).
  const show = soundOn && PB.state && PB.state.style && PB.state.style !== 'classic';
  if (!show) return btn?.remove();
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'tv-music';
    btn.className = 'tv-music';
    btn.onclick = () => {
      musicLevel = (musicLevel + 1) % MUSIC.length;
      try { localStorage.setItem('tv-music', musicLevel); } catch {}
      music();
    };
    document.body.appendChild(btn);
  }
  btn.textContent = `🎵 Room sound: ${MUSIC[musicLevel][0]}`;
}

// ---------- Full screen ----------
// A button in the corner (or the F key) fills the whole TV with the game.

const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function toggleFullscreen() {
  try {
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {});
    else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' })?.catch?.(() => {});
    }
  } catch {}
}
if (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen) {
  const btn = document.createElement('button');
  btn.id = 'tv-full';
  btn.className = 'tv-full';
  const label = () => (btn.textContent = isFull() ? '⛶ Exit full screen' : '⛶ Full screen');
  btn.onclick = toggleFullscreen;
  document.addEventListener('fullscreenchange', label);
  document.addEventListener('webkitfullscreenchange', label);
  label();
  document.body.appendChild(btn);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) toggleFullscreen();
  });
}

function playSounds(prev, s) {
  if (!prev || !s.game || prev.gameType !== s.gameType) return;
  const screens = PB.screens[s.gameType];
  const sounds = new Set(screens?.sounds?.(prev, s) || []);
  if (s.phase === 'over' && prev.phase !== 'over') sounds.add('win');
  const pick = ['win', 'bell', 'dice', 'dart', 'card', 'turn'].find((x) => sounds.has(x));
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
        ${s.venue ? `<div class="tv-venue">Welcome to</div><h1 class="tv-venue-name">${esc(s.venue)}</h1>` : '<h1><span class="logo-emoji">🍻</span> Bool <span>Games</span> <span class="logo-emoji">🎲</span></h1>'}
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
        ${ROOM_STYLES.STYLES[s.look]?.welcome ? `<p class="room-welcome"><b>${esc(ROOM_STYLES.STYLES[s.look].emoji)} ${esc(s.venue || ROOM_STYLES.STYLES[s.look].label)}</b> · ${esc(ROOM_STYLES.STYLES[s.look].welcome)}</p>` : ''}
      </div>
    </div>
    ${soundButton()}`;
}

// Seats round an oval table: everyone's avatar, name and sips, glowing on their turn.
function seats(s) {
  const g = s.game || {};
  const turn = g.turnId || g.rollerId || g.give?.from || g.bus?.riderId || null;
  // A game can put things on the table in front of each player (their dice, their cards).
  const front = PB.screens[s.gameType]?.tvFront;
  // Everyone's drink sits on the rail beside them, whatever the room drinks.
  const drink = ROOM_STYLES.STYLES[s.look || s.style]?.drink || '🍺';
  return s.players.map((p) => `<div class="tv-seat ${p.id === turn ? 'turn' : ''} ${p.connected ? '' : 'offline'}">
      ${PB.avatar(p.id, 'lg')}<b>${esc(p.name)}</b><small>🍺 ${p.drinks}</small></div>
    <div class="tv-front">${front?.(s, p.id) || ''}</div>
    <div class="tv-glass ${sipping.has(p.id) ? 'sip' : ''}" data-player="${esc(p.id)}">${drink}</div>`).join('');
}

// Everyone sits just outside the table's edge (never on it), whatever the screen's shape: each
// seat is pushed out from the rim along the edge's normal by half its own size.
function placeSeats() {
  const table = document.querySelector('.tv-table');
  const felt = document.querySelector('.tv-felt');
  const els = [...document.querySelectorAll('#tv-seats .tv-seat')];
  const fronts = [...document.querySelectorAll('#tv-seats .tv-front')];
  const glasses = [...document.querySelectorAll('#tv-seats .tv-glass')];
  if (!table || !felt || !els.length) return;
  const W = table.clientWidth;
  const H = table.clientHeight;
  const rx = felt.offsetWidth / 2;
  const ry = felt.offsetHeight / 2;
  const rim = 1.7 * parseFloat(getComputedStyle(document.documentElement).fontSize);
  els.forEach((el, i) => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / els.length; // first seat at the bottom, going round
    let nx = Math.cos(a) / rx;
    let ny = Math.sin(a) / ry;
    const len = Math.hypot(nx, ny);
    nx /= len;
    ny /= len;
    const half = Math.abs(nx) * (el.offsetWidth / 2) + Math.abs(ny) * (el.offsetHeight / 2);
    const x = W / 2 + rx * Math.cos(a) + nx * (rim + half);
    const y = H / 2 + ry * Math.sin(a) + ny * (rim + half);
    // Keep the whole seat on screen.
    el.style.left = `${Math.min(W - el.offsetWidth / 2, Math.max(el.offsetWidth / 2, x)).toFixed(0)}px`;
    el.style.top = `${Math.min(H - el.offsetHeight / 2, Math.max(el.offsetHeight / 2, y)).toFixed(0)}px`;
    // Their drink stands on the rail a little round from them (towards their right hand).
    const g = glasses[i];
    if (g) {
      const b = a - Math.min(0.32, Math.PI / els.length / 1.6);
      g.style.left = `${(W / 2 + (rx + rim * 0.45) * Math.cos(b)).toFixed(0)}px`;
      g.style.top = `${(H / 2 + (ry + rim * 0.45) * Math.sin(b)).toFixed(0)}px`;
    }
    // What's in front of them sits on the felt, just inside the rim.
    const f = fronts[i];
    if (f?.firstElementChild) {
      const inner = Math.abs(nx) * (f.offsetWidth / 2) + Math.abs(ny) * (f.offsetHeight / 2) + rim * 0.6;
      f.style.left = `${(W / 2 + rx * Math.cos(a) - nx * inner).toFixed(0)}px`;
      f.style.top = `${(H / 2 + ry * Math.sin(a) - ny * inner).toFixed(0)}px`;
    }
  });
}

function sidebar(s) {
  const game = s.games.find((x) => x.id === s.gameType);
  // A game can pick the rules that apply to how it's being played (e.g. the darts mode).
  const rules = PB.screens[s.gameType]?.tvRules?.(s, game?.rules || []) || game?.rules || [];
  const board = s.players.slice().sort((a, b) => b.drinks - a.drinks || (b.total || 0) - (a.total || 0));
  return `
    <div class="card tv-board"><h2>🍺 Leaderboard</h2><ol>${board.map((p) => `
      <li>${PB.avatar(p.id, 'sm')}<span>${esc(p.name)}</span><b>${p.drinks}</b><small>${p.total || 0} tonight</small></li>`).join('')}</ol></div>
    ${rules.length ? `<div class="card tv-rules-card"><h2>📜 ${esc(game.name)}</h2><ul class="tv-rules">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
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
  const left = document.getElementById('tv-left');
  center.innerHTML = '';
  if (left) left.innerHTML = '';
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
  // Games without a table (the horse race) put part of the screen in a column on the left.
  if (left && screens.tvLeft) left.append(...center.querySelectorAll(screens.tvLeft));
  // ...and can put a banner (the winner) right across the middle of the screen.
  const banner = document.getElementById('tv-banner');
  if (banner) {
    banner.innerHTML = '';
    if (screens.tvBanner) banner.append(...center.querySelectorAll(screens.tvBanner));
  }
  screens.afterRender?.(s);
  return true;
}

// Scales the middle of the table (and the left column, if there is one) to fill its space.
function fit() {
  for (const [box, inner, most] of [['.tv-center-box', '#tv-center', 2.6], ['.tv-left-box', '#tv-left', 2]]) {
    const $box = document.querySelector(box);
    const $inner = document.querySelector(inner);
    if (!$box || !$inner) continue;
    $inner.style.zoom = 1;
    const z = Math.min($box.clientWidth / $inner.scrollWidth, $box.clientHeight / $inner.scrollHeight, most);
    $inner.style.zoom = Math.max(0.5, z).toFixed(3);
  }
}
window.addEventListener('resize', () => {
  fit();
  placeSeats();
});

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
        <header class="tv-head"><b class="tv-title">${esc(game.name)}</b><div id="tv-turn" class="tv-turn"></div><span class="tv-code">${s.venue ? `${esc(s.venue)} · ` : ''}Join: <b>${esc(s.code)}</b></span></header>
        ${screens.tvTable === false
          ? '<div class="tv-wide"><div class="tv-left-box"><div id="tv-left"></div></div><div class="tv-center-box"><div id="tv-center"></div></div></div><div id="tv-banner" class="tv-banner"></div>'
          : '<div class="tv-table"><div class="tv-felt"></div><div id="tv-seats"></div><div class="tv-center-box"><div id="tv-center"></div></div></div><div id="tv-banner" class="tv-banner"></div>'}
        <aside class="tv-side" id="tv-side"></aside>
      </div>
      ${soundButton()}`;
  }
  const $seats = document.getElementById('tv-seats');
  if ($seats) {
    $seats.innerHTML = seats(s);
    placeSeats();
  }
  document.getElementById('tv-side').innerHTML = `${Trip.chip(s)}${sidebar(s)}`;
  if (fillCenter(s, screens)) fit();
  updateTimer();
}

function render() {
  const s = PB.state;
  ROOM_STYLES.apply(s?.look || s?.style);
  Scenery.set(s?.look || s?.style);
  music();
  if (!s) return joinScreen();
  if (s.trip && s.phase === 'lobby') {
    delete $tv.dataset.game;
    $tv.innerHTML = `<div class="tv-trip">${Trip.html(s, { tv: true })}</div>`;
    return;
  }
  if (s.recap && s.phase === 'lobby') {
    delete $tv.dataset.game;
    $tv.innerHTML = `<div class="tv-recap">${Recap.html(s, { tv: true })}</div>`;
    return;
  }
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
