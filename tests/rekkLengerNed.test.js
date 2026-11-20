// v1.218.176: rekk den lenger ned — skjermbildet fra Mortensrud 19:06.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rekkLengerNed, rekkTekst, REKK_EKSTRA_MIN } from '../src/rekkLengerNed.js';

const T = Date.parse('2026-11-20T19:06:00+01:00'), M = 60_000;
const iso = m => new Date(T + m * M).toISOString();
const kall = (id, navn, m, lat = 59.84, lon = 10.83) => ({
  quay: { latitude: lat, longitude: lon, stopPlace: { id: 'NSR:StopPlace:' + id, name: navn, latitude: lat, longitude: lon } },
  expectedDepartureTime: iso(m), aimedDepartureTime: iso(m) });
// 73: Mortensrud 19:14 → Kantarellen 19:19 → Furuset (bytte til 81)
const TUR = [kall('Mrud', 'Mortensrud', 8), kall('Kant', 'Kantarellen', 13, 59.85), kall('Fjern', 'Langt unna', 16, 59.90), kall('Fur', 'Furuset', 20)];
const FRA = { id: 'NSR:StopPlace:Mrud', navn: 'Mortensrud' }, SLUTT = { id: 'NSR:StopPlace:Fur', navn: 'Furuset' };
const gang = ll => (ll.lat === 59.85 ? 13 : ll.lat === 59.90 ? 40 : 12);

describe('rekkLengerNed', () => {
  it('før-bildet: 12 min til Mortensrud, går om 8 → rekker ikke; Kantarellen 13 min, går om 13 → rekk den der', () => {
    const r = rekkLengerNed(TUR, FRA, SLUTT, gang, 12, T);
    expect(r).toMatchObject({ stopp: { navn: 'Kantarellen' }, gangMin: 13, ms: T + 13 * M });
    expect(rekkTekst(r, ms => new Date(ms).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })))
      .toBe('rekk den på Kantarellen 19:19 · 13 min å gå');
  });
  it('rekker du heller ikke den: ingenting', () => {
    expect(rekkLengerNed(TUR, FRA, SLUTT, ll => (ll.lat === 59.85 ? 14 : 30), 12, T)).toBe(null);
  });
  it('aldri et stopp FØR ditt, selv om det kunne nås', () => {
    const tur = [kall('Før', 'Før', 20, 59.85), kall('Mrud', 'Mortensrud', 8), kall('Fur', 'Furuset', 20)];
    expect(rekkLengerNed(tur, FRA, SLUTT, gang, 12, T)).toBe(null);
  });
  it('aldri der du uansett skulle av', () => {
    expect(rekkLengerNed(TUR, FRA, { id: 'NSR:StopPlace:Kant', navn: 'Kantarellen' }, gang, 12, T)).toBe(null);
  });
  it('for langt å gå (mer enn egen gang + REKK_EKSTRA_MIN): ingenting', () => {
    expect(rekkLengerNed(TUR, FRA, SLUTT, ll => (ll.lat === 59.85 ? 12 + REKK_EKSTRA_MIN + 1 : 99), 12, T)).toBe(null);
  });
  it('vet ikke hvor på turen ditt stopp er: ingenting', () => {
    expect(rekkLengerNed(TUR, { id: 'x', navn: 'Ukjent' }, SLUTT, gang, 12, T)).toBe(null);
  });
});

describe('koblingen', () => {
  const src = readFileSync('src/views/board.js', 'utf8');
  it('avgjøres i rekkeFor, så stripa og raden er enige', () => {
    expect(src).toMatch(/export function rekkeFor\(c, walkActive\) \{[\s\S]{0,1200}radRekkLengerNed\(c, dir, nå\)[\s\S]{0,200}return \{ mtl: m, rcls: reachCls\(m\) \};/);
  });
  it('raden sier det, og avgangsdetaljene går dit', () => {
    expect(src).toMatch(/rekker ikke her — ' \+ esc\(rekkTekst\(rekk, clk\)\)/);
    expect(readFileSync('src/views/selected.js', 'utf8')).toMatch(/const påstigning = rekk \? \{ lat: rekk\.stopp\.lat/);
  });
});
