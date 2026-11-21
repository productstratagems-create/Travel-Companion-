// v1.218.219: «"Bak deg" hjelper ikke bruker.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
describe('«bak deg» står ikke på raden', () => {
  it('teksten tegnes ikke; bak brukes fortsatt i rekkefølgen', () => {
    expect(readFileSync('src/ui/tavleRad.js', 'utf8')).not.toMatch(/>bak deg</);
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/\(x\.bak \? 1e6 : 0\)/);
  });
});
