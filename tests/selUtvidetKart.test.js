// Det utvidede kartet fyller plassen mellom statuslinja og det faste nederst,
// på både avgangsdetaljer og underveis. Én regel i ui/map.js.
//
// Rapportert to ganger: først i avgangsdetaljer (kartet bak knapperaden),
// så i underveis (kartet bak bunnmenyen). Begge var 72vh uansett.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
import { expandedMapHeight, bottomEdge } from '../src/ui/map.js';

describe('høyden på det utvidede kartet', () => {
  it('er fra statuslinja til det faste nederst', () => {
    expect(expandedMapHeight(47, 737)).toBe(690);
  });
  it('blir aldri mindre enn et brukbart kart', () => {
    expect(expandedMapHeight(47, 150)).toBe(200);
  });
});

describe('det faste nederst', () => {
  it('er toppen av bunnmenyen når den er der (underveis har ingen knapperad)', () => {
    document.body.innerHTML = '<nav id="app-nav" style="position:fixed"></nav>';
    const nav = document.getElementById('app-nav');
    nav.getClientRects = () => [{}];
    nav.getBoundingClientRect = () => ({ top: 700, height: 56 });
    expect(bottomEdge()).toBe(700);
  });
  it('er skjermens bunn når ingenting ligger fast der', () => {
    document.body.innerHTML = '';
    expect(bottomEdge()).toBe(window.innerHeight);
  });
});

describe('begge skjermene bruker regelen', () => {
  it.each(['src/views/selected.js', 'src/views/track.js'])('%s', (f) => {
    expect(readFileSync(f, 'utf8')).toMatch(/bindMapExpand\([^;]*\{ onToggle: \(open\) => fitExpandedMap\(mapEl, open\) \}\)/);
  });
  it('map.js gir skjermen beskjed', () => {
    expect(readFileSync('src/ui/map.js', 'utf8')).toMatch(/if \(opts\.onToggle\) opts\.onToggle\(open, form\);/);
  });
});
