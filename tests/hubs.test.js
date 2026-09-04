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

const { loadHubs, saveHubs, ensureHubs, hubScore, anchorIds, ANCHOR_SHARE, HUB_V,
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
describe('hubScore', () => {
  // How much a stop stands out: lines calling, plus a nudge for each mode
  // beyond the first. `q` is the fallback for the world where the line field
  // was refused, so the relative rule still works there, just more coarsely.
  it('counts the lines', () => {
    expect(hubScore({ v: 2, l: 5, q: 2, m: ['metro'] })).toBe(5);
  });

  it('adds one for every mode past the first', () => {
    expect(hubScore({ v: 2, l: 5, q: 2, m: ['metro', 'bus'] })).toBe(6);
  });

  it('falls back to platforms when the line field was refused', () => {
    expect(hubScore({ v: 2, q: 4, m: ['metro'] })).toBe(4);
  });

  it('is zero for what it does not know', () => {
    expect(hubScore(null)).toBe(0);
    expect(hubScore({})).toBe(0);
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
    expect(hubScore(loadHubs().A)).toBe(0);
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

// ── Which stops on a line are worth anchoring on ─────────────────────────
//
// v1.81.0 used an absolute rule — two or more lines calling — and the report
// came straight back: "ser ut som alle holdeplasser er blitt til
// knutepunkter". Whatever Entur returns for an ordinary Oslo metro stop, it
// clears two. Raising the number would have been the same guess with a
// different digit, so there is no absolute number left: a stop anchors when
// it stands out AGAINST THE LINE IT IS ON.
describe('anchorIds', () => {
  const stop = (id) => ({ id, name: id });
  const reg = (map) => Object.fromEntries(
    Object.entries(map).map(([id, l]) => [id, { v: 2, q: 2, m: ['metro'], l }]));

  // The reported line: a handful of interchanges among plain stops.
  const LINE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'Helsfyr', 'Jernbanetorget']
    .map(stop);

  it('anchors the stops that stand out', () => {
    const ids = anchorIds(LINE, reg({
      a: 3, b: 3, c: 3, d: 3, e: 3, f: 3, g: 3, h: 3, Helsfyr: 9, Jernbanetorget: 12,
    }));
    expect([...ids].sort()).toEqual(['Helsfyr', 'Jernbanetorget']);
  });

  // THE REPORTED BUG, as one assertion: every stop clearing an absolute
  // threshold must not make every stop an anchor.
  it('cannot anchor everything, however many lines call everywhere', () => {
    const ids = anchorIds(LINE, reg(Object.fromEntries(LINE.map(s => [s.id, 7]))));
    expect(ids.size).toBe(0);
  });

  it('never anchors more than its share of the line', () => {
    const rising = Object.fromEntries(LINE.map((s, i) => [s.id, i + 1]));
    const ids = anchorIds(LINE, reg(rising));
    expect(ids.size).toBeLessThanOrEqual(Math.floor(LINE.length * ANCHOR_SHARE));
    // …and it keeps the biggest ones.
    expect(ids.has('Jernbanetorget')).toBe(true);
    expect(ids.has('a')).toBe(false);
  });

  it('anchors nothing when the register knows nothing', () => {
    expect(anchorIds(LINE, {}).size).toBe(0);
    expect(anchorIds(LINE, null).size).toBe(0);
    expect(anchorIds(null, {}).size).toBe(0);
  });

  // The world where Quay.lines was refused: every entry has only a platform
  // count, and the same relative rule still separates them.
  it('still separates stops when only platforms are known', () => {
    const hubs = Object.fromEntries(LINE.map((s, i) => [s.id,
      { v: 2, q: i >= 8 ? 8 : 2, m: ['metro'] }]));
    expect([...anchorIds(LINE, hubs)].sort()).toEqual(['Helsfyr', 'Jernbanetorget']);
  });

  // A mode meeting still counts, but as weight rather than as a verdict.
  it('lets a bus meeting the metro tip a stop over', () => {
    const hubs = Object.fromEntries(LINE.map(s => [s.id, { v: 2, q: 2, m: ['metro'], l: 3 }]));
    hubs.Helsfyr = { v: 2, q: 2, m: ['metro', 'bus', 'tram'], l: 3 };
    expect([...anchorIds(LINE, hubs)]).toEqual(['Helsfyr']);
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
    // Two lines and two modes: score 3, where a plain one-line metro stop is 1.
    expect(hubScore(e)).toBe(3);
  });

  // Distinct line ids, so a line calling in both directions stays one line.
  it('counts a line once however many quays it calls at', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [
      { id: 'q1', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] },
      { id: 'q2', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] },
    ] }]);
    await ensureHubs(['A']);
    expect(loadHubs().A.l).toBe(1);
    expect(hubScore(loadHubs().A)).toBe(1);   // one line, one mode
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
    // No `l`, so the score falls back to the platform count — which the
    // relative rule can still separate stops by.
    expect(hubScore(loadHubs().A)).toBe(4);
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

describe('the cap and a tie', () => {
  const stop = (id) => ({ id, name: id });
  const LINE = ['a','b','c','d','e','f','g','h','i','j'].map(stop);

  // Two stops with the same score are the same kind of place. Marking one and
  // not the other is a distinction the data does not make — measured on the
  // line 3 fixture, where Grønland and Tøyen both scored 5 and only Tøyen was
  // anchored, because it happened to sort first.
  const LINE12 = ['a','b','c','d','e','f','g','h','i','j','k','l'].map(stop);

  it('does not cut through a tie', () => {
    // Six quiet stops, three middling, three busy. The cap is 4 and there are
    // six above the median, so the cut lands INSIDE the group of three
    // middling ones — which is the only arrangement that exercises this at
    // all. The first version of this test never reached the branch.
    const hubs = Object.fromEntries(LINE12.map((s, i) => [s.id,
      { v: 2, q: 2, m: ['metro'], l: i < 6 ? 1 : (i < 9 ? 5 : 9) }]));
    const ids = anchorIds(LINE12, hubs);
    expect(ids.size).toBe(6);
    ['g', 'h', 'i'].forEach(id => expect(ids.has(id)).toBe(true));   // the tie
    ['a', 'f'].forEach(id => expect(ids.has(id)).toBe(false));
  });

  // The baseline has to be the MEDIAN, not the quietest stop. Taking the
  // minimum would mean that on a line where most stops are busy and a couple
  // are quiet, the busy majority all became anchors — which is the reported
  // bug wearing a different hat.
  it('anchors nothing when the busy stops are the majority', () => {
    const hubs = Object.fromEntries(LINE.map((s, i) => [s.id,
      { v: 2, q: 2, m: ['metro'], l: i < 2 ? 1 : 5 }]));
    expect(anchorIds(LINE, hubs).size).toBe(0);
  });

  it('still refuses to anchor a line where every stop is alike', () => {
    const hubs = Object.fromEntries(LINE.map(s => [s.id, { v: 2, q: 2, m: ['metro'], l: 5 }]));
    expect(anchorIds(LINE, hubs).size).toBe(0);
  });
});
