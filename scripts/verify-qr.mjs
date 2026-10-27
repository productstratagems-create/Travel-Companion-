#!/usr/bin/env node
/**
 * Read a generated QR back, to prove it encodes the URL it claims to.
 *
 *   node scripts/verify-qr.mjs "https://qr.vipps.no/…"
 *
 * An unverified QR is worse than none: it fails silently, in someone else's
 * hand, at the moment they were trying to help. This renders the SVG in
 * Chromium and decodes the pixels — the same check the app's own QR got when
 * the install guide shipped.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { APP_URL } from '../src/origin.js';

const require = createRequire(import.meta.url);
// Playwright may be installed globally rather than in the project — this
// script is a developer tool, not part of the app's dependency graph.
const pwPath = process.env.PLAYWRIGHT
  || '/opt/node22/lib/node_modules/playwright/index.js';
const pw = await import(pwPath).catch(() => require('playwright'));
// A CommonJS module imported dynamically lands under `.default`, so take
// whichever half actually carries the browsers.
const { chromium } = pw.chromium ? pw : (pw.default || {});

/* UTEN ARGUMENT SJEKKES KODEN SOM FAKTISK LIGGER I install.html.
 *
 * Før dette genererte skriptet en FERSK QR og dekodet den — altså prøvde
 * det generatoren, ikke artefaktet. QR-en som er sendt ut til folk var
 * ubundet: adressen i den er et gitter av firkanter, usynlig for ethvert
 * søk, og den eneste av appens forekomster som en leser SCANNER.
 *
 * `install.html` har en vakt ved kjøretid som sier fra om koden peker et
 * annet sted enn siden selv. Den er god, men den melder seg først når noen
 * står med telefonen oppe. Dette melder seg før utgivelsen. */
const URL_IN = process.argv[2] || APP_URL;
const FRA_SIDEN = !process.argv[2];

const svg = FRA_SIDEN
  ? (fs.readFileSync('public/install.html', 'utf8')
       .match(/<svg class="qr"[\s\S]*?<\/svg>/) || [null])[0]
  : execSync(`node scripts/make-qr.mjs ${JSON.stringify(URL_IN)}`).toString().trim();

if (!svg) {
  console.error('fant ingen <svg class="qr"> i public/install.html');
  process.exit(1);
}
const jsqr = fs.readFileSync(require.resolve('jsqr/dist/jsQR.js'), 'utf8');

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.setContent('<body style="margin:0;background:#fff">'
  + svg.replace('class="qr"', 'class="qr" style="width:330px;height:330px"')
  + '</body>');
await page.addScriptTag({ content: jsqr });

const got = await page.evaluate(async () => {
  const el = document.querySelector('svg');
  const xml = new XMLSerializer().serializeToString(el);
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 330; c.height = 330;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 330, 330);
  ctx.drawImage(img, 0, 0, 330, 330);
  const d = ctx.getImageData(0, 0, 330, 330);
  const r = window.jsQR(d.data, d.width, d.height);
  return r ? r.data : null;
});
await browser.close();

console.log('kilde     :', FRA_SIDEN ? 'public/install.html' : 'nygenerert');
console.log('kodet inn :', URL_IN);
console.log('lest ut   :', got == null ? '(kunne ikke leses)' : got);
if (got !== URL_IN) {
  console.error('QR-koden stemmer IKKE med adressen.');
  process.exit(1);
}
console.log('stemmer   : ja');
