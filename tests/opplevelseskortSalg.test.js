/* STEDET SELGES (v1.218.315): bilde og ingress fra Wikipedia/Wikimedia Commons,
 * med kreditering. Fiksturene er ekte svar (Ringve Musikkmuseum, Lilleputthammer,
 * Operahuset i Oslo), hentet 25.11. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseSammendrag, parseBildeinfo, førsteSetning, hvorforTekst, kortData } from '../src/opplevelser.js';
import { hentBerikelse, _tømBerikelse, sammendragUrl, bildeinfoUrl } from '../src/api/opplevelserKilder.js';

const B = JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/berikelse.json', 'utf8'));
const opp = (navn, ekstra = {}) => ({ navn, hoved: ['kultur'], under: ['museum'], kat: [], kilder: [{ kilde: 'wikidata', sid: B[navn] && B[navn].qid }], luft: 300, ...ekstra });

describe('ingress fra Wikipedia', () => {
  it('første setning, med lenke til artikkelen (Ringve)', () => {
    const s = parseSammendrag(B['Ringve Musikkmuseum'].sammendrag);
    expect(s.tekst).toMatch(/^Ringve Musikkmuseum er Norges nasjonale museum for musikk og musikkinstrumenter/);
    expect(s.tekst.length).toBeLessThanOrEqual(162);
    expect(s.url).toMatch(/^https:\/\/no\.wikipedia\.org\/wiki\/Ringve/);
  });
  it('førsteSetning kutter ved setningsslutt, ellers ved ord med «…»', () => {
    expect(førsteSetning('Første setning. Andre setning.')).toBe('Første setning.');
    expect(førsteSetning('a '.repeat(200), 20)).toMatch(/^(a ){0,10}a? ?…$/);
    expect(førsteSetning('')).toBe('');
    expect(førsteSetning('Lokal badeplass.Vesletjern og området omkring er et svært viktig friluftsområde (A)')).toBe('Lokal badeplass.'); // ekte, Miljødirektoratet
  });
});

describe('bilde fra Commons — aldri uten fotograf og lisens', () => {
  it('fotograf (renset for HTML) og lisens for alle tre', () => {
    const r = parseBildeinfo(B['Ringve Musikkmuseum'].bildeinfo);
    expect(r.lisens).toBe('CC BY-SA 3.0');
    expect(r.fotograf).not.toMatch(/[<>]/);
    expect(r.url).toMatch(/^https:\/\/(thumb|upload)\.wikimedia\.org\//);
    expect(parseBildeinfo(B['Lilleputthammer'].bildeinfo).lisens).toBe('Public domain');
    expect(parseBildeinfo(B['Operahuset i Oslo'].bildeinfo).lisens).toBe('CC BY-SA 4.0');
  });
  it('mangler fotograf eller lisens: ikke noe bilde', () => {
    const uten = k => { const j = JSON.parse(JSON.stringify(B['Operahuset i Oslo'].bildeinfo)); const p = Object.values(j.query.pages)[0]; delete p.imageinfo[0].extmetadata[k]; if (k === 'Artist') delete p.imageinfo[0].extmetadata.Credit; return j; };
    expect(parseBildeinfo(uten('LicenseShortName'))).toBeNull();
    expect(parseBildeinfo(uten('Artist'))).toBeNull();
  });
});

describe('hvorfor — fast rekkefølge', () => {
  it('Wikipedia, så Wikidata, så Miljødirektoratet; ingenting når alt mangler', () => {
    const ingress = { tekst: 'X er et museum.', url: 'u' };
    expect(hvorforTekst(opp('X', { beskrivelse: { tekst: 'kunstmuseum', språk: 'nb' } }), { ingress })).toEqual({ tekst: 'X er et museum.', kilde: 'Tekst: Wikipedia' });
    expect(hvorforTekst(opp('X', { beskrivelse: { tekst: 'kunstmuseum', språk: 'nb' } }), null)).toEqual({ tekst: 'kunstmuseum', kilde: 'Wikidata' });
    expect(hvorforTekst(opp('X', { omraade: 'Skogområde syd for Bølerveien. Mer.' }), null)).toEqual({ tekst: 'Skogområde syd for Bølerveien.', kilde: 'Miljødirektoratet' });
    expect(hvorforTekst(opp('X'), null)).toBeNull();
  });
});

describe('henting', () => {
  it('to kall per vist opplevelse (artikkel + bilde), cachet per Wikidata-id; feiler ett, mangler bare den delen', async () => {
    _tømBerikelse();
    const r = B['Lilleputthammer'], kall = [];
    const hent = { json: async u => { kall.push(u); if (/commons/.test(u)) throw new Error('429'); return r.sammendrag; } };
    const o = opp('Lilleputthammer', { qid: r.qid, wikiTittel: r.tittel, bildeFil: r.bilde });
    const b = await hentBerikelse(o, { hent }); await hentBerikelse(o, { hent });
    expect(kall).toEqual([sammendragUrl(r.tittel), bildeinfoUrl(r.bilde)]);
    expect(b.ingress.tekst).toMatch(/^Lilleputthammer er en familiepark/);
    expect(b.bilde).toBeNull();
  });
  it('kortet bærer bilde, hvorfor og «Les mer»', () => {
    const r = B['Operahuset i Oslo'];
    const k = kortData(opp('Operahuset i Oslo'), null, [], { ingress: parseSammendrag(r.sammendrag), bilde: parseBildeinfo(r.bildeinfo) });
    expect(k.bilde.lisens).toBe('CC BY-SA 4.0');
    expect(k.hvorfor.kilde).toBe('Tekst: Wikipedia');
    expect(k.lesMer).toMatch(/wikipedia\.org\/wiki\/Operahuset/);
  });
});

describe('på skjermen: krediteringen står alltid ved bildet', () => {
  it('kildetekst: figcaption med «Foto:», lisens og Wikimedia Commons; «Les mer»; «Hele turen»', () => {
    const src = fs.readFileSync('src/views/ettBytteVisning.js', 'utf8');
    expect(src).toMatch(/<figcaption>Foto: ' \+ esc\(k\.bilde\.fotograf\)/);
    expect(src).toContain("' · Wikimedia Commons</figcaption>");
    expect(src).toContain('>Les mer</a>');
    expect(src).toContain('Hele turen:');
  });
});

describe('turrutebasens informasjon (sett live ved Ranheim)', async () => {
  const { infoNavn } = await import('../src/api/opplevelserKilder.js');
  const INFO = 'Angelskjæret badeplass - isbading om vinteren, med mulighet for varmestue hvis medlemskap. Populær badeplass for barnefamilier om sommeren. Meget begrenset parkeringsmuligheter.';
  it('navnet er det før « - »; resten er «hvorfor», med Kartverket som kilde', () => {
    expect(infoNavn(INFO)).toBe('Angelskjæret badeplass');
    const h = hvorforTekst({ navn: 'Angelskjæret badeplass', info: INFO, hoved: ['bading'], under: ['badeplass'] }, null);
    expect(h).toEqual({ tekst: 'Isbading om vinteren, med mulighet for varmestue hvis medlemskap.', kilde: 'Kartverket, turrutebasen' });
  });
});

describe('bildene blinker ikke (v1.218.316)', () => {
  it('<img> har decoding="sync" og ikke loading="lazy": tavla tegner på nytt hvert sekund', () => {
    const src = fs.readFileSync('src/views/ettBytteVisning.js', 'utf8');
    const i = src.indexOf('<figure class="eb-okort-bilde"><img'), tag = src.slice(i, src.indexOf('>', i + 40));
    expect(tag).toContain('decoding="sync"');
    expect(tag).not.toContain('loading="lazy"');
  });
});
