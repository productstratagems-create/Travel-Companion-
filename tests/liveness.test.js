/**
 * Underveis slutter å være stille.
 *
 * Three silences, all invisible on the tracking screen until v1.106.0: a
 * cancelled run you are sitting on, a feed that stopped answering, and no
 * network at all. These bind the rules that decide what the screen says.
 */
import { describe, it, expect } from 'vitest';
import { liveness, legCancelled, agoText, STALE_AFTER_MS, DEAD_AFTER_MS }
  from '../src/api/liveness.js';

const NOW = Date.parse('2026-09-17T08:00:00Z');
const at = (msAgo) => NOW - msAgo;

describe('liveness', () => {
  it('calls a just-arrived answer live', () => {
    const lv = liveness({ fetchedAt: at(5000), now: NOW });
    expect(lv.kind).toBe('fersk');
    expect(lv.live).toBe(true);
  });

  // THE BOUNDARY, on the second that decides it. A whole-minute fixture would
  // pass whether the comparison were > or >=, and the mutant would survive.
  it('is still live at exactly the stale threshold, and not one second past', () => {
    expect(liveness({ fetchedAt: at(STALE_AFTER_MS), now: NOW }).kind).toBe('fersk');
    expect(liveness({ fetchedAt: at(STALE_AFTER_MS + 1000), now: NOW }).kind).toBe('gammel');
  });

  it('escalates from old to gone at the dead threshold', () => {
    expect(liveness({ fetchedAt: at(DEAD_AFTER_MS), now: NOW }).kind).toBe('gammel');
    expect(liveness({ fetchedAt: at(DEAD_AFTER_MS + 1000), now: NOW }).kind).toBe('borte');
  });

  // THE REPORTED SHAPE IN ONE ASSERTION: eight minutes of failed polls must
  // not read the same as one successful one.
  it('says how long it has been silent', () => {
    expect(liveness({ fetchedAt: at(9 * 60000), now: NOW }).label).toBe('ingen nytt på 9 min');
  });

  it('names no network as the cause, even when the last answer was fresh', () => {
    const lv = liveness({ fetchedAt: at(2000), now: NOW, online: false });
    expect(lv.kind).toBe('frakoblet');
    expect(lv.live).toBe(false);
  });

  // «Nothing yet» and «old» are different sentences. An empty screen that is
  // still working looks exactly like one that has given up.
  it('distinguishes never-fetched from stale', () => {
    expect(liveness({ fetchedAt: null, now: NOW }).kind).toBe('venter');
    expect(liveness({ fetchedAt: null, now: NOW }).label).toBe('henter sanntid …');
  });

  // «Still working» and «has already failed» must not be the same kind: one
  // kind can only carry one style, and the browser probe caught a real failure
  // being printed in the dimmest colour on the screen because of it.
  it('says so when the first attempts have already failed, as its own kind', () => {
    const lv = liveness({ fetchedAt: null, now: NOW, failures: 2 });
    expect(lv.label).toBe('får ikke kontakt med Entur');
    expect(lv.kind).toBe('tapt');
    expect(liveness({ fetchedAt: null, now: NOW, failures: 0 }).kind).toBe('venter');
  });

  // A clock that jumped backwards must not read as very fresh data.
  it('treats a future timestamp as no age rather than as fresh news', () => {
    expect(liveness({ fetchedAt: NOW + 60000, now: NOW }).ageMs).toBe(0);
  });

  it('survives junk', () => {
    expect(() => liveness(null)).not.toThrow();
    expect(liveness({ fetchedAt: 'i går', now: NOW }).kind).toBe('venter');
  });
});

describe('agoText', () => {
  it('rounds down to whole minutes, and says «nå nettopp» under one', () => {
    expect(agoText(0)).toBe('nå nettopp');
    expect(agoText(3)).toBe('for 3 min siden');
  });
});

const call = (name, cancelled) => ({
  quay: { stopPlace: { name } },
  ...(cancelled ? { cancellation: true } : {}),
});

describe('legCancelled', () => {
  const CALLS = ['Oppsal', 'Skøyenåsen', 'Godlia', 'Jernbanetorget'];
  const run = (cancelledNames) =>
    CALLS.map(n => call(n, cancelledNames.includes(n)));

  it('reports a cancelled boarding stop', () => {
    const r = legCancelled(run(['Oppsal']), 'Oppsal', 'Jernbanetorget');
    expect(r.cancelled).toBe(true);
    expect(r.at).toBe('Oppsal');
  });

  it('reports a cancelled alighting stop', () => {
    expect(legCancelled(run(['Jernbanetorget']), 'Oppsal', 'Jernbanetorget').cancelled).toBe(true);
  });

  // THE ONE THAT MUST NOT FIRE. An operator cancelling a stop between the two
  // that are yours has not cancelled your trip, and blanking the screen for it
  // would be worse than saying nothing.
  it('ignores a cancelled stop that is neither yours', () => {
    expect(legCancelled(run(['Godlia']), 'Oppsal', 'Jernbanetorget').cancelled).toBe(false);
  });

  it('reports a run cancelled in its entirety even with no name match', () => {
    const r = legCancelled(run(CALLS), 'Bergen', 'Trondheim');
    expect(r.cancelled).toBe(true);
    expect(r.at).toBeNull();
  });

  it('is false for an ordinary running journey', () => {
    expect(legCancelled(run([]), 'Oppsal', 'Jernbanetorget').cancelled).toBe(false);
  });

  // Empty is not «all cancelled»: `[].every()` is true, and that mutant would
  // declare every journey with no calls yet to be cancelled.
  it('does not call an empty call list cancelled', () => {
    expect(legCancelled([], 'Oppsal', 'Jernbanetorget').cancelled).toBe(false);
    expect(legCancelled(null, 'Oppsal', 'Jernbanetorget').cancelled).toBe(false);
  });

  it('matches names loosely, as the rest of the screen does', () => {
    expect(legCancelled([call(' oppsal ', true)], 'Oppsal', 'X').cancelled).toBe(true);
  });

  // Two unknowns are not the same stop — the same reasoning as nearStopMatch
  // and sameLine. A second, running call keeps the all-cancelled branch out of
  // the way so this tests the name comparison and nothing else.
  it('does not match two missing names', () => {
    expect(legCancelled([call('', true), call('Godlia', false)], null, null).cancelled)
      .toBe(false);
  });
});
