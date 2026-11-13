// Rapportert (skjermbilde 08:49): brukeren hadde startet en reise Mortensrud → Jernbanetorget, men
// auto-reise sa «dit du ofte skal», viste avgangene fra stoppet og sa ikke hvor mange stasjoner
// det var igjen (v1.218.52).
import { describe, it, expect } from 'vitest';
import { reiseAktiv, stasjonerIgjen, reiseKortHtml, avstigningHtml, fokusNavHtml } from '../src/views/auto.js';

const T = Date.parse('2026-11-13T08:49:00+01:00');
const iso = m => new Date(T + m * 60000).toISOString();
const NAVN = ['Mortensrud', 'Skullerud', 'Bogerud', 'Bøler', 'Ulsrud', 'Oppsal', 'Skøyenåsen', 'Godlia', 'Hellerud', 'Brynseng', 'Helsfyr', 'Ensjø', 'Tøyen', 'Grønland', 'Jernbanetorget'];
const k = { nøkkel: 'SJ3', linje: '3', call: { serviceJourney: { estimatedCalls: NAVN.map((n, i) => ({
  quay: { stopPlace: { id: 'NSR:' + n, name: n } }, expectedArrivalTime: iso(i * 2), expectedDepartureTime: iso(i * 2) })) } } };
const jny = { dest: 'Jernbanetorget', arrival: { time: T + 24 * 60000, clk: '09:13' }, lineCode: '3', legs: [{ journeyId: 'SJ3' }] };

describe('din reise', () => {
  it('aktiv bare når låsen er reisens tur', () => {
    expect(reiseAktiv(jny, { k }, 'SJ3')).toMatchObject({ dest: 'Jernbanetorget', linje: '3' });
    expect(reiseAktiv(jny, { k: { ...k, nøkkel: 'ANNEN' } }, 'SJ3')).toBe(null);
    expect(reiseAktiv(null, { k }, 'SJ3')).toBe(null);
    expect(reiseAktiv(jny, null, 'SJ3')).toBe(null);
  });
  it('stasjoner igjen: Mortensrud → Jernbanetorget er 14', () => {
    expect(stasjonerIgjen(k, 'NSR:Mortensrud', 'Jernbanetorget', T)).toBe(14);
    expect(stasjonerIgjen(k, 'NSR:Grønland', 'Jernbanetorget', T + 26 * 60000)).toBe(1);
    expect(stasjonerIgjen(k, 'NSR:Mortensrud', 'Kolsås', T)).toBe(null);
  });
  it('kortet: «din reise», bli sittende, framme, antall', () => {
    const h = reiseKortHtml(reiseAktiv(jny, { k }, 'SJ3'), 14);
    expect(h).toContain('din reise');
    expect(h).toContain('Jernbanetorget');
    expect(h).toContain('bli sittende på 3 · 14 stasjoner igjen');
    expect(h).not.toContain('dit du ofte skal');
  });
  it('avstigning: igjen, neste, her', () => {
    const r = reiseAktiv(jny, { k }, 'SJ3');
    expect(avstigningHtml(r, 14)).toMatch(/går av på Jernbanetorget .* · 14 stasjoner igjen/);
    expect(avstigningHtml(r, 1)).toContain('neste: gå av på Jernbanetorget');
    expect(avstigningHtml(r, 0)).toContain('gå av her');
  });
  it('blar du til målet: «gå av her»', () => {
    const p = { k, stop: { name: 'Jernbanetorget', at: T + 28 * 60000 }, neste: { name: 'Skullerud' }, base: { name: 'Mortensrud' },
      ved: { name: 'Mortensrud' }, fokusN: 14, fokusForrige: { name: 'Grønland' }, fokusEtter: null };
    expect(fokusNavHtml(p, T, 'Jernbanetorget')).toContain('gå av her');
    expect(fokusNavHtml(p, T, null)).not.toContain('gå av her');
  });
});
