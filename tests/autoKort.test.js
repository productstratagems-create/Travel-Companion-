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

import { kortHtml, RANKS, dirRank } from '../src/views/auto.js';

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

/* ── GRENSEN: KORTET LYTTER IKKE PÅ BRYTEREN ────────────────────────────
 *
 * v1.181.0 lot kortet navngi den veien bryteren prioriterte, ved siden av
 * overskriften. Rapportert på neste skjerm, med «Andre busser først» valgt:
 *
 *     Jernbanetorget                     framme 09:13
 *     [3] mot Kolsås · spor 1 · går 08:48
 *     Lokalbuss: framme 09:19          ← en buss inne i et T-banekort
 *
 * «Enten må kortene bytte rekkefølge, eller så må sortering kun gjelde for
 * kortene under «hvor skal du». Nå blandes bussavgang inn i kortet med
 * t-bane.»
 *
 * KOMPROMISSET VAR FEIL, og det står her fordi det er den eneste måten det
 * ikke blir foreslått igjen: antakelsen var at «raskest i tittelen,
 * alternativet navngitt» ville lese som ett svar med en fotnote. På skjermen
 * leser det som to avganger i samme kort.
 *
 * OG EN UENIGHET SOM GIKK BORT AV SEG SELV: knappen sa «Andre busser først»
 * mens kortet sa «Lokalbuss». Begge var «riktige» — knappen navnes fra
 * endene av det som finnes på stoppet, kortet fra gruppa til den faktiske
 * avgangen dit, og til Jernbanetorget finnes det ingen «andre busser». To
 * navn for ett valg.
 *
 * PARAMETEREN ER FJERNET, IKKE BARE UBRUKT. Da kan kortet STRUKTURELT ikke
 * lytte, og det er en sterkere garanti enn en påstand om oppførsel.
 */
describe('kortet spør ikke om rekkefølgen', () => {
  /* FØR-BILDET. `kortHtml(x, n, desc, local)` ga ulik HTML for de to
   * endene — det var hele rapporten. */
  it('tar ingen sortering inn', () => {
    expect(kortHtml.length).toBe(2);
  });

  it('og gir samme kort uansett hva som sendes', () => {
    const x = { name: 'Jernbanetorget', options: OPTIONS };
    const a = kortHtml(x, 0);
    [false, true, 'desc', null].forEach(tull =>
      expect(kortHtml(x, 0, tull, null), String(tull)).toBe(a));
  });

  /* OG RENDEREN REKKER DEN INGEN. Funksjonen kan være aldri så ren; kalles
   * den med leserens valg, er døra åpen igjen. Fjerde gang i dette repoet at
   * det er kallestedet og ikke funksjonen som bærer. */
  it('og renderen rekker den ingen', () => {
    const src = require('node:fs').readFileSync('src/views/auto.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    /* ALLE KALL, IKKE ET MØNSTER PÅ ARGUMENTENE.
     *
     * Første utgave var `not.toMatch(/kortHtml\([^)]*desc/)`, og mutanten
     * `kortHtml(x, n, loadAutoSort().desc)` OVERLEVDE den: `[^)]*` kommer
     * ikke forbi parentesen i `loadAutoSort()`. Et negativt regex på en
     * argumentliste er like skjørt som argumentlista er fri.
     *
     * Dette teller i stedet: utenom definisjonen skal hvert eneste kall ha
     * nøyaktig to argumenter. */
    const kall = [...src.matchAll(/(?<!function )kortHtml\(([^;]*?)\)/g)]
      .map(m => m[1].trim());
    expect(kall.length, 'fant ingen kall til kortHtml').toBeGreaterThan(0);
    kall.forEach(a => expect(a, 'kortHtml(' + a + ')').toBe('x, n'));
  });

  /* Og lista under SKAL fortsatt lytte. Faller denne, har jeg koblet fra
   * feil ting — og det er den eneste feilen som ville sett ut som en
   * vellykket retting. */
  it('men lista under gjør det fortsatt', () => {
    const src = require('node:fs').readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/dirRows\(_dirs, loadAutoSort\(\)\.desc/);
  });
});

describe('kortet', () => {
  const kort = () => kortHtml({ name: 'Jernbanetorget', options: OPTIONS }, 0);

  /* Denne står fra v1.181.0 og er IKKE rullet tilbake: «linje 71» var et
   * tall, og appen visste modusen uten å vise den. Det var en annen feil. */
  it('sier hvilken modus det er, med linjas egen farge', () => {
    const h = kort();
    expect(h).toMatch(/line-badge/);
    expect(h).toMatch(/e60000/);          // bussrødt, som radene under
    expect(h).toMatch(/>71</);
  });

  it('og overskriften er den raskeste', () => {
    expect(kort()).toMatch(/framme 07:40/);
  });

  /* TELLINGEN, IKKE NAVNET. «+1 annen vei» sier at det finnes mer uten å
   * dra en annen avgang inn i kortet — og et trykk bygger ruta dit og
   * sender deg til tavla, der alle linjene står. */
  it('teller de andre veiene framfor å navngi en av dem', () => {
    const h = kort();
    expect(h).toMatch(/annen vei|andre veier/);
    expect(h).not.toMatch(/T-bane|Lokalbuss|framme 07:44/);
  });

  it('og sier ingenting når det ikke finnes andre veier', () => {
    const h = kortHtml({ name: 'Ekeberg camping', options: [OPTIONS[0]] }, 0);
    expect(h).not.toMatch(/annen vei|andre veier/);
  });

  /* Og en skjermleser får det samme. En forskjell som bare er en farge er
   * en forskjell halve lesergruppa ikke har. */
  it('og aria-label bærer både modusen og tellingen', () => {
    const a = (kort().match(/aria-label="([^"]*)"/) || [])[1] || '';
    expect(a).toMatch(/07:40/);
    expect(a).toMatch(/71/);
    expect(a).toMatch(/annen vei|andre veier/);
  });
});
