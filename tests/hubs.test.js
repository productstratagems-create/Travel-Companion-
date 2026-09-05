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

const { loadHubs, saveHubs, ensureHubs, anchorIds, hubReport, HUB_MIN_LINES, HUB_V,
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
    expect(loadHubs().A.r).toBeUndefined();
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

// ── Which stops are worth anchoring on ──────────────────────────────────
//
// THE FIFTH DEFINITION, and the reader's own: "lagre alle stoppesteder som
// tjener fler enn én linje". It is also the one variant never tried. v1.81.0
// tried "more than one line" and marked everything, so the idea was written
// off — but it counted ALL lines, buses included, and every Oslo metro
// station has buses. Only v1.84.0 narrowed what is STORED to rail-bound
// lines, and by then the rule had moved on to comparing neighbours.
//
// Comparing neighbours finds JUNCTIONS, not interchanges. Reported with a
// screenshot: Borgen and Gjettum anchored while Majorstuen and
// Jernbanetorget did not, because inside a shared stretch nothing changes
// however many lines call there.
describe('anchorIds', () => {
  const st = (name) => ({ id: name, name });
  const LINE3 = [
    ['Bogerud', ['3']], ['Bøler', ['3']], ['Godlia', ['3']],
    ['Hellerud', ['2', '3']],
    ['Brynseng', ['2', '3']], ['Helsfyr', ['2', '3']],
    ['Tøyen', ['1', '2', '3', '4', '5']],
    ['Jernbanetorget', ['1', '2', '3', '4', '5']],
    ['Majorstuen', ['1', '2', '3', '4', '5']],
  ];
  const stops = LINE3.map(([n]) => st(n));
  const reg = (over = {}) => Object.fromEntries(LINE3.map(([n, r]) => [n,
    { v: 3, q: 2, m: over[n] || ['metro'], r }]));

  it('anchors every stop serving more than one line', () => {
    expect([...anchorIds(stops, reg())].sort()).toEqual(
      ['Brynseng', 'Hellerud', 'Helsfyr', 'Jernbanetorget', 'Majorstuen', 'Tøyen']);
  });

  // The two the screenshot named, in one assertion each.
  it('anchors Hellerud, the light one', () => {
    expect(anchorIds(stops, reg()).has('Hellerud')).toBe(true);
  });

  it('anchors Jernbanetorget and Majorstuen, which change-detection could not', () => {
    const ids = anchorIds(stops, reg());
    expect(ids.has('Jernbanetorget')).toBe(true);
    expect(ids.has('Majorstuen')).toBe(true);
  });

  it('leaves a one-line stop alone', () => {
    const ids = anchorIds(stops, reg());
    ['Bogerud', 'Bøler', 'Godlia'].forEach(n => expect(ids.has(n)).toBe(false));
  });

  // Buses are not in `r` at all (v1.84.0), so they cannot inflate the count —
  // which is exactly why v1.81.0's version of this rule marked everything.
  it('is not inflated by bus lines', () => {
    const hubs = reg();
    Object.keys(hubs).forEach(k => { hubs[k].m = ['metro', 'bus']; });
    expect([...anchorIds(stops, hubs)].sort()).toEqual(
      ['Brynseng', 'Hellerud', 'Helsfyr', 'Jernbanetorget', 'Majorstuen', 'Tøyen']);
  });

  it('anchors a stop where two rail-bound modes meet, on one line each', () => {
    const hubs = reg({ Godlia: ['metro', 'tram'] });
    expect(anchorIds(stops, hubs).has('Godlia')).toBe(true);
  });

  // Unknown is not the same fact as "one line".
  it('anchors nothing when the line field was never answered', () => {
    const noLines = Object.fromEntries(LINE3.map(([n]) => [n, { v: 3, q: 2, m: ['metro'] }]));
    expect(anchorIds(stops, noLines).size).toBe(0);
    expect(anchorIds(stops, {}).size).toBe(0);
    expect(anchorIds(stops, null).size).toBe(0);
  });

  it('survives an empty list', () => {
    expect(anchorIds([], reg()).size).toBe(0);
    expect(anchorIds(null, reg()).size).toBe(0);
  });

  // "We never asked" is not "we asked and there are no lines". A stop with no
  // line data is not an anchor on the strength of its modes alone — the modes
  // came from the same answer, and if that answer had no lines it cannot be
  // trusted to say two rail modes meet there.
  it('will not anchor on modes alone when the lines were never answered', () => {
    const hubs = { Bogerud: { v: 3, q: 2, m: ['metro', 'tram'] } };   // no r
    expect(anchorIds([st('Bogerud')], hubs).size).toBe(0);
  });

  // The order of the stops is no longer part of the rule at all, which is the
  // whole difference from the definition this replaces.
  it('gives the same answer whichever way the line is read', () => {
    const back = [...stops].reverse();
    expect([...anchorIds(back, reg())].sort()).toEqual([...anchorIds(stops, reg())].sort());
  });

  // v1.84.1 refused any answer marking more than 60% of a line. On a trunk
  // that is a TRUE fact, not a broken signal — measured: six of nine stops
  // here, and the whole set came back empty.
  it('does not throw away a line that really is mostly interchanges', () => {
    const busy = Object.fromEntries(LINE3.map(([n]) => [n,
      { v: 3, q: 2, m: ['metro'], r: ['1', '2'] }]));
    expect(anchorIds(stops, busy).size).toBe(stops.length);
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
    // Only the RAIL-BOUND line is kept as an id. The bus speaks through the
    // mode set instead, because bus numbers differ at every kerb.
    expect(e.r).toEqual(['RUT:Line:3']);
  });

  // Distinct line ids, so a line calling in both directions stays one line.
  it('counts a line once however many quays it calls at', async () => {
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [
      { id: 'q1', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] },
      { id: 'q2', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] },
    ] }]);
    await ensureHubs(['A']);
    expect(loadHubs().A.r).toEqual(['RUT:Line:3']);   // one line, however many quays
  });
});

describe('entries written by an older build', () => {
  // Without this the reader who has already used the app is exactly the one
  // who sees no improvement: their register is full of entries that will
  // never gain a line count.
  it('are asked again rather than trusted', async () => {
    // Written by v1.82.0: it HAS a version, just an older one. Without the
    // bump this entry would be trusted for ever and the reader who has
    // already used the app would see no change at all.
    localStorage.setItem('default::t.hubs',
      JSON.stringify({ A: { v: 2, q: 6, m: ['metro'], l: 4, ts: 1 } }));
    reply = ok([{ id: 'A', transportMode: 'metro', quays: [
      { id: 'q1', lines: [{ id: 'RUT:Line:1', transportMode: 'metro' }] },
      { id: 'q2', lines: [{ id: 'RUT:Line:2', transportMode: 'metro' }] },
    ] }]);
    await ensureHubs(['A']);
    expect(calls).toHaveLength(1);
    expect(loadHubs().A.v).toBe(HUB_V);
    expect(loadHubs().A.r).toEqual(['RUT:Line:1', 'RUT:Line:2']);
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
    // No line ids at all in this world, so nothing can be compared and no
    // stop anchors — which stopRuns reads as "show them all".
    expect(loadHubs().A.r).toBeUndefined();
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

// ── One threshold, and it is a definition ───────────────────────────────
describe('HUB_MIN_LINES', () => {
  it('is two, because that is what "more than one line" means', () => {
    expect(HUB_MIN_LINES).toBe(2);
  });

  it('leaves no share or median behind', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/api/hubs.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toContain('ANCHOR_SHARE');
    expect(src).not.toContain('ANCHOR_USELESS_ABOVE');
    expect(src).not.toContain('median');
  });
});

// ── Buses stay out of the count ─────────────────────────────────────────
//
// Reported after v1.81.0: "Nå er alle stopp definert som knutepunkter." That
// rule counted ALL lines, and every Oslo metro station has buses. Only the
// rail-bound lines are stored, which is what lets the same idea work now.
describe('rail-bound only', () => {
  const N = ['a', 'b', 'c', 'Hellerud'];
  const stops = N.map(n => ({ id: n, name: n }));

  it('does not let bus lines make a stop an interchange', async () => {
    reply = ok([{ id: 'a', transportMode: 'metro', quays: [{ id: 'q', lines: [
      { id: 'RUT:Line:3', transportMode: 'metro' },
      { id: 'RUT:Line:79', transportMode: 'bus' },
      { id: 'RUT:Line:70', transportMode: 'bus' },
    ] }] }]);
    await ensureHubs(['a']);
    expect(loadHubs().a.r).toEqual(['RUT:Line:3']);
    expect(anchorIds([stops[0]], loadHubs()).size).toBe(0);
  });

  it('still counts a tram or a train meeting the metro', () => {
    const hubs = { a: { v: 3, q: 2, r: ['3'], m: ['metro', 'rail'] } };
    expect(anchorIds([stops[0]], hubs).has('a')).toBe(true);
  });

  it('is not moved by buses appearing and disappearing', () => {
    const hubs = Object.fromEntries(N.map((n, i) => [n,
      { v: 3, q: 2, r: n === 'Hellerud' ? ['2', '3'] : ['3'],
        m: i % 2 ? ['metro'] : ['metro', 'bus'] }]));
    expect([...anchorIds(stops, hubs)]).toEqual(['Hellerud']);
  });
});

// ── The instrument has to be reachable ───────────────────────────────────
//
// The register only asks about stops it does not know, so once filled it
// never asked again — and _resetHubs was exported and called from NOWHERE in
// the app. The diagnostic line it writes could therefore be produced exactly
// once in the lifetime of an install, and by the time it mattered it had
// already happened. Four definitions of an interchange have been wrong; this
// line is what the fifth is meant to be set from.
describe('asking again', () => {
  const answer = (ids) => ok(ids.map(id => ({
    id, transportMode: 'metro',
    quays: [{ id: 'q', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] }],
  })));

  it('says nothing on a second visit, until the register is cleared', async () => {
    reply = answer(['NSR:StopPlace:6013']);
    await ensureHubs(['NSR:StopPlace:6013']);
    calls = [];
    await ensureHubs(['NSR:StopPlace:6013']);
    expect(calls).toHaveLength(0);

    _resetHubs();
    await ensureHubs(['NSR:StopPlace:6013']);
    expect(calls).toHaveLength(1);
  });

  // Line 3 has seventeen onward stops, and the cap of twelve cut off exactly
  // the ones the question is about — Jernbanetorget and Stortinget.
  it('reports every stop it asked about, not the first twelve', async () => {
    const ids = Array.from({ length: 17 }, (_, i) => 'NSR:StopPlace:' + i);
    reply = answer(ids);
    const { logMsg } = await import('../src/ui/log.js');
    logMsg.mockClear();
    await ensureHubs(ids);
    const line = logMsg.mock.calls.map(c => c[0]).find(m => String(m).startsWith('knutepunkt:'));
    ids.forEach(id => expect(line).toContain(id.replace('NSR:StopPlace:', '')));
  });

  // An id is not something a person can read back to me, and reading it back
  // is the entire purpose of the line.
  it('prints the stop name when it has one, and the id when it does not', async () => {
    reply = answer(['NSR:StopPlace:6013', 'NSR:StopPlace:9999']);
    const { logMsg } = await import('../src/ui/log.js');
    logMsg.mockClear();
    await ensureHubs(['NSR:StopPlace:6013', 'NSR:StopPlace:9999'],
      { 'NSR:StopPlace:6013': 'Hellerud' });
    const line = logMsg.mock.calls.map(c => c[0]).find(m => String(m).startsWith('knutepunkt:'));
    expect(line).toContain('Hellerud r=3');
    expect(line).toContain('9999 r=3');      // no name: the id, not blank
  });
});

// ── The register has to be readable from the store ───────────────────────
//
// The log line this replaces could not be read at all. logMsg keeps its
// entries, the departure board writes about five per poll every ten seconds,
// and the only opener for the debug panel is a dot in the BOARD header — so
// getting to the panel flushed the line on the way. Sent twice, absent twice.
// The register is stored; the panel should read the store.
describe('hubReport', () => {
  it('says so plainly when nothing has been learned yet', () => {
    expect(hubReport()).toContain('tomt');
  });

  it('prints one readable line per stop', async () => {
    reply = ok([
      { id: 'NSR:StopPlace:1', transportMode: 'metro',
        quays: [{ id: 'q', lines: [
          { id: 'RUT:Line:2', transportMode: 'metro' },
          { id: 'RUT:Line:3', transportMode: 'metro' },
          { id: 'RUT:Line:79', transportMode: 'bus' },
        ] }] },
      { id: 'NSR:StopPlace:2', transportMode: 'metro',
        quays: [{ id: 'q', lines: [{ id: 'RUT:Line:3', transportMode: 'metro' }] }] },
    ]);
    await ensureHubs(['NSR:StopPlace:1', 'NSR:StopPlace:2'],
      { 'NSR:StopPlace:1': 'Hellerud', 'NSR:StopPlace:2': 'Godlia' });
    const out = hubReport();
    expect(out).toMatch(/Hellerud\s+r=2,3\s+q=1\s+m=metro\+bus/);
    expect(out).toMatch(/Godlia\s+r=3\s+q=1\s+m=metro/);
    expect(out.split('\n')).toHaveLength(2);
  });

  // An id is not something anyone can report back, which is the whole point.
  it('falls back to the id when no name was recorded', async () => {
    reply = ok([{ id: 'NSR:StopPlace:6013', transportMode: 'metro', quays: [] }]);
    await ensureHubs(['NSR:StopPlace:6013']);
    expect(hubReport()).toContain('6013');
  });

  // "asked and told nothing" and "never asked" are different facts, and the
  // dump must not show them as the same.
  it('shows an unanswered stop as — rather than as no lines', async () => {
    reply = ok([]);
    await ensureHubs(['NSR:StopPlace:9'], { 'NSR:StopPlace:9': 'Ukjent' });
    expect(hubReport()).toMatch(/r=—/);
  });
});
