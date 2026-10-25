// Teams, for the games played in them (Beer Pong, Boat Race). The game keeps g.teams: one list of
// player ids per team, in the order of TEAMS (which gives each its name and colour).

const { shuffle } = require('./random');

const TEAMS = [
  { name: 'Red', color: '#e5484d' },
  { name: 'Blue', color: '#3d7cff' },
  { name: 'Green', color: '#2fbf71' },
  { name: 'Gold', color: '#f5b518' },
];

// New teams: the players shuffled and dealt round `count` teams like cards.
function deal(ids, count) {
  const teams = Array.from({ length: count }, () => []);
  shuffle(ids).forEach((id, i) => teams[i % count].push(id));
  return teams;
}

const teamOf = (g, id) => g.teams.findIndex((t) => t.includes(id));

// The host moves a player to the end of the next team along. False if they're on no team.
function move(g, id) {
  const from = teamOf(g, id);
  if (from < 0) return false;
  g.teams[from] = g.teams[from].filter((x) => x !== id);
  g.teams[(from + 1) % g.teams.length].push(id);
  return true;
}

// Someone new joins the smallest team (the first of them, on a tie). False if they're on one.
function join(g, id) {
  if (teamOf(g, id) >= 0) return false;
  const smallest = g.teams.reduce((best, t, i) => (t.length < g.teams[best].length ? i : best), 0);
  g.teams[smallest].push(id);
  return true;
}

// What phones see: each team's name and colour, and who's on it.
const view = (g) => g.teams.map((ids, i) => ({ ...TEAMS[i], ids }));

module.exports = { TEAMS, deal, teamOf, move, join, view };
