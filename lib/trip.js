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
// `here(id)` says whether a player is still connected (players who've left never hold one up).
const DONE = {
  bigTom: (g, here) => g.phase === 'final' && (!g.give || !here(g.give.from)),
  horseRace: (g) => g.phase === 'results' && g.race >= 3,
  aceRace: (g) => g.phase === 'results' && g.race >= 3,
  boatRace: (g) => g.phase === 'results' && g.race >= 2,
  shotPoker: (g, here) => g.phase === 'showdown' && g.hand >= 5 && Object.entries(g.debts).every(([id, d]) => d.paid || !here(id)),
  slevens: (g) => g.phase === 'ready' && g.rollNo >= 25,
  // With "just drink" nobody ever runs out of dice: ten rounds is a game.
  liarsDice: (g) => g.phase === 'over' || (!g.loseDice && g.phase === 'reveal' && g.round >= 10),
};
const isDone = (g, here = () => true) => (DONE[g.type] || ((x) => x.phase === 'over'))(g, here);

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
      try {
        fn();
      } catch (err) {
        // Something went wrong starting a game: end the trip rather than leave the room stuck.
        console.error(`[${room.code}] Around the World failed`, err);
        trips.end(room);
      }
      broadcast(room);
    }, ms);
  };
  const here = (room) => (id) => ctx.turns.isActive(room, id);

  // The games everyone here can play, not-yet-played ones first.
  function choices(room) {
    const t = room.trip;
    const people = ctx.connectedPlayers(room).length;
    const ok = Object.values(games).filter((g) => (g.minPlayers || 1) <= people).map((g) => g.id);
    const fresh = shuffle(ok.filter((id) => !t.played.includes(id)));
    const again = shuffle(ok.filter((id) => t.played.includes(id) && id !== t.played[t.played.length - 1]));
    const list = [...fresh, ...again];
    // Only one game fits the people here: playing it again beats ending the trip.
    if (!list.length && ok.length) list.push(...ok);
    return list.slice(0, CHOICES);
  }

  function nextStop(room) {
    const t = room.trip;
    if (t.stop >= t.stops) {
      clearTimeout(room.tripTimer);
      room.trip = null;
      ctx.log(room, '🏆 The tournament is done!');
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
    ctx.log(room, `🏆 Game ${t.stop + 1} of ${t.stops}: ${games[gameId].name}`);
    later(room, REVEAL_MS, () => begin(room));
  }

  function begin(room) {
    const t = room.trip;
    const gameId = t.nextGame;
    // Not enough people here any more (phones asleep?): vote again on what they can play.
    if (ctx.connectedPlayers(room).length < (games[gameId].minPlayers || 1)) {
      if (!ctx.connectedPlayers(room).length) return trips.end(room);
      return nextStop(room);
    }
    t.stop += 1;
    t.played.push(gameId);
    Object.assign(t, { phase: 'playing', options: [], votes: {}, deadline: null, doneAt: null });
    startGame(room, gameId);
  }

  function moveOn(room) {
    if (room.game) stopGame(room);
    nextStop(room);
  }

  const trips = {
    start(room, { stops, mode }) {
      room.trip = { stops, stop: 0, mode, played: [], phase: 'voting', options: [], votes: {} };
      room.recap = false;
      ctx.log(room, `🏆 Tournament: ${stops} games`);
      nextStop(room);
    },

    // After a server restart: the trip carries on from where it was, starting with a new vote.
    resume(room, saved) {
      room.trip = { stops: saved.stops, stop: saved.stop, mode: saved.mode, played: saved.played || [], phase: 'voting', options: [], votes: {} };
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
      // Everyone who's still here has voted (someone who hadn't may have left).
      if (t?.phase === 'voting') {
        const people = ctx.connectedPlayers(room);
        if (people.length && people.every((p) => t.votes[p.id])) tally(room);
        return;
      }
      if (t?.phase !== 'playing' || !room.game || t.doneAt) return;
      if (!isDone(room.game, here(room))) return;
      t.doneAt = Date.now() + DONE_MS;
      later(room, DONE_MS, () => moveOn(room));
    },

    // The host moves on now: skips the rest of this game, or closes the vote.
    skip(room) {
      const t = room.trip;
      if (!t) return;
      if (t.phase === 'voting') tally(room);
      else if (t.phase === 'next') {
        clearTimeout(room.tripTimer);
        begin(room);
      }
      else if (t.phase === 'playing') {
        clearTimeout(room.tripTimer);
        moveOn(room);
      }
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
