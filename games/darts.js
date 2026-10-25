// Darts: take turns throwing 3 darts by flicking them up your phone's screen. Drag to aim, then
// flick: a crooked flick pulls the dart sideways, and too soft or too hard drops it low or sends it
// high. The board is on everyone's phone, or on the TV if there is one.
//
// Modes:
//   Drinking darts  rounds of 3 darts; lowest score each round drinks, bulls hand out sips.
//   301 / 501       count down to exactly zero (optionally finishing on a double). Bust and drink.
//   Around the clock  hit 1 to 20 in order, then the bull. A turn with no hits drinks.
//   Cricket         close 15–20 and the bull; score on numbers others haven't closed.
// Everywhere: missing the board is a sip.
//
// Board coordinates: the centre is (0, 0) and the outside of the double ring is radius 1, with
// y pointing down (like the screen).

const { gauss, clamp } = require('../lib/random');
const { pickHuman } = require('../lib/bots');
const { optionValues } = require('../lib/options');
const { isActive } = require('../lib/turns');

// Clockwise from the top.
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Ring edges as a fraction of the double ring's outer radius (a regulation board, in mm / 170).
const RINGS = { bull: 6.35 / 170, outerBull: 15.9 / 170, tripleIn: 99 / 170, tripleOut: 107 / 170, doubleIn: 162 / 170 };
const CRICKET = [20, 19, 18, 17, 16, 15, 25];
const WOBBLE = { steady: 0.035, normal: 0.06, wobbly: 0.1 };
const TURN_PAUSE = 2600;
const ROUND_PAUSE = 4500;

// What a dart at (x, y) scores: { n: 1..20 | 25 | 0, m: 0..3, label }.
function score(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1) return { n: 0, m: 0, label: 'Miss' };
  if (r <= RINGS.bull) return { n: 25, m: 2, label: 'Bull' };
  if (r <= RINGS.outerBull) return { n: 25, m: 1, label: '25' };
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  const n = SECTORS[Math.floor((((deg + 9) % 360) + 360) % 360 / 18)];
  if (r > RINGS.doubleIn) return { n, m: 2, label: `D${n}` };
  if (r > RINGS.tripleIn && r <= RINGS.tripleOut) return { n, m: 3, label: `T${n}` };
  return { n, m: 1, label: `${n}` };
}

const value = (seg) => seg.n * seg.m;

// Where a throw lands. `angle` is how far the flick leaned off straight up (degrees, + = right) and
// `speed` is how hard it was compared with a perfect flick (1 = perfect). A little slack either
// way counts as perfect.
function land(aim, angle, speed, wobble) {
  const lean = Math.sign(angle) * Math.max(0, Math.abs(angle) - 3);
  const power = Math.abs(speed - 1) < 0.08 ? 1 : speed;
  return {
    x: aim.x + Math.sin((lean * Math.PI) / 180) * 1.4 + gauss() * wobble,
    y: aim.y + (1 - power) * 0.6 + gauss() * wobble,
  };
}

const thrower = (g) => g.order[g.turnIdx];
const active = (room, ctx, g) => g.order.filter((id) => ctx.turns.isActive(room, id));
const others = (room, ctx, g, me) => active(room, ctx, g).filter((id) => id !== me);

function initScores(g, id) {
  if (g.mode === 'drinking') g.total[id] ??= 0;
  if (g.mode === 'x01') g.left[id] ??= g.start;
  if (g.mode === 'clock') g.target[id] ??= 1;
  if (g.mode === 'cricket') {
    g.marks[id] ??= Object.fromEntries(CRICKET.map((n) => [n, 0]));
    g.points[id] ??= 0;
  }
}

function startTurn(room, ctx) {
  const g = room.game;
  g.darts = [];
  g.aim = null;
  g.hits = 0; // around the clock / cricket: did this turn hit anything?
  g.turnScore = 0;
  if (g.mode === 'x01') g.turnStart = g.left[thrower(g)];
  g.phase = 'throwing';
}

function win(room, ctx, id) {
  const g = room.game;
  ctx.clearTimer(room);
  g.winnerId = id;
  g.phase = 'over';
  ctx.log(room, `🏆 ${ctx.name(room, id)} wins Darts`);
  for (const other of others(room, ctx, g, id)) ctx.drink(room, other, g.sips, `${ctx.name(room, id)} won`);
}

// After a turn: hand out any sips that were won, then the next thrower.
function afterTurn(room, ctx) {
  const g = room.game;
  if (g.phase === 'over') return;
  const give = g.gives.find((x) => ctx.turns.isActive(room, x.from));
  if (give) {
    g.give = give;
    g.gives = g.gives.filter((x) => x !== give);
    g.phase = 'give';
    return;
  }
  g.gives = [];
  g.give = null;
  nextThrower(room, ctx);
}

function nextThrower(room, ctx) {
  const g = room.game;
  const current = thrower(g);
  const next = ctx.turns.next(room, g.order, current);
  if (!next) return;
  const wrapped = g.order.indexOf(next) <= g.order.indexOf(current);
  g.turnIdx = g.order.indexOf(next);
  if (wrapped && g.mode === 'drinking') return endRound(room, ctx);
  if (wrapped) g.round += 1;
  startTurn(room, ctx);
}

// Drinking darts: the lowest score this round drinks.
function endRound(room, ctx) {
  const g = room.game;
  const played = Object.keys(g.roundScores).filter((id) => ctx.player(room, id));
  const low = Math.min(...played.map((id) => g.roundScores[id]));
  const losers = played.filter((id) => g.roundScores[id] === low);
  for (const id of played) g.total[id] = (g.total[id] || 0) + g.roundScores[id];
  if (played.length > 1) for (const id of losers) ctx.drink(room, id, g.sips, `lowest score in round ${g.round}`);
  g.roundEnd = { round: g.round, scores: { ...g.roundScores }, losers: played.length > 1 ? losers : [] };
  g.phase = 'roundEnd';
  ctx.setTimer(room, ROUND_PAUSE, () => {
    if (g.rounds && g.round >= g.rounds) {
      const ids = active(room, ctx, g);
      const best = Math.max(...ids.map((id) => g.total[id] || 0));
      return win(room, ctx, ids.find((id) => (g.total[id] || 0) === best));
    }
    g.round += 1;
    g.roundScores = {};
    g.roundEnd = null;
    startTurn(room, ctx);
  });
}

function endTurn(room, ctx, note = '') {
  const g = room.game;
  const me = thrower(g);
  if (g.mode === 'clock' && !g.hits && note !== 'won') {
    ctx.drink(room, me, g.sips, 'no hits on the clock');
  }
  if (g.mode === 'cricket' && !g.hits && note !== 'won') {
    ctx.drink(room, me, g.sips, 'no marks');
  }
  if (g.mode === 'x01' && note !== 'bust' && g.turnScore >= 100) {
    g.gives.push({ from: me, sips: g.sips, reason: `a ton (${g.turnScore})` });
    ctx.log(room, `💯 ${ctx.name(room, me)} scored ${g.turnScore}!`);
  }
  if (g.mode === 'drinking') g.roundScores[me] = g.turnScore;
  if ((g.mode === 'drinking' || g.mode === 'x01') && note !== 'bust' && g.turnScore >= 60) {
    ctx.highlight(room, 'dartsBest', me, g.turnScore, `🎯 ${ctx.name(room, me)} threw ${g.turnScore} in one turn of darts`);
  }
  g.lastTurn = { id: me, darts: g.darts, total: g.turnScore, note };
  if (g.phase === 'over') return;
  g.phase = 'turnEnd';
  ctx.setTimer(room, TURN_PAUSE, () => afterTurn(room, ctx));
}

// Applies one dart to the scores. Returns 'bust', 'won' or ''.
function apply(room, ctx, me, seg) {
  const g = room.game;
  const v = value(seg);
  if (g.mode === 'drinking') {
    g.turnScore += v;
    if (seg.n === 25) {
      const sips = seg.m === 2 ? g.sips * 2 : g.sips;
      g.gives.push({ from: me, sips, reason: seg.m === 2 ? 'a bullseye' : 'the 25' });
    }
  } else if (g.mode === 'x01') {
    const left = g.left[me] - v;
    const finishOk = !g.doubleOut || seg.m === 2;
    if (left < 0 || (g.doubleOut && left === 1) || (left === 0 && !finishOk)) {
      g.left[me] = g.turnStart;
      g.turnScore = 0;
      ctx.log(room, `💥 ${ctx.name(room, me)} bust`);
      ctx.drink(room, me, g.sips, 'bust');
      return 'bust';
    }
    g.left[me] = left;
    g.turnScore += v;
    if (left === 0) {
      win(room, ctx, me);
      return 'won';
    }
  } else if (g.mode === 'clock') {
    const want = g.target[me];
    if ((want <= 20 && seg.n === want) || (want === 21 && seg.n === 25)) {
      g.hits += 1;
      g.target[me] += 1;
      g.turnScore += 1;
      if (g.target[me] > 21) {
        win(room, ctx, me);
        return 'won';
      }
    }
  } else if (g.mode === 'cricket' && CRICKET.includes(seg.n)) {
    g.hits += 1;
    const label = seg.n === 25 ? 'the bull' : `${seg.n}s`;
    for (let i = 0; i < seg.m; i++) {
      if (g.marks[me][seg.n] < 3) {
        g.marks[me][seg.n] += 1;
        if (g.marks[me][seg.n] === 3) {
          ctx.log(room, `🔒 ${ctx.name(room, me)} closed ${label}`);
          for (const id of others(room, ctx, g, me)) {
            if (g.marks[id][seg.n] < 3) ctx.drink(room, id, 1, `${ctx.name(room, me)} closed ${label}`);
          }
        }
      } else if (others(room, ctx, g, me).some((id) => g.marks[id][seg.n] < 3)) {
        g.points[me] += seg.n;
        g.turnScore += seg.n;
      }
    }
    const closedAll = CRICKET.every((n) => g.marks[me][n] >= 3);
    if (closedAll && others(room, ctx, g, me).every((id) => g.points[me] >= g.points[id])) {
      win(room, ctx, me);
      return 'won';
    }
  }
  return '';
}

// Bots. A bot's flick goes wrong like a person's: it leans off straight and comes out too hard or
// too soft, by less the better the bot (at 0.9 about 2° and 4%, at 0.25 about 9° and 23%).
function flick(skill) {
  return {
    angle: gauss() * (1 + 11 * Math.pow(1 - skill, 1.2)),
    speed: 1 + gauss() * (0.02 + 0.3 * Math.pow(1 - skill, 1.3)),
  };
}

// The middle of a segment to aim at: number n (or 25 for the bull) times m.
function spotFor(n, m) {
  if (n === 25) return m === 2 ? { x: 0, y: 0 } : { x: 0, y: -(RINGS.bull + RINGS.outerBull) / 2 };
  // Singles: the inner single, well away from the edge of the board (a miss is a sip).
  const r = m === 3 ? (RINGS.tripleIn + RINGS.tripleOut) / 2 : m === 2 ? (RINGS.doubleIn + 1) / 2 : (RINGS.outerBull + RINGS.tripleIn) / 2;
  const a = (SECTORS.indexOf(n) * 18 * Math.PI) / 180;
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}

// x01: what to go for with `left` to go. Out of range, the big scores (treble 20, or the single
// for a bot that can't hit trebles); close in, the finish, or a single that leaves one.
function x01Target(left, doubleOut, good) {
  const big = good ? [20, 3] : [20, 1];
  if (left === 50) return [25, 2];
  if (left <= 40 && left % 2 === 0) return [left / 2, 2];
  if (!doubleOut) {
    if (left <= 20) return [left, 1];
    if (left === 25) return [25, 1];
    if (left <= 60 && left % 3 === 0) return [left / 3, 3];
    if (left <= 60) return [Math.min(20, left - 20), 1];
    return big;
  }
  // Double out: an odd number leaves an even one (32 is a nice double to be on).
  if (left <= 40) return [1, 1];
  if (left <= 52) return [left - 32, 1];
  if (left <= 60) return [left - 40, 1];
  return big;
}

// Cricket: the highest number still worth hitting. First the ones I haven't closed; then ones I
// have that someone else hasn't (they score).
function cricketTarget(room, ctx, g, me) {
  const mine = g.marks[me];
  const open = CRICKET.find((n) => mine[n] < 3);
  if (open) return open;
  return CRICKET.find((n) => others(room, ctx, g, me).some((id) => g.marks[id][n] < 3)) || 20;
}

module.exports = {
  id: 'darts',
  name: 'Darts',
  description: 'Flick darts at the board from your phone. Drinking darts, 301/501, around the clock or cricket.',
  // A reminder of the rules, shown on the TV.
  rules: [
    'Drag to aim, then flick up to throw. A crooked or too-soft flick goes astray.',
    'Three darts a turn. Missing the board is a sip.',
    'Drinking darts: lowest score each round drinks. Bull hands out double, 25 hands out sips.',
    '301/501: hit exactly zero. Bust and drink. A ton (100+) hands out sips.',
    'Around the clock: 1 to 20, then the bull. No hits in a turn? Drink.',
    'Cricket: close 15–20 and the bull. Close one and everyone still open drinks.',
  ],
  // Best played with a TV in the room (the board), so the game list says so.
  bestWithTv: true,
  minPlayers: 1,
  order: 10,
  options: [
    {
      id: 'mode',
      label: 'Game',
      default: 'drinking',
      choices: [
        { value: 'drinking', label: 'Drinking darts' },
        { value: 301, label: '301' },
        { value: 501, label: '501' },
        { value: 'clock', label: 'Around the clock' },
        { value: 'cricket', label: 'Cricket' },
      ],
    },
    { id: 'rounds', label: 'Rounds', showIf: { mode: ['drinking'] }, default: 5, choices: [3, 5, 10].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'doubleOut', label: 'Finish on a double', showIf: { mode: [301, 501] }, default: false, choices: [{ value: false, label: 'No' }, { value: true, label: 'Yes' }] },
    { id: 'sips', label: 'Sips', default: 2, choices: [1, 2, 3].map((n) => ({ value: n, label: `${n}` })) },
    {
      id: 'wobble',
      label: 'Aim',
      default: 'normal',
      choices: [{ value: 'steady', label: 'Steady' }, { value: 'normal', label: 'Normal' }, { value: 'wobbly', label: 'Wobbly' }],
    },
    // Hard mode: no crosshair and no "Aiming at" readout; you aim by feel.
    {
      id: 'hard',
      label: 'Hard mode',
      default: false,
      choices: [{ value: false, label: 'Off' }, { value: true, label: 'On: no crosshair' }],
    },
  ],

  start(room, ctx, options = {}) {
    const o = optionValues(module.exports.options, options);
    // 301 and 501 are one game (x01), starting from a different score.
    const x01 = o.mode === 301 || o.mode === 501;
    const order = room.players.map((p) => p.id);
    Object.assign(room.game, {
      mode: x01 ? 'x01' : o.mode,
      start: x01 ? o.mode : null,
      doubleOut: x01 && o.doubleOut,
      rounds: o.rounds,
      sips: o.sips,
      wobble: o.wobble,
      hard: o.hard,
      order,
      turnIdx: Math.max(0, order.indexOf(ctx.turns.first(room, order))),
      round: 1,
      total: {},
      roundScores: {},
      roundEnd: null,
      left: {},
      target: {},
      marks: {},
      points: {},
      gives: [],
      give: null,
      lastTurn: null,
      winnerId: null,
    });
    for (const id of order) initScores(room.game, id);
    startTurn(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;

    if (action.type === 'aim' && g.phase === 'throwing' && me === thrower(g)) {
      g.aim = { x: clamp(Number(action.x), -1.4, 1.4), y: clamp(Number(action.y), -1.4, 1.4) };
      // Aiming moves several times a second: everyone gets just the crosshair, not the whole game.
      ctx.signal(room, 'aim', g.aim);
      return 'quiet';
    } else if (action.type === 'throw' && g.phase === 'throwing' && me === thrower(g)) {
      const aim = { x: clamp(Number(action.x), -1.4, 1.4), y: clamp(Number(action.y), -1.4, 1.4) };
      const angle = clamp(Number(action.angle), -45, 45);
      const speed = clamp(Number(action.speed), 0.3, 2.5);
      const at = land(aim, angle, speed, WOBBLE[g.wobble]);
      const seg = score(at.x, at.y);
      g.aim = aim;
      g.darts.push({ x: at.x, y: at.y, seg, angle, speed });
      if (!seg.n) ctx.drink(room, me, 1, 'missed the board');
      const result = apply(room, ctx, me, seg);
      if (result === 'won') endTurn(room, ctx, 'won');
      else if (result === 'bust') endTurn(room, ctx, 'bust');
      else if (g.darts.length >= 3) endTurn(room, ctx);
    } else if (action.type === 'give' && g.phase === 'give' && g.give?.from === me) {
      if (ctx.giveTo(room, me, action.targetId, g.give.sips, g.give.reason)) afterTurn(room, ctx);
    } else if (action.type === 'skipGive' && g.phase === 'give' && me === room.hostId) {
      afterTurn(room, ctx);
    }
  },

  // A bot throws on its turn at what's worth going for in this mode (good ones go for trebles,
  // bad ones the bigger singles), and hands out its sips when it's won some.
  bot(room, me, ctx, skill) {
    const g = room.game;
    if (g.phase === 'give' && g.give?.from === me.id) {
      const targetId = pickHuman(room, me.id);
      return targetId ? { type: 'give', targetId } : null;
    }
    if (g.phase !== 'throwing' || thrower(g) !== me.id) return null;
    const good = skill >= 0.5;
    let target = good ? [20, 3] : [20, 1];
    if (g.mode === 'x01') target = x01Target(g.left[me.id], g.doubleOut, good);
    // Around the clock any of the number counts: the treble ring is the middle of its wedge.
    else if (g.mode === 'clock') target = g.target[me.id] > 20 ? [25, 2] : [g.target[me.id], 3];
    else if (g.mode === 'cricket') {
      const n = cricketTarget(room, ctx, g, me.id);
      target = n === 25 ? [25, 2] : [n, good ? 3 : 1];
    }
    return { type: 'throw', ...spotFor(...target), ...flick(skill) };
  },

  // A thrower or giver who leaves doesn't hold up the game.
  check(room, ctx) {
    const g = room.game;
    if (g.phase === 'throwing' && !ctx.turns.isActive(room, thrower(g))) {
      g.lastTurn = null;
      nextThrower(room, ctx);
    } else if (g.phase === 'give' && !ctx.turns.isActive(room, g.give.from)) {
      afterTurn(room, ctx);
    } else if (g.phase === 'turnEnd' && !room.timer) {
      afterTurn(room, ctx);
    }
  },

  // The thrower, or whoever's handing out sips. Between turns and rounds it's on the clock.
  waitingOn(room) {
    const g = room.game;
    const id = g.phase === 'throwing' ? thrower(g) : g.phase === 'give' ? g.give?.from : null;
    return id && isActive(room, id) ? [id] : [];
  },

  // Late joiners join in at the end of the order.
  onJoin(room, player) {
    const g = room.game;
    if (!g.order.includes(player.id)) g.order.push(player.id);
    initScores(g, player.id);
  },

  view(room) {
    const g = room.game;
    const id = thrower(g);
    return {
      mode: g.mode,
      start: g.start,
      doubleOut: g.doubleOut,
      rounds: g.rounds,
      round: g.round,
      sips: g.sips,
      wobble: g.wobble,
      hard: g.hard,
      throwerId: id,
      turnId: g.phase === 'throwing' ? id : g.phase === 'give' ? g.give.from : null,
      darts: g.darts,
      aim: g.aim,
      turnScore: g.turnScore,
      lastTurn: g.lastTurn,
      give: g.phase === 'give' ? g.give : null,
      total: g.total,
      roundScores: g.roundScores,
      roundEnd: g.roundEnd,
      left: g.left,
      target: g.target,
      marks: g.marks,
      points: g.points,
      order: g.order,
      winnerId: g.winnerId,
    };
  },

  score,
  land,
  SECTORS,
  RINGS,
};
