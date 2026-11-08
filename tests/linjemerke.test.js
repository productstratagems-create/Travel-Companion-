// Linjemerket: Linjes TravelTag som grunnform, og et formspråk per tilbyder.
// Bestilt: «Ta i bruk https://linje.entur.no/komponenter og … bruk et formspråk som gjør at bruker
// gjenkjenner viktige tilbydere sine tilbud, eksempelvis Ruter sitt tilbud, Vy sitt tilbud osv.»
// Valgt: form + farge per tilbyder, med liten tilbyderbokstav; linjemerker + fargetokens.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { linjemerke, tilbyder, TILBYDERE, LINJE_FARGE, tekstFarge } from '../src/ui/linjemerke.js';

describe('tilbyder', () => {
  it('leses fra kodeområdet i linje-id-en', () => {
    expect(tilbyder('RUT:Line:74').navn).toBe('Ruter');
    expect(tilbyder('VYG:Line:R10').navn).toBe('Vy');
    expect(tilbyder('SKY:Line:2').navn).toBe('Skyss');
    expect(tilbyder('ATB:Line:3').navn).toBe('AtB');
    expect(tilbyder('FLT:Line:FX').navn).toBe('Flytoget');
  });
  it('ukjent eller mangler: ingen tilbyder — vi later ikke som vi vet', () => {
    expect(tilbyder('XYZ:Line:1')).toBe(null);
    expect(tilbyder(undefined)).toBe(null);
  });
  it('hver tilbyder har sin egen form og bokstav', () => {
    const former = Object.values(TILBYDERE).map(t => t.navn + ':' + t.form + ':' + t.kort);
    expect(new Set(Object.values(TILBYDERE).filter(t => ['Ruter', 'Vy', 'Skyss', 'AtB'].includes(t.navn)).map(t => t.form)).size).toBe(4);
    expect(former.length).toBeGreaterThan(8);
  });
});

describe('linjemerke', () => {
  it('Ruter 74: linjens egen farge, Ruter-form, bokstav og navn for skjermleser', () => {
    const h = linjemerke({ kode: '74', farge: 'E60000', linjeId: 'RUT:Line:74', modus: 'bus' });
    expect(h).toContain('class="line-badge lm lm-firkant"');
    expect(h).toContain('--lm-bg:#E60000');
    expect(h).toContain('>74<');
    expect(h).toContain('<span class="lm-tilb" aria-hidden="true">R</span>');
    expect(h).toContain('aria-label="Ruter linje 74"');
  });
  it('uten farge fra Entur: Linjes farge for transportmiddelet', () => {
    const h = linjemerke({ kode: 'R10', linjeId: 'VYG:Line:R10', modus: 'rail' });
    expect(h).toContain('--lm-bg:' + LINJE_FARGE.rail);
    expect(h).toContain('lm-pille');
  });
  it('uten tilbyder: Linjes grunnform, ingen bokstav', () => {
    const h = linjemerke({ kode: '3', farge: '#EC700C' });
    expect(h).toContain('class="line-badge lm lm-linje"');
    expect(h).not.toContain('lm-tilb');
    expect(h).toContain('--lm-bg:#EC700C');
  });
  it('escaper koden', () => {
    expect(linjemerke({ kode: '<b>' })).toContain('&lt;b&gt;');
  });
  it('lesbar tekst: mørk på lyst, hvit på mørkt', () => {
    expect(tekstFarge('#ffe082')).toBe('#181c56');
    expect(tekstFarge('#c5044e')).toBe('#ffffff');
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
