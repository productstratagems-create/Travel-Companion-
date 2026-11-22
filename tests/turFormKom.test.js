// v1.218.247: «Bussruten følger ikke veien.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
describe('når traseen kommer, tegnes kartet på nytt', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('turForm sitt svar tegner kartet, ikke bare lista', () => {
    // v1.218.259: samlet — én tegning per FORM_SAMLE_MS, og fortsatt kartet.
    expect(a).toMatch(/_formTid = setTimeout\(\(\) => \{ _formTid = null; _aKey = ''; _renderMap\(\); _renderBody\(\); \}, FORM_SAMLE_MS\);/);
    expect(a).toMatch(/if \(_formTid\) return;/);
    expect(a).not.toMatch(/turForm\(.*, _renderBody\)/);
    expect((a.match(/turForm\(.*, _formKom\)/g) || []).length).toBe(3);
  });
});
