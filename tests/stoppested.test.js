/**
 * Appen kjente et stopp som et navn og en koordinat.
 *
 * Alt annet om det var utledet av strenger. «Hvilken plattform» ble besvart
 * med et regulært uttrykk på kaiens navn:
 *
 *     board.js:209   c.quay.name.replace(/^.*?\s/, '')
 *
 * «Jernbanetorget 2» → «2», som er riktig. «Oslo S spor 5» → «S spor 5»,
 * som ikke er det. Og `queries.js:338-350` sier det rett ut om
 * reiseplanleggeren: «`quays` and `transportMode` on StopPlace cannot be
 * checked from here».
 *
 * OG «ER DET TRINNFRITT» BLE ALDRI SPURT I DET HELE TATT. Gangelinja sa hvor
 * lenge du går, ikke hva du går TIL. Mot visjonens egen fase-tabell er «hvor
 * er stoppet, hvordan kommer jeg dit» den fasen med minst data bak seg — og
 * en som triller barnevogn eller rullestol trenger svaret FØR de fjorten
 * minuttene, ikke etter.
 *
 * «VET IKKE» OG «NEI» ER IKKE SAMME SETNING, og det er hele grunnen til at
 * dette er en navngitt dom og ikke en boolsk verdi. NeTEx har `unknown` som
 * et eget svar, og det betyr «ingen har vurdert dette». Å vise «ikke
 * trinnfri» for et uvurdert stopp ville vært en påstand uten dekning — og
 * den ville sendt noen en helt annen vei.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'),
  SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { tilgang, parseStoppested, stoppestedGQL, KINDS, _resetStoppested }
  from '../src/api/stoppested.js';
import { _rowQuay } from '../src/views/board.js';

beforeEach(() => _resetStoppested());

const svar = (quays, a) => ({ data: { stopPlace: {
  id: 'NSR:StopPlace:1', name: { value: 'Oslo S' },
  quays, accessibilityAssessment: a,
} } });

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten kaier i svaret ville hver påstand under
  // vært grønn uten å ha prøvd noe.
  it('har et svar med kaier i', () => {
    const ut = parseStoppested(svar([{ id: 'NSR:Quay:9', publicCode: '5' }], null));
    expect(ut.kaier.size).toBe(1);
    expect(KINDS).toContain('vet-ikke');
  });
});

describe('spørringen', () => {
  it('ber om det de to gjetningene trenger', () => {
    const q = stoppestedGQL('NSR:StopPlace:1');
    expect(q).toContain('NSR:StopPlace:1');
    expect(q).toContain('quays{id publicCode}');
    expect(q).toContain('accessibilityAssessment');
  });
});

describe('kaiene, som ett oppslag', () => {
  /* Ett oppslag id → publicCode, og ikke en rå liste. En liste ville tvunget
   * hvert kallested til å lete selv, og to steder som leter på hver sin måte
   * er feilformen dette repoet har rettet rundt tjuefem ganger. */
  it('slår opp på kai-id', () => {
    const ut = parseStoppested(svar([
      { id: 'NSR:Quay:9', publicCode: '5' },
      { id: 'NSR:Quay:10', publicCode: '6' },
    ], null));
    expect(ut.kaier.get('NSR:Quay:9')).toBe('5');
    expect(ut.kaier.get('NSR:Quay:10')).toBe('6');
  });

  // En kai uten publicCode har ingenting å bidra med, og å lagre `undefined`
  // under id-en ville gjort «ingen kode» til «koden er undefined».
  it('hopper over en kai uten kode', () => {
    const ut = parseStoppested(svar([{ id: 'NSR:Quay:9' }, { id: 'NSR:Quay:10', publicCode: '6' }], null));
    expect(ut.kaier.has('NSR:Quay:9')).toBe(false);
    expect(ut.kaier.size).toBe(1);
  });

  it('tåler et tomt eller rart svar', () => {
    expect(parseStoppested(null)).toBeNull();
    expect(parseStoppested({})).toBeNull();
    expect(parseStoppested({ data: { stopPlace: null } })).toBeNull();
    expect(parseStoppested(svar(null, null)).kaier.size).toBe(0);
  });
});

describe('adkomsten', () => {
  const vurdering = (v) => ({ limitations: { stepFreeAccess: v } });

  it('leser ja og nei', () => {
    expect(tilgang(vurdering('TRUE')).kind).toBe('trinnfri');
    expect(tilgang(vurdering('FALSE')).kind).toBe('ikke-trinnfri');
  });

  /* PÅSTANDEN SOM BÆRER DET HELE. `unknown` er et eget svar i NeTEx, og det
   * betyr «ingen har vurdert dette» — ikke «nei». */
  it('skiller «vet ikke» fra «nei»', () => {
    expect(tilgang(vurdering('UNKNOWN')).kind).toBe('vet-ikke');
    expect(tilgang(null).kind).toBe('vet-ikke');
    expect(tilgang({}).kind).toBe('vet-ikke');
    expect(tilgang(vurdering('UNKNOWN')).kind).not.toBe('ikke-trinnfri');
  });

  // Og «vet ikke» har ingen ord. En tom streng er det som gjør at gangelinja
  // kan skrive ingenting framfor å skrive et forbehold.
  it('og «vet ikke» sier ingenting', () => {
    expect(tilgang(null).ord).toBe('');
    expect(tilgang(vurdering('TRUE')).ord).toBeTruthy();
  });

  it('leser rullestolfeltet når trinnfri-feltet mangler', () => {
    expect(tilgang({ limitations: { wheelchairAccess: 'TRUE' } }).kind).toBe('trinnfri');
  });

  // NeTEx-svar kommer både som objekt og som liste, og det er ikke noe appen
  // kan bestemme. Begge må leses.
  it('og tåler at vurderingen kommer som en liste', () => {
    expect(tilgang({ limitations: [{ stepFreeAccess: 'TRUE' }] }).kind).toBe('trinnfri');
  });
});

describe('plattformen, fra registeret framfor fra et regulært uttrykk', () => {
  const rad = (q) => ({ quay: q, serviceJourney: { id: 'RUT:ServiceJourney:1' } });

  /* FØR-BILDET. Uten registeret var dette alt appen hadde. */
  it('faller fortsatt til navnet når ingenting annet finnes', () => {
    expect(_rowQuay(rad({ name: 'Jernbanetorget 2' }), null, null).quay).toBe('2');
    // Og den gjør det FEIL her — som er grunnen til at registeret finnes.
    expect(_rowQuay(rad({ name: 'Oslo S spor 5' }), null, null).quay).toBe('S spor 5');
  });

  it('bruker registeret når navnet ville bommet', () => {
    const kaier = new Map([['NSR:Quay:9', '5']]);
    expect(_rowQuay(rad({ id: 'NSR:Quay:9', name: 'Oslo S spor 5' }), null, kaier).quay).toBe('5');
  });

  /* Avgangens eget felt er sterkest: det er den konkrete avgangen, mens
   * registeret er stoppet i alminnelighet. */
  it('men lar avgangens eget felt vinne', () => {
    const kaier = new Map([['NSR:Quay:9', '5']]);
    expect(_rowQuay(rad({ id: 'NSR:Quay:9', publicCode: '3', name: 'Oslo S spor 5' }), null, kaier).quay)
      .toBe('3');
  });

  it('og tåler et register uten denne kaien', () => {
    expect(_rowQuay(rad({ id: 'NSR:Quay:99', name: 'Jernbanetorget 2' }), null, new Map()).quay)
      .toBe('2');
  });
});

/* ── KALLESTEDET ────────────────────────────────────────────────────────
 *
 * Tredje gang i dette repoet: funksjonen svarer riktig, og kallestedet
 * rekker den ikke spørsmålet. `_rowQuay` kan lese registeret så mye den vil
 * — hvis `board.js` kaller den med to argumenter, skjer ingenting, og hver
 * eneste påstand over er fortsatt grønn.
 */
describe('og board.js spør faktisk registeret', () => {
  const src = () => require('node:fs').readFileSync('src/views/board.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('rekker kaiene videre til _rowQuay', () => {
    expect((src().match(/_rowQuay\(c, _stopQuays, _stedKaier\(\)\)/g) || []).length)
      .toBeGreaterThanOrEqual(2);
  });

  it('og skriver adkomsten i gangelinja', () => {
    expect(src()).toMatch(/adkomst \? ' · ' \+ adkomst : ''/);
  });
});
