// v1.218.131: retningsfilter i Auto-tavle — én definisjon med Auto-reises seksjoner.
import { describe, it, expect } from 'vitest';
import { filtrerRetning, AT_RETNINGER, AT_RETNING_TEKST } from '../src/views/auto.js';
import { readFileSync } from 'node:fs';

const A = { id: 'a' }, B = { id: 'b' }, C = { id: 'c' };
const g = d => (d === A ? 'mot' : null);

describe('retningsfilteret', () => {
  it('«mot sentrum» slipper bare sentrumsretninger gjennom', () => {
    expect(filtrerRetning([A, B, C], 'mot', g)).toEqual([A]);
  });
  it('«andre retninger» er resten, og «alle» er alt', () => {
    expect(filtrerRetning([A, B, C], 'andre', g)).toEqual([B, C]);
    expect(filtrerRetning([A, B, C], 'alle', g)).toEqual([A, B, C]);
  });
  it('knappene i rekkefølge med tekst', () => {
    expect(AT_RETNINGER.map(k => AT_RETNING_TEKST[k])).toEqual(['alle', 'mot sentrum', 'andre retninger']);
  });
  it('Auto-reise og Auto-tavle bruker samme definisjon', () => {
    const src = readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/side\.set\(i, retningGruppe\(d, here, walkMins, now\)\)/);
    expect(src).toMatch(/retningGruppe\(d, here, gang, nå\)/);
    expect(src).toMatch(/filtrerRetning\(dirs, _atRetning/);   // via _iRetning (v1.218.134)
  });
});

describe('kartet følger filteret (v1.218.134)', () => {
  const src = readFileSync('src/views/auto.js', 'utf8');
  it('lista og kartet leser samme filter', () => {
    expect(src).toMatch(/const iRetning = _iRetning\(synlige, nå\);/);
    expect(src).toMatch(/edderkoppBein\(_iRetning\(_dirs\), _stop\.name,/);
  });
  it('kartet tegnes på nytt når retningen byttes', () => {
    expect(src).toMatch(/'\|r' \+ \(_autoTavle \? _atRetning : '-'\)/);
  });
});
