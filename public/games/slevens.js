// Screens for Slevens. Server logic: games/slevens.js
// Full-screen layout: a slim header, then a touch pad filling the rest of the screen with the
// dice in the middle. The roller rolls and traces on the pad; the drinker's pad turns into a
// START button (cup touches lips) and then a giant DONE button.
(() => {
  const { esc, name } = PB;
  let spinTimer = null;
  let tracing = false; // a finger is down mid-trace; don't redraw under it
  let lastKey = null;
  let buzzedFor = null;

  const rolling = (phase) => phase === 'ready' || phase === 'claim';

  function subtitle(s, mine) {
    const g = s.game;
    const drinker = name(g.drinkerId);
    switch (s.phase) {
      case 'ready':
        if (g.traceLen === 1) return mine ? 'Tap to roll' : 'About to roll';
        return mine ? `Trace ${g.traceLen} dots to roll` : `Tracing ${g.traceLen} dots`;
      case 'spinning': return 'Rolling…';
      case 'claim': return mine ? 'Hit? Tap blue. Miss? Roll again' : 'Checking the dice…';
      case 'pick': return mine ? 'Pick who drinks' : 'Picking who drinks';
      case 'waiting': return g.drinkerId === s.me ? 'Drink!' : `Waiting for ${drinker} to start drinking`;
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

  // The race banner along the top of the pad.
  function raceText(s) {
    const g = s.game;
    if (g.notice) return `<p class="pad-top notice">${esc(g.notice)}</p>`;
    if (g.drinking && s.phase !== 'pick') {
      return `<p class="pad-top race">🍺 ${esc(name(g.drinkerId))} ${g.drinkerId === s.me ? 'are' : 'is'} drinking · hit #${g.hits + 1} needs ${PB.plural(g.traceLen, 'dot')}</p>`;
    }
    return '';
  }

  function rollerPad(s) {
    const g = s.game;
    let centre = diceHtml(g, s.phase);
    let overlay = '';
    if (s.phase === 'ready' && g.traceLen === 1) {
      centre = '<button class="roll-btn" data-act="roll">ROLL</button>';
    } else if (s.phase === 'ready') {
      overlay = traceDots(g);
    } else if (s.phase === 'claim') {
      // Blue dot to claim a hit, and the next roll's dots right alongside it.
      const elapsed = Math.max(0, g.claimMs - (g.claimEndsAt - PB.now()));
      overlay = `${traceDots(g)}
        <button class="claim-dot" data-act="claim" aria-label="Claim the hit"
          style="left:${g.claimDot.x}%;top:${g.claimDot.y}%;animation-duration:${g.claimMs}ms;animation-delay:-${elapsed}ms"></button>`;
    } else if (s.phase === 'pick') {
      overlay = `<div class="reverse">🔄 REVERSE!</div>
        <div class="pad-picker">${PB.playerPicker('pick', { exclude: [s.me] })}</div>`;
    } else if (s.phase === 'waiting') {
      overlay = `<div class="pad-bottom"><button class="secondary" data-act="start">${esc(name(g.drinkerId))} is drinking. Go!</button></div>`;
    }
    return `${raceText(s)}${centre}${overlay}`;
  }

  function drinkerPad(s) {
    const g = s.game;
    if (s.phase === 'waiting') {
      return `
        <div class="drinker">
          <div class="drinker-big">🍺 YOU DRINK</div>
          <div class="drinker-amount">${esc(g.amount)}</div>
          <button class="drinker-btn" data-act="start">START</button>
          <p>Tap as your cup touches your lips.<br>Then ${esc(name(g.rollerId))} races to hit again.</p>
        </div>`;
    }
    return `
      <div class="drinker racing">
        <p>${esc(name(g.rollerId))} is ${s.phase === 'spinning' ? 'rolling' : `tracing ${PB.plural(g.traceLen, 'dot')}`}…</p>
        <button class="drinker-btn done" data-act="done">DONE</button>
        <p>Tap the moment you finish: <b>${esc(g.amount.toLowerCase())}</b></p>
        ${g.dice ? `<div class="drinker-dice">${PB.dice(s.phase === 'spinning' ? [0, 0] : g.dice)}</div>` : ''}
      </div>`;
  }

  function watcherPad(s) {
    const g = s.game;
    const overlay = s.phase === 'pick' ? '<div class="reverse">🔄 REVERSE!</div>' : '';
    return `${raceText(s)}${diceHtml(g, s.phase)}${overlay}`;
  }

  function render(s) {
    const g = s.game;
    const key = `${g.rollNo}:${rolling(s.phase) ? 'roll' : s.phase}:${g.drinking}`;
    if (tracing && key === lastKey) return null;
    tracing = false;
    lastKey = key;
    clearInterval(spinTimer);

    const mine = g.rollerId === s.me;
    const drinkingNow = g.drinkerId === s.me && (s.phase === 'waiting' || (g.drinking && s.phase !== 'pick'));
    if (g.drinkerId === s.me && s.phase === 'waiting' && buzzedFor !== g.rollNo) {
      buzzedFor = g.rollNo;
      navigator.vibrate?.([200, 100, 200]);
    }
    const last = s.feed[s.feed.length - 1];

    let pad;
    if (drinkingNow) pad = drinkerPad(s);
    else if (mine) pad = rollerPad(s);
    else pad = watcherPad(s);

    return `
      <div class="fs-screen">
        <div class="fs-header">
          ${PB.turn(g.rollerId, subtitle(s, mine))}
          ${PB.endButton('end-mini')}
        </div>
        <div class="pad ${drinkingNow ? 'pad-drinker' : ''}" id="pad">
          ${pad}
          ${last && !drinkingNow ? `<p class="pad-feed">${esc(last.text)}</p>` : ''}
          ${mine && !drinkingNow && s.phase !== 'spinning' ? '<button class="next-arrow" data-act="pass" aria-label="Pass to next player">➜</button>' : ''}
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
  // Reaching the last dot rolls. Lifting the finger starts over.
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
      const g = s.game;
      const drinkingNow = g.drinkerId === s.me && g.drinking;
      if (g.rollerId === s.me && !drinkingNow && rolling(s.phase) && !(s.phase === 'ready' && g.traceLen === 1)) setupTrace();
    },
  });
})();
