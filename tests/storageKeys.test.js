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

/* ── EN APP SOM IKKE STARTER ────────────────────────────────────────────
 *
 * `migrate()` kjører på MODULNIVÅ og kalte `localStorage` direkte. `storage`
 * lenger nede i samme fil pakker hvert eneste oppslag i try/catch — den som
 * skrev den visste at `localStorage` kan KASTE, ikke bare gi null — men
 * migreringen sto ubeskyttet.
 *
 * I Safaris private modus, med informasjonskapsler avslått, eller i en
 * iframe uten tilgang, kastet den da under import. Et kast under import er
 * ikke en manglende innstilling: det er en helt hvit skjerm, uten en linje i
 * loggen, fordi loggen heller ikke rakk å bli til.
 *
 * Funnet ved at en prøve av NOE HELT ANNET feilet med «Access is denied for
 * this document». Samme form som `logMsg` i v1.177.0 — et kall i en
 * oppstartssti som tar med seg alt rundt seg når omgivelsen ikke er den vi
 * antok. To ganger på fire utgivelser er ikke tilfeldig; det er en kant
 * denne kodebasen har flere av.
 */
describe('oppstart uten lagring', () => {
  it('starter selv når localStorage nekter', async () => {
    const ekte = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); },
    });
    try {
      // Fersk import, så modulnivå-koden kjører på nytt i denne tilstanden.
      await expect(import('../src/storage.js?nolagring')).resolves.toBeTruthy();
    } finally {
      if (ekte) Object.defineProperty(globalThis, 'localStorage', ekte);
      else delete globalThis.localStorage;
    }
  });

  /* MÅLEINSTRUMENTET: med lagring tilgjengelig skal migreringen fortsatt
   * GJØRE noe. En try/catch som svelger alt ville bestått testen over uten
   * at profilen noen gang ble opprettet. */
  it('og migrerer fortsatt når den får lov', async () => {
    localStorage.clear();
    localStorage.setItem('t.palette', 'gull');
    await import('../src/storage.js?medlagring');
    expect(localStorage.getItem('__activeProfile')).toBe('default');
    expect(localStorage.getItem('default::t.palette')).toBe('gull');
    expect(localStorage.getItem('t.palette')).toBeNull();
  });
});
