import { describe, it, expect } from 'vitest';
import { ET_CLIENT_NAME } from '../src/api/http.js';
import fs from 'node:fs';

// Entur identifies consumers by this header. The scooter calls used to send a
// second, different name, so half the app's traffic could not be attributed
// to it — which matters exactly when Entur throttles, or someone asks who is
// calling. One name, asserted across the source rather than by memory.
describe('ET-Client-Name', () => {
  it('is the same everywhere it is sent', () => {
    const files = ['src/api/http.js', 'src/api/scooters.js'];
    const literals = new Set();
    files.forEach(f => {
      const src = fs.readFileSync(f, 'utf8');
      const re = /'ET-Client-Name':\s*'([^']+)'/g;
      let m;
      while ((m = re.exec(src))) literals.add(m[1]);
    });
    // No hardcoded second name survives; every send goes through the constant.
    expect([...literals]).toEqual([]);
    expect(ET_CLIENT_NAME).toBe('productstratagems-travel-companion');
  });
});
