/**
 * HENSIKTEN: HVA DU SKAL, ÉN REGEL FOR TAVLA OG AUTO-REISE (v1.218.85).
 *
 * Rapportert med to skjermbilder kl. 06:27: tavla og stripa sa «3 underveis ·
 * til Jernbanetorget · ANK 07:19»; auto-reise sa samme minutt «ingen faste
 * reiser i morgen» og nevnte verken målet, avgangen eller sporet. Auto-reise
 * leste `state.jny` bare om bord (via låsen), og tavlas mål aldri.
 *
 * Tre styrker, den sterkeste vinner:
 *   reise — en valgt avgang (state.jny) som ikke er framme ennå
 *   rute  — tavlas mål (state.route.to), avgang ikke valgt
 *   (vane — profilen, som før; ikke her)
 * Ren.
 */
import { ankomstMs } from './ankomst.js';
import { clk } from './ui/fmt.js';

const _ms = t => (t == null ? null : typeof t === 'number' ? t : Date.parse(t));

export function hensikt(jny, route, nå) {
  if (jny && jny.dest) {
    const l = (jny.legs || [])[0] || {};
    const ank = ankomstMs(jny);
    if (ank == null || ank > nå) {
      const avg = _ms(l.depTime && l.depTime.time);
      // FASEN (v1.218.90). Rapportert: reisen var startet og avgangen 15:24
      // «NÅ» på tavla, men auto-reise sa «rekker ikke» og foreslo buss 74.
      // En startet reise som har gått, er antatt om bord — ikke en avgang
      // du skal rekke.
      return { styrke: 'reise', fase: avg != null && avg <= nå ? 'underveis' : 'før', mål: jny.dest, linje: jny.lineCode || l.lineCode || null,
        spor: (typeof l.quay === 'string' ? l.quay : null), avgang: _ms(l.depTime && l.depTime.time),
        ank, journeyId: l.journeyId || null };
    }
  }
  if (route && route.to) return { styrke: 'rute', mål: route.to, målId: route.toStopId || null };
  return null;
}

/** Samme tur? Entur skriver id-prefikset med ulik stor bokstav enkelte steder. Ren. */
export function sammeTur(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Linja som sier hensikten. `gåMs` er tidspunktet du må gå (avgang minus
 * gangtid), samme regel som lista. Ren.
 */
export function hensiktLinje(h, nå, gåMs) {
  if (!h) return '';
  if (h.styrke === 'rute') return 'til ' + h.mål + ' fra tavla';
  if (h.fase === 'underveis') return 'din reise: ' + (h.linje ? h.linje + ' ' : '') + '→ ' + h.mål
    + (h.ank != null ? ' ' + clk(h.ank) : '') + ' · underveis';
  const deler = ['din reise: ' + [h.linje, h.avgang != null ? clk(h.avgang) : null, h.spor ? 'spor ' + h.spor : null].filter(Boolean).join(' ')
    + ' → ' + h.mål + (h.ank != null ? ' ' + clk(h.ank) : '')];
  if (gåMs != null) {
    const min = Math.round((gåMs - nå) / 60000);
    deler.push(min < 0 ? 'rekker ikke' : min === 0 ? 'gå nå' : 'gå om ' + min + ' min');
  }
  return deler.join(' · ');
}

/**
 * Reisens eget kall, bygget av turens stopp (`legs[0].stops`, rå estimatedCalls
 * fra fetchTrack). Brukes når avgangen er gått og ikke lenger står på tavla.
 * Null uten stopp. Ren.
 */
export function reiseKall(jny) {
  const l = jny && jny.legs && jny.legs[0];
  if (!l || !Array.isArray(l.stops) || l.stops.length < 2) return null;
  return { serviceJourney: { id: l.journeyId || null, line: { publicCode: jny.lineCode || l.lineCode || null,
      presentation: { colour: String(jny.lineBg || l.lineBg || '').replace('#', '') || null } }, estimatedCalls: l.stops },
    quay: { publicCode: typeof l.quay === 'string' ? l.quay : null },
    destinationDisplay: { frontText: jny.frontText || jny.dest },
    expectedDepartureTime: l.depTime && l.depTime.time, aimedDepartureTime: l.depTime && l.depTime.time };
}
