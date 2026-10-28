// Big Tom's bank of the best questions players have come up with. At the end of each game
// everyone picks the best of the questions players wrote themselves (or "None of these"); a
// question that clearly wins is saved here, and 🎲 Generate sometimes draws from the bank instead of the built-in list
// (games/bigTom.js). Each saved question keeps a running score across games, so the ones people
// keep picking come up more and the ones that fall flat fade away.
//
// Only the question's text and its game mode are kept: no names, no room codes.
//
// Where it's kept follows the room store (ROOM_STORE, see lib/roomStore.js):
//   firestore  Google Cloud Firestore, collection "bigTomBank", one document per question
//   file       a JSON file beside the rooms file (.bigTomBank.json), handy for trying it locally
//   (unset)    memory: the bank lasts until the server restarts
//
// Draws have to be instant (they happen inside a tap), so the whole bank is loaded into memory when
// the server starts and draws come from there; changes are written out afterwards, in the
// background. A store that's down only means nothing is saved: the game never waits on it.

const MAX_LEN = 140; // what Big Tom lets anyone type
const MAX_PER_MODE = 1000; // beyond this, the weakest question makes room
const WRITE_DELAY_MS = 1000;

// The text as it's shown: one line, single spaces, no longer than Big Tom allows.
const normalise = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN) : '');
// Two questions are the same if they differ only in case, spacing or a question mark at the end.
const keyOf = (mode, s) => `${mode}:${normalise(s).toLowerCase().replace(/[\s?!.…]+$/, '')}`;

// The poll's winner, if it's good enough to keep: at least 2 votes, more than any other question
// and more than "None of these". (With only 2 or 3 voters, 2 votes is a majority already.)
// `votes` is one count per question, in order; returns its index, or -1.
function winner(votes, none) {
  const top = Math.max(0, ...votes);
  if (top < 2 || top <= none || votes.filter((n) => n === top).length > 1) return -1;
  return votes.indexOf(top);
}

// How likely a saved question is to be drawn. Being picked and getting votes count for it; being
// shown and losing to "None of these" count against it. The safety net: a question that keeps
// being shown and keeps not being picked (it only ever won the once, say) drops to a quarter.
function weight(e) {
  let w = (1 + e.votes + 2 * e.picked) / (1 + e.shown + e.nones);
  if (e.shown - e.picked >= 3 && e.picked * 3 < e.shown) w /= 4;
  return Math.max(0.02, w);
}

// ---------- Where it's kept ----------

// Writes the whole bank to one file (it's small), via a temporary file so a crash mid-write
// doesn't lose it.
function fileBackend(file) {
  const fs = require('fs');
  return {
    async loadAll() {
      try { return Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return []; }
    },
    async apply(changes, all) {
      await fs.promises.writeFile(`${file}.tmp`, JSON.stringify(Object.fromEntries(all)));
      await fs.promises.rename(`${file}.tmp`, file);
    },
  };
}

// One document per question. Counts go up with increments, so two servers (during a deploy)
// adding votes at once both count.
function firestoreBackend() {
  const crypto = require('crypto');
  const { Firestore, FieldValue } = require('@google-cloud/firestore');
  const col = new Firestore({ ignoreUndefinedProperties: true }).collection('bigTomBank');
  const docId = (key) => crypto.createHash('sha1').update(key).digest('hex');
  return {
    async loadAll() {
      const snap = await col.limit(MAX_PER_MODE * 4).get();
      return snap.docs.map((d) => d.data());
    },
    async apply(changes) {
      const batch = col.firestore.batch();
      for (const c of changes) {
        const ref = col.doc(docId(c.key));
        if (c.removed) { batch.delete(ref); continue; }
        const inc = Object.fromEntries(['votes', 'shown', 'picked', 'nones'].map((k) => [k, FieldValue.increment(c.delta[k] || 0)]));
        batch.set(ref, { key: c.key, text: c.text, mode: c.mode, ...inc, updatedAt: Date.now() }, { merge: true });
      }
      await batch.commit();
    },
  };
}

function createQuestionBank({ kind = process.env.ROOM_STORE, file = '.bigTomBank.json', chance = 0.3 } = {}) {
  let backend = null;
  try {
    if (kind === 'firestore') backend = firestoreBackend();
    else if (kind === 'file') backend = fileBackend(file);
  } catch (err) {
    console.error('Big Tom question bank unavailable, keeping it in memory only:', err.message);
  }
  const entries = new Map(); // key -> { key, text, mode, votes, shown, picked, nones }
  let changes = new Map(); // key -> what to write out next
  let timer = null;
  let writing = Promise.resolve();

  const change = (e, delta, removed = false) => {
    const c = changes.get(e.key) || { key: e.key, text: e.text, mode: e.mode, delta: {} };
    for (const [k, n] of Object.entries(delta)) c.delta[k] = (c.delta[k] || 0) + n;
    c.removed = removed;
    changes.set(e.key, c);
  };

  const write = () => {
    timer = null;
    if (!backend || !changes.size) return writing;
    const batch = [...changes.values()];
    changes = new Map();
    writing = writing.then(() => backend.apply(batch, entries)).catch((err) => console.error("Couldn't save Big Tom's question bank:", err.message));
    return writing;
  };
  const later = () => { if (backend && !timer) { timer = setTimeout(write, WRITE_DELAY_MS); timer.unref?.(); } };

  const bank = {
    // How often 🎲 Generate draws from the bank rather than the built-in list (0 to 1).
    chance,

    // Reads the saved bank in, once, when the server starts.
    async load() {
      if (!backend) return;
      try {
        for (const e of await backend.loadAll()) {
          const text = normalise(e?.text);
          if (!text || !['normal', 'nsfw'].includes(e.mode)) continue;
          const key = keyOf(e.mode, text);
          entries.set(key, { key, text, mode: e.mode, votes: +e.votes || 0, shown: +e.shown || 0, picked: +e.picked || 0, nones: +e.nones || 0 });
        }
      } catch (err) {
        console.error("Couldn't load Big Tom's question bank:", err.message);
      }
    },

    // A game's poll: each question shown with its votes, and how many said "None of these".
    // Only these have their scores touched: ones already in the bank are updated; the winner, if it won
    // clearly (see winner), goes in.
    record({ mode, questions, none = 0 }) {
      const best = winner(questions.map((q) => q.votes), none);
      const seen = new Set();
      questions.forEach((q, i) => {
        const text = normalise(q.text);
        const key = keyOf(mode, text);
        if (!text || seen.has(key)) return;
        seen.add(key);
        let e = entries.get(key);
        if (!e && i !== best) return;
        if (!e) entries.set(key, (e = { key, text, mode, votes: 0, shown: 0, picked: 0, nones: 0 }));
        const delta = { votes: q.votes, shown: 1, picked: i === best ? 1 : 0, nones: none };
        for (const [k, n] of Object.entries(delta)) e[k] += n;
        change(e, delta);
      });
      // Too many: the weakest goes.
      const mine = [...entries.values()].filter((e) => e.mode === mode);
      if (mine.length > MAX_PER_MODE) {
        const worst = mine.reduce((a, b) => (weight(b) < weight(a) ? b : a));
        entries.delete(worst.key);
        change(worst, {}, true);
      }
      later();
      return best;
    },

    // A saved question for this mode, drawn by weight, that isn't one of `used` (texts already
    // asked this game); null if there isn't one.
    draw(mode, used = []) {
      const skip = new Set(used.map((t) => keyOf(mode, t)));
      const pool = [...entries.values()].filter((e) => e.mode === mode && !skip.has(e.key));
      let r = Math.random() * pool.reduce((sum, e) => sum + weight(e), 0);
      for (const e of pool) if ((r -= weight(e)) < 0) return e.text;
      return pool.length ? pool[pool.length - 1].text : null;
    },

    // Everything saved for a mode, best first (for tests and a look at what's in there).
    list(mode) {
      return [...entries.values()].filter((e) => !mode || e.mode === mode).sort((a, b) => weight(b) - weight(a)).map((e) => ({ ...e, weight: weight(e) }));
    },

    // Writes out anything still waiting (when the server is being stopped).
    async flush() {
      clearTimeout(timer);
      await write();
    },
  };
  return bank;
}

module.exports = { createQuestionBank, normalise, keyOf, winner, weight };
