// v1.218.245: «første kort over kanten» — evaluering av Auto-tavle.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kontekstLinje } from '../src/profil.js';
import { kortStedsnavn } from '../src/maalomrader.js';
describe('første kort over kanten', () => {
  it('kontekstlinja står bare når den har en reise å vise', () => {
    expect(kontekstLinje({ harProfil: true, dag: 'helg', del: 'natt', sted: null, neste: null, senere: null }, Date.parse('2026-11-22T01:00:00+01:00'))).toBe('');
  });
  it('korte navn på filterknappene', () => {
    expect(kortStedsnavn('Holmlia stasjon')).toBe('Holmlia');
    expect(kortStedsnavn('Mortensrud T')).toBe('Mortensrud');
    expect(kortStedsnavn('Hauketo')).toBe('Hauketo');
  });
  const a = readFileSync('src/views/auto.js', 'utf8'), css = readFileSync('src/style/settings.css', 'utf8');
  it('ingen «neste avganger herfra»; «avganger du ikke rekker» OVER kortene, kollapset (v1.218.301)', () => {
    expect(a).not.toMatch(/'neste avganger herfra'\) \+ '<\/div>'/);
    // Bestilt: de du ikke rekker er ofte innen rekkevidde likevel (du løper, bussen er sen),
    // så de står over lista — som før v1.218.245 — men lukket, så første kort fortsatt er over kanten.
    expect(a).toMatch(/kombiMerk \+ ikkeHtml \+ '<div class="at-liste">'/);
    expect(a).not.toMatch(/\+ '<\/div>' \+ ikkeHtml \+ bunn/);
    expect(a).toMatch(/_atIkkeÅpen = false/);                               // lukket som standard
    expect(a).toMatch(/'<details class="at-ikke"' \+ \(_atIkkeÅpen \? ' open' : ''\)/);
  });
  it('linja om holdeplasser med samme linjer er av; filterknappene bryter linja (v1.218.269)', () => {
    expect(a).toMatch(/flere\.hidden = !LIKE_LINJE_PÅ \|\| !like\.length;/);
    // Før-bildet: én linje som rulles sidelengs, og brukeren nådde ikke alle.
    expect(css).toMatch(/#v-auto \.at-retning\{flex-wrap:wrap\}/);
    expect(css).not.toMatch(/#v-auto \.at-retning\{[^}]*nowrap/);
  });
});
