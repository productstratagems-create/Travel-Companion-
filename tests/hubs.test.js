import { describe, it, expect, vi, beforeEach } from 'vitest';

let calls = [];
let reply = null;
vi.mock('../src/api/http.js', () => ({
  ET_CLIENT_NAME: 'test',
  enturFetch: (url, opts) => {
    calls.push(JSON.parse(opts.body).query);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reply) });
  },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/config.js', () => ({
  default: { api: { journeyPlanner: 'https://x/jp' }, storage: { dir: 't.dir' }, dirs: [{ key: 'out' }] },
}));

const { loadHubs, saveHubs, ensureHubs, isHub, HUB_QUAYS, _resetHubs, _hubProbeRejected } =
  await import('../src/api/hubs.js');

const ok = (places) => ({ data: { stopPlaces: places } });
const rejected = () => ({ errors: [{ message: "Unknown field 'quays'" }] });

beforeEach(() => { calls = []; reply = ok([]); localStorage.clear(); _resetHubs(); });

// ── Which stops are worth anchoring on ─────────────────────────────────────
//
// Asked for: keep the whole line in its own order, and anchor it on the
// interchanges — with a register the app fills itself, looked up locally.
//
// The register holds RAW FACTS, not a verdict, because the threshold is the
// one thing that cannot be checked from here: I do not know how many
// platforms Helsfyr has against Godlia. Facts mean the threshold can move
// later without asking Entur anything again.
describe('isHub', () => {
  it('counts a place with many platforms', () => {
    expect(isHub({ q: HUB_QUAYS, m: ['metro'] })).toBe(true);
    expect(isHub({ q: HUB_QUAYS - 1, m: ['metro'] })).toBe(false);
  });

  // Two platforms where the bus meets the metro is an interchange in the only
  // sense the reader cares about.
  it('counts a place where two modes meet, however small', () => {
    expect(isHub({ q: 2, m: ['metro', 'bus'] })).toBe(true);
  });

  it('says no rather than guessing when it knows nothing', () => {
    [null, undefined, {}, { q: 0, m: [] }, { m: [null, null] }].forEach(e =>
      expect(isHub(e)).toBe(false));
  });
});

describe('the register', () => {
  it('survives a round trip', () => {
    saveHubs({ 'NSR:StopPlace:1': { q: 6, m: ['metro'] } });
    expect(loadHubs()['NSR:StopPlace:1'].q).toBe(6);
  });

  it('is empty rather than broken when the stored value is rubbish', () => {
    localStorage.setItem('default::t.hubs', 'not json');
    expect(loadHubs()).toEqual({});
    localStorage.setItem('default::t.hubs', '[1,2]');
    expect(loadHubs()).toEqual({});
  });
});

describe('ensureHubs', () => {
  it('asks once for the stops it does not know', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [{ id: 'q1' }, { id: 'q2' }] }]);
    await ensureHubs(['A']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('"A"');
    expect(loadHubs().A.q).toBe(2);
  });

  // The whole point of a register: the second opening of a line is free.
  it('asks nothing at all when everything is already known', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [{ id: 'q1' }] }]);
    await ensureHubs(['A']);
    calls = [];
    await ensureHubs(['A']);
    expect(calls).toHaveLength(0);
  });

  it('asks only about the ones that are new', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [] }]);
    await ensureHubs(['A']);
    calls = [];
    reply = ok([{ id: 'B', transportMode: 'bus', quays: [] }]);
    await ensureHubs(['A', 'B']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('"B"');
    expect(calls[0]).not.toContain('"A"');
  });

  // A stop the answer said nothing about must still count as asked, or every
  // opening of the line would ask about it again for ever.
  it('remembers the stops the answer skipped', async () => {
    reply = ok([]);
    await ensureHubs(['A', 'B']);
    calls = [];
    await ensureHubs(['A', 'B']);
    expect(calls).toHaveLength(0);
    expect(isHub(loadHubs().A)).toBe(false);
  });

  // The fields cannot be checked from here, so a rejection is the expected
  // half of the probe: no anchors, and — the part that matters — not one
  // request per line for the rest of the day.
  it('gives up for the session when the fields are refused', async () => {
    reply = rejected();
    await ensureHubs(['A']);
    expect(_hubProbeRejected()).toBe(true);
    calls = [];
    await ensureHubs(['B', 'C']);
    expect(calls).toHaveLength(0);
  });

  it('hands back what it already had rather than throwing', async () => {
    reply = rejected();
    saveHubs({ A: { q: 9, m: ['metro'] } });
    const out = await ensureHubs(['B']);
    expect(out.A.q).toBe(9);
  });
});
