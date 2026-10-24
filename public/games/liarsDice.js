// Screens for Liar's Dice. Server logic: games/liarsDice.js
(() => {
  const { esc, name } = PB;
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  // The bid being built on this phone, reset whenever the table's bid changes.
  let draft = null;
  let draftFor = null;
  // Pass and play: dice stay covered until whoever's turn it is taps to see them.
  let shownFor = null;
  // Your dice can be covered, e.g. to leave the phone on the table. Stays covered until you show
  // them again, across rounds and reloads.
  let covered = false;
  try { covered = localStorage.getItem('liarsDice-covered') === '1'; } catch {}

  const diceText = (n) => `${n} ${n === 1 ? 'die' : 'dice'}`;
  const bidText = (b) => `${WORDS[b.qty] || b.qty} ${b.face}${b.qty === 1 ? '' : 's'}`;
  const dieRow = (values, match = () => true) => `<div class="ld-dice">${values.map((v) =>
    `<span class="ld-die ${match(v) ? '' : 'dim'}">${PB.dice([v])}</span>`).join('')}</div>`;
  const coveredRow = (n) => `<div class="ld-dice">${'<span class="ld-die covered"><span>?</span></span>'.repeat(n)}</div>`;
  const miniDie = (face) => `<span class="ld-die mini">${PB.dice([face])}</span>`;

  // Same rule as the server: more dice, or the same number of a higher face.
  function valid(g, qty, face) {
    if (qty < 1 || qty > g.totalDice || face < 1 || face > 6) return false;
    if (g.wild && face === 1) return false;
    if (!g.bid) return true;
    return qty > g.bid.qty || (qty === g.bid.qty && face > g.bid.face);
  }

  // The smallest legal raise, or an opening bid on your most common face.
  function suggest(g) {
    const low = g.wild ? 2 : 1;
    if (g.bid) {
      if (g.bid.face < 6) return { qty: g.bid.qty, face: g.bid.face + 1 };
      return { qty: Math.min(g.bid.qty + 1, g.totalDice), face: low };
    }
    let face = low;
    for (let f = low; f <= 6; f++) {
      const n = (x) => g.myDice.filter((d) => d === x || (g.wild && d === 1)).length;
      if (n(f) > n(face)) face = f;
    }
    return { qty: 1, face };
  }

  function seats(s) {
    const g = s.game;
    return `<div class="mm-seats">${s.players.map((p) => `
      <div class="mm-seat ${p.id === g.turnId ? 'turn' : ''} ${g.counts[p.id] ? '' : 'out'} ${p.connected ? '' : 'offline'}">
        <span>${esc(p.name)}${p.id === s.me && !PB.passAndPlay ? ' (you)' : ''}</span><b>🎲 ${g.counts[p.id] ?? 0}</b>
      </div>`).join('')}</div>`;
  }

  function currentBid(g) {
    if (!g.bid) return '<div class="card ld-bid"><p class="muted">No bids yet</p></div>';
    return `<div class="card ld-bid">
      <small>${esc(name(g.bid.by))} bid</small>
      <div class="ld-bid-main"><b>${esc(bidText(g.bid))}</b>${miniDie(g.bid.face)}</div>
      ${g.wild ? '<small class="muted">1s are wild</small>' : ''}
    </div>`;
  }

  function history(g) {
    const older = g.bids.slice(0, -1).reverse();
    if (!older.length) return '';
    return `<ul class="feed">${older.map((b) => `<li>${esc(name(b.by))}: ${esc(bidText(b))}</li>`).join('')}</ul>`;
  }

  function bidControls(s) {
    const g = s.game;
    const key = `${g.round}:${g.bids.length}`;
    if (draftFor !== key) { draft = suggest(g); draftFor = key; }
    const ok = valid(g, draft.qty, draft.face);
    const faces = [1, 2, 3, 4, 5, 6].filter((f) => !(g.wild && f === 1));
    return `
      <div class="card ld-builder">
        <div class="ld-qty">
          <button class="secondary" data-ld="qty" data-step="-1" ${draft.qty <= 1 ? 'disabled' : ''}>−</button>
          <b>${draft.qty}</b>
          <button class="secondary" data-ld="qty" data-step="1" ${draft.qty >= g.totalDice ? 'disabled' : ''}>+</button>
        </div>
        <div class="ld-faces">${faces.map((f) => `
          <button class="${f === draft.face ? 'selected' : ''} ${valid(g, draft.qty, f) ? '' : 'low'}" data-ld="face" data-face="${f}" aria-label="${f}s">${PB.dice([f])}</button>`).join('')}</div>
        <button data-act="bid" data-qty="${draft.qty}" data-face="${draft.face}" ${ok ? '' : 'disabled'}>
          ${ok ? `Bid ${esc(bidText(draft))}` : 'Bid higher than that'}</button>
      </div>
      ${g.bid ? `<div class="mm-calls ${g.spotOn ? '' : 'one'}">
        <button class="red-btn" data-act="liar" data-confirm="Call liar on ${esc(bidText(g.bid))}?">🤥 Liar!</button>
        ${g.spotOn ? `<button class="secondary" data-act="spotOn" data-confirm="Say there are exactly ${esc(bidText(g.bid))}?">🎯 Spot on</button>` : ''}
      </div>` : ''}`;
  }

  function biddingScreen(s) {
    const g = s.game;
    const mine = g.turnId === s.me;
    const key = `${g.round}:${g.bids.length}:${g.turnId}`;
    if (PB.passAndPlay && shownFor !== key) {
      return `
        ${PB.turn(g.turnId, `Round ${g.round} · ${diceText(g.totalDice)} on the table`)}
        ${currentBid(g)}
        <div class="card center ld-pass">
          <p>Pass the phone to <b>${esc(name(g.turnId))}</b></p>
          <button data-ld="show">Show my dice</button>
        </div>
        ${seats(s)}`;
    }
    return `
      ${PB.turn(g.turnId, `Round ${g.round} · ${diceText(g.totalDice)} on the table`)}
      ${currentBid(g)}
      ${g.myDice.length
        ? `<div class="ld-mine-head">
            <h2 class="rb-label">${PB.passAndPlay ? `${esc(name(s.me))}'s dice` : 'Your dice'}</h2>
            <button class="secondary" data-ld="cover">${covered && !PB.passAndPlay ? '👁 Show' : '🙈 Hide'}</button>
          </div>
          ${covered && !PB.passAndPlay ? coveredRow(g.myDice.length) : dieRow(g.myDice)}`
        : '<p class="center muted">You\'re out of dice. Watch the liars.</p>'}
      ${mine ? bidControls(s) : `<p class="center muted">${esc(name(g.turnId))} is deciding…</p>`}
      ${seats(s)}
      ${history(g)}
      ${PB.feed(3)}`;
  }

  // "Bea was" / "You were", depending on whose phone this is.
  const was = (s, id) => (id === s.me && !PB.passAndPlay ? 'You were' : `${esc(name(id))} was`);
  const whose = (s, id) => (id === s.me && !PB.passAndPlay ? 'your' : `${esc(name(id))}'s`);

  function revealResult(s) {
    const g = s.game;
    const r = g.reveal;
    if (r.call === 'liar') {
      return r.count < r.bid.qty
        ? `🤥 Only ${r.count}! ${was(s, r.bidderId)} lying`
        : `😬 There were ${r.count}. ${was(s, r.callerId)} wrong`;
    }
    return r.count === r.bid.qty
      ? `🎯 Exactly ${r.count}! ${esc(name(r.callerId))} called it`
      : `❌ ${r.count}, not ${esc(bidText(r.bid))}. ${esc(name(r.callerId))} missed`;
  }

  function revealHands(s) {
    const g = s.game;
    const r = g.reveal;
    const match = (v) => v === r.bid.face || (g.wild && v === 1);
    return `<div class="ld-reveal">${s.players.filter((p) => r.hands[p.id]).map((p) => `
      <div class="ld-hand ${r.losers.includes(p.id) ? 'loser' : ''}">
        <span>${esc(p.name)}${r.out.includes(p.id) ? ' · out!' : ''}</span>
        ${dieRow(r.hands[p.id], match)}
      </div>`).join('')}</div>`;
  }

  function revealScreen(s) {
    const g = s.game;
    const r = g.reveal;
    const canNext = g.nextStarter === s.me || s.isHost;
    return `
      <div class="turn">${esc(name(r.callerId))} called ${r.call === 'liar' ? 'liar' : 'spot on'}
        <span>on ${whose(s, r.bidderId)} ${esc(bidText(r.bid))}</span></div>
      <p class="mm-last">${revealResult(s)}</p>
      ${revealHands(s)}
      ${canNext
        ? `<button data-act="next">Next round${g.nextStarter === s.me ? '' : ` (${esc(name(g.nextStarter))} starts)`}</button>`
        : `<p class="center muted">${esc(name(g.nextStarter))} starts the next round…</p>`}
      ${seats(s)}
      ${PB.feed(4)}`;
  }

  function overScreen(s) {
    const g = s.game;
    return `
      <div class="drink win"><div class="big">🏆 ${g.winnerId === s.me && !PB.passAndPlay ? 'You win!' : `${esc(name(g.winnerId))} wins!`}</div>
        <div class="sips">last one with dice</div></div>
      ${g.reveal ? `<p class="mm-last">${revealResult(s)}</p>${revealHands(s)}` : ''}
      ${PB.scoreboard()}
      ${PB.feed(5)}`;
  }

  PB.register('liarsDice', {
    render(s) {
      switch (s.phase) {
        case 'bidding': return biddingScreen(s);
        case 'reveal': return revealScreen(s);
        case 'over': return overScreen(s);
        default: return '';
      }
    },
    afterRender(s) {
      // Building a bid and uncovering dice are local until you send something.
      document.querySelectorAll('[data-ld]').forEach((b) => {
        b.onclick = () => {
          const g = s.game;
          if (b.dataset.ld === 'cover') {
            // On a shared phone, hiding goes back to the pass screen.
            if (PB.passAndPlay) shownFor = null;
            else {
              covered = !covered;
              try { localStorage.setItem('liarsDice-covered', covered ? '1' : '0'); } catch {}
            }
          } else if (b.dataset.ld === 'show') shownFor = `${g.round}:${g.bids.length}:${g.turnId}`;
          else if (b.dataset.ld === 'qty') draft.qty = Math.min(g.totalDice, Math.max(1, draft.qty + Number(b.dataset.step)));
          else if (b.dataset.ld === 'face') draft.face = Number(b.dataset.face);
          PB.rerender();
        };
      });
    },
  });
})();
