// Around the World screens (rules in lib/trip.js), shared by the phones and the TV.
//
//   Trip.html(s, { tv })   the vote for the next stop, or what won it
//   Trip.chip(s)           "🌍 Stop 2 of 5" (and "next stop in 5s") for under a game
//   Trip.setup(s)          the host's lobby card to start a trip
(() => {
  const { esc } = PB;
  const game = (s, id) => s.games.find((g) => g.id === id);
  const left = (t) => (t.deadline ? Math.max(0, Math.ceil((t.deadline - PB.now()) / 1000)) : 0);
  // While a game is on, t.stop already counts it; between games the next one is t.stop + 1.
  const current = (t) => (t.phase === 'playing' ? t.stop : t.stop + 1);
  const stopText = (t) => `Stop ${Math.min(current(t), t.stops)} of ${t.stops}`;

  function html(s, { tv = false } = {}) {
    const t = s.trip;
    const head = `<div class="trip-head"><div class="trip-globe">🌍</div><div><small>Around the World</small><b>${stopText(t)}</b></div>
      <span class="trip-clock" data-trip-clock>${left(t)}s</span></div>`;
    const route = `<div class="trip-route">${Array.from({ length: t.stops }, (_, i) => {
      const id = t.played[i] || (i === t.stop && t.nextGame) || null;
      return `<span class="${i < t.stop ? 'done' : i === t.stop ? 'here' : ''}">${id ? esc(game(s, id)?.name || '') : '?'}</span>`;
    }).join('')}</div>`;
    if (t.phase === 'next') {
      const g = game(s, t.nextGame);
      return `<div class="trip ${tv ? 'tv' : ''}">${head}${route}
        <div class="card trip-next"><small>Next stop</small><div class="trip-next-name">${esc(g.name)}</div><p class="muted">${esc(g.description)}</p></div></div>`;
    }
    const total = Object.values(t.votes).reduce((n, ids) => n + ids.length, 0);
    return `<div class="trip ${tv ? 'tv' : ''}">${head}${route}
      <h2 class="center">${tv ? 'Vote on your phones: where next?' : 'Where next? Tap to vote'}</h2>
      <div class="trip-options">${t.options.map((id) => {
        const g = game(s, id);
        const voters = t.votes[id] || [];
        return `<button class="trip-option ${t.myVote === id ? 'mine' : ''}" ${tv ? 'disabled' : `data-trip-vote="${esc(id)}"`}>
          <b>${esc(g.name)}</b><small>${esc(g.description)}</small>
          <span class="trip-voters">${voters.map((pid) => PB.avatar(pid, 'sm')).join('')}</span></button>`;
      }).join('')}</div>
      <p class="center muted">${total} of ${s.players.filter((p) => p.connected).length} voted</p>
      ${!tv && s.isHost ? `<div class="trip-host">
        <button class="secondary" data-cmd="nextStop">Close the vote now</button>
        <button class="link" data-cmd="endTrip" data-confirm="End Around the World?">End the trip</button></div>` : ''}
    </div>`;
  }

  function chip(s) {
    const t = s.trip;
    if (!t) return '';
    return `<div class="trip-chip">🌍 ${stopText(t)}${t.moving ? ` · next stop in <span data-trip-clock>${left(t)}s</span>` : ''}
      ${s.isHost && !PB.isTV && t.moving ? '<button class="link" data-cmd="nextStop">Go now ➜</button>' : ''}</div>`;
  }

  // The host's lobby: a switch at the top of the game card between one game and Around the
  // World; in Around the World the card holds the trip's settings, and the lobby's main button
  // starts the trip (app.js). Choices stay on the phone until they start it.
  const draft = { on: false, stops: 5, mode: 'vote' };
  const seg = (key, choices) => `<div class="segmented">${choices.map(([v, label]) =>
    `<button class="${draft[key] === v ? 'selected' : ''}" data-trip-${key}="${v}">${label}</button>`).join('')}</div>`;
  const toggle = () => `<div class="play-mode">${seg('on', [[false, '🎮 One game'], [true, '🌍 Around the World']])}</div>`;
  function setup(s) {
    if (!s.isHost) return '';
    return `<p class="muted">Play a run of games back to back. Each one moves on by itself, and the night's recap comes up at the end.</p>
      <div class="option"><span class="muted">Stops</span>${seg('stops', [[3, '3 games'], [5, '5 games'], [8, '8 games']])}</div>
      <div class="option"><span class="muted">Next game</span>${seg('mode', [['vote', 'Everyone votes'], ['random', 'Surprise me']])}</div>`;
  }

  // Wires up the buttons the screens above draw. `send(event, data)` talks to the server.
  function bind(root, send, redraw) {
    root.querySelectorAll('[data-trip-vote]').forEach((b) => (b.onclick = () => send('tripVote', { gameId: b.dataset.tripVote })));
    root.querySelectorAll('[data-trip-stops]').forEach((b) => (b.onclick = () => { draft.stops = Number(b.dataset.tripStops); redraw(); }));
    root.querySelectorAll('[data-trip-mode]').forEach((b) => (b.onclick = () => { draft.mode = b.dataset.tripMode; redraw(); }));
    root.querySelectorAll('[data-trip-on]').forEach((b) => (b.onclick = () => { draft.on = b.dataset.tripOn === 'true'; redraw(); }));
    const start = root.querySelector('#trip-start');
    if (start) start.onclick = () => send('startTrip', { ...draft });
  }

  // Counts down every clock on the screen.
  setInterval(() => {
    const t = PB.state?.trip;
    if (!t) return;
    document.querySelectorAll('[data-trip-clock]').forEach((el) => (el.textContent = `${left(t)}s`));
  }, 250);

  window.Trip = { html, chip, setup, toggle, bind, isOn: () => draft.on };
})();
