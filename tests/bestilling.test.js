// v1.218.256: fleksible linjer — turer som må bestilles, merkes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { lesBestilling, bestillTekst, bestillingGql, bestillingFor, _resetBestilling } from '../src/api/bestilling.js';
import { tavleRadHtml } from '../src/ui/tavleRad.js';
const svar = { data: { stopPlace: { estimatedCalls: [
  { serviceJourney: { id: 'SJ:FLEX:1' }, bookingArrangements: { bookingMethods: ['callOffice', 'online'], latestBookingTime: '14:00:00', bookingContact: { phone: '73 85 00 00', url: 'https://bestill.example' } } },
  { serviceJourney: { id: 'SJ:VANLIG:2' }, bookingArrangements: null },
] } } };
describe('turer som må bestilles', () => {
  beforeEach(() => _resetBestilling());
  it('leser bare turene med bestilling', () => {
    const m = lesBestilling(svar);
    expect([...m.keys()]).toEqual(['SJ:FLEX:1']);
    expect(bestillTekst(m.get('SJ:FLEX:1'))).toBe('bestilles · ring 73 85 00 00 · innen 14:00');
    expect(bestillTekst({ metoder: ['online'], frist: null })).toBe('bestilles · i app/nett');
  });
  it('raden sier det; en vanlig tur sier ingenting', () => {
    const rad = b => tavleRadHtml({ d: { frontText: 'Bygdekrysset', lines: [{ code: '540', mode: 'bus' }] }, ms: Date.now() + 30 * 60000, call: {}, rekker: true, bestill: b }, Date.now(), 0);
    expect(rad(lesBestilling(svar).get('SJ:FLEX:1'))).toMatch(/at-bestill">bestilles · ring 73 85 00 00 · innen 14:00/);
    expect(rad(null)).not.toMatch(/at-bestill/);
  });
  it('probe: et avvist felt slår av spørsmålet, uten å velte noe', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ errors: [{ message: 'Unknown field bookingArrangements' }] }) }));
    expect(bestillingFor('NSR:StopPlace:1')).toBe(undefined);
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    expect(bestillingFor('NSR:StopPlace:2')).toBe(undefined);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(bestillingGql('X')).toMatch(/bookingArrangements \{ bookingMethods latestBookingTime bookingNote bookingContact \{ phone url \} \}/);
  });
});
