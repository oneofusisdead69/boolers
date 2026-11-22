const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/shootingGallery');
const ROOM_STYLES = require('../lib/roomStyles');

// A room with the gallery set up in a venue (the set is picked from the room's style at start).
function gallery(players = 3, options = {}, style = 'classic') {
  const t = setup({ ...game, start(room, ctx, o) { room.style = style; game.start(room, ctx, o); } }, players, options);
  return t;
}
const calibrateAll = (t) => t.room.players.forEach((p, i) => t.act(i, 'calibrated'));
// Into the round: the countdown's three beats.
function toRound(t) {
  calibrateAll(t);
  while (t.room.game.phase === 'countdown') t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'round');
}
const ticks = (t, n) => { for (let i = 0; i < n && t.room.game.phase === 'round'; i++) t.fireTimer(); };
// A live target out now (not a bad one unless asked), and where it is.
function liveTarget(t, pick = (tg) => !tg.bad) {
  const g = t.room.game;
  for (let i = 0; i < 400; i++) {
    const tg = g.live.find((x) => !x.hit && pick(x) && x.t0 < g.t - 0.3 && g.t < x.t0 + x.life - 0.3);
    if (tg) { const p = game.posAt(tg, g.t); if (p.x > 0.05 && p.x < 0.95 && p.y > 0.05 && p.y < 0.95) return { tg, ...p }; }
    ticks(t, 1);
  }
  throw new Error('no target came');
}

test('calibration first: waits on everyone not yet calibrated, starts the round when all are', () => {
  const t = gallery(3);
  t.cleanup();
  assert.strictEqual(t.room.game.phase, 'calibrate');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0', 'p1', 'p2']);
  t.act(1, 'calib', { step: 1 });
  assert.deepStrictEqual(t.room.game.calStep, { p1: 1 }, 'the TV shows p1 the middle dot');
  t.act(1, 'calib', { step: 2 });
  t.act(1, 'calibrated');
  assert.deepStrictEqual(t.room.game.calStep, {});
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0', 'p2']);
  // Someone leaving doesn't hold it up.
  t.act(0, 'calibrated');
  t.disconnect(2);
  assert.strictEqual(t.room.game.phase, 'countdown');
  assert.deepStrictEqual(game.waitingOn(t.room), []);
  t.cleanup();
});

test('the host can start without waiting for everyone', () => {
  const t = gallery(3);
  t.act(1, 'start');
  assert.strictEqual(t.room.game.phase, 'calibrate', 'not a guest');
  t.act(0, 'start');
  assert.strictEqual(t.room.game.phase, 'countdown');
  t.cleanup();
});

test('targets move on fixed paths: the same position for the same time, the same round for the same seed', () => {
  const a = gallery(2);
  const b = gallery(2);
  b.room.game.seed = a.room.game.seed;
  toRound(a);
  toRound(b);
  ticks(a, 100);
  ticks(b, 100);
  const strip = (g) => g.live.map(({ hit, ...tg }) => tg);
  assert.ok(a.room.game.live.length > 4, 'plenty out');
  assert.deepStrictEqual(strip(a.room.game), strip(b.room.game), 'same seed, same targets');
  for (const tg of a.room.game.live) {
    const p = game.posAt(tg, 3.21);
    assert.deepStrictEqual(game.posAt(tg, 3.21), p);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  // Each target goes out once, in the tick it's spawned (ahead of when it shows).
  const sent = [];
  a.ctx.signal = () => {};
  const c = gallery(2);
  c.room.game.seed = 5;
  toRound(c);
  const signal = c.ctx.signal;
  c.ctx.signal = (room, ev, d) => { if (ev === 'gallery' && d.n) sent.push(...d.n.map((x) => x.id)); return signal(room, ev, d); };
  ticks(c, 200);
  assert.strictEqual(new Set(sent).size, sent.length, 'no target sent twice');
  for (const t of [a, b, c]) t.cleanup();
});

test('hits, misses, gold and don\'t-shoot', () => {
  const t = gallery(2);
  toRound(t);
  ticks(t, 40);
  const g = t.room.game;
  // A miss: nowhere near anything (off the gallery).
  t.act(0, 'shoot', { x: -0.19, y: -0.19, t: g.t });
  assert.strictEqual(g.stats.p0.shots, 1);
  assert.strictEqual(g.stats.p0.score, 0);
  // A hit, at the target's spot at the shooter's time.
  ticks(t, 8);
  const { tg, x, y } = liveTarget(t);
  t.act(0, 'shoot', { x, y, t: g.t });
  assert.strictEqual(tg.hit, 'p0');
  assert.strictEqual(g.stats.p0.score, tg.pts);
  // The same target can't be hit twice.
  ticks(t, 8);
  const before = g.stats.p1.score;
  t.act(1, 'shoot', { x, y, t: g.t - (8 * 0.05) });
  assert.strictEqual(g.stats.p1.score, before);
  // Lag: a shot stamped a moment ago hits where the target was then, not where it is now.
  ticks(t, 8);
  const late = liveTarget(t);
  ticks(t, 4);
  t.act(1, 'shoot', { x: late.x, y: late.y, t: g.t - 0.2 });
  assert.strictEqual(late.tg.hit, 'p1');
  // ...but not from too long ago.
  assert.ok(game.LAG_MAX <= 0.5);
  // Gold: worth 50; don't-shoot: costs.
  const gold = { id: 9001, k: 'star', z: 6, lane: -1, r: 0.04, pts: 50, gold: 1, p: 'rail', t0: g.t - 1, life: 5, x: 0.5, y: 0.5, vx: 0, vy: 0, a: 0, w: 0, ph: 0, g: 0, l: 0 };
  const bad = { ...gold, id: 9002, k: 'bystander', pts: 25, gold: 0, bad: 1, x: 0.2, z: 2 };
  g.live.push(gold, bad);
  ticks(t, 10);
  const p0 = g.stats.p0.score;
  t.act(0, 'shoot', { x: 0.5, y: 0.5, t: g.t });
  assert.ok(g.stats.p0.score - p0 >= 50, 'gold');
  ticks(t, 10);
  const p0b = g.stats.p0.score;
  t.act(0, 'shoot', { x: 0.2, y: 0.5, t: g.t });
  assert.strictEqual(g.stats.p0.score - p0b, -25, 'don\'t shoot');
  assert.strictEqual(g.stats.p0.bad, 1);
  t.cleanup();
});

test('each gun\'s fire rate and magazine are enforced, and tilting up reloads it after its reload time', () => {
  const t = gallery(1, {}, 'saloon'); // the six-shooter
  toRound(t);
  const g = t.room.game;
  const stats = game.GUN_STATS[game.GUNS.saloon];
  assert.strictEqual(stats.mag, 6);
  // Two shots in the same instant: the second is too quick.
  t.act(0, 'shoot', { x: -0.19, y: -0.19, t: g.t });
  t.act(0, 'shoot', { x: -0.19, y: -0.19, t: g.t });
  assert.strictEqual(g.stats.p0.shots, 1);
  // Empty the gun, then it clicks.
  for (let i = 0; i < 20; i++) { ticks(t, 5); t.act(0, 'shoot', { x: -0.19, y: -0.19, t: g.t }); }
  assert.strictEqual(g.stats.p0.shots, 6, 'six and done');
  assert.deepStrictEqual(t.view(0).ammo, [0]);
  // Reload: nothing till the gun's reload time is up.
  t.act(0, 'reload');
  assert.deepStrictEqual(t.view(0).ammo, [-1]);
  ticks(t, Math.floor(stats.reload / 50) - 2);
  t.act(0, 'shoot', { x: -0.19, y: -0.19, t: g.t });
  assert.strictEqual(g.stats.p0.shots, 6, 'still reloading');
  ticks(t, 4);
  t.act(0, 'shoot', { x: -0.19, y: -0.19, t: g.t });
  assert.strictEqual(g.stats.p0.shots, 7, 'loaded again');
  // A one-shot blunderbuss is forgiving: a wider spread.
  assert.ok(game.GUN_STATS[game.GUNS.pirate].spread > game.GUN_STATS[game.GUNS.garage].spread);
  t.cleanup();
});

test('rounds: on the clock, then the host moves on; most points over all the rounds wins', () => {
  const t = gallery(2, { rounds: 3, length: 45 });
  toRound(t);
  const g = t.room.game;
  const { x, y } = liveTarget(t);
  t.act(1, 'shoot', { x, y, t: g.t });
  assert.deepStrictEqual(game.waitingOn(t.room), [], 'nobody waited on in a round');
  ticks(t, 2000);
  assert.strictEqual(g.phase, 'roundEnd');
  assert.strictEqual(g.result.rows[0].id, 'p1');
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0'], 'the host starts the next round');
  t.act(1, 'nextRound');
  assert.strictEqual(g.phase, 'roundEnd', 'only the host');
  for (let r = 2; r <= 3; r++) {
    t.act(0, 'nextRound');
    while (g.phase === 'countdown') t.fireTimer();
    assert.strictEqual(g.round, r);
    ticks(t, 2000);
  }
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.winnerId, 'p1');
  assert.deepStrictEqual(game.waitingOn(t.room), []);
  // Points only: nobody drank a thing.
  assert.deepStrictEqual(t.drinks(), [0, 0]);
  t.cleanup();
});

test('crosshairs go out every tick in one signal, aims and shots never broadcast', () => {
  const t = gallery(2);
  toRound(t);
  const out = [];
  t.ctx.signal = (room, ev, d) => out.push([ev, d]);
  assert.strictEqual(game.handle(t.room, t.room.players[1], { type: 'aim', x: 0.25, y: 0.75 }, t.ctx), 'quiet');
  assert.strictEqual(game.handle(t.room, t.room.players[1], { type: 'shoot', x: 0.25, y: 0.75 }, t.ctx), 'quiet');
  assert.strictEqual(game.handle(t.room, t.room.players[1], { type: 'aim', x: 'nope' }, t.ctx), 'quiet');
  t.fireTimer();
  const [ev, d] = out[out.length - 1];
  assert.strictEqual(ev, 'gallery');
  assert.deepStrictEqual(d.a.slice(2, 4), [0.25, 0.75]);
  assert.strictEqual(d.f.length, 1);
  assert.deepStrictEqual(d.a.slice(0, 2), [-9, -9], 'no aim yet from p0');
  t.cleanup();
});

test('a player leaving mid-round: the round carries on; their score stays', () => {
  const t = gallery(3, { rounds: 1, length: 45 });
  toRound(t);
  const { x, y } = liveTarget(t);
  t.act(2, 'shoot', { x, y, t: t.room.game.t });
  t.disconnect(2);
  t.room.players.splice(2, 1);
  ticks(t, 2000);
  assert.strictEqual(t.room.game.phase, 'over');
  assert.ok(t.room.game.result.rows.every((r) => r.id !== 'p2'));
  t.cleanup();
});

test('gun looks are cleaned; every venue has its own house gun', () => {
  assert.deepStrictEqual(game.gunLook({ finish: '#c8302f', accent: 'red', sight: 'duplex', model: 'rayGun' }), { finish: '#c8302f', accent: null, sight: 'duplex', bold: true, pip: false });
  assert.deepStrictEqual(game.gunLook(), { finish: null, accent: null, sight: 'cross', bold: true, pip: false });
  assert.strictEqual(game.gunLook({ sight: 'ring' }).sight, 'cross', 'an old phone\'s saved shape');
  assert.deepStrictEqual(game.gunLook({ sight: 'chevron', bold: false, pip: true }), { finish: null, accent: null, sight: 'chevron', bold: false, pip: true });
  const venues = ROOM_STYLES.PICKABLE;
  for (const v of venues) assert.ok(game.GUNS[v], `${v} has a gun`);
  const guns = [...venues, 'duckPond'].map((v) => game.GUNS[v]);
  assert.strictEqual(new Set(guns).size, guns.length, 'one each');
  for (const g of guns) assert.ok(game.GUN_STATS[g], `${g}: how it fires`);
  for (const v of [...venues, 'duckPond']) assert.ok(game.SETS[v] || v === 'classic', `${v} has its targets`);
});

test('the duck pond: Shooting Gallery at the Highlands pub', () => {
  assert.strictEqual(ROOM_STYLES.eggOf(game.POND_ROOM, 'shootingGallery'), 'stpatricksDuckPond');
  const look = ROOM_STYLES.STYLES.stpatricksDuckPond;
  assert.ok(look.egg && look.room === 'stpatricks' && look.emoji === '🦆');
  const t = gallery(2, {}, 'stpatricks');
  assert.strictEqual(t.room.game.set, 'duckPond');
  assert.strictEqual(t.view(0).gun, 'sideBySide');
  toRound(t);
  ticks(t, 200);
  const kinds = new Set(t.room.game.live.map((x) => x.k));
  assert.ok([...kinds].every((k) => ['duck', 'duckSwim', 'goldDuck', 'swan'].includes(k)), [...kinds].join());
  t.cleanup();
});

test('bots calibrate, shoot, reload and finish a game', () => {
  const t = gallery(3, { rounds: 1, length: 45 });
  for (const p of t.room.players) p.bot = 'booler';
  let shots = 0;
  let reloads = 0;
  for (let n = 0; n < 5000 && t.room.game.phase !== 'over'; n++) {
    let moved = false;
    t.room.players.forEach((p, i) => {
      const a = t.bot(i, 0.9);
      if (!a || a.type === '_wait') return;
      const { delay, ...move } = a;
      if (move.type === 'shoot') shots++;
      if (move.type === 'reload') reloads++;
      game.handle(t.room, p, move, t.ctx);
      moved = true;
    });
    if (!moved && t.room.timerFn) t.fireTimer();
  }
  assert.strictEqual(t.room.game.phase, 'over');
  assert.ok(shots > 20, `bots shot (${shots})`);
  assert.ok(reloads > 0, 'and reloaded');
  assert.ok(Object.values(t.room.game.stats).some((s) => s.score > 0), 'and hit things');
  t.cleanup();
});

test('crosshair colours: never two the same in a game, own colour when it\'s free, stable, late joiners too', () => {
  // A full room where everyone picked the same colour: still all different.
  const t = gallery(15);
  t.cleanup();
  t.room.players.forEach((p) => { p.color = '#ff4d6d'; });
  t.room.game.colors = {};
  for (const p of t.room.players) game.onJoin(t.room, p, t.ctx);
  t.room.players.push({ id: 'late', name: 'Late', connected: true, drinks: 0, color: '#ff4d6d' });
  game.onJoin(t.room, t.room.players[15], t.ctx);
  const colors = t.view(0).colors;
  const hexes = Object.values(colors).map(([, hex]) => hex);
  assert.strictEqual(hexes.length, 16);
  assert.strictEqual(new Set(hexes).size, 16, 'all different, up to a full room');
  assert.deepStrictEqual(colors.p0, ['Red', '#ff3b30'], 'the first gets the nearest to their own');
  // Stable: asking again changes nothing.
  for (const p of t.room.players) game.onJoin(t.room, p, t.ctx);
  assert.deepStrictEqual(t.view(0).colors, colors);
  // A late joiner gets their own colour's nearest when it's free.
  const u = gallery(3);
  u.cleanup();
  u.room.players.push({ id: 'late', name: 'Late', connected: true, drinks: 0, color: '#22c3e6' });
  game.onJoin(u.room, u.room.players[3], u.ctx);
  assert.deepStrictEqual(u.view(0).colors.late, ['Cyan', '#2ee6ff']);
});
