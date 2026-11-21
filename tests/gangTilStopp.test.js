// v1.218.194: alternativt avgangssted — målt før vi lover, og vist på kartet.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { rekkLengerNed, rekkTekst } from '../src/rekkLengerNed.js';
import { sikreGang, gangRuteTil, _resetGang, GANG_SAMTIDIG } from '../src/api/gangTilStopp.js';

const T = Date.parse('2026-11-21T10:37:00+01:00'), M = 60_000, iso = m => new Date(T + m * M).toISOString();
const kall = (id, navn, m, lat) => ({ quay: { latitude: lat, longitude: 10.8, stopPlace: { id, name: navn } }, expectedDepartureTime: iso(m) });
// 73: Mortensrud nå (rekker ikke), Kantarellen om 12 min.
const TUR = [kall('Mrud', 'Mortensrud', 0, 1), kall('Kant', 'Kantarellen', 12, 2), kall('Hol', 'Holmlia', 20, 9)];
const FRA = { id: 'Mrud', navn: 'Mortensrud' };
const k = ms => new Date(ms).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });

describe('målt før vi lover (skjermbildet: 10 min anslått, 15 målt, bussen om 12)', () => {
  it('anslått: tilbudet står, med «ca.»', () => {
    const r = rekkLengerNed(TUR, FRA, null, ll => (ll.lat === 2 ? { mins: 10, målt: false } : null), 12, T);
    expect(r).toMatchObject({ stopp: { navn: 'Kantarellen' }, målt: false });
    expect(rekkTekst(r, k)).toMatch(/· ca\. 10 min å gå$/);
  });
  it('målt 15 min: du rekker den ikke — tilbudet er borte, ikke et løfte detaljene motsier', () => {
    expect(rekkLengerNed(TUR, FRA, null, ll => (ll.lat === 2 ? { mins: 15, målt: true } : null), 12, T)).toBe(null);
  });
  it('målt og rekkes: uten «ca.»', () => {
    const r = rekkLengerNed(TUR, FRA, null, ll => (ll.lat === 2 ? { mins: 9, målt: true } : null), 12, T);
    expect(rekkTekst(r, k)).toMatch(/· 9 min å gå$/);
  });
});

describe('sikreGang', () => {
  beforeEach(() => _resetGang());
  const fra = { lat: 59.85, lon: 10.83 }, st = id => ({ id, lat: 59.86, lon: 10.83 });
  it('ruter stoppet én gang, og gir ruta etterpå', async () => {
    let n = 0;
    const rute = () => { n++; return Promise.resolve({ latlngs: [[1, 1], [2, 2]], metres: 300 }); };
    sikreGang(fra, st('A'), { rute }); sikreGang(fra, st('A'), { rute });
    await new Promise(r => setTimeout(r, 0));
    expect(n).toBe(1);
    expect(gangRuteTil(st('A'))).toEqual([[1, 1], [2, 2]]);
  });
  it(`høyst ${GANG_SAMTIDIG} på en gang`, () => {
    let n = 0; const rute = () => { n++; return new Promise(() => {}); };
    ['A', 'B', 'C', 'D', 'E'].forEach(i => sikreGang(fra, st(i), { rute }));
    expect(n).toBe(GANG_SAMTIDIG);
  });
});

describe('koblingen', () => {
  const b = readFileSync('src/views/board.js', 'utf8'), a = readFileSync('src/views/auto.js', 'utf8'), s = readFileSync('src/views/selected.js', 'utf8');
  it('tilbudenes stopp rutes i Rute og Auto, og walkMinsTo sier om den er målt', () => {
    expect(b).toMatch(/if \(rk && !rk\.målt\) sikreGang\(/);
    expect(a).toMatch(/if \(rk && !rk\.målt\) sikreGang\(_gangFra\(\), rk\.stopp/);
    expect(readFileSync('src/geo.js', 'utf8')).toMatch(/målt: measured != null,/);
  });
  it('kartet i Auto-tavle viser alternativet og gangen dit', () => {
    // v1.218.204: grenen fra veivalget når rutene deler stamme.
    expect(a).toMatch(/if \(_altR\) _ruter\.push\(_altR\);/);
    // v1.218.209: ingen luftlinje inn i gangtreet.
    expect(a).not.toMatch(/_ruter\.push\([^)]*\[\[userPos\.lat, userPos\.lon\]/);
  });
  it('avgangsdetaljene bygger første etappe fra stoppet du går på', () => {
    expect(s).toMatch(/let fraOver = dep\._rekkLengerNed \? dep\._rekkLengerNed\.stopp\.navn : \(dep\._fra && dep\._fra\.name\) \|\| null;/);
  });
});

import { nærMåling } from '../src/api/walkDist.js';
describe('målingen følger deg noen skritt', () => {
  const til = { lat: 59.8282, lon: 10.805 };
  const lagret = { '59.8300,10.8050>59.8282,10.8050': 280 };   // målt 200 m luftlinje → 280 m rute
  it('17 m senere: samme måling, skalert med luftlinja', () => {
    const m = nærMåling(lagret, { lat: 59.82985, lon: 10.805 }, til, 183);
    expect(m).toBeGreaterThan(250); expect(m).toBeLessThan(262);
  });
  it('mer enn 100 m unna: ingen måling', () => {
    expect(nærMåling(lagret, { lat: 59.8315, lon: 10.805 }, til, 367)).toBe(null);
  });
});

describe('luftlinje er ikke en rute (v1.218.209, Stenbråten over jordet)', () => {
  beforeEach(() => _resetGang());
  const fra = { lat: 59.85, lon: 10.83 }, stopp = { id: 'Stb', lat: 59.852, lon: 10.84 };
  const korde = () => Promise.resolve({ latlngs: [[fra.lat, fra.lon], [stopp.lat, stopp.lon]], src: 'korde', metres: null });
  it('feilet ruting (korde) lagres ikke som rute', async () => {
    await new Promise(ok => sikreGang(fra, stopp, { rute: korde, ferdig: ok }));
    expect(gangRuteTil(stopp)).toBe(null);
  });
  it('målt rute lagres', async () => {
    const pts = [[59.85, 10.83], [59.851, 10.835], [59.852, 10.84]];
    await new Promise(ok => sikreGang(fra, stopp, { rute: () => Promise.resolve({ latlngs: pts, metres: 700 }), ferdig: ok }));
    expect(gangRuteTil(stopp)).toEqual(pts);
  });
  it('prøves igjen etter et minutt, uten å måtte gå 100 m', async () => {
    let n = 0; const rute = () => { n++; return korde(); };
    await new Promise(ok => sikreGang(fra, stopp, { rute, ferdig: ok }));
    sikreGang(fra, stopp, { rute }); expect(n).toBe(1);
    const nå = Date.now; Date.now = () => nå() + 61_000;
    try { sikreGang(fra, stopp, { rute }); expect(n).toBe(2); } finally { Date.now = nå; }
  });
});
