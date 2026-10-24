// The night in a room, for the recap at the end: which games were played and who won, the best
// moments (games report them with ctx.highlight), and awards worked out from everyone's tab.
//
//   room.night = { startedAt, games: [{ type, name, winnerId, at }], highlights: { key: {...} }, given: { id: sips } }

function night(room) {
  room.night ||= { startedAt: Date.now(), games: [], highlights: {}, given: {} };
  room.night.given ||= {};
  room.night.highlights ||= {};
  return room.night;
}

// A game finished (or was ended): remember it, and its winner if it has one.
function gamePlayed(room, type, name) {
  const g = room.game || {};
  const winnerId = g.winnerId && room.players.some((p) => p.id === g.winnerId) ? g.winnerId : null;
  night(room).games.push({ type, name, winnerId, finished: g.phase === 'over', at: Date.now() });
}

// Keeps the best of each kind of moment: the biggest `value` for `key` wins.
function highlight(room, key, playerId, value, text) {
  const h = night(room).highlights;
  if (!h[key] || value > h[key].value) h[key] = { playerId, value, text };
}

function given(room, fromId, sips) {
  const n = night(room);
  n.given[fromId] = (n.given[fromId] || 0) + sips;
}

// Everything the recap screen shows.
function summary(room, roomName = '') {
  const n = night(room);
  const players = room.players.map((p) => ({
    id: p.id, name: p.name, sips: p.total || 0, finished: p.finished || 0, given: n.given[p.id] || 0,
  }));
  const best = (field, min = 1) => {
    const top = players.slice().sort((a, b) => b[field] - a[field])[0];
    return top && top[field] >= min ? top : null;
  };
  const awards = [];
  const thirsty = best('sips');
  if (thirsty) awards.push({ emoji: '🍺', title: 'Thirstiest', playerId: thirsty.id, text: `${thirsty.sips} sips` });
  const generous = best('given');
  if (generous) awards.push({ emoji: '🎁', title: 'Most generous', playerId: generous.id, text: `handed out ${generous.given} sips` });
  const finisher = best('finished');
  if (finisher) awards.push({ emoji: '🥃', title: 'Bottoms up', playerId: finisher.id, text: `finished ${finisher.finished} drink${finisher.finished === 1 ? '' : 's'}` });
  const wins = {};
  for (const g of n.games) if (g.winnerId) wins[g.winnerId] = (wins[g.winnerId] || 0) + 1;
  const champ = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
  if (champ && champ[1] > 1) awards.push({ emoji: '🏆', title: 'Champion', playerId: champ[0], text: `won ${champ[1]} games` });
  return {
    roomName,
    startedAt: n.startedAt,
    totalSips: players.reduce((a, p) => a + p.sips, 0),
    players: players.sort((a, b) => b.sips - a.sips),
    games: n.games.map(({ type, name, winnerId }) => ({ type, name, winnerId })),
    highlights: Object.values(n.highlights).sort((a, b) => b.value - a.value).slice(0, 6),
    awards,
  };
}

// A reminder to drink some water is due when the room switches to a different game, or has
// played three games since the last reminder. Call it as each game starts.
function waterDue(room, type) {
  const n = night(room);
  const due = (n.lastType && n.lastType !== type) || (n.sinceWater || 0) >= 3;
  if (due) n.sinceWater = 0;
  n.sinceWater = (n.sinceWater || 0) + 1;
  n.lastType = type;
  return due;
}

module.exports = { night, gamePlayed, highlight, given, summary, waterDue };
