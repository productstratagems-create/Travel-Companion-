// «Skjønner app'en hvilken dag det er? Og greier den å sette sammen konteksten hvilken dag er det,
// hva er klokken, hvor er bruker og hvor og når går neste reise?» (v1.218.54)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dagtype, påskedag, erHelgLik } from '../src/dagtype.js';
import { avledProfil, slåSammen, vaneMatrise, kontekstNå } from '../src/profil.js';
import { rangerMål } from '../src/maalModell.js';

const t = s => new Date(s).getTime();

describe('dagtype: én definisjon, med helligdager', () => {
  it('påskedag', () => {
    expect(påskedag(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
    expect(påskedag(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
  });
  it('17. mai, 2. påskedag, Kr. himmelfart, 2. pinsedag: fridag', () => {
    expect(dagtype(t('2027-05-17T07:30:00'))).toBe('fridag');
    expect(dagtype(t('2027-03-29T07:30:00'))).toBe('fridag');
    expect(dagtype(t('2027-05-06T07:30:00'))).toBe('fridag');
    expect(dagtype(t('2027-05-17T07:30:00'))).toBe('fridag');
    expect(dagtype(t('2026-05-25T07:30:00'))).toBe('fridag');
  });
  it('vanlig onsdag: ukedag; lørdag: helg', () => {
    expect(dagtype(t('2026-11-18T07:30:00'))).toBe('ukedag');
    expect(dagtype(t('2026-11-21T07:30:00'))).toBe('helg');
  });
  it('julaften: fri fra kl. 12', () => {
    expect(dagtype(t('2026-12-24T10:00:00'))).toBe('ukedag');
    expect(dagtype(t('2026-12-24T13:00:00'))).toBe('fridag');
  });
  it('ingen andre kopier av helgeregelen i src', () => {
    const filer = [];
    const gå = d => readdirSync(d).forEach(f => { const p = join(d, f); statSync(p).isDirectory() ? gå(p) : p.endsWith('.js') && filer.push(p); });
    gå('src');
    const kopier = filer.filter(f => !f.endsWith('dagtype.js') && /getDay\(\) === 0 \|\|/.test(readFileSync(f, 'utf8')));
    expect(kopier).toEqual([]);
  });
});

// Profilen: hjem Mortensrud, jobb Helsfyr; hverdag hjem→jobb morgen, jobb→hjem ettermiddag,
// helg hjem→sentrum midt på dagen.
const MORT = { navn: 'Mortensrud', stopId: 'NSR:StopPlace:5687', lat: 59.8493, lon: 10.8297 };
const HELS = { navn: 'Helsfyr', stopId: 'NSR:StopPlace:6068', lat: 59.9127, lon: 10.8014 };
const JBT = { navn: 'Jernbanetorget', stopId: 'NSR:StopPlace:3990', lat: 59.9122, lon: 10.7511 };
const tur = (a, b, bucket, count, helg = false) => ({ fromName: a.navn, fromStopId: a.stopId, toName: b.navn, toStopId: b.stopId, toLat: b.lat, toLon: b.lon, bucket, isWeekend: helg, count });
const HIST = [tur(MORT, HELS, 3, 18), tur(HELS, MORT, 8, 15), tur(MORT, JBT, 6, 5, true), tur(JBT, MORT, 10, 4, true)];
const P = slåSammen(null, avledProfil(HIST));
const M = vaneMatrise(HIST, P);
const KORT = [{ name: 'Helsfyr', id: HELS.stopId, lat: HELS.lat, lon: HELS.lon }, { name: 'Jernbanetorget', id: JBT.stopId, lat: JBT.lat, lon: JBT.lon },
  { name: 'Mortensrud', id: MORT.stopId, lat: MORT.lat, lon: MORT.lon }];
const topp = (nå, her) => rangerMål(KORT, { nå, her: { name: her.navn, id: her.stopId, lat: her.lat, lon: her.lon }, hist: HIST,
  profil: kontekstNå(nå, her, P, M).profilMål })[0].kort.name;

describe('konteksten: dag, klokke, sted → neste reise', () => {
  it('mandag 07:30 hjemme: jobb, og øverste kort er Helsfyr', () => {
    const k = kontekstNå(t('2026-11-16T07:30:00'), MORT, P, M);
    expect(k).toMatchObject({ dag: 'ukedag', del: 'morgen', sted: 'hjem' });
    expect(k.neste.toName).toBe('Helsfyr');
    expect(topp(t('2026-11-16T07:30:00'), MORT)).toBe('Helsfyr');
  });
  it('mandag 16:00 på jobb: hjem', () => {
    expect(kontekstNå(t('2026-11-16T16:00:00'), HELS, P, M).neste.toName).toBe('Mortensrud');
    expect(topp(t('2026-11-16T16:00:00'), HELS)).toBe('Mortensrud');
  });
  it('lørdag 12:00 hjemme: sentrum, og Jernbanetorget øverst', () => {
    expect(kontekstNå(t('2026-11-21T12:00:00'), MORT, P, M).neste.toName).toBe('sentrum');
    expect(topp(t('2026-11-21T12:00:00'), MORT)).toBe('Jernbanetorget');
  });
  it('17. mai 07:30 hjemme: ikke jobb', () => {
    const k = kontekstNå(t('2027-05-17T07:30:00'), MORT, P, M);
    expect(k.dag).toBe('fridag');
    expect(k.neste && k.neste.toName).not.toBe('Helsfyr');
    expect(erHelgLik(t('2027-05-17T07:30:00'))).toBe(true);
  });
});

describe('profilen avgjør der historikken er tynn (bindingen rangerMål ↔ din vanlige reise)', () => {
  it('bekreftet hjem→jobb mandag morgen, ingen hverdagshistorikk: Helsfyr øverst, ikke det faste mønsterets førstemann', () => {
    const helg = [tur(MORT, JBT, 6, 5, true)];
    const p = slåSammen({ hjem: { ...MORT, kilde: 'bekreftet', nær: [] }, jobb: { ...HELS, kilde: 'bekreftet', nær: [] },
      nei: { hjem: [], jobb: [] }, reiser: { 'ukedag|morgen|hjem-jobb': 'ja' } }, null);
    const nå = t('2026-11-16T07:30:00');
    const kort = [KORT[1], KORT[0], KORT[2]];   // Jernbanetorget først i lista
    const r = rangerMål(kort, { nå, her: { name: 'Mortensrud', id: MORT.stopId, lat: MORT.lat, lon: MORT.lon }, hist: helg,
      profil: kontekstNå(nå, MORT, p, vaneMatrise(helg, p)).profilMål });
    expect(r[0].kort.name).toBe('Helsfyr');
    expect(r[0].grunn).toContain('hjem → jobb');
  });
});
