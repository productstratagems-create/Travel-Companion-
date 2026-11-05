// Overganger på neste stopp, underveis i auto-reise.
vi.mock("leaflet", () => ({ default: {} })); vi.mock("../src/ui/mapCompass.js", () => ({ addCompass: () => {} })); vi.mock("../src/ui/log.js", () => ({ logMsg: () => {}, setDot: () => {} }));
//
// Bestilt: «sjekker for mulige overganger til andre linjer og/eller
// kollektivtilbud på neste stasjon/holdeplass og gir bruker dermed mer
// oversikt over mulige andre reiseopsjoner underveis.» Valgt: relevante
// overganger.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { overganger, OVERGANG_MAKS, arrBoardSpørsmål } from '../src/overganger.js';
import * as track from '../src/views/track.js';

const ANK = Date.parse('2026-11-05T07:16:00Z');      // bussen er på Tveita 08:16
const M = 60000;
const rad = (linje, dest, min, extra = {}) => ({ ln: { publicCode: linje, transportMode: 'x' }, dest, depTs: ANK + min * M, quay: 'A', journeyId: 'sj' + linje + min, ...extra });
// Tveita T slik det kunne se ut: egen buss 76, T-bane 2, buss 69 mot Lutvann, 58.
const BRETT = [rad('76', 'Helsfyr', 1), rad('2', 'Ellingsrudåsen', 0.5), rad('2', 'Østerås', 3), rad('69', 'Lutvann', 8),
  rad('58', 'Bøler T', 4), rad('58', 'Nydalen', 6), rad('2', 'Ellingsrudåsen', 12, { cancelled: true }), rad('25', 'Majorstuen', 45)];

describe('overganger', () => {
  const o = overganger(BRETT, ANK, { linje: '76', ofte: ['Lutvann'], ekstraMin: 0 });
  it('linja du sitter på er ikke en overgang', () => {
    expect(o.rader.some(r => r.c.ln.publicCode === '76')).toBe(false);
  });
  it('de du ikke rekker, innstilte og de lenger fram enn 30 min står ikke', () => {
    expect(o.rader.some(r => r.mins < 1)).toBe(false);
    expect(o.rader.some(r => r.c.cancelled)).toBe(false);
    expect(o.rader.some(r => r.c.ln.publicCode === '25')).toBe(false);
  });
  it('mot et sted du ofte reiser til står først', () => {
    expect(o.rader[0].c.ln.publicCode).toBe('69');
    expect(o.rader[0].relevant).toBe(true);
  });
  it('og resten i tidsrekkefølge, høyst tre til sammen', () => {
    expect(o.rader.map(r => r.c.ln.publicCode + ' ' + r.c.dest)).toEqual(['69 Lutvann', '2 Østerås', '58 Bøler T']);
    expect(OVERGANG_MAKS).toBe(3);
  });
  it('og tallet sier hvor mange det er i alt', () => {
    expect(o.totalt).toBe(4);
  });
  it('uten noe du ofte reiser til: de tre første du rekker', () => {
    const u = overganger(BRETT, ANK, { linje: '76', ofte: [] });
    expect(u.rader.map(r => r.c.ln.publicCode)).toEqual(['2', '58', '58']);
  });
});

describe('samme spørsmål som «videre med kollektivt»', () => {
  it('track.js bruker definisjonen fra overganger.js', () => {
    expect(track.arrBoardSpørsmål).toBe(arrBoardSpørsmål);
  });
});

describe('koblingen i auto-reise', () => {
  const s = readFileSync('src/views/auto.js', 'utf8');
  it('henter bare mens låsen holder, én gang per stopp og tur', () => {
    expect(s).toMatch(/if \(!_lås \|\| !st \|\| !st\.id \|\| !Number\.isFinite\(st\.at\)\)/);
    expect(s).toContain("const key = st.id + '|' + _lås.k.nøkkel;");
    expect(s).toContain('fetchArrBoard(st.id, ARR_BOARD_ASK, arrBoardSpørsmål(st.at))');
  });
  it('og viser dem under overskriften', () => {
    expect(s).toContain('(_lås ? overgangerHtml(_overgangerData(påLinja, nåW)');
  });
});

describe('visningen', async () => {
  const { overgangerHtml } = await import('../src/views/auto.js');
  const o = overganger(BRETT, ANK, { linje: '76', ofte: ['Lutvann'] });
  it('sammenfoldet, med antall og stopp', () => {
    const h = overgangerHtml(o, 'Tveita', false);
    expect(h).toContain('<details class="ov-fold">');
    expect(h).toContain('4 overganger på Tveita');
    expect(h).toContain('+ 1 til innen 30 min');
  });
  it('hver rad med linje, skilt, tid og samme ord som bytteraden', async () => {
    const h = overgangerHtml(o, 'Tveita', true);
    expect(h).toContain(' open');
    // Ordet er regelens (`domFraKlasse`), ikke skrevet inn her: 8 min uten
    // ekstra tid er «stramt» etter samme regel som bytteraden.
    const { domFraKlasse } = await import('../src/ui/reiselop.js');
    expect(h).toMatch(new RegExp('>69<[\\s\\S]*Lutvann[\\s\\S]*' + domFraKlasse(o.rader[0].rcls)));
  });
  it('ingen overganger: ingenting', () => {
    expect(overgangerHtml({ rader: [], totalt: 0 }, 'Tveita', false)).toBe('');
  });
});
