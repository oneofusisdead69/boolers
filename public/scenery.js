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

  // Most things go behind the table (`layer`); a few have to be seen over it (`front`: the dice
  // rolled in front of the bottom seat, the shout that goes with them).
  let front = null;
  function el(html, style, life, into = layer) {
    const d = document.createElement('div');
    d.className = 'sc';
    d.innerHTML = html;
    // CSS variables (--dx…) have to be set one by one; the rest can be assigned.
    for (const [k, v] of Object.entries(style)) {
      if (k.startsWith('--')) d.style.setProperty(k, v);
      else d.style[k] = v;
    }
    into.appendChild(d);
    if (life) setTimeout(() => d.remove(), life);
    return d;
  }
  const inFront = (html, style, life) => el(html, style, life, front);
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
  // A dragon in flight (facing right): bat wings with their finger bones and scalloped skin, a
  // long neck, a horned head breathing fire, a pale scaled belly, claws tucked up, a long tail
  // ending in a spade.
  const DRAGON = `<svg viewBox="0 0 320 170" width="1em" height="0.53em"><defs>
    <linearGradient id="dgb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d6b33"/><stop offset="1" stop-color="#26461f"/></linearGradient>
    <linearGradient id="dgw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e8a3e"/><stop offset="1" stop-color="#2f5226"/></linearGradient></defs>
    <g class="sc-dwing back" opacity="0.75"><path d="M150 96 L118 18 L104 40 L92 22 L84 52 L70 40 L72 74 Q100 84 150 96Z" fill="#2a4422" stroke="#1a2c16" stroke-width="2"/></g>
    <path d="M110 108 Q70 118 40 104 Q16 92 4 104 Q14 108 18 116 Q30 104 40 116 Q76 134 116 118Z" fill="url(#dgb)" stroke="#1a2c16" stroke-width="2"/>
    <path d="M4 104 L-2 94 L14 100 L10 88 L20 102Z" fill="#26461f" stroke="#1a2c16" stroke-width="1.5"/>
    <path d="M100 104 Q120 78 170 82 Q200 84 214 70 Q226 54 238 44 L252 54 Q240 72 226 90 Q206 116 168 118 Q130 122 100 104Z" fill="url(#dgb)" stroke="#1a2c16" stroke-width="2"/>
    <path d="M118 112 Q150 122 186 112 Q206 104 222 86" fill="none" stroke="#d9c68a" stroke-width="9" stroke-linecap="round"/>
    ${[124, 138, 152, 166, 180, 194].map((x, i) => `<path d="M${x} ${115 - i * 0.6} q4 -3 8 0" stroke="#a8955a" stroke-width="1.5" fill="none"/>`).join('')}
    <path d="M150 116 l-6 14 l6 -2 l2 6 l4 -8 Z M190 110 l-2 14 l6 -3 l3 6 l2 -10Z" fill="#26461f" stroke="#1a2c16"/>
    <path d="M232 46 Q246 30 268 34 L292 44 Q300 48 292 52 L270 54 Q282 58 278 62 L262 60 Q248 62 240 56Z" fill="url(#dgb)" stroke="#1a2c16" stroke-width="2"/>
    <path d="M246 36 L232 14 L252 32 M256 34 L250 10 L262 32" stroke="#e8dcc0" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="268" cy="41" r="3.2" fill="#ffd23f"/><circle cx="268.6" cy="41" r="1.3" fill="#1a1a10"/><circle cx="290" cy="46" r="1.4" fill="#1a2c16"/>
    <path d="M272 54 l4 4 l4 -4 l4 4" stroke="#f2efe6" stroke-width="1.5" fill="none"/>
    ${[116, 132, 148, 164].map((x, i) => `<path d="M${x} ${86 - i * 1.5} l4 -8 l4 8" fill="#26461f"/>`).join('')}
    <g class="sc-dwing"><path d="M166 86 L140 4 L128 28 L112 10 L106 44 L88 32 L94 70 Q130 80 166 86Z" fill="url(#dgw)" stroke="#1a2c16" stroke-width="2"/>
      <path d="M166 86 L140 4 M160 84 L112 10 M152 82 L88 32" stroke="#203a1a" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <path class="sc-fire" d="M294 50 Q312 40 320 50 Q308 54 320 62 Q304 60 294 54Z" fill="#ff8a1a" stroke="#ffd23f" stroke-width="1.5"/></svg>`;
  // A knight in armour, walking (facing right): a great helm with a plume and a visor slit, a
  // white tabard with a red cross over mail, a heater shield, a sword at his side, plate legs.
  const KNIGHT = `<svg viewBox="0 0 90 130" width="0.69em" height="1em"><defs>
    <linearGradient id="kst" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f7884"/><stop offset="0.45" stop-color="#d8dde3"/><stop offset="1" stop-color="#8a939e"/></linearGradient></defs>
    <path d="M40 8 Q30 -2 14 4 Q22 6 26 14 Q30 10 40 12Z" fill="#c0392b"/>
    <g class="sc-legs-b"><path d="M34 80 h12 l2 26 l-2 16 h-12 l-1 -16Z" fill="url(#kst)" stroke="#4b535d"/><path d="M32 120 h18 q6 0 8 6 h-26Z" fill="#6f7884"/></g>
    <path d="M44 36 L36 92" stroke="#b9bfc6" stroke-width="4"/><path d="M40 40 h8" stroke="#8a6a3a" stroke-width="4"/><circle cx="44" cy="35" r="3" fill="#d9ad52"/>
    <path d="M28 36 Q40 30 54 36 L56 82 Q42 86 26 82Z" fill="#8a939e" stroke="#4b535d"/>
    <path d="M30 38 Q41 34 52 38 L54 84 Q42 88 28 84Z" fill="#f2efe6" stroke="#b9b1a0"/><path d="M39 42 h6 v14 h8 v6 h-8 v18 h-6 v-18 h-8 v-6 h8Z" fill="#c0392b"/>
    <rect x="27" y="74" width="30" height="5" fill="#5a3d1e"/><rect x="40" y="73" width="5" height="7" fill="#d9ad52"/>
    <g class="sc-legs-f"><path d="M30 80 h12 l2 26 l-2 16 h-12 l-1 -16Z" fill="url(#kst)" stroke="#4b535d"/><path d="M28 120 h18 q6 0 8 6 h-26Z" fill="#8a939e"/><ellipse cx="37" cy="104" rx="6" ry="4" fill="#d8dde3" stroke="#4b535d"/></g>
    <path d="M30 6 Q30 0 40 0 Q52 0 54 8 L56 30 Q42 36 28 30Z" fill="url(#kst)" stroke="#4b535d"/><rect x="42" y="14" width="14" height="3" rx="1.5" fill="#1c2128"/>
    <path d="M42 0 V30" stroke="#4b535d" stroke-width="1.2"/>${[0, 1, 2].map((i) => `<circle cx="${50 - i * 3}" cy="${23 + i * 2}" r="0.9" fill="#1c2128"/>`).join('')}
    <ellipse cx="32" cy="38" rx="9" ry="6" fill="url(#kst)" stroke="#4b535d"/>
    <path d="M50 40 h24 v20 q0 18 -12 26 q-12 -8 -12 -26Z" fill="#1f4f9e" stroke="#d9ad52" stroke-width="2.5"/><path d="M60 44 h4 v10 h8 v4 h-8 v18 h-4 v-18 h-8 v-4 h8Z" fill="#d9ad52"/>
    <ellipse cx="52" cy="40" rx="8" ry="6" fill="url(#kst)" stroke="#4b535d"/></svg>`;
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
  // The diner's counter bell (slapped for "Order up!"), and a bell buoy out in the fog.
  const SERVICE_BELL = `<svg class="sc-svcbell" viewBox="0 0 60 44" width="1.36em" height="1em"><defs><linearGradient id="chr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#b9c0c8"/><stop offset="1" stop-color="#6f7884"/></linearGradient></defs>
    <rect x="22" y="2" width="16" height="5" rx="2.5" fill="#6f7884"/><rect x="28" y="6" width="4" height="6" fill="#8a939e"/>
    <path d="M8 34 Q8 10 30 10 Q52 10 52 34Z" fill="url(#chr)" stroke="#6f7884" stroke-width="1.5"/><path d="M16 26 Q20 16 30 15" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/>
    <rect x="2" y="34" width="56" height="8" rx="3" fill="#2a2a2a"/></svg>`;
  const BUOY = `<svg viewBox="0 0 80 110" width="0.73em" height="1em"><g class="sc-buoy-rock">
    <path d="M22 40 L40 4 L58 40" stroke="#2a2a2a" stroke-width="3" fill="none"/><path d="M28 40 L40 4 L52 40 M24 28 H56 M30 16 H50" stroke="#2a2a2a" stroke-width="2" fill="none"/>
    <path class="sc-buoy-bell" d="M33 30 Q33 18 40 18 Q47 18 47 30 L49 34 H31Z" fill="#c9973c" stroke="#8a6420"/>
    <path d="M10 40 H70 L62 74 H18Z" fill="#c0392b" stroke="#7a1f1a" stroke-width="2"/><rect x="14" y="52" width="52" height="8" fill="#f2efe6"/></g>
    <path d="M0 80 Q20 70 40 80 T80 80 V110 H0Z" fill="rgba(160,180,200,0.55)"/></svg>`;
  // The speakeasy: the back-bar shelf, the door with its peephole, the gramophone.
  const SHELF = `<svg viewBox="0 0 220 90" width="1em" height="0.41em"><rect x="0" y="70" width="220" height="8" fill="#5a3418"/><rect x="0" y="78" width="220" height="4" fill="#3a2010"/>
    ${[[10, '#2f6b3a', 46], [32, '#8a4a1a', 54], [56, '#d9c8a0', 40], [76, '#6b1a1a', 58], [100, '#2f5a6b', 44], [122, '#8a6a1a', 50], [146, '#3a2a1a', 60], [172, '#2f6b3a', 42], [194, '#a0521a', 52]].map(([x, c, h]) => `<rect x="${x}" y="${70 - h}" width="14" height="${h}" rx="3" fill="${c}"/><rect x="${x + 4}" y="${70 - h - 12}" width="6" height="14" fill="${c}"/><rect x="${x + 2}" y="${70 - h * 0.6}" width="10" height="10" fill="#e8dcc0" opacity="0.8"/><rect x="${x + 2}" y="${70 - h + 4}" width="3" height="${h - 10}" fill="#fff" opacity="0.18"/>`).join('')}</svg>`;
  const DOOR = `<svg viewBox="0 0 90 170" width="0.53em" height="1em"><rect x="0" y="0" width="90" height="170" fill="#2a140c"/><rect x="6" y="6" width="78" height="164" fill="#4a2814"/>
    <rect x="14" y="70" width="62" height="40" fill="none" stroke="#2a140c" stroke-width="3"/><rect x="14" y="120" width="62" height="40" fill="none" stroke="#2a140c" stroke-width="3"/>
    <rect x="22" y="30" width="46" height="18" rx="2" fill="#120804"/><g class="sc-slit-cover"><rect x="22" y="30" width="46" height="18" rx="2" fill="#6b3a1c" stroke="#b08d45" stroke-width="1.5"/></g>
    <g class="sc-peep-eyes"><ellipse cx="36" cy="39" rx="5" ry="3.4" fill="#f2efe6"/><ellipse cx="54" cy="39" rx="5" ry="3.4" fill="#f2efe6"/><circle class="sc-pupil" cx="36" cy="39" r="2" fill="#111"/><circle class="sc-pupil" cx="54" cy="39" r="2" fill="#111"/></g>
    <circle cx="72" cy="100" r="4" fill="#b08d45"/></svg>`;
  // A gramophone: a wooden box with brass trim and a crank, the record on its platter with the
  // tone arm resting on it, and the brass horn rising from it on a curved neck and flaring into a
  // big flower-shaped bell, its open mouth turned towards you.
  const GRAMOPHONE = `<svg viewBox="0 0 150 150" width="1em" height="1em"><defs>
    <linearGradient id="gbr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2d27a"/><stop offset="0.5" stop-color="#c9973c"/><stop offset="1" stop-color="#8a6420"/></linearGradient>
    <radialGradient id="gmouth" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2a1a08"/><stop offset="0.6" stop-color="#6a4a1a"/><stop offset="1" stop-color="#c9973c"/></radialGradient></defs>
    <rect x="14" y="104" width="86" height="38" rx="4" fill="#5a3418" stroke="#2a140c" stroke-width="2"/><rect x="18" y="108" width="78" height="30" rx="2" fill="none" stroke="#c9973c" stroke-width="1.5"/>
    <rect x="10" y="100" width="94" height="7" rx="2" fill="#6b4024" stroke="#2a140c" stroke-width="1.5"/>
    <path d="M100 120 h10 v-6" stroke="#c9973c" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="110" cy="112" r="3.5" fill="#2a140c"/>
    <g class="sc-record"><ellipse cx="54" cy="99" rx="34" ry="6.5" fill="#141010"/><ellipse cx="54" cy="99" rx="26" ry="4.8" fill="none" stroke="#2c2626" stroke-width="1"/><ellipse cx="54" cy="99" rx="8" ry="1.8" fill="#c0392b"/></g>
    <path d="M86 100 Q90 92 84 88 L70 96" stroke="url(#gbr)" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="86" cy="98" r="4" fill="url(#gbr)"/>
    <path d="M86 94 Q92 76 84 64 Q78 56 82 50" stroke="url(#gbr)" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M78 52 Q86 46 92 40 Q108 22 124 6 Q136 -2 146 4 Q150 22 146 40 Q140 46 130 44 Q112 46 98 52 Q90 56 84 56Z" fill="url(#gbr)" stroke="#8a6420" stroke-width="1.5"/>
    <path d="M88 50 Q108 36 132 10 M90 53 Q114 44 140 30 M92 54 Q118 50 146 40" stroke="#8a6420" stroke-width="1" fill="none" opacity="0.7"/>
    <ellipse cx="140" cy="22" rx="9" ry="21" transform="rotate(18 140 22)" fill="url(#gmouth)" stroke="#f2d27a" stroke-width="2.5"/></svg>`;
  // The wanted poster: the host's face (their avatar) and name, dead or alive.
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const POSTER = (avatar = '🤠', name = 'The Host', color = '#a8875a') => `<svg viewBox="0 0 60 84" width="0.71em" height="1em">
    <path d="M2 2 H58 V80 L52 82 L46 79 L38 82 L30 79 L22 82 L14 79 L8 82 L2 80Z" fill="#e7d3a6" stroke="#a8875a" stroke-width="1.5"/>
    <rect x="6" y="6" width="48" height="70" fill="none" stroke="#a8875a" stroke-width="0.8"/>
    <text x="30" y="17" font-size="11" font-family="Georgia, serif" font-weight="700" text-anchor="middle" fill="#3b2512" letter-spacing="0.5">WANTED</text>
    <circle cx="30" cy="38" r="13" fill="${esc(color)}" opacity="0.35"/><text x="30" y="44" font-size="18" text-anchor="middle">${esc(avatar)}</text>
    <text x="30" y="61" font-size="7" font-family="Georgia, serif" font-weight="700" text-anchor="middle" fill="#3b2512">${esc(String(name).toUpperCase().slice(0, 12))}</text>
    <text x="30" y="71" font-size="6.5" font-family="Georgia, serif" text-anchor="middle" fill="#6b4524">DEAD OR ALIVE · $500</text></svg>`;
  const HAWK = `<svg viewBox="0 0 80 30" width="1em" height="0.375em"><path class="sc-wing" d="M2 14 Q20 2 40 16 Q60 2 78 14 Q60 10 46 20 L40 26 L34 20 Q20 10 2 14Z" fill="#3b2512"/></svg>`;
  const HAT = `<svg viewBox="0 0 70 34" width="1em" height="0.49em"><path d="M2 26 Q35 36 68 26 Q60 22 52 24 L48 6 Q35 0 22 6 L18 24 Q10 22 2 26Z" fill="#7a5230"/><rect x="18" y="18" width="32" height="5" fill="#3b2512"/></svg>`;
  const STEIN = `<svg viewBox="0 0 50 60" width="0.83em" height="1em"><rect x="6" y="14" width="30" height="42" rx="4" fill="rgba(255,206,90,0.9)" stroke="#8a6a3a" stroke-width="2"/>
    <path d="M36 22 H44 Q48 22 48 28 V40 Q48 46 42 46 H36" fill="none" stroke="#8a6a3a" stroke-width="3"/>
    <path d="M4 14 Q8 2 20 6 Q28 0 36 8 Q42 10 38 16 H4Z" fill="#fffaf0"/></svg>`;
  // A tumbleweed: a tangled ball of dry twigs, a few sticking out.
  const TUMBLEWEED = (() => {
    let out = '';
    for (let i = 0; i < 54; i++) {
      const a = Math.random() * Math.PI * 2;
      const a2 = a + 0.7 + Math.random() * 2.6;
      const r1 = 4 + Math.random() * 14;
      const r2 = 6 + Math.random() * 13;
      const p = (r, t) => `${(20 + r * Math.cos(t)).toFixed(1)} ${(20 + r * Math.sin(t)).toFixed(1)}`;
      out += `<path d="M${p(r1, a)} Q${(20 + (Math.random() - 0.5) * 30).toFixed(1)} ${(20 + (Math.random() - 0.5) * 30).toFixed(1)} ${p(r2, a2)}" stroke="${pick(['#8a6a3a', '#a07b45', '#6b5230', '#c49a5e'])}" stroke-width="${(0.5 + Math.random() * 0.9).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      out += `<path d="M${(20 + 15 * Math.cos(a)).toFixed(1)} ${(20 + 15 * Math.sin(a)).toFixed(1)} L${(20 + 21 * Math.cos(a + 0.1)).toFixed(1)} ${(20 + 21 * Math.sin(a + 0.1)).toFixed(1)}" stroke="#6b5230" stroke-width="0.8"/>`;
    }
    return `<svg viewBox="-2 -2 44 44" width="1em" height="1em"><g fill="none" stroke-linecap="round">${out}</g></svg>`;
  })();
  // A gunslinger (facing right): hat, bandana, vest, gun in its holster till he draws.
  const GUNSLINGER = (shirt, hat) => `<svg viewBox="0 0 70 120" width="0.58em" height="1em">
    <path d="M24 70 L22 116 H32 L36 84 L40 116 H50 L46 70Z" fill="#3b2a1c"/><path d="M20 116 h14 v4 h-16Z M38 116 h14 v4 h-14Z" fill="#1c140c"/>
    <path d="M22 36 Q34 30 48 36 L50 72 H20Z" fill="${shirt}"/><path d="M24 38 L30 72 H20Z M46 38 L40 72 H50Z" fill="#5a3a1e"/>
    <rect x="20" y="66" width="30" height="5" fill="#2a1a0e"/><rect x="44" y="64" width="8" height="12" rx="2" fill="#4a2e17"/>
    <path d="M22 40 Q14 52 18 64" stroke="${shirt}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <g class="sc-gunarm"><path d="M46 40 Q54 52 50 64" stroke="${shirt}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M47 62 h9 v-3 h6 v4 h-4 v5 h-4 v-2 h-7Z" fill="#2a2a2a"/>
      <g class="sc-muzzle"><path d="M62 60 l10 -4 l-4 6 l8 2 l-9 2 l3 6 l-9 -4Z" fill="#ffd23f"/></g></g>
    <circle cx="35" cy="26" r="9" fill="#e2b48a"/><path d="M26 28 h18 l-2 6 h-14Z" fill="#c0392b"/><path d="M38 23 h3" stroke="#2a1a0e" stroke-width="1.5"/>
    <path d="M14 18 Q35 24 56 18 Q50 16 46 16 L44 4 Q35 0 26 4 L24 16 Q20 16 14 18Z" fill="${hat}"/><rect x="24" y="13" width="22" height="3" fill="#2a1a0e"/></svg>`;

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
    if (cls.includes('roll')) {
      // Rolling things (a ball, dice) aren't turned round: they spin the way they're going, one turn
      // for every length of their own way round, so they roll rather than skid.
      const turn = (Math.PI * size) / ((1.18 * innerWidth) / dur);
      Object.assign(d.firstElementChild.style, { animationDuration: `${turn.toFixed(2)}s`, animationDirection: right ? 'normal' : 'reverse' });
      return d;
    }
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
  // (`rise` is how far up they fly, `fall` how far down they end; a firework goes every way.)
  function burst(chars, { x, y, n = 24, spread = 30, size = [14, 24], colors = null, rise = [-30, -8], fall = [20, 60] }) {
    for (let i = 0; i < n; i++) {
      el(pick(chars), { left: `${x}vw`, top: `${y}vh`, fontSize: `${rand(...size)}px`, ...(colors ? { color: pick(colors) } : {}), '--bx': `${rand(-spread, spread)}vw`, '--by': `${rand(...rise)}vh`, '--fall': `${rand(...fall)}vh`, '--spin': `${rand(-540, 540)}deg`, animation: `sc-burst ${rand(2.2, 3.2)}s cubic-bezier(0.2, 0.6, 0.4, 1) forwards` }, 3400);
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

  const hearth = () => [() => embers(6, () => [rand(25, 75), 102]), () => embers(5, () => [rand(25, 75), 102]), () => { crossing('🐂', { y: 93, dur: 16, size: 60 }); cue('moo', 3000); }];

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
        el(POSTER(), { left: '2vw', top: '14vh', fontSize: '130px' }).classList.add('sc-poster');
      },
      // The poster's always the host.
      update(s) {
        const host = s?.players?.find((p) => p.id === s.hostId);
        const poster = layer?.querySelector('.sc-poster');
        const key = host ? `${host.avatar}|${host.name}|${host.color}` : '';
        if (!poster || !host || poster.dataset.key === key) return;
        poster.dataset.key = key;
        poster.innerHTML = POSTER(host.avatar || '🤠', host.name, host.color);
      },
      moments: [
        () => drift(TUMBLEWEED, { from: [-12, rand(86, 90)], to: [112, rand(86, 90)], dur: rand(7, 10), size: rand(56, 80), spin: 1080 }).classList.add('sc-tumble'),
        // A shootout: two gunslingers square up across the floor, a tumbleweed rolls between
        // them... one draws, BANG, and the other keels over. The winner blows the smoke away.
        () => {
          const lefty = Math.random() < 0.5;
          const a = el(GUNSLINGER('#7a2a1a', '#3b2512'), { left: '2vw', bottom: '0', fontSize: '150px' }, 9000);
          const b = el(GUNSLINGER('#2a4a6a', '#e8dcc0'), { right: '3vw', bottom: '0', fontSize: '150px' }, 9000);
          a.classList.add('sc-slinger', 'blk');
          b.classList.add('sc-slinger', 'blk', 'sc-face-l');
          later(() => drift(TUMBLEWEED, { from: [-12, 90], to: [112, 90], dur: 4.5, size: 54, spin: 1080 }).classList.add('sc-tumble'), 900);
          const [winner, loser] = lefty ? [a, b] : [b, a];
          later(() => { winner.classList.add('draw'); window.Ambience?.cue('bang'); inFront('<b>BANG!</b>', { left: lefty ? '12vw' : '60vw', bottom: '20vh' }, 1800).classList.add('sc-bang'); }, 4200);
          later(() => loser.classList.add('down'), 4450);
          later(() => winner.classList.add('smoke'), 5400);
        },
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
          drift(KNIGHT, { from: [right ? -8 : 104, 78], to: [right ? 104 : -8, 78], dur: rand(16, 20), size: 150 }).classList.add('sc-knight', right ? 'sc-face-r' : 'sc-face-l');
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
      // (The volcano erupting is in MORE.tiki below.)
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
        // One coconut drops, then another... then the whole bunch comes down into a big pile, which
        // sits there a while.
        () => {
          const SIZE = 38;
          // The pile: rows of 5, 4, 3, 2, 1 coconuts, the bottom row on the floor in the corner.
          const slots = [];
          for (let row = 0; row < 5; row++) {
            for (let i = 0; i < 5 - row; i++) slots.push({ left: `calc(13vw + ${(i + row / 2) * (SIZE - 4)}px)`, bottom: `${row * (SIZE - 8)}px` });
          }
          // The first two land in the middle of the bottom row; the rest fill the pile in order.
          const order = [slots[2], slots[1], ...slots.filter((_, i) => i !== 1 && i !== 2)];
          const times = [0, 1700, ...order.slice(2).map((_, i) => 3600 + i * 140 + rand(0, 80))];
          order.forEach((slot, i) => later(() => {
            const left = 14000 - times[i];
            el(COCONUT, { ...slot, fontSize: `${SIZE}px`, '--spin': `${rand(-200, 200)}deg`, animation: `sc-coconut 0.75s ease-in forwards, sc-fade-out 0.8s ${(left - 900) / 1000}s forwards` }, left);
            if (i < 2 || i % 3 === 0) later(() => window.Ambience?.cue('thud'), 600); // as it lands
          }, times[i]));
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

  // ---------- Outdoors: the vineyard and the château ----------
  const SWALLOW = `<svg viewBox="0 0 60 30" width="1em" height="0.5em"><path class="sc-wing" d="M2 6 Q18 4 30 16 Q42 4 58 6 Q44 12 34 20 L30 28 L26 20 Q16 12 2 6Z" fill="#1c1a24"/></svg>`;
  const flock = (svg, { y = [4, 12], n = [4, 7], size = [26, 40], dur = [9, 13], extra = {} } = {}) => {
    const right = Math.random() < 0.5;
    const y0 = rand(...y);
    const emoji = !svg.startsWith('<svg');
    for (let i = 0; i < Math.round(rand(...n)); i++) {
      const d = drift(emoji ? `<span>${svg}</span>` : svg, { from: [right ? -8 : 108, y0 + rand(-3, 3)], to: [right ? 108 : -8, y0 + rand(-4, 6)], dur: rand(...dur), size: rand(...size), extra: { animationDelay: `${i * rand(0.15, 0.5)}s`, ...extra } });
      // Drawings face right; emoji face left, so they're turned round to go right.
      if (emoji) d.classList.add('sc-walker', ...(right ? ['flip'] : []));
      else d.classList.add(right ? 'sc-face-r' : 'sc-face-l');
    }
  };
  const flutter = (char, n = 2) => { for (let i = 0; i < n; i++) el(char, { left: `${rand(2, 40)}vw`, top: `${rand(6, 22)}vh`, fontSize: `${rand(22, 30)}px`, animationDelay: `${i * 0.6}s` }, 9600).classList.add('sc-fly'); };
  const fireworks = () => {
    for (let i = 0; i < pick([2, 3]); i++) {
      later(() => {
        const x = rand(12, 62);
        const y = rand(10, 16);
        burst(['✦', '✧', '•', '✺', '✦'], { x, y, n: 36, spread: 10, size: [14, 26], colors: [pick(['#ffd23f', '#ff5cc8', '#29f0ff']), pick(['#ff8a3d', '#ffffff', '#9b5cff'])], rise: [-12, 12], fall: [10, 26] });
        window.Ambience?.cue('boom');
      }, i * 1100);
    }
  };
  const fireflies = () => {
    for (let i = 0; i < 12; i++) {
      el('', { left: `${rand(0, 100)}vw`, top: `${rand(20, 95)}vh`, animation: `sc-fly ${rand(4, 7)}s ease-in-out ${rand(0, 3)}s 2 alternate`, '--sx': `${rand(-12, 12)}vw`, '--sy': `${rand(-10, 10)}vh` }, 18000).classList.add('sc-firefly');
    }
  };
  const vineyard = (sunset) => [
    () => flock(SWALLOW),
    () => notes(3, 82, '#7a1f2b'),
    () => { burst(['🍷', '✨', '🍇'], { x: 4, y: 82, n: 14, spread: 10, size: [18, 28] }); cue('clink'); },
    ...(sunset
      ? [fireflies, () => popup('🦉', { x: 2, bottom: 2, size: 60, life: 5000 }), () => { flock(SWALLOW, { n: [7, 11] }); }]
      : [
        () => flutter('🦋', 2),
        () => flutter('🐝', 1),
        () => { const x = rand(10, 60); drift('🍇', { from: [x, 6], to: [x, 92], dur: 1.2, size: 32, spin: 90, extra: { animationTimingFunction: 'ease-in' } }); cue('thud', 1200); },
        () => { crossing('🛵', { y: 91, dur: 4, size: 54, faces: 'left', bob: false }); cue('vespa'); },
        () => crossing('🐕', { y: 92, dur: 8, size: 50 }),
      ]),
  ];
  const chateauMoments = (night) => [
    () => { burst(['🥂', '✨', '🫧'], { x: 4, y: 82, n: 16, spread: 10, size: [18, 28] }); cue('pop'); },
    () => crossing('🐩', { y: 92, dur: 9, size: 52 }),
    ...(night
      ? [fireworks, fireworks, () => { for (let i = 0; i < 2; i++) later(() => el('', { left: `${rand(10, 70)}vw`, top: `${rand(3, 12)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 800); }]
      : [
        () => drift('🎈', { from: [-8, rand(8, 14)], to: [108, rand(4, 10)], dur: 34, size: 70, opacity: 0.95 }).classList.add('sc-balloon'),
        () => flock('🕊️', { y: [4, 12], n: [3, 5], size: [30, 40] }),
        () => { crossing('🦚', { y: 90, dur: 14, size: 70 }); cue('peacock', 2500); },
        () => crossing('🚲', { y: 92, dur: 6, size: 54, bob: false }),
        () => fall(['🌸', '🌸', '🌹'], 8, 0.7, 0.8),
      ]),
  ];
  SCENES.vineyard = { moments: vineyard(false) };
  SCENES.vineyardSunset = { moments: vineyard(true) };
  SCENES.chateau = { moments: chateauMoments(false) };
  SCENES.chateauNight = { moments: chateauMoments(true) };

  // ---------- Easter eggs (see EGGS in roomStyles.js) ----------
  // A banner across the middle as the egg begins.
  const banner = (title, sub, cls) => inFront(`<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`, { left: '0', right: '26vw', top: '34vh' }, 6500).classList.add('sc-banner', cls);
  const TRICOLORE = `<svg viewBox="0 0 90 60" width="1em" height="0.67em"><rect x="0" y="0" width="3" height="60" fill="#2a1a0e"/>
    <g class="sc-flag"><path d="M3 2 H33 V40 H3Z" fill="#0055a4"/><path d="M33 2 H63 V40 H33Z" fill="#f4f4f4"/><path d="M63 2 H90 Q86 21 90 40 H63Z" fill="#ef4135"/></g></svg>`;
  // A roulette wheel: red and black round a green zero, with a gold hub.
  const ROULETTE = (() => {
    let s = '';
    for (let i = 0; i < 37; i++) {
      const a = (i / 37) * Math.PI * 2;
      const b = ((i + 1) / 37) * Math.PI * 2;
      const p = (r, t) => `${(50 + r * Math.sin(t)).toFixed(2)} ${(50 - r * Math.cos(t)).toFixed(2)}`;
      s += `<path d="M${p(46, a)} A46 46 0 0 1 ${p(46, b)} L${p(30, b)} A30 30 0 0 0 ${p(30, a)}Z" fill="${i === 0 ? '#138a4a' : i % 2 ? '#c0182a' : '#141414'}"/>`;
    }
    return `<svg viewBox="0 0 100 100" width="1em" height="1em"><circle cx="50" cy="50" r="49" fill="#6a3a14" stroke="#e0b450" stroke-width="2"/><g class="sc-wheel">${s}<circle cx="50" cy="50" r="30" fill="#8a5a24"/>
      ${[0, 90, 180, 270].map((d) => `<path d="M50 50 L50 24" stroke="#e0b450" stroke-width="3" transform="rotate(${d} 50 50)"/>`).join('')}<circle cx="50" cy="50" r="7" fill="#e0b450"/></g>
      <g class="sc-ball"><circle cx="50" cy="8" r="3" fill="#fff"/></g></svg>`;
  })();
  const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  // Kings Cup at the château: the revolution! The Marseillaise on the trumpets, the château
  // burning behind you, the tricolore flying, and the mob coming up the drive with torches.
  SCENES.chateauRevolution = {
    decor() {
      el('', { left: '0', top: '0', width: '100vw', height: '100vh' }).classList.add('sc-fireglow');
      el(TRICOLORE, { left: '12vw', top: '13vh', fontSize: '110px' }).classList.add('sc-jolly');
      banner('Vive la Révolution !', 'Aux armes, citoyens !', 'rev');
      later(() => burst(['■', '■', '■'], { x: 50, y: 40, n: 40, spread: 40, size: [8, 14], colors: ['#0055a4', '#ffffff', '#ef4135'] }), 300);
      cue('marseillaise', 300);
    },
    moments: [
      () => burst(['●', '•', '✦'], { x: rand(20, 70), y: 30, n: 24, spread: 18, size: [5, 11], colors: ['#ff8a2a', '#ffd23f', '#ff5a14'], rise: [-30, -10], fall: [-20, 0] }),
      () => { crossing('🔥🧑‍🌾🔱🧔🔥👩‍🌾🔱🧑🔥', { y: 90, dur: 16, size: 46 }); cue('mob', 800); },
      () => {
        drift('🎂', { from: [-8, 60], to: [108, 30], dur: 3.5, size: 64, spin: 720 });
        inFront('<b>« Qu’ils mangent de la brioche ! »</b>', { left: '0', right: '26vw', top: '20vh' }, 3600).classList.add('sc-quote');
      },
      () => { cue('boom'); burst(['💨', '💨', '☁️'], { x: rand(5, 15), y: 70, n: 8, spread: 6, size: [40, 70], rise: [-20, -8], fall: [-10, 0] }); },
      () => { cue('shatter'); burst(['◆', '◇', '✦'], { x: rand(15, 60), y: 22, n: 18, spread: 10, size: [6, 12], colors: ['#cfe4ff', '#ffffff', '#ffd9a0'] }); },
      () => { cue('marseillaise'); burst(['■'], { x: 50, y: 30, n: 30, spread: 40, size: [8, 14], colors: ['#0055a4', '#ffffff', '#ef4135'] }); },
    ],
  };

  // Liar's Dice on the pirate ship: aboard the Flying Dutchman. The bell tolls, the organ plays,
  // the dead crew drift past, crabs scuttle over the deck and the sea's green lightning flickers.
  SCENES.pirateDutchman = {
    decor() {
      el('', { left: '0', bottom: '0', width: '100vw', height: '40vh' }).classList.add('sc-ghostfog');
      el(LANTERN, { left: '2.5vw', top: '16vh', fontSize: '80px' }).classList.add('sc-lantern', 'sc-ghostlight');
      banner('The Flying Dutchman', 'Liar’s dice, for years of your life', 'ghost');
      cue('toll', 200); cue('toll', 3200);
    },
    moments: [
      () => { drift('<span class="sc-ghost">💀</span>', { from: [-10, rand(20, 50)], to: [110, rand(20, 50)], dur: rand(14, 18), size: rand(50, 70), opacity: 0.55 }); cue('moan', 1000); },
      () => { for (let i = 0; i < pick([1, 2, 3]); i++) later(() => crossing('🦀', { y: 93, dur: rand(5, 8), size: rand(34, 46), bob: false, cls: ['sc-crab'] }), i * 700); },
      () => {
        const left = Math.random() < 0.5;
        for (let i = 0; i < 2; i++) el(TENTACLE, { [left ? 'left' : 'right']: `${rand(1, 9)}vw`, bottom: '0', fontSize: `${rand(220, 300)}px`, animationDelay: `${i * 0.7}s` }, 8000).classList.add('sc-tentacle', 'sc-ghostgreen');
        cue('splash');
      },
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 1400).classList.add('sc-greenflash'); cue('thunder', 600); },
      () => { popup('🔔', { x: 2, bottom: 20, size: 60, life: 5000 }); cue('toll', 300); cue('toll', 2800); },
      () => { const x = rand(15, 60); el('☠️', { left: `${x}vw`, top: '50vh', fontSize: '70px' }, 5000).classList.add('sc-rise'); cue('splash', 3800); },
    ],
  };

  // Darts in the dive bar: the Darts Palace. The lights sweep, the crowd holds up signs and sings,
  // pyro goes off; and every ton gets the caller (a 180 gets the full works).
  const SIGNS = ['180!', 'BOOL ARMY', 'ONE MORE DART', 'MUM I’M ON TV', 'OI OI OI', 'GAME ON', 'TREBLE 20!'];
  const pyro = () => { for (const x of [4, 22, 60, 72]) burst(['🔥'], { x, y: 86, n: 5, spread: 2, size: [30, 50], rise: [-26, -14], fall: [0, 10] }); cue('boom'); };
  let lastCall = null;
  SCENES.diveChampionship = {
    gap: [8, 18],
    decor() {
      lastCall = null;
      for (let i = 0; i < 4; i++) el('', { left: `${10 + i * 26}vw`, top: '-5vh', animationDelay: `-${i * 1.7}s` }).classList.add('sc-stagebeam');
      banner('Welcome to the Darts Palace', 'Game on!', 'palace');
      cue('cheer', 400);
    },
    update(s) {
      const t = s?.game?.lastTurn;
      if (!t || s.gameType !== 'darts') return;
      const key = `${t.id}:${t.darts?.length}:${t.total}:${s.game.total ? Object.values(s.game.total).join(',') : ''}`;
      if (key === lastCall) return;
      lastCall = key;
      if (t.total === 180) {
        inFront('<b>ONE HUNDRED<br>AND EIGHTY!</b>', { left: '0', right: '26vw', top: '30vh' }, 4200).classList.add('sc-oneeighty');
        pyro();
        later(() => burst(['✨', '🎉', '🎯'], { x: 40, y: 40, n: 30, spread: 40 }), 300);
        window.Ambience?.say?.('One hundred and eightyyy!');
        cue('cheer', 600);
      } else if (t.total >= 100) {
        inFront(`<b>${t.total}!</b>`, { left: '0', right: '26vw', top: '34vh' }, 3000).classList.add('sc-oneeighty', 'ton');
        window.Ambience?.say?.(t.total === 100 ? 'Ton!' : `${t.total}!`);
        cue('cheer', 300);
      }
    },
    moments: [
      () => { const sign = inFront(`<b>${pick(SIGNS)}</b>`, { left: `${rand(2, 14)}vw`, bottom: `${rand(4, 12)}vh` }, 4200); sign.classList.add('sc-sign-up'); sign.style.rotate = `${rand(-8, 8)}deg`; },
      () => { cue('chant'); for (let i = 0; i < 3; i++) later(() => { const s = inFront('<b>OI!</b>', { left: `${rand(2, 16)}vw`, bottom: `${rand(6, 16)}vh` }, 1200); s.classList.add('sc-sign-up', 'oi'); }, i * 700); },
      pyro,
      () => fall(['🎊', '✨'], 4, 0.3, 0.8),
      () => { for (let i = 0; i < 12; i++) el('', { left: `${rand(0, 100)}vw`, top: `${rand(20, 70)}vh`, animationDelay: `${rand(0, 1)}s` }, 2200).classList.add('sc-flash'); },
    ],
  };

  // Big Tom in the jazz club: open mic night. A mic stand and a stool in the spotlight, the OPEN
  // MIC sign; after each vote the room gives it a rimshot, or crickets.
  const MIC_STAND = `<svg viewBox="0 0 60 200" width="0.3em" height="1em"><path d="M30 40 V188" stroke="#1a1a1a" stroke-width="4"/><path d="M14 196 L30 186 L46 196" stroke="#1a1a1a" stroke-width="5" fill="none"/>
    <rect x="22" y="10" width="16" height="30" rx="8" fill="#6a6a72"/><path d="M24 18 h12 M24 24 h12 M24 30 h12" stroke="#3a3a40" stroke-width="1.5"/><rect x="26" y="38" width="8" height="8" fill="#2a2a2e"/></svg>`;
  const STOOL = `<svg viewBox="0 0 80 140" width="0.57em" height="1em"><ellipse cx="40" cy="12" rx="30" ry="9" fill="#8a1a2a"/><path d="M18 18 L10 136 M62 18 L70 136 M40 20 V136" stroke="#2a2a2e" stroke-width="5"/><path d="M14 90 H66" stroke="#2a2a2e" stroke-width="4"/></svg>`;
  let lastPhase = null;
  const crickets = () => { popup('🦗', { x: 4, bottom: 3, size: 54, life: 4000 }); inFront('<b>…</b>', { left: '0', right: '26vw', top: '36vh' }, 2600).classList.add('sc-quote'); cue('crickets'); };
  const rimshot = () => { popup('🥁', { x: 4, bottom: 3, size: 60, life: 3000 }); inFront('<b>Ba-dum-tss!</b>', { left: '0', right: '26vw', top: '20vh' }, 2600).classList.add('sc-quote'); cue('rimshot'); };
  SCENES.jazzOpenMic = {
    decor() {
      lastPhase = null;
      el(STOOL, { left: '3vw', bottom: '6vh', fontSize: '150px' }).classList.add('blk');
      el(MIC_STAND, { left: '9vw', bottom: '4vh', fontSize: '220px' }).classList.add('blk');
      el('<span>OPEN MIC</span>', { left: '2vw', top: '15vh' }).classList.add('sc-sign', 'mic');
      banner('Open mic night', 'Be funny. Or be quiet.', 'openmic');
    },
    update(s) {
      if (s?.gameType !== 'bigTom' || s.phase === lastPhase) return;
      const was = lastPhase;
      lastPhase = s.phase;
      if (was && s.phase === 'reveal') later(Math.random() < 0.7 ? rimshot : crickets, 900);
    },
    moments: [
      crickets,
      rimshot,
      () => { cue('snaps'); for (let i = 0; i < 4; i++) later(() => popup('🫰', { x: rand(2, 14), bottom: rand(4, 20), size: 40, life: 1600 }), i * 400); },
      () => { const x = rand(2, 10); drift('🍅', { from: [-6, 60], to: [x, 72], dur: 0.9, size: 40, spin: 360 }); later(() => popup('💥', { x, bottom: 24, size: 50, life: 900 }), 900); cue('thud', 900); },
      () => layer.querySelector('.sc-sign.mic')?.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 1200, easing: 'steps(1)' }),
    ],
  };

  // Ace Race in the beer hall: Oktoberfest. The waitresses carry armfuls of steins, couples dance,
  // someone yodels, and every race ends with "Prost!"
  let lastWinner = null;
  SCENES.beerhallOktoberfest = {
    decor() {
      lastWinner = null;
      banner('O’zapft is!', 'The keg is tapped', 'okto');
      cue('clink', 600);
    },
    update(s) {
      const w = s?.gameType === 'aceRace' ? s.game?.winner || null : null;
      if (w && w !== lastWinner) {
        inFront('<b>Prost!</b>', { left: '0', right: '26vw', top: '30vh' }, 3000).classList.add('sc-quote', 'prost');
        burst(['🍺', '🍻', '🥨'], { x: 36, y: 40, n: 20, spread: 30 });
        cue('clink');
        cue('cheer', 300);
      }
      lastWinner = w;
    },
    moments: [
      () => crossing('💁‍♀️🍺🍺🍺', { y: 91, dur: 12, size: 46 }),
      () => { crossing('💃🕺', { y: 91, dur: 14, size: 54 }); },
      () => { cue('yodel'); notes(5, 80, '#2a6fdb'); },
      () => { burst(['🥨', '🍺', '🌭'], { x: 6, y: 80, n: 14, spread: 10, size: [20, 30] }); cue('clink'); },
      () => crossing('🍻', { y: 92, dur: 6, size: 50, bob: false }),
    ],
  };

  // Mad Max in the garage: the wasteland. The dust blows through; a war rig thunders past with a
  // bike gang behind it; vultures circle; an oil drum goes up.
  SCENES.garageWasteland = {
    decor() {
      el('', { left: '0', top: '0', width: '100vw', height: '100vh' }).classList.add('sc-dust');
      banner('Welcome to the Wasteland', 'Fuel’s low. Drinks are lower.', 'waste');
      cue('riff', 400);
    },
    moments: [
      () => { crossing('🔥🚚', { y: 90, dur: 5, size: 70, bob: false }); cue('rumble'); },
      () => { for (let i = 0; i < pick([3, 4, 5]); i++) later(() => crossing('🏍️', { y: rand(88, 94), dur: 3.2, size: 50, bob: false }), i * 300); cue('vroom'); },
      () => { for (let i = 0; i < 3; i++) drift('🦅', { from: [-10, rand(4, 14)], to: [110, rand(4, 16)], dur: rand(14, 18), size: 40, extra: { animationDelay: `${i * 1.2}s` } }); },
      () => { cue('boom'); burst(['🔥', '💥', '🔥'], { x: rand(4, 12), y: 80, n: 12, spread: 6, size: [30, 50], rise: [-24, -10], fall: [0, 10] }); },
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 6000).classList.add('sc-duststorm'); cue('wind'); },
      () => drift(TUMBLEWEED, { from: [-12, 88], to: [112, 88], dur: 7, size: 64, spin: 1080 }).classList.add('sc-tumble'),
      () => cue('riff'),
    ],
  };

  // The frat house: a ping-pong ball sinks a cup, the room chants CHUG, a pizza box flies, someone
  // crowd-surfs across, the string lights flicker, and a toga goes by.
  const RED_CUP = `<svg viewBox="0 0 40 46" width="0.87em" height="1em"><path d="M4 4 h32 l-5 40 h-22Z" fill="#d62828"/><rect x="4" y="4" width="32" height="6" fill="#f4f4f4"/><path d="M8 18 h24 M9 26 h22" stroke="#b01e1e" stroke-width="1.5"/></svg>`;
  SCENES.frat = {
    decor() {
      for (let i = 0; i < 3; i++) el(RED_CUP, { left: `${2 + i * 2.6}vw`, bottom: '3vh', fontSize: '46px' }).classList.add('blk');
      el(RED_CUP, { left: '3.3vw', bottom: 'calc(3vh + 40px)', fontSize: '46px' }).classList.add('blk');
    },
    moments: [
      () => { toss('⚪', { x: 30, y: 82, size: 18, height: 30, spins: 0, delay: 0 }); later(() => { burst(['💦'], { x: 4, y: 88, n: 6, spread: 3, size: [14, 20] }); cue('splash'); cue('cheer', 300); }, 1100); },
      () => { cue('chant'); for (let i = 0; i < 3; i++) later(() => inFront('<b>CHUG!</b>', { left: `${rand(2, 14)}vw`, bottom: `${rand(8, 18)}vh` }, 1300).classList.add('sc-sign-up', 'oi'), i * 650); },
      () => drift('🍕', { from: [-8, 70], to: [108, 40], dur: 2.4, size: 54, spin: 720 }),
      () => crossing('🏄', { y: 70, dur: 8, size: 60, bob: true }),
      () => crossing('🧖', { y: 91, dur: 12, size: 54 }),
      () => { burst(['🥤', '🎉', '✨'], { x: 6, y: 80, n: 14, spread: 10, size: [20, 28] }); cue('pop'); },
      () => document.querySelectorAll('#scenery .sc, body').length && document.body.animate([{ filter: 'none' }, { filter: 'brightness(0.6)' }, { filter: 'none' }, { filter: 'brightness(0.7)' }, { filter: 'none' }], { duration: 900, easing: 'steps(1)' }),
    ],
  };

  // Noir: rain running down the window, the neon sign stuttering, headlights sweeping through the
  // blinds, a siren going by, a silhouette at the door, smoke curling up. On every hit a press
  // camera's flash bulb pops and the red neon floods the room.
  let lastNoirRoll = null;
  const flashBulb = () => {
    cue('flashbulb');
    el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 1600).classList.add('sc-flashbulb');
    later(() => el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 2600).classList.add('sc-redflood'), 300);
  };
  SCENES.speakeasyNoir = {
    decor() {
      lastNoirRoll = null;
      el('', { right: '0', top: '0', width: '40vw', height: '80vh' }).classList.add('sc-rainglass');
      el('', { left: '0', top: '0', width: '100vw', height: '100vh' }).classList.add('sc-noirflicker');
      el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 2500).classList.add('sc-fadein');
    },
    update(s) {
      const g = s?.gameType === 'slevens' ? s.game : null;
      if (!g || !g.hit || g.rollNo === lastNoirRoll) return;
      const first = lastNoirRoll === null;
      lastNoirRoll = g.rollNo;
      if (first) return;
      flashBulb();
      cue('sting', 300);
    },
    moments: [
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 4000).classList.add('sc-headlights'); cue('car', 400); },
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 5000).classList.add('sc-siren'); cue('siren'); },
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 1400).classList.add('sc-lightning'); cue('thunder', 700); },
      () => { const s = el('🕴️', { left: '2vw', bottom: '20vh', fontSize: '120px' }, 6000); s.classList.add('sc-silhouette'); },
      () => { for (let i = 0; i < 5; i++) later(() => drift('', { from: [rand(40, 50), 70], to: [rand(36, 56), 20], dur: 6, size: 10 }).classList.add('sc-plume', 'smoke'), i * 500); },
    ],
  };

  // The riverboat: the big red paddle wheel turning at the stern (faster on a hit), smoke from the
  // twin stacks, the steam whistle; a heron, a fish jumping, another steamer going by downriver.
  const PADDLE = (() => {
    const spokes = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M50 50 L${(50 + 46 * Math.cos(a)).toFixed(1)} ${(50 + 46 * Math.sin(a)).toFixed(1)}" stroke="#7a1a14" stroke-width="3"/><rect x="${(50 + 40 * Math.cos(a) - 5).toFixed(1)}" y="${(50 + 40 * Math.sin(a) - 9).toFixed(1)}" width="10" height="18" fill="#c0392b" transform="rotate(${(a * 180) / Math.PI} ${(50 + 40 * Math.cos(a)).toFixed(1)} ${(50 + 40 * Math.sin(a)).toFixed(1)})"/>`; }).join('');
    return `<svg viewBox="0 0 100 100" width="1em" height="1em"><g class="sc-paddle"><circle cx="50" cy="50" r="46" fill="none" stroke="#c0392b" stroke-width="4"/><circle cx="50" cy="50" r="30" fill="none" stroke="#c0392b" stroke-width="3"/>${spokes}<circle cx="50" cy="50" r="7" fill="#2a2a2a"/></g></svg>`;
  })();
  const STACKS = `<svg viewBox="0 0 60 120" width="0.5em" height="1em"><rect x="6" y="20" width="14" height="100" fill="#1a1a1a"/><rect x="38" y="20" width="14" height="100" fill="#1a1a1a"/>
    <path d="M2 20 l4 -10 l3 6 l4 -8 l3 6 l4 -8 l4 12Z M34 20 l4 -10 l3 6 l4 -8 l3 6 l4 -8 l4 12Z" fill="#c8a85a"/></svg>`;
  const STEAMER = `<svg viewBox="0 0 120 50" width="1em" height="0.42em"><path d="M4 36 h112 l-8 10 h-96Z" fill="#f4efe4"/><rect x="18" y="24" width="80" height="12" fill="#f4efe4"/><rect x="30" y="14" width="56" height="10" fill="#f4efe4"/>
    <rect x="44" y="0" width="5" height="14" fill="#1a1a1a"/><rect x="64" y="0" width="5" height="14" fill="#1a1a1a"/><circle cx="108" cy="36" r="10" fill="none" stroke="#c0392b" stroke-width="3"/>
    ${[24, 34, 44, 54, 64, 74, 84].map((x) => `<rect x="${x}" y="27" width="5" height="5" fill="#ffd88a"/>`).join('')}</svg>`;
  let lastRiverRoll = null;
  const whistle = () => {
    cue('whistle');
    for (let i = 0; i < 4; i++) later(() => drift('', { from: [rand(4, 8), 8], to: [rand(0, 10), -10], dur: 3, size: 10 }).classList.add('sc-plume', 'steam'), i * 180);
  };
  SCENES.saloonRiverboat = {
    decor() {
      lastRiverRoll = null;
      el(PADDLE, { right: '-6vw', bottom: '-10vh', fontSize: '46vh' }).classList.add('sc-wheel', 'blk');
      el(STACKS, { left: '3vw', top: '-4vh', fontSize: '26vh' }).classList.add('blk');
      const smoke = () => later(() => { drift('', { from: [rand(4, 9), 0], to: [rand(-4, 6), -20], dur: 6, size: 10 }).classList.add('sc-plume'); smoke(); }, rand(900, 1600));
      smoke();
      banner('All aboard the Delta Belle', 'Place your bets, gentlemen', 'river');
      later(whistle, 600);
    },
    update(s) {
      const g = s?.gameType === 'slevens' ? s.game : null;
      if (!g || !g.hit || g.rollNo === lastRiverRoll) return;
      const first = lastRiverRoll === null;
      lastRiverRoll = g.rollNo;
      if (first) return;
      // A hit: full steam ahead.
      layer.querySelector('.sc-wheel')?.classList.add('fast');
      later(() => layer.querySelector('.sc-wheel')?.classList.remove('fast'), 4000);
      whistle();
      later(() => { inFront('<b>FULL STEAM!</b>', { left: '0', right: '26vw', top: '26vh' }, 2400).classList.add('sc-oneeighty', 'ton', 'steam'); cue('cheer'); }, 500);
    },
    moments: [
      whistle,
      () => across(STEAMER, { y: 44, dur: rand(30, 40), size: rand(70, 100), cls: ['sc-pitch'] }),
      () => drift('🦩', { from: [-8, rand(20, 30)], to: [108, rand(16, 28)], dur: 12, size: 46 }),
      () => { const x = rand(20, 70); el('🐟', { left: `${x}vw`, top: '62vh', fontSize: '40px' }, 2000).classList.add('sc-dolphin'); cue('splash', 900); },
      () => notes(4, 80, '#e8b84a'),
      () => crossing('🎩', { y: 92, dur: 10, size: 50 }),
    ],
  };

  // Slevens in the tavern: the mead hall. Embers fly up from the fire pit, ravens wheel through
  // the smoke, a horn sounds; on every hit the hall pounds the tables and roars SKÅL!
  let lastRoll = null;
  const pound = () => {
    for (let i = 0; i < 4; i++) later(() => { document.body.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'translateY(0)' }], { duration: 140 }); cue('thud'); }, i * 260);
  };
  SCENES.tavernMeadhall = {
    decor() {
      lastRoll = null;
      el('', { left: '0', top: '0', width: '100vw', height: '100vh' }).classList.add('sc-fireglow');
      banner('Welcome to the mead hall', 'Horns up!', 'mead');
      cue('lur', 300);
    },
    update(s) {
      const g = s?.gameType === 'slevens' ? s.game : null;
      if (!g || !g.hit || g.rollNo === lastRoll) return;
      const first = lastRoll === null;
      lastRoll = g.rollNo;
      if (first) return;
      pound();
      later(() => { inFront(`<b>${g.hit === 'snake' ? 'ODIN’S EYES!' : 'SKÅL!'}</b>`, { left: '0', right: '26vw', top: '26vh' }, 2400).classList.add('sc-oneeighty', 'ton', 'skal'); cue('cheer'); }, 1000);
    },
    moments: [
      () => burst(['●', '•', '✦'], { x: rand(40, 60), y: 82, n: 22, spread: 10, size: [5, 10], colors: ['#ff8a2a', '#ffd23f', '#ff5a14'], rise: [-50, -26], fall: [-10, 0] }),
      () => { for (let i = 0; i < pick([1, 2, 3]); i++) drift('🐦‍⬛', { from: [-8, rand(6, 20)], to: [108, rand(4, 22)], dur: rand(9, 13), size: rand(36, 50), extra: { animationDelay: `${i * 0.8}s` } }); },
      () => { cue('lur'); popup('📯', { x: 2, bottom: 20, size: 60, life: 4000 }); },
      pound,
      () => crossing('🐕', { y: 93, dur: 9, size: 50 }),
      () => { crossing('🛡️⚔️', { y: 91, dur: 11, size: 48 }); },
    ],
  };

  // Quarters in the diner: the roller rink. Skaters go round, a couples skate, someone wipes out,
  // the disco ball throws spots everywhere; every quarter in gets the crowd.
  let lastCoin = null;
  SCENES.dinerRink = {
    gap: [8, 16],
    decor() {
      lastCoin = null;
      banner('Couples skate!', 'Quarters at the snack bar', 'rink');
    },
    update(s) {
      const L = s?.gameType === 'quarters' ? s.game?.last : null;
      if (!L || L.n === lastCoin) return;
      const first = lastCoin === null;
      lastCoin = L.n;
      if (first) return;
      if (L.hit) { inFront('<b>IN!</b>', { left: '0', right: '26vw', top: '26vh' }, 2000).classList.add('sc-oneeighty', 'ton'); cue('cheer', 200); }
    },
    moments: [
      () => { for (let i = 0; i < pick([3, 4, 5]); i++) later(() => crossing('🛼', { y: rand(86, 94), dur: rand(5, 8), size: rand(40, 56), bob: false }), i * 600); },
      () => { crossing('💃🕺', { y: 90, dur: 9, size: 56 }); },
      () => { crossing('⛸️', { y: 92, dur: 4, size: 46, bob: false }); later(() => { popup('💫', { x: rand(20, 60), bottom: 6, size: 50, life: 1600 }); cue('thud'); }, 2000); },
      () => { for (let i = 0; i < 10; i++) el('', { left: `${rand(5, 95)}vw`, top: `${rand(10, 90)}vh`, background: pick(['#ff2bd6', '#29f0ff', '#ffffff', '#ffd23f']), animation: `sc-spot ${rand(3, 6)}s ease-in-out infinite alternate, sc-fade-out 1s 8s forwards`, '--sx': `${rand(-30, 30)}vw`, '--sy': `${rand(-25, 25)}vh` }, 9200).classList.add('sc-spot'); },
      () => fall(['✨', '💜', '💙'], 4, 0.3, 0.8),
    ],
  };

  // Beer Pong at the frat house: the championship. The crowd goes off for every cup (SPLASH!), for
  // balls back, and for the winners; the lights strobe; someone's on the air horn.
  let lastBall = null;
  const shout = (text, cls = '') => inFront(`<b>${text}</b>`, { left: '0', right: '0', top: '26vh' }, 2600).classList.add('sc-oneeighty', 'ton', ...(cls ? [cls] : []));
  SCENES.fratChampionship = {
    gap: [8, 16],
    decor() {
      lastBall = null;
      SCENES.frat.decor();
      banner('Beer pong championship', 'Winner stays on', 'champ');
      cue('airhorn', 300);
    },
    update(s) {
      const g = s?.gameType === 'beerPong' ? s.game : null;
      const L = g?.last;
      if (!L || L.n === lastBall) return;
      const first = lastBall === null;
      lastBall = L.n;
      if (first) return;
      if (s.phase === 'over') {
        shout(`TEAM ${String(g.teams[g.winner].name).toUpperCase()} WINS!`);
        fall(['🎉', '🏆', '🥤'], 5, 0.2, 0.9);
        cue('airhorn'); cue('cheer', 300);
      } else if (g.ballsBack === L.n) {
        shout('BALLS BACK! 🔥');
        cue('airhorn'); cue('cheer', 200);
      } else if (L.cup) {
        shout('SPLASH!');
        cue('cheer', 200);
      } else if (L.rim) {
        cue('aww');
      }
    },
    moments: [
      ...SCENES.frat.moments,
      () => cue('airhorn'),
      () => { for (let i = 0; i < 6; i++) later(() => document.body.animate([{ filter: 'brightness(1.6)' }, { filter: 'none' }], { duration: 120 }), i * 180); },
    ],
  };

  // The mechanic's garage: the radio on, a tyre rolling across, sparks off the welder.
  SCENES.garage = {
    decor() { el('<span>OPEN</span>', { left: '2vw', top: '16vh' }).classList.add('sc-sign', 'open'); },
    moments: [
      () => crossing('🛞', { y: 92, dur: 4, size: 54, cls: ['roll'], bob: false }),
      () => { burst(['✦', '•', '✧'], { x: rand(30, 60), y: 60, n: 26, spread: 8, size: [6, 12], colors: ['#ffd23f', '#ff9a2a', '#ffffff'], rise: [-14, -4], fall: [10, 30] }); cue('weld'); },
      () => cue('wrench'),
      () => { crossing('🐈', { y: 93, dur: 9, size: 44 }); },
      () => { popup('📻', { x: 3, bottom: 3, size: 56, life: 4000 }); cue('riff'); },
      () => cue('horn'),
    ],
  };

  // Ride the Bus in the space lounge: the starship. Stars stream past the viewport; an astronaut
  // floats by, an alien waves from a passing saucer, a planet slides past; red alert now and
  // then. When someone has to ride the bus, the ship jumps to lightspeed.
  let busPhase = null;
  const warp = () => {
    const w = layer.querySelector('.sc-viewport');
    w?.classList.add('warp');
    cue('warp');
    later(() => el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 900).classList.add('sc-warpflash'), 1300);
    later(() => w?.classList.remove('warp'), 3200);
  };
  SCENES.spaceStarship = {
    decor() {
      busPhase = null;
      el('<div class="sc-stars"></div><div class="sc-stars near"></div>', { left: '1.5vw', top: '19.5vh', width: '97vw', height: '32vh' }).classList.add('sc-viewport');
      for (let i = 0; i < 6; i++) el('', { left: `${8 + i * 14}vw`, top: '77vh', animationDelay: `-${rand(0, 2)}s`, background: pick(['#7cf0ff', '#ffd23f', '#ff5c8a', '#7dff9e']) }).classList.add('sc-blink');
      banner('All crew aboard', 'Next stop: anywhere', 'ship');
      cue('beep', 300);
    },
    update(s) {
      if (s?.gameType !== 'rideTheBus' || s.phase === busPhase) return;
      const was = busPhase;
      busPhase = s.phase;
      if (was && s.phase === 'bus') {
        inFront('<b>Punch it!</b>', { left: '0', right: '26vw', top: '30vh' }, 3000).classList.add('sc-quote', 'punchit');
        later(warp, 500);
      }
    },
    moments: [
      warp,
      () => drift('🧑‍🚀', { from: [-8, rand(55, 70)], to: [108, rand(50, 70)], dur: 16, size: 60, spin: 360 }),
      () => drift('🛸', { from: [110, rand(22, 30)], to: [-12, rand(22, 34)], dur: 9, size: 54 }),
      () => drift('🪐', { from: [110, 26], to: [-15, 30], dur: 30, size: 120 }),
      () => drift('☄️', { from: [105, 21], to: [-10, 40], dur: 3, size: 44 }),
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 3200).classList.add('sc-redalert'); cue('alarm'); },
    ],
  };

  // Horse Race at the castle: the tournament field. Pennants fly; a herald sounds the start, the
  // crowd cheers, roses are thrown, a falcon goes over and the jester does his act.
  const PENNANT = (c) => `<svg viewBox="0 0 20 80" width="0.25em" height="1em"><rect x="0" y="0" width="2" height="80" fill="#5a3a1e"/><g class="sc-flag"><path d="M2 4 L20 12 L2 22Z" fill="${c}"/></g></svg>`;
  SCENES.castleTournament = {
    decor() {
      ['#8e1b1b', '#1b3f8e', '#d4af37', '#2a6a3a'].forEach((c, i) => el(PENNANT(c), { left: `${3 + i * 4}vw`, top: '16vh', fontSize: '90px', animationDelay: `-${i * 0.4}s` }).classList.add('sc-jolly'));
      banner('Let the tournament begin!', 'Riders, to the lists', 'tourney');
      cue('fanfare', 300);
    },
    moments: [
      () => { el('📯', { left: '2vw', top: '30vh', fontSize: '70px', animation: 'sc-herald 4s ease-in-out forwards' }, 4200); cue('fanfare', 400); },
      () => { cue('cheer'); burst(['🌹', '🌸', '🌹'], { x: 6, y: 70, n: 14, spread: 12, size: [20, 30] }); },
      () => drift('🦅', { from: [-10, rand(4, 12)], to: [110, rand(2, 14)], dur: rand(8, 11), size: 54 }),
      () => { for (let i = 0; i < 3; i++) toss(pick(['🔴', '🟡', '🔵']), { x: 4 + i * 1.6, y: 80, size: 22, height: 16, spins: 1, delay: i * 0.43 }); el('<span>🤹</span>', { left: '3vw', bottom: '2vh', fontSize: '64px' }, 4200); },
      () => crossing('🐕', { y: 93, dur: 7, size: 46 }),
      () => { burst(['🎉', '✨', '🏆'], { x: 8, y: 60, n: 14, spread: 10 }); cue('cheer'); },
    ],
  };

  // Boat Race at the lighthouse: regatta day. Boats of every kind go by all the time, near and
  // far (the near ones lower and bigger), on top of the clear day's gulls and dolphins.
  const BOATS = ['⛵', '⛵', '🚤', '🛶', '🚣', '🛥️', '⛴️', '🚢', '🏄', '🚤'];
  function regattaBoat() {
    const depth = Math.random();
    const y = 42 + depth * 24;
    const size = 22 + depth * 60;
    const dur = 34 - depth * 18;
    if (Math.random() < 0.2) return across(SAILBOAT, { y: y - 3, dur, size, cls: ['sc-pitch'] });
    const boat = pick(BOATS);
    crossing(boat, { y, dur: boat === '🚤' ? dur * 0.4 : dur, size, faces: 'left', bob: true });
  }
  SCENES.lighthouseRegatta = {
    decor() {
      banner('Regatta Day!', 'Every boat in the harbour is out', 'regatta');
      cue('horn', 300);
      for (let i = 0; i < 4; i++) later(regattaBoat, i * 1200);
      const more = () => later(() => { regattaBoat(); more(); }, rand(1800, 4200));
      more();
    },
    moments: [...dayMoments(), () => cue('horn')],
  };

  // Shot Poker at the casino: the gilded salon at Monte Carlo. A roulette wheel spins, the
  // champagne flows, and now and then a Grand Prix car screams past outside.
  SCENES.casinoMonteCarlo = {
    decor() {
      banner('Bienvenue à Monte-Carlo', 'Black tie. High stakes.', 'gold');
      cue('harp', 200);
      later(() => burst(['✨', '🥂', '✨'], { x: 50, y: 40, n: 20, spread: 30 }), 400);
    },
    moments: [
      () => {
        const n = Math.floor(Math.random() * 37);
        const wheel = inFront(ROULETTE, { left: '2vw', bottom: '2vh', fontSize: '150px' }, 9000);
        wheel.classList.add('sc-roulette');
        cue('spin');
        later(() => {
          const colour = n === 0 ? 'Vert' : REDS.includes(n) ? 'Rouge' : 'Noir';
          inFront(`<b>${n} ${colour} !</b>`, { left: '4vw', bottom: 'calc(2vh + 160px)' }, 3600).classList.add('sc-verdict', 'win');
          cue('clink');
        }, 5200);
      },
      () => { burst(['🍾', '🥂', '✨', '🫧'], { x: 6, y: 80, n: 18, spread: 10, size: [18, 28] }); cue('pop'); },
      () => { crossing('🏎️', { y: 92, dur: 1.4, size: 64, bob: false, faces: 'left' }); cue('vroom'); },
      () => crossing('🤵🍾', { y: 91, dur: 10, size: 50 }),
      () => fall(['💎', '🪙', '♠️', '♦️'], 6, 0.5, 0.7),
      () => { cue('harp'); fall(['✨'], 4, 0.3, 0.8); },
    ],
  };

  // A die showing a number, drawn with its pips.
  const PIPS = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] };
  const die = (n) => `<svg viewBox="0 0 40 40" width="1em" height="1em"><rect x="1" y="1" width="38" height="38" rx="8" fill="#fbf8f0" stroke="#b9b1a0" stroke-width="1.5"/>
    ${PIPS[n].map(([x, y]) => `<circle cx="${x * 10}" cy="${y * 10}" r="3.6" fill="${n === 1 ? '#c0392b' : '#1a1a1a'}"/>`).join('')}</svg>`;
  // Two dice rolled in to the bottom middle: 7, 11 or a double and the room cheers; otherwise, aww.
  function rollDice() {
    const roll = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const total = roll[0] + roll[1];
    const win = total === 7 || total === 11 || roll[0] === roll[1];
    window.Ambience?.cue('dice', 200);
    roll.forEach((n, i) => {
      const d = inFront(die(1 + Math.floor(Math.random() * 6)), { left: `${21 + i * 5}vw`, bottom: `${2 + i * 1.5}vh`, fontSize: '54px', '--spin': `${rand(540, 900)}deg`, animation: `sc-roll-in ${1.4 + i * 0.15}s cubic-bezier(0.15, 0.6, 0.3, 1) forwards` }, 6000);
      d.classList.add('sc-die', 'blk');
      // The faces flicker as it tumbles, then it settles on its number.
      let k = 0;
      const t = setInterval(() => { if (++k > 9) { clearInterval(t); d.innerHTML = die(n); } else d.innerHTML = die(1 + Math.floor(Math.random() * 6)); }, 140);
      timers.push({ stop: () => clearInterval(t) });
    });
    later(() => {
      const say = win ? (total === 7 ? 'Seven!' : total === 11 ? 'Eleven!' : 'Doubles!') : 'Awww…';
      inFront(`<b>${say}</b>`, { left: '18vw', bottom: '11vh' }, 3600).classList.add('sc-verdict', win ? 'win' : 'lose');
      window.Ambience?.cue(win ? 'cheer' : 'aww');
      if (win) burst(['✨', '⭐', '🎉'], { x: 24, y: 86, n: 16, spread: 10 });
    }, 1700);
  }

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
      () => { const b = el(`${SERVICE_BELL}<b>Order up!</b>`, { left: '2vw', top: '30vh', fontSize: '56px' }, 3500); b.classList.add('sc-orderup'); },
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
      rollDice,
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
      () => { el(BUOY, { left: '2vw', top: '24vh', fontSize: '90px' }, 7000).classList.add('sc-buoy', 'blk'); cue('buoy', 1200); cue('buoy', 4200); },
    ],
    storm: [
      () => { el('', { inset: '0' }, 1400).classList.add('sc-lightning'); cue('thunder', 700); },
      () => drift('☂️', { from: [-10, rand(8, 20)], to: [110, rand(10, 30)], dur: 4, size: 60, spin: 720 }),
    ],
    stpatricks: [
      () => popup('🥃', { x: 2, bottom: 2, size: 64, life: 5000 }),
      () => el('🌈', { left: '4vw', top: '16vh', fontSize: '120px', animation: 'sc-rainbow 9s ease-in-out forwards' }, 9200),
      () => { crossing('🐑', { y: 93, dur: 11, size: 54 }); cue('baa', 2500); },
    ],
    stpatricksFog: [
      () => popup('🥃', { x: 2, bottom: 2, size: 64, life: 5000 }),
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
  // The tiki bar's volcano, out on the horizon (see tikiBeach in lib/roomStyles.js: its crater at
  // 1000, 132 of 1600 × 900, the view scaled to cover the screen) goes off: a rumble, the crater
  // flares, lava bursts up and falls back, and a plume of smoke rises.
  function eruption() {
    const s = Math.max(innerWidth / 1600, innerHeight / 900);
    const x = ((innerWidth - 1600 * s) / 2 + 1000 * s) / innerWidth * 100;
    const y = ((innerHeight - 900 * s) / 2 + 132 * s) / innerHeight * 100;
    cue('rumble');
    el('', { left: `${x}vw`, top: `${y}vh` }, 7000).classList.add('sc-crater');
    later(() => {
      cue('boom');
      burst(['●', '●', '•'], { x, y, n: 40, spread: 6, size: [6, 14], colors: ['#ffd23f', '#ff8a1a', '#ff4a1a'], rise: [-24, -10], fall: [16, 34] });
      for (let i = 0; i < 5; i++) later(() => drift('', { from: [x - 1, y - 2], to: [x - 6 + i * 2, y - 26], dur: 6, size: 10 }).classList.add('sc-plume'), i * 300);
    }, 1400);
  }
  // Peaceful most of the time: one moment in about fifteen.
  MORE.tiki = [...(MORE.tiki || []), () => (Math.random() < 0.5 ? eruption() : flock(SWALLOW))];

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

  // Lets the current scene follow the room (the saloon's poster shows the host).
  function update(s) {
    if (current) SCENES[current].update?.(s);
  }

  function stop() {
    timers.forEach((t) => t.stop());
    timers = [];
    if (layer) layer.innerHTML = '';
    if (front) front.innerHTML = '';
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
      front = document.createElement('div');
      front.id = 'scenery-front';
      front.setAttribute('aria-hidden', 'true');
      document.body.appendChild(front);
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
  window.Scenery = { set, play, update, styles: Object.keys(SCENES) };
})();
