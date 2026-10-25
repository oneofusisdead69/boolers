const test = require('node:test');
const assert = require('node:assert');
const LOOKS = require('../lib/looks');

test('a valid look is kept as asked', () => {
  assert.deepStrictEqual(LOOKS.choose({ avatar: '🦊', color: '#3ddc97' }), { avatar: '🦊', color: '#3ddc97' });
});

test('missing or unknown looks are filled in, avoiding ones already taken', () => {
  const taken = [{ avatar: '🦊', color: LOOKS.COLORS[0] }];
  const look = LOOKS.choose({ avatar: '<b>', color: 'red' }, taken);
  assert.ok(LOOKS.AVATARS.includes(look.avatar) && look.avatar !== '🦊');
  assert.strictEqual(look.color, LOOKS.COLORS[1]);
});

test('every colour taken: still picks a valid one', () => {
  const taken = LOOKS.COLORS.map((color) => ({ color }));
  assert.ok(LOOKS.COLORS.includes(LOOKS.choose({}, taken).color));
});

test('pass-and-play seats get different looks', () => {
  const seats = Array.from({ length: 10 }, (_, i) => LOOKS.forSeat(i));
  assert.strictEqual(new Set(seats.map((s) => s.color)).size, 10);
  assert.strictEqual(new Set(seats.map((s) => s.avatar)).size, 10);
});

test('a drink is kept only when it is one of the drinks (none means the house drink)', () => {
  assert.strictEqual(LOOKS.choose({ drink: '🍹' }).drink, '🍹');
  assert.ok(!('drink' in LOOKS.choose({ drink: '<b>' })));
  assert.ok(!('drink' in LOOKS.choose({})));
});
