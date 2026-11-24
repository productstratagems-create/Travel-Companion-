/* OPPLEVELSER PÅ STEDSRADENE (v1.218.313, steg 1). Fiksturene er ekte svar
 * fra Kartverkets turrutebase, Miljødirektoratet og Wikidata (hentet 24.11)
 * rundt fire «ett bytte»-steder fra traceren (docs/tracer-opplevelser.md). */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { parseTurruter, parseFriluft, parseWikidata, hentOpplevelser, _tømOpplevelser, turruteUrl } from '../src/api/opplevelserKilder.js';
import { opplevelserVed, velgVisning, hvaTekst, avstandTekst, fasiliteterVed, klassifiserTurrute, klassifiserTilrettelegging } from '../src/opplevelser.js';
import { opplevelseHtml, _settOpplevelseKilder, _nullstillEttBytte, TURLAG_WMS, TURLAG_LAG } from '../src/views/ettBytteVisning.js';

const F = k => JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/' + k + '.json', 'utf8'));
const vis = k => { const f = F(k), s = f.stopp, tr = parseTurruter(f.turrute, s); return { s, tr, liste: opplevelserVed([...tr.kandidater, ...parseFriluft(f.friluft, s), ...parseWikidata(f.wikidata)], s) }; };
const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');

describe('ekte svar → det som vises på raden', () => {
  it('Skogstadrampa (Tretten, 0 opplevelser uten turrutebasen): Pilegrimsleden, nasjonal, historisk ferdselsvei, ved stoppet', () => {
    const { liste } = vis('skogstadrampa');
    const [a] = velgVisning(liste);
    expect(a.navn).toBe('Pilegrimsleden-Gudbrandsdalsleden');
    expect(hvaTekst(a)).toBe('nasjonal turrute · historisk ferdselsvei');
    expect(avstandTekst(a)).toBe('ved stoppet');
  });
  it('samme rute står én gang, selv om leddene ligger langt fra hverandre (sett: «Storkjølla» tre ganger)', () => {
    const { liste } = vis('oyer');
    expect(liste.filter(o => o.navn === 'Storkjølla')).toHaveLength(1);
  });
  it('Øyer: Lilleputthammer og Hafjell (kjentest først) — høyst én rute når det finnes noe annet', () => {
    const v = velgVisning(vis('oyer').liste);
    expect(v.map(o => o.navn)).toContain('Lilleputthammer');
    expect(v.filter(o => o.rute).length).toBeLessThanOrEqual(1);
  });
  it('Oppegård: et friluftsområde står ved siden av pilegrimsruta; Leangen: Ringve Musikkmuseum (12 språk) foran gården', () => {
    const opp = velgVisning(vis('oppegard').liste);
    expect(opp.some(o => !o.rute && o.kilder.some(c => c.kilde === 'miljodir'))).toBe(true); // et friluftsområde ved siden av ruta
    expect(velgVisning(vis('leangen').liste).map(o => o.navn)).toContain('Ringve Musikkmuseum');
  });
  it('fasiliteter fra turrutebasen står som fakta (parkering ved Storkjølla)', () => {
    const { tr, liste } = vis('oyer');
    expect(fasiliteterVed(liste.find(o => o.navn === 'Storkjølla'), tr.punkter)).toContain('parkering');
  });
});

describe('reglene', () => {
  it('sykkelruter står ikke øverst (sett: «Pilegrimsruta · nasjonal sykkelrute» ved tre bystopp i Oslo)', () => {
    const sykkel = { navn: 'Pilegrimsruta', luft: 10, sitelinks: 0, rute: { type: 'Sykkelrute', betydning: '1' }, kat: [{ k: 'friluftsliv', u: 'sykkelrute', sterk: true }], hoved: ['friluftsliv'], under: ['sykkelrute'] };
    const park = { navn: 'Furuset aktivitetspark', luft: 300, sitelinks: 2, rute: null, kat: [{ k: 'park', u: 'park', sterk: true }], hoved: ['park'], under: ['park'] };
    expect(velgVisning([sykkel, park])[0].navn).toBe('Furuset aktivitetspark');
  });
  it('høyst én rute når noe annet finnes (regeltest, konstruert liste — ikke et bevis på verdi)', () => {
    const rute = (navn, luft) => ({ navn, luft, rute: { type: 'Fotrute', betydning: '1' }, kat: [{ k: 'friluftsliv', u: 'turrute', sterk: true }], hoved: ['friluftsliv'], under: ['turrute'] });
    const marka = { navn: 'Nøstvetmarka', luft: 550, rute: null, kat: [{ k: 'friluftsliv', u: 'stort turområde', sterk: true }], hoved: ['friluftsliv'], under: ['stort turområde'] };
    expect(velgVisning([rute('Pilegrimsruta', 10), rute('Pilegrimsleden-Borgleden', 200), marka]).map(o => o.navn)).toEqual(['Pilegrimsruta', 'Nøstvetmarka']);
    expect(velgVisning([rute('Pilegrimsruta', 10), rute('Pilegrimsleden-Borgleden', 200)]).map(o => o.navn)).toEqual(['Pilegrimsruta', 'Pilegrimsleden-Borgleden']); // bare ruter: begge
  });
  it('avstand: gangtid bare når den er målt, ellers «ca. N m» — aldri påstått gangtid', () => {
    expect(avstandTekst({ luft: 620 })).toBe('ca. 600 m');
    expect(avstandTekst({ luft: 620 }, { m: 900, min: 11 })).toBe('11 min å gå');
    expect(avstandTekst({ luft: 60 })).toBe('ved stoppet');
  });
  it('turrute: navngitt er et turmål, «Ukjent» er det ikke; parkering er fasilitet, ikke opplevelse', () => {
    expect(klassifiserTurrute({ type: 'Fotrute', navn: 'Pilegrimsleden' })[0].sterk).toBe(true);
    expect(klassifiserTurrute({ type: 'Fotrute', navn: 'Ukjent' })[0].sterk).toBe(false);
    expect(klassifiserTilrettelegging('22')).toEqual([]);
    expect(klassifiserTilrettelegging('46')[0]).toMatchObject({ k: 'natur', u: 'utsiktspunkt', sterk: true });
  });
  it('alle rutetyper i ett kall (tre kall per sted)', () => {
    expect(turruteUrl({ lat: 61.3, lon: 10.3 })).toMatch(/typeNames=app:Fotrute,app:Skil%C3%B8ype,app:Sykkelrute,app:AnnenRute,app:RuteInfoPunkt/);
  });
});

describe('henting', () => {
  beforeEach(() => _tømOpplevelser());
  const ok = k => ({ tekst: async () => F(k).turrute, json: async u => (/miljodirektoratet/.test(u) ? F(k).friluft : F(k).wikidata) });
  it('én kilde feiler: de andre vises, og status sier hvilken', async () => {
    const f = F('oppegard'), h = ok('oppegard');
    const d = await hentOpplevelser(f.stopp, { hent: { ...h, json: async u => { if (/wikidata/.test(u)) throw new Error('nett'); return h.json(u); } } });
    expect(d.status).toEqual({ turrute: 'ok', miljodir: 'ok', wikidata: 'feil' });
    expect(d.liste.map(o => o.navn)).toContain('Nøstvetmarka');
  });
  it('caches per stopp; alle tre feiler: ikke cachet, neste valg prøver igjen', async () => {
    const f = F('leangen'); let n = 0;
    const feil = { tekst: async () => { n++; throw new Error('x'); }, json: async () => { n++; throw new Error('x'); } };
    await hentOpplevelser(f.stopp, { hent: feil }); await hentOpplevelser(f.stopp, { hent: feil });
    expect(n).toBe(6);
    let m = 0; const h = ok('leangen'), tell = { tekst: async () => { m++; return h.tekst(); }, json: async u => { m++; return h.json(u); } };
    await hentOpplevelser(f.stopp, { hent: tell }); await hentOpplevelser(f.stopp, { hent: tell });
    expect(m).toBe(3);
  });
});

describe('på skjermen', () => {
  beforeEach(() => { _nullstillEttBytte(); _settOpplevelseKilder(); });
  it('ingen opplevelse funnet: ingen linje (stedet står som før)', () => {
    expect(opplevelseHtml('NSR:StopPlace:finnes-ikke', esc)).toBe('');
  });
  it('turrute-laget er Kartverkets WMS, og av som standard', async () => {
    expect(TURLAG_WMS).toBe('https://wms.geonorge.no/skwms1/wms.friluftsruter2');
    expect(TURLAG_LAG).toContain('Fotrute');
    const src = fs.readFileSync('src/views/ettBytteVisning.js', 'utf8');
    expect(src).toContain("storage.get(TURLAG_KEY) === '1'");                 // av til brukeren slår det på
    expect(src).toContain('hentOpplevelserFor(p)');                            // hentes når kortet velges
    expect(src).toContain('turruter © Kartverket');                            // CC BY 4.0
  });
});
