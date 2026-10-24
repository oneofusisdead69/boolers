// Screens for Horse Race. Server logic: games/horseRace.js
// The oval is an SVG. While the race runs the screen isn't redrawn: each update slides the horses
// to their new spots (a short ease-out, so every push looks like a lurch) and refreshes the
// standings.
(() => {
  const { esc, name } = PB;
  // The racers come from the server (backers can rename and recolour them): drawn racehorses, or
  // with the Animals option, animals. These animals face left in both the iPhone and Android
  // emoji sets, so flipping them to run right works everywhere.
  const ANIMALS = { 1: '🐎', 2: '🐕', 3: '🐫', 4: '🐢', 5: '🐘', 6: '🦏' };
  let HORSES = [];
  let racers = 'horses';
  const horse = (id) => HORSES.find((h) => h.id === id);
  const emoji = (h) => ANIMALS[h.id];

  // A racehorse and jockey, side on and facing right, drawn round (0, 0) in about 40 × 30 units.
  // The legs swing from the hip (a CSS gallop while racing); silks are the racer's colour.
  const COATS = {
    bay: ['#7b4422', '#1c1410'], chestnut: ['#a3562c', '#6e3214'], black: ['#2a2626', '#0e0c0c'],
    grey: ['#a3a3a3', '#5f5f5f'], palomino: ['#d9a64a', '#f4e7c2'], white: ['#ececec', '#b9b9b9'],
  };
  const LEGS = [[-8, 'b far'], [7, 'f far'], [-10, 'b'], [5, 'f']];
  function horseSvg(h) {
    const [coat, mane] = COATS[h.coat] || COATS.bay;
    const leg = ([x, cls]) => `<g transform="translate(${x} 2)"><g class="hz-leg ${cls}">
      <path d="M -2 0 L 2 0 L 1.3 5.5 L 1 11 L -0.9 11 L -1.2 5.5 Z" fill="${cls.includes('far') ? mane : coat}"/><rect x="-1.3" y="10.3" width="2.8" height="1.8" rx="0.6" fill="#1a1a1a"/></g></g>`;
    return `<g class="hz-rh">
      ${LEGS.slice(0, 2).map(leg).join('')}
      <path d="M -11.5 -2 Q -18 -1 -19 7 Q -15.5 3 -12 1 Z" fill="${mane}"/>
      <ellipse cx="0" cy="0" rx="12" ry="5.8" fill="${coat}"/>
      <path d="M 6 -3.8 Q 8.5 -10 12.6 -13.4 L 16.8 -11.6 Q 13.2 -6.4 11.4 1.6 Z" fill="${coat}"/>
      <path d="M 12.2 -13.6 Q 15.5 -14.2 20.4 -9.4 Q 21.4 -8.2 20.2 -7.4 Q 18.6 -6.8 16.2 -8.4 L 13.8 -9.8 Z" fill="${coat}"/>
      <path d="M 13 -13.2 L 13.6 -16.4 L 15 -13.4 Z" fill="${coat}"/>
      <path d="M 6.4 -4.6 Q 8.8 -10.4 12.6 -13.6 L 11.2 -13.6 Q 7.6 -10.6 5 -5.6 Z" fill="${mane}"/>
      <circle cx="16.4" cy="-11.4" r="0.65" fill="#111"/>
      ${LEGS.slice(2).map(leg).join('')}
      <rect x="-6.4" y="-5.6" width="7.6" height="6" rx="1.2" fill="${h.color}" stroke="rgba(255,255,255,0.7)" stroke-width="0.5"/>
      <path d="M -1.6 -6.4 L 4 -10.4" stroke="${h.color}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 4.2 -9.8 L 9.2 -8.2" stroke="${h.color}" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M -2 -5.2 L 3.2 -4.2 L 1.2 -1.2" fill="none" stroke="#f4f4f4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 1.4 -1.6 L 0.6 -0.2" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
      <circle cx="6.4" cy="-11.6" r="2.1" fill="${h.color}"/>
      <path d="M 7.2 -10.4 Q 8.4 -10.6 8.6 -11.6" fill="none" stroke="#f1c6a0" stroke-width="1.1" stroke-linecap="round"/>
    </g>`;
  }
  let draft = null;
  let draftFor = null;
  // Styling the horse you backed: open or not, and the name being typed.
  const styling = { open: false, name: null, horse: null };
  const COAT_LABELS = { bay: 'Bay', chestnut: 'Chestnut', black: 'Black', grey: 'Grey', palomino: 'Palomino', white: 'White' };

  // ---------- Jockey dial ----------
  // A needle sweeps across a half circle: red at the edges, yellow, green in the middle. Tap to
  // stop it on a colour. It sweeps faster the faster your horse is going.
  const ZONES = [[14, 'green'], [40, 'yellow'], [90, 'red']]; // by distance from straight up, in degrees
  const zoneAt = (angle) => ZONES.find(([edge]) => Math.abs(angle) <= edge)[1];
  const dial = { angle: -90, dir: 1, last: 0, mult: 1, cooldown: 0, running: false };
  const needleSpeed = (mult) => 150 * mult ** 1.4; // degrees a second

  function dialHtml(g, myHorse) {
    const h = horse(myHorse);
    const arc = (from, to, color) => {
      const p = (deg) => {
        const r = ((deg - 90) * Math.PI) / 180;
        return `${(100 + 84 * Math.cos(r)).toFixed(1)} ${(100 + 84 * Math.sin(r)).toFixed(1)}`;
      };
      return `<path d="M ${p(from)} A 84 84 0 0 1 ${p(to)}" stroke="${color}"/>`;
    };
    return `
      <button class="hz-dial" id="hz-dial" aria-label="Tap when the needle is on green">
        <svg viewBox="0 0 200 116">
          <g class="hz-zones">
            ${arc(-90, -40, '#ff4d6d')}${arc(-40, -14, '#ffcc33')}${arc(-14, 14, '#3ddc97')}${arc(14, 40, '#ffcc33')}${arc(40, 90, '#ff4d6d')}
          </g>
          <g id="hz-needle" style="transform:rotate(${dial.angle}deg)"><line x1="100" y1="100" x2="100" y2="22"/><circle cx="100" cy="100" r="7"/></g>
        </svg>
        <span class="hz-dial-info">${chip(h)} <b id="hz-mult">×${g.mult[myHorse].toFixed(2)}</b> <small>Tap on green!</small></span>
      </button>`;
  }

  function runDial() {
    if (dial.running) return;
    dial.running = true;
    dial.last = performance.now();
    const frame = (now) => {
      const needle = document.getElementById('hz-needle');
      if (!needle) { dial.running = false; return; }
      const dt = Math.min(0.05, (now - dial.last) / 1000);
      dial.last = now;
      dial.angle += dial.dir * needleSpeed(dial.mult) * dt;
      if (dial.angle > 90) { dial.angle = 90; dial.dir = -1; }
      if (dial.angle < -90) { dial.angle = -90; dial.dir = 1; }
      needle.style.transform = `rotate(${dial.angle}deg)`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function tapDial(btn) {
    const now = performance.now();
    if (now < dial.cooldown) return;
    dial.cooldown = now + 280;
    const hit = zoneAt(dial.angle);
    PB.act('ride', { hit });
    navigator.vibrate?.(hit === 'green' ? 20 : hit === 'red' ? [40, 30, 40] : 10);
    btn.dataset.hit = hit;
    clearTimeout(tapDial.t);
    tapDial.t = setTimeout(() => delete btn.dataset.hit, 250);
  }

  // ---------- Track geometry ----------
  // A stadium shape: two straights joined by half circles. Lane i runs at radius LANE0 + i * LANE_W
  // from the two curve centres. Distance is measured from the finish line (middle of the bottom
  // straight), anticlockwise on screen.
  const W = 414;
  const H = 292;
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
  // Where a racer is drawn: `at` laps round, in lane i.
  const place = (at, i) => {
    const [x, y] = point(at, radius(i));
    return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
  };
  // Racehorses are drawn facing right and the animals face left: flip whichever way they run.
  const facing = (at, i) => {
    const r = radius(i);
    const right = point(at + 0.004, r)[0] > point(at, r)[0];
    const scale = racers === 'horses' ? (right ? 0.7 : -0.7) : (right ? -1 : 1);
    return racers === 'horses' ? `scale(${scale}, 0.7)` : `scaleX(${scale})`;
  };

  // ---------- Smooth running ----------
  // The server sends each horse's position and speed a few times a second. Between updates the
  // phone keeps every horse running at its last known speed, and blends each new position in
  // gently, so the motion is continuous at the phone's full frame rate. Horses never run backwards.
  const BLEND = 8; // how quickly the drawn position catches up with the predicted one (per second)
  const run = { race: null, at: {}, from: {}, vel: {}, t0: 0, tickMs: 300, going: false };
  const shown = (g, id) => (run.race === g.race && id in run.at ? run.at[id] : g.progress[id]);

  function follow(g) {
    if (run.race !== g.race) {
      run.race = g.race;
      run.at = { ...g.progress };
    }
    run.from = { ...g.progress };
    run.vel = { ...g.vel };
    run.t0 = performance.now();
    run.tickMs = g.tickMs;
    if (run.going) return;
    run.going = true;
    let last = performance.now();
    const frame = (now) => {
      const svg = document.getElementById('hz-track');
      if (!svg || !svg.classList.contains('running') || svg.dataset.race !== String(run.race)) { run.going = false; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Predict no further than two updates ahead, in case updates stall.
      const ahead = Math.min(now - run.t0, run.tickMs * 2) / 1000;
      const ease = 1 - Math.exp(-BLEND * dt);
      HORSES.forEach((h, i) => {
        const predicted = run.from[h.id] + (run.vel[h.id] || 0) * ahead;
        run.at[h.id] = Math.max(run.at[h.id], run.at[h.id] + (predicted - run.at[h.id]) * ease);
        const el = svg.querySelector(`[data-horse="${h.id}"]`);
        if (!el) return;
        el.style.transform = place(run.at[h.id], i);
        el.querySelector('.hz-face').style.transform = facing(run.at[h.id], i);
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

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
      <g class="hz-horse ${g.winner === h.id ? 'won' : ''}" data-horse="${h.id}" style="transform:${place(shown(g, h.id), i)}">
        <ellipse class="hz-shadow" cx="0" cy="10" rx="9" ry="2.6" style="animation-delay:-${(i * 0.06).toFixed(2)}s"/>
        <g class="hz-face" style="transform:${facing(shown(g, h.id), i)};animation-delay:-${(i * 0.06).toFixed(2)}s">${racers === 'horses'
          ? `<g class="hz-bob" style="animation-delay:-${(i * 0.06).toFixed(2)}s">${horseSvg(h)}</g>`
          : `<text class="hz-emoji" style="--hc:${h.color};animation-delay:-${(i * 0.06).toFixed(2)}s">${emoji(h)}</text>`}</g>
        <text class="hz-num" y="-15" style="fill:${h.color}">${h.id}</text>
      </g>`).join('');
    return `
      <div class="hz-wrap">
        <svg class="hz-track ${s.phase === 'race' ? 'running' : ''} ${racers}" id="hz-track" data-race="${g.race}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Race track">
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
  // The racer in lists: the animal and its number in its colour.
  const chip = (h) => `<span class="hz-chip">${racers === 'horses'
    ? `<svg class="hz-chip-h" viewBox="-20 -17 42 30">${horseSvg(h)}</svg>`
    : `<span class="hz-chip-a" style="--hc:${h.color}">${emoji(h)}</span>`}<b style="color:${h.color}">${h.id}</b></span>`;

  // Horses in race order, with who backed each.
  function standings(s) {
    const g = s.game;
    const order = HORSES.slice().sort((a, b) => g.progress[b.id] - g.progress[a.id]);
    return order.map((h, i) => `
      <div class="hz-stand ${g.winner === h.id ? 'won' : ''}">
        <b class="hz-pos">${i + 1}</b>${chip(h)}<span class="hz-name">${esc(h.name)}</span>
        ${g.jockey && s.phase !== 'betting' ? `<small class="hz-speed">×${g.mult[h.id].toFixed(1)}</small>` : ''}
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
        ${g.jockey ? '<p class="center muted">🏇 Jockey mode: one rider per horse. You\'ll steer yours with a dial.</p>' : ''}
        <div class="hz-pick">${HORSES.map((h) => {
          const takenBy = g.jockey && backers(s, h.id).find((id) => id !== s.me);
          return `
          <button class="${draft.horse === h.id ? 'selected' : ''}" data-hz="horse" data-horse="${h.id}" ${takenBy ? 'disabled' : ''}>
            ${chip(h)}<span>${esc(h.name)}</span>
            <small>${backers(s, h.id).map((id) => PB.avatar(id, 'sm')).join('')}</small>
          </button>`;
        }).join('')}</div>
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
      ${g.myBet ? stylePanel(s) : ''}
      ${missing.length ? `<p class="center muted">Still betting: ${missing.map((p) => esc(name(p.id))).join(', ')}</p>` : ''}
      ${s.isHost
        ? `<button data-act="startRace" ${anyBets ? '' : 'disabled'} ${missing.length ? `data-confirm="${missing.length} still betting. Start anyway?"` : ''}>${anyBets ? '🔔 Start the race' : 'Waiting for bets'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the race once everyone has bet</p>`}`;
  }

  // Rename and recolour the horse you've backed.
  function stylePanel(s) {
    const g = s.game;
    const h = horse(g.myBet.pick);
    if (styling.horse !== h.id) { styling.horse = h.id; styling.name = null; }
    if (!styling.open) {
      return `<button class="secondary hz-style-open" data-hz="style-open">${chip(h)} ✏️ Name and colours for ${esc(h.name)}</button>`;
    }
    const taken = (c) => HORSES.some((x) => x.id !== h.id && x.silk === c);
    return `
      <div class="card hz-style">
        <div class="hz-style-head">${chip(h)}<h2>Your horse</h2><button class="link" data-hz="style-close">Done</button></div>
        <div class="hz-style-name">
          <input id="hz-name" maxlength="16" value="${esc(styling.name ?? h.name)}" placeholder="Name" autocomplete="off">
          <button data-hz="style-name">Rename</button>
        </div>
        <h3>Jockey silks</h3>
        <div class="hz-swatches">${g.silks.map((c) => `
          <button class="hz-swatch ${h.silk === c ? 'on' : ''}" style="background:${c}" data-hz="style-silk" data-silk="${c}" ${taken(c) ? 'disabled' : ''} aria-label="Silks colour"></button>`).join('')}</div>
        <h3>Coat</h3>
        <div class="hz-coats">${g.coats.map((c) => `
          <button class="${h.coat === c ? 'on' : ''}" data-hz="style-coat" data-coat="${c}"><span style="background:${COATS[c][0]}"></span>${COAT_LABELS[c]}</button>`).join('')}</div>
      </div>`;
  }

  function raceScreen(s) {
    const g = s.game;
    const riding = g.jockey && g.myBet?.pick;
    if (riding) dial.mult = g.mult[riding];
    return `
      <div class="turn">🏇 Race ${g.race}<span>${riding ? `You're riding ${esc(horse(riding).name)}!` : 'And they\'re off!'}</span></div>
      ${track(s)}
      ${riding ? dialHtml(g, riding) : ''}
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
    follow(g);
    document.getElementById('hz-laps').textContent = lapText(g);
    const st = document.getElementById('hz-standings');
    if (st) st.innerHTML = standings(s);
    const riding = g.jockey && g.myBet?.pick;
    if (riding) {
      dial.mult = g.mult[riding];
      const m = document.getElementById('hz-mult');
      if (m) m.textContent = `×${dial.mult.toFixed(2)}`;
    }
    return true;
  }

  PB.register('horseRace', {
    // Sideways: these go on the left.
    stage: '.hz-wrap',
    // On the TV: the track and the standings; while betting, who's backing which horse.
    tvStage: '.hz-wrap, .hz-standings, .drink, .ar-bets, .ar-give, .center.muted',
    // No table on the TV: just a big track, with the horses' names down the left.
    tvTable: false,
    tvLeft: '.hz-winner, .hz-standings, .ar-bets, .ar-give, .center.muted',
    tv(s) {
      if (s.phase !== 'betting') return undefined;
      const g = s.game;
      racers = g.racers;
      HORSES = g.horses.map((h) => ({ ...h, color: h.silk }));
      return `
        ${track(s)}
        <div class="card hz-standings">${HORSES.map((h) => {
          const ids = backers(s, h.id);
          return `<div class="hz-stand">${chip(h)}<span class="hz-name">${esc(h.name)}</span>
            <span class="hz-backers">${ids.map((id) => `${PB.avatar(id, 'sm')} <b>${g.bets[id].sips}</b>`).join(' ')}</span></div>`;
        }).join('')}</div>
        <p class="center muted">Place your bets on your phones · ${g.laps} lap${g.laps === 1 ? '' : 's'}</p>`;
    },
    sounds(prev, s) {
      if (s.game.winner && !prev.game.winner) return ['win'];
      return s.phase === 'race' && prev.phase !== 'race' ? ['bell'] : [];
    },
    render(s) {
      racers = s.game.racers;
      HORSES = s.game.horses.map((h) => ({ ...h, color: h.silk }));
      // Don't redraw under someone naming their horse.
      if (document.activeElement?.id === 'hz-name' && s.phase === 'betting') return null;
      if (s.phase === 'race' && document.getElementById('hz-standings') && moveHorses(s)) return null;
      if (s.phase === 'betting') return bettingScreen(s);
      if (s.phase === 'race') return raceScreen(s);
      if (s.phase === 'payout' || s.phase === 'results') return finishScreen(s);
      return '';
    },
    afterRender(s) {
      const dialBtn = document.getElementById('hz-dial');
      if (s.phase === 'race') follow(s.game);
      if (dialBtn) {
        dialBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); tapDial(dialBtn); });
        runDial();
      }
      document.getElementById('hz-name')?.addEventListener('input', (e) => { styling.name = e.target.value; });
      document.getElementById('hz-name')?.addEventListener('keydown', (e) => e.key === 'Enter' && document.querySelector('[data-hz="style-name"]').click());
      document.querySelectorAll('[data-hz]').forEach((b) => {
        b.onclick = () => {
          const what = b.dataset.hz;
          if (what === 'horse') draft.horse = b.dataset.horse;
          else if (what === 'sips') draft.sips = Math.min(s.game.maxBet, Math.max(1, draft.sips + Number(b.dataset.step)));
          else if (what === 'style-open') styling.open = true;
          else if (what === 'style-close') styling.open = false;
          else if (what === 'style-name') {
            const name = document.getElementById('hz-name').value.trim();
            if (name) PB.act('style', { name });
            styling.name = null;
            return;
          } else if (what === 'style-silk') return PB.act('style', { silk: b.dataset.silk });
          else if (what === 'style-coat') return PB.act('style', { coat: b.dataset.coat });
          PB.rerender();
        };
      });
    },
  });
})();
