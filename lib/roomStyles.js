// Room styles: the host dresses the room up as a dive bar, a tavern, a club… and every phone in
// the room (and the TV) takes on its colours, background, heading font and table.
//
// Shared by the server (which styles are allowed) and the browser, where it sets window.ROOM_STYLES
// and ROOM_STYLES.apply(id) restyles the page (null or 'classic' for the normal look).

(function (root) {
  // ---------- Background tiles ----------
  // Drawn as small SVGs that repeat across the page. A seeded random number keeps every phone's
  // wall the same.

  const tile = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;
  function seeded(seed) {
    let x = seed;
    return () => {
      x = (x * 16807) % 2147483647;
      return (x - 1) / 2147483646;
    };
  }
  const pick = (rand, list) => list[Math.floor(rand() * list.length)];

  // Running-bond brick: rows of bricks, every other row shifted by half a brick.
  function bricks() {
    const rand = seeded(7);
    const W = 64;
    const H = 30;
    let out = `<rect width='256' height='120' fill='#120d0a'/>`;
    for (let row = 0; row < 4; row++) {
      // Four bricks a row; on shifted rows the brick hanging off the right edge comes back on the left.
      const fills = [0, 1, 2, 3].map(() => pick(rand, ['#4a2219', '#552a1e', '#3f1d15', '#5c2f21', '#47251b', '#4f2a20']));
      for (let i = row % 2 ? -1 : 0; i < 4; i++) {
        const x = i * W + (row % 2 ? W / 2 : 0);
        const fill = fills[(i + 4) % 4];
        out += `<rect x='${x + 1.5}' y='${row * H + 1.5}' width='${W - 3}' height='${H - 3}' rx='2' fill='${fill}'/>`;
        out += `<rect x='${x + 3}' y='${row * H + 2.5}' width='${W - 8}' height='2' fill='#fff' opacity='0.05'/>`;
        if (rand() < 0.3) out += `<circle cx='${x + 8 + rand() * 44}' cy='${row * H + 8 + rand() * 14}' r='${1 + rand() * 2}' fill='#000' opacity='0.25'/>`;
      }
    }
    return tile(256, 120, out);
  }

  // Wooden planks running up the wall, with grain, knots and joins.
  function planks() {
    const rand = seeded(11);
    const W = 64;
    let out = '';
    for (let i = 0; i < 4; i++) {
      const x = i * W;
      out += `<rect x='${x}' width='${W}' height='512' fill='${pick(rand, ['#4a3019', '#523620', '#432b16', '#5a3b22'])}'/>`;
      for (let g = 0; g < 7; g++) {
        const gx = x + 5 + rand() * (W - 10);
        const bend = (rand() - 0.5) * 10;
        out += `<path d='M${gx} 0 C${gx + bend} 170 ${gx - bend} 340 ${gx} 512' stroke='#1a0f06' stroke-width='${0.6 + rand()}' fill='none' opacity='${0.25 + rand() * 0.3}'/>`;
      }
      if (rand() < 0.6) {
        const ky = 40 + rand() * 430;
        out += `<ellipse cx='${x + 14 + rand() * 36}' cy='${ky}' rx='4' ry='8' fill='#24150a' opacity='0.6'/>`;
      }
      const join = 60 + rand() * 390;
      out += `<rect x='${x}' y='${join}' width='${W}' height='2' fill='#120a04' opacity='0.8'/>`;
      out += `<rect x='${x}' width='2' height='512' fill='#120a04'/><rect x='${x + 2}' width='1' height='512' fill='#fff' opacity='0.06'/>`;
    }
    return tile(256, 512, out);
  }

  // Castle wall: uneven stone blocks.
  function stones() {
    const rand = seeded(5);
    let out = `<rect width='320' height='200' fill='#141319'/>`;
    for (let row = 0; row < 4; row++) {
      // Stones fill each row exactly, so the wall repeats without a seam.
      let x = 0;
      while (x < 320) {
        let w = 60 + Math.floor(rand() * 50);
        if (320 - x - w < 60) w = 320 - x;
        const fill = pick(rand, ['#34323d', '#2e2c36', '#3a3843', '#302d38', '#3d3a46']);
        out += `<rect x='${x + 2}' y='${row * 50 + 2}' width='${w - 4}' height='46' rx='5' fill='${fill}'/>`;
        out += `<rect x='${x + 4}' y='${row * 50 + 3}' width='${w - 8}' height='3' rx='1.5' fill='#fff' opacity='0.06'/>`;
        out += `<rect x='${x + 4}' y='${row * 50 + 43}' width='${w - 8}' height='3' rx='1.5' fill='#000' opacity='0.25'/>`;
        x += w;
      }
    }
    return tile(320, 200, out);
  }

  // Specks of light from a mirror ball.
  function discoDots() {
    const rand = seeded(3);
    let out = '';
    for (let i = 0; i < 14; i++) {
      out += `<circle cx='${rand() * 160}' cy='${rand() * 160}' r='${0.8 + rand() * 1.8}' fill='${pick(rand, ['#ff2bd6', '#29f0ff', '#ffffff', '#9b5cff'])}' opacity='${0.25 + rand() * 0.4}'/>`;
    }
    return tile(160, 160, out);
  }

  // A band of gold art deco fans along the bottom, fading out as it rises.
  function decoFans() {
    let out = '';
    for (let row = 0; row < 4; row++) {
      const y = 40 + row * 40;
      const shift = row % 2 ? 40 : 0;
      out += `<g fill='none' stroke='#e3b04b' stroke-width='1.2' opacity='${0.12 + row * 0.12}'>`;
      for (const x of [shift - 80, shift, shift + 80]) {
        for (const r of [40, 30, 20, 10]) out += `<path d='M${x + 40 - r} ${y} A${r} ${r} 0 0 1 ${x + 40 + r} ${y}'/>`;
      }
      out += '</g>';
    }
    return tile(80, 160, out);
  }

  // A hanging banner with a pointed end, gold trim and a crown.
  const banner = () => tile(60, 220, `<path d='M2 0H58V200L30 184L2 200Z' fill='#8c1423'/>
    <path d='M8 0V188M52 0V188' stroke='#d4af37' stroke-width='2' opacity='0.8'/>
    <path d='M18 70L22 84H38L42 70L35 77L30 66L25 77Z' fill='#d4af37'/>`);

  // Black and white floor tiles, seen at an angle.
  const checker = () => tile(64, 64, `<rect width='64' height='64' fill='#f4ede0'/><rect width='32' height='32' fill='#2b2424'/><rect x='32' y='32' width='32' height='32' fill='#2b2424'/>`);

  const vignette = 'radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(0, 0, 0, 0.6) 100%)';
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
      // A brick wall lit by a red neon beer sign and a blue one across the room.
      bg: () => `${vignette},
        radial-gradient(ellipse 60% 35% at 80% 6%, rgba(255, 70, 40, 0.45), transparent 70%),
        radial-gradient(ellipse 50% 30% at 10% 30%, rgba(60, 140, 255, 0.22), transparent 70%),
        linear-gradient(rgba(16, 12, 10, 0.55), rgba(16, 12, 10, 0.75)),
        ${bricks()} 0 0 / 256px 120px, #1a1612`,
      felt: 'radial-gradient(ellipse at 40% 40%, #3b7048 0%, #2c5937 60%, #20442a 100%)',
      rim: '#3b2414',
    },
    tavern: {
      label: 'Tavern',
      emoji: '🍻',
      welcome: 'Pull up a stool by the fire, traveller.',
      font: 'IM Fell English SC',
      vars: { bg: '#2b1d12', card: '#3d2a1a', 'card-2': '#4e3622', text: '#f7ead2', muted: '#c9ad85', accent: '#e8a83c', 'accent-text': '#2a1700', danger: '#d9483b', ok: '#9ccc65' },
      // Wood-panelled walls, lit by lanterns and the fire.
      bg: () => `${vignette},
        radial-gradient(circle at 12% 12%, rgba(255, 180, 80, 0.35), transparent 28%),
        radial-gradient(circle at 88% 12%, rgba(255, 180, 80, 0.3), transparent 28%),
        radial-gradient(ellipse 90% 40% at 50% 105%, rgba(255, 110, 30, 0.35), transparent 70%),
        linear-gradient(rgba(25, 15, 6, 0.5), rgba(25, 15, 6, 0.65)),
        ${planks()} 0 0 / 256px 512px, #2b1d12`,
      felt: 'repeating-linear-gradient(95deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 22px), radial-gradient(ellipse at center, #8a5a30 0%, #6e4522 70%, #573417 100%)',
      rim: '#3f240f',
    },
    club: {
      label: 'Club',
      emoji: '🪩',
      welcome: 'Bottle service is a state of mind.',
      font: 'Bungee',
      vars: { bg: '#07060d', card: '#141022', 'card-2': '#201a36', text: '#f5f0ff', muted: '#9d93c4', accent: '#ff2bd6', 'accent-text': '#22001c', danger: '#ff3d6e', ok: '#29f0ff' },
      // Light beams from the ceiling, mirror-ball sparkles and a glowing dance floor.
      bg: () => `${discoDots()} 0 0 / 160px 160px,
        conic-gradient(from 150deg at 20% -5%, transparent 0deg, rgba(255, 43, 214, 0.22) 6deg, transparent 12deg, transparent 24deg, rgba(255, 43, 214, 0.14) 28deg, transparent 33deg, transparent 360deg),
        conic-gradient(from 160deg at 80% -5%, transparent 0deg, rgba(41, 240, 255, 0.18) 5deg, transparent 10deg, transparent 22deg, rgba(41, 240, 255, 0.12) 26deg, transparent 31deg, transparent 360deg),
        radial-gradient(ellipse 80% 30% at 50% 105%, rgba(155, 92, 255, 0.4), transparent 70%),
        linear-gradient(transparent 70%, rgba(255, 43, 214, 0.08)),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 48px),
        #07060d`,
      felt: 'radial-gradient(ellipse at 35% 30%, #2a2340 0%, #120f1e 60%, #08070e 100%)',
      rim: '#ff2bd6',
    },
    castle: {
      label: 'Castle',
      emoji: '🏰',
      welcome: 'The court is assembled. Long live the drinking king.',
      font: 'Cinzel',
      vars: { bg: '#1c1b22', card: '#2a2833', 'card-2': '#383544', text: '#efe9dc', muted: '#a9a3b5', accent: '#d4af37', 'accent-text': '#1d1600', danger: '#c8303f', ok: '#6fbf73' },
      // A stone hall with torches on the walls and red banners hanging down.
      bg: () => `${vignette},
        radial-gradient(circle at 6% 22%, rgba(255, 140, 40, 0.4), transparent 18%),
        radial-gradient(circle at 94% 22%, rgba(255, 140, 40, 0.4), transparent 18%),
        ${banner()} 14% 0 / 54px 198px no-repeat, ${banner()} 86% 0 / 54px 198px no-repeat,
        linear-gradient(rgba(16, 15, 20, 0.45), rgba(16, 15, 20, 0.65)),
        ${stones()} 0 0 / 320px 200px, #1c1b22`,
      felt: 'radial-gradient(ellipse at center, #4a2670 0%, #3a1c5a 65%, #2a1242 100%)',
      rim: '#6b6875',
    },
    jazz: {
      label: 'Jazz club',
      emoji: '🎷',
      welcome: 'Low lights, smooth horns, strong drinks.',
      font: 'Limelight',
      vars: { bg: '#1a0d12', card: '#2a141c', 'card-2': '#3a1c27', text: '#f6e7d8', muted: '#c39ea0', accent: '#e3b04b', 'accent-text': '#241500', danger: '#ff5d73', ok: '#8fd19e' },
      // Velvet stage curtains under a spotlight, with gold art deco fans below.
      bg: () => `${vignette},
        radial-gradient(ellipse 45% 55% at 50% -5%, rgba(255, 220, 150, 0.32), transparent 70%),
        ${decoFans()} 0 100% / 80px 160px repeat-x,
        linear-gradient(transparent 72%, rgba(26, 13, 18, 0.85)),
        linear-gradient(rgba(20, 6, 10, 0.35), rgba(20, 6, 10, 0.55)),
        repeating-linear-gradient(90deg, #3a0f1c 0, #5c1a2c 18px, #6b2234 26px, #4a1424 38px, #3a0f1c 48px), #1a0d12`,
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
      // A mint wall with a chrome and red stripe, over a checkerboard floor.
      bg: () => `linear-gradient(#bfe6df 0 72%, #d9dee2 72% 73%, #e63946 73% 74.6%, #d9dee2 74.6% 75.6%, transparent 75.6%),
        linear-gradient(rgba(246, 239, 226, 0.86), rgba(246, 239, 226, 0.86)),
        ${checker()} 0 0 / 64px 64px, #f6efe2`,
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
${at} body{background:${typeof s.bg === 'function' ? s.bg() : s.bg};background-attachment:fixed;}
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
