// Room styles: the host dresses the room up as a dive bar, a tavern, a club… and every phone in
// the room (and the TV) takes on its colours, background, heading font and table.
//
// Shared by the server (which styles are allowed) and the browser, where it sets window.ROOM_STYLES
// and ROOM_STYLES.apply(id) restyles the page (null or 'classic' for the normal look).

(function (root) {
  // vars: the app's colour variables (see style.css). bg: the page background. font: a Google Font
  // for headings. felt / rim: the TV's table top and its edge.
  const STYLES = {
    classic: { label: 'Classic', emoji: '🎲', welcome: '' },
    dive: {
      label: 'Dive bar',
      emoji: '🍺',
      welcome: 'Welcome to the dive bar. Cash only, bathroom’s out back.',
      font: 'Special Elite',
      vars: { bg: '#1a1612', card: '#2a231c', 'card-2': '#3a3026', text: '#f3e9dc', muted: '#b3a28c', accent: '#ff5a36', 'accent-text': '#1a0600', danger: '#ff3355', ok: '#7bd88f' },
      bg: `radial-gradient(ellipse at 50% -10%, rgba(255, 90, 54, 0.28), transparent 55%),
        repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.35) 0 2px, transparent 2px 30px),
        repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 64px), #1a1612`,
      felt: 'radial-gradient(ellipse at 40% 40%, #3b7048 0%, #2c5937 60%, #20442a 100%)',
      rim: '#3b2414',
    },
    tavern: {
      label: 'Tavern',
      emoji: '🍻',
      welcome: 'Pull up a stool by the fire, traveller.',
      font: 'IM Fell English SC',
      vars: { bg: '#2b1d12', card: '#3d2a1a', 'card-2': '#4e3622', text: '#f7ead2', muted: '#c9ad85', accent: '#e8a83c', 'accent-text': '#2a1700', danger: '#d9483b', ok: '#9ccc65' },
      bg: `radial-gradient(ellipse at 50% 110%, rgba(255, 150, 50, 0.25), transparent 60%),
        repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.3) 0 3px, transparent 3px 96px),
        repeating-linear-gradient(90deg, rgba(255, 220, 160, 0.03) 0 1px, transparent 1px 7px), #2b1d12`,
      felt: 'repeating-linear-gradient(95deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 22px), radial-gradient(ellipse at center, #8a5a30 0%, #6e4522 70%, #573417 100%)',
      rim: '#3f240f',
    },
    club: {
      label: 'Club',
      emoji: '🪩',
      welcome: 'Bottle service is a state of mind.',
      font: 'Bungee',
      vars: { bg: '#07060d', card: '#141022', 'card-2': '#201a36', text: '#f5f0ff', muted: '#9d93c4', accent: '#ff2bd6', 'accent-text': '#22001c', danger: '#ff3d6e', ok: '#29f0ff' },
      bg: `radial-gradient(circle at 15% 0%, rgba(255, 43, 214, 0.3), transparent 40%),
        radial-gradient(circle at 85% 10%, rgba(41, 240, 255, 0.25), transparent 40%),
        radial-gradient(circle at 50% 100%, rgba(120, 60, 255, 0.25), transparent 50%), #07060d`,
      felt: 'radial-gradient(ellipse at 35% 30%, #2a2340 0%, #120f1e 60%, #08070e 100%)',
      rim: '#ff2bd6',
    },
    castle: {
      label: 'Castle',
      emoji: '🏰',
      welcome: 'The court is assembled. Long live the drinking king.',
      font: 'Cinzel',
      vars: { bg: '#1c1b22', card: '#2a2833', 'card-2': '#383544', text: '#efe9dc', muted: '#a9a3b5', accent: '#d4af37', 'accent-text': '#1d1600', danger: '#c8303f', ok: '#6fbf73' },
      bg: `radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55, 0.15), transparent 55%),
        repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.4) 0 3px, transparent 3px 44px),
        repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.3) 0 3px, transparent 3px 88px), #1c1b22`,
      felt: 'radial-gradient(ellipse at center, #4a2670 0%, #3a1c5a 65%, #2a1242 100%)',
      rim: '#6b6875',
    },
    jazz: {
      label: 'Jazz club',
      emoji: '🎷',
      welcome: 'Low lights, smooth horns, strong drinks.',
      font: 'Limelight',
      vars: { bg: '#1a0d12', card: '#2a141c', 'card-2': '#3a1c27', text: '#f6e7d8', muted: '#c39ea0', accent: '#e3b04b', 'accent-text': '#241500', danger: '#ff5d73', ok: '#8fd19e' },
      bg: `radial-gradient(ellipse at 50% -20%, rgba(227, 176, 75, 0.25), transparent 55%),
        repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.22) 0 16px, transparent 16px 32px), #1a0d12`,
      felt: 'radial-gradient(ellipse at center, #6e1a2a 0%, #561320 70%, #3f0d17 100%)',
      rim: '#a8803a',
    },
    diner: {
      label: 'Diner',
      emoji: '🍔',
      welcome: 'Bottomless coffee. Bottomless everything else too.',
      font: 'Pacifico',
      light: true,
      vars: { bg: '#f6efe2', card: '#ffffff', 'card-2': '#f1e4cf', text: '#2b1d1d', muted: '#7b6563', accent: '#e63946', 'accent-text': '#ffffff', 'accent-ink': '#c1121f', danger: '#d62839', ok: '#2a9d8f' },
      bg: `linear-gradient(rgba(246, 239, 226, 0.94), rgba(246, 239, 226, 0.94)),
        conic-gradient(#2b1d1d 25%, #f6efe2 0 50%, #2b1d1d 0 75%, #f6efe2 0) 0 0 / 48px 48px`,
      felt: 'radial-gradient(ellipse at 40% 35%, #6fd0c6 0%, #3fa79c 70%, #2e8a80 100%)',
      rim: '#cfd6dc',
    },
  };

  const IDS = Object.keys(STYLES);

  // ---------- In the browser ----------

  function css() {
    return Object.entries(STYLES).filter(([, s]) => s.vars).map(([id, s]) => {
      const at = `html[data-room="${id}"][data-room]`;
      const font = `"${s.font}", system-ui, sans-serif`;
      return `${at}{${Object.entries(s.vars).map(([k, v]) => `--${k}:${v};`).join('')}--felt:${s.felt};--rim:${s.rim};color-scheme:${s.light ? 'light' : 'dark'};}
${at} body{background:${s.bg};background-attachment:fixed;}
${at} h1, ${at} .room-code, ${at} .tv-title, ${at} .tv-game-name, ${at} .drink .big, ${at} .room-welcome b{font-family:${font};font-weight:400;letter-spacing:0;}`;
    }).join('\n');
  }

  let current = null;
  function apply(id) {
    if (typeof document === 'undefined') return;
    const style = STYLES[id] && id !== 'classic' ? id : null;
    if (style === current) return;
    current = style;
    const html = document.documentElement;
    if (!document.getElementById('room-styles')) {
      const el = document.createElement('style');
      el.id = 'room-styles';
      el.textContent = css();
      document.head.appendChild(el);
    }
    // The phone's status bar matches the room (and goes back to the phone's own theme after).
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && !style && html.dataset.metaBefore) meta.setAttribute('content', html.dataset.metaBefore);
    if (!style) {
      delete html.dataset.room;
      return;
    }
    if (meta && !html.dataset.room) html.dataset.metaBefore = meta.getAttribute('content');
    meta?.setAttribute('content', STYLES[style].vars.bg);
    html.dataset.room = style;
    // The heading font, fetched the first time a room uses it.
    const fontId = `room-font-${style}`;
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(STYLES[style].font)}&display=swap`;
      document.head.appendChild(link);
    }
  }

  const ROOM_STYLES = { STYLES, IDS, apply, css };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROOM_STYLES;
  else root.ROOM_STYLES = ROOM_STYLES;
})(this);
