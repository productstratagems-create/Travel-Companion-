# Plangrunnlag: fra smart avgangstavle til oversikt over reisemuligheter

Felles utgangspunkt for videre utvikling, lagt inn 2026-11-23 (v1.218.286).

**Kilde:** delt ChatGPT-samtale «Undersøk hurtigvalg mekanisme»
(https://chatgpt.com/share/6b0424a7-d504-83eb-ab75-7d0c00fb88c3), der en
gjennomgang av koden i dette repoet ble diskutert med produkteier. Innholdet
er gjengitt tro mot samtalen, men komprimert (gjentatte svar slått sammen).
Bak hver del står en **vurdering mot koden slik den er nå** — det samtalen
foreslår, og det som alt er bygget, er ikke alltid det samme (AGENTS.md: en
plan som ber om noe som finnes, sender oss til å bygge det to ganger).

---

## 1. Problemet samtalen startet med

Hvorfor kan et tog stå i avgangslista, men ikke bli et hurtigvalg?

Tre ulike feilbilder, som krever ulike løsninger:
1. toget blir aldri kandidat,
2. det blir kandidat, men filtreres bort,
3. det overlever filtreringen, men taper i rangeringen.

**Funn i `src/maalomrader.js` (`målområder()`):**

| Parameter | Regel |
|---|---|
| Retninger | minst 2 |
| Nærmeste relevante stopp | `OMR_NÆR_M` = 1 500 m |
| Avstand for retningsbestemmelse | 1 500–15 000 m (`OMR_FJERN_M`) |
| Retningsdeling | vinkelgap ≥ 45° (`OMR_HULL_GRADER`) |
| Maks antall områder | `OMR_MAKS` = 3 |

- En retning uten stopp med koordinater i avstandsbåndet faller ut (`if (!fjern) continue`).
- Går alt omtrent samme vei, lages ingen områder (`if (deler.length < 2) return []`).
- Områdene bygges bare av retninger som verken er «mot sentrum» eller «hjemover».

**Hovedinnsikt:** dagens mekanisme er en *geografisk grupperingsalgoritme*,
ikke en algoritme som finner brukerens *reisemuligheter*. Den er laget for å
dele opp «andre retninger», ikke for å kartlegge alle opsjonene.

> **Vurdering mot koden:** stemmer. I tillegg kommer to grenser samtalen
> ikke så: stoppsøket stopper på `NEAR_STOP_MAX_M` = 850 m så lenge det
> finnes busser nærmere (en stasjon på ~1 km blir aldri hentet — forsøkt
> utvidet i v1.218.275, tatt ut i v1.218.277), og nabostopp flettes inn bare
> innen `TAVLE_GANG_M` = 640 m fra stoppet i overskriften. Et tog kan altså
> mangle allerede i datagrunnlaget, ikke bare i grupperingen. Se
> `docs/auto-tavle-logikk.md` → «Kjente begrensninger».

## 2. Produktvalget

Spørsmålet var om hurtigvalgene skal vise *geografiske mål* (Holmlia, Ski,
Lillestrøm) eller *reisemuligheter* (tog nordover, tog sørover). Svaret:
**begge, gitt lokal kontekst og tjenestetilbudet ved holdeplassene** — «hva
er opsjonene brukeren har?»

En opsjon kan være:
- **et reisemål** — Ski, Lillestrøm, Oslo sentrum;
- **en reiseretning** — tog sørover/nordover;
- **et transporttilbud** — T-bane, tog, buss, trikk;
- **en konkret forbindelse** — en kombinasjon med bytte som gir tilgang til
  et område.

De utelukker ikke hverandre: en togforbindelse sørover er både en retning og
en vei til konkrete mål.

### Tre nivåer

| Nivå | Spørsmål | Eksempel |
|---|---|---|
| 1 Tilgjengelig tilbud | Hvilke linjer, transportmidler, holdeplasser og avganger finnes lokalt? | tog fra stasjonen, T-bane fra nærmeste T-stasjon, buss ved deg |
| 2 Reisemuligheter | Hvilke distinkte muligheter gir tilbudet? | tog sørover, T-bane mot sentrum, buss til knutepunkt, kombinasjon med bytte |
| 3 Hurtigvalg | Hvilke er relevante nok til å løftes fram? | «Mot sentrum», «Tog sørover», «Mot Ski», «Via Oslo S» |

En knapp representerer ikke en linje, men **en meningsfull opsjon brukeren
faktisk har**.

### Hva som avgjør hvilke opsjoner som tilbys

| Dimensjon | Spørsmål |
|---|---|
| Lokal tilgjengelighet | Hvilke holdeplasser og stasjoner er relevante fra posisjonen? |
| Tjenestetilbud | Hvilke transportmidler og linjer betjener dem? |
| Geografisk dekning | Hvilke retninger og områder kan man nå? |
| Reisemuligheter | Hvilke direkte- og bytteforbindelser finnes? |
| Tid | Hvilke avganger er aktuelle nå, eller innen et relevant tidsrom? |
| Relevans | Hvilke er forskjellige nok og nyttige nok til et hurtigvalg? |

**Holdeplassene er innganger til tilbud, ikke bare datakilder for retning.**
En togstasjon 800 m unna kan gi en helt annen mulighet enn bussholdeplassen
100 m unna.

## 3. Produkteiers presisering

> «Jeg ønsker å bevare den mer lokale beste måte inn til sentrum, og beste
> måte hjemover — kombinert med en mer utvidet mulighet for reise lokalt,
> regionalt og nasjonalt.»

To former for beslutningsstøtte som skal leve side om side:
1. **Situasjonsbestemte snarveier** — beste vei til sentrum og hjem herfra.
2. **Et bredere mulighetsrom** — hva kan jeg reise med lokalt, regionalt og
   nasjonalt?

De skal **ikke** tvinges inn i én felles retningsklassifisering: ulike
formål, datagrunnlag og kriterier for «best».

### 3.1 Snarveiene beholder særstillingen
- **Mot sentrum:** beste tilgjengelige reise mot et definert sentrumsmål, med
  mulighet for å gå til et bedre påstigningssted.
- **Hjemover:** beste reise til registrert hjemmemål, med bytter og
  alternative påstigningssteder.

Dette er optimaliserte reiseoppgaver, ikke geografiske kategorier. En ny
opsjonsgenerator skal ikke svekke dem.

> **Vurdering:** finnes langt på vei. «Mot sentrum» velger påstigning slik
> Entur gjør — tidligst framme (`besteFraReiser`, v1.218.278) — og viser
> byen («mot Oslo sentrum», v1.218.282). «Hjemover» bruker dine stopp eller
> morgenstoppet (`hjemStopp`/`hjemFraProfil`, v1.218.266) og viser bytte
> («bytt på X», v1.218.151). Overskriften flyttes bare til stopp i tavla
> (v1.218.283/284). **Gjenstår:** hjemover har ikke reisesøk-basert beste
> påstigning slik mot sentrum har.

### 3.2 Lokalt, regionalt, nasjonalt — én grunnmodell
Ikke tre algoritmer, men samme modell med ulik geografisk horisont og
relevanskriterier:
- **Lokalt:** nærliggende holdeplasser, linjer og knutepunkter (bydeler, nabokommuner).
- **Regionalt:** byer og regionale sentre (Ski, Drammen, Lillestrøm, Moss, Gardermoen).
- **Nasjonalt:** større knutepunkter i andre landsdeler (Lillehammer, Bergen, Trondheim, Kristiansand).

Nivåene defineres ikke bare av avstand: en direkte togforbindelse fra en
lokal stasjon til en fjern by er nasjonal selv om den starter lokalt. Skill
mellom *hvor reisen starter*, *hvilket tilbud som finnes*, *hvilke steder det
gir tilgang til* og *hvor langt ut i nettet muligheten rekker*.

> **Vurdering:** nytt. Ingen nivådeling finnes i dag.

## 4. Konsekvenser for dagens kode

| Dagens kode | Konsekvens |
|---|---|
| `retningGruppe()` | Beholdes for sentrumsklassifiseringen — ikke generell opsjonsklassifisering. |
| `retningHjemDom()` | Beholdes som egen hjemover-logikk. |
| `målområder()` | Beholdes eventuelt som én lokal grupperingsstrategi, ikke som motor. |
| `_oppdaterOmråder()` | Erstattes gradvis av en funksjon som bygger et bredere sett reisemuligheter. |
| `_iValg()` | Generell filtrering på opsjonsidentitet, ikke bare retning/område. |
| `_kombiFor()` | Gjenbrukes i reiseberegningen, men løsrives fra målområdene. |
| `fetchNearbyStops()` | Gir lokale påstigningssteder, men trenger et bredere tjeneste- og nettverksgrunnlag. |

Infrastrukturen finnes alt: identifisere avganger, lese stoppene videre på en
linje (`stopsAhead`), hente reiser med bytte (`fetchTripFraPos`), rangere
påstigningssteder (`sammenlignViktighet`, `båndFor`). **Det som mangler er et
mellomlag mellom transportdata og grensesnitt.**

## 5. Arkitekturen: en reisemulighetsmotor

```
Transportdata           posisjon · holdeplasser · linjer · avganger · rutetilbud · reisesøk
      ↓
Reisemulighetsmotor     oppdager, grupperer og beskriver tilgjengelige opsjoner
      ↓                        ↓
Personlige reiseoppgaver     Andre reisemuligheter
(mot sentrum · hjemover)     (lokalt · regionalt · nasjonalt)
      ↓
Presentasjon            hurtigvalg · avgangsliste · reiseforslag · kart
```

Mulig modulsett (skisse):

```
src/mobility/
  nearbyServices.js        tilbudet ved holdeplassene i nærheten
  opportunityDiscovery.js  finne mulighetene
  opportunityGrouping.js   gruppere dem
  opportunityRanking.js    rangere dem
  opportunityTypes.js      opsjonsmodellen
```

`auto.js` beholder visning og interaksjon; motoren finner og beskriver.

Opsjonsmodell (skisse — en opsjon kan realiseres på flere måter):

```js
{
  id: 'regional:ski', type: 'destination', scope: 'regional', label: 'Ski',
  access: [{ mode: 'rail', line: 'L2', boardingStop: 'Oslo S' }],
  destinations: ['Ski'], alternatives: [], availability: {}, relevance: {}
}
```

> **Vurdering mot AGENTS.md:** følg kodebasens egne regler når modulene
> lages — norske navn som ellers i koden, rene funksjoner med tester, én
> navngitt definisjon per faktum, og tall bundet til `docs/auto-tavle-logikk.md`.

## 6. Den største tekniske utfordringen: å oppdage muligheter

`stopsAhead()` leser stoppene på *én konkret avgang* — godt for «hvor går
denne linja», utilstrekkelig for «hvor kan jeg reise». Eksempler:
- et tog fra Oslo S til Trondheim er ikke synlig i den lokale tavla;
- en buss til et knutepunkt åpner et helt annet regionalt nett;
- en lokal stasjon kan ha få avganger nå, men stort tilbud gjennom dagen.

Motoren trenger derfor **to datakilder**:
- **A. Tilbudet her og nå** — hva du rekker, hvilke avganger, beste påstigning.
- **B. Tilbudet i rutenettet** — reisemål og forbindelser utover de neste
  avgangene, via knutepunkter.

Søkebudsjett: ikke ett reisesøk per tenkelig mål. Først oppdag og avgrens
kandidatene, så undersøk de mest relevante.

> **Vurdering:** A finnes (tavla, `slåSammenKall`, `knutepunkt`, reisesøket i
> `_kombiFor`). For B finnes delvis grunnlag: stoppinfo med døgntilbud
> (`fetchStoppLinjer`, `STOPP_INFO_MS`), og `hentStoppAvganger`. Entur nås nå
> fra sandkassen, så B kan prøves mot ekte data før det bygges. Budsjett og
> cache finnes (`budsjettTillater`, `HENT_BUDSJETT_PR_MIN`).

## 7. Brukeropplevelsen

Ikke alle funn som likeverdige knapper. Mulig organisering:

- **Dine snarveier** (personlig): Mot sentrum · Hjemover
- **Lokalt:** Mot Ski · Mot Holmlia · Lokale bussruter
- **Regionalt:** Drammen · Lillestrøm · Moss
- **Nasjonalt:** Lillehammer · Bergen · Trondheim

(Illustrasjon av informasjonsarkitektur, ikke beregnede opsjoner.)

Ikke vis «Bergen» bare fordi en teoretisk reise finnes. Skill mellom:
- tilgjengelig nå,
- tilgjengelig med litt venting,
- tilgjengelig via overgang,
- mulig i rutetilbudet, men ikke aktuelt nå.

Forskjellen mellom *hvor kan jeg reise?* og *hva kan jeg reise med nå?*

> **Vurdering mot godkjente mønstre:** alternativer hører hjemme *på raden de
> gjelder*, ikke i en boks over lista (AGENTS.md, 2026-11-20); hurtigvalg
> skal ikke flytte grunnlaget under fingeren (v1.218.283/284); knappene
> viser linjene de gjelder og byen (v1.218.282). En egen seksjon for
> regionalt/nasjonalt må prøves mot «Ro» — knappene som fører videre skal
> være synlige uten å skrolle.

## 8. Trinnvis gjennomføring (fra samtalen)

1. **Isoler sentrum og hjemover** — gjør dem selvstendige, sikre at de virker som før.
2. **Definer en felles opsjonsmodell** — la dagens målområder være én type reisemulighet.
3. **Bygg en lokal opsjonsoppdager** — nærliggende holdeplasser, tilbud og avganger; finn det dagens gruppering overser.
4. **Legg til regionale muligheter** — via tilgjengelige linjer og knutepunkter.
5. **Utvid til nasjonale** — nettverks- og reisesøk, tydelig skille mellom faktisk tilgjengelighet og generell mulighet.
6. **Koble til hurtigvalgene** — først når modellen er testet, endres presentasjonen.

**Viktigste anbefaling:** ikke gjør «lokalt, regionalt, nasjonalt» til tre
nye filtre i `filtrerRetning()` — det blander rekkevidde, reisehensikt og
avgangsretning. La motoren produsere et rikere sett opsjoner, mens «mot
sentrum» og «hjemover» forblir egne, optimaliserte tjenester.

Målbildet: fra **smart avgangstavle** til **situasjonsbevisst oversikt over
hva brukeren faktisk kan gjøre med kollektivtilbudet**.

---

## Status per tiltak (vurdert mot koden 2026-11-23)

| # | Tiltak | Status | Fase | Proven·Better·New | Belegg / merknad |
|---|---|---|---|---|---|
| 1 | Sentrum og hjemover som egne tjenester | **delvis** | før valg | Better | mot sentrum: reisesøk + by (v278, v282). Hjemover mangler reisesøk-basert påstigning. |
| 2 | Felles opsjonsmodell | nytt | før valg | New | Målområder (v213), hurtigvalg-knapper (v282) er utgangspunktet. |
| 3 | Lokal opsjonsoppdager | **delvis** | før valg | Better | Knutepunkt og nabostopp (v171), stasjoner ~1 km forsøkt (v275, tatt ut). Grensene i §1 må løses først. |
| 4 | Regionale muligheter | nytt | før valg | New | Krever datakilde B. |
| 5 | Nasjonale muligheter | nytt | før valg | New | Krever datakilde B og skillet «nå / venting / overgang / mulig». |
| 6 | Koble til hurtigvalgene | nytt | før valg | Better | Må holde «Ro» og «alternativet på raden». |
| — | Alle Enturs transportmidler | **finnes** | — | Proven | Bestillingstaxi i tavla og reisesøket (v279–280); tabell i `docs/auto-tavle-logikk.md`. |

## Åpne spørsmål å avgjøre før steg 2

1. **PULL:** hvem drar i regionalt/nasjonalt? `docs/produktretning.md` krever
   pull før Better/New. Er det daglig pendling (lokalt/regionalt) eller
   sjeldne reiser (nasjonalt) som er brukssituasjonen?
2. **Stasjoner lenger unna:** skal 850 m-grensen for stasjoner tas opp igjen
   (v1.218.275 ble tatt ut)? Uten det mangler tog i datakilde A.
3. **Hjemover:** skal hjemover få samme reisesøk-baserte beste påstigning som
   mot sentrum (steg 1 fullt ut)?
4. **Hvor på skjermen:** egne seksjoner for lokalt/regionalt/nasjonalt, eller
   rader i lista («alternativet på raden»)?
5. **Navn på opsjoner:** stoppnavn, byer eller retninger? (Delområdenavn fra
   SSB ble prøvd og forkastet 2026-11-23 — dårligere enn stoppnavn.)
