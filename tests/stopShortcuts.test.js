/**
 * The reader's own stops, above the line.
 *
 * Asked for after five attempts at defining an interchange: "Legg de mest
 * brukte stoppene som snarveier over listen — etterhvert som brukeren bruker
 * funksjonen."
 *
 * Every one of those attempts reasoned about how Oslo's network OUGHT to look,
 * against data this sandbox cannot reach, and the last screenshot showed the
 * result: twenty-seven rows, no anchors, nothing folded. This asks about the
 * reader instead — and t.freqArr has counted every destination they have
 * chosen since v1.36.0.
 */
import { describe, it, expect } from 'vitest';
import { stopShortcuts, STOP_SHORTCUTS } from '../src/views/auto.js';

const s = (name, id, mins) => ({ name, id: id === undefined ? 'NSR:' + name : id, mins });
// Line 3 westbound, as reported.
const LINE = ['Skullerud', 'Bogerud', 'Bøler', 'Ulsrud', 'Oppsal', 'Skøyenåsen',
  'Godlia', 'Hellerud', 'Brynseng', 'Helsfyr', 'Ensjø', 'Tøyen', 'Grønland',
  'Jernbanetorget'].map((n, i) => s(n, undefined, 8 + i * 2));
const used = (name, count, stopId) =>
  ({ name, count, lastUsed: 1000, stopId: stopId === undefined ? 'NSR:' + name : stopId });
const names = (idx) => idx.map(i => LINE[i].name);

describe('stopShortcuts', () => {
  it('offers the stops travelled to most, most used first', () => {
    expect(names(stopShortcuts(LINE, [
      used('Helsfyr', 4), used('Jernbanetorget', 21), used('Tøyen', 9),
    ]))).toEqual(['Jernbanetorget', 'Tøyen', 'Helsfyr']);
  });

  it('offers nothing at all before the reader has travelled', () => {
    expect(stopShortcuts(LINE, [])).toEqual([]);
    expect(stopShortcuts(LINE, null)).toEqual([]);
  });

  it('stops at three', () => {
    const many = LINE.map((x, i) => used(x.name, 100 - i));
    expect(stopShortcuts(LINE, many)).toHaveLength(STOP_SHORTCUTS);
    expect(STOP_SHORTCUTS).toBe(3);
  });

  // A shortcut to somewhere this direction does not go is a button that
  // cannot do what it says.
  it('offers only stops that are actually on this line', () => {
    expect(stopShortcuts(LINE, [used('Majorstuen', 40), used('Tøyen', 2)]))
      .toEqual([LINE.findIndex(x => x.name === 'Tøyen')]);
  });

  // ── The index is the whole design ──────────────────────────────────────
  //
  // Indices, not stop objects: the shortcut carries the same data-i as the
  // row below, shares one click handler, and shows the minutes from this very
  // departure. Two representations of one stop is the bug shape this codebase
  // has found six times.
  it('returns indices that point at their own stop', () => {
    const out = stopShortcuts(LINE, [used('Helsfyr', 4), used('Grønland', 6)]);
    out.forEach(i => expect(LINE[i]).toBeTruthy());
    expect(out.map(i => LINE[i].name).sort()).toEqual(['Grønland', 'Helsfyr']);
  });

  it('carries the live minutes, because it never copies the stop', () => {
    const out = stopShortcuts(LINE, [used('Tøyen', 3)]);
    expect(LINE[out[0]].mins).toBe(LINE.find(x => x.name === 'Tøyen').mins);
  });

  // ── The join ───────────────────────────────────────────────────────────
  it('matches on the stop id when both sides carry one', () => {
    const line = [s('Tøyen T', 'NSR:StopPlace:6098', 20)];
    expect(stopShortcuts(line, [used('Tøyen', 5, 'NSR:StopPlace:6098')])).toEqual([0]);
  });

  it('falls back to the name, whatever the case or spacing', () => {
    const line = [s('Tøyen', null, 20)];
    expect(stopShortcuts(line, [used('  tøyen  ', 5, null)])).toEqual([0]);
  });

  // Two places that both lack an id are not the same place.
  it('does not treat two missing ids as a match', () => {
    const line = [s('Tøyen', null, 20)];
    expect(stopShortcuts(line, [used('Grønland', 5, null)])).toEqual([]);
  });

  // Order matters when two stops are used equally: keep the order you would
  // ride past them, rather than whatever the history happened to hold.
  it('breaks a tie by the line’s own order', () => {
    const out = stopShortcuts(LINE, [used('Jernbanetorget', 5), used('Helsfyr', 5)]);
    expect(names(out)).toEqual(['Helsfyr', 'Jernbanetorget']);
  });

  it('survives an empty line and rubbish history', () => {
    expect(stopShortcuts([], [used('Tøyen', 5)])).toEqual([]);
    expect(stopShortcuts(null, [used('Tøyen', 5)])).toEqual([]);
    expect(stopShortcuts(LINE, [null, {}, used('Tøyen', 2)]))
      .toEqual([LINE.findIndex(x => x.name === 'Tøyen')]);
  });
});

// ── The register is gone ────────────────────────────────────────────────
//
// Five definitions of an interchange, 849 lines with their tests, and a
// mechanism that could only work when Entur answered a field that could never
// be checked from here. Replaced by one that works from the reader's first
// trip.
describe('the interchange register', () => {
  const read = async (f) => (await import('node:fs')).readFileSync(f, 'utf8');

  it('is not imported anywhere', async () => {
    for (const f of ['src/views/auto.js', 'src/ui/nav.js', 'src/main.js']) {
      expect(await read(f), f).not.toContain('hubs.js');
    }
  });

  it('took its query with it', async () => {
    expect(await read('src/api/queries.js')).not.toContain('stopPlacesGQL');
  });

  it('left no folded rows or anchors behind', async () => {
    const src = await read('src/views/auto.js');
    expect(src).not.toContain('auto-hub');
    expect(src).not.toContain('auto-run');
    expect(src).not.toContain('stopRuns');
  });

  // The key stays listed so a value written by v1.72.0–v1.85.0 is still
  // deleted with the profile that made it.
  it('still has its key in ALL_KEYS, for the cleanup', async () => {
    expect(await read('src/storage.js')).toContain("'t.hubs'");
  });
});
