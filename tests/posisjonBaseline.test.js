/* BASELINE FOR #809 STEG 1 — «Mål dagens situasjon» (v1.218.329). INGEN endring i produksjonslogikken: testen pinner
 * hva rangeringen (`rankStops`), valget (`pickStop`), retningen (`approach`) og ombord-gjenkjenningen (`ombord`) gjør i dag,
 * slik at senere steg kan vise at anbefalingene ble bedre — eller at de ikke ble verre.
 * FORLØPENE ER KONSTRUERT (tests/fixtures/posisjon/baseline.js), ikke innspilt GPS: sandkassen har ingen ekte GPS.
 * IKKE MÅLT her (krever Valhalla/Entur): gangtid og reiseforslag. Se docs/posisjon-baseline.md. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/storage.js', () => { let s = {}; return { storage: { get: k => s[k] ?? null, set: (k, v) => { s[k] = v; }, remove: k => { delete s[k]; } } }; });

import { rankStops, pickStop, stopBand } from '../src/views/auto.js';
import { depUses } from '../src/api/usage.js';
import { approach, closingRate } from '../src/trail.js';
import { ombord } from '../src/api/ombord.js';
import { FORLØP, stoppFra, T0, LAT, lon } from './fixtures/posisjon/baseline.js';

const rang = n => { const f = FORLØP[n], l = stoppFra(f.sluttM); return { f, l, r: rankStops(l, depUses(), f.spor) }; };
const topp = n => rang(n).r.map(s => s.name + ':' + s.distM + ':' + approach(rang(n).f.spor, s).kind + ':b' + stopBand(s, depUses(), rang(n).f.spor));

/** Forventet: [navn:avstand:retning:bånd] i rangert rekkefølge — dagens oppførsel. */
const FORVENTET = {
  'står stille ved et stopp': ['Stenbråten:20:staar:b0', 'Granebakken:270:staar:b2', 'Maikollen:280:staar:b2', 'Olasrudveien:580:staar:b2', 'Mortensrud:879:staar:b2'],
  'går mot Granebakken (1,4 m/s, 110 m unna)': ['Granebakken:110:mot:b1', 'Stenbråten:360:mot:b1', 'Maikollen:660:mot:b1', 'Olasrudveien:959:mot:b1', 'Mortensrud:1259:mot:b1'],
  'går bort fra Stenbråten, 82 m unna (innenfor båndet)': ['Stenbråten:82:fra:b0', 'Maikollen:218:mot:b1', 'Olasrudveien:518:mot:b1', 'Mortensrud:817:mot:b1', 'Granebakken:332:fra:b2'],
  'går bort fra Stenbråten, 180 m unna (utenfor båndet)': ['Maikollen:120:mot:b1', 'Olasrudveien:420:mot:b1', 'Mortensrud:720:mot:b1', 'Stenbråten:180:fra:b2', 'Granebakken:430:fra:b2'],
  'sitter på buss (10 m/s østover)': ['Maikollen:0:mot:b0', 'Olasrudveien:300:mot:b1', 'Mortensrud:600:mot:b1', 'Stenbråten:300:fra:b2', 'Granebakken:550:fra:b2'],
  'sitter på T-bane (18 m/s østover)': ['Olasrudveien:60:mot:b0', 'Mortensrud:360:mot:b1', 'Maikollen:240:fra:b2', 'Stenbråten:540:fra:b2', 'Granebakken:790:fra:b2'],
  'GPS hopper og mister nøyaktighet': ['Stenbråten:22:staar:b0', 'Granebakken:272:staar:b2', 'Maikollen:278:staar:b2', 'Olasrudveien:578:staar:b2', 'Mortensrud:877:staar:b2'],
};

/** Valget når appen alt har valgt Stenbråten (ikke festet): { navn, byttet }. */
const VALG = {
  'står stille ved et stopp': ['Stenbråten', false],
  'går mot Granebakken (1,4 m/s, 110 m unna)': ['Granebakken', true],
  'går bort fra Stenbråten, 82 m unna (innenfor båndet)': ['Stenbråten', false],
  'går bort fra Stenbråten, 180 m unna (utenfor båndet)': ['Maikollen', true],
  'sitter på buss (10 m/s østover)': ['Maikollen', true],
  'sitter på T-bane (18 m/s østover)': ['Olasrudveien', true],
  'GPS hopper og mister nøyaktighet': ['Stenbråten', false],
};
const ombordFor = f => ombord({ spor: f.spor, fartMS: f.fartMS, kandidater: [{ nøkkel: 'k', linje: '37', front: 'x', call: {}, forventet: f.spor.map(p => ({ at: p.at, lat: LAT, lon: p.lon })) }] }).kind;

describe('baseline: dagens rangering, valg og ombord — per forløp', () => {
  for (const n of Object.keys(FORVENTET)) {
    it(n, () => {
      const { f, r } = rang(n);
      expect(topp(n)).toEqual(FORVENTET[n]);
      const cur = r.find(s => s.name === 'Stenbråten');
      const pk = pickStop(r, cur, false, s => stopBand(s, depUses(), f.spor));
      expect([pk.stop.name, pk.changed]).toEqual(VALG[n]);
    });
  }
  it('ombord-gjenkjenningen (src/api/ombord.js) kjenner igjen buss og T-bane, og sier «vet ikke» for gange og stillstand', () => {
    expect(Object.fromEntries(Object.keys(FORLØP).map(n => [n, ombordFor(FORLØP[n])]))).toEqual({
      'står stille ved et stopp': 'vet-ikke', 'går mot Granebakken (1,4 m/s, 110 m unna)': 'vet-ikke',
      'går bort fra Stenbråten, 82 m unna (innenfor båndet)': 'vet-ikke', 'går bort fra Stenbråten, 180 m unna (utenfor båndet)': 'vet-ikke',
      'sitter på buss (10 m/s østover)': 'ombord', 'sitter på T-bane (18 m/s østover)': 'ombord', 'GPS hopper og mister nøyaktighet': 'vet-ikke',
    });
  });
  it('retningssignalet: gange mot Maikollen gir negativ rate (~ −1,4 m/s), stillstand ~0, buss ~ −10 m/s', () => {
    const mål = { lat: LAT, lon: lon(300) };
    expect(closingRate(FORLØP['går mot Granebakken (1,4 m/s, 110 m unna)'].spor, mål)).toBeCloseTo(-1.4, 1);
    expect(Math.abs(closingRate(FORLØP['står stille ved et stopp'].spor, mål))).toBeLessThan(0.4);
    expect(closingRate(FORLØP['sitter på buss (10 m/s østover)'].spor, mål)).toBeCloseTo(-10, 0);
  });
});

/* SVAKE PUNKTER I DAG — dokumentert, IKKE rettet (steg 1 endrer ikke oppførsel). Testene passerer i dag og beskriver
 * nåværende, uønsket oppførsel; et senere steg snur dem bevisst. Hvert punkt står i docs/posisjon-baseline.md. */
describe('BASELINE_SVAKHET: det dagens rangering ikke vet', () => {
  it('S1 — ombord ignoreres: i buss og T-bane rangeres kjøretøyets posisjon som om du sto der (stopp du passerer får «du er ved»-bånd 0 og valget byttes)', () => {
    expect(topp('sitter på buss (10 m/s østover)')[0]).toBe('Maikollen:0:mot:b0');
    expect(topp('sitter på T-bane (18 m/s østover)')[0]).toBe('Olasrudveien:60:mot:b0');
    expect(ombordFor(FORLØP['sitter på buss (10 m/s østover)'])).toBe('ombord');   // appen KAN vite det — rangeringen bruker det ikke
  });
  it('S2 — bånd 0 gir aldri etter: går du bort fra et stopp innenfor 100 m, står det fortsatt først og valget holdes; først ved 180 m tar stoppet foran over', () => {
    expect(topp('går bort fra Stenbråten, 82 m unna (innenfor båndet)')[0]).toBe('Stenbråten:82:fra:b0');
    expect(topp('går bort fra Stenbråten, 180 m unna (utenfor båndet)')[0]).toBe('Maikollen:120:mot:b1');
  });
  it('S3 — gangtid og reiseforslag er ikke med i rangeringen i det hele tatt: den bruker luftlinje (distM), retning og bruk', () => {
    const { l } = rang('står stille ved et stopp');
    expect(Object.keys(l[0]).sort()).toEqual(['distM', 'id', 'lat', 'lon', 'name']);   // ingen gangtid, ingen avgangsinfo i det rangeringen får
  });
});

describe('baseline: fiksturen selv', () => {
  it('seks-sju forløp, alle deterministiske, alle med samme stoppliste', () => {
    expect(Object.keys(FORLØP)).toHaveLength(7);
    expect(FORLØP['står stille ved et stopp'].spor[0].at).toBe(T0);
    expect(stoppFra(0).map(s => s.name)).toEqual(['Granebakken', 'Stenbråten', 'Maikollen', 'Olasrudveien', 'Mortensrud']);
  });
});
