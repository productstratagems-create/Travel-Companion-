/**
 * Skjermens to kanter: statuslinja over, bunnmenyen under.
 *
 * Rapportert med skjermbilde (avgangsdetaljer, bytte 74 → 12, kartet utvidet
 * og siden skrollet):
 *
 *   TOPPEN  Reiseløpets tekst sto oppå klokka og batteriet. Appen er
 *           `viewport-fit=cover` + `black-translucent`, så telefonen tegner
 *           statuslinja OPPÅ siden, og body-polstringen holder feltet fritt
 *           bare før du skroller.
 *   BUNNEN  «← 23:18 · andre avganger · 23:33 →» lå halvveis under
 *           bunnmenyen. Nettleserprøven (scratchpad/kantProbe.mjs) målte 87 px
 *           under menyen i skjermbildets skrollposisjon, og 478 px før du
 *           skrollet i det hele tatt.
 *
 * Dette er stilark-påstander; at de faktisk gir riktige piksler er målt i
 * prøven, i lys og mørk, 414 px, med iPhonens innsett (47/34) overstyrt.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = f => fs.readFileSync('src/style/' + f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
/** Erklæringene i den (eneste) regelen med nøyaktig denne velgeren. */
function regel(tekst, velger) {
  const esc = velger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const treff = [...tekst.matchAll(new RegExp('(^|})\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g'))];
  expect(treff.length, velger).toBe(1);
  const ut = {};
  treff[0][2].split(';').forEach(d => {
    const i = d.indexOf(':');
    if (i > 0) ut[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  });
  return ut;
}

const BASE = css('base.css'), SEL = css('selected.css'), KOMP = css('components.css');
// Leaflets egne kontroller ligger på 1000 (også våre: .sel-map-alt, filtrene
// på tavla). Menyene som åpner seg ligger på 1100.
const KART_KONTROLL = 1000, MENY = 1100;

describe('toppen: statuslinjas felt er dekket', () => {
  const s = regel(BASE, 'body::before');
  it('en fast stripe over hele bredden, like høy som innsettet', () => {
    expect(s.position).toBe('fixed');
    expect(s.top).toBe('0');
    expect(s.left).toBe('0');
    expect(s.right).toBe('0');
    expect(s.height).toMatch(/^env\(safe-area-inset-top/);
  });
  it('over kartet som glir under, under menyene som åpner seg', () => {
    expect(Number(s['z-index'])).toBeGreaterThan(KART_KONTROLL);
    expect(Number(s['z-index'])).toBeLessThan(MENY);
  });
  it('med sidens egen bakgrunn, festet — ikke en flat farge som synes som et bånd', () => {
    expect(s.background).toBe('var(--bg-gradient)');
    expect(s['background-attachment']).toBe('fixed');
    expect(s['pointer-events']).toBe('none');
  });
});

describe('bunnen: knappene som fører videre legger seg over menyen', () => {
  const rad = regel(SEL, '#s-ctas > .cta-row');
  it('sticky — og forelderen har ingen egen boks, ellers kan den ikke flytte seg', () => {
    expect(rad.position).toBe('sticky');
    // En sticky boks holder seg inne i forelderen; #s-ctas er bare så høy
    // som knappene. Uten `contents` står raden der den står.
    expect(regel(SEL, '#s-ctas').display).toBe('contents');
  });
  it('over kartets egne lag', () => {
    expect(Number(rad['z-index'])).toBeGreaterThan(KART_KONTROLL);
  });
  it('rett over menyen, og over reisebrikken når den står der', () => {
    expect(rad.bottom).toMatch(/^var\(--cta-bunn/);
    expect(regel(SEL, 'body.app-nav-visible #s-ctas > .cta-row')['--cta-bunn'])
      .toBe('calc(var(--app-nav-h) + env(safe-area-inset-bottom,0px))');
    expect(regel(SEL, 'body.app-nav-visible.jny-chip-visible #s-ctas > .cta-row')['--cta-bunn'])
      .toBe('calc(var(--app-nav-h) + var(--jny-chip-h) + env(safe-area-inset-bottom,0px))');
  });
  it('kant til kant, som det utvidede kartet, med sidens egen bakgrunn', () => {
    expect(rad.margin).toBe('0 -1rem');
    expect(rad.background).toBe('var(--bg-gradient)');
    expect(rad['background-attachment']).toBe('fixed');
  });
  it('raden er et direkte barn av #s-ctas — det CSS-en over forutsetter', () => {
    const js = fs.readFileSync('src/views/selected.js', 'utf8');
    expect(js).toMatch(/ctaDiv\.id = 's-ctas'/);
    expect(js).toMatch(/stepRow\.className = 'cta-row'/);
    expect(js).toMatch(/ctaDiv\.appendChild\(stepRow\)/);
  });
});

describe('reisebrikkens høyde har ett navn', () => {
  it('definert én gang', () => {
    expect([...KOMP.matchAll(/--jny-chip-h:\s*([^;]+);/g)].map(m => m[1].trim())).toEqual(['60px']);
  });
  it('ingen av klaringene skriver tallet selv', () => {
    const klaring = [...KOMP.matchAll(/jny-chip-visible[^{]*\{([^}]*)\}/g)].map(m => m[1]).join(';');
    expect(klaring).not.toMatch(/\b60px\b/);
    expect(klaring).toMatch(/var\(--jny-chip-h\)/);
  });
});
