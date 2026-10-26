/**
 * Hvor er avgangens kjøretøy — og hvor er det IKKE?
 *
 * «Valgt avgang» er den eneste av visjonens tre faser som ikke viser
 * kjøretøyet på kartet. Tavla gjør det (`renderVehicleMarkers`), underveis
 * gjør det (`_tVehicleMarker`); skjermen imellom — der du står på perrongen
 * og lurer på om toget kommer — gjør det ikke.
 *
 * FAREN, OG GRUNNEN TIL AT DENNE FILA BEGYNNER MED DEN:
 *
 * `_interpolateOnPath` har en gren som plasserer kjøretøyet på FØRSTE ANKER
 * i den tegnede linja når løpet ikke har begynt:
 *
 *     if (now <= pts[0].dep) return d[0] == null ? bail() : at(d[0], bail);
 *
 * Mater man den den KLIPPEDE etappen — din påstigning til din avstigning —
 * er første anker din egen perrong. Da tegner kartet «toget står her» mens
 * toget i virkeligheten er fire stopp unna. Det er verre enn ingen markør.
 *
 * Det som redder det er at `anchorDistances` skyver null for et anker som
 * ligger langt fra linja, og at en null får `_interpolateOnPath` til å falle
 * tilbake på ærlig akkord-interpolasjon mellom ekte perrongkoordinater.
 *
 * Den siste setningen var en LESNING av koden da planen ble skrevet. Den
 * første testen under er den som gjør den til en måling.
 */
import { describe, it, expect } from 'vitest';
import { anchorDistances } from '../src/ui/path.js';
import { haver } from '../src/haversine.js';
import { departureVehicle, depLineRef, depMode, _depServiceJourney } from '../src/views/trainPosition.js';

/* Linje 3 østover, forenklet men med ekte avstander: seks stopp fra
 * Mortensrud til Jernbanetorget. Du går på i Helsfyr. */
const LOEP = [
  { navn: 'Mortensrud',     lat: 59.8600, lon: 10.8300 },
  { navn: 'Ryen',           lat: 59.8800, lon: 10.8100 },
  { navn: 'Brynseng',       lat: 59.9000, lon: 10.7950 },
  { navn: 'Helsfyr',        lat: 59.9100, lon: 10.7900 },  // ← du går på her
  { navn: 'Tøyen',          lat: 59.9130, lon: 10.7780 },
  { navn: 'Jernbanetorget', lat: 59.9110, lon: 10.7500 },
];
const PAASTIGNING = 3;

/** Den TEGNEDE linja: bare din etappe, slik `_depToRouteLegs` klipper den. */
const TEGNET = LOEP.slice(PAASTIGNING).map(s => [s.lat, s.lon]);

describe('fiksturen selv', () => {
  // Måleinstrumentet først. En fikstur der «bak» ligger tjue meter unna ville
  // gjort hele poenget usynlig og fila grønn uten å ha prøvd noe.
  it('har stoppene bak påstigningen virkelig langt fra den tegnede linja', () => {
    expect(TEGNET.length).toBe(3);
    const avstandTilStart = LOEP.slice(0, PAASTIGNING).map(s =>
      Math.round(haver(s.lat, s.lon, TEGNET[0][0], TEGNET[0][1])));
    // Alle tre ligger kilometer unna, ikke meter.
    avstandTilStart.forEach(m => expect(m).toBeGreaterThan(1000));
  });
});

describe('ankrene utenfor den tegnede linja', () => {
  /* PÅSTANDEN HELE FORMEN HVILER PÅ.
   *
   * `anchorDistances(path, anchors, maxDev = 150)` skal gi null for hvert
   * stopp som ligger mer enn 150 m fra linja — altså for alt bak din
   * påstigning — og et tall for dem som ligger på den.
   *
   * Holder dette, kan vi trygt mate HELE løpet: stoppene bak gir null,
   * `_interpolateOnPath` baler ut til ekte koordinater utenfor rammen, og
   * ingenting tegnes på din perrong som ikke er der.
   *
   * Holder det ikke, faller planen, og da trengs en eksplisitt vakt. */
  it('gir null for hvert stopp bak påstigningen, og et tall for resten', () => {
    const d = anchorDistances(TEGNET, LOEP);
    expect(d).not.toBeNull();
    expect(d.length).toBe(LOEP.length);

    const bak = d.slice(0, PAASTIGNING);
    const paa = d.slice(PAASTIGNING);

    expect(bak).toEqual([null, null, null]);
    paa.forEach(v => expect(typeof v).toBe('number'));
    // Og de som ligger på linja ligger i rekkefølge langs den.
    expect(paa[0]).toBeLessThan(paa[1]);
    expect(paa[1]).toBeLessThan(paa[2]);
  });

  // Og vakten er avstanden, ikke rekkefølgen: et stopp 150 m unna slipper
  // gjennom, ett på 2 km gjør ikke. Uten denne kunne grensa flyttet seg til
  // hva som helst og testen over fortsatt vært grønn.
  it('slipper gjennom det nære og avviser det fjerne', () => {
    const naer = { lat: TEGNET[1][0] + 0.0009, lon: TEGNET[1][1] };   // ~100 m
    const fjern = { lat: TEGNET[1][0] + 0.018, lon: TEGNET[1][1] };   // ~2 km
    expect(anchorDistances(TEGNET, [naer])[0]).not.toBeNull();
    expect(anchorDistances(TEGNET, [fjern])[0]).toBeNull();
  });
});

/* ── FØR-BILDET ──────────────────────────────────────────────────────────
 *
 * Toget har ennå ikke nådd Helsfyr. Det står på Mortensrud og har ikke kjørt
 * ut. Spørsmålet er hvor kartet sier at det er.
 *
 * Mot en utgave som mates den KLIPPEDE etappen lander svaret på Helsfyr —
 * din egen perrong — fordi `_interpolateOnPath` plasserer kjøretøyet på
 * første anker når løpet ikke har begynt. Det er løgnen denne testen finnes
 * for å gjøre umulig. */

const MIN = 60000;
const NAA = Date.parse('2026-10-26T08:00:00Z');

/** Hele løpet som estimatedCalls, med avgang fra Mortensrud om `om` minutter. */
const kall = (om) => LOEP.map((s, i) => {
  const t = NAA + (om + i * 2) * MIN;
  return {
    quay: { stopPlace: { id: 'NSR:StopPlace:' + i, name: s.navn, latitude: s.lat, longitude: s.lon },
            latitude: s.lat, longitude: s.lon },
    aimedArrivalTime: new Date(t).toISOString(), expectedArrivalTime: new Date(t).toISOString(),
    aimedDepartureTime: new Date(t + 20000).toISOString(),
    expectedDepartureTime: new Date(t + 20000).toISOString(),
    realtime: true,
  };
});

const avgang = (om) => ({
  serviceJourney: { id: 'RUT:ServiceJourney:3-0810', line: { id: 'RUT:Line:3', publicCode: '3' },
                    estimatedCalls: kall(om) },
});

/** Hvor langt er svaret fra et gitt stopp? */
const fra = (pos, i) => Math.round(haver(pos.lat, pos.lon, LOEP[i].lat, LOEP[i].lon));

describe('toget som ennå ikke har kommet', () => {
  it('plasseres IKKE på din perrong', () => {
    // Avgang fra Mortensrud om seks minutter: løpet har ikke begynt.
    const pos = departureVehicle(avgang(6), { routePts: TEGNET, now: NAA, livePos: null });
    expect(pos).not.toBeNull();
    // Det står ved sitt utgangspunkt, ikke ved ditt.
    expect(fra(pos, 0)).toBeLessThan(200);
    expect(fra(pos, PAASTIGNING)).toBeGreaterThan(1000);
  });

  it('sier at posisjonen er regnet ut, ikke målt', () => {
    const pos = departureVehicle(avgang(6), { routePts: TEGNET, now: NAA, livePos: null });
    expect(pos.src).toBe('rutetid');
  });

  // Og når det ER kommet inn på din etappe, ligger det på den tegnede linja.
  it('ligger på den tegnede linja når det er inne i rammen', () => {
    // Løpet startet for sju minutter siden: toget er forbi Helsfyr.
    const pos = departureVehicle(avgang(-7), { routePts: TEGNET, now: NAA, livePos: null });
    expect(pos).not.toBeNull();
    const av = anchorDistances(TEGNET, [pos]);
    expect(av[0]).not.toBeNull();
  });
});

describe('den sitter aldri på din egen posisjon', () => {
  /* GPS-trinnet i `_trainPosition` finnes fordi telefonen din ER på toget
   * mens du kjører. På denne skjermen er den ikke det. Sender vi inn en fersk
   * posisjon rett ved linja, skal svaret likevel komme fra rutetabellen. */
  it('svarer etter rutetid selv med en fersk posisjon ved linja', () => {
    const pos = departureVehicle(avgang(-7), {
      routePts: TEGNET, now: NAA, livePos: null,
      // Disse feltene finnes i `_trainPosition`, men nås bare av `riding`.
      userLL: { lat: TEGNET[1][0], lon: TEGNET[1][1] }, posAt: NAA,
    });
    expect(pos.src).not.toBe('gps');
  });
});

describe('hvilket kjøretøy, og hvilken linje', () => {
  /* FØRSTE UTKAST LESTE `_legs[0].serviceJourney`, OG DET VAR FEIL.
   *
   * `adapt.js:218` syntetiserer `dep.serviceJourney` nettopp fra første
   * etappe, og `_fetchSel` oppfrisker DET objektet — aldri `_legs[0]`. To
   * steder bærer samme faktum, og bare det ene holdes à jour.
   *
   * Fiksturen under er derfor en avgang med bytte der de to er UENIGE: det
   * oppfriskede løpet har seks stopp, etappekopien har et utdatert på to.
   * Leser vi feil, ser vi gammel rutetid og tror den er fersk. */
  it('leser det oppfriskede løpet, ikke etappens egen kopi', () => {
    const friskt = avgang(6).serviceJourney;
    const utdatert = { id: friskt.id, line: { id: 'RUT:Line:3' }, estimatedCalls: kall(99).slice(0, 2) };
    const dep = { serviceJourney: friskt, _legs: [{ serviceJourney: utdatert, mode: 'metro' }, { }] };

    expect(_depServiceJourney(dep).estimatedCalls.length).toBe(LOEP.length);
    expect(_depServiceJourney(dep)).toBe(friskt);
    expect(depLineRef(dep)).toBe('RUT:Line:3');
  });

  /* En vanlig tavle-avgang har ingen `_legs`, så `mode` var null — og
   * `makeVehicleIcon` faller da tilbake på t-bane-silhuetten. En BUSS ble
   * tegnet som et tog. Linja vet det selv. */
  it('vet at en buss er en buss, også uten etapper', () => {
    const dep = avgang(6);
    dep.serviceJourney.line.transportMode = 'bus';
    expect(depMode(dep)).toBe('bus');
    // Og etappens eget svar vinner når det finnes.
    expect(depMode({ ...dep, _legs: [{ mode: 'tram' }] })).toBe('tram');
    expect(depMode(null)).toBeNull();
  });

  it('svarer null framfor å gjette når løpet mangler', () => {
    expect(_depServiceJourney(null)).toBeNull();
    expect(_depServiceJourney({ serviceJourney: { id: 'x' } })).toBeNull();
    expect(_depServiceJourney({ serviceJourney: { id: 'x', estimatedCalls: [] } })).toBeNull();
    expect(departureVehicle(null, { now: NAA })).toBeNull();
    expect(depLineRef(null)).toBeNull();
  });
});
