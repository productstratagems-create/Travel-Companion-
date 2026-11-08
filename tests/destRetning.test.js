import { describe, it, expect } from 'vitest';
import { groupDirections, destinations, dirRows, DEST_BLOCK, _timesHtml }
  from '../src/views/auto.js';

import { RETNING_RANG } from '../src/views/auto.js';
// Kortene under «Dit du ofte skal» i rekkefølge etter reiseretningen.
//
// Bestilt: «Rekkefølgen på kortene … bør være iht. sannsynlig reiseretning
// bruker er på.»
const MIN = 60000;
const NÅ = new Date(2026, 10, 5, 7, 30).getTime();
const iso = (ms) => new Date(ms).toISOString();
const stopp = (id, name, lat, lon, m) => ({ quay: { latitude: lat, longitude: lon, stopPlace: { id, name, latitude: lat, longitude: lon } },
  aimedArrivalTime: iso(NÅ + m * MIN), expectedArrivalTime: iso(NÅ + m * MIN), aimedDepartureTime: iso(NÅ + m * MIN), expectedDepartureTime: iso(NÅ + m * MIN) });
const call = (line, front, mins, via) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NÅ + mins * MIN), expectedDepartureTime: iso(NÅ + mins * MIN),
  destinationDisplay: { frontText: front }, quay: { id: 'NSR:Quay:' + line + front, publicCode: '1' },
  serviceJourney: { id: 'sj:' + line + front + mins, situations: [], line: { id: 'L' + line, publicCode: line, transportMode: 'bus' },
    estimatedCalls: [stopp('NSR:StopPlace:Mortensrud', 'Mortensrud', 59.8494, 10.8294, mins), ...via] },
});
// Jernbanetorget (nord) er mest brukt. Ski (sør) er brukt sjeldnere.
const CALLS = [call('3', 'Kolsås', 4, [stopp('NSR:StopPlace:JBT', 'Jernbanetorget', 59.9119, 10.7504, 29)]),
  call('530', 'Ski', 6, [stopp('NSR:StopPlace:Ski', 'Ski stasjon', 59.7194, 10.8352, 26)])];
const HIST = [{ name: 'Jernbanetorget', count: 6, stopId: 'NSR:StopPlace:JBT', lastUsed: NÅ },
  { name: 'Ski stasjon', count: 2, stopId: 'NSR:StopPlace:Ski', lastUsed: NÅ }];
const live = () => dirRows(groupDirections(CALLS, NÅ), false, () => true, null);
const spor = (dLat) => [0, 20, 40, 60].map(s => ({ lat: 59.8494 + dLat * s, lon: 10.8294, at: NÅ - (60 - s) * 1000, acc: 8 }));

describe('kortene etter reiseretning', () => {
  it('uten spor: mest brukt først, som før', () => {
    expect(destinations(live(), HIST, 0, NÅ, 'Mortensrud').map(d => d.name)).toEqual(['Jernbanetorget', 'Ski stasjon']);
  });
  it('på vei sørover: Ski først, selv om Jernbanetorget er mer brukt', () => {
    const d = destinations(live(), HIST, 0, NÅ, 'Mortensrud', spor(-0.0002));
    expect(d.map(x => x.name)).toEqual(['Ski stasjon', 'Jernbanetorget']);
    expect(d.map(x => x.retning)).toEqual(['mot', 'fra']);
  });
  it('på vei nordover: Jernbanetorget først', () => {
    expect(destinations(live(), HIST, 0, NÅ, 'Mortensrud', spor(0.0002)).map(d => d.name)).toEqual(['Jernbanetorget', 'Ski stasjon']);
  });
  it('står stille: bruken avgjør', () => {
    expect(destinations(live(), HIST, 0, NÅ, 'Mortensrud', spor(0)).map(d => d.name)).toEqual(['Jernbanetorget', 'Ski stasjon']);
  });
  it('mot før vet-ikke før fra', () => {
    expect(RETNING_RANG.mot).toBeLessThan(RETNING_RANG['vet-ikke']);
    expect(RETNING_RANG['vet-ikke']).toBeLessThan(RETNING_RANG.fra);
  });
});

describe('koblingen', () => {
  it('auto-reise sender sporet, det lange når det finnes', () => {
    const s = require('node:fs').readFileSync('src/views/auto.js', 'utf8');
    expect(s).toContain('(state.posTrailLang && state.posTrailLang.length >= 2) ? state.posTrailLang : state.posTrail,');
  });
});

describe('kortene etter hvor du mest sannsynlig skal nå', () => {
  // Ski er brukt mest totalt, men det er mandag morgen, og du er i utkanten.
  const H2 = [{ name: 'Jernbanetorget', count: 3, stopId: 'NSR:StopPlace:JBT', lastUsed: NÅ },
    { name: 'Ski stasjon', count: 6, stopId: 'NSR:StopPlace:Ski', lastUsed: NÅ }];
  const her = { name: 'Mortensrud', lat: 59.8494, lon: 10.8294 };
  it('uten modell: mest brukt først (som før)', () => {
    expect(destinations(live(), H2, 0, NÅ, 'Mortensrud').map(d => d.name)[0]).toBe('Ski stasjon');
  });
  it('hverdagsmorgen: sentrum først, med grunnen', () => {
    const d = destinations(live(), H2, 0, NÅ, 'Mortensrud', null, { her, hist: [] });   // NÅ er torsdag 07:30
    expect(d[0].name).toBe('Jernbanetorget');
    expect(d[0].grunn).toBe('hverdagsmorgen: mot sentrum');
  });
  it('og koblingen sender stoppet du er ved og historikken', () => {
    expect(require('node:fs').readFileSync('src/views/auto.js', 'utf8')).toContain('{ her: _stop, hist: loadSmartHist() });');
  });
});
