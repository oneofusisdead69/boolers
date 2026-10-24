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

test('each tick pushes some horses forward by a random amount', () => {
  const t = setup(game, 2);
  const g = t.room.game;
  t.act(0, 'bet', { horse: '1', sips: 1 }).act(0, 'startRace');
  // Rolls: horse 1 pushed (0.1 < 0.4) by min + 0.5 of the range; horse 2 not (0.9); rest not.
  const rolls = [0.1, 0.5, 0.9, 0.9, 0.9, 0.9, 0.9];
  game.tick(t.room, t.ctx, () => rolls.shift());
  assert.ok(Math.abs(g.progress['1'] - 0.04) < 1e-9);
  assert.strictEqual(g.progress['2'], 0);
  assert.strictEqual(g.ticks, 1);
  t.cleanup();
});

test('first past the post after the laps wins; losers drink, winners hand out', () => {
  const t = setup(game, 3, { laps: 2 });
  const g = t.room.game;
  t.act(0, 'bet', { horse: '3', sips: 2 }).act(1, 'bet', { horse: '5', sips: 3 }).act(2, 'bet', { horse: '3', sips: 1 });
  t.act(0, 'startRace');
  g.progress = { 1: 1.5, 2: 1.9, 3: 1.99, 4: 1.2, 5: 1.98, 6: 0.5 };
  // Horses 3 and 5 both cross: the one that got furthest wins.
  game.tick(t.room, t.ctx, (() => { const r = [0.1, 0.0, 0.1, 0.0, 0.1, 1.0, 0.9, 0.1, 0.9, 0.9]; return () => r.shift(); })());
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
  // About 25 seconds a lap at 400ms a tick: roughly 60 ticks; allow a wide margin.
  assert.ok(g.ticks > 25 && g.ticks < 200, `race took ${g.ticks} ticks`);
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
  // A faster horse gets bigger pushes.
  const before = g.progress['1'];
  game.tick(t.room, t.ctx, (() => { const r = [0.1, 0.5]; return () => (r.length ? r.shift() : 0.9); })());
  assert.ok(Math.abs(g.progress['1'] - before - 0.04 * 2.2) < 1e-9);
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
