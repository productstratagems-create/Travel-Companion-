/**
 * Langtrykk for å glemme et sted — og tilstanden som må overleve en render.
 *
 * Bedt om: «klikk og hold for å slette» på kortene under «dit du ofte skal».
 *
 * TRE BEGRENSNINGER FORMER HELE LØSNINGEN, og de ble funnet i koden før
 * noe ble skrevet:
 *
 *  1. SKJERMEN TEGNER PÅ NYTT HVERT SEKUND. `destBody.innerHTML` byttes i
 *     sin helhet (`auto.js:2271`), så en «avslørt ×» som bor i DOM-en er
 *     borte innen ett sekund — før fingeren rekker fram til den. Tilstanden
 *     må ligge UTENFOR markupen.
 *  2. `.auto-dest` ER EN `<button>`. En knapp inni en knapp er ugyldig HTML,
 *     og `track.js:1450` har alt skrevet ned nettopp det for chipsene — løst
 *     med en `<span>`-ramme rundt to knapper. Samme form her.
 *  3. LANGTRYKK FANTES IKKE I APPEN. Null treff på `pointerdown`,
 *     `touchstart` eller `contextmenu` før dette.
 *
 * OG ×-EN ER EN EKTE KNAPP HELE TIDEN, ikke noe som settes inn ved et
 * langtrykk. Et langtrykk har ingen vei inn for tastatur eller skjermleser;
 * en knapp som alltid er der, og som blir synlig når den får fokus, har det.
 * Gesten er en SNARVEI til den, ikke den eneste veien.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import { kortHtml, HOLD_MS, HOLD_SLARK_PX, _slettbar, _settSlettbar,
  _gjenopprettSlett, _bindKort } from '../src/views/auto.js';
import { loadFreq, saveFreq } from '../src/api/usage.js';

const T = (hh, mm) => new Date(2026, 9, 30, hh, mm, 0).getTime();
const rad = (kode, modus, farge) => ({
  lines: [{ code: kode, colour: farge }], frontText: 'Jernbanetorget',
  call: { serviceJourney: { line: { transportMode: modus, id: 'RUT:Line:' + kode } },
    quay: { publicCode: 'E' } },
});
const KORT = { name: 'Ekeberg camping', options: [
  { i: 0, d: rad('74', 'bus', 'e60000'), call: rad('74', 'bus', 'e60000').call,
    ms: T(8, 41), at: T(9, 6) }] };

const src = () => fs.readFileSync('src/views/auto.js', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const css = () => fs.readFileSync('src/style/settings.css', 'utf8');

describe('fiksturen selv', () => {
  it('har et kort å bygge', () => {
    expect(kortHtml(KORT, 0)).toMatch(/Ekeberg camping/);
    expect(HOLD_MS).toBeGreaterThan(200);
  });
});

describe('kortet er en ramme med to knapper', () => {
  /* FØR-BILDET. Kortet var en bar `<button>` uten ramme og uten ×. */
  it('har en slettekapp ved siden av, ikke inni', () => {
    const h = kortHtml(KORT, 0);
    expect(h).toMatch(/class="auto-dest-rad"/);
    expect(h).toMatch(/class="auto-dest-del"/);
  });

  /* EN KNAPP INNI EN KNAPP ER UGYLDIG HTML, og `track.js:1450` har alt
   * skrevet ned hvorfor. Dette binder at ×-en ikke havnet der. */
  it('og ×-en ligger ikke inne i kortets egen knapp', () => {
    const h = kortHtml(KORT, 0);
    const kort = h.slice(h.indexOf('class="nearby-btn auto-dest"'));
    expect(kort.slice(0, kort.indexOf('</button>'))).not.toMatch(/auto-dest-del/);
  });

  /* OG DEN SIER HVA DEN GLEMMER. «slett» alene er den generiske etiketten
   * `favs.js` har — en skjermleser får da vite at noe slettes, ikke hva. */
  it('og sier hvilket sted den glemmer', () => {
    /* FORANKRET PÅ ×-ENS EGEN ETIKETT. Første utgave søkte i hele kortet, og
     * traff kortets egen «reis til Ekeberg camping» — så mutanten som
     * fjernet ×-ens aria-label OVERLEVDE. Fjerde gang i denne økta at et
     * søk traff feil element. */
    document.body.innerHTML = kortHtml(KORT, 0);
    const x = document.querySelector('.auto-dest-del');
    expect(x.getAttribute('aria-label')).toMatch(/Ekeberg camping/);
    expect(x.getAttribute('aria-label')).toMatch(/[Gg]lem/);
  });

  // Navnet må følge med til handleren uten at den må lete i teksten.
  it('og bærer navnet som data, ikke som tekst å lese tilbake', () => {
    expect(kortHtml(KORT, 0)).toMatch(/data-glem="Ekeberg camping"/);
  });
});

describe('tilstanden overlever at skjermen tegnes på nytt', () => {
  /* PÅSTANDEN SOM BÆRER HELE LØSNINGEN.
   *
   * Skjermen tegner hvert sekund. Lå «hvilket kort er åpnet» i markupen,
   * ville ×-en forsvunnet før fingeren rakk fram — og feilen ville sett ut
   * som at langtrykket ikke virket. */
  it('bor i modulen, ikke i HTML-en', () => {
    _settSlettbar('Ekeberg camping');
    expect(_slettbar()).toBe('Ekeberg camping');
    // En ny render bygger den samme strengen; tilstanden er ikke i den.
    expect(kortHtml(KORT, 0)).not.toMatch(/vis-slett/);
    expect(_slettbar()).toBe('Ekeberg camping');
    _settSlettbar(null);
    expect(_slettbar()).toBeNull();
  });

  /* ETT KORT AV GANGEN. To åpne ×-er er to spørsmål stilt samtidig. */
  it('og bare ett kort er åpent av gangen', () => {
    _settSlettbar('Ekeberg camping');
    _settSlettbar('Jernbanetorget');
    expect(_slettbar()).toBe('Jernbanetorget');
    _settSlettbar(null);
  });

  /* Og renderen må FAKTISK legge klassen på etter hver tegning — ellers er
   * tilstanden riktig og skjermen viser den ikke. Femte gang i denne økta at
   * det er kallestedet som bærer. */
  /* OG GJENOPPRETTINGEN KJØRES, ikke bare finnes.
   *
   * TRE UTGAVER AV DENNE TOK FEIL FØR, og alle bandt kildetekst: et
   * tegnvindu etter `destBody.innerHTML`, så nærheten mellom `_slettbarNavn`
   * og `vis-slett`, så oppslaget på `data-rad`. Den andre OVERLEVDE at hele
   * gjenopprettingen ble slått av, fordi langtrykk-handleren nevner begge
   * ordene noen linjer under.
   *
   * En vakt kan ikke bindes av et søk i en fil. Den må kjøres. */
  it('og gjenopprettingen legger klassen tilbake etter en tegning', () => {
    document.body.innerHTML = '<div id="b">'
      + kortHtml({ name: 'A', options: KORT.options }, 0)
      + kortHtml({ name: 'B', options: KORT.options }, 1) + '</div>';
    const b = document.getElementById('b');
    _settSlettbar('B');
    _gjenopprettSlett(b);
    expect(b.querySelector('[data-rad="B"]').classList.contains('vis-slett')).toBe(true);
    expect(b.querySelector('[data-rad="A"]').classList.contains('vis-slett')).toBe(false);
    _settSlettbar(null);
  });

  // Og et kort som er borte fra lista glemmes: en tilstand som peker på
  // ingenting ville holdt den neste gesten ute.
  it('og glemmer et kort som ikke er der lenger', () => {
    document.body.innerHTML = '<div id="b">' + kortHtml(KORT, 0) + '</div>';
    _settSlettbar('Finnes ikke');
    _gjenopprettSlett(document.getElementById('b'));
    expect(_slettbar()).toBeNull();
  });
});

/* ── GESTEN, KJØRT ────────────────────────────────────────────────────
 *
 * Kildetekst-testene her var for svake: de krevde at ordene `pointermove` og
 * `HOLD_SLARK_PX` fantes i fila, og mutanten som FJERNET avbruddet overlevde
 * dem — ordene sto der fortsatt, i lytteren og i konstanten.
 */
describe('gesten', () => {
  const sett = (navn) => {
    document.body.innerHTML = '<div id="b">'
      + kortHtml({ name: navn || 'Ekeberg camping', options: KORT.options }, 0) + '</div>';
    return document.getElementById('b');
  };
  const peker = (el, type, x, y) => el.dispatchEvent(new (window.PointerEvent
    || window.MouseEvent)(type, { bubbles: true, clientX: x || 0, clientY: y || 0 }));

  beforeEach(() => { _settSlettbar(null); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('et hold avslører ×-en', () => {
    const b = sett();
    _bindKort(b, []);
    peker(b.querySelector('.auto-dest'), 'pointerdown', 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(b.querySelector('.auto-dest-rad').classList.contains('vis-slett')).toBe(true);
    expect(_slettbar()).toBe('Ekeberg camping');
  });

  it('og et vanlig trykk gjør det ikke', () => {
    const b = sett();
    _bindKort(b, []);
    const kort = b.querySelector('.auto-dest');
    peker(kort, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(HOLD_MS - 100);
    peker(kort, 'pointerup', 10, 10);
    vi.advanceTimersByTime(500);
    expect(b.querySelector('.auto-dest-rad').classList.contains('vis-slett')).toBe(false);
  });

  /* EN SKROLLING SLETTER IKKE. Lista er høyere enn skjermen. */
  it('og en dragning avbryter holdet', () => {
    const b = sett();
    _bindKort(b, []);
    const kort = b.querySelector('.auto-dest');
    peker(kort, 'pointerdown', 10, 10);
    peker(kort, 'pointermove', 10, 10 + HOLD_SLARK_PX + 5);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(b.querySelector('.auto-dest-rad').classList.contains('vis-slett')).toBe(false);
  });

  // Men en finger som skjelver er ikke en dragning.
  it('men ikke en liten skjelving', () => {
    const b = sett();
    _bindKort(b, []);
    const kort = b.querySelector('.auto-dest');
    peker(kort, 'pointerdown', 10, 10);
    peker(kort, 'pointermove', 11, 12);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(b.querySelector('.auto-dest-rad').classList.contains('vis-slett')).toBe(true);
  });

  /* ETT KORT AV GANGEN. To åpne ×-er er to spørsmål stilt samtidig — og
   * mutanten som fjernet lukkingen OVERLEVDE, fordi hver gest-test til da
   * hadde bare ett kort på skjermen. En fikstur med ett element kan ikke se
   * en regel om to. */
  it('og et nytt hold lukker det forrige', () => {
    document.body.innerHTML = '<div id="b">'
      + kortHtml({ name: 'A', options: KORT.options }, 0)
      + kortHtml({ name: 'B', options: KORT.options }, 1) + '</div>';
    const b = document.getElementById('b');
    _bindKort(b, []);
    const kort = b.querySelectorAll('.auto-dest');
    peker(kort[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(b.querySelector('[data-rad="A"]').classList.contains('vis-slett')).toBe(true);
    peker(kort[1], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(b.querySelector('[data-rad="A"]').classList.contains('vis-slett')).toBe(false);
    expect(b.querySelector('[data-rad="B"]').classList.contains('vis-slett')).toBe(true);
  });

  /* HOLDET SVELGER KLIKKET. Uten dette navigerer et langtrykk deg til tavla
   * i stedet for å avsløre ×-en. */
  it('og holdet navigerer ikke', () => {
    const b = sett();
    const reiser = [];
    window._useRouteDir = (d) => reiser.push(d);
    _bindKort(b, [{ name: 'Ekeberg camping', id: null, options: KORT.options }]);
    const kort = b.querySelector('.auto-dest');
    peker(kort, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 50);
    kort.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(reiser).toHaveLength(0);
    delete window._useRouteDir;
  });

  /* OG ×-EN GLEMMER STEDET. Hele veien: historikken skrives, og raden
   * forsvinner uten at resten av skjermen tegnes om — «ro er regelen». */
  it('og ×-en glemmer stedet', () => {
    localStorage.clear();
    saveFreq('arr', [{ name: 'Ekeberg camping', count: 3, lastUsed: Date.now() },
      { name: 'Jernbanetorget', count: 9, lastUsed: Date.now() }]);
    const b = sett();
    _bindKort(b, []);
    b.querySelector('.auto-dest-del').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true }));
    expect(loadFreq('arr').map(p => p.name)).toEqual(['Jernbanetorget']);
    expect(b.querySelector('.auto-dest-rad')).toBeNull();
    expect(_slettbar()).toBeNull();
  });
});

describe('og iOS åpner ikke sin egen meny midt i gesten', () => {
  /* `-webkit-touch-callout` fantes ingen steder i repoet. Uten den svarer
   * Safari på et langtrykk med systemets kontekstmeny, og gesten er død på
   * den ene plattformen appen er bygget for. */
  it('kortet slår av callout og tekstvalg', () => {
    const blokk = css().slice(css().indexOf('#v-auto .auto-dest{'));
    const regel = blokk.slice(0, blokk.indexOf('}'));
    expect(regel).toMatch(/-webkit-touch-callout:\s*none/);
    expect(regel).toMatch(/user-select:\s*none/);
  });

  /* Og ×-en er stor nok til en finger. 44 px er gulvet kortet selv har
   * (`settings.css:710`), og `track.css:233` er et målt bevis på hva som
   * skjer når trykkflater er mindre enn de ser ut. */
  it('og slettekappen har en fingerstor flate', () => {
    // 44 px står i den ÅPNE tilstanden — skjult er den null bred med vilje,
    // så kortets tekst ikke hopper når den kommer fram.
    const c = css();
    const i = c.indexOf('.vis-slett .auto-dest-del');
    expect(i).toBeGreaterThan(-1);
    expect(c.slice(i, c.indexOf('}', i))).toMatch(/44px/);
  });

  /* TASTATUR NÅR DEN UTEN Å VITE OM NOE LANGTRYKK. Det er hele grunnen til
   * at ×-en er en ekte knapp hele tiden. */
  it('og blir synlig når den får fokus', () => {
    expect(css()).toMatch(/\.auto-dest-del:focus-visible/);
  });
});
