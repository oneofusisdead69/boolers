// Moving scenery for the room styles, behind everything on the screen: bats flying past at
// Halloween, a disco ball dropping from the ceiling in the club, snow at Christmas, a tumbleweed in
// the saloon… Kept light (a handful of elements at a time) and off for people who ask their phone
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
  // Every `every` seconds or so (while the page is showing), call fn.
  function every(sec, fn, first = sec / 2) {
    let t;
    const go = () => {
      if (!document.hidden) fn();
      t = setTimeout(go, rand(sec * 0.6, sec * 1.4) * 1000);
    };
    const handle = { stop: () => clearTimeout(t) };
    t = setTimeout(go, first * 1000);
    timers.push(handle);
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
  const GULL = `<svg viewBox="0 0 60 20" width="1em" height="0.33em"><path class="sc-wing" d="M2 8 Q16 0 30 12 Q44 0 58 8" fill="none" stroke="#e8eef2" stroke-width="3" stroke-linecap="round"/></svg>`;
  const TUMBLEWEED = `<svg viewBox="0 0 40 40" width="1em" height="1em"><g fill="none" stroke="#a07b45" stroke-width="2">
    <circle cx="20" cy="20" r="17"/><path d="M5 15 Q20 30 35 12 M8 28 Q22 8 33 30 M14 5 Q12 22 26 36 M30 6 Q16 18 10 34"/></g></svg>`;

  const SCENES = {
    halloween() {
      // Bats flap past, a few at a time; fog drifts along the floor.
      every(9, () => {
        const up = Math.random() < 0.5;
        const y = rand(2, 22);
        for (let i = 0; i < pick([2, 3, 4]); i++) {
          drift(BAT, { from: [up ? -15 : 110, y + i * 5], to: [up ? 115 : -15, y + rand(-5, 25)], dur: rand(5, 8), size: rand(60, 100), extra: { animationDelay: `${i * 0.35}s` } })
            .classList.add(up ? 'sc-face-r' : 'sc-face-l');
        }
      }, 2);
      el('', { left: '-20vw', bottom: '-6vh', width: '140vw', height: '28vh', animation: 'sc-fog 22s ease-in-out infinite alternate' }).classList.add('sc-fog');
    },
    club() {
      // The disco ball drops in and spins; spots of light wander the walls.
      el('<div class="sc-ball-string"></div><div class="sc-ball"></div>', { left: 'calc(50% - 40px)', top: '0' }).classList.add('sc-disco');
      for (let i = 0; i < 9; i++) {
        el('', {
          left: `${rand(5, 95)}vw`, top: `${rand(10, 90)}vh`,
          background: pick(['#ff2bd6', '#29f0ff', '#ffffff', '#9b5cff', '#ffd23f']),
          animation: `sc-spot ${rand(6, 12)}s ease-in-out ${rand(0, 3)}s infinite alternate`,
          '--sx': `${rand(-30, 30)}vw`, '--sy': `${rand(-25, 25)}vh`,
        }).classList.add('sc-spot');
      }
    },
    christmas() {
      every(0.35, () => drift('❄', { from: [rand(0, 100), -5], to: [rand(0, 100), 105], dur: rand(9, 16), size: rand(10, 22), spin: rand(-180, 180), opacity: rand(0.4, 0.9) }), 0.1);
    },
    stpatricks() {
      every(1.6, () => drift('☘️', { from: [rand(0, 100), -6], to: [rand(0, 100), 106], dur: rand(10, 16), size: rand(14, 26), spin: rand(-360, 360), opacity: 0.55 }), 0.5);
    },
    saloon() {
      every(14, () => drift(TUMBLEWEED, { from: [-12, rand(70, 85)], to: [112, rand(70, 85)], dur: rand(7, 10), size: rand(50, 80), spin: 720, opacity: 0.85 }), 3);
    },
    space() {
      every(5, () => {
        const x = rand(10, 90);
        const y = rand(5, 40);
        el('', { left: `${x}vw`, top: `${y}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star');
      }, 1.5);
    },
    tavern() {
      every(0.5, () => drift('', { from: [rand(10, 90), 102], to: [rand(10, 90), rand(40, 70)], dur: rand(4, 7), size: 6 }).classList.add('sc-ember'), 0.2);
    },
    castle() {
      // Torches flicker on both walls.
      for (const left of ['3vw', 'calc(97vw - 26px)']) el('<div class="sc-flame"></div>', { left, top: '18vh' }).classList.add('sc-torch');
      every(0.7, () => drift('', { from: [pick([5, 95]) + rand(-1, 1), 20], to: [pick([5, 95]) + rand(-3, 3), rand(2, 10)], dur: rand(2, 4), size: 5 }).classList.add('sc-ember'), 0.3);
    },
    jazz() {
      every(1.4, () => drift('', { from: [rand(5, 95), 105], to: [rand(5, 95), rand(20, 50)], dur: rand(12, 18), size: 10 }).classList.add('sc-smoke'), 0.3);
    },
    speakeasy() {
      every(1.8, () => drift('', { from: [rand(5, 95), 105], to: [rand(5, 95), rand(25, 55)], dur: rand(12, 18), size: 10 }).classList.add('sc-smoke'), 0.3);
      every(0.6, () => drift('', { from: [rand(5, 95), 104], to: [rand(5, 95), rand(60, 85)], dur: rand(3, 6), size: 6 }).classList.add('sc-bubble'), 1);
    },
    beerhall() {
      every(0.3, () => drift('', { from: [rand(0, 100), 104], to: [rand(0, 100), rand(50, 80)], dur: rand(4, 8), size: rand(4, 10) }).classList.add('sc-bubble', 'beer'), 0.1);
    },
    casino() {
      every(1.2, () => drift(pick(['🪙', '💰', '🎲', '♠️', '♥️']), { from: [rand(0, 100), -6], to: [rand(0, 100), 106], dur: rand(8, 13), size: rand(14, 22), spin: rand(-360, 360), opacity: 0.6 }), 0.5);
    },
    pirate() {
      every(12, () => {
        const right = Math.random() < 0.5;
        drift(GULL, { from: [right ? -10 : 110, rand(5, 30)], to: [right ? 110 : -10, rand(5, 30)], dur: rand(9, 13), size: rand(40, 60), opacity: 0.8 });
      }, 2);
    },
    tiki() {
      for (let i = 0; i < 12; i++) {
        el('', { left: `${rand(0, 100)}vw`, top: `${rand(20, 95)}vh`, animation: `sc-fly ${rand(6, 12)}s ease-in-out ${rand(0, 5)}s infinite alternate`, '--sx': `${rand(-12, 12)}vw`, '--sy': `${rand(-10, 10)}vh` }).classList.add('sc-firefly');
      }
    },
    diner() {
      every(2.5, () => drift(pick(['♪', '♫', '♬']), { from: [rand(5, 95), 100], to: [rand(5, 95), rand(45, 70)], dur: rand(5, 8), size: rand(18, 30), spin: rand(-30, 30), opacity: 0.5, extra: { color: '#e63946' } }), 1);
    },
    dive() {
      // A neon glow in the corner that flickers now and then.
      el('', { right: '-10vw', top: '-10vh' }).classList.add('sc-neon');
    },
  };

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
    SCENES[want]();
  }

  reduce?.addEventListener?.('change', () => { const s = current; current = null; set(reduce.matches ? null : s); });
  window.Scenery = { set, styles: Object.keys(SCENES) };
})();
