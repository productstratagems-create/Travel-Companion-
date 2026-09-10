/**
 * How does a curated «videre med kollektivt» read?
 *
 * Asked for from the screen at Jernbanetorget: the list should be curated by
 * arrival time and walking time. The numbers are unit-tested; what they cannot
 * say is whether a list where half the rows are dimmed looks considered or
 * looks broken. That is decided by looking.
 *
 * Renders the app's OWN row markup against the app's own stylesheet, with the
 * screenshot's own departures.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 4504;

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

const css = fs.readdirSync(path.join(DIST, 'assets')).find(f => f.endsWith('.css'));

/* The screenshot's own list, arriving at Jernbanetorget on platform 1.
   Arrival in 6 minutes; «ekstra tid» 2 min; platform change floor 3 min. */
const ARR_IN = 6, EXTRA = 2, FLOOR = 3;
const ROWS = [
  { m: 0,  line: '3', dest: 'Kolsås',             quay: '2' },
  { m: 0,  line: '4', dest: 'Bergkrystallen',     quay: '1' },
  { m: 2,  line: '4', dest: 'Vestli via Majorstuen', quay: '2' },
  { m: 3,  line: '3', dest: 'Mortensrud',         quay: '1' },
  { m: 4,  line: '2', dest: 'Østerås',            quay: '2' },
  { m: 5,  line: '5', dest: 'Vestli',             quay: '1' },
  { m: 5,  line: '1', dest: 'Helsfyr',            quay: '1' },
  { m: 7,  line: '3', dest: 'Stortinget',         quay: '2' },
  { m: 11, line: '4', dest: 'Bergkrystallen',     quay: '1' },
  { m: 14, line: '2', dest: 'Østerås',            quay: '2' },
];
const ARR_QUAY = '1';

const reachCls = (m) => (m > 5 ? 'r-ok' : m > 1 ? 'r-soon' : m >= 0 ? 'r-now' : 'missed');
const rowHtml = (r) => {
  const mins = r.m - ARR_IN;
  const same = r.quay === ARR_QUAY;
  const margin = mins - ((same ? 0 : FLOOR) + EXTRA);
  const rcls = reachCls(margin);
  const minsHtml = mins <= 0 ? 'NÅ' : mins + '<span>min</span>';
  return '<div class="hn-arr-row ' + rcls + '">'
    + '<div class="hn-arr-mins">' + minsHtml + '</div>'
    + '<div class="hn-arr-mid">'
    + '<span class="line-badge" style="background:#f5a000">' + r.line + '</span>'
    + '<span class="hn-arr-dest">' + r.dest + '</span>'
    + (rcls === 'missed' ? '<span class="hn-arr-late">går før du er framme</span>' : '')
    + '</div><div class="hn-arr-spor">spor ' + r.quay + '</div></div>';
};

/* The app keeps at most the last two you missed, then fills with catchable
   ones — otherwise the eight-row cap would spend the whole list on departures
   that have gone. Mirrored here so the picture is the app's, not a fiction. */
const MISSED_KEPT = 2;
const scored = ROWS.map(r => {
  const mins = r.m - ARR_IN;
  const same = r.quay === ARR_QUAY;
  return { r, rcls: reachCls(mins - ((same ? 0 : FLOOR) + EXTRA)) };
});
const keep = new Set(scored.filter(x => x.rcls === 'missed').slice(-MISSED_KEPT));
const SHOWN = scored.filter(x => x.rcls !== 'missed' || keep.has(x)).slice(0, 8).map(x => x.r);

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 700 },
    deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.evaluate(({ html, sheet }) => {
    document.body.innerHTML = '<div id="v-track" style="display:block;padding:1rem">'
      + '<div class="hn-section"><div class="hn-section-label">videre med kollektivt</div>'
      + '<div id="hn-arr-board">' + html + '</div></div></div>';
    void sheet;
  }, { html: SHOWN.map(rowHtml).join(''), sheet: css });
  await page.waitForTimeout(400);
  const read = await page.$$eval('.hn-arr-row', els => els.map(e =>
    (e.className.replace('hn-arr-row ', '')) + '  ' + e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('\n══ ' + scheme + ' ══  (ankomst om ' + ARR_IN + ' min, spor ' + ARR_QUAY
    + ', ekstra tid ' + EXTRA + ' min)');
  read.forEach(r => console.log('  ' + r));
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: 'scratchpad/shots/onward-' + scheme + '.png', animations: 'disabled' });
  await ctx.close();
}
await browser.close(); server.close();
