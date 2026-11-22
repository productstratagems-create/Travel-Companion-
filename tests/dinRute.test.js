import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nærmesteDir, erNærmeste, erEgenRute, dinRuteForslag, dinRuteValg, dinRuteFra, dinRuteHtml, FORSLAG_MAKS } from '../src/dinRute.js';

// Fiksturer fra flere steder, ikke bare Oslo.
const BODØ = { name: 'Bodø stasjon', id: 'NSR:StopPlace:1', lat: 67.28, lon: 14.39 };
const VOSS = { name: 'Voss skysstasjon', id: null, lat: 60.63, lon: 6.42 };

describe('Rute uten egen rute: din rute fra nærmeste stopp (v1.218.261)', () => {
  it('før-bildet: main.js åpnet et Oslo-eksempel; nå nærmeste stopp og ingen eksempel', () => {
    const m = readFileSync('src/main.js', 'utf8');
    expect(m).not.toMatch(/exampleDir|exampleFallback|upgradeToNearest/);
    expect(m).toMatch(/config\.dirs\[2\] = nærmesteDir\(state\.nearestStation\)/);
    const f = readFileSync('src/firstRun.js', 'utf8');
    expect(f).not.toMatch(/Jernbanetorget|exampleDir/);
  });

  it('«fra» er stoppet rangeringen valgte, «til» er tomt', () => {
    const d = nærmesteDir(BODØ);
    expect(erNærmeste(d)).toBe(true);
    expect(d.from).toBe('Bodø stasjon');
    expect(d.stopId).toBe('NSR:StopPlace:1');
    expect(d.to).toBe('');
    expect(erEgenRute(d)).toBe(false);
  });

  it('uten posisjon er «fra» tomt — kortet ber om sted, ingen by gjettes', () => {
    const d = nærmesteDir(null);
    expect(d.from).toBe('');
    const h = dinRuteHtml(d, []);
    expect(h).toMatch(/placeholder="velg sted"/);
    expect(h).toMatch(/id="din-rute-til"[^>]*disabled/);
    expect(h).not.toMatch(/eksempel/i);
  });

  it('et gammelt lagret eksempel er ingen rute', () => {
    expect(erEgenRute({ key: 'example', from: 'Jernbanetorget', to: 'Nationaltheatret' })).toBe(false);
    expect(erEgenRute({ key: 'custom-out' })).toBe(true);
    expect(erEgenRute(null)).toBe(false);
  });

  it('forslag: vanlige mål, uten stoppet du står ved, høyst fire', () => {
    const freq = ['Voss skysstasjon', 'Bodø stasjon', 'A', 'B', 'C', 'D'].map(name => ({ name }));
    const f = dinRuteForslag(freq, 'Bodø stasjon');
    expect(f.map(p => p.name)).toEqual(['Voss skysstasjon', 'A', 'B', 'C']);
    expect(f.length).toBe(FORSLAG_MAKS);
  });

  it('valgt mål gir en ekte rute i applyRoute-formen', () => {
    const r = dinRuteValg(nærmesteDir(BODØ), { label: 'Bodø lufthavn', lat: 67.27, lon: 14.36 });
    expect(r.key).toBe('custom-out');
    expect(r.from).toBe('Bodø stasjon');
    expect(r.stopId).toBe('NSR:StopPlace:1');
    expect(r.to).toBe('Bodø lufthavn');
    expect(r._toLat).toBe(67.27);
    expect(erEgenRute(r)).toBe(true);
  });

  it('samme sted som fra, eller uten fra, gir ingen rute', () => {
    expect(dinRuteValg(nærmesteDir(BODØ), { label: 'Bodø stasjon' })).toBeNull();
    expect(dinRuteValg(nærmesteDir(null), { label: 'Bodø stasjon' })).toBeNull();
  });

  it('et eget fra-sted holdes — posisjonen overstyrer det ikke', () => {
    const d = dinRuteFra(nærmesteDir(BODØ), VOSS && { label: VOSS.name, lat: VOSS.lat, lon: VOSS.lon });
    expect(d._fraValgt).toBe(true);
    expect(d.from).toBe('Voss skysstasjon');
    const m = readFileSync('src/main.js', 'utf8');
    expect(m).toMatch(/if \(!erNærmeste\(cur\) \|\| cur\._fraValgt \|\| !state\.nearestStation\) return;/);
  });

  it('tavla henter ikke mot en tom «til»', () => {
    const b = readFileSync('src/views/board.js', 'utf8');
    expect(b).toMatch(/if \(erNærmeste\(config\.dirs\[state\.dIdx\]\)\) \{ renderDemoNote\(\); return; \}/);
  });
});

describe('«Din rute» står alene (v1.218.262)', () => {
  const css = () => readFileSync('src/style/board.css', 'utf8');
  const regel = () => { const m = css().match(/\/\* DIN-RUTE-RAMME \*\/([^{]*)\{display:none\}/); return m ? m[1] : ''; };
  it('kart, ⇄, ↻ og tom overskrift skjules mens kortet vises', () => {
    const r = regel();
    for (const s of ['html.din-rute-apen #v-board .map-wrap', 'html.din-rute-apen #dir-btn', 'html.din-rute-apen #board-refresh-btn', 'html.din-rute-apen #station-name-btn', 'html.din-rute-apen #line-strip']) expect(r).toContain(s);
  });
  it('⋮ blir stående — menyen er veien videre', () => {
    expect(regel()).not.toContain('board-more-btn');
  });
});
