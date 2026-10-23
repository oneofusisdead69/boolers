// Screens for Slevens. Server logic: games/slevens.js
// Full-screen layout: a slim header, then a touch pad filling the rest of the screen with the
// dice in the middle. Only the roller plays on the pad; everyone else watches the dice.
(() => {
  const { esc } = PB;
  let spinTimer = null;
  let tracing = false; // a finger is down mid-trace; don't redraw under it
  let lastKey = null;

  const rolling = (phase) => phase === 'ready' || phase === 'window';

  function subtitle(s, mine) {
    const g = s.game;
    switch (s.phase) {
      case 'ready':
        if (g.hit) return mine ? 'Roll when their cup touches their lips' : 'Hit! Someone drinks';
        if (g.traceLen === 1) return mine ? 'Tap to roll' : 'About to roll';
        return mine ? `Trace ${g.traceLen} dots to roll` : `Tracing ${g.traceLen} dots`;
      case 'spinning': return 'Rolling…';
      case 'window': return mine ? `Hit? Hands off for ${g.seconds} seconds` : 'Checking the dice…';
      case 'reverse': return mine ? 'You touched a hit! Pick who rolls next' : 'Touched a hit! Picking who rolls next';
      default: return '';
    }
  }

  function diceHtml(g, phase) {
    if (phase === 'spinning') return `<div class="dice-centre" id="dice-box">${PB.dice([1, 1], { rolling: true })}</div>`;
    if (g.dice) return `<div class="dice-centre" id="dice-box">${PB.dice(g.dice)}</div>`;
    return `<div class="dice-centre faded" id="dice-box">${PB.dice([0, 0])}</div>`;
  }

  function traceDots(g) {
    return `
      <svg class="trail"><polyline points="" /></svg>
      ${g.dots.map((d, i) => `<div class="dot ${i === 0 ? 'start' : ''}" style="left:${d.x}%;top:${d.y}%" ${i > 0 ? 'hidden' : ''}></div>`).join('')}`;
  }

  function streak(s) {
    const g = s.game;
    if (g.hits === 0 || s.phase === 'reverse') return '';
    const next = g.dotConnect ? ` · next roll needs ${PB.plural(g.traceLen, 'dot')}` : '';
    const snake = g.snakeEyes ? '<br>🐍 Only snake eyes hits now' : '';
    return `<p class="pad-top race">🔥 ${PB.plural(g.hits, 'hit')} in a row${next}${snake}</p>`;
  }

  // The big ROLL button only opens a turn; after that every roll is dots.
  const rollButton = (s) => s.phase === 'ready' && !s.game.dice;

  function rollerPad(s) {
    const g = s.game;
    if (rollButton(s)) return '<button class="roll-btn" data-act="roll">ROLL</button>';
    let overlay = '';
    if (rolling(s.phase)) overlay = traceDots(g);
    else if (s.phase === 'reverse') overlay = `<div class="pad-picker">${PB.playerPicker('pick', { exclude: [s.me] })}</div>`;
    return `${streak(s)}${diceHtml(g, s.phase)}${overlay}`;
  }

  function render(s) {
    const g = s.game;
    const key = `${g.rollNo}:${rolling(s.phase) ? 'roll' : s.phase}`;
    if (tracing && key === lastKey) return null;
    tracing = false;
    lastKey = key;
    clearInterval(spinTimer);

    const mine = g.rollerId === s.me;
    const last = s.feed[s.feed.length - 1];

    return `
      <div class="fs-screen">
        <div class="fs-header">
          ${PB.turn(g.rollerId, subtitle(s, mine))}
          ${PB.endButton('end-mini')}
        </div>
        <div class="pad" id="pad">
          ${mine ? rollerPad(s) : `${streak(s)}${diceHtml(g, s.phase)}`}
          ${s.phase === 'reverse' ? '<div class="reverse">🔄 REVERSE!</div>' : ''}
          ${g.hit ? `<div class="reverse hit ${g.hit === 'snake' ? 'long' : ''}">${g.hit === 'snake' ? '🐍 SNAKE EYES!' : '🍺 HIT!'}</div>` : ''}
          ${last ? `<p class="pad-feed">${esc(last.text)}</p>` : ''}
          ${mine && s.phase !== 'spinning' ? '<button class="next-arrow" data-act="pass" aria-label="Pass to next player">➜</button>' : ''}
        </div>
      </div>
    `;
  }

  function spin() {
    clearInterval(spinTimer);
    const face = () => 1 + Math.floor(Math.random() * 6);
    spinTimer = setInterval(() => {
      const box = document.getElementById('dice-box');
      if (!box) return clearInterval(spinTimer);
      box.classList.remove('faded');
      box.innerHTML = PB.dice([face(), face()]);
      box.firstElementChild.classList.add('spinning');
    }, 90);
  }

  // Press the first dot (the dice start spinning), then drag through each dot as it appears.
  // Reaching the last dot rolls. Lifting the finger starts over. Touching the first dot also
  // tells the server, which turns it into a REVERSE if the dice show a hit and the hands-off time
  // aren't up.
  function setupTrace() {
    const pad = document.getElementById('pad');
    const dots = [...pad.querySelectorAll('.dot')];
    const line = pad.querySelector('polyline');
    const box = document.getElementById('dice-box');
    const restingDice = box?.innerHTML;
    const restingFaded = box?.classList.contains('faded');
    let idx = 0;
    let points = [];
    let last = null; // previous finger position, so a fast swipe can't jump over a dot

    const local = (x, y) => {
      const r = pad.getBoundingClientRect();
      return [x - r.left, y - r.top];
    };
    const centreOf = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    // Distance from the dot's centre to the finger's path since the last move event.
    const near = (e, el) => {
      const [cx, cy] = centreOf(el);
      const [x1, y1] = [e.clientX, e.clientY];
      const [x0, y0] = last || [x1, y1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const t = dx || dy ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / (dx * dx + dy * dy))) : 0;
      return Math.hypot(x0 + t * dx - cx, y0 + t * dy - cy) < el.offsetWidth * 0.9;
    };
    const draw = (e) => {
      const all = e ? [...points, local(e.clientX, e.clientY)] : points;
      line.setAttribute('points', all.map((p) => p.join(',')).join(' '));
    };
    const reach = (i) => {
      dots[i].classList.add('reached');
      points.push(local(...centreOf(dots[i])));
      idx = i + 1;
      navigator.vibrate?.(15);
      if (idx < dots.length) dots[idx].hidden = false;
    };
    const finish = () => {
      tracing = false;
      draw();
      PB.act('roll');
    };

    pad.addEventListener('pointerdown', (e) => {
      last = null;
      if (!near(e, dots[0])) return;
      tracing = true;
      last = [e.clientX, e.clientY];
      pad.setPointerCapture(e.pointerId);
      PB.act('press');
      reach(0);
      spin();
      if (idx === dots.length) return finish();
      draw(e);
    });
    pad.addEventListener('pointermove', (e) => {
      if (!tracing) return;
      if (near(e, dots[idx])) {
        reach(idx);
        if (idx === dots.length) return finish();
      }
      last = [e.clientX, e.clientY];
      draw(e);
    });
    const lift = () => {
      if (!tracing) return;
      tracing = false;
      idx = 0;
      points = [];
      clearInterval(spinTimer);
      if (box) {
        box.innerHTML = restingDice;
        box.classList.toggle('faded', restingFaded);
      }
      dots.forEach((d, i) => { d.hidden = i > 0; d.classList.remove('reached'); });
      draw();
    };
    pad.addEventListener('pointerup', lift);
    pad.addEventListener('pointercancel', lift);
  }

  PB.register('slevens', {
    fullscreen: true,
    render,
    afterRender(s) {
      if (s.phase === 'spinning') spin();
      if (s.game.rollerId === s.me && rolling(s.phase) && !rollButton(s)) setupTrace();
    },
  });
})();
