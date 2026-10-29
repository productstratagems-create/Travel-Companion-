/**
 * Menyen skal stå også mens en reise pågår.
 *
 * Rapportert: «Ønsker å kunne navigere mellom hovedvinduene selv om en reise
 * pågår. Nå er menyknappelinjen skjult i reisemodus, så reisen må avsluttes
 * via Avslutt for å kunne navigere.»
 *
 * DEN SKJULTE MENYEN HADDE EN BEGRUNNELSE, OG DEN STÅR I `nav.js:166`:
 *
 *   «"Underveis" and the walking route both carry their own avslutt/tilbake,
 *    and a menu across the bottom of them is an invitation to leave a journey
 *    by accident — over the map, at the moment you are least able to spare
 *    it.»
 *
 * Frykten var ekte, men den forvekslet to ting: å NAVIGERE BORT og å MISTE
 * REISEN. De er ikke det samme, og koden selv sier det:
 *
 *   - `stopTracking()` kalles fra ÉTT sted, `journey.js:267` inne i
 *     `clearJny()`. Å bytte skjerm rører ingenting; reisen poller videre.
 *   - `#onboard-chip` står på hver eneste andre skjerm mens `state.jny`
 *     finnes, og ett trykk tar deg tilbake til underveis.
 *   - Å avslutte krever to trykk, både i headeren og på chipens ×.
 *
 *  Så prisen for et bomtrykk er ett trykk tilbake — ikke en tapt reise. Det
 *  er påstandene under som gjør at menyen trygt kan stå framme, og de er
 *  viktigere enn flagget selv.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('../src/ui/favs.js', () => ({ addFav: () => {} }));
vi.mock('../src/views/settings.js', () => ({ renderBoardProfileSwitcher: () => {} }));
vi.mock('../src/geo.js', () => ({ saveWeekendMode: () => {} }));
vi.mock('../src/ui/confirm.js', () => ({ confirmTap: () => {} }));
vi.mock('../src/views/selected.js', () => ({ stopSelRefresh: () => {} }));
vi.mock('../src/views/track.js', () => ({ copyJourneyId: () => {} }));
vi.mock('../src/views/spectate.js', () => ({
  toggleSpectatePanel: () => {}, closeSpectatePanel: () => {},
}));

const VIEWS = ['v-board', 'v-selected', 'v-track', 'v-settings', 'v-prefs',
               'v-saved', 'v-leisure', 'v-auto'];

const { state } = await import('../src/state.js');
const { show, navTo, navHidden, NAV_ITEMS } = await import('../src/ui/nav.js');

const REISE = {
  dest: 'Jernbanetorget', lineCode: '3', lineBg: '#e60000',
  frontText: 'Jernbanetorget', arrival: { time: '2026-10-29T07:58:00Z', clk: '07:58' },
  legs: [{ lineCode: '3', toStation: 'Jernbanetorget' }],
};

beforeEach(() => {
  document.body.innerHTML = VIEWS
    .map(v => `<div id="${v}" tabindex="-1"${v === 'v-board' ? '' : ' style="display:none"'}></div>`)
    .join('')
    + '<div id="board-more-menu"></div><button id="board-more-btn" data-more></button>'
    + '<nav id="app-nav" class="app-nav" hidden></nav>'
    + '<div id="onboard-chip" class="onboard-chip-bar"></div>';
  document.documentElement.className = '';
  document.body.className = '';
  state.view = 'board';
  state.jny = null;
});

describe('fiksturen selv', () => {
  // Måleinstrumentet først. Uten en meny i DOM ville hver påstand under vært
  // grønn uten å ha prøvd noe.
  it('har en meny å vise eller skjule', () => {
    expect(document.getElementById('app-nav')).toBeTruthy();
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('menyen står framme underveis', () => {
  /* FØR-BILDET. `navHidden('track')` var `true`, og det var hele grunnen til
   * at reisen måtte avsluttes for å komme noe sted. */
  it('er ikke skjult på underveis', () => {
    expect(navHidden('track')).toBe(false);
  });

  it('og er fortsatt synlig overalt ellers', () => {
    ['board', 'auto', 'saved', 'leisure', 'settings', 'prefs', 'selected']
      .forEach(v => expect(navHidden(v), v).toBe(false));
  });

  /* `v-walk` er pensjonert — ingen `#v-walk` i index.html, bare en
   * omdirigering i historikk-gjenopprettingen (`nav.js:226`). Flagget blir
   * stående: «ingenting kastes for å rydde», og en skjerm som kommer
   * tilbake skal komme tilbake med sin egen begrunnelse. */
  it('lar den pensjonerte gå-skjermen beholde sitt flagg', () => {
    expect(navHidden('walk')).toBe(true);
  });

  // Og klaringen følger med av seg selv: `_renderNav` setter klassen etter
  // `el.hidden`, og `components.css:146` gir body plass til baren. Uten denne
  // ville siste rad på underveis ligget under menyen.
  it('gir underveis plass under baren, som de andre skjermene', () => {
    show('v-track');
    expect(document.body.classList.contains('app-nav-visible')).toBe(true);
    expect(document.getElementById('app-nav').hidden).toBe(false);
  });
});

describe('å navigere bort er ikke å miste reisen', () => {
  /* PÅSTANDEN SOM GJØR DET TRYGT.
   *
   * Var dette usant, var den opprinnelige begrunnelsen riktig og menyen
   * skulle forblitt skjult. */
  it('lar reisen stå når du bytter skjerm', () => {
    state.jny = REISE;
    show('v-track');
    navTo('v-board');
    expect(state.jny).toBe(REISE);
    navTo('v-auto');
    navTo('v-leisure');
    expect(state.jny).toBe(REISE);
  });

  /* Og sporingen stoppes bare av én ting. Bundet på kildeteksten fordi det
   * er TOPOLOGIEN som bærer: en ny `stopTracking()` i en navigasjonssti ville
   * gjort menyen farlig igjen, og den ville ikke falt på noen annen test. */
  it('stopper sporingen bare når reisen faktisk avsluttes', () => {
    const kall = [];
    for (const f of ['src/ui/nav.js', 'src/journey.js', 'src/main.js', 'src/views/track.js']) {
      const t = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      (t.match(/stopTracking\(\)/g) || []).forEach(() => kall.push(f));
    }
    // Ett kall, i clearJny — og definisjonen i track.js.
    expect(kall.filter(f => f === 'src/journey.js')).toHaveLength(1);
    expect(kall).not.toContain('src/ui/nav.js');
    expect(kall).not.toContain('src/main.js');

    const jny = fs.readFileSync('src/journey.js', 'utf8');
    expect(jny).toMatch(/export function clearJny\(\)[\s\S]{0,400}stopTracking\(\)/);
  });
});

describe('veien tilbake finnes', () => {
  /* Chipen er det som gjør et bomtrykk billig: den står på hver andre
   * skjerm mens en reise finnes, og ett trykk er nok. Forsvinner den, er
   * menyen en fælle igjen. */
  const chipSrc = fs.readFileSync('src/ui/chip.js', 'utf8');
  const navSrc = fs.readFileSync('src/ui/nav.js', 'utf8');
  const cssSrc = fs.readFileSync('src/style/components.css', 'utf8');

  it('chipen vises så lenge det finnes en reise', () => {
    expect(chipSrc).toMatch(/if \(state\.jny\)[\s\S]{0,200}display = 'flex'/);
  });

  it('og tar deg tilbake til underveis med ett trykk', () => {
    expect(chipSrc).toMatch(/jnyGoTracking/);
  });

  /* Men ikke PÅ underveis — der ville den pekt på skjermen du står på.
   * Regelen står i CSS-en, og den skal fortsatt gjøre det. */
  it('og holder seg unna når du alt er der', () => {
    expect(navSrc).toMatch(/chip-on-track', id === 'v-track'/);
    expect(cssSrc).toMatch(/chip-on-track\s*\{\s*display:\s*none/);
  });
});
