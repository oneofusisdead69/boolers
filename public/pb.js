// Shared helpers for game screens, available as window.PB. Used by the multiplayer app
// (app.js) and the pass-and-play runner (play/local.html); each page plugs in PB.send (how a
// game action is sent) and PB.redraw (how the screen is redrawn).
(() => {
  // \uFE0E asks for the text symbol, so phones don't swap in an emoji (a big red ♥).
  const SUIT_SYMBOLS = { S: '♠\uFE0E', H: '♥\uFE0E', D: '♦\uFE0E', C: '♣\uFE0E', X: '★' };
  const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 0: '🃏' };
  // The big suit in the middle of a card, drawn as a shape rather than a text character so it
  // sits dead centre whatever the phone's font (and ♥ never turns into an emoji). 100×100 box.
  const SUIT_PATHS = {
    S: 'M50 6C30 28 8 42 8 60c0 14 11 22 23 22 8 0 14-4 17-9-1 9-5 16-12 21h28c-7-5-11-12-12-21 3 5 9 9 17 9 12 0 23-8 23-22C92 42 70 28 50 6Z',
    H: 'M50 91C20 69 6 53 6 35 6 21 17 11 30 11c9 0 16 5 20 13 4-8 11-13 20-13 13 0 24 10 24 24 0 18-14 34-44 56Z',
    D: 'M50 5 86 50 50 95 14 50Z',
    C: 'M50 7a19 19 0 0 1 15.6 29.8A19 19 0 1 1 54 66.2C54.6 80 58 88 66 94H34c8-6 11.4-14 12-27.8A19 19 0 1 1 34.4 36.8 19 19 0 0 1 50 7Z',
  };
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const loadingScreens = {}; // game ids whose screens have been asked for

  const PB = {
    state: null,
    screens: {}, // gameId -> { render(state), afterRender?, fullscreen? }
    clockOffset: 0, // serverNow - localNow
    // On a shared phone, "you" is whoever is holding it right now, so screens show names instead.
    passAndPlay: false,
    send() {},
    redraw() {},

    // Called with every state: when a new game starts, screens forget what they remembered from
    // the last one (a half-built bet, where the horses were, a hand-out in progress).
    track(s) {
      const id = s.gameType ? `${s.code}:${s.gameType}:${s.gameNo}` : null;
      if (!id || id === PB.lastGame) return;
      PB.lastGame = id;
      PB.handOut.key = null;
      PB.screens[s.gameType]?.reset?.();
    },

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

    // Options can apply to only some settings of another option, e.g.
    // showIf: { mode: [301, 501] } shows it only when the mode is 301 or 501.
    optionShown(option, values) {
      return Object.entries(option.showIf || {}).every(([id, allowed]) => allowed.includes(values[id]));
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
      return `<div class="pcard ${color} ${size}"><span class="corner">${rank}<br>${suit}</span>${PB.pip(card.suit)}<span class="corner br">${rank}<br>${suit}</span></div>`;
    },

    // The middle suit of a card (a star for a joker).
    pip(suit) {
      if (!SUIT_PATHS[suit]) return `<span class="pip">${SUIT_SYMBOLS[suit] ?? ''}</span>`;
      return `<svg class="pip" viewBox="0 0 100 100" aria-hidden="true"><path d="${SUIT_PATHS[suit]}"/></svg>`;
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

    // Counts down the PB.timer() on screen to the current state's deadline (on the server's clock).
    // Runs a few times a second on its own; pages call it after drawing too, so it never shows blank.
    tickTimer() {
      const el = document.getElementById('timer');
      if (!el || !PB.state?.deadline) return;
      el.textContent = `⏱ ${Math.max(0, Math.ceil((PB.state.deadline - PB.now()) / 1000))}s`;
    },

    // ---------- Shared by the pages (the phone app, the TV, pass and play) ----------

    // Loads a game's screens (/games/<id>.js) once, then runs `done` (straight away if they're
    // already here, as in a demo with them baked in). `failed` runs if they can't be loaded.
    loadScreens(gameId, done = () => {}, failed = () => {}) {
      if (PB.screens[gameId]) return void done();
      if (loadingScreens[gameId]) return;
      loadingScreens[gameId] = true;
      const script = document.createElement('script');
      script.src = `/games/${encodeURIComponent(gameId)}.js`;
      script.onload = done;
      script.onerror = failed;
      document.head.appendChild(script);
    },

    // Which sounds what changed between two states of the same game makes: the game's own (its
    // screens' `sounds`) and the fanfare when it ends. PB.loudest picks the one to play.
    soundsFor(prev, s) {
      const sounds = new Set(PB.screens[s.gameType]?.sounds?.(prev, s) || []);
      if (s.phase === 'over' && prev.phase !== 'over') sounds.add('win');
      return sounds;
    },
    // One at a time, the most important first.
    loudest(sounds) {
      return ['win', 'go', 'bell', 'beep', 'dice', 'dart', 'card', 'turn'].find((x) => sounds.has(x)) || null;
    },

    // The heading of a "drink!" alert: the game's own, or how many sips.
    drinkTitle({ sips, title }) {
      return title || `DRINK ${sips} SIP${sips === 1 ? '' : 'S'}`;
    },

    // A game's rules (lib/options.js), each as a row of buttons with data-option and data-value
    // (JSON) on them; `values` is what's picked. `readOnly` shows only the picked one (a guest in
    // the lobby).
    optionsHtml(options, values, { readOnly = false } = {}) {
      const esc = PB.esc;
      return options.filter((o) => PB.optionShown(o, values)).map((o) => `
        <div class="option">
          <span class="muted">${esc(o.label)}</span>
          ${readOnly
            ? `<strong>${esc(o.choices.find((c) => c.value === values[o.id])?.label)}</strong>`
            : `<div class="segmented">${o.choices.map((c) => `
                <button class="${c.value === values[o.id] ? 'selected' : ''}" data-option="${esc(o.id)}" data-value='${esc(JSON.stringify(c.value))}'>${esc(c.label)}</button>`).join('')}</div>`}
        </div>`).join('');
    },

    // A game's rules, folded away under "How to play".
    howToPlay(rules = [], title = 'How to play') {
      if (!rules.length) return '';
      return `<details class="how-to"><summary>📖 ${PB.esc(title)}</summary><ul>${rules.map((r) => `<li>${PB.esc(r)}</li>`).join('')}</ul></details>`;
    },

    // The room styles to pick from (the seasonal ones under their own heading). `attrs(id)` is
    // what a style's button does when tapped (its data-* attributes).
    // ('random' picks a new venue every game; `selected` is 'random' then.)
    roomStylePicker(selected, attrs) {
      const { STYLES } = ROOM_STYLES;
      const random = `<button class="${selected === 'random' ? 'selected' : ''}" ${attrs('random')}><span>🔀</span>Random</button>`;
      return [false, true].map((seasonal) => `${seasonal ? '<small class="muted">Seasonal</small>' : ''}<div class="room-styles">${seasonal ? '' : random}${Object.entries(STYLES).filter(([, st]) => !st.mood && !!st.seasonal === seasonal).map(([id, st]) => `
        <button class="${id === selected ? 'selected' : ''}" ${attrs(id)}><span>${PB.esc(st.emoji)}</span>${PB.esc(st.label)}</button>`).join('')}</div>`).join('');
    },

    // Taps on anything in `root` with data-act send a game action (its other data-* attributes are
    // the action's data); data-cmd goes to `command(cmd, data)`, the page's own. Either asks
    // data-confirm's question first, if it has one.
    onTaps(root, command) {
      root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act], [data-cmd]');
        if (!el || el.disabled) return;
        if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
        const { act, cmd, confirm: _, ...data } = el.dataset;
        if (act) PB.act(act, data);
        else command(cmd, data);
      });
    },

    // Something thrown, flying across the screen from one point to another (from your finger on
    // the throwing pad to where it lands): up in an arc, getting smaller as it goes away. `html`
    // is what flies; `from` and `to` are page points ({ x, y }).
    fly(html, from, to, { ms = 800, lift = 0.35, scale = [1.5, 0.6], shadow = false } = {}) {
      const el = document.createElement('div');
      el.className = 'pb-fly';
      el.innerHTML = html;
      el.style.left = `${from.x}px`;
      el.style.top = `${from.y}px`;
      document.body.appendChild(el);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      // (Never so high it goes under the top of the screen, or a phone's address bar.)
      const peak = Math.max(0, Math.min(Math.abs(dy) * lift + 30, from.y + dy / 2 - 110));
      // A real arc: up and over, a touch slower as it comes down, shrinking into the distance.
      const frames = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24;
        const k = t * (1.2 - 0.2 * t);
        const up = 4 * peak * k * (1 - k);
        const sc = scale[0] + (scale[1] - scale[0]) * k;
        return { transform: `translate(-50%, -50%) translate(${(dx * k).toFixed(1)}px, ${(dy * k - up).toFixed(1)}px) scale(${sc.toFixed(2)})` };
      });
      const anim = el.animate(frames, { duration: ms, easing: 'linear', fill: 'forwards' });
      anim.onfinish = () => el.remove();
      // Its shadow runs along the ground under it, so you can tell how high it is.
      if (shadow) {
        const sh = document.createElement('div');
        sh.className = 'pb-fly pb-shadow';
        sh.style.left = `${from.x}px`;
        sh.style.top = `${from.y}px`;
        document.body.appendChild(sh);
        sh.animate(frames.map((_, i) => {
          const k = (i / 24) * (1.2 - 0.2 * (i / 24));
          const sc = scale[0] + (scale[1] - scale[0]) * k;
          return { transform: `translate(-50%, -50%) translate(${(dx * k).toFixed(1)}px, ${(dy * k + 14 * sc).toFixed(1)}px) scale(${sc.toFixed(2)})`, opacity: 0.15 + 0.3 * k };
        }), { duration: ms, easing: 'linear', fill: 'forwards' }).onfinish = () => sh.remove();
      }
      return anim;
    },
    // A very light buzz (on phones that can: not iPhones), for throwing: a tick as it leaves your
    // hand, a little pattern when it goes in.
    buzz(kind = 'throw') {
      try { navigator.vibrate?.(kind === 'hit' ? [18, 50, 28] : 12); } catch {}
    },
    // A throwing pad (Darts, Beer Pong, Quarters): drag on `el` to aim, then flick up to throw.
    // The flick is the last ~90ms of the finger's movement: how far it leaned off straight up is
    // the throw's angle (degrees, + = right), and how fast it went against a perfect flick (1) its
    // speed. Options:
    //   aim         the game's aim ({ x, y } or just { x }), changed in place as you drag
    //   drag(from, dx, dy, width)  the aim for a finger moved (dx, dy) from where it went down,
    //               when the aim was `from`, on a pad `width` wide
    //   held        what's in your hand (the dart, the ball), following your finger a little
    //   onAim()     after each move: show the new aim
    //   send()      tells the others where you're aiming (no more than every 90ms); null for not at all
    //   onThrow({ angle, speed, vx, note })  the throw, with the aim put back where it was before
    //               the flick moved it; `note` says how it went ("Too soft (80%), leaning 4° left")
    //   perfect     how far off 1 the speed can be and still count as perfect (the game's own
    //               slack, sent in its view, so the note agrees with where it lands)
    //   perfectText what a perfect one is called ('Perfect power')
    flickPad(el, { aim, drag, held = null, onAim = () => {}, send = null, onThrow, perfect, perfectText = 'Perfect power' }) {
      if (!el) return;
      let hist = [];
      let start = null;
      let lastSent = 0;
      const sendAim = (force) => {
        const now = Date.now();
        if (!send || (!force && now - lastSent < 90)) return;
        lastSent = now;
        send();
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        start = { x: e.clientX, y: e.clientY, aim: { ...aim } };
        hist = [{ t: e.timeStamp, x: e.clientX, y: e.clientY, aim: { ...aim } }];
      });
      el.addEventListener('pointermove', (e) => {
        if (!start) return;
        Object.assign(aim, drag(start.aim, e.clientX - start.x, e.clientY - start.y, el.clientWidth));
        hist.push({ t: e.timeStamp, x: e.clientX, y: e.clientY, aim: { ...aim } });
        if (hist.length > 40) hist.shift();
        if (held) held.style.transform = `translate(${e.clientX - start.x}px, ${Math.min(0, e.clientY - start.y) * 0.3}px)`;
        onAim();
        sendAim(false);
      });
      const release = (e) => {
        if (!start) return;
        start = null;
        const end = hist[hist.length - 1];
        const from = hist.find((h) => h.t >= e.timeStamp - 90) || hist[0];
        const dt = Math.max(1, end.t - from.t);
        const vx = (end.x - from.x) / dt;
        const vy = (end.y - from.y) / dt;
        if (vy < -0.5 && from.y - end.y > 30) {
          // Aim where it was before the flick started moving it.
          let i = hist.length - 1;
          while (i > 0 && hist[i].y < hist[i - 1].y - 2) i--;
          Object.assign(aim, hist[i].aim);
          const angle = (Math.atan2(vx, -vy) * 180) / Math.PI;
          const speed = (-vy * 1000) / window.innerHeight / PB.IDEAL_SPEED;
          const lean = Math.abs(angle) > 3 ? `, leaning ${Math.round(Math.abs(angle))}° ${angle > 0 ? 'right' : 'left'}` : ', dead straight';
          const how = Math.abs(speed - 1) < perfect ? perfectText : `${speed < 1 ? 'Too soft' : 'Too hard'} (${Math.round(speed * 100)}%)`;
          PB.buzz();
          onThrow({ angle, speed, vx, note: `${how}${lean}` });
        } else {
          if (held) held.style.transform = '';
          sendAim(true);
        }
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    },
    // A perfect flick crosses this many screen heights per second.
    IDEAL_SPEED: 2.5,

    // The middle of an element on the page.
    centre(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    // The ways out of a game. The host can end it (in a Tournament: skip it, or end the whole
    // tournament), and everyone can leave the room. Pass and play only has "End game"; the TV has none.
    endButton(className = 'link') {
      const s = PB.state;
      const host = !s.isHost ? ''
        : s.trip ? `<button class="${className}" data-cmd="endGame" data-confirm="Skip the rest of this game and go to the next one?">Skip this game</button>
          <button class="${className}" data-cmd="endTrip" data-confirm="End the tournament for everyone?">End tournament</button>`
        : `<button class="${className}" data-cmd="endGame" data-confirm="End the game for everyone?">End game</button>`;
      const all = `${host}${PB.leaveButton(className)}`;
      // In a tight header (Slevens) they fold into one small "Exit" menu.
      if (className !== 'end-mini' || !all.trim()) return all;
      return `<details class="exit-menu"><summary class="end-mini">Exit</summary><div class="exit-pop">${all.replaceAll('class="end-mini"', 'class="secondary"')}</div></details>`;
    },

    // A little 📺 when a TV is showing the room (online only, and not on the TV itself).
    tvBadge() {
      return PB.state?.tv && !PB.isTV && !PB.passAndPlay ? '<span class="tv-badge" title="A TV is showing this room">📺 TV</span>' : '';
    },

    // Leave the room (you can come back with the code). Not in pass and play or on the TV.
    leaveButton(className = 'link') {
      if (PB.passAndPlay || PB.isTV || !PB.state?.code) return '';
      return `<button class="${className}" data-cmd="leaveRoom" data-confirm="Leave the room? You can come back with the code ${PB.esc(PB.state.code)}.">Leave</button>`;
    },

    // Redraws the current screen, for local-only changes like selecting a card.
    rerender() {
      PB.redraw();
    },

    // Current time on the server's clock, for lining up countdowns across phones.
    now() {
      return Date.now() + PB.clockOffset;
    },

    // ---------- Custom game content ----------
    // The host's own questions, rules and lists for a game, kept on this phone and sent when the
    // game starts. Fields come from the game's `custom` list (see lib/custom.js).

    customFor(gameId) {
      try { return JSON.parse(localStorage.getItem(`custom-${gameId}`)) || {}; } catch { return {}; }
    },

    hasCustom(gameId) {
      return Object.keys(PB.customFor(gameId)).length > 0;
    },

    // Opens the editor; onClose runs after Save or Cancel.
    editCustom(gameId, gameName, fields, onClose = () => {}) {
      const saved = PB.customFor(gameId);
      const esc = PB.esc;
      const field = (f) => {
        if (f.kind === 'list') {
          const lines = saved[f.id] || f.defaults || [];
          return `<section class="cx-field">
            <h3>${esc(f.label)}</h3>${f.hint ? `<p class="cx-hint">${esc(f.hint)}</p>` : ''}
            <textarea data-cx="${esc(f.id)}" rows="${f.defaults ? 8 : 6}" placeholder="${f.defaults ? '' : 'One per line'}">${esc(lines.join('\n'))}</textarea>
            ${f.defaults ? `<button class="cx-reset" data-cx-reset="${esc(f.id)}">Reset to the usual list</button>` : ''}
          </section>`;
        }
        if (f.kind === 'cards') {
          const mine = saved[f.id] || {};
          return `<section class="cx-field">
            <h3>${esc(f.label)}</h3>${f.hint ? `<p class="cx-hint">${esc(f.hint)}</p>` : ''}
            ${f.items.map((it) => `
              <div class="cx-card" data-cx-card="${esc(f.id)}" data-key="${esc(it.key)}">
                <b class="cx-rank">${esc(it.label)}</b>
                <div class="cx-card-body">
                  <input data-part="title" maxlength="24" placeholder="${esc(it.title)}" value="${esc(mine[it.key]?.title || '')}">
                  <textarea data-part="text" rows="2" maxlength="160" placeholder="${esc(it.text)}">${esc(mine[it.key]?.text || '')}</textarea>
                </div>
              </div>`).join('')}
          </section>`;
        }
        return '';
      };

      const overlay = document.createElement('div');
      overlay.className = 'prefs-overlay';
      overlay.innerHTML = `
        <div class="prefs-panel cx-panel" role="dialog" aria-modal="true" aria-label="Customize ${esc(gameName)}">
          <header><h2>✏️ ${esc(gameName)}</h2><button class="prefs-close" data-cx-cancel aria-label="Close">✕</button></header>
          <p class="cx-hint">Saved on this phone, and used whenever you start ${esc(gameName)}.</p>
          ${fields.map(field).join('')}
          <div class="cx-actions">
            <button class="cx-clear" data-cx-clear>Use the usual game</button>
            <button class="cx-save" data-cx-save>Save</button>
          </div>
        </div>`;
      const close = () => { overlay.remove(); onClose(); };

      // Reads the form. Lists left exactly as the usual one, and blank cards, aren't saved.
      const read = () => {
        const out = {};
        for (const f of fields) {
          if (f.kind === 'list') {
            const lines = overlay.querySelector(`[data-cx="${f.id}"]`).value.split('\n').map((x) => x.trim()).filter(Boolean);
            if (lines.length && (!f.defaults || lines.join('\n') !== f.defaults.join('\n'))) out[f.id] = lines;
          } else if (f.kind === 'cards') {
            const cards = {};
            overlay.querySelectorAll(`[data-cx-card="${f.id}"]`).forEach((el) => {
              const title = el.querySelector('[data-part="title"]').value.trim();
              const text = el.querySelector('[data-part="text"]').value.trim();
              if (title || text) cards[el.dataset.key] = { ...(title && { title }), ...(text && { text }) };
            });
            if (Object.keys(cards).length) out[f.id] = cards;
          }
        }
        return out;
      };
      const store = (value) => {
        try {
          if (Object.keys(value).length) localStorage.setItem(`custom-${gameId}`, JSON.stringify(value));
          else localStorage.removeItem(`custom-${gameId}`);
        } catch {}
      };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-cx-cancel]')) return close();
        if (e.target.closest('[data-cx-save]')) { store(read()); return close(); }
        if (e.target.closest('[data-cx-clear]')) {
          if (!confirm(`Forget all your ${gameName} edits?`)) return;
          store({});
          return close();
        }
        const reset = e.target.closest('[data-cx-reset]');
        if (reset) {
          const f = fields.find((x) => x.id === reset.dataset.cxReset);
          overlay.querySelector(`[data-cx="${f.id}"]`).value = f.defaults.join('\n');
        }
      });
      document.body.appendChild(overlay);
    },

    // ---------- Race betting (lib/betting.js) ----------

    // A winner's panel for handing out their sips, + and − per player. `key` resets it each race.
    handOut(s, key) {
      const g = s.game;
      const mine = g.payout[s.me];
      if (!mine || mine.done) {
        const waiting = Object.entries(g.payout).filter(([, p]) => !p.done).map(([id]) => PB.esc(PB.name(id)));
        return waiting.length ? `<p class="center muted">Waiting for ${waiting.join(', ')} to hand out sips…</p>` : '';
      }
      if (PB.handOut.key !== key) { PB.handOut.alloc = {}; PB.handOut.key = key; }
      const alloc = PB.handOut.alloc;
      const left = mine.total - Object.values(alloc).reduce((a, b) => a + b, 0);
      return `
        <div class="card ar-give">
          <h2>Hand out ${PB.plural(mine.total, 'sip')}</h2>
          <p class="muted">${left ? `${PB.plural(left, 'sip')} left to give` : 'All given out. Send them!'}</p>
          ${s.players.filter((p) => p.id !== s.me).map((p) => `
            <div class="ar-give-row">${PB.avatar(p.id)}<span>${PB.esc(p.name)}</span>
              <button class="secondary" data-handout="${PB.esc(p.id)}" data-step="-1" ${alloc[p.id] ? '' : 'disabled'}>−</button>
              <b>${alloc[p.id] || 0}</b>
              <button class="secondary" data-handout="${PB.esc(p.id)}" data-step="1" ${left ? '' : 'disabled'}>+</button>
            </div>`).join('')}
          <button data-act="give" data-alloc='${PB.esc(JSON.stringify(alloc))}' ${left ? 'disabled' : ''}>🍺 Send the sips</button>
        </div>`;
    },

    // Who drank what in the race just finished.
    raceDrinks(s) {
      const rows = Object.entries(s.game.drank).sort((a, b) => b[1] - a[1]);
      if (!rows.length) return '';
      return `<div class="card ar-bets"><h2>This race</h2>${rows.map(([id, n]) =>
        `<div class="ar-bet-row">${PB.avatar(id, 'sm')}<span>${PB.esc(PB.name(id))}</span><b>${PB.plural(n, 'sip')}</b></div>`).join('')}</div>`;
    },

    // ---------- Sideways ----------
    // Turned sideways, screens split in two: the stage (the track, the table, the cards) on the
    // left, pinned while you scroll, and everything else on the right. Each screen says what its
    // stage is with a CSS selector for its top-level pieces.

    landscape() {
      return window.matchMedia('(orientation: landscape) and (min-width: 560px)').matches;
    },

    // Rearranges `root`'s children into stage and panel columns when sideways.
    layout(root, stage) {
      root.classList.remove('ls');
      if (!stage || !PB.landscape()) return;
      const kids = [...root.children];
      const left = kids.filter((el) => el.matches(stage));
      if (!left.length || left.length === kids.length) return;
      const col = (cls, els) => {
        const div = document.createElement('div');
        div.className = cls;
        div.append(...els);
        return div;
      };
      root.append(col('ls-stage', left), col('ls-panel', kids.filter((el) => !left.includes(el))));
      root.classList.add('ls');
    },

    // Recent things that happened (drinks handed out etc.).
    feed(limit = 4) {
      const items = PB.state.feed.slice(-limit).reverse();
      if (!items.length) return '';
      return `<ul class="feed">${items.map((f) => `<li>${PB.esc(f.text)}</li>`).join('')}</ul>`;
    },

    // The tab can be folded away (remembered on this phone); the 🍺 Tab button always shows it.
    tabHidden() {
      try { return localStorage.getItem('tab-hidden') === '1'; } catch { return false; }
    },

    // A tab card's heading with its Hide / Show button. Returns { head, hidden }.
    tabHead(title) {
      const hidden = PB.tabHidden();
      return {
        hidden,
        head: `<div class="tab-head"><h2>${title}</h2><button class="secondary" data-tab-toggle>${hidden ? '👁 Show' : '🙈 Hide'}</button></div>`,
      };
    },

    // The whole night's tab in this room: every sip and finished drink, across all games.
    // { toggle: false } for the pop-up, which always shows it.
    tab({ toggle = true } = {}) {
      const { head, hidden } = toggle ? PB.tabHead("🍺 Tonight's tab") : { head: '', hidden: false };
      if (hidden) return `<div class="card tab">${head}</div>`;
      const rows = PB.state.players.slice().sort((a, b) => (b.total || 0) - (a.total || 0) || (b.finished || 0) - (a.finished || 0));
      return `<div class="card tab">${head}<ul class="players">${rows.map((p) => `
        <li class="${p.connected ? '' : 'offline'}">${PB.avatar(p.id)}<span class="name">${PB.esc(p.name)}${p.id === PB.state.me && !PB.passAndPlay ? ' (you)' : ''}</span>
          <span class="tab-n">${PB.plural(p.total || 0, 'sip')}${p.finished ? `<small>🥃 finished ×${p.finished}</small>` : ''}</span></li>`).join('')}</ul></div>`;
    },

    // Opens the tab over whatever is on screen.
    showTab() {
      const overlay = document.createElement('div');
      overlay.className = 'prefs-overlay';
      overlay.innerHTML = `<div class="prefs-panel" role="dialog" aria-modal="true" aria-label="Tonight's tab">
        <header><h2>🍺 Tonight's tab</h2><button class="prefs-close" aria-label="Close">✕</button></header>
        ${PB.tab({ toggle: false })}</div>`;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.prefs-close')) overlay.remove();
      });
      document.body.appendChild(overlay);
    },

    tabButton() {
      return '<button class="prefs-btn" data-tab>🍺 Tab</button>';
    },

    scoreboard() {
      const rows = PB.state.players.slice().sort((a, b) => b.drinks - a.drinks);
      return `<div class="card"><h2>Total sips</h2><ul class="players">${rows.map((p) => `
        <li class="${p.connected ? '' : 'offline'}">${PB.avatar(p.id)}<span class="name">${PB.esc(p.name)}${p.id === PB.state.me && !PB.passAndPlay ? ' (you)' : ''}</span><span class="count">${p.drinks}</span></li>`).join('')}</ul></div>`;
    },
  };
  // Turning the phone redraws the screen for the new shape.
  window.matchMedia('(orientation: landscape) and (min-width: 560px)').addEventListener?.('change', () => PB.redraw());
  setInterval(() => PB.tickTimer(), 250);

  // Any 🍺 Tab button opens the tab; Hide / Show folds it away; + / − hand out race winnings.
  document.addEventListener('click', (e) => {
    const h = e.target.closest('[data-handout]');
    if (h && !h.disabled) {
      const alloc = PB.handOut.alloc || {};
      const id = h.dataset.handout;
      alloc[id] = Math.max(0, (alloc[id] || 0) + Number(h.dataset.step));
      if (!alloc[id]) delete alloc[id];
      PB.rerender();
    }
    if (e.target.closest('[data-tab]') && PB.state) PB.showTab();
    if (e.target.closest('[data-tab-toggle]')) {
      try { localStorage.setItem('tab-hidden', PB.tabHidden() ? '0' : '1'); } catch {}
      PB.rerender();
    }
  });
  window.PB = PB;
})();
