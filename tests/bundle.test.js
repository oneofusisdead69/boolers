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

test('the pass-and-play pages load the bundle, and the demos inline it', () => {
  for (const page of ['slevens', 'madmax']) {
    assert.match(fs.readFileSync(path.join(__dirname, '../public/play', `${page}.html`), 'utf8'), /<script src="\/shared\/bundle.js"><\/script>/);
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-'));
  execFileSync(process.execPath, [path.join(__dirname, '../tools/build-demos.js'), out]);
  for (const page of ['slevens', 'madmax', 'rideTheBus', 'kingsCup', 'liarsDice']) {
    const demo = fs.readFileSync(path.join(out, `${page}-demo.html`), 'utf8');
    assert.ok(!/<script src=/.test(demo), `${page} demo loads nothing from the server`);
    assert.ok(!demo.includes('src="/shared/bundle.js"'), `${page} demo is self-contained`);
    assert.ok(!demo.includes('home-link"'), `${page} demo has no link back to the app`);
    assert.ok(demo.includes("__def('slevens'"));
  }
  fs.rmSync(out, { recursive: true });
});
