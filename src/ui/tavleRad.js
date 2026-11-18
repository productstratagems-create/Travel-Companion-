/**
 * TAVLERADEN for Auto-tavle (v1.218.107). Bestilt: «Lag en testside som
 * kombinerer alt som er typisk "proven" i både tavla og Auto-reise.»
 *
 * Det tavla har som alle kjenner fra perrongskjermen: stor nedtelling,
 * linjemerket i linjens farge, retningen, klokkeslettet og sporet. Én rad
 * per AVGANG, ikke per retning. Data fra auto-reise (`groupDirections`),
 * og «rekker du den» med auto-reisens egen regel (`kanRekke`), så de to
 * aldri sier hvert sitt. Ren.
 */
import { esc, clk, NEDTELLING_MAKS_MIN } from './fmt.js';
import { linjemerke } from './linjemerke.js';

export const TAVLE_PER_RETNING = 3;
export const TAVLE_MAKS = 12;

/**
 * @param {Array} dirs groupDirections-rader
 * @param {number} nå
 * @param {(ms:number)=>boolean} kanRekke
 */
export function tavleUtvalg(dirs, nå, kanRekke = () => true, perRetning = TAVLE_PER_RETNING, maks = TAVLE_MAKS) {
  const sett = new Set();   // samme tur fra to sider er én avgang (v1.218.109)
  return (dirs || []).flatMap(d => (d.calls || [])
    .filter(x => { const id = x && x.call && x.call.serviceJourney && x.call.serviceJourney.id;
      if (!id) return true; if (sett.has(id)) return false; sett.add(id); return true; })
    .filter(x => x && Number.isFinite(x.ms) && x.ms >= nå - 60_000 && !x.innstilt)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, perRetning)
    .map(x => ({ d, ms: x.ms, call: x.call, rekker: !!kanRekke(x.ms) })))
    .sort((a, b) => a.ms - b.ms)
    .slice(0, maks);
}

export function tavleRadHtml(x, nå, i) {
  const l = (x.d.lines && x.d.lines[0]) || {};
  const min = Math.floor((x.ms - nå) / 60_000);
  const spor = x.call && x.call.quay && x.call.quay.publicCode;
  const merke = linjemerke({ kode: l.code, farge: l.colour, tekst: l.tekst, linjeId: l.id, modus: l.mode });
  return '<button type="button" class="at-rad' + (x.rekker ? '' : ' at-rekker-ikke') + '" data-i="' + i + '"'
    + ' aria-label="' + esc((l.code || '') + ' mot ' + (x.d.frontText || '') + ', ' + (min < 1 ? 'nå' : min >= NEDTELLING_MAKS_MIN ? 'kl. ' + clk(x.ms) : 'om ' + min + ' min')
      + (spor ? ', spor ' + spor : '') + (x.rekker ? '' : ', rekker ikke')) + '">'
    // Klokkeslett fra NEDTELLING_MAKS_MIN, som tavla (v1.218.111).
    + (min >= NEDTELLING_MAKS_MIN
      ? '<span class="at-min at-min-klokke">' + esc(clk(x.ms)) + '</span>'
      : '<span class="at-min">' + (min < 1 ? 'nå' : min) + (min < 1 ? '' : '<small>min</small>') + '</span>')
    + '<span class="at-midt">' + merke + '<span class="at-front">' + esc(x.d.frontText || '') + '</span>'
    // Fra et nabostopp i knutepunktet (v1.218.119): hvor du går om bord.
    + (x.call && x.call._fra && x.call._fra.name ? '<span class="at-fra">fra ' + esc(x.call._fra.name) + '</span>' : '')
    + (x.rekker ? '' : '<span class="at-merk">rekker ikke</span>') + '</span>'
    // Ikke samme klokkeslett to ganger: står det til venstre, er høyre tom.
    + '<span class="at-klokke">' + (min >= NEDTELLING_MAKS_MIN ? '' : esc(clk(x.ms))) + '</span>'
    + '<span class="at-spor">' + (spor ? '<small>spor</small>' + esc(spor) : '') + '</span>'
    + '</button>';
}

/** Så mange rader til per side når du ruller (v1.218.109). */
export const TAVLE_SIDE = 12;

/**
 * DE DU IKKE REKKER, FOR SEG (v1.218.109). Bestilt: «Legg de avganger bruker
 * ikke ser ut til å rekke i en egen kollapset gruppering, som bruker kan
 * velge om denne vil se.» Og: «Infinite scroll på lista.» Alle avganger,
 * sortert på tid som tavla (ingen grense per retning); de du rekker kuttes
 * ved `grense`, og `tomForLokale` sier at neste side må hentes. Ren.
 */
export function tavleDel(dirs, nå, kanRekke, grense) {
  const alle = tavleUtvalg(dirs, nå, kanRekke, Infinity, Infinity);
  const rekker = alle.filter(x => x.rekker);
  return { ikke: alle.filter(x => !x.rekker), rekker: rekker.slice(0, grense),
    tomForLokale: rekker.length <= grense, sisteMs: alle.length ? alle[alle.length - 1].ms : null };
}
