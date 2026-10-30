/**
 * «Andre reisealternativer» — andre enn hva?
 *
 * Bedt om som kosmetikk:
 *
 *     «Dit du skal»    →  «Dit du ofte skal»
 *     «Hvor skal du»   →  «Andre reisealternativer»
 *
 * Den første er dessuten mer presis enn dagens: `destinations()` sorterer på
 * `uses` fra leserens egen historikk (`auto.js:2477`), så overskriften sier
 * nå hva lista faktisk ER.
 *
 * MEN «ANDRE» KREVER ET FØRSTE. `destinations()` returnerer tom liste uten
 * historikk — `if (!hist.length) return []` — og da tegnes kortseksjonen ikke
 * i det hele tatt. «ANDRE REISEALTERNATIVER» ville stått øverst på skjermen
 * uten noe å være andre enn: hos hver førstegangsbruker, og på hvert stopp
 * der ingen av dine vanlige destinasjoner går fra.
 *
 * Så ordet sies bare når det finnes et første. To ordlyder, ett navn.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

import { listeOverskrift } from '../src/views/auto.js';

const src = () => fs.readFileSync('src/views/auto.js', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const html = () => fs.readFileSync('index.html', 'utf8');

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten to ulike svar å skille ville hver påstand
  // under vært grønn uten å ha prøvd noe.
  it('har to ordlyder å skille', () => {
    expect(listeOverskrift(true)).not.toBe(listeOverskrift(false));
  });
});

describe('ordet «andre» krever et første', () => {
  /* PÅSTANDEN SOM BÆRER VALGET. */
  it('sier «andre» når det står kort over', () => {
    expect(listeOverskrift(true)).toMatch(/^andre /);
  });

  it('og sier det ikke når det ikke gjør det', () => {
    expect(listeOverskrift(false)).not.toMatch(/andre/);
  });

  // Begge er fortsatt den samme tingen, så substantivet skal ikke skifte.
  it('men det er den samme lista i begge tilfeller', () => {
    expect(listeOverskrift(false)).toContain('reisealternativer');
    expect(listeOverskrift(true)).toContain('reisealternativer');
  });

  it('tåler tull', () => {
    [null, undefined, 0, '', NaN].forEach(x =>
      expect(listeOverskrift(x), String(x)).toBe(listeOverskrift(false)));
  });
});

describe('kortene sier hva de er', () => {
  /* FØR-BILDET. Overskriften sa «dit du skal», som er hvert eneste stopp på
   * lista under også. «Ofte» er det som skiller dem — og det er sant:
   * `destinations()` rangerer på bruk. */
  it('er de du ofte reiser til, ikke bare noen du kan reise til', () => {
    expect(src()).toMatch(/set-label">dit du ofte skal</);
  });

  it('og rangeringen bak dem er faktisk på bruk', () => {
    expect(src()).toMatch(/\.sort\(\(a, b\) => b\.uses - a\.uses/);
  });
});

/* ── KALLESTEDET ────────────────────────────────────────────────────────
 *
 * Femte gang i denne økta: regelen kan være aldri så riktig, men settes
 * overskriften aldri fra renderen, står den faste strengen fra markup og
 * hver eneste påstand over er grønn.
 */
describe('og renderen setter den faktisk', () => {
  it('fra den ene regelen, der kortene skrives', () => {
    const s = src();
    expect(s).toMatch(/listeOverskrift\(/);
    /* I samme blokk som FYLLER kortcontaineren — det ene stedet som vet om
     * det ble kort.
     *
     * Forankret på `destBody.innerHTML` og ikke på id-en: `_visListeDel`
     * slår også opp `auto-dest-body`, og den står først i fila. Et søk som
     * traff den ville målt feil blokk — samme feil som i v1.182.0, da et
     * aria-label-søk traff et helt annet aria-label lenger oppe. */
    const i = s.indexOf('destBody.innerHTML');
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i, i + 500)).toMatch(/listeOverskrift\(dests\.length/);
  });

  it('og index.html har et sted å sette den', () => {
    expect(html()).toMatch(/id="auto-where-label"/);
  });

  /* Og markupen bærer fortsatt en tekst. Står den tom, ville skjermen vært
   * uten overskrift i det korte øyeblikket før første render — og en
   * seksjon uten overskrift leses som en fortsettelse av den over. */
  it('og den står ikke tom i markup', () => {
    const blokk = html().slice(html().indexOf('id="auto-where-label"'));
    expect(blokk.slice(0, 120)).toMatch(/reisealternativer/);
  });
});
