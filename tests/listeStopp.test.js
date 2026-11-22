// v1.218.243: «nærmeste stopp» = det som oftest står høyt i lista — uten blafring.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { listeStoppKandidat, listeStoppRo, LISTE_RO_MS, LISTE_MIN_MELLOM_MS } from '../src/views/auto.js';
const T = 1_000_000_000_000, M = 60_000;
const dir = (min, fra) => ({ calls: [{ ms: T + min * M, call: fra ? { _fra: { id: fra } } : {} }] });
const gang = { Mrud: 12, Stb: 10 };
describe('stoppet lista bruker', () => {
  it('før-bildet: overskriften Mortensrud, men lista toppes av Stenbråten', () => {
    const dirs = [dir(11, 'Stb'), dir(13, 'Stb'), dir(14), dir(15, 'Stb'), dir(16, 'Stb'), dir(40)];
    const k = listeStoppKandidat(dirs, 'Mrud', id => gang[id], T);
    expect(k).toEqual({ id: 'Stb', antall: 4, eget: 1 });
  });
  it('avganger du ikke rekker teller ikke', () => {
    const k = listeStoppKandidat([dir(5, 'Stb'), dir(13)], 'Mrud', id => gang[id], T);
    expect(k).toEqual({ id: 'Mrud', antall: 1, eget: 1 });
  });
  it('ro: bytter først når kandidaten har ledet i 90 s, med minst 2 flere', () => {
    const k = { id: 'Stb', antall: 4, eget: 1 };
    let r = listeStoppRo(null, k, 'Mrud', T);
    expect(r.bytt).toBe(null);
    r = listeStoppRo(r, k, 'Mrud', T + LISTE_RO_MS - 1);
    expect(r.bytt).toBe(null);
    r = listeStoppRo(r, k, 'Mrud', T + LISTE_RO_MS);
    expect(r.bytt).toBe('Stb');
  });
  it('ro: et blaff nullstiller; jevnt (3 mot 2) bytter ikke', () => {
    const k = { id: 'Stb', antall: 4, eget: 1 };
    let r = listeStoppRo(null, k, 'Mrud', T);
    r = listeStoppRo(r, null, 'Mrud', T + 30_000);
    r = listeStoppRo(r, k, 'Mrud', T + LISTE_RO_MS);
    expect(r.bytt).toBe(null);
    const jevn = { id: 'Stb', antall: 3, eget: 2 };
    let j = listeStoppRo(null, jevn, 'Mrud', T);
    j = listeStoppRo(j, jevn, 'Mrud', T + 10 * LISTE_RO_MS);
    expect(j.bytt).toBe(null);
  });
  it('ro: ikke oftere enn hvert 5. minutt', () => {
    const k = { id: 'Stb', antall: 4, eget: 0 };
    let r = { leder: 'Stb', siden: T, sistByttet: T + LISTE_RO_MS - LISTE_MIN_MELLOM_MS + 1, bytt: null };
    expect(listeStoppRo(r, k, 'Mrud', T + LISTE_RO_MS).bytt).toBe(null);
  });
  it('koblet inn: ikke når du har valgt stoppet selv', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/if \(!_stopPinned && !picked\.changed && _stop && _dirs && _dirs\.length\) \{/);
  });
});
import { listeHolder } from '../src/views/auto.js';
describe('lista sitt valg holdes, så overskriften ikke vipper tilbake', () => {
  it('holdes innen gangavstand; slippes når du har gått fra det', () => {
    expect(listeHolder('Stb', [{ id: 'Stb', distM: 300 }])).toBe(true);
    expect(listeHolder('Stb', [{ id: 'Stb', distM: 900 }])).toBe(false);
    expect(listeHolder('Stb', [])).toBe(false);
  });
  it('rangeringen respekterer valget (holdt som et valg, men slippes)', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/const holdt = _stopPinned \|\| \(!!_listeValgt && !!_stop && _stop\.id === _listeValgt\);/);
  });
});
