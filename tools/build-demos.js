// Builds the stand-alone demo pages (for sharing a link without the server) from the real
// pass-and-play pages: inlines the shared rules bundle, styles and screens, and drops the link
// back to the app.
//
//   node tools/build-demos.js <output-dir>

const fs = require('fs');
const path = require('path');
const { buildBundle } = require('../lib/bundle');

const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'demos');
fs.mkdirSync(out, { recursive: true });
const bundle = buildBundle(root);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// The demo viewer supplies the document shell, viewport and safe-area padding, so a demo is
// the page's title, styles and body.
function pageParts(html) {
  const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  const style = head.includes('<style>') ? head.slice(head.indexOf('<style>') + 7, head.indexOf('</style>')) : '';
  return { title: head.match(/<title>.*?<\/title>/)[0], style, body: body.replace(/\s*<a class="home-link"[^>]*>.*?<\/a>/, '') };
}

function write(name, { title, style, body }) {
  const demo = [title, '<meta name="claude:viewport-fit-sides" content="cover">', `<style>${style}</style>`, body].join('\n');
  fs.writeFileSync(path.join(out, name), demo);
  console.log(`${name}: ${Math.round(demo.length / 1024)} KB`);
}

// Hand-built pass-and-play pages.
for (const name of ['slevens', 'madmax']) {
  const parts = pageParts(read(`public/play/${name}.html`));
  parts.body = parts.body.replace('<script src="/shared/bundle.js"></script>', `<script>\n${bundle}</script>`);
  write(`${name}-demo.html`, parts);
}

// Games played through the general pass-and-play page, with their screens baked in.
const TITLES = { rideTheBus: 'Ride the Bus', kingsCup: 'Kings Cup', liarsDice: "Liar's Dice" };
for (const id of Object.keys(TITLES)) {
  const parts = pageParts(read('public/play/local.html'));
  let body = parts.body
    .replace('<script src="/pb.js"></script>', `<script>\n${read('public/pb.js')}</script>\n<script>\n${read(`public/games/${id}.js`)}</script>`)
    .replace('<script src="/shared/bundle.js"></script>', `<script>\n${bundle}</script>`)
    .replace("const gameId = params.get('game');", `const gameId = '${id}';`);
  const start = body.indexOf("    // Load the game's screens, then show setup.");
  const end = body.indexOf('document.head.appendChild(script);', start) + 'document.head.appendChild(script);'.length;
  if (start < 0 || end < start) throw new Error('screen loader not found in local.html');
  body = `${body.slice(0, start)}    renderSetup();${body.slice(end)}`;
  write(`${id}-demo.html`, {
    title: `<title>${TITLES[id]} · Boolers</title>`,
    style: `${read('public/style.css')}\n${parts.style}`,
    body,
  });
}
