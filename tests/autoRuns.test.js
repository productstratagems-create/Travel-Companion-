/**
 * Folding the plain stretches of a line.
 *
 * Reported with a screenshot of line 3 to Kolsås: "Alle holdeplasser som har
 * overganger til andre linjer eller som både fungerer som t-bane-stopp og
 * buss-holdeplasser må identifiseres. Holdeplasser som ikke har slike
 * funksjoner kollapses. Må kunne ekspanderes."
 *
 * Twenty-four stops, of which a handful are somewhere you can change.
 * Anchoring them (v1.72.0) helped; it did not shorten anything.
 */
import { describe, it, expect } from 'vitest';
import { stopRuns } from '../src/views/auto.js';

const s = (name, id) => ({ name, id: id || 'NSR:' + name, mins: 5 });
// Line 3 eastbound-ish, as reported.
const LINE3 = ['Skullerud', 'Bogerud', 'Bøler', 'Ulsrud', 'Oppsal', 'Skøyenåsen',
  'Godlia', 'Hellerud', 'Brynseng', 'Helsfyr', 'Ensjø', 'Tøyen'].map(n => s(n));

const hub = { v: 2, q: 2, m: ['metro', 'bus'], l: 4 };
const plain = { v: 2, q: 2, m: ['metro'], l: 1 };
const register = (...hubNames) => Object.fromEntries(
  LINE3.map(x => [x.id, hubNames.includes(x.name) ? hub : plain]));

const kinds = (rows) => rows.map(r => r.kind === 'stop' ? r.s.name : r.kind + ':' + r.items.length);

describe('stopRuns', () => {
  it('folds each stretch between two interchanges into one row', () => {
    const rows = stopRuns(LINE3, register('Brynseng', 'Helsfyr'), new Set());
    expect(kinds(rows)).toEqual([
      'run:8',        // Skullerud → Hellerud
      'Brynseng',
      'Helsfyr',
      'Ensjø',        // a run of one is not folded
      'Tøyen',        // the last stop is always shown
    ]);
  });

  // The whole reason this is worth doing.
  it('turns twelve rows into five', () => {
    expect(stopRuns(LINE3, register('Brynseng', 'Helsfyr'), new Set())).toHaveLength(5);
  });

  it('names the stretch by its ends', () => {
    const run = stopRuns(LINE3, register('Brynseng'), new Set())[0];
    expect(run.from).toBe('Skullerud');
    expect(run.to).toBe('Hellerud');
    expect(run.items).toHaveLength(8);
  });

  it('opens only the stretch that was tapped', () => {
    const reg = register('Godlia', 'Helsfyr');
    const shut = stopRuns(LINE3, reg, new Set());
    const first = shut.find(r => r.kind === 'run');
    const open = stopRuns(LINE3, reg, new Set([first.key]));
    expect(open.find(r => r.key === first.key).kind).toBe('open');
    // The other stretch stays folded.
    expect(open.some(r => r.kind === 'run')).toBe(true);
  });

  // ── The three guards ────────────────────────────────────────────────────
  //
  // A list that has folded itself away because a query failed is worse than a
  // long list.
  it('shows every stop when the register knows nothing', () => {
    expect(stopRuns(LINE3, {}, new Set())).toHaveLength(LINE3.length);
    expect(stopRuns(LINE3, null, new Set())).toHaveLength(LINE3.length);
  });

  // Found by measuring, not by reading. With Quay.lines refused, every stop
  // falls back to a plain two-platform entry — the register knows them all
  // perfectly well, and folding produced ONE row plus the terminus for a
  // seventeen-stop line. So the guard is about anchors, not about knowledge.
  it('shows every stop when the register found no interchange at all', () => {
    const noneAreHubs = Object.fromEntries(LINE3.map(x => [x.id, plain]));
    expect(stopRuns(LINE3, noneAreHubs, new Set())).toHaveLength(LINE3.length);
  });

  it('always shows the last stop, because it names the direction', () => {
    const rows = stopRuns(LINE3, register('Skullerud'), new Set());
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'stop' });
    expect(rows[rows.length - 1].s.name).toBe('Tøyen');
  });

  it('does not fold a single stop', () => {
    const rows = stopRuns(LINE3, register('Skullerud', 'Bøler'), new Set());
    // Bogerud sits alone between two anchors and stays a stop.
    expect(rows[1]).toMatchObject({ kind: 'stop' });
    expect(rows[1].s.name).toBe('Bogerud');
  });

  // The index has to keep pointing at the stop it draws — the click handler
  // reads stops[data-i], so a wrong index sends the reader to another
  // destination without looking wrong.
  it('keeps every index pointing at its own stop', () => {
    const rows = stopRuns(LINE3, register('Brynseng', 'Helsfyr'), new Set([
      'NSR:Skullerud']));
    rows.forEach(r => {
      const items = r.kind === 'stop' ? [r] : r.items;
      items.forEach(it => expect(LINE3[it.i]).toBe(it.s));
    });
  });

  it('survives an empty list', () => {
    expect(stopRuns([], {}, new Set())).toEqual([]);
    expect(stopRuns(null, {}, new Set())).toEqual([]);
  });
});
