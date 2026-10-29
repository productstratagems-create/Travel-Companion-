/**
 * Appen har ÉN adresse, og den er skrevet ned ett sted.
 *
 * Før dette sto den nitten steder. Sytten av dem finner et søk; to gjør det
 * ikke:
 *
 *   - brent inn som tekst i `public/shots/og.png`, generert fra en literal
 *     i `scripts/make-shots.mjs`
 *   - kodet inn i QR-SVG-en i `public/install.html`, der den er et gitter av
 *     firkanter og ikke en streng
 *
 * Og det er nettopp de to en leser HANDLER på: scanner koden, leser kortet.
 * De er også de eneste som overlever et søk-og-erstatt uten å bli oppdaget.
 *
 * «To steder skriver ned det samme faktum og driver fra hverandre» er denne
 * kodebasens signaturfeil, funnet rundt tjuefem ganger. Dette er den samme
 * feilen anvendt på appens egen adresse — og den melder seg den dagen det
 * kommer et eget domene.
 *
 * `vite.config.js` har alt `base: './'`, så RESSURSENE er relative. Det er
 * bare den annonserte adressen som var skrevet ut.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ORIGIN, APP_URL, INSTALL_URL, PRIVACY_URL, OG_IMAGE_URL, SITEMAP_URL, REPO_URL }
  from '../src/origin.js';

/** Verten slik den står i dag. Endres den, skal den endres ÉTT sted. */
const HOST = 'productstratagems-create.github.io';

/* TO SLAGS FILER, OG DE BEHANDLES ULIKT MED VILJE.
 *
 * Det som BYGGES — `index.html` og alt under `public/` — bærer merket
 * `__ORIGIN__` og får adressen satt inn av `scripts/injectFakta.mjs`. Der
 * er en literal forbudt: den ville vært en andre sannhet i en fil som alt
 * får svaret servert.
 *
 * Det som LESES AV MENNESKER — README og omtaleteksten — kan ikke bære et
 * merke. En som åpner README skal se adressen, ikke `__ORIGIN__`. De får
 * derfor ha den skrevet ut, men den må være DEN SAMME: bundet framfor
 * forbudt. Det er forskjellen på én sannhet og to som må være enige. */
const EIER = 'src/origin.js';

/** Bygges, og får adressen satt inn: ingen literal lov. */
const MERKET = ['index.html', 'public/'];

/** Leses av mennesker: literal lov, men den må stemme. */
const BUNDET = ['README.md', 'docs/omtale.md'];

const TILLATT = new Set([
  EIER,
  'scripts/injectFakta.mjs',  // merkene og verdiene deres
  'tests/origin.test.js',      // denne fila, som binder det hele
]);

/** Alt som ikke er bygg, avhengigheter eller bilder. */
function tekstfiler(dir = '.', ut = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name).replace(/^\.\//, '');
    if (/^(node_modules|dist|\.git)$/.test(e.name)) continue;
    if (e.isDirectory()) { tekstfiler(p, ut); continue; }
    if (/\.(png|jpg|jpeg|woff2?|ico|webp|gz)$/i.test(e.name)) continue;
    ut.push(p);
  }
  return ut;
}

describe('fiksturen selv', () => {
  // Måleinstrumentet først. Finner ikke søket noe som helst, ville fila vært
  // grønn uten å ha prøvd noe — og det har skjedd i dette repoet.
  it('leter i filer som faktisk finnes og har innhold', () => {
    const filer = tekstfiler();
    expect(filer.length).toBeGreaterThan(50);
    expect(filer).toContain('index.html');
    expect(filer).toContain('public/install.html');
    expect(filer).toContain('public/sitemap.xml');
    expect(filer).toContain('scripts/make-shots.mjs');
  });
});

describe('adressen er skrevet ned ett sted', () => {
  /* PÅSTANDEN SOM BÆRER DET HELE.
   *
   * Mot dagens kode feiler denne med sytten treff i sju filer. Etterpå står
   * verten bare i `src/origin.js`; alle andre får den ved bygg eller ved å
   * importere navnet. */
  it('har ingen vert skrevet ut i det som bygges', () => {
    const synder = [];
    for (const f of tekstfiler()) {
      if (TILLATT.has(f) || BUNDET.includes(f)) continue;
      const t = fs.readFileSync(f, 'utf8');
      const n = (t.match(new RegExp(HOST.replace(/\./g, '\\.'), 'g')) || []).length;
      if (n) synder.push(`${f} (${n})`);
    }
    expect(synder).toEqual([]);
  });

  // Og de som bygges BÆRER merket — ellers har noen fjernet adressen helt og
  // etterlatt en side som peker ingen steder. Uten denne ville testen over
  // vært grønn for en tom fil.
  it('lar de bygde filene bære merket i stedet', () => {
    for (const f of ['index.html', 'public/install.html',
                     'public/sitemap.xml', 'public/robots.txt']) {
      expect(fs.readFileSync(f, 'utf8'), f).toContain('__ORIGIN__');
    }
  });

  /* Og de menneskelesbare bindes: adressen de viser SKAL være den ene.
   * Driver de, sender README folk til en død lenke lenge etter at appen har
   * flyttet — og ingen oppdager det, fordi ingen leser README to ganger. */
  it('binder README og omtaleteksten til den ene adressen', () => {
    for (const f of BUNDET) {
      const t = fs.readFileSync(f, 'utf8');
      const funnet = t.match(/https:\/\/[a-z0-9.-]*github\.io\/[^\s)>"']*/gi) || [];
      expect(funnet.length, f + ' nevner ikke adressen i det hele tatt').toBeGreaterThan(0);
      funnet.forEach(u => expect(u.startsWith(ORIGIN), f + ': ' + u).toBe(true));
    }
  });
});

describe('de avledede adressene', () => {
  // Alt henger av ORIGIN. Endres den, flytter de seg sammen — og det er
  // forskjellen på ett navn og sju som må være enige.
  it('bygges av den ene, ikke tastet inn hver for seg', () => {
    expect(APP_URL).toBe(ORIGIN + '/');
    expect(INSTALL_URL).toBe(ORIGIN + '/install.html');
    expect(PRIVACY_URL).toBe(ORIGIN + '/privacy.html');
    expect(OG_IMAGE_URL).toBe(ORIGIN + '/shots/og.png');
    expect(SITEMAP_URL).toBe(ORIGIN + '/sitemap.xml');
  });

  // Repoet er et ANNET sted enn appen, og blir det også etter et domenebytte.
  // Hadde de vært avledet av hverandre, ville et eget domene gitt en død
  // lenke til kildekoden.
  it('holder repoet atskilt fra appen', () => {
    expect(REPO_URL).toMatch(/^https:\/\/github\.com\//);
    expect(REPO_URL.startsWith(ORIGIN)).toBe(false);
  });

  it('er en bladmodul — den importerer ingenting', () => {
    expect(fs.readFileSync('src/origin.js', 'utf8')).not.toMatch(/^import /m);
  });
});

/* ── DEN SISTE USYNLIGE: QR-KODEN ────────────────────────────────────────
 *
 * Adressen i QR-en er et gitter av firkanter. Ingen tekstsøk finner den, og
 * den er den eneste forekomsten en leser SCANNER — altså handler på, uten å
 * kunne lese hva den sier først.
 *
 * TO FORSØK PÅ Å BINDE DEN HER SLO FEIL, og begge er verdt å skrive ned:
 *
 *   1. Sammenligne sti-strengen mot en nygenerert. Feil: `qrcode` skriver
 *      absolutte segmenter (`M2 3.5h1`), koden i siden har relative
 *      (`m-33 1h1`). Samme kode, ulik skrivemåte.
 *
 *   2. Sammenligne hvilke MODULER som er fylt. Også feil: 564 mot 562. En
 *      QR-koder velger en MASKE, og to ulike masker gir to ulike gitre som
 *      begge dekoder til nøyaktig samme adresse. `scripts/verify-qr.mjs`
 *      leste den jo riktig med en ekte dekoder.
 *
 * Begge ville meldt feil på en QR som er helt riktig — en test som lyver
 * den andre veien, og den er verre enn ingen.
 *
 * DET ENESTE ÆRLIGE MÅLET ER Å DEKODE, og det krever en nettleser.
 * `npm run qr:verify` gjør nettopp det, mot `APP_URL`, og er nå knyttet til
 * det ene navnet. Den hører til utgivelsen, ikke til `vitest`.
 *
 * Det denne testen kan binde, er at leseren får vite det om koden skulle
 * peke feil: `install.html` sammenligner QR-ens adresse med sidens egen ved
 * kjøretid og viser en advarsel. Den vakten skal ikke kunne forsvinne. */
describe('QR-koden i install.html', () => {
  const side = () => fs.readFileSync('public/install.html', 'utf8');

  it('finnes, og er en QR og ikke en tom firkant', () => {
    const svg = (side().match(/<svg class="qr"[\s\S]*?<\/svg>/) || [])[0];
    expect(svg, 'ingen <svg class="qr"> i install.html').toBeTruthy();
    const d = (svg.match(/<path[^>]*stroke="[^"]*"[^>]*\sd="([^"]+)"/) || [])[1];
    expect(d, 'ingen strøket sti — koden er tom').toBeTruthy();
    expect(d.length).toBeGreaterThan(500);
  });

  // Vakten som sier fra hvis koden peker et annet sted enn siden selv.
  // Uten den feiler en stale QR stille, i noen andres hånd.
  it('beholder vakten som sier fra når koden er utdatert', () => {
    const t = side();
    expect(t).toContain('qr-stale');
    expect(t).toMatch(/live !== baked/);
  });
});
