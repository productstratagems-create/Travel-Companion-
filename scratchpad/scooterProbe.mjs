/**
 * Do clustered scooters read better than a pile?
 *
 * Reported with a screenshot of the arrival map at Jernbanetorget: eight
 * badges stacked on one spot, every one of them «100%», none of them saying
 * whose they were. The numbers say the grouping is right; only looking says
 * whether the map is.
 *
 * Renders the app's own marker markup against the app's own stylesheet, at
 * the same 20 m scale the screenshot was taken at.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4505;

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

/* The screenshot's own pile: eight scooters within a few metres, three
   operators between them. */
const V = (dx, dy, op, bat) => ({ x: 110 + dx, y: 50 + dy, op, bat });
const PILE = [
  V(0, 0, 'Voi', 100), V(6, 4, 'Voi', 100), V(-5, 7, 'Voi', 97), V(3, -6, 'Voi', 100),
  V(60, 10, 'Bolt', 100), V(66, 16, 'Bolt', 100),
  V(120, -4, 'Tier', 100), V(126, 6, 'Tier', 88),
];
const COLOUR = { Voi: '#f87171', Bolt: '#22c55e', Tier: '#60a5fa' };

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 300 },
    deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });

  const badge = (op, n, x, y) => '<div style="position:absolute;left:' + x + 'px;top:' + y
    + 'px;transform:translate(-50%,-50%)"><div class="hn-map-scooter" style="border-color:'
    + COLOUR[op] + ';color:' + COLOUR[op] + '">' + op.toUpperCase().slice(0, 4)
    + (n > 1 ? '<span class="mob-marker-n">×' + n + '</span>' : '') + '</div></div>';

  await page.evaluate(({ before, after }) => {
    document.body.innerHTML =
      '<div style="padding:.6rem 1rem;font:10px/1 monospace;letter-spacing:.15em;opacity:.6">FØR</div>'
      + '<div style="position:relative;height:100px;margin:0 1rem;border-radius:6px;'
      + 'background:linear-gradient(#2a2a2a,#1e1e1e);overflow:hidden">' + before + '</div>'
      + '<div style="padding:.6rem 1rem;font:10px/1 monospace;letter-spacing:.15em;opacity:.6">ETTER</div>'
      + '<div style="position:relative;height:100px;margin:0 1rem;border-radius:6px;'
      + 'background:linear-gradient(#2a2a2a,#1e1e1e);overflow:hidden">' + after + '</div>';
  }, {
    before: PILE.map(v => '<div style="position:absolute;left:' + v.x + 'px;top:' + v.y
      + 'px;transform:translate(-50%,-50%)"><div class="hn-map-scooter">' + v.bat + '%</div></div>').join(''),
    after: [['Voi', 4, 112, 50], ['Bolt', 2, 173, 63], ['Tier', 2, 233, 51]]
      .map(([op, n, x, y]) => badge(op, n, x, y)).join(''),
  });
  await page.waitForTimeout(400);
  console.log('\n══ ' + scheme + ' ══');
  console.log('  før :', (await page.$$eval('.hn-map-scooter', e => e.length)) - 3, 'merker');
  console.log('  etter:', (await page.$$eval('.mob-marker-n', e => e.map(x => x.textContent))).join(' '));
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: 'scratchpad/shots/scooter-' + scheme + '.png', animations: 'disabled' });
  await ctx.close();
}
await browser.close(); server.close();
