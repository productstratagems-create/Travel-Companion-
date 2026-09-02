import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// ── Every helper the tracking screen calls has to exist ────────────────────
//
// `_destAlertsHtml()` was called from three places in track.js and defined
// nowhere. Every render of the tracking screen threw a ReferenceError, which
// took out the destination disruptions, the arrival card and the arrived card
// with it — silently, because a throw inside a render loop just stops that
// tick. It shipped, and survived 749 tests, because nothing ever rendered
// that screen outside a browser.
//
// The convention this leans on is real and consistent: file-local helpers in
// this codebase are `_`-prefixed, and imports are not. So a `_name(` that is
// neither declared here nor imported here is a call into nothing.
const FILES = ['src/views/track.js', 'src/views/selected.js', 'src/views/board.js', 'src/views/auto.js'];

describe('local helpers are defined where they are called', () => {
  FILES.forEach(f => {
    it(f + ' calls no helper it does not have', () => {
      // Comments stripped first. A previous version of this test read the
      // prose that documents the rule and reported the example in it as a
      // missing helper — the same trap as asserting on a comment that says
      // what the code does NOT do.
      const src = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
      const declared = new Set();
      // function _x(  |  const _x = (  |  let _x =  |  import { _x }
      for (const m of src.matchAll(/\bfunction\s+(_\w+)/g)) declared.add(m[1]);
      for (const m of src.matchAll(/\b(?:const|let|var)\s+(_\w+)\s*=/g)) declared.add(m[1]);
      for (const m of src.matchAll(/import\s*\{([^}]*)\}/g)) {
        m[1].split(',').forEach(n => {
          const id = n.split(' as ').pop().trim();
          if (id) declared.add(id);
        });
      }
      const missing = new Set();
      for (const m of src.matchAll(/(?<![.\w$])(_\w+)\s*\(/g)) {
        if (!declared.has(m[1])) missing.add(m[1]);
      }
      expect([...missing]).toEqual([]);
    });
  });
});
