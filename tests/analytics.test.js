const test = require('node:test');
const assert = require('node:assert');
const { track, cleanEvent, cleanFeedback, rateLimiter } = require('../lib/analytics');

const GAMES = ['kingsCup', 'shotPoker'];

test('track writes one JSON line Cloud Logging can read', () => {
  const lines = [];
  track('game_started', { game: 'kingsCup', players: 4 }, (l) => lines.push(l));
  track('feedback', { message: 'hi' }, (l) => lines.push(l));
  assert.deepStrictEqual(JSON.parse(lines[0]), { severity: 'INFO', message: 'analytics: game_started', event: 'game_started', game: 'kingsCup', players: 4 });
  assert.strictEqual(JSON.parse(lines[1]).severity, 'NOTICE');
});

test('only real pass-and-play game starts are counted', () => {
  assert.deepStrictEqual(cleanEvent({ event: 'local_game_started', game: 'kingsCup', players: 3 }, GAMES),
    { event: 'local_game_started', game: 'kingsCup', players: 3, mode: 'pass_and_play' });
  assert.strictEqual(cleanEvent({ event: 'local_game_started', game: 'nope', players: 3 }, GAMES), null);
  assert.strictEqual(cleanEvent({ event: 'local_game_started', game: 'kingsCup', players: 99 }, GAMES), null);
  assert.strictEqual(cleanEvent({ event: 'anything_else', game: 'kingsCup', players: 3 }, GAMES), null);
  assert.strictEqual(cleanEvent(null, GAMES), null);
});

test('feedback is trimmed, capped and needs a message', () => {
  assert.deepStrictEqual(cleanFeedback({ message: '  love   it ', contact: ' me@x.com ', game: 'shotPoker', extra: 1 }, GAMES),
    { message: 'love it', contact: 'me@x.com', game: 'shotPoker' });
  assert.deepStrictEqual(cleanFeedback({ message: 'x'.repeat(5000), game: 'bogus' }, GAMES), { message: 'x'.repeat(1000) });
  assert.strictEqual(cleanFeedback({ message: '   ' }, GAMES), null);
  assert.strictEqual(cleanFeedback({ message: 42 }, GAMES), null);
});

test('rate limiter allows a few per minute per key', () => {
  const allow = rateLimiter(2);
  assert.ok(allow('a') && allow('a'));
  assert.ok(!allow('a'));
  assert.ok(allow('b'));
});
