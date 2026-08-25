import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveBoardSnapshot, loadBoardSnapshot, clearBoardSnapshot,
} from '../src/boardCache.js';

const DIR      = { from: 'Jernbanetorget', via: null, to: 'Nationaltheatret' };
const OTHER    = { from: 'Jernbanetorget', via: null, to: 'Majorstuen' };
const WITH_VIA = { from: 'Jernbanetorget', via: 'Stortinget', to: 'Nationaltheatret' };

const deps = (n) => Array.from({ length: n }, (_, i) => ({ id: 'dep' + i }));

describe('boardCache', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('round-trips a snapshot for the same route', () => {
    vi.setSystemTime(1_700_000_000_000);
    saveBoardSnapshot(DIR, deps(3), 1_700_000_000_000);
    const got = loadBoardSnapshot(DIR);
    expect(got.deps).toHaveLength(3);
    expect(got.deps[0].id).toBe('dep0');
    expect(got.ts).toBe(1_700_000_000_000);
  });

  it('refuses a snapshot taken on a different route', () => {
    saveBoardSnapshot(DIR, deps(3), Date.now());
    expect(loadBoardSnapshot(OTHER)).toBeNull();
  });

  it('treats a via stop as part of the route identity', () => {
    saveBoardSnapshot(DIR, deps(3), Date.now());
    expect(loadBoardSnapshot(WITH_VIA)).toBeNull();
  });

  it('drops a snapshot older than six hours', () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    saveBoardSnapshot(DIR, deps(3), now - 5.9 * 60 * 60 * 1000);
    expect(loadBoardSnapshot(DIR)).not.toBeNull();
    saveBoardSnapshot(DIR, deps(3), now - 6.1 * 60 * 60 * 1000);
    expect(loadBoardSnapshot(DIR)).toBeNull();
  });

  it('caps what it stores so a trip-pattern board cannot blow the quota', () => {
    saveBoardSnapshot(DIR, deps(40), Date.now());
    expect(loadBoardSnapshot(DIR).deps).toHaveLength(12);
  });

  it('does not store an empty board over a good one', () => {
    saveBoardSnapshot(DIR, deps(3), Date.now());
    saveBoardSnapshot(DIR, [], Date.now());
    expect(loadBoardSnapshot(DIR).deps).toHaveLength(3);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('default::t.lastBoard', 'not json');
    expect(loadBoardSnapshot(DIR)).toBeNull();
  });

  it('returns null with nothing stored, and after clearing', () => {
    expect(loadBoardSnapshot(DIR)).toBeNull();
    saveBoardSnapshot(DIR, deps(2), Date.now());
    clearBoardSnapshot();
    expect(loadBoardSnapshot(DIR)).toBeNull();
  });
});
