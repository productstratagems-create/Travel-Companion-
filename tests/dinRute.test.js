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
    expect(m).toMatch(/if \(erNærmeste\(cur\) && !cur\._fraValgt && state\.nearestStation\)/);
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

describe('«Din rute» hører til Rute (v1.218.263)', () => {
  it('kortet ligger inne i #v-board, så show() skjuler det med skjermen', () => {
    const h = readFileSync('index.html', 'utf8');
    const i = h.indexOf('<div id="v-board"'), d = h.indexOf('id="demo-note"');
    expect(i).toBeGreaterThan(-1);
    expect(d).toBeGreaterThan(i);
    expect(d).toBeLessThan(h.indexOf('class="board-header-slim"', i));
  });
  it('«fra» fylles også når Auto-tavle er på', () => {
    const m = readFileSync('src/main.js', 'utf8');
    const a = m.indexOf('if (erNærmeste(cur) && !cur._fraValgt && state.nearestStation)');
    const b = m.indexOf('if (loadAutoMode()) { renderAuto(); return; }');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
  });
  it('renderDemoNote fyller «fra» fra rangeringen', () => {
    const b = readFileSync('src/views/board.js', 'utf8');
    expect(b).toMatch(/if \(!dir\._fraValgt && state\.nearestStation && state\.nearestStation\.name !== dir\.from\) \{ dir = nærmesteDir\(state\.nearestStation\); config\.dirs\[state\.dIdx\] = dir; \}/);
  });
});

import { profilRute, ruteUtenValg, profilForslag, erProfilRute } from '../src/dinRute.js';
describe('svarene fra onboardingen gir Rute en rute (v1.218.264)', () => {
  const H = { navn: 'Bodø stasjon', stopId: 'NSR:StopPlace:1', lat: 67.288, lon: 14.396 };
  const J = { navn: 'Bodø lufthavn', stopId: 'NSR:StopPlace:2', lat: 67.268, lon: 14.365 };
  const sagt = { hjem: H, jobb: J };
  const kl = h => new Date(2026, 10, 23, h, 0).getTime();

  it('før-bildet: uten rute og med svar ble det «Din rute» med tom «til»; nå hjem ↔ jobb', () => {
    const r = ruteUtenValg(nærmesteDir(null), sagt, null, null, kl(8));
    expect(erProfilRute(r)).toBe(true);
    expect([r.from, r.to]).toEqual(['Bodø stasjon', 'Bodø lufthavn']);
    expect(erEgenRute(r)).toBe(true);
  });
  it('retning følger hvor du står', () => {
    expect(profilRute(sagt, { lat: 67.269, lon: 14.366 }, kl(8)).from).toBe('Bodø lufthavn');
    expect(profilRute(sagt, { lat: 67.287, lon: 14.395 }, kl(17)).from).toBe('Bodø stasjon');
  });
  it('uten posisjon avgjør klokka', () => {
    expect(profilRute(sagt, null, kl(8)).from).toBe('Bodø stasjon');
    expect(profilRute(sagt, null, kl(17)).from).toBe('Bodø lufthavn');
  });
  it('et eget valg vinner alltid', () => {
    const egen = { key: 'custom-out', from: 'Voss skysstasjon', to: 'Bergen' };
    expect(ruteUtenValg(egen, sagt, null, null, kl(8))).toBe(egen);
  });
  it('bare ett svar: ingen rute, men stoppet er første forslag', () => {
    expect(profilRute({ hjem: H }, null, kl(8))).toBeNull();
    expect(profilForslag({ jobb: J })[0].name).toBe('Bodø lufthavn');
  });
  it('tavla utleder ruta før den henter', () => {
    const b = readFileSync('src/views/board.js', 'utf8');
    expect(b).toMatch(/ruteUtenValg\(før, lesSagt\(\)/);
  });
});
