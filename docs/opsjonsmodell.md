# Opsjonsmodellen

Plangrunnlaget, steg 2, trinn 1. Koden ligger i `src/opsjonsmodell.js`. Den er
bundet til eksemplene i `tests/fixtures/opsjonseksempler.js` og testene i
`tests/opsjonsmodell.test.js`, og arkitekturgrensen står i
`tests/arkitektur.test.js`.

## Hva en opsjon er

En **opsjon** er en identifisert *handlingsmulighet* i kollektivtilbudet. Et
reisemål er bare én slags opsjon. Modellen har fire typer, men det betyr ikke
fire oppdagere. Én utforsker kan finne alle fire.

| type | hva brukeren kan gjøre | nøkkel → `id` |
|---|---|---|
| `destination` | reise til et sted | destinasjonens samlestopp → `destination:NSR:StopPlace:60944` |
| `direction` | følge en retning som åpner flere mål | `basis` + nøkkel → `direction:line:RUT:Line:3>Kolsås`, `direction:geographic:sør` |
| `transport_offer` | bruke et tilbud i nærheten | tilgangens samlestopp + modus + linje |
| `connection` | kombinere transportmidler via knutepunkt | fra → via … → til (samlestopp) |

`direction` er **ikke** det samme som linjeretning. `basis` er `line`,
`geographic` eller `network`. Linje og destinasjoner er valgfrie egenskaper.

### Identitet

Identiteten (`opsjonsId`) sier *hva handlingen er*. Den avledes av `type` og
`nøkkel` og ingenting annet. Ny rute, nytt tilgangspunkt, nytt tidspunkt, en
ny oppdagelsessituasjon eller en annen rekkevidde gir **ikke** en ny opsjon.
Samtidig er identiteten kontekstuell nok til at ulike handlinger holdes fra
hverandre: buss og tog fra samme stopp er to tilbud, og et reisemål er noe
annet enn en forbindelse til samme sted.

Delene av en opsjon har egne id-er:

| del | id |
|---|---|
| realisering | `realisasjonsId` |
| oppdagelsesvei | `stiId` |
| tilgangspunkt | `tilgangsId`: plattform/understopp + modus + linje |
| oppdagelsessituasjon | `oppdagelse.id`: posisjon + tidspunkt |

## Feltene

```js
{
  id: 'destination:NSR:StopPlace:60944',
  type: 'destination',
  nøkkel: { destinasjon: 'NSR:StopPlace:60944' },
  label: 'Ski',
  intent: 'reise til et sted',
  origin: { lat: 59.8487, lon: 10.8291 },
  destinations: [{ id: 'NSR:StopPlace:60944', name: 'Ski stasjon', lat: 59.7183, lon: 10.8337 }],
  area: null,
  hubs: [],                               // samlestopp-id-er
  scope: 'regional',                      // avledet metadata, se under
  accessPoints: [                         // flere er normalt
    { parentId: 'NSR:StopPlace:58228', stopPlaceId: 'NSR:StopPlace:58228', quayId: '…',
      mode: 'bus', lineId: '…', distanceM: 78, walkMin: null },
    { parentId: 'NSR:StopPlace:59635', stopPlaceId: 'NSR:StopPlace:59635', quayId: null,
      mode: 'rail', lineId: '…', distanceM: 1482, walkMin: null },
  ],
  realisations: [                         // konkrete måter å utføre den på
    { accessPoint, departure, legs: [{ mode, lineId, from, to }], hubs, destination, times, raw? },
  ],
  discovery: [{ oppdagelse: 'oppdagelse:59.8487,10.8291@…', source: 'nettverksprobe', at: '…' }],
  provenance: [                           // hver sti beholdes
    { discoverer: 'nettverksprobe', oppdagelse: '…', accessPoint: {…}, lineId: '…', hubs: [] },
  ],
  confirmations: [                        // knyttet til en konkret forespørsel
    { state: 'confirmed', searchedAt: '…', firstDeparture: '…',
      request: { from, to, modes, travelTime: '…' } },
  ],
  timetable: 'running' | 'not_now' | null, // fra rutetilbudet, ikke fra et reisesøk
}
```

### Tilgangspunkter

Samlestoppet (`parentId`) og understoppet eller plattformen (`stopPlaceId`,
`quayId`) lagres side om side, sammen med `mode` og `lineId`. Når tilgangspunkter
slås sammen, skjer det på `tilgangsId`, ikke på samlestoppet. Derfor forsvinner
aldri plattform eller transportmiddel.

**Målt:** turenes stopplister viser understopp per transportmiddel.
«Helsfyr T» (6071) har bare buss, mens T-banen er et søskenstopp under
samlestoppet `59516`.

### Realiseringer

En opsjon kan ha mange realiseringer. Flere realiseringer gir **ikke** flere
opsjoner.

## Status: tre begreper, ikke én variabel

| begrep | hvor | verdier |
|---|---|---|
| oppdagelse | `discovery[]` | hvem, fra hvilken situasjon, når |
| bekreftelse | `confirmations[]` → `bekreftelse(opsjon, reisetid, nå)` | `not_checked`, `checking`, `confirmed`, `not_feasible`, `unknown` |
| tidsmessig tilgjengelighet | avledes: `tilgjengelighet(opsjon, reisetid, nå)` | `now`, `later`, `in_timetable_not_now`, `not_assessed` |

- **En bekreftelse gjelder bare forespørselen sin.** Den må gjelde samme
  reisetidspunkt (± `BEKREFTELSE_TOLERANSE_MS`, 1 min), og svaret må være
  ferskt (`BEKREFTELSE_GYLDIG_MS`, 3 min). Uten en gyldig bekreftelse er
  statusen `not_checked`, selv om opsjonen ble bekreftet for et annet
  tidspunkt.
- **Tilgjengeligheten lagres aldri.** `avvik()` avviser en opsjon som har feltet
  `availability`. `now` krever en gyldig `confirmed` med første avgang innen
  `NÅ_HORISONT_MS` (60 min). Er avgangen senere, blir det `later`. Uten
  bekreftelse, men med `timetable: 'not_now'`, blir det `in_timetable_not_now`.
  Ellers er det `not_assessed`.
- **Kombinasjonene som er mulige:** en opsjon kan være oppdaget uten å være
  bekreftet. Den kan også være bekreftet, men bare tilgjengelig senere, som
  eksempel 5 (Trondheim S kl. 01:30).

## Rekkevidde er metadata

`scopeFor(origin, destinasjon)` gir `local`, `regional`, `national` eller `unknown`.

- **Heuristikk** [Hypotese]: luftlinje under 15 km er lokal, under 120 km er
  regional, ellers nasjonal (`SCOPE_GRENSER_M`). Det er en midlertidig regel,
  ikke en produktdefinisjon. Administrative grenser kan erstatte den.
- **Ikke bestemmende:** rekkevidden inngår **aldri** i id, oppdagelse,
  filtrering eller utvelgelse. To tester binder dette. Den ene viser at
  samme opsjon kan ha ulik rekkevidde fra ulike steder, men samme id. Den
  andre viser at utvelgelsen er uendret når rekkevidden er tom.

## Utvelgelse til bekreftelse

Utvelgelsen er et eget steg, `velgForBekreftelse(kandidater, n)`, og er adskilt
fra oppdagelsen:

1. Kandidatene sorteres på id, slik at rekkefølgen de ble oppdaget i ikke
   spiller noen rolle.
2. De grupperes på (hovedmodus, første knutepunkt). Hovedmodus er den
   høyeste i rekkefølgen tog › T-bane › båt › trikk › fly › ekspressbuss ›
   buss › taxi. Rekkefølgen er bare til spredning, ikke til relevans.
3. I hver gruppe står de lengst unna først, deretter etter id.
4. Én tas fra hver gruppe etter tur til budsjettet `n` er brukt.
5. Svaret er `{ valgt, utenfor }`. De som er `utenfor`, **beholdes** med
   `not_checked` og rapporteres.

Dette er en midlertidig regel. Den svarer på «spre budsjettet», ikke på «hva er
best for brukeren».

## Sammenslåing

`slåSammen(a, b)` krever samme id og kaster en feil ellers. Den forener
tilgangspunkter, realiseringer, stier, oppdagelser, bekreftelser og
destinasjoner, med dedup på delenes egne id-er. Ingenting forkastes.
`samle(liste)` gir én opsjon per id.

## Hva modellen ikke skal gjøre

- Rangere eller velge hva brukeren får se. Det er presentasjonens og
  `mulighetsoppdagelse.js` sitt ansvar.
- Kjenne til «mot sentrum», «hjemover» eller snarveier.
- Gjøre API-kall. Modellen er ren, og arkitekturtesten krever at den ikke når
  `api/`.
- Si «tilgjengelig nå» uten et gyldig reisesøk for det reisetidspunktet.
- Bruke rekkevidde til å finne eller filtrere.
- Slette en oppdagelsesvei for å forenkle.

## Eksemplene

Eksemplene ligger i `tests/fixtures/opsjonseksempler.js`. Stopp-id-ene er ekte
NSR-id-er, men linjer, plattformer og tider er illustrative.

1. Ski med to tilgangspunkter: buss fra Mortensrud og tog fra Hauketo.
2. T-bane 3 mot Kolsås med flere destinasjoner (basis `line`), og «sørover»
   (basis `geographic`).
3. Tog fra Hauketo: oppdaget og ikke bekreftet, altså `not_checked` og
   `not_assessed`.
4. Mortensrud → Helsfyr → Oslo S, der understoppene er bevart under
   samlestoppet.
5. Trondheim S kl. 01:30: nasjonal, `confirmed`, `later`.
6. Ski funnet langs to stier, som etter `samle` er én opsjon med to stier.
