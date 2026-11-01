/**
 * «Du pleier å reise hit» så like sikkert ut etter én tur som etter førti.
 *
 * `destRanking` regnet ut en `score` av trefftall, tidsbøtte og ukedag ved
 * hver render. Alt som nådde skjermen av den regningen var ÉN ting:
 * `class="auto-usual"` på raden, som i `settings.css` var en rammefarge.
 * Ikke et tall, ikke et ord, og ingenting i `aria-label` — en forskjell
 * halve lesergruppa ikke har.
 *
 * AGENTS.md regel 2, ordrett: «Gjentatte ganger har appen regnet ut svaret og
 * brukt det på et `title`-attributt, en logglinje eller en sirkel uten tall.
 * Er verdien regnet ut, skal den stå på skjermen.»
 *
 * OG ÉN TERSKEL, IKKE TO. `autoJumpDest` har alt et navngitt uttrykk for
 * «sikker nok»: `JUMP_RATIO`. Et andre tall her ville vært kodebasens
 * signaturfeil igjen — og i den verste retningen: skjermen ville sagt
 * «vanlig nå» om noe appen selv ikke ville flyttet deg på.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import {
  vanestyrke, destRanking, VANE_KINDS, VANE_MARK, VANE_MIN_TURER, JUMP_RATIO,
  ferskhet, glemVaner, loadSmartHist, autoJumpDest,
} from '../src/api/smart.js';
import { MEMORY_DAYS } from '../src/api/eventLog.js';
import { storage } from '../src/storage.js';

const NOW = Date.UTC(2026, 8, 8, 7, 41, 0);           // en tirsdag morgen
const bucket = (ms) => Math.floor(new Date(ms).getHours() / 2);

/** Historikk slik `recordSmartTrip` skriver den. */
const hist = (rows) => storage.set('t.smartHist', JSON.stringify(rows.map(r => ({
  key: r.to.toLowerCase() + '|' + (r.bucket == null ? bucket(NOW) : r.bucket) + '|'
    + (r.we ? 'we' : 'wd'),
  fromName: 'Mortensrud', toName: r.to, toStopId: null,
  toLat: null, toLon: null, fromStopId: null,
  bucket: r.bucket == null ? bucket(NOW) : r.bucket,
  isWeekend: !!r.we, count: r.n, lastUsed: NOW,
}))));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

/* ── MÅLEINSTRUMENTET FØRST ──────────────────────────────────────────────
 *
 * Leser ikke fiksturen inn i `destRanking`, er hver påstand under grønn uten
 * å ha prøvd noe. Samme vakt som `autoKort.test.js` og `mobilitetNaer.test.js`
 * åpner med, og i dette repoet har instrumentet tatt feil like ofte som
 * koden. */
describe('fiksturen selv', () => {
  it('gir en rangering å dømme over', () => {
    hist([{ to: 'Jernbanetorget', n: 12 }]);
    const r = destRanking(NOW);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBeGreaterThan(0);
  });

  it('og VANE_MIN_TURER er stor nok til at terskelen kan prøves', () => {
    expect(VANE_MIN_TURER).toBeGreaterThan(1);
  });
});

/* ── FØR-BILDET ─────────────────────────────────────────────────────────
 *
 * Det rapporterte tilfellet, bygget som fikstur: førti turer og én tur.
 * Fram til nå ga de samme utfall på skjermen — samme klasse, samme ramme,
 * samme stillhet i `aria-label`. */
describe('før-bildet: førti reiser og én reise', () => {
  const styrke = (n) => {
    hist([{ to: 'Jernbanetorget', n }]);
    return vanestyrke(destRanking(NOW), 'smart');
  };

  it('skilles nå fra hverandre', () => {
    expect(styrke(40).kind).toBe('sterk');
    expect(styrke(1).kind).toBe('svak');
  });

  it('og trefftallet bæres ut, ikke bare styrken', () => {
    expect(styrke(40).antall).toBe(40);
    expect(styrke(1).antall).toBe(1);
  });

  /* Tallet er det `destRanking` ALT visste. At det kommer ut er hele
   * endringen i modulen; resten er ord. */
  it('fordi rangeringen bærer det med seg', () => {
    hist([{ to: 'Jernbanetorget', n: 12 }]);
    expect(destRanking(NOW)[0].count).toBe(12);
  });
});

describe('terskelen for «sterk»', () => {
  const påNivå = (n) => {
    hist([{ to: 'Jernbanetorget', n }]);
    return vanestyrke(destRanking(NOW), 'smart').kind;
  };

  it('går nøyaktig ved VANE_MIN_TURER', () => {
    expect(påNivå(VANE_MIN_TURER - 1)).toBe('svak');
    expect(påNivå(VANE_MIN_TURER)).toBe('sterk');
  });

  /* ÉN TERSKEL, BUNDET PÅ NAVNET OG IKKE PÅ TALLET.
   *
   * `mobilitetNaer.test.js` binder `NÆR_M` på samme måte, og av samme grunn:
   * sto `2` skrevet ut her, kunne `JUMP_RATIO` endres uten at noe falt, og
   * «sterk» og «appen flytter deg» ville drevet fra hverandre. */
  it('og «sikker nok» er JUMP_RATIO, ikke en kopi av tallet', () => {
    const src = require('node:fs').readFileSync('src/api/smart.js', 'utf8');
    const fn = src.slice(src.indexOf('export function vanestyrke'));
    expect(fn).toMatch(/JUMP_RATIO \* rival\.score/);
    expect(fn).not.toMatch(/\b2 \* rival/);
  });

  it('en jevn konkurrent gjør vanen svak', () => {
    hist([{ to: 'Jernbanetorget', n: 12 }, { to: 'Hellerud', n: 11 }]);
    expect(vanestyrke(destRanking(NOW), 'smart').kind).toBe('svak');
  });

  it('men en klart slått konkurrent gjør den ikke det', () => {
    hist([{ to: 'Jernbanetorget', n: 40 }, { to: 'Hellerud', n: 2 }]);
    expect(vanestyrke(destRanking(NOW), 'smart').kind).toBe('sterk');
  });
});

describe('tiden og ukedagen leses, ikke gjettes tilbake ut av scoren', () => {
  it('nabobøtta er «av og til», ikke «vanlig nå»', () => {
    hist([{ to: 'Jernbanetorget', n: 40, bucket: bucket(NOW) - 1 }]);
    const v = vanestyrke(destRanking(NOW), 'smart');
    expect(v.kind).toBe('svak');
    expect(v.antall).toBe(40);
  });

  it('og førti helgeturer er ingen vane på en tirsdag', () => {
    hist([{ to: 'Jernbanetorget', n: 40, we: true }]);
    expect(vanestyrke(destRanking(NOW), 'smart').kind).toBe('svak');
  });

  /* En tur klokka 23 er ikke dekning for klokka 08, og trefftallet skal
   * ikke late som. `destRanking` filtrerer bøttene alt; summen følger
   * filteret framfor å gå rundt det. */
  it('og trefftallet teller ikke turer på en helt annen tid av døgnet', () => {
    hist([{ to: 'Jernbanetorget', n: 5 },
          { to: 'Jernbanetorget', n: 30, bucket: (bucket(NOW) + 6) % 12 }]);
    expect(vanestyrke(destRanking(NOW), 'smart').antall).toBe(5);
  });
});

describe('de to som ikke er vaner', () => {
  it('tom historikk er «ingen», og sier ingenting', () => {
    const v = vanestyrke([], 'smart');
    expect(v.kind).toBe('ingen');
    expect(v.label).toBe('');
  });

  /* `t.freqArr`-fallbacken har ingen tidsdimensjon i det hele tatt, og
   * `autoJumpDest` nekter å handle på den. Å kalle den «svak vane» ville
   * påstått noe om tidspunktet som ingen har målt — fjerde ord i AGENTS.md
   * regel 4: si hva du ikke vet. */
  it('og freq-fallbacken er sin egen setning', () => {
    hist([{ to: 'Jernbanetorget', n: 40 }]);
    const v = vanestyrke(destRanking(NOW), 'freq');
    expect(v.kind).toBe('gjetning');
    expect(v.label).toMatch(/uten tid/);
  });

  it('tåler søppel inn', () => {
    expect(vanestyrke(null).kind).toBe('ingen');
    expect(vanestyrke(undefined, undefined).kind).toBe('ingen');
    expect(() => vanestyrke([null, {}])).not.toThrow();
  });
});

describe('vokabularet', () => {
  it('har ord for hver kind, og merket for de tre som vises', () => {
    expect(VANE_KINDS).toEqual(['sterk', 'gammel', 'svak', 'gjetning', 'ingen']);
    ['sterk', 'gammel', 'svak'].forEach(k => expect(VANE_MARK[k], k).toBeTruthy());
    // Tre merker som er til å skille. Var to av dem like, ville raden sagt
    // det samme om to ulike dommer.
    const m = ['sterk', 'gammel', 'svak'].map(k => VANE_MARK[k]);
    expect(new Set(m).size).toBe(3);
  });

  it('og ingen setning er «undefined»', () => {
    hist([{ to: 'Jernbanetorget', n: 40 }]);
    const v = vanestyrke(destRanking(NOW), 'smart');
    expect(v.label).toBeTruthy();
    expect(v.label + VANE_MARK[v.kind]).not.toMatch(/undefined/);
  });
});

/* ── KALLESTEDET ────────────────────────────────────────────────────────
 *
 * Femte utgivelse på rad der dette er feilformen: funksjonen kan være aldri
 * så ren, men spør ikke renderen, står raden umerket og hver påstand over er
 * grønn. Og her er det nettopp SKJERMEN som var feilen.
 */
describe('og raden sier det', () => {
  const src = require('node:fs').readFileSync('src/views/auto.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('renderen spør vanestyrke', () => {
    expect(src).toMatch(/vanestyrke\(destRanking\(\)/);
  });

  it('klassen bærer styrken, ikke bare at det er merket', () => {
    expect(src).toMatch(/auto-usual auto-usual-' \+ vane\.kind/);
  });

  /* TO ULIKE RAMMER, IKKE TO SELEKTORER SOM FINNES.
   *
   * Første utgave var `toMatch(/\.auto-usual-svak/)`, og mutanten som slettet
   * hele regelen OVERLEVDE: strengen står også i
   * `#v-auto .auto-usual-svak .auto-vane`. En selektor som finnes er ikke en
   * forskjell en leser kan se. */
  it('og CSS gir de to styrkene ulik ramme', () => {
    const css = require('node:fs').readFileSync('src/style/settings.css', 'utf8');
    const kant = (k) => {
      const m = new RegExp('\\.auto-usual-' + k + '\\s*\\{([^}]*)\\}').exec(css);
      return ((m && /border-color:([^;]+)/.exec(m[1])) || [])[1];
    };
    ['sterk', 'svak', 'gammel'].forEach(k =>
      expect(kant(k), 'ingen border-color for ' + k).toBeTruthy());
    /* TRE ULIKE. «før» er ikke en svakere «vanlig nå» — det er en annen dom,
     * om en vane du har sluttet med, og en rad som ser ut som en av de to
     * andre sier noe den ikke mener. */
    const kanter = ['sterk', 'svak', 'gammel'].map(k => kant(k).trim());
    expect(new Set(kanter).size, kanter.join(' | ')).toBe(3);
    expect(css).toMatch(/\.auto-vane\s*\{/);
  });

  /* Tallet på skjermen, ikke bare i et attributt. Det er feilform nr. 2, og
   * den er begått i nettopp denne raden før. */
  it('merket står i radens egen stripe, med tallet', () => {
    expect(src).toMatch(/class="auto-vane"/);
    expect(src).toMatch(/VANE_MARK\[vane\.kind\]/);
    expect(src).toMatch(/vane\.antall/);
  });

  it('og aria-label bærer setningen og turene', () => {
    const i = src.indexOf("const full = 'mot '");
    expect(i).toBeGreaterThan(0);
    const full = src.slice(i, i + 220);
    expect(full).toMatch(/vane\.label/);
    expect(full).toMatch(/vane\.antall/);
  });

  /* Og merket skal IKKE settes på freq-gjetningen. Faller denne, har appen
   * sagt «du pleier» på grunnlag av en liste uten klokke. */
  it('og freq-gjetningen merker ingen rad', () => {
    const i = src.indexOf('const hint =');
    const hint = src.slice(i, src.indexOf(';', i));
    ['sterk', 'gammel', 'svak'].forEach(k => expect(hint, k).toContain("'" + k + "'"));
    expect(hint).not.toContain("'gjetning'");
  });

  /* Og ferskheten når renderen. En ren `ferskhet()` hjelper ingen om
   * skjermen aldri spør — femte gang kallestedet er feilformen. */
  it('og renderen spør ferskhet, med loggens eget samtykke', () => {
    expect(src).toMatch(/ferskhet\(guess && sistReist\(guess\.toName\), Date\.now\(\), loadConsent\(\)\)/);
  });
});

/* ── FERSKHET: DE SJU DØGNENE SATT I ARBEID ─────────────────────────────
 *
 * `t.smartHist` teller opp og kaster klokka — `eventLog.js` sier det selv i
 * toppkommentaren: «Four trips last week and four trips since May are not
 * distinguishable afterwards.» Reiseloggen har tidspunktene, og de ble til nå
 * lest av nøyaktig én skjerm, lista under «hva appen husker».
 *
 * Så sju døgns oppbevaring betalte for en liste og ingen dom. Dette er ikke
 * et lengre vindu — det er det samme vinduet som gjør en jobb.
 */
describe('en vane du har sluttet med', () => {
  const DAG = 86400000;
  const sterkHist = () => { hist([{ to: 'Lysaker', n: 40 }]); return destRanking(NOW); };

  it('sier «før», ikke «vanlig nå»', () => {
    const v = vanestyrke(sterkHist(), 'smart', 'gammel');
    expect(v.kind).toBe('gammel');
    expect(v.label).toMatch(/pleide/);
    expect(v.antall).toBe(40);
  });

  it('og en fersk vane er fortsatt sterk', () => {
    expect(vanestyrke(sterkHist(), 'smart', 'fersk').kind).toBe('sterk');
  });

  /* FRAVÆR AV BEVIS VI ALDRI BA OM. Er loggen av, har vi ikke spurt — og å
   * demotere på det ville vært å lese stillhet som et nei. AGENTS.md regel 4
   * skiller «ikke spurt» fra «spurte og fikk ingenting», og her er det
   * forskjellen på å si «før» og å si «vanlig nå». */
  it('men uten logg demoteres ingenting', () => {
    expect(vanestyrke(sterkHist(), 'smart', 'ukjent').kind).toBe('sterk');
    // Utelatt tredje argument er nøyaktig v1.191.0-oppførselen.
    expect(vanestyrke(sterkHist(), 'smart').kind).toBe('sterk');
  });

  it('og en svak vane blir ikke «før» — den lover ingen ferskhet', () => {
    hist([{ to: 'Lysaker', n: 1 }]);
    expect(vanestyrke(destRanking(NOW), 'smart', 'gammel').kind).toBe('svak');
  });

  describe('ferskhet() selv', () => {
    it('av logg er «ukjent», ikke «gammel»', () => {
      expect(ferskhet(NOW, NOW, false)).toBe('ukjent');
      expect(ferskhet(null, NOW, false)).toBe('ukjent');
    });

    it('på logg og ingen tur er «gammel»', () => {
      expect(ferskhet(null, NOW, true)).toBe('gammel');
    });

    it('en tur i går er fersk, en for lenge siden er det ikke', () => {
      expect(ferskhet(NOW - DAG, NOW, true)).toBe('fersk');
      expect(ferskhet(NOW - 30 * DAG, NOW, true)).toBe('gammel');
    });

    /* BUNDET PÅ NAVNET. Vinduet er loggens eget `MEMORY_DAYS` — det står i
     * samtykketeksten og på personvernsida. Sto `7` skrevet ut her, ville
     * dommen om ferskhet og det appen faktisk oppbevarer kunnet drive fra
     * hverandre, og den første ville påstått noe om turer den andre har
     * slettet. */
    it('og vinduet er loggens, ikke en kopi av tallet', () => {
      expect(ferskhet(NOW - (MEMORY_DAYS * DAG - 1000), NOW, true)).toBe('fersk');
      expect(ferskhet(NOW - (MEMORY_DAYS * DAG + 1000), NOW, true)).toBe('gammel');
      const src = require('node:fs').readFileSync('src/api/smart.js', 'utf8');
      expect(src).toMatch(/MEMORY_DAYS \* 86400000/);
      expect(src).toMatch(/import \{ MEMORY_DAYS \} from '\.\/eventLog\.js'/);
    });
  });
});

/* ── OG «SLETT ALT» SLETTER FAKTISK ALT ─────────────────────────────────
 *
 * Tredje gang denne knappen lover mer enn den gjør: først `recentDests`, så
 * `t.freqArr`/`t.freqDep` (v1.187.0), nå `t.smartHist` — den mest avslørende
 * av de tre, med koordinater og uten noe vindu.
 */
describe('slett alt appen husker', () => {
  it('glemVaner tømmer historikken', () => {
    hist([{ to: 'Lysaker', n: 40 }]);
    expect(loadSmartHist()).toHaveLength(1);
    glemVaner();
    expect(loadSmartHist()).toHaveLength(0);
    expect(destRanking(NOW)).toHaveLength(0);
  });

  it('og knappen kaller den', () => {
    const src = require('node:fs').readFileSync('src/views/settings.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const i = src.indexOf("getElementById('mem-clear')");
    expect(i).toBeGreaterThan(0);
    const blokk = src.slice(i, i + 400);
    ['clearEvents()', 'clearRecentDests()', 'glemAlleSteder()', 'glemVaner()']
      .forEach(f => expect(blokk, f).toContain(f));
  });

  /* Og nøkkelen har én eier. Sto `storage.remove('t.smartHist')` i
   * settings.js, ville to filer skrevet ned samme nøkkel — feilformen
   * `usage.js` ble ryddet for i v1.187.0. */
  it('og nøkkelen står bare ett sted', () => {
    /* KOMMENTARENE STRIPPES FØRST. Første utgave leste hele fila og falt på
     * sin egen forklaring — kommentaren over knappen NEVNER `t.smartHist`
     * for å si hvorfor den sto igjen. Instrumentet målte ordet, ikke
     * tilgangen. */
    const set = require('node:fs').readFileSync('src/views/settings.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(set).not.toMatch(/t\.smartHist/);
  });
});

/* ── OG HOPPET DØMMER LIKT ──────────────────────────────────────────────
 *
 * `vanestyrke` sier selv at «sterk» betyr det samme som at appen ville
 * flyttet deg — terskelen er `JUMP_RATIO`, delt med `autoJumpDest`. Da må
 * ferskheten gjelde begge: en skjerm som sier «før (40)» om en destinasjon
 * appen nettopp flyttet deg til er to dommer om ett faktum, uenige.
 */
describe('autoJumpDest og vanestyrke er enige', () => {
  const sterk = () => { hist([{ to: 'Lysaker', n: 40 }]); };

  it('en gammel vane flytter deg ikke', () => {
    sterk();
    expect(autoJumpDest(NOW, 'gammel')).toBeNull();
  });

  it('men en fersk gjør det', () => {
    sterk();
    expect(autoJumpDest(NOW, 'fersk').toName).toBe('Lysaker');
  });

  it('og uten logg er regelen som før', () => {
    sterk();
    expect(autoJumpDest(NOW, 'ukjent').toName).toBe('Lysaker');
    expect(autoJumpDest(NOW).toName).toBe('Lysaker');
  });

  /* PÅSTANDEN SOM BINDER DEM. For hver ferskhet: «sterk» og «appen flytter
   * deg» skal være samme svar. Faller denne, har de to begynt å drive. */
  it('og de to svarer likt for hver ferskhet', () => {
    sterk();
    ['fersk', 'gammel', 'ukjent'].forEach(f => {
      const sterkDom = vanestyrke(destRanking(NOW), 'smart', f).kind === 'sterk';
      expect(!!autoJumpDest(NOW, f), f).toBe(sterkDom);
    });
  });

  it('og kallestedet gir den samme ferskheten til begge', () => {
    const src = require('node:fs').readFileSync('src/views/auto.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).toMatch(/autoJumpDest\(undefined,\s*ferskhet\(/);
  });
});
