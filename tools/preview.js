// Screenshots of the TV (and phones) for a set of room looks, all at once, plus one sheet with
// them side by side. Run the server first (npm run dev), then:
//
//   node tools/preview.js --all                         every room and every mood
//   node tools/preview.js stpatricks stpatricksRain     just these looks
//   node tools/preview.js --game darts --phone tiki     a different game, and a phone too
//   node tools/preview.js lighthouseFog@0               @N plays scenery moment N first
//
// Options: --game <id> (default kingsCup), --players <n> (4), --wait <ms> (1500), --out <dir>
// (preview-shots), --url <server> (http://localhost:3000). Uses /preview (see server.js).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOM_STYLES = require('../lib/roomStyles');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && !!args.splice(i, 1);
};
const game = opt('game', 'kingsCup');
const players = opt('players', '4');
const wait = Number(opt('wait', 1500));
const out = path.resolve(opt('out', 'preview-shots'));
const url = opt('url', 'http://localhost:3000');
const phone = flag('phone');
const all = flag('all');
const looks = all ? ROOM_STYLES.IDS : args;
if (!looks.length) {
  console.log('Which looks? e.g. node tools/preview.js --all, or: node tools/preview.js', ROOM_STYLES.IDS.slice(0, 4).join(' '));
  process.exit(1);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const shots = [];
  const shoot = async ([item, kind], n) => {
    const [look, moment] = item.split('@');
    const viewport = kind === 'tv' ? { width: 1280, height: 720 } : { width: 390, height: 844 };
    const page = await (await browser.newContext({ viewport })).newPage();
    page.on('pageerror', (e) => errors.push(`${item}: ${e.message}`));
    const q = new URLSearchParams({ look, game, players, ...(moment !== undefined ? { moment } : {}) });
    await page.goto(`${url}/preview?${q}`);
    if (kind === 'phone') {
      // A phone in the same room, joining as one more player.
      const code = new URL(page.url()).searchParams.get('room');
      await page.goto(`${url}/?room=${code}`);
      await page.fill('#name', 'Zed');
      await page.click('#join');
    }
    await page.waitForTimeout(wait);
    const file = path.join(out, `${kind}-${item.replace('@', '-m')}.png`);
    await page.screenshot({ path: file });
    await page.context().close();
    shots[n] = { file, label: `${item}${kind === 'phone' ? ' (phone)' : ''}` };
  };
  const jobs = looks.flatMap((l) => (phone ? [[l, 'tv'], [l, 'phone']] : [[l, 'tv']]));
  // Six at a time.
  for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map((job, j) => shoot(job, i + j)));

  // One sheet with everything, in the order asked for.
  const tiles = shots.map((s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><figcaption>${s.label}</figcaption></figure>`).join('');
  const sheet = await (await browser.newContext({ viewport: { width: 1920, height: 400 } })).newPage();
  await sheet.setContent(`<style>body{margin:0;background:#000;display:flex;flex-wrap:wrap;gap:6px;padding:6px;font:16px system-ui;color:#fff}
    figure{margin:0;position:relative}img{height:300px;display:block}figcaption{position:absolute;left:6px;top:6px;background:#000a;padding:2px 8px;border-radius:4px}</style>${tiles}`);
  await sheet.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });
  await browser.close();
  console.log(`${shots.length} screenshots and sheet.png in ${out}`);
  if (errors.length) console.log('Page errors:\n ', errors.join('\n  '));
})();
