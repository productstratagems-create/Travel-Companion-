/* TRANSPARENT SCORE (v1.218.324): ren modul, forklarbar, og standard er uendret. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { scoreOpplevelse, wikiScore, ratingScore, nærhet, risiko, trinnFor, SCORE_VEKTER } from '../src/opplevelserScore.js';
import { velgVisning, dagensRekkefølge, opplevelserVed } from '../src/opplevelser.js';
import { parseTurruter, parseFriluft, parseWikidata } from '../src/api/opplevelserKilder.js';

const sterk = [{ k: 'kultur', u: 'museum', sterk: true }], svak = [{ k: 'park', u: 'park', sterk: false }];
const o = (navn, ekstra = {}) => ({ navn, kat: sterk, hoved: ['kultur'], under: ['museum'], rute: null, sitelinks: 0, luft: 500, lat: 60, lon: 10, kilder: [{ kilde: 'wikidata', kat: sterk }, { kilde: 'osm', kat: sterk }], ...ekstra });
const rute = (navn, betydning, ekstra = {}) => o(navn, { rute: { type: 'Fotrute', betydning }, hoved: ['friluftsliv'], under: ['turrute'], kat: [{ k: 'friluftsliv', u: 'turrute', sterk: true }], ...ekstra });
const kirke = (navn, ekstra = {}) => o(navn, { under: ['kirke'], hoved: ['kultur'], kat: sterk, ...ekstra });
const kx = (ekstra = {}) => ({ gang: { kilde: 'målt', min: 8, m: 640 }, tilgang: 'mulig', avvik: [], ...ekstra });

describe('score', () => {
  it('1 nasjonal turrute rangeres over vanlig park', () => {
    const v = velgVisning([o('Park', { kat: svak, hoved: ['park'], under: ['park'] }), rute('Pilegrimsleden', '1')], 2, kx());
    expect(v[0].navn).toBe('Pilegrimsleden');
    expect(v[0].score.faktorer.kvalitet).toBe(100);
  });
  it('2 sterkt reisemål med mange sitelinks slår svakt reisemål', () => {
    const v = velgVisning([o('Svak', { kat: svak, hoved: ['park'], under: ['park'], sitelinks: 2 }), o('Sterk', { sitelinks: 20 })], 2, kx());
    expect(v[0].navn).toBe('Sterk');
  });
  it('3 nær kan slå fjernt når kvalitet er lik', () => {
    const v = velgVisning([o('Fjern', { luft: 1400, gang: null }), o('Nær', { luft: 150 })], 1, kx({ gang: null }));
    expect(v[0].navn).toBe('Nær');
  });
  it('4 enkel tilgang løfter en ellers lik opplevelse', () => {
    const a = scoreOpplevelse(o('A'), kx({ tilgang: 'enkel' })).total, b = scoreOpplevelse(o('A'), kx({ tilgang: 'krevende' })).total;
    expect(a).toBeGreaterThan(b);
    const v = velgVisning([o('A'), o('B')], 1, { ...kx(), gangFor: x => (x.navn === 'A' ? { kilde: 'målt', min: 8 } : { kilde: 'målt', min: 8 }), tilgang: 'enkel' });
    expect(v).toHaveLength(1);
  });
  it('5 manglende rating gir nøytral, ikke negativ, popularitet; rating under 3 trekker, men total blir aldri negativ', () => {
    expect(ratingScore(undefined)).toBeNull();
    const uten = scoreOpplevelse(o('A'), kx()).faktorer.popularitet, med = scoreOpplevelse(o('A'), kx({ rating: 4.0, kilde: 'google' })).faktorer.popularitet;
    expect(uten).toBeGreaterThanOrEqual(0);
    expect(med).toBeGreaterThan(uten - 1);   // 4,0 = 50 = nøytral
    expect(ratingScore(3)).toBe(0); expect(ratingScore(4)).toBe(50); expect(ratingScore(5)).toBe(100); expect(ratingScore(2)).toBe(-50);
    expect(scoreOpplevelse(kirke('K', { luft: 2000 }), kx({ rating: 1.0, avvik: ['målestopp: X'], gang: null })).total).toBeGreaterThanOrEqual(0);
  });
  it('6 manglende målt gangtid gir risiko, men fjerner ikke opplevelsen', () => {
    expect(risiko(o('A'), kx({ gang: { kilde: 'luftlinje' } }))).toBeGreaterThanOrEqual(20);
    const v = velgVisning([o('A'), o('B')], 2, kx({ gang: { kilde: 'luftlinje', luftM: 500 } }));
    expect(v.map(x => x.navn).sort()).toEqual(['A', 'B']);
  });
  it('7 høyst én turrute når andre reisemål finnes', () => {
    const v = velgVisning([rute('R1', '1'), rute('R2', '1', { luft: 100 }), o('Museum', { sitelinks: 5 })], 2, kx());
    expect(v.filter(x => x.rute)).toHaveLength(1);
    expect(v.map(x => x.navn)).toContain('Museum');
  });
  it('8 høyst én kirke eller kulturminne når andre finnes', () => {
    const v = velgVisning([kirke('K1', { sitelinks: 30 }), kirke('K2', { sitelinks: 30, lat: 60.5 }), o('Museum', { lat: 60.2 })], 2, kx());
    expect(v.filter(x => x.under[0] === 'kirke')).toHaveLength(1);
  });
  it('9 uten kontekst: nøyaktig som i dag (referanseimplementasjon på ekte fiksturer)', () => {
    const gammel = (liste, n = 2) => {
      const kirke = o => o.under.every(u => u === 'kirke' || u === 'kulturminne'), tur = o => o.rute && o.rute.type !== 'Sykkelrute';
      const trinn = o => (tur(o) && o.rute.betydning === '1') ? 0 : ((tur(o) && o.rute.betydning === '2') || (!kirke(o) && o.kat.some(t => t.sterk) && !o.rute)) ? 1 : (o.rute || o.hoved.includes('friluftsliv')) ? 2 : kirke(o) ? 4 : 3;
      const sortert = liste.slice().sort((a, b) => trinn(a) - trinn(b) || (b.sitelinks || 0) - (a.sitelinks || 0) || a.luft - b.luft), ut = [];
      for (const x of sortert) { if (ut.length >= n) break; if (x.rute && ut.some(y => y.rute) && sortert.some(y => !y.rute && !ut.includes(y) && trinn(y) < 4)) continue; ut.push(x); }
      for (const x of sortert) if (ut.length < n && !ut.includes(x)) ut.push(x);
      return ut;
    };
    for (const k of ['skogstadrampa', 'oyer', 'oppegard', 'leangen']) {
      const F = JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/' + k + '.json', 'utf8')), tr = parseTurruter(F.turrute, F.stopp);
      const liste = opplevelserVed([...tr.kandidater, ...parseFriluft(F.friluft, F.stopp), ...parseWikidata(F.wikidata)], F.stopp);
      for (const n of [1, 2, 3]) expect(velgVisning(liste, n).map(x => x.navn)).toEqual(gammel(liste, n).map(x => x.navn));
    }
    expect(velgVisning([o('A'), o('B')]).every(x => x.score === undefined)).toBe(true);   // ingen score uten kontekst
  });
  it('10 deterministisk: samme input gir samme score og forklaring; vektene summerer til 1', () => {
    const a = scoreOpplevelse(rute('R', '1', { sitelinks: 7 }), kx({ tilgang: 'enkel' })), b = scoreOpplevelse(rute('R', '1', { sitelinks: 7 }), kx({ tilgang: 'enkel' }));
    expect(a).toEqual(b);
    expect(a.forklaring).toBe('nasjonal turrute · mye omtalt · enkel tilgang · 8 min å gå');
    expect(Object.values(SCORE_VEKTER).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
  });
});

describe('delverdier og ren modul', () => {
  it('wikiScore: 0→0, 1→20, 3→40, 7→60, 15→80, 31→100', () => {
    expect([0, 1, 3, 7, 15, 31].map(wikiScore)).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it('nærhet: målt gangtid overstyrer luftlinje', () => {
    expect(nærhet({ luft: 250 }, null)).toBe(100); expect(nærhet({ luft: 1300 }, null)).toBe(20); expect(nærhet({ luft: 1600 }, null)).toBe(0);
    expect(nærhet({ luft: 250 }, { kilde: 'målt', min: 22 })).toBe(20);
  });
  it('risiko: bestilling 40, gammelt søk 30, feil målestopp eller ugyldig transport 100 — aldri en fjerning', () => {
    const m = o('A', { beskrivelse: { tekst: 'x' } });   // med beskrivelse og to kilder: ingen svake tillegg
    expect(risiko(m, { gang: { kilde: 'målt' }, reise: { bestilling: true } })).toBe(40);
    expect(risiko(m, { gang: { kilde: 'målt' }, avvik: ['søket er gammelt'] })).toBe(30);
    expect(risiko(m, { gang: { kilde: 'målt' }, avvik: ['målestopp: X'] })).toBe(100);
    expect(scoreOpplevelse(o('A'), kx({ avvik: ['transportmiddel: air'] })).total).toBeGreaterThan(0);
  });
  it('modulen er ren: ingen nettverk, DOM eller HTML; og trinnFor er den ene definisjonen', () => {
    const src = fs.readFileSync('src/opplevelserScore.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/fetch\(|document\.|window\.|innerHTML|<div|import /);
    expect(trinnFor(rute('R', '1'))).toBe(0);
    expect(typeof dagensRekkefølge).toBe('function');
  });
});
