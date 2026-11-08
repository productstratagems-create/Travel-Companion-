// Linjemerket: Linjes TravelTag som grunnform, og et formspråk per tilbyder.
// Bestilt: «Ta i bruk https://linje.entur.no/komponenter og … bruk et formspråk som gjør at bruker
// gjenkjenner viktige tilbydere sine tilbud, eksempelvis Ruter sitt tilbud, Vy sitt tilbud osv.»
// Valgt: form + farge per tilbyder, med liten tilbyderbokstav; linjemerker + fargetokens.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { linjemerke, tilbyder, TILBYDERE, LINJE_FARGE, tekstFarge, IKON } from '../src/ui/linjemerke.js';

describe('tilbyder: navn til skjermleser, ingen egen form eller bokstav', () => {
  it('leses fra kodeområdet i linje-id-en', () => {
    expect(tilbyder('RUT:Line:74').navn).toBe('Ruter');
    expect(tilbyder('VYG:Line:R10').navn).toBe('Vy');
    expect(tilbyder('XYZ:Line:1')).toBe(null);
    expect(tilbyder(undefined)).toBe(null);
  });
  it('tabellen har bare navn — formspråket var oppfunnet (v1.218.13)', () => {
    Object.values(TILBYDERE).forEach(t => { expect(Object.keys(t)).toEqual(['navn']); });
  });
});

describe('linjemerke = Enturs TravelTag: ikon for transportmiddelet + linjenummer', () => {
  it('Ruter 74: Ruters egen farge og tekstfarge, bussikon, tilbyder bare i aria-label', () => {
    const h = linjemerke({ kode: '74', farge: 'E60000', tekst: 'FFFFFF', linjeId: 'RUT:Line:74', modus: 'bus' });
    expect(h).toContain('class="line-badge lm"');
    expect(h).toContain('--lm-bg:#E60000');
    expect(h).toContain('--lm-fg:#FFFFFF');
    expect(h).toContain('<svg class="lm-ikon" viewBox="0 0 16 16" aria-hidden="true"');
    expect(h).toContain(IKON.bus.d[0]);
    expect(h).toContain('aria-label="Ruter, buss 74"');
    expect(h).not.toMatch(/lm-tilb|lm-firkant|lm-pille|lm-diagonal|lm-flagg|lm-kant/);
  });
  it('hvert transportmiddel har sitt eget Entur-ikon', () => {
    expect(linjemerke({ kode: '3', modus: 'metro' })).toContain(IKON.metro.d[0]);
    expect(linjemerke({ kode: '11', modus: 'tram' })).toContain(IKON.tram.d[0]);
    expect(linjemerke({ kode: 'R10', modus: 'rail' })).toContain(IKON.rail.d[0]);
    expect(linjemerke({ kode: 'B9', modus: 'water' })).toContain(IKON.water.d[0]);
    expect(IKON.metro.d[0]).not.toBe(IKON.bus.d[0]);
  });
  it('regionbuss (coach) får bussikonet', () => {
    expect(linjemerke({ kode: '100', modus: 'coach' })).toContain(IKON.bus.d[0]);
  });
  it('ukjent transportmiddel: ingen ikon heller enn feil ikon', () => {
    expect(linjemerke({ kode: '7' })).not.toContain('<svg');
  });
  it('uten farge fra Entur: Linjes farge og hvit tekst, som TravelTag', () => {
    const h = linjemerke({ kode: 'R10', linjeId: 'VYG:Line:R10', modus: 'rail' });
    expect(h).toContain('--lm-bg:' + LINJE_FARGE.rail);
    expect(h).toContain('--lm-fg:#ffffff');
  });
  it('farge uten tekstfarge: kontrast regnes ut', () => {
    expect(linjemerke({ kode: '1', farge: 'ffe082', modus: 'bus' })).toContain('--lm-fg:' + tekstFarge('#ffe082'));
  });
  it('escaper koden', () => {
    expect(linjemerke({ kode: '<b>' })).toContain('&lt;b&gt;');
  });
  it('lesbar tekst: mørk på lyst, hvit på mørkt', () => {
    expect(tekstFarge('#ffe082')).toBe('#181c56');
    expect(tekstFarge('#c5044e')).toBe('#ffffff');
  });
  it('ikonene er Enturs egne (@entur/icons 10.1.1), 16×16', () => {
    expect(Object.keys(IKON).sort()).toEqual(['air', 'bus', 'cableway', 'funicular', 'metro', 'rail', 'taxi', 'tram', 'water']);
    Object.values(IKON).forEach(i => expect(i.d.length).toBeGreaterThan(0));
  });
  it('CSS-en har ingen tilbyderformer igjen', () => {
    expect(readFileSync('src/style/components.css', 'utf8')).not.toMatch(/\.lm-(tilb|firkant|pille|diagonal|flagg|kant)\b/);
  });
});

describe('Linjes fargetokens', () => {
  it('er Linjes standardverdier (@entur/tokens 4.3.1, transport.css)', () => {
    expect(LINJE_FARGE).toMatchObject({ bus: '#c5044e', metro: '#bf5826', tram: '#78469a', rail: '#00367f', water: '#0c6693', coach: '#427500', air: '#800664' });
  });
  it('kartene bruker dem — én tabell, ikke en egen kopi', () => {
    expect(readFileSync('src/ui/mapIcons.js', 'utf8')).toMatch(/import \{[^}]*LINJE_FARGE[^}]*\} from '\.\/linjemerke\.js'/);
  });
});

describe('én definisjon', () => {
  it('ingen skjerm bygger linjemerket selv lenger', () => {
    const filer = ['src/ui', 'src/views'].flatMap(d => readdirSync(d).filter(f => f.endsWith('.js')).map(f => d + '/' + f)).concat(['src/journey.js']);
    const synder = filer.filter(f => f !== 'src/ui/linjemerke.js' && /<span class="line-badge/.test(readFileSync(f, 'utf8')));
    expect(synder).toEqual([]);
  });
});

describe('tilbyderens egen tekstfarge', () => {
  it('Ruter melder hvitt på oransje — det vinner over utregnet kontrast', () => {
    expect(linjemerke({ kode: '3', farge: 'EC700C', tekst: 'FFFFFF', linjeId: 'RUT:Line:3' })).toContain('--lm-fg:#FFFFFF');
  });
  it('uten tekstfarge: regnes ut', () => {
    expect(linjemerke({ kode: '3', farge: 'EC700C', linjeId: 'RUT:Line:3' })).toContain('--lm-fg:' + tekstFarge('#EC700C'));
  });
  it('spørringene ber om den', () => {
    const q = readFileSync('src/api/queries.js', 'utf8');
    expect(q).not.toContain('presentation{colour}}');
  });
});

describe('retningsradene i auto-reise tar med transportmiddel og tekstfarge', () => {
  it('ellers blir merket uten Entur-ikon og uten Ruters hvite tall', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toContain("mode: (ln && ln.transportMode) || null,");
    expect(s).toContain("tekst: (ln && ln.presentation && ln.presentation.textColour) || null }] : [],");
    expect(s).toContain('linjemerke({ kode: l.code, farge: l.colour, tekst: l.tekst, linjeId: l.id, modus: l.mode })');
  });
});

describe('linjefilteret på Tavla', () => {
  it('bærer id, transportmiddel og tekstfarge — samme merke som radene (sett i proben)', () => {
    const s = readFileSync('src/views/board.js', 'utf8');
    expect(s).toContain('tekst: ln.presentation && ln.presentation.textColour, id: ln.id, mode: _depMode(c) });');
  });
});
