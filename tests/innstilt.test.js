/**
 * En innstilt avgang skal aldri være den du går for.
 *
 * Ingen spørring i appen ber Journey Planner om innstilte avganger
 * (`includeCancelledTrips`, `includeRealtimeCancellations`), og Journey
 * Planner utelater dem trolig da. Følgen er at appens hele maskineri for
 * innstilling — «innstilt» på tavla, «Din vanlige 08:12 er innstilt»,
 * «alle avgangene er innstilt» — sjelden eller aldri ser en innstilt
 * avgang. Avgangen forsvinner bare, og stillhet leses som «alt er i orden».
 *
 * Men flaggene kan ikke bare slås på. Auto-reise (`groupDirections`,
 * `catchable`) kjente ikke ordet. Kom en innstilt avgang inn, ble den «2
 * min» for et tog som ikke kommer, og kortet kunne valgt den.
 *
 * Denne fila låser at auto-reise tåler dem FØR de slippes inn.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { groupDirections, catchable, _timesHtml } from '../src/views/auto.js';
import { erInnstilt } from '../src/innstilt.js';

const NÅ = Date.UTC(2026, 10, 2, 7, 0, 0);
const MIN = 60000;
const kall = (m, over = {}) => ({
  aimedDepartureTime: new Date(NÅ + m * MIN).toISOString(),
  expectedDepartureTime: new Date(NÅ + m * MIN).toISOString(),
  destinationDisplay: { frontText: 'Kolsås' },
  serviceJourney: { id: 'sj' + m, line: { id: 'RUT:Line:3', publicCode: '3' } },
  ...over,
});

describe('erInnstilt', () => {
  it('ser innstilling både på kallet og på hele turen', () => {
    expect(erInnstilt({ cancellation: true })).toBe(true);
    expect(erInnstilt({ serviceJourney: { cancellation: true } })).toBe(true);
    expect(erInnstilt(kall(2))).toBe(false);
    expect(erInnstilt(null)).toBe(false);
  });
});

/* ── FØR-BILDET ─────────────────────────────────────────────────────────
 *
 * 2 min innstilt, 12 min går. Raden skal si 12, ikke 2. */
describe('auto-reise med en innstilt avgang først', () => {
  const rader = () => groupDirections([kall(2, { cancellation: true }), kall(12)], NÅ);

  it('neste avgang er den som går, ikke den som er innstilt', () => {
    const d = rader()[0];
    expect(d.nextMs).toBe(NÅ + 12 * MIN);
    expect(d.mins).toBe(12);
    expect(erInnstilt(d.call)).toBe(false);
  });

  it('og den innstilte står i raden, ikke borte', () => {
    expect(rader()[0].times).toContain(NÅ + 2 * MIN);
  });

  it('og catchable gir den aldri', () => {
    const r = catchable(rader()[0], null, NÅ);
    expect(r.map(x => x.ms)).toEqual([NÅ + 12 * MIN]);
  });

  /* Også når du har god tid til å gå: å rekke den er ikke spørsmålet. */
  it('heller ikke med gangtid som ville rukket den', () => {
    expect(catchable(rader()[0], 1, NÅ).map(x => x.ms)).toEqual([NÅ + 12 * MIN]);
  });

  /* Den innstilte står der, men sier hva den er. Gjennomstreket uten ord
   * ville lest som «rekker ikke» — et annet faktum. */
  it('og tidene viser den som innstilt, og lyser opp den som går', () => {
    const h = _timesHtml(rader()[0], NÅ, null);
    // Tallet står inni <s>. Første utgave av denne regexen ventet tallet
    // rett etter `>`, og falt på markupen — ikke på regelen.
    expect(h).toMatch(/auto-t-innstilt[^>]*><s>2 min<\/s>/);
    expect(h).toMatch(/innstilt/);
    expect(h).toMatch(/auto-t-next[^>]*>[^<]*12/);
  });
});

describe('når alt er innstilt', () => {
  const rader = () => groupDirections([kall(2, { cancellation: true }),
    kall(12, { serviceJourney: { id: 'x', cancellation: true,
      line: { id: 'RUT:Line:3', publicCode: '3' } } })], NÅ);

  /* Raden blir stående. En retning der alle avganger er innstilt er en
   * opplysning, ikke et hull å la være tomt. */
  it('blir raden stående, og sier det', () => {
    const d = rader()[0];
    expect(d).toBeTruthy();
    expect(d.alleInnstilt).toBe(true);
  });

  /* «~~19~~ innstilt min» — sett i nettleserprøven. Den felles enheten
   * hører til tallene som går. */
  it('og leses ikke «innstilt min»', () => {
    const h = _timesHtml(rader()[0], NÅ, null);
    expect(h.replace(/<[^>]+>/g, '')).not.toMatch(/innstilt min/);
    expect(h.replace(/<[^>]+>/g, '')).toMatch(/2 min innstilt · 12 min innstilt$/);
  });

  it('men kan ikke nås', () => {
    expect(catchable(rader()[0], null, NÅ)).toEqual([]);
  });
});

describe('uten innstillinger er alt som før', () => {
  it('samme neste, samme tider', () => {
    const d = groupDirections([kall(2), kall(12)], NÅ)[0];
    expect(d.nextMs).toBe(NÅ + 2 * MIN);
    expect(d.times).toEqual([NÅ + 2 * MIN, NÅ + 12 * MIN]);
    expect(d.alleInnstilt).toBe(false);
  });
});

/* ── REISEFORSLAG: EN SENERE ETAPPE ER INNSTILT ─────────────────────────
 *
 * `fromEstimatedCall{cancellation}` hentes allerede for HVER etappe. Bare
 * den første ble lest (`adapt.js`: `first.fromEstimatedCall.cancellation`).
 * Er videreforbindelsen innstilt, henger reisen ikke sammen — og raden sa
 * det ikke.
 */
import { adaptTripPattern } from '../src/api/adapt.js';

const iso = m => new Date(NÅ + m * MIN).toISOString();
const etappe = (linje, fra, til, m0, m1, { påInnstilt = false, avInnstilt = false } = {}) => ({
  mode: 'metro', fromPlace: { name: fra }, toPlace: { name: til },
  aimedStartTime: iso(m0), expectedStartTime: iso(m0), aimedEndTime: iso(m1), expectedEndTime: iso(m1),
  serviceJourney: { id: 'SJ' + linje, line: { id: 'L' + linje, publicCode: linje } },
  fromEstimatedCall: { expectedDepartureTime: iso(m0), aimedDepartureTime: iso(m0),
    cancellation: påInnstilt, quay: { publicCode: '1' }, destinationDisplay: { frontText: til } },
  toEstimatedCall: { expectedArrivalTime: iso(m1), aimedArrivalTime: iso(m1),
    cancellation: avInnstilt, quay: { publicCode: '2' } },
});

describe('en innstilt videreforbindelse', () => {
  const tp = (o2) => ({ duration: 30 * 60, legs: [
    etappe('3', 'Ryen', 'Tøyen', 0, 6), etappe('5', 'Tøyen', 'Storo', 9, 15, o2)] });

  it('gjør at reisen ikke henger sammen', () => {
    const r = adaptTripPattern(tp({ påInnstilt: true }));
    expect(r._brudd).toEqual({ etappe: 1, sted: 'Tøyen' });
  });

  /* `cancellation` betyr fortsatt PÅSTIGNINGEN DIN — tavla stryker raden på
   * den. Videreforbindelsen er et annet faktum, og skal ikke stryke en
   * avgang som faktisk går. */
  it('men stryker ikke avgangen du går på', () => {
    expect(adaptTripPattern(tp({ påInnstilt: true })).cancellation).toBe(false);
  });

  /* Et stopp der du skal AV, som kjøretøyet ikke lenger kaller ved. */
  it('og en innstilt avstigning bryter også', () => {
    const r = adaptTripPattern(tp({ avInnstilt: true }));
    expect(r._brudd).toEqual({ etappe: 1, sted: 'Storo' });
  });

  /* EN INNSTILT PÅSTIGNING ER `cancellation`, ikke `_brudd`. To felt for
   * samme faktum ville latt tavla si både «innstilt» og «videreforbindelse
   * innstilt» om ett og samme tog. Funnet av en mutant som overlevde. */
  it('og påstigningen din er `cancellation`, ikke et brudd', () => {
    const r = adaptTripPattern({ duration: 30 * 60, legs: [
      etappe('3', 'Ryen', 'Tøyen', 0, 6, { påInnstilt: true }),
      etappe('5', 'Tøyen', 'Storo', 9, 15)] });
    expect(r.cancellation).toBe(true);
    expect(r._brudd).toBeNull();
  });

  it('og en reise uten innstilling har null', () => {
    expect(adaptTripPattern(tp({}))._brudd).toBeNull();
  });

  it('og spørringen ber om innstilling på avstigningen', () => {
    const { tripGQL } = require('../src/api/queries.js');
    const q = tripGQL('NSR:StopPlace:1', 'NSR:StopPlace:2');
    expect(q).toMatch(/toEstimatedCall\{[^}]*cancellation/);
  });
});

/* ── legCancelled MATCHER SOM RESTEN AV APPEN ───────────────────────────
 *
 * `trim().toLowerCase()` — oppskrift D fra `stopId.js` sin egen liste over
 * de fire v1.107.0 ryddet bort. Den femte overlevende. «Ryen T» og «Ryen»
 * er to steder under D, og da oppdages ikke en innstilling på stoppet du
 * står og venter på.
 */
import { legCancelled } from '../src/api/liveness.js';

describe('legCancelled', () => {
  const kallene = [
    { quay: { stopPlace: { name: 'Ryen T' } }, cancellation: true },
    { quay: { stopPlace: { name: 'Tøyen' } }, cancellation: false },
  ];
  it('finner «Ryen T» innstilt når etappen sier «Ryen»', () => {
    expect(legCancelled(kallene, 'Ryen', 'Tøyen')).toMatchObject({ cancelled: true });
  });
  it('og bruker stopKey', () => {
    const src = require('node:fs').readFileSync('src/api/liveness.js', 'utf8');
    const fn = src.slice(src.indexOf('export function legCancelled'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/stopKey\(/);
  });
});
