/**
 * Buss 74 gikk rett over fjorden.
 *
 * Rapportert med skjermbilde fra tavla Mortensrud → Jernbanetorget, to linjer
 * valgt: «Busslinjen har en veldig tynn og uleselig strek.»
 *
 * Streken var tynn — det var den egentlige meldingen, og `corridorStyle`
 * svarer på den (se `map.test.js` og `board.test.js`). Men et forstørret
 * utsnitt av det samme kartet viste noe tyngre: den røde streken gikk i
 * LANGE RETTE SEGMENTER MED SKARPE KNEKK, diagonalt over vannet ved Hovedøya,
 * og ignorerte hver eneste vei. Linje 3 fulgte sporet sitt i samme bilde.
 *
 * Det er ikke en stil. Det er stoppakkorder — rette strek mellom
 * plattformkoordinater — tegnet med samme selvtillit som et svar.
 *
 * TO VEIER INN TIL TAVLA, OG BARE ÉN AV DEM BÆRER GEOMETRI:
 *
 *   reisesøket   tripGQL ber om `pointsOnLink{points length}` per etappe
 *   stopptavla   boardGQL ber ikke om geometri i det hele tatt, og
 *                `stopBoardExtras` legger radene rett inn
 *
 * Og `perLine` tok FØRSTE rad per linje etter avgangstid, og leste korridoren
 * av den samme raden. «Når» og «hvor» er to ulike fakta slått sammen til ett
 * valg — kodebasens signaturfeil, denne gangen med tidspunktet og traséen som
 * de to tingene som måtte være enige.
 *
 * TRE RETTELSER, I DEN REKKEFØLGEN:
 *
 *   1. bruk raden som HAR en trasé            `_corridorPick`   — gratis
 *   2. en rad uten etapper har stoppkjeden    `_legCorridorStops(dep)`
 *      si på avgangen, ikke på etappen
 *   3. spør Entur når ingen rad hadde noen    `shapeGQL` — en stige
 *
 * Rekkefølgen er ikke pynt. Retter man bare stilen, blir resultatet en TYKK,
 * SELVSIKKER strek som fortsatt peker feil sted — verre enn den tynne.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'),
  SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

import { _corridorPick, _legCorridorStops } from '../src/views/board.js';
import { shapeGQL, SHAPE_RUNGS } from '../src/api/queries.js';
import { decodePolyline } from '../src/ui/polyline.js';

/* FIKSTURENS EGET INSTRUMENT.
 *
 * Repoet har en dekoder og ingen koder — appen leser `pointsOnLink`, den
 * skriver den aldri. Så fiksturen må lage en, og da må den BINDES: en koder
 * som koder feil ville gitt en trasé som dekoder til noe annet, og testene
 * ville målt den feilen i stedet for koden. Se `rundturen` under. */
function encodePolyline(pts, presisjon) {
  const f = Math.pow(10, presisjon);
  let ut = '', forrigeLat = 0, forrigeLon = 0;
  const tall = (v) => {
    v = v < 0 ? ~(v << 1) : (v << 1);
    let s = '';
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  pts.forEach(([lat, lon]) => {
    const la = Math.round(lat * f), lo = Math.round(lon * f);
    ut += tall(la - forrigeLat) + tall(lo - forrigeLon);
    forrigeLat = la; forrigeLon = lo;
  });
  return ut;
}

/* Den rapporterte reisa. Fire stopp, og en trasé som IKKE er akkordene
 * mellom dem — det er hele forskjellen testene under måler. */
const kall = (navn, lat, lon, t) => ({
  quay: {
    latitude: lat, longitude: lon,
    stopPlace: { id: 'NSR:StopPlace:' + navn, name: navn, latitude: lat, longitude: lon },
  },
  aimedDepartureTime: t, expectedDepartureTime: t,
  aimedArrivalTime: t, expectedArrivalTime: t,
});
const KALL = [
  kall('Mortensrud', 59.843, 10.829, '2026-10-29T19:24:00+01:00'),
  kall('Skullerud', 59.853, 10.820, '2026-10-29T19:28:00+01:00'),
  kall('Ryen', 59.889, 10.814, '2026-10-29T19:36:00+01:00'),
  kall('Jernbanetorget', 59.911, 10.750, '2026-10-29T19:49:00+01:00'),
];
/** En vei som svinger — flere punkter enn det er stopp. */
const TRASE = [[59.843, 10.829], [59.846, 10.836], [59.853, 10.820],
               [59.869, 10.823], [59.889, 10.814], [59.901, 10.788],
               [59.911, 10.750]];
const LINJE74 = { publicCode: '74', transportMode: 'bus' };

/** En rad fra stopptavla: ingen `_legs`, men stoppkjeden ligger på avgangen. */
const stopptavleRad = (t) => ({
  expectedDepartureTime: t,
  serviceJourney: { id: 'RUT:ServiceJourney:74-' + t, line: LINJE74, estimatedCalls: KALL },
  _fromStopBoard: true,
});

/** En rad fra reisesøket: `_legs`, med eller uten `pointsOnLink`. */
const reiseRad = (t, medTrase) => ({
  expectedDepartureTime: t,
  serviceJourney: { id: 'RUT:ServiceJourney:74-' + t, line: LINJE74, estimatedCalls: KALL },
  _legs: [{
    mode: 'bus',
    serviceJourney: { id: 'RUT:ServiceJourney:74-' + t, line: LINJE74, estimatedCalls: KALL },
    ...(medTrase ? { pointsOnLink: { points: encodePolyline(TRASE, 5) } } : {}),
  }],
});

const dir = {
  from: 'Mortensrud', to: 'Jernbanetorget',
  _fromLat: 59.843, _fromLon: 10.829, _toLat: 59.911, _toLon: 10.750,
};

describe('fiksturen selv', () => {
  /* Koderen over er et instrument jeg skrev selv, og instrumentet har tatt
   * feil like ofte som koden i dette repoet. Den bindes mot appens egen
   * dekoder før noen annen påstand lener seg på den. */
  it('rundturen gjennom appens dekoder gir traséen tilbake', () => {
    const tilbake = decodePolyline(encodePolyline(TRASE, 5), 5);
    expect(tilbake.length).toBe(TRASE.length);
    tilbake.forEach(([lat, lon], i) => {
      expect(lat).toBeCloseTo(TRASE[i][0], 4);
      expect(lon).toBeCloseTo(TRASE[i][1], 4);
    });
  });

  /* MÅLEINSTRUMENTET FØRST, og i denne fila er det ikke en formalitet.
   *
   * Den første reproduksjonen jeg skrev for dette brukte en fikstur uten
   * `pointsOnLink`, så «har trasé»-grenen ble aldri kjørt og alt var grønt.
   * Fiksturen må kunne SKILLE de to tilfellene, ellers måler den ingenting. */
  it('har en trasé som ikke er akkordene mellom stoppene', () => {
    expect(TRASE.length).toBeGreaterThan(KALL.length);
    const rad = reiseRad('a', true);
    expect(rad._legs[0].pointsOnLink.points).toBeTruthy();
    expect(stopptavleRad('a')._legs).toBeUndefined();
  });
});

describe('hvilken rad sier NÅR, og hvilken sier HVOR', () => {
  /* FØR-BILDET.
   *
   * `perLine` var `if (perLine.has(code)) return;` — første rad vant alt, og
   * en stopptavle-rad har ingen trasé å vinne med. */
  it('tar traséen fra en senere rad når den første ikke har noen', () => {
    let e;
    e = _corridorPick(e, stopptavleRad('19:24'));     // soonest, no geometry
    e = _corridorPick(e, reiseRad('19:31', true));    // later, has geometry
    expect(e.shape).toBeTruthy();
    expect(e.shape.length).toBe(TRASE.length);
  });

  /* OG AVGANGEN FLYTTER SEG IKKE. Dette er påstanden som gjør rettelsen
   * trygg: nedtellingen på skjermen tilhører den tidligste avgangen, og en
   * senere rad skal bidra med geometri — ikke med et tidspunkt. */
  it('men lar den tidligste avgangen stå', () => {
    let e;
    e = _corridorPick(e, stopptavleRad('19:24'));
    e = _corridorPick(e, reiseRad('19:31', true));
    expect(e.c.expectedDepartureTime).toBe('19:24');
  });

  it('og rører ikke en trasé den alt har', () => {
    let e;
    e = _corridorPick(e, reiseRad('19:24', true));
    const først = e.shape;
    e = _corridorPick(e, reiseRad('19:31', true));
    expect(e.shape).toBe(først);
  });

  it('melder ærlig fra når ingen rad hadde en', () => {
    let e;
    e = _corridorPick(e, stopptavleRad('19:24'));
    e = _corridorPick(e, reiseRad('19:31', false));
    expect(e.shape).toBeFalsy();     // ← og da spør board.js Entur
  });

  it('tåler tull', () => {
    expect(() => _corridorPick(undefined, null)).not.toThrow();
    expect(_corridorPick(undefined, {}).shape).toBeFalsy();
  });
});

describe('en valgt linje uten etapper', () => {
  /* FØR-BILDET, OG DEN STILLESTE FEILEN I HELE SAKEN.
   *
   * `board.js` kalte `_legCorridorStops(ocLeg, dir)` der `ocLeg` var
   * `(oc._legs && oc._legs[0]) || null`. For en stopptavle-rad er den null,
   * funksjonen returnerer `[]` på første linje, og korridoren faller ut på
   * `if (ocPts.length < 2) return;`.
   *
   * Altså: en linje du hadde SLÅTT PÅ var borte fra kartet, uten et ord.
   * Ikke tynn — borte.
   *
   * Og stoppkjeden manglet aldri. En avgang og en etappe bærer begge
   * `.serviceJourney.estimatedCalls`, som er det ene feltet funksjonen leser.
   * Bare etappen ble rakt over. */
  it('fikk ingen punkter da bare etappen ble spurt', () => {
    const rad = stopptavleRad('19:24');
    const etappe = (rad._legs && rad._legs[0]) || null;
    expect(_legCorridorStops(etappe, dir)).toEqual([]);
  });

  it('har stoppkjeden sin på avgangen', () => {
    const stopp = _legCorridorStops(stopptavleRad('19:24'), dir);
    expect(stopp.length).toBeGreaterThanOrEqual(2);
    expect(stopp[0].name).toBe('Mortensrud');
    expect(stopp[stopp.length - 1].name).toBe('Jernbanetorget');
  });

  // Og en etappe svarer som før — ellers hadde rettelsen flyttet feilen.
  it('og en etappe svarer som før', () => {
    const rad = reiseRad('19:24', true);
    expect(_legCorridorStops(rad._legs[0], dir).length)
      .toBe(_legCorridorStops(rad, dir).length);
  });
});

describe('stigen mot Entur', () => {
  /* SKJEMAET KAN IKKE LESES HERFRA. `api.entur.io` og `developer.entur.no`
   * svarer 403 gjennom denne sandkassens proxy, og `sdk.entur.org` ligger
   * utenfor de tillatte domenene. Et tredjeparts typesett legger
   * `pointsOnLink` på `JourneyPattern` og på `Leg` — ikke på `ServiceJourney`
   * — men et typesett er ikke skjemaet.
   *
   * Derfor en stige. Det som bindes her er at den HAR flere trinn og at de er
   * ulike spørringer; om feltene finnes avgjøres av én ekte tur. */
  it('har mer enn ett trinn', () => {
    expect(SHAPE_RUNGS).toBeGreaterThan(1);
  });

  it('spør om ulike felt på hvert trinn', () => {
    const q = Array.from({ length: SHAPE_RUNGS }, (_, i) => shapeGQL('X:1', i));
    expect(new Set(q).size).toBe(SHAPE_RUNGS);
    expect(q[0]).toContain('pointsOnLink');
    expect(q[1]).toContain('journeyPattern');
  });

  /* ETT FELT PER SPØRRING, MED VILJE. GraphQL feller hele dokumentet på ett
   * ukjent felt, så en spørring som ba om begge ville lært oss ingenting den
   * dagen ett av dem mangler. */
  it('ber ikke om begge veiene i samme spørring', () => {
    expect(shapeGQL('X:1', 0)).not.toContain('journeyPattern');
  });

  it('spør om den journeyen den fikk', () => {
    expect(shapeGQL('RUT:ServiceJourney:74-1', 0)).toContain('RUT:ServiceJourney:74-1');
  });
});

/* ── KASING PÅ TAVLA ─────────────────────────────────────────────────────
 *
 * `drawRoute` finnes nettopp for dette, og sier det selv:
 *
 *   «Without it a coloured line over a busy basemap loses its edges and
 *    reads as part of the map.»
 *
 * Hver andre kartflate i appen — `drawLeg`, `drawStopLine`, auto-reise — gikk
 * gjennom den. Tavla kalte rå `L.polyline` fire steder. Kartet som alltid
 * ligger over en mørk, travel bakgrunn var det ene uten kanter.
 *
 * Bundet på KILDETEKSTEN, slik `mapVoice.test.js` alt gjør, fordi det er
 * TOPOLOGIEN som bærer: et nytt `L.polyline` i en tegnesti ville falt på
 * ingen annen test.
 */
describe('tavla tegner med kanter', () => {
  const src = fs.readFileSync('src/views/board.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('har ingen rå L.polyline igjen', () => {
    expect(src.match(/L\.polyline\(/g) || []).toEqual([]);
  });

  it('og tegner korridorene gjennom drawRoute', () => {
    expect((src.match(/drawRoute\(_bRouteLayer/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  /* Måleinstrumentet: uten dette ville testen over vært grønn for en fil som
   * ikke tegner noe som helst. */
  it('tegner fortsatt korridorer', () => {
    expect(src).toMatch(/corridorStyle\(/);
  });

  /* OG KALLESTEDET, ikke bare funksjonen.
   *
   * `_legCorridorStops` over svarer riktig når den får avgangen. Men det var
   * ALDRI funksjonen som var feil — det var at board.js rakte den `ocLeg`
   * alene. Testene lenger oppe ville alle vært grønne med den feilen på
   * plass, fordi de kaller funksjonen direkte og bypasser nettopp porten som
   * sviktet. Det er feilformen denne kodebasen har gått i flest ganger. */
  it('rekker fram avgangen når raden ikke har etapper', () => {
    expect(src).toMatch(/_legCorridorStops\(ocLeg \|\| oc,/);
  });

  /* Og at en gjetning blir SAGT. En akkord tegnet i stillhet, ved siden av et
   * svar, er hele saken denne utgivelsen handler om. */
  it('sier fra om linjene den måtte gjette', () => {
    expect(src).toMatch(/exact: !!shape/);
    expect(src).toMatch(/gjetninger/);
  });
});
