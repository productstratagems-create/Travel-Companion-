/**
 * Overganger: hva du kan bytte til, der du skal av eller kommer fram.
 *
 * Bestilt: «utforske om auto-reise kan ha en funksjon der appen sjekker for
 * mulige overganger til andre linjer og/eller kollektivtilbud på neste
 * stasjon/holdeplass og gir bruker dermed mer oversikt over mulige andre
 * reiseopsjoner underveis.» Valgt: relevante overganger.
 *
 * SAMME SPØRSMÅL SOM «VIDERE MED KOLLEKTIVT» på underveis (v1.212.1): fra
 * ankomsten, ikke fra nå, med tak per linje og retning. Tallene ble flyttet
 * hit fra track.js, så de to skjermene ikke kan spørre ulikt.
 *
 * Ren: ingen DOM og intet nett. Leser bytte.js (byttetid) og geo.js (`reachCls`,
 * samme dom som raden ellers får).
 */
import { transferMargin } from './bytte.js';
import { reachCls } from './geo.js';
import { stopKey } from './stopId.js';

/**
 * Hvor lenge før ankomst lista starter: nok til de to du så vidt mister.
 *
 * 5 → 2, og 24 → 40. Funnet av funksjonsrutene (v1.216.2): på Jernbanetorget
 * gikk alle de 24 avgangene i de 5 minuttene før ankomst. På et stort
 * knutepunkt ble hele lista brukt på tilbakeblikket, og du fikk bare de du
 * ikke rekker.
 */
export const ARR_BOARD_LOOKBACK_MINS = 2;
/** Hvor mange avganger, og høyst hvor mange per linje og retning. */
export const ARR_BOARD_ASK = 40;
export const ARR_BOARD_PER_LINE = 2;
/** How far ahead the onward list looks. */
export const ARR_BOARD_HORIZON_MINS = 90;

/**
 * Hva «videre med kollektivt» spør om: FRA ANKOMSTEN, ikke fra nå.
 *
 * Rapportert med skjermbilde ved Tveita, 17 min før ankomst: lista spurte om
 * de åtte neste fra NÅ. Alle åtte gikk før du var framme. Spurt fra ankomst
 * med tak per linje ga samme stopp T-bane 2 og bussene 58 og 69.
 */
export function arrBoardSpørsmål(ankomstMs) {
  return { fraMs: ankomstMs - ARR_BOARD_LOOKBACK_MINS * 60000,
    perLinje: ARR_BOARD_PER_LINE, vinduMin: ARR_BOARD_HORIZON_MINS + ARR_BOARD_LOOKBACK_MINS };
}

/** Så mange vises når ingen går mot et sted du pleier å reise til. */
export const OVERGANG_MAKS = 3;
/** Lenger fram enn dette er ikke en overgang, det er en annen reise. */
export const OVERGANG_HORISONT_MIN = 30;

/**
 * Overgangene på neste stopp, relevante først.
 *
 * - Linja du sitter på er ikke en overgang («bli sittende»).
 * - Innstilte og de du ikke rekker står ikke. Dette er hva du KAN gjøre.
 * - Relevante først: de som går mot et sted du ofte reiser til (navnet på
 *   skiltet matcher et av stedene). Så de første du rekker, høyst
 *   OVERGANG_MAKS til sammen når ingen er relevante.
 *
 * @param {Array} board fetchArrBoard-rader {ln, dest, depTs, quay, cancelled, journeyId}
 * @param {number} ankomstMs når du er der
 * @param {{linje?:string, journeyId?:string, ofte?:string[], ekstraMin?:number}} o
 * @returns {{rader:Array<{c, mins, rcls, relevant}>, totalt:number}}
 */
export function overganger(board, ankomstMs, o) {
  const opt = o || {};
  const ofte = new Set((opt.ofte || []).map(stopKey).filter(Boolean));
  const alle = (board || [])
    .filter(c => c && Number.isFinite(c.depTs) && !c.cancelled)
    .filter(c => !(opt.journeyId && c.journeyId === opt.journeyId))
    .filter(c => !(opt.linje && c.ln && String(c.ln.publicCode) === String(opt.linje)))
    .map(c => {
      const mins = Math.floor((c.depTs - ankomstMs) / 60000);
      const rcls = reachCls(transferMargin(c.depTs, ankomstMs, false, opt.ekstraMin || 0));
      return { c, mins, rcls, relevant: ofte.has(stopKey(c.dest)) };
    })
    .filter(r => r.rcls !== 'missed' && r.mins <= OVERGANG_HORISONT_MIN)
    .sort((a, b) => a.c.depTs - b.c.depTs);
  const rel = alle.filter(r => r.relevant);
  const rader = rel.length ? rel.concat(alle.filter(r => !r.relevant)).slice(0, Math.max(rel.length, OVERGANG_MAKS))
    : alle.slice(0, OVERGANG_MAKS);
  return { rader, totalt: alle.length };
}
