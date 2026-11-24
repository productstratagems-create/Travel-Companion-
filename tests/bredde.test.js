/* IKKE NOK PLASS I BREDDEN (v1.218.309): 73 → L2 → RE11 → 360 med operatørlogoer
 * skjøv siden til 613 px på en 390 px skjerm (målt i nettleseren før rettelsen). */
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
it('linjemerke-radene i avgangsdetaljer og Underveis brytes i stedet for å stikke ut', () => {
  const css = readFileSync('src/style/selected.css', 'utf8');
  expect(css).toMatch(/\.train-chip,\.train-bar\{flex-wrap:wrap;[^}]*max-width:100%\}/);
});
