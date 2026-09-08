import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The heart of the report: "et mer realistisk estimat på gangavstand".
// walkInfo() has always PREFERRED a measured length — and never had one,
// because the module that stores it was written for a screen that has since
// been retired, and nothing else ever called it. This asserts the wiring
// exists, which is the one thing a unit test of walkDist.js cannot see.
describe('the measured walk is actually fed', () => {
  const srcFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) srcFiles.push(p);
    });
  })(path.resolve(__dirname, '../src'));

  it('has a caller for saveWalkDist outside its own module', () => {
    const callers = srcFiles.filter(f =>
      !f.endsWith(path.join('api', 'walkDist.js')) && /saveWalkDist/.test(fs.readFileSync(f, 'utf8')));
    expect(callers.length).toBeGreaterThan(0);
  });
});

// ── The router's request body ───────────────────────────────────────────────
//
// The weights are invisible in everything but the numbers, so the numbers are
// pinned. They are also the whole of what "safe" means here: a preference
// inside the router, never a promise about a street.
describe('fetchWalkRoute — what "safe" is asked for', () => {
  let body;
  beforeEach(() => {
    body = null;
    global.fetch = vi.fn((url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ trip: { legs: [{ shape: '_p~iF~ps|U' }] } }) });
    });
  });

  it('sends the pedestrian costing options', async () => {
    const { fetchWalkRoute, WALK_COSTING } = await import('../src/api/route.js');
    await fetchWalkRoute({ lat: 59.9, lon: 10.7 }, { lat: 59.91, lon: 10.71 });
    expect(body.costing).toBe('pedestrian');
    expect(body.costing_options.pedestrian).toEqual(WALK_COSTING);
  });

  it('prefers walkways and pavements, and penalises stairs and alleys', async () => {
    const { WALK_COSTING } = await import('../src/api/route.js');
    expect(WALK_COSTING.walkway_factor).toBeGreaterThan(1);
    expect(WALK_COSTING.sidewalk_factor).toBeGreaterThan(1);
    expect(WALK_COSTING.alley_factor).toBeLessThan(1);
    expect(WALK_COSTING.driveway_factor).toBeLessThan(1);
    expect(WALK_COSTING.step_penalty).toBeGreaterThan(0);
    expect(WALK_COSTING.use_ferry).toBe(0);
  });
});

// ── The ladder ─────────────────────────────────────────────────────────────
describe('approachRoute — three rungs, and only two of them measure', () => {
  const FROM = { lat: 59.9000, lon: 10.7000 };
  const TO = { lat: 59.9027, lon: 10.7000 };     // ~300 m north
  const CROW = 300;
  const ROUTE = [[59.9000, 10.7000], [59.9010, 10.7005], [59.9027, 10.7000]];

  const run = (opts) => {
    const saved = [];
    const save = vi.fn((f, t, pts) => { saved.push(pts); return 340; });
    return import('../src/api/walkApproach.js')
      .then(({ approachRoute }) => approachRoute(FROM, TO, CROW, { save, ...opts })
        .then(r => ({ ...r, saved, save })));
  };

  it('uses Valhalla when it answers, and keeps the length', async () => {
    const r = await run({ valhalla: () => Promise.resolve(ROUTE) });
    expect(r.src).toBe('valhalla');
    expect(r.latlngs).toEqual(ROUTE);
    expect(r.metres).toBe(340);
    expect(r.save).toHaveBeenCalledOnce();
  });

  it('falls to Entur when Valhalla is gone, and still keeps the length', async () => {
    const r = await run({ valhalla: () => Promise.resolve(null), entur: () => Promise.resolve(ROUTE) });
    expect(r.src).toBe('entur');
    expect(r.metres).toBe(340);
  });

  // The one that matters: a straight line is not a measurement, and letting
  // one into the cache would move someone's departure time on a number we
  // know to be wrong.
  it('draws the cord when both routers are gone, and stores nothing', async () => {
    const r = await run({ valhalla: () => Promise.resolve(null), entur: () => Promise.resolve(null) });
    expect(r.src).toBe('korde');
    expect(r.latlngs).toEqual([[FROM.lat, FROM.lon], [TO.lat, TO.lon]]);
    expect(r.metres).toBe(null);
    expect(r.save).not.toHaveBeenCalled();
  });

  it('treats a one-point answer as no answer', async () => {
    const r = await run({ valhalla: () => Promise.resolve([[59.9, 10.7]]), entur: () => Promise.resolve(null) });
    expect(r.src).toBe('korde');
  });

  it('lets the sanity band reject an implausible route', async () => {
    const { approachRoute } = await import('../src/api/walkApproach.js');
    const r = await approachRoute(FROM, TO, CROW, {
      valhalla: () => Promise.resolve(ROUTE),
      save: () => null,          // what saveWalkDist does outside the band
    });
    expect(r.metres).toBe(null);
    expect(r.src).toBe('valhalla');   // still drawn; just not believed
  });
});
