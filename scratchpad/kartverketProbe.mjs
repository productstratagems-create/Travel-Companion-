import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'node:fs'; import path from 'node:path';
const OUT = process.argv[2];
const leaflet = fs.readFileSync(path.resolve('node_modules/leaflet/dist/leaflet.js'), 'utf8');
const css = fs.readFileSync(path.resolve('node_modules/leaflet/dist/leaflet.css'), 'utf8');
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const tom = []; page.on('response', r => { if (/kartverket|geonorge/.test(r.url())) tom.push(r.status() + ' ' + (r.headers()['content-length'] || '?')); });
await page.setContent(`<html><head><style>${css} body{margin:0;font:12px monospace;background:#111;color:#ccc} .m{width:358px;height:300px;margin:4px 16px 14px}</style></head><body>
<div>topo · Mortensrud z15</div><div id=a class=m></div><div>topograatone · Mortensrud z15</div><div id=b class=m></div>
<div>topograatone + turruter (WMS) · Sognsvann z14</div><div id=c class=m></div><div>topograatone · Malmö z13 (utenfor Norge)</div><div id=d class=m></div>
<script>${leaflet}</script><script>
const K = l => 'https://cache.kartverket.no/v1/wmts/1.0.0/' + l + '/default/webmercator/{z}/{y}/{x}.png';
const kart = (id, l, c, z, wms) => { const m = L.map(id, { zoomControl: false }).setView(c, z); L.tileLayer(K(l), { attribution: '© Kartverket', maxZoom: 18 }).addTo(m);
  if (wms) L.tileLayer.wms('https://wms.geonorge.no/skwms1/wms.friluftsruter2', { layers: 'Fotrute,Skiloype,Sykkelrute,Ruteinfopunkt', format: 'image/png', transparent: true, version: '1.3.0' }).addTo(m); };
kart('a', 'topo', [59.849, 10.830], 15); kart('b', 'topograatone', [59.849, 10.830], 15);
kart('c', 'topograatone', [59.979, 10.732], 14, true); kart('d', 'topograatone', [55.609, 13.000], 13);
</script></body></html>`);
await page.waitForTimeout(9000);
await page.screenshot({ path: OUT, fullPage: true });
console.log('svar', tom.length, [...new Set(tom)].slice(0, 8));
await b.close();
