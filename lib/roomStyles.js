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

  // A rough fieldstone wall: rounded stones of every size, bedded in pale mortar.
  function fieldstone() {
    const rand = seeded(11);
    let out = `<rect width='300' height='210' fill='#2c2620'/>`;
    for (let row = 0; row < 6; row++) {
      let x = -10 + rand() * 10;
      while (x < 300) {
        const w = 34 + rand() * 40;
        const h = 26 + rand() * 10;
        const cx = x + w / 2;
        const cy = row * 35 + 18 + (rand() - 0.5) * 5;
        const fill = pick(rand, ['#5a5045', '#4f463c', '#635849', '#564c41', '#4a4238', '#6a5e4e']);
        // Each stone twice, at either edge, so the wall repeats without a seam.
        for (const dx of cx + w / 2 > 300 ? [0, -300] : [0]) {
          out += `<ellipse cx='${(cx + dx).toFixed(1)}' cy='${cy.toFixed(1)}' rx='${(w / 2 - 2).toFixed(1)}' ry='${(h / 2).toFixed(1)}' fill='${fill}'/>`;
          out += `<ellipse cx='${(cx + dx - 3).toFixed(1)}' cy='${(cy - h / 5).toFixed(1)}' rx='${(w / 3).toFixed(1)}' ry='${(h / 6).toFixed(1)}' fill='#fff' opacity='0.05'/>`;
        }
        x += w;
      }
    }
    return tile(300, 210, out);
  }

  // A small deep-set window looking out on the glen: the mountains, green hills and the mist in
  // the valley at dusk, or the same in the rain, or nothing but fog.
  function glen(weather = 'clear') {
    const sky = { clear: ['#2b3a5c', '#9a7b8e', '#e9b783'], rain: ['#2e3540', '#4d5661', '#6f7882'], fog: ['#6d757d', '#a3aab0', '#c4c9cc'] }[weather];
    const rain = weather !== 'rain' ? '' : Array.from({ length: 34 }, (_, i) => {
      const x = 18 + ((i * 53) % 196);
      const y = 18 + ((i * 37) % 150);
      return `<path d='M${x} ${y} l-4 14' stroke='#cfd8e2' stroke-width='1' opacity='0.45'/>`;
    }).join('') + Array.from({ length: 9 }, (_, i) => `<circle cx='${24 + ((i * 71) % 180)}' cy='${30 + ((i * 43) % 140)}' r='2' fill='#dfe8f0' opacity='0.35'/>`).join('');
    const fog = weather === 'fog' ? `<rect x='15' y='15' width='200' height='170' fill='#d6dade' opacity='0.55'/><rect x='15' y='120' width='200' height='65' fill='#e3e6e8' opacity='0.45'/>` : '';
    return tile(230, 200, `<defs><linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${sky[0]}'/><stop offset='0.55' stop-color='${sky[1]}'/><stop offset='1' stop-color='${sky[2]}'/></linearGradient></defs>
    <rect x='15' y='15' width='200' height='170' rx='6' fill='url(#sky)'/>
    ${weather === 'clear' ? `<circle cx='160' cy='60' r='2' fill='#fff' opacity='0.8'/><circle cx='60' cy='40' r='1.4' fill='#fff' opacity='0.6'/>` : ''}
    <path d='M15 120 L50 86 L78 104 L118 66 L160 102 L190 84 L215 100 L215 185 L15 185Z' fill='${weather === 'clear' ? '#4a5872' : '#46505c'}'/>
    <path d='M15 150 Q60 118 110 140 Q160 120 215 138 L215 185 L15 185Z' fill='${weather === 'clear' ? '#2f5a34' : '#2b4a30'}'/>
    <path d='M15 170 Q80 148 150 166 Q190 158 215 164 L215 185 L15 185Z' fill='#234627'/>
    <rect x='15' y='138' width='200' height='18' fill='#e8eef2' opacity='0.28'/>
    <circle cx='142' cy='160' r='1.8' fill='#ffcf6a'/>${fog}${rain}
    <rect x='0' y='0' width='230' height='200' rx='10' fill='none' stroke='#2a1a0e' stroke-width='18'/>
    <rect x='111' y='15' width='8' height='170' fill='#2a1a0e'/><rect x='15' y='96' width='200' height='8' fill='#2a1a0e'/>
    <rect x='9' y='184' width='212' height='10' fill='#3a2614'/>`);
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

  // The tiki bar's view: the bamboo walls open in the middle onto the beach at dusk. The sea, the
  // sand and the palms, and out on the horizon an island volcano, quiet but for a wisp of smoke (on
  // the TV it erupts, once in a while: see public/scenery.js). A thatch overhang along the top.
  function tikiBeach() {
    const r = seeded(17);
    let out = `<defs><linearGradient id='tk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2a1640'/><stop offset='0.45' stop-color='#a0406a'/><stop offset='0.8' stop-color='#ff9a5a'/><stop offset='1' stop-color='#ffd28a'/></linearGradient>
      <radialGradient id='crater'><stop offset='0' stop-color='#ffd23f'/><stop offset='0.4' stop-color='#ff6a1a' stop-opacity='0.8'/><stop offset='1' stop-color='#ff3a1a' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='470' fill='url(#tk)'/>
      <circle cx='560' cy='380' r='70' fill='#ffcf70' opacity='0.9'/>
      <path d='M760 430 L960 140 Q1000 116 1040 140 L1260 430Z' fill='#3a2030'/><path d='M960 140 Q1000 116 1040 140 L1010 170 L990 160 L970 172Z' fill='#5a2a20'/>
      <ellipse cx='1000' cy='134' rx='50' ry='20' fill='url(#crater)' opacity='0.35'/>
      <path d='M992 124 Q972 90 994 60 Q1010 36 998 10' stroke='#8a7080' stroke-width='18' fill='none' opacity='0.2' stroke-linecap='round'/>
      <rect y='430' width='1600' height='160' fill='#2a4a7a'/>
      ${Array.from({ length: 7 }, (_, i) => `<path d='M0 ${444 + i * 20} Q200 ${436 + i * 20} 400 ${444 + i * 20} T800 ${444 + i * 20} T1200 ${444 + i * 20} T1600 ${444 + i * 20}' stroke='#ffb07a' stroke-width='2' fill='none' opacity='${0.5 - i * 0.06}'/>`).join('')}
      <path d='M0 590 Q400 560 800 580 T1600 570 V900 H0Z' fill='#e8c690'/><path d='M0 590 Q400 560 800 580 T1600 570' stroke='#fff' stroke-width='5' fill='none' opacity='0.7'/>
      ${[[400, 600, 1], [1240, 590, -1]].map(([x, y, d]) => `<path d='M${x} ${y} Q${x + 20 * d} ${y - 140} ${x + 60 * d} ${y - 260}' stroke='#3a2a1a' stroke-width='14' fill='none'/>
        ${[-60, -20, 20, 60, 100].map((a) => `<path d='M${x + 60 * d} ${y - 260} q${Math.cos((a * Math.PI) / 180) * 90 * d} ${Math.sin((a * Math.PI) / 180) * 50 - 10} ${Math.cos((a * Math.PI) / 180) * 160 * d} ${Math.sin((a * Math.PI) / 180) * 90 + 40}' stroke='#1e3a24' stroke-width='16' fill='none' stroke-linecap='round'/>`).join('')}`).join('')}`;
    // The bamboo walls either side, lashed at the top and bottom of the opening.
    for (const [x0, x1] of [[0, 280], [1320, 1600]]) {
      for (let x = x0; x < x1; x += 40) {
        const fill = pick(r, ['#7a6a33', '#857338', '#6e5f2c', '#8b7a3d']);
        out += `<rect x='${x + 3}' y='0' width='34' height='900' rx='6' fill='${fill}'/><rect x='${x + 8}' y='0' width='6' height='900' fill='#fff' opacity='0.08'/>`;
        for (let y = r() * 80; y < 900; y += 80) out += `<rect x='${x + 3}' y='${y}' width='34' height='5' rx='2' fill='#3b3214'/>`;
      }
    }
    out += [280, 1320].map((x) => `<rect x='${x - 12}' y='0' width='24' height='900' fill='#5a4a20'/>${[160, 700].map((y) => `<path d='M${x - 14} ${y} h28 M${x - 14} ${y + 10} h28 M${x - 14} ${y + 20} h28' stroke='#2a2010' stroke-width='4'/>`).join('')}`).join('');
    out += `<path d='M0 0 H1600 V90 ${Array.from({ length: 40 }, (_, i) => `L${1600 - i * 40 - 20} ${110 + (i % 2) * 14} L${1600 - i * 40 - 40} 90`).join(' ')} Z' fill='#8a6a2a'/>
      ${Array.from({ length: 80 }, (_, i) => `<path d='M${i * 20} 0 L${i * 20 + 6} 100' stroke='#6a5020' stroke-width='3'/>`).join('')}`;
    return scene(out);
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

  // Damask wallpaper: a gold-on-burgundy pattern, faded with age.
  const damask = () => tile(120, 160, `<rect width='120' height='160' fill='#3a1418'/>
    <g fill='#5a2228' opacity='0.85'>${[[60, 40], [0, 120], [120, 120]].map(([x, y]) => `<path transform='translate(${x} ${y})' d='M0 -34 C14 -22 22 -8 12 6 C24 4 30 14 22 24 C14 18 6 20 0 34 C-6 20 -14 18 -22 24 C-30 14 -24 4 -12 6 C-22 -8 -14 -22 0 -34Z'/>`).join('')}</g>
    <g fill='#6b2c30' opacity='0.6'>${[[0, 40], [120, 40], [60, 120]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='6'/><circle cx='${x}' cy='${y}' r='14' fill='none' stroke='#6b2c30' stroke-width='2'/>`).join('')}</g>`);

  // A scene filling the whole screen without being stretched: cropped to fit instead.
  const scene = (body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'>${body}</svg>`)}")`;

  // ---------- Outdoors: the Italian vineyard ----------
  // The view from the terrace: rows of vines over rolling Tuscan hills, cypresses along the white
  // road, a stone farmhouse with a terracotta roof, the hills fading blue into the distance.
  function tuscany(sunset) {
    const c = sunset
      ? { sky: ['#3a2a52', '#c4566a', '#f0a050'], far: '#8a5a6a', mid: '#a86a3a', near: '#7a5a22', rows: '#4a3410', house: '#c98a5a', roof: '#8a3a1a', cypress: '#1e1a10', road: '#e8b888', sun: '#ffd27a' }
      : { sky: ['#3f7fc4', '#86b8e4', '#dcebf2'], far: '#9fb3c8', mid: '#a9b45a', near: '#7f9a3a', rows: '#4f6a22', house: '#e2c79a', roof: '#c2552d', cypress: '#22381a', road: '#f2e4c4', sun: '#fff6d8' };
    const rows = (y0, y1, n, color, w) => Array.from({ length: n }, (_, i) => {
      const y = y0 + ((y1 - y0) * i) / n;
      return `<path d='M-20 ${y + 30} Q400 ${y - 10} 800 ${y + 12} T1620 ${y}' stroke='${color}' stroke-width='${w + i * 0.6}' fill='none' stroke-dasharray='${6 + i} ${4 + i * 0.4}' opacity='0.85'/>`;
    }).join('');
    const cypress = (x, y, h) => `<path d='M${x} ${y} Q${x - h * 0.12} ${y - h * 0.5} ${x} ${y - h} Q${x + h * 0.12} ${y - h * 0.5} ${x} ${y}Z' fill='${c.cypress}'/>`;
    return scene(`<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.sky[0]}'/><stop offset='0.6' stop-color='${c.sky[1]}'/><stop offset='1' stop-color='${c.sky[2]}'/></linearGradient></defs>
      <rect width='1600' height='420' fill='url(#s)'/>
      <circle cx='${sunset ? 1180 : 1250}' cy='${sunset ? 380 : 150}' r='${sunset ? 60 : 46}' fill='${c.sun}' opacity='0.95'/>
      <path d='M0 420 Q200 330 420 380 T860 350 T1300 370 T1600 340 V520 H0Z' fill='${c.far}'/>
      <path d='M0 470 Q260 380 560 440 T1100 420 T1600 450 V900 H0Z' fill='${c.mid}'/>${rows(470, 560, 7, c.rows, 3)}
      <path d='M0 600 Q300 520 700 580 T1600 560 V900 H0Z' fill='${c.near}'/>${rows(600, 760, 9, c.rows, 4)}
      <path d='M1060 900 Q1000 700 1180 560 Q1260 500 1300 430' stroke='${c.road}' stroke-width='22' fill='none' opacity='0.9'/>
      ${[[1180, 560, 120], [1220, 520, 100], [1255, 485, 84], [1282, 455, 70], [1120, 640, 140], [1070, 720, 160]].map(([x, y, h]) => cypress(x, y, h)).join('')}
      <rect x='1330' y='360' width='130' height='70' fill='${c.house}'/><path d='M1320 362 L1395 322 L1470 362Z' fill='${c.roof}'/><rect x='1430' y='330' width='30' height='60' fill='${c.house}'/><path d='M1426 332 L1445 318 L1464 332Z' fill='${c.roof}'/>
      ${[1350, 1380, 1410].map((x) => `<rect x='${x}' y='380' width='12' height='16' fill='${sunset ? '#ffcf6a' : '#5a4a3a'}'/>`).join('')}
      ${[[300, 420, 70], [330, 410, 60], [140, 440, 80]].map(([x, y, h]) => cypress(x, y, h)).join('')}`);
  }
  // The pergola overhead: a beam with vines along it and bunches of grapes hanging down.
  const pergola = (sunset) => tile(300, 150, `<rect y='0' width='300' height='18' fill='#5a3a1e'/><rect y='14' width='300' height='4' fill='#3b2512'/>
    ${[[30, 18], [110, 22], [190, 16], [260, 24]].map(([x, l]) => `<path d='M${x} 18 q-14 ${l} -26 ${l + 8} q20 -2 26 -${l - 6} q6 ${l} 26 ${l + 6} q-12 -${l} -26 -${l + 8}Z' fill='${sunset ? '#4a5a1e' : '#5f8a2a'}'/>`).join('')}
    ${[[60, '#5a2a6a'], [150, '#6a2a5a'], [230, '#4a2a6a']].map(([x, col]) => `<g fill='${col}'>${[[0, 0], [-7, 0], [7, 0], [-3.5, 7], [3.5, 7], [0, 14], [-7, 7], [7, 7], [-3.5, 14], [3.5, 14], [0, 21]].map(([dx, dy]) => `<circle cx='${x + dx}' cy='${38 + dy}' r='5'/>`).join('')}</g><path d='M${x} 30 V18' stroke='#3b2512' stroke-width='2'/>`).join('')}
    <path d='M0 22 Q75 40 150 26 T300 24' stroke='#4a6a1e' stroke-width='3' fill='none'/>`);
  // The terrace's low stone wall, in front of you.
  const stoneWall = () => tile(180, 120, `<rect width='180' height='120' fill='#8a7458'/>
    ${[[0, 0, 60], [60, 0, 70], [130, 0, 50], [0, 30, 40], [40, 30, 80], [120, 30, 60], [0, 60, 70], [70, 60, 60], [130, 60, 50], [0, 90, 50], [50, 90, 70], [120, 90, 60]].map(([x, y, w], i) => `<rect x='${x + 2}' y='${y + 2}' width='${w - 4}' height='26' rx='5' fill='${['#b49a74', '#a88e6a', '#c0a67e', '#9c8462'][i % 4]}'/>`).join('')}
    <rect width='180' height='10' fill='#cdb58c'/>`);

  // ---------- Outdoors: the French château ----------
  // From the terrace across the formal garden: clipped hedges and topiary, the gravel path, the
  // fountain, and the château itself in pale stone with slate-blue turrets, under the sky (or the
  // stars, with every window lit).
  function chateau(night, fire = false) {
    const c = fire
      ? { sky: ['#12060c', '#4a1414', '#b4501e'], stone: '#7a6a66', roof: '#241c22', win: '#ff9a2a', hedge: '#1e2a1c', lawn: '#2a2a1c', path: '#5a4a44', trees: '#140c0a' }
      : night
      ? { sky: ['#0b1230', '#1d2a5a', '#3a3a6a'], stone: '#8a8aa0', roof: '#2a3450', win: '#ffd27a', hedge: '#1e3a24', lawn: '#24402a', path: '#6a6a7a', trees: '#14241a' }
      : { sky: ['#2f66aa', '#86b4e0', '#dcebf2'], stone: '#efe4cc', roof: '#5a6a86', win: '#4a5a6a', hedge: '#355e26', lawn: '#5f8a36', path: '#b9a983', trees: '#3a5a2a' };
    const tower = (x, w, top, base) => `<rect x='${x}' y='${top}' width='${w}' height='${base - top}' fill='${c.stone}'/><path d='M${x - 8} ${top + 2} L${x + w / 2} ${top - w * 1.5} L${x + w + 8} ${top + 2}Z' fill='${c.roof}'/>
      <rect x='${x + w / 2 - 6}' y='${top + 30}' width='12' height='24' rx='6' fill='${c.win}'/><rect x='${x + w / 2 - 6}' y='${top + 80}' width='12' height='24' rx='6' fill='${c.win}'/>`;
    return scene(`<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.sky[0]}'/><stop offset='0.7' stop-color='${c.sky[1]}'/><stop offset='1' stop-color='${c.sky[2]}'/></linearGradient></defs>
      <rect width='1600' height='470' fill='url(#s)'/>
      ${fire ? `<circle cx='1350' cy='110' r='34' fill='#e89a6a' opacity='0.8'/>` : night ? Array.from({ length: 50 }, (_, i) => `<circle cx='${(i * 337) % 1600}' cy='${(i * 131) % 300}' r='${1 + (i % 3) * 0.6}' fill='#fff' opacity='${0.4 + (i % 4) * 0.15}'/>`).join('') + `<circle cx='1350' cy='110' r='34' fill='#f4f0dc'/>` : `<g fill='#fff' opacity='0.85'><ellipse cx='1250' cy='120' rx='90' ry='26'/><ellipse cx='1310' cy='104' rx='60' ry='26'/><ellipse cx='420' cy='90' rx='70' ry='20'/></g>`}
      <path d='M0 470 Q200 420 400 450 T800 440 T1200 450 T1600 430 V520 H0Z' fill='${c.trees}'/>
      ${tower(250, 70, 200, 470)}${tower(1130, 70, 200, 470)}
      <rect x='320' y='280' width='810' height='190' fill='${c.stone}'/><path d='M310 284 L420 200 L1030 200 L1140 284Z' fill='${c.roof}'/>
      ${tower(690, 90, 150, 470)}
      ${[360, 430, 500, 570, 640, 820, 890, 960, 1030, 1090].map((x) => `<rect x='${x}' y='320' width='26' height='44' rx='13' fill='${c.win}'/><rect x='${x}' y='392' width='26' height='44' fill='${c.win}'/>`).join('')}
      ${[460, 600, 880, 1000].map((x) => `<path d='M${x} 236 h26 v-22 l-13 -12 l-13 12Z' fill='${c.stone}'/><rect x='${x + 7}' y='218' width='12' height='14' fill='${c.win}'/>`).join('')}
      ${fire ? revolution() : ''}
      <rect x='0' y='470' width='1600' height='430' fill='${c.lawn}'/>
      <path d='M700 470 L900 470 L1200 900 L400 900Z' fill='${c.path}'/>
      ${[[120, 520, 260], [1220, 520, 260], [60, 640, 360], [1180, 640, 360]].map(([x, y, w]) => `<rect x='${x}' y='${y}' width='${w}' height='40' rx='16' fill='${c.hedge}'/><path d='M${x + 20} ${y + 20} h${w - 40}' stroke='${night ? '#2a4a30' : '#5a8a3e'}' stroke-width='6'/>`).join('')}
      ${[[560, 520], [1040, 520], [470, 640], [1130, 640]].map(([x, y]) => `<path d='M${x} ${y + 60} Q${x - 26} ${y + 30} ${x} ${y - 40} Q${x + 26} ${y + 30} ${x} ${y + 60}Z' fill='${c.hedge}'/>`).join('')}
      <ellipse cx='800' cy='560' rx='110' ry='26' fill='${night ? '#3a4a6a' : '#cfe4f0'}' stroke='${c.stone}' stroke-width='8'/><rect x='790' y='500' width='20' height='60' fill='${c.stone}'/><path d='M800 500 Q770 470 760 520 M800 500 Q830 470 840 520 M800 500 V460' stroke='${night ? '#9ab' : '#fff'}' stroke-width='4' fill='none' opacity='0.8'/>`);
  }
  // The château after the mob got to it: smoke over everything, the roof fallen in on the right
  // with the rafters showing and flames pouring out, the windows smashed (fire behind most of them,
  // a few burnt out), soot over the stone, and flames licking out of the towers.
  function revolution() {
    const flame = (x, base, h, w) => `<path d='M${x - w} ${base} Q${x - w * 1.1} ${base - h * 0.45} ${x - w * 0.35} ${base - h * 0.62} Q${x - w * 0.15} ${base - h * 0.85} ${x} ${base - h} Q${x + w * 0.2} ${base - h * 0.7} ${x + w * 0.55} ${base - h * 0.78} Q${x + w * 1.1} ${base - h * 0.4} ${x + w} ${base}Z' fill='#ff5a14'/>
      <path d='M${x - w * 0.6} ${base} Q${x - w * 0.6} ${base - h * 0.4} ${x - w * 0.1} ${base - h * 0.55} Q${x + w * 0.15} ${base - h * 0.4} ${x + w * 0.3} ${base - h * 0.5} Q${x + w * 0.65} ${base - h * 0.3} ${x + w * 0.6} ${base}Z' fill='#ffb02a'/>
      <path d='M${x - w * 0.3} ${base} Q${x - w * 0.2} ${base - h * 0.25} ${x} ${base - h * 0.32} Q${x + w * 0.25} ${base - h * 0.2} ${x + w * 0.3} ${base}Z' fill='#fff1a8'/>`;
    // Broken panes: jagged shards left in the frame.
    const shards = (x, y, w) => `<path d='M${x} ${y} h${w} v14 l-${w * 0.25} -8 l-${w * 0.2} 12 l-${w * 0.25} -10 l-${w * 0.15} 8 l-${w * 0.15} -6Z M${x} ${y + 44} v-12 l${w * 0.3} 8 l${w * 0.2} -10 l${w * 0.3} 9 l${w * 0.2} -7 v12Z' fill='#140a06'/>`;
    const lower = [360, 430, 500, 570, 640, 820, 890, 960, 1030, 1090];
    let out = `<path d='M0 470 L0 300 Q400 380 800 360 T1600 300 V470Z' fill='#ff6a1a' opacity='0.12'/>`;
    // Soot up the walls above the windows.
    out += lower.map((x) => `<ellipse cx='${x + 13}' cy='316' rx='22' ry='26' fill='#1a100c' opacity='0.45'/>`).join('');
    out += lower.map((x, i) => shards(x, 320, 26) + shards(x, 392, 26) + (i % 3 === 1 ? `<rect x='${x}' y='392' width='26' height='44' fill='#1a0d08' opacity='0.85'/>` : '')).join('');
    // Fire out of the windows.
    out += [430, 570, 890, 1030].map((x) => flame(x + 13, 330, 60, 16)).join('') + [500, 960].map((x) => flame(x + 13, 404, 50, 14)).join('');
    // The roof caved in, right of the centre tower: a black hole, the charred rafters across it.
    out += `<path d='M800 284 L812 250 L834 262 L852 214 L874 246 L898 204 L922 238 L946 210 L968 248 L992 226 L1012 268 L1030 284Z' fill='#0e0604'/>`;
    out += [[820, 284, 860, 218], [870, 284, 905, 208], [930, 284, 950, 214], [985, 284, 1000, 232]].map(([a, b, c2, d]) => `<line x1='${a}' y1='${b}' x2='${c2}' y2='${d}' stroke='#2a140a' stroke-width='7' stroke-linecap='round'/>`).join('');
    out += `<line x1='830' y1='240' x2='1000' y2='236' stroke='#2a140a' stroke-width='6'/>`;
    out += flame(915, 286, 230, 90) + flame(850, 286, 140, 40) + flame(990, 286, 160, 44);
    // The left tower's top window, and the far tower's roof alight too.
    out += flame(285, 236, 70, 18) + flame(1165, 236, 60, 16) + flame(1150, 200, 90, 30);
    // Smoke, rolling up and away to the left.
    out += [[930, 120, 150, 70, 0.75], [780, 60, 200, 80, 0.6], [560, 30, 260, 70, 0.45], [1120, 120, 90, 50, 0.6], [300, 20, 300, 60, 0.35]]
      .map(([x, y, rx, ry, o]) => `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='#2a1e1e' opacity='${o}'/>`).join('');
    // The glow on the lawn, and the fountain red.
    out += `<ellipse cx='800' cy='500' rx='700' ry='60' fill='#ff6a1a' opacity='0.15'/>`;
    return out;
  }

  // The gaming salon at Monte Carlo: cream walls panelled in gilt between gold pilasters, tall
  // arched windows onto the harbour at night (yachts lit up, the lights of the Rock), red velvet
  // drapes, a painted ceiling and two crystal chandeliers.
  function monteCarlo() {
    const gold = '#d4a84a';
    const window_ = (x) => `<path d='M${x} 640 V300 Q${x} 220 ${x + 90} 220 Q${x + 180} 220 ${x + 180} 300 V640Z' fill='url(#sea)'/>
      ${[[0.2, 0.62], [0.55, 0.7], [0.8, 0.6]].map(([fx, fy]) => `<g transform='translate(${x + 180 * fx} ${220 + 420 * fy})'><path d='M-18 0 h36 l-6 8 h-24Z' fill='#e8eef4'/><rect x='-8' y='-8' width='14' height='8' fill='#e8eef4'/>${[-12, -4, 4, 12].map((d) => `<circle cx='${d}' cy='-3' r='1.6' fill='#ffe9a8'/>`).join('')}<path d='M-14 12 h28' stroke='#ffe9a8' stroke-width='1.5' opacity='0.5'/></g>`).join('')}
      ${Array.from({ length: 14 }, (_, i) => `<circle cx='${x + 10 + ((i * 53) % 160)}' cy='${470 + ((i * 29) % 40)}' r='1.8' fill='#ffd98a'/>`).join('')}
      <path d='M${x} 640 V300 Q${x} 220 ${x + 90} 220 Q${x + 180} 220 ${x + 180} 300 V640' fill='none' stroke='${gold}' stroke-width='10'/>
      <path d='M${x + 90} 222 V640 M${x} 420 H${x + 180}' stroke='${gold}' stroke-width='5'/>
      <path d='M${x - 40} 180 Q${x - 10} 400 ${x - 30} 660 L${x + 30} 660 Q${x + 10} 400 ${x + 20} 200Z M${x + 220} 180 Q${x + 190} 400 ${x + 210} 660 L${x + 150} 660 Q${x + 170} 400 ${x + 160} 200Z' fill='#8a1420'/>
      <path d='M${x - 50} 170 H${x + 230} V200 Q${x + 90} 240 ${x - 50} 200Z' fill='#a01a28'/><path d='M${x - 50} 200 Q${x + 90} 240 ${x + 230} 200' stroke='${gold}' stroke-width='4' fill='none'/>`;
    const pilaster = (x) => `<rect x='${x}' y='150' width='44' height='560' fill='#e9d49a'/><rect x='${x + 8}' y='170' width='28' height='520' fill='none' stroke='${gold}' stroke-width='3'/>
      <rect x='${x - 8}' y='140' width='60' height='20' fill='${gold}'/><rect x='${x - 8}' y='700' width='60' height='16' fill='${gold}'/><path d='M${x + 6} 160 q16 -18 32 0' stroke='#a07a2a' stroke-width='3' fill='none'/>`;
    const panel = (x, w) => `<rect x='${x}' y='280' width='${w}' height='330' rx='6' fill='#f2e4c2' stroke='${gold}' stroke-width='5'/><rect x='${x + 14}' y='294' width='${w - 28}' height='302' rx='4' fill='none' stroke='${gold}' stroke-width='2'/>
      <path d='M${x + w / 2 - 30} 300 q30 -16 60 0 q-30 10 -60 0Z' fill='${gold}'/>`;
    const chandelier = (x) => `<path d='M${x} 0 V70' stroke='${gold}' stroke-width='3'/>
      <ellipse cx='${x}' cy='120' rx='130' ry='70' fill='rgba(255, 230, 170, 0.25)'/>
      <path d='M${x - 90} 100 Q${x} 150 ${x + 90} 100 M${x - 60} 80 Q${x} 115 ${x + 60} 80' stroke='${gold}' stroke-width='4' fill='none'/>
      ${[-90, -60, -30, 0, 30, 60, 90].map((d, i) => `<path d='M${x + d} ${i % 2 ? 84 : 102} v16' stroke='#fff8e0' stroke-width='4'/><circle cx='${x + d}' cy='${i % 2 ? 80 : 98}' r='5' fill='#ffe7a0'/>
        ${[0, 1, 2].map((k) => `<path d='M${x + d} ${(i % 2 ? 104 : 122) + k * 12} l-3 6 l3 6 l3 -6Z' fill='#f4f8ff' opacity='0.85'/>`).join('')}`).join('')}
      <path d='M${x - 20} 70 h40 l-10 30 h-20Z' fill='${gold}'/><circle cx='${x}' cy='140' r='8' fill='#f4f8ff'/>`;
    return scene(`<defs><linearGradient id='sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0a1030'/><stop offset='0.55' stop-color='#1e2a5a'/><stop offset='0.56' stop-color='#0a1838'/><stop offset='1' stop-color='#06102a'/></linearGradient>
      <linearGradient id='ceil' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#b48a3e'/><stop offset='1' stop-color='#e6cf96'/></linearGradient></defs>
      <rect width='1600' height='900' fill='#efdcae'/>
      <rect width='1600' height='150' fill='url(#ceil)'/>
      ${[200, 560, 1040, 1400].map((x) => `<ellipse cx='${x}' cy='60' rx='150' ry='46' fill='#9ab4d0' stroke='${gold}' stroke-width='6'/><ellipse cx='${x - 30}' cy='54' rx='50' ry='16' fill='#f4f0e4' opacity='0.8'/>`).join('')}
      <path d='M0 140 H1600 V160 H0Z' fill='${gold}'/>${Array.from({ length: 40 }, (_, i) => `<rect x='${i * 40 + 12}' y='160' width='16' height='12' fill='#a07a2a'/>`).join('')}
      ${panel(40, 150)}${window_(330)}${panel(725, 150)}${window_(1090)}${panel(1410, 150)}
      ${[10, 250, 600, 920, 1000, 1350, 1560].map(pilaster).join('')}
      <rect y='710' width='1600' height='190' fill='#5a0e18'/><rect y='706' width='1600' height='10' fill='${gold}'/>
      ${chandelier(500)}${chandelier(1100)}`);
  }

  // The tournament field below the castle: the keep up on its hill, striped pavilions with pennants
  // flying, a timber grandstand hung with shields and banners and full of people, and the lists
  // (the tilting ground) in green turf in front.
  function tournament() {
    const pavilion = (x, w, c1, c2) => `<path d='M${x} 470 V400 L${x + w / 2} 330 L${x + w} 400 V470Z' fill='${c1}'/>
      ${Array.from({ length: 4 }, (_, i) => `<path d='M${x + (i * w) / 4} 400 L${x + w / 2} 330 L${x + ((i + 0.5) * w) / 4} 400 V470 H${x + (i * w) / 4}Z' fill='${c2}'/>`).join('')}
      <path d='M${x} 400 L${x + w / 2} 330 L${x + w} 400' fill='none' stroke='#5a3a1e' stroke-width='3'/>
      ${Array.from({ length: 8 }, (_, i) => `<path d='M${x + (i * w) / 8} 400 l${w / 16} 10 l${w / 16} -10' fill='${i % 2 ? c1 : c2}'/>`).join('')}
      <path d='M${x + w / 2} 330 V290' stroke='#3a2a1a' stroke-width='3'/><path d='M${x + w / 2} 292 l34 8 l-34 8Z' fill='${c2}'/>
      <path d='M${x + w * 0.4} 470 Q${x + w / 2} 420 ${x + w * 0.6} 470Z' fill='#2a1a10'/>`;
    const stands = () => {
      let out = `<rect x='420' y='370' width='760' height='110' fill='#6b4524'/><path d='M400 370 L800 300 L1200 370Z' fill='#8e1b1b'/>
        ${Array.from({ length: 12 }, (_, i) => `<path d='M${420 + i * 63} 370 l31 14 l32 -14' fill='${i % 2 ? '#d4af37' : '#1b3f8e'}'/>`).join('')}`;
      for (let row = 0; row < 3; row++) {
        out += `<rect x='430' y='${395 + row * 26}' width='740' height='4' fill='#4a2e17'/>`;
        for (let i = 0; i < 46; i++) {
          const x = 440 + i * 16 + (row % 2) * 8;
          out += `<circle cx='${x}' cy='${388 + row * 26}' r='6' fill='${['#e2b48a', '#c99068', '#8a5a3a', '#f0c8a0'][(i + row) % 4]}'/><rect x='${x - 6}' y='${393 + row * 26}' width='12' height='8' rx='3' fill='${['#8e1b1b', '#1b3f8e', '#2a6a3a', '#d4af37', '#5a2a6a'][(i * 3 + row) % 5]}'/>`;
        }
      }
      out += [470, 640, 800, 960, 1130].map((x, i) => `<path d='M${x - 18} 462 h36 v18 q-18 18 -36 0Z' fill='${['#8e1b1b', '#1b3f8e', '#d4af37', '#2a6a3a', '#8e1b1b'][i]}' stroke='#d4af37' stroke-width='2'/>`).join('');
      return out;
    };
    return scene(`<defs><linearGradient id='ts' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#4a86c8'/><stop offset='1' stop-color='#cfe4f4'/></linearGradient></defs>
      <rect width='1600' height='480' fill='url(#ts)'/>
      <g fill='#fff' opacity='0.9'><ellipse cx='260' cy='110' rx='110' ry='30'/><ellipse cx='330' cy='92' rx='70' ry='30'/><ellipse cx='1320' cy='80' rx='90' ry='24'/></g>
      <path d='M0 330 Q300 250 620 300 T1200 280 T1600 300 V480 H0Z' fill='#6a9a4a'/>
      <g fill='#8a8aa0'><rect x='1040' y='170' width='170' height='130'/><rect x='1020' y='120' width='46' height='180'/><rect x='1186' y='120' width='46' height='180'/><rect x='1100' y='90' width='50' height='120'/>
        ${[1020, 1186].map((x) => [0, 1, 2].map((k) => `<rect x='${x + k * 17}' y='110' width='12' height='12'/>`).join('')).join('')}</g>
      <path d='M1043 120 L1043 86 L1062 100Z M1209 120 L1209 86 L1228 100Z M1125 90 V50' stroke='#5a5a6a' stroke-width='3' fill='#8e1b1b'/><path d='M1125 52 l30 8 l-30 8Z' fill='#d4af37'/>
      <rect x='1110' y='250' width='30' height='50' rx='15' fill='#3a3a4a'/>
      ${pavilion(60, 170, '#f4efe0', '#8e1b1b')}${pavilion(250, 140, '#f4efe0', '#1b3f8e')}${pavilion(1240, 150, '#f4efe0', '#2a6a3a')}${pavilion(1420, 160, '#f4efe0', '#d4af37')}
      ${stands()}
      <rect y='480' width='1600' height='420' fill='#4f8a3a'/>
      ${Array.from({ length: 9 }, (_, i) => `<rect y='${500 + i * 46}' width='1600' height='22' fill='#5a9442' opacity='0.6'/>`).join('')}
      <rect y='560' width='1600' height='16' fill='#c9a86a'/>${Array.from({ length: 32 }, (_, i) => `<rect x='${i * 50 + 20}' y='540' width='10' height='40' fill='#8a6a3a'/>`).join('')}`);
  }

  // The Darts Palace: a championship arena in the dark, the crowd in tiers all the way up (their
  // phones lit, signs held up), the stage lit from above, and an LED strip along the stage front.
  function palace() {
    let crowd = '';
    for (let row = 0; row < 7; row++) {
      const y = 200 + row * 70;
      const r = 12 + row * 2.2;
      for (let x = (row % 2) * 18; x < 1600; x += r * 2.6) {
        const lit = (x * 7 + row * 13) % 23 === 0;
        crowd += `<circle cx='${x}' cy='${y}' r='${r}' fill='${row < 3 ? '#1a1530' : '#221a3a'}'/><rect x='${x - r}' y='${y + r * 0.7}' width='${r * 2}' height='${r * 2}' rx='${r * 0.6}' fill='${row < 3 ? '#1a1530' : '#221a3a'}'/>`;
        if (lit) crowd += `<rect x='${x + r * 0.6}' y='${y - r * 1.6}' width='${r * 0.5}' height='${r * 0.8}' fill='#e8f4ff' opacity='0.9'/>`;
        if ((x * 3 + row * 17) % 89 === 0) crowd += `<rect x='${x - r * 1.6}' y='${y - r * 2.6}' width='${r * 3.2}' height='${r * 1.8}' fill='${['#ffd23f', '#ff4d8a', '#3de0ff', '#fff'][(row + Math.round(x)) % 4]}'/>`;
      }
    }
    return scene(`<defs><radialGradient id='pg' cx='0.5' cy='0' r='1'><stop offset='0' stop-color='#3a2a6a'/><stop offset='0.6' stop-color='#120e24'/><stop offset='1' stop-color='#06050c'/></radialGradient>
      <linearGradient id='beam' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='0.35'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>
      <rect width='1600' height='900' fill='url(#pg)'/>
      ${[200, 520, 1080, 1400].map((x) => `<path d='M${x - 14} 0 L${x + 14} 0 L${x + 160} 760 L${x - 160} 760Z' fill='url(#beam)' opacity='0.5'/>`).join('')}
      ${Array.from({ length: 16 }, (_, i) => `<circle cx='${50 + i * 100}' cy='40' r='9' fill='#fff8e0'/><circle cx='${50 + i * 100}' cy='40' r='22' fill='#fff8e0' opacity='0.15'/>`).join('')}
      ${crowd}
      <rect y='740' width='1600' height='160' fill='#0a0814'/><rect y='740' width='1600' height='14' fill='#ff2a8a'/><rect y='754' width='1600' height='6' fill='#3de0ff'/>
      ${Array.from({ length: 40 }, (_, i) => `<rect x='${i * 40 + 6}' y='776' width='28' height='10' rx='2' fill='${i % 2 ? '#ffd23f' : '#3de0ff'}' opacity='0.5'/>`).join('')}`);
  }

  // ---------- The beer tent at Oktoberfest ----------
  // Under the canvas: blue and white stripes overhead, hop garlands and pretzels hanging, the oompah
  // band up on the stage at the back, long tables full of people, and the tent poles.
  function oktoberfest() {
    let out = `<rect width='1600' height='900' fill='#f4e7c8'/>`;
    for (let i = 0; i < 20; i++) out += `<path d='M${i * 80} 0 L${i * 80 + 40} 0 L800 300 Z' fill='${i % 2 ? '#2a6fdb' : '#f8fbff'}'/>`;
    out += `<path d='M0 0 H1600 V40 L800 300 L0 40Z' fill='none'/><rect y='280' width='1600' height='30' fill='#c9a46a'/>`;
    for (let k = 0; k < 4; k++) {
      const x0 = k * 400;
      out += `<path d='M${x0} 120 Q${x0 + 200} 220 ${x0 + 400} 120' stroke='#3e7a3a' stroke-width='14' fill='none'/>`;
      for (let j = 1; j < 8; j++) out += `<circle cx='${x0 + j * 50}' cy='${120 + Math.sin((j / 8) * Math.PI) * 50}' r='8' fill='#6aa84f'/>`;
      out += `<g transform='translate(${x0 + 200} 190)'><path d='M0 0 V30' stroke='#6b4524' stroke-width='2'/><path d='M-26 52 Q-30 26 0 30 Q30 26 26 52 Q14 72 0 52 Q-14 72 -26 52Z M-12 48 Q0 38 12 48' fill='none' stroke='#8a4a1a' stroke-width='9' stroke-linecap='round'/></g>`;
    }
    out += `<rect x='560' y='330' width='480' height='160' fill='#6b4524'/><rect x='560' y='330' width='480' height='16' fill='#2a6fdb'/>`;
    out += [620, 700, 780, 860, 940].map((x, i) => `<circle cx='${x}' cy='395' r='16' fill='#e2b48a'/><path d='M${x - 18} 430 q18 -24 36 0 V490 H${x - 18}Z' fill='${i % 2 ? '#2a4a2a' : '#5a3a1e'}'/><path d='M${x - 16} 384 h32 l-4 -10 h-24Z' fill='#2a4a2a'/>`).join('');
    out += `<circle cx='860' cy='440' r='34' fill='none' stroke='#d4af37' stroke-width='10'/><path d='M700 430 l40 -12 v26Z' fill='#d4af37'/>`;
    for (let row = 0; row < 3; row++) {
      const y = 520 + row * 110;
      out += `<rect x='0' y='${y + 40}' width='1600' height='24' fill='#8a5a2a'/><rect x='0' y='${y + 64}' width='1600' height='8' fill='#5a3a1a'/>`;
      for (let x = 30 + (row % 2) * 40; x < 1600; x += 80) out += `<circle cx='${x}' cy='${y + 10}' r='18' fill='${['#e2b48a', '#c99068', '#f0c8a0'][(x / 10 + row) % 3 | 0]}'/><rect x='${x - 22}' y='${y + 24}' width='44' height='30' rx='8' fill='${['#c0392b', '#2a6fdb', '#2a6a3a', '#f4f4f4'][(x / 20 + row) % 4 | 0]}'/><rect x='${x + 16}' y='${y + 18}' width='14' height='22' rx='2' fill='#f4c430' stroke='#fff' stroke-width='3'/>`;
    }
    out += [160, 1440].map((x) => `<rect x='${x - 14}' y='0' width='28' height='900' fill='#7a5230'/><rect x='${x - 14}' y='0' width='8' height='900' fill='#9a6a40'/>`).join('');
    return scene(out);
  }

  // ---------- The wasteland ----------
  // The saloon's town after the end of the world: a rust-orange sky and a dust haze, the burnt-out
  // shells of the buildings, wrecked cars, oil drums on fire and a skull up on a pole.
  function wasteland() {
    let out = `<defs><linearGradient id='ws' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#4a1e0a'/><stop offset='0.5' stop-color='#c2561e'/><stop offset='1' stop-color='#f0a050'/></linearGradient></defs>
      <rect width='1600' height='900' fill='url(#ws)'/><circle cx='1200' cy='300' r='120' fill='#ffd8a0' opacity='0.6'/>
      <path d='M0 560 Q200 500 420 540 T900 520 T1600 540 V900 H0Z' fill='#a8582a'/>`;
    const shell = (x, w, h) => `<path d='M${x} 600 V${600 - h} l${w * 0.2} 20 l${w * 0.15} -30 l${w * 0.25} 40 l${w * 0.2} -24 l${w * 0.2} 10 V600Z' fill='#3a1e12'/>
      ${[0.2, 0.55].map((f) => `<rect x='${x + w * f}' y='${600 - h + 50}' width='${w * 0.18}' height='40' fill='#1a0c06'/>`).join('')}`;
    out += shell(80, 260, 220) + shell(380, 200, 160) + shell(1050, 240, 200) + shell(1330, 220, 250);
    out += `<path d='M0 600 Q400 580 800 610 T1600 590 V900 H0Z' fill='#c8783a'/>`;
    const wreck = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M0 0 h40 l30 -30 h90 l40 30 h40 v34 h-240Z' fill='#2a1a12'/><circle cx='50' cy='36' r='18' fill='#140a06'/><circle cx='190' cy='36' r='18' fill='#140a06'/><path d='M80 -26 l20 10 l10 -12' stroke='#8a3a1a' stroke-width='4' fill='none'/></g>`;
    out += wreck(560, 700, 1) + wreck(1180, 760, 0.8);
    out += [[300, 760], [1500, 740], [900, 800]].map(([x, y]) => `<rect x='${x}' y='${y}' width='50' height='70' rx='4' fill='#5a2a12'/><rect x='${x}' y='${y + 20}' width='50' height='6' fill='#3a1a0a'/><ellipse cx='${x + 25}' cy='${y - 10}' rx='40' ry='30' fill='#ff9a2a' opacity='0.35'/>`).join('');
    out += `<path d='M1420 760 V560' stroke='#3a1e12' stroke-width='8'/><circle cx='1420' cy='540' r='24' fill='#e8dcc0'/><circle cx='1411' cy='536' r='6' fill='#2a1a12'/><circle cx='1429' cy='536' r='6' fill='#2a1a12'/><rect x='1410' y='552' width='20' height='8' fill='#2a1a12'/>`;
    out += `<rect width='1600' height='900' fill='#e0904a' opacity='0.12'/>`;
    return scene(out);
  }

  // ---------- The mechanic's garage ----------
  // A working garage: a car up on the lift, tools on the pegboard, the roll-up door open on the
  // daylight, a red tool chest, tyres stacked, an oil drum, and a neon OPEN sign.
  function garage() {
    let out = `<rect width='1600' height='900' fill='#5a6672'/>
      <rect y='0' width='1600' height='120' fill='#3e4852'/>${Array.from({ length: 8 }, (_, i) => `<rect x='${i * 200 + 60}' y='40' width='120' height='16' rx='8' fill='#f4f8ff'/><rect x='${i * 200 + 40}' y='56' width='160' height='60' fill='#f4f8ff' opacity='0.06'/>`).join('')}
      <rect x='60' y='200' width='420' height='260' fill='#c8a06a'/>${Array.from({ length: 13 * 8 }, (_, i) => `<circle cx='${80 + (i % 13) * 32}' cy='${220 + Math.floor(i / 13) * 32}' r='3' fill='#8a6a3a'/>`).join('')}
      <g fill='#2a3038'><path d='M100 240 h12 v120 h-12Z M94 232 h24 v18 h-24Z'/><path d='M150 240 h10 v100 h-10Z M144 232 h22 v16 h-22Z'/><path d='M196 236 h12 v80 h-12Z M186 228 h32 v14 h-32Z'/>
        <path d='M250 240 l60 0 l-6 14 l-48 0Z M276 254 h8 v110 h-8Z'/><circle cx='370' cy='280' r='34' fill='none' stroke='#2a3038' stroke-width='8'/><path d='M420 240 v150 M440 240 v150' stroke='#2a3038' stroke-width='6'/></g>
      <rect x='1120' y='180' width='420' height='420' fill='#dfe8ee'/><rect x='1120' y='180' width='420' height='420' fill='url(#day)'/>
      <defs><linearGradient id='day' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#9ccbe8'/><stop offset='0.6' stop-color='#e6f2f8'/><stop offset='0.61' stop-color='#9a9a8a'/><stop offset='1' stop-color='#7a7a6a'/></linearGradient></defs>
      ${Array.from({ length: 6 }, (_, i) => `<rect x='1120' y='${180 + i * 14}' width='420' height='10' fill='#a8b4be'/>`).join('')}
      <rect x='1110' y='170' width='440' height='14' fill='#3e4852'/><rect x='1110' y='170' width='14' height='440' fill='#3e4852'/><rect x='1536' y='170' width='14' height='440' fill='#3e4852'/>
      <rect y='600' width='1600' height='300' fill='#8a929a'/><ellipse cx='820' cy='760' rx='120' ry='20' fill='#3a3e44' opacity='0.5'/>
      <path d='M0 600 H1600' stroke='#ffd23f' stroke-width='10' stroke-dasharray='40 40'/>
      <rect x='600' y='300' width='14' height='310' fill='#c0392b'/><rect x='1000' y='300' width='14' height='310' fill='#c0392b'/><rect x='580' y='420' width='460' height='14' fill='#c0392b'/>
      <g transform='translate(560 300)'><path d='M0 120 h40 l50 -60 h190 l70 60 h120 v60 h-470Z' fill='#2a6fdb'/><path d='M100 70 l40 -46 h130 l50 46Z' fill='#bfe0f4'/><path d='M200 24 v46' stroke='#2a6fdb' stroke-width='8'/>
        <circle cx='100' cy='180' r='40' fill='#1a1a1a'/><circle cx='100' cy='180' r='16' fill='#aab'/><circle cx='380' cy='180' r='40' fill='#1a1a1a'/><circle cx='380' cy='180' r='16' fill='#aab'/><rect x='450' y='130' width='22' height='14' fill='#ffd23f'/></g>
      <rect x='60' y='480' width='220' height='130' rx='6' fill='#c0392b'/>${[0, 1, 2, 3].map((k) => `<rect x='70' y='${490 + k * 30}' width='200' height='24' rx='3' fill='#d8473a'/><rect x='150' y='${500 + k * 30}' width='40' height='5' rx='2' fill='#ccd'/>`).join('')}
      ${[0, 1, 2, 3].map((k) => `<ellipse cx='380' cy='${600 - k * 34}' rx='60' ry='20' fill='#1a1a1a'/><ellipse cx='380' cy='${596 - k * 34}' rx='30' ry='9' fill='#3a3a3a'/>`).join('')}
      <rect x='1460' y='620' width='70' height='100' rx='6' fill='#2a6a3a'/><rect x='1460' y='650' width='70' height='8' fill='#1a4a2a'/>`;
    return scene(out);
  }
  // Diamond-plate steel, for the garage's table.
  const plate = () => tile(40, 40, `<rect width='40' height='40' fill='#9aa4ae'/><path d='M6 10 l8 -4 l2 2 l-8 4Z M26 30 l8 -4 l2 2 l-8 4Z M26 10 l-8 -4 l-2 2 l8 4Z M6 30 l-8 -4' fill='#c8d0d8'/><path d='M7 12 l8 -4 M27 32 l8 -4 M25 12 l-8 -4' stroke='#6a747e' stroke-width='1'/>`);

  // ---------- The starship ----------
  // On the bridge of a ship between the stars: a wide viewport (the stars streaming past it are
  // drawn on the TV, see public/scenery.js), panelled bulkheads with pipes and vents, a row of
  // consoles under the viewport blinking away, and the deck plating below.
  function starship() {
    let out = `<defs><linearGradient id='hull' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a4458'/><stop offset='1' stop-color='#232a3a'/></linearGradient></defs>
      <rect width='1600' height='900' fill='url(#hull)'/>
      <rect y='0' width='1600' height='130' fill='#1c2230'/>${[0, 1, 2].map((k) => `<rect y='${30 + k * 30}' width='1600' height='12' rx='6' fill='#4a556a'/>`).join('')}
      ${Array.from({ length: 9 }, (_, i) => `<rect x='${i * 180 + 40}' y='100' width='100' height='16' rx='3' fill='#9fe8ff' opacity='0.8'/>`).join('')}
      <path d='M60 170 H1540 Q1580 170 1580 210 V440 Q1580 470 1540 470 H60 Q20 470 20 440 V210 Q20 170 60 170Z' fill='#02030a' stroke='#5a667e' stroke-width='14'/>
      ${[400, 800, 1200].map((x) => `<rect x='${x - 8}' y='170' width='16' height='300' fill='#5a667e'/>`).join('')}
      ${Array.from({ length: 70 }, (_, i) => `<circle cx='${40 + ((i * 263) % 1520)}' cy='${190 + ((i * 97) % 260)}' r='${0.8 + (i % 3) * 0.6}' fill='#fff' opacity='${0.4 + (i % 4) * 0.15}'/>`).join('')}
      <rect y='490' width='1600' height='190' fill='#2a3244'/>${Array.from({ length: 8 }, (_, i) => `<rect x='${i * 200 + 20}' y='500' width='160' height='170' rx='8' fill='#323c52' stroke='#1c2230' stroke-width='4'/><rect x='${i * 200 + 40}' y='520' width='120' height='10' rx='5' fill='#1c2230'/><circle cx='${i * 200 + 60}' cy='610' r='14' fill='#1c2230'/><circle cx='${i * 200 + 140}' cy='610' r='14' fill='#1c2230'/>`).join('')}
      <path d='M0 680 L1600 680 L1600 720 L0 720Z' fill='#141a26'/>
      ${Array.from({ length: 20 }, (_, i) => `<rect x='${i * 80 + 8}' y='690' width='64' height='22' rx='4' fill='#1e2636'/>${[0, 1, 2, 3].map((k) => `<rect x='${i * 80 + 14 + k * 14}' y='696' width='8' height='8' rx='2' fill='${['#7cf0ff', '#ffd23f', '#ff5c8a', '#7dff9e'][(i + k) % 4]}' opacity='0.9'/>`).join('')}`).join('')}
      <rect y='720' width='1600' height='180' fill='#1a2030'/>${Array.from({ length: 16 }, (_, i) => `<path d='M${i * 100} 720 V900' stroke='#2a3244' stroke-width='3'/>`).join('')}`;
    return scene(out);
  }

  // ---------- Noir ----------
  // A private eye's office after midnight, in black and white: the light through the venetian
  // blinds striping the wall, rain on the tall window, the city's towers beyond it and one red
  // neon sign buzzing outside, a fedora and a trench coat on the hat stand, a desk lamp's pool of
  // light. (The rain, the flicker and the headlights going by are on the TV: see scenery.js.)
  function noir() {
    let out = `<defs><linearGradient id='nw' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0c0c0e'/><stop offset='1' stop-color='#1e1e22'/></linearGradient>
      <linearGradient id='nc' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1a1a20'/><stop offset='1' stop-color='#3a3a42'/></linearGradient>
      <radialGradient id='nl' cx='0.5' cy='0.5' r='0.5'><stop offset='0' stop-color='#f4f0e0' stop-opacity='0.35'/><stop offset='1' stop-color='#f4f0e0' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='url(#nw)'/>`;
    // The window: the city in the rain, the neon sign.
    out += `<rect x='940' y='90' width='560' height='560' fill='url(#nc)'/>
      ${[[960, 360, 70], [1040, 300, 60], [1110, 420, 80], [1200, 250, 70], [1280, 380, 60], [1350, 310, 90], [1450, 400, 60]].map(([x, y, w]) => `<rect x='${x}' y='${y}' width='${w}' height='${650 - y}' fill='#0e0e12'/>${Array.from({ length: 12 }, (_, k) => `<rect x='${x + 8 + (k % 3) * (w / 3.4)}' y='${y + 16 + Math.floor(k / 3) * 40}' width='8' height='12' fill='#d8d4c4' opacity='${(k * 7 + x) % 5 ? 0.15 : 0.7}'/>`).join('')}`).join('')}
      <rect x='994' y='110' width='72' height='330' rx='10' fill='#0a0a0c' stroke='#ff2a3a' stroke-width='5'/>
      ${[...'HOTEL'].map((ch, i) => `<text x='1030' y='${170 + i * 60}' font-size='50' font-family='Georgia, serif' font-weight='700' text-anchor='middle' fill='#ff2a3a'>${ch}</text>`).join('')}
      <rect x='974' y='100' width='112' height='350' rx='14' fill='#ff2a3a' opacity='0.12'/>
      <rect x='930' y='80' width='580' height='580' fill='none' stroke='#08080a' stroke-width='22'/><path d='M1220 80 V660 M930 370 H1510' stroke='#08080a' stroke-width='14'/>`;
    // The blinds' shadow, slanting across the wall and the floor.
    out += Array.from({ length: 16 }, (_, i) => `<path d='M${-200 + i * 70} 900 L${360 + i * 70} 60 L${396 + i * 70} 60 L${-164 + i * 70} 900Z' fill='#e8e4d8' opacity='0.05'/>`).join('');
    // The hat stand, the coat and the fedora.
    out += `<path d='M210 760 V230' stroke='#0a0a0c' stroke-width='12'/><path d='M150 770 h120 M210 760 l-50 20 M210 760 l50 20' stroke='#0a0a0c' stroke-width='10'/>
      <path d='M170 270 Q150 300 160 520 L190 640 L240 640 L262 520 Q270 300 250 270 Q210 250 170 270Z' fill='#3a3830'/><path d='M200 280 L210 420 L222 280' fill='#2a2822'/>
      <ellipse cx='210' cy='236' rx='70' ry='14' fill='#141416'/><path d='M168 236 Q170 196 210 192 Q250 196 252 236Z' fill='#1a1a1c'/><rect x='170' y='222' width='80' height='8' fill='#5a5040'/>`;
    // The desk lamp and its pool of light.
    out += `<ellipse cx='620' cy='640' rx='300' ry='120' fill='url(#nl)'/><path d='M560 520 L600 470 L680 470 L720 520Z' fill='#1e3a2a'/><path d='M640 520 V640 M600 640 h80' stroke='#2a2a2a' stroke-width='8'/>`;
    out += `<rect y='700' width='1600' height='200' fill='#0a0a0c'/>`;
    return scene(out);
  }

  // ---------- The riverboat ----------
  // A Mississippi paddle steamer at dusk, from its gambling deck: white gingerbread columns and
  // railing framing the view, gas lamps lit, the river wide and gold under the sunset, cypress
  // and Spanish moss along the far bank. (The paddle wheel turning, the smoke from the stacks and
  // the steam whistle are on the TV: see public/scenery.js.)
  function riverboat() {
    let out = `<defs><linearGradient id='rs' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2a1a40'/><stop offset='0.4' stop-color='#a0485a'/><stop offset='0.75' stop-color='#f09050'/><stop offset='1' stop-color='#ffd08a'/></linearGradient>
      <linearGradient id='rv' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c0704a'/><stop offset='1' stop-color='#2a2a40'/></linearGradient></defs>
      <rect width='1600' height='470' fill='url(#rs)'/>
      <circle cx='980' cy='420' r='80' fill='#ffd88a' opacity='0.9'/>
      <path d='M0 470 L0 380 Q60 360 90 390 Q120 330 170 380 Q220 340 260 390 Q320 350 380 400 L460 410 Q520 370 600 410 L1600 410 V470Z' fill='#2a2a22'/>
      ${[[110, 340], [240, 350], [350, 365], [1400, 360], [1500, 345]].map(([x, y]) => `<path d='M${x} 420 V${y}' stroke='#2a2a22' stroke-width='10'/><path d='M${x - 30} ${y + 10} q30 -40 60 0' fill='#2a2a22'/>${[-20, 0, 20].map((d) => `<path d='M${x + d} ${y + 6} q4 30 -2 56' stroke='#6a7a5a' stroke-width='3' fill='none' opacity='0.8'/>`).join('')}`).join('')}
      <rect y='440' width='1600' height='260' fill='url(#rv)'/>
      ${Array.from({ length: 10 }, (_, i) => `<path d='M${i * 80 + 700} ${470 + i * 18} h${160 + i * 20}' stroke='#ffd08a' stroke-width='3' opacity='${0.6 - i * 0.05}'/>`).join('')}
      ${Array.from({ length: 7 }, (_, i) => `<path d='M0 ${500 + i * 28} Q400 ${492 + i * 28} 800 ${500 + i * 28} T1600 ${500 + i * 28}' stroke='#e8a070' stroke-width='2' fill='none' opacity='0.25'/>`).join('')}`;
    // The deck: a carved white railing, the columns and the arches between them, the lamps.
    out += `<rect y='0' width='1600' height='60' fill='#f4efe4'/><rect y='56' width='1600' height='8' fill='#c8a85a'/>
      ${[0, 400, 800, 1200].map((x) => `<path d='M${x + 30} 60 Q${x + 200} 150 ${x + 370} 60' fill='none' stroke='#f4efe4' stroke-width='14'/>${Array.from({ length: 9 }, (_, k) => `<circle cx='${x + 60 + k * 35}' cy='${66 + Math.sin((k / 8) * Math.PI) * 28}' r='6' fill='#f4efe4'/>`).join('')}`).join('')}
      ${[0, 400, 800, 1200, 1600].map((x) => `<rect x='${x - 16}' y='0' width='32' height='700' fill='#f4efe4'/><rect x='${x - 22}' y='60' width='44' height='18' fill='#e4dccb'/><rect x='${x - 22}' y='640' width='44' height='18' fill='#e4dccb'/>
        <g transform='translate(${x} 160)'><path d='M0 -40 V-10' stroke='#2a2a2a' stroke-width='3'/><path d='M-12 -10 h24 l-4 34 h-16Z' fill='#ffd88a' stroke='#2a2a2a' stroke-width='3'/><circle r='40' cy='8' fill='#ffd88a' opacity='0.18'/></g>`).join('')}
      <rect y='640' width='1600' height='20' fill='#f4efe4'/><rect y='700' width='1600' height='22' fill='#f4efe4'/>
      ${Array.from({ length: 64 }, (_, i) => `<path d='M${i * 25 + 12} 660 q-8 10 0 20 q8 10 0 20' stroke='#f4efe4' stroke-width='7' fill='none'/>`).join('')}
      <rect y='722' width='1600' height='178' fill='#6a2a1e'/>${Array.from({ length: 20 }, (_, i) => `<rect x='${i * 80}' y='722' width='78' height='178' fill='${i % 2 ? '#7a321f' : '#6a2a1e'}'/>`).join('')}`;
    return scene(out);
  }

  // ---------- The mead hall ----------
  // Slevens in the tavern: a Viking longhouse. The roof's great timbers meeting overhead, smoke
  // rising from the long fire pit down the middle, round shields painted in bold colours along the
  // walls with axes crossed between them, furs, and the long benches either side.
  function meadHall() {
    let out = `<defs><radialGradient id='mf' cx='0.5' cy='0.7' r='0.6'><stop offset='0' stop-color='#ff9a3a' stop-opacity='0.55'/><stop offset='1' stop-color='#ff9a3a' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='#1e130b'/>
      <path d='M0 0 L800 0 L800 40 L0 360Z M1600 0 L800 0 L800 40 L1600 360Z' fill='#2e1d10'/>
      ${Array.from({ length: 7 }, (_, i) => { const x = 60 + i * 115; return `<path d='M${x} ${330 - i * 42} L800 30' stroke='#4a2f17' stroke-width='14'/><path d='M${1600 - x} ${330 - i * 42} L800 30' stroke='#4a2f17' stroke-width='14'/>`; }).join('')}
      <path d='M0 360 L800 40 L1600 360' fill='none' stroke='#5a3a1c' stroke-width='26'/>
      <rect x='0' y='360' width='1600' height='300' fill='#3a2614'/>${Array.from({ length: 40 }, (_, i) => `<rect x='${i * 40}' y='360' width='38' height='300' fill='${['#3e2916', '#352312', '#42301a'][i % 3]}'/>`).join('')}
      ${[150, 420, 690, 910, 1180, 1450].map((x, i) => { const c = ['#8e1b1b', '#1b3f8e', '#d4af37', '#2a6a3a', '#f4efe0', '#8e1b1b'][i]; const c2 = ['#f4efe0', '#d4af37', '#1b3f8e', '#f4efe0', '#8e1b1b', '#1b3f8e'][i];
        return `<circle cx='${x}' cy='470' r='70' fill='${c}' stroke='#6a4a2a' stroke-width='10'/><path d='M${x - 70} 470 H${x + 70} M${x} 400 V540' stroke='${c2}' stroke-width='14'/><circle cx='${x}' cy='470' r='18' fill='#9aa0a6' stroke='#5a5a5a' stroke-width='4'/>`; }).join('')}
      ${[285, 555, 1045, 1315].map((x) => `<path d='M${x - 40} 420 L${x + 40} 540 M${x + 40} 420 L${x - 40} 540' stroke='#6a4a2a' stroke-width='8'/><path d='M${x - 52} 410 q14 -6 22 12 l-14 6Z M${x + 52} 410 q-14 -6 -22 12 l14 6Z' fill='#b8bec6'/>`).join('')}
      ${[0, 1500].map((x) => `<path d='M${x} 360 q50 40 100 0 v220 q-50 30 -100 0Z' fill='#7a5a3a' opacity='0.8'/>`).join('')}
      <rect x='0' y='660' width='1600' height='240' fill='#24170c'/>
      <rect x='0' y='640' width='1600' height='30' fill='#5a3a1c'/>
      <path d='M560 760 Q800 720 1040 760 L1080 830 Q800 870 520 830Z' fill='#3a2a1e'/>${Array.from({ length: 12 }, (_, i) => `<ellipse cx='${560 + i * 44}' cy='${790 + (i % 3) * 8}' rx='20' ry='9' fill='#5a5a5a'/>`).join('')}
      <path d='M620 800 Q700 640 760 760 Q800 560 850 750 Q900 640 980 800Z' fill='#ff7a1a'/><path d='M680 800 Q740 700 790 770 Q820 660 860 770 Q900 710 930 800Z' fill='#ffc23a'/>
      <rect width='1600' height='900' fill='url(#mf)'/>
      <path d='M800 560 Q760 400 820 260 Q860 160 800 40' stroke='#6a5a50' stroke-width='60' fill='none' opacity='0.18' stroke-linecap='round'/>`;
    return scene(out);
  }

  // ---------- The roller rink ----------
  // Quarters in the diner: next door's 80s roller rink. A glossy wood rink under a disco ball, a
  // neon RINK sign and a skate-rental counter, the carpet's wild pattern, and coloured light.
  function rink() {
    let out = `<defs><linearGradient id='rw' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1a0a30'/><stop offset='1' stop-color='#3a1260'/></linearGradient></defs>
      <rect width='1600' height='900' fill='url(#rw)'/>
      ${Array.from({ length: 30 }, (_, i) => `<path d='M${i * 60} 0 l30 60 l30 -60' fill='none' stroke='${['#ff2bd6', '#29f0ff', '#ffd23f'][i % 3]}' stroke-width='5' opacity='0.5'/>`).join('')}
      <path d='M0 520 Q800 440 1600 520 V900 H0Z' fill='#c8884a'/>
      ${Array.from({ length: 24 }, (_, i) => `<path d='M${i * 70 - 100} 900 Q${800 + (i - 12) * 20} 470 ${i * 70 + 200} 520' stroke='#a8682a' stroke-width='2' fill='none' opacity='0.5'/>`).join('')}
      <path d='M0 520 Q800 440 1600 520' stroke='#ffd23f' stroke-width='8' fill='none'/><path d='M0 540 Q800 460 1600 540' stroke='#ff2bd6' stroke-width='4' fill='none' opacity='0.7'/>
      <ellipse cx='800' cy='640' rx='600' ry='110' fill='#fff' opacity='0.12'/>
      <path d='M800 0 V110' stroke='#ccc' stroke-width='3'/><circle cx='800' cy='160' r='52' fill='#c8d0dc'/>
      ${Array.from({ length: 40 }, (_, i) => `<rect x='${760 + (i % 8) * 10}' y='${116 + Math.floor(i / 8) * 18}' width='8' height='8' fill='${['#fff', '#9fe8ff', '#ffc8f0'][i % 3]}' opacity='0.9'/>`).join('')}
      <rect x='90' y='240' width='300' height='120' rx='18' fill='none' stroke='#29f0ff' stroke-width='10'/><text x='240' y='325' font-size='72' font-family='Arial Rounded MT Bold, system-ui' text-anchor='middle' fill='#29f0ff' font-weight='700'>RINK</text>
      <rect x='1180' y='300' width='360' height='200' fill='#2a1040'/><rect x='1180' y='300' width='360' height='40' fill='#ff2bd6'/><text x='1360' y='330' font-size='28' font-family='system-ui' text-anchor='middle' fill='#fff' font-weight='700'>SKATE RENTAL</text>
      ${Array.from({ length: 6 }, (_, i) => `<g transform='translate(${1205 + i * 55} 380)'><path d='M0 0 h20 v26 h18 v14 h-38Z' fill='${['#fff', '#ff2bd6', '#29f0ff'][i % 3]}'/><circle cx='8' cy='46' r='6' fill='#ffd23f'/><circle cx='30' cy='46' r='6' fill='#ffd23f'/></g>`).join('')}
      ${[[200, 180, '#ff2bd6'], [1400, 200, '#29f0ff'], [500, 120, '#ffd23f'], [1100, 130, '#9b5cff']].map(([x, y, c]) => `<path d='M800 160 L${x - 80} 900 L${x + 80} 900Z' fill='${c}' opacity='0.08'/>`).join('')}`;
    return scene(out);
  }

  // ---------- The frat house ----------
  // The basement on a Friday: fake wood panelling, the letters over the door (Beta Omega Omega
  // Lambda: BOOL), string lights sagging, a battered couch, a keg in a bin of ice, pennants and a
  // flag, and red cups everywhere.
  function frat(championship = false) {
    let out = `<rect width='1600' height='900' fill='#5a3a22'/>`;
    for (let x = 0; x < 1600; x += 64) out += `<rect x='${x}' y='0' width='60' height='900' fill='${['#6b4528', '#5e3c22', '#734b2c'][(x / 64) % 3]}'/><rect x='${x + 60}' y='0' width='4' height='900' fill='#3a2414'/>`;
    out += `<rect y='0' width='1600' height='60' fill='#2a1a10'/>`;
    out += `<path d='M0 90 Q200 150 400 90 T800 90 T1200 90 T1600 90' stroke='#1a1a1a' stroke-width='2' fill='none'/>${Array.from({ length: 32 }, (_, i) => { const x = 25 + i * 50; const y = 90 + 30 * Math.abs(Math.sin(((x % 400) / 400) * Math.PI)); return `<circle cx='${x}' cy='${y + 6}' r='7' fill='${['#ffd23f', '#ff4d6d', '#3de0ff', '#7bd88f'][i % 4]}'/><circle cx='${x}' cy='${y + 6}' r='16' fill='${['#ffd23f', '#ff4d6d', '#3de0ff', '#7bd88f'][i % 4]}' opacity='0.2'/>`; }).join('')}`;
    out += `<rect x='560' y='170' width='480' height='110' rx='8' fill='#1b3f8e' stroke='#d4af37' stroke-width='8'/><text x='800' y='255' font-size='86' font-family='Georgia, serif' font-weight='700' text-anchor='middle' fill='#f4f4f4' letter-spacing='12'>ΒΩΩΛ</text>`;
    out += [[80, 200, '#8e1b1b'], [260, 180, '#2a6a3a'], [1340, 190, '#5a2a6a'], [1460, 210, '#d4af37']].map(([x, y, c]) => `<path d='M${x} ${y} h110 l-110 44Z' fill='${c}'/><path d='M${x} ${y} v80' stroke='#2a1a10' stroke-width='3'/>`).join('');
    out += `<rect x='1140' y='320' width='300' height='190' fill='#f4f4f4'/><rect x='1140' y='320' width='300' height='190' fill='none' stroke='#2a1a10' stroke-width='6'/>
      ${[0, 1, 2, 3, 4, 5, 6].map((k) => `<rect x='1140' y='${320 + k * 27}' width='300' height='14' fill='#c0392b' opacity='${k % 2 ? 0 : 1}'/>`).join('')}<rect x='1140' y='320' width='130' height='95' fill='#1b3f8e'/>`;
    out += `<rect y='700' width='1600' height='200' fill='#3a2a1e'/>${Array.from({ length: 30 }, (_, i) => `<ellipse cx='${(i * 173) % 1600}' cy='${720 + ((i * 61) % 170)}' rx='${20 + (i % 4) * 10}' ry='8' fill='#2a1a10' opacity='0.5'/>`).join('')}`;
    out += `<path d='M40 700 V560 Q40 520 80 520 H420 Q460 520 460 560 V700Z' fill='#5a6a3a'/><rect x='20' y='600' width='460' height='100' rx='26' fill='#6a7a44'/><rect x='70' y='560' width='160' height='60' rx='12' fill='#7a8a50'/><rect x='250' y='560' width='160' height='60' rx='12' fill='#7a8a50'/><path d='M300 580 l30 10' stroke='#4a5a2a' stroke-width='4'/>`;
    out += `<rect x='1300' y='600' width='160' height='110' rx='10' fill='#2a6fdb'/><rect x='1300' y='600' width='160' height='20' fill='#e8f4ff'/><ellipse cx='1380' cy='600' rx='56' ry='16' fill='#c8d0d8'/><path d='M1324 600 V520 Q1380 490 1436 520 V600' fill='#b8c0c8'/><rect x='1370' y='496' width='20' height='24' fill='#2a2a2a'/><path d='M1390 506 h30 v10' stroke='#2a2a2a' stroke-width='6' fill='none'/>`;
    out += [[520, 690], [560, 700], [1110, 680], [1180, 700], [700, 720], [960, 712], [300, 730]].map(([x, y]) => `<path d='M${x - 14} ${y - 30} h28 l-4 30 h-20Z' fill='#d62828'/><rect x='${x - 14}' y='${y - 30}' width='28' height='5' fill='#f4f4f4'/>`).join('');
    // The championship (an easter egg: Beer Pong at the frat house): a banner across the room,
    // the bracket up on the wall, and the whole house packed in, cups up.
    if (championship) {
      out += `<rect x='300' y='300' width='1000' height='70' rx='6' fill='#d62828'/><rect x='300' y='300' width='1000' height='70' rx='6' fill='none' stroke='#fff' stroke-width='5'/>
        <text x='800' y='350' font-size='44' font-family='Impact, system-ui, sans-serif' text-anchor='middle' fill='#fff' letter-spacing='4'>BEER PONG CHAMPIONSHIP</text>
        <rect x='60' y='290' width='210' height='230' fill='#f4f4f4' stroke='#2a1a10' stroke-width='5'/>
        ${[0, 1, 2, 3].map((k) => `<path d='M78 ${312 + k * 50} h50 v25 h-50 M78 ${337 + k * 50}' stroke='#2a1a10' stroke-width='3' fill='none'/>`).join('')}
        <path d='M128 324 h30 v50 h-30 M158 349 h30 M128 424 h30 v50 h-30 M158 449 h30 M188 349 v100 h-0 M188 399 h40' stroke='#2a1a10' stroke-width='3' fill='none'/>
        <text x='240' y='404' font-size='26' text-anchor='middle'>🏆</text>`;
      for (let x = 10; x < 1600; x += 46) {
        const y = 650 + ((x * 7) % 30);
        out += `<circle cx='${x}' cy='${y}' r='20' fill='#1a1008'/><rect x='${x - 22}' y='${y + 16}' width='44' height='80' rx='14' fill='#1a1008'/>`;
        if ((x / 46) % 3 < 1) out += `<path d='M${x + 18} ${y - 6} l18 -40' stroke='#1a1008' stroke-width='10' stroke-linecap='round'/><path d='M${x + 28} ${y - 70} h20 l-3 22 h-14Z' fill='#d62828'/>`;
      }
    }
    return scene(out);
  }
  // A beer-pong table, for the frat house's table: the white edge line and the centre line.
  const pong = 'linear-gradient(90deg, transparent calc(50% - 2px), rgba(255, 255, 255, 0.8) calc(50% - 2px) calc(50% + 2px), transparent calc(50% + 2px)), radial-gradient(ellipse at center, #1f6a3a 0%, #17552e 70%, #103f22 100%)';

  // The terrace balustrade: pale stone balusters under a coping, in front of you.
  const balustrade = (night) => tile(120, 140, `<rect y='0' width='120' height='16' rx='3' fill='${night ? '#9a9aac' : '#e6d9bc'}'/><rect y='12' width='120' height='4' fill='${night ? '#6a6a7a' : '#bfae8a'}'/>
    ${[15, 45, 75, 105].map((x) => `<path d='M${x - 7} 16 h14 q-2 10 4 22 q-8 14 -2 30 q-6 14 0 30 h-22 q6 -16 0 -30 q6 -16 -2 -30 q6 -12 4 -22Z' fill='${night ? '#8a8a9c' : '#ddcfae'}'/>`).join('')}
    <rect y='118' width='120' height='22' fill='${night ? '#7a7a8c' : '#cbbb96'}'/>`);

  // A drawing stretched over the whole screen, whatever its shape (lines keep their width).
  const fullscreen = (body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 600' preserveAspectRatio='none'>${body}</svg>`)}")`;

  // On deck: the rigging down both sides (shrouds, with ratlines across them), the foot of the
  // mainsail and its yard across the top.
  function rigging() {
    const rope = (x1, y1, x2, y2, w = 3) => `<line x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}' stroke='#1a120b' stroke-width='${w}' vector-effect='non-scaling-stroke' stroke-linecap='round'/>`;
    let out = '';
    for (const side of [0, 1]) {
      const X = (x) => (side ? 1000 - x : x);
      const tops = [[30, -10], [80, -10], [130, -10]];
      const feet = [[40, 600], [150, 600], [260, 600]];
      tops.forEach(([x, y], i) => { out += rope(X(x), y, X(feet[i][0]), feet[i][1], 4); });
      // Ratlines: the rungs sailors climb by.
      for (let y = 40; y < 600; y += 34) {
        const at = (i) => tops[i][0] + (feet[i][0] - tops[i][0]) * ((y + 10) / 610);
        out += rope(X(at(0)), y, X(at(2)), y, 2);
      }
    }
    // The yard, and the foot of the sail billowing below it: its shadowed underside, the sunset
    // catching the edge (dark, so the TV's heading reads over it).
    out += `<path d='M0 0 H1000 V52 Q750 96 500 74 Q250 96 0 52 Z' fill='#3a2a24'/>`;
    out += `<path d='M0 52 Q250 96 500 74 Q750 96 1000 52' fill='none' stroke='#c07a4e' stroke-width='3' vector-effect='non-scaling-stroke'/>`;
    for (const x of [120, 300, 500, 700, 880]) out += `<path d='M${x} 0 Q${x + 10} 40 ${x} ${x === 500 ? 74 : 86}' stroke='#2a1d18' stroke-width='2' fill='none' vector-effect='non-scaling-stroke'/>`;
    out += `<rect x='0' y='0' width='1000' height='14' fill='#3b2614'/>`;
    return fullscreen(out);
  }

  // The ship's rail in front of you: a wooden cap rail on posts, coils of rope, the deck below.
  const shipRail = () => tile(160, 160, `<rect y='0' width='160' height='16' rx='3' fill='#4a2f17'/><rect y='3' width='160' height='3' fill='#6b4524'/>
    ${[18, 98].map((x) => `<rect x='${x}' y='14' width='14' height='96' fill='#3b2512'/><rect x='${x + 2}' y='14' width='3' height='96' fill='#55361b'/>`).join('')}
    <rect y='108' width='160' height='10' fill='#3b2512'/>
    <rect y='118' width='160' height='42' fill='#5a3a1c'/>${[0, 40, 80, 120].map((x) => `<rect x='${x}' y='118' width='2' height='42' fill='#3b2512'/>`).join('')}`);

  // The Flying Dutchman, from her own deck: not a ship so much as a wreck that sails. Her hull's
  // ribs arch up both sides like the bones of a whale, crusted in barnacles and coral; the mast's
  // snapped and leaning, its sails in rags; the captain's pipe organ looms on the left, and through
  // the gaps in the planking the green sea heaves under a storm with the moon in the fog.
  function dutchman() {
    const bark = '#0e1a15';
    const crust = (pts) => pts.map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#b8c4a8' stroke='#56664e' stroke-width='2'/><circle cx='${x}' cy='${y}' r='${r * 0.35}' fill='#2a3428'/>`).join('');
    const weed = (x, y, h) => `<path d='M${x} ${y} q-10 ${h * 0.3} 4 ${h * 0.55} q10 ${h * 0.25} -2 ${h * 0.45}' stroke='#3e7a4a' stroke-width='5' fill='none' stroke-linecap='round'/>`;
    let out = `<defs><linearGradient id='dsky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#010605'/><stop offset='0.6' stop-color='#0c2a20'/><stop offset='1' stop-color='#2a6a4e'/></linearGradient>
      <radialGradient id='dmoon'><stop offset='0' stop-color='#eafff2'/><stop offset='0.3' stop-color='#bfffd8' stop-opacity='0.6'/><stop offset='1' stop-color='#7cf0b0' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='430' fill='url(#dsky)'/>
      <circle cx='1060' cy='170' r='170' fill='url(#dmoon)'/><circle cx='1060' cy='170' r='40' fill='#eafff2'/>
      ${[[300, 90, 320, 60], [800, 60, 380, 70], [1300, 100, 300, 60], [1060, 200, 260, 26]].map(([x, y, rx, ry]) => `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='#06140f' opacity='0.85'/>`).join('')}
      <path d='M700 0 l-30 90 l40 -10 l-50 120' stroke='#b8ffd8' stroke-width='4' fill='none' opacity='0.7'/>
      <rect y='430' width='1600' height='470' fill='#04110d'/>
      ${Array.from({ length: 9 }, (_, i) => `<path d='M0 ${450 + i * 26} Q200 ${436 + i * 26} 400 ${450 + i * 26} T800 ${450 + i * 26} T1200 ${450 + i * 26} T1600 ${450 + i * 26}' stroke='#3aa078' stroke-width='3' fill='none' opacity='${0.5 - i * 0.04}'/>`).join('')}
      <rect x='1020' y='430' width='80' height='240' fill='#7cf0b0' opacity='0.12'/>`;
    // The snapped mast, leaning, with rags of sail.
    out += `<path d='M760 900 L790 120 L812 120 L800 900Z' fill='${bark}'/><path d='M790 120 l-6 -30 l18 14 l6 -26 l6 40Z' fill='${bark}'/>
      <path d='M560 210 L1080 170' stroke='${bark}' stroke-width='14' stroke-linecap='round'/>
      <path d='M580 214 L1060 176 L1040 300 L1000 260 L980 340 L930 300 L900 380 L860 310 L820 350 L780 290 L740 360 L700 300 L660 330 L620 270 L590 300Z' fill='#16302a' opacity='0.92'/>
      ${[[700, 250, 22, 14], [880, 240, 30, 18], [990, 220, 16, 10]].map(([x, y, rx, ry]) => `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='#2e6a50'/>`).join('')}
      <path d='M900 200 L1180 420 M680 212 L420 430' stroke='${bark}' stroke-width='3'/>`;
    // The pipe organ, left, under its own arch.
    out += `<path d='M70 700 V330 Q190 230 310 330 V700Z' fill='#0a1612'/>
      ${[100, 128, 156, 184, 212, 240, 268].map((x, i) => { const h = 260 - Math.abs(i - 3) * 40; return `<rect x='${x}' y='${650 - h}' width='20' height='${h}' rx='3' fill='#1e3a30'/><rect x='${x + 3}' y='${650 - h}' width='5' height='${h}' fill='#3a6a56'/><path d='M${x + 4} ${620 - h * 0.2} h12 l-6 10Z' fill='#04110d'/>`; }).join('')}
      <rect x='80' y='640' width='220' height='60' fill='#142a22'/><rect x='92' y='652' width='196' height='10' fill='#c8d8c0'/>
      ${crust([[90, 600, 8], [292, 560, 10], [120, 690, 7], [280, 680, 9], [180, 300, 6]])}${weed(140, 260, 120)}${weed(250, 300, 90)}`;
    // The hull's ribs arching up each side, broken and crusted.
    for (const side of [0, 1]) {
      const X = (x) => (side ? 1600 - x : x);
      [[0, 0], [70, 1], [140, 2]].forEach(([d, k]) => {
        out += `<path d='M${X(-20 + d)} 900 Q${X(40 + d)} 420 ${X(260 + d * 1.6)} ${60 + k * 70}' stroke='#14241c' stroke-width='${36 - k * 6}' fill='none' stroke-linecap='round'/>
          <path d='M${X(-20 + d)} 900 Q${X(40 + d)} 420 ${X(260 + d * 1.6)} ${60 + k * 70}' stroke='#24402f' stroke-width='6' fill='none' transform='translate(${side ? -8 : 8} 0)'/>`;
        out += crust([[X(40 + d), 620 - k * 20, 9], [X(70 + d * 1.2), 420 - k * 30, 7], [X(140 + d * 1.4), 240, 6]]);
      });
      out += weed(X(150), 200, 140) + weed(X(220), 120, 110);
    }
    // Coral on the deck in the corners, and the deck itself awash.
    out += `<rect y='760' width='1600' height='140' fill='#0c1a14'/>${[0, 120, 260, 420, 600, 790, 980, 1160, 1340, 1500].map((x) => `<rect x='${x}' y='760' width='6' height='140' fill='#06100c'/>`).join('')}
      <path d='M0 772 Q400 760 800 774 T1600 768' stroke='#7cf0b0' stroke-width='3' fill='none' opacity='0.35'/>
      ${[[40, 760], [1520, 760], [1420, 770]].map(([x, y]) => `<path d='M${x} ${y} q-14 -40 -4 -70 q4 30 10 20 q-2 -40 14 -60 q2 40 6 40 q10 -30 24 -30 q-14 40 -6 100Z' fill='#c25a6a'/>`).join('')}
      ${crust([[320, 780, 10], [340, 800, 7], [1260, 790, 9], [700, 820, 6], [940, 800, 8]])}`;
    return scene(out);
  }

  // The gallery railing at the top of the lighthouse, in front of you.
  const railing = (iron = '#06090f', foot = '#05080d') => tile(120, 160, `<rect y='0' width='120' height='14' rx='4' fill='${iron}'/>
    <rect y='60' width='120' height='8' fill='${iron}'/>
    ${[10, 40, 70, 100].map((x) => `<rect x='${x}' y='10' width='7' height='150' fill='${iron}'/>`).join('')}
    <rect y='120' width='120' height='40' fill='${foot}'/>`);

  // The Highlands pub: an old tavern up in the hills, in whatever the weather is doing outside.
  // (It began as St Patrick's, a seasonal style; the id stays 'stpatricks' so saved rooms keep it.)
  const highland = (weather) => ({
      label: 'Highlands pub',
      emoji: '🏔️',
      welcome: { clear: 'Sláinte! Pull up a stool by the peat fire.', rain: 'Rain’s on. Nobody’s leaving now.', fog: 'Fog’s down in the glen. Another round, then.' }[weather],
      font: 'Uncial Antiqua',
      vars: { bg: '#1a1510', card: '#2a2119', 'card-2': '#3a2e22', text: '#f6f0e2', muted: '#c3b59a', accent: '#e6b84a', 'accent-text': '#241a00', danger: '#e5533d', ok: '#8fcf6a' },
      // Rough stone walls under heavy beams, a big window either side looking out on the glen,
      // lanterns, and the peat fire glowing low.
      bg: () => `${vignette},
        ${glen(weather)} 3vw 11vh / min(300px, 34vw) auto no-repeat, ${glen(weather)} calc(100% - 3vw) 11vh / min(300px, 34vw) auto no-repeat,
        radial-gradient(circle at 50% 6%, rgba(255, 190, 100, 0.35), transparent 18%),
        radial-gradient(ellipse 90% 38% at 50% 106%, rgba(255, 120, 40, 0.42), transparent 70%),
        linear-gradient(#170e07 0 4.5%, #3a2412 4.5% 7%, #1a1008 7% 7.6%, transparent 7.6%),
        linear-gradient(rgba(30, 20, 10, 0.35), rgba(30, 20, 10, 0.55)),
        ${fieldstone()} 0 0 / 300px 210px, #1a1510`,
      // A green tartan cloth on the table.
      felt: `repeating-linear-gradient(0deg, rgba(14, 28, 58, 0.5) 0 16px, transparent 16px 32px, rgba(190, 40, 40, 0.4) 32px 34px, transparent 34px 64px),
        repeating-linear-gradient(90deg, rgba(14, 28, 58, 0.5) 0 16px, transparent 16px 32px, rgba(190, 40, 40, 0.4) 32px 34px, transparent 34px 64px),
        radial-gradient(ellipse at center, #2a7044 0%, #1f5e38 70%, #174a2c 100%)`,
      rim: '#4a2e17',
  });

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
      // Bamboo walls opening onto the beach at dusk (see tikiBeach), the torches lit either side.
      bg: () => `${vignette},
        radial-gradient(circle at 5% 45%, rgba(255, 140, 50, 0.45), transparent 20%),
        radial-gradient(circle at 95% 45%, rgba(255, 140, 50, 0.45), transparent 20%),
        linear-gradient(rgba(10, 26, 22, 0.55), rgba(10, 26, 22, 0.3) 14%, rgba(10, 26, 22, 0.3) 60%, rgba(10, 26, 22, 0.55)),
        ${tikiBeach()} center / cover no-repeat, #0f2421`,
      felt: 'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.08) 0 6px, transparent 6px 12px), radial-gradient(ellipse at center, #c99a52 0%, #a87b3c 70%, #8a6129 100%)',
      rim: '#5a3a1a',
    },
    speakeasy: {
      label: 'Speakeasy',
      emoji: '🥃',
      welcome: 'Knock twice. Password’s “the bee’s knees”.',
      font: 'Poiret One',
      vars: { bg: '#2a1014', card: '#22110f', 'card-2': '#331a16', text: '#f3e8d4', muted: '#b9a68c', accent: '#c9a24a', 'accent-text': '#1a1300', danger: '#e0503c', ok: '#7fbf7a' },
      // A hidden bar in a basement: faded damask wallpaper above mahogany panelling, a brass rail
      // between them, and the warm pools of light from brass sconces on the walls.
      bg: () => `${vignette},
        radial-gradient(ellipse 9% 20% at 6% 30%, rgba(255, 200, 120, 0.35), transparent 70%),
        radial-gradient(ellipse 9% 20% at 94% 30%, rgba(255, 200, 120, 0.3), transparent 70%),
        linear-gradient(transparent 61%, #b08d45 61% 61.6%, #5a4420 61.6% 62.2%, transparent 62.2%),
        repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.4) 0 3px, rgba(255, 220, 170, 0.04) 3px 5px, transparent 5px 140px) 0 100% / 100% 37.8% no-repeat,
        linear-gradient(transparent 62.2%, #2a140c 62.2%, #1c0d07 100%),
        linear-gradient(rgba(20, 8, 8, 0.35), rgba(20, 8, 8, 0.6)),
        ${damask()} 0 0 / 120px 160px, #2a1014`,
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
      // On deck at sunset, looking out to sea: the sail and its yard overhead, the rigging down
      // both sides, the rail in front of you, and the sun going down on the horizon.
      bg: () => `${shipRail()} 0 100% / 160px 15vh repeat-x,
        ${rigging()} 0 0 / 100% 100% no-repeat,
        radial-gradient(ellipse 7% 30% at 62% 68%, rgba(255, 190, 110, 0.35), transparent 70%),
        radial-gradient(circle at 62% 46%, #ffd98a 0 3.4%, rgba(255, 170, 90, 0.5) 4.5%, rgba(255, 140, 80, 0) 16%),
        linear-gradient(transparent 46%, rgba(255, 200, 140, 0.35) 46.2%, transparent 47.5%),
        linear-gradient(#1d1733 0%, #5a2d4f 18%, #b4505a 32%, #ef8a4c 43%, #f6b06a 46%, transparent 46%),
        ${waves('#ffc89a', 0.9)} 0 100% / 160px 96px,
        linear-gradient(#24465c, #0f2230), #10161d`,
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
    // Outdoors in Tuscany: a long lunch under the pergola, looking out over the vineyards.
    vineyard: {
      label: 'Italian vineyard',
      emoji: '🍇',
      welcome: 'Salute! Pull up a chair under the vines.',
      font: 'Italiana',
      vars: { bg: '#3a2e1c', card: '#2e2416', 'card-2': '#3d3020', text: '#f8f0dc', muted: '#c9b894', accent: '#c0392b', 'accent-text': '#fff4ea', danger: '#e0503c', ok: '#8fcf6a' },
      // The vineyard in the afternoon sun (see tuscany()), the pergola overhead, the terrace wall.
      bg: () => `${pergola(false)} 0 0 / 300px 150px repeat-x, ${stoneWall()} 0 100% / 180px 13vh repeat-x, ${tuscany(false)} center / cover no-repeat, #7f9a3a`,
      // A red-checked tablecloth.
      felt: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.18)), repeating-conic-gradient(#b8322a 0 25%, #f2e6cf 0 50%) 0 0 / 46px 46px',
      rim: '#5a3a1e',
    },
    // The frat house basement. Beer pong's set up; nobody's going to class tomorrow.
    frat: {
      label: 'Frat house',
      emoji: '🥤',
      welcome: 'Welcome to Beta Omega Omega Lambda. Shoes optional, cups mandatory.',
      font: 'Bungee',
      vars: { bg: '#2a1a10', card: '#2e1e14', 'card-2': '#3e2a1c', text: '#fff4e8', muted: '#d8bc9c', accent: '#d62828', 'accent-text': '#ffffff', danger: '#ff4d4d', ok: '#7bd88f' },
      bg: () => `linear-gradient(rgba(20, 10, 4, 0.55), transparent 14%), linear-gradient(rgba(20, 10, 4, 0.2), rgba(20, 10, 4, 0.35)), ${frat()} center / cover no-repeat, #2a1a10`,
      felt: pong,
      rim: '#f4f4f4',
    },
    // Noir: a dice game in a private eye's office after midnight (a candidate easter egg for
    // Slevens in the Speakeasy: not in EGGS yet).
    speakeasyNoir: {
      mood: true,
      egg: true,
      room: 'speakeasy',
      label: 'Noir',
      emoji: '🕵️',
      welcome: 'It was a dark and stormy night. The dice were loaded. So was I.',
      font: 'Special Elite',
      vars: { bg: '#111114', card: '#1a1a1e', 'card-2': '#26262c', text: '#ecebe6', muted: '#9a9890', accent: '#ff2a3a', 'accent-text': '#ffffff', danger: '#ff2a3a', ok: '#d8d4c4' },
      bg: () => `linear-gradient(rgba(6, 6, 8, 0.5), transparent 14%), ${noir()} center / cover no-repeat, #111114`,
      // Green baize gone grey in the dark, under the lamp.
      felt: 'radial-gradient(ellipse at 45% 40%, #4a4a48 0%, #343432 60%, #222220 100%)',
      rim: '#0a0a0c',
      drink: '🥃',
    },
    // A paddle steamer on the Mississippi, for a dice game on the river (a candidate easter egg:
    // not in EGGS yet; see it with /preview?look=saloonRiverboat&game=slevens).
    saloonRiverboat: {
      mood: true,
      egg: true,
      room: 'saloon',
      label: 'Riverboat',
      emoji: '🛶',
      welcome: 'All aboard the Delta Belle. Place your bets, gentlemen.',
      font: 'Rye',
      vars: { bg: '#2a1018', card: '#3a1820', 'card-2': '#4a2230', text: '#fbf0dc', muted: '#e0c0a0', accent: '#e8b84a', 'accent-text': '#2a1700', danger: '#ff5a4a', ok: '#8fcf6a' },
      bg: () => `linear-gradient(rgba(20, 8, 10, 0.5), transparent 14%), ${riverboat()} center / cover no-repeat, #2a1018`,
      felt: 'radial-gradient(ellipse at center, #8a1a24 0%, #6a121a 70%, #4a0c12 100%)',
      rim: '#c8a85a',
      drink: '🥃',
    },
    // Slevens in the tavern: the dice go down in a Viking mead hall.
    tavernMeadhall: {
      mood: true,
      egg: true,
      room: 'tavern',
      label: 'Mead hall',
      emoji: '🪓',
      welcome: 'Horns up! The mead hall welcomes you.',
      font: 'IM Fell English SC',
      vars: { bg: '#1e130b', card: '#2e1e10', 'card-2': '#3e2a18', text: '#f7ead2', muted: '#cfb08a', accent: '#e8a83c', 'accent-text': '#2a1700', danger: '#d9483b', ok: '#9ccc65' },
      bg: () => `linear-gradient(rgba(14, 8, 4, 0.55), transparent 14%), ${meadHall()} center / cover no-repeat, #1e130b`,
      // A long board of rough planks.
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.3) 0 3px, transparent 3px 64px), radial-gradient(ellipse at center, #8a5a2e 0%, #6e4422 70%, #4e2e16 100%)',
      rim: '#3a2410',
      drink: '🍯',
    },
    // Quarters in the diner: the roller rink next door, all neon and disco ball.
    dinerRink: {
      mood: true,
      egg: true,
      room: 'diner',
      label: 'Roller rink',
      emoji: '🛼',
      welcome: 'Couples skate! Quarters at the snack bar.',
      font: 'Monoton',
      vars: { bg: '#1a0a30', card: '#24113e', 'card-2': '#321a54', text: '#fbeeff', muted: '#d0b0e8', accent: '#29f0ff', 'accent-text': '#00202a', danger: '#ff4d6d', ok: '#7dff9e' },
      bg: () => `linear-gradient(rgba(16, 4, 30, 0.55), transparent 14%), ${rink()} center / cover no-repeat, #1a0a30`,
      felt: 'repeating-linear-gradient(135deg, rgba(255, 43, 214, 0.18) 0 10px, transparent 10px 30px), repeating-linear-gradient(45deg, rgba(41, 240, 255, 0.14) 0 8px, transparent 8px 26px), radial-gradient(ellipse at center, #2a1450 0%, #1c0c38 70%, #140828 100%)',
      rim: '#ff2bd6',
      drink: '🥤',
    },
    // Beer Pong at the frat house: the championship. The whole house is in.
    fratChampionship: {
      mood: true,
      egg: true,
      room: 'frat',
      label: 'Beer pong championship',
      emoji: '🏓',
      welcome: 'The Beta Omega Omega Lambda beer pong championship. Winner stays on.',
      font: 'Bungee',
      vars: { bg: '#2a1a10', card: '#2e1e14', 'card-2': '#3e2a1c', text: '#fff4e8', muted: '#d8bc9c', accent: '#d62828', 'accent-text': '#ffffff', danger: '#ff4d4d', ok: '#7bd88f' },
      bg: () => `linear-gradient(rgba(20, 10, 4, 0.55), transparent 14%), linear-gradient(rgba(20, 10, 4, 0.2), rgba(20, 10, 4, 0.35)), ${frat(true)} center / cover no-repeat, #2a1a10`,
      felt: pong,
      rim: '#f4f4f4',
      drink: '🥤',
    },
    // The mechanic's garage: the car's up on the lift, the radio's on.
    garage: {
      label: 'Mechanic’s garage',
      emoji: '🔧',
      welcome: 'Grab a stool. The car can wait.',
      font: 'Black Ops One',
      vars: { bg: '#2a3038', card: '#262c34', 'card-2': '#343c46', text: '#f4f6f8', muted: '#b0bac4', accent: '#ffd23f', 'accent-text': '#1a1400', danger: '#ff4d4d', ok: '#6fd38f' },
      bg: () => `linear-gradient(rgba(20, 24, 30, 0.35), rgba(20, 24, 30, 0.5)), ${garage()} center / cover no-repeat, #2a3038`,
      felt: `${plate()} 0 0 / 40px 40px`,
      rim: '#ffd23f',
    },
    // Outdoors in the Loire: drinks on the terrace of the château, over the formal garden.
    chateau: {
      label: 'French château',
      emoji: '🏰',
      welcome: 'Santé! Champagne on the terrace.',
      font: 'Parisienne',
      vars: { bg: '#2a3326', card: '#253024', 'card-2': '#323f30', text: '#fbf8ee', muted: '#e2e8d8', accent: '#e6c06a', 'accent-text': '#221800', danger: '#e0503c', ok: '#8fcf6a' },
      // (A little shade over the garden, so light text reads over the gravel and the sky.)
      bg: () => `${balustrade(false)} 0 100% / 120px 15vh repeat-x, linear-gradient(rgba(20, 30, 20, 0.12), rgba(20, 30, 20, 0.22)), ${chateau(false)} center / cover no-repeat, #5f8a36`,
      // White linen.
      felt: 'radial-gradient(ellipse at 45% 40%, #fbf8f0 0%, #ede6d6 70%, #d8cfba 100%)',
      rim: '#b08d45',
    },
    // The Lighthouse's other moods. They aren't on the list of styles: the room moves between them.
    // The vineyard at sunset, and the château at night.
    vineyardSunset: {
      mood: true,
      label: 'Italian vineyard',
      emoji: '🍇',
      welcome: 'The sun’s going down over the hills. Another glass?',
      font: 'Italiana',
      vars: { bg: '#3a2418', card: '#2e1e14', 'card-2': '#3d281c', text: '#fbeedd', muted: '#d0b090', accent: '#e07a3a', 'accent-text': '#2a1000', danger: '#e0503c', ok: '#8fcf6a' },
      bg: () => `${pergola(true)} 0 0 / 300px 150px repeat-x, ${stoneWall()} 0 100% / 180px 13vh repeat-x, linear-gradient(rgba(60, 20, 10, 0.15), rgba(60, 20, 10, 0.3)), ${tuscany(true)} center / cover no-repeat, #7a5a22`,
      felt: 'radial-gradient(ellipse at center, rgba(255, 200, 140, 0.1), rgba(0, 0, 0, 0.28)), repeating-conic-gradient(#b8322a 0 25%, #f2e6cf 0 50%) 0 0 / 46px 46px',
      rim: '#5a3a1e',
    },
    chateauNight: {
      mood: true,
      label: 'French château',
      emoji: '🏰',
      welcome: 'Every window’s lit. The party’s inside, the champagne’s out here.',
      font: 'Parisienne',
      vars: { bg: '#141a30', card: '#1a2038', 'card-2': '#242c4a', text: '#f4f0e4', muted: '#a9aec8', accent: '#e6c06a', 'accent-text': '#221800', danger: '#e0503c', ok: '#8fcf6a' },
      bg: () => `${balustrade(true)} 0 100% / 120px 15vh repeat-x, ${chateau(true)} center / cover no-repeat, #14241a`,
      felt: 'radial-gradient(ellipse at 45% 40%, #e8e4dc 0%, #cfc8b8 70%, #b4ac98 100%)',
      rim: '#b08d45',
    },
    // ---------- Easter eggs: a room that changes when a certain game's played in it ----------
    // (See EGGS below.) Kings Cup at the château: the revolution's come, and the château's burning.
    chateauRevolution: {
      mood: true,
      egg: true,
      room: 'chateau',
      label: 'French château',
      emoji: '🔥',
      welcome: 'Vive la Révolution ! Let them drink champagne.',
      font: 'Parisienne',
      vars: { bg: '#1a0c0c', card: '#241414', 'card-2': '#331c1a', text: '#fbeee4', muted: '#d4aea0', accent: '#ff7a2a', 'accent-text': '#2a0e00', danger: '#ff4a3a', ok: '#8fcf6a' },
      bg: () => `${balustrade(true)} 0 100% / 120px 15vh repeat-x, linear-gradient(rgba(40, 10, 0, 0.1), rgba(40, 10, 0, 0.3)), ${chateau(true, true)} center / cover no-repeat, #1a0c0c`,
      // The linen, scorched.
      felt: 'radial-gradient(circle at 30% 70%, rgba(40, 20, 10, 0.45) 0 6%, transparent 12%), radial-gradient(circle at 72% 30%, rgba(40, 20, 10, 0.35) 0 5%, transparent 10%), radial-gradient(ellipse at 45% 40%, #e8ddcc 0%, #cbbca2 70%, #9a8a70 100%)',
      rim: '#7a5a2a',
      drink: '🍷',
    },
    // Shot Poker at the casino: you've been let into the gilded salon at Monte Carlo.
    casinoMonteCarlo: {
      mood: true,
      egg: true,
      room: 'casino',
      label: 'Monte Carlo',
      emoji: '👑',
      welcome: 'Bienvenue à Monte-Carlo. Black tie, high stakes.',
      font: 'Abril Fatface',
      vars: { bg: '#2a1a0a', card: '#2e1a0c', 'card-2': '#3e2614', text: '#fff6e4', muted: '#e0c89a', accent: '#f0c75a', 'accent-text': '#2a1d00', danger: '#ff4d5e', ok: '#4fd18b' },
      bg: () => `linear-gradient(rgba(30, 14, 0, 0.75), transparent 14%), radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(30, 12, 0, 0.55) 100%), linear-gradient(rgba(40, 20, 0, 0.2), rgba(40, 20, 0, 0.35)), ${monteCarlo()} center / cover no-repeat, #2a1a0a`,
      felt: 'radial-gradient(ellipse at center, #1a7a4a 0%, #136238 65%, #0c4a2a 100%)',
      rim: '#e0b450',
      drink: '🍾',
    },
    // Big Tom in the jazz club: open mic night. A bare brick wall under one spotlight.
    jazzOpenMic: {
      mood: true,
      egg: true,
      room: 'jazz',
      label: 'Open mic night',
      emoji: '🎤',
      welcome: 'Open mic night. Be funny or be quiet.',
      font: 'Limelight',
      vars: { bg: '#150e0c', card: '#241814', 'card-2': '#33221c', text: '#f6e7d8', muted: '#c3a898', accent: '#ff4d6d', 'accent-text': '#2a0008', danger: '#ff5d73', ok: '#8fd19e' },
      bg: () => `${vignette},
        radial-gradient(ellipse 18% 70% at 10% 58%, rgba(255, 240, 200, 0.4), transparent 70%),
        linear-gradient(rgba(16, 10, 8, 0.6), rgba(16, 10, 8, 0.8)),
        ${bricks()} 0 0 / 256px 120px, #150e0c`,
      felt: 'radial-gradient(ellipse at center, #2a2a2e 0%, #1e1e22 70%, #141418 100%)',
      rim: '#ff4d6d',
      drink: '🍸',
    },
    // Ace Race in the beer hall: Oktoberfest, in the big tent.
    beerhallOktoberfest: {
      mood: true,
      egg: true,
      room: 'beerhall',
      label: 'Oktoberfest',
      emoji: '🥨',
      welcome: 'O’zapft is! The keg is tapped. Prost!',
      font: 'UnifrakturMaguntia',
      vars: { bg: '#2a1e10', card: '#2e2214', 'card-2': '#3e2e1c', text: '#fff6e4', muted: '#e0c89a', accent: '#2a6fdb', 'accent-text': '#ffffff', danger: '#d63c3c', ok: '#2b9a5a' },
      bg: () => `linear-gradient(rgba(30, 20, 10, 0.5), transparent 16%), linear-gradient(rgba(40, 26, 10, 0.15), rgba(40, 26, 10, 0.35)), ${oktoberfest()} center / cover no-repeat, #f4e7c8`,
      // A beer-tent table: wood, with a faint blue and white check over it.
      felt: 'repeating-conic-gradient(rgba(42, 111, 219, 0.16) 0 25%, rgba(255, 255, 255, 0.08) 0 50%) 0 0 / 44px 44px, radial-gradient(ellipse at center, #b07c46 0%, #9a6a3a 70%, #7d5430 100%)',
      rim: '#5c3a1a',
      drink: '🍺',
    },
    // Mad Max in the garage: the garage after the end of the world, building war rigs.
    garageWasteland: {
      mood: true,
      egg: true,
      room: 'garage',
      label: 'The Wasteland',
      emoji: '💀',
      welcome: 'Welcome to the Wasteland. Fuel’s low. Drinks are lower.',
      font: 'Rye',
      vars: { bg: '#2a1408', card: '#2e1a0e', 'card-2': '#40261a', text: '#fbe8d0', muted: '#d8a880', accent: '#ff7a1a', 'accent-text': '#2a0e00', danger: '#ff4a3a', ok: '#8fcf6a' },
      bg: () => `linear-gradient(rgba(30, 10, 0, 0.55), transparent 15%), ${wasteland()} center / cover no-repeat, #2a1408`,
      felt: 'radial-gradient(ellipse at 40% 40%, #8a6a4a 0%, #6a4a2e 70%, #4a2e1a 100%)',
      rim: '#5a5a5a',
      drink: '🛢️',
    },
    // Ride the Bus in the space lounge: the bus is a starship, and riding it is a jump to lightspeed.
    spaceStarship: {
      mood: true,
      egg: true,
      room: 'space',
      label: 'The starship',
      emoji: '🚀',
      welcome: 'All crew aboard. Next stop: anywhere.',
      font: 'Orbitron',
      vars: { bg: '#0c1018', card: '#141c2a', 'card-2': '#1e2a3e', text: '#eef6ff', muted: '#9ab0c8', accent: '#7cf0ff', 'accent-text': '#00222a', danger: '#ff5c8a', ok: '#7dff9e' },
      bg: () => `linear-gradient(rgba(6, 8, 14, 0.6), transparent 14%), ${starship()} center / cover no-repeat, #0c1018`,
      felt: 'radial-gradient(ellipse at 40% 35%, #2a3a52 0%, #1c2638 65%, #121a28 100%)',
      rim: '#7cf0ff',
      drink: '🧃',
    },
    // Darts in the dive bar: the board's moved to the Darts Palace, the world championship stage.
    diveChampionship: {
      mood: true,
      egg: true,
      room: 'dive',
      label: 'Darts Palace',
      emoji: '🎯',
      welcome: 'Welcome to the Darts Palace. Game on!',
      font: 'Special Elite',
      vars: { bg: '#0e0b1c', card: '#1c1630', 'card-2': '#2a2244', text: '#f4f0ff', muted: '#b0a6d0', accent: '#ffd23f', 'accent-text': '#1a1400', danger: '#ff4d6d', ok: '#7bd88f' },
      bg: () => `linear-gradient(rgba(6, 5, 12, 0.6), transparent 14%), ${palace()} center / cover no-repeat, #0e0b1c`,
      felt: 'radial-gradient(ellipse at center, #1c6b44 0%, #135234 65%, #0c3a24 100%)',
      rim: '#ff2a8a',
      drink: '🍺',
    },
    // Horse Race at the castle: out of the great hall and down to the tournament field. The
    // jockeys ride in armour with lances (see public/games/horseRace.js).
    castleTournament: {
      mood: true,
      egg: true,
      room: 'castle',
      label: 'Castle',
      emoji: '🐴',
      welcome: 'To the lists! The tournament begins.',
      font: 'Cinzel',
      vars: { bg: '#2a3a24', card: '#2a2833', 'card-2': '#383544', text: '#f4eedd', muted: '#c9c2d2', accent: '#d4af37', 'accent-text': '#1d1600', danger: '#c8303f', ok: '#6fbf73' },
      bg: () => `linear-gradient(rgba(20, 20, 30, 0.55), transparent 14%), ${tournament()} center / cover no-repeat, #4f8a3a`,
      felt: 'radial-gradient(ellipse at center, #4a2670 0%, #3a1c5a 65%, #2a1242 100%)',
      rim: '#d4af37',
      drink: '🍷',
    },
    // Liar's Dice on the pirate ship: you're aboard the Flying Dutchman, playing for years of your
    // life. A ghost ship in a green storm (see dutchman()).
    pirateDutchman: {
      mood: true,
      egg: true,
      room: 'pirate',
      label: 'The Flying Dutchman',
      emoji: '👻',
      welcome: 'Welcome aboard the Flying Dutchman. Wager your years, sailor.',
      font: 'Pirata One',
      vars: { bg: '#06120e', card: '#0e1f19', 'card-2': '#162c24', text: '#e4f4ea', muted: '#9ab8a8', accent: '#7cf0b0', 'accent-text': '#002414', danger: '#ff6a5a', ok: '#7cf0b0' },
      bg: () => `linear-gradient(rgba(1, 8, 6, 0.55), transparent 16%), ${dutchman()} center / cover no-repeat, #06120e`,
      // An old barrel-head of a table, green with damp.
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 54px), radial-gradient(ellipse at 45% 40%, #4a6a54 0%, #344c3c 70%, #1e3024 100%)',
      rim: '#24382c',
      drink: '🥃',
    },
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
    stpatricks: highland('clear'),
    // The Highlands pub's other moods: the same tavern with the rain coming down outside, or the fog in.
    stpatricksRain: { ...highland('rain'), mood: true },
    stpatricksFog: { ...highland('fog'), mood: true },
  };

  // Rooms whose look changes on its own: [look, how often it comes up]. The first is where it starts
  // when nothing's been picked yet.
  // What's in front of each player on the TV's table, by room.
  const DRINKS = { classic: '🍺', dive: '🍺', tavern: '🍺', club: '🍸', castle: '🍷', jazz: '🍸', diner: '🥤', tiki: '🍹', speakeasy: '🥃',
    casino: '🍸', saloon: '🥃', pirate: '🥃', beerhall: '🍺', space: '🍸', lighthouse: '🍺', christmas: '☕', halloween: '🧪', stpatricks: '🥃',
    vineyard: '🍷', chateau: '🥂', garage: '🍺', frat: '🥤' };
  for (const [id, drink] of Object.entries(DRINKS)) STYLES[id].drink = drink;

  STYLES.lighthouse.moods = [['lighthouse', 4], ['lighthouseDay', 3], ['lighthouseFog', 2], ['storm', 1.5]];
  STYLES.stpatricks.moods = [['stpatricks', 4], ['stpatricksRain', 3], ['stpatricksFog', 2]];
  STYLES.vineyard.moods = [['vineyard', 3], ['vineyardSunset', 2]];
  STYLES.chateau.moods = [['chateau', 3], ['chateauNight', 2]];

  // Boat Race at the lighthouse: regatta day. Always the clear day, signal flags strung overhead.
  const bunting = () => tile(240, 60, `<path d='M0 6 Q120 30 240 6' fill='none' stroke='#2a3a4a' stroke-width='2'/>
    ${['#e5484d', '#f5c518', '#3d7cff', '#ffffff', '#2fbf71', '#ff8a1f'].map((c, i) => { const x = 10 + i * 38; const y = 6 + 24 * Math.sin(((x + 9) / 240) * Math.PI) * 0.75; return `<path d='M${x} ${y} h18 l-9 22Z' fill='${c}' stroke='rgba(0,0,0,0.25)'/>`; }).join('')}`);
  STYLES.lighthouseRegatta = {
    ...STYLES.lighthouseDay,
    egg: true,
    room: 'lighthouse',
    emoji: '⛵',
    welcome: 'Regatta day! Every boat in the harbour is out.',
    bg: () => `${bunting()} 0 7vh / 240px 60px repeat-x, ${STYLES.lighthouseDay.bg()}`,
  };

  // The easter eggs: playing this game in this room turns it into that look, for the whole game.
  const EGGS = { 'chateau:kingsCup': 'chateauRevolution', 'pirate:liarsDice': 'pirateDutchman', 'casino:shotPoker': 'casinoMonteCarlo', 'lighthouse:boatRace': 'lighthouseRegatta', 'castle:horseRace': 'castleTournament', 'dive:darts': 'diveChampionship', 'jazz:bigTom': 'jazzOpenMic', 'beerhall:aceRace': 'beerhallOktoberfest', 'garage:madMax': 'garageWasteland', 'space:rideTheBus': 'spaceStarship', 'frat:beerPong': 'fratChampionship', 'diner:quarters': 'dinerRink', 'tavern:slevens': 'tavernMeadhall' };
  const eggOf = (style, game) => EGGS[`${style}:${game}`] || null;

  const IDS = Object.keys(STYLES);
  // Moods drink what their room drinks.
  for (const id of IDS) if (STYLES[id].mood && !STYLES[id].drink) STYLES[id].drink = STYLES[STYLES[id].room || IDS.find((r) => STYLES[r].moods?.some(([look]) => look === id))].drink;
  // The styles the host picks from (a mood is part of its room, not a choice of its own).
  const PICKABLE = IDS.filter((id) => !STYLES[id].mood);
  // The room a mood belongs to (a saved room may still be on an old 'storm' style).
  const roomOf = (id) => (STYLES[id]?.room || (STYLES[id]?.mood ? IDS.find((r) => STYLES[r].moods?.some(([look]) => look === id)) : id));

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

  const ROOM_STYLES = { STYLES, IDS, PICKABLE, EGGS, eggOf, roomOf, pickMood, apply, css };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROOM_STYLES;
  else root.ROOM_STYLES = ROOM_STYLES;
})(this);
