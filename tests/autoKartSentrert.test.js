// Auto-reise-kartet: deg i midten, gangtid til de relevante stoppene.
//
// Rapportert: ti prikker uten navn, posisjonen din ikke i midten, og
// gangavstanden bare i et verktøytips.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const { relevanteStopp, speiletOm, gangLapp, RELEVANT_ANDRE } = await import('../src/views/auto.js');

const S = (id, mode, distM, lat = 59.85, lon = 10.83) => ({ id, name: id, modes: [mode], distM, lat, lon });
const HER = S('Mortensrud T', 'metro', 790);
const ANDRE = [S('A', 'bus', 300), S('B', 'bus', 200), S('C', 'bus', 500), S('D', 'tram', 900), S('E', 'bus', 100),
  S('F', 'bus', 700), S('G', 'bus', 800), S('H', 'bus', 650), S('I', 'bus', 400)];

describe('relevante stopp', () => {
  it('to i tillegg til der du er, et nytt transportmiddel først', () => {
    expect(RELEVANT_ANDRE).toBe(2);
    expect(relevanteStopp(HER, ANDRE).map(s => s.id)).toEqual(['E', 'D']);
  });
  it('uten nytt transportmiddel: de to nærmeste', () => {
    expect(relevanteStopp(HER, ANDRE.filter(s => s.modes[0] === 'bus')).map(s => s.id)).toEqual(['E', 'B']);
  });
});

describe('deg i midten', () => {
  it('speilede punkter gir en ramme med deg i midten', () => {
    const her = { lat: 59.852, lon: 10.82 };
    const pts = speiletOm(her, [[59.849, 10.829], [59.86, 10.81]]);
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    expect((Math.min(...lats) + Math.max(...lats)) / 2).toBeCloseTo(her.lat, 9);
    expect((Math.min(...lons) + Math.max(...lons)) / 2).toBeCloseTo(her.lon, 9);
  });
});

describe('merkelappen', () => {
  it('meter når gangtiden er ukjent', () => {
    expect(gangLapp({ name: 'X', distM: 300, lat: null, lon: null })).toBe('X · 300 m');
  });
});

describe('koblingen', () => {
  const s = readFileSync('src/views/auto.js', 'utf8');
  it('rammen er speilet om deg når ingen linje er tema, og de relevante har fast merkelapp', () => {
    expect(s).toContain('const sentrert = !!(userPos && !line && !kortLinje);');
    expect(s).toMatch(/_aMap\.fitBounds\(rammePts,/);
    expect(s).toContain("permanent: relevante.includes(s) })");
  });
});

describe('merkelapper som krasjer', async () => {
  const { ryddMerkelapper } = await import('../src/ui/map.js');
  it('den første beholdes, en som overlapper skjules, en fri står', () => {
    const el = document.createElement('div');
    el.innerHTML = ['a', 'b', 'c'].map(x => '<div class="leaflet-tooltip map-label">' + x + '</div>').join('');
    const [a, b, c] = el.children;
    a.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 20 });
    b.getBoundingClientRect = () => ({ left: 50, right: 150, top: 10, bottom: 30 });
    c.getBoundingClientRect = () => ({ left: 0, right: 100, top: 40, bottom: 60 });
    expect(ryddMerkelapper(el)).toBe(1);
    expect(b.classList.contains('lapp-skjult')).toBe(true);
    expect(a.classList.contains('lapp-skjult') || c.classList.contains('lapp-skjult')).toBe(false);
  });
});

// Rapportert: kartet viste gangtid i et sekund og «snappet tilbake». Hver
// GPS-fiks tegnet kartet på nytt, valget av stopp skiftet, og ryddingen
// skjulte de nye merkelappene bak de gamle.
describe('stabilt kart mens GPS-en flytter seg', async () => {
  const { mapKey } = await import('../src/views/auto.js');
  const { ryddMerkelapper } = await import('../src/ui/map.js');
  it('noen meter flytting gir samme kartnøkkel', () => {
    const a = mapKey({ id: 'S' }, { lat: 59.85421, lon: 10.81721 }, [], null, null);
    const b = mapKey({ id: 'S' }, { lat: 59.85432, lon: 10.81738 }, [], null, null);
    expect(a).toBe(b);
  });
  it('de relevante beholdes så lenge de er i nærheten', () => {
    const forrige = ['A', 'D'];
    const andre = [S('E', 'bus', 100), S('A', 'bus', 300), S('D', 'tram', 900)];
    expect(relevanteStopp(HER, andre, 2, forrige).map(s => s.id)).toEqual(['A', 'D']);
  });
  it('ryddingen ser bare på denne tegningens merkelapper', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div class="leaflet-tooltip map-label lapp-t1">gammel</div><div class="leaflet-tooltip map-label lapp-t2">ny</div>';
    [...el.children].forEach(c => { c.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 20 }); });
    expect(ryddMerkelapper(el, 'lapp-t2')).toBe(0);
    expect(el.children[1].classList.contains('lapp-skjult')).toBe(false);
  });
});
