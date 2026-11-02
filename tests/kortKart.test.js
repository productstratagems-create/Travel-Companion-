/**
 * Kartet viser «Dit du ofte skal» — og lite annet.
 *
 * Rapportert med skjermbilde: kortet sa «Jernbanetorget · 3 mot Kolsås ·
 * framme 22:28», og kartet over viste deg, stoppet og sju andre stopp i
 * nabolaget. Ruta på kortet sto ikke der.
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

import { kortRuteStopp } from '../src/views/auto.js';

const T0 = Date.now() + 60_000;
const kall = (navn, m) => ({
  quay: { stopPlace: { id: 'NSR:StopPlace:' + navn, name: navn, latitude: 59.85 + m / 1000, longitude: 10.8 } },
  aimedArrivalTime: new Date(T0 + m * 60_000).toISOString(),
  expectedArrivalTime: new Date(T0 + m * 60_000).toISOString(),
  aimedDepartureTime: new Date(T0 + m * 60_000).toISOString(),
  expectedDepartureTime: new Date(T0 + m * 60_000).toISOString(),
});
const CALL = { serviceJourney: { estimatedCalls: [
  kall('Mortensrud', 0), kall('Skullerud', 2), kall('Bøler', 5),
  kall('Jernbanetorget', 25), kall('Stortinget', 27), kall('Kolsås', 55),
] } };

describe('ruta på kartet', () => {
  it('går fra stoppet til målet', () => {
    const s = kortRuteStopp(CALL, 'Mortensrud', { name: 'Jernbanetorget' });
    expect(s.map(x => x.name)).toEqual(['Skullerud', 'Bøler', 'Jernbanetorget']);
  });

  /* IKKE FORBI MÅLET. Linja går til Kolsås; reisen din slutter på
   * Jernbanetorget, og det er reisen kartet skal vise. */
  it('og stopper ved målet, ikke ved linjas endestasjon', () => {
    const s = kortRuteStopp(CALL, 'Mortensrud', { name: 'Jernbanetorget' });
    expect(s.map(x => x.name)).not.toContain('Kolsås');
  });

  it('og finner målet på id når navnet er skrevet annerledes', () => {
    // Et navn som IKKE matcher på stopKey. Første utgave brukte
    // «Jernbanetorget T», og stopKey fjerner « T» — så navnet traff og id-en
    // ble aldri prøvd. En mutant som ignorerte id-en overlevde.
    const s = kortRuteStopp(CALL, 'Mortensrud',
      { name: 'Et helt annet navn', id: 'NSR:StopPlace:Jernbanetorget' });
    expect(s[s.length - 1].name).toBe('Jernbanetorget');
  });

  it('og gir null når målet ikke er på linja', () => {
    expect(kortRuteStopp(CALL, 'Mortensrud', { name: 'Ski' })).toBeNull();
    expect(kortRuteStopp(null, 'Mortensrud', { name: 'Ski' })).toBeNull();
  });
});

describe('kartet', () => {
  const src = () => require('node:fs').readFileSync('src/views/auto.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('leser kortet som listen tegnet', () => {
    expect(src()).toMatch(/_kortRute = /);
    const i = src().indexOf('function _renderMap');
    expect(src().slice(i, i + 3000)).toMatch(/_kortRute/);
  });

  /* LITE ANNET. De andre stoppene i nabolaget tegnes ikke når kortet har en
   * rute; de ligger fortsatt i «Mortensrud 7 ▾». */
  it('og tegner ikke de andre stoppene når kortet har en rute', () => {
    const i = src().indexOf('function _renderMap');
    expect(src().slice(i, i + 3000))
      .toMatch(/const others = \(!_open && _stop && !kortLinje\) \? nearbyAlternatives/);
  });

  /* Et kort fra et stopp du har gått fra skal ikke bli stående på kartet.
   * Funnet av en mutant som overlevde første runde. */
  it('og kortet nullstilles hvert tikk, før lista regner det ut på nytt', () => {
    const i = src().indexOf('function _renderBody() {');
    expect(src().slice(i, i + 80)).toMatch(/function _renderBody\(\) \{\s*_kortRute = null;/);
  });

  /* Ruta starter i stoppet du står ved. `stopsAhead` gir stoppene ETTER
   * det; med ett stopp igjen ble det to prikker og ingen linje. */
  it('og ruta tegnes fra stoppet du står ved', () => {
    expect(src()).toMatch(/drawStopLine\(_aLayer, fra\.concat\(kortLinje\)/);
  });

  /* En åpen retning er det du nettopp trykket på. Den vinner. */
  it('og en åpen retning vinner over kortet', () => {
    const i = src().indexOf('function _renderMap');
    expect(src().slice(i, i + 3000)).toMatch(/const kortLinje = \(!_open && _stop && _kortRute\)/);
  });
});
