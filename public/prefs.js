// Per-phone settings: sound effects, colour theme, dice and card-back styles. Loaded by every
// page (the app, pass and play, and the stand-alone Slevens and Mad Max pages), so it brings its
// own styles and needs nothing else.
//
//   Prefs.play('dice')      play a sound: dice, card, turn, drink, win
//   Prefs.button()          HTML for a ⚙️ button; tapping any [data-prefs] opens the panel
//   Prefs.feedbackButton()  HTML for a 💬 button; tapping any [data-feedback] opens the form
//
// Settings are remembered on this phone only.
(() => {
  const KEY = 'boolers-prefs';

  const THEMES = {
    night: { label: 'Night', meta: '#14111f', vars: {} },
    neon: {
      label: 'Neon',
      meta: '#08080f',
      vars: { bg: '#08080f', card: '#14142a', 'card-2': '#1f1f3d', text: '#f0f6ff', muted: '#8f9cc8', accent: '#39ff88', 'accent-text': '#002411', danger: '#ff2e88', ok: '#00e5ff' },
    },
    sunset: {
      label: 'Sunset',
      meta: '#2a1215',
      vars: { bg: '#2a1215', card: '#3d1c21', 'card-2': '#55282e', text: '#fff3ec', muted: '#d9a89b', accent: '#ff9142', 'accent-text': '#2a1000', danger: '#ff4d6d', ok: '#8be08e' },
    },
    light: {
      label: 'Light',
      meta: '#f6f4fb',
      vars: { bg: '#f6f4fb', card: '#ffffff', 'card-2': '#e9e5f4', text: '#1d1830', muted: '#6b6488', accent: '#ffbf1f', 'accent-text': '#1a1400', 'accent-ink': '#a36a00', danger: '#e0244a', ok: '#0f9f66' },
    },
  };
  const DICE = {
    classic: { label: 'Classic', die: '#ffffff', pip: '#111111' },
    ruby: { label: 'Ruby', die: '#d61f3c', pip: '#ffffff' },
    jade: { label: 'Jade', die: '#12a37d', pip: '#ffffff' },
    onyx: { label: 'Onyx', die: '#24212e', pip: '#ffcc33' },
  };
  const BACKS = {
    purple: { label: 'Purple', a: '#5b3fd1', b: '#4a31b5' },
    red: { label: 'Red', a: '#c62839', b: '#a61e2d' },
    blue: { label: 'Blue', a: '#2563eb', b: '#1c4fc2' },
    black: { label: 'Black', a: '#2c2a33', b: '#1b1a20' },
  };
  const DEFAULTS = { sound: true, volume: 0.7, theme: 'night', dice: 'classic', back: 'purple' };

  let prefs = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (typeof saved?.sound === 'boolean') prefs.sound = saved.sound;
    if (typeof saved?.volume === 'number') prefs.volume = Math.min(1, Math.max(0, saved.volume));
    if (saved?.theme in THEMES) prefs.theme = saved.theme;
    if (saved?.dice in DICE) prefs.dice = saved.dice;
    if (saved?.back in BACKS) prefs.back = saved.back;
  } catch {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  }

  // ---------- Looks ----------

  // Theme colours override each page's own :root variables (html[...] beats :root).
  const looks = Object.entries(THEMES).map(([id, t]) =>
    `html[data-theme="${id}"]{${Object.entries(t.vars).map(([k, v]) => `--${k}:${v};`).join('')}${id === 'light' ? 'color-scheme:light;' : ''}}`).join('\n')
    + Object.entries(DICE).map(([id, d]) => `html[data-dice="${id}"]{--die:${d.die};--pip:${d.pip};}`).join('\n')
    + Object.entries(BACKS).map(([id, c]) => `html[data-back="${id}"]{--back-1:${c.a};--back-2:${c.b};}`).join('\n');

  const panelCss = `
    .prefs-btn { width: auto; padding: 8px 14px; font-size: 0.95rem; background: var(--card-2); color: var(--text); border: none; border-radius: 12px; font-weight: 600; cursor: pointer; }
    .prefs-btn.mini { padding: 6px 10px; flex: none; }
    .prefs-feedback { background: var(--card) !important; color: var(--text); padding: 12px; font-weight: 600; }
    .fb-panel textarea, .fb-panel input { width: 100%; box-sizing: border-box; font: inherit; font-size: 1rem; padding: 12px; border-radius: 12px; border: 2px solid var(--card-2); background: var(--card); color: var(--text); resize: vertical; }
    .fb-panel textarea:focus, .fb-panel input:focus { outline: none; border-color: var(--accent); }
    .fb-hint { margin: 0; color: var(--muted); }
    .fb-status { margin: 0; min-height: 1.2em; color: var(--muted); font-size: 0.9rem; }
    .fb-send { background: var(--accent) !important; color: var(--accent-text); padding: 14px; font-weight: 700; font-size: 1.05rem; }
    .fb-send:disabled { opacity: 0.6; }
    .prefs-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,0.55); display: flex; align-items: flex-end; justify-content: center; }
    .prefs-panel { width: 100%; max-width: 480px; max-height: 88dvh; overflow-y: auto; background: var(--bg); color: var(--text); border-radius: 20px 20px 0 0; padding: 18px 16px max(18px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .prefs-panel header { display: flex; align-items: center; justify-content: space-between; }
    .prefs-panel h2 { margin: 0; font-size: 1.3rem; color: var(--text); }
    .prefs-panel h3 { margin: 0 0 8px; font-size: 0.95rem; color: var(--muted); font-weight: 600; }
    .prefs-panel button { font: inherit; border: 2px solid transparent; cursor: pointer; border-radius: 12px; touch-action: manipulation; }
    .prefs-close { background: var(--card-2); color: var(--text); width: 40px; height: 40px; padding: 0; font-size: 1.1rem; }
    .prefs-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .prefs-row > button { flex: 1; min-width: 70px; padding: 10px 6px; background: var(--card); color: var(--text); font-size: 0.9rem; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .prefs-row > button.on { border-color: var(--accent); }
    .prefs-vol { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
    .prefs-vol[hidden] { display: none; }
    .prefs-vol input { flex: 1; accent-color: var(--accent); }
    .prefs-swatch { width: 36px; height: 36px; border-radius: 10px; border: 2px solid rgba(128,128,128,0.35); }
    .prefs-pips { width: 34px; height: 34px; border-radius: 8px; display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); padding: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .prefs-pips i { border-radius: 50%; margin: 1.5px; }
    .prefs-back { width: 30px; height: 42px; border-radius: 5px; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
  `;

  const style = document.createElement('style');
  style.textContent = `${looks}\n${panelCss}`;
  document.head.appendChild(style);

  function applyLooks() {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.dice = prefs.dice;
    root.dataset.back = prefs.back;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[prefs.theme].meta);
  }
  applyLooks();

  // ---------- Sounds ----------
  // Made on the fly with Web Audio, so there are no files to download.

  let audio = null;
  function ctx() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }
  // Phones only allow sound after a tap, so wake the audio up on the first one.
  const unlock = () => { if (prefs.sound) ctx(); };
  document.addEventListener('pointerdown', unlock, { capture: true });

  let noiseBuf = null;
  function noise(ac) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  // A note: oscillator through a quick attack / decay envelope.
  function tone(ac, out, { freq, type = 'sine', at = 0, len = 0.15, gain = 0.3, to = null }) {
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  // A burst of filtered noise: clicks, clacks and swishes.
  function burst(ac, out, { at = 0, len = 0.03, freq = 3000, q = 1, gain = 0.5, sweepTo = null }) {
    const t = ac.currentTime + at;
    const src = noise(ac);
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }

  const SOUNDS = {
    // Dice rattling in a cup, then landing.
    dice(ac, out) {
      let at = 0;
      for (let i = 0; i < 9; i++) {
        at += 0.025 + Math.random() * 0.045;
        burst(ac, out, { at, len: 0.035, freq: 1800 + Math.random() * 2400, q: 3, gain: 0.35 + Math.random() * 0.3 });
      }
      burst(ac, out, { at: at + 0.09, len: 0.06, freq: 1200, q: 2, gain: 0.6 });
      burst(ac, out, { at: at + 0.16, len: 0.05, freq: 1500, q: 2, gain: 0.45 });
    },
    // A card flicked over.
    card(ac, out) {
      burst(ac, out, { len: 0.14, freq: 900, sweepTo: 4200, q: 0.8, gain: 0.5 });
      burst(ac, out, { at: 0.11, len: 0.03, freq: 2500, q: 2, gain: 0.35 });
    },
    // Two-note chime: your turn.
    turn(ac, out) {
      tone(ac, out, { freq: 784, len: 0.22, gain: 0.22 });
      tone(ac, out, { freq: 1175, at: 0.12, len: 0.4, gain: 0.22 });
    },
    // Bzzt bzzt, in time with the vibration.
    drink(ac, out) {
      for (const at of [0, 0.3]) {
        tone(ac, out, { freq: 150, type: 'sawtooth', at, len: 0.2, gain: 0.18 });
        tone(ac, out, { freq: 151.5, type: 'square', at, len: 0.2, gain: 0.1 });
      }
    },
    // Rising arpeggio.
    win(ac, out) {
      [523, 659, 784, 1047].forEach((freq, i) => tone(ac, out, { freq, type: 'triangle', at: i * 0.11, len: i === 3 ? 0.6 : 0.18, gain: 0.3 }));
      tone(ac, out, { freq: 1319, type: 'triangle', at: 0.44, len: 0.6, gain: 0.15 });
    },
  };

  function play(name) {
    if (!prefs.sound || !SOUNDS[name]) return;
    const ac = ctx();
    if (!ac) return;
    try {
      const out = ac.createGain();
      out.gain.value = prefs.volume;
      out.connect(ac.destination);
      SOUNDS[name](ac, out);
    } catch {}
  }

  // ---------- Panel ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PIPS5 = [0, 2, 4, 6, 8];
  const pips = (d) => `<span class="prefs-pips" style="background:${d.die}">${Array.from({ length: 9 }, (_, i) =>
    `<i style="${PIPS5.includes(i) ? `background:${d.pip}` : ''}"></i>`).join('')}</span>`;
  const choice = (key, id, label, art) =>
    `<button class="${prefs[key] === id ? 'on' : ''}" data-pref="${key}" data-val="${id}">${art}${esc(label)}</button>`;

  let overlay = null;
  function panelHtml() {
    return `
      <div class="prefs-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <header><h2>⚙️ Settings</h2><button class="prefs-close" data-pref-close aria-label="Close">✕</button></header>
        <section>
          <h3>Sound effects</h3>
          <div class="prefs-row">
            ${choice('sound', 'on', '🔊 On', '')}
            ${choice('sound', 'off', '🔇 Off', '')}
          </div>
          <div class="prefs-vol" ${prefs.sound ? '' : 'hidden'}>
            <span aria-hidden="true">🔈</span>
            <input type="range" min="0" max="100" value="${Math.round(prefs.volume * 100)}" data-pref-vol aria-label="Volume">
            <span aria-hidden="true">🔊</span>
          </div>
        </section>
        <section>
          <h3>Theme</h3>
          <div class="prefs-row">${Object.entries(THEMES).map(([id, t]) => choice('theme', id, t.label,
            `<span class="prefs-swatch" style="background:linear-gradient(135deg, ${t.vars.bg || '#14111f'} 50%, ${t.vars.accent || '#ffcc33'} 50%)"></span>`)).join('')}</div>
        </section>
        <section>
          <h3>Dice</h3>
          <div class="prefs-row">${Object.entries(DICE).map(([id, d]) => choice('dice', id, d.label, pips(d))).join('')}</div>
        </section>
        <section>
          <h3>Card backs</h3>
          <div class="prefs-row">${Object.entries(BACKS).map(([id, c]) => choice('back', id, c.label,
            `<span class="prefs-back" style="background:repeating-linear-gradient(45deg, ${c.a} 0 5px, ${c.b} 5px 10px)"></span>`)).join('')}</div>
        </section>
        ${canSendFeedback() ? '<button class="prefs-feedback" data-feedback>💬 Send feedback</button>' : ''}
      </div>`;
  }

  function open() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'prefs-overlay';
      overlay.addEventListener('click', onPanelClick);
      overlay.addEventListener('input', (e) => {
        if (!e.target.matches('[data-pref-vol]')) return;
        prefs.volume = Number(e.target.value) / 100;
        save();
      });
      overlay.addEventListener('change', (e) => e.target.matches('[data-pref-vol]') && play('dice'));
    }
    overlay.innerHTML = panelHtml();
    if (!overlay.isConnected) document.body.appendChild(overlay);
  }

  function close() {
    overlay?.remove();
  }

  function onPanelClick(e) {
    if (e.target === overlay || e.target.closest('[data-pref-close]')) return close();
    const b = e.target.closest('[data-pref]');
    if (!b) return;
    const { pref: key, val } = b.dataset;
    if (key === 'sound') prefs.sound = val === 'on';
    else prefs[key] = val;
    save();
    applyLooks();
    open(); // redraw the panel with the new choice
    if (key === 'sound' && prefs.sound) play('turn');
    else if (key === 'dice') play('dice');
    else if (key === 'back') play('card');
  }

  // ---------- Feedback ----------
  // A short form whose message the server logs (see lib/analytics.js). Only on pages served by the
  // app: the stand-alone demos have no server to send to.

  const canSendFeedback = () => !!window.Analytics;

  // Which game the person is looking at, if any, so feedback says what it's about.
  function currentGame() {
    const fromState = window.PB?.state?.gameType || window.PB?.state?.selectedGame;
    if (fromState) return fromState;
    const q = new URLSearchParams(location.search).get('game');
    if (q) return q;
    if (location.pathname.includes('slevens')) return 'slevens';
    if (location.pathname.includes('madmax')) return 'madMax';
    return undefined;
  }

  function openFeedback() {
    close();
    const box = document.createElement('div');
    box.className = 'prefs-overlay';
    box.innerHTML = `
      <div class="prefs-panel fb-panel" role="dialog" aria-modal="true" aria-label="Send feedback">
        <header><h2>💬 Feedback</h2><button class="prefs-close" data-fb-close aria-label="Close">✕</button></header>
        <p class="fb-hint">Something broken, confusing, or a game you want? Tell us.</p>
        <textarea data-fb-message rows="5" maxlength="1000" placeholder="What's on your mind?"></textarea>
        <input data-fb-contact maxlength="100" autocomplete="email" placeholder="Email or name, if you'd like a reply (optional)">
        <p class="fb-status" data-fb-status role="status"></p>
        <button class="fb-send" data-fb-send>Send</button>
      </div>`;
    const status = box.querySelector('[data-fb-status]');
    box.addEventListener('input', () => { if (!sendBtn.disabled) status.textContent = ''; });
    const sendBtn = box.querySelector('[data-fb-send]');
    box.addEventListener('click', async (e) => {
      if (e.target === box || e.target.closest('[data-fb-close]')) return box.remove();
      if (!e.target.closest('[data-fb-send]')) return;
      const message = box.querySelector('[data-fb-message]').value.trim();
      if (!message) { status.textContent = 'Write something first'; return; }
      sendBtn.disabled = true;
      status.textContent = 'Sending…';
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, contact: box.querySelector('[data-fb-contact]').value.trim(), game: currentGame() }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Couldn\'t send it');
        box.querySelector('.fb-panel').innerHTML = `
          <header><h2>💬 Thanks!</h2><button class="prefs-close" data-fb-close aria-label="Close">✕</button></header>
          <p class="fb-hint">Got it. Thanks for helping make Bool Games better.</p>
          <button class="fb-send" data-fb-close>Done</button>`;
      } catch (err) {
        status.textContent = `${err.message || 'Couldn\'t send it'}. Check your connection and try again.`;
        sendBtn.disabled = false;
      }
    });
    document.body.appendChild(box);
    box.querySelector('[data-fb-message]').focus();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-feedback]')) {
      e.stopPropagation();
      openFeedback();
    }
  }, true);

  // Any [data-prefs] button on any page opens the panel.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-prefs]')) {
      e.stopPropagation();
      open();
    }
  }, true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());

  window.Prefs = {
    play,
    open,
    close,
    get: () => ({ ...prefs }),
    // A compact ⚙️ with { mini: true }, for tight headers.
    button: ({ mini = false } = {}) => `<button class="prefs-btn ${mini ? 'mini' : ''}" data-prefs aria-label="Settings">${mini ? '⚙️' : '⚙️ Settings'}</button>`,
    feedbackButton: () => (canSendFeedback() ? '<button class="prefs-btn" data-feedback>💬 Feedback</button>' : ''),
    openFeedback,
  };
})();
