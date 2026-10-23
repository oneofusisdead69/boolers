// Builds the stand-alone demo pages (for sharing a link without the server) from the real
// pass-and-play pages: inlines the shared rules bundle and drops the link back to the app.
//
//   node tools/build-demos.js <output-dir>

const fs = require('fs');
const path = require('path');
const { buildBundle } = require('../lib/bundle');

const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'demos');
fs.mkdirSync(out, { recursive: true });
const bundle = buildBundle(root);

for (const name of ['slevens', 'madmax']) {
  const page = fs.readFileSync(path.join(root, 'public/play', `${name}.html`), 'utf8');
  const head = page.slice(page.indexOf('<head>') + 6, page.indexOf('</head>'));
  const body = page.slice(page.indexOf('<body>') + 6, page.indexOf('</body>'));
  // The demo viewer supplies the document shell, viewport and safe-area padding.
  const title = head.match(/<title>.*?<\/title>/)[0];
  const style = head.slice(head.indexOf('<style>'), head.indexOf('</style>') + 8);
  const demo = [
    title,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    style,
    body
      .replace('<script src="/shared/bundle.js"></script>', `<script>\n${bundle}</script>`)
      .replace(/\s*<a class="home-link"[^>]*>.*?<\/a>/, ''),
  ].join('\n');
  fs.writeFileSync(path.join(out, `${name}-demo.html`), demo);
  console.log(`${name}-demo.html: ${Math.round(demo.length / 1024)} KB`);
}
