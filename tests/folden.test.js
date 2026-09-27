/**
 * Stripen er knappen, og ankomsten venter til du nærmer deg. Issue #401.
 *
 * FRA DEN FØRSTE EKTE TUREN: null kartåpninger, og på spørsmål — «så ikke
 * knappen nei», men også «savnet ikke kartet på denne kjente ruten».
 *
 * DIAGNOSEN ER IKKE «FOR LITEN». Trykkflaten var 44 px via ::after; den var
 * stor nok. Ingenting SÅ UT som noe å trykke på — 11 px versaler i en rad som
 * ellers er ren tekst. Feilen var visuell, ikke geometrisk, og en større
 * usynlig flate ville ikke hjulpet.
 *
 * Derfor bærer noe som ALLEREDE er synlig og stort trykket nå: stripen selv,
 * og ankomstpanelets egen overskrift.
 */
import { describe, it, expect } from 'vitest';

const read = (f) => require('node:fs').readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('stripen er knappen', () => {
  const strip = () => read('src/views/journeyStrip.js');

  it('hele stripen tar trykket', () => {
    expect(strip()).toMatch(/el\.onclick = \(\) => \{ window\._toggleTrackMap/);
    expect(strip()).toMatch(/setAttribute\('role', 'button'\)/);
  });

  // Tastatur er ikke en ettertanke: elementet er en div med role=button, og
  // uten dette kan den ikke nås uten mus.
  it('og tastaturet når den', () => {
    expect(strip()).toMatch(/setAttribute\('tabindex', '0'\)/);
    expect(strip()).toMatch(/onkeydown/);
  });

  // MIKROKNAPPEN SKAL VÆRE BORTE. Står den igjen, konkurrerer to mål om det
  // samme trykket, og den lille vinner med fingeren.
  it('mikroknappen som ikke ble sett er fjernet', () => {
    expect(strip()).not.toMatch(/j-strip-map/);
    expect(read('src/views/track.js')).not.toMatch(/j-strip-map/);
  });

  it('⤢ blir igjen som hint, ikke som eget mål', () => {
    expect(strip()).toMatch(/js-map-hint/);
    expect(strip()).not.toMatch(/<button[^>]*js-map/);
  });
});

describe('ankomstpanelet folder seg', () => {
  const track = () => read('src/views/track.js');

  it('overskriften er folden', () => {
    expect(track()).toMatch(/class="hn-head' \+ \(_nextOpen \? ' open' : ''\)/);
    expect(track()).toMatch(/window\._toggleNext/);
  });

  // ORD SOM SIER HVA SOM ER BAK. «fremme ved <stedet>» står der fra før —
  // det var nettopp det kartknappen manglet da den sa «⤢ kart».
  it('og sier med ord hva som er bak', () => {
    const i = track().indexOf('hn-head-eyebrow');
    expect(track().slice(i, i + 200)).toMatch(/fremme ved/);
  });

  it('foldet skjuler alt annet enn overskriften', () => {
    expect(read('src/style/track.css'))
      .toMatch(/\.hn-panel\.folded > \*:not\(\.hn-head\)\{ *display:none/);
  });

  it('og affordansen er minst 44 px høy', () => {
    expect(read('src/style/track.css')).toMatch(/\.hn-head\{[^}]*min-height:44px/);
  });
});

/**
 * Og terskelen har ETT navn.
 *
 * Tre steder skrev `<= 5`: avstigningskortet, ankomstkartet og nå folden.
 * Kommentaren over det ene PÅSTO at den var «samme terskel som
 * avstigningskortet» mens den skrev tallet på nytt — to steder som skriver
 * ned det samme faktum, med en kommentar som skjulte det.
 */
describe('NAER_FRAMME_MINS', () => {
  const track = () => read('src/views/track.js');

  it('er navngitt ett sted', () => {
    expect(track()).toMatch(/const NAER_FRAMME_MINS = 5;/);
  });

  it('og alle som spør om «nærmer deg» leser det navnet', () => {
    const n = (track().match(/NAER_FRAMME_MINS/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(4);
  });

  // DET AVGJØRENDE: ingen løse tall igjen. Et nytt `mLeft <= 5` ville vært
  // en fjerde mening om hva «nærmer seg» betyr.
  it('og ingen skriver tallet på nytt', () => {
    expect(track()).not.toMatch(/mLeft\s*[<>]=?\s*5\b/);
  });

  it('folden åpner seg selv, og bare én gang', () => {
    expect(track()).toMatch(/function _maybeOpenNext/);
    expect(track()).toMatch(/if \(_nextAuto\) return;/);
  });
});
