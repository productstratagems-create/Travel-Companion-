// Bestilt: et fast konsept for brukerprofil — hjem, jobb, holdeplasser innen gangavstand,
// vaner hverdag/helg per døgndel, reiser hjem→jobb, jobb→hjem, hjem↔sentrum. Data fra appen
// populerer; spørsmål validerer og kompletterer.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DØGNDELER, delAvTime, delAvBøtte, avledProfil, vaneMatrise, slåSammen, reiserI, nesteSpørsmål,
  målNå, settSted, avvisSted, svarReise, lesSagt, glemProfil, profil, stedType } from '../src/profil.js';

const MORT = { navn: 'Mortensrud', stopId: 'NSR:StopPlace:5687', lat: 59.8493, lon: 10.8297 };
const JBT = { navn: 'Jernbanetorget', stopId: 'NSR:StopPlace:3990', lat: 59.9122, lon: 10.7511 };
const HELSFYR = { navn: 'Helsfyr', stopId: 'NSR:StopPlace:6068', lat: 59.9127, lon: 10.8014 };
const tur = (fra, til, bucket, count, helg = false) => ({ fromName: fra.navn, fromStopId: fra.stopId, toName: til.navn,
  toStopId: til.stopId, toLat: til.lat, toLon: til.lon, bucket, isWeekend: helg, count });
// Hverdag: Mortensrud → Helsfyr kl 07–08 (bøtte 3), Helsfyr → Mortensrud kl 16 (bøtte 8).
// Helg: Mortensrud → Jernbanetorget kl 12 (bøtte 6), tilbake kl 20 (bøtte 10).
const HIST = [tur(MORT, HELSFYR, 3, 18), tur(HELSFYR, MORT, 8, 15), tur(MORT, JBT, 6, 5, true), tur(JBT, MORT, 10, 4, true)];
const ts = s => new Date(s).getTime();

describe('døgndelene', () => {
  it('06/10/14/18/22, natta over midnatt', () => {
    expect(DØGNDELER.map(d => d.fra)).toEqual([6, 10, 14, 18, 22]);
    expect([5, 6, 9, 10, 13, 14, 17, 18, 21, 22, 23, 0].map(delAvTime))
      .toEqual(['natt', 'morgen', 'morgen', 'midt', 'midt', 'ettermiddag', 'ettermiddag', 'kveld', 'kveld', 'natt', 'natt', 'natt']);
  });
  it('hver totimersbøtte ligger i én del', () => {
    expect([...Array(12).keys()].map(delAvBøtte)).toEqual(['natt', 'natt', 'natt', 'morgen', 'morgen', 'midt', 'midt', 'ettermiddag', 'ettermiddag', 'kveld', 'kveld', 'natt']);
  });
});

describe('avledet av historikken', () => {
  it('hjem der hverdagsmorgenen starter og kvelden ender; jobb der morgenen ender', () => {
    const p = avledProfil(HIST);
    expect(p.hjem.navn).toBe('Mortensrud');
    expect(p.hjem.kilde).toBe('avledet');
    expect(p.jobb.navn).toBe('Helsfyr');
  });
  it('for få turer: ingen gjetning', () => {
    expect(avledProfil([tur(MORT, HELSFYR, 3, 2)])).toEqual({ hjem: null, jobb: null });
  });
  it('det du har sagt nei til, foreslås ikke igjen', () => {
    expect(avledProfil(HIST, { nei: { jobb: [HELSFYR] } }).jobb).toBe(null);
  });
  it('vanene: hverdag morgen hjem→jobb, ettermiddag jobb→hjem, helg hjem↔sentrum', () => {
    const p = avledProfil(HIST);
    const m = vaneMatrise(HIST, slåSammen(null, p));
    expect(m['ukedag|morgen']).toEqual({ 'hjem-jobb': 18 });
    expect(m['ukedag|ettermiddag']).toEqual({ 'jobb-hjem': 15 });
    expect(m['helg|midt']).toEqual({ 'hjem-sentrum': 5 });
    expect(m['helg|kveld']).toEqual({ 'sentrum-hjem': 4 });
  });
});

describe('det du har sagt vinner', () => {
  beforeEach(() => { localStorage.clear(); glemProfil(); });
  it('bekreftet hjem med holdeplasser innen gangavstand', () => {
    settSted('hjem', MORT, [{ name: 'Mortensrud T', id: 'NSR:StopPlace:9' }, { name: 'Lofsrud', id: 'NSR:StopPlace:10' }]);
    const p = profil(HIST);
    expect(p.hjem.kilde).toBe('bekreftet');
    expect(stedType({ navn: 'Lofsrud', stopId: 'NSR:StopPlace:10' }, p)).toBe('hjem');
  });
  it('nei til jobb huskes og fjerner forslaget', () => {
    avvisSted('jobb', HELSFYR);
    expect(profil(HIST).jobb).toBe(null);
    expect(lesSagt().nei.jobb[0].navn).toBe('Helsfyr');
  });
  it('nei til en vane fjerner den; ja holder den selv uten turer', () => {
    const p0 = profil(HIST);
    const m = vaneMatrise(HIST, p0);
    svarReise('ukedag|morgen', 'hjem-jobb', false);
    svarReise('ukedag|natt', 'jobb-hjem', true);
    const p = profil(HIST);
    expect(reiserI(p, m, 'ukedag', 'morgen')).toEqual([]);
    expect(reiserI(p, m, 'ukedag', 'natt')[0]).toMatchObject({ type: 'jobb-hjem', kilde: 'bekreftet' });
  });
  it('lagres i ALL_KEYS', () => {
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.profil',");
  });
});

describe('spørsmålene og forslaget', () => {
  const p = slåSammen(null, avledProfil(HIST));
  const m = vaneMatrise(HIST, p);
  it('først hjem, så jobb, så vanen i cellen du er i', () => {
    const nå = ts('2026-11-11T07:30:00');   // onsdag morgen (lokal tid i testen)
    const a = nesteSpørsmål(p, m, nå);
    expect(a.tekst).toBe('Bor du ved Mortensrud?');
    const b = nesteSpørsmål(p, m, nå, new Set([a.nøkkel]));
    expect(b.tekst).toBe('Jobber eller studerer du ved Helsfyr?');
    const c = nesteSpørsmål(p, m, nå, new Set([a.nøkkel, b.nøkkel]));
    expect(c.tekst).toBe('Reiser du hjem → jobb på hverdager, morgen?');
  });
  it('hverdag morgen hjemme: målet er jobb; lørdag 12: sentrum', () => {
    expect(målNå(p, m, ts('2026-11-11T07:30:00'), MORT).til.navn).toBe('Helsfyr');
    expect(målNå(p, m, ts('2026-11-14T12:30:00'), MORT).til.navn).toBe('sentrum');
  });
  it('står du på jobb om morgenen, er hjem→jobb ikke forslaget', () => {
    expect(målNå(p, m, ts('2026-11-11T07:30:00'), HELSFYR)).toBe(null);
  });
});

describe('holdeplassene innen gangavstand', () => {
  it('én per holdeplass, uten geokoderens «|metro»', () => {
    localStorage.clear(); glemProfil();
    settSted('hjem', MORT, [{ name: 'Mortensrud', id: 'NSR:StopPlace:5687|metro' }, { name: 'Mortensrud', id: 'NSR:StopPlace:5687|bus' },
      { name: 'Lofsrud', id: 'NSR:StopPlace:10|bus' }]);
    expect(lesSagt().hjem.nær).toEqual([{ navn: 'Mortensrud', stopId: 'NSR:StopPlace:5687' }, { navn: 'Lofsrud', stopId: 'NSR:StopPlace:10' }]);
    expect(stedType({ navn: 'Lofsrud', stopId: 'NSR:StopPlace:10' }, profil([]))).toBe('hjem');
  });
});
