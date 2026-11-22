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
