/* GPS-FIKSTAKT (#809, v1.218.333): diagnostisk måling. Konstruerte sekvenser — ikke ekte GPS. pos.timestamp er IKKE validert på ekte iOS/Android. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';

const lager = new Map();
const setSpy = vi.fn();
vi.mock('../src/storage.js', () => ({ storage: { get: k => (lager.has(k) ? lager.get(k) : null), set: (k, v) => { setSpy(k, v); lager.set(k, v); }, remove: k => { lager.delete(k); } } }));

import { registrerFiks, fikstaktStatistikk, fikstaktRader, slettFikstakt, pruneFikstakt, skrivFikstakt, oppdaterFikstaktSamtykke, _nullstillFikstaktMinne, FIKSTAKT_FELT, KANTER_S, AVBRUDD_S, BEHOLD_DAGER } from '../src/api/fikstakt.js';

const NÅ = new Date(2026, 10, 20, 12, 0, 0).getTime();
const pos = (ts, lat = 59.91234, lon = 10.75678) => ({ coords: { latitude: lat, longitude: lon, accuracy: 8, speed: 1.2, heading: 90 }, timestamp: ts });
const slå = (på) => { lager.set('t.memoryConsent', på ? '1' : '0'); oppdaterFikstaktSamtykke(); };
const kjør = (n, stegMs, start = NÅ, alder = 200) => { for (let i = 0; i < n; i++) { const t = start + i * stegMs; registrerFiks(pos(t - alder), t); } return start + (n - 1) * stegMs; };

beforeEach(() => { lager.clear(); setSpy.mockClear(); _nullstillFikstaktMinne(); vi.useFakeTimers(); vi.setSystemTime(NÅ); });
afterEach(() => { vi.useRealTimers(); });

describe('samtykke og porter', () => {
  it('AV som standard: ingenting registreres eller lagres', () => {
    kjør(50, 1000); skrivFikstakt();
    expect(fikstaktStatistikk(NÅ + 60_000).antallFikser).toBe(0);
    expect(lager.has('t.fikstakt')).toBe(false);
  });
  it('testposisjon sperrer målingen (syntetiske fikser skal ikke telles)', () => {
    lager.set('t.testPos', JSON.stringify({ navn: 'Oslo S', lat: 59.9, lon: 10.7 })); slå(true);
    kjør(30, 1000);
    expect(fikstaktStatistikk(NÅ + 60_000).antallFikser).toBe(0);
  });
  it('tilbaketrekking stopper målingen OG sletter lagrede data', () => {
    slå(true); kjør(30, 1000); skrivFikstakt();
    expect(lager.has('t.fikstakt')).toBe(true);
    lager.set('t.memoryConsent', '0'); oppdaterFikstaktSamtykke(); slettFikstakt();
    expect(lager.has('t.fikstakt')).toBe(false);
    kjør(30, 1000, NÅ + 100_000); skrivFikstakt();
    expect(fikstaktStatistikk(NÅ + 200_000).antallFikser).toBe(0);
    expect(lager.has('t.fikstakt')).toBe(false);
  });
});

describe('målingene', () => {
  it('1 Hz: leveringsintervall ≈ 1 s (bøtte [1; 1,25)), snitt/min/maks eksakte, alder ≈ 0,2 s', () => {
    slå(true); kjør(30, 1000);
    const s = fikstaktStatistikk(NÅ + 60_000), l = s.leveringsintervall;
    expect(s.antallFikser).toBe(30); expect(l.n).toBe(29);
    expect(l.snittSek).toBe(1); expect(l.minSek).toBe(1); expect(l.maksSek).toBe(1);
    expect(l.medianSek).toEqual({ fra: 1, til: 1.25 });
    expect(l.over5).toBe(0);
    expect(s.alderVedLevering.medianSek).toEqual({ fra: 0, til: 0.25 });   // alderen er 0,2 s
    expect(s.fikstidsintervall.n).toBe(29);
  });
  it('12-fikser-spennet og antall siste 60 s: 12 fikser ved 5 s takt spenner 55 s; ved 1 s 11 s', () => {
    slå(true); kjør(40, 5000);
    let s = fikstaktStatistikk(NÅ + 300_000);
    expect(s.tolvSisteFikser.andelSomSpennerMinst['30s']).toBe(1); expect(s.tolvSisteFikser.andelSomSpennerMinst['60s']).toBe(0);
    _nullstillFikstaktMinne(); lager.clear(); slå(true); kjør(80, 1000);
    s = fikstaktStatistikk(NÅ + 300_000);
    expect(s.tolvSisteFikser.andelSomSpennerMinst['10s']).toBe(1); expect(s.tolvSisteFikser.andelSomSpennerMinst['20s']).toBe(0);
    expect(s.fikserSiste60s.andelMedMinst['30']).toBeGreaterThan(0.5);
  });
  it('gjentatt, bakover og fremtidig tidsstempel telles', () => {
    slå(true);
    registrerFiks(pos(NÅ - 1000), NÅ); registrerFiks(pos(NÅ - 1000), NÅ + 1000);   // gjentatt
    registrerFiks(pos(NÅ - 5000), NÅ + 2000);                                       // bakover
    registrerFiks(pos(NÅ + 9000), NÅ + 3000);                                       // fremtid (> 1 s)
    const s = fikstaktStatistikk(NÅ + 10_000);
    expect(s.gjentatteFikstidsstempler).toBe(1); expect(s.tidsstempelBakover).toBe(1); expect(s.tidsstempelIFremtiden).toBe(1);
  });
  it('lange intervaller telles over 5/10/30 s', () => {
    slå(true); registrerFiks(pos(NÅ), NÅ); registrerFiks(pos(NÅ + 6000), NÅ + 6000); registrerFiks(pos(NÅ + 17000), NÅ + 17000); registrerFiks(pos(NÅ + 50000), NÅ + 50000);
    const l = fikstaktStatistikk(NÅ + 60_000).leveringsintervall;
    expect([l.over5, l.over10, l.over30]).toEqual([3, 2, 1]);
  });
});

describe('bakgrunn og avbrudd: aldri et kunstig langt intervall', () => {
  it('gap over 120 s er et avbrudd, ikke et intervall; første fiks etter er nytt utgangspunkt', () => {
    slå(true); registrerFiks(pos(NÅ), NÅ); registrerFiks(pos(NÅ + 1000), NÅ + 1000);
    registrerFiks(pos(NÅ + 400_000), NÅ + 400_000);   // 400 s senere
    registrerFiks(pos(NÅ + 401_000), NÅ + 401_000);
    const s = fikstaktStatistikk(NÅ + 500_000);
    expect(s.oppholdOver120s).toBe(1); expect(s.leveringsintervall.n).toBe(2);   // to ekte intervaller (1 s og 1 s)
    expect(s.leveringsintervall.maksSek).toBe(1);
  });
  it('skjult → synlig nullstiller utgangspunktet (første fiks etter retur gir ikke intervall)', () => {
    slå(true); kjør(5, 1000);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
    registrerFiks(pos(NÅ + 20_000), NÅ + 20_000);   // 16 s etter forrige — men nytt utgangspunkt
    expect(fikstaktStatistikk(NÅ + 60_000).leveringsintervall.n).toBe(4);   // bare de fire fra før; 16 s-gapet er ikke med
  });
});

describe('lagring: ikke i callbacken, hviteliste, dataminimering, 7 døgn', () => {
  it('ingen lagring under registrering; skrives ved skjult side og etter FLUSH_MS', () => {
    slå(true); setSpy.mockClear(); kjør(50, 1000);
    expect(setSpy).not.toHaveBeenCalled();                               // aldri synkron lagring i GPS-veien
    vi.advanceTimersByTime(61_000);
    expect(setSpy).toHaveBeenCalledWith('t.fikstakt', expect.any(String));
  });
  it('lagret JSON: nøkler ⊆ FIKSTAKT_FELT, ingen koordinater, ingen epoch-tidspunkt, ingen hastighet/kurs', () => {
    slå(true); kjør(30, 1000, NÅ); skrivFikstakt();
    const rå = lager.get('t.fikstakt'), lagret = JSON.parse(rå);
    for (const d of lagret.dager) for (const k of Object.keys(d)) expect(Object.keys(FIKSTAKT_FELT), k).toContain(k);
    for (const forbudt of ['59.91234', '10.75678', String(NÅ), String(NÅ - 200), 'latitude', 'longitude', 'speed', 'heading', 'lat"', 'lon"']) expect(rå, forbudt).not.toContain(forbudt);
    expect(lagret.dager[0].dag).toMatch(/^\d{4}-\d{2}-\d{2}$/);             // bare dato
  });
  it('eksport: ingen posisjonsfelt og ingen eksakte tidspunkt; merknader sier forgrunn og at pos.timestamp ikke er validert', () => {
    slå(true); kjør(30, 1000);
    const s = fikstaktStatistikk(NÅ + 60_000), json = JSON.stringify(s);
    const nøkler = []; (function gå(o) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { nøkler.push(k); gå(v); } })(s);
    for (const k of nøkler) expect(k).not.toMatch(/^(lat|lon|latitude|longitude|koordinat|posisjon|speed|heading|hastighet|kurs|stopp|rute)/i);
    expect(json).not.toContain(String(NÅ));
    expect(s.merknader.join(' ')).toMatch(/FORGRUNNEN/); expect(s.merknader.join(' ')).toMatch(/pos\.timestamp er ikke validert på faktiske iOS- og Android/);
  });
  it('7 døgn og høyst 7 døgnposter: eldre slettes ved skriving og lesing', () => {
    const d = i => new Date(NÅ - i * 86_400_000), nøkkel = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const dager = Array.from({ length: 12 }, (_, i) => ({ dag: nøkkel(d(i)), n: 1 }));
    const kept = pruneFikstakt(dager, NÅ);
    expect(kept).toHaveLength(BEHOLD_DAGER); expect(kept.map(x => x.dag)).not.toContain(nøkkel(d(8)));
    expect(kept.map(x => x.dag)).toContain(nøkkel(d(6))); expect(kept.map(x => x.dag)).not.toContain(nøkkel(d(7)));
  });
  it('lagringsfeil svelges: målingen går tapt, ingenting kaster', () => {
    slå(true); setSpy.mockImplementation(() => { throw new Error('quota'); });
    expect(() => { kjør(30, 1000); vi.advanceTimersByTime(61_000); skrivFikstakt(); }).not.toThrow();
    setSpy.mockReset();
  });
});

describe('synlig i innstillinger: alt som lagres vises', () => {
  it('en rad per felt i FIKSTAKT_FELT, og alle lagrede felt har en rad', () => {
    slå(true); kjør(30, 1000); skrivFikstakt();
    const rader = fikstaktRader(NÅ + 60_000), felt = rader.map(r => r.felt);
    expect(felt.sort()).toEqual(Object.keys(FIKSTAKT_FELT).sort());
    for (const k of Object.keys(JSON.parse(lager.get('t.fikstakt')).dager[0])) expect(felt).toContain(k);
    expect(rader.find(r => r.felt === 'n').verdi).toBe('30');
  });
  it('KANTER_S er stigende og inneholder 5, 10, 20, 30, 60 (grensene som rapporteres er eksakte); AVBRUDD_S = 120', () => {
    expect([...KANTER_S].sort((a, b) => a - b)).toEqual([...KANTER_S]);
    for (const x of [5, 10, 20, 30, 60]) expect(KANTER_S).toContain(x);
    expect(AVBRUDD_S).toBe(120);
  });
});

describe('isolasjon', () => {
  it('fikstakt.js importerer bare storage, consent og testPos; bare geo.js og settings.js importerer den', () => {
    const kilde = fs.readFileSync('src/api/fikstakt.js', 'utf8');
    expect([...kilde.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]).sort()).toEqual(['../storage.js', './consent.js', './testPos.js']);
    const ALLE = fs.readdirSync('src', { recursive: true }).filter(f => String(f).endsWith('.js')).map(f => 'src/' + f);
    expect(ALLE.filter(f => f !== 'src/api/fikstakt.js' && /fikstakt\.js/.test(fs.readFileSync(f, 'utf8'))).sort()).toEqual(['src/geo.js', 'src/views/settings.js']);
  });
});

describe('innstillinger og personvern', () => {
  it('raden finnes i index.html, og samtykketilbaketrekking og «slett alt» stopper og sletter målingen (kilde)', () => {
    const html = fs.readFileSync('index.html', 'utf8'), set = fs.readFileSync('src/views/settings.js', 'utf8');
    for (const id of ['mem-fikstakt', 'fikstakt-kopier', 'fikstakt-slett']) expect(html).toContain('id="' + id + '"');
    expect(set).toContain('oppdaterFikstaktSamtykke(); if (!on) slettFikstakt();');   // renderMemory kjøres ved hver samtykkeendring: stopp og slett
    expect(set).toContain('glemProfil(); slettFikstakt();');                                    // «slett alt appen husker»
    expect(set).toContain("JSON.stringify(fikstaktStatistikk(Date.now()), null, 1)");
  });
  it('personvernsiden sier: bare tellere, ingen posisjoner/klokkeslett, sju døgn, samme bryter', () => {
    const p = fs.readFileSync('public/privacy.html', 'utf8');
    expect(p).toMatch(/GPS-takt \(måling\)/); expect(p).toMatch(/bare tellere per døgn/); expect(p).toMatch(/ingen posisjoner, ingen klokkeslett/);
  });
});
