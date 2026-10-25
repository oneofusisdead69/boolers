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

  // Bamboo canes, standing side by side.
  function bamboo() {
    const rand = seeded(13);
    let out = `<rect width='240' height='320' fill='#1d2b17'/>`;
    for (let i = 0; i < 6; i++) {
      const x = i * 40;
      const fill = pick(rand, ['#7a6a33', '#857338', '#6e5f2c', '#8b7a3d']);
      out += `<rect x='${x + 3}' width='34' height='320' rx='6' fill='${fill}'/>`;
      out += `<rect x='${x + 8}' width='6' height='320' fill='#fff' opacity='0.08'/>`;
      const off = rand() * 80;
      for (let y = off; y < 320 + 80; y += 80) {
        const yy = y % 320;
        out += `<rect x='${x + 3}' y='${yy}' width='34' height='5' rx='2' fill='#3b3214'/><rect x='${x + 3}' y='${yy + 5}' width='34' height='2' fill='#fff' opacity='0.12'/>`;
      }
    }
    return tile(240, 320, out);
  }

  // Palm fronds hanging into a top corner.
  const palm = (flip) => tile(300, 260, `<g transform='${flip ? 'translate(300 0) scale(-1 1)' : ''}' fill='#0b1a10' opacity='0.85'>
    ${[[-10, 30, 220, 150], [0, 0, 260, 60], [-20, 60, 160, 230], [10, -10, 150, 10], [-30, 40, 280, 120]].map(([x1, y1, x2, y2]) =>
      `<path d='M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 30} ${x2} ${y2} Q${(x1 + x2) / 2} ${Math.min(y1, y2) + 10} ${x1} ${y1 + 14}Z'/>`).join('')}</g>`);

  // Casino carpet: gold diamonds and rings on red.
  const carpet = () => tile(96, 96, `<rect width='96' height='96' fill='#4a0d14'/>
    <path d='M48 6 L90 48 L48 90 L6 48Z' fill='none' stroke='#c99a2e' stroke-width='2' opacity='0.7'/>
    <circle cx='48' cy='48' r='12' fill='none' stroke='#c99a2e' stroke-width='2' opacity='0.6'/>
    <circle cx='48' cy='48' r='4' fill='#1d5c3a'/>
    <circle cx='0' cy='0' r='8' fill='#2a0609'/><circle cx='96' cy='0' r='8' fill='#2a0609'/><circle cx='0' cy='96' r='8' fill='#2a0609'/><circle cx='96' cy='96' r='8' fill='#2a0609'/>`);

  // Bavarian blue and white diamonds.
  const lozenges = () => tile(80, 48, `<rect width='80' height='48' fill='#ffffff'/>
    <path d='M0 0 L40 24 L0 48Z M80 0 L40 24 L80 48Z' fill='#5aa2e6'/><path d='M40 24 L0 48 L80 48Z' fill='#ffffff'/>
    <path d='M0 0 L40 24 L80 0' fill='none' stroke='#3c86d0' stroke-width='1'/>`);

  // Stars: many small, a few bright.
  function stars() {
    const rand = seeded(21);
    let out = '';
    for (let i = 0; i < 60; i++) {
      const r = rand() < 0.1 ? 1.4 + rand() : 0.5 + rand() * 0.6;
      out += `<circle cx='${(rand() * 300).toFixed(1)}' cy='${(rand() * 300).toFixed(1)}' r='${r.toFixed(2)}' fill='${pick(rand, ['#ffffff', '#cfe0ff', '#ffe9c4'])}' opacity='${(0.4 + rand() * 0.6).toFixed(2)}'/>`;
    }
    return tile(300, 300, out);
  }

  // Falling snow.
  function snow() {
    const rand = seeded(17);
    let out = '';
    for (let i = 0; i < 40; i++) out += `<circle cx='${(rand() * 200).toFixed(1)}' cy='${(rand() * 200).toFixed(1)}' r='${(1 + rand() * 2.4).toFixed(1)}' fill='#fff' opacity='${(0.35 + rand() * 0.5).toFixed(2)}'/>`;
    return tile(200, 200, out);
  }

  // A string of fairy lights along the top.
  const lights = () => tile(120, 60, `<path d='M0 12 Q30 32 60 12 Q90 32 120 12' fill='none' stroke='#1b3b25' stroke-width='2'/>
    ${[[15, 21, '#ff4d4d'], [45, 21, '#ffd23f'], [75, 21, '#4dd4ff'], [105, 21, '#7dff7a']].map(([x, y, c]) =>
      `<circle cx='${x}' cy='${y + 6}' r='14' fill='${c}' opacity='0.25'/><ellipse cx='${x}' cy='${y + 6}' rx='5' ry='7' fill='${c}'/><rect x='${x - 3}' y='${y - 3}' width='6' height='4' fill='#2c2c2c'/>`).join('')}`);

  // A cobweb for the corners.
  function cobweb(flip) {
    let out = `<g transform='${flip ? 'translate(260 0) scale(-1 1)' : ''}' stroke='#d8d0e8' fill='none' stroke-width='1.2' opacity='0.45'>`;
    const spokes = [0, 15, 30, 45, 60, 75, 90].map((d) => (d * Math.PI) / 180);
    for (const a of spokes) out += `<path d='M0 0 L${(Math.cos(a) * 260).toFixed(1)} ${(Math.sin(a) * 260).toFixed(1)}'/>`;
    for (const r of [40, 80, 125, 175, 230]) {
      out += `<path d='${spokes.map((a, i) => `${i ? 'Q' + (Math.cos(a - 0.13) * r * 0.9).toFixed(1) + ' ' + (Math.sin(a - 0.13) * r * 0.9).toFixed(1) + ' ' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`).join(' ')}'/>`;
    }
    return tile(260, 260, `${out}</g>`);
  }

  // Bats, scattered.
  function bats() {
    const rand = seeded(31);
    let out = '';
    for (let i = 0; i < 5; i++) {
      const x = rand() * 260;
      const y = rand() * 260;
      const s = 0.6 + rand() * 0.8;
      out += `<path transform='translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})' d='M0 0 Q-8 -10 -22 -6 Q-16 -2 -18 4 Q-12 0 -8 6 Q-4 2 0 6 Q4 2 8 6 Q12 0 18 4 Q16 -2 22 -6 Q8 -10 0 0Z' fill='#05030a' opacity='0.7'/>`;
    }
    return tile(280, 280, out);
  }

  // Shamrocks, scattered.
  function shamrocks() {
    const rand = seeded(9);
    let out = '';
    for (let i = 0; i < 7; i++) {
      const x = rand() * 220;
      const y = rand() * 220;
      const rot = rand() * 360;
      out += `<g transform='translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${rot.toFixed(0)}) scale(${(0.6 + rand() * 0.6).toFixed(2)})' fill='#3fae5a' opacity='0.22'>
        <circle cx='0' cy='-9' r='7'/><circle cx='-8' cy='3' r='7'/><circle cx='8' cy='3' r='7'/><rect x='-1.5' y='4' width='3' height='14' rx='1.5'/></g>`;
    }
    return tile(240, 240, out);
  }

  // Ship's deck: planks running across, with nail heads.
  function deck() {
    const rand = seeded(19);
    let out = '';
    for (let i = 0; i < 6; i++) {
      const y = i * 40;
      out += `<rect y='${y}' width='400' height='40' fill='${pick(rand, ['#3a2a1a', '#33251a', '#40301e', '#2f2216'])}'/>`;
      out += `<rect y='${y}' width='400' height='2' fill='#120c06'/>`;
      const join = 60 + rand() * 280;
      out += `<rect x='${join}' y='${y}' width='2' height='40' fill='#120c06'/>`;
      for (const nx of [join - 8, join + 10]) out += `<circle cx='${nx}' cy='${y + 10}' r='1.6' fill='#0a0a0a'/><circle cx='${nx}' cy='${y + 30}' r='1.6' fill='#0a0a0a'/>`;
      for (let g = 0; g < 3; g++) out += `<path d='M0 ${y + 8 + rand() * 24} Q200 ${y + 8 + rand() * 24} 400 ${y + 8 + rand() * 24}' stroke='#1a1208' fill='none' opacity='0.35'/>`;
    }
    return tile(400, 240, out);
  }

  // Horizontal wooden boards for the saloon walls.
  function boards() {
    const rand = seeded(23);
    let out = '';
    for (let i = 0; i < 5; i++) {
      const y = i * 48;
      out += `<rect y='${y}' width='360' height='48' fill='${pick(rand, ['#6b4422', '#5e3b1d', '#734a26', '#654020'])}'/>`;
      out += `<rect y='${y + 46}' width='360' height='2' fill='#2a1608'/><rect y='${y}' width='360' height='2' fill='#fff' opacity='0.06'/>`;
      for (let g = 0; g < 4; g++) out += `<path d='M0 ${y + 6 + rand() * 36} Q180 ${y + 6 + rand() * 36} 360 ${y + 6 + rand() * 36}' stroke='#2f1b0a' fill='none' opacity='0.3'/>`;
    }
    return tile(360, 240, out);
  }

  // Waves rolling in, in rows (moonlit by default).
  function waves(color = '#9fc4e8', strength = 1) {
    let out = '';
    for (let row = 0; row < 4; row++) {
      const y = 12 + row * 22;
      const o = ((0.12 + row * 0.05) * strength).toFixed(2);
      out += `<path d='M0 ${y} Q20 ${y - 7} 40 ${y} T80 ${y} T120 ${y} T160 ${y}' fill='none' stroke='${color}' stroke-width='1.6' opacity='${o}'/>`;
    }
    return tile(160, 96, out);
  }

  // Sunlight glinting on the water.
  function glints() {
    const rand = seeded(23);
    let out = '';
    for (let i = 0; i < 26; i++) {
      const x = rand() * 220;
      const y = rand() * 140;
      const w = 3 + rand() * 9;
      out += `<rect x='${x.toFixed(1)}' y='${y.toFixed(1)}' width='${w.toFixed(1)}' height='1.4' rx='0.7' fill='#fffbe6' opacity='${(0.25 + rand() * 0.5).toFixed(2)}'/>`;
    }
    return tile(220, 140, out);
  }

  // Fair-weather clouds drifting high over the sea.
  function clouds() {
    const puff = (x, y, s) => [[0, 0, 1], [-0.9, 0.25, 0.7], [0.9, 0.2, 0.75], [0.35, -0.35, 0.7], [-0.4, -0.25, 0.6]]
      .map(([dx, dy, r]) => `<ellipse cx='${x + dx * 26 * s}' cy='${y + dy * 26 * s}' rx='${30 * r * s}' ry='${20 * r * s}'/>`).join('');
    return tile(520, 220, `<g fill='#ffffff' opacity='0.85'>${puff(90, 70, 1.2)}${puff(330, 40, 0.8)}${puff(440, 150, 1)}</g>`);
  }

  // The gallery railing at the top of the lighthouse, in front of you.
  const railing = (iron = '#06090f', foot = '#05080d') => tile(120, 160, `<rect y='0' width='120' height='14' rx='4' fill='${iron}'/>
    <rect y='60' width='120' height='8' fill='${iron}'/>
    ${[10, 40, 70, 100].map((x) => `<rect x='${x}' y='10' width='7' height='150' fill='${iron}'/>`).join('')}
    <rect y='120' width='120' height='40' fill='${foot}'/>`);

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
    tiki: {
      label: 'Tiki bar',
      emoji: '🏝️',
      welcome: 'Grab a coconut. The tide waits for no one.',
      font: 'Rum Raisin',
      vars: { bg: '#0f2421', card: '#1b3631', 'card-2': '#25463f', text: '#fbf1dc', muted: '#a8c3b6', accent: '#ff8a3d', 'accent-text': '#2a1000', danger: '#ff4f5e', ok: '#6fdc8c' },
      // A bamboo wall at night, palm fronds overhead, torches either side.
      bg: () => `${palm(false)} 0 0 / 300px 260px no-repeat, ${palm(true)} 100% 0 / 300px 260px no-repeat, ${vignette},
        radial-gradient(circle at 5% 45%, rgba(255, 140, 50, 0.45), transparent 20%),
        radial-gradient(circle at 95% 45%, rgba(255, 140, 50, 0.45), transparent 20%),
        linear-gradient(rgba(10, 26, 22, 0.55), rgba(10, 26, 22, 0.75)),
        ${bamboo()} 0 0 / 240px 320px, #0f2421`,
      felt: 'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.08) 0 6px, transparent 6px 12px), radial-gradient(ellipse at center, #c99a52 0%, #a87b3c 70%, #8a6129 100%)',
      rim: '#5a3a1a',
    },
    speakeasy: {
      label: 'Speakeasy',
      emoji: '🥃',
      welcome: 'Knock twice. Password’s “the bee’s knees”.',
      font: 'Poiret One',
      vars: { bg: '#121410', card: '#1d201a', 'card-2': '#292d24', text: '#f1ead8', muted: '#a9a58f', accent: '#c9a24a', 'accent-text': '#1a1300', danger: '#c8483a', ok: '#7fbf7a' },
      // Dark panelling under a gold art deco sunburst.
      bg: () => `${vignette},
        repeating-conic-gradient(from 180deg at 50% -8%, rgba(201, 162, 74, 0.16) 0deg 1.5deg, transparent 1.5deg 9deg),
        radial-gradient(ellipse 70% 45% at 50% -5%, rgba(201, 162, 74, 0.22), transparent 70%),
        linear-gradient(rgba(14, 16, 12, 0.6), rgba(14, 16, 12, 0.8)),
        ${planks()} 0 0 / 256px 512px, #121410`,
      felt: 'radial-gradient(ellipse at center, #2c4a37 0%, #1f3a2b 70%, #15291e 100%)',
      rim: '#b08d45',
    },
    casino: {
      label: 'Casino',
      emoji: '🎰',
      welcome: 'The house always wins. Tonight, the house drinks.',
      font: 'Abril Fatface',
      vars: { bg: '#1a0608', card: '#2a0d10', 'card-2': '#3a1418', text: '#fff2e0', muted: '#d5a6a0', accent: '#f5c542', 'accent-text': '#2a1d00', danger: '#ff4d5e', ok: '#4fd18b' },
      // Patterned casino carpet under chandelier light.
      bg: () => `${vignette},
        radial-gradient(ellipse 50% 35% at 25% 0%, rgba(255, 215, 120, 0.3), transparent 70%),
        radial-gradient(ellipse 50% 35% at 75% 0%, rgba(255, 215, 120, 0.3), transparent 70%),
        linear-gradient(rgba(26, 6, 8, 0.45), rgba(26, 6, 8, 0.7)),
        ${carpet()} 0 0 / 96px 96px, #1a0608`,
      felt: 'radial-gradient(ellipse at center, #13804a 0%, #0f6b3c 65%, #0a5530 100%)',
      rim: '#c99a2e',
    },
    saloon: {
      label: 'Saloon',
      emoji: '🤠',
      welcome: 'Belly up to the bar, partner.',
      font: 'Rye',
      vars: { bg: '#2a1a0e', card: '#3c2614', 'card-2': '#4d331c', text: '#fbecd2', muted: '#d0b28a', accent: '#e0a43a', 'accent-text': '#2a1600', danger: '#c8452f', ok: '#9bc76a' },
      // Board walls with dusty sunlight slanting in.
      bg: () => `${vignette},
        linear-gradient(115deg, transparent 20%, rgba(255, 220, 150, 0.14) 28%, transparent 36%, transparent 48%, rgba(255, 220, 150, 0.1) 54%, transparent 60%),
        linear-gradient(rgba(30, 18, 8, 0.45), rgba(30, 18, 8, 0.65)),
        ${boards()} 0 0 / 360px 240px, #2a1a0e`,
      felt: 'radial-gradient(ellipse at center, #3f6b45 0%, #355e3b 65%, #284a2d 100%)',
      rim: '#4a2a12',
    },
    pirate: {
      label: 'Pirate tavern',
      emoji: '🏴‍☠️',
      welcome: 'Yo ho ho. Dead men tell no tales, and neither do we.',
      font: 'Pirata One',
      vars: { bg: '#10161d', card: '#1b2530', 'card-2': '#26323f', text: '#f2e6cc', muted: '#a9b1b9', accent: '#e3b23c', 'accent-text': '#231800', danger: '#e0503c', ok: '#6fc28b' },
      // A ship's deck by lantern light, sea mist rolling in.
      bg: () => `${vignette},
        radial-gradient(circle at 15% 15%, rgba(255, 190, 90, 0.35), transparent 22%),
        radial-gradient(circle at 85% 15%, rgba(255, 190, 90, 0.3), transparent 22%),
        linear-gradient(transparent 70%, rgba(120, 150, 170, 0.18)),
        linear-gradient(rgba(16, 22, 29, 0.5), rgba(16, 22, 29, 0.7)),
        ${deck()} 0 0 / 400px 240px, #10161d`,
      felt: 'radial-gradient(ellipse at 45% 40%, #e3cc96 0%, #cdb070 70%, #a88a4c 100%)',
      rim: '#5a3d1e',
    },
    beerhall: {
      label: 'Beer hall',
      emoji: '🥨',
      welcome: 'Prost! Steins up, everybody.',
      font: 'UnifrakturMaguntia',
      light: true,
      vars: { bg: '#eef3fa', card: '#ffffff', 'card-2': '#e3ebf6', text: '#1d2a3a', muted: '#5f6f84', accent: '#2a6fdb', 'accent-text': '#ffffff', 'accent-ink': '#1f56ad', danger: '#d63c3c', ok: '#2b9a5a' },
      // Blue and white diamonds, like the flags strung over the benches.
      bg: () => `linear-gradient(rgba(238, 243, 250, 0.84), rgba(238, 243, 250, 0.84)),
        ${lozenges()} 0 0 / 80px 48px, #eef3fa`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.1) 0 2px, transparent 2px 70px), radial-gradient(ellipse at center, #b07c46 0%, #9a6a3a 70%, #7d5430 100%)',
      rim: '#5c3a1a',
    },
    space: {
      label: 'Space lounge',
      emoji: '🪐',
      welcome: 'Zero gravity, full glasses.',
      font: 'Orbitron',
      vars: { bg: '#05060f', card: '#10132a', 'card-2': '#1a1f3d', text: '#eef1ff', muted: '#8e96c8', accent: '#7cf0ff', 'accent-text': '#00222a', danger: '#ff5c8a', ok: '#7dff9e' },
      // Stars and nebulae, with a ringed planet rising in the corner.
      bg: () => `radial-gradient(circle at 88% 12%, #f4b26a 0 5%, #c9773a 7%, transparent 7.4%),
        radial-gradient(ellipse 14% 3% at 88% 12%, transparent 60%, rgba(255, 220, 170, 0.55) 70%, transparent 82%),
        radial-gradient(ellipse 60% 40% at 15% 30%, rgba(140, 70, 255, 0.28), transparent 70%),
        radial-gradient(ellipse 50% 40% at 70% 85%, rgba(40, 160, 255, 0.22), transparent 70%),
        ${stars()} 0 0 / 300px 300px, #05060f`,
      felt: 'radial-gradient(ellipse at 40% 35%, #1d2350 0%, #121633 65%, #0a0c20 100%)',
      rim: '#3d4a8a',
    },
    lighthouse: {
      label: 'Lighthouse',
      emoji: '🌊',
      welcome: 'Keepers of the light. Pour one out for the sailors.',
      // The weather changes on its own during games (see moods below): this is the night.
      font: 'Cormorant SC',
      vars: { bg: '#0b1626', card: '#13233a', 'card-2': '#1b3050', text: '#eef3f8', muted: '#9fb3c8', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
      // From the gallery at the top: the night sea stretching out to the horizon, the moon's path
      // on the water, and the iron railing in front of you.
      bg: () => `${railing()} 0 100% / 120px 16vh repeat-x,
        radial-gradient(ellipse 6% 34% at 70% 70%, rgba(255, 240, 200, 0.16), transparent 70%),
        radial-gradient(circle at 70% 18%, #fff4d8 0 2.6%, rgba(255, 236, 190, 0.25) 3.4%, transparent 9%),
        linear-gradient(transparent 44%, rgba(170, 205, 240, 0.25) 44.4%, transparent 46%),
        linear-gradient(transparent 44%, rgba(10, 28, 50, 0.85) 44%),
        ${stars()} 0 0 / 300px 300px,
        linear-gradient(#050b17 0%, #13264a 44%, transparent 44%),
        ${waves()} 0 100% / 160px 96px,
        linear-gradient(#0d2440, #071426), #0b1626`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #5b6f80 0%, #4a5d6e 70%, #394a59 100%)',
      rim: '#c9a227',
    },
    // The Lighthouse's other moods. They aren't on the list of styles: the room moves between them.
    lighthouseDay: {
      mood: true,
      label: 'Lighthouse',
      emoji: '🌊',
      welcome: 'Fair winds and following seas. Pour one out for the sailors.',
      font: 'Cormorant SC',
      vars: { bg: '#2f6f9e', card: '#13304d', 'card-2': '#1c4266', text: '#f2f7fb', muted: '#b4c8da', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
      // The same view on a bright day: the sun high over a blue sea, glittering on the water, a few
      // clouds, and the railing painted dark green.
      bg: () => `${railing('#17261f', '#122019')} 0 100% / 120px 16vh repeat-x,
        radial-gradient(ellipse 9% 30% at 24% 66%, rgba(255, 250, 225, 0.4), transparent 70%),
        ${clouds()} 0 3vh / 520px 220px repeat-x,
        radial-gradient(circle at 24% 15%, #fffdf0 0 3.2%, rgba(255, 246, 200, 0.55) 4.6%, rgba(255, 240, 190, 0) 15%),
        linear-gradient(transparent 44%, rgba(255, 255, 255, 0.55) 44.2%, transparent 45.6%),
        linear-gradient(#3b88c9 0%, #86c1e8 34%, #cde6f4 44%, transparent 44%),
        ${glints()} 0 0 / 220px 140px,
        ${waves('#ffffff', 1.3)} 0 100% / 160px 96px,
        linear-gradient(#2a7fab, #0f4a6e), #2f6f9e`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #5b6f80 0%, #4a5d6e 70%, #394a59 100%)',
      rim: '#c9a227',
    },
    lighthouseFog: {
      mood: true,
      label: 'Lighthouse',
      emoji: '🌫️',
      welcome: 'Fog’s rolled in. Listen for the horn.',
      font: 'Cormorant SC',
      vars: { bg: '#1c2631', card: '#25313e', 'card-2': '#303e4d', text: '#eef2f6', muted: '#a8b4c0', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
      // Night, but the fog has come in: the moon a smudge, the horizon gone, grey all the way down.
      bg: () => `${railing('#0e141b', '#0b1016')} 0 100% / 120px 16vh repeat-x,
        linear-gradient(rgba(160, 175, 190, 0.05) 0%, rgba(160, 175, 190, 0.32) 38%, rgba(170, 184, 198, 0.42) 50%, rgba(150, 165, 180, 0.22) 100%),
        radial-gradient(circle at 70% 18%, rgba(255, 244, 216, 0.4) 0 3%, rgba(255, 236, 190, 0.14) 7%, transparent 16%),
        linear-gradient(#18222e 0%, #3b4a5a 44%, transparent 44%),
        ${waves('#b8c6d4', 0.6)} 0 100% / 160px 96px,
        linear-gradient(#2a3a4c, #141e29), #1c2631`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #56656f 0%, #46545e 70%, #36424b 100%)',
      rim: '#a9b2ba',
    },
    storm: {
      mood: true,
      label: 'Lighthouse',
      emoji: '⛈️',
      welcome: 'Batten down the hatches. All hands to the bar.',
      font: 'Cormorant SC',
      vars: { bg: '#0a1016', card: '#141c25', 'card-2': '#1d2833', text: '#e9eef3', muted: '#97a6b4', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
      // The same view, but black clouds, a heaving grey sea and rain lashing the glass.
      bg: () => `${railing()} 0 100% / 120px 16vh repeat-x,
        linear-gradient(transparent 46%, rgba(200, 215, 230, 0.12) 46.5%, transparent 48%),
        radial-gradient(ellipse 40% 20% at 30% 12%, rgba(60, 70, 85, 0.6), transparent 70%),
        radial-gradient(ellipse 50% 22% at 75% 22%, rgba(50, 58, 72, 0.6), transparent 70%),
        linear-gradient(#06090d 0%, #1c2733 46%, transparent 46%),
        ${waves()} 0 100% / 110px 70px,
        linear-gradient(#16212c, #080d12), #0a1016`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.14) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #4b5a66 0%, #3c4954 70%, #2d3740 100%)',
      rim: '#9aa4ad',
    },
    christmas: {
      seasonal: true,
      label: 'Christmas',
      emoji: '🎄',
      welcome: 'Eggnog’s spiked. Ho ho ho.',
      font: 'Mountains of Christmas',
      vars: { bg: '#0e2418', card: '#173523', 'card-2': '#214630', text: '#fff8ee', muted: '#b8cfb9', accent: '#e8b84a', 'accent-text': '#261a00', danger: '#e2403b', ok: '#7fdc8f' },
      // Snow falling past fairy lights, a fire glowing below.
      bg: () => `${lights()} 0 0 / 120px 60px repeat-x, ${snow()} 0 0 / 200px 200px, ${vignette},
        radial-gradient(ellipse 80% 35% at 50% 105%, rgba(255, 120, 40, 0.35), transparent 70%),
        linear-gradient(#0b1d13, #12301f), #0e2418`,
      felt: 'radial-gradient(ellipse at center, #a3222b 0%, #8c1a22 65%, #6c1218 100%)',
      rim: '#c9a14a',
    },
    halloween: {
      seasonal: true,
      label: 'Halloween',
      emoji: '🎃',
      welcome: 'Something wicked this way comes. Drink up.',
      font: 'Creepster',
      vars: { bg: '#0d0812', card: '#1c1224', 'card-2': '#2a1a35', text: '#fbeedd', muted: '#b79fc4', accent: '#ff7a1a', 'accent-text': '#1f0d00', danger: '#ff3b5c', ok: '#8fe36b' },
      // A full moon, bats, cobwebs in the corners and fog creeping along the floor.
      bg: () => `${cobweb(false)} 0 0 / 260px 260px no-repeat, ${cobweb(true)} 100% 0 / 260px 260px no-repeat,
        radial-gradient(circle at 80% 14%, #fff6d6 0 4.5%, rgba(255, 230, 160, 0.35) 5.5%, transparent 14%),
        ${bats()} 0 0 / 280px 280px, ${vignette},
        linear-gradient(transparent 65%, rgba(150, 110, 190, 0.28)),
        radial-gradient(ellipse 80% 30% at 50% 105%, rgba(255, 122, 26, 0.2), transparent 70%),
        linear-gradient(#120a1c, #0d0812), #0d0812`,
      felt: 'radial-gradient(ellipse at center, #3a1f4d 0%, #2a1538 65%, #1a0c24 100%)',
      rim: '#ff7a1a',
    },
    stpatricks: {
      seasonal: true,
      label: 'St Patrick’s',
      emoji: '☘️',
      welcome: 'Sláinte! Kiss me, I’m Irish (tonight).',
      font: 'Uncial Antiqua',
      vars: { bg: '#0c2414', card: '#143520', 'card-2': '#1c462b', text: '#f3fbef', muted: '#a7c9ad', accent: '#f2c94c', 'accent-text': '#241a00', danger: '#ff5a5a', ok: '#8af07a' },
      // Shamrocks everywhere, and a pot of gold glowing somewhere.
      bg: () => `${vignette},
        radial-gradient(ellipse 50% 30% at 50% 105%, rgba(242, 201, 76, 0.3), transparent 70%),
        radial-gradient(ellipse 60% 40% at 50% -10%, rgba(120, 220, 120, 0.18), transparent 70%),
        ${shamrocks()} 0 0 / 240px 240px, #0c2414`,
      felt: 'radial-gradient(ellipse at center, #258a43 0%, #1f7a3a 65%, #17602d 100%)',
      rim: '#c9a227',
    },
  };

  // Rooms whose look changes on its own: [look, how often it comes up]. The first is where it starts
  // when nothing's been picked yet.
  STYLES.lighthouse.moods = [['lighthouse', 4], ['lighthouseDay', 3], ['lighthouseFog', 2], ['storm', 1.5]];

  const IDS = Object.keys(STYLES);
  // The styles the host picks from (a mood is part of its room, not a choice of its own).
  const PICKABLE = IDS.filter((id) => !STYLES[id].mood);
  // The room a mood belongs to (a saved room may still be on an old 'storm' style).
  const roomOf = (id) => (STYLES[id]?.mood ? IDS.find((r) => STYLES[r].moods?.some(([look]) => look === id)) : id);

  // A new mood for a room that has them, never the one it's in now.
  function pickMood(style, now) {
    const list = (STYLES[style]?.moods || []).filter(([look]) => look !== now);
    let r = Math.random() * list.reduce((n, [, w]) => n + w, 0);
    for (const [look, w] of list) if ((r -= w) < 0) return look;
    return list[0]?.[0] || null;
  }

  // ---------- In the browser ----------

  function css() {
    return Object.entries(STYLES).filter(([, s]) => s.vars).map(([id, s]) => {
      const at = `html[data-room="${id}"][data-room]`;
      const font = `"${s.font}", system-ui, sans-serif`;
      return `${at}{${Object.entries(s.vars).map(([k, v]) => `--${k}:${v};`).join('')}--felt:${s.felt};--rim:${s.rim};color-scheme:${s.light ? 'light' : 'dark'};}
${at} body{background:${typeof s.bg === 'function' ? s.bg() : s.bg};background-attachment:fixed;}
${at} h1, ${at} .room-code, ${at} .tv-title, ${at} .tv-game-name, ${at} .drink .big, ${at} .room-welcome b, ${at} .trip-next-name, ${at} .trip-head b, ${at} .trip-option b{font-family:${font};font-weight:400;letter-spacing:0;}`;
    }).join('\n');
  }

  // When the look changes, the old background fades out over the new one instead of snapping.
  function crossfade() {
    if (!document.body) return;
    const cs = getComputedStyle(document.body);
    const fade = document.createElement('div');
    fade.setAttribute('aria-hidden', 'true');
    fade.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;transition:opacity 4s ease;';
    for (const p of ['backgroundImage', 'backgroundColor', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat']) fade.style[p] = cs[p];
    document.body.prepend(fade);
    requestAnimationFrame(() => requestAnimationFrame(() => (fade.style.opacity = '0')));
    setTimeout(() => fade.remove(), 4300);
  }

  let current = null;
  function apply(id) {
    if (typeof document === 'undefined') return;
    const style = STYLES[id] && id !== 'classic' ? id : null;
    if (style === current) return;
    if (current && style && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) crossfade();
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

  const ROOM_STYLES = { STYLES, IDS, PICKABLE, roomOf, pickMood, apply, css };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROOM_STYLES;
  else root.ROOM_STYLES = ROOM_STYLES;
})(this);
