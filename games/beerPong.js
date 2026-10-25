// Beer Pong: two teams, a rack of cups at each end of the table. On your team's turn each of you
// throws one ball (on your own, you throw both): drag to aim at the other team's cups, then flick
// up to throw, as in Darts. Each team's cups are dealt round its players (each cup in its
// player's colour): a ball in your cup takes it off the table, and you drink.
// Both balls in: balls back, go again. Down to 6 cups, then 3, a team's rack is tidied back into a
// triangle. Sink the other team's last cup to win; the losers finish their drinks.
//
// The rack is drawn in its own units: x across (-0.5 to 0.5), y back from the front row (0 to
// about 0.6), cups CUP_R across. The server works out where each ball lands from the throw.

const TEAMS = [
  { name: 'Red', color: '#e5484d' },
  { name: 'Blue', color: '#3d7cff' },
];
const CUP_R = 0.1;
const GAP = 0.21; // from one cup's centre to the next
const WOBBLE = { steady: 0.025, normal: 0.05, wobbly: 0.09 };

const shuffle = (list) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
function gauss() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// Deals a team's cups round its players, front to back: whose cup is whose.
function deal(cups, ids) {
  return cups.map((c, i) => ({ ...c, owner: ids.length ? ids[i % ids.length] : null }));
}

// A full triangle of n cups (10, 6, 3 or 1), its point towards the throwers.
function rack(n) {
  const rows = { 10: 4, 6: 3, 3: 2, 1: 1 }[n] || 4;
  const cups = [];
  for (let k = 0; k < rows; k++) {
    for (let j = 0; j <= k; j++) cups.push({ x: +((j - k / 2) * GAP).toFixed(3), y: +(0.05 + k * GAP * 0.87).toFixed(3) });
  }
  return cups;
}

// Where a ball lands, in the target rack's units. `angle` is how far the flick leaned off straight
// up (degrees, + = right) and `speed` how hard it was against a perfect flick (1): too hard goes
// long, too soft falls short. A little slack either way counts as perfect.
function land(aim, angle, speed, wobble) {
  const lean = Math.sign(angle) * Math.max(0, Math.abs(angle) - 3);
  const power = Math.abs(speed - 1) < 0.06 ? 1 : speed;
  return {
    x: aim.x + Math.sin((lean * Math.PI) / 180) * 1.1 + gauss() * wobble,
    y: aim.y + (power - 1) * 0.9 + gauss() * wobble,
  };
}

// The next thrower on a team: its players take turns (missing anyone who's left).
function nextThrower(room, ctx, g, team) {
  const ids = g.teams[team].filter((id) => ctx.turns.isActive(room, id));
  if (!ids.length) return null;
  return ids[g.next[team] % ids.length];
}

function startTurn(room, ctx, team) {
  const g = room.game;
  g.turnTeam = team;
  g.balls = 2;
  g.sunk = 0;
  g.turnId = nextThrower(room, ctx, g, team);
}

// New teams: everyone here, shuffled and dealt between the two.
function pickTeams(room, ctx) {
  const g = room.game;
  const here = shuffle(ctx.connectedPlayers(room).map((p) => p.id));
  g.teams = [[], []];
  here.forEach((id, i) => g.teams[i % 2].push(id));
  g.phase = 'teams';
  g.winner = null;
}

const teamOf = (g, id) => g.teams.findIndex((t) => t.includes(id));

module.exports = {
  id: 'beerPong',
  name: 'Beer Pong',
  description: 'Two teams, ten cups each. Flick ping-pong balls at their cups from your phone.',
  rules: [
    'Drag to aim at the other team’s cups, then flick up to throw. Too hard goes long; too soft falls short.',
    'Each of you throws a ball on your team’s turn. Your team’s cups are in your colours: sink one and its owner drinks.',
    'Both balls in: balls back, go again. At 6 cups and at 3, the rack is tidied up.',
    'Sink their last cup to win. The losers finish their drinks.',
  ],
  bestWithTv: true,
  minPlayers: 2,
  order: 12,
  options: [
    { id: 'sips', label: 'Sips per cup', default: 1, choices: [1, 2, 3].map((n) => ({ value: n, label: `${n}` })) },
    {
      id: 'wobble',
      label: 'Aim',
      default: 'normal',
      choices: [{ value: 'steady', label: 'Steady' }, { value: 'normal', label: 'Normal' }, { value: 'wobbly', label: 'Wobbly' }],
    },
    { id: 'rerack', label: 'Re-racks', default: true, choices: [{ value: true, label: 'At 6 and 3' }, { value: false, label: 'Off' }] },
  ],

  start(room, ctx, options = {}) {
    Object.assign(room.game, {
      sips: [1, 2, 3].includes(options.sips) ? options.sips : 1,
      wobble: WOBBLE[options.wobble] ? options.wobble : 'normal',
      rerack: options.rerack !== false,
      throwNo: 0,
      last: null,
    });
    pickTeams(room, ctx);
  },

  handle(room, player, action, ctx) {
    const g = room.game;
    const me = player.id;
    const host = me === room.hostId;

    if (g.phase === 'teams') {
      if (!host) return;
      if (action.type === 'shuffle') pickTeams(room, ctx);
      else if (action.type === 'move') {
        const from = teamOf(g, action.targetId);
        if (from < 0) return;
        g.teams[from] = g.teams[from].filter((id) => id !== action.targetId);
        g.teams[1 - from].push(action.targetId);
      } else if (action.type === 'go' && g.teams.every((t) => t.length)) {
        g.cups = [deal(rack(10), g.teams[0]), deal(rack(10), g.teams[1])];
        g.next = [0, 0];
        g.phase = 'throwing';
        startTurn(room, ctx, Math.random() < 0.5 ? 0 : 1);
        ctx.log(room, `🏓 Beer pong! Team ${TEAMS[g.turnTeam].name} throws first`);
      }
      return;
    }

    if (g.phase !== 'throwing' || me !== g.turnId) return;
    if (action.type === 'aim') {
      g.aim = { x: clamp(Number(action.x), -0.8, 0.8), y: clamp(Number(action.y), -0.2, 1) };
      ctx.signal(room, 'aim', g.aim);
      return 'quiet';
    }
    if (action.type !== 'throw') return;

    const aim = { x: clamp(Number(action.x), -0.8, 0.8), y: clamp(Number(action.y), -0.2, 1) };
    const at = land(aim, clamp(Number(action.angle), -45, 45), clamp(Number(action.speed), 0.3, 2.5), WOBBLE[g.wobble]);
    const target = 1 - g.turnTeam;
    const cups = g.cups[target];
    const dist = (c) => Math.hypot(c.x - at.x, c.y - at.y);
    const nearest = cups.reduce((best, c, i) => (best < 0 || dist(c) < dist(cups[best]) ? i : best), -1);
    const hit = nearest >= 0 && dist(cups[nearest]) < CUP_R * 0.95 ? nearest : null;
    const rim = hit === null && nearest >= 0 && dist(cups[nearest]) < CUP_R * 1.5;
    g.throwNo += 1;
    g.last = { n: g.throwNo, by: me, team: g.turnTeam, target, x: +at.x.toFixed(3), y: +at.y.toFixed(3), cup: hit === null ? null : { ...cups[hit] }, rim };
    g.aim = aim;
    g.next[g.turnTeam] += 1;
    g.balls -= 1;

    if (hit !== null) {
      const [sunk] = cups.splice(hit, 1);
      g.sunk += 1;
      // Whoever's cup it was drinks (the whole team, if they've gone).
      const owner = sunk.owner && ctx.turns.isActive(room, sunk.owner) ? sunk.owner : null;
      ctx.log(room, `🏓 ${player.name} sinks ${owner ? `${ctx.name(room, owner)}'s cup` : 'one'}! ${cups.length} left for Team ${TEAMS[target].name}`);
      for (const id of owner ? [owner] : g.teams[target]) ctx.drink(room, id, g.sips, `${player.name} sank your cup`, me);
      if (!cups.length) {
        g.phase = 'over';
        g.winner = g.turnTeam;
        ctx.log(room, `🏆 Team ${TEAMS[g.winner].name} wins beer pong!`);
        for (const id of g.teams[target]) ctx.drink(room, id, g.sips, 'lost beer pong', null, { title: 'Finish your drink!' });
        return;
      }
      if (g.rerack && (cups.length === 6 || cups.length === 3)) {
        g.cups[target] = deal(rack(cups.length), g.teams[target]);
        ctx.log(room, `🔺 Re-rack: Team ${TEAMS[target].name}'s ${cups.length} cups`);
      }
    } else if (rim) {
      ctx.log(room, `😩 ${player.name} rims out`);
    }

    if (g.balls > 0) {
      g.turnId = nextThrower(room, ctx, g, g.turnTeam);
    } else if (g.sunk === 2) {
      ctx.log(room, `🔥 Balls back! Team ${TEAMS[g.turnTeam].name} goes again`);
      startTurn(room, ctx, g.turnTeam);
      g.ballsBack = g.throwNo;
    } else {
      startTurn(room, ctx, target);
    }
  },

  // A thrower who leaves: the next one on the team takes the ball.
  check(room, ctx) {
    const g = room.game;
    if (g.phase !== 'throwing' || ctx.turns.isActive(room, g.turnId)) return;
    g.turnId = nextThrower(room, ctx, g, g.turnTeam);
    if (!g.turnId) startTurn(room, ctx, 1 - g.turnTeam);
  },

  // Someone new joins the smaller team.
  onJoin(room, player) {
    const g = room.game;
    if (teamOf(g, player.id) >= 0) return;
    g.teams[g.teams[0].length <= g.teams[1].length ? 0 : 1].push(player.id);
  },

  view(room) {
    const g = room.game;
    return {
      teams: g.teams.map((ids, i) => ({ ...TEAMS[i], ids })),
      cups: g.cups || [[], []],
      turnTeam: g.turnTeam ?? null,
      turnId: g.phase === 'throwing' ? g.turnId : null,
      balls: g.balls ?? 2,
      sunk: g.sunk ?? 0,
      last: g.last,
      ballsBack: g.ballsBack || null,
      winner: g.winner,
      aim: g.aim || null,
      sips: g.sips,
      cupR: CUP_R,
    };
  },

  rack,
  land,
  CUP_R,
  WOBBLE,
};
