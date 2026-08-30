#!/usr/bin/env node
/**
 * Turn a URL into the inline SVG this app embeds for QR codes.
 *
 *   node scripts/make-qr.mjs "https://qr.vipps.no/…"
 *
 * A script rather than a one-off paste because the URL is not known when the
 * code is written: whoever sets up the payment gets a link afterwards, and
 * has to be able to make the code themselves without going back to a
 * developer. Same shape as the app QR already in public/install.html.
 *
 * The output is self-contained SVG — no external request, which matters
 * because install.html is deliberately a single file with everything inlined.
 */
import QRCode from 'qrcode';

const url = process.argv[2];
if (!url) {
  console.error('bruk: node scripts/make-qr.mjs "<url>"');
  process.exit(1);
}

// Medium correction: enough to survive a phone screen's glare and a bit of
// dirt on a printed page, without inflating the module count.
const svg = await QRCode.toString(url, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#16120d', light: '#ffffff' },
});

// Strip the XML preamble and the fixed width/height so it scales with CSS,
// and give it a label — a QR with no accessible name is an unexplained blob
// to a screen reader.
const out = svg
  .replace(/<\?xml[^>]*\?>\s*/, '')
  .replace(/\s(width|height)="[^"]*"/g, '')
  .replace('<svg ', '<svg class="qr" role="img" aria-label="QR-kode" focusable="false" ');

console.log(out.trim());
