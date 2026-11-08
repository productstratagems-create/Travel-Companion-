// Utgangskartet: kvadratisk, zoom 15, sentrert midt mellom alle punktene.
// Bestilt (med skjermbilde): «Velg kvadratisk og dette zoom-nivået. Senter av kartet må beregnes
// som punktet midt mellom alle punktene i kartet; brukers posisjon, holdeplasser og stasjoner.»
// Målt: deg→Mortensrud 234×209 px mot 115×104 ved z=14 → 2,03× → z=15.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const mod = await import('../src/views/auto.js');
const src = readFileSync('src/views/auto.js', 'utf8');
const ramme = src.slice(src.indexOf('const rammePts = sentrert'), src.indexOf('if (_stop && _stop.lat != null) {\n    L.marker'));

describe('utgangskartet', () => {
  it('zoom 15', () => { expect(mod.START_ZOOM).toBe(15); expect(mod.FIT_MAKS_ZOOM).toBe(15); });
  it('midtpunkt er midten av rammen, ikke gjennomsnittet', () => {
    // Deg i vest, tre holdeplasser samlet i øst: gjennomsnittet ville dratt kartet østover.
    const pts = [[59.85, 10.80], [59.85, 10.84], [59.851, 10.84], [59.849, 10.84]];
    const [la, lo] = mod.midtpunkt(pts);
    expect(lo).toBeCloseTo(10.82, 9);
    expect(la).toBeCloseTo(59.85, 9);
    expect(mod.midtpunkt([])).toBe(null);
  });
  it('rammen: deg, stoppet og holdeplassene som er tegnet — uten speiling', () => {
    expect(ramme).toContain('[userPos, _stop, ...others]');
    expect(ramme).not.toContain('speiletOm(');
    expect(ramme).toContain('_aMap.setView(midtpunkt(rammePts)');
  });
  it('formen velges ikke av geometrien lenger (kvadratisk som utgangspunkt)', () => {
    expect(ramme).not.toContain('formFraGeometri(');
  });
});
