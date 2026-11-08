# Produktretning

Hva appen prøver å være, hva som allerede finnes, og hva som står igjen.

Bygget på en ekstern vurdering av skjermbildene, revidert mot kildekoden.
**Revisjonen er det viktigste i dokumentet**: seks av vurderingens sju
prioriteringer var allerede bygget, og en strategi som ber om noe som finnes
sender oss til å bygge det to ganger.

---

## Posisjonen

> Ikke det beste geografiske kartet. Det beste kartet for å **forstå og
> gjennomføre** en kollektivreise.

Fra å vise hvor kollektivtransporten går, til å hjelpe mennesker med å
forstå og gjennomføre reisen sin.

Det er en posisjon Google Maps ikke konkurrerer om, og den gir føringer for
kartdesign, informasjonsarkitektur og hva som er verdt å bygge.

---

## Proven · Better · New, med status

### Proven — beholdes uten innovasjonsbudsjett

Mørkt kart med geografi, zoom, posisjonsmarkør, rute tegnet på kartet,
holdeplasser og linjer, fargekoder per transportmiddel, avgangs- og
ankomsttider, plattform. Dette er konvensjoner lesere forventer. Å finne dem
opp på nytt er sløsing.

### Better — nesten alt er bygget

| vurderingens prioritet | status |
|---|---|
| kart og liste som koblede visninger | **delvis** — koblet på LINJE (`_lineOn` leses av kart, stripe og liste), ikke på enkeltavgang. Stripe→rad finnes (`_bindStrip` blinker og ruller). Rad→kart finnes ikke; raden navigerer bort. |
| kartet prioriterer etter reisefase | **finnes** — tre skjermer, tre kartoppgaver. Men fasen har ikke noe navn. |
| appen forstår om en avgang kan nås | **finnes** — `reachCls` har hatt en `missed`-bøtte hele tiden, og `canCatch`/`catchable` filtrerer på den |
| bytter og gangetapper | **finnes** — `drawLeg({dim})` demper etapper etter den du sitter på, `js-done` fyller skinna, `legStatus` gir `done`/`active`/`future` |
| handlingsorientert navigasjon | **finnes** — `alightEyebrow`: «Gå av nå», «Bytt her», «Av ved neste stopp» |
| dynamisk kart gjennom reisens tilstand | **finnes** — og `trainPosition.js` har til og med en kildekaskade: din GPS → sanntid → rutetid |
| prediktiv reiseassistent | **finnes** — `smart.js` (vanebøtter per ukedag), `returnTrip.js` (hjemreise), `usual.js` («din vanlige 08:12») |

### New — og her tok vurderingen feil om hva som er nytt

Vurderingen foreslo en prediktiv assistent. Den finnes.

Det som faktisk er særpreget, er noe et skjermbilde ikke kan vise: appen har
**tolv navngitte domsvokabularer**, og nesten alle skiller **målt** fra
**anslag** fra **vet ikke**.

```
reachCls      r-far · r-ok · r-soon · r-now · missed
belegg        målt · anslag · vet-ikke
posState      ok · leter · unøyaktig · framskrevet · gammel · borte · …
liveness      fersk · venter · gammel · tapt · borte · frakoblet
seksjon       ikke-spurt · henter · feilet · tomt · ok
trinnfri      trinnfri · ikke-trinnfri · vet-ikke
stripeKilde   målt · rutetid
legStatus · planStatus · usualState · tripTime · alightEyebrow
```

På skjermen blir det til setninger ingen annen reiseapp sier:

- «anslått posisjon (±83 m)»
- «neste avganger · etter rutetid»
- «ca. travelt» mot «travelt»
- «uten trasé, tegnet som rette strek»
- «posisjonen er unøyaktig (±120 m)»

**Det er ikke en funksjon. Det er en holdning**, bygget over sytti
utgivelser — og de store aktørene kan strukturelt ikke kopiere den, fordi å
si «jeg vet ikke» undergraver et produkt som selger sikkerhet.

Retningen for New er derfor ikke mer prediksjon. Det er å gjøre
**tillitsgraden** til appens signatur: brukeren skal alltid vite hvor mye
hun kan stole på tallet hun ser.

---

## Fasen, med ett navn

Vurderingen foreslo fem tilstander. `AGENTS.md` har tre. Appen har tolv
vokabularer og **ingen** som sier hvilken fase leseren er i — den er
implisitt i hvilken skjerm som er oppe.

To modeller for én idé er kodebasens signaturfeil, hevet ett nivå.

| fase | skjerm | hva som må være klokkeklart |
|---|---|---|
| før valg | tavla, auto-reise | hvor er jeg, hvor er stoppet, hvordan kommer jeg dit, hvilke avganger gjelder meg |
| valgt avgang | avgangsdetaljer | når går den, fra hvilken plattform, når og hvor ankommer jeg |
| underveis | underveis | hvor er jeg nå, hvilket stopp er neste, når går jeg av |

Vurderingens fem er en **underinndeling av «underveis»** — på vei til
holdeplassen, om bord, bytte, ankomst. De er ikke et konkurrerende sett, og
skal ikke bli det. Trenger vi dem, utvides raden; vi lager ikke en andre
tabell.

**Konsekvens, og den er konkret:** tavla og auto-reise er samme fase, og
skal svare likt på samme spørsmål. De gjorde det ikke. Se v1.189.0.

---

## Hva som står igjen

Fire ting, ikke sju — men de hører ikke til samme spørsmål, og rekkefølgen
under er satt av PULL, ikke av hvor interessante de er å bygge.

1. **Tillitsgraden som signatur.** Vokabularene finnes; det som mangler er å
   behandle dem som produktet framfor som rydding. *Den eneste av de fire
   som går gjennom PULL.*
   Første steg tatt i v1.191.0: `vanestyrke` er det trettende vokabularet, og
   det første som sier hvor mye appens EGEN gjetning er verdt — «vanlig nå
   (40)» mot «av og til (1)», der det før bare var en rammefarge.
2. **Rad → kart.** Trykk på en avgang navigerer bort. Den kunne i stedet
   framheve linja, holdeplassen og ruta på tavlekartet — koblingen finnes
   alt på linjenivå (`_lineOn`), ikke på avgangsnivå. *Faller på siste L:
   Google Maps gjør dette, og gjør det godt.*
3. **Ett navngitt fasebegrep.** I dag er fasen `show('v-…')`. Tabellen over
   og skjermbyttene er to steder som skriver ned samme faktum. *Vedlikehold,
   ikke etterspørsel — begrunnes av «én navngitt definisjon», ikke av PULL.*
4. **En rest:** `track.js:928` bruker `#60a5fa` — fargen «deg» ble flyttet
   vekk fra nettopp fordi den kolliderte med destinasjonsnålene.
   *Korrekthet. Trenger ingen ramme.*

---

## PULL — er det noen som drar?

Rob Snyders rammeverk fra *Physics of Startups*, for å finne blokkert
etterspørsel framfor å pitche til folk som bare er høflige:

| | |
|---|---|
| **P**rioritert prosjekt | kunden jobber alt mot et mål med høy prioritet |
| **U**unngåelig situasjon | det finnes en frist, et press, en tvungen endring |
| **L**ooked at alternatives | hun har alt prøvd det som finnes |
| **L**imitations are severe | det hun prøvde er utilstrekkelig |

### Oversettelsen må være eksplisitt

PULL er laget for å finne **kunder i kjøpssituasjon**. Denne appen har én
bruker og ingen kjøpere, så uten en oversettelse diskriminerer rammeverket
ikke mellom noe som helst.

Oversettelsen: **kunden er den reisende på perrongen, og «kjøpet» er å åpne
denne appen framfor Ruter eller Google Maps.**

### P og U er oppfylt for hele appen — L-ene er det som skiller

Å rekke jobben er et høyt prioritert, daglig gjentatt prosjekt. En avgang som
går 08:48 er en absolutt frist. Det gjelder alt appen gjør, og skiller derfor
ingenting.

| | P | U | L · vurdert | L · alvorlig |
|---|---|---|---|---|
| tillitsgraden | ja | ja | ja, daglig | **ja** |
| rad → kart | ja | middels | ja, daglig | **nei** |
| fasebegrepet | — | — | — | — |
| `#60a5fa` | — | — | — | — |

**Rad → kart faller på siste L.** Google Maps gjør nettopp dette, og gjør det
godt: trykk en rute, se den på kartet. Alternativet er altså ikke
utilstrekkelig — det er tilstrekkelig. PULL sier da: ikke invester her.

**Tillitsgraden går hele veien.** Ruter og Google viser et tall uten opphav. I
en tunnel teller Google videre med full selvtillit på rutetid og sier det
ikke. Du handler på tallet — går ut døra, lar være å løpe — og oppdager først
etterpå at det var gjettet. Alvorlig begrensning, uunngåelig situasjon, og
**ingen av alternativene kan adressere den**: å si «jeg vet ikke»
undergraver et produkt som selger sikkerhet.

**De to siste er ikke etterspørselsspørsmål.** Å måle dem mot PULL er å bruke
feil instrument. De begrunnes av arbeidsmåten i AGENTS.md, ikke av et marked.

### Hvordan de to rammeverkene henger sammen

De svarer på ulike spørsmål, og det ene skal **portvokte** det andre:

```
PULL               er det noen som drar i dette?        → om vi bygger
Proven·Better·New  hva slags arbeid er dette?           → hvor mye det koster
```

Et Better-tiltak uten pull er polering. Et New-tiltak med pull er en
posisjon. Rekkefølgen i lista over er satt av den første kolonnen.

### Og innvendingen mot dokumentet selv

Rammeverkets poeng er å slutte å pitche til folk som bare er høflige.
Påstanden over om at Ruter og Google er «alvorlig begrenset» er **ikke
testet** — den er hentet fra hukommelsen, og sandkassen kan ikke sjekke den.

PULL foreskriver derfor én konkret handling før mer bygging: **finn fem
mennesker som har mistet et tog fordi en app løy selvsikkert**, og hør om de
kjenner seg igjen. Gjør de ikke det, er «tillitsgrad» forfatterens interesse
og ikke leserens etterspørsel — og da er dette dokumentet nettopp den kalde
pitchen det advarer mot.

---

## Løftet, og hva det kostet å holde det

v1.193.0 avgjorde en uenighet som hadde stått lenge: personvernsida sa at
appen husker reisene dine «de siste sju døgnene» og at det er av til du slår
det på. Det var sant om reiseloggen og usant om vanene — `t.smartHist` og
`t.freqArr`/`t.freqDep` skrives uten samtykke, hadde intet vindu, og bærer
koordinater.

To utveier fantes, og valget er prinsipielt: **lageret ble endret, og
teksten beskriver det som ble igjen.** Å skrive om teksten alene ville fått
sida til å argumentere mot seg selv, for den sier i samme avsnitt hvorfor
vinduet er sju døgn — «en ukes posisjonshistorikk på telefonen kan leses av
den som får telefonen ulåst i hendene» — og den begrunnelsen skiller ikke
mellom hendelser og aggregater.

Tre nivåer, med tre ulike regler:

```
det du har sagt        rute, favoritter            til du sletter
det appen har merket   vaner, ofte brukte steder   90 dager uten bruk
enkeltturer m/ posisjon  reiseloggen               7 døgn, med samtykke
```

Og den delen som gjør det til mer enn en setning: nivå 2 **vises på
skjermen, utenfor samtykkebryteren**, med koordinatene i klartekst. Den som
aldri sier ja er nettopp den som ellers aldri fikk se hva som ble lagret om
henne. Det er samme invariant `eventLog.js` alltid har båret for loggen —
«every field stored is a field shown» — nå håndhevet for to lagre.

---

## Kart over Entur-data (2026-11-08)

Spørsmålet var: «Hva annet har Entur data på som kan være Proven, Better
eller New?» For å svare ble skjemaet til Journey Planner v3 hentet og
sammenlignet med `src/api/*.js`. Feltene appen ikke bruker, ble prøvd mot det
ekte API-et: Mortensrud, Oslo S og reisen Mortensrud → Oslo S. Eksemplene
under er fra de prøvene. Det som ikke er prøvd, står merket.

### Har data, ikke brukt

| felt | målt eksempel | klasse |
|---|---|---|
| `EstimatedCall.empiricalDelay{p50 p90}` | L1 fra Oslo S: p50 0, p90 5 min. RE11: 0 og 2 min. Tomt for mange avganger | New |
| `ServiceJourney.privateCode` | tognummer: Vy 838, T-bane 8050, buss 278 | Proven |
| `requestStop`, `extraCall`, `isReplacement`, `forBoarding/forAlighting` | har verdi, alle `false` i prøven | Better |
| `Leg.elevationProfile` | 13 punkter på 290 m gange, høyde 3,0–5,4 m | Better |
| `ServiceJourney.operator` | Vy, Go-Ahead Nordic AS, Flytoget | Proven |
| `ServiceJourney.activeDates` | fra 1 til 37 driftsdager per tur | Better |
| `transportSubmode` | localBus, metro, airportLinkRail, regionalRail | Proven |
| `TripPattern.walkTime/waitingTime/streetDistance` | 313 s / 0 s / 338 m | Better |
| `nearest(filterByPlaceTypes:[bikePark])` | sykkelparkering 66 m fra Mortensrud | Proven |

### Finnes i skjemaet, men tomt eller ubrukelig i dag

- `emission{co2}`, CO₂ per reise og etappe: `null`.
- `wheelchairAccessible` og `bikesAllowed` på turen: `noInformation`.
- `vehicleAssignment` (kjøretøy-id og kjøretøytype): `null`.
- `Line.branding`: `null`.
- `notices` på avgang, tur og linje: tom i prøven.
- `BikePark.spacesAvailable`: 2147483647, en fyllverdi, og `realtime: false`.
- `Authority.fareUrl`: `null` (se pris-avsnittet).

Tomt i dag kan bety tomt i Oslo, ikke i hele landet. Feltene bør prøves på
nytt før noen bygger på dem.

### Ti nye kandidater

PULL avgjør om noe bygges, og Proven·Better·New sier hva det koster.
Rekkefølgen er etter forventet PULL.

1. **Byttedom med historikk (New).** Sammenlign `empiricalDelay.p90` for
   turen du bytter *fra* med byttemarginen: «byttet ryker omtrent 1 av 10
   ganger». Det utvider tillitsgraden til bytter, der appen i dag bare har
   dagens sanntid. *PULL: ja hele veien.* Et bytte er en frist, og ingen av
   alternativene sier hvor ofte det ryker.
2. **«Vanligvis i rute» ved avgangen (New).** `empiricalDelay` brukt direkte:
   «vanligvis i rute · 1 av 10 ganger 5 min sent». Gir historisk grunnlag
   uten at appen lagrer noe om deg. Er feltet tomt, står ingenting.
   *PULL: ja.*
3. **«Går ikke i helgene» for lagrede avganger (Better).** Varsle med
   `activeDates` før du står på perrongen. Turer med få driftsdager er
   vanlige, R12 har for eksempel 11. *PULL: P og U ja. L er ikke testet.*
4. **Varighet på avvik (Better).** «Gjelder til 18:00» fra
   `PtSituationElement.validityPeriods`. *Ikke prøvd mot data.*
5. **Bakker i gangtiden (Better).** `elevationProfile` gir for eksempel
   «+12 m stigning» og en justert gangtid. *Ikke testet om OTP allerede
   regner bakker inn i varigheten.* Gjør den det, er bare ordene nye.
6. **Turtype i klartekst (Proven).** `transportSubmode` gir «flytog»,
   «nattbuss» og «buss for tog». Det er det skiltene sier.
7. **Tognummer (Proven).** `privateCode` er det høyttalere og skilt på
   stasjonen bruker («tog 838 til Skien»).
8. **Gange og venting i reisen (Better).** `walkTime` og `waitingTime` gir
   «5 min gange · 0 min venting». Lite å bygge, og det sier hvordan reisen
   er satt sammen.
9. **Hvem som kjører (Proven).** `operator`, for eksempel Go-Ahead Nordic på
   F5. *PULL: svak.* Nyttig mest når noe går galt og du lurer på hvem du
   skal klage til.
10. **Holdeplasser der du drar kartet (Proven).** Hent stopp for området
    kartet viser (`stopPlacesByBbox`). *Faller på siste L, akkurat som rad →
    kart: Ruter-appen gjør dette godt.*

Funnene fra samme undersøkelse som allerede var foreslått: `empiricalDelay`
alene (kandidat 2), tognummeret (7), og «stopper på signal», «ekstraavgang»,
«buss for tog» og «kun avstigning». De fire siste har felt med verdi i API-et.

---

## Undersøkt og utsatt: pris og «kilopris» (2026-11-08)

Forslag: sammenligne reiser på pris per km eller personkilometer, slik
dagligvarer sammenlignes på kilopris, og regne ut prisen for spart tid.
**Svaret er at åpne data ikke har priser.** Alt under er hentet fra
tjenestene, ikke fra hukommelsen, unntatt der det står noe annet.

| kilde | hva den har | pris? |
|---|---|---|
| Journey Planner v3 (hele skjemaet gjennomgått) | `tariffZones` per holdeplass og kvai, `Authority.fareUrl` | **nei.** Mortensrud og Jernbanetorget: begge «RUT sone 1». `fareUrl` er `null` for Ruter og Vy |
| Offers API (`api.entur.io/offers/v2`) | billettilbud og priser | **bak avtale.** Svarer 401 uten innlogging. Partner-API med OAuth2 client credentials fra partnerportalen. Avtalekravet er hentet fra Enturs dokumentasjon via søk, fordi siden er stengt fra sandkassen |
| NeTEx-eksport, Ruter (78 MB, 394 filer) og Vy (6 MB, 25 filer) | rutedata: 73 838 og 8 327 ServiceJourney | **nei.** 0 FareFrame, FareTable, FareZone, TariffZone, PreassignedFareProduct, SalesOfferPackage, Price, Amount, DistanceMatrixElement og UsageParameter |

**Hvorfor dette stopper funksjonen:**
- **Nøkkelen kan ikke skjules.** En partnernøkkel må holdes hemmelig. Appen har
  ingen server, så nøkkelen ville ligget åpent i nettleseren.
- **Takstsoner alene gir ingen pris.** Sonene sier bare at en reise er
  innenfor sone 1, ikke hva den koster.

**Og selv med pris ville tallet villedet.** Med sonepris koster en tur det samme
uansett lengde innenfor sonen. Kroner per km sier da mer om billettypen enn om
tilbudet, og med periodebillett er prisen per tur i praksis null.

**PULL:** P og U er svake. Den som står på perrongen har som regel allerede
billett, og velger avgang, ikke pris.

**Ikke undersøkt:**
- om Ruter eller Vy har egne åpne pris-API-er;
- Enturs egen eksport av takstsoner (`/netex/fare-zones`).

**Den eneste veien uten avtale** er en priseliste lagt inn for hånd, for eksempel
Ruters enkeltbillett per antall soner. Den må vedlikeholdes ved hver
prisendring. Utsatt, til noen trenger pris i valget av avgang.

Det som *kan* bygges av data appen alt har, er tidsdelen: «X min raskere»
mellom alternativene.

---

## Vurdert og utsatt: bestillingstransport (Flex)

Gjennomgangen av Journey Planner-integrasjonen (v1.194.0) fant at
bestillingstransport ikke er blant modusene appen spør om. Det er ikke en
feil som kan rettes, men en ny funksjon som passer dårlig med appens modell.

**Hva det ville kreve:** Flex-turer har et *tidsvindu*, ikke en avgangstid,
de må bestilles innen en frist, og de har verken kjøretøyposisjon eller
stoppliste. Nedtelling, «gå av nå», stopplista og hele kildekaskaden i
`trainPosition.js` forutsetter det motsatte. Fulle Flex-reiser ville trengt
egen visning gjennom alle tre fasene. Det minste meningsfulle steget, å vise
dem som forslag med tidsvindu og bestillingsinfo uten sporing, er en ny
funksjon som heller ikke kan prøves herfra.

**PULL-spørsmålet:** Er det noen som drar i dette? Bestillingstransport
finnes i deler av Viken, ikke i det tette Oslo appen er bygget for. Har ikke
den som bruker appen selv behov for det, er dette forfatterens interesse og
ikke leserens etterspørsel. Utsatt til noen sier at de trenger det.

---

## Undersøkt: gangen mellom to plattformer (2026-11-02)

Rapportert med skjermbilde: på byttet buss 74 → trikk 12 på Jernbanetorget
tegner appen Journey Planners gangetappe som en omvei via Karl Johans gate,
mellom to plattformer som ligger nesten vegg i vegg. Spørsmålet var om Entur
har bedre data for gang mellom plattformer. **Svaret er nei.** Alt under er
rå svar fra tjenestene, hentet med ET-Client-Name; ingenting er fra
hukommelsen.

### Hva som er målt

```
74 av   plattform A   NSR:Quay:7203   59.911425, 10.749736   (StopPlace 4000, buss)
12 på   plattform B   NSR:Quay:7210   59.911401, 10.749827   (StopPlace 4004, trikk)

Journey Planner v3, ekte reise Ekeberghallen → Aker brygge, linje 74 og 12:
  gang A → B   distance 63.05 m   duration 71 s   pointsOnLink 11 punkter, 64 m
  luftlinje kvai → kvai   5.7 m   →   11× lengre
  steps: «Jernbanetorget A» (område) 16 m → «fortau» 12 m
         → venstre «Karl Johans gate» 6 m → venstre «gangvei» 12 m → «Plattform B» 16 m
```

| kilde | hva den har | gangforbindelser? |
|---|---|---|
| NeTEx-eksporten av stoppestedsregisteret, hele landet (`Current_latest.zip`, 58 007 StopPlace) | alt registeret har | **0** PathLink, NavigationPath, AccessSpace, PathJunction, SiteConnection |
| Samme, Oslo (`03_Oslo_latest.zip`) | | **0** av hver |
| Stop Place Register read API (`stop-places/v1/read`) | skjemaet har `SitePathLinks`, `NavigationPaths`, `AccessSpaces` | tomme for Jernbanetorget (58366, 4000, 4004) og Oslo S (59872). Ingen egen path-link-ressurs |
| Transit-data v1beta (GraphQL og MCP, 18 verktøy) | kvaier: kode, koordinat, beskrivelse, `wheelchairAccessible`, keyValues | ingen typer for det. Nærmest: `QuayAtDistance`, som er luftlinje |
| Journey Planner v3 | gangetappens form og **`steps`** (`PathGuidance`: distance, relativeDirection, heading, streetName, area, bogusName, …) | rutet i OpenStreetMap, ikke i registeret |
| Håndbok N801 v2.0, §4.7.5 | viser videre: «Datakrav for ganglenker … er beskrevet i NeTEx profil Norge» | profilen (Confluence) var ikke tilgjengelig herfra |

Det registeret faktisk sier om dette byttet: buss-stoppestedet (4000) og
trikkestoppestedet (4004) peker på hverandre med `adjacentSites` og
`weighting: INTERCHANGE_ALLOWED`, altså at byttet er lov, ikke hvor langt
det er. Trinnfri adkomst er `stepFreeAccess: "UNKNOWN"` på alle kvaiene, og
alle andre tilgjengelighetsfelt er også `UNKNOWN`.

### Hva det betyr

- **En probe mot Entur for gangforbindelser har ingenting å hente.** Feltene
  finnes i modellen og er tomme i hele landet.
- **Omveien er virkelig** — se NVDB under. N801 §4.7.4.1 plasserer en buss-
  eller trikkekvai der ledelinja krysser fortauskanten, så A og B er to
  kantpunkter 5,7 m fra hverandre, og mellom dem går en kjørebane. **En rett
  strek i appen ville ledet folk over den.**

### Avgjort med NVDB (2026-11-02)

OpenStreetMap via Overpass kom ikke gjennom: `overpass-api.de` åpnet
tunnelen og lukket den etter TLS-håndtrykket (proxyen:
`ws_closed_mid_exchange`, 517 B sendt, 39 B mottatt), og speilene `lz4.` og
`z.` svarte 403. **OSM-geometrien er altså ikke sett.** NVDB svarte, og er en
uavhengig, offentlig kilde:

```
vegnett  /vegnett/api/v4/veglenkesekvenser/segmentert   HTTP 200, 15 segmenter
  604012:0.629–0.832  Enkel bilveg  KV11926 S1D1 m340–449  felt ['2']
    2,1 m fra A, 3,6 m fra B — senterlinja KRYSSER linja A–B (den eneste)

174 Gangfelt  /vegobjekter/api/v4/vegobjekter/174         HTTP 200
  1014289376  KV11926 m341  21,9 m fra A, 21,7 m fra B
              lysregulert, skiltet, trafikkøy, nedsenket kantstein, eier kommune
  1014292621  KV17110 m201  27,8 m fra A, 24,5 m fra B
              lysregulert, trafikkøy, nedsenket kantstein, eier kommune
  ingen gangfelt mellom A og B
```

Journey Planners gangrute går gjennom punktet 59.91119, 10.74949 — ved
gangfeltet på KV11926 m341. Registreringsplikten i NVDB gjelder europa-,
riks- og fylkesveg; her har kommunen registrert sine, men et tomt svar et
annet sted beviser fortsatt ingenting for kommunal gate.

**Konklusjon: omveien er virkeligheten, ikke en kartfeil.** Det trygge og
lovlige er gangfeltet ca 22 m unna, slik ruteplanleggeren sier.

### Bygget: omveien med ord

Byttelinja i reiseløpet (`src/ui/reiselop.js`, `omvei()`) sier nå det appen
vet, når gangveien er minst `OMVEI_FAKTOR` (3) ganger luftlinja og
plattformene ligger nærmere enn `OMVEI_MAKS_LUFT_M` (100 m):

> Bytte på Jernbanetorget · 3 min · gå 1 min (ca 60 m) til plattform B
> Plattformene ligger ca 6 m fra hverandre, men gangveien går om Karl Johans gate.

- Gatenavnet kommer fra `steps` (Journey Planner, `PathGuidance`), som
  `tripGQL` nå spør om — uten probe, fordi feltet svarte mot det ekte API-et;
  det droppes i den minimale nødspørringen. Oppdiktede navn (`bogusName`:
  «fortau», «gangvei»), plasser (`area`), plattformer og stoppets eget navn
  tas ikke med.
- Uten steg: «… men gangveien er ca 60 m». Uten form eller koordinater:
  ingenting — vi vet ikke.
- **Ingen rett strek på kartet.** Byttedommen (`transferMargin`) er uendret.
- Fikstur fra det ekte svaret i `tests/omvei.test.js`; nettleserprøven
  `scratchpad/omveiProbe.mjs`.

---

## Vurdert: innendørsnavigasjon med landemerker

Et eksternt forslag (2026-11-02): led brukeren gjennom store knutepunkter som
en kjede av gjenkjennelige landemerker (trapp, heis, hall, skilt), med
bekreftelse ved viktige punkter («Jeg er her») framfor kontinuerlig
posisjon. Mellom punktene skal skrittelling (PDR) anslå framdriften, og
appen skal si fra når den ikke lenger vet hvor brukeren er.

**Det som passer:** kjernen er appens egen holdning. «Sist bekreftede
punkt», «anslått» og «Det ser ut som du har tatt en annen vei» er en
tillitsgrad, ikke en ny idé — et fjortende vokabular, *bekreftet · anslått ·
ukjent*.

**Det som bærer alt, og som ikke finnes:** en graf over stasjonen. Entur har
modellen (PathLink, NavigationPath, AccessSpace) men 0 slike objekter i hele
landet, se over. Uten den er dette et kartleggingsprosjekt med evig
vedlikehold, ikke et appprosjekt. Lages grafen for hånd, bør den skrives i
NeTEx- eller GTFS Pathways-format, ikke et eget.

**Det en nettapp kan:** manuell bekreftelse, ja. Skrittelling finnes ikke
som API i nettleseren og må regnes fra rå akselerometerdata, med eget
samtykke på iPhone. NFC fra nettleseren finnes ikke på iPhone. Forslagets
«start med A og D» er i praksis A alene.

**Kartbiblioteker vurdert:** ingen gir bedre data. MapLibre-tillegg for
etasjer finnes (`maplibre-gl-indoorequal`, AGPL; `maplibre-gl-indoor`, MIT),
men appen bruker Leaflet, og problemet er dataene, ikke visningen. Valhalla,
som appen alt bruker, skal ifølge OSM-wikien forstå `highway=corridor`;
hvor godt Oslo S er kartlagt innendørs i OSM er ikke sjekket.

**PULL:** P og U, ja — et bytte er en frist. L er ikke testet. Det eneste
signalet så langt gjaldt et bytte på 10 m utendørs — og det viste seg å være
en kjørebane med gangfelt 22 m unna, ikke et innendørsspørsmål. Utsatt til noen har
mistet et bytte fordi de ikke fant veien *inne* på stasjonen.

---

## Forbeholdet

Vurderingen sier det om seg selv, og det gjelder dette dokumentet også:

> Dette er en vurdering av skjermbildene og den synlige funksjonaliteten,
> ikke en brukertest. Jeg ville validert særlig handlingsorientert
> navigasjon og den sammenkoblede kart-/avgangsvisningen med faktiske
> reisende før større investeringer.

Og én ting til, som revisjonen la til: **vurderingen er i seg selv en
måling.** En oppmerksom leser studerte skjermbildene og konkluderte med at
appen ikke forstår om en avgang kan nås — mens den har visst det i sytti
utgivelser. Det var ikke funksjonen som manglet. Det var ordene.
