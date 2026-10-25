// Screenshots of a room's scenery moments, one after another, with any page errors: to check new
// moments look right. Run the server first (npm run dev), then:
//
//   node tools/moments.js dive tavern           every moment of these rooms
//   node tools/moments.js --last 3 dive         just the last 3 of each (the newest)
//
// Options: --at <ms> (how long after a moment starts to take the picture, 1800), --out <dir>
// (moment-shots), --url <server>. Each moment gets a screenshot, and sheet.png has them all.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const last = Number(opt('last', 0));
const at = Number(opt('at', 1800));
const out = path.resolve(opt('out', 'moment-shots'));
const url = opt('url', 'http://localhost:3000');
const looks = args;
if (!looks.length) {
  console.log('Which rooms? e.g. node tools/moments.js --last 3 dive tavern');
  process.exit(1);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const shots = [];
  const errors = [];
  await Promise.all(looks.map(async (look) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(`${look}: ${e.message}`));
    await page.goto(`${url}/preview?look=${look}&game=kingsCup&players=4`);
    await page.waitForTimeout(1000);
    // How many moments it has: play() says false past the end. Stop the room's own moments first.
    let count = 0;
    await page.evaluate(() => Scenery.set(null));
    await page.evaluate((l) => Scenery.set(l), look);
    while (await page.evaluate((i) => { const ok = Scenery.play(i); Scenery.set(null); Scenery.set(document.documentElement.dataset.room); return ok; }, count)) count += 1;
    for (let i = Math.max(0, last ? count - last : 0); i < count; i++) {
      await page.evaluate((l) => { Scenery.set(null); Scenery.set(l); }, look);
      await page.evaluate((n) => Scenery.play(n), i);
      await page.waitForTimeout(at);
      const file = path.join(out, `${look}-${i}.png`);
      await page.screenshot({ path: file });
      shots.push({ file, label: `${look} #${i}` });
    }
    await page.context().close();
  }));
  shots.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const tiles = shots.map((s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><figcaption>${s.label}</figcaption></figure>`).join('');
  const sheet = await (await browser.newContext({ viewport: { width: 1920, height: 400 } })).newPage();
  await sheet.setContent(`<style>body{margin:0;background:#000;display:flex;flex-wrap:wrap;gap:6px;padding:6px;font:16px system-ui;color:#fff}
    figure{margin:0;position:relative}img{height:200px;display:block}figcaption{position:absolute;left:6px;top:6px;background:#000a;padding:2px 8px;border-radius:4px}</style>${tiles}`);
  await sheet.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });
  await browser.close();
  console.log(`${shots.length} moments in ${out}`);
  if (errors.length) console.log('Page errors:\n ', errors.join('\n  '));
})();
