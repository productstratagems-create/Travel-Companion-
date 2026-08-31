import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { routeShareUrl, routeFromShareUrl, canShare, SHARE_PARAMS } from '../src/ui/shareRoute.js';

const BASE = 'https://productstratagems-create.github.io/Travel-Companion-/';
const DIR = {
  key: 'custom-out',
  from: 'Grønland', to: 'Oslo S',
  stopId: 'NSR:StopPlace:1', toStopId: 'NSR:StopPlace:2',
  filter: null, geo: null, toGeo: null, line: null,
  _fromLat: 59.9128, _fromLon: 10.7625,
  _toLat: 59.9110, _toLon: 10.7500,
};

describe('canShare', () => {
  // The receiver applies a route only `if (from && to)`, so a link from a
  // board with no destination opens the app and does nothing at all.
  it('needs both ends', () => {
    expect(canShare(DIR)).toBe(true);
    expect(canShare({ ...DIR, to: null })).toBe(false);
    expect(canShare({ ...DIR, from: '' })).toBe(false);
    expect(canShare(null)).toBe(false);
  });
});

describe('routeShareUrl', () => {
  it('carries the ids and coordinates that make the board precise', () => {
    const u = new URL(routeShareUrl(DIR, BASE));
    expect(u.searchParams.get('from')).toBe('Grønland');
    expect(u.searchParams.get('to')).toBe('Oslo S');
    expect(u.searchParams.get('fromStopId')).toBe('NSR:StopPlace:1');
    expect(u.searchParams.get('toStopId')).toBe('NSR:StopPlace:2');
    expect(u.searchParams.get('fromLat')).toBe('59.9128');
    expect(u.origin + u.pathname).toBe(BASE);
  });

  // The sender's own walking speed means nothing in someone else's board.
  it('never sends travelTime', () => {
    const u = new URL(routeShareUrl({ ...DIR, travelTime: 12 }, BASE));
    expect(u.searchParams.get('travelTime')).toBeNull();
    expect(routeShareUrl(DIR, BASE)).not.toContain('travelTime');
  });

  it('leaves out what it does not have rather than sending empties', () => {
    const bare = { from: 'A', to: 'B' };
    const u = new URL(routeShareUrl(bare, BASE));
    expect([...u.searchParams.keys()]).toEqual(['from', 'to']);
  });

  it('encodes names with spaces and Norwegian letters', () => {
    const href = routeShareUrl({ from: 'Grønland', to: 'Oslo S' }, BASE);
    expect(href).not.toContain(' ');
    expect(new URL(href).searchParams.get('from')).toBe('Grønland');
    expect(new URL(href).searchParams.get('to')).toBe('Oslo S');
  });

  it('has nothing to send for half a route', () => {
    expect(routeShareUrl({ from: 'A' }, BASE)).toBeNull();
    expect(routeShareUrl(null, BASE)).toBeNull();
  });
});

describe('the round trip', () => {
  // The test that actually matters: sender and receiver are in different
  // files and must agree on every parameter name. That agreement breaks
  // silently — the link still opens, it just forgets the stop ids and
  // geocodes a guess instead.
  it('gives back the same route, ids and coordinates intact', () => {
    const back = routeFromShareUrl(routeShareUrl(DIR, BASE));
    expect(back.from).toBe(DIR.from);
    expect(back.to).toBe(DIR.to);
    expect(back.stopId).toBe(DIR.stopId);
    expect(back.toStopId).toBe(DIR.toStopId);
    expect(back._fromLat).toBe(DIR._fromLat);
    expect(back._toLon).toBe(DIR._toLon);
  });

  it('falls back to a name lookup only for the end that has no id', () => {
    const back = routeFromShareUrl(routeShareUrl({ ...DIR, toStopId: null }, BASE));
    expect(back.geo).toBeNull();          // has an id
    expect(back.toGeo).toBe('Oslo S');    // needs geocoding
  });

  it('is JSON-serialisable, since setActiveRoute stores it', () => {
    const back = routeFromShareUrl(routeShareUrl(DIR, BASE));
    expect(() => JSON.stringify(back)).not.toThrow();
    expect(back.filter).toBeNull();
  });

  // The receiver is in main.js and cannot be imported here (it runs on
  // import), so the agreement is checked against its source instead: every
  // parameter the sender emits must be one main.js actually reads.
  it('emits only parameters the receiver reads', () => {
    const main = fs.readFileSync('src/main.js', 'utf8');
    const read = [...main.matchAll(/params\.get\('([^']+)'\)/g)].map(m => m[1]);
    expect(read.length).toBeGreaterThan(4);
    SHARE_PARAMS.forEach(p => expect(read).toContain(p));
    const sent = [...new URL(routeShareUrl(DIR, BASE)).searchParams.keys()];
    sent.forEach(p => expect(read).toContain(p));
  });
});
