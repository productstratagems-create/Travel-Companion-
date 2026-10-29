/**
 * Fire ikoner, én tegning.
 *
 * Ikonet var en gul T — T-banens eget merke, på en app som viser T-bane,
 * buss, trikk OG tog, og som ikke er Ruters. Samme motsetning navnet hadde i
 * v1.173.0, ett lag ned.
 *
 * OG NOE SOM GJALDT UANSETT SYMBOL: de fire PNG-ene var håndlagde, og
 * ingenting bandt dem. Ingen kilde, ingen generator.
 *
 *   apple-touch-icon.png        499 B
 *   icon-192.png                515 B
 *   icon-512.png               1549 B
 *   icon-maskable-512.png      1624 B
 *
 * De kunne drive fra hverandre i stillhet — og `icon-maskable` er den som
 * ville gjort det usett, siden ingen ser den uten en Android med rund maske.
 *
 * MASKABLE ER IKKE EN EGEN TEGNING. Det er den samme, med padding regnet av
 * sikkerhetssonen. Ett navn, resten avledet — som `origin.js` og `navn.js`.
 *
 * Det som krever å DEKODE piksler — sikkerhetssonen og lesbarheten på 60 px
 * — måles i `scratchpad/ikonProbe.mjs`, i en nettleser som kan tegne dem.
 * Prosjektet har ikke noe bildebibliotek, og å dra inn ett for dette ville
 * vært å løse feil problem. Her bindes det som er billig og fanger drift.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/** En PNG oppgir sin egen størrelse i filhodet. Ingenting annet stoles på. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString('ascii'), file).toBe('PNG');
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}

const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten ikoner i manifestet ville hver påstand under
  // vært grønn uten å ha prøvd noe.
  it('har ikoner å prøve', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('én kilde, fire avledede filer', () => {
  /* FØR-BILDET. Det fantes ingen kilde og ingen generator. */
  it('har tegningen som en SVG', () => {
    expect(fs.existsSync('assets/ikon.svg')).toBe(true);
    const svg = fs.readFileSync('assets/ikon.svg', 'utf8');
    expect(svg).toMatch(/<svg/);
    // En tom SVG ville tilfredsstilt det over og tegnet ingenting.
    expect(svg).toMatch(/<(circle|rect|line|path)/);
  });

  it('har en generator som leser den', () => {
    expect(fs.existsSync('scripts/make-icons.mjs')).toBe(true);
    const g = fs.readFileSync('scripts/make-icons.mjs', 'utf8');
    expect(g).toMatch(/ikon\.svg/);
    // Hver av de fire må nevnes, ellers er én av dem fortsatt håndlagd.
    ['icon-192', 'icon-512', 'icon-maskable-512', 'apple-touch-icon']
      .forEach(n => expect(g, n).toContain(n));
  });

  it('kan kjøres uten å huske hvordan', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.icons).toMatch(/make-icons/);
  });
});

describe('filene er de størrelsene de utgir seg for', () => {
  /* Et ikon i feil størrelse blir skalert av nettleseren og ser mykt ut —
   * en feil som er usynlig i koden og synlig bare på en telefon. */
  it('har riktige mål, lest ut av filhodet', () => {
    expect(pngSize('public/icons/icon-192.png')).toBe('192x192');
    expect(pngSize('public/icons/icon-512.png')).toBe('512x512');
    expect(pngSize('public/icons/icon-maskable-512.png')).toBe('512x512');
    expect(pngSize('public/icons/apple-touch-icon.png')).toBe('180x180');
  });
});

describe('manifestet og filene er enige', () => {
  it('peker bare på filer som finnes, i den størrelsen det påstår', () => {
    manifest.icons.forEach(i => {
      const f = 'public/' + i.src;
      expect(fs.existsSync(f), i.src).toBe(true);
      expect(pngSize(f), i.src).toBe(i.sizes);
    });
  });

  /* Uten `purpose: "maskable"` bruker Android «any»-ikonet og legger sin
   * egen hvite bakgrunn bak det. Da får du et gullsymbol i en hvit sirkel på
   * en app som ellers er nesten svart. */
  it('har nøyaktig ett maskable-ikon, merket som det', () => {
    const m = manifest.icons.filter(i => (i.purpose || '').includes('maskable'));
    expect(m).toHaveLength(1);
    expect(m[0].src).toContain('maskable');
  });

  it('og apple-touch-icon er referert fra index.html', () => {
    expect(fs.readFileSync('index.html', 'utf8'))
      .toMatch(/rel="apple-touch-icon"[^>]*icons\/apple-touch-icon\.png/);
  });
});

describe('T-en er borte', () => {
  /* Bundet på kilden framfor på pikslene: det er TEGNINGEN som ikke lenger
   * skal være en bokstav. En PNG-sammenligning ville sagt det samme bare til
   * neste gang noen justerte en farge. */
  it('tegningen er ikke en bokstav', () => {
    const svg = fs.readFileSync('assets/ikon.svg', 'utf8');
    expect(svg).not.toMatch(/<text/);
    expect(svg).not.toMatch(/font-family/);
  });
});
