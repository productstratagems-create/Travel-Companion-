/**
 * Hva appen husker om deg, i sju døgn, på din egen telefon.
 *
 * `api/smart.js` has recorded trips for many releases, but it AGGREGATES AS
 * IT WRITES: destination, two-hour bucket, weekday, then a counter. «Last
 * week» was never stored, so no rule could ever be written about it.
 *
 * This is the missing half — and, because the log may hold coordinates, the
 * invariant that keeps «we are open about it» from being merely a sentence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import {
  logEvent, recentEvents, clearEvents, describeEvent, prune,
  FIELD_LABELS, KINDS, MEMORY_DAYS, EVENT_MAX,
} from '../src/api/eventLog.js';
import { loadConsent, saveConsent } from '../src/api/consent.js';
import { recordSmartTrip, loadSmartHist } from '../src/api/smart.js';

const DAY = 86400000;
const POS = { lat: 59.8944, lon: 10.8133, acc: 12 };
const raw = () => JSON.parse(localStorage.getItem('default::t.events') || '[]');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

// ── THE BEFORE PICTURE ───────────────────────────────────────
describe('why this exists', () => {
  it('smartHist cannot tell last week from last year', () => {
    // Four trips, and four trips. Only the spacing differs — and after
    // recordSmartTrip has aggregated them, not even that survives.
    recordSmartTrip('Ryen', 'Oslo S', null, null, null, null);
    recordSmartTrip('Ryen', 'Oslo S', null, null, null, null);
    const hist = loadSmartHist();
    const row = hist.find(h => h.toName === 'Oslo S');
    // One row, a count, and a single lastUsed. The individual trips — when
    // each happened — are gone, so «four times last week» is unaskable.
    expect(row.count).toBe(2);
    expect(Object.keys(row)).not.toContain('events');
    expect(Object.keys(row).some(k => Array.isArray(row[k]))).toBe(false);
  });
});

// ── THE ASSERTION EVERYTHING RESTS ON ────────────────────────
describe('consent', () => {
  it('is off until explicitly given', () => {
    expect(loadConsent()).toBe(false);
  });

  // THE GUARD IS INSIDE logEvent, not at the call sites: a caller added in a
  // year cannot forget it, and there is one place to read to know whether
  // the app is allowed to write.
  it('writes nothing at all without it', () => {
    expect(logEvent('reise', { fra: 'Ryen', til: 'Oslo S' }, POS)).toBe(false);
    expect(localStorage.getItem('default::t.events')).toBe(null);
    expect(recentEvents(Date.now())).toEqual([]);
  });

  it('writes once given', () => {
    saveConsent(true);
    expect(logEvent('reise', { fra: 'Ryen', til: 'Oslo S' }, POS)).toBe(true);
    expect(raw().length).toBe(1);
  });

  // A missing, corrupt, or older-build value all mean no.
  it('treats anything but an explicit yes as no', () => {
    for (const v of ['0', '', 'true', 'ja', '{}']) {
      localStorage.setItem('default::t.memoryConsent', v);
      expect(loadConsent(), v).toBe(false);
    }
  });
});

// ── THE INVARIANT ────────────────────────────────────────────
describe('nothing is stored that is not shown', () => {
  /** Every key appearing anywhere in the stored JSON, including nested. */
  const keysOf = (v, out = new Set()) => {
    if (Array.isArray(v)) v.forEach(x => keysOf(x, out));
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) { out.add(k); keysOf(v[k], out); }
    }
    return out;
  };

  it('every stored field has a label a person can read', () => {
    saveConsent(true);
    logEvent('reise', { fra: 'Ryen', til: 'Oslo S', linje: '3' }, POS);
    logEvent('gange', { meter: 640, sekunder: 540 }, POS);
    logEvent('sok', { valgt: 'Grünerløkka' }, POS);
    const stored = keysOf(raw());
    expect(stored.size).toBeGreaterThan(5);
    for (const k of stored) {
      expect(FIELD_LABELS, 'ulagret felt uten etikett: ' + k).toHaveProperty(k);
    }
  });

  // A caller handing over a whole `dir` must not be able to smuggle a stop
  // id, a URL or anything else in by accident. What is stored is what KINDS
  // and FIELD_LABELS name.
  it('drops anything the kind did not declare', () => {
    saveConsent(true);
    logEvent('reise', { fra: 'Ryen', til: 'Oslo S', stopId: 'NSR:StopPlace:1', hemmelig: 'x' }, null);
    const stored = keysOf(raw());
    expect(stored.has('stopId')).toBe(false);
    expect(stored.has('hemmelig')).toBe(false);
  });

  it('refuses a kind it does not know', () => {
    saveConsent(true);
    expect(logEvent('alt', { hva: 'som helst' }, POS)).toBe(false);
    expect(raw().length).toBe(0);
  });

  it('and every declared field is renderable', () => {
    for (const fields of Object.values(KINDS)) {
      for (const f of fields) expect(FIELD_LABELS).toHaveProperty(f);
    }
  });
});

// ── POSITION ─────────────────────────────────────────────────
describe('posisjon', () => {
  it('is stored with its accuracy, never without', () => {
    saveConsent(true);
    logEvent('reise', { fra: 'A', til: 'B' }, POS);
    expect(raw()[0].pos).toEqual({ lat: POS.lat, lon: POS.lon, noyaktighet: 12 });
  });

  // v1.108.0 exists because a screen asserted something it did not know. A
  // point at ±3000 m is a different fact from one at ±8 m.
  it('says «unknown» rather than implying precision it lacks', () => {
    saveConsent(true);
    logEvent('reise', { fra: 'A', til: 'B' }, { lat: 59.9, lon: 10.7 });
    expect(raw()[0].pos.noyaktighet).toBe(null);
    expect(describeEvent(raw()[0]).text).toMatch(/ukjent nøyaktighet/);
  });

  it('is absent when there is none — never guessed', () => {
    saveConsent(true);
    logEvent('sok', { valgt: 'Ski' }, null);
    logEvent('sok', { valgt: 'Ås' }, { lat: NaN, lon: 10.7, acc: 5 });
    expect(raw().every(e => e.pos === undefined)).toBe(true);
  });

  it('is shown, not merely stored', () => {
    saveConsent(true);
    logEvent('reise', { fra: 'Ryen', til: 'Oslo S' }, POS);
    const d = describeEvent(raw()[0]);
    expect(d.text).toContain('59.89440');
    expect(d.text).toContain('±12 m');
    expect(d.pos).toEqual(raw()[0].pos);
  });
});

// ── THE WINDOW ───────────────────────────────────────────────
describe('sju døgn', () => {
  // ENFORCED ON WRITE. A filter on read would leave the old data sitting in
  // storage while the screen claimed seven days — and what is STORED is what
  // someone holding the phone can read.
  it('drops what is older than the window from storage, not just the view', () => {
    saveConsent(true);
    const old = [{ kind: 'reise', at: Date.now() - 8 * DAY, fra: 'A', til: 'B' }];
    localStorage.setItem('default::t.events', JSON.stringify(old));
    logEvent('reise', { fra: 'C', til: 'D' }, null);
    expect(raw().length).toBe(1);
    expect(raw()[0].fra).toBe('C');
  });

  it('keeps what is inside it', () => {
    const now = Date.now();
    const inside = { kind: 'reise', at: now - (MEMORY_DAYS * DAY) + 60000 };
    const outside = { kind: 'reise', at: now - (MEMORY_DAYS * DAY) - 60000 };
    expect(prune([inside, outside], now)).toEqual([inside]);
  });

  it('caps at EVENT_MAX and the oldest go first', () => {
    const now = Date.now();
    const many = Array.from({ length: EVENT_MAX + 20 }, (_, i) =>
      ({ kind: 'sok', at: now - (EVENT_MAX + 20 - i) * 1000, valgt: 's' + i }));
    const kept = prune(many, now);
    expect(kept.length).toBe(EVENT_MAX);
    expect(kept[0].valgt).toBe('s20');
  });

  it('survives a corrupt or absent store', () => {
    localStorage.setItem('default::t.events', 'ikke json');
    expect(recentEvents(Date.now())).toEqual([]);
    expect(prune(null, Date.now())).toEqual([]);
  });
});

describe('sletting', () => {
  it('clearEvents empties it at once', () => {
    saveConsent(true);
    logEvent('reise', { fra: 'A', til: 'B' }, POS);
    clearEvents();
    expect(localStorage.getItem('default::t.events')).toBe(null);
  });

  // The key is in ALL_KEYS, so a profile deletion takes the log with it.
  // storageKeys.test.js guards the list; this states the consequence.
  it('the log and the consent are profile-scoped keys', () => {
    const src = fs.readFileSync('src/storage.js', 'utf8');
    const all = src.slice(src.indexOf('const ALL_KEYS'), src.indexOf('const PROFILES_KEY'));
    expect(all).toContain("'t.events'");
    expect(all).toContain("'t.memoryConsent'");
  });

  // Turning consent off must not leave a week of positions sitting unused.
  it('the screen empties the log when consent is withdrawn', () => {
    const src = fs.readFileSync('src/views/settings.js', 'utf8');
    const fn = src.slice(src.indexOf('export function initMemory'), src.indexOf('export function showPrefs'));
    expect(fn).toMatch(/if \(!cb\.checked\) clearEvents\(\)/);
  });
});

describe('describeEvent', () => {
  it('renders each kind as a line a person can judge', () => {
    const at = new Date(2026, 8, 21, 8, 12).getTime();
    expect(describeEvent({ kind: 'reise', at, fra: 'Ryen', til: 'Oslo S', linje: '3' }))
      .toMatchObject({ when: '21.09 08:12', kind: 'reise' });
    expect(describeEvent({ kind: 'gange', at, meter: 640, sekunder: 540 }).text)
      .toContain('640');
    expect(describeEvent({ kind: 'sok', at, valgt: 'Ski' }).text).toContain('Ski');
  });

  it('says nothing about nothing', () => {
    expect(describeEvent(null)).toBe(null);
    expect(describeEvent({})).toBe(null);
  });
});
