// v1.218.139: avgangstidene på retningskortene som en trommel.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupDirections, _timesHtml, trommelNøkkel, TROMMEL_MAKS } from '../src/views/auto.js';

const T = Date.now() + 60_000;
const kall = (m) => ({ expectedDepartureTime: new Date(T + m * 60_000).toISOString(), aimedDepartureTime: new Date(T + m * 60_000).toISOString(),
  realtime: true, destinationDisplay: { frontText: 'Jernbanetorget' }, quay: { id: 'Q', publicCode: 'D' },
  serviceJourney: { id: 'sj' + m, line: { id: 'RUT:Line:71', publicCode: '71', transportMode: 'bus' }, estimatedCalls: [] } });

describe('trommelen', () => {
  const dirs = groupDirections([5, 13, 20, 28, 35, 43, 50].map(kall), Date.now());
  it('raden beholder alle tidene, ikke bare tre', () => {
    expect(dirs[0].times.length).toBe(3);
    expect(dirs[0].alleTider.length).toBe(7);
    expect(TROMMEL_MAKS).toBeGreaterThan(3);
  });
  it('trommelen viser dem alle; uten trommel tre som før', () => {
    const n = h => (h.match(/auto-t-(next|dim)/g) || []).length;
    expect(n(_timesHtml(dirs[0], Date.now(), null, { trommel: true }))).toBe(7);
    expect(n(_timesHtml(dirs[0], Date.now(), null))).toBe(3);
  });
  it('nøkkelen er linje og retning', () => {
    expect(trommelNøkkel({ lines: [{ code: '71' }], frontText: 'Jernbanetorget' })).toBe('71>Jernbanetorget');
  });
  it('rulleposisjonen settes tilbake etter hver tegning, og en sveip åpner ikke raden', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/if \(_trommelPos\.has\(k\)\) t\.scrollLeft = _trommelPos\.get\(k\);/);
    expect(s).toMatch(/if \(Date\.now\(\) - _trommelSveip < TROMMEL_SVEIP_MS\) return;/);
  });
});
