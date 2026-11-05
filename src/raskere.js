/**
 * «Raskere hvis du går av her.»
 *
 * Bestilt etter overgangene (v1.216.0): si fra når det er raskere å gå av
 * på neste stopp og bytte, enn å bli sittende.
 *
 * SAMMENLIGNINGEN er to reisesøk til målet ditt, regnet fra når turen er der:
 * fra NESTE stopp, mot fra stoppet ETTER (eller med å bli sittende, når turen
 * du sitter på selv går til målet). Raskere er når neste stopp kommer fram
 * minst RASKERE_MIN tidligere. Mindre enn det er ikke verdt å reise seg for.
 *
 * Ren: tar Enturs mønstre og tider, ingen DOM og intet nett.
 */
export const RASKERE_MIN = 3;
/** Første avgang herfra må gå minst så lenge etter at du er der. */
export const AV_OG_PÅ_MIN = 1;

const _ms = v => (v ? new Date(v).getTime() : NaN);

/** Når et mønster er fram. */
const _fram = tp => { const l = tp && tp.legs && tp.legs[tp.legs.length - 1]; return l ? _ms(l.expectedEndTime || l.aimedEndTime) : NaN; };
/** Når første kjøretøy går. */
const _går = tp => { const l = ((tp && tp.legs) || []).find(x => x && x.mode !== 'foot'); return l ? _ms(l.expectedStartTime || l.aimedStartTime) : NaN; };

/** Det beste mønsteret du rekker fra et stopp du er ved `ankMs`. */
export function bestFra(mønstre, ankMs) {
  return (mønstre || [])
    .filter(tp => Number.isFinite(_fram(tp)) && _går(tp) >= ankMs + AV_OG_PÅ_MIN * 60000)
    .sort((a, b) => _fram(a) - _fram(b))[0] || null;
}

/**
 * @param {{herfra:Array, herfraAnk:number, senere?:Array, senereAnk?:number, bliMs?:number|null}} o
 * @returns {{tp:object, framMs:number, sparerMin:number}|null}
 */
export function raskereHer(o) {
  const best = bestFra(o.herfra, o.herfraAnk);
  if (!best) return null;
  const alt = [];
  if (Number.isFinite(o.bliMs)) alt.push(o.bliMs);
  const s = o.senere ? bestFra(o.senere, o.senereAnk) : null;
  if (s) alt.push(_fram(s));
  if (!alt.length) return null;           // ingenting å sammenligne med: si ingenting
  const sparer = Math.floor((Math.min(...alt) - _fram(best)) / 60000);
  return sparer >= RASKERE_MIN ? { tp: best, framMs: _fram(best), sparerMin: sparer } : null;
}
