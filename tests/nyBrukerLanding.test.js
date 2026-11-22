// v1.218.250: ny start på onboarding. Evalueringen antok at nye brukere lander
// i «fritid» i helgene; koden sier noe annet: `weekend` er et LAGRET valg
// (loadWeekendMode), satt bare når du selv har åpnet utforsk. Testen holder det.
import { describe, it, expect } from 'vitest';
import { landingChoice } from '../src/firstRun.js';
describe('en ny bruker lander i Auto-tavle', () => {
  it('ingenting lagret: auto — uansett ukedag (helg er et valg, ikke en dag)', () => {
    expect(landingChoice({})).toBe('auto');
    expect(landingChoice({ autoPref: null, weekend: false, storedRoute: false })).toBe('auto');
  });
  it('den som selv har valgt fritid, lander der', () => {
    expect(landingChoice({ weekend: true })).toBe('leisure');
  });
});
