/* Bygger datasettet «spisesteder med smilefjes» (v1.218.328).
 *   node scripts/bygg-smilefjes.mjs [csv-fil]      (uten argument: laster ned fra Mattilsynet)
 * Skriver public/data/smilefjes/{rute}.json + indeks.json, og data/smilefjes-geokode.json (cache).
 * Kjøres i GitHub Actions (.github/workflows/smilefjes.yml) — sandkassen når ikke Mattilsynet. */
import fs from 'node:fs';
import { parseTilsyn, tilRuter } from '../src/api/smilefjesData.js';

const KILDE = 'https://smilefjes.mattilsynet.no/api/tilsyn.csv';
const UT = 'public/data/smilefjes', CACHE = 'data/smilefjes-geokode.json';
const geokodeUrl = r => 'https://ws.geonorge.no/adresser/v1/sok?treffPerSide=1&sok=' + encodeURIComponent(r.adresse.split(',')[0]) + (r.postnr ? '&postnummer=' + encodeURIComponent(r.postnr) : '');

const csv = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : await (async () => { const r = await fetch(KILDE); if (!r.ok) throw new Error('HTTP ' + r.status + ' fra ' + KILDE); return r.text(); })();
const { rader, kolonner, uten, antallTilsyn } = parseTilsyn(csv);   // kaster hvis påkrevde kolonner mangler
console.log('kolonner funnet:', JSON.stringify(kolonner), '· tilsyn:', antallTilsyn, '· spisesteder:', rader.length, '· forkastet (uten navn/dato/karakter):', JSON.stringify(uten));

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const trengs = rader.filter(r => (r.lat === null || r.lon === null) && r.adresse && !(r.adresse in cache));
console.log('koordinater i filen:', rader.length - rader.filter(r => r.lat === null).length, '· må geokodes:', trengs.length);
let i = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (i < trengs.length) {
    const r = trengs[i++];
    try {
      const j = await (await fetch(geokodeUrl(r))).json(), p = j.adresser && j.adresser[0] && j.adresser[0].representasjonspunkt;
      cache[r.adresse] = p ? [p.lat, p.lon] : null;
    } catch { /* ikke cachet: prøves igjen neste kjøring */ }
  }
}));
fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache));
for (const r of rader) if ((r.lat === null || r.lon === null) && cache[r.adresse]) [r.lat, r.lon] = cache[r.adresse];

const ruter = tilRuter(rader), utenPosisjon = rader.filter(r => r.lat === null || r.lon === null).length;
fs.rmSync(UT, { recursive: true, force: true }); fs.mkdirSync(UT, { recursive: true });
for (const [k, v] of Object.entries(ruter)) fs.writeFileSync(UT + '/' + k + '.json', JSON.stringify(v));
fs.writeFileSync(UT + '/indeks.json', JSON.stringify({ bygget: new Date().toISOString().slice(0, 10), kilde: KILDE, lisens: 'Mattilsynet (lisens må bekreftes, se docs/smilefjes.md)', spisesteder: rader.length, utenPosisjon, ruter: Object.keys(ruter).length }));
console.log('skrev', Object.keys(ruter).length, 'ruter · uten posisjon:', utenPosisjon);
