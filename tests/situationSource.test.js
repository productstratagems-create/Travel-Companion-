/**
 * Én innsamling, ikke fire.
 *
 * Rapportert: «Meldingshåndteringen er wonky.»
 *
 * Den er det, og på en målbar måte: DEN SAMME MELDINGEN OPPFØRER SEG HELT
 * ULIKT ETTER HVILKEN VEI DEN BLE HENTET.
 *
 * v1.105.0 ga meldinger en herkomst — hvor de hang: på stoppet, på linja, på
 * reisen — fordi ingenting annet kan skille «stengt linje 3» fra «heisen på
 * Ljan». Rettelsen ble gjort i `fetchTrip`. Den ble aldri gjort de tre andre
 * stedene den samme løkka står skrevet:
 *
 *   src/api/entur.js:322       addSituation(...)        ✓ v1.105.0
 *   src/views/auto.js          addSituation(...)        ✓ v1.137.0
 *   src/views/board.js:3332    sitMap.set(s.id, s)      ✗
 *   src/api/entur.js:713       sitMap.set(s.id, s)      ✗
 *
 * Uten `_from` er `situationScope` tom, og `relevance` faller gjennom til
 * «vi vet ingenting» — som betyr MITT. På en ren stopptavle og på
 * destinasjonspanelet er derfor hele v1.105.0-maskineriet dødt: hver eneste
 * melding står åpen som om den gjaldt deg.
 *
 * Fire kopier av én løkke, to riktige og to gale, er akkurat den feilformen
 * AGENTS.md navngir. Kuren er den samme som alltid: ett navn.
 */
import { describe, it, expect } from 'vitest';
import { collectStopSituations, relevance } from '../src/api/situations.js';

const MORTENSRUD = 'NSR:StopPlace:Mortensrud';
const sit = (id, txt) => ({ id, severity: 'normal', validityPeriod: {},
  summary: [{ language: 'no', value: txt }] });

/** Et stopptavle-svar, slik alle tre henteveiene får det. */
const svar = () => ({
  id: MORTENSRUD, name: 'Mortensrud',
  situations: [sit('s-stopp', 'Ruteendringer i høstferien')],
  estimatedCalls: [
    { situations: [sit('s-kall', 'Forsinket avgang')],
      serviceJourney: { id: 'sj:1', line: { id: 'RUT:Line:3' },
        situations: [sit('s-linje', 'Linje 3 er innstilt')] } },
    { situations: [],
      serviceJourney: { id: 'sj:2', line: { id: 'RUT:Line:74' },
        // den samme meldingen igjen, på en annen avgang — den skal telles én
        // gang, med begge herkomstene
        situations: [sit('s-linje', 'Linje 3 er innstilt')] } },
  ],
});

describe('collectStopSituations', () => {
  it('samler de tre nivåene og teller hver melding én gang', () => {
    const out = collectStopSituations(svar(), MORTENSRUD);
    expect(out.map(s => s.id).sort()).toEqual(['s-kall', 's-linje', 's-stopp']);
  });

  // DETTE ER HELE POENGET. Uten herkomst er det ingenting å skille på.
  it('gir meldingen om stoppet stoppets herkomst', () => {
    const [s] = collectStopSituations(svar(), MORTENSRUD).filter(x => x.id === 's-stopp');
    expect([...s._from.stops]).toEqual([MORTENSRUD]);
    expect([...s._from.lines]).toEqual([]);
  });

  it('gir meldingen om linja linjas herkomst', () => {
    const [s] = collectStopSituations(svar(), MORTENSRUD).filter(x => x.id === 's-linje');
    expect([...s._from.lines].sort()).toEqual(['RUT:Line:3', 'RUT:Line:74']);
    // normJid løfter reisenøkler til store bokstaver — én nøkkel, som ellers
    // i appen.
    expect([...s._from.journeys].sort()).toEqual(['SJ:1', 'SJ:2']);
  });

  it('gir meldingen på kallet både linja og reisen den hang på', () => {
    const [s] = collectStopSituations(svar(), MORTENSRUD).filter(x => x.id === 's-kall');
    expect([...s._from.lines]).toEqual(['RUT:Line:3']);
    expect([...s._from.journeys]).toEqual(['SJ:1']);
  });

  it('tåler et svar uten noe i det', () => {
    expect(collectStopSituations(null, MORTENSRUD)).toEqual([]);
    expect(collectStopSituations({}, MORTENSRUD)).toEqual([]);
    expect(collectStopSituations({ estimatedCalls: [{}] }, MORTENSRUD)).toEqual([]);
  });
});

/**
 * Og det som faktisk var galt: uten herkomst blir ALT ditt.
 *
 * Dette er før-bildet, sagt som en påstand om oppførsel og ikke om kode.
 */
describe('hva herkomsten avgjør', () => {
  const ctx = { stopIds: [MORTENSRUD], lineIds: ['RUT:Line:3'], journeyIds: [] };

  it('skiller en melding om en annen linje fra dine egne', () => {
    const samlet = collectStopSituations({
      ...svar(),
      estimatedCalls: [
        { situations: [], serviceJourney: { id: 'sj:9', line: { id: 'RUT:Line:31' },
          situations: [sit('s-annen', 'Linje 31 kjører ikke')] } },
      ],
    }, MORTENSRUD);
    const annen = samlet.find(s => s.id === 's-annen');
    expect(relevance(annen, ctx)).toBe('other');
  });

  it('og lar meldingen om ditt eget stopp være din', () => {
    const samlet = collectStopSituations(svar(), MORTENSRUD);
    const stopp = samlet.find(s => s.id === 's-stopp');
    expect(relevance(stopp, ctx)).toBe('mine');
  });

  // UTEN HERKOMST ER DE TO IKKE TIL Å SKILLE. Slik så en stopptavle ut.
  // (relevance tar MELDINGEN, ikke scopet — første utgave av denne testen ga
  // den scopet, fikk tom _from inni, og målte derfor ingenting.)
  it('uten herkomst blir begge «mine» — som var feilen', () => {
    const uten = { id: 's-annen', severity: 'normal', validityPeriod: {}, summary: [] };
    expect(relevance(uten, ctx)).toBe('mine');
  });
});

describe('hvert hentested bruker den ene innsamlingen', () => {
  const read = (f) => require('node:fs').readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '');

  // Kildetester, fordi de tre henteveiene ligger bak nettverkskall. Det de
  // binder er at kopien ikke kommer tilbake.
  // OG MED SAMME STOPP-ID SOM BANNERET SPØR MED. Herkomsten er bare nyttig
  // hvis den kan møte konteksten: samler tavla på ett navn og spør på et
  // annet, treffer regel 4 aldri, og meldingen om ditt eget stopp blir
  // «andres». Mutanten `collectStopSituations(stop, null)` overlevde en
  // kildetest som bare så etter kallet.
  // v1.149.0 tok tavlas banner bort, så det finnes ingen kontekst der å møte
  // herkomsten lenger. Innsamlingen står — tavla henter fortsatt for
  // underveis, avgangsdetaljer og auto-reise — og at den samler på stoppets
  // eget navn er fortsatt det som gjør herkomsten brukbar der.
  it('stopptavla på tavla samler fortsatt, med stoppets eget navn', () => {
    const b = read('src/views/board.js');
    expect(b).toMatch(/collectStopSituations\(stop, dir\.stopId\)/);
    expect(b).not.toMatch(/sitMap\.set\(s\.id, s\)/);
  });

  it('ankomsttavla for destinasjonen', () => {
    expect(read('src/api/entur.js')).toMatch(/collectStopSituations\(stop, /);
    expect(read('src/api/entur.js')).not.toMatch(/sitMap\.set\(s\.id, s\)/);
  });

  it('auto-reise', () => {
    expect(read('src/views/auto.js')).toMatch(/collectStopSituations\(stop, /);
  });
});

/**
 * Og de to skjermene som tegnet helt uten kontekst.
 *
 * `renderAlertsInto` hopper over `splitSituations` når `ctx` er falsy — «no
 * ctx means everything is mine, which is exactly today's behaviour», står det
 * i kommentaren, og det var sant da den ble skrevet. Underveis-skjermen
 * sendte `null` i det ene tilfellet og ingenting i det andre, så på to av
 * appens fire meldingsflater var hele regelen død.
 */
describe('underveis sender en kontekst, ikke null', () => {
  const read = () => require('node:fs')
    .readFileSync('src/views/track.js', 'utf8').replace(/\/\/[^\n]*/g, '');

  it('destinasjonspanelet får det fjerne stoppets egen kontekst', () => {
    const s = read();
    expect(s).toMatch(/renderAlertsInto\(el, _destAlerts, _updateDestAlertsSection, ctx\)/);
    expect(s).toMatch(/stopIds: \[_arrBoardStopId\]\.filter\(Boolean\)/);
  });

  // «Ingen reise» er ikke det samme som «ingen kontekst». Tom kontekst lar
  // regelen kjøre: en melding som navngir en linje er da ikke din, og en
  // uten omfang vises fortsatt.
  it('sender tom kontekst framfor null når det ikke er noen reise', () => {
    const s = read();
    expect(s).not.toMatch(/renderTrack,\s*null\)/);
    expect(s).toMatch(/renderTrack,\s*\n?\s*\{ stopIds: \[\], lineIds: \[\], journeyIds: \[\] \}\)/);
  });
});
