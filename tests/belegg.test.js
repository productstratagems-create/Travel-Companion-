/**
 * «Fullt» kunne bety to helt ulike ting, og skjermen sa ikke hvilken.
 *
 * Når Entur ikke oppga `occupancyStatus`, regnet `board.js:2994-3049` ut et
 * belegningsnivå selv:
 *
 *     const _center = ['jernbanetorget', 'nationaltheatret', 'stortinget'];
 *     if (_dow >= 1 && _dow <= 5) { if (_h >= 7 && _h <= 9 && _toCity) score += 2; }
 *     else score -= 1;                      // helg: lettere
 *     if (score >= 4) occLevel = 5;
 *
 * Hardkodede sentrumsstopp, rushtidsvinduer, ukedag mot helg. Det er ikke en
 * måling, det er en formodning om hvordan Oslo PLEIER å være.
 *
 * OG DET ER IKKE DET SOM ER FEILEN. Et anslag er bedre enn ingenting når man
 * skal velge mellom denne avgangen og neste. Feilen er at `occPip(5)` tegnet
 * nøyaktig samme merke, i samme klasse `pc5`, med samme `aria-label` —
 * «fullt» — enten tallet kom fra Entur eller fra klokka. En leser kunne ikke
 * vite hvilken av delene hun så på, og en skjermleser kunne det heller ikke.
 *
 * AGENTS.md regel 4: «Si hva du ikke vet. «Ikke spurt», «leter», «avslått»,
 * «unøyaktig» og «gammel» er ikke samme setning.» «Målt» og «anslag» er det
 * heller ikke.
 *
 * OG SAMME TABELL STO TO STEDER. `empty → 1 … full → 5` fantes både på
 * `board.js:2988` og i `legOccLevel` på 2416, med hver sin ulike fallback bak
 * seg: radene gjettet med fire signaler, etappene med ett. To steder som
 * skriver ned samme faktum er feilformen dette repoet har rettet rundt
 * tjuefem ganger.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'),
  SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

import { belegg, fraEntur, beleggTekst, KINDS, ORD } from '../src/api/belegg.js';
import { _occPip, _legOcc, _occStatus } from '../src/views/board.js';
import { vehiclesGQL } from '../src/api/queries.js';
import { RUNGS } from '../src/api/vehicles.js';
import config from '../src/config.js';

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten nivåer å skille ville hver påstand under
  // vært grønn uten å ha prøvd noe.
  it('har nivåer og tilstander å binde mot', () => {
    expect(ORD.length).toBe(6);         // '' + fem nivåer
    expect(KINDS).toContain('målt');
    expect(KINDS).toContain('anslag');
    expect(KINDS).toContain('vet-ikke');
  });
});

describe('én tabell for Enturs egne navn', () => {
  /* Den sto to steder, med hver sin fallback. Nå ett. */
  it('oversetter hvert navn Transmodel bruker', () => {
    expect(fraEntur('empty')).toBe(1);
    expect(fraEntur('manySeatsAvailable')).toBe(2);
    expect(fraEntur('fewSeatsAvailable')).toBe(3);
    expect(fraEntur('standingRoomOnly')).toBe(4);
    expect(fraEntur('full')).toBe(5);
    expect(fraEntur('crushedStandingRoomOnly')).toBe(5);
  });

  /* Et ukjent navn er «vet ikke», ikke nivå 1. Entur kan legge til et navn
   * uten å spørre oss, og da skal appen tie framfor å si «svært lite folk». */
  it('leser et ukjent navn som ingenting, ikke som tomt', () => {
    expect(fraEntur('noeHeltNytt')).toBeNull();
    expect(fraEntur(undefined)).toBeNull();
    expect(fraEntur(null)).toBeNull();
    expect(fraEntur('')).toBeNull();
  });
});

describe('dommen', () => {
  /* PÅSTANDEN SOM BÆRER DET HELE.
   *
   * Samme tall, to ulike setninger. Mot dagens kode finnes det ingen
   * forskjell i det hele tatt — `occLevel` er et bart tall. */
  it('skiller et målt nivå fra et anslått', () => {
    const målt = belegg({ status: 'full' });
    const gjettet = belegg({ anslag: 5 });
    expect(målt.nivå).toBe(gjettet.nivå);        // samme tall
    expect(målt.kind).not.toBe(gjettet.kind);    // ulik opprinnelse
    expect(målt.kind).toBe('målt');
    expect(gjettet.kind).toBe('anslag');
  });

  it('lar Entur vinne når begge finnes', () => {
    expect(belegg({ status: 'empty', anslag: 5 })).toMatchObject({ kind: 'målt', nivå: 1 });
  });

  /* «Vet ikke» ER et svar. Stillhet leses som «alt er i orden», og en tom
   * rad der de andre har et merke er nettopp stillhet. */
  it('sier vet-ikke framfor å finne på et nivå', () => {
    expect(belegg({}).kind).toBe('vet-ikke');
    expect(belegg({}).nivå).toBeNull();
    expect(belegg({ status: 'noeRart' }).kind).toBe('vet-ikke');
  });

  /* Et anslag utenfor 1–5 er ikke et anslag, det er en feil lenger opp. Å
   * klemme det inn i skalaen ville skjult den. */
  it('nekter et anslag som ikke er et nivå', () => {
    [0, 6, -1, 2.5, '4', null, undefined, NaN].forEach(a => {
      expect(belegg({ anslag: a }).kind, String(a)).toBe('vet-ikke');
    });
  });

  it('tåler tull', () => {
    expect(() => belegg(null)).not.toThrow();
    expect(belegg(null).kind).toBe('vet-ikke');
  });
});

describe('ordene avledes av kind, de bæres ikke', () => {
  it('merker et anslag som anslag, kort og fullt', () => {
    const t = beleggTekst(belegg({ anslag: 5 }));
    expect(t.kort).toMatch(/^ca\./);
    expect(t.fullt).toMatch(/anslag/);
  });

  it('og lar et målt tall stå uten forbehold', () => {
    const t = beleggTekst(belegg({ status: 'full' }));
    expect(t.kort).toBe('fullt');
    expect(t.fullt).toBe('fullt');
    expect(t.fullt).not.toMatch(/anslag|ca\./);
  });

  it('sier ingen data når det ikke er noen', () => {
    expect(beleggTekst(belegg({})).kort).toBe('');
    expect(beleggTekst(belegg({})).fullt).toMatch(/ingen data/);
  });
});

/* ── DET SOM FAKTISK NÅDDE SKJERMEN ──────────────────────────────────────
 *
 * Testene over binder modulen. De ville alle vært grønne med `occPip` urørt
 * — og det var `occPip` som gjorde de to tallene like. Det er den samme
 * feilformen som i v1.175.0: funksjonen svarte riktig, kallestedet rakte den
 * ikke spørsmålet.
 */
describe('merket på skjermen sier hvem som sa det', () => {
  /* FØR-BILDET. `occPip(5)` ga samme streng uansett opprinnelse. */
  it('tegner et anslag annerledes enn en måling', () => {
    const målt = _occPip(belegg({ status: 'full' }));
    const gjettet = _occPip(belegg({ anslag: 5 }));
    expect(målt).not.toBe(gjettet);
  });

  /* OG FORSKJELLEN MÅ VÆRE SYNLIG, ikke bare hørbar.
   *
   * Denne testen finnes fordi mutanten som fjernet `pest`-klassen OVERLEVDE:
   * påstanden over var fortsatt grønn, siden `aria-label` alene skilte de to
   * strengene. En seende leser ville da sett nøyaktig samme merke igjen —
   * selve feilen utgivelsen handler om — og alle påstandene ville vært
   * grønne. Samme feilform som i v1.175.0: testen målte noe, bare ikke det
   * som bar saken.
   *
   * Hvordan klassen SER ut på sju piksler måles i scratchpad/pipProbe.mjs;
   * her bindes at den i det hele tatt er der. */
  it('og forskjellen er synlig, ikke bare i aria-label', () => {
    const kl = (h) => (h.match(/class="([^"]*)"/) || [])[1];
    expect(kl(_occPip(belegg({ anslag: 5 }))))
      .not.toBe(kl(_occPip(belegg({ status: 'full' }))));
  });

  /* Og forskjellen må nå en skjermleser, ikke bare et øye. En klasse alene
   * er en farge; `aria-label` er setningen. */
  it('og sier det i aria-label, ikke bare i en klasse', () => {
    expect(_occPip(belegg({ anslag: 5 }))).toMatch(/aria-label="[^"]*anslag/);
    expect(_occPip(belegg({ status: 'full' }))).not.toMatch(/aria-label="[^"]*anslag/);
  });

  /* Og tomheten sier fortsatt fra. Et merke uten etikett, i en rad der de
   * andre har en, leses som «ingenting å melde» — og stillhet leses som at
   * alt er i orden. Etiketten er nå litt lengre enn det bare «ingen data»
   * den var; en skjermleser har plass til hele setningen. */
  it('og «ingen data» sier fortsatt at det ikke er noen', () => {
    expect(_occPip(belegg({}))).toMatch(/aria-label="ingen data[^"]*"/);
    expect(_occPip(belegg({}))).toMatch(/\bpnd\b/);
  });
});

describe('etappene gjetter nå på samme måte som radene', () => {
  /* FØR-BILDET. `legOccLevel` hadde sin EGEN fallback — forsinket > 90 s ⇒
   * nivå 4 — og sin egen kopi av Enturs tabell. Samme skjerm, to regler. */
  const etappe = (o) => ({ fromEstimatedCall: o });

  it('leser Enturs svar når det finnes', () => {
    expect(_legOcc(etappe({ occupancyStatus: 'standingRoomOnly' })))
      .toMatchObject({ kind: 'målt', nivå: 4 });
  });

  it('og merker forsinkelses-gjetningen som et anslag', () => {
    const b = _legOcc(etappe({
      aimedDepartureTime: '2026-10-29T08:00:00+01:00',
      expectedDepartureTime: '2026-10-29T08:02:00+01:00',   // +120 s
    }));
    expect(b.nivå).toBe(4);
    expect(b.kind).toBe('anslag');     // ← mot dagens kode er dette et bart 4
  });

  it('og sier vet-ikke når den verken har svar eller forsinkelse', () => {
    expect(_legOcc(etappe({
      aimedDepartureTime: '2026-10-29T08:00:00+01:00',
      expectedDepartureTime: '2026-10-29T08:00:10+01:00',
    })).kind).toBe('vet-ikke');
    expect(_legOcc(etappe({})).kind).toBe('vet-ikke');
    expect(_legOcc({}).kind).toBe('vet-ikke');
  });
});

/* ── EN ANDRE EKTE KILDE ─────────────────────────────────────────────────
 *
 * Appen sto på v1 av sanntidstjenesten mens den er på v2, og det er v2 som
 * har `occupancyStatus` på kjøretøyet. Uten den fantes det ÉN kilde, og alt
 * den ikke dekket ble en gjetning.
 */
describe('belegning fra sanntidsstrømmen', () => {
  const avgang = (occ) => ({
    occupancyStatus: occ || undefined,
    serviceJourney: { id: 'RUT:ServiceJourney:3-1' },
  });
  const feed = (occ) => new Map([['RUT:ServiceJourney:3-1', { occupancyStatus: occ }]]);

  /* FØR-BILDET. `occ` var `c.occupancyStatus` og ingenting mer; et kjøretøy
   * som meldte «fullt» nådde aldri raden. */
  it('fyller hullet når reiseplanleggeren tier', () => {
    expect(_occStatus(avgang(null), feed('full'))).toBe('full');
    expect(belegg({ status: _occStatus(avgang(null), feed('full')) }).kind).toBe('målt');
  });

  /* Reiseplanleggeren gjelder DIN påstigning; vogna melder sin tilstand nå.
   * Begge er målinger, men den første er det riktige svaret på spørsmålet. */
  it('lar reiseplanleggeren vinne når begge svarer', () => {
    expect(_occStatus(avgang('empty'), feed('full'))).toBe('empty');
  });

  it('og sier ingenting når ingen av dem gjør det', () => {
    expect(_occStatus(avgang(null), feed(null))).toBeNull();
    expect(_occStatus(avgang(null), new Map())).toBeNull();
    expect(_occStatus(null, null)).toBeNull();
  });

  /* OG RADEN MÅ FAKTISK SPØRRE DEN.
   *
   * Mutanten som satte kallestedet tilbake til `c.occupancyStatus` OVERLEVDE
   * alle påstandene over, fordi de kaller `_occStatus` direkte og dermed
   * hopper over nettopp porten som sviktet. Det er tredje gang i dette
   * repoet: funksjonen svarer riktig, kallestedet rekker den ikke
   * spørsmålet — og hver gang var det bare kildeteksten som kunne binde det. */
  it('og raden spør begge kildene, ikke bare reiseplanleggeren', () => {
    const src = fs.readFileSync('src/views/board.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).toMatch(/const occ = _occStatus\(c, _livePos\)/);
  });
});

/* ── STIGEN ──────────────────────────────────────────────────────────────
 *
 * Om v2 svarer, og om `occupancyStatus` finnes der, kan ikke prøves fra denne
 * sandkassen — den når ikke api.entur.io. Derfor en stige med fallback, og en
 * `logMsg` som sier hvilket trinn som svarte. Det som bindes her er at stigen
 * HAR trinn, at de er ulike, og at det nederste er v1.
 */
describe('stigen mot sanntidstjenesten', () => {
  it('har tre trinn, fra rikt v2 til bart v1', () => {
    expect(RUNGS).toHaveLength(3);
    expect(RUNGS[0].rikt).toBe(true);
    expect(RUNGS[1].rikt).toBe(false);
    expect(RUNGS[0].url()).toBe(RUNGS[1].url());      // samme tjeneste, ulikt spørsmål
    expect(RUNGS[2].url()).not.toBe(RUNGS[0].url());  // annen tjeneste
  });

  it('spør v2 først, og har v1 i bakhånd', () => {
    expect(config.api.vehicles).toContain('/v2/');
    expect(config.api.vehiclesFallback).toContain('/v1/');
  });

  /* Ett ukjent felt feller HELE dokumentet med `{errors, data:null}` på HTTP
   * 200, så de nye feltene kan ikke bare legges til og håpes på. */
  it('kan spørre uten feltene som ikke er bekreftet', () => {
    const rikt = vehiclesGQL('RUT:Line:3', true);
    const bart = vehiclesGQL('RUT:Line:3', false);
    expect(rikt).toContain('occupancyStatus');
    expect(rikt).toContain('delay');
    expect(bart).not.toContain('occupancyStatus');
    expect(bart).not.toContain('delay');
    // Og det bare ER forskjellen: posisjonen må overleve et avslag.
    ['vehicleId', 'lastUpdated', 'bearing', 'location', 'serviceJourney'].forEach(f => {
      expect(bart, f).toContain(f);
    });
  });
});
