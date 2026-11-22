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
    expect(tilbyFasteStopp({ sagt: { hjem: { navn: 'Y', stopId: 'NSR:StopPlace:1' }, jobb: { navn: 'X', stopId: 'NSR:StopPlace:2' } }, avvist: false, tavleVist: true })).toBe(false);
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
    // v1.218.257: gjennom spørsmålskøen.
    expect(a).toMatch(/if \(valgt === 'faste' && _tegnFasteStopp\(el\)\) return;/);
    expect(a).toMatch(/settSted\(rolle, sted, \[\]\)/);   // v1.218.270: straks, stoppene rundt etterpå
  });
  it('posisjonen forklares før nettleseren spør; knappen starter den', () => {
    expect(m).toMatch(/if \(trengerPosForklaring\(t, forklart\) && loadAutoMode\(\)\) \{ state\.posVenter = true; renderAuto\(\); \}/);
    expect(a).toMatch(/if \(v === 'pos'\) \{ if \(window\.__startPos\) window\.__startPos\(\);/);
  });
});

describe('valgt sted avslutter ventingen (v1.218.251)', () => {
  it('_settSted slipper forklaringen, så lista tegnes', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/function _settSted\(label, ll\) \{[\s\S]{0,200}if \(state\.posVenter\) \{ state\.posVenter = false;/);
    expect(a).toMatch(/if \(state\.posVenter\) \{ const b = _el\('auto-body'\); if \(b\) b\.innerHTML = ''; return; \}/);
  });
});
import { fasteKandidater, fasteRo, FASTE_RO_M } from '../src/fasteStopp.js';
describe('forslagene bruker rangeringskonseptet (v1.218.252)', () => {
  // Nøytral fikstur: seks små stopp nær deg (én busslinje, få avganger), og et
  // T-banestopp og en bussterminal på 800 m.
  const små = Array.from({ length: 6 }, (_, i) => ({ id: 'S' + i, name: 'Lite ' + i, distM: 150 + i * 40 }));
  const T = { id: 'T', name: 'Stasjon T', distM: 790 }, TERM = { id: 'B', name: 'Terminal', distM: 800 };
  const info = { T: { moduser: ['metro', 'bus'], avgangerNå: 30, linjer: 3, plattformer: 2 }, B: { moduser: ['bus'], avgangerNå: 40, linjer: 6, plattformer: 6 } };
  små.forEach(s => { info[s.id] = { moduser: ['bus'], avgangerNå: 3, linjer: 1, plattformer: 1 }; });
  const liste = [...små, T, TERM];
  it('før-bildet: de seks nærmeste; nå stoppet i overskriften først, så stasjon og terminal', () => {
    expect(liste.slice(0, 6).map(s => s.id)).not.toContain('T');
    const k = fasteKandidater(liste, TERM, s => info[s.id]);
    expect(k.map(s => s.id).slice(0, 3)).toEqual(['B', 'T', 'S0']);
    expect(k).toHaveLength(6);
  });
  it('ro: lista som veksler rekkefølge hvert sekund gir samme forslag', () => {
    const d = () => 0;
    let r = fasteRo(null, ['a', 'b', 'c'], { lat: 0, lon: 0 }, true, d);
    for (let i = 0; i < 10; i++) r = fasteRo(r, i % 2 ? ['c', 'b', 'a'] : ['b', 'a'], { lat: 0, lon: 0 }, true, d);
    expect(r.liste).toEqual(['a', 'b', 'c']);
  });
  it('ny liste når du har flyttet deg, eller én gang når tilbudet blir kjent', () => {
    let r = fasteRo(null, ['a'], {}, false, () => 0);
    r = fasteRo(r, ['b'], {}, true, () => 0);
    expect(r.liste).toEqual(['b']);
    r = fasteRo(r, ['c'], {}, true, () => 0);
    expect(r.liste).toEqual(['b']);
    expect(fasteRo(r, ['d'], {}, true, () => FASTE_RO_M + 1).liste).toEqual(['d']);
  });
});

import { fasteForslagFor } from '../src/fasteStopp.js';
describe('stoppene nær deg gjelder bare én rolle (v1.218.265)', () => {
  const nær = [{ id: 'NSR:StopPlace:10', name: 'Voss skysstasjon' }, { id: 'NSR:StopPlace:11', name: 'Voss stasjon' }];
  it('før-bildet: «På vei hjem» fikk nærlista etter at morgenstoppet var valgt; nå bare søk', () => {
    expect(fasteForslagFor('jobb', { hjem: { navn: 'Voss skysstasjon', stopId: 'NSR:StopPlace:10' } }, nær)).toEqual([]);
    expect(fasteForslagFor('hjem', { jobb: { navn: 'Tromsø sentrum', stopId: 'NSR:StopPlace:40' } }, nær)).toEqual([]);
  });
  it('ingen besvart: nærlista til begge, den man velger først', () => {
    expect(fasteForslagFor('hjem', {}, nær)).toBe(nær);
    expect(fasteForslagFor('jobb', {}, nær)).toBe(nær);
  });
  it('kortet bruker regelen både for knappene og for valget', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect((a.match(/fasteForslagFor\(rolle, sagt, nær\)/g) || []).length).toBe(2);
  });
});

import { gyldigFastStopp, fastSvar, stoppIdAv, tilbyFasteStopp as _tilby } from '../src/fasteStopp.js';
describe('onboarding tar bare imot svar appen kan bruke (v1.218.267)', () => {
  const VOSS = { navn: 'Voss skysstasjon', stopId: 'NSR:StopPlace:10', nær: [{ navn: 'Voss stasjon', stopId: 'NSR:StopPlace:11|rail' }] };
  it('før-bildet: en adresse uten stopp-id ble lagret som hjem; nå avvist', () => {
    const adr = { label: 'Storgata 1, Bodø', lat: 67.28, lon: 14.4 };
    expect(gyldigFastStopp(adr, {}, 'hjem').ok).toBe(false);
    expect(gyldigFastStopp({ id: 'NSR:StopPlace:20|bus', name: 'Tromsø Prostneset' }, {}, 'hjem')).toEqual({ ok: true, id: 'NSR:StopPlace:20' });
  });
  it('før-bildet: «på vei hjem» = morgenstoppet ble godtatt; nå avvist med grunn', () => {
    const g = gyldigFastStopp({ id: 'NSR:StopPlace:10' }, { hjem: VOSS }, 'jobb');
    expect(g.ok).toBe(false);
    expect(g.grunn).toMatch(/om morgenen/);
    expect(gyldigFastStopp({ id: 'NSR:StopPlace:11' }, { hjem: VOSS }, 'jobb').ok).toBe(false);
    expect(gyldigFastStopp({ id: 'NSR:StopPlace:30' }, { hjem: VOSS }, 'jobb').ok).toBe(true);
  });
  it('før-bildet: gamle adressesvar regnes som ubesvart, så kortet spør igjen', () => {
    const gammel = { hjem: { navn: 'Storgata 1', stopId: null }, jobb: { navn: 'Bodø lufthavn', stopId: 'NSR:StopPlace:2' } };
    expect(fastSvar(gammel, 'hjem')).toBeNull();
    expect(_tilby({ sagt: gammel, avvist: false, tavleVist: true })).toBe(true);
  });
  it('stoppIdAv godtar bare NSR-stoppesteder', () => {
    expect(stoppIdAv({ id: 'NSR:Quay:5' })).toBeNull();
    expect(stoppIdAv({ stopId: 'NSR:StopPlace:7|metro' })).toBe('NSR:StopPlace:7');
  });
  it('kortet søker bare stopp og validerer før lagring', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/data-fast-sok\]'\)\.forEach\(inp => bindPlaceInput\(inp, inp\.nextElementSibling, q => søkHjemStopp\(q\)/);
    expect(a).toMatch(/const g = gyldigFastStopp\(s, lesSagt\(\), rolle\);/);
  });
});

describe('faste stopp-kortet på telefon (v1.218.270)', () => {
  const a = readFileSync('src/views/auto.js', 'utf8'), css = readFileSync('src/style/settings.css', 'utf8');
  it('før-bildet: lagringen ventet på stoppene rundt; nå lagres valget straks', () => {
    const i = a.indexOf('const lagre = (rolle, s) => {');
    const blokk = a.slice(i, i + 1600);
    expect(blokk).toMatch(/settSted\(rolle, sted, \[\]\);\s*_fasteÅpen = null;/);
    expect(blokk.indexOf('settSted(rolle, sted, [])')).toBeLessThan(blokk.indexOf('fetchNearbyStops'));
  });
  it('søkeforslagene har stil, og «endre» er minst 44 px', () => {
    expect(css).toMatch(/\.sugg-list \.sugg-btn\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.faste-stopp \.faste-endre\{min-height:44px/);
  });
});
describe('valget vises straks også fra søket (v1.218.270)', () => {
  it('feltet slipper fokus før kortet tegnes om', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/settSted\(rolle, sted, \[\]\);[\s\S]{0,400}document\.activeElement\.blur\(\);\s*el\._sistKort = null; _renderWhere\(\); _renderProfilQ/);
  });
});
