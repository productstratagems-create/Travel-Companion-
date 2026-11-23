/**
 * «Ett bytte» (eksperiment): hurtigvalget i Auto-tavla som viser områder du når
 * med ett bytte, én rad per himmelretning. Mot opptak (tests/fixtures/entur/).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ettByttePerRetning, RETNINGER } from '../src/ettBytte.js';
import { ettBytteHtml, ettBytteRadHtml, _nullstillEttBytte, ETT_BYTTE_VALG, UT_VIST } from '../src/views/ettBytteVisning.js';
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { AT_RETNINGER } from '../src/views/auto.js';
import { SCENARIOER, lastOpptak, avspiller } from './fixtures/entur/avspilling.js';

const O = Object.fromEntries(SCENARIOER.map(n => [n, lastOpptak(n)]));
const res = async n => { _tømCache(); return utforsk(O[n].scenario, { hent: avspiller(O[n]).hent }); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
beforeEach(() => { _tømCache(); _nullstillEttBytte(); });

describe('ett bytte: rader per himmelretning (ren)', () => {
  it('Mortensrud: mange ulike retninger, nordøst via Helsfyr med buss 300 og 110', async () => {
    const e = ettByttePerRetning(await res('mortensrud_dag'), O.mortensrud_dag.scenario.posisjon);
    expect(e.rader.length).toBeGreaterThanOrEqual(5);
    const nø = e.rader.find(r => r.retning === 'NØ');
    expect(nø.knute).toBe('NSR:StopPlace:59516');
    expect(nø.ut).toEqual(expect.arrayContaining(['300', '110']));
  });
  it('én rad per retning, i rekkefølge med klokka, aldri sentrum', async () => {
    for (const n of SCENARIOER) {
      const e = ettByttePerRetning(await res(n), O[n].scenario.posisjon);
      const r = e.rader.map(x => x.retning);
      expect(new Set(r).size).toBe(r.length);
      expect(r).toEqual(RETNINGER.filter(x => r.includes(x)));
    }
  });
  it('bare to ledd i ordinært vindu, og bare reelle bytter (ikke samme linje videre)', () => {
    const vei = (o) => ({ ledd: 2, vindu: 'ordinært', knute: 'K', inn: 'L1>A', directionId: 'L2>B', område: 'N|5–15', opsjon: 'destination:D', ...o });
    const r = { veier: [vei({ vindu: 'senere' }), vei({ vindu: 'utvidet' }), vei({ ledd: 1, knute: null, inn: null }), vei({ directionId: 'L1>A2' }), vei({ område: '•|0–5' })], opsjoner: [], grupper: { linjeretning: {} } };
    expect(ettByttePerRetning(r, { lat: 60, lon: 10 })).toMatchObject({ rader: [], ingen: true });
    r.veier.push(vei());
    expect(ettByttePerRetning(r, { lat: 60, lon: 10 }).rader).toHaveLength(1);
  });
  it('natt og bygd: få rader, men ærlige', async () => {
    expect(ettByttePerRetning(await res('mortensrud_natt'), O.mortensrud_natt.scenario.posisjon).rader.length).toBeLessThanOrEqual(2);
  });
  it('deterministisk uavhengig av rekkefølgen veiene kom i', async () => {
    const r = await res('nesttun_dag');
    const a = ettByttePerRetning(r, O.nesttun_dag.scenario.posisjon);
    const b = ettByttePerRetning({ ...r, veier: [...r.veier].reverse(), opsjoner: [...r.opsjoner].reverse() }, O.nesttun_dag.scenario.posisjon);
    expect(b).toEqual(a);
  });
  it('påstår ingen reisetid og ingen bekreftelse', async () => {
    const e = ettByttePerRetning(await res('ranheim_dag'), O.ranheim_dag.scenario.posisjon);
    expect(e.grunnlag).toMatch(/ikke sjekket/);
    expect(e.grunnlag).toMatch(/ikke tidskontrollert/);
    for (const r of e.rader) { expect(r.sjekket).toBe(false); expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['min', 'reisetid', 'avgang'])); }
  });
});

describe('ett bytte: visningen', () => {
  const pos = O.mortensrud_dag.scenario.posisjon;
  const hent = avspiller(O.mortensrud_dag).hent;
  it('leter først, viser rader når svaret kommer, og ber om ny tegning', async () => {
    let tegnet = 0;
    const nå = Date.parse(O.mortensrud_dag.scenario.tid);
    const først = ettBytteHtml(pos, { esc, hent, nå, rerender: () => { tegnet++; } });
    expect(først).toMatch(/ser etter hvor du kommer med ett bytte/);
    await new Promise(r => setTimeout(r, 50));
    expect(tegnet).toBe(1);
    const etter = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} });
    expect(etter).toMatch(/class="eb-rad"/);
    expect(etter).toMatch(/ikke sjekket/);
    expect(etter).toMatch(/via Helsfyr/);
  });
  it('feil gir en ærlig tekst, ikke en tom liste', async () => {
    ettBytteHtml(pos, { esc, hent: async () => { throw new Error('nett'); }, rerender: () => {} });
    await new Promise(r => setTimeout(r, 20));
    expect(ettBytteHtml(pos, { esc, hent: async () => { throw new Error('nett'); }, rerender: () => {} })).toMatch(/fant ikke svar på bytter herfra nå/);
  });
  it('uten posisjon: sier hva som mangler', () => {
    expect(ettBytteHtml(null, { esc })).toMatch(/trenger en posisjon/);
  });
  it('lange linjelister kortes til UT_VIST + antall', () => {
    const h = ettBytteRadHtml({ retning: 'N', retningNavn: 'nord', knuteNavn: 'K', inn: ['1'], ut: ['a', 'b', 'c', 'd', 'e', 'f'], eksempler: ['X'], antallSteder: 5 }, esc);
    expect(h).toContain('a, b, c, d +2');
    expect(UT_VIST).toBe(4);
  });
});

describe('ett bytte: isolert og lett å rulle tilbake', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('alle krokene i auto.js er merket, og det er bare fem', () => {
    const linjer = a.split('\n').filter(l => /ETT_BYTTE|ettBytte/.test(l));
    expect(linjer.length).toBe(5);
    expect(linjer.every(l => /ETT BYTTE \(eksperiment\)/.test(l))).toBe(true);
  });
  it('valget huskes ikke: etter omlasting står tavla på et kjent valg', () => {
    expect(AT_RETNINGER).not.toContain(ETT_BYTTE_VALG);
  });
});
