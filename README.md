# Boolers

Phone-only party drinking games. One person creates a room on their phone, and everyone else joins by scanning the QR code, tapping the shared link or typing the 4-letter room code. No app, no TV.

## Games
| Game | Status |
|---|---|
| Most Likely To | ✅ Playable |
| Slevens (7-Eleven Doubles) | ✅ Playable |
| Ride the Bus | Planned |
| Mad Max | Planned |

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
public/app.js          home screen, lobby, shared UI helpers (PB.*)
tests/                 node:test tests + helpers for simulating games
```
See [games/README.md](games/README.md) for how to add a game.
