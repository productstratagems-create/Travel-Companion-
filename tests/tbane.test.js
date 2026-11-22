// v1.218.246: «Sjekk at appen også virker med T-bane.» Mortensrud T (linje 3
// mot Kolsås, plattform 1/2) ved siden av bussterminalen «Mortensrud».
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { reiseRader, kombiRader } from '../src/reiseTil.js';
import { plattformLinjer } from '../src/ui/stasjonslag.js';
import { stoppLinjerLapp, ruteAvgangerFra } from '../src/ui/stoppLapp.js';
import { avgangerFra, listeStoppKandidat, slåSammenKall } from '../src/views/auto.js';
import { sammenlignViktighet } from '../src/api/stops.js';
import { kortStedsnavn } from '../src/maalomrader.js';
import { zoomEtterFart, fartMedRo, stegNøkkel, stegRamme, FART_RO_MS } from '../src/kartSteg.js';
import { tavleRadHtml } from '../src/ui/tavleRad.js';
const T = Date.parse('2026-11-22T12:00:00+01:00'), M = 60_000, iso = m => new Date(T + m * M).toISOString();
const MT = { id: 'NSR:StopPlace:58404', name: 'Mortensrud T' }, MB = { id: 'NSR:StopPlace:6013', name: 'Mortensrud' };
const gå = (a, b) => ({ mode: 'foot', expectedStartTime: iso(a), expectedEndTime: iso(b) });
const metro = (a, b, fra, til) => ({ mode: 'metro', expectedStartTime: iso(a), expectedEndTime: iso(b), fromPlace: { name: fra, latitude: 59.849, longitude: 10.829 }, toPlace: { name: til }, serviceJourney: { line: { publicCode: '3', presentation: { colour: 'ec700c' } } } });
const buss = (k, a, b, fra, til) => ({ mode: 'bus', expectedStartTime: iso(a), expectedEndTime: iso(b), fromPlace: { name: fra }, toPlace: { name: til }, serviceJourney: { line: { publicCode: k } } });

describe('T-bane gjennom det som er bygget', () => {
  it('reiser til sentrum: T 3 direkte og 74 → T 3 er rader, T først i fakta', () => {
    const tps = [{ legs: [gå(0, 13), metro(13, 31, 'Mortensrud T', 'Jernbanetorget')] }, { legs: [gå(0, 3), buss('74', 3, 9, 'Stenbråten', 'Mortensrud T'), metro(11, 29, 'Mortensrud T', 'Jernbanetorget')] }];
    const r = reiseRader(tps, T, null);
    expect(r.map(x => x.linjer.map(l => l.kode).join('→'))).toEqual(['74→3', '3']);
    expect(r[1].linjer[0].modus).toBe('metro');
    expect(kombiRader(r)[0]).toMatchObject({ via: 'Mortensrud T' });
  });
  it('plattformene 1 og 2 på T-stasjonen, adskilt fra bussterminalen', () => {
    const k = (kode, linje, sid) => ({ quay: { publicCode: kode, stopPlace: { id: sid } }, serviceJourney: { line: { publicCode: linje } } });
    const m = plattformLinjer([k('1', '3', MT.id), k('2', '3', MT.id), k('E', '74', MB.id)], MB.id);
    expect(m.get(MT.id + '|1')).toEqual(['3']); expect(m.get(MT.id + '|2')).toEqual(['3']); expect(m.get(MB.id + '|E')).toEqual(['74']);
  });
  it('stopplappen og avgangene fra T-stasjonen', () => {
    const rader = [{ d: { lines: [{ code: '3' }] }, ms: T + 15 * M, call: { _fra: { id: MT.id } } }, { d: { lines: [{ code: '74' }] }, ms: T + 5 * M, call: {} }];
    const a = avgangerFra(rader, MT.id);
    expect(a.map(x => x.kode)).toEqual(['3']);
    expect(stoppLinjerLapp(a, 13, T)).toBe('<br><span class="stopp-linjer lapp-lang">3</span>');
    const deps = [{ _legs: [gå(0, 13), { ...metro(15, 33, 'Mortensrud T', 'Jernbanetorget'), line: { publicCode: '3' }, fromPlace: { quay: { stopPlace: { id: MT.id } } } }] }];
    expect(ruteAvgangerFra(deps, MT.id).map(x => x.kode)).toEqual(['3']);
  });
  it('overskriften kan følge lista til Mortensrud T', () => {
    const dir = (min, fra) => ({ calls: [{ ms: T + min * M, call: fra ? { _fra: { id: fra } } : {} }] });
    const k = listeStoppKandidat([dir(15, MT.id), dir(20, MT.id), dir(14), dir(25, MT.id), dir(30, MT.id)], MB.id, id => (id === MT.id ? 13 : 12), T);
    expect(k).toEqual({ id: MT.id, antall: 4, eget: 1 });
  });
  it('T + buss foran buss alene, uansett busslinjer', () => {
    expect(sammenlignViktighet({ moduser: ['metro', 'bus'], avgangerNå: 8, linjer: 2, plattformer: 2 }, { moduser: ['bus'], avgangerNå: 40, linjer: 6, plattformer: 6 })).toBeLessThan(0);
    expect(kortStedsnavn('Mortensrud T')).toBe('Mortensrud');
  });
  it('kartet om bord på T-banen: zoom 14 etter 8 s, nær avstigning 16', () => {
    expect(zoomEtterFart(18)).toBe(14);
    let s = fartMedRo(null, 4, 0); s = fartMedRo(s, 18, 1000); s = fartMedRo(s, 18, 1000 + FART_RO_MS);
    expect(s.zoom).toBe(14);
    expect(stegNøkkel('riding', { stopp: 2, sek: 300 })).toBe('nær-av');
    expect(stegRamme('nær-av', { du: { lat: 59.9, lon: 10.8 }, av: { lat: 59.91, lon: 10.75 } }).maks).toBe(16);
  });
  it('tunnel: ingen fart (null) bytter ikke zoom av seg selv', () => {
    let s = fartMedRo(null, 18, 0); s = fartMedRo(s, null, 1000); s = fartMedRo(s, null, 1000 + FART_RO_MS - 1);
    expect(s.zoom).toBe(14);
    // Hele tunnelen: ukjent fart er ikke gangfart — kartet skal ikke zoome inn til 17.
    s = fartMedRo(s, null, 1000 + 10 * FART_RO_MS);
    expect(s.zoom).toBe(14);
  });
  it('raden: T-merke, «gå om», og «fra Mortensrud T · 13 min å gå» når overskriften er terminalen', () => {
    const h = tavleRadHtml({ d: { frontText: 'Kolsås', lines: [{ code: '3', mode: 'metro', colour: 'ec700c' }] }, ms: T + 15 * M, call: { _fra: { name: 'Mortensrud T' } }, rekker: true, herNavn: 'Mortensrud', gang: 13, gåOm: 2 }, T, 0);
    expect(h).toMatch(/gå om<\/small>2<small>min/);
    expect(h).toMatch(/fra <b>Mortensrud T<\/b> · 13 min å gå/);
  });
  it('samme T-avgang ved to stoppesteder står én gang', () => {
    const k = (j, t) => ({ serviceJourney: { id: j }, expectedDepartureTime: iso(t) });
    expect(slåSammenKall([{ stopp: null, kall: [k('T3-1', 15)] }, { stopp: MT, kall: [k('T3-1', 15)] }])).toHaveLength(1);
  });
});

import { altModus } from '../src/views/auto.js';
describe('alternativets ikon (v1.218.246)', () => {
  it('en T-stasjon som alternativ tegnes som T-bane, ikke buss', () => {
    expect(altModus({ id: MT.id, name: 'Mortensrud T' }, [{ id: MT.id, name: 'Mortensrud T', modes: ['metro'] }])).toBe('metro');
    expect(altModus({ id: 'x', name: 'Ukjent' }, [])).toBe('bus');
  });
});
