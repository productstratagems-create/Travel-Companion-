import { describe, it, expect } from 'vitest';
import { målområder } from '../src/maalomrader.js';
// Stenbråtveien 81D. Rekonstruerte retninger som ikke går mot sentrum.
const HER = { lat: 59.8552, lon: 10.8322 };
const s = (name, lat, lon) => ({ name, lat, lon });
const HOLMLIA = s('Holmlia stasjon', 59.8355, 10.7945), KOLBOTN = s('Kolbotn stasjon', 59.8106, 10.8000);
const LØRENSKOG = s('Lørenskog sentrum', 59.9270, 10.9640), MORTENSRUD = s('Mortensrud', 59.8497, 10.8292);
const LJAN = s('Ljan', 59.8350, 10.7980), BØLER = s('Bøler', 59.8840, 10.8450);
const dirs = [
  { frontText: 'Holmlia', key: '73H', stopp: [MORTENSRUD, LJAN, HOLMLIA] },
  { frontText: 'Kolbotn', key: '72K', stopp: [MORTENSRUD, LJAN, KOLBOTN] },
  { frontText: 'Lørenskog', key: '300L', stopp: [BØLER, LØRENSKOG] },
];
const kjør = d => målområder(d, HER, x => x.stopp, x => x.key);
describe('målområder (v1.218.213)', () => {
  it('før-bildet: «andre retninger» blir delt — sørvest og nordøst er to valg', () => {
    const o = kjør(dirs);
    expect(o.length).toBe(2);
    const lør = o.find(x => x.nøkler.has('300L')), sør = o.find(x => x.nøkler.has('73H'));
    expect(lør).not.toBe(sør);
    expect(sør.nøkler.has('72K')).toBe(true);
  });
  it('hver retning i nøyaktig ett område', () => {
    const o = kjør(dirs);
    dirs.forEach(d => expect(o.filter(x => x.nøkler.has(d.key))).toHaveLength(1));
  });
  it('navnet: målene når de er få, ellers stoppet de har felles', () => {
    const o = kjør(dirs);
    expect(o.find(x => x.nøkler.has('73H')).tekst).toBe('mot Holmlia / Kolbotn');
    // Flere enn to mål: stoppet de har felles.
    const tre = kjør([...dirs, { frontText: 'Ski', key: '500S', stopp: [MORTENSRUD, LJAN, s('Ski', 59.719, 10.835)] }]);
    expect(tre.find(x => x.nøkler.has('73H')).tekst).toBe('mot Ljan');
    expect(o.find(x => x.nøkler.has('300L')).tekst).toBe('mot Lørenskog');
  });
  it('alt går samme vei: ingen deling', () => {
    expect(kjør(dirs.slice(0, 2))).toEqual([]);
  });
});
import { readFileSync } from 'node:fs';
import { filtrerRetning } from '../src/views/auto.js';
describe('koblingen (v1.218.213)', () => {
  it('filteret slipper bare områdets retninger gjennom — lista og kartet (_iRetning)', () => {
    const d = [{ k: 'a' }, { k: 'b' }];
    expect(filtrerRetning(d, 'omr:X', () => null, () => false, x => (x.k === 'a' ? 'omr:X' : 'omr:Y'))).toEqual([{ k: 'a' }]);
  });
  it('knappene får områdene når «andre» kan deles', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const knappValg = _atOmr\.length \? \['alle', 'mot', 'hjem', \.\.\._atOmr\.map\(o => o\.id\)\] : AT_RETNINGER;/);
    expect(a).toMatch(/d => _atOmrAv\.get\(_omrNøkkel\(d\)\) \|\| null\);/);
  });
});
