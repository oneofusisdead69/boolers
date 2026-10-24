// Screens for Shot Poker. Server logic: games/shotPoker.js
(() => {
  const { esc, name } = PB;
  const STREET_NAMES = { preflop: 'Before the flop', flop: 'The flop', turn: 'The turn', river: 'The river' };
  // The raise being built on this phone, reset whenever the bet changes.
  let raiseTo = null;
  let raiseFor = null;
  // Your cards can be covered (to leave the phone on the table), remembered across hands.
  let covered = false;
  try { covered = localStorage.getItem('shotPoker-covered') === '1'; } catch {}
  // Pass and play: cards stay covered until whoever's turn it is taps to see them.
  let shownFor = null;

  const shotText = (sips, perShot) => {
    const shots = Math.floor(sips / perShot);
    const rest = sips % perShot;
    const parts = [];
    if (shots) parts.push(`${shots} shot${shots === 1 ? '' : 's'}`);
    if (rest || !shots) parts.push(PB.plural(rest, 'sip'));
    return parts.join(' + ');
  };
  const isMe = (s, id) => id === s.me && !PB.passAndPlay;
  // The player's own name (PB.name says "You" for yourself).
  const realName = (s, id) => s.players.find((p) => p.id === id)?.name ?? '???';

  const banner = () => '<div class="sp-banner">☠️ All debts must be paid before the next round...</div>';

  function table(g) {
    const slots = Array.from({ length: 5 }, (_, i) => g.community[i] || null);
    return `
      <div class="sp-table">
        <div class="cards sp-board">${slots.map((c) => PB.card(c, { size: 'md' })).join('')}</div>
        <p class="sp-pot">🍺 ${PB.plural(g.pot, 'sip')} in play${g.currentBet ? ` · bet to match: ${g.currentBet}` : ''}</p>
      </div>`;
  }

  function myCards(s) {
    const g = s.game;
    if (!g.inHand) return '<p class="center muted">You\'re sitting out this hand. You\'re in from the next one.</p>';
    const hidden = covered && !PB.passAndPlay;
    return `
      <div class="ld-mine-head">
        <h2 class="rb-label">${PB.passAndPlay ? `${esc(name(s.me))}'s cards` : 'Your cards'}</h2>
        <button class="secondary" data-sp="cover">${hidden ? '👁 Show' : '🙈 Hide'}</button>
      </div>
      <div class="cards sp-hole">${g.myCards.map((c) => PB.card(hidden ? null : c, { size: 'lg' })).join('')}</div>`;
  }

  function seats(s, { reveal = false } = {}) {
    const g = s.game;
    return `<div class="sp-seats">${g.seats.map((x) => {
      const h = reveal && g.result?.hands[x.id];
      const won = g.result?.winners.includes(x.id);
      return `
        <div class="sp-seat ${x.id === g.turnId ? 'acting' : ''} ${x.folded ? 'folded' : ''} ${won ? 'won' : ''}">
          ${PB.avatar(x.id)}
          <div class="sp-seat-main">
            <b>${esc(realName(s, x.id))}${isMe(s, x.id) ? ' (you)' : ''}${x.id === g.dealerId ? ' <span class="sp-dealer">D</span>' : ''}</b>
            <small>${h ? esc(h.name) : x.folded ? 'Folded' : x.allIn ? 'All in' : esc(x.last || '')}</small>
          </div>
          ${h ? `<div class="cards sp-seat-cards">${h.cards.map((c) => PB.card(c, { size: 'sm' })).join('')}</div>` : ''}
          <span class="sp-in">${x.committed}</span>
        </div>`;
    }).join('')}</div>`;
  }

  // What everyone has drunk: this game in shots and sips, and the whole night (every game in
  // this room) in sips.
  function tab(s) {
    const g = s.game;
    const { head, hidden } = PB.tabHead('🍺 Tab');
    if (hidden) return `<div class="card sp-tab">${head}</div>`;
    const rows = s.players.slice().sort((a, b) => b.drinks - a.drinks || (b.total || 0) - (a.total || 0));
    return `<div class="card sp-tab">${head}
      <ul><li class="sp-tab-head"><span></span><small>This game</small><small>Tonight</small></li>${rows.map((p) => `
      <li class="${p.connected ? '' : 'offline'}">${PB.avatar(p.id, 'sm')}<span>${esc(p.name)}${isMe(s, p.id) ? ' (you)' : ''}</span>
        <b>${p.drinks ? esc(shotText(p.drinks, g.perShot)) : '–'}</b><em>${PB.plural(p.total || 0, 'sip')}</em></li>`).join('')}</ul></div>`;
  }

  function actions(s) {
    const g = s.game;
    const key = `${g.hand}:${g.street}:${g.currentBet}`;
    const least = g.currentBet + 1;
    if (raiseFor !== key) { raiseTo = Math.min(least, g.maxTo); raiseFor = key; }
    const canRaise = g.maxTo > g.currentBet;
    const allIn = raiseTo === g.maxTo;
    return `
      <div class="card sp-actions">
        ${g.toCall
          ? `<p class="center">${PB.plural(g.toCall, 'sip')} to stay in · folding costs what you've put in</p>`
          : '<p class="center">Nothing to match: check or bet</p>'}
        ${canRaise ? `
          <div class="ld-qty">
            <button class="secondary" data-sp="to" data-step="-1" ${raiseTo <= least ? 'disabled' : ''}>−</button>
            <b>${raiseTo}</b>
            <button class="secondary" data-sp="to" data-step="1" ${raiseTo >= g.maxTo ? 'disabled' : ''}>+</button>
          </div>
          <div class="sp-quick">
            <button class="secondary" data-sp="set" data-to="${Math.min(g.maxTo, Math.max(least, g.currentBet + g.perShot))}">+1 shot</button>
            <button class="secondary" data-sp="set" data-to="${g.maxTo}">All in (${g.maxTo})</button>
          </div>
          <button data-act="raise" data-to="${raiseTo}">${allIn ? '☠️ All in' : g.currentBet ? 'Raise' : 'Bet'} to ${raiseTo}<small>${esc(shotText(raiseTo, g.perShot))}</small></button>` : ''}
        <div class="mm-calls">
          <button class="red-btn" data-act="fold" ${g.toCall ? '' : 'data-confirm="Fold when you could check for free?"'}>Fold</button>
          ${g.toCall
            ? `<button class="secondary" data-act="call">Call ${g.toCall}</button>`
            : '<button class="secondary" data-act="check">Check</button>'}
        </div>
      </div>`;
  }

  function bettingScreen(s) {
    const g = s.game;
    const mine = g.turnId === s.me;
    const head = `
      ${banner()}
      ${PB.turn(g.turnId, `Hand ${g.hand} · ${STREET_NAMES[g.street]}`)}
      ${table(g)}`;
    const key = `${g.hand}:${g.street}:${g.turnId}:${g.pot}`;
    if (PB.passAndPlay && shownFor !== key) {
      return `${head}
        <div class="card center ld-pass">
          <p>Pass the phone to <b>${esc(name(g.turnId))}</b></p>
          <button data-sp="show">Show my cards</button>
        </div>
        ${seats(s)}
        ${tab(s)}`;
    }
    return `${head}
      ${myCards(s)}
      ${mine ? actions(s) : `<p class="center muted">${esc(name(g.turnId))} is deciding…</p>`}
      ${seats(s)}
      ${tab(s)}
      ${PB.feed(3)}`;
  }

  function debtsList(s) {
    const g = s.game;
    const entries = Object.entries(g.debts);
    if (!entries.length) return '<p class="center muted">Nobody owes anything this hand</p>';
    return `<ul class="sp-debts">${entries.map(([id, d]) => {
      let status = '';
      if (d.paid) status = '<small class="ok">✅ settled</small>';
      else if (id === s.me) status = '<button class="sp-pay" data-act="paid">✅ Tab settled</button>';
      else status = '<small class="owed">unpaid</small>';
      return `<li>${PB.avatar(id, 'sm')}<span>${esc(name(id))}<small>${esc(d.text)}</small></span>${status}</li>`;
    }).join('')}</ul>`;
  }

  // While anyone still owes, "All debts must be paid" flashes across the whole screen, with a
  // "Tab settled" button for each player who owes until they've paid.
  let flash = { hand: null, at: 0 };
  function debtFlash(s) {
    const g = s.game;
    if (!g.waitingOn.length) return '';
    const mine = g.debts[s.me] && !g.debts[s.me].paid && !PB.isTV;
    // The full-screen flash plays once a hand (carrying on through redraws); after that the
    // reminder stays at the bottom.
    if (flash.hand !== g.hand) flash = { hand: g.hand, at: Date.now() };
    const elapsed = Date.now() - flash.at;
    return `${elapsed < 2600 ? `<div class="sp-takeover" style="animation-delay:-${elapsed}ms"><span>☠️ ALL DEBTS MUST BE PAID BEFORE THE NEXT ROUND…</span></div>` : ''}
    <div class="sp-flash">
      <div class="sp-flash-text">☠️ All debts must be paid before the next round…</div>
      <ul class="sp-flash-list">${Object.entries(g.debts).map(([id, d]) => `
        <li class="${d.paid ? 'paid' : ''}">${PB.avatar(id, 'sm')}<b>${esc(realName(s, id))}</b><span>${esc(d.text)}</span><em>${d.paid ? '✅ Settled' : '⏳ Owes'}</em></li>`).join('')}</ul>
      ${mine ? `<button class="sp-settle" data-act="paid">✅ Tab settled</button>` : ''}
    </div>`;
  }

  function showdownScreen(s) {
    const g = s.game;
    const r = g.result;
    const winners = r.winners.map((id) => esc(name(id))).join(' & ');
    const how = r.byFold ? 'everyone else folded' : esc(r.hands[r.winners[0]].name);
    const canDeal = s.isHost || g.nextDealerId === s.me;
    const waiting = g.waitingOn.map((id) => esc(name(id))).join(', ');
    return `
      ${banner()}
      <div class="turn">🏆 ${winners} ${r.winners.length > 1 ? 'split it' : isMe(s, r.winners[0]) ? 'win' : 'wins'}<span>${how}</span></div>
      ${table(g)}
      ${seats(s, { reveal: true })}
      <div class="card"><h2>Debts</h2>${debtsList(s)}</div>
      ${canDeal
        ? `<button data-act="deal" ${waiting ? 'disabled' : ''}>${waiting ? `Waiting on ${waiting} to settle up` : 'Deal the next hand'}</button>`
        : `<p class="center muted">${waiting ? `Waiting on ${waiting} to settle up` : `${esc(name(g.nextDealerId))} deals next…`}</p>`}
      ${debtFlash(s)}
      ${tab(s)}
      ${PB.feed(4)}`;
  }

  PB.register('shotPoker', {
    // Sideways: these go on the left.
    stage: '.sp-banner, .sp-table, .ld-mine-head, .sp-hole',
    // On the TV: the shared parts of the screen.
    tvStage: '.sp-table, .sp-takeover, .sp-flash',
    tvBanner: '.sp-takeover, .sp-flash',
    // On the TV, everyone's two cards sit in front of them: face down, face up at the showdown,
    // pushed away when they fold. With what they've put in and what they last did.
    tvFront(s, id) {
      const g = s.game;
      const x = g.seats.find((seat) => seat.id === id);
      if (!x) return '';
      const h = g.result?.hands[id];
      const won = g.result?.winners.includes(id);
      const cards = h ? h.cards.map((c) => PB.card(c, { size: 'sm' })).join('') : PB.card(null, { size: 'sm' }) + PB.card(null, { size: 'sm' });
      return `<div class="sp-front ${x.folded ? 'folded' : ''} ${won ? 'won' : ''} ${x.id === g.turnId ? 'acting' : ''}">
        <div class="cards">${cards}</div>
        <small>${x.id === g.dealerId ? '<span class="sp-dealer">D</span> ' : ''}${[h ? esc(h.name) : x.folded ? 'Folded' : x.allIn ? 'All in' : esc(x.last || ''), `🍺 ${x.committed}`, g.debts[id] && (g.debts[id].paid ? '✅ settled' : '⏳ owes')].filter(Boolean).join(' · ')}</small>
      </div>`;
    },
    // A card for each new deal: your hand, then the flop, turn and river.
    sounds: (prev, s) => (s.game.hand !== prev.game.hand || s.game.community.length !== prev.game.community.length ? ['card'] : []),
    render(s) {
      if (s.phase === 'betting') return bettingScreen(s);
      if (s.phase === 'showdown') return showdownScreen(s);
      return '';
    },
    afterRender(s) {
      // Building a raise and covering cards stay on this phone until you send something.
      document.querySelectorAll('[data-sp]').forEach((b) => {
        b.onclick = () => {
          const g = s.game;
          const what = b.dataset.sp;
          if (what === 'show') shownFor = `${g.hand}:${g.street}:${g.turnId}:${g.pot}`;
          else if (what === 'to') raiseTo = Math.min(g.maxTo, Math.max(g.currentBet + 1, raiseTo + Number(b.dataset.step)));
          else if (what === 'set') raiseTo = Number(b.dataset.to);
          else if (what === 'cover') {
            if (PB.passAndPlay) shownFor = null; // hand the phone on
            else {
              covered = !covered;
              try { localStorage.setItem('shotPoker-covered', covered ? '1' : '0'); } catch {}
            }
          }
          PB.rerender();
        };
      });
    },
  });
})();
