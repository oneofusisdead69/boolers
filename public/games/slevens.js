// Screens for Slevens. Server logic: games/slevens.js
// Full-screen layout: a slim header, then a touch pad filling the rest of the screen with the
// dice in the middle. Buttons, dots and the pass arrow all sit on the pad.
(() => {
  const { esc } = PB;
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

  function centre(s, mine) {
    const g = s.game;
    if (s.phase === 'ready' && g.traceLen === 1 && mine) {
      return '<button class="roll-btn" data-act="roll">ROLL</button>';
    }
    if (s.phase === 'spinning') return `<div class="dice-centre" id="dice-box">${PB.dice([1, 1], { rolling: true })}</div>`;
    if (g.dice) return `<div class="dice-centre">${PB.dice(g.dice)}</div>`;
    return `<div class="dice-centre faded">${PB.dice([0, 0])}</div>`;
  }

  function overlay(s, mine) {
    const g = s.game;
    if (s.phase === 'reverse') {
      return `
        <div class="reverse">🔄 REVERSE!</div>
        ${mine ? `<div class="pad-picker">${PB.playerPicker('pick', { exclude: [s.me] })}</div>` : ''}`;
    }
    if (!mine) return '';
    if (s.phase === 'ready' && g.traceLen > 1) {
      return `
        <svg class="trail"><polyline points="" /></svg>
        ${g.dots.map((d, i) => `<div class="dot ${i === 0 ? 'start' : ''}" style="left:${d.x}%;top:${d.y}%" ${i > 0 ? 'hidden' : ''}></div>`).join('')}`;
    }
    if (s.phase === 'claim' && g.claimDot) {
      // Shrinks over the 5-second window, lined up with the server clock.
      const elapsed = Math.max(0, g.claimMs - (g.claimEndsAt - PB.now()));
      return `<button class="claim-dot" data-act="claim" aria-label="Claim"
        style="left:${g.claimDot.x}%;top:${g.claimDot.y}%;animation-duration:${g.claimMs}ms;animation-delay:-${elapsed}ms"></button>`;
    }
    return '';
  }

  function topText(s, mine) {
    const g = s.game;
    if (g.notice) return `<p class="pad-top notice">${esc(g.notice)}</p>`;
    if (mine && s.phase === 'ready' && g.traceLen > 1) {
      return '<p class="pad-top" id="trace-hint">Press the glowing dot, then drag to the next one</p>';
    }
    return '';
  }

  function render(s) {
    const g = s.game;
    const key = `${g.rollNo}:${s.phase}`;
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
          ${topText(s, mine)}
          ${centre(s, mine)}
          ${overlay(s, mine)}
          ${last ? `<p class="pad-feed">${esc(last.text)}</p>` : ''}
          ${mine && s.phase !== 'spinning' ? '<button class="next-arrow" data-act="pass" aria-label="Pass to next player">➜</button>' : ''}
        </div>
      </div>
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
    const pad = document.getElementById('pad');
    const hint = document.getElementById('trace-hint');
    const dots = [...pad.querySelectorAll('.dot')];
    const line = pad.querySelector('polyline');
    let idx = 0;
    let points = [];

    const local = (x, y) => {
      const r = pad.getBoundingClientRect();
      return [x - r.left, y - r.top];
    };
    const centreOf = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const near = (e, el) => {
      const [cx, cy] = centreOf(el);
      return Math.hypot(e.clientX - cx, e.clientY - cy) < el.offsetWidth * 0.75;
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
    const reset = () => {
      idx = 0;
      points = [];
      tracing = false;
      dots.forEach((d, i) => { d.hidden = i > 0; d.classList.remove('reached'); });
      draw();
    };

    pad.addEventListener('pointerdown', (e) => {
      if (!near(e, dots[0])) return;
      tracing = true;
      pad.setPointerCapture(e.pointerId);
      if (hint) hint.textContent = 'Keep your finger down…';
      reach(0);
      draw(e);
    });
    pad.addEventListener('pointermove', (e) => {
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
      if (hint) hint.textContent = 'You let go! Start again from the glowing dot';
    };
    pad.addEventListener('pointerup', lift);
    pad.addEventListener('pointercancel', lift);
  }

  PB.register('slevens', {
    fullscreen: true,
    render,
    afterRender(s) {
      if (s.phase === 'spinning') spin();
      if (s.phase === 'ready' && s.game.rollerId === s.me && s.game.traceLen > 1) setupTrace();
    },
  });
})();
