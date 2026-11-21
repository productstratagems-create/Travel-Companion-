import { rekkTekst } from '../rekkLengerNed.js';
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
    // INNSTILTE STÅR (v1.218.126), overstrøket — som tavla. De ble filtrert
    // bort, og en som ventet på den så bare at den manglet.
    .filter(x => x && Number.isFinite(x.ms) && x.ms >= nå - 60_000)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, perRetning)
    .map(x => ({ d, ms: x.ms, call: x.call, innstilt: !!x.innstilt, rekker: !!kanRekke(x.ms, x.call) })))
    .sort((a, b) => a.ms - b.ms)
    .slice(0, maks);
}

/**
 * @param {(linjeId)=>Array} [meldinger] avvikene for en linje (byLine), så
 *   raden kan merke dem uten å lese global tilstand (v1.218.126)
 */
export function tavleRadHtml(x, nå, i, meldinger = () => []) {
  const l = (x.d.lines && x.d.lines[0]) || {};
  const avvik = (l.id && meldinger(l.id)) || [];
  const tittel = avvik.length ? avvik.map(m => (m && m.summary && m.summary[0] && m.summary[0].value) || 'melding').join(' · ') : '';
  const rutetid = x.call && x.call.realtime === false;
  const min = Math.floor((x.ms - nå) / 60_000);
  const spor = x.call && x.call.quay && x.call.quay.publicCode;
  const merke = linjemerke({ kode: l.code, farge: l.colour, tekst: l.tekst, linjeId: l.id, modus: l.mode });
  return '<button type="button" class="at-rad' + (x.rekker ? '' : ' at-rekker-ikke') + (x.best ? ' at-best' : '') + (x.innstilt ? ' at-innstilt' : '') + '" data-i="' + i + '"'
    + ' aria-label="' + esc((l.code || '') + ' mot ' + (x.d.frontText || '') + ', ' + (min < 1 ? 'nå' : min >= NEDTELLING_MAKS_MIN ? 'kl. ' + clk(x.ms) : 'om ' + min + ' min')
      + (spor ? ', spor ' + spor : '') + (x.innstilt ? ', innstilt' : x.rekker ? '' : ', rekker ikke')
      + (rutetid ? ', etter rutetid' : '') + (tittel ? ', avvik: ' + tittel : '')) + '"'
    + (tittel ? ' title="' + esc(tittel) + '"' : '') + '>'
    // Klokkeslett fra NEDTELLING_MAKS_MIN, som tavla (v1.218.111).
    + (min >= NEDTELLING_MAKS_MIN
      ? '<span class="at-min at-min-klokke">' + esc(clk(x.ms)) + '</span>'
      : '<span class="at-min">' + (min < 1 ? 'nå' : min) + (min < 1 ? '' : '<small>min</small>') + '</span>')
    + '<span class="at-midt">' + merke + (avvik.length ? '<span class="at-avvik" aria-hidden="true">!</span>' : '')
    + '<span class="at-front">' + esc(x.d.frontText || '') + '</span>'
    + (x.innstilt ? '<span class="at-merk">innstilt</span>' : '')
    // ANKOMST (v1.218.193): bare til et vanlig mål på turen — samme ord som Rute («ank.»).
    + (x.ank && !x.innstilt ? '<span class="at-ank">ank. ' + esc(x.ank.navn) + ' ' + esc(clk(x.ank.ms)) + '</span>' : '')
    // Fra et nabostopp i knutepunktet (v1.218.119): hvor du går om bord.
    // Rekkes den lenger ned, sier den linja hvor; «fra» ville sagt et sted du ikke går til.
    // FRA-STOPPET PÅ HVER RAD (v1.218.225). Rapportert: «Fra-stasjon er ikke
    // tydelig nok visualisert på kortene — gitt at det kan være ulike
    // fra-stasjoner på ulike kort.» Hver rad bærer stoppet den går fra, som et
    // merke med stoppikon, i full tekstfarge — også når det er stoppet ditt.
    + (() => { const n = !x.rekk && ((x.call && x.call._fra && x.call._fra.name) || x.herNavn); return n ? fraMerke(n, x.gang) : ''; })()
    // REKK DEN LENGER NED (v1.218.185): samme tekst som Rute.
    + (x.rekk ? '<span class="at-rekk">rekker ikke her — ' + esc(rekkTekst(x.rekk, clk)) + '</span>' : '')
    // NÅR DU MÅ GÅ (v1.218.171), til fots.
    + (x.rekker && !x.innstilt && Number.isFinite(x.gåOm) ? '<span class="at-gaa-om">' + (x.gåOm <= 0 ? 'gå nå' : 'gå om ' + x.gåOm + ' min') + '</span>' : '')
    // «bak deg» står ikke lenger (v1.218.219): rapportert «hjelper ikke bruker».
    // Den sto på hver rad når du gikk bort fra stoppet — og sa ikke hva du skulle
    // gjøre. `x.bak` brukes fortsatt i rekkefølgen (tavleFrigjort).
    // Hjemover med bytte (v1.218.151): hvor du bytter.
    + (x.bytte ? '<span class="at-fra">bytt på ' + esc(x.bytte) + '</span>' : '')
    + (x.rekker || x.innstilt ? '' : '<span class="at-merk">rekker ikke</span>') + '</span>'
    // Ikke samme klokkeslett to ganger: står det til venstre, er høyre tom.
    + '<span class="at-klokke">' + (min >= NEDTELLING_MAKS_MIN ? '' : esc(clk(x.ms)))
    + (rutetid ? '<small class="at-rutetid">rutetid</small>' : '') + '</span>'
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

/** Fra-stoppet som merke: «⬤ Mortensrud · 12 min å gå». Én definisjon for tavlerad og kombinasjonsrad. Ren. */
export function fraMerke(navn, gangMin) {
  return '<span class="at-fra at-fra-stopp"><span class="fra-ikon" aria-hidden="true"></span>fra <b>' + esc(navn) + '</b>'
    + (Number.isFinite(gangMin) ? ' · ' + gangMin + ' min å gå' : '') + '</span>';
}
