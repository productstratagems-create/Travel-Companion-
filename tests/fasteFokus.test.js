// v1.218.260: «inputfeltet for annet stopp holder seg ikke i fokus».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
describe('søkefeltet i «dine faste stopp» beholder fokus', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  const f = a.slice(a.indexOf('function _tegnFasteStopp('), a.indexOf('function _tegnFasteStopp(') + 4000);
  it('sammenligner med det som sist ble skrevet, ikke nettleserens innerHTML', () => {
    expect(f).toMatch(/if \(el\._sistKort === html && el\.firstElementChild\) return true;/);
    expect(f).not.toMatch(/if \(el\.innerHTML === html\) return true;/);
  });
  it('bytter aldri kortet mens du skriver i det', () => {
    expect(f).toMatch(/if \(el\.contains\(document\.activeElement\) && document\.activeElement\.tagName === 'INPUT'\) return true;/);
  });
});
describe('kortene på spørsmålsplassen byttes bare når innholdet endrer seg (v1.218.260)', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('ingen sammenligning med nettleserens innerHTML igjen; én husker for plassen', () => {
    expect(a).not.toMatch(/if \(el\.innerHTML === html\)/);
    expect((a.match(/el\._sistKort = html;/g) || []).length).toBe(4);
  });
});
