/**
 * Én gangtid, ikke fire.
 *
 * `geo.js` sin egen docstring over `walkMinsTo` sier regelen:
 *
 *   «Two places computing walking time is how they drift apart, and this one
 *    decides when someone leaves.»
 *
 * Tre skjermer bryter den, med uttrykket skrevet ut på nytt:
 *
 *   views/board.js     Math.max(1, Math.ceil(d * 1.3 / spd)) + loadWalkBuffer()
 *   views/track.js     ← identisk
 *   views/settings.js  ← identisk, med hastighetstabellen inlinet også
 *
 * Og det er ikke bare stygt. De tre hopper over `getWalkDist()`, så de kan
 * ALDRI gjøre annet enn å gange luftlinja med 1,3 — mens den kanoniske
 * bruker den MÅLTE ruta når routeren har gitt en. På samme to punkter svarer
 * de altså ulikt, og det tallet bestemmer når du går hjemmefra.
 *
 * Fiksturen under er det tilfellet: en målt rute på 2000 m mellom to punkter
 * som ligger 1000 m fra hverandre i luftlinje. Kopiene sier 18 minutter. Den
 * ene sier 26. Du rekker ikke toget på de åtte.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { saveWalkDist, getWalkDist } from '../src/api/walkDist.js';
import { walkMinsTo, SPEED_MPN } from '../src/geo.js';
import { haver } from '../src/haversine.js';

// To punkter ~1000 m fra hverandre. Breddegraden er Oslo, så ett grad lengde
// er ~55 km — men vi måler med `haver` framfor å skrive tallet ned igjen.
const FRA = { lat: 59.9000, lon: 10.7500 };
const TIL = { lat: 59.9090, lon: 10.7500 };
const CROW = Math.round(haver(FRA.lat, FRA.lon, TIL.lat, TIL.lon));

/** En målt rute som går den lange veien rundt — omtrent dobbelt av luftlinja. */
const RUTE = [
  [59.9000, 10.7500], [59.9000, 10.7600], [59.9090, 10.7600], [59.9090, 10.7500],
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

describe('fiksturen selv', () => {
  // Måleinstrumentet først. En fikstur som ikke lagrer noe ville gjort hele
  // denne fila grønn uten å ha prøvd noe — og det har skjedd i dette repoet.
  it('lagrer faktisk en målt rute som er lengre enn luftlinja', () => {
    expect(CROW).toBeGreaterThan(900);
    expect(CROW).toBeLessThan(1100);
    const lagret = saveWalkDist(FRA, TIL, RUTE, CROW);
    expect(lagret).not.toBeNull();
    expect(lagret).toBeGreaterThan(CROW * 1.3);
    expect(getWalkDist(FRA, TIL, CROW)).toBe(lagret);
  });
});

describe('walkMinsTo — den ene definisjonen', () => {
  it('bruker den målte ruta når den finnes, ikke ganger luftlinja', () => {
    const uten = walkMinsTo(TIL, FRA);
    expect(uten.src).toBe('beregnet');

    saveWalkDist(FRA, TIL, RUTE, CROW);
    const med = walkMinsTo(TIL, FRA);

    expect(med.src).toBe('gangrute');
    // Og den sier det den vet: avstanden er den målte, ikke den gjettede.
    expect(med.dist).toBeGreaterThan(uten.dist);
    expect(med.mins).toBeGreaterThan(uten.mins);
  });
});

/* ── FØR-BILDET ──────────────────────────────────────────────────────────
 *
 * Disse binder at de tre skjermene regner det SAMME som `walkMinsTo`. Mot
 * dagens kode feiler de, fordi uttrykket står skrevet ut tre steder og
 * ingen av dem spør `getWalkDist`.
 *
 * Påstanden er bevisst på KILDETEKSTEN og ikke bare på et tall: et tall
 * kunne stemt ved en tilfeldighet mens kopien sto igjen. Det er kopien som
 * er feilen. */
describe('de tre skjermene regner ikke på egen hånd', () => {
  const src = (f) => fs.readFileSync(f, 'utf8')
    // Blokk-kommentarer strippes. En test i denne kodebasen har alt én gang
    // blitt tilfredsstilt av sin egen forklaring i en /* … */-blokk.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const FILER = ['src/views/board.js', 'src/views/track.js', 'src/views/settings.js'];

  it('har ingen egen gangtid-formel igjen', () => {
    for (const f of FILER) {
      expect(src(f), f).not.toMatch(/Math\.ceil\([^)]*\*\s*1\.3\s*\/\s*spd\)/);
    }
  });

  it('spør walkMinsTo i stedet', () => {
    for (const f of FILER) {
      expect(src(f), f).toMatch(/walkMinsTo\(/);
    }
  });

  // Hastighetstabellen sto inlinet i en SKJERM — de samme tre tallene som
  // `SPEED_MPN` alt er navnet på, skrevet om igjen i et objekt-literal.
  it('har ingen hastighetstabell skrevet om igjen', () => {
    for (const f of FILER.concat(['src/api/entur.js'])) {
      expect(src(f), f).not.toMatch(/rolig:\s*41\.67/);
    }
  });

  // Og fallbacken er navnet, ikke tallet. `|| 83.33` er `SPEED_MPN.middels`
  // skrevet ned en gang til, og den ville overlevd en endring av tabellen.
  it('bruker navnet som fallback, ikke tallet', () => {
    for (const f of FILER.concat(['src/geo.js', 'src/api/entur.js'])) {
      expect(src(f), f).not.toMatch(/\|\|\s*83\.33/);
    }
  });
});

/* ── OG ÉN TING SOM IKKE ER EN KOPI, MEN VERRE ───────────────────────────
 *
 * `AT_STOP_M` er 120 i `api/approach.js` (hvis docstring sier «ONE
 * DEFINITION OF "AT THE STOP"»), 120 i `api/whereAmI.js` — og **30** i
 * `views/board.js`, i en fil som på linje 679 re-eksporterer 120-utgaven
 * som `APPROACH_MIN_M`.
 *
 * Det er ikke en kopi som har drevet fra hverandre. Det er to ULIKE fakta
 * som deler navn i samme scope, og den som leser koden har ingen måte å se
 * hvilket av dem hun ser på. */
describe('AT_STOP_M betyr én ting', () => {
  const src = (f) => fs.readFileSync(f, 'utf8');

  it('er ikke gjenbrukt i board.js for et annet faktum', () => {
    expect(src('src/views/board.js')).not.toMatch(/const AT_STOP_M = 30/);
  });

  it('har fortsatt sin ene verdi der den hører hjemme', async () => {
    const { AT_STOP_M } = await import('../src/api/approach.js');
    const w = await import('../src/api/whereAmI.js');
    expect(AT_STOP_M).toBe(120);
    expect(w.AT_STOP_M).toBe(AT_STOP_M);
  });
});

/* ── OG TALLENE FINNES BARE ETT STED ─────────────────────────────────────
 *
 * Første utgave av denne testen sa `expect(SPEED_MPN.middels).toBe(83.33)`.
 * Den overlevde ingenting: den bandt navnet til tallet sitt, altså til seg
 * selv. Endret man tabellen, falt den — men det var det eneste den merket.
 *
 * Påstanden som bærer korrektheten er en annen: at de tre tallene ikke står
 * noe ANNET sted i kildekoden. Da kan de ikke drive fra hverandre, uansett
 * hvilken verdi de har. */
describe('ganghastigheten finnes bare ett sted', () => {
  it('har ingen av de tre tallene skrevet utenfor walkSpeed.js', () => {
    const filer = fs.readdirSync('src', { recursive: true })
      .filter(f => typeof f === 'string' && f.endsWith('.js') && f !== 'walkSpeed.js');
    const funnet = [];
    for (const f of filer) {
      const t = fs.readFileSync('src/' + f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      if (/\b(41\.67|83\.33|116\.67)\b/.test(t)) funnet.push(f);
    }
    expect(funnet).toEqual([]);
  });

  // Og den er en bladmodul, fordi en fil uten importer ikke kan havne i en
  // sykel. Det var nettopp en modullasting som knakk da entur.js begynte å
  // lese navnet framfor tallene.
  it('importerer ingenting', () => {
    expect(fs.readFileSync('src/walkSpeed.js', 'utf8')).not.toMatch(/^import /m);
  });

  it('er fortsatt den walkMinsTo regner med', () => {
    expect(walkMinsTo(TIL, FRA).mins).toBeGreaterThan(0);
    expect(SPEED_MPN.middels).toBeGreaterThan(0);
  });
});
