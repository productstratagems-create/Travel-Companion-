/**
 * Auto-reise trades a guess for a choice. The old ⚡ button predicted your
 * destination and refused to work without history; this screen asks. All
 * three rules below are about not lying to someone who is standing on a
 * platform with a train coming.
 */
import { describe, it, expect } from 'vitest';
import { groupDirections, stopsAhead, autoRoute } from '../src/views/auto.js';

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
