// Bestilt: «Innhold under «Knappebruk» i Innstillinger må være default kollapset, og må kunne
// slettes separat.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const fra = html.indexOf('<details class="kb-fold"');
const til = html.indexOf('</details>', fra);
const fold = html.slice(fra, til);

describe('knappebruk i innstillinger', () => {
  it('sammenfoldet som standard', () => {
    expect(fra).toBeGreaterThan(-1);
    expect(html.slice(fra, html.indexOf('>', fra))).not.toMatch(/\bopen\b/);
    expect(fold).toContain('id="kb-list"');
    expect(fold).toContain('id="kb-copy"');
  });
  it('kan slettes for seg, uten å folde ut', () => {
    expect(fold).not.toContain('id="kb-clear"');
    expect(html).toMatch(/id="kb-clear">slett knappebruk</);
    const src = readFileSync('src/views/settings.js', 'utf8');
    const i = src.indexOf("getElementById('kb-clear')");
    expect(src.slice(i, i + 200)).toMatch(/glemKnappebruk\(\); renderMemory\(\);/);
  });
});
