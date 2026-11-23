# Tracer: Mortensrud → Furuset skole

Ende-til-ende-sporing av alternativ B (commit `afa2fab`). Dette er en
undersøkelse, og ingen kode er endret. Midlertidig diagnostikk ligger i
scratchpad, utenfor repoet.

Merking: **[Opptak]** er data i opptakene. **[Kode]** er verifisert i koden.
**[Tolkning]** er en faglig vurdering. **[Ikke verifisert]** kan ikke
etterprøves her.

## 1. Scenario og datagrunnlag [Opptak]

- **Startposisjon:** 59.8487, 10.8291 (Mortensrud).
- **Reisetidspunkt:** tirsdag 2026-11-24 kl. 12:00.
- **Opptakene:**
  - oppdagelsen ble tatt 2026-11-23 kl. 14:57 UTC
    (`tests/fixtures/entur/mortensrud_dag.json.gz`);
  - reisesøket ble tatt 2026-11-23 kl. 19:12 UTC
    (`tests/fixtures/entur/mortensrud_dag.reisesok.json.gz`).

  Begge er tatt **dagen før**, altså rutetabell uten sanntid.
- **Opsjonen:** `destination:NSR:StopPlace:5620` Furuset skole (59.9375,
  10.8923). Rekkevidden er lokal, rundt 10 km nordøst.
- **Oppdagede veier til opsjonen:** 30, fordelt på 3 direkte (ledd 1) og 27
  med flere ledd (ledd 2). Alle er i ordinært vindu.

Scenarioet lar seg rekonstruere helt fra opptakene. Ingen verdier er gjettet.

## 2. Baseline: dagens løsning

| flate | hva den viser for Furuset skole | merke |
|---|---|---|
| **Auto-tavla** (nærmeste stopp Mortensrud, 78 m) | **FB10 (OSL-ekspressen)** kl. 12:00 og 13:00 fra Mortensrud har Furuset skole i stopplista. Den direkte bussen *er* synlig på tavla. Det samme gjelder FB10 fra Mortensrudkrysset kl. 12:02 og Dalsåsen kl. 12:01. | [Opptak] |
| **Hurtigvalg** (retning eller område) | Filtrerer tavlas avganger. Kan ikke vise en kombinasjon med bytte uten at et mål er valgt. Auto har reisesøk-baserte kombinasjonsrader (`kombiRader`) for valgt retning eller målområde. Om Furuset skole havner i et målområde fra Mortensrud, er ikke kjørt i UI. | [Kode], [Ikke verifisert] |
| **Ordinært reisesøk** (Rute, mål Furuset skole) | Samme `tripGQL` som bekreftelsen bruker, men med 12 mønstre i stedet for 3. De 3 første mønstrene i opptaket er nøyaktig **T-bane 3 → Helsfyr → buss 300 eller 110**. | [Kode], [Opptak] |

## 3. De fire oppdagede flerleddsveiene [Opptak]

Alle fire har tilgang fra Mortensrud (StopPlace 58228), knutepunkt Helsfyr
(59516) og destinasjonen Furuset skole (5620).

| # | etappe 1 (plattform, skilt) | etappe 2 (linje, skilt) | strukturelt fulgt i |
|---|---|---|---|
| A | T-bane 3, plattform 10421, «Kolsås» | buss 300 «Blystadlia» | mønster 0 og 2 |
| B | T-bane 3, plattform 10423, «Stortinget» | buss 300 «Blystadlia» | mønster 0 og 2 |
| C | T-bane 3, plattform 10421, «Kolsås» | buss 110 «Lillestrøm» | mønster 1 |
| D | T-bane 3, plattform 10423, «Stortinget» | buss 110 «Lillestrøm» | mønster 1 |

## 4. Entur-mønstrene som samsvarer [Opptak]

Disse dataene finnes i opptaket. Ingenting er hentet på nytt.

| mønster | gange | T-bane 3 | bytte på Helsfyr | buss | framme | reisetid | venting |
|---|---|---|---|---|---|---|---|
| 0 | 12:01–12:03 | 12:03 → 12:21 «Kolsås» | gange 6068 → 6071 (12:21–12:22) | **300** kl. 12:30 | 12:38 | 36 min | 8 min |
| 1 | 12:06–12:09 | 12:09 → 12:27 «Stortinget» | gange 12:27–12:28 | **110** kl. 12:34 | 12:42 | 36 min | 6 min |
| 2 | 12:16–12:18 | 12:18 → 12:36 «Kolsås» | gange 12:36–12:37 | **300** kl. 12:40 | 12:48 | 31 min | 3 min |

- **Påstigning og avstigning:** Mortensrud (understopp 5687 ⊂ 58228) →
  Helsfyr (6068 ⊂ 59516). Byttet går til Helsfyr T (6071 ⊂ 59516), og bussen
  går videre til Furuset skole (5620).
- **Parent-proben ga samlestoppene.** Uten den ville påstigningen på 5687 og
  6071 blitt `ukjent`.
- **Ventetiden** er regnet ut fra mønsterets tider, altså rutetid, ikke
  sanntid.
- **Overgangen** er en sammenhengende reise Entur har satt sammen. Den er
  **ikke** tidskontrollert av vår egen mekanisme, og resultatet sier det
  (`tidskobling`).

## 5. Kjeden, steg for steg

| steg | hva skjer med veiene A–D | data som følger med |
|---|---|---|
| 1. Utforskning | Ledd 1: T-bane 3 fra Mortensrud til Helsfyr. Helsfyr er valgt knutepunkt i fase 1 («11 linjer ikke dekket av ledd 1, nye transportmidler: ekspressbuss»). Ledd 2: buss 300 og 110 fra Helsfyr til Furuset skole. | `tilgang`, `inn`, `knute`, `directionId`, `vindu: ordinært`, `grunnlag: avgang i søkevinduet` |
| 2. Veier | 4 veier, pluss 23 andre flerleddsveier og 3 direkte veier til samme opsjon | `vei.id` er unik per plattform, linjeretning inn, knutepunkt og linjeretning ut |
| 3. Opsjon | Alle 30 veier hører til én opsjon (destinasjon 5620) | opsjons-ID og destinasjon |
| 4. Grense | A–D er **utenfor**: «flere ledd uten tidsmessig kontroll av overgangen». Opsjonen er kandidat via de 3 direkte FB10-veiene. | `grunnlag.kandidater` |
| 4. Utvelgelse | Opsjonen er valgt som nummer 2, med vei **FB10 fra Mortensrudkrysset** (59633). Den ga nytt område, ny linjeretning, ny transportform og nytt tilgangspunkt. | `valgt.vei`, `nytt` |
| 5. Reisesøk | Ett kall, 3 mønstre (se 4) | `request`, `searchedAt` |
| 6. Opsjonsbekreftelse | `confirmed`, første avgang kl. 12:03 | uavhengig av hvilken vei som følges |
| 7. Veibekreftelse, valgt vei | FB10 direkte er **ikke fulgt i de 3 mønstrene**. FB10 fra Mortensrudkrysset gikk 12:02, med 8 minutters gange [Opptak], og neste går kl. 13:00. Mønstrene er alle kombinasjoner med T-bane og buss. | `påstand` |
| 7. Veibekreftelse, alternativ B | A og B er fulgt i mønster 0. C og D er fulgt i mønster 1. 25 andre veier er ikke fulgt. | `øvrigeVeier[].veibekreftelse`, `grense`, `tidskobling` |
| 8. Kan presenteres | «Furuset skole: T-bane 3 til Helsfyr, bytt til buss 300 eller 110. Strukturelt samsvar med Entur-reise; tidskobling ikke kontrollert av oss.» Ingen UI finnes for dette ennå. | — |

**Hvor andre veier faller bort:**
- 25 av de 27 andre flerleddsveiene til samme opsjon er *ikke fulgt*:
  - 12 med etappe 1 på en annen linje eller med en annen avstigning (buss fra
    andre tilgangspunkter til andre knutepunkter);
  - 6 med en annen linje i etappe 2;
  - 5 med annen linje i begge etapper;
  - 2 med feil antall etapper.
- Det er veier som finnes i nettverket, men som Entur ikke foreslår blant de 3
  beste reisene. Det betyr ikke at de er umulige.

## 6. Hvilke alternativer er nye?

| alternativ | Auto-tavla og hurtigvalg | ordinært reisesøk | vurdering |
|---|---|---|---|
| T-bane 3 → Helsfyr → buss 300 eller 110 (A–D) | **ikke synlig** uten mål, fordi det krever bytte | **synlig**: det er Enturs tre første forslag | Nytt bare for *tavla uten mål*. Det er ikke nytt for en som søker Furuset skole. |
| FB10 direkte (den valgte veien) | **synlig** (avgang og stoppliste) | ikke blant de 3 første ved kl. 12:00 | Gammelt for tavla. Den gikk før brukeren rakk den. |

## 7. Hva som ikke gir merverdi

- **Fire veier er i praksis to reiser.** A/B og C/D skiller seg bare i
  T-bane-plattform (10421/10423, samme StopPlace) og skilttekst («Kolsås» /
  «Stortinget»). Begge er T-bane 3 vestover fra Mortensrud til Helsfyr. For
  brukeren er det én etappe.
  - Utvelgelsens dublettregel (2.1) gjelder kandidater, ikke de øvrige veiene
    i alternativ B. Derfor står de som fire.
  - Reelle valg: **buss 300 eller buss 110 fra Helsfyr.**
- **Destinasjonen er tilfeldig ut fra brukerens behov.** Furuset skole ble
  valgt for bredde (område, linjeretning, transportform), ikke fordi noen vil
  dit. At mekanismen kan bekrefte den, sier ingenting om relevans.
- **Kombinasjonen er Enturs standardforslag.** For en bruker som allerede vet
  målet, tilfører den ingenting.

## 8. Begrensninger og usikkerhet

- **Uten sanntid:** opptakene er tatt dagen før. Ventetidene (3–8 min) er
  rutetid.
- **Hurtigvalg og målområder i Auto** er ikke kjørt i UI for dette
  scenarioet. Det er ukjent om `kombiRader` ville vist en lignende
  kombinasjon for et målområde mot nordøst [Ikke verifisert].
- **Ordinært reisesøk** gir 12 mønstre. Opptaket har bare de 3 første.
  Forslag 4–12 er ikke kjent.
- **Ett scenario og én destinasjon.** Nesttun/Osøyro terminal er ikke sporet.

## 9. Samlet vurdering

- **Teknisk kjede fungerer: ja [Opptak, Kode].** Oppdagelse, gruppering,
  grense, utvelgelse, reisesøk, opsjonsbekreftelse og strukturell
  veibekreftelse henger sammen og er etterprøvbare. Eksempler:
  - parent-proben gjør understopp sammenlignbare;
  - skillet mellom opsjon og vei holder (opsjonen er bekreftet, den valgte
    veien ikke fulgt, og andre veier fulgt);
  - det sies eksplisitt at tidskoblingen ikke er kontrollert av oss.
- **Nye faktiske reisemønstre:** delvis. Kombinasjonen er ny *for
  Auto-tavla uten mål*, men den er Enturs eget førsteforslag i ordinært
  reisesøk.
- **Relevans:** ikke vist. Destinasjonen er valgt for bredde, ikke for et
  brukerbehov.
- **Brukerverdi:** ikke undersøkt, og krever en brukertest.

[Tolkning] Det interessante er ikke at Furuset skole kan nås, men at appen
*uten å få et mål* kunne si «via Helsfyr når du buss 300 og 110 nordøstover».
Det er en retning tavla i dag bare viser som stopp på T-bane 3. Verdien av det
avhenger av om brukeren skal den veien, og det vet vi ikke.

## Konklusjon

**Har vi demonstrert at Travel Companion oppdager en relevant reisemulighet
som dagens løsning ikke synliggjør? Ikke tilstrekkelig dokumentert.**

- **Ja, mekanismen viser noe tavla ikke viser:** en bekreftet kombinasjon via
  Helsfyr (T-bane 3 → buss 300/110, 31–36 min, med strukturelt samsvar i 3 av
  3 Entur-mønstre).
- **Nei, den er ikke ny for ordinært reisesøk:** den er Enturs tre første
  forslag når målet er kjent.
- **Relevansen er ikke vist:** destinasjonen er valgt for bredde, og fire
  treff er to reelle valg.
- **For å avgjøre trengs:**
  - et scenario med et mål en bruker faktisk har;
  - en kjøring av Auto-hurtigvalg og `kombiRader` i UI for samme sted og tid;
  - deretter en enkel brukertest.
