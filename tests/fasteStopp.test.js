// v1.218.251: onboarding steg 1 — forklar posisjonen, og dine faste stopp.
import { describe, it, expect } from 'vitest';
import { fastRolleNå, fastFørst, tilbyFasteStopp, trengerPosForklaring } from '../src/fasteStopp.js';
// Nøytrale steder (ikke ett bestemt nabolag): A nærmest, B lenger unna.
const tirsdag = (t) => new Date(2026, 10, 24, t, 0).getTime(), lørdag = (t) => new Date(2026, 10, 21, t, 0).getTime();
const liste = [{ id: 'A', name: 'Nærmeste', distM: 180 }, { id: 'B', name: 'Morgenstoppet', distM: 420 }, { id: 'C', name: 'Langt unna', distM: 900 }];
describe('dine faste stopp styrer «nærmeste stopp»', () => {
  it('morgen og ettermiddag på hverdager; ikke helg eller kveld', () => {
    expect(fastRolleNå(tirsdag(7))).toBe('hjem');
    expect(fastRolleNå(tirsdag(16))).toBe('jobb');
    expect(fastRolleNå(tirsdag(21))).toBe(null);
    expect(fastRolleNå(lørdag(7))).toBe(null);
  });
  it('før-bildet: nærmeste først; med morgen-stoppet oppgitt står det først om morgenen', () => {
    const sagt = { hjem: { navn: 'Morgenstoppet', stopId: 'B' } };
    expect(fastFørst(liste, null, tirsdag(7))[0].id).toBe('A');
    expect(fastFørst(liste, sagt, tirsdag(7))[0].id).toBe('B');
    expect(fastFørst(liste, sagt, tirsdag(21))[0].id).toBe('A');
  });
  it('ikke utenfor gangavstand, og ikke når du står ved et annet stopp', () => {
    expect(fastFørst(liste, { hjem: { stopId: 'C' } }, tirsdag(7))[0].id).toBe('A');
    const står = [{ id: 'A', name: 'Her', distM: 40 }, { id: 'B', name: 'Morgenstoppet', distM: 420 }];
    expect(fastFørst(står, { hjem: { stopId: 'B' } }, tirsdag(7))[0].id).toBe('A');
  });
  it('kortet står etter første tavle, til begge er oppgitt eller du har sagt «ikke nå»', () => {
    expect(tilbyFasteStopp({ sagt: null, avvist: false, tavleVist: true })).toBe(true);
    expect(tilbyFasteStopp({ sagt: null, avvist: false, tavleVist: false })).toBe(false);
    expect(tilbyFasteStopp({ sagt: null, avvist: true, tavleVist: true })).toBe(false);
    expect(tilbyFasteStopp({ sagt: { jobb: { navn: 'X' } }, avvist: false, tavleVist: true })).toBe(true);   // ett igjen
    expect(tilbyFasteStopp({ sagt: { hjem: { navn: 'Y' }, jobb: { navn: 'X' } }, avvist: false, tavleVist: true })).toBe(false);
  });
});
describe('posisjonen forklares før nettleseren spør', () => {
  it('bare når nettleseren ikke har spurt ennå', () => {
    expect(trengerPosForklaring('prompt', false)).toBe(true);
    expect(trengerPosForklaring('granted', false)).toBe(false);
    expect(trengerPosForklaring('denied', false)).toBe(false);
    expect(trengerPosForklaring('prompt', true)).toBe(false);
    expect(trengerPosForklaring(undefined, false)).toBe(false);   // uten API: som før
  });
});

import { readFileSync } from 'node:fs';
describe('koblingen (v1.218.251)', () => {
  const a = readFileSync('src/views/auto.js', 'utf8'), m = readFileSync('src/main.js', 'utf8');
  it('«nærmeste stopp» leser de faste stoppene', () => {
    expect(a).toMatch(/fastFørst\(rankStops\([\s\S]*?\), lesSagt\(\), Date\.now\(\)\)/);
  });
  it('kortet står før andre spørsmål, og lagrer i profilen', () => {
    expect(a).toMatch(/if \(_tegnFasteStopp\(el\)\) return;/);
    expect(a).toMatch(/settSted\(rolle, sted, nær2\)/);
  });
  it('posisjonen forklares før nettleseren spør; knappen starter den', () => {
    expect(m).toMatch(/if \(trengerPosForklaring\(t, forklart\) && loadAutoMode\(\)\) \{ state\.posVenter = true; renderAuto\(\); \}/);
    expect(a).toMatch(/if \(v === 'pos'\) \{ if \(window\.__startPos\) window\.__startPos\(\);/);
  });
});

import { exampleFallback } from '../src/firstRun.js';
describe('ingen eksempeltavle mens forklaringen venter på svar (v1.218.251)', () => {
  it('før-bildet: uten posisjon falt appen til eksempelet; nå ikke mens den venter', () => {
    expect(exampleFallback({})).toBe(true);
    expect(exampleFallback({ venter: true })).toBe(false);
  });
});

describe('valgt sted avslutter ventingen (v1.218.251)', () => {
  it('_settSted slipper forklaringen, så lista tegnes', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/function _settSted\(label, ll\) \{[\s\S]{0,200}if \(state\.posVenter\) \{ state\.posVenter = false;/);
    expect(a).toMatch(/if \(state\.posVenter\) \{ const b = _el\('auto-body'\); if \(b\) b\.innerHTML = ''; return; \}/);
  });
});
