/* SPISESTEDER MED SMILEFJES (v1.218.328). Fiksturen er KONSTRUERT (sandkassen når ikke Mattilsynet) — byttes med et ekte utsnitt etter første Action-kjøring. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseTilsyn, datoIso, karakterOrd, naboRuter, ruteNøkkel, tilRuter, kandidaterFraRuter, smilefjesTekst } from '../src/api/smilefjesData.js';
import { opplevelserVed, velgVisning, innganger, INNGANGER, erSynlig } from '../src/opplevelser.js';
import { trinnFor } from '../src/opplevelserScore.js';
import { hentSmilefjes, hentOpplevelser, _tømOpplevelser } from '../src/api/opplevelserKilder.js';

const CSV = fs.readFileSync('tests/fixtures/smilefjes/tilsyn-konstruert.csv', 'utf8');
const stopp = { id: 'NSR:StopPlace:1', lat: 59.9133, lon: 10.7479 };

describe('parser', () => {
  it('siste tilsyn per spisested (ikke det første), og forkastet telles', () => {
    const p = parseTilsyn(CSV);
    expect(p.antallTilsyn).toBe(6);
    const k = p.rader.find(r => r.navn === 'Kafé Nordlys');
    expect(k).toMatchObject({ dato: '2025-03-12', karakter: 0 });   // 2025 vinner over 2023
    expect(p.rader.find(r => r.navn.startsWith('Fisk')).navn).toBe('Fisk & "Chips"');
    expect(p.uten).toEqual({ dato: 1, karakter: 1, navn: 0 });
  });
  it('mangler en påkrevd kolonne: kaster høyt, med det den fant', () => {
    expect(() => parseTilsyn('a;b\n1;2')).toThrow(/mangler kolonne.*navn, dato, karakter.*a \| b/);
  });
  it('datoformer og karakterord', () => {
    expect(datoIso('12032025')).toBe('2025-03-12'); expect(datoIso('12.03.2025')).toBe('2025-03-12'); expect(datoIso('2025-03-12')).toBe('2025-03-12'); expect(datoIso('')).toBe(null);
    expect(karakterOrd(0)).toBe('glad'); expect(karakterOrd(3)).toBe('sur'); expect(karakterOrd(9)).toBe('ikke vurdert');
  });
});

describe('rutenett', () => {
  it('rutene rundt et stopp dekker sirkelen, og en rad havner i sin rute', () => {
    expect(naboRuter(59.9133, 10.7479)).toContain(ruteNøkkel(59.9133, 10.7479));
    expect(naboRuter(59.9999, 10.7999, 1500).length).toBeGreaterThan(1);   // ved rutekanten: flere
    const r = tilRuter([{ navn: 'X', lat: 59.91, lon: 10.74, karakter: 1, dato: '2025-01-01', adresse: 'a' }, { navn: 'Y', lat: null, lon: null }]);
    expect(Object.values(r).flat()).toHaveLength(1);                            // uten posisjon utelates
  });
});

describe('i appen', () => {
  const rader = [['Kafé Nordlys', 59.9137, 10.7481, 0, '2025-03-12', 'Storgata 1']];
  it('kandidaten er en spisested-opplevelse i kategorien «Mat og drikke», med smilefjes som faktum med dato', () => {
    const [o] = opplevelserVed(kandidaterFraRuter(rader), stopp);
    expect(innganger(o)).toEqual(['mat']);
    expect(INNGANGER.mat).toBe('Mat og drikke');
    expect(smilefjesTekst(o.smilefjes)).toBe('smilefjes: glad · tilsyn 12.03.2025');
    expect(o.kilder[0].kilde).toBe('smilefjes');
  });
  it('mat løfter aldri foran en opplevelse: trinn 5, og bare mat vises når det er alt som finnes', () => {
    const mat = opplevelserVed(kandidaterFraRuter(rader), stopp);
    const park = { navn: 'Parken', luft: 900, hoved: ['park'], under: ['park'], kat: [{ k: 'park', u: 'park', sterk: true }], kilder: [], sitelinks: 3 };
    expect(trinnFor(mat[0])).toBe(5);
    expect(velgVisning([...mat, park], 1)[0].navn).toBe('Parken');
    expect(velgVisning(mat, 2).map(o => o.navn)).toEqual(['Kafé Nordlys']);
  });
  it('kategorivalget kan slå mat av', () => {
    const [o] = opplevelserVed(kandidaterFraRuter(rader), stopp);
    expect(erSynlig(o, ['natur', 'kultur'])).toBe(false);
    expect(erSynlig(o, ['mat'])).toBe(true);
  });
  it('hentSmilefjes: rutene rundt stoppet; 404 uten treff sier «mangler», ikke tom stillhet', async () => {
    const urler = [];
    const ok = await hentSmilefjes(stopp, { hent: async u => { urler.push(u); return rader; } });
    expect(ok.rader.length).toBeGreaterThanOrEqual(1); expect(ok.mangler).toBe(false); expect(urler[0]).toMatch(/^\.\/data\/smilefjes\/\d+_\d+\.json$/);
    const ingen = await hentSmilefjes(stopp, { hent: async () => { throw new Error('HTTP 404'); } });
    expect(ingen).toEqual({ rader: [], mangler: true });
  });
  it('hentOpplevelser: smilefjes-status følger med når kilden er koblet på; uten den er statusen som før', async () => {
    _tømOpplevelser();
    const h = { tekst: async () => '', json: async () => ({}) };
    const d = await hentOpplevelser({ ...stopp, id: 'S1' }, { hent: { ...h, smil: async () => ({ rader, mangler: false }) } });
    expect(d.status.smilefjes).toBe('ok'); expect(d.liste.map(o => o.navn)).toContain('Kafé Nordlys');
    _tømOpplevelser();
    expect((await hentOpplevelser({ ...stopp, id: 'S2' }, { hent: h })).status).toEqual({ turrute: 'ok', miljodir: 'ok', wikidata: 'ok' });
  });
});
