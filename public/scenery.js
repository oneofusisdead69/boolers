// Moving scenery for the room styles, on the TV only, behind everything on the screen: bats flying past at
// Halloween, a disco ball dropping from the ceiling in the club, snow at Christmas, a tumbleweed in
// the saloon… One moment at a time with quiet in between, and off for people who ask their phone
// for less motion.
//
//   Scenery.set(style)   start the scenery for a style (or stop it, for classic / null)
(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let layer = null;
  let current = null;
  let timers = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function el(html, style, life) {
    const d = document.createElement('div');
    d.className = 'sc';
    d.innerHTML = html;
    // CSS variables (--dx…) have to be set one by one; the rest can be assigned.
    for (const [k, v] of Object.entries(style)) {
      if (k.startsWith('--')) d.style.setProperty(k, v);
      else d.style[k] = v;
    }
    layer.appendChild(d);
    if (life) setTimeout(() => d.remove(), life);
    return d;
  }
  // Something drifting across or up/down the screen once.
  function drift(html, { from, to, dur, size = 24, spin = 0, opacity = 1, extra = {} }) {
    const d = el(html, {
      left: `${from[0]}vw`, top: `${from[1]}vh`, fontSize: `${size}px`, opacity,
      '--dx': `${to[0] - from[0]}vw`, '--dy': `${to[1] - from[1]}vh`, '--spin': `${spin}deg`,
      animation: `sc-drift ${dur}s linear forwards`, ...extra,
    }, dur * 1000 + 200);
    return d;
  }

  const BAT = `<svg viewBox="0 0 60 24" width="1em" height="0.4em"><g fill="#0a0610">
    <path class="sc-wing" d="M30 12 Q20 0 2 4 Q10 8 8 14 Q16 10 22 16 Q26 12 30 14Z"/>
    <path class="sc-wing r" d="M30 12 Q40 0 58 4 Q50 8 52 14 Q44 10 38 16 Q34 12 30 14Z"/>
    <ellipse cx="30" cy="13" rx="4" ry="5"/></g></svg>`;
  const GHOST = `<svg viewBox="0 0 60 70" width="1em" height="1.17em"><path d="M30 2C14 2 6 16 6 32v32l8-6 8 7 8-7 8 7 8-7 8 6V32C54 16 46 2 30 2Z" fill="rgba(240,236,255,0.85)"/>
    <ellipse cx="22" cy="28" rx="4" ry="6" fill="#1a1024"/><ellipse cx="38" cy="28" rx="4" ry="6" fill="#1a1024"/><ellipse cx="30" cy="44" rx="5" ry="6" fill="#1a1024"/></svg>`;
  const WITCH = `<svg viewBox="0 0 120 70" width="1em" height="0.58em"><g fill="#07040c">
    <path d="M4 50 L70 44 L72 48 L6 54Z"/><path d="M68 40 L100 34 L104 46 L100 58 L70 50Z"/>
    <path d="M40 46 Q38 30 48 22 L56 24 Q60 36 56 46Z"/><circle cx="52" cy="18" r="6"/>
    <path d="M40 16 L66 14 L54 10 L58 -4 L48 8Z"/><path d="M50 30 L64 38 L60 40 L48 34Z"/></g></svg>`;
  const SPIDER = `<svg viewBox="0 0 40 36" width="1em" height="0.9em"><g stroke="#07040c" stroke-width="2.2" fill="none" stroke-linecap="round">
    <path class="sc-legs" d="M14 14 Q4 6 2 14 M14 18 Q4 16 1 24 M16 21 Q8 26 6 34 M26 14 Q36 6 38 14 M26 18 Q36 16 39 24 M24 21 Q32 26 34 34"/></g>
    <ellipse cx="20" cy="20" rx="8" ry="9" fill="#07040c"/><circle cx="20" cy="10" r="5" fill="#07040c"/>
    <circle cx="18" cy="9" r="1.2" fill="#ff3b3b"/><circle cx="22" cy="9" r="1.2" fill="#ff3b3b"/></svg>`;
  const EYES = `<svg viewBox="0 0 40 12" width="1em" height="0.3em"><g fill="#ffd23f"><ellipse class="sc-blink" cx="10" cy="6" rx="6" ry="4"/><ellipse class="sc-blink" cx="30" cy="6" rx="6" ry="4"/></g>
    <g fill="#120a00"><ellipse cx="10" cy="6" rx="1.4" ry="3.4"/><ellipse cx="30" cy="6" rx="1.4" ry="3.4"/></g></svg>`;
  const PUMPKIN = `<svg viewBox="0 0 80 70" width="1em" height="0.875em">
    <path d="M38 14 Q36 4 44 2 L46 6 Q42 8 42 14Z" fill="#3c5a1e"/>
    <g fill="#e8661a"><ellipse cx="40" cy="42" rx="22" ry="26"/><ellipse cx="22" cy="42" rx="18" ry="24"/><ellipse cx="58" cy="42" rx="18" ry="24"/></g>
    <g fill="#ffd23f" class="sc-candle"><path d="M22 34 L30 26 L34 38Z"/><path d="M58 34 L50 26 L46 38Z"/><path d="M40 40 L36 48 L44 48Z"/>
    <path d="M18 52 Q40 70 62 52 L56 54 L52 50 L46 56 L40 52 L34 56 L28 50 L24 54Z"/></g></svg>`;
  // The headless horseman: a black horse at full gallop, a rider with no head, holding a flaming
  // jack-o'-lantern up high.
  const HORSEMAN = `<svg viewBox="0 0 160 110" width="1em" height="0.69em"><g fill="#05030a">
    <path class="sc-gallop" d="M30 58 Q24 46 34 40 Q60 34 92 40 Q104 30 112 22 L120 14 L122 22 L130 24 L134 34 L124 36 Q118 44 112 54 Q110 64 100 66 L60 66 Q44 66 30 58Z"/>
    <path d="M30 50 Q14 46 6 60 Q16 54 28 58Z"/>
    <g class="sc-legs-f"><path d="M96 62 L104 82 L112 92 L108 94 L98 84 L90 64Z"/><path d="M88 62 L86 84 L80 96 L76 94 L80 82 L82 62Z"/></g>
    <g class="sc-legs-b"><path d="M42 60 L30 80 L22 90 L18 88 L26 76 L34 58Z"/><path d="M52 62 L54 84 L62 94 L58 96 L48 84 L46 62Z"/></g>
    <path d="M66 40 Q62 20 68 10 L80 8 Q88 18 84 40Z"/><path d="M70 10 L78 10 L78 4 L70 4Z" opacity="0.6"/>
    <path d="M60 14 Q40 12 30 24 Q44 18 64 22Z"/><path d="M84 18 L98 2 L102 4 L90 22Z"/></g>
    <g class="sc-candle"><circle cx="100" cy="2" r="9" fill="#e8661a"/><path d="M95 0 L98 -3 L99 1Z M105 0 L102 -3 L101 1Z M96 5 Q100 8 104 5" fill="#ffd23f" stroke="#ffd23f"/></g>
    <path class="sc-flames" d="M94 -6 Q100 -22 106 -6 Q102 -12 100 -4 Q98 -12 94 -6Z" fill="#ff8a1a" opacity="0.85"/></svg>`;
  const SHIP = `<svg viewBox="0 0 80 40" width="1em" height="0.5em"><g fill="#0b0f16">
    <path d="M4 26 L76 26 L68 36 L12 36Z"/><rect x="34" y="4" width="2" height="22"/><path d="M36 6 L58 24 L36 24Z" opacity="0.85"/><path d="M34 8 L16 24 L34 24Z" opacity="0.7"/></g>
    <circle cx="20" cy="30" r="1.6" fill="#ffd27a"/><circle cx="40" cy="30" r="1.6" fill="#ffd27a"/><circle cx="58" cy="30" r="1.6" fill="#ffd27a"/><circle cx="35" cy="3" r="1.6" fill="#ff5a4a"/></svg>`;
  const GHOST_SHIP = `<svg viewBox="0 0 100 70" width="1em" height="0.7em"><g fill="rgba(150,255,210,0.55)" stroke="rgba(190,255,225,0.8)" stroke-width="0.8">
    <path d="M6 50 L94 50 L84 64 L16 64Z"/><path d="M10 50 L6 42 L20 46Z"/><rect x="30" y="8" width="2" height="42"/><rect x="58" y="4" width="2" height="46"/>
    <path d="M32 10 L52 14 L48 22 L54 30 L46 36 L52 46 L32 46Z"/><path d="M60 6 L82 12 L76 20 L84 30 L74 36 L80 46 L60 46Z"/>
    <path d="M30 8 L22 4 L26 10Z"/></g><circle cx="28" cy="57" r="1.4" fill="#d4fff0"/><circle cx="50" cy="57" r="1.4" fill="#d4fff0"/><circle cx="70" cy="57" r="1.4" fill="#d4fff0"/></svg>`;
  const MERMAID = `<svg viewBox="0 0 60 70" width="0.86em" height="1em"><g>
    <path d="M14 34 Q10 14 30 10 Q50 14 46 34 Q50 52 40 60 L20 60 Q10 52 14 34Z" fill="#c2412b"/>
    <ellipse cx="30" cy="26" rx="10" ry="12" fill="#f2c9a5"/>
    <path d="M18 70 Q18 44 30 42 Q42 44 42 70Z" fill="#f2c9a5"/>
    <path d="M20 50 Q25 46 30 50 Q35 46 40 50 L40 56 L20 56Z" fill="#3fb5a8"/>
    <path class="sc-wave-arm" d="M40 46 Q50 38 54 26" stroke="#f2c9a5" stroke-width="5" stroke-linecap="round" fill="none"/>
    <circle cx="26" cy="25" r="1.4" fill="#1a1024"/><circle cx="34" cy="25" r="1.4" fill="#1a1024"/><path d="M27 31 Q30 33 33 31" stroke="#a04040" stroke-width="1.2" fill="none"/></g></svg>`;
  const TAIL = `<svg viewBox="0 0 60 50" width="1em" height="0.83em"><path d="M26 50 Q22 30 30 22 Q16 16 6 2 Q24 6 30 14 Q36 6 54 2 Q44 16 30 22 Q38 30 34 50Z" fill="#3fb5a8"/></svg>`;
  const GULL = `<svg viewBox="0 0 60 20" width="1em" height="0.33em"><path class="sc-wing" d="M2 8 Q16 0 30 12 Q44 0 58 8" fill="none" stroke="#e8eef2" stroke-width="3" stroke-linecap="round"/></svg>`;
  const SAILBOAT = `<svg viewBox="0 0 60 60" width="1em" height="1em">
    <path d="M30 4 L30 44 L8 44Z" fill="#fdfcf7"/><path d="M33 10 L33 44 L52 44Z" fill="#f1ede2"/><rect x="29.5" y="2" width="1.6" height="44" fill="#3a3a3a"/>
    <path d="M4 46 L56 46 L50 54 L10 54Z" fill="#b3392f"/><path d="M10 54 L50 54" stroke="#7a2620" stroke-width="1.5"/></svg>`;
  const DOLPHIN = `<svg viewBox="0 0 70 34" width="1em" height="0.49em"><path d="M2 22 Q16 4 40 6 Q56 7 66 16 Q58 14 54 16 Q60 20 62 26 Q52 20 44 20 Q38 26 30 26 L33 20 Q18 20 8 26 Q10 22 2 22Z" fill="#5b7f9c"/>
    <path d="M30 8 Q32 0 40 2 Q36 4 36 7Z" fill="#4c6d87"/><circle cx="58" cy="15" r="1.2" fill="#10202c"/></svg>`;
  // The pirate ship's: the Jolly Roger, a lantern, a kraken's tentacle, a whale's tail.
  const JOLLY_ROGER = `<svg viewBox="0 0 90 60" width="1em" height="0.67em"><rect x="0" y="0" width="3" height="60" fill="#2a1a0e"/>
    <path class="sc-flag" d="M3 4 Q30 0 46 6 Q64 12 88 6 L88 40 Q64 46 46 40 Q30 34 3 38Z" fill="#0d0d10"/>
    <g fill="#f2efe6"><circle cx="45" cy="19" r="7"/><rect x="41" y="24" width="8" height="5" rx="1.5"/>
    <path d="M30 28 L60 36 M60 28 L30 36" stroke="#f2efe6" stroke-width="3" stroke-linecap="round"/></g>
    <circle cx="42.5" cy="18.5" r="1.8" fill="#0d0d10"/><circle cx="47.5" cy="18.5" r="1.8" fill="#0d0d10"/></svg>`;
  const LANTERN = `<svg viewBox="0 0 30 64" width="0.47em" height="1em"><path d="M15 0 V14" stroke="#2a1a0e" stroke-width="1.5"/>
    <path d="M7 16 H23 L21 22 H9Z" fill="#2a1a0e"/><rect x="8" y="22" width="14" height="26" rx="3" fill="rgba(255,200,110,0.85)" stroke="#2a1a0e" stroke-width="2"/>
    <path d="M15 22 V48 M8 35 H22" stroke="#2a1a0e" stroke-width="1.2"/><path d="M8 48 H22 L19 54 H11Z" fill="#2a1a0e"/></svg>`;
  const TENTACLE = `<svg viewBox="0 0 60 160" width="0.375em" height="1em"><path d="M30 160 Q8 120 26 86 Q44 52 22 24 Q14 10 26 4 Q38 0 36 14 Q34 24 40 34 Q56 64 40 96 Q30 124 44 160Z" fill="#7a3b6e"/>
    <g fill="#d99bc6">${[30, 50, 72, 96, 120, 142].map((y, i) => `<circle cx="${i % 2 ? 36 : 30}" cy="${y}" r="${3.5 - i * 0.2}"/>`).join('')}</g></svg>`;
  const FLUKE = `<svg viewBox="0 0 120 60" width="1em" height="0.5em"><path d="M60 60 Q56 36 60 26 Q40 30 6 8 Q30 4 52 16 Q60 20 60 24 Q60 20 68 16 Q90 4 114 8 Q80 30 60 26 Q64 36 60 60Z" fill="#0b1014" stroke="#e98a52" stroke-width="1.2"/></svg>`;
  // Bar room bits: a dartboard and a dart, a mouse, a fly, a cat.
  const DARTBOARD = `<svg viewBox="0 0 60 60" width="1em" height="1em"><circle cx="30" cy="30" r="29" fill="#111"/>
    ${[26, 20, 12, 6, 2.5].map((r, i) => `<circle cx="30" cy="30" r="${r}" fill="${['#1d8f4e', '#e8dcc0', '#d3262e', '#e8dcc0', '#d3262e'][i]}"/>`).join('')}
    ${Array.from({ length: 10 }, (_, i) => `<path d="M30 30 L${30 + 26 * Math.cos(i * 0.628)} ${30 + 26 * Math.sin(i * 0.628)}" stroke="#111" stroke-width="1"/>`).join('')}</svg>`;
  const DART = `<svg viewBox="0 0 40 8" width="1em" height="0.2em"><path d="M0 4 L10 1 L10 7Z" fill="#e63946"/><rect x="10" y="3" width="20" height="2" fill="#bbb"/><path d="M30 2 L40 4 L30 6Z" fill="#666"/></svg>`;
  const MOUSE = `<svg viewBox="0 0 50 24" width="1em" height="0.48em"><path d="M4 22 Q0 12 10 8 Q22 2 34 10 L44 14 Q46 18 40 20 L8 22Z" fill="#5b524a"/>
    <circle cx="30" cy="8" r="4" fill="#7a6f64"/><circle cx="41" cy="15" r="1.2" fill="#111"/><path d="M4 20 Q-6 18 -10 10" stroke="#5b524a" stroke-width="1.5" fill="none"/></svg>`;
  const FLY = `<svg viewBox="0 0 20 14" width="1em" height="0.7em"><ellipse cx="10" cy="9" rx="4" ry="3" fill="#111"/>
    <ellipse class="sc-buzz" cx="7" cy="5" rx="4" ry="2.4" fill="rgba(220,230,255,0.6)"/><ellipse class="sc-buzz" cx="13" cy="5" rx="4" ry="2.4" fill="rgba(220,230,255,0.6)"/></svg>`;
  const CAT = `<svg viewBox="0 0 80 50" width="1em" height="0.62em"><g fill="#9d958b">
    <path class="sc-tail" d="M12 26 Q0 20 4 6 Q6 2 8 6 Q6 18 16 22Z"/><ellipse cx="34" cy="30" rx="22" ry="11"/><circle cx="60" cy="22" r="9"/>
    <path d="M53 16 L55 6 L60 14Z M62 14 L67 6 L68 17Z"/><g class="sc-legs-f"><rect x="18" y="36" width="4" height="13" rx="2"/><rect x="46" y="36" width="4" height="13" rx="2"/></g>
    <g class="sc-legs-b"><rect x="24" y="36" width="4" height="13" rx="2"/><rect x="52" y="36" width="4" height="13" rx="2"/></g></g>
    <path d="M26 21 Q28 26 26 31 M34 20 Q36 26 34 32 M42 21 Q44 26 42 31" stroke="#6f675e" stroke-width="2.4" fill="none"/>
    <circle cx="63" cy="21" r="1.6" fill="#3d8f3a"/><path d="M53 16 L55 8 L58 14Z" fill="#e4a6a0"/></svg>`;
  // The diner's ceiling fan; space's ringed planet, flying saucer and astronaut; Santa's sleigh.
  // A ceiling fan seen from across the room: the rod down from the ceiling, the motor, and the
  // blades turning in a flattened circle, with a light globe under it.
  const FAN = `<svg viewBox="0 0 220 100" width="1em" height="0.45em">
    <rect x="107" y="0" width="6" height="30" fill="#8a8f96"/><path d="M96 0 H124 L120 6 H100Z" fill="#c9ccd1"/>
    <g transform="translate(110 44) scale(1 0.22)"><g class="sc-blades">${[0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a})" d="M10 -8 L100 -14 Q106 0 100 14 L10 8Z" fill="#8a6446" stroke="#4e3826" stroke-width="5"/>`).join('')}</g></g>
    <rect x="96" y="28" width="28" height="16" rx="6" fill="#c9ccd1" stroke="#8a8f96" stroke-width="1.5"/><rect x="94" y="40" width="32" height="6" rx="3" fill="#a9adb3"/>
    <path d="M102 48 H118 L116 54 H104Z" fill="#a9adb3"/><circle cx="110" cy="64" r="11" fill="rgba(255,236,190,0.95)"/></svg>`;
  const PLANET = `<svg viewBox="0 0 140 90" width="1em" height="0.64em"><defs><radialGradient id="pl" cx="40%" cy="35%"><stop offset="0" stop-color="#f6c48a"/><stop offset="1" stop-color="#9c4f2f"/></radialGradient></defs>
    <ellipse cx="70" cy="45" rx="66" ry="14" fill="none" stroke="rgba(240,210,170,0.55)" stroke-width="5"/><circle cx="70" cy="45" r="30" fill="url(#pl)"/>
    <path d="M4 45 A66 14 0 0 0 136 45" fill="none" stroke="rgba(240,210,170,0.8)" stroke-width="5"/>
    <path d="M44 38 Q70 30 96 38 M42 50 Q70 44 98 52" stroke="rgba(120,60,30,0.35)" stroke-width="3" fill="none"/></svg>`;
  const UFO = `<svg viewBox="0 0 90 40" width="1em" height="0.44em"><ellipse cx="45" cy="16" rx="16" ry="12" fill="rgba(160,230,255,0.75)"/>
    <ellipse cx="45" cy="24" rx="44" ry="10" fill="#9aa4b4"/><ellipse cx="45" cy="22" rx="44" ry="6" fill="#c9d1dc"/>
    <g class="sc-ufolights">${[14, 30, 45, 60, 76].map((x) => `<circle cx="${x}" cy="26" r="2.6" fill="#ffd23f"/>`).join('')}</g></svg>`;
  const ASTRONAUT = `<svg viewBox="0 0 60 70" width="0.86em" height="1em"><g fill="#eef1f5" stroke="#9aa4b4" stroke-width="1.5">
    <rect x="16" y="26" width="28" height="28" rx="8"/><rect x="2" y="28" width="16" height="9" rx="4.5" transform="rotate(-30 10 32)"/><rect x="42" y="28" width="16" height="9" rx="4.5" transform="rotate(25 50 32)"/>
    <rect x="18" y="50" width="10" height="18" rx="5"/><rect x="32" y="50" width="10" height="18" rx="5"/><circle cx="30" cy="16" r="14"/></g>
    <ellipse cx="31" cy="16" rx="9" ry="7" fill="#203a5c"/><path d="M26 12 Q30 10 34 12" stroke="#9cc8ff" stroke-width="1.5" fill="none"/></svg>`;
  const SLEIGH = `<svg viewBox="0 0 200 50" width="1em" height="0.25em"><g fill="#a0683a">
    ${[0, 34, 68].map((x) => `<g transform="translate(${x} 0)"><ellipse cx="18" cy="24" rx="12" ry="6"/><path d="M28 20 L34 10 L33 22Z"/><path d="M33 10 L36 2 M33 10 L30 3" stroke="#160d0a" stroke-width="1.5"/>
    <g class="sc-legs-f"><rect x="9" y="27" width="2" height="10"/><rect x="24" y="27" width="2" height="10"/></g></g>`).join('')}
    <path d="M104 22 L130 26" stroke="#e8d7a8" stroke-width="1"/><path d="M128 18 L176 18 Q186 18 184 30 L130 32 Q124 26 128 18Z" fill="#c0392b"/><path d="M124 36 L188 36 Q194 34 194 30" stroke="#e8c15a" stroke-width="2.5" fill="none"/>
    <circle cx="152" cy="13" r="6" fill="#f2d2b6"/><path d="M144 10 L152 0 L160 10Z" fill="#c0392b"/><circle cx="160" cy="11" r="1.8" fill="#fff"/><path d="M146 16 Q152 24 158 16Z" fill="#fff"/>
    <rect x="140" y="18" width="24" height="10" rx="4" fill="#c0392b"/><circle cx="102" cy="20" r="2.4" fill="#ff3b3b"/></g></svg>`;
  // Club: hands in the air. Castle: a banner, a dragon, a knight. Jazz: the mic stand.
  const HANDS = `<svg viewBox="0 0 400 80" width="1em" height="0.2em"><g fill="#07050d">${[20, 70, 120, 175, 230, 280, 330, 380].map((x, i) => `<g class="sc-hand" style="animation-delay:-${(i * 0.17).toFixed(2)}s"><rect x="${x - 6}" y="${20 + (i % 3) * 8}" width="12" height="70" rx="6"/><ellipse cx="${x}" cy="${18 + (i % 3) * 8}" rx="9" ry="11"/></g>`).join('')}</g></svg>`;
  const BANNER = (color) => `<svg viewBox="0 0 50 140" width="0.36em" height="1em"><rect x="0" y="0" width="50" height="6" fill="#5a3d1e"/>
    <path class="sc-cloth" d="M4 6 H46 V120 L25 104 L4 120Z" fill="${color}"/><path d="M14 40 L25 26 L36 40 L25 70Z" fill="#e8c15a"/></svg>`;
  const DRAGON = `<svg viewBox="0 0 220 90" width="1em" height="0.41em"><g fill="#5f8a3c" stroke="#2f4a1c" stroke-width="1.5">
    <path d="M10 52 Q40 40 70 48 L140 44 Q170 40 188 30 L200 34 Q196 44 180 50 Q150 62 120 60 L70 62 Q40 66 10 52Z"/>
    <path class="sc-dwing" d="M80 48 Q90 6 130 2 Q118 20 124 30 Q140 22 150 26 Q134 36 128 48Z"/>
    <path d="M188 30 L196 20 L198 30Z"/><path d="M14 52 L0 46 L6 56Z"/></g><circle cx="192" cy="33" r="1.8" fill="#ffd23f"/>
    <path class="sc-fire" d="M202 36 Q214 30 220 36 Q212 40 220 46 Q208 44 202 40Z" fill="#ff8a1a"/></svg>`;
  const KNIGHT = `<svg viewBox="0 0 50 90" width="0.56em" height="1em"><g fill="#9aa4b0" stroke="#5b6470" stroke-width="1.2">
    <rect x="14" y="4" width="22" height="22" rx="8"/><rect x="12" y="26" width="26" height="30" rx="5"/>
    <g class="sc-legs-f"><rect x="14" y="54" width="9" height="34" rx="3"/></g><g class="sc-legs-b"><rect x="27" y="54" width="9" height="34" rx="3"/></g>
    <path d="M38 30 L48 2" stroke="#c9ccd1" stroke-width="3"/><path d="M6 30 H16 V48 Q11 54 6 48Z" fill="#c0392b"/></g>
    <rect x="18" y="12" width="14" height="3" fill="#20262d"/><path d="M25 4 Q30 -6 38 0" stroke="#c0392b" stroke-width="3" fill="none"/></svg>`;
  const MIC = `<svg viewBox="0 0 40 160" width="0.25em" height="1em"><g fill="#15121a"><rect x="18" y="30" width="4" height="120"/><ellipse cx="20" cy="154" rx="16" ry="5"/>
    <rect x="13" y="6" width="14" height="26" rx="7" fill="#9aa4b0"/><path d="M13 16 H27 M13 21 H27" stroke="#5b6470"/></g></svg>`;
  // Tiki: a torch, a parrot, a coconut. Speakeasy: the bulb. Saloon: the poster, a hawk, a hat.
  // Beer hall: a stein.
  const TORCH = `<svg viewBox="0 0 30 200" width="0.15em" height="1em"><rect x="12" y="40" width="6" height="160" fill="#5a3d1e"/>
    <path d="M6 30 H24 L20 48 H10Z" fill="#8a6a3a"/><path d="M8 36 H22 M9 42 H21" stroke="#5a3d1e"/></svg>`;
  const PARROT = `<svg viewBox="0 0 80 50" width="1em" height="0.62em"><path d="M10 30 Q30 18 52 22 L66 18 Q74 20 70 28 L56 32 Q40 40 20 38Z" fill="#e8352f"/>
    <path class="sc-wing" d="M30 26 Q38 0 56 4 Q46 16 48 26Z" fill="#2f7fe0"/><path d="M10 30 L0 40 L16 36Z" fill="#ffd23f"/>
    <path d="M70 22 Q80 24 74 30 Z" fill="#ffd23f"/><circle cx="64" cy="22" r="1.8" fill="#111"/></svg>`;
  const COCONUT = `<svg viewBox="0 0 30 30" width="1em" height="1em"><circle cx="15" cy="15" r="13" fill="#6b4524"/><circle cx="11" cy="11" r="1.8" fill="#3b2512"/><circle cx="17" cy="10" r="1.8" fill="#3b2512"/><circle cx="14" cy="16" r="1.8" fill="#3b2512"/></svg>`;
  const BULB = `<svg viewBox="0 0 30 90" width="0.33em" height="1em"><path d="M15 0 V52" stroke="#2a2420" stroke-width="1.5"/><rect x="11" y="50" width="8" height="8" fill="#7a6a4a"/>
    <path d="M15 58 Q2 66 6 78 Q15 92 24 78 Q28 66 15 58Z" fill="rgba(255,206,120,0.92)"/><path d="M12 66 Q15 74 18 66" stroke="#ff9a2a" stroke-width="1.2" fill="none"/></svg>`;
  // The speakeasy: the back-bar shelf, the door with its peephole, the gramophone.
  const SHELF = `<svg viewBox="0 0 220 90" width="1em" height="0.41em"><rect x="0" y="70" width="220" height="8" fill="#5a3418"/><rect x="0" y="78" width="220" height="4" fill="#3a2010"/>
    ${[[10, '#2f6b3a', 46], [32, '#8a4a1a', 54], [56, '#d9c8a0', 40], [76, '#6b1a1a', 58], [100, '#2f5a6b', 44], [122, '#8a6a1a', 50], [146, '#3a2a1a', 60], [172, '#2f6b3a', 42], [194, '#a0521a', 52]].map(([x, c, h]) => `<rect x="${x}" y="${70 - h}" width="14" height="${h}" rx="3" fill="${c}"/><rect x="${x + 4}" y="${70 - h - 12}" width="6" height="14" fill="${c}"/><rect x="${x + 2}" y="${70 - h * 0.6}" width="10" height="10" fill="#e8dcc0" opacity="0.8"/><rect x="${x + 2}" y="${70 - h + 4}" width="3" height="${h - 10}" fill="#fff" opacity="0.18"/>`).join('')}</svg>`;
  const DOOR = `<svg viewBox="0 0 90 170" width="0.53em" height="1em"><rect x="0" y="0" width="90" height="170" fill="#2a140c"/><rect x="6" y="6" width="78" height="164" fill="#4a2814"/>
    <rect x="14" y="70" width="62" height="40" fill="none" stroke="#2a140c" stroke-width="3"/><rect x="14" y="120" width="62" height="40" fill="none" stroke="#2a140c" stroke-width="3"/>
    <rect x="22" y="30" width="46" height="18" rx="2" fill="#120804"/><g class="sc-slit-cover"><rect x="22" y="30" width="46" height="18" rx="2" fill="#6b3a1c" stroke="#b08d45" stroke-width="1.5"/></g>
    <g class="sc-peep-eyes"><ellipse cx="36" cy="39" rx="5" ry="3.4" fill="#f2efe6"/><ellipse cx="54" cy="39" rx="5" ry="3.4" fill="#f2efe6"/><circle class="sc-pupil" cx="36" cy="39" r="2" fill="#111"/><circle class="sc-pupil" cx="54" cy="39" r="2" fill="#111"/></g>
    <circle cx="72" cy="100" r="4" fill="#b08d45"/></svg>`;
  const GRAMOPHONE = `<svg viewBox="0 0 120 110" width="1em" height="0.92em"><rect x="10" y="74" width="80" height="30" rx="3" fill="#4a2814" stroke="#2a140c" stroke-width="2"/>
    <g class="sc-record"><ellipse cx="50" cy="72" rx="34" ry="7" fill="#111"/><ellipse cx="50" cy="72" rx="8" ry="2" fill="#c0392b"/></g>
    <path d="M72 70 L88 40" stroke="#b08d45" stroke-width="4"/><path d="M84 46 Q90 20 118 4 Q110 30 112 52 Q100 44 84 46Z" fill="#d9ad52" stroke="#9a7430" stroke-width="2"/></svg>`;
  const POSTER = `<svg viewBox="0 0 60 80" width="0.75em" height="1em"><rect x="2" y="2" width="56" height="76" fill="#e7d3a6" stroke="#a8875a" stroke-width="2"/>
    <text x="30" y="18" font-size="11" font-family="serif" font-weight="700" text-anchor="middle" fill="#3b2512">WANTED</text>
    <circle cx="30" cy="40" r="12" fill="#a8875a"/><path d="M18 34 H42 L38 28 H22Z" fill="#3b2512"/>
    <text x="30" y="70" font-size="8" font-family="serif" text-anchor="middle" fill="#3b2512">$500</text></svg>`;
  const HAWK = `<svg viewBox="0 0 80 30" width="1em" height="0.375em"><path class="sc-wing" d="M2 14 Q20 2 40 16 Q60 2 78 14 Q60 10 46 20 L40 26 L34 20 Q20 10 2 14Z" fill="#3b2512"/></svg>`;
  const HAT = `<svg viewBox="0 0 70 34" width="1em" height="0.49em"><path d="M2 26 Q35 36 68 26 Q60 22 52 24 L48 6 Q35 0 22 6 L18 24 Q10 22 2 26Z" fill="#7a5230"/><rect x="18" y="18" width="32" height="5" fill="#3b2512"/></svg>`;
  const STEIN = `<svg viewBox="0 0 50 60" width="0.83em" height="1em"><rect x="6" y="14" width="30" height="42" rx="4" fill="rgba(255,206,90,0.9)" stroke="#8a6a3a" stroke-width="2"/>
    <path d="M36 22 H44 Q48 22 48 28 V40 Q48 46 42 46 H36" fill="none" stroke="#8a6a3a" stroke-width="3"/>
    <path d="M4 14 Q8 2 20 6 Q28 0 36 8 Q42 10 38 16 H4Z" fill="#fffaf0"/></svg>`;
  const TUMBLEWEED = `<svg viewBox="0 0 40 40" width="1em" height="1em"><g fill="none" stroke="#a07b45" stroke-width="2">
    <circle cx="20" cy="20" r="17"/><path d="M5 15 Q20 30 35 12 M8 28 Q22 8 33 30 M14 5 Q12 22 26 36 M30 6 Q16 18 10 34"/></g></svg>`;

  // Each style has a little still decor (pumpkins, torches, clouds over the moon) and a set of
  // moments: one plays, then it's quiet for a while (GAP seconds) before the next, never the same
  // one twice in a row.
  const GAP = [14, 32];

  // A short shower of something falling or rising, for `secs` seconds.
  function shower(secs, every, fn) {
    const end = Date.now() + secs * 1000;
    const tick = () => {
      if (Date.now() > end || !layer) return;
      fn();
      later(tick, every * 1000 * rand(0.6, 1.4));
    };
    tick();
  }
  function later(fn, ms) {
    const t = setTimeout(fn, ms);
    timers.push({ stop: () => clearTimeout(t) });
  }

  const bats = () => {
    const up = Math.random() < 0.5;
    const y = rand(2, 22);
    for (let i = 0; i < pick([2, 3, 4]); i++) {
      drift(BAT, { from: [up ? -15 : 110, y + i * 5], to: [up ? 115 : -15, y + rand(-5, 25)], dur: rand(5, 8), size: rand(60, 100), extra: { animationDelay: `${i * 0.35}s` } })
        .classList.add(up ? 'sc-face-r' : 'sc-face-l');
    }
  };
  const smoke = (cls = 'sc-smoke') => shower(10, 1.2, () => drift('', { from: [rand(5, 95), 105], to: [rand(5, 95), rand(20, 50)], dur: rand(12, 18), size: 10 }).classList.add(cls));
  const bubbles = (cls) => shower(8, 0.3, () => drift('', { from: [rand(0, 100), 104], to: [rand(0, 100), rand(50, 80)], dur: rand(4, 8), size: rand(4, 10) }).classList.add('sc-bubble', ...cls));
  const fall = (chars, secs, every, opacity = 0.6) => shower(secs, every, () => drift(pick(chars), { from: [rand(0, 100), -6], to: [rand(0, 100), 106], dur: rand(9, 15), size: rand(14, 24), spin: rand(-360, 360), opacity }));
  // ---------- Kinds of moment, for the rooms below ----------
  // What can be seen on the TV round the table: the strip along the top (under the heading), the
  // left edge, and the floor along the bottom (and the bottom right, below the sidebar).
  const cue = (name, ms = 0) => later(() => window.Ambience?.cue(name), ms);
  // Something going along the floor (or anywhere), either way. Emoji face left, so they're turned
  // round to go right (`faces: 'right'` for ones drawn facing right).
  function crossing(html, { y = 92, dur = 8, size = 50, faces = 'left', bob = true, cls = [] } = {}) {
    const right = Math.random() < 0.5;
    const d = drift(`<span>${html}</span>`, { from: [right ? -10 : 108, y], to: [right ? 108 : -10, y + rand(-2, 2)], dur, size });
    d.classList.add('sc-walker', ...cls);
    if ((right && faces === 'left') || (!right && faces === 'right')) d.classList.add('flip');
    if (bob) d.classList.add('bob');
    return d;
  }
  // Something popping up from below, waving or wiggling a moment, and going back down.
  const popup = (html, { x, bottom = 0, size = 70, life = 5000 }) =>
    el(`<span>${html}</span>`, { left: `${x}vw`, bottom: `${bottom}vh`, fontSize: `${size}px`, animation: `sc-popup ${life / 1000}s ease-in-out forwards` }, life).classList.add('sc-pop');
  // Something slid along the bar (or the floor), slowing to a stop, then fading.
  const slide = (html, { y = 93, size = 44 } = {}) => {
    const right = Math.random() < 0.5;
    el(`<span>${html}</span>`, { left: `${right ? -6 : 96}vw`, top: `${y}vh`, fontSize: `${size}px`, '--dx': `${right ? 40 : -40}vw`, animation: 'sc-slide 4.5s cubic-bezier(0.1, 0.7, 0.3, 1) forwards' }, 4600).classList.add('sc-slider');
  };
  // A burst of little things flying out of one spot and falling.
  function burst(chars, { x, y, n = 24, spread = 30, size = [14, 24] }) {
    for (let i = 0; i < n; i++) {
      el(pick(chars), { left: `${x}vw`, top: `${y}vh`, fontSize: `${rand(...size)}px`, '--bx': `${rand(-spread, spread)}vw`, '--by': `${rand(-30, -8)}vh`, '--fall': `${rand(20, 60)}vh`, '--spin': `${rand(-540, 540)}deg`, animation: `sc-burst ${rand(2.2, 3.2)}s cubic-bezier(0.2, 0.6, 0.4, 1) forwards` }, 3400);
    }
  }
  // Something tossed up and caught (a burger flipped, a juggler's balls).
  const toss = (html, { x, y, size = 40, height = 14, spins = 2, delay = 0 }) =>
    el(html, { left: `${x}vw`, top: `${y}vh`, fontSize: `${size}px`, '--h': `-${height}vh`, '--spin': `${spins * 360}deg`, animation: `sc-toss 1.3s ease-in-out ${delay}s 2` }, 3000 + delay * 1000);
  // Notes floating up from somewhere.
  const notes = (x, y, color = '#e3b23c', secs = 6) => shower(secs, 0.7, () => drift(pick(['♪', '♫', '♬']), { from: [x + rand(-2, 2), y], to: [x + rand(-6, 14), y - rand(25, 45)], dur: rand(5, 7), size: rand(20, 30), spin: rand(-30, 30), opacity: 0.75, extra: { color } }));

  const embers = (secs, from) => shower(secs, 0.4, () => drift('', { from: from(), to: [rand(5, 95), rand(30, 70)], dur: rand(4, 7), size: 6 }).classList.add('sc-ember'));


  // ---------- The sea, from the top of the lighthouse ----------
  // The horizon is 44% of the way down; the railing is along the bottom.

  const lightning = () => {
    el('', { inset: '0' }, 1400).classList.add('sc-lightning');
    later(() => window.Ambience?.cue('thunder'), 700);
  };
  const across = (svg, { y, dur, size, cls = [] }) => {
    const right = Math.random() < 0.5;
    drift(svg, { from: [right ? -20 : 110, y], to: [right ? 110 : -20, y], dur, size }).classList.add(...cls, right ? 'sc-face-r' : 'sc-face-l');
  };
  function seaMoments(storm = false) {
    return [
      // The lamp's beam sweeps round, out over the water.
      () => el('', { left: '50vw', bottom: '-10vh' }, 7000).classList.add('sc-beam'),
      // A wave crashes on the rocks below, spray flying up.
      () => {
        const x = rand(10, 80);
        el('<i></i><i></i><i></i><i></i><i></i>', { left: `${x}vw`, bottom: '10vh' }, 3200).classList.add('sc-crash');
        window.Ambience?.cue('crash');
      },
      // A ship passes along the horizon, lights on.
      () => across(SHIP, { y: 39, dur: rand(26, 34), size: rand(50, 80), cls: storm ? ['sc-pitch'] : [] }),
      // A ghost ship drifts by, glowing, and fades away.
      () => across(GHOST_SHIP, { y: 36, dur: rand(18, 24), size: rand(80, 120), cls: ['sc-ghostship'] }),
      // A mermaid pops up out of the water, waves, and dives with a flick of her tail.
      () => {
        const m = el(`<div class="sc-mer-in">${MERMAID}</div><div class="sc-mer-tail">${TAIL}</div>`, { left: `${rand(15, 75)}vw`, top: '46vh', fontSize: `${rand(60, 90)}px` }, 7000);
        m.classList.add('sc-mermaid');
        later(() => window.Ambience?.cue('splash'), 4600);
      },
    ];
  }

  // A fine day: gulls overhead, sailing boats, dolphins, the odd wave on the rocks.
  function dayMoments() {
    return [
      () => {
        const right = Math.random() < 0.5;
        const y = rand(6, 24);
        for (let i = 0; i < pick([2, 3, 5]); i++) {
          drift(GULL, { from: [right ? -10 : 110, y + rand(-4, 4)], to: [right ? 110 : -10, y + rand(-6, 10)], dur: rand(10, 14), size: rand(30, 55), extra: { animationDelay: `${i * rand(0.3, 0.9)}s`, filter: 'drop-shadow(0 1px 0 rgba(40, 60, 80, 0.5))' } });
        }
      },
      () => across(SAILBOAT, { y: rand(36, 41), dur: rand(40, 55), size: rand(30, 50), cls: ['sc-pitch'] }),
      () => across(SHIP, { y: 39, dur: rand(30, 38), size: rand(50, 70) }),
      // Dolphins leaping out of the water, one after another.
      () => {
        const x = rand(10, 70);
        for (let i = 0; i < pick([1, 2, 3]); i++) {
          el(DOLPHIN, { left: `${x + i * 4}vw`, top: `${rand(55, 62)}vh`, fontSize: `${rand(50, 70)}px`, animationDelay: `${i * 0.5}s` }, 4000)
            .classList.add('sc-dolphin');
        }
        later(() => window.Ambience?.cue('splash'), 1500);
      },
      () => {
        el('<i></i><i></i><i></i><i></i><i></i>', { left: `${rand(10, 80)}vw`, bottom: '10vh' }, 3200).classList.add('sc-crash');
        window.Ambience?.cue('crash');
      },
      () => {
        const m = el(`<div class="sc-mer-in">${MERMAID}</div><div class="sc-mer-tail">${TAIL}</div>`, { left: `${rand(15, 75)}vw`, top: '46vh', fontSize: `${rand(60, 90)}px` }, 7000);
        m.classList.add('sc-mermaid');
        later(() => window.Ambience?.cue('splash'), 4600);
      },
    ];
  }

  // Fog: the foghorn sounds now and then (a ship out there answers), the beam glows in the murk,
  // and ships and the ghost ship loom out of the grey and back in.
  const foghorn = () => window.Ambience?.cue('foghorn');
  function fogMoments() {
    return [
      () => { foghorn(); el('', { left: '50vw', bottom: '-10vh' }, 7000).classList.add('sc-beam', 'sc-fogbeam'); },
      () => { foghorn(); later(() => window.Ambience?.cue('foghornFar'), rand(7000, 10000)); },
      () => window.Ambience?.cue('foghornFar'),
      () => across(SHIP, { y: 40, dur: rand(30, 38), size: rand(45, 65), cls: ['sc-fogged'] }),
      () => across(GHOST_SHIP, { y: 36, dur: rand(18, 24), size: rand(80, 120), cls: ['sc-ghostship'] }),
      () => el('', { left: '50vw', bottom: '-10vh' }, 7000).classList.add('sc-beam', 'sc-fogbeam'),
    ];
  }

  const hearth = () => [() => embers(6, () => [rand(25, 75), 102]), () => embers(5, () => [rand(25, 75), 102]), () => fall(['☘️'], 5, 1.2, 0.45)];

  const SCENES = {
    halloween: {
      decor() {
        el('', { left: '-20vw', bottom: '-6vh', width: '140vw', height: '28vh', animation: 'sc-fog 22s ease-in-out infinite alternate' }).classList.add('sc-fog');
        el(PUMPKIN, { left: '1vw', bottom: '1vh', fontSize: '70px' }).classList.add('sc-pumpkin');
        el(PUMPKIN, { right: '1vw', bottom: '1vh', fontSize: '56px' }).classList.add('sc-pumpkin', 'late');
        const clouds = el('<div class="sc-cloud a"></div><div class="sc-cloud b"></div><div class="sc-cloud c"></div>', { left: '80vw', top: '14vh' });
        clouds.classList.add('sc-clouds');
      },
      moments: [
        bats,
        // A ghost rises out of the fog, wobbles and fades.
        () => { const x = rand(8, 85); drift(GHOST, { from: [x, 90], to: [x + rand(-12, 12), rand(15, 40)], dur: rand(7, 10), size: rand(50, 80) }).classList.add('sc-ghost'); },
        // A witch on her broomstick, across the moon.
        () => {
          const right = Math.random() < 0.6;
          drift(WITCH, { from: [right ? -20 : 115, rand(4, 14)], to: [right ? 115 : -20, rand(2, 20)], dur: rand(7, 9), size: rand(90, 130) })
            .classList.add('sc-witch', right ? 'sc-face-r' : 'sc-face-l');
        },
        // A spider drops on its thread, dangles, and climbs back up.
        () => el(`<div class="sc-thread"></div>${SPIDER}`, { left: `${rand(15, 85)}vw`, top: '0', fontSize: `${rand(54, 72)}px` }, 9000).classList.add('sc-spider'),
        // Eyes open in the dark, blink, and are gone.
        () => el(EYES, { left: `${rand(5, 90)}vw`, top: `${rand(35, 85)}vh`, fontSize: `${rand(36, 60)}px` }, 4200).classList.add('sc-eyes'),
        // Lightning, and the thunder after it (on the TV).
        () => {
          el('', { inset: '0' }, 1400).classList.add('sc-lightning');
          later(() => window.Ambience?.cue('thunder'), 700);
        },
        // The clouds part from the moon, and a wolf howls.
        () => {
          const clouds = layer.querySelector('.sc-clouds');
          if (!clouds) return;
          clouds.classList.add('parted');
          later(() => window.Ambience?.cue('howl'), 1600);
          later(() => clouds.classList.remove('parted'), 11000);
        },
        // The headless horseman gallops past.
        () => {
          const right = Math.random() < 0.5;
          drift(HORSEMAN, { from: [right ? -30 : 115, 58], to: [right ? 115 : -30, 58], dur: 6, size: rand(150, 200) })
            .classList.add('sc-horseman', right ? 'sc-face-r' : 'sc-face-l');
          window.Ambience?.cue('gallop');
        },
      ],
    },
    club: {
      moments: [
        // The disco ball drops from the ceiling, spins with lights everywhere, and goes back up.
        () => {
          const ball = el('<div class="sc-ball-string"></div><div class="sc-ball"></div>', { left: 'calc(50% - 40px)', top: '0' }, 14000);
          ball.classList.add('sc-disco');
          for (let i = 0; i < 10; i++) {
            el('', {
              left: `${rand(5, 95)}vw`, top: `${rand(10, 90)}vh`,
              background: pick(['#ff2bd6', '#29f0ff', '#ffffff', '#9b5cff', '#ffd23f']),
              animation: `sc-spot ${rand(3, 6)}s ease-in-out ${rand(0.8, 2)}s infinite alternate, sc-fade-out 1s 12.5s forwards`,
              '--sx': `${rand(-30, 30)}vw`, '--sy': `${rand(-25, 25)}vh`,
            }, 14000).classList.add('sc-spot');
          }
        },
        // Lasers sweeping the room from the corners.
        () => {
          for (let i = 0; i < 6; i++) {
            const left = i % 2 === 0;
            el('', { [left ? 'left' : 'right']: '0', bottom: '0', background: pick(['#ff2bd6', '#29f0ff', '#3dff7a']), animationDelay: `${i * 0.25}s`, '--from': `${left ? 12 : -12}deg`, '--to': `${left ? 68 : -68}deg` }, 6000).classList.add('sc-laser', left ? 'l' : 'r');
          }
        },
        // The strobe: three quick flashes.
        () => el('', { inset: '0' }, 1500).classList.add('sc-strobe'),
        // The dance floor: hands going up along the bottom.
        () => el(HANDS, { left: '0', bottom: '-2vh', fontSize: '100vw' }, 7000).classList.add('sc-hands', 'blk'),
      ],
      gap: [16, 32],
    },
    // Snow coming down, and Santa's sleigh crossing the sky with his bells.
    christmas: {
      moments: [
        () => shower(12, 0.3, () => drift('❄', { from: [rand(0, 100), -5], to: [rand(0, 100), 105], dur: rand(9, 16), size: rand(10, 22), spin: rand(-180, 180), opacity: rand(0.4, 0.9) })),
        () => {
          // High up, through the strip behind the TV's heading (lower, it's hidden by the top seat).
          drift(SLEIGH, { from: [-30, rand(6, 8)], to: [115, rand(1, 3)], dur: rand(11, 14), size: rand(200, 240) }).classList.add('sc-sleigh');
          later(() => window.Ambience?.cue('sleighbells'), 2000);
        },
      ],
    },
    // Sparks off the peat fire, and now and then a few shamrocks.
    stpatricks: { moments: hearth() },
    stpatricksFog: { moments: hearth() },
    // In the rain, lightning flickers in the windows now and then and thunder rolls in later.
    stpatricksRain: {
      moments: [...hearth(), () => {
        // Over the panes of the two windows (see stpatricks in lib/roomStyles.js: 230 x 200, panes inset 15).
        const w = Math.min(300, innerWidth * 0.34);
        const pane = { width: `${(w * 200) / 230}px`, height: `${(w * 170) / 230}px`, top: `calc(11vh + ${(w * 15) / 230}px)` };
        for (const left of [`calc(3vw + ${(w * 15) / 230}px)`, `calc(97vw - ${(w * 215) / 230}px)`]) el('', { left, ...pane }, 1600).classList.add('sc-winflash');
        later(() => window.Ambience?.cue('thunderFar'), rand(1500, 3500));
      }],
    },
    // A wanted poster on the wall; a tumbleweed, a hawk circling overhead, a hat blowing past.
    saloon: {
      decor() {
        el(POSTER, { left: '2vw', top: '14vh', fontSize: '120px' }).classList.add('sc-poster');
      },
      moments: [
        () => drift(TUMBLEWEED, { from: [-12, rand(70, 85)], to: [112, rand(70, 85)], dur: rand(7, 10), size: rand(50, 80), spin: 720, opacity: 0.85 }),
        () => { el(HAWK, { left: '14vw', top: '4vh', fontSize: '70px' }, 12000).classList.add('sc-hawk'); later(() => window.Ambience?.cue('hawk'), 1500); },
        () => drift(HAT, { from: [-10, 88], to: [110, 80], dur: rand(5, 7), size: 60, spin: 540 }),
      ],
    },
    // A ringed planet turning slowly in the window; shooting stars, a flying saucer, a lost
    // astronaut tumbling past, a comet.
    space: {
      decor() {
        el(PLANET, { left: '1vw', top: '18vh', fontSize: '160px' }).classList.add('sc-planet');
      },
      moments: [
        () => {
          for (let i = 0; i < pick([1, 2, 3]); i++) {
            later(() => el('', { left: `${rand(10, 90)}vw`, top: `${rand(5, 40)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 600);
          }
        },
        () => {
          const right = Math.random() < 0.5;
          drift(UFO, { from: [right ? -12 : 110, rand(8, 14)], to: [right ? 112 : -12, rand(8, 16)], dur: rand(7, 10), size: rand(70, 100) }).classList.add('sc-ufo');
          later(() => window.Ambience?.cue('ufo'), 800);
        },
        () => drift(ASTRONAUT, { from: [-10, rand(60, 80)], to: [rand(20, 40), rand(10, 30)], dur: rand(22, 28), size: rand(50, 70), spin: rand(-200, 200) }),
        () => drift('', { from: [110, rand(4, 12)], to: [-20, rand(20, 34)], dur: 3.5 }).classList.add('sc-comet'),
      ],
    },
    // Lanterns hanging from the beams; sparks from the fire, the tavern cat strolling past.
    tavern: {
      decor() {
        el(LANTERN, { left: '3vw', top: '9vh', fontSize: '70px' }).classList.add('sc-lantern');
        el(LANTERN, { left: '30vw', top: '6vh', fontSize: '56px', animationDelay: '-1.4s' }).classList.add('sc-lantern');
      },
      moments: [
        () => embers(6, () => [rand(10, 90), 102]),
        () => {
          const right = Math.random() < 0.5;
          drift(CAT, { from: [right ? -10 : 108, 89], to: [right ? 108 : -10, 89], dur: rand(14, 18), size: rand(70, 90) }).classList.add('sc-cat', right ? 'sc-face-r' : 'sc-face-l');
          later(() => window.Ambience?.cue('meow'), rand(3000, 6000));
        },
      ],
    },
    // Banners in the great hall, torches on the walls; bats, a dragon going by breathing fire, a
    // knight clanking past.
    castle: {
      decor() {
        for (const left of ['3vw', 'calc(97vw - 26px)']) el('<div class="sc-flame"></div>', { left, top: '18vh' }).classList.add('sc-torch');
        el(BANNER('#8e1b1b'), { left: '8vw', top: '0', fontSize: '150px' }).classList.add('sc-banner');
        el(BANNER('#1b3f8e'), { left: '26vw', top: '0', fontSize: '120px', animationDelay: '-2s' }).classList.add('sc-banner');
      },
      moments: [
        () => embers(5, () => [pick([5, 95]) + rand(-1, 1), 20]),
        bats,
        () => {
          const right = Math.random() < 0.5;
          drift(DRAGON, { from: [right ? -30 : 115, rand(2, 6)], to: [right ? 115 : -30, rand(1, 8)], dur: rand(9, 12), size: rand(240, 300) }).classList.add('sc-dragon', 'blk', right ? 'sc-face-r' : 'sc-face-l');
          later(() => window.Ambience?.cue('roar'), 2500);
        },
        () => {
          const right = Math.random() < 0.5;
          drift(KNIGHT, { from: [right ? -8 : 104, 84], to: [right ? 104 : -8, 84], dur: rand(16, 20), size: 110 }).classList.add('sc-knight', right ? 'sc-face-r' : 'sc-face-l');
          window.Ambience?.cue('clank');
        },
      ],
    },
    // The singer's mic stand on the stage; smoke, a spotlight sweeping round, gold notes rising.
    jazz: {
      decor() {
        el(MIC, { left: '4vw', bottom: '6vh', fontSize: '220px' }).classList.add('sc-mic');
      },
      moments: [
        () => smoke(),
        () => el('', { left: '20vw', top: '-10vh' }, 8000).classList.add('sc-spotlight'),
        () => shower(7, 0.7, () => drift(pick(['♪', '♫', '♬']), { from: [rand(2, 12), 80], to: [rand(2, 40), rand(10, 30)], dur: rand(6, 9), size: rand(22, 34), spin: rand(-30, 30), opacity: 0.7, extra: { color: '#e3b23c' } })),
      ],
    },
    // A bare bulb swinging over the room; smoke, bubbles, and the cops' lights going past outside
    // (everyone goes quiet).
    speakeasy: {
      decor() {
        el(SHELF, { left: '1vw', top: '9vh', fontSize: '220px' }).classList.add('sc-shelf', 'blk');
        el(BULB, { left: '22vw', top: '-2vh', fontSize: '150px' }).classList.add('sc-bulb');
        el(DOOR, { right: '3vw', bottom: '-2vh', fontSize: '190px' }).classList.add('sc-door', 'blk');
        el(GRAMOPHONE, { left: '1vw', bottom: '9vh', fontSize: '130px' }).classList.add('sc-gramophone', 'blk');
      },
      moments: [
        () => smoke(),
        // Knock knock: the peephole slides open, a pair of eyes looks the room over, and it shuts.
        () => {
          window.Ambience?.cue('knock');
          later(() => {
            const door = layer.querySelector('.sc-door');
            if (!door) return;
            door.classList.add('peek');
            later(() => door.classList.remove('peek'), 5200);
          }, 900);
        },
        () => { el('', { inset: '0' }, 6000).classList.add('sc-police'); window.Ambience?.cue('siren'); },
      ],
    },
    // Bunting across the hall; bubbles, and two steins clinking: Prost!
    beerhall: {
      decor() {
        el('', { left: '0', top: '0', width: '100vw', height: '10vh' }).classList.add('sc-bunting');
      },
      moments: [
        () => bubbles(['beer']),
        () => {
          el(STEIN, { left: '-10vw', bottom: '4vh', fontSize: '110px' }, 3200).classList.add('sc-stein', 'l');
          el(STEIN, { right: '-10vw', bottom: '4vh', fontSize: '110px' }, 3200).classList.add('sc-stein', 'r');
          later(() => window.Ambience?.cue('clink'), 1100);
        },
      ],
    },
    // Marquee lights chasing round the top; coins and cards falling, and a slot machine hitting
    // 7-7-7.
    casino: {
      decor() {
        el('', { left: '0', top: '0', width: '100vw', height: '5vh' }).classList.add('sc-marquee');
      },
      moments: [
        () => fall(['🪙', '💰', '🎲', '♠️', '♥️'], 7, 0.6),
        () => {
          const reels = el('<div class="sc-reel"><b>🍒🔔🍋⭐7️⃣</b></div><div class="sc-reel"><b>🍋⭐🍒🔔7️⃣</b></div><div class="sc-reel"><b>🔔🍒⭐🍋7️⃣</b></div>', { left: '2vw', top: '76vh' }, 7000);
          reels.classList.add('sc-slots');
          later(() => { reels.classList.add('win'); window.Ambience?.cue('jackpot'); }, 3200);
        },
      ],
    },
    // On deck at sunset: the Jolly Roger flying, a lantern swinging, and out at sea gulls, ships,
    // dolphins, a whale, spray over the rail, and now and then the kraken.
    pirate: {
      decor() {
        el(JOLLY_ROGER, { left: '12vw', top: '13vh', fontSize: '110px' }).classList.add('sc-jolly');
        el(LANTERN, { left: '2.5vw', top: '16vh', fontSize: '80px' }).classList.add('sc-lantern');
      },
      moments: [
        () => {
          const right = Math.random() < 0.5;
          const y = rand(9, 20);
          for (let i = 0; i < pick([2, 3, 4]); i++) {
            drift(GULL, { from: [right ? -10 : 110, y + rand(-3, 3)], to: [right ? 110 : -10, y + rand(-4, 8)], dur: rand(10, 14), size: rand(34, 54), extra: { animationDelay: `${i * rand(0.3, 0.9)}s` } });
          }
          later(() => window.Ambience?.cue('gulls'), 1500);
        },
        () => across(SHIP, { y: 41, dur: rand(30, 40), size: rand(60, 90), cls: ['sc-pitch'] }),
        () => {
          el('<i></i><i></i><i></i><i></i><i></i>', { left: `${rand(25, 75)}vw`, bottom: '8vh' }, 3200).classList.add('sc-crash');
          window.Ambience?.cue('crash');
        },
        () => {
          for (let i = 0; i < pick([2, 3]); i++) {
            el(DOLPHIN, { left: `${rand(2, 6) + i * 4}vw`, top: `${rand(50, 58)}vh`, fontSize: `${rand(50, 66)}px`, animationDelay: `${i * 0.5}s` }, 4000).classList.add('sc-dolphin');
          }
          later(() => window.Ambience?.cue('splash'), 1500);
        },
        // A whale: a spout, then its tail lifting and slipping back under.
        () => {
          const x = rand(3, 8);
          el('<i></i><i></i><i></i>', { left: `${x}vw`, top: '45vh' }, 3000).classList.add('sc-spout');
          later(() => el(FLUKE, { left: `${x - 2}vw`, top: 'calc(46vh - 52px)', fontSize: '104px' }, 4200).classList.add('sc-fluke'), 1800);
          later(() => window.Ambience?.cue('splash'), 4800);
        },
        // The kraken: a tentacle comes up over the rail, feels about, and slides back down.
        () => {
          const left = Math.random() < 0.5;
          for (let i = 0; i < pick([1, 2]); i++) {
            el(TENTACLE, { [left ? 'left' : 'right']: `${rand(1, 9)}vw`, bottom: '0', fontSize: `${rand(220, 300)}px`, animationDelay: `${i * 0.7}s` }, 8000).classList.add('sc-tentacle');
          }
          window.Ambience?.cue('splash');
          later(() => window.Ambience?.cue('creak'), 1200);
        },
      ],
    },
    // Tiki torches burning; fireflies, a parrot flying over, a coconut dropping.
    tiki: {
      decor() {
        for (const left of ['2vw', '9vw']) {
          el(TORCH, { left, bottom: '0', fontSize: '220px' }).classList.add('sc-tikitorch');
          el('<div class="sc-flame"></div>', { left: `calc(${left} + 6px)`, bottom: 'calc(220px - 18px)' }).classList.add('sc-torch');
        }
      },
      moments: [
        () => {
          const right = Math.random() < 0.5;
          drift(PARROT, { from: [right ? -10 : 110, rand(6, 14)], to: [right ? 110 : -10, rand(4, 18)], dur: rand(7, 9), size: rand(60, 80) }).classList.add(right ? 'sc-face-r' : 'sc-face-l');
          later(() => window.Ambience?.cue('squawk'), 1200);
        },
        () => {
          const x = rand(3, 14);
          drift(COCONUT, { from: [x, -6], to: [x, 92], dur: 1.1, size: 36, spin: 180, extra: { animationTimingFunction: 'ease-in' } });
          later(() => window.Ambience?.cue('thud'), 1100);
        },
        () => {
        for (let i = 0; i < 12; i++) {
          el('', { left: `${rand(0, 100)}vw`, top: `${rand(20, 95)}vh`, animation: `sc-fly ${rand(4, 7)}s ease-in-out ${rand(0, 3)}s 2 alternate`, '--sx': `${rand(-12, 12)}vw`, '--sy': `${rand(-10, 10)}vh` }, 18000).classList.add('sc-firefly');
        }
      }],
    },
    // The neon OPEN sign and a ceiling fan turning; notes off the jukebox, and a car's headlights
    // sweeping past the window.
    diner: {
      decor() {
        el('<span>OPEN</span>', { left: '2vw', top: '16vh' }).classList.add('sc-sign', 'open');
        el(FAN, { left: '14vw', top: '0', fontSize: '230px' }).classList.add('sc-fan', 'blk');
      },
      moments: [
        () => shower(6, 1, () => drift(pick(['♪', '♫', '♬']), { from: [rand(5, 95), 100], to: [rand(5, 95), rand(45, 70)], dur: rand(5, 8), size: rand(18, 30), spin: rand(-30, 30), opacity: 0.5, extra: { color: '#e63946' } })),
        () => { const right = Math.random() < 0.5; drift('', { from: [right ? -40 : 110, 20], to: [right ? 110 : -40, 20], dur: 2.6 }).classList.add('sc-headlights'); },
      ],
    },
    // A neon BEER sign that sputters, a dartboard on the wall; a fly, a dart, a mouse.
    dive: {
      decor() {
        el('<span>BEER</span>', { left: '2vw', top: '16vh' }).classList.add('sc-sign', 'beer');
        el(DARTBOARD, { left: '2vw', top: '62vh', fontSize: '90px' }).classList.add('sc-board');
      },
      moments: [
        () => el('', { right: '-10vw', top: '-10vh' }, 3000).classList.add('sc-neon'),
        () => layer.querySelector('.sc-sign.beer')?.animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 1400, easing: 'steps(1)' }),
        () => {
          // A dart flies in and sticks in the board.
          // (Not drift(): the dart stays in the board a while after it lands.)
          el(DART, { left: '-12vw', top: '66.5vh', fontSize: '60px', '--dx': '14.5vw', '--dy': '0vh', '--spin': '0deg', animation: 'sc-drift 0.45s ease-out forwards' }, 6000);
          later(() => window.Ambience?.cue('thud'), 450);
        },
        () => el(FLY, { left: `${rand(5, 60)}vw`, top: `${rand(8, 20)}vh`, fontSize: '16px' }, 9000).classList.add('sc-fly'),
        () => { const right = Math.random() < 0.5; drift(MOUSE, { from: [right ? -6 : 104, 94], to: [right ? 104 : -6, 94], dur: rand(3, 4.5), size: 56 }).classList.add('sc-mouse', right ? 'sc-face-r' : 'sc-face-l'); },
      ],
    },
    lighthouse: { moments: seaMoments() },
    lighthouseDay: { moments: dayMoments() },
    lighthouseFog: {
      decor() {
        // Banks of fog drifting slowly across, in front of the sea.
        for (const [top, h, dur, delay] of [[24, 40, 70, -20], [44, 46, 95, -60], [60, 40, 80, -35]]) {
          el('', { left: '-60vw', top: `${top}vh`, width: '90vw', height: `${h}vh`, animation: `sc-fogbank ${dur}s linear ${delay}s infinite` }).classList.add('sc-fogcloud');
        }
      },
      moments: fogMoments(),
      gap: [10, 24],
    },
    storm: {
      decor() {
        el('', { inset: '0' }).classList.add('sc-rain');
      },
      moments: [...seaMoments(true), lightning, lightning],
    },
  };

  // ---------- More moments, room by room ----------
  // So no room shows the same three things all night.
  const MORE = {
    dive: [
      () => { slide('🍺', { y: 91, size: 48 }); cue('slide', 200); },
      () => crossing('🎱', { y: 94, dur: 3.5, size: 34, bob: false, cls: ['roll'] }),
      () => { popup('🪳', { x: rand(2, 8), bottom: 1, size: 34, life: 3500 }); },
    ],
    tavern: [
      () => notes(4, 80, '#e3b23c'),
      () => { slide('🍺', { y: 91, size: 50 }); cue('slide', 200); },
      () => { for (let i = 0; i < 2; i++) crossing('🎲', { y: 94 - i * 2, dur: 2.6 + i * 0.4, size: 32, bob: false, cls: ['roll'] }); cue('dice', 300); },
      () => { const d = el('<span>🐕</span><b>z</b><b>z</b><b>z</b>', { left: '2vw', bottom: '2vh', fontSize: '56px' }, 9000); d.classList.add('sc-sleeper'); },
    ],
    club: [
      () => { burst(['🎉', '✨', '🟪', '🟦', '🟨', '🟩'], { x: rand(10, 30), y: 12, n: 34, spread: 34 }); cue('pop'); },
      () => { for (let i = 0; i < 6; i++) later(() => drift('', { from: [rand(2, 30), 98], to: [rand(10, 60), rand(10, 30)], dur: rand(1.6, 2.4), size: 8, spin: rand(-720, 720) }).classList.add('sc-glowstick', pick(['g', 'p', 'b'])), i * 250); },
    ],
    castle: [
      () => { for (let i = 0; i < 3; i++) toss(pick(['🔴', '🟡', '🔵']), { x: 4 + i * 1.6, y: 80, size: 22, height: 16, spins: 1, delay: i * 0.43 }); el('<span>🤹</span>', { left: '3vw', bottom: '2vh', fontSize: '64px' }, 4200); },
      () => crossing('🐀', { y: 95, dur: 4, size: 38 }),
      () => { el('📯', { left: '2vw', top: '12vh', fontSize: '70px', animation: 'sc-herald 4s ease-in-out forwards' }, 4200); cue('fanfare', 400); },
    ],
    jazz: [
      () => { el('<span>🎷</span>', { left: '7vw', bottom: '8vh', fontSize: '76px' }, 9000).classList.add('sc-sway'); notes(9, 76, '#e3b23c', 8); },
      () => { crossing('💃', { y: 90, dur: 14, size: 64 }); later(() => crossing('🕺', { y: 90, dur: 14, size: 64 }), 600); },
      () => crossing('😎', { y: 94, dur: 9, size: 40, bob: true }),
    ],
    diner: [
      () => crossing('🛼', { y: 94, dur: 3.2, size: 46, bob: false }),
      () => { toss('🍔', { x: 4, y: 82, size: 46, height: 18, spins: 1 }); cue('sizzle'); },
      () => { const b = el('<span>🔔</span><b>Order up!</b>', { left: '2vw', top: '30vh', fontSize: '44px' }, 3500); b.classList.add('sc-orderup'); },
      () => popup('🥤', { x: 3, bottom: 2, size: 60, life: 4500 }),
    ],
    tiki: [
      () => crossing('🦀', { y: 95, dur: 7, size: 40 }),
      () => el('🦎', { left: '1vw', top: '30vh', fontSize: '46px', animation: 'sc-gecko 6s ease-in-out forwards' }, 6200),
      () => { el('<span>🗿</span>', { left: '2vw', bottom: '24vh', fontSize: '70px' }, 4500).classList.add('sc-glowmask'); cue('drum'); },
    ],
    speakeasy: [
      () => crossing('💃', { y: 89, dur: 12, size: 66 }),
      () => { el('<span>🍸</span>', { left: '12vw', top: '22vh', fontSize: '44px' }, 4000).classList.add('sc-shaker'); cue('shaker'); },
      () => notes(3, 78, '#d9ad52', 5),
    ],
    casino: [
      () => { for (let i = 0; i < 2; i++) crossing('🎲', { y: 93 - i * 2, dur: 2.4 + i * 0.5, size: 40, bob: false, cls: ['roll'] }); cue('dice', 300); },
      () => { burst(['🃏', '🂡', '🂮', '🃁'], { x: 6, y: 80, n: 14, spread: 18, size: [28, 40] }); },
      () => { burst(['🍾', '🫧', '✨', '🫧'], { x: 4, y: 78, n: 18, spread: 14 }); cue('pop'); },
      () => { const w = el('<span>🎡</span>', { left: '2vw', bottom: '4vh', fontSize: '80px' }, 5000); w.classList.add('sc-roulette'); cue('dice', 3800); },
    ],
    saloon: [
      () => { slide('🥃', { y: 91, size: 42 }); cue('slide', 200); },
      () => { crossing('🐍', { y: 95, dur: 9, size: 44 }); cue('rattle', 500); },
      () => drift('➰', { from: [-10, rand(10, 16)], to: [110, rand(6, 14)], dur: rand(5, 7), size: 60, spin: 1080, opacity: 0.85 }),
    ],
    beerhall: [
      () => crossing('🥨', { y: 94, dur: 4, size: 44, bob: false, cls: ['roll'] }),
      () => crossing('🐕', { y: 93, dur: 8, size: 52 }),
      () => notes(4, 80, '#2f6fd0'),
      () => { burst(['🫧', '🍺', '🫧'], { x: 4, y: 82, n: 16, spread: 10, size: [16, 26] }); cue('pop'); },
    ],
    space: [
      () => drift('🚀', { from: [-8, 90], to: [60, -10], dur: 4, size: 56, spin: 0 }).classList.add('sc-rocket'),
      () => crossing('🛰️', { y: rand(6, 12), dur: 16, size: 46, bob: false }),
    ],
    christmas: [
      () => crossing('🦌', { y: 92, dur: 9, size: 60 }),
      () => popup('⛄', { x: 2, bottom: 2, size: 80, life: 5500 }),
      () => { const b = el('🎁', { left: '3vw', bottom: '3vh', fontSize: '64px' }, 4500); b.classList.add('sc-present'); later(() => burst(['✨', '⭐', '🎉'], { x: 5, y: 86, n: 18, spread: 10 }), 2200); },
      () => burst(['✨', '⭐', '✨'], { x: rand(10, 30), y: 6, n: 16, spread: 12 }),
    ],
    lighthouse: [
      () => { for (let i = 0; i < pick([1, 2]); i++) later(() => el('', { left: `${rand(5, 60)}vw`, top: `${rand(4, 14)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 700); },
      () => popup('🦭', { x: 2, bottom: 2, size: 64, life: 5000 }),
      () => crossing('🍾', { y: 52, dur: 26, size: 26, bob: true, cls: ['bottle'] }),
    ],
    lighthouseDay: [
      () => drift('🎈', { from: [rand(0, 30), 60], to: [rand(10, 50), -15], dur: 18, size: 60, opacity: 0.9 }),
      () => { const x = rand(2, 9); drift('🐦', { from: [x, 4], to: [x + 2, 50], dur: 1.1, size: 40, spin: 40, extra: { animationTimingFunction: 'ease-in' } }); cue('splash', 1100); },
      () => popup('🦭', { x: 2, bottom: 2, size: 64, life: 5000 }),
    ],
    lighthouseFog: [
      () => crossing('🏮', { y: 40, dur: 22, size: 30, bob: true, cls: ['sc-fogged'] }),
      () => { popup('🔔', { x: 3, bottom: 30, size: 40, life: 4000 }); cue('buoy'); },
    ],
    storm: [
      () => { el('', { inset: '0' }, 1400).classList.add('sc-lightning'); cue('thunder', 700); },
      () => drift('☂️', { from: [-10, rand(8, 20)], to: [110, rand(10, 30)], dur: 4, size: 60, spin: 720 }),
    ],
    stpatricks: [
      () => popup('🍀', { x: 2, bottom: 2, size: 64, life: 5000 }),
      () => el('🌈', { left: '4vw', top: '16vh', fontSize: '120px', animation: 'sc-rainbow 9s ease-in-out forwards' }, 9200),
      () => { crossing('🐑', { y: 93, dur: 11, size: 54 }); cue('baa', 2500); },
    ],
    stpatricksFog: [
      () => popup('🍀', { x: 2, bottom: 2, size: 64, life: 5000 }),
      () => { crossing('🐑', { y: 93, dur: 11, size: 54 }); cue('baa', 2500); },
    ],
    stpatricksRain: [
      () => popup('☂️', { x: 2, bottom: 2, size: 64, life: 5000 }),
      () => { crossing('🐑', { y: 93, dur: 11, size: 54 }); cue('baa', 2500); },
    ],
    pirate: [
      () => popup('🦜', { x: 2, bottom: 20, size: 60, life: 5000 }),
      () => { burst(['🪙', '💰', '💎', '🪙'], { x: 5, y: 84, n: 20, spread: 12 }); cue('jackpot'); },
    ],
  };
  for (const [id, list] of Object.entries(MORE)) SCENES[id]?.moments.push(...list);

  // Plays a moment, then waits a while before the next.
  function schedule(scene) {
    let last = null;
    const [lo, hi] = scene.gap || GAP;
    const go = () => {
      if (!document.hidden && scene.moments?.length) {
        const options = scene.moments.length > 1 ? scene.moments.filter((m) => m !== last) : scene.moments;
        last = pick(options);
        last();
      }
      later(go, rand(lo, hi) * 1000);
    };
    later(go, rand(3, 8) * 1000);
  }

  function stop() {
    timers.forEach((t) => t.stop());
    timers = [];
    if (layer) layer.innerHTML = '';
  }

  function set(style) {
    const want = reduce?.matches ? null : SCENES[style] ? style : null;
    if (want === current) return;
    current = want;
    stop();
    if (!want) return;
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'scenery';
      layer.setAttribute('aria-hidden', 'true');
      document.body.prepend(layer);
    }
    SCENES[want].decor?.();
    schedule(SCENES[want]);
  }

  // Plays one of the current style's moments now (for /preview?moment=N).
  function play(i) {
    const m = current && SCENES[current].moments?.[i];
    if (m) m();
    return !!m;
  }

  reduce?.addEventListener?.('change', () => { const s = current; current = null; set(reduce.matches ? null : s); });
  window.Scenery = { set, play, styles: Object.keys(SCENES) };
})();
