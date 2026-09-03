/**
 * Auto-reise trades a guess for a choice. The old ⚡ button predicted your
 * destination and refused to work without history; this screen asks. All
 * three rules below are about not lying to someone who is standing on a
 * platform with a train coming.
 */
import { describe, it, expect } from 'vitest';
import { groupDirections, stopsAhead, autoRoute, noPosText } from '../src/views/auto.js';

const NOW = Date.UTC(2026, 4, 26, 15, 0, 0);
const at = (min) => new Date(NOW + min * 60000).toISOString();

const line = (code, colour) => ({ publicCode: code, presentation: { colour } });
const call = (front, code, min, sjc) => ({
  destinationDisplay: { frontText: front },
  expectedDepartureTime: at(min),
  serviceJourney: { id: code + ':' + min, line: line(code, 'f5a000'), estimatedCalls: sjc || [] },
});
const stop = (name, min) => ({
  quay: { stopPlace: { id: 'NSR:' + name, name, latitude: 59.9, longitude: 10.7 } },
  expectedArrivalTime: at(min),
});

describe('groupDirections', () => {
  // A direction is the front text — what is written on the vehicle and on the
  // platform sign, so the reader can check it against the world.
  it('makes one row per front text, soonest first', () => {
    const out = groupDirections([
      call('Majorstuen', '12', 9),
      call('Nationaltheatret', '3', 2),
      call('Mortensrud', '3', 6),
    ], NOW);
    expect(out.map(d => d.frontText)).toEqual(['Nationaltheatret', 'Mortensrud', 'Majorstuen']);
    expect(out[0].mins).toBe(2);
  });

  // Two lines to the same place is ONE choice with two badges: "which of
  // these comes first" is the board's job, not this screen's.
  it('folds two lines running to the same place into one row', () => {
    const out = groupDirections([
      call('Nationaltheatret', '3', 4),
      call('Nationaltheatret', '2', 2),
    ], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].lines.map(l => l.code).sort()).toEqual(['2', '3']);
    expect(out[0].mins).toBe(2);            // the soonest of the two
  });

  // The same line the other way is a different front text, so two rows —
  // which is the whole reason a direction is not a line.
  it('keeps one line running both ways as two rows', () => {
    const out = groupDirections([call('Nationaltheatret', '3', 2), call('Mortensrud', '3', 5)], NOW);
    expect(out).toHaveLength(2);
  });

  // The row's time and the row's onward stops must come from the SAME
  // departure, or the reader is shown one train's stops and another's clock.
  it('lets the soonest departure own the row it is timing', () => {
    const early = call('Nationaltheatret', '3', 2, [stop('Ryen', 6)]);
    const late = call('Nationaltheatret', '3', 9, [stop('Helsfyr', 14)]);
    const out = groupDirections([late, early], NOW);
    expect(out[0].call).toBe(early);
  });

  it('drops what it cannot label or time, rather than showing a blank row', () => {
    const noFront = { destinationDisplay: { frontText: '  ' }, expectedDepartureTime: at(1) };
    const noTime = { destinationDisplay: { frontText: 'Ryen' } };
    expect(groupDirections([noFront, noTime], NOW)).toEqual([]);
    expect(groupDirections(null, NOW)).toEqual([]);
  });
});

// ── A departure that has gone is not a choice ──────────────────────────────
//
// Reported with a photograph from Bogerud: three rows saying "nå" at once.
// The stop board is asked with a two-minute LOOKBACK on purpose (queries.js
// LOOKBACK_MINS) — a train standing at the platform a minute late is exactly
// what someone running for it needs to see — and this screen then clamped the
// countdown with Math.max(0, …), so anything up to two minutes GONE rendered
// as "nå".
//
// The board can afford that honestly, because it says "-3". This screen is a
// list of choices, and a departure you cannot catch is not one. So it goes.
describe('groupDirections and departures already gone', () => {
  it('drops a departure that has already left', () => {
    const out = groupDirections([call('Mortensrud', '3', -1.5)], NOW);
    expect(out).toEqual([]);
  });

  // The whole photograph: three rows reading "nå", at least one of them a
  // vehicle that had gone. Against the old code all three survived.
  it('keeps only the ones still to come when the board looks back', () => {
    const out = groupDirections([
      call('Mortensrud', '3', -1.8),
      call('Kolsås', '3', -0.4),
      call('Åsbråten', '79', 0.3),
      call('Stortinget', '3', 5),
    ], NOW);
    expect(out.map(d => d.frontText)).toEqual(['Åsbråten', 'Stortinget']);
  });

  // A direction must not disappear because its FIRST vehicle has gone — the
  // next one is still a choice, and it is the one the row should carry.
  it('keeps the direction and moves to its next departure', () => {
    const out = groupDirections([
      call('Mortensrud', '3', -1.5),
      call('Mortensrud', '3', 7),
    ], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].mins).toBe(7);
    // The row's onward stops must come from the call the time came from.
    expect(out[0].call.expectedDepartureTime).toBe(at(7));
  });

  // "nå" still has to mean now. A vehicle 20 seconds out is one you catch by
  // walking, and rounding it to zero is the right answer — that is the case
  // the clamp was there for, and it survives.
  it('still says nå for one that is about to leave', () => {
    const out = groupDirections([call('Kolsås', '3', 0.33)], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].mins).toBe(0);
  });

  it('treats this instant as still catchable, not as gone', () => {
    expect(groupDirections([call('Kolsås', '3', 0)], NOW)).toHaveLength(1);
  });

  // Pinned rather than changed: the countdown rounds to nearest, so 4:36 is
  // "5 min". Unchanged behaviour, but nothing held it before — and rounding
  // is exactly the kind of thing that drifts to floor in a later edit and
  // quietly makes every row a minute more optimistic.
  it('rounds the countdown to the nearest minute', () => {
    expect(groupDirections([call('Kolsås', '3', 4.6)], NOW)[0].mins).toBe(5);
    expect(groupDirections([call('Kolsås', '3', 4.4)], NOW)[0].mins).toBe(4);
  });
});

describe('stopsAhead', () => {
  const c = call('Nationaltheatret', '3', 2, [
    stop('Mortensrud', -6), stop('Ryen', -2),
    stop('Helsfyr', 4), stop('Jernbanetorget', 11), stop('Nationaltheatret', 16),
  ]);

  // The one thing this screen must never do: offer a stop the train has
  // already left as a destination. In a list a stop behind you looks exactly
  // like a stop ahead of you.
  it('lists only what comes after your own stop', () => {
    expect(stopsAhead(c, 'Ryen', NOW).map(s => s.name))
      .toEqual(['Helsfyr', 'Jernbanetorget', 'Nationaltheatret']);
  });

  it('carries the id and the minutes, since both become the route', () => {
    const first = stopsAhead(c, 'Ryen', NOW)[0];
    expect(first.id).toBe('NSR:Helsfyr');
    expect(first.mins).toBe(4);
  });

  it('matches a stop whose name carries the T suffix', () => {
    expect(stopsAhead(c, 'Ryen T', NOW)).toHaveLength(3);
  });

  // Better empty than wrong: if we cannot find where the reader is standing,
  // every stop on the line is a coin flip on direction.
  it('gives nothing when your stop is not on this journey', () => {
    expect(stopsAhead(c, 'Bergen', NOW)).toEqual([]);
    expect(stopsAhead(null, 'Ryen', NOW)).toEqual([]);
  });
});

describe('autoRoute', () => {
  const A = { name: 'Ryen', id: 'NSR:1', lat: 59.88, lon: 10.81 };
  const B = { name: 'Helsfyr', id: 'NSR:2', lat: 59.91, lon: 10.79 };

  // A coordinate origin makes OTP add walking time to the platform and drop
  // departures it judges unreachable — that cost the very next departure once
  // already (v1.4.1). We are holding the ids; they must survive.
  it('carries the stop ids in both ends', () => {
    const d = autoRoute(A, B);
    expect(d.stopId).toBe('NSR:1');
    expect(d.toStopId).toBe('NSR:2');
    expect(d.geo).toBeNull();
    expect(d.toGeo).toBeNull();
  });

  it('falls back to a name lookup only for the end that has no id', () => {
    const d = autoRoute(A, { ...B, id: null });
    expect(d.geo).toBeNull();
    expect(d.toGeo).toBe('Helsfyr');
  });

  it('is JSON-serialisable, since setActiveRoute stores it', () => {
    expect(() => JSON.stringify(autoRoute(A, B))).not.toThrow();
    expect(autoRoute(A, B).filter).toBeNull();
  });

  it('refuses half a route', () => {
    expect(autoRoute(A, null)).toBeNull();
    expect(autoRoute({ id: 'x' }, B)).toBeNull();
  });
});

// ── No position, and which nothing it is ───────────────────────────────────
//
// v1.61.0 makes auto-reise the screen a new reader lands on, so "GPS denied"
// stops being a corner case and becomes one of the two ways the very first
// screen can go. "Finner ikke posisjonen din ennå" is true while a fix is on
// its way and a lie once permission has been refused: it reads as
// still-looking, so the screen sits there implying it is about to work.
describe('noPosText', () => {
  it('says the position is refused, and what to do instead', () => {
    const t = noPosText('denied');
    expect(t.where).toMatch(/avslått/i);
    // Refused means it will never arrive on its own, so the way forward has
    // to be named. Both escape hatches are on the screen already.
    expect(t.body).toMatch(/stedstjenester/i);
    expect(t.body).toMatch(/stoppet selv/i);
  });

  // The screen must not point at something that is not on it. The nearby-stop
  // buttons are built from the position, so with no position there is nothing
  // below to choose from — an earlier draft said "velg et stopp nedenfor"
  // under an empty screen, and the button still said "skriv hvor du SKAL".
  it('points only at the one control that is actually there', () => {
    ['denied', null].forEach(e => {
      expect(noPosText(e).body).not.toMatch(/nedenfor/i);
      expect(noPosText(e).cta).toMatch(/hvor du er/i);
    });
  });

  it('says it is still looking when nothing has failed yet', () => {
    const t = noPosText(null);
    expect(t.where).toMatch(/ennå/i);
    expect(t.body).toMatch(/leter/i);
    // The one thing it must NOT do is tell someone to change a setting they
    // have not touched and that is not the problem.
    expect(t.body).not.toMatch(/avslått/i);
  });

  it('never gives the same words to the two cases', () => {
    expect(noPosText('denied').where).not.toBe(noPosText(null).where);
    expect(noPosText('denied').body).not.toBe(noPosText(null).body);
  });

  // An unknown error code is not a denial — treating it as one would tell the
  // reader to change a permission that is already granted.
  it('treats an unknown failure as still looking, not as a refusal', () => {
    expect(noPosText('timeout')).toEqual(noPosText(null));
    expect(noPosText(undefined)).toEqual(noPosText(null));
  });
});

// ── A stop is a stop, not a point on the map ───────────────────────────────
//
// Reported with a screenshot: Mortensrud → Skøyenåsen — a real metro stop on
// the same line — and the itinerary ended with a walking leg to somewhere
// called "destination", drawn on the map as a dotted loop round a block.
// "destination" is the name OTP gives a COORDINATE.
//
// The chain: stopsAhead reads `quay.stopPlace.id`, no query asked for it, so
// the id was null; autoRoute fell back to lat/lon; resolveToPlace prefers a
// coordinate over geocoding; and OTP walked the reader from the platform to
// that point. These tests hold the two ends of it.
describe('a destination that is a stop', () => {
  const withId = { name: 'Skøyenåsen', id: 'NSR:StopPlace:6273', lat: 59.89, lon: 10.83 };
  const here   = { name: 'Mortensrud', id: 'NSR:StopPlace:6270', lat: 59.87, lon: 10.83 };

  it('travels to the stop, not to its coordinates', () => {
    const d = autoRoute(here, withId);
    expect(d.toStopId).toBe('NSR:StopPlace:6273');
    // No name to geocode either: the id is the precise answer, and geocoding
    // a name back into an id we are already holding is how coordinates crept
    // in the first time (v1.4.1).
    expect(d.toGeo).toBe(null);
  });

  // The coordinates stay — the map pins the destination with them — but they
  // must never be the thing the journey is planned to when an id exists.
  // resolveToPlace reads toStopId first; this pins that order from our side.
  it('keeps the coordinates for the map without planning to them', () => {
    const d = autoRoute(here, withId);
    expect(d._toLat).toBe(59.89);
    expect(d._toLon).toBe(10.83);
    expect(d.toStopId).toBeTruthy();
  });

  // The honest fallback: a place with no id really is only a point, and then
  // a walking leg at the end is correct rather than nonsense.
  it('still falls back to a point for somewhere that is not a stop', () => {
    const d = autoRoute(here, { name: 'Aker brygge', id: null, lat: 59.91, lon: 10.73 });
    expect(d.toStopId).toBe(null);
    expect(d.toGeo).toBe('Aker brygge');
  });
});

// ── The next three, not just the next ──────────────────────────────────────
//
// Asked for: "ønsker at dette viewet viser tiden til avgang for de tre neste
// avgangene pr. linje". Per ROW rather than per line, chosen deliberately —
// a row is a direction, and "what takes me that way" is the question you have
// on the platform. Fewer than three when fewer run: a row with one time means
// one departure, and padding it would say something the stop board never did.
describe('groupDirections and the next three', () => {
  it('lists the next three, soonest first', () => {
    const out = groupDirections([
      call('Østerås', '2', 22), call('Østerås', '2', 2), call('Østerås', '2', 12),
    ], NOW);
    expect(out[0].times).toEqual([2, 12, 22]);
  });

  it('stops at three even when more run', () => {
    const out = groupDirections(
      [2, 12, 22, 32, 42].map(m => call('Østerås', '2', m)), NOW);
    expect(out[0].times).toEqual([2, 12, 22]);
  });

  it('shows what exists when fewer than three run', () => {
    expect(groupDirections([call('Lutvann', '69', 7)], NOW)[0].times).toEqual([7]);
    expect(groupDirections(
      [call('Bøler T', '58', 11), call('Bøler T', '58', 31)], NOW)[0].times).toEqual([11, 31]);
  });

  // v1.61.1 applies to the whole row, not only its first entry: a departure
  // that has gone is not a choice, and it must not become the second time on
  // a row either.
  it('leaves out the ones that have gone', () => {
    const out = groupDirections([
      call('Østerås', '2', -1.5), call('Østerås', '2', 4), call('Østerås', '2', 14),
    ], NOW);
    expect(out[0].times).toEqual([4, 14]);
  });

  // The row's first time and the journey a tap opens have to be the same
  // departure. `call` is what _renderStops reads for the onward stops, so it
  // must stay the soonest — showing three times must not move it.
  it('keeps the tapped journey tied to the first time', () => {
    const early = call('Østerås', '2', 2);
    const out = groupDirections([call('Østerås', '2', 22), early, call('Østerås', '2', 12)], NOW);
    expect(out[0].call).toBe(early);
    expect(out[0].mins).toBe(out[0].times[0]);
  });

  // Directions are folded on front text, so a row can carry two lines — and
  // then the three times are the three that take you there, whichever line
  // runs them. That was the choice: the platform question, not the timetable.
  it('counts every line that goes that way', () => {
    const out = groupDirections([
      call('Mortensrud', '3', 4), call('Mortensrud', '76', 9), call('Mortensrud', '3', 14),
    ], NOW);
    expect(out[0].times).toEqual([4, 9, 14]);
    expect(out[0].lines.map(l => l.code)).toEqual(['3', '76']);
  });

  it('rounds each time the way the first one is rounded', () => {
    const out = groupDirections(
      [call('Østerås', '2', 2), call('Østerås', '2', 4.6)], NOW);
    expect(out[0].times).toEqual([2, 5]);
  });
});
