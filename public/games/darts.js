// Screens for Darts. Server logic: games/darts.js
//
// The thrower drags on the throwing pad to move the crosshair, then flicks up to throw. The flick's
// lean and power go to the server, which works out where the dart lands. The board is on every
// phone, or only on the TV when there is one.
(() => {
  const { esc, name } = PB;
  // Same board as the server (games/darts.js).
  const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const R = { bull: 6.35 / 170, outerBull: 15.9 / 170, tripleIn: 99 / 170, tripleOut: 107 / 170, doubleIn: 162 / 170 };
  const CRICKET = [20, 19, 18, 17, 16, 15, 25];
  // A perfect flick crosses this many screen heights per second.
  const IDEAL_SPEED = 2.5;

  // What the crosshair is over, for the "Aiming at T20" readout.
  function label(x, y) {
    const r = Math.hypot(x, y);
    if (r > 1) return 'Off the board';
    if (r <= R.bull) return 'Bull';
    if (r <= R.outerBull) return '25';
    const deg = (Math.atan2(x, -y) * 180) / Math.PI;
    const n = SECTORS[Math.floor((((deg + 9) % 360) + 360) % 360 / 18)];
    if (r > R.doubleIn) return `D${n}`;
    if (r > R.tripleIn && r <= R.tripleOut) return `T${n}`;
    return `${n}`;
  }

  // ---------- The board ----------

  const pt = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return `${(Math.sin(a) * r).toFixed(4)} ${(-Math.cos(a) * r).toFixed(4)}`;
  };
  // A ring segment between radii r0 and r1, from angle a0 to a1 (degrees clockwise from the top).
  const wedge = (r0, r1, a0, a1, fill) =>
    `<path d="M${pt(r0, a0)} L${pt(r1, a0)} A${r1} ${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z" fill="${fill}"/>`;

  let boardFace = null;
  function face() {
    if (boardFace) return boardFace;
    const parts = ['<circle r="1.32" fill="#141414"/>'];
    SECTORS.forEach((n, i) => {
      const a0 = i * 18 - 9;
      const a1 = a0 + 18;
      const single = i % 2 ? '#efdcb4' : '#1c1c1c';
      const ring = i % 2 ? '#1d8f4e' : '#d3262e';
      parts.push(
        wedge(R.doubleIn, 1, a0, a1, ring),
        wedge(R.tripleOut, R.doubleIn, a0, a1, single),
        wedge(R.tripleIn, R.tripleOut, a0, a1, ring),
        wedge(R.outerBull, R.tripleIn, a0, a1, single),
        `<text x="${(Math.sin((i * 18 * Math.PI) / 180) * 1.14).toFixed(3)}" y="${(-Math.cos((i * 18 * Math.PI) / 180) * 1.14).toFixed(3)}">${n}</text>`,
      );
    });
    parts.push(`<circle r="${R.outerBull}" fill="#1d8f4e"/><circle r="${R.bull}" fill="#d3262e"/>`);
    // The wires.
    parts.push(`<g class="dt-wire">${[R.outerBull, R.tripleIn, R.tripleOut, R.doubleIn, 1].map((r) => `<circle r="${r}"/>`).join('')}
      ${SECTORS.map((_, i) => `<path d="M${pt(R.outerBull, i * 18 - 9)} L${pt(1, i * 18 - 9)}"/>`).join('')}</g>`);
    boardFace = parts.join('');
    return boardFace;
  }

  // A dart stuck in the board: the tip at (x, y), the barrel and flights back towards the thrower.
  function dart(d, color, isNew) {
    const x = d.x.toFixed(3);
    const y = d.y.toFixed(3);
    const at = (k) => `${(d.x + 0.09 * k).toFixed(3)} ${(d.y + 0.13 * k).toFixed(3)}`;
    return `<g class="dt-dart ${isNew ? 'new' : ''}" style="transform-origin:${x}px ${y}px">
      <path d="M${x} ${y} L${at(1)}" stroke="#e6e6e6" stroke-width="0.03" stroke-linecap="round"/>
      <path d="M${at(1)} L${at(1.7)}" stroke="${esc(color)}" stroke-width="0.075" stroke-linecap="round"/>
      <circle cx="${x}" cy="${y}" r="0.018" fill="#fff" stroke="#000" stroke-width="0.006"/>
    </g>`;
  }

  const aimMark = (aim) => `<g id="dt-aim" class="dt-aim" ${aim ? '' : 'style="display:none"'} transform="translate(${aim ? `${aim.x} ${aim.y}` : '0 0'})">
    <circle r="0.075"/><path d="M-0.13 0H-0.04M0.04 0H0.13M0 -0.13V-0.04M0 0.04V0.13"/></g>`;

  // How many darts of this turn the board has already shown (new ones drop in).
  let shownDarts = { key: '', count: 0 };

  function board(s) {
    const g = s.game;
    const key = `${g.throwerId}:${g.round}:${g.lastTurn ? g.lastTurn.id : ''}`;
    const seen = shownDarts.key === key ? shownDarts.count : 0;
    shownDarts = { key, count: g.darts.length };
    const color = PB.look(g.throwerId).color;
    const aim = g.throwerId === s.me && !PB.isTV ? localAim(s) : g.aim;
    return `<svg class="dt-board" id="dt-board" viewBox="-1.32 -1.32 2.64 2.64" aria-label="Dartboard">
      ${face()}
      ${g.darts.map((d, i) => dart(d, color, i >= seen)).join('')}
      ${aimMark(s.phase === 'throwing' ? aim : null)}
    </svg>`;
  }

  // ---------- Scores ----------

  const MARKS = ['', '/', '✕', 'Ⓧ'];

  function scores(s) {
    const g = s.game;
    const ids = g.order.filter((id) => s.players.some((p) => p.id === id));
    const row = (id, cells) => `<tr class="${id === g.throwerId && s.phase !== 'over' ? 'up' : ''}">
      <td class="dt-who">${PB.avatar(id, 'sm')}<span>${esc(name(id))}</span></td>${cells}</tr>`;
    let head;
    let rows;
    if (g.mode === 'drinking') {
      head = `<h2>Round ${g.round} of ${g.rounds}</h2>`;
      rows = `<tr><th></th><th>Round</th><th>Total</th></tr>${ids.map((id) => row(id,
        `<td>${g.roundScores[id] ?? (id === g.throwerId && s.phase === 'throwing' ? g.turnScore : '–')}</td><td><b>${(g.total[id] || 0) + (g.roundEnd ? 0 : g.roundScores[id] || 0)}</b></td>`)).join('')}`;
    } else if (g.mode === 'x01') {
      head = `<h2>${g.start}${g.doubleOut ? ' · double out' : ''}</h2>`;
      rows = ids.map((id) => row(id, `<td><b class="dt-big">${g.left[id]}</b></td>`)).join('');
    } else if (g.mode === 'clock') {
      head = '<h2>Around the clock</h2>';
      rows = ids.map((id) => row(id, `<td>${g.target[id] > 21 ? '✓' : `next <b class="dt-big">${g.target[id] === 21 ? 'Bull' : g.target[id]}</b>`}</td>`)).join('');
    } else {
      head = '<h2>Cricket</h2>';
      rows = `<tr><th></th>${CRICKET.map((n) => `<th>${n === 25 ? 'B' : n}</th>`).join('')}<th>Pts</th></tr>${ids.map((id) => row(id,
        `${CRICKET.map((n) => `<td class="dt-mark ${g.marks[id][n] >= 3 ? 'closed' : ''}">${MARKS[Math.min(3, g.marks[id][n])]}</td>`).join('')}<td><b>${g.points[id]}</b></td>`)).join('')}`;
    }
    return `<div class="card dt-scores">${head}<table>${rows}</table></div>`;
  }

  // The darts of the current (or just-finished) turn.
  function turnStrip(s) {
    const g = s.game;
    const darts = s.phase === 'throwing' ? g.darts : g.lastTurn?.darts || g.darts;
    const slots = [0, 1, 2].map((i) => {
      const d = darts[i];
      return `<span class="dt-slot ${d ? '' : 'empty'} ${d && !d.seg.n ? 'miss' : ''}">${d ? esc(d.seg.label) : '·'}</span>`;
    }).join('');
    const note = s.phase !== 'throwing' && g.lastTurn?.note === 'bust' ? '<b class="dt-note bust">BUST</b>'
      : g.mode === 'x01' || g.mode === 'drinking' ? `<b class="dt-note">${s.phase === 'throwing' ? g.turnScore : g.lastTurn?.total ?? ''}</b>` : '';
    return `<div class="dt-turn">${slots}${note}</div>`;
  }

  // ---------- Throwing ----------

  // Hard mode keeps quiet about what you're aiming at.
  const aimText = (g, aim) => (g.hard ? 'Hard mode: no aim readout' : `Aiming at ${label(aim.x, aim.y)}`);

  // The thrower's crosshair lives on their phone; the server just hears about it.
  let aimState = { key: '', x: 0, y: 0 };
  function localAim(s) {
    const key = `${s.game.throwerId}:${s.game.round}`;
    if (aimState.key !== key) aimState = { key, x: s.game.aim?.x ?? 0, y: s.game.aim?.y ?? -0.3 };
    return aimState;
  }
  let feedback = '';

  function pad(s, big) {
    return `<div class="dt-pad ${big ? 'big' : ''}" id="dt-pad">
      <p class="dt-hint">Drag to aim · flick up to throw</p>
      <p class="dt-readout" id="dt-readout">${esc(feedback || aimText(s.game, localAim(s)))}</p>
      <svg class="dt-held" id="dt-held" viewBox="0 0 40 140" aria-hidden="true">
        <path d="M20 0 L23 28 L17 28Z" fill="#ddd"/>
        <rect x="15" y="28" width="10" height="44" rx="4" fill="#9aa0a6"/>
        <rect x="18" y="72" width="4" height="30" fill="#666"/>
        <path d="M20 96 L36 134 L20 124 L4 134Z" fill="${esc(PB.look(s.me).color)}"/>
      </svg>
    </div>`;
  }

  let lastSent = 0;
  function sendAim(force) {
    const now = Date.now();
    if (!force && now - lastSent < 90) return;
    lastSent = now;
    PB.act('aim', { x: +aimState.x.toFixed(3), y: +aimState.y.toFixed(3) });
  }

  function showAim() {
    const mark = document.getElementById('dt-aim');
    if (mark) {
      mark.style.display = '';
      mark.setAttribute('transform', `translate(${aimState.x} ${aimState.y})`);
    }
    const readout = document.getElementById('dt-readout');
    if (readout) readout.textContent = aimText(PB.state.game, aimState);
  }

  function setupPad() {
    const el = document.getElementById('dt-pad');
    const held = document.getElementById('dt-held');
    if (!el) return;
    let hist = [];
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      start = { x: e.clientX, y: e.clientY, ax: aimState.x, ay: aimState.y };
      hist = [{ t: e.timeStamp, x: e.clientX, y: e.clientY, ax: aimState.x, ay: aimState.y }];
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      // Dragging across the pad's width sweeps the crosshair across the whole board.
      const scale = 2.4 / el.clientWidth;
      aimState.x = Math.max(-1.3, Math.min(1.3, start.ax + (e.clientX - start.x) * scale));
      aimState.y = Math.max(-1.3, Math.min(1.3, start.ay + (e.clientY - start.y) * scale));
      hist.push({ t: e.timeStamp, x: e.clientX, y: e.clientY, ax: aimState.x, ay: aimState.y });
      if (hist.length > 40) hist.shift();
      if (held) held.style.transform = `translate(${e.clientX - start.x}px, ${Math.min(0, e.clientY - start.y) * 0.3}px)`;
      feedback = '';
      showAim();
      sendAim(false);
    });
    const release = (e) => {
      if (!start) return;
      start = null;
      const now = e.timeStamp;
      const end = hist[hist.length - 1];
      // The flick: the last ~90ms of movement.
      const from = hist.find((h) => h.t >= now - 90) || hist[0];
      const dt = Math.max(1, end.t - from.t);
      const vx = (end.x - from.x) / dt;
      const vy = (end.y - from.y) / dt;
      const up = from.y - end.y;
      if (vy < -0.5 && up > 30) {
        // Aim where the crosshair was before the flick started moving it.
        let i = hist.length - 1;
        while (i > 0 && hist[i].y < hist[i - 1].y - 2) i--;
        aimState.x = hist[i].ax;
        aimState.y = hist[i].ay;
        const angle = (Math.atan2(vx, -vy) * 180) / Math.PI;
        const speed = (-vy * 1000) / window.innerHeight / IDEAL_SPEED;
        feedback = flickNote(angle, speed);
        if (held) {
          held.style.transition = 'transform 0.25s ease-in, opacity 0.25s';
          held.style.transform = `translate(${vx * 60}px, -${el.clientHeight}px) scale(0.4)`;
          held.style.opacity = '0';
        }
        PB.act('throw', { x: +aimState.x.toFixed(3), y: +aimState.y.toFixed(3), angle: +angle.toFixed(1), speed: +speed.toFixed(3) });
      } else {
        if (held) held.style.transform = '';
        sendAim(true);
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  // How the last flick went, so you can learn the throw.
  function flickNote(angle, speed) {
    const power = Math.round(speed * 100);
    const lean = Math.abs(angle) > 3 ? `, leaning ${Math.round(Math.abs(angle))}° ${angle > 0 ? 'right' : 'left'}` : ', dead straight';
    const how = Math.abs(speed - 1) < 0.08 ? 'Perfect power' : speed < 1 ? `Too soft (${power}%)` : `Too hard (${power}%)`;
    return `${how}${lean}`;
  }

  // ---------- Screens ----------

  function subtitle(s) {
    const g = s.game;
    if (g.mode === 'x01') return `${g.left[g.throwerId]} left`;
    if (g.mode === 'clock') return g.target[g.throwerId] === 21 ? 'Going for the bull' : `Going for ${g.target[g.throwerId]}`;
    if (g.mode === 'drinking') return `Round ${g.round} of ${g.rounds}`;
    return `${g.points[g.throwerId]} points`;
  }

  function middle(s) {
    const g = s.game;
    if (s.phase === 'give') {
      const mine = g.give.from === s.me;
      return mine
        ? `<div class="card"><p class="center"><b>${esc(g.give.reason[0].toUpperCase() + g.give.reason.slice(1))}! Give ${PB.plural(g.give.sips, 'sip')}</b> to…</p>${PB.playerPicker('give', { exclude: [s.me] })}</div>`
        : `<p class="center muted dt-wait">${esc(name(g.give.from))} hit ${esc(g.give.reason)} and is handing out ${PB.plural(g.give.sips, 'sip')}…</p>`;
    }
    if (s.phase === 'roundEnd') {
      const r = g.roundEnd;
      return `<div class="card dt-round"><h2>Round ${r.round} done</h2>
        <p>${r.losers.length ? `Lowest: <b>${r.losers.map((id) => esc(name(id))).join(' & ')}</b> (${r.scores[r.losers[0]]}) drink${r.losers.length === 1 ? 's' : ''} ${PB.plural(g.sips, 'sip')}` : 'Nobody to beat this round'}</p>
        ${PB.timer()}</div>`;
    }
    return '';
  }

  function overScreen(s, { tv = false } = {}) {
    const g = s.game;
    return `
      <div class="drink win dt-win"><div class="big">🎯 ${g.winnerId === s.me && !PB.passAndPlay ? 'You win!' : `${esc(name(g.winnerId))} wins!`}</div>
        <div class="sips">Everyone else drinks ${PB.plural(g.sips, 'sip')}</div></div>
      ${tv || s.tv ? '' : board(s)}
      ${tv ? scores(s).replace('card dt-scores', 'card dt-final') : scores(s)}
      ${tv ? '' : PB.feed(5)}`;
  }

  function render(s) {
    const g = s.game;
    if (s.phase === 'over') return overScreen(s);
    const thrower = g.throwerId === s.me && s.phase === 'throwing' && !PB.isTV;
    // With a TV, the board is on the TV; phones keep the throwing pad and the scores.
    const showBoard = PB.isTV || !s.tv;
    const turn = s.phase === 'give' ? PB.turn(g.give.from, 'Handing out sips') : PB.turn(g.throwerId, subtitle(s));
    return `
      ${turn}
      ${showBoard ? board(s) : ''}
      ${turnStrip(s)}
      ${thrower ? pad(s, !showBoard) : ''}
      ${middle(s)}
      ${scores(s)}
      ${thrower ? '' : PB.feed(3)}`;
  }

  // Aiming updates arrive several times a second; they just move the crosshair rather than
  // redrawing everything (which would also interrupt the thrower's drag).
  let lastKey = '';
  function keyOf(s) {
    return JSON.stringify([s.phase, s.tv, PB.landscape(), { ...s.game, aim: null }, s.players.map((p) => [p.id, p.connected, p.drinks])]);
  }

  PB.register('darts', {
    // Sideways: the board on the left.
    stage: '.dt-board',
    // On the TV: no table, just a big board with the scores down the left.
    tvTable: false,
    tvStage: '.dt-board, .dt-turn, .dt-wait, .dt-round, .dt-scores, .drink',
    tvLeft: '.dt-scores, .dt-round',
    // At the end, the TV shows the winner and the final scores in the middle.
    tv(s) {
      if (s.phase !== 'over') return undefined;
      return overScreen(s, { tv: true });
    },
    // The general rules, plus the ones for this mode.
    tvRules(s, rules) {
      const mode = { drinking: 'Drinking darts', x01: '301/501', clock: 'Around the clock', cricket: 'Cricket' }[s.game.mode];
      return rules.filter((r, i) => i < 2 || r.startsWith(mode));
    },
    // Thunk: a dart hit the board (or the wall).
    sounds: (prev, s) => (s.game.darts.length > prev.game.darts.length ? ['dart'] : []),
    render(s) {
      const key = keyOf(s);
      if (key === lastKey && document.getElementById('dt-board') && s.game.throwerId !== s.me) {
        const mark = document.getElementById('dt-aim');
        const aim = s.game.aim;
        if (mark && aim && s.phase === 'throwing') {
          mark.style.display = '';
          mark.setAttribute('transform', `translate(${aim.x} ${aim.y})`);
        }
        return null;
      }
      if (key === lastKey && document.getElementById('dt-pad')) return null;
      lastKey = key;
      return render(s);
    },
    afterRender(s) {
      if (s.game.throwerId === s.me && s.phase === 'throwing' && !PB.isTV) setupPad();
      else feedback = '';
    },
  });
})();
