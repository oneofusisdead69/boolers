// Screens for Beer Pong. Server logic: games/beerPong.js
//
// The table, top down, with a rack at each end (Team Red's at the bottom, Team Blue's at the top),
// is on every phone, or only on the TV when there is one. Whoever's throwing gets a close-up of the
// cups they're throwing at, with a crosshair, and the throwing pad: drag to aim, flick up to throw.
(() => {
  const { esc, name } = PB;
  // A perfect flick crosses this many screen heights per second (as in Darts).
  const IDEAL_SPEED = 2.5;

  // ---------- The table ----------
  // In the table's drawing (100 wide, 240 long) a rack's units are 50 to 1, its front row towards
  // the middle of the table. A rack's x runs left to right as the team throwing at it sees it.
  const S = 50;
  const toTable = (team, x, y) => (team === 0 ? { x: 50 - x * S, y: 176 + y * S } : { x: 50 + x * S, y: 64 - y * S });

  // A cup's colour is its owner's (each player's chosen colour); the team's if nobody has it.
  const colorOf = (c, g, team) => (c.owner && PB.state?.players.some((p) => p.id === c.owner) ? PB.look(c.owner).color : g.teams[team].color);
  const cup = (cx, cy, r, color, cls = '') => `<g class="bp-cup ${cls}" transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)})">
    <circle r="${r}" fill="${color}"/><circle r="${r * 0.8}" fill="#f4f4f4"/><circle r="${r * 0.66}" fill="#e8b84a"/><circle r="${r * 0.66}" fill="url(#bp-foam)" opacity="0.6"/></g>`;

  let shown = 0; // the last throw drawn landing
  function table(s) {
    const g = s.game;
    const r = g.cupR * S;
    const racks = g.cups.map((cups, t) => cups.map((c) => { const p = toTable(t, c.x, c.y); return cup(p.x, p.y, r, colorOf(c, g, t)); }).join('')).join('');
    let ball = '';
    const L = g.last;
    if (L) {
      const p = toTable(L.target, L.x, L.y);
      const from = L.team === 0 ? { x: 50, y: 236 } : { x: 50, y: 4 };
      const fresh = L.n !== shown;
      // The ball flies in from the thrower's end of the table (when it's new) and lands.
      ball = `<g class="bp-ball ${L.cup ? 'in' : 'out'}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">
        ${L.cup ? `<circle class="bp-splash ${fresh ? 'fresh' : ''}" r="${r * 1.6}"/>` : ''}
        <g class="bp-fly ${fresh ? 'fresh' : ''}" style="--fx:${(from.x - p.x).toFixed(1)}px;--fy:${(from.y - p.y).toFixed(1)}px"><circle r="2.4" fill="#fffdf4" stroke="#d8d0c0" stroke-width="0.5"/></g></g>`;
    }
    const aim = g.aim && s.phase === 'throwing' ? (() => { const p = toTable(1 - g.turnTeam, g.aim.x, g.aim.y); return `<g id="bp-aim-t" class="bp-aim" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})"><circle r="4"/><path d="M-6 0 H6 M0 -6 V6"/></g>`; })() : '';
    const label = (t, y) => `<text x="50" y="${y}" class="bp-label" style="fill:${g.teams[t].color}">Team ${esc(g.teams[t].name)} · ${g.cups[t].length}</text>`;
    return `<div class="bp-table-wrap"><svg class="bp-table" viewBox="0 0 100 240" role="img" aria-label="The beer pong table">
      <defs><radialGradient id="bp-foam"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0"/></radialGradient></defs>
      <rect x="1" y="1" width="98" height="238" rx="3" class="bp-top"/>
      <path d="M50 4 V236 M1 120 H99" class="bp-line"/>
      ${label(1, 92)}${label(0, 154)}
      ${racks}${aim}${ball}
    </svg></div>`;
  }

  // ---------- Throwing ----------
  // The thrower's close-up: the rack they're throwing at, front row at the bottom.
  let aimState = { key: '', x: 0, y: 0.3 };
  function localAim(s) {
    const key = `${s.game.turnId}:${s.game.last?.n || 0}`;
    if (aimState.key !== key) aimState = { key, x: s.game.aim?.x ?? 0, y: s.game.aim?.y ?? 0.3 };
    return aimState;
  }
  let feedback = '';

  // The close-up is drawn in perspective, as if you're standing at your end of the table: the
  // far cups smaller and higher up. `view(x, y)` is where a point in the rack's units (at the
  // height of the cups' rims) appears in the picture, 360 × 300, and how big things are there.
  const view = (x, y) => {
    const f = 1 / (1 + y * 1.1);
    return { x: 180 + x * 330 * f, y: 70 + 190 * f, f };
  };
  // A red-cup shape in 3D: the rim's ellipse on top, the body tapering down, shaded round, with the
  // beer inside and a white lip.
  function cup3d(c, color, id) {
    const { x, y, f } = view(c.x, c.y);
    const rx = 31 * f;
    const ry = rx * 0.34;
    const h = 62 * f;
    const b = rx * 0.7;
    return `<g class="bp-cup3d">
      <ellipse cx="${x}" cy="${y + h}" rx="${b * 1.15}" ry="${ry * 0.7}" fill="rgba(0,0,0,0.35)"/>
      <path d="M${x - rx} ${y} L${x - b} ${y + h} A${b} ${ry * 0.7} 0 0 0 ${x + b} ${y + h} L${x + rx} ${y} Z" fill="url(#bp-shade-${id})"/>
      ${[0.33, 0.62].map((k) => `<path d="M${x - rx + (rx - b) * k} ${y + h * k} A${rx - (rx - b) * k} ${ry * (1 - 0.3 * k)} 0 0 0 ${x + rx - (rx - b) * k} ${y + h * k}" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="${1.2 * f}"/>`).join('')}
      <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#f4f4f4"/>
      <ellipse cx="${x}" cy="${y + ry * 0.12}" rx="${rx * 0.86}" ry="${ry * 0.78}" fill="#d8a63a"/>
      <ellipse cx="${x - rx * 0.12}" cy="${y}" rx="${rx * 0.5}" ry="${ry * 0.4}" fill="#fff5d6" opacity="0.55"/>
    </g>`;
  }
  function closeUp(s) {
    const g = s.game;
    const target = 1 - g.turnTeam;
    const a = localAim(s);
    // Each colour gets its shading once: dark at the edges, the colour, a highlight.
    const colors = [...new Set(g.cups[target].map((c) => colorOf(c, g, target)))];
    const shades = colors.map((c, i) => `<linearGradient id="bp-shade-${i}" x1="0" x2="1"><stop offset="0" stop-color="#000"/><stop offset="0.12" stop-color="${c}" stop-opacity="0.75"/>
      <stop offset="0.4" stop-color="${c}"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.68" stop-color="${c}"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient>`).join('');
    // Back rows first, so the front cups stand in front of them.
    const cups = [...g.cups[target]].sort((p, q) => q.y - p.y).map((c) => cup3d(c, colorOf(c, g, target), colors.indexOf(colorOf(c, g, target)))).join('');
    const corner = (x, y) => { const p = view(x, y); return `${p.x.toFixed(1)} ${(p.y + 62 * p.f).toFixed(1)}`; };
    const p = view(a.x, a.y);
    const L = g.last && g.last.target === target && !g.last.cup ? view(g.last.x, g.last.y) : null;
    return `<div class="bp-close"><svg viewBox="0 0 360 300" class="bp-rack" aria-label="Their cups">
      <defs>${shades}</defs>
      <rect width="360" height="300" fill="#0e1a12"/>
      <path d="M${corner(-0.75, -0.25)} L${corner(0.75, -0.25)} L${corner(0.75, 1.6)} L${corner(-0.75, 1.6)}Z" fill="#1f6a3a"/>
      <path d="M${corner(0, -0.25)} L${corner(0, 1.6)} M${corner(-0.75, -0.25)} L${corner(-0.75, 1.6)} M${corner(0.75, -0.25)} L${corner(0.75, 1.6)}" stroke="rgba(255,255,255,0.7)" stroke-width="2" fill="none"/>
      ${cups}
      ${L ? `<circle cx="${L.x}" cy="${L.y + 62 * L.f}" r="${7 * L.f}" fill="#fffdf4" opacity="0.8"/>` : ''}
      <g id="bp-aim" class="bp-aim big" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.f.toFixed(3)})"><circle r="16"/><path d="M-26 0 H26 M0 -26 V26"/></g>
    </svg></div>`;
  }

  function pad(s) {
    return `<div class="dt-pad bp-pad" id="bp-pad">
      <p class="dt-hint">Drag to aim · flick up to throw</p>
      <p class="dt-readout" id="bp-readout">${esc(feedback || `${PB.plural(s.game.balls, 'ball')} to throw`)}</p>
      <svg class="dt-held" id="bp-held" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="#fffdf4" stroke="#d8d0c0" stroke-width="2"/></svg>
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
    const p = view(aimState.x, aimState.y);
    document.getElementById('bp-aim')?.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.f.toFixed(3)})`);
  }

  function setupPad() {
    const el = document.getElementById('bp-pad');
    const held = document.getElementById('bp-held');
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
      // Dragging across the pad's width sweeps the crosshair across the whole rack; dragging up
      // moves it further back.
      const scale = 1.2 / el.clientWidth;
      aimState.x = Math.max(-0.6, Math.min(0.6, start.ax + (e.clientX - start.x) * scale));
      aimState.y = Math.max(-0.1, Math.min(0.8, start.ay - (e.clientY - start.y) * scale));
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
      if (vy < -0.5 && from.y - end.y > 30) {
        // Aim where the crosshair was before the flick started moving it.
        let i = hist.length - 1;
        while (i > 0 && hist[i].y < hist[i - 1].y - 2) i--;
        aimState.x = hist[i].ax;
        aimState.y = hist[i].ay;
        const angle = (Math.atan2(vx, -vy) * 180) / Math.PI;
        const speed = (-vy * 1000) / window.innerHeight / IDEAL_SPEED;
        feedback = flickNote(angle, speed);
        if (held) {
          held.style.transition = 'transform 0.3s ease-in, opacity 0.3s';
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

  function flickNote(angle, speed) {
    const lean = Math.abs(angle) > 3 ? `, leaning ${Math.round(Math.abs(angle))}° ${angle > 0 ? 'right' : 'left'}` : ', dead straight';
    const how = Math.abs(speed - 1) < 0.06 ? 'Perfect power' : speed < 1 ? `Too soft (${Math.round(speed * 100)}%)` : `Too hard (${Math.round(speed * 100)}%)`;
    return `${how}${lean}`;
  }

  // ---------- Screens ----------

  // The two teams, side by side. Before the game the host can tap someone to move them across.
  function teams(s, { movable = false } = {}) {
    const g = s.game;
    return `<div class="br-teams bp-teams" style="--n:2">${g.teams.map((t, i) => `
      <div class="br-team ${g.winner === i ? 'won' : ''} ${s.phase === 'throwing' && g.turnTeam === i ? 'up' : ''}" style="--team:${t.color}">
        <h3>Team ${esc(t.name)}${s.phase !== 'teams' ? ` <small>${PB.plural(g.cups[i].length, 'cup')}</small>` : ''}</h3>
        ${t.ids.map((id) => {
          const who = `${PB.avatar(id, 'sm')}<span class="br-name">${esc(name(id))}</span>${id === g.turnId ? '<span class="br-move">🏓</span>' : ''}`;
          return movable
            ? `<button class="br-player ${id === s.me ? 'me' : ''}" data-act="move" data-target-id="${esc(id)}">${who}<span class="br-move">⇄</span></button>`
            : `<div class="br-player ${id === s.me ? 'me' : ''}">${who}</div>`;
        }).join('') || '<p class="muted">Nobody yet</p>'}
      </div>`).join('')}</div>`;
  }

  // What the last ball did.
  function lastLine(s) {
    const g = s.game;
    const L = g.last;
    if (!L) return '<p class="bp-last muted">First ball coming up…</p>';
    const who = esc(name(L.by));
    const text = L.cup ? `🎯 ${who} sinks one! Team ${esc(g.teams[L.target].name)} drinks` : L.rim ? `😩 ${who} rims out` : `💨 ${who} misses`;
    return `<p class="bp-last ${L.cup ? 'hit' : ''}">${text}${g.ballsBack === L.n ? '<b> · 🔥 Balls back!</b>' : ''}</p>`;
  }

  function lineUp(s) {
    return `
      <div class="turn">🏓 Beer pong<span>Pick your teams</span></div>
      ${teams(s, { movable: s.isHost })}
      ${s.isHost
        ? `<p class="br-hint">Tap someone to move them to the other team.</p>
          <div class="row"><button class="secondary" data-act="shuffle">🔀 New teams</button><button data-act="go" ${s.game.teams.every((t) => t.ids.length) ? '' : 'disabled'}>🏓 Rack ’em up</button></div>`
        : `<p class="br-hint">${esc(name(s.hostId))} is picking the teams.</p>`}`;
  }

  function playing(s) {
    const g = s.game;
    const team = g.teams[g.turnTeam];
    const mine = g.turnId === s.me && !PB.isTV;
    const showTable = PB.isTV || !s.tv;
    return `
      ${PB.turn(g.turnId, `Team ${team.name} · ${PB.plural(g.balls, 'ball')} left`)}
      ${mine ? closeUp(s) : showTable ? table(s) : ''}
      ${lastLine(s)}
      ${mine ? pad(s) : ''}
      ${teams(s)}
      ${mine ? '' : PB.feed(3)}`;
  }

  function over(s) {
    const g = s.game;
    const w = g.teams[g.winner];
    const l = g.teams[1 - g.winner];
    return `
      <div class="drink win" style="--team:${w.color}"><div class="big">🏆 Team ${esc(w.name)} wins!</div>
        <div class="sips">Team ${esc(l.name)}: finish your drinks</div></div>
      ${PB.isTV || !s.tv ? table(s) : ''}
      ${teams(s)}
      ${PB.feed(4)}`;
  }

  let lastKey = '';
  const keyOf = (s) => JSON.stringify([s.phase, s.tv, PB.landscape(), { ...s.game, aim: null }, s.players.map((p) => [p.id, p.connected, p.drinks])]);

  PB.register('beerPong', {
    reset() {
      aimState = { key: '', x: 0, y: 0.3 };
      feedback = '';
      lastKey = '';
      shown = 0;
    },
    stage: '.bp-table-wrap, .bp-close',
    tvTable: false,
    tvStage: '.bp-table-wrap, .bp-last, .drink, .bp-teams',
    tvLeft: '.bp-teams',
    sounds(prev, s) {
      const n = s.game.last?.n;
      if (!n || n === prev.game.last?.n) return [];
      return s.game.last.cup ? ['bell'] : ['dice'];
    },
    render(s) {
      // Aim updates only move the crosshair (and mustn't interrupt the thrower's drag).
      const key = keyOf(s);
      if (key === lastKey && document.getElementById('bp-pad')) return null;
      lastKey = key;
      if (s.phase === 'teams') return lineUp(s);
      if (s.phase === 'over') return over(s);
      return playing(s);
    },
    afterRender(s) {
      setupPad();
      // Once a ball's been drawn landing, it isn't animated again.
      if (s.game.last) setTimeout(() => { shown = s.game.last.n; }, 50);
    },
    onAim(aim) {
      const s = PB.state;
      if (!s?.game || s.phase !== 'throwing') return;
      s.game.aim = aim;
      if (s.game.turnId === s.me && !PB.isTV) return; // the thrower's own crosshair is local
      const mark = document.getElementById('bp-aim-t');
      if (!mark) return;
      const p = toTable(1 - s.game.turnTeam, aim.x, aim.y);
      mark.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    },
  });
})();
