const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildBundle } = require('../lib/bundle');

test('the browser bundle runs every game with the shared toolkit', () => {
  const sandbox = { console, setTimeout, clearTimeout };
  vm.runInNewContext(`${buildBundle()}\nthis.__req = __req;`, sandbox);
  const { createContext } = sandbox.__req('context');
  for (const id of ['slevens', 'madMax', 'rideTheBus', 'kingsCup', 'liarsDice', 'shotPoker', 'aceRace', 'horseRace', 'bigTom', 'darts', 'boatRace', 'beerPong', 'quarters']) {
    const game = sandbox.__req(id);
    const room = { players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, connected: true, drinks: 0 })), feed: [], game: { type: id } };
    const ctx = createContext({ emit: () => {}, broadcast: () => {} });
    game.start(room, ctx, {});
    assert.ok(room.game.phase, `${id} started`);
    ctx.clearTimer(room);
  }
});

test('a game\'s own bundle has just that game and what it needs', () => {
  const all = buildBundle();
  for (const id of ['slevens', 'madMax', 'bigTom', 'beerPong']) {
    const one = buildBundle(undefined, id);
    assert.ok(one.length < all.length / 2, `${id}: smaller`);
    const sandbox = { console, setTimeout, clearTimeout };
    vm.runInNewContext(`${one}\nthis.__req = __req;`, sandbox);
    const room = { players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, connected: true, drinks: 0 })), feed: [], game: { type: id } };
    const ctx = sandbox.__req('context').createContext({ emit: () => {}, broadcast: () => {} });
    sandbox.__req(id).start(room, ctx, { custom: sandbox.__req('custom').clean(sandbox.__req(id).custom, {}) });
    assert.ok(room.game.phase, `${id} started`);
    assert.ok(sandbox.__req('night').waterDue && sandbox.__req('water').waterLine, `${id}: what the page uses`);
    ctx.clearTimer(room);
  }
  assert.ok(!buildBundle(undefined, 'slevens').includes("__def('bigTomQuestions'"), 'not other games\' content');
  assert.throws(() => buildBundle(undefined, 'nope'));
});

test('the pass-and-play page loads its game\'s bundle, and the demos inline it', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '../public/play/local.html'), 'utf8'), /\/shared\/bundle\.js\?game=/);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-'));
  execFileSync(process.execPath, [path.join(__dirname, '../tools/build-demos.js'), out]);
  for (const [page, id] of [['slevens', 'slevens'], ['madmax', 'madMax'], ['rideTheBus', 'rideTheBus'], ['kingsCup', 'kingsCup'], ['liarsDice', 'liarsDice']]) {
    const demo = fs.readFileSync(path.join(out, `${page}-demo.html`), 'utf8');
    assert.ok(!/<script src=/.test(demo), `${page} demo loads nothing from the server`);
    assert.ok(!demo.includes('/shared/bundle.js?'), `${page} demo is self-contained`);
    assert.ok(!demo.includes('home-link"'), `${page} demo has no link back to the app`);
    assert.ok(demo.includes(`__def('${id}'`), `${page} demo has its rules`);
    assert.ok(demo.includes(`const gameId = '${id}';`), `${page} demo plays its game`);
  }
  fs.rmSync(out, { recursive: true });
});
