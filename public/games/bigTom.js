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
      <div class="turn">🎤 Round ${g.round}<span>Write a question for the others to answer</span></div>
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
        <div class="turn">🎤 Round ${g.round}<span>Everyone's answering ${PB.timer()}</span></div>
        <p class="center muted">You're not answering this round. Get ready to vote.</p>
        ${progress(s, g.answered)}
        ${moveOn(s, 'Start voting now')}`;
    }
    return `
      <div class="turn">🎤 Round ${g.round}<span>Answer these ${PB.timer()}</span></div>
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
      <div class="turn">🎤 Round ${g.round} done</div>
      <div class="card"><h2>Matchups won</h2><ul class="players">${board.map((p) => `
        <li>${PB.avatar(p.id)}<span class="name">${esc(p.name)}</span><span class="count">${g.wins[p.id] || 0}</span></li>`).join('')}</ul></div>
      <div class="card bt-results"><h2>This round</h2>${g.results.map((r) => `
        <p><b>${esc(r.question)}</b><br><small>${r.winner ? `🏆 ${esc(name(r.winner))} beat ${esc(name(r.winner === r.a ? r.b : r.a))}` : `🍺 ${esc(name(r.a))} & ${esc(name(r.b))} tied`}</small></p>`).join('')}</div>
      ${PB.scoreboard()}
      ${s.isHost ? '<button data-act="nextRound">Next round</button>' : `<p class="center muted">${esc(name(s.hostId))} starts the next round…</p>`}`;
  }

  PB.register('bigTom', {
    sounds(prev, s) {
      if (s.phase !== prev.phase && (s.phase === 'answer' || s.phase === 'vote')) return ['turn'];
      if (s.phase === 'reveal' && prev.phase !== 'reveal') return ['card'];
      return [];
    },
    render(s) {
      // Don't redraw under someone typing, unless the screen itself has moved on.
      const key = `${s.phase}:${s.game.round}:${s.game.matchup?.index ?? ''}:${s.game.myQuestion ? 1 : 0}:${s.game.myTasks.filter((t) => t.answer !== null).length}`;
      const typing = document.activeElement?.dataset?.bt;
      if (typing && key === lastKey) return null;
      lastKey = key;
      if (s.phase === 'write') return writeScreen(s);
      if (s.phase === 'answer') return answerScreen(s);
      if (s.phase === 'vote' || s.phase === 'reveal') return matchupScreen(s);
      if (s.phase === 'summary') return summaryScreen(s);
      return '';
    },
    afterRender() {
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
