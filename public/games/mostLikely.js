// Screens for Most Likely To. Server logic: games/mostLikely.js
(() => {
  const { esc, name } = PB;

  function question(s) {
    const g = s.game;
    const online = s.players.filter((p) => p.connected);
    const voted = online.filter((p) => g.votedIds.includes(p.id)).length;
    return `
      <div class="topbar"><span>Round ${g.round}</span>${PB.timer()}</div>
      <div class="prompt"><small>Who's most likely to…</small>${esc(g.question)}?</div>
      ${PB.playerPicker('vote', { selected: g.myVote })}
      <p class="center muted">${voted} / ${online.length} voted${g.myVote ? ' · tap to change your vote' : ''}</p>
    `;
  }

  function reveal(s) {
    const g = s.game;
    const { counts, drinkers, sips, noVotes } = g.result;
    const iDrink = drinkers.includes(s.me);
    const sipText = PB.plural(sips, 'sip');

    let banner;
    if (noVotes) {
      banner = `<div class="drink me"><div class="big">Nobody voted 🤷</div><div class="sips">Everybody drinks ${sipText}!</div></div>`;
    } else if (iDrink) {
      const others = drinkers.filter((id) => id !== s.me).map(name);
      banner = `<div class="drink me"><div class="big">🍺 YOU DRINK!</div><div class="sips">${sipText}${others.length ? ` · with ${esc(others.join(', '))}` : ''}</div></div>`;
    } else {
      banner = `<div class="drink"><div class="big">${esc(drinkers.map(name).join(' & '))}</div><div class="sips">drink${drinkers.length === 1 ? 's' : ''} ${sipText} 🍺</div></div>`;
    }

    const rows = s.players
      .map((p) => ({ p, voters: counts[p.id] || [] }))
      .filter((r) => r.voters.length > 0)
      .sort((a, b) => b.voters.length - a.voters.length);

    return `
      <div class="topbar"><span>Round ${g.round}</span></div>
      <div class="prompt"><small>Most likely to…</small>${esc(g.question)}</div>
      ${banner}
      ${rows.length ? `<div class="card"><h2>Votes</h2><ul class="players">${rows.map((r) => `
        <li><span class="name">${esc(r.p.name)}<span class="voters">${esc(r.voters.map(name).join(', '))}</span></span>
        <span class="count">${r.voters.length}</span></li>`).join('')}</ul></div>` : ''}
      ${PB.scoreboard()}
      ${s.isHost
        ? '<button data-act="next">Next question</button>'
        : `<p class="center muted">Waiting for ${esc(name(s.hostId))} to continue…</p>`}
    `;
  }

  PB.register('mostLikely', {
    render: (s) => (s.phase === 'question' ? question(s) : reveal(s)),
  });
})();
