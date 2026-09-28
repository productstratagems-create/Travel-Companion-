/**
 * Hvor er jeg nå — og hvem svarte på det.
 *
 * Underveis-skjermen var blind. `computeState` er rent klokkedrevet, så
 * «neste stopp» var den første avgangen som ikke hadde gått — ikke stoppet du
 * nærmer deg. GPS-en din ble brukt til å plassere TOGET, aldri deg selv.
 *
 * Valgt regel: posisjonen vinner når den er fersk og nøyaktig. Det farlige
 * med det er at det lager TO svar på ett spørsmål. Derfor dømmer ett sted, og
 * svaret bærer med seg hvem som dømte.
 */
import { describe, it, expect } from 'vitest';
import { whereAmI, whereAmILabel, AT_STOP_M } from '../src/api/whereAmI.js';
import { SRC_LABEL } from '../src/api/posSource.js';
import { AT_PLACE_M } from '../src/geo.js';
import { pushFix } from '../src/trail.js';

// Fire stopp på en linje sørover, ca 1,1 km mellom hvert.
const STOPP = [
  { id: 'a', name: 'Mortensrud', lat: 59.8400, lon: 10.8200 },
  { id: 'b', name: 'Skullerud', lat: 59.8500, lon: 10.8200 },
  { id: 'c', name: 'Ryen', lat: 59.8600, lon: 10.8200 },
  { id: 'd', name: 'Manglerud', lat: 59.8700, lon: 10.8200 },
];

const GOD = { usable: true, label: 'fersk', kind: 'ok', acc: 12 };
const spor = (...punkter) => punkter.reduce((t, p) => pushFix(t, p), []);

/** En reise nordover: fiksene nærmer seg stoppet vi tester mot. */
const motRyen = spor(
  { lat: 59.8520, lon: 10.8200, at: 1000, acc: 10 },
  { lat: 59.8550, lon: 10.8200, at: 6000, acc: 10 },
  { lat: 59.8570, lon: 10.8200, at: 11000, acc: 10 },
);
// Og en som HAR PASSERT Ryen, men ennå er nærmest den: 59.8620 er ~220 m
// forbi Ryen og ~890 m før Manglerud. (Første fikstur satte punktet midt
// mellom de to, der «nærmest» var et myntkast — og testen målte da noe
// annet enn den påsto.)
const fraRyen = spor(
  { lat: 59.8590, lon: 10.8200, at: 1000, acc: 10 },
  { lat: 59.8605, lon: 10.8200, at: 6000, acc: 10 },
  { lat: 59.8620, lon: 10.8200, at: 11000, acc: 10 },
);

describe('når posisjonen svarer', () => {
  // Du står ved stoppet. Da trengs ingen tolkning.
  it('sier hvilket stopp du står ved', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8600, lon: 10.8201 }, trail: [] });
    expect(r.idx).toBe(2);
    expect(r.source).toBe('gps');
    expect(r.distM).toBeLessThanOrEqual(AT_STOP_M);
  });

  // DETTE ER HELE POENGET: klokka sier ett stopp, posisjonen et annet, og
  // posisjonen vinner. Ruteplanen tror du er på Mortensrud.
  it('overstyrer ruteplanen når de er uenige', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8600, lon: 10.8200 }, trail: [] });
    expect(r.idx).toBe(2);
    expect(r.idx).not.toBe(0);
  });

  // Mellom to stopp avgjør RETNINGEN. Uten den kan avstand alene ikke skille
  // «straks framme» fra «nettopp passert» — forskjellen på å reise seg og å
  // bli sittende.
  it('peker framover når du nærmer deg', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8570, lon: 10.8200 }, trail: motRyen });
    expect(r.idx).toBe(2);
    expect(r.approaching).toBe('mot');
  });

  it('peker til NESTE når du nettopp har passert', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8620, lon: 10.8200 }, trail: fraRyen });
    expect(r.idx).toBe(3);
    expect(r.approaching).toBe('fra');
  });

  it('bærer med seg hvor langt det er', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8570, lon: 10.8200 }, trail: motRyen });
    expect(r.distM).toBeGreaterThan(AT_STOP_M);
    expect(r.distM).toBeLessThan(1000);
  });
});

/**
 * Og når den ikke kan svare, SIES DET.
 *
 * «ikke spurt», «leter», «avslått», «unøyaktig» og «gammel» er ikke samme
 * setning. Stillhet leses som «alt er i orden».
 */
describe('når ruteplanen må svare', () => {
  const daarlig = (label) => ({ usable: false, label });

  it('faller til rutetid når posisjonen ikke er brukbar, og sier hvorfor', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 1, quality: daarlig('posisjon avslått'),
      pos: { lat: 59.8600, lon: 10.8200 }, trail: motRyen });
    expect(r.idx).toBe(1);
    expect(r.source).toBe('rutetid');
    expect(r.why).toBe('posisjon avslått');
  });

  it('skiller de ulike grunnene fra hverandre', () => {
    const grunner = ['posisjon avslått', 'gammel posisjon', 'unøyaktig'].map(l =>
      whereAmI({ stops: STOPP, clockIdx: 1, quality: daarlig(l), pos: null, trail: [] }).why);
    expect(new Set(grunner).size).toBe(3);
  });

  it('faller til rutetid uten posisjon i det hele tatt', () => {
    expect(whereAmI({ stops: STOPP, clockIdx: 2, quality: GOD, pos: null, trail: [] }))
      .toMatchObject({ idx: 2, source: 'rutetid' });
  });

  /* DENNE PÅSTANDEN ER ENDRET MED VILJE — se #405 og blokka nederst.
   *
   * Den bandt at en god posisjon UTEN retning falt til klokka. Det var riktig
   * da den ble skrevet, men reiseloggen fra den første ekte turen viste hva
   * det kostet: «N m» forsvant fra raden, selv om avstanden var regnet ut for
   * å velge den. Og utfallet var uansett det samme, for lista er
   * framover-filtrert.
   *
   * Fallet til klokka gjenstår der det HØRER HJEMME: når to stopp er omtrent
   * like nær, og «nærmeste» er et myntkast. Det er denne testen nå. */
  it('faller til rutetid når to stopp er omtrent like nær', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 1, quality: GOD,
      pos: { lat: 59.8550, lon: 10.8200 }, trail: [] });
    expect(r.source).toBe('rutetid');
    expect(r.why).toMatch(/vei/);
  });

  it('faller til rutetid når stoppene mangler koordinater', () => {
    const uten = [{ name: 'Mortensrud' }, { name: 'Ryen' }];
    expect(whereAmI({ stops: uten, clockIdx: 1, quality: GOD,
      pos: { lat: 59.86, lon: 10.82 }, trail: [] }).source).toBe('rutetid');
  });

  it('tåler tomt', () => {
    expect(whereAmI({}).source).toBe('rutetid');
    expect(whereAmI().idx).toBe(0);
  });
});

describe('setningen skjermen viser', () => {
  // MED STRIPENS EGNE ORD. Stripen navngir sensoren som plasserte toget,
  // lista den som plasserte deg — og da de ble skrevet hver for seg hadde de
  // hvert sitt ordvalg for det samme. Nå leser begge SRC_LABEL.
  it('navngir kilden med de samme ordene som stripen', () => {
    expect(whereAmILabel({ source: 'gps', why: 'du nærmer deg' }))
      .toBe(SRC_LABEL.gps + ' · du nærmer deg');
    expect(whereAmILabel({ source: 'rutetid', why: 'gammel posisjon' }))
      .toBe(SRC_LABEL.rutetid + ' · gammel posisjon');
  });

  it('og lar grunnen være med, for den er hele forskjellen', () => {
    const uten = whereAmILabel({ source: 'rutetid', why: '' });
    expect(uten).toBe(SRC_LABEL.rutetid);
    expect(uten).not.toMatch(/·/);
  });
});

/**
 * Og at terskelen ikke er en ny oppfinnelse.
 *
 * `AT_STOP_M` står som eget navn her fordi geo.js drar med seg state, config
 * og http, og hele poenget med en bladmodul er at den kan prøves uten dem.
 * Men to tall som betyr det samme er nettopp feilformen — så de bindes.
 */
describe('terskelen', () => {
  it('er den samme som appen ellers bruker for «du er der»', () => {
    expect(AT_STOP_M).toBe(AT_PLACE_M);
  });
});

/**
 * Og den fjerde utgangen: vis avstanden du alt har regnet ut. Issue #405.
 *
 * Fra den første ekte turen:
 *
 *   16:04  rutetid  vet ikke hvilken vei du kjører  Skullerud  ±14 m
 *
 * Posisjonen var utmerket, og ble likevel forkastet. UTFALLET VAR RIKTIG —
 * `rute()` gir `clockIdx`, og lista er framover-filtrert, så stoppet stemte.
 * Det som gikk tapt var attribusjonen og AVSTANDEN: `distM` er null på
 * rutetid-stien, så «N m» forsvant fra raden.
 *
 * Rettesnorens punkt 2: vis det du allerede vet.
 *
 * Hvorfor retningen var ukjent: `approach` trenger minst to fikser med tid
 * mellom seg. Telefonen opp av lomma, appen våkner, én god fiks — og
 * retningen er ukjent i noen sekunder. Det vanlige tilfellet.
 */
describe('når retningen er ukjent, men posisjonen er god', () => {
  // FØR-BILDET: tomt spor, god posisjon, mellom to stopp.
  it('svarer med posisjon framfor å falle til klokka', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8570, lon: 10.8200 }, trail: [] });
    expect(r.source).toBe('gps');
  });

  it('og viser avstanden den alt regnet ut', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8570, lon: 10.8200 }, trail: [] });
    expect(r.distM).toBeGreaterThan(0);
    expect(r.distM).toBeLessThan(1000);
  });

  // ÆRLIG ORDLYD. Vi vet ikke at du nærmer deg — bare hvilket stopp som er
  // nærmest av dem som gjenstår.
  it('sier ikke at du nærmer deg, for det vet den ikke', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8570, lon: 10.8200 }, trail: [] });
    expect(r.why).toMatch(/nærmeste stopp framover/);
    expect(r.why).not.toMatch(/du nærmer deg/);
    expect(r.approaching).toBe(null);
  });

  it('peker på det nærmeste gjenstående stoppet', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 0, quality: GOD,
      pos: { lat: 59.8570, lon: 10.8200 }, trail: [] });
    expect(STOPP[r.idx].name).toBe('Ryen');
  });

  /* ET MYNTKAST SKAL IKKE FÅ `gps`.
   *
   * Midt mellom to stopp er «nærmeste» tilfeldig, og et svar med kilde
   * «din gps» ville vært mer selvsikkert enn kunnskapen bak det. Fiksturen
   * min i v1.154.0 sto nettopp i et slikt punkt, og målte noe annet enn den
   * påsto. */
  it('faller til rutetid når to stopp er omtrent like nær', () => {
    const midt = { lat: 59.8550, lon: 10.8200 };   // midt mellom Skullerud og Ryen
    const r = whereAmI({ stops: STOPP, clockIdx: 1, quality: GOD,
      pos: midt, trail: [] });
    expect(r.source).toBe('rutetid');
  });

  it('og sier fortsatt fra når posisjonen ikke er brukbar', () => {
    const r = whereAmI({ stops: STOPP, clockIdx: 1,
      quality: { usable: false, label: 'posisjon avslått' },
      pos: { lat: 59.8570, lon: 10.8200 }, trail: [] });
    expect(r.source).toBe('rutetid');
    expect(r.why).toBe('posisjon avslått');
  });
});

/**
 * Og at skjermen faktisk viser avstanden.
 *
 * Kildetest, fordi `renderStopRow` ikke tegnes av noen enhetstest her.
 *
 * DEN FANT EN EKTE, SKJULT FEIL: betingelsen sammenliknet med `'posisjon'`,
 * et kildenavn som ble byttet ut i v1.154.0 da kildene fikk `gps`/`rutetid`
 * — de samme SRC_LABEL bruker. Avstanden har derfor ALDRI blitt vist, i
 * noen utgivelse. Prøven meldte «avstand: (ingen)», og jeg forklarte det
 * bort som «undertrykt fordi du står ved stoppet». Plausibelt, og galt.
 */
describe('avstanden når skjermen', () => {
  const src = () => require('node:fs')
    .readFileSync('src/views/track.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('sammenlikner mot et kildenavn som finnes', () => {
    const m = src().match(/hvor\.source === '([a-zå-æø]+)'/);
    expect(m).toBeTruthy();
    expect(SRC_LABEL).toHaveProperty(m[1]);
  });

  it('og viser tallet når posisjonen svarte', () => {
    expect(src()).toMatch(/stop-near/);
    expect(src()).toMatch(/hvor\.distM != null/);
  });

  // «0 m» ved siden av «du er ved stoppet» er to setninger om det samme.
  it('men ikke når du står ved stoppet', () => {
    expect(src()).toMatch(/hvor\.approaching !== 'staar'/);
  });
});
