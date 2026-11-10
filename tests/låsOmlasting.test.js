// Turopptaket 2026-11-10: låsen holdt (linje 3, «valgt») fra Mortensrud til Bøler. 08:50:40 stopper
// opptaket; feilsøkingsloggen starter 08:50:46 med oppstartslinjer. Appen ble lastet på nytt, låsen
// lå bare i minnet, og appen falt til nærmeste stopp: Olav Nygards veg (buss).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { lagreLås, hentLås } from '../src/api/ombordLagring.js';

beforeEach(() => localStorage.clear());
const T = new Date('2026-11-10T08:50:40+01:00').getTime();
const call = { serviceJourney: { id: 'RUT:ServiceJourney:4e41', line: { publicCode: '3' }, estimatedCalls: [
  { expectedArrivalTime: '2026-11-10T08:53:16+01:00', quay: { stopPlace: { id: 'B', name: 'Bøler' } } },
  { expectedArrivalTime: '2026-11-10T09:13:16+01:00', quay: { stopPlace: { id: 'S', name: 'Stortinget' } } }] } };
const lås = { k: { nøkkel: 'RUT:ServiceJourney:4e41', linje: '3', call }, kilde: 'valgt', stilleFra: null };

describe('låsen overlever en omlasting', () => {
  it('lagret og hentet: samme tur og samme kilde', () => {
    lagreLås(lås, T);
    const h = hentLås(T + 6000);
    expect(h.kilde).toBe('valgt');
    expect(h.call.serviceJourney.id).toBe('RUT:ServiceJourney:4e41');
  });
  it('ikke etter at turen er over', () => {
    lagreLås(lås, T);
    expect(hentLås(new Date('2026-11-10T09:30:00+01:00').getTime())).toBe(null);
  });
  it('sluppet lås slettes', () => {
    lagreLås(lås, T); lagreLås(null, T);
    expect(hentLås(T)).toBe(null);
  });
  it('lagrer ingen posisjon, følger profilen', () => {
    lagreLås(lås, T);
    const rå = localStorage.getItem('default::t.ombordLås');
    expect(rå).not.toMatch(/"lat"|"lon"|spor|forventet/);
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.ombordLås',");
  });
  it('auto-reise henter låsen ved oppstart og lagrer den når den endres', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toContain('const h = hentLås(nå);');
    expect(a).toContain('lagreLås(_lås, nå);');
  });
});
