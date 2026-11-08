// Kartet viser bare holdeplasser som gir en linje ingen nærmere holdeplass har.
// Bestilt: «Kartet trenger kun å vise holdeplasser som tilbyr unike ruter …»
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const { unikeStopp } = await import('../src/views/auto.js');
const { fetchStoppLinjer, _resetStoppLinjer, linjerFraSvar } = await import('../src/api/stops.js');

const gran = { id: 'G', distM: 80, lat: 1, lon: 1 };
const olas = { id: 'O', distM: 300, lat: 1, lon: 1 };
const kant = { id: 'K', distM: 400, lat: 1, lon: 1 };
const mort = { id: 'M', distM: 700, lat: 1, lon: 1 };
const linjer = new Map([['G', ['76', '79']], ['O', ['79']], ['K', ['76', '79']], ['M', ['T3', '76']]]);
const av = id => linjer.get(id);

describe('unikeStopp', () => {
  it('bare Mortensrud gir noe nytt', () => {
    const r = unikeStopp(gran, [kant, mort, olas], av);
    expect(r.vis.map(s => s.id)).toEqual(['M']);
    expect(r.skjult.map(s => s.id)).toEqual(['O', 'K']);
  });
  it('bare mot NÆRMERE holdeplasser, ikke alle', () => {
    // Olasrudveien har 79, som også går fra fjernere Kantarellen: Olasrud beholdes uten Granebakken.
    const r = unikeStopp(null, [kant, olas], av);
    expect(r.vis.map(s => s.id)).toEqual(['O', 'K']);
  });
  it('ukjente linjer skjules aldri', () => {
    const r = unikeStopp(gran, [olas, mort], () => undefined);
    expect(r.vis.map(s => s.id)).toEqual(['O', 'M']);
    expect(r.skjult).toEqual([]);
  });
  it('en holdeplass uten linjer (tom liste) gir ingenting nytt', () => {
    const r = unikeStopp(gran, [olas], id => id === 'O' ? [] : av(id));
    expect(r.skjult.map(s => s.id)).toEqual(['O']);
  });
});

describe('linjer per holdeplass', () => {
  beforeEach(() => _resetStoppLinjer());
  it('leser alle plattformenes linjer, uten duplikater (form fra ekte svar, Storo)', () => {
    const m = linjerFraSvar({ data: { stopPlaces: [{ id: 'NSR:StopPlace:58195', quays: [{ lines: [] }, { lines: [{ id: 'RUT:Line:15' }, { id: 'RUT:Line:12' }] }, { lines: [{ id: 'RUT:Line:12' }] }] }] } });
    expect(m.get('NSR:StopPlace:58195')).toEqual(['RUT:Line:15', 'RUT:Line:12']);
  });
  it('spør bare om nye id-er, og gir null ved feil', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { stopPlaces: [{ id: 'A', quays: [{ lines: [{ id: 'L1' }] }] }] } }) });
    vi.stubGlobal('fetch', f);
    expect((await fetchStoppLinjer(['A'])).get('A')).toEqual(['L1']);
    await fetchStoppLinjer(['A']);
    expect(f).toHaveBeenCalledTimes(1);
    f.mockRejectedValueOnce(new Error('nett'));
    expect(await fetchStoppLinjer(['B'])).toBe(null);
    vi.unstubAllGlobals();
  });
  it('kartet bruker regelen og folder resten', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/unikeStopp\(_stop, alle,/);
    expect(src).toContain('auto-map-flere');
  });
});
