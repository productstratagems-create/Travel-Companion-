import { describe, it, expect, beforeEach } from 'vitest';
import L from 'leaflet';
import { lastHånd, lagreHånd, verktøyHjørne, skalaHjørne, HÅND_KEY } from '../src/haand.js';
import { festVerktøy, leggTil } from '../src/ui/kartVerktoy.js';
import { storage } from '../src/storage.js';

const nyttKart = () => {
  const el = document.createElement('div'); el.style.width = '300px'; el.style.height = '300px';
  document.body.appendChild(el);
  return L.map(el, { zoomControl: false }).setView([59.9, 10.75], 13);
};

describe('høyre- eller venstrehendt (v1.218.73)', () => {
  beforeEach(() => { try { storage.remove(HÅND_KEY); } catch (_) {} });
  it('standard er høyrehendt: knappene nede til høyre, skalaen til venstre', () => {
    expect(lastHånd()).toBe('høyre');
    expect(verktøyHjørne('høyre')).toBe('bottomright');
    expect(skalaHjørne('høyre')).toBe('bottomleft');
  });
  it('venstrehendt: omvendt, og valget huskes', () => {
    lagreHånd('venstre');
    expect(lastHånd()).toBe('venstre');
    expect(verktøyHjørne('venstre')).toBe('bottomleft');
    expect(skalaHjørne('venstre')).toBe('bottomright');
  });
  it('et nytt kart får søylen i hjørnet du har valgt', () => {
    lagreHånd('venstre');
    const map = nyttKart(); leggTil(map, 'inn', { ikon: '+' });
    expect(festVerktøy(map).el.parentElement.className).toContain('leaflet-left');
  });
  it('å bytte flytter søylen på kart som alt er åpne', () => {
    lagreHånd('høyre');
    const map = nyttKart(); leggTil(map, 'inn', { ikon: '+' });
    expect(festVerktøy(map).el.parentElement.className).toContain('leaflet-right');
    lagreHånd('venstre');
    expect(festVerktøy(map).el.parentElement.className).toContain('leaflet-left');
    lagreHånd('høyre');
  });
});
