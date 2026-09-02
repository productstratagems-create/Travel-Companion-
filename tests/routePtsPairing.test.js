import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// ── The corridor and its cache key belong together ─────────────────────────
//
// Reported: "noen ganger forsvinner lista med avganger på tavla, og jeg må
// reversere ruta og re-reversere for å få opp listen igjen. Refresh-knappen
// løser ikke problemet."
//
// `_bRoutePts` (the drawn corridor) and `_bRoutePtsKey` (which corridor it is)
// were assigned in different places. The key was written only where the
// corridor was rebuilt; the points were ALSO cleared at four early returns —
// when there was nothing to draw — which left the key pointing at a corridor
// that no longer existed.
//
// Come back to the SAME route and the key still matched, so the rebuild was
// skipped as unnecessary and `_bRoutePts.length` read null. That threw inside
// renderBoard before the departure list was written, so the list froze. ↻ goes
// through startBoard, which never touches either variable — reversing the
// route changes the key, and that was the only thing that ever healed it.
//
// Reproduced end to end: turn the only running mode off and on again, and the
// list stayed empty and refused to come back.
describe('_bRoutePts and _bRoutePtsKey', () => {
  const code = fs.readFileSync('src/views/board.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

  it('are only ever assigned together, through one setter', () => {
    // The declarations and the setter's own two lines are the only writes.
    const writes = [...code.matchAll(/(_bRoutePts|_bRoutePtsKey)\s*=(?!=)/g)].map(m => m[1]);
    // let _bRoutePts = null; let _bRoutePtsKey = null; and the two inside
    // _setRoutePts — four in total, and nothing else may assign them.
    expect(writes.length).toBe(4);
  });

  it('has a setter that writes both', () => {
    const fn = code.slice(code.indexOf('function _setRoutePts'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('_bRoutePts =');
    expect(body).toContain('_bRoutePtsKey =');
  });

  // Every early return that stops drawing has to go through the setter, or
  // the pair drifts apart again exactly where it did the first time.
  it('clears the pair wherever it stops drawing', () => {
    const clears = (code.match(/_setRoutePts\(null, null\)/g) || []).length;
    expect(clears).toBeGreaterThanOrEqual(4);
  });
});
