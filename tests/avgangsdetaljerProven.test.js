// «Hvordan kan vi rydde opp i denne siden slik at den tilfredsstiller alt som er «proven» i
// reiseappers avgangsdetaljer» — retning på linjekortet, og spor/tid/sanntid/ankomst/reisetid
// synlig uten å folde ut.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sammendragHtml } from '../src/views/selected.js';
import { clk } from '../src/ui/fmt.js';
import { belegg } from '../src/api/belegg.js';

const T = Date.parse('2026-11-10T21:42:00+01:00');
const base = { fra: 'Mortensrud', spor: 'spor 2', avg: T, rute: T, sanntid: true, til: 'Jernbanetorget',
  ank: T + 21 * 60000, min: 21, ankSpor: 'spor 1' };

describe('reisesammendraget', () => {
  it('fra, spor, tid, sanntid → til, tid, reisetid', () => {
    const h = sammendragHtml(base);
    for (const s of ['Mortensrud', 'spor 2', clk(T), 'sanntid', 'Jernbanetorget', clk(T + 21 * 60000), '21 min', 'spor 1']) expect(h).toContain(s);
    expect(h).not.toContain('ss-forsink');
  });
  it('rutetid sies når det ikke er sanntid', () => {
    expect(sammendragHtml({ ...base, sanntid: false })).toContain('is-rutetid');
  });
  it('forsinkelse fra 2 min: «+3»', () => {
    expect(sammendragHtml({ ...base, avg: T + 3 * 60000 })).toContain('<span class="ss-forsink">+3</span>');
    expect(sammendragHtml({ ...base, avg: T + 60000 })).not.toContain('ss-forsink');
  });
  it('belegg bare når Entur har det', () => {
    expect(sammendragHtml({ ...base, belegg: belegg({ status: 'manySeatsAvailable' }) })).toContain('lite folk');
    expect(sammendragHtml(base)).not.toContain('ss-belegg');
  });
});

describe('linjekortet viser retningen', () => {
  it('adapt tar vare på linjas frontText som _retning', () => {
    const a = readFileSync('src/api/adapt.js', 'utf8');
    expect(a).toMatch(/_retning:\s+\(first\.fromEstimatedCall/);
    expect(readFileSync('src/views/selected.js', 'utf8')).toMatch(/esc\(c\._retning \|\| dest\)/);
  });
  it('📋 er skjult, meldingene står under kartet', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/id="s-plan-btn"[^>]*hidden/);
    expect(html.indexOf('id="s-alerts"')).toBeGreaterThan(html.indexOf('id="sel-map-wrap"'));
  });
});
