// Shared helpers for game screens, available as window.PB. Used by the multiplayer app
// (app.js) and the pass-and-play runner (play/local.html); each page plugs in PB.send (how a
// game action is sent) and PB.redraw (how the screen is redrawn).
(() => {
  const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣', X: '★' };
  const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 0: '🃏' };
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  const PB = {
    state: null,
    screens: {}, // gameId -> { render(state), afterRender?, fullscreen? }
    clockOffset: 0, // serverNow - localNow
    // On a shared phone, "you" is whoever is holding it right now, so screens show names instead.
    passAndPlay: false,
    send() {},
    redraw() {},

    register(gameId, screens) {
      PB.screens[gameId] = screens;
    },

    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    name(id) {
      if (id === PB.state.me && !PB.passAndPlay) return 'You';
      return PB.state.players.find((p) => p.id === id)?.name ?? '???';
    },

    // A player's avatar and colour. Pass and play (where nobody picks one) uses a fixed look per
    // seat.
    look(id) {
      const players = PB.state?.players || [];
      const i = players.findIndex((p) => p.id === id);
      const p = players[i];
      if (p?.avatar && p?.color) return { avatar: p.avatar, color: p.color };
      return window.LOOKS ? LOOKS.forSeat(Math.max(0, i)) : { avatar: '🙂', color: '#9aa0a6' };
    },

    // The avatar in a circle of the player's colour. size: '' | 'sm' | 'lg'.
    avatar(id, size = '') {
      return PB.avatarOf(PB.look(id), size);
    },

    avatarOf({ avatar, color }, size = '') {
      return `<span class="av ${size}" style="--pc:${PB.esc(color)}" aria-hidden="true">${PB.esc(avatar)}</span>`;
    },

    // Sends a game action, e.g. PB.act('roll') or PB.act('guess', { pick: 'red' }).
    // In HTML, <button data-act="guess" data-pick="red"> does the same thing on tap.
    act(type, data = {}) {
      PB.send(type, data);
    },

    plural(n, word) {
      return `${n} ${word}${n === 1 ? '' : 's'}`;
    },

    // A playing card. Pass null or { faceDown: true } for a card back.
    card(card, { size = '', faceDown = false } = {}) {
      if (!card || faceDown) return `<div class="pcard back ${size}"></div>`;
      const suit = SUIT_SYMBOLS[card.suit];
      const rank = RANK_LABELS[card.rank] ?? card.rank;
      const color = card.suit === 'H' || card.suit === 'D' ? 'red' : card.suit === 'X' ? 'joker' : 'black';
      return `<div class="pcard ${color} ${size}"><span class="corner">${rank}<br>${suit}</span><span class="pip">${suit}</span><span class="corner br">${rank}<br>${suit}</span></div>`;
    },

    dice(values, { rolling = false } = {}) {
      return `<div class="dice">${values.map((v) => `<div class="die ${rolling ? 'rolling' : ''}">${
        Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v]?.includes(i) ? 'on' : ''}"></i>`).join('')
      }</div>`).join('')}</div>`;
    },

    // Header showing whose turn it is.
    turn(playerId, text = '') {
      const mine = playerId === PB.state.me;
      const who = mine && !PB.passAndPlay ? 'Your turn' : `${PB.esc(PB.name(playerId))}'s turn`;
      return `<div class="turn ${mine ? 'mine' : ''}"><b class="turn-who">${PB.avatar(playerId, 'sm')}${who}</b>${text ? ` <span>${PB.esc(text)}</span>` : ''}</div>`;
    },

    // Grid of player buttons. Tapping one sends `action` with { targetId }.
    playerPicker(action, { exclude = [], selected = null, extra = {} } = {}) {
      const data = Object.entries(extra).map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${PB.esc(v)}"`).join(' ');
      return `<div class="vote-grid">${PB.state.players
        .filter((p) => !exclude.includes(p.id))
        .map((p) => `<button data-act="${PB.esc(action)}" data-target-id="${PB.esc(p.id)}" ${data} class="${selected === p.id ? 'selected' : ''} ${p.connected ? '' : 'offline'}">${PB.avatar(p.id)}<span>${PB.esc(p.name)}${p.id === PB.state.me && !PB.passAndPlay ? ' (you)' : ''}</span></button>`)
        .join('')}</div>`;
    },

    timer() {
      return '<span class="timer" id="timer"></span>';
    },

    // The host's "End game" button (empty for everyone else).
    endButton(className = 'link') {
      return PB.state.isHost ? `<button class="${className}" data-cmd="endGame" data-confirm="End the game for everyone?">End game</button>` : '';
    },

    // Redraws the current screen, for local-only changes like selecting a card.
    rerender() {
      PB.redraw();
    },

    // Current time on the server's clock, for lining up countdowns across phones.
    now() {
      return Date.now() + PB.clockOffset;
    },

    // Recent things that happened (drinks handed out etc.).
    feed(limit = 4) {
      const items = PB.state.feed.slice(-limit).reverse();
      if (!items.length) return '';
      return `<ul class="feed">${items.map((f) => `<li>${PB.esc(f.text)}</li>`).join('')}</ul>`;
    },

    scoreboard() {
      const rows = PB.state.players.slice().sort((a, b) => b.drinks - a.drinks);
      return `<div class="card"><h2>Total sips</h2><ul class="players">${rows.map((p) => `
        <li class="${p.connected ? '' : 'offline'}">${PB.avatar(p.id)}<span class="name">${PB.esc(p.name)}${p.id === PB.state.me && !PB.passAndPlay ? ' (you)' : ''}</span><span class="count">${p.drinks}</span></li>`).join('')}</ul></div>`;
    },
  };
  window.PB = PB;
})();
