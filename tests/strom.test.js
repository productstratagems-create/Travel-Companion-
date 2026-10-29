/**
 * Kjøretøyet sto stille i ti sekunder og hoppet på det ellevte.
 *
 * `fetchVehiclePositions` spør hvert tiende sekund, og mellom to spørringer
 * vet appen ingenting. Entur gir de samme posisjonene som et GraphQL-
 * abonnement over WebSocket; da kommer de når de skjer.
 *
 * MEN TRE TING KAN IKKE SJEKKES HERFRA, og de avgjør hvordan dette er bygd:
 *
 *  1. EN NETTLESER KAN IKKE SETTE HTTP-HODER PÅ EN WEBSOCKET. Enturs doku-
 *     mentasjon sier `ET-Client-Name` skal ligge på den første forespørselen.
 *     `new WebSocket(url, protocols)` tar ingen hoder. Navnet sendes derfor
 *     i `connection_init`-nyttelasten OG som spørringsparameter, og begge er
 *     gjetninger.
 *  2. Om abonnementsfeltet heter `vehicles`.
 *  3. Om tjenesten svarer i det hele tatt — sandkassen når ikke api.entur.io.
 *
 * DERFOR ER FALLBACKEN IKKE EN SIKKERHETSMARGIN, MEN DEN FORVENTEDE STIEN.
 * Det som bindes her er at den mislykkes billig og riktig: én socket per økt,
 * en frist på første melding, og polling som overtar ved minste problem.
 *
 * DEN FARLIGSTE TILSTANDEN ER IKKE EN FEIL — det er en socket som åpner og så
 * TIER. Den ser vellykket ut. Uten fristen ville appen sluttet å polle og så
 * ikke fått noe som helst, og stillhet leses som «alt er i orden».
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Loggen skriver i DOM-en. Den hører til skjermen, ikke til strømmen, og en
// `#log`-div i hver prøve ville vært fiksturstøy rundt påstander som ikke
// handler om den.
//
// MEN DEN EKTE `logMsg` BINDES NEDERST I FILA, og det er ikke pynt: det var
// denne koden som avslørte at den kunne KASTE uten loggpanelet i DOM-en.
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
import { åpneStrøm, strømLeverer, strømTilstand, strømQuery, strømURL,
  FØRSTE_SVAR_MS, KINDS, _resetStrøm } from '../src/api/strom.js';
import { ET_CLIENT_NAME } from '../src/api/http.js';

/** En WebSocket vi kan fyre hendelsene på selv. */
function fakeWS() {
  const sendt = [];
  class WS {
    constructor(url, proto) {
      this.url = url; this.proto = proto; WS.siste = this;
    }
    send(s) { sendt.push(JSON.parse(s)); }
    close() { this.lukket = true; }
    // Hjelpere for prøven
    åpne() { this.onopen && this.onopen(); }
    melding(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
    feil() { this.onerror && this.onerror(); }
    lukk() { this.onclose && this.onclose(); }
  }
  WS.sendt = sendt;
  return WS;
}

beforeEach(() => { _resetStrøm(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); _resetStrøm(); });

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten en socket å fyre på ville hver påstand under
  // vært grønn uten å ha prøvd noe.
  it('har en socket å styre', () => {
    const WS = fakeWS();
    expect(åpneStrøm('RUT:Line:3', () => {}, { WS })).toBe(true);
    expect(WS.siste).toBeTruthy();
    expect(KINDS).toContain('falt-ned');
  });
});

describe('navnet, som ikke kan ligge i et hode', () => {
  /* Det er HELE grunnen til at dette er en gjetning. Begge stedene må
   * brukes, for ingen av dem er bekreftet. */
  it('ligger i spørringsparameteren', () => {
    expect(strømURL('RUT:Line:3')).toContain(encodeURIComponent(ET_CLIENT_NAME));
  });

  it('og i connection_init', () => {
    const WS = fakeWS();
    åpneStrøm('RUT:Line:3', () => {}, { WS });
    WS.siste.åpne();
    expect(WS.sendt[0].type).toBe('connection_init');
    expect(JSON.stringify(WS.sendt[0].payload)).toContain(ET_CLIENT_NAME);
  });

  it('og den snakker graphql-transport-ws', () => {
    const WS = fakeWS();
    åpneStrøm('RUT:Line:3', () => {}, { WS });
    expect(WS.siste.proto).toBe('graphql-transport-ws');
  });
});

describe('abonnementet ber om det samme som spørringen', () => {
  it('er et subscription, ikke en query', () => {
    expect(strømQuery('RUT:Line:3', true)).toMatch(/^subscription\{/);
  });

  it('og bærer feltene posisjonen trenger', () => {
    const q = strømQuery('RUT:Line:3', true);
    ['vehicleId', 'lastUpdated', 'bearing', 'location', 'serviceJourney'].forEach(f =>
      expect(q, f).toContain(f));
    expect(q).toContain('occupancyStatus');
  });

  it('abonnerer først når tjenesten har kvittert', () => {
    const WS = fakeWS();
    åpneStrøm('RUT:Line:3', () => {}, { WS });
    WS.siste.åpne();
    expect(WS.sendt.filter(m => m.type === 'subscribe')).toHaveLength(0);
    WS.siste.melding({ type: 'connection_ack' });
    expect(WS.sendt.filter(m => m.type === 'subscribe')).toHaveLength(1);
  });
});

describe('når den virker', () => {
  function påStrøm(onV) {
    const WS = fakeWS();
    åpneStrøm('RUT:Line:3', onV, { WS });
    WS.siste.åpne();
    WS.siste.melding({ type: 'connection_ack' });
    return WS;
  }

  it('leverer kjøretøyene videre', () => {
    const sett = [];
    const WS = påStrøm(l => sett.push(l));
    WS.siste.melding({ type: 'next', payload: { data: { vehicles: [{ vehicleId: 'a' }] } } });
    expect(sett).toHaveLength(1);
    expect(sett[0][0].vehicleId).toBe('a');
    expect(strømTilstand()).toBe('på');
  });

  /* PÅSTANDEN SOM AVGJØR OM POLLEREN FÅR SOVE. */
  it('og polleren står over først når noe faktisk har kommet', () => {
    const WS = påStrøm(() => {});
    expect(strømLeverer('RUT:Line:3')).toBe(false);   // «kobler» teller ikke
    WS.siste.melding({ type: 'next', payload: { data: { vehicles: [] } } });
    expect(strømLeverer('RUT:Line:3')).toBe(true);
  });

  // En annen linjes strøm er ikke denne linjas data.
  it('men bare for linja den gjelder', () => {
    const WS = påStrøm(() => {});
    WS.siste.melding({ type: 'next', payload: { data: { vehicles: [] } } });
    expect(strømLeverer('RUT:Line:5')).toBe(false);
  });
});

describe('når den ikke virker', () => {
  const start = (onV = () => {}) => {
    const WS = fakeWS();
    åpneStrøm('RUT:Line:3', onV, { WS });
    return WS;
  };

  /* DEN FARLIGSTE TILSTANDEN: åpner, og tier. Den ser vellykket ut. */
  it('gir opp når ingen melding kommer innen fristen', () => {
    const WS = start();
    WS.siste.åpne();
    WS.siste.melding({ type: 'connection_ack' });
    expect(strømTilstand()).toBe('kobler');
    vi.advanceTimersByTime(FØRSTE_SVAR_MS + 1000);
    expect(strømTilstand()).toBe('falt-ned');
    expect(strømLeverer('RUT:Line:3')).toBe(false);
  });

  it('og på en feil, en lukking, eller et avslag fra tjenesten', () => {
    [
      (WS) => WS.siste.feil(),
      (WS) => WS.siste.lukk(),
      (WS) => WS.siste.melding({ type: 'error', payload: [{ message: 'no such field' }] }),
      (WS) => WS.siste.melding({ type: 'complete' }),
    ].forEach((utløs, i) => {
      _resetStrøm();
      const WS = start();
      utløs(WS);
      expect(strømTilstand(), 'utløser ' + i).toBe('falt-ned');
    });
  });

  /* ÉN SOCKET PER ØKT. Uten dette ville hver render-tikk åpnet en ny socket
   * mot en tjeneste som alt har sagt nei — og en app som maser blir utestengt. */
  it('prøver ikke igjen etter at den har falt ned', () => {
    const WS = start();
    WS.siste.feil();
    expect(åpneStrøm('RUT:Line:3', () => {}, { WS })).toBe(false);
    expect(åpneStrøm('RUT:Line:9', () => {}, { WS })).toBe(false);
  });

  it('og åpner ikke en ny mens den første fortsatt står', () => {
    const WS = start();
    expect(åpneStrøm('RUT:Line:3', () => {}, { WS })).toBe(false);
  });

  // Men et LINJESKIFTE er et nytt ærend, og den gamle socketen har ingenting
  // å si oss lenger.
  it('bytter socket når linja skifter', () => {
    const WS = start();
    const først = WS.siste;
    expect(åpneStrøm('RUT:Line:5', () => {}, { WS })).toBe(true);
    expect(først.lukket).toBe(true);
    expect(WS.siste).not.toBe(først);
  });

  it('tåler søppel på socketen', () => {
    const WS = start();
    expect(() => WS.siste.onmessage({ data: 'ikke json' })).not.toThrow();
    expect(() => WS.siste.melding({})).not.toThrow();
    expect(() => WS.siste.melding({ type: 'next', payload: {} })).not.toThrow();
    expect(strømTilstand()).toBe('kobler');
  });

  /* Uten WebSocket i det hele tatt — en eldre nettleser, eller en test —
   * skal det ikke smelle, det skal bare pollest som før. */
  it('og en verden uten WebSocket', () => {
    expect(åpneStrøm('RUT:Line:3', () => {}, { WS: null })).toBe(false);
    expect(strømLeverer('RUT:Line:3')).toBe(false);
  });
});

/* ── EN LOGGER SOM KAN KASTE ────────────────────────────────────────────
 *
 * `strom.js` logger fra en `setTimeout` som fyrer lenge etter at den som
 * startet den er ferdig. I en prøve er DOM-en da revet ned, og `logMsg`
 * veltet på `el.insertBefore` av `null` — og tok med seg kallet som skulle
 * rapportere at noe gikk galt.
 *
 * Det er ikke et prøveproblem. `logMsg` kalles fra et dusin moduler, ofte
 * fra en `.catch`, og loggpanelet er ikke i DOM-en før `index.html` er
 * parset. Alt som logger fra en tidlig feilsti traff det samme.
 *
 * Funnet fordi en test feilet av en grunn som ikke hadde noe med testen å
 * gjøre — det er den eneste måten denne ville blitt funnet på.
 */
describe('loggeren velter ikke den som kaller den', () => {
  it('tåler at loggpanelet ikke finnes', async () => {
    const ekte = await vi.importActual('../src/ui/log.js');
    document.body.innerHTML = '';                 // ingen #log, ingen #status-dot
    expect(() => ekte.logMsg('noe skjedde', 'err')).not.toThrow();
    expect(() => ekte.setDot('error')).not.toThrow();
  });

  // Måleinstrumentet: med panelet på plass skal den fortsatt SKRIVE. En
  // vakt som alltid returnerer tidlig ville bestått testen over.
  it('og skriver fortsatt når det finnes', async () => {
    const ekte = await vi.importActual('../src/ui/log.js');
    document.body.innerHTML = '<div id="log"></div>';
    ekte.logMsg('noe skjedde', 'err');
    expect(document.getElementById('log').children.length).toBe(1);
    expect(document.getElementById('log').textContent).toContain('noe skjedde');
  });
});
