/**
 * «Du er på 3 mot Kolsås» — auto-reise kjenner igjen at du sitter på.
 *
 * «Du er ved» er bygget for en som går. For en som sitter på et kjøretøy
 * bytter «nærmeste stopp» hvert halve minutt, og appen kunne ikke si hva du
 * sitter på — selv om den kan bli med på en reise (`joinJourney`).
 *
 * Kilden lå i hvert tavlesvar: `serviceJourney.estimatedCalls`, hvert stopp
 * med koordinater og forventet tid. Følger én avgangs forventede posisjon
 * sporet ditt over tid, sitter du sannsynligvis på den. TID, ikke bare
 * geometri — to linjer i samme gate skilles av rutetidene.
 *
 * FIKSTURENE ER BYGGET HERFRA. Tersklene er valgt av resonnement og kan bare
 * settes på en ekte tur; reiseloggen er bygget for den målingen.
 */
import { describe, it, expect } from 'vitest';
import {
  ombord, reiseMeta, OMBORD_KINDS, OMBORD_MIN_FART_MS, OMBORD_MIN_FIKSER,
  OMBORD_MIN_SPENN_MS, OMBORD_MAKS_AVVIK_M,
} from '../src/api/ombord.js';
import { metresBetween } from '../src/haversine.js';

const T0 = Date.UTC(2026, 10, 2, 7, 0, 0);
const S = 1000;

/* En rett linje østover langs 59.9° N. 1° lengde ≈ 55,8 km her. */
const LAT = 59.9;
const lon = (m) => 10.70 + m / 55_800;
const fiks = (m, t, acc = 10) => ({ lat: LAT, lon: lon(m), at: T0 + t * S, acc });

/** Kjøretøy i `fart` m/s som startet `start` meter fra origo. */
const forventet = (start, fart, spor) => spor.map(f => ({
  at: f.at, lat: LAT, lon: lon(start + fart * (f.at - T0) / S) }));
const kandidat = (nøkkel, linje, front, start, fart, spor) =>
  ({ nøkkel, linje, front, call: { id: nøkkel }, forventet: forventet(start, fart, spor) });

/* Du, på buss 37 i 10 m/s, fire fikser over 30 sekunder. */
const SPOR = [0, 10, 20, 30].map(t => fiks(10 * t, t));

describe('fiksturen selv', () => {
  it('sporet beveger seg i den farten det sier', () => {
    const d = metresBetween(SPOR[0], SPOR[3]);
    expect(Math.abs(d - 300)).toBeLessThan(5);
  });
  it('og har nok fikser over nok tid', () => {
    expect(SPOR.length).toBeGreaterThanOrEqual(OMBORD_MIN_FIKSER);
    expect(SPOR[SPOR.length - 1].at - SPOR[0].at).toBeGreaterThanOrEqual(OMBORD_MIN_SPENN_MS);
  });
});

describe('du sitter på buss 37', () => {
  it('kjennes igjen', () => {
    const d = ombord({ spor: SPOR, fartMS: 10,
      kandidater: [kandidat('37', '37', 'Helsfyr', 0, 10, SPOR)] });
    expect(d.kind).toBe('ombord');
    expect(d.kandidater.map(k => k.linje)).toEqual(['37']);
  });

  /* TIDEN SKILLER. Samme gate, samme retning, samme fart — men fire
   * minutter bak. Med geometri alene ville den vært et treff. */
  it('men ikke bussen fire minutter bak, på samme trasé', () => {
    const d = ombord({ spor: SPOR, fartMS: 10,
      kandidater: [kandidat('37b', '37', 'Helsfyr', -2400, 10, SPOR)] });
    expect(d.kind).toBe('vet-ikke');
  });

  /* To linjer på samme trasé til samme tid: ikke gjett. */
  it('og to som følger deg like godt gir tvil, ikke et valg', () => {
    const d = ombord({ spor: SPOR, fartMS: 10, kandidater: [
      kandidat('20', '20', 'Skøyen', 0, 10, SPOR), kandidat('37', '37', 'Helsfyr', 20, 10, SPOR)] });
    expect(d.kind).toBe('ombord-tvil');
    expect(d.kandidater.map(k => k.linje).sort()).toEqual(['20', '37']);
  });

  it('og en som bare følger deg et stykke er ikke en kandidat', () => {
    // Kjøretøyet i 5 m/s: ved t=30 er det 150 m bak deg.
    const d = ombord({ spor: SPOR, fartMS: 10,
      kandidater: [kandidat('x', '74', 'Mortensrud', 0, 4, SPOR)] });
    expect(d.kind).toBe('vet-ikke');
  });
});

describe('det appen ikke vet', () => {
  /* Du GÅR. «Du er ved» er riktig spørsmål, og dommen skal tie. */
  it('i gangfart sier den ingenting', () => {
    const gå = [0, 10, 20, 30].map(t => fiks(1.4 * t, t));
    const d = ombord({ spor: gå, fartMS: 1.4,
      kandidater: [kandidat('37', '37', 'Helsfyr', 0, 1.4, gå)] });
    expect(d.kind).toBe('vet-ikke');
    expect(d.grunn).toBe('går');
  });

  it('uten fart sier den ingenting', () => {
    const d = ombord({ spor: SPOR, fartMS: null, kandidater: [kandidat('37', '37', 'H', 0, 10, SPOR)] });
    expect(d.kind).toBe('vet-ikke');
  });

  it('med for kort spor sier den ingenting', () => {
    const kort = SPOR.slice(0, 2);
    const d = ombord({ spor: kort, fartMS: 10, kandidater: [kandidat('37', '37', 'H', 0, 10, kort)] });
    expect(d.kind).toBe('vet-ikke');
    expect(d.grunn).toBe('kort-spor');
  });

  /* EN FIKS FOR UNØYAKTIG TIL Å DØMME ER IKKE BEVIS — verken for eller
   * imot. Den skal ikke felle en ekte kandidat. */
  it('én fiks på ±300 m midt i et godt spor feller ikke kandidaten', () => {
    const spor = [fiks(0, 0), fiks(100, 10), fiks(900, 20, 300), fiks(300, 30), fiks(400, 40)];
    const d = ombord({ spor, fartMS: 10, kandidater: [kandidat('37', '37', 'H', 0, 10, spor)] });
    expect(d.kind).toBe('ombord');
  });

  /* FIKSENS EGEN USIKKERHET TREKKES FRA. En fiks på ±100 m som ligger
   * 200 m fra forventet posisjon kan godt være 100 m unna. Uten fratrekket
   * ville én middels fiks felt en ekte kandidat. Funnet av en mutant som
   * overlevde første runde: ±300-testen over så det ikke, fordi så
   * unøyaktige fikser filtreres bort før avstanden måles. */
  it('en middels fiks 200 m unna feller ikke kandidaten', () => {
    const spor = [fiks(0, 0), fiks(100, 10), fiks(400, 20, 100), fiks(300, 30)];
    const d = ombord({ spor, fartMS: 10, kandidater: [kandidat('37', '37', 'H', 0, 10, spor)] });
    expect(d.kind).toBe('ombord');
  });

  /* Mange fikser på kort tid er ett punkt, ikke et spor. Første utgave av
   * testen for kort spor hadde to fikser og falt på ANTALL — så en mutant
   * som fjernet tidskravet overlevde. */
  it('og mange fikser over seks sekunder er ikke et spor', () => {
    const tett = [0, 2, 4, 6].map(t => fiks(10 * t, t));
    const d = ombord({ spor: tett, fartMS: 10, kandidater: [kandidat('37', '37', 'H', 0, 10, tett)] });
    expect(d.kind).toBe('vet-ikke');
    expect(d.grunn).toBe('kort-spor');
  });

  /* Men et spor der ALT er for unøyaktig er ikke et spor. Uten denne ville
   * fikser på ±300 m «passet» hvilken som helst buss i nabolaget. */
  it('men et spor av bare unøyaktige fikser beviser ingenting', () => {
    const spor = [0, 10, 20, 30].map(t => fiks(10 * t + 250, t, 300));
    const d = ombord({ spor, fartMS: 10, kandidater: [kandidat('37', '37', 'H', 0, 10, spor)] });
    expect(d.kind).toBe('vet-ikke');
  });

  it('og en kandidat uten forventet posisjon ved en fiks følger ikke', () => {
    const k = kandidat('37', '37', 'H', 0, 10, SPOR);
    k.forventet[2] = { at: k.forventet[2].at, lat: null, lon: null };
    expect(ombord({ spor: SPOR, fartMS: 10, kandidater: [k] }).kind).toBe('vet-ikke');
  });

  it('tåler søppel', () => {
    expect(ombord(null).kind).toBe('vet-ikke');
    expect(ombord({}).kind).toBe('vet-ikke');
    expect(() => ombord({ spor: SPOR, fartMS: 10, kandidater: [null, {}] })).not.toThrow();
  });
});

describe('vokabularet og tallene', () => {
  it('tre domsord', () => {
    expect(OMBORD_KINDS).toEqual(['ombord', 'ombord-tvil', 'vet-ikke']);
  });
  it('tallene er navngitt og fornuftige', () => {
    expect(OMBORD_MIN_FART_MS).toBeGreaterThan(2.5);      // raskere enn rask gange
    expect(OMBORD_MAKS_AVVIK_M).toBeGreaterThan(50);
  });
});

/* ── REISEN DU BLIR MED PÅ ──────────────────────────────────────────────
 *
 * `joinJourney(meta, toIdx)` setter reisen fra `calls[0]`. Bygd fra hele
 * turen ville du «gått på» ved endeholdeplassen for en halvtime siden. Den
 * starter ved stoppet du sist passerte. */
describe('reiseMeta', () => {
  const kall = (navn, m) => ({
    quay: { publicCode: '1', latitude: LAT, longitude: lon(m * 100),
      stopPlace: { id: 'NSR:StopPlace:' + navn, name: navn } },
    aimedDepartureTime: new Date(T0 + m * 60 * S).toISOString(),
    expectedDepartureTime: new Date(T0 + m * 60 * S).toISOString(),
  });
  const CALL = {
    destinationDisplay: { frontText: 'Helsfyr' },
    serviceJourney: { id: 'RUT:ServiceJourney:37-1',
      line: { publicCode: '37', transportMode: 'bus', presentation: { colour: 'e60000' } },
      estimatedCalls: [kall('Nydalen', -10), kall('Storo', -3), kall('Sinsen', 2), kall('Helsfyr', 9)] },
  };

  it('starter ved stoppet du sist passerte', () => {
    const m = reiseMeta(CALL, T0);
    expect(m.calls.map(c => c.name)).toEqual(['Storo', 'Sinsen', 'Helsfyr']);
  });

  it('og bærer det joinJourney trenger', () => {
    const m = reiseMeta(CALL, T0);
    expect(m).toMatchObject({ lineCode: '37', lineBg: '#e60000', mode: 'bus',
      dest: 'Helsfyr', journeyId: 'RUT:ServiceJourney:37-1' });
    expect(m.calls[0]).toMatchObject({ name: 'Storo', quay: '1' });
    expect(Number.isFinite(m.calls[0].lat)).toBe(true);
  });

  it('og gir null uten kall', () => {
    expect(reiseMeta({ serviceJourney: {} }, T0)).toBeNull();
    expect(reiseMeta(null, T0)).toBeNull();
  });
});
