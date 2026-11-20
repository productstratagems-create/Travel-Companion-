// v1.218.173: beste holdeplass også i Rute — samme henting som Auto-reise,
// og ruta byttes aldri av seg selv.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { startGåHitSøk, ruteRåd, ruteMedStopp, ruteMål } from '../src/gaaHit.js';

const avstand = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 55800);
const POS = { lat: 59.91, lon: 10.75 };
const RÅD = { stoppNavn: 'Lofsrud', stoppId: 'B', lat: 59.912, lon: 10.75, gangMin: 4, linje: '76', mot: 'Jernbanetorget', går: 0, framme: 0, bytter: 0 };
const DIR = { key: 'custom-out', from: 'Hauketo', stopId: 'A', to: 'Jernbanetorget', toStopId: 'J', via: 'X', _fromLat: 1, _fromLon: 2 };

describe('ruteRåd: fem setninger, ikke én', () => {
  it('leter, feil, ingen', () => {
    expect(ruteRåd(null, POS, DIR, avstand).kind).toBe('leter');
    expect(ruteRåd({ henter: true }, POS, DIR, avstand).kind).toBe('leter');
    expect(ruteRåd({ feil: true }, POS, DIR, avstand).kind).toBe('feil');
    expect(ruteRåd({ råd: null, pos: POS }, POS, DIR, avstand).kind).toBe('ingen');
  });
  it('rådet er rutas eget stopp: «ditt»', () => {
    expect(ruteRåd({ råd: { ...RÅD, stoppId: 'A' }, pos: POS }, POS, DIR, avstand).kind).toBe('ditt');
  });
  it('rådet er et annet stopp: «annet» — før-bildet: i dag sier Rute ingenting om B', () => {
    const v = ruteRåd({ råd: RÅD, pos: POS }, POS, DIR, avstand);
    expect(v.kind).toBe('annet'); expect(v.råd.stoppId).toBe('B');
  });
  it('søk fra et annet sted gjelder ikke her', () => {
    expect(ruteRåd({ råd: RÅD, pos: { lat: 60.39, lon: 5.32 } }, POS, DIR, avstand).kind).toBe('leter');
  });
});

describe('ruta byttes bare ved trykk', () => {
  it('ruteMedStopp lager ny rute og lar den gamle stå', () => {
    const ny = ruteMedStopp(DIR, RÅD);
    expect(ny).toMatchObject({ from: 'Lofsrud', stopId: 'B', _fromLat: 59.912, to: 'Jernbanetorget', toStopId: 'J', via: 'X' });
    expect(DIR.stopId).toBe('A');
  });
  it('board.js bytter ruta bare i klikket på «bruk dette stoppet»', () => {
    const src = readFileSync('src/views/board.js', 'utf8');
    const kall = src.match(/_byttRute\(ruteMedStopp/g) || [];
    expect(kall.length).toBe(1);
    expect(src).toMatch(/bruk\.addEventListener\('click', \(\) => \{\s*if \(!window\._byttRute\) return;[\s\S]{0,200}window\._byttRute\(ruteMedStopp\(dir, v\.råd\)/);
  });
});

describe('ruteMål', () => {
  it('stopp-id først, ellers koordinater, ellers ingenting', () => {
    expect(ruteMål(DIR)).toEqual({ id: 'J', til: 'J', navn: 'Jernbanetorget' });
    expect(ruteMål({ to: 'Aker brygge', _toLat: 59.91, _toLon: 10.73 }).til).toEqual({ lat: 59.91, lon: 10.73 });
    expect(ruteMål({ to: 'x' })).toBe(null);
  });
});

describe('startGåHitSøk: én henting for begge skjermer', () => {
  it('søker én gang, og ikke igjen på samme sted', async () => {
    const cache = new Map(); let n = 0;
    const hent = () => { n++; return Promise.resolve([]); };
    startGåHitSøk(cache, { id: 'J', til: 'J' }, POS, 1000, { hent, avstand });
    await new Promise(r => setTimeout(r, 0));
    expect(startGåHitSøk(cache, { id: 'J', til: 'J' }, POS, 2000, { hent, avstand })).toBe(null);
    expect(n).toBe(1);
  });
  it('budsjettet kan si nei', () => {
    expect(startGåHitSøk(new Map(), { id: 'J', til: 'J' }, POS, 0, { hent: () => [], tillat: () => false, avstand })).toBe(null);
  });
  it('Auto-reise og Rute bruker den samme', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/startGåHitSøk\(_gåHit,/);
    expect(readFileSync('src/views/board.js', 'utf8')).toMatch(/startGåHitSøk\(_ruteGåHit,/);
  });
});

describe('ett bytte, én dør (v1.218.174)', () => {
  it('byttRute gjør alle fire: rute, overskrift, avganger, tavle', () => {
    const nav = readFileSync('src/ui/nav.js', 'utf8');
    expect(nav).toMatch(/export function byttRute\(dir, opts\) \{\s*setActiveRoute\(dir, opts\);\s*updateHeader\(\);\s*state\.deps = \[\];\s*if \(window\._startBoard\) window\._startBoard\(\);/);
  });
});

describe('ikke i fart (v1.218.174)', () => {
  it('Rute-kortet spør gangGjelder før det viser knappen eller søker', () => {
    const src = readFileSync('src/views/board.js', 'utf8');
    const i = src.indexOf('function renderRuteGåHit');
    const del = src.slice(i, src.indexOf('startGåHitSøk(_ruteGåHit', i));
    expect(del).toMatch(/if \(!gangGjelder\(fartNå\(\), false\)\) \{/);
  });
});

import { rådMotEget, BEDRE_MIN } from '../src/gaaHit.js';
describe('«bedre» må være bedre (v1.218.175)', () => {
  const T = Date.UTC(2026, 10, 20, 17, 0), M = 60_000;
  it('skjermbildets tilfelle: 18 min gange til Ljabru, framme 18:06, mot ditt stopp framme 18:04 → ditt', () => {
    expect(rådMotEget({ framme: T + 66 * M, gangMin: 18 }, { framme: T + 64 * M })).toBe('ditt');
  });
  it('5 min tidligere: bedre; 1 min: likt; terskelen er BEDRE_MIN', () => {
    expect(rådMotEget({ framme: T }, { framme: T + 5 * M })).toBe('bedre');
    expect(rådMotEget({ framme: T }, { framme: T + 1 * M })).toBe('likt');
    expect(rådMotEget({ framme: T }, { framme: T + BEDRE_MIN * M })).toBe('bedre');
  });
  it('uten eget alternativ: ukjent, aldri bedre', () => {
    expect(rådMotEget({ framme: T }, null)).toBe('ukjent');
    expect(rådMotEget({ framme: NaN }, { framme: T })).toBe('ukjent');
  });
  it('«raskere herfra» står bare i bedre-grenen, og kartet tegner ikke et dårligere råd', () => {
    const src = readFileSync('src/views/board.js', 'utf8');
    expect((src.match(/raskere herfra/g) || []).length).toBe(1);
    expect(src).toMatch(/else if \(dom === 'bedre'\) html = '<span class="rute-gaa-tekst">\\u\{1F6B6\} <strong>raskere herfra:/);
    expect(src).not.toMatch(/bedre herfra/);
    expect(src).toMatch(/const visNå = v\.kind === 'annet' && \(dom === 'bedre' \|\| dom === 'likt'\) \? v\.råd : null;/);
    expect(src).toMatch(/dom = v\.kind === 'ditt' \? 'ditt' : rådMotEget\(r, egen\);/);
  });
});
