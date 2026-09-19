/**
 * Which of the geocoder's ten answers did you mean?
 *
 * The geocoder is this app's weakest link, and until now its whole ranking
 * was one line: transit first, then Entur's own order. A wrong pick there
 * is not a wrong list — it is a journey planned to the wrong town.
 *
 * Everything scored here is already on the device. Nothing leaves it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  rankPlaces, scorePlace, matchKind, matchDominates,
  W, MATCH, NEAR_KM, USED_SATURATES, RECENT_DAYS,
} from '../src/api/rankPlaces.js';

const OSLO = { lat: 59.9111, lon: 10.7528 };
const NOW = new Date(2026, 8, 19, 10, 0).getTime();
const DAY = 86400000;

const SKI = { label: 'Ski stasjon', id: 'NSR:2', lat: 59.7195, lon: 10.8356 };
const SKIEN = { label: 'Skien stasjon', id: 'NSR:1', lat: 59.2005, lon: 9.6050 };
const SKIPPER = { label: 'Skippergata, Oslo', id: null, lat: 59.9105, lon: 10.7490 };

const order = (list, ctx) => rankPlaces(list, { now: NOW, ...ctx }).map(r => r.label);

describe('matchKind', () => {
  // stopKey (v1.107.0), not a local lowercase: it drops «, Oslo» and the
  // trailing T, so «Ryen» typed for «Ryen T» is EXACT, not a prefix — the
  // difference between the stop you meant and one two kilometres away.
  it('uses the app\'s one stop-name recipe', () => {
    expect(matchKind('Ryen', 'Ryen T')).toBe('exact');
    expect(matchKind('Skullerud', 'Skullerud, Oslo')).toBe('exact');
  });

  it('grades the rest', () => {
    expect(matchKind('Ski', 'Ski stasjon')).toBe('prefix');
    expect(matchKind('stasjon', 'Ski stasjon')).toBe('word');
    expect(matchKind('kipper', 'Skippergata')).toBe('contains');
    expect(matchKind('Bergen', 'Ski stasjon')).toBe('none');
    expect(matchKind('', 'Ski')).toBe('none');
  });
});

describe('the case that motivated this', () => {
  // «Ski» is a station the reader uses twice a day. It sat below «Skien»
  // and «Skippergata» because nothing but transit-first ordered the list.
  it('puts the station you use daily above the ones you never have', () => {
    expect(order([SKIEN, SKIPPER, SKI], {
      query: 'Ski', here: OSLO,
      freq: [{ name: 'Ski stasjon', count: 14, lastUsed: NOW - DAY }],
    })[0]).toBe('Ski stasjon');
  });

  it('and says why it is on top', () => {
    const top = rankPlaces([SKIEN, SKI], {
      query: 'Ski', now: NOW,
      freq: [{ name: 'Ski stasjon', count: 14, lastUsed: NOW - DAY }],
    })[0];
    expect(top.why).toBe('ofte brukt');
  });
});

describe('the signals', () => {
  it('what you typed outranks what you are near', () => {
    // Skippergata is 300 m away; Ski is 25 km. «Ski» still wins, because
    // familiarity and proximity break ties — they do not overrule the
    // word the reader actually typed.
    expect(order([SKIPPER, SKI], { query: 'Ski stasjon', here: OSLO })[0])
      .toBe('Ski stasjon');
  });

  it('having been there counts, and saturates', () => {
    const s = n => scorePlace(SKI, { query: 'x', freq: [{ name: 'Ski stasjon', count: n }], now: NOW }).parts.used;
    expect(s(0)).toBe(0);
    expect(s(USED_SATURATES)).toBe(1);
    expect(s(USED_SATURATES * 4)).toBe(1);
  });

  it('recency is its own signal, not a bigger count', () => {
    const p = d => scorePlace(SKI, {
      query: 'x', now: NOW, freq: [{ name: 'Ski stasjon', count: 1, lastUsed: NOW - d * DAY }],
    }).parts.recent;
    expect(p(1)).toBe(1);
    expect(p(RECENT_DAYS)).toBe(1);
    expect(p(RECENT_DAYS + 1)).toBe(0);
  });

  // Damped, not linear: 200 m versus 2 km matters; 40 km versus 60 km
  // does not, and a linear term would let a far-away exact match lose.
  it('distance is damped', () => {
    const near = scorePlace(SKIPPER, { query: 'x', here: OSLO }).parts.near;
    const far = scorePlace(SKIEN, { query: 'x', here: OSLO }).parts.near;
    expect(near).toBeGreaterThan(0.9);
    expect(far).toBeLessThan(0.05);
    expect(scorePlace(SKI, { query: 'x', here: null }).parts.near).toBe(0);
  });

  // THE SHAPE, not two sampled points. A linear falloff passes the bounds
  // above and still gets the near field wrong: it makes 1 km and 5 km
  // almost the same, which is exactly the distinction that matters in a
  // city. A mutant with `1 - d/100` survived until this case existed.
  it('distance falls off fast near the reader, not evenly', () => {
    const p = d => scorePlace({ label: 'x', lat: OSLO.lat + d / 111, lon: OSLO.lon },
      { query: 'q', here: OSLO }).parts.near;
    expect(p(1) / p(5)).toBeGreaterThan(2);
  });

  it('a transit place beats an address, all else equal', () => {
    const a = { label: 'Ås', id: 'NSR:9', lat: 59.66, lon: 10.78 };
    const b = { label: 'Ås', id: null, lat: 59.66, lon: 10.78 };
    expect(scorePlace(a, { query: 'Ås' }).score)
      .toBeGreaterThan(scorePlace(b, { query: 'Ås' }).score);
  });
});

describe('the two rules it must not break', () => {
  // Reordering a list the reader can still see through is recoverable.
  // Hiding the one right answer is not.
  it('never removes a result', () => {
    const list = [SKIEN, SKIPPER, SKI];
    const out = rankPlaces(list, { query: 'zzz nothing matches', here: OSLO, now: NOW });
    expect(out.length).toBe(3);
    expect(out.map(r => r.label).sort()).toEqual(list.map(r => r.label).sort());
  });

  it('is stable, so it only moves things for a reason', () => {
    const a = { label: 'Alfa', id: null }, b = { label: 'Beta', id: null };
    expect(order([a, b], { query: 'zzz' })).toEqual(['Alfa', 'Beta']);
    expect(order([b, a], { query: 'zzz' })).toEqual(['Beta', 'Alfa']);
  });

  it('carries no reason when it has none, rather than inventing one', () => {
    expect(rankPlaces([SKIEN], { query: 'Skien', now: NOW })[0].why).toBe(undefined);
  });

  it('survives an empty or absent list', () => {
    expect(rankPlaces([], {})).toEqual([]);
    expect(rankPlaces(null, {})).toEqual([]);
  });

  it('works with no position and no history at all', () => {
    expect(order([SKIEN, SKI], { query: 'Ski stasjon' })[0]).toBe('Ski stasjon');
  });
});

describe('the weights are legible in one place', () => {
  // Smeared across four expressions, the balance cannot be read — and the
  // one that matters is that `match` dominates.
  // AGAINST ALL THE OTHERS TOGETHER, not each separately. The weaker
  // claim passed while 10 lost to 6+2+3, and the browser probe typed
  // «Skippergata» in full and was handed «Ski stasjon».
  it('match outweighs every other signal combined', () => {
    expect(matchDominates(W)).toBe(true);
    expect(matchDominates({ match: 10, used: 6, recent: 2, near: 4, transit: 3 })).toBe(false);
    expect(MATCH.exact).toBeGreaterThan(MATCH.prefix);
  });

  // The probe's case, as a unit test: a place used fourteen times, against
  // the exact word the reader just typed.
  it('an exact match beats a much-used place that does not match', () => {
    const daily = { label: 'Ski stasjon', id: 'NSR:2', lat: 59.7195, lon: 10.8356 };
    const typed = { label: 'Skippergata, Oslo', id: null, lat: 59.9105, lon: 10.7490 };
    expect(order([daily, typed], {
      query: 'Skippergata',
      freq: [{ name: 'Ski stasjon', count: 14, lastUsed: NOW - DAY }],
    })[0]).toBe('Skippergata, Oslo');
  });

  it('reaches no network and holds no key', () => {
    const src = fs.readFileSync('src/api/rankPlaces.js', 'utf8');
    expect(src).not.toMatch(/fetch|http|api_key|apiKey/i);
  });
});
