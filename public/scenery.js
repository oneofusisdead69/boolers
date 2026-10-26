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
  // What's pending, to cancel on stop(). Each one leaves the set when it's done, or a TV left on
  // all night would keep thousands of spent timers.
  const timers = new Set();

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

  // ---------- The character kit: everyone in the scenery drawn one way ----------
  // The look is the Fury Road war boys': flat colour (no gradients), one warm ink outline of the
  // same weight round everything, a big round head (a fifth of the height), chunky limbs with
  // round ends, dot eyes and a line for a mouth. The only shading: the far arm and leg a shade
  // darker, and a soft band down the back of the body. Props (a pint, a guitar) are drawn the
  // same way, in the same ink.
  //
  //   figure(opts)              a person: an <svg> 0.5em wide and 1em tall (1em is the whole
  //                             figure, feet on the bottom edge), facing right like every drawing
  //                             here (the walkers turn it round). Sized by font-size, so
  //                             vvWalk(figure(...), { vh: 22 }) and popup(figure(...), { size })
  //                             work as they are.
  //   figureAt(x, y, h, opts)   the same, to go inside another drawing (a rider on a truck): its
  //                             feet centred on (x, y), h tall, in that drawing's units.
  //   figure.points(opts)       where things are in the figure's own 60 x 120 box: { handF,
  //                             handB, mouth, head, tip } (tip: the far end of what's held, a
  //                             guitar's head or a torch's flame), to line up sparks, flames, words.
  //   critter(kind, opts)       an animal the same way: an <svg> 1em wide, feet on the bottom edge,
  //                             facing right. kind: 'cat' 'dog' 'mouse' 'rat' 'roach' 'fly' 'bird'
  //                             'eagle' 'raven' 'gull'. opts: color, belly, eye, size (0.6-1.4: how
  //                             big it is within its box), still (legs, tail and wings don't move:
  //                             they do by default, using the scenery's sc-legs-f/b, sc-tail,
  //                             sc-wing and sc-buzz).
  //   SKIN, SKINS, skinFor(i), HAIR, INK, LW: the palettes and the ink, for anything drawn by hand
  //                             to match (the art in lib/roomArt.js can't call the kit: draw it
  //                             with these numbers, or paste what figure() gives, as the dive
  //                             bar's regular does).
  //
  // figure() options, all optional:
  //   skin       'chalk' (war-boy white), 'pale' 'light' 'tan' 'brown' 'deep', or a colour;
  //              skinFor(i) goes round the five natural ones, for a crowd
  //   hair       'short' 'long' 'bob' 'bun' 'ponytail' 'curly' 'mohawk' 'quiff' 'receding' 'bald'
  //   hairColor  'black' 'brown' 'auburn' 'blonde' 'red' 'grey' 'white', or a colour
  //   beard      'stubble' 'moustache' 'beard' 'goatee' (in hairColor, or beardColor)
  //   face       'smile' (the default) 'grin' 'shout' 'flat' 'sleep' 'sleepy' 'warpaint' (black
  //              sockets, a chrome mouth) 'shades' 'none' (from behind, a silhouette); blush: true
  //   top        the shirt's colour. topStyle: 'plain' 'vest' 'suit' 'apron' 'stripes' 'plaid'
  //              'bare' (no shirt) 'scars' (bare, the war boys' marks), its second colour `accent`;
  //              neck: 'tie' 'bow' 'scarf' (in accent2, or accent); sleeves: 'long' 'short' 'none'
  //   bottom     the trousers' colour. bottomStyle: 'trousers' 'shorts' 'skirt' (to the knee)
  //              'gown' (to the floor); shoes; belt (a colour)
  //   hat        'cap' 'beanie' 'flatcap' 'fedora' 'tophat' 'cowboy' 'crown' 'santa' 'chef'
  //              'tricorn' 'bandana' 'beret' 'hood' 'headband' 'helmet', in hatColor; hatAccent
  //              for its band, brim, gem, pompom, feather or plume
  //   build      'slim' 'regular' 'broad' 'stout' (the body only: heads and limbs stay as they are)
  //   pose       'stand' 'walk' (legs and arms swing, in CSS) 'walkA' 'walkB' (two still frames)
  //              'wave' 'toast' (a glass up) 'drink' (at the mouth) 'cheer' (both arms up)
  //              'witness' (a fist up, the other hand at the mouth) 'dance' 'sit' 'ride' 'slump'
  //              (asleep on the bar) 'play' (guitar, lute) 'sax' 'drum' 'serve' (a tray up)
  //              'carry' 'polish' 'point'; or say arms: [back, front] / legs: [back, front] by
  //              name (ARM_POSES, LEG_POSES) or as [shoulder or hip, elbow or knee] in degrees
  //              from straight down (+ is forwards)
  //   holding    in the front hand: 'pint' 'stein' 'tankard' 'wine' 'coupe' 'martini' 'bottle'
  //              'can' 'redcup' 'mic' 'wrench' 'torch' 'cloth' (a glass being polished) 'tray'
  //              (tray: ['martini', 'pint', ...] on it), or in both hands: 'guitar' 'lute' 'sax'
  //              'sticks'. holdingBack: in the other hand. propColor: recolours it
  //   lean       degrees the upper body tips forward from the hips
  //   crop       'waist': no legs (someone behind a bar or a counter)
  //   facing     'right' (the default) 'front' 'back'; flip: true faces left
  //   hooks      extra classes on its parts, to move them from CSS: { body, head, armF, armB,
  //              legF, legB }. Each arm and leg turns about its shoulder or hip (set inline), so
  //              a rotate() in a keyframe just works.
  //   cls        extra classes on the <svg>
  //   (Added for the bars: hats 'headphones' (hatAccent: a cap on backwards under them)
  //   'feathercap' 'laurel' 'alpine' 'viking'; topStyle 'toga' 'dirndl' 'braces' 'jumpsuit'
  //   'flapper' (with bottomStyle 'skirt': a fringe, fg-fringe, and pearls);
  //   holding 'sparkler' 'shaker' 'rag' 'case' 'spatula' 'steins' 'pizzas' 'shield' 'horn', 'burger'
  //   and 'shake' for a tray, two-handed 'tuba'; skates: true or the wheels' colour (skateColor
  //   the boots'); critter kinds 'owl' 'dachshund' (coat) 'cricket', and pose: 'sleep' for 'cat'
  //   and 'dog', 'perch' for 'bird'. Moving parts: fg-spark, fg-blink, fg-breathe, fg-tuba,
  //   fg-stack. Hats are called (head, colour, accent, side, back).)
  //   (Added for the seasons and outdoors: hats 'witch' 'elf' 'tam' 'sunhat' 'phrygian'
  //   'headscarf'; faces 'glasses' 'skull' 'patch' 'puff' (cheeks blown out: fg-puff); topStyle
  //   'ribs' (a skeleton) 'fur' (Santa's trim, in accent) 'highland' (plaid in accent, a sporran)
  //   'buttons' (icing); holding 'sack' (arms ['sack', ...] to sling it) 'parasol' 'basket'
  //   'pitchfork' 'hook' 'jack' (a lit jack-o'-lantern); two-handed 'bagpipes' (arms ['pipes',
  //   'chanter']) and 'accordion' (arms ['squeezeB', 'squeezeF']); head: false (headless);
  //   peg: 'front' or 'back' (a peg leg); critter kinds 'reindeer' (nose, collar) 'sheep' 'coo' 'collie'
  //   'boar' 'poodle' 'peacock' 'bat' 'spider' 'ghost' 'butterfly' (fg-flit) 'bee' 'nessie'
  //   'snowman' (scarf), and pose: 'perch' for 'parrot' (Polly).)
  //   (Added for the themed rooms and the sea: hats 'souwester' 'jester' 'spacehelmet' 'weldmask'
  //   'antennae' 'hibiscus'; face 'alien' (three eyes), and the registry FACES; mask (a bandana up
  //   over the nose, in that colour); inMouth: 'pipe' (smoking: fg-smoke); neck 'ermine' 'lei'
  //   (the registry NECKS); topStyle 'tabard' (accent, its cross accent2) 'harlequin'; bottomStyle
  //   'grass' (a grass skirt); holding 'goblet' 'sword' 'heater' (a knight's shield) 'lamp' 'gun'
  //   (its flash fg-muzzle, hidden till shown) 'blowtorch' 'paddle', and figure.points().tip at
  //   the end of the gun, torch, sword or paddle; pose 'juggle' (fg-juggle); hooks also propF /
  //   propB (what's in that hand, turning about the grip) and skirt; critter kinds 'horse'
  //   (saddle) 'parrot' (in flight; wing, tail) 'flamingo' 'dolphin' 'fish' 'seal' 'crab'
  //   'gecko' 'snake', pose 'perch' for 'gull' (its head turns: .fg-head); critter.at(kind, x, y,
  //   w, opts) an animal inside another drawing (feet on x, y, w wide; flip: true faces left),
  //   like figureAt. A figure lying down is one turned on its side: see the garage's creeper.)
  // Movement is in CSS, transforms only (see "The character kit" in scenery.css): the <svg> gets
  // `fg fg-<pose>`, and .fg-walk strides, .fg-wave waves, .fg-cheer pumps its fists, .fg-dance
  // bounces, .fg-drum drums. There are no ids or gradients in it, so any number can be on screen.
  const INK = '#1c1410';
  const LW = 1.6;
  const SKIN = { chalk: '#ece6dc', pale: '#f3d6bd', light: '#e4b58e', tan: '#c68c60', brown: '#94603e', deep: '#5e3a24' };
  const SKINS = ['pale', 'light', 'tan', 'brown', 'deep'];
  const skinFor = (i) => SKINS[((i % SKINS.length) + SKINS.length) % SKINS.length];
  const HAIR = { black: '#1e1612', brown: '#5a3820', auburn: '#8a3a1a', blonde: '#dcb45a', red: '#b8481e', grey: '#9c9894', white: '#ece8e2' };
  // A colour a shade darker (t > 0, towards the ink) or lighter (t < 0, towards white).
  const shade = (c, t) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || '');
    if (!m) return c;
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    const to = t > 0 ? [28, 20, 16] : [255, 255, 255];
    const a = Math.abs(t);
    return `#${[0, 2, 4].map((i, k) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - a) + to[k] * a).toString(16).padStart(2, '0')).join('')}`;
  };
  const n1 = (n) => +n.toFixed(1);
  const pt = (p) => `${n1(p[0])} ${n1(p[1])}`;
  const DEG = Math.PI / 180;
  const along = ([x, y], ang, len) => [x + len * Math.sin(ang * DEG), y + len * Math.cos(ang * DEG)];
  const turn = ([x, y], [cx, cy], a) => { const c = Math.cos(a * DEG); const s = Math.sin(a * DEG); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
  const ink = `stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round"`;
  // An outlined stroke (a limb, a strap, a stick): the ink a little wider underneath, the colour on top.
  const inked = (d, color, w) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n1(w + 2 * LW)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const pivot = ([x, y]) => `style="transform-box:view-box;transform-origin:${n1(x)}px ${n1(y)}px"`;

  // Arms: [shoulder, elbow] and legs: [hip, knee], in degrees from straight down, + forwards.
  const ARM_POSES = {
    down: [6, 8], back: [-16, 4], swingF: [26, 18], swingB: [-24, 8], hold: [14, 76], carry: [10, 64],
    tray: [40, 100], polish: [34, 102], toast: [150, 10], drink: [62, 118], wave: [150, 26], up: [148, 10],
    upBack: [-148, -10], fist: [-152, -18], point: [92, 0], strum: [24, 66], fret: [72, 34], sax: [20, 66], saxHigh: [46, 96],
    drum: [48, 44], ride: [74, 12], fold: [135, 25], hip: [-34, 64],
  };
  const LEG_POSES = { stand: [2, -2], walkF: [22, 4], walkB: [-20, 12], sit: [84, -84], kick: [48, -18], wide: [10, -6] };
  const POSES = {
    stand: { arms: ['down', 'down'], legs: ['stand', 'stand'] },
    walk: { arms: ['down', 'down'], legs: ['stand', 'stand'] },
    walkA: { arms: ['swingF', 'swingB'], legs: ['walkB', 'walkF'] },
    walkB: { arms: ['swingB', 'swingF'], legs: ['walkF', 'walkB'] },
    wave: { arms: ['down', 'wave'], legs: ['stand', 'stand'] },
    toast: { arms: ['down', 'toast'], legs: ['stand', 'stand'] },
    drink: { arms: ['down', 'drink'], legs: ['stand', 'stand'] },
    cheer: { arms: ['upBack', 'up'], legs: ['wide', 'wide'] },
    witness: { arms: ['fist', 'drink'], legs: ['wide', 'wide'] },
    dance: { arms: ['upBack', 'wave'], legs: ['stand', 'kick'] },
    sit: { arms: ['hold', 'hold'], legs: ['sit', 'sit'] },
    ride: { arms: ['ride', 'ride'], legs: ['sit', 'sit'] },
    slump: { arms: ['fold', 'fold'], legs: ['sit', 'sit'], lean: 60, face: 'sleep' },
    play: { arms: ['fret', 'strum'], legs: ['stand', 'stand'] },
    sax: { arms: ['saxHigh', 'sax'], legs: ['stand', 'stand'] },
    drum: { arms: ['drum', 'drum'], legs: ['sit', 'sit'] },
    serve: { arms: ['down', 'tray'], legs: ['stand', 'stand'] },
    carry: { arms: ['down', 'carry'], legs: ['stand', 'stand'] },
    polish: { arms: ['hold', 'polish'], legs: ['stand', 'stand'] },
    point: { arms: ['down', 'point'], legs: ['stand', 'stand'] },
  };
  const ARM = [16, 15];
  const LEG = [21, 20];
  const HEAD_R = 11;
  // Where everything goes, in the figure's 60 x 120 box (before any lean).
  function layout(o) {
    const P = POSES[o.pose] || POSES.stand;
    const side = o.facing !== 'front' && o.facing !== 'back';
    const b = { slim: 0.88, broad: 1.16, stout: 1.08 }[o.build] || 1;
    const sw = 13 * b;
    const hw = (o.build === 'stout' ? 12.5 : 10.5) * b;
    const cx = side ? 31.5 : 30;
    const sh = side ? [[27.5, 39], [33.5, 39]] : [[30 - sw + 3, 39], [30 + sw - 3, 39]];
    const hp = side ? [[27.5, 74], [32.5, 74]] : [[24.5, 74], [35.5, 74]];
    // In a front or back view the left (back) arm and leg go out to the left: mirrored.
    const mir = (i) => (!side && i === 0 ? -1 : 1);
    const pose = (list, table, i) => { const v = list[i]; return typeof v === 'string' ? table[v] : v; };
    const arms = [0, 1].map((i) => { const [a, e] = pose(o.arms || P.arms, ARM_POSES, i); const A = a * mir(i); const s = sh[i]; const k = along(s, A, ARM[0]); return { s, k, h: along(k, A + e * mir(i), ARM[1]), ang: A + e * mir(i) }; });
    const legs = [0, 1].map((i) => { const [a, e] = pose(o.legs || P.legs, LEG_POSES, i); const A = a * mir(i); const s = hp[i]; const k = along(s, A, LEG[0]); return { s, k, h: along(k, A + e * mir(i), LEG[1]), ang: A + e * mir(i) }; });
    return { P, side, sw, hw, cx, arms, legs, head: [side ? 31 : 30, 22], lean: o.lean ?? P.lean ?? 0 };
  }

  // The body's half-width at height y (the shoulders at 41, the hips at 76).
  const halfAt = (L, stout, y) => {
    if (!stout) return L.sw + ((L.hw - L.sw) * (y - 41)) / 35;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) { const t = (lo + hi) / 2; const yy = (1 - t) ** 2 * 41 + 2 * (1 - t) * t * 60 + t * t * 76; if (yy < y) lo = t; else hi = t; }
    const t = (lo + hi) / 2;
    return (1 - t) ** 2 * L.sw + 2 * (1 - t) * t * (L.sw + 5) + t * t * L.hw;
  };

  // What's held: drawn with its grip at (0, 0), upright.
  const GLASS = 'rgba(214, 236, 246, 0.55)';
  const PROPS = {
    pint: (c = '#f0b440') => `<path d="M-4.2 -13 L-3.2 1.5 H3.2 L4.2 -13Z" fill="${c}" ${ink}/><path d="M-4.7 -12.4 Q0 -16.8 4.7 -12.4 V-10.6 H-4.7Z" fill="#fff6e0" ${ink}/><path d="M-1.6 -9 V-1" stroke="#fff" stroke-width="1.2" opacity="0.5"/>`,
    stein: (c = '#efe6cf') => `<path d="M4.5 -9 H8 Q9.5 -9 9.5 -7 V-3 Q9.5 -1 8 -1 H4.5" fill="none" stroke="${INK}" stroke-width="${LW + 2.2}"/><path d="M4.5 -9 H8 Q9.5 -9 9.5 -7 V-3 Q9.5 -1 8 -1 H4.5" fill="none" stroke="${c}" stroke-width="2.2"/><rect x="-4.5" y="-12" width="9" height="14" rx="1.5" fill="${c}" ${ink}/><path d="M-5 -11.5 Q0 -16 5 -11.5 V-10 H-5Z" fill="#fffaf0" ${ink}/><path d="M-4.5 -4 H4.5" stroke="${shade(c, 0.3)}" stroke-width="1.2"/>`,
    tankard: (c = '#a9adb3') => PROPS.stein(c),
    wine: (c = '#8a1424') => `<path d="M0 -6 V1.5 M-3 1.8 H3" stroke="${INK}" stroke-width="${LW + 1.4}" stroke-linecap="round"/><path d="M0 -6 V1.5 M-3 1.8 H3" stroke="${GLASS}" stroke-width="1.4" stroke-linecap="round"/><path d="M-3.8 -15 Q-4.4 -6.5 0 -6 Q4.4 -6.5 3.8 -15Z" fill="${GLASS}" ${ink}/><path d="M-4 -11 Q-3.6 -6.6 0 -6.4 Q3.6 -6.6 4 -11Z" fill="${c}"/>`,
    coupe: (c = '#f4e0a0') => `<path d="M0 -7 V1.5 M-3 1.8 H3" stroke="${INK}" stroke-width="${LW + 1.4}" stroke-linecap="round"/><path d="M0 -7 V1.5 M-3 1.8 H3" stroke="${GLASS}" stroke-width="1.4" stroke-linecap="round"/><path d="M-6 -11 Q-5 -6.5 0 -6.5 Q5 -6.5 6 -11Z" fill="${c}" ${ink}/>`,
    martini: (c = 'rgba(214, 236, 246, 0.7)') => `<path d="M0 -8 V1.5 M-3 1.8 H3" stroke="${INK}" stroke-width="${LW + 1.4}" stroke-linecap="round"/><path d="M0 -8 V1.5 M-3 1.8 H3" stroke="${GLASS}" stroke-width="1.4" stroke-linecap="round"/><path d="M-6 -15 L0 -8 L6 -15Z" fill="${c}" ${ink}/><circle cx="1.5" cy="-11.5" r="1.6" fill="#7a9a3a" ${ink}/>`,
    bottle: (c = '#5a3a1a') => `<path d="M-2.8 3 V-7 Q-2.8 -9.5 -1.3 -10.5 V-17 H1.3 V-10.5 Q2.8 -9.5 2.8 -7 V3Z" fill="${c}" ${ink}/><rect x="-2.8" y="-5" width="5.6" height="4" fill="#e8dcc0"/><path d="M-1 -8 V1" stroke="#fff" stroke-width="1" opacity="0.4"/>`,
    can: (c = '#c9d2d8') => `<rect x="-2.9" y="-11" width="5.8" height="13" rx="1.4" fill="${c}" ${ink}/><path d="M-1 -14 H1.6 V-11 H-1Z" fill="${INK}"/><path d="M-1 -9 V0" stroke="#fff" stroke-width="1.3" opacity="0.8"/><path d="M-2.9 -6 H2.9" stroke="${shade(c, 0.35)}" stroke-width="1.2"/>`,
    redcup: (c = '#d62828') => `<path d="M-4.4 -12 L-3.2 2 H3.2 L4.4 -12Z" fill="${c}" ${ink}/><path d="M-4.4 -12 H4.4 L4.2 -10 H-4.2Z" fill="#f4f4f4"/>`,
    mic: (c = '#3a3a40') => `${inked('M0 1 V-7', '#1a1a1e', 2.4)}<circle cx="0" cy="-9.5" r="3" fill="${c}" ${ink}/><path d="M-1.6 -10.6 h3.2" stroke="#9a9aa2" stroke-width="1"/>`,
    wrench: (c = '#b8c0c8') => `${inked('M0 4 V-14', c, 2.6)}<path d="M-3.6 -14 A3.6 3.6 0 1 1 3.6 -14 L1.6 -15.5 H-1.6Z" fill="${c}" ${ink}/>`,
    torch: (c = '#6a4424') => `${inked('M0 6 V-12', c, 2.6)}<path class="fg-flame" d="M0 -12 Q-5 -16 -2 -22 Q-1 -19 0 -20 Q1 -26 4 -22 Q5 -16 0 -12Z" fill="#ff9a2a" ${ink}/>`,
    cloth: (c = '#f4f0e8') => `${PROPS.pint(GLASS)}<path d="M-6 -4 Q0 2 7 -5 L6 1 Q0 5 -5 1Z" fill="${c}" ${ink}/>`,
    tray: (c = '#c9ccd1', on = ['martini', 'martini', 'martini']) => `${on.map((p, i) => `<g transform="translate(${n1(-9 + (i * 18) / Math.max(1, on.length - 1))} -1.5) scale(0.8)">${(PROPS[p] || PROPS.pint)()}</g>`).join('')}<ellipse cx="0" cy="-1" rx="12.5" ry="2.4" fill="${c}" ${ink}/>`,
  };
  // How far a single prop leans from upright (degrees) in each pose: a drink tips to the mouth.
  const PROP_TILT = { drink: -58, toast: 12, witness: -58 };
  // Two-handed props: drawn between the body and the front arm, from where both hands are.
  const TWO_HANDED = {
    guitar: (L, c = '#b8401a') => {
      const [f, b] = [L.arms[1].h, L.arms[0].h];
      const dx = b[0] - f[0]; const dy = b[1] - f[1]; const d = Math.hypot(dx, dy) || 1; const u = [dx / d, dy / d];
      const body = [f[0] - u[0] * 3 + 1, f[1] - u[1] * 3 + 2];
      const top = [b[0] + u[0] * 14, b[1] + u[1] * 14];
      const ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
      return { tip: top, svg: `${inked(`M${pt(body)} L${pt(top)}`, '#4a2a14', 2.6)}<g transform="translate(${pt(body)}) rotate(${n1(ang)})"><path d="M-9 0 C-9 -7 -3 -7.5 0 -5 C3 -6.5 7 -5 7 0 C7 5 3 6.5 0 5 C-3 7.5 -9 7 -9 0Z" fill="${c}" ${ink}/><circle cx="-1" cy="0" r="2" fill="${INK}"/></g><path d="M${pt(top)} l${n1(u[0] * 4 - u[1] * 2)} ${n1(u[1] * 4 + u[0] * 2)}" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>` };
    },
    lute: (L, c = '#c08040') => {
      const [f, b] = [L.arms[1].h, L.arms[0].h];
      const dx = b[0] - f[0]; const dy = b[1] - f[1]; const d = Math.hypot(dx, dy) || 1; const u = [dx / d, dy / d];
      const body = [f[0] - u[0] * 3, f[1] - u[1] * 3 + 2];
      const top = [b[0] + u[0] * 7, b[1] + u[1] * 7];
      const ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
      return { tip: top, svg: `${inked(`M${pt(body)} L${pt(top)} l${n1(u[1] * 4)} ${n1(-u[0] * 4)}`, '#5a3418', 2.4)}<g transform="translate(${pt(body)}) rotate(${n1(ang)})"><path d="M-9 0 C-9 -6.5 -2 -7 5 -2.5 L5 2.5 C-2 7 -9 6.5 -9 0Z" fill="${c}" ${ink}/><circle cx="-1.5" cy="0" r="1.8" fill="${INK}"/></g>` };
    },
    // An alto sax: the mouthpiece at the mouth, the crook down into the body, the body widening
    // down past both hands to the bow, the bell turned up in front; pearl keys, the tone holes.
    sax: (L, c = '#e0b040') => {
      const [f, b] = [L.arms[1].h, L.arms[0].h];
      const m = L.mouth;
      const [t0, t1] = [b[0] + 1.5, b[1] - 6];
      const [x, y] = [f[0] - 2, f[1] + 8];
      const P = (dx, dy) => pt([x + dx, y + dy]);
      const on = (u, dx = 0) => [n1(t0 + (x - t0) * u + dx), n1(t1 + (y - 3 - t1) * u)];
      const dark = shade(c, 0.35);
      const body = `M${pt([t0 - 1.2, t1])} L${P(-3, -3)} C${P(-3, 5)} ${P(11, 6)} ${P(12.5, -2)} L${P(14.5, -12)} L${P(16, -14)} L${P(7.5, -14.5)} Q${P(8.5, -12)} ${P(8.5, -9)} L${P(8, -3)} C${P(7.5, 1)} ${P(3, 1)} ${P(3, -3)} L${pt([t0 + 1.2, t1])}Z`;
      return { tip: [x + 11.7, y - 14.5], svg: `${inked(`M${pt([m[0] + 3.5, m[1] + 2.2])} Q${pt([m[0] + 10, m[1] + 2])} ${pt([t0, t1 + 0.5])}`, c, 1.9)}${inked(`M${pt([m[0] + 0.4, m[1] + 0.8])} L${pt([m[0] + 3.6, m[1] + 2.2])}`, '#1a1416', 2)}
        <path d="${body}" fill="${c}" ${ink}/><path d="M${pt(on(0.05, -0.4))} L${pt(on(0.95, -1.4))}" stroke="#fff6d8" stroke-width="0.8" opacity="0.7"/><path d="M${pt(on(0.1, 1.1))} L${pt(on(0.95, 2.4))}" stroke="${dark}" stroke-width="0.6"/>
        <ellipse cx="${n1(x + 11.75)}" cy="${n1(y - 14.25)}" rx="4.4" ry="1.3" transform="rotate(-6 ${pt([x + 11.75, y - 14.25])})" fill="${dark}" ${ink}/>
        ${[0.2, 0.38, 0.6, 0.78].map((u) => `<circle cx="${on(u, 1.4)[0]}" cy="${on(u, 1.4)[1]}" r="1.1" fill="#f6eedc" stroke="${dark}" stroke-width="0.5"/>`).join('')}
        ${[0.48, 0.7, 0.9].map((u) => `<circle cx="${on(u, -1.6)[0]}" cy="${on(u, -1.6)[1]}" r="1.3" fill="${dark}"/>`).join('')}<path d="M${P(1, 2.5)} q3 1.6 6 0" stroke="${dark}" stroke-width="0.7" fill="none"/>` };
    },
    sticks: (L, c = '#d8c8a0') => {
      const st = (a) => { const e = along(a.h, a.ang + 70, 13); return inked(`M${pt(a.h)} L${pt(e)}`, c, 1.6); };
      return { tip: along(L.arms[1].h, L.arms[1].ang + 70, 13), svg: '' , back: st(L.arms[0]), front: st(L.arms[1]) };
    },
  };

  const HATS = {
    cap: (h, c, a) => `<path d="M${h[0] - 11} ${h[1] - 2} C${h[0] - 11} ${h[1] - 12} ${h[0] - 4} ${h[1] - 14.5} ${h[0] + 1} ${h[1] - 14.5} C${h[0] + 8} ${h[1] - 14.5} ${h[0] + 11.5} ${h[1] - 9} ${h[0] + 11} ${h[1] - 3}Z" fill="${c}" ${ink}/><path d="M${h[0] + 8} ${h[1] - 4.5} H${h[0] + 18} Q${h[0] + 19.5} ${h[1] - 2} ${h[0] + 16} ${h[1] - 1.5} H${h[0] + 8}Z" fill="${a || shade(c, 0.2)}" ${ink}/>`,
    beanie: (h, c, a) => `<path d="M${h[0] - 11.5} ${h[1] - 2} C${h[0] - 12} ${h[1] - 16} ${h[0] + 12} ${h[1] - 16} ${h[0] + 11.5} ${h[1] - 2}Z" fill="${c}" ${ink}/><rect x="${h[0] - 12}" y="${h[1] - 5.5}" width="24" height="5" rx="2" fill="${a || shade(c, 0.2)}" ${ink}/>`,
    flatcap: (h, c) => `<path d="M${h[0] - 11.5} ${h[1] - 3} C${h[0] - 11} ${h[1] - 13} ${h[0] + 5} ${h[1] - 15} ${h[0] + 13} ${h[1] - 7} L${h[0] + 16} ${h[1] - 4} Q${h[0] + 6} ${h[1] - 2} ${h[0] - 11.5} ${h[1] - 3}Z" fill="${c}" ${ink}/>`,
    fedora: (h, c, a) => `<ellipse cx="${h[0] + 1}" cy="${h[1] - 6}" rx="16" ry="3" fill="${c}" ${ink}/><path d="M${h[0] - 8} ${h[1] - 6.5} L${h[0] - 7} ${h[1] - 16} Q${h[0] + 1} ${h[1] - 20} ${h[0] + 9} ${h[1] - 16} L${h[0] + 10} ${h[1] - 6.5}Z" fill="${c}" ${ink}/><path d="M${h[0] - 7.6} ${h[1] - 9.5} H${h[0] + 9.6}" stroke="${a || INK}" stroke-width="2.4"/>`,
    tophat: (h, c, a) => `<ellipse cx="${h[0]}" cy="${h[1] - 8}" rx="14.5" ry="2.8" fill="${c}" ${ink}/><rect x="${h[0] - 8.5}" y="${h[1] - 28}" width="17" height="20" rx="1.5" fill="${c}" ${ink}/><rect x="${h[0] - 8.5}" y="${h[1] - 13}" width="17" height="3.5" fill="${a || '#8a1a2a'}"/>`,
    cowboy: (h, c, a) => `<path d="M${h[0] - 18} ${h[1] - 6} Q${h[0] + 1} ${h[1] + 1} ${h[0] + 20} ${h[1] - 7} Q${h[0] + 1} ${h[1] - 3} ${h[0] - 18} ${h[1] - 6}Z" fill="${c}" ${ink}/><path d="M${h[0] - 8.5} ${h[1] - 5} L${h[0] - 7.5} ${h[1] - 16} Q${h[0] - 2} ${h[1] - 13} ${h[0] + 1} ${h[1] - 18} Q${h[0] + 4} ${h[1] - 13} ${h[0] + 9.5} ${h[1] - 16} L${h[0] + 10.5} ${h[1] - 5}Z" fill="${c}" ${ink}/><path d="M${h[0] - 8} ${h[1] - 8} H${h[0] + 10}" stroke="${a || INK}" stroke-width="2.2"/>`,
    crown: (h, c = '#d4af37', a) => `<path d="M${h[0] - 9.5} ${h[1] - 7} V${h[1] - 18} L${h[0] - 5} ${h[1] - 12.5} L${h[0]} ${h[1] - 20} L${h[0] + 5} ${h[1] - 12.5} L${h[0] + 9.5} ${h[1] - 18} V${h[1] - 7}Z" fill="${c}" ${ink}/><circle cx="${h[0]}" cy="${h[1] - 10}" r="1.8" fill="${a || '#c8303f'}"/>`,
    santa: (h, c, a) => `<path d="M${h[0] - 12} ${h[1] - 4} C${h[0] - 10} ${h[1] - 17} ${h[0] + 5} ${h[1] - 19} ${h[0] + 14} ${h[1] - 12} L${h[0] + 18} ${h[1] - 2} Q${h[0] + 6} ${h[1] - 8} ${h[0] - 12} ${h[1] - 4}Z" fill="${c}" ${ink}/><rect x="${h[0] - 12.5}" y="${h[1] - 8}" width="24.5" height="5.5" rx="2.7" fill="${a || '#f8f8f8'}" ${ink}/><circle cx="${h[0] + 18}" cy="${h[1] - 1}" r="3.3" fill="${a || '#f8f8f8'}" ${ink}/>`,
    chef: (h, c) => `<path d="M${h[0] - 9} ${h[1] - 8} C${h[0] - 16} ${h[1] - 12} ${h[0] - 12} ${h[1] - 24} ${h[0] - 4} ${h[1] - 21} C${h[0] - 2} ${h[1] - 28} ${h[0] + 8} ${h[1] - 27} ${h[0] + 8} ${h[1] - 20} C${h[0] + 15} ${h[1] - 21} ${h[0] + 15} ${h[1] - 11} ${h[0] + 9} ${h[1] - 8}Z" fill="${c}" ${ink}/><rect x="${h[0] - 10}" y="${h[1] - 9.5}" width="20" height="6" rx="1.5" fill="${shade(c, 0.06)}" ${ink}/>`,
    tricorn: (h, c, a) => `<path d="M${h[0] - 16} ${h[1] - 6} Q${h[0] - 11} ${h[1] - 19} ${h[0] + 1} ${h[1] - 17} Q${h[0] + 13} ${h[1] - 19} ${h[0] + 18} ${h[1] - 6} Q${h[0] + 1} ${h[1] - 11} ${h[0] - 16} ${h[1] - 6}Z" fill="${c}" ${ink}/><path d="M${h[0] - 14} ${h[1] - 7.5} Q${h[0] + 1} ${h[1] - 12} ${h[0] + 16} ${h[1] - 7.5}" stroke="${a || '#d4af37'}" stroke-width="1.4" fill="none"/>`,
    bandana: (h, c, a) => `<path d="M${h[0] - 11.5} ${h[1] - 1} C${h[0] - 12} ${h[1] - 13} ${h[0] - 4} ${h[1] - 13.5} ${h[0] + 2} ${h[1] - 13} C${h[0] + 8} ${h[1] - 12.5} ${h[0] + 11.5} ${h[1] - 8} ${h[0] + 11} ${h[1] - 4} Q${h[0]} ${h[1] - 7} ${h[0] - 11.5} ${h[1] - 1}Z" fill="${c}" ${ink}/><path d="M${h[0] - 11} ${h[1] - 2} l-6 -1 l2 5Z M${h[0] - 11} ${h[1] - 2} l-5 5 l4 1Z" fill="${a || c}" ${ink}/>`,
    beret: (h, c) => `<path d="M${h[0] - 12} ${h[1] - 5} Q${h[0] - 10} ${h[1] - 15} ${h[0] + 3} ${h[1] - 14} Q${h[0] + 14} ${h[1] - 12} ${h[0] + 10} ${h[1] - 6} Q${h[0]} ${h[1] - 4} ${h[0] - 12} ${h[1] - 5}Z" fill="${c}" ${ink}/><path d="M${h[0] - 1} ${h[1] - 14} v-3" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
    hood: (h, c) => `<path d="M${h[0] - 9} ${h[1] + 13} C${h[0] - 16} ${h[1] + 4} ${h[0] - 15} ${h[1] - 13} ${h[0] - 1} ${h[1] - 14.5} C${h[0] + 10} ${h[1] - 15} ${h[0] + 14} ${h[1] - 8} ${h[0] + 13.5} ${h[1] - 1} L${h[0] + 9.5} ${h[1] - 1} C${h[0] + 9} ${h[1] - 8} ${h[0] + 4} ${h[1] - 10} ${h[0]} ${h[1] - 9.5} C${h[0] - 6} ${h[1] - 9} ${h[0] - 7} ${h[1] - 2} ${h[0] - 3} ${h[1] + 12}Z" fill="${c}" ${ink}/>`,
    headband: (h, c, a) => `<path d="M${h[0] - 11.5} ${h[1] - 5} Q${h[0]} ${h[1] - 9.5} ${h[0] + 11.2} ${h[1] - 5.5}" stroke="${INK}" stroke-width="${4 + 2 * LW}" fill="none"/><path d="M${h[0] - 11.5} ${h[1] - 5} Q${h[0]} ${h[1] - 9.5} ${h[0] + 11.2} ${h[1] - 5.5}" stroke="${c}" stroke-width="4" fill="none"/>${a ? `<path d="M${h[0] - 10} ${h[1] - 6} q-6 -8 -3 -14 q2 6 3 14" fill="${a}" ${ink}/>` : ''}`,
    helmet: (h, c, a) => `<path d="M${h[0] - 11.5} ${h[1] + 10} V${h[1] - 4} Q${h[0] - 11.5} ${h[1] - 14} ${h[0]} ${h[1] - 14} Q${h[0] + 11.5} ${h[1] - 14} ${h[0] + 11.5} ${h[1] - 4} V${h[1] + 10}Z" fill="${c}" ${ink}/><rect x="${h[0] + 1}" y="${h[1] - 3.5}" width="11" height="2.6" rx="1.2" fill="${INK}"/><path d="M${h[0]} ${h[1] - 13.5} V${h[1] + 10}" stroke="${shade(c, 0.3)}" stroke-width="1.2"/>${a ? `<path d="M${h[0] - 2} ${h[1] - 14} Q${h[0] - 12} ${h[1] - 24} ${h[0] - 22} ${h[1] - 18} Q${h[0] - 12} ${h[1] - 16} ${h[0] - 6} ${h[1] - 12}Z" fill="${a}" ${ink}/>` : ''}`,
  };
  const HAT_COLOR = { cap: '#c0392b', beanie: '#2a4a6a', flatcap: '#6a5a44', fedora: '#2a2a30', tophat: '#1a1a1e', cowboy: '#7a5230', crown: '#d4af37', santa: '#c0392b', chef: '#f8f6f0', tricorn: '#1a1416', bandana: '#c0201a', beret: '#1a1a2a', hood: '#c0201a', headband: '#c0201a', helmet: '#b9c0c8' };

  // (Kit additions for the bars and nightlife: hats, props, top styles and critters. New keys
  // only; see the API comment above.) Hats get (head, colour, accent, side, back).
  Object.assign(HATS, {
    // Headphones over the head; hatAccent: a cap on backwards under them (the DJ).
    headphones: (h, c, a, side = true) => {
      const [x, y] = h;
      const capB = a ? `<path d="M${x - 11.2} ${y - 2} C${x - 11} ${y - 12} ${x - 4} ${y - 14.5} ${x} ${y - 14.5} C${x + 5} ${y - 14.5} ${x + 11.5} ${y - 11} ${x + 11.2} ${y - 2}Z" fill="${a}" ${ink}/>${side ? `<path d="M${x - 8} ${y - 4.5} H${x - 18} Q${x - 19.5} ${y - 2} ${x - 16} ${y - 1.5} H${x - 8}Z" fill="${shade(a, 0.2)}" ${ink}/>` : ''}` : '';
      const cup = (cx) => `<rect x="${n1(cx - 4)}" y="${y - 5}" width="8" height="11" rx="3.5" fill="${c}" ${ink}/>`;
      return `${capB}${inked(`M${x - 11} ${y - 1} Q${x} ${y - 22} ${x + 11} ${y - 1}`, c, 2.6)}${side ? cup(x - 3) : cup(x - 11) + cup(x + 11)}`;
    },
    // A soft cap with a long feather (the bard).
    feathercap: (h, c, a) => `<path d="M${h[0] - 3} ${h[1] - 12} Q${h[0] - 18} ${h[1] - 26} ${h[0] - 25} ${h[1] - 18} Q${h[0] - 14} ${h[1] - 17} ${h[0] - 4} ${h[1] - 8}Z" fill="${a || '#f0e4c8'}" ${ink}/><path d="M${h[0] - 12.5} ${h[1] - 3} Q${h[0] - 12} ${h[1] - 15} ${h[0] + 2} ${h[1] - 15} Q${h[0] + 14} ${h[1] - 14} ${h[0] + 13} ${h[1] - 4} Q${h[0]} ${h[1] - 7} ${h[0] - 12.5} ${h[1] - 3}Z" fill="${c}" ${ink}/>`,
    // A wreath of leaves (a toga party).
    laurel: (h, c) => [0, 1, 2, 3, 4, 5, 6].map((i) => { const t = i / 6; const px = h[0] - 12 + 23 * t; const py = h[1] - 2 - 4 * t - 14 * t * (1 - t); const a = Math.atan2(-4 - 14 * (1 - 2 * t), 23) / DEG; return `<ellipse cx="${n1(px)}" cy="${n1(py)}" rx="3.8" ry="1.9" transform="rotate(${n1(a + (i % 2 ? 30 : -30))} ${n1(px)} ${n1(py)})" fill="${c}" ${ink}/>`; }).join(''),
    // A Tyrolean hat: narrow brim, a cord round it, a tuft in the band (the oompah band).
    alpine: (h, c, a) => `<path d="M${h[0] - 6} ${h[1] - 13} Q${h[0] - 14} ${h[1] - 22} ${h[0] - 13} ${h[1] - 28} Q${h[0] - 8} ${h[1] - 20} ${h[0] - 3} ${h[1] - 14}Z" fill="${a || '#f2ead6'}" ${ink}/><ellipse cx="${h[0] + 1}" cy="${h[1] - 6}" rx="14.5" ry="2.8" fill="${c}" ${ink}/><path d="M${h[0] - 8} ${h[1] - 6.5} L${h[0] - 6} ${h[1] - 17} Q${h[0] + 1} ${h[1] - 20} ${h[0] + 8} ${h[1] - 17} L${h[0] + 10} ${h[1] - 6.5}Z" fill="${c}" ${ink}/><path d="M${h[0] - 7.6} ${h[1] - 9.5} H${h[0] + 9.6}" stroke="${shade(c, 0.4)}" stroke-width="2"/>`,
    // An iron helmet with horns (the mead hall).
    viking: (h, c, a) => `<path d="M${h[0] - 9} ${h[1] - 9} Q${h[0] - 20} ${h[1] - 12} ${h[0] - 19} ${h[1] - 26} Q${h[0] - 14} ${h[1] - 17} ${h[0] - 7} ${h[1] - 15}Z M${h[0] + 9} ${h[1] - 9} Q${h[0] + 20} ${h[1] - 12} ${h[0] + 19} ${h[1] - 26} Q${h[0] + 14} ${h[1] - 17} ${h[0] + 7} ${h[1] - 15}Z" fill="${a || '#efe6cf'}" ${ink}/><path d="M${h[0] - 12} ${h[1] - 2} Q${h[0] - 12} ${h[1] - 16} ${h[0]} ${h[1] - 16} Q${h[0] + 12} ${h[1] - 16} ${h[0] + 12} ${h[1] - 2}Z" fill="${c}" ${ink}/><rect x="${h[0] - 12.5}" y="${h[1] - 5}" width="25" height="4" rx="1.5" fill="${shade(c, 0.3)}" ${ink}/>`,
  });
  Object.assign(HAT_COLOR, { headphones: '#2a2a34', feathercap: '#8a2a2a', laurel: '#5a8a2a', alpine: '#3a5a2a', viking: '#8a9098' });
  Object.assign(PROPS, {
    // A bottle with a sparkler in it (bottle service: the spark crackles, class fg-spark).
    sparkler: (c = '#1a3a2a') => `${PROPS.bottle(c)}<path d="M0 -17 V-27" stroke="#d8d8d8" stroke-width="1.4"/><g class="fg-spark"><path d="M0 -36 V-22 M-7 -29 H7 M-5 -34 L5 -24 M5 -34 L-5 -24" stroke="#fff6c0" stroke-width="1.3" stroke-linecap="round"/><circle cx="0" cy="-29" r="3" fill="#fffbe0"/></g>`,
    // A cloth on its own (wiping the bar, a tankard).
    rag: (c = '#f4f0e8') => `<path d="M-6 -4 Q0 2 7 -5 L6 3 Q0 7 -5 3Z" fill="${c}" ${ink}/>`,
    // A cocktail shaker.
    shaker: (c = '#c9ccd1') => `<path d="M-4 2 L-5 -12 H5 L4 2Z" fill="${c}" ${ink}/><path d="M-4.6 -12 L-3 -17 H3 L4.6 -12Z" fill="${shade(c, 0.15)}" ${ink}/><rect x="-1.6" y="-19.6" width="3.2" height="2.8" fill="${shade(c, 0.25)}" ${ink}/><path d="M-2 -10 V0" stroke="#fff" stroke-width="1.2" opacity="0.6"/>`,
    // A violin case, carried by its handle.
    case: (c = '#141010') => `<path d="M-2 0 Q0 -4 2 0" stroke="${INK}" stroke-width="2.2" fill="none"/><path d="M-15 4 Q-15 0 -10 0 L13 -0.5 Q18 -0.5 18 4 L18 8 Q18 12 13 12 L-10 11.5 Q-15 11.5 -15 7.5Z" fill="${c}" ${ink}/><path d="M-12 6 H15" stroke="#b08d45" stroke-width="1"/>`,
    // A spatula, up.
    spatula: (c = '#b9c0c8') => `${inked('M0 4 V-12', '#5a3a20', 2.4)}<rect x="-5" y="-23" width="10" height="11" rx="1.5" fill="${c}" ${ink}/><path d="M-2.5 -21 v7 M0 -21 v7 M2.5 -21 v7" stroke="${shade(c, 0.3)}" stroke-width="0.9"/>`,
    // An armful of steins (the beer-hall waitress carries four in each hand).
    steins: (c = '#f4c43a') => [[-9, 3, -14], [9, 3, 14], [-3, -1, -5], [3, -1, 5]].map(([dx, dy, r]) => `<g transform="translate(${dx} ${dy}) rotate(${r}) scale(0.82)">${PROPS.stein(c)}</g>`).join(''),
    // For a diner's tray: a burger, a milkshake.
    burger: () => `<path d="M-6.5 -2 Q-6.5 -10 0 -10 Q6.5 -10 6.5 -2Z" fill="#c8842e" ${ink}/><rect x="-7" y="-2.4" width="14" height="2.8" rx="1" fill="#6a3a1a" ${ink}/><path d="M-7.5 -2.6 h15" stroke="#7ac04a" stroke-width="1.4"/><path d="M-6.5 0.6 h13 v1.2 q-6.5 2 -13 0Z" fill="#c8842e" ${ink}/>`,
    shake: (c = '#ffb3c6') => `<path d="M-3.5 2 L-4.5 -12 H4.5 L3.5 2Z" fill="${c}" ${ink}/><path d="M-5 -12 Q0 -18 5 -12Z" fill="#fff8f0" ${ink}/><path d="M1.5 -13 l2.5 -9" stroke="#fff" stroke-width="1.4"/><circle cx="0.5" cy="-17" r="1.8" fill="#c1121f" ${ink}/>`,
    // A tower of pizza boxes held out in front (it sways: class fg-stack).
    pizzas: (c = '#c8945a') => `<g class="fg-stack">${Array.from({ length: 7 }, (_, i) => `<rect x="${-4 + (i % 2) * 1.5}" y="${n1(-5 - i * 6.6)}" width="24" height="6.2" rx="1" fill="${i % 3 ? c : shade(c, 0.12)}" ${ink}/><rect x="${4 + (i % 2) * 1.5}" y="${n1(-3.6 - i * 6.6)}" width="8" height="3" fill="#c0392b" opacity="0.85"/>`).join('')}</g>`,
    // A round shield (in the far hand), a drinking horn.
    shield: (c = '#8a3a1a') => `<circle cx="0" cy="0" r="14" fill="${c}" ${ink}/><circle cx="0" cy="0" r="10.5" fill="none" stroke="${shade(c, -0.3)}" stroke-width="1.6"/><path d="M-14 0 H14 M0 -14 V14" stroke="${shade(c, 0.3)}" stroke-width="1.4"/><circle cx="0" cy="0" r="3.4" fill="#b9c0c8" ${ink}/>`,
    horn: (c = '#e8dcc0') => `<path d="M-3 2 Q-5 -8 1 -14 Q5 -18 10 -17 L9 -12.5 Q5 -12 3 -8 Q1.5 -3 3 2Z" fill="${c}" ${ink}/><path d="M-3.4 -1 H3.2" stroke="#b08d45" stroke-width="1.6"/>`,
  });
  Object.assign(TWO_HANDED, {
    // A tuba held in front, its bell up past the shoulder (it bobs: class fg-tuba).
    tuba: (L, c = '#e0b040') => {
      const f = L.arms[1].h;
      const bell = [f[0] + 9, f[1] - 40];
      return { tip: bell, svg: `<g class="fg-tuba">${inked(`M${pt([f[0] + 2, f[1] - 10])} Q${pt([f[0] + 12, f[1] - 22])} ${pt([bell[0] - 1, bell[1] + 6])}`, c, 5)}<path d="M${pt([bell[0] - 4, bell[1] + 8])} L${pt([bell[0] - 9, bell[1]])} H${n1(bell[0] + 9)} L${pt([bell[0] + 4, bell[1] + 8])}Z" fill="${c}" ${ink}/><ellipse cx="${n1(bell[0])}" cy="${n1(bell[1])}" rx="9" ry="3" fill="${shade(c, 0.55)}" ${ink}/><ellipse cx="${n1(f[0] - 1)}" cy="${n1(f[1] + 2)}" rx="11" ry="13" fill="${c}" ${ink}/><ellipse cx="${n1(f[0] - 1)}" cy="${n1(f[1] + 2)}" rx="6" ry="7.5" fill="none" stroke="${shade(c, 0.3)}" stroke-width="2.2"/><path d="M${pt([f[0] + 3, f[1] - 4])} v-6 M${pt([f[0] + 7, f[1] - 2])} v-6" stroke="${shade(c, 0.35)}" stroke-width="1.8" stroke-linecap="round"/></g>` };
    },
  });
  // topStyle registry: more kinds of top, drawn over the plain one ({ L, o, cx, band, torsoD, top,
  // accent, skin }). 'toga' (a drape, folds in accent), 'dirndl' (a laced bodice in accent over the
  // blouse, a short apron in accent2), 'braces' (lederhosen braces in accent), 'jumpsuit' (an open
  // collar, studs in accent).
  const TOP_STYLES = {
    toga: ({ cx, torsoD, top, accent }) => `<path d="${torsoD}" fill="${top}"/><path d="M${cx - 8} 36 L${cx + 10} 74 M${cx + 3} 36 L${cx - 9} 72 M${cx - 10} 54 L${cx + 10} 60" stroke="${accent || shade(top, 0.15)}" stroke-width="1.6" fill="none"/>`,
    dirndl: ({ cx, band, accent, o }) => `${band(48, 76, accent)}${[52, 58, 64].map((y) => `<path d="M${cx - 3} ${y} L${cx + 3} ${y + 4} M${cx + 3} ${y} L${cx - 3} ${y + 4}" stroke="${o.accent2 || '#e8c15a'}" stroke-width="1.1"/>`).join('')}${o.crop === 'waist' ? '' : `<path d="M${cx - 7} 72 H${cx + 7} L${cx + 8} 94 Q${cx} 96 ${cx - 8} 94Z" fill="#f6efe0" ${ink}/>`}`,
    braces: ({ cx, accent }) => `<path d="M${cx - 6} 35 L${cx - 5} 70 M${cx + 6} 35 L${cx + 5} 70" stroke="${accent}" stroke-width="3.2"/><path d="M${cx - 5.5} 48 H${cx + 5.5}" stroke="${accent}" stroke-width="2.6"/>`,
    // A flapper's dress: a dropped waist in accent, fringe below it (class fg-fringe), pearls.
    flapper: ({ cx, L, top, accent }) => `<path d="M${n1(30 - L.hw - 1)} 70 H${n1(30 + L.hw + 1)} V75 H${n1(30 - L.hw - 1)}Z" fill="${accent}" ${ink}/><g class="fg-fringe">${Array.from({ length: 11 }, (_, i) => { const x = 30 - L.hw - 3 + (i * (2 * L.hw + 6)) / 10; return `<path d="M${n1(x)} 75 L${n1(x + (x - 30) * 0.3)} 96" stroke="${i % 2 ? shade(top, -0.25) : shade(top, 0.2)}" stroke-width="2.2" stroke-linecap="round"/>`; }).join('')}</g>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${n1(cx + Math.sin(i / 2.2) * 3)}" cy="${37 + i * 3.4}" r="1.3" fill="#f4f0e6"/>`).join('')}`,
    jumpsuit: ({ cx, skin, accent }) => `<path d="M${cx - 5} 34.5 L${cx} 50 L${cx + 5} 34.5Z" fill="${skin}"/><path d="M${cx - 9} 33 L${cx - 5} 42 L${cx - 2} 35 M${cx + 9} 33 L${cx + 5} 42 L${cx + 2} 35" stroke="${accent}" stroke-width="1.4" fill="none"/>${[[-5, 56], [5, 56], [0, 62], [-6, 44], [6, 44]].map(([dx, y]) => `<circle cx="${cx + dx}" cy="${y}" r="1.3" fill="${accent}"/>`).join('')}`,
  };
  // Roller skates on the shoes (skates: the wheels' colour, or true).
  const skateSvg = (g, fwd, d, boot, wheel) => {
    const at = (t, k) => [g.h[0] + fwd[0] * t + d[0] * k, g.h[1] + fwd[1] * t + d[1] * k];
    return `${inked(`M${pt(at(-1.5, -3))} L${pt(at(-1.5, 1.5))}`, boot, 5)}${[-1.5, 4.5].map((t) => `<circle cx="${n1(at(t, 5.6)[0])}" cy="${n1(at(t, 5.6)[1])}" r="2.4" fill="${wheel}" ${ink}/>`).join('')}`;
  };
  // critter() registry: more kinds ({ color, draw(c, o, T) => { body, vb, h } }), and 'kind:pose'
  // for a pose of one (critter('cat', { pose: 'sleep' })). T has the drawing helpers.
  const CRITTERS = {
    // An owl, sitting, from the front (its eyes blink: class fg-blink).
    owl: { color: '#5a4434', draw: (c, o, T) => ({ vb: '0 0 60 76', h: 1.27, body: `${T.p('M10 72 Q2 46 10 26 L8 10 L18 18 Q30 12 42 18 L52 10 L50 26 Q58 46 50 72Z')}<path d="M18 46 Q30 40 42 46 Q44 62 30 70 Q16 62 18 46Z" fill="${shade(c, -0.35)}"/>${[50, 56, 62].map((y) => `<path d="M24 ${y} l3 2 l3 -2 l3 2 l3 -2" stroke="${shade(c, 0.2)}" stroke-width="1" fill="none"/>`).join('')}<g class="fg-blink">${[20, 40].map((x) => `<circle cx="${x}" cy="30" r="8" fill="${o.eye || '#ffd23f'}" ${ink}/><circle cx="${x}" cy="30" r="3" fill="${INK}"/>`).join('')}</g><path d="M27 37 L30 44 L33 37Z" fill="#c8902a" ${ink}/>${T.p('M22 72 v4 M38 72 v4', 'none')}` }) },
    // A dachshund trotting (coat: a little jacket on it).
    dachshund: { color: '#8a4a20', draw: (c, o, T) => ({ vb: '0 0 100 46', h: 0.46, body: `<g class="sc-tail" ${pivot([16, 23])}>${inked('M16 23 Q6 19 4 10', c, 3.6)}</g>${T.legs([22, 28, 66, 72], 31, 11, 4.6, c)}${T.p('M14 26 Q14 16 30 16 H68 Q79 16 81 24 Q81 34 70 34 H22 Q14 34 14 26Z')}${o.coat ? `<path d="M38 16.6 H60 V33.4 H38Z" fill="${o.coat}" ${ink}/><path d="M38 17 L49 25 L60 17 M38 33 L49 25 L60 33" stroke="#fff" stroke-width="1.3" fill="none"/>` : ''}<circle cx="84" cy="18" r="8.5" fill="${c}" ${ink}/>${T.p('M88 14 H96 Q100 14 100 18.5 Q100 23 96 23 H88Z')}${T.p('M79 11 Q74 18 78 28 Q83 27 84 14Z', shade(c, 0.28))}<ellipse cx="99" cy="17" rx="1.9" ry="1.6" fill="${INK}"/>${T.eye(88, 14.5, 9)}` }) },
    // A cricket, chirping (its wings rub: sc-buzz).
    cricket: { color: '#4a5a2a', draw: (c, o, T) => ({ vb: '0 0 100 50', h: 0.5, body: `${inked('M58 34 L44 14 L28 44', shade(c, 0.2), 3)}${inked('M70 36 l-4 10 M76 36 l4 10', shade(c, 0.25), 1.8)}${inked('M86 26 Q96 6 100 2 M84 26 Q92 12 98 12', shade(c, 0.3), 1.1)}${T.p('M30 36 Q32 24 56 24 Q74 24 80 30 Q80 40 66 40 H36 Q30 40 30 36Z')}<path class="sc-buzz" ${pivot([60, 26])} d="M34 30 Q50 18 72 26 Q54 30 34 30Z" fill="${shade(c, -0.25)}" ${ink}/><circle cx="82" cy="30" r="6.5" fill="${shade(c, 0.1)}" ${ink}/>${T.eye(84, 28, 8)}${inked('M50 34 L42 14 L20 44', c, 3.4)}` }) },
    // Curled up asleep (a cat, a dog): breathing slowly (class fg-breathe).
    'cat:sleep': { draw: (c, o, T) => ({ vb: '0 0 100 60', h: 0.6, body: `<g class="fg-breathe">${T.p('M16 56 Q12 34 40 30 Q66 28 76 40 Q82 54 70 57 H22 Q16 57 16 56Z')}${o.belly ? `<path d="M30 54 Q46 50 62 54" stroke="${o.belly}" stroke-width="3" fill="none"/>` : ''}</g>${inked('M20 55 Q30 62 60 58', c, 5)}<circle cx="74" cy="44" r="11" fill="${c}" ${ink}/>${T.p('M66 38 L66 27 L73 34Z')}${T.p('M77 34 L83 26 L84 38Z')}<path d="M71 45 q2.4 2 4.8 0 M78.5 45 q2.4 2 4.8 0" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` }) },
    'dog:sleep': { draw: (c, o, T) => ({ vb: '0 0 100 60', h: 0.6, body: `<g class="fg-breathe">${T.p('M14 56 Q10 34 38 32 Q64 30 72 42 Q78 54 66 57 H20 Q14 57 14 56Z')}</g>${inked('M18 55 Q8 52 10 44', c, 4.4)}<circle cx="76" cy="47" r="9.5" fill="${c}" ${ink}/>${T.p('M80 46 H92 Q97 46 97 51 Q97 56 92 56 H80Z')}${T.p('M69 40 Q64 46 68 56 Q73 55 74 43Z', shade(c, 0.28))}<ellipse cx="95.5" cy="49" rx="2" ry="1.7" fill="${INK}"/><path d="M78 45 q2 1.8 4 0" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` }) },
    // A small bird perched (the cuckoo).
    'bird:perch': { draw: (c, o, T) => ({ vb: '0 0 100 60', h: 0.6, body: `${inked('M50 48 v9 M58 48 v9', '#c8902a', 1.6)}${T.p('M34 42 L10 52 L14 44 L8 38 L32 36Z', shade(c, 0.12))}${T.p('M28 40 Q28 24 50 22 Q66 22 72 30 Q74 44 58 48 Q40 50 28 40Z')}<g class="sc-wing" ${pivot([46, 32])}>${T.p('M36 34 Q48 26 60 32 Q52 42 36 38Z', shade(c, 0.22))}</g><circle cx="72" cy="22" r="9" fill="${c}" ${ink}/>${T.p('M80 19 L92 22 Q88 26 80 26Z', o.beak || '#f0b020')}${T.eye(75, 20, 9)}` }) },
  };

  // (Kit additions for the themed rooms and the sea: the castle, the lighthouse, space, the tiki
  // bar, the saloon, the garage. New keys only; see the API comment above.)
  Object.assign(HATS, {
    // An oilskin sou'wester, its brim longer at the back (the lighthouse keeper in foul weather).
    souwester: (h, c) => { const [x, y] = h; return `<path d="M${x - 11} ${y - 3} C${x - 11} ${y - 16} ${x + 11} ${y - 16} ${x + 11} ${y - 3}Z" fill="${c}" ${ink}/><path d="M${x - 20} ${y + 5} Q${x - 13} ${y - 6} ${x} ${y - 4} Q${x + 12} ${y - 6} ${x + 17} ${y - 2} Q${x + 4} ${y - 1} ${x - 20} ${y + 5}Z" fill="${c}" ${ink}/>`; },
    // A jester's cap: three floppy points with bells, in hatColor and hatAccent.
    jester: (h, c, a = '#d4af37') => { const [x, y] = h; return `<path d="M${x - 9} ${y - 6} Q${x - 16} ${y - 20} ${x - 25} ${y - 9} Q${x - 14} ${y - 12} ${x - 4} ${y - 6}Z" fill="${a}" ${ink}/><path d="M${x + 3} ${y - 7} Q${x + 16} ${y - 22} ${x + 25} ${y - 10} Q${x + 14} ${y - 12} ${x + 9} ${y - 4}Z" fill="${a}" ${ink}/><path d="M${x - 6} ${y - 8} Q${x - 3} ${y - 29} ${x + 4} ${y - 27} Q${x + 2} ${y - 17} ${x + 6} ${y - 8}Z" fill="${c}" ${ink}/><rect x="${x - 11.5}" y="${y - 8}" width="23" height="5" rx="2" fill="${c}" ${ink}/>${[[x - 25, y - 9], [x + 4, y - 27], [x + 25, y - 10]].map(([bx, by]) => `<circle cx="${bx}" cy="${by}" r="2.6" fill="#f0c840" ${ink}/>`).join('')}`; },
    // A space helmet: a glass bubble over the head (the face shows through) on a collar ring.
    spacehelmet: (h, c) => { const [x, y] = h; return `<circle cx="${x}" cy="${y}" r="15.5" fill="rgba(180, 220, 255, 0.28)" ${ink}/><path d="M${x - 10} ${y - 6} Q${x - 6} ${y - 12} ${x + 1} ${y - 13}" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.75"/><rect x="${x - 12}" y="${y + 11}" width="24" height="5" rx="2.5" fill="${c}" ${ink}/>`; },
    // A welder's mask down over the face, its dark window lit (hatAccent).
    weldmask: (h, c, a = '#3a8aff', side = true) => { const [x, y] = h; return side ? `<path d="M${x - 10} ${y - 8} Q${x - 13} ${y - 1} ${x - 10} ${y + 5}" stroke="${INK}" stroke-width="2.4" fill="none"/><path d="M${x - 5} ${y - 14} Q${x + 9} ${y - 15} ${x + 15} ${y - 4} L${x + 15} ${y + 10} Q${x + 7} ${y + 16} ${x - 2} ${y + 14} Q${x - 7} ${y + 2} ${x - 5} ${y - 14}Z" fill="${c}" ${ink}/><rect x="${x + 5}" y="${y - 4}" width="9" height="5" rx="1" fill="${a}" ${ink}/>` : `<path d="M${x - 12} ${y - 12} Q${x} ${y - 17} ${x + 12} ${y - 12} L${x + 12} ${y + 9} Q${x} ${y + 16} ${x - 12} ${y + 9}Z" fill="${c}" ${ink}/><rect x="${x - 8}" y="${y - 4}" width="16" height="5" rx="1" fill="${a}" ${ink}/>`; },
    // Antennae with bobbles on the ends (the alien), in hatColor and hatAccent.
    antennae: (h, c, a = '#ff5c8a') => { const [x, y] = h; return `${inked(`M${x - 4} ${y - 10} Q${x - 7} ${y - 19} ${x - 12} ${y - 23}`, c, 1.8)}${inked(`M${x + 4} ${y - 10} Q${x + 7} ${y - 19} ${x + 12} ${y - 23}`, c, 1.8)}<circle cx="${x - 12}" cy="${y - 23}" r="3" fill="${a}" ${ink}/><circle cx="${x + 12}" cy="${y - 23}" r="3" fill="${a}" ${ink}/>`; },
    // A hibiscus over the ear (the hula dancer), in hatColor with a hatAccent middle.
    hibiscus: (h, c, a = '#ffd24a') => { const [x, y] = [h[0] - 6, h[1] - 8]; return `${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="${x}" cy="${y - 3.6}" rx="2.6" ry="4" transform="rotate(${r} ${x} ${y})" fill="${c}" ${ink}/>`).join('')}<circle cx="${x}" cy="${y}" r="1.8" fill="${a}"/>`; },
  });
  Object.assign(HAT_COLOR, { souwester: '#e8b81a', jester: '#c8303f', spacehelmet: '#c8d0dc', weldmask: '#2a3038', antennae: '#6ad86a', hibiscus: '#ff4a7a' });
  Object.assign(PROPS, {
    // A golden goblet of wine (the king's).
    goblet: (c = '#d4af37') => `${inked('M0 -5 V1.5 M-3.5 2 H3.5', c, 1.8)}<path d="M-5.5 -15 H5.5 Q5.5 -6 0 -5 Q-5.5 -6 -5.5 -15Z" fill="${c}" ${ink}/><path d="M-4.6 -13.4 H4.6" stroke="#6a0c18" stroke-width="2"/><circle cx="0" cy="-9" r="1.3" fill="#c8303f"/>`,
    // A sword, point up; a heater shield (a knight's), its cross in gold.
    sword: (c = '#d8dde3') => `<path d="M-1.7 -6 V-34 L0 -37.5 L1.7 -34 V-6Z" fill="${c}" ${ink}/>${inked('M-6 -5 H6', '#d9ad52', 2.4)}${inked('M0 -3.6 V2.6', '#6a4424', 2.4)}<circle cx="0" cy="4" r="2" fill="#d9ad52" ${ink}/>`,
    heater: (c = '#1f4f9e') => `<path d="M-10 -12 H10 V-2 Q10 10 0 16 Q-10 10 -10 -2Z" fill="${c}" ${ink}/><path d="M-1.7 -10 h3.4 v6 h6 v3.4 h-6 v13 h-3.4 v-13 h-6 v-3.4 h6Z" fill="#d9ad52"/>`,
    // A storm lantern hanging from the hand, lit (it swings with hooks: { propB: ... }).
    lamp: (c = '#ffd27a') => `<circle cx="0" cy="15" r="12" fill="${c}" opacity="0.25"/><path d="M-4 6 Q0 -1 4 6" fill="none" stroke="${INK}" stroke-width="1.4"/><path d="M-5 6 h10 l-1.5 3 h-7Z" fill="#2a2a2a" ${ink}/><rect x="-4.5" y="9" width="9" height="11" rx="1.5" fill="${c}" ${ink}/><path d="M0 9 V20" stroke="${INK}" stroke-width="0.9"/><path d="M-5 20 h10 l-1 2.5 h-8Z" fill="#2a2a2a" ${ink}/>`,
    // A revolver, barrel down along the hand (raise the arm to aim it); its flash, class
    // fg-muzzle, is hidden till the scene shows it.
    gun: (c = '#3a3a40') => `<path d="M-1.2 -3.5 L3.4 -2.4 L2.8 3 L-1.6 3Z" fill="#6a4424" ${ink}/><path d="M-2.2 2 H3.2 V6.5 H1.8 V15 H-0.6 V6.5 H-2.2Z" fill="${c}" ${ink}/><g class="fg-muzzle"><path d="M0.6 16 l-5 7 l4 -2 l1 6 l2 -6 l4 2Z" fill="#ffd23f" ${ink}/></g>`,
    // A welding torch, pointing forward, its flame blue.
    blowtorch: (c = '#c0392b') => `${inked('M2 -1 H14', '#9aa4ae', 2)}<rect x="-2.6" y="-4.5" width="5.6" height="9" rx="1.8" fill="${c}" ${ink}/><path class="fg-flame" d="M14 -1 L22 -3.4 L19.5 -1 L22 1.4Z" fill="#9ad0ff" ${ink}/>`,
    // A canoe paddle held by the shaft, its blade down.
    paddle: (c = '#8a5a2a') => `${inked('M0 -12 V26', '#6a4424', 2.2)}<path d="M-3.4 24 h6.8 v12 q-3.4 4.5 -6.8 0Z" fill="${c}" ${ink}/>`,
  });
  // Where the far end of one of these is, from the hand (for sparks, a flame, a muzzle flash).
  const PROP_TIPS = { blowtorch: [23, 1], gun: [1, 20], sword: [1, -36], paddle: [1, 38] };
  Object.assign(TOP_STYLES, {
    // A knight's tabard over mail (top): the panel in accent, a cross in accent2.
    tabard: ({ cx, accent, o }) => `<path d="M${cx - 8} 36 H${cx + 8} L${cx + 9.5} 94 Q${cx} 97 ${cx - 9.5} 94Z" fill="${accent}" ${ink}/><path d="M${cx - 1.8} 42 h3.6 v9 h7 v3.6 h-7 v16 h-3.6 v-16 h-7 v-3.6 h7Z" fill="${o.accent2 || '#c0392b'}"/>`,
    // A jester's motley: diamonds in accent.
    harlequin: ({ cx, accent }) => [[-6, 44], [4, 50], [-6, 58], [4, 64], [-2, 71]].map(([dx, y]) => `<path d="M${cx + dx} ${y - 5} l4 5 l-4 5 l-4 -5Z" fill="${accent}"/>`).join(''),
  });
  // neck: more kinds ('ermine': a king's white collar with black tails; 'lei': flowers).
  const NECKS = {
    ermine: (cx) => `<path d="M${cx - 12} 35 Q${cx} 46 ${cx + 12} 35 L${cx + 13} 41 Q${cx} 53 ${cx - 13} 41Z" fill="#f4f0e8" ${ink}/>${[-8, -3, 3, 8].map((dx) => `<path d="M${cx + dx} ${43 + (Math.abs(dx) < 5 ? 2 : 0)} v3" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`).join('')}`,
    lei: (cx) => Array.from({ length: 9 }, (_, i) => `<circle cx="${n1(cx - 10 + i * 2.5)}" cy="${n1(36 + Math.sin((i / 8) * Math.PI) * 7)}" r="2.6" fill="${['#ff5a8a', '#ffd24a', '#fff0f4'][i % 3]}" stroke="${INK}" stroke-width="0.9"/>`).join(''),
  };
  // More faces: 'alien' (three eyes).
  const FACES = {
    alien: ({ x, y, side, smile }) => (side ? [[x + 1.2, y - 1.5], [x + 5.4, y - 4.6], [x + 9, y - 0.6]] : [[x - 5, y - 1], [x, y - 4.6], [x + 5, y - 1]]).map(([ex, ey]) => `<circle cx="${n1(ex)}" cy="${n1(ey)}" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="${n1(ex + 0.5)}" cy="${n1(ey + 0.3)}" r="1.3" fill="${INK}"/>`).join('') + smile,
  };
  // Over the face: mask (a bandana up over the nose, in that colour), inMouth ('pipe', smoking:
  // class fg-smoke).
  const faceExtras = (o, h, side) => {
    const [x, y] = h;
    let s = '';
    if (o.mask) s += side ? `<path d="M${x - 3} ${y + 1} L${x + 12} ${y + 0.5} Q${x + 12.5} ${y + 9} ${x + 4} ${y + 12} Q${x - 3} ${y + 11.5} ${x - 7} ${y + 6}Z" fill="${o.mask}" ${ink}/><path d="M${x - 6} ${y + 5} l-6 3 l3 3Z" fill="${o.mask}" ${ink}/>` : `<path d="M${x - 11} ${y + 1} H${x + 11} Q${x + 9} ${y + 13} ${x} ${y + 14.5} Q${x - 9} ${y + 13} ${x - 11} ${y + 1}Z" fill="${o.mask}" ${ink}/>`;
    if (o.inMouth === 'pipe') {
      const m = side ? [x + 6.4, y + 5.6] : [x + 1, y + 5.6];
      s += `${inked(`M${pt(m)} L${pt([m[0] + 7, m[1] + 1.5])}`, '#3a2414', 1.6)}<path d="M${n1(m[0] + 6)} ${n1(m[1] - 3)} h5 v4.5 q-2.5 2 -5 0Z" fill="#5a3a1e" ${ink}/><g class="fg-smoke">${[[9, -7, 2.2], [11, -13, 3], [9, -20, 3.8]].map(([dx, dy, r]) => `<circle cx="${n1(m[0] + dx)}" cy="${n1(m[1] + dy)}" r="${r}" fill="#dfe6ec" opacity="0.55"/>`).join('')}</g>`;
    }
    return s;
  };
  // bottomStyle 'grass': a grass skirt to the knee, over bare legs (sway it with hooks: { skirt }).
  const grassSkirt = (L, c = '#9ab64a') => `${Array.from({ length: 15 }, (_, i) => { const t = i / 14; const x0 = 30 - L.hw + t * 2 * L.hw; return inked(`M${n1(x0)} 72 L${n1(30 + (x0 - 30) * 1.45)} 98`, ['#9ab64a', '#c8b45a', '#7a9a3a', '#d8c070'][i % 4], 2.2); }).join('')}<rect x="${n1(29 - L.hw)}" y="69" width="${n1(2 * L.hw + 2)}" height="5" rx="2" fill="${c === '#9ab64a' ? '#e8572a' : c}" ${ink}/>`;
  // Two more poses: 'juggle' (both hands up in front, in turn: fg-juggle), 'lie' is done by
  // turning a figure on its side (see the garage's creeper).
  Object.assign(ARM_POSES, { juggle: [22, 96], juggleB: [30, 84] });
  Object.assign(POSES, { juggle: { arms: ['juggleB', 'juggle'], legs: ['stand', 'stand'] } });
  Object.assign(CRITTERS, {
    // A horse at a walk or gallop (legs: sc-legs-f/b), saddle: a colour.
    horse: { color: '#6a4424', draw: (c, o, T) => ({ vb: '0 0 100 80', h: 0.8, body: `<g class="sc-tail" ${pivot([24, 32])}>${T.p('M24 30 Q8 30 5 54 Q11 47 15 45 Q13 53 18 57 Q20 42 27 37Z', shade(c, 0.35))}</g>${T.legs([28, 35, 63, 70], 44, 32, 5.6, c)}${T.p('M20 38 Q20 26 38 26 H64 Q74 26 78 30 Q82 46 68 48 H30 Q20 48 20 38Z')}${T.p('M62 32 Q68 16 80 8 L88 14 Q82 24 78 40Z')}${T.p('M78 6 Q86 1 92 8 L99 18 Q100 24 94 24 L86 21 Q79 18 78 10Z')}${T.p('M81 6 L82 -1 L86 5Z')}${T.p('M79 7 Q68 12 61 30 L67 32 Q72 18 84 10Z', shade(c, 0.4))}${o.saddle ? `<path d="M40 25 Q50 30 60 25 L61 34 Q50 37 39 34Z" fill="${o.saddle}" ${ink}/>` : ''}${T.eye(87, 11, 9)}<ellipse cx="96" cy="20" rx="1.2" ry="1" fill="${INK}"/>` }) },
    // A parrot in flight: red, its wings blue (wing), a long tail (tail).
    parrot: { color: '#e8352f', draw: (c, o, T) => {
      const w = o.wing || '#2f7fe0';
      const wingD = (dx) => `M${62 + dx} 26 Q${58 + dx} 8 ${44 + dx} -2 L${40 + dx} 2 L${36 + dx} -2 L${33 + dx} 3 L${28 + dx} 0 L${27 + dx} 6 Q${34 + dx} 18 ${40 + dx} 28Z`;
      const wing = (back) => `<g class="sc-wing" ${pivot([52, 27])}>${T.p(wingD(back ? -8 : 0), back ? shade(w, 0.25) : w)}${back ? '' : '<path d="M40 27 Q36 16 30 4" stroke="#ffd23f" stroke-width="3" fill="none" opacity="0.9"/>'}</g>`;
      return { vb: '0 -4 100 44', h: 0.44, body: `${wing(true)}${T.p('M24 31 L-6 42 L-1 35 L-7 31 L22 27Z', o.tail || w)}${T.p('M22 30 L3 36 L18 27Z', '#ffd23f')}${T.p('M18 31 Q30 21 54 22 Q70 22 78 27 Q72 37 56 37 Q34 39 18 31Z')}<circle cx="79" cy="24" r="7.5" fill="${c}" ${ink}/>${T.p('M85 20 Q94 19 93.5 27 Q91 25.5 89.5 29 Q86.5 27.5 85 27Z', '#f4e8c8')}<circle cx="81.5" cy="22.6" r="2.6" fill="#fff" stroke="${INK}" stroke-width="0.9"/>${T.eye(81.9, 22.8, 6)}${wing(false)}` };
    } },
    // A flamingo in flight: neck out in front, legs trailing behind.
    flamingo: { color: '#f48aa8', draw: (c, o, T) => {
      const wingD = (dx) => `M${58 + dx} 27 Q${54 + dx} 9 ${42 + dx} -1 L${38 + dx} 3 L${34 + dx} -1 L${31 + dx} 4 L${27 + dx} 1 L${26 + dx} 7 Q${32 + dx} 19 ${38 + dx} 29Z`;
      const wing = (back) => `<g class="sc-wing" ${pivot([48, 28])}>${T.p(wingD(back ? -8 : 0), back ? shade(c, 0.25) : c)}<path d="M${42 + (back ? -8 : 0)} -1 L${38 + (back ? -8 : 0)} 3 L${34 + (back ? -8 : 0)} -1 L${31 + (back ? -8 : 0)} 4 L${27 + (back ? -8 : 0)} 1 L${26 + (back ? -8 : 0)} 7 Q${30 + (back ? -8 : 0)} 6 ${40 + (back ? -8 : 0)} 4Z" fill="${INK}"/></g>`;
      return { vb: '0 -4 100 44', h: 0.44, body: `${wing(true)}${inked('M30 30 L-4 31 M30 31 L-3 35', '#e86a8a', 1.8)}${T.p('M26 30 Q34 22 50 23 Q62 24 66 29 Q60 36 46 36 Q32 37 26 30Z')}${inked('M62 28 Q76 24 88 27', c, 4)}<circle cx="90" cy="27" r="4.6" fill="${c}" ${ink}/>${T.p('M93.5 25 Q101 26.5 99 32 Q97 29.5 93 29Z', '#2a1e1e')}${T.eye(90.6, 26, 5)}${wing(false)}` };
    } },
    // A dolphin leaping, a fish jumping (face right; the scenes arc them out of the water).
    dolphin: { color: '#5b7f9c', draw: (c, o, T) => ({ vb: '0 0 100 50', h: 0.5, body: `${T.p('M12 31 L0 20 L5 31 L0 43Z')}${T.p('M44 12 Q48 0 59 2 Q52 6 54 12Z', shade(c, 0.2))}${T.p('M8 31 Q22 12 46 10 Q70 9 86 20 L97 22 Q99 26 92 27.5 L84 27.5 Q72 35 54 35 Q34 36 14 37 Q12 33 8 31Z')}<path d="M30 33 Q58 35 84 26" stroke="${o.belly || '#c8d8e4'}" stroke-width="3" fill="none" stroke-linecap="round"/>${T.p('M58 31 Q61 41 52 44 Q54 37 51 32Z', shade(c, 0.2))}${T.eye(80, 18, 9)}<path d="M86 24 q4 1 8 0" stroke="${INK}" stroke-width="1.1" fill="none"/>` }) },
    fish: { color: '#a8b8c0', draw: (c, o, T) => ({ vb: '0 0 100 50', h: 0.5, body: `${T.p('M26 25 L4 11 L10 25 L4 39Z', shade(c, 0.2))}${T.p('M48 14 Q54 4 65 8 Q60 12 61 16Z', shade(c, 0.2))}${T.p('M20 25 Q40 8 66 14 Q82 18 92 25 Q82 33 66 36 Q40 42 20 25Z')}<path d="M70 18 Q66 25 70 32" stroke="${INK}" stroke-width="1.2" fill="none"/><path d="M34 27 Q56 33 84 27" stroke="#fff" stroke-width="2" fill="none" opacity="0.5"/>${T.eye(80, 22, 9)}` }) },
    // A seal bobbing up, from the side.
    seal: { color: '#7a7468', draw: (c, o, T) => ({ vb: '0 0 100 70', h: 0.7, body: `${T.p('M18 70 Q14 44 34 31 Q44 23 50 13 Q56 3 68 4 Q81 6 81 18 Q81 28 71 32 Q62 44 64 70Z')}<path d="M58 36 Q50 52 52 70" stroke="${shade(c, -0.3)}" stroke-width="6" fill="none" opacity="0.6"/>${T.p('M58 46 Q73 51 77 62 Q64 61 56 54Z', shade(c, 0.2))}<ellipse cx="80" cy="16" rx="2.4" ry="2" fill="${INK}"/>${T.eye(70, 11, 10)}<path d="M76 21 l10 -2 M76 22 l10 2 M75 23 l8 5" stroke="${INK}" stroke-width="0.9"/>` }) },
    // A crab, from the front, scuttling (legs: sc-legs-f/b), claws up.
    crab: { color: '#d8482a', draw: (c, o, T) => {
      const legL = (k) => [0, 1, 2].filter((i) => i % 2 === k).map((i) => inked(`M${30 + i * 4} 44 l-12 ${6 + i} l-4 ${6 - i}`, shade(c, 0.15), 2.6) + inked(`M${70 - i * 4} 44 l12 ${6 + i} l4 ${6 - i}`, shade(c, 0.15), 2.6)).join('');
      const claw = (m) => `${inked(`M${50 + m * 24} 34 Q${50 + m * 36} 28 ${50 + m * 36} 18`, c, 4)}<path d="M${50 + m * 36} 22 Q${50 + m * 30} 8 ${50 + m * 38} 6 L${50 + m * 38} 13 L${50 + m * 44} 10 Q${50 + m * 46} 22 ${50 + m * 36} 22Z" fill="${c}" ${ink}/>`;
      return { vb: '0 0 100 60', h: 0.6, body: `<g class="sc-legs-b">${legL(0)}</g><g class="sc-legs-f">${legL(1)}</g>${claw(-1)}${claw(1)}${inked('M43 27 V17 M57 27 V17', c, 2.4)}${T.p('M24 40 Q24 24 50 24 Q76 24 76 40 Q76 50 50 50 Q24 50 24 40Z')}<path d="M36 44 q14 5 28 0" stroke="${shade(c, 0.25)}" stroke-width="1.6" fill="none"/>${[43, 57].map((x) => `<circle cx="${x}" cy="15" r="3.6" fill="#fff" ${ink}/><circle cx="${x + 0.6}" cy="15.4" r="1.6" fill="${INK}"/>`).join('')}<path d="M45 34 q5 3 10 0" stroke="${INK}" stroke-width="1.3" fill="none"/>` };
    } },
    // A gecko, from above, facing right (turn it to climb a wall).
    gecko: { color: '#5ab84a', draw: (c, o, T) => ({ vb: '0 0 100 40', h: 0.4, body: `${inked('M30 20 Q12 18 7 26 Q4 34 12 32', c, 4.4)}${inked('M72 15 l3 -9 l5 -1 M72 25 l3 9 l5 1 M42 15 l-3 -9 l-5 -1 M42 25 l-3 9 l-5 1', c, 2.6)}${T.p('M26 20 Q40 12 64 14 Q74 14 80 15.5 Q93 15 97 20 Q93 25 80 24.5 Q74 26 64 26 Q40 28 26 20Z')}${[[48, 18], [58, 22], [66, 17], [40, 21]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${shade(c, -0.4)}"/>`).join('')}${T.eye(89, 17.5, 8)}${T.eye(89, 22.5, 8)}` }) },
    // A rattlesnake, slithering along (face right).
    snake: { color: '#8a7a3a', draw: (c, o, T) => ({ vb: '0 0 100 36', h: 0.36, body: `${inked('M4 28 Q16 14 28 26 T52 26 T76 22 Q82 20 86 18', c, 6)}<path d="M8 25 Q16 17 26 25 T50 26 T74 22" stroke="${shade(c, 0.35)}" stroke-width="2" stroke-dasharray="3 4" fill="none"/>${T.p('M82 14 Q90 10 98 16 Q98 22 90 23 Q84 23 82 20Z')}${T.eye(91, 15, 8)}<path d="M98 19 l5 1 l2 -2.4 M103 20 l2 2.4" stroke="#d62828" stroke-width="1.2" fill="none" stroke-linecap="round"/>${inked('M4 28 l-3 -2 M4 28 l-3 1', '#c8b48a', 2.4)}` }) },
    // A gull perched on a rail, its head turning (class fg-head).
    'gull:perch': { draw: (c, o, T) => ({ vb: '0 0 100 80', h: 0.8, body: `${inked('M48 62 v14 M58 62 v14', '#f0a020', 2)}${T.p('M30 50 L6 58 L12 50 L8 44 L28 44Z', '#3a3a3e')}${T.p('M24 46 Q26 30 50 28 Q70 28 76 40 Q76 56 58 62 Q38 64 24 46Z')}${T.p('M30 44 Q44 34 64 40 Q58 54 34 52Z', '#9aa4ae')}<g class="fg-head" ${pivot([70, 36])}><circle cx="76" cy="23" r="10" fill="${c}" ${ink}/>${T.p('M85 21 L98 25 L85 28Z', '#f0b020')}${T.eye(79, 21, 10)}</g>` }) },
  });
  // critter.at(kind, x, y, w, opts): an animal inside another drawing (a horse under a rider), the
  // middle of its feet on (x, y), w wide, in that drawing's units (a <g>, like figureAt); flip:
  // true faces it left.
  critter.at = (kind, x, y, w, o = {}) => {
    const r = critter(kind, { ...o, raw: true });
    const [vx, vy, vw, vh] = r.vb.split(' ').map(Number);
    const s = w / vw;
    const f = o.flip ? -1 : 1;
    return `<g class="fg-crit fg-${kind}${o.still ? ' fg-still' : ''}" transform="translate(${n1(x - f * (vx + vw / 2) * s)} ${n1(y - (vy + vh) * s)}) scale(${+(f * s).toFixed(4)} ${+s.toFixed(4)})">${r.body}</g>`;
  };

  // (Kit additions for the seasons and outdoors: Halloween, Christmas, the château, the Highlands,
  // the vineyard, the pirate ship. New keys only; see the API comment above.)
  Object.assign(HATS, {
    // A witch's pointed hat, its tip bent back, a band in hatAccent.
    witch: (h, c, a) => `<ellipse cx="${h[0] + 1}" cy="${h[1] - 6}" rx="19" ry="3.4" fill="${c}" ${ink}/><path d="M${h[0] - 9} ${h[1] - 7} Q${h[0] - 6} ${h[1] - 22} ${h[0] - 15} ${h[1] - 36} Q${h[0] + 3} ${h[1] - 26} ${h[0] + 9} ${h[1] - 7}Z" fill="${c}" ${ink}/><path d="M${h[0] - 8.4} ${h[1] - 10.5} Q${h[0]} ${h[1] - 12.5} ${h[0] + 8.6} ${h[1] - 10.5}" stroke="${a || '#7a3a9a'}" stroke-width="2.6" fill="none"/>`,
    // An elf's pointed cap, flopping back, a bell on the end and a band in hatAccent.
    elf: (h, c, a) => `<path d="M${h[0] - 11.5} ${h[1] - 3} Q${h[0] - 8} ${h[1] - 20} ${h[0] - 22} ${h[1] - 26} Q${h[0] + 4} ${h[1] - 24} ${h[0] + 11.5} ${h[1] - 3}Z" fill="${c}" ${ink}/><rect x="${h[0] - 12.5}" y="${h[1] - 7}" width="25" height="4.6" rx="2" fill="${a || '#c0392b'}" ${ink}/><circle cx="${h[0] - 22}" cy="${h[1] - 26}" r="2.8" fill="#e8c15a" ${ink}/>`,
    // A tam o' shanter: a flat bonnet, a band in hatAccent, a red toorie on top.
    tam: (h, c, a) => `<path d="M${h[0] - 13} ${h[1] - 6} Q${h[0] - 16} ${h[1] - 15} ${h[0] - 2} ${h[1] - 16} Q${h[0] + 14} ${h[1] - 16} ${h[0] + 12} ${h[1] - 6}Z" fill="${c}" ${ink}/><rect x="${h[0] - 11.5}" y="${h[1] - 7.5}" width="23" height="3.6" rx="1" fill="${a || '#c0392b'}" ${ink}/><circle cx="${h[0] - 2}" cy="${h[1] - 17}" r="2.8" fill="#c0392b" ${ink}/>`,
    // A lady's wide sun hat, a ribbon in hatAccent and a flower.
    sunhat: (h, c, a) => `<ellipse cx="${h[0] + 1}" cy="${h[1] - 7}" rx="21" ry="4.2" fill="${c}" ${ink}/><path d="M${h[0] - 9} ${h[1] - 8} Q${h[0] - 9} ${h[1] - 19} ${h[0]} ${h[1] - 19} Q${h[0] + 9} ${h[1] - 19} ${h[0] + 9} ${h[1] - 8}Z" fill="${c}" ${ink}/><path d="M${h[0] - 9} ${h[1] - 11} H${h[0] + 9}" stroke="${a || '#c0392b'}" stroke-width="3"/><path d="M${h[0] - 9} ${h[1] - 10} q-6 4 -8 10 M${h[0] - 9} ${h[1] - 10} q-3 6 -2 11" stroke="${a || '#c0392b'}" stroke-width="2" fill="none"/><circle cx="${h[0] + 6}" cy="${h[1] - 12}" r="2.6" fill="#f4a0b8" ${ink}/>`,
    // The red cap of liberty (bonnet phrygien), flopping forward, a tricolour cockade.
    phrygian: (h, c) => `<path d="M${h[0] - 11.5} ${h[1] - 3} C${h[0] - 12} ${h[1] - 15} ${h[0] - 4} ${h[1] - 20} ${h[0] + 4} ${h[1] - 20} Q${h[0] + 14} ${h[1] - 20} ${h[0] + 15} ${h[1] - 12} Q${h[0] + 10} ${h[1] - 14} ${h[0] + 8} ${h[1] - 12} L${h[0] + 11} ${h[1] - 5}Z" fill="${c}" ${ink}/><circle cx="${h[0] - 6}" cy="${h[1] - 7}" r="2.8" fill="#0055a4" ${ink}/><circle cx="${h[0] - 6}" cy="${h[1] - 7}" r="1.6" fill="#f4f4f4"/><circle cx="${h[0] - 6}" cy="${h[1] - 7}" r="0.7" fill="#ef4135"/>`,
    // A headscarf over the hair, knotted at the back.
    headscarf: (h, c) => `<path d="M${h[0] - 12} ${h[1] + 4} C${h[0] - 13} ${h[1] - 10} ${h[0] - 4} ${h[1] - 14} ${h[0] + 2} ${h[1] - 13} C${h[0] + 8} ${h[1] - 12} ${h[0] + 12} ${h[1] - 7} ${h[0] + 11} ${h[1] - 3} Q${h[0] + 2} ${h[1] - 6} ${h[0] - 4} ${h[1] - 2} Q${h[0] - 6} ${h[1] + 4} ${h[0] - 12} ${h[1] + 4}Z" fill="${c}" ${ink}/><path d="M${h[0] - 11} ${h[1] + 2} l-6 6 l5 1Z M${h[0] - 11} ${h[1] + 2} l-2 8 l4 -1Z" fill="${c}" ${ink}/>`,
  });
  Object.assign(HAT_COLOR, { witch: '#07040c', elf: '#2a8a3a', tam: '#1e3a5a', sunhat: '#f4e4c8', phrygian: '#c0201a', headscarf: '#6a4a8a' });
  // More faces: 'glasses' (round specs), 'skull' (sockets, a nose hole, teeth), 'patch' (an eye
  // patch, a grin), 'puff' (cheeks blown out, puffing: class fg-puff).
  Object.assign(FACES, {
    glasses: ({ eyes, smile, cheeks }) => eyes.map(dotRim).join('') + `<path d="M${n1(eyes[0][0] + 3.2)} ${eyes[0][1] - 0.6} H${n1(eyes[1][0] - 3.2)}" stroke="${INK}" stroke-width="1.1"/>` + smile + cheeks,
    skull: ({ eyes, m, side }) => eyes.map(([ex, ey]) => `<ellipse cx="${n1(ex - (side ? 0.4 : 0))}" cy="${ey - 0.2}" rx="3" ry="3.4" fill="${INK}"/>`).join('') + `<path d="M${n1(m[0] - (side ? 1.4 : 0))} ${m[1] - 3.2} l-1.4 2.4 h2.8Z" fill="${INK}"/><path d="M${n1(m[0] - 3.4)} ${m[1] + 1} h6.4 M${n1(m[0] - 1.8)} ${m[1] - 0.2} v2.6 M${n1(m[0])} ${m[1] - 0.2} v2.6 M${n1(m[0] + 1.8)} ${m[1] - 0.2} v2.6" stroke="${INK}" stroke-width="1.1"/>`,
    patch: ({ eyes, m, x, y }) => `<ellipse cx="${n1(eyes[1][0])}" cy="${eyes[1][1]}" rx="1.7" ry="2.2" fill="${INK}"/><path d="M${x - 10.4} ${y - 5} L${n1(eyes[0][0] + 2)} ${y - 1.4}" stroke="${INK}" stroke-width="1.2"/><ellipse cx="${n1(eyes[0][0])}" cy="${eyes[0][1] - 0.2}" rx="3.2" ry="3" fill="${INK}"/><path d="M${n1(m[0] - 3.2)} ${m[1] - 0.6} Q${m[0]} ${m[1] + 4.4} ${n1(m[0] + 3.2)} ${m[1] - 0.6}Z" fill="${INK}"/>`,
    puff: ({ eyes, m, side }) => eyes.map(([ex, ey]) => `<ellipse cx="${n1(ex)}" cy="${ey - 0.6}" rx="1.6" ry="1.9" fill="${INK}"/>`).join('') + `<circle class="fg-puff" cx="${n1(m[0] - (side ? 2 : 0))}" cy="${m[1] - 0.6}" r="4.4" fill="#f0b49a" ${ink} ${pivot([m[0] - (side ? 2 : 0), m[1] - 0.6])}/><circle cx="${n1(m[0] - (side ? 2 : 0))}" cy="${m[1] - 0.6}" r="2.2" fill="#e06a5a" opacity="0.4"/><circle cx="${n1(m[0] + (side ? 2.4 : 0))}" cy="${m[1] + 0.4}" r="1.2" fill="${INK}"/>`,
  });
  function dotRim([ex, ey]) { return `<ellipse cx="${n1(ex)}" cy="${ey}" rx="1.5" ry="1.9" fill="${INK}"/><circle cx="${n1(ex)}" cy="${ey - 0.4}" r="3.3" fill="rgba(220,236,246,0.25)" stroke="${INK}" stroke-width="1.1"/>`; }
  Object.assign(PROPS, {
    // A sack of presents (in the far hand, over the shoulder: arms ['sack', ...]).
    sack: (c = '#8a5a2a') => `<path d="M-3 -1 Q-20 2 -22 22 Q-22 40 -5 42 Q14 42 15 24 Q14 4 3 -1Z" fill="${c}" ${ink}/><path d="M-16 14 Q-8 18 4 12" stroke="${shade(c, 0.3)}" stroke-width="1.4" fill="none"/><path d="M-4 -2 l3 4 l4 -4" stroke="${INK}" stroke-width="2" fill="none"/>`,
    // A parasol, up.
    parasol: (c = '#f4f0f4') => `${inked('M0 6 V-40', '#5a3a2a', 1.6)}<path d="M-22 -34 Q0 -58 22 -34 Q16.5 -37.5 11 -34 Q5.5 -37.5 0 -34 Q-5.5 -37.5 -11 -34 Q-16.5 -37.5 -22 -34Z" fill="${c}" ${ink}/><path d="M0 -50 Q-6 -42 -11 -34 M0 -50 Q6 -42 11 -34" stroke="${shade(c, 0.18)}" stroke-width="1" fill="none"/><circle cx="0" cy="-49" r="1.6" fill="${INK}"/>`,
    // A basket of grapes, hanging from the hand.
    basket: (c = '#b08040') => `${inked('M-11 9 Q0 -8 11 9', '#7a5228', 1.6)}${[[-8, 6], [-3, 4], [2, 5], [7, 6], [-5, 1], [0, 0], [4, 1]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="#5a2a6a" ${ink}/>`).join('')}<path d="M5 -2 q6 -6 10 0 q-5 3 -10 0Z" fill="#5f8a2a" ${ink}/><path d="M-14 8 H14 L11 22 H-11Z" fill="${c}" ${ink}/><path d="M-13 13 H13 M-12 17.5 H12" stroke="${shade(c, 0.3)}" stroke-width="1.2"/>`,
    // A pitchfork, up.
    pitchfork: (c = '#7a5a3a') => `${inked('M0 22 V-26', c, 2.6)}${inked('M-6 -38 V-26 H6 V-38 M0 -26 V-41', '#9aa0a8', 1.5)}`,
    // A pirate's hook for a hand (holding or holdingBack).
    hook: (c = '#d8dde3') => `${inked('M0 3 V9 Q0 17 -6 15 Q-10 13 -8 9', c, 2.2)}<rect x="-4.5" y="-1" width="9" height="5" rx="1.5" fill="#4a2a14" ${ink}/>`,
    // A jack-o'-lantern held up high, alight (sc-candle) and flaming (sc-flames).
    jack: (c = '#e8661a') => `<path d="M0 -21 q-1 -4 2 -5" stroke="#3c5a1e" stroke-width="2.4" fill="none"/><g class="sc-candle"><ellipse cx="0" cy="-11" rx="10" ry="9" fill="${c}" ${ink}/><path d="M-5 -14 l2 -3 l2 3Z M5 -14 l-2 -3 l-2 3Z M-5 -8 Q0 -4 5 -8 L3 -7 L0 -8.5 L-3 -7Z" fill="#ffd23f"/></g><path class="sc-flames" d="M-5 -22 Q0 -40 6 -22 Q2 -28 0 -21 Q-2 -28 -5 -22Z" fill="#ff8a1a" opacity="0.9"/>`,
  });
  Object.assign(ARM_POSES, { sack: [-160, -40], pipes: [36, 78], chanter: [22, 96], squeezeB: [36, 74], squeezeF: [24, 64], parasol: [30, 120], climbUp: [170, 0], climbDown: [150, 20] });
  Object.assign(TWO_HANDED, {
    // Bagpipes: the bag under the far arm (squeezed: class hl-puff), the drones over the shoulder,
    // the chanter from the mouth down to the hands. Use arms: ['pipes', 'chanter'].
    bagpipes: (L, c = '#2a5a3a') => {
      const m = L.mouth;
      const f = L.arms[1].h;
      const bag = [22, 50];
      const drones = [[6, 6], [13, 0], [21, 4]].map(([x, y], i) => `${inked(`M${bag[0] - 1 + i * 2} ${bag[1] - 4} L${x} ${y}`, '#2a1a0e', 2.6)}<rect x="${x - 2.8}" y="${y - 4.5}" width="5.6" height="5" rx="1" fill="#e8dcc0" ${ink}/>`).join('');
      return { tip: [m[0] + 3, f[1] + 6], svg: `${drones}${inked(`M${pt([m[0] + 1, m[1] + 1])} L${pt([f[0] + 2, f[1] + 8])}`, '#1a1008', 2.8)}${inked(`M${bag[0] + 2} ${bag[1] - 6} Q${m[0] - 6} ${m[1] + 8} ${pt([m[0] + 0.5, m[1] + 0.5])}`, '#1a1008', 1.6)}<g class="hl-puff"><ellipse cx="${bag[0]}" cy="${bag[1]}" rx="11" ry="9" fill="${c}" ${ink}/><path d="M${bag[0] - 9} ${bag[1] - 3} L${bag[0] + 8} ${bag[1] + 6} M${bag[0] - 8} ${bag[1] + 5} L${bag[0] + 9} ${bag[1] - 4}" stroke="#c0392b" stroke-width="1.6"/></g>` };
    },
    // An accordion between the two hands, its bellows squeezing (class sc-vy-bellows). Use arms:
    // ['squeezeB', 'squeezeF'].
    accordion: (L, c = '#c0392b') => {
      const [b, f] = [L.arms[0].h, L.arms[1].h];
      const x0 = Math.min(b[0], f[0]) - 2; const x1 = Math.max(b[0], f[0]) + 6; const y = (b[1] + f[1]) / 2;
      const w = x1 - x0;
      return { tip: [x0 + w / 2, y - 12], svg: `<rect x="${n1(x0 - 5)}" y="${n1(y - 11)}" width="7" height="22" rx="1.5" fill="${c}" ${ink}/><g class="sc-vy-bellows"><rect x="${n1(x0 + 2)}" y="${n1(y - 10)}" width="${n1(w - 4)}" height="20" fill="#1a1a1a" ${ink}/>${Array.from({ length: 4 }, (_, i) => `<path d="M${n1(x0 + 2 + ((i + 1) * (w - 4)) / 5)} ${n1(y - 10)} v20" stroke="#e8c15a" stroke-width="1"/>`).join('')}</g><rect x="${n1(x1 - 2)}" y="${n1(y - 12)}" width="9" height="24" rx="1.5" fill="${c}" ${ink}/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${n1(x1 + 1)}" y="${n1(y - 10 + i * 4.4)}" width="4" height="2.4" fill="#f2ead6"/>`).join('')}` };
    },
  });
  Object.assign(TOP_STYLES, {
    // A skeleton's ribs and spine over a bone-white top (skin and top the same bone colour).
    ribs: ({ cx }) => `<path d="M${cx - 1} 36 V74" stroke="${INK}" stroke-width="1.4"/>${[43, 49, 55, 61].map((y) => `<path d="M${cx - 10} ${y + 2} Q${cx - 1} ${y - 3} ${cx + 9} ${y + 2}" stroke="${INK}" stroke-width="1.3" fill="none"/>`).join('')}<path d="M${cx - 8} 70 Q${cx - 1} 66 ${cx + 7} 70" stroke="${INK}" stroke-width="1.3" fill="none"/>`,
    // Santa's coat: white fur down the front (accent) and at the hem.
    fur: ({ cx, band, accent }) => `${band(64, 69, accent)}<path d="M${cx + 2} 35 V64" stroke="${accent}" stroke-width="5"/>`,
    // The piper's plaid over the shoulder (accent) and a sporran below the belt.
    highland: ({ cx, accent }) => `<path d="M${cx - 9} 36 L${cx + 9} 70" stroke="${accent}" stroke-width="6" opacity="0.9"/><path d="M${cx - 9} 36 L${cx + 9} 70" stroke="#f4c430" stroke-width="0.8"/><path d="M${cx - 2} 74 h9 l-1 11 q-3.6 3 -7 0Z" fill="#e8dcc0" ${ink}/><circle cx="${cx + 2.5}" cy="78" r="1.4" fill="${INK}"/>`,
    // Icing buttons (a gingerbread man).
    buttons: ({ cx }) => [[48, '#d62828'], [57, '#2a8a4a'], [66, '#d62828']].map(([y, c]) => `<circle cx="${cx + 1}" cy="${y}" r="2.2" fill="${c}" ${ink}/>`).join(''),
  });
  // A reindeer's body: galloping legs, a tail, a long head.
  const hoofed = (c, o, T, { mane = shade(c, 0.35), extra = '' } = {}) => `<g class="sc-tail" ${pivot([26, 40])}>${inked('M26 40 Q10 40 6 62', mane, 5.4)}</g>${T.legs([34, 41, 80, 87], 54, 30, 6, shade(c, 0.1))}${T.p('M24 46 Q22 31 44 31 H76 Q86 31 90 38 Q94 54 82 58 H36 Q24 58 24 46Z')}${o.belly ? `<path d="M36 56 Q58 60 80 56" stroke="${o.belly}" stroke-width="4" fill="none"/>` : ''}${T.p('M78 36 L92 12 Q96 5 103 7 L116 21 Q119 27 112 29 L102 26 Q96 38 92 48Z')}${T.p('M80 34 Q85 18 95 7 L99 10 Q91 22 89 40Z', mane)}${T.p('M98 8 L98 0 L103 6Z')}${T.eye(103, 13, 9)}<circle cx="114" cy="24.5" r="1.1" fill="${INK}"/>${extra}`;
  // Fluff: circles in one colour, outlined only round the outside (wool, a poodle's pompoms).
  const fluff = (list, c) => `${list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${n1(r + LW)}" fill="${INK}"/>`).join('')}${list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('')}`;
  Object.assign(CRITTERS, {
    // A reindeer: antlers, a white ruff; nose: true for Rudolph's (blinking: class xm-nose).
    reindeer: { color: '#9a6432', draw: (c, o, T) => ({ vb: '0 -14 120 100', h: 0.833, body: hoofed(c, { belly: '#e8d0b0', ...o }, T, { mane: '#e8d0b0', extra: `${inked('M99 7 Q94 -4 86 -10 M95 -1 L88 -1 M90 -6 L86 -12 M101 7 Q106 -4 114 -11 M106 -1 L113 -2 M110 -6 L113 -13', '#5a3a1a', 2)}${o.nose ? `<circle class="xm-nose" cx="116.5" cy="24" r="4.4" fill="#ff3030" ${ink}/>` : ''}${o.collar ? `<path d="M85 40 L95 44" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="M85 40 L95 44" stroke="#c0392b" stroke-width="3.4" stroke-linecap="round"/><circle cx="90" cy="45" r="2.6" fill="#d4af37" ${ink}/>` : ''}` }) }) },
    // A sheep: a woolly body, a black face and legs.
    sheep: { color: '#f4f0e4', draw: (c, o, T) => ({ vb: '0 0 84 62', h: 0.738, body: `${T.legs([22, 28, 56, 62], 40, 20, 4.4, '#2a2624')}${fluff([[18, 30, 12], [30, 22, 13], [44, 20, 13], [58, 26, 12], [26, 38, 11], [42, 38, 12], [56, 38, 11]], c)}<ellipse cx="72" cy="27" rx="8.5" ry="10.5" fill="#2a2624" transform="rotate(24 72 27)" ${ink}/>${T.p('M65 19 l-9 -3 l6 8Z', '#2a2624')}<circle cx="74" cy="24" r="1.6" fill="#f4f0e4"/>` }) },
    // A Highland coo: shaggy and ginger, long horns, a fringe over its eyes.
    coo: { color: '#b8642a', draw: (c, o, T) => ({ vb: '0 0 160 104', h: 0.65, body: `<g class="sc-tail" ${pivot([20, 44])}>${inked('M20 44 Q4 50 6 74', shade(c, 0.1), 3.4)}<path d="M2 72 q4 10 10 0Z" fill="${shade(c, 0.25)}" ${ink}/></g>${T.legs([36, 46, 102, 112], 66, 30, 10, shade(c, 0.2))}${T.p('M18 50 Q22 24 66 24 Q110 22 126 40 Q132 62 118 74 L24 76 Q14 66 18 50Z')}${Array.from({ length: 14 }, (_, i) => `<path d="M${24 + i * 7} ${71 + (i % 2) * 2} l2 9 l3 -9" fill="${c}" stroke="${INK}" stroke-width="1.2"/>`).join('')}${Array.from({ length: 8 }, (_, i) => `<path d="M${30 + i * 11} 34 q4 8 0 16" stroke="${shade(c, -0.25)}" stroke-width="2" fill="none"/>`).join('')}${inked('M126 26 Q110 8 96 10 M146 24 Q160 6 172 8', '#efe2c4', 4.4)}${T.p('M118 30 Q118 18 140 20 Q156 24 154 46 Q152 62 140 64 Q124 62 120 48Z')}<ellipse cx="146" cy="57" rx="9" ry="7" fill="${shade(c, 0.4)}" ${ink}/><circle cx="142.5" cy="57" r="1.5" fill="${INK}"/><circle cx="149.5" cy="57" r="1.5" fill="${INK}"/>${T.p('M120 26 q8 16 4 24 q6 -6 6 -20 q4 14 2 22 q6 -8 5 -22 q4 14 2 20 q6 -6 4 -20 q4 10 2 18 q6 -6 2 -18 Q134 20 120 26Z', shade(c, -0.18))}` }) },
    // A border collie: black, its legs, chest, muzzle and tail tip white (white: their colour).
    collie: { color: '#141414', draw: (c, o, T) => { const w = o.white || '#f4f0e8'; return { vb: '0 0 100 60', h: 0.6, body: `<g class="sc-tail" ${pivot([22, 31])}>${inked('M22 30 Q12 26 10 16', c, 4.6)}<circle cx="10" cy="15.5" r="2.6" fill="${w}" ${ink}/></g>${T.legs([28, 33, 62, 67], 36, 20, 5, w)}${T.p('M20 36 Q20 22 44 22 Q66 22 72 30 Q74 42 62 44 H28 Q20 44 20 36Z')}${T.p('M60 26 Q70 23 74 31 Q73 41 62 44 Q57 35 60 26Z', w)}<circle cx="80" cy="17" r="10" fill="${c}" ${ink}/>${T.p('M84 15 H94 Q99 15 99 20 Q99 25 94 25 H84Z', w)}${T.p('M72 9 Q66 14 69 26 Q74 26 76 13Z', shade(c, -0.15))}<ellipse cx="97.5" cy="18" rx="2.2" ry="1.8" fill="${INK}"/><ellipse cx="84" cy="13.6" rx="1.6" ry="2" fill="${o.eye || '#e0b070'}"/>` }; } },
    // A wild boar: bristles along its back, a tusk.
    boar: { color: '#3a2a20', draw: (c, o, T) => ({ vb: '0 0 130 80', h: 0.615, body: `<g class="sc-tail" ${pivot([14, 30])}>${inked('M14 30 q-10 -4 -10 -14', c, 2.6)}</g>${T.legs([28, 40, 76, 88], 52, 22, 7, shade(c, 0.1))}${Array.from({ length: 9 }, (_, i) => `<path d="M${30 + i * 8} ${n1(15 - Math.sin(i / 2.5) * 2)} l3 -9 l3 9" fill="${shade(c, 0.2)}" ${ink}/>`).join('')}${T.p('M12 34 Q14 14 50 12 Q90 8 104 22 L122 34 Q126 42 118 46 L104 50 Q92 60 60 58 Q22 58 12 34Z')}${T.p('M96 20 l3 -11 l7 10Z')}<ellipse cx="122" cy="40" rx="6" ry="5" fill="${shade(c, -0.25)}" ${ink}/><circle cx="121" cy="39" r="0.9" fill="${INK}"/><circle cx="124" cy="40" r="0.9" fill="${INK}"/>${inked('M114 45 q6 -2 6 -10', '#f2ead6', 2)}<circle cx="107" cy="27" r="2" fill="#ffd27a" ${ink}/>` }) },
    // A poodle, clipped: pompoms on its head, chest, legs and tail (it trots: class ch-bob).
    poodle: { color: '#f8f6f4', draw: (c, o, T) => ({ vb: '0 0 80 60', h: 0.75, body: `<g class="ch-bob">${T.legs([24, 30, 52, 58], 34, 18, 3.4, shade(c, 0.08))}${fluff([[24, 54, 4.4], [30, 54, 4.4], [52, 54, 4.4], [58, 54, 4.4]], c)}${inked('M18 32 Q12 26 12 18', c, 3)}${fluff([[12, 15, 5], [38, 32, 10], [26, 34, 8], [52, 30, 11], [62, 18, 9], [62, 9, 6]], c)}${T.p('M64 20 Q66 14 72 18 L78 22 Q78 26 72 26 Q66 26 64 20Z')}<ellipse cx="78" cy="22.5" rx="1.8" ry="1.5" fill="${INK}"/>${T.p('M58 14 Q52 18 55 28 Q60 27 61 17Z', shade(c, 0.06))}${T.eye(67, 17, 8)}<path d="M66 24 l-4 6" stroke="#c0392b" stroke-width="2.4"/></g>` }) },
    // A peacock (its train, class ch-fan, opens into the full tail: see .ch-peacock).
    peacock: { color: '#1a4aa8', draw: (c, o, T) => ({ vb: '0 0 170 130', h: 0.765, body: `<g class="ch-fan">${Array.from({ length: 13 }, (_, i) => { const a = Math.PI * (1.05 + i * 0.07); const e = (r, d) => `${n1(104 + r * Math.cos(a + d))} ${n1(84 + r * Math.sin(a + d))}`; return `<path d="M104 84 L${e(76, -0.05)} L${e(76, 0.05)}Z" fill="#2a7a3a" ${ink}/><circle cx="${e(70, 0).split(' ')[0]}" cy="${e(70, 0).split(' ')[1]}" r="6.4" fill="#d4af37" ${ink}/><circle cx="${e(70, 0).split(' ')[0]}" cy="${e(70, 0).split(' ')[1]}" r="3.4" fill="#1a4aa8"/>`; }).join('')}</g>${T.p('M96 86 Q50 84 4 104 Q40 108 98 98Z', '#2a6a34')}${[20, 44, 68].map((x) => `<circle cx="${x}" cy="${n1(100 - (x - 20) * 0.12)}" r="3.6" fill="#d4af37" ${ink}/>`).join('')}${T.legs([108, 116], 102, 24, 2.6, '#8a7a5a')}${T.p('M92 92 Q92 78 112 78 Q132 80 130 94 Q126 106 110 106 Q92 104 92 92Z')}${inked('M118 84 Q122 56 128 34', c, 9)}<circle cx="130" cy="32" r="7.5" fill="${c}" ${ink}/>${T.p('M137 30 l8 2.4 l-8 3Z', '#c8a85a')}<path d="M133 34 q4 -1 5 -4" stroke="#f4f4f4" stroke-width="1.4" fill="none"/>${T.eye(132, 30, 7.5)}${inked('M128 25 l-2 -9 M131 25 l1 -10 M134 26 l4 -8', '#2a3a6a', 1)}${[[126, 15], [132, 14], [138, 17]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${c}" ${ink}/>`).join('')}` }) },
    // A parrot on its perch (Polly: critter('parrot', { pose: 'perch' })): a red body, blue wings;
    // its head (sc-pir-phead) and wing (sc-pir-pwing) can move. vb 60 x 100: 1em by 1.67em.
    'parrot:perch': { color: '#d82a2a', draw: (c, o, T) => ({ vb: '0 0 60 100', h: 1.667, body: `${T.p('M26 64 L18 98 L26 96 L30 72 L34 96 L42 98 L34 64Z', shade(c, 0.1))}<path d="M24 74 L21.4 94 M36 74 L38.6 94" stroke="#2f7fe0" stroke-width="2.6"/>${T.p('M16 50 Q14 28 30 26 Q46 28 44 50 Q44 70 30 72 Q16 70 16 50Z')}<g class="sc-pir-pwing">${T.p('M20 40 Q13 62 26 77 Q34 60 32 42Z', o.wing || '#2f7fe0')}<path d="M22 54 Q21 64 26 72" stroke="#ffd23f" stroke-width="3" fill="none"/></g><g class="sc-pir-phead">${T.p('M23 26 Q22 13 34 13 Q45 14 45 25 Q42 32 34 34 Q24 34 23 26Z')}${T.p('M38 18 Q46 18 44 29 Q40 26 38 28Z', '#f2efe6')}${T.p('M43 20 Q54 21 52 33 Q48 29 43 29Z', '#2a2a2a')}${T.eye(40, 22, 10)}</g>${inked('M21 72 h18', '#6b6050', 2)}` }) },
    // A bat, wings out (they flap: sc-wing, the right one 'sc-wing r').
    bat: { color: '#1a1024', draw: (c, o) => ({ vb: '0 0 60 24', h: 0.4, body: `<path class="sc-wing" d="M30 12 Q20 0 2 4 Q10 8 8 14 Q16 10 22 16 Q26 12 30 14Z" fill="${c}" ${ink}/><path class="sc-wing r" d="M30 12 Q40 0 58 4 Q50 8 52 14 Q44 10 38 16 Q34 12 30 14Z" fill="${c}" ${ink}/><path d="M26.5 9 L26 3 L29 7 H31 L34 3 L33.5 9Z" fill="${c}" ${ink}/><ellipse cx="30" cy="13" rx="4.4" ry="5.4" fill="${c}" ${ink}/><circle cx="28.4" cy="10" r="0.9" fill="${o.eye || '#ffd23f'}"/><circle cx="31.6" cy="10" r="0.9" fill="${o.eye || '#ffd23f'}"/>` }) },
    // A spider (its legs wiggle: sc-legs), red-eyed.
    spider: { color: '#141018', draw: (c, o) => ({ vb: '0 0 40 36', h: 0.9, body: `<g class="sc-legs">${inked('M14 14 Q4 6 2 14 M14 18 Q4 16 1 24 M16 21 Q8 26 6 34 M26 14 Q36 6 38 14 M26 18 Q36 16 39 24 M24 21 Q32 26 34 34', c, 1.6)}</g><ellipse cx="20" cy="21" rx="8" ry="9" fill="${c}" ${ink}/><circle cx="20" cy="10" r="5" fill="${c}" ${ink}/><circle cx="18" cy="9" r="1.2" fill="${o.eye || '#ff3b3b'}"/><circle cx="22" cy="9" r="1.2" fill="${o.eye || '#ff3b3b'}"/>` }) },
    // A ghost: a sheet with a wavy hem, dot eyes, an O of a mouth.
    ghost: { color: 'rgba(240,236,255,0.92)', draw: (c) => ({ vb: '0 0 60 70', h: 1.167, body: `<path d="M30 2C14 2 6 16 6 32v32l8-6 8 7 8-7 8 7 8-7 8 6V32C54 16 46 2 30 2Z" fill="${c}" ${ink}/><ellipse cx="23" cy="28" rx="3.4" ry="4.4" fill="${INK}"/><ellipse cx="37" cy="28" rx="3.4" ry="4.4" fill="${INK}"/><ellipse cx="30" cy="42" rx="4" ry="5" fill="${INK}"/><circle cx="18" cy="36" r="3" fill="#e06a8a" opacity="0.3"/><circle cx="42" cy="36" r="3" fill="#e06a8a" opacity="0.3"/>` }) },
    // A butterfly (its wings flit: class fg-flit), seen from above.
    butterfly: { color: '#f08a24', draw: (c, o) => ({ vb: '0 0 40 34', h: 0.85, body: `${[-1, 1].map((sx) => `<g class="fg-flit" ${pivot([20, 17])}><path d="M20 15 Q${20 + sx * 8} 0 ${20 + sx * 18} 3 Q${20 + sx * 20} 12 ${20 + sx * 4} 17 Q${20 + sx * 16} 22 ${20 + sx * 12} 31 Q${20 + sx * 4} 32 20 19Z" fill="${c}" ${ink}/><circle cx="${20 + sx * 12}" cy="8" r="2.4" fill="${o.spot || '#fff4d0'}"/></g>`).join('')}<ellipse cx="20" cy="18" rx="1.8" ry="8" fill="${INK}"/>${inked('M19 10 Q16 4 14 3 M21 10 Q24 4 26 3', INK, 0.4)}` }) },
    // A bee: stripes, wings buzzing (sc-buzz).
    bee: { color: '#f4c430', draw: (c, o, T) => ({ vb: '0 0 40 30', h: 0.75, body: `<ellipse class="sc-buzz" ${pivot([18, 12])} cx="14" cy="6" rx="7" ry="4.4" fill="rgba(220,236,255,0.75)" ${ink}/><ellipse class="sc-buzz" ${pivot([20, 12])} cx="22" cy="5" rx="7" ry="4.4" fill="rgba(220,236,255,0.75)" ${ink}/><path d="M4 18 L1 18" stroke="${INK}" stroke-width="1.6"/>${T.p('M4 18 Q6 9 18 9 Q30 9 32 17 Q30 26 18 26 Q6 26 4 18Z')}<path d="M12 10 V25.4 M19 9 V26 M26 10.4 V25" stroke="${INK}" stroke-width="3"/><circle cx="33" cy="16" r="4.4" fill="#2a2624" ${ink}/><circle cx="34.6" cy="15" r="1" fill="#fff"/>` }) },
    // Nessie: her neck and head and the humps of her back, out of the loch.
    nessie: { color: '#2a5a3a', draw: (c, o, T) => ({ vb: '0 0 120 40', h: 0.333, body: `${T.p('M84 35 Q86 6 100 4 Q113 4 111 15 L104 15 Q97 13 96 35Z')}${T.p('M50 35 Q62 15 74 35Z')}${T.p('M18 35 Q28 22 38 35Z')}${T.p('M2 35 Q8 27 12 35Z')}${T.eye(104, 9, 8)}<path d="M0 36 h120" stroke="#e8eef2" stroke-width="1.5" opacity="0.5"/>` }) },
    // A snowman: a carrot nose, coal eyes and buttons, a top hat and a scarf, twig arms (vb 60 x
    // 106: 1em wide, 1.77em tall).
    snowman: { color: '#f8fbff', draw: (c, o) => ({ vb: '0 -6 60 106', h: 1.767, body: `${inked('M14 56 L2 42 M6 47 L1 48', '#5a3a1a', 1.8)}${inked('M46 56 L58 40 M54 45 L60 46', '#5a3a1a', 1.8)}${fluff([[30, 74, 24], [30, 36, 15]], c)}<path d="M10 92 Q30 100 50 92" stroke="#c8d8e8" stroke-width="3" fill="none"/>${[62, 72, 82].map((y) => `<circle cx="30" cy="${y}" r="2.2" fill="${INK}"/>`).join('')}<ellipse cx="25" cy="32" rx="1.8" ry="2.2" fill="${INK}"/><ellipse cx="35" cy="32" rx="1.8" ry="2.2" fill="${INK}"/><path d="M30 37 L42 39.5 L30 41Z" fill="#f07a1a" ${ink}/>${[[23, 44], [27, 46], [33, 46], [37, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="${INK}"/>`).join('')}${inked('M17 50 Q30 56 43 50', o.scarf || '#c0392b', 4.4)}${inked('M38 52 L42 64', o.scarf || '#c0392b', 3.6)}${HATS.tophat([30, 30], '#1a1a1e', o.scarf || '#c0392b')}` }) },
  });

  // Hair, seen from the side (the face to the right) or the front: the shape over the head.
  function hairSvg(style, h, c, side, back) {
    const [x, y] = h;
    if (!style || style === 'bald') return '';
    if (back) return `<path d="M${x - 11} ${y + 3} C${x - 12.5} ${y - 9} ${x - 6} ${y - 13} ${x} ${y - 13} C${x + 6} ${y - 13} ${x + 12.5} ${y - 9} ${x + 11} ${y + 3} Q${x} ${y + 6} ${x - 11} ${y + 3}Z" fill="${c}" ${ink}/>${style === 'long' || style === 'ponytail' ? `<path d="M${x - 10} ${y} Q${x} ${y + 24} ${x + 10} ${y} Z" fill="${c}" ${ink}/>` : ''}`;
    const cap = side
      ? `M${x - 11} ${y + 2} C${x - 12.5} ${y - 9} ${x - 6} ${y - 13} ${x + 1} ${y - 12.5} C${x + 7} ${y - 12} ${x + 11} ${y - 8} ${x + 11} ${y - 4} C${x + 6} ${y - 7} ${x + 1} ${y - 7} ${x - 3} ${y - 6} C${x - 5} ${y - 2} ${x - 7} ${y + 3} ${x - 11} ${y + 2}Z`
      : `M${x - 11} ${y + 1} C${x - 12} ${y - 10} ${x - 6} ${y - 13} ${x} ${y - 13} C${x + 6} ${y - 13} ${x + 12} ${y - 10} ${x + 11} ${y + 1} C${x + 9} ${y - 6} ${x + 4} ${y - 7} ${x} ${y - 7} C${x - 4} ${y - 7} ${x - 9} ${y - 6} ${x - 11} ${y + 1}Z`;
    const p = (d) => `<path d="${d}" fill="${c}" ${ink}/>`;
    switch (style) {
      case 'long': return side ? p(`M${x - 10} ${y - 6} C${x - 14} ${y + 6} ${x - 13} ${y + 16} ${x - 8} ${y + 20} L${x - 2} ${y + 16} C${x - 5} ${y + 9} ${x - 4} ${y + 3} ${x - 3} ${y - 5}Z`) + p(cap) : p(`M${x - 11} ${y - 4} C${x - 14} ${y + 8} ${x - 13} ${y + 15} ${x - 9} ${y + 18} L${x - 7} ${y + 2}Z M${x + 11} ${y - 4} C${x + 14} ${y + 8} ${x + 13} ${y + 15} ${x + 9} ${y + 18} L${x + 7} ${y + 2}Z`) + p(cap);
      case 'bob': return side ? p(`M${x - 11} ${y - 3} C${x - 12} ${y + 8} ${x - 9} ${y + 12} ${x - 2} ${y + 11} C${x - 3} ${y + 5} ${x - 2} ${y} ${x} ${y - 7}Z`) + p(cap) : p(`M${x - 11} ${y - 3} C${x - 13} ${y + 8} ${x - 9} ${y + 12} ${x - 6} ${y + 11} L${x - 7} ${y - 3}Z M${x + 11} ${y - 3} C${x + 13} ${y + 8} ${x + 9} ${y + 12} ${x + 6} ${y + 11} L${x + 7} ${y - 3}Z`) + p(cap);
      case 'bun': return `<circle cx="${side ? x - 7 : x}" cy="${y - 12}" r="5" fill="${c}" ${ink}/>${p(cap)}`;
      case 'ponytail': return `${inked(`M${x - 10} ${y - 4} Q${x - 19} ${y} ${x - 16} ${y + 14}`, c, 5)}${p(cap)}`;
      case 'curly': return [[-9, -3], [-5, -10], [1, -12], [7, -9], [-11, 4], [10, -4]].map(([dx, dy]) => `<circle cx="${x + (side ? dx - 1 : dx)}" cy="${y + dy}" r="5" fill="${c}" ${ink}/>`).join('');
      case 'mohawk': return p(`M${x - 7} ${y - 9} Q${x - 1} ${y - 24} ${x + 6} ${y - 11} Q${x} ${y - 13} ${x - 7} ${y - 9}Z`);
      case 'quiff': return p(cap) + p(`M${x - 2} ${y - 11} C${x + 4} ${y - 20} ${x + 15} ${y - 16} ${x + 12} ${y - 6} C${x + 8} ${y - 10} ${x + 3} ${y - 10} ${x - 2} ${y - 8}Z`);
      case 'receding': return side ? p(`M${x - 11} ${y + 3} C${x - 12} ${y - 4} ${x - 10} ${y - 8} ${x - 6} ${y - 9} C${x - 6} ${y - 4} ${x - 6} ${y} ${x - 4} ${y + 4}Z`) : p(`M${x - 11} ${y + 2} C${x - 12} ${y - 4} ${x - 10} ${y - 7} ${x - 8} ${y - 8} L${x - 7} ${y + 1}Z M${x + 11} ${y + 2} C${x + 12} ${y - 4} ${x + 10} ${y - 7} ${x + 8} ${y - 8} L${x + 7} ${y + 1}Z`);
      default: return p(cap);
    }
  }
  function beardSvg(style, h, c, side) {
    const [x, y] = h;
    const mx = side ? x + 6 : x;
    const p = (d, op = 1) => `<path d="${d}" fill="${c}" ${op < 1 ? `opacity="${op}"` : ink}/>`;
    switch (style) {
      case 'moustache': return p(`M${mx - 4.5} ${y + 4.5} Q${mx} ${y + 1.5} ${mx + 4.5} ${y + 4.5} Q${mx + 2} ${y + 3.6} ${mx} ${y + 4.4} Q${mx - 2} ${y + 3.6} ${mx - 4.5} ${y + 4.5}Z`);
      case 'goatee': return p(`M${mx - 2.4} ${y + 7.5} Q${mx} ${y + 13} ${mx + 2.4} ${y + 7.5}Z`);
      case 'stubble': case 'beard': return p(side ? `M${x - 4} ${y + 3} C${x - 3} ${y + 12} ${x + 4} ${y + 15} ${x + 9} ${y + 9.5} C${x + 11} ${y + 7} ${x + 11.4} ${y + 3} ${x + 10.6} ${y + 1.5} C${x + 9} ${y + 3.8} ${x + 3} ${y + 7.6} ${x - 4} ${y + 3}Z` : `M${x - 10.6} ${y + 1} C${x - 9} ${y + 14} ${x + 9} ${y + 14} ${x + 10.6} ${y + 1} C${x + 7} ${y + 8} ${x - 7} ${y + 8} ${x - 10.6} ${y + 1}Z`, style === 'stubble' ? 0.35 : 1);
      default: return '';
    }
  }
  function faceSvg(face, h, side, skin, blush) {
    const [x, y] = h;
    const eyes = side ? [[x + 3.2, y - 0.5], [x + 8.2, y - 0.5]] : [[x - 4, y - 0.5], [x + 4, y - 0.5]];
    const m = side ? [x + 6.4, y + 5.4] : [x, y + 5.4];
    const dot = ([ex, ey]) => `<ellipse cx="${n1(ex)}" cy="${ey}" rx="1.7" ry="2.2" fill="${INK}"/>`;
    const line = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`;
    const smile = line(`M${n1(m[0] - 2.6)} ${m[1]} q2.6 2.4 5.2 0`);
    const cheeks = blush ? eyes.map(([ex, ey]) => `<circle cx="${n1(ex + (side ? 1.4 : 0))}" cy="${ey + 4.4}" r="2.1" fill="#e06a5a" opacity="0.35"/>`).join('') : '';
    if (FACES[face]) return FACES[face]({ x, y, side, eyes, m, dot, line, smile, cheeks });
    switch (face) {
      case 'none': return '';
      case 'grin': return eyes.map(dot).join('') + `<path d="M${n1(m[0] - 3.2)} ${m[1] - 0.6} Q${m[0]} ${m[1] + 5} ${n1(m[0] + 3.2)} ${m[1] - 0.6}Z" fill="${INK}"/>` + cheeks;
      case 'shout': return eyes.map(dot).join('') + `<ellipse cx="${m[0]}" cy="${m[1] + 0.6}" rx="2.2" ry="2.8" fill="${INK}"/>` + cheeks;
      case 'flat': return eyes.map(dot).join('') + line(`M${n1(m[0] - 2.4)} ${m[1] + 0.6} h4.8`) + cheeks;
      case 'sleep': return eyes.map(([ex, ey]) => line(`M${n1(ex - 1.9)} ${ey} q1.9 1.7 3.8 0`)).join('') + line(`M${n1(m[0] - 1.6)} ${m[1] + 0.8} h3.2`) + cheeks;
      case 'sleepy': return eyes.map(([ex, ey]) => `${dot([ex, ey])}<path d="M${n1(ex - 2.2)} ${ey + 0.2} Q${n1(ex)} ${ey - 3.4} ${n1(ex + 2.2)} ${ey + 0.2}Z" fill="${skin}"/>${line(`M${n1(ex - 2)} ${ey + 0.1} h4`)}`).join('') + line(`M${n1(m[0] - 2.4)} ${m[1] + 1} q2.4 -1.4 4.8 0.4`) + cheeks;
      case 'warpaint': return eyes.map(([ex, ey]) => `<ellipse cx="${n1(ex - (side ? 0.4 : 0))}" cy="${ey - 0.4}" rx="3.1" ry="2.8" fill="${INK}"/>`).join('') + `<ellipse cx="${n1(m[0] - (side ? 0.6 : 0))}" cy="${m[1] + 0.4}" rx="3.8" ry="2.5" fill="#cfd6dc" ${ink}/><path d="M${n1(m[0] - 2.8)} ${m[1]} h5.2" stroke="#fff" stroke-width="1.1"/>`;
      case 'shades': return `<path d="M${n1(eyes[0][0] - 3)} ${y - 2.6} H${n1(eyes[1][0] + 3)} V${y + 0.6} Q${n1(eyes[1][0])} ${y + 2.6} ${n1((eyes[0][0] + eyes[1][0]) / 2 + 0.4)} ${y + 0.4} Q${n1(eyes[0][0])} ${y + 2.6} ${n1(eyes[0][0] - 3)} ${y + 0.6}Z" fill="${INK}"/><path d="M${n1(eyes[1][0] - 1)} ${y - 1.6} h2" stroke="#fff" stroke-width="0.9" opacity="0.7"/>` + smile;
      default: return eyes.map(dot).join('') + smile + cheeks;
    }
  }

  // The figure's parts, in its 60 x 120 box.
  function figureBody(o = {}) {
    const L = layout(o);
    const { side, cx } = L;
    const back = o.facing === 'back';
    const skin = SKIN[o.skin] || o.skin || SKIN.light;
    const bare = o.topStyle === 'bare' || o.topStyle === 'scars';
    const top = bare ? skin : o.top || '#3a5a8a';
    const accent = o.accent || '#1a1a1e';
    const bottom = o.bottom || '#2a2a3a';
    const shoes = o.shoes || '#1a1410';
    const hairC = HAIR[o.hairColor] || o.hairColor || HAIR.brown;
    const sleeves = o.sleeves || (bare ? 'none' : o.topStyle === 'vest' && !o.top ? 'none' : 'long');
    const armColor = o.topStyle === 'suit' ? accent : top;
    const stout = o.build === 'stout';
    const hk = o.hooks || {};
    const head = L.head;
    L.mouth = side ? [head[0] + 6.4, head[1] + 5.6] : [head[0], head[1] + 5.6];
    const two = TWO_HANDED[o.holding] ? TWO_HANDED[o.holding](L, o.propColor) : null;

    const leg = (i) => {
      const g = L.legs[i];
      const dark = side && i === 0 ? 0.2 : 0;
      const legC = shade(bottom, dark);
      const sk = shade(skin, dark);
      const path = `M${pt(g.s)} L${pt(g.k)} L${pt(g.h)}`;
      const d = [Math.sin(g.ang * DEG), Math.cos(g.ang * DEG)];
      const fwd = side ? [d[1], -d[0]] : [1, 0];
      const toe = side ? 5.6 : 2.6;
      const heel = side ? -2 : -2.6;
      const shoe = `M${pt([g.h[0] + fwd[0] * heel + d[0] * 1.4, g.h[1] + fwd[1] * heel + d[1] * 1.4])} L${pt([g.h[0] + fwd[0] * toe + d[0] * 1.4, g.h[1] + fwd[1] * toe + d[1] * 1.4])}`;
      let body;
      if (o.bottomStyle === 'gown') body = '';
      else if (o.bottomStyle === 'skirt' || o.bottomStyle === 'grass') body = inked(path, sk, 6);
      else if (o.bottomStyle === 'shorts') body = inked(path, sk, 7) + inked(`M${pt(g.s)} L${pt([g.s[0] + (g.k[0] - g.s[0]) * 0.75, g.s[1] + (g.k[1] - g.s[1]) * 0.75])}`, legC, 9.4);
      else if (o.peg === (i ? 'front' : 'back')) body = inked(`M${pt(g.s)} L${pt(g.k)}`, legC, 9) + inked(`M${pt(g.k)} L${pt(g.h)}`, '#8a5a2e', 4.4);
      else body = inked(path, legC, 9);
      return `<g class="fg-leg${i ? 'F' : 'B'}${hk[i ? 'legF' : 'legB'] ? ` ${hk[i ? 'legF' : 'legB']}` : ''}" ${pivot(g.s)}>${body}${o.peg === (i ? 'front' : 'back') ? '' : inked(shoe, shade(shoes, dark), 5)}${o.skates ? skateSvg(g, fwd, d, shade(o.skateColor || '#f4f4f0', dark), o.skates === true ? '#e63946' : o.skates) : ''}</g>`;
    };
    const arm = (i) => {
      const g = L.arms[i];
      const dark = side && i === 0 ? 0.2 : 0;
      const sk = shade(skin, dark);
      const sl = shade(armColor, dark);
      const path = `M${pt(g.s)} L${pt(g.k)} L${pt(g.h)}`;
      let limb;
      if (sleeves === 'none') limb = inked(path, sk, 6.6);
      else if (sleeves === 'short') limb = inked(path, sk, 6.6) + `<path d="M${pt(g.s)} L${pt([g.s[0] + (g.k[0] - g.s[0]) * 0.7, g.s[1] + (g.k[1] - g.s[1]) * 0.7])}" stroke="${sl}" stroke-width="7.8" stroke-linecap="round"/>`;
      else limb = inked(path, sl, 7);
      const what = i ? o.holding : o.holdingBack;
      const single = what && PROPS[what] ? `<g transform="translate(${pt([g.h[0] + 1, g.h[1] + 2])}) rotate(${(i ? PROP_TILT[o.pose] : 0) || 0})">${hk[i ? 'propF' : 'propB'] ? `<g class="${hk[i ? 'propF' : 'propB']}" style="transform-box:view-box;transform-origin:0px 0px">` : ''}${what === 'tray' ? PROPS.tray(o.propColor, o.tray) : PROPS[what](o.propColor)}${hk[i ? 'propF' : 'propB'] ? '</g>' : ''}</g>` : '';
      const stick = two?.[i ? 'front' : 'back'] || '';
      return `<g class="fg-arm${i ? 'F' : 'B'}${hk[i ? 'armF' : 'armB'] ? ` ${hk[i ? 'armF' : 'armB']}` : ''}" ${pivot(g.s)}>${limb}${stick}${single}<circle cx="${n1(g.h[0])}" cy="${n1(g.h[1])}" r="3.5" fill="${sk}" ${ink}/></g>`;
    };

    // The body: shoulders to hips, trousers at the bottom, the shirt's details, the outline last.
    const hx = (y) => halfAt(L, stout, y);
    const torsoD = stout
      ? `M${n1(30 - L.sw)} 41 Q${n1(30 - L.sw)} 34 30 34 Q${n1(30 + L.sw)} 34 ${n1(30 + L.sw)} 41 Q${n1(30 + L.sw + 5)} 60 ${n1(30 + L.hw)} 76 H${n1(30 - L.hw)} Q${n1(30 - L.sw - (side ? 0 : 5))} 60 ${n1(30 - L.sw)} 41Z`
      : `M${n1(30 - L.sw)} 41 Q${n1(30 - L.sw)} 34 30 34 Q${n1(30 + L.sw)} 34 ${n1(30 + L.sw)} 41 L${n1(30 + L.hw)} 76 H${n1(30 - L.hw)}Z`;
    const band = (y0, y1, c) => `<path d="M${n1(30 - hx(y0))} ${y0} H${n1(30 + hx(y0))} L${n1(30 + hx(y1))} ${y1} H${n1(30 - hx(y1))}Z" fill="${c}"/>`;
    let details = '';
    const st = o.topStyle;
    if (st === 'vest' || st === 'suit') details += `<path d="${torsoD}" fill="${accent}"/><path d="M${cx - 5} 34.5 L${cx} ${st === 'suit' ? 52 : 58} L${cx + 5} 34.5Z" fill="${o.top || '#f4f0e8'}"/>${st === 'vest' ? [44, 51, 58, 65].map((y) => `<circle cx="${cx + 1.4}" cy="${y}" r="0.9" fill="${shade(accent, -0.5)}"/>`).join('') : `<path d="M${cx - 5} 34.5 L${cx - 1} 46 M${cx + 5} 34.5 L${cx + 1} 46" stroke="${shade(accent, 0.35)}" stroke-width="1.2"/>`}`;
    if (st === 'stripes') details += [44, 51, 58, 65].map((y) => band(y, y + 3, accent)).join('');
    if (st === 'plaid') details += [42, 50, 58, 66].map((y) => band(y, y + 2.4, accent)).join('') + [cx - 6, cx, cx + 6].map((x) => `<path d="M${x} 35 V76" stroke="${accent}" stroke-width="2" opacity="0.55"/>`).join('');
    if (bare) details += `<path d="M${cx - 6} 49 q6 3 12 0 M${cx - 4} 60 q4 2 8 0" stroke="${INK}" stroke-width="1" fill="none" opacity="0.22"/>`;
    if (TOP_STYLES[st]) details += TOP_STYLES[st]({ L, o, cx, band, torsoD, top, accent, skin });
    if (st === 'scars') details += `<path d="M${cx - 7} 44 l6 4 M${cx + 1} 47 l7 -3 M${cx - 5} 64 l10 1" stroke="#a89888" stroke-width="1.4" stroke-linecap="round"/>`;
    const belt = o.belt ? band(70, 74, o.belt) : '';
    const apron = st === 'apron' ? `<path d="M${cx - 6.5} 45 H${cx + 6.5} L${cx + 9} 100 Q${cx} 103 ${cx - 9} 100Z" fill="${accent}" ${ink}/><path d="M${cx - 6} 45 L${cx - 4} 35.5 M${cx + 6} 45 L${cx + 4} 35.5" stroke="${accent}" stroke-width="1.6"/>` : '';
    const neckC = o.accent2 || accent;
    const neck = o.neck === 'tie' ? `<path d="M${cx} 35.5 l-2.2 2.6 l2.2 15 l2.2 -15Z" fill="${neckC}" ${ink}/>`
      : o.neck === 'bow' ? `<path d="M${cx} 36.5 l-4.4 -2.4 v4.8Z M${cx} 36.5 l4.4 -2.4 v4.8Z" fill="${neckC}" ${ink}/>`
        : o.neck === 'scarf' ? `${inked(`M${cx - 6} 35.5 Q${cx} 38.5 ${cx + 6} 35.5`, neckC, 3.4)}${inked(`M${cx - 4} 37 L${cx - 7} 47`, neckC, 3)}` : NECKS[o.neck]?.(cx, neckC) || '';
    const gown = o.bottomStyle === 'gown' || o.bottomStyle === 'skirt' || o.bottomStyle === 'grass';
    const skirt = o.bottomStyle === 'grass' ? grassSkirt(L, o.bottom) : gown ? `<path d="M${n1(30 - L.hw)} 70 H${n1(30 + L.hw)} L${n1(30 + L.hw + (o.bottomStyle === 'gown' ? 10 : 6))} ${o.bottomStyle === 'gown' ? 115 : 96} Q30 ${o.bottomStyle === 'gown' ? 119 : 99} ${n1(30 - L.hw - (o.bottomStyle === 'gown' ? 10 : 6))} ${o.bottomStyle === 'gown' ? 115 : 96}Z" fill="${bottom}" ${ink}/>` : '';
    const torso = `<g class="fg-body${hk.body ? ` ${hk.body}` : ''}"><path d="${torsoD}" fill="${top}"/>${gown ? '' : band(66, 76, bottom)}${details}${belt}<path d="M${n1(30 - L.sw + 2)} 39 L${n1(30 - L.hw + 2)} 75" stroke="${INK}" stroke-width="3.4" opacity="0.16" stroke-linecap="round"/><path d="${torsoD}" fill="none" ${ink}/>${neck}</g>`;
    const headSvg = `<g class="fg-head${hk.head ? ` ${hk.head}` : ''}" ${pivot([head[0], head[1] + 10])}><circle cx="${head[0]}" cy="${head[1]}" r="${HEAD_R}" fill="${skin}" ${ink}/>${back ? '' : faceSvg(o.face || L.P.face || 'smile', head, side, skin, o.blush)}${back ? '' : beardSvg(o.beard, head, HAIR[o.beardColor] || o.beardColor || hairC, side)}${back ? '' : faceExtras(o, head, side)}${hairSvg(o.hair || 'short', head, hairC, side, back)}${o.hat ? (HATS[o.hat] || (() => ''))(head, o.hatColor || HAT_COLOR[o.hat], o.hatAccent, side, back) : ''}</g>`;
    const neckSkin = `<rect x="${head[0] - 3}" y="29" width="6" height="8" fill="${skin}" ${ink}/>`;
    // Back to front: the far arm, the neck, the body, the head, a two-handed prop, the near arm.
    const upper = `${arm(0)}${neckSkin}${torso}${apron}${o.head === false ? '' : headSvg}${two?.svg || ''}${arm(1)}`;
    // (A skirt goes over both legs; trousers' legs go under the body.)
    const svg = `${o.crop === 'waist' ? '' : gown ? `${leg(0)}${leg(1)}${hk.skirt ? `<g class="${hk.skirt}" ${pivot([30, 70])}>${skirt}</g>` : skirt}` : `${leg(0)}${leg(1)}`}${L.lean ? `<g transform="rotate(${L.lean} 30 74)">${upper}</g>` : upper}`;
    return { svg, L, two };
  }

  function figure(o = {}) {
    const { svg } = figureBody(o);
    const inner = o.flip ? `<g transform="translate(60 0) scale(-1 1)">${svg}</g>` : svg;
    return `<svg class="fg fg-${o.pose || 'stand'}${o.cls ? ` ${o.cls}` : ''}" viewBox="0 0 60 120" width="0.5em" height="1em" overflow="visible">${inner}</svg>`;
  }
  const figureAt = (x, y, h, o = {}) => {
    const s = h / 120;
    const { svg } = figureBody(o);
    const inner = o.flip ? `<g transform="translate(60 0) scale(-1 1)">${svg}</g>` : svg;
    // (A <g>, not a nested <svg>: the scenery's `.sc-face-l svg` and the like would turn that too.)
    return `<g class="fg fg-${o.pose || 'stand'}${o.cls ? ` ${o.cls}` : ''}" transform="translate(${n1(x - 30 * s)} ${n1(y - 118 * s)}) scale(${+s.toFixed(4)})">${inner}</g>`;
  };
  figure.points = (o = {}) => {
    const { L, two } = figureBody(o);
    const up = (p) => (p && L.lean ? turn(p, [30, 74], L.lean) : p);
    const single = o.holding === 'torch' ? [L.arms[1].h[0] + 1, L.arms[1].h[1] - 20] : PROP_TIPS[o.holding] ? [L.arms[1].h[0] + 1 + PROP_TIPS[o.holding][0], L.arms[1].h[1] + 2 + PROP_TIPS[o.holding][1]] : null;
    return { handF: up(L.arms[1].h), handB: up(L.arms[0].h), mouth: up(L.mouth), head: up(L.head), tip: up(two?.tip || single || L.arms[1].h) };
  };

  // Animals, the same way: flat colour, the ink outline, dot eyes. Facing right, 1em wide.
  function critter(kind, o = {}) {
    const k = { cat: '#3a3430', dog: '#8a5a2e', mouse: '#7a7068', rat: '#5e554c', roach: '#5a2e14', fly: '#1e1a1a', bird: '#4a4a52', eagle: '#5a3a1e', raven: '#16141a', gull: '#f4f4f0' };
    const reg = CRITTERS[`${kind}:${o.pose}`] || CRITTERS[kind];
    const c = o.color || k[kind] || reg?.color || '#6a5a4a';
    const s = o.size || 1;
    const eye = (x, y, r) => `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(r * 0.16)}" ry="${n1(r * 0.2)}" fill="${o.eye || INK}"/>`;
    const p = (d, fill = c) => `<path d="${d}" fill="${fill}" ${ink}/>`;
    const legs = (xs, top, len, w, cl) => [0, 1].map((j) => `<g class="${j ? 'sc-legs-f' : 'sc-legs-b'}">${xs.filter((_, i) => i % 2 === j).map((x) => inked(`M${x} ${top} V${top + len}`, j ? cl : shade(cl, 0.2), w)).join('')}</g>`).join('');
    let body = '';
    let vb = '0 0 100 60';
    let h = 0.6;
    if (reg) ({ body, vb, h } = { vb, h, ...reg.draw(c, o, { p, eye, legs }) });
    else if (kind === 'cat' || kind === 'dog') {
      const dog = kind === 'dog';
      const tail = dog ? inked('M22 30 Q12 26 10 16', c, 4.6) : inked('M22 32 Q8 30 8 18 Q8 10 13 9', c, 4.4);
      body = `<g class="sc-tail" ${pivot([22, 31])}>${tail}</g>${legs([28, 33, 62, 67], 36, 20, 5, c)}${p(`M20 36 Q20 22 44 22 Q66 22 72 30 Q74 42 62 44 H28 Q20 44 20 36Z`)}${o.belly ? `<path d="M30 42 Q46 46 62 42" stroke="${o.belly}" stroke-width="3" fill="none"/>` : ''}
        ${dog ? `<circle cx="80" cy="17" r="10" fill="${c}" ${ink}/>${p('M84 15 H94 Q99 15 99 20 Q99 25 94 25 H84Z')}${p('M72 9 Q66 14 69 26 Q74 26 76 13Z', shade(c, 0.28))}<ellipse cx="97.5" cy="18" rx="2.2" ry="1.8" fill="${INK}"/>${eye(84, 14, 10)}`
    : `<circle cx="79" cy="21" r="10.5" fill="${c}" ${ink}/>${p('M71 15 L72 4 L79 11Z')}${p('M82 11 L88 4 L88.6 15Z')}` + eye(81, 20, 10.5) + eye(86.5, 20, 10.5) + `<path d="M88 25 l1.6 1.2 l1.6 -1.2" stroke="${INK}" stroke-width="1.1" fill="none"/>`}`;
    } else if (kind === 'mouse' || kind === 'rat') {
      body = `${inked('M18 46 Q4 46 2 34', shade(c, -0.25), 1.8)}${legs([30, 36, 56, 62], 50, 7, 3, shade(c, 0.1))}${p('M16 50 Q14 30 42 28 Q58 28 72 40 L86 46 Q88 51 82 52 H20 Q16 52 16 50Z')}<circle cx="58" cy="30" r="6.4" fill="${shade(c, -0.15)}" ${ink}/><circle cx="58" cy="30" r="3" fill="#e4a6a0"/><circle cx="86" cy="47" r="1.8" fill="#e4a6a0" ${ink}/>${eye(73, 41, 12)}`;
    } else if (kind === 'roach') {
      body = `${[0, 1, 2].map((i) => inked(`M${40 + i * 12} 44 l-6 ${10 - i} M${46 + i * 12} 44 l6 ${10 - i}`, shade(c, 0.3), 1.6)).join('')}${inked('M84 34 Q96 20 100 22 M82 36 Q98 32 100 36', shade(c, 0.3), 1.2)}${p('M20 44 Q22 30 48 30 Q72 30 78 40 Q78 48 66 48 H28 Q20 48 20 44Z')}<path d="M48 31 V47" stroke="${INK}" stroke-width="1.2" opacity="0.6"/><circle cx="80" cy="40" r="6" fill="${shade(c, 0.2)}" ${ink}/>${eye(83, 38, 8)}`;
      vb = '0 0 100 60';
    } else if (kind === 'fly') {
      body = `<ellipse class="sc-buzz" ${pivot([46, 26])} cx="40" cy="18" rx="14" ry="8" fill="rgba(220,230,255,0.6)" ${ink}/><ellipse class="sc-buzz" ${pivot([54, 26])} cx="60" cy="18" rx="14" ry="8" fill="rgba(220,230,255,0.6)" ${ink}/>${p('M34 34 Q36 24 52 24 Q66 24 68 32 Q66 42 52 42 Q36 42 34 34Z')}<circle cx="70" cy="32" r="7" fill="${c}" ${ink}/><ellipse cx="73" cy="30" rx="2.6" ry="3.2" fill="#a0201a"/>`;
    } else {
      // A bird in flight: body, head and beak, the far wing behind and the near one in front.
      const [beak, head2] = kind === 'eagle' ? ['#f0b020', '#f4f0e8'] : kind === 'gull' ? ['#f0b020', c] : ['#3a3a3a', c];
      // A broad wing raised over the back, its long feathers fingered at the tip.
      const wingD = (dx) => `M${62 + dx} 26 Q${58 + dx} 8 ${44 + dx} -2 L${40 + dx} 2 L${36 + dx} -2 L${33 + dx} 3 L${28 + dx} 0 L${27 + dx} 6 Q${34 + dx} 18 ${40 + dx} 28Z`;
      const wing = (back) => `<g class="sc-wing" ${pivot([52, 27])}>${p(wingD(back ? -8 : 0), back ? shade(c, 0.25) : c)}</g>`;
      body = `${wing(true)}${p('M22 30 L4 22 L6 30 L3 36 L22 34Z', shade(c, 0.12))}${p('M18 31 Q30 21 54 22 Q70 22 78 27 Q72 37 56 37 Q34 39 18 31Z')}<circle cx="79" cy="24" r="7.5" fill="${head2}" ${ink}/>${p('M85 21.5 L96 25 Q92 28 85 28Z', beak)}${eye(81.5, 22.6, 7.5)}${wing(false)}`;
      vb = '0 -4 100 44';
      h = 0.44;
    }
    // (Scaled about the middle of its feet, or of its body if it's flying.)
    const fy = h < 0.5 ? 20 : 60;
    if (o.raw) return { vb, h, body: `<g transform="translate(50 ${fy}) scale(${s}) translate(-50 ${-fy})">${body}</g>` };
    return `<svg class="fg-crit fg-${kind}${o.still ? ' fg-still' : ''}" viewBox="${vb}" width="1em" height="${h}em" overflow="visible"><g transform="translate(50 ${fy}) scale(${s}) translate(-50 ${-fy})">${body}</g></svg>`;
  }

  // Halloween's (the kit's): bats, a ghost, a witch on her broomstick (a silhouette against the
  // moon, the kit's proportions), a spider.
  const BAT = critter('bat');
  const GHOST = critter('ghost');
  const WITCH_LOOK = { skin: '#07040c', hair: 'long', hairColor: '#07040c', hat: 'witch', hatColor: '#07040c', hatAccent: '#3a1a4a', face: 'none', top: '#07040c', bottom: '#07040c', shoes: '#07040c', pose: 'ride' };
  const WITCH = `<svg viewBox="0 0 120 70" width="1em" height="0.58em" overflow="visible">
    ${inked('M30 52 L118 44', '#2a1a10', 2.6)}<path d="M30 52 L6 42 L2 50 L4 58 L8 64 L30 56Z" fill="#3a2814" ${ink}/><path d="M8 47 L28 53 M6 56 L28 55" stroke="${INK}" stroke-width="1"/>
    <path d="M60 18 Q40 20 24 34 Q44 32 58 30Z" fill="#1a0a24" ${ink}/>${figureAt(62, 83, 78, WITCH_LOOK)}</svg>`;
  const SPIDER = critter('spider');
  const EYES = `<svg viewBox="0 0 40 12" width="1em" height="0.3em"><g fill="#ffd23f"><ellipse class="sc-blink" cx="10" cy="6" rx="6" ry="4"/><ellipse class="sc-blink" cx="30" cy="6" rx="6" ry="4"/></g>
    <g fill="#120a00"><ellipse cx="10" cy="6" rx="1.4" ry="3.4"/><ellipse cx="30" cy="6" rx="1.4" ry="3.4"/></g></svg>`;
  const PUMPKIN = `<svg viewBox="0 0 80 70" width="1em" height="0.875em">
    <path d="M38 14 Q36 4 44 2 L46 6 Q42 8 42 14Z" fill="#3c5a1e"/>
    <g fill="#e8661a"><ellipse cx="40" cy="42" rx="22" ry="26"/><ellipse cx="22" cy="42" rx="18" ry="24"/><ellipse cx="58" cy="42" rx="18" ry="24"/></g>
    <g fill="#ffd23f" class="sc-candle"><path d="M22 34 L30 26 L34 38Z"/><path d="M58 34 L50 26 L46 38Z"/><path d="M40 40 L36 48 L44 48Z"/>
    <path d="M18 52 Q40 70 62 52 L56 54 L52 50 L46 56 L40 52 L34 56 L28 50 L24 54Z"/></g></svg>`;
  // The headless horseman: a black horse at full gallop, a rider with no head, holding a flaming
  // jack-o'-lantern up high.
  // (The kit's horse, in black with burning eyes, and a kit rider with no head: head: false.)
  const HORSEMAN = `<svg viewBox="0 0 160 110" width="1em" height="0.69em" overflow="visible">
    ${critter.at('horse', 80, 108, 132, { color: '#0a0610', eye: '#ff7a1a' })}
    <path d="M76 12 Q50 14 30 44 Q50 36 72 38Z" fill="#2a0a14" ${ink}/>${figureAt(78, 70, 90, { head: false, skin: '#05030a', top: '#05030a', bottom: '#05030a', shoes: '#05030a', neck: 'scarf', accent: '#3a1010', pose: 'ride', arms: ['ride', 'up'], holding: 'jack' })}</svg>`;
  const SHIP = `<svg viewBox="0 0 80 40" width="1em" height="0.5em"><g fill="#0b0f16">
    <path d="M4 26 L76 26 L68 36 L12 36Z"/><rect x="34" y="4" width="2" height="22"/><path d="M36 6 L58 24 L36 24Z" opacity="0.85"/><path d="M34 8 L16 24 L34 24Z" opacity="0.7"/></g>
    <circle cx="20" cy="30" r="1.6" fill="#ffd27a"/><circle cx="40" cy="30" r="1.6" fill="#ffd27a"/><circle cx="58" cy="30" r="1.6" fill="#ffd27a"/><circle cx="35" cy="3" r="1.6" fill="#ff5a4a"/></svg>`;
  const GHOST_SHIP = `<svg viewBox="0 0 100 70" width="1em" height="0.7em"><g fill="rgba(150,255,210,0.55)" stroke="rgba(190,255,225,0.8)" stroke-width="0.8">
    <path d="M6 50 L94 50 L84 64 L16 64Z"/><path d="M10 50 L6 42 L20 46Z"/><rect x="30" y="8" width="2" height="42"/><rect x="58" y="4" width="2" height="46"/>
    <path d="M32 10 L52 14 L48 22 L54 30 L46 36 L52 46 L32 46Z"/><path d="M60 6 L82 12 L76 20 L84 30 L74 36 L80 46 L60 46Z"/>
    <path d="M30 8 L22 4 L26 10Z"/></g><circle cx="28" cy="57" r="1.4" fill="#d4fff0"/><circle cx="50" cy="57" r="1.4" fill="#d4fff0"/><circle cx="70" cy="57" r="1.4" fill="#d4fff0"/></svg>`;
  // The mermaid: the kit's, from the waist up (she waves: pose 'wave'), a band of scales at her
  // waist; her tail, flicked up as she dives, the same way.
  const MERMAID = `<svg viewBox="-5 0 70 80" width="0.875em" height="1em" overflow="visible">${figureAt(30, 118, 120, { skin: 'pale', hair: 'long', hairColor: 'red', top: '#3fb5a8', sleeves: 'none', facing: 'front', crop: 'waist', pose: 'wave', blush: true })}
    <path d="M${30 - 10.5} 70 H${30 + 10.5} L${30 + 12} 82 H${30 - 12}Z" fill="#3fb5a8" stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round"/><path d="M22 75 q4 -3 8 0 q4 -3 8 0" stroke="#2a8a80" stroke-width="1.4" fill="none"/></svg>`;
  const TAIL = `<svg viewBox="0 0 60 50" width="1em" height="0.83em" overflow="visible"><path d="M26 50 Q22 30 30 22 Q16 16 6 2 Q24 6 30 14 Q36 6 54 2 Q44 16 30 22 Q38 30 34 50Z" fill="#3fb5a8" stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round"/><path d="M26 38 q4 -3 8 0 M26 30 q4 -3 8 0" stroke="#2a8a80" stroke-width="1.4" fill="none"/></svg>`;
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
  // (In the kit's flat colour and ink: the kraken's arm, its suckers; the whale's tail.)
  const TENTACLE = `<svg viewBox="0 0 60 160" width="0.375em" height="1em" overflow="visible"><path d="M30 160 Q8 120 26 86 Q44 52 22 24 Q14 10 26 4 Q38 0 36 14 Q34 24 40 34 Q56 64 40 96 Q30 124 44 160Z" fill="#7a3b6e" ${ink}/>
    <path d="M32 150 Q20 120 33 88 Q46 56 28 26" stroke="#5e2a54" stroke-width="3" fill="none" opacity="0.6"/><g fill="#d99bc6" ${ink}>${[30, 50, 72, 96, 120, 142].map((y, i) => `<circle cx="${i % 2 ? 36 : 30}" cy="${y}" r="${3.5 - i * 0.2}"/>`).join('')}</g></svg>`;
  const FLUKE = `<svg viewBox="0 0 120 60" width="1em" height="0.5em" overflow="visible"><path d="M60 60 Q56 36 60 26 Q40 30 6 8 Q30 4 52 16 Q60 20 60 24 Q60 20 68 16 Q90 4 114 8 Q80 30 60 26 Q64 36 60 60Z" fill="#2a3440" ${ink}/><path d="M60 26 Q40 22 18 10 M60 26 Q80 22 102 10" stroke="#e98a52" stroke-width="1.2" fill="none" opacity="0.7"/></svg>`;
  // Bar room bits: a dart, a cat. (The dive bar's mouse and fly are the kit's: see critter().)
  const DART = `<svg viewBox="0 0 40 8" width="1em" height="0.2em"><path d="M0 4 L10 1 L10 7Z" fill="#e63946"/><rect x="10" y="3" width="20" height="2" fill="#bbb"/><path d="M30 2 L40 4 L30 6Z" fill="#666"/></svg>`;
  // (The kit's cat, a grey tabby.)
  const CAT = critter('cat', { color: '#9d958b' });
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
  // (The kit's, in a space helmet, waving.)
  const ASTRONAUT = figure({ skin: 'tan', hairColor: 'black', hat: 'spacehelmet', top: '#eef1f5', accent: '#c8d0dc', bottom: '#eef1f5', shoes: '#9aa4b4', belt: '#9aa4b4', pose: 'wave' });
  // Santa (the kit's): his red coat with its white fur, the beard, the hat.
  const SANTA_LOOK = { hat: 'santa', beard: 'beard', hair: 'short', hairColor: 'white', blush: true, top: '#c0392b', topStyle: 'fur', accent: '#f8f8f8', bottom: '#c0392b', belt: '#1a1a1a', shoes: '#1a1a1a', build: 'stout' };
  // The sleigh: three of the kit's reindeer (Rudolph's nose in front), Santa in it, waving.
  const SLEIGH = `<svg viewBox="0 0 200 50" width="1em" height="0.25em" overflow="visible">
    ${[18, 52, 86].map((x, i) => critter.at('reindeer', x, 40, 34, { nose: i === 2, collar: true })).join('')}
    <path d="M30 30 L130 26 M64 30 L130 26" stroke="#e8d7a8" stroke-width="1"/>${figureAt(154, 39, 46, { ...SANTA_LOOK, facing: 'front', crop: 'waist', pose: 'wave' })}
    <path d="M128 18 L176 18 Q186 18 184 30 L130 32 Q124 26 128 18Z" fill="#c0392b" ${ink}/><path d="M132 22 H178" stroke="#e8c15a" stroke-width="1.6"/>${inked('M124 37 L188 37 Q194 35 194 30 M140 32 V37 M172 31 V37', '#e8c15a', 2.2)}</svg>`;
  // Club: hands in the air. Castle: a banner, a dragon, a knight.
  // Hands in the air in front of the TV: the kit's arms close up (in silhouette, its ink round
  // them, a fist on top), leaning this way and that.
  const HANDS = `<svg viewBox="0 0 400 80" width="1em" height="0.2em" overflow="visible">${[20, 70, 120, 175, 230, 280, 330, 380].map((x, i) => { const y = 24 + (i % 3) * 8; const lean = [-6, 4, -2, 7, -5, 3, 6, -4][i]; return `<g class="sc-hand" style="animation-delay:-${(i * 0.17).toFixed(2)}s">${inked(`M${x - lean * 2} 110 L${x} ${y}`, '#07050d', 13)}<circle cx="${x}" cy="${y - 4}" r="9.5" fill="#07050d" stroke="${INK}" stroke-width="${LW * 1.6}"/></g>`; }).join('')}</svg>`;
  // The court's banners (the castle, the tournament): one for each player, a swallow-tailed
  // gonfalon in their colour, each with its own pattern (a pale, a chevron, a bend…) in a deeper
  // shade of the same colour (so the banner reads as theirs at a glance; gold is only the trim),
  // their avatar on a roundel for its device and their name on a
  // scroll across it. 1em wide. They stir in the draught; whoever's turn it is has theirs lifted
  // and lit, a banner dips when its player drinks, and the winner's unfurls, big.
  const CLOTH = 'M2 5 H58 V100 L44 118 L30 102 L16 118 L2 100Z';
  const BLAZONS = {
    pale: (m) => `<rect x="22" width="16" height="130" fill="${m}"/>`,
    chevron: (m) => `<path d="M-5 92 L30 58 L65 92 V108 L30 74 L-5 108Z" fill="${m}"/>`,
    bend: (m) => `<path d="M-10 6 L6 -10 L76 96 L60 112Z" fill="${m}"/>`,
    fess: (m) => `<rect y="60" width="60" height="9" fill="${m}"/>`,
    quarterly: (m) => `<path d="M30 0 H60 V48 H30Z M0 48 H30 V130 H0Z" fill="${m}"/>`,
    saltire: (m) => `<path d="M-4 0 L64 120 M64 0 L-4 120" stroke="${m}" stroke-width="9"/>`,
    bordure: (m) => `<path d="${CLOTH}" fill="none" stroke="${m}" stroke-width="12"/>`,
    chief: (m) => `<rect width="60" height="22" fill="${m}"/>`,
    paly: (m) => `<path d="M8 0 h7 v130 h-7Z M23 0 h7 v130 h-7Z M38 0 h7 v130 h-7Z M53 0 h7 v130 h-7Z" fill="${m}"/>`,
    plain: () => '',
  };
  const COURT_GOLD = '#e8c15a';
  const pale = (c) => { const m = /^#?([\da-f]{6})$/i.exec(String(c)); if (!m) return false; const n = parseInt(m[1], 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) > 170; };
  const gonfalon = (p, kind, id) => {
    const c = /^#[\da-f]{3,8}$/i.test(p.color) ? p.color : '#8c1423';
    const m = shade(c, pale(c) ? 0.5 : 0.42);
    return `<svg viewBox="0 0 60 124" width="1em" height="2.07em" overflow="visible"><g class="ck-cloth"><clipPath id="${id}"><path d="${CLOTH}"/></clipPath>
      <path d="${CLOTH}" fill="${c}"/><g clip-path="url(#${id})">${BLAZONS[kind](m)}<g class="ck-folds"><path d="M9 0 V130 M27 0 V130 M45 0 V130" stroke="#000" stroke-width="6" opacity="0.2"/><path d="M15 0 V130 M33 0 V130 M51 0 V130" stroke="#fff" stroke-width="3" opacity="0.13"/></g></g>
      <path d="${CLOTH}" fill="none" stroke="${COURT_GOLD}" stroke-width="2"/><circle cx="30" cy="38" r="15" fill="${shade(c, 0.45)}" stroke="${COURT_GOLD}" stroke-width="2"/><text x="30" y="45" font-size="19" text-anchor="middle">${esc(p.avatar || '🛡️')}</text></g>
      <rect x="-4" y="1" width="68" height="5" rx="2.5" fill="#4a2e16"/><circle cx="-4" cy="3.5" r="3.4" fill="${COURT_GOLD}"/><circle cx="64" cy="3.5" r="3.4" fill="${COURT_GOLD}"/></svg><b class="ck-name">${esc(p.name)}</b>`;
  };
  // Each player's pattern, from their id (so it stays theirs as others come and go), no two alike.
  const blazonsFor = (ids) => {
    const kinds = Object.keys(BLAZONS);
    const used = new Set();
    return ids.map((id) => {
      let h = 7;
      for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      let k = h % kinds.length;
      while (used.has(k) && used.size < kinds.length) k = (k + 1) % kinds.length;
      used.add(k);
      return kinds[k];
    });
  };
  // Hangs the banners where `place(i, n)` says ({ left, top, fontSize }), again whenever someone
  // joins or leaves (or changes their look), and has them follow the game.
  const court = { drinks: {}, no: null };
  function heraldry(s, place, cls = []) {
    if (!layer) return;
    const ps = s?.players || [];
    const key = `${innerWidth}x${innerHeight}|${ps.map((p) => [p.id, p.name, p.avatar, p.color].join('|')).join(',')}`;
    let box = layer.querySelector('.ck-court');
    if (!box || box.dataset.key !== key) {
      box?.remove();
      box = el('', { inset: '0' });
      box.classList.add('ck-court', ...cls);
      box.dataset.key = key;
      const kinds = blazonsFor(ps.map((p) => p.id));
      ps.forEach((p, i) => {
        const d = el(gonfalon(p, kinds[i], `ckc${i}`), place(i, ps.length), 0, box);
        d.classList.add('blk', 'ck-banner');
        d.dataset.id = p.id;
        d.firstElementChild.style.animationDelay = `-${((i * 1.37) % 4).toFixed(2)}s`;
      });
    }
    const g = s?.game || {};
    const over = s?.phase === 'over';
    const turn = over ? null : g.turnId || g.rollerId || g.give?.from || g.bus?.riderId || null;
    const won = over ? g.winnerId ?? g.winner : null;
    const drinks = Object.fromEntries(ps.map((p) => [p.id, p.drinks || 0]));
    const fresh = court.no !== s?.gameNo;
    for (const d of box.children) {
      const id = d.dataset.id;
      // (ck- names: the page's own .turn and the like would style these too.)
      d.classList.toggle('ck-turn', turn != null && id === String(turn));
      d.classList.toggle('ck-win', won != null && id === String(won));
      if (!fresh && drinks[id] > (court.drinks[id] ?? Infinity)) {
        d.classList.remove('ck-dip');
        void d.offsetWidth;
        d.classList.add('ck-dip');
        later(() => d.classList.remove('ck-dip'), 1900);
      }
    }
    court.drinks = drinks;
    court.no = s?.gameNo;
  }
  // A dragon in flight (facing right): bat wings with their finger bones and scalloped skin, a
  // long neck, a horned head breathing fire, a pale scaled belly, claws tucked up, a long tail
  // ending in a spade.
  // (In the kit's way: flat colours, the ink outline round everything, a dot eye.)
  const DRAGON = (() => {
    const dk = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
    return `<svg viewBox="0 0 320 170" width="1em" height="0.53em" overflow="visible">
    <g class="sc-dwing back"><path d="M150 96 L118 18 L104 40 L92 22 L84 52 L70 40 L72 74 Q100 84 150 96Z" fill="#2a4422" ${dk}/></g>
    <path d="M110 108 Q70 118 40 104 Q16 92 4 104 Q14 108 18 116 Q30 104 40 116 Q76 134 116 118Z" fill="#3d6b33" ${dk}/>
    <path d="M4 104 L-2 94 L14 100 L10 88 L20 102Z" fill="#2e5226" ${dk}/>
    <path d="M100 104 Q120 78 170 82 Q200 84 214 70 Q226 54 238 44 L252 54 Q240 72 226 90 Q206 116 168 118 Q130 122 100 104Z" fill="#3d6b33" ${dk}/>
    <path d="M118 112 Q150 122 186 112 Q206 104 222 86" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="M118 112 Q150 122 186 112 Q206 104 222 86" fill="none" stroke="#d9c68a" stroke-width="9" stroke-linecap="round"/>
    ${[124, 138, 152, 166, 180, 194].map((x, i) => `<path d="M${x} ${115 - i * 0.6} q4 -3 8 0" stroke="#a8955a" stroke-width="1.5" fill="none"/>`).join('')}
    <path d="M150 116 l-6 14 l6 -2 l2 6 l4 -8 Z M190 110 l-2 14 l6 -3 l3 6 l2 -10Z" fill="#2e5226" ${dk}/>
    <path d="M232 46 Q246 30 268 34 L292 44 Q300 48 292 52 L270 54 Q282 58 278 62 L262 60 Q248 62 240 56Z" fill="#3d6b33" ${dk}/>
    <path d="M246 36 L232 14 L252 32 M256 34 L250 10 L262 32" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M246 36 L232 14 L252 32 M256 34 L250 10 L262 32" stroke="#e8dcc0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <ellipse cx="268" cy="41" rx="2.6" ry="3.3" fill="${INK}"/><circle cx="290" cy="46" r="1.4" fill="${INK}"/>
    <path d="M272 54 l4 4 l4 -4 l4 4" stroke="#f2efe6" stroke-width="1.5" fill="none"/>
    ${[116, 132, 148, 164].map((x, i) => `<path d="M${x} ${86 - i * 1.5} l4 -8 l4 8" fill="#2e5226" ${dk}/>`).join('')}
    <g class="sc-dwing"><path d="M166 86 L140 4 L128 28 L112 10 L106 44 L88 32 L94 70 Q130 80 166 86Z" fill="#4e7a38" ${dk}/>
      <path d="M166 86 L140 4 M160 84 L112 10 M152 82 L88 32" stroke="#2a4422" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <path class="sc-fire" d="M294 50 Q312 40 320 50 Q308 54 320 62 Q304 60 294 54Z" fill="#ff8a1a" ${dk}/><path class="sc-fire" d="M296 51 Q306 47 312 51 Q305 53 312 58 Q303 57 296 53Z" fill="#ffd23f"/></svg>`;
  })();
  // A knight in armour, walking (facing right): a great helm with a plume and a visor slit, a
  // white tabard with a red cross over mail, a heater shield, a sword at his side, plate legs.
  const KNIGHT = figure({ skin: 'light', hat: 'helmet', hatColor: '#b9c0c8', hatAccent: '#c0392b', top: '#9aa4ae', topStyle: 'tabard', accent: '#f2efe6', accent2: '#c0392b', bottom: '#8a939e', shoes: '#5a626c', pose: 'walk', holding: 'heater', holdingBack: 'sword' });
  // The jester juggling (the castle, the tournament): balls tossed from his hands, in time.
  const JESTER_LOOK = { skin: 'pale', hairColor: 'brown', hat: 'jester', top: '#c8303f', topStyle: 'harlequin', accent: '#d4af37', bottom: '#d4af37', shoes: '#c8303f', face: 'grin' };
  const juggle = () => {
    const h = 0.26 * innerHeight;
    const [hx, hy] = figure.points({ ...JESTER_LOOK, pose: 'juggle' }).handF;
    const x = 3 + ((hx / 120) * h / innerWidth) * 100;
    const y = 98 - ((118 - hy) / 120) * 26;
    for (let i = 0; i < 3; i++) toss(pick(['🔴', '🟡', '🔵']), { x: x - 1.6 + i * 1.4, y: y - 5, size: 22, height: 16, spins: 1, delay: i * 0.43 });
    el(figure({ ...JESTER_LOOK, pose: 'juggle' }), { left: '3vw', bottom: '2vh', fontSize: `${h}px` }, 4200).classList.add('blk');
  };
  // Tiki: a torch, a parrot, a coconut. Speakeasy: the bulb. Saloon: the poster, a hawk, a hat.
  // Beer hall: a stein.
  const TORCH = `<svg viewBox="0 0 30 200" width="0.15em" height="1em"><rect x="12" y="40" width="6" height="160" fill="#5a3d1e"/>
    <path d="M6 30 H24 L20 48 H10Z" fill="#8a6a3a"/><path d="M8 36 H22 M9 42 H21" stroke="#5a3d1e"/></svg>`;
  const PARROT = critter('parrot');
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
  const HAWK = critter('bird', { color: '#6a4424' });
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
  // (The kit's: the gun arm turns up to aim on .draw, sc-gunarm; the gun's flash is .fg-muzzle.)
  const GUNSLINGER = (shirt, hat) => figure({ skin: 'light', hat: 'cowboy', hatColor: hat, hatAccent: '#2a1a0e', mask: '#c0392b', top: shirt, topStyle: 'vest', accent: '#5a3a1e', bottom: '#3b2a1c', belt: '#2a1a0e', shoes: '#1c140c', holding: 'gun', hooks: { armF: 'sc-gunarm' } });

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
    const entry = { stop: () => clearTimeout(t) };
    const t = setTimeout(() => {
      timers.delete(entry);
      fn();
    }, ms);
    timers.add(entry);
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
          drift(critter('gull'), { from: [right ? -10 : 110, y + rand(-4, 4)], to: [right ? 110 : -10, y + rand(-6, 10)], dur: rand(10, 14), size: rand(36, 60), extra: { animationDelay: `${i * rand(0.3, 0.9)}s` } }).classList.add(right ? 'sc-face-r' : 'sc-face-l');
        }
      },
      () => across(SAILBOAT, { y: rand(36, 41), dur: rand(40, 55), size: rand(30, 50), cls: ['sc-pitch'] }),
      () => across(SHIP, { y: 39, dur: rand(30, 38), size: rand(50, 70) }),
      // Dolphins leaping out of the water, one after another.
      () => {
        const x = rand(10, 70);
        for (let i = 0; i < pick([1, 2, 3]); i++) {
          el(critter('dolphin'), { left: `${x + i * 4}vw`, top: `${rand(55, 62)}vh`, fontSize: `${rand(50, 70)}px`, animationDelay: `${i * 0.5}s` }, 4000)
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
    // (The club, the tavern, the castle, the jazz club and the dive bar are further down, with
    // their drawn people: see "The five regular rooms".)
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
    // (The Highlands pub: see hlScene below.)
    // (The saloon, the speakeasy, the casino, the tiki bar and the diner are further down, drawn
    // to match their pictures: see their block.)
    // (The space lounge is further down, with the pirate tavern.)
    // (The beer hall is further down, with the pirate tavern.)
    // (The pirate tavern is further down, with the beer hall, space, the lighthouse and the vineyard.)
    // (The lighthouse, in all its weathers, is further down with the pirate tavern.)
  };

  // ---------- Outdoors: the vineyard and the château ----------
  // (The kit's bird, dark.)
  const SWALLOW = critter('bird', { color: '#1c1a24' });
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
  // (The vineyard's moments are further down, with the pirate tavern.)
  const chateauMoments = (night) => [
    () => { burst(['🥂', '✨', '🫧'], { x: 4, y: 82, n: 16, spread: 10, size: [18, 28] }); cue('pop'); },
    () => crossing(critter('poodle'), { y: 92, dur: 9, size: 52, faces: 'right' }),
    ...(night
      ? [fireworks, fireworks, () => { for (let i = 0; i < 2; i++) later(() => el('', { left: `${rand(10, 70)}vw`, top: `${rand(3, 12)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 800); }]
      : [
        () => drift('🎈', { from: [-8, rand(8, 14)], to: [108, rand(4, 10)], dur: 34, size: 70, opacity: 0.95 }).classList.add('sc-balloon'),
        () => flock(DOVE, { y: [4, 12], n: [3, 5], size: [30, 40] }),
        () => { crossing(CH_PEACOCK, { y: 90, dur: 14, size: 90, faces: 'right' }); cue('peacock', 2500); },
        () => crossing(CH_CYCLIST, { y: 88, dur: 6, size: 90, bob: false, faces: 'right' }),
        () => fall(['🌸', '🌸', '🌹'], 8, 0.7, 0.8),
      ]),
  ];
  // The château (see chateauGarden() in lib/roomArt.js), on top of the moments above. Always:
  // clouds drifting by day; by night the stars twinkle, fireflies over the hedges and the candle on
  // our table flickers. Now and then: the garçon with a tray of coupes, a peacock that stops to fan
  // its tail, madame and her poodle, a cyclist with his baguettes, a hot-air balloon over the
  // château, a cork popped; by night a couple waltzing past. Any game: finishing a drink pops the
  // champagne (Santé !), sips bring the garçon round, a win gets Bravo ! and petals (or fireworks).
  // (All the kit's.) The garçon: moustache, bow tie, a long white apron, a tray of coupes, striding
  // (his legs: sc-legs-f/b, his tray steady).
  const CH_GARCON = figure({ hair: 'short', hairColor: 'black', beard: 'moustache', skin: 'pale', top: '#f4f4f4', topStyle: 'apron', accent: '#fbfbf6', neck: 'bow', accent2: '#1a1a22', bottom: '#1a1a22', shoes: '#0a0a0a', build: 'slim', pose: 'serve', holding: 'tray', tray: ['coupe', 'coupe', 'coupe'], hooks: { legF: 'sc-legs-f', legB: 'sc-legs-b' } });
  // A peacock (facing right), its train behind; `.ch-fan` opens into the full tail.
  const CH_PEACOCK = critter('peacock');
  // White doves (the kit's bird).
  const DOVE = critter('bird', { color: '#f4f4f0' });
  // Madame in her sun hat with her parasol, the poodle out in front on its lead.
  const CH_MADAME_LOOK = { hat: 'sunhat', hair: 'bun', hairColor: 'auburn', skin: 'pale', blush: true, top: '#e88aa8', accent: '#ffffff', neck: 'scarf', bottom: '#e88aa8', bottomStyle: 'gown', arms: ['parasol', [40, 10]], holdingBack: 'parasol' };
  const CH_MADAME = (() => {
    const s = 108 / 120;
    const [hx, hy] = figure.points(CH_MADAME_LOOK).handF;
    return `<svg viewBox="0 0 160 130" width="1em" height="0.81em" overflow="visible">${figureAt(38, 126, 108, CH_MADAME_LOOK)}
    <path d="M${n1(38 + (hx - 30) * s)} ${n1(126 + (hy - 118) * s)} Q100 112 139 103" stroke="#c0392b" stroke-width="1.5" fill="none"/>${critter.at('poodle', 122, 126, 52)}</svg>`;
  })();
  const CH_WHEEL = (x, y) => `<g class="ch-wheel" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${INK}" stroke-width="5.2"/><circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#2a2a2a" stroke-width="2.4"/>${[0, 45, 90, 135].map((a) => { const dx = 20 * Math.cos((a * Math.PI) / 180); const dy = 20 * Math.sin((a * Math.PI) / 180); return `<path d="M${(x - dx).toFixed(1)} ${(y - dy).toFixed(1)} L${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}" stroke="#8a8a8a" stroke-width="1"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="2.6" fill="#c9d2d8" ${ink}/></g>`;
  // On his bicycle (drawn in the kit's ink): beret, a striped jersey, baguettes in the basket.
  const CH_CYCLIST = `<svg viewBox="0 0 130 110" width="1em" height="0.85em" overflow="visible">${CH_WHEEL(26, 86)}${CH_WHEEL(100, 86)}
    ${inked('M26 86 L52 86 L82 56 L46 56 Z M52 86 L44 48 M82 56 L100 86 M80 44 L82 56', '#2a5a8a', 3.4)}${inked('M38 46 h14', '#1a1a1a', 4)}
    ${inked('M90 32 L97 6 M96 32 L107 10', '#e0a858', 6)}<path d="M86 30 h18 l-4 12 h-12Z" fill="#a8743a" ${ink}/>
    ${figureAt(46, 72, 72, { hat: 'beret', beard: 'moustache', hairColor: 'black', skin: 'light', top: '#f4f4f4', topStyle: 'stripes', accent: '#1a3a7a', bottom: '#1a1a3a', pose: 'ride', legs: [[60, -60], [96, -70]] })}</svg>`;
  // The balloon, two of the kit's people waving from its basket.
  const CH_BALLOON = `<svg viewBox="0 0 80 124" width="0.65em" height="1em" overflow="visible">
    ${['#c0392b', '#f4e8d0', '#1b3f8e', '#f4e8d0', '#c0392b'].map((col, i) => `<path d="M40 2 C${8 + i * 12} 2 ${4 + i * 16} ${40} ${12 + i * 14} 70 L${30 + i * 5} 90 L${30 + (i + 1) * 4} 90 L${12 + (i + 1) * 14} 70 C${4 + (i + 1) * 16} 40 ${8 + (i + 1) * 12} 2 40 2Z" fill="${col}"/>`).join('')}
    <path d="M40 2 C4 2 -2 44 14 70 L30 90 H50 L66 70 C82 44 76 2 40 2Z" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M16 30 Q40 40 64 30" stroke="#d4af37" stroke-width="3" fill="none"/>
    <path d="M32 92 L32 106 M48 92 L48 106" stroke="#5a3a1e" stroke-width="1.2"/>${figureAt(35, 114, 24, { facing: 'front', crop: 'waist', hat: 'tophat', skin: 'pale', top: '#2a3a5a', pose: 'wave' })}${figureAt(45, 114, 23, { facing: 'front', crop: 'waist', hair: 'bob', hairColor: 'blonde', skin: 'light', top: '#e8a0b0' })}<rect x="30" y="104" width="20" height="14" rx="2" fill="#8a5a2a" ${ink}/></svg>`;
  // By night, a couple waltzing (the kit's): he in tails, she in her gown, turning (ch-waltz).
  const CH_COUPLE = `<svg viewBox="0 0 76 120" width="0.633em" height="1em" overflow="visible"><g class="ch-waltz">
    ${figureAt(26, 118, 112, { hair: 'short', hairColor: 'black', skin: 'light', top: '#f4f4f4', topStyle: 'suit', accent: '#141418', neck: 'bow', accent2: '#141418', bottom: '#141418', arms: ['hold', [76, 40]] })}
    ${figureAt(50, 118, 104, { flip: true, hair: 'bun', hairColor: 'auburn', skin: 'pale', blush: true, top: '#c8a0e8', bottom: '#c8a0e8', bottomStyle: 'gown', arms: ['hold', [120, 30]] })}</g></svg>`;
  const chOn = () => current === 'chateau' || current === 'chateauNight';
  // The peacock comes in from the left, stops, fans its tail, and goes back the way it came.
  function chPeacock() {
    const size = (0.22 * innerHeight) / 0.76;
    el(CH_PEACOCK, { left: `-${((size / innerWidth) * 100).toFixed(1)}vw`, bottom: '4vh', fontSize: `${size}px`, '--dx': `${(((size / innerWidth) * 100) + 2).toFixed(1)}vw` }, 11000).classList.add('ch-peacock', 'blk');
    cue('peacock', 3400);
  }
  function chCork(name = '') {
    cue('pop');
    drift('<i></i>', { from: [3, 84], to: [rand(30, 50), rand(4, 20)], dur: 1.6, size: 14, spin: 1080, extra: { animationTimingFunction: 'cubic-bezier(0.2, 0.7, 0.4, 1)' } }).classList.add('ch-cork');
    burst(['●', '•', '○'], { x: 4, y: 84, n: 22, spread: 5, size: [5, 12], colors: ['#fff8e0', '#f4e0a0', '#ffffff'], rise: [-26, -10], fall: [-4, 6] });
    later(() => inFront(`<b>Santé${name ? `, ${name}` : ''} !</b>`, { left: '0', right: '26vw', top: '24vh' }, 3000).classList.add('sc-oneeighty', 'ton', 'ch'), 500);
    cue('clink', 900);
  }
  const chWatch = vvWatch({
    finish: (p) => chCork(esc(p.name)),
    sip: () => vvWalk(CH_GARCON, { vh: 22, dur: 11 }),
    over: (s) => {
      inFront('<b>Bravo !</b>', { left: '0', right: '26vw', top: '24vh' }, 3600).classList.add('sc-oneeighty', 'ton', 'ch');
      cue('cheer');
      if (current === 'chateauNight') { fireworks(); later(fireworks, 2600); } else { fall(['🌸', '🌹', '🌸'], 6, 0.25, 0.9); flock(DOVE, { y: [4, 12], n: [4, 6], size: [30, 40] }); }
    },
  });
  const chDecor = (night) => () => {
    chWatch.reset();
    if (!chOn()) return;
    if (!night) {
      for (let i = 0; i < 2; i++) el('<i></i><i></i><i></i>', { left: '0', top: `${[22, 17][i]}vh`, '--s': [1, 0.7][i], animationDuration: `${[140, 190][i]}s`, animationDelay: `-${[30, 120][i]}s` }).classList.add('ch-cloud');
      return;
    }
    for (let i = 0; i < 14; i++) el('', { left: `${rand(2, 98)}vw`, top: `${rand(1, 14)}vh`, '--c': '#ffffff', animationDuration: `${rand(1.5, 4).toFixed(1)}s`, animationDelay: `-${rand(0, 4).toFixed(1)}s` }).classList.add('fh-twinkle', 'ch-star');
    for (let i = 0; i < 10; i++) el('', { left: `${rand(0, 14)}vw`, top: `${rand(55, 85)}vh`, '--sx': `${rand(-5, 5)}vw`, '--sy': `${rand(-6, 6)}vh`, animation: `sc-fly ${rand(4, 7).toFixed(1)}s ease-in-out ${rand(0, 3).toFixed(1)}s infinite alternate` }).classList.add('sc-firefly');
    const [cx, cy] = artAt(1230, 676);
    el('', { left: `${cx}vw`, top: `${cy}vh` }).classList.add('ch-candle');
  };
  const chMore = (night) => [
    () => vvWalk(CH_GARCON, { vh: 22, dur: 11 }),
    () => { vvWalk(CH_MADAME, { vh: 17, dur: 15 }); cue('pop', 7000); },
    () => chCork(),
    ...(night
      ? [() => { vvWalk(CH_COUPLE, { vh: 21, dur: 16 }); notes(6, 80, '#e6c06a', 8); }]
      : [
        chPeacock,
        () => { vvWalk(CH_CYCLIST, { vh: 17, dur: 6 }); cue('clink', 1500); },
        () => drift(CH_BALLOON, { from: [-8, rand(5, 9)], to: [108, rand(3, 8)], dur: 40, size: 0.14 * innerHeight }).classList.add('ch-balloon', 'blk'),
      ]),
  ];
  // The Highlands pub (see highlandPub() in lib/roomArt.js), in any weather. Always: the peat
  // fire's glow and the lantern and candle flickering; rain running down the window or fog drifting
  // past it. Now and then: a Highland coo ambles through, sheep, the collie off after something, the
  // piper striking up, a log on the fire, a dram slid along the floor, sparks; in the window, Nessie
  // crossing the loch, a rainbow over the glen (when it's clear), lightning (in the rain). Any game:
  // finishing a drink gets Sláinte!, sips a dram slid over, a win the pipes.
  // (All the kit's: a Highland coo, a sheep, the collie, the piper in his tam and kilt puffing at
  // his pipes, Nessie.)
  const HL_COO = critter('coo');
  const HL_SHEEP = critter('sheep');
  const HL_COLLIE = critter('collie');
  const HL_PIPER = figure({ hat: 'tam', hatColor: '#141414', hatAccent: '#c0392b', hair: 'short', hairColor: 'red', beard: 'moustache', skin: 'pale', top: '#141414', topStyle: 'highland', accent: '#a8201a', bottom: '#a8201a', bottomStyle: 'skirt', shoes: '#1a1a1a', face: 'puff', arms: ['pipes', 'chanter'], holding: 'bagpipes' });
  const HL_NESSIE = critter('nessie');
  const hlOn = () => /^stpatricks/.test(current || '');
  // Something in the window on the glen (see highlandPub(): its glass is 60,180 to 300,400).
  function hlWindow(html, cls, life) {
    if (!hlOn()) return null;
    const [x0, y0] = artAt(60, 180);
    const [x1, y1] = artAt(300, 400);
    const d = el(html, { left: `${x0}vw`, top: `${y0}vh`, width: `${x1 - x0}vw`, height: `${y1 - y0}vh` }, life);
    d.classList.add('hl-win', ...cls);
    return d;
  }
  const hlNessie = () => hlWindow(`<div class="hl-nessie">${HL_NESSIE}</div>`, [], 14000);
  function hlPiper() {
    popup(HL_PIPER, { x: 2, bottom: 0, size: 0.32 * innerHeight, life: 9000 });
    notes(9, 66, '#e6b84a', 7);
    cue('cheer', 7600);
  }
  function hlSlainte(name = '') {
    inFront(`<b>Sláinte${name ? `, ${name}` : ''}!</b>`, { left: '0', right: '26vw', top: '24vh' }, 3200).classList.add('sc-oneeighty', 'ton', 'hl');
    burst(['●', '•', '✦'], { x: rand(40, 60), y: 86, n: 18, spread: 10, size: [5, 10], colors: ['#ff8a2a', '#ffd23f', '#ff5a14'], rise: [-50, -26], fall: [-10, 0] });
    cue('clink'); cue('cheer', 400);
  }
  const hlWatch = vvWatch({
    finish: (p) => hlSlainte(esc(p.name)),
    sip: () => { slide('🥃', { y: 91, size: 44 }); cue('slide', 200); },
    over: () => { hlPiper(); later(() => hlSlainte('mhath'), 600); },
  });
  const hlScene = (weather) => ({
    decor() {
      hlWatch.reset();
      if (!hlOn()) return;
      const [fx, fy] = artAt(800, 720);
      el('', { left: `${fx}vw`, top: `${fy}vh` }).classList.add('hl-fire');
      for (const [x, y, s] of [[160, 168, 1], [76, 370, 0.5]]) { const [lx, ly] = artAt(x, y); el('', { left: `${lx}vw`, top: `${ly}vh`, '--s': s }).classList.add('hl-lamp'); }
      if (weather === 'rain') hlWindow('', ['sc-rain'], 0);
      if (weather === 'fog') hlWindow('<i></i>', ['hl-fogpane'], 0);
    },
    update: hlWatch,
    moments: [
      ...hearth().slice(0, 2),
      () => { vvWalk(HL_COO, { vh: 20, dur: 18 }); cue('moo', 4000); },
      () => { for (let i = 0; i < pick([2, 3, 4]); i++) later(() => vvWalk(HL_SHEEP, { vh: rand(9, 11), dur: rand(9, 12) }), i * 900); cue('baa', 2500); },
      () => vvWalk(HL_COLLIE, { vh: 10, dur: 4 }),
      hlPiper,
      () => { burst(['●', '•', '✦'], { x: rand(40, 60), y: 90, n: 30, spread: 14, size: [5, 11], colors: ['#ff8a2a', '#ffd23f', '#ff5a14'], rise: [-60, -30], fall: [-14, 0] }); cue('thud'); },
      () => { slide('🥃', { y: 91, size: 44 }); cue('slide', 200); },
      ...(weather === 'fog' ? [] : [hlNessie]),
      ...(weather === 'clear' ? [() => hlWindow('<b></b>', ['hl-rainbow'], 9200)] : []),
      ...(weather === 'rain' ? [() => { hlWindow('', ['sc-winflash'], 1600); el('', { inset: '0' }, 1400).classList.add('hl-flash'); cue('thunderFar', rand(1500, 3500)); }, () => popup('☂️', { x: 2, bottom: 2, size: 64, life: 5000 })] : []),
    ],
  });
  SCENES.stpatricks = hlScene('clear');
  SCENES.stpatricksRain = hlScene('rain');
  SCENES.stpatricksFog = hlScene('fog');

  // Christmas (see christmasEve() in lib/roomArt.js), on top of the snow and Santa's sleigh
  // above. Always: the fairy lights and the tree twinkling, the star glowing, the fire. Now and
  // then: the toy train goes round with presents aboard, Santa pops out from behind the tree with
  // his sack, Rudolph trots through (nose blinking), a gingerbread man legs it, the cat knocks a
  // bauble off the tree, an elf peeks out of the presents, a snowman, a present that won't keep
  // still. Any game: finishing a drink gets a Ho ho ho!, sips a cocoa slid over, a win the sleigh.
  // (All the kit's: Santa with his sack over his shoulder, waving; Rudolph; a gingerbread man in
  // the kit's proportions; an elf; a snowman.)
  const XM_SANTA = figure({ ...SANTA_LOOK, facing: 'front', pose: 'wave', arms: ['sack', 'wave'], holdingBack: 'sack' });
  const XM_REINDEER = critter('reindeer', { nose: true, collar: true });
  const XM_GINGER = figure({ skin: '#b8743a', top: '#b8743a', topStyle: 'buttons', sleeves: 'none', bottom: '#b8743a', shoes: '#b8743a', hair: 'bald', face: 'grin', blush: true, pose: 'walk' });
  const XM_ELF = figure({ facing: 'front', hat: 'elf', hair: 'short', hairColor: 'auburn', skin: 'pale', blush: true, face: 'grin', top: '#2a8a3a', belt: '#1a1a1a', bottom: '#c0392b', shoes: '#2a8a3a', build: 'slim', pose: 'wave' });
  const XM_SNOWMAN = critter('snowman');
  const XM_TRAIN = `<svg viewBox="0 0 320 90" width="1em" height="0.28em" overflow="visible">
    ${[0, 92].map((x) => `<rect x="${x + 4}" y="50" width="84" height="22" rx="3" fill="${x ? '#1b5a9e' : '#2a6a3a'}"/><rect x="${x + 14}" y="28" width="26" height="24" fill="${x ? '#e8b84a' : '#c0392b'}"/><rect x="${x + 44}" y="36" width="30" height="16" fill="${x ? '#7a3a9a' : '#f4f4f4'}"/><path d="M${x + 27} 28 V52 M${x + 14} 40 H${x + 40}" stroke="#f4f4f4" stroke-width="3"/>
      <g class="sc-tyre"><circle cx="${x + 20}" cy="76" r="9" fill="#1a1a1a"/><path d="M${x + 13} 76 h14" stroke="#888" stroke-width="2"/></g><g class="sc-tyre"><circle cx="${x + 70}" cy="76" r="9" fill="#1a1a1a"/><path d="M${x + 63} 76 h14" stroke="#888" stroke-width="2"/></g><rect x="${x + 88}" y="62" width="8" height="4" fill="#3a3a3a"/>`).join('')}
    <rect x="190" y="36" width="90" height="34" rx="14" fill="#141414"/><rect x="190" y="20" width="40" height="50" fill="#c0392b"/><rect x="186" y="16" width="48" height="8" fill="#1a1a1a"/><rect x="198" y="28" width="22" height="16" fill="#ffd27a"/>
    <rect x="252" y="12" width="14" height="26" fill="#141414"/><path d="M248 10 h22 l-3 6 h-16Z" fill="#1a1a1a"/><circle cx="264" cy="44" r="5" fill="#d4af37"/><path d="M280 52 L300 74 H280Z" fill="#c0392b"/><circle cx="286" cy="40" r="5" fill="#fff8d0"/>
    ${[214, 252].map((x) => `<g class="sc-tyre"><circle cx="${x}" cy="72" r="14" fill="#c0392b"/><circle cx="${x}" cy="72" r="5" fill="#1a1a1a"/><path d="M${x - 12} 72 h24 M${x} 60 v24" stroke="#8a1a14" stroke-width="2"/></g>`).join('')}</svg>`;
  const xmOn = () => current === 'christmas';
  function xmTrain() {
    const right = Math.random() < 0.5;
    const d = drive(XM_TRAIN, { ar: 3.56, h: 9, y: xmOn() ? Math.min(100, artAt(0, 892)[1]) : 99, dur: 12, right });
    d.classList.add('xm-train');
    cue('whistle', 600);
    for (let i = 0; i < 8; i++) later(() => { const r = d.getBoundingClientRect(); const x = ((right ? r.right - r.width * 0.17 : r.left + r.width * 0.17) / innerWidth) * 100; drift('', { from: [x, (r.top / innerHeight) * 100], to: [x + rand(-3, 3), (r.top / innerHeight) * 100 - 14], dur: 2.4, size: 10 }).classList.add('sc-plume', 'steam', 'xm-puff'); }, 800 + i * 1200);
  }
  function xmBauble() {
    const [x, y] = xmOn() ? artAt(rand(110, 220), rand(380, 560)) : [rand(3, 10), 50];
    const col = pick(['#d62828', '#e8b84a', '#3a7ae8']);
    drift(`<i style="background:${col}"></i>`, { from: [x, y], to: [x + rand(-1, 2), 95], dur: 0.9, size: 14, spin: 200, extra: { animationTimingFunction: 'ease-in' } }).classList.add('xm-bauble');
    later(() => { cue('shatter'); burst(['✦', '•', '✧'], { x, y: 95, n: 16, spread: 4, size: [5, 10], colors: [col, '#ffffff', '#ffd23f'], rise: [-10, -3], fall: [-2, 4] }); }, 900);
    later(() => { crossing(CAT, { y: 92, dur: 3, size: 46, faces: 'right', cls: ['sc-cat'] }); cue('meow'); }, 1300);
  }
  const xmHoho = (name = '') => {
    popup(XM_SANTA, { x: 2, bottom: 0, size: 0.3 * innerHeight, life: 5200 });
    later(() => { inFront(`<b>Ho ho ho${name ? `, ${name}` : ''}!</b>`, { left: '0', right: '26vw', top: '24vh' }, 3000).classList.add('sc-oneeighty', 'ton', 'xm'); cue('sleighbells'); }, 900);
  };
  const xmWatch = vvWatch({
    finish: (p) => { xmHoho(esc(p.name)); later(() => burst(['🎁', '✨', '⭐'], { x: 6, y: 80, n: 14, spread: 10 }), 1400); },
    sip: () => { slide('☕', { y: 91, size: 44 }); cue('slide', 200); },
    over: () => {
      drift(SLEIGH, { from: [-30, rand(6, 8)], to: [115, rand(1, 3)], dur: 11, size: 230 }).classList.add('sc-sleigh');
      later(() => { inFront('<b>Merry Christmas!</b>', { left: '0', right: '26vw', top: '24vh' }, 3600).classList.add('sc-oneeighty', 'ton', 'xm'); cue('sleighbells'); cue('cheer', 300); }, 1200);
      fall(['❄', '✨', '⭐'], 6, 0.25, 0.85);
    },
  });
  SCENES.christmas.decor = () => {
    xmWatch.reset();
    if (!xmOn()) return;
    for (let i = 0; i < 32; i++) {
      const x = 25 + i * 50;
      const [vx, vy] = artAt(x, 66 + 33 * Math.sin(((x % 400) / 400) * Math.PI));
      el('', { left: `${vx}vw`, top: `${vy}vh`, '--c': ['#ff4d4d', '#ffd23f', '#4dd4ff', '#7dff7a'][i % 4], animationDelay: `-${(Math.random() * 3).toFixed(2)}s`, animationDuration: `${(1.2 + Math.random() * 2).toFixed(2)}s` }).classList.add('fh-twinkle');
    }
    for (let i = 0; i < 14; i++) {
      const y = 150 + Math.random() * 450;
      const half = 40 + ((y - 100) / 520) * 160;
      const [vx, vy] = artAt(160 + (Math.random() - 0.5) * half * 1.5, y);
      el('', { left: `${vx}vw`, top: `${vy}vh`, '--c': pick(['#fff4c0', '#ffd23f', '#ff9a8a', '#9ad8ff']), animationDelay: `-${(Math.random() * 3).toFixed(2)}s`, animationDuration: `${(0.8 + Math.random() * 1.6).toFixed(2)}s` }).classList.add('fh-twinkle', 'xm-tree');
    }
    const [sx, sy] = artAt(160, 92);
    el('', { left: `${sx}vw`, top: `${sy}vh` }).classList.add('xm-star');
    const [fx, fy] = artAt(800, 760);
    el('', { left: `${fx}vw`, top: `${fy}vh` }).classList.add('hl-fire');
  };
  SCENES.christmas.update = xmWatch;
  SCENES.christmas.moments.push(
    xmTrain,
    () => { xmHoho(); later(() => burst(['🎁', '✨', '⭐'], { x: 6, y: 80, n: 12, spread: 8 }), 1600); },
    () => vvWalk(XM_REINDEER, { vh: 17, dur: 10 }),
    () => { vvWalk(XM_GINGER, { vh: 9, dur: 3.4 }); later(() => vvWalk(CAT, { vh: 8, dur: 4.2 }), 600); },
    xmBauble,
    () => popup(XM_ELF, { x: rand(3, 8), bottom: 2, size: 0.13 * innerHeight, life: 4200 }),
    () => popup(XM_SNOWMAN, { x: 2, bottom: 2, size: 0.1 * innerHeight, life: 5500 }),
    () => { const b = el('🎁', { left: '3vw', bottom: '3vh', fontSize: '64px' }, 4500); b.classList.add('sc-present'); later(() => burst(['✨', '⭐', '🎉'], { x: 5, y: 86, n: 18, spread: 10 }), 2200); },
  );

  // Halloween (see hauntedHill() in lib/roomArt.js), on top of the bats, ghosts, witch and the
  // rest above. Always: the jack-o'-lanterns and the haunted house's windows flickering, the
  // cauldron bubbling, the lantern in the tree, the owl blinking. Now and then: a hand claws up
  // out of a grave, a skeleton dances, a black cat stalks along the fence, something's eyes in the
  // crypt. Any game: finishing a drink gets MWAHAHA! (and a bat or three), sips the eyes in the dark,
  // a win the thunder, the howl, and the ghosts.
  const HW_HAND = `<svg viewBox="0 0 70 90" width="0.78em" height="1em" overflow="visible"><g class="hw-claw">
    <path d="M26 90 L28 50 Q20 40 22 26 L18 8 Q20 4 24 8 L28 24 L30 4 Q34 0 36 4 L36 24 L42 6 Q46 2 48 8 L44 28 L52 16 Q56 14 56 20 L46 44 Q44 52 42 90Z" fill="#7a9a5a" ${ink}/>
    <path d="M30 56 Q34 60 38 56 M28 70 h12" stroke="#4a6a3a" stroke-width="2" fill="none"/><path d="M30 60 l6 4 l-2 8" stroke="${INK}" stroke-width="1.4" fill="none"/></g>
    <path d="M0 90 Q10 72 34 74 Q58 72 70 90Z" fill="#1a1020" ${ink}/><circle cx="14" cy="82" r="3" fill="#2a1e30"/><circle cx="56" cy="84" r="2.4" fill="#2a1e30"/></svg>`;
  // A skeleton (the kit's, in bone, from the front) dancing a jig, arms up.
  const HW_SKELETON = figure({ facing: 'front', skin: '#ece6dc', top: '#ece6dc', topStyle: 'ribs', sleeves: 'none', bottom: '#ece6dc', bottomStyle: 'shorts', shoes: '#ece6dc', hair: 'bald', face: 'skull', arms: [[100, 60], [100, 60]], legs: ['wide', 'wide'], hooks: { armB: 'hw-arml', armF: 'hw-armr', legB: 'hw-legl', legF: 'hw-legr', head: 'hw-head' } });
  const HW_CAT = critter('cat', { color: '#05030a', eye: '#ffd23f' });
  const hwOn = () => current === 'halloween';
  const hwWatch = vvWatch({
    finish: (p) => { inFront(`<b>MWAHAHA!</b><small>${esc(p.name)}, drink it all</small>`, { left: '0', right: '26vw', top: '24vh' }, 3200).classList.add('sc-oneeighty', 'ton', 'hw', 'vv'); bats(); cue('howl', 600); },
    sip: () => el(EYES, { left: `${rand(5, 14)}vw`, top: `${rand(60, 85)}vh`, fontSize: `${rand(36, 56)}px` }, 4200).classList.add('sc-eyes'),
    over: () => {
      el('', { inset: '0' }, 1400).classList.add('sc-lightning');
      cue('thunder', 600); cue('howl', 2200);
      later(() => inFront('<b>BOO!</b>', { left: '0', right: '26vw', top: '24vh' }, 2800).classList.add('sc-oneeighty', 'ton', 'hw'), 500);
      for (let i = 0; i < 3; i++) later(() => { const x = rand(4, 60); drift(GHOST, { from: [x, 90], to: [x + rand(-12, 12), rand(15, 40)], dur: rand(7, 10), size: rand(50, 80) }).classList.add('sc-ghost'); }, 900 + i * 700);
    },
  });
  const hwDecor = SCENES.halloween.decor;
  SCENES.halloween.decor = () => {
    hwWatch.reset();
    if (!hwOn()) return hwDecor();
    el('', { left: '-20vw', bottom: '-6vh', width: '140vw', height: '28vh', animation: 'sc-fog 22s ease-in-out infinite alternate' }).classList.add('sc-fog');
    const clouds = el('<div class="sc-cloud a"></div><div class="sc-cloud b"></div><div class="sc-cloud c"></div>', { left: `${artAt(1300, 0)[0]}vw`, top: `${artAt(0, 140)[1]}vh` });
    clouds.classList.add('sc-clouds');
    for (const [x, y, s] of [[90, 846, 1.1], [210, 870, 0.7], [1490, 846, 1.2], [1380, 870, 0.75], [1078, 480, 0.5], [300, 256, 0.8]]) { const [vx, vy] = artAt(x, y); el('', { left: `${vx}vw`, top: `${vy}vh`, '--s': s, animationDelay: `-${rand(0, 2).toFixed(1)}s` }).classList.add('hw-glow'); }
    for (const [x, y] of [[1060, 330], [1146, 330], [1000, 410], [1094, 410]]) { const [vx, vy] = artAt(x, y); const [wx, wy] = artAt(x + 26, y + 38); el('', { left: `${vx}vw`, top: `${vy}vh`, width: `${wx - vx}vw`, height: `${wy - vy}vh`, animationDelay: `-${rand(0, 9).toFixed(1)}s`, animationDuration: `${rand(7, 13).toFixed(1)}s` }).classList.add('hw-window'); }
    const [ox, oy] = artAt(421, 126);
    el(EYES, { left: `${ox - 0.9}vw`, top: `${oy - 0.9}vh`, fontSize: `${(artAt(440, 0)[0] - artAt(400, 0)[0]) * innerWidth / 100}px` }).classList.add('hw-owl');
    const [cx, cy] = artAt(1240, 826);
    const bubble = () => later(() => { if (current !== 'halloween') return; drift('', { from: [cx + rand(-3, 3), cy], to: [cx + rand(-4, 4), cy - rand(8, 14)], dur: rand(1.6, 2.6), size: 10 }).classList.add('hw-bubble'); bubble(); }, rand(300, 900));
    bubble();
  };
  SCENES.halloween.update = hwWatch;
  SCENES.halloween.moments.push(
    () => { popup(HW_HAND, { x: rand(2, 10), bottom: -1, size: 0.16 * innerHeight, life: 5200 }); cue('moan', 600); },
    () => { popup(HW_SKELETON, { x: 2, bottom: 0, size: 0.28 * innerHeight, life: 7000 }); notes(10, 70, '#ece6d8', 5); cue('rattle', 900); },
    () => { crossing(HW_CAT, { y: 89, dur: 9, size: (0.08 * innerHeight) / 0.6, faces: 'right', bob: false }); cue('meow', 3000); },
    () => { if (!hwOn()) return; const [x, y] = artAt(172, 622); el(EYES, { left: `${x - 1}vw`, top: `${y}vh`, fontSize: '40px' }, 4200).classList.add('sc-eyes'); cue('creak'); },
    () => { if (!hwOn()) return; const [x, y] = artAt(1240, 820); burst(['●', '•', '○'], { x, y, n: 20, spread: 4, size: [6, 14], colors: ['#7cff9a', '#c8ffb0', '#3aff6a'], rise: [-24, -10], fall: [-6, 4] }); cue('sizzle'); },
  );

  // (The drawn madame, peacock, cyclist and balloon take over from the emoji ones.)
  SCENES.chateau = { decor: chDecor(false), update: chWatch, moments: [...chateauMoments(false).filter((m, i) => ![1, 2, 4, 5].includes(i)), ...chMore(false)] };
  SCENES.chateauNight = { decor: chDecor(true), update: chWatch, moments: [...chateauMoments(true).filter((m, i) => i !== 1), ...chMore(true)] };

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
  // The mob (the kit's people): caps of liberty and headscarves, torches and pitchforks, shouting.
  const REV_MOB = `<svg viewBox="0 0 444 120" width="1em" height="0.27em" overflow="visible">${[
    { hat: 'phrygian', holding: 'torch', arms: ['swingB', 'up'] },
    { hat: 'headscarf', hatColor: '#6a4a8a', hair: 'long', bottomStyle: 'skirt', bottom: '#5a3a2a', holding: 'pitchfork', arms: ['down', 'carry'] },
    { beard: 'beard', hairColor: 'black', holding: 'torch', arms: ['fist', 'up'] },
    { hat: 'phrygian', holding: 'pitchfork', arms: ['swingB', 'carry'] },
    { hat: 'headscarf', hatColor: '#3a5a3a', hair: 'bun', bottomStyle: 'skirt', bottom: '#4a3a5a', holding: 'torch', arms: ['fist', 'up'] },
    { hat: 'flatcap', beard: 'stubble', holding: 'pitchfork', arms: ['down', 'carry'] },
    { hat: 'phrygian', holding: 'torch', arms: ['swingB', 'up'] },
  ].map((o, i) => figureAt(30 + i * 64, 118, 108 - (i % 3) * 4, { skin: skinFor(i * 2 + 1), top: ['#8a6a4a', '#a04a3a', '#5a6a7a', '#7a5a3a', '#9a7a5a', '#6a4a3a', '#8a5a4a'][i], bottom: '#3a2e24', face: 'shout', pose: 'walk', ...o })).join('')}</svg>`;
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
      () => { const h = 0.12 * innerHeight; crossing(REV_MOB, { y: 99 - (h / innerHeight) * 100, dur: 16, size: h / 0.27, faces: 'right' }); cue('mob', 800); },
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
  // The Dutchman's dead crew (the kit's people, a skull for a face, sea-green: .sc-ghost tints
  // them), his crabs (the kit's), and a skull and crossbones rising from the deep.
  const DUTCH_GHOST = figure({ skin: '#dff4e8', face: 'skull', hat: 'bandana', hatColor: '#5a8a74', hair: 'long', hairColor: '#9ab8a8', top: '#9ac8b0', topStyle: 'stripes', accent: '#5a8a74', bottom: '#6a9a84', shoes: '#4a7a64', arms: ['point', 'point'], legs: [[18, 30], [-14, 30]] });
  const DUTCH_CRAB = critter('crab');
  const DUTCH_SKULL = `<svg viewBox="0 0 60 60" width="1em" height="1em" overflow="visible">${inked('M8 40 L52 56 M52 40 L8 56', '#ece6dc', 6)}${[[8, 40], [52, 56], [52, 40], [8, 56]].map(([x, y]) => `<circle cx="${x + (x < 30 ? -2 : 2)}" cy="${y - 2}" r="3.4" fill="#ece6dc" ${ink}/><circle cx="${x + (x < 30 ? -2 : 2)}" cy="${y + 2}" r="3.4" fill="#ece6dc" ${ink}/>`).join('')}<path d="M14 24 Q14 4 30 4 Q46 4 46 24 Q46 32 40 34 V40 H20 V34 Q14 32 14 24Z" fill="#ece6dc" ${ink}/>${[23, 37].map((x) => `<ellipse cx="${x}" cy="22" rx="5" ry="5.6" fill="${INK}"/>`).join('')}<path d="M30 27 l-2.4 4.4 h4.8Z" fill="${INK}"/><path d="M24 35 V40 M28 35 V40 M32 35 V40 M36 35 V40" stroke="${INK}" stroke-width="1.4"/></svg>`;
  SCENES.pirateDutchman = {
    decor() {
      el('', { left: '0', bottom: '0', width: '100vw', height: '40vh' }).classList.add('sc-ghostfog');
      el(LANTERN, { left: '2.5vw', top: '16vh', fontSize: '80px' }).classList.add('sc-lantern', 'sc-ghostlight');
      banner('The Flying Dutchman', 'Liar’s dice, for years of your life', 'ghost');
      cue('toll', 200); cue('toll', 3200);
    },
    moments: [
      () => { drift(`<span class="sc-ghost">${DUTCH_GHOST}</span>`, { from: [-10, rand(20, 50)], to: [110, rand(20, 50)], dur: rand(14, 18), size: rand(90, 120), opacity: 0.55 }); cue('moan', 1000); },
      () => { for (let i = 0; i < pick([1, 2, 3]); i++) later(() => crossing(DUTCH_CRAB, { y: 92, dur: rand(5, 8), size: rand(44, 56), bob: false, faces: 'right', cls: ['sc-crab'] }), i * 700); },
      () => {
        const left = Math.random() < 0.5;
        for (let i = 0; i < 2; i++) el(TENTACLE, { [left ? 'left' : 'right']: `${rand(1, 9)}vw`, bottom: '0', fontSize: `${rand(220, 300)}px`, animationDelay: `${i * 0.7}s` }, 8000).classList.add('sc-tentacle', 'sc-ghostgreen');
        cue('splash');
      },
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 1400).classList.add('sc-greenflash'); cue('thunder', 600); },
      () => { popup('🔔', { x: 2, bottom: 20, size: 60, life: 5000 }); cue('toll', 300); cue('toll', 2800); },
      () => { const x = rand(15, 60); el(DUTCH_SKULL, { left: `${x}vw`, top: '50vh', fontSize: '80px' }, 5000).classList.add('sc-rise'); cue('splash', 3800); },
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
  const CRICKET = critter('cricket');
  const crickets = () => { popup(CRICKET, { x: 4, bottom: 3, size: 76, life: 4000 }); inFront('<b>…</b>', { left: '0', right: '26vw', top: '36vh' }, 2600).classList.add('sc-quote'); cue('crickets'); };
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
  // The beer hall's people (here and in SCENES.beerhall): a dirndl, lederhosen.
  const BH_DIRNDL = { skin: 'pale', blush: true, hair: 'bun', hairColor: 'blonde', top: '#f6efe0', sleeves: 'short', topStyle: 'dirndl', accent: '#2e6a3a', accent2: '#e8c15a', bottom: '#c0392b', bottomStyle: 'skirt', shoes: '#2a1a10' };
  const BH_LEDERHOSEN = { skin: 'light', hair: 'short', hairColor: 'brown', hat: 'alpine', top: '#f6efe0', topStyle: 'braces', accent: '#6a4424', bottom: '#6a4424', bottomStyle: 'shorts', shoes: '#2a1a10' };
  const BH_STEINS = figure({ ...BH_DIRNDL, pose: 'carry', arms: ['carry', 'carry'], holding: 'steins', holdingBack: 'steins', cls: 'fg-walk' });
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
      () => vvWalk(BH_STEINS, { vh: 24, dur: 12 }),
      () => { vvWalk(COUPLE({ ...BH_DIRNDL, hair: 'long', bottom: '#2a6fdb' }, { ...BH_LEDERHOSEN, skin: 'tan', beard: 'moustache' }), { vh: 24, dur: 14 }); },
      () => { cue('yodel'); notes(5, 80, '#2a6fdb'); },
      () => { burst(['🥨', '🍺', '🌭'], { x: 6, y: 80, n: 14, spread: 10, size: [20, 30] }); cue('clink'); },
      () => crossing('🍻', { y: 92, dur: 6, size: 50, bob: false }),
    ],
  };

  // Mad Max in the garage: Fury Road. Sand blows low across the ground and the oil drums burn; the
  // war rig thunders past with its convoy of spiked war cars and the Doof Wagon (the drummers
  // pounding, the guitarist on his bungees, flames out of his guitar); a war boy sprays his mouth
  // chrome and shouts WITNESS ME; fire columns go up, a flare arcs over, lightning flickers in the
  // storm on the horizon, and now and then the storm wall itself rolls in. The game drives it too:
  // a war brings the storm and the drums, the final battle the whole storm, someone out of cards
  // goes to Valhalla, and the last one holding cards gets witnessed.
  //
  // The drawings face right (across the floor, along the bottom). A dust cloud is part of each,
  // so it's turned round with it.
  const CHROME = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.42" stop-color="#b9c3ca"/><stop offset="0.52" stop-color="#4a5258"/><stop offset="1" stop-color="#dfe5e8"/></linearGradient>`;
  const KICK = (x0, x1, y, id) => `<radialGradient id="${id}"><stop offset="0" stop-color="#d89262" stop-opacity="0.8"/><stop offset="1" stop-color="#b8703e" stop-opacity="0"/></radialGradient>
    <g class="sc-kick">${[0, 1, 2, 3].map((i) => `<ellipse cx="${x0 + ((x1 - x0) * i) / 3}" cy="${y - 10 - i * 4}" rx="${40 - i * 6}" ry="${26 - i * 4}" fill="url(#${id})"/>`).join('')}</g>`;
  const TYRE = (x, y, r, chrome) => `<g class="sc-tyre"><circle cx="${x}" cy="${y}" r="${r}" fill="#0c0a09"/><path d="M${x - r + 3} ${y} h${2 * r - 6} M${x} ${y - r + 3} v${2 * r - 6}" stroke="#2e2a28" stroke-width="${r / 5}"/><circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="url(#${chrome})"/></g>`;
  // The war boys (the character kit's war-boy look): painted white, bald, black round the eyes, the
  // mouth sprayed chrome, scars, dark trousers.
  const WARBOY = { skin: 'chalk', hair: 'bald', face: 'warpaint', topStyle: 'scars', bottom: '#2a1e18', belt: '#4a3428', shoes: '#140e0a' };
  // The Doof Warrior: the red suit and hood, his mother's face for a mask, the flame guitar.
  const DOOFER = { skin: 'pale', hat: 'hood', hatColor: '#c0201a', face: 'warpaint', top: '#c0201a', bottom: '#c0201a', shoes: '#1a1010', belt: '#5a1010', pose: 'play', holding: 'guitar', propColor: '#e8e2da' };
  // A war boy riding on top of a vehicle, feet at (x, y), arms up (or, `pose`, otherwise).
  const RIDER = (x, y, s = 1, pose = 'cheer') => figureAt(x, y, 48 * s, { ...WARBOY, pose });
  // The war rig: a black tanker truck, chrome stacks spitting flame, spikes all along the tank, a
  // polecat swaying on his pole, war boys riding on top.
  const WAR_RIG = `<svg viewBox="0 0 540 150" width="1em" height="0.278em" overflow="visible"><defs>${CHROME('wrC')}
    <linearGradient id="wrT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c89a"/><stop offset="0.22" stop-color="#c06a30"/><stop offset="0.7" stop-color="#6a2e12"/><stop offset="1" stop-color="#2a1208"/></linearGradient></defs>
    ${KICK(20, 140, 146, 'wrK')}
    <rect x="128" y="112" width="268" height="12" fill="#1a1210"/>
    <rect x="140" y="50" width="240" height="62" rx="30" fill="url(#wrT)"/>
    ${[178, 216, 254, 292, 330].map((x) => `<rect x="${x}" y="52" width="5" height="58" fill="#3a1a0a" opacity="0.55"/>`).join('')}
    <rect x="152" y="58" width="216" height="5" rx="2.5" fill="#fff" opacity="0.3"/>
    ${Array.from({ length: 15 }, (_, i) => `<path d="M${152 + i * 14} 53 l5 -15 l5 15Z" fill="#241610"/>`).join('')}
    <path d="M206 52 v-20 h34 v20Z" fill="#2e221c"/><rect x="212" y="26" width="22" height="7" fill="url(#wrC)"/>
    <g class="sc-pole"><path d="M300 52 L280 -46" stroke="#5a3a22" stroke-width="4"/>${RIDER(280, -40, 1.1)}</g>
    ${RIDER(170, 38)}${RIDER(352, 38, 1, 'witness')}
    <path d="M388 124 V60 H438 L448 34 H478 L494 62 L514 70 V124Z" fill="#1c1816"/>
    <path d="M452 40 H474 L486 62 H446Z" fill="#7ab8c0" opacity="0.85"/><path d="M455 43 H462 L452 60 H448Z" fill="#fff" opacity="0.4"/>
    <rect x="502" y="74" width="14" height="46" fill="url(#wrC)"/><path d="M502 82 h14 M502 90 h14 M502 98 h14 M502 106 h14" stroke="#2a2a2a" stroke-width="1.5"/>
    <path d="M516 76 l14 4 l-14 4Z M516 94 l16 4 l-16 4Z M516 110 l14 4 l-14 4Z" fill="url(#wrC)"/>
    <circle cx="510" cy="68" r="4.5" fill="#ffe08a"/><circle cx="510" cy="68" r="10" fill="#ffe08a" opacity="0.3"/>
    <path d="M504 86 q6 -6 12 0 v6 h-12Z" fill="#e8dcc0"/>
    <rect x="394" y="96" width="42" height="18" rx="9" fill="url(#wrC)"/>
    <rect x="424" y="8" width="8" height="54" fill="url(#wrC)"/><rect x="438" y="14" width="8" height="48" fill="url(#wrC)"/>
    <path class="sc-exflame" d="M428 8 q-8 -14 0 -30 q3 10 7 2 q6 12 -2 28Z" fill="#ff8a1a"/><path class="sc-exflame b" d="M442 14 q-7 -12 0 -26 q3 9 6 2 q5 10 -2 24Z" fill="#ffb347"/>
    ${RIDER(410, 60, 1, 'wave')}
    ${[152, 188, 334, 368, 410, 478].map((x) => TYRE(x, 128, 18, 'wrC')).join('')}</svg>`;
  // A war car: a hot rod bristling with spikes, the blower out of the bonnet spitting flame, a war
  // boy at the back with a thunderstick (the lance with a bomb on the end).
  const WAR_CAR = (body = '#3a1c10') => `<svg viewBox="0 0 230 100" width="1em" height="0.435em" overflow="visible"><defs>${CHROME('wcC')}</defs>
    ${KICK(0, 60, 96, 'wcK')}
    <path d="M40 80 L48 56 H118 L132 38 H166 L176 56 L208 60 L216 82 H40Z" fill="${body}"/>
    <path d="M136 42 H162 L170 56 H132Z" fill="#6aa0a8" opacity="0.8"/>
    ${Array.from({ length: 10 }, (_, i) => `<path d="M${54 + i * 11} ${i > 6 ? 40 : 57} l4 -${12 + (i % 3) * 4} l4 ${12 + (i % 3) * 4}Z" fill="#1e100a"/>`).join('')}
    <rect x="182" y="44" width="22" height="16" rx="2" fill="url(#wcC)"/><rect x="186" y="36" width="5" height="8" fill="url(#wcC)"/><rect x="195" y="36" width="5" height="8" fill="url(#wcC)"/>
    <path class="sc-exflame" d="M188 36 q-6 -10 0 -22 q2 8 5 2 q4 9 -1 20Z" fill="#ff8a1a"/><path class="sc-exflame b" d="M197 36 q-6 -10 0 -20 q2 7 5 2 q4 8 -1 18Z" fill="#ffd060"/>
    <path d="M216 66 l12 3 l-12 3Z M216 76 l12 3 l-12 3Z" fill="url(#wcC)"/>
    <path d="M44 72 h-14 l-4 -6 M44 78 h-16" stroke="url(#wcC)" stroke-width="4" fill="none"/>
    <g class="sc-pole slow">${RIDER(86, 56, 1, 'point')}<path d="M92 38 L138 -12" stroke="#6a4a2a" stroke-width="3"/><path d="M134 -8 l10 -14 l4 6Z" fill="#2a1e18"/></g>
    ${TYRE(72, 80, 20, 'wcC')}${TYRE(194, 86, 14, 'wcC')}</svg>`;
  // A war boy on a spiked bike (drawn in the kit's flat colour and ink, the wheels turning), arms
  // up or a hand on the bars; facing right.
  const BIKE_WHEEL = (x) => `<g class="sc-tyre"><circle cx="${x}" cy="64" r="13" fill="#0c0a09" ${ink}/><path d="M${x - 9} 64 h18 M${x} 55 v18" stroke="#3a3430" stroke-width="2.4"/><circle cx="${x}" cy="64" r="4.5" fill="#c9d2d8" ${ink}/></g>`;
  const BIKER = (pose = 'ride') => `<svg viewBox="0 0 120 80" width="1em" height="0.667em" overflow="visible">
    ${BIKE_WHEEL(22)}${BIKE_WHEEL(98)}
    ${inked('M22 64 L44 46 H80 L98 64', '#2a1e18', 4)}${inked('M30 60 H66', '#c9d2d8', 3)}${inked('M76 46 L72 30 h5', '#2a1e18', 2.6)}
    ${[10, 17, 24].map((x) => `<path d="M${x} 50 l3 -7 l3 7Z" fill="#3a2a20" ${ink}/>`).join('')}<path d="M8 52 Q20 44 36 48 L34 54 H10Z" fill="#4a2a1a" ${ink}/>
    <path d="M50 38 Q64 30 80 38 L78 48 H52Z" fill="#8a3a1a" ${ink}/><path d="M56 37 Q64 34 72 37" stroke="#fff" stroke-width="1.4" opacity="0.4" fill="none"/>
    <path d="M38 44 H56 L54 50 H40Z" fill="#1a1210" ${ink}/><circle cx="84" cy="40" r="4" fill="#ffe08a" ${ink}/>
    ${figureAt(48, 69, 62, { ...WARBOY, pose, legs: ['sit', 'sit'] })}</svg>`;
  // The Doof Wagon: a truck with a wall of speakers, the drummers pounding at the back, and the
  // Doof Warrior in his red suit hanging on bungees out front, flames shooting out of his guitar
  // (from its head: DOOF_TIP, where the kit puts it, in the wagon's units).
  const DOOF_TIP = (() => { const s = 104 / 120; const [x, y] = figure.points(DOOFER).tip; return [278 + (x - 30) * s, 136 - (118 - y) * s]; })();
  const DOOF = `<svg viewBox="0 0 380 220" width="1em" height="0.579em" overflow="visible"><defs>${CHROME('dfC')}
    <radialGradient id="dfS"><stop offset="0" stop-color="#2a2624"/><stop offset="0.55" stop-color="#5a5452"/><stop offset="0.7" stop-color="#1a1615"/><stop offset="0.85" stop-color="#8a8480"/><stop offset="1" stop-color="#2a2624"/></radialGradient>
    <linearGradient id="dfF" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.3" stop-color="#ffb347"/><stop offset="0.7" stop-color="#ff5a1a"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></linearGradient></defs>
    ${KICK(-10, 50, 216, 'dfK')}
    <rect x="16" y="168" width="344" height="14" fill="#1a1210"/>
    <rect x="44" y="38" width="200" height="130" fill="#141010" stroke="#3a3030" stroke-width="3"/>
    <g class="sc-thump">${Array.from({ length: 12 }, (_, i) => `<circle cx="${70 + (i % 4) * 50}" cy="${62 + Math.floor(i / 4) * 42}" r="18" fill="url(#dfS)"/>`).join('')}</g>
    ${[60, 110, 160, 210].map((x) => `<circle cx="${x}" cy="160" r="2" fill="#ff3a2a"/>`).join('')}
    ${figureAt(10, 172, 72, { ...WARBOY, pose: 'drum', legs: ['stand', 'stand'], holding: 'sticks' })}
    <rect x="2" y="134" width="38" height="34" rx="4" fill="#8a3a1a" ${ink}/><ellipse cx="21" cy="134" rx="19" ry="5" fill="#e8d8b8" ${ink}/>
    <path d="M248 168 V12 H306" stroke="#2a2420" stroke-width="5" fill="none"/>
    <g class="sc-bungee"><path d="M272 12 V68 M286 12 V68" stroke="#8a7a6a" stroke-width="1.5"/>
      ${figureAt(278, 136, 104, DOOFER)}
      <g transform="translate(${DOOF_TIP.map((v, i) => n1(v - [322, 40][i])).join(' ')})"><path class="sc-flamejet" d="M320 40 Q300 0 322 -40 Q326 -14 336 -30 Q332 -70 352 -104 Q352 -60 362 -74 Q370 -20 334 42Z" fill="url(#dfF)"/><circle cx="322" cy="40" r="7" fill="#fff3b0"/></g></g>
    <path d="M304 168 V98 H340 L362 126 V168Z" fill="#2a2420"/><path d="M312 104 H338 L352 124 H312Z" fill="#6aa0a8" opacity="0.8"/>
    <path d="M362 132 l12 4 l-12 4Z M362 150 l12 4 l-12 4Z" fill="url(#dfC)"/>
    ${[60, 104, 300, 340].map((x) => TYRE(x, 196, 20, 'dfC')).join('')}</svg>`;
  // A war boy, painted white, mouth sprayed chrome, can in one hand and the other fist up.
  const WAR_BOY = figure({ ...WARBOY, pose: 'witness', holding: 'can' });
  const WAR_BOY_MOUTH = figure.points({ ...WARBOY, pose: 'witness' }).mouth;
  // The storm wall rolling in: billows piled up the sky, dark, their edges lit, lightning inside.
  const STORM_WALL = (() => {
    let s = '<rect x="0" y="0" width="760" height="900" fill="#2a100a"/>';
    for (let y = 40; y <= 900; y += 70) {
      const edge = 700 + Math.sin(y / 120) * 70;
      for (let x = 520 + Math.random() * 40; x < edge + 60; x += 70 + Math.random() * 40) {
        const r = 70 + Math.random() * 60;
        s += `<circle cx="${(x + r * 0.18).toFixed(0)}" cy="${(y - r * 0.15).toFixed(0)}" r="${r.toFixed(0)}" fill="${x > edge - 80 ? '#a04a22' : '#4a1e10'}"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" fill="${pick(['#2e1209', '#3a160c', '#341409'])}"/>`;
      }
    }
    for (let i = 0; i < 80; i++) s += `<circle cx="${(760 + Math.random() * 230).toFixed(0)}" cy="${(Math.random() * 900).toFixed(0)}" r="${(1.5 + Math.random() * 3).toFixed(1)}" fill="#d88a50" opacity="${(0.3 + Math.random() * 0.5).toFixed(2)}"/>`;
    s += `<g class="sc-bolt"><ellipse cx="420" cy="300" rx="340" ry="220" fill="#ffb0a0" opacity="0.25"/>
      <path d="M470 40 l-50 120 l56 -10 l-74 160 l40 -8 l-60 140 M408 310 l60 50" stroke="#fff4ec" stroke-width="6" fill="none"/></g>
      <g class="sc-bolt b"><ellipse cx="300" cy="620" rx="260" ry="160" fill="#ffb0a0" opacity="0.2"/><path d="M340 420 l-34 90 l40 -8 l-50 120" stroke="#fff4ec" stroke-width="4" fill="none"/></g>`;
    return `<svg viewBox="0 0 1000 900" preserveAspectRatio="xMaxYMax slice" width="100%" height="100%">${s}</svg>`;
  })();
  const BOLT = `<svg viewBox="0 0 100 200" width="1em" height="2em"><path d="M60 0 l-26 70 l30 -6 l-40 92 l20 -4 l-28 48" stroke="#fff4ec" stroke-width="4" fill="none"/><path d="M60 0 l-26 70 l30 -6 l-40 92" stroke="#ffb0a0" stroke-width="12" fill="none" opacity="0.3"/></svg>`;

  // Where a point of the background art (1600 x 900, scaled to cover the screen) is, in vw/vh.
  const artAt = (x, y) => {
    const s = Math.max(innerWidth / 1600, innerHeight / 900);
    return [((innerWidth - 1600 * s) / 2 + x * s) / innerWidth * 100, ((innerHeight - 900 * s) / 2 + y * s) / innerHeight * 100];
  };
  // A vehicle along the bottom of the screen, `h` vh tall, its wheels at `y` vh: off one side and
  // across to the other (`ar` is the drawing's width over its height).
  function drive(svg, { ar, h, y = 99, dur, right }) {
    const size = (h / 100) * innerHeight * ar;
    const w = (size / innerWidth) * 100;
    const d = drift(svg, { from: [right ? -w - 2 : 102, y - h], to: [right ? 102 : -w - 2, y - h], dur, size });
    d.classList.add('sc-veh', 'blk', right ? 'sc-face-r' : 'sc-face-l');
    return d;
  }
  const rig = (right, dur = 9) => drive(WAR_RIG, { ar: 3.6, h: 22, dur, right });
  const warCar = (right, dur = 6) => drive(WAR_CAR(pick(['#3a1c10', '#4a2a1a', '#2a1a14', '#5a2410'])), { ar: 2.3, h: rand(10, 13), y: rand(98, 100), dur, right });
  const doof = (right, dur = 11) => drive(DOOF, { ar: 1.727, h: 27, dur, right });
  // War boys on bikes, along the floor (a hand on the bars, or both arms up); eagles overhead.
  const BIKERS = [BIKER('ride'), BIKER('ride'), BIKER('cheer')];
  const bike = (dur) => crossing(pick(BIKERS), { y: rand(86, 90), dur, size: rand(84, 100), faces: 'right', bob: false, cls: ['sc-veh'] });
  const EAGLE = critter('eagle');
  // The whole convoy: the rig out front, war cars round it, the Doof Wagon, bikes at the back.
  function convoy() {
    const right = Math.random() < 0.5;
    cue('rumble');
    rig(right);
    later(() => warCar(right, 6.5), 1200);
    later(() => { warCar(right, 7); cue('vroom'); }, 2600);
    later(() => { doof(right); cue('drum'); cue('riff', 1200); }, 3600);
    for (let i = 0; i < 4; i++) later(() => bike(rand(4, 5)), 6000 + i * 350);
  }
  // A column of fire going up from the ground at x vw (and a flash of its light on everything).
  function fireColumn(x, { bottom = 4, h = 46, delay = 0 } = {}) {
    later(() => {
      el('<i></i>', { left: `${x}vw`, bottom: `${bottom}vh`, height: `${h}vh` }, 2800).classList.add('sc-firecol');
      el('', { inset: '0', '--x': `${x}vw`, '--y': `${100 - bottom - h / 3}vh` }, 1700).classList.add('sc-blastglow');
      burst(['●', '•', '▪'], { x, y: 100 - bottom - 6, n: 16, spread: 6, size: [5, 12], colors: ['#ffd23f', '#ff8a1a', '#ff4a1a', '#2a1208'], rise: [-40, -16], fall: [-10, 4] });
      for (let i = 0; i < 3; i++) later(() => drift('', { from: [x - 4, 100 - bottom - h * 0.8], to: [x - 6 + i * 3, 100 - bottom - h - 18], dur: 5, size: 10 }).classList.add('sc-plume', 'dark'), 500 + i * 300);
    }, delay);
    cue('boom', delay);
  }
  // A flare fired up from the right, hanging red over everything, and coming down.
  function flare() {
    const x = rand(66, 71);
    cue('bang');
    el('', { left: `${x}vw`, top: '96vh', '--fx': `${-rand(3, 8)}vw` }, 7200).classList.add('sc-flare');
    el('', { inset: '0', '--x': `${x - 8}vw` }, 7000).classList.add('sc-flareglow');
  }
  // Lightning in the storm on the horizon (the background's, top left), and thunder after.
  function stormFlash() {
    const [x, y] = artAt(250, 150);
    el(BOLT, { left: `${x - 3}vw`, top: `${Math.max(0, y - 4)}vh`, fontSize: `${rand(10, 16)}vh` }, 1400).classList.add('sc-stormbolt');
    el('', { left: '0', top: '0', width: `${artAt(760, 0)[0]}vw`, height: `${artAt(0, 600)[1]}vh` }, 1400).classList.add('sc-stormflash');
    cue('thunderFar', rand(600, 1400));
  }
  // The storm wall rolls in from the left (the whole screen for the final battle), lightning in it.
  function stormWall(big = false) {
    const life = big ? 14000 : 10000;
    el(STORM_WALL, { left: '0', top: '0', width: big ? '112vw' : '78vw', height: '100vh', '--life': `${life / 1000}s` }, life).classList.add('sc-stormwall');
    cue('wind');
    for (const t of big ? [2200, 4200, 6400, 9000] : [2600, 5200]) cue('thunder', t + 500);
  }
  // A war boy pops up at the left, sprays his mouth chrome, and: WITNESS ME!
  function witnessMe() {
    // (A figure is 1em tall and half as wide; the spray comes out of its mouth.)
    const h = 36;
    const size = (h / 100) * innerHeight;
    const w = ((size * 0.5) / innerWidth) * 100;
    popup(WAR_BOY, { x: 2, bottom: 0, size, life: 5200 });
    later(() => {
      burst(['•', '●', '✦'], { x: 2 + (w * WAR_BOY_MOUTH[0]) / 60, y: 100 - h + (h * WAR_BOY_MOUTH[1]) / 120, n: 22, spread: 4, size: [4, 10], colors: ['#ffffff', '#dfe5e8', '#9aa4ac', '#c9d2d8'], rise: [-10, -3], fall: [-4, 6] });
      cue('shaker');
    }, 1000);
    later(() => { wasteShout('WITNESS ME!'); cue('cheer'); }, 1900);
    later(() => fireColumn(2 + w / 2, { h: 50 }), 3600);
  }
  // A war car hits a mine as it comes in from the left: up it goes, a tyre flying.
  function mine() {
    const d = warCar(true, 5);
    // It goes from -w - 2 to 102 (vw) in 5s: when is its middle at `at`?
    const dx = parseFloat(d.style.getPropertyValue('--dx'));
    const w = dx - 104;
    const at = rand(8, 14);
    const t = ((at + 2 + w / 2) / dx) * 5000;
    later(() => {
      d.remove();
      fireColumn(at, { h: 52 });
      burst(['▪', '■', '▲'], { x: at, y: 88, n: 14, spread: 10, size: [8, 18], colors: ['#2a1208', '#4a2a1a', '#8a8480'], rise: [-36, -14], fall: [10, 20] });
      drift('🛞', { from: [at, 86], to: [at + rand(20, 34), 104], dur: 2.4, size: 44, spin: 900, extra: { animationTimingFunction: 'cubic-bezier(0.3, -0.6, 0.7, 1)' } });
    }, Math.max(300, t));
  }
  // Big words over the table, chrome and fire.
  function wasteShout(big, small = '', life = 3400) {
    const d = inFront(`<b>${big}</b>${small ? `<small>${small}</small>` : ''}`, { left: '0', right: '26vw', top: '24vh', '--life': `${(life - 200) / 1000}s` }, life);
    d.classList.add('sc-waste');
    return d;
  }
  // The oil drums in the background burning (see wasteland() in lib/roomArt.js).
  function drumFires() {
    [[115, 740, 1], [1508, 756, 1.1], [837, 792, 0.7]].forEach(([x, y, s], i) => {
      const [vx, vy] = artAt(x, y);
      el('<i></i><i></i>', { left: `${vx}vw`, top: `${vy}vh`, '--s': s, animationDelay: `-${i * 0.4}s` }).classList.add('sc-drumfire');
    });
  }

  let wl = null;
  const nameOf = (s, id, upper = false) => { const n = String(s.players?.find((p) => p.id === id)?.name || 'Someone'); return esc(upper ? n.toUpperCase() : n); };
  SCENES.garageWasteland = {
    gap: [10, 22],
    decor() {
      wl = null;
      el('', { left: '0', top: '0', width: '100vw', height: '100vh' }).classList.add('sc-dust');
      el('', { left: '0', bottom: '0', width: '200vw', height: '30vh' }).classList.add('sc-sandblow');
      drumFires();
      // It begins: fire either side, WITNESS ME, the welcome, and the convoy roaring across.
      fireColumn(6, { h: 54 });
      fireColumn(68, { h: 44, delay: 450 });
      later(() => { wasteShout('WITNESS ME!', '', 2400); burst(['•', '●', '✦'], { x: 37, y: 34, n: 30, spread: 30, size: [4, 10], colors: ['#ffffff', '#dfe5e8', '#9aa4ac'] }); }, 200);
      later(() => banner('Welcome to the Wasteland', 'Fuel’s low. Drinks are lower.', 'waste'), 2600);
      cue('riff', 400);
      later(convoy, 1800);
    },
    // The game's big moments (Mad Max's view: games/madMax.js).
    update(s) {
      const g = s?.gameType === 'madMax' ? s.game : null;
      if (!g) return;
      const w = g.war;
      const now = { no: s.gameNo, war: w ? `${w.challengedId}>${w.challengers.join(',')}${w.final ? '!' : ''}` : null, warWon: w?.winnerId || null, winner: g.winnerId || null, counts: w ? wl?.counts || {} : g.counts || {} };
      const was = wl;
      wl = now;
      // The first look at a game (the TV just turned on, or a new game): nothing to react to yet.
      if (!was || was.no !== now.no) return;
      if (now.winner && now.winner !== was.winner) {
        wasteShout(`WITNESS ${nameOf(s, now.winner, true)}!`, 'Last one holding cards', 5000);
        [4, 20, 52, 68].forEach((x, i) => fireColumn(x, { h: 50, delay: i * 350 }));
        later(flare, 1600);
        later(convoy, 2400);
        cue('cheer', 300); cue('riff', 900);
        return;
      }
      if (now.war && now.war !== was.war) {
        const names = [w.challengedId, ...w.challengers].map((id) => nameOf(s, id)).join(' vs ');
        if (w.final) {
          wasteShout('FINAL BATTLE', `${names} · winner takes all`, 4200);
          stormWall(true);
          later(() => doof(Math.random() < 0.5), 1500);
          [6, 66].forEach((x, i) => fireColumn(x, { h: 52, delay: 600 + i * 400 }));
          cue('riff', 1200);
        } else {
          wasteShout('WAR!', names);
          stormWall();
          cue('drum', 300);
        }
      } else if (now.warWon && now.warWon !== was.warWon && !now.winner) {
        later(() => { wasteShout(`${nameOf(s, now.warWon, true)} WINS THE WAR`, '', 2800); fireColumn(rand(4, 10), { h: 44 }); cue('cheer'); }, 600);
      }
      // Out of cards (counted only between wars: in one, cards are laid out of hands for a while).
      if (!w) {
        const out = Object.keys(now.counts).filter((id) => now.counts[id] === 0 && was.counts[id] > 0 && id !== now.winner);
        out.forEach((id, i) => later(() => {
          wasteShout('VALHALLA!', `${nameOf(s, id)} is out of cards`, 3200);
          fireColumn(rand(4, 10), { h: 48 });
          later(() => fireColumn(rand(62, 70), { h: 40 }), 500);
        }, 900 + i * 3600));
      }
    },
    moments: [
      convoy,
      () => { doof(Math.random() < 0.5); cue('drum'); cue('riff', 1500); },
      mine,
      () => { stormWall(); later(stormFlash, 3000); },
      witnessMe,
      flare,
      stormFlash,
      () => { for (let i = 0; i < 3; i++) drift(EAGLE, { from: [-10, rand(4, 14)], to: [110, rand(4, 16)], dur: rand(14, 18), size: rand(72, 88), extra: { animationDelay: `${i * 1.2}s` } }); },
      () => { for (let i = 0; i < pick([4, 5, 6]); i++) later(() => bike(rand(3, 4)), i * 280); cue('vroom'); },
      () => { [4, 12, 64, 70].forEach((x, i) => fireColumn(x, { h: rand(36, 52), delay: i * 260 })); },
      () => { warCar(Math.random() < 0.5); later(() => warCar(Math.random() < 0.5), 1500); cue('vroom'); },
    ],
  };

  // ---------- The regular venues that react to any game ----------
  // Watches the room for drinks: `sip` with everyone who just drank ([{ p, n }], at most every few
  // seconds), `finish` for each player told to finish their drink, `over` when a game's won. Nothing
  // on the first look (the TV just came on), nor when a new game starts.
  function vvWatch(on, every = 5000) {
    let was = null;
    let quiet = 0;
    const w = (s) => {
      if (!s?.players) return;
      const now = { no: s.gameNo, phase: s.phase, fin: {}, sips: {} };
      for (const p of s.players) { now.fin[p.id] = p.finished || 0; now.sips[p.id] = p.total || 0; }
      const before = was;
      was = now;
      if (!before || before.no !== now.no) return;
      if (now.phase === 'over' && before.phase !== 'over') return on.over?.(s);
      const finished = s.players.filter((p) => now.fin[p.id] > (before.fin[p.id] ?? now.fin[p.id]));
      finished.forEach((p, i) => later(() => on.finish?.(p, s), i * 3200));
      const sipped = s.players.filter((p) => !finished.includes(p) && now.sips[p.id] > (before.sips[p.id] ?? now.sips[p.id])).map((p) => ({ p, n: now.sips[p.id] - before.sips[p.id] }));
      if (sipped.length && !finished.length && Date.now() > quiet) { quiet = Date.now() + every; on.sip?.(sipped, s); }
    };
    w.reset = () => { was = null; quiet = 0; };
    return w;
  }
  const vvName = (p) => esc(String(p?.name || 'Someone').toUpperCase());
  // A drawn person `vh` tall walking across the floor (drawings face right).
  const vvWalk = (svg, { vh = 20, dur = 10, bottom = 1, cls = [] } = {}) => crossing(svg, { y: 100 - bottom - vh, dur, size: (vh / 100) * innerHeight, faces: 'right', cls });

  // The frat house (see fratHouse() in lib/roomArt.js). Always: the string lights twinkling,
  // party lights wandering over the walls, the neon buzzing, and the brother on the couch snoring.
  // Now and then: a keg stand (the room counts), someone crowd-surfs across, a toga party, the
  // pledge with a tower of pizzas (which goes over), a mattress down the stairs, campus security's
  // lights in the window (everyone scatters), the breaker going, a trick shot into the cups, CHUG.
  // Any game: whoever has to finish their drink gets chanted at, sips get a cup raised, and a win
  // gets BOOL! BOOL! BOOL!
  const RED_CUP = `<svg viewBox="0 0 40 46" width="0.87em" height="1em"><path d="M4 4 h32 l-5 40 h-22Z" fill="#d62828"/><rect x="4" y="4" width="32" height="6" fill="#f4f4f4"/><path d="M8 18 h24 M9 26 h22" stroke="#b01e1e" stroke-width="1.5"/></svg>`;
  // A brother walking (facing right), cup in hand: shorts, sneakers, a cap (or none: his hair).
  const FH_BRO = (shirt = '#2a6fdb', cap = '#c0392b', skin = '#e2b48a') => figure({ skin, hair: 'short', hairColor: 'brown', hat: cap ? 'cap' : '', hatColor: cap, top: shirt, sleeves: 'short', bottom: '#b89a6a', bottomStyle: 'shorts', shoes: '#f4f4f4', pose: 'walk', holding: 'redcup' });
  // A toga, a laurel wreath, a cup held high.
  const FH_TOGA = (skin = '#f0c8a0') => figure({ skin, hair: 'short', hairColor: 'brown', hat: 'laurel', top: '#f4f1ea', topStyle: 'toga', accent: '#d2cbbb', sleeves: 'none', bottom: '#f4f1ea', bottomStyle: 'skirt', shoes: '#7a4a1a', pose: 'toast', holding: 'redcup', cls: 'fg-walk' });
  // The pledge, a tower of pizza boxes in his arms (it sways; when it goes, `.dropped` hides it).
  const FH_PLEDGE = figure({ skin: '#c99068', hair: 'curly', hairColor: 'black', top: '#8e1b1b', bottom: '#3a4a6a', shoes: '#2a2a2a', face: 'flat', pose: 'carry', arms: ['carry', 'carry'], holding: 'pizzas', cls: 'fg-walk' });
  // A keg stand: one upside down on the keg, legs kicking, two holding him up by the ankles.
  // (The one on the keg is a kit figure turned upside down, about (75, 109): his head on the tap,
  // his hands on the keg, his legs kicking (fh-kick); the two either side hold his legs up.)
  const FH_KEGSTAND = `<svg viewBox="0 0 150 200" width="0.75em" height="1em" overflow="visible">
    <rect x="52" y="150" width="46" height="50" rx="7" fill="#b8c0c8" ${ink}/><path d="M52 162 h46 M52 188 h46" stroke="#7a828a" stroke-width="3"/><rect x="57" y="152" width="6" height="46" fill="#fff" opacity="0.4"/>
    <rect x="70" y="140" width="10" height="12" fill="#2a2a2a" ${ink}/>
    <g transform="rotate(180 75 109)">${figureAt(75, 166, 110, { skin: '#e2b48a', hair: 'short', hairColor: 'brown', face: 'grin', top: '#d62828', sleeves: 'short', bottom: '#3a4a6a', shoes: '#f4f4f4', arms: ['upBack', 'up'], legs: [[-14, 10], [14, -10]], hooks: { legB: 'fh-kick', legF: 'fh-kick' } })}</g>
    ${figureAt(48, 198, 120, { skin: '#c99068', hair: 'short', hairColor: 'black', hat: 'cap', hatColor: '#2a6a3a', top: '#2a6fdb', bottom: '#b89a6a', bottomStyle: 'shorts', shoes: '#f4f4f4', face: 'grin', arms: [[150, 0], [140, 6]], legs: ['wide', 'wide'] })}
    ${figureAt(102, 198, 120, { skin: '#f0c8a0', hair: 'short', hairColor: 'auburn', hat: 'cap', hatColor: '#c0392b', top: '#7a3a8a', bottom: '#3a4a6a', shoes: '#2a2a2a', face: 'shout', arms: [[150, 0], [140, 6]], legs: ['wide', 'wide'], flip: true })}</svg>`;
  // Someone crowd-surfing, on a sea of hands.
  // (A kit figure lying on his back, head to the right: turned round and laid down about his head.)
  const FH_SURF = `<svg viewBox="0 0 240 110" width="1em" height="0.46em" overflow="visible"><g class="fh-surf"><g transform="rotate(90 190 40)">${figureAt(190, 188, 185, { skin: '#e2b48a', hair: 'short', hairColor: 'brown', face: 'grin', top: '#2a6fdb', sleeves: 'short', bottom: '#b89a6a', bottomStyle: 'shorts', shoes: '#f4f4f4', arms: [[60, 20], [120, 20]], legs: [[6, -4], [-6, 4]], holding: 'redcup', flip: true })}</g></g>
    ${[20, 46, 72, 98, 124, 150, 176, 202, 228].map((x, i) => `<g class="sc-hand" style="animation-delay:-${(i * 0.13).toFixed(2)}s">${inked(`M${x + (i % 2 ? 3 : -3)} 130 L${x} ${62 + (i % 3) * 6}`, '#1a1008', 11)}<circle cx="${x}" cy="${58 + (i % 3) * 6}" r="7.5" fill="#1a1008" ${ink}/></g>`).join('')}</svg>`;
  // Someone riding a mattress down the stairs, arms up, yelling.
  const FH_MATTRESS = `<svg viewBox="0 0 120 70" width="1em" height="0.58em" overflow="visible"><rect x="4" y="40" width="112" height="22" rx="8" fill="#e8e4f0" stroke="#a8a0c0" stroke-width="3"/><path d="M20 44 v14 M40 44 v14 M60 44 v14 M80 44 v14 M100 44 v14" stroke="#c8c0d8" stroke-width="2"/>${figureAt(52, 70, 64, { skin: '#e2b48a', hair: 'short', hairColor: 'blonde', face: 'shout', top: '#7bd88f', sleeves: 'short', bottom: '#3a4a6a', shoes: '#f4f4f4', arms: ['upBack', 'up'], legs: [[84, -8], [80, -4]] })}</svg>`;
  const fhOn = () => current === 'frat';
  const fhAt = (x, y) => (fhOn() ? artAt(x, y) : null);
  function fhChant(words, { x = [3, 16], bottom = [10, 22], n = 3, every = 650 } = {}) {
    cue('chant');
    for (let i = 0; i < n; i++) later(() => inFront(`<b>${words}</b>`, { left: `${rand(...x)}vw`, bottom: `${rand(...bottom)}vh` }, 1300).classList.add('sc-sign-up', 'oi'), i * every);
  }
  // Along the bottom, the hands just showing.
  const fhSurf = () => el(FH_SURF, { left: '0', top: '78vh', fontSize: `${(0.22 * innerHeight) / 0.46}px`, animation: 'fh-surfpass 9s linear forwards' }, 9200).classList.add('blk');
  function fhKegstand(name = '') {
    const d = popup(FH_KEGSTAND, { x: 8, bottom: -1, size: 0.3 * innerHeight, life: 7000 });
    cue('cheer', 400);
    [1, 2, 3, 4, 5].forEach((n, i) => later(() => inFront(`<b>${n}!</b>`, { left: `${rand(10, 16)}vw`, bottom: '36vh' }, 1100).classList.add('sc-sign-up', 'oi'), 1200 + i * 850));
    later(() => { inFront(`<b>${name ? `${name}!` : 'LEGEND!'}</b>`, { left: '0', right: '26vw', top: '26vh' }, 2600).classList.add('sc-oneeighty', 'ton', 'fh'); cue('airhorn'); cue('cheer', 200); }, 5600);
    return d;
  }
  function fhPizzas() {
    const dur = 11;
    const d = vvWalk(FH_PLEDGE, { vh: 26, dur });
    const right = d.classList.contains('flip') ? false : true;
    const at = rand(0.3, 0.55);
    later(() => {
      d.classList.add('dropped');
      const x = right ? -10 + 118 * at : 108 - 118 * at;
      burst(['🍕', '🍕', '📦'], { x: x + 2, y: 80, n: 10, spread: 8, size: [26, 40], rise: [-20, -8], fall: [14, 22] });
      cue('crash');
      later(() => cue('aww'), 400);
    }, dur * 1000 * at);
  }
  function fhCops() {
    const p = fhAt(1012, 110);
    const q = fhAt(1156, 194);
    if (p) el('', { left: `${p[0]}vw`, top: `${p[1]}vh`, width: `${q[0] - p[0]}vw`, height: `${q[1] - p[1]}vh` }, 5200).classList.add('fh-cops');
    el('', { inset: '0' }, 5200).classList.add('fh-copglow');
    cue('siren');
    later(() => { inFront('<b>COPS!</b>', { left: '0', right: '26vw', top: '26vh' }, 2200).classList.add('sc-oneeighty', 'ton', 'fh'); cue('aww'); }, 1200);
    for (let i = 0; i < 5; i++) later(() => vvWalk(FH_BRO(pick(['#2a6fdb', '#8e1b1b', '#2a6a3a', '#f4f4f4']), pick(['#c0392b', '#1b3f8e', null])), { vh: rand(18, 22), dur: rand(2.2, 3), cls: ['fh-run'] }), 1800 + i * 300);
  }
  function fhMattress() {
    const a = fhAt(30, 236);
    const b = fhAt(470, 770);
    if (!a) return fhChant('CHUG!');
    drift(FH_MATTRESS, { from: [a[0] - 4, a[1] - 6], to: [b[0], b[1] - 8], dur: 2.2, size: 0.16 * innerHeight, spin: 0, extra: { rotate: '44deg', animationTimingFunction: 'ease-in' } }).classList.add('blk');
    later(() => { cue('thud'); cue('cheer', 300); }, 2100);
  }
  const fhWatch = vvWatch({
    finish: (p) => { fhChant('CHUG!', { n: 4 }); later(() => { inFront(`<b>${vvName(p)} CHUGS!</b>`, { left: '0', right: '26vw', top: '26vh' }, 2800).classList.add('sc-oneeighty', 'ton', 'fh'); burst(['🥤', '🎉', '✨'], { x: 6, y: 80, n: 14, spread: 10, size: [20, 28] }); cue('cheer'); }, 2600); },
    sip: (list) => { popup(FH_BRO(pick(['#2a6fdb', '#8e1b1b', '#2a6a3a']), pick(['#c0392b', null])), { x: rand(2, 6), bottom: 0, size: 0.2 * innerHeight, life: 3600 }); cue('pop', 600); if (list.length > 2) fhChant('DRINK!', { n: 2 }); },
    over: () => { fhChant('BOOL!', { n: 5, every: 520 }); fall(['🎉', '🥤', '🍕'], 5, 0.2, 0.9); later(fhSurf, 1600); cue('airhorn', 2800); cue('cheer', 3000); },
  });
  SCENES.frat = {
    decor() {
      fhWatch.reset();
      for (let i = 0; i < 3; i++) el(RED_CUP, { left: `${2 + i * 2.6}vw`, bottom: '3vh', fontSize: '46px' }).classList.add('blk');
      el(RED_CUP, { left: '3.3vw', bottom: 'calc(3vh + 40px)', fontSize: '46px' }).classList.add('blk');
      // Party lights wandering over the walls.
      ['#ff2bd6', '#29f0ff', '#ffd23f', '#7bd88f'].forEach((c, i) => el('', { left: `${[4, 40, 70, 88][i]}vw`, top: `${[30, 8, 14, 60][i]}vh`, '--c': c, animationDelay: `-${i * 3.1}s`, animationDuration: `${11 + i * 2}s` }).classList.add('fh-spot'));
      if (!fhOn()) return;
      // The string lights twinkling (the ones along the top, see fratHouse()), the neon, the snorer.
      for (let i = 0; i < 32; i++) {
        const x = 25 + i * 50;
        const [vx, vy] = artAt(x, 108 + 27 * Math.sin(((x % 400) / 400) * Math.PI));
        el('', { left: `${vx}vw`, top: `${vy}vh`, '--c': ['#ffd23f', '#ff4d6d', '#3de0ff', '#7bd88f'][i % 4], animationDelay: `-${(Math.random() * 3).toFixed(2)}s`, animationDuration: `${(1.4 + Math.random() * 2).toFixed(2)}s` }).classList.add('fh-twinkle');
      }
      const [nx, ny] = artAt(1350, 653);
      el('', { left: `${nx}vw`, top: `${ny}vh` }).classList.add('fh-neon');
      const [zx, zy] = artAt(70, 640);
      el('<b>z</b><b>z</b><b>Z</b>', { left: `${zx}vw`, top: `${zy}vh` }).classList.add('fh-zz');
    },
    update: fhWatch,
    moments: [
      () => { toss('⚪', { x: 30, y: 82, size: 18, height: 30, spins: 0, delay: 0 }); later(() => { burst(['💦'], { x: 4, y: 88, n: 6, spread: 3, size: [14, 20] }); cue('splash'); cue('cheer', 300); }, 1100); },
      () => fhChant('CHUG!'),
      () => drift('🍕', { from: [-8, 70], to: [108, 40], dur: 2.4, size: 54, spin: 720 }),
      () => { fhSurf(); cue('cheer', 1500); },
      () => { vvWalk(FH_TOGA(), { vh: 22, dur: 12 }); later(() => vvWalk(FH_TOGA('#c99068'), { vh: 21, dur: 12.5 }), 1400); later(() => fhChant('TOGA!', { n: 2 }), 2400); },
      () => { burst(['🥤', '🎉', '✨'], { x: 6, y: 80, n: 14, spread: 10, size: [20, 28] }); cue('pop'); },
      () => { el('', { inset: '0' }, 1300).classList.add('fh-breaker'); cue('clank'); later(() => cue('aww'), 200); },
      () => fhKegstand(),
      fhPizzas,
      fhCops,
      fhMattress,
      () => { const bro = FH_BRO(pick(['#2a6fdb', '#f4f4f4', '#2a6a3a']), pick(['#c0392b', '#1b3f8e'])); vvWalk(bro, { vh: 21, dur: 9 }); later(() => vvWalk(FH_BRO('#8e1b1b', null, '#c99068'), { vh: 22, dur: 9.4 }), 700); },
    ],
  };

  // Noir: rain running down the window, the neon sign stuttering, headlights sweeping through the
  // blinds, a siren going by, a silhouette at the door, smoke curling up. On every hit a press
  // camera's flash bulb pops and the red neon floods the room.
  let lastNoirRoll = null;
  // The man at the door: a silhouette in a fedora and a trench coat (turned black by sc-silhouette).
  const NOIR_MAN = (() => { const C = '#16161a'; return figure({ skin: C, hair: 'short', hairColor: C, hat: 'fedora', hatColor: C, hatAccent: C, top: C, topStyle: 'suit', accent: C, bottom: C, bottomStyle: 'skirt', shoes: C, face: 'none', build: 'broad', facing: 'front' }); })();
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
      later(() => banner('This is serious business', '', 'noir'), 900);
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
      () => { const s = el(NOIR_MAN, { left: '2vw', bottom: '20vh', fontSize: '150px' }, 6000); s.classList.add('sc-silhouette'); },
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
      () => drift(critter('flamingo'), { from: [-8, rand(20, 30)], to: [108, rand(16, 28)], dur: 12, size: 80 }),
      () => { const x = rand(20, 70); el(critter('fish'), { left: `${x}vw`, top: '62vh', fontSize: '50px' }, 2000).classList.add('sc-dolphin'); cue('splash', 900); },
      () => notes(4, 80, '#e8b84a'),
      () => crossing('🎩', { y: 92, dur: 10, size: 50 }),
    ],
  };

  // The mead hall (saved for an easter egg). Embers fly up from the fire pit, ravens wheel through
  // the smoke, a horn sounds; on every hit the hall pounds the tables and roars SKÅL!
  let lastRoll = null;
  // Who's in the hall: ravens, the hall's hound, a Viking with his shield and his horn of mead.
  const MH_RAVEN = critter('raven');
  const MH_DOG = critter('dog', { color: '#7a7068' });
  const VIKING = figure({ skin: 'pale', hair: 'long', hairColor: 'red', beard: 'beard', hat: 'viking', top: '#6a4a2a', accent: '#3a2a1a', belt: '#3a2414', bottom: '#4a3a2a', shoes: '#2a1a10', pose: 'walk', holding: 'horn', holdingBack: 'shield', build: 'broad' });
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
      () => { for (let i = 0; i < pick([1, 2, 3]); i++) drift(MH_RAVEN, { from: [-8, rand(6, 20)], to: [108, rand(4, 22)], dur: rand(9, 13), size: rand(56, 76), extra: { animationDelay: `${i * 0.8}s` } }); },
      () => { cue('lur'); popup('📯', { x: 2, bottom: 20, size: 60, life: 4000 }); },
      pound,
      () => crossing(MH_DOG, { y: 91, dur: 9, size: 84, faces: 'right', bob: false }),
      () => vvWalk(VIKING, { vh: 24, dur: 11 }),
    ],
  };

  // Quarters in the diner: the roller rink. Skaters go round, a couples skate, someone wipes out,
  // the disco ball throws spots everywhere; every quarter in gets the crowd.
  // Dancing to the diner's jukebox, skating round the rink, at Oktoberfest: a couple, one kit
  // figure each, facing each other.
  const COUPLE = (her, him) => `<svg viewBox="0 0 110 120" width="0.917em" height="1em" overflow="visible">${figureAt(32, 118, 120, { pose: 'dance', ...her })}${figureAt(78, 118, 120, { pose: 'dance', flip: true, ...him })}</svg>`;
  const DINER_HER = { skin: 'pale', hair: 'ponytail', hairColor: 'blonde', top: '#fff', sleeves: 'short', bottom: '#ff7ab0', bottomStyle: 'skirt', shoes: '#fff' };
  const DINER_HIM = { skin: 'tan', hair: 'quiff', hairColor: 'black', top: '#fff', sleeves: 'short', bottom: '#2a4a7a', shoes: '#1a1a1a' };
  // A skater gliding past (the legs push off: dn-leg, in a .dn-skater).
  const SKATER = (i = 0, o = {}) => figure({ skin: skinFor(i), hair: ['ponytail', 'curly', 'bob', 'short', 'long'][i % 5], hairColor: ['brown', 'black', 'blonde', 'auburn', 'black'][i % 5], top: ['#29f0ff', '#ff2bd6', '#ffd23f', '#7dff9e', '#fff'][i % 5], sleeves: 'short', bottom: ['#2a4a7a', '#1a1a2a', '#ff7ab0', '#3a2a5a', '#e63946'][i % 5], bottomStyle: i % 2 ? 'trousers' : 'shorts', shoes: '#fff', skates: ['#ff2bd6', '#29f0ff', '#ffd23f'][i % 3], pose: 'walkA', lean: 8, hooks: { legB: 'dn-leg b', legF: 'dn-leg' }, ...o });
  const RINK_COUPLE = COUPLE({ ...DINER_HER, skates: '#29f0ff', bottom: '#9b5cff' }, { ...DINER_HIM, skates: '#ff2bd6' });
  // Someone losing it: arms flailing, leaning back.
  const WIPEOUT = SKATER(3, { arms: ['upBack', 'up'], legs: [[40, -10], [-30, 10]], lean: -18, face: 'shout', cls: 'fg-cheer' });
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
      () => { for (let i = 0; i < pick([3, 4, 5]); i++) later(() => vvWalk(SKATER(i + Math.floor(rand(0, 5))), { vh: rand(17, 23), bottom: rand(0, 4), dur: rand(5, 8), cls: ['dn-skater'] }), i * 600); },
      () => { vvWalk(RINK_COUPLE, { vh: 22, dur: 9, cls: ['dn-skater'] }); },
      () => { vvWalk(WIPEOUT, { vh: 21, dur: 4, cls: ['dn-skater'] }); later(() => { popup('💫', { x: rand(20, 60), bottom: 6, size: 50, life: 1600 }); cue('thud'); }, 2000); },
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

  // The mechanic's garage (see garage() in lib/roomArt.js). Always: the OPEN sign, the radio's
  // dial glowing, one fluorescent tube on the blink, oil dripping off the car into the pan, dust
  // turning in the sunlight by the door. Now and then: the mechanic wanders through with his wrench,
  // the welder lowers his mask and sparks fly, someone rolls out from under on a creeper, a customer
  // pulls up in his pickup and leans on the horn, a tyre gets away, the shop cat, the radio turned up,
  // the impact wrench. Any game: finishing a drink is a PIT STOP, sips get a beer raised, a win the
  // checkered flag and a hot rod tearing past.
  // (All the kit's: the mechanic in his overalls and cap, a wrench or a beer; the welder in his
  // mask with the torch, its tip where the sparks fly from; the one on the creeper is a figure
  // turned on his back.)
  const GR_LOOK = { skin: 'tan', beard: 'stubble', hairColor: 'brown', hat: 'cap', hatColor: '#c0392b', belt: '#1a2a4a', shoes: '#1a1a1a' };
  const GR_MECH = (hand = 'wrench', suit = '#2a4a7a') => figure({ ...GR_LOOK, top: suit, bottom: suit, pose: 'walk', holding: hand === 'wrench' ? 'wrench' : 'bottle' });
  const GR_WELD = { skin: 'light', hat: 'weldmask', top: '#5a4a3a', topStyle: 'apron', accent: '#7a5a3a', bottom: '#4a3a2a', shoes: '#1a1a1a', holding: 'blowtorch', arms: ['hold', [60, 30]] };
  const GR_WELDER = figure(GR_WELD);
  const GR_CREEPER = `<svg viewBox="0 0 150 40" width="1em" height="0.27em" overflow="visible"><g transform="translate(12 12) rotate(90)">${figureAt(0, 0, 100, { ...GR_LOOK, top: '#2a4a7a', bottom: '#2a4a7a', arms: ['down', 'point'], holding: 'wrench', flip: true })}</g>
    <rect x="10" y="22" width="120" height="8" rx="3" fill="#2a3038" stroke="${INK}" stroke-width="${LW}"/><circle cx="20" cy="34" r="5" fill="#111"/><circle cx="120" cy="34" r="5" fill="#111"/></svg>`;
  // A customer's '56 pickup (facing right), arm out of the window.
  const GR_PICKUP = (body = '#3aa0a0') => `<svg viewBox="0 0 260 110" width="1em" height="0.42em" overflow="visible"><defs>${CHROME('grP')}</defs>
    <path d="M10 44 H128 V86 H10Z" fill="${body}"/><rect x="10" y="40" width="118" height="6" fill="#2a2a2a" opacity="0.3"/>
    <path d="M122 86 V30 Q124 14 140 14 H176 Q186 14 190 30 L196 44 H232 Q252 46 254 64 V86Z" fill="${body}"/>
    <path d="M136 42 V26 Q138 20 146 20 H172 Q180 20 182 28 L186 42Z" fill="#bfe4f0"/><path d="M144 40 l14 -16" stroke="#fff" stroke-width="4" opacity="0.5"/>
    <path d="M130 50 H254 M70 50 V84" stroke="#000" stroke-width="2" opacity="0.2"/><path d="M8 82 H256 V92 H8Z" fill="url(#grP)"/><rect x="246" y="56" width="10" height="12" rx="4" fill="#fff8d0"/>
    <clipPath id="grWin"><path d="M136 42 V26 Q138 20 146 20 H172 Q180 20 182 28 L186 42Z"/></clipPath><g clip-path="url(#grWin)">${figureAt(159.3, 99.8, 87, { skin: 'brown', hair: 'short', hairColor: 'black', top: '#e8e0d0', sleeves: 'short', crop: 'waist' })}</g>
    ${inked('M158 44 Q150 54 162 56 L176 52', '#c68c60', 5)}<circle cx="177" cy="52" r="3.4" fill="#c68c60" stroke="${INK}" stroke-width="${LW}"/>
    ${TYRE(58, 90, 20, 'grP')}${TYRE(210, 90, 20, 'grP')}</svg>`;
  const GR_FLAG = `<svg viewBox="0 0 90 70" width="1em" height="0.78em"><rect x="0" y="0" width="3" height="70" fill="#5a4a3a"/>
    <g class="sc-flag">${Array.from({ length: 24 }, (_, i) => `<rect x="${3 + (i % 6) * 14}" y="${2 + Math.floor(i / 6) * 10}" width="14" height="10" fill="${(i + Math.floor(i / 6)) % 2 ? '#111' : '#f4f4f4'}"/>`).join('')}</g></svg>`;
  const grOn = () => current === 'garage';
  function grWeld() {
    const size = 0.3 * innerHeight;
    popup(GR_WELDER, { x: 1, bottom: 0, size, life: 6000 });
    // (The sparks fly from the torch's tip: where it is in the figure's 60 x 120 box.)
    const [tx, ty] = figure.points(GR_WELD).tip;
    const sx = 1 + (((tx / 120) * size) / innerWidth) * 100;
    const sy = 100 - ((120 - ty) / 120) * 30;
    for (let i = 0; i < 5; i++) later(() => { burst(['✦', '•', '✧', '•'], { x: sx, y: sy, n: 18, spread: 6, size: [5, 11], colors: ['#ffd23f', '#ff9a2a', '#ffffff', '#9ad0ff'], rise: [-14, -2], fall: [8, 24] }); el('', { inset: '0', '--x': `${sx}vw`, '--y': `${sy}vh` }, 600).classList.add('gr-arc'); }, 1300 + i * 650);
    cue('weld', 1300);
  }
  function grCreeper() {
    const size = (0.08 * innerHeight) / 0.27;
    el(GR_CREEPER, { left: `-${((size / innerWidth) * 100).toFixed(1)}vw`, bottom: '1vh', fontSize: `${size}px`, '--dx': `${(((size / innerWidth) * 100) + 3).toFixed(1)}vw` }, 7000).classList.add('gr-creeper', 'blk');
    later(() => cue('wrench'), 2400);
  }
  function grPickup(fast = false) {
    const right = Math.random() < 0.5;
    const d = drive(GR_PICKUP(pick(['#3aa0a0', '#c0392b', '#e8b84a', '#7a9ac0'])), { ar: 2.36, h: fast ? 12 : 14, dur: fast ? 2.2 : 9, right });
    if (!fast) later(() => { cue('beep'); inFront('<b>BEEP BEEP!</b>', { left: right ? '30vw' : '50vw', bottom: '16vh' }, 1300).classList.add('sc-sign-up', 'oi'); }, 3600);
    return d;
  }
  const grWatch = vvWatch({
    finish: (p) => {
      inFront(`<b>PIT STOP!</b><small>${esc(p.name)} finishes the lot</small>`, { left: '0', right: '26vw', top: '24vh' }, 3000).classList.add('sc-oneeighty', 'ton', 'gr');
      crossing('🛞', { y: 92, dur: 3, size: 54, cls: ['roll'], bob: false });
      burst(['⚙', '•', '⚙'], { x: 4, y: 84, n: 14, spread: 8, size: [10, 18], colors: ['#c8d0d8', '#8a939e'], rise: [-24, -10], fall: [10, 20] });
      cue('wrench'); cue('cheer', 500);
    },
    sip: () => { popup(GR_MECH('beer'), { x: rand(2, 5), bottom: 0, size: 0.22 * innerHeight, life: 3800 }); cue('clink', 900); },
    over: () => {
      el(GR_FLAG, { left: '2vw', top: '27vh', fontSize: '120px' }, 7000).classList.add('sc-jolly', 'gr-flagwave');
      later(() => { grPickup(true); cue('vroom'); }, 800);
      later(() => { cue('brakes'); cue('cheer', 400); }, 2600);
    },
  });
  SCENES.garage = {
    decor() {
      grWatch.reset();
      el('<span>OPEN</span>', { left: '2vw', top: '16vh' }).classList.add('sc-sign', 'open');
      if (!grOn()) return;
      // The radio's dial, a tube on the blink, the drip, the dust in the sun.
      const [rx, ry] = artAt(532, 142);
      el('', { left: `${rx}vw`, top: `${ry}vh`, '--c': '#ffd88a', animationDuration: '0.9s' }).classList.add('fh-twinkle');
      const [tx, ty] = artAt(390, 102);
      const [tx2, ty2] = artAt(530, 112);
      el('', { left: `${tx}vw`, top: `${ty}vh`, width: `${tx2 - tx}vw`, height: `${ty2 - ty}vh` }).classList.add('gr-tube');
      const [dx, dy] = artAt(822, 440);
      const [, py] = artAt(0, 630);
      el('', { left: `${dx}vw`, top: `${dy}vh`, '--fall': `${py - dy}vh` }).classList.add('gr-drip');
      for (let i = 0; i < 9; i++) el('', { left: `${rand(72, 98)}vw`, top: `${rand(70, 96)}vh`, '--sx': `${rand(-3, 3)}vw`, '--sy': `${rand(-6, 2)}vh`, animation: `sc-fly ${rand(6, 10).toFixed(1)}s ease-in-out ${rand(0, 5).toFixed(1)}s infinite alternate` }).classList.add('gr-mote');
    },
    update: grWatch,
    moments: [
      () => crossing('🛞', { y: 92, dur: 4, size: 54, cls: ['roll'], bob: false }),
      grWeld,
      () => { vvWalk(GR_MECH(), { vh: 23, dur: 12 }); later(() => cue('wrench'), 4000); },
      () => crossing(critter('cat', { color: '#9d958b' }), { y: 92, dur: 9, size: 60, faces: 'right', cls: ['sc-cat'] }),
      () => { const [x, y] = grOn() ? artAt(500, 120) : [4, 70]; notes(x, y, '#ffd88a', 7); cue('riff'); },
      () => grPickup(),
      grCreeper,
      () => { cue('wrench'); burst(['⚙', '•', '⚙'], { x: rand(3, 8), y: 86, n: 12, spread: 6, size: [10, 18], colors: ['#c8d0d8', '#8a939e'], rise: [-20, -8], fall: [8, 16] }); },
      () => { vvWalk(GR_MECH('beer', '#5a6a3a'), { vh: 22, dur: 11 }); },
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
      () => drift(ASTRONAUT, { from: [-8, rand(50, 64)], to: [108, rand(46, 64)], dur: 16, size: 96, spin: 360 }),
      () => drift('🛸', { from: [110, rand(22, 30)], to: [-12, rand(22, 34)], dur: 9, size: 54 }),
      () => drift('🪐', { from: [110, 26], to: [-15, 30], dur: 30, size: 120 }),
      () => drift('☄️', { from: [105, 21], to: [-10, 40], dur: 3, size: 44 }),
      () => { el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 3200).classList.add('sc-redalert'); cue('alarm'); },
    ],
  };

  // Horse Race at the castle: the tournament field. Every player's banner flies on its staff along
  // the lists (the court's banners, above: they dip when their player drinks); a herald sounds the
  // start, the crowd cheers, roses are thrown, a falcon goes over and the jester does his act.
  const listsBanner = (i, n) => {
    const step = 18 / n;
    const size = Math.min(60, (step * 0.72 * innerWidth) / 100);
    return { left: `calc(${(1.5 + (i + 0.5) * step).toFixed(2)}vw - ${(size / 2).toFixed(1)}px)`, top: '14vh', fontSize: `${size.toFixed(1)}px` };
  };
  SCENES.castleTournament = {
    decor() {
      court.no = null;
      banner('Let the tournament begin!', 'Riders, to the lists', 'tourney');
      cue('fanfare', 300);
    },
    update: (s) => heraldry(s, listsBanner, ['lists']),
    moments: [
      () => { el('📯', { left: '2vw', top: '30vh', fontSize: '70px', animation: 'sc-herald 4s ease-in-out forwards' }, 4200); cue('fanfare', 400); },
      () => { cue('cheer'); burst(['🌹', '🌸', '🌹'], { x: 6, y: 70, n: 14, spread: 12, size: [20, 30] }); },
      () => drift(critter('eagle'), { from: [-10, rand(4, 12)], to: [110, rand(2, 14)], dur: rand(8, 11), size: 70 }),
      juggle,
      () => crossing(critter('dog'), { y: 92, dur: 7, size: 60, faces: 'right' }),
      () => { burst(['🎉', '✨', '🏆'], { x: 8, y: 60, n: 14, spread: 10 }); cue('cheer'); },
    ],
  };

  // Boat Race at the lighthouse: regatta day. Boats of every kind go by all the time, near and
  // far (the near ones lower and bigger), on top of the clear day's gulls and dolphins.
  // (Someone rowing, a surfer: drawn, below.)
  const BOATS = ['⛵', '⛵', '🚤', '🛶', 'rowboat', '🛥️', '⛴️', '🚢', 'surfer', '🚤'];
  // Drawn boats too (all facing right; across() turns them round): a racing eight, a tall ship
  // under full sail, a tug with its fenders and smoke, and a Spanish galleon.
  // (The eight are the kit's, sitting facing the stern, their oars out; the cox faces forward.)
  const SCULL = `<svg viewBox="0 0 160 30" width="1em" height="0.19em" overflow="visible">
    ${Array.from({ length: 8 }, (_, i) => `${inked(`M${22 + i * 15} 13 L${12 + i * 15} 29`, '#e8e0cc', 1)}${figureAt(24 + i * 15, 28.4, 26, { skin: skinFor(i), hair: 'short', hairColor: i % 3 ? 'brown' : 'blonde', top: i % 2 ? '#c0392b' : '#1b3f8e', sleeves: 'short', crop: 'waist', arms: ['hold', 'hold'], flip: true })}`).join('')}
    ${figureAt(146, 28, 24, { skin: 'tan', hat: 'cap', hatColor: '#ffd23f', top: '#ffd23f', crop: 'waist', arms: ['hold', 'hold'] })}
    <path d="M2 18 Q80 24 158 16 L150 20 Q80 28 8 21Z" fill="#f4f0e4" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"/></svg>`;
  // A rowing boat (a rower facing the stern, pulling on the oars), a surfer on a wave.
  const ROWBOAT = `<svg viewBox="0 0 100 60" width="1em" height="0.6em" overflow="visible">
    ${figureAt(52, 60, 44, { skin: 'tan', hat: 'beanie', hatColor: '#2a6a9a', top: '#e8b81a', crop: 'waist', arms: ['hold', [40, 40]], flip: true })}
    ${inked('M40 37 L14 56', '#c8a070', 1.8)}<path d="M6 40 Q50 48 94 36 L88 50 Q50 58 14 50Z" fill="#c0392b" stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round"/><path d="M10 44 Q50 52 91 41" stroke="#f4f0e4" stroke-width="2" fill="none"/></svg>`;
  const SURFER = `<svg viewBox="0 0 100 80" width="1em" height="0.8em" overflow="visible">
    ${figureAt(50, 64, 58, { skin: 'tan', hair: 'curly', hairColor: 'blonde', topStyle: 'bare', bottomStyle: 'shorts', bottom: '#2a8ac0', arms: [[-80, -10], [80, 10]], legs: ['wide', 'wide'], lean: 8 })}
    <path d="M6 66 Q50 74 96 62 Q90 58 50 60 Q14 60 6 66Z" fill="#ffd23f" stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round"/><path d="M20 65 Q50 69 84 62" stroke="#e8572a" stroke-width="2" fill="none"/>
    <path d="M-4 72 Q12 62 28 70 T60 70 T100 68 V80 H-4Z" fill="rgba(240, 248, 255, 0.7)"/></svg>`;
  const TALL_SHIP = `<svg viewBox="0 0 120 110" width="1em" height="0.92em"><path d="M6 84 h108 l-12 18 h-84Z" fill="#3b2614"/><rect x="6" y="80" width="108" height="5" fill="#c8a85a"/>
    ${[[30, 18], [60, 6], [90, 20]].map(([x, top]) => `<path d="M${x} 82 V${top}" stroke="#2a1a0e" stroke-width="3"/>${[0, 1, 2].map((k) => `<path d="M${x - 16 + k * 2} ${top + 6 + k * 20} Q${x} ${top + 2 + k * 20} ${x + 16 - k * 2} ${top + 6 + k * 20} L${x + 14 - k * 2} ${top + 22 + k * 20} Q${x} ${top + 26 + k * 20} ${x - 14 + k * 2} ${top + 22 + k * 20}Z" fill="#f4efe4" stroke="#c8c0b0" stroke-width="0.8"/>`).join('')}`).join('')}
    <path d="M114 82 L118 40 L94 74Z" fill="#f4efe4"/><path d="M60 6 l14 4 l-14 4Z" fill="#c0392b"/></svg>`;
  const TUG = `<svg viewBox="0 0 90 50" width="1em" height="0.56em"><path d="M2 32 h86 l-10 14 h-70Z" fill="#c0392b"/><rect x="2" y="29" width="86" height="4" fill="#1a1a1a"/>
    <rect x="22" y="16" width="34" height="14" fill="#f4f0e4"/><rect x="28" y="6" width="22" height="10" fill="#f4f0e4"/><rect x="32" y="9" width="6" height="5" fill="#9fd0e8"/><rect x="40" y="9" width="6" height="5" fill="#9fd0e8"/>
    <rect x="60" y="8" width="8" height="22" fill="#1a1a1a"/><rect x="60" y="11" width="8" height="3" fill="#c0392b"/>
    ${[12, 30, 48, 66].map((x) => `<circle cx="${x}" cy="38" r="3.5" fill="#2a2a2a"/>`).join('')}
    <circle cx="64" cy="2" r="4" fill="#aaa" opacity="0.6"/><circle cx="70" cy="-4" r="5" fill="#aaa" opacity="0.4"/></svg>`;
  const GALLEON = `<svg viewBox="0 0 120 110" width="1em" height="0.92em"><path d="M4 76 Q60 86 116 70 L110 100 Q60 106 14 98Z" fill="#5a3a1c"/><path d="M84 60 h32 v14 h-32Z M4 62 h22 v16 h-22Z" fill="#6a4524"/>
    <path d="M10 82 Q60 90 112 76" stroke="#d4af37" stroke-width="2" fill="none"/>${[20, 34, 48, 62, 76, 90].map((x) => `<rect x="${x}" y="86" width="5" height="4" fill="#1a1008"/>`).join('')}
    ${[[34, 14], [66, 4], [96, 22]].map(([x, top]) => `<path d="M${x} 80 V${top}" stroke="#2a1a0e" stroke-width="3"/><path d="M${x - 15} ${top + 8} Q${x} ${top + 18} ${x + 15} ${top + 8} V${top + 30} Q${x} ${top + 40} ${x - 15} ${top + 30}Z" fill="#e8dcc0"/><path d="M${x - 4} ${top + 14} h8 v16 h-8Z M${x - 10} ${top + 20} h20 v4 h-20Z" fill="#c0392b"/>`).join('')}
    <path d="M66 4 l18 5 l-18 5Z" fill="#d4af37"/></svg>`;
  function regattaBoat() {
    const depth = Math.random();
    const y = 42 + depth * 24;
    const size = 22 + depth * 60;
    const dur = 34 - depth * 18;
    if (Math.random() < 0.15) return across(SAILBOAT, { y: y - 3, dur, size, cls: ['sc-pitch'] });
    // A drawn one now and then: the eight goes fast, the big ships slow.
    if (Math.random() < 0.3) {
      const [svg, speed, scale] = pick([[SCULL, 0.5, 1.4], [TALL_SHIP, 1.4, 1.3], [TUG, 1, 0.9], [GALLEON, 1.5, 1.3]]);
      return across(svg, { y: y - 3, dur: dur * speed, size: size * scale, cls: ['sc-pitch'] });
    }
    const boat = pick(BOATS);
    if (boat === 'rowboat' || boat === 'surfer') return across(boat === 'rowboat' ? ROWBOAT : SURFER, { y: y - 2, dur: boat === 'surfer' ? dur * 0.7 : dur, size: size * 1.3, cls: ['sc-pitch'] });
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
  // The butler in tails with the champagne.
  const MC_BUTLER = figure({ skin: 'pale', hair: 'receding', hairColor: 'grey', beard: 'moustache', top: '#f8f6f0', topStyle: 'suit', accent: '#141016', neck: 'bow', accent2: '#141016', bottom: '#141016', pose: 'walk', arms: ['down', 'carry'], holding: 'bottle', propColor: '#1a3a2a' });
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
      () => vvWalk(MC_BUTLER, { vh: 24, dur: 10 }),
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
      const entry = { stop: () => clearInterval(t) };
      const t = setInterval(() => { if (++k > 9) { clearInterval(t); timers.delete(entry); d.innerHTML = die(n); } else d.innerHTML = die(1 + Math.floor(Math.random() * 6)); }, 140);
      timers.add(entry);
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
    // (The diner, the tiki bar, the speakeasy, the casino and the saloon: in their block.)
    // (Christmas has its own, drawn, further down: see xmMore.)
  };

  for (const [id, list] of Object.entries(MORE)) SCENES[id]?.moments.push(...list);

  // ---------- The pirate tavern, the beer hall, the space lounge, the lighthouse, the vineyard ----------
  // (In a block of their own, so their names don't meet anyone else's.)
  {
    // What any game does, seen from the TV: someone drinks, someone finishes their drink, the game
    // ends. `on.drink(list)` gets [{ p, sips }] for everyone who drank in one go; reactions come at
    // most every few seconds (a round where everyone drinks is one reaction, not six).
    const ENDED = ['over', 'results', 'summary'];
    const watchRoom = (on) => {
      let was = null;
      let quietTill = 0;
      return (s) => {
        if (!s) { was = null; return; }
        if (!s.players) return;
        const now = { no: s.gameNo, phase: s.phase, total: {}, fin: {} };
        for (const p of s.players) { now.total[p.id] = p.total || 0; now.fin[p.id] = p.finished || 0; }
        const prev = was;
        was = now;
        if (!prev || prev.no !== now.no) return;
        if (ENDED.includes(now.phase) && !ENDED.includes(prev.phase)) { quietTill = Date.now() + 6000; on.end?.(s); return; }
        if (Date.now() < quietTill) return;
        const finished = s.players.filter((p) => now.fin[p.id] > (prev.fin[p.id] ?? now.fin[p.id]));
        const drank = s.players.map((p) => ({ p, sips: now.total[p.id] - (prev.total[p.id] ?? now.total[p.id]) })).filter((d) => d.sips > 0);
        if (finished.length) { quietTill = Date.now() + 3500; on.finish?.(finished[0], s); } else if (drank.length) { quietTill = Date.now() + 2500; on.drink?.(drank, s); }
      };
    };
    const who = (list) => (list.length > 2 ? 'everyone' : list.map((d) => esc(d.p.name)).join(' & '));
    // A speech bubble (over the table, so it can be read), at x vw / y vh, pointing down-left.
    // (With 'r' in `cls`, the tail's at the right and x is where the bubble's right edge goes.)
    const say = (text, x, y, cls = '', life = 2800) => {
      const right = cls.split(' ').includes('r');
      inFront(`<b>${text}</b>`, { [right ? 'right' : 'left']: `${right ? 100 - x : x}vw`, top: `${y}vh`, '--life': `${life / 1000 - 0.2}s` }, life).classList.add('sc-say', ...cls.split(' ').filter(Boolean));
    };
    // A drawing made once and placed at a point of the background art (1600 x 900, see artAt).
    const atArt = (html, x, y, style, life, cls) => { const [vx, vy] = artAt(x, y); const d = el(html, { left: `${vx}vw`, top: `${vy}vh`, ...style }, life); if (cls) d.classList.add(...cls.split(' ')); return d; };

    // ----- The pirate tavern: on deck at sunset (see pirateSea() in lib/roomArt.js) -----
    // The captain stumps along the deck (peg leg, hook, parrot on his shoulder) and growls; a
    // sailor climbs the shrouds; a ship comes in on the horizon and the deck cannon trades shots
    // with her; the parrot on the rum barrel squawks at whoever drinks; the chest of gold spills;
    // the kraken feels about over the rail; gulls, dolphins, a whale, a bottle with a message.
    // Every drink gets the parrot, a finished drink gets the cannon, the end of a game a salute.
    // (The kit's.) The captain: tricorn, beard, eye patch, red coat, a hook and a peg leg (legs:
    // sc-legs-f/b), the parrot on his shoulder looking about (sc-pir-cpbird).
    const CAPTAIN_LOOK = { hat: 'tricorn', hatAccent: '#e3b23c', hair: 'long', hairColor: 'black', beard: 'beard', face: 'patch', skin: 'light', top: '#f2ead8', topStyle: 'suit', accent: '#9a1e22', belt: '#2a1a0e', bottom: '#2a2030', shoes: '#141010', build: 'stout', peg: 'back', holding: 'hook', arms: ['swingB', [16, 30]], hooks: { legF: 'sc-legs-f', legB: 'sc-legs-b' } };
    const CAPTAIN = `<svg viewBox="0 0 60 120" width="0.5em" height="1em" overflow="visible">${figureAt(30, 118, 120, CAPTAIN_LOOK)}<g class="sc-pir-cpbird">${critter.at('parrot', 15, 47, 22, { pose: 'perch' })}</g></svg>`;
    // A sailor climbing the shrouds, from behind (his arms and legs reach in turn: sc-pir-armL/R).
    const SAILOR = figure({ facing: 'back', hat: 'bandana', hatColor: '#c0201a', hair: 'short', hairColor: 'black', skin: 'tan', top: '#f2efe6', topStyle: 'stripes', accent: '#2a3a6a', bottom: '#2a2030', arms: ['climbUp', 'climbDown'], legs: [[14, -20], [-6, -4]], hooks: { armB: 'sc-pir-armL', armF: 'sc-pir-armR', legB: 'sc-pir-armR', legF: 'sc-pir-armL' } });
    const CANNON = `<svg viewBox="0 0 210 120" width="1em" height="0.571em" overflow="visible">
      <defs><linearGradient id="pirI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa0ac"/><stop offset="0.3" stop-color="#3e424c"/><stop offset="1" stop-color="#16171c"/></linearGradient></defs>
      <g class="sc-pir-barrel"><g transform="rotate(-12 70 64)"><path d="M18 50 Q12 64 18 78 L40 76 L176 70 Q182 64 176 58 L40 52Z" fill="url(#pirI)" stroke="#0c0c10" stroke-width="1.5"/><path d="M40 55 L174 60" stroke="#ffb070" stroke-width="2" opacity="0.6"/>
        ${[56, 108, 150].map((x) => `<rect x="${x}" y="${51 + x * 0.04}" width="8" height="${25 - x * 0.08}" rx="1.5" fill="url(#pirI)" stroke="#0c0c10"/>`).join('')}<rect x="170" y="55" width="13" height="18" rx="2" fill="url(#pirI)" stroke="#0c0c10"/><circle cx="12" cy="64" r="8" fill="url(#pirI)"/>
        <g class="sc-pir-flash"><path d="M182 64 l30 -18 l-8 14 l34 -2 l-32 10 l26 16 l-34 -8 l2 14Z" fill="#ffd23f"/><circle cx="190" cy="64" r="12" fill="#fff6c8"/></g></g></g>
      <path d="M22 74 L120 70 L132 100 L14 104Z" fill="#7a4a22" stroke="#2a1808" stroke-width="2"/><path d="M22 75 L120 71" stroke="#e0a060" stroke-width="3"/><path d="M30 86 H122" stroke="#4a2a10" stroke-width="2"/>
      ${[38, 110].map((x) => `<circle cx="${x}" cy="104" r="15" fill="#5a3418" stroke="#2a1808" stroke-width="3"/><path d="M${x - 12} 104 h24 M${x} 92 v24" stroke="#2a1808" stroke-width="2"/><circle cx="${x}" cy="104" r="4" fill="#c9973c"/>`).join('')}
      ${[[160, 112], [178, 112], [169, 97]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="url(#pirI)" stroke="#0c0c10"/>`).join('')}</svg>`;
    // Polly on the rum barrel (the kit's parrot, perched: 1em wide, 1.67em tall).
    const POLLY = critter('parrot', { pose: 'perch' });
    // The gulls and dolphins round the ship (the kit's).
    const PIR_GULL = critter('gull');
    const PIR_DOLPHIN = critter('dolphin');
    const GALLEON = `<svg viewBox="0 0 140 110" width="1em" height="0.786em"><path d="M6 76 L134 70 L120 96 L22 98Z" fill="#241826"/><path d="M8 76 L134 70" stroke="#e8a060" stroke-width="1.5"/>
      ${[30, 48, 66, 84, 102].map((x) => `<rect x="${x}" y="80" width="6" height="5" fill="#ffc060" opacity="0.7"/>`).join('')}<path d="M110 70 L132 56 L136 70Z" fill="#241826"/><path d="M2 76 L-10 70 L8 72Z" fill="#241826"/>
      ${[[40, 16, 22], [72, 6, 26], [104, 20, 20]].map(([x, top, w]) => `<rect x="${x - 1}" y="${top}" width="2.5" height="${74 - top}" fill="#241826"/><path d="M${x - w} ${top + 8} Q${x} ${top + 2} ${x + w} ${top + 8} L${x + w - 2} ${top + 30} Q${x} ${top + 34} ${x - w + 2} ${top + 30}Z" fill="#f0c8b0"/><path d="M${x - w + 2} ${top + 36} Q${x} ${top + 32} ${x + w - 2} ${top + 36} L${x + w - 4} ${top + 56} Q${x} ${top + 60} ${x - w + 4} ${top + 56}Z" fill="#e8b098"/>`).join('')}
      <path d="M72 6 l14 3 l-14 4Z" fill="#c0201a"/><path d="M30 70 L72 6 L112 68" stroke="#241826" stroke-width="1" fill="none"/></svg>`;
    const BOTTLE = `<svg viewBox="0 0 60 30" width="1em" height="0.5em"><g class="sc-pir-bob"><path d="M4 12 Q4 6 12 6 H38 L46 10 H56 V18 H46 L38 22 H12 Q4 22 4 16Z" fill="rgba(90,160,110,0.75)" stroke="#2a5a3a"/><rect x="54" y="9" width="5" height="10" fill="#8a6a3a"/><path d="M12 10 h20 v8 h-20Z" fill="#f2e6c4"/></g><path d="M0 22 Q15 18 30 22 T60 22" stroke="#9fb8d8" stroke-width="1.5" fill="none" opacity="0.6"/></svg>`;

    const pirateParrot = () => layer?.querySelector('.sc-pir-polly');
    const squawk = (text) => {
      const p = pirateParrot();
      if (p) { p.classList.remove('talk'); void p.offsetWidth; p.classList.add('talk'); }
      cue('squawk');
      const [x, y] = artAt(30, 610);
      say(text, x + 3, y - 9, 'pir');
    };
    const fireCannon = (delay = 0) => later(() => {
      const c = layer?.querySelector('.sc-pir-cannon');
      if (!c) return;
      c.classList.remove('fire'); void c.offsetWidth; c.classList.add('fire');
      cue('boom');
      const r = c.getBoundingClientRect();
      const x = ((r.left + r.width * 0.95) / innerWidth) * 100;
      const y = ((r.top + r.height * 0.18) / innerHeight) * 100;
      for (let i = 0; i < 4; i++) later(() => drift('', { from: [x - 1, y - 2], to: [x + rand(2, 9), y - rand(14, 26)], dur: 4.5, size: 10 }).classList.add('sc-pir-smoke'), i * 140);
    }, delay);
    const splash = (x, y, big = 1) => { el('<i></i><i></i><i></i>', { left: `${x}vw`, top: `${y}vh`, '--s': big }, 2600).classList.add('sc-pir-splash'); cue('splash'); };
    // A ship sails in on the horizon (left), and the deck cannon trades shots with her.
    const broadside = () => {
      const g = el(GALLEON, { left: '-2vw', top: 'calc(46.5vh - 0.72 * 110px)', fontSize: '110px' }, 30000);
      g.classList.add('sc-pir-galleon', 'blk');
      fireCannon(9000);
      later(() => splash(rand(9, 13), 44.5, 0.7), 10400);
      later(() => { el('', { left: '10vw', top: '41vh' }, 900).classList.add('sc-pir-muzzle'); later(() => drift('', { from: [10, 41], to: [12, 33], dur: 4, size: 8 }).classList.add('sc-pir-smoke', 'far'), 100); }, 13500);
      later(() => { cue('boom'); }, 14300);
      later(() => { el('<i></i><i></i><i></i><i></i><i></i>', { left: `${rand(16, 26)}vw`, bottom: '14vh' }, 3200).classList.add('sc-crash'); cue('crash'); }, 15000);
    };
    // The captain stumps in from the right, stops below the sidebar to have his say, and goes on
    // across the deck.
    const captain = (line) => {
      const d = el(CAPTAIN, { left: '0', top: '64vh', fontSize: `${0.32 * innerHeight}px` }, 21000);
      d.classList.add('sc-pir-captain', 'sc-face-l');
      d.animate([{ transform: 'translateX(104vw)' }, { transform: 'translateX(80vw)', offset: 0.2 }, { transform: 'translateX(80vw)', offset: 0.45 }, { transform: 'translateX(-14vw)' }], { duration: 20000, fill: 'forwards' });
      cue('creak', 600);
      later(() => d.classList.add('stop'), 4000);
      later(() => say(line || pick(['Arrr!', 'Yo ho ho!', 'Shiver me timbers!', 'Who drank me rum?', 'Hoist the colours!', 'Splice the mainbrace!']), 81, 68, 'pir r'), 4500);
      later(() => d.classList.remove('stop'), 9000);
    };
    const climber = () => {
      el(SAILOR, { left: '0', top: '0', fontSize: '11vh' }, 16000).classList.add('sc-pir-climb');
      cue('creak', 1500);
    };
    const coins = () => { const [x, y] = artAt(1230, 780); burst(['🪙', '🪙', '💰', '💎', '🪙'], { x, y, n: 22, spread: 8, rise: [-30, -14], fall: [-4, 10] }); cue('jackpot'); };
    const pirateWatch = watchRoom({
      drink: (list) => squawk(pick([`Drink up, ${who(list)}!`, `Arrr! ${who(list)}, drink!`, `Rrrum for ${who(list)}!`])),
      finish: (p) => { squawk(`Down the hatch, ${esc(p.name)}!`); fireCannon(600); },
      end: () => {
        inFront('<b>Yo ho ho!</b>', { left: '0', right: '26vw', top: '30vh' }, 3400).classList.add('sc-quote', 'pir');
        [0, 1400, 2800].forEach((t) => fireCannon(t));
        later(coins, 600);
        later(() => squawk('Pieces of eight!'), 3600);
        later(() => captain(pick(['A fine haul, me hearties!', 'Rum for the winners!', 'Drinks on the losers!'])), 1200);
      },
    });
    SCENES.pirate = {
      decor() {
        el(JOLLY_ROGER, { left: '12vw', top: '13vh', fontSize: '110px' }).classList.add('sc-jolly');
        el(LANTERN, { left: '2.5vw', top: '16vh', fontSize: '80px' }).classList.add('sc-lantern');
        // The sun's road on the water, glittering (it's at 1095 of the art: between the table and
        // the sidebar), and the swell rolling in under it.
        el('', { left: '0', top: `${artAt(0, 414)[1]}vh`, width: '200vw', height: `${artAt(0, 746)[1] - artAt(0, 414)[1]}vh` }).classList.add('sc-pir-swell');
        for (let i = 0; i < 12; i++) {
          const t = Math.random();
          atArt('', 1095 + (Math.random() - 0.5) * (80 + t * 300), 430 + t * t * 300, { width: `${(0.6 + t * 2.4).toFixed(1)}vw`, animationDelay: `-${rand(0, 3).toFixed(1)}s`, animationDuration: `${rand(1.6, 3.2).toFixed(1)}s` }, 0, 'sc-pir-glint');
        }
        // The cannon on the deck, left, and the parrot on the rum barrel.
        el(CANNON, { left: '8vw', bottom: '4vh', fontSize: '24vh' }).classList.add('sc-pir-cannon', 'blk');
        const [px, py] = artAt(44, 690);
        el(POLLY, { left: `${px}vw`, top: `${py - 9.4}vh`, fontSize: '6vh' }).classList.add('sc-pir-polly', 'blk');
        pirateWatch(null);
      },
      update: pirateWatch,
      moments: [
        () => {
          const right = Math.random() < 0.5;
          const y = rand(9, 20);
          for (let i = 0; i < pick([2, 3, 4]); i++) {
            drift(PIR_GULL, { from: [right ? -10 : 110, y + rand(-3, 3)], to: [right ? 110 : -10, y + rand(-4, 8)], dur: rand(10, 14), size: rand(34, 54), extra: { animationDelay: `${i * rand(0.3, 0.9)}s` } }).classList.add(right ? 'sc-face-r' : 'sc-face-l');
          }
          cue('gulls', 1500);
        },
        broadside,
        captain,
        climber,
        () => { el('<i></i><i></i><i></i><i></i><i></i>', { left: `${rand(25, 75)}vw`, bottom: '12vh' }, 3200).classList.add('sc-crash'); cue('crash'); },
        () => {
          for (let i = 0; i < pick([2, 3]); i++) el(PIR_DOLPHIN, { left: `${rand(2, 6) + i * 4}vw`, top: `${rand(50, 58)}vh`, fontSize: `${rand(50, 66)}px`, animationDelay: `${i * 0.5}s` }, 4000).classList.add('sc-dolphin');
          cue('splash', 1500);
        },
        // A whale: a spout, then its tail lifting and slipping back under.
        () => {
          const x = rand(3, 8);
          el('<i></i><i></i><i></i>', { left: `${x}vw`, top: '47vh' }, 3000).classList.add('sc-spout');
          later(() => el(FLUKE, { left: `${x - 2}vw`, top: 'calc(48vh - 52px)', fontSize: '104px' }, 4200).classList.add('sc-fluke'), 1800);
          cue('splash', 4800);
        },
        // The kraken: tentacles come up over the rail, feel about, and slide back down.
        () => {
          const left = Math.random() < 0.5;
          for (let i = 0; i < pick([1, 2, 3]); i++) el(TENTACLE, { [left ? 'left' : 'right']: `${rand(1, 12)}vw`, bottom: '0', fontSize: `${rand(220, 320)}px`, animationDelay: `${i * 0.7}s` }, 8600).classList.add('sc-tentacle');
          cue('splash');
          cue('creak', 1200);
          later(() => squawk('KRAKEN!'), 1800);
        },
        () => squawk(pick(['Pieces of eight!', 'Polly wants a rum!', 'Arrr!', 'Walk the plank!', 'Who’s next?'])),
        coins,
        // A bottle with a message in it bobs by in the sun's road.
        () => { const [x] = artAt(1060, 0); drift(BOTTLE, { from: [x - 6, 70], to: [x + 10, 72], dur: 20, size: 54 }).classList.add('blk'); },
        () => fireCannon(),
      ],
    };

    // ----- The lighthouse: from the gallery, in four weathers (see lighthouseView() in roomArt) -----
    // The lamp's beam sweeps out over the water all the time after dark; the old light on the
    // headland winks back; the bell buoy rocks; the moon (or the sun) glitters on the sea. The
    // keeper comes out on the gallery with his pipe; a trawler comes home with its lights on; gulls
    // sit on the railing by day; in the storm a ship in trouble sends up a flare and the sea breaks
    // right over the rocks. Every drink gets a toast from the gallery, a finished drink the horn,
    // the end of a game the flares.
    // (The kit's: the lamp swings in his far hand, sc-lh-lamp; his pipe smokes.)
    const KEEPER = (coat, hat) => figure({ skin: 'pale', hairColor: 'white', beard: 'beard', hat, hatColor: hat === 'souwester' ? '#e8b81a' : '#1a2238', top: coat, topStyle: hat === 'souwester' ? 'plain' : 'stripes', accent: '#2e3e64', bottom: '#1e2a3a', shoes: '#141010', build: 'broad', pose: 'walk', inMouth: 'pipe', holdingBack: 'lamp', hooks: { propB: 'sc-lh-lamp' } });
    const TRAWLER = (lit) => `<svg viewBox="0 0 150 80" width="1em" height="0.533em" overflow="visible"><path d="M4 50 L140 46 L128 68 L16 70Z" fill="#7a1f1a"/><path d="M6 52 L140 48" stroke="#e8e0d0" stroke-width="3"/>
      <path d="M86 48 V26 H118 L122 48Z" fill="#e8e0d0"/><rect x="92" y="30" width="8" height="7" fill="${lit ? '#ffd27a' : '#5a7a9a'}"/><rect x="104" y="30" width="8" height="7" fill="${lit ? '#ffd27a' : '#5a7a9a'}"/>
      <path d="M100 26 V4 M40 48 V10 M40 12 L4 34 M40 12 L76 30" stroke="#2a2a2a" stroke-width="2.5"/><path d="M14 40 l10 6 M66 36 l-8 8" stroke="#2a2a2a" stroke-width="1.5"/>
      ${lit ? '<circle cx="100" cy="4" r="3" fill="#fff6d8"/><circle cx="100" cy="4" r="10" fill="#fff6d8" opacity="0.3"/><circle cx="140" cy="46" r="2.6" fill="#4dff7a"/><circle cx="40" cy="10" r="2.4" fill="#ff4a3a"/><path d="M80 48 L40 70 L130 70Z" fill="#ffe8a0" opacity="0.08"/>' : ''}</svg>`;
    // (The kit's gull, perched: its head turns, .fg-head.)
    const GULL_SIT = critter('gull', { pose: 'perch' });
    const BELL_BUOY = (night) => `<svg viewBox="0 0 60 80" width="0.75em" height="1em" overflow="visible"><g class="sc-lh-buoy"><path d="M18 44 L30 8 L42 44 M22 30 H38 M26 18 H34" stroke="#1a1a1a" stroke-width="2.5" fill="none"/>
      <path d="M25 32 Q25 22 30 22 Q35 22 35 32 L37 36 H23Z" fill="#c9973c"/>${night ? '<circle cx="30" cy="6" r="3" fill="#ff5a4a"/><circle class="sc-lh-blink" cx="30" cy="6" r="12" fill="#ff5a4a" opacity="0.4"/>' : ''}
      <path d="M10 44 H50 L44 64 H16Z" fill="#b0302a"/><rect x="13" y="50" width="34" height="6" fill="#e8e0d0"/></g><path d="M0 64 q15 -6 30 0 t30 0" stroke="#c8dcf0" stroke-width="2" fill="none" opacity="0.5"/></svg>`;

    const lhPlace = { buoy: [1075, 625], far: [144, 346], moon: { day: [384, 130], other: [1110, 150] } };
    const keeper = (weather, line) => {
      const oil = weather === 'storm' || weather === 'fog';
      const d = el(KEEPER(oil ? '#e8b81a' : '#1e2a4a', oil ? 'souwester' : 'cap'), { left: '0', top: '66vh', fontSize: `${0.3 * innerHeight}px` }, 21000);
      d.classList.add('sc-lh-keeper', 'sc-face-l', ...(weather === 'day' ? ['day'] : []));
      d.animate([{ transform: 'translateX(104vw)' }, { transform: 'translateX(82vw)', offset: 0.2 }, { transform: 'translateX(82vw)', offset: 0.45 }, { transform: 'translateX(-12vw)' }], { duration: 20000, fill: 'forwards' });
      later(() => d.classList.add('stop'), 4000);
      later(() => say(line || pick(weather === 'day' ? ['Fair winds!', 'Not a cloud in the sky.', 'Ship ahoy!', 'Grand day for it.'] : weather === 'fog' ? ['Can’t see me own boots.', 'Keep that horn going!', 'Something’s out there…'] : weather === 'storm' ? ['Batten down the hatches!', 'Hold on to your hats!', 'She’s a wild one tonight.'] : ['All’s well.', 'Light’s burning bright.', 'Calm seas tonight.']), 82, 69, 'lh r'), 4500);
      later(() => d.classList.remove('stop'), 9000);
    };
    const trawler = (weather) => {
      const lit = weather !== 'day';
      const right = Math.random() < 0.5;
      const d = drift(TRAWLER(lit), { from: [right ? -14 : 108, 40.5], to: [right ? 108 : -14, 41], dur: rand(38, 48), size: rand(80, 110) });
      d.classList.add('sc-lh-boat', right ? 'sc-face-r' : 'sc-face-l', ...(weather === 'fog' ? ['sc-fogged'] : []));
      if (weather === 'day') for (let i = 0; i < 3; i++) drift(critter('gull'), { from: [right ? -10 : 112, 34 + i], to: [right ? 106 : -8, 33 + i * 1.5], dur: rand(36, 44), size: 26, extra: { animationDelay: `${0.6 + i * 0.4}s` } }).classList.add(right ? 'sc-face-r' : 'sc-face-l');
      cue(weather === 'fog' ? 'foghornFar' : 'horn', 3000);
    };
    const lhSpray = (x = rand(66, 92), big = false) => {
      el('<i></i><i></i><i></i><i></i><i></i>', { left: `${x}vw`, bottom: big ? '22vh' : '18vh', '--s': big ? 1.6 : 1 }, 3200).classList.add('sc-crash', ...(big ? ['sc-lh-bigcrash'] : []));
      cue('crash');
    };
    const signalFlares = () => {
      for (let i = 0; i < 3; i++) later(() => {
        const x = rand(64, 72);
        el('', { left: `${x}vw`, top: '58vh', '--fx': `${rand(-4, 4)}vw`, '--c': pick(['#ff3a20', '#3aff6a', '#fff0a0']) }, 7200).classList.add('sc-lh-flare');
        cue('bang');
      }, i * 900);
    };
    const lhToast = (weather) => (list) => {
      say(pick([`Pour one out for ${who(list)}!`, `${who(list)} drinks! All hands!`, `Bottoms up, ${who(list)}!`]), 82, 70, 'lh r');
      cue(weather === 'fog' ? 'foghornFar' : 'horn');
      if (weather !== 'day') el('', { left: '50vw', bottom: '-10vh' }, 4000).classList.add('sc-beam', 'sc-lh-quickbeam');
    };
    function lighthouseScene(weather) {
      const night = weather !== 'day';
      let watch = null;
      watch = watchRoom({
        drink: lhToast(weather),
        finish: (p) => { say(`${esc(p.name)} finishes it! Sound the horn!`, 82, 70, 'lh r'); cue(weather === 'day' ? 'horn' : 'foghorn'); lhSpray(undefined, true); },
        end: () => { signalFlares(); keeper(weather, pick(['A fine game, sailors.', 'Ring the bell!', 'Drinks on the losers!'])); cue('horn', 800); },
      });
      return {
        decor() {
          watch(null);
          const [bx, by] = artAt(...lhPlace.buoy);
          el(BELL_BUOY(night), { left: `${bx}vw`, top: `${by - 7}vh`, fontSize: '7vh' }).classList.add('blk');
          // The old light on the headland, winking (not by day); the beam sweeping round.
          if (night) {
            const [fx, fy] = artAt(...lhPlace.far);
            el('', { left: `${fx}vw`, top: `${fy}vh` }).classList.add('sc-lh-far', ...(weather === 'fog' ? ['fog'] : []));
            el('', { left: '50vw', bottom: '-10vh' }).classList.add('sc-lh-sweep', ...(weather === 'fog' ? ['fog'] : []));
          }
          // The moon (or the sun) on the water.
          if (weather === 'night' || weather === 'day') {
            const [mx] = weather === 'day' ? lhPlace.moon.day : lhPlace.moon.other;
            for (let i = 0; i < 12; i++) {
              const t = Math.random();
              atArt('', mx + (Math.random() - 0.5) * (60 + t * 280), 404 + t * t * 320, { width: `${(0.5 + t * 2).toFixed(1)}vw`, animationDelay: `-${rand(0, 3).toFixed(1)}s`, animationDuration: `${rand(1.6, 3.2).toFixed(1)}s` }, 0, `sc-pir-glint lh${weather === 'day' ? ' day' : ''}`);
            }
          }
          // (On the gallery rail, which curves down toward us either side: see galleryRail().)
          if (weather === 'day') for (const [x, b] of [[46, 15.6], [88, 12.7]]) el(GULL_SIT, { left: `${x}vw`, bottom: `calc(${b}vh - 6px)`, fontSize: '6.25vh' }).classList.add('sc-lh-gull', 'blk');
          if (weather === 'storm') el('', { inset: '0' }).classList.add('sc-rain');
          if (weather === 'fog') {
            for (const [top, h, dur, delay] of [[24, 40, 70, -20], [44, 46, 95, -60], [60, 40, 80, -35]]) el('', { left: '-60vw', top: `${top}vh`, width: '90vw', height: `${h}vh`, animation: `sc-fogbank ${dur}s linear ${delay}s infinite` }).classList.add('sc-fogcloud');
          }
        },
        update: (s) => watch(s),
        gap: weather === 'fog' ? [10, 24] : undefined,
        moments: [
          () => keeper(weather),
          () => trawler(weather),
          ...(weather === 'day' ? [
            ...dayMoments(),
            () => drift('🎈', { from: [rand(0, 30), 60], to: [rand(10, 50), -15], dur: 18, size: 60, opacity: 0.9 }),
            // A gull folds its wings and dives for a fish.
            () => { const x = rand(2, 9); drift(`<span style="display:inline-block;rotate:60deg">${critter('gull', { still: true })}</span>`, { from: [x, 4], to: [x + 2, 50], dur: 1.1, size: 44, spin: 20, extra: { animationTimingFunction: 'ease-in' } }); cue('splash', 1100); },
            () => popup(critter('seal'), { x: 2, bottom: 2, size: 84, life: 5000 }),
            // A gull on the railing takes off, and another lands.
            () => { const g = layer.querySelector('.sc-lh-gull'); if (!g) return; g.classList.add('away'); cue('gulls'); later(() => g.classList.remove('away'), 9000); },
          ] : weather === 'fog' ? [
            ...fogMoments(),
            () => crossing('🏮', { y: 40, dur: 22, size: 30, bob: true, cls: ['sc-fogged'] }),
            () => { cue('buoy', 400); cue('buoy', 3400); layer.querySelector('.sc-lh-buoy')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(0)' }], { duration: 3000, iterations: 2, easing: 'ease-in-out' }); },
          ] : [
            ...seaMoments(weather === 'storm'),
            () => lhSpray(),
            () => { for (let i = 0; i < pick([1, 2]); i++) later(() => el('', { left: `${rand(5, 60)}vw`, top: `${rand(4, 14)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 700); },
            () => popup(critter('seal'), { x: 2, bottom: 2, size: 84, life: 5000 }),
            () => crossing('🍾', { y: 52, dur: 26, size: 26, bob: true, cls: ['bottle'] }),
            ...(weather === 'storm' ? [
              lightning, lightning,
              () => drift('☂️', { from: [-10, rand(8, 20)], to: [110, rand(10, 30)], dur: 4, size: 60, spin: 720 }),
              () => lhSpray(rand(70, 90), true),
              // A ship in trouble out there sends up a flare.
              () => { const x = rand(64, 71); el('', { left: `${x}vw`, top: '46vh', '--fx': `${rand(-3, 3)}vw`, '--c': '#ff3a20' }, 7200).classList.add('sc-lh-flare'); cue('bang'); later(() => keeper('storm', 'A flare! Man the lifeboat!'), 1500); },
            ] : []),
          ]),
        ],
      };
    }
    // ----- The space lounge (see spaceLounge() in lib/roomArt.js) -----
    // Out of the window: the station turning, stars twinkling, a space whale gliding by, saucers,
    // comets, an astronaut waving with a drink; in the lounge the robot bartender hovers behind
    // the bar, shaking cocktails, and an alien floats past in zero gravity. Drinks float up out of
    // their glasses for whoever's drinking (it's zero G), a finished drink is a zero-G chug, and
    // the end of a game sets off a supernova.
    const STATION = `<svg viewBox="0 0 120 120" width="1em" height="1em"><g class="sc-sp-spin"><circle cx="60" cy="60" r="50" fill="none" stroke="#9aa4c4" stroke-width="9"/><circle cx="60" cy="60" r="50" fill="none" stroke="#5a648a" stroke-width="9" stroke-dasharray="6 10"/>
      <path d="M60 10 V110 M10 60 H110 M25 25 L95 95 M95 25 L25 95" stroke="#6a7498" stroke-width="3"/>${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${(60 + 50 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(60 + 50 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="2.4" fill="#ffe08a"/>`).join('')}</g>
      <circle cx="60" cy="60" r="13" fill="#c8d0e8"/><circle cx="60" cy="60" r="6" fill="#7cf0ff"/><rect x="44" y="-4" width="32" height="10" fill="#2a4a9a" stroke="#9aa4c4"/><rect x="44" y="114" width="32" height="10" fill="#2a4a9a" stroke="#9aa4c4"/></svg>`;
    // The robot bartender, the alien and the space whale, in the kit's way: flat colours, the ink
    // outline round everything, dot eyes. (The alien is the kit's: three eyes, antennae, a martini.)
    const spInk = `stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"`;
    const ROBOT = `<svg viewBox="0 0 100 150" width="0.667em" height="1em" overflow="visible">
      ${inked('M50 4 V18', '#9aa4c4', 3)}<circle class="sc-sp-blink" cx="50" cy="4" r="5" fill="#ff5c8a" ${spInk}/>
      ${inked('M28 62 Q12 72 16 92', '#9aa4c4', 6)}<circle cx="16" cy="94" r="5" fill="#c8d0e8" ${spInk}/>
      <path d="M36 104 L50 132 L64 104Z" fill="#5a6488" ${spInk}/><path class="sc-sp-jet" d="M42 128 Q50 150 58 128Z" fill="#7cf0ff" opacity="0.85"/>
      <rect x="28" y="48" width="44" height="56" rx="12" fill="#d8dee8" ${spInk}/><path d="M66 56 V96" stroke="${INK}" stroke-width="3.4" opacity="0.16" stroke-linecap="round"/><path d="M34 58 V88" stroke="#fff" stroke-width="3" opacity="0.6" stroke-linecap="round"/>
      <rect x="38" y="60" width="24" height="16" rx="3" fill="#0a0e24" ${spInk}/><path d="M42 66 h4 M50 66 h8 M42 71 h12" stroke="#7dff9e" stroke-width="2"/>
      <path d="M22 44 Q22 16 50 16 Q78 16 78 44Z" fill="#d8dee8" ${spInk}/><path d="M29 38 Q29 23 44 21" stroke="#fff" stroke-width="3" fill="none" opacity="0.6" stroke-linecap="round"/>
      <rect x="24" y="28" width="52" height="14" rx="7" fill="#0a0e24" ${spInk}/><g class="sc-sp-eyes"><ellipse cx="38" cy="35" rx="3.2" ry="4" fill="#7cf0ff"/><ellipse cx="62" cy="35" rx="3.2" ry="4" fill="#7cf0ff"/></g>
      <g class="sc-sp-shake">${inked('M72 62 Q90 58 90 40', '#9aa4c4', 6)}<path d="M84 40 h12 l-2 -22 h-8Z" fill="#e8ecf8" ${spInk}/><rect x="86" y="12" width="8" height="7" rx="2" fill="#c8d0e8" ${spInk}/></g></svg>`;
    const ALIEN = figure({ skin: '#7ae07a', hair: 'bald', face: 'alien', hat: 'antennae', hatColor: '#6ad86a', top: '#8a46d8', bottom: '#6a2ab8', shoes: '#3a1a6a', arms: [[-150, -20], [40, 80]], holding: 'martini', propColor: '#ff5c8a' });
    const WHALE = `<svg viewBox="0 0 300 120" width="1em" height="0.4em" overflow="visible">
      <path class="sc-sp-tail" d="M40 60 Q14 40 0 20 Q16 52 2 92 Q20 74 40 66Z" fill="#3a50b0" fill-opacity="0.85" ${spInk}/>
      <path d="M36 62 Q80 14 180 24 Q262 30 296 70 Q270 98 190 100 Q100 104 36 62Z" fill="#4a64c8" fill-opacity="0.85" ${spInk}/><path d="M120 92 Q150 104 190 100 Q262 96 290 72" fill="none" stroke="#bfe0ff" stroke-width="2" opacity="0.5"/>
      ${[[110, 40], [140, 34], [170, 32], [200, 36], [128, 58], [160, 54], [190, 56]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#bff8ff"/><circle cx="${x}" cy="${y}" r="8" fill="#7cf0ff" opacity="0.25"/>`).join('')}
      <path d="M150 96 Q160 118 186 116 Q172 104 172 96Z" fill="#3a50b0" ${spInk}/><ellipse cx="262" cy="60" rx="3.4" ry="4.2" fill="${INK}"/><path d="M240 82 Q262 88 286 76" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    const blobs = (x, y, n = 10, colors = ['#ffcf5a', '#7cf0ff', '#ff5c8a', '#7dff9e']) => {
      for (let i = 0; i < n; i++) later(() => {
        const s = rand(10, 26);
        drift('', { from: [x + rand(-3, 3), y], to: [x + rand(-10, 10), y - rand(30, 60)], dur: rand(5, 8), size: 10, extra: { width: `${s}px`, height: `${s}px`, '--c': pick(colors) } }).classList.add('sc-sp-blob');
      }, i * 160);
    };
    const robot = () => layer?.querySelector('.sc-sp-robot');
    const robotSays = (text) => {
      const r = robot();
      if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); }
      cue('beep');
      say(text, 76, 62, 'sp r');
    };
    const spaceWatch = watchRoom({
      drink: (list) => { robotSays(pick([`Cheers, ${who(list)}!`, `Drink served: ${who(list)}`, `Bottoms up, ${who(list)}!`])); blobs(rand(66, 72), 90, 8); },
      finish: (p) => { robotSays(`Zero-G chug: ${esc(p.name)}!`); blobs(68, 92, 18); blobs(6, 88, 10); },
      end: () => {
        el('', { inset: '0', '--x': '68vw', '--y': '30vh' }, 2600).classList.add('sc-sp-nova');
        cue('warp');
        later(() => burst(['✦', '✧', '•', '✺'], { x: 68, y: 30, n: 40, spread: 30, size: [12, 26], colors: ['#7cf0ff', '#ff5c8a', '#ffe08a', '#ffffff'], rise: [-30, 10], fall: [0, 40] }), 400);
        later(() => robotSays('Victory protocol engaged.'), 1600);
        later(() => { drift(UFO, { from: [-12, 10], to: [112, 12], dur: 8, size: 90 }).classList.add('sc-ufo'); cue('ufo'); }, 2400);
      },
    });
    SCENES.space = {
      decor() {
        spaceWatch(null);
        el(PLANET, { left: '1vw', top: '18vh', fontSize: '160px' }).classList.add('sc-planet');
        atArt(STATION, 1095, 300, { fontSize: '13vh', marginLeft: '-6.5vh', marginTop: '-6.5vh' }, 0, 'blk sc-sp-station');
        el(ROBOT, { left: '77vw', top: '70vh', fontSize: '20vh' }).classList.add('sc-sp-robot', 'blk');
        for (let i = 0; i < 14; i++) el('', { left: `${rand(0, 100)}vw`, top: `${rand(4, 80)}vh`, animationDelay: `-${rand(0, 4).toFixed(1)}s`, animationDuration: `${rand(2, 5).toFixed(1)}s` }).classList.add('sc-sp-twinkle');
      },
      update: spaceWatch,
      moments: [
        () => { for (let i = 0; i < pick([1, 2, 3]); i++) later(() => el('', { left: `${rand(10, 90)}vw`, top: `${rand(5, 40)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 600); },
        () => { const right = Math.random() < 0.5; drift(UFO, { from: [right ? -12 : 110, rand(8, 14)], to: [right ? 112 : -12, rand(8, 16)], dur: rand(7, 10), size: rand(70, 100) }).classList.add('sc-ufo'); cue('ufo', 800); },
        () => { const d = drift(ASTRONAUT, { from: [-10, rand(56, 74)], to: [rand(20, 40), rand(8, 26)], dur: rand(22, 28), size: rand(84, 108), spin: rand(-120, 120) }); d.classList.add('sc-sp-astro'); },
        () => drift('', { from: [110, rand(4, 12)], to: [-20, rand(20, 34)], dur: 3.5 }).classList.add('sc-comet'),
        () => drift('🚀', { from: [-8, 90], to: [60, -10], dur: 4, size: 56, spin: 0 }).classList.add('sc-rocket'),
        () => crossing('🛰️', { y: rand(6, 12), dur: 16, size: 46, bob: false }),
        // The space whale glides past along the top, glowing.
        () => { const right = Math.random() < 0.5; drift(WHALE, { from: [right ? -30 : 110, rand(3, 9)], to: [right ? 110 : -30, rand(2, 10)], dur: rand(36, 44), size: rand(260, 340) }).classList.add('sc-sp-whale', 'blk', right ? 'sc-face-r' : 'sc-face-l'); cue('moan', 2000); },
        // An alien floats through the lounge, upside down for a while, holding on to its drink.
        () => { const right = Math.random() < 0.5; drift(ALIEN, { from: [right ? -10 : 108, rand(78, 84)], to: [right ? 108 : -10, rand(70, 80)], dur: rand(24, 30), size: rand(80, 100), spin: right ? 300 : -300 }).classList.add('sc-sp-alien'); },
        () => { robotSays(pick(['Shaken, not stirred.', 'Another round, Earthlings?', 'Beep boop. Cheers.', 'Ice: 0 kelvin.'])); blobs(84, 72, 6); },
        // A meteor shower.
        () => { for (let i = 0; i < 9; i++) later(() => el('', { left: `${rand(20, 100)}vw`, top: `${rand(0, 30)}vh`, animation: 'sc-shoot 0.9s ease-out forwards' }, 1100).classList.add('sc-star'), i * rand(150, 400)); },
        // A starship goes past at warp: a streak and a flash.
        () => { el('', { left: '-40vw', top: `${rand(14, 40)}vh` }, 1400).classList.add('sc-sp-warp'); cue('warp'); },
      ],
    };

    // ----- The beer hall (see beerHall() in lib/roomArt.js) -----
    // The cuckoo clock on the wall ticks (and the cuckoo comes out), the wagon-wheel chandelier
    // sways with its candles going; the waitress carries eight steins at once, the tuba player
    // oompahs past, the dachshund trots through, two lads slap their shoes; steins go up and clink.
    // Every drink gets a "Prost!" and the steins, a finished drink the whole hall chanting "Ex!",
    // and the end of a game the band.
    const CUCKOO = `<svg viewBox="0 0 100 190" width="0.526em" height="1em" overflow="visible">
      <path d="M50 6 L98 50 H2Z" fill="#6a4424"/><path d="M50 14 L88 48 H12Z" fill="#8a5a30"/>${[20, 40, 60, 80].map((x) => `<path d="M${x} 50 q4 10 0 18" stroke="#5a3418" stroke-width="5" fill="none"/>`).join('')}
      <path d="M40 30 q10 -16 20 0 q-4 -6 -10 0 q-6 -6 -10 0Z" fill="#4a7a2a"/><rect x="12" y="50" width="76" height="80" fill="#a8743e"/>
      <rect x="40" y="56" width="20" height="18" fill="#3a2010"/><g class="sc-bh-door"><rect x="40" y="56" width="20" height="18" fill="#6a4424" stroke="#3a2010"/></g>
      <g class="sc-bh-bird"><g transform="translate(36 52) scale(0.3)">${critter('bird', { pose: 'perch', color: '#c0392b', still: true }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></g>
      <circle cx="50" cy="100" r="22" fill="#f6efe0" stroke="#5a3418" stroke-width="3"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${(50 + 18 * Math.sin((i * Math.PI) / 6)).toFixed(1)} ${(100 - 18 * Math.cos((i * Math.PI) / 6)).toFixed(1)} L${(50 + 21 * Math.sin((i * Math.PI) / 6)).toFixed(1)} ${(100 - 21 * Math.cos((i * Math.PI) / 6)).toFixed(1)}" stroke="#3a2010" stroke-width="2"/>`).join('')}
      <path d="M50 100 L50 86 M50 100 L60 104" stroke="#3a2010" stroke-width="2.5" stroke-linecap="round"/><path d="M20 130 h60 l-6 10 h-48Z" fill="#6a4424"/>
      <g class="sc-bh-pend"><path d="M50 130 V170" stroke="#c9a24a" stroke-width="2"/><circle cx="50" cy="174" r="8" fill="#c9a24a"/></g>
      <path d="M34 140 V178 M66 140 V164" stroke="#3a2010" stroke-width="1.2"/><path d="M30 178 q4 -12 8 0 q-4 10 -8 0Z M62 164 q4 -12 8 0 q-4 10 -8 0Z" fill="#5a3418"/></svg>`;
    const WHEEL = `<svg viewBox="0 0 160 110" width="1em" height="0.69em" overflow="visible"><path d="M80 -200 V40 M80 40 L20 70 M80 40 L140 70 M80 40 L56 80 M80 40 L104 80" stroke="#3a2a1a" stroke-width="2"/>
      <ellipse cx="80" cy="76" rx="70" ry="14" fill="none" stroke="#5a3418" stroke-width="8"/><ellipse cx="80" cy="76" rx="20" ry="5" fill="#5a3418"/>
      ${[18, 48, 80, 112, 142].map((x, i) => { const y = 76 - Math.sqrt(Math.max(0, 1 - ((x - 80) / 70) ** 2)) * (i % 2 ? -10 : 10); return `<rect x="${x - 3}" y="${y - 20}" width="6" height="16" fill="#f6efe0"/><g class="sc-bh-flame" style="animation-delay:-${(i * 0.07).toFixed(2)}s"><path d="M${x} ${y - 32} q-5 7 0 12 q5 -5 0 -12Z" fill="#ffb347"/><circle cx="${x}" cy="${y - 26}" r="10" fill="#ffd27a" opacity="0.25"/></g>`; }).join('')}</svg>`;
    // (Kit figures, in BH_DIRNDL and BH_LEDERHOSEN: see the Oktoberfest egg.) The waitress, four
    // steins in each hand; the tuba player (his tuba is fg-tuba, oompahing); the dachshund in its
    // little Bavarian coat; the lads slapping their shoes.
    const WAITRESS = figure({ ...BH_DIRNDL, hair: 'long', pose: 'carry', arms: ['carry', 'carry'], holding: 'steins', holdingBack: 'steins', cls: 'fg-walk' });
    const TUBA = figure({ ...BH_LEDERHOSEN, beard: 'moustache', blush: true, build: 'stout', pose: 'carry', arms: ['hold', 'hold'], holding: 'tuba', cls: 'fg-walk' });
    const DACHSHUND = critter('dachshund', { coat: '#2a6fdb' });
    const LAD = (i) => figure({ ...BH_LEDERHOSEN, skin: skinFor(i + 1), hairColor: ['blonde', 'brown'][i % 2], hatColor: ['#3a5a2a', '#5a3a1e'][i % 2], pose: 'dance' });
    const steinsUp = (x = 80) => {
      for (const [dx, d, r] of [[-6, 0, -14], [0, 0.12, 0], [6, 0.06, 14]]) el(STEIN, { left: `${x + dx}vw`, bottom: '-2vh', fontSize: '15vh', '--r': `${r}deg`, animationDelay: `${d}s` }, 3200).classList.add('sc-bh-up', 'blk');
      cue('clink', 1100);
      later(() => burst(['💧', '•', '•'], { x: x + 3, y: 72, n: 10, spread: 4, size: [8, 14], colors: ['#fffaf0', '#ffe08a'], rise: [-10, -4], fall: [4, 10] }), 1100);
    };
    const waitress = () => { const right = Math.random() < 0.5; drift(WAITRESS, { from: [right ? -10 : 104, 66], to: [right ? 104 : -10, 66], dur: 15, size: 0.3 * innerHeight }).classList.add('sc-bh-walker', right ? 'sc-face-r' : 'sc-face-l'); };
    const band = () => {
      const right = Math.random() < 0.5;
      drift(TUBA, { from: [right ? -10 : 104, 66], to: [right ? 104 : -10, 66], dur: 18, size: 0.3 * innerHeight }).classList.add('sc-bh-walker', right ? 'sc-face-r' : 'sc-face-l');
      cue('chord'); cue('chord', 1600);
      shower(10, 0.6, () => { const r = layer?.querySelector('.sc-bh-walker .fg-tuba')?.getBoundingClientRect(); if (r) drift(pick(['♪', '♫', '♬']), { from: [((r.left + r.width / 2) / innerWidth) * 100, ((r.top) / innerHeight) * 100], to: [((r.left + r.width / 2) / innerWidth) * 100 + rand(-6, 6), rand(30, 50)], dur: rand(3, 5), size: rand(24, 34), opacity: 0.85, extra: { color: '#2a6fdb' } }); });
    };
    const cuckoo = () => {
      const c = layer?.querySelector('.sc-bh-cuckoo');
      if (!c) return;
      c.classList.remove('out'); void c.offsetWidth; c.classList.add('out');
      for (let i = 0; i < 3; i++) later(() => say('Kuckuck!', 9, 12 + i * 0.5, 'bh', 900), 400 + i * 1000);
    };
    const exChant = (name) => {
      const d = inFront(`<b>Ex! Ex! Ex!</b>${name ? `<small>${name}</small>` : ''}`, { left: '0', right: '26vw', top: '28vh' }, 3600);
      d.classList.add('sc-quote', 'prost', 'sc-bh-ex');
      cue('chant'); cue('cheer', 1800);
    };
    const beerWatch = watchRoom({
      drink: (list) => { say(`Prost, ${who(list)}!`, 82, 64, 'bh r'); steinsUp(rand(74, 84)); },
      finish: (p) => { exChant(esc(p.name)); steinsUp(78); later(() => steinsUp(6), 400); },
      end: () => {
        inFront('<b>Prost!</b>', { left: '0', right: '26vw', top: '30vh' }, 3000).classList.add('sc-quote', 'prost');
        burst(['🍺', '🍻', '🥨'], { x: 36, y: 40, n: 20, spread: 30 });
        cue('clink'); cue('cheer', 300);
        later(band, 1200);
      },
    });
    SCENES.beerhall = {
      decor() {
        beerWatch(null);
        el('', { left: '0', top: '0', width: '100vw', height: '10vh' }).classList.add('sc-bunting');
        el(CUCKOO, { left: '1.2vw', top: '11vh', fontSize: '19vh' }).classList.add('sc-bh-cuckoo', 'blk');
        el(WHEEL, { left: '64vw', top: '3vh', fontSize: '11vw' }).classList.add('sc-bh-wheel', 'blk');
      },
      update: beerWatch,
      moments: [
        () => bubbles(['beer']),
        () => {
          el(STEIN, { left: '-10vw', bottom: '4vh', fontSize: '110px' }, 3200).classList.add('sc-stein', 'l');
          el(STEIN, { right: '-10vw', bottom: '4vh', fontSize: '110px' }, 3200).classList.add('sc-stein', 'r');
          cue('clink', 1100);
        },
        waitress,
        band,
        cuckoo,
        () => { const right = Math.random() < 0.5; drift(DACHSHUND, { from: [right ? -10 : 104, 88], to: [right ? 104 : -10, 88], dur: 9, size: 0.14 * innerHeight }).classList.add('sc-bh-dog', 'blk', right ? 'sc-face-r' : 'sc-face-l'); },
        // Two lads in lederhosen slap their shoes (the Schuhplattler) across the floor.
        () => { for (let i = 0; i < 2; i++) later(() => vvWalk(LAD(i), { vh: 24, dur: 12, cls: ['sc-bh-hop'] }), i * 700); cue('snaps', 800); cue('snaps', 2400); },
        () => steinsUp(rand(74, 84)),
        () => { slide('🍺', { y: 91, size: 48 }); cue('slide', 200); },
        () => crossing('🥨', { y: 94, dur: 4, size: 44, bob: false, cls: ['roll'] }),
        () => { cue('yodel'); notes(5, 80, '#2a6fdb'); },
        () => { burst(['🫧', '🍺', '🫧'], { x: 4, y: 82, n: 16, spread: 10, size: [16, 26] }); cue('pop'); },
      ],
    };

    // ----- The vineyard, afternoon and sunset (see tuscany() in lib/roomArt.js) -----
    // Grapes hang swaying from the pergola; butterflies by day, fireflies at dusk. Nonna comes out
    // with a basket of grapes and tells everyone to eat; a couple zip past on a Vespa; someone
    // stomps grapes in a tub, purple everywhere; a wild boar trots through; the accordion player
    // strolls by; swallows wheel over the vines. Every drink gets "Salute!" and two glasses
    // clinking, a finished drink "Alla goccia!", the end of a game a cork popping and Nonna.
    // (All the kit's.) Nonna: grey bun, her glasses, black dress and white apron, a basket of grapes.
    const NONNA = figure({ face: 'glasses', blush: true, hair: 'bun', hairColor: 'grey', skin: 'light', top: '#1e1a20', topStyle: 'apron', accent: '#f6f0e2', bottom: '#1e1a20', bottomStyle: 'gown', shoes: '#141010', build: 'stout', arms: ['down', 'hold'], holding: 'basket' });
    // A couple on a Vespa (the scooter in the kit's ink), her scarf flying.
    const VESPA = `<svg viewBox="0 0 170 120" width="1em" height="0.706em" overflow="visible">
      <path class="sc-vy-scarf" d="M50 34 Q30 30 12 40 Q26 36 36 44 Q20 46 8 56 Q32 48 48 44Z" fill="#c0392b" ${ink}/>
      <path d="M40 92 Q40 66 64 62 H96 L104 40 H112 L116 64 Q140 66 146 92Z" fill="#8fd4c0" ${ink}/><path d="M44 88 Q46 72 66 68 H92" stroke="#fff" stroke-width="3" fill="none" opacity="0.6"/>${inked('M104 40 L110 18 H126', '#4a4a4a', 3)}<circle cx="126" cy="18" r="5" fill="#e8e8e8" ${ink}/>
      <ellipse cx="72" cy="62" rx="26" ry="6" fill="#5a3a1e" ${ink}/>
      ${figureAt(48, 92, 68, { hair: 'long', hairColor: 'brown', skin: 'pale', blush: true, top: '#e8a0b0', neck: 'scarf', accent: '#c0392b', bottom: '#f4ecd8', bottomStyle: 'skirt', pose: 'ride', arms: ['ride', [70, 30]] })}
      ${figureAt(72, 93, 74, { hair: 'quiff', hairColor: 'black', skin: 'light', face: 'shades', top: '#2a4a8a', bottom: '#3a3040', pose: 'ride', arms: ['ride', [80, 16]] })}
      ${[56, 136].map((x) => `<g class="sc-tyre"><circle cx="${x}" cy="96" r="16" fill="#1a1a1a" ${ink}/><circle cx="${x}" cy="96" r="7" fill="#c8c8c8" ${ink}/><path d="M${x - 6} 96 h12 M${x} 90 v12" stroke="#6a6a6a" stroke-width="2"/></g>`).join('')}
      <path d="M150 64 l12 -2" stroke="#ffd860" stroke-width="5" stroke-linecap="round"/></svg>`;
    const BOAR = critter('boar');
    // Someone stomping grapes in a tub, arms up, purple to the knees (legs: sc-vy-stompL/R).
    const STOMPER = `<svg viewBox="0 0 120 150" width="0.8em" height="1em" overflow="visible">
      ${figureAt(60, 140, 132, { facing: 'front', hair: 'curly', hairColor: 'brown', skin: 'tan', face: 'grin', top: '#f2ead6', topStyle: 'braces', accent: '#5a7aaa', sleeves: 'short', bottom: '#5a7aaa', bottomStyle: 'shorts', shoes: '#6a2a6a', arms: [[160, 14], [160, 14]], hooks: { legB: 'sc-vy-stompL', legF: 'sc-vy-stompR' } })}
      <path d="M14 112 Q60 104 106 112 L100 150 H20Z" fill="#8a5a2e" ${ink}/><ellipse cx="60" cy="112" rx="46" ry="8" fill="#5a1a4a" ${ink}/>${[[30, 110], [44, 108], [78, 108], [90, 111], [60, 107]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#7a2a8a" ${ink}/>`).join('')}
      <path d="M16 124 Q60 116 104 124 M18 138 Q60 130 102 138" stroke="#3a3a3a" stroke-width="4" fill="none"/></svg>`;
    // The accordion player in his straw hat, strolling (legs: sc-legs-f/b), squeezing away.
    const ACCORDION = figure({ hat: 'fedora', hatColor: '#e8d098', hatAccent: '#2a2a3a', beard: 'moustache', hairColor: 'black', skin: 'tan', top: '#f2ead6', neck: 'scarf', accent2: '#c0392b', bottom: '#2a2a3a', belt: '#2a2a3a', arms: ['squeezeB', 'squeezeF'], holding: 'accordion', hooks: { legF: 'sc-legs-f', legB: 'sc-legs-b' } });
    const GRAPES = (c = '#5a2a6a') => `<svg viewBox="0 0 40 70" width="0.57em" height="1em"><path d="M20 0 V12" stroke="#5a3a1e" stroke-width="2.5"/><path d="M20 10 q14 -8 20 2 q-12 6 -20 -2Z" fill="#5f8a2a"/>
      ${[[20, 18], [12, 18], [28, 18], [16, 26], [24, 26], [8, 26], [32, 26], [12, 34], [20, 34], [28, 34], [16, 42], [24, 42], [20, 50], [12, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="${c}"/><circle cx="${x - 1.6}" cy="${y - 1.6}" r="1.6" fill="#fff" opacity="0.35"/>`).join('')}</svg>`;
    const GLASS = `<svg viewBox="0 0 40 90" width="0.444em" height="1em"><path d="M6 4 Q4 40 20 46 Q36 40 34 4Z" fill="rgba(240,248,255,0.35)" stroke="#e8f0f4" stroke-width="2"/><path d="M7 22 Q8 42 20 44 Q32 42 33 22Z" fill="#8a1424"/><path d="M20 46 V82 M8 86 Q20 80 32 86" stroke="#e8f0f4" stroke-width="3" fill="none"/></svg>`;
    const nonna = (line, sunset) => {
      const d = el(NONNA, { left: '0', top: '66vh', fontSize: `${0.28 * innerHeight}px` }, 22000);
      d.classList.add('sc-vy-walker', 'slow', 'sc-face-l');
      d.animate([{ transform: 'translateX(104vw)' }, { transform: 'translateX(82vw)', offset: 0.22 }, { transform: 'translateX(82vw)', offset: 0.45 }, { transform: 'translateX(-12vw)' }], { duration: 21000, fill: 'forwards' });
      later(() => d.classList.add('stop'), 4600);
      later(() => say(line || pick(sunset ? ['Mangia! It’s getting late.', 'Who wants more pasta?', 'Che bella serata!'] : ['Mangia, mangia!', 'You’re too thin. Eat!', 'These grapes, from my own vines!', 'Another glass? Of course.']), 82, 69, 'vy r'), 5000);
      later(() => d.classList.remove('stop'), 9400);
    };
    const vespa = () => { const right = Math.random() < 0.5; drift(VESPA, { from: [right ? -16 : 104, 74], to: [right ? 106 : -16, 74], dur: 4.2, size: 0.2 * innerHeight / 0.706 }).classList.add('sc-vy-vespa', 'blk', right ? 'sc-face-r' : 'sc-face-l'); cue('vespa'); };
    const stomp = () => {
      el(STOMPER, { left: '78vw', bottom: '9vh', fontSize: '24vh' }, 8000).classList.add('sc-vy-stomp', 'blk');
      for (let i = 0; i < 5; i++) later(() => burst(['●', '•', '●'], { x: 84, y: 82, n: 10, spread: 5, size: [6, 14], colors: ['#6a1a5a', '#8a2a7a', '#4a1040'], rise: [-14, -5], fall: [2, 12] }), 1400 + i * 900);
      cue('splash', 1500); cue('splash', 3300);
    };
    const accordion = () => {
      const right = Math.random() < 0.5;
      const d = drift(ACCORDION, { from: [right ? -10 : 104, 67], to: [right ? 104 : -10, 67], dur: 19, size: 0.28 * innerHeight });
      d.classList.add('sc-vy-walker', right ? 'sc-face-r' : 'sc-face-l');
      shower(12, 0.7, () => { const r = d.getBoundingClientRect(); drift(pick(['♪', '♫', '♬']), { from: [((r.left + r.width / 2) / innerWidth) * 100, ((r.top + r.height * 0.3) / innerHeight) * 100], to: [((r.left + r.width / 2) / innerWidth) * 100 + rand(-6, 6), rand(30, 50)], dur: rand(3, 5), size: rand(24, 32), opacity: 0.85, extra: { color: '#7a1f2b' } }); });
    };
    const clink = () => {
      el(GLASS, { left: '74vw', bottom: '-2vh', fontSize: '18vh', '--r': '16deg' }, 3200).classList.add('sc-bh-up', 'blk');
      el(GLASS, { left: '80vw', bottom: '-2vh', fontSize: '18vh', '--r': '-16deg', animationDelay: '0.1s' }, 3200).classList.add('sc-bh-up', 'blk');
      cue('clink', 1100);
      later(() => burst(['✨', '•'], { x: 79, y: 74, n: 8, spread: 4, size: [10, 16], colors: ['#ffe8a0', '#ffffff'], rise: [-8, -2], fall: [0, 6] }), 1100);
    };
    function vineyardScene(sunset) {
      const watch = watchRoom({
        drink: (list) => { say(pick([`Salute, ${who(list)}!`, `Cin cin, ${who(list)}!`, `Alla salute, ${who(list)}!`]), 84, 62, 'vy r'); clink(); },
        finish: (p) => { inFront(`<b>Alla goccia!</b><small>${esc(p.name)}</small>`, { left: '0', right: '26vw', top: '28vh' }, 3400).classList.add('sc-quote', 'sc-vy-shout'); clink(); stomp(); cue('cheer', 600); },
        end: () => {
          cue('pop');
          burst(['🍾', '✨', '🎉', '🍇'], { x: 36, y: 40, n: 26, spread: 30 });
          inFront('<b>Bravi!</b>', { left: '0', right: '26vw', top: '30vh' }, 3000).classList.add('sc-quote', 'sc-vy-shout');
          later(() => nonna(pick(['Bravi, bravi! Now eat.', 'Champions! More wine!', 'Who won? Everybody eats.']), sunset), 1200);
          later(accordion, 3000);
        },
      });
      return {
        decor() {
          watch(null);
          // Bunches hanging from the pergola, swaying (by the heading's left and in the gap).
          for (const [x, s, d] of [[4, 9, 0], [9.5, 7, -1.3], [66, 10, -0.6], [70.5, 7.5, -2]]) el(GRAPES(pick(['#5a2a6a', '#4a2a6a', '#6a2a5a'])), { left: `${x}vw`, top: '6vh', fontSize: `${s}vh`, animationDelay: `${d}s` }).classList.add('sc-vy-bunch', 'blk');
          if (sunset) for (let i = 0; i < 8; i++) el('', { left: `${rand(0, 100)}vw`, top: `${rand(40, 85)}vh`, animation: `sc-fly ${rand(4, 7).toFixed(1)}s ease-in-out -${rand(0, 6).toFixed(1)}s infinite alternate`, '--sx': `${rand(-10, 10)}vw`, '--sy': `${rand(-8, 8)}vh` }).classList.add('sc-firefly');
          else for (let i = 0; i < 2; i++) el(critter('butterfly', { color: ['#f08a24', '#f4d040'][i] }), { left: `${[3, 68][i]}vw`, top: `${[52, 62][i]}vh`, fontSize: '28px', animationDelay: `-${i * 3}s` }).classList.add('sc-vy-butterfly');
        },
        update: (s) => watch(s),
        moments: [
          () => nonna(null, sunset),
          vespa,
          stomp,
          accordion,
          () => flock(SWALLOW, sunset ? { n: [7, 11] } : {}),
          () => { const right = Math.random() < 0.5; drift(BOAR, { from: [right ? -12 : 104, 80], to: [right ? 104 : -12, 80], dur: 7, size: 0.16 * innerHeight / 0.615 }).classList.add('sc-vy-boar', 'blk', right ? 'sc-face-r' : 'sc-face-l'); cue('thud', 200); cue('thud', 900); },
          clink,
          () => { burst(['🍷', '✨', '🍇'], { x: 4, y: 82, n: 14, spread: 10, size: [18, 28] }); cue('clink'); },
          () => { const x = rand(3, 12); drift(GRAPES(), { from: [x, 8], to: [x, 92], dur: 1.2, size: 50, spin: 90, extra: { animationTimingFunction: 'ease-in' } }).classList.add('blk'); cue('thud', 1200); },
          ...(sunset
            ? [fireflies, () => popup(critter('owl', { color: '#6a5444' }), { x: 2, bottom: 2, size: 52, life: 5000 }), () => { for (let i = 0; i < 2; i++) later(() => el('', { left: `${rand(10, 60)}vw`, top: `${rand(3, 12)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 800); }]
            : [() => flutter(critter('butterfly', { color: pick(['#f08a24', '#f4d040', '#6aa0f0']) }), 2), () => flutter(critter('bee'), 1), () => crossing(critter('dog', { color: '#c8a070' }), { y: 90, dur: 8, size: 64, faces: 'right' })]),
        ],
      };
    }
    SCENES.vineyard = vineyardScene(false);
    SCENES.vineyardSunset = vineyardScene(true);

    SCENES.lighthouse = lighthouseScene('night');
    SCENES.lighthouseDay = lighthouseScene('day');
    SCENES.lighthouseFog = lighthouseScene('fog');
    SCENES.storm = lighthouseScene('storm');
  }

  // ---------- The five regular rooms: dive, tavern, club, castle, jazz ----------
  // Their background art is drawn whole (diveBar, tavernInn, clubFloor, greatHall and jazzStage in
  // lib/roomArt.js); what moves is laid over it here, found by its place in the art's 1600 x 900.
  // Each room has its people (the barman, the barmaid, the DJ, the king, the band) busy all the
  // time, its lights and fires alive, moments every so often, and an eye on the game: someone
  // drinking, and the game won.
  {
    // Where a point of the art is on screen, in vw/vh (the art covers the screen, centred on the
    // room's `focus` across: see roomStyles.js), and an art length in px.
    const scale5 = () => Math.max(innerWidth / 1600, innerHeight / 900);
    const at5 = (x, y) => {
      const s = scale5();
      const f = window.ROOM_STYLES?.STYLES?.[current]?.focus ?? 0.5;
      return [(((innerWidth - 1600 * s) * f + x * s) / innerWidth) * 100, (((innerHeight - 900 * s) / 2 + y * s) / innerHeight) * 100];
    };
    const px5 = (n) => n * scale5();
    // Something put on the art: its top left at (x, y), `w` wide (its drawing is 1em wide).
    const put = (html, x, y, w, cls = [], life = 0, extra = {}) => {
      const [l, t] = at5(x, y);
      const d = el(html, { left: `${l}vw`, top: `${t}vh`, fontSize: `${px5(w)}px`, ...extra }, life);
      d.classList.add('blk', ...cls);
      return d;
    };
    // A soft light (over a sign, a fire, a candle), centred on (x, y).
    const light = (x, y, w, h, color, cls = [], life = 0) => {
      const [l, t] = at5(x - w / 2, y - h / 2);
      const d = el('', { left: `${l}vw`, top: `${t}vh`, width: `${px5(w)}px`, height: `${px5(h)}px`, background: `radial-gradient(closest-side, ${color}, transparent)` }, life);
      d.classList.add('sc5-light', ...cls);
      return d;
    };
    // A flame standing on (x, y), `h` tall.
    const flame = (x, y, h, cls = []) => {
      const [l, t] = at5(x, y);
      const d = el('', { left: `${l}vw`, top: `${t}vh`, width: `${px5(h * 0.62)}px`, height: `${px5(h)}px`, marginLeft: `${-px5(h * 0.31)}px`, marginTop: `${-px5(h)}px`, animationDelay: `-${rand(0, 1).toFixed(2)}s` });
      d.classList.add('sc-flame', 'sc5-flame', ...cls);
      return d;
    };
    // Someone walking across the floor (drawn facing right), `h` px tall, feet at `y` vh. (Half as
    // wide as tall at most: a kit figure is 0.5em.)
    const walk = (svg, { h, y = 99, dur, cls = [], right = Math.random() < 0.5 }) => {
      const w = ((h * 0.5) / innerWidth) * 100;
      const top = y - (h / innerHeight) * 100;
      const d = drift(svg, { from: [right ? -w - 2 : 102, top], to: [right ? 102 : -w - 2, top], dur, size: h });
      d.classList.add('blk', 'sc5-walk', ...cls, right ? 'sc-face-r' : 'sc-face-l');
      return d;
    };
    // Words over the table, in the room's own lettering.
    const quote5 = (text, cls, top = '30vh', life = 3000) => inFront(`<b>${text}</b>`, { left: '0', right: '26vw', top }, life).classList.add('sc-quote', 'sc5-say', cls);

    // A person, simply drawn, facing right (60 x 140): legs that stride, a back arm, the body,
    // the front arm (holding something), the head; `dress` for a skirt to the ankle.
    const FOLK = ({ skin = '#e2b48a', hair = '#3a2414', top = '#7a2a1a', bottom = '#2a2a3a', shoes = '#1a1410', hat = '', hold = '', dress = false, arm = 'M34 46 Q44 62 46 76', back = 'M26 46 Q20 64 22 80' } = {}) => `<svg viewBox="0 0 60 140" width="0.43em" height="1em" overflow="visible">
      ${dress ? `<g class="sc-legs-b"><path d="M27 108 V134" stroke="${skin}" stroke-width="5"/><path d="M23 135 h8" stroke="${shoes}" stroke-width="5" stroke-linecap="round"/></g><g class="sc-legs-f"><path d="M33 108 V134" stroke="${skin}" stroke-width="5"/><path d="M31 135 h8" stroke="${shoes}" stroke-width="5" stroke-linecap="round"/></g>`
        : `<g class="sc-legs-b"><path d="M26 92 L25 130" stroke="${bottom}" stroke-width="10" stroke-linecap="round"/><path d="M22 134 h11" stroke="${shoes}" stroke-width="6" stroke-linecap="round"/></g><g class="sc-legs-f"><path d="M34 92 L35 130" stroke="${bottom}" stroke-width="10" stroke-linecap="round"/><path d="M32 134 h11" stroke="${shoes}" stroke-width="6" stroke-linecap="round"/></g>`}
      <path d="${back}" stroke="${top}" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${dress ? `<path d="M21 44 Q30 38 39 44 L50 112 Q30 118 10 112Z" fill="${top}"/>` : `<path d="M20 44 Q30 38 40 44 L42 96 H18Z" fill="${top}"/>`}
      <g class="sc5-arm"><path d="${arm}" stroke="${top}" stroke-width="7" fill="none" stroke-linecap="round"/>${hold}</g>
      <rect x="27" y="34" width="7" height="8" fill="${skin}"/><circle cx="31" cy="26" r="11" fill="${skin}"/><path d="M20 26 Q20 12 31 12 Q42 12 42 22 Q34 18 26 22 Q24 28 20 26Z" fill="${hair}"/><circle cx="37" cy="25" r="1.4" fill="#1a1010"/>
      ${hat}</svg>`;

    // What the people here do when the game does something: someone drinks, the game's won. Each
    // room says what (`on.drink(who)`, `on.over(winner's name or null)`).
    let seen5 = null;
    let lastDrink5 = 0;
    const watch5 = (s, on) => {
      const now = { no: s?.gameNo, phase: s?.phase, drinks: Object.fromEntries((s?.players || []).map((p) => [p.id, p.drinks || 0])) };
      const was = seen5;
      seen5 = now;
      // The first look (the TV just came on, or a new game): nothing to react to yet.
      if (!s || !was || was.no !== now.no) return;
      const who = (s.players || []).filter((p) => now.drinks[p.id] > (was.drinks[p.id] ?? Infinity)).map((p) => ({ name: esc(p.name), n: now.drinks[p.id] - was.drinks[p.id] }));
      if (who.length && Date.now() - lastDrink5 > 2500) {
        lastDrink5 = Date.now();
        on.drink?.(who);
      }
      if (now.phase === 'over' && was.phase !== 'over') {
        const w = s.game?.winnerId ?? s.game?.winner;
        const p = s.players?.find((x) => x.id === w);
        on.over?.(p ? esc(p.name) : null);
      }
    };
    const sips = (who) => who.slice(0, 3).map((w) => `${w.name} +${w.n}`).join(' · ') + (who.length > 3 ? ' …' : '');

    // ----- The dive bar -----
    // The barman behind the bar (from the waist up: the bar hides the rest), polishing a glass;
    // his arm is `sc5-polish` (it pours too, see pour()).
    const BARMAN = figure({ skin: 'light', hair: 'receding', hairColor: 'brown', beard: 'moustache', top: '#e8e4dc', sleeves: 'short', topStyle: 'vest', accent: '#1a1a1e', neck: 'bow', accent2: '#8a1a2a', build: 'broad', pose: 'polish', holding: 'cloth', crop: 'waist', hooks: { armF: 'sc5-polish' } });
    const PINT = `<svg viewBox="0 0 30 40" width="1em" height="1.33em"><path d="M4 6 L8 38 H22 L26 6Z" fill="rgba(255,190,70,0.9)" stroke="#fff8e0" stroke-width="1.5"/><path d="M3 4 Q15 -2 27 4 V9 H3Z" fill="#fffaf0"/><path d="M9 12 v20" stroke="#fff" stroke-width="2" opacity="0.5"/></svg>`;
    // A regular, weaving his way to the bathroom out back, his bottle with him.
    const DRUNK = figure({ skin: 'tan', hat: 'beanie', hatColor: '#2a4a6a', face: 'sleepy', beard: 'stubble', hairColor: 'brown', top: '#4a5a3a', topStyle: 'plaid', accent: '#2a3a20', bottom: '#3a3028', pose: 'walk', holding: 'bottle' });
    // The vermin: the mouse along the skirting, the fly, the cockroach.
    const DIVE_MOUSE = critter('mouse');
    const DIVE_FLY = critter('fly');
    const ROACH = critter('roach');
    // Where the bulbs are on the string of lights along the ceiling (see diveBar).
    const BULBS = [];
    for (let i = 0; i < 4; i++) for (let k = 1; k < 8; k++) { const t = k / 8; BULBS.push([i * 400 + t * 400, 99 + 4 * t * (1 - t) * 58]); }
    // Chalked up on the scoreboard under the dartboard.
    const chalk = (text) => { const d = put(`<b>${text}</b>`, 24, 486, 126, ['sc5-chalk'], 6500); d.style.width = `${px5(126)}px`; d.style.height = `${px5(94)}px`; };
    // The BEER sign sputters out; the barman thumps the wall and it comes back on.
    const sputter = () => { put('', 22, 152, 166, ['sc5-sputter'], 2600, { width: `${px5(166)}px`, height: `${px5(76)}px` }); cue('thud', 2200); };
    const slidePint = (to = 1440) => {
      const [x0, y] = at5(1084, 668);
      const [x1] = at5(to, 668);
      el(PINT, { left: `${x0}vw`, top: `${y}vh`, fontSize: `${px5(24)}px`, '--dx': `${x1 - x0}vw`, animation: 'sc-slide 3.6s cubic-bezier(0.1, 0.7, 0.3, 1) forwards' }, 3800).classList.add('blk');
      cue('slide', 100);
    };
    const pour = () => {
      const b = layer.querySelector('.sc5-barman');
      b?.classList.add('pour');
      later(() => b?.classList.remove('pour'), 1600);
      later(() => slidePint(), 900);
    };
    SCENES.dive = {
      decor() {
        seen5 = null;
        light(105, 190, 260, 150, 'rgba(255, 154, 42, 0.32)', ['sc5-buzz']);
        light(1100, 312, 220, 340, 'rgba(255, 58, 36, 0.3)', ['sc5-buzz', 'b']);
        // The fan's blades going round (the art has them as a blur).
        put(`<svg viewBox="-160 -20 320 40" width="1em" height="0.125em"><g transform="scale(1 0.14)"><g class="sc-blades">${[0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a})" d="M14 -10 L150 -18 Q158 0 150 18 L14 10Z" fill="#3a2a20" stroke="#1a120c" stroke-width="6"/>`).join('')}</g></g></svg>`, 650, 106, 300, ['sc-fan', 'sc5-fan']);
        // Some of the lights twinkling (a dead one too, now and then).
        BULBS.forEach(([x, y], i) => { if (i % 3 === 0) light(x, y, 36, 36, pick(['rgba(255,74,74,0.7)', 'rgba(255,210,63,0.7)', 'rgba(74,212,255,0.7)', 'rgba(255,138,216,0.7)']), ['sc5-twinkle']).style.animationDelay = `-${rand(0, 6).toFixed(1)}s`; });
        // The jukebox's lights going round.
        light(84, 690, 170, 130, 'rgba(255, 74, 200, 0.4)', ['sc5-juke']);
        light(84, 690, 170, 130, 'rgba(74, 212, 255, 0.35)', ['sc5-juke', 'b']);
        // (A figure is 1em tall: 180 of the art's units, his waist at the bar top, 704.)
        put(BARMAN, 984, 590, 180, ['sc5-barman']);
        put('<b>z</b><b>z</b><b>z</b>', 1446, 632, 40, ['sc5-zzz']);
        el('', { left: '-20vw', top: '8vh', width: '140vw', height: '50vh' }).classList.add('sc5-haze');
      },
      update: (s) => watch5(s, {
        drink: (who) => { pour(); chalk(sips(who)); },
        over: (name) => { cue('clink'); cue('cheer', 300); slidePint(1300); later(() => slidePint(1460), 700); quote5(name ? `Next round’s on ${name}!` : 'Another round!', 'dive'); },
      }),
      moments: [
        // A dart flies in and sticks in the board; the score's chalked up.
        () => {
          const [x, y] = at5(70, 380);
          el(DART, { left: '-12vw', top: `${y}vh`, fontSize: `${px5(60)}px`, '--dx': `${x + 12}vw`, '--dy': '0vh', '--spin': '0deg', animation: 'sc-drift 0.45s ease-out forwards' }, 7000);
          cue('thud', 450);
          later(() => chalk(pick(['60!', '26…', 'BULL!', '180?!', 'T20'])), 900);
        },
        sputter,
        // The barman pulls a pint and slides it down the bar.
        pour,
        () => { const right = Math.random() < 0.5; drift(DIVE_MOUSE, { from: [right ? -6 : 104, 94], to: [right ? 104 : -6, 94], dur: rand(3, 4.5), size: 50 }).classList.add('sc-mouse', right ? 'sc-face-r' : 'sc-face-l'); },
        // A fly bothers the regular asleep at the end of the bar.
        () => { const [x, y] = at5(1430, 650); el(DIVE_FLY, { left: `${x}vw`, top: `${y}vh`, fontSize: '18px' }, 9000).classList.add('sc-fly'); },
        // The jukebox kicks in: notes, its lights going faster.
        () => { const [x, y] = at5(84, 640); notes(x, y, '#ff8ad8', 7); layer.querySelectorAll('.sc5-juke').forEach((j) => { j.classList.add('loud'); later(() => j.classList.remove('loud'), 8000); }); cue('chord'); },
        () => walk(DRUNK, { h: px5(170), y: 99.5, dur: rand(14, 18), cls: ['sc5-drunk'] }),
        () => { slide('🍺', { y: 91, size: 48 }); cue('slide', 200); },
        () => crossing('🎱', { y: 94, dur: 3.5, size: 34, bob: false, cls: ['roll'] }),
        () => popup(ROACH, { x: rand(2, 8), bottom: 1, size: 44, life: 3500 }),
      ],
    };

    // ----- The tavern -----
    // The barmaid behind the counter (from the front, from the waist up), wiping a tankard: her
    // tankard hand is `sc5-wipe` (it goes up for a toast, see `cheers`).
    const BARMAID = figure({ facing: 'front', skin: 'pale', blush: true, hair: 'long', hairColor: '#a0441a', hat: 'headband', hatColor: '#e8dcc0', top: '#f0e4c8', sleeves: 'short', topStyle: 'dirndl', accent: '#6a2a1a', accent2: '#e8c070', arms: [[12, -96], [12, -84]], holding: 'tankard', holdingBack: 'rag', crop: 'waist', hooks: { armF: 'sc5-wipe' } });
    // The bard strolling and playing: feathered cap, a lute.
    const BARD = figure({ skin: 'light', hair: 'long', hairColor: '#c88a3a', beard: 'goatee', hat: 'feathercap', hatColor: '#8a2a2a', top: '#2a6a4a', bottom: '#8a2a2a', shoes: '#3a2414', pose: 'play', holding: 'lute', cls: 'fg-walk' });
    // A serving girl with a tray of tankards.
    const SERVING = figure({ skin: 'pale', blush: true, hair: 'bun', hairColor: '#a0441a', top: '#f0e4c8', sleeves: 'short', topStyle: 'dirndl', accent: '#6a2a1a', bottom: '#6a2a1a', bottomStyle: 'skirt', shoes: '#3a2414', pose: 'serve', tray: ['tankard', 'tankard', 'tankard'], holding: 'tray', propColor: '#8a6a44', cls: 'fg-walk' });
    const OWL = critter('owl', { color: '#3a2e28' });
    const TAVERN_CAT = critter('cat', { color: '#8a8278' });
    const TAVERN_DOG = critter('dog', { pose: 'sleep', color: '#9a6a3a' });
    // A log settles in the fire: a shower of sparks, the room lit up a moment.
    const hearthFlare = () => {
      cue('thud');
      const [x, y] = at5(136, 800);
      burst(['•', '●', '•'], { x, y, n: 18, spread: 5, size: [4, 9], colors: ['#ffd23f', '#ff8a1a', '#fff0a8'], rise: [-30, -12], fall: [-20, -4] });
      light(136, 760, 420, 420, 'rgba(255, 140, 40, 0.35)', ['sc5-flash'], 1600);
    };
    SCENES.tavern = {
      decor() {
        seen5 = null;
        el(LANTERN, { left: '3vw', top: '9vh', fontSize: '70px' }).classList.add('sc-lantern');
        el(LANTERN, { left: '30vw', top: '6vh', fontSize: '56px', animationDelay: '-1.4s' }).classList.add('sc-lantern');
        // The fire: flames dancing in the hearth, its light on the room.
        light(136, 700, 520, 520, 'rgba(255, 130, 40, 0.28)', ['sc5-fireglow']);
        flame(100, 850, 120);
        flame(140, 850, 170, ['b']);
        flame(178, 850, 110);
        // The chandelier's candles, and the one in the window.
        [-100, -60, -20, 20, 60, 100].forEach((d) => flame(800 + d, 110 + Math.abs(d) / 12, 16, ['small']));
        flame(1146, 424, 14, ['small']);
        // Steam off the pot.
        for (let i = 0; i < 3; i++) put('', 130 + i * 14, 610, 30, ['sc5-steam'], 0, { width: `${px5(30)}px`, height: `${px5(30)}px`, animationDelay: `-${i * 1.3}s` });
        // (A figure is 1em tall: 196 of the art's units, her waist at the counter's top, 819.)
        put(BARMAID, 1026, 698, 196, ['sc5-barmaid']);
      },
      update: (s) => watch5(s, {
        drink: (who) => {
          const b = layer.querySelector('.sc5-barmaid');
          b?.classList.add('cheers');
          later(() => b?.classList.remove('cheers'), 1800);
          cue('clink', 300);
          quote5(`Huzzah! ${sips(who)}`, 'tavern', '22vh', 2600);
        },
        over: (name) => { cue('cheer'); cue('clink', 300); notes(...at5(1100, 760), '#e3b23c', 5); burst(['🍺', '🍻', '✨'], { x: 36, y: 40, n: 18, spread: 26 }); quote5(name ? `A toast to ${name}!` : 'A toast!', 'tavern'); },
      }),
      moments: [
        () => embers(6, () => { const [x, y] = at5(136, 780); return [x + rand(-3, 3), y]; }),
        hearthFlare,
        // The bard strolls through, playing.
        () => {
          const d = walk(BARD, { h: px5(160), y: 99.5, dur: 18 });
          cue('harp', 600);
          shower(14, 1.1, () => { const r = d.getBoundingClientRect(); const x = ((r.left + r.width / 2) / innerWidth) * 100; const y = (r.top / innerHeight) * 100; drift(pick(['♪', '♫']), { from: [x, y], to: [x + rand(-4, 4), y - 20], dur: 4, size: 24, opacity: 0.8, extra: { color: '#e3b23c' } }); });
        },
        // Another barmaid carries a tray of tankards across.
        () => { walk(SERVING, { h: px5(160), y: 99.5, dur: 13 }); cue('clink', 1500); },
        // The tavern cat goes for a stroll.
        () => { const right = Math.random() < 0.5; drift(TAVERN_CAT, { from: [right ? -10 : 108, 90], to: [right ? 108 : -10, 90], dur: rand(14, 18), size: rand(70, 90) }).classList.add('sc-cat', right ? 'sc-face-r' : 'sc-face-l'); cue('meow', rand(3000, 6000)); },
        // An owl on the window sill, blinking in.
        () => put(OWL, 1062, 236, 34, ['sc5-owl'], 7000),
        () => notes(4, 80, '#e3b23c'),
        () => { slide('🍺', { y: 91, size: 50 }); cue('slide', 200); },
        () => { for (let i = 0; i < 2; i++) crossing('🎲', { y: 94 - i * 2, dur: 2.6 + i * 0.4, size: 32, bob: false, cls: ['roll'] }); cue('dice', 300); },
        // The dog, asleep on the rug by the fire.
        () => { const [x] = at5(360, 0); el(`<span>${TAVERN_DOG}</span><b>z</b><b>z</b><b>z</b>`, { left: `${x}vw`, bottom: '0.5vh', fontSize: '76px' }, 9000).classList.add('sc-sleeper'); },
      ],
    };

    // ----- The club -----
    // The DJ behind the decks: cap on backwards, headphones, a hand on the deck, nodding along.
    // (From the front, from the waist up: his arms are sc5-djarm l and r, his head sc5-nod.)
    const DJ = figure({ facing: 'front', skin: 'tan', hair: 'short', hairColor: 'black', hat: 'headphones', hatAccent: '#29f0ff', face: 'shades', top: '#1a1a2a', neck: 'scarf', accent2: '#ff2bd6', arms: [[34, -10], [30, -6]], crop: 'waist', hooks: { head: 'sc5-nod', armB: 'sc5-djarm l', armF: 'sc5-djarm r' } });
    // The crowd on the dance floor, seen from behind in silhouette, heads and shoulders, every
    // fourth one's hands up, bouncing to the beat.
    const CROWD = (() => {
      let s = '';
      const C = '#05040a';
      for (let i = 0; i < 14; i++) {
        const x = 30 + i * 62 + (i % 2) * 14;
        const h = 60 + ((i * 37) % 30);
        const up = i % 4 === 1;
        // (Its head where the old one was, 160 - h: the head's centre is 0.8 of the height up.)
        const H = 150 + (i % 3) * 8;
        s += `<g class="sc5-bob" style="animation-delay:-${((i * 0.13) % 0.47).toFixed(2)}s">${figureAt(x, 160 - h + 0.8 * H, H, { facing: 'back', skin: C, hair: ['short', 'long', 'bun', 'curly', 'ponytail'][i % 5], hairColor: C, top: C, bottom: C, pose: up ? 'cheer' : 'stand', crop: 'waist', face: 'none' })}</g>`;
      }
      return `<svg viewBox="0 0 900 160" width="1em" height="0.178em" overflow="visible">${s}</svg>`;
    })();
    // Bottle service: a bottle with a sparkler held up, carried through the club.
    const BOTTLE_GIRL = figure({ skin: 'tan', hair: 'long', hairColor: 'black', top: '#0e0e14', sleeves: 'none', bottom: '#0e0e14', bottomStyle: 'skirt', shoes: '#0e0e14', pose: 'toast', holding: 'sparkler', cls: 'fg-walk' });
    // The CO2 cannons either side of the booth.
    const co2 = () => {
      for (const [x, y] of [[1080, 760], [1500, 560]]) put('', x - 40, y - 340, 80, ['sc5-co2'], 2400, { width: `${px5(80)}px`, height: `${px5(340)}px` });
      cue('wind');
    };
    // The drop: the DJ's hands go up, the airhorn, the crowd jumps.
    const drop = () => {
      const dj = layer.querySelector('.sc5-dj');
      dj?.classList.add('up');
      later(() => dj?.classList.remove('up'), 3600);
      cue('airhorn');
      later(() => { layer.querySelector('.sc5-crowd')?.classList.add('jump'); el('', { inset: '0' }, 1500).classList.add('sc-strobe'); co2(); burst(['🎉', '✨', '🟪', '🟦'], { x: rand(10, 30), y: 12, n: 30, spread: 34 }); }, 900);
      later(() => layer.querySelector('.sc5-crowd')?.classList.remove('jump'), 4200);
    };
    const glowsticks = () => { for (let i = 0; i < 6; i++) later(() => drift('', { from: [rand(2, 30), 98], to: [rand(10, 60), rand(10, 30)], dur: rand(1.6, 2.4), size: 8, spin: rand(-720, 720) }).classList.add('sc-glowstick', pick(['g', 'p', 'b'])), i * 250); };
    SCENES.club = {
      gap: [14, 28],
      decor() {
        seen5 = null;
        // The moving heads' beams, swinging through the haze.
        [[120, '#ff2bd6', 7], [430, '#9b5cff', 9], [1170, '#29f0ff', 8], [1480, '#ff2bd6', 6.5]].forEach(([x, c, dur], i) => {
          const [l, t] = at5(x, 84);
          el('', { left: `${l}vw`, top: `${t}vh`, width: `${px5(220)}px`, height: '130vh', marginLeft: `${-px5(110)}px`, background: `linear-gradient(${c}55, ${c}00 85%)`, animationDuration: `${dur}s`, animationDelay: `-${i * 1.7}s` }).classList.add('sc5-beam', i % 2 ? 'r' : 'l');
        });
        // The mirror ball's glint, and its sparkles slowly going round the walls.
        light(800, 104, 50, 50, 'rgba(255,255,255,0.9)', ['sc5-glint']);
        el('', { left: '0', top: '10vh', width: 'calc(100vw + 960px)', height: '70vh' }).classList.add('sc5-sparkles');
        // The level meters on the booth, jumping to the beat.
        for (let c = 0; c < 16; c++) {
          const [l, t] = at5(1094 + c * 24.5, 784);
          el('<i></i>', { left: `${l}vw`, top: `${t}vh`, width: `${px5(18)}px`, height: `${px5(108)}px` }).classList.add('sc5-eq');
          layer.lastElementChild.firstElementChild.style.animationDuration = `${(0.3 + ((c * 7) % 5) * 0.05).toFixed(2)}s`;
        }
        // The speakers thumping.
        for (const [x, y, r] of [[77, 817, 50], [1550, 813, 34]]) light(x, y, r * 2.4, r * 2.4, 'rgba(155, 92, 255, 0.45)', ['sc5-thump']);
        // (A figure is 1em tall: 180 of the art's units, his waist at the booth's top.)
        put(DJ, 1160, 661, 180, ['sc5-dj']);
        put(CROWD, 150, 742, 900, ['sc5-crowd']);
      },
      update: (s) => watch5(s, {
        drink: (who) => { quote5(`SHOTS! ${sips(who)}`, 'club', '22vh', 2400); cue('pop'); glowsticks(); },
        over: (name) => { drop(); later(() => quote5(name ? `${name}!!!` : 'WINNER!', 'club'), 900); },
      }),
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
        drop,
        () => el(HANDS, { left: '0', bottom: '-2vh', fontSize: '100vw' }, 7000).classList.add('sc-hands', 'blk'),
        co2,
        // Bottle service: a bottle with a sparkler in it, carried through the club.
        () => { walk(BOTTLE_GIRL, { h: px5(170), y: 99.5, dur: 12 }); cue('pop', 400); },
        () => { burst(['🎉', '✨', '🟪', '🟦', '🟨', '🟩'], { x: rand(10, 30), y: 12, n: 34, spread: 34 }); cue('pop'); },
        glowsticks,
      ],
    };

    // ----- The castle -----
    // The king on his throne: crown, beard, ermine, his goblet (raised for a toast).
    // (The kit's: the arm and the goblet turn on .sc5-raise, the goblet the other way to stay upright.)
    const KING = figure({ skin: 'light', hairColor: 'grey', beard: 'beard', hat: 'crown', top: '#a01a2a', bottomStyle: 'gown', bottom: '#7a1020', neck: 'ermine', build: 'stout', facing: 'front', arms: ['down', [10, 40]], holding: 'goblet', hooks: { armF: 'sc5-toast', propF: 'sc5-cup' } });
    const JESTER = figure({ ...JESTER_LOOK, pose: 'cheer' });
    // A scroll unrolled along the top with the king's word on it.
    const decree = (html, life = 5200) => {
      const [l, t] = at5(220, 22);
      el(`<div class="sc5-scroll-in"><small>By royal decree</small><b>${html}</b></div>`, { left: `${l}vw`, top: `${t}vh`, minWidth: `${px5(340)}px` }, life).classList.add('sc5-scroll');
      cue('fanfare');
    };
    const toast = () => { const k = layer.querySelector('.sc5-king'); k?.classList.add('sc5-raise'); later(() => k?.classList.remove('sc5-raise'), 2400); };
    // Where greatHall (lib/roomArt.js) has its torches (the cup's rim, and its size), its fire,
    // its ring of candles, its window in the gap (the box round it, and the lancet's outline in
    // it), the armour's visor slit and the throne.
    const TORCHES5 = [[151, 350, 1.05], [1057, 386, 0.62], [1247, 365, 0.85]];
    const CANDLES5 = Array.from({ length: 10 }, (_, k) => [570 + 64 * Math.cos((k * Math.PI) / 5), 80 + 13 * Math.sin((k * Math.PI) / 5) - 14]);
    const WINDOW5 = { x: 1071, y: 109, w: 87, h: 336, clip: 'polygon(0 20%, 46% 0, 100% 4%, 100% 100%, 0 100%)' };
    // The banners hang from the beam across the hall (its underside at y 91, 48 wide: 0.6 m at
    // 12.4 m off), in two runs either side of the candles and the seat at the top of the table.
    const hallBanner = (i, n) => {
      const t = ((i + 0.5) / n) * 570;
      const [l, top] = at5((t < 210 ? 285 + t : 470 + t) - 24, 91);
      return { left: `${l}vw`, top: `${top}vh`, fontSize: `${px5(48)}px` };
    };
    SCENES.castle = {
      decor() {
        seen5 = null;
        court.no = null;
        for (const [x, y, k] of TORCHES5) { light(x, y - 20 * k, 300 * k, 300 * k, 'rgba(255, 140, 40, 0.3)', ['sc5-fireglow']); flame(x, y - 4 * k, 40 * k); }
        // The fire in the great fireplace.
        light(1462, 760, 380, 300, 'rgba(255, 120, 30, 0.32)', ['sc5-fireglow']);
        [[1452, 770, 48], [1476, 782, 66, ['b']], [1496, 790, 40]].forEach(([x, y, h, c]) => flame(x, y, h, c));
        CANDLES5.forEach(([x, y]) => flame(x, y, 13, ['small']));
        // (A figure is 1em tall: the king, sitting, is 206 of the art's units, his feet on the dais.)
        put(KING, 1048, 612, 206, ['sc5-king']);
      },
      update: (s) => { heraldry(s, hallBanner); watch5(s, {
        drink: (who) => { decree(sips(who).replace(/ \+(\d+)/g, ' drinks $1')); toast(); },
        over: (name) => { toast(); cue('fanfare'); cue('cheer', 600); later(() => burst(['👑', '✨', '🍷'], { x: 36, y: 40, n: 18, spread: 26 }), 300); quote5(name ? `Long live King ${name}!` : 'Long live the king!', 'castle'); },
      }); },
      moments: [
        () => embers(5, () => { const [x, y, k] = pick(TORCHES5); const [ex, ey] = at5(x, y - 40 * k); return [ex + rand(-1, 1), ey]; }),
        bats,
        () => {
          const right = Math.random() < 0.5;
          drift(DRAGON, { from: [right ? -30 : 115, rand(2, 6)], to: [right ? 115 : -30, rand(1, 8)], dur: rand(9, 12), size: rand(240, 300) }).classList.add('sc-dragon', 'blk', right ? 'sc-face-r' : 'sc-face-l');
          cue('roar', 2500);
        },
        () => {
          const right = Math.random() < 0.5;
          drift(KNIGHT, { from: [right ? -8 : 104, 78], to: [right ? 104 : -8, 78], dur: rand(16, 20), size: 150 }).classList.add('sc-knight', right ? 'sc-face-r' : 'sc-face-l');
          cue('clank');
        },
        // The suit of armour isn't empty: eyes in the visor, looking round.
        () => { put('<i></i><i></i>', 94, 565, 28, ['sc5-armoureyes'], 5200); cue('clank', 3600); },
        // The king raises his goblet to the court.
        () => { toast(); cue('cheer', 600); },
        // A dragon passes the window, its fire lighting up the night.
        () => {
          const { x, y, w, h, clip } = WINDOW5;
          const [l, t] = at5(x, y);
          el(`<div class="sc5-windragon sc-dragon">${DRAGON}</div>`, { left: `${l}vw`, top: `${t}vh`, width: `${px5(w)}px`, height: `${px5(h)}px`, fontSize: `${px5(80)}px`, clipPath: clip }, 6000).classList.add('sc5-window');
          later(() => light(x + w / 2, y + h / 2, 240, 400, 'rgba(255, 140, 40, 0.5)', ['sc5-flash'], 1600), 2600);
          cue('roar', 2600);
        },
        // The jester cartwheels across the hall.
        () => { walk(JESTER, { h: px5(150), y: 99, dur: 9, cls: ['sc5-tumble'] }); cue('spin', 400); },
        juggle,
        () => crossing(critter('rat'), { y: 95, dur: 4, size: 46, faces: 'right' }),
        () => { el('📯', { left: '2vw', top: '12vh', fontSize: '70px', animation: 'sc-herald 4s ease-in-out forwards' }, 4200); cue('fanfare', 400); },
      ],
    };

    // ----- The jazz club -----
    // The pianist, from behind, at the keys; the drummer behind his kit with the brushes.
    // (Kit figures from the waist up: the pianist from behind on his bench, his arms sc5-play;
    // the drummer from the front, brushes in his hands, his arms sc5-brush.)
    const PIANIST = `<svg viewBox="0 0 100 130" width="1em" height="1.3em" overflow="visible">
      ${figureAt(50, 178, 190, { facing: 'back', skin: 'brown', hair: 'short', hairColor: 'black', top: '#141016', arms: [[12, 10], [12, 10]], crop: 'waist', hooks: { armB: 'sc5-play', armF: 'sc5-play b' } })}
      <path d="M14 122 v8 M86 122 v8" stroke="${INK}" stroke-width="5"/><rect x="6" y="110" width="88" height="12" rx="3" fill="#2a1a14" ${ink}/></svg>`;
    // (The drummer is drawn in the art's own units, 1400 to 1600 across from 690 down, sat behind
    // his kit (see jazzKit in lib/roomArt.js): the tom, the bass drum, the snare and the floor tom
    // in front of him are cut out of him, so he's behind them.)
    const DRUMMER = `<svg viewBox="1400 690 200 180" width="1em" height="0.9em" overflow="visible"><clipPath id="sc5-kit"><path d="M1380 600H1620V900H1549V790L1532 784.5L1515 790V805L1504 797L1492 795V774L1477 769.5L1462 774V794L1460 796L1442 790.5L1424 796V900H1380Z"/></clipPath><g clip-path="url(#sc5-kit)">
      ${figureAt(1494, 869, 164, { facing: 'front', skin: 'brown', hair: 'short', hairColor: 'black', hat: 'flatcap', hatColor: '#2a2a3a', top: '#e8e0d0', topStyle: 'vest', accent: '#2a2a3a', neck: 'bow', accent2: '#8a1a2a', arms: [[34, -66], [34, -66]], holding: 'sticks', propColor: '#d8c8a0', crop: 'waist', hooks: { armB: 'sc5-brush', armF: 'sc5-brush b' } })}</g></svg>`;
    // Whoever steps up to the mic: the singer in her gown, the sax player.
    const SINGER = figure({ skin: 'brown', hair: 'long', hairColor: 'black', hat: 'headband', hatColor: '#c8a040', hatAccent: '#f4f0e8', top: '#c8a040', sleeves: 'none', bottom: '#c8a040', bottomStyle: 'gown', arms: [[-60, -40], 'drink'], holding: 'mic' });
    const SAX = figure({ skin: 'brown', hair: 'short', hairColor: 'black', hat: 'fedora', hatColor: '#1a1010', top: '#2a1a2a', topStyle: 'suit', accent: '#2a1a2a', bottom: '#1a1018', pose: 'sax', holding: 'sax', propColor: '#e3b04b' });
    // The waiter with a tray of martinis, the dancers, a cool cat in his shades.
    const WAITER = figure({ skin: 'light', hair: 'short', hairColor: 'black', top: '#f4f0e8', neck: 'bow', accent2: '#141016', bottom: '#141016', pose: 'serve', tray: ['martini', 'martini'], holding: 'tray', cls: 'fg-walk' });
    const DANCER_F = figure({ skin: 'tan', hair: 'bob', hairColor: 'black', top: '#c8303f', sleeves: 'none', bottom: '#c8303f', bottomStyle: 'skirt', shoes: '#c8303f', pose: 'dance' });
    const DANCER_M = figure({ skin: 'deep', hair: 'short', hairColor: 'black', hat: 'fedora', hatColor: '#2a2a30', hatAccent: '#c8303f', top: '#f4f0e8', topStyle: 'suit', accent: '#2a2a3a', bottom: '#2a2a3a', pose: 'dance' });
    const COOL_CAT = figure({ skin: 'brown', hair: 'short', hairColor: 'black', hat: 'beret', beard: 'goatee', face: 'shades', top: '#1a1a20', neck: 'scarf', accent2: '#e3b23c', bottom: '#2a2a30', pose: 'walk' });
    // Someone steps up to the mic in the spotlight (the singer, the sax), and the notes rise.
    const onStage = (svg, life, sound) => {
      // (Just behind the mic, at x 140 in the art.)
      const [l] = at5(34, 0);
      const d = el(`<span>${svg}</span>`, { left: `${l}vw`, bottom: `${100 - at5(0, 880)[1]}vh`, fontSize: `${px5(190)}px`, animation: `sc-popup ${life / 1000}s ease-in-out forwards` }, life);
      d.classList.add('blk', 'sc5-onstage');
      cue(sound);
      notes(...at5(120, 600), '#e3b23c', life / 1000 - 2);
      return d;
    };
    SCENES.jazz = {
      decor() {
        seen5 = null;
        light(100, 640, 360, 640, 'rgba(255, 240, 200, 0.16)', ['sc5-spotbreathe']);
        for (let i = 0; i < 3; i++) el('', { left: `${-10 + i * 12}vw`, top: `${20 + i * 18}vh`, width: '40vw', height: '30vh', animationDelay: `-${i * 9}s` }).classList.add('sc5-smoke');
        light(1100, 440, 220, 200, 'rgba(255, 70, 60, 0.25)', ['sc5-fireglow']);
        // The pianist on his bench in front of the keys (the art's 88 units to the metre).
        put(PIANIST, 1228, 733, 70, ['sc5-pianist']);
        put(DRUMMER, 1400, 690, 200, ['sc5-drummer']);
      },
      update: (s) => watch5(s, {
        drink: (who) => { walk(WAITER, { h: px5(170), y: 99.5, dur: 11 }); cue('clink', 2000); quote5(`Cheers, darling · ${sips(who)}`, 'jazz', '22vh', 2800); },
        over: (name) => { cue('cheer'); cue('snaps', 400); burst(['🌹', '🌹', '✨'], { x: 20, y: 70, n: 18, spread: 20 }); el('', { left: '20vw', top: '-10vh' }, 8000).classList.add('sc-spotlight'); quote5(name ? `Bravo, ${name}!` : 'Bravo!', 'jazz'); },
      }),
      moments: [
        () => smoke(),
        () => el('', { left: '20vw', top: '-10vh' }, 8000).classList.add('sc-spotlight'),
        () => shower(7, 0.7, () => drift(pick(['♪', '♫', '♬']), { from: [rand(2, 12), 80], to: [rand(2, 40), rand(10, 30)], dur: rand(6, 9), size: rand(22, 34), spin: rand(-30, 30), opacity: 0.7, extra: { color: '#e3b23c' } })),
        () => onStage(SINGER, 10000, 'chord'),
        () => onStage(SAX, 9000, 'chord').classList.add('sax'),
        // A run on the piano.
        () => { const p = layer.querySelector('.sc5-pianist'); p?.classList.add('run'); later(() => p?.classList.remove('run'), 4000); notes(...at5(1300, 700), '#e3b23c', 4); cue('chord'); },
        // The drummer's rimshot.
        () => { const d = layer.querySelector('.sc5-drummer'); d?.classList.add('hit'); later(() => d?.classList.remove('hit'), 1200); cue('rimshot'); },
        // A waiter crosses with a tray of martinis.
        () => { walk(WAITER, { h: px5(170), y: 99.5, dur: 11 }); cue('clink', 2500); },
        () => { cue('snaps'); for (let i = 0; i < 4; i++) later(() => popup('🫰', { x: rand(2, 14), bottom: rand(4, 20), size: 40, life: 1600 }), i * 400); },
        () => { const right = Math.random() < 0.5; walk(DANCER_F, { h: px5(170), y: 99.5, dur: 14, right }); later(() => walk(DANCER_M, { h: px5(180), y: 99.5, dur: 14, right }), 600); },
        () => walk(COOL_CAT, { h: px5(160), y: 99.5, dur: 9 }),
      ],
    };
  }

  // ---------- The diner, the tiki bar, the speakeasy, the casino and the saloon ----------
  // Each lines up with its drawing in lib/roomArt.js (dinerArt, tikiBeach, speakeasyArt,
  // casinoArt and saloonArt: 1600 x 900, scaled to cover the screen, see artAt): the jukebox's
  // tubes glow over the jukebox, the peephole opens in the door, the reels spin in the slot
  // machine, the batwing doors swing in the doorway. Something's always going on quietly (steam,
  // lights, smoke, dust in the sun), there's a moment every so often, and the room reacts when
  // someone drinks or a game ends. All in a closure of its own, so none of its names meet anyone
  // else's.
  (() => {
    // One unit of the drawing on the screen, in px.
    const unit = () => Math.max(innerWidth / 1600, innerHeight / 900);
    // Something laid over the drawing: its top left at (x, y) of the drawing, `w` units wide (the
    // html is an svg 1em wide).
    const onArt = (html, x, y, w, life, ...cls) => {
      const [l, t] = artAt(x, y);
      const d = el(html, { left: `${l}vw`, top: `${t}vh`, fontSize: `${(w * unit()).toFixed(1)}px` }, life);
      d.classList.add('blk', ...cls);
      return d;
    };
    // A box over part of the drawing (the window, the doorway, the jackpot board).
    const box = (x, y, w, h, life, ...cls) => {
      const [l, t] = artAt(x, y);
      const u = unit();
      const d = el('', { left: `${l}vw`, top: `${t}vh`, width: `${(w * u).toFixed(1)}px`, height: `${(h * u).toFixed(1)}px` }, life);
      d.classList.add(...cls);
      return d;
    };
    const listOf = (names) => (names.length < 2 ? names[0] || '' : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);
    const quote = (text, cls, life = 3200, top = '28vh') => inFront(`<b>${text}</b>`, { left: '0', right: '26vw', top }, life).classList.add('sc-quote', cls);
    // Who's drunk since the last look, and whether a game has just ended. One reaction at a time:
    // a round where everyone drinks gets one, not six.
    function watcher() {
      let was = null;
      let quiet = 0;
      const look = (s) => {
        if (!s?.players) return null;
        const now = { no: s.gameNo, phase: s.phase, drinks: Object.fromEntries(s.players.map((p) => [p.id, p.drinks || 0])) };
        const prev = was;
        was = now;
        // The first look (the TV just came on) or a new game: nothing to react to yet.
        if (!prev || prev.no !== now.no) return null;
        const over = now.phase === 'over' && prev.phase !== 'over';
        let drank = s.players.filter((p) => (p.drinks || 0) > (prev.drinks[p.id] ?? (p.drinks || 0)));
        if (drank.length && Date.now() < quiet) drank = [];
        if (drank.length || over) quiet = Date.now() + 6000;
        return drank.length || over ? { over, who: listOf(drank.map((p) => esc(p.name))) } : null;
      };
      look.reset = () => { was = null; quiet = 0; };
      return look;
    }
    // (`ar` sets its font-size, h × ar: its width over its height for a drawing 1em wide, 1 for a
    // kit figure, which is 1em tall.)
    // A drawing going along the floor, `h` vh tall (`ar` its width over its height), feet at
    // `y` vh: off one side and across to the other. Drawn facing right.
    const walk = (svg, { ar, h, y = 99, dur, cls = [] }) => {
      const right = Math.random() < 0.5;
      const size = (h / 100) * innerHeight * ar;
      const w = (size / innerWidth) * 100;
      const d = drift(svg, { from: [right ? -w - 2 : 102, y - h], to: [right ? 102 : -w - 2, y - h], dur, size });
      d.classList.add('blk', right ? 'sc-face-r' : 'sc-face-l', ...cls);
      return d;
    };
    // A drawing popping up from the bottom, `h` vh tall, at x vw.
    const rise = (svg, { x, h, ar, life = 6000 }) => popup(svg, { x, bottom: 0, size: (h / 100) * innerHeight * ar, life });

    // ---------- The diner ----------
    // The carhop on roller skates, a tray held high (a burger and a shake): legs pushing, ponytail
    // swinging. Faces right.
    // (Kit figures. Her legs are dn-leg, pushing off on her skates; her free arm dn-arm.)
    const CARHOP = figure({ skin: 'pale', blush: true, hair: 'ponytail', hairColor: '#7a3a1a', hat: 'cap', hatColor: '#e63946', top: '#fff', sleeves: 'short', neck: 'scarf', accent2: '#e63946', bottom: '#e63946', bottomStyle: 'skirt', shoes: '#fff', skates: '#e63946', pose: 'serve', tray: ['burger', 'shake'], holding: 'tray', hooks: { legB: 'dn-leg b', legF: 'dn-leg', armB: 'dn-arm' } });
    // Only its top half, the svg cut off at the waist: someone popping up from behind a counter.
    const waistUp = (o) => `<svg viewBox="0 6 60 70" width="0.857em" height="1em" overflow="visible">${figureAt(30, 118, 120, { ...o, crop: 'waist' })}</svg>`;
    // The short-order cook: chef's hat, a big moustache, his apron, the spatula up (dn-spatula).
    const COOK = waistUp({ facing: 'front', skin: 'light', blush: true, hair: 'short', hairColor: 'brown', beard: 'moustache', hat: 'chef', top: '#f4f4f0', topStyle: 'apron', accent: '#fff', build: 'stout', arms: ['down', [150, 10]], holding: 'spatula', hooks: { armF: 'dn-spatula' } });
    const DINER_DANCERS = COUPLE(DINER_HER, DINER_HIM);
    // The Bel Air going by outside, headlights on (as in the window; faces right).
    const BELAIR = `<svg viewBox="0 -16 250 62" width="1em" height="0.248em"><path d="M174 16 L250 -6 V44 L174 26Z" fill="#fff6c8" opacity="0.4"/>
      <path d="M0 30 L10 16 Q30 4 60 6 L96 4 Q120 4 132 16 L170 14 L176 30Z" fill="${'#ff7a9a'}"/><path d="M40 8 L56 -10 H100 L114 8Z" fill="#ff7a9a"/><path d="M48 6 L60 -6 H96 L106 6Z" fill="#cfeef8" opacity="0.85"/>
      <path d="M150 16 L176 6 L172 20Z" fill="#e0607e"/><rect x="-2" y="26" width="180" height="6" rx="3" fill="#e8ecef"/><path d="M10 20 H170" stroke="#f4f4f4" stroke-width="3"/>
      ${[34, 140].map((x) => `<circle cx="${x}" cy="32" r="11" fill="#1e1a24"/><circle cx="${x}" cy="32" r="6" fill="#f4f4f4"/>`).join('')}<circle cx="173" cy="22" r="4" fill="#fffbe0"/><circle cx="2" cy="24" r="3" fill="#ff3a3a"/></svg>`;
    // Over the jukebox's arch: its bubble tubes changing colour, bubbles going up them.
    const JUKE = `<svg viewBox="0 0 128 340" width="1em" height="2.656em" overflow="visible"><path class="dn-tube a" d="M10 330 V66 A54 54 0 0 1 118 66 V330" fill="none" stroke="#ff7ab0" stroke-width="13"/><path class="dn-tube b" d="M10 330 V66 A54 54 0 0 1 118 66 V330" fill="none" stroke="#7af0ff" stroke-width="13"/>
      ${[10, 118].map((x) => [0, 1, 2, 3].map((i) => `<circle class="dn-bub" cx="${x}" cy="322" r="2.6" fill="#fff" style="animation-delay:-${(i * 0.9 + (x > 50 ? 0.45 : 0)).toFixed(2)}s"/>`).join('')).join('')}</svg>`;
    // The clock's second hand, the coffee's steam, the pot that keeps it bottomless.
    const SECONDS = `<svg viewBox="0 0 100 100" width="1em" height="1em"><g class="dn-sec"><path d="M50 58 V14" stroke="#e63946" stroke-width="2"/><circle cx="50" cy="50" r="3" fill="#e63946"/></g></svg>`;
    const STEAM = `<svg viewBox="0 0 40 70" width="1em" height="1.75em" overflow="visible">${[10, 24].map((x, i) => `<path class="dn-steam" style="animation-delay:-${i * 1.3}s" d="M${x} 66 q-6 -10 0 -20 q6 -10 0 -20 q-6 -10 0 -20" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('')}</svg>`;
    const POT = `<svg viewBox="0 0 60 70" width="1em" height="1.167em" overflow="visible"><path d="M46 22 q14 4 12 22 l-6 2" stroke="#1a1a1a" stroke-width="5" fill="none"/><path d="M14 20 h30 l-2 8 q14 10 12 30 q-2 10 -24 10 q-22 0 -24 -10 q-2 -20 12 -30Z" fill="#e6f4fa" opacity="0.7" stroke="#fff"/>
      <path d="M6 50 q2 16 24 16 q22 0 24 -16Z" fill="#4a2a12"/><rect x="12" y="12" width="34" height="9" rx="3" fill="#1a1a1a"/><path d="M14 22 l-11 -5 l3 8Z" fill="#1a1a1a"/><rect x="18" y="30" width="5" height="26" rx="2" fill="#fff" opacity="0.6"/></svg>`;

    let dinerSaw = null;
    const orderUp = (text = 'Order up!') => { el(`${SERVICE_BELL}<b>${text}</b>`, { left: '13vw', top: '11vh', fontSize: '56px' }, 3500).classList.add('sc-orderup'); cue('clink'); };
    const jukeParty = (secs = 9) => {
      const j = layer.querySelector('.dn-juke');
      j?.classList.add('party');
      later(() => j?.classList.remove('party'), secs * 1000);
      const [x, y] = artAt(1098, 560);
      notes(x - 2, y, '#ff5c8a', secs - 2);
    };
    const carhop = () => walk(CARHOP, { ar: 1, h: 30, dur: rand(7, 9), cls: ['dn-carhop'] });
    // The cook pops up bottom left and flips a burger.
    const cook = () => {
      const h = 26;
      const size = (h / 100) * innerHeight;
      rise(COOK, { x: 1, h, ar: 1, life: 5200 });
      // (The spatula's over his right shoulder, about 0.8 of the way across.)
      const x = 1 + ((size * 0.857 * 0.8) / innerWidth) * 100;
      later(() => { toss('🍔', { x: x - 1.4, y: 100 - h - 4, size: 40, height: 16, spins: 1 }); cue('sizzle'); }, 900);
      later(() => orderUp(), 3600);
    };
    // The Bel Air drives past outside the window, and its headlights sweep the room.
    const carPast = () => {
      const life = 7000;
      const pane = box(24, 118, 492, 280, life, 'dn-pane');
      const right = Math.random() < 0.5;
      pane.innerHTML = `<div class="dn-car${right ? '' : ' l'}" style="font-size:${(250 * unit()).toFixed(1)}px">${BELAIR}</div>`;
      cue('car');
      later(() => el('', { left: '0', top: '0', width: '100vw', height: '100vh' }, 3600).classList.add('dn-sweep', right ? 'r' : 'l'), 2200);
    };
    // Bottomless coffee: the pot comes over and tops up the cup on the counter.
    const refill = () => {
      onArt(POT, 1430, 576, 52, 4300, 'dn-pour');
      later(() => onArt('<i></i>', 1424, 622, 6, 1500, 'dn-stream'), 1400);
      cue('slide', 1300);
    };
    // A gumball drops out of the machine and rolls off across the floor.
    const gumball = () => {
      const [x, y] = artAt(76, 752);
      el('', { left: `${x}vw`, top: `${y}vh`, background: `radial-gradient(circle at 35% 30%, #fff, ${pick(['#ff4d6d', '#ffd23f', '#29c0e0', '#7ad06a'])} 45%)`, '--dx': `${rand(30, 60)}vw`, '--dy': `${artAt(0, 878)[1] - y}vh` }, 6200).classList.add('dn-gum');
      cue('thud', 700);
    };
    SCENES.diner = {
      decor() {
        dinerSaw = watcher();
        el('<span>OPEN</span>', { left: '2vw', top: '28vh' }).classList.add('sc-sign', 'open');
        el(FAN, { left: '14vw', top: '0', fontSize: '230px' }).classList.add('sc-fan', 'blk');
        onArt(JUKE, 1034, 530, 128, 0, 'dn-juke');
        onArt(SECONDS, 1048, 158, 100);
        onArt(STEAM, 1410, 596, 40, 0, 'dn-cupsteam');
      },
      update(s) {
        const e = dinerSaw?.(s);
        if (!e) return;
        if (e.over) {
          jukeParty(10);
          carhop();
          burst(['🍒', '⭐', '🍔', '🥤'], { x: artAt(1098, 0)[0], y: artAt(0, 560)[1], n: 22, spread: 20 });
          quote('Pie for everyone!', 'dn');
          cue('cheer', 300);
        } else {
          orderUp(`Order up, ${e.who}!`);
          if (Math.random() < 0.5) later(refill, 800);
        }
      },
      moments: [
        carhop,
        cook,
        carPast,
        refill,
        gumball,
        () => { cue('clink'); jukeParty(9); later(() => walk(DINER_DANCERS, { ar: 1, h: 26, dur: 10 }), 1500); },
        () => vvWalk(SKATER(1), { vh: 22, dur: 3.2, cls: ['dn-skater'] }),
        () => popup('🥤', { x: 3, bottom: 2, size: 60, life: 4500 }),
        () => orderUp(),
        () => layer.querySelector('.sc-sign.open')?.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 1400, easing: 'steps(1)' }),
      ],
    };

    // ---------- The tiki bar ----------
    // A hula dancer: grass skirt swishing, hips swaying, arms telling the story; a hibiscus in her
    // hair.
    // (The kit's, from the front: her arms (tk-arms) and her skirt (tk-skirt) swing, and she
    // sways from the feet, tk-hula.)
    const HULA = figure({ skin: 'tan', hair: 'long', hairColor: 'black', hat: 'hibiscus', top: '#e8572a', sleeves: 'none', bottomStyle: 'grass', neck: 'lei', facing: 'front', blush: true, arms: [[80, 40], [80, 40]], hooks: { armF: 'tk-arms', armB: 'tk-arms', skirt: 'tk-skirt' }, cls: 'tk-hula' });
    // A fire dancer, in silhouette (the kit's, every colour the one), spinning his flaming staff
    // over his head.
    const FIRE_DANCER = `<svg viewBox="0 0 140 220" width="1em" height="1.571em" overflow="visible">
      <radialGradient id="vn-tkfg"><stop offset="0" stop-color="#ffb050" stop-opacity="0.45"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient><circle class="tk-fglow" cx="70" cy="60" r="90" fill="url(#vn-tkfg)"/>
      ${figureAt(69.4, 187, 150, { skin: '#1a0c06', hair: 'bald', face: 'none', top: '#1a0c06', topStyle: 'bare', bottomStyle: 'skirt', bottom: '#7a1a10', shoes: '#1a0c06', facing: 'front', arms: [[-170, 0], [170, 0]] })}
      <g class="tk-staff"><path d="M8 50 H132" stroke="#4a2a12" stroke-width="5"/><path d="M8 50 A62 62 0 0 1 36 2 M132 50 A62 62 0 0 1 104 98" stroke="#ff8a1a" stroke-width="9" fill="none" opacity="0.35" stroke-linecap="round"/>
        ${[8, 132].map((x) => `<circle cx="${x}" cy="50" r="12" fill="#ff7a1a"/><circle cx="${x}" cy="50" r="7" fill="#ffe08a"/>`).join('')}</g></svg>`;
    // An outrigger canoe on the horizon, its paddler stroking. Faces right.
    // (The paddler is the kit's, in silhouette: his arm and paddle stroke, tk-paddle.)
    const OUTRIGGER = `<svg viewBox="0 0 120 50" width="1em" height="0.417em" overflow="visible">${figureAt(76, 51.6, 48, { skin: '#1a0e1a', hair: 'bald', face: 'none', top: '#1a0e1a', bottom: '#1a0e1a', shoes: '#1a0e1a', pose: 'sit', arms: ['hold', [40, 30]], holding: 'paddle', propColor: '#1a0e1a', hooks: { armF: 'tk-paddle' } })}
      <g fill="#1a0e1a"><path d="M4 34 Q60 44 116 30 L110 40 Q60 50 10 42Z"/><ellipse cx="54" cy="20" rx="34" ry="3"/>
      <path d="M40 22 L36 36 M70 22 L72 34" stroke="#1a0e1a" stroke-width="2.5"/></g></svg>`;
    // The tiki bar's volcano, out on the horizon (its crater at 1000, 132 of the drawing) goes
    // off: a rumble, the crater flares, lava bursts up and falls back, a plume of smoke rises.
    function eruption() {
      const [x, y] = artAt(1000, 132);
      cue('rumble');
      el('', { left: `${x}vw`, top: `${y}vh` }, 7000).classList.add('sc-crater');
      later(() => {
        cue('boom');
        burst(['●', '●', '•'], { x, y, n: 40, spread: 6, size: [6, 14], colors: ['#ffd23f', '#ff8a1a', '#ff4a1a'], rise: [-24, -10], fall: [16, 34] });
        for (let i = 0; i < 5; i++) later(() => drift('', { from: [x - 1, y - 2], to: [x - 6 + i * 2, y - 26], dur: 6, size: 10 }).classList.add('sc-plume'), i * 300);
      }, 1400);
    }
    let tikiSaw = null;
    const hula = (life = 9000) => { rise(HULA, { x: 3.2, h: 34, ar: 1, life }); cue('drum', 400); later(() => notes(6, 70, '#ffd24a', 5), 800); };
    const fireDancer = () => { rise(FIRE_DANCER, { x: 82, h: 30, ar: 1 / 1.571, life: 8000 }); cue('drum'); cue('drum', 1200); };
    const tikiEyes = () => { onArt('<i></i><i></i>', 1196, 636, 88, 4600, 'tk-eyes'); cue('drum'); cue('drum', 700); cue('drum', 1400); };
    SCENES.tiki = {
      decor() {
        tikiSaw = watcher();
        for (const left of ['2vw', '9vw']) {
          el(TORCH, { left, bottom: '0', fontSize: '220px' }).classList.add('sc-tikitorch');
          el('<div class="sc-flame"></div>', { left: `calc(${left} + 6px)`, bottom: 'calc(220px - 18px)' }).classList.add('sc-torch');
        }
        // The paper lanterns along the thatch glow and gutter, each in its own time.
        for (let i = 0; i < 11; i++) {
          const [x, y] = artAt(140 + i * 140, 146);
          el('', { left: `${x}vw`, top: `${y}vh`, width: `${(70 * unit()).toFixed(0)}px`, height: `${(70 * unit()).toFixed(0)}px`, animationDuration: `${rand(2.5, 4.5).toFixed(1)}s`, animationDelay: `-${rand(0, 4).toFixed(1)}s` }).classList.add('tk-lantern');
        }
        // The sea washing up the sand, and glints on the water (seen by the sidebar).
        onArt(`<svg viewBox="0 0 330 30" width="1em" height="0.091em" overflow="visible"><path d="M0 14 Q40 6 80 14 T160 12 T240 10 T330 8" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="40 10 18 12"/></svg>`, 1010, 562, 330, 0, 'tk-foam');
        for (let i = 0; i < 6; i++) onArt('<i></i>', 1030 + rand(0, 130), 440 + rand(0, 110), 18, 0, 'tk-glint').style.animationDelay = `-${rand(0, 5).toFixed(1)}s`;
      },
      update(s) {
        const e = tikiSaw?.(s);
        if (!e) return;
        if (e.over) {
          hula(10000);
          later(fireDancer, 600);
          burst(['🌺', '🌸', '🌼', '🍍'], { x: 36, y: 40, n: 24, spread: 30 });
          quote('Mahalo!', 'tk', 3400);
          cue('cheer', 300);
        } else {
          quote(`Okole maluna, ${e.who}!`, 'tk');
          toss('🥥', { x: 6, y: 80, size: 40, height: 16, spins: 2 });
          cue('drum', 200);
        }
      },
      moments: [
        () => {
          const right = Math.random() < 0.5;
          drift(PARROT, { from: [right ? -10 : 110, rand(6, 14)], to: [right ? 110 : -10, rand(4, 18)], dur: rand(7, 9), size: rand(60, 80) }).classList.add(right ? 'sc-face-r' : 'sc-face-l');
          cue('squawk', 1200);
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
            if (i < 2 || i % 3 === 0) cue('thud', 600); // as it lands
          }, times[i]));
        },
        fireflies,
        () => crossing(critter('crab'), { y: 93, dur: 7, size: 52, faces: 'right' }),
        () => el(critter('gecko'), { left: '1vw', top: '30vh', fontSize: '58px', animation: 'sc-gecko 6s ease-in-out forwards' }, 6200),
        tikiEyes,
        () => { const [, y] = artAt(0, 436); walk(OUTRIGGER, { ar: 2.4, h: 4.5, y, dur: rand(26, 32), cls: ['tk-canoe'] }); },
        () => hula(),
        fireDancer,
        () => {
          for (let i = 0; i < pick([1, 2, 3]); i++) { const [x, y] = artAt(1060 + i * 26, 520); el(critter('dolphin'), { left: `${x}vw`, top: `${y}vh`, fontSize: `${(60 * unit()).toFixed(0)}px`, animationDelay: `${i * 0.5}s` }, 4000).classList.add('sc-dolphin'); }
          cue('splash', 1500);
        },
        () => { const [x, y] = artAt(1100, 452); el('<i></i><i></i><i></i>', { left: `${x}vw`, top: `${y}vh` }, 3000).classList.add('sc-spout'); },
        () => { for (let i = 0; i < pick([1, 2]); i++) later(() => el('', { left: `${rand(20, 60)}vw`, top: `${rand(3, 10)}vh`, animation: 'sc-shoot 1.1s ease-out forwards' }, 1300).classList.add('sc-star'), i * 900); },
        () => flock(critter('bird', { color: '#1e2436' })),
        // The volcano goes off. Peaceful most of the time: one moment in about fourteen.
        eruption,
      ],
    };

    // ---------- The speakeasy ----------
    // The peephole in the door (over the drawing's): its brass cover slides back, a pair of eyes.
    const PEEP = `<svg viewBox="0 0 64 22" width="1em" height="0.344em"><rect width="64" height="22" rx="2" fill="#120804"/>
      <g class="sp-eyes"><rect x="2" y="2" width="60" height="18" fill="${SKIN.light}"/><g class="sp-pupils"><ellipse cx="22" cy="11.5" rx="3.6" ry="4.6" fill="${INK}"/><ellipse cx="42" cy="11.5" rx="3.6" ry="4.6" fill="${INK}"/></g><path d="M15 5 q7 -3 14 1 M35 6 q7 -4 14 -1" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
      <g class="sp-cover"><rect width="64" height="22" rx="2" fill="#6b3a1c" stroke="#b08d45" stroke-width="2"/></g></svg>`;
    // A flapper doing the Charleston: bob and headband, feather, fringe flying, pearls swinging.
    // (Her legs and arms are sp-legb/legf/armb/armf: the Charleston, in CSS.)
    const FLAPPER = figure({ skin: 'pale', blush: true, hair: 'bob', hairColor: 'black', hat: 'headband', hatColor: '#c9ccd1', hatAccent: '#f4f0e6', top: '#d9ad52', sleeves: 'none', topStyle: 'flapper', accent: '#8a1a2a', bottom: '#d9ad52', bottomStyle: 'skirt', shoes: '#141010', arms: [[-40, 100], [40, -110]], hooks: { legB: 'sp-legb', legF: 'sp-legf', armB: 'sp-armb', armF: 'sp-armf' } });
    // The bartender, shaking a cocktail over his shoulder: moustache, bow tie, sleeve garters.
    // (From the waist up, popping up behind the bar: see waistUp, in the diner.)
    const BARTENDER = waistUp({ facing: 'front', skin: 'pale', hair: 'short', hairColor: 'black', beard: 'moustache', top: '#f4f0e6', topStyle: 'vest', accent: '#1a1414', neck: 'bow', accent2: '#8a1a2a', arms: [[110, 96], [110, 96]], holding: 'shaker', hooks: { armB: 'sp-shake', armF: 'sp-shake' } });
    // A gangster in a suit and a fedora, a violin case in his hand. Faces right.
    const GANGSTER = figure({ skin: 'light', hair: 'short', hairColor: 'black', hat: 'fedora', hatColor: '#2a2a30', hatAccent: '#0e0e10', top: '#f4f0e6', topStyle: 'suit', accent: '#33333c', neck: 'tie', accent2: '#c0392b', bottom: '#33333c', shoes: '#f4f0e6', face: 'flat', pose: 'walk', holding: 'case' });
    let speakSaw = null;
    const knock = () => {
      cue('knock');
      later(() => {
        const peep = layer.querySelector('.sp-peep');
        peep?.classList.add('peek');
        later(() => peep?.classList.remove('peek'), 5200);
      }, 900);
    };
    const bartender = () => {
      rise(BARTENDER, { x: 77, h: 26, ar: 1, life: 6000 });
      later(() => cue('shaker'), 700);
      later(() => { slide('🍸', { y: 72, size: 44 }); cue('slide'); }, 3800);
    };
    const flapper = () => walk(FLAPPER, { ar: 1, h: 30, dur: rand(10, 13), cls: ['sp-flapper'] });
    SCENES.speakeasy = {
      decor() {
        speakSaw = watcher();
        el(BULB, { left: '22vw', top: '-2vh', fontSize: '150px' }).classList.add('sc-bulb');
        el(GRAMOPHONE, { left: '1vw', bottom: '9vh', fontSize: '130px' }).classList.add('sc-gramophone', 'blk');
        onArt(PEEP, 1066, 556, 64, 0, 'sp-peep');
        // The sconces' light trembling, smoke hanging and drifting under the ceiling.
        for (const [x, y] of [[86, 230], [1098, 220], [1500, 220]]) box(x - 110, y - 130, 220, 260, 0, 'sp-glow').style.animationDelay = `-${rand(0, 3).toFixed(1)}s`;
        for (const [top, dur] of [[4, 70], [22, 95]]) el('', { left: '-40vw', top: `${top}vh`, animationDuration: `${dur}s` }).classList.add('sp-haze');
      },
      update(s) {
        const e = speakSaw?.(s);
        if (!e) return;
        if (e.over) {
          quote('The cat’s pajamas!', 'sp', 3400);
          flapper();
          later(flapper, 1800);
          notes(4, 78, '#d9ad52', 7);
          cue('cheer', 300);
        } else {
          quote(`Bottoms up, ${e.who}.`, 'sp');
          slide('🥃', { y: 72, size: 44 });
          cue('slide');
        }
      },
      moments: [
        () => smoke(),
        knock,
        () => { el('', { inset: '0' }, 6000).classList.add('sc-police'); cue('siren'); later(() => quote('Cheese it, the cops!', 'sp', 2600, '30vh'), 800); },
        flapper,
        bartender,
        () => walk(GANGSTER, { ar: 1, h: 28, dur: rand(13, 16), cls: ['sp-walker'] }),
        () => { onArt('<b>ring-a-ling!</b>', 1180, 586, 90, 3400, 'sp-ring'); cue('beep'); cue('beep', 700); cue('beep', 1600); },
        () => notes(3, 78, '#d9ad52', 6),
        () => { slide('🍸', { y: 72, size: 44 }); cue('slide'); },
        () => { el('<span>🍸</span>', { left: '12vw', top: '22vh', fontSize: '44px' }, 4000).classList.add('sc-shaker'); cue('shaker'); },
      ],
    };

    // ---------- The casino ----------
    // Lucky 7's reels (over the drawing's reel window): a strip of symbols for each, spinning.
    const SYMS = [
      '<text x="14" y="33" font-family="Georgia, serif" font-size="30" font-weight="900" text-anchor="middle" fill="#c1121f">7</text>',
      '<rect x="4" y="14" width="20" height="14" rx="2" fill="#141414"/><text x="14" y="25" font-family="Arial, sans-serif" font-size="8" font-weight="900" text-anchor="middle" fill="#fff">BAR</text>',
      '<circle cx="10" cy="27" r="6" fill="#c1121f"/><circle cx="19" cy="29" r="6" fill="#c1121f"/><path d="M10 21 Q14 11 22 9 M19 23 L22 9" stroke="#2a6a2a" stroke-width="2" fill="none"/>',
      '<path d="M14 9 q-9 0 -9 14 l-3 6 h24 l-3 -6 q0 -14 -9 -14Z" fill="#e3b23c"/><circle cx="14" cy="32" r="3" fill="#e3b23c"/>',
    ];
    const REELS = `<svg viewBox="0 0 84 42" width="1em" height="0.5em"><rect width="84" height="42" fill="#fffaf0"/>${[0, 1, 2].map((i) => `<g transform="translate(${i * 28} 0)"><g class="cs-strip" style="transform:translateY(-${[0, 42, 84][i]}px)">${[...SYMS, ...SYMS].map((s, j) => `<g transform="translate(0 ${j * 42})">${s}</g>`).join('')}</g></g>`).join('')}<path d="M28 0V42M56 0V42" stroke="#c8b89a" stroke-width="2"/><rect width="84" height="42" fill="url(#vn-reelshade)"/><defs><linearGradient id="vn-reelshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.3" stop-color="#000" stop-opacity="0"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs></svg>`;
    // A cocktail waitress with a tray of martinis. Faces right.
    const WAITRESS = figure({ skin: 'pale', blush: true, hair: 'bun', hairColor: '#8a3a1a', top: '#141010', sleeves: 'none', neck: 'scarf', accent2: '#e0b450', belt: '#e0b450', bottom: '#141010', bottomStyle: 'skirt', shoes: '#141010', pose: 'serve', tray: ['martini', 'martini', 'martini'], holding: 'tray', cls: 'fg-walk' });
    // The King himself, or near enough: the quiff, the shades, white jumpsuit studded with gold,
    // pointing at someone in the crowd. Faces right.
    const ELVIS = figure({ skin: 'light', hair: 'quiff', hairColor: 'black', beard: 'stubble', face: 'shades', top: '#fbf8f0', topStyle: 'jumpsuit', accent: '#e0b450', belt: '#e0b450', bottom: '#fbf8f0', shoes: '#141010', pose: 'point', cls: 'fg-walk' });
    let casinoSaw = null;
    let lastHit = null;
    let pulling = false;
    // Pull Lucky 7's handle: the reels spin and stop one by one. Now and then three of a kind.
    const pull = (win = Math.random() < 0.2) => {
      const reels = layer.querySelector('.cs-reels');
      const knob = layer.querySelector('.cs-knob');
      if (!reels || pulling) return;
      pulling = true;
      knob?.classList.remove('pull');
      void knob?.offsetWidth;
      knob?.classList.add('pull');
      cue('spin', 200);
      const strips = [...reels.querySelectorAll('.cs-strip')];
      const sym = win ? Math.floor(Math.random() * 4) : -1;
      const ends = strips.map((_, i) => (win ? sym : i === 2 ? 2 : 0));
      if (!win && Math.random() < 0.5) ends[2] = 1 + Math.floor(Math.random() * 3);
      strips.forEach((s, i) => later(() => { s.style.transform = ''; s.classList.add('spin'); }, 300 + i * 60));
      strips.forEach((s, i) => later(() => { s.classList.remove('spin'); s.style.transform = `translateY(-${ends[i] * 42}px)`; cue('thud'); }, 1700 + i * 600));
      later(() => {
        pulling = false;
        if (!win) return;
        const [x, y] = artAt(1098, 826);
        burst(['🪙', '🪙', '💰', '✨'], { x, y, n: 26, spread: 14, rise: [-30, -10], fall: [10, 20] });
        inFront('<b>JACKPOT!</b>', { left: '0', right: '26vw', top: '30vh' }, 3000).classList.add('sc-oneeighty', 'cs');
        layer.querySelector('.cs-board')?.classList.add('win');
        later(() => layer.querySelector('.cs-board')?.classList.remove('win'), 3000);
        cue('jackpot');
        cue('cheer', 300);
      }, 3300);
    };
    // The roulette wheel (bottom left, over the drawing's) spins, the ball runs round and drops.
    const roulette = () => {
      const n = Math.floor(Math.random() * 37);
      const ring = (c, off) => `<ellipse class="cs-pockets" cx="150" cy="800" rx="96" ry="32" fill="none" stroke="${c}" stroke-width="18" stroke-dasharray="9 9" stroke-dashoffset="${off}"/>`;
      const w = onArt(`<svg viewBox="0 746 300 108" width="1em" height="0.36em">${ring('#c0182a', 0)}${ring('#141414', 9)}<ellipse cx="150" cy="800" rx="60" ry="20" fill="#8a5a24"/><ellipse cx="150" cy="796" rx="16" ry="6" fill="#e0b450"/><circle class="cs-rball" cx="0" cy="0" r="4.5" fill="#fff"/></svg>`, 0, 746, 300, 7000, 'cs-wheel');
      for (const p of w.querySelectorAll('.cs-pockets')) p.animate([{ strokeDashoffset: p.getAttribute('stroke-dashoffset') }, { strokeDashoffset: Number(p.getAttribute('stroke-dashoffset')) - 720 }], { duration: 5200, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)', fill: 'forwards' });
      const K = 60;
      const turns = 3.6 + Math.random();
      const frames = Array.from({ length: K + 1 }, (_, k) => { const t = k / K; const a = turns * Math.PI * 2 * (1 - (1 - t) ** 2.4); const r = t > 0.8 ? 1 - (t - 0.8) * 1.6 : 1; return { transform: `translate(${(150 + Math.cos(a) * 82 * r).toFixed(1)}px, ${(800 - Math.sin(a) * 27 * r).toFixed(1)}px)` }; });
      w.querySelector('.cs-rball').animate(frames, { duration: 5200, fill: 'forwards' });
      cue('spin');
      later(() => {
        const colour = n === 0 ? 'Green' : REDS.includes(n) ? 'Red' : 'Black';
        inFront(`<b>${n} ${colour}!</b>`, { left: '3vw', bottom: '17vh' }, 3400).classList.add('sc-verdict', 'win');
        cue('clink');
      }, 5300);
    };
    // A quick shuffle, top left of the floor: the cards riffling over from one hand to the other.
    const shuffle = () => {
      for (let i = 0; i < 12; i++) el('', { left: '4vw', top: '66vh', animationDelay: `${(i * 0.09).toFixed(2)}s` }, 3600).classList.add('cs-card');
      cue('snaps');
    };
    // The progressive jackpot, always going up.
    let jackpot = 1000000;
    const tick = () => {
      const b = layer?.querySelector('.cs-board b');
      if (!b) return;
      jackpot += Math.floor(rand(3, 90));
      b.textContent = `$${jackpot.toLocaleString('en-US')}`;
      later(tick, rand(1800, 4200));
    };
    SCENES.casino = {
      decor() {
        casinoSaw = watcher();
        lastHit = null;
        pulling = false;
        jackpot = 1000000 + Math.floor(rand(0, 40000));
        // The jackpot board's bulbs chasing, its number ticking up.
        const u = unit();
        for (const y of [160, 273]) {
          const b = box(14, y, 240, 9, 0, 'cs-bulbs');
          b.innerHTML = '<i></i>';
          Object.assign(b.firstChild.style, { left: `${(-40 * u).toFixed(1)}px`, backgroundSize: `${(40 * u).toFixed(1)}px 100%`, backgroundPosition: `${(30 * u).toFixed(1)}px 50%` });
          b.style.setProperty('--p', `${(20 * u).toFixed(1)}px`);
        }
        const board = box(26, 220, 216, 44, 0, 'cs-board');
        board.innerHTML = '<b></b>';
        board.style.fontSize = `${(33 * u).toFixed(1)}px`;
        tick();
        // Lucky 7: its reels, the handle's knob, the light on top; the chandelier twinkling.
        onArt(REELS, 1056, 634, 84, 0, 'cs-reels');
        onArt('<svg viewBox="0 0 24 24" width="1em" height="1em"><circle cx="12" cy="12" r="11" fill="#c1121f"/><circle cx="8" cy="8" r="3" fill="#fff" opacity="0.7"/></svg>', 1150, 584, 24, 0, 'cs-knob');
        onArt('<i></i>', 1068, 516, 60, 0, 'cs-toplight');
        for (let i = 0; i < 7; i++) onArt('✦', 1030 + rand(0, 130), 40 + rand(0, 110), 14, 0, 'cs-twinkle').style.animationDelay = `-${rand(0, 4).toFixed(1)}s`;
        // Smoke curling up off the cigar in the ashtray.
        const puff = () => later(() => { const [x, y] = artAt(1296, 800); drift('', { from: [x, y], to: [x + rand(-2, 1), y - rand(14, 22)], dur: 5, size: 10 }).classList.add('cs-smoke'); puff(); }, rand(900, 1700));
        puff();
      },
      update(s) {
        const g = s?.gameType === 'slevens' ? s.game : null;
        if (g?.hit && g.rollNo !== lastHit) {
          const first = lastHit === null;
          lastHit = g.rollNo;
          if (!first) {
            inFront('<b>WINNER!</b>', { left: '0', right: '26vw', top: '30vh' }, 2400).classList.add('sc-oneeighty', 'ton', 'cs');
            burst(['🔴', '⚫', '🟢', '🔵'], { x: 36, y: 46, n: 16, spread: 24, size: [16, 24] });
            cue('clink');
          }
        } else if (g && lastHit === null) lastHit = g.rollNo ?? 0;
        const e = casinoSaw?.(s);
        if (!e) return;
        if (e.over) {
          later(() => pull(true), 300);
          quote('The house drinks!', 'cs', 3000);
        } else {
          quote(`Drinks on the house, ${e.who}!`, 'cs');
          burst(['🔴', '⚫', '🟢', '🔵', '🪙'], { x: 6, y: 80, n: 14, spread: 10, size: [16, 26] });
          cue('clink');
        }
      },
      moments: [
        () => pull(),
        () => pull(),
        roulette,
        rollDice,
        shuffle,
        () => walk(WAITRESS, { ar: 1, h: 28, dur: rand(11, 14) }),
        () => { walk(ELVIS, { ar: 1, h: 30, dur: 12 }); later(() => quote('Thank you. Thank you very much.', 'cs', 3400, '20vh'), 5000); },
        () => fall(['🪙', '💰', '🎲', '♠️', '♥️'], 7, 0.6),
        () => { burst(['🃏', '🂡', '🂮', '🃁'], { x: 6, y: 80, n: 14, spread: 18, size: [28, 40] }); },
        () => { burst(['🍾', '🫧', '✨', '🫧'], { x: 4, y: 78, n: 18, spread: 14 }); cue('pop'); },
      ],
    };

    // ---------- The saloon ----------
    // The room's in perspective (see saloonArt): the floor's vanishing point is at (800, 502) of
    // the drawing and the camera 2.2 m up, so on the floor at y there are perM(y) units to the
    // metre. Everyone here stands on that floor, as tall as they'd be where their feet are.
    const perM = (y) => (y - 502) / 2.2;
    // Something standing on the floor, its feet (bottom middle) at (x, y) of the drawing, `m`
    // metres tall, `ar` its width over its height (a kit figure's 0.5).
    const standAt = (html, x, y, m, life, ar = 0.5) => {
      const h = m * perM(y) * unit();
      const [l, t] = artAt(x, y);
      return el(html, { left: `${l - ((h * ar) / 2 / innerWidth) * 100}vw`, top: `${t - (h / innerHeight) * 100}vh`, fontSize: `${h.toFixed(1)}px` }, life);
    };
    // The left edge of the screen, in the drawing's x.
    const leftEdge = () => -(innerWidth - 1600 * unit()) / 2 / unit();
    // The poker table in the bottom left corner, the same as the drawing's (pokerTable in
    // lib/roomArt.js), laid over the scenery: it's so near that anyone on the floor over there is
    // behind it (.sl-near).
    const POKER_TABLE = `<svg viewBox="-60 690 340 210" width="1em" height="0.618em"><ellipse cx='110' cy='800' rx='162' ry='46' fill='#3a1e0e'/><ellipse cx='110' cy='795' rx='148' ry='39' fill='#2f5a34'/><path d='M36 838 V900 M184 838 V900' stroke='#3a1e0e' stroke-width='18'/>
      ${[[52, 792, -12, 'A'], [66, 790, -4, 'A'], [80, 790, 6, '8'], [94, 792, 14, '8']].map(([x, y, a, t], i) => `<g transform='rotate(${a} ${x} ${y})'><rect x='${x - 6.5}' y='${y - 10}' width='13' height='18' rx='2' fill='#fbf8f0'/><text x='${x}' y='${y + 2}' font-family='Georgia, serif' font-size='8' font-weight='700' text-anchor='middle' fill='${i % 2 ? '#c1121f' : '#141414'}'>${t}</text></g>`).join('')}
      ${[[146, 794, 6, '#c0392b'], [158, 798, 4, '#e8dcc0'], [136, 800, 3, '#2a4a8a']].map(([x, y, n, c]) => Array.from({ length: n }, (_, i) => `<ellipse cx='${x}' cy='${Math.round((y - i * 1.5) * 10) / 10}' rx='4.5' ry='1.6' fill='${c}' stroke='#2a1608' stroke-width='0.6'/>`).join('')).join('')}
      <path d='M220 788 v-32 q0 -7 5 -10 v-12 h7 v12 q5 3 5 10 v32Z' fill='#5a3a10' opacity='0.9'/><rect x='222' y='760' width='13' height='11' fill='#e8dcc0'/><text x='228.5' y='768' font-family='Georgia, serif' font-size='6' font-weight='700' text-anchor='middle' fill='#3a1a08'>XXX</text></svg>`;
    // The piano's drawn squashed to 1.3 m about its feet (y 880): where a y of the unsquashed
    // drawing went.
    const PIANO_SQ = 0.656;
    const onPiano = (y) => 880 - (880 - y) * PIANO_SQ;
    // The batwing doors (over the drawing's doorway, 2.3 m by 1.1: 1 unit of this svg is 1 of the
    // drawing): louvred, 1.07 m tall and 0.4 m off the floor, swinging on their hinges.
    const door = (x0, w, side) => `<g class="sl-door ${side}"><path d="M${x0} 88 Q${x0 + w / 2} ${side === 'l' ? 76 : 100} ${x0 + w} 80 V202 H${x0}Z" fill="#6a3e1c" stroke="#3a2210" stroke-width="2"/>${[98, 110, 122, 134, 146, 158, 170, 182, 194].map((y) => `<path d="M${x0 + 5} ${y} H${x0 + w - 5}" stroke="#3a2210" stroke-width="2.5"/>`).join('')}<path d="M${x0 + w / 2} 86 V200" stroke="#8a5a2a" stroke-width="2"/></g>`;
    const DOORS = `<svg viewBox="0 0 116 245" width="1em" height="2.112em" overflow="visible">${door(0, 57, 'l')}${door(59, 57, 'r')}</svg>`;
    // A stranger, backlit in the doorway; a rider going by in the street.
    // (Both the kit's, in silhouette: every colour the one, no face. The rider on the kit's horse.)
    const silhouette = (c) => ({ skin: c, hair: 'bald', face: 'none', hatColor: c, hatAccent: c, top: c, bottom: c, shoes: c });
    const STRANGER = figure({ ...silhouette('#1a0c04'), hat: 'cowboy', facing: 'front', build: 'broad' });
    const RIDER = `<svg viewBox="0 0 100 80" width="1em" height="0.8em" overflow="visible">${critter.at('horse', 50, 78, 96, { color: '#4a2a14' })}${figureAt(50, 46.5, 56, { ...silhouette('#4a2a14'), hat: 'cowboy', arms: ['ride', 'ride'], legs: [[40, -50], [40, -50]] })}</svg>`;
    const PIANO_KEYS = `<svg viewBox="0 0 244 26" width="1em" height="${(0.1066 * PIANO_SQ).toFixed(4)}em" preserveAspectRatio="none">${[1, 3, 4, 7, 9, 12, 14, 15, 18, 20, 22].map((k, i) => `<rect class="sl-key" x="${(k * 10.2 + 1).toFixed(1)}" y="0" width="8.5" height="26" fill="#000" opacity="0" style="animation-duration:${(1.1 + (i % 4) * 0.37).toFixed(2)}s;animation-delay:-${(i * 0.29).toFixed(2)}s"/>`).join('')}</svg>`;
    let saloonSaw = null;
    const doorsSwing = () => {
      const d = layer.querySelector('.sl-doors');
      if (!d) return;
      d.classList.remove('swing');
      void d.offsetWidth;
      d.classList.add('swing');
      cue('creak');
    };
    // What's seen through the doorway (its bottom 30 units under the sill, at y 766, for the
    // stranger stepping in), in px from the bottom of that.
    const behindDoors = (html, cls, life) => {
      const p = box(1040, 491, 116, 275, life, 'sl-pane');
      p.innerHTML = html;
      p.firstElementChild.classList.add(cls);
      layer.querySelector('.sl-doors')?.before(p);
      return p;
    };
    const fromSill = (y) => ((766 - y) * unit()).toFixed(1);
    // A stranger walks in: out in the street and up to the doorway, the piano stops, the doors
    // swing... and on it goes. 1.8 m on the sill (y 736); he grows about the horizon as he comes
    // (sl-enter), so his feet stay on the ground.
    const stranger = () => {
      const piano = layer.querySelectorAll('.sl-piano, .sl-roll');
      behindDoors(`<div style="font-size:${(1.8 * perM(736) * unit()).toFixed(1)}px;bottom:${fromSill(736)}px">${STRANGER}</div>`, 'sl-stranger', 5200);
      piano.forEach((p) => p.classList.add('stop'));
      later(doorsSwing, 3500);
      later(() => quote('…', 'sl', 1800, '32vh'), 900);
      later(() => piano.forEach((p) => p.classList.remove('stop')), 4800);
    };
    // A rider going by out in the street, 24 m off (hooves at y 600, 2.5 m nose to tail).
    const rider = () => { behindDoors(`<div style="font-size:${(2.5 * perM(600) * unit()).toFixed(1)}px;bottom:${fromSill(601)}px">${RIDER}</div>`, Math.random() < 0.5 ? 'sl-rider' : 'sl-rider-l', 6200); cue('gallop', 500); };
    // The player piano breaks into a rag: the keys go like the clappers, notes fly.
    const rag = () => {
      const piano = layer.querySelector('.sl-piano');
      piano?.classList.add('fast');
      later(() => piano?.classList.remove('fast'), 6000);
      const [x, y] = artAt(1300, onPiano(560));
      notes(x, y, '#e8b84a', 6);
    };
    // A tumbleweed blowing across the front of the floor (0.55 m, its bottom just under the picture):
    // in front of the piano, under the poker table.
    const tumble = (dur, y = rand(902, 914)) => {
      const size = 0.55 * perM(y) * unit();
      const top = artAt(0, y)[1] - (size / innerHeight) * 100;
      drift(TUMBLEWEED, { from: [-12, top], to: [112, top], dur, size, spin: 1080 }).classList.add('sc-tumble');
    };
    // A shot of whiskey slid along the poker table to someone (a 10 cm glass, at the table's 201
    // units to the metre), over the table.
    const slideShot = () => {
      const size = 0.1 * 201 * unit();
      const [x0, y] = artAt(Math.min(-40, leftEdge() - 30), 792);
      const [x1] = artAt(100, 792);
      el('<span>🥃</span>', { left: `${x0}vw`, top: `${y - (size / innerHeight) * 100}vh`, fontSize: `${size.toFixed(1)}px`, '--dx': `${x1 - x0}vw`, animation: 'sc-slide 4.5s cubic-bezier(0.1, 0.7, 0.3, 1) forwards' }, 4600).classList.add('sc-slider', 'sl-onnear');
    };
    SCENES.saloon = {
      decor() {
        saloonSaw = watcher();
        // (The poster 0.8 m tall, on the back wall: 106 units to the metre.)
        const u = unit();
        el(POSTER(), { left: '2vw', top: '14vh', fontSize: `${(0.8 * perM(736) * u).toFixed(1)}px` }).classList.add('sc-poster');
        onArt(DOORS, 1040, 491, 116, 0, 'sl-doors');
        onArt(POKER_TABLE, -60, 690, 340, 0, 'sl-near');
        // The player piano playing itself: the keys going down, the roll turning.
        onArt(PIANO_KEYS, 1204, onPiano(672), 244, 0, 'sl-piano');
        const roll = box(1290, onPiano(608), 72, 40 * PIANO_SQ, 0, 'sl-roll');
        roll.style.backgroundSize = `${(10 * u).toFixed(1)}px ${(7 * PIANO_SQ * u).toFixed(1)}px`;
        roll.style.setProperty('--h', `${(-7 * PIANO_SQ * u * 6).toFixed(1)}px`);
        // The lantern by the door flickering, dust floating in the sunbeams, the hound asleep.
        box(1028, 130, 140, 140, 0, 'sl-lamp');
        for (let i = 0; i < 16; i++) {
          const t = rand(0.05, 0.95);
          const [x, y] = artAt(200 + t * 500 + rand(0, 260), 120 + t * 660);
          el('', { left: `${x}vw`, top: `${y}vh`, animationDuration: `${rand(9, 16).toFixed(1)}s`, animationDelay: `-${rand(0, 16).toFixed(1)}s` }).classList.add('sl-mote');
        }
        const [zx, zy] = artAt(1462, 812);
        el('<b>z</b><b>z</b><b>z</b>', { left: `${zx}vw`, top: `${zy}vh` }).classList.add('sc-sleeper', 'sl-zzz');
      },
      update(s) {
        // The poster's always the host.
        const host = s?.players?.find((p) => p.id === s.hostId);
        const poster = layer?.querySelector('.sc-poster');
        const key = host ? `${host.avatar}|${host.name}|${host.color}` : '';
        if (poster && host && poster.dataset.key !== key) {
          poster.dataset.key = key;
          poster.innerHTML = POSTER(host.avatar || '🤠', host.name, host.color);
        }
        const e = saloonSaw?.(s);
        if (!e) return;
        if (e.over) {
          quote('YEE-HAW!', 'sl', 3000);
          for (let i = 0; i < 3; i++) later(() => { cue('bang'); inFront('<b>BANG!</b>', { left: `${rand(4, 50)}vw`, top: `${rand(6, 20)}vh` }, 1800).classList.add('sc-bang'); }, 400 + i * 500);
          for (let i = 0; i < 3; i++) toss(HAT, { x: 8 + i * 22, y: 80, size: 54, height: 24, spins: 2, delay: i * 0.3 });
          cue('cheer', 300);
        } else {
          quote(`Drink up, ${e.who}!`, 'sl');
          slideShot();
          cue('slide');
        }
      },
      moments: [
        () => tumble(rand(7, 10)),
        // A shootout: two gunslingers square up across the floor, 7.8 m off (feet at y 800, 1.8 m
        // in their hats): one behind the poker table, one in front of the doors. A tumbleweed rolls
        // between them... one draws, BANG, and the other keels over. The winner blows the smoke away.
        () => {
          const lefty = Math.random() < 0.5;
          const a = standAt(GUNSLINGER('#7a2a1a', '#3b2512'), Math.max(70, leftEdge() + 70), 800, 1.8, 9000);
          const b = standAt(GUNSLINGER('#2a4a6a', '#e8dcc0'), 1100, 800, 1.8, 9000);
          a.classList.add('sc-slinger', 'blk');
          b.classList.add('sc-slinger', 'blk', 'sc-face-l');
          later(() => tumble(4.5), 900);
          const [winner, loser] = lefty ? [a, b] : [b, a];
          const [bx, by] = artAt(lefty ? 150 : 940, 540);
          later(() => { winner.classList.add('draw'); cue('bang'); inFront('<b>BANG!</b>', { left: `${bx}vw`, top: `${by}vh` }, 1800).classList.add('sc-bang'); }, 4200);
          later(() => loser.classList.add('down'), 4450);
          later(() => winner.classList.add('smoke'), 5400);
        },
        // (A hawk in the rafters, 1.2 m across at the back wall.)
        () => { el(HAWK, { left: '14vw', top: '4vh', fontSize: `${(1.2 * perM(736) * unit()).toFixed(1)}px` }, 12000).classList.add('sc-hawk'); cue('hawk', 1500); },
        // (A hat blown along low over the front of the floor, 0.4 m across.)
        () => drift(HAT, { from: [-10, 80], to: [110, 72], dur: rand(5, 7), size: 0.4 * perM(910) * unit(), spin: 540 }).classList.add('sl-onnear'),
        () => { slideShot(); cue('slide', 200); },
        // (A rattlesnake 1 m long, across the front of the floor like the tumbleweed.)
        () => {
          const size = perM(906) * unit();
          const d = crossing(critter('snake'), { y: 0, dur: 9, size, faces: 'right' });
          // (Its belly, 0.8 of the way down the drawing, on the floor at y 906: the drawing sits
          // a little way down its line, so measured.)
          const s = d.querySelector('svg').getBoundingClientRect();
          d.style.top = `${artAt(0, 906)[1] - ((s.top - d.getBoundingClientRect().top + s.height * 0.8) / innerHeight) * 100}vh`;
          cue('rattle', 500);
        },
        () => drift('➰', { from: [-10, rand(10, 16)], to: [110, rand(6, 14)], dur: rand(5, 7), size: 60, spin: 1080, opacity: 0.85 }),
        stranger,
        rider,
        rag,
      ],
    };
  })();

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
    timers.clear();
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
  // (kit: the character kit, for drawing and checking characters outside a scene.)
  window.Scenery = { set, play, update, styles: Object.keys(SCENES), kit: { figure, figureAt, critter, SKIN, SKINS, skinFor, HAIR, INK, LW, ARM_POSES, LEG_POSES } };
})();
