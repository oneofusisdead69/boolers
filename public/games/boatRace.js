// Screens for Boat Race. Server logic: games/boatRace.js
(() => {
  const { esc, name } = PB;
  let ticker = null;

  const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${Math.floor(ms / 100) % 10}`;

  // Each team in its order, top to bottom. A team a player short has its first drinker again at the
  // end. The host can tap a player (before the race) to move them to the next team.
  function teams(s, { movable = false } = {}) {
    const g = s.game;
    const longest = Math.max(...g.teams.map((t) => t.ids.length));
    return `<div class="br-teams" style="--n:${g.teams.length}">${g.teams.map((t, i) => {
      const rows = t.ids.map((id, n) => {
        const who = `<span class="br-n">${n + 1}</span>${PB.avatar(id, 'sm')}<span class="br-name">${esc(name(id))}</span>`;
        return movable
          ? `<button class="br-player ${id === s.me ? 'me' : ''}" data-act="move" data-target-id="${esc(id)}">${who}<span class="br-move">→</span></button>`
          : `<div class="br-player ${id === s.me ? 'me' : ''}">${who}</div>`;
      });
      if (t.ids.length && t.ids.length < longest) rows.push(`<div class="br-player again"><span class="br-n">${t.ids.length + 1}</span>${PB.avatar(t.ids[0], 'sm')}<span class="br-name">${esc(name(t.ids[0]))}</span><span class="br-move">↺</span></div>`);
      return `<div class="br-team ${g.winner === i ? 'won' : ''}" style="--team:${t.color}">
        <h3>Team ${esc(t.name)}${g.race ? ` <small>${PB.plural(g.wins[i], 'win')}</small>` : ''}</h3>${rows.join('') || '<p class="muted">Nobody yet</p>'}</div>`;
    }).join('')}</div>`;
  }

  // (Passing one phone round, there's no 'your' team.)
  const myTeam = (s) => (PB.passAndPlay ? null : s.game.teams.find((t) => t.ids.includes(s.me)));

  function lineUp(s) {
    const g = s.game;
    const mine = myTeam(s);
    return `
      <div class="turn">🚣 Boat race${g.race ? ` ${g.race + 1}` : ''}<span>${mine ? `You’re on Team ${esc(mine.name)}` : 'Line up!'}</span></div>
      ${teams(s, { movable: s.isHost })}
      ${s.isHost
        ? `<p class="br-hint">Tap someone to move them to the next team.</p>
          <div class="row"><button class="secondary" data-act="shuffle">🔀 New teams</button><button data-act="go">🏁 Start the race</button></div>`
        : `<p class="br-hint">Line up with your team. ${esc(name(s.hostId))} starts the race.</p>`}`;
  }

  function racing(s) {
    const g = s.game;
    return `
      <div class="br-go"><b>GO!</b><span class="br-clock" data-since="${g.startedAt}">0:00.0</span><small>Drink, flip, next!</small></div>
      ${s.isHost
        ? `<div class="br-pick">${g.teams.map((t, i) => `<button data-act="win" data-team="${i}" style="--team:${t.color}">🏆 Team ${esc(t.name)} won</button>`).join('')}</div>`
        : `<p class="br-hint">${esc(name(s.hostId))} calls the winner.</p>`}
      ${teams(s)}`;
  }

  function results(s) {
    const g = s.game;
    const t = g.teams[g.winner];
    const mine = myTeam(s);
    return `
      <div class="drink ${mine === t ? 'win' : ''}" style="--team:${t.color}"><div class="big">🏆 Team ${esc(t.name)} wins!</div>
        <div class="sips">${clock(g.time)}${g.penalty ? ` · Everyone else drinks ${PB.plural(g.penalty, 'more sip')}` : ''}</div></div>
      <div class="br-score">${g.teams.map((x, i) => `<span style="--team:${x.color}">${esc(x.name)} <b>${g.wins[i]}</b></span>`).join('')}</div>
      ${s.isHost
        ? '<div class="row"><button class="secondary" data-act="shuffle">🔀 New teams</button><button data-act="rematch">🔁 Rematch</button></div>'
        : `<p class="br-hint">${esc(name(s.hostId))} sets up the next race…</p>`}
      ${teams(s)}`;
  }

  PB.register('boatRace', {
    reset() {
      clearInterval(ticker);
      ticker = null;
    },
    stage: '.br-teams',
    tvStage: '.br-go, .br-teams, .drink, .br-score, .turn',
    sounds(prev, s) {
      if (s.phase === 'racing' && prev.phase !== 'racing') return ['bell'];
      if (s.phase === 'results' && prev.phase !== 'results') return ['win'];
      return [];
    },
    render(s) {
      if (s.phase === 'teams') return lineUp(s);
      if (s.phase === 'racing') return racing(s);
      if (s.phase === 'results') return results(s);
      return '';
    },
    // The race clock ticks on every screen.
    afterRender() {
      clearInterval(ticker);
      ticker = null;
      const tick = () => document.querySelectorAll('.br-clock').forEach((c) => { c.textContent = clock(Math.max(0, Date.now() - Number(c.dataset.since))); });
      if (document.querySelector('.br-clock')) {
        tick();
        ticker = setInterval(tick, 100);
      }
    },
  });
})();
