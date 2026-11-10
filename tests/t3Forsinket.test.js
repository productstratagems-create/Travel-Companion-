// «Auto-reise feilet på linje 3 fra Mortensrud. Mellom Bøler og Ulsrud trodde appen bruker plutselig
// var på bussen og valgte Olav Nygaards vei bussholdeplass istedet for Ulsrud.»
// Feilsøkingsloggen (2026-11-10 08:50–08:55): «sanntidsposisjoner: 0 for RUT:Line:3», og «nærmeste:»
// Bøler → Olav Nygards veg (bus) → Ulsrud → Oppsal → Skøyenkroken (bus) … — T-banen ble ALDRI kjent
// igjen, så appen falt til nærmeste stopp. Kravet var at hver fiks lå innenfor 150 m av turens
// posisjon ETTER RUTETIDEN på sekundet; i ~8 m/s er en T-bane 20 s for sent eller tidlig ute av det.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ombord, snittAvvik, OMBORD_TIDSSLINGRE_MS } from '../src/api/ombord.js';
import { kandidatAv } from '../src/api/kandidat.js';
import { _interpolateOnPath } from '../src/api/forventetPos.js';

const F = JSON.parse(readFileSync('tests/fixtures/t3-trase.json', 'utf8'));
const T0 = new Date('2026-11-10T08:40:00+01:00').getTime();
const STEG = 120_000;                       // to minutter mellom stasjonene
const kall = F.stopp.map((s, i) => ({
  aimedDepartureTime: new Date(T0 + i * STEG).toISOString(), expectedDepartureTime: new Date(T0 + i * STEG).toISOString(),
  aimedArrivalTime: new Date(T0 + i * STEG).toISOString(), expectedArrivalTime: new Date(T0 + i * STEG).toISOString(),
  quay: { latitude: s.lat, longitude: s.lon, stopPlace: { id: 'S' + i, name: s.navn, latitude: s.lat, longitude: s.lon } } }));
const call = { serviceJourney: { id: 'T3', line: { publicCode: '3' }, estimatedCalls: kall } };

// Du sitter på T-banen 40 s etter rutetiden, mellom Bøler (3) og Ulsrud (4): sporet er der
// TOGET ifølge rutetiden var 40 s tidligere.
const FORSINKET = 40_000;
const posAt = t => _interpolateOnPath(kall, t, F.form);
const tider = [0, 10, 20, 30].map(s => T0 + 3 * STEG + 30_000 + s * 1000);
const spor = tider.map(t => { const p = posAt(t - FORSINKET); return { lat: p.lat, lon: p.lon, acc: 8, at: t }; });

describe('T-bane 3, 40 s forsinket mellom Bøler og Ulsrud', () => {
  const k = kandidatAv(call, spor, F.form);
  it('kjennes igjen: du er om bord på linje 3', () => {
    const d = ombord({ spor, fartMS: 9, kandidater: [k] });
    expect(d.kind).toBe('ombord');
    expect(d.kandidater[0].linje).toBe('3');
  });
  it('men et tog som er 5 minutter unna, følger deg ikke', () => {
    const fjern = tider.map(t => { const p = posAt(t - 300_000); return { lat: p.lat, lon: p.lon, acc: 8, at: t }; });
    expect(ombord({ spor: fjern, fartMS: 9, kandidater: [kandidatAv(call, fjern, F.form)] }).kind).toBe('vet-ikke');
  });
  it('snittAvvik måler med samme slingringsmonn, så «følger tettest» er enig med «følger»', () => {
    expect(snittAvvik(k, spor)).toBeLessThan(50);
  });
});

describe('turopptaket tar også opp når appen ikke kjenner igjen noen tur', () => {
  it('i fart uten tur, og med grunnen til «vet ikke»', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toContain("dom.kind === 'ombord-tvil' || iFart(fartNå(nå))) {");
    expect(a).toContain('domGrunn: dom.grunn,');
    expect(readFileSync('src/api/turopptak.js', 'utf8')).toContain('    g: b.domGrunn || null,');
  });
});

describe('målt i turopptaket 2026-11-10: toget 80–165 s foran sanntiden', () => {
  // Opptaket fra Mortensrud → Bøler: signalfeil, sanntiden hang etter, og toget
  // gikk opptil 165 s FORAN expectedArrivalTime. Ved ±90 s ble det «vet-ikke».
  it('165 s foran: fortsatt om bord', () => {
    const foran = tider.map(t => { const p = posAt(t + 165_000); return { lat: p.lat, lon: p.lon, acc: 8, at: t }; });
    expect(ombord({ spor: foran, fartMS: 9, kandidater: [kandidatAv(call, foran, F.form)] }).kind).toBe('ombord');
  });
  it('slingringsmonnet er målt: ±180 s (165 s + margin)', () => {
    expect(OMBORD_TIDSSLINGRE_MS).toBe(180_000);
  });
});
