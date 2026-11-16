import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ankomstMs } from '../src/ankomst.js';
import { clk } from '../src/ui/fmt.js';
import { reiseAktiv, avstigningHtml, vedNesteHtml, linjeHodeHtml, utenEgetTog } from '../src/views/auto.js';

// Rapportert 09:03 på 3 mellom Oppsal og Skøyenåsen, til Jernbanetorget.
// Stripa sa «ANK 09:19»; kortet og hodet sa ingen tid.
const ISO = '2026-11-16T09:19:00+01:00';
const jny = { dest: 'Jernbanetorget', lineCode: '3', frontText: 'Stortinget', arrival: { time: ISO, clk: '09:19' },
  legs: [{ journeyId: 'SJ1' }] };
const lås = { k: { nøkkel: 'SJ1', linje: '3', front: 'Stortinget' }, kilde: 'valgt' };

describe('om bord: hver opplysning ett sted (v1.218.69)', () => {
  it('ankomsten er ett tall, også når Entur sender den som tekst', () => {
    expect(ankomstMs(jny)).toBe(Date.parse(ISO));
    expect(ankomstMs({ arrival: { time: Date.parse(ISO) } })).toBe(Date.parse(ISO));
    expect(ankomstMs({})).toBeNull();
  });
  it('hodet sier ankomsttiden stripa sier', () => {
    const r = reiseAktiv(jny, lås, null);
    expect(r.ank).toBe(Date.parse(ISO));
    expect(avstigningHtml(r, 8)).toContain('Jernbanetorget · ' + clk(Date.parse(ISO)) + ' · 8 stasjoner igjen');
  });
  it('stripa og hodet leser samme kilde', () => {
    expect(fs.readFileSync('src/ui/chip.js', 'utf8')).toMatch(/ankomstMs\(/);
  });
  it('linje og retning øverst', () => {
    expect(linjeHodeHtml(lås, jny)).toMatch(/mot Stortinget/);
    expect(linjeHodeHtml(null, jny)).toBe('');
  });
  it('neste stasjon med klokkeslett, og «nå» bare når det er nå', () => {
    const nå = Date.parse('2026-11-16T09:03:00+01:00');
    const p = { k: {}, stop: { name: 'Skøyenåsen', at: nå + 60000 }, forrige: { name: 'Oppsal' } };
    expect(vedNesteHtml(p, nå)).toContain('Skøyenåsen</b> · ' + clk(nå + 60000));
    expect(vedNesteHtml({ ...p, stop: { name: 'Skøyenåsen', at: nå + 10000 } }, nå)).toMatch(/· nå/);
  });
  it('toget du sitter på er ikke en avgang du skal rekke', () => {
    const d = (front, ids) => ({ frontText: front, calls: ids.map(id => ({ call: { serviceJourney: { id } } })) });
    expect(utenEgetTog([d('Stortinget', ['SJ1', 'SJ2']), d('Kolsås', ['SJ9'])], 'SJ1').map(x => x.frontText)).toEqual(['Kolsås']);
    expect(utenEgetTog([d('Stortinget', ['SJ1'])], null)).toHaveLength(1);
  });
});
