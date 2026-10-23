// Screens for Slevens. Server logic: games/slevens.js
(() => {
  const { esc, name } = PB;
  let spinTimer = null;
  let tracing = false; // a finger is down mid-trace; don't redraw under it
  let lastKey = null;

  function subtitle(s, mine) {
    const g = s.game;
    switch (s.phase) {
      case 'ready':
        if (g.traceLen === 1) return mine ? 'Tap to roll' : 'About to roll';
        return mine ? `Trace ${g.traceLen} dots to roll` : `Tracing ${g.traceLen} dots`;
      case 'spinning': return 'Rolling…';
      case 'claim': return mine ? '7, 11 or doubles? Tap the dot!' : 'Checking the dice…';
      case 'reverse': return mine ? 'Pick who rolls next' : 'Picking the next roller';
      default: return '';
    }
  }

  function stage(s, mine) {
    const g = s.game;
    if (s.phase === 'reverse') {
      return `
        <div class="reverse">🔄 REVERSE!</div>
        ${mine ? PB.playerPicker('pick', { exclude: [s.me] }) : ''}`;
    }
    if (!mine) return '<div class="stage"></div>';

    if (s.phase === 'ready' && g.traceLen === 1) {
      return '<div class="stage"><button class="roll-btn" data-act="roll">ROLL</button></div>';
    }
    if (s.phase === 'ready') {
      return `
        <div class="stage trace" id="stage">
          <svg class="trail"><polyline points="" /></svg>
          ${g.dots.map((d, i) => `<div class="dot ${i === 0 ? 'start' : ''}" style="left:${d.x}%;top:${d.y}%" ${i > 0 ? 'hidden' : ''}></div>`).join('')}
          <p class="stage-hint" id="trace-hint">Press the dot, then drag to the next one</p>
        </div>`;
    }
    if (s.phase === 'claim' && g.claimDot) {
      // Shrinks over the 5-second window, lined up with the server clock.
      const elapsed = Math.max(0, g.claimMs - (g.claimEndsAt - PB.now()));
      return `
        <div class="stage">
          <button class="claim-dot" data-act="claim" aria-label="Claim"
            style="left:${g.claimDot.x}%;top:${g.claimDot.y}%;animation-duration:${g.claimMs}ms;animation-delay:-${elapsed}ms"></button>
        </div>`;
    }
    return '<div class="stage"></div>';
  }

  function render(s) {
    const g = s.game;
    const key = `${g.rollNo}:${s.phase}`;
    if (tracing && key === lastKey) return null;
    tracing = false;
    lastKey = key;
    clearInterval(spinTimer);

    const mine = g.rollerId === s.me;
    const dice = s.phase === 'spinning' ? PB.dice([1, 1], { rolling: true }) : g.dice ? PB.dice(g.dice) : '';

    return `
      ${PB.turn(g.rollerId, subtitle(s, mine))}
      <div id="dice-box" class="dice-box">${dice}</div>
      ${g.notice ? `<p class="notice">${esc(g.notice)}</p>` : ''}
      ${stage(s, mine)}
      ${PB.feed(3)}
      ${mine && s.phase !== 'spinning' ? `<button class="next-arrow" data-act="pass" aria-label="Pass to next player">➜</button>` : ''}
    `;
  }

  function spin() {
    const box = document.getElementById('dice-box');
    const face = () => 1 + Math.floor(Math.random() * 6);
    spinTimer = setInterval(() => {
      box.innerHTML = PB.dice([face(), face()]);
      box.firstElementChild.classList.add('spinning');
    }, 90);
  }

  // Press the first dot, then drag through each dot as it appears. Lifting the finger starts over.
  function setupTrace() {
    const stageEl = document.getElementById('stage');
    const hint = document.getElementById('trace-hint');
    const dots = [...stageEl.querySelectorAll('.dot')];
    const line = stageEl.querySelector('polyline');
    let idx = 0;
    let points = [];

    const local = (x, y) => {
      const r = stageEl.getBoundingClientRect();
      return [x - r.left, y - r.top];
    };
    const centre = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const near = (e, el) => {
      const [cx, cy] = centre(el);
      return Math.hypot(e.clientX - cx, e.clientY - cy) < el.offsetWidth * 0.75;
    };
    const draw = (e) => {
      const all = e ? [...points, local(e.clientX, e.clientY)] : points;
      line.setAttribute('points', all.map((p) => p.join(',')).join(' '));
    };
    const reach = (i) => {
      dots[i].classList.add('reached');
      points.push(local(...centre(dots[i])));
      idx = i + 1;
      navigator.vibrate?.(15);
      if (idx < dots.length) dots[idx].hidden = false;
    };
    const reset = () => {
      idx = 0;
      points = [];
      tracing = false;
      dots.forEach((d, i) => { d.hidden = i > 0; d.classList.remove('reached'); });
      draw();
    };

    stageEl.addEventListener('pointerdown', (e) => {
      if (!near(e, dots[0])) return;
      tracing = true;
      stageEl.setPointerCapture(e.pointerId);
      hint.textContent = 'Keep your finger down…';
      reach(0);
      draw(e);
    });
    stageEl.addEventListener('pointermove', (e) => {
      if (!tracing) return;
      if (near(e, dots[idx])) {
        reach(idx);
        if (idx === dots.length) {
          tracing = false;
          draw();
          PB.act('roll');
          return;
        }
      }
      draw(e);
    });
    const lift = () => {
      if (!tracing) return;
      reset();
      hint.textContent = 'You let go! Start again from the first dot';
    };
    stageEl.addEventListener('pointerup', lift);
    stageEl.addEventListener('pointercancel', lift);
  }

  PB.register('slevens', {
    render,
    afterRender(s) {
      if (s.phase === 'spinning') spin();
      if (s.phase === 'ready' && s.game.rollerId === s.me && s.game.traceLen > 1) setupTrace();
    },
  });
})();
