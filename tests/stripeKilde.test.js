/**
 * Stripa så like selvsikker ut når den gjettet.
 *
 * Spurt: hvorfor beholde «neste avganger» på en tidslinje? Svaret er at den
 * ikke er en liste tegnet sidelengs — `renderLineStrip` sier det selv, «One
 * axis: -1 is the horizon, 0 is your stop», og aria-etiketten sier «N tog på
 * vei til Mortensrud». Glyfene er togene som er på vei til deg, PLASSERT DER
 * DE ER. Det er det eneste romlige elementet på tavla utenom kartet.
 *
 * MEN DEN SA IKKE NÅR POSISJONENE VAR REGNET UT AV RUTETABELLEN:
 *
 *     .ls-live{ filter:drop-shadow(…) }   «A measured position, glowing»
 *
 * Et tog med målt posisjon gløder. Et uten er tegnet LIKT, MINUS GLØDEN. Så
 * lenge noe ved siden av ikke gløder, har leseren kontrast. Men på en linje
 * uten sanntidsdekning gløder INGEN — og da er det ingen nabo å skille seg
 * fra, mens stripa fortsatt ser ut som en observasjon.
 *
 * Samme form som belegningen i v1.176.0: en forskjell du bare kan se ved å
 * sammenligne med naboen, er ingen forskjell når alle naboene er like.
 *
 * TO TILSTANDER, IKKE TRE, med vilje. Er ett tog målt, finnes kontrasten, og
 * en ekstra linje tekst på en skjerm som alt er tett er støy. Ordet sies bare
 * når det ikke finnes noe å sammenligne med.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'),
  SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

import { stripeKilde, _stripSummary, STRIPE_KINDS } from '../src/views/board.js';
import { SRC_LABEL } from '../src/api/posSource.js';

const tog = (live, mins) => ({ id: 't' + mins, live, mins: mins == null ? 5 : mins });

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten tog som FAKTISK skiller seg på `live` ville
  // hver påstand under vært grønn uten å ha prøvd noe.
  it('har tog med og uten målt posisjon', () => {
    expect(tog(true).live).toBe(true);
    expect(tog(false).live).toBe(false);
    expect(STRIPE_KINDS).toContain('rutetid');
  });
});

describe('stripeKilde', () => {
  /* PÅSTANDEN SOM BÆRER DET HELE. */
  it('sier «rutetid» når ingen posisjon er målt', () => {
    expect(stripeKilde([tog(false), tog(false), tog(false)]).kind).toBe('rutetid');
  });

  /* ETT MÅLT TOG ER NOK. Da har gløden en nabo å skille seg fra, og stripa
   * trenger ingen ord. */
  it('og tier når ett eneste er målt', () => {
    expect(stripeKilde([tog(false), tog(true), tog(false)]).kind).toBe('malt');
    expect(stripeKilde([tog(true)]).kind).toBe('malt');
  });

  it('og sier ingenting om en tom stripe', () => {
    expect(stripeKilde([]).kind).toBe('tom');
    expect(stripeKilde(null).kind).toBe('tom');
  });

  /* ORDET ER APPENS EGET. `posSource.js` eier det, og underveis-skjermen
   * sier nøyaktig det samme når posisjonen faller til ruteplanen. To
   * skjermer som finner på hver sin ordlyd for det samme er feilformen dette
   * repoet har rettet rundt tjuefem ganger. */
  it('med samme ord som underveis-skjermen bruker', () => {
    expect(stripeKilde([tog(false)]).ord).toBe(SRC_LABEL.rutetid);
  });

  it('og ingen ord når det ikke er noe å si', () => {
    expect(stripeKilde([tog(true)]).ord).toBe('');
    expect(stripeKilde([]).ord).toBe('');
  });

  it('tåler tull', () => {
    expect(() => stripeKilde([null, undefined, {}])).not.toThrow();
    expect(stripeKilde([null, {}]).kind).toBe('rutetid');
  });
});

describe('og skjermen sier det', () => {
  /* FØR-BILDET. Overskriften var den samme strengen uansett. */
  it('overskriften bærer ordet, og bare da', () => {
    const src = fs.readFileSync('src/views/board.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).toMatch(/stripeKilde\(/);
    const i = src.indexOf("'neste avganger'");
    expect(i).toBeGreaterThan(-1);
  });

  /* OG EN SKJERMLESER FÅR DET SAMME. Stripa er `role="img"`, så
   * aria-etiketten ER stripa for den som ikke ser den — og gløden finnes
   * ikke der i det hele tatt. */
  it('og aria-etiketten sier det også', () => {
    const data = { from: 'Mortensrud', trains: [tog(false, 8), tog(false, 14)] };
    expect(_stripSummary(data)).toContain(SRC_LABEL.rutetid);
  });

  it('men ikke når noe er målt', () => {
    const data = { from: 'Mortensrud', trains: [tog(true, 8), tog(false, 14)] };
    expect(_stripSummary(data)).not.toContain(SRC_LABEL.rutetid);
    // Og resten av setningen står urørt.
    expect(_stripSummary(data)).toContain('Mortensrud');
    expect(_stripSummary(data)).toContain('2 tog');
  });
});
