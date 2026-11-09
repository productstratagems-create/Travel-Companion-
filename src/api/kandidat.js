/**
 * ÉN KANDIDAT av ett kall (v1.218.20): turen, og hvor den ventes å ha vært ved
 * hver fiks i sporet. Flyttet hit fra `ombordKandidater` i auto.js, så appen og
 * avspillingen av et turopptak (api/turopptak.js) bygger kandidaten likt — to
 * kopier av samme regel er feilformen AGENTS.md advarer mot.
 *
 * `form` er turens trasé når den er kjent (journeyShapeCached i appen, lagret i
 * opptaket ved avspilling); ellers rette linjer mellom stoppene.
 */
import { _interpolateVehiclePos, _interpolateOnPath } from './forventetPos.js';

export function kandidatAv(c, spor, form) {
  const sj = c && c.serviceJourney;
  const stopp = sj && sj.estimatedCalls;
  if (!sj || !sj.id || !Array.isArray(stopp) || stopp.length < 2) return null;
  const pos = at => (Array.isArray(form) && form.length >= 2
    ? _interpolateOnPath(stopp, at, form) : _interpolateVehiclePos(stopp, at));
  return {
    nøkkel: sj.id,
    linje: (sj.line && sj.line.publicCode) || '?',
    farge: (sj.line && sj.line.presentation && sj.line.presentation.colour) || null,
    front: (c.destinationDisplay && c.destinationDisplay.frontText) || '',
    call: c,
    forventet: (spor || []).map(f => {
      const p = pos(f.at);
      return { at: f.at, lat: p ? p.lat : null, lon: p ? p.lon : null };
    }),
  };
}
