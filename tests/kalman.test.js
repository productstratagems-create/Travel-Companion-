/**
 * Prikken frøs, og ingen visste hvor du var blitt av.
 *
 * Spurt: kan åpen kildekode hjelpe appen å spore og framskrive posisjonen når
 * GPS-dekningen svikter — i en tunnel, i en bygate, innendørs?
 *
 * Svaret var at det sterkeste alt var bygget (`whereAmI` faller til rutetid og
 * SIER det), men at tre opplysninger kastes:
 *
 *   geo.js:660   const { latitude, longitude, accuracy } = pos.coords;
 *   geo.js:583   const EMA_α = 0.3;
 *
 * `coords.speed` og `coords.heading` forsvinner ved destrukturering, og
 * `accuracy` brukes bare til en binær port. EMA-en demper; den framskriver
 * ikke, og den vet ikke hvor god en fiks er.
 *
 * ET KONSTANT-HASTIGHETSFILTER LØSER ALLE TRE med én tilstand: posisjon og
 * hastighet, og en usikkerhet som VOKSER når ingenting kommer inn.
 *
 * «Framskrevet, ±80 m» er en setning appen kan stå for. «Prikken står der den
 * sto» er det ikke — og det er regel 4 i AGENTS.md, anvendt på posisjonen.
 */
import { describe, it, expect } from 'vitest';
import { nyttFilter, prediker, oppdater, anslag,
  AKSELERASJON_MS2, FRAMSKRIV_MAKS_MS } from '../src/kalman.js';
import { STILL_MS } from '../src/trail.js';
import { posState, POS_KINDS, POS_STALE_MS, POS_DEAD_MS } from '../src/position.js';
import fs from 'node:fs';

const OSLO = { lat: 59.9139, lon: 10.7522 };
const M_PER_DEG = 111320;
const mPerDegLon = M_PER_DEG * Math.cos(OSLO.lat * Math.PI / 180);

/** Et punkt N meter nord og Ø meter øst for Oslo S. */
const punkt = (nord, øst) => ({
  lat: OSLO.lat + nord / M_PER_DEG,
  lon: OSLO.lon + øst / mPerDegLon,
});
/** Avstand i meter mellom to lat/lon, i den samme flate ramma. */
const meter = (a, b) => Math.hypot(
  (a.lat - b.lat) * M_PER_DEG, (a.lon - b.lon) * mPerDegLon);

const fiks = (t, nord, øst, acc, mer) =>
  ({ ...punkt(nord, øst), at: t, acc, ...(mer || {}) });

describe('fiksturen selv', () => {
  /* MÅLEINSTRUMENTET FØRST. Regner `meter()` feil, måler hver eneste påstand
   * under noe annet enn den tror. Bundet mot modulens egen omregning ved å
   * gå tur-retur gjennom filteret. */
  it('regner meter og grader om konsistent', () => {
    const f = nyttFilter(fiks(0, 0, 0, 5));
    const a = anslag(f);
    expect(meter(a, OSLO)).toBeLessThan(0.5);
    expect(meter(punkt(100, 0), OSLO)).toBeCloseTo(100, 0);
    expect(meter(punkt(0, 100), OSLO)).toBeCloseTo(100, 0);
  });
});

describe('en fiks veier etter hvor god den er', () => {
  /* PÅSTANDEN SOM BÆRER DET FØRSTE HULLET.
   *
   * EMA-en ga en fiks på ±5 m og en på ±35 m nøyaktig samme vekt — `accuracy`
   * nådde aldri utjevningen. Her er det hele forskjellen. */
  it('en presis fiks flytter estimatet mer enn en upresis', () => {
    const start = () => nyttFilter(fiks(0, 0, 0, 5));
    const presis = anslag(oppdater(start(), fiks(1000, 100, 0, 5)));
    const upresis = anslag(oppdater(start(), fiks(1000, 100, 0, 100)));
    const flyttet = (a) => meter(a, OSLO);
    expect(flyttet(presis)).toBeGreaterThan(flyttet(upresis));
  });

  /* OG EN DÅRLIG FIKS KASTES IKKE. `ACC_GATE` kaster alt over ±40 m, og
   * `trail.js` sier allerede hvorfor det er feil for en serie: «a series that
   * inherited that rule would be blind exactly where it is needed». Filteret
   * gjør det riktige av seg selv — den teller, bare lite. */
  /* FØRSTE UTGAVE AV DENNE KREVDE AT EN ±150 M FIKS FLYTTET ESTIMATET MER
   * ENN EN HALV METER, og den feilet mot riktig kode: filteret flyttet det
   * 0,22 m. Det er det RIKTIGE svaret — en fiks på ±150 m skal nesten ikke
   * røre et estimat som er sikkert til ±5 m — og terskelen min var et tall
   * jeg fant på.
   *
   * Påstanden som faktisk bærer er den motsatte: den samme dårlige fiksen
   * skal flytte MYE når filteret ikke vet bedre. Det er nettopp da den er
   * den eneste opplysningen som finnes, og det er hele grunnen til at den
   * ikke skal kastes slik `ACC_GATE` kaster den. */
  it('og den samme dårlige fiksen flytter mye når filteret er usikkert', () => {
    const sikker = oppdater(nyttFilter(fiks(0, 0, 0, 5)), fiks(1000, 100, 0, 150));
    const usikker = oppdater(nyttFilter(fiks(0, 0, 0, 200)), fiks(1000, 100, 0, 150));
    const flyttet = (f) => meter(anslag(f), OSLO);
    expect(flyttet(usikker)).toBeGreaterThan(flyttet(sikker) * 10);
    expect(flyttet(sikker)).toBeGreaterThan(0);     // kastet, ville vært null
  });

  // Og usikkerheten krymper når noe kommer inn. Uten dette ville et filter
  // som ignorerte hver måling bestått påstandene over.
  it('og usikkerheten krymper av en måling', () => {
    const f = nyttFilter(fiks(0, 0, 0, 30));
    const før = anslag(f).sigmaM;
    for (let i = 1; i <= 5; i++) oppdater(f, fiks(i * 1000, 0, 0, 5));
    expect(anslag(f).sigmaM).toBeLessThan(før);
  });
});

describe('framskriving når fiksene slutter', () => {
  /* PÅSTANDEN SOM BÆRER HELE SPØRSMÅLET.
   *
   * Mot dagens kode skjer det ingenting her: `state.homeLL` står stille til
   * neste fiks kommer. I en tunnel er det i flere minutter. */
  it('fører estimatet videre langs farten', () => {
    // Fem sekunder nordover i 10 m/s, så stillhet.
    const f = nyttFilter(fiks(0, 0, 0, 5, { speed: 10, heading: 0 }));
    for (let i = 1; i <= 5; i++) oppdater(f, fiks(i * 1000, i * 10, 0, 5));
    const ved5s = anslag(f);
    prediker(f, 15_000);                       // ti sekunder uten en eneste fiks
    const ved15s = anslag(f);
    expect(meter(ved15s, ved5s)).toBeGreaterThan(50);
    // Og i RIKTIG retning: nordover, ikke bare «et annet sted».
    expect(ved15s.lat).toBeGreaterThan(ved5s.lat);
    expect(Math.abs(ved15s.lon - ved5s.lon) * mPerDegLon).toBeLessThan(10);
  });

  /* OG DEN SIER HVOR USIKKER DEN ER. Det er forskjellen på en framskriving og
   * en påstand: uten en voksende sigma ville skjermen ikke kunne skille «du er
   * her» fra «du er trolig her, ±80 m». */
  it('og usikkerheten vokser med tida uten fikser', () => {
    const f = nyttFilter(fiks(0, 0, 0, 5, { speed: 10, heading: 0 }));
    const s0 = anslag(f).sigmaM;
    prediker(f, 30_000);
    const s30 = anslag(f).sigmaM;
    prediker(f, 120_000);
    expect(s30).toBeGreaterThan(s0);
    expect(anslag(f).sigmaM).toBeGreaterThan(s30);
  });

  // Og den står stille når du gjør det. En framskriving som alltid beveger
  // seg ville sendt en ventende leser nedover sporet.
  it('men står stille når farten er null', () => {
    const f = nyttFilter(fiks(0, 0, 0, 5));
    for (let i = 1; i <= 6; i++) oppdater(f, fiks(i * 1000, 0, 0, 5));
    const før = anslag(f);
    prediker(f, 60_000);
    expect(meter(anslag(f), før)).toBeLessThan(5);
  });

  /* EN KLOKKE SOM GÅR BAKOVER ER IKKE EN BEVEGELSE. Og en som STÅR er noe
   * tredje: `watchPosition` leverer fikser et millisekund fra hverandre, og
   * `position.js:56` sier allerede at «at short intervals the clock is the
   * least trustworthy part of the reading». Et nullintervall behandles derfor
   * som gulvet `MIN_DT_S`, ikke som null — ellers legges det aldri til
   * prosesstøy, kovariansen kollapser, og filteret slutter å følge
   * målingene. Prisen er ett tidels sekunds bevegelse, og det er riktig pris. */
  it('tåler at klokka går bakover, og at den står', () => {
    const f = nyttFilter(fiks(10_000, 0, 0, 5, { speed: 10, heading: 90 }));
    const før = anslag(f);
    prediker(f, 5_000);                        // før forrige fiks: ingenting skjer
    expect(meter(anslag(f), før)).toBeLessThan(0.01);
    prediker(f, 10_000);                       // samme tid: høyst gulvet
    expect(meter(anslag(f), før)).toBeLessThanOrEqual(10 * 0.1 + 0.01);
  });

  /* OG KOVARIANSEN KOLLAPSER IKKE PÅ EN STRØM AV FIKSER I SAMME MILLISEKUND.
   *
   * Dette er feilen gulvet finnes for, og den ble funnet av prøvesuiten:
   * `tests/gpsWatch.test.js` sender to hundre fikser i én tight loop, altså
   * med samme `Date.now()`. Uten gulvet sluttet filteret å følge dem, og
   * stasjonsoppslaget ble aldri gjort på nytt — en prikk som henger fast,
   * som er nøyaktig det filteret skulle fjerne, i ny form. */
  it('og følger fortsatt målingene når to hundre kommer i samme millisekund', () => {
    const f = nyttFilter(fiks(0, 0, 0, 8));
    for (let i = 1; i <= 200; i++) oppdater(f, fiks(0, i * 2, 0, 8));
    // Siste måling er 400 m nord. Et filter som har sluttet å lytte ville
    // blitt liggende ved null.
    expect((anslag(f).lat - OSLO.lat) * M_PER_DEG).toBeGreaterThan(300);
  });
});

describe('farten og kursen, som ble kastet ved destrukturering', () => {
  /* FØR-BILDET. `geo.js:660` plukker tre felter av `pos.coords` og lar
   * `speed` og `heading` ligge. Den siste gode fiksen før en tunnel bærer
   * nøyaktig den vektoren en framskriving trenger. */
  it('brukes med én gang, uten å vente på to fikser', () => {
    const med = nyttFilter(fiks(0, 0, 0, 5, { speed: 12, heading: 90 }));
    const uten = nyttFilter(fiks(0, 0, 0, 5));
    prediker(med, 10_000);
    prediker(uten, 10_000);
    // Østover, fordi kursen sa det.
    expect((anslag(med).lon - OSLO.lon) * mPerDegLon).toBeGreaterThan(100);
    expect(meter(anslag(uten), OSLO)).toBeLessThan(1);
  });

  /* ÉN TERSKEL FOR «STÅR STILLE», IKKE TO. Spesifikasjonen sier at `heading`
   * er null når enheten ikke beveger seg, så en fart under `STILL_MS` er
   * ingen retning. Tallet er `trail.js` sitt — to moduler som hver bestemte
   * hva stillstand er, ville vært feilformen dette repoet har rettet rundt
   * tjuefem ganger. */
  it('og en fart under stillstandsterskelen er ingen retning', () => {
    const f = nyttFilter(fiks(0, 0, 0, 5, { speed: STILL_MS / 2, heading: 90 }));
    prediker(f, 60_000);
    expect(meter(anslag(f), OSLO)).toBeLessThan(5);
  });

  it('og en kurs uten fart er det heller ikke', () => {
    const f = nyttFilter(fiks(0, 0, 0, 5, { heading: 90 }));
    prediker(f, 60_000);
    expect(meter(anslag(f), OSLO)).toBeLessThan(5);
  });
});

describe('å følge en bevegelse', () => {
  /* DET FILTERET ER TIL FOR, målt mot det som sto der.
   *
   * Tretti sekunder i 10 m/s nordover, med ±20 m støy på hver fiks. EMA-en
   * med α = 0,3 henger systematisk etter på en jevn bevegelse — den har ingen
   * hastighetstilstand å ligge foran med — og det er nøyaktig det en som går
   * mot et stopp ser som en prikk bak seg selv.
   *
   * Støyen er deterministisk (en sinus), ikke tilfeldig: en test som feiler
   * én gang av tjue er en test ingen stoler på. */
  it('henger mindre etter enn et eksponentielt snitt', () => {
    const EMA = 0.3;
    const f = nyttFilter(fiks(0, 0, 0, 20));
    let ema = { lat: OSLO.lat, lon: OSLO.lon };
    let sumF = 0, sumE = 0, n = 0;
    for (let i = 1; i <= 30; i++) {
      const t = i * 1000;
      const sant = punkt(i * 10, 0);
      const støy = Math.sin(i * 1.7) * 20;
      const målt = { lat: sant.lat + støy / M_PER_DEG, lon: sant.lon, at: t, acc: 20 };
      oppdater(f, målt);
      ema = { lat: EMA * målt.lat + (1 - EMA) * ema.lat,
        lon: EMA * målt.lon + (1 - EMA) * ema.lon };
      if (i > 10) { sumF += meter(anslag(f), sant); sumE += meter(ema, sant); n++; }
    }
    expect(sumF / n).toBeLessThan(sumE / n);
  });
});

describe('tallene som er valgt og ikke målt', () => {
  /* De står her fordi de er de to som mest sannsynlig må flyttes når noen har
   * gått med dem. Sandkassen har ingen spor å spille av — samme forbehold
   * `auto.js:1247` bærer om `PICK_MARGIN_M`, av samme grunn. */
  it('akselerasjonen er i størrelsesorden en som går eller en T-bane', () => {
    expect(AKSELERASJON_MS2).toBeGreaterThan(0.2);
    expect(AKSELERASJON_MS2).toBeLessThan(5);
  });

  it('og framskrivingen gir opp før den blir meningsløs', () => {
    expect(FRAMSKRIV_MAKS_MS).toBeGreaterThan(30_000);
    expect(FRAMSKRIV_MAKS_MS).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe('tåler tull', () => {
  it('uten å kaste', () => {
    expect(nyttFilter(null)).toBeNull();
    expect(nyttFilter({})).toBeNull();
    expect(nyttFilter({ lat: NaN, lon: 10 })).toBeNull();
    expect(anslag(null)).toBeNull();
    expect(prediker(null, 1)).toBeNull();
    const f = nyttFilter(fiks(0, 0, 0, 5));
    expect(() => oppdater(f, null)).not.toThrow();
    expect(() => oppdater(f, { lat: NaN, lon: 1, at: 1, acc: 5 })).not.toThrow();
    expect(meter(anslag(f), OSLO)).toBeLessThan(0.5);
  });

  // En fiks uten accuracy er fortsatt en fiks. Den får en forsiktig varians
  // framfor å bli forkastet eller — verre — behandlet som perfekt.
  it('og en fiks uten accuracy', () => {
    const f = nyttFilter({ ...punkt(0, 0), at: 0 });
    expect(f).toBeTruthy();
    expect(anslag(f).sigmaM).toBeGreaterThan(10);
  });
});

/* ── OG SKJERMEN SIER AT DET ER ET ANSLAG ───────────────────────────────
 *
 * Et filter som fører prikken videre uten at noe sier fra, er en nyere og
 * verre utgave av feilen det skulle rette: før sto prikken stille og løy om
 * at den var fersk; nå ville den BEVEGET seg og løyet om det samme.
 *
 * «Posisjon 2 min gammel» sier at prikken står der den sto. Det er ikke
 * lenger sant, og de to setningene kan ikke være den samme.
 */
describe('anslått posisjon er en egen setning', () => {
  const nå = 1_000_000;
  const grunn = (mer) => ({
    asked: true, homeLL: OSLO, posAt: nå - POS_STALE_MS - 30_000,
    gpsError: null, rejAt: null, acc: 8, now: nå, ...mer,
  });

  /* FØR-BILDET. Uten framskrivingen er dette «gammel», og det er alt
   * skjermen kunne si. */
  it('sier «anslått», ikke «gammel», når filteret har et anslag', () => {
    expect(posState(grunn()).kind).toBe('gammel');
    const p = posState(grunn({ framskrevet: { sigmaM: 83 } }));
    expect(p.kind).toBe('framskrevet');
    expect(p.label).toMatch(/anslått/);
    expect(p.label).toMatch(/±83 m/);
  });

  /* OG DEN ER BRUKBAR. `whereAmI` sin port er nettopp dette flagget: et
   * anslag på ±83 m er langt bedre enn å falle til rutetid. */
  it('og den er brukbar', () => {
    expect(posState(grunn({ framskrevet: { sigmaM: 83 } })).usable).toBe(true);
  });

  /* MEN INGENTING BÆRER FEM MINUTTER. «Borte» sjekkes først, og en
   * framskriving skal ikke kunne overstyre den. */
  it('men et anslag redder ikke en posisjon som er borte', () => {
    const p = posState(grunn({ posAt: nå - POS_DEAD_MS - 1000,
      framskrevet: { sigmaM: 83 } }));
    expect(p.kind).toBe('borte');
    expect(p.usable).toBe(false);
  });

  /* OG «UNØYAKTIG» VINNER FORTSATT, fordi den forklarer HVORFOR det ikke
   * kommer fikser — og det er mer verdt enn å si at vi har gjettet. */
  it('og «unøyaktig» forklarer fortsatt hvorfor', () => {
    const p = posState(grunn({ rejAt: nå - 1000, acc: 120,
      framskrevet: { sigmaM: 83 } }));
    expect(p.kind).toBe('unoyaktig');
  });

  it('en fersk posisjon er fortsatt bare «ok»', () => {
    expect(posState(grunn({ posAt: nå - 1000, framskrevet: { sigmaM: 20 } })).kind)
      .toBe('ok');
  });

  it('og et anslag uten sigma er ikke et anslag', () => {
    expect(posState(grunn({ framskrevet: {} })).kind).toBe('gammel');
    expect(posState(grunn({ framskrevet: { sigmaM: NaN } })).kind).toBe('gammel');
  });

  /* LISTA ER DET ENE STEDET SOM SIER HVILKE TILSTANDER SOM FINNES. En
   * tilstand utenfor den er en tilstand ingen test kan telle — og
   * `'ukjent-alder'` har vært returnert uten å stå der. */
  it('og hver tilstand posState kan returnere står i lista', () => {
    const kilde = fs.readFileSync('src/position.js', 'utf8');
    const brukt = [...kilde.matchAll(/mk\('([a-zæøå-]+)'/g)].map(m => m[1]);
    expect(brukt.length).toBeGreaterThan(8);
    [...new Set(brukt)].forEach(k => expect(POS_KINDS, k).toContain(k));
  });
});

/* ── ETT SPØRSMÅL, IKKE FEM ─────────────────────────────────────────────
 *
 * De seks feltene `posState` tar sto skrevet ned FEM ganger, ordrett like.
 * Et sjette felt betydde fem redigeringer, og en glemt betydde én skjerm som
 * dømte posisjonen etter en annen regel enn de fire andre.
 *
 * Funnet ved at framskrivingen skulle legges til, og regningen var fem.
 */
describe('spørsmålet posState stilles, bygges ett sted', () => {
  const src = () => ['src/views/auto.js', 'src/views/track.js',
    'src/views/board.js', 'src/main.js']
    .map(f => fs.readFileSync(f, 'utf8')).join('\n');

  it('ingen skjerm bygger det selv lenger', () => {
    expect(src()).not.toMatch(/posState\(\{/);
  });

  it('og alle fem spør gjennom det ene navnet', () => {
    expect((src().match(/posState\(posNå\(\)\)/g) || []).length).toBe(5);
  });

  it('og posNå tar framskrivingen med', () => {
    const geo = fs.readFileSync('src/geo.js', 'utf8');
    const i = geo.indexOf('export function posNå(');
    expect(i).toBeGreaterThan(-1);
    expect(geo.slice(i, i + 600)).toMatch(/framskrevet: framskrevetPos\(/);
  });
});
