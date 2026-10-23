// Screens for Mad Max. Server logic: games/madMax.js
(() => {
  const { esc, name } = PB;
  const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const CALL_NAMES = {
    same: 'same color', different: 'different color', higher: 'higher', lower: 'lower',
    S: '♠ spades', H: '♥ hearts', D: '♦ diamonds', C: '♣ clubs', high: 'highest wins', low: 'lowest wins',
  };
  const cardText = (c) => (c ? `${RANKS[c.rank] || c.rank}${SUITS[c.suit]}` : '?');

  function pile(s) {
    const g = s.game;
    return `
      <div class="mm-pile">
        ${g.prev ? `<div class="mm-prev">${PB.card(g.prev, { size: 'sm' })}</div>` : ''}
        ${PB.card(g.top, { size: 'lg' })}
      </div>
      <p class="center muted mm-pile-label">Pile · ${PB.plural(g.pileSize, 'card')}</p>`;
  }

  function lastFlip(s) {
    const f = s.game.lastFlip;
    if (!f) return '';
    const who = f.by === s.me ? 'You' : esc(name(f.by));
    return `<p class="mm-last ${f.right ? 'right' : 'wrong'}">${who} called <b>${esc(CALL_NAMES[f.call])}</b>: ${esc(cardText(f.card))} ${f.right ? '✓' : '✗'}</p>`;
  }

  function seats(s) {
    const g = s.game;
    return `<div class="mm-seats">${s.players.map((p) => {
      const n = g.counts[p.id] ?? 0;
      const cls = [p.id === g.turnId && s.phase === 'call' ? 'turn' : '', n === 0 ? 'out' : '', p.connected ? '' : 'offline'].join(' ');
      return `<div class="mm-seat ${cls}"><span>${esc(p.name)}${p.id === s.me ? ' (you)' : ''}</span><b>${n === 0 ? 'out' : `🂠 ${n}`}</b></div>`;
    }).join('')}</div>`;
  }

  function callButtons(s) {
    return `
      <div class="mm-calls">
        <button class="secondary" data-act="call" data-call="same">Same color</button>
        <button class="secondary" data-act="call" data-call="different">Different color</button>
        <button class="secondary" data-act="call" data-call="higher">Higher ▲</button>
        <button class="secondary" data-act="call" data-call="lower">Lower ▼</button>
      </div>
      <div class="mm-suits">${Object.entries(SUITS).map(([k, sym]) =>
        `<button class="secondary ${k === 'H' || k === 'D' ? 'red' : ''}" data-act="call" data-call="${k}" aria-label="${CALL_NAMES[k]}">${sym}</button>`).join('')}</div>
      <p class="center muted">Suit calls are 2 sips if you're wrong · you have ${PB.plural(s.game.counts[s.me], 'card')}</p>`;
  }

  // ---------- War ----------

  function warHeader(s) {
    const w = s.game.war;
    const vs = w.challengers.map(name).join(' + ');
    return `<div class="turn war-head">${w.final ? '🔥 FINAL BATTLE' : '⚔️ WAR'}<span>${esc(vs)} vs ${esc(name(w.challengedId))}</span></div>`;
  }

  function warTable(s) {
    const w = s.game.war;
    const ids = [w.challengedId, ...w.challengers];
    return `<div class="mm-war">${ids.map((id) => {
      const played = w.rounds.filter((r) => r.players.includes(id));
      const faceDown = Math.max(0, (w.laid[id] || 0) - played.length);
      const borrowed = w.borrowed[id];
      return `
        <div class="mm-war-row">
          <div class="mm-war-name">
            <b>${esc(name(id))}</b>
            <small>${id === w.challengedId ? 'calls' : 'challenger'}${borrowed ? ` · borrowed ${borrowed.n}` : ''}</small>
            <span class="mm-wins">${'★'.repeat(w.wins[id] || 0) || '–'}</span>
          </div>
          <div class="cards mm-war-cards">
            ${played.map((r) => `<div class="mm-war-card ${r.winnerId === id ? 'won' : ''} ${r.tiebreak ? 'tb' : ''}">${PB.card(r.cards[id], { size: 'sm' })}</div>`).join('')}
            ${Array.from({ length: faceDown }, () => PB.card(null, { size: 'sm' })).join('')}
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  function lastRound(s) {
    const w = s.game.war;
    const r = w.rounds[w.rounds.length - 1];
    if (!r) return '';
    const by = !r.winnerId ? 'Tie' : r.winnerId === s.me ? 'You take it' : `${esc(name(r.winnerId))} takes it`;
    return `<p class="center mm-round">${r.tiebreak ? 'Tiebreak' : `Round ${w.rounds.filter((x) => !x.tiebreak).length}`}: ${esc(CALL_NAMES[r.call])} → <b>${by}</b></p>`;
  }

  function termsScreen(s) {
    const w = s.game.war;
    const lead = w.challengers[0] === s.me;
    let action;
    if (lead) {
      const multi = w.challengers.length > 1;
      action = `
        <p class="center">Set the terms. ${esc(name(w.challengedId))} will call each card.</p>
        <div class="mm-calls">
          <button data-act="terms" data-terms="high">Highest / lowest</button>
          <button data-act="terms" data-terms="color" ${multi ? 'disabled' : ''}>Same / different color</button>
        </div>
        ${multi ? '<p class="center muted">More than one challenger: highest / lowest only</p>' : ''}
        ${w.final ? '' : '<p class="center muted">Others can join until you pick</p>'}`;
    } else {
      action = `<p class="center muted">${esc(name(w.challengers[0]))} is setting the terms…</p>`;
    }
    return `
      ${warHeader(s)}
      ${w.final ? `<p class="center">The last two standing. ${w.size} cards each, winner takes all.</p>` : ''}
      ${action}
      ${w.canJoin ? '<button class="mm-war-btn" data-act="join">⚔️ Join the war</button>' : ''}
      ${seats(s)}`;
  }

  function warScreen(s) {
    const w = s.game.war;
    const tiebreak = w.rounds.length >= w.size;
    const roundLabel = tiebreak ? 'Tiebreak' : `Round ${w.rounds.length + 1} of ${w.size}`;
    const termsLabel = w.terms === 'color' ? 'same / different color' : 'highest / lowest';
    let action;
    if (w.callerId === s.me) {
      action = w.terms === 'color'
        ? `<div class="mm-calls"><button data-act="warCall" data-call="same">Same color</button><button data-act="warCall" data-call="different">Different color</button></div>
           <p class="center muted">Right call wins the round for you</p>`
        : `<div class="mm-calls"><button data-act="warCall" data-call="high">Highest wins ▲</button><button data-act="warCall" data-call="low">Lowest wins ▼</button></div>`;
    } else {
      action = `<p class="center muted">${esc(name(w.callerId))} is calling…</p>`;
    }
    return `
      ${warHeader(s)}
      <p class="center"><b>${roundLabel}</b> · terms: ${termsLabel}</p>
      ${warTable(s)}
      ${lastRound(s)}
      ${action}`;
  }

  function resultScreen(s) {
    const w = s.game.war;
    const mine = w.winnerId === s.me;
    const extra = [w.pileWon ? `${w.pileWon} from the pile` : '', w.paidBack ? `${w.paidBack} paid back` : ''].filter(Boolean).join(', ');
    return `
      ${warHeader(s)}
      <div class="drink ${mine ? 'win' : ''}">
        <div class="big">🏅 ${mine ? 'You win the war!' : `${esc(name(w.winnerId))} wins the war`}</div>
        <div class="sips">+${PB.plural(w.cardsWon, 'card')}${extra ? ` (${esc(extra)})` : ''}</div>
      </div>
      ${w.outright.length ? `<p class="center mm-outright">🍺 ${esc(w.outright.map(name).join(', '))}: no rounds won. Finish your drink!</p>` : ''}
      ${warTable(s)}
      ${mine
        ? '<button data-act="startPile">Start the new pile</button>'
        : `<p class="center muted">${esc(name(w.winnerId))} starts the new pile…</p>`}`;
  }

  // ---------- Main turn screens ----------

  function render(s) {
    const g = s.game;
    switch (s.phase) {
      case 'terms': return termsScreen(s);
      case 'war': return warScreen(s);
      case 'warResult': return resultScreen(s);
      case 'over': return `
        <div class="drink win"><div class="big">🏆 ${g.winnerId === s.me ? 'You win!' : `${esc(name(g.winnerId))} wins!`}</div><div class="sips">Last one holding cards</div></div>
        ${PB.scoreboard()}
        ${PB.feed(5)}`;
      default: break;
    }

    let header;
    let action = '';
    if (s.phase === 'call') {
      const mine = g.turnId === s.me;
      header = PB.turn(g.turnId, mine ? 'Call your next card' : 'Making a call');
      action = mine ? callButtons(s) : '';
    } else if (s.phase === 'challenge') {
      const f = g.lastFlip;
      header = PB.turn(f.by, 'War chance!');
      const why = f.chance === 'sandwich' ? 'matches the card two plays back' : `is one off ${cardText(f.prev)}`;
      action = `
        <p class="center">${esc(cardText(f.card))} ${why}. ${PB.timer()}</p>
        ${g.canChallenge
          ? `<button class="mm-war-btn" data-act="war">⚔️ WAR!</button>
             ${g.counts[s.me] === 0 ? '<p class="center muted">You\'re out, but you can still start a war</p>' : ''}`
          : '<p class="center muted">Anyone can challenge you to war…</p>'}`;
    } else if (s.phase === 'pick') {
      const f = g.lastFlip;
      header = PB.turn(f.by, 'Same number: WAR!');
      action = f.by === s.me
        ? `<p class="center">Same number! Pick who you go to war with</p>
           ${PB.playerPicker('pick', { exclude: s.players.map((p) => p.id).filter((id) => !g.pickable.includes(id)) })}`
        : `<p class="center muted">${esc(name(f.by))} is picking an opponent…</p>`;
    }

    return `
      ${header}
      ${pile(s)}
      ${s.phase === 'pick' ? '' : lastFlip(s)}
      ${action}
      ${seats(s)}
      ${PB.feed(3)}`;
  }

  PB.register('madMax', { render });
})();
