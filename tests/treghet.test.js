// v1.218.249: «knappen for Innstillinger blitt veldig treg eller ikke responsiv».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const set = readFileSync('src/views/settings.js', 'utf8'), sch = readFileSync('src/scheduler.js', 'utf8'), a = readFileSync('src/views/auto.js', 'utf8');
describe('Innstillinger svarer med en gang', () => {
  it('valgene først; minnet (turer, knappebruk, minnekart) i neste runde', () => {
    const f = set.slice(set.indexOf('export function showPrefs()'), set.indexOf('export function showPrefs()') + 600);
    expect(f).toMatch(/_highlightPrefs\(\);\s*_renderTestPos\(\);[\s\S]*setTimeout\(\(\) => \{[\s\S]*renderMemory\(\)/);
    expect(f).not.toMatch(/_highlightPrefs\(\);\s*renderMemory\(\);/);
  });
  it('lang tid logges, på telefonen', () => {
    expect(set).toMatch(/window\._logMsg\('innstillinger: valg '/);
    expect(sch).toMatch(/logMsg\('treg tegning \(' \+ state\.view \+ '\): '/);
  });
});
describe('Auto rangerer stoppene én gang per sekund', () => {
  it('_stops() husker svaret for samme liste, sekund og retningsvalg', () => {
    expect(a).toMatch(/if \(_stopsHusket && _stopsHusket\.liste === list && _stopsHusket\.nøkkel === nøkkel\) return _stopsHusket\.svar;/);
  });
});
