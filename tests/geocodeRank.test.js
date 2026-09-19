/**
 * The ranking has to actually reach the geocoder's answers.
 *
 * `rankPlaces` being right is worth nothing if `geocodeDest` never calls
 * it — and the seam is opt-in, so a caller that forgets the context gets
 * today's order with no error anywhere. Both halves are pinned here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

const feature = (label, id, lat, lon, cats) => ({
  properties: { id, label, name: label, category: cats || [] },
  geometry: { coordinates: [lon, lat] },
});

const BODY = {
  features: [
    feature('Skien stasjon', 'NSR:StopPlace:1', 59.2005, 9.6050, ['railStation']),
    feature('Skippergata, Oslo', 'NSR:Address:9', 59.9105, 10.7490, []),
    feature('Ski stasjon', 'NSR:StopPlace:2', 59.7195, 10.8356, ['railStation']),
  ],
};

const OSLO = { lat: 59.9111, lon: 10.7528 };
let geocodeDest;

beforeEach(async () => {
  vi.resetModules();
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => BODY }));
  ({ geocodeDest } = await import('../src/api/entur.js'));
});

describe('geocodeDest', () => {
  // A query where the two orders genuinely differ, or the case proves
  // nothing: «Skippergata» is an EXACT match and not a transit place, so
  // today's transit-first rule buries it and the ranking lifts it. With
  // «Ski» both orders happen to agree, and a mutant that ranked
  // unconditionally survived that fixture — the fixture measuring its own
  // absence, for the sixth time in this codebase.
  it('keeps today\'s order when no context is given', async () => {
    const out = await geocodeDest('Skippergata');
    expect(out.map(r => r.label)).toEqual(['Skien stasjon', 'Ski stasjon', 'Skippergata, Oslo']);
    expect(out.every(r => r.why === undefined)).toBe(true);
  });

  it('and ranks it first once a context says to', async () => {
    const out = await geocodeDest('Skippergata', { here: OSLO, freq: [] });
    expect(out[0].label).toBe('Skippergata, Oslo');
  });

  it('applies the reader\'s history and position when given them', async () => {
    const out = await geocodeDest('Ski', {
      role: 'arr', here: OSLO,
      freq: [{ name: 'Ski stasjon', count: 14, lastUsed: Date.now() - 86400000 }],
    });
    expect(out[0].label).toBe('Ski stasjon');
    expect(out[0].why).toBe('ofte brukt');
  });

  it('returns every row either way — the ranking reorders, it does not filter', async () => {
    const plain = await geocodeDest('Ski');
    const ranked = await geocodeDest('Ski', { here: OSLO, freq: [] });
    expect(ranked.length).toBe(plain.length);
    expect(ranked.map(r => r.label).sort()).toEqual(plain.map(r => r.label).sort());
  });

  // The screen that has the context must pass it, or the whole release is
  // inert while every test above still passes.
  it('and «Utforsk» passes it', () => {
    const src = fs.readFileSync('src/views/explore.js', 'utf8');
    expect(src).toMatch(/geocodeDest\(q,\s*\{/);
    expect(src).toMatch(/loadFreq\(/);
    expect(src).toMatch(/here:/);
  });
});
