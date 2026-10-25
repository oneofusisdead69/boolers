// Quarters: bounce a quarter off the table into the glass. On your turn, drag to line it up and
// flick up to throw, as in Darts: how hard sets how far it bounces, how straight sets where it goes
// left or right. Sink it and you pick someone to drink, and go again; three in a row and you make
// a rule. Miss and it's the next player's go. After the rounds, most quarters in wins.
//
// The table is in its own units: x across (0 is the glass), d away from you (the glass is at 1).
// The server works out where the quarter comes down from the throw.

const GLASSES = { shot: 0.07, pint: 0.12 }; // the glass's radius
const WOBBLE = { steady: 0.02, normal: 0.04, wobbly: 0.07 };
const RULE_AT = 3; // in a row

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
function gauss() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// Where the quarter comes down. `aim` is where across it's lined up; `angle` how far the flick
// leaned off straight up (degrees, + = right); `speed` how hard against a perfect flick (1): it
// bounces that far (a perfect flick, right to the glass). A little slack counts as perfect.
function land(aim, angle, speed, wobble) {
  const lean = Math.sign(angle) * Math.max(0, Math.abs(angle) - 3);
  const power = Math.abs(speed - 1) < 0.05 ? 1 : speed;
  return {
    x: aim + Math.sin((lean * Math.PI) / 180) * 1.2 + gauss() * wobble,
    d: power + gauss() * wobble,
  };
}

const shooter = (g) => g.order[g.turnIdx];

function nextShooter(room, ctx) {
  const g = room.game;
  const current = shooter(g);
  const next = ctx.turns.next(room, g.order, current);
  if (!next) return;
  const wrapped = g.order.indexOf(next) <= g.order.indexOf(current);
  g.turnIdx = g.order.indexOf(next);
  g.turnId = next;
  g.streak = 0;
  g.aim = null;
  if (wrapped) {
    g.round += 1;
    if (g.round > g.rounds) return finish(room, ctx);
  }
  g.phase = 'shooting';
}

function finish(room, ctx) {
  const g = room.game;
  const best = Math.max(...g.order.map((id) => g.sinks[id] || 0));
  g.winners = g.order.filter((id) => (g.sinks[id] || 0) === best && ctx.player(room, id));
  g.phase = 'over';
  g.turnId = null;
  ctx.log(room, `🏆 ${g.winners.map((id) => ctx.name(room, id)).join(' & ')} ${g.winners.length > 1 ? 'tie' : 'wins'} with ${best}`);
}

// Bots. A bot's flick goes wrong like a person's: it leans off straight and comes out too hard or
// too soft, by less the better the bot. Quarters takes a finer touch than darts (a sink means you
// go again, so a near-perfect bot would never hand over): at 0.9 about 4° and 9%, at 0.25 9° and 22%.
function flick(skill) {
  return {
    angle: gauss() * (3 + 8 * (1 - skill)),
    speed: 1 + gauss() * (0.07 + 0.2 * (1 - skill)),
  };
}

// Who a bot makes drink: someone at random, a human if there is one.
function pickTarget(room, ctx, me) {
  const pool = ctx.connectedPlayers(room).filter((p) => p.id !== me);
  const humans = pool.filter((p) => !p.bot);
  const from = humans.length ? humans : pool;
  return from.length ? from[Math.floor(Math.random() * from.length)].id : null;
}

module.exports = {
  id: 'quarters',
  name: 'Quarters',
  description: 'Bounce a quarter off the table into the glass. Sink it and someone drinks.',
  rules: [
    'Drag to line up your quarter, then flick up to bounce it. How hard sets how far it goes.',
    'Sink it: pick someone to drink, and go again.',
    'Three in a row: make a rule.',
    'Miss: it’s the next player’s go. After the rounds, most quarters in wins.',
  ],
  bestWithTv: true,
  minPlayers: 2,
  order: 13,
  options: [
    { id: 'glass', label: 'Glass', default: 'pint', choices: [{ value: 'pint', label: 'Pint (easier)' }, { value: 'shot', label: 'Shot glass (hard)' }] },
    { id: 'rounds', label: 'Rounds', default: 3, choices: [2, 3, 5].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'sips', label: 'Sips', default: 1, choices: [1, 2, 3].map((n) => ({ value: n, label: `${n}` })) },
    { id: 'missDrinks', label: 'A miss', default: false, choices: [{ value: false, label: 'Just passes' }, { value: true, label: 'Drinks a sip' }] },
    {
      id: 'wobble',
      label: 'Aim',
      default: 'normal',
      choices: [{ value: 'steady', label: 'Steady' }, { value: 'normal', label: 'Normal' }, { value: 'wobbly', label: 'Wobbly' }],
    },
  ],

  start(room, ctx, options = {}) {
    const order = room.players.map((p) => p.id);
    Object.assign(room.game, {
      order,
      turnIdx: 0,
      turnId: order[0],
      round: 1,
      rounds: [2, 3, 5].includes(options.rounds) ? options.rounds : 3,
      sips: [1, 2, 3].includes(options.sips) ? options.sips : 1,
      glass: GLASSES[options.glass] ? options.glass : 'pint',
      wobble: WOBBLE[options.wobble] ? options.wobble : 'normal',
      missDrinks: options.missDrinks === true,
      streak: 0,
      sinks: {},
      shots: 0,
      last: null,
      rule: null,
      aim: null,
      phase: 'shooting',
    });
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    if (me !== g.turnId) return;

    if (action.type === 'aim' && g.phase === 'shooting') {
      g.aim = clamp(Number(action.x), -0.6, 0.6);
      ctx.signal(room, 'aim', { x: g.aim });
      return 'quiet';
    }
    if (action.type === 'give' && g.phase === 'give') {
      const target = ctx.player(room, action.targetId);
      if (!target || target.id === me) return;
      ctx.drink(room, target.id, g.sips, `${player.name} sank a quarter`, me);
      g.phase = 'shooting';
      return;
    }
    if (action.type !== 'throw' || g.phase !== 'shooting') return;

    const aim = clamp(Number(action.x), -0.6, 0.6);
    const at = land(aim, clamp(Number(action.angle), -45, 45), clamp(Number(action.speed), 0.2, 2.5), WOBBLE[g.wobble]);
    const r = GLASSES[g.glass];
    const off = Math.hypot(at.x, (at.d - 1) * 0.8);
    const hit = off < r;
    const rim = !hit && off < r * 1.6;
    g.shots += 1;
    g.aim = aim;
    g.last = { n: g.shots, by: me, x: +at.x.toFixed(3), d: +at.d.toFixed(3), hit, rim };

    if (hit) {
      g.streak += 1;
      g.sinks[me] = (g.sinks[me] || 0) + 1;
      if (g.streak === RULE_AT) {
        g.rule = g.shots;
        ctx.log(room, `📜 ${player.name}: three in a row! Make a rule`);
      } else {
        ctx.log(room, `🪙 ${player.name} sinks it!`);
      }
      g.phase = 'give';
      return;
    }
    ctx.log(room, rim ? `😩 ${player.name} rims it` : `💨 ${player.name} misses`);
    if (g.missDrinks) ctx.drink(room, me, 1, 'missed the glass');
    nextShooter(room, ctx);
  },

  // A bot lines up on the glass and flicks on its go; when it sinks one, it picks who drinks.
  bot(room, me, ctx, skill) {
    const g = room.game;
    if (g.turnId !== me.id) return null;
    if (g.phase === 'give') {
      const targetId = pickTarget(room, ctx, me.id);
      return targetId ? { type: 'give', targetId } : null;
    }
    if (g.phase !== 'shooting') return null;
    return { type: 'throw', x: 0, ...flick(skill) };
  },

  // The shooter leaves: the next player's up.
  check(room, ctx) {
    const g = room.game;
    if (g.phase !== 'over' && !ctx.turns.isActive(room, g.turnId)) nextShooter(room, ctx);
  },

  onJoin(room, player) {
    room.game.order.push(player.id);
  },

  view(room) {
    const g = room.game;
    return {
      order: g.order,
      turnId: g.turnId,
      round: g.round,
      rounds: g.rounds,
      sips: g.sips,
      glassR: GLASSES[g.glass],
      glass: g.glass,
      streak: g.streak,
      sinks: g.sinks,
      last: g.last,
      rule: g.rule,
      aim: g.aim,
      winners: g.winners || [],
    };
  },

  land,
  GLASSES,
  WOBBLE,
};
