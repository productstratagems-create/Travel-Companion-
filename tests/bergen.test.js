// Gjennomgang av Bergen (v1.218.41): sentrum var bare Oslo, og Bybanen het «Trikk».
import { describe, it, expect } from 'vitest';
import { centreward, sentrumFor, CENTRE } from '../src/api/centre.js';
import { modusOrd, linjemerke } from '../src/ui/linjemerke.js';
import { laneStops } from '../src/views/auto.js';
import { slåSammen, målNå, stedType } from '../src/profil.js';

const at = (lat, lon) => ({ lat, lon });
// Bybanen fra Lagunen mot Byparken: Nesttun, Paradis, Wergeland, Danmarks plass, Florida, Byparken.
const NESTTUN = at(60.3196, 5.3534);
const MOT_BYEN = [at(60.3448, 5.3482), at(60.3684, 5.3418), at(60.3800, 5.3383), at(60.3864, 5.3297), at(60.3913, 5.3221)];

describe('sentrum i Bergen', () => {
  it('før-bildet: med bare Oslo ga dette null; nå «mot»', () => {
    expect(centreward(NESTTUN, MOT_BYEN)).toBe('mot');
    expect(centreward(NESTTUN, [...MOT_BYEN].reverse().map(p => at(2 * NESTTUN.lat - p.lat, p.lon)))).toBe('fra');
  });
  it('riktig by, og ingen utenfor', () => {
    expect(sentrumFor(NESTTUN).by).toBe('Bergen');
    expect(sentrumFor(at(63.42, 10.40)).by).toBe('Trondheim');
    expect(sentrumFor(at(58.96, 5.73)).by).toBe('Stavanger');
    expect(sentrumFor(at(59.92, 10.76)).by).toBe('Oslo');
    expect(sentrumFor(at(60.79, 11.07))).toBe(null);       // Hamar
  });
  it('Oslo uendret', () => {
    expect(CENTRE).toEqual({ lat: 59.9139, lon: 10.7522 });
    expect(centreward(at(59.849, 10.829), [at(59.89, 10.81), at(59.912, 10.751)])).toBe('mot');
  });
  it('profilens «sentrum» i Bergen er Byparken, ikke Oslo', () => {
    const p = slåSammen({ hjem: { navn: 'Nesttun', lat: NESTTUN.lat, lon: NESTTUN.lon, kilde: 'bekreftet' },
      jobb: null, nei: { hjem: [], jobb: [] }, reiser: { 'helg|midt|hjem-sentrum': 'ja' } }, null);
    const lør = new Date('2026-11-14T12:10:00').getTime();
    const m = målNå(p, {}, lør, { navn: 'Nesttun', ...NESTTUN });
    expect(m.til.navn).toBe('sentrum');
    expect(sentrumFor(m.til).by).toBe('Bergen');
    expect(stedType({ navn: 'Byparken', lat: 60.3913, lon: 5.3221 }, p)).toBe('sentrum');
  });
});

describe('Bybanen', () => {
  it('heter Bybanen på Skyss-linjer, trikk ellers', () => {
    expect(modusOrd('tram', 'SKY:Line:1')).toBe('Bybanen');
    expect(modusOrd('tram', 'RUT:Line:17')).toBe('trikk');
    expect(linjemerke({ kode: '1', modus: 'tram', linjeId: 'SKY:Line:1' })).toContain('Bybanen 1');
  });
  it('båndet med stopp i nærheten heter Bybanen i Bergen', () => {
    const b = laneStops([{ id: 'a', name: 'Florida', lat: 60.3864, lon: 5.3297, modes: ['tram'] }]);
    expect(b[0].label).toBe('Bybanen');
    expect(laneStops([{ id: 'b', name: 'Tøyen', lat: 59.915, lon: 10.776, modes: ['tram'] }])[0].label).toBe('Trikk');
  });
});
