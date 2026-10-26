// Room art: what each room style looks like (lib/roomStyles.js has its name, colours and font):
// the background, drawn as SVG, and the TV's table. And css(id), which puts one look on the page.
//
// On the server only: server.js builds one look's stylesheet at a time and the browser fetches the
// one it's showing (see apply in roomStyles.js), so no phone downloads every look's drawings. The
// one exception is a demo page, which has no server: tools/build-demos.js puts this file in it,
// where it sets window.ROOM_ART and the page builds each look's stylesheet itself.

(function (root) {
  const { STYLES, IDS, LAYER } = typeof module !== 'undefined' && module.exports ? require('./roomStyles') : root.ROOM_STYLES;

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

  // ---------- The diner, the tiki bar, the speakeasy, the casino and the saloon ----------
  // Each is one scene, 1600 x 900, scaled to cover the screen. On the TV the table covers the
  // middle and the sidebar the right, so what shows there is the strip along the top, the left
  // edge, the upper left corner, the gap between the table and the sidebar (x 1025-1170), and the
  // bottom right (x > 1170, y > 620): the busy detail is put there. A phone sees a slice down the
  // middle, under its cards. The TV's moving scenery is lined up with these drawings (see artAt in
  // public/scenery.js), so moving a thing here means moving it there too.
  const vnChrome = (id, x2 = 0) => `<linearGradient id='${id}' x1='0' y1='0' x2='${x2}' y2='${x2 ? 0 : 1}'><stop offset='0' stop-color='#ffffff'/><stop offset='0.45' stop-color='#cfd6dc'/><stop offset='0.55' stop-color='#8e989f'/><stop offset='1' stop-color='#eef1f3'/></linearGradient>`;
  const vnGlow = (id, color, o = 0.5) => `<radialGradient id='${id}'><stop offset='0' stop-color='${color}' stop-opacity='${o}'/><stop offset='1' stop-color='${color}' stop-opacity='0'/></radialGradient>`;
  const vnF1 = (n) => Math.round(n * 10) / 10;
  // Like scene(), but escaping only what a quoted url() needs (not every space, three bytes each):
  // these drawings are big.
  const vnLite = (body) => `url("data:image/svg+xml,${`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'>${body}</svg>`.replace(/\s+/g, ' ').replace(/[%#"<>{}\\]|[^ -~]/g, encodeURIComponent)}")`;

  // The diner at dusk: a 1950s counter in red vinyl and chrome along a mint wall, stools in front,
  // the checkerboard floor. Out of the window the sky's going pink over the motel and the EAT sign,
  // a turquoise Bel Air at the kerb; the kitchen pass with its tickets and a burger waiting; the
  // pink neon clock, a neon coffee cup, and the jukebox glowing in the gap; along the counter the
  // pie under its dome (a slice gone), a coffee steaming, a shake with two straws, a fedora left on
  // a stool, the tip jar; a gumball machine by the door.
  function dinerArt() {
    const r = seeded(29);
    const F = 800;
    // The floor in perspective: wedges from the vanishing point, alternate ones in alternate rows.
    const V = [800, 380];
    const ys = [];
    for (let z = 1; ; z += 0.07) { const y = V[1] + 520 / z; ys.push(vnF1(Math.max(F, y))); if (y <= F) break; }
    const rows = [[], []];
    for (let j = 0; j < ys.length - 1; j++) rows[j % 2].push(`<rect y='${ys[j + 1]}' width='1600' height='${vnF1(ys[j] - ys[j + 1])}'/>`);
    const wedges = [[], []];
    for (let i = -26; i < 26; i++) wedges[(i + 26) % 2].push(`M800 ${V[1]}L${800 + i * 62} 900L${800 + (i + 1) * 62} 900Z`);
    let out = `<defs>${vnChrome('ch')}${vnChrome('cv', 1)}
      <linearGradient id='wl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c9eee6'/><stop offset='1' stop-color='#a8d8ce'/></linearGradient>
      <linearGradient id='sk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6f8fc8'/><stop offset='0.42' stop-color='#b99ac8'/><stop offset='0.78' stop-color='#f7b49e'/><stop offset='1' stop-color='#ffd9a0'/></linearGradient>
      <linearGradient id='jb' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ff5c8a'/><stop offset='0.35' stop-color='#ffb347'/><stop offset='0.65' stop-color='#ffe066'/><stop offset='1' stop-color='#5ce0ff'/></linearGradient>
      ${vnGlow('lg', '#fff2c4', 0.6)}${vnGlow('pg', '#ff6a9a', 0.35)}
      <pattern id='tl' width='48' height='48' patternUnits='userSpaceOnUse'><path d='M0 0.5H48M0.5 0V48' stroke='#fff' stroke-width='1.5' opacity='0.4'/></pattern>
      <pattern id='rb' width='44' height='96' patternUnits='userSpaceOnUse' y='704'><rect width='44' height='96' fill='#d93441'/><rect width='7' height='96' fill='url(#cv)'/><rect x='22' width='3' height='96' fill='#fff' opacity='0.14'/></pattern>
      <clipPath id='r0'>${rows[0].join('')}</clipPath><clipPath id='r1'>${rows[1].join('')}</clipPath></defs>
      <rect width='1600' height='${F}' fill='url(#wl)'/><rect y='102' width='1600' height='${F - 102}' fill='url(#tl)'/>`;
    // The ceiling: a cream soffit (behind the heading) with a red stripe and chrome under it.
    out += `<rect width='1600' height='92' fill='#fbf3e4'/><rect y='88' width='1600' height='7' fill='#e63946'/><rect y='95' width='1600' height='8' fill='url(#ch)'/>`;
    // The red and chrome stripe along the wall.
    out += `<rect y='468' width='1600' height='6' fill='url(#ch)'/><rect y='474' width='1600' height='14' fill='#e63946'/><rect y='488' width='1600' height='5' fill='url(#ch)'/>`;
    // The window, top left: dusk over the motel across the road, the EAT sign, a Bel Air parked.
    out += `<rect x='12' y='108' width='516' height='302' rx='16' fill='url(#ch)'/><rect x='24' y='118' width='492' height='280' rx='8' fill='url(#sk)'/>
      <circle cx='410' cy='322' r='70' fill='#ffe8b8' opacity='0.35'/><circle cx='410' cy='322' r='40' fill='#ffefc4'/>
      <g fill='#ffd0c0' opacity='0.55'><ellipse cx='120' cy='176' rx='90' ry='8'/><ellipse cx='330' cy='150' rx='110' ry='7'/><ellipse cx='250' cy='214' rx='70' ry='5'/></g>
      <path d='M24 334 L70 300 H150 L176 326 L260 320 L284 298 H340 L372 334Z' fill='#a98fba'/>
      <path d='M300 352 V312 H420 V328 H470 V352Z' fill='#8a74a6'/>${[312, 340, 368, 396, 432, 452].map((x) => `<rect x='${x}' y='334' width='12' height='9' fill='#ffe08a'/>`).join('')}
      <rect x='430' y='290' width='60' height='22' rx='4' fill='#5a4878'/><text x='460' y='306' font-family='Arial, sans-serif' font-size='13' font-weight='700' text-anchor='middle' fill='#7ff4ff'>MOTEL</text><path d='M460 312 V328' stroke='#5a4878' stroke-width='4'/>
      <rect x='24' y='352' width='492' height='46' fill='#7a6e8e'/><path d='M24 376 H516' stroke='#ffe08a' stroke-width='3' stroke-dasharray='22 18'/>
      <path d='M60 352 V200 M44 214 H76 M480 352 V206 M464 220 H496' stroke='#4a3a5a' stroke-width='5'/>
      <path d='M60 214 Q270 250 480 220 M60 224 Q270 262 480 230' stroke='#4a3a5a' stroke-width='1.5' fill='none'/>
      <path d='M184 352 V226' stroke='#5a4878' stroke-width='8'/>
      <path d='M120 168 H246 L246 214 H198 L184 232 L170 214 H120Z' fill='#e63946' stroke='#ffe9a0' stroke-width='3'/>
      ${Array.from({ length: 12 }, (_, i) => `<circle cx='${128 + i * 10.5}' cy='176' r='3' fill='#fff6c0'/>`).join('')}
      <text x='183' y='206' font-family='Arial Black, Arial, sans-serif' font-size='30' font-weight='900' text-anchor='middle' fill='#fff'>EAT</text>
      <g transform='translate(276 344)'><path d='M0 30 L10 16 Q30 4 60 6 L96 4 Q120 4 132 16 L170 14 L176 30Z' fill='#4fb7ad'/><path d='M40 8 L56 -10 H100 L114 8Z' fill='#4fb7ad'/><path d='M48 6 L60 -6 H96 L106 6Z' fill='#cfeef8' opacity='0.8'/>
        <path d='M150 16 L176 6 L172 20Z' fill='#3e9a90'/><rect x='-2' y='26' width='180' height='6' rx='3' fill='url(#ch)'/><path d='M10 20 H170' stroke='#f4f4f4' stroke-width='3'/>
        ${[34, 140].map((x) => `<circle cx='${x}' cy='32' r='11' fill='#1e1a24'/><circle cx='${x}' cy='32' r='6' fill='#f4f4f4'/><circle cx='${x}' cy='32' r='3' fill='#aab'/>`).join('')}<circle cx='172' cy='22' r='3' fill='#ff4a4a'/></g>
      <rect x='24' y='118' width='492' height='32' fill='#f4efe6'/>${Array.from({ length: 5 }, (_, i) => `<path d='M24 ${124 + i * 6}H516' stroke='#d8d0c4' stroke-width='1'/>`).join('')}
      <rect x='262' y='118' width='16' height='280' fill='url(#cv)'/><path d='M70 398 L190 148 H240 L120 398Z M310 398 L430 148 H450 L330 398Z' fill='#fff' opacity='0.12'/>`;
    // The kitchen pass, in the middle: the tickets up, a burger and fries waiting, the cook's hat.
    out += `<rect x='590' y='196' width='420' height='176' rx='8' fill='url(#ch)'/><rect x='602' y='208' width='396' height='146' fill='#efdfc4'/>
      <ellipse cx='800' cy='240' rx='200' ry='60' fill='#ffd08a' opacity='0.45'/>${[680, 800, 920].map((x) => `<rect x='${x - 30}' y='208' width='60' height='10' fill='#d9473a'/>`).join('')}
      <path d='M612 226 H988' stroke='#8e989f' stroke-width='3'/>${[630, 668, 706, 744, 856, 894, 932].map((x, i) => `<path d='M${x} 226 h26 v${26 + (i % 3) * 6} l-4 -3 l-5 3 l-4 -3 l-5 3 l-4 -3 l-4 3Z' fill='#fffdf4'/>`).join('')}
      <g transform='translate(820 304)'><circle cy='24' r='21' fill='#f2c9a5'/><circle cx='-7' cy='20' r='2.6' fill='#2a1a10'/><circle cx='7' cy='20' r='2.6' fill='#2a1a10'/><path d='M-12 32 q12 -7 24 0' stroke='#5a3018' stroke-width='5' fill='none' stroke-linecap='round'/>
        <path d='M-22 6 q-8 -26 12 -26 q8 -12 22 -2 q18 -6 12 28Z' fill='#fff'/><rect x='-21' y='0' width='42' height='10' fill='#f0ebe2'/></g>
      <rect x='584' y='352' width='432' height='18' rx='4' fill='url(#ch)'/>
      <ellipse cx='670' cy='352' rx='40' ry='7' fill='#fff'/><path d='M646 346 q24 -30 48 0Z' fill='#c8842e'/><rect x='646' y='342' width='48' height='6' fill='#6a3a1a'/><path d='M648 341 h44' stroke='#6ab04a' stroke-width='3'/>
      <path d='M730 352 l6 -26 h28 l6 26Z' fill='#e63946'/><path d='M738 326 l2 -14 M746 326 l1 -18 M754 326 l0 -15 M762 326 l-2 -12' stroke='#ffd060' stroke-width='4'/>
      <path d='M912 350 q0 -20 18 -20 q18 0 18 20Z' fill='url(#ch)'/><rect x='908' y='348' width='44' height='5' fill='#555'/>`;
    // The back counter under it: the pie carousel, the shake mixer, the coffee urn.
    out += `<rect x='560' y='540' width='480' height='14' fill='url(#ch)'/><rect x='560' y='554' width='480' height='126' fill='#e4ebee'/><rect x='560' y='620' width='480' height='60' fill='#000' opacity='0.05'/><path d='M680 554V680M800 554V680M920 554V680' stroke='#c4ccd2' stroke-width='2'/>${[960, 984, 1008].map((x, i) => `<path d='M${x} 540 v-${14 + i * 0} h18 v14Z M${x} 524 v-14 h18 v14Z' fill='#fff' stroke='#d0d6da'/>`).join('')}
      <rect x='610' y='440' width='90' height='100' rx='8' fill='#dff4ff' opacity='0.45' stroke='#fff' stroke-width='2'/>${[470, 504].map((y) => `<rect x='614' y='${y}' width='82' height='3' fill='url(#ch)'/><path d='M624 ${y} q14 -18 28 0Z M660 ${y} q14 -18 28 0Z' fill='#f4c0d0'/>`).join('')}<path d='M624 538 q14 -18 28 0Z M660 538 q14 -18 28 0Z' fill='#d9a35a'/>
      <path d='M760 540 V490 H800 V540Z' fill='#6abf9a'/><rect x='756' y='478' width='48' height='14' rx='4' fill='#6abf9a'/><path d='M770 492 V520 M790 492 V520' stroke='#ccd' stroke-width='3'/><path d='M764 540 l2 -22 h10 l2 22Z M784 540 l2 -22 h10 l2 22Z' fill='url(#cv)'/>
      <path d='M880 540 V470 Q880 450 910 450 Q940 450 940 470 V540Z' fill='url(#cv)'/><rect x='896' y='500' width='28' height='8' fill='#333'/><circle cx='930' cy='470' r='4' fill='#ff3a3a'/>`;
    // The pink neon clock and a neon coffee cup, in the gap by the sidebar.
    const tick = Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return `M${vnF1(1098 + Math.sin(a) * 38)} ${vnF1(208 - Math.cos(a) * 38)}L${vnF1(1098 + Math.sin(a) * 44)} ${vnF1(208 - Math.cos(a) * 44)}`; }).join('');
    out += `<circle cx='1098' cy='208' r='80' fill='url(#pg)'/><circle cx='1098' cy='208' r='56' fill='url(#ch)'/><circle cx='1098' cy='208' r='48' fill='#fffaf0' stroke='#ff4f7e' stroke-width='5'/>
      <path d='${tick}' stroke='#2b1d1d' stroke-width='3'/><path d='M1098 208 L1078 220 M1098 208 L1112 178' stroke='#2b1d1d' stroke-width='4' stroke-linecap='round'/><circle cx='1098' cy='208' r='4' fill='#e63946'/>
      <text x='1098' y='236' font-family='Arial, sans-serif' font-size='10' font-weight='700' text-anchor='middle' fill='#e63946'>EAT HERE</text>
      <ellipse cx='1098' cy='372' rx='70' ry='66' fill='url(#pg)'/>
      <g fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='#29d0e0' stroke-width='11' opacity='0.25'><path d='M1068 352 h56 v12 q0 28 -28 28 q-28 0 -28 -28Z M1124 358 q16 0 16 11 q0 11 -16 11 M1058 400 h80'/></g>
        <path d='M1068 352 h56 v12 q0 28 -28 28 q-28 0 -28 -28Z M1124 358 q16 0 16 11 q0 11 -16 11 M1058 400 h80' stroke='#8ff6ff' stroke-width='4'/>
        <path d='M1084 340 q-8 -10 0 -19 q8 -10 0 -19 M1106 340 q-8 -10 0 -19 q8 -10 0 -19' stroke='#ff8ac0' stroke-width='4'/></g>
      <text x='1098' y='432' font-family='Arial, sans-serif' font-size='19' font-weight='700' letter-spacing='3' text-anchor='middle' fill='#8ff6ff' stroke='#29d0e0' stroke-width='0.8'>COFFEE</text>`;
    // Lamps hanging over the counter.
    out += [170, 410, 900].map((x) => `<ellipse cx='${x}' cy='170' rx='110' ry='80' fill='url(#lg)'/><path d='M${x} 103 V118' stroke='#8e989f' stroke-width='2'/>
      <path d='M${x - 26} 146 Q${x - 26} 118 ${x} 118 Q${x + 26} 118 ${x + 26} 146Z' fill='#e63946'/><rect x='${x - 29}' y='144' width='58' height='5' rx='2' fill='url(#ch)'/><ellipse cx='${x}' cy='151' rx='13' ry='4' fill='#fff8d8'/>`).join('');
    // The counter: the top, the red ribbed front, the chrome kick plate.
    out += `<rect y='680' width='1600' height='14' fill='#f7efe2'/><rect y='692' width='1600' height='12' fill='url(#ch)'/><rect y='704' width='1600' height='96' fill='url(#rb)'/>
      <rect y='704' width='1600' height='18' fill='#000' opacity='0.12'/><rect y='784' width='1600' height='10' fill='url(#ch)'/>`;
    // The floor.
    out += `<rect y='${F}' width='1600' height='${900 - F}' fill='#f4ede0'/><path clip-path='url(#r0)' d='${wedges[0].join('')}' fill='#2b2424'/><path clip-path='url(#r1)' d='${wedges[1].join('')}' fill='#2b2424'/>
      <rect y='${F}' width='1600' height='14' fill='#000' opacity='0.18'/><ellipse cx='400' cy='870' rx='300' ry='26' fill='#fff' opacity='0.12'/><ellipse cx='1300' cy='880' rx='260' ry='22' fill='#fff' opacity='0.1'/>`;
    // Along the counter, bottom right: the pie (a slice gone), napkins, ketchup and mustard, a
    // coffee steaming, a shake with two straws, the tip jar. And by the door, the gumball machine.
    out += `<path d='M1226 680 l6 -16 h16 l6 16Z' fill='url(#ch)'/><ellipse cx='1240' cy='662' rx='48' ry='7' fill='url(#ch)'/>
      <path d='M1200 658 Q1240 646 1280 658 L1276 662 Q1240 668 1204 662Z' fill='#d9a35a'/><path d='M1206 656 Q1240 648 1274 656' stroke='#b8222e' stroke-width='5' fill='none'/><path d='M1240 652 L1276 658 L1256 650Z' fill='#f6efe2'/>
      <path d='M1188 664 Q1188 598 1240 594 Q1292 598 1292 664Z' fill='#e6f7ff' opacity='0.3' stroke='#fff' stroke-opacity='0.8' stroke-width='2'/><path d='M1202 640 Q1204 612 1226 604' stroke='#fff' stroke-width='5' fill='none' opacity='0.6' stroke-linecap='round'/><circle cx='1240' cy='590' r='6' fill='url(#ch)'/>
      <rect x='1306' y='640' width='34' height='40' rx='3' fill='url(#cv)'/><path d='M1312 640 q11 -12 22 0' fill='#fff'/>
      <path d='M1350 680 V650 q0 -6 7 -6 q7 0 7 6 V680Z' fill='#d62839'/><path d='M1353 644 l4 -12 l4 12Z' fill='#d62839'/><path d='M1370 680 V650 q0 -6 7 -6 q7 0 7 6 V680Z' fill='#f4c430'/><path d='M1373 644 l4 -12 l4 12Z' fill='#f4c430'/>
      <ellipse cx='1428' cy='680' rx='28' ry='5' fill='#fff'/><path d='M1410 660 h36 v8 q0 12 -18 12 q-18 0 -18 -12Z' fill='#fff'/><path d='M1446 664 q10 0 10 6 q0 6 -10 6' stroke='#fff' stroke-width='3' fill='none'/><ellipse cx='1428' cy='661' rx='17' ry='3' fill='#5a3418'/>
      <path d='M1420 650 q-6 -10 0 -18 q6 -8 0 -16 M1434 650 q-6 -10 0 -18 q6 -8 0 -16' stroke='#fff' stroke-width='3' fill='none' opacity='0.55' stroke-linecap='round'/>
      <path d='M1484 598 L1476 548 M1496 598 L1508 550' stroke='#fff' stroke-width='5'/><path d='M1484 598 L1476 548 M1496 598 L1508 550' stroke='#e63946' stroke-width='5' stroke-dasharray='5 5'/>
      <path d='M1476 680 L1482 640 Q1470 620 1468 604 H1512 Q1510 620 1498 640 L1504 680Z' fill='#ffb3c6' stroke='#fff' stroke-opacity='0.8' stroke-width='2'/><path d='M1466 606 q8 -14 16 -6 q8 -12 16 -2 q8 -10 16 2 q-2 8 -48 6Z' fill='#fff'/><circle cx='1490' cy='590' r='7' fill='#c1121f'/><path d='M1490 584 q2 -10 8 -12' stroke='#3a6a2a' stroke-width='2' fill='none'/>
      <rect x='1544' y='640' width='36' height='40' rx='5' fill='#e6f7ff' opacity='0.4' stroke='#fff' stroke-width='2'/>${[1552, 1562, 1570, 1557, 1566].map((x, i) => `<circle cx='${x}' cy='${673 - (i > 2 ? 6 : 0)}' r='5' fill='#e3b04b'/>`).join('')}<text x='1562' y='660' font-family='Arial, sans-serif' font-size='10' font-weight='700' text-anchor='middle' fill='#c1121f'>TIPS</text>
      <rect x='20' y='648' width='40' height='32' rx='4' fill='url(#cv)'/><rect x='26' y='654' width='28' height='14' fill='#fff6d8'/><path d='M100 680 V660 l6 -10 h12 l6 10 V680Z' fill='#e6f7ff' opacity='0.6'/><rect x='104' y='646' width='16' height='6' fill='url(#ch)'/>`;
    // Stools (not in front of the jukebox), a fedora someone left on one.
    out += [220, 380, 540, 700, 860, 1250, 1400, 1550].map((x) => `<ellipse cx='${x}' cy='892' rx='36' ry='8' fill='#000' opacity='0.2'/><rect x='${x - 6}' y='792' width='12' height='96' fill='url(#cv)'/><ellipse cx='${x}' cy='886' rx='30' ry='7' fill='url(#ch)'/>
      <rect x='${x - 44}' y='770' width='88' height='26' rx='6' fill='#c62834'/><rect x='${x - 44}' y='786' width='88' height='8' fill='url(#ch)'/><ellipse cx='${x}' cy='770' rx='44' ry='10' fill='#e8434f'/><ellipse cx='${x - 10}' cy='767' rx='24' ry='4' fill='#fff' opacity='0.35'/>`).join('');
    out += `<path d='M1372 768 Q1400 776 1428 768 Q1420 763 1413 763 L1409 744 Q1400 739 1391 744 L1387 763 Q1380 763 1372 768Z' fill='#6a5038'/><path d='M1388 758 h24' stroke='#2a1a10' stroke-width='4'/>`;
    // The gumball machine.
    out += `<ellipse cx='80' cy='892' rx='38' ry='7' fill='#000' opacity='0.18'/><rect x='74' y='776' width='12' height='112' fill='url(#cv)'/><ellipse cx='80' cy='886' rx='28' ry='6' fill='url(#ch)'/>
      <path d='M50 744 h60 l-7 34 h-46Z' fill='#d62839'/><rect x='72' y='752' width='16' height='13' rx='3' fill='url(#ch)'/>
      <circle cx='80' cy='708' r='40' fill='#eef9ff' opacity='0.55' stroke='#fff' stroke-width='2'/>
      ${Array.from({ length: 22 }, (_, i) => { const a = r() * Math.PI; const d = 8 + r() * 26; return `<circle cx='${vnF1(80 + Math.cos(a) * d * (r() < 0.5 ? -1 : 1))}' cy='${vnF1(716 + Math.sin(a) * d * 0.7)}' r='7' fill='${pick(r, ['#ff4d6d', '#ffd23f', '#29c0e0', '#7ad06a', '#ff8a3d', '#fff'])}'/>`; }).join('')}
      <path d='M58 690 a28 28 0 0 1 22 -16' stroke='#fff' stroke-width='5' fill='none' opacity='0.85' stroke-linecap='round'/><rect x='64' y='662' width='32' height='9' rx='3' fill='#d62839'/>`;
    // The jukebox, in the gap: bubble tubes round its arch, the records under the dome, the grille.
    out += `<ellipse cx='1098' cy='660' rx='120' ry='190' fill='url(#pg)'/><ellipse cx='1098' cy='872' rx='76' ry='10' fill='#000' opacity='0.25'/>
      <path d='M1034 868 V594 A64 64 0 0 1 1162 594 V868Z' fill='#7a4024'/><path d='M1044 860 V596 A54 54 0 0 1 1152 596 V860' fill='none' stroke='url(#jb)' stroke-width='13'/>
      <path d='M1056 860 V598 A42 42 0 0 1 1140 598 V860' fill='none' stroke='url(#ch)' stroke-width='4'/>
      <path d='M1062 662 V602 A36 36 0 0 1 1134 602 V662Z' fill='#2a1a30'/>${[612, 626, 640, 654].map((y) => `<ellipse cx='1098' cy='${y}' rx='28' ry='4' fill='#1a1014' stroke='#e3b04b' stroke-width='1'/>`).join('')}<path d='M1070 620 Q1074 600 1090 594' stroke='#fff' stroke-width='3' fill='none' opacity='0.5'/>
      <rect x='1062' y='668' width='72' height='26' rx='3' fill='#fff7e0'/>${[674, 681, 688].map((y) => `<path d='M1068 ${y} h26 M1102 ${y} h26' stroke='#c1121f' stroke-width='1.5'/>`).join('')}
      <rect x='1062' y='702' width='72' height='120' rx='6' fill='#3a2018'/><path d='M1062 714 L1134 786 M1062 750 L1134 822 M1062 786 L1098 822 M1134 714 L1062 786 M1134 750 L1062 822 M1134 786 L1098 822 M1062 714 L1098 702 L1134 714' stroke='url(#ch)' stroke-width='3' fill='none'/>
      <rect x='1030' y='856' width='136' height='14' rx='4' fill='url(#ch)'/><path d='M1082 530 h32 l-6 10 h-20Z' fill='url(#ch)'/>`;
    return vnLite(out);
  }

  // The tiki bar's view: the bamboo walls pulled back in the middle onto the beach at dusk. Stars
  // coming out over a sky going from violet to orange, clouds lit from below, the sun going down
  // into the sea with its glitter on the water; out on the horizon the island volcano, quiet but
  // for a wisp of smoke (on the TV it erupts, once in a while: see public/scenery.js), and a sail
  // far off. Palms leaning in, an outrigger canoe pulled up on the sand, footprints down to the
  // water, a starfish and shells, a big carved tiki with a lei round his neck, a surfboard against
  // the wall. Paper lanterns strung along the thatch; a carved mask and a glass float in its net
  // hanging on the bamboo; coconuts and a pineapple heaped in the corner.
  function tikiBeach() {
    const r = seeded(17);
    // A palm: a ringed trunk curving up to a crown of fronds (each a comb of leaflets: a wide
    // dashed stroke, wider near the crown), coconuts in the middle.
    const palm = (x, y, d) => {
      const tx = x + 60 * d;
      const ty = y - 260;
      const trunk = `M${x} ${y} Q${x + 20 * d} ${y - 140} ${tx} ${ty}`;
      let s = `<path d='${trunk}' stroke='#3a2614' stroke-width='18' fill='none' stroke-linecap='round'/><path d='${trunk}' stroke='#160c06' stroke-width='18' fill='none' stroke-dasharray='3 11' opacity='0.7'/>
        <path d='M${x - 5 * d} ${y} Q${x + 15 * d} ${y - 140} ${tx - 5 * d} ${ty}' stroke='#8a6a44' stroke-width='3' fill='none' opacity='0.45'/>`;
      for (const [a, len, c] of [[-60, 140, '#10261a'], [-25, 170, '#132c1c'], [195, 150, '#10261a'], [235, 150, '#132c1c'], [10, 180, '#183a22'], [45, 170, '#1c4226'], [150, 170, '#183a22'], [110, 150, '#1c4226'], [80, 140, '#21492b']]) {
        const t = (a * Math.PI) / 180;
        const ex = tx + Math.cos(t) * len * d;
        const ey = ty + Math.sin(t) * len * 0.5 + 60;
        const cx = tx + Math.cos(t) * len * 0.6 * d;
        const cy = ty + Math.sin(t) * len * 0.5 - 24;
        const mx = (tx + 2 * cx + ex) / 4;
        const my = (ty + 2 * cy + ey) / 4;
        s += `<path d='M${vnF1(tx)} ${ty}Q${vnF1(cx)} ${vnF1(cy)} ${vnF1(ex)} ${vnF1(ey)}' stroke='${c}' stroke-width='22' stroke-dasharray='2.5 3' fill='none'/>
          <path d='M${vnF1(tx)} ${ty}Q${vnF1((tx + cx) / 2)} ${vnF1((ty + cy) / 2)} ${vnF1(mx)} ${vnF1(my)}' stroke='${c}' stroke-width='34' stroke-dasharray='2.5 3' fill='none'/>
          <path d='M${vnF1(tx)} ${ty}Q${vnF1(cx)} ${vnF1(cy)} ${vnF1(ex)} ${vnF1(ey)}' stroke='#3a5a2a' stroke-width='2.5' fill='none'/>`;
      }
      return s + [[-10, 8], [8, 10], [0, 18]].map(([dx, dy]) => `<circle cx='${tx + dx}' cy='${ty + dy}' r='9' fill='#4a3014'/>`).join('');
    };
    let out = `<defs><linearGradient id='tk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#160c2c'/><stop offset='0.28' stop-color='#3a1a52'/><stop offset='0.58' stop-color='#a0406a'/><stop offset='0.84' stop-color='#ff9a5a'/><stop offset='1' stop-color='#ffd28a'/></linearGradient>
      <radialGradient id='crater'><stop offset='0' stop-color='#ffd23f'/><stop offset='0.4' stop-color='#ff6a1a' stop-opacity='0.8'/><stop offset='1' stop-color='#ff3a1a' stop-opacity='0'/></radialGradient>
      <linearGradient id='sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c8708a'/><stop offset='0.12' stop-color='#4a4a82'/><stop offset='0.5' stop-color='#24467a'/><stop offset='1' stop-color='#163058'/></linearGradient>
      <linearGradient id='snd' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#e2be88'/><stop offset='1' stop-color='#9a7448'/></linearGradient>
      <linearGradient id='cn' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#4a3c16'/><stop offset='0.3' stop-color='#8e7a3a'/><stop offset='0.45' stop-color='#b4a052'/><stop offset='0.75' stop-color='#7e6a2e'/><stop offset='1' stop-color='#3a2e10'/></linearGradient>
      <linearGradient id='ws' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#000' stop-opacity='0.5'/><stop offset='1' stop-color='#000' stop-opacity='0'/></linearGradient>
      <linearGradient id='th' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#5a4018'/><stop offset='1' stop-color='#9a7a34'/></linearGradient>
      ${vnGlow('sg', '#ffcf70', 0.45)}${vnGlow('fg', '#ffa040', 0.5)}${vnGlow('lg', '#ffb060', 0.55)}
      <pattern id='bm' width='120' height='90' patternUnits='userSpaceOnUse'>${[0, 1, 2].map((k) => `<rect x='${k * 40 + 3}' width='34' height='90' fill='url(#cn)'/><rect x='${k * 40 + 3}' width='34' height='90' fill='${['#000', '#fff', '#3a2a00'][k]}' opacity='${[0.12, 0.05, 0.1][k]}'/><rect x='${k * 40 + 2}' y='${k * 30}' width='36' height='6' rx='2' fill='#3b3214'/><rect x='${k * 40 + 4}' y='${k * 30 + 6}' width='32' height='2' fill='#fff' opacity='0.18'/>`).join('')}</pattern>
      <pattern id='sw' width='14' height='130' patternUnits='userSpaceOnUse'><path d='M3 0 L7 130 M10 0 L12 130' stroke='#5a4016' stroke-width='2'/></pattern>
      <clipPath id='thc'><path d='M0 0 H1600 V96 ${Array.from({ length: 40 }, (_, i) => `L${1600 - i * 40 - 20} ${114 + (i % 3) * 8} L${1600 - i * 40 - 40} 96`).join(' ')} Z'/></clipPath></defs>
      <rect width='1600' height='470' fill='url(#tk)'/>`;
    // Stars coming out, high up.
    for (let i = 0; i < 46; i++) out += `<circle cx='${vnF1(300 + r() * 1020)}' cy='${vnF1(r() * 230)}' r='${vnF1(0.6 + r() * 1.3)}' fill='#fff' opacity='${vnF1(0.3 + r() * 0.6)}'/>`;
    // Clouds lit from below, and the sun going down.
    out += [[440, 262, 230, 9], [760, 214, 180, 7], [1130, 250, 250, 10], [920, 318, 300, 6], [560, 330, 160, 5]].map(([x, y, w, h]) => `<ellipse cx='${x}' cy='${y}' rx='${w}' ry='${h}' fill='#6a2a52' opacity='0.45'/><ellipse cx='${x}' cy='${y + h * 0.6}' rx='${w * 0.85}' ry='${h * 0.5}' fill='#ffb08a' opacity='0.5'/>`).join('');
    out += `<circle cx='560' cy='392' r='190' fill='url(#sg)'/><circle cx='560' cy='392' r='70' fill='#ffcf70' opacity='0.95'/><circle cx='560' cy='392' r='54' fill='#ffe4a0'/>`;
    // The volcano: lit on its left flank, ridges down it, jungle round its foot; the crater glowing
    // faintly, smoke going up.
    out += `<path d='M760 430 L960 140 Q1000 116 1040 140 L1260 430Z' fill='#3a2030'/><path d='M760 430 L960 140 Q975 132 990 132 L930 300 L880 430Z' fill='#56304a' opacity='0.8'/>
      <path d='M960 140 Q1000 116 1040 140 L1010 170 L990 160 L970 172Z' fill='#5a2a20'/><path d='M975 168 L930 300 L900 420 M1010 172 L1040 290 L1090 420 M995 166 L1000 330' stroke='#2a1424' stroke-width='4' fill='none' opacity='0.7'/>
      <ellipse cx='1000' cy='134' rx='50' ry='20' fill='url(#crater)' opacity='0.35'/><path d='M992 124 Q972 90 994 60 Q1010 36 998 10' stroke='#8a7080' stroke-width='18' fill='none' opacity='0.2' stroke-linecap='round'/>
      <path d='M770 432 q20 -26 40 -8 q16 -20 36 -4 q20 -22 40 -2 q18 -16 36 0 q22 -20 44 0 q18 -14 34 2 q20 -18 40 -2 q22 -20 42 0 q18 -12 34 6 q16 -10 30 8Z' fill='#1a2620'/>
      <path d='M300 434 q60 -26 130 -6 q30 -10 60 6Z M1270 434 q30 -18 70 -4 q20 -4 40 4Z' fill='#3a2038'/><path d='M1318 418 q-4 -14 -10 -20 M1318 418 q6 -14 14 -18 M1342 422 q-2 -12 -8 -18 M1342 422 q6 -12 12 -14' stroke='#3a2038' stroke-width='2' fill='none'/>`;
    // The sea: the sun's glitter on it, waves, a sail far out.
    out += `<rect y='430' width='1600' height='170' fill='url(#sea)'/>
      ${Array.from({ length: 16 }, (_, i) => `<rect x='${vnF1(560 - (8 + i * 4) - r() * 12)}' y='${436 + i * 10}' width='${vnF1(16 + i * 8 + r() * 20)}' height='3' rx='1.5' fill='#ffd8a0' opacity='${vnF1(0.75 - i * 0.03)}'/>`).join('')}
      ${Array.from({ length: 7 }, (_, i) => `<path d='M0 ${444 + i * 20} Q200 ${436 + i * 20} 400 ${444 + i * 20} T800 ${444 + i * 20} T1200 ${444 + i * 20} T1600 ${444 + i * 20}' stroke='#ffb07a' stroke-width='2' fill='none' opacity='${vnF1(0.4 - i * 0.05)}'/>`).join('')}
      <path d='M370 436 h24 l-4 5 h-16Z M382 434 V414 L394 432Z' fill='#2a1a30'/>`;
    // The beach: the wet sand, the foam, footprints down to the water, shells, a starfish.
    out += `<path d='M0 590 Q400 560 800 580 T1600 570 V900 H0Z' fill='url(#snd)'/><path d='M0 592 Q400 562 800 582 T1600 572 V600 Q1200 610 800 604 T0 618Z' fill='#9a7a58' opacity='0.45'/>
      <path d='M0 590 Q400 560 800 580 T1600 570' stroke='#fff' stroke-width='5' fill='none' opacity='0.7'/><path d='M0 600 Q300 584 640 594 T1300 584 T1600 590' stroke='#fff' stroke-width='2' fill='none' opacity='0.35' stroke-dasharray='30 14 8 14'/>
      ${Array.from({ length: 9 }, (_, i) => { const x = 1090 + i * 9 + (i % 2) * 14; const y = 880 - i * 30; return `<ellipse cx='${x}' cy='${y}' rx='5' ry='8' fill='#8a6438' opacity='0.5' transform='rotate(${-14 + i} ${x} ${y})'/>`; }).join('')}
      <path d='M1110 806 l7 -16 l3 15 l15 -6 l-11 12 l12 9 l-16 -2 l-3 15 l-5 -15 l-14 6 l9 -12 l-12 -8Z' fill='#e8704a'/><path d='M1160 860 q14 -20 28 0 Z' fill='#f4d8c0'/><path d='M1168 858 l6 -14 M1174 858 v-15 M1180 858 l-6 -14' stroke='#c8a088' stroke-width='1.5'/>
      <path d='M1036 690 q10 -12 22 0Z' fill='#f0e0d0'/>`;
    // The canoe pulled up on the sand, its outrigger and a paddle.
    out += `<path d='M1040 640 Q1150 660 1300 632 L1290 652 Q1160 676 1050 656Z' fill='#6a3e1c'/><path d='M1044 642 Q1150 660 1298 634' stroke='#a8703a' stroke-width='3' fill='none'/>
      <path d='M1110 650 L1130 616 M1230 642 L1250 610' stroke='#4a2a10' stroke-width='5'/><path d='M1100 616 Q1180 604 1270 608' stroke='#5a3414' stroke-width='9' fill='none' stroke-linecap='round'/>
      <path d='M1060 662 L1130 600' stroke='#5a3414' stroke-width='4'/><path d='M1126 604 q14 -12 20 -4 q-4 12 -18 10Z' fill='#5a3414'/>`;
    // The palms.
    out += palm(400, 600, 1) + palm(1240, 590, -1);
    // The tiki, on the sand: brows, big eyes, a wide mouth of teeth, hands on his belly, a lei.
    out += `<ellipse cx='1240' cy='884' rx='70' ry='12' fill='#000' opacity='0.3'/><path d='M1194 884 V642 Q1194 600 1240 598 Q1286 600 1286 642 V884Z' fill='#5e3c20'/><path d='M1250 600 Q1286 602 1286 642 V884 H1262 Z' fill='#3a2412' opacity='0.6'/>
      <path d='M1194 620 Q1240 606 1286 620 V636 Q1240 624 1194 636Z' fill='#3a2412'/>${[[1220, 656], [1260, 656]].map(([x, y]) => `<ellipse cx='${x}' cy='${y}' rx='15' ry='11' fill='#2a160a'/><ellipse cx='${x}' cy='${y}' rx='9' ry='6' fill='none' stroke='#c89a58' stroke-width='2'/>`).join('')}
      <path d='M1232 664 L1226 692 H1254 L1248 664Z' fill='#4a2e16'/><rect x='1204' y='702' width='72' height='38' rx='10' fill='#2a160a'/>
      <path d='M1210 708 h60 M1210 734 h60' stroke='#e8d8b0' stroke-width='6' stroke-dasharray='6 3'/><path d='M1224 720 q16 10 32 0' fill='#a83a2a'/>
      ${Array.from({ length: 11 }, (_, i) => `<circle cx='${1198 + i * 8.4}' cy='${752 + Math.sin((i / 10) * Math.PI) * 14}' r='6' fill='${['#ff5a8a', '#ffd24a', '#ff8a3a'][i % 3]}'/>`).join('')}
      <path d='M1204 790 q18 -14 36 0 q18 -14 36 0' stroke='#3a2412' stroke-width='6' fill='none'/><path d='M1194 846 l12 -12 l12 12 l12 -12 l12 12 l12 -12 l12 12 l12 -12 l8 8' stroke='#3a2412' stroke-width='4' fill='none'/>`;
    // The bamboo walls either side, lashed at the top and bottom of the opening, shaded towards the
    // edges; the posts.
    out += `<rect width='280' height='900' fill='url(#bm)'/><rect width='280' height='900' fill='url(#ws)'/><rect x='1320' width='280' height='900' fill='url(#bm)'/><rect x='1320' width='280' height='900' fill='url(#ws)' transform='translate(2920 0) scale(-1 1)'/>
      ${[280, 1320].map((x) => `<rect x='${x - 12}' y='0' width='24' height='900' fill='#5a4a20'/><rect x='${x - 6}' y='0' width='5' height='900' fill='#fff' opacity='0.1'/>${[160, 700].map((y) => `<path d='M${x - 14} ${y} h28 M${x - 14} ${y + 10} h28 M${x - 14} ${y + 20} h28' stroke='#2a2010' stroke-width='4'/>`).join('')}`).join('')}`;
    // On the left wall: a carved mask, a glass float in its net, a lei over the post.
    out += `<path d='M110 190 V214' stroke='#2a2010' stroke-width='2'/><path d='M76 222 Q110 206 144 222 L140 300 Q110 336 80 300Z' fill='#6a4424'/><path d='M80 236 Q110 226 140 236 V246 Q110 238 80 246Z' fill='#3a2412'/>
      ${[94, 126].map((x) => `<ellipse cx='${x}' cy='260' rx='11' ry='8' fill='#1e1008'/><circle cx='${x}' cy='260' r='3' fill='#ffb050' opacity='0.6'/>`).join('')}<path d='M104 268 L100 286 H120 L116 268Z' fill='#4a2e16'/><rect x='90' y='292' width='40' height='16' rx='5' fill='#1e1008'/><path d='M94 300 h32' stroke='#e8d8b0' stroke-width='4' stroke-dasharray='4 2'/>
      <path d='M214 140 V164' stroke='#2a2010' stroke-width='2'/><circle cx='214' cy='192' r='27' fill='#3aa898' opacity='0.75'/><circle cx='205' cy='183' r='8' fill='#dffff8' opacity='0.6'/><path d='M190 172 Q214 200 238 172 M187 196 Q214 176 241 196 M196 214 Q214 190 232 214 M214 165 V219' stroke='#c8a060' stroke-width='1.5' fill='none'/>
      ${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<circle cx='${vnF1(280 + Math.cos(a) * 20)}' cy='${vnF1(430 + Math.sin(a) * 30)}' r='6' fill='${['#ff5a8a', '#ffd24a', '#ff8a3a', '#fff0f4'][i % 4]}'/>`; }).join('')}`;
    // On the right: a surfboard against the wall, a torch, a side table with a tiki mug and a
    // coconut drink with its umbrella.
    out += `<g transform='rotate(-5 1380 720)'><ellipse cx='1380' cy='720' rx='34' ry='170' fill='#f4ead8'/><path d='M1350 720 Q1380 560 1410 720 Q1380 880 1350 720Z' fill='#e8572a' opacity='0.85'/><path d='M1380 556 V884' stroke='#3a6a8a' stroke-width='4'/></g>
      <circle cx='1556' cy='610' r='90' fill='url(#fg)'/><path d='M1556 900 V628' stroke='#5a3d1e' stroke-width='10'/><path d='M1542 620 H1570 L1564 646 H1548Z' fill='#8a6a3a'/><path d='M1544 622 q4 -30 12 -40 q2 16 8 6 q6 18 -2 34Z' fill='#ff8a2a'/><path d='M1550 622 q2 -16 6 -22 q4 12 4 22Z' fill='#ffd060'/>
      <rect x='1432' y='778' width='100' height='10' rx='3' fill='#6a5020'/><path d='M1442 788 V880 M1522 788 V880' stroke='#6a5020' stroke-width='8'/>
      <path d='M1446 778 V744 Q1446 736 1460 736 Q1474 736 1474 744 V778Z' fill='#2a8a7a'/><path d='M1450 750 h20 M1452 760 h6 M1462 760 h6' stroke='#174a42' stroke-width='3'/>
      <circle cx='1502' cy='762' r='16' fill='#6b4524'/><path d='M1490 750 h24' stroke='#d8c8a0' stroke-width='3'/><path d='M1504 748 L1520 712' stroke='#e8e0d0' stroke-width='2'/><path d='M1500 714 Q1520 700 1540 714Z' fill='#ff5a8a'/>`;
    // In the corner: coconuts and a pineapple heaped up.
    out += `<path d='M206 846 q-6 -40 14 -46 q20 6 14 46Z' fill='#d89a2a'/><path d='M206 846 q-6 -40 14 -46 q20 6 14 46Z' fill='none' stroke='#8a5a10' stroke-width='2' stroke-dasharray='5 5'/><path d='M220 800 l-12 -24 l12 10 l2 -26 l6 26 l12 -12 l-10 24Z' fill='#3a7a2a'/>
      ${[[180, 876], [214, 880], [248, 874], [196, 852], [232, 856]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='15' fill='#5a3a1a'/><circle cx='${x - 4}' cy='${y - 4}' r='2' fill='#2a1a08'/><circle cx='${x + 3}' cy='${y - 5}' r='2' fill='#2a1a08'/>`).join('')}`;
    // The thatch overhang along the top, in two layers of straw, and the paper lanterns strung
    // under it.
    out += `<path d='M0 0 H1600 V112 ${Array.from({ length: 40 }, (_, i) => `L${1600 - i * 40 - 20} ${126 + (i % 2) * 10} L${1600 - i * 40 - 40} 112`).join(' ')} Z' fill='#4a3410'/>
      <rect width='1600' height='140' fill='url(#th)' clip-path='url(#thc)'/><rect width='1600' height='140' fill='url(#sw)' clip-path='url(#thc)'/><path d='M0 30 H1600 M0 62 H1600' stroke='#3a2808' stroke-width='5' opacity='0.6'/>`;
    out += `<path d='M0 128 ${Array.from({ length: 12 }, (_, i) => `Q${i * 140 + 70} 158 ${(i + 1) * 140} 128`).join(' ')}' stroke='#2a1a08' stroke-width='2' fill='none'/>
      ${Array.from({ length: 11 }, (_, i) => { const x = 140 + i * 140; return `<circle cx='${x}' cy='142' r='30' fill='url(#lg)'/><path d='M${x} 128 V134' stroke='#2a1a08' stroke-width='2'/><ellipse cx='${x}' cy='146' rx='12' ry='14' fill='${['#ff7a3a', '#ffd24a', '#ff4a6a', '#7ae0c0'][i % 4]}'/><path d='M${x - 12} 146 h24 M${x - 10} 139 h20 M${x - 10} 153 h20' stroke='#000' stroke-width='1' opacity='0.25'/><rect x='${x - 5}' y='131' width='10' height='3' fill='#2a1a08'/><rect x='${x - 5}' y='159' width='10' height='3' fill='#2a1a08'/>`; }).join('')}`;
    return vnLite(out);
  }

  // The speakeasy: a hidden bar in a basement, after midnight. Faded damask above mahogany
  // panelling, a brass rail between, a gold deco cornice; brass sconces throwing warm light up the
  // walls; the back bar's arched mirrors and its shelves of bottles lit from below; a poster for
  // the house cocktail, the Bee's Knees (the password); the door with its peephole in the gap by
  // the sidebar, MEMBERS ONLY; whiskey barrels stamped XXX and crates of "maple syrup" in the
  // corner (the gramophone stands on them, on the TV); along the bar a candlestick telephone, the
  // shaker, a Bee's Knees and a martini, a bowl of lemons, the brass cash register; leather stools,
  // a Persian rug, an ace of spades dropped on the floor, and smoke hanging under the ceiling.
  function speakeasyArt() {
    const r = seeded(41);
    const bottles = (x0, x1, y) => {
      let s = '';
      for (let x = x0; x < x1 - 14; x += 16 + r() * 8) {
        const h = 34 + r() * 26;
        const c = pick(r, ['#c87a1a', '#8a4a12', '#2f6b3a', '#d9c8a0', '#6b1a1a', '#a0521a', '#3a5a6b']);
        s += `<path d='M${vnF1(x)} ${y}v-${vnF1(h)}q0-6 4-7v-11h5v11q4 1 4 7v${vnF1(h)}z' fill='${c}'/><rect x='${vnF1(x + 2)}' y='${vnF1(y - h * 0.55)}' width='9' height='9' fill='#e8dcc0' opacity='0.6'/>`;
      }
      return s;
    };
    let out = `<defs>
      <pattern id='dm' width='120' height='160' patternUnits='userSpaceOnUse'><rect width='120' height='160' fill='#3a1418'/>
        <g fill='#5a2228' opacity='0.85'>${[[60, 40], [0, 120], [120, 120]].map(([x, y]) => `<path transform='translate(${x} ${y})' d='M0 -34 C14 -22 22 -8 12 6 C24 4 30 14 22 24 C14 18 6 20 0 34 C-6 20 -14 18 -22 24 C-30 14 -24 4 -12 6 C-22 -8 -14 -22 0 -34Z'/>`).join('')}</g>
        <g fill='none' stroke='#6b2c30' stroke-width='2' opacity='0.6'>${[[0, 40], [120, 40], [60, 120]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='14'/>`).join('')}</g></pattern>
      <linearGradient id='mh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#4e2014'/><stop offset='1' stop-color='#2a0f08'/></linearGradient>
      <linearGradient id='br' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f6dc8a'/><stop offset='0.5' stop-color='#b08d45'/><stop offset='1' stop-color='#6a4a1a'/></linearGradient>
      <linearGradient id='mr' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4a3a34'/><stop offset='0.5' stop-color='#231a18'/><stop offset='1' stop-color='#3a2c28'/></linearGradient>
      <linearGradient id='dk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#000' stop-opacity='0.55'/><stop offset='1' stop-color='#000' stop-opacity='0.1'/></linearGradient>
      ${vnGlow('sc', '#ffc27a', 0.5)}${vnGlow('am', '#ffb050', 0.4)}${vnGlow('sm', '#d8c8b8', 0.09)}</defs>
      <rect width='1600' height='560' fill='url(#dm)'/><rect width='1600' height='560' fill='url(#dk)'/>`;
    // The cornice: dark, with a stepped gold deco trim.
    out += `<rect width='1600' height='44' fill='#1a0b06'/><path d='M0 44 ${'h16v-8h8v8'.repeat(67)}' stroke='#b08d45' stroke-width='2' fill='none'/><rect y='46' width='1600' height='3' fill='#6a4a1a'/>`;
    // The back bar, in the middle: three arched mirrors with shelves of bottles lit from below.
    out += `<rect x='400' y='120' width='620' height='440' fill='#2a0f08'/>${[420, 620, 820].map((x) => `<path d='M${x} 540 V220 A90 90 0 0 1 ${x + 180} 220 V540Z' fill='url(#mr)'/><path d='M${x + 20} 320 L${x + 80} 200 M${x + 50} 340 L${x + 110} 210' stroke='#fff' stroke-width='6' opacity='0.06'/>
      ${[300, 410, 520].map((y) => `<ellipse cx='${x + 90}' cy='${y - 20}' rx='90' ry='40' fill='url(#am)'/><rect x='${x}' y='${y}' width='180' height='7' fill='url(#br)'/>${bottles(x + 8, x + 180, y)}`).join('')}
      <path d='M${x} 540 V220 A90 90 0 0 1 ${x + 180} 220 V540' fill='none' stroke='url(#br)' stroke-width='6'/>`).join('')}
      <path d='M610 120 L710 60 L810 120Z' fill='#2a0f08'/>${Array.from({ length: 7 }, (_, i) => `<path d='M710 118 L${650 + i * 20} 76' stroke='#b08d45' stroke-width='2'/>`).join('')}<path d='M640 120 A70 52 0 0 1 780 120' fill='none' stroke='#b08d45' stroke-width='3'/>`;
    // The poster for the house cocktail, up on the left.
    out += `<rect x='150' y='86' width='176' height='236' fill='url(#br)'/><rect x='158' y='94' width='160' height='220' fill='#141010'/><rect x='166' y='102' width='144' height='204' fill='none' stroke='#b08d45' stroke-width='1.5'/>
      ${Array.from({ length: 9 }, (_, i) => `<path d='M238 236 L${178 + i * 15} 116' stroke='#b08d45' stroke-width='1' opacity='0.35'/>`).join('')}
      <path d='M206 186 H270 L242 214 V238 H254 V244 H222 V238 H234 V214Z' fill='#e8dcc0'/><path d='M212 190 H264 L240 208Z' fill='#f2c84a'/><circle cx='252' cy='184' r='6' fill='#f2c84a' stroke='#e8dcc0'/>
      <g transform='translate(274 150)'><ellipse rx='9' ry='6' fill='#f2c84a'/><path d='M-4 -6 v12 M2 -6 v12' stroke='#141010' stroke-width='2'/><ellipse cx='-2' cy='-8' rx='7' ry='4' fill='#e8dcc0' opacity='0.8'/></g>
      <text x='238' y='132' font-family='Georgia, serif' font-size='17' font-weight='700' letter-spacing='3' text-anchor='middle' fill='#f2c84a'>THE BEE'S</text><text x='238' y='274' font-family='Georgia, serif' font-size='24' font-weight='700' letter-spacing='4' text-anchor='middle' fill='#f2c84a'>KNEES</text>
      <text x='238' y='294' font-family='Georgia, serif' font-size='9' letter-spacing='2' text-anchor='middle' fill='#e8dcc0'>NIGHTLY - 9 TILL LATE</text>`;
    // Brass sconces, the light thrown up the wall above them.
    out += [[86, 260], [1098, 250], [1500, 250]].map(([x, y]) => `<ellipse cx='${x}' cy='${y - 30}' rx='120' ry='150' fill='url(#sc)'/><path d='M${x - 8} ${y + 26} h16 l-4 16 h-8Z' fill='url(#br)'/><path d='M${x} ${y + 26} V${y + 6}' stroke='#b08d45' stroke-width='4'/>
      <path d='M${x - 30} ${y + 6} L${x - 18} ${y - 34} H${x + 18} L${x + 30} ${y + 6}Z' fill='#f6e6c0' opacity='0.9'/><path d='M${x - 18} ${y - 34} L${x} ${y + 6} L${x + 18} ${y - 34} M${x - 30} ${y + 6} H${x + 30}' stroke='#b08d45' stroke-width='2' fill='none'/>`).join('');
    // The deco clock over the door: ten to one.
    out += `<circle cx='1098' cy='120' r='38' fill='url(#br)'/><circle cx='1098' cy='120' r='31' fill='#1a0b06'/>${Array.from({ length: 12 }, (_, i) => `<circle cx='${vnF1(1098 + Math.sin((i * Math.PI) / 6) * 25)}' cy='${vnF1(120 - Math.cos((i * Math.PI) / 6) * 25)}' r='${i % 3 ? 1.5 : 3}' fill='#d9ad52'/>`).join('')}
      <path d='M1098 120 L1102 106 M1098 120 L1080 112' stroke='#d9ad52' stroke-width='3' stroke-linecap='round'/>`;
    // The brass rail, and the mahogany panelling under it.
    out += `<rect y='552' width='1600' height='10' fill='url(#br)'/><rect y='562' width='1600' height='228' fill='url(#mh)'/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x='${i * 140 + 14}' y='586' width='112' height='170' rx='4' fill='#3a160c' stroke='#5e2a18' stroke-width='3'/><rect x='${i * 140 + 24}' y='596' width='92' height='150' rx='3' fill='none' stroke='#1e0a04' stroke-width='3'/>`).join('')}
      <rect y='776' width='1600' height='14' fill='#1e0a04'/>`;
    // The floor: dark boards, and the Persian rug.
    out += `<rect y='790' width='1600' height='110' fill='#1a0b06'/>${Array.from({ length: 17 }, (_, i) => `<path d='M${800 + (i - 8) * 70} 790 L${800 + (i - 8) * 150} 900' stroke='#0e0603' stroke-width='3'/>`).join('')}
      <path d='M330 804 H1270 L1480 900 H120Z' fill='#5a1018'/><path d='M362 812 H1238 L1424 900 H176Z' fill='none' stroke='#b08d45' stroke-width='3'/><path d='M396 822 H1204 L1370 900 H230Z' fill='#6a1820' stroke='#1e2a4a' stroke-width='8' stroke-dasharray='14 6'/>`;
    // The door, in the gap: MEMBERS ONLY, the peephole shut.
    out += `<rect x='1024' y='500' width='148' height='292' fill='#140804'/><rect x='1036' y='512' width='124' height='280' fill='#4a2814'/>
      ${[[1046, 640], [1046, 712], [1102, 640], [1102, 712]].map(([x, y]) => `<rect x='${x}' y='${y}' width='48' height='62' fill='none' stroke='#2a140c' stroke-width='4'/>`).join('')}
      <rect x='1066' y='556' width='64' height='22' rx='2' fill='#120804'/><rect x='1066' y='556' width='64' height='22' rx='2' fill='#6b3a1c' stroke='#b08d45' stroke-width='2'/>
      <rect x='1068' y='596' width='60' height='18' rx='2' fill='url(#br)'/><text x='1098' y='609' font-family='Georgia, serif' font-size='8.5' font-weight='700' letter-spacing='1' text-anchor='middle' fill='#2a1408'>MEMBERS ONLY</text>
      <circle cx='1140' cy='690' r='6' fill='url(#br)'/><rect x='1136' y='700' width='8' height='14' rx='2' fill='#6a4a1a'/>`;
    // The bar's end, bottom right, and what's on it.
    out += `<g transform='translate(0 34)'><rect x='1172' y='652' width='428' height='16' fill='#5e2a18'/><rect x='1172' y='664' width='428' height='5' fill='url(#br)'/><rect x='1172' y='669' width='428' height='121' fill='url(#mh)'/>
      ${[1190, 1330, 1470].map((x) => `<rect x='${x}' y='688' width='120' height='72' rx='4' fill='none' stroke='#5e2a18' stroke-width='3'/>`).join('')}
      <rect x='1172' y='764' width='428' height='5' fill='url(#br)'/>${[1200, 1340, 1480].map((x) => `<rect x='${x}' y='766' width='6' height='22' fill='url(#br)'/>`).join('')}
      <ellipse cx='1236' cy='652' rx='20' ry='5' fill='#141010'/><rect x='1232' y='592' width='8' height='60' fill='#141010'/><path d='M1226 592 l10 -12 l10 12Z' fill='#141010'/><circle cx='1236' cy='578' r='9' fill='#141010'/>
      <path d='M1246 600 h10 v30' stroke='#141010' stroke-width='3' fill='none'/><rect x='1252' y='626' width='9' height='22' rx='4' fill='#141010'/><path d='M1236 652 Q1210 660 1190 650' stroke='#141010' stroke-width='2' fill='none'/>
      <path d='M1290 652 V610 q0 -8 10 -10 h8 q10 2 10 10 V652Z' fill='#c9ccd1'/><path d='M1296 600 l4 -12 h8 l4 12Z' fill='#9aa0a8'/><rect x='1294' y='614' width='4' height='34' fill='#fff' opacity='0.5'/>
      ${[[1350, '#f2c84a'], [1394, '#e8dcc0']].map(([x, c], i) => `<path d='M${x - 18} 618 Q${x} 640 ${x + 18} 618Z' fill='${c}' opacity='0.85'/><path d='M${x - 20} 616 Q${x} 644 ${x + 20} 616' stroke='#e8e4dc' stroke-width='2' fill='none'/><path d='M${x} 632 V650 M${x - 10} 652 h20' stroke='#e8e4dc' stroke-width='2.5'/>${i ? `<circle cx='${x + 4}' cy='624' r='4' fill='#6a8a2a'/><path d='M${x + 4} 624 l10 -16' stroke='#8a6a3a' stroke-width='1.5'/>` : `<path d='M${x - 6} 616 q6 -10 14 -4' stroke='#f6d64a' stroke-width='3' fill='none'/>`}`).join('')}
      <path d='M1430 638 Q1452 656 1474 638Z' fill='#6a4a2a'/>${[[1442, 632], [1456, 628], [1464, 636], [1450, 638]].map(([x, y]) => `<ellipse cx='${x}' cy='${y}' rx='8' ry='6' fill='#f2d24a'/>`).join('')}
      <path d='M1500 652 V600 L1512 560 H1584 L1596 600 V652Z' fill='url(#br)'/><rect x='1516' y='566' width='64' height='26' rx='3' fill='#2a1a08'/><text x='1548' y='584' font-family='Georgia, serif' font-size='13' font-weight='700' text-anchor='middle' fill='#f6dc8a'>$ .25</text>
      ${Array.from({ length: 12 }, (_, i) => `<circle cx='${1514 + (i % 6) * 13}' cy='${612 + Math.floor(i / 6) * 13}' r='4.5' fill='#f4ecd8' stroke='#6a4a1a'/>`).join('')}<path d='M1504 636 H1592' stroke='#6a4a1a' stroke-width='2'/></g>`;
    // Leather stools; an ace of spades on the floor.
    out += [1250, 1410, 1560].map((x) => `<g transform='translate(0 14)'><path d='M${x - 22} 800 L${x - 30} 890 M${x + 22} 800 L${x + 30} 890' stroke='url(#br)' stroke-width='6'/><path d='M${x - 26} 850 H${x + 26}' stroke='url(#br)' stroke-width='4'/>
      <rect x='${x - 40}' y='776' width='80' height='26' rx='10' fill='#5a1a14'/><ellipse cx='${x}' cy='778' rx='40' ry='10' fill='#7a2a1e'/>${[-20, 0, 20].map((d) => `<circle cx='${x + d}' cy='778' r='2' fill='#3a0e08'/>`).join('')}</g>`).join('');
    out += `<g transform='rotate(-18 1196 868)'><rect x='1180' y='846' width='32' height='44' rx='3' fill='#f4ecd8'/><path d='M1196 856 q-10 10 -6 16 q4 4 6 -2 q2 6 6 2 q4 -6 -6 -16Z M1194 870 l-3 8 h10 l-3 -8Z' fill='#141010'/></g>`;
    // In the corner: whiskey barrels stamped XXX, and the crates of "maple syrup".
    out += [[166, 712], [252, 730]].map(([x, y]) => `<path d='M${x - 44} ${y} Q${x - 54} ${y + 80} ${x - 44} ${y + 160} H${x + 44} Q${x + 54} ${y + 80} ${x + 44} ${y}Z' fill='#6a3a1a'/><ellipse cx='${x}' cy='${y}' rx='44' ry='12' fill='#7a4a24'/><ellipse cx='${x}' cy='${y}' rx='34' ry='8' fill='#4a2a10'/>
      ${[24, 136].map((d) => `<path d='M${x - 48} ${y + d} Q${x} ${y + d + 8} ${x + 48} ${y + d}' stroke='#2a1a10' stroke-width='6' fill='none'/>`).join('')}<text x='${x}' y='${y + 92}' font-family='Georgia, serif' font-size='26' font-weight='700' text-anchor='middle' fill='#e8dcc0' opacity='0.75'>XXX</text>`).join('');
    out += `<rect x='4' y='820' width='130' height='80' fill='#8a6a3a'/><path d='M4 846 H134 M4 872 H134' stroke='#5a4020' stroke-width='3'/><text x='69' y='866' font-family='Georgia, serif' font-size='13' font-weight='700' text-anchor='middle' fill='#2a1a08' transform='rotate(-3 69 862)'>MAPLE SYRUP</text>`;
    // Smoke hanging under the ceiling.
    out += [[300, 90, 360], [900, 60, 420], [1380, 110, 300], [620, 170, 260]].map(([x, y, w]) => `<ellipse cx='${x}' cy='${y}' rx='${w}' ry='${w * 0.28}' fill='url(#sm)'/>`).join('');
    return vnLite(out);
  }

  // The casino floor at night: a gold coffered ceiling, crystal chandeliers blazing, red walls
  // between gilded pilasters, and a long bank of slot machines down the far wall, every screen lit.
  // Top left the progressive jackpot board, MEGA JACKPOT $1,000,000, ringed in bulbs; in the gap by
  // the sidebar a big Lucky 7 slot machine, its handle up (on the TV it's pulled, and the reels go:
  // see public/scenery.js); bottom left the roulette wheel and stacks of chips; bottom right the
  // blackjack table, a blackjack dealt, chips, a martini, a cigar burning in the ashtray; under it
  // all, the carpet.
  function casinoArt() {
    const r = seeded(53);
    const chips = (x, y, n, c) => Array.from({ length: n }, (_, i) => `<ellipse cx='${x}' cy='${y - i * 5}' rx='16' ry='6' fill='${c}' stroke='#fff' stroke-width='1.5' stroke-dasharray='4 4'/>`).join('');
    const chandelier = (x, s) => `<g transform='translate(${x} 0) scale(${s})'><ellipse cx='0' cy='120' rx='240' ry='170' fill='url(#cg)'/><path d='M0 0 V40' stroke='#b08a2e' stroke-width='4'/>
      ${[[60, 70, 22], [100, 110, 30], [140, 80, 20]].map(([y, rx, ry]) => `<ellipse cx='0' cy='${y}' rx='${rx}' ry='${ry * 0.35}' fill='none' stroke='url(#gd)' stroke-width='5'/>${Array.from({ length: 11 }, (_, i) => { const xx = vnF1(-rx + (i * rx * 2) / 10); return `<path d='M${xx} ${y} l-4 12 l4 12 l4 -12Z' fill='#fffbe8' opacity='0.85'/>`; }).join('')}`).join('')}
      ${Array.from({ length: 9 }, (_, i) => `<circle cx='${vnF1(-96 + i * 24)}' cy='${100 - Math.abs(4 - i) * 2}' r='5' fill='#fff3c0'/>`).join('')}
      <path d='M-6 40 h12 l8 130 l-14 24 l-14 -24Z' fill='#fffbe8' opacity='0.7'/><path d='M0 192 l-6 14 l6 14 l6 -14Z' fill='#fff'/></g>`;
    let out = `<defs>
      <linearGradient id='gd' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffe9a0'/><stop offset='0.5' stop-color='#c99a2e'/><stop offset='1' stop-color='#7a5a14'/></linearGradient>
      <linearGradient id='wl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a0a10'/><stop offset='1' stop-color='#5a1018'/></linearGradient>
      <radialGradient id='fl' cx='0.5' cy='0' r='1'><stop offset='0' stop-color='#1f8a50'/><stop offset='1' stop-color='#0a4a2a'/></radialGradient>
      ${vnGlow('cg', '#ffd88a', 0.42)}${vnGlow('sg', '#ff6a9a', 0.3)}${vnGlow('yg', '#ffd23f', 0.35)}
      <pattern id='cp' width='64' height='64' patternUnits='userSpaceOnUse'><rect width='64' height='64' fill='#4a0d14'/><path d='M32 4 L60 32 L32 60 L4 32Z' fill='none' stroke='#c99a2e' stroke-width='2' opacity='0.7'/><circle cx='32' cy='32' r='8' fill='none' stroke='#c99a2e' stroke-width='2' opacity='0.6'/><circle cx='32' cy='32' r='3' fill='#1d5c3a'/></pattern>
      <pattern id='cf' width='120' height='60' patternUnits='userSpaceOnUse'><rect width='120' height='60' fill='#1a0608'/><rect x='6' y='6' width='108' height='48' fill='none' stroke='#7a5a1a' stroke-width='3' opacity='0.6'/><rect x='14' y='14' width='92' height='32' fill='#240a0c'/></pattern></defs>
      <rect width='1600' height='560' fill='url(#wl)'/><rect width='1600' height='150' fill='url(#cf)'/><rect y='146' width='1600' height='8' fill='url(#gd)'/>`;
    // Gilded pilasters down the wall.
    out += Array.from({ length: 9 }, (_, i) => `<rect x='${i * 200 - 14}' y='154' width='28' height='406' fill='#2a060a'/><rect x='${i * 200 - 10}' y='154' width='20' height='406' fill='url(#gd)' opacity='0.5'/><rect x='${i * 200 - 20}' y='154' width='40' height='14' fill='url(#gd)'/>`).join('');
    // The slot machines along the far wall, screens lit.
    out += Array.from({ length: 18 }, (_, i) => {
      const x = 380 + i * 68;
      const c = ['#ff3a6a', '#3ad0ff', '#ffd23a', '#7aff9a', '#c07aff'][i % 5];
      return `<ellipse cx='${x + 30}' cy='400' rx='46' ry='70' fill='${c}' opacity='0.12'/><rect x='${x}' y='380' width='60' height='180' rx='8' fill='#2a0a0e'/><rect x='${x + 6}' y='388' width='48' height='26' rx='4' fill='${c}'/><rect x='${x + 8}' y='424' width='44' height='30' rx='3' fill='#f4ecd8'/>
        <path d='M${x + 22} 424 V454 M${x + 37} 424 V454' stroke='#2a0a0e' stroke-width='2'/><circle cx='${x + 30}' cy='374' r='6' fill='${c}'/><rect x='${x + 10}' y='470' width='40' height='8' rx='3' fill='#c99a2e'/>`;
    }).join('');
    out += `<rect y='556' width='1600' height='10' fill='url(#gd)'/>
      <rect x='590' y='196' width='420' height='120' rx='14' fill='url(#gd)'/><rect x='600' y='206' width='400' height='100' rx='9' fill='#1a0204'/>${Array.from({ length: 16 }, (_, i) => `<circle cx='${614 + i * 24.8}' cy='216' r='3.5' fill='#fff3b0'/><circle cx='${614 + i * 24.8}' cy='296' r='3.5' fill='#fff3b0'/>`).join('')}
      <text x='800' y='284' font-family='Georgia, serif' font-size='62' font-weight='700' letter-spacing='8' text-anchor='middle' fill='none' stroke='#ff4d8a' stroke-width='10' opacity='0.25'>CASINO</text><text x='800' y='284' font-family='Georgia, serif' font-size='62' font-weight='700' letter-spacing='8' text-anchor='middle' fill='#ffd0e0' stroke='#ff4d8a' stroke-width='2'>CASINO</text>`;
    // The jackpot board, top left, ringed in bulbs.
    out += `<rect x='14' y='160' width='240' height='122' rx='10' fill='url(#gd)'/><rect x='23' y='169' width='222' height='104' rx='6' fill='#0e0204'/>
      ${Array.from({ length: 12 }, (_, i) => `<circle cx='${24 + i * 20}' cy='164.5' r='3.5' fill='#fff3b0'/><circle cx='${24 + i * 20}' cy='277.5' r='3.5' fill='#fff3b0'/>`).join('')}
      <text x='134' y='200' font-family='Georgia, serif' font-size='17' font-weight='700' letter-spacing='2' text-anchor='middle' fill='#ffd23f'>MEGA JACKPOT</text>
      <text x='134' y='250' font-family='Courier New, monospace' font-size='34' font-weight='700' text-anchor='middle' fill='#ff2a3a' stroke='#ff8a8a' stroke-width='0.6'>$1,000,000</text>`;
    // The chandeliers: one top left, one in the gap by the sidebar.
    out += chandelier(560, 0.9) + chandelier(1098, 0.75);
    // The carpet.
    out += `<rect y='566' width='1600' height='334' fill='url(#cp)'/><rect y='566' width='1600' height='334' fill='#000' opacity='0.45'/>`;
    // Lucky 7, in the gap.
    out += `<ellipse cx='1098' cy='690' rx='110' ry='200' fill='url(#sg)'/><ellipse cx='1098' cy='878' rx='72' ry='10' fill='#000' opacity='0.45'/>
      <path d='M1040 870 V620 Q1040 560 1098 556 Q1156 560 1156 620 V870Z' fill='#b8182a'/><path d='M1040 870 V620 Q1040 560 1098 556 V870Z' fill='#fff' opacity='0.08'/>
      <path d='M1040 620 Q1040 560 1098 556 Q1156 560 1156 620' fill='none' stroke='url(#gd)' stroke-width='6'/><circle cx='1098' cy='546' r='12' fill='#ffd23f'/><circle cx='1098' cy='546' r='22' fill='url(#yg)'/>
      <rect x='1052' y='586' width='92' height='30' rx='4' fill='#1a0204'/><text x='1098' y='609' font-family='Georgia, serif' font-size='20' font-weight='700' text-anchor='middle' fill='#ffd23f'>LUCKY 7</text>
      <rect x='1050' y='628' width='96' height='54' rx='5' fill='url(#gd)'/><rect x='1056' y='634' width='84' height='42' rx='3' fill='#fffaf0'/><path d='M1084 634 V676 M1112 634 V676' stroke='#c8b89a' stroke-width='2'/>
      <text x='1070' y='666' font-family='Georgia, serif' font-size='30' font-weight='900' text-anchor='middle' fill='#c1121f'>7</text><rect x='1088' y='648' width='20' height='14' rx='2' fill='#141414'/><text x='1098' y='659' font-family='Arial, sans-serif' font-size='8' font-weight='900' text-anchor='middle' fill='#fff'>BAR</text>
      <circle cx='1122' cy='660' r='6' fill='#c1121f'/><circle cx='1131' cy='662' r='6' fill='#c1121f'/><path d='M1122 654 Q1126 644 1134 642 M1131 656 L1134 642' stroke='#2a6a2a' stroke-width='2' fill='none'/>
      <rect x='1048' y='694' width='100' height='70' rx='4' fill='#7a0e1a'/>${['7 7 7', 'BAR BAR'].map((t, i) => `<text x='1098' y='${716 + i * 18}' font-family='Arial, sans-serif' font-size='11' font-weight='700' text-anchor='middle' fill='#ffd23f'>${t}${i ? '  ...  250' : '  ...  1000'}</text>`).join('')}
      <rect x='1058' y='776' width='80' height='14' rx='3' fill='#1a0204'/><path d='M1048 816 h100 v40 h-100Z' fill='url(#gd)'/><path d='M1060 824 h76 v24 h-76Z' fill='#3a0a10'/>
      <rect x='1156' y='690' width='10' height='22' rx='3' fill='url(#gd)'/><path d='M1162 694 V600' stroke='url(#gd)' stroke-width='6' stroke-linecap='round'/>`;
    // Bottom left: the roulette wheel and stacks of chips.
    out += `<ellipse cx='150' cy='806' rx='150' ry='54' fill='#3a1a08'/><ellipse cx='150' cy='800' rx='132' ry='46' fill='url(#gd)'/><ellipse cx='150' cy='800' rx='110' ry='37' fill='#5a2a0c'/>
      <ellipse cx='150' cy='800' rx='96' ry='32' fill='none' stroke='#c0182a' stroke-width='18' stroke-dasharray='9 9'/><ellipse cx='150' cy='800' rx='96' ry='32' fill='none' stroke='#141414' stroke-width='18' stroke-dasharray='9 9' stroke-dashoffset='9'/>
      <ellipse cx='150' cy='800' rx='60' ry='20' fill='#8a5a24'/><ellipse cx='150' cy='796' rx='16' ry='6' fill='url(#gd)'/><path d='M150 796 V778 M134 784 H166' stroke='url(#gd)' stroke-width='4'/><circle cx='208' cy='786' r='4' fill='#fff'/>
      ${chips(290, 860, 6, '#c0182a')}${chips(318, 870, 4, '#1a3a8a')}${chips(262, 878, 3, '#141414')}`;
    // Bottom right: the blackjack table with a blackjack dealt, chips, a martini, a cigar.
    out += `<path d='M1172 900 V700 Q1380 640 1600 660 V900Z' fill='#141010'/><path d='M1184 900 V712 Q1380 656 1600 676 V900Z' fill='url(#fl)'/>
      <path id='arc' d='M1210 820 Q1390 740 1590 760' fill='none'/><text font-family='Georgia, serif' font-size='13' font-weight='700' letter-spacing='2' fill='#e8c86a' opacity='0.85'><textPath href='#arc'>BLACKJACK PAYS 3 TO 2</textPath></text>
      <path d='M1230 858 Q1400 790 1590 806' fill='none' stroke='#e8c86a' stroke-width='2' opacity='0.5'/>
      <g transform='rotate(-8 1300 740)'><rect x='1270' y='700' width='46' height='64' rx='5' fill='#fbf8f0' stroke='#b9b1a0'/><text x='1280' y='722' font-family='Georgia, serif' font-size='18' font-weight='700' fill='#141414'>A</text><path d='M1293 730 q-10 12 -6 18 q4 4 6 -2 q2 6 6 2 q4 -6 -6 -18Z M1291 746 l-3 8 h10 l-3 -8Z' fill='#141414'/></g>
      <g transform='rotate(10 1350 740)'><rect x='1322' y='702' width='46' height='64' rx='5' fill='#fbf8f0' stroke='#b9b1a0'/><text x='1332' y='724' font-family='Georgia, serif' font-size='18' font-weight='700' fill='#c1121f'>K</text><path d='M1345 754 l-10 -10 q-6 -8 2 -12 q6 -2 8 4 q2 -6 8 -4 q8 4 2 12Z' fill='#c1121f'/></g>
      ${chips(1430, 760, 5, '#c0182a')}${chips(1466, 768, 7, '#1a6a3a')}${chips(1448, 790, 3, '#141414')}
      <path d='M1520 738 L1560 700 H1480Z' fill='#e8f4f0' opacity='0.5' stroke='#fff' stroke-width='1.5'/><path d='M1520 738 V772 M1504 774 h32' stroke='#e8e4dc' stroke-width='3'/><circle cx='1514' cy='714' r='5' fill='#6a8a2a'/><path d='M1514 714 L1536 690' stroke='#c99a2e' stroke-width='1.5'/>
      <ellipse cx='1260' cy='822' rx='28' ry='9' fill='#2a2a2a'/><ellipse cx='1260' cy='819' rx='20' ry='5' fill='#141414'/><path d='M1240 816 L1296 806' stroke='#6a4024' stroke-width='7' stroke-linecap='round'/><circle cx='1297' cy='806' r='3' fill='#ff6a2a'/>`;
    return vnLite(out);
  }

  // The saloon, in the afternoon: board walls, the sun slanting in through the window in dusty
  // shafts. A wagon-wheel chandelier of oil lamps; out of the window the desert, mesas and a
  // saguaro, a bullet hole in the glass; a NO GUNS sign shot full of holes. The back bar's big
  // mirror under a longhorn skull, its shelves of bottles. In the gap by the sidebar the batwing
  // doors onto the bright street (on the TV they swing when a stranger walks in: see
  // public/scenery.js), a horseshoe over them for luck, a rifle on its pegs and a lantern above;
  // bottom right the old player piano, its stool, a spittoon and the hound asleep; bottom left a
  // poker table, a hand left face up, chips and the bottle, and a chair knocked over.
  // All in one perspective: the floorboards run to a vanishing point at (800, 502), the horizon,
  // and the camera is 2.2 m up, so on the floor at y there are (y - 502) / 2.2 units to the metre
  // (106 at the back wall, y 736; 181 at the bottom of the picture). The door is 2.3 m, the bar
  // 1.1 m, the piano 1.3 m, the bottles 0.3 m; the poker table's so near that its legs go out of
  // the picture (its top 0.75 m up, at 201 to the metre: the cards are 6 cm). The TV's people
  // stand on the same floor, sized by it (perM in public/scenery.js).
  const pokerTable = () => `<ellipse cx='110' cy='800' rx='162' ry='46' fill='#3a1e0e'/><ellipse cx='110' cy='795' rx='148' ry='39' fill='#2f5a34'/><path d='M36 838 V900 M184 838 V900' stroke='#3a1e0e' stroke-width='18'/>
      ${[[52, 792, -12, 'A'], [66, 790, -4, 'A'], [80, 790, 6, '8'], [94, 792, 14, '8']].map(([x, y, a, t], i) => `<g transform='rotate(${a} ${x} ${y})'><rect x='${x - 6.5}' y='${y - 10}' width='13' height='18' rx='2' fill='#fbf8f0'/><text x='${x}' y='${y + 2}' font-family='Georgia, serif' font-size='8' font-weight='700' text-anchor='middle' fill='${i % 2 ? '#c1121f' : '#141414'}'>${t}</text></g>`).join('')}
      ${[[146, 794, 6, '#c0392b'], [158, 798, 4, '#e8dcc0'], [136, 800, 3, '#2a4a8a']].map(([x, y, n, c]) => Array.from({ length: n }, (_, i) => `<ellipse cx='${x}' cy='${vnF1(y - i * 1.5)}' rx='4.5' ry='1.6' fill='${c}' stroke='#2a1608' stroke-width='0.6'/>`).join('')).join('')}
      <path d='M220 788 v-32 q0 -7 5 -10 v-12 h7 v12 q5 3 5 10 v32Z' fill='#5a3a10' opacity='0.9'/><rect x='222' y='760' width='13' height='11' fill='#e8dcc0'/><text x='228.5' y='768' font-family='Georgia, serif' font-size='6' font-weight='700' text-anchor='middle' fill='#3a1a08'>XXX</text>`;
  function saloonArt() {
    const r = seeded(61);
    const hole = (x, y) => `<circle cx='${x}' cy='${y}' r='4' fill='#c8a070' opacity='0.5'/><circle cx='${x}' cy='${y}' r='2.2' fill='#120804'/>`;
    let out = `<defs>
      <pattern id='bd' width='400' height='144' patternUnits='userSpaceOnUse'>${[0, 1, 2].map((k) => `<rect y='${k * 48}' width='400' height='48' fill='${['#6b4422', '#5e3b1d', '#734a26'][k]}'/><rect y='${k * 48 + 45}' width='400' height='3' fill='#2a1608'/><rect y='${k * 48}' width='400' height='2' fill='#fff' opacity='0.06'/>
        <path d='M0 ${k * 48 + 14 + k * 5} Q200 ${k * 48 + 24} 400 ${k * 48 + 12 + k * 6} M0 ${k * 48 + 32} Q160 ${k * 48 + 28 - k * 3} 400 ${k * 48 + 34}' stroke='#2f1b0a' fill='none' opacity='0.35'/><rect x='${[90, 250, 330][k]}' y='${k * 48}' width='3' height='46' fill='#2a1608'/>`).join('')}</pattern>
      <linearGradient id='sb' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ffe0a0' stop-opacity='0'/><stop offset='0.5' stop-color='#ffe0a0' stop-opacity='0.16'/><stop offset='1' stop-color='#ffe0a0' stop-opacity='0'/></linearGradient>
      <linearGradient id='ds' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#8ec0e0'/><stop offset='0.6' stop-color='#f0d8a8'/><stop offset='1' stop-color='#f4c88a'/></linearGradient>
      <linearGradient id='bz' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f6dc8a'/><stop offset='0.5' stop-color='#b8903a'/><stop offset='1' stop-color='#6a4a1a'/></linearGradient>
      <linearGradient id='dk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#000' stop-opacity='0.45'/><stop offset='0.4' stop-color='#000' stop-opacity='0'/></linearGradient>
      ${vnGlow('lp', '#ffcf7a', 0.5)}${vnGlow('dg', '#fff0c8', 0.6)}</defs>
      <rect width='1600' height='720' fill='url(#bd)'/><rect width='1600' height='720' fill='url(#dk)'/>`;
    // The rafters.
    out += `<rect width='1600' height='34' fill='#2a1608'/>${Array.from({ length: 9 }, (_, i) => `<rect x='${i * 200 - 20}' y='0' width='40' height='52' fill='#3a2210'/><rect x='${i * 200 - 20}' y='48' width='40' height='6' fill='#1a0c04'/>`).join('')}`;
    // The back bar: the mirror under the longhorn skull, shelves of bottles either side.
    out += `<rect x='430' y='150' width='560' height='490' fill='#3a2210'/><rect x='520' y='196' width='380' height='230' rx='6' fill='#5a3a1a'/><rect x='532' y='208' width='356' height='206' fill='#7a8a8a' opacity='0.55'/><path d='M560 400 L640 216 H680 L600 400Z M700 400 L780 216 H800 L720 400Z' fill='#fff' opacity='0.12'/>
      ${[[440, 515], [905, 980]].map(([a, b]) => [260, 360, 460].map((y) => `<rect x='${a}' y='${y}' width='${b - a + 10}' height='6' fill='#2a1608'/>${Array.from({ length: 4 }, (_, i) => { const c = pick(r, ['#5a3a10', '#2f5a2a', '#8a5a1a', '#3a2a1a', '#a0702a']); const h = 14 + r() * 8; const x = a + 8 + i * 17; return `<path d='M${x} ${y}v-${vnF1(h)}q0-4 3-5v-7h4v7q3 1 3 5v${vnF1(h)}z' fill='${c}'/>`; }).join('')}`).join('')).join('')}
      <path d='M704 178 q-14 -46 -4 -62 q14 -10 28 0 q10 16 -4 62Z' fill='#e8dcc0'/><path d='M702 128 Q640 130 600 96 Q590 84 604 86 Q650 112 704 120 M726 128 Q788 130 828 96 Q838 84 824 86 Q778 112 724 120' fill='#e8dcc0'/><circle cx='708' cy='136' r='4' fill='#2a1608'/><circle cx='720' cy='136' r='4' fill='#2a1608'/><circle cx='710' cy='170' r='2' fill='#2a1608'/><circle cx='718' cy='170' r='2' fill='#2a1608'/>`;
    // The window, up on the left: the desert, a bullet hole in the glass, the curtain.
    out += `<rect x='140' y='100' width='220' height='240' fill='#2a1608'/><rect x='152' y='112' width='196' height='216' fill='url(#ds)'/><circle cx='300' cy='170' r='22' fill='#fff8e0'/>
      ${/* (Up above the horizon: a tall mesa's top and a big saguaro close by, not the desert floor.) */ ''}<path d='M152 268 L180 236 H230 L246 258 L290 252 L304 232 H348 V328 H152Z' fill='#c8784a'/><path d='M152 300 Q250 290 348 304 V328 H152Z' fill='#a8603a'/>
      <g transform='translate(224 324) scale(1.7) translate(-214 -320)'><path d='M206 324 V262 q0 -8 8 -8 q8 0 8 8 V324 M206 288 h-10 q-6 0 -6 -6 v-14 M222 280 h10 q6 0 6 -6 v-12' stroke='#3a5a2a' stroke-width='8' fill='none' stroke-linecap='round'/></g>
      <rect x='140' y='328' width='220' height='12' fill='#2a1608'/><path d='M250 112 V328 M152 220 H348' stroke='#2a1608' stroke-width='8'/><circle cx='298' cy='274' r='4' fill='#2a1608'/><path d='M298 274 l-14 -10 M298 274 l16 -6 M298 274 l4 16 M298 274 l-12 12 M298 274 l2 -18' stroke='#fff' stroke-width='1.2' opacity='0.8'/>
      <path d='M140 96 H190 Q172 200 196 332 Q170 340 140 336Z' fill='#8a2a1a'/><path d='M150 100 Q160 200 156 330' stroke='#5a1a0e' stroke-width='3' fill='none'/><path d='M186 300 l-8 12 l10 -2Z' fill='#2a1608'/>`;
    // The sun coming in through it, in shafts across the room.
    out += `<path d='M152 112 L348 112 L900 900 L520 900Z' fill='url(#sb)'/><path d='M200 112 L300 112 L700 900 L560 900Z' fill='url(#sb)'/>`;
    // The NO GUNS sign, shot full of holes.
    out += `<g transform='rotate(-6 74 380)'><rect x='14' y='350' width='124' height='56' rx='4' fill='#c8a070'/><rect x='14' y='350' width='124' height='56' rx='4' fill='none' stroke='#5a3a1a' stroke-width='3'/><text x='76' y='388' font-family='Georgia, serif' font-size='24' font-weight='700' text-anchor='middle' fill='#3a1a08'>NO GUNS</text>${hole(40, 366)}${hole(98, 372)}${hole(118, 394)}</g>${hole(170, 420)}${hole(380, 90)}`;
    // The wagon-wheel chandelier, its oil lamps lit.
    out += `<ellipse cx='420' cy='130' rx='240' ry='150' fill='url(#lp)'/><path d='M330 30 L420 110 L510 30 M420 34 V110' stroke='#1a0c04' stroke-width='2' fill='none'/>
      <ellipse cx='420' cy='120' rx='100' ry='20' fill='none' stroke='#3a2210' stroke-width='9'/>${Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return `<path d='M420 120 L${vnF1(420 + Math.cos(a) * 96)} ${vnF1(120 + Math.sin(a) * 19)}' stroke='#3a2210' stroke-width='4'/>`; }).join('')}<circle cx='420' cy='120' r='9' fill='#2a1608'/>
      ${[-80, -40, 0, 40, 80].map((dx) => `<rect x='${413 + dx}' y='${80 + Math.abs(dx) * 0.06}' width='14' height='26' rx='5' fill='#fff0c0' opacity='0.9'/><rect x='${411 + dx}' y='${104 + Math.abs(dx) * 0.06}' width='18' height='7' fill='#5a3a1a'/>`).join('')}`;
    // The floor: boards in perspective, sawdust.
    // (Boards a third of a metre wide, running to the vanishing point at (800, 502).)
    out += `<rect y='720' width='1600' height='16' fill='#2a1608'/><rect y='736' width='1600' height='164' fill='#4a2e16'/>${Array.from({ length: 49 }, (_, i) => `<path d='M${vnF1(800 + (i - 24) * 35.5)} 736 L${vnF1(800 + (i - 24) * 60.3)} 900' stroke='#2a1608' stroke-width='2.5'/>`).join('')}
      ${Array.from({ length: 60 }, () => `<circle cx='${vnF1(r() * 1600)}' cy='${vnF1(740 + r() * 160)}' r='1.6' fill='#c8a070' opacity='0.35'/>`).join('')}<rect y='736' width='1600' height='40' fill='#000' opacity='0.2'/>`;
    // The bar, standing on the floor a little out from the back bar: 1.1 m, the brass foot rail.
    out += `<rect x='410' y='626' width='600' height='14' fill='#7a4a22'/><rect x='420' y='640' width='580' height='112' fill='#4a2a12'/>${[430, 575, 720, 865].map((x) => `<rect x='${x}' y='652' width='125' height='62' rx='4' fill='none' stroke='#2a1608' stroke-width='4'/>`).join('')}<rect x='420' y='728' width='580' height='5' fill='url(#bz)'/>`;
    // The gap: a lantern and the rifle on its pegs, the horseshoe, the batwing doors onto the street.
    out += `<circle cx='1098' cy='200' r='70' fill='url(#lp)'/><path d='M1098 60 V170' stroke='#1a0c04' stroke-width='2'/><path d='M1086 172 h24 l-3 8 h-18Z M1086 222 h24 l-3 8 h-18Z' fill='#2a1608'/><rect x='1088' y='180' width='20' height='42' rx='4' fill='#ffd890' opacity='0.9'/><path d='M1098 180 V222' stroke='#2a1608' stroke-width='2'/>
      <path d='M1040 324 v14 M1156 324 v14' stroke='#2a1608' stroke-width='6'/><path d='M1032 330 L1128 324 L1164 326 L1166 334 L1128 334 L1100 342 L1058 344 Q1040 346 1032 338Z' fill='#5a3414'/><path d='M1110 330 H1168' stroke='#3a3a3a' stroke-width='4'/>
      <path d='M1090 468 a8 8 0 1 1 16 0' stroke='#9a9a9a' stroke-width='3.5' fill='none' transform='rotate(180 1098 468)'/>
      ${/* The doorway: 2.3 m by 1.1, on the floor at the back wall. Out in the sun the street, 2.2 m eyes seeing over it to the false fronts across the way (their boardwalk 24 m off), a hitching rail and a trough in front. */ ''}
      <rect x='1028' y='479' width='140' height='257' fill='#2a1608'/><rect x='1040' y='491' width='116' height='245' fill='url(#ds)'/>
      <path d='M1040 491 H1086 V586 H1040Z' fill='#a8784a'/><path d='M1108 491 H1156 V586 H1108Z' fill='#c89060'/><path d='M1086 540 L1096 528 L1108 536 V586 H1086Z' fill='#c8784a' opacity='0.8'/>
      <path d='M1044 508 h18 v42 h-18Z M1134 508 h18 v42 h-18Z' fill='#5a3a20' opacity='0.7'/><path d='M1066 586 v-80 h15 v80Z M1113 586 v-80 h15 v80Z' fill='#3a2210' opacity='0.75'/>
      <rect x='1040' y='582' width='116' height='6' fill='#8a5a30'/><path d='M1040 588 H1156 V736 H1040Z' fill='#e0b078'/><circle cx='1098' cy='690' r='130' fill='url(#dg)'/>
      <path d='M1046 594 V552 M1092 594 V552 M1042 556 H1096' stroke='#5a3a20' stroke-width='3' fill='none'/><path d='M1116 594 v-14 h32 v14Z' fill='#6a4424'/><path d='M1116 580 h32' stroke='#8ec0e0' stroke-width='2'/>`;
    // Bottom right: the player piano (its roll window, the keys), the stool, the spittoon, the hound.
    // (Its feet on the floor at 880, 172 to the metre there: 1.5 m wide, squashed to 1.3 m high.
    // The TV's keys and roll go over it squashed the same way: PIANO_SQ in public/scenery.js.)
    out += `<g transform='translate(0 880) scale(1 0.656) translate(0 -880)'><rect x='1196' y='540' width='260' height='300' fill='#3a1e0e'/><rect x='1196' y='540' width='260' height='16' fill='#5a3018'/><rect x='1212' y='600' width='228' height='56' rx='4' fill='#1e0e06'/>
      <rect x='1290' y='608' width='72' height='40' fill='#f0e6cc'/>${Array.from({ length: 14 }, (_, i) => `<rect x='${1294 + (i % 7) * 10}' y='${612 + Math.floor(i / 7) * 18 + (i % 3) * 3}' width='4' height='3' fill='#3a2a1a'/>`).join('')}
      ${[1236, 1416].map((x) => `<rect x='${x - 3}' y='612' width='6' height='30' fill='url(#bz)'/><circle cx='${x}' cy='608' r='5' fill='#ffe8a0'/><circle cx='${x}' cy='608' r='14' fill='url(#lp)'/>`).join('')}
      <rect x='1196' y='660' width='260' height='12' fill='#2a1608'/><rect x='1204' y='672' width='244' height='26' fill='#f4ecd8'/>${Array.from({ length: 24 }, (_, i) => `<path d='M${1204 + i * 10.2} 672 V698' stroke='#b8ae98' stroke-width='1'/>`).join('')}
      ${Array.from({ length: 24 }, (_, i) => ([1, 2, 4, 5, 6].includes(i % 7) ? `<rect x='${1210 + i * 10.2}' y='672' width='6' height='15' fill='#1a1008'/>` : '')).join('')}
      <rect x='1196' y='698' width='260' height='10' fill='#2a1608'/>${[1214, 1334].map((x) => `<rect x='${x}' y='722' width='104' height='90' rx='4' fill='none' stroke='#5a3018' stroke-width='4'/><path d='M${x + 52} 740 q-20 18 0 36 q20 -18 0 -36Z' fill='#5a3018'/>`).join('')}
      <path d='M1206 840 v40 M1446 840 v40' stroke='#2a1608' stroke-width='10'/><rect x='1310' y='846' width='12' height='14' fill='url(#bz)'/><rect x='1330' y='846' width='12' height='14' fill='url(#bz)'/></g>
      <ellipse cx='1326' cy='800' rx='34' ry='9' fill='#6a1a10'/><rect x='1292' y='800' width='68' height='11' fill='#4a120a'/><path d='M1302 811 L1294 890 M1350 811 L1358 890 M1326 811 V890' stroke='#2a1608' stroke-width='6'/>
      <g transform='translate(1176 896) scale(0.72) translate(-1176 -896)'><path d='M1162 896 q-24 0 -20 -26 q4 -18 18 -22 h32 q14 4 18 22 q4 26 -20 26Z' fill='url(#bz)'/><ellipse cx='1176' cy='846' rx='22' ry='6' fill='#3a2a10'/></g>
      <ellipse cx='1530' cy='886' rx='80' ry='12' fill='#000' opacity='0.3'/>${/* The hound asleep: the TV's character kit (see critter() in public/scenery.js), pasted from
        Scenery.kit.critter.at('dog', 1522, 894, 150, { pose: 'sleep', color: '#9a6434', flip: true }). */ ''}<g transform='translate(1597 804) scale(-1.5 1.5)'><g transform='translate(50 60) scale(1) translate(-50 -60)'><g><path d='M14 56 Q10 34 38 32 Q64 30 72 42 Q78 54 66 57 H20 Q14 57 14 56Z' fill='#9a6434' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><path d='M18 55 Q8 52 10 44' fill='none' stroke='#1c1410' stroke-width='7.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M18 55 Q8 52 10 44' fill='none' stroke='#9a6434' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'/><circle cx='76' cy='47' r='9.5' fill='#9a6434' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M80 46 H92 Q97 46 97 51 Q97 56 92 56 H80Z' fill='#9a6434' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M69 40 Q64 46 68 56 Q73 55 74 43Z' fill='#774e2a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><ellipse cx='95.5' cy='49' rx='2' ry='1.7' fill='#1c1410'/><path d='M78 45 q2 1.8 4 0' stroke='#1c1410' stroke-width='1.3' fill='none' stroke-linecap='round'/></g></g>`;
    // Bottom left: the poker table, a hand left face up, chips, the bottle; a chair knocked over.
    // (Its top's 0.75 m up, 201 units to the metre there: 1.6 m across. The TV lays the same table
    // over its people, who stand behind it: POKER_TABLE in public/scenery.js, keep the two alike.)
    out += `<g transform='rotate(-70 400 884) translate(400 884) scale(1.15 1.6) translate(-305 -900)'><rect x='270' y='850' width='70' height='10' fill='#5a3418'/><path d='M276 860 V900 M334 860 V900 M276 850 V800 M334 850 V800 M276 806 H334 M276 826 H334' stroke='#5a3418' stroke-width='6'/></g>
      ${pokerTable()}`;
    return vnLite(out);
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

  // Damask wallpaper: a gold-on-burgundy pattern, faded with age.
  const damask = () => tile(120, 160, `<rect width='120' height='160' fill='#3a1418'/>
    <g fill='#5a2228' opacity='0.85'>${[[60, 40], [0, 120], [120, 120]].map(([x, y]) => `<path transform='translate(${x} ${y})' d='M0 -34 C14 -22 22 -8 12 6 C24 4 30 14 22 24 C14 18 6 20 0 34 C-6 20 -14 18 -22 24 C-30 14 -24 4 -12 6 C-22 -8 -14 -22 0 -34Z'/>`).join('')}</g>
    <g fill='#6b2c30' opacity='0.6'>${[[0, 40], [120, 40], [60, 120]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='6'/><circle cx='${x}' cy='${y}' r='14' fill='none' stroke='#6b2c30' stroke-width='2'/>`).join('')}</g>`);

  // A scene filling the whole screen without being stretched: cropped to fit instead.
  const scene = (body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'>${body}</svg>`)}")`;

  // ---------- Outdoors: the Italian vineyard ----------
  // The view from the terrace, in the afternoon or at sunset: the sky (fair clouds, or long ones
  // lit rose and gold, the sun going down between the TV's table and its sidebar), the far hills
  // fading blue with a hill town of tall towers on one, then nearer hills striped with rows of
  // vines following the slopes, an olive grove, a wheat field with round bales, the white road
  // climbing between cypresses to the farmhouse and its tower, and on the terrace wall a pot of
  // lemons and geraniums on the left, and a straw-wrapped bottle of Chianti, two glasses, bread
  // and cheese on the right. (The pergola and the wall are drawn over it: pergola(), stoneWall().
  // Nonna, the Vespa, the grape stomping and the swallows are on the TV: SCENES.vineyard.)
  function tuscany(sunset) {
    const rand = seeded(29);
    const c = sunset
      ? { sky: ['#2e2248', '#a24a68', '#f09a52'], far: ['#7a4e6e', '#946070'], mid: '#9a6a3a', near: '#6e5020', rows: '#3e2a0c', lit: '#f0b070', house: '#d0905a', roof: '#8a3a1a', cypress: '#1c1810', road: '#eab888', olive: '#5a5a3a', wheat: '#d8984a', sun: '#ffe0a0', win: '#ffcf6a', cloud: '#5a3050' }
      : { sky: ['#3a7cc4', '#86b8e4', '#e4eef0'], far: ['#94aac4', '#a6b8c8'], mid: '#a0ae52', near: '#7a9636', rows: '#4a6420', lit: '#c8d878', house: '#e8d0a4', roof: '#c2552d', cypress: '#22381a', road: '#f4e8cc', olive: '#8a9a6a', wheat: '#e8c460', sun: '#fffbe8', win: '#5a4a3a', cloud: '#ffffff' };
    const [sx, sy] = sunset ? [1100, 392] : [1100, 140];
    let out = `<defs><linearGradient id='vsk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.sky[0]}'/><stop offset='0.62' stop-color='${c.sky[1]}'/><stop offset='1' stop-color='${c.sky[2]}'/></linearGradient>
      <radialGradient id='vsn'><stop offset='0' stop-color='${c.sun}'/><stop offset='0.15' stop-color='${c.sun}' stop-opacity='0.6'/><stop offset='1' stop-color='${c.sun}' stop-opacity='0'/></radialGradient>
      <linearGradient id='vhz' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.sky[2]}' stop-opacity='0'/><stop offset='1' stop-color='${c.sky[2]}' stop-opacity='0.55'/></linearGradient></defs>
      <rect width='1600' height='520' fill='url(#vsk)'/><circle cx='${sx}' cy='${sy}' r='${sunset ? 320 : 220}' fill='url(#vsn)'/><circle cx='${sx}' cy='${sy}' r='${sunset ? 56 : 40}' fill='${c.sun}'/>`;
    // Clouds: fair-weather puffs, or long streaks lit from below at sunset.
    out += sunset
      ? [[80, 150, 460], [600, 100, 520], [1040, 220, 420], [300, 270, 360], [860, 300, 300]].map(([x, y, w]) => `<path d='M${x} ${y} q${w * 0.3} -16 ${w * 0.62} -4 q${w * 0.24} -10 ${w * 0.38} 4 q-${w / 2} 9 -${w} 0Z' fill='${c.cloud}' opacity='0.75'/><path d='M${x + w * 0.06} ${y + 1} q${w * 0.44} 7 ${w * 0.9} 0' stroke='#ffb070' stroke-width='3' fill='none' opacity='0.7' stroke-linecap='round'/>`).join('')
      : [[60, 200, 1], [560, 120, 0.8], [980, 250, 0.7], [1300, 160, 1.1]].map(([x, y, s]) => [[0, 0, 40], [34, -16, 46], [76, -6, 38], [104, 6, 26], [-30, 8, 26]].map(([dx, dy, r]) => `<circle cx='${x + dx * s}' cy='${y + dy * s}' r='${r * s}' fill='${c.cloud}' opacity='0.85'/>`).join('')).join('');
    // The far hills, and the hill town on one: walls, roofs, the tall towers.
    out += `<path d='M0 470 Q140 380 300 400 Q420 330 560 392 Q760 352 920 400 Q1100 360 1260 410 Q1440 370 1600 400 V560 H0Z' fill='${c.far[0]}'/>
      <path d='M0 500 Q220 430 460 470 Q700 440 900 476 Q1180 440 1600 470 V600 H0Z' fill='${c.far[1]}'/>`;
    const towers = [[60, 330, 16], [86, 300, 14], [112, 320, 18], [140, 290, 14], [170, 340, 16], [196, 310, 12]];
    out += `<g fill='${sunset ? c.far[0] : '#c4b49a'}'>${towers.map(([x, y, w]) => `<rect x='${x}' y='${y}' width='${w}' height='${410 - y}'/>`).join('')}<path d='M40 410 L52 362 H230 L246 410Z'/></g>
      <g fill='${sunset ? '#4a2e40' : '#9a8a72'}'>${towers.map(([x, y, w]) => `<rect x='${x + w - 4}' y='${y}' width='4' height='${410 - y}'/>`).join('')}</g>
      ${sunset ? '' : `${[[54, 374, 30], [100, 380, 34], [150, 372, 28], [196, 378, 32]].map(([x, y, w]) => `<path d='M${x} ${y} l${w / 2} -10 l${w / 2} 10Z' fill='#b8603a'/>`).join('')}${towers.map(([x, y]) => `<rect x='${x + 5}' y='${y + 8}' width='3' height='5' fill='#5a4a3a'/>`).join('')}`}
      ${sunset ? [[64, 350], [90, 320], [116, 340], [144, 310], [174, 360], [100, 380], [150, 380], [200, 370]].map(([x, y]) => `<rect x='${x}' y='${y}' width='4' height='5' fill='${c.win}' opacity='0.9'/>`).join('') : ''}
      <rect y='380' width='1600' height='220' fill='url(#vhz)'/>`;
    // The nearer hills, striped with vines along their slopes (each row a dashed line of vines
    // with a lit edge), an olive grove on the left, a wheat field with round bales.
    const hill = (d, fill) => `<path d='${d}' fill='${fill}'/>`;
    const rows = (y0, y1, n, w, bend) => Array.from({ length: n }, (_, i) => {
      const y = y0 + ((y1 - y0) * i) / n;
      return `<path d='M-20 ${(y + bend).toFixed(0)} Q400 ${(y - bend * 0.6).toFixed(0)} 800 ${(y + bend * 0.4).toFixed(0)} T1620 ${y.toFixed(0)}' stroke='${c.rows}' stroke-width='${(w + i * 0.7).toFixed(1)}' fill='none' stroke-dasharray='${(5 + i).toFixed(0)} ${(3 + i * 0.4).toFixed(1)}'/><path d='M-20 ${(y + bend - 3 - i * 0.3).toFixed(0)} Q400 ${(y - bend * 0.6 - 3 - i * 0.3).toFixed(0)} 800 ${(y + bend * 0.4 - 3 - i * 0.3).toFixed(0)} T1620 ${(y - 3 - i * 0.3).toFixed(0)}' stroke='${c.lit}' stroke-width='${(1 + i * 0.25).toFixed(1)}' fill='none' opacity='0.45' stroke-dasharray='${(5 + i).toFixed(0)} ${(3 + i * 0.4).toFixed(1)}'/>`;
    }).join('');
    out += hill('M0 540 Q260 470 560 520 Q860 560 1100 500 Q1340 450 1600 500 V900 H0Z', c.mid) + rows(536, 620, 6, 2.6, 26);
    out += `<path d='M980 560 Q1100 520 1240 540 L1260 620 Q1120 640 980 620Z' fill='${c.wheat}'/>${[[1040, 600, 14], [1110, 594, 12], [1180, 606, 15], [1080, 620, 16]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${sunset ? '#b07030' : '#d0a040'}'/><circle cx='${x - r * 0.2}' cy='${y - r * 0.2}' r='${r * 0.5}' fill='none' stroke='${sunset ? '#8a5020' : '#a88028'}' stroke-width='2'/><ellipse cx='${x + r * 0.8}' cy='${y + r}' rx='${r}' ry='3' fill='#000' opacity='0.15'/>`).join('')}`;
    out += hill('M0 650 Q320 570 700 630 Q1000 680 1300 610 Q1460 580 1600 600 V900 H0Z', c.near) + rows(650, 790, 8, 3.6, 40);
    // The olive grove, silvery, on the slope at the left.
    for (let i = 0; i < 9; i++) {
      const x = 10 + (i % 5) * 52 + (i > 4 ? 26 : 0);
      const y = 540 + (i > 4 ? 40 : 0) + rand() * 10;
      out += `<path d='M${x} ${y + 26} v-16' stroke='#4a3a24' stroke-width='4'/><ellipse cx='${x}' cy='${y}' rx='24' ry='18' fill='${c.olive}'/><ellipse cx='${x - 6}' cy='${y - 6}' rx='12' ry='8' fill='${sunset ? '#7a7a4a' : '#b0bc90'}' opacity='0.8'/>`;
    }
    // The white road up between the cypresses to the farmhouse, and its tower.
    const cypress = (x, y, h) => `<path d='M${x} ${y} Q${x - h * 0.13} ${y - h * 0.45} ${x} ${y - h} Q${x + h * 0.13} ${y - h * 0.45} ${x} ${y}Z' fill='${c.cypress}'/><path d='M${x} ${y - h} Q${x + h * 0.13} ${y - h * 0.45} ${x} ${y}' fill='${sunset ? '#4a3018' : '#3a5a2a'}' opacity='0.6'/>`;
    out += `<path d='M1000 900 Q960 760 1060 660 Q1130 590 1080 520 Q1050 480 1090 452' stroke='${c.road}' stroke-width='18' fill='none' stroke-linecap='round'/>
      ${[[1036, 780, 150], [1110, 640, 120], [1050, 700, 130], [1120, 560, 90], [1060, 520, 70], [1110, 490, 56]].map(([x, y, h]) => cypress(x, y, h)).join('')}
      <g transform='translate(1000 380)'><rect x='0' y='30' width='120' height='60' fill='${c.house}'/><path d='M-8 32 L60 4 L128 32Z' fill='${c.roof}'/><rect x='84' y='-14' width='30' height='104' fill='${c.house}'/><path d='M80 -12 L99 -26 L118 -12Z' fill='${c.roof}'/>
        ${[[14, 50], [40, 50], [66, 50], [92, 8], [92, 40]].map(([x, y]) => `<rect x='${x}' y='${y}' width='11' height='15' fill='${c.win}'/>`).join('')}<rect x='0' y='86' width='120' height='4' fill='#000' opacity='0.15'/></g>
      ${[[140, 600, 110], [182, 590, 90], [1560, 560, 140], [1520, 600, 110]].map(([x, y, h]) => cypress(x, y, h)).join('')}`;
    // On the terrace wall: lemons and geraniums in terracotta pots (left), and the Chianti, two
    // glasses of red, bread and cheese on a board (right).
    out += `<g transform='translate(40 784)'><path d='M-22 0 L-30 -66 H30 L22 0Z' fill='#b85a2a'/><path d='M-26 -40 H26' stroke='#8a3a1a' stroke-width='3'/><rect x='-34' y='-74' width='68' height='10' rx='3' fill='#c86a3a'/>
      <path d='M0 -72 V-140' stroke='#5a3a1e' stroke-width='6'/>${[[-34, -170, 40], [10, -190, 46], [34, -150, 34], [-10, -150, 36]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#3e6a24'/>`).join('')}
      ${[[-30, -160], [8, -186], [30, -146], [-6, -140], [20, -206], [-40, -190]].map(([x, y]) => `<ellipse cx='${x}' cy='${y}' rx='8' ry='6' fill='#f4d23a'/>`).join('')}</g>
      <g transform='translate(130 784)'><path d='M-22 0 H22 L18 -40 H-18Z' fill='#a84e24'/><rect x='-24' y='-44' width='48' height='7' rx='2' fill='#c06030'/>${[[-14, -56], [0, -66], [14, -54], [-4, -50], [8, -62]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='9' fill='#3e6a24'/>`).join('')}${[[-12, -64], [4, -74], [16, -60], [-2, -56]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='5' fill='#e0303a'/>`).join('')}</g>
      <g transform='translate(1300 784)'><rect x='-20' y='-10' width='190' height='10' rx='3' fill='#8a5a2e'/>
        <path d='M0 -10 Q-6 -50 10 -66 V-100 h10 V-66 Q36 -50 30 -10Z' fill='#2a4a1a'/><path d='M-2 -10 Q-6 -46 10 -60 H20 Q36 -46 32 -10Z' fill='#d8b060'/>${[-50, -40, -30, -20].map((y) => `<path d='M-3 ${y} Q15 ${y + 4} 33 ${y}' stroke='#a88030' stroke-width='2' fill='none'/>`).join('')}<rect x='9' y='-108' width='12' height='10' fill='#c0392b'/>
        ${[50, 84].map((x) => `<path d='M${x} -10 h14 M${x + 7} -10 V-30 M${x - 2} -54 Q${x + 7} -24 ${x + 16} -54Z' stroke='#e8eef0' stroke-width='2' fill='none'/><path d='M${x} -46 Q${x + 7} -28 ${x + 14} -46Z' fill='#7a1020'/>`).join('')}
        <path d='M112 -10 Q116 -34 150 -32 Q172 -30 168 -10Z' fill='#d8a050'/><path d='M120 -22 l8 -6 M136 -26 l8 -6 M150 -24 l8 -6' stroke='#a87030' stroke-width='2'/><path d='M120 -10 L150 -10 L136 -30Z' fill='#f4d880'/></g>`;
    // Long shadow across the near rows at sunset; a little haze at the bottom by day.
    out += sunset ? `<rect y='640' width='1600' height='260' fill='#2a1408' opacity='0.25'/>` : `<rect y='700' width='1600' height='200' fill='#2a3a10' opacity='0.12'/>`;
    return scene(tight(out));
  }
  // The pergola overhead: a beam with vines along it and bunches of grapes hanging down.
  const pergola = (sunset) => tile(300, 150, `<rect y='0' width='300' height='18' fill='#5a3a1e'/><rect y='14' width='300' height='4' fill='#3b2512'/>
    ${[[30, 18], [110, 22], [190, 16], [260, 24]].map(([x, l]) => `<path d='M${x} 18 q-14 ${l} -26 ${l + 8} q20 -2 26 -${l - 6} q6 ${l} 26 ${l + 6} q-12 -${l} -26 -${l + 8}Z' fill='${sunset ? '#4a5a1e' : '#5f8a2a'}'/>`).join('')}
    ${[[60, '#5a2a6a'], [150, '#6a2a5a'], [230, '#4a2a6a']].map(([x, col]) => `<g fill='${col}'>${[[0, 0], [-7, 0], [7, 0], [-3.5, 7], [3.5, 7], [0, 14], [-7, 7], [7, 7], [-3.5, 14], [3.5, 14], [0, 21]].map(([dx, dy]) => `<circle cx='${x + dx}' cy='${38 + dy}' r='5'/>`).join('')}</g><path d='M${x} 30 V18' stroke='#3b2512' stroke-width='2'/>`).join('')}
    <path d='M0 22 Q75 40 150 26 T300 24' stroke='#4a6a1e' stroke-width='3' fill='none'/>`);
  // The terrace's low stone wall in front of you, drawn over tuscany() (the same 1600×900 frame, so
  // they line up) in its perspective: eye level is the horizon (the vanishing point's at 800, 410)
  // and we look down a little onto the wall, so we see the top of its coping, the joints between
  // the slabs running away to the vanishing point (straight ahead in the middle, leaning out to the
  // sides), the front of the coping and its shadow, and the stones of the wall's face below. The pots
  // and the Chianti in tuscany() stand on the coping.
  const stoneWall = (sunset) => {
    const back = (x) => (800 + (x - 800) / 1.066).toFixed(0); // where a joint meets the back edge
    let joints = '';
    for (let x = -96; x <= 1700; x += 112) joints += `M${x} 812V800L${back(x)} 776`;
    return scene(`<defs><pattern id='sw' width='180' height='120' y='812' patternUnits='userSpaceOnUse'><rect width='180' height='120' fill='#8a7458'/>
    ${[[0, 0, 60], [60, 0, 70], [130, 0, 50], [0, 30, 40], [40, 30, 80], [120, 30, 60], [0, 60, 70], [70, 60, 60], [130, 60, 50], [0, 90, 50], [50, 90, 70], [120, 90, 60]].map(([x, y, w], i) => `<rect x='${x + 2}' y='${y + 2}' width='${w - 4}' height='26' rx='5' fill='${['#b49a74', '#a88e6a', '#c0a67e', '#9c8462'][i % 4]}'/>`).join('')}</pattern></defs>
    <rect y='812' width='1600' height='88' fill='url(#sw)'/><rect y='812' width='1600' height='7' opacity='0.28'/>
    <path d='M0 776H1600V812H0Z' fill='${sunset ? '#b48a62' : '#bba27a'}'/><path d='M0 776H1600V800H0Z' fill='${sunset ? '#dcae80' : '#d8c49c'}'/>
    <path d='${joints}' stroke='${sunset ? '#8a6444' : '#9a8460'}' stroke-width='2' fill='none'/><path d='M0 800H1600' stroke='#fff' stroke-width='2' opacity='0.3'/>`);
  };

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
      <path d='M780 478 L820 478 L1200 900 L400 900Z' fill='${c.path}'/>
      ${[[120, 520, 260], [1220, 520, 260], [60, 640, 360], [1180, 640, 360]].map(([x, y, w]) => `<rect x='${x}' y='${y}' width='${w}' height='40' rx='16' fill='${c.hedge}'/><path d='M${x + 20} ${y + 20} h${w - 40}' stroke='${night ? '#2a4a30' : '#5a8a3e'}' stroke-width='6'/>`).join('')}
      ${[[560, 520], [1040, 520], [470, 640], [1130, 640]].map(([x, y]) => `<path d='M${x} ${y + 60} Q${x - 26} ${y + 30} ${x} ${y - 40} Q${x + 26} ${y + 30} ${x} ${y + 60}Z' fill='${c.hedge}'/>`).join('')}
      <ellipse cx='800' cy='560' rx='110' ry='26' fill='${night ? '#3a4a6a' : '#cfe4f0'}' stroke='${c.stone}' stroke-width='8'/><rect x='790' y='500' width='20' height='60' fill='${c.stone}'/><path d='M800 500 Q770 470 760 520 M800 500 Q830 470 840 520 M800 500 V460' stroke='${night ? '#9ab' : '#fff'}' stroke-width='4' fill='none' opacity='0.8'/>
      ${fire ? balustrade(800, 470, 762, 210, 1, '#8e7c78') : ''}`);
  }
  // The château's regular look (chateau() above is kept for the revolution): from the terrace down
  // the formal garden, in depth. Far hills with poplars, the woods behind; the château in pale stone
  // with its mansard roof, dormers and chimneys, round corner towers with pointed slate roofs, the
  // central pavilion with its dome, clock, balcony and flag, ivy up the left tower; the gravel path
  // running away between box parterres and rows of clipped cones, statues on plinths, the fountain
  // playing; orange trees in their white boxes, an urn of geraniums, and our table at the corner of
  // the terrace with the champagne on ice; and the terrace's balustrade in front of us, in the same
  // perspective as the path (see balustrade()). At night every window's lit, lanterns line the path,
  // the fountain glows and the moon's up.
  function chateauGarden(night) {
    const rand = seeded(night ? 89 : 13);
    const c = night
      ? { sky: ['#070c24', '#18234e', '#3a3a6a'], stone: '#8a8aa2', lit: '#a8a8c0', roof: '#242c48', win: '#ffd27a', hedge: '#183420', hedge2: '#21462a', lawn: '#1e3a26', lawn2: '#10201a', path: '#5a5a6c', trees: '#101e18', hills: '#1a2440', far: '#141c34' }
      : { sky: ['#2f6aae', '#8ab8e2', '#e4eef2'], stone: '#efe4cc', lit: '#fbf4e2', roof: '#56667e', win: '#5a6a7e', hedge: '#2e5a24', hedge2: '#3e7030', lawn: '#6a9a3e', lawn2: '#3e6a2a', path: '#c8b88e', trees: '#3a5a2e', hills: '#8eaabc', far: '#a8bccc' };
    const win = (x, y, w, h, arch = false) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' ${arch ? `rx='${w / 2}'` : ''} fill='${c.win}'/><path d='M${x + w / 2} ${y + 3} V${y + h} M${x} ${y + h * 0.45} H${x + w}' stroke='${c.stone}' stroke-width='2.5'/>${night ? '' : `<rect x='${x + 3}' y='${y + 4}' width='${w * 0.3}' height='${h * 0.4}' fill='#fff' opacity='0.25'/>`}`;
    const cone = (x, y, s) => `<ellipse cx='${x + 6 * s}' cy='${y + 2 * s}' rx='${16 * s}' ry='${4 * s}' fill='#000' opacity='0.2'/><path d='M${x - 14 * s} ${y} Q${x - 12 * s} ${y - 30 * s} ${x} ${y - 62 * s} Q${x + 12 * s} ${y - 30 * s} ${x + 14 * s} ${y}Z' fill='${c.hedge}'/><path d='M${x} ${y - 62 * s} Q${x - 10 * s} ${y - 30 * s} ${x - 12 * s} ${y}' stroke='${c.hedge2}' stroke-width='${5 * s}' fill='none'/>`;
    const tower = (x, w) => `<rect x='${x}' y='232' width='${w}' height='250' fill='url(#ctw)'/><path d='M${x - 12} 236 L${x + w / 2} 104 L${x + w + 12} 236Z' fill='${c.roof}'/><path d='M${x + w / 2} 104 L${x + w + 12} 236 H${x + w / 2 + 10}Z' fill='#000' opacity='0.22'/>
      <path d='M${x + w / 2} 104 V78' stroke='${night ? '#8a8aa0' : '#3a3a3a'}' stroke-width='3'/><circle cx='${x + w / 2}' cy='80' r='4' fill='#d4af37'/><rect x='${x - 4}' y='232' width='${w + 8}' height='8' fill='${c.lit}'/>
      ${win(x + w / 2 - 9, 270, 18, 34, true)}${win(x + w / 2 - 9, 360, 18, 34, true)}${win(x + w / 2 - 10, 420, 20, 44, true)}`;
    let out = `<defs><linearGradient id='cs' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.sky[0]}'/><stop offset='0.65' stop-color='${c.sky[1]}'/><stop offset='1' stop-color='${c.sky[2]}'/></linearGradient>
      <linearGradient id='ctw' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${c.lit}'/><stop offset='0.55' stop-color='${c.stone}'/><stop offset='1' stop-color='${night ? '#5a5a72' : '#c8bca2'}'/></linearGradient>
      <linearGradient id='cl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.lawn}'/><stop offset='1' stop-color='${c.lawn2}'/></linearGradient>
      <radialGradient id='cg'><stop offset='0' stop-color='${night ? '#ffd27a' : '#fffbe8'}' stop-opacity='${night ? 0.5 : 0.7}'/><stop offset='1' stop-color='${night ? '#ffb040' : '#fff4d0'}' stop-opacity='0'/></radialGradient>
      <linearGradient id='csh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0a1420' stop-opacity='${night ? 0.5 : 0.35}'/><stop offset='0.15' stop-color='#0a1420' stop-opacity='0'/><stop offset='0.82' stop-color='#0a1420' stop-opacity='0'/><stop offset='1' stop-color='#0a1420' stop-opacity='0.35'/></linearGradient></defs>
      <rect width='1600' height='490' fill='url(#cs)'/>`;
    // The sky: the sun's warmth and clouds by day; stars, a haze of the Milky Way and the moon by night.
    out += night
      ? `${Array.from({ length: 66 }, () => `<circle cx='${(rand() * 1600).toFixed(0)}' cy='${(rand() * 400).toFixed(0)}' r='${(0.6 + rand() * 1.4).toFixed(1)}' fill='#fff' opacity='${(0.3 + rand() * 0.6).toFixed(2)}'/>`).join('')}
        <path d='M0 260 Q600 60 1600 120' stroke='#c8d0ff' stroke-width='90' fill='none' opacity='0.05'/><circle cx='1360' cy='110' r='110' fill='url(#cg)'/><circle cx='1360' cy='110' r='34' fill='#f4f0dc'/><circle cx='1350' cy='102' r='7' fill='#d8d4c0'/><circle cx='1372' cy='120' r='5' fill='#d8d4c0'/>`
      : `<circle cx='200' cy='70' r='260' fill='url(#cg)'/>${[[1260, 160, 1], [1060, 182, 0.5], [80, 196, 0.6]].map(([x, y, s]) => `<g transform='translate(${x} ${y}) scale(${s})'><ellipse cx='0' cy='20' rx='130' ry='22' fill='#c8d8e8'/>${[[-70, 6, 50], [-20, -12, 62], [40, -4, 54], [90, 10, 40]].map(([dx, dy, r]) => `<circle cx='${dx}' cy='${dy}' r='${r}' fill='#fff'/>`).join('')}<ellipse cx='0' cy='26' rx='120' ry='14' fill='#b8cadc' opacity='0.7'/></g>`).join('')}
        <path d='M300 200 l10 -4 l10 4 M330 214 l8 -3 l8 3' stroke='#3a4a5a' stroke-width='2' fill='none'/>`;
    // Far hills with poplars and a church spire, then the woods behind the château.
    out += `<path d='M0 432 Q160 392 360 418 T760 404 T1180 416 T1600 396 V490 H0Z' fill='${c.far}'/>
      ${Array.from({ length: 22 }, (_, i) => { const x = 30 + i * 72 + rand() * 30; return `<ellipse cx='${x.toFixed(0)}' cy='${(414 + rand() * 10).toFixed(0)}' rx='5' ry='${(16 + rand() * 8).toFixed(0)}' fill='${c.hills}'/>`; }).join('')}
      <path d='M1480 420 V378 L1488 352 L1496 378 V420Z' fill='${c.hills}'/>
      <path d='M0 470 Q60 430 120 452 Q180 420 240 448 Q300 430 340 456 L1260 456 Q1320 424 1380 450 Q1450 420 1520 446 Q1570 432 1600 444 V492 H0Z' fill='${c.trees}'/>`;
    // The château.
    out += `${tower(250, 80)}${tower(1270, 80)}
      <rect x='330' y='292' width='940' height='190' fill='${c.stone}'/><rect x='330' y='378' width='940' height='7' fill='${c.lit}'/><rect x='330' y='292' width='940' height='6' fill='${c.lit}'/>
      <path d='M318 296 L356 222 H1244 L1282 296Z' fill='${c.roof}'/><path d='M356 222 H1244' stroke='${night ? '#6a6a88' : '#2a3242'}' stroke-width='4'/>
      ${[470, 640, 960, 1130].map((x, i) => `<rect x='${x}' y='${i % 3 ? 180 : 168}' width='26' height='${i % 3 ? 44 : 56}' fill='${c.stone}'/><rect x='${x - 4}' y='${i % 3 ? 176 : 164}' width='34' height='8' fill='${c.lit}'/>`).join('')}
      ${[400, 500, 600, 1000, 1100, 1200].map((x) => `<path d='M${x - 18} 290 V258 L${x} 238 L${x + 18} 258 V290Z' fill='${c.stone}'/>${win(x - 9, 258, 18, 28)}`).join('')}
      ${[360, 430, 500, 570, 640, 960, 1030, 1100, 1170, 1230].map((x) => `${win(x, 312, 24, 46)}${win(x, 400, 24, 64, true)}`).join('')}
      ${[340, 405, 475, 545, 615, 1005, 1075, 1145, 1210].map((x) => `<rect x='${x + 6}' y='300' width='6' height='182' fill='${c.lit}' opacity='0.5'/>`).join('')}
      <rect x='680' y='206' width='240' height='276' fill='${c.lit}'/><rect x='900' y='206' width='20' height='276' fill='#000' opacity='0.12'/>
      <path d='M670 210 Q680 140 740 120 H860 Q920 140 930 210Z' fill='${c.roof}'/><path d='M860 120 Q920 140 930 210 H880Z' fill='#000' opacity='0.2'/>
      <rect x='776' y='84' width='48' height='38' fill='${c.stone}'/><path d='M770 86 Q800 60 830 86Z' fill='${c.roof}'/><path d='M800 68 V56' stroke='#3a3a3a' stroke-width='3'/><circle cx='800' cy='56' r='4' fill='#d4af37'/>
      <path d='M690 262 L800 214 L910 262Z' fill='${c.stone}'/><circle cx='800' cy='244' r='18' fill='${night ? '#e8e0c0' : '#f4f0e4'}' stroke='#b08d45' stroke-width='3'/><path d='M800 244 V232 M800 244 L809 249' stroke='#2a2a2a' stroke-width='2'/>
      ${[700, 760, 816, 872].map((x) => win(x, 290, 28, 56)).join('')}
      <rect x='694' y='370' width='212' height='8' fill='${c.lit}'/>${Array.from({ length: 18 }, (_, i) => `<rect x='${698 + i * 12}' y='378' width='5' height='16' rx='2' fill='${c.lit}'/>`).join('')}<rect x='694' y='392' width='212' height='4' fill='${c.lit}'/>
      ${[700, 860].map((x) => win(x, 404, 30, 66, true)).join('')}<rect x='770' y='400' width='60' height='82' rx='30' fill='${night ? '#ffc860' : '#3a3a44'}'/><path d='M800 404 V482' stroke='${c.stone}' stroke-width='3'/>
      <path d='M740 482 H860 L880 500 H720Z' fill='${c.lit}'/><path d='M720 500 H880 L896 512 H704Z' fill='${c.stone}'/>
      ${[[262, 470, 26], [276, 440, 22], [254, 420, 18], [288, 410, 16], [266, 394, 14]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${night ? '#14281a' : '#2a4a22'}'/>`).join('')}`;
    // Night: the light from the windows on the lawn.
    if (night) out += `<ellipse cx='800' cy='500' rx='560' ry='40' fill='#ffc860' opacity='0.18'/>${[290, 1310, 800].map((x) => `<ellipse cx='${x}' cy='470' rx='60' ry='110' fill='#ffd27a' opacity='0.1'/>`).join('')}`;
    // The garden: the lawn, the gravel path, box parterres either side, flower beds, the cones.
    out += `<rect y='482' width='1600' height='418' fill='url(#cl)'/>
      <path d='M720 512 H880 L1240 900 H360Z' fill='${c.path}'/>${Array.from({ length: 36 }, () => { const y = 520 + rand() * 220; const half = 80 + (y - 512) * 0.95; return `<circle cx='${(800 + (rand() - 0.5) * 2 * half).toFixed(0)}' cy='${y.toFixed(0)}' r='${(1 + rand() * 1.6).toFixed(1)}' fill='#000' opacity='0.12'/>`; }).join('')}`;
    for (const side of [-1, 1]) {
      const X = (d) => 800 + side * d;
      out += [[530, 120, 520, 10], [600, 150, 600, 16], [700, 190, 720, 24], [830, 240, 900, 30]].map(([y, from, to, h]) => {
        const x0 = Math.min(X(from), X(to));
        return `<rect x='${x0}' y='${y}' width='${Math.abs(to - from)}' height='${h}' rx='${h / 2}' fill='${c.hedge}'/><rect x='${x0 + 6}' y='${y + 2}' width='${Math.abs(to - from) - 12}' height='${h * 0.35}' rx='${h / 4}' fill='${c.hedge2}'/>`;
      }).join('');
      out += `<path d='M${X(170)} 572 q${side * 60} -30 ${side * 130} 0 t${side * 130} 0 t${side * 120} 0' stroke='${c.hedge}' stroke-width='7' fill='none'/><path d='M${X(210)} 660 q${side * 80} -40 ${side * 170} 0 t${side * 170} 0' stroke='${c.hedge}' stroke-width='10' fill='none'/>
        ${Array.from({ length: 16 }, (_, i) => `<circle cx='${X(230 + i * 34)}' cy='${688 + (i % 2) * 4}' r='5' fill='${night ? '#8a3a5a' : pick(rand, ['#e8506a', '#f08aa0', '#fff', '#e8506a'])}'/>`).join('')}
        ${[[110, 524, 0.4], [140, 560, 0.55], [180, 620, 0.75], [234, 712, 1], [300, 840, 1.35]].map(([d, y, s]) => cone(X(d), y, s)).join('')}
        ${[[420, 548, 0.5], [620, 548, 0.5]].map(([d, y, s]) => cone(X(d), y, s)).join('')}
        <rect x='${X(250) - 16}' y='540' width='32' height='40' fill='${c.lit}'/><path d='M${X(250) - 7} 540 q-2 -26 4 -36 q8 -4 8 6 q6 14 2 30Z' fill='${night ? '#b8b8cc' : '#fbf6ea'}'/><circle cx='${X(250)}' cy='498' r='6' fill='${night ? '#b8b8cc' : '#fbf6ea'}'/>`;
    }
    // The fountain: basin, tiers and jets.
    out += `<ellipse cx='800' cy='616' rx='150' ry='30' fill='${c.lit}'/><ellipse cx='800' cy='612' rx='136' ry='22' fill='${night ? '#3a5a8a' : '#a8d0e4'}'/>
      ${night ? `<ellipse cx='800' cy='600' rx='170' ry='70' fill='#9ad0ff' opacity='0.14'/>` : `<path d='M700 614 q30 -6 60 0 M820 618 q30 -6 60 0' stroke='#fff' stroke-width='3' opacity='0.6' fill='none'/>`}
      <rect x='790' y='560' width='20' height='52' fill='${c.stone}'/><ellipse cx='800' cy='562' rx='44' ry='9' fill='${c.lit}'/><rect x='795' y='520' width='10' height='42' fill='${c.stone}'/><ellipse cx='800' cy='524' rx='20' ry='5' fill='${c.lit}'/>
      <path d='M800 520 Q776 470 750 560 M800 520 Q824 470 850 560 M800 524 V476 M760 562 Q730 560 700 606 M840 562 Q870 560 900 606' stroke='${night ? '#cfe6ff' : '#fff'}' stroke-width='3' fill='none' opacity='0.85'/>
      ${Array.from({ length: 20 }, () => `<circle cx='${(800 + (rand() - 0.5) * 220).toFixed(0)}' cy='${(560 + rand() * 50).toFixed(0)}' r='1.8' fill='#fff' opacity='0.7'/>`).join('')}`;
    // Night: lanterns on posts along the path.
    if (night) out += [[700, 560, 0.6], [640, 650, 0.8], [900, 560, 0.6], [960, 650, 0.8]].map(([x, y, s]) => `<circle cx='${x}' cy='${y - 40 * s}' r='${40 * s}' fill='url(#cg)'/><rect x='${x - 2 * s}' y='${y - 40 * s}' width='${4 * s}' height='${40 * s}' fill='#1a1a20'/><rect x='${x - 6 * s}' y='${y - 50 * s}' width='${12 * s}' height='${14 * s}' fill='#ffe09a'/>`).join('');
    // The foreground: orange trees in Versailles boxes, an urn of geraniums, our table with the champagne.
    out += `${[[130, 760, 1], [1480, 770, 1.1]].map(([x, y, s]) => `<g transform='translate(${x} ${y}) scale(${s})'><ellipse cx='10' cy='4' rx='70' ry='10' fill='#000' opacity='0.25'/><rect x='-44' y='-80' width='88' height='84' fill='${night ? '#9a9ab0' : '#f4f2ea'}'/><path d='M-44 -80 h88 v84 h-88Z M-30 -66 h60 v56 h-60Z' fill='none' stroke='${night ? '#1e3a2a' : '#2a5a3a'}' stroke-width='6'/>
      <circle cx='-44' cy='-84' r='6' fill='${night ? '#9a9ab0' : '#f4f2ea'}'/><circle cx='44' cy='-84' r='6' fill='${night ? '#9a9ab0' : '#f4f2ea'}'/><rect x='-4' y='-150' width='8' height='72' fill='#5a3a1e'/>
      <circle cx='0' cy='-190' r='62' fill='${c.hedge}'/><circle cx='-14' cy='-206' r='40' fill='${c.hedge2}'/>${[[-30, -180], [20, -210], [26, -168], [-6, -228], [-40, -210], [40, -190]].map(([dx, dy]) => `<circle cx='${dx}' cy='${dy}' r='6' fill='${night ? '#b0702a' : '#f08a1a'}'/>`).join('')}</g>`).join('')}
      <path d='M1230 770 V700' stroke='#1a1a1a' stroke-width='4'/><ellipse cx='1290' cy='700' rx='110' ry='22' fill='${night ? '#c8c4cc' : '#fbf8f0'}'/><path d='M1180 700 Q1186 740 1200 760 M1400 700 Q1394 740 1380 760' stroke='${night ? '#a8a4ac' : '#e8e2d4'}' stroke-width='10' fill='none'/>
      <path d='M1262 650 h44 l-6 52 h-32Z' fill='#c8ccd0'/><path d='M1266 656 h8 l-2 40 h-6Z' fill='#fff' opacity='0.5'/><path d='M1280 650 l6 -50 h6 l2 50Z' fill='#1e4a2a'/><rect x='1284' y='594' width='12' height='12' fill='#d4af37'/>
      ${[[1340, 694], [1376, 698]].map(([x, y]) => `<path d='M${x - 14} ${y - 30} q14 14 28 0Z' fill='${night ? '#e8d890' : '#f4e0a0'}' opacity='0.85'/><path d='M${x} ${y - 22} V${y - 2} M${x - 8} ${y} h16' stroke='#e8eef4' stroke-width='2.5'/>`).join('')}
      ${night ? `<circle cx='1230' cy='690' r='60' fill='url(#cg)'/><rect x='1222' y='672' width='16' height='22' rx='3' fill='#ffe8a8'/>` : ''}`;
    // The terrace's balustrade in front of us (the sun's on the left; by night the moon's on the right).
    out += balustrade(800, 426, 744, 210, night ? 1 : -1, night ? '#9a9aae' : '#e8dcc0');
    // Shade along the top (the heading) and the bottom.
    out += `<rect width='1600' height='900' fill='url(#csh)'/>`;
    return vvScene(out);
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
      // The crowd, drawn the way the TV's character kit draws people (see figure() in
      // public/scenery.js) at this size: its skin tones and hair colours, the ink outline, dot
      // eyes and a smile; every so often someone with an arm up, cheering.
      const ink = `stroke='#1c1410' stroke-width='0.9' stroke-linejoin='round'`;
      out += `<defs><path id='tcB' d='M-7 15 Q-7 6 0 6 Q7 6 7 15Z' ${ink}/><circle id='tcH' r='6' ${ink}/>
        <path id='tcR' d='M-6 0.5 C-6.5 -5 -3 -7 0 -7 C3 -7 6.5 -5 6 0.5 C5 -3 2 -3.6 0 -3.6 C-2 -3.6 -5 -3 -6 0.5Z' ${ink}/>
        <g id='tcF'><ellipse cx='-2.2' cy='0' rx='0.9' ry='1.2' fill='#1c1410'/><ellipse cx='2.2' cy='0' rx='0.9' ry='1.2' fill='#1c1410'/><path d='M-1.4 2.9 q1.4 1.3 2.8 0' stroke='#1c1410' stroke-width='0.75' fill='none' stroke-linecap='round'/></g>
        <path id='tcA' d='M5 9 L9 -4' fill='none' stroke-linecap='round'/></defs>`;
      const SKIN = ['#f3d6bd', '#e4b58e', '#c68c60', '#94603e', '#5e3a24'];
      const HAIR = ['#1e1612', '#5a3820', '#8a3a1a', '#dcb45a', '#9c9894', '#1e1612'];
      const SHIRT = ['#8e1b1b', '#1b3f8e', '#2a6a3a', '#d4af37', '#5a2a6a'];
      for (let row = 0; row < 3; row++) {
        out += `<rect x='430' y='${395 + row * 26}' width='740' height='4' fill='#4a2e17'/>`;
        for (let i = 0; i < 46; i++) {
          const x = 440 + i * 16 + (row % 2) * 8;
          const y = 388 + row * 26;
          const shirt = SHIRT[(i * 3 + row) % 5];
          const at = `x='${x}' y='${y}'`;
          const arm = (i * 7 + row * 3) % 11 === 0 ? `<use href='#tcA' ${at} stroke='#1c1410' stroke-width='3.8'/><use href='#tcA' ${at} stroke='${shirt}' stroke-width='2'/><circle cx='${x + 9}' cy='${y - 4.5}' r='2' fill='${SKIN[(i + row) % 5]}' ${ink}/>` : '';
          out += `<use href='#tcB' ${at} fill='${shirt}'/>${arm}<use href='#tcH' ${at} fill='${SKIN[(i + row) % 5]}'/>${(i + row * 2) % 9 === 4 ? '' : `<use href='#tcR' ${at} fill='${HAIR[(i * 5 + row) % 6]}'/>`}<use href='#tcF' ${at}/>`;
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
  // (Kit markup, squeezed: okKit puts the ink's attributes back. The kit's stein, and the six
  // people at the tables as <defs>, okp0 to okp5, each with its head's centre on (0, 0).)
  const okKit = (s) => s.replace(/~I/g, " stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'").replace(/~R/g, " stroke-linecap='round' stroke-linejoin='round'").replace(/~N/g, " fill='none' stroke='#1c1410' stroke-width='");
  const OK_STEIN = `<path d='M4.5 -9 H8 Q9.5 -9 9.5 -7 V-3 Q9.5 -1 8 -1 H4.5'~N3.8'/><path d='M4.5 -9 H8 Q9.5 -9 9.5 -7 V-3 Q9.5 -1 8 -1 H4.5' fill='none' stroke='#f4c43a' stroke-width='2.2'/><rect x='-4.5' y='-12' width='9' height='14' rx='1.5' fill='#f4c43a'~I/><path d='M-5 -11.5 Q0 -16 5 -11.5 V-10 H-5Z' fill='#fffaf0'~I/><path d='M-4.5 -4 H4.5' stroke='#b38f2d' stroke-width='1.2'/>`;
  const OK_FACE = `<ellipse cx='26' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><ellipse cx='34' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><path d='M27.4 27.4 q2.6 2.4 5.2 0'~N1.4' stroke-linecap='round'/>`;
  const OK_BODY = (top, extra = '') => `<path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='${top}'/><path d='M18.8 66 H41.2 L40.5 76 H19.5Z' fill='#2a2a3a'/>${extra}<path d='M19 39 L21.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none'~I/>`;
  const OK_ARM = (pts, w, sleeve, skin, extra = '') => `<g><path d='${pts}'~N${+(w + 3.2).toFixed(1)}'~R/><path d='${pts}' fill='none' stroke='${sleeve}' stroke-width='${w}'~R/>${extra}</g>`;
  const OK_HAND = (x, y, skin) => `<circle cx='${x}' cy='${y}' r='3.5' fill='${skin}'~I/>`;
  const OK_DOWN_L = 'M20 39 L18.3 54.9 L14.7 69.5';
  const OK_DOWN_R = 'M40 39 L41.7 54.9 L45.3 69.5';
  const OK_UP = 'M40 39 L48 25.1 L53.1 11';
  const OK_HAIR = (c) => `<path d='M19 23 C18 12 24 9 30 9 C36 9 42 12 41 23 C39 16 34 15 30 15 C26 15 21 16 19 23Z' fill='${c}'~I/>`;
  const OK_DIRNDL = (accent) => `<path d='M17.5 48 H42.5 L40.5 76 H19.5Z' fill='${accent}'/>${[52, 58, 64].map((y) => `<path d='M27 ${y} L33 ${y + 4} M33 ${y} L27 ${y + 4}' stroke='#e8c15a' stroke-width='1.1'/>`).join('')}`;
  const OK_PERSON = (i, skin, top, { body = '', hair = '', up = false, sleeves = top } = {}) => `<g id='okp${i}'><g transform='translate(-45 -33) scale(1.5)'>${OK_ARM(OK_DOWN_L, sleeves === top ? 7 : 6.6, sleeves, skin, sleeves === top ? '' : `<path d='M20 39 L18.8 50.1' stroke='${top}' stroke-width='7.8' stroke-linecap='round'/>`)}${OK_HAND(14.7, 69.5, skin)}<rect x='27' y='29' width='6' height='8' fill='${skin}'~I/><g>${OK_BODY(top, body)}</g><g><circle cx='30' cy='22' r='11' fill='${skin}'~I/>${OK_FACE}${hair}</g>${up ? OK_ARM(OK_UP, sleeves === top ? 7 : 6.6, sleeves, skin, `${sleeves === top ? '' : `<path d='M40 39 L45.6 29.3' stroke='${top}' stroke-width='7.8' stroke-linecap='round'/>`}<g transform='translate(54.1 13)'>${OK_STEIN}</g>${OK_HAND(53.1, 11, skin)}`) : `${OK_ARM(OK_DOWN_R, sleeves === top ? 7 : 6.6, sleeves, skin, sleeves === top ? '' : `<path d='M40 39 L41.2 50.1' stroke='${top}' stroke-width='7.8' stroke-linecap='round'/>`)}${OK_HAND(45.3, 69.5, skin)}`}</g></g>`;
  const OK_PEOPLE = `<defs>${[
    OK_PERSON(0, '#e4b58e', '#c0392b', { hair: OK_HAIR('#5a3820') }),
    OK_PERSON(1, '#f3d6bd', '#f6efe0', { sleeves: '#f3d6bd', up: true, body: OK_DIRNDL('#2a6fdb'), hair: `<circle cx='30' cy='10' r='5' fill='#dcb45a'~I/>${OK_HAIR('#dcb45a')}` }),
    OK_PERSON(2, '#c68c60', '#2a6a3a', { hair: OK_HAIR('#1e1612') }),
    OK_PERSON(3, '#f3d6bd', '#f4f4f4', { sleeves: '#f3d6bd', body: OK_DIRNDL('#c0392b'), hair: `<path d='M19 18 C16 30 17 37 21 40 L23 24Z M41 18 C44 30 43 37 39 40 L37 24Z' fill='#8a3a1a'~I/>${OK_HAIR('#8a3a1a')}` }),
    OK_PERSON(4, '#94603e', '#2a6fdb', { up: true, hair: [[21, 19], [25, 12], [31, 10], [37, 13], [19, 26], [40, 18]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='5' fill='#1e1612'~I/>`).join('') }),
    OK_PERSON(5, '#e4b58e', '#f6efe0', { body: `<path d='M24 35 L25 70 M36 35 L35 70' stroke='#6a4424' stroke-width='3.2'/><path d='M24.5 48 H35.5' stroke='#6a4424' stroke-width='2.6'/>`, hair: `<path d='M25.5 26.5 Q30 23.5 34.5 26.5 Q32 25.6 30 26.4 Q28 25.6 25.5 26.5Z' fill='#9c9894'~I/><path d='M19 24 C18 18 20 15 22 14 L23 23Z M41 24 C42 18 40 15 38 14 L37 23Z' fill='#9c9894'~I/><path d='M24 9 Q16 0 17 -6 Q22 2 27 8Z' fill='#f2ead6'~I/><ellipse cx='31' cy='16' rx='14.5' ry='2.8' fill='#3a5a2a'~I/><path d='M22 15.5 L24 5 Q31 2 38 5 L40 15.5Z' fill='#3a5a2a'~I/><path d='M22.4 12.5 H39.6' stroke='#2e3e20' stroke-width='2'/>` }),
  ].join('')}</defs>`;
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
    // The band and the people at the tables are the scenery's character kit (class and style
    // stripped, the ink's attributes squeezed to ~I ~R ~N, see okKit). The band, waist up, heads
    // where they were: Scenery.kit.figureAt(x - 6, 535, 175, { hat: 'alpine', hair: 'short',
    // top: '#f6efe0', topStyle: 'braces', accent: '#6a4424', crop: 'waist', ... }) for x = 620
    // (sax, moustache), 700 (a stein up), 780 (tuba, beard, stout), 860 (drum: sticks), 940 (sax).
    // At the tables, six people used over and over (okp0-5): figureAt(0, 144, 180, { facing:
    // 'front', crop: 'waist', ... }) in red, a dirndl with a stein up, green, a dirndl in red, blue
    // with a stein up, lederhosen and a moustache.
    out += okKit(`${OK_PEOPLE}<g transform='translate(570.3 362.9) scale(1.4583)'><g><path d='M27.5 39 L39 50.1 L48.2 38.3'~N10.2'~R/><path d='M27.5 39 L39 50.1 L48.2 38.3' fill='none' stroke='#cac3b6' stroke-width='7'~R/><circle cx='48.2' cy='38.3' r='3.5' fill='#bc9575'~I/></g><rect x='28' y='29' width='6' height='8' fill='#e4b58e'~I/><g><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='#f6efe0'/><path d='M18.8 66 H41.2 L40.5 76 H19.5Z' fill='#2a2a3a'/><path d='M25.5 35 L26.5 70 M37.5 35 L36.5 70' stroke='#6a4424' stroke-width='3.2'/><path d='M26 48 H37' stroke='#6a4424' stroke-width='2.6'/><path d='M19 39 L21.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none'~I/></g><g><circle cx='31' cy='22' r='11' fill='#e4b58e'~I/><ellipse cx='34.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><ellipse cx='39.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><path d='M34.8 27.4 q2.6 2.4 5.2 0'~N1.4' stroke-linecap='round'/><path d='M32.5 26.5 Q37 23.5 41.5 26.5 Q39 25.6 37 26.4 Q35 25.6 32.5 26.5Z' fill='#5a3820'~I/><path d='M20 24 C18.5 13 25 9 32 9.5 C38 10 42 14 42 18 C37 15 32 15 28 16 C26 20 24 25 20 24Z' fill='#5a3820'~I/><path d='M25 9 Q17 0 18 -6 Q23 2 28 8Z' fill='#f2ead6'~I/><ellipse cx='32' cy='16' rx='14.5' ry='2.8' fill='#2a4a2a'~I/><path d='M23 15.5 L25 5 Q32 2 39 5 L41 15.5Z' fill='#2a4a2a'~I/><path d='M23.4 12.5 H40.6' stroke='#243420' stroke-width='2'/></g><path d='M38.4 28.6 Q50.2 34.3 48.2 38.3 T51.9 61.1 Q55.9 65.1 57.9 58.1'~N7'~R/><path d='M38.4 28.6 Q50.2 34.3 48.2 38.3 T51.9 61.1 Q55.9 65.1 57.9 58.1' fill='none' stroke='#d4af37' stroke-width='3.8'~R/><path d='M57.9 58.1 l1 -6 l5 2 Z' fill='#d4af37'~I/><g><path d='M33.5 39 L39 54 L53.9 55.1'~N10.2'~R/><path d='M33.5 39 L39 54 L53.9 55.1' fill='none' stroke='#f6efe0' stroke-width='7'~R/><circle cx='53.9' cy='55.1' r='3.5' fill='#e4b58e'~I/></g></g>
      <g transform='translate(650.3 362.9) scale(1.4583)'><g><path d='M27.5 39 L29.2 54.9 L32.8 69.5'~N10.2'~R/><path d='M27.5 39 L29.2 54.9 L32.8 69.5' fill='none' stroke='#cac3b6' stroke-width='7'~R/><circle cx='32.8' cy='69.5' r='3.5' fill='#c8af9a'~I/></g><rect x='28' y='29' width='6' height='8' fill='#f3d6bd'~I/><g><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='#f6efe0'/><path d='M18.8 66 H41.2 L40.5 76 H19.5Z' fill='#2a2a3a'/><path d='M25.5 35 L26.5 70 M37.5 35 L36.5 70' stroke='#6a4424' stroke-width='3.2'/><path d='M26 48 H37' stroke='#6a4424' stroke-width='2.6'/><path d='M19 39 L21.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none'~I/></g><g><circle cx='31' cy='22' r='11' fill='#f3d6bd'~I/><ellipse cx='34.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><ellipse cx='39.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><path d='M34.2 26.8 Q37.4 32.4 40.6 26.8Z' fill='#1c1410'/><path d='M20 24 C18.5 13 25 9 32 9.5 C38 10 42 14 42 18 C37 15 32 15 28 16 C26 20 24 25 20 24Z' fill='#5a3820'~I/><path d='M25 9 Q17 0 18 -6 Q23 2 28 8Z' fill='#f2ead6'~I/><ellipse cx='32' cy='16' rx='14.5' ry='2.8' fill='#2a4a2a'~I/><path d='M23 15.5 L25 5 Q32 2 39 5 L41 15.5Z' fill='#2a4a2a'~I/><path d='M23.4 12.5 H40.6' stroke='#243420' stroke-width='2'/></g><g><path d='M33.5 39 L41.5 25.1 L46.6 11'~N10.2'~R/><path d='M33.5 39 L41.5 25.1 L46.6 11' fill='none' stroke='#f6efe0' stroke-width='7'~R/><g transform='translate(47.6 13)'>${OK_STEIN}</g><circle cx='46.6' cy='11' r='3.5' fill='#f3d6bd'~I/></g></g>
      <g transform='translate(730.3 362.9) scale(1.4583)'><g><path d='M27.5 39 L31.4 54.5 L46.4 54.5'~N10.2'~R/><path d='M27.5 39 L31.4 54.5 L46.4 54.5' fill='none' stroke='#cac3b6' stroke-width='7'~R/><circle cx='46.4' cy='54.5' r='3.5' fill='#a47450'~I/></g><rect x='28' y='29' width='6' height='8' fill='#c68c60'~I/><g><path d='M16 41 Q16 34 30 34 Q44 34 44 41 Q49 60 43.5 76 H16.5 Q16 60 16 41Z' fill='#f6efe0'/><path d='M14.1 66 H45.9 L43.5 76 H16.5Z' fill='#2a2a3a'/><path d='M25.5 35 L26.5 70 M37.5 35 L36.5 70' stroke='#6a4424' stroke-width='3.2'/><path d='M26 48 H37' stroke='#6a4424' stroke-width='2.6'/><path d='M18 39 L18.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M16 41 Q16 34 30 34 Q44 34 44 41 Q49 60 43.5 76 H16.5 Q16 60 16 41Z' fill='none'~I/></g><g><circle cx='31' cy='22' r='11' fill='#c68c60'~I/><ellipse cx='34.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><ellipse cx='39.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><path d='M34.8 27.4 q2.6 2.4 5.2 0'~N1.4' stroke-linecap='round'/><path d='M27 25 C28 34 35 37 40 31.5 C42 29 42.4 25 41.6 23.5 C40 25.8 34 29.6 27 25Z' fill='#5a3820'~I/><path d='M20 24 C18.5 13 25 9 32 9.5 C38 10 42 14 42 18 C37 15 32 15 28 16 C26 20 24 25 20 24Z' fill='#5a3820'~I/><path d='M25 9 Q17 0 18 -6 Q23 2 28 8Z' fill='#f2ead6'~I/><ellipse cx='32' cy='16' rx='14.5' ry='2.8' fill='#5a3a1e'~I/><path d='M23 15.5 L25 5 Q32 2 39 5 L41 15.5Z' fill='#5a3a1e'~I/><path d='M23.4 12.5 H40.6' stroke='#412b18' stroke-width='2'/></g><g><path d='M54.4 44.5 Q64.4 32.5 60.4 20.5'~N8.2'~R/><path d='M54.4 44.5 Q64.4 32.5 60.4 20.5' fill='none' stroke='#d4af37' stroke-width='5'~R/><path d='M57.4 22.5 L52.4 14.5 H70.4 L65.4 22.5Z' fill='#d4af37'~I/><ellipse cx='61.4' cy='14.5' rx='9' ry='3' fill='#6f5a22'~I/><ellipse cx='51.4' cy='56.5' rx='11' ry='13' fill='#d4af37'~I/><ellipse cx='51.4' cy='56.5' rx='6' ry='7.5' fill='none' stroke='#9d812b' stroke-width='2.2'/><path d='M55.4 50.5 v-6 M59.4 52.5 v-6' stroke='#947929' stroke-width='1.8' stroke-linecap='round'/></g><g><path d='M33.5 39 L37.4 54.5 L52.4 54.5'~N10.2'~R/><path d='M33.5 39 L37.4 54.5 L52.4 54.5' fill='none' stroke='#f6efe0' stroke-width='7'~R/><circle cx='52.4' cy='54.5' r='3.5' fill='#c68c60'~I/></g></g>
      <g transform='translate(810.3 362.9) scale(1.4583)'><g><path d='M27.5 39 L39.4 49.7 L54.4 49.2'~N10.2'~R/><path d='M27.5 39 L39.4 49.7 L54.4 49.2' fill='none' stroke='#cac3b6' stroke-width='7'~R/><path d='M54.4 49.2 L58.4 36.8'~N4.8'~R/><path d='M54.4 49.2 L58.4 36.8' fill='none' stroke='#d8c8a0' stroke-width='1.6'~R/><circle cx='54.4' cy='49.2' r='3.5' fill='#bc9575'~I/></g><rect x='28' y='29' width='6' height='8' fill='#e4b58e'~I/><g><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='#f6efe0'/><path d='M18.8 66 H41.2 L40.5 76 H19.5Z' fill='#2a2a3a'/><path d='M25.5 35 L26.5 70 M37.5 35 L36.5 70' stroke='#6a4424' stroke-width='3.2'/><path d='M26 48 H37' stroke='#6a4424' stroke-width='2.6'/><path d='M19 39 L21.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none'~I/></g><g><circle cx='31' cy='22' r='11' fill='#e4b58e'~I/><ellipse cx='34.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><ellipse cx='39.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><path d='M34.8 27.4 q2.6 2.4 5.2 0'~N1.4' stroke-linecap='round'/><path d='M20 24 C18.5 13 25 9 32 9.5 C38 10 42 14 42 18 C37 15 32 15 28 16 C26 20 24 25 20 24Z' fill='#5a3820'~I/><path d='M25 9 Q17 0 18 -6 Q23 2 28 8Z' fill='#f2ead6'~I/><ellipse cx='32' cy='16' rx='14.5' ry='2.8' fill='#2a4a2a'~I/><path d='M23 15.5 L25 5 Q32 2 39 5 L41 15.5Z' fill='#2a4a2a'~I/><path d='M23.4 12.5 H40.6' stroke='#243420' stroke-width='2'/></g><g><path d='M33.5 39 L45.4 49.7 L60.4 49.2'~N10.2'~R/><path d='M33.5 39 L45.4 49.7 L60.4 49.2' fill='none' stroke='#f6efe0' stroke-width='7'~R/><path d='M60.4 49.2 L64.4 36.8'~N4.8'~R/><path d='M60.4 49.2 L64.4 36.8' fill='none' stroke='#d8c8a0' stroke-width='1.6'~R/><circle cx='60.4' cy='49.2' r='3.5' fill='#e4b58e'~I/></g></g>
      <g transform='translate(890.3 362.9) scale(1.4583)'><g><path d='M27.5 39 L39 50.1 L48.2 38.3'~N10.2'~R/><path d='M27.5 39 L39 50.1 L48.2 38.3' fill='none' stroke='#cac3b6' stroke-width='7'~R/><circle cx='48.2' cy='38.3' r='3.5' fill='#c8af9a'~I/></g><rect x='28' y='29' width='6' height='8' fill='#f3d6bd'~I/><g><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='#f6efe0'/><path d='M18.8 66 H41.2 L40.5 76 H19.5Z' fill='#2a2a3a'/><path d='M25.5 35 L26.5 70 M37.5 35 L36.5 70' stroke='#6a4424' stroke-width='3.2'/><path d='M26 48 H37' stroke='#6a4424' stroke-width='2.6'/><path d='M19 39 L21.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none'~I/></g><g><circle cx='31' cy='22' r='11' fill='#f3d6bd'~I/><ellipse cx='34.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><ellipse cx='39.2' cy='21.5' rx='1.7' ry='2.2' fill='#1c1410'/><path d='M34.8 27.4 q2.6 2.4 5.2 0'~N1.4' stroke-linecap='round'/><path d='M27 25 C28 34 35 37 40 31.5 C42 29 42.4 25 41.6 23.5 C40 25.8 34 29.6 27 25Z' fill='#5a3820' opacity='0.35'/><path d='M20 24 C18.5 13 25 9 32 9.5 C38 10 42 14 42 18 C37 15 32 15 28 16 C26 20 24 25 20 24Z' fill='#5a3820'~I/><path d='M25 9 Q17 0 18 -6 Q23 2 28 8Z' fill='#f2ead6'~I/><ellipse cx='32' cy='16' rx='14.5' ry='2.8' fill='#5a3a1e'~I/><path d='M23 15.5 L25 5 Q32 2 39 5 L41 15.5Z' fill='#5a3a1e'~I/><path d='M23.4 12.5 H40.6' stroke='#412b18' stroke-width='2'/></g><path d='M38.4 28.6 Q50.2 34.3 48.2 38.3 T51.9 61.1 Q55.9 65.1 57.9 58.1'~N7'~R/><path d='M38.4 28.6 Q50.2 34.3 48.2 38.3 T51.9 61.1 Q55.9 65.1 57.9 58.1' fill='none' stroke='#d4af37' stroke-width='3.8'~R/><path d='M57.9 58.1 l1 -6 l5 2 Z' fill='#d4af37'~I/><g><path d='M33.5 39 L39 54 L53.9 55.1'~N10.2'~R/><path d='M33.5 39 L39 54 L53.9 55.1' fill='none' stroke='#f6efe0' stroke-width='7'~R/><circle cx='53.9' cy='55.1' r='3.5' fill='#f3d6bd'~I/></g></g>`);
    // (Each row's people behind their table, which hides them from the waist; a stein on the
    // table in front of those without one up.)
    for (let row = 0; row < 3; row++) {
      const y = 520 + row * 110;
      for (let x = 30 + (row % 2) * 40; x < 1600; x += 80) {
        const k = ((x / 80) | 0) * 5 + row * 2;
        out += `<use href='#okp${k % 6}' x='${x}' y='${y + 10}'/>${[1, 4].includes(k % 6) ? '' : `<rect x='${x + 16}' y='${y + 18}' width='14' height='22' rx='2' fill='#f4c430' stroke='#fff' stroke-width='3'/>`}`;
      }
      out += `<rect x='0' y='${y + 40}' width='1600' height='24' fill='#8a5a2a'/><rect x='0' y='${y + 64}' width='1600' height='28' fill='#5a3a1a'/>`;
    }
    out += [160, 1440].map((x) => `<rect x='${x - 14}' y='0' width='28' height='900' fill='#7a5230'/><rect x='${x - 14}' y='0' width='8' height='900' fill='#9a6a40'/>`).join('');
    return scene(out);
  }

  // ---------- The wasteland ----------
  // Fury Road: a teal sky burning to orange at the horizon, the sun going down huge in the haze.
  // On the left a sandstorm wall the height of the sky rolls in, lightning inside it, with the
  // Citadel's three rock towers standing in front of it (green on top, water falling). Rock
  // needles and mesas, dunes in layers, tyre tracks in the sand, a wrecked spiked war car, oil
  // drums burning, and a skull on a pole. (The convoy, the storm rolling in and the explosions
  // are on the TV: see SCENES.garageWasteland in public/scenery.js.) The ground goes dark at the
  // bottom, so a phone's buttons and text sit on something calm.
  function wasteland() {
    const rand = seeded(23);
    let out = `<defs>
      <linearGradient id='wsky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0b2a33'/><stop offset='0.26' stop-color='#17505a'/><stop offset='0.44' stop-color='#4f5e52'/><stop offset='0.54' stop-color='#b05a2a'/><stop offset='0.63' stop-color='#e8803a'/></linearGradient>
      <radialGradient id='wsun' cx='0.5' cy='0.5' r='0.5'><stop offset='0' stop-color='#fff2c4'/><stop offset='0.12' stop-color='#ffd88a' stop-opacity='0.95'/><stop offset='0.35' stop-color='#ff9a3a' stop-opacity='0.5'/><stop offset='1' stop-color='#ff7a1a' stop-opacity='0'/></radialGradient>
      <linearGradient id='wstorm' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#2a100a'/><stop offset='0.7' stop-color='#4a1e10'/><stop offset='1' stop-color='#7a3416'/></linearGradient>
      <linearGradient id='wtower' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#4a3436'/><stop offset='0.55' stop-color='#8a5238'/><stop offset='1' stop-color='#c8763e'/></linearGradient>
      <linearGradient id='wd1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c8692e'/><stop offset='1' stop-color='#7a3416'/></linearGradient>
      <linearGradient id='wd2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6a2a10'/><stop offset='1' stop-color='#3a160a'/></linearGradient>
      <linearGradient id='wd3' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3e180a'/><stop offset='0.5' stop-color='#261006'/><stop offset='1' stop-color='#140803'/></linearGradient>
      <linearGradient id='whaze' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffb060' stop-opacity='0'/><stop offset='0.5' stop-color='#ffb060' stop-opacity='0.35'/><stop offset='1' stop-color='#ffb060' stop-opacity='0'/></linearGradient>
      <linearGradient id='wchrome' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f4f0e8'/><stop offset='0.5' stop-color='#8a8a88'/><stop offset='1' stop-color='#3a3634'/></linearGradient></defs>
      <rect width='1600' height='900' fill='url(#wsky)'/>`;
    // High streaks of cloud, lit from below by the sun.
    out += [[160, 120, 520], [700, 70, 420], [1100, 150, 560], [420, 210, 380], [1250, 40, 300]].map(([x, y, w]) => `<path d='M${x} ${y} q${w / 2} -14 ${w} 0 q-${w / 2} 8 -${w} 0Z' fill='#e8a070' opacity='0.22'/>`).join('');
    // The sun, huge in the haze (between the TV's table and its sidebar, where it can be seen),
    // and the glow along the horizon under it.
    out += `<ellipse cx='1040' cy='560' rx='700' ry='120' fill='#ffb060' opacity='0.35'/>
      <circle cx='1075' cy='300' r='340' fill='url(#wsun)'/><circle cx='1075' cy='300' r='56' fill='#fff0c0' opacity='0.95'/>`;
    // The sandstorm wall: billows piled up the sky, back ones first. Each is dark, with its edge
    // towards the sun (right, above) lit orange; red lightning-glow and forks inside.
    let storm = `<path d='M-60 580 V200 Q100 90 300 100 Q520 120 600 260 Q700 360 720 580Z' fill='url(#wstorm)'/>`;
    for (let y = 110; y <= 540; y += 52) {
      const edge = 520 + (y - 110) * 0.45;
      for (let x = -40 + rand() * 40; x < edge; x += 70 + rand() * 50) {
        const r = 52 + rand() * 40 + (y - 110) * 0.05;
        // Only the billows on the top and the front catch the sun; inside the wall it's murk.
        const outer = y < 200 || x > edge - 110;
        const dark = pick(rand, ['#2e1209', '#3a160c', '#341409', '#401a0d']);
        const lit = outer ? (y < 260 ? '#b8582a' : '#8a3e1c') : pick(rand, ['#4a1e0f', '#3e180c']);
        storm += `<circle cx='${(x + r * 0.16).toFixed(0)}' cy='${(y - r * 0.14).toFixed(0)}' r='${r.toFixed(0)}' fill='${lit}'/><circle cx='${x.toFixed(0)}' cy='${y.toFixed(0)}' r='${r.toFixed(0)}' fill='${dark}'/>`;
      }
    }
    storm += `<ellipse cx='260' cy='340' rx='260' ry='120' fill='#ff4a1a' opacity='0.13'/><ellipse cx='120' cy='220' rx='140' ry='70' fill='#ffd0a0' opacity='0.07'/>
      <path d='M250 150 l-30 70 l34 -6 l-44 96 l22 -4 l-30 62' stroke='#ffb0a0' stroke-width='12' fill='none' opacity='0.12'/>
      <path d='M250 150 l-30 70 l34 -6 l-44 96 l22 -4 l-30 62 M244 314 l26 30' stroke='#fff0e0' stroke-width='3' fill='none' opacity='0.6'/>
      <path d='M480 220 l-16 40 l20 -4 l-24 60' stroke='#ffe8d0' stroke-width='2' fill='none' opacity='0.45'/>`;
    // The dust curtain at its foot, and sand flying off the front of it.
    storm += `<path d='M-60 600 V470 Q200 430 460 470 Q640 500 760 600Z' fill='#6a2c12' opacity='0.8'/>`;
    for (let i = 0; i < 70; i++) storm += `<circle cx='${(600 + rand() * 260).toFixed(0)}' cy='${(260 + rand() * 320).toFixed(0)}' r='${(1 + rand() * 2.5).toFixed(1)}' fill='#d88a50' opacity='${(0.25 + rand() * 0.4).toFixed(2)}'/>`;
    out += storm;
    // The Citadel: three tall rock towers in front of the storm, gardens on top, water falling
    // from the middle one, caves lit; the haze pushes them back.
    const tower = (x, top, w) => `<path d='M${x - w * 0.7} 600 Q${x - w * 0.42} ${top + 260} ${x - w * 0.4} ${top + 60} Q${x - w * 0.42} ${top + 14} ${x - w * 0.3} ${top} H${x + w * 0.3} Q${x + w * 0.44} ${top + 18} ${x + w * 0.42} ${top + 70} Q${x + w * 0.46} ${top + 280} ${x + w * 0.74} 600Z' fill='url(#wtower)'/>
      <path d='M${x + w * 0.12} ${top + 4} Q${x + w * 0.3} ${top + 200} ${x + w * 0.5} 600 H${x + w * 0.74} Q${x + w * 0.46} ${top + 280} ${x + w * 0.42} ${top + 70} Q${x + w * 0.44} ${top + 18} ${x + w * 0.3} ${top}Z' fill='#e0904e' opacity='0.35'/>
      <path d='M${x - w * 0.36} ${top + 6} q${w * 0.14} -22 ${w * 0.26} -8 q${w * 0.12} -22 ${w * 0.26} -6 q${w * 0.12} -18 ${w * 0.24} 2 q-${w * 0.38} 14 -${w * 0.76} 12Z' fill='#4f7034'/>
      ${[0, 1, 2, 3].map((k) => `<rect x='${(x - w * 0.22 + ((k * 53) % (w * 0.44))).toFixed(0)}' y='${top + 70 + k * 64}' width='5' height='4' fill='#ffd88a' opacity='0.6'/>`).join('')}`;
    out += tower(200, 230, 110) + tower(500, 250, 100) + tower(345, 170, 130);
    out += `<path d='M356 196 Q348 380 362 600' stroke='#bfe6e0' stroke-width='6' fill='none' opacity='0.5'/><path d='M362 200 Q356 380 368 600' stroke='#eafffb' stroke-width='2' fill='none' opacity='0.65'/>
      <ellipse cx='364' cy='596' rx='40' ry='8' fill='#dff6f0' opacity='0.35'/>
      <path d='M244 250 Q290 236 300 240 M404 262 Q440 250 462 262' stroke='#2a1e1a' stroke-width='2' fill='none'/>`;
    // Mesas far off to the right, pale in the haze, and rock needles nearer, flanking the sun.
    out += `<path d='M960 560 L980 512 H1060 L1076 560Z M1260 560 L1290 470 H1420 L1440 520 H1500 L1520 560Z M1500 560 L1530 510 H1600 V560Z' fill='#c06a3a' opacity='0.7'/>`;
    const needle = (x, top, w, fill) => `<path d='M${x - w} 600 Q${x - w * 0.6} ${top + 120} ${x - w * 0.3} ${top + 20} L${x - w * 0.1} ${top} L${x + w * 0.2} ${top + 10} Q${x + w * 0.5} ${top + 140} ${x + w} 600Z' fill='${fill}'/><path d='M${x - w * 0.1} ${top} L${x + w * 0.2} ${top + 10} Q${x + w * 0.5} ${top + 140} ${x + w} 600 H${x + w * 0.4} Q${x + w * 0.2} ${top + 140} ${x - w * 0.1} ${top}Z' fill='#e08a4a' opacity='0.3'/>`;
    out += needle(1030, 270, 30, '#4a2216') + needle(1160, 330, 24, '#5a2a1a') + needle(740, 360, 24, '#5a2a1a') + needle(1570, 300, 40, '#4a2214');
    // A rock arch, far right.
    out += `<path d='M1300 600 Q1300 420 1360 400 Q1440 380 1480 430 Q1520 480 1520 600 H1480 Q1470 480 1420 470 Q1360 470 1350 600Z' fill='#5a2a1a'/>`;
    // Haze along the horizon.
    out += `<rect y='470' width='1600' height='160' fill='url(#whaze)'/>`;
    // The dunes: far, middle (a crest lit by the sun), and the dark ground in front.
    out += `<path d='M0 590 Q180 556 380 582 Q620 612 860 566 Q1100 530 1340 574 Q1480 596 1600 572 V900 H0Z' fill='url(#wd1)'/>
      <path d='M0 630 Q240 594 520 618 Q800 640 1040 606 Q1300 576 1600 624 V900 H0Z' fill='url(#wd2)'/>
      <path d='M520 618 Q800 640 1040 606 Q1300 576 1600 624' stroke='#ffb070' stroke-width='3' fill='none' opacity='0.6'/>
      <path d='M0 740 Q300 700 640 730 Q980 760 1240 716 Q1440 690 1600 720 V900 H0Z' fill='url(#wd3)'/>
      <path d='M0 740 Q300 700 640 730 Q980 760 1240 716 Q1440 690 1600 720' stroke='#c8602a' stroke-width='2' fill='none' opacity='0.5'/>`;
    // Tyre tracks swinging across the sand.
    out += [0, 18].map((d) => `<path d='M-20 ${812 + d} Q500 ${760 + d} 900 ${790 + d} T1640 ${770 + d}' stroke='#120602' stroke-width='5' fill='none' opacity='0.45' stroke-dasharray='10 6'/>`).join('');
    // A wrecked war car, spikes and all, half in the sand.
    const warcar = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M0 30 L20 4 H120 L150 16 H190 L200 40 H0Z' fill='#2a140c'/><path d='M30 8 L50 -14 H100 L116 6Z' fill='#1a0c06'/>
      ${Array.from({ length: 9 }, (_, i) => `<path d='M${28 + i * 10} ${-10 + Math.abs(4 - i) * 2} l4 -18 l4 18Z' fill='#3a2014'/>`).join('')}
      <circle cx='40' cy='42' r='20' fill='#0e0604'/><circle cx='160' cy='44' r='16' fill='#0e0604'/><circle cx='160' cy='44' r='6' fill='url(#wchrome)'/>
      <path d='M150 10 h30 v8 h-30Z' fill='url(#wchrome)'/><path d='M84 -14 l-6 -40 M78 -54 l14 6' stroke='#2a140c' stroke-width='4'/></g>`;
    out += warcar(1210, 770, 1.1) + warcar(560, 800, 0.6);
    // Oil drums burning.
    out += [[90, 770, 1], [1480, 790, 1.1], [820, 812, 0.7]].map(([x, y, s]) => `<g transform='translate(${x} ${y}) scale(${s})'><ellipse cx='25' cy='-24' rx='60' ry='50' fill='#ff7a1a' opacity='0.18'/><path d='M8 0 Q2 -30 14 -44 Q16 -30 24 -54 Q30 -34 36 -46 Q46 -26 42 0Z' fill='#ff8a1a' opacity='0.9'/><path d='M16 0 Q14 -20 24 -32 Q30 -18 34 0Z' fill='#ffd060'/>
      <rect x='0' y='0' width='50' height='66' rx='4' fill='#4a1e0c'/><rect x='0' y='16' width='50' height='5' fill='#2a0e04'/><rect x='0' y='44' width='50' height='5' fill='#2a0e04'/><rect x='4' y='4' width='6' height='58' fill='#ff9a4a' opacity='0.25'/></g>`).join('');
    // A skull on a pole, with a steering wheel hung under it.
    out += `<path d='M1380 830 V600' stroke='#2a120a' stroke-width='8'/><circle cx='1380' cy='690' r='26' fill='none' stroke='url(#wchrome)' stroke-width='6'/><path d='M1380 664 V716 M1354 690 H1406' stroke='#8a8a88' stroke-width='4'/>
      <path d='M1358 582 Q1358 556 1380 556 Q1402 556 1402 582 Q1402 596 1394 600 V610 H1366 V600 Q1358 596 1358 582Z' fill='#e8dcc0'/><circle cx='1371' cy='582' r='6' fill='#1a0a04'/><circle cx='1389' cy='582' r='6' fill='#1a0a04'/><path d='M1372 604 V610 M1380 604 V610 M1388 604 V610' stroke='#1a0a04' stroke-width='2'/>`;
    // Sand blowing low across the ground.
    for (let i = 0; i < 12; i++) out += `<path d='M${(rand() * 1600).toFixed(0)} ${(640 + rand() * 200).toFixed(0)} h${(80 + rand() * 200).toFixed(0)}' stroke='#e8a060' stroke-width='${(1 + rand() * 2).toFixed(1)}' opacity='${(0.12 + rand() * 0.2).toFixed(2)}' stroke-linecap='round'/>`;
    return scene(out);
  }

  // ---------- The mechanic's garage ----------
  // A working garage late on a sunny afternoon, the radio on: a two-tone '57 sedan up on the lift
  // (a drop light hung off it, the drain pan under), steel trusses and humming fluorescents, a shelf
  // of oil cans, the pegboard with its tools painted round (the big wrench is missing), the
  // calendar and the clock (nearly five), the red tool chest with the radio on top, tyres stacked,
  // the roll-up door open on the street (a palm, the tyre shop across the way) and the sun pouring
  // in over the floor, where the shop dog's asleep in it; the workbench, a fridge of cold ones and
  // an oil drum in the corner. Dark up top and shaded in the middle, for the heading and the cards.
  function garage() {
    const rand = seeded(57);
    const tyre = (x, y, r, rim = '#b8c0c8') => `<circle cx='${x}' cy='${y}' r='${r}' fill='#141618'/><circle cx='${x}' cy='${y}' r='${r * 0.72}' fill='none' stroke='#26292c' stroke-width='${r * 0.08}' stroke-dasharray='${r * 0.12} ${r * 0.1}'/><circle cx='${x}' cy='${y}' r='${r * 0.55}' fill='#e8e8e2'/><circle cx='${x}' cy='${y}' r='${r * 0.44}' fill='${rim}'/><circle cx='${x}' cy='${y}' r='${r * 0.16}' fill='#6a7278'/><path d='M${x - r * 0.3} ${y - r * 0.3} q${r * 0.2} -${r * 0.12} ${r * 0.4} 0' stroke='#fff' stroke-width='${r * 0.08}' fill='none' opacity='0.7'/>`;
    let out = `<defs>
      <pattern id='gb' width='120' height='44' patternUnits='userSpaceOnUse'><rect width='120' height='44' fill='#4e5a66'/><rect x='2' y='2' width='56' height='18' rx='1' fill='#5a6672'/><rect x='62' y='2' width='56' height='18' rx='1' fill='#56626e'/><rect x='-28' y='24' width='56' height='18' rx='1' fill='#58646f'/><rect x='32' y='24' width='56' height='18' rx='1' fill='#5c6874'/><rect x='92' y='24' width='56' height='18' rx='1' fill='#56626d'/></pattern>
      <pattern id='gh' width='22' height='22' patternUnits='userSpaceOnUse'><rect width='22' height='22' fill='#c8a06a'/><circle cx='11' cy='11' r='2.6' fill='#7a5a2e'/></pattern>
      <linearGradient id='gl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f4fbff' stop-opacity='0.2'/><stop offset='1' stop-color='#f4fbff' stop-opacity='0'/></linearGradient>
      <linearGradient id='gs' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#8ec4e8'/><stop offset='1' stop-color='#eef6f8'/></linearGradient>
      <linearGradient id='gsun' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff0c8' stop-opacity='0.32'/><stop offset='1' stop-color='#ffe0a0' stop-opacity='0.05'/></linearGradient>
      <linearGradient id='gf' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6e767e'/><stop offset='1' stop-color='#33393f'/></linearGradient>
      <linearGradient id='gc' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='0.5' stop-color='#9aa4ac'/><stop offset='1' stop-color='#e8ecee'/></linearGradient>
      <linearGradient id='gsh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0c1014' stop-opacity='0.75'/><stop offset='0.16' stop-color='#0c1014' stop-opacity='0.1'/><stop offset='0.7' stop-color='#0c1014' stop-opacity='0'/><stop offset='1' stop-color='#0c1014' stop-opacity='0.5'/></linearGradient>
      <radialGradient id='gdl'><stop offset='0' stop-color='#fff2c0' stop-opacity='0.55'/><stop offset='1' stop-color='#ffd890' stop-opacity='0'/></radialGradient>
      <radialGradient id='gmid'><stop offset='0' stop-color='#10141a' stop-opacity='0.45'/><stop offset='1' stop-color='#10141a' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='#3e4852'/><rect y='100' width='1600' height='540' fill='url(#gb)'/><rect y='100' width='1600' height='540' fill='#1a2028' opacity='0.12'/>`;
    // The roll-up door, open on the street in the sun.
    out += `<rect x='1100' y='150' width='460' height='490' fill='url(#gs)'/>
      <path d='M1100 470 H1250 V400 H1420 V470 H1560 V640 H1100Z' fill='#c8b89a'/><rect x='1250' y='380' width='170' height='26' fill='#c0392b'/><text x='1335' y='400' font-size='20' font-family='Arial Black, sans-serif' text-anchor='middle' fill='#fff'>TIRES</text>
      ${[1270, 1310, 1350, 1390].map((x) => `<rect x='${x}' y='420' width='26' height='40' fill='#7ab0d0'/>`).join('')}
      <path d='M1500 640 V420' stroke='#5a4a3a' stroke-width='8'/><path d='M1500 424 q-60 -20 -90 10 M1500 424 q-40 -40 -80 -40 M1500 424 q30 -46 80 -40 M1500 424 q50 -10 70 30 M1500 424 q-10 -40 10 -60' stroke='#3a7a3a' stroke-width='12' fill='none' stroke-linecap='round'/>
      <path d='M1160 640 V300 M1150 320 h20' stroke='#5a4a3a' stroke-width='5'/><path d='M1100 330 Q1300 360 1560 318' stroke='#2a2a2a' stroke-width='1.5' fill='none'/>
      <rect x='1100' y='560' width='460' height='80' fill='#8a8a84'/><rect x='1100' y='552' width='460' height='10' fill='#b8b4a8'/><path d='M1120 600 h60 M1240 600 h60 M1360 600 h60 M1480 600 h60' stroke='#e8d050' stroke-width='5'/>
      <rect x='1100' y='140' width='460' height='120' fill='#8a96a2'/>${Array.from({ length: 8 }, (_, i) => `<rect x='1100' y='${144 + i * 15}' width='460' height='3' fill='#5a6672'/>`).join('')}<rect x='1300' y='252' width='60' height='10' rx='3' fill='#3a4048'/>
      <rect x='1086' y='130' width='16' height='512' fill='#2a3038'/><rect x='1558' y='130' width='16' height='512' fill='#2a3038'/><rect x='1086' y='126' width='488' height='16' fill='#2a3038'/>`;
    // The ceiling: trusses and fluorescent tubes (their light falls in cones).
    out += `<rect width='1600' height='104' fill='#1c2228'/><path d='${Array.from({ length: 33 }, (_, i) => `${i ? 'L' : 'M'}${i * 50} ${i % 2 ? 24 : 88}`).join(' ')}' stroke='#3a444e' stroke-width='5' fill='none'/>
      <rect y='18' width='1600' height='8' fill='#3a444e'/><rect y='86' width='1600' height='10' fill='#3a444e'/>
      ${[140, 460, 780, 1420].map((x) => `<path d='M${x - 70} 106 L${x + 70} 106 L${x + 220} 640 L${x - 220} 640Z' fill='url(#gl)'/><rect x='${x - 76}' y='94' width='152' height='12' rx='3' fill='#2a3038'/><rect x='${x - 70}' y='104' width='140' height='6' rx='3' fill='#f4fbff'/>`).join('')}`;
    // The shelf of oil cans and the jerry can, the OPEN sign's bracket, the pegboard (one tool
    // missing), the calendar and the clock.
    out += `<rect x='10' y='168' width='560' height='9' fill='#7a5a34'/>${Array.from({ length: 11 }, (_, i) => {
        const x = 24 + i * 34 + (i > 8 ? 30 : 0);
        return i === 9 ? '' : `<rect x='${x}' y='${130 + (i % 3) * 4}' width='24' height='${38 - (i % 3) * 4}' rx='2' fill='${pick(rand, ['#c0392b', '#2a6fdb', '#f4c430', '#2a8a4a', '#e8e8e8'])}'/><rect x='${x}' y='${142 + (i % 3) * 2}' width='24' height='9' fill='#fff' opacity='0.5'/>`;
      }).join('')}
      <path d='M330 168 V126 h46 l10 12 V168Z' fill='#c0392b'/><path d='M338 132 h18 v8' stroke='#8a1a10' stroke-width='5' fill='none'/>
      <rect x='40' y='260' width='420' height='220' fill='url(#gh)'/><rect x='40' y='260' width='420' height='220' fill='none' stroke='#5a3e1e' stroke-width='6'/>
      <g fill='none' stroke='#c0392b' stroke-width='3'><path d='M80 290 h14 v120 h-14Z M76 280 h22 v16 h-22Z'/><path d='M130 296 h10 v100 h-10Z'/><path d='M172 286 h12 v86 h-12Z M164 280 h28 v12 h-28Z'/><path d='M226 290 l60 0 l-6 14 l-48 0Z M252 304 h8 v100 h-8Z'/><path d='M310 300 h16 l40 120 h-16Z'/><circle cx='410' cy='320' r='30'/><path d='M400 380 h20 v80 h-20Z'/></g>
      <g fill='#2a3038'><path d='M80 290 h14 v120 h-14Z M76 280 h22 v16 h-22Z'/><path d='M130 296 h10 v100 h-10Z M126 288 h18 v10 h-18Z'/><path d='M172 286 h12 v86 h-12Z M164 280 h28 v12 h-28Z'/><path d='M226 290 l60 0 l-6 14 l-48 0Z M252 304 h8 v100 h-8Z'/><circle cx='410' cy='320' r='30' fill='none' stroke='#2a3038' stroke-width='8'/><path d='M400 380 h20 v80 h-20Z' fill='#c0392b'/></g>
      <rect x='500' y='240' width='86' height='124' fill='#f4f0e6'/><rect x='508' y='248' width='70' height='46' fill='#1a5aa8'/><path d='M514 284 q12 -16 30 -14 l14 0 q10 4 14 14Z' fill='#e03a2a'/><circle cx='524' cy='286' r='5' fill='#1a1a1a'/><circle cx='562' cy='286' r='5' fill='#1a1a1a'/>
      ${Array.from({ length: 20 }, (_, i) => `<rect x='${510 + (i % 5) * 14}' y='${302 + Math.floor(i / 5) * 14}' width='10' height='9' fill='#c8c4b8'/>`).join('')}<path d='M538 328 l10 9 M548 328 l-10 9' stroke='#c0392b' stroke-width='2'/>
      <circle cx='660' cy='200' r='34' fill='#f4f0e6' stroke='#2a3038' stroke-width='6'/><path d='M660 200 V176 M660 200 L682 210' stroke='#1a1a1a' stroke-width='4' stroke-linecap='round'/>`;
    // The lift and the sedan up on it: two-tone, chrome, whitewalls, the exhaust underneath, a drop
    // light hung off the bumper.
    out += `${[590, 1010].map((x) => `<rect x='${x}' y='220' width='30' height='420' fill='#c0392b'/><rect x='${x + 4}' y='220' width='6' height='420' fill='#e0604a'/>${[0, 1, 2, 3].map((k) => `<path d='M${x} ${590 + k * 12} l30 -10 v8 l-30 10Z' fill='#f4c430'/>`).join('')}<rect x='${x - 14}' y='630' width='58' height='14' fill='#7a1a14'/>`).join('')}
      <rect x='610' y='428' width='130' height='10' fill='#8a1a14'/><rect x='890' y='428' width='130' height='10' fill='#8a1a14'/>
      <path d='M560 400 Q556 360 600 350 L690 340 Q730 290 780 280 H900 Q950 282 990 336 L1060 346 Q1100 356 1100 392 V420 H560Z' fill='#2a6fdb'/>
      <path d='M560 382 H1100 V396 H560Z' fill='#f4f0e6'/><path d='M720 336 Q750 296 786 292 H896 Q936 296 966 336Z' fill='#f4f0e6'/>
      <path d='M738 334 Q760 304 790 302 H836 V334Z M846 334 V302 H892 Q924 306 948 334Z' fill='#9ad0ec'/><path d='M752 330 l26 -24 M860 330 l20 -24' stroke='#fff' stroke-width='5' opacity='0.5'/>
      <path d='M556 404 H604 V420 H556Z M1060 404 H1108 V420 H1060Z' fill='url(#gc)'/><rect x='1084' y='360' width='18' height='22' rx='6' fill='#fff8d0'/><path d='M574 356 l-14 -16 l6 22Z' fill='#2a6fdb'/>
      <rect x='600' y='420' width='460' height='18' fill='#1a1e24'/><path d='M640 440 H1000 q20 0 24 10 H640Z' fill='#4a4e54'/><rect x='740' y='436' width='90' height='20' rx='9' fill='#6a6e72'/>
      ${tyre(680, 446, 44)}${tyre(960, 446, 44)}
      <path d='M1080 420 Q1090 470 1060 520' stroke='#1a1a1a' stroke-width='3' fill='none'/><circle cx='1060' cy='540' r='130' fill='url(#gdl)'/><path d='M1048 516 h24 l4 40 h-32Z' fill='#f4c430'/><path d='M1046 520 v34 M1060 518 v38 M1074 520 v34' stroke='#2a2a2a' stroke-width='3'/><circle cx='1060' cy='536' r='9' fill='#fffbe8'/>
      <ellipse cx='820' cy='640' rx='90' ry='12' fill='#2a2e34'/><ellipse cx='820' cy='636' rx='70' ry='8' fill='#141618'/>`;
    // The floor in the sun, the stripe along the wall, oil stains, the drain.
    out += `<rect y='640' width='1600' height='260' fill='url(#gf)'/><path d='M0 640 H1600' stroke='#f4c430' stroke-width='10' stroke-dasharray='36 28'/>
      <path d='M1100 640 H1560 L1700 900 H900Z' fill='url(#gsun)'/>
      ${Array.from({ length: 10 }, () => `<ellipse cx='${(rand() * 1500 + 50).toFixed(0)}' cy='${(680 + rand() * 200).toFixed(0)}' rx='${(30 + rand() * 60).toFixed(0)}' ry='${(6 + rand() * 8).toFixed(0)}' fill='#1a1c20' opacity='0.4'/>`).join('')}
      <path d='M300 900 L560 640 M1300 900 L1060 640' stroke='#2a2e34' stroke-width='3'/><rect x='760' y='770' width='120' height='26' rx='4' fill='#24282c'/>${Array.from({ length: 9 }, (_, i) => `<rect x='${766 + i * 12}' y='774' width='5' height='18' fill='#4a5058'/>`).join('')}
      <path d='M640 900 Q700 780 820 700' stroke='#1e2226' stroke-width='16' fill='none' opacity='0.35' stroke-dasharray='14 8'/>`;
    // The tool chest with the radio on top, a mug, the tyres, the floor jack, the creeper.
    out += `<rect x='20' y='520' width='250' height='60' rx='6' fill='#c0392b'/><rect x='14' y='580' width='262' height='220' rx='6' fill='#a82a20'/>
      ${[0, 1].map((k) => `<rect x='30' y='${530 + k * 24}' width='230' height='18' rx='3' fill='#d8473a'/><rect x='120' y='${536 + k * 24}' width='50' height='5' rx='2' fill='url(#gc)'/>`).join('')}
      ${[0, 1, 2, 3, 4].map((k) => `<rect x='26' y='${592 + k * 40}' width='238' height='32' rx='3' fill='#d8473a'/><rect x='110' y='${602 + k * 40}' width='70' height='7' rx='3' fill='url(#gc)'/>`).join('')}
      <rect x='190' y='600' width='40' height='18' fill='#f4c430' transform='rotate(-8 210 609)'/><circle cx='60' cy='650' r='12' fill='#2a6fdb'/><rect x='44' y='696' width='46' height='12' fill='#1a1a1a'/>
      ${[50, 240].map((x) => `<circle cx='${x}' cy='812' r='12' fill='#1a1a1a'/>`).join('')}
      <g transform='translate(390 -354)'><rect x='46' y='470' width='130' height='52' rx='8' fill='#5a3a1e'/><rect x='56' y='478' width='62' height='36' rx='4' fill='#e8d8a0'/><path d='M60 486 h54 M60 496 h54 M60 506 h54' stroke='#8a7a5a' stroke-width='2'/>
      <rect x='86' y='482' width='3' height='30' fill='#c0392b'/><circle cx='142' cy='496' r='12' fill='#e8d8b0'/><circle cx='142' cy='496' r='4' fill='#5a3a1e'/><path d='M160 470 L196 430' stroke='#a8b0b8' stroke-width='3'/></g>
      <rect x='206' y='494' width='30' height='28' rx='3' fill='#f4f0e6'/><path d='M236 500 q10 2 0 14' stroke='#f4f0e6' stroke-width='4' fill='none'/>
      ${[0, 1, 2, 3].map((k) => `<ellipse cx='350' cy='${846 - k * 46}' rx='76' ry='26' fill='#16181a'/><rect x='274' y='${820 - k * 46}' width='152' height='26' fill='#16181a'/><ellipse cx='350' cy='${820 - k * 46}' rx='76' ry='26' fill='#24272a'/><ellipse cx='350' cy='${820 - k * 46}' rx='36' ry='11' fill='#0c0d0e'/>`).join('')}
      <path d='M440 868 h110 l14 -14 v20 h-124Z' fill='#c0392b'/><circle cx='456' cy='878' r='9' fill='#1a1a1a'/><circle cx='540' cy='878' r='9' fill='#1a1a1a'/><path d='M556 856 L660 790' stroke='#a82a20' stroke-width='8' stroke-linecap='round'/>
      <rect x='620' y='854' width='130' height='18' rx='6' fill='#2a3038'/><circle cx='636' cy='880' r='7' fill='#1a1a1a'/><circle cx='734' cy='880' r='7' fill='#1a1a1a'/><path d='M660 852 q20 -12 40 0 l-6 8 h-28Z' fill='#d8c8a8'/>`;
    // The corner: workbench and vise, the fridge of cold ones, the oil drum, the dog asleep in the sun.
    out += `<rect x='1180' y='658' width='420' height='20' fill='#8a6438'/><rect x='1180' y='676' width='420' height='8' fill='#5a3e20'/><rect x='1590' y='684' width='10' height='200' fill='#5a3e20'/>
      <path d='M1520 658 v-30 h40 v30 M1510 622 h60 v10 h-60Z' fill='#3a6aa0'/><rect x='1570' y='624' width='30' height='6' fill='#a8b0b8'/>
      <rect x='1250' y='620' width='40' height='38' fill='#9a8a6a'/><rect x='1250' y='620' width='40' height='8' fill='#b8a888'/><path d='M1340 656 l50 -6 l40 6Z' fill='#f4f0e6'/>
      <rect x='1196' y='696' width='112' height='170' rx='8' fill='#eceae4'/><rect x='1196' y='760' width='112' height='4' fill='#b8b4aa'/><rect x='1288' y='710' width='6' height='40' rx='3' fill='#9a9a94'/>
      <text x='1252' y='740' font-size='15' font-family='Arial Black, sans-serif' text-anchor='middle' fill='#c0392b'>COLD</text><text x='1252' y='756' font-size='15' font-family='Arial Black, sans-serif' text-anchor='middle' fill='#c0392b'>ONES</text>
      <rect x='1210' y='780' width='26' height='20' fill='#f4c430' transform='rotate(-6 1223 790)'/><circle cx='1270' cy='800' r='8' fill='#2a6fdb'/>
      <path d='M1452 712 h104 v170 h-104Z' fill='#2a5a9a'/><ellipse cx='1504' cy='712' rx='52' ry='10' fill='#3a6aaa'/><path d='M1452 750 h104 M1452 840 h104' stroke='#1a3a6a' stroke-width='6'/><rect x='1466' y='772' width='76' height='44' fill='#f4f0e6'/><text x='1504' y='800' font-size='14' font-family='Arial Black, sans-serif' text-anchor='middle' fill='#1a3a6a'>OIL</text>
      ${/* The shop dog asleep: the TV's character kit (see critter() in public/scenery.js), pasted from
        Scenery.kit.critter.at('dog', 1386, 890, 116, { pose: 'sleep', color: '#c8945a', flip: true }). */ ''}<g transform='translate(1444 820.4) scale(-1.16 1.16)'><g transform='translate(50 60) scale(1) translate(-50 -60)'><g><path d='M14 56 Q10 34 38 32 Q64 30 72 42 Q78 54 66 57 H20 Q14 57 14 56Z' fill='#c8945a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><path d='M18 55 Q8 52 10 44' fill='none' stroke='#1c1410' stroke-width='7.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M18 55 Q8 52 10 44' fill='none' stroke='#c8945a' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'/><circle cx='76' cy='47' r='9.5' fill='#c8945a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M80 46 H92 Q97 46 97 51 Q97 56 92 56 H80Z' fill='#c8945a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M69 40 Q64 46 68 56 Q73 55 74 43Z' fill='#987045' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><ellipse cx='95.5' cy='49' rx='2' ry='1.7' fill='#1c1410'/><path d='M78 45 q2 1.8 4 0' stroke='#1c1410' stroke-width='1.3' fill='none' stroke-linecap='round'/></g></g>`;
    // Shade: dark along the top, the middle quieter for the cards.
    out += `<rect width='1600' height='900' fill='url(#gsh)'/><ellipse cx='700' cy='460' rx='560' ry='330' fill='url(#gmid)'/>`;
    return vvScene(out);
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
      // The crowd: the scenery's character kit in silhouette, from behind, from the waist up (its
      // heads where they were), every third one's cup up. Two of them, used over and over:
      // Scenery.kit.figureAt(0, 174, 218, { facing: 'back', skin: C, hair: 'short', hairColor: C,
      // top: C, bottom: C, face: 'none', crop: 'waist' }) with C '#1a1008', and the same with arms:
      // ['down', [160, 14]], holding: 'redcup'; class and style stripped.
      const torso = `<rect x='27' y='29' width='6' height='8' fill='#1a1008' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><g><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='#1a1008'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><g><circle cx='30' cy='22' r='11' fill='#1a1008' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M19 25 C17.5 13 24 9 30 9 C36 9 42.5 13 41 25 Q30 28 19 25Z' fill='#1a1008' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g>`;
      const armL = `<g><path d='M20 39 L18.3 54.9 L14.7 69.5' fill='none' stroke='#1c1410' stroke-width='10.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M20 39 L18.3 54.9 L14.7 69.5' fill='none' stroke='#1a1008' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/><circle cx='14.7' cy='69.5' r='3.5' fill='#1a1008' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g>`;
      out += `<defs><g id='fcS' transform='translate(-54.5 -40.4) scale(1.8167)'>${armL}${torso}<g><path d='M40 39 L41.7 54.9 L45.3 69.5' fill='none' stroke='#1c1410' stroke-width='10.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M40 39 L41.7 54.9 L45.3 69.5' fill='none' stroke='#1a1008' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/><circle cx='45.3' cy='69.5' r='3.5' fill='#1a1008' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g></g>
        <g id='fcC' transform='translate(-54.5 -40.4) scale(1.8167)'>${armL}${torso}<g><path d='M40 39 L45.5 24 L47 9' fill='none' stroke='#1c1410' stroke-width='10.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M40 39 L45.5 24 L47 9' fill='none' stroke='#1a1008' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/><g transform='translate(48 11)'><path d='M-4.4 -12 L-3.2 2 H3.2 L4.4 -12Z' fill='#d62828' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M-4.4 -12 H4.4 L4.2 -10 H-4.2Z' fill='#f4f4f4'/></g><circle cx='47' cy='9' r='3.5' fill='#1a1008' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g></g></defs>`;
      for (let x = 10; x < 1600; x += 46) {
        const y = 650 + ((x * 7) % 30);
        out += `<use href='#${(x / 46) % 3 < 1 ? 'fcC' : 'fcS'}' x='${x}' y='${y}'/>`;
      }
    }
    return scene(out);
  }
  // A beer-pong table, for the frat house's table: the white edge line and the centre line.
  const pong = 'linear-gradient(90deg, transparent calc(50% - 2px), rgba(255, 255, 255, 0.8) calc(50% - 2px) calc(50% + 2px), transparent calc(50% + 2px)), radial-gradient(ellipse at center, #1f6a3a 0%, #17552e 70%, #103f22 100%)';

  // Squeezes the spaces out of a drawing (every phone in the room is sent it).
  const vvTidy = (s) => s.replace(/\s+/g, ' ').replace(/> </g, '><');
  // Like scene(), but escaping only what has to be escaped in a quoted data URI (encodeURIComponent
  // triples every space, = and /, and the drawings below are big).
  const vvScene = (body) => `url("data:image/svg+xml,${`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'>${vvTidy(body)}</svg>`
    .replace(/[%#<>"]|[^\x20-\x7e]/g, (c) => encodeURIComponent(c))}")`;

  // The frat house basement on a Friday (the regular look; frat() above is the championship's):
  // wood panelling, the ΒΩΩΛ letters under a blacklight, string lights sagging, the stairs coming
  // down from the party upstairs with the door open and light spilling down them, a beer-pong table
  // set up in the middle, a battered couch with a brother passed out on it (someone's drawn him a
  // moustache), the keg on ice and a pyramid of cans in the corner under a neon sign, the little
  // high window onto the lawn (a gnome out there), and cups, cans and pizza boxes all over the floor.
  // The ceiling's dark under the TV's heading; the middle's shaded for the cards.
  function fratHouse() {
    const rand = seeded(41);
    const cup = (x, y, s = 1, tip = false) => `<g transform='translate(${x} ${y}) scale(${s})${tip ? ' rotate(-78)' : ''}'><path d='M-13 -30 h26 l-4 30 h-18Z' fill='#d62828'/><path d='M-13 -30 h26 v5 h-26Z' fill='#f4f4f4'/><path d='M-9 -22 l2 20' stroke='#ff7a7a' stroke-width='3' opacity='0.5'/>${tip ? `<ellipse cx='0' cy='-30' rx='13' ry='4' fill='#7a1010'/>` : ''}</g>`;
    const can = (x, y, c = '#c8d0d8', s = 1) => `<g transform='translate(${x} ${y}) scale(${s})'><rect x='-10' y='-34' width='20' height='34' rx='3' fill='${c}'/><rect x='-10' y='-24' width='20' height='12' fill='#1b3f8e'/><rect x='-7' y='-32' width='4' height='30' fill='#fff' opacity='0.35'/></g>`;
    let out = `<defs>
      <pattern id='fp' width='192' height='640' patternUnits='userSpaceOnUse'>${[0, 1, 2].map((i) => {
        const x = i * 64;
        let p = `<rect x='${x}' width='62' height='640' fill='${['#6b4528', '#5e3c22', '#734b2c'][i]}'/>`;
        for (let g = 0; g < 4; g++) { const gx = x + 6 + rand() * 50; const b = (rand() - 0.5) * 12; p += `<path d='M${gx.toFixed(0)} 0 C${(gx + b).toFixed(0)} 220 ${(gx - b).toFixed(0)} 420 ${gx.toFixed(0)} 640' stroke='#2a170a' stroke-width='${(0.8 + rand()).toFixed(1)}' fill='none' opacity='0.35'/>`; }
        p += `<ellipse cx='${x + 20 + rand() * 24}' cy='${100 + rand() * 400}' rx='4' ry='9' fill='#2a170a' opacity='0.5'/><rect x='${x + 62}' width='2' height='640' fill='#24140a'/><rect x='${x}' width='2' height='640' fill='#fff' opacity='0.06'/>`;
        return p;
      }).join('')}</pattern>
      <radialGradient id='fbulb'><stop offset='0' stop-color='#fff2c0' stop-opacity='0.5'/><stop offset='1' stop-color='#ffb040' stop-opacity='0'/></radialGradient>
      <linearGradient id='fdoor' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffd27a' stop-opacity='0.5'/><stop offset='1' stop-color='#ffb050' stop-opacity='0'/></linearGradient>
      <radialGradient id='fneon'><stop offset='0' stop-color='#ff2a5a' stop-opacity='0.5'/><stop offset='1' stop-color='#ff2a5a' stop-opacity='0'/></radialGradient>
      <radialGradient id='fuv'><stop offset='0' stop-color='#9a4aff' stop-opacity='0.4'/><stop offset='1' stop-color='#7a2aff' stop-opacity='0'/></radialGradient>
      <linearGradient id='ffl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3e2e22'/><stop offset='1' stop-color='#17100a'/></linearGradient>
      <linearGradient id='fsh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0a0604' stop-opacity='0.7'/><stop offset='0.16' stop-color='#0a0604' stop-opacity='0.05'/><stop offset='0.75' stop-color='#0a0604' stop-opacity='0'/><stop offset='1' stop-color='#0a0604' stop-opacity='0.5'/></linearGradient>
      <radialGradient id='fmid'><stop offset='0' stop-color='#140a04' stop-opacity='0.5'/><stop offset='1' stop-color='#140a04' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='#3a2414'/><rect y='80' width='1600' height='640' fill='url(#fp)'/>
      <rect y='554' width='1600' height='166' fill='#000' opacity='0.2'/><rect y='540' width='1600' height='14' fill='#2a1a0e'/><rect y='540' width='1600' height='3' fill='#a87444' opacity='0.5'/>
      <rect y='700' width='1600' height='20' fill='#24160c'/>`;
    // The ceiling: joists, a duct and a copper pipe, all in the dark.
    out += `<rect width='1600' height='86' fill='#1c120a'/>${Array.from({ length: 17 }, (_, i) => `<rect x='${i * 100}' width='24' height='86' fill='#2c1c10'/>`).join('')}
      <rect y='16' width='1600' height='34' fill='#5a5e62'/><rect y='19' width='1600' height='6' fill='#a8acb0' opacity='0.35'/>${Array.from({ length: 11 }, (_, i) => `<rect x='${i * 150 + 40}' y='16' width='5' height='34' fill='#34383c'/>`).join('')}
      <rect y='60' width='1600' height='7' fill='#9a5a34'/><rect y='80' width='1600' height='10' fill='#24160c'/>`;
    // The stairs down from the party: the door at the top open, light spilling down them.
    let steps = 'M0 250';
    for (let i = 0; i < 12; i++) steps += ` L${(i * 35).toFixed(0)} ${(250 + (i + 1) * 39).toFixed(0)} L${((i + 1) * 35).toFixed(0)} ${(250 + (i + 1) * 39).toFixed(0)}`;
    out += `<rect x='-10' y='96' width='74' height='158' fill='#ffcf80'/><rect x='-10' y='96' width='74' height='158' fill='none' stroke='#2a1a0e' stroke-width='8'/>
      <path d='M8 254 v-46 h16 v46 M30 254 v-40 h14 v40' fill='#3a2a3a' opacity='0.85'/>
      <path d='M-10 96 L64 96 L470 720 L-10 720Z' fill='url(#fdoor)'/>
      <path d='${steps} L420 760 L0 300Z' fill='#4a2e18'/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x='${i * 35 - 3}' y='${250 + (i + 1) * 39 - 4}' width='40' height='6' fill='#b07a44'/>`).join('')}
      <path d='M0 300 L420 760' stroke='#2a1a0e' stroke-width='12'/>
      ${[1, 3, 5, 7, 9, 11].map((i) => `<rect x='${i * 35 + 12}' y='${250 + (i + 1) * 39 - 84}' width='7' height='80' fill='#3a2412'/>`).join('')}
      <path d='M20 200 L440 680' stroke='#8a5a30' stroke-width='9' stroke-linecap='round'/>
      <g transform='translate(118 371) rotate(-6)'><path d='M-10 0 h22 l4 6 h-30Z M14 0 h20 l4 6 h-28Z' fill='#e8e8e8'/></g>
      <path d='M190 498 l14 -36 l14 36Z' fill='#ff7a1a'/><rect x='194' y='478' width='20' height='6' fill='#fff'/>`;
    // Up on the walls: BEER XING, pennants, the composite, the letters under the blacklight, the
    // paddles, the dartboard and the house rules, and the little window onto the lawn.
    out += `<g transform='translate(250 330) rotate(45)'><rect x='-40' y='-40' width='80' height='80' rx='6' fill='#f4c430' stroke='#1a1a1a' stroke-width='5'/></g>
      <text x='250' y='326' font-size='19' font-family='Arial Black, Impact, sans-serif' text-anchor='middle' fill='#1a1a1a'>BEER</text><text x='250' y='348' font-size='17' font-family='Arial Black, Impact, sans-serif' text-anchor='middle' fill='#1a1a1a'>XING</text>
      ${[[350, 150, '#8e1b1b', 'BOOL'], [500, 168, '#2a6a3a', 'ΒΩΩΛ'], [1046, 262, '#5a2a6a', 'STATE']].map(([x, y, c, t]) => `<path d='M${x} ${y} h120 l-120 46Z' fill='${c}'/><path d='M${x} ${y} h120 l-120 46Z' fill='none' stroke='#fff' stroke-width='2' opacity='0.5'/><text x='${x + 8}' y='${y + 19}' font-size='15' font-family='Arial Black, sans-serif' fill='#fff' transform='rotate(-11 ${x} ${y})'>${t}</text><path d='M${x} ${y - 4} v90' stroke='#1a1008' stroke-width='3'/>`).join('')}
      <rect x='372' y='318' width='170' height='128' fill='#2a1a0e'/><rect x='382' y='328' width='150' height='108' fill='#e8dcc0'/>
      ${Array.from({ length: 15 }, (_, i) => `<ellipse cx='${400 + (i % 5) * 29}' cy='${348 + Math.floor(i / 5) * 30}' rx='9' ry='11' fill='${pick(rand, ['#e2b48a', '#c99068', '#8a5a3a', '#f0c8a0'])}'/><path d='M${391 + (i % 5) * 29} ${345 + Math.floor(i / 5) * 30} q9 -12 18 0' fill='#2a1a10'/>`).join('')}
      <ellipse cx='800' cy='238' rx='430' ry='150' fill='url(#fuv)'/><rect x='640' y='138' width='320' height='8' rx='4' fill='#c8a0ff'/><rect x='636' y='134' width='328' height='4' fill='#2a2a2a'/>
      <text x='806' y='308' font-size='118' font-family='Georgia, serif' font-weight='700' text-anchor='middle' fill='#140a04' opacity='0.6' letter-spacing='16'>ΒΩΩΛ</text>
      <text x='800' y='300' font-size='118' font-family='Georgia, serif' font-weight='700' text-anchor='middle' fill='#1b3f8e' stroke='#e0bc4a' stroke-width='5' letter-spacing='16'>ΒΩΩΛ</text>
      ${[-28, 28].map((a) => `<g transform='translate(800 420) rotate(${a})'><rect x='-9' y='-120' width='18' height='70' rx='6' fill='#6a3a1a'/><path d='M-30 -54 h60 v150 q0 22 -30 26 q-30 -4 -30 -26Z' fill='#b07a40' stroke='#5a3214' stroke-width='4'/><text x='0' y='40' font-size='26' font-family='Georgia, serif' font-weight='700' text-anchor='middle' fill='#5a2a0a'>ΒΩ</text></g>`).join('')}
      <circle cx='1096' cy='372' r='46' fill='#141414'/>${[38, 30, 18, 9, 4].map((r, i) => `<circle cx='1096' cy='372' r='${r}' fill='${['#1d8f4e', '#e8dcc0', '#d3262e', '#e8dcc0', '#d3262e'][i]}'/>`).join('')}
      <path d='M1100 366 l26 -20 M1088 380 l30 -6' stroke='#e63946' stroke-width='3'/>
      <rect x='1058' y='436' width='78' height='100' fill='#f4efe2' transform='rotate(3 1097 486)'/>
      <text x='1097' y='456' font-size='11' font-family='Arial Black, sans-serif' text-anchor='middle' fill='#c0392b' transform='rotate(3 1097 486)'>HOUSE RULES</text>
      ${[0, 1, 2, 3, 4].map((k) => `<rect x='${1066 + (k % 2) * 4}' y='${466 + k * 13}' width='${50 + (k % 3) * 8}' height='3' fill='#3a3a3a' opacity='0.6' transform='rotate(3 1097 486)'/>`).join('')}
      <rect x='1004' y='102' width='160' height='100' fill='#d8d0c0'/><rect x='1012' y='110' width='144' height='84' fill='#101a30'/>
      <circle cx='1130' cy='128' r='9' fill='#e8ecf4' opacity='0.8'/><path d='M1012 170 Q1080 158 1156 168 V194 H1012Z' fill='#1e3a22'/>
      ${Array.from({ length: 18 }, (_, i) => `<path d='M${1016 + i * 8} 172 l3 -10 l2 10' fill='#2e5a2e'/>`).join('')}
      <path d='M1040 176 l9 -22 l9 22Z' fill='#d62828'/><rect x='1042' y='176' width='14' height='14' rx='4' fill='#3a6ad8'/><circle cx='1049' cy='172' r='5' fill='#f0c8a0'/><path d='M1044 178 q5 8 10 0' fill='#fff'/>
      <rect x='1082' y='110' width='5' height='84' fill='#d8d0c0'/><rect x='1000' y='200' width='168' height='8' fill='#b8b0a0'/>${cup(1140, 200, 0.6)}`;
    // The string lights, sagging between the joists.
    out += `<path d='M0 96 Q200 150 400 96 T800 96 T1200 96 T1600 96' stroke='#141414' stroke-width='2' fill='none'/>`;
    for (let i = 0; i < 32; i++) {
      const x = 25 + i * 50;
      const y = 96 + 27 * Math.sin(((x % 400) / 400) * Math.PI) + 4;
      const c = ['#ffd23f', '#ff4d6d', '#3de0ff', '#7bd88f'][i % 4];
      out += `<circle cx='${x}' cy='${y.toFixed(0) * 1 + 8}' r='28' fill='url(#fbulb)'/><rect x='${x - 3}' y='${y.toFixed(0) - 4}' width='6' height='6' fill='#222'/><ellipse cx='${x}' cy='${y.toFixed(0) * 1 + 8}' rx='6' ry='9' fill='${c}'/><ellipse cx='${x - 2}' cy='${y.toFixed(0) * 1 + 5}' rx='2' ry='3' fill='#fff' opacity='0.7'/>`;
    }
    // The bare bulb in the gap by the window.
    out += `<path d='M1085 86 V122' stroke='#141414' stroke-width='2'/><circle cx='1085' cy='132' r='130' fill='url(#fbulb)'/><circle cx='1085' cy='132' r='10' fill='#fff4c8'/>`;
    // The beer-pong table set up in the middle, cups racked at both ends.
    const rack = (x0, dir) => { let r = ''; for (let row = 0; row < 4; row++) for (let k = 0; k <= row; k++) r += `<path d='M${x0 + dir * (3 - row) * 14 - 6} ${606 + (k - row / 2) * 9 + 4} h12 l-2 12 h-8Z' fill='#d62828'/>`; return r; };
    out += `<path d='M540 600 H1060 L1086 642 H514Z' fill='#1f6a3a'/><path d='M540 600 H1060 L1086 642 H514Z' fill='none' stroke='#f4f4f4' stroke-width='3'/><path d='M800 600 V642' stroke='#f4f4f4' stroke-width='2'/>
      <rect x='514' y='642' width='572' height='10' fill='#14482a'/>${[530, 1060].map((x) => `<rect x='${x}' y='652' width='10' height='60' fill='#2a2a2a'/>`).join('')}${rack(560, 1)}${rack(1040, -1)}
      <circle cx='760' cy='560' r='5' fill='#fff'/><circle cx='840' cy='630' r='4' fill='#f4f4f4'/>`;
    // The couch, a brother passed out on it with a moustache drawn on, a cup still in his hand.
    out += `<path d='M-30 760 V620 Q-30 590 0 590 H300 Q340 590 340 620 V760Z' fill='#4a5a2e'/><rect x='-40' y='680' width='400' height='110' rx='28' fill='#5a6a36'/>
      <rect x='300' y='640' width='64' height='150' rx='26' fill='#4e5e30'/><rect x='-40' y='640' width='60' height='150' rx='26' fill='#4e5e30'/>
      <rect x='150' y='610' width='60' height='34' fill='#8a8a8a' opacity='0.75' transform='rotate(-8 180 627)'/>
      <ellipse cx='150' cy='836' rx='30' ry='6' fill='#7a1a10' opacity='0.5'/>`;
    // (He's the scenery's character kit, laid down on his back: Scenery.kit.figureAt(60, 926, 330,
    // { skin: '#e2b48a', hair: 'short', hairColor: 'brown', hat: 'cap', hatColor: '#c0392b', face:
    // 'sleep', beard: 'moustache', beardColor: '#141414', top: '#7a8a96', sleeves: 'short', bottom:
    // '#3a4a6a', shoes: '#f4f4f4', arms: [[24, 110], [-92, 4]], legs: [[4, -6], [-2, 4]], holding:
    // 'redcup' }) inside rotate(-90 60 662), class and style stripped; and his shirt's letters.)
    out += `<g transform='rotate(-90 60 662)'><g transform='translate(-22.5 601.5) scale(2.75)'><g><path d='M27.5 74 L29 94.9 L28.3 114.9' fill='none' stroke='#1c1410' stroke-width='12.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M27.5 74 L29 94.9 L28.3 114.9' fill='none' stroke='#343f58' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/><path d='M26.2 116.3 L33.8 116.5' fill='none' stroke='#1c1410' stroke-width='8.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M26.2 116.3 L33.8 116.5' fill='none' stroke='#c9c7c6' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/></g><g><path d='M32.5 74 L31.8 95 L32.5 115' fill='none' stroke='#1c1410' stroke-width='12.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M32.5 74 L31.8 95 L32.5 115' fill='none' stroke='#3a4a6a' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/><path d='M30.5 116.4 L38.1 116.2' fill='none' stroke='#1c1410' stroke-width='8.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M30.5 116.4 L38.1 116.2' fill='none' stroke='#f4f4f4' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/></g><g><path d='M27.5 39 L34 53.6 L44.8 43.2' fill='none' stroke='#1c1410' stroke-width='9.8' stroke-linecap='round' stroke-linejoin='round'/><path d='M27.5 39 L34 53.6 L44.8 43.2' fill='none' stroke='#ba9472' stroke-width='6.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M27.5 39 L32.1 49.2' stroke='#67727b' stroke-width='7.8' stroke-linecap='round'/><circle cx='44.8' cy='43.2' r='3.5' fill='#ba9472' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><rect x='28' y='29' width='6' height='8' fill='#e2b48a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><g><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='#7a8a96'/><path d='M18.8 66 H41.2 L40.5 76 H19.5Z' fill='#3a4a6a'/><path d='M19 39 L21.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><g><circle cx='31' cy='22' r='11' fill='#e2b48a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M32.3 21.5 q1.9 1.7 3.8 0' fill='none' stroke='#1c1410' stroke-width='1.4' stroke-linecap='round'/><path d='M37.3 21.5 q1.9 1.7 3.8 0' fill='none' stroke='#1c1410' stroke-width='1.4' stroke-linecap='round'/><path d='M35.8 28.2 h3.2' fill='none' stroke='#1c1410' stroke-width='1.4' stroke-linecap='round'/><path d='M32.5 26.5 Q37 23.5 41.5 26.5 Q39 25.6 37 26.4 Q35 25.6 32.5 26.5Z' fill='#141414' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M20 24 C18.5 13 25 9 32 9.5 C38 10 42 14 42 18 C37 15 32 15 28 16 C26 20 24 25 20 24Z' fill='#5a3820' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M20 20 C20 10 27 7.5 32 7.5 C39 7.5 42.5 13 42 19Z' fill='#c0392b' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M39 17.5 H49 Q50.5 20 47 20.5 H39Z' fill='#9f3226' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><g><path d='M33.5 39 L17.5 38.4 L2.5 39' fill='none' stroke='#1c1410' stroke-width='9.8' stroke-linecap='round' stroke-linejoin='round'/><path d='M33.5 39 L17.5 38.4 L2.5 39' fill='none' stroke='#e2b48a' stroke-width='6.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M33.5 39 L22.3 38.6' stroke='#7a8a96' stroke-width='7.8' stroke-linecap='round'/><g transform='translate(3.5 41) rotate(0)'><path d='M-4.4 -12 L-3.2 2 H3.2 L4.4 -12Z' fill='#d62828' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M-4.4 -12 H4.4 L4.2 -10 H-4.2Z' fill='#f4f4f4'/></g><circle cx='2.5' cy='39' r='3.5' fill='#e2b48a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g></g></g>
      <text x='128' y='676' font-size='18' font-family='Arial Black, sans-serif' fill='#d62828'>ΒΩΩΛ</text>`;
    // The floor: stains, cups knocked over, cans, a pizza box, a cone, a sock.
    out += `<rect y='720' width='1600' height='180' fill='url(#ffl)'/>${Array.from({ length: 16 }, () => `<ellipse cx='${(rand() * 1600).toFixed(0)}' cy='${(740 + rand() * 150).toFixed(0)}' rx='${(24 + rand() * 50).toFixed(0)}' ry='${(6 + rand() * 6).toFixed(0)}' fill='#120a06' opacity='0.45'/>`).join('')}
      ${[[470, 812, 1], [560, 870, 1.1, 1], [705, 846, 0.9], [1010, 884, 1, 1], [940, 820, 0.8], [250, 884, 1], [390, 858, 1, 1], [1190, 878, 0.9]].map(([x, y, s, t]) => cup(x, y, s, !!t)).join('')}
      ${[[650, 890, 1], [860, 870, 0.9], [330, 820, 0.8]].map(([x, y, s]) => `<g transform='translate(${x} ${y}) rotate(84) scale(${s})'><path d='M-10 -14 h20 l-2 10 l2 10 h-20 l2 -10Z' fill='#b8c0c8'/><rect x='-10' y='-6' width='20' height='8' fill='#1b3f8e'/></g>`).join('')}
      <path d='M740 836 L870 836 L890 884 L720 884Z' fill='#c8945a'/><path d='M744 836 L866 836 L856 760 L754 760Z' fill='#d8b078'/><circle cx='780' cy='790' r='9' fill='#a87a3a' opacity='0.5'/><circle cx='830' cy='808' r='6' fill='#a87a3a' opacity='0.5'/><path d='M744 836 L754 760 H856 L866 836' fill='none' stroke='#8a5a2a' stroke-width='3'/>
      <path d='M760 846 L830 852 L790 878Z' fill='#e8b04a'/><circle cx='790' cy='860' r='4' fill='#c0392b'/><circle cx='805' cy='856' r='4' fill='#c0392b'/><path d='M842 866 q14 -6 22 4' stroke='#d8a050' stroke-width='7' stroke-linecap='round' fill='none'/>
      <path d='M1100 880 l22 -64 l22 64Z' fill='#ff6a1a'/><rect x='1088' y='876' width='68' height='10' fill='#ff6a1a'/><path d='M1109 846 h26 l-4 -12 h-18Z' fill='#f4f4f4'/>
      <path d='M300 892 q10 -14 30 -8 l14 -6 q8 4 0 10 q-24 12 -44 4Z' fill='#e8e8e8'/>`;
    // The corner: COLD BEER in neon, the keg in a bin of ice, a cooler, a pyramid of cans.
    out += `<ellipse cx='1350' cy='660' rx='280' ry='130' fill='url(#fneon)'/><rect x='1226' y='620' width='248' height='66' rx='10' fill='#140a08'/>
      <text x='1350' y='667' font-size='38' font-family='Arial Rounded MT Bold, Arial, sans-serif' font-weight='700' text-anchor='middle' fill='none' stroke='#ff5a7a' stroke-width='3'>COLD BEER</text>
      <g transform='translate(0 28)'><path d='M1262 706 h108 l-10 160 h-88Z' fill='#2a6fdb'/><rect x='1256' y='700' width='120' height='14' rx='4' fill='#5a9aff'/><path d='M1272 730 v120 M1300 730 v124 M1330 730 v124 M1356 730 v120' stroke='#1a4a9e' stroke-width='4'/>
      ${Array.from({ length: 9 }, (_, i) => `<path d='M${1264 + i * 12} 704 l7 -12 l8 9 l-5 6Z' fill='${i % 2 ? '#e4f2ff' : '#bfe0f4'}'/>`).join('')}
      <ellipse cx='1316' cy='672' rx='44' ry='10' fill='#c8d0d8'/><path d='M1272 672 V700 H1360 V672' fill='#a8b0b8'/><rect x='1308' y='644' width='16' height='26' fill='#1a1a1a'/><path d='M1324 652 h24 v10' stroke='#1a1a1a' stroke-width='6' fill='none'/></g>
      <rect x='1386' y='790' width='100' height='76' rx='6' fill='#c0392b'/><rect x='1382' y='782' width='108' height='16' rx='5' fill='#f4f4f4'/>${can(1410, 782, '#c8d0d8', 0.9)}${can(1440, 782, '#c8d0d8', 0.9)}
      ${[5, 4, 3, 2, 1].map((n, row) => Array.from({ length: n }, (_, k) => can(1504 + row * 11 + k * 22, 868 - row * 34)).join('')).join('')}`;
    // Shade: dark along the top and bottom, and over the middle where the cards go.
    out += `<rect width='1600' height='900' fill='url(#fsh)'/><ellipse cx='700' cy='470' rx='560' ry='330' fill='url(#fmid)'/>`;
    return vvScene(out);
  }

  // Christmas Eve in the front room: deep green damask over panelling, a garland of fairy lights
  // swagged along the top with the mistletoe hung in it, the tree in the corner (baubles, tinsel,
  // lights, the star) with the presents piled under it, two windows on the snowy village (the
  // church, the rooftops, every window lit), the fireplace with the stockings hung and a wreath
  // over it, the armchair with its blanket, the cat asleep, milk and cookies left out for Santa,
  // and the toy train's track running along the front. Snow falls past the fairy lights; the fire
  // glows below.
  function christmasEve() {
    const rand = seeded(25);
    // The cat asleep on the rug is the scenery kit's (public/scenery.js), pasted, with tabby stripes:
    //   critter.at('cat', 1345, 867, 112, { pose: 'sleep', color: '#e8a050', still: true })
    const XM_CAT = "<g transform='translate(1289 799.8) scale(1.12)'><path d='M16 56 Q12 34 40 30 Q66 28 76 40 Q82 54 70 57 H22 Q16 57 16 56Z' fill='#e8a050' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M36 32 q5 10 1 22 M48 30 q5 11 1 24 M60 32 q4 9 1 20' stroke='#c07830' stroke-width='3' fill='none' stroke-linecap='round'/><path d='M20 55 Q30 62 60 58' fill='none' stroke='#1c1410' stroke-width='8.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M20 55 Q30 62 60 58' fill='none' stroke='#e8a050' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/><circle cx='74' cy='44' r='11' fill='#e8a050' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M66 38 L66 27 L73 34Z' fill='#e8a050' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M77 34 L83 26 L84 38Z' fill='#e8a050' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M71 45 q2.4 2 4.8 0 M78.5 45 q2.4 2 4.8 0' stroke='#1c1410' stroke-width='1.3' fill='none' stroke-linecap='round'/></g>";
    const bauble = (x, y, r, col) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${col}'/><circle cx='${x - r * 0.35}' cy='${y - r * 0.35}' r='${r * 0.3}' fill='#fff' opacity='0.6'/><rect x='${x - 2}' y='${y - r - 3}' width='4' height='4' fill='#d4af37'/>`;
    const present = (x, y, w, h, col, rib) => `<rect x='${x}' y='${y - h}' width='${w}' height='${h}' fill='${col}'/><rect x='${x + w / 2 - 4}' y='${y - h}' width='8' height='${h}' fill='${rib}'/><rect x='${x}' y='${y - h * 0.55}' width='${w}' height='7' fill='${rib}' opacity='0.9'/><path d='M${x + w / 2} ${y - h} q-16 -16 -18 0 Z M${x + w / 2} ${y - h} q16 -16 18 0Z' fill='${rib}'/><rect x='${x}' y='${y - h}' width='${w * 0.18}' height='${h}' fill='#fff' opacity='0.1'/>`;
    const snowyView = (x, y, w, h) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='url(#xw)'/>
      ${Array.from({ length: 14 }, () => `<circle cx='${(x + rand() * w).toFixed(0)}' cy='${(y + rand() * h * 0.7).toFixed(0)}' r='${(1 + rand() * 1.6).toFixed(1)}' fill='#fff' opacity='0.8'/>`).join('')}
      <path d='M${x} ${y + h * 0.62} L${x + w * 0.2} ${y + h * 0.5} L${x + w * 0.42} ${y + h * 0.6} L${x + w * 0.6} ${y + h * 0.46} L${x + w} ${y + h * 0.58} V${y + h} H${x}Z' fill='#1a2a4a'/>
      <path d='M${x + w * 0.6} ${y + h * 0.46} l10 -40 l10 40Z' fill='#2a3a5a'/><path d='M${x + w * 0.6 + 7} ${y + h * 0.46 - 26} h6 v8 h-6Z' fill='#ffd27a'/>
      ${[[0.06, 0.66, 0.26], [0.36, 0.7, 0.24], [0.66, 0.68, 0.28]].map(([fx, fy, fw]) => `<rect x='${x + w * fx}' y='${y + h * fy}' width='${w * fw}' height='${h * 0.2}' fill='#3a2a3a'/><path d='M${x + w * fx - 4} ${y + h * fy} L${x + w * (fx + fw / 2)} ${y + h * (fy - 0.1)} L${x + w * (fx + fw) + 4} ${y + h * fy}Z' fill='#f4f8ff'/><rect x='${x + w * (fx + 0.04)}' y='${y + h * (fy + 0.06)}' width='${w * 0.06}' height='${h * 0.06}' fill='#ffd27a'/><rect x='${x + w * (fx + fw - 0.1)}' y='${y + h * (fy + 0.06)}' width='${w * 0.06}' height='${h * 0.06}' fill='#ffd27a'/>`).join('')}
      <path d='M${x} ${y + h * 0.86} Q${x + w / 2} ${y + h * 0.8} ${x + w} ${y + h * 0.86} V${y + h} H${x}Z' fill='#eef4ff'/>
      ${[0.12, 0.88].map((fx) => `<path d='M${x + w * fx} ${y + h * 0.6} l-14 30 h8 l-12 24 h36 l-12 -24 h8Z' fill='#1e3a2a'/><path d='M${x + w * fx} ${y + h * 0.6} l-8 18 h16Z' fill='#f4f8ff'/>`).join('')}`;
    const win = (x) => `<rect x='${x - 12}' y='138' width='184' height='348' fill='#e8e0cc'/>${snowyView(x, 150, 160, 324)}<rect x='${x + 76}' y='150' width='8' height='324' fill='#e8e0cc'/><rect x='${x}' y='300' width='160' height='8' fill='#e8e0cc'/>
      <path d='M${x - 4} 474 h168' stroke='#f4f8ff' stroke-width='6'/><rect x='${x - 20}' y='478' width='200' height='14' fill='#d8d0bc'/><rect x='${x + 74}' y='446' width='12' height='32' fill='#f4ecd8'/><circle cx='${x + 80}' cy='436' r='26' fill='url(#xg)'/><path d='M${x + 80} 430 q-4 6 0 10 q4 -4 0 -10Z' fill='#ffd060'/>
      <path d='M${x - 40} 120 Q${x - 20} 300 ${x - 34} 500 H${x + 10} Q${x + 4} 300 ${x + 24} 138Z M${x + 200} 120 Q${x + 180} 300 ${x + 194} 500 H${x + 150} Q${x + 156} 300 ${x + 136} 138Z' fill='#8a1420'/>
      <path d='M${x - 46} 112 H${x + 206} V140 Q${x + 80} 176 ${x - 46} 140Z' fill='#a01a28'/><path d='M${x - 46} 140 Q${x + 80} 176 ${x + 206} 140' stroke='#d4af37' stroke-width='4' fill='none'/>`;
    let out = `<defs><pattern id='xd' width='80' height='100' patternUnits='userSpaceOnUse'><rect width='80' height='100' fill='#14341f'/><path d='M40 18 C50 28 54 40 46 50 C54 50 58 58 52 64 C46 60 42 62 40 74 C38 62 34 60 28 64 C22 58 26 50 34 50 C26 40 30 28 40 18Z' fill='#1a4026'/><circle cx='0' cy='100' r='6' fill='#1a4026'/><circle cx='80' cy='100' r='6' fill='#1a4026'/><circle cx='0' cy='0' r='6' fill='#1a4026'/><circle cx='80' cy='0' r='6' fill='#1a4026'/></pattern>
      <linearGradient id='xw' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0a1430'/><stop offset='1' stop-color='#2a3a6a'/></linearGradient>
      <radialGradient id='xg'><stop offset='0' stop-color='#ffe0a0' stop-opacity='0.55'/><stop offset='1' stop-color='#ffb050' stop-opacity='0'/></radialGradient>
      <radialGradient id='xf'><stop offset='0' stop-color='#ffa040' stop-opacity='0.5'/><stop offset='0.5' stop-color='#ff7a2a' stop-opacity='0.15'/><stop offset='1' stop-color='#ff6a1a' stop-opacity='0'/></radialGradient>
      <linearGradient id='xsh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#050c08' stop-opacity='0.75'/><stop offset='0.16' stop-color='#050c08' stop-opacity='0.1'/><stop offset='0.72' stop-color='#050c08' stop-opacity='0'/><stop offset='1' stop-color='#050c08' stop-opacity='0.5'/></linearGradient>
      <radialGradient id='xm'><stop offset='0' stop-color='#06120a' stop-opacity='0.45'/><stop offset='1' stop-color='#06120a' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='url(#xd)'/><rect y='600' width='1600' height='220' fill='#3a2414'/>${Array.from({ length: 10 }, (_, i) => `<rect x='${i * 160 + 14}' y='622' width='132' height='170' rx='4' fill='none' stroke='#2a1a0c' stroke-width='5'/>`).join('')}<rect y='594' width='1600' height='12' fill='#5a3a1e'/>
      <rect width='1600' height='44' fill='#0a1a10'/><rect y='40' width='1600' height='8' fill='#d8d0bc'/>
      ${win(380)}${win(1060)}`;
    // The fireplace, the stockings, the wreath, the nutcrackers.
    out += `<circle cx='800' cy='690' r='460' fill='url(#xf)'/><path d='M590 820 V380 H1010 V820Z' fill='#e8e0cc'/><rect x='560' y='366' width='480' height='26' fill='#f4ecd8'/><rect x='560' y='388' width='480' height='8' fill='#c8bca0'/>
      <path d='M650 820 V520 Q650 470 700 470 H900 Q950 470 950 520 V820Z' fill='#1a0e08'/><path d='M690 800 Q700 730 730 710 Q740 744 760 720 Q776 670 800 650 Q814 700 836 680 Q852 716 872 706 Q894 744 910 800Z' fill='#ff6a1a' opacity='0.85'/><path d='M730 800 Q744 748 770 740 Q784 760 800 730 Q820 760 840 750 Q858 772 870 800Z' fill='#ffb03a'/><path d='M770 800 Q786 772 800 768 Q816 776 830 800Z' fill='#fff0a0'/>
      <rect x='690' y='796' width='220' height='20' rx='8' fill='#3a1a0a'/><path d='M560 820 H1040 V840 H560Z' fill='#c8bca0'/>
      <path d='M570 366 Q630 392 690 366 T810 366 T930 366 T1030 366' stroke='#1e4a2a' stroke-width='16' fill='none'/>${Array.from({ length: 12 }, (_, i) => `<circle cx='${580 + i * 40}' cy='${372 + (i % 3) * 4}' r='4' fill='${['#ff4d4d', '#ffd23f', '#4dd4ff', '#7dff7a'][i % 4]}'/>`).join('')}
      ${[[650, '#c0392b'], [740, '#2a6a3a'], [860, '#c0392b'], [950, '#1b3f8e']].map(([x, col]) => `<path d='M${x - 18} 400 h36 v70 q0 10 10 14 l14 6 q10 8 0 18 l-40 -4 q-20 -2 -20 -22Z' fill='${col}'/><rect x='${x - 20}' y='396' width='40' height='18' rx='4' fill='#f4f4f4'/>`).join('')}
      ${[610, 990].map((x) => `<g transform='translate(${x} 366)'><rect x='-9' y='-56' width='18' height='30' fill='#c0392b'/><rect x='-9' y='-30' width='18' height='30' fill='#1b3f8e'/><circle cx='0' cy='-64' r='9' fill='#f0c8a0'/><rect x='-10' y='-86' width='20' height='16' fill='#141414'/><rect x='-6' y='-60' width='12' height='4' fill='#fff'/><path d='M-9 -44 h18' stroke='#d4af37' stroke-width='3'/></g>`).join('')}
      <circle cx='800' cy='270' r='66' fill='none' stroke='#1e4a2a' stroke-width='30'/><circle cx='800' cy='270' r='66' fill='none' stroke='#2a6a3a' stroke-width='10' stroke-dasharray='6 8'/>${Array.from({ length: 9 }, (_, i) => `<circle cx='${(800 + 66 * Math.cos(i * 0.7)).toFixed(0)}' cy='${(270 + 66 * Math.sin(i * 0.7)).toFixed(0)}' r='6' fill='#d62828'/>`).join('')}
      <path d='M800 330 l-26 -18 v30Z M800 330 l26 -18 v30Z' fill='#c0392b'/><circle cx='800' cy='330' r='8' fill='#a01a28'/>`;
    // The tree, the star, the presents.
    const tiers = [[160, 100, 70, 150], [160, 190, 110, 240], [160, 300, 150, 350], [160, 420, 190, 480], [160, 550, 230, 620]];
    out += `<circle cx='160' cy='420' r='330' fill='url(#xg)'/><rect x='146' y='620' width='28' height='80' fill='#4a2e17'/>`;
    out += tiers.map(([cx, top, half, bot]) => `<path d='M${cx} ${top} L${cx + half} ${bot} ${Array.from({ length: 6 }, (_, k) => `L${(cx + half - ((k + 0.5) * 2 * half) / 6).toFixed(0)} ${bot - 16} L${(cx + half - ((k + 1) * 2 * half) / 6).toFixed(0)} ${bot}`).join(' ')}Z' fill='#1e5a32'/><path d='M${cx} ${top} L${cx - half} ${bot} L${cx - half * 0.4} ${bot - 10}Z' fill='#2a7040' opacity='0.8'/>`).join('');
    out += [[0.25, 260], [0.4, 380], [0.55, 500], [0.7, 600]].map(([k, y]) => `<path d='M${160 - 60 - k * 140} ${y - 40} Q160 ${y + 10} ${160 + 60 + k * 140} ${y - 60}' stroke='#e8c050' stroke-width='3' fill='none' stroke-dasharray='2 3'/>`).join('');
    out += Array.from({ length: 22 }, () => { const y = 140 + rand() * 470; const half = 50 + ((y - 100) / 520) * 180; return bauble((160 + (rand() - 0.5) * half * 1.4).toFixed(0) * 1, y.toFixed(0) * 1, 8 + rand() * 5, pick(rand, ['#d62828', '#e8b84a', '#3a7ae8', '#e8e8f0', '#a03ad8'])); }).join('');
    out += Array.from({ length: 30 }, () => { const y = 130 + rand() * 490; const half = 40 + ((y - 100) / 520) * 180; return `<circle cx='${(160 + (rand() - 0.5) * half * 1.6).toFixed(0)}' cy='${y.toFixed(0)}' r='3' fill='${pick(rand, ['#fff4c0', '#ffd23f', '#ff9a8a', '#9ad8ff'])}'/>`; }).join('');
    out += `<circle cx='160' cy='92' r='60' fill='url(#xg)'/><path d='M160 56 l10 24 l26 2 l-20 16 l7 25 l-23 -14 l-23 14 l7 -25 l-20 -16 l26 -2Z' fill='#ffd23f' stroke='#fff4b0' stroke-width='2'/>
      <ellipse cx='160' cy='700' rx='170' ry='26' fill='#a01a28'/><ellipse cx='160' cy='700' rx='170' ry='26' fill='none' stroke='#f4f4f4' stroke-width='6' stroke-dasharray='14 10'/>
      ${present(10, 770, 90, 70, '#c0392b', '#e8c050')}${present(110, 790, 110, 60, '#1b5a9e', '#f4f4f4')}${present(230, 770, 70, 90, '#2a6a3a', '#d62828')}${present(70, 860, 120, 70, '#e8b84a', '#c0392b')}${present(200, 870, 90, 60, '#7a3a9a', '#e8c050')}`;
    // The garland and fairy lights along the top, the mistletoe.
    out += `<path d='M0 54 Q200 120 400 54 T800 54 T1200 54 T1600 54' stroke='#16401f' stroke-width='28' fill='none'/><path d='M0 54 Q200 120 400 54 T800 54 T1200 54 T1600 54' stroke='#2a6a3a' stroke-width='10' fill='none' stroke-dasharray='4 7'/>`;
    for (let i = 0; i < 32; i++) {
      const x = 25 + i * 50;
      const y = 54 + 33 * Math.sin(((x % 400) / 400) * Math.PI) + 12;
      const col = ['#ff4d4d', '#ffd23f', '#4dd4ff', '#7dff7a'][i % 4];
      out += `<circle cx='${x}' cy='${y.toFixed(0)}' r='20' fill='${col}' opacity='0.22'/><ellipse cx='${x}' cy='${y.toFixed(0)}' rx='5' ry='7' fill='${col}'/><rect x='${x - 3}' y='${(y - 10).toFixed(0)}' width='6' height='4' fill='#2c2c2c'/>`;
    }
    out += [0, 400, 800, 1200, 1600].map((x) => `<path d='M${x} 54 l-22 -14 v28Z M${x} 54 l22 -14 v28Z' fill='#c0392b'/><path d='M${x} 58 l-12 34 M${x} 58 l12 34' stroke='#c0392b' stroke-width='6'/>`).join('');
    out += `<path d='M1090 60 V112' stroke='#c0392b' stroke-width='3'/><path d='M1090 112 q-30 4 -36 24 q20 -2 36 -16 q16 14 36 16 q-6 -20 -36 -24Z' fill='#3a7a3a'/>${[[1084, 124], [1094, 128], [1090, 118]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='4' fill='#f4f4f0'/>`).join('')}<path d='M1090 108 l-10 -8 v14Z M1090 108 l10 -8 v14Z' fill='#d62828'/>`;
    // The armchair and blanket, milk and cookies, the cat asleep.
    out += `<path d='M1220 860 V640 Q1220 590 1270 590 H1430 Q1480 590 1480 640 V860Z' fill='#8a1420'/><path d='M1200 700 Q1200 670 1230 670 Q1260 670 1260 700 V860 H1200Z M1440 700 Q1440 670 1470 670 Q1500 670 1500 700 V860 H1440Z' fill='#a01a28'/>
      <rect x='1250' y='740' width='200' height='60' rx='14' fill='#b02232'/><path d='M1300 600 L1360 600 L1380 760 L1290 780Z' fill='#e8dcc0'/>${[0, 1, 2, 3, 4].map((k) => `<path d='M${1302 + k * 2} ${620 + k * 32} h${58 + k * 4}' stroke='#c0392b' stroke-width='5' stroke-dasharray='6 6'/>`).join('')}
      <rect x='1500' y='700' width='100' height='14' fill='#5a3a1e'/><rect x='1540' y='714' width='10' height='150' fill='#4a2e17'/>
      <rect x='1508' y='662' width='22' height='38' rx='3' fill='#f4f8ff' opacity='0.9'/><ellipse cx='1568' cy='698' rx='30' ry='6' fill='#f4f4f4'/>${[[1556, 692], [1572, 690], [1584, 694]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='8' fill='#c8945a'/><circle cx='${x - 2}' cy='${y - 1}' r='1.5' fill='#3a1a0a'/>`).join('')}
      <rect x='1530' y='720' width='46' height='26' fill='#f4ecd8' transform='rotate(-6 1553 733)'/><text x='1553' y='738' font-size='9' font-family='Georgia, serif' text-anchor='middle' fill='#c0392b' transform='rotate(-6 1553 733)'>for Santa</text>`;
    // The floor, the rug, the train track, the cat.
    out += `<rect y='812' width='1600' height='88' fill='#4a2e17'/>${Array.from({ length: 10 }, (_, i) => `<path d='M${i * 170 + 40} 812 l-20 88' stroke='#2e1c0c' stroke-width='3'/>`).join('')}
      <ellipse cx='800' cy='862' rx='520' ry='34' fill='#6a1420'/><ellipse cx='800' cy='862' rx='480' ry='26' fill='none' stroke='#2a6a3a' stroke-width='6'/>
      ${Array.from({ length: 54 }, (_, i) => `<rect x='${i * 30}' y='878' width='16' height='14' fill='#5a3a1e'/>`).join('')}<path d='M0 882 H1600 M0 890 H1600' stroke='#b8c0c8' stroke-width='3'/>
      ${XM_CAT}`;
    out += `<rect width='1600' height='900' fill='url(#xsh)'/><ellipse cx='700' cy='470' rx='560' ry='330' fill='url(#xm)'/>`;
    return vvScene(out);
  }

  // Halloween night on the hill: a purple sky, the huge moon with bats across it and cloud tearing
  // past, the haunted house up on its hill (most windows lit orange, one green), dead trees, the
  // graveyard behind its crooked iron fence (gravestones leaning, a crypt with its door ajar and
  // something green glowing inside), a twisted tree at the left with a lantern hung in it and an owl,
  // jack-o'-lanterns grinning along the bottom, a witch's cauldron bubbling green, and fog lying low.
  function hauntedHill() {
    const rand = seeded(13);
    const grave = (x, y, s, kind) => `<g transform='translate(${x} ${y}) scale(${s}) rotate(${((rand() - 0.5) * 14).toFixed(0)})'>${kind === 1 ? `<path d='M-6 0 V-70 H6 V0Z M-24 -50 H24 V-38 H-24Z' fill='#4a4058'/><path d='M2 0 V-70 H6 V0Z' fill='#2a2234'/>` : kind === 2 ? `<path d='M-14 0 L-10 -90 L0 -104 L10 -90 L14 0Z' fill='#4a4058'/><path d='M0 -104 L10 -90 L14 0 H4Z' fill='#2a2234'/>` : `<path d='M-24 0 V-50 Q-24 -74 0 -74 Q24 -74 24 -50 V0Z' fill='#4a4058'/><path d='M14 0 V-50 Q14 -70 0 -74 Q24 -74 24 -50 V0Z' fill='#2a2234'/><text x='-2' y='-40' font-size='14' font-family='Georgia, serif' font-weight='700' text-anchor='middle' fill='#2a2234'>RIP</text>`}<ellipse cx='0' cy='2' rx='30' ry='6' fill='#0a0610'/></g>`;
    const pumpkin = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><ellipse cx='0' cy='-10' rx='90' ry='40' fill='#ff8a1a' opacity='0.16'/><path d='M-4 -64 Q-6 -78 4 -82 L8 -76 Q2 -74 4 -64Z' fill='#3c5a1e'/>
      <ellipse cx='0' cy='-32' rx='26' ry='32' fill='#e8661a'/><ellipse cx='-22' cy='-32' rx='22' ry='30' fill='#d85a14'/><ellipse cx='22' cy='-32' rx='22' ry='30' fill='#d85a14'/><ellipse cx='0' cy='-32' rx='14' ry='31' fill='#f07a2a'/>
      <path d='M-24 -44 L-12 -56 L-6 -40Z M24 -44 L12 -56 L6 -40Z M0 -36 L-6 -26 H6Z M-26 -20 Q0 4 26 -20 L18 -18 L12 -24 L4 -16 L-4 -24 L-12 -16 L-18 -22Z' fill='#ffd23f'/></g>`;
    const branch = (d, w) => `<path d='${d}' stroke='#07040b' stroke-width='${w}' fill='none' stroke-linecap='round'/>`;
    // The bats and the owl are the scenery kit's (public/scenery.js), pasted:
    //   critter.at('bat', 0, 8.8, 44, { color: '#05020a', eye: '#05020a', still: true }) (scaled per bat), and
    //   critter.at('owl', 421.5, 156, 39, { color: '#07040b', eye: '#ffd23f', still: true }) (its eyes where the TV's blink).
    const HILL_BAT = "<g transform='translate(-22 -8.8) scale(0.7333)'><path d='M30 12 Q20 0 2 4 Q10 8 8 14 Q16 10 22 16 Q26 12 30 14Z' fill='#05020a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M30 12 Q40 0 58 4 Q50 8 52 14 Q44 10 38 16 Q34 12 30 14Z' fill='#05020a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M26.5 9 L26 3 L29 7 H31 L34 3 L33.5 9Z' fill='#05020a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><ellipse cx='30' cy='13' rx='4.4' ry='5.4' fill='#05020a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g>";
    const HILL_OWL = "<g transform='translate(402 106.6) scale(0.65)'><path d='M10 72 Q2 46 10 26 L8 10 L18 18 Q30 12 42 18 L52 10 L50 26 Q58 46 50 72Z' fill='#07040b' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M18 46 Q30 40 42 46 Q44 62 30 70 Q16 62 18 46Z' fill='#5e5c60'/><path d='M24 50 l3 2 l3 -2 l3 2 l3 -2 M24 56 l3 2 l3 -2 l3 2 l3 -2 M24 62 l3 2 l3 -2 l3 2 l3 -2' stroke='#0b070c' stroke-width='1' fill='none'/><circle cx='20' cy='30' r='8' fill='#ffd23f' stroke='#1c1410' stroke-width='1.6'/><circle cx='20' cy='30' r='3' fill='#1c1410'/><circle cx='40' cy='30' r='8' fill='#ffd23f' stroke='#1c1410' stroke-width='1.6'/><circle cx='40' cy='30' r='3' fill='#1c1410'/><path d='M27 37 L30 44 L33 37Z' fill='#c8902a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M22 72 v4 M38 72 v4' fill='none' stroke='#1c1410' stroke-width='1.6'/></g>";
    let out = `<defs><linearGradient id='ws' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#06030c'/><stop offset='0.45' stop-color='#1a0e2c'/><stop offset='0.68' stop-color='#3a1e4a'/><stop offset='1' stop-color='#1a0e22'/></linearGradient>
      <radialGradient id='wm'><stop offset='0' stop-color='#fff6d6' stop-opacity='0.5'/><stop offset='0.4' stop-color='#e8c8ff' stop-opacity='0.14'/><stop offset='1' stop-color='#c8a0ff' stop-opacity='0'/></radialGradient>
      <radialGradient id='wo'><stop offset='0' stop-color='#ffb040' stop-opacity='0.6'/><stop offset='1' stop-color='#ff8a1a' stop-opacity='0'/></radialGradient>
      <radialGradient id='wgr'><stop offset='0' stop-color='#7cff9a' stop-opacity='0.55'/><stop offset='1' stop-color='#3aff6a' stop-opacity='0'/></radialGradient>
      <linearGradient id='wf' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#a890c8' stop-opacity='0'/><stop offset='0.5' stop-color='#a890c8' stop-opacity='0.22'/><stop offset='1' stop-color='#6a5088' stop-opacity='0.3'/></linearGradient>
      <linearGradient id='wsh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#05020a' stop-opacity='0.6'/><stop offset='0.15' stop-color='#05020a' stop-opacity='0'/><stop offset='0.8' stop-color='#05020a' stop-opacity='0'/><stop offset='1' stop-color='#05020a' stop-opacity='0.5'/></linearGradient></defs>
      <rect width='1600' height='900' fill='url(#ws)'/>${Array.from({ length: 50 }, () => `<circle cx='${(rand() * 1600).toFixed(0)}' cy='${(rand() * 420).toFixed(0)}' r='${(0.6 + rand()).toFixed(1)}' fill='#e8e0ff' opacity='${(0.3 + rand() * 0.5).toFixed(2)}'/>`).join('')}`;
    // The moon, bats across it, cloud tearing past.
    out += `<circle cx='1300' cy='150' r='280' fill='url(#wm)'/><circle cx='1300' cy='150' r='100' fill='#fff2cc'/>${[[1262, 120, 18], [1330, 180, 24], [1318, 104, 10], [1254, 190, 12], [1350, 136, 8]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#e8d8b0' opacity='0.7'/>`).join('')}
      ${[[1180, 170, 1.1], [1230, 210, 0.8], [1380, 90, 0.9], [1420, 230, 0.6], [1110, 120, 0.7], [1290, 60, 0.5]].map(([x, y, s]) => `<g transform='translate(${x} ${y}) scale(${s})'>${HILL_BAT}</g>`).join('')}
      <path d='M1080 200 Q1200 180 1320 196 Q1420 186 1540 206 Q1420 214 1300 210 Q1180 222 1080 200Z' fill='#120a1e' opacity='0.85'/><path d='M1150 250 Q1260 236 1400 248 Q1300 258 1150 250Z' fill='#120a1e' opacity='0.7'/>`;
    // Far hills with dead trees, the hill and the haunted house.
    out += `<path d='M0 560 Q200 500 420 540 T860 520 T1300 540 T1600 520 V700 H0Z' fill='#140c20'/>
      ${[[300, 528, 0.6], [520, 534, 0.5], [760, 522, 0.7], [1500, 516, 0.6]].map(([x, y, s]) => branch(`M${x} ${y} V${y - 60 * s} M${x} ${y - 30 * s} L${x - 20 * s} ${y - 54 * s} M${x} ${y - 40 * s} L${x + 22 * s} ${y - 70 * s} M${x} ${y - 60 * s} L${x - 8 * s} ${y - 84 * s}`, 4)).join('')}
      <path d='M820 600 Q980 470 1100 476 Q1240 480 1380 600Z' fill='#100818'/>
      <g fill='#0c0814'><rect x='980' y='300' width='220' height='200'/><path d='M970 304 L1090 230 L1210 304Z'/><rect x='960' y='240' width='60' height='260'/><path d='M952 244 L990 150 L1028 244Z'/><rect x='1150' y='220' width='18' height='60'/><rect x='1050' y='210' width='80' height='26'/></g>
      <path d='M990 150 L1028 244 H1010Z M1090 230 L1210 304 H1190Z' fill='#2a1e3a'/><path d='M1050 210 h80' stroke='#2a1e3a' stroke-width='3'/>${Array.from({ length: 8 }, (_, i) => `<rect x='${1054 + i * 10}' y='196' width='2' height='14' fill='#0c0814'/>`).join('')}<path d='M990 150 V126 M982 134 h16' stroke='#0c0814' stroke-width='3'/>
      ${[[972, 270, 1], [972, 340, 1], [1000, 330, 1], [1060, 330, 2], [1120, 330, 1], [1160, 330, 0], [1000, 410, 1], [1080, 410, 1], [1150, 410, 1], [972, 420, 0]].map(([x, y, k]) => `<rect x='${x}' y='${y}' width='26' height='38' fill='${['#1a1024', '#ffb040', '#7cff9a'][k]}'/>${k ? `<rect x='${x - 14}' y='${y - 12}' width='54' height='62' fill='url(#${k === 2 ? 'wgr' : 'wo'})'/>` : ''}<path d='M${x + 13} ${y} V${y + 38} M${x} ${y + 18} H${x + 26}' stroke='#0c0814' stroke-width='3'/>`).join('')}
      <path d='M1060 330 l-14 6 l4 32 l10 -4Z' fill='#0c0814'/><path d='M1078 500 h24 V460 Q1090 448 1078 460Z' fill='#ffb040' opacity='0.8'/>
      <path d='M1090 500 Q1060 540 1100 570 Q1140 600 1080 640' stroke='#2a1e3a' stroke-width='10' fill='none' opacity='0.6'/>
      ${branch('M1250 520 Q1246 440 1262 400 M1258 430 L1230 396 M1262 410 L1296 380 M1296 380 L1310 352 M1230 396 L1216 380', 6)}`;
    // The graveyard: the crypt, gravestones, the crooked fence.
    out += `<path d='M60 720 V520 H300 V720Z' fill='#2a2234'/><path d='M40 524 L180 450 L320 524Z' fill='#3a3048'/><path d='M180 450 L320 524 H260Z' fill='#1e1828'/>${[80, 130, 230, 280].map((x) => `<rect x='${x - 9}' y='530' width='18' height='190' fill='#4a4058'/>`).join('')}
      <rect x='150' y='580' width='60' height='140' fill='#0a0610'/><path d='M150 580 h26 l-12 140 h-14Z' fill='#3a3048' transform='rotate(-10 150 580)'/><rect x='120' y='560' width='120' height='170' fill='url(#wgr)'/><circle cx='172' cy='630' r='4' fill='#c8ffb0'/><circle cx='186' cy='630' r='4' fill='#c8ffb0'/>
      <text x='180' y='512' font-size='20' font-family='Georgia, serif' font-weight='700' text-anchor='middle' fill='#1e1828'>MORTIS</text>
      ${[[380, 740, 1, 0], [470, 720, 0.8, 1], [560, 750, 1.1, 0], [680, 730, 0.9, 2], [920, 740, 1, 0], [1010, 724, 0.8, 1], [1120, 748, 1.1, 0], [1460, 730, 0.9, 2], [1540, 760, 1, 0]].map(([x, y, s, k]) => grave(x, y, s, k)).join('')}
      <path d='M0 690 H1600' stroke='#07040b' stroke-width='5'/><path d='M0 740 H1600' stroke='#07040b' stroke-width='5'/>
      ${Array.from({ length: 41 }, (_, i) => { const x = i * 40; const t = ((rand() - 0.5) * 8).toFixed(0); return `<g transform='rotate(${t} ${x} 780)'><rect x='${x - 2.5}' y='660' width='5' height='120' fill='#07040b'/><path d='M${x - 7} 664 L${x} 646 L${x + 7} 664Z' fill='#07040b'/></g>`; }).join('')}`;
    // The twisted tree at the left, the lantern hung in it, the owl.
    out += `${branch('M40 900 Q90 700 60 560 Q30 420 100 300 Q150 220 120 120', 46)}${branch('M110 260 Q220 200 300 210 Q380 214 460 170', 16)}${branch('M120 150 Q190 90 280 90 Q340 88 400 50', 12)}${branch('M90 360 Q30 330 0 340', 14)}${branch('M300 210 Q320 250 300 280 M380 200 Q400 160 440 150 M280 90 Q300 60 290 30 M200 210 Q220 250 210 290', 6)}
      <path d='M300 210 V236' stroke='#2a1e3a' stroke-width='2'/><circle cx='300' cy='256' r='60' fill='url(#wo)'/><path d='M288 236 h24 l-3 6 h-18Z M290 242 h20 v26 h-20Z' fill='#141018'/><rect x='294' y='246' width='12' height='18' fill='#ffc860'/>
      ${HILL_OWL}`;
    // The ground: fog, the jack-o'-lanterns, the cauldron.
    out += `<rect y='780' width='1600' height='120' fill='#0a0610'/>${Array.from({ length: 40 }, () => { const x = rand() * 1600; return `<path d='M${x.toFixed(0)} 790 l4 -16 l3 16 l4 -12 l3 12' fill='#07040b'/>`; }).join('')}
      <rect y='680' width='1600' height='220' fill='url(#wf)'/>
      ${pumpkin(90, 880, 1.1)}${pumpkin(210, 892, 0.7)}${pumpkin(1490, 884, 1.2)}${pumpkin(1380, 896, 0.75)}
      <circle cx='1240' cy='820' r='120' fill='url(#wgr)'/><path d='M1180 880 l20 -30 l20 30 l20 -34 l20 34Z' fill='#ff7a1a' opacity='0.8'/><path d='M1180 830 Q1176 870 1210 876 H1270 Q1304 870 1300 830Z' fill='#141018'/><ellipse cx='1240' cy='830' rx='62' ry='12' fill='#7cff9a'/><ellipse cx='1240' cy='830' rx='62' ry='12' fill='none' stroke='#2a2234' stroke-width='6'/>
      ${[[1220, 826, 6], [1250, 824, 8], [1268, 830, 5]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#c8ffb0' opacity='0.8'/>`).join('')}
      <path d='M1174 840 l-14 46 M1306 840 l14 46' stroke='#141018' stroke-width='6'/>`;
    out += `<rect width='1600' height='900' fill='url(#wsh)'/>`;
    return vvScene(out);
  }

  // The terrace balustrade in front of you, drawn into a 1600×900 scene in that scene's perspective
  // (its vanishing point vx, vy). We stand on the terrace looking straight out over it, a little
  // above it: the front run is square to us, so it runs level across, its coping and plinth seen
  // from above; a pier with a ball on it at each corner, and the returns coming back toward us
  // along the lines to the vanishing point, their balusters growing and spreading as they come.
  // top: the front edge of the coping; inset: how far in from the sides the corners are; lit: where
  // the light comes from (-1 the left, 1 the right); stone: its colour. (Heights are in railings:
  // the coping's top is 1, the eye 3; the front run is 4 away, so it's k px a unit there.)
  function balustrade(vx, vy, top, inset, lit, stone) {
    const E = 3;
    const z0 = 6;
    const k = (top - vy) / (E - 1);
    const f = k * z0;
    const Xs = (vx - inset) / k;
    const p = (X, Y, z) => `${Math.round(vx + (f * X) / z)} ${Math.round(vy + (f * (E - Y)) / z)}`;
    // The stone in shade: `t` of the way to black.
    const dim = (t) => `#${[1, 3, 5].map((i) => Math.round(parseInt(stone.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
    // A face: four corners ([X, Y, z] each), and how much it's in shade.
    const face = (pts, t = 0) => `<path d='M${pts.map((q) => p(...q)).join('L')}Z' fill='${dim(t)}'/>`;
    // One baluster (88 tall, 24 across, its far half from the light shaded), standing at X, z.
    const bal = (X, z) => `<use href='#tbl' transform='translate(${p(X, 0.86, z)}) scale(${((0.16 * f) / z / 24).toFixed(2)} ${((0.72 * f) / z / 88).toFixed(2)})'/>`;
    const zb = z0 + 0.06;
    let out = `<defs><g id='tbl'><path d='M-6 0H6Q4 6 9 14Q12 26 5 38Q3 41 5 44Q12 58 9 74Q4 80 7 84V88H-7V84Q-4 80-9 74Q-12 58-5 44Q-3 41-5 38Q-12 26-9 14Q-4 6-6 0Z' fill='${dim(0.04)}'/><path d='M1 0H6Q4 6 9 14Q12 26 5 38Q3 41 5 44Q12 58 9 74Q4 80 7 84V88H2V84Q4 60 3 44Q2 41 3 38Q4 20 1 0Z' opacity='0.3' transform='scale(${-lit} 1)'/></g>
      <pattern id='tbp' width='${(0.3 * k).toFixed(2)}' height='900' x='${(vx - 0.15 * k).toFixed(1)}' y='${p(0, 0.86, zb).split(' ')[1]}' patternUnits='userSpaceOnUse'><use href='#tbl' transform='translate(${(0.15 * k).toFixed(1)} 0) scale(${((0.16 * f) / zb / 24).toFixed(2)} ${((0.72 * f) / zb / 88).toFixed(2)})'/></pattern></defs>`;
    // The front run: the plinth's top and front, the balusters, the coping's shadow, its front and top.
    out += `${face([[-Xs, 0.14, z0 + 0.2], [Xs, 0.14, z0 + 0.2], [Xs, 0.14, z0 - 0.04], [-Xs, 0.14, z0 - 0.04]])}${face([[-Xs, 0.14, z0 - 0.04], [Xs, 0.14, z0 - 0.04], [Xs, -0.5, z0 - 0.04], [-Xs, -0.5, z0 - 0.04]], 0.2)}
      <path d='M${p(-Xs, 0.86, zb)}L${p(Xs, 0.86, zb)}L${p(Xs, 0.14, zb)}L${p(-Xs, 0.14, zb)}Z' fill='url(#tbp)'/><path d='M${p(-Xs, 0.86, z0)}L${p(Xs, 0.86, z0)}L${p(Xs, 0.79, z0)}L${p(-Xs, 0.79, z0)}Z' opacity='0.22'/>
      ${face([[-Xs, 1, z0 - 0.05], [Xs, 1, z0 - 0.05], [Xs, 0.87, z0 - 0.05], [-Xs, 0.87, z0 - 0.05]], 0.14)}${face([[-Xs, 1, z0 + 0.17], [Xs, 1, z0 + 0.17], [Xs, 1, z0 - 0.05], [-Xs, 1, z0 - 0.05]])}`;
    for (const s of [-1, 1]) {
      const X = s * Xs;
      const lee = -s === lit ? 0.06 : 0.3; // the side facing the middle: in the light, or out of it
      const zn = (f * (Xs + 0.3)) / (vx + 40); // where the return goes off the side
      // The pier at the corner and its cap (front, inside, top), and the ball on it.
      const pier = (h, y0, y1) => `${face([[X - h, y1, z0 - h], [X + h, y1, z0 - h], [X + h, y0, z0 - h], [X - h, y0, z0 - h]], 0.14)}${face([[X - s * h, y1, z0 - h], [X - s * h, y1, z0 + h], [X - s * h, y0, z0 + h], [X - s * h, y0, z0 - h]], lee)}${y1 > 1.1 ? face([[X - h, y1, z0 + h], [X + h, y1, z0 + h], [X + h, y1, z0 - h], [X - h, y1, z0 - h]]) : ''}`;
      const [bx, by] = p(X, 1.32, z0).split(' ').map(Number);
      out += `${pier(0.17, -0.5, 1.1)}${pier(0.21, 1.1, 1.18)}<path d='M${p(X - 0.07, 1.18, z0)}L${p(X - 0.04, 1.24, z0)}L${p(X + 0.04, 1.24, z0)}L${p(X + 0.07, 1.18, z0)}Z' fill='${dim(0.1)}'/><circle cx='${bx}' cy='${by}' r='${Math.round(0.11 * k)}' fill='${dim(0.08)}'/><circle cx='${Math.round(bx + lit * 0.035 * k)}' cy='${Math.round(by - 0.035 * k)}' r='${Math.round(0.06 * k)}' fill='${stone}'/>`;
      // The return, coming toward us: its plinth, the balusters far to near, the coping's shadow, its inside and its top.
      const i = X - s * 0.1;
      out += `${face([[X - 0.1, 0.14, z0 - 0.17], [X + 0.1, 0.14, z0 - 0.17], [X + 0.1, 0.14, zn], [X - 0.1, 0.14, zn]])}${face([[i, 0.14, z0 - 0.17], [i, -0.5, z0 - 0.17], [i, -0.5, zn], [i, 0.14, zn]], lee)}`;
      for (let z = z0 - 0.38; z > zn - 0.3; z -= 0.3) out += bal(X, z);
      out += `<path d='M${p(X, 0.86, z0 - 0.17)}L${p(X, 0.79, z0 - 0.17)}L${p(X, 0.79, zn)}L${p(X, 0.86, zn)}Z' opacity='0.22'/>${face([[i, 1, z0 - 0.17], [i, 0.87, z0 - 0.17], [i, 0.87, zn], [i, 1, zn]], lee)}${face([[X - 0.1, 1, z0 - 0.17], [X + 0.1, 1, z0 - 0.17], [X + 0.1, 1, zn], [X - 0.1, 1, zn]])}`;
    }
    return out;
  }

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

  // ---------- The pirate tavern: on deck at sunset ----------
  // Looking out over the rail: the sky burning orange and violet under long lit clouds, the sun
  // half down on the horizon (between the TV's table and its sidebar) with its road of gold on the
  // water, an island with palms and a little fort on the left, the swell rolling in rows, and the
  // deck: the rail and its posts, a rum barrel with a rope coiled on it, a chest of gold spilling
  // over, the ship's wheel, and the sunset catching every top edge. (The sail and the shrouds are
  // drawn over it by rigging(); the gulls, ships, the captain, the cannon and the kraken are on the
  // TV: see SCENES.pirate in public/scenery.js.) The deck is dark, so a phone's buttons sit on calm.
  function pirateSea() {
    const rand = seeded(41);
    const H = 414;
    let out = `<defs>
      <linearGradient id='psk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#140f26'/><stop offset='0.28' stop-color='#3e2350'/><stop offset='0.55' stop-color='#9c4258'/><stop offset='0.8' stop-color='#e27848'/><stop offset='1' stop-color='#f8b468'/></linearGradient>
      <radialGradient id='psn'><stop offset='0' stop-color='#fff2c8'/><stop offset='0.1' stop-color='#ffd890' stop-opacity='0.9'/><stop offset='0.35' stop-color='#ff9a50' stop-opacity='0.4'/><stop offset='1' stop-color='#ff7a40' stop-opacity='0'/></radialGradient>
      <linearGradient id='pse' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7a4a62'/><stop offset='0.12' stop-color='#34385a'/><stop offset='0.45' stop-color='#17283e'/><stop offset='1' stop-color='#081018'/></linearGradient>
      <linearGradient id='pwd' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6a4424'/><stop offset='1' stop-color='#2a1a0c'/></linearGradient>
      <radialGradient id='pgl'><stop offset='0' stop-color='#ffd860' stop-opacity='0.55'/><stop offset='1' stop-color='#ffb030' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='${H}' fill='url(#psk)'/>`;
    // Long clouds, dark underneath, their lower edges lit by the sun.
    out += [[60, 110, 520, 18], [520, 70, 640, 14], [1000, 150, 520, 20], [200, 230, 420, 12], [860, 260, 380, 10], [1240, 60, 420, 12], [420, 330, 300, 8], [1180, 318, 360, 8]].map(([x, y, w, h]) =>
      `<path d='M${x} ${y} q${w * 0.3} -${h * 1.6} ${w * 0.62} -${h * 0.4} q${w * 0.24} -${h} ${w * 0.38} ${h * 0.4} q-${w / 2} ${h * 0.9} -${w} 0Z' fill='#2e1a3a' opacity='0.75'/><path d='M${x + w * 0.06} ${y + 1} q${w * 0.44} ${h * 0.8} ${w * 0.9} 0' stroke='${y > 250 ? '#ffc890' : '#f08a6a'}' stroke-width='2.5' fill='none' opacity='0.7' stroke-linecap='round'/>`).join('');
    // The sun going down, half under, and its glow.
    out += `<circle cx='1095' cy='${H}' r='330' fill='url(#psn)'/><circle cx='1095' cy='${H + 6}' r='58' fill='#ffe6a8'/>
      <path d='M1037 ${H - 20} h116 M1043 ${H - 34} h104' stroke='#f8b468' stroke-width='3' opacity='0.6'/>`;
    // The island, left: a hump of rock and jungle, palms leaning, a little fort with its flag.
    const palm = (x, y, h, lean) => `<path d='M${x} ${y} q${lean * 0.4} -${h * 0.5} ${lean} -${h}' stroke='#22142a' stroke-width='5' fill='none'/>${[[-40, -6], [-22, -18], [8, -20], [34, -8], [42, 8], [-34, 10]].map(([dx, dy]) => `<path d='M${x + lean} ${y - h} q${dx * 0.5} ${dy - 10} ${dx} ${dy + 6}' stroke='#22142a' stroke-width='6' fill='none' stroke-linecap='round'/>`).join('')}`;
    out += `<path d='M-40 ${H} Q10 ${H - 70} 70 ${H - 64} Q120 ${H - 92} 170 ${H - 40} Q210 ${H - 16} 250 ${H}Z' fill='#2a1830'/>
      <path d='M120 ${H - 74} h30 v-26 h-30Z M116 ${H - 100} h38 v-6 h-38Z' fill='#22142a'/>${[118, 128, 138, 148].map((x) => `<rect x='${x}' y='${H - 112}' width='6' height='7' fill='#22142a'/>`).join('')}
      <path d='M136 ${H - 112} v-28' stroke='#22142a' stroke-width='2'/><path d='M136 ${H - 140} l18 4 l-18 6Z' fill='#0e0a10'/><rect x='131' y='${H - 90}' width='6' height='8' fill='#ffc060' opacity='0.8'/>
      ${palm(40, H - 60, 80, 20)}${palm(80, H - 66, 64, -14)}${palm(196, H - 30, 70, 18)}`;
    // The sea: the horizon line lit, then the swell in rows, wider and stronger nearer.
    out += `<rect y='${H}' width='1600' height='${900 - H}' fill='url(#pse)'/><rect y='${H - 1}' width='1600' height='3' fill='#ffd8a0' opacity='0.55'/>
      <ellipse cx='1095' cy='${H + 150}' rx='150' ry='170' fill='url(#psn)' opacity='0.4'/>`;
    // (One row of swell, drawn once and used for every row, stretched.)
    out += `<defs><path id='pwv' d='M0 0${' q10 -6 20 0 t20 0'.repeat(80)}' fill='none' vector-effect='non-scaling-stroke'/></defs>`;
    for (let r = 0; r < 16; r++) {
      const y = H + 8 + r * r * 1.5 + r * 6;
      out += `<use href='#pwv' transform='translate(${-(rand() * 40).toFixed(0)} ${y.toFixed(0)}) scale(${(0.6 + r * 0.22).toFixed(2)} ${(0.35 + r * 0.16).toFixed(2)})' stroke='${r < 5 ? '#c890a0' : '#7a9cc4'}' stroke-width='${(1 + r * 0.16).toFixed(1)}' opacity='${(0.18 + r * 0.012).toFixed(2)}'/>`;
    }
    // The sun's road: glints of gold on the water, spreading wider towards you.
    let road = '';
    for (let i = 0; i < 40; i++) {
      const t = rand();
      const y = H + 6 + t * t * 340;
      const spread = 40 + t * 150;
      const w = 6 + t * 40 * rand();
      road += `M${(1095 + (rand() - 0.5) * 2 * spread - w / 2).toFixed(0)} ${y.toFixed(0)}h${w.toFixed(0)}`;
    }
    out += `<path d='${road}' stroke='#ffd890' stroke-width='2.4' opacity='0.7' stroke-linecap='round'/>`;
    // The deck. The rail: the cap lit along its top, posts below with the sea between, the
    // waterway plank, then the deck planks.
    // (We look down a little onto the rail, so its cap's top shows, the far edge lit by the sun.)
    out += `<rect y='738' width='1600' height='10' fill='#6b4524'/><rect y='738' width='1600' height='2' fill='#f0a060' opacity='0.85'/><rect y='747' width='1600' height='25' fill='#4a2e16'/><rect y='752' width='1600' height='4' fill='#5a3a1e'/><rect y='770' width='1600' height='4' fill='#1e1208'/>`;
    out += `<pattern id='ppo' width='46' height='72' x='6' y='772' patternUnits='userSpaceOnUse'><rect width='14' height='72' fill='#3a2412'/><rect x='2' width='3' height='72' fill='#8a5a30' opacity='0.6'/></pattern><rect y='772' width='1600' height='72' fill='url(#ppo)'/>`;
    out += `<rect y='840' width='1600' height='14' fill='#3b2512'/><rect y='840' width='1600' height='2' fill='#c07840' opacity='0.5'/><rect y='854' width='1600' height='46' fill='url(#pwd)'/>
      <path d='${[[854, 862], [862, 873], [873, 887], [887, 900]].map(([y1, y2], r) => `M0 ${y2}H1600${Array.from({ length: 6 }, (_, i) => { const x = i * 300 + (r % 2) * 150 - 100; const at = (y) => (800 + ((x - 800) * (y - H)) / (900 - H)).toFixed(0); return `M${at(y1)} ${y1}L${at(y2)} ${y2}`; }).join('')}`).join('')}' stroke='#1a1008' stroke-width='2'/>
      <rect y='854' width='1600' height='46' fill='#000' opacity='0.35'/>`;
    // A rope coiled over a belaying pin, hanging on the rail.
    out += `<path d='M560 772 v40' stroke='#2a1a0c' stroke-width='6'/>${[0, 1, 2, 3].map((k) => `<ellipse cx='560' cy='${812 + k * 3}' rx='${22 - k * 2}' ry='9' fill='none' stroke='#a88a5a' stroke-width='4'/>`).join('')}`;
    // Bottom left: a rum barrel with a coil of rope and a bottle on it, and another behind.
    out += `<g transform='translate(14 690)'><path d='M70 6 Q92 90 70 176 H-10 Q-28 90 -10 6Z' fill='#3e2612'/><path d='M60 10 Q78 90 60 172' stroke='#8a5a30' stroke-width='6' fill='none' opacity='0.6'/>${[30, 90, 150].map((y) => `<path d='M-16 ${y} Q30 ${y + 8} 80 ${y}' stroke='#1a1008' stroke-width='7' fill='none'/>`).join('')}
      <ellipse cx='30' cy='8' rx='42' ry='10' fill='#5a3a1c'/><text x='30' y='118' font-size='26' font-family='Georgia,serif' font-weight='700' text-anchor='middle' fill='#e8c890' opacity='0.75'>XXX</text>
      ${[0, 1, 2].map((k) => `<ellipse cx='30' cy='${2 - k * 6}' rx='${30 - k * 4}' ry='8' fill='none' stroke='#a88a5a' stroke-width='5'/>`).join('')}
      <path d='M44 -16 h10 v-26 l-2 -6 v-12 h-6 v12 l-2 6Z' fill='#2a5a3a' opacity='0.9'/><rect x='46' y='-40' width='3' height='20' fill='#fff' opacity='0.3'/></g>`;
    // Bottom right: the ship's wheel, its spokes and handles, the sun on its rim; and a chest of
    // gold in front of the rail, the lid up, coins and a string of pearls spilling out.
    const wheel = (cx, cy, r) => `<circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='#3a2412' stroke-width='18'/><circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='#8a5a30' stroke-width='3' opacity='0.7' stroke-dasharray='${r * 1.2} ${r * 5}' stroke-dashoffset='${r * 4.2}'/>
      ${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4 + 0.2; const c = Math.cos(a); const s = Math.sin(a); return `<path d='M${cx} ${cy} L${(cx + c * (r + 44)).toFixed(0)} ${(cy + s * (r + 44)).toFixed(0)}' stroke='#3a2412' stroke-width='10' stroke-linecap='round'/><circle cx='${(cx + c * (r + 40)).toFixed(0)}' cy='${(cy + s * (r + 40)).toFixed(0)}' r='9' fill='#4a2e16'/>`; }).join('')}
      <circle cx='${cx}' cy='${cy}' r='26' fill='#4a2e16' stroke='#c9973c' stroke-width='4'/><circle cx='${cx}' cy='${cy}' r='8' fill='#c9973c'/>`;
    out += `<path d='M1500 900 V760' stroke='#2a1a0c' stroke-width='40'/>${wheel(1500, 690, 112)}`;
    out += `<g transform='translate(1150 770)'><ellipse cx='80' cy='0' rx='150' ry='80' fill='url(#pgl)'/>
      <path d='M2 30 L14 -34 Q80 -50 146 -34 L158 30Z' fill='#3a1e0c'/><path d='M14 -34 Q80 -50 146 -34 L144 -24 Q80 -40 16 -24Z' fill='#c9973c'/><path d='M10 -6 Q80 -20 150 -6 L152 4 Q80 -10 8 4Z' fill='#8a6420'/><path d='M20 26 L28 -18 Q80 -30 132 -18 L140 26Z' fill='#6a1a1a' opacity='0.8'/>
      <rect x='0' y='30' width='160' height='84' rx='4' fill='#5a3418'/><rect x='0' y='30' width='160' height='10' fill='#c9973c'/><rect x='0' y='76' width='160' height='8' fill='#8a6420'/>
      <rect x='70' y='40' width='20' height='26' rx='3' fill='#c9973c'/><rect x='77' y='50' width='6' height='9' fill='#2a1a0c'/>
      <path d='M4 30 Q40 6 80 14 Q120 4 156 30Z' fill='#ffcf50'/>${Array.from({ length: 16 }, () => `<circle cx='${(10 + rand() * 140).toFixed(0)}' cy='${(14 + rand() * 14).toFixed(0)}' r='7' fill='${pick(rand, ['#ffd860', '#f0b830', '#ffe890'])}' stroke='#b07a10' stroke-width='1.5'/>`).join('')}
      <path d='M30 26 Q12 70 -16 100' stroke='#f4ecd8' stroke-width='5' stroke-dasharray='1 6' stroke-linecap='round' fill='none'/>
      <circle cx='118' cy='16' r='8' fill='#d0303a'/><circle cx='52' cy='12' r='6' fill='#2a9a6a'/>
      ${Array.from({ length: 8 }, () => `<ellipse cx='${(-40 + rand() * 250).toFixed(0)}' cy='${(104 + rand() * 20).toFixed(0)}' rx='7' ry='3' fill='#ffd860' stroke='#b07a10'/>`).join('')}
      <path d='M-2 30 V114' stroke='#ffb060' stroke-width='3' opacity='0.5'/></g>`;
    // The deck goes into shadow at the very bottom (the phone's buttons sit here).
    out += `<rect y='860' width='1600' height='40' fill='#000' opacity='0.3'/>`;
    return scene(tight(out));
  }
  // The space between tags taken out (it's three characters a space in a data: URL).
  function tight(svg) { return svg.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' '); }

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


  // ---------- The lighthouse: the view from the gallery, in four weathers ----------
  // Out over the sea from the top of the tower: the sky (stars and the moon at night, the sun and
  // fair clouds by day, a grey murk in the fog, black cloud in the storm), the headland on the left
  // with the harbour town under its cliff (windows lit after dark), the church, and the old light
  // on the point; the horizon, the moon's or the sun's path on the water, the swell in rows, and
  // far below the rocks at the foot of the tower with the surf breaking round them (and a rowing
  // boat tied up on a fine day). The railing is drawn over it (see galleryRail()). On the TV the beam
  // sweeps out over all of it, the far light blinks, the bell buoy rocks, ships pass: see
  // SCENES.lighthouse in public/scenery.js.
  function lighthouseView(weather) {
    const rand = seeded(57);
    const H = 396;
    const night = weather !== 'day';
    const c = {
      night: { sky: ['#03070f', '#0b1830', '#1e345a'], sea: ['#1a3050', '#0b1a2e', '#040a14'], land: '#0a1220', cliff: '#121c2c', rock: ['#0c121a', '#26364c'], foam: '#c8dcf0', wave: '#8fb4dc', lit: '#ffd27a', glow: '#fff4d8' },
      day: { sky: ['#2f7cc0', '#7ab8e6', '#d4ecf8'], sea: ['#3a8ab8', '#1f6a96', '#0e3e5e'], land: '#4a6a3a', cliff: '#8a7a64', rock: ['#3a3a3a', '#5a5650'], foam: '#ffffff', wave: '#ffffff', lit: '#e8e0d0', glow: '#fffdf0' },
      fog: { sky: ['#141c26', '#33414f', '#5a6878'], sea: ['#4a5868', '#2a3644', '#141c26'], land: '#3a4654', cliff: '#46525e', rock: ['#1a222c', '#2a3440'], foam: '#c8d0d8', wave: '#b8c6d4', lit: '#ffd88a', glow: '#e8eef4' },
      storm: { sky: ['#030507', '#10171f', '#26323e'], sea: ['#1c2833', '#0e161e', '#05090d'], land: '#080c10', cliff: '#10161c', rock: ['#06090c', '#1c2632'], foam: '#d8e4ee', wave: '#a8bccc', lit: '#ffc860', glow: '#c8d4e0' },
    }[weather];
    let out = `<defs><linearGradient id='lsk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.sky[0]}'/><stop offset='0.6' stop-color='${c.sky[1]}'/><stop offset='1' stop-color='${c.sky[2]}'/></linearGradient>
      <linearGradient id='lse' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c.sea[0]}'/><stop offset='0.35' stop-color='${c.sea[1]}'/><stop offset='1' stop-color='${c.sea[2]}'/></linearGradient>
      <radialGradient id='lgl'><stop offset='0' stop-color='${c.glow}' stop-opacity='0.9'/><stop offset='0.18' stop-color='${c.glow}' stop-opacity='0.35'/><stop offset='1' stop-color='${c.glow}' stop-opacity='0'/></radialGradient>
      <path id='lwv' d='M0 0${' q10 -6 20 0 t20 0'.repeat(80)}' fill='none' vector-effect='non-scaling-stroke'/></defs>
      <rect width='1600' height='${H}' fill='url(#lsk)'/>`;
    // Stars (only on a clear night), as a tile over the sky.
    if (weather === 'night') {
      let st = '';
      for (let i = 0; i < 28; i++) st += `<circle cx='${(rand() * 400).toFixed(0)}' cy='${(rand() * 200).toFixed(0)}' r='${(rand() < 0.15 ? 1.6 : 0.5 + rand() * 0.7).toFixed(1)}' fill='${pick(rand, ['#fff', '#cfe0ff', '#ffe9c4'])}' opacity='${(0.4 + rand() * 0.6).toFixed(2)}'/>`;
      out += `<pattern id='lst' width='400' height='200' patternUnits='userSpaceOnUse'>${st}</pattern><rect width='1600' height='${H - 30}' fill='url(#lst)'/>`;
    }
    // The moon (or the sun), its glow, and clouds by the weather.
    const [mx, my] = weather === 'day' ? [384, 130] : [1110, 150];
    if (weather === 'fog') out += `<circle cx='${mx}' cy='${my}' r='120' fill='url(#lgl)' opacity='0.5'/><circle cx='${mx}' cy='${my}' r='30' fill='#e8eef4' opacity='0.3'/>`;
    else if (weather !== 'storm') out += `<circle cx='${mx}' cy='${my}' r='${night ? 200 : 260}' fill='url(#lgl)'/><circle cx='${mx}' cy='${my}' r='${night ? 32 : 44}' fill='${c.glow}'/>${night ? `<circle cx='${mx - 9}' cy='${my - 6}' r='7' fill='#e6dcc0' opacity='0.6'/><circle cx='${mx + 10}' cy='${my + 9}' r='5' fill='#e6dcc0' opacity='0.5'/>` : ''}`;
    // A heap of cloud: round puffs on a flat foot, the underside shaded, the top edge lit.
    const puff = (x, y, w, fill, shade, lit, o = 1) => {
      const bumps = [[0.18, 0.1], [0.36, 0.17], [0.56, 0.21], [0.74, 0.14], [0.88, 0.08]];
      return `<g opacity='${o}'>${lit ? bumps.map(([k, r]) => `<circle cx='${(x + w * k).toFixed(0)}' cy='${(y - w * r * 0.6 - 3).toFixed(0)}' r='${(w * r).toFixed(0)}' fill='${lit}'/>`).join('') : ''}${bumps.map(([k, r]) => `<circle cx='${(x + w * k).toFixed(0)}' cy='${(y - w * r * 0.6).toFixed(0)}' r='${(w * r).toFixed(0)}' fill='${fill}'/>`).join('')}<rect x='${x + w * 0.06}' y='${y - w * 0.08}' width='${w * 0.88}' height='${w * 0.08}' rx='${w * 0.04}' fill='${fill}'/>${shade ? `<path d='M${x + w * 0.1} ${y} H${x + w * 0.9}' stroke='${shade}' stroke-width='${Math.min(8, w * 0.03).toFixed(0)}' stroke-linecap='round' opacity='0.6'/>` : ''}</g>`;
    };
    // A long thin streak of cloud, its lower edge catching the light.
    const streak = (x, y, w, fill, edge) => `<path d='M${x} ${y} q${w * 0.3} -14 ${w * 0.62} -4 q${w * 0.24} -10 ${w * 0.38} 4 q-${w / 2} 9 -${w} 0Z' fill='${fill}' opacity='0.8'/><path d='M${x + w * 0.06} ${y + 1} q${w * 0.44} 7 ${w * 0.9} 0' stroke='${edge}' stroke-width='2' fill='none' opacity='0.55' stroke-linecap='round'/>`;
    if (weather === 'night') out += [[100, 120, 360], [560, 70, 300], [1240, 300, 300], [1300, 90, 280], [380, 290, 260], [760, 330, 240]].map(([x, y, w]) => streak(x, y, w, '#0a1630', '#9ab4dc')).join('');
    if (weather === 'day') out += [[20, 330, 240, 0.8], [880, 370, 220, 0.75], [1200, 340, 300, 0.8], [640, 150, 200, 0.95], [1040, 90, 240, 0.95], [-40, 190, 200, 0.9]].map(([x, y, w, o]) => puff(x, y, w, '#ffffff', '#c4d8e6', '', o)).join('');
    if (weather === 'storm') out += [[-120, 170, 700], [380, 110, 820], [980, 190, 760], [160, 330, 620], [860, 360, 700], [-60, 60, 560], [700, 40, 700]].map(([x, y, w], i) => puff(x, y, w, ['#121922', '#18212b', '#0e141b', '#1c2631'][i % 4], '', '#36475a', 0.96)).join('');
    if (weather === 'fog') out += [[300, 330, 700, 50], [1100, 360, 600, 40], [200, 210, 600, 40], [1000, 190, 700, 50]].map(([x, y, rx, ry]) => `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='#8a98a6' opacity='0.3'/>`).join('');
    // The headland, left: the cliff, the harbour town below it, the church, the old light.
    out += `<path d='M-20 ${H} V${H - 70} Q40 ${H - 104} 120 ${H - 96} Q190 ${H - 92} 230 ${H - 60} Q262 ${H - 40} 300 ${H - 30} L330 ${H}Z' fill='${c.cliff}'/>
      <path d='M-20 ${H} V${H - 40} Q80 ${H - 52} 160 ${H - 34} Q220 ${H - 22} 260 ${H}Z' fill='${c.land}'/>
      <path d='M118 ${H} L126 ${H - 16} H162 L170 ${H}Z' fill='${c.cliff}'/><path d='M138 ${H - 16} L140 ${H - 54} H148 L150 ${H - 16}Z' fill='${weather === 'day' ? '#f2efe6' : c.land}'/><path d='M140 ${H - 44} h8 v6 h-8Z M140 ${H - 30} h8 v6 h-8Z' fill='${weather === 'day' ? '#c0392b' : c.land}'/><path d='M138 ${H - 54} h12 l-6 -8Z' fill='${weather === 'day' ? '#3a3a3a' : c.land}'/>
      <path d='M60 ${H - 52} v-40 l8 -18 l8 18 v40Z' fill='${c.land}'/>`;
    for (let i = 0; i < 8; i++) {
      const x = -10 + i * 16 + rand() * 4;
      const h = 14 + rand() * 12;
      const y = H - 30 - Math.abs(Math.sin(i * 0.6)) * 14;
      out += `<path d='M${x.toFixed(0)} ${y.toFixed(0)} v-${h.toFixed(0)} l9 -8 l9 8 v${h.toFixed(0)}Z' fill='${weather === 'day' ? pick(rand, ['#e8e0d0', '#d8c8b0', '#c8b8a0', '#f0e8dc']) : c.land}'/>`;
      if (rand() < (night ? 0.8 : 0.5)) out += `<rect x='${(x + 6).toFixed(0)}' y='${(y - h + 6).toFixed(0)}' width='5' height='5' fill='${weather === 'day' ? '#4a5a6a' : c.lit}' opacity='${weather === 'day' ? 0.7 : 0.85}'/>`;
    }
    // The sea: lit along the horizon, the swell in rows.
    out += `<rect y='${H}' width='1600' height='${900 - H}' fill='url(#lse)'/><rect y='${H - 1}' width='1600' height='2' fill='${c.glow}' opacity='${weather === 'fog' ? 0.1 : 0.4}'/>`;
    for (let r = 0; r < 15; r++) {
      const y = H + 8 + r * r * 1.6 + r * 7;
      out += `<use href='#lwv' transform='translate(${-(rand() * 40).toFixed(0)} ${y.toFixed(0)}) scale(${(0.6 + r * 0.24).toFixed(2)} ${(0.35 + r * (weather === 'storm' ? 0.34 : 0.16)).toFixed(2)})' stroke='${c.wave}' stroke-width='${(1 + r * 0.14).toFixed(1)}' opacity='${((weather === 'storm' ? 0.22 : 0.12) + r * 0.012).toFixed(2)}'/>`;
    }
    // The moon's (or the sun's) road on the water.
    if (weather === 'night' || weather === 'day') {
      let road = '';
      for (let i = 0; i < 40; i++) {
        const t = rand();
        const w = 6 + t * 40 * rand();
        road += `M${(mx + (rand() - 0.5) * 2 * (30 + t * 140) - w / 2).toFixed(0)} ${(H + 6 + t * t * 330).toFixed(0)}h${w.toFixed(0)}`;
      }
      out += `<ellipse cx='${mx}' cy='${H + 160}' rx='130' ry='170' fill='url(#lgl)' opacity='0.3'/><path d='M${road}' stroke='${c.glow}' stroke-width='2.2' opacity='0.6' stroke-linecap='round'/>`;
    }
    // Whitecaps in the storm.
    if (weather === 'storm') for (let i = 0; i < 30; i++) { const y = H + 20 + rand() * 360; out += `<path d='M${(rand() * 1600).toFixed(0)} ${y.toFixed(0)} q${(10 + y * 0.04).toFixed(0)} -6 ${(24 + y * 0.08).toFixed(0)} 0' stroke='#e8f0f6' stroke-width='${(1.5 + (y - H) * 0.008).toFixed(1)}' fill='none' opacity='0.5'/>`; }
    // The rocks at the foot of the tower, far below, with the surf round them.
    // A jagged rock: a dark mass with its lit faces picked out, and cracks.
    const rock = (x, y, w, h) => {
      const pts = [[0, 0], [0.08, 0.5], [0.2, 0.62], [0.3, 0.92], [0.42, 0.86], [0.52, 1], [0.64, 0.78], [0.74, 0.82], [0.86, 0.46], [0.94, 0.3], [1, 0]].map(([a, b]) => [x + w * a, y - h * b * (0.85 + rand() * 0.3)]);
      const P = (p) => p.map(([a, b]) => `${a.toFixed(0)} ${b.toFixed(0)}`).join(' L');
      return `<path d='M${P(pts)}Z' fill='${c.rock[0]}'/><path d='M${P([pts[2], pts[3], pts[4], [x + w * 0.38, y - h * 0.4], [x + w * 0.24, y - h * 0.3]])}Z' fill='${c.rock[1]}'/><path d='M${P([pts[5], pts[6], pts[7], [x + w * 0.66, y - h * 0.36]])}Z' fill='${c.rock[1]}' opacity='0.7'/>
        <path d='M${(x + w * 0.46).toFixed(0)} ${(y - h * 0.8).toFixed(0)} l-6 ${(h * 0.3).toFixed(0)} l8 ${(h * 0.24).toFixed(0)}' stroke='#000' stroke-width='2' fill='none' opacity='0.4'/>`;
    };
    const surf = (x, y, w) => `<path d='M${x - w * 0.1} ${y} q${w * 0.15} -10 ${w * 0.3} 0 t${w * 0.3} 0 t${w * 0.3} 0 t${w * 0.2} 0' stroke='${c.foam}' stroke-width='5' fill='none' opacity='${weather === 'storm' ? 0.8 : 0.55}' stroke-linecap='round'/><ellipse cx='${x + w / 2}' cy='${y + 6}' rx='${w * 0.66}' ry='12' fill='${c.foam}' opacity='0.18'/>`;
    out += rock(1040, 720, 220, 90) + rock(1220, 760, 300, 150) + rock(1460, 740, 200, 110) + rock(-40, 780, 260, 140) + rock(180, 770, 160, 60);
    out += surf(1030, 724, 240) + surf(1210, 766, 330) + surf(1450, 746, 200) + surf(-50, 786, 290) + surf(170, 774, 180);
    if (weather === 'storm') out += `<path d='M1210 650 q40 -80 110 -60 q60 -60 120 10 q30 40 -10 90' fill='#d8e4ee' opacity='0.3'/>`;
    // A rowing boat tied up by the rocks on a fine day; gulls on the rocks.
    if (weather === 'day') out += `<g transform='translate(910 706)'><path d='M0 0 Q50 12 100 0 L90 16 Q50 22 10 16Z' fill='#c0392b'/><path d='M4 2 Q50 12 96 2' stroke='#f2efe6' stroke-width='3' fill='none'/><path d='M100 0 L140 4' stroke='#3a2a1a' stroke-width='1.5'/><ellipse cx='50' cy='18' rx='64' ry='6' fill='#fff' opacity='0.25'/></g>
      ${[[1300, 630], [1340, 618], [1520, 640]].map(([x, y]) => `<path d='M${x} ${y} q6 -8 12 0 q-6 -3 -12 0Z M${x + 4} ${y} v6 M${x + 8} ${y} v6' fill='#f2f2f2' stroke='#555' stroke-width='1'/>`).join('')}`;
    // The tower's shadow on the water far below (by day), or the lamp's glow on it (by night).
    out += weather === 'day' ? `<path d='M720 900 L760 620 L800 620 L860 900Z' fill='#08283e' opacity='0.25'/>` : `<ellipse cx='800' cy='900' rx='700' ry='160' fill='#ffe8b0' opacity='${weather === 'fog' ? 0.12 : 0.07}'/>`;
    // Darker at the very bottom, under the railing.
    out += `<rect y='840' width='1600' height='60' fill='#000' opacity='0.25'/>`;
    return scene(tight(out));
  }
  // The gallery's iron railing in front of us, drawn over lighthouseView() (the same 1600×900 frame,
  // so it lines up, and in front of the fog) in its perspective: eye level is the horizon, and we're
  // a little above the rail, so the tops of the rails catch the light. The gallery goes round the
  // tower, so the railing curves back toward us either side, coming lower, its bars bigger and
  // further apart as it nears. (Heights in railings: its top is 1, the eye 3. It's 6 in front of
  // us, on a circle of 15 round the tower.)
  function galleryRail(weather) {
    const H = 396;
    const [iron, lip] = { night: ['#06090f', '#3a5278'], day: ['#17261f', '#8aa89a'], fog: ['#0e141b', '#4e5a68'], storm: ['#06090f', '#2e3e50'] }[weather];
    const rail = (s, Y) => { const z = 6 - 15 * (1 - Math.cos(s / 15)); return [800 + (1092 * 15 * Math.sin(s / 15)) / z, H + (1092 * (3 - Y)) / z, 1092 / z]; };
    const along = (Y, from, to, step) => { const pts = []; for (let s = from; step > 0 ? s <= to + 0.01 : s >= to - 0.01; s += step) pts.push(rail(s, Y).slice(0, 2).map((v) => v.toFixed(0)).join(' ')); return pts.join('L'); };
    let bars = '';
    for (let s = -5; s <= 5.01; s += 0.25) {
      const [x, y, sc] = rail(s, 0.97);
      const w = (Math.abs(s % 1) < 0.01 ? 0.09 : 0.045) * sc;
      bars += `M${(x - w / 2).toFixed(0)} ${y.toFixed(0)}h${w.toFixed(1)}V900h-${w.toFixed(1)}Z`;
    }
    return scene(`<path d='${bars}' fill='${iron}'/>${[[1, 0.92], [0.6, 0.56]].map(([a, b]) => `<path d='M${along(a, -5, 5, 0.5)}L${along(b, 5, -5, -0.5)}Z' fill='${iron}'/><path d='M${along(a, -5, 5, 0.5)}' stroke='${lip}' stroke-width='${a === 1 ? 3 : 2}' fill='none' opacity='0.8'/>`).join('')}`);
  }

  // ---------- The beer hall ----------
  // A Munich beer hall by day, all whitewash and wood: the vaulted ceiling with blue and white
  // diamonds painted in the vaults, a frieze of them under it, hop garlands with blue and white
  // bows, tall arched windows with leaded panes and the sun slanting in, a row of steins along the
  // plate rail over the panelling, a stag's antlers, the long tables, and the great barrel on its
  // rack. Kept pale (it's a light room: dark text sits on it). The waitress, the band and the
  // cuckoo clock are on the TV: SCENES.beerhall in public/scenery.js.
  function beerHall() {
    const rand = seeded(91);
    let out = `<defs><linearGradient id='bvt' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#e6dfd2'/><stop offset='1' stop-color='#f6f2ea'/></linearGradient>
      <linearGradient id='bwd' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#d2a26c'/><stop offset='1' stop-color='#a8743e'/></linearGradient>
      <linearGradient id='bsh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff8dc' stop-opacity='0.7'/><stop offset='1' stop-color='#fff8dc' stop-opacity='0'/></linearGradient>
      <linearGradient id='bgl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#cfe6fa'/><stop offset='1' stop-color='#fffbe8'/></linearGradient>
      <pattern id='bdm' width='40' height='24' patternUnits='userSpaceOnUse'><rect width='40' height='24' fill='#ffffff'/><path d='M0 0 L20 12 L0 24Z M40 0 L20 12 L40 24Z' fill='#7ab4ea'/></pattern>
      <pattern id='bld' width='18' height='26' patternUnits='userSpaceOnUse'><path d='M9 0 L18 13 L9 26 L0 13Z' fill='none' stroke='#8a8070' stroke-width='1.5'/></pattern></defs>
      <rect width='1600' height='900' fill='#f3eee4'/>`;
    // The vaults: four bays of ceiling, painted diamonds faint in each, the ribs between.
    out += `<rect width='1600' height='250' fill='url(#bvt)'/>`;
    for (let i = 0; i < 4; i++) {
      const x = i * 400;
      out += `<path d='M${x} 0 H${x + 400} V40 Q${x + 200} 250 ${x} 40Z' fill='url(#bdm)' opacity='0.28'/>
        <path d='M${x} 250 Q${x} 30 ${x + 200} 14 Q${x + 400} 30 ${x + 400} 250' fill='none' stroke='#d6ccba' stroke-width='10'/><path d='M${x + 6} 250 Q${x + 6} 40 ${x + 200} 24' fill='none' stroke='#fffdf6' stroke-width='3'/>`;
    }
    // The frieze of blue and white diamonds, gold lines either side, and the hop garlands under it.
    out += `<rect y='236' width='1600' height='30' fill='url(#bdm)'/><rect y='232' width='1600' height='4' fill='#c9a24a'/><rect y='266' width='1600' height='4' fill='#c9a24a'/>`;
    for (let i = 0; i < 8; i++) {
      const x0 = i * 200;
      let leaves = '';
      for (let k = 1; k < 8; k++) { const t = k / 8; const x = x0 + t * 200; const y = 272 + Math.sin(t * Math.PI) * 46; leaves += `<ellipse cx='${x.toFixed(0)}' cy='${(y + (k % 2 ? -3 : 3)).toFixed(0)}' rx='11' ry='6' fill='${k % 3 ? '#6a9a3a' : '#7aaa44'}'/>`; }
      out += `<path d='M${x0} 272 Q${x0 + 100} 360 ${x0 + 200} 272' stroke='#4a6a28' stroke-width='3' fill='none'/>${leaves}
        <g transform='translate(${x0} 272)'><path d='M-12 -4 L0 6 L12 -4 L12 10 L0 6 L-12 10Z' fill='#2a6fdb'/><path d='M-4 6 L-10 30 M4 6 L10 30' stroke='#2a6fdb' stroke-width='4'/><path d='M-2 6 L-6 28 M2 6 L6 28' stroke='#fff' stroke-width='1.5'/><circle cy='6' r='4' fill='#fff'/></g>`;
    }
    // The windows (left, middle, right), leaded, the sky through them, and the sun slanting in.
    for (const cx of [95, 800, 1105]) {
      out += `<path d='M${cx - 120} 900 L${cx - 60} 340 H${cx + 60} L${cx + 260} 900Z' fill='url(#bsh)' opacity='0.5'/>
        <path d='M${cx - 62} 560 V380 Q${cx - 62} 318 ${cx} 318 Q${cx + 62} 318 ${cx + 62} 380 V560Z' fill='#d8cfbf'/>
        <path d='M${cx - 50} 552 V384 Q${cx - 50} 330 ${cx} 330 Q${cx + 50} 330 ${cx + 50} 384 V552Z' fill='url(#bgl)'/><path d='M${cx - 50} 552 V384 Q${cx - 50} 330 ${cx} 330 Q${cx + 50} 330 ${cx + 50} 384 V552Z' fill='url(#bld)' opacity='0.55'/>
        <path d='M${cx} 330 V552 M${cx - 50} 440 H${cx + 50}' stroke='#6a5a48' stroke-width='4'/><path d='M${cx - 30} 470 Q${cx - 10} 450 ${cx + 30} 470' stroke='#8ab86a' stroke-width='8' fill='none' opacity='0.5'/>
        <rect x='${cx - 70}' y='556' width='140' height='10' fill='#c8bca6'/>`;
    }
    // The panelling, the plate rail with its row of steins.
    out += `<rect y='600' width='1600' height='300' fill='url(#bwd)'/>${Array.from({ length: 21 }, (_, i) => `<rect x='${i * 80 + 6}' y='620' width='68' height='150' rx='4' fill='none' stroke='#8a5a2e' stroke-width='3' opacity='0.5'/>`).join('')}
      <rect y='586' width='1600' height='16' fill='#8a5a2e'/><rect y='586' width='1600' height='3' fill='#e8c494'/>`;
    // (Three steins, two stoneware and a glass, repeated along the rail.)
    const stein = (x, h, glass, fill) => (glass
      ? `<rect x='${x}' y='${46 - h}' width='22' height='${h}' rx='3' fill='#f4c040' opacity='0.85'/><rect x='${x}' y='${46 - h}' width='22' height='7' rx='3' fill='#fffaf0'/>`
      : `<rect x='${x}' y='${46 - h}' width='22' height='${h}' rx='3' fill='${fill}'/><path d='M${x} ${46 - h * 0.55} h22' stroke='#3a6ab8' stroke-width='3'/><path d='M${x - 2} ${46 - h} h26 l-3 -6 h-20Z' fill='#9a9a9a'/>`) + `<path d='M${x + 22} ${46 - h * 0.8} q9 2 0 ${(h * 0.5).toFixed(0)}' stroke='#9a8a74' stroke-width='3' fill='none'/>`;
    out += `<pattern id='bst' width='138' height='46' x='14' y='540' patternUnits='userSpaceOnUse'>${stein(0, 40, false, '#d8d0c0')}${stein(46, 34, true)}${stein(92, 44, false, '#c8beac')}</pattern><rect y='540' width='1600' height='46' fill='url(#bst)'/>`;
    // The stag: a carved shield with the antlers spreading over it, between the left window and the steins.
    out += `<g transform='translate(250 470)'><path d='M-22 -20 H22 V10 Q0 34 -22 10Z' fill='#8a5a2e'/><path d='M-14 -12 H14 V8 Q0 24 -14 8Z' fill='#a8743e'/>
      ${[1, -1].map((s) => `<path d='M${s * 6} -18 Q${s * 30} -50 ${s * 22} -90 M${s * 18} -44 Q${s * 40} -52 ${s * 48} -70 M${s * 24} -70 Q${s * 38} -80 ${s * 40} -100 M${s * 14} -32 Q${s * 34} -30 ${s * 44} -40' stroke='#f2ead6' stroke-width='6' fill='none' stroke-linecap='round'/>`).join('')}</g>`;
    // The long tables and benches, with steins and a pretzel or two.
    const table = (x, y, w, s) => `<g transform='translate(${x} ${y}) scale(${s})'><rect x='0' y='0' width='${w}' height='18' fill='#b07c46'/><rect x='0' y='0' width='${w}' height='4' fill='#e0b480'/><rect x='14' y='18' width='12' height='70' fill='#7d5430'/><rect x='${w - 26}' y='18' width='12' height='70' fill='#7d5430'/>
      <rect x='-20' y='50' width='${w + 40}' height='12' fill='#9a6a3a'/>${Array.from({ length: Math.floor(w / 70) }, (_, k) => `<rect x='${30 + k * 70}' y='-36' width='22' height='36' rx='3' fill='${k % 2 ? '#f4c040' : '#d8d0c0'}'/><rect x='${30 + k * 70}' y='-38' width='22' height='8' rx='3' fill='#fffaf0'/>`).join('')}
      <path d='M${w - 70} -8 q-16 -22 4 -26 q14 0 10 14 q-4 -14 -16 -6 q14 -12 22 4 q4 12 -14 14' stroke='#a8642a' stroke-width='6' fill='none'/></g>`;
    out += table(-40, 760, 420, 1) + table(1020, 770, 260, 1);
    // The great barrel on its rack, tap and all.
    out += `<g transform='translate(1290 640)'><rect x='-10' y='130' width='300' height='20' fill='#6a4424'/><path d='M10 150 L30 210 M270 150 L250 210' stroke='#6a4424' stroke-width='14'/>
      <ellipse cx='140' cy='70' rx='150' ry='78' fill='#a8743e'/>${[-110, -60, 0, 60, 110].map((d) => `<path d='M${140 + d} ${-4 + Math.abs(d) * 0.1} Q${140 + d * 1.12} 70 ${140 + d} ${144 - Math.abs(d) * 0.1}' stroke='#7d5430' stroke-width='3' fill='none'/>`).join('')}
      ${[-120, 120].map((d) => `<path d='M${140 + d} ${10 + Math.abs(d) * 0.05} Q${140 + d * 1.13} 70 ${140 + d} ${130 - Math.abs(d) * 0.05}' stroke='#3a3a3a' stroke-width='10' fill='none'/>`).join('')}
      <ellipse cx='140' cy='70' rx='46' ry='36' fill='#c08a52' stroke='#7d5430' stroke-width='4'/><path d='M120 60 L140 46 L160 60 L140 96Z' fill='#2a6fdb' opacity='0.8'/><path d='M126 60 L140 50 L154 60 L140 86Z' fill='#fff' opacity='0.6'/>
      <rect x='132' y='136' width='16' height='10' fill='#c9a24a'/><path d='M140 146 V168 h10' stroke='#c9a24a' stroke-width='6' fill='none'/></g>`;
    return scene(tight(out));
  }

  // ---------- The space lounge ----------
  // A bar on a space station, behind a great domed window: deep space with nebulae in violet and
  // blue, stars, a ringed planet up in the corner and a banded gas giant rising huge below the
  // sidebar with its moon, an asteroid drifting; the window's ribs curving in from the sides with
  // lights along them, the ceiling's glowing strip; and in the lounge the bar along the bottom,
  // its neon edge, the stools, a cocktail and a potted alien plant. (The station turning, the
  // robot bartender, the saucers and the astronaut are on the TV: SCENES.space in scenery.js.)
  function spaceLounge() {
    const rand = seeded(73);
    let out = `<defs><linearGradient id='ssk' x1='0' y1='0' x2='0.3' y2='1'><stop offset='0' stop-color='#03040c'/><stop offset='1' stop-color='#080b20'/></linearGradient>
      ${[['sn1', '#8c46ff', 0.42], ['sn2', '#2aa0ff', 0.34], ['sn3', '#ff4a9a', 0.22], ['sn4', '#3ae0c8', 0.18]].map(([id, col, o]) => `<radialGradient id='${id}'><stop offset='0' stop-color='${col}' stop-opacity='${o}'/><stop offset='0.5' stop-color='${col}' stop-opacity='${o / 3}'/><stop offset='1' stop-color='${col}' stop-opacity='0'/></radialGradient>`).join('')}
      <radialGradient id='sgg' cx='0.35' cy='0.3'><stop offset='0' stop-color='#f6c48a'/><stop offset='0.6' stop-color='#c0703a'/><stop offset='1' stop-color='#4a1e10'/></radialGradient>
      <radialGradient id='sgp' cx='0.38' cy='0.32'><stop offset='0' stop-color='#9ad8ff'/><stop offset='0.55' stop-color='#3a6ac8'/><stop offset='1' stop-color='#101a48'/></radialGradient>
      <radialGradient id='smn' cx='0.35' cy='0.3'><stop offset='0' stop-color='#e8e4f0'/><stop offset='1' stop-color='#4a4660'/></radialGradient>
      <linearGradient id='sbar' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1c2248'/><stop offset='1' stop-color='#05060f'/></linearGradient>
      <linearGradient id='srib' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#1a1f3a'/><stop offset='0.5' stop-color='#2c3360'/><stop offset='1' stop-color='#0c0f22'/></linearGradient></defs>
      <rect width='1600' height='900' fill='url(#ssk)'/>`;
    // Nebulae: big soft clouds of colour, overlapping.
    out += [[260, 260, 520, 300, 'sn1'], [520, 140, 360, 200, 'sn3'], [1150, 700, 560, 320, 'sn2'], [900, 380, 420, 260, 'sn4'], [150, 640, 380, 240, 'sn2'], [1320, 200, 380, 220, 'sn1']].map(([x, y, rx, ry, id]) => `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='url(#${id})'/>`).join('');
    // Stars: a tile of small ones, and a few big bright ones with flares.
    let st = '';
    for (let i = 0; i < 34; i++) st += `<circle cx='${(rand() * 400).toFixed(0)}' cy='${(rand() * 300).toFixed(0)}' r='${(rand() < 0.12 ? 1.5 : 0.5 + rand() * 0.7).toFixed(1)}' fill='${pick(rand, ['#fff', '#cfe0ff', '#ffe9c4', '#d8c8ff'])}' opacity='${(0.35 + rand() * 0.65).toFixed(2)}'/>`;
    out += `<pattern id='sst' width='400' height='300' patternUnits='userSpaceOnUse'>${st}</pattern><rect width='1600' height='900' fill='url(#sst)'/>`;
    out += [[120, 90], [1050, 120], [700, 60], [1500, 560], [60, 470], [980, 520]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='2.6' fill='#fff'/><path d='M${x - 12} ${y} H${x + 12} M${x} ${y - 12} V${y + 12}' stroke='#cfe0ff' stroke-width='1' opacity='0.7'/><circle cx='${x}' cy='${y}' r='9' fill='#cfe0ff' opacity='0.15'/>`).join('');
    // The ringed planet up in the corner.
    out += `<g transform='translate(1408 112) rotate(-16)'><ellipse rx='150' ry='30' fill='none' stroke='#f0d4a8' stroke-width='10' opacity='0.45'/><circle r='70' fill='url(#sgg)'/>
      <path d='M-66 -18 Q0 -34 66 -18 M-70 6 Q0 -8 70 6 M-62 30 Q0 20 62 30' stroke='#7a3a1a' stroke-width='6' fill='none' opacity='0.35'/><path d='M-150 0 A150 30 0 0 0 150 0' fill='none' stroke='#f0d4a8' stroke-width='10' opacity='0.75'/></g>`;
    // The gas giant rising below the sidebar, bands and storms, a thin ring, its shadow side; a moon.
    out += `<g transform='translate(1420 1010)'><clipPath id='sgc'><circle r='418'/></clipPath><circle r='420' fill='url(#sgp)'/>
      <g clip-path='url(#sgc)'>${[[-330, 34], [-262, 22], [-196, 40], [-120, 18], [-60, 30]].map(([y, w]) => `<path d='M-420 ${y} Q0 ${y - 60} 420 ${y}' stroke='#cfe8ff' stroke-width='${w}' fill='none' opacity='0.16'/>`).join('')}<circle cx='420' cy='120' r='520' fill='#050820' opacity='0.45'/></g>
      <ellipse cx='-150' cy='-250' rx='40' ry='18' fill='#e8f4ff' opacity='0.3'/><circle r='420' fill='none' stroke='#9ad8ff' stroke-width='6' opacity='0.35'/>
      <path d='M-640 -180 Q0 -420 640 -260' stroke='#bfe0ff' stroke-width='3' fill='none' opacity='0.4'/></g>
      <circle cx='1100' cy='590' r='26' fill='url(#smn)'/><circle cx='1092' cy='584' r='5' fill='#3a3650' opacity='0.4'/><circle cx='1108' cy='598' r='3' fill='#3a3650' opacity='0.4'/>`;
    // An asteroid tumbling, top left.
    out += `<path d='M300 80 l22 -10 l18 6 l10 18 l-8 16 l-24 6 l-18 -10Z' fill='#4a4458'/><path d='M310 82 l12 -6 l10 6' stroke='#8a84a0' stroke-width='2' fill='none'/>`;
    // The window: ribs curving in from both sides, lights along them; the ceiling's strip.
    for (const side of [0, 1]) {
      const X = (x) => (side ? 1600 - x : x);
      out += `<path d='M${X(-20)} 0 Q${X(140)} 380 ${X(60)} 760 L${X(-20)} 760Z' fill='url(#srib)'/><path d='M${X(-20)} 0 Q${X(140)} 380 ${X(60)} 760' stroke='#5a68b8' stroke-width='3' fill='none' opacity='0.8'/>
        <path d='M${X(240)} 0 Q${X(330)} 380 ${X(250)} 760' stroke='#1a1f3a' stroke-width='16' fill='none'/><path d='M${X(240)} 0 Q${X(330)} 380 ${X(250)} 760' stroke='#3a4688' stroke-width='2' fill='none'/>
        ${[120, 260, 400, 540, 680].map((y) => { const t = y / 760; const x = (1 - t) * (1 - t) * -20 + 2 * (1 - t) * t * 140 + t * t * 60; return `<circle cx='${X(x + 6).toFixed(0)}' cy='${y}' r='3' fill='#7cf0ff'/><circle cx='${X(x + 6).toFixed(0)}' cy='${y}' r='9' fill='#7cf0ff' opacity='0.25'/>`; }).join('')}`;
    }
    out += `<path d='M0 0 H1600 V40 Q800 90 0 40Z' fill='#0a0c1e'/><path d='M0 40 Q800 90 1600 40' stroke='#7cf0ff' stroke-width='3' fill='none' opacity='0.6'/><path d='M0 46 Q800 96 1600 46' stroke='#7cf0ff' stroke-width='12' fill='none' opacity='0.08'/>`;
    // The lounge: the floor, the bar along the bottom with its neon edge, stools, a glass, a plant.
    out += `<rect y='760' width='1600' height='140' fill='#06071a'/><path d='M0 762 H1600' stroke='#2a3470' stroke-width='3'/>
      <path d='M-20 900 V820 Q800 790 1620 820 V900Z' fill='url(#sbar)'/><path d='M-20 820 Q800 790 1620 820' stroke='#7cf0ff' stroke-width='4' fill='none'/><path d='M-20 826 Q800 796 1620 826' stroke='#7cf0ff' stroke-width='16' fill='none' opacity='0.12'/>
      <path d='M-20 846 Q800 818 1620 846' stroke='#ff5c8a' stroke-width='2' fill='none' opacity='0.5'/>`;
    out += [[180, 1], [420, 0.9], [1180, 0.9], [1430, 1]].map(([x, s]) => `<g transform='translate(${x} 800) scale(${s})'><ellipse cx='0' cy='-38' rx='34' ry='8' fill='#2a3266'/><ellipse cx='0' cy='-40' rx='34' ry='6' fill='#3e4a8a'/><path d='M-3 -32 V-2 M-20 0 H20' stroke='#1a1f3a' stroke-width='6'/></g>`).join('');
    out += `<g transform='translate(1260 812)'><path d='M-22 -54 L22 -54 L2 -26 V-4 M-12 -2 H14' stroke='#cfe8ff' stroke-width='3' fill='none' opacity='0.8'/><path d='M-17 -50 L17 -50 L2 -30Z' fill='#7cf0ff' opacity='0.6'/><circle cx='10' cy='-58' r='5' fill='#7dff9e'/><path d='M14 -54 l16 -22' stroke='#ff5c8a' stroke-width='2'/></g>`;
    out += `<g transform='translate(70 760)'><path d='M-30 0 H30 L22 60 H-22Z' fill='#2a3266'/><path d='M-30 0 H30' stroke='#7cf0ff' stroke-width='2'/>
      ${[[-40, -90, '#3ad08a'], [-10, -130, '#2ab070'], [24, -110, '#3ad08a'], [44, -70, '#2ab070'], [-56, -50, '#2ab070']].map(([dx, dy, f]) => `<path d='M0 0 Q${dx * 0.3} ${dy * 0.6} ${dx} ${dy} Q${dx * 0.6} ${dy * 0.5} 4 0Z' fill='${f}'/><circle cx='${dx}' cy='${dy}' r='6' fill='#c8ff6a'/><circle cx='${dx}' cy='${dy}' r='14' fill='#c8ff6a' opacity='0.2'/>`).join('')}</g>`;
    return scene(tight(out));
  }

  // Inside the Highlands pub: rough fieldstone under black beams (copper pots, heather drying and
  // an iron lantern hung from them), a deep-set window on the glen (the loch, the ruin on its island,
  // a croft with its light on, sheep on the hill) in whatever the weather's doing, the pipes hung on
  // their peg, the great fireplace with the peat fire going, a stag's head over the mantel, a targe
  // and claymores on the wall, a high-backed settle with the collie asleep in front of it, and the
  // whisky barrels and bottles in the corner. Dark up under the beams for the TV's heading.
  function highlandPub(weather = 'clear') {
    const rand = seeded(weather === 'rain' ? 31 : weather === 'fog' ? 37 : 29);
    // The collie asleep on the rug is the scenery kit's (public/scenery.js), pasted, with a collie's
    // white muzzle, chest and tail tip: critter.at('dog', 180, 870, 210, { pose: 'sleep', color: '#141414', still: true })
    const HL_COLLIE = "<g transform='translate(75 744) scale(2.1)'><path d='M14 56 Q10 34 38 32 Q64 30 72 42 Q78 54 66 57 H20 Q14 57 14 56Z' fill='#141414' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M58 44 Q70 45 71 57 H56 Q52 50 58 44Z' fill='#f4f0e8' stroke='#1c1410' stroke-width='1.2'/><path d='M18 55 Q8 52 10 44' fill='none' stroke='#1c1410' stroke-width='7.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M18 55 Q8 52 10 44' fill='none' stroke='#141414' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'/><circle cx='10' cy='44' r='2.4' fill='#f4f0e8'/><circle cx='76' cy='47' r='9.5' fill='#141414' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M80 46 H92 Q97 46 97 51 Q97 56 92 56 H80Z' fill='#f4f0e8' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M69 40 Q64 46 68 56 Q73 55 74 43Z' fill='#161413' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><ellipse cx='95.5' cy='49' rx='2' ry='1.7' fill='#1c1410'/><path d='M78 45 q2 1.8 4 0' stroke='#9a9a9a' stroke-width='1.3' fill='none' stroke-linecap='round'/></g>";
    const sky = { clear: ['#2b3a5c', '#9a7b8e', '#e9b783'], rain: ['#2a313c', '#48515c', '#69727c'], fog: ['#6d757d', '#a3aab0', '#c4c9cc'] }[weather];
    let stones = '';
    for (let row = 0; row < 6; row++) {
      let x = -10 + rand() * 10;
      while (x < 300) {
        const w = 34 + rand() * 40;
        const cx = x + w / 2;
        const cy = row * 35 + 18 + (rand() - 0.5) * 5;
        const ry = 13 + rand() * 5;
        const fill = pick(rand, ['#5a5045', '#4f463c', '#635849', '#564c41', '#4a4238', '#6a5e4e']);
        for (const dx of cx + w / 2 > 300 ? [0, -300] : [0]) stones += `<ellipse cx='${(cx + dx).toFixed(0)}' cy='${cy.toFixed(0)}' rx='${(w / 2 - 2).toFixed(0)}' ry='${ry.toFixed(0)}' fill='${fill}'/><ellipse cx='${(cx + dx - 3).toFixed(0)}' cy='${(cy - ry / 2.5).toFixed(0)}' rx='${(w / 3).toFixed(0)}' ry='${(ry / 3).toFixed(0)}' fill='#fff' opacity='0.05'/>`;
        x += w;
      }
    }
    const barrel = (x, y, r) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#6a4424'/><circle cx='${x}' cy='${y}' r='${r * 0.82}' fill='#7a5230'/>${[-0.5, -0.2, 0.1, 0.4].map((k) => `<path d='M${x + r * k * 1.6} ${y - r * 0.8} V${y + r * 0.8}' stroke='#5a3a1c' stroke-width='2' opacity='0.6'/>`).join('')}<circle cx='${x}' cy='${y}' r='${r * 0.92}' fill='none' stroke='#2a2a2a' stroke-width='${r * 0.08}'/><circle cx='${x}' cy='${y}' r='${r * 0.12}' fill='#3a2210'/>`;
    let out = `<defs><pattern id='hs' width='300' height='210' patternUnits='userSpaceOnUse'><rect width='300' height='210' fill='#2c2620'/>${stones}</pattern>
      <linearGradient id='hsk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${sky[0]}'/><stop offset='0.55' stop-color='${sky[1]}'/><stop offset='1' stop-color='${sky[2]}'/></linearGradient>
      <radialGradient id='hf'><stop offset='0' stop-color='#ffb050' stop-opacity='0.55'/><stop offset='0.5' stop-color='#ff7a2a' stop-opacity='0.18'/><stop offset='1' stop-color='#ff6a1a' stop-opacity='0'/></radialGradient>
      <radialGradient id='hl'><stop offset='0' stop-color='#ffd890' stop-opacity='0.5'/><stop offset='1' stop-color='#ffb050' stop-opacity='0'/></radialGradient>
      <linearGradient id='hsh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0a0604' stop-opacity='0.8'/><stop offset='0.14' stop-color='#0a0604' stop-opacity='0.15'/><stop offset='0.7' stop-color='#0a0604' stop-opacity='0'/><stop offset='1' stop-color='#0a0604' stop-opacity='0.55'/></linearGradient>
      <radialGradient id='hv' cx='0.5' cy='0.45' r='0.7'><stop offset='0.5' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='0.55'/></radialGradient></defs>
      <rect width='1600' height='900' fill='url(#hs)'/><rect width='1600' height='900' fill='#1a120a' opacity='0.42'/>`;
    // The window on the glen, deep in the wall.
    const fog = weather === 'fog' ? `<rect x='62' y='182' width='236' height='216' fill='#d6dade' opacity='0.55'/><rect x='62' y='320' width='236' height='78' fill='#e3e6e8' opacity='0.5'/>` : '';
    const rain = weather !== 'rain' ? '' : Array.from({ length: 40 }, (_, i) => `<path d='M${66 + ((i * 53) % 228)} ${186 + ((i * 37) % 200)} l-4 14' stroke='#cfd8e2' stroke-width='1.2' opacity='0.45'/>`).join('') + Array.from({ length: 12 }, (_, i) => `<circle cx='${70 + ((i * 71) % 220)}' cy='${196 + ((i * 43) % 190)}' r='2.4' fill='#dfe8f0' opacity='0.4'/>`).join('');
    out += `<path d='M20 150 H340 V430 H20Z' fill='#6a5e4e'/><path d='M20 150 H340 L300 180 H60Z' fill='#7a6e5e'/><path d='M20 150 L60 180 V400 L20 430Z' fill='#4a4238'/><path d='M340 150 L300 180 V400 L340 430Z' fill='#5a5045'/>
      <rect x='60' y='180' width='240' height='220' fill='url(#hsk)'/>
      ${weather === 'clear' ? `<circle cx='250' cy='214' r='2' fill='#fff' opacity='0.8'/><circle cx='120' cy='200' r='1.4' fill='#fff' opacity='0.6'/><circle cx='230' cy='300' r='26' fill='#ffd8a0' opacity='0.35'/>` : ''}
      <path d='M60 300 L100 252 L132 278 L176 228 L226 276 L262 254 L300 272 V400 H60Z' fill='${weather === 'clear' ? '#4a5872' : '#46505c'}'/><path d='M168 236 l8 -8 l8 8 l-6 4Z' fill='#e8eef2' opacity='0.7'/>
      <path d='M60 326 H300 V350 H60Z' fill='${weather === 'clear' ? '#8a90b0' : '#6a7480'}'/><path d='M80 334 h40 M150 340 h60 M230 332 h40' stroke='#e8eef2' stroke-width='1.5' opacity='0.5'/>
      <path d='M196 328 v-14 h6 v-6 h4 v6 h8 v14Z' fill='#2a2e3a'/><path d='M190 330 q16 -6 30 0Z' fill='#2e4a30'/>
      <path d='M60 350 Q120 336 180 352 Q240 340 300 350 V400 H60Z' fill='${weather === 'clear' ? '#2f5a34' : '#2b4a30'}'/><path d='M60 376 Q140 360 220 374 Q270 366 300 372 V400 H60Z' fill='#234627'/>
      <rect x='104' y='358' width='18' height='12' fill='#d8d0c0'/><path d='M100 360 l13 -10 l13 10Z' fill='#5a4a3a'/><rect x='110' y='362' width='5' height='5' fill='#ffcf6a'/>
      ${[[150, 384], [166, 388], [240, 380], [256, 384], [272, 378]].map(([x, y]) => `<ellipse cx='${x}' cy='${y}' rx='5' ry='3.4' fill='#f0ece4'/>`).join('')}${fog}${rain}
      <rect x='176' y='180' width='8' height='220' fill='#2a1a0e'/><rect x='60' y='286' width='240' height='8' fill='#2a1a0e'/><rect x='60' y='180' width='240' height='220' fill='none' stroke='#2a1a0e' stroke-width='8'/>
      <path d='M10 400 H350 L360 428 H0Z' fill='#7a6e5e'/><rect x='70' y='376' width='12' height='26' fill='#f4ecd8'/><circle cx='76' cy='370' r='22' fill='url(#hl)'/><path d='M76 364 q-4 6 0 10 q4 -4 0 -10Z' fill='#ffd060'/>
      <path d='M270 384 h20 l-2 18 h-16Z' fill='#e8b04a' opacity='0.85'/><path d='M270 384 h20' stroke='#fff' stroke-width='2' opacity='0.6'/>`;
    // The pipes on their peg.
    out += `<path d='M110 470 l6 -10' stroke='#3a2412' stroke-width='8'/><path d='M60 500 Q50 470 90 466 Q150 462 150 520 Q150 590 96 596 Q56 596 60 500Z' fill='#2a5a3a'/>
      <path d='M60 500 Q50 470 90 466 Q150 462 150 520 Q150 590 96 596 Q56 596 60 500Z' fill='none' stroke='#c0392b' stroke-width='3' stroke-dasharray='10 6'/><path d='M70 486 L150 560 M70 560 L150 494' stroke='#1e3a8a' stroke-width='4' opacity='0.6'/>
      ${[[96, 470, 20, 330], [110, 470, 0, 350], [126, 474, -16, 340]].map(([x, y, dx, top]) => `<path d='M${x} ${y} L${x + dx} ${top}' stroke='#1a1008' stroke-width='9' stroke-linecap='round'/><rect x='${x + dx - 6}' y='${top - 12}' width='12' height='16' rx='3' fill='#e8dcc0'/>`).join('')}
      <path d='M90 594 L76 660' stroke='#1a1008' stroke-width='7'/>`;
    // The fireplace, the peat fire, the stag over the mantel.
    out += `<circle cx='800' cy='640' r='520' fill='url(#hf)'/>
      <path d='M560 840 V380 H1040 V840Z' fill='#6a5e4e'/>${[[560, 380], [700, 380], [880, 380], [560, 470], [980, 470], [560, 580], [990, 580], [560, 690], [990, 690]].map(([x, y], i) => `<rect x='${x + 3}' y='${y + 3}' width='${i < 3 ? 134 : 54}' height='84' rx='8' fill='${pick(rand, ['#7a6e5e', '#6e6252', '#82745f'])}'/>`).join('')}
      <path d='M620 840 V500 Q620 450 680 450 H920 Q980 450 980 500 V840Z' fill='#1a0e08'/><path d='M640 840 V520 Q640 470 690 470 H910 Q960 470 960 520 V840Z' fill='#120804'/>
      <path d='M520 380 H1080 V410 H520Z' fill='#4a2e17'/><path d='M520 380 H1080' stroke='#7a5230' stroke-width='4'/>
      <path d='M700 470 V560 M700 560 q0 20 20 20' stroke='#2a2a2a' stroke-width='4' fill='none'/><path d='M704 580 h44 q6 30 -22 36 q-28 -6 -22 -36Z' fill='#1e1e1e'/>
      ${[[700, 800, 90], [760, 790, 100], [840, 796, 90], [900, 804, 80], [730, 770, 80], [810, 766, 90], [870, 772, 70]].map(([x, y, w]) => `<rect x='${x - w / 2}' y='${y - 18}' width='${w}' height='22' rx='6' fill='#3a1a0a'/><rect x='${x - w / 2 + 6}' y='${y - 16}' width='${w - 12}' height='6' rx='3' fill='#ff7a1a' opacity='0.7'/>`).join('')}
      <path d='M690 770 Q700 700 730 680 Q738 720 760 690 Q770 640 800 620 Q812 670 832 650 Q850 690 870 680 Q890 720 910 770Z' fill='#ff6a1a' opacity='0.85'/><path d='M730 770 Q744 720 770 712 Q784 734 800 700 Q820 730 840 720 Q860 744 870 770Z' fill='#ffb03a'/><path d='M770 770 Q784 744 800 740 Q816 748 830 770Z' fill='#fff0a0'/>
      <rect x='540' y='840' width='520' height='26' fill='#5a5045'/>
      ${[600, 980].map((x) => `<rect x='${x - 7}' y='344' width='14' height='36' fill='#f4ecd8'/><circle cx='${x}' cy='334' r='30' fill='url(#hl)'/><path d='M${x} 326 q-4 6 0 12 q4 -6 0 -12Z' fill='#ffd060'/>`).join('')}
      <path d='M650 380 v-30 h14 v30 M676 380 v-40 h12 v40 M920 380 v-34 h16 v34' fill='#3a5a2a'/><path d='M676 340 h12 v-12 h-12Z M920 346 h16 v-10 h-16Z' fill='#e8b04a' opacity='0.8'/><path d='M760 380 q-2 -16 16 -18 h48 q18 2 16 18Z' fill='#c8c0b0'/><circle cx='800' cy='356' r='13' fill='#f4ecd8' stroke='#8a6a3a' stroke-width='3'/>
      <path d='M760 300 Q760 220 800 210 Q840 220 840 300 Q820 316 800 316 Q780 316 760 300Z' fill='#5a3a1e'/>
      <path d='M780 252 Q776 210 800 196 Q824 210 820 252 L812 290 Q800 300 788 290Z' fill='#8a5a30'/><ellipse cx='800' cy='286' rx='12' ry='9' fill='#3a2210'/><circle cx='789' cy='240' r='3.4' fill='#120804'/><circle cx='811' cy='240' r='3.4' fill='#120804'/>
      <path d='M784 204 Q760 160 722 150 M760 172 L736 136 M748 160 L716 170 M816 204 Q840 160 878 150 M840 172 L864 136 M852 160 L884 170' stroke='#e0d0b0' stroke-width='7' fill='none' stroke-linecap='round'/>
      <path d='M780 214 l-12 -6 l6 12Z M820 214 l12 -6 l-6 12Z' fill='#7a4a24'/>`;
    // Up under the beams: the lantern, heather drying, the copper pots.
    out += `<rect width='1600' height='66' fill='#1a1008'/><rect y='62' width='1600' height='30' fill='#3a2412'/><rect y='62' width='1600' height='4' fill='#6a4424'/>${Array.from({ length: 9 }, (_, i) => `<rect x='${i * 190 + 40}' y='0' width='40' height='66' fill='#24160c'/>`).join('')}
      <path d='M160 92 V130' stroke='#1a1a1a' stroke-width='3'/><circle cx='160' cy='168' r='90' fill='url(#hl)'/><path d='M144 136 h32 l-4 8 h-24Z M146 144 h28 v40 h-28Z' fill='#1e1e1e'/><rect x='151' y='148' width='18' height='32' fill='#ffd27a'/><path d='M140 184 h40 l-8 8 h-24Z' fill='#1e1e1e'/>
      ${[[380, 0], [440, 1], [520, 0]].map(([x, k]) => `<path d='M${x} 92 v10' stroke='#5a3a1e' stroke-width='3'/><path d='M${x - 12} 102 h24 l-6 ${44 + k * 8} h-12Z' fill='#5a6a3a'/>${Array.from({ length: 7 }, (_, j) => `<circle cx='${x - 10 + j * 3.4}' cy='${140 + k * 8 + (j % 3) * 5}' r='3.4' fill='${['#8a4a8a', '#a05aa0', '#7a3a7a'][j % 3]}'/>`).join('')}`).join('')}
      ${[[1070, 18], [1110, 24], [1150, 15]].map(([x, r]) => `<path d='M${x} 92 v${28 - r}' stroke='#2a2a2a' stroke-width='2'/><path d='M${x - r} ${120 - r + r} a${r} ${r} 0 0 0 ${2 * r} 0Z' fill='#b8683a'/><path d='M${x - r} 120 h${2 * r}' stroke='#e08a50' stroke-width='3'/><path d='M${x + r} 120 h${r * 0.9}' stroke='#3a2210' stroke-width='4'/>`).join('')}`;
    // A targe and claymores on the wall in the gap.
    out += `<path d='M1050 330 L1150 520 M1150 330 L1050 520' stroke='#c8ccd0' stroke-width='7'/><path d='M1040 346 l20 -10 M1140 336 l20 10' stroke='#6a4424' stroke-width='9'/>
      <circle cx='1100' cy='430' r='54' fill='#5a3a1e' stroke='#3a2210' stroke-width='5'/>${Array.from({ length: 12 }, (_, i) => `<circle cx='${(1100 + 38 * Math.cos(i * 0.524)).toFixed(0)}' cy='${(430 + 38 * Math.sin(i * 0.524)).toFixed(0)}' r='4' fill='#c8a85a'/>`).join('')}<circle cx='1100' cy='430' r='14' fill='#c8a85a'/><path d='M1100 430 L1100 404' stroke='#c8ccd0' stroke-width='5'/>`;
    // The settle and the collie asleep in front of it; an umbrella against it in the rain.
    out += `<path d='M-10 560 H200 V820 H-10Z' fill='#4a2e17'/><path d='M-10 560 H200' stroke='#6a4424' stroke-width='6'/>${[30, 80, 130, 180].map((x) => `<rect x='${x - 3}' y='572' width='6' height='130' fill='#3a2412'/>`).join('')}
      <rect x='-10' y='700' width='240' height='30' fill='#5a3a1e'/><rect x='-10' y='690' width='240' height='16' rx='6' fill='#1e5a3a'/><path d='M-10 698 h240' stroke='#c0392b' stroke-width='2'/>
      <rect x='200' y='560' width='26' height='270' fill='#3a2412'/>
      ${weather === 'rain' ? `<path d='M236 830 L262 640' stroke='#1a1a1a' stroke-width='4'/><path d='M236 830 q-6 6 -12 0' stroke='#1a1a1a' stroke-width='4' fill='none'/><path d='M262 640 L240 700 L254 704 L262 640 L276 706 L290 702Z' fill='#1e3a6a'/><ellipse cx='240' cy='840' rx='30' ry='6' fill='#8ab0d0' opacity='0.4'/>` : ''}
      <rect y='840' width='1600' height='60' fill='#2a221c'/>${Array.from({ length: 12 }, (_, i) => `<path d='M${i * 140 + (i % 2) * 40} 840 l-30 60' stroke='#1a140e' stroke-width='3'/>`).join('')}<path d='M0 868 H1600' stroke='#1a140e' stroke-width='3'/>
      <ellipse cx='200' cy='862' rx='190' ry='26' fill='#6a2424'/><ellipse cx='200' cy='862' rx='160' ry='18' fill='none' stroke='#c8a85a' stroke-width='2'/>
      ${HL_COLLIE}`;
    // The corner: barrels, the shelf of bottles, a stool and a dram.
    out += `<rect x='1180' y='630' width='440' height='12' fill='#4a2e17'/>${Array.from({ length: 10 }, (_, i) => `<rect x='${1196 + i * 40}' y='${574 - (i % 3) * 6}' width='22' height='${56 + (i % 3) * 6}' rx='4' fill='${pick(rand, ['#8a4a1a', '#c8862a', '#3a5a2a', '#6a2a1a', '#d8b060'])}' opacity='0.92'/><rect x='${1201 + i * 40}' y='${560 - (i % 3) * 6}' width='12' height='16' fill='#2a1a0e'/><rect x='${1199 + i * 40}' y='${600}' width='16' height='14' fill='#e8dcc0' opacity='0.85'/>`).join('')}
      ${barrel(1300, 800, 74)}${barrel(1460, 800, 74)}${barrel(1380, 680, 64)}
      <rect x='1352' y='668' width='22' height='10' fill='#c8a85a'/><path d='M1362 678 v12' stroke='#c8a85a' stroke-width='4'/>
      <path d='M1530 700 h50 l-6 60 h-38Z' fill='#e8b04a' opacity='0.85'/><path d='M1530 700 h50' stroke='#fff' stroke-width='2' opacity='0.5'/>
      <rect x='1176' y='740' width='60' height='12' rx='4' fill='#5a3a1e'/><path d='M1184 752 l-10 120 M1228 752 l10 120' stroke='#4a2e17' stroke-width='7'/>`;
    // Shade: the beams dark for the heading; the edges darker; a little shade in the middle.
    out += `<rect width='1600' height='900' fill='url(#hsh)'/><rect width='1600' height='900' fill='url(#hv)'/>`;
    return vvScene(out);
  }

  // The Highlands pub (the weather outside: 'clear', 'rain' or 'fog').
  const highland = (weather) => ({
      // Rough stone walls under heavy beams, the window on the glen, lanterns, the peat fire glowing
      // (see highlandPub()).
      bg: () => `linear-gradient(rgba(14, 8, 4, 0.45), transparent 14%), radial-gradient(ellipse 90% 38% at 50% 106%, rgba(255, 120, 40, 0.25), transparent 70%), ${highlandPub(weather)} center / cover no-repeat, #1a1510`,
      // A green tartan cloth on the table.
      felt: `repeating-linear-gradient(0deg, rgba(14, 28, 58, 0.5) 0 16px, transparent 16px 32px, rgba(190, 40, 40, 0.4) 32px 34px, transparent 34px 64px),
        repeating-linear-gradient(90deg, rgba(14, 28, 58, 0.5) 0 16px, transparent 16px 32px, rgba(190, 40, 40, 0.4) 32px 34px, transparent 34px 64px),
        radial-gradient(ellipse at center, #2a7044 0%, #1f5e38 70%, #174a2c 100%)`,
      rim: '#4a2e17',
  });

  // ---------- The five regular rooms, drawn whole: dive, tavern, club, castle, jazz ----------
  // Each is a 1600 x 900 scene, like the eggs': the TV shows all of it, with the table over the
  // middle and the sidebar top right, so the story is told round the edges (the left side, the
  // strip along the top, the gap between the table and the sidebar, and the floor and the bottom
  // right). The middle is kept dark for the phones' cards. The moving parts are on the TV (see
  // ROOMS5 in public/scenery.js, which finds these drawings by their place in the 1600 x 900).
  const glow = (id, color, o = 0.6) => `<radialGradient id='${id}'><stop offset='0' stop-color='${color}' stop-opacity='${o}'/><stop offset='1' stop-color='${color}' stop-opacity='0'/></radialGradient>`;
  // A bottle on a shelf (its foot at y), a little light on its shoulder.
  const bottle = (x, y, h, c, w = 16) => { const f = (n) => +n.toFixed(1); return `<path d='M${f(x)} ${y} v-${f(h * 0.62)} q0 -${f(h * 0.12)} ${f(w * 0.32)} -${f(h * 0.16)} v-${f(h * 0.22)} h${f(w * 0.36)} v${f(h * 0.22)} q${f(w * 0.32)} ${f(h * 0.04)} ${f(w * 0.32)} ${f(h * 0.16)} v${f(h * 0.62)}Z' fill='${c}'/><rect x='${f(x + 2)}' y='${f(y - h * 0.5)}' width='${w - 4}' height='${f(h * 0.22)}' fill='#e8dcc0' opacity='0.55'/><rect x='${f(x + 2)}' y='${f(y - h * 0.6)}' width='2.5' height='${f(h * 0.55)}' fill='#fff' opacity='0.22'/>`; };

  // The dive bar, after midnight: a brick wall under a low ceiling of pipes, last Christmas's lights
  // still up (half of them dead), the fan turning slowly under its one bulb. On the left a neon
  // BEER sign, the dartboard and the chalk scores under it, and the jukebox glowing in the corner;
  // between them a red neon BAR sign, gig flyers, and the bar along the bottom right: the taps, the
  // tip jar, the till with CASH ONLY taped to it, bottles lit along the back shelf, stools in red
  // vinyl, and a regular asleep on his arms at the end. Peanut shells all over the lino.
  function diveBar() {
    const rand = seeded(41);
    let out = `<defs>
      <pattern id='db' width='128' height='60' patternUnits='userSpaceOnUse'><rect width='128' height='60' fill='#120c09'/>
        <rect x='1.5' y='1.5' width='61' height='27' rx='2' fill='#4a2219'/><rect x='65.5' y='1.5' width='61' height='27' rx='2' fill='#552a1e'/>
        <rect x='-30.5' y='31.5' width='61' height='27' rx='2' fill='#3f1d15'/><rect x='33.5' y='31.5' width='61' height='27' rx='2' fill='#5c2f21'/><rect x='97.5' y='31.5' width='61' height='27' rx='2' fill='#47251b'/>
        <path d='M4 3h56M68 3h56M36 33h56M100 33h28M0 33h28' stroke='#fff' stroke-opacity='0.05' stroke-width='2'/></pattern>
      <linearGradient id='dwood' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6a3c1e'/><stop offset='1' stop-color='#2a140a'/></linearGradient>
      <linearGradient id='dch' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#6a6460'/><stop offset='0.45' stop-color='#e8e2da'/><stop offset='1' stop-color='#5a5450'/></linearGradient>
      <pattern id='dlino' width='96' height='38' patternUnits='userSpaceOnUse'><rect width='48' height='19' fill='#2a201a' opacity='0.6'/><rect x='48' y='19' width='48' height='19' fill='#2a201a' opacity='0.6'/></pattern>
      <linearGradient id='dfloor' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1a1310'/><stop offset='1' stop-color='#0c0806'/></linearGradient>
      ${glow('dred', '#ff3a24', 0.55)}${glow('damb', '#ff9a2a', 0.5)}${glow('dblu', '#3a8cff', 0.4)}${glow('djuke', '#ff4ac8', 0.45)}${glow('dbulb', '#ffd890', 0.5)}
      <radialGradient id='ddark' cx='0.37' cy='0.5' r='0.55'><stop offset='0' stop-color='#080504' stop-opacity='0.78'/><stop offset='0.7' stop-color='#080504' stop-opacity='0.45'/><stop offset='1' stop-color='#080504' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='url(#db)'/>`;
    // Grime: bricks gone dark, a few chipped.
    for (let i = 0; i < 18; i++) out += `<rect x='${(Math.floor(rand() * 25) * 64 + (rand() < 0.5 ? 0 : 32) + 2).toFixed(0)}' y='${(Math.floor(rand() * 30) * 30 + 2).toFixed(0)}' width='60' height='26' rx='2' fill='#000' opacity='${(0.15 + rand() * 0.3).toFixed(2)}'/>`;
    // The blue glow on the left wall (a neon round the corner), the room's dark middle.
    out += `<ellipse cx='60' cy='300' rx='420' ry='320' fill='url(#dblu)'/><rect width='1600' height='900' fill='url(#ddark)'/><rect width='1600' height='900' fill='#0a0605' opacity='0.22'/>`;
    // The ceiling: pipes, a duct, and the Christmas lights nobody took down.
    out += `<rect width='1600' height='64' fill='#0b0807'/><rect y='64' width='1600' height='8' fill='#1e1612'/>
      <path d='M0 86 H1600' stroke='#2e2622' stroke-width='12'/><path d='M0 82 H1600' stroke='#5a4c44' stroke-width='2' opacity='0.5'/>
      ${[140, 520, 980, 1380].map((x) => `<rect x='${x}' y='70' width='10' height='24' fill='#1a1412'/>`).join('')}
      <path d='M0 104 H1600' stroke='#241c18' stroke-width='6'/>`;
    let lights = '';
    for (let i = 0; i < 4; i++) {
      const x0 = i * 400;
      lights += `<path d='M${x0} 92 Q${x0 + 200} 150 ${x0 + 400} 92' stroke='#141010' stroke-width='2' fill='none'/>`;
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        const x = x0 + t * 400;
        const y = 92 + 4 * t * (1 - t) * 58;
        const c = pick(rand, ['#ff4a4a', '#ffd23f', '#4ad4ff', '#6aff7a', '#ff8ad8']);
        const dead = rand() < 0.4;
        lights += dead ? `<ellipse cx='${x.toFixed(0)}' cy='${(y + 7).toFixed(0)}' rx='4' ry='6' fill='#2a2420'/>` : `<circle cx='${x.toFixed(0)}' cy='${(y + 7).toFixed(0)}' r='16' fill='${c}' opacity='0.16'/><ellipse cx='${x.toFixed(0)}' cy='${(y + 7).toFixed(0)}' rx='4' ry='6' fill='${c}'/>`;
      }
    }
    out += lights;
    // The fan: its rod, motor and bulb, the blades a blur (they turn on the TV).
    out += `<ellipse cx='800' cy='190' rx='260' ry='120' fill='url(#dbulb)'/><rect x='796' y='64' width='8' height='54' fill='#3a302a'/>
      <ellipse cx='800' cy='126' rx='150' ry='14' fill='#3a2a20' opacity='0.35'/><rect x='780' y='114' width='40' height='22' rx='8' fill='#4a3e36'/><circle cx='800' cy='146' r='11' fill='#ffe2a8'/>`;
    // Left: the neon BEER sign, the dartboard and the chalk scores, the jukebox.
    out += `<ellipse cx='105' cy='192' rx='170' ry='110' fill='url(#damb)'/><rect x='22' y='152' width='166' height='76' rx='14' fill='#140c08' opacity='0.7'/>
      <text x='105' y='212' font-family='Arial Black, Arial, sans-serif' font-weight='900' font-size='52' text-anchor='middle' letter-spacing='4' fill='none' stroke='#ff9a2a' stroke-width='9' stroke-opacity='0.3'>BEER</text>
      <text x='105' y='212' font-family='Arial Black, Arial, sans-serif' font-weight='900' font-size='52' text-anchor='middle' letter-spacing='4' fill='none' stroke='#ffd08a' stroke-width='2.6'>BEER</text>
      <rect x='26' y='156' width='158' height='68' rx='12' fill='none' stroke='#ff9a2a' stroke-width='2.5' opacity='0.85'/>`;
    // A dartboard: the rings drawn as dashed circles, twenty segments round.
    const board = (x, y, r) => { const ring = (rr, w, a, b) => { const c = (2 * Math.PI * rr) / 20; return `<circle cx='${x}' cy='${y}' r='${rr}' fill='none' stroke='${a}' stroke-width='${w}' stroke-dasharray='${c.toFixed(2)} ${c.toFixed(2)}' transform='rotate(-9 ${x} ${y})'/><circle cx='${x}' cy='${y}' r='${rr}' fill='none' stroke='${b}' stroke-width='${w}' stroke-dasharray='${c.toFixed(2)} ${c.toFixed(2)}' stroke-dashoffset='${c.toFixed(2)}' transform='rotate(-9 ${x} ${y})'/>`; };
      return `<circle cx='${x}' cy='${y + 6}' r='${r + 6}' fill='#000' opacity='0.45'/><circle cx='${x}' cy='${y}' r='${r + 4}' fill='#1a1412'/>${ring(r * 0.45, r * 0.9, '#e8dcc0', '#1a1a1a')}${ring(r * 0.82, r * 0.08, '#d3262e', '#1d8f4e')}${ring(r * 0.5, r * 0.07, '#d3262e', '#1d8f4e')}
      <circle cx='${x}' cy='${y}' r='${r * 0.12}' fill='#1d8f4e'/><circle cx='${x}' cy='${y}' r='${r * 0.05}' fill='#d3262e'/>`; };
    out += board(86, 395, 54) + `<path d='M96 380 l26 -12 M70 410 l24 -16 M104 404 l22 4' stroke='#c0c0c0' stroke-width='3'/><path d='M120 366 l8 -6 l-2 8Z M92 392 l8 -6 l-2 8Z M124 406 l8 1 l-6 5Z' fill='#e63946'/>
      <rect x='18' y='478' width='138' height='110' rx='4' fill='#4a2e18'/><rect x='24' y='484' width='126' height='98' fill='#1a201c'/>
      <g stroke='#e8e4d8' stroke-width='2' fill='none' opacity='0.75'><path d='M30 496 h46 M90 496 h52 M83 490 v86'/>
        <path d='M34 512 h8 m4 0 h10 m-22 14 h18 m-18 14 h12 m4 0 h8 M96 512 h12 m4 0 h8 m-24 14 h22 m-22 14 h6'/><path d='M34 562 l6 -8 l6 8 l6 -8 M100 560 h4 m4 0 h4 m4 0 h4 M108 568 l14 -14'/></g>
      <ellipse cx='84' cy='760' rx='200' ry='190' fill='url(#djuke)'/>
      <path d='M14 900 V700 Q14 632 84 632 Q154 632 154 700 V900Z' fill='#3a1a10'/><path d='M24 900 V704 Q24 644 84 644 Q144 644 144 704 V900Z' fill='#5a2a14'/>
      <path d='M34 700 Q34 654 84 654 Q134 654 134 700' stroke='#ff4ac8' stroke-width='7' fill='none'/><path d='M44 704 Q44 666 84 666 Q124 666 124 704' stroke='#ffd23f' stroke-width='6' fill='none'/><path d='M54 708 Q54 678 84 678 Q114 678 114 708' stroke='#4ad4ff' stroke-width='5' fill='none'/>
      <rect x='40' y='716' width='88' height='50' rx='6' fill='#1a0c08'/><ellipse cx='84' cy='748' rx='34' ry='9' fill='#0a0606'/><circle cx='84' cy='748' r='4' fill='#e63946'/>
      ${[0, 1, 2, 3, 4, 5].map((k) => `<rect x='${42 + k * 14}' y='720' width='10' height='14' fill='#f2e8d0' opacity='0.8'/>`).join('')}
      ${[0, 1, 2, 3, 4].map((k) => `<rect x='40' y='${786 + k * 18}' width='88' height='8' rx='4' fill='#2a1408'/>`).join('')}
      <path d='M24 780 V900 M144 780 V900' stroke='#ff4ac8' stroke-width='3' opacity='0.8'/>`;
    // Between the table and the sidebar: the red neon BAR sign hung off the wall, a flyer.
    out += `<ellipse cx='1100' cy='330' rx='300' ry='280' fill='url(#dred)'/>
      <path d='M1050 150 H1150 M1066 150 V178 M1134 150 V178' stroke='#2a2420' stroke-width='5'/>
      <rect x='1062' y='178' width='76' height='270' rx='12' fill='#1a0c0a'/>
      ${[...'BAR'].map((ch, i) => `<text x='1100' y='${258 + i * 76}' font-family='Arial Black, Arial, sans-serif' font-weight='900' font-size='64' text-anchor='middle' fill='none' stroke='#ff3a24' stroke-width='10' stroke-opacity='0.3'>${ch}</text><text x='1100' y='${258 + i * 76}' font-family='Arial Black, Arial, sans-serif' font-weight='900' font-size='64' text-anchor='middle' fill='none' stroke='#ffb0a0' stroke-width='3'>${ch}</text>`).join('')}
      <rect x='1066' y='182' width='68' height='262' rx='10' fill='none' stroke='#ff3a24' stroke-width='2.5' opacity='0.8'/>
      <g transform='rotate(-4 1100 520)'><rect x='1052' y='470' width='96' height='120' fill='#e8d8b0' opacity='0.85'/><rect x='1058' y='478' width='84' height='40' fill='#c0392b' opacity='0.8'/>
        <text x='1100' y='506' font-family='Georgia, serif' font-weight='700' font-size='20' text-anchor='middle' fill='#f4ecd8'>LIVE!</text>
        <text x='1100' y='540' font-family='Georgia, serif' font-size='13' text-anchor='middle' fill='#2a1a10'>THE SPILLS</text><text x='1100' y='560' font-family='Georgia, serif' font-size='11' text-anchor='middle' fill='#2a1a10'>FRI · NO COVER</text>
        <path d='M1056 470 l10 8 M1140 588 l-12 -6' stroke='#c8b890' stroke-width='3'/></g>`;
    // The back shelf (lit from below), the mirror over it; the till with CASH ONLY taped on.
    out += `<rect x='1000' y='560' width='600' height='150' fill='#1a0e08'/><rect x='1000' y='560' width='600' height='110' fill='#3a2a22' opacity='0.35'/>
      <ellipse cx='1300' cy='660' rx='420' ry='120' fill='url(#damb)'/><rect x='1000' y='652' width='600' height='10' fill='#4a2a14'/>`;
    for (let x = 1180; x < 1440; x += 22 + rand() * 6) out += bottle(x, 652, 54 + rand() * 30, pick(rand, ['#2f6b3a', '#8a4a1a', '#6b1a1a', '#2f5a6b', '#a0521a', '#3a2a1a', '#c8a040']));
    out += `<rect x='1470' y='596' width='110' height='70' rx='6' fill='#3a3a3e'/><rect x='1480' y='604' width='60' height='22' fill='#1a3a2a'/><text x='1510' y='621' font-family='monospace' font-size='16' text-anchor='middle' fill='#6aff9a'>0.00</text>
      ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x='${1482 + c * 14}' y='${632 + r * 10}' width='10' height='7' rx='1.5' fill='#8a8a90'/>`).join('')).join('')}
      <g transform='rotate(5 1530 660)'><rect x='1494' y='642' width='78' height='34' fill='#d8c49a'/><text x='1533' y='665' font-family='Arial Black, Arial, sans-serif' font-size='14' text-anchor='middle' fill='#b01e1e'>CASH ONLY</text></g>`;
    // The bar: its top, the panelled front, the brass rail; taps, an ashtray, the tip jar, peanuts.
    out += `<path d='M980 712 Q980 698 996 698 H1600 V726 H980Z' fill='#7a4422'/><path d='M990 700 H1600' stroke='#c08050' stroke-width='3' opacity='0.6'/>
      <rect x='984' y='726' width='616' height='112' fill='url(#dwood)'/>${[1000, 1150, 1300, 1450].map((x) => `<rect x='${x + 12}' y='740' width='126' height='84' rx='4' fill='#000' opacity='0.22'/>`).join('')}
      <path d='M984 852 H1600' stroke='#c8a050' stroke-width='7'/><path d='M984 850 H1600' stroke='#fff0c0' stroke-width='1.5' opacity='0.5'/>${[1040, 1240, 1440].map((x) => `<path d='M${x} 838 v14' stroke='#8a6a30' stroke-width='5'/>`).join('')}
      <rect x='1112' y='630' width='12' height='70' fill='url(#dch)'/><rect x='1096' y='640' width='44' height='12' rx='3' fill='url(#dch)'/>
      ${[[1100, '#c0392b'], [1118, '#f4c430'], [1136, '#2a6fdb']].map(([x, c]) => `<rect x='${x - 4}' y='600' width='9' height='40' rx='3' fill='${c}'/><rect x='${x - 1}' y='652' width='3' height='12' fill='#c8c8c8'/>`).join('')}
      <path d='M1036 700 l4 -44 h30 l4 44Z' fill='#ffb840' opacity='0.85'/><path d='M1040 656 h30 v8 h-30Z' fill='#fff8e8'/>
      <ellipse cx='1200' cy='700' rx='22' ry='5' fill='#2a2a2e'/><path d='M1212 696 h16' stroke='#e8e0d0' stroke-width='3'/><path d='M1226 694 q8 -20 -2 -40 q-8 -18 4 -36' stroke='#cfc4b8' stroke-width='2' fill='none' opacity='0.35'/>
      <path d='M1296 700 v-46 q0 -6 6 -6 h36 q6 0 6 6 v46Z' fill='#cfe6ee' opacity='0.3' stroke='#e8f4f8' stroke-width='1.5' stroke-opacity='0.5'/><rect x='1302' y='668' width='36' height='14' fill='#e8dcc0' opacity='0.9'/><text x='1320' y='679' font-family='Arial, sans-serif' font-weight='700' font-size='10' text-anchor='middle' fill='#2a1a10'>TIPS</text>
      ${[[1306, 694], [1316, 690], [1328, 695], [1320, 698]].map(([x, y]) => `<ellipse cx='${x}' cy='${y}' rx='5' ry='2.5' fill='#d8b040'/>`).join('')}
      <ellipse cx='1392' cy='700' rx='30' ry='7' fill='#5a3a20'/><path d='M1364 698 q28 -18 56 0' fill='#c8a070'/>`;
    // The regular, asleep at the end of the bar on his stool, slumped over the bar with his head on
    // his arms, cap on, flannel shirt, his pint behind him. Drawn with the TV's character kit (see
    // figure() in public/scenery.js), pasted from Scenery.kit.figureAt(1508, 923, 314, { skin: 'light',
    // hat: 'cap', hatColor: '#2a4a6a', beard: 'stubble', hairColor: 'brown', top: '#8a2020',
    // topStyle: 'plaid', accent: '#4a0c0c', bottom: '#2a3048', pose: 'slump', lean: 32,
    // arms: [[172, -50], [178, -56]], flip: true }) without its classes; the TV's zzz rise off him.
    out += `<path d='M1508 820 V900' stroke='url(#dch)' stroke-width='10'/><ellipse cx='1508' cy='818' rx='44' ry='12' fill='#b01e24'/>
      <path d='M1572 698 l3 -36 h24 l3 36Z' fill='#e0a030' opacity='0.55'/>
      <g transform='translate(1429.5 614.2) scale(2.6167)'><g transform='translate(60 0) scale(-1 1)'><g><path d='M27.5 74 L48.4 76.2 L48.4 96.2' fill='none' stroke='#1c1410' stroke-width='12.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M27.5 74 L48.4 76.2 L48.4 96.2' fill='none' stroke='#272a3d' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/><path d='M46.4 97.6 L54 97.6' fill='none' stroke='#1c1410' stroke-width='8.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M46.4 97.6 L54 97.6' fill='none' stroke='#1a1410' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/></g><g><path d='M32.5 74 L53.4 76.2 L53.4 96.2' fill='none' stroke='#1c1410' stroke-width='12.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M32.5 74 L53.4 76.2 L53.4 96.2' fill='none' stroke='#2a3048' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/><path d='M51.4 97.6 L59 97.6' fill='none' stroke='#1c1410' stroke-width='8.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M51.4 97.6 L59 97.6' fill='none' stroke='#1a1410' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/></g><g transform='rotate(32 30 74)'><g><path d='M27.5 39 L29.7 23.2 L42.4 15.2' fill='none' stroke='#1c1410' stroke-width='10.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M27.5 39 L29.7 23.2 L42.4 15.2' fill='none' stroke='#741e1d' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/><circle cx='42.4' cy='15.2' r='3.5' fill='#bc9575' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><rect x='28' y='29' width='6' height='8' fill='#e4b58e' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><g><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='#8a2020'/><path d='M18.8 66 H41.2 L40.5 76 H19.5Z' fill='#2a3048'/><path d='M17.1 42 H42.9 L42.8 44.4 H17.2Z' fill='#4a0c0c'/><path d='M17.6 50 H42.4 L42.2 52.4 H17.8Z' fill='#4a0c0c'/><path d='M18.2 58 H41.8 L41.6 60.4 H18.4Z' fill='#4a0c0c'/><path d='M18.8 66 H41.2 L41 68.4 H19Z' fill='#4a0c0c'/><path d='M25.5 35 V76' stroke='#4a0c0c' stroke-width='2' opacity='0.55'/><path d='M31.5 35 V76' stroke='#4a0c0c' stroke-width='2' opacity='0.55'/><path d='M37.5 35 V76' stroke='#4a0c0c' stroke-width='2' opacity='0.55'/><path d='M19 39 L21.5 75' stroke='#1c1410' stroke-width='3.4' opacity='0.16' stroke-linecap='round'/><path d='M17 41 Q17 34 30 34 Q43 34 43 41 L40.5 76 H19.5Z' fill='none' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><g><circle cx='31' cy='22' r='11' fill='#e4b58e' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M32.3 21.5 q1.9 1.7 3.8 0' fill='none' stroke='#1c1410' stroke-width='1.4' stroke-linecap='round'/><path d='M37.3 21.5 q1.9 1.7 3.8 0' fill='none' stroke='#1c1410' stroke-width='1.4' stroke-linecap='round'/><path d='M35.8 28.2 h3.2' fill='none' stroke='#1c1410' stroke-width='1.4' stroke-linecap='round'/><path d='M27 25 C28 34 35 37 40 31.5 C42 29 42.4 25 41.6 23.5 C40 25.8 34 29.6 27 25Z' fill='#5a3820' opacity='0.35'/><path d='M20 24 C18.5 13 25 9 32 9.5 C38 10 42 14 42 18 C37 15 32 15 28 16 C26 20 24 25 20 24Z' fill='#5a3820' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M20 20 C20 10 27 7.5 32 7.5 C39 7.5 42.5 13 42 19Z' fill='#2a4a6a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M39 17.5 H49 Q50.5 20 47 20.5 H39Z' fill='#273f58' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><g><path d='M33.5 39 L34.1 23 L46.8 15.1' fill='none' stroke='#1c1410' stroke-width='10.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M33.5 39 L34.1 23 L46.8 15.1' fill='none' stroke='#8a2020' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/><circle cx='46.8' cy='15.1' r='3.5' fill='#e4b58e' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g></g></g></g>`;
    // Stools in front, red vinyl on chrome.
    out += [1090, 1260].map((x) => `<path d='M${x} 816 V900' stroke='url(#dch)' stroke-width='10'/><path d='M${x - 30} 880 h60' stroke='#6a6460' stroke-width='6'/><ellipse cx='${x}' cy='814' rx='46' ry='14' fill='#5a0c10'/><ellipse cx='${x}' cy='808' rx='44' ry='12' fill='#b01e24'/><ellipse cx='${x - 12}' cy='805' rx='16' ry='4' fill='#fff' opacity='0.2'/>`).join('');
    // The lino floor, sticky: dark checks, peanut shells, a puddle with the neon in it.
    out += `<rect y='862' width='1600' height='38' fill='url(#dfloor)'/><rect y='862' width='1600' height='38' fill='url(#dlino)'/>
      <ellipse cx='900' cy='884' rx='120' ry='10' fill='#ff3a24' opacity='0.12'/>`;
    for (let i = 0; i < 18; i++) out += `<ellipse cx='${(160 + rand() * 1400).toFixed(0)}' cy='${(866 + rand() * 30).toFixed(0)}' rx='${(3 + rand() * 3).toFixed(1)}' ry='2' fill='${pick(rand, ['#c8a070', '#a07a4a', '#d8b884'])}' opacity='0.75'/>`;
    return scene(out);
  }

  // The tavern at night: plank walls under the great beams, herbs, garlic and a ham hung up to dry,
  // a cartwheel of candles over the room, and a rail of pewter round the walls. On the left the
  // hearth: a big stone fireplace with the fire going, the pot on its crane, antlers over the
  // mantel, the cat asleep on the rug. In the gap, a leaded window on the moonlit hills (a light
  // still on up at the castle), and the notice board under it; along the bottom right the casks
  // on their rack behind the counter, tankards, bread and cheese, a candle in a bottle.
  function tavernInn() {
    const rand = seeded(29);
    let out = `<defs>
      <pattern id='tp' width='192' height='300' patternUnits='userSpaceOnUse'><rect width='64' height='300' fill='#3e2814'/><rect x='64' width='64' height='300' fill='#46301a'/><rect x='128' width='64' height='300' fill='#3a2512'/>
        <path d='M20 0 C24 100 14 200 20 300 M44 0 C40 120 48 200 42 300 M90 0 C96 110 84 190 92 300 M150 0 C146 90 156 210 150 300 M176 0 C180 140 170 220 176 300' stroke='#1a0f06' stroke-opacity='0.35' fill='none'/>
        <path d='M0 0V300M64 0V300M128 0V300' stroke='#120a04' stroke-width='3'/><ellipse cx='100' cy='180' rx='4' ry='9' fill='#24150a' opacity='0.6'/></pattern>
      <pattern id='tst' width='120' height='80' patternUnits='userSpaceOnUse'><rect width='120' height='80' fill='#2a2420'/><rect x='2' y='2' width='54' height='36' rx='8' fill='#5a5045'/><rect x='60' y='2' width='58' height='36' rx='8' fill='#4f463c'/><rect x='-28' y='42' width='60' height='36' rx='8' fill='#635849'/><rect x='34' y='42' width='54' height='36' rx='8' fill='#564c41'/><rect x='92' y='42' width='56' height='36' rx='8' fill='#4a4238'/></pattern>
      <linearGradient id='tsky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0c1430'/><stop offset='1' stop-color='#3a4a72'/></linearGradient>
      <linearGradient id='tcask' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#9a6a3a'/><stop offset='1' stop-color='#4a2c14'/></linearGradient>
      <linearGradient id='tpew' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#5a5a60'/><stop offset='0.5' stop-color='#c8c8cc'/><stop offset='1' stop-color='#5a5a60'/></linearGradient>
      <radialGradient id='tbox' cx='0.5' cy='0.85' r='0.7'><stop offset='0' stop-color='#a0400e'/><stop offset='0.6' stop-color='#3a1406'/><stop offset='1' stop-color='#0e0704'/></radialGradient>
      <clipPath id='twin'><path d='M1046 470 V242 Q1046 182 1100 182 Q1154 182 1154 242 V470Z'/></clipPath>
      ${glow('tfire', '#ff8a2a', 0.65)}${glow('tcan', '#ffc870', 0.5)}${glow('tmoon', '#a8c0ff', 0.3)}
      <radialGradient id='tdark' cx='0.4' cy='0.5' r='0.55'><stop offset='0' stop-color='#0a0603' stop-opacity='0.75'/><stop offset='0.7' stop-color='#0a0603' stop-opacity='0.4'/><stop offset='1' stop-color='#0a0603' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='url(#tp)'/><rect width='1600' height='900' fill='url(#tdark)'/><rect width='1600' height='900' fill='#0a0603' opacity='0.25'/>`;
    // The beams overhead, and what's hung from them to dry.
    out += `<rect width='1600' height='46' fill='#1e1208'/><rect y='40' width='1600' height='14' fill='#2e1c0c'/>${[0, 260, 540, 1060, 1340].map((x) => `<rect x='${x}' y='0' width='40' height='70' fill='#2a1a0c'/><path d='M${x - 30} 70 L${x} 54 M${x + 70} 70 L${x + 40} 54' stroke='#2a1a0c' stroke-width='14'/>`).join('')}`;
    const herbs = (x, len, c) => `<path d='M${x} 54 V${54 + len}' stroke='#8a7a5a' stroke-width='1.5'/><path d='M${x} ${54 + len} l-14 34 M${x} ${54 + len} l-6 38 M${x} ${54 + len} l4 40 M${x} ${54 + len} l12 34 M${x} ${54 + len} l-10 26 M${x} ${54 + len} l9 28' stroke='${c}' stroke-width='4' stroke-linecap='round'/><rect x='${x - 6}' y='${50 + len}' width='12' height='7' fill='#a07a4a'/>`;
    out += herbs(330, 30, '#4a6a32') + herbs(380, 18, '#6a7a3a') + herbs(430, 34, '#5a6a2a') + herbs(1180, 24, '#4a6a32') + herbs(1230, 36, '#7a6a3a');
    out += `<path d='M620 54 V84' stroke='#8a7a5a' stroke-width='1.5'/>${[0, 1, 2, 3, 4].map((k) => `<ellipse cx='${620 + (k % 2 ? 7 : -7)}' cy='${92 + k * 14}' rx='10' ry='9' fill='#e8dcc8'/><path d='M${620 + (k % 2 ? 7 : -7)} ${84 + k * 14} v-5' stroke='#c8b898' stroke-width='2'/>`).join('')}
      <path d='M960 54 V78' stroke='#8a7a5a' stroke-width='2'/><path d='M940 78 Q960 70 980 78 Q994 130 970 168 Q960 176 950 168 Q926 130 940 78Z' fill='#8a3a24'/><path d='M948 90 Q958 130 954 160' stroke='#c87a5a' stroke-width='4' fill='none' opacity='0.6'/>
      <path d='M1420 58 Q1450 96 1480 62 Q1510 100 1540 64' stroke='#7a2a1a' stroke-width='12' fill='none' stroke-linecap='round'/>`;
    // The cartwheel chandelier, its candles lit.
    out += `<ellipse cx='800' cy='130' rx='330' ry='130' fill='url(#tcan)'/><path d='M800 46 V100 M800 100 L700 126 M800 100 L900 126' stroke='#1a1410' stroke-width='3'/>
      <ellipse cx='800' cy='130' rx='110' ry='18' fill='none' stroke='#2a1a10' stroke-width='9'/><path d='M690 130 H910 M800 112 V148' stroke='#2a1a10' stroke-width='5'/>
      ${[-100, -60, -20, 20, 60, 100].map((d) => `<rect x='${796 + d}' y='${108 + Math.abs(d) / 12}' width='8' height='18' fill='#f0e4c8'/><path d='M${800 + d} ${108 + Math.abs(d) / 12} q-5 -8 0 -16 q5 8 0 16Z' fill='#ffd070'/><circle cx='${800 + d}' cy='${100 + Math.abs(d) / 12}' r='10' fill='#ffc870' opacity='0.35'/>`).join('')}`;
    // The plate rail round the walls, pewter on it.
    out += `<rect y='372' width='1600' height='12' fill='#2a1a0c'/><rect y='384' width='1600' height='6' fill='#1a0f06'/>
      ${[200, 1040, 1150].map((x) => `<ellipse cx='${x}' cy='346' rx='26' ry='27' fill='url(#tpew)'/><ellipse cx='${x}' cy='346' rx='16' ry='17' fill='none' stroke='#3a3a40' stroke-width='2'/>`).join('')}
      ${[244, 1096].map((x) => `<path d='M${x} 372 v-34 h26 v34Z' fill='url(#tpew)'/><path d='M${x + 26} 346 q12 0 12 10 q0 10 -12 10' stroke='#8a8a90' stroke-width='4' fill='none'/>`).join('')}`;
    // The hearth: antlers over the mantel, the stone surround, the fire, the pot on its crane.
    out += `<ellipse cx='140' cy='720' rx='420' ry='330' fill='url(#tfire)'/>
      <path d='M60 300 Q40 270 50 236 M60 300 Q70 260 96 248 M60 300 Q96 286 120 300 M50 270 Q30 260 26 240 M200 300 Q220 270 210 236 M200 300 Q190 260 164 248 M200 300 Q164 286 140 300 M210 270 Q230 260 234 240' stroke='#d8c8a8' stroke-width='6' fill='none' stroke-linecap='round'/>
      <path d='M96 296 H164 V340 Q130 372 96 340Z' fill='#4a2e16' stroke='#2a1a0a' stroke-width='3'/><ellipse cx='130' cy='300' rx='22' ry='12' fill='#6a4a2a'/><path d='M86 300 L60 300 M174 300 L200 300' stroke='#d8c8a8' stroke-width='7' stroke-linecap='round'/>
      <rect x='-10' y='470' width='300' height='430' fill='url(#tst)'/><rect x='-10' y='462' width='320' height='30' fill='#4a2e16'/><rect x='-10' y='462' width='320' height='6' fill='#7a5230'/>
      <path d='M30 900 V640 Q30 560 130 560 Q240 560 240 640 V900Z' fill='url(#tbox)'/>
      <path d='M60 860 L210 836 M70 836 L220 862' stroke='#3a1e0c' stroke-width='18' stroke-linecap='round'/>
      <path d='M66 846 Q70 780 96 748 Q102 790 116 770 Q118 720 140 690 Q152 740 162 760 Q176 730 184 716 Q202 776 206 846Z' fill='#ff7a1a'/>
      <path d='M90 846 Q96 800 116 784 Q122 806 134 792 Q142 756 156 740 Q164 790 176 800 Q188 820 186 846Z' fill='#ffb040'/><path d='M112 846 Q118 816 136 806 Q146 820 160 846Z' fill='#fff0a8'/>
      <path d='M44 600 V880 M44 610 H150 M150 610 V650' stroke='#1a1410' stroke-width='6' fill='none'/>
      <path d='M106 660 Q100 720 150 724 Q200 720 194 660Z' fill='#1a1614'/><ellipse cx='150' cy='660' rx='46' ry='10' fill='#2a2420'/><ellipse cx='150' cy='660' rx='38' ry='6' fill='#5a6a30'/>
      ${[0, 1, 2].map((k) => `<path d='M${236 + k * 14} 462 v-${30 + k * 6}' stroke='#e8dcc0' stroke-width='9'/><path d='M${236 + k * 14} ${432 - k * 6} q-4 -8 0 -14 q4 6 0 14Z' fill='#ffd070'/>`).join('')}
      <path d='M30 462 q-6 -30 14 -38 h20 q20 8 14 38Z' fill='#7a4a2a'/><path d='M64 436 q14 0 14 12' stroke='#7a4a2a' stroke-width='4' fill='none'/>`;
    // The rug, and the cat asleep on it (the scenery's character kit: Scenery.kit.critter('cat',
    // { pose: 'sleep', color: '#c07a3a', still: true }), placed at (241, 812), scale 1.3; and its
    // tabby stripes).
    out += `<ellipse cx='300' cy='892' rx='230' ry='26' fill='#6a1a14'/><ellipse cx='300' cy='892' rx='210' ry='20' fill='none' stroke='#c89a3a' stroke-width='3' stroke-dasharray='10 6'/>
      <g transform='translate(241 812) scale(1.3)'><path d='M16 56 Q12 34 40 30 Q66 28 76 40 Q82 54 70 57 H22 Q16 57 16 56Z' fill='#c07a3a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/>${[38, 48, 58].map((x) => `<path d='M${x} 32 q3 10 0 22' stroke='#8a4a1a' stroke-width='2.4' fill='none'/>`).join('')}<path d='M20 55 Q30 62 60 58' fill='none' stroke='#1c1410' stroke-width='8.2' stroke-linecap='round' stroke-linejoin='round'/><path d='M20 55 Q30 62 60 58' fill='none' stroke='#c07a3a' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/><circle cx='74' cy='44' r='11' fill='#c07a3a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M66 38 L66 27 L73 34Z' fill='#c07a3a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M77 34 L83 26 L84 38Z' fill='#c07a3a' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M71 45 q2.4 2 4.8 0 M78.5 45 q2.4 2 4.8 0' stroke='#1c1410' stroke-width='1.3' fill='none' stroke-linecap='round'/></g>`;
    // The window on the night, the moon over the hills and a light at the castle; the sill's candle.
    out += `<ellipse cx='1100' cy='330' rx='200' ry='220' fill='url(#tmoon)'/>
      <path d='M1036 480 V240 Q1036 170 1100 170 Q1164 170 1164 240 V480Z' fill='#1a1008'/><path d='M1046 470 V242 Q1046 182 1100 182 Q1154 182 1154 242 V470Z' fill='url(#tsky)'/>
      <circle cx='1124' cy='232' r='18' fill='#f4ecd0'/><circle cx='1132' cy='226' r='15' fill='url(#tsky)'/>
      ${Array.from({ length: 12 }, () => `<circle cx='${(1052 + rand() * 96).toFixed(0)}' cy='${(196 + rand() * 140).toFixed(0)}' r='${(0.8 + rand()).toFixed(1)}' fill='#fff' opacity='0.8'/>`).join('')}
      <path d='M1046 420 Q1080 380 1110 400 Q1134 384 1154 396 V470 H1046Z' fill='#1a2440'/><path d='M1046 444 Q1090 420 1154 440 V470 H1046Z' fill='#121a30'/>
      <path d='M1108 400 v-26 h6 v-8 h4 v8 h4 v-8 h4 v8 h6 v26Z' fill='#0e1428'/><rect x='1118' y='384' width='4' height='5' fill='#ffd070'/>
      <g stroke='#2a2018' stroke-width='2.5' opacity='0.9' clip-path='url(#twin)'>${[-2, -1, 0, 1, 2, 3, 4, 5].map((k) => `<path d='M1046 ${200 + k * 50} L1154 ${308 + k * 50} M1154 ${200 + k * 50} L1046 ${308 + k * 50}'/>`).join('')}</g>
      <path d='M1046 470 V242 Q1046 182 1100 182 Q1154 182 1154 242 V470Z M1100 182 V470' stroke='#1a1008' stroke-width='7' fill='none'/>
      <rect x='1026' y='478' width='148' height='14' fill='#4a2e16'/><path d='M1140 478 v-30 q0 -6 4 -8 v-8 h4 v8 q4 2 4 8 v30Z' fill='#2f5a3a'/><path d='M1146 432 v-10' stroke='#f0e4c8' stroke-width='4'/><path d='M1146 422 q-4 -7 0 -13 q4 6 0 13Z' fill='#ffd070'/><circle cx='1146' cy='416' r='14' fill='#ffc870' opacity='0.3'/>`;
    // The notice board.
    out += `<rect x='1036' y='512' width='130' height='104' fill='#5a3a1e'/><rect x='1042' y='518' width='118' height='92' fill='#a07a4a'/>
      <g font-family='Georgia, serif' text-anchor='middle' fill='#3a2010'><g transform='rotate(-5 1072 556)'><rect x='1048' y='524' width='52' height='62' fill='#e8d8b0'/><text x='1074' y='538' font-size='10' font-weight='700'>WANTED</text>
        <path d='M1058 566 q6 -14 16 -10 q4 -10 14 -6 l-6 6 q8 4 2 12 q-10 2 -14 -2 q-6 6 -12 0Z' fill='#5a7a3a'/><text x='1074' y='580' font-size='7'>500 GOLD</text></g>
        <g transform='rotate(4 1130 548)'><rect x='1108' y='524' width='46' height='40' fill='#f0e4c8'/><text x='1131' y='540' font-size='8' font-weight='700'>ROOMS</text><text x='1131' y='554' font-size='7'>2 copper</text></g>
        <g transform='rotate(-2 1130 590)'><rect x='1106' y='570' width='48' height='34' fill='#e0d0a8'/><text x='1130' y='584' font-size='7' font-weight='700'>LOST:</text><text x='1130' y='596' font-size='7'>one sheep</text></g></g>
      ${[[1074, 526], [1131, 526], [1130, 572]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='2.5' fill='#3a3a40'/>`).join('')}`;
    // The casks on their rack behind the counter.
    out += `<ellipse cx='1360' cy='760' rx='380' ry='200' fill='url(#tcan)'/><path d='M1190 860 V620 M1590 860 V620 M1190 720 H1600' stroke='#2a1a0c' stroke-width='14'/>`;
    const cask = (x, y, r) => `<circle cx='${x}' cy='${y}' r='${r}' fill='url(#tcask)'/><circle cx='${x}' cy='${y}' r='${r}' fill='none' stroke='#2a2420' stroke-width='7'/><circle cx='${x}' cy='${y}' r='${r * 0.78}' fill='none' stroke='#3a2a1a' stroke-width='2'/>
      ${[-0.5, 0, 0.5].map((k) => `<path d='M${x - r * 0.9} ${y + k * r} H${x + r * 0.9}' stroke='#3a2410' stroke-width='2' opacity='0.5'/>`).join('')}<rect x='${x - 6}' y='${y + r * 0.3}' width='12' height='18' fill='#8a6a3a'/><path d='M${x} ${y + r * 0.3 + 18} v10' stroke='#c8a050' stroke-width='4'/>`;
    out += cask(1290, 650, 70) + cask(1440, 650, 70) + cask(1260, 790, 78) + cask(1430, 790, 78) + cask(1580, 790, 70);
    out += `<g font-family='Georgia, serif' font-weight='700' font-size='16' text-anchor='middle' fill='#f0dca8' opacity='0.8'><text x='1290' y='636'>ALE</text><text x='1440' y='636'>MEAD</text><text x='1260' y='776'>STOUT</text><text x='1430' y='776'>CIDER</text></g>`;
    // The counter, and what's on it.
    out += `<rect x='1010' y='812' width='590' height='22' fill='#7a4c26'/><rect x='1010' y='808' width='590' height='6' fill='#a87040'/><rect x='1016' y='834' width='584' height='66' fill='#3a2410'/>
      ${[1060, 1200, 1340, 1480].map((x) => `<path d='M${x} 834 V900' stroke='#1a0f06' stroke-width='5'/><circle cx='${x - 18}' cy='850' r='3' fill='#1a1410'/>`).join('')}
      <g transform='translate(190 0)'><path d='M1040 808 v-40 q0 -6 6 -6 h28 q6 0 6 6 v40Z' fill='url(#tpew)'/><path d='M1080 774 q16 0 16 14 q0 14 -16 14' stroke='#8a8a90' stroke-width='5' fill='none'/><ellipse cx='1060' cy='764' rx='22' ry='6' fill='#fff8e8'/>
      <path d='M1110 808 Q1104 776 1150 770 Q1196 776 1190 808Z' fill='#c8904a'/><path d='M1124 784 l14 -6 M1144 780 l14 -6 M1164 782 l12 -4' stroke='#8a5a2a' stroke-width='3'/>
      <path d='M1204 808 v-26 h44 v26Z' fill='#f0c850'/><path d='M1204 782 l22 -10 l22 10Z' fill='#ffe080'/><circle cx='1222' cy='796' r='4' fill='#d8a830'/></g>
      <path d='M1550 808 v-34 q0 -10 8 -14 v-14 h8 v14 q8 4 8 14 v34Z' fill='#2f4a2a'/><path d='M1562 746 v-12' stroke='#f0e4c8' stroke-width='5'/><path d='M1562 734 q-5 -8 0 -15 q5 7 0 15Z' fill='#ffd070'/><circle cx='1562' cy='726' r='18' fill='#ffc870' opacity='0.3'/>
      ${[0, 1, 2].map((k) => `<ellipse cx='${1500 + k * 7}' cy='${806 - k * 4}' rx='9' ry='3' fill='#d8b040'/>`).join('')}`;
    // The flagstone floor, rushes strewn on it.
    out += `<rect y='880' width='1010' height='20' fill='#1a1410'/>`;
    for (let i = 0; i < 16; i++) { const x = 380 + rand() * 600; out += `<path d='M${x.toFixed(0)} ${(884 + rand() * 14).toFixed(0)} l${(20 + rand() * 30).toFixed(0)} ${(rand() * 6 - 3).toFixed(0)}' stroke='#8a7a4a' stroke-width='2' opacity='0.5'/>`; }
    return scene(out);
  }

  // The club: a black box under a lighting truss, the moving heads throwing coloured beams down
  // through the haze, the mirror ball tucked up under the truss, sparkles all over the walls. On
  // the left a VIP sign and the speaker stack; in the gap the back bar, its bottles lit cyan from
  // under the shelves, BOTTLE SERVICE in neon over it; along the bottom right the DJ booth, its
  // front a wall of level meters, decks and a laptop on top; the dance floor along the bottom.
  function clubFloor() {
    const rand = seeded(53);
    let out = `<defs>
      <pattern id='chx' width='60' height='104' patternUnits='userSpaceOnUse'><path d='M30 0 L60 17 V52 L30 69 L0 52 V17Z M30 69 V104 M0 52 L-30 69 M60 52 L90 69' fill='none' stroke='#9b5cff' stroke-opacity='0.07' stroke-width='2'/></pattern>
      <linearGradient id='ceq' x1='0' y1='892' x2='0' y2='790' gradientUnits='userSpaceOnUse'><stop offset='0.45' stop-color='#29f0ff'/><stop offset='0.5' stop-color='#ffd23f'/><stop offset='0.7' stop-color='#ffd23f'/><stop offset='0.75' stop-color='#ff2bd6'/></linearGradient>
      <pattern id='cseg' width='20' height='11' patternUnits='userSpaceOnUse' y='781'><rect width='20' height='3' fill='#0c0a14'/></pattern>
      <linearGradient id='cfl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2a0a3a'/><stop offset='1' stop-color='#0a0414'/></linearGradient>
      ${glow('cmag', '#ff2bd6', 0.45)}${glow('ccy', '#29f0ff', 0.4)}${glow('cpur', '#9b5cff', 0.45)}
      <radialGradient id='cball' cx='0.35' cy='0.3' r='0.75'><stop offset='0' stop-color='#ffffff'/><stop offset='0.4' stop-color='#b8c0d8'/><stop offset='1' stop-color='#3a3a58'/></radialGradient>
      <radialGradient id='cdark' cx='0.4' cy='0.5' r='0.55'><stop offset='0' stop-color='#030208' stop-opacity='0.8'/><stop offset='0.7' stop-color='#030208' stop-opacity='0.4'/><stop offset='1' stop-color='#030208' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='#07060d'/><rect width='1600' height='900' fill='url(#chx)'/>
      <ellipse cx='800' cy='900' rx='1000' ry='300' fill='url(#cpur)'/>`;
    // Beams from the moving heads, crossing in the haze.
    const beam = (x, a, c, w = 70) => { const r = (a * Math.PI) / 180; const L = 1000; const ex = x + Math.sin(r) * L; const ey = 64 + Math.cos(r) * L; const nx = Math.cos(r) * w; const ny = -Math.sin(r) * w; return `<path d='M${x - 6} 64 L${(ex - nx).toFixed(0)} ${(ey - ny).toFixed(0)} L${(ex + nx).toFixed(0)} ${(ey + ny).toFixed(0)} L${x + 6} 64Z' fill='${c}' opacity='0.16'/><path d='M${x - 3} 64 L${(ex - nx / 3).toFixed(0)} ${(ey - ny / 3).toFixed(0)} L${(ex + nx / 3).toFixed(0)} ${(ey + ny / 3).toFixed(0)} L${x + 3} 64Z' fill='${c}' opacity='0.12'/>`; };
    out += beam(120, -22, '#ff2bd6') + beam(120, 18, '#29f0ff') + beam(430, -30, '#9b5cff') + beam(1170, 34, '#ff2bd6') + beam(1480, 20, '#29f0ff') + beam(1480, -26, '#ff2bd6');
    out += `<rect width='1600' height='900' fill='url(#cdark)'/>`;
    // Sparkles off the ball, scattered on the walls.
    for (let i = 0; i < 46; i++) out += `<circle cx='${(rand() * 1600).toFixed(0)}' cy='${(90 + rand() * 700).toFixed(0)}' r='${(1 + rand() * 2.2).toFixed(1)}' fill='${pick(rand, ['#ff2bd6', '#29f0ff', '#ffffff', '#9b5cff'])}' opacity='${(0.25 + rand() * 0.5).toFixed(2)}'/>`;
    // The truss: two rails and the zigzag between, the heads hung under it.
    out += `<rect width='1600' height='18' fill='#030206'/><path d='M0 26 H1600 M0 56 H1600' stroke='#4a4a58' stroke-width='5'/>
      <path d='${Array.from({ length: 54 }, (_, i) => `${i ? 'L' : 'M'}${i * 30} ${i % 2 ? 56 : 26}`).join(' ')}' stroke='#3a3a48' stroke-width='3' fill='none'/>
      ${[120, 430, 1170, 1480].map((x) => `<rect x='${x - 16}' y='56' width='32' height='10' fill='#2a2a34'/><path d='M${x - 18} 66 h36 l-6 18 h-24Z' fill='#1a1a22'/><ellipse cx='${x}' cy='84' rx='10' ry='4' fill='#fff' opacity='0.9'/>`).join('')}
      <path d='M800 56 V88' stroke='#8a8a98' stroke-width='2'/><circle cx='800' cy='112' r='26' fill='url(#cball)'/><path d='M776 104 H824 M774 114 H826 M778 124 H822 M792 87 V137 M808 87 V137' stroke='#2a2a40' stroke-width='1.2' opacity='0.6'/><circle cx='792' cy='104' r='4' fill='#fff'/><circle cx='800' cy='112' r='60' fill='#fff' opacity='0.05'/>`;
    // Left: the VIP sign; the speaker stack in the corner.
    const neon = (x, y, t, c, size, core = '#fff') => `<text x='${x}' y='${y}' font-size='${size}' text-anchor='middle' fill='none' stroke='${c}' stroke-width='${size / 6}' stroke-opacity='0.3'>${t}</text><text x='${x}' y='${y}' font-size='${size}' text-anchor='middle' fill='none' stroke='${core}' stroke-width='${size / 22}'>${t}</text>`;
    out += `<ellipse cx='84' cy='230' rx='150' ry='100' fill='url(#cmag)'/><g font-family='Arial Black, Arial, sans-serif' font-weight='900'>${neon(84, 254, 'VIP', '#ff2bd6', 64, '#ffc8f4')}</g>
      <path d='M30 276 h96 l-12 -10 M126 276 l-12 10' stroke='#ffc8f4' stroke-width='3' fill='none'/>`;
    const spk = (x, y, w, h) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='4' fill='#0e0e14' stroke='#24242e' stroke-width='3'/>${h > w * 0.9 ? `<circle cx='${x + w / 2}' cy='${y + h * 0.62}' r='${w * 0.34}' fill='#1a1a24' stroke='#3a3a48' stroke-width='3'/><circle cx='${x + w / 2}' cy='${y + h * 0.62}' r='${w * 0.12}' fill='#2a2a38'/><circle cx='${x + w / 2}' cy='${y + h * 0.2}' r='${w * 0.12}' fill='#1a1a24' stroke='#3a3a48' stroke-width='2'/>` : `<circle cx='${x + w * 0.3}' cy='${y + h / 2}' r='${h * 0.32}' fill='#1a1a24' stroke='#3a3a48' stroke-width='3'/><circle cx='${x + w * 0.7}' cy='${y + h / 2}' r='${h * 0.32}' fill='#1a1a24' stroke='#3a3a48' stroke-width='3'/>`}`;
    out += spk(4, 560, 146, 120) + spk(4, 684, 146, 216) + `<path d='M150 900 V560' stroke='#29f0ff' stroke-width='2' opacity='0.5'/>`;
    // The back bar in the gap: neon over it, bottles on lit glass shelves.
    out += `<ellipse cx='1100' cy='360' rx='220' ry='300' fill='url(#ccy)'/><rect x='1030' y='230' width='140' height='390' fill='#0a0c14'/>
      <g font-family='Arial Black, Arial, sans-serif' font-weight='900'>${neon(1100, 176, 'BOTTLE', '#ff2bd6', 30, '#ffd0f6')}${neon(1100, 210, 'SERVICE', '#29f0ff', 26, '#d0fcff')}</g>`;
    for (const y of [330, 440, 550]) {
      out += `<rect x='1030' y='${y}' width='140' height='5' fill='#9ff8ff'/><rect x='1030' y='${y + 5}' width='140' height='24' fill='#29f0ff' opacity='0.12'/>`;
      for (let x = 1036; x < 1160; x += 20 + rand() * 6) out += bottle(x, y, 60 + rand() * 30, pick(rand, ['#1a3a2a', '#3a1a3a', '#1a2a4a', '#4a3a10', '#2a1a1a']), 14);
    }
    // The DJ booth: its front all level meters, the decks and the laptop on top; a stack beside.
    out += `<ellipse cx='1330' cy='800' rx='360' ry='160' fill='url(#cmag)'/>
      <rect x='1070' y='760' width='430' height='14' rx='4' fill='#2a2a34'/><rect x='1080' y='774' width='410' height='126' fill='#0c0a14' stroke='#2a2040' stroke-width='3'/>`;
    for (let c = 0; c < 16; c++) out += `<rect x='${(1094 + c * 24.5).toFixed(0)}' y='${(892 - (3 + Math.floor(rand() * 6)) * 11).toFixed(0)}' width='18' height='120' fill='url(#ceq)'/>`;
    out += `<rect x='1086' y='780' width='400' height='114' fill='url(#cseg)'/>`;
    out += `${[1140, 1380].map((x) => `<rect x='${x - 50}' y='738' width='100' height='24' rx='4' fill='#1a1a22'/><ellipse cx='${x}' cy='746' rx='36' ry='7' fill='#0a0a0e' stroke='#4a4a58' stroke-width='2'/><ellipse cx='${x}' cy='746' rx='8' ry='2' fill='#ff2bd6'/>`).join('')}
      <rect x='1222' y='742' width='76' height='20' rx='3' fill='#24242e'/>${[0, 1, 2, 3].map((k) => `<circle cx='${1234 + k * 17}' cy='752' r='4' fill='#4a4a58'/>`).join('')}
      <path d='M1250 738 l14 -40 h48 l-6 40Z' fill='#2a2a34'/><path d='M1268 700 h40 l-5 32 h-42Z' fill='#9ff8ff' opacity='0.35'/>`;
    out += spk(1500, 560, 100, 110) + spk(1500, 672, 100, 228);
    // The dance floor: lit squares.
    out += `<rect y='862' width='1080' height='38' fill='url(#cfl)'/>`;
    for (let i = 0; i < 26; i++) for (let r = 0; r < 2; r++) if (rand() < 0.45) out += `<rect x='${150 + i * 36}' y='${864 + r * 18}' width='34' height='16' fill='${pick(rand, ['#ff2bd6', '#29f0ff', '#9b5cff', '#ffd23f'])}' opacity='${(0.18 + rand() * 0.25).toFixed(2)}'/>`;
    return scene(out);
  }

  // The great hall of the castle by night, drawn in perspective: the hall runs away from us to a
  // vanishing point behind the TV's table, so its lines are seen round the edges (the hammer-beam
  // roof's trusses along the top, the piers and cut stone of the walls either side, the flagstones
  // along the bottom). On the left a tall lancet window throws moonlight across the floor; on the
  // pier by it a shield and crossed swords over a torch; below, a suit of plate armour on its
  // stand with his halberd, and the end of the trestle table laid for the feast. Up top, the ring
  // of candles and the beam the court's banners hang from (each player's, on the TV). In the gap,
  // the other window (the moon over the mountains, a dragon far off) with a torch by it, and the
  // dais and the throne (a crown left on its cushion), the carpet running up the hall to it, the
  // king's jug and goblet on a stool; along the bottom right the great fireplace, the wolfhound
  // asleep before it. (Where things are, for the TV's scenery: see SCENES.castle.)
  function greatHall() {
    const rand = seeded(61);
    // The hall in metres: X across (the walls at WL and WR), Y up from the floor (the roof from
    // TOP), Z away from us (the end wall at WB), seen from EYE up and looking down the hall to the
    // vanishing point (640, 440). xy() is where a point is on the 1600 x 900.
    const EYE = 2.67;
    const WL = -4.73;
    const WR = 6.73;
    const WB = 16.7;
    const TOP = 7.5;
    const r1 = (v) => Math.round(v * 10) / 10;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const xy = (X, Y, Z) => [Math.round(640 + (1000 * X) / Z), Math.round(440 + (1000 * (EYE - Y)) / Z)];
    const P = (X, Y, Z) => xy(X, Y, Z).join(' ');
    const quad = (...pts) => `M${pts.map((p) => P(...p)).join('L')}Z`;
    // Drawn flat across the hall at Z, in metres (up is -Y).
    const flat = (Z) => `transform='translate(640 ${r1(440 + (1000 * EYE) / Z)}) scale(${r3(1000 / Z)})'`;
    // Drawn on a side wall at X, in a box 100 x 100 from Z0 to Z1 and up from y0 to y1 (near enough).
    const onWall = (X, Z0, Z1, y0, y1) => {
      const [ax, ay] = xy(X, y1, Z0);
      const [bx, by] = xy(X, y1, Z1);
      const [cx, cy] = xy(X, y0, Z0);
      return `transform='matrix(${r3((bx - ax) / 100)} ${r3((by - ay) / 100)} ${r3((cx - ax) / 100)} ${r3((cy - ay) / 100)} ${ax} ${ay})'`;
    };
    // Under the TV's table (not worth drawing in detail).
    const under = (x, y) => ((x - 588) / 450) ** 2 + ((y - 480) / 300) ** 2 < 1;
    // The outline round some points (a shaft of moonlight from a window to its patch on the floor).
    const hull = (pts) => {
      const ps = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const side = (list) => { const h = []; for (const p of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
      return `M${[...side(ps), ...side(ps.slice().reverse())].map((p) => p.join(' ')).join('L')}Z`;
    };
    // A pointed window in a side wall at X, from Z0 to Z1: the sill at y0, the arch springing at y1
    // to its point at ya.
    const lancet = (X, Z0, Z1, y0, y1, ya) => {
      const c = y1 + (ya - y1) * 0.7;
      return `M${P(X, y0, Z0)}L${P(X, y1, Z0)}Q${P(X, c, Z0)} ${P(X, ya, (Z0 + Z1) / 2)}Q${P(X, c, Z1)} ${P(X, y1, Z1)}L${P(X, y0, Z1)}Z`;
    };
    // Its stone: the mullion and transom, the cusped heads of its two lights, the frame.
    const tracery = (X, Z0, Z1, y0, y1, ya, t) => {
      const Zm = (Z0 + Z1) / 2;
      const head = (a, b) => `M${P(X, y1 - 0.25, a)}Q${P(X, y1 + 0.12, a)} ${P(X, y1 + 0.22, (a + b) / 2)}Q${P(X, y1 + 0.12, b)} ${P(X, y1 - 0.25, b)}`;
      return `<path d='M${P(X, y0, Zm)}L${P(X, ya - 0.35, Zm)}M${P(X, t, Z0)}L${P(X, t, Z1)}${head(Z0, Zm)}${head(Zm, Z1)}' stroke='#4e4a5a' stroke-width='3.5' fill='none'/><path d='${lancet(X, Z0, Z1, y0, y1, ya)}' stroke='#55515f' stroke-width='6' fill='none'/><path d='${lancet(X, Z0, Z1, y0, y1, ya)}' stroke='#0e0d12' stroke-width='1.2' fill='none'/>`;
    };
    // A torch in its iron sconce, the cup's rim at (x, y), k times life size (its flame flickers on the TV).
    const FLAME = `<path d='M0 -6 q-12 -14 -4 -32 q2 9 5 5 q2 -12 9 -18 q5 20 -2 30 q4 -2 5 -5 q4 12 -13 20Z' fill='#ffa040'/><path d='M0 -8 q-5 -9 0 -18 q5 9 0 18Z' fill='#fff0a8'/>`;
    const torch = (x, y, k) => `<g transform='translate(${x} ${y}) scale(${k})'><ellipse cx='0' cy='-10' rx='110' ry='110' fill='url(#ktorch)'/><path d='M-7 30 L0 12 L7 30 M0 16 V40 M-10 40 H10' stroke='#14131a' stroke-width='3.5' fill='none'/><path d='M-9 0 H9 L5 17 H-5Z' fill='#2a2630' stroke='#0e0d12' stroke-width='1.5'/><path d='M-9 5 H9 M-7 10 H7' stroke='#4a4656'/><path d='M-6 0 q-3 -6 2 -8 h8 q5 2 2 8Z' fill='#3a2a1a'/>${FLAME}</g>`;
    // Cut stone on a side wall at X: courses that run to the vanishing point, the joints staggered,
    // a stone here and there lighter or darker (only where it can be seen).
    const stones = (X, seen) => {
      let lines = '';
      let lite = '';
      let dark = '';
      for (let Y = 0.5; Y < TOP; Y += 0.5) lines += `M${P(X, Y, 5.5)}L${P(X, Y, WB)}`;
      for (let Y = 0; Y < TOP - 0.1; Y += 0.5) {
        let Z = 5.5 + rand() * 0.9;
        while (Z < WB) {
          const Z1 = Math.min(WB, Z + 0.7 + rand() * 0.7);
          if (seen(...xy(X, Y + 0.25, Z))) {
            lines += `M${P(X, Y, Z)}V${xy(X, Y + 0.5, Z)[1]}`;
            const t = rand();
            // (Its ends are upright: M, V, L, V.)
            const q = `M${P(X, Y, Z)}V${xy(X, Y + 0.5, Z)[1]}L${P(X, Y + 0.5, Z1)}V${xy(X, Y, Z1)[1]}Z`;
            if (t < 0.2) lite += q;
            else if (t < 0.4) dark += q;
          }
          Z = Z1;
        }
      }
      return `<path d='${lite}' fill='#4a4756' opacity='0.45'/><path d='${dark}' fill='#08070b' opacity='0.4'/><path d='${lines}' stroke='#100f14' stroke-width='2.2' fill='none'/>`;
    };
    // A pier standing out from the wall at X (its front at F) from Z0 to Z1: the front, and the side
    // that faces us, coursed.
    const pier = (X, F, Z0, Z1) => {
      let c = '';
      for (let Y = 0.5; Y < TOP; Y += 0.5) c += `M${P(F, Y, Z0)}L${P(F, Y, Z1)}`;
      return `<path d='${quad([F, 0, Z0], [F, 0, Z1], [F, TOP, Z1], [F, TOP, Z0])}' fill='#393744'/><path d='${quad([X, 0, Z0], [F, 0, Z0], [F, TOP, Z0], [X, TOP, Z0])}' fill='#302e3a'/><path d='${c}' stroke='#14131a' stroke-width='1.6'/><path d='M${P(F, 0, Z0)}L${P(F, TOP, Z0)}' stroke='#5a5668' stroke-width='2'/>`;
    };
    const R = [1, 11.5]; // the ridge
    let out = `<defs>
      <linearGradient id='kgold' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f6dc7a'/><stop offset='0.5' stop-color='#d4af37'/><stop offset='1' stop-color='#7a5a14'/></linearGradient>
      <linearGradient id='kst' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#2a2e36'/><stop offset='0.3' stop-color='#9aa2ae'/><stop offset='0.44' stop-color='#eef1f5'/><stop offset='0.62' stop-color='#78808c'/><stop offset='1' stop-color='#22262e'/></linearGradient>
      <linearGradient id='kwood' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#2a160a'/><stop offset='0.5' stop-color='#6a3e1c'/><stop offset='1' stop-color='#24120a'/></linearGradient>
      <linearGradient id='ksky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0a1028'/><stop offset='1' stop-color='#3a4c80'/></linearGradient>
      <linearGradient id='kbeam' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#b4c8ff' stop-opacity='0.16'/><stop offset='1' stop-color='#b4c8ff' stop-opacity='0.03'/></linearGradient>
      <linearGradient id='kfl' gradientUnits='userSpaceOnUse' x1='0' y1='600' x2='0' y2='900'><stop offset='0' stop-color='#141319'/><stop offset='1' stop-color='#2c2932'/></linearGradient>
      <linearGradient id='kroof' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='0' y2='200'><stop offset='0' stop-color='#060408'/><stop offset='1' stop-color='#1e150e'/></linearGradient>
      <pattern id='kbw' width='3.2' height='1' patternUnits='userSpaceOnUse'><rect width='3.2' height='1' fill='#121117'/><rect x='0.03' y='0.03' width='0.94' height='0.44' rx='0.04' fill='#34323d'/><rect x='1.03' y='0.03' width='0.74' height='0.44' rx='0.04' fill='#2c2a34'/><rect x='1.83' y='0.03' width='1.34' height='0.44' rx='0.04' fill='#3a3843'/><rect x='-0.37' y='0.53' width='0.74' height='0.44' rx='0.04' fill='#302d38'/><rect x='2.83' y='0.53' width='0.74' height='0.44' rx='0.04' fill='#302d38'/><rect x='0.43' y='0.53' width='1.04' height='0.44' rx='0.04' fill='#3d3a46'/><rect x='1.53' y='0.53' width='0.84' height='0.44' rx='0.04' fill='#2e2c36'/><rect x='2.43' y='0.53' width='0.34' height='0.44' rx='0.04' fill='#36343f'/></pattern>
      <pattern id='klead' width='9' height='14' patternUnits='userSpaceOnUse'><path d='M0 7 L4.5 0 L9 7 L4.5 14Z' fill='none' stroke='#0a0e1c' stroke-width='0.9'/></pattern>
      ${glow('ktorch', '#ff8c28', 0.5)}${glow('kmoon', '#9ab4ff', 0.3)}${glow('kcan', '#ffc870', 0.4)}${glow('kfire', '#ff7a20', 0.55)}
      <radialGradient id='kdark' cx='0.37' cy='0.53' r='0.5'><stop offset='0' stop-color='#07060a' stop-opacity='0.8'/><stop offset='0.7' stop-color='#07060a' stop-opacity='0.4'/><stop offset='1' stop-color='#07060a' stop-opacity='0'/></radialGradient>
      <g id='kth'><path d='M-4.73 -5.2 h0.55 l-0.1 0.38 q-0.2 0.26 -0.45 0.2Z' fill='#4a4652'/><g fill='#3b2616'><rect x='-4.28' y='-7.5' width='0.34' height='2.3'/><rect x='-4.73' y='-7.74' width='1.62' height='0.3'/><rect x='-3.44' y='-9.2' width='0.26' height='1.6'/><rect x='-1.05' y='-10.62' width='2.05' height='0.26'/><path d='M-3.44 -7.44 h0.26 l-0.04 0.34 l-0.09 0.2 l-0.09 -0.2Z'/></g>
        <path d='M-3.94 -5.5 Q-3.9 -7 -3.2 -7.3 M-3.31 -8.5 Q-2.6 -10.3 -1 -10.5 M-4.73 -7.6 L1 -11.6' stroke='#3b2616' stroke-width='0.24' fill='none'/><path d='M-4.73 -7.45 H-3.12 M-3.18 -7.6 V-9.2 M-3.94 -5.3 V-7.4' stroke='#8a5a30' stroke-width='0.04'/><circle cx='-3.31' cy='-6.96' r='0.07' fill='#d4af37'/></g>
      <g id='ktr'><use href='#kth'/><use href='#kth' transform='translate(2 0) scale(-1 1)'/></g>
      <clipPath id='klw'><path d='${lancet(WL, 7.9, 9.1, 2.7, 5.2, 5.9)}'/></clipPath><clipPath id='krw'><path d='${lancet(WR, 13, 15.6, 2.6, 6.8, 7.4)}'/></clipPath>
      <clipPath id='ksh'><path d='M-0.22 -0.28 H0.22 V-0.02 Q0.22 0.2 0 0.3 Q-0.22 0.2 -0.22 -0.02Z'/></clipPath></defs>
      <rect width='1600' height='900' fill='#141319'/>`;
    // The roof: its two slopes, boarded, the purlins running down the hall.
    let boards = '';
    let purlins = '';
    for (const [X0, Y0] of [[WL, TOP], [WR, TOP]]) {
      for (let t = 0.06; t < 1; t += 0.07) boards += `M${P(X0 + (R[0] - X0) * t, Y0 + (R[1] - Y0) * t, 5)}L${P(X0 + (R[0] - X0) * t, Y0 + (R[1] - Y0) * t, WB)}`;
      for (const t of [0.22, 0.5, 0.78]) { const X = X0 + (R[0] - X0) * t; const Y = Y0 + (R[1] - Y0) * t; purlins += quad([X, Y, 5], [X, Y, WB], [X, Y - 0.28, WB], [X, Y - 0.28, 5]); }
    }
    out += `<path d='${quad([WL, TOP, 5], [WL, TOP, WB], [...R, WB], [...R, 5])}${quad([WR, TOP, 5], [WR, TOP, WB], [...R, WB], [...R, 5])}' fill='url(#kroof)'/><path d='${boards}' stroke='#000' stroke-width='1.5' opacity='0.5'/><path d='${purlins}' fill='#2a1b10'/>`;
    // The end wall, its gable up under the roof; a tapestry either side.
    const tap = (x0, x1, y0, y1, c, charge) => `<rect x='${x0 - 0.1}' y='${-y1 - 0.08}' width='${r3(x1 - x0 + 0.2)}' height='0.08' fill='#5a3d1e'/><path d='M${x0} ${-y1} H${x1} V${-y0 - 0.25} L${r3((x0 + x1) / 2)} ${-y0} L${x0} ${-y0 - 0.25}Z' fill='${c}' stroke='#d4af37' stroke-width='0.05'/>${charge}`;
    out += `<g ${flat(WB)}><path d='M${WL} 0 V${-TOP} L${R[0]} ${-R[1]} L${WR} ${-TOP} V0Z' fill='url(#kbw)'/><path d='M${WL} 0 V${-TOP} L${R[0]} ${-R[1]} L${WR} ${-TOP} V0Z' fill='#07060a' opacity='0.3'/>
      ${tap(4.3, 5.8, 3.3, 7, '#1b3f8e', `<path d='M4.7 -4.3 V-5.5 h0.12 v0.18 h0.12 v-0.18 h0.12 v0.18 h0.12 v-0.18 h0.12 v0.18 h0.12 v-0.18 h0.12 V-4.3Z' fill='#d4af37'/><path d='M5 -4.3 v-0.4 q0.05 -0.15 0.1 0 v0.4Z' fill='#1b3f8e'/>`)}
      ${tap(-4.25, -3.1, 3.6, 6.9, '#8c1423', `<path d='M-4.05 -6.6 L-3.3 -4.6 M-3.3 -6.6 L-4.05 -4.6' stroke='#d4af37' stroke-width='0.12'/>`)}</g>`;
    // The side walls in cut stone, the timber plate along their tops.
    out += `<path d='${quad([WL, 0, 5], [WL, 0, WB], [WL, TOP, WB], [WL, TOP, 5])}${quad([WR, 0, 5], [WR, 0, WB], [WR, TOP, WB], [WR, TOP, 5])}' fill='#2b2933'/>`;
    out += stones(WL, (x, y) => x < 150 || (y < 260 && x < 360)) + stones(WR, (x) => x > 1040 && x < 1610);
    out += `<path d='${quad([WL, TOP - 0.3, 5], [WL, TOP - 0.3, WB], [WL, TOP, WB], [WL, TOP, 5])}${quad([WR, TOP - 0.3, 5], [WR, TOP - 0.3, WB], [WR, TOP, WB], [WR, TOP, 5])}' fill='#24170e'/>`;
    // The floor: flagstones laid across the hall, a few lighter or darker.
    const zs = [WB, 15, 13.5, 12.2, 11.1, 10.1, 9.3, 8.6, 8, 7.45, 6.95, 6.5, 6.1, 5.75, 5.4];
    let flags = '';
    let fa = '';
    let fb = '';
    zs.forEach((z, i) => {
      if (!i) return;
      const z0 = zs[i - 1];
      flags += `M${P(WL, 0, z)}L${P(WR, 0, z)}`;
      for (let X = WL + (i % 2 ? 0.55 : 0); X < WR; X += 1.1) {
        if (under(...xy(X, 0, z)) && under(...xy(X, 0, z0))) continue;
        const X1 = Math.min(WR, X + 1.1);
        flags += `M${P(X, 0, z0)}L${P(X, 0, z)}`;
        const t = rand();
        if (t < 0.2) fa += quad([X, 0, z0], [X1, 0, z0], [X1, 0, z], [X, 0, z]);
        else if (t < 0.36) fb += quad([X, 0, z0], [X1, 0, z0], [X1, 0, z], [X, 0, z]);
      }
    });
    out += `<path d='${quad([WL, 0, 4.5], [WL, 0, WB], [WR, 0, WB], [WR, 0, 4.5])}' fill='url(#kfl)'/><path d='${fa}' fill='#3e3b46' opacity='0.5'/><path d='${fb}' fill='#060508' opacity='0.4'/><path d='${flags}' stroke='#0a090d' stroke-width='2' fill='none'/>`;
    // The carpet, up the hall to the dais.
    let dia = '';
    for (let z = 15.6; z > 7; z -= 1.15) dia += quad([2.9, 0, z + 0.32], [3.18, 0, z], [2.9, 0, z - 0.32], [2.62, 0, z]);
    out += `<path d='${quad([2.3, 0, WB], [3.5, 0, WB], [3.5, 0, 5.6], [2.3, 0, 5.6])}' fill='#6a0e1c'/><path d='${quad([2.38, 0, WB], [2.44, 0, WB], [2.44, 0, 5.6], [2.38, 0, 5.6])}${quad([3.36, 0, WB], [3.42, 0, WB], [3.42, 0, 5.6], [3.36, 0, 5.6])}${dia}' fill='#d4af37' opacity='0.5'/>`;
    // The middle of the room kept dark (for the phones' cards).
    out += `<rect width='1600' height='900' fill='url(#kdark)'/>`;
    // The windows, and the moonlight through them across the floor (each light's patch, with the
    // shadows of the mullion and transom in it).
    const moon = (X, Z0, Z1, y0, y1, ya, t, dx) => {
      const fl = (Y, Z) => xy(X + dx * Y / 1.1, 0, Z - 0.13 * Y);
      const Zm = (Z0 + Z1) / 2;
      const pts = [[y0, Z0], [y1, Z0], [ya, Zm], [y1, Z1], [y0, Z1]];
      return `<path d='${hull([...pts.map(([Y, Z]) => xy(X, Y, Z)), ...pts.map(([Y, Z]) => fl(Y, Z))])}' fill='url(#kbeam)'/><path d='M${pts.map(([Y, Z]) => fl(Y, Z).join(' ')).join('L')}Z' fill='#a8c0ff' opacity='0.12'/><path d='M${fl(y0, Zm).join(' ')}L${fl(ya - 0.35, Zm).join(' ')}M${fl(t, Z0).join(' ')}L${fl(t, Z1).join(' ')}' stroke='#0c0b10' stroke-width='5' opacity='0.3'/>`;
    };
    // On the left: the sky through leaded glass, the far reveal and the sill.
    out += `<ellipse cx='80' cy='250' rx='200' ry='300' fill='url(#kmoon)'/><path d='${lancet(WL, 7.9, 9.1, 2.7, 5.2, 5.9)}' fill='url(#ksky)'/><g clip-path='url(#klw)'><ellipse cx='60' cy='140' rx='60' ry='110' fill='#cfe0ff' opacity='0.22'/><rect x='30' y='40' width='100' height='420' fill='url(#klead)'/></g>
      <path d='${quad([WL, 2.7, 9.1], [WL - 0.14, 2.7, 9.1], [WL - 0.14, 5.2, 9.1], [WL, 5.2, 9.1])}' fill='#1e1c24'/><path d='${quad([WL, 2.7, 7.9], [WL, 2.7, 9.1], [WL + 0.14, 2.62, 9.1], [WL + 0.14, 2.62, 7.9])}' fill='#4a4656'/>${tracery(WL, 7.9, 9.1, 2.7, 5.2, 5.9, 4.1)}`;
    // In the gap: the moon over the mountains (a dragon far off), the stars.
    out += `<ellipse cx='1114' cy='280' rx='170' ry='240' fill='url(#kmoon)'/><g clip-path='url(#krw)'><rect x='1060' y='100' width='110' height='350' fill='url(#ksky)'/>
        <circle cx='1124' cy='196' r='34' fill='#f2ecd8' opacity='0.14'/><circle cx='1124' cy='196' r='16' fill='#f2ecd8'/>${Array.from({ length: 12 }, () => `<circle cx='${r1(1072 + rand() * 86)}' cy='${r1(130 + rand() * 170)}' r='${r1(0.7 + rand())}' fill='#fff' opacity='0.8'/>`).join('')}
        <path d='M1092 262 q5 -5 10 -2 q3 -7 8 -2 l-3 3 q3 2 0 3 q-5 0 -7 -2 q-3 3 -8 0Z' fill='#0a0c18'/>
        <path d='M1060 340 L1078 312 L1090 326 L1110 286 L1132 330 L1146 316 L1170 350 V450 H1060Z' fill='#2a3450'/><path d='M1103 300 L1110 286 L1117 300 L1110 296Z' fill='#e8eef8'/><path d='M1060 392 Q1110 362 1170 384 V450 H1060Z' fill='#161c30'/>
        <rect x='1060' y='100' width='110' height='350' fill='url(#klead)' opacity='0.6'/></g>
      <path d='${quad([WR, 2.6, 15.6], [WR + 0.14, 2.6, 15.6], [WR + 0.14, 6.8, 15.6], [WR, 6.8, 15.6])}' fill='#1e1c24'/><path d='${quad([WR, 2.6, 13], [WR, 2.6, 15.6], [WR - 0.14, 2.52, 15.6], [WR - 0.14, 2.52, 13])}' fill='#4a4656'/>${tracery(WR, 13, 15.6, 2.6, 6.8, 7.4, 4.7)}`;
    out += moon(WL, 7.9, 9.1, 2.7, 5.2, 5.9, 4.1, 1) + moon(WR, 13, 15.6, 2.6, 6.8, 7.4, 4.7, -1);
    // The piers, and over them the roof's hammer-beam trusses (drawn flat at their depth): the post
    // on its stone corbel, the curved brace, the hammer beam with its pendant, the arch brace up to
    // the collar, the rafter. Across the hall, the beam the banners hang from (y 91, 12.4 m off).
    out += pier(WL, -4.28, 9.2, 10) + pier(WL, -4.28, 12, 12.8) + pier(WL, -4.28, 14.8, 15.6) + pier(WR, 6.28, 11.2, 12) + pier(WR, 6.28, 15.6, 16.4);
    out += [9.6, 12.4, 15.2].map((Z) => `<use href='#ktr' ${flat(Z)}/>`).join('');
    out += `<g ${flat(12.4)}><rect x='${WL}' y='-7.22' width='${r3(WR - WL)}' height='0.22' fill='#2e1d10'/><path d='M${WL} -7.02 H${WR}' stroke='#6a4426' stroke-width='0.03'/></g>`;
    // The ring of candles hung on its chains (the candles flicker on the TV).
    const candles = Array.from({ length: 10 }, (_, k) => [r1(570 + 64 * Math.cos((k * Math.PI) / 5)), r1(80 + 13 * Math.sin((k * Math.PI) / 5))]);
    const candle = ([x, y]) => `<rect x='${r1(x - 3)}' y='${r1(y - 14)}' width='6' height='14' fill='#efe9dc'/><path d='M${x} ${r1(y - 14)} q-4 -7 0 -13 q4 6 0 13Z' fill='#ffd070'/>`;
    out += `<ellipse cx='570' cy='90' rx='280' ry='150' fill='url(#kcan)'/><path d='M570 0 V36 M570 36 L506 80 M570 36 L634 80 M570 36 L540 93 M570 36 L600 93' stroke='#0e0c10' stroke-width='2.5'/>
      ${candles.filter(([, y]) => y < 80).map(candle).join('')}<ellipse cx='570' cy='80' rx='64' ry='13' fill='none' stroke='#1c1a20' stroke-width='6'/><path d='M506 82 q32 18 64 16 q32 2 64 -16' stroke='#3a3644' stroke-width='2' fill='none'/><path d='M562 93 h16 l-8 14Z' fill='#1c1a20'/>${candles.filter(([, y]) => y >= 80).map(candle).join('')}`;
    // Left: on the pier by the window (its side facing us, 9.2 m off) the shield and crossed swords
    // and a torch; the light of it on the floor.
    out += `<ellipse cx='150' cy='716' rx='130' ry='30' fill='url(#ktorch)'/><g ${flat(9.2)}><g transform='translate(-4.5 -5.4)'>
        <path d='M-0.42 -0.42 L0.42 0.42 M0.42 -0.42 L-0.42 0.42' stroke='url(#kst)' stroke-width='0.05'/><path d='M-0.39 -0.25 L-0.25 -0.39 M0.39 -0.25 L0.25 -0.39 M-0.32 -0.32 L-0.44 -0.44 M0.32 -0.32 L0.44 -0.44' stroke='#d4af37' stroke-width='0.04'/><circle cx='-0.47' cy='-0.47' r='0.035' fill='#d4af37'/><circle cx='0.47' cy='-0.47' r='0.035' fill='#d4af37'/>
        <g clip-path='url(#ksh)'><rect x='-0.25' y='-0.3' width='0.25' height='0.62' fill='#8c1423'/><rect y='-0.3' width='0.25' height='0.62' fill='#1b3f8e'/><path d='M-0.25 0.12 L0 -0.08 L0.25 0.12 V0.21 L0 0.01 L-0.25 0.21Z' fill='#d4af37'/></g>
        <path d='M-0.07 -0.13 v-0.07 l0.035 0.03 l0.035 -0.05 l0.035 0.05 l0.035 -0.03 v0.07Z' fill='#d4af37'/><path d='M-0.22 -0.28 H0.22 V-0.02 Q0.22 0.2 0 0.3 Q-0.22 0.2 -0.22 -0.02Z' fill='none' stroke='url(#kgold)' stroke-width='0.03'/><path d='M-0.18 -0.25 Q-0.19 0 -0.1 0.12' stroke='#fff' stroke-width='0.015' opacity='0.4' fill='none'/></g></g>${torch(151, 350, 1.05)}`;
    // The suit of armour on its stand (in centimetres, 7.7 m off): sabatons, greaves, poleyns and
    // their wings, cuisses, tassets under the fauld, the breastplate with its ridge, the pauldrons
    // in layers, couters, vambraces and gauntlets, the gorget, the armet with its visor slit (eyes
    // look out of it on the TV) and a plume; the halberd in his right hand.
    const low = `<path d='M-4 -1 L-6 -9 Q-12 -12 -18 -10 L-26 -4 Q-27 -1 -24 -1Z'/><path d='M-5.5 -10 Q-3.5 -30 -3.5 -42 Q-5 -51 -10.5 -52 Q-17 -51 -18 -42 Q-18 -26 -15.5 -10Z'/><path d='M-17.5 -61 Q-19.5 -78 -18.5 -92 H-3 Q-1.5 -78 -3.5 -61Z'/><ellipse cx='-10.5' cy='-56.5' rx='7.5' ry='6.5'/><path d='M-17 -59 q-7 2 -6 9 q4 -2 6 -5Z'/><path d='M-21 -89 L-18 -108 H-2 L-2.5 -89Z'/><path d='M-29 -128 L-28.5 -110 H-20.5 L-20 -128Z'/><path d='M-28.5 -102 Q-29 -90 -27.5 -82 H-21 Q-20 -92 -20.5 -102Z'/><ellipse cx='-24.5' cy='-106' rx='5' ry='4.5'/><path d='M-29 -108 q-5 2 -3 8 q3 -2 3 -5Z'/><path d='M-28.5 -83 L-30.5 -76 H-19 L-20.5 -83Z'/><path d='M-30 -76 Q-31 -66 -27 -62 Q-23 -61 -20 -64 L-20 -76Z'/>
      <path d='M-8 -9 l-1.5 6 M-12 -10.5 l-1.5 7 M-16 -10 l-1.5 6.5 M-19.5 -95 H-2.3 M-18.8 -101 H-2.1 M-30 -72 H-20 M-29.8 -68 H-20.5 M-28.6 -64.5 H-21 M-10.5 -62.5 V-50.5 M-6 -46 Q-5 -30 -7 -14' fill='none'/>`;
    const high = `<path d='M-12 -152 Q-26 -157 -31.5 -142 Q-32.5 -134 -29.5 -127 Q-24 -132 -18 -133 Q-14 -144 -12 -152Z'/><path d='M-30.5 -137 Q-24 -140 -19 -139 M-31 -132 Q-25 -135 -19 -134' fill='none'/>`;
    out += `<ellipse cx='110' cy='789' rx='62' ry='8' fill='#000' opacity='0.45'/><g transform='translate(108 787) scale(1.3)'><path d='M-36 0 h72 v-5 q-36 -3 -72 0Z' fill='#2a1a0e'/><rect x='-1.6' y='-90' width='3.2' height='85' fill='#3a2412'/><path d='M-18 -122 H18 V-86 Q0 -80 -18 -86Z' fill='#3e424c' stroke='#24272e' stroke-width='1.2' stroke-dasharray='1 1'/>
      <g fill='url(#kst)' stroke='#14161b' stroke-width='0.6'><g id='kal'>${low}</g><use href='#kal' transform='scale(-1 1)'/>
        <path d='M-17.5 -106 H17.5 L18.5 -112 H-18.5Z M-18.5 -112.5 H18.5 L18.8 -117.5 H-18.8Z'/><path d='M-18.8 -117 Q-21.5 -131 -19 -146 Q-10 -151.5 0 -150.5 Q10 -151.5 19 -146 Q21.5 -131 18.8 -117 Q0 -113 -18.8 -117Z'/><path d='M0 -150 V-115 M-12.5 -144 Q0 -139.5 12.5 -144' fill='none' stroke-width='0.8'/>
        <path d='M-9 -149 Q0 -146 9 -149 L8 -156 Q0 -153.5 -8 -156Z'/><g id='kah'>${high}</g><use href='#kah' transform='scale(-1 1)'/>
        <path d='M-11 -160 Q-12.5 -179 0 -181 Q12.5 -179 11 -160Z'/><path d='M-11.8 -169 Q-12.5 -158 -6 -152.5 Q0 -150.5 6 -152.5 Q12.5 -158 11.8 -169 Q0 -173 -11.8 -169Z'/><path d='M0 -181 V-169' fill='none' stroke-width='0.8'/></g>
      <path d='M-12 -141 Q-15 -130 -11.5 -120 M-8 -176 Q-6 -179 -2 -179.5' stroke='#fff' stroke-width='1.2' opacity='0.5' fill='none'/><path d='M-9.5 -167 Q0 -169.5 9.5 -167' stroke='#05060a' stroke-width='1.8' fill='none'/><path d='M3 -160.5 h4.5 M3 -158 h4.5 M3 -155.5 h4' stroke='#14161b' stroke-width='0.7'/><circle cx='-11' cy='-166' r='1.1' fill='#d4af37'/><circle cx='11' cy='-166' r='1.1' fill='#d4af37'/>
      <path d='M0 -180 Q-5 -194 5 -201 Q2 -191 10 -195 Q7 -185 3 -178Z' fill='#8c1423' stroke='#4a0810' stroke-width='0.6'/>
      <path d='M28 2 V-182' stroke='#4a2e16' stroke-width='2.4'/><path d='M28 -182 h-1.6 l1.6 -14 l1.6 14Z M26.4 -184 h3.2 v11 h-3.2Z M29.6 -181 Q41 -183 45 -172 Q43 -164 41 -158 Q37 -164 29.6 -164Z M26.4 -178 L17 -173 L26.4 -170Z M19.5 -75 H31 Q31.5 -68 29.5 -63.5 H20.5Z' fill='url(#kst)' stroke='#14161b' stroke-width='0.6'/></g>`;
    // The near end of the trestle table laid for the feast (the roast on its platter, bread, a
    // goblet), the trestle under it, the bench beside it.
    const TY = 0.76;
    out += `<path d='${quad([-3.2, TY, 6.5], [-2.2, TY, 6.5], [-2.2, TY, 13], [-3.2, TY, 13])}' fill='#4a2a14'/><path d='${quad([-2.2, TY, 6.5], [-2.2, TY, 13], [-2.2, TY - 0.1, 13], [-2.2, TY - 0.1, 6.5])}${quad([-3.2, TY, 6.5], [-2.2, TY, 6.5], [-2.2, TY - 0.07, 6.5], [-3.2, TY - 0.07, 6.5])}' fill='#2a160a'/>
      <g ${flat(6.9)} stroke='#24120a' stroke-width='0.07' fill='none'><path d='M-3.02 -0.68 L-3.16 0 M-3.02 -0.68 L-2.88 0 M-2.38 -0.68 L-2.52 0 M-2.38 -0.68 L-2.24 0 M-3.16 -0.06 H-2.24 M-3.02 -0.5 H-2.38'/></g>
      <path d='${quad([-1.95, 0.45, 6.7], [-1.6, 0.45, 6.7], [-1.6, 0.45, 13], [-1.95, 0.45, 13])}' fill='#4a2a14'/><path d='${quad([-1.95, 0.45, 6.7], [-1.6, 0.45, 6.7], [-1.6, 0.39, 6.7], [-1.95, 0.39, 6.7])}' fill='#2a160a'/><g ${flat(7)} stroke='#24120a' stroke-width='0.06'><path d='M-1.9 -0.4 V0 M-1.65 -0.4 V0'/></g>
      <g ${flat(6.6)}><ellipse cx='-2.85' cy='-0.77' rx='0.2' ry='0.035' fill='#9aa0a8'/><path d='M-3.01 -0.78 q0.02 -0.16 0.16 -0.17 q0.16 0.01 0.17 0.17Z' fill='#8a4a1e'/><path d='M-2.95 -0.86 q0.06 -0.06 0.14 -0.04' stroke='#c87a3a' stroke-width='0.02' fill='none'/><path d='M-2.71 -0.84 l0.08 -0.06' stroke='#e8d8b0' stroke-width='0.025'/><ellipse cx='-3.1' cy='-0.79' rx='0.07' ry='0.035' fill='#c08a4a'/>
        <path d='M-2.55 -0.95 h0.1 q0 0.08 -0.05 0.09 q-0.05 -0.01 -0.05 -0.09Z M-2.505 -0.86 h0.01 v0.08 h-0.01Z M-2.54 -0.775 h0.08 v0.015 h-0.08Z' fill='url(#kgold)'/></g>`;
    // In the gap: a torch on the pier in the corner, its light on the floor.
    out += `<ellipse cx='1058' cy='606' rx='80' ry='14' fill='url(#ktorch)'/>${torch(1057, 386, 0.62)}`;
    // Along the bottom right, on the right wall: a tapestry (three crowns), a torch, and the great
    // fireplace (its chimney breast and hood with the arms on it, the mantel, the fire on its dogs
    // in the arch, the hearth).
    const crown = (x, y) => `<path d='M${x - 13} ${y + 8} V${y - 6} L${x - 6.5} ${y} L${x} ${y - 10} L${x + 6.5} ${y} L${x + 13} ${y - 6} V${y + 8}Z'/>`;
    out += `<path d='M${P(WR, 6.6, 9)}L${P(WR, 6.6, 10.4)}L${P(WR, 2.9, 10.4)}L${P(WR, 2.6, 9.7)}L${P(WR, 2.9, 9)}Z' fill='#1e4a2e' stroke='#d4af37' stroke-width='2'/><path d='M${P(WR, 6.72, 8.9)}L${P(WR, 6.72, 10.5)}' stroke='#5a3d1e' stroke-width='4'/><g ${onWall(WR, 9, 10.4, 3.4, 6.3)} fill='#d4af37'>${crown(30, 22) + crown(70, 22) + crown(50, 62)}</g>${torch(1247, 365, 0.85)}<ellipse cx='1247' cy='690' rx='90' ry='18' fill='url(#ktorch)'/>`;
    const B = 6.2;
    let bc = '';
    for (let Y = 2.2; Y < TOP; Y += 0.55) { const k = Math.min(1, (Y - 1.75) / 2.85) * 0.4; bc += `M${P(B, Y, 6.9 + k)}L${P(B, Y, 8.7 - k)}`; }
    out += `<ellipse cx='1450' cy='700' rx='240' ry='230' fill='url(#kfire)'/><path d='${quad([B, 0, 6.9], [WR, 0, 6.9], [WR, 1.75, 6.9], [WR, 4.6, 7.3], [WR, TOP, 7.3], [B, TOP, 7.3], [B, 4.6, 7.3], [B, 1.75, 6.9])}' fill='#26242d'/>
      <path d='${quad([B, 0, 6.9], [B, 1.75, 6.9], [B, 4.6, 7.3], [B, TOP, 7.3], [B, TOP, 8.3], [B, 4.6, 8.3], [B, 1.75, 8.7], [B, 0, 8.7])}' fill='#34313d'/><path d='${bc}' stroke='#1a1820' stroke-width='1.6'/><path d='M${P(B, 4.6, 7.3)}L${P(B, 4.6, 8.3)}M${P(B, 3.2, 7.1)}L${P(B, 3.2, 8.5)}' stroke='#14131a' stroke-width='3'/>
      <g ${onWall(B, 7.5, 8.1, 2.3, 4)}><path d='M20 10 H80 V45 Q80 80 50 95 Q20 80 20 45Z' fill='#8c1423' stroke='#d4af37' stroke-width='4'/><path d='M22 58 L50 34 L78 58 V70 L50 46 L22 70Z' fill='#d4af37'/></g>
      <path d='${quad([6.05, 1.6, 6.8], [6.05, 1.6, 8.8], [6.05, 1.82, 8.8], [6.05, 1.82, 6.8])}' fill='#55515f'/><path d='${quad([6.05, 1.6, 6.8], [WR, 1.6, 6.8], [WR, 1.82, 6.8], [6.05, 1.82, 6.8])}' fill='#3a3744'/>
      <path d='M${P(B, 0, 7.2)}L${P(B, 1.25, 7.2)}Q${P(B, 1.45, 7.25)} ${P(B, 1.45, 7.8)}Q${P(B, 1.45, 8.35)} ${P(B, 1.25, 8.4)}L${P(B, 0, 8.4)}Z' fill='#0b0605'/><ellipse cx='1450' cy='750' rx='60' ry='44' fill='#ff6a1a' opacity='0.4'/>
      <path d='M1432 764 L1506 794 M1440 774 L1500 770' stroke='#2a1206' stroke-width='11' stroke-linecap='round'/><path d='M1436 762 l66 28' stroke='#ff7a2a' stroke-width='2' opacity='0.8'/>
      ${[[1452, 768, 1.4], [1476, 780, 1.9], [1496, 788, 1.2]].map(([x, y, k]) => `<g transform='translate(${x} ${y}) scale(${k})'>${FLAME}</g>`).join('')}<path d='M1424 768 v-20 M1508 800 v-22' stroke='#0e0c10' stroke-width='4'/><circle cx='1424' cy='746' r='4' fill='url(#kgold)'/><circle cx='1508' cy='776' r='4' fill='url(#kgold)'/>
      <path d='${quad([5.3, 0, 6.8], [B, 0, 6.8], [B, 0, 8.8], [5.3, 0, 8.8])}' fill='#3a3642'/><ellipse cx='1420' cy='812' rx='230' ry='60' fill='url(#kfire)'/>`;
    // The dais, two steps up, the carpet over them.
    const [D0, D1, C0, C1] = [1.7, 4.1, 2.4, 3.4];
    out += `<path d='${quad([D0, 0, 5.6], [D0, 0, 7], [D0, 0.35, 7], [D0, 0.35, 5.95], [D0, 0.17, 5.95], [D0, 0.17, 5.6])}' fill='#1c1a22'/><path d='${quad([D0, 0.35, 5.95], [D1, 0.35, 5.95], [D1, 0.35, 7], [D0, 0.35, 7])}${quad([D0, 0.17, 5.6], [D1, 0.17, 5.6], [D1, 0.17, 5.95], [D0, 0.17, 5.95])}' fill='#383641'/>
      <path d='${quad([D0, 0.17, 5.95], [D1, 0.17, 5.95], [D1, 0.35, 5.95], [D0, 0.35, 5.95])}${quad([D0, 0, 5.6], [D1, 0, 5.6], [D1, 0.17, 5.6], [D0, 0.17, 5.6])}' fill='#25232b'/>
      <path d='${quad([C0, 0.35, 5.95], [C1, 0.35, 5.95], [C1, 0.35, 7], [C0, 0.35, 7])}${quad([C0, 0.17, 5.6], [C1, 0.17, 5.6], [C1, 0.17, 5.95], [C0, 0.17, 5.95])}' fill='#7a1020'/><path d='${quad([C0, 0.17, 5.95], [C1, 0.17, 5.95], [C1, 0.35, 5.95], [C0, 0.35, 5.95])}${quad([C0, 0, 5.6], [C1, 0, 5.6], [C1, 0.17, 5.6], [C0, 0.17, 5.6])}' fill='#560a16'/>
      <path d='M${P(D0, 0.35, 5.95)}L${P(D1, 0.35, 5.95)}M${P(D0, 0.17, 5.6)}L${P(D1, 0.17, 5.6)}M${P(D0, 0.35, 7)}L${P(D1, 0.35, 7)}' stroke='#5e5a6c' stroke-width='2'/><path d='M${P(C0 + 0.06, 0.35, 7)}L${P(C0 + 0.06, 0.35, 5.95)}L${P(C0 + 0.06, 0.17, 5.95)}L${P(C0 + 0.06, 0.17, 5.6)}M${P(C1 - 0.06, 0.35, 7)}L${P(C1 - 0.06, 0.35, 5.95)}L${P(C1 - 0.06, 0.17, 5.95)}L${P(C1 - 0.06, 0.17, 5.6)}' stroke='#d4af37' stroke-width='2' fill='none' opacity='0.6'/>`;
    // The throne on the dais (in centimetres, 6.3 m off): carved posts with pinnacles and gilt
    // finials, the arched back hung in red velvet under a crowned crest, the arms with gilt knobs,
    // the cushion (the crown left on it: on the TV the king sits there), an arcaded front, lion's
    // feet. The king's jug and goblet on a stool by it.
    out += `<ellipse cx='1100' cy='700' rx='200' ry='220' fill='url(#kcan)'/><g transform='translate(1100 808) scale(1.587)'><path d='M-46 0 h92 v-5 h-92Z' fill='#1a1008'/>
      <path d='M-43 -4 V-160 L-38.5 -172 L-34 -160 V-4Z M34 -4 V-160 L38.5 -172 L43 -160 V-4Z' fill='url(#kwood)'/><circle cx='-38.5' cy='-175' r='3.5' fill='url(#kgold)'/><circle cx='38.5' cy='-175' r='3.5' fill='url(#kgold)'/><path d='M-38.5 -20 V-150 M38.5 -20 V-150' stroke='#d4af37' stroke-width='0.8' opacity='0.6'/>
      <path d='M-34 -56 V-140 Q-34 -160 0 -168 Q34 -160 34 -140 V-56Z' fill='#3a200e'/><path d='M-28 -58 V-136 Q-28 -153 0 -160 Q28 -153 28 -136 V-58Z' fill='#8c1423'/><path d='M-18 -60 V-142 M-6 -60 V-152 M6 -60 V-152 M18 -60 V-142' stroke='#6a0c18' stroke-width='1.6'/><path d='M-28 -136 Q-28 -153 0 -160 Q28 -153 28 -136' stroke='url(#kgold)' stroke-width='1.6' fill='none'/>
      <path d='M-8 -142 V-150 L-4 -146 L0 -153 L4 -146 L8 -150 V-142Z' fill='url(#kgold)'/><path d='M-12 -164 L0 -178 L12 -164Z' fill='url(#kwood)'/><path d='M0 -178 v-5 M-2.5 -181 h5' stroke='#d4af37' stroke-width='1.6'/>
      <path d='M-40 -50 H40 V-8 H-40Z' fill='#3a200e'/><path d='M-34 -12 V-34 Q-34 -42 -24 -45 Q-14 -42 -14 -34 V-12Z M-10 -12 V-34 Q-10 -42 0 -45 Q10 -42 10 -34 V-12Z M14 -12 V-34 Q14 -42 24 -45 Q34 -42 34 -34 V-12Z' fill='#21120a'/><rect x='-40' y='-60' width='80' height='10' rx='3' fill='#a01a2a'/>
      <path d='M-8 -60 V-68 L-4 -64 L0 -71 L4 -64 L8 -68 V-60Z' fill='url(#kgold)'/><circle cx='0' cy='-63' r='1.2' fill='#c8303f'/>
      <path d='M-45 -82 H-31 V-76 H-45Z M31 -82 H45 V-76 H31Z' fill='#4a2a12'/><path d='M-44 -76 V-52 H-39 V-76Z M39 -76 V-52 H44 V-76Z' fill='#3a200e'/><circle cx='-44' cy='-79' r='5' fill='url(#kgold)'/><circle cx='44' cy='-79' r='5' fill='url(#kgold)'/><path d='M-46 0 q0 -7 5 -7 q5 0 5 7Z M36 0 q0 -7 5 -7 q5 0 5 7Z' fill='url(#kgold)'/></g>
      <g ${flat(6.5)}><path d='M3.7 -0.36 V-0.85 M4 -0.36 V-0.85' stroke='#2a160a' stroke-width='0.04'/><rect x='3.64' y='-0.9' width='0.42' height='0.05' fill='#5a3418'/><path d='M3.7 -0.9 q-0.03 -0.15 0.03 -0.22 h0.06 q0.07 0.07 0.03 0.22Z M3.82 -1.06 q0.06 0 0.05 0.08' fill='#7a4a2a' stroke='#7a4a2a' stroke-width='0.012'/><path d='M3.92 -1.06 h0.1 q0 0.07 -0.05 0.08 q-0.05 -0.01 -0.05 -0.08Z M3.965 -0.98 h0.01 v0.07 h-0.01Z M3.94 -0.91 h0.06 v0.012 h-0.06Z' fill='url(#kgold)'/></g>`;
    // The wolfhound asleep before the fire: the TV's character kit (see critter() in
    // public/scenery.js), pasted from Scenery.kit.critter.at('dog', …, { pose: 'sleep', color: '#7a7a86' }).
    out += `<ellipse cx='1372' cy='846' rx='80' ry='8' fill='#000' opacity='0.35'/><g transform='translate(1270 745) scale(1.8)'><g><path d='M14 56 Q10 34 38 32 Q64 30 72 42 Q78 54 66 57 H20 Q14 57 14 56Z' fill='#7a7a86' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/></g><path d='M18 55 Q8 52 10 44' fill='none' stroke='#1c1410' stroke-width='7.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M18 55 Q8 52 10 44' fill='none' stroke='#7a7a86' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'/><circle cx='76' cy='47' r='9.5' fill='#7a7a86' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M80 46 H92 Q97 46 97 51 Q97 56 92 56 H80Z' fill='#7a7a86' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><path d='M69 40 Q64 46 68 56 Q73 55 74 43Z' fill='#605d65' stroke='#1c1410' stroke-width='1.6' stroke-linejoin='round'/><ellipse cx='95.5' cy='49' rx='2' ry='1.7' fill='#1c1410'/><path d='M78 45 q2 1.8 4 0' stroke='#1c1410' stroke-width='1.3' fill='none' stroke-linecap='round'/></g>`;
    // (Squeezed, as it all goes in the page's stylesheet: the paths tightened, and only what has to
    // be is escaped in the data URL, not every space and equals sign as scene() does.)
    const tight = (d) => d.replace(/\s*([A-Za-z])\s*/g, '$1').replace(/ -/g, '-').replace(/(^|[^\d.])0\./g, '$1.');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'>${out.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/ d='([^']*)'/g, (m, d) => ` d='${tight(d)}'`)}</svg>`;
    return `url("data:image/svg+xml,${svg.replace(/[%#<>"]/g, encodeURIComponent)}")`;
  }

  // The jazz club, the stage at the end of the night: deep red velvet behind, a gold-fringed
  // valance and a deco sunburst along the top. On the left the curtain's drawn back and tied with
  // gold rope, and one spotlight falls on the singer's old ribbon mic. In the gap, tonight's
  // poster and a deco lamp glowing red; along the bottom right the band's corner of the stage:
  // the grand piano with its lid up, the double bass standing by it, the drums, the footlights
  // along the stage's edge and gold fans on its front.
  //
  // The band's instruments, about 88 units to the metre (the drummer and the pianist on the TV are
  // drawn to match: see SCENES.jazz in public/scenery.js). The piano is seen from the front right
  // and a little above, worked out from its plan in metres (see jazzPiano).
  const r1 = (n) => +n.toFixed(1);
  // The double bass standing on its endpin (at x, y), about 1.95 m to the top of the scroll.
  function jazzBass(x, y) {
    const body = 'M0 0C19 0 33 -9 33 -28C33 -40 30 -46 27 -50C21 -52 18 -57 18 -62C18 -67 20 -71 25 -74C27 -78 27 -82 26 -88C24 -98 15 -105 7 -111H-7C-15 -105 -24 -98 -26 -88C-27 -82 -27 -78 -25 -74C-20 -71 -18 -67 -18 -62C-18 -57 -21 -52 -27 -50C-30 -46 -33 -40 -33 -28C-33 -9 -19 0 0 0Z';
    const fHole = "<path d='M-10 -79C-16 -74 -8 -67 -12 -62C-16 -57 -9 -51 -14 -45' stroke='#1a0904' stroke-width='1.8' fill='none' stroke-linecap='round'/><circle cx='-10' cy='-79' r='1.7' fill='#1a0904'/><circle cx='-14' cy='-45' r='1.9' fill='#1a0904'/><path d='M-15.5 -61.5h2.5M-11 -62.5h2.5' stroke='#1a0904' stroke-width='1'/>";
    const peg = (s, py) => `<path d='M${s * 4.6} ${py}h${s * 5}' stroke='#8a6420' stroke-width='1.6'/><ellipse cx='${s * 11.4}' cy='${py}' rx='2.8' ry='1.9' fill='url(#jgold)'/>`;
    const str = [-1.5, -0.5, 0.5, 1.5].map((i) => `M${i * 1.5} -158L${i * 4} -68.6L${i * 3} -48`).join('');
    return `<ellipse cx='${x + 2}' cy='${y + 1}' rx='34' ry='4.5' fill='#000' opacity='0.5'/>
      <g transform='translate(${x} ${y - 13}) rotate(4) scale(0.86)'>
      <path d='M0 0V15' stroke='#9a9498' stroke-width='2'/><circle cx='0' cy='15' r='2' fill='#1a1418'/>
      <path d='M-4.2 -156L-6 -110H6L4.2 -156Z' fill='#4a200c'/>
      <g fill='url(#jbass)' stroke='#2a1206' stroke-width='1.6'><path id='jbb' d='${body}'/></g>
      <use href='#jbb' fill='none' stroke='#2a1206' stroke-width='0.8' opacity='0.55' transform='translate(0 -4.6) scale(0.92)'/>
      <ellipse cx='-15' cy='-28' rx='7' ry='16' fill='#ffd8a0' opacity='0.2'/><ellipse cx='-12' cy='-89' rx='4.5' ry='9' fill='#ffd8a0' opacity='0.18'/><path d='M23 -14C30 -24 30 -36 26 -46M22 -78C24 -84 24 -92 20 -98' stroke='#1a0904' stroke-width='3' fill='none' opacity='0.3'/>
      <g id='jfh'>${fHole}</g><use href='#jfh' transform='scale(-1 1)'/>
      <path d='M0 -13V-2' stroke='#140a08' stroke-width='2'/><rect x='-4' y='-2.5' width='8' height='2.5' fill='#140a08'/>
      <path d='M-6.5 -48Q0 -50.5 6.5 -48L4 -16Q0 -12.5 -4 -16Z' fill='#140a08'/><path d='M-4.6 -46L-2.6 -18' stroke='#6a5a58' stroke-width='0.7'/>
      <path d='M-3.2 -158H3.2L5.6 -74Q0 -71.5 -5.6 -74Z' fill='#120908'/><path d='M-2.2 -156L-4 -76' stroke='#5a4a48' stroke-width='0.7'/>
      <path d='M-11 -59L-10 -63Q-10 -68 0 -69.2Q10 -68 10 -63L11 -59H5.5Q0 -63.5 -5.5 -59Z' fill='#e2c48e' stroke='#6a4a20' stroke-width='0.6'/>
      <path d='${str}' stroke='#efe4c8' stroke-width='0.55' fill='none' opacity='0.9'/><rect x='-3.4' y='-159' width='6.8' height='1.6' fill='#efe4c8'/>
      <path d='M-4.2 -158L-4.8 -173Q0 -175 4.8 -173L4.2 -158Z' fill='#6a3412' stroke='#2a1206' stroke-width='0.6'/><path d='M-1.8 -160V-171H1.8V-160Z' fill='#1a0a04'/>
      ${peg(-1, -162.5)}${peg(-1, -169)}${peg(1, -162.5)}${peg(1, -169)}
      <circle cx='1' cy='-179' r='5.6' fill='#6a3412' stroke='#2a1206' stroke-width='0.8'/><path d='M1 -179m-3.4 0a3.4 3.4 0 1 1 3.4 3.4a2 2 0 1 1 2 -2' stroke='#d08a48' stroke-width='0.9' fill='none'/>
      </g>`;
  }
  // A grand piano with its lid up on the stick, worked out from its plan (in metres: the keyboard
  // along x, 1.45 m, the body back along z, 1.66 m; up is y, the rim 1 m up) and seen from the
  // front right and a little above. Its corner by the bass end of the keys, on the floor, is at
  // (ox, oy).
  function jazzPiano(ox, oy) {
    const k = 88;
    const [ct, st, cp, sp] = [Math.cos(0.733), Math.sin(0.733), Math.cos(0.314), Math.sin(0.314)];
    const xy = (X, Y, Z) => [ox + k * (X * ct + Z * st), oy - k * (Y * cp + (Z * ct - X * st) * sp)];
    // (Whole units are fine for the case; the keys want tenths.)
    let fine = false;
    const P = (p) => (fine ? `${r1(p[0])} ${r1(p[1])}` : `${Math.round(p[0])} ${Math.round(p[1])}`);
    const d = (pts) => `M${pts.map((p) => P(xy(...p))).join('L')}Z`;
    const poly = (pts, fill, more = '') => `<path d='${d(pts)}' fill='${fill}'${more}/>`;
    const seg = (a, b) => `M${P(xy(...a))}L${P(xy(...b))}`;
    // The bentside, from the treble end of the keys round to the tail (smoothed through these).
    const K = [[1.45, 0], [1.45, 0.36], [1.36, 0.62], [1.18, 0.84], [1.0, 1.04], [0.88, 1.24], [0.78, 1.42], [0.62, 1.58], [0.4, 1.66], [0.18, 1.66], [0.04, 1.6], [0, 1.52]];
    const bent = [K[0]];
    for (let i = 1; i < K.length - 1; i++) {
      const [p0, p1, p2, p3] = [K[Math.max(i - 1, 1)], K[i], K[i + 1], K[Math.min(i + 2, K.length - 1)]];
      for (let t = 0; t < 0.99; t += 0.5) {
        const t2 = t * t; const t3 = t2 * t;
        bent.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    bent.push(K[K.length - 1]);
    const plan = [[0, 0], ...bent];
    const at = (Y, list) => list.map(([X, Z]) => [X, Y, Z]);
    const leg = (X, Z) => `${poly([[X - 0.06, 0.7, Z], [X + 0.06, 0.7, Z], [X + 0.06, 0.62, Z], [X + 0.035, 0.1, Z], [X - 0.035, 0.1, Z], [X - 0.06, 0.62, Z]], '#141012')}${poly([[X - 0.035, 0.1, Z], [X + 0.035, 0.1, Z], [X + 0.035, 0.04, Z], [X - 0.035, 0.04, Z]], 'url(#jgold)')}<path d='${seg([X - 0.03, 0.6, Z], [X - 0.02, 0.12, Z])}' stroke='#5a4c50' stroke-width='1'/><ellipse cx='${r1(xy(X, 0.02, Z)[0])}' cy='${r1(xy(X, 0.02, Z)[1])}' rx='3' ry='1.6' fill='#8a6420'/>`;
    let out = `<ellipse cx='${r1(xy(0.75, 0, 0.8)[0])}' cy='${r1(xy(0.75, 0, 0.8)[1])}' rx='104' ry='15' fill='#000' opacity='0.5'/>`;
    // The legs and the pedal lyre, under the case.
    out += leg(0.5, 1.42) + leg(0.12, 0.14);
    out += `<path d='${seg([0.68, 0.7, 0.14], [0.68, 0.12, 0.14])}${seg([0.77, 0.7, 0.14], [0.77, 0.12, 0.14])}' stroke='#141012' stroke-width='2.4'/><path d='${seg([0.705, 0.66, 0.14], [0.705, 0.14, 0.14])}${seg([0.745, 0.66, 0.14], [0.745, 0.14, 0.14])}' stroke='#c8a040' stroke-width='0.7'/>
      ${poly([[0.6, 0.04, 0.14], [0.85, 0.04, 0.14], [0.85, 0.13, 0.14], [0.6, 0.13, 0.14]], '#141012')}${poly([[0.62, 0.64, 0.14], [0.83, 0.64, 0.14], [0.83, 0.7, 0.14], [0.62, 0.7, 0.14]], '#141012')}
      <path d='${[0.65, 0.725, 0.8].map((X) => seg([X, 0.08, 0.14], [X, 0.07, -0.05])).join('')}' stroke='#e3b04b' stroke-width='2.2' stroke-linecap='round'/>`;
    out += leg(1.33, 0.14);
    // The lid, hinged along the bass side and raised 50 degrees, its underside to us; the stick.
    const [ca, sa] = [Math.cos(0.873), Math.sin(0.873)];
    const lid = [[0, 0.3], [1.45, 0.3], ...bent.filter(([, Z]) => Z > 0.3)].map(([X, Z]) => [X * ca, 1 + X * sa, Z]);
    out += `<path d='${d(lid)}' fill='url(#jlid)' stroke='#4a3a3e' stroke-width='1.2'/>`;
    out += `<path d='${d([[0.62 * ca, 1 + 0.62 * sa, 0.34], [0.8 * ca, 1 + 0.8 * sa, 0.34], [0.8 * ca, 1 + 0.8 * sa, 1.2], [0.62 * ca, 1 + 0.62 * sa, 1.3]])}' fill='#ffe8c0' opacity='0.08'/>`;
    // The bentside: dark all round (inside the rim covers the far side), the strips that turn to
    // the light shining; the lower edge in shadow.
    out += `<path d='M${at(1, bent).map((p) => P(xy(...p))).join('L')}L${at(0.7, bent).reverse().map((p) => P(xy(...p))).join('L')}Z' fill='#0c0a0b'/>`;
    for (let i = 0; i < bent.length - 1; i++) {
      const [a, b] = [bent[i], bent[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const [nx, nz] = [(b[1] - a[1]) / len, (a[0] - b[0]) / len];
      const lit = nx * st - nz * ct > 0 ? Math.max(0, nx * 0.82 - nz * 0.57) ** 6 : 0;
      if (lit > 0.04) out += poly([[a[0], 1, a[1]], [b[0], 1, b[1]], [b[0], 0.7, b[1]], [a[0], 0.7, a[1]]], `rgb(${[12 + 118 * lit, 10 + 90 * lit, 11 + 84 * lit].map(Math.round)})`, " stroke='none'");
    }
    // Inside: the dark case, the gold plate and the strings, the dampers along the front.
    out += poly(at(1, plan), '#0b090a');
    const plate = bent.filter(([, Z]) => Z > 0.4).map(([X, Z]) => [0.08 + X * 0.88, 0.97, 0.4 + (Z - 0.4) * 0.93]);
    out += poly([[0.08, 0.97, 0.4], ...plate, [0.08, 0.97, 1.44]], 'url(#jgold)', " opacity='0.85'");
    const zEnd = (X) => { for (let i = bent.length - 1; i > 0; i--) if (bent[i][0] >= X) return bent[i][1]; return 0.4; };
    out += `<path d='${Array.from({ length: 13 }, (_, i) => 0.14 + i * 0.09).map((X) => seg([X, 0.975, 0.48], [X, 0.975, Math.min(zEnd(X) - 0.1, 1.38)])).join('')}' stroke='#fff4d8' stroke-width='0.45' opacity='0.6'/>`;
    out += poly([[0.08, 0.99, 0.36], [1.38, 0.99, 0.36], [1.38, 0.99, 0.46], [0.08, 0.99, 0.46]], '#2a2224');
    out += `<path d='${seg([1.24, 1, 0.74], [1.12 * ca, 1 + 1.12 * sa, 0.74])}' stroke='#141012' stroke-width='2.8' stroke-linecap='round'/><path d='${seg([1.22, 1, 0.73], [1.1 * ca, 1 + 1.1 * sa, 0.73])}' stroke='#6a5a5e' stroke-width='0.7'/>`;
    // The rim's edge, lit.
    out += `<path d='M${at(1, bent).map((p) => P(xy(...p))).join('L')}' stroke='#c8a088' stroke-width='1' fill='none' opacity='0.55'/>`;
    // The closed front of the lid, the music stand (a page of music on it).
    out += poly([[0, 1, 0], [1.45, 1, 0], [1.45, 1, 0.3], [0, 1, 0.3]], '#161214') + `<path d='${seg([0, 1, 0], [1.45, 1, 0])}' stroke='#8a7478' stroke-width='0.8'/>`;
    out += poly([[0.32, 1, 0.3], [1.12, 1, 0.3], [1.12, 1.3, 0.4], [0.32, 1.3, 0.4]], '#0e0b0c', " stroke='#3a3034' stroke-width='0.8'");
    out += poly([[0.44, 1.04, 0.31], [0.98, 1.04, 0.31], [0.98, 1.27, 0.39], [0.44, 1.27, 0.39]], '#eee2c4');
    out += `<path d='${[1.2, 1.16, 1.12, 1.08].map((Y) => seg([0.48, Y, 0.31 + (Y - 1) / 3.75], [0.94, Y, 0.31 + (Y - 1) / 3.75])).join('')}' stroke='#6a5a48' stroke-width='0.5'/>`;
    // The front: the case under the keys, the fallboard, the key bed, the keys, the cheeks.
    out += poly([[0, 0.7, 0], [1.45, 0.7, 0], [1.45, 1, 0], [0, 1, 0]], '#0a0809');
    out += poly([[0.07, 0.76, -0.02], [1.38, 0.76, -0.02], [1.38, 0.95, -0.02], [0.07, 0.95, -0.02]], '#1a1517') + poly([[0.6, 0.87, -0.03], [0.85, 0.87, -0.03], [0.85, 0.89, -0.03], [0.6, 0.89, -0.03]], 'url(#jgold)');
    out += poly([[0, 0.6, -0.3], [1.45, 0.6, -0.3], [1.45, 0.73, -0.3], [0, 0.73, -0.3]], '#0d0b0c') + poly([[1.45, 0.6, -0.3], [1.45, 0.6, 0], [1.45, 0.73, 0], [1.45, 0.73, -0.3]], '#1e191b');
    const w = 1.31 / 52;
    fine = true;
    out += poly([[0.07, 0.72, -0.29], [1.38, 0.72, -0.29], [1.38, 0.74, -0.29], [0.07, 0.74, -0.29]], '#bfb6a2') + poly([[0.07, 0.74, -0.29], [1.38, 0.74, -0.29], [1.38, 0.74, -0.01], [0.07, 0.74, -0.01]], '#f3ede0');
    // The keys drawn flat on their own plane, in centimetres (x along the keys, y back): the gaps
    // between the 52 white keys, and the black ones, in twos and threes from A0 up to the top C,
    // as dashes along a line.
    const [o, ex, ez] = [xy(0, 0.74, 0), xy(1, 0.74, 0), xy(0, 0.74, 1)];
    const W = w * 100;
    const dash = [0.7, 0.6, 0.4, 0.6, 1.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.7].map((n) => r1(n * W));
    out += `<g transform='matrix(${[ex[0] - o[0], ex[1] - o[1], ez[0] - o[0], ez[1] - o[1]].map((n) => +(n / 100).toFixed(4))} ${r1(o[0])} ${r1(o[1])})'>
      <path d='M${r1(7 + W)} -15H138' stroke='#8a8478' stroke-width='28' stroke-dasharray='0.4 ${r1(W - 0.4)}'/>
      <path d='M7 -9.5H138' stroke='#141114' stroke-width='17' stroke-dasharray='0 ${dash.join(' ')}' stroke-dashoffset='${r1(5 * W)}'/></g>`;
    fine = false;
    for (const [x0, x1] of [[0, 0.07], [1.38, 1.45]]) out += poly([[x0, 0.6, -0.3], [x1, 0.6, -0.3], [x1, 0.86, -0.3], [x0, 0.86, -0.3]], '#100d0e') + poly([[x0, 0.86, -0.3], [x1, 0.86, -0.3], [x1, 0.86, 0], [x0, 0.86, 0]], '#3a3034') + poly([[x1, 0.6, -0.3], [x1, 0.6, 0], [x1, 0.86, 0], [x1, 0.86, -0.3]], '#1e191b');
    return out;
  }
  // A jazz kit facing us, its bass drum's front head at (x, y) (the floor 28 below): the ride
  // cymbal and the floor tom on the left, the tom on the bass drum, the snare, the hi-hat.
  function jazzKit(x, y) {
    const f = y + 28;
    const drum = (cx, top, rx, h, shell = 'url(#jshell)') => `<rect x='${cx - rx}' y='${top}' width='${rx * 2}' height='${h}' fill='${shell}'/><path d='M${cx - rx} ${top + h}a${rx} ${r1(rx * 0.3)} 0 0 0 ${rx * 2} 0' fill='none' stroke='#d8d0c8' stroke-width='1.3'/>
      ${[-0.66, 0, 0.66].map((u) => `<rect x='${r1(cx + u * rx - 1.2)}' y='${r1(top + h * 0.3)}' width='2.4' height='${r1(h * 0.4)}' rx='1' fill='#d8d0c8'/>`).join('')}<path d='M${cx - rx + 2} ${top + 2}V${top + h - 1}' stroke='#fff' stroke-width='1.6' opacity='0.25'/>
      <ellipse cx='${cx}' cy='${top}' rx='${rx}' ry='${r1(rx * 0.3)}' fill='#efe8da' stroke='#d8d0c8' stroke-width='1.4'/>`;
    const cym = (cx, cy, rx, tilt) => `<g transform='rotate(${tilt} ${cx} ${cy})'><ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${r1(rx * 0.2)}' fill='url(#jcym)' stroke='#6a4a14' stroke-width='0.7'/><ellipse cx='${cx}' cy='${cy}' rx='${r1(rx * 0.6)}' ry='${r1(rx * 0.12)}' fill='none' stroke='#fff2c0' stroke-width='0.5' opacity='0.6'/><ellipse cx='${cx}' cy='${r1(cy - 1)}' rx='${r1(rx * 0.2)}' ry='${r1(rx * 0.08 + 1)}' fill='#e3b04b'/></g>`;
    const tripod = (cx, top) => `<path d='M${cx} ${top}V${f - 13}M${cx - 11} ${f + 1}L${cx} ${f - 13}L${cx + 11} ${f + 1}' stroke='#b8b0a8' stroke-width='1.6' fill='none'/>`;
    let out = `<ellipse cx='${x}' cy='${f + 1}' rx='92' ry='6' fill='#000' opacity='0.5'/>`;
    out += tripod(x - 74, y - 62) + `<path d='M${x - 74} ${y - 60}L${x - 62} ${y - 64}' stroke='#b8b0a8' stroke-width='1.6'/>` + cym(x - 56, y - 64, 26, -8);
    out += tripod(x + 76, y - 48) + `<path d='M${x + 72} ${f}l11 -4' stroke='#5a5458' stroke-width='2.4'/><path d='M${x + 76} ${y - 55}V${y - 47}' stroke='#d8d0c8' stroke-width='1.2'/>` + cym(x + 76, y - 47, 17, 0) + cym(x + 76, y - 51, 17, 0);
    out += `<path d='M${x - 66} ${y}L${x - 70} ${f + 1}M${x - 38} ${y}L${x - 34} ${f + 1}' stroke='#b8b0a8' stroke-width='1.6'/>` + drum(x - 52, y - 26, 18, 28);
    out += tripod(x + 38, y - 18) + drum(x + 38, y - 32, 17, 11, 'url(#jcym)');
    out += `<path d='M${x - 2} ${y - 26}V${y - 40}' stroke='#b8b0a8' stroke-width='2.4'/>` + drum(x - 17, y - 48, 15, 20);
    // The bass drum: the hoop, the claws round it, the spurs, the band's name on its front head.
    out += `<path d='M${x - 24} ${y + 14}L${x - 32} ${f + 1}M${x + 24} ${y + 14}L${x + 32} ${f + 1}' stroke='#b8b0a8' stroke-width='1.8'/>
      <circle cx='${x}' cy='${y}' r='27' fill='#7a0e1c'/><circle cx='${x}' cy='${y}' r='24' fill='url(#jhead)'/><circle cx='${x}' cy='${y}' r='25.6' fill='none' stroke='#d8d0c8' stroke-width='0.8'/>
      <path d='${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * 2 * Math.PI + 0.3; return `M${r1(x + 24.5 * Math.cos(a))} ${r1(y + 24.5 * Math.sin(a))}l${r1(4 * Math.cos(a))} ${r1(4 * Math.sin(a))}`; }).join('')}' stroke='#d8d0c8' stroke-width='2'/>
      <circle cx='${x}' cy='${y}' r='14' fill='#1a0a10' stroke='url(#jgold)' stroke-width='1.6'/>
      <text x='${x}' y='${y + 3}' font-family='Georgia, serif' font-style='italic' font-weight='700' font-size='11' text-anchor='middle' fill='#f0c860'>MT</text><text x='${x}' y='${y + 9}' font-family='Georgia, serif' font-size='3.4' letter-spacing='0.8' text-anchor='middle' fill='#e3b04b'>TRIO</text>
      <path d='M${x - 18} ${y - 12}a22 22 0 0 1 14 -9' stroke='#fff' stroke-width='2' fill='none' opacity='0.35'/>`;
    return out;
  }
  // The singer's old ribbon mic in its yoke, on a stand, the capsule's middle at (x, y) and the
  // stand's foot at `floor`.
  function jazzMic(x, y, floor) {
    const grille = Array.from({ length: 11 }, (_, i) => { const yy = y - 12 + i * 2.4; const hw = 6 - (Math.abs(yy - y) > 8 ? 6 - Math.sqrt(Math.max(0, 36 - (Math.abs(yy - y) - 6) ** 2)) : 0); return `M${r1(x - hw)} ${r1(yy)}h${r1(hw * 2)}`; }).join('');
    return `<ellipse cx='${x}' cy='${floor}' rx='22' ry='5' fill='#000' opacity='0.45'/><ellipse cx='${x}' cy='${floor - 2}' rx='18' ry='4.4' fill='#2a2428'/><ellipse cx='${x}' cy='${floor - 3}' rx='12' ry='2.6' fill='#4a4448'/>
      <path d='M${x + 1} ${floor - 2}q12 6 34 4' stroke='#0c0a0b' stroke-width='1.5' fill='none'/>
      <path d='M${x} ${floor - 3}V${y + 52}' stroke='#7a7478' stroke-width='3.4'/><path d='M${x - 0.8} ${floor - 3}V${y + 52}' stroke='#f0e8e0' stroke-width='0.9' opacity='0.7'/>
      <rect x='${x - 4.5}' y='${y + 47}' width='9' height='7' rx='2' fill='#4a4448'/><path d='M${x} ${y + 47}V${y + 20}' stroke='#9a9498' stroke-width='2.4'/>
      <path d='M${x - 10} ${y}Q${x - 11} ${y + 20} ${x} ${y + 20}Q${x + 11} ${y + 20} ${x + 10} ${y}' stroke='#3a3438' stroke-width='2.6' fill='none'/>
      <rect x='${x - 8.5}' y='${y - 16}' width='17' height='32' rx='8.5' fill='url(#jmic)' stroke='#2a2428' stroke-width='1'/>
      <rect x='${x - 6.5}' y='${y - 13.5}' width='13' height='27' rx='6.5' fill='#2a262a'/><path d='${grille}' stroke='#cfc8c0' stroke-width='0.8'/>
      <rect x='${x - 9.5}' y='${y - 1.6}' width='19' height='3.2' rx='1' fill='url(#jgold)'/>
      <circle cx='${x - 10}' cy='${y}' r='2.4' fill='#5a5458'/><circle cx='${x + 10}' cy='${y}' r='2.4' fill='#5a5458'/>
      <path d='M${x - 5} ${y - 12}V${y + 11}' stroke='#fff' stroke-width='1.3' opacity='0.35'/>`;
  }
  function jazzStage() {
    let out = `<defs>
      <linearGradient id='jv' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#2a0a14'/><stop offset='0.35' stop-color='#5c1a2c'/><stop offset='0.55' stop-color='#6b2234'/><stop offset='0.8' stop-color='#4a1424'/><stop offset='1' stop-color='#2a0a14'/></linearGradient>
      <pattern id='jvp' width='56' height='900' patternUnits='userSpaceOnUse'><rect width='56' height='900' fill='url(#jv)'/></pattern>
      <linearGradient id='jgold' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f6dc8a'/><stop offset='0.5' stop-color='#e3b04b'/><stop offset='1' stop-color='#8a6420'/></linearGradient>
      <linearGradient id='jspot' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff0c8' stop-opacity='0.42'/><stop offset='1' stop-color='#fff0c8' stop-opacity='0.08'/></linearGradient>
      <linearGradient id='jblk' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#3a3438'/><stop offset='0.4' stop-color='#0e0c0e'/><stop offset='1' stop-color='#050405'/></linearGradient>
      <linearGradient id='jbass' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#4a1c08'/><stop offset='0.3' stop-color='#b8682a'/><stop offset='0.55' stop-color='#9a4e1c'/><stop offset='1' stop-color='#3a1606'/></linearGradient>
      <linearGradient id='jlid' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#0c0a0b'/><stop offset='0.55' stop-color='#2e2428'/><stop offset='0.75' stop-color='#4a3a3a'/><stop offset='1' stop-color='#141012'/></linearGradient>
      <linearGradient id='jshell' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#4a0a14'/><stop offset='0.3' stop-color='#d8404e'/><stop offset='0.45' stop-color='#a8202e'/><stop offset='1' stop-color='#3a0810'/></linearGradient>
      <linearGradient id='jcym' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#8a6420'/><stop offset='0.35' stop-color='#f6dc8a'/><stop offset='0.6' stop-color='#c8962e'/><stop offset='1' stop-color='#6a4a14'/></linearGradient>
      <linearGradient id='jmic' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#9a9498'/><stop offset='0.3' stop-color='#f4eee8'/><stop offset='0.7' stop-color='#8a8488'/><stop offset='1' stop-color='#4a4448'/></linearGradient>
      <radialGradient id='jhead' cx='0.4' cy='0.35' r='0.7'><stop offset='0' stop-color='#fbf4e4'/><stop offset='1' stop-color='#cfc4ac'/></radialGradient>
      <pattern id='jfan' width='80' height='36' patternUnits='userSpaceOnUse'><rect width='80' height='36' fill='#1a0a10'/><g opacity='0.75'>${Array.from({ length: 7 }, (_, i) => { const a = (t) => `${r1(40 + 27 * Math.cos(Math.PI * t))} ${r1(34 - 27 * Math.sin(Math.PI * t))}`; return `<path d='M40 34L${a(1 - i / 7)}A27 27 0 0 1 ${a(1 - (i + 1) / 7)}Z' fill='${i % 2 ? '#8a6420' : '#e3b04b'}' opacity='${i % 2 ? 0.7 : 0.55}'/>`; }).join('')}
        <path d='M10 34A30 30 0 0 1 70 34' fill='none' stroke='#e3b04b' stroke-width='1.4'/><path d='M32 34a8 8 0 0 1 16 0Z' fill='url(#jgold)'/><path d='M0 8l4 6l-4 6l-4 -6ZM80 8l4 6l-4 6l-4 -6Z' fill='#e3b04b'/><path d='M0 35H80' stroke='#8a6420' stroke-width='2'/></g></pattern>
      ${glow('jwarm', '#ffdc96', 0.4)}${glow('jred', '#ff3a3a', 0.4)}${glow('jfoot', '#ffc870', 0.55)}
      <radialGradient id='jdark' cx='0.4' cy='0.5' r='0.55'><stop offset='0' stop-color='#0a0306' stop-opacity='0.8'/><stop offset='0.7' stop-color='#0a0306' stop-opacity='0.45'/><stop offset='1' stop-color='#0a0306' stop-opacity='0'/></radialGradient></defs>
      <rect width='1600' height='900' fill='url(#jvp)'/><rect width='1600' height='900' fill='#140408' opacity='0.35'/>
      <ellipse cx='800' cy='40' rx='640' ry='420' fill='url(#jwarm)'/><rect width='1600' height='900' fill='url(#jdark)'/>`;
    // The valance: swags along the top, gold fringe, the sunburst over the middle.
    out += `<rect width='1600' height='40' fill='#3a0c18'/>${Array.from({ length: 8 }, (_, i) => `<path d='M${i * 200} 30 Q${i * 200 + 100} 140 ${i * 200 + 200} 30Z' fill='#5c1a2c'/><path d='M${i * 200} 30 Q${i * 200 + 100} 140 ${i * 200 + 200} 30' stroke='url(#jgold)' stroke-width='6' fill='none'/><path d='M${i * 200 + 10} 44 Q${i * 200 + 100} 146 ${i * 200 + 190} 44' stroke='#e3b04b' stroke-width='10' stroke-dasharray='2 4' fill='none' opacity='0.8'/><circle cx='${i * 200}' cy='34' r='9' fill='url(#jgold)'/><path d='M${i * 200} 40 l-6 34 h12Z' fill='#e3b04b'/>`).join('')}
      <rect y='36' width='1600' height='6' fill='url(#jgold)'/>
      <g transform='translate(800 42)'>${Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (i / 10); return `<path d='M0 0 L${(-Math.cos(a) * 90).toFixed(0)} ${(Math.sin(a) * 60).toFixed(0)}' stroke='#e3b04b' stroke-width='3' opacity='0.7'/>`; }).join('')}<path d='M-34 0 A34 26 0 0 0 34 0Z' fill='url(#jgold)'/></g>`;
    // The spotlight from the top left onto the mic, and the drawn-back curtain.
    out += `<path d='M40 0 L230 0 L200 880 L-60 880Z' fill='url(#jspot)'/><ellipse cx='80' cy='870' rx='150' ry='26' fill='#fff0c8' opacity='0.22'/>
      <path d='M0 0 H120 Q100 300 50 420 Q90 560 70 900 H0Z' fill='url(#jvp)'/><path d='M120 0 Q100 300 50 420 Q90 560 70 900' stroke='#1a0408' stroke-width='6' fill='none' opacity='0.6'/>
      <path d='M20 410 Q50 400 70 426 Q56 444 26 436Z' fill='url(#jgold)'/><path d='M50 432 q-6 40 -2 70 M58 430 q4 40 12 66' stroke='#e3b04b' stroke-width='4' fill='none'/><circle cx='48' cy='504' r='8' fill='url(#jgold)'/><circle cx='70' cy='498' r='8' fill='url(#jgold)'/>
`;
    // Tonight's poster, and the deco lamp.
    out += `<rect x='1040' y='150' width='120' height='176' fill='#e8dcc0'/><rect x='1046' y='156' width='108' height='164' fill='#1a1418'/>
      <path d='M1100 318 m-40 0 a40 30 0 0 1 80 0' fill='none' stroke='#e3b04b' stroke-width='2'/><path d='M1100 318 m-28 0 a28 20 0 0 1 56 0 M1100 318 m-16 0 a16 10 0 0 1 32 0' fill='none' stroke='#e3b04b' stroke-width='1.5' opacity='0.7'/>
      <g font-family='Georgia, serif' text-anchor='middle' fill='#e3b04b'><text x='1100' y='182' font-size='12' letter-spacing='3'>TONIGHT</text><text x='1100' y='210' font-size='17' font-weight='700' fill='#f6e7d8'>THE</text><text x='1100' y='232' font-size='17' font-weight='700' fill='#f6e7d8'>MIDNIGHT</text><text x='1100' y='254' font-size='17' font-weight='700' fill='#f6e7d8'>TRIO</text><text x='1100' y='276' font-size='10' letter-spacing='2'>★ LIVE ★</text></g>
      <ellipse cx='1100' cy='440' rx='160' ry='140' fill='url(#jred)'/><path d='M1100 470 V520' stroke='#8a6420' stroke-width='4'/><path d='M1068 470 Q1100 380 1132 470Z' fill='#ffc8a0' opacity='0.9'/><path d='M1068 470 Q1100 380 1132 470' stroke='url(#jgold)' stroke-width='4' fill='none'/>
      <path d='M1100 466 V400 M1100 466 L1080 412 M1100 466 L1120 412 M1100 466 L1072 440 M1100 466 L1128 440' stroke='#e3b04b' stroke-width='2'/><rect x='1086' y='518' width='28' height='8' rx='3' fill='url(#jgold)'/>`;
    // The band's corner, under the TV's sidebar: the bass, the piano (the pianist's bench in front
    // of its keys is on the TV), the drums.
    out += `<ellipse cx='1360' cy='760' rx='360' ry='180' fill='url(#jwarm)'/>${jazzBass(1152, 850)}${jazzPiano(1240, 826)}${jazzKit(1494, 822)}`;
    // The stage's edge: footlights, gold fans on the front; the mic at its lip, in the spotlight.
    out += `<rect y='856' width='1600' height='8' fill='url(#jgold)'/><rect y='864' width='1600' height='36' fill='url(#jfan)'/>
      <pattern id='jfl' width='80' height='900' patternUnits='userSpaceOnUse'><ellipse cx='40' cy='852' rx='40' ry='16' fill='url(#jfoot)'/><path d='M30 856a10 8 0 0 1 20 0Z' fill='#ffe8b0'/></pattern><rect y='836' width='1600' height='32' fill='url(#jfl)'/>${jazzMic(140, 735, 879)}`;
    return scene(out);
  }

  const vignette ='radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(0, 0, 0, 0.6) 100%)';
  // Each look's art, by id (every look in roomStyles.js but classic). bg: the page background.
  // felt / rim: the TV's table top and its edge.
  const ART = {
    dive: {
      bg: () => `linear-gradient(rgba(10, 7, 5, 0.55), transparent 14%), ${diveBar()} 88% 50% / cover no-repeat, #1a1612`,
      felt: 'radial-gradient(ellipse at 40% 40%, #3b7048 0%, #2c5937 60%, #20442a 100%)',
      rim: '#3b2414',
    },
    tavern: {
      bg: () => `linear-gradient(rgba(14, 8, 4, 0.55), transparent 14%), ${tavernInn()} 8% 50% / cover no-repeat, #2b1d12`,
      felt: 'repeating-linear-gradient(95deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 22px), radial-gradient(ellipse at center, #8a5a30 0%, #6e4522 70%, #573417 100%)',
      rim: '#3f240f',
    },
    club: {
      bg: () => `linear-gradient(rgba(4, 3, 8, 0.5), transparent 14%), ${clubFloor()} 80% 50% / cover no-repeat, #07060d`,
      felt: 'radial-gradient(ellipse at 35% 30%, #2a2340 0%, #120f1e 60%, #08070e 100%)',
      rim: '#ff2bd6',
    },
    castle: {
      bg: () => `linear-gradient(rgba(8, 7, 12, 0.55), transparent 14%), ${greatHall()} 88% 50% / cover no-repeat, #1c1b22`,
      felt: 'radial-gradient(ellipse at center, #4a2670 0%, #3a1c5a 65%, #2a1242 100%)',
      rim: '#6b6875',
    },
    jazz: {
      bg: () => `linear-gradient(rgba(14, 4, 8, 0.5), transparent 14%), ${jazzStage()} 10% 50% / cover no-repeat, #1a0d12`,
      felt: 'radial-gradient(ellipse at center, #6e1a2a 0%, #561320 70%, #3f0d17 100%)',
      rim: '#a8803a',
    },
    diner: {
      // The counter along a mint wall with a chrome and red stripe, over a checkerboard floor (see
      // dinerArt). Softened along the top, under the heading, and at the edges.
      bg: () => `linear-gradient(rgba(251, 243, 228, 0.55), transparent 12%), radial-gradient(ellipse 85% 75% at 50% 50%, transparent 62%, rgba(70, 30, 30, 0.16)), ${dinerArt()} center / cover no-repeat, #f6efe2`,
      felt: 'radial-gradient(ellipse at 40% 35%, #6fd0c6 0%, #3fa79c 70%, #2e8a80 100%)',
      rim: '#cfd6dc',
    },
    tiki: {
      // Bamboo walls opening onto the beach at dusk (see tikiBeach), torches lit on the left (on
      // the TV) and the right.
      bg: () => `${vignette},
        radial-gradient(circle at 5% 78%, rgba(255, 140, 50, 0.32), transparent 18%),
        linear-gradient(rgba(10, 26, 22, 0.55), rgba(10, 26, 22, 0.2) 14%, rgba(10, 26, 22, 0.2) 60%, rgba(10, 26, 22, 0.5)),
        ${tikiBeach()} center / cover no-repeat, #0f2421`,
      felt: 'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.08) 0 6px, transparent 6px 12px), radial-gradient(ellipse at center, #c99a52 0%, #a87b3c 70%, #8a6129 100%)',
      rim: '#5a3a1a',
    },
    speakeasy: {
      // A hidden bar in a basement: faded damask wallpaper above mahogany panelling, a brass rail
      // between them, and the warm pools of light from brass sconces on the walls (see speakeasyArt).
      bg: () => `${vignette}, linear-gradient(rgba(12, 4, 4, 0.55), transparent 14%), ${speakeasyArt()} center / cover no-repeat, #2a1014`,
      felt: 'radial-gradient(ellipse at center, #2c4a37 0%, #1f3a2b 70%, #15291e 100%)',
      rim: '#b08d45',
    },
    casino: {
      // The casino floor under chandelier light, on its patterned carpet (see casinoArt).
      bg: () => `${vignette}, linear-gradient(rgba(16, 2, 4, 0.5), transparent 16%), ${casinoArt()} center / cover no-repeat, #1a0608`,
      felt: 'radial-gradient(ellipse at center, #13804a 0%, #0f6b3c 65%, #0a5530 100%)',
      rim: '#c99a2e',
    },
    saloon: {
      // Board walls with dusty sunlight slanting in (see saloonArt).
      bg: () => `${vignette}, linear-gradient(rgba(20, 10, 4, 0.5), transparent 14%), ${saloonArt()} center / cover no-repeat, #2a1a0e`,
      felt: 'radial-gradient(ellipse at center, #3f6b45 0%, #355e3b 65%, #284a2d 100%)',
      rim: '#4a2a12',
    },
    pirate: {
      // On deck at sunset, looking out to sea: the sail and its yard overhead, the rigging down
      // both sides, the rail in front of you, and the sun going down on the horizon.
      // (See pirateSea(): the sea, the sunset and the deck, all in one.)
      bg: () => `${rigging()} 0 0 / 100% 100% no-repeat,
        linear-gradient(rgba(12, 8, 20, 0.4), transparent 16%),
        ${pirateSea()} center / cover no-repeat, #10161d`,
      felt: 'radial-gradient(ellipse at 45% 40%, #e3cc96 0%, #cdb070 70%, #a88a4c 100%)',
      rim: '#5a3d1e',
    },
    beerhall: {
      // The hall itself, blue and white diamonds painted in its vaults (see beerHall()), washed
      // pale so dark text reads on it.
      bg: () => `linear-gradient(rgba(242, 244, 248, 0.55), rgba(242, 244, 248, 0.3) 30%, rgba(242, 244, 248, 0.3) 70%, rgba(242, 244, 248, 0.45)),
        ${beerHall()} center / cover no-repeat, #eef3fa`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.1) 0 2px, transparent 2px 70px), radial-gradient(ellipse at center, #b07c46 0%, #9a6a3a 70%, #7d5430 100%)',
      rim: '#5c3a1a',
    },
    space: {
      // Stars and nebulae through the lounge's great window, with a ringed planet rising in the
      // corner (see spaceLounge()).
      bg: () => `linear-gradient(rgba(3, 4, 12, 0.35), transparent 14%), ${spaceLounge()} center / cover no-repeat, #05060f`,
      felt: 'radial-gradient(ellipse at 40% 35%, #1d2350 0%, #121633 65%, #0a0c20 100%)',
      rim: '#3d4a8a',
    },
    lighthouse: {
      // From the gallery at the top: the night sea stretching out to the horizon, the moon's path
      // on the water, and the iron railing in front of you.
      // (See lighthouseView(): the sea, the sky, the headland and the rocks below, by the weather.)
      bg: () => `${galleryRail('night')} center / cover no-repeat,
        linear-gradient(rgba(3, 7, 15, 0.45), transparent 15%),
        ${lighthouseView('night')} center / cover no-repeat, #0b1626`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #5b6f80 0%, #4a5d6e 70%, #394a59 100%)',
      rim: '#c9a227',
    },
    vineyard: {
      // The vineyard in the afternoon sun (see tuscany()), the pergola overhead, the terrace wall.
      // (The pergola's shade along the top, so the heading reads over the leaves.)
      bg: () => `linear-gradient(rgba(24, 14, 4, 0.5), transparent 9%), ${pergola(false)} 0 0 / 300px 150px repeat-x, linear-gradient(rgba(30, 20, 8, 0.5), rgba(30, 20, 8, 0.12) 18%, transparent 30%), ${stoneWall(false)} center / cover no-repeat, ${tuscany(false)} center / cover no-repeat, #7f9a3a`,
      // A red-checked tablecloth.
      felt: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.18)), repeating-conic-gradient(#b8322a 0 25%, #f2e6cf 0 50%) 0 0 / 46px 46px',
      rim: '#5a3a1e',
    },
    frat: {
      bg: () => `linear-gradient(rgba(20, 10, 4, 0.5), transparent 14%), linear-gradient(rgba(20, 10, 4, 0.1), rgba(20, 10, 4, 0.25)), ${fratHouse()} center / cover no-repeat, #2a1a10`,
      felt: pong,
      rim: '#f4f4f4',
    },
    speakeasyNoir: {
      bg: () => `linear-gradient(rgba(6, 6, 8, 0.5), transparent 14%), ${noir()} center / cover no-repeat, #111114`,
      // Green baize gone grey in the dark, under the lamp.
      felt: 'radial-gradient(ellipse at 45% 40%, #4a4a48 0%, #343432 60%, #222220 100%)',
      rim: '#0a0a0c',
    },
    saloonRiverboat: {
      bg: () => `linear-gradient(rgba(20, 8, 10, 0.5), transparent 14%), ${riverboat()} center / cover no-repeat, #2a1018`,
      felt: 'radial-gradient(ellipse at center, #8a1a24 0%, #6a121a 70%, #4a0c12 100%)',
      rim: '#c8a85a',
    },
    tavernMeadhall: {
      bg: () => `linear-gradient(rgba(14, 8, 4, 0.55), transparent 14%), ${meadHall()} center / cover no-repeat, #1e130b`,
      // A long board of rough planks.
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.3) 0 3px, transparent 3px 64px), radial-gradient(ellipse at center, #8a5a2e 0%, #6e4422 70%, #4e2e16 100%)',
      rim: '#3a2410',
    },
    dinerRink: {
      bg: () => `linear-gradient(rgba(16, 4, 30, 0.55), transparent 14%), ${rink()} center / cover no-repeat, #1a0a30`,
      felt: 'repeating-linear-gradient(135deg, rgba(255, 43, 214, 0.18) 0 10px, transparent 10px 30px), repeating-linear-gradient(45deg, rgba(41, 240, 255, 0.14) 0 8px, transparent 8px 26px), radial-gradient(ellipse at center, #2a1450 0%, #1c0c38 70%, #140828 100%)',
      rim: '#ff2bd6',
    },
    fratChampionship: {
      bg: () => `linear-gradient(rgba(20, 10, 4, 0.55), transparent 14%), linear-gradient(rgba(20, 10, 4, 0.2), rgba(20, 10, 4, 0.35)), ${frat(true)} center / cover no-repeat, #2a1a10`,
      felt: pong,
      rim: '#f4f4f4',
    },
    garage: {
      bg: () => `linear-gradient(rgba(20, 24, 30, 0.35), rgba(20, 24, 30, 0.5)), ${garage()} center / cover no-repeat, #2a3038`,
      felt: `${plate()} 0 0 / 40px 40px`,
      rim: '#ffd23f',
    },
    chateau: {
      // (A little shade over the garden, so light text reads over the gravel and the sky.)
      bg: () => `linear-gradient(rgba(20, 30, 20, 0.12), rgba(20, 30, 20, 0.22)), ${chateauGarden(false)} center / cover no-repeat, #5f8a36`,
      // White linen.
      felt: 'radial-gradient(ellipse at 45% 40%, #fbf8f0 0%, #ede6d6 70%, #d8cfba 100%)',
      rim: '#b08d45',
    },
    vineyardSunset: {
      bg: () => `linear-gradient(rgba(24, 10, 4, 0.5), transparent 9%), ${pergola(true)} 0 0 / 300px 150px repeat-x, linear-gradient(rgba(30, 12, 6, 0.5), rgba(30, 12, 6, 0.12) 18%, transparent 30%), ${stoneWall(true)} center / cover no-repeat, linear-gradient(rgba(60, 20, 10, 0.1), rgba(60, 20, 10, 0.25)), ${tuscany(true)} center / cover no-repeat, #7a5a22`,
      felt: 'radial-gradient(ellipse at center, rgba(255, 200, 140, 0.1), rgba(0, 0, 0, 0.28)), repeating-conic-gradient(#b8322a 0 25%, #f2e6cf 0 50%) 0 0 / 46px 46px',
      rim: '#5a3a1e',
    },
    chateauNight: {
      bg: () => `${chateauGarden(true)} center / cover no-repeat, #14241a`,
      felt: 'radial-gradient(ellipse at 45% 40%, #e8e4dc 0%, #cfc8b8 70%, #b4ac98 100%)',
      rim: '#b08d45',
    },
    chateauRevolution: {
      bg: () => `linear-gradient(rgba(40, 10, 0, 0.1), rgba(40, 10, 0, 0.3)), ${chateau(true, true)} center / cover no-repeat, #1a0c0c`,
      // The linen, scorched.
      felt: 'radial-gradient(circle at 30% 70%, rgba(40, 20, 10, 0.45) 0 6%, transparent 12%), radial-gradient(circle at 72% 30%, rgba(40, 20, 10, 0.35) 0 5%, transparent 10%), radial-gradient(ellipse at 45% 40%, #e8ddcc 0%, #cbbca2 70%, #9a8a70 100%)',
      rim: '#7a5a2a',
    },
    casinoMonteCarlo: {
      bg: () => `linear-gradient(rgba(30, 14, 0, 0.75), transparent 14%), radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(30, 12, 0, 0.55) 100%), linear-gradient(rgba(40, 20, 0, 0.2), rgba(40, 20, 0, 0.35)), ${monteCarlo()} center / cover no-repeat, #2a1a0a`,
      felt: 'radial-gradient(ellipse at center, #1a7a4a 0%, #136238 65%, #0c4a2a 100%)',
      rim: '#e0b450',
    },
    jazzOpenMic: {
      bg: () => `${vignette},
        radial-gradient(ellipse 18% 70% at 10% 58%, rgba(255, 240, 200, 0.4), transparent 70%),
        linear-gradient(rgba(16, 10, 8, 0.6), rgba(16, 10, 8, 0.8)),
        ${bricks()} 0 0 / 256px 120px, #150e0c`,
      felt: 'radial-gradient(ellipse at center, #2a2a2e 0%, #1e1e22 70%, #141418 100%)',
      rim: '#ff4d6d',
    },
    beerhallOktoberfest: {
      bg: () => `linear-gradient(rgba(30, 20, 10, 0.5), transparent 16%), linear-gradient(rgba(40, 26, 10, 0.15), rgba(40, 26, 10, 0.35)), ${oktoberfest()} center / cover no-repeat, #f4e7c8`,
      // A beer-tent table: wood, with a faint blue and white check over it.
      felt: 'repeating-conic-gradient(rgba(42, 111, 219, 0.16) 0 25%, rgba(255, 255, 255, 0.08) 0 50%) 0 0 / 44px 44px, radial-gradient(ellipse at center, #b07c46 0%, #9a6a3a 70%, #7d5430 100%)',
      rim: '#5c3a1a',
    },
    garageWasteland: {
      // Darkened along the top (under the heading) and at the edges, so text on it stays readable.
      bg: () => `linear-gradient(rgba(4, 16, 20, 0.6), transparent 16%), radial-gradient(ellipse 80% 70% at 55% 50%, transparent 55%, rgba(10, 4, 2, 0.45)), ${wasteland()} center / cover no-repeat, #2a1408`,
      felt: 'radial-gradient(ellipse at 40% 40%, #8a6a4a 0%, #6a4a2e 70%, #4a2e1a 100%)',
      rim: '#5a5a5a',
    },
    spaceStarship: {
      bg: () => `linear-gradient(rgba(6, 8, 14, 0.6), transparent 14%), ${starship()} center / cover no-repeat, #0c1018`,
      felt: 'radial-gradient(ellipse at 40% 35%, #2a3a52 0%, #1c2638 65%, #121a28 100%)',
      rim: '#7cf0ff',
    },
    diveChampionship: {
      bg: () => `linear-gradient(rgba(6, 5, 12, 0.6), transparent 14%), ${palace()} center / cover no-repeat, #0e0b1c`,
      felt: 'radial-gradient(ellipse at center, #1c6b44 0%, #135234 65%, #0c3a24 100%)',
      rim: '#ff2a8a',
    },
    castleTournament: {
      bg: () => `linear-gradient(rgba(20, 20, 30, 0.55), transparent 14%), ${tournament()} center / cover no-repeat, #4f8a3a`,
      felt: 'radial-gradient(ellipse at center, #4a2670 0%, #3a1c5a 65%, #2a1242 100%)',
      rim: '#d4af37',
    },
    pirateDutchman: {
      bg: () => `linear-gradient(rgba(1, 8, 6, 0.55), transparent 16%), ${dutchman()} center / cover no-repeat, #06120e`,
      // An old barrel-head of a table, green with damp.
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 54px), radial-gradient(ellipse at 45% 40%, #4a6a54 0%, #344c3c 70%, #1e3024 100%)',
      rim: '#24382c',
    },
    lighthouseDay: {
      // The same view on a bright day: the sun high over a blue sea, glittering on the water, a few
      // clouds, and the railing painted dark green.
      bg: () => `${galleryRail('day')} center / cover no-repeat,
        linear-gradient(rgba(10, 40, 70, 0.35), transparent 14%),
        ${lighthouseView('day')} center / cover no-repeat, #2f6f9e`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #5b6f80 0%, #4a5d6e 70%, #394a59 100%)',
      rim: '#c9a227',
    },
    lighthouseFog: {
      // Night, but the fog has come in: the moon a smudge, the horizon gone, grey all the way down.
      bg: () => `${galleryRail('fog')} center / cover no-repeat,
        linear-gradient(rgba(160, 175, 190, 0.05) 0%, rgba(160, 175, 190, 0.3) 36%, rgba(170, 184, 198, 0.46) 48%, rgba(150, 165, 180, 0.24) 100%),
        ${lighthouseView('fog')} center / cover no-repeat, #1c2631`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #56656f 0%, #46545e 70%, #36424b 100%)',
      rim: '#a9b2ba',
    },
    storm: {
      // The same view, but black clouds, a heaving grey sea and rain lashing the glass.
      bg: () => `${galleryRail('storm')} center / cover no-repeat,
        ${lighthouseView('storm')} center / cover no-repeat, #0a1016`,
      felt: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.14) 0 2px, transparent 2px 60px), radial-gradient(ellipse at center, #4b5a66 0%, #3c4954 70%, #2d3740 100%)',
      rim: '#9aa4ad',
    },
    christmas: {
      // The front room on Christmas Eve (see christmasEve()): fairy lights, the tree, snow outside,
      // a fire glowing below.
      bg: () => `linear-gradient(rgba(4, 12, 8, 0.4), transparent 14%), radial-gradient(ellipse 80% 35% at 50% 105%, rgba(255, 120, 40, 0.2), transparent 70%), ${christmasEve()} center / cover no-repeat, #0e2418`,
      felt: 'radial-gradient(ellipse at center, #a3222b 0%, #8c1a22 65%, #6c1218 100%)',
      rim: '#c9a14a',
    },
    halloween: {
      // The haunted hill under a full moon (see hauntedHill()), cobwebs in the corners, fog creeping
      // along the ground.
      bg: () => `${cobweb(false)} 0 0 / 260px 260px no-repeat, ${cobweb(true)} 100% 0 / 260px 260px no-repeat,
        linear-gradient(rgba(6, 3, 12, 0.35), transparent 14%), ${hauntedHill()} center / cover no-repeat, #0d0812`,
      felt: 'radial-gradient(ellipse at center, #3a1f4d 0%, #2a1538 65%, #1a0c24 100%)',
      rim: '#ff7a1a',
    },
    stpatricks: highland('clear'),
    stpatricksRain: highland('rain'),
    stpatricksFog: highland('fog'),
  };

  // Boat Race at the lighthouse: regatta day. Always the clear day, signal flags strung overhead.
  const bunting = () => tile(240, 60, `<path d='M0 6 Q120 30 240 6' fill='none' stroke='#2a3a4a' stroke-width='2'/>
    ${['#e5484d', '#f5c518', '#3d7cff', '#ffffff', '#2fbf71', '#ff8a1f'].map((c, i) => { const x = 10 + i * 38; const y = 6 + 24 * Math.sin(((x + 9) / 240) * Math.PI) * 0.75; return `<path d='M${x} ${y} h18 l-9 22Z' fill='${c}' stroke='rgba(0,0,0,0.25)'/>`; }).join('')}`);
  ART.lighthouseRegatta = {
    ...ART.lighthouseDay,
    bg: () => `${bunting()} 0 7vh / 240px 60px repeat-x, ${ART.lighthouseDay.bg()}`,
  };

  // One look's rules (its colours, background and heading font); css() alone is every look's.
  function css(id) {
    if (id !== undefined) {
      const s = STYLES[id];
      const a = ART[id];
      if (!s?.vars || !a) return '';
      const at = `html[data-room="${id}"][data-room]`;
      const font = `"${s.font}", system-ui, sans-serif`;
      return `${at}{${Object.entries(s.vars).map(([k, v]) => `--${k}:${v};`).join('')}--felt:${a.felt};--rim:${a.rim};color-scheme:${s.light ? 'light' : 'dark'};}
${at} body{background:transparent;}
${at} body::before{content:"";${LAYER}z-index:-1;background:${typeof a.bg === 'function' ? a.bg() : a.bg};}
${at} h1, ${at} .room-code, ${at} .tv-title, ${at} .tv-game-name, ${at} .drink .big, ${at} .room-welcome b, ${at} .trip-next-name, ${at} .trip-head b, ${at} .trip-option b{font-family:${font};font-weight:400;letter-spacing:0;}`;
    }
    return IDS.map((look) => css(look)).filter(Boolean).join('\n');
  }

  const ROOM_ART = { ART, css };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROOM_ART;
  else root.ROOM_ART = ROOM_ART;
})(this);
