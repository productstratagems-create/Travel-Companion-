/**
 * Setter appens ADRESSE og NAVN inn i de statiske filene ved bygg.
 *
 * Het `injectFakta.mjs` da den bar ett faktum. Den bærer to nå, og et navn
 * som ikke lenger stemmer med innholdet er den samme feilen i det små.
 *
 * `index.html`, `public/install.html`, `public/privacy.html`,
 * `public/sitemap.xml` og `public/robots.txt` er ikke JavaScript og kan ikke
 * importere `src/origin.js`. De bærer derfor et merke — `__ORIGIN__` — som
 * byttes ut her.
 *
 * HVORFOR IKKE BARE LA DEM BÆRE ADRESSEN: fordi de gjorde det, tjueen ganger
 * i ni filer, og det er kodebasens signaturfeil anvendt på appens egen
 * adresse. En lenkeforhåndsvisning, en sitemap og et social-kort er hver
 * eneste vei en ny leser kommer inn, og de sto og kunne drive fra hverandre.
 *
 * HVORFOR EN REN FUNKSJON OG IKKE BARE EN PLUGIN: testene leser KILDEN, ikke
 * `dist/`. Hadde erstatningen bare bodd inne i byggetrinnet, måtte hele
 * suiten bygget først for å si noe om den. Nå kan `tests/meta.test.js` kalle
 * `injectFakta` på kildeteksten og prøve nøyaktig det bygget gjør — og
 * selve bygget prøves ved å lese `dist/` etterpå.
 */
import { ORIGIN, ORIGIN_LABEL } from '../src/origin.js';
import { NAVN, NAVN_TITTEL, NAVN_LANGT } from '../src/navn.js';

/* MERKET KAN IKKE VÆRE `%ORIGIN%`, og det er verdt å si hvorfor.
 *
 * Vite kjører `decodeURI` på hver `href` og `src` når den går gjennom
 * `index.html`. `%OR` er en ugyldig prosent-escape, så bygget døde med
 * «URI malformed» før en eneste modul var transformert.
 *
 * `__ORIGIN__` er samme form som `__APP_VERSION__`, som `vite.config.js` alt
 * bruker — altså kodebasens egen konvensjon framfor en ny. */

/** Merkene, og hva de blir. Ett sted, så en ny fil ikke finner opp sitt eget. */
export const MERKER = {
  '__ORIGIN__': ORIGIN,
  // Uten protokoll, for der adressen skal LESES framfor klikkes.
  '__ORIGIN_LABEL__': ORIGIN_LABEL,
  // Rekkefølgen betyr noe: `__NAVN__` er et prefiks av de to andre, så de
  // lengste må byttes først. Ellers blir `__NAVN_TITTEL__` til
  // «Reisefølge_TITTEL__», og det ville stått i en fanetittel.
  '__NAVN_TITTEL__': NAVN_TITTEL,
  '__NAVN_LANGT__': NAVN_LANGT,
  '__NAVN__': NAVN,
};

/** Bytter hvert merke mot sin verdi. Ren funksjon, så den kan prøves alene. */
export function injectFakta(tekst) {
  let ut = String(tekst);
  for (const [merke, verdi] of Object.entries(MERKER)) {
    ut = ut.split(merke).join(verdi);
  }
  return ut;
}

/* FILER UNDER `public/` SOM SKAL BEHANDLES. Resten kopieres urørt.
 *
 * `manifest.webmanifest` sto IKKE her da navnet fikk merker, fordi den ikke
 * hadde noen før. Bygget sendte da `__NAVN__` som appens navn i
 * installasjonsdialogen — funnet av et søk i `dist/`, ikke av testen, som
 * kaller `injectFakta` på KILDEN og derfor aldri ser hva som ble kopiert.
 *
 * `tests/navn.test.js` binder nå at enhver fil med et merke står i denne
 * lista, så den ikke kan drive fra virkeligheten igjen. */
const PUBLIC_FILER = ['install.html', 'privacy.html', 'sitemap.xml', 'robots.txt',
                      'manifest.webmanifest'];

/**
 * Vite-pluginen.
 *
 * `transformIndexHtml` tar `index.html`. `public/` kopieres derimot ordrett
 * av Vite og går utenom alle transformasjoner, så de filene skrives om i
 * `dist/` etter at bunten er skrevet.
 */
export default function faktaPlugin() {
  return {
    name: 'inject-fakta',
    transformIndexHtml: { order: 'post', handler: injectFakta },
    async writeBundle(opts) {
      const { readFile, writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      const ut = opts.dir || 'dist';
      for (const f of PUBLIC_FILER) {
        const p = path.join(ut, f);
        try {
          await writeFile(p, injectFakta(await readFile(p, 'utf8')));
        } catch (e) {
          // En fil som ikke finnes er en ekte feil her, ikke en detalj å
          // svelge: den betyr at en side har forsvunnet ut av bygget.
          throw new Error('inject-fakta fant ikke ' + p + ': ' + e.message);
        }
      }
    },
  };
}
