const test = require('node:test');
const assert = require('node:assert');
const { createContext } = require('../lib/context');

function room(settings, n = 2) {
  return {
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, drinks: 0, connected: true })),
    feed: [],
    settings,
  };
}
function setup() {
  const events = [];
  const ctx = createContext({ emit: (r, id, event, data) => events.push({ id, event, data }), broadcast() {} });
  return { ctx, events };
}

test('water mode turns sips into water, which never counts as drinks', () => {
  const { ctx, events } = setup();
  const r = room({});
  r.players[0].waterMode = true;
  ctx.drink(r, 'p0', 3, 'wrong guess');
  assert.strictEqual(r.players[0].drinks, 0);
  assert.strictEqual(r.players[0].total ?? 0, 0);
  assert.strictEqual(r.players[0].water, 3);
  assert.strictEqual(events[0].data.water, true);
  assert.strictEqual(events[0].data.title, '3 SIPS OF WATER');
  ctx.finishDrink(r, 'p0');
  assert.strictEqual(events[1].data.title, 'FINISH YOUR WATER');
  assert.strictEqual(r.players[0].finished ?? 0, 0);
});

test('past the hourly limit, sips become water', () => {
  const { ctx, events } = setup();
  const r = room({ cap: 10, breaks: false });
  ctx.drink(r, 'p0', 6);
  ctx.drink(r, 'p0', 4);
  assert.strictEqual(r.players[0].drinks, 10);
  ctx.drink(r, 'p0', 2);
  assert.strictEqual(r.players[0].drinks, 10);
  assert.strictEqual(r.players[0].water, 2);
  assert.match(events[2].data.why, /10 sips this hour/);
  // An hour later the limit resets.
  r.players[0].log = r.players[0].log.map(([t, n]) => [t - 61 * 60 * 1000, n]);
  ctx.drink(r, 'p0', 2);
  assert.strictEqual(r.players[0].drinks, 12);
});

test('a water break comes round for everyone', () => {
  const { ctx, events } = setup();
  const r = room({}, 2);
  for (let i = 0; i < 12; i++) ctx.drink(r, `p${i % 2}`, 2);
  const notices = events.filter((e) => e.event === 'notice');
  assert.strictEqual(notices.length, 2); // one per phone, after 24 sips
  assert.match(notices[0].data.title, /WATER BREAK/);
  const off = setup();
  const r2 = room({ breaks: false });
  for (let i = 0; i < 20; i++) off.ctx.drink(r2, 'p0', 3);
  assert.strictEqual(off.events.filter((e) => e.event === 'notice').length, 0);
});
