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

**Steg 1 – på stedsradene under et valgt «ett bytte»-kort** (bygget i
v1.218.313, se `docs/auto-tavle-logikk.md`):
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

## 17. Prototype: opplevelseskort (25.11, ingen appendring)

**Bakgrunn:** en ekstern vurdering anbefalte å vise muligheter og ikke
POI-kategorier, med fire innganger og kollektivtilgang på kortet.

**Filer:**
- `scratchpad/prototype/opplevelseskort.html` (står alene, åpnes i nettleser);
- `hentReiser.mjs` henter ekte data;
- `lagSide.mjs` lager siden;
- `data.json` er grunnlaget.

**Data:** 12 opplevelser fra tracerens steder, spredt på fire
utgangspunkter. Reisesøket er ekte (Entur, avreise 25.11 kl. 10), gangen er
målt med Valhalla, og beskrivelsene kommer fra Wikidata. Ingen tall er
oppdiktet.

**Det prototypen viser:**
- **Fire innganger** over de sju kategoriene (natur og friluftsliv,
  severdigheter, kultur og historie, aktiviteter og rekreasjon). Et sted kan
  høre til flere, for eksempel Sola ruinkirke og Operahuset.
- **Underfiltre** bare inni valgt inngang. For natur er det for eksempel
  gåtur, tur i skog og mark, tur til vannet og naturopplevelse.
- **Aktivitet** er utledet fra kilden: fotrute gir gåtur, marka gir tur i
  skog og mark, alpinsenter gir ski, museum gir museumsbesøk.
- **Kortvarianter:**
  - **A**, tett rad som i dag;
  - **B**, kort med hva, hvorfor og hvordan;
  - **C**, B pluss «enkel», «mulig» eller «krevende», med grunnlaget i
    parentes.
- **Kart:** en prikk velger samme kort.

**Funn [Målt]:**
- **«Hvorfor» er tynt.** Bare 5 av 12 har en beskrivelse i Wikidata, og 3 er
  på norsk. Resten har bare kildens fakta («Svært viktig
  friluftslivsområde», «nasjonal turrute · historisk ferdselsvei»), eller
  ingenting, som Lilleputthammer. En kortversjon som krever en
  beskrivelsestekst, blir halvtom.
- **Kollektivtilgangen skiller stedene tydelig fra hverandre.**
  - Nøstvetmarka: 43 min og 1 bytte, så 9 min gange.
  - Moldøen: 7 t 25 min.
  - Operahuset (fra Ranheim): 3 bytter, med fly.
  - Pilegrimsleden ved Skogstadrampa: **ingen kollektivreise i søket**.
    Gange hele veien tar 58 min, selv om stedet er 1,2 km unna i luftlinje.
- **Ordene enkel, mulig og krevende** kan forklares fra dataene (reisetid,
  bytter og målt gange), og grunnlaget står ved siden av. Grensene er satt
  av meg: enkel er inntil 45 min, høyst 1 bytte og inntil 15 min gange. De
  er ikke prøvd på brukere [Hypotese].
- **Kartet over fire utgangspunkter blir hele landet.** I appen gjelder ett
  utgangspunkt, så kartet blir regionalt.
- **Gangtid:** målt for alle 12.

**Vurdering [Anbefaling]:** variant B med C-ordene for tilgang. Teksten
under navnet må tåle at beskrivelsen mangler: fakta og aktivitet bærer
kortet, og beskrivelsen er et tillegg.

## 18. Implementeringsplan: opplevelseskort i «ett bytte» (godkjent 25.11 med presiseringer, kode venter på ny godkjenning)

**Beslutninger 25.11:**
1. Kortvariant B, med tilgangsordene fra C.
2. Beskrivelsen er valgfri.
3. Grensene for tilgang er foreløpige hypoteser.
4. Fritid-skjermen forblir egen, for mat og handel.

### Avklaringene

**1. Transportmiddel [Fakta, lest og målt]**
- Appens reisesøk (`tripGQL` i `src/api/queries.js`, brukt av «ett bytte»
  via `reisesøkGql`) spør bare om `metro, bus, tram, rail, water`, og
  `coach` når den er tillatt. **Fly er ikke med i appen.** Flyet i prototypen
  kom fra mitt eget skript, som ikke satte `transportModes`. Feil i
  prototypen, ikke i appen.
- Nettverket bak «ett bytte» (`BOARD_MODES_COACH`) har også `taxi`, som er
  Enturs bestillingstransport (for eksempel linje 5031 ved Tretten).
  Bestillingstransport er kollektivtilbud, men må bestilles på forhånd, og
  kortet skal si det.
- **Gange** er alltid en egen etappe på kortet (`mode: foot`), aldri en del av
  «kollektiv».

**2. Manglende reise, undersøkt ved Skogstadrampa [Målt]**
- **Startpunktet** er opptakets utgangspunkt på Tretten (61.3125, 10.3005).
  **Endepunktet** er plattformen NSR:Quay:21850 ved E6-rampa.
- **Ruten:** Entur sier 3 431 m og 58 min, og Valhalla sier 3 385 m og 60 min,
  langs Sør-Trettenvegen opp lia. De to ruterne er enige. **1,2 km i
  luftlinje var misvisende**, og gangtiden er reell.
- **Avganger:** holdeplassen har tre bussavganger den dagen (linje 543 kl.
  07.55, 13.25 og 14.59) og bestillingstransport om kvelden. Søket kl. 10
  fant ingen reise fordi neste buss gikk 13.25, **ikke fordi stedet er
  utilgjengelig**.

### Presiseringer 25.11 (innarbeidet under)
1. **Dato og klokkeslett** for reisesøket vises, ikke bare klokkeslett.
2. **Regelen for «framme ca.»** er dokumentert under. Den bruker faktisk
   ankomst fra reiseplanen, og legger bare til gangtid når den gjelder
   samme stopp. Estimater merkes som omtrentlige.
3. **Tilgangsordene** er justerbare hypoteser. Råverdiene er alltid synlige,
   og ordene påvirker ikke utvalg eller rekkefølge.
4. **Bestillingstransport** merkes som transport som krever bestilling, aldri
   som ordinær buss.
5. **Datagrunnlaget kontrolleres** før kortet lages: startpunkt, målestopp,
   valgt reiseplan, søketidspunkt, transportmidler og type gangmåling.

### Hva som gjenbrukes (mekanismen endres ikke)
- **Opplevelser:** `hentOpplevelser`, `opplevelserVed`, `velgVisning`,
  `fasiliteterVed` og `hentGang` (`src/api/opplevelserKilder.js`,
  `src/opplevelser.js`). Kildene og reglene er de samme.
- **Reisen til stoppet:** det reisesøket «ett bytte» alt gjør per sted
  (`sjekkSted` → `sjekkReise`, med radene fra `reiseRader` i
  `src/reiseTil.js`: gå om, linjer, bytter og framme). Opplevelseskortet
  **leser** denne reisen, og spør ikke på nytt. Én definisjon.
- **Stedene:** 8 per valgt kort (`SJEKK_STEDER`). «Ett bytte» finner dem som
  før.
- **Kart:** `ettBytteKart` og turrute-laget (av som standard).
  `docs/kartregler.md` gjelder.

### Datagrunnlaget kortet leser (kontrolleres, `grunnlag()`)
Kortet lager ingen egne søk mot Entur. Det leser oppslaget «ett bytte» alt
har gjort per sted (`_sjekk` i `src/views/ettBytteVisning.js`):

| felt | kilde i dag | kontroll |
|---|---|---|
| startpunkt | `t.pos`, utgangspunktet for «ett bytte», sendt til `reisesøkGql` | lagres på oppslaget (`fra: {lat, lon}`). Kortet sier «fra der du står» |
| målestopp | `stedId` (samlestoppet i `destinations[0].id`) | siste kollektive etappe må ende ved samme samlestopp (`toPlace.quay.stopPlace.id` eller samlestoppet over det). Avviker den, vises ingen reiseverdi, bare «reisen ender et annet sted» |
| valgt reiseplan | første kollektive rad fra `reiseRader(tps, nå)`, sortert etter ankomst | lagres som `tp` med id-en (`tp` og `reiseRader` finnes). Samme plan brukes i kort, rad og avgangsdetaljer |
| søketidspunkt | `nå` på oppslaget (`s.tid`), som også er `dateTime` i spørringen | vises som dato og klokkeslett. Er det mer enn `SJEKK_GYLDIG_MS` (10 min) gammelt, hentes det på nytt, som i dag |
| transportmidler | `transportModesGql`: metro, bus, tram, rail, water (+ coach) | kontrolleres i svaret: en etappe med `air` (eller noe utenfor listen) avviser planen. `taxi` gir bestillingstransport |
| gangmåling | `hentGang` (Valhalla, lengden målt på linja) | `målt` (Valhalla), `luftlinje` (anslag) eller `ingen`. Typen står på kortet |

`grunnlag(oppslag, sted)` er en ren funksjon som gir
`{ ok, avvik: [...], fra, stopp, plan, søkt, moduser, gang }`. Avvik står i
loggen og gjør verdien på kortet tom. Det gjetter aldri.

### Regel for «framme ca.» (`samletTid`)
1. **Ankomst ved stoppet** er siste etappes faktiske ankomst i reiseplanen
   (`expectedEndTime`, ellers `aimedEndTime`), slik `reiseRader` alt leser
   den (`ank`). Den regnes aldri ut fra reisetid.
2. **Gangtiden** legges bare til når den er **målt** (`kilde: 'målt'`), og
   bare når den gjelder **samme samlestopp** som reiseplanen ender ved
   (kontrollert i `grunnlag`). Gangen må starte i stoppets punkt (samme
   koordinater som `hentGang` brukte).
3. Mangler eller avviker en del, fordi det ikke finnes noen reise, gangen ikke
   er målt, eller planen ender ved et annet stopp, vises **ingen samlet
   tid**. Delverdiene vises fortsatt hver for seg.
4. Klokkeslettet er `ank + gang.min`, avrundet opp til nærmeste minutt, og
   vises som **«framme ca. HH:MM»**. Det er et anslag, fordi gangen er målt
   til stedets nærmeste punkt eller kant, ikke til en inngang.
5. Reisetid og gangtid legges **aldri** sammen til ett tall i minutter. Bare
   ankomsttidspunktet vises.

### Endringer i datamodellen (rene funksjoner i `src/opplevelser.js`)
- **`INNGANGER`:** de fire inngangene over de sju kategoriene. Et sted kan
  høre til flere.
- **`aktiviteter(o)`:** utledet fra kildene, som i prototypen. Fotrute gir
  gåtur, skiløype gir skitur, marka gir tur i skog og mark, museum gir
  museumsbesøk og så videre. Aldri fritekst.
- **`beskrivelse`:** Wikidatas `schema:description`, på norsk og ellers
  engelsk merket «(engelsk)», i samme SPARQL-kall. Valgfri.
- **`reiseTilStoppet(rad, søkt)`:**
  `{ min, går, framme, bytter, linjer, moduser, søkt, bestilling }`.
  - `moduser` er bare kollektive etapper.
  - Mønstre med en etappe som ikke er tillatt (`air` og andre utenfor listen)
    avvises som et forsvar, selv om spørringen ikke ber om dem.
  - `bestilling` er sann når en etappe er `taxi`, altså bestillingstransport.
    Linjen vises da som «bestillingstransport · må bestilles», aldri som
    buss.
- **`gangFraStopp`:** `{ m, min, kilde: 'målt' }` fra `hentGang`, eller
  `{ luftM, kilde: 'luftlinje' }`. Aldri en påstått gangtid.
- **`samletTid(grunnlag)`:** etter regelen over. Den gir `{ framme, omtrent:
  true }` eller `null`.
- **`TILGANG_GRENSER`:**
  `{ enkel: { reiseMin: 45, bytter: 1, gangMin: 15 }, mulig: { 120, 2, 25 } }`,
  merket som hypotese i koden og i rapporten.
- **`tilgang(reise, gang, grenser)`** gir `{ ord, verdier }`.
  - Ordet er avledet fra verdiene, og verdiene vises alltid ved siden av.
  - Uten reise eller gange blir ordet aldri «krevende»: da står «ukjent».
  - **Tilgangsordet påvirker aldri rekkefølge eller utvalg.** `velgVisning`
    rører det ikke.

### Presentasjonen (`src/views/ettBytteVisning.js` og `src/style/ettBytte.css`)
Under hver stedsrad står dagens reiserad, **uendret**. Under den står høyst to
opplevelseskort, som erstatter dagens linje fra v1.218.313. Hvert kort har:
- **navn**, og **hva** (underkategori) · **aktiviteter** som merker;
- **beskrivelse** når den finnes, med kilde. Mangler den, står ingenting, ikke
  «ingen beskrivelse»;
- **tre verdier, hver med etikett:**
  - «reise til stoppet»: 43 min · 1 bytte (linjene står i reiseraden over);
  - «gange fra stopp»: 9 min, målt, eller «ca. 600 m i luftlinje»;
  - «framme ca.» klokkeslett, bare når `samletTid` finnes;
- **tilgangsordet med verdiene:** «enkel (43 min, 1 bytte, 9 min gange)»;
- **fasiliteter** fra turrutebasen;
- **kilder.**

**Tidsinformasjon:** én linje over lista: «reisetider gjelder søk onsdag
25.11. kl. 10.00 fra der du står». Den viser dato og klokkeslett, og
fornyes når reisene hentes på nytt (cache 10 min, som i dag). Over
midnatt eller neste dag viser datoen det.

**Manglende reise:** «ingen kollektivreise i søket onsdag 25.11. kl. 10.00.
Det betyr ikke at stedet ikke kan nås». Har Entur en verifisert gangrute (`directMode: foot`,
ett ekstra kall, bare i dette tilfellet), står også «gange hele veien: 58 min
(3,4 km, Entur)».

**Bestillingstransport:** merket «bestillingstransport · må bestilles» på
kortet og i verdien «reise til stoppet». Den teller ikke som ordinær buss i
tilgangsordet: det står «ukjent» når hele reisen bygger på
bestillingstransport.

**Innganger:** fire knapper over stedslista under et valgt kort, av som
standard («alle»). Knappene filtrerer bare **hvilke opplevelser** som vises,
aldri **hvilke steder** eller kort «ett bytte» finner.

### Kart og liste: samme valgte opplevelse
- **Én tilstand:** `_valgtOpplevelse = { stedId, navn }` i
  `ettBytteVisning.js`.
- **Prikker:** når et kort er valgt, får opplevelsene (de viste, høyst 16)
  prikker i inngangens farge på kartet, sammen med dagens steder.
- **Trykk på en prikk** setter tilstanden, tegner lista og ruller kortet inn
  i bildet (`scrollIntoView`, nærmeste).
- **Trykk på et kort** setter tilstanden og fremhever prikken. Kartet
  **flyttes ikke** hvis brukeren har rørt det (`docs/kartregler.md`). Ellers
  panoreres det bare hvis prikken er utenfor bildet.
- **Nullstilling:** nytt kort, nytt sted eller av-valg nullstiller tilstanden.

### Tester
- **Kollektivtransport:**
  - spørringen inneholder bare tillatte transportmidler og aldri `air`;
  - et mønster med en `air`-etappe avvises;
  - `taxi` gir «bestillingstransport».
- **Gange:**
  - målt gange vises som «N min», luftlinje som «ca. N m»;
  - Skogstadrampa-fiksturen (Entur 3 431 m og 58 min, Valhalla 3 385 m) gir
    «gange hele veien: 58 min» bare når kollektivreise mangler.
- **Bytter:** antall bytter er antall kollektive etapper minus 1. Gange mellom
  etapper teller ikke.
- **Tid:**
  - `samletTid` er `null` når gange ikke er målt eller reise mangler;
  - klokkeslettet er stoppets framme pluss målt gange;
  - søketidspunktet vises.
- **Tilgang:**
  - grensene leses fra `TILGANG_GRENSER`;
  - verdiene står alltid ved siden av ordet;
  - uten data blir ordet «ukjent», ikke «krevende»;
  - `velgVisning` gir samme rekkefølge med og uten tilgang (mutanttest).
- **Kart og liste:** prikk → kort og kort → prikk bruker samme tilstand, og
  kartet flyttes ikke etter at brukeren har rørt det.
- **Datagrunnlag (`grunnlag`):**
  - planen ender ved et annet samlestopp: avvik «målestopp», og ingen
    reiseverdi;
  - planen har en `air`-etappe: avvik «transportmiddel», og planen avvises;
  - oppslaget er eldre enn 10 min: nytt søk;
  - fra-koordinatene på oppslaget er de samme som `reisesøkGql` fikk;
  - samme `tp` brukes i kortet og i reiseraden (identitet).
- **Framme ca.:**
  - ankomsten er `expectedEndTime` fra planen, ikke starttid pluss varighet
    (fikstur der de to er forskjellige);
  - gange fra et annet stopp enn planens legges ikke til;
  - luftlinje legges aldri til;
  - teksten har alltid «ca.»;
  - det finnes ikke noe samlet tall i minutter i HTML-en.
- **Søketidspunkt:** dato og klokkeslett i norsk form, også over midnatt
  (fikstur kl. 23.50 med ankomst neste dag).
- **Bestillingstransport:** en `taxi`-etappe gir «bestillingstransport · må
  bestilles», aldri ordet «buss», og tilgangsordet blir «ukjent».
- **Uendret:** eksisterende tester for «ett bytte», reiserader, «hvor langt»
  og tidsvindu går gjennom.

### Akseptansekriterier
1. Et valgt «ett bytte»-kort gir de samme stedene og reiseradene som før.
2. Hvert opplevelseskort viser reise til stoppet, gange fra stoppet (med
   målingstype) og bare «framme ca.» når regelen tillater det.
3. Søkets dato og klokkeslett står over lista.
4. Ingen fly. Bestillingstransport står merket.
5. «Ingen kollektivreise i søket …» står aldri som «utilgjengelig».
6. Tilgangsordet står alltid med verdiene, og rekkefølgen er lik med og uten
   ordet.
7. Et trykk på en prikk ruller fram kortet, og et trykk på kortet fremhever
   prikken. Kartet flyttes ikke etter at brukeren har rørt det.
8. I nettleseren mot ekte Entur (Mortensrud og Tretten), lys og mørk modus,
   390 px, uten feil i konsollen.

### Filer
| fil | endring |
|---|---|
| `src/opplevelser.js` | nye rene funksjoner (under). Ingen endring i dagens |
| `src/api/opplevelserKilder.js` | Wikidata-spørringen får `schema:description`. Ingen nye kall |
| `src/views/ettBytteVisning.js` | lagrer `fra`, `søkt` og `tp` på oppslaget, tegner kortene, prikker og valgt opplevelse |
| `src/style/ettBytte.css` | kortstil, gjenbruker appens farger |
| `tests/opplevelseskort.test.js` (ny) | testene over |
| `tests/fixtures/opplevelser/` | to nye fiksturer: Skogstadrampa med fotrute og avganger, og en reiseplan med bestillingstransport (ekte svar) |
| `docs/auto-tavle-logikk.md` | avsnittet om opplevelser oppdateres |

**Rene funksjoner som legges til:**
- `INNGANGER`
- `innganger(o)`
- `aktiviteter(o)`
- `grunnlag(oppslag, sted)`
- `reiseTilStoppet(plan)`
- `gangFraStopp(gang, luft)`
- `samletTid(grunnlag)`
- `TILGANG_GRENSER`
- `tilgang(reise, gang, grenser)`
- `søkTekst(ms)` (dato og klokkeslett)
- `kortData(o, grunnlag)` (alt kortet viser, uten HTML)

**Dataflyt:**
1. Kort velges → `velgRetning`.
2. For hvert av de 8 stedene:
   - `sjekkSted` kjører reisesøket som i dag, og lagrer `fra`, `søkt` og
     `tp`;
   - `hentOpplevelser` henter de tre kildene.
3. `velgVisning` velger høyst 2 opplevelser.
4. `hentGang` måler gangen for dem.
5. `grunnlag` kontrollerer.
6. `kortData` setter sammen.
7. `opplevelseskortHtml` tegner lista, og `ettBytteKart` tegner prikker fra
   samme `kortData`.
8. Begge leser og skriver `_valgtOpplevelse`.
- **I nettleseren:** mot ekte Entur fra Mortensrud og Tretten (tynt tilbud),
  i lys og mørk modus på 390 px.

### Hva som uttrykkelig ikke endres
- **Mekanismen som finner steder:** `utforsk`, `ettByttePer`, fasettene,
  «hvor langt», tidsvinduet, `SJEKK_STEDER` og reisesøket (`reisesøkGql` og
  `tripGQL`, inkludert transportmidlene).
- **Reiseraden** (`_kombiRadHtml`) og klikket som åpner avgangsdetaljene.
- **Kildene, mappingen og relevansreglene** i `src/opplevelser.js`. Bare nye
  funksjoner legges til.
- **Grunnkartet** (Stadia). Turrute-laget forblir valgfritt.
- **Fritid-skjermen** (`src/views/leisure.js`) og `src/api/places.js`.
- **`velgVisning`, `erReisemål` og mappingen.** Tilgangsordet leses aldri der.

## Avgrensninger

- **Utvalget:** 24 steder fra 4 utgangspunkter, én tid (Entur-opptakene). Det
  er ikke representativt for ferge eller fleksible linjer.
- **Relevansreglene** er mine og er stilt inn på dette utvalget. De
  negative eksemplene viser hvor de bommer.
- **Relasjoner i OSM** (store naturområder lagt inn som relasjoner) mangler i
  `map`-kallet. Noen nasjonalparker og reservater kan derfor mangle.
- **Navn** brukes som de kommer fra kilden, uten språkvask. Malmö har svenske
  navn.
