// Neste side spør med de samme feltene som første henting.
//
// Rapportert kl. 21:54, Mortensrud → Jernbanetorget: lista sluttet ved 00:33
// med «det er alt Entur har herfra». Neste side spurte uten `searchWindow`,
// og fra 00:34 ga Entur bare 00:33 én gang til (målt). Med søkevinduet: 12
// reiser, fra 03:59.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
vi.mock('../src/geo.js', () => ({ loadWalkSpeed: () => 'middels' }));
vi.mock('../src/api/adapt.js', () => ({ quayLatLon: () => null }));
const fetchMock = vi.fn();
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => fetchMock(...a) }));
const { fetchTripPage, _tripFlagg, _resetWindowProbe, _resetCoachProbe, _resetInnstilteProbe,
  _resetBytteProbe, _resetIderProbe, _resetAffectsProbe } = await import('../src/api/entur.js');

const ok = () => Promise.resolve({ ok: true, status: 200,
  json: () => Promise.resolve({ data: { trip: { tripPatterns: [] } } }) });
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };
const DIR = { stopId: 'NSR:StopPlace:58228', toStopId: 'NSR:StopPlace:58366' };

beforeEach(() => {
  fetchMock.mockReset(); fetchMock.mockImplementation(ok);
  _resetWindowProbe(); _resetCoachProbe(); _resetInnstilteProbe(); _resetBytteProbe(); _resetIderProbe(); _resetAffectsProbe();
});

describe('neste side', () => {
  it('spør med søkevindu, så nattpausen ikke ser ut som slutten', async () => {
    fetchTripPage(DIR, Date.parse('2026-11-05T23:34:00Z'), 12, vi.fn(), vi.fn());
    await settle();
    const q = JSON.parse(fetchMock.mock.calls[0][1].body).query;
    expect(q).toContain('searchWindow:');
    expect(q).toContain('transportMode:coach');
    expect(q).toContain('includeRealtimeCancellations');
  });
  it('med «også via» spør den begge og merker via-reisene', async () => {
    fetchTripPage({ ...DIR, via: 'Hellerud', viaStopId: 'NSR:StopPlace:58198', viaOgså: true }, Date.now(), 12, vi.fn(), vi.fn());
    await settle();
    const qs = fetchMock.mock.calls.map(c => JSON.parse(c[1].body).query);
    expect(qs).toHaveLength(2);
    expect(qs.filter(q => q.includes('NSR:StopPlace:58198'))).toHaveLength(1);
  });
  it('og første henting bruker den samme lista', () => {
    const s = fs.readFileSync('src/api/entur.js', 'utf8');
    expect(s).toContain('return ask(true, ..._tripFlagg());');
    expect(_tripFlagg()).toHaveLength(6);
  });
});
