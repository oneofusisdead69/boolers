// Boat Race: a relay of drinks between teams. Everyone lines up along the table; on "go" the first
// on each team drinks (and flips their cup, if you play it that way), then the next, down the
// line. The app splits the room into teams and sets each team's order, starts the race, and the
// host taps the team that finished first. A team a player short picks who goes twice (at the end).
//
//   g.twice: { [team index]: playerId } for the short teams that have picked.
//   g.cheers: { [botId]: how many times it's cheered this race }. Bots don't race (they've
//   nothing to drink): they cheer from the side.

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

// New teams: everyone here, shuffled and dealt round like cards. The score starts again. Bots sit
// it out: a boat race is drunk in the room, and they've nothing to drink.
function deal(room, ctx) {
  const g = room.game;
  const here = shuffle(ctx.connectedPlayers(room).filter((p) => !p.bot).map((p) => p.id));
  const count = Math.max(2, Math.min(g.teamCount, here.length));
  g.teams = Array.from({ length: count }, () => []);
  here.forEach((id, i) => g.teams[i % count].push(id));
  g.wins = g.teams.map(() => 0);
  g.twice = {};
  g.winner = null;
  g.phase = 'teams';
}

// What a bot shouts from the side while the race is on.
const CHEERS = [
  'Chug! Chug! Chug!', 'Come on, Team {team}!', 'Flip it! FLIP IT!', 'Team {team} are flying!',
  'Don’t you dare spill, {name}!', 'GO GO GO!', 'That’s a sipper, not a chugger, {name}!',
  'Down the hatch, {name}!', 'Team {team}, this is your moment!', 'I believe in you, {name}!',
];
const MAX_CHEERS = 2;

const teamOf = (g, id) => g.teams.findIndex((t) => t.includes(id));
// The teams a player short, which need someone to go twice.
const shortTeams = (g) => {
  const longest = Math.max(...g.teams.map((t) => t.length));
  return g.teams.map((t, i) => i).filter((i) => g.teams[i].length && g.teams[i].length < longest);
};
// Forgets picks that no longer apply (the team's not short now, or the player's moved).
function tidyTwice(g) {
  g.twice ||= {}; // (a race saved before there was a choice)
  const short = shortTeams(g);
  for (const i of Object.keys(g.twice)) {
    if (!short.includes(Number(i)) || !g.teams[i].includes(g.twice[i])) delete g.twice[i];
  }
}

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
  botsSitOut: true, // bots don't race (see bot() below)
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
    tidyTwice(g);
    // A bot cheers on someone racing (a couple of times a race).
    if (action.type === 'cheer' && player.bot && g.phase === 'racing') {
      g.cheers ||= {};
      if ((g.cheers[player.id] || 0) >= MAX_CHEERS) return;
      g.cheers[player.id] = (g.cheers[player.id] || 0) + 1;
      const team = Math.floor(Math.random() * g.teams.length);
      const ids = g.teams[team];
      const line = CHEERS[Math.floor(Math.random() * CHEERS.length)]
        .replace('{team}', TEAMS[team].name)
        .replace('{name}', ids.length ? ctx.name(room, ids[Math.floor(Math.random() * ids.length)]) : 'mate');
      ctx.log(room, `📣 ${player.name}: ${line}`);
      return;
    }
    // Who goes twice: the host, or anyone on that team, picks one of the team.
    if (action.type === 'twice' && g.phase === 'teams') {
      const team = Number(action.team);
      if (!shortTeams(g).includes(team) || !g.teams[team].includes(action.targetId)) return;
      if (player.id !== room.hostId && teamOf(g, player.id) !== team) return;
      g.twice[team] = action.targetId;
      return;
    }
    if (player.id !== room.hostId) return;
    if (action.type === 'shuffle' && (g.phase === 'teams' || g.phase === 'results')) {
      deal(room, ctx);
    } else if (action.type === 'move' && g.phase === 'teams') {
      // Moves a player to the end of the next team along.
      const from = teamOf(g, action.targetId);
      if (from < 0) return;
      g.teams[from] = g.teams[from].filter((id) => id !== action.targetId);
      g.teams[(from + 1) % g.teams.length].push(action.targetId);
      tidyTwice(g);
    } else if (action.type === 'go' && g.phase === 'teams' && g.teams.every((t) => t.length) && shortTeams(g).every((i) => g.twice[i])) {
      g.race += 1;
      g.winner = null;
      g.startedAt = Date.now();
      g.cheers = {};
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

  // Bots sit the race out and cheer from the side, at their own pace.
  bot(room, me) {
    const g = room.game;
    if (g.phase !== 'racing' || (g.cheers?.[me.id] || 0) >= MAX_CHEERS) return null;
    return { type: 'cheer', delay: 1500 + Math.random() * 5000 };
  },

  // Someone new joins the smallest team.
  onJoin(room, player) {
    const g = room.game;
    if (player.bot || teamOf(g, player.id) >= 0) return;
    const smallest = g.teams.reduce((best, t, i) => (t.length < g.teams[best].length ? i : best), 0);
    g.teams[smallest].push(player.id);
    tidyTwice(g);
  },

  view(room) {
    const g = room.game;
    return {
      teams: g.teams.map((ids, i) => ({ ...TEAMS[i], ids })),
      wins: g.wins,
      twice: g.twice || {},
      short: shortTeams(g),
      winner: g.winner,
      race: g.race,
      startedAt: g.startedAt || null,
      time: g.time || null,
      penalty: g.penalty,
    };
  },
};
