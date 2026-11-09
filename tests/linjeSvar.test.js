// Auto-reise: bekreft eller avkreft linja, og lær av svaret.
// Bestilt: «la bruker få bekrefte eller avkrefte om din hypotese om hvilken rute denne er på
// stemmer. Lær av det bruker bekrefter.»
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { kontekst, lærSvar, svarFor, linjeSvarOversikt, glemLinjeSvar, MAKS_KONTEKSTER, SVAR_VEKT } from '../src/api/linjeSvar.js';
import { rangerKandidater } from '../src/api/ombord.js';
const { rettLinjeHtml } = await import('../src/views/auto.js');

beforeEach(() => localStorage.clear());
const MAN_8 = new Date('2026-11-09T08:10:00+01:00').getTime();   // mandag
const LØR_8 = new Date('2026-11-14T08:10:00+01:00').getTime();   // lørdag

describe('kontekst', () => {
  it('holdeplass, hverdag/helg og tre-timersblokk', () => {
    expect(kontekst('NSR:StopPlace:58228', MAN_8)).toBe('NSR:StopPlace:58228|hverdag|6');
    expect(kontekst('NSR:StopPlace:58228', LØR_8)).toBe('NSR:StopPlace:58228|helg|6');
    expect(kontekst(null, MAN_8)).toBe(null);
  });
});

describe('lærSvar', () => {
  const kx = 'A|hverdag|6';
  it('bekreftet +1, rettet +1/−1, «ingen» −1', () => {
    lærSvar(kx, { ja: ['74'] });
    lærSvar(kx, { ja: ['3'], nei: ['74'] });
    lærSvar(kx, { nei: ['3'] });
    expect(Object.fromEntries(svarFor(kx))).toEqual({ '74': 0, '3': 0 });
    lærSvar(kx, { ja: ['74'] });
    expect(svarFor(kx).get('74')).toBe(1);
  });
  it('en annen kontekst er urørt', () => {
    lærSvar(kx, { ja: ['74'] });
    expect(svarFor('B|hverdag|6').size).toBe(0);
  });
  it(`høyst ${MAKS_KONTEKSTER} kontekster, de eldste går først`, () => {
    for (let i = 0; i <= MAKS_KONTEKSTER; i++) lærSvar('S' + i + '|hverdag|6', { ja: ['1'] });
    expect(svarFor('S0|hverdag|6').size).toBe(0);
    expect(svarFor('S' + MAKS_KONTEKSTER + '|hverdag|6').get('1')).toBe(1);
  });
  it('følger profilen, slettes med alt, og vises', () => {
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.linjeSvar',");
    lærSvar(kx, { ja: ['74'] });
    expect(linjeSvarOversikt().length).toBe(1);
    lærSvar(kx, { ja: ['74'], navn: 'Mortensrud' });
    expect(linjeSvarOversikt()[0].navn).toBe('Mortensrud');
    glemLinjeSvar();
    expect(linjeSvarOversikt()).toEqual([]);
    const s = readFileSync('src/views/settings.js', 'utf8');
    expect(s).toContain('glemLinjeSvar();');
    expect(readFileSync('index.html', 'utf8')).toContain('id="mem-linjesvar"');
  });
});

describe('rangeringen', () => {
  const kand = (linje, avvik) => ({ k: { linje, call: { serviceJourney: { estimatedCalls: [] } } }, avvik });
  const k = linje => ({ linje, call: { serviceJourney: { estimatedCalls: [] } } });
  it('likt bevis: den bekreftede linja, med grunnen sagt', () => {
    const r = rangerKandidater([k('74'), k('3')], { nå: 0, svar: new Map([['3', 2]]) });
    expect(r[0].k.linje).toBe('3');
    expect(r[0].grunn).toBe('du har bekreftet denne før');
  });
  it('svarene veier tyngre enn vanen', () => {
    expect(SVAR_VEKT).toBe(2);
    const r = rangerKandidater([k('74'), k('3')], { nå: 0, linjeBruk: new Map([['74', 1]]), svar: new Map([['3', 1]]) });
    expect(r[0].k.linje).toBe('3');
  });
  it('men passerte stopp slår svarene', () => {
    const r = rangerKandidater([k('74'), k('3')], { nå: 0, svar: new Map([['3', 5]]), lang: [] });
    expect(r.length).toBe(2);
    expect(readFileSync('src/api/ombord.js', 'utf8')).toMatch(/rad\.sort\(\(a, b\) => \(b\.passert - a\.passert\)/);
  });
});

describe('«stemmer»-knappen', () => {
  const lås = kilde => ({ k: { nøkkel: 'x', linje: '74' }, kilde });
  it('for gjettet og sikker, ikke for valgt', () => {
    expect(rettLinjeHtml(lås('gjettet'), [], false, '')).toContain('class="rett-ja"');
    expect(rettLinjeHtml(lås('sikker'), [], false, '')).toContain('class="rett-ja"');
    expect(rettLinjeHtml(lås('valgt'), [], false, '')).not.toContain('class="rett-ja"');
    expect(rettLinjeHtml(lås('valgt'), [], false, '')).toContain('bekreftet av deg');
  });
});

describe('knappene lærer', () => {
  const s = readFileSync('src/views/auto.js', 'utf8');
  const kropp = navn => s.slice(s.indexOf('export function ' + navn), s.indexOf('\n}\n', s.indexOf('export function ' + navn)));
  it('«stemmer» lærer ja på den låste', () => {
    expect(kropp('_bekreftLinje')).toContain('lærSvar(_svarKx(_lås.k, Date.now()), { ja: [_lås.k.linje], navn: _svarNavn(_lås.k) });');
  });
  it('å velge en annen lærer ja på den valgte og nei på den gamle', () => {
    expect(kropp('_velgLinje')).toContain('lærSvar(_svarKx(k, Date.now()), { ja: [k.linje], nei: _lås && _lås.k.linje !== k.linje ? [_lås.k.linje] : [], navn: _svarNavn(k) });');
  });
  it('«ingen av disse» lærer nei på den låste', () => {
    expect(kropp('_ingenLinje')).toContain('lærSvar(_svarKx(_lås.k, Date.now()), { nei: [_lås.k.linje], navn: _svarNavn(_lås.k) });');
  });
  it('rangeringen får svarene for konteksten', () => {
    expect(s).toContain('svar: svarFor(_svarKx(dom.kandidater[0], nå)) });');
  });
});
