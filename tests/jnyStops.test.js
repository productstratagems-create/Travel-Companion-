/**
 * Stopplista overlever en oppfriskning.
 *
 * `saveJny` skriver elleve felter per etappe og utelater `stops`; `loadJny`
 * setter dem til `[]` med vilje. Etter en reload har underveis-skjermen
 * derfor INGEN stoppliste før `_fetchTrack` svarer — og i en tunnel svarer
 * den aldri.
 *
 * Det var til å leve med da lista bare var pynt. Med v1.154.0 er den
 * grunnlaget: `whereAmI` trenger stoppenes koordinater for å kunne la
 * posisjonen vinne over ruteplanen. Uten dem faller skjermen tilbake til
 * klokka nøyaktig i det tilfellet den ble bygget for — under bakken, uten
 * nett, når du lurer på om du skal gå av nå.
 *
 * OG DET FINNES TRE SKRIVERE av «et stopp på en etappe»:
 *   journey.js:50    joinJourney, bygget for hånd av meta.calls
 *   journey.js:136   doBoard, rå estimatedCalls
 *   track.js:2149    _fetchTrack, rå calls
 * Alle tre gir den samme quay-innpakkede formen. En lagret form må derfor
 * ikke bli en fjerde — den leses gjennom ett navn.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { saveJny, loadJny, clearJny } from '../src/journey.js';
import { state } from '../src/state.js';
import { callPlace } from '../src/api/place.js';

const NÅ = Date.now();
const kall = (id, name, lat, lon, m) => ({
  quay: { stopPlace: { id, name, latitude: lat, longitude: lon } },
  expectedArrivalTime: new Date(NÅ + m * 60000).toISOString(),
  aimedArrivalTime: new Date(NÅ + m * 60000).toISOString(),
  expectedDepartureTime: new Date(NÅ + m * 60000).toISOString(),
});

const STOPP = [
  kall('NSR:StopPlace:Mo', 'Mortensrud', 59.84, 10.82, 0),
  kall('NSR:StopPlace:Ry', 'Ryen', 59.86, 10.82, 6),
  kall('NSR:StopPlace:Ma', 'Manglerud', 59.87, 10.82, 9),
];

const reise = () => ({
  dest: 'Manglerud', from: 'Mortensrud', boardedAt: NÅ - 60000,
  lineCode: '3', lineBg: '#f5a000', frontText: 'Manglerud',
  arrival: { time: new Date(NÅ + 9 * 60000).toISOString(), clk: '08:09' },
  arrQuay: '1', _toLat: 59.87, _toLon: 10.82,
  legs: [{ lineCode: '3', lineRef: 'RUT:Line:3', lineBg: '#f5a000',
    mode: 'metro', frontText: 'Manglerud', journeyId: 'RUT:ServiceJourney:1',
    fromStation: 'Mortensrud', toStation: 'Manglerud',
    depTime: { time: new Date(NÅ).toISOString(), clk: '08:00' },
    arrTime: { time: new Date(NÅ + 9 * 60000).toISOString(), clk: '08:09' },
    quay: { publicCode: '1' }, stops: STOPP }],
});

describe('en reise over en oppfriskning', () => {
  beforeEach(() => { clearJny(); });

  // FØR-BILDET: lista forsvant, og med den grunnlaget for at posisjonen kan
  // svare i det hele tatt.
  it('tar vare på stoppene', () => {
    state.jny = reise();
    saveJny();
    const igjen = loadJny();
    expect(igjen.legs[0].stops.length).toBe(3);
  });

  it('og på koordinatene, som er det posisjonen måles mot', () => {
    state.jny = reise();
    saveJny();
    const s = loadJny().legs[0].stops.map(callPlace);
    expect(s.map(x => x.name)).toEqual(['Mortensrud', 'Ryen', 'Manglerud']);
    expect(s[1]).toMatchObject({ id: 'NSR:StopPlace:Ry', lat: 59.86, lon: 10.82 });
  });

  it('og på tidene, så lista kan tegnes uten nett', () => {
    state.jny = reise();
    saveJny();
    const s = loadJny().legs[0].stops.map(callPlace);
    expect(s[2].arr).toBeTruthy();
  });

  it('tåler en etappe uten stopp', () => {
    const r = reise();
    r.legs[0].stops = [];
    state.jny = r;
    saveJny();
    expect(loadJny().legs[0].stops).toEqual([]);
  });

  // En reise lagret før denne endringen har ingen stops. Den skal virke som
  // før — tom liste, fylt av første _fetchTrack.
  it('tåler en reise lagret før endringen', () => {
    state.jny = reise();
    saveJny();
    const raw = JSON.parse(localStorage.getItem(
      Object.keys(localStorage).find(k => k.endsWith('t.jny'))));
    raw.legs = raw.legs.map(l => { const { stops, ...rest } = l; void stops; return rest; });
    localStorage.setItem(
      Object.keys(localStorage).find(k => k.endsWith('t.jny')), JSON.stringify(raw));
    expect(loadJny().legs[0].stops).toEqual([]);
  });
});

/**
 * Og at de tre skriverne og den lagrede formen leses av ÉTT navn.
 */
describe('callPlace leser alle formene', () => {
  it('den quay-innpakkede, som alle tre skriverne lager', () => {
    expect(callPlace(STOPP[1])).toMatchObject({
      id: 'NSR:StopPlace:Ry', name: 'Ryen', lat: 59.86, lon: 10.82 });
  });

  it('og den lagrede, så den ikke blir en fjerde form', () => {
    const lagret = callPlace(STOPP[1]);
    expect(callPlace(lagret)).toEqual(lagret);
  });

  it('tåler tomt', () => {
    expect(callPlace(null)).toBe(null);
    expect(callPlace({})).toBe(null);
  });
});

/**
 * Og at ingen leser den rå formen alene.
 *
 * Dette er kildetester, og svakheten sies: `collectLegStopRows`,
 * `_legRouteStops` og `_points` er ikke eksportert, så ingen enhetstest kan
 * kalle dem. Nettleserprøven er det som faktisk ser dem — og den fant
 * nettopp dette: etter at stoppene ble lagret i `callPlace` sin form,
 * FORSVANT hele reisestripen ved oppfriskning uten nett, fordi seks lesere
 * bare kjente `s.quay.stopPlace`. Lista tegnet seg, stripen ikke.
 *
 * Det disse binder er at den sjuende ikke kommer.
 */
describe('underveis leser stoppene gjennom ett navn', () => {
  const read = (f) => require('node:fs').readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('views/track.js går ikke utenom', () => {
    expect(read('src/views/track.js')).not.toMatch(/\.quay\s*&&\s*\w+\.quay\.stopPlace/);
  });

  it('views/journeyStrip.js går ikke utenom', () => {
    expect(read('src/views/journeyStrip.js')).not.toMatch(/\.quay\s*&&\s*\w+\.quay\.stopPlace/);
  });

  it('og begge bruker callPlace', () => {
    expect(read('src/views/track.js')).toMatch(/callPlace\(/);
    expect(read('src/views/journeyStrip.js')).toMatch(/callPlace\(/);
  });
});
