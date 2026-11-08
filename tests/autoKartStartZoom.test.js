// Utgangszoom: aldri nærmere enn skjermbildet fra Mortensrud.
// Bestilt (med skjermbilde): «Dette er detaljgraden og zoom-nivået kartet her bør ha som utgangspunkt.»
// Målt: gjenskapt i proben (stoppet 115 px øst, 104 px sør for deg; 787 m) → kartflisene er z=14.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const mod = await import('../src/views/auto.js');

describe('utgangszoom', () => {
  it('er z=14, og er taket for rammen', () => {
    expect(mod.START_ZOOM).toBe(14);
    expect(mod.FIT_MAKS_ZOOM).toBe(mod.START_ZOOM);
  });
  it('holdeplasser tett på deg zoomer ikke nærmere enn 14', () => {
    const her = { lat: 59.85, lon: 10.82 };
    expect(mod.zoomFor(her, [[59.8509, 10.8205]], [382, 382])).toBe(14);
  });
  it('langt unna zoomer lenger ut — stoppet skal synes', () => {
    const her = { lat: 59.85, lon: 10.82 };
    expect(mod.zoomFor(her, [[59.862, 10.82]], [382, 382])).toBeLessThan(14);
  });
  it('rammen bruker taket, ikke et eget tall', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toContain('maxZoom: FIT_MAKS_ZOOM, animate: false');
  });
});
