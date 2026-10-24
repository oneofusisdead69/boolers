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
  ],

  // Optional: content the host can write their own of (see lib/custom.js). Their edits arrive,
  // cleaned, as options.custom.
  custom: [
    { id: 'prompts', kind: 'list', label: 'Your prompts', hint: 'One per line', maxItems: 100, maxLen: 120 },
  ],

  start(room, ctx, options) {},          // set up room.game (room.game.type is already set)
  handle(room, player, action, ctx) {},  // a phone sent { type, ...data }; validate everything
  check(room, ctx) {},                   // optional: a player left or disconnected
  onJoin(room, player, ctx) {},          // optional: someone joined mid-game
  view(room, player, ctx) { return {} }, // what THIS player's phone may see (hide other hands!)
};
```

`room.game.phase` is a string (like `'rolling'` or `'reveal'`) and is sent to phones as `state.phase`.
Everything else in `room.game` stays on the server unless `view` returns it.

### `ctx` toolkit

| Call | Does |
|---|---|
| `ctx.drink(room, id, sips, reason, fromId)` | Adds to the tally, logs it and buzzes that phone full-screen |
| `ctx.log(room, text)` | Adds a line to the activity feed |
| `ctx.setTimer(room, ms, fn)` / `ctx.clearTimer(room)` | One countdown per room; phones show it with `PB.timer()` |
| `ctx.endGame(room)` | Back to the lobby |
| `ctx.player(room, id)`, `ctx.name(room, id)`, `ctx.connectedPlayers(room)` | Lookups |
| `ctx.cards` | `newDeck({ jokers, decks })`, `draw(deck)`, `shuffle`, `color(card)`, `value(card, { aceLow })`, `label(card)` |
| `ctx.dice` | `roll(count, sides)`, `sum(values)`, `isDouble(values)` |
| `ctx.turns` | `next(room, order, currentId)`, `first(room, order)`; skip players who left |

Cards are `{ rank: 2..14, suit: 'S'|'H'|'D'|'C' }` (11=J, 12=Q, 13=K, 14=A).

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
| `PB.feed(n)` | The last n activity lines |
| `PB.scoreboard()` | Sip totals |
| `PB.avatar(id, size)` | The player's emoji avatar in their colour (`size`: `''`, `'sm'`, `'lg'`) |
| `PB.name(id)`, `PB.esc(text)`, `PB.plural(n, word)` | Text helpers. **Always `esc` player-typed text.** |

The app adds the "your turn" chime (when `game.turnId` or `game.rollerId` becomes you), the drink
buzzer and the win fanfare (phase `'over'`) itself, so `sounds` only needs the game's own moments.
Colours come from CSS variables (`--bg`, `--card`, `--accent`, `--die`, `--back-1`…) so themes
and dice / card styles apply to your screens too.

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
