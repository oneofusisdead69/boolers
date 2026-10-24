// Screens for Horse Race. Server logic: games/horseRace.js
(() => {
  const { esc, name } = PB;
  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const red = (s) => s === 'H' || s === 'D';
  // The bet being built, and the winnings being handed out, stay on this phone until sent.
  let draft = null;
  let draftFor = null;
  let alloc = {};
  let allocFor = null;

  const horse = (suit, extra = '') => `<span class="hr-horse ${red(suit) ? 'red' : ''} ${extra}">${PB.pip(suit)}</span>`;
  const backers = (s, suit) => Object.entries(s.game.bets).filter(([, b]) => b.suit === suit).map(([id]) => id);

  // The track, finish line at the top. Each row has its track card on the left and the four lanes.
  function track(s) {
    const g = s.game;
    const rows = [];
    for (let r = g.length + 1; r >= 0; r--) {
      let side;
      if (r === g.length + 1) side = '<span class="hr-flag">🏁</span>';
      else if (r === 0) side = '<span class="hr-start">Start</span>';
      else side = `<span class="hr-side ${g.last?.back?.row === r ? 'flash' : ''}">${PB.card(g.track[r - 1], { size: 'sm' })}</span>`;
      const lanes = SUITS.map((suit) => {
        const here = g.positions[suit] === r;
        const moved = here && g.last?.moved === suit && !g.last?.back;
        const knocked = here && g.last?.back?.suit === suit;
        const won = here && g.winner === suit;
        return `<span class="hr-lane">${here ? horse(suit, [moved && 'moved', knocked && 'knocked', won && 'won'].filter(Boolean).join(' ')) : ''}</span>`;
      }).join('');
      rows.push(`<div class="hr-row ${r === g.length + 1 ? 'finish' : r === 0 ? 'start' : ''}">${side}${lanes}</div>`);
    }
    const bettors = `<div class="hr-row hr-bettors"><span></span>${SUITS.map((suit) =>
      `<span class="hr-lane">${backers(s, suit).map((id) => PB.avatar(id, 'sm')).join('')}</span>`).join('')}</div>`;
    return `<div class="hr-track">${rows.join('')}${bettors}</div>`;
  }

  function lastFlip(g) {
    if (!g.last) return '<p class="center muted">The first card flips in a moment…</p>';
    const back = g.last.back;
    return `<div class="hr-last">
      ${PB.card(g.last.card, { size: 'sm' })}
      <p>${esc(SUIT_NAMES[g.last.moved])} move up${back ? `<br><b class="hr-knock">💥 ${esc(SUIT_NAMES[back.suit])} knocked back</b>` : ''}</p>
    </div>`;
  }

  function betList(s) {
    const g = s.game;
    const missing = s.players.filter((p) => p.connected && !g.bets[p.id]);
    return `<div class="card hr-bets"><h2>Bets</h2>${SUITS.map((suit) => {
      const ids = backers(s, suit);
      return `<div class="hr-bet-row">${horse(suit)}<span>${ids.length
        ? ids.map((id) => `${PB.avatar(id, 'sm')} ${esc(name(id))} <b>${g.bets[id].sips}</b>`).join(' · ')
        : '<span class="muted">nobody</span>'}</span></div>`;
    }).join('')}
      ${missing.length ? `<p class="muted">Still betting: ${missing.map((p) => esc(name(p.id))).join(', ')}</p>` : ''}</div>`;
  }

  function bettingScreen(s) {
    const g = s.game;
    const key = `${g.race}`;
    if (draftFor !== key) { draft = { suit: g.myBet?.suit || null, sips: g.myBet?.sips || 1 }; draftFor = key; }
    const changed = !g.myBet || g.myBet.suit !== draft.suit || g.myBet.sips !== draft.sips;
    const missing = s.players.filter((p) => p.connected && !g.bets[p.id]).length;
    const anyBets = Object.keys(g.bets).length > 0;
    return `
      <div class="turn">🏇 Race ${g.race}<span>Place your bets</span></div>
      <div class="card hr-place">
        <div class="hr-suits">${SUITS.map((suit) => `
          <button class="${draft.suit === suit ? 'selected' : ''} ${red(suit) ? 'red' : ''}" data-hr="suit" data-suit="${suit}" aria-label="${SUIT_NAMES[suit]}">${PB.pip(suit)}</button>`).join('')}</div>
        <div class="ld-qty">
          <button class="secondary" data-hr="sips" data-step="-1" ${draft.sips <= 1 ? 'disabled' : ''}>−</button>
          <b>${draft.sips}</b>
          <button class="secondary" data-hr="sips" data-step="1" ${draft.sips >= g.maxBet ? 'disabled' : ''}>+</button>
        </div>
        <button data-act="bet" data-suit="${draft.suit || ''}" data-sips="${draft.sips}" ${draft.suit && changed ? '' : 'disabled'}>
          ${!draft.suit ? 'Pick a suit' : !changed ? `✓ ${PB.plural(g.myBet.sips, 'sip')} on ${esc(SUIT_NAMES[g.myBet.suit])}` : `Bet ${PB.plural(draft.sips, 'sip')} on ${esc(SUIT_NAMES[draft.suit])}`}
        </button>
        <p class="center muted">Lose: drink your bet. Win: hand out ${g.multiplier === 2 ? 'double it' : 'your bet'}.</p>
      </div>
      ${betList(s)}
      ${s.isHost
        ? `<button data-act="startRace" ${anyBets ? '' : 'disabled'} ${missing ? `data-confirm="${missing} still betting. Start anyway?"` : ''}>${anyBets ? '🏁 Start the race' : 'Waiting for bets'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the race once everyone has bet</p>`}
      ${track(s)}`;
  }

  function raceScreen(s) {
    const g = s.game;
    return `
      <div class="turn">🏇 Race ${g.race}<span>${g.speed === 'manual' ? `${esc(name(s.hostId))} flips the cards` : 'And they\'re off!'}</span></div>
      ${lastFlip(g)}
      ${s.isHost && g.speed === 'manual' ? '<button data-act="flip">Flip the next card</button>' : ''}
      ${track(s)}`;
  }

  function payoutPanel(s) {
    const g = s.game;
    const mine = g.payout[s.me];
    if (!mine || mine.done) {
      const waiting = Object.entries(g.payout).filter(([, p]) => !p.done).map(([id]) => esc(name(id)));
      return waiting.length ? `<p class="center muted">Waiting for ${waiting.join(', ')} to hand out sips…</p>` : '';
    }
    const key = `${g.race}`;
    if (allocFor !== key) { alloc = {}; allocFor = key; }
    const given = Object.values(alloc).reduce((a, b) => a + b, 0);
    const left = mine.total - given;
    return `
      <div class="card hr-give">
        <h2>Hand out ${PB.plural(mine.total, 'sip')}</h2>
        <p class="muted">${left ? `${PB.plural(left, 'sip')} left to give` : 'All given out. Send them!'}</p>
        ${s.players.filter((p) => p.id !== s.me).map((p) => `
          <div class="hr-give-row">${PB.avatar(p.id)}<span>${esc(p.name)}</span>
            <button class="secondary" data-hr="give" data-id="${esc(p.id)}" data-step="-1" ${alloc[p.id] ? '' : 'disabled'}>−</button>
            <b>${alloc[p.id] || 0}</b>
            <button class="secondary" data-hr="give" data-id="${esc(p.id)}" data-step="1" ${left ? '' : 'disabled'}>+</button>
          </div>`).join('')}
        <button data-act="give" data-alloc='${esc(JSON.stringify(alloc))}' ${left ? 'disabled' : ''}>🍺 Send the sips</button>
      </div>`;
  }

  function resultsList(s) {
    const g = s.game;
    const rows = Object.entries(g.drank).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '';
    return `<div class="card hr-bets"><h2>This race</h2>${rows.map(([id, n]) =>
      `<div class="hr-bet-row">${PB.avatar(id, 'sm')}<span>${esc(name(id))}</span><b>${PB.plural(n, 'sip')}</b></div>`).join('')}</div>`;
  }

  function finishScreen(s) {
    const g = s.game;
    const winners = backers(s, g.winner);
    return `
      <div class="drink win"><div class="big">🏆 ${esc(SUIT_NAMES[g.winner])} win!</div>
        <div class="sips">${winners.length ? `Backed by ${winners.map((id) => esc(name(id))).join(', ')}` : 'Nobody backed them. Everyone drinks!'}</div></div>
      ${s.phase === 'payout' ? payoutPanel(s) : ''}
      ${s.phase === 'results' ? resultsList(s) : ''}
      ${s.isHost
        ? `<button data-act="nextRace" ${s.phase === 'payout' ? 'class="secondary" data-confirm="Some winners haven\'t handed out their sips. Start the next race anyway?"' : ''}>Next race</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the next race…</p>`}
      ${track(s)}
      ${PB.feed(4)}`;
  }

  PB.register('horseRace', {
    sounds(prev, s) {
      if (s.game.winner && !prev.game.winner) return ['win'];
      return s.game.flips !== prev.game.flips ? ['card'] : [];
    },
    render(s) {
      if (s.phase === 'betting') return bettingScreen(s);
      if (s.phase === 'race') return raceScreen(s);
      if (s.phase === 'payout' || s.phase === 'results') return finishScreen(s);
      return '';
    },
    afterRender(s) {
      document.querySelectorAll('[data-hr]').forEach((b) => {
        b.onclick = () => {
          const g = s.game;
          const what = b.dataset.hr;
          if (what === 'suit') draft.suit = b.dataset.suit;
          else if (what === 'sips') draft.sips = Math.min(g.maxBet, Math.max(1, draft.sips + Number(b.dataset.step)));
          else if (what === 'give') {
            const id = b.dataset.id;
            alloc[id] = Math.max(0, (alloc[id] || 0) + Number(b.dataset.step));
            if (!alloc[id]) delete alloc[id];
          }
          PB.rerender();
        };
      });
    },
  });
})();
