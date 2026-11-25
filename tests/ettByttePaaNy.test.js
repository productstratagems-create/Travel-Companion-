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
