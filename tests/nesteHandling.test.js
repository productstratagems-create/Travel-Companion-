// Skjermbilde 17:26: «NESTE REISE trolig mot Jernbanetorget · i morgen tidlig, mellom 06 og 08 ·
// 11 reiser … · takk, husket» — fire linjer over kartet, om en reise 13 timer fram.
// Jobben: «når jeg må gå, og hvilken avgang tar meg dit jeg pleier».
import { describe, it, expect } from 'vitest';
import { clk } from '../src/ui/fmt.js';
import { tilstand, NÆR_FØR_MIN } from '../src/nesteReise.js';
import { nesteReiseHtml, vanligAvgang, groupDirections } from '../src/views/auto.js';

const ts = s => new Date('2026-11-1' + s + '+01:00').getTime();
const h = { toName: 'Jernbanetorget', fra: ts('1T06:00:00'), til: ts('1T08:00:00'), bucket: 3, helg: false,
  antall: 11, sagt: 1, retning: 'nordvest', tekst: 'i morgen tidlig, mellom 06 og 08' };
const kall = (navn, t) => ({ quay: { stopPlace: { id: 'NSR:' + navn, name: navn } }, expectedArrivalTime: t, aimedArrivalTime: t });
const avgang = (kl, front, via) => ({
  expectedDepartureTime: '2026-11-11T' + kl + ':00+01:00', aimedDepartureTime: '2026-11-11T' + kl + ':00+01:00',
  destinationDisplay: { frontText: front }, quay: { publicCode: '2', name: 'Mortensrud' },
  serviceJourney: { line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro', presentation: { colour: 'EC700C', textColour: 'FFFFFF' } },
    estimatedCalls: [kall('Mortensrud', '2026-11-11T' + kl + ':00+01:00'), ...via] } });
const t3 = kl => avgang(kl, 'Kolsås', [kall('Helsfyr', '2026-11-11T' + kl.replace(/:(\d\d)/, (m, x) => ':' + String(+x + 15).padStart(2, '0')) + ':00+01:00'),
  kall('Jernbanetorget', '2026-11-11T' + kl.replace(/:(\d\d)/, (m, x) => ':' + String(+x + 21).padStart(2, '0')) + ':00+01:00')]);
const nå = ts('1T06:10:00');
const dirs = groupDirections([t3('06:12'), t3('06:27'), avgang('06:14', 'Skullerud', [kall('Bøler', '2026-11-11T06:20:00+01:00')])], nå);

describe('neste reise: handlingen, når den er nær', () => {
  it('17:26 dagen før: «senere», og ingenting på skjermen', () => {
    const kveld = ts('0T17:26:00');
    expect(tilstand(h, kveld)).toBe('senere');
    expect(nesteReiseHtml(h, false, { nå: kveld })).toBe('');
  });
  it('fra NÆR_FØR_MIN før vinduet: «nær»', () => {
    expect(NÆR_FØR_MIN).toBe(60);
    expect(tilstand(h, ts('1T05:01:00'))).toBe('nær');
    expect(tilstand(h, ts('1T04:59:00'))).toBe('senere');
    expect(tilstand(h, ts('1T08:00:00'))).toBe('senere');
  });
  it('avgangen du rekker med gangtiden, som stopper ved målet', () => {
    expect(vanligAvgang(dirs, h, 'Mortensrud', 1, nå).ride.ms).toBe(ts('1T06:12:00'));
    // 9 min gange: 06:12 rekkes ikke, 06:27 er neste.
    const hit = vanligAvgang(dirs, h, 'Mortensrud', 9, nå);
    expect(hit.ride.ms).toBe(ts('1T06:27:00'));
    expect(hit.stop.name).toBe('Jernbanetorget');
  });
  it('kortet: linje, klokkeslett, spor, når du må gå, framme', () => {
    const hit = vanligAvgang(dirs, h, 'Mortensrud', 9, nå);
    const html = nesteReiseHtml(h, false, { nå, hit, walkMins: 9 });
    expect(html).toContain('til <b>Jernbanetorget</b>');
    expect(html).toContain('kl ' + clk(ts('1T06:27:00')) + ' fra spor 2');
    expect(html).toContain('gå om 8 min');
    expect(html).toContain('framme ' + clk(ts('1T06:48:00')));
    // Bekreftet: ingen «takk, husket», ingen grunnlag, ingen knapper.
    expect(html).not.toContain('takk');
    expect(html).not.toContain('stemmer');
  });
  it('ubekreftet: én linje med «stemmer / nei»', () => {
    const html = nesteReiseHtml({ ...h, sagt: 0 }, false, { nå, hit: null });
    expect(html).toContain('stemmer');
    expect(html).toContain('ingen avgang herfra går dit');
  });
});
