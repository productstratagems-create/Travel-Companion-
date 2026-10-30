/**
 * Bryteren lå over kortene den ikke styrer.
 *
 * Rapportert: «Sorteringsknappene bør visuelt sett ligge sammen med lista
 * den påvirker.»
 *
 * Rekkefølgen på skjermen var:
 *
 *     [kart]
 *     SORTER   [T-bane først] [Andre busser først]
 *     DIT DU SKAL      ← kortene, som bryteren IKKE styrer
 *       …
 *     HVOR SKAL DU?    ← lista, som den styrer
 *       …
 *
 * Kontrollen sto altså rett over den ene tingen den ikke gjelder, og langt
 * fra den ene den gjelder. Det er selve grunnen til at de to forrige
 * rapportene kom: plasseringen PÅSTO at den gjaldt kortene.
 *
 * v1.182.0 gjorde kortene strukturelt ute av stand til å lytte. Denne lar
 * skjermen si det samme.
 *
 * HVORFOR DEN IKKE BARE RENDRES INN I LISTA: kommentaren i index.html har
 * stått der hele tiden — skjermen tegner på nytt hvert sekund og bytter
 * `innerHTML` i sin helhet, så en bryter tegnet inni ville mistet fokus og
 * svelget trykk midt i et trykk. Den må være utenfor. Løsningen er derfor en
 * container til, ikke en flytting inn.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'),
  SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

const { _visListeDel } = await import('../src/views/auto.js');

const html = fs.readFileSync('index.html', 'utf8');
const src = fs.readFileSync('src/views/auto.js', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Hvor i index.html et element med denne id-en står. */
const plass = (id) => html.indexOf('id="' + id + '"');

describe('fiksturen selv', () => {
  // Måleinstrumentet først: finner søket ingen av dem, ville hver påstand
  // under vært grønn uten å ha prøvd noe.
  it('finner alle tre seksjonene i index.html', () => {
    ['auto-dest-body', 'auto-where-head', 'auto-body'].forEach(id =>
      expect(plass(id), id).toBeGreaterThan(-1));
  });
});

describe('bryteren ligger sammen med lista den styrer', () => {
  /* FØR-BILDET. `#auto-sort` sto over `#auto-body`, som den gang holdt BÅDE
   * kortene og lista — så kontrollen havnet over begge, og visuelt nærmest
   * den den ikke gjelder. */
  it('står etter kortene og før radene', () => {
    expect(plass('auto-dest-body')).toBeLessThan(plass('auto-where-head'));
    expect(plass('auto-where-head')).toBeLessThan(plass('auto-body'));
  });

  it('og under overskriften for den lista', () => {
    const hode = html.slice(plass('auto-where-head'), plass('auto-body'));
    expect(hode).toContain('hvor skal du');
    expect(hode.indexOf('hvor skal du')).toBeLessThan(hode.indexOf('id="auto-sort"'));
  });

  /* OG DEN ER FORTSATT UTENFOR ALT SOM BYTTES UT. Kommentaren i index.html
   * forklarer hvorfor: skjermen tegner på nytt hvert sekund, og en bryter
   * inni ville mistet fokus og svelget trykk. Hadde rettelsen vært å rendre
   * den inn i lista, ville den feilen kommet tilbake — og den er umulig å se
   * i et skjermbilde. */
  it('men fortsatt utenfor det som tegnes på nytt', () => {
    expect(src).not.toMatch(/auto-sort[\s\S]{0,80}innerHTML/);
    expect(src).not.toMatch(/innerHTML[\s\S]{0,200}pref-btn/);
  });
});

describe('de to listene skrives til hver sin container', () => {
  it('kortene til sin egen', () => {
    expect(src).toMatch(/auto-dest-body/);
    expect(src).toMatch(/dit du skal/);
  });

  /* Og overskriften for radene skrives IKKE lenger inn i kroppen — den står
   * statisk over bryteren. Sto den begge steder, ville skjermen hatt to
   * «hvor skal du?» og ingen test ville falt. */
  it('og radenes overskrift er ikke lenger i kroppen', () => {
    expect(src).not.toMatch(/set-label">hvor skal du/);
  });

  /* Trykkene på kortene må følge med dit kortene flyttet. Det er fjerde
   * gang i dette repoet at kallestedet er det som bærer. */
  it('og trykkene bindes der kortene nå står', () => {
    expect(src).toMatch(/destBody\.querySelectorAll\('\.auto-dest'\)/);
  });
});

describe('og seksjonene forsvinner sammen', () => {
  /* En overskrift uten liste under er en overskrift som lyver. Hver sti som
   * slår av bryteren må slå av overskriften og tømme kortene med den — og
   * det er seks steder i `_renderBody`, som er nøyaktig hvor mange ganger
   * noen glemmer ett av dem. Derfor ett navn som eier hele seksjonen. */
  it('gjennom ett navn, ikke seks kallesteder', () => {
    expect(src).toMatch(/function _visListeDel\(/);
    // `_showSort` står igjen og gjør sin ene ting; den har egne tester.
    expect(src).toMatch(/function _showSort\(/);
    // Og ingen i _renderBody roper på _showSort direkte lenger.
    const i = src.indexOf('function _renderBody(');
    const krop = src.slice(i, src.indexOf('\n}\n', i));
    expect(krop).not.toMatch(/_showSort\(/);
    expect((krop.match(/_visListeDel\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });
});

/* ── OG SEKSJONEN SLÅS FAKTISK AV ───────────────────────────────────────
 *
 * Testen over binder at `_visListeDel` FINNES og blir kalt. Det er ikke det
 * samme som at den gjør noe: mutanten som strøk linja der overskriften
 * skjules OVERLEVDE den — og da blir «hvor skal du?» stående over
 * stoppvelgeren, uten en liste under seg.
 *
 * Det er nøyaktig feilen funksjonen ble skrevet for å hindre, og den var
 * ubundet. Fjerde eller femte gang i denne kodebasen at en strukturpåstand
 * har bestått mens oppførselen var borte.
 */
describe('seksjonen slås av, ikke bare navngis', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="auto-dest-body"><button class="auto-dest">x</button></div>'
      + '<div id="auto-where-head"><div class="set-label">hvor skal du?</div>'
      + '<div id="auto-sort"><button class="pref-btn" data-val="asc">'
      + '<span class="sort-word"></span></button></div></div>'
      + '<div id="auto-body"></div>';
  });

  const synlig = (id) => document.getElementById(id).style.display !== 'none';

  it('skjuler overskriften når det ikke finnes noen liste', () => {
    _visListeDel(false);
    expect(synlig('auto-where-head')).toBe(false);
  });

  it('og tømmer kortene med den', () => {
    _visListeDel(false);
    expect(document.querySelectorAll('.auto-dest')).toHaveLength(0);
  });

  /* MÅLEINSTRUMENTET: en funksjon som alltid skjuler alt ville bestått de to
   * over. Den må slå PÅ igjen også. */
  it('og viser overskriften igjen når det finnes en', () => {
    _visListeDel(false);
    _visListeDel(true);
    expect(synlig('auto-where-head')).toBe(true);
  });

  it('tåler at elementene ikke er der', () => {
    document.body.innerHTML = '';
    expect(() => _visListeDel(true)).not.toThrow();
    expect(() => _visListeDel(false)).not.toThrow();
  });
});
