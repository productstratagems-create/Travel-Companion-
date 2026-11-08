// Gange til et annet stopp: avgangsdetaljene og auto-reise.
// Bestilt: «Sjekk avgangsdetaljene og auto-reise for samme feil.»
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { adaptTripPattern, påstigningTs, gåTilTekst } from '../src/api/adapt.js';
const { raskereHtml } = await import('../src/views/auto.js');

const OLASRUD = {
  duration: 2520,
  legs: [
    { mode: 'foot', expectedStartTime: '2026-11-08T22:42:07+01:00', expectedEndTime: '2026-11-08T22:48:00+01:00',
      fromPlace: { name: 'Olasrudveien' }, toPlace: { name: 'Mortensrud' } },
    { mode: 'bus', expectedStartTime: '2026-11-08T22:49:00+01:00', expectedEndTime: '2026-11-08T23:24:00+01:00',
      fromPlace: { name: 'Mortensrud' }, toPlace: { name: 'Jernbanetorget' },
      fromEstimatedCall: { expectedDepartureTime: '2026-11-08T22:49:00+01:00', aimedDepartureTime: '2026-11-08T22:49:00+01:00', quay: { publicCode: 'E' } },
      serviceJourney: { id: 'x', line: { id: 'RUT:Line:74', publicCode: '74' } } },
  ],
};

describe('én definisjon i adapt.js', () => {
  it('påstigningTs og gåTilTekst', () => {
    const c = adaptTripPattern(OLASRUD);
    expect(påstigningTs(c)).toBe(new Date('2026-11-08T22:42:07+01:00').getTime());
    expect(gåTilTekst(c)).toBe('gå 6 min til Mortensrud');
    expect(gåTilTekst(adaptTripPattern({ ...OLASRUD, legs: [OLASRUD.legs[1]] }))).toBe(null);
  });
  it('Tavla bruker den, ikke en egen kopi', () => {
    const b = readFileSync('src/views/board.js', 'utf8');
    expect(b).not.toMatch(/export function påstigningTs\(c\) \{/);
    expect(b).toContain("'<div class=\"dep-gaa\">' + esc(gåTilTekst(c)) + '</div>'");
  });
});

describe('avgangsdetaljene', () => {
  const s = readFileSync('src/views/selected.js', 'utf8');
  it('nedtellingen regnes fra når du må gå fra stoppet ditt — begge steder', () => {
    expect((s.match(/const leaveByTs\s*=\s*påstigningTs\(c\) - wk\.mins \* 60000;/g) || []).length).toBe(2);
    expect((s.match(/const mtl\s*=\s*mToLeave\(påstigningTs\(c\)\);/g) || []).length).toBe(2);
  });
  it('«avgår» sier stoppet du faktisk går på, og gangen står over', () => {
    expect(s).toContain("visStopp(cleanName(c._gåTil ? c._gåTil.navn : dir.from))");
    expect(s).toContain("(gåTilTekst(c) ? '<div class=\"jd-gaa\">' + esc(gåTilTekst(c)) + '</div>' : '')");
  });
});

describe('auto-reise: «raskere hvis du går av her»', () => {
  it('sier gangen når svaret starter med gange til et annet stopp', () => {
    const tp = { legs: [
      { mode: 'foot', expectedStartTime: '2026-11-08T08:18:00+01:00', expectedEndTime: '2026-11-08T08:24:00+01:00', fromPlace: { name: 'Tveita' }, toPlace: { name: 'Tveita senter' } },
      { mode: 'bus', expectedStartTime: '2026-11-08T08:26:00+01:00', fromPlace: { name: 'Tveita senter' }, line: { publicCode: '69' } }] };
    const h = raskereHtml({ navn: 'Tveita', mål: 'Lutvann', r: { tp, framMs: new Date('2026-11-08T08:40:00+01:00').getTime(), sparerMin: 5 } });
    expect(h).toContain('gå 6 min til Tveita senter');
  });
  it('uten gange: som før', () => {
    const tp = { legs: [{ mode: 'bus', expectedStartTime: '2026-11-08T08:26:00+01:00', fromPlace: { name: 'Tveita' }, line: { publicCode: '69' } }] };
    expect(raskereHtml({ navn: 'Tveita', mål: 'Lutvann', r: { tp, framMs: 0, sparerMin: 5 } })).not.toContain('min til');
  });
});

describe('avgangsdetaljene: gangen videre synes uten å folde ut', () => {
  it('rett under retningslinja, begge steder den tegnes (sett i proben)', () => {
    const s = readFileSync('src/views/selected.js', 'utf8');
    expect(s).toContain("(heroVises ? '' : _retningHtml(dir) + gåVidere)");
    expect(s).toContain('          + _retningHtml(dir) + gåVidere\n');
  });
});
