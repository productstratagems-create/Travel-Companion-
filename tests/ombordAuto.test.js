/**
 * Auto-reise og «ser ut som du er på» — kallestedet.
 *
 * `api/ombord.js` kan være aldri så riktig; spør ikke skjermen, eller spør
 * den med feil kandidater, står den som før. Kallestedet er der denne
 * kodebasens feil har sittet oftest.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { ombordKandidater, ombordKortHtml } from '../src/views/auto.js';
import { ombord } from '../src/api/ombord.js';

const T0 = Date.UTC(2026, 10, 2, 7, 0, 0);
const S = 1000, MIN = 60 * S;
const LAT = 59.9;
const lon = (m) => 10.70 + m / 55_800;

/** Et kall slik `boardGQL` gir det: hele turen i `estimatedCalls`. */
const avgang = (id, linje, front, startM, fart, { innstilt = false } = {}) => {
  // Stopp hver 600 m, fra startM; kjøretøyet går i `fart` m/s.
  const stopp = [0, 1, 2, 3, 4].map(i => {
    const m = startM + i * 600;
    const t = new Date(T0 + (i * 600 / fart) * S).toISOString();
    return { quay: { latitude: LAT, longitude: lon(m), publicCode: '1',
      stopPlace: { id: 'NSR:StopPlace:S' + i, name: 'Stopp ' + i } },
      aimedArrivalTime: t, expectedArrivalTime: t, aimedDepartureTime: t, expectedDepartureTime: t };
  });
  return { cancellation: innstilt, destinationDisplay: { frontText: front },
    expectedDepartureTime: stopp[0].expectedDepartureTime,
    serviceJourney: { id, line: { publicCode: linje, presentation: { colour: 'e60000' } },
      estimatedCalls: stopp } };
};
/* Du: 10 m/s langs samme gate, fra 0 m ved T0. */
const SPOR = [0, 10, 20, 30].map(t => ({ lat: LAT, lon: lon(10 * t), at: T0 + t * S, acc: 10 }));

describe('kandidatene fra tavlesvaret', () => {
  it('gir en kandidat per tur, med forventet posisjon ved hver fiks', () => {
    const k = ombordKandidater([avgang('J37', '37', 'Helsfyr', 0, 10)], SPOR);
    expect(k).toHaveLength(1);
    expect(k[0].forventet).toHaveLength(SPOR.length);
    expect(k[0].forventet.every(p => Number.isFinite(p.lat))).toBe(true);
  });

  /* Og med dommen: bussen som kjører sammen med deg er den. */
  it('og dommen finner bussen du sitter på', () => {
    const kall = [avgang('J37', '37', 'Helsfyr', 0, 10), avgang('J20', '20', 'Skøyen', 0, 10)];
    kall[1].serviceJourney.estimatedCalls.forEach(c => {         // 20 går fire minutter senere
      ['aimedArrivalTime', 'expectedArrivalTime', 'aimedDepartureTime', 'expectedDepartureTime']
        .forEach(f => { c[f] = new Date(new Date(c[f]).getTime() + 4 * MIN).toISOString(); });
    });
    const d = ombord({ spor: SPOR, fartMS: 10, kandidater: ombordKandidater(kall, SPOR) });
    expect(d.kind).toBe('ombord');
    expect(d.kandidater[0].linje).toBe('37');
  });

  it('hopper over innstilte turer', () => {
    expect(ombordKandidater([avgang('J37', '37', 'H', 0, 10, { innstilt: true })], SPOR)).toEqual([]);
  });

  it('og turer du har sagt nei til', () => {
    expect(ombordKandidater([avgang('J37', '37', 'H', 0, 10)], SPOR, new Set(['J37']))).toEqual([]);
  });

  it('og tar samme tur bare én gang', () => {
    const a = avgang('J37', '37', 'H', 0, 10);
    expect(ombordKandidater([a, a], SPOR)).toHaveLength(1);
  });
});

describe('kortet', () => {
  const kand = () => ombordKandidater([avgang('J37', '37', 'Helsfyr', 0, 10)], SPOR);

  it('er tomt når dommen ikke vet', () => {
    expect(ombordKortHtml({ kind: 'vet-ikke', kandidater: [] }, T0)).toBe('');
    expect(ombordKortHtml(null, T0)).toBe('');
  });

  it('sier linja, retningen og neste stopp', () => {
    const h = ombordKortHtml({ kind: 'ombord', kandidater: kand() }, T0 + 30 * S);
    expect(h).toMatch(/ser ut som du er på/);
    expect(h).toMatch(/>37</);
    expect(h).toMatch(/mot Helsfyr/);
    expect(h).toMatch(/neste: Stopp 1/);
  });

  it('og ved tvil sier det det', () => {
    const k = [...kand(), ...ombordKandidater([avgang('J20', '20', 'Skøyen', 0, 10)], SPOR)];
    const h = ombordKortHtml({ kind: 'ombord-tvil', kandidater: k }, T0);
    expect(h).toMatch(/du er på en av disse/);
    expect((h.match(/ombord-valg/g) || []).length).toBe(2);
  });

  it('og har en × å si nei med', () => {
    expect(ombordKortHtml({ kind: 'ombord', kandidater: kand() }, T0)).toMatch(/ombord-x/);
  });
});

/* ── KALLESTEDET ────────────────────────────────────────────────────────── */
describe('skjermen', () => {
  const src = () => require('node:fs').readFileSync('src/views/auto.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('spør dommen med farten fra filteret og de rå kallene', () => {
    expect(src()).toMatch(/ombord\(\{ spor, fartMS: fartNå\(nå\), kandidater: ombordKandidater\(_rå, spor, _avvistOmbord\) \}\)/);
  });

  it('før «du er ved»', () => {
    const s = src();
    const a = s.indexOf('_renderOmbord();\n  _renderWhere();');
    expect(a).toBeGreaterThan(0);
  });

  /* ALDRI AUTOMATISK. `joinJourney` kalles bare fra en klikkhandler. */
  it('og blir bare med på en reise når du trykker', () => {
    const s = src();
    const kall = [...s.matchAll(/joinJourney\(/g)].map(m => m.index);
    expect(kall.length).toBe(1);
    const før = s.slice(Math.max(0, kall[0] - 600), kall[0]);
    expect(før).toMatch(/addEventListener\('click'/);
  });

  /* De rå kallene NULLSTILLES IKKE når stoppet bytter. Om bord bytter «du
   * er ved» ved hvert stopp; da ville tilbudet blinket av og på. */
  it('og mister ikke kandidatene når «du er ved» bytter stopp', () => {
    const s = src();
    expect(s).toMatch(/_rå = stop\.estimatedCalls \|\| \[\];/);
    // Deklarasjonen `let _rå = [];` er ikke en nullstilling. Første utgave
    // av denne regexen traff nettopp den.
    expect(s).not.toMatch(/(?<!let )_rå = \[\];/);
  });

  it('og et nei huskes for økten', () => {
    expect(src()).toMatch(/_avvistOmbord\.add\(k\.nøkkel\)/);
  });
});

/* ── «DU ER VED» UNDER KORTET ───────────────────────────────────────────
 *
 * v1.198.0 la tilbudet over «du er ved» og lot overskriften stå. Sett i
 * nettleserprøven: under «ser ut som du er på 31» sto «Økern · 127 m å gå ·
 * 4 min gange · du går mot den · ca 10 s». Fire minutter og ti sekunder om
 * samme stopp, og et verb som var feil for den som satt på bussen.
 */
import { stopHeadHtml } from '../src/views/auto.js';
import { iFart, OMBORD_MIN_FART_MS } from '../src/api/ombord.js';

describe('«du er ved» i fart', () => {
  const STOPP = { name: 'Økern', id: 'NSR:StopPlace:Okern', distM: 127 };
  const extra = (o) => ({ walkDist: 127, walkMins: 4, way: 'mot', wayEtaS: 10, ...o });
  const tekst = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('sier ikke gangtid eller «du går» når du er i fart', () => {
    const t = tekst(stopHeadHtml(STOPP, 0, false, extra({ iFart: true })));
    expect(t).not.toMatch(/å gå|min gange|du går/);
    expect(t).toMatch(/127 m/);
    expect(t).toMatch(/du nærmer deg den · ca 10 s/);
  });

  it('men til fots er alt som før', () => {
    const t = tekst(stopHeadHtml(STOPP, 0, false, extra({ iFart: false })));
    expect(t).toMatch(/127 m å gå/);
    expect(t).toMatch(/4 min gange/);
    expect(t).toMatch(/du går mot den/);
  });

  /* ÉN TERSKEL. Tilbudet over og overskriften under spør samme spørsmål:
   * går du? Med to tall kunne de svart hvert sitt. */
  it('og «i fart» er tilbudets egen terskel', () => {
    expect(iFart(OMBORD_MIN_FART_MS)).toBe(true);
    expect(iFart(OMBORD_MIN_FART_MS - 0.1)).toBe(false);
    expect(iFart(null)).toBe(false);
    const src = require('node:fs').readFileSync('src/api/ombord.js', 'utf8');
    expect(src).toMatch(/if \(!iFart\(c\.fartMS\)\) return vetIkke\('går'\)/);
  });

  it('og skjermen sender den med, og bytter overskrift', () => {
    const src = require('node:fs').readFileSync('src/views/auto.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).toMatch(/const fart = iFart\(fartNå\(/);
    expect(src).toMatch(/iFart: fart,/);
    expect(src).toMatch(/fart \? 'nærmeste stopp' : 'du er ved'/);
  });
});

/* ── RADENE I FART ──────────────────────────────────────────────────────
 *
 * v1.199.0 rettet overskriften, men radene regnet fortsatt med gangtid: på
 * bussen strøk de avganger som «rekker ikke» ut fra at du GÅR til stoppet.
 * Spurt: «Ta tavlas rader i fart også.»
 */
import { gangGjelder, I_FART_NOTIS } from '../src/api/ombord.js';

describe('gangtid i fart', () => {
  it('gjelder ikke i fart', () => {
    expect(gangGjelder(10, false)).toBe(false);
  });
  it('men gjelder til fots', () => {
    expect(gangGjelder(1.4, false)).toBe(true);
    expect(gangGjelder(null, false)).toBe(true);
  });
  /* En fast «gå fra»-plass er ikke din GPS. Den gjelder uansett hvor du er. */
  it('og en fast «gå fra»-plass gjelder alltid', () => {
    expect(gangGjelder(10, true)).toBe(true);
  });
  it('og bruker tilbudets egen terskel', () => {
    expect(gangGjelder(OMBORD_MIN_FART_MS, false)).toBe(false);
    expect(gangGjelder(OMBORD_MIN_FART_MS - 0.1, false)).toBe(true);
  });

  const strip = f => require('node:fs').readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('tavla slår av gangtid i fart', () => {
    const g = strip('src/geo.js');
    const i = g.indexOf('export function isWalkActive');
    expect(g.slice(i, g.indexOf('\n}\n', i))).toMatch(/gangGjelder\(fartNå\(\), state\.walkFromLL !== null\)/);
  });

  /* Auto-reise: alle stedene gangtid avgjør rekkevidde går gjennom gangTil.
   * Bare overskriften beholder walkMinsTo — den trenger avstanden, og
   * v1.199.0 håndterer ordene der. */
  it('og auto-reise regner rekkevidde gjennom gangTil', () => {
    const s = strip('src/views/auto.js');
    expect((s.match(/walkMinsTo\(_stop\)/g) || []).length).toBe(1);
    expect((s.match(/gangTil\(_stop\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  /* SI DET. Ustrøkne rader uten forklaring leses som at alt kan nås. */
  it('og sier det, på begge skjermene', () => {
    expect(I_FART_NOTIS).toMatch(/i fart/);
    // På kallestedet, ikke bare i importlinja. Første utgave så etter ordet
    // og fant det i `import { … I_FART_NOTIS }` — mutanten som fjernet
    // notisen fra skjermen overlevde.
    // v1.218.36: «oppdatert» står mellom notisen og radene.
    expect(strip('src/views/auto.js')).toMatch(/body\.innerHTML = fartNotis \+ oppdatertHtml\([^\n]*\n\s*\+ ordered\.map/);
    expect(strip('src/views/auto.js')).toMatch(/esc\(I_FART_NOTIS\)/);
    expect(strip('src/views/board.js')).toMatch(/let html = gangGjelder\(fartNå\(\), state\.walkFromLL !== null\) \? ''\s*: '<div class="i-fart-notis">' \+ esc\(I_FART_NOTIS\)/);
  });
});

/* ── GANGLINJA PÅ KARTET I FART ─────────────────────────────────────────
 *
 * v1.202.0 sluttet å stryke rader på gangtid i fart, men kartet tegnet
 * fortsatt den prikkede ganglinja fra deg til stoppet — et råd om å gå fra
 * en buss. Samme regel som radene: `gangGjelder`.
 *
 * Gange som er en del av REISEN — fra avstigning til mål, eller en reise
 * som bare er gange — er ikke berørt. Den er ikke et spørsmål om hvor du
 * står.
 */
describe('ganglinja fra deg til stoppet', () => {
  const strip = f => require('node:fs').readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('auto-reise ber ikke om den i fart', () => {
    expect(strip('src/views/auto.js'))
      .toMatch(/ensureApproach\(gangGjelder\(fartNå\(\), state\.walkFromLL !== null\) \? userPos : null, _stop\)/);
  });

  it('og avgangsdetaljene tegner den ikke i fart', () => {
    const s = strip('src/views/selected.js');
    // Siden v1.211.1 er streken gangruta (`gangLinje`), ikke en rett strek.
    // Påstanden er den samme: ingen strek i fart.
    const i = s.indexOf('drawWalk(_selLayer, linje)');
    expect(i).toBeGreaterThan(0);
    expect(s).toMatch(/const gå = gangGjelder\(fartNå\(\), state\.walkFromLL !== null\);/);
    // Og at `if`-en BRUKER svaret. Første utgave så bare at uttrykket stod
    // like før streken — mutanten som lot `if`-en ignorere det overlevde.
    expect(s.slice(i - 300, i)).toMatch(/if \(gå && harPåstigning\) \{\s*const linje = gangLinje\(/);
  });

  it('og tavla er dekket av isWalkActive, som alt sjekker farten', () => {
    expect(strip('src/views/board.js')).toMatch(/_ensureApproach\(isWalkActive\(dir\) \?/);
  });

  /* Og en tom forespørsel tømmer linja — ellers ville den forrige stått
   * igjen på kartet fra før du gikk på. */
  it('og «ingen» tømmer en linje som alt var hentet', async () => {
    const { ensureApproach, approachPoints, approachKey } = await import('../src/api/approach.js');
    ensureApproach(null, { lat: 59.9, lon: 10.7 });
    expect(approachPoints()).toBeNull();
    expect(approachKey()).toBeNull();
  });
});
