/**
 * Forrige og neste avgang, fra the list the reader actually saw.
 *
 * Asked for: «På dette viewet burde bruker kunne hoppe tilbake til forrige
 * avgang eller fremover til neste avgang.»
 *
 * THE TRAP, and it had already half-happened: «what is the next departure»
 * had TWO answers on this screen. The board showed `rowDeps` — deduped, mode
 * filtered, line filtered — while the «neste» row at the foot read the RAW
 * `state.deps` and re-sorted and re-deduped it by its own rule. Measured
 * against a set with buses switched off, that row pointed at a bus; and when
 * the next departure was under ninety seconds away it showed nothing while
 * the board had a row.
 *
 * These buttons would have been the third answer. So the board hands over its
 * own rows and nothing here re-sorts, re-dedupes or re-filters.
 */
import { describe, it, expect } from 'vitest';
import { stepDep } from '../src/views/selected.js';

const dep = (id, hhmm, opts = {}) => ({
  serviceJourney: { id, cancellation: !!opts.cancelled,
    line: { publicCode: opts.line || '3', transportMode: opts.mode || 'metro' } },
  cancellation: !!opts.cancelled,
  expectedDepartureTime: '2026-09-16T' + hhmm + ':00+02:00',
});

const ROWS = [
  dep('sj-1', '07:09'),
  dep('sj-2', '07:16'),
  dep('sj-3', '07:24'),
  dep('sj-4', '07:31'),
  dep('sj-5', '07:45'),
];

describe('stepDep', () => {
  it('steps forward to the row below', () => {
    expect(stepDep(ROWS, ROWS[1], 1).serviceJourney.id).toBe('sj-3');
  });

  it('steps back to the row above', () => {
    expect(stepDep(ROWS, ROWS[3], -1).serviceJourney.id).toBe('sj-3');
  });

  // THE TEST THAT BINDS THE BUTTONS TO THE BOARD. A step forward must be the
  // row under the one you tapped — the same thing as going back and tapping
  // it — for every row in the list, not just a convenient one.
  it('agrees with the list at every position', () => {
    for (let i = 0; i < ROWS.length - 1; i++) {
      expect(stepDep(ROWS, ROWS[i], 1)).toBe(ROWS[i + 1]);
      expect(stepDep(ROWS, ROWS[i + 1], -1)).toBe(ROWS[i]);
    }
  });

  it('is null at both ends rather than wrapping', () => {
    expect(stepDep(ROWS, ROWS[0], -1)).toBe(null);
    expect(stepDep(ROWS, ROWS[ROWS.length - 1], 1)).toBe(null);
  });

  // A cancelled row loses its onclick on the board, so it is not something a
  // tap could open — and these buttons must not reach anything a tap could
  // not.
  it('steps over a cancelled departure, both ways', () => {
    const rows = [ROWS[0], dep('sj-x', '07:16', { cancelled: true }), ROWS[2]];
    expect(stepDep(rows, rows[0], 1).serviceJourney.id).toBe('sj-3');
    expect(stepDep(rows, rows[2], -1).serviceJourney.id).toBe('sj-1');
  });

  it('is null when every row beyond is cancelled', () => {
    const rows = [ROWS[0], dep('sj-x', '07:16', { cancelled: true })];
    expect(stepDep(rows, rows[0], 1)).toBe(null);
  });

  // Chosen: departures that have already gone stay reachable going back. The
  // board keeps them, dimmed — and one that left two minutes ago may be
  // delayed and still at the platform, which is exactly when you look.
  it('reaches a departure that has already gone', () => {
    const rows = [dep('sj-0', '06:55'), ROWS[0]];
    expect(stepDep(rows, rows[1], -1).serviceJourney.id).toBe('sj-0');
  });

  // Identity is serviceJourney.id, NOT the departure time: _depKey embeds
  // expectedDepartureTime, which moves the moment realtime does. Two rows can
  // share a minute — that is the very case the board's dedupe exists for.
  it('matches on the service journey, not the clock', () => {
    const rows = [dep('sj-a', '07:16'), dep('sj-b', '07:16'), dep('sj-c', '07:24')];
    expect(stepDep(rows, rows[0], 1).serviceJourney.id).toBe('sj-b');
    expect(stepDep(rows, rows[1], 1).serviceJourney.id).toBe('sj-c');
    expect(stepDep(rows, rows[1], -1).serviceJourney.id).toBe('sj-a');
  });

  // Arriving from the saved plan builds a synthetic departure that is in no
  // list. The buttons go dead rather than opening something you never came
  // from — today's screen, not something worse.
  it('is null when the current departure is not in the list', () => {
    const stranger = dep('sj-ukjent', '07:20');
    expect(stepDep(ROWS, stranger, 1)).toBe(null);
    expect(stepDep(ROWS, stranger, -1)).toBe(null);
  });

  // The board can be empty, and the detail screen can be reached with no
  // board behind it at all.
  it('survives an empty or missing list', () => {
    expect(stepDep([], ROWS[0], 1)).toBe(null);
    expect(stepDep(null, ROWS[0], 1)).toBe(null);
    expect(stepDep(ROWS, null, 1)).toBe(null);
  });

  // Falls back to the departure time only where the dedupe already guards
  // against a missing id.
  it('falls back to the departure time when ids are missing', () => {
    const noId = (hhmm) => ({ expectedDepartureTime: '2026-09-16T' + hhmm + ':00+02:00' });
    const rows = [noId('07:09'), noId('07:16'), noId('07:24')];
    expect(stepDep(rows, rows[1], 1).expectedDepartureTime).toContain('07:24');
  });
});


// --- Codespace casing (v1.107.0) ---
//
// The realtime stop board hands back «rut:ServiceJourney:…» where the trip
// planner uses «RUT:…», and stopBoardExtras (board.js:178) stores the RAW id
// on the row — normJid is applied only to the dedupe set beside it. So both
// spellings of one departure reach _sameDep. It compared them raw and said no,
// which made stepDep return null and killed both step buttons on a row that
// happened to come from the other source.
describe('stepDep — the same departure, spelled two ways', () => {
  const row = (id) => ({ serviceJourney: { id }, expectedDepartureTime: '2026-09-17T08:10:00Z' });

  it('finds the current departure across codespace casing', () => {
    const rows = [row('RUT:ServiceJourney:1'), row('RUT:ServiceJourney:3-2'), row('RUT:ServiceJourney:9')];
    const cur = row('rut:ServiceJourney:3-2');
    expect(stepDep(rows, cur, 1)).toBe(rows[2]);
    expect(stepDep(rows, cur, -1)).toBe(rows[0]);
  });

  // Normalising must not make two different journeys equal.
  it('still tells two different journeys apart', () => {
    const rows = [row('RUT:ServiceJourney:1'), row('RUT:ServiceJourney:2')];
    expect(stepDep(rows, row('rut:ServiceJourney:1'), 1)).toBe(rows[1]);
  });
});
