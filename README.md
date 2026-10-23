# PartyBox

Phone-only party drinking games. One person creates a room on their phone, and everyone else joins by scanning the QR code, tapping the shared link or typing the 4-letter room code. No app, no TV.

## Games
- **Most Likely To**: everyone votes on who fits the prompt. Whoever gets the most votes drinks one sip per vote. If nobody votes, everyone drinks.

## Run locally
```bash
npm install
npm start          # http://localhost:3000
```
To play on phones over your home Wi-Fi, open `http://<your-computer's-ip>:3000` on each phone.

## Deploy (free) on Render
1. Push this folder to a GitHub repo.
2. On https://render.com, go to **New > Web Service** and pick the repo.
3. Set the build command to `npm install` and the start command to `npm start`, then choose the Free plan.
4. Share the `https://<name>.onrender.com` URL. On the free plan the server sleeps after about 15 minutes idle, so the first load can take around 30 seconds.

Any host that runs Node and supports WebSockets also works (Railway, Fly.io, a VPS).

## Adding a game
1. Create `games/<yourGame>.js` exporting `id, name, description, minPlayers, start, handle, check, view` (copy `games/mostLikely.js`).
2. Register it in the `GAMES` list at the top of `server.js`.
3. Add its screens to `SCREENS` in `public/app.js`, one render function per phase.
