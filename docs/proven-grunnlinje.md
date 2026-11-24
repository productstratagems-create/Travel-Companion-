# Proven-grunnlinjen — hva en kollektivapp forventes å kunne

**Proven** (`docs/produktretning.md`) er konvensjonene brukere tar med seg
fra Google Maps, Entur, Ruter, Citymapper og Transit. De skal finnes og
virke som forventet, uten innovasjonsbudsjett. Dette dokumentet er den
fullstendige lista, med status mot koden per **2026-11-24** (v1.218.298).

Statusene er fra kodesøk og stikkprøver, ikke fra kjøring av hver
funksjon. Tre fravær er bekreftet med søk i `src/`: `arriveBy`,
`Notification`/`showNotification` og `pageCursor`.

## Grunnlinjen

| # | funksjon | status | bevis / hva mangler |
|---|---|---|---|
| 1 | reisesøk A→B med flere alternativer | finnes | `src/api/queries.js` `tripGQL` (`numTripPatterns`); `src/views/auto.js` `autoRoute`, `groupDirections` |
| 2 | velge tidspunkt: avreise, **ankomst**, tidligere/senere | **delvis** | bare avreise (`src/views/explore.js`, «når»). Ingen `arriveBy`, ingen tidligere/senere reiser (`pageCursor`) |
| 3 | stedssøk med forslag | finnes | `src/ui/stedVelger.js`, `src/ui/suggest.js`, `src/api/places.js` |
| 4 | favoritter, hjem/jobb, nylige | finnes | `src/ui/favs.js`, `src/views/favs.js`, `src/api/recentDests.js` |
| 5 | avgangstavle i nærheten med sanntid | finnes | `src/views/board.js`, `src/views/auto.js` |
| 6 | kart: posisjon, stopp, rute, fargekoder | finnes | `src/ui/map.js`, `src/ui/mapIcons.js`, `src/ui/linjemerke.js` |
| 7 | forsinkelser og innstilte avganger | finnes | `src/innstilt.js`, `src/ui/tavleRad.js` |
| 8 | avviksmeldinger | finnes | `src/api/situations.js` (`relevance`), `src/ui/alerts.js` |
| 9 | veiledning underveis: neste stopp, gå av, bytt | finnes | `src/views/journeyStrip.js`, `alightEyebrow`, `src/overganger.js` |
| 10 | **varsler**: «gå av nå», «avgangen går om 5 min», endret lagret reise | **mangler** | ingen push og ingen lokale varsler. Bare et 10 ms trykk (`auto.js`) og kalenderpåminnelse |
| 11 | gangvei til stoppet | **delvis** | gangen rutes (`src/api/walkApproach.js`, `gangTilStopp.js`). `steps` brukes bare til «om Karl Johans gate» ved omvei (`src/ui/reiselop.js` `omvei`), ikke sving for sving |
| 12 | tilgjengelighet (trinnfri; appens egen) | **delvis** | trinnfri leses (`src/api/stoppested.js`), men Entur gir mest «UNKNOWN» (`produktretning.md`). Rundt 160 `aria-` i `src/` |
| 13 | **billett, pris, soner** | **mangler** | Entur Offers krever avtale. Håndholdt prisliste er utsatt (`produktretning.md`) |
| 14 | bysykkel og sparkesykkel | finnes | `src/api/bysykkel.js`, `src/api/scooters.js` |
| 15 | belegg | finnes | `src/api/belegg.js` |
| 16 | reisepreferanser: færre bytter, mindre gange | **delvis** | bare transportmidler (`transportModesGql`, `src/tavlaModuser.js`). Ingen `transferPenalty`, `walkReluctance` e.l. |
| 17 | del reisen / ankomsttid | **delvis** | deler ruten (`src/ui/shareRoute.js`, `navigator.share`), ikke levende ankomsttid |
| 18 | PWA, offline, widget | **delvis** | `public/sw.js` lagrer app-skall og fliser; manifest og installasjon finnes. Ingen widget |
| 19 | linjevisning og rutetabell per linje | **delvis** | levende kjøretøy per linje (`src/api/vehicles.js`, `trainPosition.js`), én turs stopp (`reiselop.js`). Ingen rutetabell per linje |
| 20 | språk og mørk modus | **delvis** | mørk modus (`src/theme.js`). Bare norsk, ingen i18n |
| 21 | kalender og planlagte reiser | finnes | `src/api/plan.js`, `src/api/ics.js` |
| 22 | vær | finnes | `src/api/weather.js` |
| 23 | spor/plattform og togposisjon | finnes | `src/ui/tavleRad.js` (`quay.publicCode`), `src/views/trainPosition.js` |
| 24 | personlig: vaner og prediksjon | finnes | `src/vane.js`, `src/api/usual.js` («din vanlige går ikke nå»). Én lokal profil |

**Sum: 14 finnes, 7 delvis, 3 mangler.**

## Vurdering

**Grunnlinjen er sterk.** Flere punkter går lenger enn konkurrentene: vær og
mørke, belegg, togposisjon og «din vanlige går ikke nå», alt lokalt uten
server. Det særpregede, altså **New**, er fortsatt tillitsgraden: målt /
anslag / vet ikke (`produktretning.md`).

**Hullene, i PULL-rekkefølge:**

1. **Varsler (#10).** Dette er det mest forventede i underveisfasen, og
   visjonen spør selv «når går jeg av». Appen vet svaret
   (`alightEyebrow`), men sier det bare når skjermen er oppe. Det må
   prøves på telefon. Lokale varsler og vibrasjon i en PWA kan ikke
   verifiseres herfra.
2. **«Ankomst kl.» og tidligere/senere (#2).** Dette er standard i alle
   reiseplanleggere. Det er billig, fordi Entur JP har `arriveBy` og
   `pageCursor`. Det er Proven i ren form: ingen ny idé, bare forventet
   oppførsel.
3. **Færre bytter / mindre gange (#16).** Det er én innstilling, og Entur
   har parameterne. Feltnavnene må prøves mot API-et som probe med
   reserve.
4. **Engelsk (#20).** Det gjelder turister og tilflyttere. Arbeidet er stort
   (all tekst er skrevet direkte i koden), og PULL er middels.
5. **Billett (#13).** Dette ligger utenfor rekkevidde uten avtale. Det bør
   **sies**, med en lenke til Entur- eller operatørappen fra reisen, ikke
   bygges halvt.

De andre delvise punktene (#11, #12, #17, #18, #19) er mindre. Datagrunnlaget
for tilgjengelighet (#12) er Enturs, ikke vårt.

## Teknisk risiko

`src/views/auto.js` er **7 429 linjer** og bærer det meste av tavla og
auto-reise. Proven-arbeid i førvalgsfasen, som #2 og #16, havner der og blir
dyrere og mer risikabelt. Mønsteret fra «ett bytte» virket: egne moduler,
noen få merkede kroker, og en test som binder antallet kroker. Det bør
gjenbrukes for nye funksjoner i den fasen.
