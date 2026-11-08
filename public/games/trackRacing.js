// Screens for Track Racing. Server logic: games/trackRacing.js
//
// The TV shows the whole track from above. The track is drawn on canvases: the track itself once
// (grass is the room's felt showing through), skid marks as they're laid, and the cars every
// frame. The cars' positions arrive 20 times a second ('cars' signals); screens draw them a moment
// behind, sliding between the two updates either side, so they move smoothly whatever the network
// does: how far behind depends on how unevenly they've been arriving (see "Where the cars are").
//
// Phones show the race from their own car: a chase cam just behind and above it, looking down the
// track, like an arcade racer. That's WebGL: the same top-down track, painted once into a texture,
// is the ground (each pixel below the horizon traced back to the spot on the ground it shows, so
// there's no geometry to it), and the barriers, the scenery and the cars are little 3D models.
// Names (avatars) and the hooting go on a 2D canvas over it. With no WebGL, a top-down map that
// turns with the car stands in.
//
// Phones are steering wheels. Tilt: the phone's angle in the plane of its screen (worked out from
// gravity, so it's the same held upright like a wheel, sideways in landscape, or tipped back
// toward you), relative to where you hold it level. On iPhones, motion needs a tap to allow it
// (DeviceOrientationEvent.requestPermission). With no tilt (a laptop, or permission refused) there
// are ◀ ▶ buttons, and the arrow keys. Right half of the screen: gas. Left: brake, and reverse.
//
// And each phone is its own car's sound: the engine, the tyres, the knocks (see "Your car's
// sounds"), TV or no TV.
(() => {
  const { esc, name } = PB;
  // How far behind the race the cars are drawn (seconds), worked out from how the updates arrive
  // (see playout): one update's gap, plus how late they've been coming (the 85th percentile of the
  // last few seconds, over the quickest), plus a little; between `min` and `max`. The clock eases
  // there at no more than `slew` (8 % fast or slow), and past the newest update the cars carry on
  // in the way they were going for up to `extra`, which rides out a short stall on a phone's
  // network. (Tuned on recorded races over modelled Wi-Fi, 4G and patchy mobile networks.)
  const PLAY = { gap: 0.05, margin: 0.012, min: 0.06, max: 0.35, q: 0.85, window: 80, slew: 0.08, extra: 0.25 };
  const FULL_LOCK = 40; // degrees of tilt for full steering
  const SEND_GAP = 66; // ms between steering updates to the server
  const BARRIER = 7; // the tyre wall stands this far past the edge the cars bounce off
  const SPOTS = 8; // places round the lap for the room's own props
  const SPOT_R = 20; // room for one (no prop is wider than twice this)

  // ---------- Colours ----------

  const css = (v, fallback) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;
  // '#rrggbb' (or '#rgb') to [r, g, b] from 0 to 1.
  function rgb(hex, fallback = [0.5, 0.5, 0.5]) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return fallback;
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
  // The room's felt is a CSS background (gradients, stripes): its plain colours, for the grass.
  function feltColours() {
    const list = (css('--felt', '').match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map((h) => rgb(h));
    return list.length ? list : [[0.25, 0.56, 0.31], [0.18, 0.48, 0.24], [0.14, 0.37, 0.19]];
  }
  // The colours the track is painted in, from the room's look (read once per track drawn).
  function palette() {
    return { accent: css('--accent', '#e53950'), rim: css('--rim', '#d8d8d8'), bg: rgb(css('--bg', '#14111f')), card: rgb(css('--card', '#221d33')), card2: rgb(css('--card-2', '#2d2644')), accentRgb: rgb(css('--accent', '#e53950')), felt: feltColours() };
  }

  // ---------- Weather ----------
  //
  // Each race's weather comes with the state (the server picks it: games/trackRacing.js). From the
  // car: `light` on everything (with the room's colours still in the sky, mixed toward `sky`), the
  // haze it fades into and how far off (`far`), colours washed out (`mute`), the asphalt wet and
  // shining (`wet`), headlights (`lamps`: the barriers' white tyres and the gantry glow too),
  // snow on the verges and trees, and rain or snow falling (`fall`). On the TV, the same as a tint
  // and a layer of rain or snow over the track (style.css: .tr-wx, .tr-fall).
  const WX = {
    clear: { light: [1, 1, 1], far: 700 },
    sunset: { light: [1.06, 0.84, 0.7], sky: ['#2a2450', '#ff8a4a'], haze: [0.93, 0.6, 0.45], far: 700 },
    night: { light: [0.32, 0.36, 0.52], sky: ['#02040a', '#0e1830'], haze: [0.03, 0.04, 0.08], far: 620, lamps: true, flat: 'rgba(8, 12, 40, 0.55)' },
    rain: { light: [0.62, 0.66, 0.72], sky: ['#262c34', '#5a626c'], haze: [0.34, 0.37, 0.41], far: 480, wet: 1, fall: 'rain', flat: 'rgba(30, 40, 60, 0.3)' },
    fog: { light: [0.86, 0.87, 0.89], sky: ['#9aa2aa', '#c4c8cc'], haze: [0.72, 0.74, 0.76], far: 230, mute: 0.45, flat: 'rgba(200, 205, 210, 0.4)' },
    snow: { light: [0.9, 0.93, 1.02], sky: ['#6d7a8c', '#d8dee6'], haze: [0.8, 0.83, 0.88], far: 460, mute: 0.15, snow: true, fall: 'snow' },
  };
  const weatherOf = (s = PB.state) => (WX[s?.game?.weather] ? s.game.weather : 'clear');

  // ---------- Each venue's race ----------
  //
  // The track's dressed for the room it's racing in (lib/roomStyles.js): the ground and the verges,
  // the kerbs and the white lines, what the barriers are, what's piled on the outside of the bends,
  // what stands about in the fields, who's in the grandstand, the gantry over the start, the sky all
  // round, how the weather looks there, and what glows or drifts about. One table for the TV's view
  // from above (drawStatic, drawScenery, above) and the phone's from the car (sceneModel,
  // skyCanvas, groundCanvas, fp). All of it's decoration: the road, the walls and the cars are the
  // same everywhere (Rainbow Road apart: no walls out there, the server's rule as well).
  //
  // Each venue's entry is laid over THEME (the plain track, as at the classic venue):
  //   ground, verge      the ground beyond the barriers and the verges inside them (patterns: GROUNDS;
  //                      null: the room's felt, as grass)
  //   out, dim           past the edge of the world, from the car ([r, g, b]); how much darker
  //                      it is beyond the barriers (from above)
  //   line, kerb, kerbAlt    the white lines along the asphalt; the kerbs' colours (null: the accent)
  //   barrier, wall, wall2   what stands along the edge (see barrierAbove, barrierModel) and its two
  //                      colours (null: the room's rim colour)
  //   stack              what's piled on the outside of the bends (stackAbove, stackModel)
  //   tree, trees        what stands about in the fields (treeAbove, treeModel), on what share of spots
  //   stand, seat, crowd, roof   the grandstand (2D, 3D), its crowd's colours ('ghosts'; null: anyone)
  //   gantry, post, beam, pillar, cap   over the start (gantry, arch, neon, torch), its colours, a
  //                      prop on top of each post and what it stands on (from above)
  //   bridge             the figure eight's bridge: slab, deck, line, rail (2D); concrete, trim (3D)
  //   sky                colours and a skyline for the sky all round (skyCanvas), or a whole one: draw
  //   wx                 the weather as this venue sees it, over WX, by kind
  //   along, field, wisps, wisp, art   props along the fence and out in the fields (extrasOf; kinds
  //                      from the venue's props or `art`), and lights drifting about (and their colour)
  //   glow               the colour things that glow glow
  //   fx                 lightning, phantom, bats, comets
  //   words              the countdown (count: after each number, go), the last lap, the flag
  //   cls, overlay       the TV's stage: a class, and what goes over it (HTML)
  //   void               Rainbow Road: off the road there's nothing, just space
  const THEME = {
    ground: null, verge: null, out: null, dim: 0.42,
    line: '#ececec', kerb: '#f4f4f4', kerbAlt: null,
    barrier: 'tyres', wall: null, wall2: '#151515',
    stack: 'tyres', tree: 'pine', trees: 1,
    stand: '#8d939b', seat: [0.55, 0.58, 0.62], crowd: null, roof: null,
    gantry: 'gantry', post: [0.85, 0.85, 0.87], beam: '#26262b', pillar: null, cap: null,
    bridge: { slab: '#8f8d86', deck: '#a9a69d', line: '#ececec', rail: null, concrete: [0.62, 0.62, 0.6], trim: null },
    sky: null, wx: null,
    along: null, field: null, wisps: 0, wisp: 'green', art: null, glow: 'orange',
    fx: {}, words: { count: '', go: 'GO!', final: 'Final lap!', finish: '🏁' },
    cls: '', overlay: '', void: false,
    // (And a few for one kind of thing: a castle wall's crenels, the stone of the graves and the
    // arch, the street lamps' light, the drums' paint.)
    crenels: false, stone: null, lamp: 'warm', drum: null,
  };

  // At the Halloween venue the track's a haunted graveyard (after its room art: lib/roomArt.js,
  // hauntedHill()): always dark (the server only picks night or fog there), a full moon low over a
  // purple and green sky, a haunted house on the hill, dead grass and graveyard earth for verges,
  // orange and black kerbs, an iron cemetery fence for the barriers, dead trees, gravestones and
  // jack-o'-lanterns, a gothic arch over the start, ghosts and skeletons in the grandstand. Low fog
  // drifts over the ground (`low`), bats flit over the sky, will-o'-the-wisps float about, lightning
  // flashes now and then, and a phantom car drives a lap every so often (only for show: it goes
  // through everything).
  const HAUNTED_WX = {
    night: { light: [0.34, 0.3, 0.5], sky: ['#06030d', '#24463a'], haze: [0.1, 0.12, 0.13], far: 560, lamps: true, flat: 'rgba(22, 8, 40, 0.5)', moon: true, low: [0.3, 0.28, 0.4], lowK: 0.55 },
    fog: { light: [0.52, 0.5, 0.64], sky: ['#1a1228', '#4e5a58'], haze: [0.34, 0.35, 0.4], far: 250, mute: 0.3, lamps: true, flat: 'rgba(110, 100, 140, 0.45)', moon: true, low: [0.46, 0.45, 0.52], lowK: 0.32 },
  };
  // Rainbow Road (the space lounge's easter egg: games/trackRacing.js): out among the stars the road
  // glows by its own light, whatever the server calls the weather (always night), fading into the
  // dark far off.
  const SPACE_WX = { light: [0.95, 0.95, 1], sky: ['#030210', '#120a2e'], haze: [0.02, 0.015, 0.06], far: 900, flat: 'rgba(6, 4, 30, 0.25)' };
  const RAINBOW_WX = Object.fromEntries(Object.keys(WX).map((k) => [k, SPACE_WX]));
  const RAINBOW = ['#ff3b5c', '#ff8a1f', '#ffd23f', '#4ade5a', '#2ab8ff', '#5a6aff', '#b04aff'];

  const RACE_THEMES = {
    classic: {},
    // The dive: the car park out back after midnight. Cracked tarmac, concrete blocks, oil drums,
    // street lamps, the town's lights.
    dive: {
      ground: 'lot', out: [0.08, 0.08, 0.09], line: '#e8e2d0', kerb: '#1a1612',
      barrier: 'wall', wall: '#9a958c', wall2: '#ff5a36', stack: 'drums', tree: 'lamp', trees: 0.3, lamp: 'warm',
      stand: '#4a3f36', seat: [0.3, 0.26, 0.22], crowd: ['#3a3a40', '#5a4a3a', '#7a2a2a', '#2a3a5a', '#d8c8a8'],
      sky: { skyline: 'city', lights: '#ff5a36' },
    },
    // The tavern: the village green. A wooden fence, hay bales, oaks.
    tavern: {
      dim: 0.24, ground: 'meadow', out: [0.12, 0.2, 0.09], line: '#efe6d0', kerb: '#f7ead2',
      barrier: 'rail', wall: '#6a4424', stack: 'hay', tree: 'round',
      stand: '#6a4a30', seat: [0.42, 0.29, 0.19], crowd: ['#7a5a3a', '#3a5a2a', '#8a2a1a', '#c8a870', '#4a3a6a'], roof: '#8a2a1a',
      post: [0.42, 0.27, 0.14], beam: '#4a3018',
    },
    // The club: a neon grid in the dark, glowing tubes for barriers, speaker stacks, the city lit up.
    club: {
      ground: 'neon', out: [0.03, 0.02, 0.06], line: '#29f0ff', kerb: '#141022',
      barrier: 'neon', wall: '#29f0ff', stack: 'speakers', tree: 'lamp', trees: 0.25, lamp: 'pink',
      stand: '#201a36', seat: [0.13, 0.1, 0.21], crowd: ['#ff2bd6', '#29f0ff', '#ffe14d', '#7dff9e', '#b04aff'],
      gantry: 'neon', sky: { skyline: 'city', lights: '#ff2bd6' },
    },
    // The castle: the bailey. Cobbles, a crenellated stone wall with torches along it, an arch over
    // the start, towers on the skyline.
    castle: {
      ground: 'cobble', out: [0.16, 0.15, 0.17], line: '#efe9dc', kerb: '#c8303f',
      barrier: 'wall', wall: '#8a8694', wall2: '#6a6674', crenels: true, stack: 'hay', tree: 'pine', trees: 0.6,
      stand: '#5a5666', seat: [0.36, 0.34, 0.4], crowd: ['#c8303f', '#d4af37', '#3a5aa8', '#6a6a7a', '#efe9dc'], roof: '#c8303f',
      gantry: 'arch', pillar: 'torch', beam: '#5a5666', stone: [0.5, 0.48, 0.55],
      along: { kind: 'torch', size: [12, 2], every: 12 }, art: [['torch', 34, 0.4, 0, true]], glow: 'fire',
      bridge: { slab: '#6a6674', deck: '#7a7684', line: '#efe9dc', rail: '#d4af37', concrete: [0.45, 0.43, 0.5], trim: [0.83, 0.69, 0.22] },
      sky: { skyline: 'towers' },
    },
    // The jazz club: New Orleans at night. Brick streets, wrought iron, gas lamps.
    jazz: {
      ground: 'brick', out: [0.12, 0.06, 0.05], line: '#e3b04b', kerb: '#1a0d12',
      barrier: 'fence', stack: 'barrels', tree: 'lamp', trees: 0.3, lamp: 'warm',
      stand: '#3a1c27', seat: [0.23, 0.11, 0.15], crowd: ['#1a1a1a', '#e3b04b', '#7a1a2a', '#f6e7d8', '#3a3a5a'],
      sky: { skyline: 'city', lights: '#e3b04b' },
    },
    // The diner: a black and white checked floor, chrome stools, neon.
    diner: {
      dim: 0.24, ground: 'checker', out: [0.2, 0.2, 0.2], line: '#ffffff', kerb: '#ffffff',
      barrier: 'neon', wall: '#ff4d6d', stack: 'stools', tree: 'round', trees: 0.5,
      stand: '#d8d0c0', seat: [0.8, 0.78, 0.74], crowd: ['#ff8fab', '#8fd3ff', '#ffe08a', '#9be8b4', '#e63946'], roof: '#e63946',
      gantry: 'neon',
    },
    // The tiki bar: a beach at dusk. Sand, a bamboo fence with tiki torches along it, palms, lava
    // rocks, the sea on the horizon.
    tiki: {
      dim: 0.24, ground: 'sand', out: [0.1, 0.32, 0.42], line: '#fbf1dc', kerb: '#fbf1dc',
      barrier: 'rail', wall: '#c9a45a', stack: 'rocks', tree: 'palm', trees: 0.7,
      stand: '#7a5a3a', seat: [0.48, 0.35, 0.23], crowd: ['#ff8a3d', '#ff4f5e', '#6fdc8c', '#ffd23f', '#2ab8ff'], roof: '#c9a45a',
      gantry: 'torch', post: [0.79, 0.64, 0.35], beam: '#8a6a3a', pillar: 'torch',
      along: { kind: 'torch', size: [12, 2], every: 10 }, art: [['torch', 34, 0.4, 0, true]], glow: 'fire',
      sky: { skyline: 'sea' },
    },
    // The speakeasy: Chicago after dark. Wet cobbles, iron railings, gas lamps, barrels of the good stuff.
    speakeasy: {
      ground: 'cobble', out: [0.08, 0.06, 0.06], line: '#c9a24a', kerb: '#22110f',
      barrier: 'fence', stack: 'barrels', tree: 'lamp', trees: 0.3, lamp: 'warm',
      stand: '#331a16', seat: [0.2, 0.1, 0.09], crowd: ['#1a1a1a', '#c9a24a', '#5a1a1a', '#f3e8d4', '#2a2a3a'],
      sky: { skyline: 'city', lights: '#ffd27a' },
    },
    // The casino: the Strip. Casino carpet, gold neon, stacks of chips, palms, the lights of Vegas.
    casino: {
      ground: 'carpet', out: [0.2, 0.04, 0.05], line: '#f5c542', kerb: '#c8202e',
      barrier: 'neon', wall: '#f5c542', stack: 'chips', tree: 'palm', trees: 0.45,
      stand: '#3a1418', seat: [0.23, 0.08, 0.09], crowd: ['#f5c542', '#c8202e', '#141414', '#fff2e0', '#4fd18b'],
      gantry: 'neon', sky: { skyline: 'city', lights: '#f5c542' },
    },
    // The saloon: the desert. Red sand, a wooden rail, hay bales, cacti, mesas.
    saloon: {
      dim: 0.24, ground: 'desert', out: [0.55, 0.32, 0.17], line: '#fbecd2', kerb: '#fbecd2', kerbAlt: '#c8452f',
      barrier: 'rail', wall: '#7a5230', stack: 'hay', tree: 'cactus', trees: 0.6,
      stand: '#6a4a2a', seat: [0.42, 0.29, 0.16], crowd: ['#7a5a3a', '#3a5a8a', '#c8452f', '#e0a43a', '#d0b28a'], roof: '#7a5230',
      post: [0.48, 0.32, 0.19], beam: '#4a3018',
      sky: { skyline: 'mesas' },
    },
    // The pirate tavern: the harbour. A boardwalk round the track, out over the sea; rope on posts,
    // barrels, rocks in the water.
    pirate: {
      ground: 'sea', verge: 'boards', out: [0.06, 0.2, 0.3], line: '#f2e6cc', kerb: '#f2e6cc',
      barrier: 'rope', wall: '#5a3a1e', wall2: '#c9a86a', stack: 'barrels', tree: 'rock', trees: 0.35,
      stand: '#4a3220', seat: [0.29, 0.2, 0.13], crowd: ['#c8302e', '#f2e6cc', '#1a1a1a', '#e3b23c', '#3a5a7a'],
      post: [0.35, 0.23, 0.12], beam: '#2a1a0e',
      sky: { skyline: 'sea' },
    },
    // The beer hall: Bavaria. A meadow, bunting in blue and white, kegs, pines, the Alps.
    beerhall: {
      dim: 0.24, ground: 'meadow', out: [0.16, 0.3, 0.12], line: '#ffffff', kerb: '#ffffff',
      barrier: 'bunting', wall: '#2a6fdb', wall2: '#ffffff', stack: 'barrels', tree: 'pine',
      stand: '#8a6a4a', seat: [0.54, 0.42, 0.29], crowd: ['#2a6fdb', '#ffffff', '#2b9a5a', '#d63c3c', '#e8c88a'], roof: '#2a6fdb',
      sky: { skyline: 'peaks' },
    },
    // The space lounge (without its easter egg: only in a preview): a base on the moon.
    space: {
      ground: 'moon', out: [0.05, 0.05, 0.07], line: '#7cf0ff', kerb: '#eef1ff',
      barrier: 'neon', wall: '#7cf0ff', stack: 'rocks', tree: 'rock', trees: 0.5,
      stand: '#1a1f3d', seat: [0.1, 0.12, 0.24], crowd: ['#7dff9e', '#7cf0ff', '#ff5c8a', '#b04aff', '#eef1ff'],
      gantry: 'neon', sky: { draw: (pal, wx) => spaceSky(pal, wx, false) }, fx: { comets: true },
    },
    // Rainbow Road: the space lounge's easter egg. No ground, no walls: a glowing rainbow of a road
    // out among the stars and planets, comets going over, a neon arcade gantry at the start.
    rainbow: {
      void: true, out: [0.01, 0.01, 0.03], line: '#ffffff', kerb: '#ffffff',
      barrier: 'none', stack: 'none', tree: 'none', trees: 0, stand: null,
      gantry: 'neon', wx: RAINBOW_WX, sky: { draw: (pal, wx) => spaceSky(pal, wx, true) },
      fx: { comets: true }, words: { final: '🌈 Final lap!', finish: '🌈' }, cls: 'rainbow',
    },
    // The lighthouse: the coast. Grass on the cliff tops, a whitewashed wall, rocks, the sea.
    lighthouse: {
      dim: 0.24, ground: 'meadow', out: [0.1, 0.25, 0.35], line: '#eef3f8', kerb: '#f4f1ea', kerbAlt: '#c8302e',
      barrier: 'wall', wall: '#d8d8d0', wall2: '#b8b8b0', stack: 'rocks', tree: 'rock', trees: 0.5,
      stand: '#4a5d6e', seat: [0.29, 0.36, 0.43], crowd: ['#f4c95d', '#2a4a6a', '#c8302e', '#eef3f8', '#3a6a5a'],
      sky: { skyline: 'sea' },
    },
    // The vineyard: rows of vines, a low stone wall, wine barrels, cypresses.
    vineyard: {
      dim: 0.24, ground: 'vines', out: [0.4, 0.36, 0.2], line: '#f8f0dc', kerb: '#f8f0dc',
      barrier: 'wall', wall: '#c9a77a', wall2: '#a8875a', stack: 'barrels', tree: 'cypress', trees: 0.5,
      stand: '#8a6a4a', seat: [0.54, 0.42, 0.29], crowd: ['#c0392b', '#f8f0dc', '#6a8a3a', '#e0a050', '#3a3a5a'], roof: '#b5562a',
    },
    // The frat house: the back lawn, striped. Kegs on the bends.
    frat: {
      dim: 0.24, ground: 'turf', out: [0.14, 0.3, 0.12], line: '#ffffff', kerb: '#ffffff',
      stack: 'drums', tree: 'round', drum: [0.75, 0.77, 0.8],
      stand: '#6a4a3a', seat: [0.42, 0.29, 0.23], crowd: ['#d62828', '#1b3f8e', '#ffffff', '#d4af37', '#3a3a3a'], roof: '#d62828',
    },
    // The garage: the yard out back. Concrete, hazard kerbs, oil drums, floodlights.
    garage: {
      dim: 0.24, ground: 'concrete', out: [0.3, 0.3, 0.32], line: '#ffd23f', kerb: '#ffd23f', kerbAlt: '#1a1a1a',
      stack: 'drums', tree: 'lamp', trees: 0.2, lamp: 'white',
      stand: '#3a4048', seat: [0.23, 0.25, 0.28], crowd: ['#2a5a9a', '#ffd23f', '#5a5a5a', '#d0d0d0', '#c84a2a'],
      sky: { skyline: 'city', lights: '#ffd23f' },
    },
    // The château: the formal garden. Raked gravel, lawns inside box hedges, clipped trees.
    chateau: {
      dim: 0.24, ground: 'gravel', verge: 'turf', out: [0.6, 0.58, 0.52], line: '#fbf8ee', kerb: '#fbf8ee',
      barrier: 'hedge', wall: '#2f6e34', stack: 'topiary', tree: 'round', trees: 0.5,
      stand: '#d8d0b8', seat: [0.8, 0.77, 0.68], crowd: ['#1a1a1a', '#e6c06a', '#fbf8ee', '#3a4a8a', '#8a2a4a'], roof: '#3a4a6a',
    },
    // Christmas: it always snows. Candy-cane barriers and kerbs, presents, snowy pines and peaks.
    christmas: {
      dim: 0.24, ground: 'snow', out: [0.78, 0.81, 0.86], line: '#ffffff', kerb: '#ffffff', kerbAlt: '#e2403b',
      barrier: 'candy', wall: '#e2403b', wall2: '#ffffff', stack: 'presents', tree: 'pine',
      stand: '#5a3a2a', seat: [0.36, 0.23, 0.16], crowd: ['#e2403b', '#2a8a4a', '#ffffff', '#e8b84a', '#c8302e'], roof: '#e2403b',
      post: [0.9, 0.25, 0.23], beam: '#e2403b', sky: { skyline: 'peaks' },
    },
    halloween: {
      ground: 'earth', out: [0.07, 0.055, 0.05], line: '#d4cab4', kerb: '#141016',
      barrier: 'fence', stack: 'graves', tree: 'dead',
      stand: '#3e3848', seat: [0.3, 0.28, 0.34], crowd: 'ghosts',
      gantry: 'arch', beam: '#4a4258', pillar: 'lantern', cap: '#5e5670',
      bridge: { slab: '#4a4452', deck: '#5a5462', line: '#d4cab4', rail: '#e07a1a', concrete: [0.34, 0.31, 0.38], trim: [0.85, 0.36, 0.07] },
      sky: { draw: (pal, wx) => (wx.moon ? hauntedSky(pal, wx) : null) },
      wx: HAUNTED_WX,
      along: { kind: 'lantern', size: [11, 4], every: 9 }, field: { kinds: [['tomb', 0.62], ['cross', 1]], count: 44, size: [13, 6] }, wisps: 12,
      fx: { lightning: true, phantom: true, bats: true },
      words: { count: '…', go: 'BOO!', final: '💀 Final lap!', finish: '🎃' },
      cls: 'haunted', overlay: '<div class="tr-haunt" aria-hidden="true"><i class="tr-fog"></i><i class="tr-bats"></i><i class="tr-flash"></i></div>',
    },
    // The Highlands: heather, dry stone walls, Scots pines, the hills.
    stpatricks: {
      dim: 0.24, ground: 'heather', out: [0.2, 0.24, 0.16], line: '#f6f0e2', kerb: '#f6f0e2', kerbAlt: '#2f8a4a',
      barrier: 'wall', wall: '#7d8085', wall2: '#5d6065', stack: 'rocks', tree: 'pine', trees: 0.7,
      stand: '#4a3a2a', seat: [0.29, 0.23, 0.16], crowd: ['#2f6a3a', '#8a2a2a', '#2a3a6a', '#e6b84a', '#f6f0e2'],
      sky: { skyline: 'peaks' },
    },
  };
  // Easter eggs and moods race in their own room's (venueOf), but for these.
  const THEME_LOOKS = { garageWasteland: 'saloon' };
  const themes = {};
  function themeIdOf(s = PB.state) {
    if (s?.game?.rainbow) return 'rainbow';
    const look = s?.look || s?.style;
    return THEME_LOOKS[look] || venueOf(s);
  }
  function themeOf(s = PB.state) {
    const id = themeIdOf(s);
    if (!themes[id]) {
      const t = RACE_THEMES[id] || {};
      themes[id] = { ...THEME, ...t, id, bridge: { ...THEME.bridge, ...t.bridge }, words: { ...THEME.words, ...t.words }, fx: { ...THEME.fx, ...t.fx } };
    }
    return themes[id];
  }
  // The weather as this venue sees it.
  const wxOf = (s = PB.state) => themeOf(s).wx?.[weatherOf(s)] || WX[weatherOf(s)];
  // Whether a spot in the fields has something standing on it (`trees`: the share that do).
  const kept = (p, th) => th.trees >= 1 || ((((p.x * 12.9898 + p.y * 78.233) % 1) + 1) % 1) < th.trees;
  const calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // Lightning, now and then (0 to 1): a flash, a gap, a second flash fading. Not for reduced motion.
  function lightning(ms) {
    if (calm.matches) return 0;
    const n = Math.floor(ms / 12000);
    const into = ms - n * 12000 - ((n * 7919) % 6) * 900;
    if (into < 0) return 0;
    if (into < 90) return 1;
    if (into < 170) return 0;
    if (into < 600) return 0.7 * (1 - (into - 170) / 430);
    return 0;
  }
  // A jack-o'-lantern's flicker (around 1), each one its own way.
  const flicker = (ms, k) => 0.82 + 0.12 * Math.sin(ms * 0.017 + k * 1.7) + 0.06 * Math.sin(ms * 0.043 + k * 2.3);

  // The same random scenery on every screen.
  function seeded(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- The track's shape ----------

  function trackPath(line) {
    const p = new Path2D();
    const n = line.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(line[n - 1], line[0]);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(line[i], line[(i + 1) % n]);
      p.quadraticCurveTo(line[i][0], line[i][1], m[0], m[1]);
    }
    p.closePath();
    return p;
  }

  // The centreline every 10 units or so (the curve trackPath draws), which way it's going, how
  // hard it's bending, where the barriers stand and the scenery round it. Worked out once a track.
  const shapes = {};
  function shapeOf(tr) {
    const key = `${tr.id}:${tr.line.length}`;
    if (shapes[key]) return shapes[key];
    const L = tr.line;
    const n = L.length;
    const xs = [];
    const ys = [];
    const zs = []; // how high the road is (the hard maps' hills: 0 everywhere on the rest)
    for (let i = 0; i < n; i++) {
      const p0 = L[(i - 1 + n) % n];
      const p1 = L[i];
      const p2 = L[(i + 1) % n];
      const ax = (p0[0] + p1[0]) / 2;
      const ay = (p0[1] + p1[1]) / 2;
      const bx = (p1[0] + p2[0]) / 2;
      const by = (p1[1] + p2[1]) / 2;
      const az = ((p0[2] || 0) + (p1[2] || 0)) / 2;
      const bz = ((p1[2] || 0) + (p2[2] || 0)) / 2;
      for (const t of [0, 0.5]) {
        const u = 1 - t;
        xs.push(u * u * ax + 2 * u * t * p1[0] + t * t * bx);
        ys.push(u * u * ay + 2 * u * t * p1[1] + t * t * by);
        zs.push(u * u * az + 2 * u * t * (p1[2] || 0) + t * t * bz);
      }
    }
    const N = xs.length;
    const at = (i) => ((i % N) + N) % N;
    const head = xs.map((x, i) => Math.atan2(ys[at(i + 1)] - ys[at(i - 1)], xs[at(i + 1)] - xs[at(i - 1)]));
    // The right-hand side of the road (going round), and how much it turns over the next few metres
    // either side (+ = to the right).
    const nx = head.map((a) => -Math.sin(a));
    const ny = head.map((a) => Math.cos(a));
    const bend = head.map((a, i) => {
      const d = head[at(i + 2)] - head[at(i - 2)];
      return Math.atan2(Math.sin(d), Math.cos(d));
    });
    const near = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < N; i++) best = Math.min(best, (xs[i] - x) ** 2 + (ys[i] - y) ** 2);
      return Math.sqrt(best);
    };
    const edge = tr.width / 2 + tr.band;
    const hills = hillsOf(tr, { N, xs, ys, zs, nx, ny, bend, at, edge });
    // (Where the loop crosses itself, only the road on your own level is in the way: the bridge's
    // railings run on over the road below, and that road's barriers on under the bridge.)
    const nearOn = (x, y, z) => {
      if (!tr.crossing) return near(x, y);
      let best = Infinity;
      for (let i = 0; i < N; i++) if (Math.abs(zs[i] - z) < 10) best = Math.min(best, (xs[i] - x) ** 2 + (ys[i] - y) ** 2);
      return Math.sqrt(best);
    };
    // The barriers either side, except where one would fold back on itself (inside a hairpin).
    const walls = [-1, 1].map((side) => {
      const off = (edge + BARRIER) * side;
      const w = { x: xs.map((x, i) => x + nx[i] * off), y: ys.map((y, i) => y + ny[i] * off), z: zs.map((z, i) => z + hills.bank[i] * off) };
      w.ok = w.x.map((x, i) => nearOn(x, w.y[i], zs[i]) > edge + BARRIER - 2);
      return w;
    });
    // The start line, and the grid behind it (as the server lines the cars up: games/trackRacing.js).
    let startI = 0;
    for (let i = 1; i < N; i++) if ((xs[i] - tr.start[0]) ** 2 + (ys[i] - tr.start[1]) ** 2 < (xs[startI] - tr.start[0]) ** 2 + (ys[startI] - tr.start[1]) ** 2) startI = i;
    const back = (dist) => {
      let i = startI;
      let d = 0;
      while (d < dist) { d += Math.hypot(xs[i] - xs[at(i - 1)], ys[i] - ys[at(i - 1)]); i = at(i - 1); }
      return i;
    };
    const grid = Array.from({ length: 8 }, (_, k) => {
      const i = back(34 + Math.floor(k / 2) * 32);
      const side = (k % 2 ? 1 : -1) * 15;
      return { x: xs[i] + nx[i] * side, y: ys[i] + ny[i] * side, a: head[i] };
    });
    // Scenery: a grandstand by the start (on whichever side has room), tyre stacks behind the
    // barriers on the outside of the bends, and trees scattered round.
    const rand = seeded(tr.id);
    const W = tr.world.w;
    const H = tr.world.h;
    const inside = (x, y, m) => x > m && y > m && x < W - m && y < H - m;
    const props = [];
    const free = (x, y, r) => props.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > (p.r + r + 4) ** 2);
    let stand = null;
    for (const side of [-1, 1]) {
      const i = at(startI - 6);
      const d = edge + BARRIER + 26;
      const cx = xs[i] + nx[i] * d * side;
      const cy = ys[i] + ny[i] * d * side;
      const a = head[i];
      const ok = [-1, -0.5, 0, 0.5, 1].every((f) => [-1, 1].every((g) => {
        const x = cx + Math.cos(a) * f * 85 + nx[i] * side * g * 16;
        const y = cy + Math.sin(a) * f * 85 + ny[i] * side * g * 16;
        return inside(x, y, 6) && near(x, y) > edge + BARRIER + 6;
      }));
      if (ok) { stand = { x: cx, y: cy, a, side, len: 170, depth: 30 }; break; }
    }
    if (stand) props.push({ kind: 'stand', x: stand.x, y: stand.y, r: 90 });
    for (let i = 0; i < N; i += 3) {
      if (Math.abs(bend[i]) < 0.3) continue;
      const side = -Math.sign(bend[i]);
      const d = edge + BARRIER + 12;
      const x = xs[i] + nx[i] * d * side;
      const y = ys[i] + ny[i] * d * side;
      if (inside(x, y, 8) && near(x, y) > edge + BARRIER + 6 && free(x, y, 7)) props.push({ kind: 'tyres', x, y, r: 7 });
    }
    // The room's own props (see VENUE_PROPS): a spot every so often round the lap, just behind the
    // barrier on one side or the other, wherever there's room (nudged on down the track if not).
    // `bx, by` is the foot of the barrier behind it and `ox, oy` the way out from the track; the
    // prop stands as far out from there as it's wide, so it never leans into the tyres.
    const every = Math.floor(N / SPOTS);
    let made = 0;
    for (let k = 0; k < SPOTS; k++) {
      let done = false;
      for (let t = 0; t < every * 0.6 && !done; t++) {
        const i = at(startI + Math.round(every * (k + 0.5)) + t);
        for (const side of k % 2 ? [1, -1] : [-1, 1]) {
          if (!walls[side > 0 ? 1 : 0].ok[i]) continue;
          const base = edge + BARRIER + 5;
          const x = xs[i] + nx[i] * (base + SPOT_R) * side;
          const y = ys[i] + ny[i] * (base + SPOT_R) * side;
          if (!inside(x, y, SPOT_R) || near(x, y) < base + SPOT_R - 1 || !free(x, y, SPOT_R)) continue;
          props.push({ kind: 'venue', which: made++, x, y, r: SPOT_R, bx: xs[i] + nx[i] * base * side, by: ys[i] + ny[i] * base * side, ox: nx[i] * side, oy: ny[i] * side });
          done = true;
          break;
        }
      }
    }
    for (let k = 0; k < 900 && props.length < 110; k++) {
      const x = 12 + rand() * (W - 24);
      const y = 12 + rand() * (H - 24);
      const r = 7 + rand() * 6;
      const d = near(x, y);
      if (d < edge + BARRIER + r + 6 || d > edge + 240 || !free(x, y, r)) continue;
      props.push({ kind: 'tree', x, y, r, h: 20 + rand() * 18, tone: rand() });
    }
    shapes[key] = { N, xs, ys, zs, nx, ny, head, bend, walls, startI, grid, stand, props, ...hills };
    // Everything off the road stands on the ground: up an embankment if it's beside a hill.
    if (hills.hilly) {
      for (const p of props) p.z = groundZ(shapes[key], p.x, p.y);
      if (stand) stand.z = groundZ(shapes[key], stand.x, stand.y);
    }
    return shapes[key];
  }

  // ---------- Hills (the hard maps) ----------
  //
  // A hard map's centreline comes with a height at each point (games/trackRacing.js). From the car
  // the road is then a ribbon of its own (see roadModel), tilted into the sharp bends (`bank`: how
  // much higher the road gets for each unit out to the right), with an embankment either side
  // sloping down to the flat ground (out to `toe`, less where another part of the track is in the
  // way: then it's a steep bank). Where the figure eight crosses itself, the upper leg is a bridge
  // (`deck`): a slab on piers, nothing under it. On the flat tracks: all zeros, and none of it is
  // drawn.
  function hillsOf(tr, { N, xs, ys, zs, nx, ny, bend, at, edge }) {
    const hilly = zs.some((z) => z > 0.05);
    const bank = new Float32Array(N);
    const deck = new Uint8Array(N);
    const toe = [new Float32Array(N), new Float32Array(N)];
    const top = edge + BARRIER + 4;
    const ceil = new Float32Array(N).fill(1e4);
    if (!hilly) return { hilly, bank, deck, toe, top, ceil };
    const far = (i, j) => Math.min(Math.abs(i - j), N - Math.abs(i - j)) > 25;
    if (tr.crossing) {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (zs[i] - zs[j] > 12 && far(i, j) && (xs[i] - xs[j]) ** 2 + (ys[i] - ys[j]) ** 2 < (2 * (edge + BARRIER) + 16) ** 2) { deck[i] = 1; break; }
        }
      }
      // (A little longer each end, so the embankment never reaches the road below.)
      const was = deck.slice();
      for (let i = 0; i < N; i++) if (was[i]) for (let k = -4; k <= 4; k++) deck[at(i + k)] = 1;
      // Under the bridge: how high the camera can go there (the slab's underside, less a bit).
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < N; k++) {
          if (deck[k] && zs[k] - zs[i] > 12 && (xs[i] - xs[k]) ** 2 + (ys[i] - ys[k]) ** 2 < (edge + BARRIER + 40) ** 2) ceil[i] = Math.min(ceil[i], zs[k] - 7);
        }
      }
    }
    // Banked into the bends (not on the bridge), smoothed so it eases in and out.
    const raw = bend.map((b, i) => (deck[i] ? 0 : -Math.max(-0.16, Math.min(0.16, b * 0.4))));
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -3; k <= 3; k++) s += raw[at(i + k)];
      bank[i] = s / 7;
    }
    // How far out each embankment can go before it would run into another part of the track.
    const clear = (x, y, i) => {
      for (let j = 0; j < N; j += 1) {
        if (!far(i, j)) continue;
        if ((xs[j] - x) ** 2 + (ys[j] - y) ** 2 < (edge + BARRIER + 3) ** 2) return false;
      }
      return true;
    };
    for (let i = 0; i < N; i++) {
      for (const [k, side] of [[0, -1], [1, 1]]) {
        const h = Math.max(0, zs[i] + bank[i] * top * side);
        let t = top + 3 + h * 1.7;
        while (t > top + 1 && !clear(xs[i] + nx[i] * t * side, ys[i] + ny[i] * t * side, i)) t -= 4;
        toe[k][i] = Math.max(top + 1, t);
      }
    }
    return { hilly, bank, deck, toe, top, ceil };
  }

  // How high the ground is at a spot: up the embankments beside the hills, 0 out in the fields
  // (and under the bridge).
  function groundZ(sh, x, y) {
    if (!sh.hilly) return 0;
    let z = 0;
    for (let i = 0; i < sh.N; i += 1) {
      if (sh.deck[i] || sh.zs[i] <= z) continue;
      const dx = x - sh.xs[i];
      const dy = y - sh.ys[i];
      const off = dx * sh.nx[i] + dy * sh.ny[i];
      const along = Math.abs(dx * sh.ny[i] - dy * sh.nx[i]);
      if (along > 8) continue;
      const d = Math.abs(off);
      const t = sh.toe[off < 0 ? 0 : 1][i];
      const h = sh.zs[i] + sh.bank[i] * Math.max(-sh.top, Math.min(sh.top, off));
      z = Math.max(z, d <= sh.top ? h : d < t ? (h * (t - d)) / (t - sh.top) : 0);
    }
    return z;
  }

  // Where a car is on the road, in 3D: its height, and how steep the road is under it (along the
  // way it's pointing, and across). `hint` is where it was last time (a sample index, kept per
  // car), so a car under the bridge stays on the road under it. Filled in, not made.
  const onRoad = { z: 0, along: 0, across: 0, i: 0 };
  function roadAt(sh, x, y, a, hint = -1) {
    onRoad.z = 0; onRoad.along = 0; onRoad.across = 0; onRoad.i = 0;
    if (!sh.hilly) return onRoad;
    let best = Infinity;
    let bi = 0;
    const look = (i) => {
      const d = (sh.xs[i] - x) ** 2 + (sh.ys[i] - y) ** 2;
      if (d < best) { best = d; bi = i; }
    };
    if (hint >= 0) for (let k = -10; k <= 10; k++) look((((hint + k) % sh.N) + sh.N) % sh.N);
    if (hint < 0 || best > (sh.top + 20) ** 2) {
      const level = hint >= 0 ? sh.zs[hint] : null;
      best = Infinity;
      for (let i = 0; i < sh.N; i++) if (level == null || Math.abs(sh.zs[i] - level) < 15) look(i);
      // (Nowhere near its own level: a new race, back on the grid. Anywhere, then.)
      if (best > (sh.top + 20) ** 2) for (let i = 0; i < sh.N; i++) look(i);
    }
    // Between this sample and the next (or the one before), and out to the side.
    const j = (bi + 1) % sh.N;
    const dx = sh.xs[j] - sh.xs[bi];
    const dy = sh.ys[j] - sh.ys[bi];
    const len = Math.hypot(dx, dy) || 1;
    const f = Math.max(-1, Math.min(1, ((x - sh.xs[bi]) * dx + (y - sh.ys[bi]) * dy) / (len * len)));
    const k = f < 0 ? (bi - 1 + sh.N) % sh.N : j;
    const g = Math.abs(f);
    const z0 = sh.zs[bi] + (sh.zs[k] - sh.zs[bi]) * g;
    const b = sh.bank[bi] + (sh.bank[k] - sh.bank[bi]) * g;
    const off = Math.max(-sh.top, Math.min(sh.top, (x - sh.xs[bi]) * sh.nx[bi] + (y - sh.ys[bi]) * sh.ny[bi]));
    const slope = (sh.zs[j] - sh.zs[(bi - 1 + sh.N) % sh.N]) / (2 * len);
    const ca = Math.cos(a - sh.head[bi]);
    const sa = Math.sin(a - sh.head[bi]);
    onRoad.z = z0 + b * off;
    onRoad.along = slope * ca + b * sa; // (rise per unit forward, for the car pointing at `a`)
    onRoad.across = b * ca - slope * sa; // (rise per unit to its right)
    onRoad.i = bi;
    return onRoad;
  }

  // The road on the hills, from the car: a ribbon round the loop, five points across (each
  // embankment's foot, the top of each bank, the middle), a little under the true height so what
  // stands on it never flickers into it. Each corner: x, y, z, then how lit it is and 0 (the ground's
  // picture, from above, on it), or on the bridge how far across the road it is and 1 (the deck
  // is painted as it goes: see ROAD_FS). Built once a track.
  function roadModel(sh) {
    const v = [];
    const sink = 0.25;
    const put = (p, a, kind) => v.push(p[0], p[1], p[2] - sink, a, kind);
    const flat = shade(0, 0, 1);
    const lit = (a, b, d) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const len = Math.hypot(nx, ny, nz) || 1;
      return Math.min(1.12, shade(nx / len, ny / len, nz / len) / flat);
    };
    const cross = (i) => {
      const P = (off, z) => [sh.xs[i] + sh.nx[i] * off, sh.ys[i] + sh.ny[i] * off, z];
      const h = (off) => sh.zs[i] + sh.bank[i] * off;
      return [P(-sh.toe[0][i], 0), P(-sh.top, h(-sh.top)), P(0, h(0)), P(sh.top, h(sh.top)), P(sh.toe[1][i], 0)];
    };
    for (let i = 0; i < sh.N; i++) {
      const j = (i + 1) % sh.N;
      const A = cross(i);
      const B = cross(j);
      if (sh.deck[i] && sh.deck[j]) {
        // The bridge's deck, out to its railings.
        const span = sh.top - 2.5;
        const D = (k, off) => [sh.xs[k] + sh.nx[k] * off, sh.ys[k] + sh.ny[k] * off, sh.zs[k] + 0.2];
        const quads = [[-span, 0], [0, span]];
        for (const [o0, o1] of quads) {
          const a = D(i, o0), b = D(j, o0), c = D(j, o1), d = D(i, o1);
          put(a, o0, 1); put(b, o0, 1); put(c, o1, 1);
          put(a, o0, 1); put(c, o1, 1); put(d, o1, 1);
        }
        continue;
      }
      for (let s = 0; s < 4; s++) {
        const a = A[s], b = B[s], c = B[s + 1], d = A[s + 1];
        const k = lit(a, b, d);
        put(a, k, 0); put(b, k, 0); put(c, k, 0);
        put(a, k, 0); put(c, k, 0); put(d, k, 0);
      }
    }
    return new Float32Array(v);
  }

  // A venue's extras round a track (worked out once a track): props along the fence every so often
  // (`along`: Halloween's jack-o'-lanterns, the tiki bar's torches), more out in the fields
  // (`field`: gravestones and crosses), where lights drift about (`wisps`: will-o'-the-wisps), and
  // the centreline's length so far at each point (for the phantom car's lap).
  const extras = {};
  function extrasOf(tr, th = themeOf()) {
    const venue = venueOf();
    const key = `${tr.id}:${tr.line.length}:${th.id}:${venue}`;
    if (extras[key]) return extras[key];
    // (Which of them are lit from inside: the fifth of each in VENUE_PROPS, or the theme's `art`.)
    const lit = new Set([...VENUE_PROPS[venue], ...(th.art || [])].filter((e) => e[4]).map((e) => e[0]));
    const sh = shapeOf(tr);
    const rand = seeded(`${tr.id}:haunt`);
    const W = tr.world.w;
    const H = tr.world.h;
    const edge = tr.width / 2 + tr.band;
    const near = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < sh.N; i++) best = Math.min(best, (sh.xs[i] - x) ** 2 + (sh.ys[i] - y) ** 2);
      return Math.sqrt(best);
    };
    const taken = sh.props.map((p) => [p.x, p.y, p.r]);
    const free = (x, y, r) => taken.every(([px, py, pr]) => (px - x) ** 2 + (py - y) ** 2 > (pr + r + 3) ** 2);
    const inside = (x, y, m) => x > m && y > m && x < W - m && y < H - m;
    const things = []; // { kind, x, y, size }
    const along = th.along;
    for (let i = 0, k = 0; along && i < sh.N; i += along.every, k++) {
      const side = k % 2 ? 1 : -1;
      if (!sh.walls[side > 0 ? 1 : 0].ok[i]) continue;
      const d = edge + BARRIER + 7;
      const x = sh.xs[i] + sh.nx[i] * d * side;
      const y = sh.ys[i] + sh.ny[i] * d * side;
      if (!inside(x, y, 8) || near(x, y) < d - 1 || !free(x, y, 5)) continue;
      things.push({ kind: along.kind, x, y, size: along.size[0] + rand() * along.size[1], glow: lit.has(along.kind) });
      taken.push([x, y, 5]);
    }
    const field = th.field;
    for (let k = 0, n = 0; field && k < 900 && n < field.count; k++) {
      const x = 10 + rand() * (W - 20);
      const y = 10 + rand() * (H - 20);
      const d = near(x, y);
      if (d < edge + BARRIER + 12 || d > edge + 160 || !free(x, y, 6)) continue;
      const r = rand();
      const kind = field.kinds.find(([, upTo]) => r < upTo)[0];
      things.push({ kind, x, y, size: field.size[0] + rand() * field.size[1], glow: lit.has(kind) });
      taken.push([x, y, 6]);
      n++;
    }
    const wisps = [];
    for (let k = 0; k < 600 && wisps.length < th.wisps; k++) {
      const x = 20 + rand() * (W - 40);
      const y = 20 + rand() * (H - 40);
      const d = near(x, y);
      if (d < edge + BARRIER + 10 || d > edge + 130) continue;
      wisps.push({ x, y, k: rand() * 100 });
    }
    const cum = new Float32Array(sh.N + 1);
    for (let i = 1; i <= sh.N; i++) cum[i] = cum[i - 1] + Math.hypot(sh.xs[i % sh.N] - sh.xs[i - 1], sh.ys[i % sh.N] - sh.ys[i - 1]);
    extras[key] = { things, wisps, cum, len: cum[sh.N] };
    return extras[key];
  }
  // The phantom car: every so often (race time, so every screen has it in the same place), a lap of
  // the track, weaving a little, quicker than anyone. Where it is now (filled in, not made), or null.
  const PHANTOM = { first: 7, every: 42, speed: 205 };
  const PHANTOM_LOOK = { body: 'hotrod', paint: null, stripe: null, extra: 'flames' };
  let phantomPic = null;
  function phantomSprite() {
    if (phantomPic) return phantomPic;
    phantomPic = document.createElement('canvas');
    phantomPic.width = SPRITE.x * 2 * SPRITE_K;
    phantomPic.height = SPRITE.y * 2 * SPRITE_K;
    drawFlat(phantomPic.getContext('2d'), flatModel(carModel(PHANTOM_LOOK, { shadow: false }).v, '#a8ffd0'), (x, y, z, out, k) => {
      out[k] = (x + SPRITE.x) * SPRITE_K;
      out[k + 1] = (y + SPRITE.y) * SPRITE_K;
      return -z;
    });
    return phantomPic;
  }
  const phantom = { x: 0, y: 0, a: 0, fade: 0 };
  function phantomAt(s, tr) {
    if (s.phase !== 'race' || !snaps.length || snapRace !== s.game.race || !playout.ready() || !themeOf(s).fx.phantom) return null;
    const t = playout.now(performance.now() / 1000) - PHANTOM.first;
    if (t < 0) return null;
    const sh = shapeOf(tr);
    const hs = extrasOf(tr);
    const lap = hs.len / PHANTOM.speed;
    const into = t % PHANTOM.every;
    if (into > lap) return null;
    const d = (hs.cum[sh.startI] + into * PHANTOM.speed) % hs.len;
    let lo = 0;
    let hi = sh.N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hs.cum[mid] <= d) lo = mid; else hi = mid; }
    const j = (lo + 1) % sh.N;
    const f = (d - hs.cum[lo]) / (hs.cum[lo + 1] - hs.cum[lo] || 1);
    const weave = Math.sin(into * 0.9) * 9;
    phantom.x = sh.xs[lo] + (sh.xs[j] - sh.xs[lo]) * f + sh.nx[lo] * weave;
    phantom.y = sh.ys[lo] + (sh.ys[j] - sh.ys[lo]) * f + sh.ny[lo] * weave;
    phantom.a = Math.atan2(sh.ys[j] - sh.ys[lo], sh.xs[j] - sh.xs[lo]) + Math.cos(into * 0.9) * 0.12;
    phantom.fade = Math.max(0, Math.min(1, into / 1.2, (lap - into) / 1.2));
    return phantom;
  }

  // ---------- Track drawing (from above) ----------

  // A speckled grey, so the asphalt has some grain to it (and you can see it go by).
  let grain = null;
  function grainPattern(c) {
    if (!grain) {
      grain = document.createElement('canvas');
      grain.width = grain.height = 64;
      const g = grain.getContext('2d');
      g.fillStyle = '#3a3a40';
      g.fillRect(0, 0, 64, 64);
      const rand = seeded('grain');
      for (let k = 0; k < 700; k++) {
        const v = rand();
        g.fillStyle = v < 0.5 ? `rgba(0, 0, 0, ${0.12 + v * 0.2})` : `rgba(255, 255, 255, ${(v - 0.5) * 0.12})`;
        g.fillRect(Math.floor(rand() * 64), Math.floor(rand() * 64), 1 + Math.floor(rand() * 2), 1);
      }
    }
    return c.createPattern(grain, 'repeat');
  }

  // The venues' ground (THEME.ground, verge): a tile each, 96 units square, painted once.
  const blobs = (g, rand, n, cols, r0, r1) => {
    for (let k = 0; k < n; k++) {
      g.fillStyle = cols[Math.floor(rand() * cols.length)];
      g.beginPath();
      g.arc(rand() * 96, rand() * 96, r0 + rand() * (r1 - r0), 0, Math.PI * 2);
      g.fill();
    }
  };
  const blades = (g, rand, n, cols, len) => {
    g.lineWidth = 1;
    for (let k = 0; k < n; k++) {
      const x = rand() * 96;
      const y = rand() * 96;
      g.strokeStyle = cols[Math.floor(rand() * cols.length)];
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 4, y - len * (0.5 + rand()));
      g.stroke();
    }
  };
  const GROUNDS = {
    // Halloween: dead grass on graveyard earth, a pebble or two.
    earth(g, rand) {
      g.fillStyle = '#2a2219';
      g.fillRect(0, 0, 96, 96);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(14, 10, 8, 0.4)' : 'rgba(58, 44, 30, 0.45)';
        g.beginPath();
        g.arc(rand() * 96, rand() * 96, 2 + rand() * 6, 0, Math.PI * 2);
        g.fill();
      }
      g.lineWidth = 1;
      for (let k = 0; k < 260; k++) {
        const x = rand() * 96;
        const y = rand() * 96;
        g.strokeStyle = ['#5e4f2c', '#4a3e22', '#6d5c34', '#3a3018'][Math.floor(rand() * 4)];
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rand() - 0.5) * 5, y - 2 - rand() * 4);
        g.stroke();
      }
      for (let k = 0; k < 14; k++) {
        g.fillStyle = rand() < 0.5 ? '#4a4258' : '#3a3346';
        g.fillRect(rand() * 96, rand() * 96, 1.5 + rand() * 2, 1.5 + rand() * 1.5);
      }
    },
    // A car park: old tarmac, patched, cracked, oil stains.
    lot(g, rand) {
      g.fillStyle = '#2e2d30';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 30, ['rgba(0, 0, 0, 0.25)', 'rgba(90, 88, 92, 0.25)'], 3, 9);
      blobs(g, rand, 4, ['rgba(8, 6, 14, 0.5)'], 4, 7);
      g.strokeStyle = 'rgba(10, 10, 12, 0.7)';
      g.lineWidth = 0.8;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        let x = rand() * 96;
        let y = rand() * 96;
        g.moveTo(x, y);
        for (let j = 0; j < 4; j++) g.lineTo((x += (rand() - 0.5) * 16), (y += (rand() - 0.5) * 16));
      }
      g.stroke();
      g.fillStyle = 'rgba(230, 226, 210, 0.35)';
      for (const x of [8, 56]) g.fillRect(x, 0, 1.6, 30);
    },
    meadow(g, rand) {
      g.fillStyle = '#4c7d34';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 24, ['rgba(30, 60, 20, 0.3)', 'rgba(120, 160, 70, 0.25)'], 4, 10);
      blades(g, rand, 300, ['#3a6a26', '#5e9440', '#6aa04a', '#2e5a1e'], 3);
      blobs(g, rand, 10, ['#f4f0d8', '#ffd23f', '#e8a0c8'], 0.6, 1.1);
    },
    heather(g, rand) {
      g.fillStyle = '#4a5a30';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 30, ['rgba(110, 60, 110, 0.45)', 'rgba(70, 50, 30, 0.35)', 'rgba(90, 120, 60, 0.3)'], 3, 8);
      blades(g, rand, 220, ['#3a4a22', '#5a6a38', '#6a4a20'], 3);
      blobs(g, rand, 70, ['#9a5aa0', '#b070b4', '#7a4a80'], 0.6, 1.3);
    },
    snow(g, rand) {
      g.fillStyle = '#e6ecf3';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 26, ['rgba(180, 196, 220, 0.3)', 'rgba(255, 255, 255, 0.6)'], 4, 12);
      blobs(g, rand, 40, ['#ffffff', '#c8d4e4'], 0.4, 0.9);
    },
    turf(g, rand) {
      g.fillStyle = '#3f8a3a';
      g.fillRect(0, 0, 96, 96);
      g.fillStyle = '#4a9a42';
      g.fillRect(0, 0, 48, 96);
      blades(g, rand, 200, ['rgba(20, 60, 20, 0.5)', 'rgba(140, 200, 110, 0.35)'], 2);
    },
    // A neon grid on black (the club's dance floor, all the way out).
    neon(g) {
      g.fillStyle = '#0c0818';
      g.fillRect(0, 0, 96, 96);
      g.lineWidth = 1;
      for (const [col, at, w] of [['rgba(255, 43, 214, 0.25)', 0, 4], ['#ff2bd6', 0, 1.2], ['rgba(41, 240, 255, 0.22)', 48, 4], ['#29f0ff', 48, 1]]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(at + 0.5, 0); g.lineTo(at + 0.5, 96);
        g.moveTo(0, at + 0.5); g.lineTo(96, at + 0.5);
        g.stroke();
      }
    },
    cobble(g, rand) {
      g.fillStyle = '#2a282c';
      g.fillRect(0, 0, 96, 96);
      for (let row = 0; row < 12; row++) {
        for (let k = 0; k < 9; k++) {
          const x = k * 12 + (row % 2) * 6 - 6 + rand() * 1.5;
          const v = 90 + Math.floor(rand() * 40);
          g.fillStyle = `rgb(${v}, ${v - 4}, ${v + 4})`;
          roundRect(g, x + 0.8, row * 8 + 0.8, 10.4, 6.4, 3);
          g.fill();
          g.fillStyle = 'rgba(255, 255, 255, 0.12)';
          g.fillRect(x + 2.5, row * 8 + 1.6, 6, 1.2);
        }
      }
    },
    brick(g, rand) {
      g.fillStyle = '#3a2420';
      g.fillRect(0, 0, 96, 96);
      for (let row = 0; row < 16; row++) {
        for (let k = 0; k < 9; k++) {
          const x = k * 12 + (row % 2) * 6 - 6;
          const r = 120 + Math.floor(rand() * 40);
          g.fillStyle = `rgb(${r}, ${Math.round(r * 0.45)}, ${Math.round(r * 0.36)})`;
          g.fillRect(x + 0.6, row * 6 + 0.6, 10.8, 4.8);
        }
      }
    },
    checker(g) {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#4a4a56' : '#e6e0d4'; g.fillRect(x * 24, y * 24, 24, 24); }
      g.fillStyle = 'rgba(255, 255, 255, 0.06)';
      g.fillRect(0, 0, 96, 30);
    },
    sand(g, rand) {
      g.fillStyle = '#e0c48c';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 26, ['rgba(255, 240, 200, 0.3)', 'rgba(180, 140, 80, 0.2)'], 4, 12);
      g.strokeStyle = 'rgba(160, 120, 70, 0.25)';
      g.lineWidth = 1;
      g.beginPath();
      for (let y = 6; y < 96; y += 12) { g.moveTo(0, y); for (let x = 0; x <= 96; x += 8) g.lineTo(x, y + Math.sin((x / 96) * Math.PI * 4 + y) * 2); }
      g.stroke();
      blobs(g, rand, 60, ['#c8a870', '#f4e4c0', '#b08850'], 0.4, 0.9);
    },
    desert(g, rand) {
      g.fillStyle = '#c47a42';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 26, ['rgba(220, 150, 90, 0.35)', 'rgba(140, 70, 30, 0.25)'], 4, 12);
      g.strokeStyle = 'rgba(110, 50, 20, 0.45)';
      g.lineWidth = 0.7;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        let x = rand() * 96;
        let y = rand() * 96;
        g.moveTo(x, y);
        for (let j = 0; j < 3; j++) g.lineTo((x += (rand() - 0.5) * 14), (y += (rand() - 0.5) * 14));
      }
      g.stroke();
      blades(g, rand, 30, ['#8a7a3a', '#a08a48'], 2.5);
      blobs(g, rand, 20, ['#8a5a3a', '#e0b080'], 0.6, 1.4);
    },
    sea(g, rand) {
      g.fillStyle = '#1d5878';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 16, ['rgba(10, 40, 70, 0.35)', 'rgba(60, 130, 160, 0.25)'], 6, 14);
      g.strokeStyle = 'rgba(200, 235, 245, 0.45)';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < 18; k++) {
        const x = rand() * 96;
        const y = rand() * 96;
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 3, y - 2, x + 6, y);
      }
      g.stroke();
    },
    boards(g, rand) {
      g.fillStyle = '#3a2614';
      g.fillRect(0, 0, 96, 96);
      for (let row = 0; row < 12; row++) {
        const off = Math.floor(rand() * 48);
        for (let k = -1; k < 2; k++) {
          const v = rand();
          g.fillStyle = `rgb(${130 + v * 30}, ${88 + v * 20}, ${52 + v * 14})`;
          g.fillRect(off + k * 48 + 0.6, row * 8 + 0.7, 47, 6.6);
          g.fillStyle = '#2a1a0c';
          g.fillRect(off + k * 48 + 2, row * 8 + 3.4, 0.9, 0.9);
        }
        g.fillStyle = 'rgba(0, 0, 0, 0.12)';
        g.fillRect(0, row * 8 + 3, 96, 0.6);
      }
    },
    moon(g, rand) {
      g.fillStyle = '#7e7e86';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 30, ['rgba(40, 40, 50, 0.18)', 'rgba(200, 200, 210, 0.15)'], 3, 10);
      for (let k = 0; k < 7; k++) {
        const x = rand() * 96;
        const y = rand() * 96;
        const r = 2 + rand() * 6;
        g.fillStyle = 'rgba(30, 30, 40, 0.35)';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(220, 220, 230, 0.35)';
        g.lineWidth = 0.8;
        g.beginPath(); g.arc(x + 0.4, y + 0.4, r, Math.PI * 0.1, Math.PI * 1.1); g.stroke();
      }
    },
    // Rows of vines on dry earth.
    vines(g, rand) {
      g.fillStyle = '#a8865a';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 20, ['rgba(140, 100, 60, 0.3)', 'rgba(200, 170, 120, 0.25)'], 3, 9);
      for (let row = 0; row < 8; row++) {
        g.fillStyle = 'rgba(60, 40, 20, 0.35)';
        g.fillRect(0, row * 12 + 7, 96, 2);
        for (let k = 0; k < 16; k++) {
          g.fillStyle = ['#4a6a2a', '#5a7a30', '#3a5a22'][Math.floor(rand() * 3)];
          g.beginPath();
          g.arc(k * 6 + rand() * 2, row * 12 + 5, 2.6 + rand(), 0, Math.PI * 2);
          g.fill();
        }
      }
    },
    concrete(g, rand) {
      g.fillStyle = '#8e8e8c';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 24, ['rgba(60, 60, 60, 0.15)', 'rgba(200, 200, 196, 0.15)'], 3, 10);
      blobs(g, rand, 3, ['rgba(20, 16, 10, 0.4)'], 3, 6);
      g.fillStyle = 'rgba(40, 40, 40, 0.5)';
      for (const p of [0, 48]) { g.fillRect(p, 0, 1, 96); g.fillRect(0, p, 96, 1); }
    },
    gravel(g, rand) {
      g.fillStyle = '#d6ccb4';
      g.fillRect(0, 0, 96, 96);
      blobs(g, rand, 500, ['#b8ae98', '#e8e0cc', '#a89e88', '#c8beaa'], 0.4, 1);
      g.strokeStyle = 'rgba(150, 140, 120, 0.3)';
      g.lineWidth = 0.6;
      g.beginPath();
      for (let y = 3; y < 96; y += 6) { g.moveTo(0, y); g.lineTo(96, y); }
      g.stroke();
    },
    carpet(g, rand) {
      g.fillStyle = '#5c0e18';
      g.fillRect(0, 0, 96, 96);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const cx = x * 24 + 12 + (y % 2) * 12;
          const cy = y * 24 + 12;
          g.strokeStyle = '#d4a020';
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(cx, cy, 6, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = '#1a6a6a';
          g.beginPath();
          g.moveTo(cx, cy - 3); g.lineTo(cx + 3, cy); g.lineTo(cx, cy + 3); g.lineTo(cx - 3, cy);
          g.fill();
          g.fillStyle = '#e0b040';
          g.fillRect(cx - 12.5, cy - 0.6, 3, 1.2);
        }
      }
      blobs(g, rand, 40, ['rgba(0, 0, 0, 0.12)'], 1, 4);
    },
  };
  const grounds = {};
  function groundPattern(c, kind) {
    if (!grounds[kind]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      GROUNDS[kind](cv.getContext('2d'), seeded(kind));
      grounds[kind] = cv;
    }
    return c.createPattern(grounds[kind], 'repeat');
  }

  // The track, the grass beside it and the barriers round it (outside them is darker). `sx`, `sy`:
  // canvas pixels a unit. `scenery`: the trees and stands too, seen from above (the TV; the
  // first-person view builds them in 3D instead).
  // `under`: for the view from the car's ground (groundCanvas), where the bridge is a model of its
  // own: the road under it is painted instead, in its shadow.
  function drawStatic(cv, tr, sx, sy = sx, { scenery = true, under = false } = {}) {
    const c = cv.getContext('2d');
    const path = trackPath(tr.line);
    const sh = shapeOf(tr);
    const pal = palette();
    const th = themeOf();
    const edge = tr.width / 2 + tr.band;
    const half = tr.width / 2;
    c.setTransform(sx, 0, 0, sy, 0, 0);
    c.clearRect(0, 0, tr.world.w, tr.world.h);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (th.void) { rainbowStatic(c, tr, sh, pal, path, { scenery, under }); return; }
    const snow = wxOf().snow;
    c.fillStyle = `rgba(0, 0, 0, ${snow ? 0.14 : th.dim})`;
    c.fillRect(0, 0, tr.world.w, tr.world.h);
    // Inside the barriers, the felt (grass) shows through, a little lighter.
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = (edge + BARRIER) * 2;
    c.stroke(path);
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = (edge + BARRIER) * 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    c.stroke(path);
    c.globalCompositeOperation = 'destination-over';
    // The venue's verges, inside the barriers (the pirates' boardwalk)...
    if (th.verge && !snow) {
      c.strokeStyle = groundPattern(c, th.verge);
      c.stroke(path);
    }
    // Snow: white over the grass, and greyer beyond the barriers (under what's there already).
    if (snow) {
      c.fillStyle = '#e9eef4';
      c.fillRect(0, 0, tr.world.w, tr.world.h);
    }
    // ...and its ground (Halloween: dead grass and earth, darker beyond the fence).
    if (th.ground) {
      c.fillStyle = groundPattern(c, th.ground);
      c.fillRect(0, 0, tr.world.w, tr.world.h);
    }
    c.globalCompositeOperation = 'source-over';
    // The hills cast their shadows (down and to the right, as the light comes from the top left).
    if (sh.hilly && !under) hillShadow(c, sh);
    // Gravel on the outside of the bends.
    const quads = (from, to, test, style) => {
      c.beginPath();
      for (let i = 0; i < sh.N; i++) {
        const j = (i + 1) % sh.N;
        const side = test(i);
        if (!side) continue;
        c.moveTo(sh.xs[i] + sh.nx[i] * from * side, sh.ys[i] + sh.ny[i] * from * side);
        c.lineTo(sh.xs[j] + sh.nx[j] * from * side, sh.ys[j] + sh.ny[j] * from * side);
        c.lineTo(sh.xs[j] + sh.nx[j] * to * side, sh.ys[j] + sh.ny[j] * to * side);
        c.lineTo(sh.xs[i] + sh.nx[i] * to * side, sh.ys[i] + sh.ny[i] * to * side);
        c.closePath();
      }
      c.fillStyle = style;
      c.fill();
    };
    const bendy = (i) => Math.max(Math.abs(sh.bend[i]), Math.abs(sh.bend[(i + 1) % sh.N]), Math.abs(sh.bend[(i - 1 + sh.N) % sh.N]));
    quads(half + 6, edge - 2, (i) => (bendy(i) > 0.24 ? -Math.sign(sh.bend[i]) : 0), 'rgba(214, 192, 150, 0.55)');
    // The asphalt, with a white line down each edge.
    c.lineWidth = tr.width + 2;
    c.strokeStyle = th.line;
    c.stroke(path);
    c.lineWidth = tr.width - 4;
    c.strokeStyle = grainPattern(c);
    c.stroke(path);
    // Kerbs round the bends, both sides, in the room's colour and white (or the venue's two).
    const kerb = th.kerb;
    const kerbAlt = th.kerbAlt || pal.accent;
    for (const odd of [0, 1]) {
      quads(half - 4, half + 6, (i) => (bendy(i) > 0.2 && i % 2 === odd ? 1 : 0), odd ? kerb : kerbAlt);
      quads(half - 4, half + 6, (i) => (bendy(i) > 0.2 && i % 2 === odd ? -1 : 0), odd ? kerbAlt : kerb);
    }
    // The hills: lighter up high, darker down low, each slope lit as it faces.
    if (sh.hilly && !under) hillTint(c, sh);
    startLine(c, tr, sh);
    // The barriers, as the venue has them.
    barrierAbove(c, sh, pal, th);
    // The figure eight's bridge over the road below (or, for the car's ground, that road in its
    // shadow), and a ▲ at each sharp crest.
    if (sh.hilly) bridgeAbove(c, tr, sh, pal, under, th);
    if (sh.hilly && !under) crestMarks(c, sh);
    if (scenery) drawScenery(c, tr, sh, pal);
  }

  // The start line, chequered, and the grid boxes behind it.
  function startLine(c, tr, sh) {
    const [stx, sty, sa] = tr.start;
    c.save();
    c.translate(stx, sty);
    c.rotate(sa);
    const sq = tr.width / 8;
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 8; k++) {
        c.fillStyle = (row + k) % 2 ? '#111' : '#fafafa';
        c.fillRect(-sq + row * sq, -tr.width / 2 + k * sq, sq, sq);
      }
    }
    c.restore();
    c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    c.lineWidth = 1.6;
    c.lineCap = 'butt';
    for (const g of sh.grid) {
      c.save();
      c.translate(g.x, g.y);
      c.rotate(g.a);
      c.beginPath();
      c.moveTo(6, -9);
      c.lineTo(17, -9);
      c.lineTo(17, 9);
      c.lineTo(6, 9);
      c.stroke();
      c.restore();
    }
  }

  // The barriers from above, one side at a time (not where one would fold back on itself, nor on
  // the bridge).
  function wallPath(sh, w) {
    const p = new Path2D();
    for (let i = 0; i < sh.N; i++) {
      const j = (i + 1) % sh.N;
      if (!w.ok[i] || !w.ok[j] || sh.deck[i]) continue;
      p.moveTo(w.x[i], w.y[i]);
      p.lineTo(w.x[j], w.y[j]);
    }
    return p;
  }
  function barrierAbove(c, sh, pal, th) {
    const col = th.wall || pal.rim;
    const kind = th.barrier;
    if (kind === 'none') return;
    for (const w of sh.walls) {
      const each = (step, fn) => { for (let i = 0; i < sh.N; i += step) if (w.ok[i] && !sh.deck[i]) fn(w.x[i], w.y[i], i); };
      if (kind === 'tyres') {
        // Tyres in the room's trim colour and black.
        each(1, (x, y, i) => {
          c.fillStyle = i % 2 ? th.wall2 : col;
          c.beginPath();
          c.arc(x, y, 4.6, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(0, 0, 0, 0.45)';
          c.beginPath();
          c.arc(x, y, 1.8, 0, Math.PI * 2);
          c.fill();
        });
        continue;
      }
      if (kind === 'fence') {
        // An iron fence, a stone pillar every so often.
        c.strokeStyle = '#08060a';
        c.lineWidth = 2.2;
        c.stroke(wallPath(sh, w));
        each(1, (x, y, i) => {
          c.fillStyle = i % 10 ? '#4a4258' : '#7a7090';
          const r = i % 10 ? 1.2 : 2.8;
          c.fillRect(x - r, y - r, r * 2, r * 2);
        });
        continue;
      }
      const p = wallPath(sh, w);
      c.lineCap = 'round';
      if (kind === 'wall' || kind === 'hedge') {
        // A wall (or a box hedge): its shadow, the top, a darker edge, crenels on a castle's.
        c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        c.lineWidth = kind === 'hedge' ? 9 : 7;
        c.save();
        c.translate(2, 2);
        c.stroke(p);
        c.restore();
        c.strokeStyle = th.wall2 && kind === 'wall' ? th.wall2 : 'rgba(0, 0, 0, 0.3)';
        c.stroke(p);
        c.strokeStyle = col;
        c.lineWidth = kind === 'hedge' ? 7.5 : 5;
        c.stroke(p);
        if (kind === 'hedge') each(2, (x, y, i) => { c.fillStyle = i % 4 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'; c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill(); });
        if (th.crenels) each(2, (x, y) => { c.fillStyle = th.wall2; c.fillRect(x - 1.6, y - 1.6, 3.2, 3.2); });
      } else if (kind === 'rail' || kind === 'rope') {
        // A rail on posts (wood, bamboo), or a rope slung between posts (the docks).
        c.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        c.lineWidth = 2.6;
        c.save();
        c.translate(1.5, 1.5);
        c.stroke(p);
        c.restore();
        c.strokeStyle = kind === 'rope' ? th.wall2 : col;
        c.lineWidth = kind === 'rope' ? 1.2 : 2.4;
        c.stroke(p);
        each(2, (x, y) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, kind === 'rope' ? 2.4 : 1.8, 0, Math.PI * 2); c.fill(); });
      } else if (kind === 'neon') {
        // A glowing tube on a low black kerb.
        c.strokeStyle = '#0a0a10';
        c.lineWidth = 4.5;
        c.stroke(p);
        c.shadowColor = col;
        c.shadowBlur = 6;
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.stroke(p);
        c.shadowBlur = 0;
        c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        c.lineWidth = 0.7;
        c.stroke(p);
      } else if (kind === 'candy') {
        // Candy canes: a white rail, striped.
        c.strokeStyle = th.wall2;
        c.lineWidth = 4;
        c.stroke(p);
        c.lineCap = 'butt';
        c.setLineDash([3.5, 3.5]);
        c.strokeStyle = col;
        c.stroke(p);
        c.setLineDash([]);
      } else if (kind === 'bunting') {
        // A line of little flags, in the venue's two colours.
        c.strokeStyle = '#3a3a40';
        c.lineWidth = 0.8;
        c.stroke(p);
        each(1, (x, y, i) => {
          c.fillStyle = i % 2 ? th.wall2 : col;
          c.beginPath();
          c.moveTo(x - 2.4, y - 1.6);
          c.lineTo(x + 2.4, y - 1.6);
          c.lineTo(x, y + 2.4);
          c.fill();
        });
        each(4, (x, y) => { c.fillStyle = '#5a3a1e'; c.fillRect(x - 1.1, y - 1.1, 2.2, 2.2); });
      }
    }
  }

  // ---------- Rainbow Road, from above ----------
  //
  // Space all round (the TV's: for the car's ground, `under`, nothing: the shader puts space
  // there), the road a glowing band of rainbow as wide as the road and its verges (there's no
  // grass, and no walls: off its edge, you fall), the start line, and the venue's props and the
  // neon gantry (drawScenery).
  function rainbowStatic(c, tr, sh, pal, path, { scenery, under }) {
    const edge = tr.width / 2 + tr.band;
    if (!under) spaceAbove(c, tr, sh, edge);
    // A soft glow round it, a white edge, then the bands, red outside to violet down the middle.
    if (!under) {
      for (const [w, a] of [[16, 0.08], [9, 0.14]]) {
        c.lineWidth = edge * 2 + w;
        c.strokeStyle = `rgba(255, 255, 255, ${a})`;
        c.stroke(path);
      }
    }
    c.lineWidth = edge * 2 + 2.5;
    c.strokeStyle = '#ffffff';
    c.stroke(path);
    RAINBOW.forEach((col, k) => {
      c.lineWidth = (edge * 2 * (7 - k)) / 7;
      c.strokeStyle = col;
      c.stroke(path);
    });
    // A dashed line down the middle, and a sheen along it.
    c.lineWidth = 1.6;
    c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    c.setLineDash([10, 12]);
    c.stroke(path);
    c.setLineDash([]);
    if (sh.hilly && !under) hillTint(c, sh);
    startLine(c, tr, sh);
    if (sh.hilly) bridgeAbove(c, tr, sh, pal, under);
    if (sh.hilly && !under) crestMarks(c, sh);
    if (scenery) drawScenery(c, tr, sh, pal);
  }

  // The stars from above: deep space, clouds of colour, stars, and a planet or two out where the
  // road isn't.
  function spaceAbove(c, tr, sh, edge) {
    const W = tr.world.w;
    const H = tr.world.h;
    const bg = c.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#05031a');
    bg.addColorStop(1, '#0c0626');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    const rand = seeded(`${tr.id}:space`);
    for (const [col, x, y, r] of [['140, 70, 255', 0.2, 0.3, 280], ['42, 160, 255', 0.75, 0.7, 300], ['255, 74, 154', 0.8, 0.15, 220], ['58, 224, 200', 0.35, 0.85, 200]]) {
      const n = c.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
      n.addColorStop(0, `rgba(${col}, 0.2)`);
      n.addColorStop(1, `rgba(${col}, 0)`);
      c.fillStyle = n;
      c.fillRect(0, 0, W, H);
    }
    for (let k = 0; k < 420; k++) {
      c.fillStyle = `rgba(255, 255, 255, ${0.25 + rand() * 0.7})`;
      const s = rand() < 0.08 ? 2.2 : 1.2;
      c.fillRect(rand() * W, rand() * H, s, s);
    }
    // Planets, wherever there's room for one clear of the road.
    const clear = (x, y, r) => {
      if (x < r || y < r || x > W - r || y > H - r) return false;
      for (let i = 0; i < sh.N; i++) if ((sh.xs[i] - x) ** 2 + (sh.ys[i] - y) ** 2 < (edge + r + 14) ** 2) return false;
      return true;
    };
    const planets = [[46, '#ffd0a0', '#7a3a2a', true], [26, '#9ad8ff', '#1a2a7a', false], [16, '#e8e4f0', '#4a4660', false]];
    for (const [r, a, b, ring] of planets) {
      for (let k = 0; k < 200; k++) {
        const x = rand() * W;
        const y = rand() * H;
        if (!clear(x, y, ring ? r * 1.9 : r)) continue;
        const pg = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        pg.addColorStop(0, a);
        pg.addColorStop(1, b);
        c.strokeStyle = 'rgba(230, 210, 255, 0.55)';
        c.lineWidth = 4;
        if (ring) { c.beginPath(); c.ellipse(x, y, r * 1.9, r * 0.5, -0.4, Math.PI, Math.PI * 2); c.stroke(); }
        c.fillStyle = pg;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        if (ring) { c.beginPath(); c.ellipse(x, y, r * 1.9, r * 0.5, -0.4, 0, Math.PI); c.stroke(); }
        break;
      }
    }
  }

  // ---------- The hills, from above ----------

  // A strip along the road, from `from` to `to` out from the middle (negative: the left), for the
  // samples `test` passes: one path.
  function strip(c, sh, from, to, test, dx = 0, dy = 0) {
    c.beginPath();
    for (let i = 0; i < sh.N; i++) {
      const j = (i + 1) % sh.N;
      if (!test(i, j)) continue;
      c.moveTo(sh.xs[i] + sh.nx[i] * from + dx, sh.ys[i] + sh.ny[i] * from + dy);
      c.lineTo(sh.xs[j] + sh.nx[j] * from + dx, sh.ys[j] + sh.ny[j] * from + dy);
      c.lineTo(sh.xs[j] + sh.nx[j] * to + dx, sh.ys[j] + sh.ny[j] * to + dy);
      c.lineTo(sh.xs[i] + sh.nx[i] * to + dx, sh.ys[i] + sh.ny[i] * to + dy);
      c.closePath();
    }
  }

  function hillShadow(c, sh) {
    c.fillStyle = 'rgba(0, 0, 0, 0.13)';
    for (let i = 0; i < sh.N; i++) {
      const j = (i + 1) % sh.N;
      const z = (sh.zs[i] + sh.zs[j]) / 2;
      if (z < 3) continue;
      const d = z * 0.32;
      // (Two passes, the second further out: a soft edge.)
      for (const k of [0.6, 1]) {
        c.beginPath();
        const w = sh.top + (sh.deck[i] ? -2 : 2);
        c.moveTo(sh.xs[i] - sh.nx[i] * w + d * k, sh.ys[i] - sh.ny[i] * w + d * k);
        c.lineTo(sh.xs[j] - sh.nx[j] * w + d * k, sh.ys[j] - sh.ny[j] * w + d * k);
        c.lineTo(sh.xs[j] + sh.nx[j] * w + d * k, sh.ys[j] + sh.ny[j] * w + d * k);
        c.lineTo(sh.xs[i] + sh.nx[i] * w + d * k, sh.ys[i] + sh.ny[i] * w + d * k);
        c.closePath();
        c.fill();
      }
    }
  }

  function hillTint(c, sh) {
    const max = Math.max(...sh.zs) || 1;
    const w = sh.top - 4;
    for (let i = 0; i < sh.N; i++) {
      const j = (i + 1) % sh.N;
      const z = (sh.zs[i] + sh.zs[j]) / 2;
      // Up high a little lighter; slopes facing the light (top left) lighter, facing away darker.
      const g = (sh.zs[j] - sh.zs[i]) / (Math.hypot(sh.xs[j] - sh.xs[i], sh.ys[j] - sh.ys[i]) || 1);
      const face = -g * (Math.cos(sh.head[i]) + Math.sin(sh.head[i])) * 0.7;
      const tone = (z / max - 0.45) * 0.36 + Math.max(-0.14, Math.min(0.14, face * 1.6));
      c.fillStyle = tone > 0 ? `rgba(255, 250, 235, ${tone.toFixed(3)})` : `rgba(0, 0, 20, ${(-tone).toFixed(3)})`;
      c.beginPath();
      c.moveTo(sh.xs[i] - sh.nx[i] * w, sh.ys[i] - sh.ny[i] * w);
      c.lineTo(sh.xs[j] - sh.nx[j] * w, sh.ys[j] - sh.ny[j] * w);
      c.lineTo(sh.xs[j] + sh.nx[j] * w, sh.ys[j] + sh.ny[j] * w);
      c.lineTo(sh.xs[i] + sh.nx[i] * w, sh.ys[i] + sh.ny[i] * w);
      c.closePath();
      c.fill();
    }
    // Contours: a faint line across the road every 8 units of height, as on a map.
    c.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < sh.N; i++) {
      const j = (i + 1) % sh.N;
      if (Math.floor(sh.zs[i] / 8) === Math.floor(sh.zs[j] / 8)) continue;
      c.moveTo(sh.xs[j] - sh.nx[j] * (w - 6), sh.ys[j] - sh.ny[j] * (w - 6));
      c.lineTo(sh.xs[j] + sh.nx[j] * (w - 6), sh.ys[j] + sh.ny[j] * (w - 6));
    }
    c.stroke();
  }

  // Where the road goes over a sharp crest (you can't see over it, and you'll hop): a ▲ beside it.
  function crestsOf(sh) {
    if (sh.crests) return sh.crests;
    sh.crests = [];
    for (let i = 0; i < sh.N; i++) {
      const a = sh.zs[(i - 5 + sh.N) % sh.N];
      const b = sh.zs[(i + 5) % sh.N];
      const z = sh.zs[i];
      if (z >= sh.zs[(i - 1 + sh.N) % sh.N] && z > sh.zs[(i + 1) % sh.N] && z - Math.max(a, b) > 2.2 && !sh.deck[i]) sh.crests.push(i);
    }
    return sh.crests;
  }
  function crestMarks(c, sh) {
    for (const i of crestsOf(sh)) {
      for (const side of [-1, 1]) {
        const off = (sh.top + 9) * side;
        const x = sh.xs[i] + sh.nx[i] * off;
        const y = sh.ys[i] + sh.ny[i] * off;
        c.save();
        c.translate(x, y);
        c.beginPath();
        c.moveTo(0, -9.5);
        c.lineTo(8.5, 6);
        c.lineTo(-8.5, 6);
        c.closePath();
        c.fillStyle = '#ffd23a';
        c.strokeStyle = '#1a1a1a';
        c.lineWidth = 1.6;
        c.fill();
        c.stroke();
        c.restore();
      }
    }
  }

  function bridgeAbove(c, tr, sh, pal, under, th = themeOf()) {
    if (!sh.deck.some((d) => d)) return;
    const half = tr.width / 2;
    const span = sh.top - 2.5;
    const rail = sh.top - 4;
    const on = (i, j) => sh.deck[i] && sh.deck[j];
    if (th.void) {
      // Rainbow Road: the bridge is more road, in its bands (the car's ground has none: it's the
      // road's own model there).
      if (under) return;
      const lift = Math.max(...sh.zs) * 0.32;
      c.fillStyle = 'rgba(0, 0, 0, 0.45)';
      strip(c, sh, -sh.top, sh.top, on, lift, lift);
      c.fill();
      const edge = tr.width / 2 + tr.band;
      c.fillStyle = '#ffffff';
      strip(c, sh, -edge - 1.2, edge + 1.2, on);
      c.fill();
      RAINBOW.forEach((col, k) => {
        const w = (edge * (7 - k)) / 7;
        c.fillStyle = col;
        strip(c, sh, -w, w, on);
        c.fill();
      });
      return;
    }
    if (under) {
      // The car's ground: the road below, white lines and all, in the bridge's shadow.
      const below = (i) => sh.ceil[i] < 1e4;
      c.fillStyle = '#ececec';
      strip(c, sh, half - 1, half + 1, below);
      c.fill();
      strip(c, sh, -half - 1, -half + 1, below);
      c.fill();
      c.fillStyle = 'rgba(0, 0, 0, 0.42)';
      strip(c, sh, -span, span, on);
      c.fill();
      return;
    }
    // Its shadow, cast on the road below, then the slab, its run-off, the road and its lines.
    const lift = Math.max(...sh.zs) * 0.32;
    c.fillStyle = 'rgba(0, 0, 0, 0.42)';
    strip(c, sh, -span, span, on, lift, lift);
    c.fill();
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    strip(c, sh, -span - 3, span + 3, on, lift * 0.6, lift * 0.6);
    c.fill();
    c.fillStyle = th.bridge.slab;
    strip(c, sh, -span, span, on);
    c.fill();
    c.fillStyle = th.bridge.deck;
    strip(c, sh, -rail + 1, rail - 1, on);
    c.fill();
    c.fillStyle = th.bridge.line;
    strip(c, sh, -half - 1, half + 1, on);
    c.fill();
    c.fillStyle = grainPattern(c);
    strip(c, sh, -half + 2, half - 2, on);
    c.fill();
    // The railings: a rail each side in the room's colour, a post every so often.
    for (const side of [-1, 1]) {
      c.strokeStyle = '#1b1b1f';
      c.lineWidth = 2.6;
      c.beginPath();
      for (let i = 0; i < sh.N; i++) {
        const j = (i + 1) % sh.N;
        if (!on(i, j)) continue;
        c.moveTo(sh.xs[i] + sh.nx[i] * rail * side, sh.ys[i] + sh.ny[i] * rail * side);
        c.lineTo(sh.xs[j] + sh.nx[j] * rail * side, sh.ys[j] + sh.ny[j] * rail * side);
      }
      c.stroke();
      c.strokeStyle = th.bridge.rail || pal.accent;
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = '#f4f4f4';
      for (let i = 0; i < sh.N; i += 2) {
        if (!on(i, (i + 1) % sh.N)) continue;
        c.fillRect(sh.xs[i] + sh.nx[i] * rail * side - 1, sh.ys[i] + sh.ny[i] * rail * side - 1, 2, 2);
      }
    }
  }

  // The scenery seen from above (the TV and the phones' maps).
  function drawScenery(c, tr, sh, pal) {
    const snowy = wxOf().snow;
    const th = themeOf();
    const art = propArt(pal);
    for (const p of sh.props) {
      if (p.kind === 'tyres') stackAbove(c, p, pal, th);
      else if (p.kind === 'tree' && kept(p, th)) treeAbove(c, p, th, snowy);
    }
    // The venue's extras (Halloween's gravestones, crosses and jack-o'-lanterns; the tiki bar's
    // torches), standing up like the room's props.
    for (const p of extrasOf(tr, th).things) {
      const it = art.byKind[p.kind];
      if (!it) continue;
      if (it.glow) {
        c.drawImage(glowSprite(th.glow), p.x - p.size * 1.2, p.y - p.size * 1.3, p.size * 2.4, p.size * 2.4);
      } else {
        c.fillStyle = 'rgba(0, 0, 0, 0.3)';
        c.beginPath();
        c.ellipse(p.x + 2, p.y + p.size * 0.42, p.size * 0.3, p.size * 0.14, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.drawImage(art.cv, it.cell * CELL, 0, CELL, CELL, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    // The room's props, standing up (the way the TV's scenery shows things), each over its shadow.
    for (const p of sh.props) {
      if (p.kind !== 'venue') continue;
      const it = art.items[p.which % art.items.length];
      const [x, y] = propAt(p, it);
      const size = Math.min(it.size, 40);
      if (it.glow) c.drawImage(glowSprite(th.glow), x - size, y - size, size * 2, size * 2);
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      c.beginPath();
      c.ellipse(x + 3, y + size * 0.38, it.half * 0.9, it.half * 0.4, 0, 0, Math.PI * 2);
      c.fill();
      c.drawImage(art.cv, it.cell * CELL, 0, CELL, CELL, x - size / 2, y - size / 2 - (it.lift ? 8 : 0), size, size);
    }
    if (sh.stand && th.stand) {
      const s = sh.stand;
      c.save();
      c.translate(s.x, s.y);
      c.rotate(s.a);
      c.fillStyle = 'rgba(0, 0, 0, 0.35)';
      c.fillRect(-s.len / 2 + 4, -s.depth / 2 + 4, s.len, s.depth);
      c.fillStyle = th.stand;
      c.fillRect(-s.len / 2, -s.depth / 2, s.len, s.depth);
      // Rows of people (the front row nearest the track), in the venue's colours. Halloween: ghosts
      // and skeletons.
      const rand = seeded(`${tr.id}:crowd`);
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 30; k++) {
          const h = rand();
          const l = rand();
          const x = -s.len / 2 + 4 + k * 5.4;
          const y = (-s.depth / 2 + 4 + row * 6) * s.side - 2;
          if (th.crowd === 'ghosts') {
            c.fillStyle = h < 0.6 ? `rgba(226, 240, 255, ${0.6 + l * 0.35})` : '#d8d0b4';
            c.beginPath();
            c.arc(x + 1.8, y + 1.8, 1.9, 0, Math.PI * 2);
            c.fill();
          } else {
            c.fillStyle = th.crowd ? th.crowd[Math.floor(h * th.crowd.length)] : `hsl(${Math.floor(h * 360)}, 70%, ${45 + l * 25}%)`;
            c.fillRect(x, y, 3.6, 3.6);
          }
        }
      }
      c.fillStyle = th.roof || pal.accent;
      c.fillRect(-s.len / 2, (s.depth / 2 - 3) * s.side - 1.5, s.len, 3);
      c.restore();
    }
    // The gantry over the start line (Halloween: a stone arch, a jack-o'-lantern on each pillar; at
    // the tiki bar, a torch on each post).
    const i = sh.startI;
    const span = tr.width / 2 + 12;
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(sh.xs[i] - sh.nx[i] * span + 6, sh.ys[i] - sh.ny[i] * span + 6);
    c.lineTo(sh.xs[i] + sh.nx[i] * span + 6, sh.ys[i] + sh.ny[i] * span + 6);
    c.stroke();
    if (th.gantry === 'neon') {
      c.shadowColor = '#ff5ad8';
      c.shadowBlur = 8;
    }
    c.strokeStyle = th.gantry === 'neon' ? '#140a24' : th.beam;
    c.lineWidth = th.gantry === 'arch' ? 6 : 5;
    c.beginPath();
    c.moveTo(sh.xs[i] - sh.nx[i] * span, sh.ys[i] - sh.ny[i] * span);
    c.lineTo(sh.xs[i] + sh.nx[i] * span, sh.ys[i] + sh.ny[i] * span);
    c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = th.gantry === 'neon' ? '#29f0ff' : pal.accent;
    c.lineWidth = 2;
    c.stroke();
    if (th.gantry === 'neon') {
      for (const side of [-1, 1]) {
        const x = sh.xs[i] + sh.nx[i] * span * side;
        const y = sh.ys[i] + sh.ny[i] * span * side;
        c.drawImage(glowSprite(side < 0 ? 'pink' : 'cyan'), x - 14, y - 14, 28, 28);
        c.fillStyle = side < 0 ? '#ff5ad8' : '#29f0ff';
        c.fillRect(x - 3, y - 3, 6, 6);
      }
    }
    const top = th.pillar && art.byKind[th.pillar];
    if (top) {
      for (const side of [-1, 1]) {
        const x = sh.xs[i] + sh.nx[i] * span * side;
        const y = sh.ys[i] + sh.ny[i] * span * side;
        c.fillStyle = th.cap || (th.gantry === 'arch' ? th.beam : hex(th.post));
        c.fillRect(x - 4, y - 4, 8, 8);
        c.drawImage(glowSprite(th.glow), x - 16, y - 18, 32, 32);
        c.drawImage(art.cv, top.cell * CELL, 0, CELL, CELL, x - 8, y - 11, 16, 16);
      }
    }
  }

  // What's piled on the outside of the bends, from above.
  function stackAbove(c, p, pal, th) {
    const kind = th.stack;
    const disc = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
    if (kind === 'none') return;
    if (kind === 'graves') {
      // A gravestone and a cross where the tyres would be.
      c.fillStyle = 'rgba(0, 0, 0, 0.35)';
      c.fillRect(p.x - 3, p.y - 1, 9, 6);
      c.fillStyle = '#6a6478';
      roundRect(c, p.x - 5, p.y - 5, 7, 8, [3.5, 3.5, 0.5, 0.5]);
      c.fill();
      c.fillStyle = '#5a546a';
      c.fillRect(p.x + 3, p.y - 5, 1.6, 8);
      c.fillRect(p.x + 1.4, p.y - 3, 4.8, 1.6);
      return;
    }
    const three = [[-3, -2], [3, -2], [0, 3]];
    if (kind === 'tyres') {
      for (const [dx, dy] of three) { disc(p.x + dx, p.y + dy, 3.6, '#141414'); disc(p.x + dx, p.y + dy, 1.4, th.wall || pal.rim); }
    } else if (kind === 'drums' || kind === 'barrels' || kind === 'stools' || kind === 'chips') {
      const [rim, top] = { drums: [th.drum ? hex(th.drum) : '#2a5a8a', '#1a1a1a'], barrels: ['#7a4a22', '#a87a4a'], stools: ['#c9ccd1', '#e63946'], chips: ['#f4f4f4', '#c8202e'] }[kind];
      for (const [dx, dy] of three) {
        disc(p.x + dx + 1.5, p.y + dy + 1.5, 3.6, 'rgba(0, 0, 0, 0.3)');
        disc(p.x + dx, p.y + dy, 3.6, rim);
        disc(p.x + dx, p.y + dy, kind === 'stools' ? 2.8 : 2.4, top);
      }
    } else if (kind === 'hay' || kind === 'presents' || kind === 'speakers') {
      const cols = { hay: ['#d8b860', '#b89840'], presents: ['#e2403b', '#2a8a4a', '#e8b84a'], speakers: ['#1a1a20', '#2a2a32'] }[kind];
      [[-4, -1, 7, 5], [3, -3, 6, 6], [-1, 3, 6, 5]].forEach(([dx, dy, w, h], k) => {
        c.fillStyle = 'rgba(0, 0, 0, 0.3)';
        c.fillRect(p.x + dx - w / 2 + 1.5, p.y + dy - h / 2 + 1.5, w, h);
        c.fillStyle = cols[k % cols.length];
        c.fillRect(p.x + dx - w / 2, p.y + dy - h / 2, w, h);
        c.fillStyle = kind === 'presents' ? '#ffffff' : kind === 'speakers' ? '#5a5a66' : 'rgba(255, 255, 255, 0.2)';
        if (kind === 'speakers') disc(p.x + dx, p.y + dy, 1.6, '#5a5a66');
        else c.fillRect(p.x + dx - 0.6, p.y + dy - h / 2, 1.2, h);
      });
    } else if (kind === 'rocks') {
      for (const [dx, dy, r] of [[-3, -1, 4], [3, 1, 3], [0, 4, 2.4]]) { disc(p.x + dx + 1.5, p.y + dy + 1.5, r, 'rgba(0, 0, 0, 0.3)'); disc(p.x + dx, p.y + dy, r, '#4a4448'); disc(p.x + dx - r * 0.3, p.y + dy - r * 0.3, r * 0.45, '#6a6468'); }
    } else if (kind === 'topiary') {
      for (const [dx, dy] of three) { disc(p.x + dx + 1.5, p.y + dy + 1.5, 3.4, 'rgba(0, 0, 0, 0.3)'); disc(p.x + dx, p.y + dy, 3.4, '#2f6e34'); disc(p.x + dx - 1, p.y + dy - 1, 1.4, 'rgba(255, 255, 255, 0.18)'); }
    }
  }

  // What stands about in the fields, from above.
  const GREENS = ['#2f7d3a', '#3c8f45', '#2a6b34', '#4d9a3e'];
  function treeAbove(c, p, th, snowy) {
    const kind = th.tree;
    const disc = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
    if (kind === 'none') return;
    if (kind === 'dead') {
      // A dead tree: bare, twisted branches (and their shadow).
      const rand = seeded(`${Math.round(p.x)}:${Math.round(p.y)}`);
      const limbs = [];
      const n = 4 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rand() * 0.9;
        const len = p.r * (0.8 + rand() * 0.5);
        const bend = (rand() - 0.5) * 1.2;
        limbs.push([a, len, bend]);
      }
      c.lineCap = 'round';
      for (const [dx, col] of [[4, 'rgba(0, 0, 0, 0.4)'], [0, '#100a14']]) {
        c.strokeStyle = col;
        for (const [a, len, bend] of limbs) {
          const mx = p.x + dx + Math.cos(a) * len * 0.55;
          const my = p.y + dx + Math.sin(a) * len * 0.55;
          c.lineWidth = 2.2;
          c.beginPath();
          c.moveTo(p.x + dx, p.y + dx);
          c.lineTo(mx, my);
          c.lineTo(mx + Math.cos(a + bend) * len * 0.5, my + Math.sin(a + bend) * len * 0.5);
          c.stroke();
          c.lineWidth = 0.9;
          c.beginPath();
          c.moveTo(mx, my);
          c.lineTo(mx + Math.cos(a - bend * 1.4) * len * 0.4, my + Math.sin(a - bend * 1.4) * len * 0.4);
          c.stroke();
        }
        c.fillStyle = col;
        c.beginPath();
        c.arc(p.x + dx, p.y + dx, 2.2, 0, Math.PI * 2);
        c.fill();
      }
      return;
    }
    if (kind === 'pine' || kind === 'round' || kind === 'cypress') {
      const r = kind === 'cypress' ? p.r * 0.45 : p.r;
      disc(p.x + 4, p.y + 4, r, 'rgba(0, 0, 0, 0.3)');
      disc(p.x, p.y, r, kind === 'cypress' ? '#1f4a28' : kind === 'round' ? ['#4a8a34', '#5a9a3a', '#3a7a2e', '#6aa040'][Math.floor(p.tone * 4)] : GREENS[Math.floor(p.tone * GREENS.length)]);
      if (snowy) {
        c.fillStyle = 'rgba(250, 252, 255, 0.45)';
        c.fill();
      }
      disc(p.x - r * 0.3, p.y - r * 0.3, r * 0.5, snowy ? 'rgba(250, 252, 255, 0.8)' : 'rgba(255, 255, 255, 0.14)');
    } else if (kind === 'palm') {
      // Fronds out from the top, over the trunk's shadow.
      disc(p.x + 5, p.y + 5, p.r * 0.8, 'rgba(0, 0, 0, 0.25)');
      c.strokeStyle = '#2f8a3a';
      c.lineCap = 'round';
      c.lineWidth = 2.4;
      c.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + p.tone * 3;
        c.moveTo(p.x, p.y);
        c.quadraticCurveTo(p.x + Math.cos(a) * p.r * 0.6, p.y + Math.sin(a) * p.r * 0.6 - 2, p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r);
      }
      c.stroke();
      disc(p.x, p.y, 2.2, '#6a4a2a');
    } else if (kind === 'cactus') {
      c.save();
      c.translate(p.x, p.y);
      c.scale(p.r / 6, p.r / 6);
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      c.fillRect(-1, 1, 6, 3);
      c.fillStyle = '#3f7a3a';
      roundRect(c, -2.2, -7, 4.4, 10, 2.2);
      c.fill();
      roundRect(c, -6, -4, 4, 3, 1.5);
      c.fill();
      roundRect(c, 2, -6, 4, 3, 1.5);
      c.fill();
      c.restore();
    } else if (kind === 'lamp') {
      // A street lamp: its pool of light, the post, the lamp.
      c.drawImage(glowSprite(th.lamp || 'warm'), p.x - 16, p.y - 16, 32, 32);
      disc(p.x + 2, p.y + 2, 1.6, 'rgba(0, 0, 0, 0.4)');
      disc(p.x, p.y, 1.8, '#26262b');
      disc(p.x, p.y, 1, '#fff6d8');
    } else if (kind === 'rock') {
      disc(p.x + 3, p.y + 3, p.r * 0.6, 'rgba(0, 0, 0, 0.3)');
      disc(p.x, p.y, p.r * 0.6, ['#6a6468', '#5a5658', '#7a7270'][Math.floor(p.tone * 3)]);
      disc(p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.3, 'rgba(255, 255, 255, 0.14)');
    }
  }

  // A soft glow (a jack-o'-lantern's, a will-o'-the-wisp's, a torch's, a lamp's), painted once each.
  const GLOWS = { orange: [255, 150, 40], green: [140, 255, 170], fire: [255, 140, 40], warm: [255, 210, 130], pink: [255, 90, 216], cyan: [80, 230, 255], white: [230, 240, 255] };
  const glows = {};
  function glowSprite(kind) {
    if (glows[kind]) return glows[kind];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [r, gg, b] = GLOWS[kind] || GLOWS.orange;
    g.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${kind === 'green' ? 0.9 : 0.6})`);
    g.addColorStop(kind === 'green' ? 0.18 : 0.3, `rgba(${r}, ${gg}, ${b}, ${kind === 'green' ? 0.45 : 0.28})`);
    g.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    if (kind === 'green') {
      c.fillStyle = '#f0fff4';
      c.beginPath();
      c.arc(32, 32, 3.2, 0, Math.PI * 2);
      c.fill();
    }
    glows[kind] = cv;
    return cv;
  }

  // Bats against the sky, wings up and down (painted once).
  let batPics = null;
  function batSprites() {
    if (batPics) return batPics;
    batPics = [0, 1].map((up) => {
      const cv = document.createElement('canvas');
      cv.width = 64;
      cv.height = 32;
      const c = cv.getContext('2d');
      c.fillStyle = '#07040b';
      const wy = up ? -10 : 8;
      c.beginPath();
      c.moveTo(32, 15);
      c.quadraticCurveTo(20, 14 + wy, 2, 12 + wy * 0.6);
      c.quadraticCurveTo(10, 18 + wy * 0.3, 8, 22 + wy * 0.2);
      c.quadraticCurveTo(18, 17, 24, 22);
      c.quadraticCurveTo(28, 18, 32, 20);
      c.quadraticCurveTo(36, 18, 40, 22);
      c.quadraticCurveTo(46, 17, 56, 22 + wy * 0.2);
      c.quadraticCurveTo(54, 18 + wy * 0.3, 62, 12 + wy * 0.6);
      c.quadraticCurveTo(44, 14 + wy, 32, 15);
      c.fill();
      c.beginPath();
      c.ellipse(32, 17, 3.6, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(29, 13);
      c.lineTo(29.5, 8);
      c.lineTo(31.5, 12);
      c.lineTo(32.5, 12);
      c.lineTo(34.5, 8);
      c.lineTo(35, 13);
      c.fill();
      return cv;
    });
    return batPics;
  }

  // The venue's goings-on over the track from above, each frame (the TV, the maps, the phone with no
  // WebGL): what glows flickering (jack-o'-lanterns, torches), the will-o'-the-wisps drifting, the
  // phantom car, comets going over. Nothing new made each frame.
  function aboveFx(c, s, tr, ms, th = themeOf(s)) {
    const hs = extrasOf(tr, th);
    const glow = glowSprite(th.glow);
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < hs.things.length; k++) {
      const p = hs.things[k];
      if (!p.glow) continue;
      c.globalAlpha = Math.max(0, (flicker(ms, k) - 0.7) * 2.2);
      c.drawImage(glow, p.x - p.size * 1.3, p.y - p.size * 1.4, p.size * 2.6, p.size * 2.6);
    }
    const wisp = glowSprite(th.wisp);
    for (const w of hs.wisps) {
      const t = ms / 1000 + w.k;
      c.globalAlpha = 0.55 + 0.35 * Math.sin(t * 1.3);
      c.drawImage(wisp, w.x + Math.sin(t * 0.4) * 14 - 9, w.y + Math.cos(t * 0.33) * 10 - 9, 18, 18);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    if (th.fx.comets) cometAbove(c, tr, ms);
    const ph = phantomAt(s, tr);
    if (ph) {
      const green = glowSprite('green');
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.7 * ph.fade;
      c.drawImage(green, ph.x - 26, ph.y - 26, 52, 52);
      c.globalCompositeOperation = 'source-over';
      c.save();
      c.globalAlpha = 0.6 * ph.fade;
      c.translate(ph.x, ph.y);
      c.rotate(ph.a);
      c.drawImage(phantomSprite(), -SPRITE.x, -SPRITE.y, SPRITE.x * 2, SPRITE.y * 2);
      c.restore();
      c.globalAlpha = ph.fade;
      c.font = '14px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('👻', ph.x, ph.y - 20);
      c.globalAlpha = 1;
    }
  }

  // A comet: a bright head and a tail fading behind it, along +x (painted once).
  let cometPic = null;
  function cometSprite() {
    if (cometPic) return cometPic;
    cometPic = document.createElement('canvas');
    cometPic.width = 256;
    cometPic.height = 32;
    const c = cometPic.getContext('2d');
    const g = c.createLinearGradient(0, 0, 240, 0);
    g.addColorStop(0, 'rgba(120, 200, 255, 0)');
    g.addColorStop(0.7, 'rgba(170, 220, 255, 0.35)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 16);
    c.lineTo(240, 10);
    c.lineTo(240, 22);
    c.closePath();
    c.fill();
    const h = c.createRadialGradient(240, 16, 0, 240, 16, 14);
    h.addColorStop(0, 'rgba(255, 255, 255, 1)');
    h.addColorStop(0.35, 'rgba(200, 235, 255, 0.6)');
    h.addColorStop(1, 'rgba(160, 210, 255, 0)');
    c.fillStyle = h;
    c.fillRect(224, 0, 32, 32);
    return cometPic;
  }
  // Every so often a comet goes over (the same on every screen at the same time, near enough):
  // where it is, 0 to 1 across its pass, and which pass it is, or null between them.
  const COMET = { every: 9, pass: 1.8 };
  function cometNow(ms) {
    if (calm.matches) return null;
    const t = ms / 1000;
    const n = Math.floor(t / COMET.every);
    const into = t - n * COMET.every;
    return into > COMET.pass ? null : { n, f: into / COMET.pass };
  }
  function cometAbove(c, tr, ms) {
    const at = cometNow(ms);
    if (!at) return;
    const r = seeded(`comet${at.n}`);
    const W = tr.world.w;
    const H = tr.world.h;
    const x0 = r() * W;
    const y0 = -40;
    const x1 = x0 + (r() < 0.5 ? -1 : 1) * (300 + r() * 300);
    const y1 = H * (0.4 + r() * 0.5);
    const a = Math.atan2(y1 - y0, x1 - x0);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = Math.min(1, (1 - at.f) * 3, at.f * 6);
    c.translate(x0 + (x1 - x0) * at.f, y0 + (y1 - y0) * at.f);
    c.rotate(a);
    c.drawImage(cometSprite(), -120, -8, 128, 16);
    c.restore();
  }

  // ---------- The room's own props ----------
  //
  // Beside the track, a few times round the lap, a thing or two from the room you're racing in:
  // giant beer bottles and a BAR sign at the dive, a tiki and palms at the tiki bar, a Christmas
  // tree and a snowman at Christmas. Each is an emoji, or a few shapes drawn after the room's own
  // art (the frat's ΒΩΩΛ board, the saloon's wanted poster with the host on it), painted once into
  // one picture for the room, a square each. From above (the TV, the maps) they're drawn standing
  // up, like the TV's scenery; from the car they're cut-outs that turn to face you (see fp).
  //
  // Each: [emoji or drawing (ART), height, how much of its square's width it fills, how high it
  // floats, whether it glows]. Tall thin ones fill less of it; none is wider than SPOT_R * 2.
  const VENUE_PROPS = {
    classic: [['🏆', 32, 0.8], ['🏁', 34, 0.85]],
    dive: [['bottle', 48, 0.34], ['neon:BAR', 34, 1]],
    tavern: [['keg', 30, 0.66], ['🍺', 34, 0.85]],
    club: [['mirrorball', 44, 0.8], ['🍸', 32, 0.8]],
    castle: [['banner', 52, 0.6], ['shield', 34, 0.85]],
    jazz: [['🎷', 38, 0.8], ['neon:♫', 34, 1]],
    diner: [['jukebox', 40, 0.64], ['🍔', 30, 0.9]],
    tiki: [['🗿', 40, 0.7], ['🌴', 46, 0.85]],
    speakeasy: [['door', 40, 0.6], ['🥃', 28, 0.85]],
    casino: [['🎲', 30, 0.9], ['roulette', 38, 0.8]],
    saloon: [['🌵', 44, 0.7], ['wanted', 40, 0.62]],
    pirate: [['wheel', 36, 0.9], ['chest', 28, 0.86]],
    beerhall: [['keg', 30, 0.66], ['🥨', 30, 0.9]],
    space: [['🪐', 40, 0.95, 18], ['🛰️', 30, 0.9, 26]],
    lighthouse: [['lighthouse', 80, 0.3], ['⚓', 32, 0.8]],
    vineyard: [['cypress', 64, 0.24], ['wine', 30, 0.66]],
    frat: [['frat', 38, 1], ['cups', 34, 0.9]],
    garage: [['⛽', 36, 0.8], ['tyres', 34, 0.5]],
    chateau: [['⛲', 38, 0.9], ['topiary', 40, 0.5]],
    christmas: [['🎄', 50, 0.8], ['⛄', 36, 0.7]],
    // (Halloween's jack-o'-lantern glows and flickers: the fifth, `glow`. Its tomb and cross stand
    // in the fields too, and more lanterns along the fence: see extrasOf.)
    halloween: [['lantern', 30, 0.9, 0, true], ['tomb', 32, 0.46], ['scarecrow', 52, 0.66], ['cross', 40, 0.5]],
    stpatricks: [['whisky', 30, 0.66], ['stone', 50, 0.4]],
  };
  const CELL = 256; // pixels a prop's square

  // The room the race is in (an easter egg or a mood is still its room).
  function venueOf(s = PB.state) {
    const look = s?.look || s?.style || 'classic';
    const room = window.ROOM_STYLES?.roomOf ? ROOM_STYLES.roomOf(look) : look;
    return VENUE_PROPS[room] ? room : 'classic';
  }

  // Where a prop stands: out from the barrier by as much as it's wide.
  function propAt(p, it) {
    const out = it.half + 0.5;
    return [p.bx + p.ox * out, p.by + p.oy * out];
  }

  // The drawings, on a square 100 across, standing on its bottom edge, centred.
  const fillRound = (c, x, y, w, h, r, col) => { c.fillStyle = col; roundRect(c, x, y, w, h, r); c.fill(); };
  const poly = (c, col, d) => { c.fillStyle = col; c.fill(new Path2D(d)); };
  const write = (c, text, x, y, font, col) => { c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(text, x, y); };
  const glow = (c, col, blur) => { c.shadowColor = col; c.shadowBlur = blur * (CELL / 100); };
  function barrel(c, wood, hoop, label) {
    poly(c, wood, 'M22 12 Q12 55 22 99 H78 Q88 55 78 12Z');
    c.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    c.lineWidth = 1.4;
    for (const x of [34, 50, 66]) c.stroke(new Path2D(`M${x} 13 Q${x + (x - 50) * 0.3} 55 ${x} 98`));
    for (const y of [22, 88]) fillRound(c, 16, y - 3, 68, 6, 2, hoop);
    poly(c, 'rgba(255, 255, 255, 0.12)', 'M26 14 Q18 55 26 97 H32 Q26 55 32 14Z');
    c.fillStyle = '#c69a62';
    c.beginPath();
    c.ellipse(50, 12, 28, 6, 0, 0, Math.PI * 2);
    c.fill();
    if (label) { fillRound(c, 30, 44, 40, 20, 2, '#efe2bf'); write(c, label, 50, 54.5, 'bold 10px Georgia, serif', '#3b2512'); }
  }
  const ART = {
    // The dive: a beer bottle, the label in the room's colour.
    bottle(c, pal) {
      fillRound(c, 43, 3, 14, 6, 2, '#d8b040');
      poly(c, '#6e3a12', 'M45 8 H55 V34 Q66 42 66 54 V96 Q66 99 62 99 H38 Q34 99 34 96 V54 Q34 42 45 34Z');
      fillRound(c, 38, 50, 4, 42, 2, 'rgba(255, 255, 255, 0.25)');
      fillRound(c, 34, 58, 32, 24, 0, pal.accent);
      write(c, 'BEER', 50, 70.5, 'bold 10px system-ui, sans-serif', '#fff');
    },
    // A neon sign on two posts: the word (or a note) in tubes of the room's colour.
    neon(c, pal, text) {
      for (const x of [20, 76]) fillRound(c, x, 58, 4, 42, 1, '#2a2622');
      fillRound(c, 4, 18, 92, 46, 6, '#141018');
      c.font = `bold ${text.length > 1 ? 34 : 40}px "Arial Black", Impact, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      glow(c, pal.accent, 6);
      c.lineWidth = 4;
      c.strokeStyle = pal.accent;
      c.strokeText(text, 50, 43);
      c.shadowBlur = 0;
      c.lineWidth = 1.4;
      c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      c.strokeText(text, 50, 43);
    },
    keg: (c) => barrel(c, '#8a5a2e', '#3a3836'),
    wine: (c) => barrel(c, '#6e2a2a', '#2e2a28', 'VINO'),
    whisky: (c) => barrel(c, '#7a4a22', '#2a2826', 'WHISKY'),
    // The club's mirror ball, hung from an arm on a pole, glinting.
    mirrorball(c) {
      fillRound(c, 16, 4, 4, 96, 1, '#3a3a44');
      fillRound(c, 16, 4, 42, 4, 1, '#3a3a44');
      fillRound(c, 55, 6, 2, 16, 1, '#9a9aa8');
      c.save();
      c.beginPath();
      c.arc(56, 46, 24, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = '#b8bcc8';
      c.fillRect(30, 20, 52, 52);
      const rand = seeded('mirrorball');
      for (let y = 22; y < 70; y += 6) for (let x = 32; x < 80; x += 6) { c.fillStyle = `rgba(255, 255, 255, ${rand() * 0.6})`; c.fillRect(x, y, 5, 5); }
      c.fillStyle = 'rgba(30, 20, 60, 0.35)';
      c.fillRect(56, 20, 30, 52);
      c.restore();
      c.fillStyle = '#fff';
      for (const [x, y, r] of [[44, 34, 5], [66, 58, 3.5], [80, 26, 4]]) poly(c, '#fff', `M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3}Z`);
    },
    // The castle's banner (the TV scenery's gonfalon, in the room's colour, a crown on it).
    banner(c, pal) {
      fillRound(c, 48, 2, 4, 98, 1, '#3a2a1a');
      fillRound(c, 20, 6, 60, 4, 1, '#e8c15a');
      c.save();
      c.translate(21, 6);
      c.scale(0.97, 0.62);
      const cloth = new Path2D('M2 5 H58 V100 L44 118 L30 102 L16 118 L2 100Z');
      c.fillStyle = pal.accent;
      c.fill(cloth);
      c.lineWidth = 3;
      c.strokeStyle = '#e8c15a';
      c.stroke(cloth);
      c.restore();
      emoji(c, '👑', 26, 50, 40);
    },
    shield(c) { emoji(c, '⚔️', 78, 50, 52); emoji(c, '🛡️', 60, 50, 66); },
    // The diner's jukebox: the arch of coloured lights, the record window, the grille.
    jukebox(c) {
      poly(c, '#8a2a1e', 'M18 99 V42 Q18 4 50 4 Q82 4 82 42 V99Z');
      c.lineWidth = 4;
      ['#ff4d6d', '#ffd23f', '#29f0ff'].forEach((col, k) => {
        const r = 26 - k * 5;
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(50 - r, 74);
        c.lineTo(50 - r, 42);
        c.arc(50, 42, r, Math.PI, 0);
        c.lineTo(50 + r, 74);
        c.stroke();
      });
      fillRound(c, 38, 34, 24, 16, 3, '#ffe9b0');
      fillRound(c, 34, 76, 32, 18, 2, '#2a1a14');
      c.fillStyle = '#c9a050';
      for (let x = 37; x < 66; x += 5) c.fillRect(x, 78, 1.6, 14);
      fillRound(c, 14, 94, 72, 6, 2, '#c9ccd1');
    },
    // The speakeasy's door: the slot (someone's looking out), the knob, a lamp over it.
    door(c) {
      fillRound(c, 20, 10, 60, 90, 2, '#22160e');
      fillRound(c, 26, 16, 48, 84, 1, '#5a3418');
      c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      c.lineWidth = 1.6;
      c.strokeRect(32, 46, 36, 20);
      c.strokeRect(32, 72, 36, 22);
      fillRound(c, 38, 26, 24, 9, 1, '#0a0604');
      fillRound(c, 43, 29, 4, 3, 1, '#ffd27a');
      fillRound(c, 53, 29, 4, 3, 1, '#ffd27a');
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.arc(66, 62, 3, 0, Math.PI * 2);
      c.fill();
      glow(c, '#ffc860', 6);
      fillRound(c, 44, 1, 12, 7, 3, '#ffd27a');
      c.shadowBlur = 0;
    },
    // A roulette wheel stood on its edge.
    roulette(c) {
      poly(c, '#5a3418', 'M38 78 H62 L70 99 H30Z');
      c.fillStyle = '#6a3a1a';
      c.beginPath();
      c.arc(50, 44, 40, 0, Math.PI * 2);
      c.fill();
      for (let k = 0; k < 18; k++) {
        c.fillStyle = k === 0 ? '#1a8a3a' : k % 2 ? '#c8202e' : '#141414';
        c.beginPath();
        c.moveTo(50, 44);
        c.arc(50, 44, 34, (k / 18) * Math.PI * 2, ((k + 1) / 18) * Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.arc(50, 44, 15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#8a6a20';
      c.beginPath();
      c.arc(50, 44, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(66, 22, 3, 0, Math.PI * 2);
      c.fill();
    },
    // The saloon's wanted poster (as in its scenery): the host's face, dead or alive.
    wanted(c, pal, text, s) {
      fillRound(c, 47, 60, 6, 40, 1, '#5a3a1e');
      c.save();
      c.translate(20, 2);
      c.scale(1, 0.84);
      poly(c, '#e7d3a6', 'M2 2 H58 V80 L52 82 L46 79 L38 82 L30 79 L22 82 L14 79 L8 82 L2 80Z');
      c.strokeStyle = '#a8875a';
      c.lineWidth = 0.8;
      c.strokeRect(6, 6, 48, 70);
      write(c, 'WANTED', 30, 15, 'bold 11px Georgia, serif', '#3b2512');
      const host = s?.hostId ? PB.look(s.hostId) : null;
      emoji(c, host?.avatar || '🤠', 20, 30, 48);
      write(c, String((s?.hostId && name(s.hostId)) || 'The Host').toUpperCase().slice(0, 12), 30, 61, 'bold 7px Georgia, serif', '#3b2512');
      write(c, 'DEAD OR ALIVE · $500', 30, 71, '6px Georgia, serif', '#6b4524');
      c.restore();
    },
    // The pirate's ship's wheel on its post, and a treasure chest, open.
    wheel(c) {
      poly(c, '#4a2c14', 'M44 74 H56 L62 99 H38Z');
      c.strokeStyle = '#7a4a22';
      c.lineCap = 'round';
      c.lineWidth = 5;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(50, 42);
        c.lineTo(50 + Math.cos(a) * 42, 42 + Math.sin(a) * 42);
        c.stroke();
      }
      c.lineWidth = 6;
      c.strokeStyle = '#8a5a2a';
      c.beginPath();
      c.arc(50, 42, 30, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.arc(50, 42, 8, 0, Math.PI * 2);
      c.fill();
    },
    chest(c) {
      poly(c, '#5e3818', 'M16 54 L20 24 Q50 12 82 24 L84 54Z');
      const rand = seeded('chest');
      for (let k = 0; k < 26; k++) {
        c.fillStyle = rand() < 0.5 ? '#ffd23f' : '#e8a820';
        c.beginPath();
        c.arc(20 + rand() * 60, 46 + rand() * 10, 4, 0, Math.PI * 2);
        c.fill();
      }
      fillRound(c, 12, 56, 76, 43, 3, '#7a4a22');
      for (const x of [22, 74]) fillRound(c, x, 56, 5, 43, 0, '#c9a050');
      fillRound(c, 45, 62, 10, 12, 2, '#d4af37');
      emoji(c, '💎', 14, 64, 44);
    },
    // The lighthouse: red and white, its lamp lit, the beams going out.
    lighthouse(c) {
      c.fillStyle = 'rgba(255, 236, 160, 0.6)';
      c.fill(new Path2D('M50 16 L2 6 L2 26Z M50 16 L98 6 L98 26Z'));
      c.save();
      const tower = new Path2D('M37 98 L43 24 H57 L63 98Z');
      c.clip(tower);
      for (let y = 24; y < 98; y += 12) { c.fillStyle = (y / 12) % 2 < 1 ? '#f4f1ea' : '#c8302e'; c.fillRect(30, y, 40, 12); }
      c.restore();
      fillRound(c, 39, 21, 22, 4, 1, '#222');
      glow(c, '#ffe9a0', 8);
      fillRound(c, 43, 10, 14, 11, 1, '#fff2b0');
      c.shadowBlur = 0;
      poly(c, '#c8302e', 'M41 11 L50 2 L59 11Z');
      fillRound(c, 32, 94, 36, 6, 1, '#8a8a8a');
    },
    // The vineyard's cypress, tall and dark.
    cypress(c) {
      fillRound(c, 48, 86, 4, 14, 1, '#5a3a1e');
      poly(c, '#1f4a28', 'M50 2 Q63 30 61 60 Q59 84 50 90 Q41 84 39 60 Q37 30 50 2Z');
      poly(c, 'rgba(255, 255, 255, 0.1)', 'M50 4 Q43 30 42 60 Q42 80 48 88 Q46 60 50 4Z');
    },
    // The frat's ΒΩΩΛ board (from the basement wall), and a pyramid of red cups.
    frat(c) {
      for (const x of [8, 88]) fillRound(c, x, 30, 4, 70, 1, '#3a2414');
      fillRound(c, 2, 24, 96, 40, 4, '#1b3f8e');
      c.lineWidth = 3;
      c.strokeStyle = '#d4af37';
      c.stroke();
      write(c, 'ΒΩΩΛ', 50, 45, 'bold 27px Georgia, serif', '#f4f4f4');
    },
    cups(c) {
      for (const [x, y] of [[22, 72], [50, 72], [78, 72], [36, 44], [64, 44], [50, 16]]) {
        poly(c, '#d62828', `M${x - 13} ${y} H${x + 13} L${x + 9} ${y + 27} H${x - 9}Z`);
        fillRound(c, x - 14, y - 1, 28, 4, 2, '#f4f4f4');
        c.fillStyle = 'rgba(0, 0, 0, 0.18)';
        c.fillRect(x - 11, y + 9, 22, 1.4);
        c.fillStyle = 'rgba(255, 255, 255, 0.22)';
        c.fillRect(x - 9, y + 4, 3, 20);
      }
    },
    // The garage's stack of tyres, in its colour.
    tyres(c, pal) {
      for (let k = 0; k < 5; k++) {
        const y = 82 - k * 16;
        fillRound(c, 26 - (k === 4 ? 2 : 0), y, 48, 17, 7, '#161616');
        fillRound(c, 30, y + 7, 40, 3, 1, k % 2 ? pal.accent : '#3a3a3a');
      }
    },
    // The château's topiary: a clipped ball on a stem, in a pot.
    topiary(c) {
      poly(c, '#b5562a', 'M34 82 H66 L61 99 H39Z');
      fillRound(c, 32, 80, 36, 5, 1, '#c86a3a');
      fillRound(c, 48, 50, 4, 32, 1, '#5a3a1e');
      c.fillStyle = '#2f6e34';
      c.beginPath();
      c.arc(50, 34, 22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.14)';
      c.beginPath();
      c.arc(43, 27, 11, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a6230';
      c.beginPath();
      c.arc(50, 70, 9, 0, Math.PI * 2);
      c.fill();
    },
    // Halloween's tombstone, and the Highlands' standing stone.
    tomb(c) {
      poly(c, '#8a8696', 'M26 99 V40 Q26 12 50 12 Q74 12 74 40 V99Z');
      poly(c, 'rgba(0, 0, 0, 0.18)', 'M62 15 Q74 22 74 40 V99 H66 V40 Q66 24 62 15Z');
      c.strokeStyle = 'rgba(30, 26, 36, 0.6)';
      c.lineWidth = 1.2;
      c.stroke(new Path2D('M34 30 L40 38 L37 46 M66 70 L60 78'));
      write(c, 'RIP', 50, 46, 'bold 16px Georgia, serif', '#3a3644');
      poly(c, '#6a5a2e', 'M20 99 L26 88 L30 96 L36 86 L40 99Z M60 99 L66 86 L70 96 L76 88 L80 99Z');
    },
    // A torch on a pole (the tiki bar's bamboo; the castle's on the walls), lit.
    torch(c) {
      fillRound(c, 46, 30, 8, 70, 2, '#8a6a3a');
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      for (const y of [46, 64, 82]) c.fillRect(46, y, 8, 2);
      poly(c, '#5a3a1e', 'M36 22 H64 L58 34 H42Z');
      glow(c, '#ffb040', 8);
      poly(c, '#ff8a1f', 'M50 0 Q64 12 60 22 H40 Q36 12 50 0Z');
      poly(c, '#ffe08a', 'M50 8 Q57 15 55 22 H45 Q43 15 50 8Z');
      c.shadowBlur = 0;
    },
    // Halloween: a jack-o'-lantern (as on the room's haunted hill), lit inside.
    lantern(c) {
      poly(c, '#3c5a1e', 'M46 34 Q44 18 54 12 L59 18 Q52 21 54 34Z');
      c.fillStyle = '#c4500f';
      for (const x of [28, 72]) { c.beginPath(); c.ellipse(x, 66, 24, 32, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#e0641a';
      c.beginPath();
      c.ellipse(50, 66, 28, 33, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#f07a2a';
      c.beginPath();
      c.ellipse(50, 66, 13, 32, 0, 0, Math.PI * 2);
      c.fill();
      glow(c, '#ffb040', 5);
      poly(c, '#ffd23f', 'M24 56 L36 42 L42 60Z M76 56 L64 42 L58 60Z M50 62 L44 72 H56Z M22 76 Q50 104 78 76 L70 79 L64 72 L56 82 L50 75 L44 82 L36 72 L30 79Z');
      c.shadowBlur = 0;
      poly(c, '#fff1a8', 'M30 54 L36 47 L39 56Z M70 54 L64 47 L61 56Z');
    },
    // Halloween: a stone cross, a little crooked, dead grass round its foot.
    cross(c) {
      c.save();
      c.translate(50, 99);
      c.rotate(0.06);
      poly(c, '#7e788c', 'M-6 0 V-90 H6 V0Z M-24 -70 H24 V-58 H-24Z');
      poly(c, 'rgba(0, 0, 0, 0.22)', 'M2 0 V-90 H6 V0Z M-24 -61 H24 V-58 H-24Z');
      c.restore();
      poly(c, '#6a5a2e', 'M30 99 L36 88 L40 96 L46 86 L50 99Z M52 99 L58 86 L62 96 L68 88 L72 99Z');
    },
    // Halloween: a scarecrow on its post, a sack for a head, a crow on its arm.
    scarecrow(c) {
      fillRound(c, 47, 30, 6, 70, 1, '#4a3018');
      fillRound(c, 8, 34, 84, 5, 1, '#4a3018');
      poly(c, '#5a3a5e', 'M30 34 H70 L74 72 Q62 68 56 76 L50 70 L44 76 Q38 68 26 72Z');
      poly(c, '#7a4a2a', 'M36 46 h10 v10 h-10Z M56 56 h9 v8 h-9Z');
      for (const x of [10, 90]) poly(c, '#e0c060', `M${x} 32 l${x < 50 ? -6 : 6} 4 l${x < 50 ? 2 : -2} 4 l${x < 50 ? -6 : 6} 2 l${x < 50 ? 8 : -8} 0Z`);
      for (const x of [28, 36, 44, 56, 64, 72]) poly(c, '#d8b050', `M${x} 72 l3 8 l3 -9Z`);
      c.fillStyle = '#c8a870';
      c.beginPath();
      c.ellipse(50, 24, 13, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#3a2410';
      c.lineWidth = 1.4;
      c.stroke(new Path2D('M43 21 l4 3 M47 21 l-4 3 M53 21 l4 3 M57 21 l-4 3 M42 30 Q50 34 58 30 M44 29 v3 M48 30 v3 M52 30 v3 M56 29 v3'));
      poly(c, '#241a26', 'M30 14 H70 L64 10 L58 1 L46 5 L40 10Z');
      fillRound(c, 40, 10, 22, 3, 1, '#8a2a2a');
      poly(c, '#0a080c', 'M78 34 Q76 26 82 24 L86 22 L84 26 Q90 28 88 34Z');
    },
    stone(c) {
      poly(c, '#7d8085', 'M34 99 L30 62 Q32 22 46 8 Q60 4 64 24 Q70 60 68 99Z');
      poly(c, 'rgba(0, 0, 0, 0.2)', 'M58 8 Q64 12 64 24 Q70 60 68 99 H58 Q62 60 58 8Z');
      c.fillStyle = '#8a9a5a';
      for (const [x, y, r] of [[40, 40, 3], [46, 64, 4], [38, 80, 2.5], [54, 30, 2]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    },
  };
  // An emoji, sized and standing on (x, y) at the bottom of its glyph.
  function emoji(c, ch, size, x, y) {
    c.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const m = c.measureText(ch);
    const w = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || size);
    c.fillStyle = '#000';
    c.fillText(ch, x - w / 2 + (m.actualBoundingBoxLeft || 0), y - (m.actualBoundingBoxDescent || 0));
  }

  // The room's props, painted once (a square each, side by side), and how big each stands.
  let propCache = null;
  function propArt(pal = palette()) {
    const s = PB.state;
    const venue = venueOf(s);
    const th = themeOf(s);
    const host = venue === 'saloon' && s?.hostId ? `${PB.look(s.hostId).avatar}${name(s.hostId)}` : '';
    const key = `${venue}:${th.id}:${pal.accent}:${host}`;
    if (propCache?.key === key) return propCache;
    // (The venue's props, then any its race puts round the track as well: the tiki bar's torches.)
    const own = VENUE_PROPS[venue];
    const list = th.art ? own.concat(th.art) : own;
    const cv = document.createElement('canvas');
    // (A power of two across, for the mipmaps.)
    const cols = 2 ** Math.ceil(Math.log2(Math.max(2, list.length)));
    cv.width = CELL * cols;
    cv.height = CELL;
    const c = cv.getContext('2d');
    const items = list.map(([what, size, wide, lift = 0, glows = false], cell) => {
      c.save();
      c.translate(cell * CELL, 0);
      c.scale(CELL / 100, CELL / 100);
      // (Inside its square, with a little room round it, so the next one doesn't bleed in.)
      c.translate(3, 3);
      c.scale(0.94, 0.94);
      const [kind, text] = what.split(':');
      if (ART[kind]) ART[kind](c, pal, text, s);
      else emoji(c, what, 84, 50, 99);
      c.restore();
      return { cell, size, lift, glow: glows, kind: what.split(':')[0], half: Math.min(SPOT_R, (size * wide) / 2) };
    });
    propCache = { key, cv, items: items.slice(0, own.length), cols, byKind: Object.fromEntries(items.map((it) => [it.kind, it])) };
    return propCache;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
  }

  // A car from above (its picture: spriteOf), nose along +x, at its place on the track.
  function drawCar(c, car, id, { label, mine, honk, lamps, big }) {
    const [x, y, a, flags] = car;
    const look = lookNow(id);
    // (Rainbow Road: being put back on after a fall, it blinks.)
    if (flags & 16 && Math.floor(performance.now() / 120) % 2) return;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    if (big) c.scale(1.25, 1.25); // (the TV: big enough to tell a trolley from a van)
    if (lamps) {
      // Headlights: a pool of light ahead (the gradient's in the car's own frame, so one does all).
      if (!c.trBeam) {
        c.trBeam = c.createLinearGradient(14, 0, 66, 0);
        c.trBeam.addColorStop(0, 'rgba(255, 240, 190, 0.55)');
        c.trBeam.addColorStop(1, 'rgba(255, 240, 190, 0)');
      }
      c.fillStyle = c.trBeam;
      c.beginPath();
      c.moveTo(14, -6);
      c.lineTo(66, -24);
      c.lineTo(66, 24);
      c.lineTo(14, 6);
      c.fill();
    }
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundRect(c, -13, -6, 28, 16, 5);
    c.fill();
    // Your own car glows white (on your phone's map).
    if (mine) {
      c.shadowColor = '#fff';
      c.shadowBlur = 6;
    }
    c.drawImage(spriteOf(id), -SPRITE.x, -SPRITE.y, SPRITE.x * 2, SPRITE.y * 2);
    c.shadowBlur = 0;
    if (flags & 8) {
      c.fillStyle = '#ff2a2a';
      c.fillRect(-15, -6, 2.4, 3.4);
      c.fillRect(-15, 2.6, 2.4, 3.4);
    }
    c.restore();
    if (label) {
      c.font = '15px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(look.avatar, x, y - (big ? 25 : 21));
    }
    if (honk) {
      c.font = 'bold 13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      c.lineWidth = 3;
      c.strokeText('BEEP!', x + 20, y - 26);
      c.fillText('BEEP!', x + 20, y - 26);
    }
  }

  // ---------- Where the cars are ----------

  let snaps = []; // the latest 'cars' updates of this race
  let snapRace = 0;
  const honked = {}; // id -> local time of their last toot

  // The clock the cars are drawn on: race time, a moment behind. A phone's network doesn't deliver
  // the updates evenly (it bunches them, holds some back, lets a few through at once), and a fixed
  // delay either wastes time on a good connection or runs out on a bad one. So each update's
  // lateness is noted (local arrival minus race time, against the quickest lately), and the delay
  // is set from it (PLAY). The clock never jumps to a new delay: it runs a few percent fast or slow
  // till it gets there, so the cars just speed up or slow down a touch.
  const playout = {
    offs: new Float64Array(PLAY.window), // recent updates' (arrival − race time), seconds
    late: new Float64Array(PLAY.window), // (room to sort them in)
    n: 0,
    i: 0,
    target: null, // local minus drawn race time we're heading for
    off: null, // ...and where it is now
    at: 0, // when it was last moved (local seconds)
    reset() { this.n = this.i = 0; this.target = this.off = null; },
    ready() { return this.off != null; },
    // An update for race time t, here at local time now (seconds).
    arrive(now, t) {
      const W = this.offs.length;
      this.offs[this.i] = now - t;
      this.i = (this.i + 1) % W;
      if (this.n < W) this.n++;
      let base = Infinity;
      for (let k = 0; k < this.n; k++) if (this.offs[k] < base) base = this.offs[k];
      for (let k = 0; k < this.n; k++) this.late[k] = this.offs[k] - base;
      const late = this.late.subarray(0, this.n).sort()[Math.min(this.n - 1, Math.floor(this.n * PLAY.q))];
      this.target = base + Math.min(PLAY.max, Math.max(PLAY.min, PLAY.gap + late + PLAY.margin));
      // (The first update of a race, or after a long gap: straight there.)
      if (this.off == null || Math.abs(this.target - this.off) > 1) { this.off = this.target; this.at = now; }
    },
    // The race time to draw at local time now.
    now(now) {
      const dt = Math.min(0.1, Math.max(0, now - this.at));
      this.at = now;
      const step = PLAY.slew * dt;
      this.off += Math.max(-step, Math.min(step, this.target - this.off));
      return now - this.off;
    },
  };
  let lastMine = { place: 0, lap: 0, done: false };

  function carIds() {
    return PB.state?.game?.carIds || [];
  }

  // Every frame: the same arrays filled in again, not new ones.
  const nowCars = [];
  function carsNow() {
    const g = PB.state?.game;
    if (!g) return [];
    const racing = PB.state.phase === 'race';
    if (!racing || !snaps.length || snapRace !== g.race || !playout.ready()) return g.cars.c;
    const t = playout.now(performance.now() / 1000);
    let i = snaps.length - 1;
    while (i > 0 && snaps[i].t > t) i--;
    const a = snaps[i];
    const b = snaps[i + 1];
    const n = a.c.length;
    nowCars.length = n;
    for (let k = 0; k < n; k++) nowCars[k] ||= [0, 0, 0, 0, 0, 0];
    if (!b) {
      // Past the latest update: carry on a little in the way they were going.
      const p = snaps[i - 1];
      if (!p) return a.c;
      const f = Math.min(PLAY.extra, Math.max(0, t - a.t)) / (a.t - p.t || 0.05);
      for (let k = 0; k < n; k++) lerpCar(p.c[k] || a.c[k], a.c[k], 1 + f, nowCars[k]);
      return nowCars;
    }
    const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
    for (let k = 0; k < n; k++) lerpCar(a.c[k], b.c[k] || a.c[k], f, nowCars[k]);
    return nowCars;
  }

  // Between two updates (f from 0 to 1), or a little past the second (f over 1).
  function lerpCar(a, b, f, out) {
    // (Rainbow Road: a car that's just fallen off is put straight back, not slid across the gap.)
    if (b[3] & 16 && !(a[3] & 16)) f = 1;
    let da = b[2] - a[2];
    da = Math.atan2(Math.sin(da), Math.cos(da));
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + da * f;
    out[3] = b[3];
    out[4] = b[4];
    out[5] = b[5];
    return out;
  }

  // ---------- The canvases on screen ----------

  let views = [];
  let frame = null;
  const order = []; // cars by place, for drawing (reused)

  function attachViews() {
    const s = PB.state;
    const tr = s.game.track;
    views = [...document.querySelectorAll('.tr-stage')].map((el) => {
      const [bg, marks, fg] = el.querySelectorAll('canvas');
      // The TV's stage is a fixed size, zoomed to fit: draw it sharp at twice that.
      const scale = PB.isTV ? 2 : Math.max(0.3, (el.clientWidth / tr.world.w) * (window.devicePixelRatio || 1));
      for (const cv of [bg, marks, fg]) {
        cv.width = Math.round(tr.world.w * scale);
        cv.height = Math.round(tr.world.h * scale);
      }
      const mini = el.classList.contains('mini');
      drawStatic(bg, tr, scale, scale, { scenery: !mini || el.clientWidth > 300 });
      return { el, fg, marks, scale, mini, bridge: bridgeLayer(tr, scale) };
    });
    spriteGen++; // (each car's picture is looked at again: someone may have changed theirs)
    paintPics();
    fp.attach(s);
    kick();
  }

  // The figure eight's bridge on a layer of its own, drawn over the cars passing under it (and
  // under the ones on it). Just the part of the track it covers.
  function bridgeLayer(tr, scale) {
    const sh = shapeOf(tr);
    if (!tr.crossing || !sh.hilly) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const pad = sh.top + Math.max(...sh.zs) * 0.4 + 6;
    for (let i = 0; i < sh.N; i++) {
      if (!sh.deck[i]) continue;
      x0 = Math.min(x0, sh.xs[i] - pad); y0 = Math.min(y0, sh.ys[i] - pad);
      x1 = Math.max(x1, sh.xs[i] + pad); y1 = Math.max(y1, sh.ys[i] + pad);
    }
    if (x0 > x1) return null;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * scale);
    cv.height = Math.ceil((y1 - y0) * scale);
    const c = cv.getContext('2d');
    c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    c.lineJoin = 'round';
    bridgeAbove(c, tr, sh, palette(), false);
    return { cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // Whether a car is on the road under the bridge, right under it now.
  const aboveHints = {};
  function underBridge(tr, id, car) {
    const sh = shapeOf(tr);
    const r = roadAt(sh, car[0], car[1], car[2], aboveHints[id] ?? -1);
    aboveHints[id] = r.i;
    if (sh.ceil[r.i] >= 1e4) return false;
    for (let i = 0; i < sh.N; i++) {
      if (sh.deck[i] && (sh.xs[i] - car[0]) ** 2 + (sh.ys[i] - car[1]) ** 2 < (sh.top + 6) ** 2) return true;
    }
    return false;
  }

  const kick = () => { if (!frame && !document.hidden && (views.length || fp.el)) frame = requestAnimationFrame(draw); };
  // Nothing's drawn while the page is hidden (a locked phone, another tab).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame) { cancelAnimationFrame(frame); frame = null; } else kick();
  });

  function draw(ms) {
    frame = null;
    if (views.length) views = views.filter((v) => v.el.isConnected);
    const s = PB.state;
    if (s?.gameType !== 'trackRacing' || !s.game) { sound.stop('left'); return; }
    if (fp.el && !fp.el.isConnected) fp.detach();
    if (!views.length && !fp.el) return;
    const cars = carsNow();
    const ids = carIds();
    const now = performance.now();
    order.length = cars.length;
    for (let i = 0; i < cars.length; i++) order[i] = i;
    // The leader on top.
    order.sort((a, b) => (cars[b][4] || 0) - (cars[a][4] || 0));
    const lamps = !!wxOf(s).lamps;
    const th = themeOf(s);
    const fx = th.along || th.field || th.wisps || th.fx.phantom || th.fx.comets;
    for (const v of views) {
      const c = v.fg.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, v.fg.width, v.fg.height);
      c.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      if (fx && !v.mini) aboveFx(c, s, s.game.track, now, th);
      const m = v.marks.getContext('2d');
      m.setTransform(v.scale, 0, 0, v.scale, 0, 0);
      // (The figure eight: cars under the bridge first, then the bridge over them, then the rest.)
      const bridge = v.bridge;
      for (let pass = bridge ? 0 : 1; pass < 2; pass++) {
      if (pass === 1 && bridge) c.drawImage(bridge.cv, bridge.x, bridge.y, bridge.w, bridge.h);
      for (const i of order) {
        const car = cars[i];
        const id = ids[i];
        if (!car || !id) continue;
        const under = bridge ? underBridge(s.game.track, id, car) : false;
        if (pass === 0 && !under) continue;
        // (Over the bridge, a car under it shows faintly through, so you can still tell who's where.)
        c.globalAlpha = pass === 1 && under ? 0.3 : 1;
        // Skid marks where the back wheels slide (drifting, or on the grass).
        if (s.phase === 'race' && car[3] & 1 && !under) {
          m.fillStyle = car[3] & 2 ? 'rgba(40, 25, 10, 0.18)' : 'rgba(10, 10, 10, 0.22)';
          for (const side of [-6, 6]) {
            m.beginPath();
            m.arc(car[0] - Math.cos(car[2]) * 8 - Math.sin(car[2]) * side, car[1] - Math.sin(car[2]) * 8 + Math.cos(car[2]) * side, 1.8, 0, Math.PI * 2);
            m.fill();
          }
        }
        drawCar(c, car, id, { label: !v.mini || PB.isTV, mine: id === s.me && !PB.isTV, honk: now - (honked[id] || -1e9) < 900, lamps, big: PB.isTV });
        c.globalAlpha = 1;
      }
      }
    }
    if (fp.el) {
      fp.frame(s, cars, ids, ms || now);
      if (driving()) sound.drive(s, cars, ids, now);
    }
    frame = requestAnimationFrame(draw);
  }

  function stage(s, { mini = false } = {}) {
    const g = s.game;
    const th = themeOf(s);
    return `<div class="tr-stage ${mini ? 'mini' : ''} ${th.cls}" data-race="${g.race}">
      <canvas class="tr-bg"></canvas><canvas class="tr-marks"></canvas><div class="tr-wx tr-wx-${weatherOf(s)}"></div><canvas class="tr-fg"></canvas>
      ${WX[weatherOf(s)].fall ? `<div class="tr-fall tr-fall-${WX[weatherOf(s)].fall}"></div>` : ''}
      ${mini ? '' : th.overlay}
      ${mini ? '' : countHtml(s)}
    </div>`;
  }

  // ---------- The view from the car ----------
  //
  // One WebGL canvas (and a 2D one over it for the names) for the whole visit: each time the
  // driving screen is drawn they're moved into it, so the textures and models stay loaded.

  const GROUND_VS = 'attribute vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }';
  // The weather's light on a spot on the ground (or a model): the sky's (uLight), and at night the
  // cars' headlights (uCars: each car's x, y and which way it points; uHead 1 when they're on).
  const LIGHT_GLSL = `
    uniform vec3 uLight;
    uniform float uHead, uMute;
    uniform vec4 uCars[8];
    vec3 lit(vec2 w) {
      vec3 l = uLight;
      if (uHead > 0.5) {
        for (int i = 0; i < 8; i++) {
          vec4 c = uCars[i];
          vec2 d = w - c.xy;
          float a = dot(d, c.zw);
          if (a < -4.0 || a > 170.0 || c.z * c.z + c.w * c.w < 0.5) continue;
          float s = abs(d.x * c.w - d.y * c.z);
          l += vec3(1.0, 0.9, 0.7) * 1.6 * (1.0 - a / 170.0) * (1.0 - smoothstep(0.5, 1.0, s / (a * 0.42 + 8.0)));
        }
      }
      return l;
    }
    vec3 washed(vec3 c) { return mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uMute); }`;
  // Halloween's low fog: drifting banks of it over the ground (uLowK how thick, 0 for none), thinning
  // out a few units up.
  const LOW_GLSL = `
    uniform float uTime, uLowK;
    float lowFog(vec3 w) {
      if (uLowK <= 0.0) return 0.0;
      float n = 0.55 + 0.28 * sin(w.x * 0.021 + uTime * 0.31) * sin(w.y * 0.027 - uTime * 0.23) + 0.17 * sin((w.x - w.y) * 0.013 + uTime * 0.17);
      return clamp(uLowK * n * (1.0 - smoothstep(0.0, 9.0, w.z)), 0.0, 1.0);
    }`;
  // Rainbow Road's space, below the road: deep blue-black, a glow of colour, stars (each a cell of
  // the sky in a few hundred lit, picked by a hash of where it is).
  const SPACE_GLSL = `
    vec3 space(vec3 d) {
      vec3 n = normalize(d);
      vec3 q = floor(n * 240.0);
      float h = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      vec3 c = vec3(0.03, 0.02, 0.09) + vec3(0.1, 0.03, 0.16) * max(0.0, sin(n.x * 3.1 + n.y * 1.7)) * (0.5 - 0.5 * n.z);
      return c + vec3(step(0.9965, h) * (0.45 + 0.55 * fract(h * 37.0)));
    }`;
  // Each pixel's ray from the camera, to where it meets the ground (or the sky, above the horizon).
  const GROUND_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uGround, uSky;
    uniform vec2 uC, uWorld;
    uniform float uFocal, uFar, uWet, uFlash, uVoid;
    uniform vec3 uCam, uF, uR, uU, uHaze, uOut, uLow;
    ${LIGHT_GLSL}
    ${LOW_GLSL}
    ${SPACE_GLSL}
    void main() {
      vec2 p = (gl_FragCoord.xy - uC) / uFocal;
      vec3 d = uF + uR * p.x + uU * p.y;
      float hl = length(d.xy);
      if (d.z > -0.0015 * hl) {
        float el = atan(d.z, hl);
        vec3 sky = texture2D(uSky, vec2(atan(d.y, d.x) / 6.2831853, 1.0 - clamp(el / 0.55, 0.0, 1.0))).rgb;
        sky += uFlash * vec3(0.42, 0.4, 0.55);
        gl_FragColor = vec4(mix(uHaze, sky, smoothstep(0.0, 0.035, el)), 1.0);
        return;
      }
      // (Rainbow Road: below the road, space; on the hills, the road's a model of its own.)
      if (uVoid > 1.5) { gl_FragColor = vec4(space(d), 1.0); return; }
      float t = uCam.z / -d.z;
      vec2 w = uCam.xy + d.xy * t;
      vec2 uv = w / uWorld;
      vec4 gc = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(uOut, 1.0 - uVoid) : texture2D(uGround, uv);
      if (uVoid > 0.5 && gc.a < 0.5) { gl_FragColor = vec4(space(d), 1.0); return; }
      vec3 col = gc.rgb;
      if (uWet > 0.0) {
        // Wet: the asphalt (grey, dark) darker still, with the sky shining in it, more so far off.
        float hi = max(col.r, max(col.g, col.b));
        float tarmac = (1.0 - smoothstep(0.03, 0.09, hi - min(col.r, min(col.g, col.b)))) * (1.0 - smoothstep(0.3, 0.5, hi));
        vec3 sky = texture2D(uSky, vec2(atan(d.y, d.x) / 6.2831853, 0.9)).rgb;
        col = mix(col, col * 0.62 + sky * 0.45 * (1.0 - smoothstep(0.05, 0.5, -d.z / hl)), tarmac * uWet);
      }
      col = washed(col * lit(w));
      col = mix(col, uLow, lowFog(vec3(w, 0.0)));
      float f = clamp((t * hl - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uHaze, f * f), 1.0);
    }`;
  // Models: a colour each corner (the light baked in), and a tint: 1 the car's own colour, 2 a
  // brake light, 3 the start lights, 4 lit up at night (the headlights, the barriers' white
  // tyres, the gantry). Cars are placed by uM (x, y, cos, sin of their heading).
  const MODEL_VS = `
    attribute vec3 aP;
    attribute vec4 aC;
    uniform mat4 uVP;
    uniform vec4 uM;
    uniform vec3 uTint, uLamp, uCam, uH;
    uniform float uBrake, uFar, uGlow;
    varying vec3 vC;
    varying float vFog, vLow;
    ${LIGHT_GLSL}
    ${LOW_GLSL}
    void main() {
      // (uH: on the hills, how high the car is, and how the road under it tilts it: along, across.)
      vec3 w = vec3(uM.x + uM.z * aP.x - uM.w * aP.y, uM.y + uM.w * aP.x + uM.z * aP.y, aP.z + uH.x + aP.x * uH.y + aP.y * uH.z);
      vec3 c = aC.rgb;
      vec3 l = lit(w.xy);
      if (aC.a > 3.5) c *= mix(l, vec3(1.0), uGlow);
      else if (aC.a > 2.5) c *= uLamp;
      else if (aC.a > 1.5) c = mix(c * 0.45 * mix(l, vec3(1.0), uGlow), vec3(1.0, 0.15, 0.1), max(uBrake, uGlow * 0.6));
      else if (aC.a > 0.5) c *= uTint * l;
      else c *= l;
      vC = washed(c);
      float f = clamp((distance(w.xy, uCam.xy) - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      vFog = f * f;
      vLow = lowFog(w);
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  // (uGhost: Halloween's phantom car, pale green and see-through.)
  const MODEL_FS = `
    precision mediump float;
    uniform vec3 uHaze, uLow;
    uniform float uGhost;
    varying vec3 vC;
    varying float vFog, vLow;
    void main() {
      vec3 c = mix(mix(vC, uLow, vLow), vec3(0.55, 1.0, 0.75) * (0.45 + dot(vC, vec3(0.5))), uGhost * 0.75);
      gl_FragColor = vec4(mix(c, uHaze, vFog), 1.0 - uGhost * 0.5);
    }`;
  // The room's props: cut-outs standing on the ground, turned to face the camera (about the
  // upright, so they stay standing). Each corner: where it stands (x, y), how far to the side and
  // how high it is (aP), and where it is in the picture (aT). All of them, one draw.
  const PROP_VS = `
    attribute vec4 aP;
    attribute vec2 aT;
    uniform mat4 uVP;
    uniform vec2 uSide;
    uniform vec3 uCam;
    uniform float uFar;
    varying vec2 vT;
    varying float vFog, vLow;
    ${LOW_GLSL}
    void main() {
      vec3 w = vec3(aP.xy + uSide * aP.z, aP.w);
      vT = aT;
      float f = clamp((distance(w.xy, uCam.xy) - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      vFog = f * f;
      vLow = lowFog(w);
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  const PROP_FS = `
    precision mediump float;
    uniform sampler2D uArt;
    uniform vec3 uHaze, uLight, uLow;
    uniform float uMute;
    vec3 washed(vec3 c) { return mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uMute); }
    varying vec2 vT;
    varying float vFog, vLow;
    void main() {
      vec4 c = texture2D(uArt, vT);
      if (c.a < 0.5) discard;
      gl_FragColor = vec4(mix(mix(washed(c.rgb * uLight), uLow, vLow), uHaze, vFog), 1.0);
    }`;

  // The road on the hills (roadModel): the ground's picture laid over the ribbon, shaded by which
  // way each bit of it faces; on the bridge, asphalt with white lines and concrete beyond them.
  const ROAD_VS = `
    attribute vec3 aP;
    attribute vec2 aA;
    uniform mat4 uVP;
    uniform vec3 uCam;
    uniform float uFar;
    varying vec3 vW;
    varying vec2 vA;
    varying float vFog;
    void main() {
      vW = aP;
      vA = aA;
      float f = clamp((distance(aP.xy, uCam.xy) - uFar * 0.25) / (uFar * 0.75), 0.0, 1.0);
      vFog = f * f;
      gl_Position = uVP * vec4(aP, 1.0);
    }`;
  const ROAD_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uGround;
    uniform vec2 uWorld;
    uniform float uHalf, uWet, uVoid;
    uniform vec3 uHaze, uLow;
    varying vec3 vW;
    varying vec2 vA;
    varying float vFog;
    ${LIGHT_GLSL}
    ${LOW_GLSL}
    void main() {
      vec3 col;
      if (uVoid > 0.5) {
        // Rainbow Road on the hills: the road's picture, nothing beyond it (and the bridge's deck
        // in stripes of rainbow across it).
        if (vA.y < 0.5) {
          vec4 g = texture2D(uGround, vW.xy / uWorld);
          if (g.a < 0.5) discard;
          col = g.rgb;
        } else {
          float h = (1.0 - clamp(abs(vA.x) / (uHalf * 1.9), 0.0, 1.0)) * 0.8;
          col = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        }
        gl_FragColor = vec4(mix(col, uHaze, vFog), 1.0);
        return;
      }
      if (vA.y < 0.5) {
        col = texture2D(uGround, vW.xy / uWorld).rgb;
        float hi = max(col.r, max(col.g, col.b));
        float tarmac = (1.0 - smoothstep(0.03, 0.09, hi - min(col.r, min(col.g, col.b)))) * (1.0 - smoothstep(0.3, 0.5, hi));
        col *= vA.x * (1.0 - tarmac * uWet * 0.3);
      } else {
        float a = abs(vA.x);
        float n = fract(sin(dot(floor(vW.xy * 1.5), vec2(12.9898, 78.233))) * 43758.5453);
        col = vec3(0.23, 0.23, 0.25) + (n - 0.5) * 0.05;
        if (a > uHalf - 2.0 && a < uHalf) col = vec3(0.92);
        else if (a >= uHalf) col = mix(vec3(0.58, 0.57, 0.55), vec3(0.5), step(0.5, fract(vW.x * 0.05 + vW.y * 0.05)) * 0.3);
        col *= 1.0 - uWet * 0.3;
      }
      col = washed(col * lit(vW.xy));
      col = mix(col, uLow, lowFog(vW));
      gl_FragColor = vec4(mix(col, uHaze, vFog), 1.0);
    }`;

  // A shader program, and where its uniforms and attributes are (null if it won't compile).
  function program(gl, vs, fsrc) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fsrc]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; }
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u, aP: gl.getAttribLocation(p, 'aP'), aC: gl.getAttribLocation(p, 'aC'), aT: gl.getAttribLocation(p, 'aT'), aA: gl.getAttribLocation(p, 'aA') };
  }

  // Building models: triangles of [x, y, z, r, g, b, tint].
  const LIGHT = [0.45, -0.35, 0.82];
  const shade = (nx, ny, nz) => 0.58 + 0.42 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  function mesher() {
    const v = [];
    const tri = (a, b, c, col, t) => { for (const p of [a, b, c]) v.push(p[0], p[1], p[2] + m.lift, col[0], col[1], col[2], t); };
    const m = {
      v,
      lift: 0, // (on the hills: how high the ground is under what's being built)
      // A face (four corners in order), shaded by which way it faces.
      quad(a, b, c, d, col, t = 0) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        // (Whichever way round the corners came, light the side that faces up and out.)
        const k = Math.max(shade(nx, ny, nz), shade(-nx, -ny, -nz));
        const cc = col.map((x) => x * k);
        tri(a, b, c, cc, t);
        tri(a, c, d, cc, t);
      },
      // A box, turned by `a` about (x, y), from z0 to z1.
      box(x, y, a, hl, hw, z0, z1, col, t = 0, tops = true) {
        const ca = Math.cos(a), sa = Math.sin(a);
        const P = (u, w, z) => [x + ca * u - sa * w, y + sa * u + ca * w, z];
        const c = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
        for (let i = 0; i < 4; i++) {
          const [u0, w0] = c[i];
          const [u1, w1] = c[(i + 1) % 4];
          m.quad(P(u0, w0, z0), P(u1, w1, z0), P(u1, w1, z1), P(u0, w0, z1), col, t);
        }
        if (tops) m.quad(P(-hl, -hw, z1), P(hl, -hw, z1), P(hl, hw, z1), P(-hl, hw, z1), col, t);
      },
      // A triangle, coloured as it comes.
      tri,
      // A cylinder, or a cone (r1 0), with n sides.
      cyl(x, y, z0, z1, r0, r1, col, n = 8, t = 0) {
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          const p = (a, r, z) => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
          if (r1 > 0) m.quad(p(a0, r0, z0), p(a1, r0, z0), p(a1, r1, z1), p(a0, r1, z1), col, t);
          else {
            const am = (a0 + a1) / 2;
            const k = shade(Math.cos(am) * 0.8, Math.sin(am) * 0.8, 0.6);
            tri(p(a0, r0, z0), p(a1, r0, z0), [x, y, z1], col.map((q) => q * k), t);
          }
          if (r1 > 0) tri([x, y, z1], p(a0, r1, z1), p(a1, r1, z1), col.map((q) => q * shade(0, 0, 1)), t);
        }
      },
      // A four-sided beam from one point to another (a branch, a stone of an arch), r0 thick at
      // the start and r1 at the end.
      limb(a, b, r0, r1, col, t = 0) {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const L = Math.hypot(dx, dy, dz) || 1;
        const d0 = dx / L, d1 = dy / L, d2 = dz / L;
        let ux = d1, uy = -d0;
        const ul = Math.hypot(ux, uy);
        if (ul < 1e-3) { ux = 1; uy = 0; } else { ux /= ul; uy /= ul; }
        const vx = uy * d2, vy = -ux * d2, vz = ux * d1 - uy * d0; // (across both d and u)
        const P = (p, r, su, sv) => [p[0] + (ux * su + vx * sv) * r, p[1] + (uy * su + vy * sv) * r, p[2] + vz * sv * r];
        const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
        for (let i = 0; i < 4; i++) {
          const [s0, v0] = c[i];
          const [s1, v1] = c[(i + 1) % 4];
          m.quad(P(a, r0, s0, v0), P(a, r0, s1, v1), P(b, r1, s1, v1), P(b, r1, s0, v0), col, t);
        }
      },
      // A cylinder lying along x (a keg on its side), centred on (x, y, z), ends and all.
      drum(x, y, z, hl, r, col, n = 10) {
        const p = (a, u) => [x + u, y + Math.cos(a) * r, z + Math.sin(a) * r];
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          m.quad(p(a0, -hl), p(a1, -hl), p(a1, hl), p(a0, hl), col);
          for (const u of [-hl, hl]) tri([x + u, y, z], p(a0, u), p(a1, u), col.map((q) => q * shade(1, 0, 0)), 0);
        }
      },
    };
    return m;
  }

  // The barriers, the scenery and the gantry, as one model, as the venue has them (THEME).
  function sceneModel(tr, sh, pal, wx, th = themeOf()) {
    const m = mesher();
    // (One stream of random numbers for the lot, in the order they're built: the same every time.)
    const rand = seeded(`${tr.id}:haunted`);
    barrierModel(m, sh, pal, th);
    m.lift = 0;
    if (!th.void) bridgeModel(m, tr, sh, th.bridge.concrete, th.bridge.trim || pal.accentRgb);
    for (const p of sh.props) {
      m.lift = p.z || 0;
      if (p.kind === 'tyres') stackModel(m, p, rand, pal, th);
      else if (p.kind === 'tree' && kept(p, th)) treeModel(m, p, rand, wx, th);
    }
    m.lift = sh.stand?.z || 0;
    if (sh.stand && th.stand) standModel(m, tr, sh, pal, th);
    gantryModel(m, tr, sh, pal, th);
    return new Float32Array(m.v);
  }

  const BLACK = [0.09, 0.09, 0.1];
  const IRON = [0.17, 0.15, 0.2];
  const STONE = [0.36, 0.33, 0.41];
  const DEAD = [0.15, 0.11, 0.14];

  // The barriers, each side: a stretch for each step round, where there's room for one.
  function barrierModel(m, sh, pal, th) {
    const kind = th.barrier;
    if (kind === 'none') return;
    const col = rgb(th.wall || pal.rim, [0.85, 0.85, 0.85]);
    const col2 = rgb(th.wall2, BLACK);
    for (const w of sh.walls) {
      for (let i = 0; i < sh.N; i++) {
        const j = (i + 1) % sh.N;
        if (!w.ok[i] || !w.ok[j] || (sh.deck[i] && sh.deck[j])) continue;
        const x = (w.x[i] + w.x[j]) / 2;
        const y = (w.y[i] + w.y[j]) / 2;
        const a = Math.atan2(w.y[j] - w.y[i], w.x[j] - w.x[i]);
        const len = Math.hypot(w.x[j] - w.x[i], w.y[j] - w.y[i]) / 2;
        m.lift = (w.z[i] + w.z[j]) / 2;
        if (kind === 'tyres') {
          // A stack of tyres: a short box each, alternating colours.
          m.box(x, y, a, len + 0.3, 3, 0, 7, i % 2 ? BLACK : col, i % 2 ? 0 : 4);
        } else if (kind === 'fence') {
          // Two rails, railings with spear tips, and a stone pillar every so often.
          const hl = len + 0.2;
          m.box(x, y, a, hl, 0.35, 2.6, 3.4, IRON, 0, false);
          m.box(x, y, a, hl, 0.35, 9.2, 10, IRON, 0, false);
          for (const f of [0, 0.5]) {
            const px = w.x[i] + (w.x[j] - w.x[i]) * f;
            const py = w.y[i] + (w.y[j] - w.y[i]) * f;
            if (f === 0 && i % 10 === 0) {
              m.box(px, py, a, 2, 2, 0, 13, th.stone || STONE);
              m.box(px, py, a, 2.5, 2.5, 13, 14.2, th.stone || STONE);
              continue;
            }
            m.box(px, py, a, 0.35, 0.35, 0, 11.4, IRON, 0, false);
            m.cyl(px, py, 11.4, 13.4, 0.8, 0, IRON, 4);
          }
        } else if (kind === 'rail' || kind === 'rope') {
          // Posts, every other step, with two rails on them (or a rope slung along).
          if (i % 2 === 0) m.box(w.x[i], w.y[i], a, 0.7, 0.7, 0, 9, col);
          if (kind === 'rail') {
            m.box(x, y, a, len + 0.2, 0.3, 3.4, 4.4, col, 0, false);
            m.box(x, y, a, len + 0.2, 0.3, 7, 8, col, 0, false);
          } else m.box(x, y, a, len + 0.2, 0.25, 6.4, 7, col2, 0, false);
        } else if (kind === 'wall' || kind === 'hedge') {
          // A wall with a coping along its top (crenels on a castle's), or a clipped box hedge.
          const hedge = kind === 'hedge';
          m.box(x, y, a, len + 0.3, hedge ? 2.8 : 2, 0, hedge ? 6.4 : 5.4, col);
          m.box(x, y, a, len + 0.3, hedge ? 2.4 : 2.4, hedge ? 6.4 : 5.4, hedge ? 7.2 : 6.2, hedge ? col.map((v) => v * 1.2) : col2);
          if (th.crenels && i % 2 === 0) m.box(x, y, a, len * 0.5, 2.2, 6.2, 8.4, col);
        } else if (kind === 'neon') {
          // A low black kerb with a glowing tube along it.
          m.box(x, y, a, len + 0.3, 1.4, 0, 2.6, [0.05, 0.05, 0.07]);
          m.box(x, y, a, len + 0.3, 0.6, 2.6, 3.6, col, 4);
        } else if (kind === 'candy') {
          // Candy-cane posts, red and white in turn, a striped rail across them.
          m.box(w.x[i], w.y[i], a, 0.8, 0.8, 0, 8.4, i % 2 ? col2 : col);
          m.box(x, y, a, len + 0.2, 0.5, 6.4, 7.6, i % 2 ? col : col2);
        } else if (kind === 'bunting') {
          // A line strung between tall posts, little flags hanging off it.
          if (i % 4 === 0) m.box(w.x[i], w.y[i], a, 0.5, 0.5, 0, 11, [0.35, 0.23, 0.12]);
          m.box(x, y, a, len + 0.2, 0.12, 9.8, 10.2, [0.2, 0.2, 0.22], 0, false);
          const c = i % 2 ? col2 : col;
          const ca = Math.cos(a) * len * 0.7, sa = Math.sin(a) * len * 0.7;
          m.tri([x - ca, y - sa, 9.8], [x + ca, y + sa, 9.8], [x, y, 6.6], c.map((v) => v * 0.95), 0);
        }
      }
    }
  }

  // What's piled on the outside of a bend.
  function stackModel(m, p, rand, pal, th) {
    const kind = th.stack;
    const three = [[-3, -2], [3, -2], [0, 3]];
    if (kind === 'tyres') {
      const rim = rgb(th.wall || pal.rim, [0.85, 0.85, 0.85]);
      for (const [dx, dy] of three) {
        m.cyl(p.x + dx, p.y + dy, 0, 9, 3.6, 3.6, BLACK, 8);
        m.cyl(p.x + dx, p.y + dy, 9, 9.6, 3.6, 3.6, rim, 8);
      }
    } else if (kind === 'graves') {
      // A gravestone and a cross, a little askew, facing the track.
      const stone = th.stone || STONE;
      const a = rand() * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      const tx = p.x - ca * 2.5, ty = p.y - sa * 2.5;
      m.box(tx, ty, a, 0.9, 3.4, 0, 7.4, stone);
      m.box(tx, ty, a, 0.9, 2.6, 7.4, 8.6, stone);
      m.box(tx, ty, a, 0.9, 1.5, 8.6, 9.3, stone);
      const cx = p.x + ca * 3, cy = p.y + sa * 3;
      m.box(cx, cy, a, 0.7, 0.7, 0, 11.5, stone);
      m.box(cx, cy, a, 0.7, 3.2, 7.4, 8.8, stone);
    } else if (kind === 'drums') {
      // Oil drums (or the frat's kegs): ribbed, a dark lid.
      const col = th.drum || [0.16, 0.36, 0.56];
      for (const [dx, dy] of three) {
        m.cyl(p.x + dx, p.y + dy, 0, 8.4, 3, 3, col, 8);
        m.cyl(p.x + dx, p.y + dy, 8.4, 8.8, 3, 2.6, [0.12, 0.12, 0.14], 8);
        m.cyl(p.x + dx, p.y + dy, 2.8, 3.4, 3.1, 3.1, col.map((v) => v * 0.7), 8);
      }
    } else if (kind === 'barrels') {
      // Barrels: bellied, banded.
      const wood = [0.52, 0.32, 0.15];
      for (const [dx, dy] of three) {
        m.cyl(p.x + dx, p.y + dy, 0, 4.4, 2.8, 3.4, wood, 8);
        m.cyl(p.x + dx, p.y + dy, 4.4, 8.8, 3.4, 2.8, wood, 8);
        m.cyl(p.x + dx, p.y + dy, 1.4, 2, 3.2, 3.2, [0.2, 0.19, 0.18], 8);
        m.cyl(p.x + dx, p.y + dy, 6.8, 7.4, 3.2, 3.2, [0.2, 0.19, 0.18], 8);
      }
    } else if (kind === 'hay' || kind === 'presents' || kind === 'speakers') {
      // Bales of hay; presents with a ribbon round them; a stack of speakers.
      const cols = { hay: [[0.85, 0.72, 0.38], [0.76, 0.62, 0.3]], presents: [[0.89, 0.25, 0.23], [0.16, 0.54, 0.29], [0.91, 0.72, 0.29]], speakers: [[0.1, 0.1, 0.12], [0.14, 0.14, 0.17]] }[kind];
      const a = Math.atan2(p.y - 312, p.x - 500);
      [[-3, -1, 0, 4.4, 3, 3.6], [3, 1, 0, 4, 3, 4.4], [0, 0, kind === 'speakers' ? 4.4 : 3.6, 3.6, 2.6, 3.4]].forEach(([dx, dy, z, hl, hw, h], k) => {
        const col = cols[k % cols.length];
        m.box(p.x + dx, p.y + dy, a, hl, hw, z, z + h, col);
        if (kind === 'presents') m.box(p.x + dx, p.y + dy, a, 0.4, hw + 0.05, z, z + h + 0.1, [0.96, 0.96, 0.96]);
        if (kind === 'speakers') m.box(p.x + dx + Math.cos(a) * hl, p.y + dy + Math.sin(a) * hl, a, 0.15, hw * 0.6, z + h * 0.25, z + h * 0.75, [0.32, 0.32, 0.36], 0, false);
      });
    } else if (kind === 'stools') {
      // Chrome diner stools, red tops.
      for (const [dx, dy] of three) {
        m.cyl(p.x + dx, p.y + dy, 0, 0.6, 2, 2, [0.72, 0.74, 0.78], 6);
        m.cyl(p.x + dx, p.y + dy, 0.6, 6.4, 0.5, 0.5, [0.72, 0.74, 0.78], 4);
        m.cyl(p.x + dx, p.y + dy, 6.4, 8, 2.6, 2.6, [0.9, 0.22, 0.27], 8);
      }
    } else if (kind === 'chips') {
      // Stacks of casino chips.
      const cols = [[0.78, 0.13, 0.18], [0.96, 0.96, 0.96], [0.08, 0.08, 0.08], [0.16, 0.6, 0.35]];
      three.forEach(([dx, dy], k) => {
        for (let n = 0; n < 4 + k; n++) m.cyl(p.x + dx, p.y + dy, n * 1.4, n * 1.4 + 1.3, 2.8, 2.8, cols[(n + k) % cols.length], 8);
      });
    } else if (kind === 'rocks') {
      for (const [dx, dy, r, h] of [[-3, -1, 4, 5], [3, 1, 3, 3.6], [0, 4, 2.4, 2.6]]) m.cyl(p.x + dx, p.y + dy, 0, h, r, r * 0.35, [0.3, 0.28, 0.3], 6);
    } else if (kind === 'topiary') {
      for (const [dx, dy] of three) {
        m.cyl(p.x + dx, p.y + dy, 0, 3, 0.5, 0.5, [0.4, 0.27, 0.15], 4);
        m.cyl(p.x + dx, p.y + dy, 2.4, 5.4, 1.6, 3.2, [0.18, 0.43, 0.2], 8);
        m.cyl(p.x + dx, p.y + dy, 5.4, 8.2, 3.2, 1.2, [0.2, 0.47, 0.22], 8);
      }
    }
  }

  // What stands about in the fields.
  const TREE_GREENS = [[0.18, 0.49, 0.23], [0.24, 0.56, 0.27], [0.16, 0.42, 0.2], [0.3, 0.6, 0.24]];
  function treeModel(m, p, rand, wx, th) {
    const kind = th.tree;
    const snowy = (col, k) => (wx.snow ? mix(col, [0.95, 0.97, 1], k) : col);
    if (kind === 'pine') {
      const col = TREE_GREENS[Math.floor(p.tone * TREE_GREENS.length)];
      const top = wx.snow ? mix(col, [0.95, 0.97, 1], 0.75) : col.map((c) => c * 1.12);
      m.cyl(p.x, p.y, 0, p.h * 0.35, 1.6, 1.4, [0.4, 0.27, 0.15], 6);
      m.cyl(p.x, p.y, p.h * 0.25, p.h * 0.75, p.r, 0, wx.snow ? mix(col, [0.95, 0.97, 1], 0.35) : col, 7);
      m.cyl(p.x, p.y, p.h * 0.5, p.h, p.r * 0.72, 0, top, 7);
    } else if (kind === 'dead') {
      // A dead tree: a leaning, twisted trunk, bare branches, twigs off them.
      const h = p.h * 1.15;
      const la = rand() * Math.PI * 2;
      const lean = (rand() - 0.5) * 0.35;
      const mid = [p.x + Math.cos(la) * lean * h * 0.3, p.y + Math.sin(la) * lean * h * 0.3, h * 0.35];
      const top = [p.x + Math.cos(la) * lean * h, p.y + Math.sin(la) * lean * h, h * 0.66];
      m.limb([p.x, p.y, 0], mid, 2.1, 1.6, DEAD);
      m.limb(mid, top, 1.6, 0.8, DEAD);
      const n = 3 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const a = la + (k / n) * Math.PI * 2 + rand() * 0.9;
        const from = k === 0 ? top : [mid[0] + (top[0] - mid[0]) * (0.3 + k * 0.2), mid[1] + (top[1] - mid[1]) * (0.3 + k * 0.2), mid[2] + (top[2] - mid[2]) * (0.3 + k * 0.2)];
        const len = h * (0.28 + rand() * 0.22);
        const end = [from[0] + Math.cos(a) * len * 0.8, from[1] + Math.sin(a) * len * 0.8, from[2] + len * (0.3 + rand() * 0.5)];
        m.limb(from, end, 0.75, 0.3, DEAD);
        const a2 = a + (rand() - 0.5) * 1.8;
        const l2 = len * 0.55;
        m.limb(end, [end[0] + Math.cos(a2) * l2, end[1] + Math.sin(a2) * l2, end[2] + l2 * (rand() * 0.9 - 0.2)], 0.3, 0.1, DEAD);
      }
    } else if (kind === 'round') {
      // A broad-leaved tree: a trunk, a round crown.
      const col = snowy([[0.29, 0.54, 0.2], [0.35, 0.6, 0.23], [0.23, 0.48, 0.18], [0.42, 0.63, 0.25]][Math.floor(p.tone * 4)], 0.35);
      m.cyl(p.x, p.y, 0, p.h * 0.5, 1.4, 1.1, [0.38, 0.26, 0.15], 6);
      m.cyl(p.x, p.y, p.h * 0.35, p.h * 0.7, p.r * 0.6, p.r, col, 8);
      m.cyl(p.x, p.y, p.h * 0.7, p.h, p.r, p.r * 0.4, col.map((c) => Math.min(1, c * 1.12)), 8);
    } else if (kind === 'cypress') {
      m.cyl(p.x, p.y, 0, p.h * 0.15, 0.9, 0.9, [0.35, 0.23, 0.12], 5);
      m.cyl(p.x, p.y, p.h * 0.1, p.h * 0.6, p.r * 0.32, p.r * 0.42, snowy([0.12, 0.29, 0.16], 0.3), 7);
      m.cyl(p.x, p.y, p.h * 0.6, p.h * 1.45, p.r * 0.42, 0, snowy([0.14, 0.33, 0.18], 0.3), 7);
    } else if (kind === 'palm') {
      // A palm: a curving trunk, fronds drooping off the top.
      const la = p.tone * Math.PI * 2;
      const h = p.h * 1.1;
      const trunk = [0.5, 0.36, 0.22];
      const at = (f) => [p.x + Math.cos(la) * f * f * h * 0.3, p.y + Math.sin(la) * f * f * h * 0.3, f * h];
      m.limb(at(0), at(0.5), 1.3, 1.1, trunk);
      m.limb(at(0.5), at(1), 1.1, 0.9, trunk);
      const top = at(1);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + la;
        const mid = [top[0] + Math.cos(a) * h * 0.22, top[1] + Math.sin(a) * h * 0.22, top[2] + h * 0.04];
        const end = [top[0] + Math.cos(a) * h * 0.42, top[1] + Math.sin(a) * h * 0.42, top[2] - h * 0.14];
        m.limb(top, mid, 0.5, 1.1, [0.2, 0.52, 0.22]);
        m.limb(mid, end, 1.1, 0.2, [0.16, 0.45, 0.18]);
      }
    } else if (kind === 'cactus') {
      // A saguaro: a trunk and an arm or two, curving up.
      const g = [0.25, 0.48, 0.24];
      const h = p.h * 0.8;
      m.cyl(p.x, p.y, 0, h, 1.8, 1.6, g, 7);
      m.cyl(p.x, p.y, h, h + 1.2, 1.6, 0.6, g, 7);
      for (const [side, z0, up] of [[1, 0.35, 0.3], [-1, 0.5, 0.25]]) {
        const a = p.tone * 6 + (side > 0 ? 0 : Math.PI);
        const ox = Math.cos(a) * 4.5, oy = Math.sin(a) * 4.5;
        m.limb([p.x, p.y, h * z0], [p.x + ox, p.y + oy, h * z0 + 1], 1.1, 1.1, g);
        m.limb([p.x + ox, p.y + oy, h * z0 + 0.4], [p.x + ox, p.y + oy, h * (z0 + up) + 2], 1.1, 0.9, g);
      }
    } else if (kind === 'lamp') {
      // A street lamp: a post, an arm, the lamp (lit up at night).
      const lamp = { warm: [1, 0.86, 0.55], pink: [1, 0.4, 0.86], white: [0.95, 0.97, 1] }[th.lamp] || [1, 0.86, 0.55];
      const a = p.tone * Math.PI * 2;
      m.box(p.x, p.y, a, 0.45, 0.45, 0, 22, [0.14, 0.14, 0.16]);
      m.box(p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2, a, 2.2, 0.35, 21.4, 22.2, [0.14, 0.14, 0.16]);
      m.box(p.x + Math.cos(a) * 3.8, p.y + Math.sin(a) * 3.8, a, 1.3, 1, 19.6, 21.4, lamp, 4);
    } else if (kind === 'rock') {
      const col = [[0.42, 0.39, 0.4], [0.35, 0.33, 0.34], [0.48, 0.45, 0.43]][Math.floor(p.tone * 3)];
      m.cyl(p.x, p.y, 0, p.h * 0.32, p.r * 0.7, p.r * 0.25, snowy(col, 0.5), 6);
    }
  }

  // The grandstand: stepped seats, rising away from the track, full of people (Halloween: ghosts,
  // pale and glowing, and skeletons, bone), under a roof.
  function standModel(m, tr, sh, pal, th) {
    const s = sh.stand;
    const ca = Math.cos(s.a), sa = Math.sin(s.a);
    const nx = -sa * s.side, ny = ca * s.side; // away from the track
    const rand = seeded(`${tr.id}:crowd`);
    const seat = th.seat;
    const crowd = Array.isArray(th.crowd) ? th.crowd.map((c) => rgb(c)) : null;
    for (let row = 0; row < 4; row++) {
      const off = -s.depth / 2 + 4 + row * 6.5;
      m.box(s.x + nx * off, s.y + ny * off, s.a, s.len / 2, 3.25, 0, 4 + row * 4, seat);
      for (let k = 0; k < 30; k++) {
        const u = -s.len / 2 + 4 + k * 5.6 + (rand() - 0.5);
        const x = s.x + nx * off + ca * u;
        const y = s.y + ny * off + sa * u;
        if (th.crowd === 'ghosts') {
          const ghost = rand() < 0.6;
          rand();
          const z = 4 + row * 4;
          const tall = rand() * 0.8;
          if (ghost) {
            const col = [0.78, 0.86, 0.94];
            m.box(x, y, s.a, 1.7, 1.5, z, z + 2.4, col, 4);
            m.box(x, y, s.a, 1.3, 1.2, z + 2.4, z + 4.6 + tall, col, 4);
            for (const e of [-0.55, 0.55]) m.box(x - nx * 1.25 + ca * e, y - ny * 1.25 + sa * e, s.a, 0.3, 0.12, z + 3.2 + tall, z + 4 + tall, [0.05, 0.05, 0.08], 0, false);
          } else {
            const bone = [0.82, 0.78, 0.66];
            m.box(x, y, s.a, 0.9, 0.7, z, z + 3.4, bone, 4);
            m.box(x, y, s.a, 1.1, 1.1, z + 3.6 + tall * 0.5, z + 5.6 + tall * 0.5, bone, 4);
            for (const e of [-0.45, 0.45]) m.box(x - nx * 1.15 + ca * e, y - ny * 1.15 + sa * e, s.a, 0.38, 0.12, z + 4.4 + tall * 0.5, z + 5.1 + tall * 0.5, [0.05, 0.04, 0.05], 0, false);
          }
          continue;
        }
        const col = crowd ? mix(crowd[Math.floor(rand() * crowd.length)], [1, 1, 1], rand() * 0.2) : hsl(rand(), 0.7, 0.45 + rand() * 0.25);
        m.box(x, y, s.a, 1.6, 1.4, 4 + row * 4, 7.5 + row * 4 + rand(), col);
      }
    }
    const back = s.depth / 2;
    m.box(s.x + nx * back, s.y + ny * back, s.a, s.len / 2, 1.2, 0, 26, seat);
    for (const u of [-s.len / 2 + 2, 0, s.len / 2 - 2]) m.box(s.x - nx * (back - 3) + ca * u, s.y - ny * (back - 3) + sa * u, s.a, 0.8, 0.8, 0, 26, seat);
    m.box(s.x, s.y, s.a, s.len / 2 + 2, s.depth / 2 + 2, 26, 27.5, th.roof ? rgb(th.roof) : pal.accentRgb, 4);
  }

  // Over the start line: a gantry (posts either side, a beam across, five lights), a gothic arch
  // (Halloween's, jack-o'-lanterns on its pinnacles; the castle's), a neon arcade gantry (glowing
  // posts, a rainbow sign), or bamboo posts with a torch on each (the tiki bar's).
  function gantryModel(m, tr, sh, pal, th) {
    const i = sh.startI;
    const a = sh.head[i];
    const span = tr.width / 2 + 12;
    const P = (off, z) => [sh.xs[i] + sh.nx[i] * off, sh.ys[i] + sh.ny[i] * off, z];
    const back = (d) => [sh.xs[i] - Math.cos(a) * d, sh.ys[i] - Math.sin(a) * d];
    const lights = (d, z0, z1) => {
      for (let k = -2; k <= 2; k++) {
        const [x, y] = back(d);
        m.box(x + sh.nx[i] * k * 6, y + sh.ny[i] * k * 6, a, 0.5, 2, z0, z1, [1, 1, 1], 3, false);
      }
    };
    m.lift = sh.zs[i];
    if (th.gantry === 'arch') {
      // The gothic arch: pillars either side with pinnacles, a pointed arch over the road, the beam
      // across with the start lights.
      const stone = th.stone || STONE;
      for (const side of [-1, 1]) {
        const [x, y] = P(span * side, 0);
        m.box(x, y, a, 3, 3, 0, 44, stone);
        m.box(x, y, a, 3.6, 3.6, 36, 38, stone);
        m.cyl(x, y, 44, 47, 3.4, 3.4, stone, 4);
        if (th.pillar === 'lantern') pumpkin(m, x, y, 47, 4.4, a + Math.PI);
      }
      // (Each side an arc, from the pillar up to the point.)
      const R = (span - 3) * 1.4;
      const top = Math.acos(0.4 / 1.4);
      for (const side of [-1, 1]) {
        let prev = null;
        for (let k = 0; k <= 8; k++) {
          const phi = (k / 8) * top;
          const p = P(side * (-0.4 * (span - 3) + R * Math.cos(phi)), 38 + 0.42 * R * Math.sin(phi));
          if (prev) m.limb(prev, p, 1.9, 1.9, stone);
          prev = p;
        }
      }
      const [ax, ay] = P(0, 0);
      if (th.pillar === 'lantern') pumpkin(m, ax, ay, 38 + 0.42 * R * Math.sin(top) + 0.5, 3.2, a + Math.PI);
      m.box(sh.xs[i], sh.ys[i], a, 2.2, span - 2, 30, 36, IRON);
      const [sx, sy] = back(2.4);
      m.box(sx, sy, a, 0.3, span - 6, 31, 35, pal.accentRgb, 4, false);
      lights(3, 31.6, 34.4);
      return;
    }
    if (th.gantry === 'neon') {
      // Glowing posts, pink and blue, a black beam with glowing strips, the lights, and a sign over
      // it in stripes of rainbow.
      for (const side of [-1, 1]) {
        const [x, y] = P(span * side, 0);
        m.box(x, y, a, 2.2, 2.2, 0, 2, [0.08, 0.06, 0.12]);
        m.box(x, y, a, 1.2, 1.2, 2, 40, side < 0 ? [1, 0.35, 0.85] : [0.3, 0.9, 1], 4);
      }
      m.box(sh.xs[i], sh.ys[i], a, 2.4, span + 2, 30, 38, [0.08, 0.05, 0.14]);
      for (const [d, col] of [[2.6, [1, 0.35, 0.85]], [-2.6, [0.3, 0.9, 1]]]) {
        const [x, y] = back(d);
        m.box(x, y, a, 0.3, span, 37.2, 38.2, col, 4, false);
        m.box(x, y, a, 0.3, span, 29.8, 30.8, col, 4, false);
      }
      lights(3.2, 32.2, 35.8);
      RAINBOW.forEach((c, k) => {
        const [x, y] = back(1);
        m.box(x, y, a, 0.6, span - 8, 38 + k * 1.3, 39.3 + k * 1.3, rgb(c), 4);
      });
      return;
    }
    // The plain gantry, or the tiki bar's: bamboo posts (a torch on each: see fp.load) and a beam.
    const post = th.post;
    const beam = th.beam === THEME.beam ? [0.15, 0.15, 0.17] : rgb(th.beam);
    const thick = th.gantry === 'torch' ? 2.4 : 1.8;
    for (const side of [-1, 1]) m.box(sh.xs[i] + sh.nx[i] * span * side, sh.ys[i] + sh.ny[i] * span * side, a, thick, thick, 0, 36, post);
    m.box(sh.xs[i], sh.ys[i], a, 2.4, span + 2, 30, 38, beam);
    const [sx, sy] = back(2.6);
    m.box(sx, sy, a, 0.3, span - 4, 31, 37, pal.accentRgb, 4, false);
    lights(3.2, 32.2, 35.8);
  }

  // The figure eight's bridge (the deck itself is part of the road: roadModel): its slab's edges
  // and underside, a parapet and railing each side, piers (never on the road below) and a wall at
  // each end where the embankment stops.
  function bridgeModel(m, tr, sh, concrete, trim) {
    if (!sh.hilly || !sh.deck.some((d) => d)) return;
    const span = sh.top - 2.5;
    const T = 4; // the slab's thickness
    const rail = sh.top - 4;
    const under = concrete.map((c) => c * 0.55);
    const P = (k, off, z) => [sh.xs[k] + sh.nx[k] * off, sh.ys[k] + sh.ny[k] * off, z];
    const below = [];
    for (let k = 0; k < sh.N; k++) below.push(k);
    const clearOfRoad = (x, y, z) => below.every((k) => sh.zs[k] > z - 12 || (sh.xs[k] - x) ** 2 + (sh.ys[k] - y) ** 2 > (rail + 4) ** 2);
    for (let i = 0; i < sh.N; i++) {
      const j = (i + 1) % sh.N;
      const prev = (i - 1 + sh.N) % sh.N;
      if (!sh.deck[i]) continue;
      const zi = sh.zs[i];
      if (!sh.deck[prev] || !sh.deck[j]) m.quad(P(i, -span, zi), P(i, span, zi), P(i, span, 0), P(i, -span, 0), concrete);
      if (!sh.deck[j]) continue;
      const zj = sh.zs[j];
      for (const side of [-1, 1]) {
        m.quad(P(i, span * side, zi - 0.1), P(j, span * side, zj - 0.1), P(j, span * side, zj - T), P(i, span * side, zi - T), concrete);
        // The parapet, posts and a rail on them.
        m.quad(P(i, rail * side, zi), P(j, rail * side, zj), P(j, rail * side, zj + 2.6), P(i, rail * side, zi + 2.6), concrete);
        m.quad(P(i, (rail + 1.2) * side, zi), P(j, (rail + 1.2) * side, zj), P(j, (rail + 1.2) * side, zj + 2.6), P(i, (rail + 1.2) * side, zi + 2.6), concrete);
        m.quad(P(i, rail * side, zi + 2.6), P(j, rail * side, zj + 2.6), P(j, (rail + 1.2) * side, zj + 2.6), P(i, (rail + 1.2) * side, zi + 2.6), concrete);
        if (i % 2 === 0) {
          const [x, y] = P(i, (rail + 0.6) * side, 0);
          m.box(x, y, sh.head[i], 0.4, 0.4, zi + 2.6, zi + 7, trim);
        }
        m.quad(P(i, (rail + 0.6) * side, zi + 6.2), P(j, (rail + 0.6) * side, zj + 6.2), P(j, (rail + 0.6) * side, zj + 7.2), P(i, (rail + 0.6) * side, zi + 7.2), trim);
      }
      m.quad(P(i, -span, zi - T), P(j, -span, zj - T), P(j, span, zj - T), P(i, span, zi - T), under);
      // Piers every so often: a pair, wherever there's no road under them.
      if (i % 5 === 0) {
        for (const side of [-1, 1]) {
          const [x, y] = P(i, (span - 5) * side, 0);
          if (clearOfRoad(x, y, zi)) m.box(x, y, sh.head[i], 2.4, 2.4, 0, zi - T, under.map((c) => c * 1.3));
        }
      }
    }
  }

  // A jack-o'-lantern (Halloween's arch has them on its pinnacles), its face lit (tint 4).
  function pumpkin(m, x, y, z, r, a) {
    const orange = [0.85, 0.36, 0.07];
    m.cyl(x, y, z, z + r * 0.55, r * 0.7, r, orange, 8);
    m.cyl(x, y, z + r * 0.55, z + r * 1.1, r, r * 0.6, orange, 8);
    m.box(x, y, 0, r * 0.1, r * 0.1, z + r * 1.1, z + r * 1.45, [0.25, 0.4, 0.12]);
    const fx = Math.cos(a), fy = Math.sin(a);
    const lit = [1, 0.82, 0.25];
    const at = (out, side) => [x + fx * out - fy * side, y + fy * out + fx * side];
    for (const sd of [-1, 1]) {
      const [ex, ey] = at(r * 0.93, sd * r * 0.36);
      m.box(ex, ey, a, 0.2, r * 0.17, z + r * 0.62, z + r * 0.86, lit, 4, false);
    }
    const [mx, my] = at(r * 0.97, 0);
    m.box(mx, my, a, 0.2, r * 0.46, z + r * 0.24, z + r * 0.42, lit, 4, false);
  }
  function hsl(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }

  // ---------- The cars ----------
  //
  // Each driver picks their car (games/trackRacing.js: the body, a paint, a stripe, one extra),
  // and every screen builds it from the same few boxes: in 3D from the car, and from above on the
  // TV, the maps and the garage's preview (the same model, drawn flat: see flatModel). Nose along
  // +x, its right side +y; the body in the paint (tint 1, so one model does any colour), the
  // stripe and the extras in their own colours.
  const PLAIN = { body: 'sports', paint: null, stripe: null, extra: 'none', n: 0 };
  const BODY_NAMES = { sports: '🏎️ Sports car', pickup: '🛻 Pickup', van: '🚐 Minibus', buggy: '🏖️ Beach buggy', hotrod: '🔥 Hot rod', trolley: '🛒 Trolley' };
  const EXTRA_NAMES = { none: 'Nothing', spoiler: '✈️ Spoiler', keg: '🛢️ A keg', flames: '🔥 Flames', number: '#️⃣ Your number', cone: '🚧 Traffic cone' };
  const lookOf = (id, s = PB.state) => s?.game?.looks?.[id] || PLAIN;
  const paintOf = (id, s = PB.state) => lookOf(id, s).paint || PB.look(id).color;
  // A player's avatar and colour (PB.look), kept till the next state: it's asked for every car,
  // every frame, and makes a new object each time.
  let looksFrom = null;
  const looks = new Map();
  function lookNow(id) {
    if (looksFrom !== PB.state) { looksFrom = PB.state; looks.clear(); }
    let l = looks.get(id);
    if (!l) looks.set(id, (l = PB.look(id)));
    return l;
  }

  const WHITE = [1, 1, 1];
  const GLASS = [0.08, 0.1, 0.16];
  const TYRE = [0.07, 0.07, 0.08];
  const CHROME = [0.72, 0.74, 0.78];
  const DARK = [0.13, 0.13, 0.15];
  // Tail lights (tint 2: the brake lights) and headlights (tint 4: lit at night), both sides.
  function lights(m, tail, nose, y, z0, z1) {
    for (const s of [-y, y]) m.box(tail - 0.15, s, 0, 0.2, 1.6, z0, z1, [1, 0.3, 0.25], 2, false);
    for (const s of [-y, y]) m.box(nose + 0.15, s, 0, 0.2, 1.5, z0 - 0.4, z1 - 0.4, [1, 0.97, 0.85], 4, false);
  }
  const wheels = (m, spots) => { for (const [x, y, hl, hw, h] of spots) m.box(x, y, 0, hl, hw, 0, h, TYRE); };
  // Each body, built into m; what it says back is where the extras go: the roof (x, z, half its
  // length and width), the tail (x) and how high a spoiler stands on it, the bonnet (from x0 to x1
  // at z, half as wide) and the sides (for flames), where a keg rides, the back for a number, and
  // the flat tops a stripe runs over ([x, half length, z, half width]).
  const BODIES = {
    sports(m, look) {
      m.box(0, 0, 0, 14, 7, 1.6, 5.6, WHITE, 1);
      m.box(10.5, 0, 0, 4.5, 6.2, 1.6, 4.4, WHITE, 1);
      m.box(-2, 0, 0, 6.5, 5.6, 5.6, 9.4, GLASS);
      m.box(-2.5, 0, 0, 5, 5.7, 9.4, 9.9, WHITE, 1);
      if (look.extra !== 'spoiler') {
        m.box(-13.4, 0, 0, 1.4, 7.4, 8, 9, WHITE, 1);
        for (const y of [-4.5, 4.5]) m.box(-13, y, 0, 0.6, 0.6, 5.6, 8, TYRE);
      }
      wheels(m, [[-8.5, -7.4, 3.3, 1.5, 5], [8.5, -7.4, 3.3, 1.5, 5], [-8.5, 7.4, 3.3, 1.5, 5], [8.5, 7.4, 3.3, 1.5, 5]]);
      lights(m, -14, 15, 4.6, 3.6, 5.2);
      m.box(15.1, 0, 0, 0.2, 4.5, 2, 3.4, [0.12, 0.12, 0.14], 0, false);
      return { roof: [-2.5, 9.9, 5, 5.7], tail: -14, deck: 5.6, hood: [4.6, 14, 5.6, 6], side: [-12, 12, 2, 5.4, 7], keg: [-2.5, 9.9, true], back: [-14, 3.4], tops: [[-2.5, 5, 9.9, 5.7], [9.3, 4.7, 5.6, 7], [-11, 3, 5.6, 7]] };
    },
    // A cab up front and an open bed behind, on big tyres.
    pickup(m) {
      m.box(0, 0, 0, 15, 7, 2.2, 5.4, WHITE, 1);
      m.box(10.5, 0, 0, 4.5, 6.8, 5.4, 6.8, WHITE, 1);
      m.box(2.5, 0, 0, 3.5, 6.8, 5.4, 11.6, WHITE, 1);
      m.box(2.5, 0, 0, 3.6, 6.9, 7.6, 10.8, GLASS);
      m.box(-8.4, 0, 0, 6.6, 5.9, 5.4, 5.6, DARK);
      for (const y of [-6.5, 6.5]) m.box(-8.4, y, 0, 6.6, 0.5, 5.4, 8, WHITE, 1);
      m.box(-14.6, 0, 0, 0.4, 7, 5.4, 8, WHITE, 1);
      m.box(15.1, 0, 0, 0.3, 5.5, 2.4, 4.6, CHROME, 0, false);
      wheels(m, [[-9, -7.6, 3.8, 1.8, 6], [9, -7.6, 3.8, 1.8, 6], [-9, 7.6, 3.8, 1.8, 6], [9, 7.6, 3.8, 1.8, 6]]);
      lights(m, -15, 15, 5, 4.6, 6.2);
      return { roof: [2.5, 11.6, 3.5, 6.8], tail: -15, deck: 8, hood: [6, 14.6, 6.8, 6.4], side: [-14, 14, 2.6, 5.2, 7], keg: [-8.4, 5.6, false], back: [-15, 6.6], tops: [[2.5, 3.5, 11.6, 6.8], [10.5, 4.5, 6.8, 6.8]] };
    },
    // A tall box with a band of windows all round.
    van(m) {
      m.box(0, 0, 0, 14.5, 7, 1.8, 12.6, WHITE, 1);
      m.box(0.8, 0, 0, 13.9, 7.1, 7.8, 11.2, GLASS);
      m.box(-14.6, 0, 0, 0.1, 5, 8, 11, GLASS, 0, false);
      m.box(14.6, 0, 0, 0.3, 6, 2.2, 4.4, [0.85, 0.85, 0.88], 0, false);
      wheels(m, [[-9.5, -7.3, 3, 1.4, 4.6], [9.5, -7.3, 3, 1.4, 4.6], [-9.5, 7.3, 3, 1.4, 4.6], [9.5, 7.3, 3, 1.4, 4.6]]);
      lights(m, -14.5, 14.5, 5, 4.8, 6.6);
      return { roof: [-0.5, 12.6, 11, 6.6], tail: -14.5, deck: 12.6, hood: [9, 14.2, 12.6, 6], side: [-13, 13, 2.4, 7.4, 7], keg: [-0.5, 12.6, true], back: [-14.5, 4], tops: [[0, 14.5, 12.6, 7]] };
    },
    // An open tub with a roll bar, fat tyres at the back, the engine out in the open.
    buggy(m) {
      m.box(-1, 0, 0, 11, 6, 2.6, 5.4, WHITE, 1);
      m.box(11, 0, 0, 3.6, 5, 2.6, 4.6, WHITE, 1);
      for (const x of [-4, 2.5]) m.box(x, 0, 0, 2, 4.4, 5.4, 6.6, DARK);
      for (const x of [-4, 2.5]) m.box(x - 1.8, 0, 0, 0.5, 4.4, 6.6, 9.6, DARK);
      for (const y of [-5, 5]) m.box(-6.8, y, 0, 0.5, 0.5, 5.4, 11.4, DARK);
      m.box(-6.8, 0, 0, 0.55, 5.5, 11, 11.8, DARK);
      m.box(-12.6, 0, 0, 1.6, 3.2, 3, 6.4, CHROME);
      wheels(m, [[9.5, -6.8, 2.8, 1.4, 4.6], [9.5, 6.8, 2.8, 1.4, 4.6], [-8, -7.4, 4.2, 2.2, 7.2], [-8, 7.4, 4.2, 2.2, 7.2]]);
      lights(m, -12, 14.6, 3.8, 3.6, 5);
      return { roof: [-6.8, 11.8, 0.6, 5.5], tail: -12, deck: 5.4, hood: [6, 14.4, 5.4, 4.6], side: [-11, 9, 2.8, 5.2, 6], keg: [-9.6, 6.4, false], back: [-14.3, 4.6], tops: [[-1, 11, 5.4, 6], [11, 3.6, 4.6, 5]] };
    },
    // A long bonnet with the engine poking out of it, a chopped little cab, big wheels at the back.
    hotrod(m) {
      m.box(0, 0, 0, 14, 5.2, 2.2, 5.6, WHITE, 1);
      m.box(6, 0, 0, 8, 4.4, 5.6, 7.2, WHITE, 1);
      m.box(4.8, 0, 0, 3, 3, 7.2, 9.2, CHROME);
      for (const y of [-1.6, 1.6]) m.cyl(3, y, 9.2, 11.2, 0.7, 0.7, CHROME, 6);
      m.box(14.3, 0, 0, 0.4, 3.6, 2.4, 7, CHROME);
      for (const y of [-5.8, 5.8]) m.box(3, y, 0, 6.5, 0.5, 2, 2.9, CHROME);
      m.box(-7, 0, 0, 4.5, 5.2, 5.6, 11, WHITE, 1);
      m.box(-6.6, 0, 0, 4.2, 5.3, 8, 10.2, GLASS);
      for (const y of [-6.4, 6.4]) m.box(-8.5, y, 0, 4.6, 1.4, 4.4, 7.6, WHITE, 1);
      wheels(m, [[10, -6, 2.6, 1.3, 4.6], [10, 6, 2.6, 1.3, 4.6], [-8.5, -6.6, 4, 2, 7.2], [-8.5, 6.6, 4, 2, 7.2]]);
      lights(m, -14, 14.5, 3.4, 3.6, 5.2);
      return { roof: [-7, 11, 4.5, 5.2], tail: -14, deck: 5.6, hood: [-1.5, 13.6, 7.2, 4.4], side: [-12, 13, 2.6, 5.4, 5.2], keg: [-7, 11, true], back: [-14, 3.4], tops: [[-7, 4.5, 11, 5.2], [10.5, 3.5, 7.2, 4.4]] };
    },
    // A shopping trolley: a wire basket on castors, plastic panels and handle in the paint, and
    // its driver sitting in it in a helmet.
    trolley(m) {
      for (const y of [-5, 5]) m.box(0, y, 0, 12, 0.4, 1.8, 2.4, CHROME);
      m.box(1, 0, 0, 11.6, 6.4, 4.6, 5.2, WHITE, 1);
      for (const y of [-6.5, 6.5]) m.box(1, y, 0, 11.6, 0.25, 5.2, 8.6, WHITE, 1);
      m.box(12.5, 0, 0, 0.25, 6.4, 5.2, 8.6, WHITE, 1);
      for (let x = -10; x <= 12; x += 2.75) for (const y of [-6.5, 6.5]) m.box(x, y, 0, 0.18, 0.18, 8.6, 12.8, CHROME, 0, false);
      for (let y = -5.2; y <= 5.2; y += 2.6) for (const x of [-10.6, 12.6]) m.box(x, y, 0, 0.18, 0.18, 5.2, 12.8, CHROME, 0, false);
      for (const z of [10.6, 12.8]) {
        for (const y of [-6.5, 6.5]) m.box(1, y, 0, 11.7, 0.3, z - 0.3, z + 0.3, CHROME);
        for (const x of [-10.6, 12.6]) m.box(x, 0, 0, 0.3, 6.6, z - 0.3, z + 0.3, CHROME);
      }
      for (const y of [-5.5, 5.5]) m.box(-12, y, 0, 1.4, 0.3, 12.8, 13.4, CHROME);
      m.box(-13.4, 0, 0, 0.6, 6.4, 12.8, 14.2, WHITE, 1);
      m.cyl(-1.5, 0, 5.2, 10, 3.4, 3.4, [0.85, 0.66, 0.5], 8);
      m.cyl(-1.5, 0, 10, 13.6, 3, 3, WHITE, 8, 1);
      m.box(1.4, 0, 0, 0.3, 2.4, 11.2, 12.6, GLASS);
      wheels(m, [[-10, -5, 1.6, 0.8, 2.2], [11, -5, 1.6, 0.8, 2.2], [-10, 5, 1.6, 0.8, 2.2], [11, 5, 1.6, 0.8, 2.2]]);
      lights(m, -10.6, 12.6, 4, 5.6, 7.4);
      return { roof: [6, 12.8, 5, 6.4], tail: -10.6, deck: 13.4, hood: [4, 12.6, 5.2, 5.6], side: [-10, 12, 5.4, 8.4, 6.5], keg: [6.5, 5.2, false], back: [-10.8, 7], tops: [[1, 11.6, 5.2, 6.4], [-13.4, 0.6, 14.2, 6.4]] };
    },
  };

  // A number in seven-segment bars, in a square (u across, v up) centred on 0, ~3 tall each.
  const SEGS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  function digitBars(n, put) {
    const text = String(n);
    const w = 1.5, h = 1.4, t = 0.28; // half width, half height, half thickness
    const bars = { a: [0, h, w, t], d: [0, -h, w, t], g: [0, 0, w, t], f: [-w, h / 2, t, h / 2 + t], b: [w, h / 2, t, h / 2 + t], e: [-w, -h / 2, t, h / 2 + t], c: [w, -h / 2, t, h / 2 + t] };
    [...text].forEach((ch, k) => {
      const du = (k - (text.length - 1) / 2) * (w * 2 + 1.1);
      for (const seg of SEGS[ch] || '') { const [u, v, hu, hv] = bars[seg]; put(u + du, v, hu, hv); }
    });
  }

  // The whole car: its body, the stripe, the extra. Its shadow too, but not for the views from
  // above (they draw their own, off to one side).
  function carModel(look = PLAIN, { shadow = true } = {}) {
    const m = mesher();
    if (shadow) m.quad([-15, -9, 0.15], [16, -9, 0.15], [16, 9, 0.15], [-15, 9, 0.15], [0.05, 0.05, 0.06]);
    const at = (BODIES[look.body] || BODIES.sports)(m, look);
    const stripe = look.stripe ? rgb(look.stripe) : null;
    // Twin stripes nose to tail over every flat top.
    if (stripe) for (const [x, hl, z, hw] of at.tops) for (const y of [-hw * 0.28, hw * 0.28]) m.box(x, y, 0, hl + 0.05, hw * 0.13, z, z + 0.12, stripe);
    const [rx, rz, rl, rw] = at.roof;
    if (look.extra === 'spoiler') {
      const wing = stripe || DARK;
      const x = at.tail + 1.4;
      for (const y of [-4, 4]) m.box(x, y, 0, 0.5, 0.5, at.deck, at.deck + 3.4, DARK);
      m.box(x - 0.2, 0, 0, 1.8, 7.6, at.deck + 3.2, at.deck + 4.2, wing);
      for (const y of [-7.6, 7.6]) m.box(x - 0.2, y, 0, 1.9, 0.2, at.deck + 2.4, at.deck + 4.6, DARK);
    } else if (look.extra === 'keg') {
      // Lying along the car on a roof rack (or in the back), so from behind it's a keg's end.
      const [kx, kz, rack] = at.keg;
      if (rack) {
        for (const y of [-rw + 0.6, rw - 0.6]) m.box(rx, y, 0, rl, 0.35, kz, kz + 1, DARK);
        for (const x of [rx - rl + 1, rx + rl - 1]) m.box(x, 0, 0, 0.35, rw - 0.4, kz + 0.6, kz + 1, DARK);
      }
      const z = kz + (rack ? 1 : 0.1) + 2.7;
      m.drum(kx, 0, z, 3.6, 2.7, CHROME, 10);
      for (const x of [kx - 2.6, kx + 2.6]) m.drum(x, 0, z, 0.4, 2.85, DARK, 10);
      m.box(kx, 0, 0, 0.6, 0.6, z + 2.6, z + 3.6, DARK);
    } else if (look.extra === 'cone') {
      const z = rz + 0.05;
      const orange = [1, 0.42, 0.08];
      m.box(rx, 0, 0, 2.6, 2.6, z, z + 0.6, orange);
      m.cyl(rx, 0, z + 0.6, z + 2.6, 2.1, 1.55, orange, 8);
      m.cyl(rx, 0, z + 2.6, z + 3.7, 1.55, 1.15, WHITE, 8);
      m.cyl(rx, 0, z + 3.7, z + 6.4, 1.15, 0, orange, 8);
    } else if (look.extra === 'number') {
      // A white roundel on the roof, and a plate on the back: the driver's seat number.
      const n = look.n || 1;
      const z = rz + 0.05;
      m.box(rx, 0, 0, Math.min(rl, 3.4), Math.min(rw, 2.6 + String(n).length * 1.4), z, z + 0.15, WHITE);
      digitBars(n, (u, v, hu, hv) => m.box(rx + v, u, 0, hv, hu, z + 0.15, z + 0.3, DARK));
      const [bx, bz] = at.back;
      m.box(bx - 0.1, 0, 0, 0.12, 1.4 + String(n).length * 1.5, bz - 2, bz + 2, WHITE);
      digitBars(n, (u, v, hu, hv) => m.box(bx - 0.3, u, 0, 0.1, hu, bz + v - hv, bz + v + hv, DARK));
    } else if (look.extra === 'flames') {
      // Flames licking back over the bonnet, and along both sides.
      const [x0, x1, z, hw] = at.hood;
      const len = x1 - x0;
      const up = shade(0, 0, 1);
      for (let k = 0; k < 5; k++) {
        const y = -hw * 0.8 + (k * hw * 1.6) / 4;
        const reach = len * (k % 2 ? 0.62 : 0.92);
        const bend = (k - 2) * 0.5;
        m.tri([x1 - 0.3, y - 1.3, z + 0.1], [x1 - 0.3, y + 1.3, z + 0.1], [x1 - reach, y + bend, z + 0.1], [1 * up, 0.42 * up, 0.05 * up]);
        m.tri([x1 - 0.3, y - 0.6, z + 0.16], [x1 - 0.3, y + 0.6, z + 0.16], [x1 - reach * 0.55, y + bend * 0.6, z + 0.16], [1 * up, 0.85 * up, 0.2 * up]);
      }
      const [sx0, sx1, sz0, sz1, sw] = at.side;
      for (const y of [-sw - 0.06, sw + 0.06]) {
        for (let k = 0; k < 3; k++) {
          const zc = sz0 + ((k + 0.5) * (sz1 - sz0)) / 3;
          const reach = (sx1 - sx0) * (k === 1 ? 0.75 : 0.5);
          m.tri([sx1, y, zc - (sz1 - sz0) / 6], [sx1, y, zc + (sz1 - sz0) / 6], [sx1 - reach, y, zc + 0.6], [0.95, 0.4, 0.05]);
        }
      }
    }
    return { v: new Float32Array(m.v), top: Math.max(rz, ...at.tops.map((t) => t[2])) + ({ keg: 7, cone: 6.4, spoiler: 0 }[look.extra] || 0) };
  }
  const meshKey = (look) => `${look.body}:${look.stripe}:${look.extra}:${look.extra === 'number' ? look.n : ''}`;

  // A model drawn with a 2D canvas: each triangle flat, back to front. `place(x, y, z, out, k)`
  // puts a corner on the canvas (out[k], out[k + 1]) and says how far off it is. The colours are
  // worked out once (the paint in, for tint 1); each frame only the corners move.
  function flatModel(v, paint) {
    const n = v.length / 21;
    const tint = rgb(paint, [0.9, 0.3, 0.3]);
    const fill = [];
    for (let i = 0; i < n; i++) {
      const o = i * 21;
      const t = v[o + 6];
      let col = [v[o + 3], v[o + 4], v[o + 5]];
      if (t > 1.5 && t < 2.5) col = mix(col.map((q) => q * 0.45), [1, 0.15, 0.1], 0.35);
      else if (t > 0.5 && t < 1.5) col = col.map((q, j) => q * tint[j]);
      fill.push(hex(col));
    }
    const order = Array.from({ length: n }, (_, i) => i);
    const fm = { v, n, fill, order, xy: new Float32Array(n * 6), depth: new Float32Array(n), area: new Float32Array(n) };
    fm.cmp = (a, b) => fm.depth[b] - fm.depth[a];
    return fm;
  }
  function drawFlat(c, fm, place) {
    const { v, xy, depth, area } = fm;
    for (let i = 0; i < fm.n; i++) {
      const o = i * 21;
      depth[i] = (place(v[o], v[o + 1], v[o + 2], xy, i * 6) + place(v[o + 7], v[o + 8], v[o + 9], xy, i * 6 + 2) + place(v[o + 14], v[o + 15], v[o + 16], xy, i * 6 + 4)) / 3;
      const k = i * 6;
      area[i] = (xy[k + 2] - xy[k]) * (xy[k + 5] - xy[k + 1]) - (xy[k + 4] - xy[k]) * (xy[k + 3] - xy[k + 1]);
    }
    fm.order.sort(fm.cmp);
    c.lineWidth = 0.6;
    c.lineJoin = 'round';
    for (const i of fm.order) {
      if (Math.abs(area[i]) < 0.05) continue; // (seen edge on)
      const k = i * 6;
      c.fillStyle = c.strokeStyle = fm.fill[i];
      c.beginPath();
      c.moveTo(xy[k], xy[k + 1]);
      c.lineTo(xy[k + 2], xy[k + 3]);
      c.lineTo(xy[k + 4], xy[k + 5]);
      c.closePath();
      c.fill();
      c.stroke(); // (so the seams don't show)
    }
  }

  // Each car seen from above, painted once into a little picture (redone when its look or paint
  // changes: checked once per screen drawn, not every frame).
  const SPRITE_K = 4; // pixels a unit
  const SPRITE = { x: 18, y: 12 }; // half its size, in units
  const sprites = {}; // id -> { key, cv, gen }
  let spriteGen = 0;
  function spriteOf(id) {
    const have = sprites[id];
    if (have && have.gen === spriteGen) return have.cv;
    const look = lookOf(id);
    const paint = paintOf(id);
    const key = `${meshKey(look)}:${paint}`;
    if (have && have.key === key) { have.gen = spriteGen; return have.cv; }
    const cv = document.createElement('canvas');
    cv.width = SPRITE.x * 2 * SPRITE_K;
    cv.height = SPRITE.y * 2 * SPRITE_K;
    const fm = flatModel(carModel(look, { shadow: false }).v, paint);
    drawFlat(cv.getContext('2d'), fm, (x, y, z, out, k) => {
      out[k] = (x + SPRITE.x) * SPRITE_K;
      out[k + 1] = (y + SPRITE.y) * SPRITE_K;
      return -z;
    });
    sprites[id] = { key, cv, gen: spriteGen };
    return cv;
  }

  // Little pictures of the cars in the lists (bets, standings, results): <canvas data-carpic>.
  function carPic(id) { return `<canvas class="tr-carpic" data-carpic="${esc(id)}" width="${SPRITE.x * 2 * 2}" height="${SPRITE.y * 2 * 2}" aria-hidden="true"></canvas>`; }
  function paintPics(root = document) {
    root.querySelectorAll('canvas[data-carpic]').forEach((cv) => {
      const c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      c.drawImage(spriteOf(cv.dataset.carpic), 0, 0, cv.width, cv.height);
    });
  }

  // The sky all the way round: the room's colours, hills, a treeline, a few lights far off.
  // The sky's colours: the room's, or mostly the weather's.
  function skyColours(pal, wx) {
    const top = mix(pal.bg, [0, 0, 0], 0.2);
    const horizon = mix(mix(pal.card2, pal.accentRgb, 0.22), [1, 1, 1], 0.12);
    if (!wx.sky) return [top, horizon];
    return [mix(top, rgb(wx.sky[0]), 0.8), mix(horizon, rgb(wx.sky[1]), 0.8)];
  }
  // Halloween's sky (after the room's haunted hill): purple overhead going green at the horizon,
  // stars, a big full moon low down with bats across it, hills with dead trees and crosses on them,
  // and the haunted house on its hill, its windows lit. 2048 across (more of it's seen up close).
  // (The moon rises a little off the start's heading, so it's there as the lights go out.)
  const MOON = { az: 1.9, el: 0.135, r: 0.085 };
  const moonFor = (tr) => { MOON.az = (((tr.start[2] + 0.3) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); };
  function hauntedSky(pal, wx) {
    const W = 2048;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 256;
    const c = cv.getContext('2d');
    const kx = W / (Math.PI * 2); // pixels a radian, round
    const ky = 256 / 0.55; // ...and up (see GROUND_FS)
    const fog = !!wx.mute;
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, wx.sky[0]);
    g.addColorStop(0.45, fog ? '#2a2040' : '#1a0b2e');
    g.addColorStop(0.75, fog ? '#40345a' : '#3a1d4c');
    g.addColorStop(0.92, fog ? '#4a5254' : '#2c4438');
    g.addColorStop(1, wx.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, 256);
    const rand = seeded('haunted-sky');
    if (!fog) {
      for (let k = 0; k < 140; k++) {
        c.fillStyle = `rgba(232, 224, 255, ${0.2 + rand() * 0.55})`;
        c.fillRect(rand() * W, rand() * 170, 1.5, 1.5);
      }
    }
    // The moon: a glow round it, the moon, its seas, a wisp of cloud (twice near the join, so it
    // wraps round).
    for (const wrap of [-W, 0, W]) {
    c.save();
    c.translate(MOON.az * kx + wrap, 256 - MOON.el * ky);
    c.scale(kx, ky);
    const halo = c.createRadialGradient(0, 0, MOON.r * 0.8, 0, 0, MOON.r * 4);
    halo.addColorStop(0, `rgba(255, 240, 210, ${fog ? 0.32 : 0.45})`);
    halo.addColorStop(0.35, 'rgba(220, 190, 255, 0.12)');
    halo.addColorStop(1, 'rgba(200, 160, 255, 0)');
    c.fillStyle = halo;
    c.fillRect(-MOON.r * 4, -MOON.r * 4, MOON.r * 8, MOON.r * 8);
    c.fillStyle = fog ? '#e8e0cc' : '#fff2cc';
    c.beginPath();
    c.arc(0, 0, MOON.r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(214, 196, 150, 0.6)';
    for (const [x, y, r] of [[-0.3, 0.25, 0.18], [0.3, -0.2, 0.24], [0.18, 0.4, 0.1], [-0.36, -0.3, 0.12], [0.48, 0.14, 0.08]]) {
      c.beginPath();
      c.arc(x * MOON.r, y * MOON.r, r * MOON.r, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(18, 10, 30, 0.85)';
    c.beginPath();
    c.ellipse(-0.02, -0.035, 0.16, 0.012, 0, 0, Math.PI * 2);
    c.ellipse(0.06, -0.062, 0.1, 0.008, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    const [up, down] = batSprites();
    for (const [da, de, sz, k] of [[-0.06, 0.03, 14, 0], [0.05, -0.01, 18, 1], [0.1, 0.07, 10, 0], [-0.12, 0.09, 9, 1], [0.02, 0.12, 8, 0]]) {
      c.drawImage(k ? up : down, (MOON.az + da) * kx + wrap - sz / 2, 256 - (MOON.el + de) * ky - sz / 4, sz, sz / 2);
    }
    }
    // The hills (whole numbers of waves round, so the join doesn't show).
    const hill = (x, base, amp, waves, phase) => {
      const t = (x / W) * Math.PI * 2;
      return 256 - base - amp * (0.6 * Math.sin(t * waves[0] + phase) + 0.3 * Math.sin(t * waves[1] + phase * 2) + 0.1 * Math.sin(t * waves[2]));
    };
    const ridge = (col, ...a) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, 256);
      for (let x = 0; x <= W; x += 8) c.lineTo(x, hill(x, ...a));
      c.lineTo(W, 256);
      c.fill();
    };
    const far = [30, 22, [2, 5, 13], 1];
    const near = [12, 10, [3, 7, 31], 4];
    ridge(fog ? '#3a3446' : '#1a1028', ...far);
    // The haunted house on its hill (the room's, shrunk: 0.7 as wide as high, as the sky's stretched).
    const hx = ((MOON.az + 0.32) * kx) % (W - 80) + 40;
    const hy = hill(hx, ...far) + 4;
    c.fillStyle = fog ? '#363042' : '#140c20';
    c.beginPath();
    c.ellipse(hx, hy + 6, 60, 22, 0, Math.PI, 0);
    c.fill();
    c.save();
    c.translate(hx, hy - 4);
    c.scale(0.2 * 0.7, 0.2);
    c.translate(-1090, -500);
    c.fillStyle = fog ? '#2e2838' : '#0c0814';
    c.fill(new Path2D('M980 300 H1200 V500 H980Z M970 304 L1090 230 L1210 304Z M960 240 H1020 V500 H960Z M952 244 L990 150 L1028 244Z M1150 220 H1168 V280 H1150Z M1050 210 H1130 V236 H1050Z M988 150 V118 H992 V150Z'));
    for (const [x, y, k] of [[972, 270, 1], [1000, 330, 1], [1060, 330, 2], [1120, 330, 1], [1160, 330, 0], [1000, 410, 1], [1080, 410, 1], [1150, 410, 2], [972, 420, 0]]) {
      c.fillStyle = ['#1a1024', '#ffb040', '#7cff9a'][k];
      c.fillRect(x, y, 26, 38);
    }
    c.fillStyle = '#ffb040';
    c.fillRect(1078, 460, 24, 40);
    c.restore();
    ridge(fog ? '#2c2836' : '#0e0816', ...near);
    // Dead trees and crosses along the nearer hills.
    c.strokeStyle = c.fillStyle = fog ? '#24202c' : '#07040b';
    c.lineCap = 'round';
    for (let k = 0; k < 22; k++) {
      const x = rand() * W;
      if (Math.abs(x - hx) < 70 || Math.abs(x - MOON.az * kx) < 30) continue;
      const y = hill(x, ...near) + 2;
      const s = 0.5 + rand() * 0.7;
      if (rand() < 0.35) {
        c.fillRect(x - 0.8, y - 9 * s, 1.6, 9 * s);
        c.fillRect(x - 2.6 * s, y - 7 * s, 5.2 * s, 1.4);
        continue;
      }
      const h = 26 * s;
      c.lineWidth = 2.4 * s;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + (rand() - 0.5) * 6, y - h * 0.5, x + (rand() - 0.5) * 5, y - h);
      for (const [f, dx, dy] of [[0.55, -10, -10], [0.7, 9, -12], [0.85, -6, -8], [0.6, 12, -4]]) {
        const bx = x;
        const by = y - h * f;
        c.moveTo(bx, by);
        c.quadraticCurveTo(bx + dx * s * 0.5, by + dy * s * 0.3, bx + dx * s * 0.7 * 1.4, by + dy * s);
      }
      c.stroke();
    }
    // Lights in the valley: a lantern or two, the odd green glow.
    for (let k = 0; k < 30; k++) {
      c.fillStyle = rand() < 0.75 ? `rgba(255, 150, 50, ${0.4 + rand() * 0.4})` : `rgba(124, 255, 154, ${0.4 + rand() * 0.4})`;
      c.fillRect(rand() * W, 240 + rand() * 10, 2, 2);
    }
    return cv;
  }

  // The sky all round (1024 across: a radian's 1024 / 2π pixels, and 256 up to 0.55 of a radian
  // above the horizon: see GROUND_FS). The venue's skyline (THEME.sky) on the horizon: hills, a
  // city's lights, the sea, mesas, snowy peaks, a castle's towers. Or a sky of its own (Halloween's,
  // space's).
  function skyCanvas(pal, wx, th = themeOf()) {
    const own = th.sky?.draw?.(pal, wx);
    if (own) return own;
    const line = th.sky?.skyline || 'hills';
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 256;
    const c = cv.getContext('2d');
    const [top, horizon] = skyColours(pal, wx);
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(top));
    g.addColorStop(0.6, hex(mix(top, horizon, 0.55)));
    g.addColorStop(1, hex(horizon));
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 256);
    const rand = seeded('sky');
    const stars = !wx.sky || wx.lamps ? 1 : 0; // (none through cloud, fog or a sunset)
    for (let k = 0; k < 60; k++) {
      c.fillStyle = `rgba(255, 255, 255, ${(0.15 + rand() * 0.45) * stars})`;
      c.fillRect(rand() * 1024, rand() * 150, 1.5, 1.5);
    }
    // Whole numbers of waves round the 1024 pixels, so the join doesn't show.
    const height = (x, base, amp, waves, phase) => {
      const t = (x / 1024) * Math.PI * 2;
      return 256 - base - amp * (0.6 * Math.sin(t * waves[0] + phase) + 0.3 * Math.sin(t * waves[1] + phase * 2) + 0.1 * Math.sin(t * waves[2]));
    };
    const ridge = (base, amp, waves, phase) => {
      c.beginPath();
      c.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 8) c.lineTo(x, height(x, base, amp, waves, phase));
      c.lineTo(1024, 256);
      c.fill();
    };
    const far = hex(mix(horizon, pal.card, 0.45));
    const near = hex(mix(horizon, pal.card, 0.75));
    const r2 = seeded(`skyline:${line}`);
    if (line === 'sea') {
      // The sea out to the horizon, a sail or an island far off.
      const sg = c.createLinearGradient(0, 238, 0, 256);
      sg.addColorStop(0, hex(mix(horizon, [0.1, 0.3, 0.45], 0.55)));
      sg.addColorStop(1, hex(mix(horizon, [0.04, 0.16, 0.26], 0.75)));
      c.fillStyle = sg;
      c.fillRect(0, 238, 1024, 18);
      c.fillStyle = 'rgba(255, 255, 255, 0.25)';
      for (let k = 0; k < 50; k++) c.fillRect(r2() * 1024, 240 + r2() * 15, 3 + r2() * 6, 0.8);
      c.fillStyle = near;
      for (let k = 0; k < 3; k++) {
        const x = r2() * 1024;
        c.beginPath();
        c.ellipse(x, 239, 30 + r2() * 40, 6 + r2() * 5, 0, Math.PI, 0);
        c.fill();
        if (k === 0) for (const dx of [-12, 6]) { c.fillRect(x + dx, 222, 1.6, 14); c.beginPath(); c.ellipse(x + dx + 1, 222, 7, 3, 0, 0, Math.PI * 2); c.fill(); }
      }
      c.beginPath();
      const sx = r2() * 1024;
      c.moveTo(sx, 238); c.lineTo(sx + 6, 222); c.lineTo(sx + 6, 238); c.closePath();
      c.moveTo(sx - 3, 238); c.lineTo(sx + 10, 238); c.lineTo(sx + 8, 241); c.lineTo(sx - 1, 241);
      c.fill();
    } else if (line === 'peaks') {
      // Mountains, snow on their tops, then the nearer hills.
      const peak = (x) => 256 - 22 - Math.abs(((x / 1024) * 9 + 0.3) % 1 - 0.5) * 90 - 18 * Math.sin((x / 1024) * Math.PI * 2 * 4);
      c.fillStyle = far;
      c.beginPath();
      c.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 4) c.lineTo(x, peak(x));
      c.lineTo(1024, 256);
      c.fill();
      c.save();
      c.clip();
      c.fillStyle = 'rgba(245, 248, 255, 0.85)';
      c.beginPath();
      c.moveTo(0, 0);
      for (let x = 0; x <= 1024; x += 4) c.lineTo(x, Math.min(256, peak(x) + 10 + 4 * Math.sin(x * 0.3)));
      c.lineTo(1024, 0);
      c.fill();
      c.restore();
      c.fillStyle = near;
      ridge(10, 12, [3, 7, 31], 4);
    } else if (line === 'mesas') {
      // Flat-topped buttes, red in the distance.
      c.fillStyle = hex(mix(mix(horizon, [0.6, 0.3, 0.18], 0.5), pal.card, 0.3));
      c.beginPath();
      c.moveTo(0, 256);
      let x = 0;
      while (x < 1024) {
        const w = 40 + r2() * 110;
        const h = 18 + r2() * 46;
        c.lineTo(x, 252);
        c.lineTo(x + 10, 256 - h);
        c.lineTo(Math.min(1024, x + w - 10), 256 - h);
        c.lineTo(Math.min(1024, x + w), 252);
        x += w + r2() * 90;
      }
      c.lineTo(1024, 256);
      c.fill();
      c.fillStyle = near;
      ridge(6, 6, [3, 7, 31], 4);
    } else {
      c.fillStyle = far;
      ridge(26, 26, [2, 5, 13], 1);
      c.fillStyle = near;
      ridge(10, 12, [3, 7, 31], 4);
    }
    if (line === 'city' || line === 'towers') {
      // A city's skyline, windows lit; or a castle on its hill, towers and a flag on each.
      const dark = hex(mix(horizon, pal.card, 0.9).map((v) => v * 0.7));
      c.fillStyle = dark;
      if (line === 'city') {
        for (let x = r2() * 20; x < 1024; x += 10 + r2() * 26) {
          const w = 12 + r2() * 26;
          const h = 16 + r2() * (r2() < 0.15 ? 90 : 50);
          c.fillStyle = dark;
          c.fillRect(x, 256 - h, w, h);
          for (let y = 256 - h + 4; y < 252; y += 6) for (let wx2 = x + 3; wx2 < x + w - 3; wx2 += 5) if (r2() < 0.28) { c.fillStyle = r2() < 0.8 ? 'rgba(255, 220, 150, 0.8)' : th.sky?.lights || pal.accent; c.fillRect(wx2, y, 2, 2.4); }
        }
      } else {
        const base = (x) => height(x, 10, 12, [3, 7, 31], 4);
        for (const x0 of [180, 610]) {
          const y0 = base(x0 + 50);
          c.fillStyle = dark;
          c.fillRect(x0, y0 - 22, 100, 26);
          for (let k = 0; k < 10; k++) c.fillRect(x0 + k * 10, y0 - 26, 6, 4);
          for (const [tx, tw, th2] of [[-6, 16, 46], [44, 18, 62], [92, 16, 42]]) {
            c.fillRect(x0 + tx, y0 - th2, tw, th2);
            for (let k = 0; k < 3; k++) c.fillRect(x0 + tx - 1 + k * 7, y0 - th2 - 4, 4, 4);
            c.fillRect(x0 + tx + tw / 2, y0 - th2 - 16, 1.2, 12);
            c.fillStyle = pal.accent;
            c.beginPath();
            c.moveTo(x0 + tx + tw / 2 + 1, y0 - th2 - 16);
            c.lineTo(x0 + tx + tw / 2 + 10, y0 - th2 - 13);
            c.lineTo(x0 + tx + tw / 2 + 1, y0 - th2 - 10);
            c.fill();
            c.fillStyle = dark;
          }
          c.fillStyle = 'rgba(255, 190, 90, 0.8)';
          for (const [wx2, wy] of [[52, 40], [52, 26], [2, 26], [98, 24]]) c.fillRect(x0 + wx2, y0 - wy, 2.4, 4);
          c.fillStyle = dark;
        }
      }
    }
    for (let k = 0; k < 40; k++) {
      c.fillStyle = `rgba(${pal.accentRgb.map((v) => Math.round(v * 255)).join(', ')}, ${0.35 + rand() * 0.4})`;
      c.fillRect(rand() * 1024, 238 + rand() * 12, 2, 2);
    }
    return cv;
  }

  // Space all round (the space lounge, and Rainbow Road): stars, glowing clouds of colour, a ringed
  // planet and a moon (on Rainbow Road a second, banded one too). Below the horizon there's more of
  // it, made as it's drawn (see GROUND_FS).
  function spaceSky(pal, wx, rainbow) {
    const W = 1024;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 256;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#02010a');
    g.addColorStop(0.7, '#080518');
    g.addColorStop(1, '#0a0620');
    c.fillStyle = g;
    c.fillRect(0, 0, W, 256);
    const rand = seeded('space');
    for (const [x, y, rx, ry, col] of [[160, 120, 220, 70, '140, 70, 255'], [520, 170, 260, 60, '42, 160, 255'], [820, 110, 200, 80, '255, 74, 154'], [1020, 150, 160, 60, '58, 224, 200']]) {
      for (const dx of [-W, 0]) {
        const n = c.createRadialGradient(x + dx, y, 0, x + dx, y, rx);
        n.addColorStop(0, `rgba(${col}, 0.28)`);
        n.addColorStop(1, `rgba(${col}, 0)`);
        c.save();
        c.translate(0, y);
        c.scale(1, ry / rx);
        c.translate(0, -y);
        c.fillStyle = n;
        c.fillRect(x + dx - rx, y - rx, rx * 2, rx * 2);
        c.restore();
      }
    }
    for (let k = 0; k < 260; k++) {
      c.fillStyle = `rgba(255, 255, 255, ${0.25 + rand() * 0.7})`;
      const s = rand() < 0.1 ? 2 : 1.2;
      c.fillRect(rand() * W, rand() * 250, s, s);
    }
    // (Round on screen: the sky's picture is stretched 2.85 times as much across as up.)
    const planet = (px, py, r, a, b, ring) => {
      c.save();
      c.translate(px, py);
      c.scale(1, 256 / 0.55 / (W / (Math.PI * 2)));
      const x = 0;
      const y = 0;
      const pg = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      pg.addColorStop(0, a);
      pg.addColorStop(1, b);
      if (ring) {
        c.strokeStyle = 'rgba(230, 210, 255, 0.55)';
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(x, y, r * 2, r * 0.45, -0.3, Math.PI, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = pg;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      if (ring) {
        c.beginPath();
        c.ellipse(x, y, r * 2, r * 0.45, -0.3, 0, Math.PI);
        c.stroke();
      }
      c.restore();
    };
    planet(300, 130, 16, '#ffd0a0', '#7a3a2a', true);
    planet(700, 80, 6, '#e8e4f0', '#4a4660', false);
    if (rainbow) planet(880, 190, 10, '#9ad8ff', '#1a2a7a', false);
    return cv;
  }

  // The ground, from above, as a texture: the felt's colours (with a mown stripe) under the track.
  // (Rainbow Road: just the road, nothing round it, which the ground's shader takes as space.)
  function groundCanvas(tr, pal, th = themeOf()) {
    const cv = document.createElement('canvas');
    cv.width = 2048;
    cv.height = 1024;
    const c = cv.getContext('2d');
    const sx = cv.width / tr.world.w;
    const sy = cv.height / tr.world.h;
    if (th.void) {
      drawStatic(cv, tr, sx, sy, { scenery: false, under: true });
      return cv;
    }
    const felt = pal.felt;
    const g = c.createRadialGradient(cv.width / 2, cv.height / 2, 0, cv.width / 2, cv.height / 2, cv.width * 0.6);
    felt.forEach((col, i) => g.addColorStop(felt.length === 1 ? 0 : i / (felt.length - 1), hex(col)));
    c.fillStyle = g;
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let x = 0; x < cv.width; x += 48 * sx) c.fillRect(x, 0, 24 * sx, cv.height);
    const rand = seeded('felt');
    for (let k = 0; k < 9000; k++) {
      c.fillStyle = rand() < 0.5 ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.07)';
      c.fillRect(rand() * cv.width, rand() * cv.height, 2, 2);
    }
    const top = document.createElement('canvas');
    top.width = cv.width;
    top.height = cv.height;
    drawStatic(top, tr, sx, sy, { scenery: false, under: true });
    c.drawImage(top, 0, 0);
    // A soft shadow under the barriers and the scenery.
    const sh = shapeOf(tr);
    c.setTransform(sx, 0, 0, sy, 0, 0);
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    const art = propArt(pal);
    for (const p of sh.props) {
      if (p.kind === 'stand' || (p.kind === 'tree' && (!kept(p, th) || th.tree === 'none')) || (p.kind === 'tyres' && th.stack === 'none')) continue;
      c.beginPath();
      if (p.kind === 'venue') {
        const it = art.items[p.which % art.items.length];
        const [x, y] = propAt(p, it);
        c.ellipse(x + 2, y + 2, it.half * 0.8, it.half * 0.8, 0, 0, Math.PI * 2);
      } else c.arc(p.x + 2, p.y + 2, p.r + 1.5, 0, Math.PI * 2);
      c.fill();
    }
    return cv;
  }

  // Where things land on screen (the camera of this frame). Filled in, not made, each time.
  const at = { x: 0, y: 0, s: 0, d: 0 };

  const fp = {
    el: null, // the .tr-view on screen, when racing
    cv: null, // WebGL
    hud: null, // 2D, over it
    gl: null,
    failed: false,
    lost: false,
    key: '', // what's in the textures and models now
    w: 0,
    h: 0,
    vp: new Float32Array(16),
    cam: { x: 0, y: 0, z: 12, yaw: 0, roll: 0, speed: 0, px: 0, py: 0, pa: 0, race: -1, shake: 0, t: 0, f: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1], focal: 1 },
    avatars: {}, // id -> canvas
    heads: new Float32Array(32), // the cars' headlights (see LIGHT_GLSL)
    light: new Float32Array(3), // the weather's light this frame (lightning and all)
    drops: null, // rain or snow falling over the view: x, y (0 to 1) and how fast, each
    wasAt: new Float32Array(16), // where each car was last frame, for the spray

    attach(s) {
      const el = document.querySelector('.tr-view');
      if (!el) { this.el = null; return; }
      if (!this.cv) this.create();
      this.models(s);
      el.prepend(this.cv, this.hud);
      this.el = el;
      this.w = 0; // sized on the next frame
      this.watchSize(el);
    },
    detach() { this.el = null; this.last = 0; this.watchSize(null); },

    // The view's size, kept up to date by a ResizeObserver: reading clientWidth every frame made
    // the browser lay the page out again there and then whenever anything on it had changed (the
    // lap, the place, the wheel turning), in the middle of the frame.
    box: null,
    watchSize(el) {
      if (typeof ResizeObserver === 'undefined') return;
      this.ro ||= new ResizeObserver(() => {
        if (this.el) this.box = { w: this.el.clientWidth, h: this.el.clientHeight };
      });
      this.ro.disconnect();
      this.box = null;
      if (el) this.ro.observe(el);
    },

    // Each car's model, built when the screen is (a car only changes between races), and the
    // chase cam lifted over your own if it's a tall one (a minibus, a keg on the roof).
    models(s) {
      const gl = this.gl;
      if (!gl || this.failed) return;
      this.meshes ||= {};
      this.lift = 0;
      for (const id of s.game.carIds || []) {
        const look = lookOf(id, s);
        const key = meshKey(look);
        let have = this.meshes[id];
        if (!have || have.key !== key) {
          const { v, top } = carModel(look);
          have ||= this.meshes[id] = { buf: gl.createBuffer() };
          gl.bindBuffer(gl.ARRAY_BUFFER, have.buf);
          gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
          Object.assign(have, { key, count: v.length / 7, top });
        }
        if (id === s.me) this.lift = Math.max(0, Math.min(9, (have.top - 10) * 0.9));
      }
    },

    create() {
      this.cv = document.createElement('canvas');
      this.cv.className = 'tr-gl';
      this.hud = document.createElement('canvas');
      this.hud.className = 'tr-hudcv';
      this.cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      this.cv.addEventListener('webglcontextrestored', () => { this.lost = false; this.setup(); });
      this.gl = this.cv.getContext('webgl', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!this.gl || !this.setup()) { this.failed = true; this.gl = null; }
    },

    // Shaders and buffers (again after the phone takes the GPU away and gives it back).
    setup() {
      const gl = this.gl;
      const prog = (vs, fsrc) => program(gl, vs, fsrc);
      this.ground = prog(GROUND_VS, GROUND_FS);
      this.model = prog(MODEL_VS, MODEL_FS);
      this.sprite = prog(PROP_VS, PROP_FS);
      this.road = prog(ROAD_VS, ROAD_FS);
      if (!this.ground || !this.model || !this.sprite || !this.road) return false;
      this.quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const car = carModel().v;
      this.carBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.carBuf);
      gl.bufferData(gl.ARRAY_BUFFER, car, gl.STATIC_DRAW);
      this.carCount = car.length / 7;
      const ghost = carModel(PHANTOM_LOOK, { shadow: false }).v;
      this.ghostBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ghostBuf);
      gl.bufferData(gl.ARRAY_BUFFER, ghost, gl.STATIC_DRAW);
      this.ghostCount = ghost.length / 7;
      for (const id in this.meshes) gl.deleteBuffer(this.meshes[id].buf);
      this.meshes = {};
      this.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      this.key = '';
      this.quick = '';
      return true;
    },

    // The track's textures and scenery, when the track (or the room's look) changes.
    load(s, ms) {
      const tr = s.game.track;
      // (The room's colours are looked at again now and then: its stylesheet can come in late.)
      const quick = `${tr.id}:${s.look || s.style}:${themeIdOf(s)}:${weatherOf(s)}`;
      if (quick === this.quick && ms - this.checked < 1500) return;
      this.quick = quick;
      this.checked = ms;
      const pal = palette();
      const key = `${quick}:${pal.accent}:${pal.rim}:${pal.felt.join()}`;
      if (key === this.key) return;
      this.key = key;
      const gl = this.gl;
      const texture = (img, repeat, mips) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (mips) {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          // Looking along the ground, it's the sideways blur that keeps the distance from shimmering.
          if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        return t;
      };
      if (this.groundTex) gl.deleteTexture(this.groundTex);
      if (this.skyTex) gl.deleteTexture(this.skyTex);
      const th = themeOf(s);
      this.th = th;
      this.groundTex = texture(groundCanvas(tr, pal, th), false, true);
      const wx = wxOf(s);
      this.wx = wx;
      if (wx.moon) moonFor(tr);
      this.skyTex = texture(skyCanvas(pal, wx, th), true, false);
      const sh = shapeOf(tr);
      this.sh = sh;
      // Rainbow Road: off the road is space (1); on the hills, the road's a model of its own and
      // the ground's all space (2).
      this.void = th.void ? (sh.hilly ? 2 : 1) : 0;
      const scene = sceneModel(tr, sh, pal, wx, th);
      this.sceneBuf ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneBuf);
      gl.bufferData(gl.ARRAY_BUFFER, scene, gl.STATIC_DRAW);
      this.sceneCount = scene.length / 7;
      // The road over the hills (nothing on a flat track: the ground's enough).
      const road = sh.hilly ? roadModel(sh) : new Float32Array(0);
      this.roadBuf ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.roadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, road, gl.STATIC_DRAW);
      this.roadCount = road.length / 5;
      this.hints = {}; // id -> where on the road each car was last frame (see roadAt)
      // The room's props: their picture, and a cut-out each (two triangles: x, y, how far to the
      // side, how high, and where in the picture).
      const art = propArt(pal);
      if (this.propTex) gl.deleteTexture(this.propTex);
      this.propTex = texture(art.cv, false, true);
      // (The ones that glow go last, drawn on their own: lit from inside, flickering. The venue's
      // extras round the track too: Halloween's gravestones and jack-o'-lanterns, the torches.)
      const v = [];
      const lit = [];
      const glowAt = [];
      const cutout = (it, x, y, size, lift) => {
        const u0 = (it.cell + 0.005) / art.cols;
        const u1 = (it.cell + 0.995) / art.cols;
        const h = size / 2;
        const z0 = lift;
        const z1 = lift + size;
        const out = it.glow ? lit : v;
        for (const [o, z, u, t] of [[-h, z0, u0, 1], [h, z0, u1, 1], [h, z1, u1, 0], [-h, z0, u0, 1], [h, z1, u1, 0], [-h, z1, u0, 0]]) out.push(x, y, o, z, u, t);
        if (it.glow) glowAt.push(x, y, lift + size * 0.45, size);
      };
      for (const p of sh.props) {
        if (p.kind !== 'venue') continue;
        const it = art.items[p.which % art.items.length];
        const [x, y] = propAt(p, it);
        cutout(it, x, y, it.size, (it.lift || 0) + (p.z || 0));
      }
      const hs = extrasOf(tr, th);
      for (const p of hs.things) if (art.byKind[p.kind]) cutout(art.byKind[p.kind], p.x, p.y, p.size, groundZ(sh, p.x, p.y));
      // (A torch on each of the gantry's posts: Halloween's arch has jack-o'-lanterns of its own.)
      const top = th.pillar && th.pillar !== 'lantern' && art.byKind[th.pillar];
      if (top) {
        const i = sh.startI;
        const span = tr.width / 2 + 12;
        for (const side of [-1, 1]) cutout(top, sh.xs[i] + sh.nx[i] * span * side, sh.ys[i] + sh.ny[i] * span * side, 14, sh.zs[i] + (th.gantry === 'arch' ? 46 : 36));
      }
      this.propBuf ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v.concat(lit)), gl.STATIC_DRAW);
      this.propCount = v.length / 6;
      this.glowCount = lit.length / 6;
      // Where the glows are (x, y, z, size), and the will-o'-the-wisps (x, y, phase).
      this.glowAt = new Float32Array(glowAt);
      this.wisps = new Float32Array(hs.wisps.flatMap((w) => [w.x, w.y, w.k]));
      const [, horizon] = skyColours(pal, wx);
      this.haze = wx.haze ? mix(horizon, wx.haze, 0.85) : horizon;
      this.out = wx.snow && !th.void ? [0.78, 0.81, 0.86] : th.out || mix(pal.felt[pal.felt.length - 1], [0, 0, 0], 0.55);
      this.propLight = mix(wx.light, [1, 1, 1], 0.3);
      this.lamp = [0.25, 0.05, 0.05];
    },

    // The canvases' size: the screen's, at a modest resolution (scaled up by the browser): half the
    // phone's pixels, or less on a phone that can't keep up (see slow()).
    size(ms) {
      // (Till the observer first reports, asked straight out.)
      const w = this.box ? this.box.w : this.el.clientWidth;
      const h = this.box ? this.box.h : this.el.clientHeight;
      this.slow(ms);
      if (w === this.w && h === this.h && this.k === this.want) return;
      this.w = w;
      this.h = h;
      this.want ||= Math.max(0.75, Math.min(1.5, (window.devicePixelRatio || 1) * 0.5));
      const k = this.want;
      for (const cv of [this.cv, this.hud]) {
        cv.width = Math.max(2, Math.round(w * k));
        cv.height = Math.max(2, Math.round(h * k));
      }
      this.k = k;
    },

    // Frames coming slower than ~40 a second for a couple of seconds: a quarter fewer pixels (it
    // never goes back up, so it can't see-saw).
    slow(ms) {
      const dt = ms - (this.last || ms);
      this.last = ms;
      if (dt <= 0 || dt > 250) return;
      this.avg = this.avg ? this.avg + (dt - this.avg) * 0.05 : dt;
      this.judged ||= ms; // (not on the first few frames, which load the textures)
      if (ms - this.judged < 2500) return;
      this.judged = ms;
      if (this.avg > 25 && this.want > 0.5) this.want = Math.max(0.5, this.want * 0.85);
    },

    // The chase cam: behind the car, a little above, swinging round after it (so you see the car
    // turn), leaning into the corners, shaken by a bump, rumbling on the grass.
    aim(car, ms, portrait) {
      const cam = this.cam;
      const dt = Math.min(0.1, Math.max(0.001, (ms - cam.t) / 1000));
      // (A new race; or the car's been put back on the road after a fall, somewhere else.)
      const fresh = cam.race !== PB.state.game.race || (car[0] - cam.px) ** 2 + (car[1] - cam.py) ** 2 > 50 ** 2;
      cam.t = ms;
      if (fresh) { cam.race = PB.state.game.race; cam.yaw = car[2]; cam.px = car[0]; cam.py = car[1]; cam.pa = car[2]; cam.speed = 0; cam.roll = 0; cam.shake = 0; }
      const moved = Math.hypot(car[0] - cam.px, car[1] - cam.py) / dt;
      cam.speed += (Math.min(260, moved) - cam.speed) * (1 - Math.exp(-dt * 6));
      let turn = car[2] - cam.pa;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
      cam.px = car[0];
      cam.py = car[1];
      cam.pa = car[2];
      let d = car[2] - cam.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.yaw += d * (1 - Math.exp(-dt * 7));
      const lean = Math.max(-0.07, Math.min(0.07, turn * 0.025 * Math.min(1, cam.speed / 120)));
      cam.roll += (lean - cam.roll) * (1 - Math.exp(-dt * 5));
      cam.shake *= Math.exp(-dt * 5);
      const wobble = cam.shake * Math.sin(ms * 0.05) + (car[3] & 2 && cam.speed > 25 ? 0.25 * Math.sin(ms * 0.09) : 0);
      const back = portrait ? 38 : 54;
      const height = (portrait ? 30 : 18) + (this.lift || 0);
      const F0 = Math.cos(cam.yaw);
      const F1 = Math.sin(cam.yaw);
      cam.x = car[0] - F0 * back;
      cam.y = car[1] - F1 * back;
      cam.z = height + wobble * 1.4;
      const hill = this.hill(car, dt, fresh, back);
      cam.z = Math.min(cam.z + hill.z, hill.ceil);
      // Looking down a touch (more, from higher up, when upright: the tall screen fills with road),
      // and on the hills up or down the slope ahead, tipped with the banking.
      const pitch = Math.atan(portrait ? 0.42 : 0.17) - hill.pitch;
      const roll = cam.roll + wobble * 0.025 + hill.roll;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cr = Math.cos(roll), sr = Math.sin(roll);
      // forward, right and up, for the ground's rays and the models' matrix alike
      const f = cam.f, r = cam.r, u = cam.u;
      f[0] = F0 * cp; f[1] = F1 * cp; f[2] = -sp;
      const r0 = -F1, r1 = F0;
      const u0 = F0 * sp, u1 = F1 * sp, u2 = cp;
      r[0] = r0 * cr - u0 * sr; r[1] = r1 * cr - u1 * sr; r[2] = -u2 * sr;
      u[0] = r0 * sr + u0 * cr; u[1] = r1 * sr + u1 * cr; u[2] = u2 * cr;
      // A wide view, a little wider the faster you go.
      const W = this.cv.width;
      const H = this.cv.height;
      const base = portrait ? W * 0.8 : Math.min(W / 2 / Math.tan(0.68), H * 1.05);
      cam.focal = base * (1 - 0.12 * Math.min(1, cam.speed / 175));
      const fx = cam.focal / (W / 2);
      const fy = cam.focal / (H / 2);
      const near = 2;
      const far = 1600;
      const A = (far + near) / (far - near);
      const B = (-2 * far * near) / (far - near);
      const cx = cam.x, cy = cam.y, cz = cam.z;
      const dot = (v) => v[0] * cx + v[1] * cy + v[2] * cz;
      const m = this.vp;
      // (Column by column.)
      m[0] = fx * r[0]; m[4] = fx * r[1]; m[8] = fx * r[2]; m[12] = -fx * dot(r);
      m[1] = fy * u[0]; m[5] = fy * u[1]; m[9] = fy * u[2]; m[13] = -fy * dot(u);
      m[2] = A * f[0]; m[6] = A * f[1]; m[10] = A * f[2]; m[14] = -A * dot(f) + B;
      m[3] = f[0]; m[7] = f[1]; m[11] = f[2]; m[15] = -dot(f);
    },

    // On the hills: where your own car is, up and down (and its hop over a sharp crest: only for
    // show, the server's car never leaves the road; a bump as it lands), and how the camera
    // follows: up and down after it, pitched with the slope, tipped with the banking, and never up
    // into the bridge from under it. All zeros on a flat track.
    hill(car, dt, fresh, back) {
      const cam = this.cam;
      const out = (this.hillOut ||= { z: 0, pitch: 0, roll: 0, ceil: 1e4 });
      const me = (this.mine ||= { z: 0, along: 0, across: 0, vz: 0, road: 0, air: 0 });
      const sh = this.sh;
      if (!sh?.hilly) {
        out.z = out.pitch = out.roll = 0;
        out.ceil = 1e4;
        me.z = me.along = me.across = 0;
        return out;
      }
      const id = PB.state.me;
      const r = roadAt(sh, car[0], car[1], car[2], fresh ? -1 : this.hints[id] ?? -1);
      this.hints[id] = r.i;
      const vr = fresh ? 0 : (r.z - me.road) / dt;
      me.road = r.z;
      me.along = r.along;
      me.across = r.across;
      const ceilCar = sh.ceil[r.i];
      if (fresh || Math.abs(me.z - r.z) > 30) {
        me.z = r.z;
        me.vz = 0;
        me.air = 0;
      } else {
        const G = 220; // (lighter than real: over the sharp crests, flat out, you get a little air)
        const z = me.z + me.vz * dt - (G * dt * dt) / 2;
        me.vz -= G * dt;
        if (z <= r.z) {
          if (me.air > 0.12 && vr - me.vz > 30) cam.shake = Math.min(1.6, cam.shake + (vr - me.vz) / 110);
          me.z = r.z;
          me.vz = Math.min(vr, 120);
          me.air = 0;
        } else {
          me.z = z;
          me.air += dt;
        }
      }
      const k = (rate) => (fresh ? 1 : 1 - Math.exp(-dt * rate));
      cam.hz = (cam.hz ?? me.z) + (me.z - (cam.hz ?? me.z)) * k(7);
      cam.slope = (cam.slope ?? r.along) + (r.along - (cam.slope ?? r.along)) * k(4);
      cam.tilt = (cam.tilt ?? 0) + (-Math.asin(Math.max(-0.5, Math.min(0.5, r.across))) - (cam.tilt ?? 0)) * k(5);
      // (The road under the camera, behind the car.)
      const rc = roadAt(sh, cam.x, cam.y, car[2], r.i);
      const base = Math.max(rc.z + 2, cam.hz - cam.slope * back * 0.6);
      const ceil = Math.min(sh.ceil[rc.i], ceilCar);
      cam.ceil = (cam.ceil ?? ceil) + (ceil - (cam.ceil ?? ceil)) * k(8);
      out.z = base;
      out.pitch = Math.atan(cam.slope) * 0.85;
      out.roll = cam.tilt * 0.8;
      out.ceil = cam.ceil;
      return out;
    },

    // How high a car is on the hills, and how the road under it tilts it (for its model, and its
    // name over it). Your own car from hill() (with its hop), the rest from where they are.
    carHill(id, c, mine) {
      const sh = this.sh;
      if (!sh?.hilly) { onRoad.z = onRoad.along = onRoad.across = 0; return onRoad; }
      if (mine && this.mine) {
        onRoad.z = this.mine.z;
        onRoad.along = this.mine.along;
        onRoad.across = this.mine.across;
        return onRoad;
      }
      const r = roadAt(sh, c[0], c[1], c[2], this.hints[id] ?? -1);
      this.hints[id] = r.i;
      return r;
    },

    // A point in the world to the 2D canvas (false if it's behind the camera).
    project(x, y, z) {
      const cam = this.cam;
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const f = cam.f, r = cam.r, u = cam.u;
      const d = dx * f[0] + dy * f[1] + dz * f[2];
      if (d < 3) return false;
      at.d = d;
      at.s = cam.focal / d;
      at.x = this.cv.width / 2 + (dx * r[0] + dy * r[1] + dz * r[2]) * at.s;
      at.y = this.cv.height / 2 - (dx * u[0] + dy * u[1] + dz * u[2]) * at.s;
      return true;
    },

    frame(s, cars, ids, ms) {
      const mine = ids.indexOf(s.me);
      const car = cars[mine];
      if (!car) return;
      this.size(ms);
      const portrait = this.h > this.w;
      if (this.failed || this.lost) { this.flat(s, cars, ids, car, portrait); return; }
      const gl = this.gl;
      this.load(s, ms);
      this.aim(car, ms, portrait);
      const cam = this.cam;
      const W = this.cv.width;
      const H = this.cv.height;
      const wx = this.wx;
      const far = wx.far;
      // Halloween: lightning now and then (everything lit up), the low fog drifting.
      const fx = this.th.fx;
      const flash = fx.lightning ? lightning(ms) * (wx.mute ? 0.5 : 1) : 0;
      const L = this.light;
      L[0] = wx.light[0] + flash * 0.75;
      L[1] = wx.light[1] + flash * 0.72;
      L[2] = wx.light[2] + flash * 0.9;
      const low = wx.low || this.light;
      // The weather's light, for the ground and the models alike: the cars' headlights at night.
      const heads = this.heads;
      heads.fill(0);
      if (wx.lamps) {
        for (let i = 0; i < cars.length && i < 8; i++) {
          if (!cars[i] || !ids[i]) continue;
          heads[i * 4] = cars[i][0];
          heads[i * 4 + 1] = cars[i][1];
          heads[i * 4 + 2] = Math.cos(cars[i][2]);
          heads[i * 4 + 3] = Math.sin(cars[i][2]);
        }
      }
      const weather = (P) => {
        gl.uniform3f(P.u.uLight, L[0], L[1], L[2]);
        gl.uniform1f(P.u.uTime, (ms / 1000) % 1000);
        gl.uniform1f(P.u.uLowK, wx.lowK || 0);
        gl.uniform3f(P.u.uLow, low[0], low[1], low[2]);
        gl.uniform1f(P.u.uHead, wx.lamps ? 1 : 0);
        gl.uniform1f(P.u.uMute, wx.mute || 0);
        gl.uniform4fv(P.u['uCars[0]'], heads);
      };
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      // The ground and the sky.
      const G = this.ground;
      gl.useProgram(G.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
      gl.uniform1i(G.u.uGround, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
      gl.uniform1i(G.u.uSky, 1);
      gl.uniform2f(G.u.uC, W / 2, H / 2);
      gl.uniform2f(G.u.uWorld, s.game.track.world.w, s.game.track.world.h);
      gl.uniform1f(G.u.uFocal, cam.focal);
      gl.uniform1f(G.u.uFar, far);
      gl.uniform3f(G.u.uCam, cam.x, cam.y, cam.z);
      gl.uniform3f(G.u.uF, cam.f[0], cam.f[1], cam.f[2]);
      gl.uniform3f(G.u.uR, cam.r[0], cam.r[1], cam.r[2]);
      gl.uniform3f(G.u.uU, cam.u[0], cam.u[1], cam.u[2]);
      gl.uniform3f(G.u.uHaze, this.haze[0], this.haze[1], this.haze[2]);
      gl.uniform3f(G.u.uOut, this.out[0], this.out[1], this.out[2]);
      gl.uniform1f(G.u.uWet, wx.wet || 0);
      gl.uniform1f(G.u.uFlash, flash);
      gl.uniform1f(G.u.uVoid, this.void);
      weather(G);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(G.aP);
      gl.vertexAttribPointer(G.aP, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(G.aP);
      // The barriers, the scenery and the cars.
      const M = this.model;
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      // On the hills: the road and its embankments, over the flat ground.
      if (this.roadCount) {
        const R = this.road;
        gl.useProgram(R.p);
        gl.uniformMatrix4fv(R.u.uVP, false, this.vp);
        gl.uniform3f(R.u.uCam, cam.x, cam.y, cam.z);
        gl.uniform1f(R.u.uFar, far);
        gl.uniform3f(R.u.uHaze, this.haze[0], this.haze[1], this.haze[2]);
        gl.uniform2f(R.u.uWorld, s.game.track.world.w, s.game.track.world.h);
        gl.uniform1f(R.u.uHalf, s.game.track.width / 2);
        gl.uniform1f(R.u.uWet, wx.wet || 0);
        gl.uniform1f(R.u.uVoid, this.void);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
        gl.uniform1i(R.u.uGround, 0);
        weather(R);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.roadBuf);
        gl.enableVertexAttribArray(R.aP);
        gl.enableVertexAttribArray(R.aA);
        gl.vertexAttribPointer(R.aP, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(R.aA, 2, gl.FLOAT, false, 20, 12);
        gl.drawArrays(gl.TRIANGLES, 0, this.roadCount);
        gl.disableVertexAttribArray(R.aP);
        gl.disableVertexAttribArray(R.aA);
      }
      gl.useProgram(M.p);
      gl.uniformMatrix4fv(M.u.uVP, false, this.vp);
      gl.uniform3f(M.u.uCam, cam.x, cam.y, cam.z);
      gl.uniform3f(M.u.uH, 0, 0, 0);
      gl.uniform1f(M.u.uFar, far);
      gl.uniform3f(M.u.uHaze, this.haze[0], this.haze[1], this.haze[2]);
      gl.uniform1f(M.u.uGlow, wx.lamps ? 1 : 0);
      gl.uniform1f(M.u.uGhost, 0);
      weather(M);
      // The start lights: red through the countdown, then green.
      const lit = s.phase === 'countdown' ? 1 : 0;
      gl.uniform3f(M.u.uLamp, lit ? 1 : 0.2, lit ? 0.12 : 1, lit ? 0.1 : 0.35);
      gl.enableVertexAttribArray(M.aP);
      gl.enableVertexAttribArray(M.aC);
      const draw = (buf, count) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.vertexAttribPointer(M.aP, 3, gl.FLOAT, false, 28, 0);
        gl.vertexAttribPointer(M.aC, 4, gl.FLOAT, false, 28, 12);
        gl.drawArrays(gl.TRIANGLES, 0, count);
      };
      gl.uniform4f(M.u.uM, 0, 0, 1, 0);
      gl.uniform3f(M.u.uTint, 1, 1, 1);
      gl.uniform1f(M.u.uBrake, 0);
      draw(this.sceneBuf, this.sceneCount);
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c || !ids[i]) continue;
        // (Not one right under the camera: on the grid it hangs over the car behind yours.)
        if (i !== mine && (c[0] - cam.x) ** 2 + (c[1] - cam.y) ** 2 < 400) continue;
        // Rainbow Road: a car being put back after a fall blinks, dropping back onto the road.
        const drop = c[3] & 16 ? this.dropping(ids[i], ms) : 0;
        if (drop < 0) continue;
        const col = this.colour(ids[i]);
        gl.uniform4f(M.u.uM, c[0], c[1], Math.cos(c[2]), Math.sin(c[2]));
        const h = this.carHill(ids[i], c, i === mine);
        gl.uniform3f(M.u.uH, h.z + drop, h.along, h.across);
        gl.uniform3f(M.u.uTint, col[0], col[1], col[2]);
        gl.uniform1f(M.u.uBrake, c[3] & 8 ? 1 : 0);
        const mesh = this.meshes?.[ids[i]];
        if (mesh) draw(mesh.buf, mesh.count);
        else draw(this.carBuf, this.carCount);
      }
      gl.disableVertexAttribArray(M.aP);
      gl.disableVertexAttribArray(M.aC);
      // The room's props, turned to face the camera: all of them in one go.
      if (this.propCount) {
        const P = this.sprite;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
        const side = Math.hypot(cam.r[0], cam.r[1]) || 1;
        gl.uniform2f(P.u.uSide, cam.r[0] / side, cam.r[1] / side);
        gl.uniform3f(P.u.uCam, cam.x, cam.y, cam.z);
        gl.uniform1f(P.u.uFar, far);
        gl.uniform3f(P.u.uHaze, this.haze[0], this.haze[1], this.haze[2]);
        const pl = this.propLight;
        gl.uniform3f(P.u.uLight, pl[0] + flash * 0.6, pl[1] + flash * 0.6, pl[2] + flash * 0.7);
        gl.uniform1f(P.u.uMute, wx.mute || 0);
        gl.uniform1f(P.u.uTime, (ms / 1000) % 1000);
        gl.uniform1f(P.u.uLowK, wx.lowK || 0);
        gl.uniform3f(P.u.uLow, low[0], low[1], low[2]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.propTex);
        gl.uniform1i(P.u.uArt, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.propBuf);
        gl.enableVertexAttribArray(P.aP);
        gl.enableVertexAttribArray(P.aT);
        gl.vertexAttribPointer(P.aP, 4, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(P.aT, 2, gl.FLOAT, false, 24, 16);
        gl.drawArrays(gl.TRIANGLES, 0, this.propCount);
        // The ones lit from inside (a jack-o'-lantern), whatever the weather, flickering.
        if (this.glowCount) {
          const f = flicker(ms, 0) * 1.15;
          gl.uniform3f(P.u.uLight, f, f * 0.96, f * 0.9);
          gl.uniform1f(P.u.uMute, 0);
          gl.drawArrays(gl.TRIANGLES, this.propCount, this.glowCount);
        }
        gl.disableVertexAttribArray(P.aP);
        gl.disableVertexAttribArray(P.aT);
      }
      // Halloween's phantom car: see-through, pale green, through anything in its way.
      const ph = fx.phantom ? phantomAt(s, s.game.track) : null;
      // (Not when it's on top of the camera: a see-through car filling the screen is all blending.)
      if (ph && (ph.x - cam.x) ** 2 + (ph.y - cam.y) ** 2 > 2500) {
        gl.useProgram(M.p);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.uniform1f(M.u.uGhost, ph.fade);
        gl.uniform4f(M.u.uM, ph.x, ph.y, Math.cos(ph.a), Math.sin(ph.a));
        const ph3 = this.carHill('phantom', [ph.x, ph.y, ph.a], false);
        gl.uniform3f(M.u.uH, ph3.z, ph3.along, ph3.across);
        gl.uniform3f(M.u.uTint, 0.7, 1, 0.85);
        gl.uniform1f(M.u.uBrake, 0);
        gl.enableVertexAttribArray(M.aP);
        gl.enableVertexAttribArray(M.aC);
        draw(this.ghostBuf, this.ghostCount);
        gl.disableVertexAttribArray(M.aP);
        gl.disableVertexAttribArray(M.aC);
        gl.uniform1f(M.u.uGhost, 0);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      this.labels(s, cars, ids, mine, ms);
      if (this.glowAt.length || this.wisps.length || ph || fx.bats || fx.comets || flash) this.ambient(s, ph, flash, ms);
      this.spray(s, cars, ids, ms);
      this.fall(s, wx, car, ms);
    },

    // The car's paint (its driver's own colour, unless they picked another).
    colour(id) {
      const paint = lookOf(id).paint || lookNow(id).color;
      const c = (this.colours ||= {})[id];
      if (c && c.from === paint) return c.rgb;
      this.colours[id] = { from: paint, rgb: rgb(paint, [0.9, 0.3, 0.3]) };
      return this.colours[id].rgb;
    },

    // Who's who (their avatar over their car), who's tooting, and who's right behind you.
    labels(s, cars, ids, mine, ms) {
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      const me = cars[mine];
      const F0 = Math.cos(this.cam.yaw);
      const F1 = Math.sin(this.cam.yaw);
      const now = performance.now();
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (i === mine || !car || !ids[i]) continue;
        const dx = car[0] - me[0];
        const dy = car[1] - me[1];
        const along = dx * F0 + dy * F1;
        const side = -dx * F1 + dy * F0;
        if (along < -4 && along > -110 && Math.abs(side) < 70) {
          // Close behind: an arrow at the bottom, on their side, brighter the closer they are.
          const x = W / 2 + (side / 70) * W * 0.4;
          c.globalAlpha = Math.min(1, 1.3 + along / 110);
          c.fillStyle = lookNow(ids[i]).color;
          c.beginPath();
          c.moveTo(x, H - 26 * this.k);
          c.lineTo(x - 13 * this.k, H - 6 * this.k);
          c.lineTo(x + 13 * this.k, H - 6 * this.k);
          c.fill();
          c.globalAlpha = 1;
          continue;
        }
        if (!this.project(car[0], car[1], 15 + this.carHill(ids[i], car, false).z) || at.d > 520) continue;
        const size = Math.max(16 * this.k, Math.min(46 * this.k, at.s * 13));
        c.globalAlpha = at.d > 380 ? (520 - at.d) / 140 : 1;
        c.drawImage(this.avatar(ids[i]), at.x - size / 2, at.y - size, size, size);
        if (now - (honked[ids[i]] || -1e9) < 900) {
          c.font = `bold ${Math.round(size * 0.42)}px system-ui, sans-serif`;
          c.textAlign = 'center';
          c.lineWidth = 3;
          c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
          c.fillStyle = '#fff';
          c.strokeText('BEEP!', at.x, at.y - size * 1.1);
          c.fillText('BEEP!', at.x, at.y - size * 1.1);
        }
        c.globalAlpha = 1;
      }
    },

    // The venue's goings-on over the view from the car: the glow of what's lit (jack-o'-lanterns,
    // torches) flickering, lights drifting about (will-o'-the-wisps), the phantom's aura, bats
    // flitting over the sky (round the moon, mostly), comets going over, the flash of the
    // lightning. Everything from what's made already: nothing new each frame.
    ambient(s, ph, flash, ms) {
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      const k = this.k || 1;
      const cam = this.cam;
      const fx = this.th.fx;
      const reach = this.wx.mute ? 260 : 440;
      const t = ms / 1000;
      c.globalCompositeOperation = 'lighter';
      const lit = glowSprite(this.th.glow);
      const g = this.glowAt;
      for (let i = 0; i < g.length; i += 4) {
        if (!this.project(g[i], g[i + 1], g[i + 2]) || at.d > reach) continue;
        const size = at.s * g[i + 3] * 2.4;
        if (size < 3) continue;
        c.globalAlpha = Math.max(0, Math.min(1, (flicker(ms, i) - 0.62) * 2.4)) * (1 - at.d / reach);
        c.drawImage(lit, at.x - size / 2, at.y - size / 2, size, size);
      }
      const green = glowSprite(this.th.wisp);
      const w = this.wisps;
      for (let i = 0; i < w.length; i += 3) {
        const q = t + w[i + 2];
        if (!this.project(w[i] + Math.sin(q * 0.4) * 14, w[i + 1] + Math.cos(q * 0.33) * 10, 8 + Math.sin(q * 1.1) * 3) || at.d > reach) continue;
        const size = Math.max(5 * k, at.s * 10);
        c.globalAlpha = (0.6 + 0.35 * Math.sin(q * 1.3)) * Math.min(1, (reach - at.d) / 120);
        c.drawImage(green, at.x - size / 2, at.y - size / 2, size, size);
      }
      // (Capped: right next to the camera its glow would cover the screen in an additive blend,
      // which is what made phones stutter as the phantom went by.)
      if (ph && this.project(ph.x, ph.y, 6) && at.d < reach && at.d > 30) {
        const size = Math.min(at.s * 46, 160 * k);
        c.globalAlpha = 0.4 * ph.fade;
        c.drawImage(green, at.x - size / 2, at.y - size / 2, size, size);
      }
      // A comet across the sky now and then: its head where it is, its tail back where it's been.
      const comet = fx.comets ? cometNow(ms) : null;
      if (comet) {
        const r = seeded(`comet${comet.n}`);
        const az0 = cam.yaw + (r() - 0.5) * 1.6;
        const dir = r() < 0.5 ? -1 : 1;
        const sky = (f) => {
          const az = az0 + dir * f * 0.7;
          const el = 0.42 - f * 0.26;
          return this.project(cam.x + Math.cos(az) * 600, cam.y + Math.sin(az) * 600, cam.z + Math.tan(el) * 600);
        };
        if (sky(comet.f + 0.02)) {
          const x1 = at.x, y1 = at.y;
          if (sky(comet.f)) {
            const len = Math.min(220 * k, Math.max(40 * k, Math.hypot(x1 - at.x, y1 - at.y) * 9));
            c.globalAlpha = Math.min(1, (1 - comet.f) * 3, comet.f * 6);
            c.save();
            c.translate(x1, y1);
            c.rotate(Math.atan2(y1 - at.y, x1 - at.x));
            c.drawImage(cometSprite(), -len, -len / 16, len, len / 8);
            c.restore();
          }
        }
      }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      if (fx.bats) {
        const bats = batSprites();
        for (let i = 0; i < 9; i++) {
          const moon = i < 5;
          const az = moon ? MOON.az + Math.sin(t * 0.15 + i * 1.9) * 0.32 : i * 1.3 + t * 0.04 * (i % 2 ? 1 : -1);
          const el = (moon ? MOON.el + 0.02 : 0.16 + 0.05 * (i % 3)) + 0.04 * Math.sin(t * 0.7 + i * 2.3);
          if (!this.project(cam.x + Math.cos(az) * 600, cam.y + Math.sin(az) * 600, cam.z + Math.tan(el) * 600)) continue;
          const size = (moon ? 22 : 16) * k * (0.7 + (i % 3) * 0.2);
          c.drawImage(bats[Math.sin(t * 17 + i * 1.3) > 0 ? 0 : 1], at.x - size / 2, at.y - size / 4, size, size / 2);
        }
      }
      if (flash > 0) {
        c.globalAlpha = flash * 0.16;
        c.fillStyle = '#e8e0ff';
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
    },

    // Rainbow Road: a car being put back after a fall (flag 16) drops back onto the road from just
    // above it, blinking. How far above it is now, or -1 while it's blinked out.
    fallen: {},
    dropping(id, ms) {
      const f = this.fallen[id];
      if (!f || ms - f.seen > 400) this.fallen[id] = { from: ms, seen: ms };
      else f.seen = ms;
      const t = (ms - this.fallen[id].from) / 1000;
      if (t < 1 && Math.floor(t * 8) % 2) return -1;
      return Math.max(0, 14 * (1 - t / 1.1));
    },

    // Rain: spray thrown up behind the cars going at a lick.
    spray(s, cars, ids, ms) {
      const dt = (ms - (this.sprayAt || ms)) / 1000;
      this.sprayAt = ms;
      if (!this.wx.wet || s.phase !== 'race' || dt <= 0 || dt > 0.25) return;
      const c = this.hud.getContext('2d');
      c.fillStyle = 'rgba(222, 230, 240, 0.16)';
      c.beginPath();
      for (let i = 0; i < cars.length && i < 8; i++) {
        const car = cars[i];
        if (!car || !ids[i]) continue;
        const v = Math.hypot(car[0] - this.wasAt[i * 2], car[1] - this.wasAt[i * 2 + 1]) / dt;
        this.wasAt[i * 2] = car[0];
        this.wasAt[i * 2 + 1] = car[1];
        if (v < 40 || v > 400) continue;
        const ca = Math.cos(car[2]);
        const sa = Math.sin(car[2]);
        for (let k = 0; k < 3; k++) {
          if (!this.project(car[0] - ca * (17 + k * 9), car[1] - sa * (17 + k * 9), 3 + k * 2) || at.d > 400) continue;
          const r = Math.min(26 * this.k, at.s * (4 + k * 3) * Math.min(1, v / 150));
          c.moveTo(at.x + r, at.y);
          c.ellipse(at.x, at.y, r, r * 0.55, 0, 0, Math.PI * 2);
        }
      }
      c.fill();
    },

    // Rain or snow falling past (over the view from the car, or the map): the same few hundred
    // numbers moved along each frame, all drawn in one go. Turning sweeps them sideways.
    fall(s, wx, car, ms) {
      if (!wx.fall) return;
      const rain = wx.fall === 'rain';
      const n = rain ? 110 : 150;
      if (!this.drops || this.drops.length !== n * 3) {
        this.drops = new Float32Array(n * 3);
        const rand = seeded('drops');
        for (let i = 0; i < n * 3; i++) this.drops[i] = rand();
      }
      const dt = Math.min(0.1, Math.max(0, (ms - (this.fallAt || ms)) / 1000));
      this.fallAt = ms;
      let turn = car[2] - (this.fallYaw ?? car[2]);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.fallYaw = car[2];
      const speed = Math.min(1, this.cam.speed / 175);
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      const k = this.k || 1;
      const d = this.drops;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const sp = 0.5 + d[i * 3 + 2] * 0.5;
        let x = d[i * 3] - turn * 0.8;
        let y = d[i * 3 + 1] + dt * sp * (rain ? 1.5 + speed : 0.16 + speed * 0.3);
        if (!rain) x += Math.sin(ms * 0.0013 + i) * 0.0006;
        x -= Math.floor(x);
        y -= Math.floor(y);
        d[i * 3] = x;
        d[i * 3 + 1] = y;
        if (rain) {
          const len = (0.025 + 0.035 * speed) * H * sp;
          c.moveTo(x * W, y * H);
          c.lineTo(x * W - len * 0.12, y * H + len);
        } else {
          const r = (1 + sp * 2) * k;
          c.rect(x * W - r, y * H - r, r * 2, r * 2);
        }
      }
      if (rain) {
        c.lineWidth = Math.max(1, k);
        c.strokeStyle = 'rgba(205, 218, 238, 0.42)';
        c.stroke();
      } else {
        c.fillStyle = 'rgba(255, 255, 255, 0.85)';
        c.fill();
      }
    },

    // An avatar in a bubble of its driver's colour, drawn once.
    avatar(id) {
      const look = lookNow(id);
      const have = this.avatars[id];
      if (have && have.look === look) return have.cv; // (the same state: nothing's changed)
      if (have && have.from === `${look.avatar}${look.color}`) { have.look = look; return have.cv; }
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      c.fillStyle = 'rgba(0, 0, 0, 0.55)';
      c.beginPath();
      c.arc(32, 28, 26, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = look.color;
      c.stroke();
      c.beginPath();
      c.moveTo(24, 52);
      c.lineTo(32, 62);
      c.lineTo(40, 52);
      c.fillStyle = look.color;
      c.fill();
      c.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(look.avatar, 32, 30);
      this.avatars[id] = { from: `${look.avatar}${look.color}`, look, cv };
      return cv;
    },

    // No WebGL: the map from above, turned so the car points up the screen, close in.
    flat(s, cars, ids, car, portrait) {
      const tr = s.game.track;
      const flatKey = `${tr.id}:${themeIdOf(s)}:${weatherOf(s)}`; // (each venue's own look)
      if (!this.flatBg || this.flatKey !== flatKey) {
        this.flatBg = document.createElement('canvas');
        this.flatBg.width = tr.world.w * 2;
        this.flatBg.height = tr.world.h * 2;
        drawStatic(this.flatBg, tr, 2, 2);
        this.flatKey = flatKey;
      }
      const c = this.hud.getContext('2d');
      const W = this.hud.width;
      const H = this.hud.height;
      const z = (portrait ? W : H) / 170;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#1b1b1f';
      c.fillRect(0, 0, W, H);
      c.setTransform(z, 0, 0, z, W / 2, H * 0.68);
      c.rotate(-car[2] - Math.PI / 2);
      c.translate(-car[0], -car[1]);
      c.drawImage(this.flatBg, 0, 0, tr.world.w, tr.world.h);
      const now = performance.now();
      const wx = wxOf(s);
      const th = themeOf(s);
      if (th.along || th.field || th.wisps || th.fx.phantom || th.fx.comets) aboveFx(c, s, tr, now, th);
      if (wx.flat || wx.snow) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = wx.flat || 'rgba(255, 255, 255, 0.1)';
        c.fillRect(0, 0, W, H);
        c.setTransform(z, 0, 0, z, W / 2, H * 0.68);
        c.rotate(-car[2] - Math.PI / 2);
        c.translate(-car[0], -car[1]);
      }
      for (let i = 0; i < cars.length; i++) if (cars[i] && ids[i]) drawCar(c, cars[i], ids[i], { label: ids[i] !== s.me, mine: ids[i] === s.me, honk: now - (honked[ids[i]] || -1e9) < 900, lamps: wx.lamps });
      this.fall(s, wx, car, performance.now());
    },
  };

  // 3, 2, 1, GO over the track (and over the view from the car). Halloween: 3… 2… 1… BOO!
  function countText(s) {
    const words = themeOf(s).words;
    if (s.phase === 'countdown') return `${s.game.count}${words.count}`;
    if (s.phase === 'race' && (!snaps.length || snaps[snaps.length - 1].t < 1.2)) return words.go;
    return '';
  }
  const countClass = (text) => `tr-count ${text === 'GO!' ? 'go' : text === 'BOO!' ? 'go boo' : text.endsWith('…') ? 'spooky' : ''}`;
  const countHtml = (s) => {
    const text = countText(s);
    return `<div class="${countClass(text)}" data-count>${text ? `<b>${text}</b>` : ''}</div>`;
  };
  function updateCount(s) {
    const text = countText(s);
    document.querySelectorAll('[data-count]').forEach((el) => {
      if (el.dataset.shown === text) return;
      el.dataset.shown = text;
      el.className = countClass(text);
      el.innerHTML = text ? `<b>${text}</b>` : '';
    });
  }

  // A word across the view for a moment: a new lap, the last lap, the flag.
  let bannerTimer = null;
  function banner(text, stay = false) {
    const el = document.getElementById('tr-banner');
    if (!el) return;
    el.innerHTML = `<b>${esc(text)}</b>`;
    el.classList.remove('on');
    void el.offsetWidth; // (to play the animation again)
    el.classList.add('on');
    clearTimeout(bannerTimer);
    if (!stay) bannerTimer = setTimeout(() => el.classList.remove('on'), 1800);
  }

  // ---------- Standings ----------

  const backers = (s, id) => Object.entries(s.game.bets).filter(([, b]) => b.pick === id).map(([pid]) => pid);
  const fmt = (t) => (t == null ? 'DNF' : `${t.toFixed(1)}s`);

  function placesNow(s) {
    const g = s.game;
    const latest = s.phase === 'race' && snaps.length && snapRace === g.race ? snaps[snaps.length - 1].c : g.cars.c;
    return g.carIds.map((id, i) => ({ id, place: latest[i]?.[4] || i + 1, lap: latest[i]?.[5] || 1, done: !!(latest[i]?.[3] & 4) }))
      .sort((a, b) => a.place - b.place);
  }

  function boardRows(s) {
    const g = s.game;
    return placesNow(s).map((r) => `
      <div class="tr-row ${r.id === s.me && !PB.isTV ? 'me' : ''}">
        <b class="tr-pos">${r.place}</b>${PB.avatar(r.id, 'sm')}${carPic(r.id)}<span class="tr-name">${esc(PB.state.players.find((p) => p.id === r.id)?.name || '?')}
          <small class="tr-lap">${r.done ? '🏁 Finished' : s.phase === 'race' ? `Lap ${r.lap}/${g.laps}` : g.wins[r.id] ? `🏆×${g.wins[r.id]}` : ''}</small></span>
        <span class="tr-backers">${backers(s, r.id).map((id) => `${PB.avatar(id, 'sm')}<i>${g.bets[id].sips}</i>`).join('')}</span>
      </div>`).join('');
  }
  const board = (s) => `<div class="card tr-board"><h2>${s.phase === 'betting' ? '💰 The bets' : '🏁 Standings'}</h2><div id="tr-board">${boardRows(s)}</div></div>`;

  let boardKey = '';
  function updateBoard(s) {
    const el = document.getElementById('tr-board');
    if (!el) return;
    // (What placesNow would give, as a string, without making it: this runs on every update.)
    const g = s.game;
    const latest = s.phase === 'race' && snaps.length && snapRace === g.race ? snaps[snaps.length - 1].c : g.cars.c;
    let key = '';
    for (let i = 0; i < g.carIds.length; i++) {
      const c = latest[i];
      key += `${g.carIds[i]}:${c?.[4] || i + 1},${c?.[5] || 1},${c?.[3] & 4 ? 1 : 0};`;
    }
    if (key === boardKey) return;
    boardKey = key;
    el.innerHTML = boardRows(s);
    paintPics(el);
  }

  // ---------- Steering ----------

  const input = { steer: 0, gas: 0, brake: 0 };
  const held = { left: 0, right: 0, kLeft: 0, kRight: 0 };
  let sent = { steer: 0, gas: 0, brake: 0 };
  let lastSend = 0;
  let sendTimer = null;
  const tilt = {
    live: false, // tilt events are arriving
    granted: false, // iPhone: allowed
    denied: false,
    raw: 0, // the phone's angle now (degrees, + = clockwise)
    zero: null, // ...when held level
    listening: false,
  };
  // (An iPhone: tilt needs asking for, and nothing arrives till it's allowed.)
  const needsPermission = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  const canAsk = () => needsPermission() && !tilt.granted && !tilt.denied && !tilt.live;
  let mode = (() => { try { return localStorage.getItem('tr-controls'); } catch { return null; } })(); // 'tilt' | 'buttons' | null
  const useTilt = () => mode !== 'buttons' && tilt.live;
  const setMode = (m) => {
    mode = m;
    try { localStorage.setItem('tr-controls', m); } catch {}
  };

  const driving = () => {
    const s = PB.state;
    return s?.gameType === 'trackRacing' && (s.phase === 'race' || s.phase === 'countdown') && s.game?.racers.includes(s.me) && !PB.isTV;
  };

  // Steering and pedals go to the server when they change, never more than every SEND_GAP ms.
  function pushInput() {
    if (!driving()) return;
    const q = { steer: Math.round(input.steer * 20) / 20, gas: input.gas, brake: input.brake };
    if (q.steer === sent.steer && q.gas === sent.gas && q.brake === sent.brake) return;
    const wait = SEND_GAP - (Date.now() - lastSend);
    if (wait > 0) {
      sendTimer ??= setTimeout(() => { sendTimer = null; pushInput(); }, wait);
      return;
    }
    lastSend = Date.now();
    sent = q;
    PB.act('drive', q);
  }

  function setSteer() {
    const buttons = held.right + held.kRight - held.left - held.kLeft;
    if (useTilt() && !buttons) {
      let d = tilt.raw - (tilt.zero ?? 0);
      d = ((d + 540) % 360) - 180;
      input.steer = Math.abs(d) < 2 ? 0 : Math.max(-1, Math.min(1, d / FULL_LOCK));
    } else {
      input.steer = Math.max(-1, Math.min(1, buttons));
    }
    const wheel = document.getElementById('tr-wheel');
    if (wheel) wheel.style.transform = `rotate(${(input.steer * 100).toFixed(1)}deg)`;
    pushInput();
  }

  // The phone's angle in the plane of its screen. Gravity in the phone's own frame comes from
  // beta (tipped forward or back) and gamma (tipped left or right); turned into the screen's frame
  // (portrait or either landscape) its direction across the screen is the wheel's angle. When the
  // phone is nearly flat that angle would jump about, so the lean counts against a floor instead.
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const r = Math.PI / 180;
    const b = e.beta * r;
    const gm = e.gamma * r;
    const gx = Math.sin(gm) * Math.cos(b);
    const gy = -Math.sin(b);
    const o = (screen.orientation?.angle ?? window.orientation ?? 0) * r;
    const sx = gx * Math.cos(o) - gy * Math.sin(o);
    const sy = gx * Math.sin(o) + gy * Math.cos(o);
    const angle = Math.atan2(sx, Math.max(0.5, -sy)) / r;
    tilt.raw = tilt.zero == null ? angle : tilt.raw + (angle - tilt.raw) * 0.5;
    if (tilt.zero == null) tilt.zero = 0; // straight up is straight on, till you recentre
    if (!tilt.live) {
      tilt.live = true;
      if (PB.state?.gameType === 'trackRacing') PB.rerender();
    }
    setSteer();
  }
  function listen() {
    if (tilt.listening || typeof window.DeviceOrientationEvent === 'undefined') return;
    tilt.listening = true;
    window.addEventListener('deviceorientation', onOrient);
  }
  // iPhone: asked from a tap.
  function askTilt() {
    DeviceOrientationEvent.requestPermission().then((state) => {
      tilt.granted = state === 'granted';
      tilt.denied = !tilt.granted;
      if (tilt.granted) setMode('tilt');
      PB.rerender();
    }).catch(() => { tilt.denied = true; PB.rerender(); });
  }

  // Desktop: arrow keys (or WASD), space for the horn.
  const KEYS = { ArrowLeft: 'kLeft', a: 'kLeft', A: 'kLeft', ArrowRight: 'kRight', d: 'kRight', D: 'kRight', ArrowUp: 'gas', w: 'gas', W: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake' };
  function onKey(e) {
    if (!driving() || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const k = KEYS[e.key];
    const down = e.type === 'keydown' ? 1 : 0;
    if (e.key === ' ' && down && !e.repeat) { e.preventDefault(); PB.act('honk'); return; }
    if (!k) return;
    e.preventDefault();
    if (k === 'gas' || k === 'brake') { input[k] = down; pedalLook(); pushInput(); } else { held[k] = down; setSteer(); }
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  function pedalLook() {
    document.querySelectorAll('[data-pedal]').forEach((el) => el.classList.toggle('on', !!input[el.dataset.pedal]));
  }

  function bindControls() {
    // Each pedal and button follows its own finger (several at once).
    document.querySelectorAll('[data-pedal], [data-steer]').forEach((el) => {
      const set = (v) => {
        if (el.dataset.pedal) { input[el.dataset.pedal] = v; pedalLook(); pushInput(); } else { held[el.dataset.steer] = v; el.classList.toggle('on', !!v); setSteer(); }
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture?.(e.pointerId); } catch {}
        set(1);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => set(0));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  function wheelSvg(s) {
    const look = PB.look(s.me);
    return `<svg class="tr-wheel" id="tr-wheel" viewBox="-50 -50 100 100" aria-hidden="true" style="transform:rotate(${(input.steer * 100).toFixed(1)}deg)">
      <circle r="44" fill="none" stroke="#1d1d22" stroke-width="10"/>
      <circle r="44" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" stroke-dasharray="4 6"/>
      <path d="M -40 4 L -14 8 M 40 4 L 14 8 M 0 16 L 0 41" stroke="#2a2a30" stroke-width="9" stroke-linecap="round"/>
      <rect x="-4" y="-49" width="8" height="10" rx="2" fill="${esc(look.color)}"/>
      <circle r="17" fill="#2a2a30"/><circle r="14" fill="${esc(look.color)}"/>
      <text y="5.5" text-anchor="middle" font-size="16">${esc(look.avatar)}</text>
    </svg>`;
  }

  // The buttons over the view: allowing tilt, switching between tilt and buttons, recentring.
  function modeBar() {
    if (useTilt()) return '<button class="secondary tr-small" data-tr="centre">⟲ This is straight</button><button class="secondary tr-small" data-tr="buttons">Use buttons</button>';
    if (canAsk()) return '<button class="tr-enable" data-tr="tilt-enable">🎮 Enable tilt steering</button>';
    return tilt.live ? '<button class="secondary tr-small" data-tr="tilt">📱 Steer by tilting</button>' : '';
  }

  // ---------- Your car's sounds ----------
  //
  // On your own phone, TV or not (the TV plays the room's sounds for everyone, but an engine that
  // follows your foot only makes sense in your hand). Made with Web Audio on the phone's one sound
  // context (Prefs.audio), so the ⚙️ sound switch and volume rule them, and it only wakes up after
  // a tap (the pedals, the tilt button, a bet: the phone won't play before one).
  //
  // One graph a race, built when you first drive and kept till the race is over: oscillators for
  // the engine (the note from a pretend gearbox, the loudness from your foot), and one looping
  // noise feeding the tyres' screech and the grass's rumble, each a filter and a gain that sit at
  // nothing till they're wanted. Knocks, laps, passing cars and a trolley's clatter are one-shots
  // that tidy themselves away. Anything that stops the frames (the race over, leaving, a locked
  // phone) stops the engine: it's only kept going by them.
  //
  // Every engine is a smooth, low hum, not a buzz: soft waves (a triangle, or a sine), a sine an
  // octave down, a second sine a hair off the note for warmth, through a gentle low-pass. What
  // tells the cars apart is the pitch, how lumpy the idle is and how loud they are.
  //
  // Each body's engine: the firing note at idle and at the redline (Hz), the wave, how much of the
  // lower octave, how lumpy the idle is, how bright, how loud, and the top of each gear (units a
  // second; the last runs to top speed).
  const ENGINES = {
    sports: { idle: 52, top: 195, wave: 'triangle', sub: 0.3, lump: 0.15, tone: 1, loud: 1, gears: [55, 95, 135] },
    pickup: { idle: 40, top: 140, wave: 'triangle', sub: 0.5, lump: 0.3, tone: 0.8, loud: 1, gears: [50, 100] },
    van: { idle: 34, top: 108, wave: 'triangle', sub: 0.5, lump: 0.25, tone: 0.6, loud: 0.95, gears: [40, 80, 120] }, // a tired minibus
    buggy: { idle: 60, top: 215, wave: 'triangle', sub: 0.15, lump: 0.35, tone: 0.85, loud: 0.85, gears: [60, 115] }, // a little air-cooled one
    hotrod: { idle: 30, top: 125, wave: 'triangle', sub: 0.7, lump: 0.7, tone: 0.8, loud: 1.1, gears: [65, 125] }, // the big lazy V8 lope (still a little lumpy)
    // A shopping trolley: no engine to speak of, just the faintest hum, and the light, uneven
    // clatter of its little wheels and wire cage (see clack).
    trolley: { idle: 70, top: 140, wave: 'sine', sub: 0, lump: 0, tone: 0.4, loud: 0.12, gears: [], clatter: true },
  };
  const TOP_SPEED = 175; // (the server's CAR.top)

  // Which gear the pretend gearbox is in at speed v, and how far up its revs are (0 to 1). Straight
  // after a change up the revs drop back, which is the dip you hear at speed.
  function gearAt(e, v) {
    let lo = 0;
    for (let n = 0; n <= e.gears.length; n++) {
      const hi = n < e.gears.length ? e.gears[n] : TOP_SPEED * 1.4; // (flat out isn't the redline: no screaming)
      if (v < hi || n === e.gears.length) {
        const from = n ? 0.42 : 0.06;
        return { gear: n, rpm: from + (1 - from) * Math.max(0, Math.min(1, (v - lo) / (hi - lo))) };
      }
      lo = hi;
    }
    return { gear: 0, rpm: 0 };
  }

  const sound = {
    g: null, // this race's graph
    v: 0, // your speed, smoothed (units a second)
    side: 0, // ...and how fast you're sliding sideways
    gas: 0, // your foot, smoothed
    rpm: 0,
    gear: 0,
    shift: 0, // when the last change up was (ms)
    was: null, // where your car was last frame: [x, y, t]
    near: [], // each other car: which side of you it was last frame (+1 ahead, -1 behind, 0 not close)
    passed: [], // ...and when it last whooshed past
    hitAt: 0,
    seen: '', // the race moment last drawn: race, phase and count
    stats: { built: 0, stopped: 0, screech: 0, thud: 0, crunch: 0, whoosh: 0, lap: 0, final: 0, finish: 0, beep: 0, go: 0, horn: 0, shots: 0, why: {} }, // (for tests)

    // The context, if sound's on and the phone has been tapped (before that, the phone won't
    // start one, and grumbles about being asked).
    audio() {
      if (!window.Prefs?.get().sound || document.hidden) return null;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
      return window.Prefs.audio();
    },
    volume: () => window.Prefs?.get().volume ?? 0.7,
    // The car itself (engine, tyres, knocks, passing cars) can be switched off on the race screen
    // (🔈), remembered on the phone; the countdown, laps, finish and horn play either way.
    carOn() {
      try { return localStorage.getItem('tr-car-sound') !== 'off'; } catch { return true; }
    },

    noiseBuf: null,
    noise(ac) {
      if (!this.noiseBuf || this.noiseBuf.sampleRate !== ac.sampleRate) {
        this.noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf;
      return src;
    },

    build(ac, s) {
      const e = ENGINES[lookOf(s.me, s).body] || ENGINES.sports;
      const t = ac.currentTime;
      const osc = (type, freq) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; o.start(t); return o; };
      const gain = (v) => { const n = ac.createGain(); n.gain.value = v; return n; };
      const filter = (type, freq, q) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
      const master = gain(0);
      master.gain.setTargetAtTime(this.volume() * 0.22, t, 0.05);
      master.connect(ac.destination);
      // The engine: the note, a soft sine a hair off it (a slow beat: warmth, not roughness), a
      // sine an octave below, through a gentle low-pass (no peak) that opens a little with the
      // throttle; then a wobble in the loudness at half the note, which is the idle's lumpiness,
      // fading as it revs.
      const a = osc(e.wave, e.idle);
      const b = osc('sine', e.idle * 1.004);
      const sub = osc('sine', e.idle / 2);
      const mixer = gain(0.5);
      const subGain = gain(e.sub * 0.6);
      a.connect(mixer);
      b.connect(gain(0.2)).connect(mixer);
      sub.connect(subGain).connect(mixer);
      const tone = filter('lowpass', 350, 0.7);
      const lump = gain(1);
      const lfo = osc('sine', e.idle / 2);
      const lumpDepth = gain(0);
      lfo.connect(lumpDepth).connect(lump.gain);
      const engine = gain(0);
      mixer.connect(tone).connect(lump).connect(engine).connect(master);
      // The tyres and the ground, all from one noise.
      const hiss = this.noise(ac);
      hiss.loop = true;
      hiss.start(t, Math.random());
      // A screech: a narrow band, wavering.
      const squeal = filter('bandpass', 1800, 9);
      const waver = osc('sine', 7);
      const waverDepth = gain(120);
      waver.connect(waverDepth).connect(squeal.frequency);
      const screech = gain(0);
      hiss.connect(squeal).connect(screech).connect(master);
      // The grass and gravel: a rumble, shaken (low, but not so low a phone can't play it).
      const low = filter('lowpass', 420, 0.7);
      const rumble = gain(0);
      const shake = gain(0.6);
      const shaker = osc('square', 11);
      shaker.connect(gain(0.4)).connect(shake.gain);
      hiss.connect(low).connect(rumble).connect(shake).connect(master);
      this.stats.built++;
      return {
        race: s.game.race, e, ac, master, a, b, sub, lfo, lumpDepth, tone, engine, squeal, screech, rumble, shaker, finished: 0,
        sources: [a, b, sub, lfo, hiss, waver, shaker],
        skidding: false,
        alive: performance.now(),
      };
    },

    // Every frame you're driving: your car's sounds follow it.
    drive(s, cars, ids, now) {
      const mine = ids.indexOf(s.me);
      const car = cars[mine];
      const ac = car && this.carOn() && this.audio();
      if (!ac) { this.stop('no sound'); return; }
      if (this.g && this.g.race !== s.game.race) this.stop('new race');
      if (!this.g) {
        this.g = this.build(ac, s);
        this.was = null;
        this.v = this.side = this.gas = this.rpm = 0;
        this.near.length = 0;
        this.watch();
      }
      const g = this.g;
      const e = g.e;
      g.alive = performance.now();
      const T = ac.currentTime;
      // How fast you're going, and how much of it is sideways (the car's own heading against the
      // way it's actually moving), from where it's drawn: smoothed, as the camera does.
      const was = this.was;
      const dt = was ? Math.min(0.1, Math.max(0.001, (now - was[2]) / 1000)) : 0;
      if (dt) {
        const vx = (car[0] - was[0]) / dt;
        const vy = (car[1] - was[1]) / dt;
        const k = 1 - Math.exp(-dt * 6);
        this.v += (Math.min(260, Math.hypot(vx, vy)) - this.v) * k;
        this.side += (Math.min(200, Math.abs(-vx * Math.sin(car[2]) + vy * Math.cos(car[2]))) - this.side) * k;
        this.gas += ((input.gas ? 1 : 0) - this.gas) * (1 - Math.exp(-dt * 10));
      }
      this.was = was || [0, 0, 0];
      this.was[0] = car[0]; this.was[1] = car[1]; this.was[2] = now;
      const racing = s.phase === 'race';
      const done = !!(car[3] & 4);
      if (done && !g.finished) g.finished = now;
      const foot = done ? 0 : this.gas;
      // The revs: the gearbox's, or with your foot down and going nowhere (the grid, the
      // wheels spinning off the line), revving freely.
      const box = gearAt(e, this.v);
      let rpm = box.rpm;
      if (foot > 0.1 && this.v < 40) rpm = Math.max(rpm, racing ? 0.3 + this.v / 70 : 0.72 * foot);
      if (box.gear > this.gear && foot > 0.5) this.shift = now;
      this.gear = box.gear;
      this.rpm += (rpm - this.rpm) * (dt ? 1 - Math.exp(-dt * (rpm > this.rpm ? 7 : 4)) : 1);
      const shifting = now - this.shift < 140;
      const fade = g.finished ? Math.max(0, 1 - (now - g.finished) / 3000) : 1; // idling down over the line
      const f = e.idle + (e.top - e.idle) * this.rpm;
      g.a.frequency.setTargetAtTime(f, T, 0.03);
      g.b.frequency.setTargetAtTime(f * 1.004, T, 0.03);
      g.sub.frequency.setTargetAtTime(f / 2, T, 0.03);
      g.lfo.frequency.setTargetAtTime(f / 2, T, 0.05);
      g.lumpDepth.gain.setTargetAtTime(e.lump * 0.4 * (1 - this.rpm), T, 0.05);
      // (Never darker than the low hundreds: a phone's speaker can't play the note itself, only
      // what's just over it. Opening only a little with your foot: brighter is buzzier.)
      g.tone.frequency.setTargetAtTime(0.6 * e.tone * (450 + 550 * this.rpm + 450 * foot * this.rpm) * (shifting ? 0.7 : 1), T, 0.04);
      // Quieter off the gas, and for a moment as it changes up.
      g.engine.gain.setTargetAtTime(e.loud * 0.32 * (0.4 + 0.45 * foot + 0.25 * this.rpm) * (shifting ? 0.45 : 1) * fade, T, shifting ? 0.02 : 0.06);
      g.master.gain.setTargetAtTime(this.volume() * 0.22, T, 0.1);
      // Tyres: a screech when the back's out (the server says so: flag 1) or you slide sideways
      // hard, or stand on the brakes flat out; on the grass, a rumble instead.
      const grass = !!(car[3] & 2);
      let skid = 0;
      if (racing && !grass) {
        if (car[3] & 1 || this.side > 45) skid = Math.min(1, Math.max(0.35, (this.side - 20) / 60));
        if (car[3] & 8 && this.v > 110) skid = Math.max(skid, 0.4 * Math.min(1, (this.v - 110) / 50));
      }
      if (skid > 0.1 && !g.skidding) this.stats.screech++;
      g.skidding = skid > 0.1;
      g.screech.gain.setTargetAtTime(0.07 * skid, T, skid ? 0.03 : 0.08);
      g.squeal.frequency.setTargetAtTime(1500 + 700 * skid, T, 0.05);
      const rough = grass && this.v > 4 ? Math.min(1, this.v / 60) : 0;
      g.rumble.gain.setTargetAtTime(0.3 * rough, T, 0.06);
      g.shaker.frequency.setTargetAtTime(8 + this.v / 8, T, 0.1);
      // A trolley's wheels and cage: now and then a tick, at random (more the faster it goes, a
      // few more on the grass), never a steady buzz.
      if (e.clatter && dt && this.v > 8 && Math.random() < (6 * Math.min(1, this.v / TOP_SPEED) + (grass ? 3 : 0)) * dt) this.clack(g, T, grass);
      if (racing) this.passing(s, cars, mine, now);
    },

    // One tick of a trolley's clatter (or two together, the cage): a few milliseconds of noise,
    // pitched at random, well under the engines of the other cars.
    clack(g, T, rough) {
      const ac = g.ac;
      const n = Math.random() < 0.3 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const t = T + 0.01 + k * (0.025 + Math.random() * 0.035);
        const src = this.noise(ac);
        const band = ac.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1600 + Math.random() * 2600;
        band.Q.value = 2.5;
        const v = ac.createGain();
        const len = 0.012 + Math.random() * 0.02;
        v.gain.setValueAtTime(0.0001, t);
        v.gain.exponentialRampToValueAtTime((0.025 + Math.random() * 0.025) * (rough ? 1.4 : 1), t + 0.002);
        v.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(band).connect(v).connect(g.master);
        src.start(t, Math.random() * 1.9);
        src.stop(t + len + 0.01);
        src.onended = () => { try { v.disconnect(); } catch {} };
      }
      this.stats.clack = (this.stats.clack || 0) + 1;
    },

    // Another car going by close (either of you overtaking): a whoosh from its side.
    passing(s, cars, mine, now) {
      const me = cars[mine];
      const fx = Math.cos(me[2]);
      const fy = Math.sin(me[2]);
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (i === mine || !c) continue;
        const dx = c[0] - me[0];
        const dy = c[1] - me[1];
        const close = dx * dx + dy * dy < 40 * 40;
        const ahead = dx * fx + dy * fy > 0 ? 1 : -1;
        const was = this.near[i] || 0;
        this.near[i] = close ? ahead : 0;
        if (!close || !was || was === ahead || this.v < 50 || now - (this.passed[i] || 0) < 2500) continue;
        this.passed[i] = now;
        this.whoosh(dx * -fy + dy * fx > 0 ? 1 : -1);
      }
    },

    // Stops the engine there and then, and lets the graph go.
    stop(why = 'off') {
      const g = this.g;
      if (!g) return;
      this.g = null;
      clearInterval(this.timer);
      this.timer = null;
      this.stats.stopped++;
      this.stats.why[why] = (this.stats.why[why] || 0) + 1;
      const t = g.ac.currentTime;
      try {
        g.master.gain.cancelScheduledValues(t);
        g.master.gain.setTargetAtTime(0, t, 0.01);
        for (const src of g.sources) src.stop(t + 0.06);
      } catch {}
      setTimeout(() => { try { g.master.disconnect(); } catch {} }, 120);
    },
    // Only the frames keep it going. Leaving, the race ending and hiding the page stop it there
    // and then (stop's callers); this is in case the frames stop some other way: quiet soon after,
    // let go if they don't come back (not at the first stall: a slow phone can drop a few frames
    // loading the track, and a gap in the engine would be heard).
    watch() {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        const g = this.g;
        const idle = g ? performance.now() - g.alive : 0;
        if (idle > 2000) this.stop('no frames');
        else if (idle > 700) g.master.gain.setTargetAtTime(0, g.ac.currentTime, 0.02);
      }, 150);
    },

    // ---- One-shots ----

    // Somewhere for one sound to go, cleared away once it's done.
    out(gain, len, pan = 0) {
      const ac = this.audio();
      if (!ac) return null;
      const out = ac.createGain();
      out.gain.value = gain * this.volume();
      if (pan && ac.createStereoPanner) {
        const p = ac.createStereoPanner();
        p.pan.value = pan;
        out.connect(p).connect(ac.destination);
        setTimeout(() => { try { p.disconnect(); } catch {} }, (len + 0.3) * 1000);
      } else out.connect(ac.destination);
      setTimeout(() => { try { out.disconnect(); } catch {} }, (len + 0.3) * 1000);
      this.stats.shots++;
      return { ac, out, t: ac.currentTime };
    },
    note(o, { freq, to, type = 'sine', at = 0, len = 0.2, gain = 0.3 }) {
      const { ac, out } = o;
      const t = o.t + at;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + len + 0.02);
    },
    hiss(o, { at = 0, len = 0.1, type = 'bandpass', freq = 1000, to, q = 1, gain = 0.3 }) {
      const { ac, out } = o;
      const t = o.t + at;
      const src = this.noise(ac);
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (to) f.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, len / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + len + 0.02);
    },

    // A knock (the moment the phone buzzes): a thud off the wall, a crunch off another car.
    hit(withCar) {
      const now = performance.now();
      if (now - this.hitAt < 150) return;
      this.hitAt = now;
      const k = 0.45 + 0.55 * Math.min(1, this.v / 150);
      const o = this.carOn() && this.out(0.45 * k, 0.35);
      if (!o) return;
      this.note(o, { freq: 120, to: 42, len: 0.25, gain: 0.6 });
      this.note(o, { freq: 190, to: 90, type: 'triangle', len: 0.12, gain: 0.35 });
      this.hiss(o, { type: 'lowpass', freq: 900, to: 200, len: 0.16, gain: 0.5 });
      if (withCar) {
        this.stats.crunch++;
        for (let i = 0; i < 4; i++) this.hiss(o, { at: i * 0.025 + Math.random() * 0.015, len: 0.05, freq: 2200 + Math.random() * 1800, q: 3, gain: 0.3 });
        this.note(o, { freq: 340, to: 290, type: 'square', at: 0.01, len: 0.07, gain: 0.07 });
      } else this.stats.thud++;
    },
    whoosh(pan) {
      const o = this.carOn() && this.out(0.25, 0.6, pan * 0.7);
      if (!o) return;
      this.stats.whoosh++;
      this.hiss(o, { len: 0.5, freq: 2600, to: 700, q: 0.9, gain: 0.25 });
      this.note(o, { freq: 160, to: 110, type: 'sawtooth', len: 0.5, gain: 0.06 });
    },
    // Each lap a two-note chime; the last one a little fanfare.
    lap(final) {
      const o = this.out(1, final ? 1 : 0.6);
      if (!o) return;
      if (final) {
        this.stats.final++;
        [523, 659, 784].forEach((freq, i) => this.note(o, { freq, type: 'triangle', at: i * 0.1, len: 0.14, gain: 0.25 }));
        this.note(o, { freq: 1047, type: 'triangle', at: 0.3, len: 0.6, gain: 0.25 });
        this.note(o, { freq: 1047, type: 'square', at: 0.3, len: 0.35, gain: 0.04 });
      } else {
        this.stats.lap++;
        this.note(o, { freq: 988, len: 0.25, gain: 0.2 });
        this.note(o, { freq: 1319, at: 0.11, len: 0.4, gain: 0.2 });
      }
    },
    // Over the line: the fanfare for a win, a bright ding-ding for a place, and the sad trombone
    // for last (who drinks).
    finish(place, of) {
      this.stats.finish++;
      if (place === 1) return window.Prefs?.play('win');
      const last = of > 1 && place === of;
      const o = this.out(1, 1.6);
      if (!o) return;
      if (last) {
        [392, 370, 349].forEach((freq, i) => this.note(o, { freq, type: 'sawtooth', at: i * 0.3, len: 0.28, gain: 0.08 }));
        this.note(o, { freq: 330, to: 300, type: 'sawtooth', at: 0.9, len: 0.6, gain: 0.08 });
      } else {
        this.note(o, { freq: 784, type: 'triangle', len: 0.18, gain: 0.25 });
        this.note(o, { freq: 1175, type: 'triangle', at: 0.14, len: 0.45, gain: 0.25 });
      }
    },

    // The race's moments on a driver's phone with a TV (with none, the app plays them: the screen's
    // `sounds`, below); and the engine off once the race is.
    moments(s) {
      const g = s.game;
      const live = s.phase === 'countdown' || s.phase === 'race';
      if (!live) this.stop('race over');
      const seen = `${g.race}:${s.phase}:${g.count}`;
      if (seen === this.seen) return;
      const was = this.seen.split(':');
      this.seen = seen;
      if (!s.tv || PB.isTV || !g.racers.includes(s.me) || was[0] !== String(g.race)) return;
      if (s.phase === 'countdown') { this.stats.beep++; window.Prefs?.play('beep'); }
      if (s.phase === 'race' && was[1] === 'countdown') { this.stats.go++; window.Prefs?.play('go'); }
    },
  };
  // A locked phone or another tab: quiet at once.
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.stop('hidden'); });

  // ---------- Screens ----------

  function hud(s) {
    const g = s.game;
    return `<div class="tr-hud">
      <div class="tr-place"><b id="tr-place">${lastMine.place ? ordinal(lastMine.place) : '–'}</b><small>of ${g.racers.length}</small></div>
      <div class="tr-laps" id="tr-lap">${lastMine.done ? 'Finished!' : `Lap ${lastMine.lap || 1}/${g.laps}`}</div>
      <button class="tr-horn" data-tr="horn" aria-label="Horn">📯</button>
      <button class="tr-horn tr-carsound" data-tr="carsound" aria-label="Car sounds">${sound.carOn() ? '🔈' : '🔇'}</button>
      ${PB.endButton('end-mini')}
    </div>`;
  }

  const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

  // The race from your car, filling the screen. Over it: your place and lap along the top (and,
  // with no TV, the map in a corner), the wheel small at the bottom. Touch anywhere on the right
  // half for gas, the left half to brake; steering by buttons, each half splits in two.
  function driveScreen(s) {
    const tiltOn = useTilt();
    const land = PB.landscape();
    const zones = tiltOn
      ? '<button class="tr-zone brake" data-pedal="brake"><span>BRAKE</span></button><button class="tr-zone gas" data-pedal="gas"><span>GAS</span></button>'
      : `<button class="tr-zone steer" data-steer="left" aria-label="Steer left"><span>◀</span></button><button class="tr-zone steer" data-steer="right" aria-label="Steer right"><span>▶</span></button>
         <button class="tr-zone brake" data-pedal="brake"><span>BRAKE</span></button><button class="tr-zone gas" data-pedal="gas"><span>GAS</span></button>`;
    return `<div class="tr-drive ${tiltOn ? 'tilt' : 'buttons'} ${land ? 'land' : 'port'} ${s.tv ? 'has-tv' : ''}">
      <div class="tr-view">${countHtml(s)}<div class="tr-banner" id="tr-banner"></div></div>
      <div class="tr-zones">${zones}</div>
      ${hud(s)}
      ${s.tv ? '' : `<div class="tr-minimap">${stage(s, { mini: true })}</div>`}
      <div class="tr-wheel-box">${wheelSvg(s)}</div>
      <div class="tr-modes">${modeBar()}</div>
    </div>`;
  }

  // ---------- Your car ----------
  //
  // The garage: pick a body, a paint, a stripe and an extra, with the car turning slowly above
  // (its own model, drawn flat: see flatModel). Each tap goes straight to the server, and into
  // this phone's memory, so the next game starts with the same car (sent as soon as it starts).
  const SAVED = 'tr-car';
  const saved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || 'null'); } catch { return null; } };
  let carDraft = null; // what the garage shows (yours, as far as this phone knows)
  let garageOpen = null; // null: open if you've never picked a car on this phone
  let editing = false; // the results screen: "Edit car" tapped (till the next race)
  let autoSent = false;

  let seenLook = '';
  function myDraft(s) {
    const g = s.game;
    // (What the server has wins when it changes: this car was picked on another screen, or a
    // reload. Pass and play: whoever's holding the phone.)
    const theirs = JSON.stringify(g.myLook);
    if (!carDraft || PB.passAndPlay || theirs !== seenLook) {
      seenLook = theirs;
      carDraft = { ...PLAIN, ...(g.myLook || (!PB.passAndPlay && saved()) || {}) };
    }
    return carDraft;
  }

  function garage(s) {
    const g = s.game;
    const look = myDraft(s);
    const parts = g.carParts || { bodies: Object.keys(BODY_NAMES), extras: Object.keys(EXTRA_NAMES), paints: [] };
    const open = garageOpen ?? !saved();
    const own = PB.look(s.me).color;
    const chips = (k, list, names) => list.map((v) => `<button class="${look[k] === v ? 'selected' : ''}" data-tr="look" data-k="${k}" data-v="${esc(v)}">${esc(names[v] || v)}</button>`).join('');
    const swatches = (k, first) => [[null, first], ...parts.paints.map((c) => [c, ''])].map(([v, label]) => `<button class="tr-swatch ${look[k] === v ? 'selected' : ''} ${v ? '' : 'none'}" data-tr="look" data-k="${k}" data-v="${esc(v || '')}" style="--sw:${esc(v || (k === 'paint' ? own : 'transparent'))}" aria-label="${esc(label || v)}">${label ? `<span>${esc(label)}</span>` : ''}</button>`).join('');
    return `<details class="card tr-garage" ${open ? 'open' : ''}>
      <summary>🔧 Your car <small>${esc(BODY_NAMES[look.body] || '')}${look.extra !== 'none' ? ` · ${esc(EXTRA_NAMES[look.extra] || '')}` : ''}</small></summary>
      <div class="tr-garage-in">
        <div class="tr-preview" role="img" aria-label="Your car"></div>
        <div class="tr-garage-opts">
          <h3>Body</h3><div class="tr-chips">${chips('body', parts.bodies, BODY_NAMES)}</div>
          <h3>Paint</h3><div class="tr-swatches">${swatches('paint', 'Yours')}</div>
          <h3>Stripes</h3><div class="tr-swatches">${swatches('stripe', 'None')}</div>
          <h3>Extra</h3><div class="tr-chips">${chips('extra', parts.extras, EXTRA_NAMES)}</div>
        </div>
      </div>
    </details>`;
  }

  // A tap in the garage: the car changes here at once, and goes to the server.
  function pickPart(s, k, v) {
    const look = myDraft(s);
    look[k] = v || null;
    const send = { body: look.body, paint: look.paint, stripe: look.stripe, extra: look.extra };
    if (!PB.passAndPlay) { try { localStorage.setItem(SAVED, JSON.stringify(send)); } catch {} }
    PB.act('car', send);
  }

  // A new game: this phone's car, as it was last time (it's only remembered once it's picked).
  function sendSaved(s) {
    if (autoSent || PB.isTV || PB.passAndPlay || s.game.myLook || s.phase === 'race' || s.phase === 'countdown') return;
    autoSent = true;
    const look = saved();
    if (look) PB.act('car', look);
  }

  // The preview: the car turning slowly, seen from a little above. Its own small WebGL canvas
  // (the same model shader as the view from the car), kept for the visit and moved into the
  // garage each time it's drawn. With no WebGL, the model drawn flat (good enough to pick by).
  const preview = { cv: null, gl: null, M: null, buf: null, count: 0, key: '', tint: [1, 1, 1], fm: null, yaw: 0.6, frame: null, at: 0, vp: new Float32Array(16), flat: false };
  function startPreview(s) {
    const box = document.querySelector('.tr-preview');
    if (!box) return;
    if (!preview.cv) {
      preview.cv = document.createElement('canvas');
      preview.gl = preview.cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
      preview.M = preview.gl && program(preview.gl, MODEL_VS, MODEL_FS);
      preview.flat = !preview.M;
      if (!preview.flat) preview.buf = preview.gl.createBuffer();
    }
    box.append(preview.cv);
    const look = { ...myDraft(s), n: lookOf(s.me, s).n };
    const paint = look.paint || PB.look(s.me).color;
    const key = `${meshKey(look)}:${paint}`;
    if (key !== preview.key) {
      preview.key = key;
      const { v } = carModel(look, { shadow: !preview.flat });
      if (preview.flat) preview.fm = flatModel(v, paint);
      else {
        const gl = preview.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
        gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
        preview.count = v.length / 7;
        preview.tint = rgb(paint, [0.9, 0.3, 0.3]);
      }
    }
    if (!preview.frame) preview.frame = requestAnimationFrame(drawPreview);
  }
  const placePreview = (x, y, z, out, k) => {
    const { ca, sa, cx, cy, S } = preview;
    const xr = x * ca - y * sa;
    const yr = x * sa + y * ca;
    out[k] = cx + xr * S;
    out[k + 1] = cy - (z * 0.86 + yr * 0.5) * S;
    return yr * 0.86 - z * 0.5;
  };
  function drawPreview(ms) {
    preview.frame = null;
    const cv = preview.cv;
    if (!cv || !cv.isConnected || document.hidden) return;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) { preview.frame = requestAnimationFrame(drawPreview); return; }
    const k = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * k) || cv.height !== Math.round(h * k)) { cv.width = Math.round(w * k); cv.height = Math.round(h * k); }
    const dt = Math.min(0.1, (ms - (preview.at || ms)) / 1000);
    preview.at = ms;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) preview.yaw += dt * 0.7;
    const W = cv.width;
    const H = cv.height;
    if (preview.flat) {
      const c = cv.getContext('2d');
      if (c) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, W, H);
        preview.ca = Math.cos(preview.yaw);
        preview.sa = Math.sin(preview.yaw);
        preview.S = Math.min(W / 40, H / 30);
        preview.cx = W / 2;
        preview.cy = H * 0.6;
        drawFlat(c, preview.fm, placePreview);
      }
      preview.frame = requestAnimationFrame(drawPreview);
      return;
    }
    // The camera goes round the car, a little above it, looking at its middle.
    const gl = preview.gl;
    const M = preview.M;
    const D = 58;
    const ex = Math.cos(preview.yaw) * D, ey = Math.sin(preview.yaw) * D, ez = 30;
    let f0 = -ex, f1 = -ey, f2 = 5 - ez;
    const fl = Math.hypot(f0, f1, f2);
    f0 /= fl; f1 /= fl; f2 /= fl;
    const rl = Math.hypot(f0, f1);
    const r0 = -f1 / rl, r1 = f0 / rl; // (r2 0: the camera doesn't roll)
    const u0 = -f2 * r1, u1 = f2 * r0, u2 = f0 * r1 - f1 * r0;
    const focal = Math.min(W * 1.5, H * 2.3);
    const fx = focal / (W / 2);
    const fy = focal / (H / 2);
    const near = 2, far = 400;
    const A = (far + near) / (far - near);
    const B = (-2 * far * near) / (far - near);
    const m = preview.vp;
    m[0] = fx * r0; m[4] = fx * r1; m[8] = 0; m[12] = -fx * (r0 * ex + r1 * ey);
    m[1] = fy * u0; m[5] = fy * u1; m[9] = fy * u2; m[13] = -fy * (u0 * ex + u1 * ey + u2 * ez);
    m[2] = A * f0; m[6] = A * f1; m[10] = A * f2; m[14] = -A * (f0 * ex + f1 * ey + f2 * ez) + B;
    m[3] = f0; m[7] = f1; m[11] = f2; m[15] = -(f0 * ex + f1 * ey + f2 * ez);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(M.p);
    gl.uniformMatrix4fv(M.u.uVP, false, m);
    gl.uniform4f(M.u.uM, 0, 0, 1, 0);
    gl.uniform3f(M.u.uTint, preview.tint[0], preview.tint[1], preview.tint[2]);
    gl.uniform3f(M.u.uLamp, 0.2, 1, 0.35);
    gl.uniform3f(M.u.uCam, ex, ey, ez);
    gl.uniform3f(M.u.uHaze, 0, 0, 0);
    gl.uniform3f(M.u.uLight, 1, 1, 1);
    gl.uniform1f(M.u.uFar, 1e5);
    gl.uniform1f(M.u.uBrake, 0);
    gl.uniform1f(M.u.uGlow, 0);
    gl.uniform1f(M.u.uHead, 0);
    gl.uniform1f(M.u.uMute, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, preview.buf);
    gl.enableVertexAttribArray(M.aP);
    gl.enableVertexAttribArray(M.aC);
    gl.vertexAttribPointer(M.aP, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(M.aC, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(gl.TRIANGLES, 0, preview.count);
    preview.frame = requestAnimationFrame(drawPreview);
  }

  // Betting: whose car, and how many sips.
  let draft = null;
  let draftFor = null;
  function bettingScreen(s) {
    const g = s.game;
    if (draftFor !== g.race) { draft = { car: g.myBet?.pick || null, sips: g.myBet?.sips || 1 }; draftFor = g.race; }
    if (draft.car && !g.racers.includes(draft.car)) draft.car = null;
    const changed = !g.myBet || g.myBet.pick !== draft.car || g.myBet.sips !== draft.sips;
    const missing = s.players.filter((p) => p.connected && !g.bets[p.id]);
    const anyBets = Object.keys(g.bets).length > 0;
    const carName = (id) => (id === s.me ? 'your car' : `${esc(name(id))}'s car`);
    return `
      <div class="turn">🏎️ Race ${g.race}<span>${esc(g.track.name)} · ${g.laps} laps · place your bets</span></div>
      ${s.tv ? '' : stage(s, { mini: true })}
      <div class="card tr-place-bet">
        ${g.autoBet && g.myBet ? `<p class="center tr-autobet">✓ You: <b>${PB.plural(g.myBet.sips, 'sip')} on yourself</b> <span class="muted">· change it below if you like</span></p>` : ''}
        <div class="tr-pick">${g.racers.map((id) => `
          <button class="${draft.car === id ? 'selected' : ''}" data-tr="pick" data-car="${esc(id)}">
            <span class="tr-pick-car">${PB.avatar(id)}${carPic(id)}</span><span>${esc(name(id))}${id === s.me ? ' (you)' : ''}</span>
            <small>${g.wins[id] ? `🏆×${g.wins[id]} ` : ''}${backers(s, id).map((b) => PB.avatar(b, 'sm')).join('')}</small>
          </button>`).join('')}</div>
        <div class="ld-qty">
          <button class="secondary" data-tr="sips" data-step="-1" ${draft.sips <= 1 ? 'disabled' : ''}>−</button>
          <b>${draft.sips}</b>
          <button class="secondary" data-tr="sips" data-step="1" ${draft.sips >= g.maxBet ? 'disabled' : ''}>+</button>
        </div>
        <button data-act="bet" data-car="${esc(draft.car || '')}" data-sips="${draft.sips}" ${draft.car && changed ? '' : 'disabled'}>
          ${!draft.car ? 'Pick a car' : !changed ? `✓ ${PB.plural(g.myBet.sips, 'sip')} on ${carName(g.myBet.pick)}` : `Bet ${PB.plural(draft.sips, 'sip')} on ${carName(draft.car)}`}
        </button>
        <p class="center muted">Lose: drink your bet. Win: hand out ${g.multiplier === 2 ? 'double it' : 'your bet'}.${g.lastSips ? ` Last place drinks ${PB.plural(g.lastSips, 'sip')}.` : ''}</p>
      </div>
      ${g.racers.includes(s.me) ? `${garage(s)}<div class="card tr-ready">${tiltNote()}</div>` : ''}
      ${missing.length ? `<p class="center muted">Still betting: ${missing.map((p) => esc(name(p.id))).join(', ')}</p>` : ''}
      ${s.isHost
        ? `<button data-act="startRace" ${anyBets ? '' : 'disabled'} ${missing.length ? `data-confirm="${missing.length} still betting. Start anyway?"` : ''}>${anyBets ? '🚦 Start the race' : 'Waiting for bets'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the race when everyone's ready</p>`}
      ${s.tv ? '' : board(s)}`;
  }

  // Before the race: how you'll steer.
  function tiltNote() {
    if (canAsk()) {
      return '<p>📱 Your phone is the wheel: hold it sideways and tilt to steer.</p><button class="tr-enable" data-tr="tilt-enable">🎮 Enable tilt steering</button>';
    }
    if (tilt.live) return `<p>📱 <b>Tilt steering is on.</b> Hold your phone like a wheel; the right side is gas, the left brakes.</p>${mode === 'buttons' ? '<button class="secondary tr-small" data-tr="tilt">Steer by tilting</button>' : ''}`;
    if (tilt.denied) return '<p>No tilt allowed, so you\'ll steer with ◀ ▶ buttons (or the arrow keys).</p>';
    return '<p>🎮 Steer with ◀ ▶ (or the arrow keys); on a phone, tilt it like a wheel.</p>';
  }

  function watchScreen(s) {
    return `
      <div class="turn">🏎️ Race ${s.game.race}<span>${esc(s.game.track.name)} · you're watching this one</span></div>
      ${stage(s)}
      ${board(s)}`;
  }

  function finishScreen(s) {
    const g = s.game;
    const winner = g.winner;
    const won = backers(s, winner);
    return `
      <div class="drink win tr-winner" style="--pc:${esc(PB.look(winner).color)}"><div class="big">${PB.avatar(winner, 'lg')} ${winner === s.me && !PB.isTV ? 'You win!' : `${esc(name(winner))} wins!`}</div>
        <div class="sips">${won.length ? `Backed by ${won.map((id) => esc(name(id))).join(', ')}` : 'Nobody backed the winner. Everyone drinks!'}</div></div>
      ${s.phase === 'payout' ? PB.handOut(s, `tr${g.race}`) : PB.raceDrinks(s)}
      ${PB.isTV ? '' : s.isHost
        ? `<button data-act="nextRace" ${s.phase === 'payout' ? 'class="secondary" data-confirm="Some winners haven\'t handed out their sips. Start the next race anyway?"' : ''}>🏁 Next race</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the next race…</p>`}
      ${PB.isTV ? '' : editing ? garage(s) : '<button class="secondary tr-small tr-edit-car" data-tr="garage">🔧 Edit car</button>'}
      <div class="card tr-results"><h2>🏁 Race ${g.race}</h2>${g.result.map((r, i) => `
        <div class="tr-row ${r.id === s.me && !PB.isTV ? 'me' : ''}"><b class="tr-pos">${i + 1}</b>${PB.avatar(r.id, 'sm')}${carPic(r.id)}<span class="tr-name">${esc(PB.state.players.find((p) => p.id === r.id)?.name || '?')}
          <small class="tr-lap">${fmt(r.time)}${g.last === r.id ? ` · last: 🍺 ${g.lastSips}` : ''}</small></span></div>`).join('')}</div>
      ${s.tv && !PB.isTV ? '' : stage(s)}
      ${PB.isTV ? '' : PB.feed(4)}`;
  }

  // TV: the track and the standings or bets down the left.
  function tvScreen(s) {
    if (s.phase === 'payout' || s.phase === 'results') return finishScreen(s);
    return `
      ${stage(s)}
      ${board(s)}
      ${s.phase === 'betting' ? `<p class="center muted tr-note">🏎️ ${esc(s.game.track.name)} · ${s.game.laps} laps · bet on your phones, then ${esc(name(s.hostId))} starts the race</p>` : ''}`;
  }

  function screenFor(s) {
    if (PB.isTV) return tvScreen(s);
    if (s.phase === 'betting') return bettingScreen(s);
    if (s.phase === 'countdown' || s.phase === 'race') return s.game.racers.includes(s.me) ? driveScreen(s) : watchScreen(s);
    return finishScreen(s);
  }

  // What would change the screen (positions don't: they're drawn into the canvases).
  let lastKey = '';
  function keyOf(s) {
    const g = s.game;
    const live = s.phase === 'countdown' || s.phase === 'race';
    return JSON.stringify([
      live ? 'live' : s.phase, PB.isTV && live ? s.phase : '', g.race, g.racers, g.carIds, s.tv, PB.landscape(), s.look || s.style,
      live ? useTilt() : '', live ? modeBar() : '',
      live ? null : [g.bets, g.payout, g.drank, g.result, s.players.map((p) => [p.id, p.name, p.connected, p.avatar, p.color]), s.feed.length && s.feed[s.feed.length - 1].id, PB.handOut.alloc],
      PB.isTV && s.phase === 'countdown' ? g.count : '',
      s.phase === 'betting' ? draft : '',
      live ? '' : [g.looks, carDraft, garageOpen, editing],
    ]);
  }

  PB.register('trackRacing', {
    reset() {
      snaps = [];
      snapRace = 0;
      playout.reset();
      draft = null;
      draftFor = null;
      lastKey = '';
      lastMine = { place: 0, lap: 0, done: false };
      carDraft = null;
      seenLook = '';
      garageOpen = null;
      editing = false;
      autoSent = false;
      sound.stop('new game');
      sound.seen = '';
    },
    audio: sound, // (for tests: what it's playing)
    looks: { THEME, RACE_THEMES, GROUNDS, themeOf, wxOf }, // (for tests: each venue's race)
    // Racing, the phone is all view, wheel and pedals.
    get fullscreen() {
      return driving();
    },
    stage: '.tr-stage',
    tvTable: false,
    tvStage: '.tr-stage, .tr-board, .tr-note, .tr-winner, .tr-results, .ar-bets, .ar-give, .center.muted',
    tvLeft: '.tr-board, .tr-results, .ar-bets, .ar-give, .center.muted',
    tvBanner: '.tr-winner',
    sounds(prev, s) {
      const g = s.game;
      const p = prev.game;
      if (g.result && !p.result) return ['win'];
      if (s.phase === 'race' && prev.phase === 'countdown') return ['go'];
      if (s.phase === 'countdown' && (prev.phase !== 'countdown' || g.count !== p.count)) return ['beep'];
      return [];
    },
    render(s) {
      listen();
      sound.moments(s);
      if (s.phase !== 'race' && s.phase !== 'countdown') {
        // Back to the pedals' resting state between races.
        Object.assign(input, { steer: input.steer, gas: 0, brake: 0 });
        sent = { steer: 0, gas: 0, brake: 0 };
      }
      const key = keyOf(s);
      if (key === lastKey && document.querySelector('.tr-stage, .tr-drive')) {
        updateCount(s);
        updateBoard(s);
        return null;
      }
      lastKey = key;
      boardKey = '';
      return screenFor(s);
    },
    afterRender(s) {
      if (s.game.race !== snapRace) { snaps = []; snapRace = s.game.race; playout.reset(); }
      if (s.phase === 'betting') lastMine = { place: 0, lap: 0, done: false };
      if (s.phase === 'race') editing = false;
      sendSaved(s);
      attachViews();
      startPreview(s);
      document.querySelector('.tr-garage')?.addEventListener('toggle', (e) => { garageOpen = e.target.open; });
      bindControls();
      if (driving()) setSteer();
      document.querySelectorAll('[data-tr]').forEach((b) => {
        b.onclick = (e) => {
          const what = b.dataset.tr;
          if (what === 'horn') { e.preventDefault(); PB.act('honk'); return; }
          if (what === 'carsound') {
            e.preventDefault();
            const on = !sound.carOn();
            try { localStorage.setItem('tr-car-sound', on ? 'on' : 'off'); } catch {}
            if (!on) sound.stop('muted');
            b.textContent = on ? '🔈' : '🔇';
            return;
          }
          if (what === 'pick') draft.car = b.dataset.car;
          else if (what === 'look') pickPart(s, b.dataset.k, b.dataset.v);
          else if (what === 'garage') { editing = true; garageOpen = true; }
          else if (what === 'sips') draft.sips = Math.min(s.game.maxBet, Math.max(1, draft.sips + Number(b.dataset.step)));
          else if (what === 'tilt-enable') return askTilt();
          else if (what === 'buttons') setMode('buttons');
          else if (what === 'tilt') {
            setMode('tilt');
            if (needsPermission() && !tilt.granted) return askTilt();
          } else if (what === 'centre') tilt.zero = tilt.raw;
          lastKey = '';
          PB.rerender();
        };
      });
    },
    // Where the cars are now (20 times a second).
    onCars(d) {
      const s = PB.state;
      if (s?.gameType !== 'trackRacing' || !s.game || d.r !== s.game.race) return;
      if (d.r !== snapRace) { snaps = []; snapRace = d.r; playout.reset(); }
      playout.arrive(performance.now() / 1000, d.t);
      snaps.push(d);
      if (snaps.length > 40) snaps.shift();
      const ids = carIds();
      // (With a TV the horns are its sound, but a driver's phone hoots too: it's in the race.)
      const loud = PB.isTV || !s.tv || driving();
      for (const id of d.h || []) {
        honked[id] = performance.now();
        if (loud) { sound.stats.horn++; window.Prefs?.play('horn'); }
      }
      if (PB.isTV) { updateBoard(s); updateCount(s); return; }
      const mine = d.c[ids.indexOf(s.me)];
      if ((d.b || []).includes(s.me)) {
        PB.buzz('hit');
        fp.cam.shake = 1;
        // Into another car if one's touching (they bump at twice the cars' radius), else the wall.
        if (driving() && mine) sound.hit(d.c.some((c) => c !== mine && Math.hypot(c[0] - mine[0], c[1] - mine[1]) < 26));
      }
      // Off Rainbow Road: a drink (if it's been a while since the last), and back on.
      for (const [id, drank] of d.f || []) {
        if (id !== s.me || !driving()) continue;
        PB.buzz('hit');
        fp.cam.shake = 1.2;
        sound.hit(false);
        banner(drank ? '🍺 Drink!' : '🌈 Back on!');
      }
      if (mine) {
        const done = !!(mine[3] & 4);
        if (lastMine.lap && mine[5] > lastMine.lap) {
          PB.buzz();
          banner(mine[5] === s.game.laps ? themeOf(s).words.final : `Lap ${mine[5]}`);
          if (driving()) sound.lap(mine[5] === s.game.laps);
        }
        if (done && !lastMine.done && lastMine.place) {
          banner(`${themeOf(s).words.finish} ${ordinal(mine[4])}!`, true);
          if (driving()) sound.finish(mine[4], d.c.length);
        }
        if (mine[4] !== lastMine.place || mine[5] !== lastMine.lap || done !== lastMine.done) {
          lastMine = { place: mine[4], lap: mine[5], done };
          const pl = document.getElementById('tr-place');
          if (pl) pl.textContent = ordinal(mine[4]);
          const lp = document.getElementById('tr-lap');
          if (lp) lp.textContent = done ? 'Finished!' : `Lap ${mine[5]}/${s.game.laps}`;
        }
      }
      updateCount(s);
      updateBoard(s);
    },
  });
})();
