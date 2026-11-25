/* HVOR LANGT (v1.218.308): lokalt · regionalt · nasjonalt utenpå kategoriene. */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { rekkeviddeFor, regionAv, tellRekkevidde } from '../src/rekkevidde.js';
import { ettBytteHtml, _nullstillEttBytte, settRekkevidde, ettBytteRekkevidde } from '../src/views/ettBytteVisning.js';
import { harRekkevidde, rekkeviddeRadHtml, endestopp } from '../src/views/auto.js';
import { metresBetween } from '../src/haversine.js';
import { SCENARIOER, lastOpptak, avspiller } from './fixtures/entur/avspilling.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sted = (lat, lon, kommune, fylke) => ({ lat, lon, kommune, fylke });
const MORTENSRUD = sted(59.8494, 10.8296, 'Oslo', 'Oslo');

describe('rekkeviddeFor — kommune og fylke', () => {
  it('Oslo: Lillestrøm og Eidsvoll regionalt, Drammen og Moss regionalt (under 120 km), Lillehammer nasjonalt', () => {
    expect(rekkeviddeFor(MORTENSRUD, sted(59.7195, 10.8355, 'Nordre Follo', 'Akershus')).r).toBe('lokalt'); // Ski, 14 km: nabokommune
    expect(rekkeviddeFor(MORTENSRUD, sted(60.33, 11.26, 'Eidsvoll', 'Akershus')).r).toBe('regionalt');
    expect(rekkeviddeFor(MORTENSRUD, sted(59.744, 10.204, 'Drammen', 'Buskerud')).r).toBe('regionalt');
    expect(rekkeviddeFor(MORTENSRUD, sted(59.434, 10.658, 'Moss', 'Østfold')).r).toBe('regionalt');
    expect(rekkeviddeFor(MORTENSRUD, sted(59.9550, 11.0490, 'Lillestrøm', 'Akershus')).r).toBe('regionalt');
    expect(rekkeviddeFor(MORTENSRUD, sted(61.1150, 10.4660, 'Lillehammer', 'Innlandet')).r).toBe('nasjonalt');
    expect(regionAv('Vestland')).toBe('vestland');
  });
  it('samme kommune er lokalt; nabokommune under 15 km i samme region er lokalt', () => {
    expect(rekkeviddeFor(MORTENSRUD, sted(59.95, 10.75, 'Oslo', 'Oslo')).r).toBe('lokalt');
    expect(rekkeviddeFor(MORTENSRUD, sted(59.835, 10.90, 'Nordre Follo', 'Akershus')).r).toBe('lokalt'); // ca. 4 km
  });
  it('utenfor Oslo: fylket er regionen (Bergen → Voss regionalt, Bergen → Oslo nasjonalt)', () => {
    const bergen = sted(60.39, 5.32, 'Bergen', 'Vestland');
    expect(rekkeviddeFor(bergen, sted(60.63, 6.42, 'Voss', 'Vestland')).r).toBe('regionalt');
    expect(rekkeviddeFor(bergen, sted(59.91, 10.75, 'Oslo', 'Oslo')).r).toBe('nasjonalt');
    // Samme fylke langt unna er regionalt: Tromsø → Harstad (Troms, ca. 170 km).
    expect(rekkeviddeFor(sted(69.65, 18.96, 'Tromsø', 'Troms'), sted(68.80, 16.54, 'Harstad', 'Troms')).r).toBe('regionalt');
    const tretten = sted(61.32, 10.30, 'Øyer', 'Innlandet');
    expect(['lokalt', 'regionalt']).toContain(rekkeviddeFor(tretten, sted(61.115, 10.466, 'Lillehammer', 'Innlandet')).r);
  });
  it('uten kommune: anslått etter luftlinje, og det sies; uten posisjon: ukjent', () => {
    expect(rekkeviddeFor(MORTENSRUD, sted(61.115, 10.466, null, null))).toEqual({ r: 'nasjonalt', anslått: true });
    expect(rekkeviddeFor(MORTENSRUD, { lat: NaN, lon: NaN }).r).toBe('ukjent');
    expect(tellRekkevidde([{ r: 'lokalt', anslått: false }, { r: 'nasjonalt', anslått: true }, { r: 'ukjent', anslått: false }]))
      .toEqual({ lokalt: 1, regionalt: 0, nasjonalt: 1, ukjent: 1, anslått: 1 });
  });
});

describe('raden «hvor langt» på Auto-tavla', () => {
  it('bare for kategoriene som oppdager muligheter, ikke for reiseoppgavene', () => {
    expect(harRekkevidde('alle')).toBe(true);
    expect(harRekkevidde('bytte')).toBe(false);   // «ett bytte unna» rangerer fra nær til langt i stedet (v1.218.320)
    expect(harRekkevidde('omr:NØ')).toBe(true);
    expect(harRekkevidde('mot')).toBe(false);
    expect(harRekkevidde('hjem')).toBe(false);
  });
  it('knapp per rekkevidde med tallet; tom er dempet; anslått sies', () => {
    const h = rekkeviddeRadHtml('regionalt', { lokalt: 18, regionalt: 9, nasjonalt: 0, ukjent: 0, anslått: 3 });
    expect(h).toContain('data-rekkevidde="regionalt" aria-pressed="true"');
    expect(h).toMatch(/nært<small class="omr-linjer">18/);
    expect(h).toMatch(/at-tom" data-rekkevidde="nasjonalt"/);
    expect(h).toContain('3 anslått etter avstand');
    expect(rekkeviddeRadHtml(null, null)).toBe('');
  });
  it('endestoppet er siste kall på turen', () => {
    const call = { serviceJourney: { estimatedCalls: [{ quay: { stopPlace: { id: 'A', latitude: 1, longitude: 2 } } }, { quay: { stopPlace: { id: 'B', latitude: 3, longitude: 4 } } }] } };
    expect(endestopp(call)).toEqual({ id: 'B', lat: 3, lon: 4 });
    expect(endestopp({})).toBeNull();
  });
});

describe('ett bytte med rekkevidde (opptakene)', () => {
  beforeEach(() => _nullstillEttBytte());
  for (const n of SCENARIOER.filter(n => /_dag$/.test(n))) {
    it(n + ': tellingen summerer til alle stedene; et valg viser bare steder i den rekkevidden', async () => {
      const O = lastOpptak(n), pos = O.scenario.posisjon, nå = Date.parse(O.scenario.tid), hent = avspiller(O).hent;
      ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} });
      await new Promise(r => setTimeout(r, 80));
      const t = ettBytteRekkevidde();
      if (!t) return; // opptaket har ingen bytter
      const alle = t.lokalt + t.regionalt + t.nasjonalt + t.ukjent;
      expect(alle).toBeGreaterThan(0);
      expect(t.anslått).toBe(alle - t.ukjent); // uten kommunedata: alt er anslått, og det sies
      settRekkevidde('nasjonalt');
      const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} });
      if (!t.nasjonalt) expect(html).toMatch(/ingen steder i denne rekkevidden/);
      else expect(html).toMatch(/eb-rad/);
    });
  }
  it('Mortensrud med kommuner: alt er avgjort av kommune og fylke (ingen anslått); bare steder over 120 km er nasjonale', async () => {
    const O = lastOpptak('mortensrud_dag'), pos = O.scenario.posisjon, nå = Date.parse(O.scenario.tid), hent = avspiller(O).hent;
    // Alt i «Akershus» (fylket er feil for utlandet med vilje): da kan bare avstanden gjøre et sted nasjonalt.
    const hentKommuner = async ider => ({ kommuneAv: new Map(ider.map(id => [id, 'Et sted'])), fylkeAv: new Map(ider.map(id => [id, 'Akershus'])), hjemme: 'Oslo', hjemFylke: 'Oslo' });
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner, rerender: () => {} });
    await new Promise(r => setTimeout(r, 250));
    const t = ettBytteRekkevidde();
    expect(t.anslått).toBe(0);
    expect(t.lokalt).toBeGreaterThan(0); expect(t.regionalt).toBeGreaterThan(0);
    settRekkevidde('nasjonalt');
    const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner, rerender: () => {} });
    const km = [...html.matchAll(/ · (\d+) km/g)].map(m => Number(m[1]));
    expect(km.length).toBeGreaterThan(0);
    expect(Math.min(...km)).toBeGreaterThanOrEqual(120); // «helt til … · N km» på hvert kort
  });
});

describe('auto.js: raden står under kategoriene, og filteret går på endestoppet', () => {
  const src = readFileSync('src/views/auto.js', 'utf8');
  it('kilden', () => {
    expect(src).toContain("(harRekkevidde(_atRetning) ? rekkeviddeRadHtml(_rekkevidde, rekkeTall) : '')");
    expect(src).toMatch(/const med = x => x\.rekkevidde\.r === _rekkevidde; del\.ikke = del\.ikke\.filter\(med\); del\.rekker = del\.rekker\.filter\(med\);/);
  });
});
