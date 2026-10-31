/**
 * Raden du ikke rekker sa ingenting.
 *
 * `reachCls` har hatt en `missed`-bøtte hele tiden (`geo.js:429`), og tavla
 * bruker den (`board.js:3093`). Men det eneste den gjør er:
 *
 *     .dep-row.missed{ opacity:.4; border-left-color:rgba(220,38,38,.3) }
 *
 * Og `showReach` krever `!missed` (`board.js:3107`), så den ene linja som
 * kunne sagt noe er AKTIVT undertrykt. Raden som trenger en setning mest, er
 * den eneste som er taus.
 *
 * AUTO-REISE LÆRTE DETTE FØR. `auto.js:1846` bærer rapporten ordrett: «Noen
 * avgangstider er gjennomstrekede, antar fordi de er utenfor
 * gangrekkevidde?» — «og ordet «antar» er rapporten». Der ble vekten
 * flyttet til den første du rekker.
 *
 * NÅ ER DET SAMME SPØRSMÅLET STILT EN GANG TIL, om en annen skjerm. En
 * produktvurdering som studerte skjermbildene konkluderte med at appen ikke
 * forstår om en avgang kan nås — mens den har visst det i sytti utgivelser.
 * Det er målingen: 40 % opasitet leses ikke som «denne rekker du ikke».
 *
 * Og AGENTS.md plasserer tavla og auto-reise i SAMME FASE. To skjermer i én
 * fase svarte ulikt på ett spørsmål.
 */
import { describe, it, expect } from 'vitest';
import { reachCls, rekkeTekst } from '../src/geo.js';
import fs from 'node:fs';

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten en `missed` å skille ut ville hver påstand
  // under vært grønn uten å ha prøvd noe.
  it('har en klasse for «du rekker den ikke»', () => {
    expect(reachCls(-1)).toBe('missed');
    expect(reachCls(3)).not.toBe('missed');
  });
});

describe('rekkeTekst', () => {
  /* FØR-BILDET. Det fantes ingen ord i det hele tatt. */
  it('sier det med ord når du ikke rekker den', () => {
    expect(rekkeTekst('missed')).toBeTruthy();
    expect(rekkeTekst('missed')).toMatch(/rekker ikke/i);
  });

  /* OG TIER ELLERS. Raden du KAN rekke har alt «gå senest 10:12» fra
   * `showReach`, og det er mer handlingsrettet enn en etikett. To setninger
   * om samme forhold på samme rad er støy, ikke informasjon. */
  it('og tier om alle de andre', () => {
    ['r-far', 'r-ok', 'r-soon', 'r-now', '', null, undefined].forEach(r =>
      expect(rekkeTekst(r), String(r)).toBe(''));
  });

  /* ÉN ORDLYD, IKKE TO. Ordene bor sammen med dommen de hører til, slik
   * `SRC_LABEL` bor sammen med kildene og `ORD` med belegningsnivåene. */
  it('bor sammen med reachCls, som gir dommen', () => {
    const src = fs.readFileSync('src/geo.js', 'utf8');
    expect(src.indexOf('export function rekkeTekst')).toBeGreaterThan(-1);
    expect(src.indexOf('export function reachCls')).toBeGreaterThan(-1);
  });
});

/* ── OG TAVLA SIER DET ──────────────────────────────────────────────────
 *
 * Sjette gang i denne økta: regelen kan være aldri så riktig, men sier ikke
 * raden det, står den taus som før og hver påstand over er grønn.
 */
describe('og raden på tavla bærer ordene', () => {
  const src = () => fs.readFileSync('src/views/board.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('leser regelen framfor å finne på sin egen', () => {
    expect(src()).toMatch(/rekkeTekst\(/);
    expect(src()).not.toMatch(/'rekker ikke'/);
  });

  /* OG DEN NÅR SKJERMLESEREN. En rad på 40 % opasitet er ingenting for den
   * som ikke ser skjermen — der har «rekker ikke» alltid manglet helt. */
  it('og ordene står i radens tekst, ikke bare i en klasse', () => {
    const s = src();
    const i = s.indexOf('rekkeTekst(');
    expect(i).toBeGreaterThan(-1);
    // Brukt i radens HTML, ikke bare regnet ut og lagt bort.
    expect(s.slice(Math.max(0, i - 300), i + 300)).toMatch(/dep-|rowCls|html|\+=/);
  });
});
