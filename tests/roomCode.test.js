const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCode, randomCode, checkRoomName, pickCode } = require('../lib/roomCode');

test('a valid room name becomes the code, uppercase', () => {
  assert.deepEqual(checkRoomName('Noahs'), { code: 'NOAHS' });
  assert.deepEqual(checkRoomName('abc'), { code: 'ABC' });
  assert.deepEqual(checkRoomName('Party2026'), { code: 'PARTY2026' });
  assert.deepEqual(checkRoomName('ABCDEFGHIJKL'), { code: 'ABCDEFGHIJKL' });
});

test('room names are trimmed and their spaces dropped', () => {
  assert.deepEqual(checkRoomName('  noahs place  '), { code: 'NOAHSPLACE' });
  assert.deepEqual(checkRoomName('a b c'), { code: 'ABC' });
});

test('room names that are too short or too long are refused', () => {
  assert.match(checkRoomName('ab').error, /3 to 12/);
  assert.match(checkRoomName('a b').error, /3 to 12/);
  assert.match(checkRoomName('ABCDEFGHIJKLM').error, /3 to 12/);
});

test('room names with anything but letters and digits are refused', () => {
  for (const bad of ["Noah's", 'bar-1', 'a_b_c', 'café', 'pub!', '<b>hi</b>', 'ÄBCD']) {
    assert.match(checkRoomName(bad).error, /letters and numbers/, bad);
  }
  assert.ok(checkRoomName({ code: 'ABCD' }).error);
  assert.ok(checkRoomName(1234).error);
});

test('a few rude words are refused', () => {
  assert.ok(checkRoomName('fuckthis').error);
  assert.ok(checkRoomName('BigShit').error);
});

test('a blank room name gets a random 4-letter code', async () => {
  for (const blank of [undefined, null, '', '   ']) {
    assert.deepEqual(checkRoomName(blank), { code: null });
    const { code, error } = await pickCode(blank);
    assert.equal(error, undefined);
    assert.match(code, /^[A-HJ-NP-Z]{4}$/);
  }
});

test('random codes skip ones in use', () => {
  const taken = new Set();
  for (let i = 0; i < 300; i++) {
    const code = randomCode((c) => taken.has(c));
    assert.ok(!taken.has(code));
    taken.add(code);
  }
});

test('a room name that is a live room is taken, whatever its case', async () => {
  const rooms = new Map([['NOAHS', {}], ['ABCD', {}]]);
  const inUse = (c) => rooms.has(c);
  assert.deepEqual(await pickCode('noahs', { inUse }), { error: 'That room name is taken, try another' });
  assert.deepEqual(await pickCode('AbCd', { inUse }), { error: 'That room name is taken, try another' });
  assert.deepEqual(await pickCode('newroom', { inUse }), { code: 'NEWROOM' });
});

test('a room name only in the store (another server) is taken too', async () => {
  const stored = new Set(['SAVED']);
  const opts = { inUse: () => false, isLive: async (c) => stored.has(c) };
  assert.match((await pickCode('saved', opts)).error, /taken/);
  assert.deepEqual(await pickCode('fresh', opts), { code: 'FRESH' });
});

test('a room made while the store was being checked is taken', async () => {
  const rooms = new Set();
  const isLive = async (c) => { rooms.add(c); return false; }; // someone else got there first
  assert.match((await pickCode('race', { inUse: (c) => rooms.has(c), isLive })).error, /taken/);
});

test('bad names are refused before anything is looked up', async () => {
  let looked = false;
  const res = await pickCode('no!', { isLive: async () => { looked = true; return false; } });
  assert.ok(res.error);
  assert.equal(looked, false);
});

test('joining is case-insensitive and takes old and new codes', () => {
  assert.equal(normalizeCode('abcd'), 'ABCD');
  assert.equal(normalizeCode(' AbCd '), 'ABCD');
  assert.equal(normalizeCode('noahs place'), 'NOAHSPLACE');
  assert.equal(normalizeCode('party2026'), 'PARTY2026');
  assert.equal(normalizeCode('abcdefghijklmnop'), 'ABCDEFGHIJKL');
  assert.equal(normalizeCode(undefined), '');
  assert.equal(normalizeCode(null), '');
  // A picked name joins as the code it was stored under.
  const { code } = checkRoomName('Noahs Place');
  assert.equal(normalizeCode('NOAHSplace'), code);
});
