// Screens for Bool Jeopardy. Server logic: games/jeopardy.js
(() => {
  const { esc, name } = PB;
  // The wager being built on this phone (Daily Double, Final), reset for each new one.
  let wager = null;
  let wagerFor = null;
  // The full-screen "settle your tabs" flash plays once per clue.
  let flash = { key: null, at: 0 };

  // "8 sips" → "1 shot + 3 sips" (as Shot Poker says it).
  const shotText = (sips, perShot) => {
    const shots = Math.floor(sips / perShot);
    const rest = sips % perShot;
    const parts = [];
    if (shots) parts.push(`${shots} shot${shots === 1 ? '' : 's'}`);
    if (rest || !shots) parts.push(PB.plural(rest, 'sip'));
    return parts.join(' + ');
  };
  const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
  const signed = (n) => (n > 0 ? `+${money(n)}` : money(n));
  const isMe = (s, id) => id === s.me && !PB.passAndPlay && !PB.isTV;
  // The player's own name (PB.name says "You" for yourself).
  const realName = (s, id) => s.players.find((p) => p.id === id)?.name ?? '???';
  const here = (s, id) => s.players.find((p) => p.id === id)?.connected;
  const colour = (id) => esc(PB.look(id).color);
  const LETTERS = ['A', 'B', 'C', 'D'];

  // ---------- Pieces ----------

  // Everyone's $ along the bottom: the picker marked, and who still owes.
  function scores(s) {
    const g = s.game;
    const rows = g.order.map((id) => s.players.find((p) => p.id === id)).filter(Boolean)
      .sort((a, b) => (g.scores[b.id] || 0) - (g.scores[a.id] || 0));
    return `<div class="jp-scores">${rows.map((p) => {
      const d = g.debts[p.id];
      const owes = d && !d.paid;
      return `<div class="jp-score ${p.id === g.pickerId && ['board', 'ddWager'].includes(s.phase) ? 'picker' : ''} ${p.connected ? '' : 'offline'}" style="--pc:${colour(p.id)}">
        ${PB.avatar(p.id, 'sm')}<span>${esc(p.name)}${isMe(s, p.id) ? ' (you)' : ''}</span>
        <b class="${(g.scores[p.id] || 0) < 0 ? 'neg' : ''}">${money(g.scores[p.id] || 0)}</b>
        ${owes ? `<small class="jp-owes">☠️ ${esc(d.text)}</small>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  // The board: category names over their $ values; picked clues are blank.
  function board(s, { tappable = false, tv = false } = {}) {
    const g = s.game;
    const cols = g.board.length;
    // (The house category, about the venue, wears the venue's emoji.)
    const heads = g.board.map((c) => `<div class="jp-cat ${c.emoji ? 'house' : ''}">${c.emoji ? `<i>${esc(c.emoji)}</i>` : ''}<span>${esc(c.name)}</span></div>`).join('');
    let cells = '';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < cols; c++) {
        const x = g.board[c].cells[r];
        const last = g.clue && g.clue.c === c && g.clue.r === r;
        if (x.used) cells += `<div class="jp-cell used ${last ? 'last' : ''}"></div>`;
        else if (tappable) cells += `<button class="jp-cell" data-act="pick" data-c="${c}" data-r="${r}">$${x.value}</button>`;
        else cells += `<div class="jp-cell">$${x.value}</div>`;
      }
    }
    return `<div class="jp-board ${tv ? 'tv' : ''} ${tappable ? 'mine' : ''}" style="--cols:${cols}">${heads}${cells}</div>`;
  }

  // How the last clue went, in a line.
  function lastLine(s) {
    const l = s.game.last;
    if (!l) return '';
    const parts = l.results.map((x) => `${x.right ? '✅' : x.left ? '🚪' : '❌'} ${esc(realName(s, x.id))}${x.delta ? ` ${signed(x.delta)}` : ''}`);
    return `<p class="jp-last">Last: ${esc(l.cat)} $${l.value}${l.dd ? ' (Daily Double)' : ''} · ${parts.length ? parts.join(' · ') : 'nobody buzzed'} · it was <b>${esc(l.answer)}</b></p>`;
  }

  function clueCard(s, { big = false } = {}) {
    const k = s.game.clue;
    return `<div class="jp-clue ${big ? 'big' : ''} ${k.dd ? 'dd' : ''}">
      <div class="jp-clue-head"><span>${esc(k.cat)}</span><b>${k.dd ? `Daily Double · ${esc(shotText(k.wager || 0, s.game.perShot))}` : `$${k.value}`}</b></div>
      <p class="jp-q">${esc(k.q || '')}</p>
    </div>`;
  }

  // The four options: tappable for whoever's answering, else just shown. Wrong picks are crossed
  // out; at the reveal, the right one lights up.
  // Only whoever's answering gets buttons; everyone else sees a plain list (with who picked what).
  function options(s, list, { act = null, answer = null, wrong = [], mine = null, picks = [] } = {}) {
    if (!list) return '';
    return `<div class="jp-options ${act ? '' : 'watching'}">${list.map((o, i) => {
      const cls = [answer === i ? 'right' : '', wrong.includes(i) ? 'wrong' : '', mine === i ? 'mine' : ''].join(' ');
      const tag = act && !wrong.includes(i) ? 'button' : 'div';
      const who = picks.filter((x) => x.pick === i).map((x) => PB.avatar(x.id, 'sm')).join('');
      return `<${tag} class="jp-opt ${cls}" ${tag === 'button' ? `data-act="${act}" data-i="${i}"` : ''}><i>${LETTERS[i]}</i><span>${esc(o)}</span>${who ? `<em class="jp-who">${who}</em>` : ''}</${tag}>`;
    }).join('')}</div>`;
  }

  // Who got what on this clue.
  function results(s, list) {
    if (!list?.length) return '';
    const g = s.game;
    const k = g.clue;
    return `<ul class="jp-results">${list.map((x) => {
      const sips = k?.dd ? k.wager : k?.sips;
      const what = x.right ? 'got it' : x.left ? 'left' : x.timeout ? 'ran out of time' : 'missed';
      const tab = !x.right && !x.left && sips ? ` · 🍺 ${esc(shotText(sips, g.perShot))} on the tab` : '';
      return `<li class="${x.right ? 'ok' : 'bad'}">${PB.avatar(x.id, 'sm')}<span><b>${esc(realName(s, x.id))}</b> ${what}${tab}</span><em>${x.delta ? signed(x.delta) : ''}</em></li>`;
    }).join('')}</ul>`;
  }

  // A sip wager: − / + and the most there is.
  function wagerPicker(s, key, act, label) {
    const g = s.game;
    if (wagerFor !== key) { wager = Math.min(g.cap, Math.max(1, Math.round(g.cap / 3))); wagerFor = key; }
    return `<div class="card jp-wager">
      <div class="ld-qty">
        <button class="secondary" data-jp="step" data-step="-1" ${wager <= 1 ? 'disabled' : ''}>−</button>
        <b>${wager}</b>
        <button class="secondary" data-jp="step" data-step="1" ${wager >= g.cap ? 'disabled' : ''}>+</button>
      </div>
      <div class="sp-quick">
        <button class="secondary" data-jp="set" data-to="${Math.min(g.cap, g.perShot)}">1 shot</button>
        <button class="secondary" data-jp="set" data-to="${g.cap}">Max (${g.cap})</button>
      </div>
      <button data-act="${act}" data-sips="${wager}">${label} ${esc(shotText(wager, g.perShot))}<small>Right: +${money(wager * 200)}${act === 'wager' ? ' and you hand them out' : ''} · Wrong: they're on your tab</small></button>
    </div>`;
  }

  // Tabs to settle. In the middle of a clue it's a card (the buzzer stays in reach); between
  // clues it's Shot Poker's "All debts must be paid" flash right across the screen.
  function myTab(s) {
    const d = s.game.debts[s.me];
    if (!d || d.paid || PB.isTV) return '';
    return `<div class="card jp-owe"><span>☠️ ${PB.passAndPlay ? `${esc(name(s.me))} owes` : 'You owe'} <b>${esc(d.text)}</b></span><button class="sp-pay" data-act="paid">☠️🥃 Tab settled</button></div>`;
  }
  function debtFlash(s) {
    const g = s.game;
    if (!g.unpaid.length) return '';
    const mine = g.debts[s.me] && !g.debts[s.me].paid && !PB.isTV;
    const key = `${g.clueNo}:${s.phase}`;
    if (flash.key !== key) flash = { key, at: Date.now() };
    const elapsed = Date.now() - flash.at;
    const text = s.phase === 'over' ? 'Settle your tabs…' : g.left ? 'All tabs must be settled before the next clue…' : 'All tabs must be settled before the Final…';
    return `${elapsed < 2600 ? `<div class="sp-takeover" style="animation-delay:-${elapsed}ms"><span>☠️ ${text.toUpperCase()}</span></div>` : ''}
    <div class="sp-flash">
      <div class="sp-flash-text">☠️ ${text}</div>
      <ul class="sp-flash-list">${Object.entries(g.debts).map(([id, d]) => `
        <li class="${d.paid ? 'paid' : ''}">${PB.avatar(id, 'sm')}<b>${esc(realName(s, id))}</b><span>${esc(d.text)}</span><em>${d.paid ? '✅ Settled' : '⏳ Owes'}</em></li>`).join('')}</ul>
      ${mine ? '<button class="sp-settle" data-act="paid">☠️🥃 Tab settled</button>' : ''}
    </div>`;
  }

  // This game's drinks in shots and sips, and the whole night's.
  function tab(s) {
    const g = s.game;
    const { head, hidden } = PB.tabHead('🍺 Tab');
    if (hidden) return `<div class="card sp-tab">${head}</div>`;
    const rows = s.players.slice().sort((a, b) => b.drinks - a.drinks || (b.total || 0) - (a.total || 0));
    return `<div class="card sp-tab">${head}
      <ul><li class="sp-tab-head"><span></span><small>This game</small><small>Tonight</small></li>${rows.map((p) => `
      <li class="${p.connected ? '' : 'offline'}">${PB.avatar(p.id, 'sm')}<span>${esc(p.name)}${isMe(s, p.id) ? ' (you)' : ''}</span>
        <b>${p.drinks ? esc(shotText(p.drinks, g.perShot)) : '–'}</b><em>${PB.plural(p.total || 0, 'sip')}</em></li>`).join('')}</ul></div>`;
  }

  const banner = (title, sub = '') => `<div class="turn jp-head">${title}${sub ? `<span>${sub}</span>` : ''}</div>`;

  // ---------- Phone screens ----------

  function voteScreen(s) {
    const g = s.game;
    const v = g.vote;
    const locked = v.lockedIn.includes(s.me);
    const waiting = s.players.filter((p) => p.connected && !v.lockedIn.includes(p.id)).map((p) => esc(realName(s, p.id)));
    if (s.phase === 'voted') {
      return `${banner('🗳️ The votes are in', 'Here’s your board')}
        ${voteGrid(s, { result: true })}
        ${houseLine(g.vote)}
        ${scores(s)}`;
    }
    return `${banner('🗳️ Pick the categories', `Tap up to ${g.maxPicks}: the top ${v.voted} make the board ${g.relaxed ? '' : PB.timer()}`)}
      ${PB.passAndPlay ? `<p class="center jp-whose">${PB.avatar(s.me, 'sm')} <b>${esc(name(s.me))}</b>’s picks</p>` : ''}
      ${voteGrid(s, { tappable: !locked })}
      ${houseLine(v)}
      ${locked
        ? `<p class="center muted">✓ Locked in${waiting.length ? ` · waiting on ${waiting.join(', ')}` : ''}</p>`
        : `<button class="jp-lock" data-act="lockIn">🔒 Lock in (${v.mine.length}/${g.maxPicks})</button>`}
      ${scores(s)}`;
  }

  // The fifth column, which isn't voted on: the venue's own.
  const houseLine = (v) => `<p class="jp-house">+ the house category: <b>${esc(v.house.emoji)} ${esc(v.house.name)}</b></p>`;

  function voteGrid(s, { tappable = false, result = false, counts = false } = {}) {
    const v = s.game.vote;
    const order = result ? v.pool.map((_, i) => i).sort((a, b) => (v.chosen.includes(b) - v.chosen.includes(a)) || v.counts[b] - v.counts[a]) : v.pool.map((_, i) => i);
    const most = Math.max(1, ...v.counts);
    return `<div class="jp-vote-grid ${result ? 'result' : ''}">${order.map((i) => {
      const on = v.mine.includes(i) && !PB.isTV;
      const won = result && v.chosen.includes(i);
      const n = v.counts[i];
      const tag = tappable ? 'button' : 'div';
      const show = counts || result;
      return `<${tag} class="jp-vote ${on ? 'on' : ''} ${won ? 'won' : ''} ${result && !won ? 'lost' : ''}" ${tappable ? `data-act="toggle" data-i="${i}"` : ''}>
        <span>${esc(v.pool[i])}</span>${on && !result ? '<i>✓</i>' : ''}
        ${show ? `<b>${PB.plural(n, 'vote')}</b><em style="width:${Math.round((n / most) * 100)}%"></em>` : ''}
      </${tag}>`;
    }).join('')}</div>`;
  }

  function boardScreen(s) {
    const g = s.game;
    const mine = g.pickerId === s.me;
    const blocked = g.unpaid.length > 0;
    const head = !g.left
      ? banner('🏁 Board cleared', g.final ? 'The Final is next' : 'That’s the game')
      : PB.turn(g.pickerId, blocked ? 'Tabs first, then the next clue' : mine ? 'Pick a clue' : 'Picking a clue…');
    return `${head}
      ${lastLine(s)}
      ${board(s, { tappable: mine && !blocked && !PB.isTV })}
      ${scores(s)}
      ${debtFlash(s)}
      ${tab(s)}`;
  }

  function ddScreen(s) {
    const g = s.game;
    const k = g.clue;
    const mine = g.pickerId === s.me;
    return `<div class="jp-dd"><b>DAILY<br>DOUBLE!</b><span>${esc(k.cat)} · $${k.value}</span></div>
      ${mine
        ? `<p class="center">Wager sips before you see the clue. Only you answer.</p>${wagerPicker(s, `dd:${g.clueNo}`, 'wager', 'Wager')}`
        : `<p class="center muted">${PB.avatar(g.pickerId, 'sm')} ${esc(name(g.pickerId))} is wagering…</p>`}
      ${scores(s)}`;
  }

  // The clue, the buzzer and the answer.
  function clueScreen(s) {
    const g = s.game;
    const k = g.clue;
    let below = '';
    if (g.stage === 'read') {
      below = `<button class="jp-buzz wait" disabled>${k.dd ? `${esc(realName(s, g.pickerId))} answers…` : 'Get ready…'}</button>`;
    } else if (g.stage === 'open') {
      if (PB.passAndPlay) {
        const can = s.players.filter((p) => p.connected && !k.locked.includes(p.id));
        below = `<div class="card jp-ring"><b>🔔 Who rang in first? ${PB.timer()}</b>
          <div class="jp-ring-grid">${can.map((p) => `<button data-act="buzz" data-who="${esc(p.id)}" style="--pc:${colour(p.id)};--pc-ink:${PB.inkOn(PB.look(p.id).color)}">${PB.avatar(p.id, 'sm')}<span>${esc(p.name)}</span></button>`).join('')}</div></div>`;
      } else if (k.locked.includes(s.me)) {
        below = `<div class="jp-buzz out">🔒 You’re out of this one</div><p class="center muted">The others can still buzz in ${PB.timer()}</p>`;
      } else {
        below = `<button class="jp-buzz live" data-act="buzz" style="--pc:${colour(s.me)};--pc-ink:${PB.inkOn(PB.look(s.me).color)}">BUZZ!</button><p class="center muted">First to buzz answers ${PB.timer()}</p>`;
      }
    } else if (g.stage === 'answer') {
      const id = k.buzzerId;
      if (id === s.me) {
        below = `<div class="jp-in mine" style="--pc:${colour(id)}">🔔 ${PB.passAndPlay ? `${esc(name(id))}, you’re in!` : 'You’re in!'} Pick one ${PB.timer()}</div>
          ${options(s, k.options, { act: 'answer', wrong: k.wrong })}`;
      } else {
        below = `<div class="jp-in" style="--pc:${colour(id)}">${PB.avatar(id, 'sm')} ${esc(name(id))} is answering… ${PB.timer()}</div>
          ${options(s, k.options, { wrong: k.wrong, picks: k.results })}`;
      }
    }
    // (The options only show once someone's buzzed in: after a miss, they stay up with it crossed out.)
    const between = g.stage === 'open' && k.options ? options(s, k.options, { wrong: k.wrong, picks: k.results }) : '';
    return `${clueCard(s)}
      ${below}
      ${myTab(s)}
      ${between}
      ${results(s, k.results)}
      ${scores(s)}`;
  }

  function revealScreen(s) {
    const g = s.game;
    const k = g.clue;
    const right = k.results.find((x) => x.right);
    const mine = k.results.find((x) => x.id === s.me && !PB.passAndPlay)?.pick ?? null;
    let give = '';
    if (g.give) give = PB.giveSips(s, { from: g.give.from, sips: g.give.sips, key: `jp:${g.clueNo}`, title: g.give.from === s.me ? '💥 Daily Double!' : '' });
    return `${banner(right ? `✅ ${esc(realName(s, right.id))} got it!` : k.results.length ? '❌ Nobody got it' : '⏱ Nobody buzzed in', `It was ${esc(k.options[k.answer])}`)}
      ${PB.passAndPlay ? '' : myResult(s)}
      ${clueCard(s)}
      ${options(s, k.options, { answer: k.answer, wrong: k.wrong, mine, picks: k.results })}
      ${results(s, k.results)}
      ${give}
      ${myTab(s)}
      ${scores(s)}`;
  }

  function finalWagerScreen(s) {
    const g = s.game;
    const f = g.finalRound;
    const waiting = s.players.filter((p) => p.connected && !f.wagered.includes(p.id)).map((p) => esc(realName(s, p.id)));
    return `<div class="jp-final-cat"><small>🏁 The Final · the category is</small><b>${esc(f.cat)}</b></div>
      ${f.myWager
        ? `<p class="center">Your wager: <b>${esc(shotText(f.myWager, g.perShot))}</b></p><p class="center muted">Waiting on ${waiting.join(', ') || 'nobody'}… ${g.relaxed ? '' : PB.timer()}</p>`
        : `<p class="center">${PB.passAndPlay ? `<b>${esc(name(s.me))}</b>, wager` : 'Wager'} in secret, before you see the clue. ${g.relaxed ? '' : PB.timer()}</p>${wagerPicker(s, `final:${s.me}`, 'finalWager', 'Wager')}`}
      ${scores(s)}`;
  }

  function finalAnswerScreen(s) {
    const g = s.game;
    const f = g.finalRound;
    const canAnswer = f.myWager && f.myAnswer === null;
    const waiting = s.players.filter((p) => p.connected && f.wagered.includes(p.id) && !f.answered.includes(p.id)).map((p) => esc(realName(s, p.id)));
    return `<div class="jp-clue final"><div class="jp-clue-head"><span>🏁 Final · ${esc(f.cat)}</span><b>${f.myWager ? esc(shotText(f.myWager, g.perShot)) : ''}</b></div><p class="jp-q">${esc(f.q)}</p></div>
      ${canAnswer
        ? `<p class="center">${PB.passAndPlay ? `<b>${esc(name(s.me))}</b>, pick` : 'Pick'} your answer in secret ${g.relaxed ? '' : PB.timer()}</p>${options(s, f.options, { act: 'finalAnswer' })}`
        : `<p class="center muted">${f.myAnswer !== null ? '✓ Answer locked in. ' : ''}Waiting on ${waiting.join(', ') || 'nobody'}… ${g.relaxed ? '' : PB.timer()}</p>`}
      ${scores(s)}`;
  }

  function standings(s) {
    const g = s.game;
    const rows = g.order.map((id) => s.players.find((p) => p.id === id)).filter(Boolean).sort((a, b) => (g.scores[b.id] || 0) - (g.scores[a.id] || 0));
    const fr = Object.fromEntries((g.finalRound?.results || []).map((r) => [r.id, r]));
    return `<ol class="jp-standings">${rows.map((p, i) => {
      const r = fr[p.id];
      const pickText = r ? (r.pick === null ? 'no answer' : esc(g.finalRound.options[r.pick])) : '';
      return `<li class="${g.winners?.includes(p.id) ? 'won' : ''}" style="--pc:${colour(p.id)}"><i>${i + 1}</i>${PB.avatar(p.id, 'sm')}
        <span><b>${esc(p.name)}</b>${r ? `<small>${r.right ? '✅' : '❌'} ${pickText} · wagered ${esc(shotText(r.wager, g.perShot))}${r.drinks ? ' · 🍺 owes it' : r.top && !r.right ? ' · top score: drinks nothing' : ''}</small>` : ''}</span>
        <em class="${(g.scores[p.id] || 0) < 0 ? 'neg' : ''}">${money(g.scores[p.id] || 0)}</em></li>`;
    }).join('')}</ol>`;
  }

  function overScreen(s) {
    const g = s.game;
    const f = g.finalRound;
    const names = (g.winners || []).map((id) => esc(name(id))).join(' & ');
    return `<div class="turn jp-head jp-win">🏆 ${names || 'Nobody'} ${g.winners?.length === 1 && !isMe(s, g.winners[0]) ? 'wins' : 'win'}!<span>Bool Jeopardy champion${g.winners?.length === 1 ? '' : 's'}</span></div>
      ${f ? `<div class="jp-clue final"><div class="jp-clue-head"><span>🏁 Final · ${esc(f.cat)}</span><b></b></div><p class="jp-q">${esc(f.q)}</p></div>
        ${options(s, f.options, { answer: f.answer, mine: PB.passAndPlay ? null : f.myAnswer })}` : ''}
      <div class="card"><h2>Final standings</h2>${standings(s)}</div>
      ${debtFlash(s)}
      ${tab(s)}
      ${PB.feed(4)}`;
  }


  // ---------- With a TV: the phone is a controller ----------
  // The TV has the board, the clue and the scores. A phone only has what its player does: tick
  // categories, pick a clue, BUZZ, answer, wager, settle up. Everything else is a pointer to the
  // TV and how you're doing.

  const controller = (s) => s.tv && !PB.isTV && !PB.passAndPlay;

  // "👀 Look at the TV": what's going on, in a line, with whoever it's about.
  const lookUp = (id, text, sub = '') => `<div class="card jp-look" ${id ? `style="--pc:${colour(id)}"` : ''}>
    <small>📺 On the TV</small>
    <b>${id ? PB.avatar(id, 'lg') : ''}${text}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;

  // You, at the bottom: your $ and what you owe (with the button to settle it).
  function meBar(s) {
    const g = s.game;
    const d = g.debts[s.me];
    const owes = d && !d.paid;
    const rank = g.order.slice().sort((a, b) => (g.scores[b] || 0) - (g.scores[a] || 0)).indexOf(s.me) + 1;
    return `<div class="jp-me ${owes ? 'owes' : ''}" style="--pc:${colour(s.me)}">
      ${PB.avatar(s.me, 'sm')}<b class="${(g.scores[s.me] || 0) < 0 ? 'neg' : ''}">${money(g.scores[s.me] || 0)}</b><small>${rank ? `#${rank} of ${g.order.length}` : ''}</small>
      ${owes ? `<button class="sp-pay" data-act="paid">☠️🥃 ${esc(d.text)}: settled</button>` : ''}</div>`;
  }

  // The vote as a checklist.
  function ctlVote(s) {
    const g = s.game;
    const v = g.vote;
    const locked = v.lockedIn.includes(s.me);
    if (s.phase === 'voted') {
      const names = [...v.chosen.map((i) => esc(v.pool[i])), `${esc(v.house.emoji)} ${esc(v.house.name)}`];
      return `${lookUp(null, '🗳️ The votes are in', names.join(' · '))}${meBar(s)}`;
    }
    const waiting = s.players.filter((p) => p.connected && !v.lockedIn.includes(p.id)).map((p) => esc(realName(s, p.id)));
    return `${banner('🗳️ Pick the categories', `Up to ${g.maxPicks}: the top ${v.voted} make the board ${PB.timer()}`)}
      <div class="jp-checklist ${locked ? 'locked' : ''}">${v.pool.map((n, i) => {
        const on = v.mine.includes(i);
        return locked
          ? `<div class="jp-check ${on ? 'on' : ''}"><i>${on ? '✓' : ''}</i><span>${esc(n)}</span></div>`
          : `<button class="jp-check ${on ? 'on' : ''}" data-act="toggle" data-i="${i}"><i>${on ? '✓' : ''}</i><span>${esc(n)}</span></button>`;
      }).join('')}</div>
      ${houseLine(v)}
      ${locked
        ? `<p class="center muted">✓ Locked in${waiting.length ? ` · waiting on ${waiting.join(', ')}` : ''}</p>`
        : `<button class="jp-lock" data-act="lockIn">🔒 Lock in (${v.mine.length}/${g.maxPicks})</button>`}
      ${meBar(s)}`;
  }

  // The picker picks: each category, then its values left (no show board: that's on the TV).
  function ctlBoard(s) {
    const g = s.game;
    const blocked = g.unpaid.length > 0;
    if (!g.left) return `${lookUp(null, '🏁 Board cleared', g.final ? (blocked ? 'The Final starts once every tab is settled' : 'The Final is next') : '')}${meBar(s)}${debtFlash(s)}`;
    if (g.pickerId !== s.me || blocked) {
      const who = blocked ? null : g.pickerId;
      const text = blocked ? '☠️ Settling tabs' : `${esc(name(g.pickerId))} is picking a clue`;
      return `${lookUp(who, text, blocked ? `Then ${esc(name(g.pickerId))} picks the next clue` : '')}${meBar(s)}${debtFlash(s)}`;
    }
    return `${PB.turn(g.pickerId, 'Pick a clue')}
      <div class="jp-picklist">${g.board.map((c, ci) => {
        const left = c.cells.map((x, r) => ({ ...x, r })).filter((x) => !x.used);
        if (!left.length) return '';
        return `<div class="jp-pickrow"><b>${c.emoji ? `${esc(c.emoji)} ` : ''}${esc(c.name)}</b>
          <div>${left.map((x) => `<button data-act="pick" data-c="${ci}" data-r="${x.r}">$${x.value}</button>`).join('')}</div></div>`;
      }).join('')}</div>
      ${meBar(s)}`;
  }

  function ctlDd(s) {
    const g = s.game;
    const k = g.clue;
    if (g.pickerId !== s.me) return `${lookUp(g.pickerId, `💥 ${esc(name(g.pickerId))} found the Daily Double`, 'Only they answer this one')}${meBar(s)}`;
    return `<div class="jp-dd"><b>DAILY<br>DOUBLE!</b><span>${esc(k.cat)} · $${k.value}</span></div>
      <p class="center">Wager sips before you see the clue. Only you answer.</p>
      ${wagerPicker(s, `dd:${g.clueNo}`, 'wager', 'Wager')}
      ${meBar(s)}`;
  }

  // How the clue went for you, in a line (no reveal of the others' screens: the TV has that).
  function myResult(s) {
    const g = s.game;
    const k = g.clue;
    const r = k.results.find((x) => x.id === s.me);
    if (!r) return '';
    const sips = k.dd ? k.wager : k.sips;
    return `<div class="jp-mine ${r.right ? 'ok' : 'bad'}">${r.right ? '✅ You got it' : r.timeout ? '⏱ Out of time' : '❌ You missed'}
      <b>${r.delta ? signed(r.delta) : ''}</b>${!r.right && !r.left && sips ? `<small>🍺 ${esc(shotText(sips, g.perShot))} on your tab</small>` : ''}</div>`;
  }

  function ctlClue(s) {
    const g = s.game;
    const k = g.clue;
    // The clue itself, on every phone too (not only the TV), so nobody has to look up to read it.
    const head = `<p class="jp-ctl-head"><span>${esc(k.cat)}</span><b>${k.dd ? 'Daily Double' : `$${k.value}`}</b></p>${k.q ? `<p class="jp-ctl-q">${esc(k.q)}</p>` : ''}`;
    const me = colour(s.me);
    const ink = PB.inkOn(PB.look(s.me).color);
    if (g.stage === 'answer' && k.buzzerId === s.me) {
      return `${head}
        <div class="jp-in mine" style="--pc:${me}">🔔 You’re in! Pick one ${PB.timer()}</div>
        ${options(s, k.options, { act: 'answer', wrong: k.wrong })}
        ${meBar(s)}`;
    }
    let main;
    if (k.dd) main = lookUp(g.pickerId, `💥 ${esc(name(g.pickerId))} is answering alone`, PB.timer());
    else if (g.stage === 'read') main = '<button class="jp-buzz giant wait" disabled>Get ready…</button>';
    else if (g.stage === 'answer') main = lookUp(k.buzzerId, `${esc(name(k.buzzerId))} is answering…`, PB.timer());
    else if (k.locked.includes(s.me)) main = `<div class="jp-buzz giant out">🔒<span>You’re out of this one</span></div>`;
    else main = `<button class="jp-buzz giant live" data-act="buzz" style="--pc:${me};--pc-ink:${ink}">BUZZ!</button>`;
    return `${head}${main}${myResult(s)}${meBar(s)}`;
  }

  function ctlReveal(s) {
    const g = s.game;
    const k = g.clue;
    const right = k.results.find((x) => x.right);
    const title = right ? `✅ ${esc(name(right.id))} got it` : k.results.length ? '❌ Nobody got it' : '⏱ Nobody buzzed in';
    const give = g.give ? PB.giveSips(s, { from: g.give.from, sips: g.give.sips, key: `jp:${g.clueNo}`, title: g.give.from === s.me ? '💥 Daily Double!' : '' }) : '';
    return `${lookUp(right?.id, title, `It was <b>${esc(k.options[k.answer])}</b>`)}${myResult(s)}${give}${meBar(s)}`;
  }

  function ctlFinal(s) {
    const g = s.game;
    const f = g.finalRound;
    const head = `<p class="jp-ctl-head"><span>🏁 The Final</span><b>${esc(f.cat)}</b></p>`;
    if (s.phase === 'finalWager') {
      if (f.myWager) {
        const waiting = s.players.filter((p) => p.connected && !f.wagered.includes(p.id)).map((p) => esc(realName(s, p.id)));
        return `${head}${lookUp(null, `✓ You wagered ${esc(shotText(f.myWager, g.perShot))}`, `Waiting on ${waiting.join(', ') || 'nobody'}… ${PB.timer()}`)}${meBar(s)}`;
      }
      return `${head}<p class="center">Wager in secret, before you see the clue ${PB.timer()}</p>${wagerPicker(s, `final:${s.me}`, 'finalWager', 'Wager')}${meBar(s)}`;
    }
    if (f.myWager && f.myAnswer === null) {
      return `${head}${f.q ? `<p class="jp-ctl-q">${esc(f.q)}</p>` : ''}<p class="center">Pick your answer in secret ${PB.timer()}</p>${options(s, f.options, { act: 'finalAnswer' })}${meBar(s)}`;
    }
    const waiting = s.players.filter((p) => p.connected && f.wagered.includes(p.id) && !f.answered.includes(p.id)).map((p) => esc(realName(s, p.id)));
    return `${head}${lookUp(null, f.myAnswer !== null ? `✓ Locked in: ${esc(f.options[f.myAnswer])}` : 'The Final', `Waiting on ${waiting.join(', ') || 'nobody'}… ${PB.timer()}`)}${meBar(s)}`;
  }

  function ctlOver(s) {
    const g = s.game;
    const names = (g.winners || []).map((id) => esc(name(id))).join(' & ');
    const won = g.winners?.includes(s.me);
    const r = g.finalRound?.results?.find((x) => x.id === s.me);
    const final = r ? `<div class="jp-mine ${r.right ? 'ok' : 'bad'}">🏁 Final: ${r.right ? '✅ right' : '❌ wrong'} <b>${signed(r.delta)}</b>${r.drinks ? `<small>🍺 ${esc(shotText(r.drinks, g.perShot))} on your tab</small>` : r.top && !r.right ? '<small>Top score: you drink nothing</small>' : ''}</div>` : '';
    return `<div class="turn jp-head jp-win">${won ? '🏆 You win!' : `🏆 ${names || 'Nobody'} win${g.winners?.length === 1 ? 's' : ''}`}<span>Bool Jeopardy</span></div>
      ${final}
      <div class="card"><h2>Final standings</h2>${standings(s)}</div>
      ${meBar(s)}
      ${debtFlash(s)}`;
  }

  function controllerScreen(s) {
    switch (s.phase) {
      case 'vote': case 'voted': return ctlVote(s);
      case 'board': return ctlBoard(s);
      case 'ddWager': return ctlDd(s);
      case 'clue': return ctlClue(s);
      case 'reveal': return ctlReveal(s);
      case 'finalWager': case 'finalAnswer': return ctlFinal(s);
      case 'over': return ctlOver(s);
      default: return '';
    }
  }

  // ---------- TV ----------

  // Scores down the side, with tabs to settle.
  function tvSide(s) {
    const g = s.game;
    const rows = g.order.map((id) => s.players.find((p) => p.id === id)).filter(Boolean).sort((a, b) => (g.scores[b.id] || 0) - (g.scores[a.id] || 0));
    return `<div class="jp-side">${rows.map((p) => {
      const d = g.debts[p.id];
      const active = (s.phase === 'board' || s.phase === 'ddWager') && p.id === g.pickerId ? 'picker'
        : g.clue?.buzzerId === p.id && s.phase === 'clue' ? 'buzzer' : '';
      return `<div class="jp-podium ${active} ${p.connected ? '' : 'offline'}" style="--pc:${colour(p.id)}">
        ${PB.avatar(p.id, '')}<span>${esc(p.name)}</span><b class="${(g.scores[p.id] || 0) < 0 ? 'neg' : ''}">${money(g.scores[p.id] || 0)}</b>
        ${d ? `<small class="${d.paid ? 'paid' : ''}">${d.paid ? '✅' : '☠️'} ${esc(d.text)}</small>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function tvScreen(s) {
    const g = s.game;
    const turnFor = (id, text) => `<div class="turn jp-tv-turn" style="--pc:${colour(id)}">${PB.avatar(id, 'sm')} ${esc(name(id))} ${text}</div>`;
    let main = '';
    switch (s.phase) {
      case 'vote':
      case 'voted': {
        const v = g.vote;
        main = `<div class="jp-tv-title">${s.phase === 'vote' ? `🗳️ Vote for the categories on your phones ${g.relaxed ? '' : PB.timer()}` : '🗳️ The votes are in'}</div>
          ${voteGrid(s, { counts: true, result: s.phase === 'voted' })}
          ${houseLine(v)}
          ${s.phase === 'vote' ? `<p class="jp-tv-locked">${v.lockedIn.length ? `Locked in: ${v.lockedIn.map((id) => PB.avatar(id, 'sm')).join('')}` : `Up to ${g.maxPicks} picks each: the top ${v.voted} make the board`}</p>` : ''}`;
        break;
      }
      case 'board':
        main = `${g.left && !g.unpaid.length ? turnFor(g.pickerId, 'picks') : ''}
          ${board(s, { tv: true })}
          ${g.unpaid.length ? `<div class="jp-tv-tabs">☠️ All tabs must be settled before ${g.left ? 'the next clue' : 'the Final'}… <span>${g.unpaid.map((id) => `${PB.avatar(id, 'sm')} ${esc(realName(s, id))}`).join(' · ')}</span></div>` : g.left ? `<p class="jp-tv-status">${PB.avatar(g.pickerId, 'sm')} ${esc(name(g.pickerId))} is picking a clue…</p>` : `<p class="jp-tv-status">🏁 Board cleared!</p>`}
          ${lastLine(s)}`;
        break;
      case 'ddWager':
        main = `${turnFor(g.pickerId, 'found the Daily Double!')}<div class="jp-dd tv"><b>DAILY<br>DOUBLE!</b><span>${esc(g.clue.cat)} · ${esc(name(g.pickerId))} is wagering…</span></div>`;
        break;
      case 'clue': {
        const k = g.clue;
        let status = '';
        if (g.stage === 'read') status = `<div class="jp-tv-status">${k.dd ? `💥 ${esc(name(g.pickerId))} answers this one alone` : 'Buzzers open in a moment…'}</div>`;
        else if (g.stage === 'open') status = `<div class="jp-tv-status live">🔔 BUZZERS OPEN ${PB.timer()}</div>`;
        else status = `<div class="jp-tv-status in" style="--pc:${colour(k.buzzerId)}">${PB.avatar(k.buzzerId, '')} ${esc(name(k.buzzerId))} is in! ${PB.timer()}</div>`;
        main = `${k.buzzerId ? turnFor(k.buzzerId, 'is answering') : ''}${clueCard(s, { big: true })}${status}
          ${options(s, k.options, { wrong: k.wrong })}
          ${results(s, k.results)}`;
        break;
      }
      case 'reveal': {
        const k = g.clue;
        const right = k.results.find((x) => x.right);
        main = `${clueCard(s, { big: true })}
          ${options(s, k.options, { answer: k.answer, wrong: k.wrong })}
          <div class="jp-tv-status ${right ? 'in' : ''}" ${right ? `style="--pc:${colour(right.id)}"` : ''}>${right ? `✅ ${esc(name(right.id))} got it! ${signed(right.delta)}` : k.results.length ? '❌ Nobody got it' : '⏱ Nobody buzzed in'}</div>
          ${results(s, k.results)}
          ${g.give ? PB.giveWait(s, [g.give.from], g.give.sips, '💥 Daily Double') : ''}`;
        break;
      }
      case 'finalWager': {
        const f = g.finalRound;
        main = `<div class="jp-final-cat tv"><small>🏁 The Final · the category is</small><b>${esc(f.cat)}</b></div>
          <p class="jp-tv-status">Wager in secret on your phones ${g.relaxed ? '' : PB.timer()}</p>
          <p class="jp-tv-locked">${f.wagered.length ? `Wagered: ${f.wagered.map((id) => PB.avatar(id, 'sm')).join('')}` : ''}</p>`;
        break;
      }
      case 'finalAnswer': {
        const f = g.finalRound;
        main = `<div class="jp-clue big final"><div class="jp-clue-head"><span>🏁 Final · ${esc(f.cat)}</span><b></b></div><p class="jp-q">${esc(f.q)}</p></div>
          ${options(s, f.options)}
          <p class="jp-tv-status">Answer on your phones ${g.relaxed ? '' : PB.timer()}</p>
          <p class="jp-tv-locked">${f.answered.length ? `Answered: ${f.answered.map((id) => PB.avatar(id, 'sm')).join('')}` : ''}</p>`;
        break;
      }
      case 'over': {
        const f = g.finalRound;
        const names = (g.winners || []).map((id) => esc(name(id))).join(' & ');
        main = `<div class="jp-tv-title">🏆 ${names} win${g.winners?.length === 1 ? 's' : ''} Bool Jeopardy!</div>
          ${f ? `<div class="jp-clue final"><div class="jp-clue-head"><span>🏁 Final · ${esc(f.cat)}</span><b></b></div><p class="jp-q">${esc(f.q)}</p></div>${options(s, f.options, { answer: f.answer })}` : ''}
          ${standings(s)}
          ${g.unpaid.length ? `<div class="jp-tv-tabs">☠️ Settle your tabs: <span>${g.unpaid.map((id) => `${PB.avatar(id, 'sm')} ${esc(realName(s, id))}`).join(' · ')}</span></div>` : ''}`;
        break;
      }
      default:
    }
    return `<div class="jp-tv">${main}</div>${tvSide(s)}`;
  }

  // ---------- Register ----------

  PB.register('jeopardy', {
    reset() {
      wager = null;
      wagerFor = null;
      flash = { key: null, at: 0 };
    },
    // Sideways: the board or the clue on the left.
    stage: '.jp-board, .jp-clue, .jp-dd, .jp-final-cat, .jp-vote-grid, .jp-house, .jp-last',
    tv: tvScreen,
    tvTable: false,
    tvLeft: '.jp-side',
    sounds(prev, s) {
      const a = prev.game;
      const b = s.game;
      if (s.phase === 'voted' && prev.phase === 'vote') return ['card'];
      if (s.phase === 'ddWager' && prev.phase !== 'ddWager') return ['bell'];
      if (b.clueNo !== a.clueNo && s.phase === 'clue') return ['card'];
      if (s.phase === 'clue' && b.clue?.buzzerId && b.clue.buzzerId !== a.clue?.buzzerId) {
        // You won the buzz: your phone buzzes in your hand (on phones that can; not iPhones).
        if (b.clue.buzzerId === s.me && !PB.isTV) { try { navigator.vibrate?.([220, 80, 220]); } catch {} }
        return ['bell'];
      }
      if (s.phase === 'clue' && b.stage === 'open' && a.stage !== 'open') return ['turn'];
      if (s.phase === 'reveal' && prev.phase !== 'reveal' && b.clue?.results.some((x) => x.right)) return ['win'];
      if (s.phase === 'finalWager' && prev.phase !== 'finalWager') return ['bell'];
      return [];
    },
    render(s) {
      if (controller(s)) return controllerScreen(s);
      switch (s.phase) {
        case 'vote': case 'voted': return voteScreen(s);
        case 'board': return boardScreen(s);
        case 'ddWager': return ddScreen(s);
        case 'clue': return clueScreen(s);
        case 'reveal': return revealScreen(s);
        case 'finalWager': return finalWagerScreen(s);
        case 'finalAnswer': return finalAnswerScreen(s);
        case 'over': return overScreen(s);
        default: return '';
      }
    },
    afterRender(s) {
      // Building a wager stays on this phone until it's sent.
      document.querySelectorAll('[data-jp]').forEach((b) => {
        b.onclick = () => {
          const cap = s.game.cap;
          if (b.dataset.jp === 'step') wager = Math.min(cap, Math.max(1, wager + Number(b.dataset.step)));
          else if (b.dataset.jp === 'set') wager = Number(b.dataset.to);
          PB.rerender();
        };
      });
    },
  });
})();
