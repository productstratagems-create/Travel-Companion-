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

const { loadHubs, saveHubs, ensureHubs, anchorIds, hubReport, HUB_V,
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

// ── Which stops along a direction are worth anchoring on ─────────────────
//
// THE THIRD DEFINITION. v1.81.0 used an absolute line count and every stop
// became an anchor. v1.82.0 made it relative to the line — which measured
// POPULARITY rather than interchange, and the reader found the hole at once:
// "Hellerud, som tjener to ulike t-banelinjer, faller utenfor."
//
// Measured against that build, on line 3 westbound:
//   scores  1 1 1 1 1 1 1 2 2 4 4 5 5 5 5 5 5   median 2, cap 6 of 17
//   kept    Tøyen Grønland Jernbanetorget Stortinget Nationaltheatret Majorstuen
//   dropped Hellerud (2) — and Helsfyr (4), above the median, because the cap
//           was already full of the six tunnel stops
//
// A stop is an anchor when its rail-bound line set, or its mode set, differs
// from the stop BEFORE it. That is what a junction is.
describe('anchorIds', () => {
  const st = (name) => ({ id: name, name });
  // Mortensrud → Kolsås. Line 2 joins at Hellerud; 1, 4 and 5 join at Tøyen.
  const LINE3 = [
    ['Bogerud', ['3']], ['Bøler', ['3']], ['Godlia', ['3']],
    ['Hellerud', ['2', '3']],                 // ← the junction the reader named
    ['Brynseng', ['2', '3']], ['Helsfyr', ['2', '3']],
    ['Tøyen', ['1', '2', '3', '4', '5']],
    ['Grønland', ['1', '2', '3', '4', '5']],
    ['Jernbanetorget', ['1', '2', '3', '4', '5']],
  ];
  const stops = LINE3.map(([n]) => st(n));
  const reg = (over = {}) => Object.fromEntries(LINE3.map(([n, r]) => [n,
    { v: 3, q: 2, m: over[n] || ['metro'], r }]));

  it('anchors the stop where a line joins', () => {
    const ids = anchorIds(stops, reg());
    expect(ids.has('Hellerud')).toBe(true);
    expect(ids.has('Godlia')).toBe(false);
    expect(ids.has('Bogerud')).toBe(false);
  });

  // The shared tunnel is ONE stretch, not six anchors. Only where the lines
  // arrived is a change.
  it('does not anchor a stretch where nothing changes', () => {
    const ids = anchorIds(stops, reg());
    expect(ids.has('Tøyen')).toBe(true);
    expect(ids.has('Grønland')).toBe(false);
    expect(ids.has('Jernbanetorget')).toBe(false);
  });

  it('marks a handful, not everything', () => {
    expect([...anchorIds(stops, reg())].sort()).toEqual(['Hellerud', 'Tøyen']);
  });

  // ── The reader's own call about buses ───────────────────────────────────
  //
  // Every kerb has different bus routes, so a bus number changing between
  // neighbours is not a junction — it is a different kerb. Buses speak on the
  // mode dimension instead.
  it('is not moved by bus lines coming and going', () => {
    const hubs = reg();
    // Different buses at every stop, same rails: still no new anchors.
    Object.keys(hubs).forEach((k, i) => { hubs[k].m = ['metro', 'bus']; });
    expect([...anchorIds(stops, hubs)].sort()).toEqual(['Hellerud', 'Tøyen']);
  });

  // This test used to assert the opposite, and that assertion WAS the bug:
  // buses call at some stops and not the next, so letting their presence
  // count made almost every stop an anchor. Reported as "nå er alle stopp
  // definert som knutepunkter".
  it('is not moved when buses stop meeting the metro', () => {
    const hubs = reg({ Bogerud: ['metro', 'bus'], Bøler: ['metro', 'bus'] });
    expect(anchorIds(stops, hubs).has('Godlia')).toBe(false);
  });

  it('is moved when something RAIL-BOUND meets the metro', () => {
    const hubs = reg({ Godlia: ['metro', 'tram'] });
    expect(anchorIds(stops, hubs).has('Godlia')).toBe(true);
  });

  // ── The two failure modes, which both land on today's list ──────────────
  it('anchors nothing when the line field was never answered', () => {
    const noLines = Object.fromEntries(LINE3.map(([n]) => [n, { v: 3, q: 2, m: ['metro'] }]));
    expect(anchorIds(stops, noLines).size).toBe(0);
    expect(anchorIds(stops, {}).size).toBe(0);
    expect(anchorIds(stops, null).size).toBe(0);
  });

  // Unknown is not the same fact as "no lines here", and must not read as a
  // change on the stop after it.
  it('treats a gap in the register as unknown, not as a change', () => {
    const hubs = reg();
    delete hubs.Godlia;
    const ids = anchorIds(stops, hubs);
    expect(ids.has('Hellerud')).toBe(false);   // nothing to compare against
    expect(ids.has('Tøyen')).toBe(true);       // and the rest still works
  });

  it('survives an empty list', () => {
    expect(anchorIds([], reg()).size).toBe(0);
    expect(anchorIds(null, reg()).size).toBe(0);
  });

  // Same SIZE, different lines — a line leaves and another joins at the same
  // stop. Comparing counts would miss it entirely, which is the mistake the
  // two previous definitions were built on.
  it('sees a swap, not just a change of size', () => {
    const swap = [st('a'), st('b'), st('c')];
    const hubs = {
      a: { v: 3, q: 2, m: ['metro'], r: ['1', '2'] },
      b: { v: 3, q: 2, m: ['metro'], r: ['2', '3'] },
      c: { v: 3, q: 2, m: ['metro'], r: ['2', '3'] },
    };
    expect([...anchorIds(swap, hubs)]).toEqual(['b']);
  });

  // An entry with no line data at all is UNKNOWN. Reading it as "no lines
  // here" would invent a change at it and another at the stop after it.
  it('does not invent a change around a stop it knows nothing about', () => {
    const hubs = reg();
    delete hubs.Godlia.r;              // entry exists, line data does not
    const ids = anchorIds(stops, hubs);
    expect(ids.has('Godlia')).toBe(false);
    expect(ids.has('Hellerud')).toBe(false);   // nothing to compare against
    expect(ids.has('Tøyen')).toBe(true);       // and the rest still works
  });

  // Order is the whole rule, so the same stops the other way round must
  // anchor where the lines change from THAT direction.
  it('reads the sequence in travel order', () => {
    const back = [...stops].reverse();
    const ids = anchorIds(back, reg());
    expect(ids.has('Helsfyr')).toBe(true);   // 1,4,5 leave here going east
    expect(ids.has('Godlia')).toBe(true);    // 2 leaves here
    expect(ids.has('Bogerud')).toBe(false);
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

// ── There is no cap and no threshold any more ────────────────────────────
//
// v1.82.0 had both, and they were what dropped Helsfyr: it scored above the
// median, but the cap was already full of the six tunnel stops. A rule about
// where lines CHANGE needs neither, and both are gone rather than tuned.
describe('no thresholds left', () => {
  it('keeps every junction on a line that really has several', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, name: 's' + i }));
    // Junctions at five stops out of twenty — under the uselessness valve,
    // so every one of them is kept. There is no selection and no ranking:
    // the rule either recognises a change or it does not.
    const hubs = Object.fromEntries(many.map((s, i) => [s.id,
      { v: 3, q: 2, m: ['metro'], r: ['3', ...(i >= 4 ? ['A'] : []), ...(i >= 8 ? ['B'] : []),
        ...(i >= 12 ? ['C'] : []), ...(i >= 16 ? ['D'] : [])] }]));
    expect([...anchorIds(many, hubs)].sort()).toEqual(['s12', 's16', 's4', 's8']);
  });

  it('has no share or median left in the source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/api/hubs.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toContain('ANCHOR_SHARE');
    expect(src).not.toContain('median');
    expect(src).not.toContain('hubScore');
  });
});

// ── Buses must not sneak back in through the modes ────────────────────────
//
// Reported after v1.84.0: "Nå er alle stopp definert som knutepunkter."
//
// Bus LINES were excluded because every kerb has different bus routes — and
// then let straight back in through the MODE dimension, three lines apart in
// the same file. Buses call at some stops and not the next, so the mode set
// flickered between {metro,bus} and {metro} and the rule fired almost
// everywhere. Measured against that build, on a line with buses at every
// other stop: SEVEN of eight stops became anchors.
describe('rail-bound in both dimensions', () => {
  const N = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'Hellerud'];
  const stops = N.map(n => ({ id: n, name: n }));
  const flickering = Object.fromEntries(N.map((n, i) => [n, {
    v: 3, q: 2,
    r: n === 'Hellerud' ? ['2', '3'] : ['3'],
    m: i % 2 ? ['metro'] : ['metro', 'bus'],
  }]));

  it('is not moved by buses appearing and disappearing', () => {
    expect([...anchorIds(stops, flickering)]).toEqual(['Hellerud']);
  });

  // The case the mode test exists for, and which must survive: something
  // rail-bound meeting the metro.
  it('still anchors where a train or a tram meets the metro', () => {
    const hubs = Object.fromEntries(N.map(n => [n,
      { v: 3, q: 2, r: ['3'], m: ['metro', 'bus'] }]));
    hubs.e = { v: 3, q: 2, r: ['3'], m: ['metro', 'rail'] };
    const ids = anchorIds(stops, hubs);
    expect(ids.has('e')).toBe(true);
    expect(ids.has('f')).toBe(true);     // and where it leaves again
    expect(ids.has('b')).toBe(false);
  });
});

// ── The instrument has to work, or the next round is another guess ────────
//
// v1.84.0 renamed the stored fact from `l` to `r` and left the debug line
// printing `l`, so the one thing built to end the guessing showed l=0 for
// every stop. Three definitions have now been wrong; the log is how the
// fourth stops being a guess.
describe('what the register reports', () => {
  it('prints the line ids it actually stored', async () => {
    reply = ok([{ id: 'NSR:StopPlace:6013', transportMode: 'metro', quays: [
      { id: 'q1', lines: [
        { id: 'RUT:Line:2', transportMode: 'metro' },
        { id: 'RUT:Line:3', transportMode: 'metro' },
        { id: 'RUT:Line:79', transportMode: 'bus' },
      ] },
    ] }]);
    const { logMsg } = await import('../src/ui/log.js');
    logMsg.mockClear();
    await ensureHubs(['NSR:StopPlace:6013']);
    const line = logMsg.mock.calls.map(c => c[0]).find(m => m.startsWith('knutepunkt:'));
    expect(line).toContain('6013');
    expect(line).toContain('r=2,3');          // the rail lines, prefix stripped
    expect(line).not.toContain('r=-');
    expect(line).toContain('m=metro+bus');    // the bus is still reported
  });
});

// ── Insurance, after three wrong definitions ─────────────────────────────
//
// NOT the cap v1.82.0 had. That one SELECTED anchors — keep the best 40% —
// and it is what dropped Helsfyr. This one selects nothing: it refuses an
// answer that has clearly learned nothing, and marking nothing means every
// stop is shown, which is the list as it was.
describe('a signal that fires everywhere is no signal', () => {
  const N = Array.from({ length: 10 }, (_, i) => 's' + i);
  const stops = N.map(n => ({ id: n, name: n }));

  it('offers no anchors when almost every stop qualifies', () => {
    const everyStopDiffers = Object.fromEntries(N.map((n, i) => [n,
      { v: 3, q: 2, m: ['metro'], r: ['L' + i] }]));
    expect(anchorIds(stops, everyStopDiffers).size).toBe(0);
  });

  it('still answers when the change is rare, which is the point', () => {
    const twoJunctions = Object.fromEntries(N.map((n, i) => [n,
      { v: 3, q: 2, m: ['metro'], r: i < 4 ? ['3'] : (i < 8 ? ['2', '3'] : ['3']) }]));
    expect([...anchorIds(stops, twoJunctions)].sort()).toEqual(['s4', 's8']);
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
