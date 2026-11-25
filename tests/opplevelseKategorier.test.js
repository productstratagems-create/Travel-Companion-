/* VELG OPPLEVELSESKATEGORIER (v1.218.326): standard alle på; valget filtrerer før utvalget. */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { KATEGORI_STANDARD, erSynlig, lesKategorier, skrivKategorier, INNGANGER } from '../src/opplevelser.js';
import { katVelgerHtml, kortFor, valgteKategorier, KATEGORI_KEY, _nullstillEttBytte } from '../src/views/ettBytteVisning.js';
import { storage } from '../src/storage.js';

const esc = x => String(x);
const museum = { navn: 'Museet', luft: 50, hoved: ['kultur'], under: ['museum'], kat: [] };
const flere = { navn: 'Borgen', luft: 50, hoved: ['severdighet', 'kultur'], under: [], kat: [] };
const natur = { navn: 'Marka', luft: 50, hoved: ['friluftsliv'], under: [], kat: [] };

describe('kategorivalg', () => {
  beforeEach(() => { _nullstillEttBytte(); try { storage.remove ? storage.remove(KATEGORI_KEY) : storage.set(KATEGORI_KEY, ''); } catch (_) {} });
  it('standard er alle fire på; mangler/ugyldig gir alle på', () => {
    expect(KATEGORI_STANDARD).toEqual(Object.keys(INNGANGER));
    for (const r of [null, '', 'ø', '{"a":1}', '5']) expect(lesKategorier(r)).toEqual(KATEGORI_STANDARD);
    expect(valgteKategorier()).toEqual(KATEGORI_STANDARD);
  });
  it('vises når minst én av kategoriene er på', () => {
    expect(erSynlig(museum, ['natur'])).toBe(false);
    expect(erSynlig(museum, ['kultur'])).toBe(true);
    expect(erSynlig(flere, ['severdighet'])).toBe(true);
    expect(erSynlig(flere, ['natur', 'aktivitet'])).toBe(false);
    expect(erSynlig(natur, [])).toBe(false);
  });
  it('lagring rundtur, også tom (alle av)', () => {
    expect(lesKategorier(skrivKategorier(['natur', 'kultur']))).toEqual(['natur', 'kultur']);
    expect(lesKategorier(skrivKategorier([]))).toEqual([]);
  });
  it('knappene: fire, aria-pressed følger valget, «ingen kategorier valgt» når alle av', () => {
    storage.set(KATEGORI_KEY, skrivKategorier(['natur']));
    const h = katVelgerHtml(esc);
    expect((h.match(/data-eb-kategori=/g) || []).length).toBe(5);
    expect(h).toContain('data-eb-kategori="natur" aria-pressed="true"');
    expect(h).toContain('data-eb-kategori="kultur" aria-pressed="false"');
    expect(h).not.toContain('ingen kategorier valgt');
    storage.set(KATEGORI_KEY, skrivKategorier([]));
    expect(katVelgerHtml(esc)).toContain('ingen kategorier valgt');
  });
  it('filteret står foran utvalget i alle tre veier (mutantvern)', () => {
    const src = fs.readFileSync('src/views/ettBytteVisning.js', 'utf8');
    expect((src.match(/synlige\(/g) || []).length).toBeGreaterThanOrEqual(3); // kandidaterFor, kortFor, fyllUt
    expect(src).toMatch(/velgVisning\(synlige\(e\.data\.liste\), OPPLEVELSER_VIST/);
    expect(src).toMatch(/of synlige\(e\.data\.liste\)\) alle\.push/);
    expect(src).toMatch(/velgVisning\(synlige\(e\.data && e\.data\.liste\)/);
    expect(kortFor({ id: 'x' })).toEqual([]);
  });
});
