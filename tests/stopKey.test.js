/**
 * One name for one stop, one horizon for one countdown.
 *
 * The mapping for v1.107.0 found four recipes for «the same stop» across nine
 * places. The two pairs below are the ones that actually disagreed, both from
 * real answers: the geocoder appends the municipality, and Oslo's metro stops
 * carry a T. Depending on which screen asked, the app said they were the same
 * stop or two different ones.
 */
import { describe, it, expect } from 'vitest';
import { stopKey, sameStop, findStop } from '../src/stopId.js';
import { reachCls, REACH_FAR_MINS } from '../src/geo.js';
import { countdownText, fmtMins } from '../src/ui/fmt.js';

describe('stopKey', () => {
  // THE TWO PAIRS, IN TWO ASSERTIONS. Recipes A and D said no to the first;
  // C and D said no to the second.
  it('reads «Ryen T» and «Ryen» as one stop', () => {
    expect(stopKey('Ryen T')).toBe(stopKey('Ryen'));
  });

  it('reads «Skullerud, Oslo» and «Skullerud» as one stop', () => {
    expect(stopKey('Skullerud, Oslo')).toBe(stopKey('Skullerud'));
  });

  // The comma is cut BEFORE the T is stripped. The other order leaves the
  // comma clause protecting the T, and this name stops matching the two above.
  it('handles both at once, which fixes the clause order', () => {
    expect(stopKey('Ryen T, Oslo')).toBe(stopKey('Ryen'));
  });

  it('does not strip a T that is part of a word', () => {
    expect(stopKey('Majorstuen')).toBe('majorstuen');
    expect(stopKey('Tveita')).toBe('tveita');
  });

  it('survives junk', () => {
    expect(stopKey(null)).toBe('');
    expect(stopKey(undefined)).toBe('');
    expect(stopKey('  ')).toBe('');
  });
});

const S = (id, name) => ({ id, name });

describe('sameStop — the strict predicate', () => {
  it('matches on id', () => {
    expect(sameStop(S('NSR:StopPlace:1', 'A'), S('NSR:StopPlace:1', 'B'))).toBe(true);
  });

  it('lets a differing id beat a matching name', () => {
    expect(sameStop(S('NSR:StopPlace:1', 'Ryen'), S('NSR:StopPlace:2', 'Ryen'))).toBe(false);
  });

  it('falls back to the name when an id is missing', () => {
    expect(sameStop(S(null, 'Ryen T'), S('NSR:StopPlace:1', 'Ryen'))).toBe(true);
  });

  // Same reasoning as sameLine and nearStopMatch: two unknowns are not the
  // same thing.
  it('does not match two missing names', () => {
    expect(sameStop(S(null, ''), S(null, ''))).toBe(false);
    expect(sameStop(null, S('x', 'y'))).toBe(false);
  });

  // The saved records call it stopId and the live answers call it id. A rule
  // reading only one of them says no to a stop it has seen a hundred times.
  it('reads the id under either field name', () => {
    expect(sameStop({ stopId: 'NSR:StopPlace:1' }, { id: 'NSR:StopPlace:1' })).toBe(true);
  });
});

describe('findStop — the forgiving search', () => {
  const LIST = [S('NSR:StopPlace:kerb', 'Kerb'), S('NSR:StopPlace:99999', 'Ryen T')];

  it('prefers an id match anywhere in the list over any name match', () => {
    const list = [S(null, 'Ryen'), S('NSR:StopPlace:7', 'Helsfyr')];
    expect(findStop(list, { id: 'NSR:StopPlace:7', name: 'Ryen' }).name).toBe('Helsfyr');
  });

  // THE DIFFERENCE FROM sameStop, AND WHY BOTH EXIST. Stop-place ids move;
  // `t.route` carries one saved months ago and nothing rewrites it. sameStop
  // would call this a mismatch and the walk time would vanish — which is
  // exactly what v1.76.0 did.
  it('falls through to the name when the saved id no longer matches', () => {
    expect(findStop(LIST, { id: 'NSR:StopPlace:OLD', name: 'Ryen' }).name).toBe('Ryen T');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(findStop(LIST, { name: 'Bergen' })).toBeNull();
    expect(findStop([], { name: 'Ryen' })).toBeNull();
    expect(findStop(LIST, null)).toBeNull();
  });
});

describe('reachCls — the horizon it never had', () => {
  // reachCls(6) and reachCls(360) both returned 'r-ok', and
  // tests/geo.test.js locked that in on purpose.
  it('no longer puts 6 minutes and 6 hours in one bucket', () => {
    expect(reachCls(6)).toBe('r-ok');
    expect(reachCls(360)).toBe('r-far');
  });

  // ON THE BOUNDARY ITSELF, both sides. A fixture at 100 or 200 passes whether
  // the comparison is > or >=.
  it('is exact at the horizon', () => {
    expect(reachCls(REACH_FAR_MINS)).toBe('r-ok');
    expect(reachCls(REACH_FAR_MINS + 1)).toBe('r-far');
  });

  it('leaves the three urgent buckets untouched', () => {
    expect(reachCls(5)).toBe('r-soon');
    expect(reachCls(0)).toBe('r-now');
    expect(reachCls(-1)).toBe('missed');
  });
});

describe('countdownText — one verdict, one consequence', () => {
  const NOW = Date.parse('2026-09-17T08:00:00+02:00');
  const IN = (mins) => NOW + mins * 60000;

  it('counts down inside the horizon', () => {
    const ct = countdownText('r-ok', 40, IN(40), NOW);
    expect(ct.text).toBe('40 min');
    expect(ct.counting).toBe(true);
  });

  // «19t 53m igjen» was the reported string. Past the horizon the fact that
  // can be acted on is WHEN it goes.
  it('names the departure past the horizon, with the day', () => {
    const ct = countdownText('r-far', 1193, IN(1193), NOW);
    expect(ct.counting).toBe(false);
    expect(ct.text).toContain('i morgen');
    expect(ct.text).not.toContain('19t');
  });

  // THE ONE WAY «one horizon» BECOMES TWO. countdownText must not own a
  // threshold of its own — it must switch exactly when reachCls does.
  it('switches exactly when the bucket does, never on its own threshold', () => {
    for (const m of [REACH_FAR_MINS - 1, REACH_FAR_MINS, REACH_FAR_MINS + 1, 1193]) {
      const cls = reachCls(m);
      expect(countdownText(cls, m, IN(m), NOW).counting).toBe(cls !== 'r-far');
    }
  });

  // fmtMins keeps its contract: the tooltips say «1t 15m» and should.
  it('leaves fmtMins alone', () => {
    expect(fmtMins(75)).toBe('1t 15m');
  });

  it('falls back to counting when there is no departure time to name', () => {
    expect(countdownText('r-far', 1193, null, NOW).counting).toBe(true);
  });
});
