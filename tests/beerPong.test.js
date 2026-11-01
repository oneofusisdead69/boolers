const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/beerPong');

// No wobble at all, so a swipe lands exactly where it's sent.
game.WOBBLE.none = 0;
// The swipe at a cup in the rack being thrown at (the phone sends strings, sometimes).
const at = (cups, cup) => { const s = game.swipeAt(cups, cup); return { angle: String(s.angle), speed: String(s.speed) }; };
const miss = { angle: '0', speed: '2' }; // way too hard: off the back of the table
const idx = (id) => Number(id.slice(1));
function ready(teams, options = {}) {
  const t = setup(game, teams.flat().length, options);
  const g = t.room.game;
  g.teams = teams;
  t.act(0, 'go');
  Object.assign(g, { wobble: 'none', turnTeam: 0, balls: 2, sunk: 0, turnId: teams[0][0], next: [0, 0] });
  return t;
}
// A throw, and the ball landing.
const throwAt = (t, target) => { t.act(idx(t.room.game.turnId), 'throw', target); if (t.room.timerFn) t.fireTimer(); };

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
  throwAt(t, at(g.cups[1], g.cups[1][0]));
  assert.strictEqual(g.cups[1].length, 9);
  assert.deepStrictEqual(t.drinks(), [0, 2, 0, 0], 'the front cup is p1\'s: p1 drinks');
  assert.ok(t.view(0).last.cup);
  throwAt(t, at(g.cups[1], g.cups[1][0]));
  assert.strictEqual(g.turnTeam, 0, 'balls back');
  assert.strictEqual(g.balls, 2);
});

test('the rack is tidied at 6 and 3; the last cup wins, and the losers finish their drinks', () => {
  const t = ready([['p0'], ['p1']], { rebuttals: false });
  const g = t.room.game;
  g.cups[1] = game.rack(10).slice(0, 7);
  throwAt(t, at(g.cups[1], g.cups[1][6]));
  assert.deepStrictEqual(g.cups[1].map(({ x, y }) => ({ x, y })), game.rack(6), 're-racked into a triangle of six');
  assert.ok(g.cups[1].every((c) => c.owner === 'p1'), 'and dealt to the team again');
  g.cups[1] = game.rack(10).slice(0, 4);
  throwAt(t, at(g.cups[1], g.cups[1][3]));
  assert.deepStrictEqual(g.cups[1].map(({ x, y }) => ({ x, y })), game.rack(10).slice(0, 3), 'no re-rack at 3');
  g.turnTeam = 0; g.turnId = 'p0'; g.balls = 2;
  g.turnTeam = 0; g.turnId = 'p0'; g.balls = 2;
  throwAt(t, at(g.cups[1], g.cups[1][2]));
  assert.deepStrictEqual(g.cups[1].map(({ x, y }) => ({ x, y })), game.rack(2), 'the gentleman\'s: two in a line');
  assert.ok(g.cups[1].every((c) => c.x === 0));
  g.cups[1] = [{ x: 0, y: 0.1 }];
  g.turnTeam = 0; g.turnId = 'p0'; g.balls = 2;
  throwAt(t, at(g.cups[1], g.cups[1][0]));
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(t.view(1).winner, 0);
});

test('rebuttal: the team that lost its last cup throws on; a miss ends it', () => {
  const t = ready([['p0', 'p2'], ['p1', 'p3']]);
  const g = t.room.game;
  g.cups[0] = game.rack(10).slice(0, 2);
  g.cups[1] = [{ x: 0, y: 0.1, owner: 'p1' }];
  throwAt(t, at(g.cups[1], g.cups[1][0]));
  assert.strictEqual(g.phase, 'throwing', 'not over yet: a rebuttal');
  assert.deepStrictEqual(t.view(0).rebuttal, { for: 0, left: 2 });
  assert.strictEqual(g.turnTeam, 1);
  throwAt(t, at(g.cups[0], g.cups[0][0]));
  assert.strictEqual(g.phase, 'throwing', 'a hit: the next ball');
  assert.strictEqual(g.turnId, 'p3', 'teammates take turns');
  throwAt(t, miss);
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(t.view(0).winner, 0);
  assert.strictEqual(t.view(0).comeback, false);
  assert.deepStrictEqual(t.room.players.map((p) => p.finished || 0), [0, 1, 0, 1], 'Blue finish their drinks');
});

test('rebuttal: sink every cup without a miss and you win', () => {
  const t = ready([['p0'], ['p1']]);
  const g = t.room.game;
  g.cups[0] = game.rack(10).slice(0, 3);
  g.cups[1] = [{ x: 0, y: 0.1, owner: 'p1' }];
  throwAt(t, at(g.cups[1], g.cups[1][0]));
  for (let n = 0; n < 3; n++) {
    assert.strictEqual(g.balls, 3 - n, 'balls left: every cup still to sink');
    throwAt(t, at(g.cups[0], g.cups[0][0]));
  }
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(t.view(0).winner, 1);
  assert.strictEqual(t.view(0).comeback, true);
  assert.strictEqual(t.room.players[0].finished, 1);
});

test('a swipe: straight and perfect is the heart of the rack; lean it to go across, harder to go deeper', () => {
  const cups = game.rack(10);
  const aim = game.straight(cups);
  assert.deepStrictEqual(aim, { x: 0, y: cups[4].y }, 'down the middle, as deep as the middle cup');
  const hits = (angle, speed) => {
    const b = game.land(aim, angle, speed, 0);
    return cups.findIndex((c) => Math.hypot(c.x - b.x, c.y - b.y) < game.CUP_R * 0.95);
  };
  assert.strictEqual(hits(0, 1), 4, 'straight up and perfect: the middle cup');
  assert.strictEqual(hits(2, 1.03), 4, 'a couple of degrees and a little hard still count');
  assert.ok(game.land(aim, -12, 1, 0).x < -0.15 && game.land(aim, 12, 1, 0).x > 0.15, 'leaning left goes left, right goes right');
  const edge = game.land(aim, 25, 1, 0).x;
  assert.ok(edge > 0.35 && edge < 0.5, `about 25° is the rack's edge (${edge})`);
  assert.ok(game.land(aim, 0, 0.3, 0).y < cups[0].y - game.CUP_R, 'too soft falls short of the front row');
  assert.ok(game.land(aim, 0, 1.4, 0).y > cups[9].y + game.CUP_R, 'too hard goes past the back row');
  for (const speed of [0.6, 0.8, 1.2]) {
    const { y } = game.land(aim, 0, speed, 0);
    assert.ok(y > cups[0].y - game.CUP_R && y < cups[9].y + game.CUP_R, `a natural swipe, a bit soft or hard, is still among the cups (${speed})`);
  }
  for (const [i, c] of cups.entries()) {
    const s = game.swipeAt(cups, c);
    assert.strictEqual(hits(s.angle, s.speed), i, `every cup has a swipe that sinks it (${i})`);
  }
  assert.strictEqual(game.straight([{ x: 0, y: 0.05 }]).y, 0.05, 'the last cup: as deep as it is');
});

test('one swipe, one ball: a second throw while it\'s in the air goes nowhere; junk is ignored', () => {
  const t = ready([['p0', 'p2'], ['p1', 'p3']]);
  const g = t.room.game;
  t.act(0, 'throw', { angle: 'left', speed: 1 });
  assert.strictEqual(g.phase, 'throwing', 'not a swipe');
  t.act(0, 'throw', miss);
  t.act(0, 'throw', at(g.cups[1], g.cups[1][0]));
  assert.strictEqual(g.throwNo, 1);
  assert.strictEqual(g.last.cup, null, 'the first one counts');
  t.fireTimer();
  assert.strictEqual(g.balls, 1);
  assert.strictEqual(g.turnId, 'p2');
  t.act(0, 'throw', miss);
  assert.strictEqual(g.throwNo, 1, 'and it\'s not p0\'s ball now');
  t.act(0, 'aim', { x: 0, y: 0.3 });
  assert.strictEqual(g.aim, undefined, 'no aiming: just the swipe');
});

test('bots: the host bot starts, then each throws only when it\'s up, at the other rack', () => {
  const t = setup(game, 4);
  assert.strictEqual(t.bot(1, 0.9), null, 'picking teams is the host\'s');
  assert.deepStrictEqual(t.bot(0, 0.9), { type: 'go' });
  t.act(0, 'go');
  const g = t.room.game;
  for (let i = 0; i < 4; i++) {
    const a = t.bot(i, 0.9);
    if (t.room.players[i].id !== g.turnId) assert.strictEqual(a, null);
    else {
      assert.ok(a.type === 'throw' && Number.isFinite(a.angle) && Number.isFinite(a.speed), 'a swipe');
      assert.ok(!('x' in a), 'and no aim: it throws the way a phone does');
    }
  }
  t.cleanup();
});

test('a Booler sinks clearly more than an NPV', () => {
  const t = ready([['p0'], ['p1']]);
  const g = t.room.game;
  const rate = (skill) => {
    let sunk = 0;
    for (let i = 0; i < 2000; i++) {
      const a = t.bot(0, skill);
      const ball = game.land(game.straight(g.cups[1]), a.angle, a.speed, game.WOBBLE.normal);
      if (g.cups[1].some((c) => Math.hypot(c.x - ball.x, c.y - ball.y) < game.CUP_R * 0.95)) sunk++;
    }
    return sunk / 2000;
  };
  const booler = rate(0.9);
  const npv = rate(0.25);
  assert.ok(booler > 0.7 && npv < 0.6 && booler > npv + 0.2, `Booler ${booler}, NPV ${npv}`);
});
