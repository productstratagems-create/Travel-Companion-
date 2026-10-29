// Entur requires every consumer to identify itself; requests without the
// header risk throttling. Merge it into all calls against api.entur.io.
export const ET_CLIENT_NAME = 'productstratagems-travel-companion';

/**
 * HVOR LENGE VI VENTER FØR VI GIR OPP.
 *
 * Sto som `10000` inne i `route.js`, og fantes ingen andre steder. En
 * `fetch` uten dette avvises ALDRI når forbindelsen henger — verken `.then`
 * eller `.catch` fyrer, og det kallestedet som ventet på svaret står for
 * alltid.
 *
 * Ett navn, tre lesere: gangruteren, været og stedene.
 *
 * Overpass sin egen `[out:json][timeout:20]` blir stående urørt — det er
 * serverens budsjett for å REGNE, et annet faktum enn hvor lenge vi venter
 * på at noe skal komme tilbake.
 */
export const REQUEST_TIMEOUT_MS = 10_000;

/** En `fetch` som gir opp. Samme signatur, så den kan bytte inn hvor som helst. */
export function fetchMedFrist(url, opts = {}) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/* OG DENNE MANGLET FRISTEN, SELV ETTER v1.170.0.
 *
 * Da ga jeg vær, steder og gangruten tidsavbrudd — og ikke oppslaget som
 * må LYKKES FØR dem. `_resolveArrivalLL` går via Enturs geokoder, og henger
 * den, blir `_arrivalSections` aldri kalt. Begge seksjonene står da på
 * «henter …» for alltid, akkurat som før — bare ett hakk lenger opp.
 *
 * Og reproduksjonen min så det ikke: den kaller `_arrivalSections` direkte
 * og hoppet dermed over nettopp porten. Et måleinstrument som ikke når
 * stedet det skal måle.
 *
 * En egen `signal` fra kalleren vinner, så avbrytbare søk (`settings.js`,
 * `entur.js`) beholder sin egen. */
export function enturFetch(url, opts = {}) {
  return fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...opts,
    headers: { 'ET-Client-Name': ET_CLIENT_NAME, ...(opts.headers || {}) },
  });
}
