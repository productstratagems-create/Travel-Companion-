// v1.218.258: onboarding steg 3 — lært hjemover.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { hjemoverForslag, lagreHjemoverFra, hjemStopp, HJEM_KEY } from '../src/hjemover.js';
import { velgSpørsmål } from '../src/sporsmal.js';
import { storage } from '../src/storage.js';
const H = { navn: 'Hjemstoppet', stopId: 'NSR:StopPlace:7', nær: [{ navn: 'Nabo', stopId: 'NSR:StopPlace:8|bus' }] };
describe('hjemover læres fra profilen', () => {
  beforeEach(() => storage.set(HJEM_KEY, ''));
  it('forslaget kommer når hjemover er tomt og profilen kjenner hjem', () => {
    expect(hjemoverForslag({ hjem: H }, [], null)).toBe(H);
    expect(hjemoverForslag({ hjem: H }, [{ id: 'x', name: 'y' }], null)).toBe(null);
    expect(hjemoverForslag({ hjem: null }, [], null)).toBe(null);
    expect(hjemoverForslag({ hjem: H }, [], 'NSR:StopPlace:7')).toBe(null);   // sagt nei
  });
  it('ja: hjem-stoppet og stoppene rundt blir hjemover', () => {
    lagreHjemoverFra(H);
    expect(hjemStopp().map(s => s.id)).toEqual(['NSR:StopPlace:7', 'NSR:StopPlace:8']);
  });
  it('i køen rett etter faste stopp, og uten krav om reiser', () => {
    expect(velgSpørsmål(new Set(['hjemover', 'neste']), { harReiser: true })).toBe('hjemover');
    expect(velgSpørsmål(new Set(['faste', 'hjemover']), { harReiser: false })).toBe('faste');
    expect(velgSpørsmål(new Set(['hjemover']), { harReiser: false })).toBe('hjemover');
  });
  it('koblet inn: profilplassen viser det når det er dets tur', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/if \(valgt === 'hjemover' && _tegnHjemover\(el\)\) return;/);
    expect(a).toMatch(/lagreHjemoverFra\(h\); _spørsmålBesvart\(\);/);
  });
});

import { hjemFraProfil, leggTilHjem } from '../src/hjemover.js';
import { settSted } from '../src/profil.js';
import { storage as _st } from '../src/storage.js';
describe('morgenstoppet er Hjemover (v1.218.266)', () => {
  const VOSS = { navn: 'Voss skysstasjon', stopId: 'NSR:StopPlace:10|bus', lat: 60.63, lon: 6.42 };
  const nær = [{ navn: 'Voss stasjon', stopId: 'NSR:StopPlace:11' }];
  it('før-bildet: morgenstopp lagret, hjemover tom → hjemStopp() ga []; nå morgenstoppet og stoppene rundt', () => {
    _st.set('t.hjemoverStopp', ''); _st.set('t.profil', '');
    settSted('hjem', VOSS, nær);
    expect(hjemStopp().map(s => s.id)).toEqual(['NSR:StopPlace:10', 'NSR:StopPlace:11']);
  });
  it('en egen hjemover-liste går foran', () => {
    settSted('hjem', VOSS, nær);
    _st.set('t.hjemoverStopp', JSON.stringify([{ id: 'NSR:StopPlace:99', name: 'Bergen busstasjon' }]));
    expect(hjemStopp().map(s => s.id)).toEqual(['NSR:StopPlace:99']);
    _st.set('t.hjemoverStopp', '');
  });
  it('uten morgenstopp: tom', () => {
    expect(hjemFraProfil({})).toEqual([]);
    expect(hjemFraProfil(null)).toEqual([]);
  });
});
describe('å legge til et hjemover-stopp bygger videre på morgenstoppet (v1.218.266)', () => {
  it('morgenstoppet blir med i den lagrede lista', () => {
    _st.set('t.hjemoverStopp', '');
    settSted('hjem', { navn: 'Voss skysstasjon', stopId: 'NSR:StopPlace:10' }, []);
    leggTilHjem({ id: 'NSR:StopPlace:99', name: 'Bergen busstasjon' });
    expect(hjemStopp().map(s => s.id)).toEqual(['NSR:StopPlace:10', 'NSR:StopPlace:99']);
    _st.set('t.hjemoverStopp', '');
  });
});
