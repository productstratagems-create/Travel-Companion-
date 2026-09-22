/**
 * Serien av posisjoner.
 *
 * Spurt: «Hvordan kan Auto-reise utnytte en serie av etterfølgende gps
 * posisjoner … for å sannsynliggjøre hvilken linje vedkommende er interessert
 * i — og dermed veier tyngst når du skal sette verdien for «Du er ved»?»
 *
 * Utgangspunktet var at det ikke FINNES noen serie: `_handleFix` ser hver
 * eneste måling og kaster alt. `state.homeLL` er ett EMA-utjevnet punkt,
 * `_stationAnchor` ett punkt. Forrige måling finnes ikke når neste kommer.
 *
 * To ting faller ut av å beholde den:
 *   1. en måling som krever 80 m/s er ikke en posisjon — men ett veto må
 *      ikke låse appen ute, for hoppet kan være ekte
 *   2. en holdeplass du NÆRMER DEG er den du skal til, også når en annen er
 *      nærmere akkurat nå
 */
import { describe, it, expect } from 'vitest';
import { pushFix, closingRate, approach, TRAIL_MAX, TRAIL_MIN_MS, STILL_MS }
  from '../src/trail.js';
import { fixJump, MAX_SPEED_MS, JUMP_MIN_M } from '../src/position.js';

// En meter i breddegrad, nær nok på Oslos breddegrad for en gangfikstur.
const M = 1 / 111_320;
const HAUKETO = { lat: 59.8300, lon: 10.8050 };
/** Et punkt `n` meter nord for Hauketo. */
const nord = (n) => ({ lat: HAUKETO.lat + n * M, lon: HAUKETO.lon });
const fix = (n, atS, acc = 8) => ({ ...nord(n), at: atS * 1000, acc });

/** Et spor bygget av (meter nord, sekund)-par. */
const spor = (pairs, acc = 8) =>
  pairs.reduce((t, [n, s]) => pushFix(t, fix(n, s, acc)), []);

/** Gå mot et mål 200 m nord, to meter per sekund. */
const MOT = spor([[0, 0], [2, 1], [4, 2], [6, 3], [8, 4], [10, 5]]);
const MAAL = nord(200);

describe('pushFix', () => {
  it('holder målingene i rekkefølge, eldst først', () => {
    expect(MOT.map(f => f.at)).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
  });

  it('er ren — den gitte lista røres ikke', () => {
    const før = spor([[0, 0], [2, 1]]);
    const kopi = [...før];
    pushFix(før, fix(4, 2));
    expect(før).toEqual(kopi);
  });

  // Uten tak vokser den så lenge fanen lever: én måling i sekundet.
  it('kaster de eldste framfor å vokse uten grense', () => {
    let t = [];
    for (let i = 0; i < TRAIL_MAX + 20; i++) t = pushFix(t, fix(i, i));
    expect(t.length).toBe(TRAIL_MAX);
    expect(t[t.length - 1].at).toBe((TRAIL_MAX + 19) * 1000);
  });

  it('tar imot en unøyaktig måling, med nøyaktigheten sin', () => {
    // ACC_GATE forkaster den for prikkens del; serien skal likevel ha den,
    // ellers er den blind nettopp i bygater og tunneler.
    const t = pushFix([], fix(0, 0, 150));
    expect(t[0].acc).toBe(150);
  });

  it('avviser noe som ikke er en måling', () => {
    expect(pushFix([], null)).toEqual([]);
    expect(pushFix([], { lat: 59.8, lon: null, at: 1 })).toEqual([]);
    expect(pushFix([], { lat: 59.8, lon: 10.8 })).toEqual([]);
  });
});

describe('closingRate', () => {
  // Negativ = avstanden krymper. To meter i sekundet mot målet.
  it('er negativ når du nærmer deg', () => {
    const r = closingRate(MOT, MAAL);
    expect(r).toBeLessThan(0);
    expect(r).toBeCloseTo(-2, 0);
  });

  it('er positiv når du går fra', () => {
    const fra = spor([[0, 0], [-2, 1], [-4, 2], [-6, 3], [-8, 4], [-10, 5]]);
    expect(closingRate(fra, MAAL)).toBeGreaterThan(0);
  });

  it('er omtrent null når du står stille', () => {
    const staa = spor([[0, 0], [0.4, 1], [0, 2], [0.3, 3], [0, 4], [0.2, 5]]);
    expect(Math.abs(closingRate(staa, MAAL))).toBeLessThan(0.5);
  });

  // «VET IKKE» ER EN EKTE VERDI. Med ett punkt, eller med et par målinger et
  // øyeblikk fra hverandre, har serien ingenting å si — og da skal skjermen
  // være nøyaktig som i dag.
  it('sier ingenting om en serie som er for kort', () => {
    expect(closingRate([], MAAL)).toBeNull();
    expect(closingRate(spor([[0, 0]]), MAAL)).toBeNull();
  });

  it('sier ingenting om en serie som spenner for kort tid', () => {
    const kort = spor([[0, 0], [2, (TRAIL_MIN_MS / 1000) - 1]]);
    expect(closingRate(kort, MAAL)).toBeNull();
  });

  it('sier ingenting uten et mål', () => {
    expect(closingRate(MOT, null)).toBeNull();
    expect(closingRate(MOT, { lat: null, lon: 10.8 })).toBeNull();
  });
});

describe('approach', () => {
  it('kjenner igjen at du går mot', () => {
    const a = approach(MOT, MAAL);
    expect(a.kind).toBe('mot');
    // Og den vet hvor lenge til: 190 m igjen i to meter i sekundet.
    expect(a.etaS).toBeGreaterThan(60);
    expect(a.etaS).toBeLessThan(140);
  });

  it('kjenner igjen at du går fra, og lover da ingen ankomst', () => {
    const fra = spor([[0, 0], [-2, 1], [-4, 2], [-6, 3], [-8, 4], [-10, 5]]);
    const a = approach(fra, MAAL);
    expect(a.kind).toBe('fra');
    expect(a.etaS).toBeNull();
  });

  it('kjenner igjen at du står', () => {
    const staa = spor([[0, 0], [0.4, 1], [0, 2], [0.3, 3], [0, 4], [0.2, 5]]);
    expect(approach(staa, MAAL).kind).toBe('staar');
  });

  // Dette er tilstanden en ny leser, en fersk fane og en stillestående
  // telefon er i — den vanligste av dem alle.
  it('sier «vet ikke» framfor å gjette', () => {
    expect(approach([], MAAL).kind).toBe('vet-ikke');
    expect(approach(spor([[0, 0]]), MAAL).kind).toBe('vet-ikke');
    expect(approach(MOT, null).kind).toBe('vet-ikke');
  });

  // «Vet ikke» og «går fra» må ikke kunne forveksles: den ene skal la
  // skjermen være, den andre skal dytte holdeplassen ned.
  it('skiller «vet ikke» fra «går fra»', () => {
    expect(approach([], MAAL).kind).not.toBe('fra');
  });

  it('tåler en tom eller ødelagt serie uten å kaste', () => {
    expect(() => approach(null, MAAL)).not.toThrow();
    expect(() => approach([{}], MAAL)).not.toThrow();
  });
});

/**
 * Vetoet: en fysisk umulig måling er ikke en posisjon.
 *
 * Dette er det som sto bak «DU ER VED Jernbanetorget · 10221 m å gå» — appen
 * hadde ingenting å sammenlikne den ene målingen med.
 */
describe('fixJump', () => {
  const pt = (n, atS) => ({ ...nord(n), at: atS * 1000 });

  it('godtar en gange', () => {
    expect(fixJump(pt(0, 0), pt(2, 1)).jumped).toBe(false);
  });

  it('godtar et tog i 200 km/t', () => {
    // 55 m/s — under taket, og det er meningen: appen skal ikke kaste en
    // ekte reise.
    expect(fixJump(pt(0, 0), pt(55, 1)).jumped).toBe(false);
  });

  it('nekter ti kilometer på tre sekunder', () => {
    const j = fixJump(pt(0, 0), pt(10000, 3));
    expect(j.jumped).toBe(true);
    expect(j.metres).toBeGreaterThan(9000);
    expect(j.speed).toBeGreaterThan(MAX_SPEED_MS);
  });

  // Klokka kan stå stille eller gå bakover (fanen var i bakgrunnen, klokka
  // ble stilt). Da er farten ikke definert, og en udefinert fart er ikke
  // bevis for et hopp.
  it('påstår ingenting når tiden ikke går framover', () => {
    expect(fixJump(pt(0, 5), pt(10000, 5)).jumped).toBe(false);
    expect(fixJump(pt(0, 9), pt(10000, 5)).jumped).toBe(false);
  });

  it('påstår ingenting uten et forrige punkt', () => {
    expect(fixJump(null, pt(0, 0)).jumped).toBe(false);
  });

  // FUNNET AV TESTSUITEN, ikke av resonnement. watchPosition kan levere to
  // målinger et millisekund fra hverandre, og to meter på ett millisekund er
  // 2000 m/s. Vetoet slo da inn på ren støy, kastet posisjonen og tvang et
  // nytt oppslag — fem der det skulle vært to.
  it('kaller ikke to meter et hopp, uansett hva klokka sier', () => {
    const tett = { lat: HAUKETO.lat, lon: HAUKETO.lon, at: 1000 };
    const tettEtter = { ...nord(2), at: 1001 };
    expect(fixJump(tett, tettEtter).speed).toBeGreaterThan(MAX_SPEED_MS);
    expect(fixJump(tett, tettEtter).jumped).toBe(false);
  });

  it('men gulvet slipper et ekte sprang gjennom', () => {
    const langt = fixJump(pt(0, 0), pt(JUMP_MIN_M + 50, 1));
    expect(langt.jumped).toBe(true);
  });
});
