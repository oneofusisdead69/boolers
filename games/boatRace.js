// Boat Race: a relay of drinks between teams. Everyone lines up along the table; on "go" the first
// on each team drinks (and flips their cup, if you play it that way), then the next, down the
// line. The app splits the room into teams and sets each team's order, starts the race, and the
// host taps the team that finished first. A team a player short has its first drinker go again.

const TEAMS = [
  { name: 'Red', color: '#e5484d' },
  { name: 'Blue', color: '#3d7cff' },
  { name: 'Green', color: '#2fbf71' },
  { name: 'Gold', color: '#f5b518' },
];

const shuffle = (list) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// New teams: everyone here, shuffled and dealt round like cards. The score starts again.
function deal(room, ctx) {
  const g = room.game;
  const here = shuffle(ctx.connectedPlayers(room).map((p) => p.id));
  const count = Math.max(2, Math.min(g.teamCount, here.length));
  g.teams = Array.from({ length: count }, () => []);
  here.forEach((id, i) => g.teams[i % count].push(id));
  g.wins = g.teams.map(() => 0);
  g.winner = null;
  g.phase = 'teams';
}

const teamOf = (g, id) => g.teams.findIndex((t) => t.includes(id));

module.exports = {
  id: 'boatRace',
  name: 'Boat Race',
  description: 'Teams line up and drink one after another, relay style. First team done wins.',
  rules: [
    'Line up with your team, in your team’s order.',
    'On GO, the first on each team drinks. When they’re done (and their cup is flipped), the next goes.',
    'First team to finish wins. A team a player short: the first drinker goes again.',
  ],
  minPlayers: 2,
  order: 11,
  options: [
    { id: 'teams', label: 'Teams', default: 2, choices: [2, 3, 4].map((n) => ({ value: n, label: `${n}` })) },
    {
      id: 'penalty',
      label: 'Losing teams',
      default: 0,
      choices: [{ value: 0, label: 'Bragging rights' }, ...[1, 2, 3].map((n) => ({ value: n, label: `Drink ${n} more` }))],
    },
  ],

  start(room, ctx, options = {}) {
    Object.assign(room.game, {
      teamCount: [2, 3, 4].includes(options.teams) ? options.teams : 2,
      penalty: [0, 1, 2, 3].includes(options.penalty) ? options.penalty : 0,
      race: 0,
    });
    deal(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    if (player.id !== room.hostId) return;
    if (action.type === 'shuffle' && (g.phase === 'teams' || g.phase === 'results')) {
      deal(room, ctx);
    } else if (action.type === 'move' && g.phase === 'teams') {
      // Moves a player to the end of the next team along.
      const from = teamOf(g, action.targetId);
      if (from < 0) return;
      g.teams[from] = g.teams[from].filter((id) => id !== action.targetId);
      g.teams[(from + 1) % g.teams.length].push(action.targetId);
    } else if (action.type === 'go' && g.phase === 'teams' && g.teams.every((t) => t.length)) {
      g.race += 1;
      g.winner = null;
      g.startedAt = Date.now();
      g.phase = 'racing';
      ctx.log(room, `🚣 Boat race ${g.race}: GO!`);
    } else if (action.type === 'win' && g.phase === 'racing') {
      const team = Number(action.team);
      if (!g.teams[team]) return;
      g.winner = team;
      g.time = Date.now() - g.startedAt;
      g.wins[team] += 1;
      g.phase = 'results';
      ctx.log(room, `🏆 Team ${TEAMS[team].name} wins boat race ${g.race}!`);
      if (g.penalty) {
        g.teams.forEach((ids, i) => {
          if (i !== team) ids.forEach((id) => ctx.drink(room, id, g.penalty, `Team ${TEAMS[i].name} lost the boat race`));
        });
      }
    } else if (action.type === 'rematch' && g.phase === 'results') {
      g.phase = 'teams';
    }
  },

  // Someone new joins the smallest team.
  onJoin(room, player) {
    const g = room.game;
    if (teamOf(g, player.id) >= 0) return;
    const smallest = g.teams.reduce((best, t, i) => (t.length < g.teams[best].length ? i : best), 0);
    g.teams[smallest].push(player.id);
  },

  view(room) {
    const g = room.game;
    return {
      teams: g.teams.map((ids, i) => ({ ...TEAMS[i], ids })),
      wins: g.wins,
      winner: g.winner,
      race: g.race,
      startedAt: g.startedAt || null,
      time: g.time || null,
      penalty: g.penalty,
    };
  },
};
