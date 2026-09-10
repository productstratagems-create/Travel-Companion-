import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { transferMargin, PLATFORM_CHANGE_MINS, arrRows } from '../src/views/track.js';
import { reachCls } from '../src/geo.js';

const MIN = 60000;
const ARR = Date.UTC(2026, 8, 10, 8, 43, 0);      // when the reader gets there
const dep = (m) => ARR + m * MIN;

// The reported screen: arriving at Jernbanetorget with the onward list
// offering a departure marked «NÅ». It leaves now — while the reader is still
// on the train. The list counted from Date.now(), not from arrival.
describe('transferMargin — measured from when you get there', () => {
  it('gives a departure at the moment of arrival a negative margin', () => {
    expect(transferMargin(dep(0), ARR, false, 0)).toBeLessThan(0);
  });

  it('costs nothing but your own margin on the same platform', () => {
    expect(transferMargin(dep(5), ARR, true, 0)).toBe(5);
    expect(transferMargin(dep(5), ARR, true, 2)).toBe(3);
  });

  // The floor exists so that «ekstra tid: 0 min» still does not promise a
  // change of platform in no time at all.
  it('charges the platform floor even when you asked for no extra time', () => {
    expect(transferMargin(dep(5), ARR, false, 0)).toBe(5 - PLATFORM_CHANGE_MINS);
    expect(PLATFORM_CHANGE_MINS).toBeGreaterThan(0);
  });

  it('adds your «ekstra tid» on top of the floor', () => {
    expect(transferMargin(dep(10), ARR, false, 5)).toBe(10 - PLATFORM_CHANGE_MINS - 5);
  });

  it('is the same arithmetic whatever the clock says now', () => {
    // No Date.now() anywhere in it: the answer depends on arrival, not on when
    // the screen happened to redraw.
    expect(transferMargin(dep(7), ARR, true, 0)).toBe(7);
  });

  it('copes with no extra time given', () => {
    expect(transferMargin(dep(7), ARR, true)).toBe(7);
    expect(transferMargin(dep(7), ARR, true, null)).toBe(7);
  });
});

// reachCls already carries these four states on the departure board; the
// onward rows get the same ones rather than a second vocabulary.
describe('what the row says about a margin', () => {
  it('marks a departure you cannot make', () => {
    expect(reachCls(transferMargin(dep(2), ARR, false, 0))).toBe('missed');
  });

  it('does not mark one you can', () => {
    expect(reachCls(transferMargin(dep(12), ARR, false, 0))).not.toBe('missed');
  });

  // The same departure, from the platform you are already on.
  it('can be catchable from the same platform and not from another', () => {
    expect(reachCls(transferMargin(dep(2), ARR, true, 0))).not.toBe('missed');
    expect(reachCls(transferMargin(dep(2), ARR, false, 0))).toBe('missed');
  });
});

// The unit tests above prove the arithmetic. They cannot prove the RENDERER
// feeds it the arrival time — a mutant that put Date.now() back passed all of
// them. This is the seam where the basis itself is checked.
describe('arrRows — the hand-off', () => {
  const row = (mins, quay) => ({ depTs: dep(mins), quay, ln: { publicCode: '3' }, dest: 'X' });

  it('counts from the arrival it is given, not from any clock', () => {
    const out = arrRows([row(10, '2')], ARR, 0, '1');
    expect(out[0].mins).toBe(10);
    // Move arrival five minutes later and the same departure is five nearer.
    expect(arrRows([row(10, '2')], ARR + 5 * MIN, 0, '1')[0].mins).toBe(5);
  });

  it('marks what cannot be caught and keeps it in the list', () => {
    const out = arrRows([row(1, '2'), row(30, '2')], ARR, 0, '1');
    expect(out).toHaveLength(2);              // nothing is dropped
    expect(out[0].rcls).toBe('missed');
    expect(out[1].rcls).not.toBe('missed');
  });

  it('knows the platform you arrive on', () => {
    expect(arrRows([row(2, '1')], ARR, 0, '1')[0].sameQuay).toBe(true);
    expect(arrRows([row(2, '2')], ARR, 0, '1')[0].sameQuay).toBe(false);
    // …and without one, nothing is assumed to be the same platform.
    expect(arrRows([row(2, '1')], ARR, 0, null)[0].sameQuay).toBe(false);
  });

  it('passes the reader’s «ekstra tid» through', () => {
    expect(arrRows([row(10, '1')], ARR, 0, '1')[0].margin).toBe(10);
    expect(arrRows([row(10, '1')], ARR, 5, '1')[0].margin).toBe(5);
  });

  // Nine rows inside the horizon must yield eight, not eight-minus-the-far-ones.
  it('gives a full list when a far departure sits among the near ones', () => {
    const board = [row(1), row(2), row(3), row(200), row(4), row(5), row(6), row(7), row(8), row(9)];
    const out = arrRows(board, ARR, 0, null);
    expect(out).toHaveLength(8);
    expect(out.some(r => r.mins === 200)).toBe(false);
  });

  it('copes with no board at all', () => {
    expect(arrRows(null, ARR, 0, null)).toEqual([]);
    expect(arrRows([], ARR, 0, null)).toEqual([]);
  });
});

describe('the defect found on the way', () => {

  it('persists the arrival platform, so the rule survives a reload', () => {
    const jny = fs.readFileSync(path.resolve(__dirname, '../src/journey.js'), 'utf8');
    const save = jny.slice(jny.indexOf('function saveJny'));
    expect(save.slice(0, 1200)).toMatch(/arrQuay/);
  });
});

// ── the one line the report was about ──────────────────────────────────────
//
// arrRows takes the arrival time as an argument, so a renderer that passed
// Date.now() instead still satisfied every test above — a mutant proved it
// twice. This drives the renderer itself.
describe('_renderArrBoardHtml reads the journey, not the clock', () => {
  const load = async (jny) => {
    vi.resetModules();
    vi.doMock('../src/state.js', () => ({
      state: { jny, statLL: {}, dIdx: 0, walkOvr: null, homeLL: null, walkFromLL: null },
      intervals: { board: null, track: null, sel: null },
    }));
    const m = await import('../src/views/track.js');
    return m;
  };
  const row = (msFromNow, quay) => ({
    depTs: Date.now() + msFromNow, quay, ln: { publicCode: '3' }, dest: 'Kolsås',
  });

  it('shows minutes from ARRIVAL, not from now', async () => {
    // Arriving in 8 minutes; a departure 10 minutes out is 2 minutes away
    // from where the reader will be standing.
    const arrival = { time: new Date(Date.now() + 8 * MIN).toISOString() };
    const m = await load({ arrival, arrQuay: '1' });
    m._setArrBoard([row(10 * MIN, '1')]);
    const html = m._renderArrBoardHtml();
    expect(html).toContain('>2<span>min</span>');
    expect(html).not.toContain('>10<span>min</span>');
  });

  // Arriving in 8 minutes, departure in 12: four minutes of slack. From
  // ANOTHER platform that is 3 (floor) + 2 (default «ekstra tid») = 5, so it
  // cannot be made; from the platform you are already on, it can.
  it('marks a departure that goes before the reader gets there', async () => {
    const arrival = { time: new Date(Date.now() + 8 * MIN).toISOString() };
    const m = await load({ arrival, arrQuay: '1' });
    m._setArrBoard([row(12 * MIN, '2')]);
    const html = m._renderArrBoardHtml();
    expect(html).toContain('missed');
    expect(html).toContain('går før du er framme');
  });

  it('uses the arrival platform, so the same departure can be catchable', async () => {
    const arrival = { time: new Date(Date.now() + 8 * MIN).toISOString() };
    const m = await load({ arrival, arrQuay: '2' });
    m._setArrBoard([row(12 * MIN, '2')]);
    expect(m._renderArrBoardHtml()).not.toContain('missed');
  });

  // Without a journey there is no arrival, and the screen is what it was.
  it('falls back to now when no journey is under way', async () => {
    const m = await load(null);
    m._setArrBoard([row(10 * MIN, '1')]);
    expect(m._renderArrBoardHtml()).toContain('>10<span>min</span>');
  });
});

// ── curating, not just marking ─────────────────────────────────────────────
//
// Seen on the rendered screen: arriving in six minutes at Jernbanetorget, the
// next eight departures had all gone. The list is capped at eight, so the
// reader would have been shown eight grey rows and nothing catchable at all.
describe('arrRows keeps the list useful', () => {
  const row = (mins, quay) => ({ depTs: dep(mins), quay, ln: { publicCode: '3' }, dest: 'X' });

  it('does not spend the whole list on departures you have missed', () => {
    const board = [
      row(0), row(0), row(1), row(2), row(3), row(4), row(5), row(6),   // all gone
      row(20), row(25), row(30),                                        // catchable
    ];
    const out = arrRows(board, ARR, 0, null);
    const missed = out.filter(r => r.rcls === 'missed');
    expect(missed.length).toBeLessThanOrEqual(2);
    expect(out.some(r => r.rcls !== 'missed')).toBe(true);
  });

  // Context, not amnesia: the one you just missed says the next is right
  // behind it.
  it('keeps the ones you only just missed, not the oldest', () => {
    const board = [row(0), row(1), row(2), row(20)];
    const out = arrRows(board, ARR, 0, null);
    const missedMins = out.filter(r => r.rcls === 'missed').map(r => r.mins);
    expect(missedMins).toEqual([1, 2]);        // the last two, not the first
  });

  it('leaves the order alone', () => {
    const out = arrRows([row(2), row(20), row(25)], ARR, 0, null);
    expect(out.map(r => r.mins)).toEqual([2, 20, 25]);
  });

  it('still shows everything when nothing was missed', () => {
    const out = arrRows([row(20), row(25), row(30)], ARR, 0, null);
    expect(out).toHaveLength(3);
  });
});
