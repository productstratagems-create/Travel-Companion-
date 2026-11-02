/**
 * Bli sittende — og et bytte som venter på deg.
 *
 * Journey Planner v3 har `interchangeTo { staySeated guaranteed }` på
 * etappen. Appen spurte ikke om det. Der en linje skifter nummer mens du
 * blir sittende (et gjennomgående tog, en buss som fortsetter som en annen
 * linje), sa appen «bytt» — og underveis sa «gå av nå» ved stoppet. Og et
 * GARANTERT bytte med negativ margin fikk «rekker ikke», om et tog som er
 * lovet å vente.
 *
 * Feltnavnene kan ikke prøves herfra. De spørres om som eget trinn i
 * `fetchTrip`-stigen; et nei gir dagens oppførsel.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { adaptTripPattern, legEnds } from '../src/api/adapt.js';
import { legsFromTrip, saveJny, loadJny, clearJny } from '../src/journey.js';
import { state } from '../src/state.js';
import { bytteTekst } from '../src/bytte.js';
import { alightEyebrow } from '../src/api/alight.js';
import { transferState, connAlertHtml } from '../src/views/track.js';
import { tripGQL } from '../src/api/queries.js';
import { findArr } from '../src/geo.js';

const T0 = Date.UTC(2026, 10, 2, 7, 0, 0);
const iso = m => new Date(T0 + m * 60000).toISOString();
const sted = (name, id) => ({ name, latitude: 59.9, longitude: 10.7,
  quay: id ? { id: 'NSR:Quay:' + id, stopPlace: { id: 'NSR:StopPlace:' + id } } : undefined });

const etappe = (linje, front, fra, til, m0, m1, interchangeTo, ider) => ({
  mode: 'rail',
  fromPlace: sted(fra, ider && ider[0]), toPlace: sted(til, ider && ider[1]),
  aimedStartTime: iso(m0), expectedStartTime: iso(m0), aimedEndTime: iso(m1), expectedEndTime: iso(m1),
  serviceJourney: { id: 'SJ' + linje, line: { id: 'L' + linje, publicCode: linje }, estimatedCalls: [] },
  fromEstimatedCall: { expectedDepartureTime: iso(m0), aimedDepartureTime: iso(m0),
    quay: { publicCode: '1' }, destinationDisplay: { frontText: front } },
  toEstimatedCall: { expectedArrivalTime: iso(m1), aimedArrivalTime: iso(m1), quay: { publicCode: '1' } },
  ...(interchangeTo ? { interchangeTo } : {}),
});

/* Et gjennomgående tog: R13 til Oslo S, fortsetter som L2 mot Ski. */
const SITT = { duration: 40 * 60, legs: [
  etappe('R13', 'Oslo S', 'Lillestrøm', 'Oslo S', 0, 12,
    { staySeated: true, guaranteed: true }, ['Lillestrøm', 'OsloS']),
  etappe('L2', 'Ski', 'Oslo S', 'Ski', 13, 40, null, ['OsloS', 'Ski']),
] };
/* Et garantert bytte der du MÅ bytte, med bare ett minutt imellom. */
const GARANTI = { duration: 40 * 60, legs: [
  etappe('R13', 'Oslo S', 'Lillestrøm', 'Oslo S', 0, 12, { staySeated: false, guaranteed: true }),
  etappe('L2', 'Ski', 'Oslo S', 'Ski', 13, 40),
] };
const DIR = { from: 'Lillestrøm', to: 'Ski' };

describe('adapteren', () => {
  it('ser at du blir sittende', () => {
    const t = adaptTripPattern(SITT)._transfers[0];
    expect(t.blisittende).toBe(true);
    expect(t.garantert).toBe(true);
  });
  it('og et vanlig bytte er ikke det', () => {
    expect(adaptTripPattern(GARANTI)._transfers[0].blisittende).toBe(false);
  });
  it('og uten feltet er alt som før', () => {
    const uten = { ...SITT, legs: SITT.legs.map(({ interchangeTo, ...l }) => l) };
    const t = adaptTripPattern(uten)._transfers[0];
    expect(t.blisittende).toBe(false);
    expect(t.garantert).toBe(false);
  });
  it('og legEnds bærer stoppestedets id når den finnes', () => {
    expect(legEnds(SITT.legs[0])).toMatchObject({ tilId: 'NSR:StopPlace:OsloS' });
    expect(legEnds(GARANTI.legs[0]).tilId).toBeNull();
  });
});

describe('reisen', () => {
  const legs = () => legsFromTrip(adaptTripPattern(SITT), DIR);
  it('bærer «bli sittende» og id-ene', () => {
    expect(legs()[0]).toMatchObject({ blisittende: true, garantert: true,
      toStopId: 'NSR:StopPlace:OsloS', fromStopId: 'NSR:StopPlace:Lillestrøm' });
  });
  it('og det overlever en oppfriskning', () => {
    clearJny();
    state.jny = { dest: 'Ski', from: 'Lillestrøm', boardedAt: Date.now(),
      lineCode: 'R13', lineBg: '#e00', frontText: 'Oslo S', legs: legs() };
    saveJny();
    expect(loadJny().legs[0]).toMatchObject({ blisittende: true, garantert: true,
      toStopId: 'NSR:StopPlace:OsloS' });
  });
});

describe('underveis', () => {
  const legs = () => legsFromTrip(adaptTripPattern(SITT), DIR);

  it('sier «bli sittende», ikke «bytt»', () => {
    const l = legs();
    expect(bytteTekst(l[0], l[1])).toBe('bli sittende — fortsetter som L2 mot Ski');
  });

  /* FØR-BILDET SOM BETYR MEST: «Gå av nå» ved Oslo S, til en som skal bli
   * sittende til Ski. */
  it('og sier aldri «gå av» ved linjeskiftet', () => {
    const e = alightEyebrow({ stopsLeft: 0, arriving: true, transfer: true, blisittende: true });
    expect(e.kind).toBe('sitt');
    expect(e.label).toBe('Bli sittende');
    expect(alightEyebrow({ stopsLeft: 1, transfer: true, blisittende: true }).label)
      .toBe('Bli sittende');
  });

  it('og et bytte du ikke kan miste får ingen advarsel', () => {
    const l = legs();
    expect(transferState(l[0], l[1], 2)).toBeNull();
    expect(connAlertHtml(l, 0, 2)).toBe('');
  });

  /* GARANTERT: ett minutt imellom, tre minutter plattformgulv, to minutter
   * ekstra — dagens regel sier «rekker ikke». Toget er lovet å vente. */
  it('og et garantert bytte sier at toget venter, ikke at du ikke rekker det', () => {
    const l = legsFromTrip(adaptTripPattern(GARANTI), DIR);
    expect(transferState(l[0], l[1], 2).kind).toBe('garantert');
    const h = connAlertHtml(l, 0, 2);
    expect(h).toMatch(/venter på deg/);
    expect(h).not.toMatch(/conn-alert-miss/);
  });

  /* Garantien er bare et svar når marginen ellers ville vært et problem.
   * Et komfortabelt bytte trenger ingen banner — «venter på deg» om et
   * bytte med ti minutter til gode er støy. Funnet av en mutant som
   * overlevde første runde. */
  it('men et garantert bytte med god tid gir ingen banner', () => {
    const god = { ...GARANTI, legs: [GARANTI.legs[0],
      { ...GARANTI.legs[1], fromEstimatedCall: { ...GARANTI.legs[1].fromEstimatedCall,
        expectedDepartureTime: iso(30), aimedDepartureTime: iso(30) } }] };
    const l = legsFromTrip(adaptTripPattern(god), DIR);
    expect(transferState(l[0], l[1], 2).kind).toBeNull();
    expect(connAlertHtml(l, 0, 2)).toBe('');
  });

  it('og uten garanti er en for kort margin fortsatt «rekker ikke»', () => {
    const uten = { ...GARANTI, legs: GARANTI.legs.map(({ interchangeTo, ...l }) => l) };
    const l = legsFromTrip(adaptTripPattern(uten), DIR);
    expect(transferState(l[0], l[1], 2).kind).toBe('miss');
  });

  it('og nedtellingen sier «til linjeskifte», ikke «gå av nå»', () => {
    const src = require('node:fs').readFileSync('src/views/track.js', 'utf8');
    expect(src).toMatch(/leg\.blisittende \? 'til linjeskifte'/);
  });

  it('og mellom etappene sier den ikke «avgang fra … spor»', () => {
    const src = require('node:fs').readFileSync('src/views/track.js', 'utf8');
    expect(src).toMatch(/forrige && forrige\.blisittende\s*\?\s*bytteTekst\(forrige, nextLeg, displayStn\)/);
  });

  /* Sett i nettleserprøven, ikke i noen test: stopplista sa «BYTT» og
   * kortet under het «BYTTETOG», rett under «Bli sittende». */
  it('og verken stopplista eller kortene sier «bytt»', () => {
    const src = require('node:fs').readFileSync('src/views/track.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).toMatch(/r\.sitt \? '<span class="stop-tag">linjeskifte<\/span>'/);
    expect(src).toMatch(/sitt: !isLastLeg && isEnd && !!leg\.blisittende/);
    expect(src).toMatch(/if \(sittende\) return 'fortsetter som';/);
    const kall = [...src.matchAll(/cardLabel\(legs\[j\]\.mode, [^;]*;/g)].map(m => m[0]);
    expect(kall.length).toBe(2);
    kall.forEach(k => expect(k).toMatch(/legs\[j - 1\]\.blisittende/));
  });

  it('og alle tre avstigningskortene sender «bli sittende» med', () => {
    const src = require('node:fs').readFileSync('src/views/track.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const kall = [...src.matchAll(/alightEyebrow\(\{([\s\S]*?)\}\)/g)].map(m => m[1]);
    expect(kall.length).toBe(3);
    kall.forEach(k => expect(k, k).toMatch(/blisittende:/));
  });
});

describe('spørringen', () => {
  it('ber om byttet når den får lov', () => {
    const q = tripGQL('A', 'B', null, 12, 1.3, undefined, false, false, false, false, false, false, true, false);
    expect(q).toContain('interchangeTo{staySeated guaranteed}');
  });
  it('og om stoppestedets id når den får lov', () => {
    const q = tripGQL('A', 'B', null, 12, 1.3, undefined, false, false, false, false, false, false, false, true);
    expect(q).toMatch(/fromPlace\{name latitude longitude quay\{id stopPlace\{id\}\}\}/);
    expect(q).toMatch(/toPlace\{name latitude longitude quay\{id stopPlace\{id\}\}\}/);
  });
  it('og ingen av delene uten', () => {
    const q = tripGQL('A', 'B', null, 12, 1.3);
    expect(q).not.toContain('interchangeTo');
    expect(q).not.toMatch(/fromPlace\{[^}]*quay/);
  });
});

/* ── ID FØR NAVN ────────────────────────────────────────────────────────
 *
 * To stoppesteder kan hete det samme, og ett stoppested kan hete litt
 * forskjellig i to svar. Id-en er det ene som ikke kan forveksles. */
describe('findArr med id', () => {
  const kall = (navn, id, m) => ({ quay: { stopPlace: { id: 'NSR:StopPlace:' + id, name: navn } },
    aimedArrivalTime: iso(m) });
  const k = [kall('Lillestrøm', 'Lillestrøm', 0), kall('Oslo sentralstasjon', 'OsloS', 12)];

  it('finner stoppet på id selv når navnet er skrevet annerledes', () => {
    expect(findArr(k, 'Oslo S', { id: 'NSR:StopPlace:OsloS' })).toBe(k[1]);
  });
  it('og faller til navnet når id-en ikke finnes blant kallene', () => {
    expect(findArr(k, 'Lillestrøm', { id: 'NSR:StopPlace:Annet' })).toBe(k[0]);
  });
  it('og «etter» virker på id også', () => {
    const sløyfe = [kall('A', 'A', 0), kall('B', 'B', 3), kall('A', 'A', 6)];
    expect(findArr(sløyfe, 'A', { id: 'NSR:StopPlace:A', etterId: 'NSR:StopPlace:B' })).toBe(sløyfe[2]);
  });
});
