// Screens for Ride the Bus. Server logic: games/rideTheBus.js
(() => {
  const { esc, name } = PB;
  const SUITS = { S: '♠\uFE0E', H: '♥\uFE0E', D: '♦\uFE0E', C: '♣\uFE0E' };
  const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const ROUND_NAMES = ['Red or black?', 'Higher or lower?', 'Inside or outside?', 'Pick the suit'];
  const cardText = (c) => (c ? `${RANKS[c.rank] || c.rank}${SUITS[c.suit]}` : '?');
  let selected = null; // card picked from your hand to play on the pyramid
  let selectedFor = null;

  function guessButtons(type, act, refs) {
    switch (type) {
      case 'color': return `<div class="mm-calls">
        <button class="red-btn" data-act="${act}" data-guess="red">Red</button>
        <button class="black-btn" data-act="${act}" data-guess="black">Black</button></div>`;
      case 'highlow': return `<div class="mm-calls">
        <button class="secondary" data-act="${act}" data-guess="higher">Higher than ${esc(cardText(refs[refs.length - 1]))} ▲</button>
        <button class="secondary" data-act="${act}" data-guess="lower">Lower than ${esc(cardText(refs[refs.length - 1]))} ▼</button></div>`;
      case 'inout': {
        const [a, b] = refs.slice(-2);
        return `<div class="mm-calls">
          <button class="secondary" data-act="${act}" data-guess="inside">Inside ${esc(cardText(a))}–${esc(cardText(b))}</button>
          <button class="secondary" data-act="${act}" data-guess="outside">Outside</button></div>`;
      }
      case 'suit': return `<div class="mm-suits">${Object.keys(SUITS).map((k) =>
        `<button class="secondary ${k === 'H' || k === 'D' ? 'red' : ''}" data-act="${act}" data-guess="${k}" aria-label="${SUIT_NAMES[k]}">${PB.pip(k)}</button>`).join('')}</div>`;
      default: return '';
    }
  }

  function hand(s, { playable = null } = {}) {
    const cards = s.game.myHand;
    if (!cards.length) return '<p class="center muted rb-hand">No cards in your hand yet</p>';
    return `<div class="cards rb-hand">${cards.map((card, i) => {
      const canPlay = playable && playable(card);
      return canPlay
        ? `<button class="rb-card-btn ${selected === i ? 'selected' : ''}" data-select="${i}">${PB.card(card, { size: 'md' })}</button>`
        : `<div class="rb-card ${playable ? 'dim' : ''}">${PB.card(card, { size: 'md' })}</div>`;
    }).join('')}</div>`;
  }

  function seats(s) {
    const g = s.game;
    return `<div class="mm-seats">${s.players.map((p) => `
      <div class="mm-seat ${p.id === g.turnId ? 'turn' : ''} ${p.connected ? '' : 'offline'}">
        ${PB.avatar(p.id)}<span>${esc(p.name)}${p.id === s.me ? ' (you)' : ''}</span><b>🂠 ${g.counts[p.id] ?? 0}</b>
      </div>`).join('')}</div>`;
  }

  function lastGuess(s) {
    const l = s.game.last;
    if (!l) return '';
    const guess = SUITS[l.guess] || l.guess;
    return `<p class="mm-last ${l.right ? 'right' : 'wrong'}">${esc(name(l.by))} guessed <b>${esc(guess)}</b>: ${esc(cardText(l.card))} ${l.right ? '✓' : '✗'}</p>`;
  }

  // ---------- Round 1 ----------

  function guessScreen(s) {
    const g = s.game;
    const mine = g.turnId === s.me;
    return `
      ${PB.turn(g.turnId, `Round ${g.round + 1} of 4 · ${ROUND_NAMES[g.round]} · ${PB.plural(g.roundSips, 'sip')}`)}
      ${lastGuess(s)}
      <h2 class="rb-label">Your cards</h2>
      ${hand(s)}
      ${mine
        ? `${guessButtons(g.roundType, 'guess', g.myHand)}<p class="center muted">Wrong: drink ${PB.plural(g.roundSips, 'sip')}. Right: give them out.</p>`
        : `<p class="center muted">${esc(name(g.turnId))} is guessing…</p>`}
      ${seats(s)}
      ${PB.feed(3)}`;
  }

  function giveScreen(s) {
    const g = s.game;
    const mine = g.give.from === s.me;
    return `
      ${PB.turn(g.give.from, 'Right! Giving out sips')}
      ${lastGuess(s)}
      ${mine
        ? `<p class="center"><b>Give ${PB.plural(g.give.sips, 'sip')}</b> to…</p>${PB.playerPicker('give', { exclude: [s.me] })}`
        : `<p class="center muted">${esc(name(g.give.from))} is picking who drinks ${PB.plural(g.give.sips, 'sip')}…</p>`}
      <h2 class="rb-label">Your cards</h2>
      ${hand(s)}
      ${seats(s)}`;
  }

  // ---------- Round 2 ----------

  function pyramidView(p) {
    const size = p.rows.length > 4 ? 'sm' : 'md';
    // Top row first on screen; the bottom row (1 sip) flips first.
    return `<div class="rb-pyramid">${p.rows.map((row, r) => `
      <div class="rb-row"><span class="rb-sips">${r + 1}</span>${row.map((card, c) => {
        const current = p.current && p.current.row === r && p.current.col === c;
        return `<div class="rb-spot ${current ? 'current' : ''}">${PB.card(card, { size })}</div>`;
      }).join('')}</div>`).reverse().join('')}</div>`;
  }

  function pyramidScreen(s) {
    const g = s.game;
    const p = g.pyramid;
    // A new flip, or a card leaving your hand, clears the selection.
    const key = `${p.flipped}:${g.myHand.length}`;
    if (selectedFor !== key) { selected = null; selectedFor = key; }
    const spot = p.current;
    const allFlipped = p.flipped >= p.total;
    const matches = (card) => spot && (g.bluff || card.rank === spot.card.rank);
    const waitingOnMe = p.plays.filter((x) => x.status === 'pending' && x.targetId === s.me);
    const recent = p.plays.filter((x) => x.flip === p.flipped);

    let action = '';
    if (waitingOnMe.length) {
      action = waitingOnMe.map((x) => `
        <div class="card rb-claim">
          <p><b>${esc(name(x.by))}</b> plays a card on you: ${PB.plural(x.sips, 'sip')}.</p>
          <div class="mm-calls">
            <button class="secondary" data-act="accept" data-play-id="${x.id}">Drink ${x.sips}</button>
            <button class="red-btn" data-act="callBluff" data-play-id="${x.id}">Call bluff!</button>
          </div>
          <p class="muted">Wrong call and you drink ${x.sips * 2}. Right and they do.</p>
        </div>`).join('');
    } else if (selected !== null && g.myHand[selected]) {
      action = `<p class="center">Play your ${esc(cardText(g.myHand[selected]))}: who drinks ${PB.plural(spot.sips, 'sip')}?</p>
        ${PB.playerPicker('play', { exclude: [s.me], extra: { cardIdx: selected } })}
        <button class="link" data-select="none">Cancel</button>`;
    } else if (spot && g.myHand.some(matches)) {
      action = `<p class="center">${g.bluff ? 'Tap a card to play it (bluffing allowed)' : `You have a ${esc(RANKS[spot.card.rank] || spot.card.rank)}! Tap it to give ${PB.plural(spot.sips, 'sip')}`}</p>`;
    }

    return `
      <div class="turn">🔺 The pyramid<span>${allFlipped ? 'All flipped' : spot ? `Row ${spot.row + 1}: ${PB.plural(spot.sips, 'sip')} per match` : 'Match a flipped card to give sips'}</span></div>
      ${pyramidView(p)}
      ${recent.length ? `<ul class="feed rb-plays">${recent.map((x) => `<li>${esc(name(x.by))} → ${esc(name(x.targetId))}: ${x.card ? esc(cardText(x.card)) : '🂠'} ${
        x.status === 'pending' ? '(waiting)' : x.status === 'bluff' ? '🕵️ bluff caught' : x.status === 'honest' ? '✓ was real' : ''}</li>`).join('')}</ul>` : ''}
      ${action}
      <h2 class="rb-label">Your cards</h2>
      ${hand(s, { playable: matches })}
      ${s.isHost
        ? `<button data-act="flip">${allFlipped ? '🚌 Who rides the bus?' : p.flipped === 0 ? 'Flip the first card' : 'Flip the next card'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} flips the cards</p>`}
      ${seats(s)}`;
  }

  // ---------- Round 3 ----------

  function busScreen(s) {
    const g = s.game;
    const b = g.bus;
    const mine = b.riderId === s.me;
    const row = Array.from({ length: b.length }, (_, i) => (i < b.pos ? b.revealed[i] : null));
    const last = b.last;
    const typeLabel = { color: 'Red or black?', highlow: 'Higher or lower?', inout: 'Inside or outside?', suit: 'Pick the suit' }[b.type];
    return `
      ${PB.turn(b.riderId, `🚌 Riding the bus · try ${b.attempts}`)}
      <div class="rb-bus">
        <div class="rb-bus-start">${PB.card(b.start, { size: 'sm' })}<small>start</small></div>
        <div class="cards rb-bus-row">${row.map((card, i) => `<div class="rb-spot ${i === b.pos ? 'current' : ''}">${PB.card(card, { size: 'sm' })}</div>`).join('')}</div>
      </div>
      ${last ? `<p class="mm-last ${last.right ? 'right' : 'wrong'}">Card ${last.pos + 1}: guessed <b>${esc(SUITS[last.guess] || last.guess)}</b>, it was ${esc(cardText(last.card))} ${last.right ? '✓' : `✗ Drink ${last.pos + 1}, new row!`}</p>` : ''}
      <p class="center"><b>Card ${b.pos + 1} of ${b.length}:</b> ${typeLabel}</p>
      ${mine
        ? guessButtons(b.type, 'busGuess', [b.start, ...b.revealed])
        : `<p class="center muted">${esc(name(b.riderId))} is riding the bus…</p>`}
      ${PB.feed(3)}`;
  }

  function overScreen(s) {
    const b = s.game.bus;
    return `
      <div class="drink win"><div class="big">🎉 ${b.riderId === s.me ? 'You got off the bus!' : `${esc(name(b.riderId))} got off the bus!`}</div>
        <div class="sips">after ${PB.plural(b.attempts, 'try')}</div></div>
      ${PB.scoreboard()}
      ${PB.feed(5)}`;
  }

  PB.register('rideTheBus', {
    // Sideways: these go on the left.
    stage: '.rb-pyramid, .rb-bus, .rb-label, .rb-hand',
    // A card turned over: a guess, a pyramid flip or a bus card.
    sounds(prev, s) {
      const flips = (x) => [x.game.last, x.game.pyramid?.flipped, x.game.bus?.last, x.game.bus?.attempts];
      return JSON.stringify(flips(prev)) !== JSON.stringify(flips(s)) ? ['card'] : [];
    },
    render(s) {
      switch (s.phase) {
        case 'guess': return guessScreen(s);
        case 'give': return giveScreen(s);
        case 'pyramid': return pyramidScreen(s);
        case 'bus': return busScreen(s);
        case 'over': return overScreen(s);
        default: return '';
      }
    },
    afterRender() {
      // Picking a card from your hand is local until you choose who drinks.
      document.querySelectorAll('[data-select]').forEach((b) => {
        b.onclick = () => {
          selected = b.dataset.select === 'none' ? null : Number(b.dataset.select);
          PB.rerender();
        };
      });
    },
  });
})();
