// v1.218.199: «Posisjonering og adresse korresponderer ikke.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { velgAdresse, reverseUrl, ADRESSE_HER_M } from '../src/api/stedNavn.js';

const N = 59.85, Ø = 10.83, DL = 1 / 111320, DO = 1 / (111320 * Math.cos(N * Math.PI / 180));
const punkt = { lat: N, lon: Ø };
const f = (navn, nord, øst) => ({ properties: { name: navn }, geometry: { coordinates: [Ø + øst * DO, N + nord * DL] } });

describe('velgAdresse', () => {
  it('før-bildet: første treff ble tatt — nå det nærmeste', () => {
    expect(velgAdresse([f('Langt unna 1', 90, 0), f('Stenbråtveien 14', 5, 0)], punkt)).toBe('Stenbråtveien 14');
  });
  it('ikke der nåla står: «nær …»', () => {
    expect(velgAdresse([f('Stenbråtveien 14', ADRESSE_HER_M + 20, 0)], punkt)).toBe('nær Stenbråtveien 14');
  });
  it('for langt unna eller ingen: null (skjermen sier «nær <stopp>»)', () => {
    expect(velgAdresse([f('Fjernt 2', 400, 0)], punkt)).toBe(null);
    expect(velgAdresse([], punkt)).toBe(null);
  });
  it('spør for punktet, bare adresser, flere treff', () => {
    const u = reverseUrl(punkt);
    expect(u).toMatch(/layers=address&/); expect(u).toMatch(/size=5/);
    expect(readFileSync('src/api/stedNavn.js', 'utf8')).toMatch(/const nøkkel = ll => ll\.lat\.toFixed\(5\)/);
  });
});

import { velgGeonorge, geonorgeUrl, stedNavn, _resetStedNavn } from '../src/api/stedNavn.js';
describe('Kartverkets adresseregister først (v1.218.200)', () => {
  const svar = { adresser: [
    { adressetekst: 'Stenbråtveien 16', representasjonspunkt: { lat: N + 40 * DL, lon: Ø } },
    { adressetekst: 'Stenbråtveien 14', representasjonspunkt: { lat: N + 4 * DL, lon: Ø } },
  ] };
  it('veinavn og husnummer: den nærmeste', () => {
    expect(velgGeonorge(svar, punkt)).toBe('Stenbråtveien 14');
  });
  it('uten adressetekst: navn + nummer + bokstav', () => {
    expect(velgGeonorge({ adresser: [{ adressenavn: 'Stenbråtveien', nummer: 14, bokstav: 'B', representasjonspunkt: { lat: N, lon: Ø } }] }, punkt)).toBe('Stenbråtveien 14B');
  });
  it('punktsøk med radius og WGS84', () => {
    expect(geonorgeUrl(punkt)).toMatch(/^https:\/\/ws\.geonorge\.no\/adresser\/v1\/punktsok\?lat=59\.85&lon=10\.83&radius=\d+&treffPerSide=5&koordsys=4258&utkoordsys=4258$/);
  });
  it('Kartverket svarer ikke: Entur som før', async () => {
    _resetStedNavn();
    const ok = j => Promise.resolve({ ok: true, json: () => Promise.resolve(j) });
    let navn;
    stedNavn(punkt, () => { navn = stedNavn(punkt); }, {
      geonorge: () => Promise.reject(new Error('nede')),
      entur: () => ok({ features: [f('Entur-veien 2', 3, 0)] }),
    });
    await new Promise(r => setTimeout(r, 10));
    expect(navn).toBe('Entur-veien 2');
  });
  it('Kartverket svarer: Entur spørres ikke', async () => {
    _resetStedNavn();
    let entur = 0, navn;
    stedNavn(punkt, () => { navn = stedNavn(punkt); }, {
      geonorge: () => Promise.resolve({ ok: true, json: () => Promise.resolve(svar) }),
      entur: () => { entur++; return Promise.resolve({ ok: false }); },
    });
    await new Promise(r => setTimeout(r, 10));
    expect(navn).toBe('Stenbråtveien 14'); expect(entur).toBe(0);
  });
});

import { stedMåling, målingLinje } from '../src/api/stedNavn.js';
import { målingTekst } from '../src/ui/stedKart.js';
describe('målerunden (v1.218.201)', () => {
  const tekstSvar = (status, j) => Promise.resolve({ ok: status === 200, status, text: () => Promise.resolve(typeof j === 'string' ? j : JSON.stringify(j)) });
  const kvSvar = { adresser: [{ adressetekst: 'Stenbråtveien 14', meterDistanseTilPunkt: 4.2, representasjonspunkt: { lat: N + 4 * DL, lon: Ø } }] };
  const kjør = async deps => { _resetStedNavn(); stedNavn(punkt, null, deps); await new Promise(r => setTimeout(r, 10)); return stedMåling(punkt); };
  it('Kartverket svarer: kilde, nærmeste med avstand (regnet og oppgitt), feltnavn, råsvar', async () => {
    const m = await kjør({ geonorge: () => tekstSvar(200, kvSvar), entur: () => tekstSvar(500, '') });
    expect(m.valg).toMatchObject({ kilde: 'kartverket', navn: 'Stenbråtveien 14', m: 4 });
    expect(m.kartverket.nærmeste[0]).toMatchObject({ navn: 'Stenbråtveien 14', m: 4, mOppgitt: 4 });
    expect(m.kartverket.felter).toEqual(['adressetekst', 'meterDistanseTilPunkt', 'representasjonspunkt']);
    expect(m.kartverket.rå).toMatch(/Stenbråtveien 14/);
    expect(m.entur).toBe(null);
    expect(målingLinje(m)).toBe('Kartverket · Stenbråtveien 14 · 4 m');
  });
  it('Kartverket feiler: feilen står, Entur tar over', async () => {
    const m = await kjør({ geonorge: () => Promise.reject(Object.assign(new Error('x'), { name: 'TimeoutError' })), entur: () => tekstSvar(200, { features: [f('Entur-veien 2', 3, 0)] }) });
    expect(m.kartverket.feil).toBe('tidsavbrudd');
    expect(målingLinje(m)).toBe('Kartverket svarte ikke (tidsavbrudd) → Entur · Entur-veien 2 · 3 m');
  });
  it('annen form enn dokumentert: feltnavnene viser det', async () => {
    const m = await kjør({ geonorge: () => tekstSvar(200, { adresser: [{ tekst: 'X 1', punkt: [1, 2] }] }), entur: () => tekstSvar(200, { features: [] }) });
    expect(m.kartverket.felter).toEqual(['tekst', 'punkt']);
    expect(m.valg.kilde).toBe('ingen');
    expect(målingTekst(punkt, m, målingLinje(m))).toMatch(/felter: tekst, punkt/);
  });
});
