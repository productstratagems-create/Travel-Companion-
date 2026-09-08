import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import { autoJumpDest, destRanking, JUMP_RATIO, recordSmartTrip } from '../src/api/smart.js';
import { findJumpTarget } from '../src/views/auto.js';
import { storage } from '../src/storage.js';

const NOW = Date.UTC(2026, 8, 8, 7, 41, 0);           // a Tuesday morning
const bucket = (ms) => Math.floor(new Date(ms).getHours() / 2);

const hist = (rows) => storage.set('t.smartHist', JSON.stringify(rows.map(r => ({
  key: r.to.toLowerCase() + '|' + bucket(NOW) + '|wd',
  fromName: 'Mortensrud', toName: r.to, toStopId: r.id || null,
  toLat: null, toLon: null, fromStopId: null,
  bucket: r.bucket == null ? bucket(NOW) : r.bucket,
  isWeekend: false, count: r.n, lastUsed: NOW,
}))));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

// ── The threshold ──────────────────────────────────────────────────────────
describe('autoJumpDest — the app only moves you when it is sure', () => {
  it('jumps to a clear favourite', () => {
    hist([{ to: 'Jernbanetorget', n: 12, id: 'NSR:StopPlace:6' }, { to: 'Hellerud', n: 2 }]);
    expect(autoJumpDest(NOW).toName).toBe('Jernbanetorget');
  });

  // The reported screen: two shortcuts, Jernbanetorget and Hellerud. If they
  // are close, a jump is as likely wrong as right — so the list stands.
  it('stays put when the two are close', () => {
    hist([{ to: 'Jernbanetorget', n: 6 }, { to: 'Hellerud', n: 5 }]);
    expect(autoJumpDest(NOW)).toBe(null);
  });

  it('needs to be JUMP_RATIO ahead, exactly', () => {
    hist([{ to: 'Jernbanetorget', n: 2 * JUMP_RATIO }, { to: 'Hellerud', n: 2 }]);
    expect(autoJumpDest(NOW).toName).toBe('Jernbanetorget');
    hist([{ to: 'Jernbanetorget', n: 2 * JUMP_RATIO - 1 }, { to: 'Hellerud', n: 2 }]);
    expect(autoJumpDest(NOW)).toBe(null);
  });

  it('jumps with only one destination in history', () => {
    hist([{ to: 'Jernbanetorget', n: 3 }]);
    expect(autoJumpDest(NOW).toName).toBe('Jernbanetorget');
  });

  it('never jumps on the freqArr fallback — no history, no move', () => {
    storage.set('t.freqArr', JSON.stringify([{ name: 'Jernbanetorget', stopId: 'x', count: 9 }]));
    expect(autoJumpDest(NOW)).toBe(null);
  });

  it('does not move on nothing at all', () => {
    expect(autoJumpDest(NOW)).toBe(null);
  });

  // The history is keyed by destination AND time bucket, so one place spreads
  // over several rows. Counting them separately would turn a dead heat into a
  // landslide — Jernbanetorget beating Jernbanetorget.
  it('counts a destination once, however many buckets it spans', () => {
    hist([
      { to: 'Jernbanetorget', n: 5, bucket: bucket(NOW) },
      { to: 'Jernbanetorget', n: 5, bucket: bucket(NOW) + 1 },
      { to: 'Hellerud', n: 5 },
    ]);
    expect(destRanking(NOW).map(d => d.toName)).toEqual(['Jernbanetorget', 'Hellerud']);
    expect(autoJumpDest(NOW)).toBe(null);
  });
});

// ── The target has to be reachable from here ───────────────────────────────
describe('findJumpTarget — only where this stop actually goes', () => {
  const call = (front, names, mins) => ({
    destinationDisplay: { frontText: front },
    serviceJourney: { estimatedCalls: [
      { quay: { stopPlace: { name: 'Mortensrud', id: 'NSR:StopPlace:1' } } },
      ...names.map((n, i) => ({
        quay: { stopPlace: { name: n.name, id: n.id, latitude: 59.9, longitude: 10.7 } },
        expectedArrivalTime: new Date(NOW + (mins + i) * 60000).toISOString(),
      })),
    ] },
  });
  const dir = (front, names, nextMs, mins) => ({ frontText: front, nextMs, call: call(front, names, mins) });

  const JBT = { name: 'Jernbanetorget', id: 'NSR:StopPlace:6' };
  const HEL = { name: 'Hellerud', id: 'NSR:StopPlace:7' };

  it('finds the stop by id', () => {
    const dirs = [dir('Kolsås', [HEL, JBT], NOW + 7 * 60000, 5)];
    const hit = findJumpTarget(dirs, { toName: 'noe annet', toStopId: JBT.id }, 'Mortensrud', NOW);
    expect(hit.stop.name).toBe('Jernbanetorget');
  });

  it('falls back to the name when the saved route carried no id', () => {
    const dirs = [dir('Kolsås', [HEL, JBT], NOW + 7 * 60000, 5)];
    const hit = findJumpTarget(dirs, { toName: 'Jernbanetorget', toStopId: null }, 'Mortensrud', NOW);
    expect(hit.stop.id).toBe(JBT.id);
  });

  it('returns null when the destination is not on any line from here', () => {
    const dirs = [dir('Kolsås', [HEL], NOW + 7 * 60000, 5)];
    expect(findJumpTarget(dirs, { toName: 'Jernbanetorget' }, 'Mortensrud', NOW)).toBe(null);
  });

  it('takes the direction that leaves first', () => {
    const dirs = [
      dir('Stortinget', [JBT], NOW + 13 * 60000, 11),
      dir('Kolsås', [JBT], NOW + 7 * 60000, 5),
    ];
    const hit = findJumpTarget(dirs, { toName: 'Jernbanetorget' }, 'Mortensrud', NOW);
    expect(hit.dir.frontText).toBe('Kolsås');
  });

  it('never offers a stop behind you', () => {
    const dirs = [dir('Kolsås', [JBT], NOW + 7 * 60000, 5)];
    expect(findJumpTarget(dirs, { toName: 'Mortensrud' }, 'Mortensrud', NOW)).toBe(null);
  });

  it('copes with no guess and no directions', () => {
    expect(findJumpTarget([], { toName: 'X' }, 'Mortensrud', NOW)).toBe(null);
    expect(findJumpTarget([dir('K', [JBT], NOW, 5)], null, 'Mortensrud', NOW)).toBe(null);
  });
});

// ── The wiring ─────────────────────────────────────────────────────────────
//
// The unit tests above cover the pieces. Neither can see whether the SCREEN
// uses them correctly — and the screen redraws every second, which is where
// this kind of thing goes wrong (v1.90.0 shipped a mutant that survived for
// exactly this reason).
describe('the jump is armed by opening the app, not by the screen', () => {
  it('is off until something arms it, and reset takes it away again', async () => {
    const { armAutoJump, _isJumpArmed, resetAuto } = await import('../src/views/auto.js');
    resetAuto();
    expect(_isJumpArmed()).toBe(false);
    armAutoJump();
    expect(_isJumpArmed()).toBe(true);
    // navTo('v-auto') resets on entry — so tapping ⚡ can never inherit an
    // arming left over from startup, and the direction list stays reachable.
    resetAuto();
    expect(_isJumpArmed()).toBe(false);
  });

  it('is armed on the landing branch and nowhere else', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
    expect(main).toMatch(/armAutoJump\(\)/);
    const nav = fs.readFileSync(path.resolve(__dirname, '../src/ui/nav.js'), 'utf8');
    expect(nav).not.toMatch(/armAutoJump/);
  });
});

describe('the app’s own guess is not the reader’s choice', () => {
  it('passes chosen:false through _useRouteDir', async () => {
    const calls = [];
    vi.doMock('../src/views/settings.js', () => ({
      setActiveRoute: (dir, opts) => calls.push(opts),
      syncRouteFields: vi.fn(),
    }));
    vi.doMock('../src/ui/nav.js', () => ({ updateHeader: vi.fn(), show: vi.fn(), navTo: vi.fn() }));
    vi.resetModules();
    await import('../src/views/favs.js');
    document.body.innerHTML = '<div id="auto-toast"><strong class="auto-toast-dest"></strong></div>';
    const dir = { key: 'custom-out', from: 'Mortensrud', to: 'Jernbanetorget' };
    window._useRouteDir(dir, null, { chosen: false });
    window._useRouteDir(dir, null);
    expect(calls.map(c => c.chosen)).toEqual([false, true]);
    vi.doUnmock('../src/views/settings.js');
    vi.doUnmock('../src/ui/nav.js');
  });
});
