// Screens for Kings Cup. Server logic: games/kingsCup.js
(() => {
  const { esc, name } = PB;

  function cup(g) {
    const crowns = Array.from({ length: 4 }, (_, i) => `<span class="${i < g.kings ? 'on' : ''}">👑</span>`).join('');
    return `<div class="kc-cup"><div class="kc-crowns">${crowns}</div><small>${g.kings === 4 ? 'The cup is done' : `${4 - g.kings} king${4 - g.kings === 1 ? '' : 's'} to go · ${g.deckLeft} cards left`}</small></div>`;
  }

  // Standing effects: question master, mates and house rules.
  function effects(g) {
    const bits = [];
    if (g.qm) bits.push(`<li>❓ Question master: <b>${esc(name(g.qm))}</b></li>`);
    for (const [a, b] of g.mates) bits.push(`<li>🤝 Mates: <b>${esc(name(a))}</b> & <b>${esc(name(b))}</b></li>`);
    for (const r of g.rules) bits.push(`<li>📜 ${esc(r.text)} <small>(${esc(name(r.by))})</small></li>`);
    return bits.length ? `<ul class="kc-effects">${bits.join('')}</ul>` : '';
  }

  function cardPanel(g) {
    return `
      <div class="kc-card">
        ${PB.card(g.card, { size: 'xl' })}
        <div class="kc-rule">
          <div class="kc-title">${esc(g.rule.title)}</div>
          <p>${esc(g.rule.text)}</p>
          ${g.prompt ? `<div class="kc-prompt">${esc(g.prompt)}</div>` : ''}
        </div>
      </div>`;
  }

  function lastLine(losers, s) {
    const solo = losers.length === 1 && losers[0] !== s.me;
    return `<p class="center mm-outright">🍺 ${esc(losers.map(name).join(', '))} ${solo ? 'was' : 'were'} last!</p>`;
  }

  function drawerAction(s) {
    const g = s.game;
    const kind = g.rule.kind;
    if (g.resolved) {
      const losers = g.race?.losers;
      return `${losers ? lastLine(losers, s) : ''}
        <button data-act="next">Next player →</button>`;
    }
    if (kind === 'pick') return `<p class="center"><b>Who drinks ${g.rule.sips}?</b></p>${PB.playerPicker('pick', { exclude: [s.me] })}`;
    if (kind === 'race') return `<p class="center"><b>Who was last?</b></p>${PB.playerPicker('pick', { exclude: [] })}`;
    if (kind === 'mate') return `<p class="center"><b>Pick your mate</b></p>${PB.playerPicker('mate', { exclude: [s.me] })}`;
    if (kind === 'rule') {
      return `<div class="kc-rule-form">
        <input id="kc-rule" maxlength="80" placeholder="e.g. No saying anyone's name" autocomplete="off">
        <button id="kc-add-rule">Add rule</button></div>`;
    }
    return '';
  }

  function render(s) {
    const g = s.game;
    // Don't redraw over a rule being typed.
    if (document.activeElement?.id === 'kc-rule') return null;
    const mine = g.turnId === s.me;

    if (s.phase === 'over') {
      return `
        <div class="drink"><div class="big">👑 ${g.loserId === s.me ? 'You' : esc(name(g.loserId))} drew the fourth king!</div><div class="sips">Drink the King's Cup</div></div>
        ${cup(g)}
        ${PB.scoreboard()}
        ${PB.feed(5)}`;
    }

    if (s.phase === 'race') {
      const r = g.race;
      const floor = g.card.rank === 4;
      const waiting = s.players.filter((p) => p.connected && !r.tapped.includes(p.id));
      return `
        ${PB.turn(g.turnId, `${g.rule.title}!`)}
        ${r.iTapped
          ? `<div class="kc-tapped">✓ You're in!<small>Waiting on ${esc(waiting.map((p) => name(p.id)).join(', '))} ${PB.timer()}</small></div>`
          : `<button class="kc-tap" data-act="tap">${floor ? '👇 Touch the floor, then TAP' : '🙌 Hands up, then TAP'}</button>
             <p class="center muted">Last one to tap drinks ${g.rule.sips}. ${PB.timer()}</p>`}
        ${effects(g)}`;
    }

    if (s.phase === 'draw') {
      return `
        ${PB.turn(g.turnId, mine ? 'Draw a card' : 'About to draw')}
        <div class="kc-deck">${mine ? `<button class="kc-draw" data-act="draw">${PB.card(null, { size: 'xl' })}<span>Tap to draw</span></button>` : PB.card(null, { size: 'xl' })}</div>
        ${cup(g)}
        ${effects(g)}
        ${PB.feed(3)}`;
    }

    // phase 'card'
    return `
      ${PB.turn(g.turnId, mine ? (g.resolved ? 'Done? Pass it on' : 'Follow the card') : `Drew ${g.rule.title}`)}
      ${cardPanel(g)}
      ${mine ? drawerAction(s) : g.resolved && g.race?.losers ? lastLine(g.race.losers, s) : ''}
      ${cup(g)}
      ${effects(g)}
      ${PB.feed(3)}`;
  }

  PB.register('kingsCup', {
    render,
    afterRender() {
      const input = document.getElementById('kc-rule');
      const add = () => {
        const text = input.value.trim();
        if (text) PB.act('rule', { text });
      };
      document.getElementById('kc-add-rule')?.addEventListener('click', add);
      input?.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    },
  });
})();
