import { describe, it, expect } from 'vitest';
import { profilSpørsmålHtml, vanligAvgang, groupDirections } from '../src/views/auto.js';
import { profilHtml } from '../src/views/settings.js';
import { avledProfil, slåSammen, vaneMatrise, hypoteseNå } from '../src/profil.js';

const MORT = { navn: 'Mortensrud', stopId: 'NSR:StopPlace:5687', lat: 59.8493, lon: 10.8297 };
const JBT = { navn: 'Jernbanetorget', stopId: 'NSR:StopPlace:3990', lat: 59.9122, lon: 10.7511 };
const HELSFYR = { navn: 'Helsfyr', stopId: 'NSR:StopPlace:6068', lat: 59.9127, lon: 10.8014 };
const tur = (fra, til, bucket, count, helg = false) => ({ fromName: fra.navn, fromStopId: fra.stopId, toName: til.navn,
  toStopId: til.stopId, toLat: til.lat, toLon: til.lon, bucket, isWeekend: helg, count });
const HIST = [tur(MORT, HELSFYR, 3, 18), tur(HELSFYR, MORT, 8, 15), tur(MORT, JBT, 6, 5, true), tur(JBT, MORT, 10, 4, true)];
const p = slåSammen(null, avledProfil(HIST));
const m = vaneMatrise(HIST, p);

describe('profilen i grensesnittet', () => {
  it('spørsmålet: ja / nei / senere', () => {
    const html = profilSpørsmålHtml({ tekst: 'Bor du ved Mortensrud?' });
    expect(html).toContain('Bor du ved Mortensrud?');
    expect(html).toMatch(/profil-ja.*profil-nei.*profil-senere/s);
    expect(profilSpørsmålHtml(null)).toBe('');
  });
  it('«min profil»: hjem, jobb og cellene, med kilde', () => {
    const html = profilHtml(p, m);
    expect(html).toContain('Mortensrud · foreslått');
    expect(html).toContain('Helsfyr · foreslått');
    expect(html).toContain('hverdager, morgen');
    expect(html).toContain('hjem → jobb (18 reiser)');
    expect(html).toContain('helg, midt på dagen');
    expect(html).toContain('hjem → sentrum (5 reiser)');
  });
  it('lørdag 12 hjemme: forslaget er sentrum, og avgangen er den som når sentrum', () => {
    const nå = new Date('2026-11-14T12:10:00').getTime();
    const h = hypoteseNå(p, m, nå, MORT);
    expect(h.toName).toBe('sentrum');
    const iso = min => new Date(nå + min * 60000).toISOString();
    const c = (min, front, siste) => ({ expectedDepartureTime: iso(min), destinationDisplay: { frontText: front }, quay: { publicCode: '2' },
      serviceJourney: { line: { id: 'L3', publicCode: '3' }, estimatedCalls: [{ quay: { stopPlace: { name: 'Mortensrud' } } },
        { quay: { stopPlace: { name: siste.navn, latitude: siste.lat, longitude: siste.lon } }, expectedArrivalTime: iso(min + 20) }] } });
    const dirs = groupDirections([c(5, 'Helsfyr', HELSFYR), c(8, 'Kolsås', JBT)], nå);
    const hit = vanligAvgang(dirs, h, 'Mortensrud', 2, nå);
    expect(hit.stop.name).toBe('Jernbanetorget');
  });
});
