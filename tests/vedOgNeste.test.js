// «Jeg ønsker at auto-reise viser både «Du er ved» og «Neste stasjon».»
// Turopptaket (linje 3 mot Mortensrud, 2026-11-10): toget sto 2 m fra Brynseng kl. 16:06:41,
// rutetiden der (16:06:24) var passert, og appen sa bare «neste stopp Hellerud».
// Kallene under er Enturs (stasjonskoordinater og forventede tider fra opptaket); fiksene er
// STASJONENES koordinater (forskjøvet 30 m), ikke brukerens posisjoner.
import { describe, it, expect } from 'vitest';
import { vedOgNeste, nesteStopp, VED_STOPP_M } from '../src/api/ombord.js';
import { medVedOgNeste, vedNesteHtml } from '../src/views/auto.js';

const S = [
  ['6068', 'Helsfyr', 59.912678, 10.801443, '16:04:34'],
  ['6086', 'Brynseng', 59.909227, 10.812075, '16:06:24'],
  ['6140', 'Hellerud', 59.910065, 10.82985, '16:08:37'],
  ['5968', 'Godlia', 59.907148, 10.835914, '16:10:37'],
  ['5971', 'Skøyenåsen', 59.899003, 10.836647, '16:11:37'],
  ['5994', 'Oppsal', 59.89291, 10.840011, '16:13:37'],
  ['5847', 'Ulsrud', 59.889424, 10.849649, '16:14:37'],
];
const ts = hm => new Date('2026-11-10T' + hm + '+01:00').getTime();
const k = { nøkkel: 'RUT:ServiceJourney:298298f3', linje: '3', call: { serviceJourney: { estimatedCalls: S.map(([id, name, lat, lon, t]) => ({
  quay: { latitude: lat, longitude: lon, stopPlace: { id: 'NSR:StopPlace:' + id, name, latitude: lat, longitude: lon } },
  expectedArrivalTime: t, expectedDepartureTime: '2026-11-10T' + t + '+01:00' })) } } };
const ved = (i, acc = 5) => ({ lat: S[i][2] + 0.00027, lon: S[i][3], acc });

describe('du er ved + neste stasjon', () => {
  it('før-bildet: på Brynseng etter rutetiden sier tiden alene Hellerud', () => {
    expect(nesteStopp(k, ts('16:06:41')).name).toBe('Hellerud');
  });
  it('stående på Brynseng 16:06:41: ved Brynseng, neste Hellerud', () => {
    const r = vedOgNeste(k, ts('16:06:41'), ved(1));
    expect(r.ved.name).toBe('Brynseng');
    expect(r.neste.name).toBe('Hellerud');
  });
  it('toget før rutetiden (Godlia 16:09:30, 67 s tidlig): ved Godlia, neste Skøyenåsen', () => {
    const r = vedOgNeste(k, ts('16:09:30'), ved(3));
    expect(r.ved.name).toBe('Godlia');
    expect(r.neste.name).toBe('Skøyenåsen');
  });
  it('ved Oppsal og Ulsrud', () => {
    expect(vedOgNeste(k, ts('16:13:50'), ved(5)).ved.name).toBe('Oppsal');
    const u = vedOgNeste(k, ts('16:14:40'), ved(6));
    expect(u.ved.name).toBe('Ulsrud');
    expect(u.neste).toBe(null);
  });
  it('mellom Hellerud og Godlia: ingen «ved», forrige + neste', () => {
    const mid = { lat: (S[2][2] + S[3][2]) / 2, lon: (S[2][3] + S[3][3]) / 2, acc: 5 };
    const r = vedOgNeste(k, ts('16:09:40'), mid);
    expect(r.ved).toBe(null);
    expect(r.forrige.name).toBe('Hellerud');
    expect(r.neste.name).toBe('Godlia');
  });
  it('tidsvinduet skiller: ved stasjonen 10 min før toget er der, er du ikke «ved» det på turen', () => {
    expect(vedOgNeste(k, ts('15:56:24'), ved(1)).ved).toBe(null);
  });
  it('radiusen: 200 m fra stasjonen er ikke «ved»', () => {
    expect(VED_STOPP_M).toBeLessThan(200);
    const r = vedOgNeste(k, ts('16:06:41'), { lat: S[1][2] + 0.0018, lon: S[1][3], acc: 5 });
    expect(r.ved).toBe(null);
  });
  it('tavla og raden leser samme kilde: stoppet ER neste stasjon', () => {
    const p = medVedOgNeste({ k, linjer: ['3'], stop: { name: 'Hellerud-fra-tid' } }, ts('16:09:30'), ved(3));
    expect(p.stop.name).toBe('Skøyenåsen');
    const html = vedNesteHtml(p, ts('16:09:30'));
    expect(html).toContain('du er ved <b>Godlia</b>');
    expect(html).toContain('neste stasjon</span> <b>Skøyenåsen</b>');
  });
  it('uten tur: ingen rad, uendret', () => {
    expect(vedNesteHtml(null, 0)).toBe('');
    const fri = { linjer: ['3', '2'], stop: { name: 'X' } };
    expect(medVedOgNeste(fri, 0, null)).toBe(fri);
  });
});
