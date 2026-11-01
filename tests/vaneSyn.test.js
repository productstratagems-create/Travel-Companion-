/**
 * Løftet appen ikke holdt — og hva det er endret til.
 *
 * `public/privacy.html` sa at appen husker reisene dine «de siste sju
 * døgnene», og at det er av til du slår det på. Det var sant om reiseloggen
 * og usant om `t.smartHist` og `t.freqArr`/`t.freqDep`: de skrives uten
 * samtykke, de hadde intet vindu, og de bærer avreisested, destinasjon og
 * KOORDINATER.
 *
 * To utveier fantes, og valget er skrevet ned i `src/vane.js`: lageret
 * endres, og teksten beskriver det som blir igjen. Tre nivåer —
 *
 *   det du har sagt        rute, favoritter           til du sletter
 *   det appen har merket   vaner, ofte brukte steder   90 dager uten bruk
 *   enkeltturer m/ pos.    reiseloggen                 7 døgn, med samtykke
 *
 * Denne fila binder de to påstandene nivå 2 nå hviler på: at det BLIR
 * glemt, og at det KAN SES. Et vindu ingen kan etterprøve er en setning;
 * en oppbevaring ingen kan se er en påstand.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { eldes, VANE_MAKS_DAGER } from '../src/vane.js';
import { loadSmartHist, vaneOversikt, VANE_FELT, recordSmartTrip } from '../src/api/smart.js';
import { loadFreq, saveFreq } from '../src/api/usage.js';
import { storage } from '../src/storage.js';

const DAG = 86400000;
const NÅ = Date.now();
const rå = () => JSON.parse(localStorage.getItem('default::t.smartHist') || '[]');

const vane = (to, over = {}) => ({
  key: to.toLowerCase() + '|3|wd', fromName: 'Mortensrud', toName: to,
  toStopId: 'NSR:StopPlace:' + to, toLat: 59.9139, toLon: 10.7522,
  fromStopId: 'NSR:StopPlace:Mortensrud', bucket: 3, isWeekend: false,
  count: 12, lastUsed: NÅ - DAG, ...over,
});
const sett = (rows) => storage.set('t.smartHist', JSON.stringify(rows));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

/* ── FØR-BILDET ─────────────────────────────────────────────────────────
 *
 * En vane fra i fjor overlevde alt annet enn å slette hele profilen. */
describe('før-bildet: vanen fra i fjor', () => {
  it('glemmes nå', () => {
    sett([vane('Lysaker', { lastUsed: NÅ - 400 * DAG })]);
    expect(loadSmartHist()).toHaveLength(0);
  });

  it('mens den du brukte i går står', () => {
    sett([vane('Lysaker')]);
    expect(loadSmartHist()).toHaveLength(1);
  });
});

describe('vinduet', () => {
  it('går ved VANE_MAKS_DAGER', () => {
    const i = (d) => eldes([vane('X', { lastUsed: NÅ - d })], NÅ).length;
    expect(i(VANE_MAKS_DAGER * DAG - 1000)).toBe(1);
    expect(i(VANE_MAKS_DAGER * DAG + 1000)).toBe(0);
  });

  /* ÉN DEFINISJON, TO LAGRE. Sto tallet i både smart.js og usage.js, ville
   * appen før eller siden glemt en destinasjon og husket at du pleide å
   * reise dit — kodebasens signaturfeil, i den formen som er verst her:
   * halvparten av et personvernløfte. */
  it('og begge lagrene leser det samme navnet', () => {
    const les = f => require('node:fs').readFileSync(f, 'utf8');
    ['src/api/smart.js', 'src/api/usage.js'].forEach(f => {
      expect(les(f), f).toMatch(/import \{ eldes \} from '\.\.\/vane\.js'/);
      expect(les(f), f).toMatch(/eldes\(list\)/);
    });
  });

  it('og «ofte brukte steder» eldes likt', () => {
    saveFreq('arr', [
      { name: 'Lysaker', count: 9, lastUsed: NÅ - DAG, lat: 59.9, lon: 10.6 },
      { name: 'Ski', count: 9, lastUsed: NÅ - 400 * DAG, lat: 59.7, lon: 10.8 },
    ]);
    expect(loadFreq('arr').map(p => p.name)).toEqual(['Lysaker']);
  });

  /* SKREVET TILBAKE, IKKE BARE FILTRERT. `eventLog.js:112` sier hvorfor:
   * det som ligger i lageret, ikke det som vises, er det en som får
   * telefonen ulåst i hendene kan lese. Her bærer radene koordinater. */
  it('og det gamle ligger ikke igjen i lageret', () => {
    sett([vane('Lysaker'), vane('Ski', { lastUsed: NÅ - 400 * DAG })]);
    expect(rå()).toHaveLength(2);        // måleinstrumentet: det ER to der
    loadSmartHist();
    expect(rå()).toHaveLength(1);
    expect(JSON.stringify(rå())).not.toMatch(/Ski/);
  });

  it('og en rad uten lastUsed kastes ikke', () => {
    sett([vane('Lysaker', { lastUsed: undefined })]);
    expect(loadSmartHist()).toHaveLength(1);
  });

  it('og det skrives ikke tilbake når ingenting falt', () => {
    sett([vane('Lysaker')]);
    const før = localStorage.getItem('default::t.smartHist');
    loadSmartHist();
    expect(localStorage.getItem('default::t.smartHist')).toBe(før);
  });
});

/* ── DET LAGREDE ER DET VISTE ───────────────────────────────────────────
 *
 * Invarianten `eventLog.js` bærer for loggen, nå for vanene også: «EVERY
 * FIELD STORED IS A FIELD SHOWN.» Testen leser feltene ut av det LAGREDE
 * og krever at hvert av dem er navngitt. Legg til et felt og glem å vise
 * det, og denne faller.
 */
describe('alt som lagres er navngitt', () => {
  it('hvert felt recordSmartTrip skriver står i VANE_FELT', () => {
    recordSmartTrip('Mortensrud', 'Lysaker', 'NSR:StopPlace:L', 59.91, 10.75,
      'NSR:StopPlace:M');
    const rad = rå()[0];
    expect(Object.keys(rad).length).toBeGreaterThan(5);   // instrumentet
    Object.keys(rad).forEach(f =>
      expect(VANE_FELT[f], 'ulagret felt: ' + f).toBeTruthy());
  });
});

describe('oversikten en leser får', () => {
  it('navngir begge endene og tidsrommet', () => {
    sett([vane('Lysaker')]);
    const r = vaneOversikt(NÅ)[0];
    expect(r.tekst).toContain('Mortensrud → Lysaker');
    expect(r.tekst).toMatch(/rundt 06–08/);
    expect(r.tekst).toContain('ukedag');
    expect(r.antall).toBe(12);
  });

  /* KOORDINATENE STÅR DER. De er det mest avslørende i raden, og en
   * oversikt som utelot dem ville vært den sorten åpenhet som skjuler
   * nettopp det som betyr noe. */
  it('og koordinatene står i klartekst når de er lagret', () => {
    sett([vane('Lysaker')]);
    expect(vaneOversikt(NÅ)[0].tekst).toMatch(/59\.913\d/);
    expect(vaneOversikt(NÅ)[0].tekst).toMatch(/10\.752\d/);
  });

  it('men ikke når de ikke er det', () => {
    sett([vane('Lysaker', { toLat: null, toLon: null })]);
    expect(vaneOversikt(NÅ)[0].tekst).not.toMatch(/posisjon/);
  });

  it('nyest først, og tåler søppel', () => {
    sett([vane('Ski', { lastUsed: NÅ - 10 * DAG }), vane('Lysaker'), null, {}]);
    expect(vaneOversikt(NÅ).map(r => r.tekst.split(' → ')[1].split(' ·')[0]))
      .toEqual(['Lysaker', 'Ski']);
  });

  it('og helg sies ikke «ukedag»', () => {
    sett([vane('Lysaker', { isWeekend: true })]);
    expect(vaneOversikt(NÅ)[0].tekst).toContain('helg');
    expect(vaneOversikt(NÅ)[0].tekst).not.toContain('ukedag');
  });
});

/* ── OG DEN SOM ALDRI SIER JA SKAL SE DET ───────────────────────────────
 *
 * `renderMemory` returnerte tidlig uten samtykke, og «slett alt appen
 * husker» lå inne i `mem-body`, som er `hidden` i samme tilstand. Altså:
 * du måtte si ja til å bli husket MER for å få se — eller slette — det som
 * ble lagret uansett. Fjerde gang den knappen ikke holder det den lover.
 */
describe('synlig og slettbar uten samtykke', () => {
  const html = () => require('node:fs').readFileSync('index.html', 'utf8');
  const js = () => require('node:fs').readFileSync('src/views/settings.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('vanelista ligger utenfor mem-body', () => {
    const h = html();
    const body = h.indexOf('id="mem-body"');
    const slutt = h.indexOf('</div>', h.indexOf('id="mem-list"'));
    const vane = h.indexOf('id="mem-vane"');
    expect(body, 'fant ikke mem-body').toBeGreaterThan(0);
    expect(vane, 'fant ikke mem-vane').toBeGreaterThan(slutt);
  });

  it('og det gjør sletteknappen også', () => {
    const h = html();
    // Knappen skal stå ETTER at mem-body er lukket. Måles på at den ikke
    // lenger er det siste barnet i den blokka: `hidden` arves av alt inni.
    const body = h.slice(h.indexOf('id="mem-body"'));
    const innenfor = body.slice(0, body.indexOf('</div>\n\n'));
    expect(innenfor).not.toContain('mem-clear');
  });

  it('og renderen tegner vanene før den spør om samtykke', () => {
    const src = js();
    const i = src.indexOf('export function renderMemory');
    const kropp = src.slice(i, i + 400);
    /* BEGGE MÅ FINNES FØR DE SAMMENLIGNES. Første utgave sammenlignet
     * `indexOf` direkte, og mutanten som FJERNET kallet overlevde: -1 er
     * mindre enn alt. Et «før» mellom noe og ingenting er ikke et før. */
    const a = kropp.indexOf('_renderVaner()');
    const b = kropp.indexOf('loadConsent()');
    expect(a, 'renderMemory kaller ikke _renderVaner').toBeGreaterThan(-1);
    expect(b, 'fant ikke loadConsent').toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
  });

  /* Og dagene på skjermen kommer fra kilden. Sto «90» skrevet i markupen,
   * ville teksten og vinduet kunnet drive fra hverandre — og det er
   * personvernløftet som da ville vært det usanne. */
  it('og antall dager leses fra vane.js', () => {
    expect(js()).toMatch(/textContent = String\(VANE_MAKS_DAGER\)/);
  });
});

describe('og personvernsida sier det samme', () => {
  const sida = () => require('node:fs').readFileSync('public/privacy.html', 'utf8');

  it('navngir vanene som noe som skrives uten å spørre', () => {
    const t = sida();
    expect(t).toMatch(/uten at du blir spurt/);
    expect(t).toContain(String(VANE_MAKS_DAGER) + ' dager');
  });

  it('og sier fortsatt sju døgn om loggen', () => {
    expect(sida()).toMatch(/[Ss]ju døgn, ikke lenger/);
  });

  /* I AVSNITTET OM VANENE, ikke hvor som helst på sida.
   *
   * Første utgave var `toMatch(/koordinaten/i)` mot hele dokumentet, og
   * mutanten som fjernet innrømmelsen fra nivå 2 OVERLEVDE: ordet står også
   * i kulepunktet om at de vises på skjermen. Et ord som finnes er ikke en
   * innrømmelse om riktig ting. */
  it('og innrømmer, i avsnittet om vanene, at koordinatene lagres', () => {
    const t = sida();
    const fra = t.indexOf('<h3>2.');
    const til = t.indexOf('<h3>3.');
    expect(fra, 'fant ikke nivå 2').toBeGreaterThan(0);
    expect(til).toBeGreaterThan(fra);
    const nivå2 = t.slice(fra, til);
    expect(nivå2).toMatch(/lagres også\s+koordinaten/);
  });
});
