import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { somRad, sorterKnapper, REKKEFØLGE, festVerktøy, leggTil, sett, leggTilLag } from '../src/ui/kartVerktoy.js';

const nyttKart = () => {
  const el = document.createElement('div');
  el.style.width = '300px'; el.style.height = '300px';
  document.body.appendChild(el);
  return L.map(el, { zoomControl: false }).setView([59.9, 10.75], 13);
};

describe('verktøysøylen nede til høyre (v1.218.72)', () => {
  it('rekkefølgen er én tabell: fokus, lag, kompass, fullskjerm, +, −', () => {
    expect(sorterKnapper(['ut', 'fullskjerm', 'inn', 'hele', 'fokus', 'kompass', 'lag']))
      .toEqual(['fokus', 'hele', 'lag', 'kompass', 'fullskjerm', 'inn', 'ut']);
    expect(sorterKnapper(['ukjent', 'inn'])).toEqual(['inn', 'ukjent']);
    expect(Object.keys(REKKEFØLGE)).toHaveLength(7);
  });
  it('én søyle per kart, nede til høyre, i rekkefølge uansett når knappene kom', () => {
    const map = nyttKart();
    leggTil(map, 'ut', { ikon: '−' }); leggTil(map, 'inn', { ikon: '+' }); leggTil(map, 'fokus', { ikon: '◎' });
    const v = festVerktøy(map);
    expect(v.el.parentElement.className).toContain('leaflet-bottom');
    expect(v.el.parentElement.className).toContain('leaflet-right');
    expect([...v.el.querySelectorAll('.kv-knapp')].map(b => b.dataset.kv)).toEqual(['fokus', 'inn', 'ut']);
    expect(festVerktøy(map)).toBe(v);
  });
  it('sett skjuler, viser og gir teksten til aria og title', () => {
    const map = nyttKart();
    const b = leggTil(map, 'kompass', { ikon: 'N', tekst: 'Nord opp' });
    expect(b.getAttribute('aria-label')).toBe('Nord opp');
    sett(map, 'kompass', { skjult: true }); expect(b.hidden).toBe(true);
    sett(map, 'kompass', { skjult: false }); expect(b.hidden).toBe(false);
  });
  it('lag: én knapp og et panel; merket når noe er skjult', () => {
    const map = nyttKart();
    const panel = leggTilLag(map);
    const knapp = festVerktøy(map).knapper.get('lag');
    expect(panel.hidden).toBe(true);
    knapp.click(); expect(panel.hidden).toBe(false);
    sett(map, 'lag', { merket: true }); expect(knapp.classList.contains('kv-merket')).toBe(true);
    expect(leggTilLag(map)).toBe(panel);
  });
  it('en knapp som finnes fra før flyttes inn, med samme id', () => {
    const map = nyttKart();
    const b = document.createElement('button'); b.id = 'x-map-expand';
    leggTil(map, 'fullskjerm', { element: b });
    expect(festVerktøy(map).el.querySelector('#x-map-expand')).toBe(b);
  });
});

describe('lave kart får knappene på rad (v1.218.72)', () => {
  it('130 px og tre knapper: rad; 382 px og fem knapper: søyle', () => {
    expect(somRad(3, 130)).toBe(true);
    expect(somRad(5, 382)).toBe(false);
  });
});

describe('en flyttet knapp går hjem når kartet fjernes (v1.218.72)', () => {
  it('⤢ står igjen i siden etter map.remove(), klar for neste kart', () => {
    const hjem = document.createElement('div'); document.body.appendChild(hjem);
    const b = document.createElement('button'); b.id = 'y-map-expand'; hjem.appendChild(b);
    const map = nyttKart();
    leggTil(map, 'fullskjerm', { element: b });
    expect(b.parentElement).not.toBe(hjem);
    map.remove();
    expect(document.getElementById('y-map-expand')).toBe(b);
    expect(b.parentElement).toBe(hjem);
  });
});

import { bindMapExpand } from '../src/ui/map.js';
describe('fullskjermknappen følger kartet (v1.218.74)', () => {
  // Rapportert via probe: underveis åpner kartet i full høyde fra stripen,
  // og knappen sto på ⤢ «utvid» — første trykk gjorde ingenting synlig.
  it('kartet åpnes utenfra: knappen sier «minimer», og ett trykk lukker', async () => {
    const el = document.createElement('div'); const b = document.createElement('button');
    document.body.append(el, b);
    bindMapExpand(null, el, b);
    el.classList.add('expanded');
    await new Promise(r => setTimeout(r, 0));
    expect(b.getAttribute('aria-label')).toBe('Minimer kart');
    b.click();
    expect(el.classList.contains('expanded')).toBe(false);
  });
});

describe('underveis: ✕ lukker kartet som stripen gjør (v1.218.74)', () => {
  it('lukking via knappen går gjennom samme bryter som stripen', async () => {
    const s = (await import('node:fs')).readFileSync('src/views/track.js', 'utf8');
    expect(s).toMatch(/if \(!open && _tMapOpen\) window\._toggleTrackMap\(\);/);
  });
});
