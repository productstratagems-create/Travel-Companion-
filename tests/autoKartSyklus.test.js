// Kartknappen i auto-reise sykler: kvadrat → bred → fullskjerm → kvadrat.
// Bestilt: «Kan knappen for kartet sykle mellom kvadratisk, rektangulært og fullskjerm?»
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const { bindMapExpand } = await import('../src/ui/map.js');
const { kartForm, settKartForm } = await import('../src/views/auto.js');

beforeEach(() => { localStorage.clear(); document.documentElement.className = ''; });

function lag() {
  const el = document.createElement('div'); const btn = document.createElement('button');
  return { el, btn, map: { invalidateSize() {} } };
}

describe('syklus', () => {
  it('kvadrat → bred → full → kvadrat, med neste steg på knappen', () => {
    const { el, btn, map } = lag(); const sett = [];
    bindMapExpand(map, el, btn, { syklus: ['kvadrat', 'bred', 'full'], onToggle: (o, f) => sett.push([o, f]) });
    expect(btn.getAttribute('aria-label')).toBe('Bredt kart');
    btn.click();
    expect(el.classList.contains('form-bred')).toBe(true);
    expect(el.classList.contains('expanded')).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe('Fullskjerm');
    btn.click();
    expect(el.classList.contains('expanded')).toBe(true);
    expect(document.documentElement.classList.contains('map-open')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Minimer kart');
    btn.click();
    expect(el.classList.contains('expanded')).toBe(false);
    expect(el.classList.contains('form-bred')).toBe(false);
    expect(document.documentElement.classList.contains('map-open')).toBe(false);
    expect(sett).toEqual([[false, 'bred'], [true, 'full'], [false, 'kvadrat']]);
  });
  it('starter i husket form', () => {
    const { el, btn, map } = lag();
    bindMapExpand(map, el, btn, { syklus: ['kvadrat', 'bred', 'full'], start: 'bred' });
    expect(el.classList.contains('form-bred')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Fullskjerm');
  });
  it('uten syklus: to steg som før', () => {
    const { el, btn, map } = lag();
    bindMapExpand(map, el, btn);
    btn.click(); expect(el.classList.contains('expanded')).toBe(true);
    btn.click(); expect(el.classList.contains('expanded')).toBe(false);
    expect(el.classList.contains('form-bred')).toBe(false);
  });
});

describe('husket form', () => {
  it('kvadrat/bred huskes, fullskjerm ikke, og følger profilen', () => {
    expect(kartForm()).toBe('kvadrat');
    settKartForm('bred'); expect(kartForm()).toBe('bred');
    settKartForm('full'); expect(kartForm()).toBe('bred');
    settKartForm('kvadrat'); expect(kartForm()).toBe('kvadrat');
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.autoKartForm',");
  });
  it('bred er 16:9, og auto.js bruker syklusen', () => {
    expect(readFileSync('src/style/settings.css', 'utf8')).toContain('#v-auto #auto-map.form-bred{aspect-ratio:16 / 9}');
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/syklus: KART_FORMER/);
    expect(readFileSync('src/views/auto.js', 'utf8')).toContain("const KART_FORMER = ['kvadrat', 'bred', 'full'];");
  });
});

describe('«vis kart» står bare når kartet er skjult', () => {
  it('[hidden] vinner over display:block (sett i skjermbilde, v1.218.4)', () => {
    expect(readFileSync('src/style/settings.css', 'utf8')).toContain('.auto-kart-bryter[hidden]{display:none}');
  });
});
