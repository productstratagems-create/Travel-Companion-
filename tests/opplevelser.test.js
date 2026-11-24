/* OPPLEVELSESKATEGORIENE (v1.218.311). Verdiene er hentet fra ekte svar i
 * traceren (docs/tracer-opplevelser.md), ikke funnet på. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KATEGORIER, klassifiserOsm, klassifiserWikidata, klassifiserKartverket, klassifiserFriluft, erReisemål } from '../src/opplevelser.js';

describe('opplevelseskategori per kilde', () => {
  it('OSM: Lilleputthammer (tourism=theme_park) er en attraksjon; informasjonstavla ved Sognsvann er støy', () => {
    expect(klassifiserOsm({ name: 'Lilleputthammer', tourism: 'theme_park' }).kat).toEqual([{ kv: 'tourism=theme_park', k: 'attraksjon', u: 'fornøyelsespark', sterk: true }]);
    const tavle = klassifiserOsm({ name: 'Sognsvann 0,3 NØ', tourism: 'information' });
    expect(tavle.kat).toEqual([]); expect(tavle.støy).toEqual(['tourism=information']);
    expect(klassifiserOsm({ leisure: 'park', name: 'Rugdeberget park' }).kat[0].sterk).toBe(false); // nabolagspark: svak
  });
  it('Wikidata: Ringve Musikkmuseum (12 språk) er sterkt; holdeplass er aldri en topp; kirke krever 3 språk', () => {
    expect(klassifiserWikidata('museum|kulturminne', 12).some(t => t.k === 'kultur' && t.sterk)).toBe(true);
    expect(klassifiserWikidata('trikkestopp|tram stop', 4)).toEqual([]); // «Ljabru holdeplass | topp»
    expect(klassifiserWikidata('kirke|church building', 2)[0].sterk).toBe(false);
    expect(klassifiserWikidata('kirke|church building', 5)[0].sterk).toBe(true);
    expect(klassifiserWikidata('ås|hill', 1)[0].sterk).toBe(false); // importert fra Kartverket
  });
  it('Kartverket: Vann og Topp kategoriseres, men aldri sterkt alene; adressenavn ignoreres', () => {
    expect(klassifiserKartverket('Vann')).toEqual([{ kv: 'type:Vann', k: 'natur', u: 'vann', sterk: false }]);
    expect(klassifiserKartverket('Adressenavn')).toEqual([]);
  });
  it('Miljødirektoratet: utfartsområde er sterkt; «svært viktig» skolegård er ikke et reisemål', () => {
    expect(klassifiserFriluft('Utfartsområde', 'Svært viktig friluftslivsområde')[0]).toMatchObject({ k: 'friluftsliv', sterk: true });
    expect(klassifiserFriluft('Leke- og rekreasjonsområde', 'Svært viktig friluftslivsområde')[0].sterk).toBe(false); // «Uteområde Prinsdal skole»
    expect(klassifiserFriluft('Strandsone med tilhørende sjø og vassdrag', 'Viktig friluftslivsområde')[0]).toMatchObject({ k: 'bading', sterk: true });
  });
});

describe('erReisemål', () => {
  const kv = { kilde: 'kartverket', kat: klassifiserKartverket('Topp') };
  it('to uavhengige kilder holder; Wikidata med 1 språk er ikke uavhengig av Kartverket', () => {
    expect(erReisemål([kv, { kilde: 'wikidata', sitelinks: 1, kat: klassifiserWikidata('ås|hill', 1) }])).toBe(false); // «Fossholtet»
    expect(erReisemål([kv, { kilde: 'osm', kat: klassifiserOsm({ natural: 'water' }).kat }])).toBe(true);            // «Myravatnet»
    expect(erReisemål([{ kilde: 'osm', kat: klassifiserOsm({ tourism: 'viewpoint' }).kat }])).toBe(true);
    expect(erReisemål([])).toBe(false);
  });
  it('sju hovedkategorier, og traceren bruker denne modulen (én definisjon)', () => {
    expect(Object.keys(KATEGORIER)).toEqual(['friluftsliv', 'natur', 'severdighet', 'attraksjon', 'kultur', 'bading', 'park']);
    expect(readFileSync('scratchpad/tracerOpplevelser.mjs', 'utf8')).toContain("from '../src/opplevelser.js'");
  });
});
