/**
 * Er et reiseforslag godt? Reglene testrutene måles mot.
 *
 * Ren: tar Enturs rå mønstre og appens rader (det `boardRowDeps` gir) og
 * sier per regel om den holder, med tallene. Ingen DOM, intet nett. Brukes
 * av `tests/testruter.test.js`, både mot lagrede svar og mot Entur.
 *
 * «Beste» er reisen som kommer først fram. Det er den en bruker som skal fra
 * A til B ser etter, ikke den som går først.
 */
import { legShape } from './api/adapt.js';
import { measurePath } from './ui/path.js';

/** Hvor mye senere appens beste reise kan komme fram enn Enturs beste. */
export const MAKS_TAP_MS = 5 * 60000;

const _ms = v => (v ? new Date(v).getTime() : NaN);

/** Når et rått mønster er fram: slutten av siste etappe. */
export function råAnkomst(tp) {
  const l = tp && tp.legs && tp.legs[tp.legs.length - 1];
  return l ? _ms(l.expectedEndTime || l.aimedEndTime) : NaN;
}

/** Transportmidlene på en rad, uten gange. */
export function radModi(c) {
  return ((c && c._legs) || []).map(l => l.mode).filter(m => m && m !== 'foot');
}

/** Meter til fots på en rad, målt langs gangeetappenes former. */
export function radGangM(c) {
  return Math.round(((c && c._allLegs) || []).filter(l => l && l.mode === 'foot')
    .reduce((sum, l) => { const m = measurePath(legShape(l)); return sum + (m ? m.total : 0); }, 0));
}

/**
 * @param {object} rute fra ruter.js
 * @param {object[]} rå Enturs tripPatterns
 * @param {number} antallAdaptert hvor mange `adaptTripPattern` beholdt
 * @param {{c:object}[]} rader det tavla viser
 * @param {string[]} grunner forkastingsgrunner fra `takeDropReasons`
 * @returns {{regel:string, ok:boolean, detalj:string}[]}
 */
export function vurder(rute, rå, antallAdaptert, rader, grunner) {
  const ut = [];
  const regel = (navn, ok, detalj) => ut.push({ regel: navn, ok: !!ok, detalj });
  const r = rader || [];
  const g = grunner || [];

  regel('svar', r.length > 0, r.length + ' rader av ' + (rå || []).length + ' mønstre');
  if (!r.length) return ut;

  // Hvert forkastet mønster har en grunn. Et tall uten grunn er stille tap.
  const forkastet = (rå || []).length - antallAdaptert;
  regel('ingen stille tap', forkastet === g.length,
    forkastet + ' forkastet' + (g.length ? ': ' + g.join(', ') : ''));

  const beste = r.slice().sort((a, b) => _ms(a.c._finalArrival) - _ms(b.c._finalArrival))[0].c;
  const modi = radModi(beste);
  regel('riktig transportmiddel', modi.some(m => rute.forventer.includes(m)),
    'beste reise: ' + modi.join(' → ') + '; forventet ett av ' + rute.forventer.join(', '));

  const enturBeste = Math.min(...(rå || []).filter(tp => (tp.legs || []).some(l => l.mode !== 'foot')).map(råAnkomst));
  const appBeste = _ms(beste._finalArrival);
  regel('ikke dårligere enn Entur', appBeste - enturBeste <= MAKS_TAP_MS,
    'appen fram ' + Math.round((appBeste - enturBeste) / 60000) + ' min etter Enturs beste');

  const bytter = Math.max(0, modi.length - 1);
  regel('bytter', bytter <= rute.maxBytter, bytter + ' bytter, tillatt ' + rute.maxBytter);

  const gang = radGangM(beste);
  regel('gange', gang <= rute.maxGangM, gang + ' m, tillatt ' + rute.maxGangM);

  const avg = r.map(({ c }) => _ms(c.expectedDepartureTime));
  regel('stigende avganger', avg.every((t, i) => i === 0 || t >= avg[i - 1]),
    r.length + ' rader');
  return ut;
}
