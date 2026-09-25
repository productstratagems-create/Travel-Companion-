/**
 * Ett faktum, ett sted. Issue #396.
 *
 * Samme opplysning sto skrevet mange ganger på underveis-skjermen, og det
 * stjeler oppmerksomhet fra det som faktisk endrer seg. Rettesnorens punkt 1:
 * relevant, ikke bare riktig.
 *
 * MÅLT PÅ SKJERMEN, 414 px, mens du kjører — ikke talt av meg på et
 * skjermbilde, for den opptellingen tok feil: jeg oppga seks forekomster av
 * destinasjonsnavnet i issuet, og den ekte telleren fant åtte.
 *
 *              før    etter
 *   Manglerud    8      6
 *   klokka     3-4    2-3
 *   «9 min»      2      1
 *
 * REGELEN, med ett navn: KORTET DU SITTER PÅ GJENTAR IKKE DET HELTEN ALT
 * SIER. `.track-center` eier tallet, klokka og «ankommer X»; etappekortet
 * rett under sa alle tre om igjen.
 *
 * OG DEN GJELDER BARE DET KORTET. De framtidige etappene har ingen helt over
 * seg — der er kortet eneste sted opplysningen finnes, og da er den ikke en
 * gjentakelse. Det er issuets egen advarsel: to steder er ikke støy hvis de
 * leses i ulike situasjoner.
 */
import { describe, it, expect } from 'vitest';

/**
 * BLOKK-KOMMENTARENE MÅ OGSÅ BORT.
 *
 * Første utgave strøk bare `//`-linjer. Kommentaren som forklarer denne
 * endringen inneholder selv ordene «stopp igjen», så testen matchet sin egen
 * begrunnelse — og mutanten som fjernet den ekte visningen overlevde.
 *
 * Riktig streng, feil sted: den tredje varianten av den feilen i dag.
 */
const src = () => require('node:fs')
  .readFileSync('src/views/track.js', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

/** Kroppen til `buildLegCard`, der begge overskriftene bygges. */
const kortet = () => {
  const s = src();
  const i = s.indexOf('function buildLegCard');
  expect(i).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf('\n  function ', i + 10));
};
/** Grenen for etappen du sitter på. */
const naa = () => {
  const k = kortet();
  return k.slice(k.indexOf('if (rideMode)'), k.indexOf('} else {'));
};
/** Grenen for etappene som kommer. */
const senere = () => kortet().slice(kortet().indexOf('} else {'));

describe('kortet du sitter på', () => {
  it('gjentar ikke ankomstklokka', () => {
    expect(naa()).not.toMatch(/arrT\.clk/);
  });

  it('gjentar ikke minuttene til ankomst', () => {
    expect(naa()).not.toMatch(/mToAction/);
  });

  it('gjentar ikke avstigningsstoppets navn', () => {
    expect(naa()).not.toMatch(/displayStn\(leg\.toStation\)/);
  });

  // Det ene tallet som IKKE står noe annet sted. Kommentaren i koden kaller
  // den «the single most decision-relevant number a rider has», og den ble
  // flyttet til api/alight.js nettopp for å kunne testes.
  it('men beholder «N stopp igjen», som ingen andre sier', () => {
    // DEN RENDREDE VISNINGEN, ikke erklæringen. `const stopsLeft = …` står
    // i samme gren, så et løst /stopsLeft/ matchet selv når spanet var revet
    // ut — og mutanten overlevde.
    expect(naa()).toMatch(/ct-stops">' \+ stopsLeft \+ ' stopp igjen/);
  });
});

describe('kortene for etappene som kommer', () => {
  // HELE POENGET MED AT REGELEN HAR EN GRENSE. Uten en helt over seg er
  // kortet eneste sted disse opplysningene finnes.
  it('beholder avgangstiden sin', () => {
    expect(senere()).toMatch(/leg\.depTime\.clk/);
  });

  it('og nedtellingen sin', () => {
    expect(senere()).toMatch(/depStatus/);
  });
});

/**
 * Og panelet nederst sier «herfra», ikke stedsnavnet igjen.
 *
 * Knappen sto inne i panelet hvis egen overskrift er «fremme ved <stedet>»,
 * rett over den.
 */
describe('hva nå?-panelet', () => {
  it('gjentar ikke sin egen overskrift i knappen', () => {
    const s = src();
    const i = s.indexOf('id="t-new-btn"');
    const linje = s.slice(i, s.indexOf('</button>', i));
    expect(linje).toMatch(/herfra/);
    expect(linje).not.toMatch(/displayStn\(arrStation\)/);
  });
});
