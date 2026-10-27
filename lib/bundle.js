// Packs the shared rules (lib/ and games/) into one browser script, so pass-and-play games run
// the exact same code on a single phone as the server runs for multiplayer.
//
//   <script src="/shared/bundle.js?game=madMax"></script>
//   const game = __req('madMax'); const { createContext } = __req('context');
//
// With a game, only that game and what it needs (what it requires, and what the pass-and-play
// page itself uses); without one, every game.

const fs = require('fs');
const path = require('path');

// Every lib/ file a game requires (directly or through another) has to be listed here.
const LIB = ['random', 'looks', 'options', 'teams', 'bots', 'cards', 'dice', 'turns', 'context', 'custom', 'betting', 'night', 'water', 'bigTomQuestions'];
// What the pass-and-play page uses itself (play/local.html), whatever the game.
const PAGE = ['context', 'custom', 'night', 'water'];

function buildBundle(root = path.join(__dirname, '..'), gameId = null) {
  const games = fs.readdirSync(path.join(root, 'games')).filter((f) => f.endsWith('.js')).map((f) => path.basename(f, '.js'));
  if (gameId !== null && !games.includes(gameId)) throw new Error(`no game ${gameId}`);
  const files = Object.fromEntries([...LIB.map((name) => [name, `lib/${name}.js`]), ...games.map((name) => [name, `games/${name}.js`])]);
  const source = (name) => fs.readFileSync(path.join(root, files[name]), 'utf8');

  // The modules wanted, and everything they require (by file name, as __req finds them).
  const wanted = new Set();
  const want = (name) => {
    if (wanted.has(name)) return;
    if (!files[name]) throw new Error(`${name} is required in the browser but isn't in lib/bundle.js`);
    wanted.add(name);
    for (const [, dep] of source(name).matchAll(/require\(['"]\.{1,2}\/(?:lib\/)?(\w+)['"]\)/g)) want(dep);
  };
  [...PAGE, ...(gameId === null ? games : [gameId])].forEach(want);

  const shim = `const __mods = {};
function __def(name, fn) { __mods[name] = { fn, module: null }; }
function __req(p) {
  const m = __mods[p.split('/').pop()];
  if (!m.module) { m.module = { exports: {} }; m.fn(m.module, m.module.exports, __req); }
  return m.module.exports;
}`;
  const defs = Object.keys(files).filter((name) => wanted.has(name)).map((name) =>
    `__def('${name}', function (module, exports, require) {\n${source(name)}\n});`);
  return `${shim}\n${defs.join('\n')}\n`;
}

module.exports = { buildBundle };
