# Writing a game

A game is two files:

| File | Runs on | Job |
|---|---|---|
| `games/<id>.js` | server | Rules and state. The only source of truth. |
| `public/games/<id>.js` | phones | Draws the screen from the state the server sends. |

The server picks up every file in `games/` automatically. Copy `kingsCup.js` (both files) to start.

## Server module

```js
module.exports = {
  id: 'myGame',              // must match the file names
  name: 'My Game',
  description: 'One line shown in the lobby.',
  rules: ['Short reminders,', 'shown on the TV.'],
  minPlayers: 2,
  order: 5,                  // position in the lobby list

  // Optional: rule variants the host picks in the lobby.
  options: [
    { id: 'sips', label: 'Sips per penalty', default: 1,
      choices: [{ value: 1, label: '1' }, { value: 2, label: '2' }] },
    // showIf: only offer this option for some values of another one.
    { id: 'rounds', label: 'Rounds', showIf: { mode: ['short'] }, default: 3, choices: [...] },
  ],

  // Optional: content the host can write their own of (see lib/custom.js). Their edits arrive,
  // cleaned, as options.custom.
  custom: [
    { id: 'prompts', kind: 'list', label: 'Your prompts', hint: 'One per line', maxItems: 100, maxLen: 120 },
  ],

  start(room, ctx, options) {            // set up room.game (room.game.type is already set)
    const o = optionValues(module.exports.options, options); // lib/options.js: see below
  },
  handle(room, player, action, ctx) {},  // a phone sent { type, ...data }; validate everything
  check(room, ctx) {},                   // optional: a player left or disconnected
  onJoin(room, player, ctx) {},          // optional: someone joined mid-game
  view(room, player, ctx) { return {} }, // what THIS player's phone may see (hide other hands!)
  waitingOn(room) { return [] },         // who the game is waiting on right now (see below)
};
```

**Options** arrive as the phone sent them, so don't trust them. `optionValues(declared, options)`
(`lib/options.js`) gives each declared option's value if it's exactly one of its choices (the
number `3`, not the text `"3"`), else its default; `options.custom` isn't an option, so read that
from `options` itself.

**`waitingOn(room)`** returns the ids of the players the game is waiting on right now: the
thrower, the roller, whoever's handing out sips; everyone yet to bet, answer, vote or tap in a
race; the host when only the host can move it on (start the race, next round). `[]` while it's on
a timer (a ball in the air, the dice spinning) or over. Leave out players who've left, and moves
that are up to anyone (playing a match on the pyramid, joining a war, a jockey's taps): nothing
waits for them. Pass and play uses it to hand the phone to the right player, and the "your turn"
chime to know whose turn it is; `tests/waitingOn.test.js` checks that every bot move comes from
someone on the list.

`room.game.phase` is a string (like `'rolling'` or `'reveal'`) and is sent to phones as `state.phase`.
Everything else in `room.game` stays on the server unless `view` returns it.

### `ctx` toolkit

| Call | Does |
|---|---|
| `ctx.drink(room, id, sips, reason, fromId)` | Adds to the tally, logs it and buzzes that phone full-screen |
| `ctx.giveTo(room, fromId, targetId, sips, reason)` | A player hands out sips they've won. False (nothing given) for themselves, someone unknown, or someone who's left |
| `ctx.log(room, text)` | Adds a line to the activity feed |
| `ctx.setTimer(room, ms, fn)` / `ctx.clearTimer(room)` | One countdown per room; phones show it with `PB.timer()` |
| `ctx.endGame(room)` | Back to the lobby |
| `ctx.player(room, id)`, `ctx.name(room, id)`, `ctx.connectedPlayers(room)` | Lookups |
| `ctx.cards` | `newDeck({ jokers, decks })`, `draw(deck)`, `shuffle`, `color(card)`, `value(card, { aceLow })`, `label(card)` |
| `ctx.dice` | `roll(count, sides)`, `sum(values)`, `isDouble(values)` |
| `ctx.turns` | `next(room, order, currentId)`, `first(room, order)`; skip players who left |
| `ctx.bank` | Big Tom's saved best questions (`lib/questionBank.js`): `draw(mode, used)`, `record(poll)`. Server only: `null` in pass and play, so check for it |

Cards are `{ rank: 2..14, suit: 'S'|'H'|'D'|'C' }` (11=J, 12=Q, 13=K, 14=A).

Shared helpers a game can `require`:

| File | Gives you |
|---|---|
| `lib/random.js` | `shuffle(list)`, `gauss()`, `pick(list)`, `clamp(n, lo, hi)`, `steady(...parts)` (the same number in [0, 1) for the same parts) |
| `lib/options.js` | `optionValues(declared, options)` |
| `lib/teams.js` | `TEAMS` (names, colours), `deal(ids, count)`, `teamOf(g, id)`, `move(g, id)`, `join(g, id)`, `view(g)` for games kept in `g.teams` |
| `lib/betting.js` | Betting on a race and paying out (Ace Race, Horse Race) |
| `lib/bots.js` | `pickHuman(room, exceptId, candidates)`: who a bot hands sips to |

Games also run in the browser (pass and play, `lib/bundle.js`): a `lib/` file a game requires must
be listed in `LIB` there, and use nothing Node-only.

## Phone screens

```js
(() => {
  PB.register('myGame', {
    render(s) {               // s = full room state; s.game = your view(); s.phase
      return `${PB.turn(s.game.turnId)} <button data-act="roll">Roll</button>`;
    },
    afterRender(s) {},        // optional: attach custom listeners
    sounds(prev, s) {         // optional: sound effects for what changed since the last state
      return s.game.roll !== prev.game.roll ? ['dice'] : [];   // dice | card | turn | drink | win | bell
    },
    stage: '.my-board',       // optional: what goes on the left when the phone is sideways
    tvStage: '.my-board, .drink', // optional: the shared parts the TV shows in the middle of the table
    tv(s) {},                 // optional: the TV's own screen (HTML), or undefined to use tvStage
    tvTable: false,           // optional: no table and seats on the TV, just the game (horse race, darts)
    tvLeft: '.my-scores',     // optional, with tvTable: false: parts to put in a column on the left
    tvBanner: '.my-winner',   // optional: parts to put in a banner right across the TV
    tvRules(s, rules) {},     // optional: which rules the TV shows (e.g. only this mode's)
    tvFront(s, playerId) {},  // optional: HTML put on the TV's table in front of that player (their dice…)
  });
})();
```

Any element with `data-act="x"` sends `{ type: 'x', ...other data-* attributes }` when tapped,
so `data-act="guess" data-pick="red"` sends `{ type: 'guess', pick: 'red' }`. Values arrive as strings.
Add `data-confirm="Sure?"` to ask first. The host's "End game" button is added for you.

| Helper | Gives you |
|---|---|
| `PB.card(card, { size: 'sm' | 'lg', faceDown })` | A playing card (null = card back) |
| `PB.dice([3, 5], { rolling })` | Dice faces, with an optional roll animation |
| `PB.turn(playerId, subtitle)` | "Your turn" / "Bea's turn" banner |
| `PB.playerPicker(action, { exclude, selected, extra })` | A grid of player buttons that sends `{ type: action, targetId }` |
| `PB.timer()` | Countdown for the current `ctx.setTimer` |
| `PB.flickPad(el, { aim, drag, held, onAim, send, onThrow, perfect })` | A throwing pad: drag to aim, flick up to throw (Darts, Beer Pong, Quarters; see `public/pb.js`). Send the rules' own `perfect` slack in the view so the readout agrees with the server |
| `PB.feed(n)` | The last n activity lines |
| `PB.scoreboard()` | Sip totals |
| `PB.avatar(id, size)` | The player's emoji avatar in their colour (`size`: `''`, `'sm'`, `'lg'`) |
| `PB.name(id)`, `PB.esc(text)`, `PB.plural(n, word)` | Text helpers. **Always `esc` player-typed text.** |
| `PB.isTV`, `s.tv` | `PB.isTV` is true when drawing for the TV; `s.tv` is true on phones while a TV is watching |

The app adds the "your turn" chime (when the game's `waitingOn` starts including you), the drink
buzzer and the win fanfare (phase `'over'`) itself, so `sounds` only needs the game's own moments.
Colours come from CSS variables (`--bg`, `--card`, `--accent`, `--die`, `--back-1`…) so themes
and dice / card styles apply to your screens too.

## Bots

The host can add up to three bots (`lib/bots.js`): **Booler** (great), **Baller** (medium) and
**NPC** (bad). A bot is a player (`p.bot` is its level) who's always connected and has no phone.
Whenever the room changes, the server asks the game what each bot would do, waits a moment, asks
again (things may have moved on) and plays it through the game's own `handle`, like a tap:

```js
  // What bot `me` would do right now: an action (as a phone would send it), or null for nothing.
  // `skill` is 0 to 1: Booler 0.9, Baller 0.6, NPC 0.25. Optional `delay` (ms) overrides how long
  // the bot thinks first (e.g. a reaction that has to beat a clock).
  bot(room, me, ctx, skill) { return { type: 'roll' }; },
```

- Return only moves the game would take now (whose turn, which phase). A move it won't take three
  times in a row makes the bot wait until the game changes, so a wrong guess never spins.
- Skill is how good the bot is: how sound its choices are (bets, calls, bluffs) and how true its
  aim is (throwing games: perfect at 1, sloppy at 0). Never let a bot see what a player couldn't
  (another player's hand, a face-down card).
- Bots aren't the host in a real room. A move only the host can make (start the race, next
  round) is the host's; a bot may make it when `room.hostId === me.id` (only in tests).
- When a bot hands out sips, it picks someone at random, a human when there is one:
  `pickHuman(room, me.id)` (`lib/bots.js`).

- A game bots can't play (Boat Race: there's nothing for them to drink) sets `botsSitOut: true`;
  its `bot()` can still give them something to do from the side (cheering).

`tests/bots.test.js` plays every game with bots only, start to finish (except `botsSitOut` ones).

## Testing

```js
const { setup } = require('./helpers');
const t = setup(require('../games/myGame'), 4, { sips: 2 }); // 4 players, options
t.act(0, 'roll');      // player 0 taps Roll
t.view(1);             // player 1's view
t.fireTimer();         // skip the countdown
t.drinks();            // [sips per player]
```

Run `npm test`. To click through it, run `npm run dev` and open http://localhost:3000/dev.html to see several phones side by side.
