/**
 * «Framme 07:40» var bussens, og kortet sa det ikke.
 *
 * Rapportert med skjermbilde fra auto-reise på Mortensrud: bryteren sto på
 * «T-bane først», men kortet under «dit du skal» viste linje 71 og linje 74
 * — begge buss — og «framme 07:40» var bussens ankomst.
 *
 * KORTENE HAR SIN EGEN REGEL, og den er skrevet ned med vilje
 * (`auto.js:2428`): «Options sorted by ARRIVAL, because that is the
 * question.» Modus finnes ikke i den komparatoren, og bryteren leses ett
 * sted i hele kodebasen — linjelista under (`auto.js:576`). Kortene får
 * `live` i leserens rekkefølge og kaster den umiddelbart.
 *
 * TO FEIL, OG DEN FØRSTE ER DEN STILLESTE:
 *
 *   1. Kortet sier aldri hvilken MODUS det er. «linje 71» er et tall;
 *      radene under har fargemerket som gjør 3 til T-bane og 71 til buss.
 *      Appen VET det — `dirRank` grupperer på modus og `badgeHtml` finnes
 *      alt — kortet er det eneste stedet kunnskapen ikke når skjermen.
 *   2. «+3 andre veier» er et tall, ikke et svar. T-banen leseren valgte å
 *      prioritere ligger i `x.options`, bare ikke på plass 0, og kortet sier
 *      ikke når den er framme.
 *
 * HVA SOM IKKE ENDRES: «framme» betyr fortsatt RASKEST. Kortet finnes
 * nettopp fordi fire rader med hver sin klokke tvang leseren til å sortere
 * tall selv (`auto.js:2195`). Lar bryteren overstyre overskriften, slutter
 * «framme 07:40» å være svaret på «når er jeg tidligst framme» — og da er vi
 * tilbake der blokka startet. `tests/destinations.test.js` låser det, og
 * skal bestå uendret.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'),
  SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { foretrukket, kortHtml, RANKS, dirRank } from '../src/views/auto.js';

/* LOKAL TID, IKKE OSLO-TID.
 *
 * Første fikstur skrev `'...T07:40:00+01:00'`. Prøvemaskinen står i UTC, så
 * `clk()` tegnet 06:40 og påstanden om «framme 07:40» falt — på tidssonen,
 * ikke på koden. Testen handler om rekkefølge og ord, ikke om omregning, så
 * tidene bygges i prøvens egen sone. */
const T = (hh, mm) => new Date(2026, 9, 30, hh, mm, 0).getTime();

/** En rad slik `dirRank` leser den: modusen ligger på kallets serviceJourney. */
const rad = (kode, modus, farge) => ({
  lines: [{ code: kode, colour: farge }],
  frontText: 'Jernbanetorget',
  call: { serviceJourney: { line: { transportMode: modus, id: 'RUT:Line:' + kode } } },
});

/** Ett alternativ på et kort: hvilken rad, når den går, når du er framme. */
const vei = (d, går, framme) => ({ i: 0, d, call: d.call, ms: går, at: framme });

/* DEN RAPPORTERTE SKJERMEN. Bussen er fire minutter raskere enn T-banen,
 * og det er nettopp derfor saken er interessant: en regel som bare valgte
 * T-bane ville gjort overskriften usann. */
const BUSS = rad('71', 'bus', 'e60000');
const TBANE = rad('3', 'metro', 'f5a000');
const OPTIONS = [vei(BUSS, T(7, 19), T(7, 40)),
                 vei(TBANE, T(7, 24), T(7, 44))];

describe('fiksturen selv', () => {
  /* MÅLEINSTRUMENTET FØRST, og her er det ikke en formalitet: leser ikke
   * `dirRank` modusen ut av fiksturen, havner begge i samme gruppe og hver
   * påstand under er grønn uten å ha prøvd noe. */
  it('har to ulike modusgrupper å skille', () => {
    expect(dirRank(TBANE, null)).not.toBe(dirRank(BUSS, null));
    expect(RANKS[dirRank(TBANE, null)].label).toBe('T-bane');
  });

  it('og bussen er faktisk raskest framme', () => {
    expect(OPTIONS[0].at).toBeLessThan(OPTIONS[1].at);
  });
});

describe('den foretrukne veien', () => {
  /* FØR-BILDET. `foretrukket` fantes ikke; kortet visste ingenting om
   * bryteren. */
  it('er T-banen når leseren har valgt T-bane først', () => {
    const f = foretrukket(OPTIONS, false, null);
    expect(f).toBeTruthy();
    expect(f.d.lines[0].code).toBe('3');
  });

  /* PÅSTANDEN SOM BÆRER HELE RAPPORTEN: bryteren skal bety noe her.
   *
   * FØRSTE UTGAVE AV DENNE TESTEN VAR FEIL, og den feilet mot riktig kode.
   * Den snudde bryteren på den rapporterte fiksturen og krevde at bussen ble
   * navngitt — men der er bussen BÅDE raskest og foretrukket, så det er
   * ingenting å legge til, og `null` er det riktige svaret.
   *
   * Reverseringen vises bare på en fikstur der T-banen er raskest: med
   * «T-bane først» er den alt overskriften (null), med «buss først» er
   * bussen den andre veien. */
  it('og snur når bryteren snur', () => {
    const tbaneRaskest = [vei(TBANE, T(7, 24), T(7, 40)),
                          vei(BUSS, T(7, 19), T(7, 44))];
    expect(foretrukket(tbaneRaskest, false, null)).toBeNull();
    expect(foretrukket(tbaneRaskest, true, null).d.lines[0].code).toBe('71');
  });

  /* Og den gjentar ikke sin egen overskrift. Står den foretrukne veien alt
   * øverst, er det ingenting å legge til — og «T-bane: framme 07:40» under
   * «framme 07:40» ville vært samme klokkeslett sagt to ganger, som er den
   * feilen denne kodebasen bruker mest tid på. */
  it('men sier ingenting når den alt er overskriften', () => {
    const baretbane = [OPTIONS[1], vei(rad('2', 'metro', 'f5a000'), T(7, 30), T(7, 50))];
    expect(foretrukket(baretbane, false, null)).toBeNull();
  });

  it('og ingenting når det ikke finnes noen annen vei', () => {
    expect(foretrukket([OPTIONS[0]], false, null)).toBeNull();
    expect(foretrukket([], false, null)).toBeNull();
    expect(foretrukket(null, false, null)).toBeNull();
  });

  /* TIEBREAK PÅ ANKOMST, IKKE PÅ AVGANG.
   *
   * Radlista bryter likt på `nextMs` — når den går — fordi den rangerer
   * RADER. Kortet rangerer ANKOMSTER, og spørsmålet er «når er jeg framme».
   * To T-baner der den som går sist er framme først er nettopp forskjellen. */
  it('velger den T-banen som er tidligst FRAMME, ikke den som går først', () => {
    const treg = vei(rad('3', 'metro', 'f5a000'), T(7, 20), T(7, 50));
    const rask = vei(rad('4', 'metro', 'f5a000'), T(7, 25), T(7, 44));
    const f = foretrukket([OPTIONS[0], treg, rask], false, null);
    expect(f.d.lines[0].code).toBe('4');
  });
});

describe('kortet', () => {
  const kort = (desc) => kortHtml(
    { name: 'Jernbanetorget', options: OPTIONS }, 0, desc, null);

  /* FØR-BILDET. Kortet skrev «linje 71» og ingenting om hva 71 er. */
  it('sier hvilken modus det er, med linjas egen farge', () => {
    const h = kort(false);
    expect(h).toMatch(/line-badge/);
    expect(h).toMatch(/e60000/);          // bussrødt, som radene under
    expect(h).toMatch(/>71</);
  });

  it('og overskriften er fortsatt den raskeste', () => {
    expect(kort(false)).toMatch(/framme 07:40/);
  });

  /* FØR-BILDET. Her sto «+1 annen vei» — et tall, ikke et svar. */
  it('navngir den foretrukne veien og når den er framme', () => {
    const h = kort(false);
    expect(h).toContain('T-bane');
    expect(h).toContain('07:44');
  });

  it('og bryteren snur hvilken vei som navngis', () => {
    const h = kort(true);
    // Med «buss først» er bussen alt overskriften, så det er T-banen som
    // blir den andre veien — og da er det ingenting nytt å si.
    expect(h).not.toContain('T-bane:');
  });

  /* INGENTING KASTES. Finnes ingen foretrukket vei å navngi, står dagens
   * telling — den sier fortsatt noe sant om at det finnes flere. */
  it('faller til «andre veier» når det ikke er noe å navngi', () => {
    const baretbane = [OPTIONS[1], vei(rad('2', 'metro', 'f5a000'), T(7, 30), T(7, 50))];
    const h = kortHtml({ name: 'Jernbanetorget', options: baretbane }, 0, false, null);
    expect(h).toMatch(/annen vei|andre veier/);
  });

  /* Og en skjermleser får det samme. En forskjell som bare er en farge er
   * en forskjell halve lesergruppa ikke har. */
  it('og aria-label bærer både modusen og den andre veien', () => {
    const a = (kort(false).match(/aria-label="([^"]*)"/) || [])[1] || '';
    expect(a).toMatch(/07:40/);
    expect(a).toMatch(/T-bane/);
    expect(a).toMatch(/07:44/);
  });
});

describe('gruppenavnet kommer fra RANKS', () => {
  /* Bryteren henter etikettene sine fra samme tabell (`sortEndLabels`). Sto
   * navnet to steder, kunne knappen si «T-bane først» mens kortet sa noe
   * annet om samme gruppe — og ingen test ville falt. */
  it('er den samme tabellen bryteren bruker', () => {
    const src = require('node:fs').readFileSync('src/views/auto.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).toMatch(/RANKS\[dirRank\(/);
  });

  /* En ukjent modus har ingen etikett — `RANKS` setter `label: null` med
   * vilje, «nothing on screen should claim to know what it is». Kortet skal
   * da tie, ikke skrive «null: framme 07:44». */
  it('og en modus uten navn navngis ikke', () => {
    const ukjent = vei(rad('X', 'funicular', '888888'), T(7, 22), T(7, 42));
    const h = kortHtml({ name: 'Jernbanetorget', options: [OPTIONS[0], ukjent] }, 0, true, null);
    expect(h).not.toMatch(/null/);
    expect(h).toMatch(/annen vei|andre veier/);
  });
});
