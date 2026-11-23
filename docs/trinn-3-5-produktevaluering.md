# Trinn 3.5: produktmessig evaluering av oppdagede opsjoner

Plangrunnlaget, steg 2. Spørsmålet er hvilke av demonstratorens funn som
faktisk utvider brukerens handlingsrom. Dette er en evaluering av hva
brukeren kan gjøre, ikke en optimalisering av nettverkssøket.

Merking:

| merke | betyr |
|---|---|
| **[Kode]** | verifisert i koden |
| **[Målt]** | kjørt mot Entur 2026-11-23 rundt kl. 14 |
| **[Tolkning]** | faglig vurdering av målingene |
| **[Hypotese]** | ikke prøvd |

## Måleoversikt (alt som ligger til grunn)

| # | kjøring | kall | tid |
|---|---|---|---|
| M1 | demonstratoren (commit `0f5f7fe`) med full utskrift for Mortensrud, Nesttun, Ranheim og Tretten kl. 12:00 og Mortensrud kl. 01:30 | 5 / 5 / 5 / 5 / 4 | 6,6 / 7,9 / 4,1 / 3,2 / 2,3 s |
| M2 | ledd 2 fra de 15 første knutepunktkandidatene per sted, i én spørring per sted | 4 | 0,4–1,1 s per kall |
| M3 | Oslo S med 180 min vindu | 1 | 0,2 s |
| M4 | Bergen stasjon (`NSR:StopPlace:59983`) med 180 min vindu | 1 | 0,7 s |
| M5 | gangtid (`directMode: foot`) til 12 tilgangspunkter, i én spørring | 1 | 0,2 s |

- M1 ga de samme hovedtallene som `docs/nettverksdemonstrator.md`: 1 067, 783,
  545, 758 og 17 destinasjoner.
- M1–M5 ble kjørt med en kopi av proben i den midlertidige scratchpad-mappen.
  Kopien hadde én endring: den skrev ut hele opsjonssettet og ikke bare 50.
  Analysen er gjort i Python på denne utskriften, og ingen kode i repoet er
  endret.
- **Rettelse:** et første forsøk på M4 brukte feil id (`59870`) og er
  forkastet.
- **«Dagens tavle»** er gjennomgående en tilnærming: de 30 første avgangene i
  tid fra nærmeste stopp innen 850 m. Nabostoppene tavla fletter inn er ikke
  med. Det som står som nytt, er derfor en øvre grense [Kode, Tolkning].
- **Analyseenhetene.** Destinasjoner er ikke handlinger. Tre enheter brukes
  derfor:
  - **linjeretning**: linje + skiltet retning. Én linjeretning bærer mange
    destinasjoner. Den er en grov tilnærming til «én ting brukeren kan
    gjøre».
  - **område**: 8 kompassretninger × 5 avstandsbånd (0–5, 5–15, 15–50, 50–150
    og 150+ km). Det tilnærmer «et nytt sted å kunne dra».
  - **destinasjon**: samlestopp.

---

## 1. Kort konklusjon

- **[Tolkning] Antall destinasjoner er et misvisende mål.** De 1 067
  destinasjonene fra Mortensrud kommer fra omtrent 122 linjeretninger og
  dekker 32 områder. Det er linjeretningene og områdene som er handlinger.
  Medianen er 15 destinasjoner per linjeretning, 92 % av destinasjonene er
  ikke endestopp, og 54 % kan nås fra flere enn ett tilgangspunkt. Det
  samme mønsteret gjelder på alle fire stedene, med 32–99 % nådd fra flere
  tilgangspunkter [Målt].
- **[Målt] Det demonstratoren gir mest av, er nye områder via knutepunkter.**
  Tavla dekker 13 områder fra Mortensrud. Ledd 1 fra flere tilgangspunkter
  øker det til 16, og ledd 2 til 32. Tallene er 6 → 13 → 20 for Ranheim, 4 →
  13 → 20 for Tretten og 13 → 13 → 30 for Nesttun.
- **[Målt] Ekstra tilgangspunkter gir nye transportmidler bare noen steder.**
  - Ranheim: tog R70 fra Ranheim stasjon, 8 min å gå.
  - Tretten: bestillingstaxi 5031 og ekspressbuss VY710, 510–650 m unna.
  - Mortensrud: tog L2 fra Hauketo, som er 32 min å gå.
  - Nesttun: ingen. Alle de andre bussene går mot Nesttun terminal.
- **[Målt] Utvelgelsen til reisesøk bruker budsjettet dårlig.**
  - Den velger endeholdeplasser (Gruvemyra, Ullerud, Fjellheimen) og nesten
    like steder (Solhjem og Solhjemslivegen, Støren sentrum og Støren
    stasjon).
  - Om natta bekreftet den 9 steder tavla allerede viser.
  - Den gir sikker kunnskap om tilfeldige punkter, ikke om handlingsrommet.
- **[Målt] Knutepunktvalget er ikke flaskehalsen.**
  - 15 knutepunkter i én spørring kostet 0,4–1,1 s, omtrent det samme som 5.
  - Kostnaden ligger i reisesøkene, ikke i antall knutepunkter.
- **[Målt] Fjerntog trenger lengre vindu, ikke flere ledd.**
  - Ett kall med 180 min fra Oslo S fant Kristiansand, Stavanger, Trondheim
    S, Voss og Dombås.
  - Ett kall fra Bergen stasjon fant Voss, Myrdal, Dale og Arna.
- **Anbefaling:** bygg trinn 4 rundt *linjeretninger og områder som enhet*,
  ikke destinasjoner. Bruk mange knutepunkter i ett kall, et
  tidsvindu som avhenger av transportmiddel, og et bekreftelsesbudsjett som
  bekrefter *ulike handlinger*, ikke ulike stopp. Se §11.

## 2. Hva demonstratoren faktisk har vist

**[Målt]**
- Opsjonskontrakten holder mot ekte data: 0 ugyldige opsjoner på tvers av
  M1.
- Grensene fra `docs/nettverksdemonstrator.md` er nådd: ≤ 5 kall, ≤ 8 s og
  10 av 10 bekreftet på dagtid.
- Fire steder med ulik tetthet ga meningsfulle resultater. Om natta var
  resultatet ærlig tomt: 0 knutepunkter, og én reise «ukjent» med
  begrunnelse.

**[Tolkning] Det demonstratoren ikke har vist:**
- at funnene er *relevante*;
- at utvelgelsen finner det viktigste;
- at «nye» destinasjoner er handlinger brukeren ikke allerede kjenner.

Demonstratoren beviser at nettverket kan *leses*, ikke at lesningen gir et
bedre produkt.

## 3. Representative eksempler

| sted | funn | hva det er | merke |
|---|---|---|---|
| Mortensrud | tog L2 mot Ski/Stabekk fra Hauketo stasjon | et transporttilbud som tavla ikke viser. Gangtiden er 32 min, så det er reelt bare med buss 73 dit. | [Målt] |
| Mortensrud | Kongsvinger stasjon: buss 73 → Hauketo → L2 → R14, 112 min | en forbindelse som kombinerer tre etapper. En ny region (Ø 50–150 km). | [Målt] |
| Mortensrud | Bergen stasjon: T-bane 3 → Oslo S → F4, første avgang 15:48 | nasjonal, *bekreftet, men senere* | [Målt] |
| Mortensrud | Hauketo stasjon nådd via Jernbanetorget, Nationaltheatret og Ski | samme destinasjon, tre nettverksveier. Ingen ny handling. | [Målt, Tolkning] |
| Mortensrud | Gruvemyra, Veståsen skole | endeholdeplasser valgt fordi de ligger lengst unna. Ingen kjent verdi for brukeren. | [Målt, Tolkning] |
| Nesttun | bussene fra Heradshuset, Hopstangen og Totlandsbru | alle går *mot Nesttun terminal*. Ingen ny handling fra flere tilgangspunkter. | [Målt] |
| Nesttun | Stavanger bussterminal: Bybanen → ekspressbuss NW400 | ny region (S 150+) via et knutepunkt som *ikke* er en stasjon (Gamle Bergen) | [Målt] |
| Nesttun | Bergen stasjon | **ikke oppdaget**. Ingen linje fra Nesttun stopper der. Overgangen går trolig til fots fra Bybanen. | [Målt, Hypotese] |
| Ranheim | tog R70 fra Ranheim stasjon, 577 m og 8 min å gå | nytt transportmiddel fra et nært tilgangspunkt. Utvider 6 → 13 områder. | [Målt] |
| Ranheim | Røros skysstasjon via Trondheim S, Steinkjer via Stjørdal | regionale handlinger | [Målt] |
| Tretten | bestillingstaxi 5031 til Flåtåmo | et fleksibelt tilbud som tavla ikke viser. Bekreftet av reisesøket. | [Målt] |
| Tretten | ekspressbuss VY710 mot Trondheim fra Holmen bru, 544 m | én avgang som åpner N 50–150+. Bekreftet: Trondheim S, Støren, Steinkjer. | [Målt] |
| Tretten | Gjøvik via Lillehammer | regionalt bytte med buss | [Målt] |
| Mortensrud 01:30 | Pasop | «ukjent». Ingen reise i søkevinduet, og det står ikke som «finnes ikke». | [Målt] |

## 4. Hvilke funn utvider handlingsrommet?

Funnene, sortert etter hva de gjør for brukeren:

| kategori | finnes i materialet? | omfang | vurdering |
|---|---|---|---|
| **Nytt område** via knutepunkt | ja | +16 (Mortensrud), +17 (Nesttun), +7 (Ranheim), +7 (Tretten) | **størst verdi** [Tolkning] |
| **Nytt transportmiddel** fra et annet tilgangspunkt | Ranheim (tog), Tretten (taxi og ekspressbuss), Mortensrud (tog, men langt å gå) | 1–3 tilbud per sted | **høy verdi der det finnes**. Tavla viser det ikke i dag [Tolkning]. |
| **Forbindelse** (flere etapper) | ja, 4–9 per sted | bare fra de 10 reisesøkene | verdifull, men vi ser bare de som tilfeldigvis ble valgt [Målt] |
| **Bekreftet, men senere** | Bergen stasjon 15:48, 3 i Nesttun | få | viktig å skille fra «nå». Modellen gjør det [Målt]. |
| **Alternativ vei til kjent mål** | ≥ 2 tilgangspunkter: 54 % (Mortensrud), 73 % (Nesttun), 99 % (Ranheim), 32 % (Tretten) | svært mange | er verdt noe bare hvis veien er *bedre* eller *robust*. Det kan bare reisesøket si, så i dag er det mest støy [Tolkning]. |
| **Ny retning** (linjeretning) | Mortensrud: 9 fra nærmeste stopp + 16 fra andre stopp + 97 i ledd 2 | moderat | den mest naturlige enheten for «andre muligheter» på tavla [Tolkning] |
| **Mellomstopp på kjent linje** | flertallet | 92–95 % er ikke endestopp, median 15–17 destinasjoner per linjeretning [Målt] | ingen ny handling i seg selv [Tolkning] |

**Hvor godt modellen dekker funnene** [Tolkning]
- `transport_offer`, `connection` og `destination` dekker funnene.
  Tilgjengeligheten `later` skilles riktig.
- `direction` med `basis: 'geographic'` og `area` finnes i modellen, men
  demonstratoren lager dem ikke. Det er der «nytt område» hører hjemme.

**Mangler som beskrives, uten at modellen endres:**
1. **Relasjonen destinasjon → retning eller område.** En destinasjon vet ikke
   at den er mellomstopp på en retning som allerede er en opsjon. Uten den
   relasjonen kan ikke relevanslaget folde 1 067 destinasjoner til ~120
   handlinger. Proveniensen har `lineId`, men ikke retningen.
2. **Gangovergang mellom stopp.** Bergen stasjon nås fra Bybanen til fots.
   `connection` kan uttrykke det (en etappe med `mode: 'foot'`), men ingen
   oppdager kan *finne* det fra stopplistene.
3. **Tilgangskostnad.** `walkMin` finnes, men fylles bare fra reisesøket.
   Luftlinje (`distanceM`) og gangtid må holdes adskilt, og det gjør modellen
   allerede. Ingen endring trengs.

## 5. Hva dagens tavle og hurtigvalg ikke fanger opp

| | Mortensrud | Nesttun | Ranheim | Tretten |
|---|---|---|---|---|
| destinasjoner tavla viser | 116 | 182 | 41 | 27 |
| via andre tilgangspunkter (ledd 1) | 166 | 1 | 81 | 29 |
| bare via knutepunkt (ledd 2) | 785 | 600 | 423 | 702 |
| linjeretninger fra tavla / andre tilgangspunkter / nye i ledd 2 | 9 / 16 / 97 | 10 / 7 / 45 | 4 / 7 / 43 | 2 / 2 / 48 |
| områder fra tavla → med ledd 1 → med ledd 2 | 13 → 16 → 32 | 13 → 13 → 30 | 6 → 13 → 20 | 4 → 13 → 20 |

Alle tallene er [Målt] i M1. «Tavla» er tilnærmingen beskrevet øverst.

**[Tolkning]**
- Tavla fanger ikke opp:
  1. tilbud fra et annet nært tilgangspunkt med et annet transportmiddel
     (Ranheim stasjon, taxi og VY710 ved Tretten);
  2. alt som krever ett bytte.
- Hurtigvalgene er retninger fra tavla (`andreRetninger` og målområder
  [Kode]), så de arver begge begrensningene.
- I Nesttun er tavla allerede rik: 13 områder fra ett stopp. Der kommer hele
  gevinsten fra ledd 2.

## 6. Utvelgelsen til bekreftelse

Regelen [Kode, `velgForBekreftelse`]:
1. Grupper på (hovedmodus, første knutepunkt).
2. Ta én fra hver gruppe etter tur.
3. I hver gruppe står den lengst unna først.

**Hva som blir valgt [Målt]**
- **Mortensrud:** Oslo lufthavn, Nationaltheatret, Kolsås, Råkendalen,
  Kongsvinger, Gruvemyra, Oslo bussterminal, Veståsen skole, Ullerud og
  Bergen.
  - 7 av 10 er endeholdeplasser på sin linje.
  - 3 av 10 er stopp tavla allerede viser.
- **Ranheim:** 8 av 10 fra togknutepunkter. Ronglan, Sparbu, Fjellheimen og
  Knausen er små stopp langt ute på linjene.
- **Tretten:** to par nesten like steder (Solhjem og Solhjemslivegen, Støren
  sentrum og Støren stasjon). 4 av 10 søk gikk altså med til nesten-dubletter,
  fordi destinasjoner fra ledd 2 deles på understopp.
- **Natt:** 9 av 10 er allerede på tavla. Budsjettet ga ingen ny kunnskap.

**Skjevheter [Tolkning]**
1. **Gruppene er svært ulike i størrelse, men får én plass hver.**
   Mortensrud: metro/Jernbanetorget har 375 kandidater og bus/direkte 74,
   men hver gruppe får ett søk. Det sprer budsjettet, men sier ingenting om
   bredden.
2. **«Lengst unna» betyr «endeholdeplass».** Valget gir rekkevidde, men ikke
   relevans. Brukeren drar sjelden til siste stopp på en linje.
3. **Hovedmodus beregnes for den sammenslåtte opsjonen**, ikke for stien.
   Nationaltheatret havnet i gruppen «tog» fordi én av stiene startet på
   Hauketo, selv om reisesøket valgte T-bane 3 [Målt]. Gruppenøkkelen
   blander stier.
4. **Kandidatene er destinasjoner, ikke handlinger.** Tilbud, retninger og
   områder bekreftes aldri for seg.

**Konsekvensen av taket på 10 [Tolkning]**
- Med 1 043 kandidater utenfor betyr 10 tilfeldige mål at 99 % av funnene
  står som `not_checked`. Det er ærlig, men gir lite.
- Et bedre *kunnskapsgrunnlag*, ikke en relevansscore, ville vært å bekrefte
  én representant per **ny linjeretning eller nytt område**. Da sier hvert
  søk noe om en hel gruppe funn. For Mortensrud ville 10 søk dekket 10 av de
  16 nye områdene i stedet for 10 stopp [Hypotese: ikke kjørt].

## 7. Knutepunktstrategien

Dagens regel [Kode]: modusskifte (tog, T-bane eller båt) først, deretter
antall linjer, og høyst 5.

M2 målte de 15 første kandidatene per sted. Dette er bare en måling; det er
ikke innført noen ny regel.

| sted | knutepunkt | valgt i dag | nye stopp | nye linjeretninger | nye områder |
|---|---|---|---|---|---|
| Mortensrud | Oslo S | ja | 122 | 23 | 12 |
| | Lysaker stasjon | **nei** | 288 | 31 | 10 |
| | Helsfyr | ja | 196 | 19 | 2 |
| | Skullerud, Bogerud, Bøler | nei | 2–29 | 1–2 | 0 |
| Nesttun | Handelshøyskolen (ikke stasjon) | ja | 366 | 16 | 12 |
| | Osøyro terminal | **nei** | 123 | 7 | 5 |
| | Bergen stasjon | **ikke kandidat** | — | — | — |
| Ranheim | Trondheim S | ja | 284 | 21 | 6 |
| | Melhus skysstasjon | **nei** | 101 | 7 | 5 (S 150+) |
| | Heimdal stasjon | ja | 81 | 10 | **0** |
| | 7 små stasjoner | nei | 1 | 0 | 0 |
| Tretten | Trondheim S (bare buss/ekspressbuss sett) | ja | 380 | 23 | 0 |
| | Oppdal skysstasjon | ja | 43 | 1 | 0 |

**Måling, ikke regel: grådig utvalg på nye områder og deretter nye stopp
[Målt]**

| sted | områder i dag | områder grådig | stopp i dag | stopp grådig |
|---|---|---|---|---|
| Mortensrud | 32 | 34 | 1 067 | 1 174 |
| Nesttun | 30 | 31 | 783 | 907 |
| Ranheim | 20 | 23 | 545 | 605 |
| Tretten | 20 | 20 | 758 | 772 |

**[Tolkning]**
- **Modusskifte er ikke et godt nødvendig kriterium.** I Nesttun var de beste
  knutepunktene bussterminaler (Handelshøyskolen og Gamle Bergen).
- **Et knutepunkt er verdifullt i den grad det åpner *nye* områder og nye
  linjeretninger.** Heimdal og Oppdal ga 0 nye områder. Lysaker og Melhus,
  som ikke ble valgt, åpnet 10 og 5 områder.
- **Gevinsten i områder er likevel liten**: +0 til +3. Valget av de 5 beste
  betyr mindre enn antatt.
- **Det viktigste funnet er at begrensningen på 5 ikke er nødvendig.**
  15 knutepunkter i ett kall kostet 0,4–1,1 s (M2). Første produksjonsversjon
  kan spørre bredt og la verdien vise seg i svaret, i stedet for å gjette
  foran.
- **Et knutepunkt som bare nås til fots kan ikke oppdages fra stopplistene.**
  Bergen stasjon er eksempelet. Det krever et oppslag i nærheten av
  knutepunktet, som allerede finnes i appen (`knutepunkt`, 640 m [Kode]), og
  er et eget valg.

## 8. Søkehorisont og nettverksdybde

| strategi | hva den avdekker | kostnad | risiko |
|---|---|---|---|
| **A** to ledd, 180 min fra togknutepunkter | Oslo S: Kristiansand, Stavanger, Trondheim S, Voss og Dombås, + 82 nye stopp. Bergen stasjon: Voss, Myrdal, Dale og Arna (M3, M4) [Målt]. | 1 kall, 0,2–0,7 s [Målt] | få dubletter. Fjerntog går sjelden, så lengre vindu gir de *ulike* avgangene [Tolkning]. |
| **B** tre ledd | ikke målt. Ville gått ut fra ~1 000 stopp. | minst 1 kall til, og et nytt utvalg av knutepunkter [Hypotese] | det meste blir mellomstopp, som i ledd 2, der median 15 destinasjoner per linjeretning [Tolkning] |
| **C** vindu etter transportmiddel og hyppighet: tog, ekspressbuss, båt og fly lenge, by-buss og T-bane kort | det A gir, og dessuten bygdene. Tretten hadde 9 avganger på 60 min, og ekspressbussen gikk én gang [Målt]. | samme antall kall som i dag [Tolkning] | må skalere med stedet, som `båndFor` (AGENTS.md: hele dekningsområdet) |
| **D** les døgntilbudet (`stoppInfoGql`, 24 t) for tilgangspunktene | «finnes i rutetilbudet, men ikke nå» om natta (`timetable: 'not_now'`) | 1 kall [Kode: finnes i appen] | sier ikke når neste avgang går [Hypotese] |

**[Tolkning] Anbefaling:** C, med A som det første konkrete tilfellet, og D
for natt og bygd. B anbefales ikke nå: den gir flere stopp, ikke flere
handlinger.

**Begrensning i datagrunnlaget [Målt]:** stopplistene viser bare hvor
kjøretøyet stopper. Overganger til fots og fleksible soner synes ikke.
Bestillingstaxi viste seg likevel som linje (5031).

## 9. Hauketo-funnet og tilgangspunktene

| sted | tilgangspunkt | luftlinje | gangvei | gangtid |
|---|---|---|---|---|
| Mortensrud | Hauketo stasjon | 1 482 m | 2 445 m | 32 min |
| Mortensrud | Stenbråten | 253 m | 358 m | 5 min |
| Nesttun | Midtun stasjon (Bybanen) | 1 065 m | 1 811 m | 27 min |
| Ranheim | Ranheim stasjon | 477 m | 577 m | 8 min |
| Ranheim | Ranheim idrettsplass | 121 m | 355 m | 5 min |
| Ranheim | Nedre Humlehaugen vest | 556 m | 1 053 m | 15 min |
| Tretten | Tretten stasjon (buss, ikke tog) | 217 m | 226 m | 3 min |

Alle tallene er [Målt] i M5.

**[Tolkning]**
- Forholdet mellom gangvei og luftlinje var mellom 1,04 og 2,9 i målingene.
  Det er ingen stabil faktor.
- Midtun er en Bybanestasjon, men geokoderen kaller den `railStation` [Målt].
  Kategorien «stasjon» er ikke det samme som tog.

**Anbefaling**
1. **Romslig søk for å finne tilgangspunkter.** Radius 1,5 km eller mer er en
   *søkeheuristikk*. Den finner Hauketo, Ranheim stasjon og ekspressbussen ved
   Tretten.
2. **Gangtid fra reisesøket som egenskap.** Ett kall ga gangtid for 12
   tilgangspunkter på 0,2 s (M5). Det gjøres for tilgangspunktene *før*
   kandidatene vurderes, og legges på `walkMin`.
3. **Når gangen er lang, er tilgangspunktet ikke en gangtilgang.** Hauketo
   nås med buss 73. Tilbudet der er reelt, men gjennom en forbindelse. Det
   gjør det til en `connection`, ikke en `transport_offer` fra posisjonen
   [Tolkning].
4. **Radiusen på 1,5 km gjeninnføres ikke i tavla.** Dette gjelder oppdageren,
   ikke tavlas stoppsøk (v1.218.275 ble tatt ut).

## 10. Fly

- **Ikke i første produksjonsversjon** [Tolkning]. Tavlespørringen utelater
  fly (`BOARD_MODES_COACH` [Kode]). Fly er sjeldne, planlagte reiser og ikke
  en del av «hva kan jeg gjøre nå».
- **Hvis det kommer:**
  - som en egen *oppdagelseskilde*, med flyplassen som tilgangspunkt nådd ved
    en forbindelse (Oslo lufthavn via FLY1, som allerede ble bekreftet,
    [Målt]);
  - ikke som en egen opsjonstype. `transport_offer` og `connection` dekker
    det.
  - Bekreftelsen må komme fra reisesøket med `air` i `transportModes`. Det er
    probet i demonstratoren uten avvisning [Målt], men ikke sjekket at fly
    faktisk kom med i svaret.
- **Konsekvenser for produktet:**
  - fly flytter fokus fra kollektivtrafikk i hverdagen til fritidsreiser;
  - billett og pris ligger utenfor Entur;
  - Trondheim S fra Mortensrud nås likevel med tog via 180 min-vinduet (M3),
    så fly trengs ikke for å nå landsdelene.

## 11. Anbefalt retning for trinn 4

### `src/nettverksutforsker.js` *har ansvar for*
- Å finne tilgangspunkter med et romslig søk og hente gangtid for dem i ett
  aliasert reisesøk.
- Ledd 1 fra alle tilgangspunktene og ledd 2 fra bredt sett med knutepunkter
  (≥ 15), i én spørring hver. Vindu og tak per transportmiddel og hyppighet
  (C), som parametere.
- Å bygge opsjoner etter kontrakten med full proveniens, inkludert
  **linjeretningen** (`lineId` + skiltet retning) på hver sti. Det er det som
  gjør folding mulig senere.
- Å lage `direction`- og `area`-opsjoner (basis `line` og `geographic`) ved
  siden av destinasjonene.
- Å rapportere hva som *ikke* ble undersøkt: vinduet, taket, knutepunkter
  som ikke ble spurt, og kall som feilet.
- Å holde et budsjett og en buffer: kall, tid og alder.

### Den har *ikke* ansvar for
- relevans, rangering eller hva brukeren ser (`mulighetsoppdagelse.js` og
  presentasjonen);
- snarveiene;
- å bekrefte reiser. Det er et eget steg, se under.
- å velge hvilke kandidater som skal bekreftes «fordi de er gode».

### Strategier i første versjon
1. tilgangspunkter: romslig søk og gangtid fra reisesøket;
2. ledd 1 og bredt ledd 2 med vindu per transportmiddel;
3. døgntilbudet for natt og bygd (D).

Ikke tre ledd, ikke fly, og ikke oppdagelse av gangoverganger. De to siste er
egne beslutninger.

### Budsjett og søkehorisont
- **Antall kall er den riktige enheten.** Én utforskning tilsvarer 6 kall:
  geokoder, gangtid, ledd 1, stoppinformasjon, ledd 2 og døgntilbud. Det er
  ≲ 5 s uten bekreftelse [Målt i delene].
- **Bekreftelse:** ett aliasert kall med N reisesøk, som er den tyngste
  delen (1,7–5,1 s).
- Grensene er parametere og bindes i dokumentasjonen, ikke i koden som
  sannheter.

### Data som må følge en oppdaget opsjon
- id, type og nøkkel;
- tilgangspunkter med samlestopp, understopp, plattform, transportmiddel og
  linje, **luftlinje og gangtid hver for seg**;
- stier med oppdager, tilgangspunkt, **linje + retning** og knutepunkter;
- oppdagelsessituasjonen (posisjon, tid, parametere);
- `timetable` fra døgntilbudet;
- område (sektor og avstandsbånd) som metadata.

### Overlevering
```
nettverksutforsker → { oppdagelse, opsjoner[], ikkeUndersøkt }
   → (eget steg) velgForBekreftelse: én representant per ny linjeretning/område,
     dedup på samlestopp og nærhet — måles før det brukes
   → reisesøk → confirmations + realisations (+ connection ved bytte)
   → mulighetsoppdagelse.js: folding (destinasjon → retning/område), relevans
   → presentasjon
```

**Prinsippet:** oppdageren finner, modellen representerer, reisesøket
bekrefter, og `mulighetsoppdagelse.js` vurderer.

## 12. Uavklarte spørsmål og risiko

**Beslutninger før trinn 4**
1. **Enheten for «en mulighet».** Skal linjeretning og område være
   førsteklasses opsjoner, og destinasjonene ligge under dem? Det krever
   relasjonen i §4, punkt 1, som er en modellendring og må godkjennes.
2. **Bekreftelsesbudsjettet.** Skal utvelgelsen endres fra «spre over modus
   og knutepunkt, lengst unna» til «én per nytt område eller ny
   linjeretning»? Det er fortsatt ikke en relevansscore.
3. **Tilganger med lang gang** (Hauketo). Skal de være forbindelser, ikke
   gangtilganger?
4. **Gangoverganger** (Bergen stasjon). Skal det bygges i trinn 4 eller
   senere?
5. **Fly.** Anbefalingen er nei i første versjon.

**Risiko**
- **Entur-last:** 6–7 kall per utforskning per bruker. Tålegrensen er ikke
  kjent [Hypotese].
- **Tidspunkt:** målingene gjaldt kl. 12:00, som var passert da de ble
  kjørt. Det er sanntid bare der Entur hadde det [Målt].
- **Grov tilnærming:** «Dagens tavle» er grovt anslått, og fletting av
  nabostopp er ikke med. Gevinsten i §5 er en øvre grense.
- **Grove områder:** 8 × 5 celler er en grov enhet og sier lite om lokale
  forskjeller i små steder [Tolkning].
- **Ulike stopp med samme navn:** dedup på understopp i ledd 2 teller
  samme sted flere ganger (Tretten). Det må løses før tallene brukes til
  utvelgelse.
