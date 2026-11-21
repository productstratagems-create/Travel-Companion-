// v1.218.198: velg sted på kartet — fast nål i midten (utprøvd: Uber, Bolt, Google, Apple).
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
import { readFileSync } from 'node:fs';
import { nålTekst } from '../src/ui/stedKart.js';

describe('teksten under nåla', () => {
  it('adressen, «finner adressen …» mens den hentes, «punkt i kartet» uten svar', () => {
    expect(nålTekst('Stenbråtveien 14', false)).toBe('Stenbråtveien 14');
    expect(nålTekst(undefined, true)).toBe('finner adressen …');
    expect(nålTekst(null, false)).toBe('punkt i kartet');
  });
});

describe('koblingen', () => {
  const k = readFileSync('src/ui/stedKart.js', 'utf8'), a = readFileSync('src/views/auto.js', 'utf8');
  it('bekreft velger kartets MIDTPUNKT — der nåla står — ikke et trykk', () => {
    expect(k).toMatch(/const c = kart\.getCenter\(\);\s*lukk\(\);\s*onVelg\(valgtNavn \|\| 'punkt i kartet', \{ lat: c\.lat, lon: c\.lng \}\);/);
    expect(k).toMatch(/kart\.on\('moveend', oppdater\);/);
  });
  it('«ikke riktig?» og «nei, velg sted» åpner kartet; lista står, foldet', () => {
    expect(a).toMatch(/else if \(v === 'velg'\) _åpneStedPanel\(\);/);
    expect(a).toMatch(/åpneStedKart\(\{ start,/);
    expect(a).toMatch(/function _åpneStedListe\(el\)/);
  });
});
