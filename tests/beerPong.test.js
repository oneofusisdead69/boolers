const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/beerPong');

// No wobble at all, so a perfect throw lands where it's aimed.
game.WOBBLE.none = 0;
const at = (cup) => ({ x: String(cup.x), y: String(cup.y), angle: '0', speed: '1' });
const miss = { x: '0', y: '0.95', angle: '0', speed: '1' };
const idx = (id) => Number(id.slice(1));
function ready(teams, options = {}) {
  const t = setup(game, teams.flat().length, options);
  const g = t.room.game;
  g.teams = teams;
  t.act(0, 'go');
  Object.assign(g, { wobble: 'none', turnTeam: 0, balls: 2, sunk: 0, turnId: teams[0][0], next: [0, 0] });
  return t;
}
const throwAt = (t, target) => t.act(idx(t.room.game.turnId), 'throw', target);

test('racks of ten; only the host starts; a ball each, then the other team', () => {
  const t = setup(game, 4);
  t.act(1, 'go');
  assert.strictEqual(t.room.game.phase, 'teams');
  t.act(0, 'go');
  assert.deepStrictEqual(t.room.game.cups.map((c) => c.length), [10, 10]);

  const u = ready([['p0', 'p2'], ['p1', 'p3']]);
  const g = u.room.game;
  u.act(1, 'throw', miss); // not their turn
  assert.strictEqual(g.balls, 2);
  throwAt(u, miss);
  assert.strictEqual(g.turnId, 'p2', 'the other player on the team throws the second ball');
  throwAt(u, miss);
  assert.strictEqual(g.turnTeam, 1);
  throwAt(u, miss);
  throwAt(u, miss);
  assert.strictEqual(g.turnId, 'p0', 'back to Red, from the top');
});

test('a ball in a cup takes it off and the other team drinks; both in is balls back', () => {
  const t = ready([['p0', 'p2'], ['p1', 'p3']], { sips: 2 });
  const g = t.room.game;
  throwAt(t, at(g.cups[1][0]));
  assert.strictEqual(g.cups[1].length, 9);
  assert.deepStrictEqual(t.drinks(), [0, 2, 0, 0], 'the front cup is p1\'s: p1 drinks');
  assert.ok(t.view(0).last.cup);
  throwAt(t, at(g.cups[1][0]));
  assert.strictEqual(g.turnTeam, 0, 'balls back');
  assert.strictEqual(g.balls, 2);
});

test('the rack is tidied at 6 and 3; the last cup wins, and the losers finish their drinks', () => {
  const t = ready([['p0'], ['p1']]);
  const g = t.room.game;
  g.cups[1] = game.rack(10).slice(0, 7);
  throwAt(t, at(g.cups[1][6]));
  assert.deepStrictEqual(g.cups[1].map(({ x, y }) => ({ x, y })), game.rack(6), 're-racked into a triangle of six');
  assert.ok(g.cups[1].every((c) => c.owner === 'p1'), 'and dealt to the team again');
  g.cups[1] = [{ x: 0, y: 0.1 }];
  g.turnTeam = 0; g.turnId = 'p0'; g.balls = 2;
  throwAt(t, at(g.cups[1][0]));
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(t.view(1).winner, 0);
});

test('too soft falls short, too hard goes long', () => {
  const aim = { x: 0, y: 0.3 };
  assert.ok(game.land(aim, 0, 0.6, 0).y < 0.3 - 0.2);
  assert.ok(game.land(aim, 0, 1.4, 0).y > 0.3 + 0.2);
  assert.strictEqual(game.land(aim, 0, 1.03, 0).y, 0.3);
  assert.ok(game.land(aim, 20, 1, 0).x > 0.2, 'a flick leaning right goes right');
});
