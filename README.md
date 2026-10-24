# Bool Games

Phone-only party drinking games. One person creates a room on their phone, and everyone else joins by scanning the QR code, tapping the shared link or typing the 4-letter room code. No app, no TV.

## Games
| Game | Status |
|---|---|
| Big Tom (Quiplash but worse) | ✅ Playable |
| Slevens (7-Eleven Doubles) | ✅ Playable |
| Mad Max | ✅ Playable |
| Ride the Bus | ✅ Playable |
| Kings Cup | ✅ Playable |
| Liar's Dice | ✅ Playable |
| Shot Poker | ✅ Playable |
| Horse Race | ✅ Playable |
| Ace Race | ✅ Playable |
| Darts (drinking darts, 301/501, around the clock, cricket) | ✅ Playable |

### Darts
Drag on the throwing pad to move the crosshair, then flick up to throw. A flick that leans left or right pulls the dart that way; too soft drops it low, too hard sends it high, and there's a little random wobble on top (Steady / Normal / Wobbly in the lobby). **Hard mode** hides the crosshair (on every phone and the TV) and the "Aiming at T20" readout, so you aim by feel. After each throw the pad says how it went ("Too soft (80%), leaning 6° left"). Without a TV the board is on every phone and everyone sees the crosshair and darts live; with a TV the board is on the TV and the thrower's phone becomes a big throwing pad.

## Pass and play
Every game except Big Tom (secret answers need a phone each) can also be played on one phone passed around: **Pass and play** on the home screen. Slevens and Mad Max have their own pages (`/play/slevens.html`, `/play/madmax.html`); other games run in `/play/local.html?game=<id>`, which shows each game's normal screens for whoever has to act next. These pages run the same rules code as multiplayer, served as one browser script from `/shared/bundle.js` (built by `lib/bundle.js`), so the games never drift apart. `node tools/build-demos.js <dir>` turns them into stand-alone demo pages.

## Make it yours
- **⚙️ Settings** (on every screen, remembered per phone): sound effects on/off and volume, a colour theme (Night, Neon, Sunset, Light), dice colours and card backs. Sounds are made in the browser, so there are no audio files.
- **Avatars:** tap the avatar next to your name to pick an emoji and a colour. Everyone sees it beside your name.
- **Custom content:** the host taps **✏️ Customize** in the lobby to write their own Kings Cup rules, categories and rhymes, or add questions to Big Tom's 🎲 Generate. Saved on the host's phone and used whenever they start that game (pass and play too).

## Usage analytics and feedback
- **Visitors:** Cloudflare Web Analytics. Put the site token in `public/analytics.js` (`TOKEN`); see the numbers in Cloudflare under **Analytics & Logs → Web Analytics**. No cookies.
- **Games and feedback:** the server writes one JSON line per room created, game started / ended (game, players, minutes, online or pass and play) and feedback message. Nothing personal: no names, room codes or IP addresses. On Cloud Run these land in Cloud Logging (kept 30 days). From Cloud Shell:

```bash
# Games started in the last 7 days, by game
gcloud logging read 'resource.labels.service_name="boolers" AND jsonPayload.event=("game_started" OR "local_game_started")' --freshness=7d --format='value(jsonPayload.game)' --limit=10000 | sort | uniq -c | sort -rn

# Online vs pass and play
gcloud logging read 'resource.labels.service_name="boolers" AND jsonPayload.event=("game_started" OR "local_game_started")' --freshness=7d --format='value(jsonPayload.mode)' --limit=10000 | sort | uniq -c

# Rooms created
gcloud logging read 'resource.labels.service_name="boolers" AND jsonPayload.event="room_created"' --freshness=7d --format='value(timestamp)' --limit=10000 | wc -l

# Feedback (newest first)
gcloud logging read 'resource.labels.service_name="boolers" AND jsonPayload.event="feedback"' --freshness=30d --format='table(timestamp, jsonPayload.game, jsonPayload.contact, jsonPayload.message)'
```

Local copies (localhost or your Wi-Fi) don't send visitor or pass-and-play stats, so testing doesn't count.

## Full screen
Where the browser allows it (Android), the app goes full screen when you create, join or start a game, with a ⛶ button to get back to it. iPhone Safari doesn't let websites go full screen.

**Keep screen on:** a ☀️ toggle on the home and lobby screens stops the phone sleeping mid-game (iPhone iOS 16.4+, Android). It's remembered per phone and re-applied when you come back to the app.

## Sideways
Turn a phone (or open the app on a tablet) sideways and every screen splits in two: the table, track or cards on the left, your buttons and the scores on the right. Nothing to switch on.

## Water breaks
Whenever the room switches to a different game, or after three games in a row, every phone and the TV get a "💧 Water break" reminder to have some water before the next game. Pass and play does the same every third game.

## End-of-night recap
When the night winds down, the host taps **🏁 Wrap up the night** in the lobby. Every phone and the TV show the recap: awards (🍺 Thirstiest, 🎁 Most generous, 🥃 Bottoms up, 🏆 Champion), the games played and who won, the best moments (the best darts turn, the biggest Liar's Dice lie, the biggest Shot Poker pot, the biggest race win) and the whole tab. **📸 Share the night** makes an image in the room's style to post or send. The host can go back to the lobby, or **start a new night** with everyone's tab back at zero. Games report moments with `ctx.highlight(room, key, playerId, value, text)` (see `lib/night.js`).

## Room styles
The host can name the venue ("Noah's Basement") and dress the room up from the lobby. The name shows in the lobby, big on the TV ("Welcome to Noah's Basement"), in the TV's header and on the recap ("Tonight at Noah's Basement"). Styles: **Classic, Dive bar, Tavern, Club, Castle, Jazz club, Diner, Tiki bar, Speakeasy, Casino, Saloon, Pirate tavern, Beer hall and Space lounge**, plus seasonal **Christmas, Halloween and St Patrick's**. Everyone's phone and the TV take on the style's colours, background, heading font and (on the TV) table: a pool-table green under a brick wall, an oak tavern table, a neon-rimmed club table, a royal round table, burgundy velvet, or a teal diner table on a checkerboard floor. The host can switch it any time, even mid-game. On the TV each style also has its own background sound, made live in the browser (`public/ambience.js`): murmur and clinking glasses, a crackling fire and a lute, a club beat, wind and torches, a jazz trio, diner chatter and a sizzling grill. A 🎵 button on the TV sets it to Off, Low or High. While a room style is on it replaces each phone's own colour theme; the phone's theme comes back outside the room. Styles live in `lib/roomStyles.js`.

## TV mode
Got a TV or laptop handy? Create a room on a phone as usual, then open **bool.games/tv** on the big screen and type the room code (or open `bool.games/tv?room=CODE`). The host still runs everything from their phone; the TV just watches.
- **Lobby:** the join QR code, the room code, who's in and the rules of the game that's up next.
- **In a game:** everyone sits round a felt table (glowing on their turn), with the game in the middle: the horse race, the Kings Cup ring, the pyramid, the poker table, Big Tom's answers and drawings… The sidebar has the leaderboard (this game and tonight), a rules reminder and what just happened. Drinks pop up in the corner.
- **Sound:** the TV plays the sound effects and phones go quiet while it's connected (they still buzz). Click the TV page once to allow sound.
- Secret things (your dice, your hole cards, your hand) never go to the TV.

## Run locally
```bash
npm install
npm run dev        # restarts on file changes; http://localhost:3000
npm test           # game logic tests
```
- **Simulator:** http://localhost:3000/dev.html shows several phones side by side (`?n=4` for 4).
- **Real phones on your Wi-Fi:** open `http://<your-computer's-ip>:3000` on each phone.

## Deploy on Google Cloud Run (bool.games)
One-time setup, so rooms survive restarts and redeploys (Firestore's free tier is plenty):
```bash
gcloud services enable firestore.googleapis.com
gcloud firestore databases create --location=nam5
```
Then deploy (from Cloud Shell, in `~/boolers`):
```bash
git pull && gcloud run deploy boolers --source . --region us-central1 --allow-unauthenticated \
  --max-instances 1 --min-instances 1 --session-affinity --timeout 3600 \
  --set-env-vars ROOM_STORE=firestore
```
- `--min-instances 1` keeps the server awake, so nobody waits for a cold start and an idle night doesn't shut it down (costs a few dollars a month).
- `ROOM_STORE=firestore` saves each room (code, players, tonight's sips, game choice, style) a moment after it changes and loads them back on start. A game that was being played goes back to the lobby after a restart; phones reconnect by themselves. Locally, `ROOM_STORE=file npm start` does the same with a `.rooms.json` file.

1. Push this folder to a GitHub repo.
2. In Render, go to **New > Blueprint** and pick the repo. `render.yaml` configures everything.
3. Share the `https://<name>.onrender.com` URL. On the free plan the server sleeps after about 15 minutes idle, so the first load can take around 30 seconds.

## Project layout
```
server.js              rooms, joining, lobby, real-time connection
lib/                   shared tools: cards, dice, turn order, drink tracking
games/<id>.js          each game's rules (server)
public/games/<id>.js   each game's screens (phones)
public/app.js          home screen, lobby, avatar picker
public/tv.js           TV mode (public/tv.html, tv.css)
public/pb.js           shared screen helpers (PB.*), custom content editor
public/prefs.js        per-phone settings: sounds, themes, dice and card styles
lib/looks.js           avatar and colour lists (server and phones)
lib/roomStyles.js      room styles: dive bar, tavern… (server, phones and TV)
lib/roomStore.js       saves rooms across restarts (Firestore or a file)
lib/custom.js          checks custom game content from the host
tests/                 node:test tests + helpers for simulating games
```
See [games/README.md](games/README.md) for how to add a game.
