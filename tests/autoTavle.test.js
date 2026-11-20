// v1.218.107: «Auto-tavle» — det proven fra tavla og auto-reise.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tavleUtvalg, tavleRadHtml, TAVLE_MAKS } from '../src/ui/tavleRad.js';
import { NAV_UNDER_INNSTILLINGER } from '../src/ui/nav.js';
import { clk } from '../src/ui/fmt.js';

const NÅ = Date.parse('2026-11-17T18:00:00+01:00');
const kall = (min, spor) => ({ ms: NÅ + min * 60_000, call: { quay: { publicCode: spor } } });
const dir = (kode, front, mins, spor = '1') => ({ frontText: front, lines: [{ code: kode, colour: 'EC700C', mode: 'metro' }], calls: mins.map(m => kall(m, spor)) });

describe('utvalget', () => {
  const dirs = [dir('3', 'Kolsås', [2, 9, 16, 23]), dir('74', 'Jernbanetorget', [5, 35], 'E')];
  it('tre per retning, sortert på tid', () => {
    const u = tavleUtvalg(dirs, NÅ);
    expect(u.map(x => Math.round((x.ms - NÅ) / 60_000))).toEqual([2, 5, 9, 16, 35]);
  });
  it('tak på tolv', () => {
    const mange = Array.from({ length: 6 }, (_, i) => dir(String(i), 'X' + i, [i, i + 10, i + 20]));
    expect(tavleUtvalg(mange, NÅ).length).toBe(TAVLE_MAKS);
  });
  it('«rekker du den» med regelen som sendes inn', () => {
    const u = tavleUtvalg(dirs, NÅ, ms => ms - NÅ >= 6 * 60_000);
    expect(u.filter(x => !x.rekker).length).toBe(2);
  });
});

describe('raden', () => {
  it('nedtelling, linjemerke, retning, klokke og spor', () => {
    const [x] = tavleUtvalg([dir('3', 'Kolsås', [9], '2')], NÅ);
    const h = tavleRadHtml(x, NÅ, 0);
    expect(h).toContain('<span class="at-min">9<small>min</small>');
    expect(h).toContain('Kolsås');
    expect(h).toContain(clk(NÅ + 9 * 60_000));
    expect(h).toContain('<small>spor</small>2');
    expect(h).toMatch(/class="[^"]*lm/);
  });
  it('«nå» under ett minutt, og «rekker ikke» sagt i klartekst', () => {
    const [x] = tavleUtvalg([dir('3', 'Kolsås', [0.5])], NÅ, () => false);
    const h = tavleRadHtml(x, NÅ, 0);
    expect(h).toContain('<span class="at-min">nå</span>');
    expect(h).toContain('at-rekker-ikke');
    expect(h).toContain('rekker ikke');
  });
});

describe('lenken og modusen', () => {
  it('står i innstillinger', () => {
    expect(NAV_UNDER_INNSTILLINGER.find(i => i.view === 'v-autotavle').label).toBe('Auto-tavle');
  });
  it('er auto-reise-skjermen i en modus, og skjuler det som ikke er proven', () => {
    const css = readFileSync('src/style/settings.css', 'utf8');
    // v1.218.126: om bord, intervjuet og «din vanlige reise» vises nå; kortene og «ofte brukt» skjules fortsatt.
    ['#auto-dest-body', '#auto-fav-routes'].forEach(id => expect(css).toContain('#v-auto.auto-tavle ' + id));
    ['#auto-neste', '#auto-profil', '#auto-ombord'].forEach(id => expect(css).not.toContain('#v-auto.auto-tavle ' + id));
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/if \(_autoTavle && _dirs\.length\) \{ _visListeDel\(false\); _tegnAutoTavle\(body\); return; \}/);
  });
});

describe('kartets filter gjelder lista (v1.218.108)', () => {
  it('samme regel for bein og retninger', async () => {
    const { filtrerRetninger, filtrerBein } = await import('../src/views/auto.js');
    const dirs = [dir('3', 'Kolsås', [2]), { ...dir('74', 'Jernbanetorget', [5]), lines: [{ code: '74', mode: 'bus' }] }, { ...dir('X', 'Y', [6]), lines: [{ code: 'X' }] }];
    expect(filtrerRetninger(dirs, ['bus']).map(d => d.frontText)).toEqual(['Kolsås']);   // uten modus = buss, som beina
    expect(filtrerRetninger(dirs, ['metro']).map(d => d.frontText)).toEqual(['Jernbanetorget', 'Y']);
    expect(filtrerBein([{ modus: null }, { modus: 'metro' }], ['bus']).length).toBe(1);
  });
  it('lista leser filteret og tegnes på nytt ved et trykk', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/const synlige = utenSkjulteLinjerRetninger\(filtrerRetninger\(alleDirs, skjult\), _skjulteLinjer\(\)\);/);
    expect(src).toMatch(/if \(_autoTavle\) _renderBody\(\);/);
  });
});

import { tavleDel, TAVLE_SIDE } from '../src/ui/tavleRad.js';
describe('rekker ikke for seg, og sider (v1.218.109)', () => {
  const dirs = [dir('3', 'Kolsås', [1, 3, 9, 16, 23, 30]), dir('74', 'Jernbanetorget', [2, 35], 'E')];
  const kan = ms => ms - NÅ >= 5 * 60_000;
  it('de du ikke rekker er en egen gruppe; resten sortert på tid, uten tak per retning', () => {
    const d = tavleDel(dirs, NÅ, kan, TAVLE_SIDE);
    expect(d.ikke.map(x => Math.round((x.ms - NÅ) / 60_000))).toEqual([1, 2, 3]);
    expect(d.rekker.map(x => Math.round((x.ms - NÅ) / 60_000))).toEqual([9, 16, 23, 30, 35]);
  });
  it('grensen kutter de du rekker, og sier når neste side må hentes', () => {
    const d = tavleDel(dirs, NÅ, kan, 2);
    expect(d.rekker.length).toBe(2);
    expect(d.tomForLokale).toBe(false);
    expect(tavleDel(dirs, NÅ, kan, 12).tomForLokale).toBe(true);
  });
  it('samme tur fra to sider er én avgang', () => {
    const k = { ms: NÅ + 9 * 60_000, call: { serviceJourney: { id: 'SJ1' }, quay: {} } };
    const a = { ...dir('3', 'Kolsås', []), calls: [k] }, b = { ...dir('3', 'Kolsås', []), calls: [k] };
    expect(tavleDel([a, b], NÅ, () => true, 12).rekker.length).toBe(1);
  });
  it('gruppen er lukket til du åpner den, og husker det', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/'<details class="at-ikke"' \+ \(_atIkkeÅpen \? ' open' : ''\)/);
    expect(src).toMatch(/new IntersectionObserver/);
  });
});

describe('klokkeslett fra 60 minutter, som tavla (v1.218.111)', () => {
  it('59 min er nedtelling; 60 og mer er klokkeslett', async () => {
    const { NEDTELLING_MAKS_MIN } = await import('../src/ui/fmt.js');
    expect(NEDTELLING_MAKS_MIN).toBe(60);
    const [a] = tavleUtvalg([dir('3', 'Kolsås', [59])], NÅ);
    expect(tavleRadHtml(a, NÅ, 0)).toContain('<span class="at-min">59<small>min</small>');
    const [b] = tavleUtvalg([dir('3', 'Kolsås', [75])], NÅ);
    const h = tavleRadHtml(b, NÅ, 0);
    expect(h).toContain('<span class="at-min at-min-klokke">' + clk(NÅ + 75 * 60_000) + '</span>');
    expect(h).toContain('kl. ' + clk(NÅ + 75 * 60_000));
  });
  it('tavla og Auto-tavle leser samme tall', () => {
    expect(readFileSync('src/views/board.js', 'utf8')).toMatch(/const isClock = mins >= NEDTELLING_MAKS_MIN;/);
    expect(readFileSync('src/ui/tavleRad.js', 'utf8')).toMatch(/min >= NEDTELLING_MAKS_MIN/);
  });
});
describe('ikke samme klokkeslett to ganger (v1.218.111)', () => {
  it('raden over 60 min har klokka bare til venstre', () => {
    const [b] = tavleUtvalg([dir('3', 'Kolsås', [75])], NÅ);
    const h = tavleRadHtml(b, NÅ, 0);
    expect(h.split(clk(NÅ + 75 * 60_000)).length - 1).toBe(2);   // venstre + aria-etiketten
    expect(h).toContain('<span class="at-klokke"></span>');
  });
});


describe('raden: innstilt, avvik, rutetid (v1.218.126)', () => {
  const kall = (min, o = {}) => ({ ms: NÅ + min * 60_000, innstilt: !!o.innstilt, call: { realtime: o.rt !== false, quay: { publicCode: '1' } } });
  const d = (calls) => ({ frontText: 'Kolsås', lines: [{ code: '3', colour: 'EC700C', mode: 'metro', id: 'L3' }], calls });
  it('innstilt står overstrøket og sies', () => {
    const u = tavleUtvalg([d([kall(5, { innstilt: true }), kall(9)])], NÅ);
    expect(u.length).toBe(2);
    const h = tavleRadHtml(u[0], NÅ, 0);
    expect(h).toContain('at-innstilt');
    expect(h).toContain('>innstilt<');
    expect(h).not.toContain('rekker ikke');
  });
  it('avviksmerket følger meldingene for linja', () => {
    const [x] = tavleUtvalg([d([kall(9)])], NÅ);
    expect(tavleRadHtml(x, NÅ, 0, id => (id === 'L3' ? [{ summary: [{ value: 'Signalfeil' }] }] : []))).toMatch(/at-avvik[\s\S]*title="Signalfeil"|title="Signalfeil"[\s\S]*at-avvik/);
    expect(tavleRadHtml(x, NÅ, 0, () => [])).not.toContain('at-avvik');
  });
  it('uten sanntid: «rutetid»', () => {
    const [x] = tavleUtvalg([d([kall(9, { rt: false })])], NÅ);
    expect(tavleRadHtml(x, NÅ, 0)).toContain('at-rutetid');
    const [y] = tavleUtvalg([d([kall(9)])], NÅ);
    expect(tavleRadHtml(y, NÅ, 0)).not.toContain('at-rutetid');
  });
  it('intervjuet flyttes over lista i Auto-tavle', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/_autoTavle = !!på;[\s\S]{0,700}_flyttProfil\(_autoTavle\);/);   // v1.218.171: ny henting ved modusbytte står mellom
  });
});
