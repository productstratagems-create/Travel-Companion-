/**
 * Does a tap on the list point at something you can find?
 *
 * Asked for: «Listen med 3 mulige valg er ikke klikkbar. Ønsker at et klikk
 * på en av de skal highlightes i kartet.» And two things that already existed
 * but could not be told apart: the reader's own position was drawn in the
 * SAME blue as the destination pin, and was never included in the map's fit.
 *
 * Renders the app's own row and marker markup against the app's own
 * stylesheet, and drives a tap.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4506;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(DIST, rel);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return void res.writeHead(404).end('x');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(PORT, r));

/* Two scooters the app can now tell apart: one whose feed reports a real
   percentage, one whose feed reports only a range. Under the old rule both
   read «100% · ca 25 km». */
const ROWS = [
  { rank: 1, icon: '🚲', name: 'Bysykkel', sub: 'The Hub', meta: '20 ledig · 30 m unna', t: '4 min', b: '1g + 3r' },
  { rank: 2, icon: '🛴', name: 'Voi', sub: 'sparkesykkel', meta: '42% · ca 18.4 km · 9 m unna', t: '4 min', b: '1g + 3r' },
  { rank: 3, icon: '🛴', name: 'Bolt', sub: 'sparkesykkel', meta: 'ca 9.2 km igjen · 40 m unna', t: '5 min', b: '1g + 4r' },
  { rank: 4, icon: '🚶', name: 'Gå', sub: null, meta: '597 m', t: '8 min', b: null },
];
const rowHtml = (r, i, picked) =>
  '<button type="button" class="mob-option' + (i === 0 ? ' mob-best' : '')
  + (picked === i ? ' mob-picked' : '') + '" data-i="' + i + '">'
  + '<span class="mob-rank">' + r.rank + '</span>'
  + '<span class="mob-icon">' + r.icon + '</span>'
  + '<div class="mob-info"><span class="mob-name">' + r.name
  + (r.sub ? ' <span class="mob-sub">· ' + r.sub + '</span>' : '') + '</span>'
  + '<span class="mob-meta">' + r.meta + '</span></div>'
  + '<div class="mob-time' + (i === 0 ? ' mob-time-best' : '') + '">'
  + '<span class="mob-total">' + r.t + '</span>'
  + (r.b ? '<span class="mob-breakdown">' + r.b + '</span>' : '') + '</div></button>';

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 460 },
    deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });

  const render = (picked) => page.evaluate(({ html, picked: p }) => {
    document.body.innerHTML =
      // A strip of map, with the three things that must be distinguishable.
      '<div style="position:relative;height:120px;margin:1rem;border-radius:6px;'
      + 'background:linear-gradient(#2a2a2a,#1e1e1e);overflow:hidden">'
      + '<div style="position:absolute;left:80px;top:60px;transform:translate(-50%,-50%)">'
      + '<div class="hn-map-scooter' + (p === 1 ? ' picked' : '')
      + '" style="border-color:#f87171;color:#f87171">VOI<span class="mob-marker-n">×4</span></div></div>'
      + '<div style="position:absolute;left:170px;top:45px;transform:translate(-50%,-50%)">'
      + '<div class="hn-map-bike' + (p === 0 ? ' picked' : '') + '">20</div></div>'
      + '<div id="p-you" style="position:absolute;left:250px;top:75px;width:16px;height:16px;'
      + 'border-radius:50%;background:var(--map-you);border:2.5px solid var(--map-ink);'
      + 'transform:translate(-50%,-50%)"></div>'
      + '<div id="p-dest" style="position:absolute;left:330px;top:50px;width:16px;height:16px;'
      + 'border-radius:50%;background:#60a5fa;border:2px solid #60a5fa;'
      + 'transform:translate(-50%,-50%)"></div>'
      + '</div>'
      + '<div style="margin:0 1rem" id="hn-mobility-content">' + html + '</div>';
  }, { html: ROWS.map((r, i) => rowHtml(r, i, picked)).join(''), picked });

  await render(null);
  await page.waitForTimeout(300);
  const you = await page.$eval('#p-you', e => getComputedStyle(e).backgroundColor);
  const dest = await page.$eval('#p-dest', e => getComputedStyle(e).backgroundColor);
  console.log('\n══ ' + scheme + ' ══');
  console.log('  du er her  :', you);
  console.log('  destinasjon:', dest);
  console.log('  til å skille:', you !== dest ? 'JA' : 'NEI — samme farge');
  await page.screenshot({ path: 'scratchpad/shots/charge-' + scheme + '-før.png', animations: 'disabled' });

  await render(1);   // the reader tapped row 2, «Voi»
  await page.waitForTimeout(300);
  const marked = await page.$$eval('.picked, .mob-picked', e => e.length);
  console.log('  etter trykk på rad 2 — markert:', marked, '(rad + merke)');
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: 'scratchpad/shots/charge-' + scheme + '.png', animations: 'disabled' });
  await ctx.close();
}
await browser.close(); server.close();
