// Screens for Big Tom. Server logic: games/bigTom.js
(() => {
  const { esc, name } = PB;
  const BIG_TOM = 'bigtom';
  // What you've typed, kept across redraws (other players' updates redraw the screen).
  const drafts = {};
  let lastSuggestion = null;
  let lastKey = null;

  // A name mid-sentence: "you" for yourself.
  const who = (id) => (id === PB.state.me && !PB.passAndPlay ? 'you' : esc(name(id)));
  const author = (id) => (id === BIG_TOM ? '🎤 Big Tom' : who(id));
  const progress = (s, done) => {
    const here = s.players.filter((p) => p.connected);
    const waiting = here.filter((p) => !done.includes(p.id)).map((p) => who(p.id));
    return `<p class="center muted">${done.length} / ${here.length} done${waiting.length ? ` · waiting on ${waiting.join(', ')}` : ''}</p>`;
  };
  const moveOn = (s, label) => (s.isHost ? `<button class="link" data-act="moveOn" data-confirm="Move on without the stragglers?">${label}</button>` : '');

  // ---------- Write a question ----------

  function writeScreen(s) {
    const g = s.game;
    const key = `${g.round}:q`;
    if (g.suggestion && g.suggestion !== lastSuggestion) { drafts[key] = g.suggestion; lastSuggestion = g.suggestion; }
    const mine = g.myQuestion;
    return `
      <div class="turn">🎤 Round ${g.round} of ${g.rounds}<span>Write a question for the others to answer</span></div>
      ${mine
        ? `<div class="card bt-done"><small>Your question</small><p class="bt-q">${esc(mine)}</p><p class="muted">✓ Sent. It goes to two other players.</p></div>`
        : `<div class="card bt-write">
            <textarea data-bt="${key}" rows="3" maxlength="140" placeholder="e.g. The worst thing to say at a funeral">${esc(drafts[key] || '')}</textarea>
            <div class="bt-row">
              <button class="secondary" data-act="generate">🎲 Generate${g.nsfw ? ' 🔞' : ''}</button>
              <button data-bt-send="question" data-key="${key}">Send</button>
            </div>
          </div>`}
      ${progress(s, g.written)}
      ${moveOn(s, 'Start answering now (Big Tom writes the missing ones)')}`;
  }

  // ---------- Answer two questions ----------

  function answerScreen(s) {
    const g = s.game;
    if (!g.myTasks.length) {
      return `
        <div class="turn">🎤 Round ${g.round} of ${g.rounds}<span>Everyone's answering ${PB.timer()}</span></div>
        <p class="center muted">You're not answering this round. Get ready to vote.</p>
        ${progress(s, g.answered)}
        ${moveOn(s, 'Start voting now')}`;
    }
    return `
      <div class="turn">🎤 Round ${g.round} of ${g.rounds}<span>Answer these ${PB.timer()}</span></div>
      ${g.myTasks.map((t) => {
        const key = `${g.round}:a:${t.m}`;
        return t.answer !== null
          ? `<div class="card bt-done"><p class="bt-q">${esc(t.question)}</p><p class="bt-a">“${esc(t.answer)}”</p><p class="muted">✓ Sent</p></div>`
          : `<div class="card bt-write">
              <p class="bt-q">${esc(t.question)}</p>
              <textarea data-bt="${key}" rows="2" maxlength="140" placeholder="Your answer">${esc(drafts[key] || '')}</textarea>
              <button data-bt-send="answer" data-key="${key}" data-m="${t.m}">Send answer</button>
            </div>`;
      }).join('')}
      ${progress(s, g.answered)}
      ${moveOn(s, 'Start voting now')}`;
  }

  // ---------- Vote and reveal ----------

  function answerCard(s, side) {
    const m = s.game.matchup;
    const text = m.answers[side];
    const r = m.result;
    if (!r) {
      const can = m.canVote && text;
      return `<button class="bt-answer ${m.myVote === side ? 'selected' : ''}" ${can ? `data-act="vote" data-side="${side}"` : 'disabled'}>
        ${text ? `“${esc(text)}”` : '<span class="muted">(no answer)</span>'}</button>`;
    }
    const id = m.players[side];
    const voters = Object.entries(m.votes).filter(([, v]) => v === side).map(([v]) => v);
    const won = r.winner === id;
    return `<div class="bt-answer ${won ? 'won' : r.winner ? 'lost' : ''}">
      <span>${text ? `“${esc(text)}”` : '<span class="muted">(no answer)</span>'}</span>
      <small>${PB.avatar(id, 'sm')} ${esc(name(id))} · ${PB.plural(r[side], 'vote')} ${won ? '🏆' : r.winner ? `🍺 drinks ${s.game.sips}` : '🍺 tie'}</small>
      <span class="bt-voters">${voters.map((v) => PB.avatar(v, 'sm')).join('')}</span>
    </div>`;
  }

  function matchupScreen(s) {
    const g = s.game;
    const m = g.matchup;
    let below = '';
    if (!m.result) {
      below = m.mine
        ? '<p class="center muted">That\'s your answer up there. Everyone else is voting…</p>'
        : m.canVote ? `<p class="center muted">${m.myVote ? 'Voted. Tap the other to change.' : 'Tap the better answer'} ${PB.timer()}</p>` : '';
      below += `<p class="center muted">${m.voted} / ${m.voters} voted</p>${moveOn(s, 'Reveal now')}`;
    } else {
      if (g.give?.from === s.me) below = `<p class="center"><b>You won! Give ${PB.plural(g.give.sips, 'sip')} to…</b></p>${PB.playerPicker('give', { exclude: [s.me] })}`;
      else if (g.give) below = `<p class="center muted">${esc(name(g.give.from))} is picking who drinks ${g.give.sips}…</p>`;
      below += s.isHost
        ? `<button data-act="next">${m.index + 1 < m.total ? 'Next matchup' : 'See the round'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} moves on…</p>`;
    }
    return `
      <div class="turn">🎤 Matchup ${m.index + 1} of ${m.total}<span>Question by ${author(m.author)}</span></div>
      <div class="prompt bt-prompt">${esc(m.question)}</div>
      <div class="bt-answers">${answerCard(s, 'a')}<span class="bt-vs">VS</span>${answerCard(s, 'b')}</div>
      ${below}
      ${PB.feed(3)}`;
  }

  function summaryScreen(s) {
    const g = s.game;
    const board = s.players.slice().sort((a, b) => (g.wins[b.id] || 0) - (g.wins[a.id] || 0));
    return `
      <div class="turn">🎤 Round ${g.round} of ${g.rounds} done${g.round >= g.rounds ? '<span>Next up: the final round. Grab a pen.</span>' : ''}</div>
      <div class="card"><h2>Matchups won</h2><ul class="players">${board.map((p) => `
        <li>${PB.avatar(p.id)}<span class="name">${esc(p.name)}</span><span class="count">${g.wins[p.id] || 0}</span></li>`).join('')}</ul></div>
      <div class="card bt-results"><h2>This round</h2>${g.results.map((r) => `
        <p><b>${esc(r.question)}</b><br><small>${r.winner ? `🏆 ${esc(name(r.winner))} beat ${esc(name(r.winner === r.a ? r.b : r.a))}` : `🍺 ${esc(name(r.a))} & ${esc(name(r.b))} tied`}</small></p>`).join('')}</div>
      ${PB.scoreboard()}
      ${s.isHost
        ? `<button data-act="nextRound">${g.round >= g.rounds ? '🎨 Final round' : 'Next round'}</button>`
        : `<p class="center muted">${esc(name(s.hostId))} starts the ${g.round >= g.rounds ? 'final' : 'next'} round…</p>`}`;
  }

  // ---------- Final round: draw your answer ----------

  const COLORS = ['#111111', '#e53950', '#3d7cff', '#2fbf71', '#f5c518', '#9b5cff', '#ffffff'];
  const SIZE = 400; // the drawing's pixels (shown at screen width)
  const pad = { strokes: [], color: COLORS[0], width: 6, round: null };

  function redraw(canvas) {
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, SIZE, SIZE);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const st of pad.strokes) {
      c.strokeStyle = st.color;
      c.lineWidth = st.width;
      c.beginPath();
      st.points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      if (st.points.length === 1) c.lineTo(st.points[0][0] + 0.1, st.points[0][1]);
      c.stroke();
    }
  }

  function setupPad() {
    const canvas = document.getElementById('bt-canvas');
    if (!canvas) return;
    redraw(canvas);
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
    };
    let drawing = null;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = { color: pad.color, width: pad.width, points: [at(e)] };
      pad.strokes.push(drawing);
      redraw(canvas);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      drawing.points.push(at(e));
      redraw(canvas);
    });
    const end = () => { drawing = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  function drawScreen(s) {
    const g = s.game;
    if (pad.round !== g.round) { pad.strokes = []; pad.round = g.round; }
    const sent = g.drew.includes(s.me);
    return `
      <div class="turn">🎨 Final round<span>Answer by drawing it ${PB.timer()}</span></div>
      <div class="prompt bt-prompt">${esc(g.finalQuestion)}</div>
      ${sent
        ? '<div class="card center"><p>✓ Drawing sent. Masterpiece.</p></div>'
        : `<canvas id="bt-canvas" class="bt-canvas" width="${SIZE}" height="${SIZE}"></canvas>
          <div class="bt-palette">${COLORS.map((c) => `<button class="bt-swatch ${pad.color === c ? 'on' : ''}" data-pad-color="${c}" style="background:${c}" aria-label="Colour"></button>`).join('')}</div>
          <div class="bt-tools">
            <button class="secondary ${pad.width === 6 ? 'on' : ''}" data-pad-width="6">✏️ Thin</button>
            <button class="secondary ${pad.width === 18 ? 'on' : ''}" data-pad-width="18">🖌️ Thick</button>
            <button class="secondary" data-pad="undo">↩️ Undo</button>
            <button class="secondary" data-pad="clear">🗑️</button>
          </div>
          <button data-pad="send">Send drawing</button>`}
      <p class="center muted" id="bt-progress">${g.drew.length} / ${s.players.filter((p) => p.connected).length} drawn</p>
      ${moveOn(s, 'Start voting now')}`;
  }

  function finalVoteScreen(s) {
    const g = s.game;
    return `
      <div class="turn">🎨 Final round<span>Vote for the best drawing ${PB.timer()}</span></div>
      <div class="prompt bt-prompt">${esc(g.finalQuestion)}</div>
      <div class="bt-gallery">${g.drawings.map((d) => `
        <button class="bt-art ${g.myFinalVote === d.i ? 'selected' : ''}" ${d.mine ? 'disabled' : `data-act="finalVote" data-i="${d.i}"`}>
          <img src="${esc(d.image)}" alt="A drawing">${d.mine ? '<small>Yours</small>' : ''}
        </button>`).join('')}</div>
      <p class="center muted">${g.finalVoted} / ${g.finalVoters} voted</p>
      ${moveOn(s, 'Reveal now')}`;
  }

  function finalScreen(s) {
    const g = s.game;
    const r = g.finalResult;
    const art = g.drawings.slice().sort((a, b) => r.counts[b.by] - r.counts[a.by]);
    const champs = s.players.slice().sort((a, b) => (g.points[b.id] || 0) - (g.points[a.id] || 0));
    const best = g.points[champs[0]?.id] || 0;
    const kings = champs.filter((p) => (g.points[p.id] || 0) === best && best > 0);
    let give = '';
    if (g.give?.from === s.me) give = `<p class="center"><b>You won the final! Give ${PB.plural(g.give.sips, 'sip')} to…</b></p>${PB.playerPicker('give', { exclude: [s.me] })}`;
    else if (g.give) give = `<p class="center muted">${esc(name(g.give.from))} is picking who drinks ${g.give.sips}…</p>`;
    return `
      <div class="drink win"><div class="big">👑 ${kings.length ? kings.map((p) => esc(p.name)).join(' & ') : 'Nobody'}</div>
        <div class="sips">${kings.length > 1 ? 'share' : 'is'} the Big Tom champion${kings.length > 1 ? 's' : ''}</div></div>
      <div class="prompt bt-prompt">${esc(g.finalQuestion)}</div>
      <div class="bt-gallery">${art.map((d) => {
        const voters = Object.entries(g.finalVotes).filter(([, t]) => t === d.by).map(([v]) => v);
        return `
        <div class="bt-art ${r.winners.includes(d.by) ? 'won' : r.losers.includes(d.by) ? 'lost' : ''}">
          <img src="${esc(d.image)}" alt="Drawing by ${esc(name(d.by))}">
          <small>${PB.avatar(d.by, 'sm')} ${esc(name(d.by))} · ${PB.plural(r.counts[d.by], 'vote')} ${r.winners.includes(d.by) ? '🏆' : r.losers.includes(d.by) ? `🍺 ${g.sips * 2}` : ''}</small>
          <span class="bt-voters">${voters.map((v) => PB.avatar(v, 'sm')).join('')}</span>
        </div>`;
      }).join('')}</div>
      ${give}
      <div class="card"><h2>Final scores</h2><ul class="players">${champs.map((p) => `
        <li>${PB.avatar(p.id)}<span class="name">${esc(p.name)}</span><span class="count">${g.points[p.id] || 0}</span></li>`).join('')}</ul>
        <p class="muted">A point per matchup won, and per vote in the final.</p></div>
      ${s.isHost ? '<button data-act="playAgain">Play again</button>' : ''}
      ${PB.feed(3)}`;
  }

  PB.register('bigTom', {
    sounds(prev, s) {
      if (s.phase !== prev.phase && (s.phase === 'answer' || s.phase === 'vote')) return ['turn'];
      if (s.phase === 'reveal' && prev.phase !== 'reveal') return ['card'];
      if (s.phase === 'draw' && prev.phase !== 'draw') return ['bell'];
      if (s.phase === 'final' && prev.phase !== 'final') return ['win'];
      return [];
    },
    render(s) {
      // Keep the canvas while drawing: only the progress line changes.
      if (s.phase === 'draw' && document.getElementById('bt-canvas') && !s.game.drew.includes(s.me)) {
        const pr = document.getElementById('bt-progress');
        if (pr) pr.textContent = `${s.game.drew.length} / ${s.players.filter((p) => p.connected).length} drawn`;
        return null;
      }
      // Don't redraw under someone typing, unless the screen itself has moved on.
      const key = `${s.phase}:${s.game.round}:${s.game.matchup?.index ?? ''}:${s.game.myQuestion ? 1 : 0}:${s.game.myTasks.filter((t) => t.answer !== null).length}`;
      const typing = document.activeElement?.dataset?.bt;
      if (typing && key === lastKey) return null;
      lastKey = key;
      if (s.phase === 'write') return writeScreen(s);
      if (s.phase === 'answer') return answerScreen(s);
      if (s.phase === 'vote' || s.phase === 'reveal') return matchupScreen(s);
      if (s.phase === 'summary') return summaryScreen(s);
      if (s.phase === 'draw') return drawScreen(s);
      if (s.phase === 'finalVote') return finalVoteScreen(s);
      if (s.phase === 'final') return finalScreen(s);
      return '';
    },
    afterRender() {
      setupPad();
      document.querySelectorAll('[data-pad-color]').forEach((b) => {
        b.onclick = () => { pad.color = b.dataset.padColor; document.querySelectorAll('[data-pad-color]').forEach((x) => x.classList.toggle('on', x === b)); };
      });
      document.querySelectorAll('[data-pad-width]').forEach((b) => {
        b.onclick = () => { pad.width = Number(b.dataset.padWidth); document.querySelectorAll('[data-pad-width]').forEach((x) => x.classList.toggle('on', x === b)); };
      });
      document.querySelectorAll('[data-pad]').forEach((b) => {
        b.onclick = () => {
          const canvas = document.getElementById('bt-canvas');
          if (b.dataset.pad === 'undo') pad.strokes.pop();
          else if (b.dataset.pad === 'clear') pad.strokes = [];
          else if (b.dataset.pad === 'send') {
            if (!pad.strokes.length) return;
            PB.act('drawing', { image: canvas.toDataURL('image/png') });
            return;
          }
          redraw(canvas);
        };
      });
      document.querySelectorAll('[data-bt]').forEach((el) => {
        el.addEventListener('input', () => { drafts[el.dataset.bt] = el.value; });
      });
      document.querySelectorAll('[data-bt-send]').forEach((b) => {
        b.onclick = () => {
          const text = (drafts[b.dataset.key] || '').trim();
          if (!text) return;
          if (b.dataset.btSend === 'question') PB.act('question', { text });
          else PB.act('answer', { m: b.dataset.m, text });
        };
      });
    },
  });
})();
