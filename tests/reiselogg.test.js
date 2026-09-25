/**
 * Reiseloggen: én ekte tur blir til bevis.
 *
 * Fire utgivelser — geografi, posisjon, varighet, plass — er sendt uten at én
 * ekte reise har prøvd dem. Hver bærer et forbehold bare en tur kan avgjøre:
 *
 *   Q1  vinner posisjonen over klokka i det hele tatt — og i tunnel?
 *   Q2  når den vinner, peker den på riktig stopp?
 *   Q3  er «gå nå»-marginen riktig, eller kommer den for sent?
 *   Q4  er stripen nok, eller åpner du kartet hver gang?
 *
 * Ingen av dem kan besvares i denne sandkassen. Det som KAN gjøres herfra er
 * å sørge for at turen etterlater seg noe — og `api/eventLog.js` står ferdig
 * bygget med samtykke, sju døgns sletting og én eneste kaller.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { logEvent, recentEvents, describeEvent, KINDS, FIELD_LABELS, EVENT_MAX, skalLogges }
  from '../src/api/eventLog.js';
import { saveConsent } from '../src/api/consent.js';
import { SRC_LABEL } from '../src/api/posSource.js';

beforeEach(() => { localStorage.clear(); localStorage.setItem('__activeProfile', 'default'); });

describe('de tre nye hendelsene', () => {
  beforeEach(() => saveConsent(true));

  // Q1 og Q2: hvem svarte på «hvor er jeg», og hvilket stopp pekte den på.
  it('kilde: hvem svarte, hvorfor, og hvilket stopp', () => {
    expect(logEvent('kilde', { svarte: 'gps', hvorfor: 'du nærmer deg', stopp: 'Ryen' })).toBe(true);
    const [e] = recentEvents(Date.now());
    expect(e).toMatchObject({ kind: 'kilde', svarte: 'gps', hvorfor: 'du nærmer deg', stopp: 'Ryen' });
  });

  // Q4: åpnet du kartet likevel, etter at v1.156 lukket det i hvile?
  it('kart: åpnet eller lukket', () => {
    expect(logEvent('kart', { handling: 'åpnet' })).toBe(true);
    expect(recentEvents(Date.now())[0].handling).toBe('åpnet');
  });

  // Q3: hva var «gå nå» bygget av — målt gangtid, gjetning, eller ditt valg?
  it('gaa: marginen og hva den var bygget av', () => {
    expect(logEvent('gaa', { minutter: 11, grunnlag: 'gange' })).toBe(true);
    expect(recentEvents(Date.now())[0]).toMatchObject({ minutter: 11, grunnlag: 'gange' });
  });
});

/**
 * ORDENE ER DE SAMME SOM PÅ SKJERMEN.
 *
 * Stripen sier «din gps», stopplista sier «din gps», og loggen må ikke si
 * «posisjon». Tre ordsett for ett begrep er den feilformen dette repoet
 * bruker mest tid på — den ble rettet i v1.154.0, og loggen skal ikke
 * gjeninnføre den.
 */
describe('loggen bruker appens egne ord', () => {
  beforeEach(() => saveConsent(true));

  it('«svarte» er de samme navnene som stripen og stopplista', () => {
    logEvent('kilde', { svarte: 'gps', hvorfor: 'x', stopp: 'Ryen' });
    logEvent('kilde', { svarte: 'rutetid', hvorfor: 'y', stopp: 'Bryn' });
    const verdier = recentEvents(Date.now()).map(e => e.svarte).sort();
    expect(verdier).toEqual(['gps', 'rutetid']);
    verdier.forEach(v => expect(SRC_LABEL).toHaveProperty(v));
  });
});

/**
 * Og at invarianten holder: hvert felt som lagres er et felt som vises.
 *
 * `public/privacy.html` lover det med ord — «Det finnes ingenting i loggen
 * som ikke står der». Disse testene er det som gjør løftet til noe annet enn
 * en setning.
 */
describe('ingenting lagres som ikke vises', () => {
  beforeEach(() => saveConsent(true));

  it('hvert nytt felt har en etikett et menneske kan lese', () => {
    ['svarte', 'hvorfor', 'stopp', 'handling', 'minutter', 'grunnlag']
      .forEach(f => expect(FIELD_LABELS).toHaveProperty(f));
  });

  it('og hver ny hendelse kan leses av et menneske', () => {
    logEvent('kilde', { svarte: 'gps', hvorfor: 'du er ved stoppet', stopp: 'Ryen' });
    logEvent('kart', { handling: 'åpnet' });
    logEvent('gaa', { minutter: 11, grunnlag: 'gange' });
    recentEvents(Date.now()).map(describeEvent).forEach(d => {
      expect(d).toBeTruthy();
      expect(d.text.length).toBeGreaterThan(0);
    });
  });

  it('de nye typene er lesbare ord, for typenavnet vises rått', () => {
    // `.mem-kind` i settings.js skriver `e.kind` uendret på skjermen.
    ['kilde', 'kart', 'gaa'].forEach(k => {
      expect(KINDS).toHaveProperty(k);
      expect(k).toMatch(/^[a-zæøå]+$/);
    });
  });
});

describe('samtykke gjelder også de nye', () => {
  it('lagrer ingenting uten et ja', () => {
    saveConsent(false);
    expect(logEvent('kilde', { svarte: 'gps', hvorfor: 'x', stopp: 'Ryen' })).toBe(false);
    expect(logEvent('kart', { handling: 'åpnet' })).toBe(false);
    expect(recentEvents(Date.now())).toEqual([]);
  });
});

/**
 * Og at én tur ikke spiser hele minnet.
 *
 * `whereAmI` regnes ut hver tegning, altså 1 Hz. En tunnel kan få kilden til
 * å flakke mellom gps og rutetid, og uten demping ville én tjue minutters tur
 * skrevet over tusen hendelser — og `EVENT_MAX` er 300. Da hadde turen slettet
 * sitt eget bevis, og alt annet appen husker.
 */
describe('én tur sprenger ikke minnet', () => {
  beforeEach(() => saveConsent(true));

  it('taket står fast, uansett hvor mye som skrives', () => {
    for (let i = 0; i < EVENT_MAX + 50; i++) {
      logEvent('kilde', { svarte: i % 2 ? 'gps' : 'rutetid', hvorfor: 'flakk', stopp: 'Ryen' });
    }
    expect(recentEvents(Date.now()).length).toBe(EVENT_MAX);
  });

  // DERFOR må skjermen dempe. Kildeskifter logges ved ENDRING, og ikke
  // oftere enn KILDE_MIN_MS — ett navngitt tall, med grunnen skrevet ned.
  it('og skjermen logger ved endring, ikke hver tikk', () => {
    const src = require('node:fs').readFileSync('src/views/track.js', 'utf8');
    expect(src).toMatch(/KILDE_MIN_MS/);
    expect(src).toMatch(/logEvent\('kilde'/);
  });
});

/**
 * Og regelen som avgjør når noe skrives ned.
 *
 * Den bodde inne i en indre funksjon i `views/track.js`, der ingen test kunne
 * kalle den — og tre mutanter overlevde nettopp derfor: dempingen fjernet,
 * endringssjekken fjernet, og et tredje ordsett for «hvem svarte». En
 * kildetest som bare lette etter navnet `KILDE_MIN_MS` bestod alle tre.
 */
describe('skalLogges', () => {
  const NÅ = 1_000_000;
  const MIN = 30000;

  it('skriver ned et nytt svar', () => {
    expect(skalLogges({ key: 'rutetid|gammel', at: NÅ - MIN }, 'gps|nærmer', NÅ, MIN)).toBe(true);
  });

  // Uten denne ville hver tegning skrevet en ny linje — 1 Hz mot et tak på 300.
  it('skriver ikke ned det samme igjen', () => {
    expect(skalLogges({ key: 'gps|nærmer', at: NÅ - MIN * 9 }, 'gps|nærmer', NÅ, MIN)).toBe(false);
  });

  // Og uten denne ville en flakkende tunnel gjort det samme, bare annenhver
  // linje: gps, rutetid, gps, rutetid …
  it('demper et svar som flakker fram og tilbake', () => {
    expect(skalLogges({ key: 'gps|nærmer', at: NÅ - 1000 }, 'rutetid|gammel', NÅ, MIN)).toBe(false);
    expect(skalLogges({ key: 'gps|nærmer', at: NÅ - MIN - 1 }, 'rutetid|gammel', NÅ, MIN)).toBe(true);
  });

  it('skriver ned det aller første', () => {
    expect(skalLogges(null, 'gps|nærmer', NÅ, MIN)).toBe(true);
    expect(skalLogges({ key: null, at: 0 }, 'gps|nærmer', NÅ, MIN)).toBe(true);
  });
});
