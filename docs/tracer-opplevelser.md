# Tracer: opplevelser ved «ett bytte»-stedene

**Dato:** 2026-11-24
**Status:** undersøkelse. Kategorimodellen er lagt i `src/opplevelser.js`
(v1.218.311), men den er ikke koblet til noen skjerm, og «ett bytte»
oppfører seg som før.
**Skript:** `scratchpad/tracerOpplevelser.mjs`
**Resultat:** `scratchpad/data/opplevelser-resultat.json`

Merking i rapporten:
- **[Fakta]**: lest i koden eller i et API-svar.
- **[Målt]**: fra traceren.
- **[Hypotese]**: ikke prøvd.
- **[Anbefaling]**: mitt forslag.
- **[Ubekreftet]**: kunne ikke sjekkes herfra.

---

## 1. Kort konklusjon

**Ja, med forbehold.** Kategoriseringen avdekker reisemål som dagens «ett
bytte» ikke viser [Målt]. **20 av 24** steder får minst én relevant opplevelse
med gangvei, og **17** får flere.

**170 av 172** opplevelser har et annet navn enn stoppet. Uten berikelse ville
brukeren aldri sett dem. Noen eksempler (§8):
- Lilleputthammer og Hafjell bak stoppet «Øyer sentrum»;
- Emanuel Vigelands museum bak busstoppet «Stasjonsveien»;
- Nøstvetmarka og Tussetjern ved Oppegård stasjon;
- Ringve musikkmuseum og botaniske hage ved Leangen stasjon.

**Forbeholdene:**
- **Støy dominerer råmaterialet.** Av 792 unike navngitte kandidater er
  **189 relevante (24 %)** etter relevansreglene, og 172 når gangfilteret er
  med. Uten reglene ville listene vært fulle av skolegårder, infotavler,
  holdeplasser og hauger [Målt].
- **Boligstrøk og bygd gir få eller ingen treff.** 4 av 24 steder fikk 0:
  Dorganeset, Mære skole, Skogstadrampa og Balberglia. Kategorien må derfor
  **supplere** og ikke erstatte, slik oppdraget sier.
- **Kartverkets turrutebase løfter bygda** (§13). Pilegrimsleden går forbi
  to av de fire tomme stoppene, Skogstadrampa og Balberglia nord. Med
  turrutene får **22 av 24** steder noe å gjøre.
- **Ingen kilde alene er nok.** Miljødirektoratet er best for friluftsliv,
  Wikidata (antall språkversjoner) for kultur og severdigheter, og OSM for
  attraksjoner, utsikt og bading. Kartverket bekrefter navn og type, men er
  sjelden et selvstendig signal.

---

## 2. Dagens arkitektur og datamodell [Fakta]

**Reisemålet i «ett bytte» er et Entur-StopPlace, aldri et sted (POI).**
- `stoppVidere` (`src/nettverksutforsker.js:112-120`) leser stoppene videre
  på turen fra `serviceJourney.estimatedCalls[].quay.stopPlace`. Mangler de,
  brukes planlagte `quays`.
- Stoppet løftes til samlestopp med `stopPlaces(ids){parent{…}}` (:305) og
  `samleSted` (:314).
- `destinations[0]` er bare `{id, name, lat, lon}`
  (`nyOpsjon`, `src/opsjonsmodell.js:111-130`). Det finnes ingen kategori.

**Identitet:**
- `opsjonsId` gir `destination:<stopId>` (opsjonsmodell.js:48);
- `samlestopp` (:38) og `stiId` (:82) gir opphav (proveniens);
- en opsjon kan ha mange veier: `[tilgang, inn, knute, dir, sted.id]`
  (nettverksutforsker.js:344).

**`type` på kortet er transportmiddelet, ikke stedet.**
`velgStedstype` (`src/ettBytte.js:21-30`) sier det rett ut: «Ikke hva stedet
ER». Feltet må ikke gjenbrukes til opplevelser.

**Dimensjonene** (`FASETTER`, ettBytte.js:171):
- **retning:** himmelretning med ett knutepunkt;
- **knute:** byttestedet;
- **linje:** linje inn eller ut;
- **transport:** modus på linja ut;
- **kommune:** geocoderens `locality`, via `src/api/kommuner.js`.

Alle svarer på *hvordan* og *hvor*, ingen på *hva som finnes der*.

**Eksisterende steds-moduler:**
- `src/api/places.js` (Geoapify og Overpass) spør bare om mat, butikk og
  kultur (`PLACE_CATS` :135; `_OSM_TAGS` :162-188, med `catering.*`,
  `commercial.*` og `entertainment.museum/cinema/theatre/arts_centre`). Den
  brukes av ankomstpanelet (`views/track.js:2693`), fritid og innstillinger,
  **ikke av «ett bytte»**.
- `place.js`, `rankPlaces.js` og `stopCats.js` handler om stopp og
  geokoding, ikke om opplevelser.
- `innganger.js` henter bare stasjonsinnganger fra Overpass.

**Ingen kobling fra stopp til steder i nærheten finnes i «ett bytte».**

**Valg av begrep [Anbefaling]: `opplevelseskategori`.**
- «Stedstype» er alt brukt i koden om transportmiddel (`velgStedstype`).
- «Destinasjonstype» kan forveksles med `type: 'destination'` i
  opsjonsmodellen.
- «Opplevelse» beskriver det brukeren finner, ikke stoppet.

---

## 3. Datakildene i denne undersøkelsen

**Hva som faktisk ble spurt** [Fakta]: for hvert av 24 stopp, de fire kildene
under, i tillegg til Valhalla.

| kilde | kall | svar |
|---|---|---|
| OpenStreetMap | `api.openstreetmap.org/api/0.6/map.json?bbox=` (± 600 m) | 379 257 objekter |
| Wikidata | SPARQL `wikibase:around` 1,5 km, `P31` og `wikibase:sitelinks` | 1 468 |
| Kartverket stedsnavn | `ws.geonorge.no/stedsnavn/v1/punkt` (1,5 km) | 2 845 |
| Miljødirektoratet | `friluftsliv_kartlagt/MapServer/0/query` (800 m, med flater) | 230 områder |
| Valhalla | `valhalla1.openstreetmap.de/route`, fotgjenger, stopp → stedets nærmeste punkt | ett kall per relevant sted |

Alle 96 kildekall svarte (`kilder` i resultatfila).

**Ikke prøvd, og hvorfor:**
- **Geoapify:** nøkkelen finnes bare i CI (`VITE_GEOAPIFY_KEY`,
  `src/config.js:41`) og sendes som URL-parameter. Den kan ikke legges inn
  som nettverkshemmelighet [Fakta]. Hvilke kategorier som finnes og hva de
  koster, er **[Ubekreftet]**.
- **Overpass:** `overpass-api.de` er tillatt i miljøet, men tunnelen lukkes
  (`ws_closed_mid_exchange`). Speilene `overpass.kumi.systems` og
  `overpass.private.coffee` svarte ikke innen fristen. OSMs eget API ble brukt
  i stedet, med samme data men uten filtrering på serveren. Det er ikke en
  produksjonsvei (se §11).
- **UT.no/DNT:** ikke undersøkt. Verten var ikke tillatt, og om det finnes et
  åpent API er **[Ubekreftet]**.
- **Kartverkets turrutebase** er tatt med etter første rapport. Den står i
  §13, og telles der for seg.

---

## 4. Sammenligning av kildene

| | OSM | Wikidata | Kartverket stedsnavn | Miljødir. friluftsliv | Geoapify |
|---|---|---|---|---|---|
| typer | alt: turisme, natur, historikk, fritid | kjente steder, kultur, natur | navn og type (topp, vann, foss …) | kartlagte friluftsområder med verdi | OSM-avledet, kategorisert |
| geometri | punkt, linje og flate; relasjoner mangler i `map` | punkt | punkt | **flater** | punkt |
| relevanssignal | taggen; ellers svakt | **antall språkversjoner** | ingen | områdetype og verdi | ukjent |
| identitet | `node/way/<id>` (stabil, men kan endres) | `Q-id` (stabil) | `stedsnummer` | `id` (FK…) | `place_id` og OSM-id i `datasource.raw` |
| andel av relevante treff [Målt] | 52 | 110 | 7 | 32 | ikke prøvd |
| i appen i dag | ja (Overpass, mat og butikk) | nei | ja (`stedNavn.js`) | nei | ja (mat og butikk) |
| lisens | ODbL, kreditering | CC0 | **CC BY 4.0, «© Kartverket»** [Fakta, kartverket.no/api-og-data/vilkar-for-bruk] | NLOD/CC BY 4.0 **[Ubekreftet]** | kommersielle vilkår **[Ubekreftet]** |
| rolle [Anbefaling] | attraksjoner, utsikt, bading, naturtagger | kultur og severdigheter, og relevans | navn og bekreftelse | **friluftsliv og utfart** | mulig erstatning for OSM i nettleseren |

Tallene for «andel av relevante treff» teller hver kilde som bidro til et
relevant sted, så summen er over 172.

**Kostnader og lisenser** kunne ikke leses fra kildene herfra, fordi
nettsidene ikke var tillatt i nettverket. Alt merket **[Ubekreftet]** må
sjekkes før noe bygges.

---

## 5. Kategorimodell [Anbefaling, prøvd i traceren]

De sju hovedkategoriene fra oppdraget fungerer, og ett sted kan ha flere.
Underkategorien (`u`) kommer fra kilden og vises aldri rått.

| hovedkategori | eksempler på underkategori |
|---|---|
| Friluftsliv og utfart | friluftsområde, marka, hytte, rasteplass |
| Natur og landskap | topp, vann, foss, utsiktspunkt, naturreservat |
| Severdigheter og landemerker | attraksjon, borg/ruin, monument |
| Attraksjoner og opplevelser | fornøyelsespark, dyrepark, skisenter |
| Kultur og historie | museum, kulturhus, kirke, kulturminne |
| Bading og vannaktiviteter | badeplass, strand, strandsone, brygge |
| Parker og rekreasjon | park, hage |

**Mapping** (`src/opplevelser.js`, én definisjon):
- **OSM** (`OSM_MAP`), med sterke tagger:
  - `tourism=viewpoint`, `attraction`, `museum`, `zoo` og `theme_park`;
  - `leisure=nature_reserve` og `bathing_place`;
  - `natural=peak`, `waterfall` og `beach`;
  - `historic=castle`, `fort` og `ruins`.
- **Støy fra OSM** (`OSM_STØY`): `tourism=information`, `leisure=picnic_table`,
  `firepit`, `playground` og `pitch`, `historic=charcoal_pile` med flere.
- **Wikidata** (`WD_MAP`): P31-etikett til kategori. Holdeplasser, skoler og
  gater tas ut (`WD_UTELAT`). Kravet er 2 språkversjoner, og 3 for kirker og
  kulturminner (`WD_SITELINKS`).
- **Kartverket** (`KV_MAP`): Topp, Fjell, Vann, Foss, Utsiktspunkt, Strand og
  Badeplass. Disse er aldri sterke alene.
- **Miljødirektoratet:** sterkt bare for områdetyper man reiser **til**
  (`MD_REISEMÅL`): utfartsområde, stort turområde, Marka, særlig
  kvalitetsområde og strandsone. Lekeområder, grønnkorridorer og
  nærturterreng er svake, selv med verdien «svært viktig».

**Erfaringer fra traceren:**
- «Kultur» blir stor av kirker. Kirker og kulturminner står for 37 av de 172.
  Uten dem går 19 av 24 steder fortsatt ut med minst én opplevelse, og 15
  med flere [Målt]. Det taler for en egen underkategori «kirke» med lavere
  vekt.
- «Severdigheter» og «Attraksjoner» overlapper i kildene. Det kan bli én
  kategori i første versjon [Hypotese].

---

## 6. Koble reisemål til kollektivstopp

Slik traceren gjør det [Fakta]:
1. **Luftlinje som første filter.** Kandidater over 1,5 km fra stoppet tas
   ut.
2. **Nærmeste punkt, ikke sentrum.**
   - For OSM-flater: nærmeste node på omrisset.
   - For Miljødirektoratets flater: nærmeste punkt på kanten, fra polygonet
     selv.
   - Eksempel: «Grønliåsen» er 24 m fra Nebbejordet målt til kanten. Hvor
     langt det er til sentrum er ikke målt, men området er et stort
     turområde.
3. **Gang med Valhalla** fra stoppet til det punktet. Gangbart betyr at ruta
   er under 2 km og ikke lengre enn 3 × luftlinja (eller luftlinja + 600 m).
   21 kandidater falt ut på avstand eller gang [Målt].

**Forbehold:**
- Valhalla svarte for alle 172. «Verifisert» betyr at det finnes en gangvei i
  OSM-nettet, **ikke** at inngangen er kjent. For store områder er kanten en
  tilnærming. Adkomstpunkter, som turstart fra Kartverkets `RuteInfoPunkt`
  og parkering, er ikke brukt.
- Ett sted kan nås fra flere stopp. «Grønliåsen» kommer for eksempel både
  ved Nebbejordet og ved Hauketo stasjon. Modellen må derfor ha
  `access: [{ stopp, gang }]` som en liste, ikke ett felt (§9).

---

## 7. Resultater [Målt]

**Utvalget:** 4 utgangspunkter fra Entur-opptakene, 24 steder spredt etter
avstand, og minst to stasjoner eller kaier per utgangspunkt.

| | antall |
|---|---|
| transportdestinasjoner undersøkt | 24 (av 4 475 «ett bytte»-steder i opptakene) |
| rå kandidater (taggede eller typede objekter) | 2 274, av dem 844 med navn |
| unike steder (slått sammen på tvers av kilder) | 792 |
| duplikater slått sammen | 52 |
| relevante (selvstendige reisemål) | 189 |
| tatt ut som ikke relevante | 477 (pluss støy-tagger) |
| tatt ut på avstand eller gang | 21 |
| tilgjengelige (gangbare) | **172** |
| med gangvei funnet av Valhalla | 172 (se forbeholdet i §6) |
| med flere kategorier | 25 |
| bekreftet av flere kilder | 26 |
| steder med minst én opplevelse | **20 / 24** |
| steder med flere opplevelser | **17 / 24** |
| opplevelser med annet navn enn stoppet | 170 / 172 |

**Per kategori** (et sted kan telle i flere):
kultur 95, park 41, friluftsliv 25, natur 15, bading 10, severdighet 10,
attraksjon 2.

**Per kilde** (bidro til et tilgjengelig sted): Wikidata 110, OSM 52,
Miljødirektoratet 32, Kartverket 7.

**Per stopp:**

| stopp | fra | km | modus | rå | opplevelser |
|---|---|---|---|---|---|
| Nebbejordet | Mortensrud | 1,1 | buss | 67 | 3 |
| Oppegård stasjon | Mortensrud | 9,3 | tog | 53 | 5 |
| Stasjonsveien | Mortensrud | 13,7 | buss | 83 | 4 |
| Asker stasjon | Mortensrud | 22,1 | tog | 95 | 4 |
| Malmö Centralstation | Mortensrud | 489 | ekspressbuss | 364 | 27 |
| Hauketo stasjon | Mortensrud | 1,5 | tog | 75 | 8 |
| Sanddalskollen | Nesttun | 1,1 | buss | 75 | 4 |
| Haakonsvern | Nesttun | 7,8 | buss | 40 | 1 |
| Tømmervågen | Nesttun | 13,9 | buss | 47 | 6 |
| Dorganeset | Nesttun | 21,8 | buss | 16 | 0 |
| Stavanger lufthavn | Nesttun | 161 | ekspressbuss | 24 | 2 |
| Mårdalen | Nesttun | 1,3 | trikk | 84 | 5 |
| Strindfjordvegen | Ranheim | 1,2 | buss | 82 | 2 |
| Furuhaugen | Ranheim | 10,9 | buss | 122 | 2 |
| Krekabakken | Ranheim | 28,6 | buss | 13 | 1 |
| Mære skole | Ranheim | 71,9 | buss | 16 | 0 |
| Oslo S | Ranheim | 391 | tog | 703 | 82 |
| Leangen stasjon | Ranheim | 3,3 | tog | 114 | 5 |
| Skogstadrampa | Tretten | 1,2 | buss | 5 | 0 |
| Balberglia nord | Tretten | 18,4 | buss | 42 | 0 |
| Kinnlistua | Tretten | 26,2 | buss | 4 | 1 |
| Klebervegen | Tretten | 78,5 | buss | 5 | 2 |
| Torghopen Måløy kai | Tretten | 283 | ekspressbuss | 43 | 6 |
| Øyer sentrum | Tretten | 10,9 | ekspressbuss | 102 | 2 |

Bysentra (Oslo S, Malmö) gir mange treff, men der vet brukeren alt at det
finnes mye. Verdien ligger i stedene der stoppnavnet ikke sier noe.

---

## 8. Eksempler

**Positive** (stopp → opplevelse · kategori · kilder · luftlinje / gang):
1. **Øyer sentrum**, ekspressbuss, 11 km fra Tretten: **Lilleputthammer**,
   fornøyelsespark (attraksjon), OSM og Wikidata (6 språk), 158 m / 2 min.
   Også **Hafjell**, skisenter, Wikidata (13 språk), 15 min gange. Kortet
   viser i dag bare «Øyer sentrum».
2. **Stasjonsveien**, buss, 14 km fra Mortensrud: **Emanuel Vigelands
   museum**, kultur, OSM og Wikidata, 371 m / 8 min. Også **Holmendammen**
   (vann, 8 min) og **Villa Stenersen** (kulturminne, 23 min). Et busstopp
   uten kjent navn skjuler et kjent museum.
3. **Leangen stasjon**, tog, 3 km fra Ranheim: **Ringve Musikkmuseum**
   (museum, 12 språk, 19 min), **Ringve botaniske hage** (Kartverket og
   Wikidata, 20 min) og **Leangen gård** (tre kilder, 7 min).
4. **Oppegård stasjon**, tog, 9 km fra Mortensrud: **Nøstvetmarka**, stort
   turområde med tilrettelegging (Miljødirektoratet, svært viktig), 9 min.
   Også **Tussetjern**, særlig kvalitetsområde og vann, Miljødirektoratet og
   Wikidata, 10 min.
5. **Sanddalskollen**, buss, Bergen: **Rambjøra landskapsvernområde** (OSM,
   17 min) og **Myravatnet** (tre kilder, 19 min). Et naturområde ingen ville
   lett av stoppnavnet.
6. **Tømmervågen**, buss, Bergen: **Sentrale Byfjell**, Marka
   (Miljødirektoratet, svært viktig), 17 min.
7. **Torghopen Måløy kai**, ekspressbuss, 283 km: **Moldøen** og
   **Veten-Blåfjell-Stallbrekka**, særlig kvalitetsområde og stort turområde,
   10–19 min.

**Negative**, med det som ser relevant ut, men ikke bør vises:
- **«Ljabru holdeplass» som «topp»:** Wikidata-typen «trikkestopp» traff
  mønsteret for topp. Feil i min første mapping, nå rettet (`WD_UTELAT`).
- **«Uteområde Prinsdal skole», «Gang- og sykkelvei langs Gjersrudbekken»:**
  Miljødirektoratet sier «svært viktig friluftslivsområde». Det er riktig for
  nærmiljøet, men det er ikke et reisemål. Første kjøring hadde 174
  Miljødirektoratet-treff, og etter regelen om områdetype er det 32.
- **«Fossholtet», «Delerudåsen»:** små åser. Kartverket og Wikidata ser ut
  som to kilder, men Wikidata-posten er importert fra Kartverket (1
  språkversjon). Det er ikke en uavhengig bekreftelse.
- **«Sognsvann 0,3 NØ», «Engersbråten SØ»:** OSM `tourism=information`, altså
  skilt og infotavler. Støy.
- **«Ballbinge», bålplasser og benker:** `leisure=pitch`, `firepit` og
  `picnic_table`. Nyttige på stedet, men ikke en grunn til å reise.
- **Kirker overalt:** «Ris kirke», «Ljan kirke». De er ekte, men det finnes
  en i hver bydel. De bør vises lavt, ikke som oppdagelse.
- **Tvilsomt som fortsatt slipper gjennom:**
  - «Måløy stadion» (lekeområde i Miljødirektoratet og OSM, to kilder);
  - «Oslo Spektrum» som «teater».

  Regelen om to kilder trenger en liste over typer som aldri kan bli
  reisemål.

---

## 9. Teknisk datamodell [Anbefaling]

Den skal være egen og ved siden av opsjonen. Den skal ikke ligge i
`destinations[0]`, og ikke i `type`.

```js
// Opplevelse: et fysisk sted eller område. Aldri et stopp.
{ id: 'opl:wikidata:Q…',                // stabil: Wikidata > OSM > kilde-id
  navn: 'Ringve Musikkmuseum',
  geometri: { type: 'Point' | 'Polygon', … },   // flater beholdes
  kategorier: [{ k: 'kultur', u: 'museum' }],
  kilder: [{ kilde: 'wikidata', sid: 'Q…', sitelinks: 12 }, { kilde: 'osm', sid: 'way/…' }],
  reisemål: true,                         // erReisemål(kilder)
}
// Tilgang: én per (stopp, opplevelse), mange til mange.
{ stopp: 'NSR:StopPlace:…', opplevelse: 'opl:…',
  punkt: { lat, lon, art: 'kant' | 'node' | 'inngang' },
  luftM: 1195, gang: { m: 1480, min: 19, kilde: 'valhalla' } | null,
  gangVerifisert: true | false | null }   // null = ikke spurt; det sies på skjermen
```

- **Duplikater:** samme Wikidata-id (også via OSM-taggen `wikidata`), ellers
  samme normaliserte navn innen 400 m.
- **Kompatibilitet:** «ett bytte» endres ikke. Opplevelsene slås opp på
  `destinations[0].id` (stopp-id-en som alt flyter gjennom).
- **Caching:** områder og navn endrer seg sjelden. Lagres per stopp, i dager
  eller uker, ikke 10 minutter som `fetchNearbyPlaces`.

---

## 10. Konsekvenser for «ett bytte» [Hypotese]

- **Dimensjonen:** en sjette dimensjon ved siden av retning, knute, linje,
  transport og kommune. Ett trykk gir kort per kategori, for eksempel
  «Friluftsliv og utfart · 12 steder». Stedene står under kortet som i dag,
  med opplevelsen i stedet for stoppnavnet.
- **Filter i stedet for egen side:** kategorien legges som filter oppå
  rekkevidden («hvor langt», v1.218.308). «Nasjonalt · natur» blir da et
  naturlig spørsmål.
- **Rad for valgt kort:** stedsrader (v1.218.305) får linjen «Ringve
  Musikkmuseum · 19 min å gå». Det er alternativet på raden, i samme form som
  før.
- **Ingen opplevelse:** stedet står som i dag. Det forsvinner aldri, i tråd
  med «ingenting kastes for å rydde».

---

## 11. Kostnad, begrensninger og risiko

- **Antall kall:** «ett bytte» når 560–1 507 steder per utgangspunkt [Målt].
  Fire kall per sted mot fire kilder på hvert trykk går ikke.
  - På et valgt kort (8 steder, `SJEKK_STEDER`) blir det 32 kall. Det går på
    trykk, slik «sjekk denne» gjør i dag [Anbefaling].
  - Ellers: forhåndsberegning per stopp. Stoppene er de samme for alle
    brukere, så resultatet kan caches eller lages som statisk fil.
- **OSMs API** (`/api/0.6/map`) er laget for redigering, ikke uthenting.
  Bruksvilkårene er **[Ubekreftet]** herfra. Det er ikke en vei for
  produksjon: bruk Overpass, en egen uthenting fra OSM-data eller Geoapify.
- **Valhallas offentlige server** brukes alt i appen, men om den tåler mange
  slike kall er **[Ubekreftet]**.
- **Geoapify:** pris, kvote og kategorier er **[Ubekreftet]**. De må leses i
  kontoen og dokumentasjonen.
- **Kvalitet:** den største risikoen er støy, ikke mangel på data. Uten
  regelen om områdetype for Miljødirektoratet og kravet om språkversjoner i
  Wikidata blir listene uleselige (§8).
- **Personvern:** ingen nye personopplysninger. Kallene sender bare
  koordinatene til stopp, ikke posisjonen din.

---

## 12. Anbefaling

**Avklart med produkteier 24.11:** bare åpne API-er, uten nøkkel og uten
betalte lisenser. Åpne lisenser med krav om kreditering (CC BY, ODbL) er
greit, men krediteringen må vises.

**Svar på spørsmålene:**
1. **Gir kategorien en reell forbedring?** Ja, der stoppnavnet ikke sier noe:
   by- og forstadsstopp, og regionale knutepunkter som Øyer og Leangen. Den
   gir lite i rene boligstrøk og tynn bygd (4 av 24 uten treff).
2. **Hvilke kilder gir best verdi?** Miljødirektoratet for friluftsliv,
   Wikidata (med språkversjoner) for kultur og severdigheter, og OSM for
   utsikt, bading og attraksjoner. Alle er åpne, men lisensene må
   bekreftes.
3. **Holder dagens Geoapify- og Overpass-integrasjoner?** Nei, ikke uten
   endring. De spør bare om mat og butikk. OSM-delen kan utvides med taggene
   i `OSM_MAP`. Geoapify er ikke prøvd.
4. **Hvilke kilder bør prioriteres?** Miljødirektoratet, Wikidata og
   **Kartverkets turrutebase**. Alle er åpne og uten nøkkel. Turrutebasen gir
   både navngitte ruter (et turmål i seg selv) og merket adkomst.
5. **Hvilken kategorimodell?** De sju i `src/opplevelser.js`, med kirke som
   egen lavvektet underkategori. Severdighet og attraksjon kan slås sammen i
   første versjon.
6. **Hvordan kobles reisemål til stopp?** Mange til mange. Avstand måles til
   nærmeste punkt eller kant, gang med Valhalla, og «ikke verifisert» sies
   høyt. Mål aldri til sentrum.
7. **Minste endring som viser verdien?** Opplevelsen på stedsradene under et
   valgt «ett bytte»-kort, hentet på trykk for høyst 8 steder.
8. **Hva må avklares før implementering?**
   - lisens og attribusjon for Miljødirektoratet og Kartverket;
   - Geoapify-kvote, eller vei til OSM-data uten Overpass i nettleseren;
   - om Wikidata-kall fra nettleseren er greit;
   - om du vil ha 8 kall per kort.

**Prioritet:**
- **Nå:**
  - kategorimodellen (gjort, `src/opplevelser.js`, med tester);
  - et lite oppslag på trykk for et valgt kort, med Miljødirektoratet og
    Wikidata, i tillegg til turrutebasen (tre åpne kilder uten nøkkel). Opplevelsen vises som linje på
    stedsraden;
  - mål på ekte bruk.
- **Neste:**
  - OSM-taggene gjennom eksisterende `places.js` (Overpass). Geoapify tas
    ikke med: bare åpne API-er, avklart 24.11;
  - kategori som dimensjon og filter sammen med «hvor langt»;
  - adkomst fra Kartverkets turruter.
- **Senere:**
  - forhåndsberegnet datasett per stopp for hele landet;
  - UT.no/DNT, hvis vilkårene tillater det;
  - sesong og åpningstider;
  - en bildekilde.

## 13. Tillegg: Kartverkets turrutebase

Etter spørsmålet ditt om kartverket.no/api-og-data/friluftsliv.

**Fakta fra Kartverket:**
- «Nasjonal database for turruter» har fotruter, skiløyper, sykkelruter,
  ro- og padleruter, og hytter, parkering, toalett og utsiktspunkt knyttet til
  rutene. Rutene har et **definert vedlikeholdsansvar**: de er merket eller
  skiltet.
- Turforslag er ikke med. Ut.no henter stier og ruter herfra.
- Den finnes som WFS:
  `wfs.geonorge.no/skwms1/wfs.turogfriluftsruter`, med typene `Fotrute`,
  `Sykkelrute`, `AnnenRute`, `RuteInfoPunkt` og `Skil`.
- Den oppdateres ukentlig (kartkatalogen, sist 23.11.2026).
- Lisensen er **CC BY 4.0**, gratis også for kommersiell bruk, med «©
  Kartverket» og en lenke der det er mulig.

**Målt** (WFS, ± 800 m rundt hvert av de 24 stoppene):

| | antall |
|---|---|
| stopp med merket turrute innen 500 m | **13 / 24** |
| opplevelser med merket rute innen 200 m av stedets punkt | 45 av 172 |
| av dem friluftsliv eller natur | 15 av 35 |
| `RuteInfoPunkt` funnet | 16, på 5 stopp |

**Hva den avdekker som de andre kildene ikke gjør:**
- **Skogstadrampa og Balberglia nord** (Tretten) hadde **0** opplevelser.
  Begge ligger på **Pilegrimsleden – Gudbrandsdalsleden**.
- **Øyer sentrum:** «Storkjølla», «Aronsvestranda» og «70 turer for store og
  små».
- **Oslo S:** «Rondanestien» og «KyststiOslo».
- **Asker stasjon:** «Kystruta», «Solvangrunden» og «Risengarunden».
- **Strindfjordvegen:** «Ranheimsrunden» og «Pilegrimsleden – Romboleden».

**Fra metadataen i kartkatalogen** (`kartkatalog.geonorge.no/metadata/turrutebasen/d1422d17-…`) [Fakta]:
- **Tilgang og lisens:** «Åpne data», CC BY 4.0.
- **Fullstendighet varierer:** innsamlingen bygger «stort sett på
  innmeldinger fra lag, foreninger og privatpersoner via "Rett i kartet"», og
  dataene kontrolleres manuelt mot FKB og N50. Et stopp uten rute betyr derfor
  ikke at det ikke finnes tur der.
- **Dekningskart:** det finnes et dekningskart (GeoJSON) for fullstendighet,
  og det kan brukes til å si hva appen ikke vet.
- **Nedlasting:** FGDB, GML, **GPX** og PostGIS, per fylke, kommune eller
  hele landet. Det er grunnlaget for et forhåndsberegnet datasett, uten kall
  per trykk. `nedlasting.geonorge.no` er ikke prøvd, fordi verten ikke er
  tillatt.
- **Begreper:** sti, turrute og turforslag er forskjellige ting. En turrute er
  «tilrettelagt med merking og/eller skilting og hvor noen har et
  vedlikeholdsansvar». Turforslag forvaltes ikke av Kartverket.

**Fra skjemaet** (`DescribeFeatureType`) [Fakta]:
- Typene er `Fotrute`, `Skiløype`, `Sykkelrute`, `AnnenRute` og
  `RuteInfoPunkt`. `Skiløype` manglet i første kjøring, og er nå med.
- Feltene som betyr noe for oppdagelse er `rutenavn`, `rutebetydning`,
  `gradering`, `spesialFotrutetype` (og tilsvarende for andre rutetyper),
  `merking`, `sesong`, `preparering`, `belysning` og `vedlikeholdsansvarlig`.

**Målt** (andre kjøring, med skiløyper):

| stopp | rutetyper | betydning | spesialtype | ruter |
|---|---|---|---|---|
| Oppegård stasjon | fot, ski, sykkel | 1 | HF | Pilegrimsleden – Borgleden, Sørmarka |
| Asker stasjon | fot, sykkel | 1 | HF | Pilegrimsled i Vestfold, Kystruta |
| Oslo S | fot | 1 | AN, KY | KyststiOslo, Rondanestien |
| Leangen stasjon | fot | 1 | HF | Pilegrimsleden – Romboleden |
| Øyer sentrum | fot | 2, 3 | AN, NT, TR | Storkjølla, 70 turer for store og små |
| Skogstadrampa, Balberglia nord | fot | – | HF | Pilegrimsleden – Gudbrandsdalsleden |

**Kodene [Fakta]**, fra produktspesifikasjonen (`register.geonorge.no`, Tur-
og friluftsruter 20171210, PDF) og skjemaet i WFS-tjenesten:
- **`rutebetydning`:** 1 = nasjonal, 2 = regional, 3 = lokal betydning,
  «etter hvor brukerne av ruta i hovedsak kommer fra», vurdert av den som
  har ansvar for vedlikehold. 1 står på Pilegrimsleden, Kystruta og
  Rondanestien.
- **`gradering`:** G = enkel (grønn), B = middels (blå), R = krevende (rød),
  S = ekspert (svart), I = ikke gradert. Se Merkehåndboka.
- **`spesialFotrutetype`:**
  - HF = historisk ferdselsvei («pilgrimsled, gammel kongevei, postveger,
    barnevandringsstier og rallarveier»);
  - KY = kyststi;
  - KT = kultursti;
  - NT = natursti;
  - TR = trimløype;
  - AN = annet.
- **`rutetype`:** 1 = hovedrute, 2 = forgreningsrute, 3 = materute.
- **`tilrettelegging`** (punktene i `RuteInfoPunkt`):

  | type | koder |
  |---|---|
  | utstyr på stedet | 4 benker/bord · 5 bro · 6 brygge · 7 bål-/grillplass · 8 båtutsettingsrampe |
  | hytter og overnatting | 12 hytte · 32 teltplass · 42 betjent hytte · 43 selvbetjent hytte · 44 ubetjent hytte · 45 gapahuk |
  | service | 13 infotavle · 14 kiosk/servering · 22 parkering · 35 toalett · 52 trimpost/turkasse |
  | bading | 30 stupebrett/badetrapp · 38 baderampe · 41 badeplass |
  | opplevelse | 46 utsiktspunkt · 50 severdighet · 51 kulturminne |
  | annet | 18 markbearbeiding · 28 skitrekk · 40 annen tilrettelegging |

  I traceren var det 8 parkeringsplasser (22), 6 infotavler (13), 1 gapahuk
  (45) og 1 benk (4). Parkeringsplassene er turstarter, og et naturlig
  adkomstpunkt for et område.

**Nedlasting [Fakta]** (`nedlasting.geonorge.no/api/capabilities/d1422d17-…`):
åpen, uten innlogging og uten e-postvarsling. Hele landet («0000») kan lastes
ned i GML, GPX, FGDB, SOSI og PostGIS, i blant annet WGS84 (4326). Hver
kommune finnes for seg (369 områder). Det gjør et forhåndsberegnet datasett
per stopp mulig, uten kall ved hvert trykk.

**Placepoint** (`docs.placepoint.no/v1/data/turrutebasen`) er en kommersiell
tjeneste som videreformidler det samme datasettet fra Kartverket via
Geonorge. Den bekrefter innholdet: turruter, skiløyper, sykkelruter og
tilrettelegging (rasteplasser, gapahuker, badeplasser, utsiktspunkter), og
nevner **Markagrensen** for Oslomarka som en tilgrensende kilde. Placepoint er
ikke et åpent API og brukes ikke. Kilden er Kartverket direkte.

Med kodene bekreftet kobler `rutebetydning` turrutene direkte til «hvor
langt» (v1.218.308). En nasjonal rute er et nasjonalt turmål, selv om den går
forbi et lokalt busstopp.

**Vurdering:**
- **Rutene er både reisemål og adkomst [Hypotese].** En navngitt, merket rute
  er et turmål i seg selv, som Pilegrimsleden. En merket rute innen 200 m av
  et friluftsområde viser også at stedet har en vei inn. Det er sterkere enn
  Valhallas gangvei til kanten.
- **`RuteInfoPunkt` er tynt.** 16 punkter på 24 stopp, og mest parkering og
  infotavler. Kodene er nå slått opp, se over.
- **Navn mangler eller er «Ukjent»** på en del ruteledd, og de tas ut.
- **Kategorien er friluftsliv og utfart,** med underkategori «turrute»
  (fot, sykkel og annet). Mapping legges i `src/opplevelser.js` når den tas i
  bruk.

## 14. Tilpasning: alder, barnefamilier og universell utforming

**Hva kildene har [Målt, 24.11]:**

| kilde | felt | dekning i stikkprøven |
|---|---|---|
| turrutebasen `tilpasning` | G gående · B barnevogn · R rullestol · S sykkel · A annet | **0 av om lag 1 170 fotruter** (Oslo, Trondheim, Bergen, Lillehammer) |
| turrutebasen `gradering` | G grønn · B blå · R rød · S svart · I ikke gradert | Oslo 237/482, Bergen 226/225, Lillehammer 94/264, Trondheim 0/203 |
| turrutebasen `underlagstype` | koder 1–3 | bare Bergen (204/225) |
| turrutebasen `belysning` | sann/usann | delvis (Bergen 160, Oslo 33) |
| turrutebasen-punkter | toalett 35 · kiosk 14 · bål 7 · badeplass 41 · baderampe 38 · benker 4 · gapahuk 45 | tynt: 16 punkter på 24 stopp |
| turrutebasen skiløype | `spesialSkiløypetype` HL: «tilrettelagt for blant annet funksjonshemmede» | ikke telt |
| Miljødirektoratet | `egnethet`, `tilgjengelighet`, `tilrettelegging` (generelle, ikke for alder) | utfylt i Oslo og Lillehammer, stort sett tomt i Trondheim |
| appen i dag | trinnfri adkomst fra stoppestedsregisteret (`src/api/stoppested.js`) og ♿ fra OSM `wheelchair` (`src/ui/fmt.js:171`) | i bruk |
| ikke prøvd | OSM `wheelchair`, `surface` og `sac_scale`; Valhallas rullestolprofil; Kartverkets høydeprofil-API | – |

Graderingstallene teller alle segmenter med verdi. Bergen har derfor flere
verdier enn ruter.

**Prinsipper [Anbefaling]:**
1. **Vis fakta, ikke dommer.** Merkene hentes rett fra kilden: «grønn rute ·
   lysløype · toalett og bålplass ved turstart». Ingen kilde sier «egnet for
   barn», så appen sier det heller ikke.
2. **Barnefamilie er et utledet filter, og merket som utledet.** «Passer for
   små bein» bygger på grønn gradering eller kort rute med lite stigning, på
   toalett, badeplass eller bålplass i nærheten, og på trinnfri adkomst.
   Raden sier hva det bygger på. Ruter uten gradering vises fortsatt, med
   «gradering ikke registrert».
3. **Universell utforming er en kjede, ikke ett merke.** Stopp trinnfritt
   (stoppestedsregisteret), gangvei uten trapp (Valhallas rullestolprofil) og
   stedet tilgjengelig (OSM `wheelchair`, og turrutebasens `tilpasning` R når
   den er utfylt). Hvert ledd vises, og det ukjente sies: «stoppet trinnfritt
   · gangvei og sted ikke kjent». Kjeden blir aldri ett grønt merke når ett
   ledd mangler.
4. **Dekningen sies høyt.** Der et felt mangler for hele området, sier appen
   det én gang: «tilpasning er lite registrert her».

**Rekkefølge:**
- **Med steg 1:** gradering, lysløype, punktene ved ruta og trinnfri adkomst
  til stoppet.
- **Neste:** prøveløp med OSM `wheelchair` og `surface`, og Valhallas
  rullestolprofil, på de 24 stoppene i traceren.
- **Senere:** filteret «passer for små bein» med høydeprofil, bare hvis
  prøveløpet viser nok data.

## 15. Skal Kartverkets kart erstatte kartene i appen?

**Spørsmål:** kan kartgrunnlaget på
kartverket.no/api-og-data/kartgrunnlag-fastlands-norge erstatte dagens kart?

**Dagens kart [Fakta]** (`src/ui/map.js`):
- Stadia Maps «Alidade Smooth», lys og mørk, med OpenMapTiles og OSM. Valgt
  som nøytral bakgrunn, så appens egne farger er det eneste mettede på kartet.
- Stadia godkjenner på registrert domene, med `VITE_STADIA_KEY` som reserve.
  Det er gratis innenfor en kvote, men det **er ikke et åpent API uten
  konto**, slik du nå ønsker.
- Oppå ligger OpenRailwayMap (spor ved zoom 16 og høyere).

**Hva siden er [Fakta]:** N50–N5000 Kartdata, altså **rådata for nedlasting**
(vektor og raster, FGDB, PostGIS, SOSI og GML). Det er ikke ferdige fliser til
et nettkart. Å bruke dem direkte krever egen kartproduksjon og egen server.
FKB, de mest detaljerte dataene, er ikke åpne.

**Det ferdige alternativet** er Kartverkets flistjeneste, prøvd 24.11:
- `cache.kartverket.no/v1/wmts/1.0.0/{lag}/default/webmercator/{z}/{y}/{x}.png`
- Lagene er `topo`, `topograatone` og `toporaster` (og `sjokartraster`).
- Den er åpen, uten nøkkel, under CC BY 4.0 med «© Kartverket».
- Den virker med Leaflet, som appen alt bruker.
- Skjermbilde: `scratchpad/kartverketProbe.mjs`.

**Funn:**

| | Kartverket | dagens Stadia |
|---|---|---|
| åpent, uten konto | **ja** | nei (konto og domene) |
| kartinnhold i Norge | **svært godt**: stier, høydekurver, stedsnavn, terreng | godt i byen, tynt i marka |
| nøytral bakgrunn | `topograatone`: ja, grå. `topo`: nei, fargerik | ja |
| mørk modus | **finnes ikke** | ja |
| utenfor Norge | **helt tomt** (Malmö: grått) | hele verden |
| turrute-laget fra Kartverket oppå | passer pent sammen (Sognsvann) | går også |

**Beslutning (produkteier 24.11):** dagens kart beholdes. Kartverkets kart
kommer som et **valgfritt** tillegg når opplevelser og turer vises.

**Vurdering [Anbefaling]:** ikke erstatt hele kartet nå. Tre grunner:
1. **Mørk modus:** appen er bygget for begge modusene, og det finnes ingen
   mørk Kartverket-variant. Å invertere flisene med CSS gir feil farger på
   vann, skog og veier.
2. **Utenfor Norge:** «ett bytte» når Malmö, Stockholm og København, og de
   kartene ville blitt tomme.
3. **Nøytral bakgrunn:** fargerik `topo` bryter med valget i `src/ui/map.js`,
   der appens egne farger er det eneste mettede.

**Derimot:**
- **Turrute-laget** (`wms.geonorge.no/skwms1/wms.friluftsruter2`, lagene
  `Fotrute`, `Skiloype`, `Sykkelrute` og `Ruteinfopunkt`) bør brukes **oppå**
  dagens kart når opplevelser vises (steg 2). Det er åpent, uten nøkkel, og
  ser riktig ut på grå bakgrunn.
- **Kartverket som valgfritt «turkart»:** appens lagvelger (knappen øverst
  til høyre på kartet) kan få et turkart med `topograatone` og turrutene i
  lys modus i Norge. Utenfor Norge og i mørk modus brukes dagens kart. Det er
  et produktvalg, ikke en erstatning.
- **Hvis kartet uansett skal være helt åpent uten konto:** da må dagens
  Stadia byttes. De realistiske åpne alternativene for hele verden og mørk
  modus er egen drift av OSM-fliser eller vektorfliser, for eksempel
  OpenFreeMap eller Protomaps (ikke prøvd). OSMs egne fliser
  (`tile.openstreetmap.org`) er ikke ment for apper i drift. Det er en egen
  avgjørelse, og en egen tracer.

## 16. Implementasjonsplan (avtalt 24.11, før PR)

**Rammer:**
- **Kilder:** bare åpne kilder uten nøkkel: Kartverkets turrutebase,
  Miljødirektoratet og Wikidata. «© Kartverket» vises der dataene vises.
- **Kart:** dagens kart beholdes. Kartverket er et valgfritt tillegg.
- **Datamodell:** stopp og reisemål holdes fra hverandre. Opplevelsene slås
  opp på stopp-id-en, og ingenting i dagens opsjoner eller kort endres. Et
  sted uten opplevelser står som i dag.
- **Én definisjon:** all mapping fra kilde til kategori skjer i
  `src/opplevelser.js`.

**Steg 1 – på stedsradene under et valgt «ett bytte»-kort:**
- **Innhold:** høyst to opplevelser per sted, for eksempel
  «Pilegrimsleden · nasjonal turrute · ved stoppet» og
  «Ringve Musikkmuseum · museum · 19 min å gå». Faktamerker fra §14, som
  gradering, lysløype, toalett og trinnfritt stopp. Gangtid bare når Valhalla
  har svart.
- **Ny kode:** `src/api/opplevelserKilder.js` med turrutebasen,
  Miljødirektoratet og Wikidata, med frist og cache per stopp i 24 timer.
- **Utvidet kode:** `src/opplevelser.js` får mapping for turrutebasen
  (`rutebetydning`, `spesialFotrutetype`, `tilrettelegging`, `gradering`),
  sammenslåing og `velgVisning`.
- **Henting:** samme 8 steder som reisene hentes for i dag. Høyst 24 kall
  per kortvalg.
- **Kart:** når en opplevelse eller tur vises, kan turrute-laget fra
  Kartverket (`wms.geonorge.no/skwms1/wms.friluftsruter2`) legges på dagens
  kart. Det er **av som standard** og slås på med en knapp. Valget huskes.
  Laget følger reglene i `docs/kartregler.md`.

**Steg 2 – opplevelse som dimensjon** (hvis steg 1 viser verdi):
- fasetten «se etter: opplevelse», kombinert med «hvor langt»
  (`rutebetydning` 1/2/3);
- valgfritt **turkart** i kartets lagvelger: `topograatone` fra
  `cache.kartverket.no`, sammen med turrute-laget;
- bare i lys modus og bare innenfor Norge. Ellers brukes dagens kart, og
  knappen sier hvorfor.

**Steg 3 – ferdig utregnet datasett:** turrutebasen for hele landet (GPX eller
GML), Miljødirektoratets områder per fylke og Wikidata. Ukentlig bygg, én fil
per fylke, slik at alle stedene i «ett bytte» får opplevelser uten nye kall.

**Senere:**
- parkering og turstart som adkomstpunkter;
- OSM-tagger via Overpass;
- sesong;
- dekningskartet for turrutebasen;
- kjeden for universell utforming (§14).

## Avgrensninger

- **Utvalget:** 24 steder fra 4 utgangspunkter, én tid (Entur-opptakene). Det
  er ikke representativt for ferge eller fleksible linjer.
- **Relevansreglene** er mine og er stilt inn på dette utvalget. De
  negative eksemplene viser hvor de bommer.
- **Relasjoner i OSM** (store naturområder lagt inn som relasjoner) mangler i
  `map`-kallet. Noen nasjonalparker og reservater kan derfor mangle.
- **Navn** brukes som de kommer fra kilden, uten språkvask. Malmö har svenske
  navn.
