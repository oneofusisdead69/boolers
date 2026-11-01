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
      const edge = tr.width / 2 + tr.band;
      assert.ok(x > 40 && x < 960 && y > 40 && y < 585, `${id}: stays on the screen`);
      // The centreline is where it says it is.
      assert.ok(game.locate(tr, x, y).dist < 1, `${id}: ${i} on the line`);
      assert.ok(edge > 0);
    }
  }
});

test('every track: parts of the loop stay apart, and bots lap it in 12 to 32 seconds (40 on a hard map)', () => {
  for (const id of Object.keys(game.TRACKS)) {
    const tr = game.trackOf(id);
    const edge = tr.width / 2 + tr.band;
    // Well apart (a wall between) wherever the loop comes back near itself, except where it
    // crosses itself on purpose (the figure eight): there one part is on a bridge, well over the
    // other.
    const far = Math.round(250 / tr.step);
    let crossings = 0;
    for (let i = 0; i < tr.count; i++) {
      for (let j = i + far; j < tr.count && tr.count - (j - i) >= far; j++) {
        if (Math.hypot(tr.xs[i] - tr.xs[j], tr.ys[i] - tr.ys[j]) > edge * 2) continue;
        assert.ok(tr.crossing, `${id}: parts ${i} and ${j} too close`);
        assert.ok(Math.abs(tr.zs[i] - tr.zs[j]) >= 30, `${id}: parts ${i} and ${j} cross without a bridge between`);
        crossings++;
      }
    }
    assert.strictEqual(crossings > 0, tr.crossing, `${id}: crosses itself only if it says so`);
    const max = tr.hard ? 40 : 32;
    const levels = tr.hard ? ['booler', 'baller', 'npc'] : ['baller'];
    for (const level of levels) {
      const t = setup(game, 3, { track: id, laps: 2 });
      startRace(t, [['p0', 1], ['p1', 1], ['p2', 1]]);
      for (const p of t.room.players) p.bot = level;
      runRace(t);
      const g = t.room.game;
      assert.strictEqual(g.trackId, id);
      for (const r of g.result) {
        assert.ok(r.time != null, `${id}: ${r.id} (${level}) finished`);
        assert.ok(r.time / 2 > 12 && r.time / 2 < max, `${id}: a lap in ${(r.time / 2).toFixed(1)}s (${level})`);
      }
      t.cleanup();
    }
  }
});

test('the normal tracks stay flat; the hard maps are narrower, hilly and in a mix of their own', () => {
  assert.ok(game.NORMAL_IDS.length >= 6 && game.HARD_IDS.length >= 3);
  for (const id of game.NORMAL_IDS) {
    const tr = game.trackOf(id);
    assert.ok(tr.zs.every((z) => z === 0) && !tr.hilly && tr.width === game.WIDTH && tr.band === game.BAND, `${id} as it was`);
    assert.ok(game.view(setup(game, 2, { track: id }).room, { id: 'p0' }).track.line.every((p) => p.length === 2));
  }
  for (const id of game.HARD_IDS) {
    const tr = game.trackOf(id);
    assert.ok(tr.hilly && tr.width < game.WIDTH, `${id}: narrow and hilly`);
  }
  const choices = game.options.find((o) => o.id === 'track').choices;
  assert.ok(choices.some((c) => c.value === 'hard' && c.label.startsWith('🔥')));
  assert.ok(game.HARD_IDS.every((id) => choices.find((c) => c.value === id).label.startsWith('🔥')));
  // Mix it up: normal tracks only; the hard mix: hard maps only.
  for (const [pick, ids] of [['random', game.NORMAL_IDS], ['hard', game.HARD_IDS]]) {
    const t = setup(game, 2, { track: pick });
    for (let k = 0; k < 12; k++) {
      assert.ok(ids.includes(t.room.game.trackId), `${pick}: ${t.room.game.trackId}`);
      t.room.game.phase = 'results';
      t.act(0, 'nextRace');
    }
    t.cleanup();
  }
});

test('figure eight: cars on the bridge and under it pass through each other, and keep their place in the race', () => {
  const t = setup(game, 2, { track: 'figure8', laps: 2 });
  startRace(t, [['p0', 1], ['p1', 1]]);
  const g = t.room.game;
  const tr = game.trackOf('figure8');
  // The two samples where the loop crosses: one high, one low.
  let best = null;
  const far = Math.round(250 / tr.step);
  for (let i = 0; i < tr.count; i++) {
    for (let j = i + far; j < tr.count - far; j++) {
      const d = Math.hypot(tr.xs[i] - tr.xs[j], tr.ys[i] - tr.ys[j]);
      if (!best || d < best.d) best = { i, j, d };
    }
  }
  const [hi, lo] = tr.zs[best.i] > tr.zs[best.j] ? [best.i, best.j] : [best.j, best.i];
  assert.ok(tr.zs[hi] - tr.zs[lo] >= 30);
  const [a, b] = g.cars;
  const place = (c, i) => Object.assign(c, { x: tr.xs[i], y: tr.ys[i], a: tr.dir[i], vx: 0, vy: 0, seg: i, s: i * tr.step, z: tr.zs[i], cp: Math.floor((i * tr.step) / (tr.length / 8)) });
  place(a, hi);
  place(b, lo);
  t.fireTimer();
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 10, 'right over each other, and not pushed apart');
  assert.ok(Math.abs(a.seg - hi) < 3 && Math.abs(b.seg - lo) < 3, 'each still on its own leg');
  assert.ok(a.z - b.z >= 30);
  // Driving on (a lost car is only looked for on its own level).
  for (const c of g.cars) Object.assign(c, { gas: 1 });
  for (let k = 0; k < 10; k++) t.fireTimer();
  assert.ok(Math.abs(a.seg - hi) < 40 && Math.abs(b.seg - lo) < 40, 'and stays there');
  t.cleanup();
});

test('betting: on any car in the race, up to the max', () => {
  const t = setup(game, 3, { maxBet: 3 });
  t.act(0, 'bet', { car: 'p0', sips: 2 });
  t.act(1, 'bet', { car: 'p0', sips: 4 });
  t.act(2, 'bet', { car: 'nobody', sips: 1 });
  // (Everyone starts with a sip on themselves: a bet that isn't a valid one leaves that.)
  assert.deepStrictEqual(t.room.game.bets, { p0: { pick: 'p0', sips: 2 }, p1: { pick: 'p1', sips: 1 }, p2: { pick: 'p2', sips: 1 } });
  assert.deepStrictEqual(t.room.game.autoBets, { p1: true, p2: true });
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

test('the race keeps to the wall clock: a late tick catches up and the next is set for its own time', () => {
  const t = setup(game, 2);
  startRace(t, [['p0', 1], ['p1', 1]]);
  const g = t.room.game;
  // On time: one step, and the next tick due a step after this one was.
  g.clock = Date.now() + 5;
  let before = g.t;
  t.fireTimer();
  assert.ok(Math.abs(g.t - before - 0.05) < 1e-9, 'one step');
  assert.ok(Math.abs(t.room.deadline - g.clock) <= 2, 'next tick on the grid, not 50 ms from now');
  // 120 ms late: three steps, and the next one sooner than 50 ms.
  g.clock = Date.now() - 120;
  before = g.t;
  t.fireTimer();
  assert.ok(Math.abs(g.t - before - 0.15) < 1e-9, 'caught up');
  assert.ok(t.room.deadline - Date.now() < 50);
  // Far behind (a stalled server): no leap ahead, it carries on from now.
  g.clock = Date.now() - 5000;
  before = g.t;
  t.fireTimer();
  assert.ok(Math.abs(g.t - before - 0.15) < 1e-9, 'at most three steps');
  assert.ok(g.clock > Date.now(), 'from now on');
  t.cleanup();
});

test('laps go out with the cars, not as a whole new state: only a finish is broadcast', () => {
  const t = setup(game, 3, { track: 'bar', laps: 2 });
  startRace(t, [['p0', 1], ['p1', 1], ['p2', 1]]);
  for (const p of t.room.players) p.bot = 'booler';
  const g = t.room.game;
  const sent = [];
  t.ctx.signal = (room, event, data) => sent.push(data);
  let laps = 0;
  let loud = 0;
  for (let n = 0; n < 20000 && g.phase === 'race'; n++) {
    const done = g.cars.filter((c) => c.finished != null).length;
    const cps = g.cars.map((c) => c.cp);
    if (game.tick(t.room, t.ctx) !== 'quiet') {
      loud++;
      assert.ok(g.phase !== 'race' || g.cars.filter((c) => c.finished != null).length > done, 'a broadcast only for a finish');
    }
    laps += g.cars.filter((c, i) => c.cp !== cps[i] && c.cp % 8 === 0 && c.finished == null).length;
  }
  assert.ok(laps >= 3, 'cars lapped');
  assert.ok(loud <= 3, `a broadcast for each finish at most (${loud})`);
  assert.ok(sent.some((d) => d.c.some((c) => c[5] === 2)), 'the lap is in the cars');
  t.cleanup();
});

test('bots in a race with nothing to toot about look again in a while', () => {
  const t = setup(game, 2);
  t.room.players[1].bot = 'baller';
  startRace(t, [['p0', 1], ['p1', 1]]);
  const g = t.room.game;
  const car = g.cars.find((c) => c.id === 'p1');
  car.honkAt = g.t; // (just tooted)
  const move = t.bot(1);
  assert.strictEqual(move.type, '_wait');
  assert.ok(move.delay >= 1000);
  car.finished = g.t;
  assert.strictEqual(t.bot(1), null, 'over the line: nothing');
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

test('a joiner before the lights gets a car and a sip on themselves; only the host is waited on', () => {
  const t = setup(game, 2);
  const p = { id: 'p9', name: 'Late', drinks: 0, connected: true };
  t.room.players.push(p);
  game.onJoin(t.room, p, t.ctx);
  assert.ok(t.room.game.racers.includes('p9'));
  assert.strictEqual(t.room.game.cars.length, 3);
  assert.deepStrictEqual(t.room.game.bets.p9, { pick: 'p9', sips: 1 });
  assert.deepStrictEqual(game.waitingOn(t.room), ['p0'], 'everyone has a bet: the host starts when they like');
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
  assert.deepStrictEqual([...many({ style: 'halloween' })].sort(), ['fog', 'night'], 'always dark at Halloween');
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

test('Halloween: a dark race, told spookily, and the bots still finish', () => {
  const t = setup(game, 3, { track: 'hairpin', laps: 2 });
  t.room.style = 'halloween';
  startRace(t, [['p0', 1], ['p1', 1], ['p2', 1]]);
  assert.ok(t.room.feed.some((f) => f.text.startsWith('👻 BOO! Race 1 is off')), 'a spooky start');
  for (const p of t.room.players) p.bot = 'npc';
  runRace(t);
  const g = t.room.game;
  for (const r of g.result) assert.ok(r.time != null, `${r.id} finished`);
  assert.ok(t.room.feed.some((f) => /^🎃 .* wins race 1, and escapes the graveyard alive!$/.test(f.text)), 'a spooky win');
  t.act(0, 'nextRace');
  assert.ok(['night', 'fog'].includes(g.weather));
  assert.ok(t.room.feed.some((f) => /^(🌕 A full moon|🌫️ The graveyard fog).*Hairpin Alley/.test(f.text)), 'spooky weather');
  t.cleanup();
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
  assert.deepStrictEqual(game.waitingOn(fresh.room), ['p0'], 'picking a car (or another bet) is up to you: only the host is waited on');
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

test('bets: everyone starts with a sip on themselves, paid out as any bet; bots make their own', () => {
  const t = setup(game, 3, { track: 'bar', laps: 2, lastSips: 0, multiplier: 2 });
  const g = t.room.game;
  assert.deepStrictEqual(g.bets, { p0: { pick: 'p0', sips: 1 }, p1: { pick: 'p1', sips: 1 }, p2: { pick: 'p2', sips: 1 } });
  assert.strictEqual(t.view(1).myBet.sips, 1);
  assert.strictEqual(t.view(1).autoBet, true);
  t.act(1, 'bet', { car: 'p0', sips: 3 });
  assert.strictEqual(t.view(1).autoBet, false, 'changed');
  t.act(0, 'startRace');
  assert.strictEqual(g.phase, 'countdown', 'the host can start straight away');
  for (let i = 0; i < 3; i++) t.fireTimer();
  runRace(t);
  const winner = g.result[0].id;
  for (const p of t.room.players) {
    const b = g.bets[p.id];
    if (b.pick === winner) assert.strictEqual(g.payout[p.id].total, b.sips * 2, `${p.id} hands out`);
    else assert.strictEqual(p.drinks, b.sips, `${p.id} drinks their bet`);
  }
  // Next race: a sip on yourself again.
  if (g.phase === 'payout') for (const id of Object.keys(g.payout)) game.handle(t.room, t.room.players.find((p) => p.id === id), { type: 'give', alloc: game.bot(t.room, t.room.players.find((p) => p.id === id), t.ctx, 0.6)?.alloc || JSON.stringify({ [t.room.players.find((p) => p.id !== id).id]: g.payout[id].total }) }, t.ctx);
  t.room.game.phase = 'results';
  t.act(0, 'nextRace');
  assert.deepStrictEqual(g.bets.p1, { pick: 'p1', sips: 1 });
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
