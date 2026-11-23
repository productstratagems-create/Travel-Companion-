# Hva kan jeg gjøre herfra?

*Et white paper om reisemulighetsmotoren i Travel Companion. Status per
november 2026 (gren `claude/hopeful-pasteur-c5yplf`).*

---

## 1. Kort fortalt

Travel Companion har fått en motor som kan svare på spørsmålet **«hva kan jeg
gjøre med kollektivtrafikken der jeg står akkurat nå?»**, uten at du har
bestemt deg for hvor du skal.

Motoren gjør tre ting:
1. Den leser kollektivnettet rundt deg, også det som krever ett bytte.
2. Den sjekker et utvalg av mulighetene mot Enturs reiseplanlegger.
3. Den holder hele tiden rede på forskjellen mellom hva den har *funnet*, hva
   den har *sjekket* og hva den faktisk kan *stå inne for*.

Motoren er bygget og testet, men er ennå ikke koblet til skjermbildene i
appen.

## 2. Problemet

Dagens verktøy for kollektivreiser er laget for folk som vet hvor de skal.

- **Reiseplanleggeren** (som i Entur-appen) er god på «hvordan kommer jeg til
  X?». Du må vite hva X er.
- **Avgangstavla** viser hva som går fra stoppet ditt. Du ser bare bussen og
  banen som går *direkte*. At du kan ta T-banen to stopp og bytte til en buss
  som tar deg et helt annet sted, står ingen steder.

Mellom de to finnes et tomrom: alt du *kunne* gjort, men ikke vet om. Det
gjelder særlig reiser med ett bytte, stopp litt lenger unna og tilbud som går
sjelden. En turist, en som er ny i byen, eller en som har en time ledig, har
ikke noe verktøy for å se dette.

## 3. Hva vi har bygget

Motoren består av fem deler. Hver er forklart med et hverdagsbilde. Navnet i
koden står i parentes for den som vil slå det opp.

### 3.1 Utforskeren: kartleseren (`src/nettverksutforsker.js`)

Tenk deg en lokalkjent som ser seg rundt for deg.

1. **Hvilke stopp kan du gå til?** Den ser ikke på avstand i luftlinje, men
   spør Entur hvor lang tid det tar å *gå*.
   - Eksempel: Hauketo stasjon ligger 1,5 km fra Mortensrud i luftlinje, men
     gangveien tar 33 minutter. Stasjonen regnes derfor ikke som «nær».
2. **Hva går derfra?** Alle linjer og retninger fra stoppene du kan gå til.
3. **Hvor kan du bytte?** Den finner knutepunktene linjene dine går til, for
   eksempel Helsfyr, Oslo S eller Bergen busstasjon. Der ser den hva som går
   videre.
   - Den velger knutepunktene etter hva de *tilfører*: nye linjer, ikke bare
     flere avganger.
4. **Hva går senere?** Er det lite som går akkurat nå, ser den på resten av
   døgnet. Om natta, eller på bygda midt på dagen, kan den derfor si «ikke nå,
   men kl. 13:02».

Den gjør alt dette med fem eller seks forespørsler til Entur, på 1–2,5 sekunder.

### 3.2 Muligheter og veier: notatboka (`src/opsjonsmodell.js`)

Alt utforskeren finner, skrives ned på en fast måte. To begreper er viktige:

- **En mulighet**, for eksempel «reise til Furuset skole» eller «ta toget fra
  Ranheim stasjon».
- **En vei** er én konkret måte å gjøre det på, for eksempel «T-bane 3 til
  Helsfyr, så buss 300».

Samme mulighet kan ha mange veier. Det holdes adskilt, slik at vi aldri
blander «stedet kan nås» med «denne veien dit fungerer».

### 3.3 Utvalget: stikkprøven (`src/reisebekreftelse.js`)

Utforskeren finner hundrevis av muligheter. Vi kan ikke sjekke alle mot
reiseplanleggeren hver gang, så vi tar en **stikkprøve på 10**.

Stikkprøven er laget for **bredde**, ikke for å finne «de beste» reisene. Den
prøver å dekke:
- ulike retninger og områder;
- ulike linjer og transportmidler;
- ulike stopp du kan gå fra;
- ulik avstand: nært og langt.

Den hopper over nesten-like muligheter, men kaster dem ikke.

### 3.4 Sjekken mot Entur: kontrolløren (`src/reisebekreftelse.js`)

For hver mulighet i stikkprøven spør vi Enturs reiseplanlegger om reisen fra
der du står, med gangdelen. Svaret brukes til to *forskjellige* ting:

- **Finnes det en reise til stedet?** Det kalles *opsjonsbekreftelse*.
- **Følger reisen veien vi fant?** Det kalles *veibekreftelse*. Vi
  sammenligner etappe for etappe: samme linje, samme sted å gå på, samme sted
  å gå av, og samme byttested.

Det kan godt være at stedet kan nås, men på en annen måte enn vi trodde. Det
blir da sagt, ikke skjult.

### 3.5 Ærlighet: regnskapsføreren

Dette er det viktigste prinsippet i hele motoren. Den skiller mellom:

| | betyr |
|---|---|
| **funnet** | vi så det i rutetabellen eller avgangsdataene |
| **sjekket** | vi spurte reiseplanleggeren |
| **bekreftet** | reiseplanleggeren fant en reise, og vi kan vise hvilken |
| **fulgt** | reisen går nøyaktig den veien vi fant |
| **ukjent** | vi har ikke nok data til å si det. Det er et eget svar, ikke et nei. |
| **ikke nå, men senere** | tilbudet finnes, men ikke i tidsrommet du ser på |
| **ikke fulgt i de 3 forslagene** | ikke det samme som «umulig» |

Det motoren *ikke* har grunnlag for, påstår den ikke. Et eksempel: ved bytte
har ikke vår egen mekanisme kontrollert at du rekker overgangen. Reisen Entur
foreslår, henger sammen i tid, men det er Enturs kontroll, ikke vår, og det
står eksplisitt.

## 4. Et eksempel: Mortensrud, tirsdag kl. 12:00

Du står på Mortensrud i Oslo.

**Avgangstavla i dag** viser blant annet T-bane 3 og flybussen FB10. FB10 går
via Furuset skole, men den gikk kl. 12:00 og neste går kl. 13:00.

**Motoren** fant blant annet at du kan komme til Furuset-området på en annen
måte:

> **T-bane 3 til Helsfyr, bytt til buss 300 eller buss 110.**
> Avreise 12:03 og framme 12:38, 31–36 minutter.

Enturs reiseplanlegger foreslo nettopp denne reisen, og den følger veien
motoren fant, etappe for etappe.

**Hva er nytt her?**
- **Sett fra tavla:** dette var usynlig, fordi det krever et bytte.
- **Sett fra reiseplanleggeren:** dette er det første den foreslår, *hvis* du
  allerede vet at du skal til Furuset skole.

**Det ærlige funnet:** motoren fant fire «veier», men de var bare *to*
forskjellige valg. De fire skilte seg bare i hvilken plattform T-banen går fra
og hva som står på skiltet. Vi må måle verdien i **forskjellige
valgmuligheter**, ikke i antall treff.

## 5. Hva det kan brukes til

| bruk | status |
|---|---|
| **«Hva kan jeg gjøre herfra?»**: utforske uten å ha bestemt seg for et mål. Retninger og byttemuligheter fra der du står. | Teknisk demonstrert. Brukerverdien er ikke testet. |
| **«Ikke nå, men kl. 13:02»**: på bygda og om natta skille mellom «ingenting går» og «noe går, bare ikke nå». | Demonstrert (Tretten, natt i Oslo) |
| **Stopp du ikke tenkte på**: et stopp litt lenger unna med et annet transportmiddel, for eksempel toget fra Ranheim stasjon, 8 minutter å gå. | Demonstrert |
| **Forstå knutepunktene**: hva et bytte på Helsfyr eller Lillehammer åpner for. | Demonstrert i data. Presentasjonen er ikke laget. |
| **Bredere hurtigvalg på tavla**: forslag basert på nettverket, ikke bare direkte linjer. | Hypotese |
| **Plan B når en linje er innstilt**: andre veier til samme sted. | Hypotese, ikke undersøkt |
| **Testgrunnlag for brukerundersøkelser**: konkrete, sjekkede eksempler å vise folk. | Klart til bruk |

## 6. Hva det ikke er

- **Ikke en bedre reiseplanlegger når du vet hvor du skal.** Der er Entur
  allerede god, og motoren bruker Entur.
- **Ikke en anbefaling.** Den sier ingenting om hva *du* bør gjøre, bare hva
  som er mulig.
- **Ikke tidskontroll av bytter.** Vi har ikke laget vår egen kontroll av at
  du rekker overgangen.
- **Ikke synlig i appen ennå.** Motoren er bygget og testet i bakgrunnen.

## 7. Hvor godt det virker

Målt på fem situasjoner: Mortensrud dag og natt, Nesttun i Bergen, Ranheim i
Trondheim og Tretten i Gudbrandsdalen.

- **Bredde:** fra Mortensrud fant motoren 169 ulike linjeretninger i 30
  geografiske områder. Avgangstavla alene dekker en brøkdel av dette.
- **Bygda:** ved Tretten gikk bare buss 141 i timen etter kl. 12. Gjennom
  døgnet fant motoren 27 linjeretninger, blant annet bestillingstaxi og buss
  til Otta og Ringebu, hver med neste avgang.
- **Kostnad:** 5–6 forespørsler for utforskningen og 1 for sjekken, totalt 3–5
  sekunder.
- **Sjekken (stikkprøve på 10):**
  - Ranheim: 10 av 10 bekreftet og fulgt.
  - Tretten: 9 bekreftet, 8 fulgt.
  - Natt i Oslo: 4 bekreftet og 6 «ukjent» (ingen reise i søket), ærlig
    oppgitt.
- **Bytte:** fem reiser med bytte, som den første sjekken hadde holdt utenfor,
  viste seg å følge Enturs egne forslag. Det gjelder Furuset (4) og Osøyro i
  Bergen (1).
- **Kvalitet:** over 4 500 automatiske tester. Hver regel er kontrollert ved
  at den er ødelagt med vilje, og testene har fanget det.

Alle målingene er gjort på opptak av Entur-data tatt dagen før reisetidspunktet,
altså rutetabell uten sanntid.

## 8. Begrensninger og åpne spørsmål

- **Relevans er ikke undersøkt.** Stikkprøven velger for bredde. Om
  mulighetene er *interessante for folk*, vet vi ikke ennå.
- **Treff er ikke valg.** Flere veier kan være samme reise sett fra brukeren.
  Det må slås sammen før det vises.
- **Bytter er ikke tidskontrollert av oss.** Det er Enturs reiser som henger
  sammen i tid, ikke vår egen kontroll.
- **Bare tre forslag sjekkes per sted.** «Ikke fulgt» betyr «ikke blant de tre
  første», ikke «umulig».
- **Tavla mangler stopplister for enkelte busser** (blant annet Skyss og FB10).
  Det er funnet underveis og meldt som egen sak (issue #771).

## 9. Neste steg

Det tekniske er langt nok kommet til å teste **ideen** på folk. Forslaget er en
liten brukertest:

> Du står på et knutepunkt og har en time ledig. Her er det som går herfra.
> Hva legger du merke til? Er det noe du ikke visste du kunne reise til? Er
> det noe du ville gjort? Hva savner du for å bestemme deg?

Til det trengs bare testmateriell: et konkret sted, et tidspunkt og 5–8
forskjellige, sjekkede muligheter. Det trengs ingen ny funksjonalitet.

Spørsmålet testen skal besvare:

> **Kan Travel Companion gjøre kollektivnettet til noe du utforsker, i stedet
> for noe du må kjenne målet ditt for å søke i?**

## 10. Ordliste

| ord | betyr |
|---|---|
| **Mulighet (opsjon)** | Noe du kan gjøre: reise til et sted eller ta et tilbud |
| **Vei** | Én konkret måte å gjøre det på, etappe for etappe |
| **Knutepunkt** | Stopp der du kan bytte til andre linjer |
| **Ledd** | En etappe i nettverket. «To ledd» betyr ett bytte. |
| **Linjeretning** | En linje i én retning, for eksempel «T-bane 3 mot Kolsås» |
| **Bekreftet** | Enturs reiseplanlegger fant en reise til stedet |
| **Fulgt** | Reisen går nøyaktig den veien motoren fant |
| **Ukjent** | Ikke nok data til å si ja eller nei. Ikke det samme som nei. |
| **Tilgangspunkt** | Stopp du kan gå til, ut fra faktisk gangtid |
| **Stikkprøve** | De 10 mulighetene som sjekkes, valgt for bredde |
