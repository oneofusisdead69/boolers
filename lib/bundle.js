// Packs the shared rules (lib/ and games/) into one browser script, so pass-and-play games run
// the exact same code on a single phone as the server runs for multiplayer.
//
//   <script src="/shared/bundle.js"></script>
//   const game = __req('madMax'); const { createContext } = __req('context');

const fs = require('fs');
const path = require('path');

function buildBundle(root = path.join(__dirname, '..')) {
  const mods = [
    ['cards', 'lib/cards.js'],
    ['dice', 'lib/dice.js'],
    ['turns', 'lib/turns.js'],
    ['context', 'lib/context.js'],
    ['custom', 'lib/custom.js'],
    ['betting', 'lib/betting.js'],
    ['night', 'lib/night.js'],
    ['water', 'lib/water.js'],
    ['bigTomQuestions', 'lib/bigTomQuestions.js'],
    ...fs.readdirSync(path.join(root, 'games'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => [path.basename(f, '.js'), `games/${f}`]),
  ];
  const shim = `const __mods = {};
function __def(name, fn) { __mods[name] = { fn, module: null }; }
function __req(p) {
  const m = __mods[p.split('/').pop()];
  if (!m.module) { m.module = { exports: {} }; m.fn(m.module, m.module.exports, __req); }
  return m.module.exports;
}`;
  const defs = mods.map(([name, file]) =>
    `__def('${name}', function (module, exports, require) {\n${fs.readFileSync(path.join(root, file), 'utf8')}\n});`);
  return `${shim}\n${defs.join('\n')}\n`;
}

module.exports = { buildBundle };
