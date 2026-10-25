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
      ],
      gap: [20, 40],
    },
    christmas: { moments: [() => shower(12, 0.3, () => drift('❄', { from: [rand(0, 100), -5], to: [rand(0, 100), 105], dur: rand(9, 16), size: rand(10, 22), spin: rand(-180, 180), opacity: rand(0.4, 0.9) }))] },
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
    saloon: { moments: [() => drift(TUMBLEWEED, { from: [-12, rand(70, 85)], to: [112, rand(70, 85)], dur: rand(7, 10), size: rand(50, 80), spin: 720, opacity: 0.85 })] },
    space: {
      moments: [() => {
        for (let i = 0; i < pick([1, 2, 3]); i++) {
          later(() => el('', { left: `${rand(10, 90)}vw`, top: `${rand(5, 40)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 600);
        }
      }],
    },
    tavern: { moments: [() => embers(6, () => [rand(10, 90), 102])] },
    castle: {
      decor() {
        for (const left of ['3vw', 'calc(97vw - 26px)']) el('<div class="sc-flame"></div>', { left, top: '18vh' }).classList.add('sc-torch');
      },
      moments: [() => embers(5, () => [pick([5, 95]) + rand(-1, 1), 20]), bats],
    },
    jazz: { moments: [() => smoke()] },
    speakeasy: { moments: [() => smoke(), () => bubbles([])] },
    beerhall: { moments: [() => bubbles(['beer'])] },
    casino: { moments: [() => fall(['🪙', '💰', '🎲', '♠️', '♥️'], 7, 0.6)] },
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
    tiki: {
      moments: [() => {
        for (let i = 0; i < 12; i++) {
          el('', { left: `${rand(0, 100)}vw`, top: `${rand(20, 95)}vh`, animation: `sc-fly ${rand(4, 7)}s ease-in-out ${rand(0, 3)}s 2 alternate`, '--sx': `${rand(-12, 12)}vw`, '--sy': `${rand(-10, 10)}vh` }, 18000).classList.add('sc-firefly');
        }
      }],
    },
    diner: { moments: [() => shower(6, 1, () => drift(pick(['♪', '♫', '♬']), { from: [rand(5, 95), 100], to: [rand(5, 95), rand(45, 70)], dur: rand(5, 8), size: rand(18, 30), spin: rand(-30, 30), opacity: 0.5, extra: { color: '#e63946' } }))] },
    dive: { moments: [() => el('', { right: '-10vw', top: '-10vh' }, 3000).classList.add('sc-neon')] },
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
