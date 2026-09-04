/**
 * Every profile-scoped key is in ALL_KEYS.
 *
 * ALL_KEYS drives two things: the one-time migration that moves pre-profile
 * data into 'default', and deleting a profile. A key missing from it is not
 * inert — it survives a profile deletion and leaks into the next reader.
 *
 * t.destPeek was noticed missing by hand. Enumerating found five more, which
 * is the point: a list maintained by remembering to update it will drift, and
 * had drifted for six keys across five files. This test is the guard, not the
 * fix.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function walk(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith('.js')) out.push(f);
  });
  return out;
}

const allKeys = () => {
  const src = fs.readFileSync('src/storage.js', 'utf8');
  const block = src.slice(src.indexOf('const ALL_KEYS'), src.indexOf(']', src.indexOf('const ALL_KEYS')));
  return new Set([...strip(block).matchAll(/'(t\.[A-Za-z0-9_]+)'/g)].map(m => m[1]));
};

describe('ALL_KEYS', () => {
  it('holds every t.* key the app actually stores', () => {
    const known = allKeys();
    const missing = new Map();
    walk('src').forEach(file => {
      // storage.js is where the list lives; it is not a consumer.
      if (file.endsWith('src/storage.js')) return;
      [...strip(fs.readFileSync(file, 'utf8')).matchAll(/'(t\.[A-Za-z0-9_]+)'/g)]
        .forEach(m => { if (!known.has(m[1])) missing.set(m[1], file); });
    });
    expect(Object.fromEntries(missing)).toEqual({});
  });

  // The six that were missing, named so a future edit that drops one fails
  // here rather than silently leaving a profile's data behind.
  it.each([
    ['t.destPeek'], ['t.freqArr'], ['t.freqDep'],
    ['t.homeLL'], ['t.palette'], ['t.walkDist'],
  ])('includes %s', (key) => {
    expect(allKeys().has(key)).toBe(true);
  });

  it('has no duplicates', () => {
    const src = fs.readFileSync('src/storage.js', 'utf8');
    const block = src.slice(src.indexOf('const ALL_KEYS'), src.indexOf(']', src.indexOf('const ALL_KEYS')));
    const listed = [...strip(block).matchAll(/'(t\.[A-Za-z0-9_]+)'/g)].map(m => m[1]);
    expect(listed.length).toBe(new Set(listed).size);
  });
});
