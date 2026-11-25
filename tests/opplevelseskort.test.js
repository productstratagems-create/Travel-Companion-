/* OPPLEVELSESKORT I «ETT BYTTE» (v1.218.314) — docs/tracer-opplevelser.md §18.
 * Reiseplanene er ekte: det innspilte reisesøket fra Mortensrud (samme
 * spørring som ett bytte bruker) og Skogstadrampa/Tretten 25.11 (ingen
 * kollektivreise kl. 10, gange 3,4 km, bestillingstransport om kvelden). */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { lastOpptak, avspiller } from './fixtures/entur/avspilling.js';
import { reiseRader } from '../src/reiseTil.js';
import { reiseTilStoppet, grunnlag, gangFraStopp, samletTid, tilgang, TILGANG_GRENSER, søkTekst, kortData, velgVisning, opplevelserVed, innganger, aktiviteter, INNGANGER } from '../src/opplevelser.js';
import { parseGangHeleVeien, parseTurruter, parseFriluft, parseWikidata } from '../src/api/opplevelserKilder.js';
import { ettBytteHtml, _nullstillEttBytte, velgRetning, _settOpplevelseKilder, opplevelsePrikker, velgOpplevelse, valgtOpplevelse, ingenReiseTekst, kortFor } from '../src/views/ettBytteVisning.js';

const RS = lastOpptak('mortensrud_dag.reisesok').opptak['reisesøk'];
const TP = RS.svar.data.t1.tripPatterns;                     // til Furuset skole (NSR:StopPlace:5620)
const FURUSET = { id: 'NSR:StopPlace:5620', navn: 'Furuset skole' };
const SØKT = Date.parse('2026-11-24T10:58:00Z');
const SK = JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/skogstadrampa-reise.json', 'utf8'));
const oppslag = (o = {}) => ({ status: 'ok', søkt: SØKT, fra: { lat: 59.8487, lon: 10.8291 }, tps: TP, ...o });
const plan = () => reiseRader(TP, SØKT, null).find(r => r.type === 'kollektiv');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

describe('kollektivtransport', () => {
  it('reisen til stoppet: ankomst er siste etappes faktiske ankomst, ikke start + varighet', () => {
    const p = plan(), r = reiseTilStoppet(p.tp), legs = p.tp.legs;
    expect(r.framme).toBe(Date.parse(legs[legs.length - 1].expectedEndTime));
    expect(r.går).toBe(Date.parse(legs[0].expectedStartTime));
    expect(r.moduser.every(m => m !== 'foot')).toBe(true);
  });
  it('bytter = kollektive etapper − 1; gange mellom etapper teller ikke', () => {
    const tp = TP[0];   // foot, metro, foot, bus
    expect(tp.legs.map(l => l.mode)).toEqual(['foot', 'metro', 'foot', 'bus']);
    expect(reiseTilStoppet(tp).bytter).toBe(1);
  });
  it('fly avvises: en etappe utenfor reisesøkets transportmidler gir avvik og ingen reiseverdi', () => {
    const p = plan(), fly = { ...p, tp: { ...p.tp, legs: p.tp.legs.map((l, i) => (l.mode !== 'foot' && i === 1 ? { ...l, mode: 'air' } : l)) } };
    const g = grunnlag(oppslag(), FURUSET, fly, gangFraStopp(null, 300), SØKT + 60_000);
    expect(g.reise).toBeNull();
    expect(g.avvik.join()).toMatch(/transportmiddel: air/);
  });
  it('bestillingstransport (ekte: linje 5031, mode taxi) merkes — aldri som buss, og tilgangen blir «ukjent»', () => {
    const tp = SK.bestilling.data.trip.tripPatterns[0];
    const r = reiseTilStoppet(tp);
    expect(r.bestilling).toBe(true);
    expect(tilgang(r, { kilde: 'målt', min: 5, m: 400 }).ord).toBe('ukjent');
    const k = kortData({ navn: 'X', hoved: ['natur'], under: ['vann'], kat: [], kilder: [], luft: 100 }, { reise: r, gang: { kilde: 'målt', min: 5, m: 400 }, avvik: [] });
    expect(k.reise.bestilling).toBe(true);
  });
});

describe('datagrunnlaget (presisering 5)', () => {
  it('startpunkt, søketidspunkt, plan og gangmåling går gjennom kontrollen', () => {
    const pl = plan(), g = grunnlag(oppslag(), FURUSET, pl, gangFraStopp({ m: 450, min: 6 }, 300), SØKT + 60_000);
    expect(g.ok).toBe(true);
    expect(g.plan).toBe(pl);                                     // samme valgte reiseplan som reiseraden
    expect(g.fra).toEqual({ lat: 59.8487, lon: 10.8291 });
    expect(g.søkt).toBe(SØKT);
    expect(g.gang.kilde).toBe('målt');
  });
  it('planen ender ved et annet stopp: avvik «målestopp», ingen reiseverdi', () => {
    const g = grunnlag(oppslag(), { id: 'NSR:StopPlace:1', navn: 'Et annet sted' }, plan(), gangFraStopp(null, 300), SØKT);
    expect(g.reise).toBeNull();
    expect(g.avvik.join()).toMatch(/målestopp: Furuset skole/);
  });
  it('søket er eldre enn 10 min: avvik', () => {
    expect(grunnlag(oppslag(), FURUSET, plan(), gangFraStopp(null, 1), SØKT + 11 * 60_000).avvik).toContain('søket er gammelt');
  });
  it('startpunkt og søketidspunkt mangler: avvik, ikke gjetning', () => {
    const g = grunnlag(oppslag({ fra: null, søkt: undefined }), FURUSET, plan(), gangFraStopp(null, 1), SØKT);
    expect(g.avvik).toEqual(expect.arrayContaining(['startpunkt mangler', 'søketidspunkt mangler']));
  });
});

describe('gange og framme ca. (presisering 2)', () => {
  it('målt gange: «N min»; luftlinje: «ca. N m» og aldri gangtid', () => {
    expect(gangFraStopp({ m: 900, min: 11 }, 620)).toEqual({ kilde: 'målt', min: 11, m: 900 });
    expect(gangFraStopp(null, 620)).toEqual({ kilde: 'luftlinje', luftM: 620 });
    const k = kortData({ navn: 'X', hoved: [], under: [], kat: [], kilder: [], luft: 620 }, null);
    expect(k.gang).toEqual({ tekst: 'ca. 600 m', type: 'luftlinje' });
    expect(kortData({ navn: 'X', hoved: [], under: [], kat: [], kilder: [], luft: 0 }, null).gang.tekst).toBe('ved stoppet'); // ikke «ca. 0 m»
    expect(kortData({ navn: 'X', hoved: ['park'], under: ['park'], kat: [], kilder: [], luft: 10, beskrivelse: { tekst: 'park', språk: 'en' } }, null).beskrivelse).toBeNull();
  });
  it('framme ca. = planens ankomst + målt gange, rundet opp; luftlinje, avvik eller manglende reise gir ingen samlet tid', () => {
    const g = grunnlag(oppslag(), FURUSET, plan(), gangFraStopp({ m: 450, min: 6 }, 300), SØKT + 60_000);
    const t = samletTid(g);
    expect(t.omtrent).toBe(true);
    expect(t.framme).toBe(Math.ceil((g.reise.framme + 6 * 60_000) / 60_000) * 60_000);
    expect(samletTid({ ...g, gang: gangFraStopp(null, 300) })).toBeNull();
    expect(samletTid({ ...g, reise: null })).toBeNull();
    expect(samletTid(grunnlag(oppslag(), { id: 'NSR:StopPlace:1', navn: 'Annet' }, plan(), gangFraStopp({ m: 1, min: 1 }, 1), SØKT))).toBeNull();
  });
  it('teksten sier «framme ca.»; ingen sammenlagt antall minutter', () => {
    const g = grunnlag(oppslag(), FURUSET, plan(), gangFraStopp({ m: 450, min: 6 }, 300), SØKT + 60_000);
    const k = kortData({ navn: 'X', hoved: ['natur'], under: ['vann'], kat: [], kilder: [], luft: 300 }, g);
    expect(k.framme).toMatch(/^framme ca\. \d\d\.\d\d$/);
    expect(k.reise.tekst).toMatch(/^\d+ min · /);   // reise til stoppet, ikke reise + gange
  });
  it('Skogstadrampa (ekte): ingen kollektivreise kl. 10; gange hele veien 58 min, 3,4 km (Entur)', () => {
    expect(SK.kollektiv.data.trip.tripPatterns).toHaveLength(0);
    const gh = parseGangHeleVeien(SK.gange);
    expect(gh).toEqual({ m: 3431, min: 58, kilde: 'entur' });
    const t = ingenReiseTekst({ søkt: Date.parse(SK.søkt), gangHele: gh });
    expect(t).toMatch(/^ingen kollektivreise i søket onsdag 25\.11\. kl\. 10\.00 — det betyr ikke at stedet ikke kan nås · gange hele veien: 58 min \(3,4 km, Entur\)$/);
    expect(t).not.toMatch(/utilgjengelig/);
  });
});

describe('søketidspunkt (presisering 1)', () => {
  it('dato og klokkeslett i norsk tid, også over midnatt', () => {
    expect(søkTekst(Date.parse('2026-11-25T09:00:00Z'))).toBe('onsdag 25.11. kl. 10.00');
    expect(søkTekst(Date.parse('2026-11-25T23:50:00Z'))).toBe('torsdag 26.11. kl. 00.50');
  });
});

describe('tilgang (presisering 3)', () => {
  const r = { min: 43, bytter: 1, bestilling: false }, målt = m => ({ kilde: 'målt', min: m, m: m * 80 });
  it('ordene følger grensene, og verdiene står alltid ved siden av', () => {
    expect(tilgang(r, målt(9))).toEqual({ ord: 'enkel', verdier: '43 min, 1 bytte, 9 min gange' });
    expect(tilgang({ ...r, min: 75 }, målt(9)).ord).toBe('mulig');
    expect(tilgang({ min: 445, bytter: 0 }, målt(10))).toEqual({ ord: 'krevende', verdier: '7 t 25 min, uten bytte, 10 min gange' });
  });
  it('grensene er justerbare (hypotese), og uten målt gange eller reise blir ordet «ukjent» — ikke «krevende»', () => {
    expect(tilgang(r, målt(9), { ...TILGANG_GRENSER, enkel: { reiseMin: 30, bytter: 1, gangMin: 15 } }).ord).toBe('mulig');
    expect(tilgang(r, { kilde: 'luftlinje', luftM: 600 }).ord).toBe('ukjent');
    expect(tilgang(null, målt(5))).toEqual({ ord: 'ukjent', verdier: 'ingen reise i søket' });
  });
  it('tilgangsordet påvirker aldri utvalg eller rekkefølge: velgVisning leser det ikke', () => {
    const src = fs.readFileSync('src/opplevelser.js', 'utf8');
    // Standardvalget (uten kontekst): rekkefølge og variasjon leser aldri tilgang. Score er et uttrykkelig valg (kontekst).
    const body = src.slice(src.indexOf('export const dagensRekkefølge'), src.indexOf('/**\n * Hvilke som vises på raden'));
    expect(body).not.toMatch(/tilgang|TILGANG_GRENSER/);
  });
});

describe('innganger og aktiviteter', () => {
  it('fire innganger over de sju kategoriene; aktivitet utledet fra kilden', () => {
    expect(Object.keys(INNGANGER)).toEqual(['natur', 'severdighet', 'kultur', 'aktivitet']);
    expect(innganger({ hoved: ['friluftsliv', 'bading'] })).toEqual(['natur', 'aktivitet']);
    expect(aktiviteter({ under: ['turrute'], rute: { type: 'Fotrute' } })).toEqual(['gåtur']);
    expect(aktiviteter({ under: ['museum'] })).toEqual(['museumsbesøk']);
  });
});

describe('på skjermen: kort, søketid, prikker og valgt opplevelse', () => {
  const F = JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/oppegard.json', 'utf8'));
  const tr = parseTurruter(F.turrute, F.stopp);
  const data = { liste: opplevelserVed([...tr.kandidater, ...parseFriluft(F.friluft, F.stopp), ...parseWikidata(F.wikidata)], F.stopp), punkter: tr.punkter, status: {} };
  beforeEach(() => { _nullstillEttBytte(); _settOpplevelseKilder(async () => data, async () => ({ m: 700, min: 9 })); });

  it('et valgt kort gir søketid med dato, opplevelseskort og prikker; prikk og kort deler valgt tilstand', async () => {
    const O = lastOpptak('mortensrud_dag'), pos = O.scenario.posisjon, nå = Date.parse(O.scenario.tid), av = avspiller(O);
    const hent = async (navn, req) => (navn === 'ett bytte: sjekk' ? { data: { eb: { tripPatterns: TP } } } : navn === 'ett bytte: gange' ? SK.gange : av.hent(navn, req));
    ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} }); await new Promise(r => setTimeout(r, 80));
    velgRetning('NØ'); await new Promise(r => setTimeout(r, 50));
    const html = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {}, radHtml: () => '<div class="rad"></div>' });
    expect(html).toMatch(/reisetider gjelder søk \S+ \d\d\.\d\d\. kl\. \d\d\.\d\d fra der du står/);
    expect(html).toMatch(/class="eb-okort"/);
    expect(html).toMatch(/\d+ min å gå fra stoppet/);
    expect(html).toMatch(/class="eb-ved-tittel">Ved [^<]+ · \d+ ting å oppleve/);   // stedet i en egen del, skilt fra reisen
    expect(html).toMatch(/Hele turen:/);
    expect(html).not.toMatch(/reise til stoppet/);
    expect(html).not.toMatch(/utilgjengelig/);
    const prikker = opplevelsePrikker(nå);
    expect(prikker.length).toBeGreaterThan(0);
    // Prikk → samme tilstand som kortet leser.
    velgOpplevelse(prikker[0].stedId, prikker[0].navn);
    expect(valgtOpplevelse()).toEqual({ stedId: prikker[0].stedId, navn: prikker[0].navn });
    expect(opplevelsePrikker(nå).find(p => p.navn === prikker[0].navn && p.stedId === prikker[0].stedId).valgt).toBe(true);
    const etter = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {}, radHtml: () => '' });
    expect(etter).toMatch(/class="eb-okort eb-okort-valgt"[^>]*aria-pressed="true"/);
    // Nytt kort: valgt opplevelse nullstilles.
    velgRetning('NØ');
    expect(valgtOpplevelse()).toBeNull();
  });
});
