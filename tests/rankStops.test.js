/**
 * Ranking the nearby stops by use.
 *
 * Asked for: "Rangér «du er ved» basert på bruk. Steder ofte i bruk kan
 * foreslås foran steder som er nærmere."
 *
 * That reverses v1.76.0's "nearest wins, always" — which was right then, when
 * the app preferred metro stations and hid kerbside bus stops entirely. Now
 * that every stop is in the list, the nearest is often one the reader has
 * never used. Reported from Mortensrud, where the stop they take every day
 * sat fifth at 649 m behind four they have never boarded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/storage.js', () => {
  let store = {};
  return { storage: {
    get: (k) => store[k] ?? null,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
  } };
});

import { rankStops, CLOSE_M } from '../src/views/auto.js';
import { depUses, usesOf, trackPlace } from '../src/api/usage.js';
import { storage } from '../src/storage.js';

beforeEach(() => storage._reset());

const s = (name, distM, id) => ({ name, distM, id: id || 'NSR:StopPlace:' + name });
const used = (name, n, id) => {
  for (let i = 0; i < n; i++) trackPlace('dep', name, { stopId: id || 'NSR:StopPlace:' + name });
};
const names = (list) => list.map(x => x.name);

// The reported screen, stop for stop.
const MORTENSRUD = [
  s('Olasrudveien', 369), s('Granebakken', 429), s('Stenbråten', 496),
  s('Maikollen', 548), s('Mortensrud', 649),
];

describe('the order before this change', () => {
  it('put the stop you take every day fifth', () => {
    // No history: distance alone, which is what shipped.
    expect(names(rankStops(MORTENSRUD, depUses()))).toEqual([
      'Olasrudveien', 'Granebakken', 'Stenbråten', 'Maikollen', 'Mortensrud']);
  });
});

describe('rankStops', () => {
  it('puts a stop you use ahead of nearer ones you never have', () => {
    used('Mortensrud', 14);
    expect(names(rankStops(MORTENSRUD, depUses()))[0]).toBe('Mortensrud');
  });

  it('orders several used stops by how often, then by distance', () => {
    used('Maikollen', 3);
    used('Mortensrud', 14);
    used('Granebakken', 3);
    expect(names(rankStops(MORTENSRUD, depUses()))).toEqual([
      'Mortensrud',                    // 14
      'Granebakken', 'Maikollen',      // 3 each — 429 m before 548 m
      'Olasrudveien', 'Stenbråten',    // never used, by distance
    ]);
  });

  // ── The half that is easy to lose ───────────────────────────────────────
  //
  // Standing at a bus stop you have never used, the app must not name
  // somewhere six hundred metres away. Inside GPS accuracy you are there.
  it('lets a stop you are standing at win anyway', () => {
    used('Mortensrud', 40);
    const list = [s('Ryenkrysset', 30), ...MORTENSRUD];
    expect(names(rankStops(list, depUses()))[0]).toBe('Ryenkrysset');
  });

  it('draws that line at CLOSE_M, in both directions', () => {
    used('Mortensrud', 40);
    const inside = [s('Nær', CLOSE_M), ...MORTENSRUD];
    const outside = [s('Nær', CLOSE_M + 1), ...MORTENSRUD];
    expect(names(rankStops(inside, depUses()))[0]).toBe('Nær');
    expect(names(rankStops(outside, depUses()))[0]).toBe('Mortensrud');
  });

  it('orders several very near stops by distance among themselves', () => {
    used('B', 40);
    expect(names(rankStops([s('B', 80), s('A', 20)], depUses()))).toEqual(['A', 'B']);
  });

  it('leaves the list alone when there is no history at all', () => {
    expect(names(rankStops(MORTENSRUD, depUses()))).toEqual(names(MORTENSRUD));
  });

  it('does not touch the array it was given', () => {
    used('Mortensrud', 5);
    const before = names(MORTENSRUD);
    rankStops(MORTENSRUD, depUses());
    expect(names(MORTENSRUD)).toEqual(before);
  });

  it('survives an empty or missing list, and a stop with no distance', () => {
    expect(rankStops([], depUses())).toEqual([]);
    expect(rankStops(null, depUses())).toEqual([]);
    used('Fjern', 2);
    expect(names(rankStops([s('Nær', 200), s('Fjern', null)], depUses())))
      .toEqual(['Fjern', 'Nær']);
  });
});

// ── The join ──────────────────────────────────────────────────────────────
//
// Every usage store keys on the lowercased NAME; stopId rides along and is
// null whenever the route came from a typed or geocoded place. So the name is
// the only join that always works, and the id is preferred when both sides
// have one.
describe('usesOf', () => {
  it('matches on the name whatever the case or spacing', () => {
    trackPlace('dep', '  Mortensrud  ', {});
    const u = depUses();
    expect(usesOf({ name: 'MORTENSRUD' }, u)).toBe(1);
    expect(usesOf({ name: 'mortensrud' }, u)).toBe(1);
  });

  it('prefers the stop id when both sides carry one', () => {
    used('Mortensrud', 7, 'NSR:StopPlace:6013');
    const u = depUses();
    // Same id, different name in the geocoder answer — the id still wins.
    expect(usesOf({ name: 'Mortensrud T', id: 'NSR:StopPlace:6013' }, u)).toBe(7);
  });

  it('does not treat two missing ids as a match', () => {
    trackPlace('dep', 'Mortensrud', {});          // stopId null
    const u = depUses();
    expect(usesOf({ name: 'Granebakken', id: null }, u)).toBe(0);
  });

  it('is zero for anything it has never seen', () => {
    const u = depUses();
    expect(usesOf({ name: 'Ukjent' }, u)).toBe(0);
    expect(usesOf(null, u)).toBe(0);
    expect(usesOf({ name: 'x' }, null)).toBe(0);
  });
});

/**
 * Retningen veier tyngre enn avstanden.
 *
 * Spurt: «…sannsynliggjøre hvilken linje vedkommende er interessert i — og
 * dermed veier tyngst når du skal sette verdien for «Du er ved»?»
 *
 * rankStops hadde ingen retning i det hele tatt. En holdeplass du går FRA og
 * en du går MOT så helt like ut for den: begge var bare et antall meter.
 *
 * Fiksturen er en gange nordover: målingene ligger sør for Nordstopp og nord
 * for Sørstopp, så du nærmer deg det ene og går fra det andre.
 */
describe('rankStops med en serie posisjoner', () => {
  const M = 1 / 111_320;
  const her = (n) => ({ lat: 59.8300 + n * M, lon: 10.8050, at: n * 500, acc: 8 });
  // Seks målinger over ti sekunder, to meter i sekundet nordover.
  const GAAR_NORD = [0, 2, 4, 6, 8, 10].map((m, i) => ({ ...her(m), at: i * 2000 }));

  const stopp = (name, distM, n) =>
    ({ name, id: 'NSR:StopPlace:' + name, distM, lat: 59.8300 + n * M, lon: 10.8050 });
  // Like langt unna, hver sin vei.
  const NORD = stopp('Nordstopp', 300, 300);
  const SOER = stopp('Sørstopp', 300, -300);

  // FØR-BILDET: uten serien skiller ingenting dem, og rekkefølgen blir den
  // geokoderen tilfeldigvis ga.
  it('lar den du går mot slå den du går fra', () => {
    const ut = rankStops([SOER, NORD], depUses(), GAAR_NORD);
    expect(names(ut)[0]).toBe('Nordstopp');
  });

  // En du nærmer deg er verdt mer enn en du aldri har brukt og går fra, også
  // når den andre er litt nærmere.
  it('løfter den du nærmer deg over en nærmere du går fra', () => {
    const naermere = stopp('Sørstopp', 250, -250);
    const ut = rankStops([naermere, NORD], depUses(), GAAR_NORD);
    expect(names(ut)[0]).toBe('Nordstopp');
  });

  // BÅND 0 ER URØRT. Står du ved holdeplassen, krangler ikke appen med deg —
  // uansett hvilken vei serien sier at du beveger deg.
  it('rører ikke den du står ved', () => {
    const ved = stopp('Sørstopp', 20, -20);
    const ut = rankStops([NORD, ved], depUses(), GAAR_NORD);
    expect(names(ut)[0]).toBe('Sørstopp');
  });

  // «Vet ikke» må la skjermen være nøyaktig som i dag — og det er tilstanden
  // en ny leser, en fersk fane og en telefon på bordet er i.
  it('er identisk med dagens uten en serie', () => {
    const uten = names(rankStops(MORTENSRUD, depUses()));
    expect(names(rankStops(MORTENSRUD, depUses(), []))).toEqual(uten);
    expect(names(rankStops(MORTENSRUD, depUses(), null))).toEqual(uten);
    // Og én måling er ingen serie.
    expect(names(rankStops(MORTENSRUD, depUses(), [her(0)]))).toEqual(uten);
  });

  // Historikken skal fortsatt telle: retningen legges til, den erstatter ikke.
  it('lar en brukt holdeplass du nærmer deg slå en ubrukt du nærmer deg', () => {
    const a = stopp('Ubrukt', 280, 280);
    const b = stopp('Brukt', 320, 320);
    used('Brukt', 3);
    expect(names(rankStops([a, b], depUses(), GAAR_NORD))[0]).toBe('Brukt');
  });
});

/**
 * Og de tre reglene hver for seg.
 *
 * Testene over bandt UTFALLET — «Nordstopp først» — som `dir`-bryteren alene
 * er nok til å gi. Tre mutanter overlevde dem: båndløftet fjernet, bånd 0
 * utsatt for retningen, og «vet-ikke» lest som «fra». Hver av dem trenger et
 * tilfelle der nettopp den regelen er det eneste som skiller.
 */
describe('rankStops, regel for regel', () => {
  const M = 1 / 111_320;
  const GAAR_NORD = [0, 2, 4, 6, 8, 10].map((m, i) =>
    ({ lat: 59.8300 + m * M, lon: 10.8050, at: i * 2000, acc: 8 }));
  const stopp = (name, distM, n) =>
    ({ name, id: 'NSR:StopPlace:' + name, distM, lat: 59.8300 + n * M, lon: 10.8050 });

  // BÅNDLØFTET. En ubrukt du går mot skal slå en BRUKT du går fra — uten
  // løftet er den brukte i bånd 1 og vinner på båndet alene.
  it('lar en ubrukt du går mot slå en brukt du går fra', () => {
    const mot = stopp('Nordstopp', 300, 300);
    const fra = stopp('Sørstopp', 300, -300);
    used('Sørstopp', 4);
    expect(names(rankStops([fra, mot], depUses(), GAAR_NORD))[0]).toBe('Nordstopp');
  });

  // BÅND 0. To holdeplasser du står mellom, begge innenfor CLOSE_M: der er
  // avstanden svaret, og retningen skal ikke få ordet. Står du på perrongen,
  // krangler ikke appen med deg fordi du snudde deg.
  it('lar avstanden avgjøre mellom to du står ved', () => {
    const naer = stopp('Sørstopp', 15, -15);
    const fjern = stopp('Nordstopp', CLOSE_M - 5, CLOSE_M - 5);
    expect(names(rankStops([fjern, naer], depUses(), GAAR_NORD))[0]).toBe('Sørstopp');
  });

  // «VET IKKE» ER IKKE «FRA». En holdeplass geokoderen ga uten koordinater
  // kan ikke bedømmes — og «vi vet ikke» skal ikke straffes som «du går fra».
  it('straffer ikke en holdeplass den ikke kan bedømme', () => {
    const ukjent = { name: 'Ukjent', id: 'NSR:StopPlace:U', distM: 300 };
    const fra = stopp('Sørstopp', 300, -300);
    expect(names(rankStops([fra, ukjent], depUses(), GAAR_NORD))[0]).toBe('Ukjent');
  });
});
