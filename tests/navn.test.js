/**
 * Appen het fem ting.
 *
 *   index.html:9           T-bane — sanntid for Oslo og Viken
 *   manifest name          T-bane — reisefølge for Oslo
 *   manifest short_name    T-bane                    ← iOS' hjemskjerm-etikett
 *   install.html:30        T-bane på hjemskjermen
 *   privacy.html:8         Personvern · reisefølge for oslo
 *   og:site_name           T-bane
 *   make-shots.mjs:242     reisefølge for oslo
 *   README.md:1            # T-bane
 *
 * Og `index.html:10` motsa dem alle: «Sanntids avganger for T-bane, buss,
 * trikk og tog». Appen het ÉN av fire ting den gjør, og undervurderte seg
 * selv med tre fjerdedeler.
 *
 * Det er kodebasens signaturfeil — «to steder skriver ned det samme faktum og
 * driver fra hverandre» — anvendt på appens eget navn. Og det blokkerte
 * domenet: man kan ikke velge en adresse uten å vite hva appen heter.
 *
 * TO FAMILIER, OG DE MÅ IKKE BLANDES.
 *
 * Det FOLK LESER er ett faktum, og bindes her. Det TJENESTENE SER —
 * `ET_CLIENT_NAME`, `Client-Identifier`, `ICS_DOMAIN`, pakkenavnet — er noe
 * annet, og står urørt med vilje. Et teknisk kjennetegn er ikke et
 * produktnavn, og å slå dem sammen fordi de ligner er nettopp den
 * sammenblandingen dette repoet bruker tjuefem rettelser på å unngå.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { NAVN, NAVN_TITTEL, NAVN_LANGT } from '../src/navn.js';
import { injectFakta } from '../scripts/injectFakta.mjs';

const les = (f) => injectFakta(fs.readFileSync(f, 'utf8'));

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten et navn å binde mot ville fila vært grønn
  // uten å ha prøvd noe.
  it('har et navn å binde mot', () => {
    expect(NAVN).toBeTruthy();
    expect(NAVN_TITTEL).toContain(NAVN);
    expect(NAVN_LANGT).toContain(NAVN);
  });
});

describe('ett navn, overalt folk leser', () => {
  /* PÅSTANDEN SOM BÆRER DET HELE.
   *
   * Mot dagens kode feiler denne med tre ulike verdier i åtte filer. */
  it('har ingen av de gamle navnene igjen', () => {
    const gamle = [/T-bane — sanntid/, /T-bane — reisef/, /T-bane på hjemskjermen/,
                   /"short_name":\s*"T-bane"/, /^# T-bane/m];
    const filer = ['index.html', 'public/install.html', 'public/privacy.html',
                   'public/manifest.webmanifest', 'README.md', 'scripts/make-shots.mjs'];
    const synder = [];
    for (const f of filer) {
      const t = fs.readFileSync(f, 'utf8');
      gamle.forEach(re => { if (re.test(t)) synder.push(f + ' ~ ' + re); });
    }
    expect(synder).toEqual([]);
  });

  it('sier det samme i fane, manifest og lenkeforhåndsvisning', () => {
    const idx = les('index.html');
    const man = JSON.parse(les('public/manifest.webmanifest'));

    expect(idx).toContain('<title>' + NAVN_TITTEL + '</title>');
    expect(idx).toContain('content="' + NAVN + '"');          // og:site_name
    expect(idx).toContain('content="' + NAVN_TITTEL + '"');   // og:title
    expect(man.name).toBe(NAVN_LANGT);
    expect(man.short_name).toBe(NAVN);
  });

  it('og på de to statiske sidene', () => {
    expect(les('public/install.html')).toContain(NAVN);
    expect(les('public/privacy.html')).toContain(NAVN);
  });

  /* Social-kortet er den ene forekomsten intet tekstsøk finner — den er
   * brent inn i en PNG. Generatoren må derfor lese navnet, ikke bære det. */
  it('og på social-kortet, som ingen søk finner', () => {
    const g = fs.readFileSync('scripts/make-shots.mjs', 'utf8');
    expect(g).toMatch(/from '\.\.\/src\/navn\.js'/);
    expect(g).not.toMatch(/reisefølge for oslo/i);
  });

  it('bygger filene uten merker igjen', () => {
    ['index.html', 'public/install.html', 'public/manifest.webmanifest']
      .forEach(f => expect(les(f), f).not.toMatch(/__NAVN/));
  });
});

describe('hjemskjerm-etiketten', () => {
  /* iOS KUTTER rundt 12 tegn. En etikett som kuttes er et navn ingen kan
   * lese, og det er den ene strengen en bruker ser hver dag. */
  it('er kort nok til å overleve iOS', () => {
    expect(NAVN.length).toBeLessThanOrEqual(12);
  });

  /* Og den SIES, ikke arves. `apple-mobile-web-app-title` fantes ikke i det
   * hele tatt, så iOS gjettet fra `short_name`. Et navn som arves er et navn
   * ingen har bestemt — og det brekker stille den dagen `short_name` endres
   * av en annen grunn. */
  it('er sagt eksplisitt, ikke overlatt til short_name', () => {
    expect(les('index.html')).toMatch(
      new RegExp('name="apple-mobile-web-app-title" content="' + NAVN + '"'));
  });
});

describe('de tekniske kjennetegnene står urørt', () => {
  /* DETTE ER EN TEST MOT MIN EGEN FRAMTIDIGE RYDDETRANG.
   *
   * `ET_CLIENT_NAME` er Enturs kjennetegn på denne klienten i deres egen
   * strupekontroll. `ICS_DOMAIN` inngår i UID-en på kalenderoppføringer som
   * alt er delt. Å «rette» dem til Reisefølge ville kastet kontinuitet uten
   * å gi noe — de er ikke appens navn, de er dens kjennetegn. */
  it('identifiserer seg mot Entur som før', () => {
    expect(fs.readFileSync('src/api/http.js', 'utf8'))
      .toContain("ET_CLIENT_NAME = 'productstratagems-travel-companion'");
  });

  it('beholder kalenderdomenet, som ligger i delte UID-er', () => {
    expect(fs.readFileSync('src/api/ics.js', 'utf8'))
      .toContain("ICS_DOMAIN = 'travel-companion.local'");
  });

  it('beholder bysykkel-kjennetegnet', () => {
    expect(fs.readFileSync('src/api/bysykkel.js', 'utf8'))
      .toContain("'Client-Identifier': 'travel-companion-oslo'");
  });

  it('og pakkenavnet, som ingen bruker ser', () => {
    expect(JSON.parse(fs.readFileSync('package.json', 'utf8')).name)
      .toBe('travel-companion');
  });
});

/* ── LISTA KAN IKKE DRIVE FRA FILENE ─────────────────────────────────────
 *
 * `manifest.webmanifest` sto ikke i `PUBLIC_FILER` da navnet fikk merker,
 * fordi den ikke hadde noen før. Bygget sendte da `__NAVN__` som appens navn
 * i installasjonsdialogen.
 *
 * Testene over så det ikke: de kaller `injectFakta` på KILDEN, og beviser
 * dermed bare at funksjonen virker — ikke at den blir brukt på fila. Et søk
 * i `dist/` fant det.
 *
 * Dette binder det som faktisk gikk galt: bærer en fil under `public/` et
 * merke, skal den stå i lista.
 */
describe('injektoren kjenner hver fil som bærer et merke', () => {
  it('har ingen merket fil utenfor lista si', () => {
    const inj = fs.readFileSync('scripts/injectFakta.mjs', 'utf8');
    const lista = (inj.match(/const PUBLIC_FILER = \[([\s\S]*?)\]/) || [])[1] || '';
    const glemt = [];
    for (const f of fs.readdirSync('public', { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const t = fs.readFileSync('public/' + f.name, 'utf8');
      if (/__(NAVN|ORIGIN)/.test(t) && !lista.includes("'" + f.name + "'")) {
        glemt.push(f.name);
      }
    }
    expect(glemt).toEqual([]);
  });
});
