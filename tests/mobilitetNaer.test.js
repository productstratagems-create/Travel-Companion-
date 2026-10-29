/**
 * Appen hentet hele Norge for å vise gata di.
 *
 * `fetchScooters` spurte `discoverSystems`, og hentet så `free_bike_status`
 * for HVERT system den fant — hele landsdekkende feeder, med tusenvis av
 * kjøretøy per operatør — og filtrerte dem så til én kilometer i `_rank`.
 *
 * Enturs Mobility-API har også et GraphQL-grensesnitt, og det tar posisjonen
 * som argument. Da spør appen om det den faktisk trenger.
 *
 * MEN SKJEMAET KAN IKKE LESES HERFRA. `api.entur.io` svarer 403 gjennom
 * denne sandkassens proxy, og feltnavnene er GBFS' egen modell skrevet i
 * camelCase — en kvalifisert gjetning, ikke et oppslag.
 *
 * DERFOR ER GBFS-STIEN IKKE EN SIKKERHETSMARGIN, MEN DEN FORVENTEDE STIEN,
 * på samme måte som i v1.177.0. Det som bindes her er at den mislykkes
 * riktig: `null` betyr «spør feedene i stedet», og alt går som før.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { nærGQL, parseNær, NÆR_M, _resetNær } from '../src/api/mobility.js';

beforeEach(() => _resetNær());

const kjt = (o) => ({
  id: 'v1', lat: 59.9139, lon: 10.7522,
  currentRangeMeters: 24000, currentFuelPercent: 0.8,
  isReserved: false, isDisabled: false,
  system: { operator: { name: { translation: [{ value: 'Voi' }] } } },
  vehicleType: { formFactor: 'SCOOTER' },
  ...o,
});
const svar = (liste) => ({ data: { vehicles: liste } });

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten kjøretøy i svaret ville hver påstand under
  // vært grønn uten å ha prøvd noe.
  it('har kjøretøy å oversette', () => {
    expect(parseNær(svar([kjt()]))).toHaveLength(1);
  });
});

describe('spørringen ber om ett sted, ikke om hele landet', () => {
  it('bærer posisjonen og rekkevidden', () => {
    const q = nærGQL(59.9139, 10.7522);
    expect(q).toContain('lat:59.9139');
    expect(q).toContain('lon:10.7522');
    expect(q).toContain('range:' + NÆR_M);
  });

  /* ÉN RADIUS, IKKE TO. `_rank` filtrerer på 1000 m. Sto tallet to steder
   * ville spørringen og filteret drevet fra hverandre, og appen hentet enten
   * for lite (hull i kartet) eller for mye (hele poenget borte). */
  it('og radiusen er den samme som filteret bruker', () => {
    // Bundet på NAVNET og ikke på tallet. `_rank` hadde `<= 1000` skrevet
    // ut; da ville spørringen og filteret kunnet drive fra hverandre uten
    // at noe falt. Det er feilformen dette repoet har rettet rundt tjuefem
    // ganger, og her ble den funnet av at testen var vanskelig å skrive.
    const rank = require('node:fs').readFileSync('src/api/scooters.js', 'utf8');
    expect(rank).toMatch(/<= NÆR_M\)/);
    expect(rank).not.toMatch(/<= 1000\)/);
  });

  it('ber om feltene ladning og rekkevidde leses av', () => {
    const q = nærGQL(59.9, 10.7);
    ['currentRangeMeters', 'currentFuelPercent', 'isReserved', 'isDisabled'].forEach(f =>
      expect(q, f).toContain(f));
  });
});

describe('oversettelsen', () => {
  /* Den bor i mobility.js og ikke i scooters.js: `_rank`, `vehicleCharge` og
   * kartlaget leser alle GBFS-navnene, og to kilder som snakker to språk inn
   * i de samme funksjonene ville vært to tabeller for ett faktum. */
  it('gir GBFS-navnene resten av appen alt leser', () => {
    const v = parseNær(svar([kjt()]))[0];
    expect(v.current_range_meters).toBe(24000);
    expect(v.current_fuel_percent).toBe(0.8);
    expect(v.is_reserved).toBe(false);
    expect(v.lat).toBe(59.9139);
  });

  it('henter operatørnavnet ut av oversettelseslista', () => {
    expect(parseNær(svar([kjt()]))[0]._op).toBe('Voi');
  });

  // Et navn som mangler skal ikke bli «undefined» på skjermen.
  it('og har et ord når navnet mangler', () => {
    expect(parseNær(svar([kjt({ system: null })]))[0]._op).toBeTruthy();
    expect(parseNær(svar([kjt({ system: null })]))[0]._op).not.toMatch(/undefined/);
  });

  /* Dokkede systemer er bysykkel og hører til `bysykkel.js`. Tegnes de her
   * også, står hver dokk to ganger på kartet. */
  it('slipper ikke dokkede kjøretøy inn i sparkesykkel-laget', () => {
    const blandet = svar([kjt(), kjt({ id: 'd1', vehicleType: { formFactor: 'STATION' } })]);
    expect(parseNær(blandet)).toHaveLength(1);
  });

  it('hopper over et kjøretøy uten posisjon', () => {
    expect(parseNær(svar([kjt({ lat: null })]))).toHaveLength(0);
  });
});

describe('når skjemaet ikke er som gjettet', () => {
  /* PÅSTANDEN SOM GJØR DET TRYGT Å GJETTE.
   *
   * `null` og ikke `[]`. En tom liste betyr «ingen sparkesykler her», og den
   * ville slått av fallbacken og latt kartet stå tomt. «Ikke noe svar» er en
   * annen setning, og den må kunne sies. */
  it('sier «ikke noe svar», ikke «ingen kjøretøy»', () => {
    expect(parseNær(null)).toBeNull();
    expect(parseNær({})).toBeNull();
    expect(parseNær({ errors: [{ message: 'unknown field' }], data: null })).toBeNull();
    expect(parseNær({ data: { vehicles: 'ikke en liste' } })).toBeNull();
  });

  it('men et ekte tomt svar er et svar', () => {
    expect(parseNær(svar([]))).toEqual([]);
  });

  it('tåler søppel inni lista', () => {
    expect(() => parseNær(svar([null, undefined, {}, kjt()]))).not.toThrow();
    expect(parseNær(svar([null, {}, kjt()]))).toHaveLength(1);
  });
});

/* ── KALLESTEDET ────────────────────────────────────────────────────────
 *
 * Fjerde utgivelse på rad der dette er feilformen: oversettelsen kan være
 * aldri så riktig, men spør ikke `scooters.js` geospørringen først, henter
 * den fortsatt hele landet og hver eneste påstand over er grønn.
 */
describe('og scooters.js spør geospørringen først', () => {
  const src = require('node:fs').readFileSync('src/api/scooters.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('prøver hentNær før den faller til feedene', () => {
    expect(src).toMatch(/return hentNær\(lat, lon\)\.then/);
    expect(src.indexOf('hentNær')).toBeLessThan(src.indexOf('discoverSystems()'));
  });

  it('og feed-stien står urørt som fallback', () => {
    expect(src).toMatch(/_viaFeeder/);
    expect(src).toMatch(/free_bike_status/);
  });
});
