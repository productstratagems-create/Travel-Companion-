/**
 * Hele reisen hjem (v1.218.303). Skjermbilde fra Økern, hjem = Mortensrud:
 * «23 · bytt på Brynseng T» — uten hva du bytter til eller når du er hjemme,
 * selv om reisesøket hjem hadde svaret.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hjemReiser, hjemReiseFor, byttTekst, byttTillegg, HJEM_SAMME_AVGANG_MS } from '../src/hjemover.js';
import { kombiKall } from '../src/reiseTil.js';
import { lastOpptak } from './fixtures/entur/avspilling.js';

const T = hm => '2026-11-24T' + hm + ':00+01:00';
const etappe = (mode, id, kode, fra, til, start, slutt) => ({ mode, expectedStartTime: T(start), expectedEndTime: T(slutt), fromPlace: { name: fra }, toPlace: { name: til },
  serviceJourney: { line: { id, publicCode: kode } }, fromEstimatedCall: { destinationDisplay: { frontText: til } } });
const fot = (s, e) => ({ mode: 'foot', expectedStartTime: T(s), expectedEndTime: T(e) });
const reise = (avg, bytteVent, framme, videreKode = '3', videreModus = 'metro') => ({ legs: [fot('17:30', avg),
  etappe('bus', 'RUT:Line:23', '23', 'Økern', 'Brynseng T', avg, bytteVent), etappe(videreModus, 'RUT:Line:' + videreKode, videreKode, 'Brynseng T', 'Mortensrud', bytteVent, framme)] });
const klokke = ms => new Date(ms).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });

describe('hele reisen hjem', () => {
  const reiser = hjemReiser([reise('17:34', '17:44', '17:58'), reise('17:49', '17:59', '18:13')]);
  it('én reise per avgang, med hva du bytter til og når du er hjemme', () => {
    expect(reiser.map(r => [r.kode, r.bytte, r.videre, klokke(r.går), klokke(r.framme)]))
      .toEqual([['23', 'Brynseng T', 'T-bane 3', '17:34', '17:58'], ['23', 'Brynseng T', 'T-bane 3', '17:49', '18:13']]);
  });
  it('raden finner SIN avgang: samme linje, samme bytte, avgang innen ett minutt', () => {
    const avg = Date.parse(T('17:49'));
    expect(klokke(hjemReiseFor(reiser, 'RUT:Line:23', avg, 'Brynseng T').framme)).toBe('18:13');
    expect(hjemReiseFor(reiser, 'RUT:Line:23', avg + HJEM_SAMME_AVGANG_MS, 'Brynseng T')).not.toBeNull();
    expect(hjemReiseFor(reiser, 'RUT:Line:23', avg + HJEM_SAMME_AVGANG_MS + 60_000, 'Brynseng T')).toBeNull(); // en annen avgang
    expect(hjemReiseFor(reiser, 'RUT:Line:24', avg, 'Brynseng T')).toBeNull();                               // en annen linje
    expect(hjemReiseFor(reiser, 'RUT:Line:23', avg, 'Helsfyr')).toBeNull();                                  // et annet bytte
  });
  it('teksten: hele reisen når den er funnet, ellers som før — ingen påstått ankomst', () => {
    const r = hjemReiseFor(reiser, 'RUT:Line:23', Date.parse(T('17:34')), 'Brynseng T');
    expect(byttTekst('Brynseng T', r, klokke)).toBe('bytt på Brynseng T til T-bane 3 · hjemme 17:58');
    expect(byttTekst('Brynseng T', null, klokke)).toBe('bytt på Brynseng T');
    expect(byttTillegg(null, klokke)).toBe('');
  });
  it('bare reiser med nøyaktig ett bytte gir «til …» (ellers ville «til» hoppet over et bytte)', () => {
    const toBytter = { legs: [etappe('bus', 'RUT:Line:23', '23', 'Økern', 'Brynseng T', '17:34', '17:44'),
      etappe('metro', 'RUT:Line:3', '3', 'Brynseng T', 'Hellerud', '17:46', '17:48'), etappe('bus', 'RUT:Line:74', '74', 'Hellerud', 'Mortensrud', '17:50', '18:05')] };
    expect(hjemReiser([toBytter])).toEqual([]);
  });
  it('raden åpner HELE reisen: kallet har begge etappene, byttet og ankomsten hjemme (v1.218.304)', () => {
    expect(hjemReiseFor(reiser, 'RUT:Line:23', Date.parse(T('17:34')), 'Brynseng T').tp).toBeTruthy();
    // En ekte reise med ett bytte fra opptakene (Mortensrud → Furuset skole: T-bane 3, bytt på Helsfyr, buss 300).
    const tps = lastOpptak('mortensrud_dag.reisesok').opptak['reisesøk'].svar.data.t1.tripPatterns;
    const ekte = hjemReiser(tps).find(e => e.bytte === 'Helsfyr');
    expect(ekte.videre).toBe('300');
    const c = kombiKall(ekte);
    expect(c).toBeTruthy();
    expect(c._legs.filter(l => l.mode !== 'foot')).toHaveLength(2);
    expect(c._dir.to).toBe('Furuset skole');
    const a = readFileSync('src/views/auto.js', 'utf8');
    // Reisen går foran første avgang i klikket.
    expect(a.indexOf('const hel = x.hjemReise && x.hjemReise.tp ? kombiKall(x.hjemReise) : null;'))
      .toBeLessThan(a.indexOf('const c = x.rekk ? rekkKall(x.call, x.rekk) : x.call;'));
    expect(a).toMatch(/if \(hel && typeof window !== 'undefined' && window\.tap\) \{ window\.tap\(hel\); return; \}/);
  });
  it('tavla og Auto-reise bruker den samme teksten', () => {
    const a = readFileSync('src/views/auto.js', 'utf8'), t = readFileSync('src/ui/tavleRad.js', 'utf8');
    expect(a).toMatch(/x\.hjemReise = hs && hjemReiseFor\(hs\.reiser/);
    expect(a).toMatch(/x\.byttTekst = byttTekst\(x\.bytte, x\.hjemReise, _klokke\)/);
    expect(a).toMatch(/esc\(byttTillegg\(\(hs => hs && hjemReiseFor\(hs\.reiser/);
    expect(t).toMatch(/esc\(x\.byttTekst \|\| 'bytt på ' \+ x\.bytte\)/);
    expect(a).toMatch(/post\.reiser = hjemReiser\(alle\)/);
  });
});

describe('hjemover: avgang utenfor hjemsøket (v1.218.306)', () => {
  it('videreLinjer: linjene du bytter til på samme sted, fra reisene søket alt har', async () => {
    const { videreLinjer, hjemReiser } = await import('../src/hjemover.js');
    const tps = lastOpptak('mortensrud_dag.reisesok').opptak['reisesøk'].svar.data.t1.tripPatterns;
    const reiser = hjemReiser(tps);
    const r = reiser[0];
    const v = videreLinjer(reiser, r.bytte);
    expect(v.length).toBeGreaterThan(0);
    const kol = r.tp.legs.filter(l => l.mode !== 'foot');
    expect(v).toContain(kol[1].serviceJourney.line.id);
    expect(videreLinjer(reiser, 'Et sted som ikke finnes')).toEqual([]);
  });
  it('tripMedLinjerGQL: én trip-spørring, med bare radens linje og linjene videre', async () => {
    const { tripMedLinjerGQL } = await import('../src/api/entur.js');
    const q = tripMedLinjerGQL('NSR:StopPlace:1', 'NSR:StopPlace:2', Date.parse('2026-11-24T17:37:00Z'), 3, ['RUT:Line:5', 'RUT:Line:3'], ['RUT:ServiceJourney:b']);
    expect((q.match(/trip\(/g) || []).length).toBe(1);
    // Sett live (Nydalen → Mortensrud): uten å utelate de andre turene på linja svarte Entur med en raskere tur.
    expect(q).toContain('trip(whiteListed:{lines:["RUT:Line:5","RUT:Line:3"]} banned:{serviceJourneys:["RUT:ServiceJourney:b"]} ');
    expect(tripMedLinjerGQL('A', 'B', 0, 3, ['L'])).not.toContain('banned');
  });
  it('auto.js: rad med bytte uten treff henter reisen ved trykk, ellers åpnes den som før', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    const i = src.indexOf('const hel = x.hjemReise'), j = src.indexOf('_hjemReiseVedTrykk(x, rader)', i), k = src.indexOf('_åpneRad(x);', j);
    expect(i).toBeGreaterThan(0); expect(j).toBeGreaterThan(i); expect(k).toBeGreaterThan(j);
    expect(src).toMatch(/fetchTripMedLinjer\(fra, m\.id, x\.ms - 60_000, 3, \[linje, \.\.\.videre\], uten\)/);
    expect(src).toMatch(/reiseForTur\(svar\.flat\(\), sjId\)/);
  });
  it('reiseForTur: reisen som starter med akkurat den turen, ellers null', async () => {
    const { reiseForTur } = await import('../src/hjemover.js');
    const tps = lastOpptak('mortensrud_dag.reisesok').opptak['reisesøk'].svar.data.t1.tripPatterns;
    const sj = tps.map(p => p.legs.find(l => l.mode !== 'foot').serviceJourney.id);
    expect(reiseForTur(tps, sj[1]).tp).toBe(tps[1]);
    expect(kombiKall(reiseForTur(tps, sj[1]))._legs.length).toBeGreaterThan(0);
    expect(reiseForTur(tps, 'RUT:ServiceJourney:finnes-ikke')).toBeNull();
    expect(reiseForTur(tps, null)).toBeNull();
  });
});
