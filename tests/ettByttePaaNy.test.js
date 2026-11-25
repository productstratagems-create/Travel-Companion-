/* «ETT BYTTE UNNA» (v1.218.320): nytt navn, ingen «hvor langt»-rad, bare retning og kommune, alt fra nær til langt. */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { lastOpptak, avspiller } from './fixtures/entur/avspilling.js';
import { ettBytteHtml, _nullstillEttBytte, ETT_BYTTE_TEKST, FASETTER_VIST, nærmesteM } from '../src/views/ettBytteVisning.js';
import { harRekkevidde } from '../src/views/auto.js';

const O = lastOpptak('mortensrud_dag'), pos = O.scenario.posisjon, nå = Date.parse(O.scenario.tid), hent = avspiller(O).hent;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const vent = ms => new Promise(r => setTimeout(r, ms));

describe('ett bytte unna', () => {
  beforeEach(() => _nullstillEttBytte());
  it('knappen heter «ett bytte unna»; ingen «hvor langt»-rad for den; bare retning og kommune som knapper', () => {
    expect(ETT_BYTTE_TEKST).toBe('ett bytte unna');
    expect(harRekkevidde('bytte')).toBe(false);
    expect(FASETTER_VIST).toEqual(['retning', 'kommune']);
  });
  it('kortene står fra nær til langt unna (nærmeste sted først), og bare retning vises som knapp uten kommunedata', async () => {
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(80);
    const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} });
    expect([...html.matchAll(/data-eb-fasett="(\w+)"/g)].map(m => m[1])).toEqual(['retning']);
    // Stedene bærer avstanden (m), og kortene står i stigende rekkefølge etter det nærmeste.
    const { utforsk } = await import('../src/nettverksutforsker.js'), { ettByttePer } = await import('../src/ettBytte.js');
    const res = await utforsk({ posisjon: pos, tid: O.scenario.tid }, { hent });
    const rader = ettByttePer(res, pos, 'retning').rader;
    expect(rader.every(r => Number.isFinite(nærmesteM(r)))).toBe(true);
    const rangert = rader.slice().sort((a, b) => nærmesteM(a) - nærmesteM(b)).map(r => r.retningNavn);
    const iHtml = [...html.matchAll(/class="eb-retning[^"]*">([^<]+)</g)].map(m => m[1]);
    expect(iHtml).toEqual(rangert);
  });
  it('nærmesteM: minste avstand blant stedene kortet dekker; kort uten steder sist', () => {
    expect(nærmesteM({ punkter: [{ m: 9000 }, { m: 1200 }, { m: 4000 }] })).toBe(1200);
    expect(nærmesteM({ punkter: [] })).toBe(Infinity);
    const rader = [{ n: 'a', punkter: [{ m: 5000 }] }, { n: 'b', punkter: [{ m: 800 }] }, { n: 'c', punkter: [] }];
    expect(rader.sort((x, y) => nærmesteM(x) - nærmesteM(y)).map(r => r.n)).toEqual(['b', 'a', 'c']);
  });
  it('kilden: kortene sorteres på nærmesteM, og stedene inni kortet vises nærmest først', () => {
    const src = fs.readFileSync('src/views/ettBytteVisning.js', 'utf8');
    expect(src).toContain('sv.rader.slice().sort((a, b) => nærmesteM(a) - nærmesteM(b))');
    expect(src).toMatch(/spredt\(r\.punkter\.filter\(p => p\.id\), SJEKK_STEDER\)\.sort\(\(a, b\) => \(a\.m \?\? Infinity\) - \(b\.m \?\? Infinity\)\)/);
  });
});

describe('ett bytte unna er en modus i menylinjen (v1.218.321)', () => {
  it('menypunktet står ved siden av Auto-tavla, og knappen er borte fra retningsknappene', async () => {
    const { NAV_ITEMS, navSynlig } = await import('../src/ui/nav.js');
    const v = NAV_ITEMS.map(i => i.view);
    expect(v.indexOf('v-bytte')).toBe(v.indexOf('v-autotavle') + 1);
    expect(NAV_ITEMS.find(i => i.view === 'v-bytte').label).toBe('ett bytte unna');
    expect(navSynlig('v-bytte')).toBe(navSynlig('v-autotavle'));
    const src = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(src).toContain("knappValg.filter(k => k !== ETT_BYTTE_VALG");
    expect(src).toContain('window._settEttBytte = settEttBytte');
  });
  it('navTo setter modusen: v-bytte på, auto-tavle og auto-reise av', () => {
    const nav = fs.readFileSync('src/ui/nav.js', 'utf8');
    expect(nav).toContain("window._settEttBytte(bytte)");
    expect(nav).toContain("id === 'v-autotavle' || id === 'v-auto' || id === 'v-bytte'");
  });
});

describe('ryddet tekst og modus (v1.218.322)', () => {
  it('«ett bytte unna» viser ikke de andre hurtigvalgene; teksten er vanlig norsk', () => {
    const src = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(src).toContain("const retningKnapper = harBegge && _atRetning !== ETT_BYTTE_VALG");
    const eb = fs.readFileSync('src/ettBytte.js', 'utf8');
    const linjer = eb.split('\n').filter(l => /^const (GRUNNLAG|grunnlagFor)/.test(l)).join('\n');   // teksten brukeren ser, ikke kommentarene
    expect(linjer).not.toMatch(/ikke sjekket mot reisesøket|tidskontrollert/);
    expect(eb).toContain('Steder du når med ett bytte');
  });
});

describe('unike beste på tvers av kortene (v1.218.323)', async () => {
  const { unikeBeste, opplevelseNøkkel } = await import('../src/opplevelser.js');
  const o = (navn, qid, sitelinks = 0) => ({ navn, qid, lat: 60, lon: 10, luft: 100, sitelinks, kat: [{ k: 'kultur', u: 'museum', sterk: true }], hoved: ['kultur'], under: ['museum'], rute: null });
  const A = o('Ringve', 'Q1', 12), B = o('Hafjell', 'Q2', 9), C = o('Marka', 'Q3', 1);
  it('to kort med samme beste: nærmeste (først) beholder den, neste får sin nest beste', () => {
    const k1 = { n: 'nord' }, k2 = { n: 'nordøst' };
    const ut = unikeBeste([k1, k2], r => (r === k1 ? [A, B] : [A, B, C]));
    expect(ut.get(k1).navn).toBe('Ringve');
    expect(ut.get(k2).navn).toBe('Hafjell');
  });
  it('bare én felles kandidat: ett kort får den, det andre står uten boks', () => {
    const k1 = {}, k2 = {}, k3 = {};
    const ut = unikeBeste([k1, k2, k3], () => [A]);
    expect([...ut.values()].map(x => x.navn)).toEqual(['Ringve']);
    expect(ut.has(k2)).toBe(false);
  });
  it('stabilt: samme tilstand gir samme valg; samme Wikidata-id fra to steder er samme opplevelse', () => {
    const k1 = {}, k2 = {}, f = r => (r === k1 ? [A, B] : [{ ...A, lat: 60.0004 }, C]);
    const a = unikeBeste([k1, k2], f), b = unikeBeste([k1, k2], f);
    expect(a.get(k2).navn).toBe(b.get(k2).navn);
    expect(opplevelseNøkkel(A)).toBe(opplevelseNøkkel({ ...A, lat: 61 }));   // qid slår posisjon
    expect(a.get(k2).navn).toBe('Marka');                                    // «Ringve» fra stedet i nordøst er allerede tatt
  });
  it('på skjermen: ingen to kort viser samme opplevelse', async () => {
    const { ettBytteHtml, _nullstillEttBytte, _settOpplevelseKilder } = await import('../src/views/ettBytteVisning.js');
    const { opplevelserVed } = await import('../src/opplevelser.js'), { parseTurruter, parseFriluft, parseWikidata } = await import('../src/api/opplevelserKilder.js');
    _nullstillEttBytte();
    const F = JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/oppegard.json', 'utf8')), tr = parseTurruter(F.turrute, F.stopp);
    const data = { liste: opplevelserVed([...tr.kandidater, ...parseFriluft(F.friluft, F.stopp), ...parseWikidata(F.wikidata)], F.stopp), punkter: tr.punkter, status: {} };
    _settOpplevelseKilder(async () => data, async () => null, async () => null);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(120);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(300);
    const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} });
    const navn = [...html.matchAll(/class="eb-forh-navn">([^<]+)</g)].map(m => m[1]);
    expect(navn.length).toBeGreaterThan(2);
    expect(new Set(navn).size).toBe(navn.length);
  });
});
