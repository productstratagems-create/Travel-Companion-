// Auto-reise-kartet: kvadratisk, kan blåses opp og kan skjules.
//
// Bestilt: «Kartet bør muligens ha en kvadratisk form, og bør være mulig å
// skjule og å blåse opp til fullskjerm.»
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const { kartSkjult, settKartSkjult } = await import('../src/views/auto.js');
const css = readFileSync('src/style/settings.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const src = readFileSync('src/views/auto.js', 'utf8');

beforeEach(() => localStorage.clear());

describe('form', () => {
  it('kvadratisk, og ikke kvadratisk utvidet', () => {
    expect(css).toMatch(/#v-auto #auto-map \{\s*height: auto;\s*aspect-ratio: 1 \/ 1;/);
    expect(css).toContain('#v-auto #auto-map.expanded{aspect-ratio:auto;height:var(--map-h-open)}');
  });
});

describe('fullskjerm', () => {
  it('knappen finnes, og kartet bruker samme utvidelse som de andre', () => {
    expect(html).toContain('id="auto-map-expand"');
    expect(html).toMatch(/<div id="auto-map" class="map-expandable">/);
    expect(src).toMatch(/bindMapExpand\(_aMap, el, _el\('auto-map-expand'\), \{ onToggle: \(open\) => \{\s*fitExpandedMap\(el, open\)/);
  });
});

describe('skjule', () => {
  it('huskes, og følger profilen', () => {
    expect(kartSkjult()).toBe(false);
    settKartSkjult(true);
    expect(kartSkjult()).toBe(true);
    expect(localStorage.getItem('default::t.autoKart')).toBe('skjult');
    settKartSkjult(false);
    expect(kartSkjult()).toBe(false);
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.autoKart',");
  });
  it('skjult tegnes ikke', () => {
    expect(src).toMatch(/if \(kartSkjult\(\)\) \{\s*wrap\.style\.display = 'none';\s*if \(vis\) vis\.hidden = false;\s*return;/);
  });
});
