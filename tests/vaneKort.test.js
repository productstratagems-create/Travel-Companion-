// v1.218.97 «Dit du ofte skal treffer svært dårlig»: tirsdag 18:56 på Mortensrud.
import { describe, it, expect, vi } from 'vitest';
import { rangerMål, VANE_MIN } from '../src/maalModell.js';

const L = (dag, hh, mm = 0) => new Date(2026, 10, dag, hh, mm).getTime();   // 10. nov = tirsdag
const MORT = { name: 'Mortensrud', lat: 59.8494, lon: 10.8294 };
const JBT = { name: 'Jernbanetorget', lat: 59.9119, lon: 10.7504 };
const tur = (til, bucket, count) => ({ toName: til, fromName: 'Mortensrud', bucket, isWeekend: false, count });

describe('«du pleier» krever en vane', () => {
  it('én reise fire timer før er ikke «du pleier hit rundt nå»', () => {
    const r = rangerMål([JBT], { nå: L(10, 18, 56), her: MORT, hist: [tur('Jernbanetorget', 7, 1)] });
    expect(r[0].grunn).not.toMatch(/pleier/);
    expect(r[0].vane).toBe(false);
  });
  it('to reiser i samme tidsrom er en vane', () => {
    expect(VANE_MIN).toBe(2);
    const r = rangerMål([JBT], { nå: L(10, 18, 56), her: MORT, hist: [tur('Jernbanetorget', 9, 2)] });
    expect(r[0].grunn).toBe('du pleier hit tirsdager rundt nå');
    expect(r[0].vane).toBe(true);
  });
});

const auto = await import('../src/views/auto.js');
describe('ett kort per avgang', () => {
  it('to mål med samme første avgang blir ett kort med «også»', () => {
    const a = { name: 'Helsfyr', options: [{ i: 0, at: 1 }] };
    const b = { name: 'Jernbanetorget', options: [{ i: 0, at: 2 }] };
    const c = { name: 'Ski', options: [{ i: 1, at: 3 }] };
    const ut = [a, b, c].reduce(auto.slåSammenSammeAvgang, []);
    expect(ut.map(x => x.name)).toEqual(['Helsfyr', 'Ski']);
    expect(ut[0].også).toEqual([{ name: 'Jernbanetorget', at: 2 }]);
  });
  it('uten vane sier kortet hva appen vet: et valg er ikke en reise (v1.218.105)', () => {
    expect(auto.grunnUtenVane(1)).toBe('valgt før');
    expect(auto.grunnUtenVane(5)).toBe('ofte valgt herfra');
  });
});
