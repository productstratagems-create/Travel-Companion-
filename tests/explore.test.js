/**
 * «Utforsk» means finding journeys forward in time.
 *
 * Asked for in those words: «finne mulige reisealternativer frem i tid og på
 * strekninger som ikke nødvendigvis er relatert til brukerens gjeldende
 * posisjon fra gps målingen.»
 *
 * Before this, the app had no such screen. Four doors looked like one: «FINN
 * REISE» pastes a reise-ID, «REISEPLAN» lists saved legs, «skriv hvor du
 * skal» opens the settings form, and that form — the only real A→B input —
 * has no time field. The one route that could carry a time was the trip
 * home, a HH:MM on today's clock inside a ±45/90 minute window.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import { exploreState, journeySummary, searchDir } from '../src/views/explore.js';
import { TRIP_SCAN_MINS, TRIP_PICK_HORIZON_MINS, TRIP_PICK_HORIZON_DAYS } from '../src/api/tripTime.js';

const NOW = new Date(2026, 8, 19, 8, 47).getTime();
const A = { label: 'Kongsberg', id: 'NSR:StopPlace:1', lat: 59.66, lon: 9.65 };
const B = { label: 'Oslo S', id: 'NSR:StopPlace:2', lat: 59.91, lon: 10.75 };
const st = o => exploreState({ now: NOW, ...o });

// ── THE BEFORE PICTURE ───────────────────────────────────────
//
// The report is not a bug in one line; it is an absence. So the
// reproduction is an absence too: before this release, no screen outside the
// return-trip window could name a departure time, and the settings form —
// the app's only A→B input — still cannot.
describe('the gap this release closes', () => {
  it('the route form still cannot express a day', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const form = html.slice(html.indexOf('id="set-dep"'), html.indexOf('id="set-apply"'));
    // Its one time input is the trip home's, and that is HH:MM only —
    // returnTrip.atMs puts it on TODAY'S date and returnWindow refuses to
    // wrap past midnight. «I morgen 08:00» is not sayable there.
    const times = form.match(/type="(?:date|datetime-local|time)"/g) || [];
    expect(times).toEqual(['type="time"']);
    expect(form).toMatch(/id="set-ret-time"/);
    expect(fs.readFileSync('src/api/returnTrip.js', 'utf8'))
      .toMatch(/d\.setHours\(Number\(m\[1\]\), Number\(m\[2\]\)/);
  });

  it('and «finn reise» is a reise-ID field, not a journey search', () => {
    const src = fs.readFileSync('src/views/spectate.js', 'utf8');
    expect(src).toMatch(/lim inn reise-ID/);
    expect(src).not.toMatch(/tripGQL|fetchTrip/);
  });

  // The thing that must now be true: a screen the main menu reaches can ask
  // about a time, with both ends typed.
  it('«Utforsk» can now', () => {
    const src = fs.readFileSync('src/views/explore.js', 'utf8');
    expect(src).toMatch(/datetime-local/);
    expect(src).toMatch(/fetchTrip/);
  });
});

describe('exploreState', () => {
  it('asks for what it is missing, one end at a time', () => {
    expect(st({ from: null, to: null }).kind).toBe('mangler-fra');
    expect(st({ from: A, to: null }).kind).toBe('mangler-til');
  });

  it('is ready, silently, once both ends are named', () => {
    expect(st({ from: A, to: B })).toEqual({ kind: 'klar', label: '' });
  });

  it('refuses a time it cannot answer about, and says so', () => {
    const far = st({ from: A, to: B, atMs: NOW + (TRIP_PICK_HORIZON_MINS + 60) * 60000 });
    expect(far.kind).toBe('tid');
    expect(far.label).toContain(String(TRIP_PICK_HORIZON_DAYS));
    expect(st({ from: A, to: B, atMs: NOW - 60000 }).kind).toBe('tid');
  });

  // THE CASE THE RELEASE EXISTS FOR. Storaas has no weekend service; the
  // next bus is Monday 07:05, forty-six hours out. A screen that refused
  // that time would be answering a question nobody asked.
  it('accepts the reported journey, two days out', () => {
    const mandag = new Date(2026, 8, 21, 7, 5).getTime();
    expect(st({ from: A, to: B, atMs: mandag }).kind).toBe('klar');
  });

  it('says it is looking rather than saying nothing', () => {
    expect(st({ from: A, to: B, asked: true, loading: true }).kind).toBe('leter');
  });

  // Four kinds of «no rows», four sentences. One sentence for all of them is
  // the v1.122.0 bug, and it has now been shipped twice.
  it('tells its silences apart', () => {
    const kinds = [
      st({ from: A, to: B, asked: false }),
      st({ from: A, to: B, asked: true, loading: true }),
      st({ from: A, to: B, asked: true, error: true }),
      st({ from: A, to: B, asked: true, rows: [] }),
      st({ from: A, to: B, asked: true, rows: [], atMs: NOW + 3600_000 }),
    ];
    expect(kinds.map(k => k.kind))
      .toEqual(['klar', 'leter', 'feil', 'ingen', 'ingen-da']);
    const said = kinds.map(k => k.label).filter(Boolean);
    expect(new Set(said).size).toBe(said.length);
  });

  // «Nothing found» is never a statement about the route in general: one
  // search scans TRIP_SCAN_MINS forward from its own instant, and saying
  // otherwise is the v1.122.0 sentence in a screen that can reach further.
  it('says which window the emptiness is about', () => {
    const hrs = String(Math.round(TRIP_SCAN_MINS / 60));
    expect(st({ from: A, to: B, asked: true, rows: [] }).label).toContain(hrs);
    expect(st({ from: A, to: B, asked: true, rows: [], atMs: NOW + 3600_000 }).label)
      .toContain(hrs);
  });

  it('is quiet when there are rows to read', () => {
    expect(st({ from: A, to: B, asked: true, rows: [{}] })).toEqual({ kind: 'ok', label: '' });
  });
});

describe('searchDir', () => {
  // THE POINT OF THE RELEASE. Neither end is the GPS dot, and the instant
  // travels on the route object so departAtMs can find it.
  it('carries both ends and the chosen instant', () => {
    const at = NOW + 20 * 3600_000;
    const d = searchDir(A, B, at);
    expect(d.from).toBe('Kongsberg');
    expect(d.to).toBe('Oslo S');
    expect(d.stopId).toBe('NSR:StopPlace:1');
    expect(d.toStopId).toBe('NSR:StopPlace:2');
    expect(d.atMs).toBe(at);
  });

  it('works with places that have no stop id, coordinates only', () => {
    const d = searchDir({ label: 'Grünerløkka', lat: 59.92, lon: 10.76 }, B, null);
    expect(d.stopId).toBe(null);
    expect(d._fromLat).toBe(59.92);
    expect(d.atMs).toBe(undefined);
  });

  it('never reads the reader\'s position', () => {
    const src = fs.readFileSync('src/views/explore.js', 'utf8');
    const fn = src.slice(src.indexOf('export function searchDir'), src.indexOf('function _search()'));
    expect(fn).not.toMatch(/homeLL|nearestStation|state\./);
  });

  it('refuses to build half a journey', () => {
    expect(searchDir(A, null, null)).toBe(null);
    expect(searchDir(null, B, null)).toBe(null);
  });
});

describe('journeySummary', () => {
  const pattern = {
    // LOCAL, built from a Date. An ISO string with a fixed +02:00 offset
    // renders as 05:05 where the test runs in UTC — the fixture being
    // wrong, not the code, for the sixth time in this codebase.
    expectedDepartureTime: new Date(2026, 8, 21, 7, 5).toISOString(),
    _finalArrival: new Date(2026, 8, 21, 8, 32).toISOString(),
    _durationMins: 87,
    _transfers: [{ at: 'Drammen' }],
    _alightName: 'Oslo S',
    _alightWalkMins: 4,
    _legs: [
      { serviceJourney: { line: { publicCode: '415' } } },
      { serviceJourney: { line: { publicCode: 'R11' } } },
    ],
  };

  it('reads the lines, the transfers and both ends of the clock', () => {
    const s = journeySummary(pattern);
    expect(s.lines).toEqual(['415', 'R11']);
    expect(s.transfers).toBe(1);
    expect(s.durationMins).toBe(87);
    expect(s.walkMins).toBe(4);
    expect(new Date(s.depMs).getHours()).toBe(7);
    expect(s.arrMs).toBeGreaterThan(s.depMs);
  });

  // null and 0 are different facts: «does not end on foot» versus «it does,
  // and it rounds to nothing». adapt.js is careful about this; so is this.
  it('keeps «no walk» apart from «no walking minutes»', () => {
    expect(journeySummary({ ...pattern, _alightWalkMins: null }).walkMins).toBe(null);
    expect(journeySummary({ ...pattern, _alightWalkMins: 0 }).walkMins).toBe(0);
  });

  it('survives a pattern with nothing in it', () => {
    expect(journeySummary(null)).toBe(null);
    expect(journeySummary({}).lines).toEqual([]);
  });
});
