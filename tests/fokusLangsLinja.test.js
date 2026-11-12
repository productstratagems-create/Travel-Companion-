// «fokusere dette viewet på gjeldende stasjon … neste stasjon, med et valg for bruker om å "gå" til
// neste for å se hvilke overganger som er der, og med en "vei" tilbake» (v1.218.47).
import { describe, it, expect } from 'vitest';
import { stoppEtterId } from '../src/api/ombord.js';
import { medVedOgNeste, fokusNavHtml, vedNesteHtml, justerFokus } from '../src/views/auto.js';

const S = [
  ['6068', 'Helsfyr', 59.912678, 10.801443, '16:04:34'], ['6086', 'Brynseng', 59.909227, 10.812075, '16:06:24'],
  ['6140', 'Hellerud', 59.910065, 10.82985, '16:08:37'], ['5968', 'Godlia', 59.907148, 10.835914, '16:10:37'],
  ['5971', 'Skøyenåsen', 59.899003, 10.836647, '16:11:37'], ['5994', 'Oppsal', 59.89291, 10.840011, '16:13:37'],
];
const ts = hm => new Date('2026-11-10T' + hm + '+01:00').getTime();
const k = { call: { serviceJourney: { estimatedCalls: S.map(([id, name, lat, lon, t]) => ({
  quay: { stopPlace: { id: 'NSR:StopPlace:' + id, name, latitude: lat, longitude: lon } },
  expectedArrivalTime: '2026-11-10T' + t + '+01:00', expectedDepartureTime: '2026-11-10T' + t + '+01:00' })) } } };
const NÅ = ts('16:06:41');
const VED = { lat: S[1][2] + 0.00027, lon: S[1][3], acc: 5 };   // på Brynseng
const p = n => medVedOgNeste({ k, linjer: ['3'] }, NÅ, VED, n);

describe('bla langs linja om bord', () => {
  it('stoppEtterId: stasjon nr. n etter neste', () => {
    expect(stoppEtterId(k, 'NSR:StopPlace:6140', 2, NÅ).name).toBe('Skøyenåsen');
    expect(stoppEtterId(k, 'NSR:StopPlace:6140', 9, NÅ)).toBe(null);
  });
  it('fokus 0: neste stasjon; tavla viser den; ingen «tilbake»', () => {
    const r = p(0);
    expect(r.stop.name).toBe('Hellerud');
    expect(r.neste.name).toBe('Hellerud');
    expect(r.fokusForrige).toBe(null);
    expect(r.fokusEtter.name).toBe('Godlia');
    const h = fokusNavHtml(r, NÅ);
    // Rollen står alt i raden over («neste stasjon Hellerud»).
    expect(h).not.toContain('neste stasjon');
    expect(h).not.toContain('fokus-tilbake');
  });
  it('fokus 2: Skøyenåsen; «neste stasjon» er fortsatt Hellerud; vei tilbake', () => {
    const r = p(2);
    expect(r.stop.name).toBe('Skøyenåsen');
    expect(vedNesteHtml(r, NÅ)).toContain('neste stasjon</span> <b>Hellerud</b>');
    const h = fokusNavHtml(r, NÅ);
    expect(h).toContain('om 3 stasjoner');
    expect(h).toContain('‹ Godlia');
    expect(h).toContain('Oppsal ›');
    expect(h).toContain('↩ tilbake til neste stasjon, Hellerud');
  });
  it('forbi endestasjonen: stopper der, uten pil videre', () => {
    const r = p(20);
    expect(r.stop.name).toBe('Oppsal');
    expect(r.fokusEtter).toBe(null);
  });
  it('toget passerer en stasjon: fokuset følger (én nærmere), og blir neste igjen', () => {
    expect(justerFokus(2, 'NSR:StopPlace:6140', 'NSR:StopPlace:5968')).toBe(1);
    expect(justerFokus(1, 'NSR:StopPlace:5968', 'NSR:StopPlace:5971')).toBe(0);
    expect(justerFokus(0, 'NSR:StopPlace:5968', 'NSR:StopPlace:5971')).toBe(0);
    expect(justerFokus(2, 'NSR:StopPlace:6140', 'NSR:StopPlace:6140')).toBe(2);
  });
});
