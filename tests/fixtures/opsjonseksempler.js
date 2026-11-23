/**
 * Representative eksempler på opsjonskontrakten (docs/opsjonsmodell.md).
 * Stopp-id-ene er ekte NSR-id-er slått opp i Enturs geokoder 2026-11-23;
 * linjer, tider og plattformer er illustrative (merket).
 */
import { nyOpsjon, nyOppdagelse } from '../../src/opsjonsmodell.js';

export const MORTENSRUD_POS = { lat: 59.8487, lon: 10.8291 };
export const DAG = '2026-11-23T12:00:00+01:00';
export const NATT = '2026-11-24T01:30:00+01:00';

export const STOPP = {
  mortensrud: { id: 'NSR:StopPlace:58228', name: 'Mortensrud', lat: 59.849385, lon: 10.829376 },
  hauketo: { id: 'NSR:StopPlace:59635', name: 'Hauketo stasjon', lat: 59.845998, lon: 10.803123 },
  ski: { id: 'NSR:StopPlace:60944', name: 'Ski stasjon', lat: 59.718294, lon: 10.833673 },
  helsfyr: { id: 'NSR:StopPlace:59516', name: 'Helsfyr', lat: 59.912673, lon: 10.801052 },
  osloS: { id: 'NSR:StopPlace:59872', name: 'Oslo S', lat: 59.910357, lon: 10.753051 },
  kolsås: { id: 'NSR:StopPlace:58284', name: 'Kolsås', lat: 59.914582, lon: 10.500843 },
  trondheimS: { id: 'NSR:StopPlace:59977', name: 'Trondheim S', lat: 63.436279, lon: 10.399123 },
};

export const OPPDAGELSE_DAG = nyOppdagelse({ posisjon: MORTENSRUD_POS, tid: DAG, tilgangspunkter: [
  { parentId: STOPP.mortensrud.id, stopPlaceId: STOPP.mortensrud.id, mode: 'metro', distanceM: 78 },
  { parentId: STOPP.hauketo.id, stopPlaceId: STOPP.hauketo.id, mode: 'rail', distanceM: 1482 },
] });
const oppd = (source = 'nettverksprobe') => [{ oppdagelse: OPPDAGELSE_DAG.id, source, at: OPPDAGELSE_DAG.tid }];

// 1. Et reisemål med to alternative tilgangspunkter (buss fra Mortensrud, tog fra Hauketo).
export const skiToTilganger = nyOpsjon({
  type: 'destination', nøkkel: { destinasjon: STOPP.ski.id }, label: 'Ski',
  intent: 'reise til et sted', origin: MORTENSRUD_POS, destinations: [STOPP.ski],
  accessPoints: [
    { parentId: STOPP.mortensrud.id, stopPlaceId: STOPP.mortensrud.id, quayId: 'NSR:Quay:illustrativ-buss', mode: 'bus', lineId: 'RUT:Line:illustrativ-buss', distanceM: 78 },
    { parentId: STOPP.hauketo.id, stopPlaceId: STOPP.hauketo.id, mode: 'rail', lineId: 'VYG:Line:illustrativ-tog', distanceM: 1482 },
  ],
  discovery: oppd(),
  provenance: [
    { discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.mortensrud.id, mode: 'bus' }, lineId: 'RUT:Line:illustrativ-buss', hubs: [] },
    { discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.hauketo.id, mode: 'rail' }, lineId: 'VYG:Line:illustrativ-tog', hubs: [] },
  ],
});

// 2. En reiseretning med flere destinasjoner (linjebasert — én av tre mulige basiser).
export const retningKolsås = nyOpsjon({
  type: 'direction', nøkkel: { basis: 'line', nøkkel: 'RUT:Line:3>Kolsås' }, label: 'T-bane 3 mot Kolsås',
  intent: 'følge en retning som åpner flere mål', origin: MORTENSRUD_POS,
  destinations: [STOPP.helsfyr, STOPP.kolsås],
  accessPoints: [{ parentId: STOPP.mortensrud.id, stopPlaceId: STOPP.mortensrud.id, mode: 'metro', lineId: 'RUT:Line:3', distanceM: 78 }],
  discovery: oppd(),
  provenance: [{ discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.mortensrud.id, mode: 'metro' }, lineId: 'RUT:Line:3', hubs: [] }],
});

// 2b. En geografisk retning — ikke en linje.
export const retningSørover = nyOpsjon({
  type: 'direction', nøkkel: { basis: 'geographic', nøkkel: 'sør' }, label: 'sørover',
  intent: 'følge en retning', origin: MORTENSRUD_POS, destinations: [STOPP.ski],
  discovery: oppd(), provenance: [{ discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, hubs: [] }],
});

// 3. Et transporttilbud som ennå ikke er bekreftet med reisesøk.
export const togFraHauketo = nyOpsjon({
  type: 'transport_offer', nøkkel: { tilgang: STOPP.hauketo.id, modus: 'rail', linje: 'VYG:Line:illustrativ-tog' },
  label: 'tog fra Hauketo', intent: 'bruke et tilbud i nærheten', origin: MORTENSRUD_POS,
  accessPoints: [{ parentId: STOPP.hauketo.id, stopPlaceId: STOPP.hauketo.id, mode: 'rail', lineId: 'VYG:Line:illustrativ-tog', distanceM: 1482 }],
  discovery: oppd(), timetable: 'running',
  provenance: [{ discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.hauketo.id, mode: 'rail' }, lineId: 'VYG:Line:illustrativ-tog', hubs: [] }],
});

// 4. En forbindelse via et knutepunkt: buss til Helsfyr (understopp), T-bane videre fra søskenstopp.
export const viaHelsfyr = nyOpsjon({
  type: 'connection', nøkkel: { fra: STOPP.mortensrud.id, via: [STOPP.helsfyr.id], til: STOPP.osloS.id },
  label: 'Mortensrud → Helsfyr → Oslo S', intent: 'kombinere transportmidler', origin: MORTENSRUD_POS,
  destinations: [STOPP.osloS], hubs: [STOPP.helsfyr.id],
  realisations: [{
    accessPoint: { parentId: STOPP.mortensrud.id, stopPlaceId: STOPP.mortensrud.id, mode: 'bus' },
    departure: '2026-11-23T12:04:00+01:00',
    legs: [
      { mode: 'bus', lineId: 'RUT:Line:illustrativ-buss', to: { parentId: STOPP.helsfyr.id, stopPlaceId: 'NSR:StopPlace:6071' } },
      { mode: 'metro', lineId: 'RUT:Line:illustrativ-T', from: { parentId: STOPP.helsfyr.id, stopPlaceId: 'illustrativt-T-understopp' } },
    ],
    hubs: [STOPP.helsfyr.id], destination: STOPP.osloS.id,
  }],
  discovery: oppd(),
  provenance: [{ discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.mortensrud.id, mode: 'bus' }, lineId: 'RUT:Line:illustrativ-buss', hubs: [STOPP.helsfyr.id] }],
});

// 5. En nasjonal destinasjon som ikke er tilgjengelig nå: søkt kl. 01:30, første avgang 06:xx.
export const trondheimNatt = nyOpsjon({
  type: 'destination', nøkkel: { destinasjon: STOPP.trondheimS.id }, label: 'Trondheim S',
  intent: 'reise til et sted', origin: MORTENSRUD_POS, destinations: [STOPP.trondheimS],
  discovery: oppd(), timetable: 'not_now',
  provenance: [{ discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.hauketo.id, mode: 'rail' }, lineId: 'VYG:Line:illustrativ-tog', hubs: [STOPP.osloS.id] }],
  confirmations: [{
    state: 'confirmed', searchedAt: NATT,
    request: { from: MORTENSRUD_POS, to: STOPP.trondheimS.id, modes: ['rail', 'bus'], travelTime: NATT },
    firstDeparture: '2026-11-24T06:10:00+01:00',
  }],
});

// 6. Samme opsjon oppdaget langs to stier (to separate funn som skal slås sammen).
export const skiViaBuss = nyOpsjon({
  type: 'destination', nøkkel: { destinasjon: STOPP.ski.id }, label: 'Ski', origin: MORTENSRUD_POS, destinations: [STOPP.ski],
  accessPoints: [{ parentId: STOPP.mortensrud.id, stopPlaceId: STOPP.mortensrud.id, quayId: 'NSR:Quay:illustrativ-buss', mode: 'bus', lineId: 'RUT:Line:illustrativ-buss', distanceM: 78 }],
  discovery: oppd(),
  provenance: [{ discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.mortensrud.id, mode: 'bus' }, lineId: 'RUT:Line:illustrativ-buss', hubs: [] }],
});
export const skiViaTog = nyOpsjon({
  type: 'destination', nøkkel: { destinasjon: STOPP.ski.id }, label: 'Ski', origin: MORTENSRUD_POS, destinations: [STOPP.ski],
  accessPoints: [{ parentId: STOPP.hauketo.id, stopPlaceId: STOPP.hauketo.id, mode: 'rail', lineId: 'VYG:Line:illustrativ-tog', distanceM: 1482 }],
  discovery: oppd(),
  provenance: [{ discoverer: 'nettverksprobe', oppdagelse: OPPDAGELSE_DAG.id, accessPoint: { stopPlaceId: STOPP.hauketo.id, mode: 'rail' }, lineId: 'VYG:Line:illustrativ-tog', hubs: [] }],
});

export const ALLE = { skiToTilganger, retningKolsås, retningSørover, togFraHauketo, viaHelsfyr, trondheimNatt, skiViaBuss, skiViaTog };
