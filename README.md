# Bool Games

Phone-only party drinking games. One person creates a room on their phone, and everyone else joins by scanning the QR code, tapping the shared link or typing the 4-letter room code. No app, no TV.

## Games
| Game | Status |
|---|---|
| Slevens (7-Eleven Doubles) | ✅ Playable |
| Mad Max | ✅ Playable |
| Ride the Bus | ✅ Playable |
| Kings Cup | ✅ Playable |
| Liar's Dice | ✅ Playable |
| Shot Poker | ✅ Playable |

## Pass and play
Every game can also be played on one phone passed around: **Pass and play** on the home screen. Slevens and Mad Max have their own pages (`/play/slevens.html`, `/play/madmax.html`); other games run in `/play/local.html?game=<id>`, which shows each game's normal screens for whoever has to act next. These pages run the same rules code as multiplayer, served as one browser script from `/shared/bundle.js` (built by `lib/bundle.js`), so the games never drift apart. `node tools/build-demos.js <dir>` turns them into stand-alone demo pages.

## Make it yours
- **⚙️ Settings** (on every screen, remembered per phone): sound effects on/off and volume, a colour theme (Night, Neon, Sunset, Light), dice colours and card backs. Sounds are made in the browser, so there are no audio files.
- **Avatars:** tap the avatar next to your name to pick an emoji and a colour. Everyone sees it beside your name.
- **Custom content:** the host taps **✏️ Customize** in the lobby to write their own Kings Cup rules, categories and rhymes. Saved on the host's phone and used whenever they start that game (pass and play too).

## Full screen
Where the browser allows it (Android), the app goes full screen when you create, join or start a game, with a ⛶ button to get back to it. iPhone Safari doesn't let websites go full screen.

**Keep screen on:** a ☀️ toggle on the home and lobby screens stops the phone sleeping mid-game (iPhone iOS 16.4+, Android). It's remembered per phone and re-applied when you come back to the app.

## Run locally
```bash
npm install
npm run dev        # restarts on file changes; http://localhost:3000
npm test           # game logic tests
```
- **Simulator:** http://localhost:3000/dev.html shows several phones side by side (`?n=4` for 4).
- **Real phones on your Wi-Fi:** open `http://<your-computer's-ip>:3000` on each phone.

## Deploy (free) on Render
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
public/pb.js           shared screen helpers (PB.*), custom content editor
public/prefs.js        per-phone settings: sounds, themes, dice and card styles
lib/looks.js           avatar and colour lists (server and phones)
lib/custom.js          checks custom game content from the host
tests/                 node:test tests + helpers for simulating games
```
See [games/README.md](games/README.md) for how to add a game.
