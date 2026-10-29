/**
 * «Ikke spurt», «henter», «feilet» og «ingenting funnet» er fire fakta.
 *
 * De var ett: `null`. Tre seksjoner på ankomstpanelet sa «laster …» fordi en
 * variabel var falsy, og sa det like mye når hentingen aldri hadde skjedd,
 * når den pågikk, når den hadde feilet, og når svaret var tomt.
 *
 * Samme form som `liveness`, `posState` og `boardState` — og testet som dem:
 * en ren funksjon, uten DOM.
 */
import { describe, it, expect } from 'vitest';
import { seksjon, KINDS, REFORSØK_MS, nesteForsøk } from '../src/api/seksjon.js';

describe('de fire tilstandene er fire setninger', () => {
  /* PÅSTANDEN SOM BÆRER KORREKTHETEN.
   *
   * Sier to av dem det samme, er vi tilbake til `null` som bærer alt. */
  it('sier ikke det samme om to ulike ting', () => {
    const sagt = [
      seksjon('steder', {}),                                   // ikke spurt
      seksjon('steder', { spurt: true }),                      // henter
      seksjon('steder', { spurt: true, feil: true }),          // feilet
      seksjon('steder', { spurt: true, data: [] }),            // tomt
    ];
    expect(sagt.map(s => s.kind)).toEqual(['ikke-spurt', 'henter', 'feilet', 'tomt']);
    // «feilet» og «tomt» er det paret som betyr mest: det ene er et svar,
    // det andre en innrømmelse.
    expect(sagt[2].label).not.toBe(sagt[3].label);
    // Og ingen av de fire er tomme strenger — en seksjon uten ord er den
    // stillheten regel 4 forbyr.
    sagt.forEach(s => expect(s.label).toBeTruthy());
  });

  it('tier når det er innhold å vise', () => {
    const ok = seksjon('steder', { spurt: true, data: [{ navn: 'Kaffebrenneriet' }] });
    expect(ok.kind).toBe('ok');
    // null og ikke '' — en tom streng ville blitt tegnet som en tom linje.
    expect(ok.label).toBeNull();
  });

  /* En feil skal slå gjennom selv om det ligger noe gammelt i cachen.
   * Ellers viser skjermen forrige stopps kafeer som om de var her. */
  it('lar en feil slå gjennom gamle data', () => {
    expect(seksjon('steder', { spurt: true, feil: true, data: [{ navn: 'x' }] }).kind)
      .toBe('feilet');
  });

  it('har ord for alle tre emnene', () => {
    ['vær', 'steder', 'avganger'].forEach(emne => {
      expect(seksjon(emne, { spurt: true, feil: true }).label, emne).toBeTruthy();
      expect(seksjon(emne, { spurt: true, data: [] }).label, emne).toBeTruthy();
    });
  });

  it('svarer uten å kaste på et emne den ikke kjenner', () => {
    expect(() => seksjon('finnes ikke', {})).not.toThrow();
    expect(() => seksjon('vær', null)).not.toThrow();
  });

  it('har fem tilstander, og de er navngitt', () => {
    expect(KINDS).toEqual(['ikke-spurt', 'henter', 'feilet', 'tomt', 'ok']);
  });
});

describe('stigen for nye forsøk', () => {
  /* Den må ta SLUTT. Overpass er en delt dugnadstjeneste; en app som prøver
   * i evig tid blir utestengt, og da hjelper det ingen at den var ivrig. */
  it('gir opp til slutt', () => {
    expect(nesteForsøk(0)).toBe(REFORSØK_MS[0]);
    expect(nesteForsøk(REFORSØK_MS.length - 1)).toBe(REFORSØK_MS[REFORSØK_MS.length - 1]);
    expect(nesteForsøk(REFORSØK_MS.length)).toBeNull();
    expect(nesteForsøk(99)).toBeNull();
  });

  it('venter lenger for hvert forsøk', () => {
    for (let i = 1; i < REFORSØK_MS.length; i++) {
      expect(REFORSØK_MS[i]).toBeGreaterThan(REFORSØK_MS[i - 1]);
    }
  });

  // Vakt mot en stige som i praksis er ett forsøk, eller ett som kommer så
  // fort at det er samme forespørsel på nytt.
  it('prøver mer enn én gang, og ikke med det samme', () => {
    expect(REFORSØK_MS.length).toBeGreaterThanOrEqual(2);
    expect(REFORSØK_MS[0]).toBeGreaterThanOrEqual(2_000);
  });

  it('tåler tull', () => {
    expect(nesteForsøk(undefined)).toBe(REFORSØK_MS[0]);
    expect(nesteForsøk(-1)).toBeNull();
  });
});
