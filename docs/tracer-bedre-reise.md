# Tracer 2: gir et annet utgangspunkt en bedre reise?

**Dato:** 2026-11-24. **Status:** undersøkelse. Ingen endring i `src/`.

**Skript:** `scratchpad/tracerBedreReise.mjs`, mot ekte Entur. To
kjøringer. Rådata ligger i `scratchpad/data/tracerBedreReise-kjoring{1,2}.json.gz`.

**Slik er tallene produsert:** alle tabeller er regnet fra rådata (ankomst og
bytter per reise) med rapportens kategorier. Reproduser dem uten nettkall:

    node scratchpad/tracerBedreReise.mjs --analyse scratchpad/data/tracerBedreReise-kjoring2.json.gz

Begge filene er kontrollert. Utdataene gir nøyaktig tallene under.

**Merk om rådataene:** feltet `klasse` i JSON-filene er en **eldre
klassifisering** fra skriptets `utfall()`. Der ble «færre bytter og inntil
4 min senere» regnet som «alternativet bedre». Det strider mot rapportens
regel, og **ingen tall i rapporten er hentet fra det feltet**. Funksjonen er
erstattet av `kategori()`, som er rapportens definisjon, og `--analyse`
bruker den.

**Spørsmål:** hvor ofte gir et alternativt utgangspunkt en bedre
reiseopplevelse, når vi regner med kostnaden ved å komme dit?

**Hypotese** (omformulert etter tracer 1,
`docs/tracer-sammenlign-utgangspunkt.md`): *et nærliggende utgangspunkt gir
oftere enklere eller raskere reiser til de samme målene.*

## Kort svar

| resultat (du står på A; B = gå til det andre stedet først) | tolkning | kjøring 1 | kjøring 2 |
|---|---|---|---|
| **B er raskere** (≥ 5 min tidligere fremme) | gangturen gir tidsgevinst | 1 (0 %) | 1 (0 %) |
| **B gir omtrent samme tid** (± 5 min) | mulig gevinst i komfort eller enkelhet | 92 (26 %) | 104 (30 %) |
| – med færre bytter | | 43 (12 %) | 43 (12 %) |
| – med like mange bytter | | 34 (10 %) | 42 (12 %) |
| – med flere bytter | | 15 (4 %) | 19 (5 %) |
| **B er langsommere** (≥ 5 min senere) | gangturen lønner seg ikke tidsmessig | 223 (63 %) | 210 (60 %) |
| **uavklart** | ingen reise funnet fra minst ett av dem | 36 (10 %) | 37 (11 %) |
| – ingen reise funnet fra noen av dem | | 20 | 20 |
| – bare herfra (ingen via alternativet) | | 13 | 14 |
| – bare via alternativet (ingen herfra) | | 3 | 3 |

Hver kjøring har 352 sammenligninger.

**Om de to kjøringene.** Samme søkegrenser, men **ikke** samme dager og
**ikke** samme utvalg fullt ut:

| tidspunkt | kjøring 1 | kjøring 2 |
|---|---|---|
| tirsdag 08 | 24.11. kl. 08 | **1.12. kl. 08** (en uke senere, se under) |
| tirsdag 12 | 24.11. kl. 12 | 24.11. kl. 12 |
| tirsdag 22 | 24.11. kl. 22 | 24.11. kl. 22 |
| lørdag 12 | 28.11. kl. 12 | 28.11. kl. 12 |

- **Kjøring 1** er kontrollert mot ankomstdatoene i rådataene. Avreisetiden
  ble ikke lagret i den kjøringen.
- **Kjøring 2** har avreisetiden lagret, og 08-tidspunktet var 1.12.
  Skriptet regnet «neste tirsdag 08» fra kjøretidspunktet. Kjøring 2 startet
  etter kl. 08 norsk tid den 24.11., så 08-tidspunktet havnet en uke senere
  enn de andre. Det var en **feil i skriptet**. Tidspunktene er nå faste og
  må oppgis (`--tirsdag ÅÅÅÅ-MM-DD`).
- **Utvalget** ble trukket på nytt fra en live oppdagelse i hver kjøring, og
  det varierer:
  - Mortensrud ↔ Hauketo: 3 av 15 mål ulike;
  - Helsfyr ↔ Oslo S: 2 av 15 mål ulike;
  - Nesttun ↔ Paradis: identisk.

  Utvalget lagres nå og kan gjenbrukes (`--utvalg`).
- **Hovedmønsteret er stabilt:** 1 raskere, 43 med ett bytte færre og 60–63 %
  langsommere.
- **Enkelttallene varierer:** «omtrent samme tid» er 92 og 104, og «like mange
  bytter» 34 og 42.
- Med ulike dager for 08-tidspunktet og delvis ulike mål er kjøring 2 en
  **gjentakelse med variasjon**, ikke en ren reproduksjon. At hovedmønsteret
  står likevel, er et svakt tegn på robusthet. Det er **ikke en uavhengig
  validering** av at utvalget representerer kollektivtilbudet.

**Hvor stor forskjellen er** (kjøring 2, ankomst; positivt betyr at B er
fremme tidligere): median **−30 min**. Persentil 10–90 går fra −60 til 0, og
høyeste verdi er +11 min (én gang).

**Konklusjon:**
- **Det er ikke dokumentert at det lønner seg tidsmessig å gå til et annet
  utgangspunkt.** Bare 1 av 352 sammenligninger ga minst 5 min tidsgevinst,
  og den største gevinsten var 11 min. Det gir ikke grunnlag for å
  presentere et annet utgangspunkt som en generell snarvei.
- **Det finnes enkelte reiser der brukeren kan bytte gangtid mot færre
  kollektivetapper eller færre bytter**, uten vesentlig senere ankomst.
  Det gjelder 43 tilfeller, som er **20 ulike reisemål** fra 3 utgangspunkter.
  Mange av dem går igjen på flere tidspunkt.
- **Det er en reell, men smalere produktmulighet:** en annen
  **reiseprofil**, ikke en raskere reise.
- **Forklaring:** når målet er kjent, vurderer reisesøket fra der du står
  allerede å gå til et annet stopp. Å overstyre det gjør reisen tregere i tre
  av fem tilfeller.

## Datagrunnlaget per sammenligning

Er det lagret nok til å rekonstruere hver enkelt sammenligning? Kontrollert
felt for felt i begge rådatafilene (352 sammenligninger hver):

| det som trengs | kjøring 1 | kjøring 2 |
|---|---|---|
| utgangspunkt og alternativ | ja (`par`, `A`/`B`, `påA`/`påB`) | ja |
| reisemål | navn og avstandsbånd. Ingen NSR-id, men navnene er entydige innen hvert par | samme |
| avreisetidspunkt | **nei.** Bare merkelappen («tirsdag 08»). Datoene er utledet av ankomstdatoene (alle 24.11. og 28.11.) | ja (`avreiseMs`). 08 var 1.12. |
| gangtid til alternativet | ja, per par (`gangMin`) | ja, per rad |
| ankomst, begge reisemåter | ja | ja |
| avgang (første etappe) | **nei** | **nei** |
| antall bytter | ja | ja |
| transportmiddel | **nei.** Bare linjekoder, der «3» kan være T-bane eller buss | ja (`moduser`) |
| direkte, gange i søket, kollektivtid | nei | ja |
| ingen reise funnet / feil | ja (`funnet` false eller null; ingen null forekom) | ja |
| kjøring | filnavnet | filnavnet |
| utvalg | utledet av radene (`mål` + `bånd`) | samme |

**Hva konklusjonene bygger på:**
- **Kategoriene og tidsforskjellene** (rapportens hovedtall) bruker bare
  ankomst og bytter for begge reisemåter fra samme starttidspunkt. Det finnes
  i begge kjøringene.
- **Starttidspunktet** er felles for begge armene i en sammenligning: fra A
  ved t, og via B ved t + gangtid. Derfor trengs ikke selve t for å
  sammenligne ankomst.
- **Transportmiddel, direkte reiser og konsentrasjonen** kommer **bare fra
  kjøring 2** og er merket slik.
- **Avgangstid** er ikke brukt i noen konklusjon. Den finnes ikke i noen av
  kjøringene.

**Hull, ikke rettet med nye data:**
- kjøring 1 mangler avreisetidspunkt og transportmiddel;
- ingen av kjøringene har mål-id eller avgangstid.

Skriptet lagrer nå `målId`, `avgang`, `avreise` (ISO) og utvalget for
senere kjøringer.

## Måleregler

1. **Hele reisen fra samme starttidspunkt.**
   - «Fra A» er reisesøk fra A, avreise t.
   - «Via B» er gange fra A til B pluss reisesøk fra B, avreise t + gangtid.
   - Begge sammenlignes på **ankomst**, så gangtiden ligger i totalen.
   - Gangtiden er anslått som luftlinje × 1,3 ved 80 m/min (Valhalla nås ikke
     herfra): 24, 44 og 31 min for de tre parene.
   - **Forbehold:** reisesøket starter 2 min før oppgitt tid
     (`LOOKBACK_MINS`). B kan få en avgang inntil 2 min før du rekker fram, så
     det gir B en liten fordel. Det endrer ikke konklusjonen.
2. **Tid og kvalitet hver for seg.** Per reise er registrert:
   - ankomst;
   - antall bytter og om den er direkte;
   - gange i reisesøket;
   - tid fra første til siste reiseetappe;
   - linjer og transportmidler;
   - antall alternativer (ulike linjekombinasjoner fremme innen 30 min etter
     den beste, høyst 3 spurt).
   «Samme tid, færre bytter» rapporteres for seg og regnes ikke som «bedre».
3. **Utvalg.**
   - Målene trekkes fra stedene **minst ett** av utgangspunktene når med høyst
     ett bytte ifølge nettverksutforskeren. Det er unionen, ikke snittet,
     fordi bare felles mål ville utelatt stedene der forskjellen kan være
     størst.
   - **Hvordan målene trekkes:**
     - Stedene deles i avstandsbånd fra midtpunktet: 0–5, 5–15, 15–50, 50–150
       og 150+ km.
     - Innen hvert bånd sorteres de på NSR-id (stoppestedets id i Enturs
       register).
     - Hvert k-te tas, der k er antallet delt på 3, med høyst 3 per bånd. Det
       gir 14–15 mål per par.
   - **Hva utvalget er:** stratifisert på avstand og deterministisk gitt
     oppdagelsens resultat.
   - **Hva utvalget ikke er:** tilfeldig, eller statistisk eller geografisk
     representativt.
     - NSR-id-rekkefølgen er administrativ. Den gir ingen sikret spredning i
       retning, transportmiddel eller stedstype.
     - Tre mål per bånd er for få til å anslå andeler med noen presisjon. En
       andel på 12 % bygger på 43 tilfeller, men bare 20 ulike mål.
     - Oppdagelsen er live, så samme skript kan gi et annet utvalg en annen dag.
   - **Samme mål på alle tidspunkt** innenfor en kjøring, men ikke mellom
     kjøringene (se over).
   - **Kjent skjevhet:** utvalget arver utforskerens grenser (ett bytte,
     ordinært søkevindu, høyst 15 knutepunkter). Mål som bare nås med to
     bytter eller utenfor vinduet, er ikke med.
   - Mål innen 400 m fra et av utgangspunktene er utelatt.
4. **Ingen reise funnet er ikke det samme som utilgjengelig.**
   - «Uavklart» betyr at reisesøket ikke ga noen reise innen standard
     søkevindu og 3 mønstre. Det betyr ikke at målet ikke kan nås.
   - Ingen søk feilet med nettfeil.

## Mønstre (kjøring 2)

Merk: «tirsdag 08» i kjøring 2 er **1.12.**. De andre tidspunktene er 24.11.
og 28.11.

**Per utgangspunkt** (du står på X, alternativet er Y):

| står på | samme tid, færre bytter | samme, like mange | samme, flere bytter | langsommere | uavklart |
|---|---|---|---|---|---|
| Mortensrud (→ Hauketo, 24 min) | **18** | 15 | — | 24 | 3 |
| Hauketo stasjon (→ Mortensrud) | — | 8 | 9 | **39** | 4 |
| Helsfyr (→ Oslo S, 44 min) | **17** | — | — | 37 | 5 |
| Oslo S (→ Helsfyr) | — | — | 6 | **48** | 6 |
| Nesttun (→ Paradis, 31 min) | — | 5 | 4 | 37 | 10 |
| Paradis (→ Nesttun) | **8** | 14 | — | 25 | 9 |

Helsfyr → Oslo S har i tillegg én «raskere».

- **Knutepunkter:** gevinsten finnes bare fra det svakere stedet mot det
  sterkere (Mortensrud → Hauketo stasjon, Helsfyr → Oslo S, Paradis →
  Nesttun). Fra det sterkere lønner det seg aldri.
- **Tid på døgnet:** omtrent like mange «samme tid, færre bytter» ved alle
  fire tidspunkt (10–12). I kjøring 1, der alle tidspunkt er de tilsiktede
  dagene, var tallene 8–13. Kvelden har flere uavklarte (18 mot 6–7).
- **Transportmiddel** (alternativets reise): gevinsten finnes nesten bare når
  alternativet starter med **tog** (28) eller **buss** (13), og aldri med
  T-bane.

| alternativet reiser med | samme, færre bytter | langsommere |
|---|---|---|
| tog | 28 | 76 |
| buss | 13 | 83 |
| trikk/bybane | 2 | 22 |
| T-bane | 0 | 29 |
| **sum** | **43** | |

**Tolkes forsiktig.** Dette viser ikke en generell forskjell mellom
transportmidlene. Fordelingen kan skyldes rutetilbudet ved disse seks
stedene, hvilke mål som kom med i utvalget, eller hvordan alternativet er
konstruert (gange til et sted, så reisesøk derfra).

**Konsentrasjon.** De 43 tilfellene er 20 ulike mål:
- 18 fra Mortensrud, 17 fra Helsfyr og 8 fra Paradis;
- flere mål går igjen på alle fire tidspunkt: Ski, Eina og Lunner fra
  Mortensrud, Hokksund fra Helsfyr.

Det er altså noen få linjeforbindelser (tog L2 fra Hauketo, tog fra Oslo S)
som står for nesten hele gevinsten. Det er ikke 43 uavhengige muligheter.

- **Typisk eksempel:** Mortensrud → Holmlia stasjon, kl. 08. Enten buss 73X
  og så tog L2, eller **24 min gange** til Hauketo og så L2 direkte. Du er
  fremme samtidig. Gangturen erstatter bussetappen.
  - Det er **ikke en raskere reise**, men en annen reiseprofil.
  - Noen vil foretrekke den, for eksempel fordi de slipper å bytte eller vil
    gå. Andre vil ikke, for eksempel med bagasje, i dårlig vær eller med
    nedsatt gangevne.
- **Direkte reiser:** i 14 av 43 tilfeller blir reisen direkte via
  alternativet. I resten blir den ett bytte kortere, for eksempel L2 → RE30
  i stedet for 73 → L2 → RE30.

## Hva dette betyr

1. **Ikke bygg «hva er det beste utgangspunktet?» for å komme raskere fram.**
   Funksjonen ville nesten alltid ta feil, fordi reisesøket allerede velger
   utgangspunkt når målet er kjent.
2. **Det som finnes, er en situasjonsbestemt avveining,** ikke en generell
   anbefaling. Den gjelder ca. 12 % av sammenligningene og 20 ulike mål, og
   nesten bare fra et svakere sted mot en togstasjon eller et større
   knutepunkt.
   - Den passer som et alternativ **på reiseraden det gjelder**: «Du kan også
     gå til Hauketo stasjon (24 min) og ta L2 direkte i stedet for buss og
     tog. Omtrent samme ankomst.»
   - Formen finnes i appen (AGENTS.md: «rekk den på Stenbråten · 10 min å
     gå»).
   - **Ingen funksjonalitet er bygget.**
3. **Det åpne spørsmålet er brukerbehovet,** og det kan ikke måles herfra:
   går folk 24–44 min for å slippe ett bytte? Det må avklares i en brukertest
   før noe bygges.

## Avgrensninger

- Seks utgangspunkter (to byer) og fire tidspunkt. Kjøringene ble tatt
  24.11., men gjelder reiser 24.11., 28.11. og (kjøring 2, kl. 08) 1.12. Ikke
  målt over flere uker.
- **Utvalget** er stratifisert og deterministisk, men ikke representativt
  (se Måleregler 3). Andelene gjelder disse 14–15 målene per par, ikke
  kollektivtilbudet generelt.
- Bygd og ferge er ikke med. Der er avstanden mellom stoppesteder større, og
  avveiningen kan se annerledes ut.
- Gangtiden er et anslag fra luftlinje. Faktisk gangvei kan være lengre.
- Reisesøket gir høyst 3 mønstre per søk. Antall alternativer er derfor en
  nedre grense.
