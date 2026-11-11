// «Hva er det denne oversiktstavla mangler som er proven?» — steg 1: klokkeslett lenger fram,
// sanntid per avgang, når avgangene ble hentet, sporet på samme plass.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { _timesHtml, KLOKKE_FRA_MIN, oppdatertHtml, OPPDATERT_GAMMEL_MIN } from '../src/views/auto.js';
import { clk } from '../src/ui/fmt.js';

const NÅ = Date.parse('2026-11-11T00:15:00+01:00');
const om = m => NÅ + m * 60000;

describe('klokkeslett lenger fram', () => {
  it('«27 · 57 · 72 min» blir «27 min · kl · kl»', () => {
    const h = _timesHtml({ times: [om(27), om(57), om(72)], mins: 27 }, NÅ, null);
    expect(h).toContain('>' + clk(om(57)) + '<');
    expect(h).toContain('>' + clk(om(72)) + '<');
    expect(h).not.toMatch(/>72</);
  });
  it('innenfor grensen: minutter, og «min» én gang til slutt', () => {
    const h = _timesHtml({ times: [om(3), om(9), om(14)], mins: 3 }, NÅ, null);
    expect(h).toMatch(/>14<\/span> min$/);
    expect(KLOKKE_FRA_MIN).toBe(15);
  });
  it('blandet: «min» etter siste minuttall, ikke etter klokkeslettet', () => {
    const h = _timesHtml({ times: [om(3), om(14), om(44)], mins: 3 }, NÅ, null);
    expect(h).toMatch(/>14<\/span> min<span class="auto-t-sep">/);
    expect(h.endsWith(clk(om(44)) + '</span>')).toBe(true);
  });
});

describe('sanntid per avgang', () => {
  it('prikk bare på tider som er sanntid', () => {
    const h = _timesHtml({ times: [om(3), om(9)], mins: 3, sanntidMs: new Set([om(3)]) }, NÅ, null);
    expect(h.match(/is-sanntid/g)).toHaveLength(1);
    expect(h).toMatch(/is-sanntid" title="sanntid">3</);
  });
});

describe('når avgangene ble hentet', () => {
  it('ferskt: stille linje med klokkeslett', () => {
    expect(oppdatertHtml(NÅ - 60000, NÅ)).toBe('<div class="auto-oppdatert">oppdatert ' + clk(NÅ - 60000) + '</div>');
  });
  it('gammelt eller frakoblet: varsel', () => {
    expect(oppdatertHtml(NÅ - OPPDATERT_GAMMEL_MIN * 60000, NÅ)).toContain('is-gammel');
    expect(oppdatertHtml(NÅ - 60000, NÅ, false)).toContain('frakoblet');
    expect(oppdatertHtml(null, NÅ)).toBe('');
  });
});

describe('sporet på samme plass', () => {
  it('på linja med tidene, ikke ved navnet', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    const i = s.indexOf("'<span class=\"nearby-dist\">' + vaneHtml");
    expect(s.slice(i, i + 200)).toContain('auto-quay');
    expect(s.slice(s.indexOf("'<span class=\"nearby-name\">mot '"), i)).not.toMatch(/\+ \(q \?/);
  });
});

describe('steg 2', () => {
  it('belegg på raden bare når Entur har målt det', async () => {
    const { radBeleggHtml } = await import('../src/views/auto.js');
    expect(radBeleggHtml({ occupancyStatus: 'standingRoomOnly' })).toContain('travelt');
    expect(radBeleggHtml({ occupancyStatus: 'noData' })).toBe('');
    expect(radBeleggHtml(null)).toBe('');
  });
  it('kortet «dit du ofte skal» sier når du må gå', async () => {
    const { kortHtml } = await import('../src/views/auto.js');
    const o = { ms: NÅ + 18 * 60000, at: NÅ + 43 * 60000, call: { quay: { publicCode: '1' } }, d: { frontText: 'Kolsås', lines: [{ code: '3' }] } };
    expect(kortHtml({ name: 'Jernbanetorget', options: [{ ...o, gåMin: 9 }] }, 0)).toContain('gå om 9 min');
    expect(kortHtml({ name: 'Jernbanetorget', options: [{ ...o, gåMin: 0 }] }, 0)).toContain('gå nå');
    expect(kortHtml({ name: 'Jernbanetorget', options: [o] }, 0)).not.toContain('gå om');
  });
});
