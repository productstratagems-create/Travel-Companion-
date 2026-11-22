// v1.218.248: «Bruk samme trasé-fiks i Rute-kartet også.» Rute hadde ikke
// feilen: svaret fra turForm kaller renderBoard, og rutelinja tømmes og
// tegnes på nytt hver gang — ingen nøkkel holder den rette streken igjen.
// Denne testen holder det slik.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const b = readFileSync('src/views/board.js', 'utf8');
const rute = b.slice(b.indexOf('function renderLineRoute('), b.indexOf('function renderLineRoute(') + 12000);
describe('Rute-kartet: traseen tegnes når den kommer', () => {
  it('svaret fra turForm og fetchJourneyShape tegner Rute på nytt', () => {
    expect(b).toMatch(/turForm\(.*, renderBoard\)/);
    expect(b).toMatch(/fetchJourneyShape\(jid\)\.then\(pts => \{ if \(pts && pts\.length >= 2\) renderBoard\(\); \}\)/);
  });
  it('rutelinja tømmes og tegnes på nytt — ingen nøkkel som hopper over tegningen', () => {
    expect(rute).toMatch(/tømLag\(_bRouteLayer\);/);
    expect(rute).not.toMatch(/if \([^)]*(Key|Nøkkel|sig)[^)]*===[^)]*\) return/);
  });
});
