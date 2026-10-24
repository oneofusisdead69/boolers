// Screens for Ace Race. Server logic: games/aceRace.js
(() => {
  const { esc, name } = PB;
  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const red = (s) => s === 'H' || s === 'D';
  // The bet being built stays on this phone until sent.
  let draft = null;
  let draftFor = null;

  const horse = (suit, extra = '') => `<span class="ar-horse ${red(suit) ? 'red' : ''} ${extra}">${PB.pip(suit)}</span>`;
  const backers = (s, suit) => Object.entries(s.game.bets).filter(([, b]) => b.pick === suit).map(([id]) => id);

  // The track, finish line at the top. Each row has its track card on the left and the four lanes.
  // With a TV in the room the track is on the TV, and phones are just for betting and paying out.
  function track(s) {
    if (s.tv && !PB.isTV) return '<p class="center muted ar-on-tv">📺 The race is on the TV</p>';
    const g = s.game;
    const rows = [];
    for (let r = g.length + 1; r >= 0; r--) {
      let side;
      if (r === g.length + 1) side = '<span class="ar-flag">🏁</span>';
      else if (r === 0) side = '<span class="ar-start">Start</span>';
      else side = `<span class="ar-side ${g.last?.back?.row === r ? 'flash' : ''}">${PB.card(g.track[r - 1], { size: 'sm' })}</span>`;
      const lanes = SUITS.map((suit) => {
        const here = g.positions[suit] === r;
        const moved = here && g.last?.moved === suit && !g.last?.back;
        const knocked = here && g.last?.back?.suit === suit;
        const won = here && g.winner === suit;
        return `<span class="ar-lane">${here ? horse(suit, [moved && 'moved', knocked && 'knocked', won && 'won'].filter(Boolean).join(' ')) : ''}</span>`;
      }).join('');
      rows.push(`<div class="ar-row ${r === g.length + 1 ? 'finish' : r === 0 ? 'start' : ''}">${side}${lanes}</div>`);
    }
    const bettors = `<div class="ar-row ar-bettors"><span></span>${SUITS.map((suit) =>
      `<span class="ar-lane">${backers(s, suit).map((id) => PB.avatar(id, 'sm')).join('')}</span>`).join('')}</div>`;
    return `<div class="ar-track">${rows.join('')}${bettors}</div>`;
  }

  function lastFlip(g) {
    if (!g.last) return '<p class="center muted">The first card flips in a moment…</p>';
    const back = g.last.back;
    return `<div class="ar-last">
      ${PB.card(g.last.card, { size: 'sm' })}
      <p>${esc(SUIT_NAMES[g.last.moved])} move up${back ? `<br><b class="ar-knock">💥 ${esc(SUIT_NAMES[back.suit])} knocked back</b>` : ''}</p>
    </div>`;
  }

  function betList(s) {
    const g = s.game;
    const missing = s.players.filter((p) => p.connected && !g.bets[p.id]);
    return `<div class="card ar-bets"><h2>Bets</h2>${SUITS.map((suit) => {
      const ids = backers(s, suit);
      return `<div class="ar-bet-row">${horse(suit)}<span>${ids.length
        ? ids.map((id) => `${PB.avatar(id, 'sm')} ${esc(name(id))} <b>${g.bets[id].sips}</b>`).join(' · ')
        : '<span class="muted">nobody</span>'}</span></div>`;
    }).join('')}
      ${missing.length ? `<p class="muted">Still betting: ${missing.map((p) => esc(name(p.id))).join(', ')}</p>` : ''}</div>`;
  }

  function bettingScreen(s) {
    const g = s.game;
    const key = `${g.race}`;
    if (draftFor !== key) { draft = { suit: g.myBet?.pick || null, sips: g.myBet?.sips || 1 }; draftFor = key; }
    const changed = !g.myBet || g.myBet.pick !== draft.suit || g.myBet.sips !== draft.sips;
    const missing = s.players.filter((p) => p.connected && !g.bets[p.id]).length;
    const anyBets = Object.keys(g.bets).length > 0;
    return `
      <div class="turn">🏇 Race ${g.race}<span>Place your bets</span></div>
      <div class="card ar-place">
        <div class="ar-suits">${SUITS.map((suit) => `
          <button class="${draft.suit === suit ? 'selected' : ''} ${red(suit) ? 'red' : ''}" data-ar="suit" data-suit="${suit}" aria-label="${SUIT_NAMES[suit]}">${PB.pip(suit)}</button>`).join('')}</div>
        <div class="ld-qty">
          <button class="secondary" data-ar="sips" data-step="-1" ${draft.sips <= 1 ? 'disabled' : ''}>−</button>
          <b>${draft.sips}</b>
          <button class="secondary" data-ar="sips" data-step="1" ${draft.sips >= g.maxBet ? 'disabled' : ''}>+</button>
        </div>
        <button data-act="bet" data-suit="${draft.suit || ''}" data-sips="${draft.sips}" ${draft.suit && changed ? '' : 'disabled'}>
          ${!draft.suit ? 'Pick a suit' : !changed ? `✓ ${PB.plural(g.myBet.sips, 'sip')} on ${esc(SUIT_NAMES[g.myBet.pick])}` : `Bet ${PB.plural(draft.sips, 'sip')} on ${esc(SUIT_NAMES[draft.suit])}`}
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

  function finishScreen(s) {
    const g = s.game;
    const winners = backers(s, g.winner);
    return `
      <div class="drink win"><div class="big">🏆 ${esc(SUIT_NAMES[g.winner])} win!</div>
        <div class="sips">${winners.length ? `Backed by ${winners.map((id) => esc(name(id))).join(', ')}` : 'Nobody backed them. Everyone drinks!'}</div></div>
      ${s.phase === 'payout' ? PB.handOut(s, `${g.race}`) : ''}
      ${s.phase === 'results' ? PB.raceDrinks(s) : ''}
      ${s.isHost
        ? `<button data-act="nextRace" ${s.phase === 'payout' ? 'class="secondary" data-confirm="Some winners haven\'t handed out their sips. Start the next race anyway?"' : ''}>Next race</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the next race…</p>`}
      ${track(s)}
      ${PB.feed(4)}`;
  }

  PB.register('aceRace', {
    reset() {
      draft = null;
      draftFor = null;
    },
    // Sideways: these go on the left.
    stage: '.ar-track, .ar-last',
    // On the TV: the shared parts of the screen.
    tvStage: '.ar-track, .ar-last, .ar-bets, .drink, .ar-give, .center.muted',
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
      document.querySelectorAll('[data-ar]').forEach((b) => {
        b.onclick = () => {
          const g = s.game;
          const what = b.dataset.ar;
          if (what === 'suit') draft.suit = b.dataset.suit;
          else if (what === 'sips') draft.sips = Math.min(g.maxBet, Math.max(1, draft.sips + Number(b.dataset.step)));
          PB.rerender();
        };
      });
    },
  });
})();
