/**
 * «Ingen avganger» sier hva som faktisk er tilfellet.
 *
 * Reported from Storaas Gjestegård on a Saturday: «vår app viser ingen
 * avganger, men Entur har avganger.»
 *
 * Entur had none that day either. Its own message reads «Vi finner ingen
 * reiser etter dette tidspunktet på lørdag. Vi viser første mulige reise», and
 * the list under it is MONDAY 21. september, bus 415 at 07:05. The stop has no
 * weekend service.
 *
 * So the app was right and unhelpful. And the sentence it used meant six
 * different things, one of which — «we have not asked yet» — is a plain bug.
 */
import { describe, it, expect } from 'vitest';
import { boardState } from '../src/views/auto.js';
import { NEXT_DEPARTURE_HORIZON_MINS } from '../src/api/queries.js';

// LOCAL time, not UTC: clkDay renders in the reader's zone, and a UTC
// fixture asserted «07:05» against a label reading «05:05» — the fixture
// being wrong, not the code.
const LØRDAG = new Date(2026, 8, 19, 8, 47, 0).getTime();
const MANDAG_0705 = new Date(2026, 8, 21, 7, 5, 0).getTime();
const H = NEXT_DEPARTURE_HORIZON_MINS;
const st = (o) => boardState({ now: LØRDAG, horizonMins: H, ...o });

describe('boardState', () => {
  // THE BUG, not a wording. pinStop empties _dirs and renders before _load
  // runs, so the screen said «ingen avganger» about something it had not
  // looked at.
  it('does not claim emptiness before it has asked', () => {
    expect(st({ asked: false, dirs: [], live: [] }).kind).toBe('henter');
    expect(st({ asked: false, dirs: [], live: [] }).label).not.toMatch(/ingen/i);
  });

  // AND IT MUST OUTRANK A STALE ANSWER. Pinning a new stop clears the rows;
  // if it did not also clear these, the screen would offer the PREVIOUS
  // stop's next departure as this one's. A mutant that dropped the «not
  // asked» guard survived until this case existed, because every other test
  // reached «henter» by another route.
  it('does not show the last stop’s answer for a stop it has not asked about', () => {
    const s = st({ asked: false, dirs: [], live: [], nextMs: MANDAG_0705 });
    expect(s.kind).toBe('henter');
    expect(s.label).not.toContain('07:05');
  });

  // THE REPORTED SCREEN. Saturday at Storaas: nothing in the window, and the
  // next one is Monday morning.
  it('names the day and the time of the next departure', () => {
    const s = st({ asked: true, dirs: [], live: [], nextMs: MANDAG_0705 });
    expect(s.kind).toBe('senere');
    expect(s.label).toContain('07:05');
    // The day is the whole point: 2 900 minutes is not an answer.
    expect(s.label).toMatch(/man/i);
  });

  // Still looking. Saying «ingen avganger» and correcting it a moment later
  // is the flicker the vision calls out.
  it('says it is still looking rather than guessing', () => {
    expect(st({ asked: true, dirs: [], live: [], nextMs: undefined }).kind).toBe('henter');
  });

  // Asked two days ahead and found nothing. «Nå» would invite the reader to
  // wait for something that is not coming.
  it('says how long it looked when it found nothing at all', () => {
    const s = st({ asked: true, dirs: [], live: [], nextMs: null });
    expect(s.kind).toBe('ingen');
    expect(s.label).toContain('2 døgnene');
    expect(s.label).not.toMatch(/nå\./);
  });

  // A different fact, and one the reader can act on: a refresh helps here and
  // does not help above.
  it('tells «the answer aged out» from «the stop gave us nothing»', () => {
    const aged = st({ asked: true, dirs: [{}], live: [] });
    const empty = st({ asked: true, dirs: [], live: [], nextMs: null });
    expect(aged.kind).toBe('passert');
    expect(aged.label).not.toBe(empty.label);
    expect(aged.label).toMatch(/hent/i);
  });

  it('says nothing at all when there are departures', () => {
    expect(st({ asked: true, dirs: [{}], live: [{}] })).toEqual({ kind: 'ok', label: '' });
  });

  // THE ONE WAY «six states, one sentence» COMES BACK. Every kind that can
  // reach the screen must read differently from every other.
  it('gives every state its own words', () => {
    const all = [
      st({ asked: false, dirs: [], live: [] }),
      st({ asked: true, dirs: [], live: [], nextMs: MANDAG_0705 }),
      st({ asked: true, dirs: [], live: [], nextMs: null }),
      st({ asked: true, dirs: [{}], live: [] }),
    ];
    expect(new Set(all.map(s => s.label)).size).toBe(all.length);
  });

  // A departure in the past is not «next».
  it('does not offer a departure that has already gone', () => {
    expect(st({ asked: true, dirs: [], live: [], nextMs: LØRDAG - 60000 }).kind).toBe('ingen');
  });

  it('survives junk', () => {
    expect(() => boardState(null)).not.toThrow();
    expect(boardState(null).kind).toBe('henter');
  });
});
