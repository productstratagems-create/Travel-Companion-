import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { medLøft, gruppeFor, somRad, sorterKnapper, REKKEFØLGE, festVerktøy, leggTil, sett, leggTilLag } from '../src/ui/kartVerktoy.js';

const nyttKart = () => {
  const el = document.createElement('div');
  el.style.width = '300px'; el.style.height = '300px';
  document.body.appendChild(el);
  return L.map(el, { zoomControl: false }).setView([59.9, 10.75], 13);
};

describe('verktøysøylen nede til høyre (v1.218.72)', () => {
  it('rekkefølgen er én tabell: fokus, lag, kompass, fullskjerm, +, −', () => {
    // v1.218.79: kompasset står øverst til høyre, ikke i søylen.
    expect(sorterKnapper(['ut', 'fullskjerm', 'inn', 'hele', 'fokus', 'lag']))
      .toEqual(['hele', 'lag', 'inn', 'ut', 'fullskjerm', 'fokus']); // v1.218.89: form mellom − og ◎
    expect(sorterKnapper(['ukjent', 'inn'])).toEqual(['inn', 'ukjent']);
    expect(Object.keys(REKKEFØLGE)).toHaveLength(6);
  });
  it('én søyle per kart, nede til høyre, i rekkefølge uansett når knappene kom', () => {
    const map = nyttKart();
    leggTil(map, 'ut', { ikon: '−' }); leggTil(map, 'inn', { ikon: '+' }); leggTil(map, 'fokus', { ikon: '◎' });
    const v = festVerktøy(map);
    expect(v.el.parentElement.className).toContain('leaflet-bottom');
    expect(v.el.parentElement.className).toContain('leaflet-right');
    expect([...v.el.querySelectorAll('.kv-knapp')].map(b => b.dataset.kv)).toEqual(['inn', 'ut', 'fokus']); // v1.218.82: ◎ nederst
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

// ENDRET MED VILJE (v1.218.78): «Ikke L. I» — alle knappene i én søyle igjen.
describe('I, ikke L (v1.218.78)', () => {
  it('alle knappene i søylen', () => {
    ['fokus', 'hele', 'lag', 'kompass', 'fullskjerm', 'inn', 'ut'].forEach(id => expect(gruppeFor(id)).toBe('søyle'));
  });
  it('én søyle i rekkefølge: ◎, lag, ⤢, +, −', () => {
    const map = nyttKart();
    ['ut', 'inn', 'fullskjerm', 'lag', 'fokus'].forEach(id => leggTil(map, id, { ikon: id }));
    const v = festVerktøy(map);
    expect(v.el.querySelectorAll('.kv-rad-gruppe .kv-knapp').length).toBe(0);
    expect([...v.el.querySelectorAll('.kv-søyle-gruppe .kv-knapp')].map(b => b.dataset.kv)).toEqual(['lag', 'inn', 'ut', 'fullskjerm', 'fokus']); // v1.218.89
  });
});

import { KV_LØFT } from '../src/ui/kartVerktoy.js';
import fsLøft from 'node:fs';
describe('knappene litt opp (v1.218.77)', () => {
  // v1.218.78: løftet droppes før søylen blir en rad (tavla: 4 knapper på 220 px).
  it('løftet når det er plass; ellers nede; først så rad', () => {
    // v1.218.89: bunnstilt — løftet er 10, samme som margen.
    expect(KV_LØFT).toBe(10);
    expect(medLøft(5, 382)).toBe(true);
    expect(medLøft(4, 220)).toBe(true);
    expect(somRad(4, 220)).toBe(false);   // 4·46 + 10 = 194 — søyle, uten løft
    expect(somRad(3, 130)).toBe(true);
  });
  it('CSS og JS bruker samme tall, og lave kart løftes ikke', () => {
    const css = fsLøft.readFileSync('src/style/components.css', 'utf8');
    expect(css).toMatch(/--kv-løft: 10px/);
    expect(css).toMatch(/\.kart-verktøy\{margin-bottom:var\(--kv-løft\)!important\}/);
    expect(css).toMatch(/\.kart-verktøy\.kv-rad\{margin-bottom:10px!important\}/);
  });
});

import { leggTilØverst, ØVERST } from '../src/ui/kartVerktoy.js';
describe('kompasset øverst til høyre (v1.218.79)', () => {
  it('i en egen kontroll øverst til høyre, ikke i søylen', () => {
    expect(ØVERST).toEqual(['kompass']);
    const map = nyttKart();
    leggTil(map, 'inn', { ikon: '+' });
    const b = leggTilØverst(map, 'kompass', { ikon: 'N', tekst: 'Nord opp' });
    expect(b.closest('.leaflet-top.leaflet-right')).toBeTruthy();
    expect(festVerktøy(map).el.contains(b)).toBe(false);
    sett(map, 'kompass', { skjult: true }); expect(b.hidden).toBe(true);
  });
});

describe('en ny knapp erstatter en borte (v1.218.90)', () => {
  it('formknappen laget på nytt havner i søylen', () => {
    const map = nyttKart();
    const gammel = document.createElement('button'); leggTil(map, 'fullskjerm', { element: gammel });
    gammel.remove();
    const ny = document.createElement('button'); leggTil(map, 'fullskjerm', { element: ny });
    expect(festVerktøy(map).el.contains(ny)).toBe(true);
  });
});
