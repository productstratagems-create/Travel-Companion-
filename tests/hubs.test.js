import { describe, it, expect, vi, beforeEach } from 'vitest';

let calls = [];
let reply = null;
vi.mock('../src/api/http.js', () => ({
  ET_CLIENT_NAME: 'test',
  enturFetch: (url, opts) => {
    calls.push(JSON.parse(opts.body).query);
    // reply may be a function, so a test can answer differently on the first
    // and second call — which is exactly what a probe-and-fallback needs.
    const r = typeof reply === 'function' ? reply() : reply;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(r) });
  },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/config.js', () => ({
  default: { api: { journeyPlanner: 'https://x/jp' }, storage: { dir: 't.dir' }, dirs: [{ key: 'out' }] },
}));

const { loadHubs, saveHubs, ensureHubs, isHub, HUB_QUAYS, HUB_V,
  _resetHubs, _hubProbeRejected, _hubRichRefused } = await import('../src/api/hubs.js');

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

// ── What actually makes somewhere an interchange ──────────────────────────
//
// Reported with a screenshot of line 3: only Brynseng and Stortinget were
// anchored. Helsfyr, Tøyen, Grønland, Jernbanetorget and Nationaltheatret
// were not — every one of them somewhere you obviously change.
//
// The cause was a DEAD BRANCH, not a threshold set too high. `m` was built
// from StopPlace.transportMode, which is a single value, so `new Set(m).size
// > 1` could never be true and the whole rule was the quay count. Helsfyr has
// four metro lines and the buses on two platforms, and did not qualify.
describe('isHub, with the lines', () => {
  it('anchors a stop where two lines meet', () => {
    expect(isHub({ v: 2, q: 2, m: ['metro'], l: 4 })).toBe(true);   // Helsfyr
    expect(isHub({ v: 2, q: 2, m: ['metro'], l: 1 })).toBe(false);  // Bogerud
  });

  it('anchors a stop where the bus meets the metro', () => {
    expect(isHub({ v: 2, q: 2, m: ['metro', 'bus'], l: 1 })).toBe(true);
  });

  // `l` absent means the rich query was refused, not that there is one line.
  // Reading unknown as one would quietly mark every plain stop as plain — the
  // right answer, by luck, until the day it is not.
  it('skips the line test when the field was never answered', () => {
    expect(isHub({ v: 2, q: 2, m: ['metro'] })).toBe(false);
    expect(isHub({ v: 2, q: 4, m: ['metro'] })).toBe(true);   // quay rule survives
  });
});

describe('the modes really are a union now', () => {
  it('collects modes from the lines at every quay', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [
      { id: 'q1', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] },
      { id: 'q2', lines: [{ id: 'RUT:Line:79', transportMode: 'bus' }] },
    ] }]);
    await ensureHubs(['A']);
    const e = loadHubs().A;
    expect([...e.m].sort()).toEqual(['bus', 'metro']);
    expect(e.l).toBe(2);
    expect(isHub(e)).toBe(true);
  });

  // Distinct line ids, so a line calling in both directions stays one line.
  it('counts a line once however many quays it calls at', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [
      { id: 'q1', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] },
      { id: 'q2', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] },
    ] }]);
    await ensureHubs(['A']);
    expect(loadHubs().A.l).toBe(1);
    expect(isHub(loadHubs().A)).toBe(false);
  });
});

describe('entries written by an older build', () => {
  // Without this the reader who has already used the app is exactly the one
  // who sees no improvement: their register is full of entries that will
  // never gain a line count.
  it('are asked again rather than trusted', async () => {
    localStorage.setItem('default::t.hubs', JSON.stringify({ A: { q: 6, m: ['metro'], ts: 1 } }));
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [
      { id: 'q1', lines: [{ id: 'RUT:Line:1', transportMode: 'metro' }] },
      { id: 'q2', lines: [{ id: 'RUT:Line:2', transportMode: 'metro' }] },
    ] }]);
    await ensureHubs(['A']);
    expect(calls).toHaveLength(1);
    expect(loadHubs().A.v).toBe(HUB_V);
    expect(loadHubs().A.l).toBe(2);
  });

  it('and an entry written by this build is not', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [] }]);
    await ensureHubs(['A']);
    calls = [];
    await ensureHubs(['A']);
    expect(calls).toHaveLength(0);
  });
});

describe('the ladder', () => {
  it('asks for the lines first', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [] }]);
    await ensureHubs(['A']);
    expect(calls[0]).toContain('lines{id transportMode}');
  });

  // Quay.lines cannot be tried from here, so being turned down is the
  // expected half of the probe — and the fallback is the query v1.72.0
  // shipped, which means the failure mode is "as before", not worse.
  it('drops to counting platforms when the lines are refused, once', async () => {
    let n = 0;
    reply = () => (++n === 1
      ? { errors: [{ message: "Cannot query field 'lines'" }] }
      : { data: { stopPlaces: [{ id: 'A', transportMode: 'metro',
          quays: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }] }] } });
    await ensureHubs(['A']);
    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toContain('lines{');
    expect(loadHubs().A.q).toBe(4);
    expect(isHub(loadHubs().A)).toBe(true);      // the old rule still anchors
    expect(_hubRichRefused()).toBe(true);

    // And the refusal is remembered: the next line asks the plain query once.
    calls = [];
    await ensureHubs(['B']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('lines{');
  });

  it('gives up for the session when even the plain query is refused', async () => {
    reply = rejected();
    await ensureHubs(['A']);
    expect(calls).toHaveLength(2);
    calls = [];
    await ensureHubs(['B']);
    expect(calls).toHaveLength(0);
    expect(_hubProbeRejected()).toBe(true);
  });
});
