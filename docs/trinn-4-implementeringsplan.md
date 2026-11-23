# Trinn 4: implementeringsplan for nettverksutforskeren

Plangrunnlaget, steg 2. Planen bygger på:
- `docs/opsjonsmodell.md` (kontrakten);
- `docs/nettverksdemonstrator.md` (målingene);
- `docs/trinn-3-5-produktevaluering.md` (evalueringen);
- arkitekturbeslutningene som ble tatt etter evalueringen.

**Status: plan. Ingenting er implementert.**

Merking: **[Kode]** finnes i koden i dag, **[Målt]** er målt i trinn 3 eller
3.5, **[Beslutning]** er gitt av produkteier, og **[Forslag]** er
denne planens valg, som kan endres.

---

## 0. Grunnprinsipper

**Ansvarsfordelingen:**

| komponent | ansvar |
|---|---|
| oppdageren | finner muligheter |
| opsjonsmodellen | representerer hva en mulighet er |
| reisesøket | bekrefter konkrete realiseringer |
| `mulighetsoppdagelse.js` | vurderer relevans |
| presentasjonen | viser |

**Begrepene holdes adskilt.** Ingen av dem er automatisk en opsjon.

| begrep | hva det er | hvor det bor |
|---|---|---|
| kollektivtilbud | en linje med transportmiddel som går fra et tilgangspunkt | `transport_offer`-opsjon [Kode] |
| linjeretning | linje + skiltet retning (`lineId` + `destinationDisplay`) | **gruppering** i oppdagelsesresultatet [Beslutning] |
| geografisk område | kompassretning × avstandsbånd fra posisjonen | **gruppering** [Beslutning] |
| tilgangspunkt | et stopp du når fra posisjonen, med luftlinje, gangvei og gangtid | `accessPoints[]` [Kode] og resultatets `tilgang[]` |
| gangforbindelse | gange mellom to stopp, målt med reisesøk | **kant** i resultatets nettverk. Blir en etappe (`mode: 'foot'`) i en realisering. |
| reiseforbindelse | konkret kjede av etapper | `connection`-opsjon, eller en realisering av en opsjon [Kode] |
| opsjon og realiseringer | hva man kan gjøre, og konkrete måter å gjøre det på | `src/opsjonsmodell.js`, uendret |

**Opsjonsmodellen endres ikke** [Beslutning]. Det dokumenterte behovet fra
3.5 §4, punkt 1 (å kunne knytte en destinasjon til en retning og et område)
løses *utenfor* modellen. Oppdageren leverer en grupperingsindeks ved siden av
opsjonene, og hver sti får linjeretningen i den eksisterende fritekstnøkkelen.

---

## 1. Ansvarsgrensen til `src/nettverksutforsker.js`

**Ansvar**
1. Finne tilgangspunkter fra en posisjon, med luftlinje, gangvei og gangtid
   hver for seg.
2. Lese nettverket i høyst to ledd fra tilgangspunkter og knutepunkter, med
   søkehorisont per transportmiddel og hyppighet.
3. Finne avgrensede gangforbindelser mellom stopp og knutepunkter (§4).
4. Velge knutepunkter etter *ny dekning* (§5).
5. Bygge kandidatopsjoner med full proveniens og grupperingsindeks.
6. Rapportere hva som **ikke** ble undersøkt, og hvorfor.
7. Holde budsjett, cache og feil (§7).

**Ikke ansvar** [Beslutning]
- avgjøre relevans, rangere eller bestemme hva brukeren ser;
- kjenne til snarveiene (`reiseoppgaver.js`);
- gjøre reisesøk for å bekrefte. Det er et eget steg (§8) i egen modul;
- slette kandidater, stier eller tilgangspunkter for å forenkle;
- bruke rekkevidde (`scope`) til noe annet enn metadata;
- fly.

**Arkitekturgrenser**, håndhevet i `tests/arkitektur.test.js`:

```
nettverksutforsker.js → opsjonsmodell.js, haversine.js, api/queries.js, api/stopCats.js, api/stops.js (bare rene byggere/parsere)
nettverksutforsker.js ↛ reiseoppgaver.js, mulighetsoppdagelse.js, views/*, ui/*
reisebekreftelse.js   → opsjonsmodell.js, api/queries.js, api/adapt.js
reisebekreftelse.js   ↛ nettverksutforsker.js (overleveringen er data, ikke import)
```

**Nett gjennom injeksjon** [Forslag]: `utforsk(ktx, { hent })`, der `hent(navn,
spørring)` gjør selve kallet. Det samme mønsteret brukes for testbar kode i
appen. Testene kjører uten nett, og proben kan bruke den ekte `fetch`.

## 2. Oppdagelsesresultatet og overleveringen

`utforsk(ktx)` returnerer **ett objekt**. Feltene står i tabellen under.
Skissen etter tabellen viser hvordan de henger sammen.

| felt | innhold |
|---|---|
| `oppdagelse` | `nyOppdagelse(...)` + `parametre` + `kall[]`. Kontekst og hvordan søket ble gjort. |
| `tilgang` | tilgangspunkter med `{ luftM, gangM, gangMin, kilde: 'reisesøk' \| 'ukjent' }` |
| `kanter` | gangforbindelser `{ fra, til, gangM, gangMin }`, bare målte |
| `knutepunkter` | `{ valgt[], vurdert[], grunn }`. Alle kandidater og hvorfor de ble valgt eller ikke. |
| `opsjoner` | kandidatopsjoner, gyldige etter `avvik()` |
| `grupper` | grupperingsindeksen: `linjeretning`, `område` og `tilbud`. Ingen av dem er opsjoner. |
| `ikkeUndersøkt` | eksplisitt liste over hva som ikke ble undersøkt, med grunn |
| `natt` | døgntilbudet når vinduet er (nesten) tomt, se §6 |

```
{
  oppdagelse: { id, posisjon, tid, tilgangspunkter, parametre, kall: [{navn, ms, feil}] },
  tilgang:    [{ ...tilgangspunkt, luftM, gangM, gangMin, kilde: 'reisesøk'|'ukjent' }],
  kanter:     [{ fra, til, gangM, gangMin }],                 // bare målte gangforbindelser
  knutepunkter: { valgt: [...], vurdert: [{ id, navn, nyeLinjeretninger, nyeOmråder, nyeModi, grunn }] },
  opsjoner:   [opsjon, …],                                    // gyldige etter avvik()
  grupper: {
    linjeretning: { '<lineId>><retning>': { modus, tilgang:[…], knute: id|null, destinasjoner:[opsjonsId…] } },
    område:       { '<sektor>|<bånd>': { destinasjoner:[opsjonsId…], linjeretninger:[…] } },
    tilbud:       { '<transport_offer-id>': { linjeretninger:[…] } },
  },
  ikkeUndersøkt: [{ hva, grunn }],   // f.eks. «knutepunkt X: utenfor kallbudsjett», «vindu 60 min: tog etter 13:00»
  natt: { døgntilbud: {...} } | null,
}
```

**Til opsjonsmodellen**
- Opsjonene bygges med `nyOpsjon`/`samle` uendret.
- Hver sti får `lineId` som `"<lineId>><retning>"`, eller
  `"<a>><r1>+<b>><r2>"` for to ledd. Feltet er fritekst i kontrakten, og
  linjeretningen er da sporbar uten modellendring.
- `discovery[].oppdagelse` peker til `oppdagelse.id` [Kode].

**Videre**
- `grupper` og `tilgang` er data til utvelgelsen (§8) og til
  `mulighetsoppdagelse.js`.
- Relevanslaget kan folde destinasjoner til linjeretninger og områder uten
  at modellen vet om det.

## 3. Linjeretninger og områder

**Linjeretning** [Forslag]
- Nøkkelen er `lineId + '>' + destinationDisplay.frontText`.
- Hvert kall i ledd 1 og ledd 2 legger destinasjonene sine inn i gruppen.
- Linjeretningen er *strukturen* som gir svar på hvilke handlinger som
  finnes. Målt fra Mortensrud: ~122 linjeretninger mot 1 067 destinasjoner,
  med median 15 destinasjoner per linjeretning.

**Område** [Forslag]
- 8 kompassretninger × 5 avstandsbånd fra posisjonen (0–5, 5–15, 15–50,
  50–150 og 150+ km), som i evalueringen.
- Båndene **skaleres med stedet** (AGENTS.md: hele dekningsområdet). Det
  første båndet følger `båndFor` (`src/api/stops.js`) i stedet for en fast
  grense på 5 km. Det må måles i Tretten (bygd) før grensene låses.
- Én navngitt definisjon: `OMRÅDE_SEKTORER` og `OMRÅDE_BÅND` i
  `nettverksutforsker.js`, bundet av test og omtalt i dokumentasjonen.

**Bruk**
- Utvelgelsen (§8) dekker variasjon i dem.
- Knutepunktvalget (§5) måler ny dekning i dem.
- `mulighetsoppdagelse.js` kan senere folde på dem.
- De blir **ikke** opsjoner, filtre i `filtrerRetning` eller rangering.

## 4. Tilgangspunkter og gangforbindelser

**Fire størrelser holdes adskilt** [Beslutning]:

| størrelse | felt | kilde | bruk |
|---|---|---|---|
| luftlinje | `luftM` (`distanceM` i modellen) | `metresBetween` | bare søkeheuristikk |
| gangavstand | `gangM` | reisesøk `directMode: foot` | egenskap |
| gangtid | `gangMin` (`walkMin` i modellen) | samme reisesøk | egenskap, og grunnlag for «nær» |
| kollektivforbindelse | etappe i realisering | reisesøk | når gange ikke er rimelig |

**Tilgangspunkter, i tre steg** [Forslag]
1. **Søk romslig.** Geokoderen (`layers=venue`) gir stopp innen
   `SØK_TILGANG_M`. Utgangspunktet er 1 500 m, og det kan variere med
   `båndFor`. Treffene sorteres stasjoner først, så etter luftlinje, til
   `TILGANG_MAKS` (~15).
2. **Mål gangtid.** Ett aliasert reisesøk med `directMode: foot` til alle
   kandidatene. Målt: 12 mål på 0,2 s i ett kall [Målt].
3. **Klassifiser:**
   - `gangMin ≤ GANG_NÆR_MIN` gir et **tilgangspunkt**. Ledd 1 leses derfra.
   - Lengre gange gir ikke et tilgangspunkt. Stoppet blir et **mulig
     knutepunkt nådd med kollektiv**. Hauketo skal komme inn i ledd 1 som et
     stopp videre fra buss 73, ikke som noe som er nær fordi luftlinjen er
     kort [Beslutning].
   - `GANG_NÆR_MIN` skal skalere med tettheten, for eksempel 10 min i by og
     15–20 min på bygda. Startverdien kalibreres mot de fire stedene. Den er
     ikke en sannhet.
   - Feiler gangmålingen, beholdes punktet med `kilde: 'ukjent'` og
     luftlinjen. Det står da i `ikkeUndersøkt`.

**Gangforbindelser mellom stopp (avgrenset)** [Forslag]
- **Hva:** fra hvert *valgt knutepunkt* ser oppdageren etter stopp med et
  annet transportmiddel eller andre linjeretninger innen `GANG_KANT_M` (~500 m
  luftlinje som heuristikk). Den måler gangtiden i ett aliasert reisesøk.
  Er gangtiden innenfor `GANG_KANT_MIN`, blir det en kant, og stoppet blir et
  ekstra utgangspunkt for ledd 2.
- **Hvorfor:** Bergen stasjon. Den nås ikke av noen linje fra Nesttun, men
  ligger trolig gangavstand fra Bybanens endestopp [Hypotese som skal måles
  først, se §11].
- **Grense:**
  - bare fra valgte knutepunkter, aldri fra alle stopp;
  - høyst `GANG_KANT_MAKS` per knutepunkt;
  - ett nærhetsoppslag og ett gangsøk per utforskning.
- **Gjenbruk:** nabostopp innen 640 m (`knutepunkt`, `TAVLE_GANG_M` [Kode])
  løser det samme i tavla. Oppdageren skal bruke samme definisjon av
  «nabostopp» i stedet for å skrive en ny. Den undersøkes i R2 (§11).
- **Datakilde for nærhet:** geokoderen eller `stopPlacesByBbox`
  (`src/api/quays.js` [Kode], ikke prøvd mot Entur). Det må probes med
  fallback.

## 5. Knutepunkter

[Beslutning] Modusskifte er ikke et krav. Knutepunkter velges etter hva de
åpner, og kall skal ikke brukes på knutepunkter som bare gir dubletter.

**Fremgangsmåte** [Forslag]
1. **Kandidater.** Samlestopp som ledd 1 når (`stopPlaces(ids){parent
   quays{lines}}`, som i demonstratoren). Til det kommer stopp med lang gange
   fra §4.
2. **Forhåndsfilter**, billig og uten kall. Kandidaten må ha linjer som ikke
   allerede er representert i ledd 1, ifølge `quays.lines`. Kandidater med
   bare kjente linjer får grunnen «bare kjente linjer» og spørres ikke.
   Målt: de sju små stasjonene ved Ranheim og Skullerud, Bogerud og Bøler gir
   0–2 nye linjeretninger.
3. **Bredt kall.** Opptil `KNUTE_MAKS` (~15) kandidater i én aliasert
   spørring. Målt: 15 knutepunkter kostet 0,4–1,1 s i ett kall, omtrent som
   5.
4. **Mål ny dekning på svaret:** nye linjeretninger, nye områder og nye
   transportmidler i forhold til ledd 1. Alle kandidatene står i
   `knutepunkter.vurdert` med tallene og grunnen.
5. **Ingen kutt etter svaret.** Det som er hentet, brukes. Utvalget skjer
   *før* kallet, i forhåndsfilteret, og i rekkefølgen på kandidatene hvis det
   er flere enn `KNUTE_MAKS`. Rekkefølgen er nye linjer i `quays.lines`
   synkende, så antall linjer, så id.

Kandidatlista er 15 i stedet for 5 fordi kallet koster det samme, og
dekningen da avgjøres av svaret i stedet for av en gjetning foran.

## 6. Søkehorisont per transportmiddel og hyppighet

[Beslutning] To ledd. Lengre vindu fra knutepunkter med lavfrekvente tilbud.
Natt og døgn håndteres eksplisitt.

**Horisont per transportmiddel** [Forslag]: én navngitt tabell, `HORISONT`.

| transportmiddel | vindu ledd 1 | vindu ledd 2 | tak per linje og retning |
|---|---|---|---|
| bus, tram, metro, trolleybus | 60 min | 60 min | 2 |
| rail, coach, water | 60 min | **180 min** | 2 |
| taxi (fleksibel) | 120 min | 180 min | 2 |

- Ledd 2 bruker vinduet til det *største* transportmiddelet på knutepunktet
  (fra `quays.lines`). Ett kall per vindu, med høyst to grupper.
- Målt: Oslo S med 180 min fant Kristiansand, Stavanger, Trondheim S, Voss
  og Dombås på 0,2 s. Bergen stasjon fant Voss, Myrdal, Dale og Arna på
  0,7 s.

**Hyppighet**
- Når ledd 1 fra et tilgangspunkt gir under `TYNT_TILBUD` avganger i
  vinduet, dobles vinduet én gang for det punktet. Tretten hadde 9 avganger
  på 60 min.
- Skaleringen gjør regelen gyldig fra storby til bygd (AGENTS.md).

**Natt og døgn**
- Når ledd 1 totalt er tynt, henter oppdageren døgntilbudet med
  `stoppInfoGql` (`src/api/stops.js` [Kode], 24 t, allerede i appen) for
  tilgangspunktene.
- Linjer som finnes i døgnet, men ikke i vinduet, gir
  `timetable: 'not_now'` på `transport_offer`-opsjonene. Tilgjengeligheten
  blir da `in_timetable_not_now` [Kode].
- `natt.døgntilbud` rapporterer hvor mange avganger og linjer det er gjennom
  døgnet. Det skal ikke stå tomt.

**Ingen tre ledd.** Det gir flere mellomstopp, ikke flere handlinger
(3.5 §8).

## 7. API-budsjett, dybde, cache og feil

**Budsjettet per utforskning** [Forslag], med en navngitt konstant
`UTFORSK_KALL_MAKS = 7`:

| # | kall | når |
|---|---|---|
| 1 | geokoder (tilgangskandidater) | alltid |
| 2 | gangtid til tilgangskandidater (aliasert reisesøk) | alltid |
| 3 | ledd 1 (aliasert `boardGQL`) | alltid |
| 4 | stoppinfo og parent for stopp videre | alltid |
| 5 | ledd 2 (aliasert, ≤ 2 vindusgrupper i samme spørring) | når det finnes kandidater |
| 6 | nærhet og gang for knutepunkter (gangkanter) | når kanter er slått på |
| 7 | døgntilbud | bare når tilbudet er tynt |

- Målt grunnlag: kall 1–5 kostet 2,3–7,9 s inkludert reisesøk. Uten
  bekreftelse anslås ≲ 5 s.
- Bekreftelsen har **sitt eget budsjett**, i en egen modul (§8).

**Dybde**
- Høyst 2 ledd (`LEDD_MAKS = 2`). Ledd 2 bygger aldri et nytt ledd.

**Cache** [Forslag]
- Resultatet er gyldig til du har flyttet deg mer enn `UTFORSK_FLYTT_M`
  (~200 m) eller det har gått `UTFORSK_GYLDIG_MS` (10 min). Det er samme
  takt som `STOPP_INFO_MS` [Kode].
- Nøkkelen er posisjon avrundet + tidsvindu.
- Stoppinfo per samlestopp kan gjenbrukes på tvers av utforskninger, med
  samme levetid.
- Utløp testes med en injisert klokke.

**Feil**
- Et alias som feiler, gir et tomt svar for *det* stoppet og en linje i
  `ikkeUndersøkt` (`{hva: 'ledd 2 fra X', grunn: '<feil>'}`).
  Utforskningen fortsetter.
- Prober som avvises (`parent`,
  `numberOfDeparturesPerLineAndDestinationDisplay`), faller tilbake og
  noteres, slik `avvistFlagg` gjør i `src/api/entur.js` [Kode].
- Et kall som feiler helt, gir et resultat med `opsjoner: []` og
  `ikkeUndersøkt` fylt ut. **Det betyr aldri «ingen muligheter».**
- Når budsjettet er brukt opp, stopper oppdageren og fører resten i
  `ikkeUndersøkt`.

## 8. Utvelgelse til reisebekreftelse

[Beslutning] Representativitet, ikke relevans. Alle kandidater beholdes med
grunn.

**Ny modul:** `src/reisebekreftelse.js` [Forslag]. Den er adskilt fra
oppdageren, slik oppdrag 1 skisserte.

**Funksjonen `velgRepresentativt(resultat, n)`**
- Den er ren og deterministisk.
- Den erstatter **ikke** `velgForBekreftelse` i modellen. Den eksisterende
  funksjonen står uendret [Beslutning: modellen endres ikke]. Den nye bruker
  grupperingsindeksen, som modellen ikke kjenner.
- **Dimensjonene** den sprer over: område, linjeretning, transportmiddel,
  tilgangspunkt, knutepunkt og forbindelsestype (direkte / ett bytte /
  gangkant).
- **Algoritmen** [Forslag]: grådig dekning. For hvert valg tas kandidaten
  som dekker flest *nye verdier* på tvers av dimensjonene, med vekt på
  område og linjeretning. Uavgjort avgjøres av id, slik at resultatet er
  uavhengig av rekkefølgen kandidatene kom i.
- **Nesten-dubletter:** kandidater i samme linjeretning og samme område som
  en valgt, med samlestopp innen `NÆR_DUBLETT_M` (~300 m), velges ikke mens
  uutforskede finnes. Det løser Solhjem/Solhjemslivegen og Støren
  sentrum/stasjon, som er målt i 3.5.
- **Representanten** i en gruppe er destinasjonen som *flest* stier går til
  [Forslag]. Det er et nøytralt mål på representativitet. «Lengst unna»
  brukes ikke, fordi det ga endestopp (3.5 §6).
- **Gruppenøkkelen** er **stien**, ikke den sammenslåtte opsjonen. Det
  retter feilen der Nationaltheatret havnet i gruppen «tog».
- **Hvorfor kandidater ikke ble valgt:** svaret er `{ valgt, ikkeValgt: [{
  id, grunn }] }`. Grunnen er en av disse:

  | grunn | betyr |
  |---|---|
  | `'budsjett'` | ikke plass i budsjettet |
  | `'nær dublett av <id>'` | for lik en kandidat som er valgt |
  | `'gruppe dekket av <id>'` | gruppen er allerede representert |

  Alle beholder `not_checked` [Kode].

**Bekreftelsen**
- `bekreft(valgt, ktx, { hent })` sender ett aliasert reisesøk med `tripGQL`
  [Kode], uten fly.
- Svaret blir `confirmations[]` med `request`, `searchedAt` og
  `travelTime`, og i tillegg `realisations[]` med etapper, gangetapper
  inkludert.
- Ved bytte blir det en `connection`-opsjon, som i demonstratoren.
- Et tomt svar gir `unknown` med grunn, aldri `not_feasible` [Målt: Pasop].
- Budsjettet er `BEKREFT_MAKS` (10–12) søk i ett kall. Målt: 1,7–5,1 s.

## 9. Oppdagelseskontekst og proveniens

- `oppdagelse` (`nyOppdagelse` [Kode]) utvides i *resultatet* med
  `parametre` (alle grenser og horisonter) og `kall[]`. Modellen endres
  ikke.
- **Hver sti** har:
  - `discoverer`: `nettverksutforsker:ledd1`, `:ledd2`, `:gang` eller
    `:reisesøk`;
  - `oppdagelse`: id-en;
  - `accessPoint`: med plattform og transportmiddel;
  - `lineId`: linjeretning(er), som i §2;
  - `hubs`: samlestopp;
  - for gangkanter: knutepunkt og nabostopp i `hubs`.
- `samle` bevarer alle stier [Kode]. Ingen sti slettes for å forenkle.
- Kontekst brukes aldri i opsjons-id [Kode].

## 10. Tester

### Korrekthet (offline, med injisert `hent` og opptak fra demonstratoren)

1. **Tilgang:**
   - luftlinje, gangavstand og gangtid er adskilt;
   - lang gange gir ikke et tilgangspunkt. Hauketo-fiksturen: 1 482 m i
     luftlinje og 32 min å gå;
   - feil i gangsøket gir `kilde: 'ukjent'` og en linje i `ikkeUndersøkt`.
2. **Identitet:**
   - samme destinasjon fra to tilgangspunkter og to knutepunkter gir én
     opsjon med fire stier;
   - dedup skjer på samlestopp (`parent`), også i ledd 2.
3. **Søskenstopp:** et knutepunkt leses på samlestoppet. Helsfyr-fiksturen
   med understoppet 6071 (buss) og T-bane på et søskenstopp.
4. **Gruppering:** hver destinasjon ligger i nøyaktig én linjeretning per
   sti og i ett område. Linjeretninger og områder er aldri opsjoner
   (`opsjoner.every(o => OPSJONSTYPER.includes(o.type))`).
5. **Knutepunkt:**
   - forhåndsfilteret utelater kandidater med bare kjente linjer, med
     grunn;
   - modusskifte er ikke nødvendig (Bergen-fikstur med bussterminal);
   - `vurdert` inneholder alle kandidater.
6. **Horisont:**
   - tog og ekspressbuss i ledd 2 får 180 min;
   - tynt tilbud dobler vinduet én gang;
   - tabellen `HORISONT` er én definisjon.
7. **Natt:** tynt ledd 1 gir døgntilbud og `timetable: 'not_now'`, og
   `tilgjengelighet` blir `in_timetable_not_now`.
8. **Gangkanter:**
   - bare fra valgte knutepunkter, høyst `GANG_KANT_MAKS`;
   - en kant gir et ekstra utgangspunkt for ledd 2;
   - Bergen stasjon-fikstur, bare hvis R1 bekrefter hypotesen.

### Variasjon (`reisebekreftelse.js`)

9. Utvalget dekker flere områder og linjeretninger enn
   `velgForBekreftelse` på opptakene fra de fire stedene. Det sammenlignes
   med tallene i 3.5 §6.
10. Ingen nesten-dubletter blir valgt mens uutforskede finnes (Tretten).
11. Utvalget er uavhengig av rekkefølgen kandidatene kom i (stokket inndata).
12. Gruppen beregnes på stien. Nationaltheatret havner i T-bane, ikke tog.
13. Alle som ikke er valgt, har en grunn, og `valgt + ikkeValgt = alle`.

### Ytelse (offline, telt via `hent`)

14. Antall kall er ≤ `UTFORSK_KALL_MAKS` på alle fiksturer. Ledd 2 er ett
    kall uansett antall knutepunkter (≤ `KNUTE_MAKS`).
15. Bekreftelsen er ett kall for ≤ `BEKREFT_MAKS` søk.

### Robusthet

16. Et feilet alias stopper ikke utforskningen og gir en linje i
    `ikkeUndersøkt`.
17. Et kall som feiler helt, gir et tomt resultat med `ikkeUndersøkt` og
    aldri «ingen muligheter».
18. Avvist `parent` gir fallback til understopp og et notat.
19. Cache: samme posisjon innen 200 m og 10 min gir ingen nye kall. Utløpt
    eller flyttet gir nye kall (injisert klokke).
20. Tetthet: storby (Mortensrud), mellomby (Nesttun, Ranheim) og bygd
    (Tretten) gir gyldige resultater med skalerte grenser. Grensene er ikke
    låst til Oslo.

### Arkitektur og regresjon

21. `tests/arkitektur.test.js` utvides med pilene i §1, transitivt.
22. `reiseoppgaver.test.js` og resten av testsuiten er uendret og grønne.
    `views/` er urørt (`git diff`).

### Mutasjoner (AGENTS.md)

Mutasjonene under skal få testene til å feile.

| mutasjon | testen som skal feile |
|---|---|
| fjern gangfilteret, så luftlinjen avgjør | 1 |
| fjern dedup på samlestopp | 2 |
| la gruppenøkkelen bruke opsjonen i stedet for stien | 12 |
| kutt knutepunkter etter svaret | 5 |
| la et feilet kall gi en tom liste uten `ikkeUndersøkt` | 17 |

### Mot ekte Entur (manuelt, ikke i `npm test`)

Kjør `scratchpad/nettverksprobe.mjs` mot modulen, ikke mot sin egen logikk,
for de fire stedene, dag og natt. Sammenlign med tabellen i
`docs/nettverksdemonstrator.md`.

## 11. Rekkefølge, avhengigheter og godkjenninger

### Avhengigheter som løses først (små målinger, før koden)

- **R1: gangovergang ved Bergen stasjon.** Mål om Bergen stasjon ligger
  innen gangavstand fra Bybanens stopp i sentrum. Bruk ett
  `directMode: foot`-søk og ett nærhetsoppslag. Avgjør om gangkanter (§4)
  har verdi. Feiler hypotesen, utsettes kantene.
- **R2: datakilde for nærhet rundt knutepunkt.** Geokoderen eller
  `stopPlacesByBbox` (ikke prøvd), med probe og fallback. Undersøk om
  `knutepunkt`/`TAVLE_GANG_M` kan gjenbrukes som én definisjon.
- **R3: grenser for gangtid og områder.** Kalibrer `GANG_NÆR_MIN` og det
  første områdebåndet mot de fire stedene ut fra M5 (3.5 §9), og bind dem i
  dokumentasjonen.
- **R4: opptak til fiksturer.** Ta opp svar fra Entur for de fire stedene,
  dag og natt. De blir offline-fiksturer. Dette er den eneste
  forutsetningen for tester uten nett.

### Rekkefølgen for implementeringen [Forslag]

Hvert trinn har egne tester og mutasjoner før neste trinn starter.

1. **4a: skjelett og arkitektur.**
   - `nettverksutforsker.js` med `utforsk(ktx, {hent})`, budsjett,
     `ikkeUndersøkt` og arkitekturtest;
   - tilgang med gangtid;
   - ledd 1, grupperingsindeksen og kandidatopsjonene.
2. **4b: knutepunkter og ledd 2.** Forhåndsfilter, bredt kall, ny dekning,
   `vurdert` og `HORISONT`.
3. **4c: natt og døgn.** Døgntilbud, `timetable` og tynt tilbud.
4. **4d: `reisebekreftelse.js`.** `velgRepresentativt` og `bekreft`. Kan
   startes parallelt med 4b, fordi det bare avhenger av resultatformatet
   fra 4a.
5. **4e: gangkanter**, bare hvis R1 er positiv.
6. **4f: proben over på modulen**, og målingene oppdateres i
   `docs/nettverksdemonstrator.md`.

Integrering i `mulighetsoppdagelse.js` og skjermen er **ikke** med i trinn 4.

### Dette krever din godkjenning

1. **`src/reisebekreftelse.js` som ny modul.** Utvelgelsen og bekreftelsen
   skilles fra oppdageren. Den eksisterende `velgForBekreftelse` i modellen
   blir stående uendret, men ubrukt av den nye flyten.
2. **Grådig dekning som algoritme for representativitet.** Representanten
   er destinasjonen med flest stier, ikke den lengst unna.
3. **Lang gange gir ikke et tilgangspunkt.** Hva er «nær»
   (`GANG_NÆR_MIN`), og skal grensen skaleres med stedet?
4. **Gangkanter (4e).** Skal de bygges hvis R1 er positiv, eller utsettes
   uansett?
5. **Bredt knutepunktkall (≤ 15)** i stedet for å velge 5 før kallet.
6. **`HORISONT`-tabellen** (180 min for tog, ekspressbuss og båt i ledd 2)
   som startverdi.
7. **Linjeretning i stiens `lineId`** (fritekst) i stedet for et nytt felt i
   modellen. Alternativet er å endre modellen, som krever et dokumentert
   behov.
8. **Committing:** én commit per trinn (4a–4f) på arbeidsgrenen. PR bare
   etter din instruks.

---

## Gjennomføring

### 4a: skjelett, tilgangspunkter og ledd 1 (gjort)

**Bygget**
- `src/nettverksutforsker.js` med `utforsk(ktx, { hent, klokke })`.
- Tilgangspunkter: romslig søk, gangtid fra ett aliasert reisesøk, og
  klassifisering (`klassifiserTilgang`) i ordinær, alternativ og utenfor, med
  grunn. Gangtiden beholdes også for stopp som er utenfor.
- Ledd 1 i én spørring, samlestopp via `parent`, og
  `transport_offer`- og `destination`-opsjoner.
- Grupperingsindeks: `linjeretning`, `område` og `tilbud`.
- `ikkeUndersøkt`, rapport (kall per type, tid og cachetreff) og cache.
- Opptak og avspilling: `tests/fixtures/entur/*.json.gz` og `avspilling.js`.
  Opptakene tas med `scratchpad/opptakEntur.mjs`, som er 5 scenarioer på til
  sammen 107 kB.

**Avvik fra planen**

1. **Planlagt stoppliste som probe (nytt).**
   - Målt 2026-11-24: Skyss-linjene 20, 16E, 70, 610, 29, 75 og 76 ved
     Nesttun, og flybussen FB10 ved Mortensrud, ga turen uten
     `serviceJourney.estimatedCalls`. Hele linjeretninger så tomme ut.
   - `serviceJourney.quays` ga den planlagte rekkefølgen. Nesttun gikk fra 27
     til 182 destinasjoner, og 13 av 15 linjeretninger trengte planen.
   - Feltet legges til i utforskerens spørring (`medPlanlagteStopp`). Avviser
     Entur feltet, spørres det uten, og det står i notatene.
   - **Samme hull finnes trolig i tavla og demonstratoren,** som bare leser
     `estimatedCalls` (`stoppVidere` i `reiseberegning.js`, `boardGQL`).
     Hullet er ikke rettet der, bare meldt.
2. **Søkehorisonten gjelder også ledd 1.** Et tilgangspunkt med tog,
   ekspressbuss eller båt får 180 min. Én tabell for begge ledd. Et tog som
   går hver time, ville ellers falt ut av ledd 1.
3. **`gangUkjentLuftM` er en egen startverdi (400 m)**, ikke tavlas
   `VIKTIG_GANG_M`. `src/api/stops.js` drar inn `config.js` og `ui/log.js`,
   og ville brutt grensen mot UI. Det er også et annet faktum: en reserve når
   gangtiden mangler.
4. **Ingen `direction`-opsjoner.** Linjeretninger er gruppering
   [Beslutning]. Demonstratoren laget dem, men utforskeren gjør det ikke.
5. **Linjeretning som `directionId`.** `stiId` i modellen tar ikke med
   `directionId`. To stier fra samme tilgangspunkt med samme linje i hver sin
   retning til *samme* destinasjon slås derfor sammen i opsjonen, men begge
   står i `grupper.linjeretning`. Det skjer bare med ringlinjer. Det er en
   kjent grense, og modellen er ikke endret.
6. **Avstandsbåndene er ikke skalert med stedet ennå** (R3). Faste bånd på
   5/15/50/150 km.

**Målt med opptakene** (tirsdag 2026-11-24 kl. 12:00 og natt til onsdag kl.
01:30)

| | Mortensrud dag | natt | Nesttun | Ranheim | Tretten |
|---|---|---|---|---|---|
| tilgangspunkter (ordinær/alternativ) | 7 | 7 | 4 | 2 (med Ranheim stasjon) | 4 |
| utenfor, med gangtid | 8 (Hauketo 33 min) | 8 | 11 (Midtun 27 min) | 13 | 9 |
| linjeretninger | 13 | 3 | 15 | 7 | 2 |
| områder | 13 | 3 | 13 | 11 | 4 |
| destinasjoner / tilbud | 117 / 19 | 17 / 7 | 182 / 20 | 66 / 3 | 28 / 3 |
| kall: oppdagelse + gang | 3 + 1 | 3 + 1 | 3 + 1 | 3 + 1 | 3 + 1 |
| tid | 1,3 s | 0,9 s | 0,7 s | 0,8 s | 0,6 s |

- **Tretten tirsdag kl. 12–13:** bare buss 141. Bestillingstaxi 5031 og
  VY710, som var med mandag, lå ikke i vinduet. Dette er det tynne tilbudet
  4c skal håndtere. Et tomt resultat er ikke tolket som «ingenting».
- **Geokoderens kategorier er grove.** Holmen bru er «bus», men betjenes også
  av ekspressbuss. Regelen for alternativ tilgang (nye transportmidler) bruker
  kategoriene og kan derfor undervurdere.

**Tester:** `tests/nettverksutforsker.test.js` har 27 tester, og
`tests/arkitektur.test.js` har fått en ny test. Sju mutasjoner ble fanget:
- luftlinje avgjør nærhet;
- ingen dedup på samlestopp;
- uten planlagt stoppliste;
- tomt = «ingen muligheter»;
- cachen ignorerer flytting;
- linjeretning i `lineId`;
- alternativ tilgang uten nytt transportmiddel.

### 4b: knutepunkter og ledd 2 (gjort)

**Bygget**
- **Knutepunktkandidater** er samlestopp som ledd 1 når. Linjene leses på
  *samlestoppet* (`parent{quays{lines}}`). Målt: samlestoppets `quays` tar
  med søskenstoppene. Helsfyr har 17 plattformer med T-bane, mens
  understoppet 6071 har 11 uten. Dette bruker samme stoppinfo-kall som før,
  så det koster ingen ekstra kall.
- **Marginalt forhåndsvalg, uten kall.**
  - Hvert valg tar knutepunktet med flest linjer som verken ledd 1 eller
    knutepunktene som alt er valgt, dekker. Uavgjort avgjøres av nye
    transportmidler, så id.
  - Størrelse, popularitet og antall avganger brukes ikke. Et stort
    knutepunkt med de samme linjene som et valgt gir 0.
  - Høyst `knuteMaks` (15).
  - Alle kandidater rapporteres med status og grunn. Grunnen er en av disse:
    - «bare linjer som alt er sett i ledd 1»;
    - «linjene dekkes av valgte knutepunkter (…)»;
    - «utenfor knuteMaks». Den står også i `ikkeUndersøkt`.
- **Ledd 2** spørres i én spørring for alle spurte knutepunkter, med
  `horisontFor` knutepunktets transportmidler (180 min for tog, ekspressbuss
  og båt) og planlagt stoppliste som reserve.
- **Marginalt bidrag per spurt knutepunkt** (måling, ikke kutt):
  - nye linjeretninger, nye områder og nye transportmidler;
  - destinasjoner, nye destinasjoner og alternative veier (kjente
    destinasjoner nådd på en ny vei);
  - `duplikat` når det ikke ga noe nytt.
- **Tre nivåer holdes adskilt.**

  | nivå | hvor det står |
  |---|---|
  | i rutetabellen | knutepunktets linjer; `iRutetabellIkkeIVindu` lister dem som ikke gikk i vinduet |
  | i søkevinduet | avganger og veier |
  | bekreftet | bare reisesøk, i 4d |

  Ingen opsjon har noen bekreftelse fra utforskeren.
- **`veier`** er én post per konkret nettverksvei: tilgang → [linjeretning
  inn → knutepunkt →] linjeretning → destinasjon.
  - Hver vei bærer `grunnlag`: «planlagt stoppsekvens» eller «avgang i
    søkevinduet».
  - Hver vei bærer også `stoppliste`, `avgang` og `område`.
  - Veiene er adskilt fra opsjonsidentiteten. En ringlinje i to retninger
    til samme destinasjon er én opsjon, men to veier. Modellen er ikke
    endret.

**Avvik og presiseringer**
1. Det første forhåndsvalget (rangert på «nye linjer» per knutepunkt) ga
   mange duplikater: 8 av 15 ved Tretten (Lillehammer sentrum) og 5 i
   Nesttun. Det ble erstattet med et marginalt valg før commit. Målt etter
   endringen er tallene 1 duplikat av 4 spurte ved Tretten, 2 av 15 i
   Nesttun og 0 av 15 ved Mortensrud.
2. Opptakene trimmes for felt utforskeren ikke leser (avvik, sanntidsflagg,
   ankomsttider). Opptakene ble 743 kB komprimert, ned fra 1,8 MB.
3. Stopplister som mangler, er rettet i utforskeren (4a). Det samme hullet i
   tavla er issue #771 og holdes utenfor trinn 4.

**Målt med opptakene** (tirsdag kl. 12:00 og natt kl. 01:30)

| | Mortensrud | natt | Nesttun | Ranheim | Tretten |
|---|---|---|---|---|---|
| knutepunkter vurdert / spurt / duplikat | 111 / 15 / 0 | 15 / 1 / 1 | 179 / 15 / 2 | 66 / 15 / 0 | 26 / 4 / 1 |
| linjeretninger | 169 | 3 | 106 | 159 | 36 |
| områder | 30 | 3 | 30 | 28 | 26 |
| destinasjoner | 1 531 | 17 | 1 155 | 1 325 | 561 |
| veier (ledd 1 / ledd 2) | 392 / 7 153 | 53 / 12 | 470 / 3 379 | 77 / 5 460 | 56 / 1 089 |
| veier med planlagt stoppsekvens | 246 | 0 | 3 354 | 286 | 328 |
| kall: oppdagelse + gang | 4 + 1 | 4 + 1 | 4 + 1 | 4 + 1 | 4 + 1 |
| tid | 2,2 s | 0,8 s | 1,2 s | 1,6 s | 0,9 s |

Funnet blant kjente mål:
- Mortensrud: Kristiansand, Stavanger, Lillehammer, Oslo S, Ski og Lysaker.
- Nesttun: Stavanger og Voss.
- Ranheim: Trondheim S, Lillehammer, Oslo S og Røros.
- Tretten: Lillehammer og Gjøvik.

**Ikke funnet**
- Bergen stasjon fra Nesttun: overgangen går trolig til fots (4e).
- Natt: bare én knutepunktkandidat ga linjer utover ledd 1, og den var
  duplikat. Den står som det, ikke som «ingenting».

**Tester:** `tests/nettverksutforsker.test.js` har 39 tester. Fem mutasjoner
ble fanget:
- linjer lest på understoppet;
- ikke-marginalt forhåndsvalg;
- vei uten linjeretning (ringlinjen slås sammen);
- taus feil i ledd 2;
- planlagt stoppsekvens merket som avgang.
