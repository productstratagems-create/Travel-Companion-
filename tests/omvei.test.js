/**
 * Byttelinja sier det når gangveien er en omvei — og hvorfor.
 *
 * Rapportert med skjermbilde: buss 74 av på Jernbanetorget plattform A, trikk
 * 12 på fra plattform B. Kartet tegnet gangen som en sløyfe via Karl Johans
 * gate, og byttelinja sa bare «gå 1 min (ca 60 m)». Plattformene står nesten
 * vegg i vegg, så det leste som en feil.
 *
 * DET ER IKKE EN FEIL. Undersøkt 2026-11-02 (docs/produktretning.md):
 *   - Journey Planner: gang A → B 63,05 m / 71 s, 5,7 m i luftlinje.
 *   - NVDB vegnett: KV11926 (enkel bilveg) krysser linja A–B, 2,1 m fra A.
 *   - NVDB 174 Gangfelt: nærmeste er lysregulert, ca 22 m unna — og gangruten
 *     går gjennom det.
 * Så appen skal IKKE tegne en rett strek (den ville gått over kjørebanen).
 * Den skal si hva den vet: plattformene er nær, gangveien går rundt, og
 * gjennom hvilken gate — fra `steps`, som Journey Planner allerede gir.
 *
 * Fiksturen er det ekte svaret, kvai for kvai og steg for steg.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { reiselop, omvei, OMVEI_FAKTOR, OMVEI_MAKS_LUFT_M } from '../src/ui/reiselop.js';

const T0 = Date.UTC(2026, 10, 3, 21, 49, 0);
const iso = m => new Date(T0 + m * 60000).toISOString();
const klk = s => { const d = new Date(s);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
const tekst = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const kall = (navn, m) => ({ quay: { stopPlace: { id: 'NSR:StopPlace:' + navn, name: navn } },
  aimedDepartureTime: iso(m), expectedDepartureTime: iso(m), aimedArrivalTime: iso(m), expectedArrivalTime: iso(m) });

// Kvaienes egne koordinater, fra registeret.
const A = { name: 'Jernbanetorget', latitude: 59.911425, longitude: 10.749736 };   // NSR:Quay:7203
const B = { name: 'Jernbanetorget', latitude: 59.911401, longitude: 10.749827 };   // NSR:Quay:7210

// Gangens form, slik Journey Planner dekodet den (11 punkter, ca 64 m).
const FORM = [[59.91142, 10.74973], [59.91142, 10.74973], [59.91129, 10.74958], [59.91119, 10.74949],
  [59.91119, 10.74951], [59.91118, 10.74954], [59.91118, 10.74957], [59.91117, 10.7496],
  [59.91127, 10.74969], [59.9114, 10.74981], [59.9114, 10.74982]];
// …og stegene, ordrett fra svaret.
const STEG = [
  { distance: 16.41, relativeDirection: 'depart', streetName: 'Jernbanetorget A', area: true, bogusName: false },
  { distance: 12.16, relativeDirection: 'continue', streetName: 'fortau', area: false, bogusName: true },
  { distance: 6.49, relativeDirection: 'left', streetName: 'Karl Johans gate', area: false, bogusName: false },
  { distance: 12.19, relativeDirection: 'left', streetName: 'gangvei', area: false, bogusName: true },
  { distance: 15.81, relativeDirection: 'continue', streetName: 'Plattform B', area: false, bogusName: false },
];

const BUSS = {
  mode: 'bus', fromPlace: { name: 'Ekeberghallen', latitude: 59.8912, longitude: 10.7806 }, toPlace: A,
  serviceJourney: { id: 'SJ74', line: { publicCode: '74', presentation: { colour: 'e60000' } },
    estimatedCalls: [kall('Ekeberghallen', 0), kall('Jernbanetorget', 10)] },
  fromEstimatedCall: { expectedDepartureTime: iso(0), aimedDepartureTime: iso(0),
    quay: { publicCode: '' }, destinationDisplay: { frontText: 'Jernbanetorget' } },
  toEstimatedCall: { expectedArrivalTime: iso(10), aimedArrivalTime: iso(10), quay: { publicCode: 'A' } },
};
const gang = (o = {}) => ({ mode: 'foot', fromPlace: A, toPlace: B,
  expectedStartTime: iso(10), expectedEndTime: iso(11), _shape: FORM, steps: STEG, ...o });
const TRIKK = {
  mode: 'tram', fromPlace: B, toPlace: { name: 'Aker brygge', latitude: 59.911, longitude: 10.729 },
  serviceJourney: { id: 'SJ12', line: { publicCode: '12', presentation: { colour: '0b91ef' } },
    estimatedCalls: [kall('Jernbanetorget', 15), kall('Aker brygge', 22)] },
  fromEstimatedCall: { expectedDepartureTime: iso(15), aimedDepartureTime: iso(15),
    quay: { publicCode: 'B' }, destinationDisplay: { frontText: 'Majorstuen' } },
  toEstimatedCall: { expectedArrivalTime: iso(22), aimedArrivalTime: iso(22), quay: { publicCode: 'G' } },
};
const lag = (g = gang()) => tekst(reiselop([BUSS, g, TRIKK],
  { fra: 'Ekeberghallen', til: 'Aker brygge', clk: klk, ekstraMin: 0 }));

describe('det rapporterte byttet', () => {
  it('sier at plattformene ligger tett, og hvor gangveien går', () => {
    const t = lag();
    expect(t).toMatch(/plattformene ligger ca 6 m fra hverandre/i);
    expect(t).toMatch(/gangveien går om Karl Johans gate/);
  });
  it('beholder gangtid, lengde og plattform som før', () => {
    expect(lag()).toMatch(/gå 1 min \(ca 60 m\) til plattform B/);
  });
  it('og byttedommen er den samme med og uten omvei-teksten', () => {
    const dom = t => (t.match(/— (god tid|stramt|rekker du ikke)/) || [])[1];
    expect(dom(lag())).toBeTruthy();
    expect(dom(lag())).toBe(dom(lag(gang({ steps: undefined, _shape: null }))));
  });
});

describe('navnene fra stegene', () => {
  it('tar bare ekte gatenavn: ikke plattformer, områder eller oppdiktede («fortau», «gangvei»)', () => {
    expect(omvei(A, B, [gang()]).via).toEqual(['Karl Johans gate']);
  });
  it('heller ikke stoppets eget navn når OSM har tegnet plattformen som en strek', () => {
    const steg = [{ streetName: 'Jernbanetorget A', bogusName: false, area: false }, ...STEG.slice(1)];
    expect(omvei(A, B, [gang({ steps: steg })]).via).toEqual(['Karl Johans gate']);
  });
  it('uten steg: sier avstanden, ikke en gate', () => {
    const o = omvei(A, B, [gang({ steps: undefined })]);
    expect(o.via).toEqual([]);
    expect(lag(gang({ steps: undefined }))).toMatch(/plattformene ligger ca 6 m fra hverandre, men gangveien er ca 60 m/i);
  });
  it('to gater nevnes begge, i rekkefølge, uten gjentakelse', () => {
    const steg = [...STEG, { streetName: 'Fred Olsens gate', bogusName: false, area: false },
      { streetName: 'Karl Johans gate', bogusName: false, area: false }];
    expect(omvei(A, B, [gang({ steps: steg })]).via).toEqual(['Karl Johans gate', 'Fred Olsens gate']);
  });
});

describe('når det IKKE er en omvei', () => {
  it('en vanlig gang (form omtrent som luftlinja) sier ingenting nytt', () => {
    const rett = [[A.latitude, A.longitude], [B.latitude, B.longitude]];
    expect(omvei(A, B, [gang({ _shape: rett })])).toBeNull();
    expect(lag(gang({ _shape: rett }))).not.toMatch(/fra hverandre/);
  });
  it('plattformer langt fra hverandre er ikke «tett», uansett forhold', () => {
    const langt = { ...B, latitude: A.latitude + 0.0012 };   // ca 130 m nord
    const sløyfe = [[A.latitude, A.longitude], [A.latitude, A.longitude + 0.006], [langt.latitude, langt.longitude]];
    expect(omvei(A, langt, [gang({ toPlace: langt, _shape: sløyfe })])).toBeNull();
  });
  it('uten form vet vi ingenting om veien, og sier ingenting', () => {
    expect(omvei(A, B, [gang({ _shape: null })])).toBeNull();
  });
  it('uten kvaienes koordinater heller ikke', () => {
    expect(omvei({ name: 'x' }, B, [gang()])).toBeNull();
  });
});

describe('tersklene har ett navn', () => {
  it('gangveien minst tre ganger luftlinja, luftlinja under 100 m', () => {
    expect(OMVEI_FAKTOR).toBe(3);
    expect(OMVEI_MAKS_LUFT_M).toBe(100);
  });
  it('og de bærer regelen: rett over faktoren slår til, rett under ikke', () => {
    // Luftlinje ca 5,7 m. En form på 2,9× og 3,1× av den.
    const luft = omvei(A, B, [gang()]).luft;
    const ut = (f) => { const d = (f * luft) / 2 / 111320;   // opp og ned igjen
      return [[A.latitude, A.longitude], [A.latitude + d, A.longitude], [A.latitude, A.longitude]]; };
    expect(omvei(A, B, [gang({ _shape: ut(OMVEI_FAKTOR * 1.05) })])).not.toBeNull();
    expect(omvei(A, B, [gang({ _shape: ut(OMVEI_FAKTOR * 0.95) })])).toBeNull();
  });
});

describe('spørringen ber om stegene', () => {
  it('på hver etappe, men ikke i den minimale nødspørringen', async () => {
    const { tripGQL } = await import('../src/api/queries.js');
    const full = tripGQL('NSR:StopPlace:1', 'NSR:StopPlace:2', null, 12, 1.3, 0);
    const min = tripGQL('NSR:StopPlace:1', 'NSR:StopPlace:2', null, 12, 1.3, 0, true);
    expect(full).toMatch(/steps\{[^}]*streetName[^}]*\}/);
    expect(full).toMatch(/steps\{[^}]*bogusName[^}]*\}/);
    expect(full).toMatch(/steps\{[^}]*area[^}]*\}/);
    expect(min).not.toMatch(/steps\{/);
  });
});
