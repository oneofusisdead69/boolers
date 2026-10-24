// Screens for Horse Race. Server logic: games/horseRace.js
// The oval is an SVG. While the race runs the screen isn't redrawn: each update slides the horses
// to their new spots (a short ease-out, so every push looks like a lurch) and refreshes the
// standings.
(() => {
  const { esc, name } = PB;
  const HORSES = [
    { id: '1', name: 'Thunder', color: '#e53950' },
    { id: '2', name: 'Lucky Lager', color: '#3d7cff' },
    { id: '3', name: 'Tipsy Tina', color: '#f5c518' },
    { id: '4', name: 'Last Call', color: '#2fbf71' },
    { id: '5', name: 'Hangover Hank', color: '#9b5cff' },
    { id: '6', name: 'Jägerbomb', color: '#ff8a1f' },
  ];
  const horse = (id) => HORSES.find((h) => h.id === id);
  let draft = null;
  let draftFor = null;

  // ---------- Track geometry ----------
  // A stadium shape: two straights joined by half circles. Lane i runs at radius LANE0 + i * LANE_W
  // from the two curve centres. Distance is measured from the finish line (middle of the bottom
  // straight), anticlockwise on screen.
  const W = 414;
  const H = 274;
  const CX = W / 2;
  const CY = H / 2;
  const HALF = 68; // half the length of a straight
  const LANE0 = 50;
  const LANE_W = 14;
  const radius = (lane) => LANE0 + lane * LANE_W;

  function point(t, r) {
    const L = 4 * HALF + 2 * Math.PI * r;
    let s = (((t % 1) + 1) % 1) * L;
    if (s < HALF) return [CX + s, CY + r];
    s -= HALF;
    if (s < Math.PI * r) return [CX + HALF + r * Math.sin(s / r), CY + r * Math.cos(s / r)];
    s -= Math.PI * r;
    if (s < 2 * HALF) return [CX + HALF - s, CY - r];
    s -= 2 * HALF;
    if (s < Math.PI * r) return [CX - HALF - r * Math.sin(s / r), CY - r * Math.cos(s / r)];
    s -= Math.PI * r;
    return [CX - HALF + s, CY + r];
  }

  const stadium = (r) => `M ${CX - HALF} ${CY + r} H ${CX + HALF} A ${r} ${r} 0 0 0 ${CX + HALF} ${CY - r} H ${CX - HALF} A ${r} ${r} 0 0 0 ${CX - HALF} ${CY + r} Z`;
  const place = (g, i, id) => {
    const [x, y] = point(g.progress[id], radius(i));
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };

  function track(s) {
    const g = s.game;
    const inner = radius(0) - LANE_W / 2 - 2;
    const outer = radius(HORSES.length - 1) + LANE_W / 2 + 2;
    const mid = (inner + outer) / 2;
    const dividers = HORSES.slice(1).map((_, i) => `<path d="${stadium(radius(i) + LANE_W / 2)}" class="hz-divider"/>`).join('');
    // The finish line: a checkered strip across all the lanes.
    const checks = [];
    for (let y = CY + inner, row = 0; y < CY + outer; y += 5, row++) {
      for (let col = 0; col < 2; col++) checks.push(`<rect x="${CX - 5 + col * 5}" y="${y}" width="5" height="5" fill="${(row + col) % 2 ? '#111' : '#fff'}"/>`);
    }
    const tokens = HORSES.map((h, i) => `
      <g class="hz-horse ${g.winner === h.id ? 'won' : ''}" data-horse="${h.id}" style="transform:${place(g, i, h.id)};transition-duration:${g.tickMs}ms">
        <circle r="12" fill="${h.color}"/>
        <text y="0.5">${h.id}</text>
      </g>`).join('');
    return `
      <div class="hz-wrap">
        <svg class="hz-track" id="hz-track" data-race="${g.race}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Race track">
          <path d="${stadium(mid)}" class="hz-dirt" style="stroke-width:${outer - inner}"/>
          <path d="${stadium(inner - 3)}" class="hz-infield"/>
          ${dividers}
          ${checks.join('')}
          <text x="${CX}" y="${CY + 4}" class="hz-laps" id="hz-laps">${lapText(g)}</text>
          ${tokens}
        </svg>
      </div>`;
  }

  const lapOf = (g, id) => Math.min(g.laps, Math.floor(g.progress[id]) + 1);
  const leader = (g) => HORSES.map((h) => h.id).reduce((a, b) => (g.progress[b] > g.progress[a] ? b : a));
  const lapText = (g) => (g.winner ? `🏆 ${horse(g.winner).name}` : g.ticks ? `Lap ${lapOf(g, leader(g))} of ${g.laps}` : `${g.laps} lap${g.laps === 1 ? '' : 's'}`);

  const backers = (s, id) => Object.entries(s.game.bets).filter(([, b]) => b.pick === id).map(([pid]) => pid);
  const chip = (h) => `<span class="hz-chip" style="background:${h.color}">${h.id}</span>`;

  // Horses in race order, with who backed each.
  function standings(s) {
    const g = s.game;
    const order = HORSES.slice().sort((a, b) => g.progress[b.id] - g.progress[a.id]);
    return order.map((h, i) => `
      <div class="hz-stand ${g.winner === h.id ? 'won' : ''}">
        <b class="hz-pos">${i + 1}</b>${chip(h)}<span class="hz-name">${esc(h.name)}</span>
        <span class="hz-backers">${backers(s, h.id).map((id) => PB.avatar(id, 'sm')).join('')}</span>
      </div>`).join('');
  }

  // ---------- Screens ----------

  function bettingScreen(s) {
    const g = s.game;
    if (draftFor !== g.race) { draft = { horse: g.myBet?.pick || null, sips: g.myBet?.sips || 1 }; draftFor = g.race; }
    const changed = !g.myBet || g.myBet.pick !== draft.horse || g.myBet.sips !== draft.sips;
    const missing = s.players.filter((p) => p.connected && !g.bets[p.id]);
    const anyBets = Object.keys(g.bets).length > 0;
    return `
      <div class="turn">🏇 Race ${g.race}<span>Place your bets · ${g.laps} lap${g.laps === 1 ? '' : 's'}</span></div>
      ${track(s)}
      <div class="card hz-place">
        <div class="hz-pick">${HORSES.map((h) => `
          <button class="${draft.horse === h.id ? 'selected' : ''}" data-hz="horse" data-horse="${h.id}">
            ${chip(h)}<span>${esc(h.name)}</span>
            <small>${backers(s, h.id).map((id) => PB.avatar(id, 'sm')).join('')}</small>
          </button>`).join('')}</div>
        <div class="ld-qty">
          <button class="secondary" data-hz="sips" data-step="-1" ${draft.sips <= 1 ? 'disabled' : ''}>−</button>
          <b>${draft.sips}</b>
          <button class="secondary" data-hz="sips" data-step="1" ${draft.sips >= g.maxBet ? 'disabled' : ''}>+</button>
        </div>
        <button data-act="bet" data-horse="${draft.horse || ''}" data-sips="${draft.sips}" ${draft.horse && changed ? '' : 'disabled'}>
          ${!draft.horse ? 'Pick a horse' : !changed
            ? `✓ ${PB.plural(g.myBet.sips, 'sip')} on ${esc(horse(g.myBet.pick).name)}`
            : `Bet ${PB.plural(draft.sips, 'sip')} on ${esc(horse(draft.horse).name)}`}
        </button>
        <p class="center muted">Lose: drink your bet. Win: hand out ${g.multiplier === 2 ? 'double it' : 'your bet'}.</p>
      </div>
      ${missing.length ? `<p class="center muted">Still betting: ${missing.map((p) => esc(name(p.id))).join(', ')}</p>` : ''}
      ${s.isHost
        ? `<button data-act="startRace" ${anyBets ? '' : 'disabled'} ${missing.length ? `data-confirm="${missing.length} still betting. Start anyway?"` : ''}>${anyBets ? '🔔 Start the race' : 'Waiting for bets'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the race once everyone has bet</p>`}`;
  }

  function raceScreen(s) {
    return `
      <div class="turn">🏇 Race ${s.game.race}<span>And they're off!</span></div>
      ${track(s)}
      <div class="card hz-standings" id="hz-standings">${standings(s)}</div>`;
  }

  function finishScreen(s) {
    const g = s.game;
    const h = horse(g.winner);
    const winners = backers(s, g.winner);
    return `
      <div class="drink win hz-winner" style="--hc:${h.color}"><div class="big">${chip(h)} ${esc(h.name)} wins!</div>
        <div class="sips">${winners.length ? `Backed by ${winners.map((id) => esc(name(id))).join(', ')}` : 'Nobody backed them. Everyone drinks!'}</div></div>
      ${s.phase === 'payout' ? PB.handOut(s, `hz${g.race}`) : PB.raceDrinks(s)}
      ${s.isHost
        ? `<button data-act="nextRace" ${s.phase === 'payout' ? 'class="secondary" data-confirm="Some winners haven\'t handed out their sips. Start the next race anyway?"' : ''}>Next race</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the next race…</p>`}
      ${track(s)}
      <div class="card hz-standings">${standings(s)}</div>
      ${PB.feed(4)}`;
  }

  // Mid-race updates move the horses in place instead of redrawing the screen.
  function moveHorses(s) {
    const g = s.game;
    const svg = document.getElementById('hz-track');
    if (!svg || svg.dataset.race !== String(g.race)) return false;
    HORSES.forEach((h, i) => {
      const el = svg.querySelector(`[data-horse="${h.id}"]`);
      if (el) el.style.transform = place(g, i, h.id);
    });
    document.getElementById('hz-laps').textContent = lapText(g);
    const st = document.getElementById('hz-standings');
    if (st) st.innerHTML = standings(s);
    return true;
  }

  PB.register('horseRace', {
    sounds(prev, s) {
      if (s.game.winner && !prev.game.winner) return ['win'];
      return s.phase === 'race' && prev.phase !== 'race' ? ['bell'] : [];
    },
    render(s) {
      if (s.phase === 'race' && document.getElementById('hz-standings') && moveHorses(s)) return null;
      if (s.phase === 'betting') return bettingScreen(s);
      if (s.phase === 'race') return raceScreen(s);
      if (s.phase === 'payout' || s.phase === 'results') return finishScreen(s);
      return '';
    },
    afterRender(s) {
      document.querySelectorAll('[data-hz]').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.hz === 'horse') draft.horse = b.dataset.horse;
          else draft.sips = Math.min(s.game.maxBet, Math.max(1, draft.sips + Number(b.dataset.step)));
          PB.rerender();
        };
      });
    },
  });
})();
