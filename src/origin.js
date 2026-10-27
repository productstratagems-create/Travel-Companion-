/**
 * HVOR APPEN BOR — og det eneste stedet den adressen er skrevet ned.
 *
 * En bladmodul uten importer, som `stopId.js`, `posSource.js` og
 * `walkSpeed.js`, og av samme grunn: en fil uten importer kan ikke havne i
 * en sykel, og den kan leses av både appen, byggetrinnet og skriptene som
 * lager bildene.
 *
 * FØR DETTE STO ADRESSEN NITTEN STEDER. Sytten av dem fant et søk — i
 * `index.html`, de to statiske sidene, `sitemap.xml`, `robots.txt`, README
 * og omtaleteksten. To gjorde det ikke:
 *
 *   - brent inn som TEKST i `public/shots/og.png`, fra en literal i
 *     `scripts/make-shots.mjs`
 *   - kodet inn i QR-SVG-en i `public/install.html`, der adressen er et
 *     gitter av firkanter og ingen streng å søke etter
 *
 * Og det er nettopp de to en leser HANDLER på: scanner koden, leser kortet.
 * De er også de eneste som overlever et søk-og-erstatt uten å bli oppdaget —
 * stille, i noen andres hånd, i det øyeblikket de prøvde å hjelpe.
 *
 * `vite.config.js` har `base: './'`, så RESSURSENE var relative hele tiden.
 * Det var bare den ANNONSERTE adressen som var skrevet ut: den som står i
 * en lenkeforhåndsvisning, i en sitemap, på et social-kort og i en QR-kode —
 * altså hver eneste vei en ny leser kommer inn.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Å BYTTE DOMENE ER DENNE ENE LINJA, pluss `public/CNAME` og én kjøring av
 * `npm run shots`. Testen i `tests/origin.test.js` faller hvis adressen
 * dukker opp skrevet ut noe annet sted.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Uten skråstrek på slutten. Alt under bygges av `url()`. */
export const ORIGIN = 'https://productstratagems-create.github.io/Travel-Companion-';

/** Adressen slik et menneske leser den — uten protokollen som uansett er https. */
export const ORIGIN_LABEL = ORIGIN.replace(/^https:\/\//, '');

/** En sti under appen, som absolutt adresse. */
export function url(sti = '') {
  return ORIGIN + '/' + String(sti).replace(/^\/+/, '');
}

export const APP_URL      = url();
export const INSTALL_URL  = url('install.html');
export const PRIVACY_URL  = url('privacy.html');
export const SITEMAP_URL  = url('sitemap.xml');
export const OG_IMAGE_URL = url('shots/og.png');

/**
 * Kildekoden, som bor et ANNET sted — og fortsetter å gjøre det etter et
 * domenebytte. Avledet den av ORIGIN, ville et eget domene gitt en død lenke
 * til repoet fra personvernsiden.
 */
export const REPO_URL = 'https://github.com/productstratagems-create/Travel-Companion-';
