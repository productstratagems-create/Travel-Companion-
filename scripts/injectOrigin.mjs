/**
 * Setter appens adresse inn i de statiske filene ved bygg.
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
 * `injectOrigin` på kildeteksten og prøve nøyaktig det bygget gjør — og
 * selve bygget prøves ved å lese `dist/` etterpå.
 */
import { ORIGIN, ORIGIN_LABEL } from '../src/origin.js';

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
};

/** Bytter hvert merke mot sin verdi. Ren funksjon, så den kan prøves alene. */
export function injectOrigin(tekst) {
  let ut = String(tekst);
  for (const [merke, verdi] of Object.entries(MERKER)) {
    ut = ut.split(merke).join(verdi);
  }
  return ut;
}

/** Filer under `public/` som skal behandles. Resten kopieres urørt. */
const PUBLIC_FILER = ['install.html', 'privacy.html', 'sitemap.xml', 'robots.txt'];

/**
 * Vite-pluginen.
 *
 * `transformIndexHtml` tar `index.html`. `public/` kopieres derimot ordrett
 * av Vite og går utenom alle transformasjoner, så de filene skrives om i
 * `dist/` etter at bunten er skrevet.
 */
export default function originPlugin() {
  return {
    name: 'inject-origin',
    transformIndexHtml: { order: 'post', handler: injectOrigin },
    async writeBundle(opts) {
      const { readFile, writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      const ut = opts.dir || 'dist';
      for (const f of PUBLIC_FILER) {
        const p = path.join(ut, f);
        try {
          await writeFile(p, injectOrigin(await readFile(p, 'utf8')));
        } catch (e) {
          // En fil som ikke finnes er en ekte feil her, ikke en detalj å
          // svelge: den betyr at en side har forsvunnet ut av bygget.
          throw new Error('inject-origin fant ikke ' + p + ': ' + e.message);
        }
      }
    },
  };
}
