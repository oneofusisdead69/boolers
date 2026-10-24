// Screens for Kings Cup. Server logic: games/kingsCup.js
(() => {
  const { esc, name } = PB;
  let picked = null; // the ring spot you've picked but not drawn yet
  let pickedFor = null;
  let dealt = false; // the dealing animation plays once per game
  let dragging = false; // a finger is on the ring
  let missed = false; // an update came in while it was

  // The deck laid face down in a ring around the King's Cup. On your turn, touch the ring to pick
  // the card at that spot; slide around the ring to change it.
  function ring(s, mine) {
    const g = s.game;
    const key = `${g.turnId}:${g.taken.length}`;
    if (pickedFor !== key) { picked = null; pickedFor = key; }
    const dealing = !dealt && g.taken.length === 0;
    dealt = true;
    const n = g.ringSize;
    const crowns = Array.from({ length: 4 }, (_, i) => `<span class="${i < g.kings ? 'on' : ''}">👑</span>`).join('');
    const slots = Array.from({ length: n }, (_, i) => (g.taken.includes(i) ? '' : `
      <div class="kc-slot ${dealing ? 'dealing' : ''} ${picked === i ? 'picked' : ''}" data-slot="${i}"
        style="--a:${(i * 360) / n}deg;--i:${i}">${PB.card(null, { size: 'sm' })}</div>`)).join('');
    return `
      <div class="kc-ring ${mine ? 'active' : ''}" id="kc-ring" ${mine ? 'role="listbox" aria-label="Cards in the ring"' : ''}>
        ${slots}
        <div class="kc-center"><div class="kc-cup-emoji">🍺</div><div class="kc-crowns">${crowns}</div></div>
      </div>`;
  }

  function drawArea() {
    return picked !== null
      ? `<button data-act="draw" data-slot="${picked}">Draw this card</button>`
      : '<p class="center muted">Touch the ring to pick a card. Slide to change it.</p>';
  }

  function brokeLine(s) {
    const g = s.game;
    if (!g.broke) return '';
    return `<p class="center kc-broke">💥 ${esc(name(g.turnId))} broke the circle! Finish your drink.</p>`;
  }

  // The free spot nearest to where the finger is, by angle around the ring.
  function slotAt(e, ringEl, g) {
    const r = ringEl.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    let best = null;
    let bestGap = Infinity;
    for (let i = 0; i < g.ringSize; i++) {
      if (g.taken.includes(i)) continue;
      const diff = Math.abs((i * 360) / g.ringSize - deg);
      const gap = Math.min(diff, 360 - diff);
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    return best;
  }

  // Moves the highlight and the Draw button without redrawing the screen under the finger.
  function showPick() {
    document.querySelectorAll('.kc-slot.picked').forEach((el) => el.classList.remove('picked'));
    document.querySelector(`.kc-slot[data-slot="${picked}"]`)?.classList.add('picked');
    const area = document.getElementById('kc-draw-area');
    if (area) area.innerHTML = drawArea();
  }

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
      dealt = false; // the next game deals again
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
      if (dragging) { missed = true; return null; } // keep the ring still under a moving finger
      const html = `
        ${PB.turn(g.turnId, mine ? 'Pick a card from the ring' : 'Picking a card')}
        ${ring(s, mine)}`;
      return `
        ${html}
        ${mine ? `<div id="kc-draw-area">${drawArea()}</div>` : ''}
        <p class="center muted">${4 - g.kings} king${4 - g.kings === 1 ? '' : 's'} to go · ${g.deckLeft} cards left</p>
        ${g.circle && g.taken.length ? '<p class="center muted">💥 A card next to a gap breaks the circle</p>' : ''}
        ${effects(g)}
        ${PB.feed(3)}`;
    }

    // phase 'card'
    return `
      ${PB.turn(g.turnId, mine ? (g.resolved ? 'Done? Pass it on' : 'Follow the card') : `Drew ${g.rule.title}`)}
      ${brokeLine(s)}
      ${cardPanel(g)}
      ${mine ? drawerAction(s) : g.resolved && g.race?.losers ? lastLine(g.race.losers, s) : ''}
      ${cup(g)}
      ${effects(g)}
      ${PB.feed(3)}`;
  }

  PB.register('kingsCup', {
    // Sideways: these go on the left.
    stage: '.kc-ring, .kc-card, .kc-cup',
    // On the TV, the tap race is a big call to action.
    tv(s) {
      if (s.phase !== 'race') return undefined;
      const g = s.game;
      const floor = g.card.rank === 4;
      return `
        <div class="kc-card">${PB.card(g.card, { size: 'xl' })}</div>
        <div class="drink me"><div class="big">${floor ? '👇 TOUCH THE FLOOR' : '🙌 HANDS UP'}</div>
          <div class="sips">then tap your phone · last one drinks ${g.rule.sips} ${PB.timer()}</div></div>
        <div class="mm-seats">${s.players.filter((p) => p.connected).map((p) => `
          <div class="mm-seat ${g.race.tapped.includes(p.id) ? 'turn' : ''}">${PB.avatar(p.id)}<span>${esc(p.name)}</span><b>${g.race.tapped.includes(p.id) ? '✓' : '…'}</b></div>`).join('')}</div>`;
    },
    // On the TV: the shared parts of the screen.
    tvStage: '.kc-ring, .kc-card, .kc-cup, .kc-effects, .kc-broke, .mm-outright, .kc-tapped, .drink',
    render,
    sounds: (prev, s) => (s.game.card && JSON.stringify(s.game.card) !== JSON.stringify(prev.game.card) ? ['card'] : []),
    afterRender(s) {
      const ringEl = document.querySelector('#kc-ring.active');
      if (ringEl) {
        const choose = (e) => {
          const slot = slotAt(e, ringEl, s.game);
          if (slot !== null && slot !== picked) {
            picked = slot;
            showPick();
            navigator.vibrate?.(8);
          }
        };
        ringEl.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          dragging = true;
          ringEl.setPointerCapture(e.pointerId);
          choose(e);
        });
        ringEl.addEventListener('pointermove', (e) => dragging && choose(e));
        const lift = () => {
          dragging = false;
          if (missed) { missed = false; PB.rerender(); }
        };
        ringEl.addEventListener('pointerup', lift);
        ringEl.addEventListener('pointercancel', lift);
      }
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
