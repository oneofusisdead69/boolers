const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/trackRacing');

// Bets from everyone, then the race off the line (through the 3-2-1).
function startRace(t, bets) {
  bets.forEach(([car, sips], i) => t.act(i, 'bet', { car, sips }));
  t.act(0, 'startRace');
  assert.strictEqual(t.room.game.phase, 'countdown');
  for (let i = 0; i < 3; i++) t.fireTimer();
  assert.strictEqual(t.room.game.phase, 'race');
}

// Runs the race to the end, every car driven by a bot's brain.
function runRace(t, max = 20000) {
  for (const p of t.room.players) p.bot ||= 'booler';
  let n = 0;
  while (t.room.game.phase === 'race' && n++ < max) t.fireTimer();
  return n;
}

test('every track is a closed loop with room between its parts', () => {
  for (const id of Object.keys(game.TRACKS)) {
    const tr = game.trackOf(id);
    assert.ok(tr.length > 2000, `${id} is a decent length`);
    for (let i = 0; i < tr.count; i++) {
      const x = tr.xs[i];
      const y = tr.ys[i];
      const edge = game.WIDTH / 2 + game.BAND;
      assert.ok(x > 40 && x < 960 && y > 40 && y < 585, `${id}: stays on the screen`);
      // The centreline is where it says it is.
      assert.ok(game.locate(tr, x, y).dist < 1, `${id}: ${i} on the line`);
      assert.ok(edge > 0);
    }
  }
});

test('every track: parts of the loop stay apart, and bots lap it in 12 to 32 seconds', () => {
  const edge = game.WIDTH / 2 + game.BAND;
  for (const id of Object.keys(game.TRACKS)) {
    const tr = game.trackOf(id);
    // Well apart (a wall between) wherever the loop comes back near itself.
    const far = Math.round(250 / tr.step);
    for (let i = 0; i < tr.count; i++) {
      for (let j = i + far; j < tr.count && tr.count - (j - i) >= far; j++) {
        assert.ok(Math.hypot(tr.xs[i] - tr.xs[j], tr.ys[i] - tr.ys[j]) > edge * 2, `${id}: parts ${i} and ${j} too close`);
      }
    }
    const t = setup(game, 3, { track: id, laps: 2 });
    startRace(t, [['p0', 1], ['p1', 1], ['p2', 1]]);
    for (const p of t.room.players) p.bot = 'baller';
    runRace(t);
    const g = t.room.game;
    assert.strictEqual(g.trackId, id);
    for (const r of g.result) {
      assert.ok(r.time != null, `${id}: ${r.id} finished`);
      assert.ok(r.time / 2 > 12 && r.time / 2 < 32, `${id}: a lap in ${(r.time / 2).toFixed(1)}s`);
    }
    t.cleanup();
  }
});

test('betting: on any car in the race, up to the max', () => {
  const t = setup(game, 3, { maxBet: 3 });
  t.act(0, 'bet', { car: 'p0', sips: 2 });
  t.act(1, 'bet', { car: 'p0', sips: 4 });
  t.act(2, 'bet', { car: 'nobody', sips: 1 });
  assert.deepStrictEqual(Object.keys(t.room.game.bets), ['p0']);
  t.act(1, 'startRace');
  assert.strictEqual(t.room.game.phase, 'betting', 'only the host starts');
  t.cleanup();
});

test('drive input is clamped and quiet; nothing moves before GO', () => {
  const t = setup(game, 2);
  startRace(t, [['p0', 1], ['p1', 1]]);
  const r = game.handle(t.room, t.player(0), { type: 'drive', steer: 5, gas: 1, brake: 'x' }, t.ctx);
  assert.strictEqual(r, 'quiet');
  const car = t.room.game.cars.find((c) => c.id === 'p0');
  assert.deepStrictEqual([car.steer, car.gas, car.brake], [1, 1, 0]);
  const x = car.x;
  t.fireTimer();
  assert.notStrictEqual(car.x, x, 'it goes');
  t.cleanup();
});

test('the race ticks quietly, sending the cars as a signal', () => {
  const signals = [];
  const t = setup(game, 2);
  t.ctx.signal = (room, event, data) => signals.push({ event, data });
  startRace(t, [['p0', 1], ['p1', 1]]);
  t.fireTimer();
  assert.strictEqual(signals.at(-1).event, 'cars');
  assert.strictEqual(signals.at(-1).data.c.length, 2);
  t.cleanup();
});

test('bots drive the whole race; losers drink, the winner hands out, last place drinks', () => {
  const t = setup(game, 4, { track: 'bar', laps: 2, lastSips: 2, multiplier: 2 });
  for (const p of t.room.players.slice(1)) p.bot = 'baller';
  t.room.players[0].bot = 'booler';
  startRace(t, [['p0', 2], ['p1', 1], ['p2', 1], ['p3', 3]]);
  const ticks = runRace(t);
  const g = t.room.game;
  assert.ok(g.phase === 'payout' || g.phase === 'results', `the race ended (${g.phase} after ${ticks} ticks)`);
  assert.ok(g.cars.some((c) => c.finished != null), 'someone finished');
  assert.strictEqual(g.result.length, 4);
  const winner = g.result[0].id;
  const last = g.result[3].id;
  for (const [id, b] of Object.entries(g.bets)) {
    const expected = (b.pick === winner ? 0 : b.sips) + (id === last ? 2 : 0);
    assert.strictEqual(t.room.players.find((p) => p.id === id).drinks, expected, `${id} drank right`);
  }
  if (g.phase === 'payout') {
    const id = Object.keys(g.payout)[0];
    const alloc = game.bot(t.room, t.room.players.find((p) => p.id === id), t.ctx, 0.6).alloc;
    game.handle(t.room, t.room.players.find((p) => p.id === id), { type: 'give', alloc }, t.ctx);
    assert.strictEqual(g.phase, 'results');
  }
  t.act(0, 'nextRace');
  assert.strictEqual(g.phase, 'betting');
  assert.strictEqual(g.race, 2);
  // The winner starts at the back of the grid.
  assert.strictEqual(g.cars.at(-1).id, winner);
  t.cleanup();
});

test('nobody drives: the race is still called in the end', () => {
  const t = setup(game, 2, { laps: 2 });
  startRace(t, [['p0', 1], ['p1', 1]]);
  let n = 0;
  while (t.room.game.phase === 'race' && n++ < 10000) t.fireTimer();
  assert.notStrictEqual(t.room.game.phase, 'race');
  assert.ok(t.room.game.result.every((r) => r.time === null));
  t.cleanup();
});

test('a joiner before the lights gets a car; waitingOn as in betting', () => {
  const t = setup(game, 2);
  const p = { id: 'p9', name: 'Late', drinks: 0, connected: true };
  t.room.players.push(p);
  game.onJoin(t.room, p, t.ctx);
  assert.ok(t.room.game.racers.includes('p9'));
  assert.strictEqual(t.room.game.cars.length, 3);
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0', 'p1', 'p9']);
  startRace(t, [['p0', 1], ['p1', 1], ['p9', 1]]);
  assert.deepStrictEqual(game.waitingOn(t.room), []);
  t.cleanup();
});

test('honks: racers only, not too often', () => {
  const t = setup(game, 2);
  startRace(t, [['p0', 1], ['p1', 1]]);
  for (let i = 0; i < 50; i++) t.fireTimer();
  t.act(0, 'honk');
  assert.deepStrictEqual(t.room.game.honks, ['p0']);
  t.fireTimer();
  t.act(0, 'honk');
  assert.deepStrictEqual(t.room.game.honks, [], 'too soon');
  t.cleanup();
});

test('weather: picked for each race, fitted to the room, and bots finish in every kind', () => {
  const t = setup(game, 3, { track: 'pretzel', laps: 2 });
  const g = t.room.game;
  assert.ok(game.WEATHERS[g.weather], 'a race has weather');
  assert.strictEqual(game.view(t.room, t.player(0)).weather, g.weather);
  assert.ok(t.room.feed.some((f) => f.text.startsWith(`${game.WEATHERS[g.weather].emoji} ${game.WEATHERS[g.weather].label} at The Pretzel`)), 'announced');
  const many = (room) => new Set(Array.from({ length: 300 }, () => game.pickWeather(room)));
  assert.deepStrictEqual([...many({ style: 'christmas' })], ['snow']);
  assert.ok(!many({ style: 'tiki' }).has('snow'), 'no snow at the tiki bar');
  assert.deepStrictEqual([...many({ style: 'lighthouse', mood: 'storm' })], ['rain']);
  assert.deepStrictEqual([...many({ style: 'stpatricks', mood: 'stpatricksFog' })], ['fog']);
  assert.deepStrictEqual([...many({ style: 'vineyard', mood: 'vineyardSunset' })], ['sunset']);
  assert.ok(many({ style: 'dive' }).size >= 4, 'anything can happen at the dive');
  t.cleanup();
  for (const weather of Object.keys(game.WEATHERS)) {
    const t2 = setup(game, 3, { track: 'pretzel', laps: 2 });
    t2.room.game.weather = weather;
    startRace(t2, [['p0', 1], ['p1', 1], ['p2', 1]]);
    for (const p of t2.room.players) p.bot = 'npc';
    runRace(t2);
    for (const r of t2.room.game.result) assert.ok(r.time != null && r.time / 2 < 32, `${weather}: ${r.id} finished (${r.time})`);
    t2.cleanup();
  }
});

test('cars: a look is checked against the lists, and anything unknown is the plain car', () => {
  const t = setup(game, 2);
  t.act(0, 'car', { body: 'van', paint: game.PAINTS[2], stripe: game.PAINTS[9], extra: 'keg' });
  assert.deepStrictEqual(t.room.game.looks.p0, { body: 'van', paint: game.PAINTS[2], stripe: game.PAINTS[9], extra: 'keg' });
  t.act(1, 'car', { body: 'tank', paint: 'red', stripe: '<script>', extra: 'rocket', speed: 999 });
  assert.deepStrictEqual(t.room.game.looks.p1, { body: 'sports', paint: null, stripe: null, extra: 'none' }, 'nothing it does not know');
  t.act(1, 'car', { body: 'trolley', extra: 'number' });
  assert.deepStrictEqual(t.room.game.looks.p1, { body: 'trolley', paint: null, stripe: null, extra: 'number' });
  // Everyone sees everyone's car (with their seat, for the number); the plain one if not picked.
  const v = t.view(1);
  assert.strictEqual(v.looks.p0.body, 'van');
  assert.strictEqual(v.looks.p1.n, 2);
  assert.deepStrictEqual(v.myLook, t.room.game.looks.p1);
  assert.strictEqual(t.view(0).looks.p1.extra, 'number');
  const fresh = setup(game, 2);
  assert.strictEqual(fresh.view(0).myLook, null, 'nobody has picked yet');
  assert.strictEqual(fresh.view(0).looks.p1.body, 'sports');
  assert.deepStrictEqual(game.waitingOn(fresh.room), ['p0', 'p1'], 'picking a car is up to you: the bets are what count');
  t.cleanup();
  fresh.cleanup();
});

test('cars: kept from race to race, and not changed mid-race; it makes no difference to the driving', () => {
  const t = setup(game, 3, { track: 'bar', laps: 2 });
  t.act(0, 'car', { body: 'hotrod', extra: 'flames' });
  t.act(1, 'car', { body: 'buggy', extra: 'cone' });
  startRace(t, [['p0', 1], ['p1', 1], ['p2', 1]]);
  t.act(0, 'car', { body: 'pickup' });
  assert.strictEqual(t.room.game.looks.p0.body, 'hotrod', 'not while racing');
  runRace(t);
  assert.ok(['payout', 'results'].includes(t.room.game.phase));
  // After the flag (the results screen's "Edit car") it can change again.
  t.act(1, 'car', { body: 'van', extra: 'spoiler' });
  t.room.game.phase = 'results';
  t.act(0, 'nextRace');
  assert.strictEqual(t.room.game.race, 2);
  assert.deepStrictEqual(t.room.game.looks.p0, { body: 'hotrod', paint: null, stripe: null, extra: 'flames' });
  assert.strictEqual(t.room.game.looks.p1.body, 'van');
  assert.strictEqual(t.view(2).looks.p0.body, 'hotrod');
  // Every car the same circle on the track, whatever it looks like.
  assert.ok(t.room.game.cars.every((c) => Object.keys(c).sort().join() === Object.keys(t.room.game.cars[0]).sort().join()));
  t.cleanup();
});

test('cars: a bot picks one of its own before it bets', () => {
  const t = setup(game, 2);
  t.room.players[1].bot = 'npc';
  const move = t.bot(1);
  assert.strictEqual(move.type, 'car');
  game.handle(t.room, t.player(1), move, t.ctx);
  const look = t.room.game.looks.p1;
  assert.ok(game.BODIES.includes(look.body) && game.EXTRAS.includes(look.extra));
  assert.strictEqual(t.bot(1).type, 'bet', 'then its bet');
  t.cleanup();
});
