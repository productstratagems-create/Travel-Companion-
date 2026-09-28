/**
 * Én haversine, ikke tre. Issue #399.
 *
 * Avstand mellom to punkter var regnet ut tre steder:
 *
 *   src/geo.js       haver(la1, lo1, la2, lo2)   med atan2
 *   src/position.js  _metres(a, b)                med asin, privat
 *   src/trail.js     metres(a, b)                 med asin, eksportert
 *
 * DE ER ENIGE I DAG — `2·atan2(√a, √(1−a))` og `2·asin(√a)` gir samme tall
 * for a ≤ 1. Det er nettopp derfor driften ville vært usynlig: ingenting
 * binder dem til å fortsette å være enige, og to formuleringer av samme
 * formel inviterer til at én av dem «forbedres».
 *
 * Grunnen til at de fantes er ekte: `position.js` og `trail.js` er
 * bladmoduler uten importer, med vilje, og `geo.js` importerer selv fra
 * begge — en import den veien ville laget en syklus. Rettelsen er derfor en
 * NY bladmodul, ikke en sletting.
 */
import { describe, it, expect } from 'vitest';
import { metresBetween, haver, EARTH_R_M } from '../src/haversine.js';
import { haver as geoHaver } from '../src/geo.js';
import { metres as trailMetres } from '../src/trail.js';

const OSLO_S = { lat: 59.9109, lon: 10.7522 };
const MORTENSRUD = { lat: 59.8455, lon: 10.8265 };

describe('de tre navnene gir samme tall', () => {
  it('geo.haver og haversine.haver', () => {
    expect(geoHaver(OSLO_S.lat, OSLO_S.lon, MORTENSRUD.lat, MORTENSRUD.lon))
      .toBeCloseTo(haver(OSLO_S.lat, OSLO_S.lon, MORTENSRUD.lat, MORTENSRUD.lon), 6);
  });

  it('trail.metres og haversine.metresBetween', () => {
    expect(trailMetres(OSLO_S, MORTENSRUD))
      .toBeCloseTo(metresBetween(OSLO_S, MORTENSRUD), 6);
  });

  // De to formene er samme funksjon, bare med ulike argumenter.
  it('og de to formene er enige med hverandre', () => {
    expect(haver(OSLO_S.lat, OSLO_S.lon, MORTENSRUD.lat, MORTENSRUD.lon))
      .toBeCloseTo(metresBetween(OSLO_S, MORTENSRUD), 6);
  });
});

describe('matematikken', () => {
  it('gir null for samme punkt', () => {
    expect(metresBetween(OSLO_S, OSLO_S)).toBe(0);
  });

  it('er symmetrisk', () => {
    expect(metresBetween(OSLO_S, MORTENSRUD))
      .toBeCloseTo(metresBetween(MORTENSRUD, OSLO_S), 9);
  });

  /* RADIUSEN ER BUNDET DIREKTE.
   *
   * «Kjent avstand»-testen under har et bånd på 1,5 km, og en mutant som
   * satte radiusen til 6 300 000 flyttet svaret under 100 meter — godt
   * innenfor. Den overlevde.
   *
   * 6 371 000 m er jordas middelradius, ikke et valg. Skal den endres — til
   * WGS84 sin 6 371 008,8, for eksempel — skal det være et bevisst grep som
   * synes i en diff, ikke noe som kan gli forbi. */
  it('bruker jordas middelradius', () => {
    expect(EARTH_R_M).toBe(6_371_000);
  });

  // Oslo S → Mortensrud er om lag 8,3 km i luftlinje.
  it('treffer en kjent avstand', () => {
    const d = metresBetween(OSLO_S, MORTENSRUD);
    expect(d).toBeGreaterThan(7500);
    expect(d).toBeLessThan(9000);
  });

  it('tåler antipoder uten å gå i NaN', () => {
    const d = metresBetween({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(Math.PI * EARTH_R_M, 0);
  });
});

/**
 * Og at formelen bare finnes ETT sted.
 *
 * DETTE ER FØR-BILDET, og det er strukturelt: tallene var alt enige, så
 * ingen oppførselstest kunne feilet mot dagens kode. Det som kunne feile er
 * påstanden om at det finnes én kopi.
 */
describe('formelen har ett hjem', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const alle = (dir = 'src') => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(d => {
      const f = path.join(dir, d.name);
      return d.isDirectory() ? alle(f) : (f.endsWith('.js') ? [f] : []);
    });
  const kode = (f) => fs.readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('ingen andre regner jordradius', () => {
    const syndere = alle()
      .filter(f => f !== 'src/haversine.js')
      .filter(f => /6[_ ]?371[_ ]?000|6371000/.test(kode(f)));
    expect(syndere).toEqual([]);
  });

  it('og ingen andre skriver haversine-formelen', () => {
    const syndere = alle()
      .filter(f => f !== 'src/haversine.js')
      .filter(f => /Math\.(atan2|asin)\(Math\.sqrt/.test(kode(f)));
    expect(syndere).toEqual([]);
  });

  // Bladmodulene må forbli blad: bare andre importløse moduler.
  it('position og trail importerer fortsatt bare bladmoduler', () => {
    [ 'src/position.js', 'src/trail.js' ].forEach(f => {
      const imports = kode(f).match(/^import .*from '([^']+)'/gm) || [];
      imports.forEach(i => expect(i).toMatch(/haversine\.js/));
    });
  });
});
