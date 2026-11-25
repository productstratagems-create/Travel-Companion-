/* SCOREN PÅ KORTENE (v1.218.325): forklaringen vises, tallet vises ikke, og bryteren gir dagens valg. */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { lastOpptak, avspiller } from './fixtures/entur/avspilling.js';
import { reiseRader } from '../src/reiseTil.js';
import { parseTurruter, parseFriluft, parseWikidata } from '../src/api/opplevelserKilder.js';
import { opplevelserVed, velgVisning } from '../src/opplevelser.js';
import { ettBytteHtml, _nullstillEttBytte, _settOpplevelseKilder, velgRetning, OPPLEVELSE_SCORE } from '../src/views/ettBytteVisning.js';

const O = lastOpptak('mortensrud_dag'), pos = O.scenario.posisjon, nå = Date.parse(O.scenario.tid), av = avspiller(O);
const TP = O.reisesok ? null : lastOpptak('mortensrud_dag.reisesok').opptak['reisesøk'].svar.data.t1.tripPatterns;
const F = JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/oppegard.json', 'utf8')), tr = parseTurruter(F.turrute, F.stopp);
const data = { liste: opplevelserVed([...tr.kandidater, ...parseFriluft(F.friluft, F.stopp), ...parseWikidata(F.wikidata)], F.stopp), punkter: tr.punkter, status: {} };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const vent = ms => new Promise(r => setTimeout(r, ms));

describe('score på kortene', () => {
  beforeEach(() => { _nullstillEttBytte(); _settOpplevelseKilder(async () => data, async () => ({ m: 700, min: 9 }), async () => null); });
  it('bryteren er på, og et valgt kort viser forklaringen (ikke tallet)', async () => {
    expect(OPPLEVELSE_SCORE).toBe(true);
    const hent = async (navn, req) => (navn === 'ett bytte: sjekk' ? { data: { eb: { tripPatterns: TP } } } : av.hent(navn, req));
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(100);
    velgRetning('NØ'); await vent(150);
    const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {}, radHtml: () => '<div class="rad"></div>' });
    const forkl = [...html.matchAll(/class="eb-okort-forkl">([^<]+)</g)].map(m => m[1]);
    expect(forkl.length).toBeGreaterThan(0);
    for (const f of forkl) expect(f).toMatch(/^(nasjonal turrute|regional turrute|sterkt reisemål|turområde|reisemål|kirke eller kulturminne)/);
    expect(html).not.toMatch(/score|"total"|faktorer/i);                  // tallet står ingen steder
  });
  it('uten score (bryteren av): samme valg som før og ingen forklaring — referanse mot velgVisning uten kontekst', () => {
    const uten = velgVisning(data.liste, 2).map(o => o.navn);
    expect(velgVisning(data.liste, 2, null).map(o => o.navn)).toEqual(uten);
    expect(velgVisning(data.liste, 2)[0].score).toBeUndefined();
    const src = fs.readFileSync('src/views/ettBytteVisning.js', 'utf8');
    expect(src).toContain('if (!OPPLEVELSE_SCORE) return null;');
    expect(src).toContain('OPPLEVELSE_SCORE ? LETT_KONTEKST : null');
  });
  it('enkel tilgang vinner over krevende for ellers like opplevelser (kontekst per opplevelse)', () => {
    const lik = n => ({ navn: n, kat: [{ k: 'kultur', u: 'museum', sterk: true }], hoved: ['kultur'], under: ['museum'], rute: null, sitelinks: 0, luft: 500, kilder: [{ kilde: 'wikidata' }, { kilde: 'osm' }] });
    const v = velgVisning([lik('Krevende'), lik('Enkel')], 1, { avvik: [], gangFor: () => ({ kilde: 'målt', min: 8 }), tilgangFor: o => (o.navn === 'Enkel' ? 'enkel' : 'krevende') });
    expect(v[0].navn).toBe('Enkel');
    expect(v[0].score.forklaring).toContain('enkel tilgang');
  });
});
