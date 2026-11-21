import { describe, it, expect, beforeEach } from 'vitest';
import { omrProbe, _resetOmrProbe, lesJp, lesGeokoder, lesStedsnavn, lesKommune, jpProbeGql } from '../src/api/omrProbe.js';
const ok = j => Promise.resolve({ ok: true, json: () => Promise.resolve(j) });
const OMR = [{ tekst: 'mot Lørenskog', fjern: { id: 'NSR:StopPlace:1', name: 'Lørenskog', lat: 59.927, lon: 10.964 } }];
describe('proben for målområdenes navn (v1.218.214)', () => {
  beforeEach(() => _resetOmrProbe());
  it('dokumentert form: feltene står i loggen', async () => {
    const l = [];
    await omrProbe('NSR:StopPlace:9', OMR, t => l.push(t), {
      jp: () => ok({ data: { s0: { name: 'Mortensrud', weighting: 'preferredInterchange', transportMode: ['metro'], tariffZones: [{ id: 'RUT:TariffZone:1', name: '1' }], estimatedCalls: [{ destinationDisplay: { frontText: 'Kolsås', via: ['Helsfyr'] }, serviceJourney: { line: { publicCode: '3', name: 'Mortensrud - Kolsås' } } }] } } }),
      hent: u => ok(u.includes('stedsnavn') ? { navn: [{ stedsnavn: [{ skrivemåte: 'Lørenskog' }], navneobjekttype: 'Tettsted', meterFraPunkt: 120 }] }
        : u.includes('kommuneinfo') ? { kommunenavn: 'Lørenskog', fylkesnavn: 'Akershus' }
        : { features: [{ properties: { borough: null, locality: 'Lørenskog', county: 'Akershus', category: ['onstreetBus'] } }] }),
    });
    const alt = l.join('\n');
    expect(alt).toMatch(/weighting=preferredInterchange/);
    expect(alt).toMatch(/via=Helsfyr/);
    expect(alt).toMatch(/kommune=Lørenskog fylke=Akershus/);
    expect(alt).toMatch(/Lørenskog\(Tettsted 120m\)/);
    expect(alt).toMatch(/bydel=∅ kommune=Lørenskog/);
  });
  it('feil og manglende felt sies, ikke stillhet', async () => {
    const l = [];
    await omrProbe('X', OMR, t => l.push(t), {
      jp: () => ok({ errors: [{ message: 'Field "weighting" undefined' }] }),
      hent: u => (u.includes('stedsnavn') ? Promise.reject(Object.assign(new Error('x'), { name: 'TimeoutError' })) : Promise.resolve({ ok: false, status: 404 })),
    });
    const alt = l.join('\n');
    expect(alt).toMatch(/FEIL: Field "weighting" undefined/);
    expect(alt).toMatch(/stedsnavn.*tidsavbrudd/);
    expect(alt).toMatch(/kommune.*HTTP 404/);
  });
  it('én gang per stopp per økt', async () => {
    let n = 0; const jp = () => { n++; return ok({ data: {} }); };
    await omrProbe('A', [], () => {}, { jp }); await omrProbe('A', [], () => {}, { jp });
    expect(n).toBe(1);
  });
  it('spørringen ber om feltene', () => {
    const q = jpProbeGql(['A']);
    ['weighting', 'transportSubmode', 'tariffZones', 'via'].forEach(f => expect(q).toContain(f));
    expect(lesStedsnavn({ foo: 1 })).toMatch(/ingen treff felt=foo/);
    expect(lesGeokoder({ features: [] })).toBe('ingen treff');
    expect(lesKommune(null)).toBe('intet svar');
    expect(lesJp(null)).toBe('intet svar');
  });
});
