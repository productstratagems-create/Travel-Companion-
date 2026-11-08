// Utgangsformen velges av holdeplass-geometrien, til brukeren har valgt selv.
// Bestilt: «Bestem utgangsformat for kart (rektangel eller kvadrat basert på holdeplass-geometrien.»
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const mod = await import('../src/views/auto.js');
const { formFraGeometri, zoomFor, kartFormValgt, settKartForm, FIT_PAD, MARGIN } = mod;
const { bindMapExpand } = await import('../src/ui/map.js');
beforeEach(() => localStorage.clear());

const her = { lat: 59.85, lon: 10.82 };
const S = { kvadrat: [382, 382], bred: [382, 215] };
const kx = Math.cos(59.85 * Math.PI / 180);
// Et punkt `øst` m øst og `nord` m nord for deg.
const pkt = (øst, nord) => [her.lat + nord / 111320, her.lon + øst / (111320 * kx)];

describe('formFraGeometri: bred når det ikke koster et zoomtrinn', () => {
  it('flatt (øst–vest) → bred', () => {
    expect(formFraGeometri(her, [pkt(600, 50), pkt(-500, -40)], 'kvadrat', S)).toBe('bred');
  });
  it('høyt (nord–sør) → kvadrat', () => {
    expect(formFraGeometri(her, [pkt(50, 600), pkt(-40, -500)], 'kvadrat', S)).toBe('kvadrat');
  });
  it('omtrent like bredt som høyt: bred koster et trinn → kvadrat', () => {
    expect(formFraGeometri(her, [pkt(2400, 2280)], 'kvadrat', S)).toBe('kvadrat');
  });
  it('måler i meter, ikke grader', () => {
    // 0.04° øst (~2,2 km) mot 0.03° nord (~3,3 km): bredere i grader, høyere i meter.
    expect(formFraGeometri(her, [[her.lat + 0.03, her.lon + 0.04]], 'kvadrat', S)).toBe('kvadrat');
  });
  it('zoomFor stemmer med Web Mercator', () => {
    // 5000 m bredt utsnitt (±2500 m) i 330 px: m/px = 156543·cos/2^z → z = log2(156543·cos·330/5000).
    // (Under taket START_ZOOM, ellers måles taket og ikke formelen.)
    expect(zoomFor(her, [pkt(2500, 0)], [382, 1e6])).toBeCloseTo(Math.log2(156543.03 * kx * 330 / 5000), 6);
  });
  it('blafrer ikke: like over et trinnskifte går ikke inn i bred, men bred blir', () => {
    // Bredden begrenser kvadratet (trinn + 0,9); høyden begrenser bred like over
    // samme trinn (+ MARGIN/2). Samme trinn, men for lite å gå på.
    const zHel = 12, C = 156543.03 * kx;
    const øst = C * (382 - 2 * FIT_PAD) / Math.pow(2, zHel + 0.9) / 2;
    const nord = C * (215 - 2 * FIT_PAD) / Math.pow(2, zHel + MARGIN / 2) / 2;
    const pts = [pkt(øst, nord)];
    expect(Math.floor(zoomFor(her, pts, S.bred))).toBe(Math.floor(zoomFor(her, pts, S.kvadrat)) );
    expect(formFraGeometri(her, pts, 'kvadrat', S)).toBe('kvadrat');
    expect(formFraGeometri(her, pts, 'bred', S)).toBe('bred');
  });
  it('ingen punkter eller størrelser → beholder', () => {
    expect(formFraGeometri(her, [], 'bred', S)).toBe('bred');
    expect(formFraGeometri(null, [[1, 1]], 'kvadrat', S)).toBe('kvadrat');
    expect(formFraGeometri(her, [pkt(600, 50)], 'kvadrat', null)).toBe('kvadrat');
  });
  it('rammen og regelen bruker samme padding og maks-zoom', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toContain('L.point(2 * FIT_PAD, 2 * FIT_PAD)');
    expect(s).toContain('Math.min(FIT_MAKS_ZOOM, pass)');
  });
});

describe('brukerens valg vinner', () => {
  it('uvalgt er null; kvadrat valgt er ikke det samme som uvalgt', () => {
    expect(kartFormValgt()).toBe(null);
    settKartForm('kvadrat'); expect(kartFormValgt()).toBe('kvadrat');
    settKartForm('bred'); expect(kartFormValgt()).toBe('bred');
  });
  it('kartet kan settes til en form utenfra uten å flytte syklusen ut av takt', () => {
    const el = document.createElement('div'), btn = document.createElement('button');
    const k = bindMapExpand({ invalidateSize() {} }, el, btn, { syklus: ['kvadrat', 'bred', 'full'] });
    k.settForm('bred');
    expect(el.classList.contains('form-bred')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Fullskjerm');
    btn.click(); expect(el.classList.contains('expanded')).toBe(true);
  });
  // v1.218.9: «Velg kvadratisk» — formregelen er koblet fra kartet, foldet, ikke slettet.
  it('auto.js velger ikke form fra geometrien lenger; regelen står igjen', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toContain('export function formFraGeometri(');
    expect(src.slice(src.indexOf('function _renderMap'))).not.toMatch(/formFraGeometri\(userPos/);
  });
});
