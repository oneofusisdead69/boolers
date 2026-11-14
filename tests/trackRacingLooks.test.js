// Track Racing's screens dress the track for the room it's in (RACE_THEMES in
// public/games/trackRacing.js): every venue, and every look a room can be in, has to come out as
// a whole, known theme. The screen's script is run here with just enough of a browser round it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOM_STYLES = require('../lib/roomStyles');
const game = require('../games/trackRacing');

function screen() {
  let registered = null;
  const noop = () => {};
  const element = () => ({ getContext: () => null, style: {}, addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop } });
  const document = { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], createElement: element, getElementById: () => null, hidden: false, documentElement: {} };
  const window = { ROOM_STYLES, addEventListener: noop };
  const PB = { register: (id, s) => { registered = s; }, esc: (t) => t, name: () => '', look: () => ({ avatar: '🙂', color: '#ff0000' }), state: null };
  const sandbox = { window, document, PB, ROOM_STYLES, console, setTimeout, clearTimeout, performance: { now: () => 0 }, navigator: {}, localStorage: { getItem: () => null, setItem: noop }, getComputedStyle: () => ({ getPropertyValue: () => '' }), requestAnimationFrame: noop, cancelAnimationFrame: noop };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/games/trackRacing.js'), 'utf8'), sandbox);
  return registered;
}

const KINDS = {
  barrier: ['tyres', 'fence', 'rail', 'rope', 'wall', 'hedge', 'neon', 'candy', 'bunting', 'none'],
  stack: ['tyres', 'graves', 'drums', 'barrels', 'hay', 'presents', 'speakers', 'stools', 'chips', 'rocks', 'topiary', 'none'],
  tree: ['pine', 'dead', 'round', 'cypress', 'palm', 'cactus', 'lamp', 'rock', 'none'],
  gantry: ['gantry', 'arch', 'neon', 'torch'],
};
const hex = /^#[0-9a-f]{6}$/i;
const rgb = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => x >= 0 && x <= 1);

test('every venue has a race of its own, and every look a room can be in comes out as a whole one', () => {
  const { THEME, RACE_THEMES, GROUNDS, themeOf, wxOf } = screen().looks;
  // Every venue you can pick (and the plain one) has its own entry; nothing's there that isn't one.
  for (const id of ROOM_STYLES.PICKABLE) assert.ok(RACE_THEMES[id], `${id} has a race of its own`);
  for (const id of Object.keys(RACE_THEMES)) assert.ok(ROOM_STYLES.PICKABLE.includes(id) || id === 'rainbow', `${id} is a venue`);
  for (const look of ROOM_STYLES.IDS) {
    for (const rainbow of [false, true]) {
      const s = { look, style: ROOM_STYLES.roomOf(look), game: { weather: 'night', rainbow } };
      const th = themeOf(s);
      assert.ok(RACE_THEMES[th.id], `${look}: ${th.id}`);
      for (const key of Object.keys(THEME)) assert.ok(key in th, `${look}: ${key}`);
      if (rainbow) assert.strictEqual(th.id, 'rainbow', `${look}: Rainbow Road whenever the server says so`);
      else assert.ok(th.id === ROOM_STYLES.roomOf(look) || th.id === 'saloon', `${look}: its own room's race (${th.id})`);
      // Everything it names is something the screens can draw.
      for (const [k, list] of Object.entries(KINDS)) assert.ok(list.includes(th[k]), `${look}: ${k} ${th[k]}`);
      for (const k of ['ground', 'verge']) assert.ok(th[k] == null || GROUNDS[th[k]], `${look}: ${k} ${th[k]}`);
      for (const k of ['line', 'kerb']) assert.match(th[k], hex, `${look}: ${k}`);
      for (const k of ['kerbAlt', 'wall', 'roof']) assert.ok(th[k] == null || hex.test(th[k]), `${look}: ${k}`);
      assert.ok(th.out == null || rgb(th.out), `${look}: out`);
      assert.ok(rgb(th.seat) && rgb(th.post) && rgb(th.bridge.concrete), `${look}: 3D colours`);
      assert.ok(th.stand == null || hex.test(th.stand), `${look}: stand`);
      assert.ok(th.crowd == null || th.crowd === 'ghosts' || th.crowd.every((c) => hex.test(c)), `${look}: crowd`);
      assert.ok(th.trees >= 0 && th.trees <= 1, `${look}: trees`);
      for (const weather of Object.keys(game.WEATHERS)) {
        const wx = wxOf({ ...s, game: { ...s.game, weather } });
        assert.ok(wx.light.length === 3 && wx.light.every((x) => x > 0 && x < 2) && wx.far > 0, `${look}: ${weather}`);
      }
    }
  }
  // At the Space lounge it's always Rainbow Road (the server's own rule): nothing round the road.
  const space = themeOf({ look: 'spaceRainbow', style: 'space', game: { rainbow: true } });
  assert.strictEqual(space.void, true);
  assert.strictEqual(space.barrier, 'none');
  // And Halloween's as it was: the graveyard.
  const hw = themeOf({ look: 'halloween', style: 'halloween', game: {} });
  assert.deepStrictEqual([hw.ground, hw.barrier, hw.stack, hw.tree, hw.gantry, hw.crowd], ['earth', 'fence', 'graves', 'dead', 'arch', 'ghosts']);
  assert.ok(hw.fx.phantom && hw.fx.lightning && hw.fx.bats);
});
