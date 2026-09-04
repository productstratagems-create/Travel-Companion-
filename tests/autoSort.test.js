/**
 * Sorting the auto-reise list by type.
 *
 * Asked for: T-bane, Ruter-buss, andre busser, tog — and inside each group,
 * the soonest departure first. The list had exactly one order before this
 * (auto.js: `.sort((a, b) => a.nextMs - b.nextMs)`), so the reader could not
 * choose, and a bus one minute away always outranked the metro they wanted.
 *
 * The hard part is NOT the ordering. It is that the app has no operator data
 * at all: boardGQL selects `line{id publicCode transportMode presentation}`
 * and nothing else — no authority, no operator, no transportSubmode. "Ruter"
 * is read from the NeTEx codespace prefix of `line.id`, which is already in
 * the answer. Every rule about that fallback is tested here.
 */
import { describe, it, expect } from 'vitest';
import { groupDirections, dirRank, sortDirs, dirRows, quayLabel, nearbyAlternatives, RANKS, sortEndLabels } from '../src/views/auto.js';
import { NEAR_STOP_MAX_M } from '../src/geo.js';

const NOW = Date.UTC(2026, 4, 26, 15, 0, 0);
const at = (min) => new Date(NOW + min * 60000).toISOString();

/** A call the way the stop board actually delivers one. */
const call = (front, code, min, mode, lineId) => ({
  destinationDisplay: { frontText: front },
  expectedDepartureTime: at(min),
  serviceJourney: {
    id: code + ':' + min,
    line: {
      id: lineId === undefined ? 'RUT:Line:' + code : lineId,
      publicCode: code,
      transportMode: mode,
      presentation: { colour: 'f5a000' },
    },
    estimatedCalls: [],
  },
});

const names = (rows) => rows.map(d => d.frontText);

describe('the order before this change', () => {
  // The before picture. Without it the rest is an assertion, not a fix.
  it('is time alone — the metro you want sits last', () => {
    const out = groupDirections([
      call('Vestli', '5', 9, 'metro'),
      call('Helsfyr', '37', 2, 'bus'),
      call('Gardermoen', 'F4', 1, 'bus', 'VYX:Line:F4'),
      call('Lillestrøm', 'R14', 4, 'rail', 'NSB:Line:R14'),
    ], NOW);
    expect(names(out)).toEqual(['Gardermoen', 'Helsfyr', 'Lillestrøm', 'Vestli']);
  });
});

describe('dirRank', () => {
  const row = (mode, lineId) => ({ call: call('X', '1', 1, mode, lineId) });

  it('puts the six groups in the order that was asked for', () => {
    expect(dirRank(row('metro'))).toBe(0);
    expect(dirRank(row('tram'))).toBe(1);
    expect(dirRank(row('bus', 'RUT:Line:37'))).toBe(2);
    expect(dirRank(row('bus', 'VYX:Line:F4'))).toBe(3);
    expect(dirRank(row('rail', 'NSB:Line:R14'))).toBe(4);
    expect(dirRank(row('water'))).toBe(5);
  });

  // The three ways the Ruter split can be missing data. All fall DOWNWARDS
  // into "andre busser": a Ruter bus sinking is survivable, a row vanishing
  // is not.
  it('falls to andre busser when the codespace is missing or unknown', () => {
    expect(dirRank(row('bus', null))).toBe(3);
    expect(dirRank(row('bus', ''))).toBe(3);
    expect(dirRank(row('bus', 'FLI:Line:1'))).toBe(3);
  });

  it('does not mistake a codespace that merely contains RUT', () => {
    expect(dirRank(row('bus', 'BRUT:Line:9'))).toBe(3);
  });

  it('survives a row with no call at all', () => {
    expect(dirRank({})).toBe(5);
    expect(dirRank(null)).toBe(5);
  });
});

describe('sortDirs', () => {
  const rows = () => groupDirections([
    call('Vestli', '5', 9, 'metro'),
    call('Helsfyr', '37', 2, 'bus'),
    call('Gardermoen', 'F4', 1, 'bus', 'VYX:Line:F4'),
    call('Lillestrøm', 'R14', 4, 'rail', 'NSB:Line:R14'),
  ], NOW);

  it('groups by type in the order asked for', () => {
    expect(names(sortDirs(rows(), false)))
      .toEqual(['Vestli', 'Helsfyr', 'Gardermoen', 'Lillestrøm']);
  });

  // Half the request. Without this the groups are right and the rows inside
  // them are arbitrary, which on a platform is the half that matters.
  //
  // Reversed on purpose. groupDirections already sorts by time, so feeding
  // its output straight in leaves a stable sort with nothing to do and the
  // test passes even with the tie-break deleted — measured: that mutant
  // survived. The input has to disagree with the answer for the assertion to
  // mean anything.
  it('orders by soonest departure inside a group', () => {
    const rows = groupDirections([
      call('Helsfyr', '37', 8, 'bus'),
      call('Bogerud', '79', 3, 'bus'),
      call('Grorud', '31', 5, 'bus'),
    ], NOW).reverse();
    expect(names(rows)).toEqual(['Helsfyr', 'Grorud', 'Bogerud']);
    expect(names(sortDirs(rows, false))).toEqual(['Bogerud', 'Grorud', 'Helsfyr']);
  });


  it('does not touch the array it was given', () => {
    const before = rows();
    const copy = names(before);
    sortDirs(before, false);
    expect(names(before)).toEqual(copy);
  });
});

describe('dirRows — the order and the index must agree', () => {
  const dirs = () => groupDirections([
    call('Vestli', '5', 9, 'metro'),
    call('Helsfyr', '37', 2, 'bus'),
    call('Gardermoen', 'F4', 1, 'bus', 'VYX:Line:F4'),
    call('Lillestrøm', 'R14', 4, 'rail', 'NSB:Line:R14'),
    call('Ljabru', '19', 6, 'tram'),
  ], NOW);

  // The one mistake here that would not look like a mistake: tapping "mot
  // Vestli" and getting the stops for a different direction. The screen reads
  // _dirs[data-i], so this invariant IS the click handler's correctness.
  it('leaves every index pointing at its own row', () => {
    const d = dirs();
    dirRows(d, false).forEach(({ d: row, i }) => {
      expect(d[i]).toBe(row);
    });
  });

  it('sorts by type and drops nothing when nothing is filtered', () => {
    const out = dirRows(dirs(), false);
    expect(out.map(x => x.d.frontText))
      .toEqual(['Vestli', 'Ljabru', 'Helsfyr', 'Gardermoen', 'Lillestrøm']);
  });

  // Filtering happens before sorting, and the indices must survive it — this
  // is where an index built after the filter would quietly go wrong.
  it('keeps indices right after a row is filtered out', () => {
    const d = dirs();
    const out = dirRows(d, false, row => row.frontText !== 'Helsfyr');
    expect(out.map(x => x.d.frontText))
      .toEqual(['Vestli', 'Ljabru', 'Gardermoen', 'Lillestrøm']);
    out.forEach(({ d: row, i }) => expect(d[i]).toBe(row));
  });
});

// ── Reported from Skullerud, with a picture ───────────────────────────────
//
// The metro 3 and the bus 76 both say "Mortensrud", and the row carried both
// badges — reading "spor 1", the metro's platform, because the platform is
// taken from the soonest call. Someone taking the bus was sent to the metro
// track. It also makes sorting by type meaningless: a row that is two modes
// has no type to sort on.
describe('a row is one mode', () => {
  const q = (front, code, min, mode, quay) => ({
    destinationDisplay: { frontText: front },
    expectedDepartureTime: at(min),
    quay: { publicCode: quay, name: 'Skullerud ' + quay },
    serviceJourney: {
      id: code + ':' + min,
      line: { id: 'RUT:Line:' + code, publicCode: code, transportMode: mode, presentation: { colour: 'f5a000' } },
      estimatedCalls: [],
    },
  });

  it('splits a metro and a bus that share a front text', () => {
    const out = groupDirections([
      q('Mortensrud', '3', 3, 'metro', '1'),
      q('Mortensrud', '76', 10, 'bus', 'J'),
    ], NOW);
    expect(out).toHaveLength(2);
    expect(out.map(d => d.lines.map(l => l.code))).toEqual([['3'], ['76']]);
    // The point of splitting: each row can now name its own platform.
    expect(out.map(d => quayLabel(d.call))).toEqual(['spor 1', 'plattform J']);
  });

  // Asked for after the mode split: one row is one LINE. Two bus lines to the
  // same place are two rows, so each carries its own next departures.
  it('gives two lines of the same mode a row each', () => {
    const out = groupDirections([
      q('Helsfyr', '76', 3, 'bus', 'J'),
      q('Helsfyr', '79', 6, 'bus', 'J'),
    ], NOW);
    expect(out).toHaveLength(2);
    expect(out.map(d => d.lines.map(l => l.code))).toEqual([['76'], ['79']]);
    expect(out.map(d => d.times.length)).toEqual([1, 1]);
  });

  // The hole the line key closes that the mode key could not: with
  // transportMode absent from both, mode-keying folded them straight back
  // into one row and the Skullerud platform lie returned. Measured before
  // this change.
  it('keeps two lines apart even with no transportMode at all', () => {
    const out = groupDirections([
      q('Mortensrud', '3', 3, undefined, '1'),
      q('Mortensrud', '76', 10, undefined, 'J'),
    ], NOW);
    expect(out).toHaveLength(2);
    expect(out.map(d => quayLabel(d.call))).toEqual(['plattform 1', 'plattform J']);
  });

  it('gives every row a single badge, so it has one type and one platform', () => {
    const out = groupDirections([
      q('Vestli', '1', 2, 'metro', '1'),
      q('Vestli', '2', 4, 'metro', '1'),
      q('Vestli', '3', 6, 'metro', '1'),
    ], NOW);
    expect(out.map(d => d.lines.length)).toEqual([1, 1, 1]);
  });

  it('gives every row a single rank once they are split', () => {
    const out = sortDirs(groupDirections([
      q('Mortensrud', '76', 3, 'bus', 'J'),
      q('Mortensrud', '3', 10, 'metro', '1'),
    ], NOW), false);
    expect(out.map(dirRank)).toEqual([0, 2]);
  });
});

// ── Ascending and descending ──────────────────────────────────────────────
//
// Asked for: the sort buttons should toggle between ascending and descending.
// Descending on TYPE reverses the groups and NOT the clock inside them — the
// reader chooses which type to see first, but a departure 37 minutes out
// above one 3 minutes out helps nobody standing on a platform.
describe('direction', () => {
  const rows = () => groupDirections([
    call('Vestli', '5', 9, 'metro'),
    call('Helsfyr', '37', 2, 'bus'),
    call('Bogerud', '79', 8, 'bus'),
    call('Gardermoen', 'F4', 1, 'bus', 'VYX:Line:F4'),
    call('Lillestrøm', 'R14', 4, 'rail', 'NSB:Line:R14'),
  ], NOW);

  it('reverses the groups on type', () => {
    expect(names(sortDirs(rows(), true)))
      .toEqual(['Lillestrøm', 'Gardermoen', 'Helsfyr', 'Bogerud', 'Vestli']);
  });

  // The half that must NOT reverse. Helsfyr (2 min) stays above Bogerud
  // (8 min) even though their group has moved up the list.
  it('keeps the soonest first inside a group when descending', () => {
    const out = sortDirs(rows(), true);
    const bus = out.filter(d => ['Helsfyr', 'Bogerud'].includes(d.frontText));
    expect(names(bus)).toEqual(['Helsfyr', 'Bogerud']);
  });


});

// ── Which other stops get offered ─────────────────────────────────────────
//
// Asked for: show the stops within 850 m. The rule used to end in
// .slice(0, 4), so a stop well inside the limit could still be invisible —
// measured, "Skullerud stasjon" at 650 m vanished behind three nearer ones.
// A distance limit with a hidden count limit behind it is not a distance
// limit, and no assertion about the fetched list could see the difference.
describe('nearbyAlternatives', () => {
  const s = (name, distM) => ({ id: 'NSR:' + name, name, distM });

  it('offers every stop inside the limit, however many there are', () => {
    const here = s('Her', 0);
    const list = [here, ...Array.from({ length: 9 },
      (_, i) => s('Stopp ' + i, 40 + i * 80))];
    const out = nearbyAlternatives(list, here);
    expect(out).toHaveLength(9);
    expect(out.every(x => x.distM <= NEAR_STOP_MAX_M)).toBe(true);
  });

  it('drops the stop you are already at, and only that one', () => {
    const here = s('Her', 20);
    expect(nearbyAlternatives([here, s('Annet', 20)], here).map(x => x.name))
      .toEqual(['Annet']);
  });

  it('drops a stop beyond the limit', () => {
    const here = s('Her', 0);
    const out = nearbyAlternatives([here, s('Innafor', NEAR_STOP_MAX_M), s('Utafor', NEAR_STOP_MAX_M + 1)], here);
    expect(out.map(x => x.name)).toEqual(['Innafor']);
  });

  // "We did not measure it" is not the same fact as "it is far away", and it
  // came from the same nearby query either way.
  it('keeps a stop whose distance is unknown', () => {
    const here = s('Her', 0);
    expect(nearbyAlternatives([here, s('Umålt', null)], here).map(x => x.name))
      .toEqual(['Umålt']);
  });
});

// ── One sort, and the buttons say what it does ────────────────────────────
//
// Asked for: type primary, time secondary — and the time-only sort removed as
// a choice. Sorting by the clock across every type is not an order anyone
// wanted, and offering it meant half the taps produced a list nobody asked
// for. Deleted rather than hidden: an unreachable mode is a second definition
// of the order, waiting to be switched back on.
describe('the switch labels come from the rank table', () => {
  it('names the two ends of RANKS, not "stigende" and "synkende"', () => {
    const ends = sortEndLabels();
    const named = RANKS.filter(r => r.label);
    expect(ends.asc).toBe(named[0].label);
    expect(ends.desc).toBe(named[named.length - 1].label);
    expect(ends.asc).toBe('T-bane');
    expect(ends.desc).toBe('Tog');
  });

  // The whole reason RANKS is a table: move a group and the buttons follow.
  // Written as a chain of ifs, the labels would have gone on lying.
  it('keeps the labels and the order as one thing', () => {
    RANKS.forEach((r, i) => {
      if (r.key === 'metro') expect(i).toBe(0);
      if (r.key === 'rail') expect(i).toBe(RANKS.length - 2);
    });
    // The unknown group is last and deliberately unlabelled: nothing on
    // screen should claim to know what it is.
    expect(RANKS[RANKS.length - 1].label).toBe(null);
  });
});
