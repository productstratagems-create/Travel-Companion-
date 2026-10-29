/**
 * Progressive-web-app plumbing: register the service worker, keep the
 * offline banner honest, and make a new release actually reach the page.
 */
import { state } from './state.js';

/**
 * The worker is registered with the app version in the query string. That is
 * what makes the browser notice a release — the script URL changes — and it
 * doubles as the cache name inside sw.js, so there is no version constant in
 * the worker to keep in sync by hand.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // A worker in `vite dev` would serve yesterday's modules over today's edits.
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    // Relative, so it inherits the GitHub Pages project subpath along with
    // its scope. An absolute '/sw.js' would 404 there.
    navigator.serviceWorker.register('./sw.js?v=' + __APP_VERSION__)
      .then(reg => reg && _kobleOppdatering(reg, state))
      .catch(() => { /* No worker means no offline shell. Nothing else breaks. */ });
  });
}

/* ── APPEN KUNNE IKKE SENDE RETTELSER TIL NOEN ────────────────────────────
 *
 * Rapportert: «vær og steder laster fortsatt ikke» — etter at rettelsen var
 * utrullet og grønn. Ordlyden på skjermen avgjorde saken: det sto «laster
 * vær…», og den strengen fantes ikke lenger i koden.
 *
 * Tjenestearbeideren byttet seg selv ut — `skipWaiting()` og
 * `clients.claim()` står i `sw.js`, og registreringen over bærer versjonen
 * i URL-en, så nettleseren MERKER en utgivelse. Men ingenting fortalte den
 * kjørende SIDEN at det hadde skjedd, og ingenting lastet den på nytt.
 *
 * En PWA på hjemskjermen som iOS gjenopptar fra minnet kjører da den gamle
 * pakken i det uendelige. Og registreringen over skjer bare på `load`, som
 * aldri inntreffer ved en gjenopptakelse — så den spurte ikke engang.
 *
 * `cacheFirst` for egne filer er trygt fordi de er innholdshashet. Men en
 * side som aldri lastes på nytt spør aldri etter de nye hashene. */

/**
 * Hvor lenge vi lar det gå mellom hvert spørsmål om noe nytt finnes.
 *
 * Et raskt fanebytte fram og tilbake er étt ærend, ikke fem, og `update()`
 * er en nettverksrunde hver gang.
 */
export const OPPDATER_SPERRE_MS = 60_000;

/**
 * Når kan appen laste seg selv på nytt uten å rykke deg ut av noe?
 *
 * ÉN navngitt vakt, ikke to betingelser to steder. Reisen OVERLEVER et
 * omlasting — den ligger i `t.jny` — men kartet og posisjonssporet bygges
 * opp på nytt. Å gjøre det mens noen står på perrongen og leser skjermen er
 * nettopp det «ro» forbyr.
 */
export function trygtÅLasteInn(s) {
  return !!s && !s.jny && s.view === 'board';
}

/** Feltet som sier fra, med ORD. */
function _visBanner() {
  const el = document.getElementById('update-banner');
  if (!el) return;
  // v1.162.0: et bart ⤢ ble rapportert som at knappen var borte. En
  // affordans skal si med ord hva som er bak.
  el.textContent = 'Ny versjon klar · trykk for å oppdatere';
  el.style.display = 'block';
  el.onclick = () => location.reload();
}

/** En ny utgave er installert og venter. */
export function _nyVersjonKlar(s) {
  if (trygtÅLasteInn(s)) { location.reload(); return; }
  _visBanner();
}

/**
 * Kobler opp de to tingene som manglet.
 *
 * `controller` finnes bare når en versjon ALT kjører her. Uten den sjekken
 * ville en førstegangsbruker fått beskjed om å oppdatere noe hun nettopp
 * hadde åpnet.
 */
export function _kobleOppdatering(reg, s) {
  if (!reg) return;

  const sjekkNy = (sw) => {
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker
          && navigator.serviceWorker.controller) {
        _nyVersjonKlar(s);
      }
    });
  };

  reg.addEventListener('updatefound', () => sjekkNy(reg.installing));

  // Og se etter ved GJENOPPTAKELSE. Dette er det ene som får en
  // hjemskjerm-PWA til å merke noe i det hele tatt.
  let sist = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const nå = Date.now();
    if (nå - sist < OPPDATER_SPERRE_MS) return;
    sist = nå;
    try { reg.update(); } catch { /* en arbeider som er borte er ikke en feil */ }
  });
}

/**
 * navigator.onLine only proves the device has *a* network, not that Entur is
 * reachable — so the banner is a hint, not a verdict. The board keeps its own
 * error state for the case where there is signal but no answer.
 */
export function initOfflineBanner() {
  const el = document.getElementById('offline-banner');
  if (!el) return;
  const sync = () => { el.style.display = navigator.onLine ? 'none' : 'block'; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}
