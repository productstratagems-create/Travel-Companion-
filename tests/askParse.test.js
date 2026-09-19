/**
 * «jeg skal til Sandvika fredag halv ni» → tre utfylte felter.
 *
 * «Utforsk» asks three questions and a reader who already knows the answer
 * pays four taps and two suggestion lists to give it. This reads the
 * sentence they would have said anyway.
 *
 * NOT a language model, and the reason is a hard constraint rather than a
 * preference: the app is a static bundle with no backend, and config.js
 * already records — checked against a real build — that Vite inlines env
 * values as plaintext. A model key would ship in the clear. So the parsing
 * is local and deterministic, and these tests are the whole specification.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseAsk } from '../src/api/askParse.js';

// Lørdag 19. september 2026, 10:00 local. Local, not UTC: a fixture with a
// fixed offset has been wrong in this codebase six times.
const NOW = new Date(2026, 8, 19, 10, 0).getTime();
const at = s => parseAsk(s, NOW);
const t = s => { const ms = at(s).atMs; return ms == null ? null : new Date(ms); };
const stamp = s => { const d = t(s); return d && [d.getDate(), d.getHours(), d.getMinutes()]; };

describe('the sentence in the request', () => {
  it('reads «jeg skal til tannlegen i Sandvika fredag halv ni»', () => {
    const r = at('jeg skal til tannlegen i Sandvika fredag halv ni');
    expect(r.to).toBe('tannlegen i Sandvika');
    expect(r.from).toBe(null);
    expect(stamp('jeg skal til tannlegen i Sandvika fredag halv ni')).toEqual([25, 8, 30]);
    expect(r.understood).toContain('til');
  });
});

describe('dagen', () => {
  it('reads i dag, i morgen, i overmorgen', () => {
    expect(t('til Ski i dag kl 12').getDate()).toBe(19);
    expect(t('til Ski i morgen kl 12').getDate()).toBe(20);
    expect(t('til Ski i overmorgen kl 12').getDate()).toBe(21);
  });

  // «fredag» spoken on a Friday is never about the hour that has passed.
  it('reads a weekday as the coming one, and a week ahead on that day', () => {
    expect(t('til Ski mandag kl 12').getDate()).toBe(21);       // Mon 21st
    const lørdag = parseAsk('til Ski lørdag kl 12', NOW).atMs;   // today IS Saturday
    expect(new Date(lørdag).getDate()).toBe(26);
    expect(t('til Ski neste mandag kl 12').getDate()).toBe(28);
  });

  it('a day with no hour is the start of that day, not this moment on it', () => {
    expect(stamp('til Ski på mandag')).toEqual([21, 0, 0]);
  });
});

describe('tiden', () => {
  it('reads a written clock', () => {
    expect(stamp('til Ski i morgen 08:15')).toEqual([20, 8, 15]);
    expect(stamp('til Ski i morgen kl. 8.05')).toEqual([20, 8, 5]);
    expect(stamp('til Ski i morgen kl 20')).toEqual([20, 20, 0]);
  });

  // «halv ni» is half TO nine. Getting this backwards is a half-hour error
  // in the direction that makes you miss the bus.
  it('reads halv, kvart over and kvart på', () => {
    expect(stamp('til Ski i morgen halv ni')).toEqual([20, 8, 30]);
    expect(stamp('til Ski i morgen kvart over åtte')).toEqual([20, 8, 15]);
    expect(stamp('til Ski i morgen kvart på ni')).toEqual([20, 8, 45]);
  });

  // JavaScript's \b is defined on [A-Za-z0-9_], so «å» is not a word
  // character and /\båtte\b/ never matches «åtte». A third of the hour
  // words begin with æøå; a parser for Norwegian built on \b is deaf to
  // them. This case failed before EDGE existed.
  it('hears the hour words that start with a Norwegian letter', () => {
    expect(stamp('til Ski i morgen halv åtte')).toEqual([20, 7, 30]);
    expect(stamp('til jobb i kveld åtte')).toEqual([19, 20, 0]);
  });

  it('reads relative times', () => {
    expect(stamp('om 20 min til Ski')).toEqual([19, 10, 20]);
    expect(stamp('om en time til Ski')).toEqual([19, 11, 0]);
    expect(stamp('om 3 timer til Ski')).toEqual([19, 13, 0]);
  });

  it('reads parts of the day', () => {
    expect(stamp('til Ski i morgen tidlig')).toEqual([20, 7, 0]);
    expect(stamp('til Ski i kveld')).toEqual([19, 18, 0]);
  });

  // «kvart på fem» at ten in the morning means 16:45 today. Rolling it to
  // 04:45 tomorrow is technically a future time and useless as an answer.
  it('prefers this afternoon over tomorrow morning for a spoken hour', () => {
    expect(stamp('kvart på fem til Ski')).toEqual([19, 16, 45]);
    expect(stamp('til Ski kl 2')).toEqual([19, 14, 0]);
  });

  // But a WRITTEN 08:15 that has passed is tomorrow's 08:15, never
  // tonight's 20:15 — the reader typed the hour they meant.
  it('never moves a written clock into the afternoon', () => {
    expect(stamp('til Ski 08:15')).toEqual([20, 8, 15]);
  });

  it('never proposes a time that has already gone', () => {
    for (const s of ['til Ski kl 9', 'til Ski 08:15', 'kvart på fem til Ski', 'til Ski i kveld']) {
      expect(t(s).getTime(), s).toBeGreaterThan(NOW);
    }
  });
});

describe('stedene', () => {
  it('reads fra … til … in either order', () => {
    expect(at('fra Kongsberg til Bergen')).toMatchObject({ from: 'Kongsberg', to: 'Bergen' });
    expect(at('til Bergen fra Kongsberg')).toMatchObject({ from: 'Kongsberg', to: 'Bergen' });
  });

  it('treats a bare place as a destination', () => {
    expect(at('Majorstuen')).toMatchObject({ from: null, to: 'Majorstuen' });
  });

  // The time words are stripped BEFORE the places are read, or «Bergen på
  // mandag» minus «mandag» leaves «bergen på» and the geocoder is asked
  // for the wrong thing.
  it('does not leave the time phrase inside the place name', () => {
    expect(at('fra Kongsberg til Bergen på mandag kl 7').to).toBe('Bergen');
    expect(at('til Lillestrøm i morgen tidlig').to).toBe('Lillestrøm');
    expect(at('til jobb i kveld åtte').to).toBe('jobb');
  });

  // The note under the field is this feature's safety mechanism, so it
  // must read like the sentence the reader wrote. Lowercasing «Oslo S» to
  // «oslo s» was invisible to every one of 1620 tests and obvious in one
  // screenshot.
  it('keeps the reader\'s own casing', () => {
    expect(at('fra Storaas til Oslo S mandag 06:00'))
      .toMatchObject({ from: 'Storaas', to: 'Oslo S' });
  });

  it('drops the words nobody means as a place', () => {
    expect(at('jeg skal reise til Ski').to).toBe('Ski');
  });
});

describe('what it does not understand, it leaves alone', () => {
  it('returns nothing from nothing', () => {
    expect(at('')).toMatchObject({ from: null, to: null, atMs: null });
    expect(at('   ').understood).toEqual([]);
  });

  // A wrong reading must cost a glance, never a missed bus — so the parser
  // reports which parts it actually read, and the screen shows them.
  it('names only the parts it read', () => {
    expect(at('Majorstuen').understood).toEqual(['til']);
    expect(at('fra Ski til Ås i morgen kl 8').understood.sort())
      .toEqual(['dag', 'fra', 'tid', 'til']);
  });

  it('never invents a place out of a bare time', () => {
    const r = at('i morgen kl 8');
    expect(r.to).toBe(null);
    expect(r.from).toBe(null);
    expect(r.atMs).not.toBe(null);
  });
});

describe('the constraint that shaped this', () => {
  // Named in the source, not left as an apparent oversight: a reader who
  // wonders why this is regexes and not a model should find the answer
  // beside the code.
  it('says why it is not a model', () => {
    const src = fs.readFileSync('src/api/askParse.js', 'utf8');
    expect(src).toMatch(/plaintext|static bundle|no backend/i);
  });

  it('reaches no network at all', () => {
    const src = fs.readFileSync('src/api/askParse.js', 'utf8');
    expect(src).not.toMatch(/fetch|import .* from '\.\.\/(api|ui)\//);
  });
});
