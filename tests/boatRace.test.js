const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers');
const game = require('../games/boatRace');

const sizes = (t) => t.room.game.teams.map((x) => x.length).sort();

test('everyone is dealt onto a team, as evenly as it goes', () => {
  const t = setup(game, 5, { teams: 2 });
  assert.strictEqual(t.room.game.phase, 'teams');
  assert.deepStrictEqual(sizes(t), [2, 3]);
  assert.deepStrictEqual(t.room.game.teams.flat().sort(), ['p0', 'p1', 'p2', 'p3', 'p4']);
  const four = setup(game, 3, { teams: 4 });
  assert.strictEqual(four.room.game.teams.length, 3, 'never more teams than players');
});

test('the host moves players, starts the race and calls the winner; losers drink the penalty', () => {
  const t = setup(game, 4, { teams: 2, penalty: 2 });
  const g = t.room.game;
  g.teams = [['p0', 'p1'], ['p2', 'p3']];
  t.act(1, 'move', { targetId: 'p0' }); // not the host
  assert.deepStrictEqual(g.teams, [['p0', 'p1'], ['p2', 'p3']]);
  t.act(0, 'move', { targetId: 'p1' });
  assert.deepStrictEqual(g.teams, [['p0'], ['p2', 'p3', 'p1']]);
  assert.deepStrictEqual(t.view(0).short, [0]);
  t.act(0, 'go');
  assert.strictEqual(g.phase, 'teams', 'not until the short team says who goes twice');
  t.act(2, 'twice', { team: '0', targetId: 'p0' }); // not on that team
  t.act(0, 'twice', { team: '0', targetId: 'p2' }); // not one of them
  assert.deepStrictEqual(g.twice, {});
  t.act(0, 'twice', { team: '0', targetId: 'p0' });
  t.act(0, 'go');
  assert.strictEqual(g.phase, 'racing');
  t.act(2, 'win', { team: '1' }); // only the host calls it
  assert.strictEqual(g.phase, 'racing');
  t.act(0, 'win', { team: '1' });
  assert.strictEqual(g.phase, 'results');
  assert.strictEqual(t.view(2).winner, 1);
  assert.deepStrictEqual(t.view(2).wins, [0, 1]);
  assert.deepStrictEqual(t.drinks(), [2, 0, 0, 0]);
  t.act(0, 'rematch');
  assert.strictEqual(g.phase, 'teams');
  assert.deepStrictEqual(g.teams, [['p0'], ['p2', 'p3', 'p1']], 'a rematch keeps the teams');
  t.act(0, 'go').act(0, 'win', { team: '0' });
  assert.deepStrictEqual(t.view(0).wins, [1, 1]);
  t.act(0, 'shuffle');
  assert.deepStrictEqual(t.view(0).wins, [0, 0], 'new teams, new score');
});

test('no race with an empty team; a latecomer joins the smallest team', () => {
  const t = setup(game, 3, { teams: 2 });
  const g = t.room.game;
  g.teams = [['p0', 'p1', 'p2'], []];
  t.act(0, 'go');
  assert.strictEqual(g.phase, 'teams');
  t.room.players.push({ id: 'p3', name: 'Late', drinks: 0, connected: true });
  game.onJoin(t.room, t.room.players[3]);
  assert.deepStrictEqual(g.teams[1], ['p3']);
  t.act(0, 'twice', { team: '1', targetId: 'p3' });
  t.act(0, 'go');
  assert.strictEqual(g.phase, 'racing');
});

test('who goes twice: anyone on the short team picks, and moving players clears it', () => {
  const t = setup(game, 5, { teams: 2 });
  const g = t.room.game;
  g.teams = [['p0', 'p1', 'p2'], ['p3', 'p4']];
  t.act(4, 'twice', { team: '1', targetId: 'p3' });
  assert.deepStrictEqual(g.twice, { 1: 'p3' });
  t.act(0, 'move', { targetId: 'p3' }); // p3 moves away: Blue has to pick again
  assert.deepStrictEqual(g.twice, {});
  assert.deepStrictEqual(t.view(0).short, [1]);
});
