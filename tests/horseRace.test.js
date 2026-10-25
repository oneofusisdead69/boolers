const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/horseRace');

test('six horses; bets on a horse, checked against the max', () => {
  const t = setup(game, 3, { maxBet: 3 });
  const g = t.room.game;
  assert.strictEqual(game.HORSES.length, 6);
  assert.deepStrictEqual(Object.values(g.progress), [0, 0, 0, 0, 0, 0]);
  t.act(1, 'bet', { horse: '7', sips: '1' });
  t.act(1, 'bet', { horse: '2', sips: '4' });
  assert.deepStrictEqual(g.bets, {});
  t.act(1, 'bet', { horse: '2', sips: '3' });
  assert.deepStrictEqual(t.view(0).bets, { p1: { pick: '2', sips: 3 } });
  t.act(1, 'startRace');
  assert.strictEqual(g.phase, 'betting', 'only the host starts it');
  t.act(0, 'startRace');
  assert.strictEqual(g.phase, 'race');
  t.cleanup();
});

test('horses break from the gate and their speeds change gradually, never stopping', () => {
  const t = setup(game, 2);
  const g = t.room.game;
  t.act(0, 'bet', { horse: '1', sips: 1 }).act(0, 'startRace');
  assert.deepStrictEqual(Object.values(g.vel), [0, 0, 0, 0, 0, 0], 'everyone starts from the gate');
  const pace = 1 / 25;
  let prev = { ...g.vel };
  let prevAt = { ...g.progress };
  for (let i = 0; i < 60; i++) {
    game.tick(t.room, t.ctx);
    for (const id of Object.keys(g.vel)) {
      assert.ok(g.progress[id] > prevAt[id], 'every horse moves forward every tick');
      // From the gate, speeds can only climb by the response each tick; after that they drift.
      assert.ok(Math.abs(g.vel[id] - prev[id]) < pace * 0.5, 'no sudden jumps in speed');
    }
    prev = { ...g.vel };
    prevAt = { ...g.progress };
  }
  const speeds = Object.values(g.vel);
  assert.ok(Math.min(...speeds) > pace * 0.4 && Math.max(...speeds) < pace * 1.8, `speeds ${speeds}`);
  t.cleanup();
});

test('a kick speeds a horse up for a while; a fade slows it', () => {
  const t = setup(game, 2);
  const g = t.room.game;
  t.act(0, 'bet', { horse: '1', sips: 1 }).act(0, 'startRace');
  for (const id of Object.keys(g.vel)) { g.vel[id] = 1 / 25; g.form[id] = 1; }
  // Every roll 0: horse after horse starts a surge (0 < 5%), all kicks (0 < 65%) at the low end.
  game.tick(t.room, t.ctx, () => 0);
  assert.ok(Object.values(g.surge).every((s) => s.factor === 1.18 && s.left === 3));
  assert.ok(g.vel['1'] > 1 / 25, 'kicking on');
  t.cleanup();
});

test('first past the post after the laps wins; losers drink, winners hand out', () => {
  const t = setup(game, 3, { laps: 2 });
  const g = t.room.game;
  t.act(0, 'bet', { horse: '3', sips: 2 }).act(1, 'bet', { horse: '5', sips: 3 }).act(2, 'bet', { horse: '3', sips: 1 });
  t.act(0, 'startRace');
  g.progress = { 1: 1.5, 2: 1.9, 3: 1.995, 4: 1.2, 5: 1.99, 6: 0.5 };
  for (const id of Object.keys(g.vel)) { g.vel[id] = 1 / 25; g.form[id] = 1; }
  // Horses 3 and 5 both cross on this tick: the one that got furthest wins. (Rolls of 0.5: no
  // surges, no wobble.)
  game.tick(t.room, t.ctx, () => 0.5);
  assert.strictEqual(g.winner, '3');
  assert.strictEqual(g.phase, 'payout');
  assert.deepStrictEqual(t.drinks(), [0, 3, 0]);
  t.act(0, 'give', { alloc: JSON.stringify({ p1: 4 }) });
  t.act(2, 'give', { alloc: JSON.stringify({ p1: 1, p0: 1 }) });
  assert.strictEqual(g.phase, 'results');
  assert.deepStrictEqual(t.drinks(), [1, 8, 0]);
  t.act(0, 'nextRace');
  assert.strictEqual(g.race, 2);
  assert.deepStrictEqual(Object.values(g.progress), [0, 0, 0, 0, 0, 0]);
  t.cleanup();
});

test('a whole race runs on its timer and always finishes', () => {
  const t = setup(game, 2, { laps: 1 });
  const g = t.room.game;
  t.act(0, 'bet', { horse: '6', sips: 1 }).act(0, 'startRace');
  let ticks = 0;
  while (g.phase === 'race' && ticks++ < 1000) t.fireTimer();
  assert.ok(g.winner);
  // About 25 seconds a lap at 300ms a tick: roughly 85 ticks; allow a wide margin.
  assert.ok(g.ticks > 50 && g.ticks < 160, `race took ${g.ticks} ticks`);
  t.cleanup();
});

test("jockey mode: one rider per horse, and the dial changes your horse's speed", () => {
  const t = setup(game, 3, { jockey: true });
  const g = t.room.game;
  t.act(0, 'bet', { horse: '1', sips: 1 });
  t.act(1, 'bet', { horse: '1', sips: 1 }); // taken
  assert.strictEqual(g.bets.p1, undefined);
  t.act(1, 'bet', { horse: '2', sips: 1 });
  t.act(0, 'ride', { hit: 'green' }); // not racing yet
  assert.strictEqual(g.mult['1'], 1);
  t.act(0, 'startRace');
  const realNow = Date.now;
  let now = 1e6;
  Date.now = () => now;
  try {
    t.act(0, 'ride', { hit: 'green' });
    assert.strictEqual(g.mult['1'], 1.12);
    t.act(0, 'ride', { hit: 'green' }); // too soon after the last tap
    assert.strictEqual(g.mult['1'], 1.12);
    now += 300;
    t.act(0, 'ride', { hit: 'yellow' });
    assert.strictEqual(g.mult['1'], 1.12);
    now += 300;
    t.act(1, 'ride', { hit: 'red' });
    assert.strictEqual(g.mult['2'], 0.75, 'each rider steers only their own horse');
    now += 300;
    t.act(2, 'ride', { hit: 'green' }); // no horse
    t.act(1, 'ride', { hit: 'toString' });
    assert.deepStrictEqual([g.mult['3'], g.mult['2']], [1, 0.75]);
    for (let i = 0; i < 20; i++) { now += 300; t.act(0, 'ride', { hit: 'green' }); }
    assert.strictEqual(g.mult['1'], 2.2, 'speed tops out');
  } finally {
    Date.now = realNow;
  }
  // A horse ridden at ×2.2 aims for 2.2 times the pace and pulls away.
  for (let i = 0; i < 40; i++) game.tick(t.room, t.ctx);
  assert.ok(g.vel['1'] > Math.max(...['2', '3', '4', '5', '6'].map((id) => g.vel[id])) * 1.3);
  t.cleanup();
});

test('without jockey mode, several people can back the same horse and nobody rides', () => {
  const t = setup(game, 2);
  const g = t.room.game;
  t.act(0, 'bet', { horse: '4', sips: 1 }).act(1, 'bet', { horse: '4', sips: 2 });
  assert.strictEqual(Object.keys(g.bets).length, 2);
  t.act(0, 'startRace').act(0, 'ride', { hit: 'green' });
  assert.strictEqual(g.mult['4'], 1);
  t.cleanup();
});

test('backers can rename and recolour their horse; colours stay unique', () => {
  const t = setup(game, 2);
  const g = t.room.game;
  t.act(0, 'style', { name: 'Nope' }); // hasn't bet
  assert.strictEqual(g.horses[0].name, 'Thunder');
  t.act(0, 'bet', { horse: '1', sips: 1 }).act(1, 'bet', { horse: '2', sips: 1 });
  t.act(0, 'style', { name: '  Seabiscuit  ', silk: '#ff5cc8', coat: 'white' });
  assert.deepStrictEqual(g.horses[0], { id: '1', name: 'Seabiscuit', silk: '#ff5cc8', coat: 'white' });
  t.act(1, 'style', { name: 'seabiscuit', silk: '#ff5cc8', coat: 'plaid' }); // taken name, taken silks, no such coat
  assert.deepStrictEqual(g.horses[1], { id: '2', name: 'Lucky Lager', silk: '#3d7cff', coat: 'black' });
  t.act(1, 'style', { silk: 'red' });
  assert.strictEqual(g.horses[1].silk, '#3d7cff');
  // The new name is used when the horse wins.
  t.act(0, 'startRace');
  g.progress['1'] = g.laps;
  game.tick(t.room, t.ctx, () => 0.9);
  assert.strictEqual(g.winner, '1');
  assert.ok(t.room.feed.some((f) => f.text.includes('Seabiscuit wins')));
  t.cleanup();
});

test('bots bet once (good ones modestly), start the race as host, and hand out to humans', () => {
  const t = setup(game, 3, { maxBet: 10 });
  const g = t.room.game;
  t.player(1).bot = 'booler';
  t.player(2).bot = 'npv';
  assert.strictEqual(t.bot(0, 0.9).type, 'bet');
  const good = t.bot(1, 0.9);
  const bad = t.bot(2, 0.25);
  assert.ok(good.type === 'bet' && good.sips >= 1 && good.sips <= 2, `good bot bets ${good.sips}`);
  assert.ok(bad.sips >= 6 && bad.sips <= 10, `bad bot bets ${bad.sips}`);
  t.act(1, 'bet', good).act(2, 'bet', bad);
  assert.strictEqual(t.bot(1, 0.9), null, 'once a race');
  assert.strictEqual(t.bot(1, 0.9), null);
  t.act(0, 'bet', { horse: good.horse, sips: 1 });
  assert.strictEqual(t.bot(0, 0.9).type, 'startRace', 'the host starts once everyone has bet');
  t.act(0, 'startRace');
  assert.strictEqual(t.bot(1, 0.9), null, 'nobody rides without jockey mode');
  while (g.phase === 'race') t.fireTimer();
  if (g.payout.p1) {
    const give = t.bot(1, 0.9);
    assert.deepStrictEqual(Object.keys(JSON.parse(give.alloc)), ['p0'], 'the only human gets them');
    t.act(1, 'give', give);
    assert.ok(g.payout.p1.done);
  }
  t.cleanup();
});

test('jockey bots take a free horse and ride it: good ones hit green more', () => {
  const t = setup(game, 2, { jockey: true });
  const g = t.room.game;
  t.act(0, 'bet', { horse: '1', sips: 1 });
  for (let i = 0; i < 20; i++) assert.notStrictEqual(t.bot(1, 0.9).horse, '1');
  t.act(1, 'bet', t.bot(1, 0.9)).act(0, 'startRace');
  const greens = (skill) => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const a = t.bot(1, skill);
      assert.strictEqual(a.type, 'ride');
      assert.ok(a.delay >= 250, 'never faster than the dial allows');
      if (a.hit === 'green') n++;
    }
    return n;
  };
  assert.ok(greens(0.9) > greens(0.25) + 60);
  const before = g.mult[g.bets.p1.pick];
  t.act(1, 'ride', { hit: 'green' });
  assert.ok(g.mult[g.bets.p1.pick] > before);
  t.cleanup();
});
