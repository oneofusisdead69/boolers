// Around the World: the room plays a set number of games ("stops") back to back without the host
// having to start each one. Before each stop everyone votes between three games (ones not played
// yet first), or with "surprise me" one is picked at random. When a game is done it moves on by
// itself; after the last stop the end-of-night recap comes up.
//
//   room.trip = { stops, stop, mode: 'vote' | 'random', played: [ids], phase, options, votes,
//                 nextGame, deadline }
//   phase: 'voting' (choosing the next game), 'next' (showing what won), 'playing'

const VOTE_MS = 25 * 1000;
const REVEAL_MS = 4 * 1000;
const DONE_MS = 7 * 1000; // a moment to see how the game ended before moving on
const CHOICES = 3;

// When a game counts as done. Most end on their own ('over'); the rest play a few rounds.
const DONE = {
  bigTom: (g) => g.phase === 'final' && !g.give,
  horseRace: (g) => g.phase === 'results' && g.race >= 3,
  aceRace: (g) => g.phase === 'results' && g.race >= 3,
  shotPoker: (g) => g.phase === 'showdown' && g.hand >= 5 && Object.values(g.debts).every((d) => d.paid),
  slevens: (g) => g.phase === 'ready' && g.rollNo >= 25,
};
const isDone = (g) => (DONE[g.type] || ((x) => x.phase === 'over'))(g);

const shuffle = (list) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// games: the game modules by id. startGame(room, id) starts one; stopGame(room) ends the current
// one; broadcast(room) sends everyone the new state; finish(room) runs when the trip is over.
function createTrips({ games, ctx, startGame, stopGame, broadcast, finish }) {
  const later = (room, ms, fn) => {
    clearTimeout(room.tripTimer);
    room.tripTimer = setTimeout(() => {
      room.tripTimer = null;
      if (!room.trip) return;
      fn();
      broadcast(room);
    }, ms);
  };

  // The games everyone here can play, not-yet-played ones first.
  function choices(room) {
    const t = room.trip;
    const people = ctx.connectedPlayers(room).length;
    const ok = Object.values(games).filter((g) => (g.minPlayers || 1) <= people).map((g) => g.id);
    const fresh = shuffle(ok.filter((id) => !t.played.includes(id)));
    const again = shuffle(ok.filter((id) => t.played.includes(id) && id !== t.played[t.played.length - 1]));
    return [...fresh, ...again].slice(0, CHOICES);
  }

  function nextStop(room) {
    const t = room.trip;
    if (t.stop >= t.stops) {
      clearTimeout(room.tripTimer);
      room.trip = null;
      ctx.log(room, '🌍 Around the World is done!');
      finish(room);
      return;
    }
    const options = choices(room);
    if (!options.length) return trips.end(room);
    if (t.mode === 'random' || options.length === 1) return reveal(room, options[0]);
    Object.assign(t, { phase: 'voting', options, votes: {}, nextGame: null, deadline: Date.now() + VOTE_MS });
    later(room, VOTE_MS, () => tally(room));
  }

  function tally(room) {
    const t = room.trip;
    if (t?.phase !== 'voting') return;
    const counts = Object.fromEntries(t.options.map((id) => [id, 0]));
    for (const id of Object.values(t.votes)) if (id in counts) counts[id] += 1;
    const top = Math.max(...Object.values(counts));
    reveal(room, shuffle(t.options.filter((id) => counts[id] === top))[0]);
  }

  function reveal(room, gameId) {
    const t = room.trip;
    Object.assign(t, { phase: 'next', nextGame: gameId, deadline: Date.now() + REVEAL_MS });
    ctx.log(room, `🌍 Stop ${t.stop + 1} of ${t.stops}: ${games[gameId].name}`);
    later(room, REVEAL_MS, () => {
      t.stop += 1;
      t.played.push(gameId);
      Object.assign(t, { phase: 'playing', options: [], votes: {}, deadline: null, doneAt: null });
      startGame(room, gameId);
    });
  }

  function moveOn(room) {
    if (room.game) stopGame(room);
    nextStop(room);
  }

  const trips = {
    start(room, { stops, mode }) {
      room.trip = { stops, stop: 0, mode, played: [], phase: 'voting', options: [], votes: {} };
      room.recap = false;
      ctx.log(room, `🌍 Around the World: ${stops} stops`);
      nextStop(room);
    },

    vote(room, playerId, gameId) {
      const t = room.trip;
      if (t?.phase !== 'voting' || !t.options.includes(gameId)) return;
      t.votes[playerId] = gameId;
      // Everyone's voted: no need to wait for the clock.
      if (ctx.connectedPlayers(room).every((p) => t.votes[p.id])) tally(room);
    },

    // Called whenever the room changes: a finished game moves on to the next stop by itself.
    check(room) {
      const t = room.trip;
      if (t?.phase !== 'playing' || !room.game || t.doneAt) return;
      if (!isDone(room.game)) return;
      t.doneAt = Date.now() + DONE_MS;
      later(room, DONE_MS, () => moveOn(room));
    },

    // The host moves on now: skips the rest of this game, or closes the vote.
    skip(room) {
      const t = room.trip;
      if (!t) return;
      clearTimeout(room.tripTimer);
      if (t.phase === 'voting') tally(room);
      else if (t.phase === 'playing') moveOn(room);
    },

    end(room) {
      clearTimeout(room.tripTimer);
      room.tripTimer = null;
      room.trip = null;
    },

    view(room, playerId) {
      const t = room.trip;
      if (!t) return null;
      const votes = {};
      for (const [pid, id] of Object.entries(t.votes || {})) (votes[id] ||= []).push(pid);
      return {
        stops: t.stops, stop: t.stop, mode: t.mode, phase: t.phase, played: t.played,
        options: t.options || [], votes, myVote: t.votes?.[playerId] || null,
        nextGame: t.nextGame || null, deadline: t.deadline || t.doneAt || null,
        moving: !!t.doneAt,
      };
    },
  };
  return trips;
}

module.exports = { createTrips, isDone, DONE };
