/**
 * GJENTAKENDE REISER (v1.218.167). Bestilt: «Legg til mulighet for å sette
 * "recurring" på reiser i reiseplanen. Sjekk hva som er proven om slikt.»
 *
 * Som Google Kalender, iOS Påminnelser, Citymapper og Ruters faste reiser:
 * forhåndsvalg (hver dag · hverdager · helg) og ukedagsknapper, neste
 * forekomst alltid synlig, og en gjentakelse er KLOKKESLETT OG LINJE — ikke en
 * bestemt tur. Rent; ukedager etter Date.getDay() (0 = søndag).
 */
const DAG = 86_400_000;
export const UKEDAG_KORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const UKEDAG_BOKSTAV = ['S', 'M', 'T', 'O', 'T', 'F', 'L'];
/** Visningsrekkefølge: mandag først. */
export const UKE = [1, 2, 3, 4, 5, 6, 0];
export const FORHÅNDSVALG = {
  'hver dag': [0, 1, 2, 3, 4, 5, 6],
  hverdager: [1, 2, 3, 4, 5],
  helg: [0, 6],
};
const ICS_DAG = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const sortert = d => [...new Set(d || [])].filter(x => x >= 0 && x <= 6).sort((a, b) => a - b);
const lik = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** «hver dag», «hverdager», «helg», ellers «man, ons, fre». */
export function gjentakTekst(dager) {
  const d = sortert(dager);
  for (const [navn, ds] of Object.entries(FORHÅNDSVALG)) if (lik(d, sortert(ds))) return navn;
  return UKE.filter(x => d.includes(x)).map(x => UKEDAG_KORT[x]).join(', ');
}

/** BYDAY til en RRULE: MO,TU,… */
export function gjentakByday(dager) {
  return UKE.filter(x => sortert(dager).includes(x)).map(x => ICS_DAG[x]).join(',');
}

/**
 * Neste forekomst av etappen: samme klokkeslett som `depIso`, på en valgt dag,
 * som ikke er ferdig (avgang + varighet > nå) — den pågående turen mens den
 * varer. → { dep, arr } i ms, eller null uten gjentakelse.
 */
export function nesteGjentak(leg, nå) {
  const d = sortert(leg && leg.gjentak && leg.gjentak.dager);
  if (!d.length || !leg.depIso) return null;
  const dep0 = new Date(leg.depIso);
  const varighet = leg.arrIso ? Math.max(0, Date.parse(leg.arrIso) - dep0.getTime()) : 30 * 60_000;
  const start = new Date(nå); start.setHours(dep0.getHours(), dep0.getMinutes(), 0, 0);
  for (let i = -1; i <= 7; i++) {
    const t = new Date(start.getTime()); t.setDate(start.getDate() + i);
    if (!d.includes(t.getDay())) continue;
    if (t.getTime() + varighet > nå) return { dep: t.getTime(), arr: t.getTime() + varighet };
  }
  return null;
}

/** Etappen slik den gjelder nå: tidene flyttet til neste forekomst. Ren. */
export function gjeldende(leg, nå) {
  const n = nesteGjentak(leg, nå);
  if (!n) return leg;
  return { ...leg, depIso: new Date(n.dep).toISOString(), arrIso: new Date(n.arr).toISOString(), _gjentakNå: true };
}
