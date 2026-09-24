/**
 * Etappen tar vare på geografien den allerede holder.
 *
 * `addLegToPlan` lagret ni felter, alle navn og tider — mens den i samme
 * øyeblikk holdt `dir.stopId`, `dir.toStopId`, koordinatene, og hele
 * `estimatedCalls`-lista. `_renderSelMap` tegnet kartet av nettopp den lista
 * i den SAMME tegnerunden som etappen ble lagret uten den.
 *
 * Det kostet: plankartet måtte hente reisen på nytt over nettet og finne
 * etappen ved å gjette på navn, og kalenderen målte gangtiden til stoppet for
 * den retningen du tilfeldigvis hadde valgt.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { addLegToPlan, loadPlan, clearPlan, legExtent } from '../src/api/plan.js';
import { placeLL, placeName, samePlace } from '../src/api/place.js';

const DEP = new Date(2026, 8, 24, 8, 12, 0).toISOString();
const ARR = new Date(2026, 8, 24, 8, 41, 0).toISOString();

/** Ekte stopp i Oslo. «Bryn» ER en delstreng av «Brynseng». */
const KALL = [
  ['NSR:StopPlace:BS', 'Brynseng', 59.916, 10.812],
  ['NSR:StopPlace:B', 'Bryn', 59.911, 10.807],
  ['NSR:StopPlace:H', 'Helsfyr', 59.914, 10.796],
  ['NSR:StopPlace:OS', 'Oslo S', 59.911, 10.752],
].map(([id, name, latitude, longitude]) => ({
  quay: { stopPlace: { id, name, latitude, longitude } },
  expectedDepartureTime: DEP,
}));

const call = () => ({
  expectedDepartureTime: DEP,
  quay: { stopPlace: { id: 'NSR:StopPlace:B', name: 'Bryn', latitude: 59.911, longitude: 10.807 } },
  destinationDisplay: { frontText: 'Oslo S' },
  serviceJourney: { id: 'RUT:ServiceJourney:1',
    line: { publicCode: '1', presentation: { colour: 'f5a000' } },
    estimatedCalls: KALL },
  _finalArrival: ARR,
});

const dir = () => ({
  from: 'Bryn', to: 'Oslo S',
  stopId: 'NSR:StopPlace:B', toStopId: 'NSR:StopPlace:OS',
  _fromLat: 59.911, _fromLon: 10.807, _toLat: 59.911, _toLon: 10.752,
});

describe('addLegToPlan tar vare på stedet', () => {
  beforeEach(() => clearPlan());

  it('lagrer avreisestoppet med id og koordinater', () => {
    const leg = addLegToPlan(call(), dir());
    expect(leg.from.id).toBe('NSR:StopPlace:B');
    expect(placeLL(leg.from)).toEqual({ lat: 59.911, lon: 10.807 });
  });

  // DETTE ER DET KALENDEREN TRENGTE. Uten koordinatene falt `leadMins`
  // tilbake på «standard gangtid», og alarmen var en gjetning.
  it('slik at gangtiden kan måles i det hele tatt', () => {
    const leg = addLegToPlan(call(), dir());
    expect(placeLL(leg.from)).not.toBe(null);
  });

  // `to` er DER DU GÅR AV — ikke skiltet på fronten. Den bar før
  // `destinationDisplay.frontText`, mens tavlas plan-filter sammenliknet
  // feltet med `dir.from` for å se om neste etappe starter der forrige
  // sluttet. Det gir bare mening for avstigningsstoppet.
  it('lagrer avstigningsstoppet, ikke skiltet på fronten', () => {
    const leg = addLegToPlan(call(), dir());
    expect(leg.to.id).toBe('NSR:StopPlace:OS');
    expect(placeName(leg.to)).toBe('Oslo S');
    expect(placeLL(leg.to)).toEqual({ lat: 59.911, lon: 10.752 });
  });

  it('men beholder skiltet for seg, for det står på vogna', () => {
    expect(addLegToPlan(call(), dir()).frontText).toBe('Oslo S');
  });

  it('tar vare på hele stopplista, med koordinater', () => {
    const leg = addLegToPlan(call(), dir());
    expect(leg.stops.map(s => s.name)).toEqual(['Brynseng', 'Bryn', 'Helsfyr', 'Oslo S']);
    expect(leg.stops[1]).toMatchObject({ id: 'NSR:StopPlace:B', lat: 59.911, lon: 10.807 });
  });

  it('overlever lagring og lasting', () => {
    addLegToPlan(call(), dir());
    const [lagret] = loadPlan();
    expect(placeLL(lagret.from)).toEqual({ lat: 59.911, lon: 10.807 });
    expect(lagret.stops.length).toBe(4);
  });
});

/**
 * Og da slutter plankartet å gjette.
 *
 * Med id-er er «Bryn» og «Brynseng» to steder, og etappen begynner på riktig.
 */
describe('etappens utstrekning, med steder', () => {
  beforeEach(() => clearPlan());

  it('begynner på Bryn, ikke på Brynseng', () => {
    const leg = addLegToPlan(call(), dir());
    const { fromIdx, source } = legExtent(leg.stops, leg);
    expect(leg.stops[fromIdx].name).toBe('Bryn');
    expect(source).toBe('sted');
  });

  // Uten den lagrede lista måtte dette hentes over nettet først.
  it('kan tegnes uten å spørre noen', () => {
    const leg = addLegToPlan(call(), dir());
    const tegnbare = leg.stops.filter(s => s.lat != null && s.lon != null);
    expect(tegnbare.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Og en plan lagret FØR denne endringen virker fortsatt.
 *
 * «Ingenting kastes for å rydde.» En gammel etappe har `from` som ren streng;
 * den skal vises, tegnes så godt det lar seg gjøre, og si fra at den ikke vet
 * hvor stoppet er — ikke kaste.
 */
describe('en gammel lagret etappe', () => {
  const gammel = { id: 'leg_gammel', line: '3', lineColour: 'f5a000',
    from: 'Mortensrud', to: 'Jernbanetorget', depIso: DEP, arrIso: ARR,
    serviceJourneyId: 'RUT:ServiceJourney:9', addedAt: Date.now() };

  it('viser navnene sine', () => {
    expect(placeName(gammel.from)).toBe('Mortensrud');
    expect(placeName(gammel.to)).toBe('Jernbanetorget');
  });

  it('sier at den ikke vet hvor stoppet er', () => {
    expect(placeLL(gammel.from)).toBe(null);
  });

  it('og kan fortsatt kjennes igjen som samme sted', () => {
    expect(samePlace(gammel.from, 'Mortensrud')).toBe(true);
    expect(samePlace(gammel.from, 'Mortensrud, Oslo')).toBe(true);
  });
});
