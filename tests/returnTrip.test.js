import { describe, it, expect, beforeEach } from 'vitest';
import {
  RETURN_LEAD_MS, RETURN_TAIL_MS, loadReturn, saveReturn, clearReturn,
  reverseOf, returnDir, returnWindow, shouldSwitch, skipToday, loadSkip,
  dayKey, atMs, suggestHHMM,
} from '../src/api/returnTrip.js';

const at = (h, m) => new Date(2026, 4, 26, h, m, 0, 0).getTime();   // a Tuesday

beforeEach(() => localStorage.clear());

describe('reverseOf', () => {
  // The whole reason this is not toggleDir: that one throws the ids away and
  // lets the names be geocoded again, which costs a return trip its precision
  // hours before anyone looks at it.
  const OUT = {
    key: 'custom-out', from: 'Mortensrud', to: 'Nationaltheatret',
    stopId: 'NSR:StopPlace:1', toStopId: 'NSR:StopPlace:2',
    _fromLat: 59.86, _fromLon: 10.83, _toLat: 59.91, _toLon: 10.73,
  };

  it('swaps the ends and carries the ids and coordinates across', () => {
    const back = reverseOf(OUT);
    expect(back.from).toBe('Nationaltheatret');
    expect(back.to).toBe('Mortensrud');
    expect(back.stopId).toBe('NSR:StopPlace:2');
    expect(back.toStopId).toBe('NSR:StopPlace:1');
    expect(back._fromLat).toBe(59.91);
    expect(back._toLat).toBe(59.86);
  });

  it('only falls back to a name lookup for the end that has no id', () => {
    const back = reverseOf({ ...OUT, toStopId: null, _toLat: null, _toLon: null });
    expect(back.stopId).toBeNull();
    expect(back.geo).toBe('Nationaltheatret');   // needs geocoding
    expect(back.toGeo).toBeNull();               // has an id, does not
  });

  it('keeps via, and refuses a route that is not one', () => {
    expect(reverseOf({ ...OUT, via: 'Helsfyr', viaStopId: 'NSR:StopPlace:9' }).via).toBe('Helsfyr');
    expect(reverseOf(null)).toBeNull();
    expect(reverseOf({ from: 'A' })).toBeNull();
  });

  it('is JSON-serialisable, since it gets stored', () => {
    expect(() => JSON.stringify(reverseOf(OUT))).not.toThrow();
    expect(reverseOf(OUT).filter).toBeNull();
  });
});

describe('returnWindow', () => {
  const R = { from: 'Nationaltheatret', to: 'Mortensrud', atHHMM: '16:20' };

  it('opens 45 minutes before and closes 90 after — checked at the edges', () => {
    expect(returnWindow(R, at(15, 34)).active).toBe(false);   // 46 min before
    expect(returnWindow(R, at(15, 36)).active).toBe(true);    // 44 min before
    expect(returnWindow(R, at(16, 20)).active).toBe(true);
    expect(returnWindow(R, at(17, 49)).active).toBe(true);    // 89 min after
    expect(returnWindow(R, at(17, 51)).active).toBe(false);   // 91 min after
    expect(RETURN_LEAD_MS + RETURN_TAIL_MS).toBe(135 * 60000);
  });

  // A window that wrapped past midnight would make an 08:00 return look
  // active at half eleven the night before — awake at the wrong end of the day.
  it('does not wrap around midnight', () => {
    const early = { ...R, atHHMM: '08:00' };
    expect(returnWindow(early, at(23, 30)).active).toBe(false);
    expect(returnWindow(early, at(0, 30)).active).toBe(false);
  });

  it('says which side of the departure we are on, and survives nonsense', () => {
    expect(returnWindow(R, at(16, 0)).before).toBe(true);
    expect(returnWindow(R, at(16, 40)).before).toBe(false);
    expect(returnWindow(null, at(16, 20)).active).toBe(false);
    expect(returnWindow({ ...R, atHHMM: 'nei' }, at(16, 20)).at).toBeNull();
  });
});

describe('shouldSwitch', () => {
  const R = { from: 'Nationaltheatret', to: 'Mortensrud', atHHMM: '16:20' };

  it('switches inside the window', () => {
    expect(shouldSwitch(R, at(16, 0), null)).toBe(true);
    expect(shouldSwitch(R, at(9, 0), null)).toBe(false);
  });

  // The rule that decides whether this feels helpful or feels like a fight.
  it('stands down for the rest of the day once the reader has chosen', () => {
    expect(shouldSwitch(R, at(16, 0), dayKey(at(16, 0)))).toBe(false);
  });

  it('and is back tomorrow, without a timer', () => {
    const yesterday = dayKey(at(16, 0) - 86400000);
    expect(shouldSwitch(R, at(16, 0), yesterday)).toBe(true);
  });

  it('does nothing at all when no return trip is set', () => {
    expect(shouldSwitch(null, at(16, 0), null)).toBe(false);
  });
});

describe('storage round trip', () => {
  it('keeps ids, coordinates and the time', () => {
    const r = { from: 'A', to: 'B', stopId: 'NSR:1', toStopId: 'NSR:2',
      _fromLat: 59.9, _fromLon: 10.7, _toLat: 59.8, _toLon: 10.8, atHHMM: '16:20' };
    saveReturn(r);
    expect(loadReturn()).toEqual(r);
    expect(returnDir(loadReturn()).stopId).toBe('NSR:1');
  });

  it('refuses a half-written or corrupt entry rather than throwing', () => {
    saveReturn({ from: 'A', atHHMM: '16:20' });
    expect(loadReturn()).toBeNull();
    saveReturn({ from: 'A', to: 'B', atHHMM: 'x' });
    expect(loadReturn()).toBeNull();
    localStorage.setItem('default::t.return', '{oops');
    expect(loadReturn()).toBeNull();
  });

  it('clearing takes the skip flag with it', () => {
    saveReturn({ from: 'A', to: 'B', atHHMM: '16:20' });
    skipToday(at(16, 0));
    expect(loadSkip()).toBe(dayKey(at(16, 0)));
    clearReturn();
    expect(loadReturn()).toBeNull();
    expect(loadSkip()).toBeNull();
  });
});

describe('atMs and dayKey', () => {
  it('reads HH:MM against the day it is asked about', () => {
    expect(atMs('16:20', at(9, 0))).toBe(at(16, 20));
    expect(atMs('', at(9, 0))).toBeNull();
    expect(atMs('9:00', at(9, 0))).toBeNull();   // must be zero-padded
  });

  it('keys the day locally, not in UTC', () => {
    expect(dayKey(at(0, 30))).toBe('2026-05-26');
    expect(dayKey(at(23, 30))).toBe('2026-05-26');
  });
});

describe('suggestHHMM', () => {
  const hist = [
    { fromName: 'Mortensrud', toName: 'Nationaltheatret', bucket: 4, count: 30 },  // 08:00, the trip out
    { fromName: 'Nationaltheatret', toName: 'Mortensrud', bucket: 8, count: 12 },  // 16:00 home
    { fromName: 'Nationaltheatret', toName: 'Mortensrud', bucket: 9, count: 3 },   // 18:00 home
  ];

  it('suggests the busiest afternoon slot for that direction', () => {
    expect(suggestHHMM(hist, 'Nationaltheatret', 'Mortensrud')).toBe('16:00');
  });

  // Otherwise the morning commute, which is much the busiest entry, would
  // suggest itself as the time to go home.
  it('never suggests a morning', () => {
    expect(suggestHHMM(hist, 'Mortensrud', 'Nationaltheatret')).toBe('');
  });

  it('says nothing rather than inventing a time', () => {
    expect(suggestHHMM([], 'A', 'B')).toBe('');
    expect(suggestHHMM(null, 'A', 'B')).toBe('');
    expect(suggestHHMM(hist, 'A', 'B')).toBe('');
  });
});
