// Låsen på turen du sitter på: auto-reise bytter ikke mellom en busslinje og
// en T-banelinje under samme tur.
//
// Rapportert: «Nå svitsjer den mellom stasjoner på en busslinje og en
// tbanelinje under samme reise, det er ulogisk og gir ikke mening for et
// menneske i tid og rom.»
import { describe, it, expect } from 'vitest';
import { ombord, stoppPåLinja, OMBORD_MAKS_AVVIK_M } from '../src/api/ombord.js';
import { oppdaterLås, LÅS_STOPP_MS, LÅS_BRUDD_MS } from '../src/api/ombordLaas.js';

const T0 = Date.parse('2026-11-05T07:00:00Z');
const S = 1000;
const kall = (id, lat, min) => ({ expectedDepartureTime: new Date(T0 + min * 60 * S).toISOString(),
  quay: { latitude: lat, longitude: 10.83, stopPlace: { id, name: id, latitude: lat, longitude: 10.83 } } });
// Bussen kjører nordover langs lengdegrad 10.83, ca 8 m/s, med stopp ved Holdeplass B.
const BUSS = [kall('A', 59.850, 0), kall('B', 59.856, 2), kall('C', 59.866, 6)];
const posBuss = (t) => {                       // der bussen er, sekunder etter T0
  if (t < 90) return 59.850 + 0.000068 * t;        // ~7,5 m/s
  if (t < 130) return 59.850 + 0.000068 * 90;      // står ved B i 40 s
  return 59.850 + 0.000068 * 90 + 0.000068 * (t - 130);
};
const fiks = (t, dLat = 0) => ({ lat: posBuss(t) + dLat, lon: 10.83, at: T0 + t * S, acc: 10 });
const kand = (linje, kallene, pos) => (spor) => ({ nøkkel: 'sj' + linje, linje,
  call: { serviceJourney: { id: 'sj' + linje, estimatedCalls: kallene } },
  forventet: spor.map(f => ({ at: f.at, lat: pos((f.at - T0) / S), lon: 10.83 })) });
const B76 = kand('76', BUSS, posBuss);
// T-banen er et annet sted (1 km øst), med en stasjon nærmere enn bussens neste stopp.
const T3 = (spor) => ({ nøkkel: 'sj3', linje: '3', call: { serviceJourney: { id: 'sj3', estimatedCalls: [kall('TBANE', 59.857, 3)] } },
  forventet: spor.map(f => ({ at: f.at, lat: f.lat, lon: 10.85 })) });

/** Én tur, tikk for tikk. Gir overskriftens stopp hvert tikk, gammelt og nytt. */
function tur(fikser, fart) {
  let lås = null; const gammel = [], ny = [], hendelser = [];
  for (let i = 3; i < fikser.length; i++) {
    const spor = fikser.slice(Math.max(0, i - 11), i + 1), nå = spor[spor.length - 1].at;
    const dom = ombord({ spor, fartMS: fart(i), kandidater: [B76(spor), T3(spor)] });
    const fri = stoppPåLinja(dom, nå, []);
    gammel.push(fri ? fri.stop.id : 'NÆRMESTE=TBANE');
    const r = oppdaterLås(lås, { låstK: lås ? B76(spor) : null, vinner: dom.kind === 'ombord' ? dom.kandidater[0] : null,
      fartMS: fart(i), spor, nå });
    if (r.hendelse) hendelser.push(r.hendelse);
    lås = r.lås;
    ny.push(lås ? 'BUSS' : (fri ? fri.stop.id : 'NÆRMESTE=TBANE'));
  }
  return { gammel, ny, hendelser, lås };
}

const FIKSER = Array.from({ length: 36 }, (_, i) => fiks(i * 5));          // 3 min, hvert 5. sekund
const FART = (i) => (i * 5 >= 90 && i * 5 < 130 ? 0 : 7.5);

describe('en busstur med stopp ved holdeplassen', () => {
  it('før-bildet: uten lås faller overskriften til T-banen når bussen står', () => {
    expect(tur(FIKSER, FART).gammel).toContain('NÆRMESTE=TBANE');
  });
  it('med lås: aldri T-banen etter at bussen er låst', () => {
    const { ny, hendelser } = tur(FIKSER, FART);
    const fra = ny.indexOf('BUSS');
    expect(fra).toBeGreaterThanOrEqual(0);
    expect(ny.slice(fra).every(x => x === 'BUSS')).toBe(true);
    expect(hendelser).toEqual(['låst']);
  });
});

describe('låsen slippes når den skal', () => {
  const låst = () => ({ k: B76([fiks(0)]), stilleFra: null });
  it('du går av: sporet går bort fra bussen i over et minutt', () => {
    const spor = Array.from({ length: 14 }, (_, i) => fiks(60 + i * 5, 0.004 + i * 0.0001));   // ~450 m unna
    const nå = spor[spor.length - 1].at;
    expect(oppdaterLås(låst(), { låstK: B76(spor), fartMS: 1.2, spor, nå }).hendelse).toBe('sluppet:brudd');
  });
  it('én dårlig fiks slipper den ikke', () => {
    const spor = [fiks(60), fiks(65), fiks(70), fiks(75, 0.004)];
    expect(oppdaterLås(låst(), { låstK: B76(spor), fartMS: 7, spor, nå: spor[3].at }).lås).not.toBeNull();
  });
  it('stille lenger enn tre minutter: sluppet', () => {
    const l1 = oppdaterLås(låst(), { fartMS: 0, spor: [], nå: T0 + 10 * S }).lås;
    expect(oppdaterLås(l1, { fartMS: 0, spor: [], nå: T0 + 10 * S + LÅS_STOPP_MS + 1 }).hendelse).toBe('sluppet:stille');
  });
  it('stille kortere: holdes', () => {
    const l1 = oppdaterLås(låst(), { fartMS: 0, spor: [], nå: T0 + 10 * S }).lås;
    expect(oppdaterLås(l1, { fartMS: 0, spor: [], nå: T0 + 10 * S + LÅS_STOPP_MS - 1 }).lås).not.toBeNull();
  });
  it('ved endestasjonen: sluppet', () => {
    expect(oppdaterLås(låst(), { fartMS: 7, spor: [], nå: T0 + 7 * 60 * S }).hendelse).toBe('sluppet:ende');
  });
  it('tersklene', () => {
    expect(LÅS_BRUDD_MS).toBe(60_000);
    expect(OMBORD_MAKS_AVVIK_M).toBe(150);
  });
});

describe('koblingen', () => {
  const s = require('node:fs').readFileSync('src/views/auto.js', 'utf8');
  it('«du er ved» bruker låsen', () => {
    expect(s).toContain('const påLinja = _påLinjaMedLås(nåW);');
    expect(s).toMatch(/const r = oppdaterLås\(_lås, \{ låstK, vinner/);
  });
  it('låst er i fart, også når bussen står', () => {
    expect(s).toContain('const fart = iFart(fartNå(Date.now())) || !!_lås;');
  });
});
