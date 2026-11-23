# Nettverksdemonstratoren

Plangrunnlaget, steg 2, trinn 2–3. Skriptet er `scratchpad/nettverksprobe.mjs`.
Det kjøres manuelt mot ekte Entur, er ikke med i `npm test` og er ikke koblet
til appen.

Grunnlaget er undersøkelsen «Nettverksutforskning Mortensrud» (artefakten fra
2026-11-23). Den fant hvor koden kom til kort: grensen på 850 m utelater
stasjoner, knutepunkter må leses på samlestoppet, og taket på antall avganger
kutter T-banen.

Merking: **[Kode]** er verifisert i koden, **[Målt]** er kjørt mot Entur
2026-11-23 rundt kl. 13:40 med reisetidspunktene oppgitt nedenfor, og
**[Hypotese]** krever mer testing.

## Hva den gjør

```
posisjon
 A tilgangspunkter   geokoder (layers=venue): buss ≤ busM, stasjon ≤ stasjonM, høyst maksTilgang
 B ledd 1            boardGQL fra alle tilgangspunkter i ÉN spørring (alias), tak per linje+retning
 C knutepunkter      stopPlaces(ids){parent quays{lines}} → samlestopp; modusskifte først, så linjer
 D ledd 2            boardGQL fra ≤ knutepunkt samlestopp i ÉN spørring
   kandidater        transport_offer + direction (ledd 1), destination (ledd 1+2) → samle() på id
 E utvelgelse        velgForBekreftelse(destinasjoner, bekreft) — eget steg, deterministisk
   bekreftelse       tripGQL × N i ÉN spørring (alias); svaret blir confirmation + realisering;
                     reiser med bytte blir i tillegg en connection-opsjon
```

Den gjenbruker `boardGQL` og `tripGQL` (`src/api/queries.js`), `STOP_MODE`
(`src/api/stopCats.js`), `metresBetween` og hele opsjonsmodellen [Kode].

Byggerne lager `{stopPlace(…)}` og `{trip(…)}`. Demonstratoren skriver dem om
til `aN: stopPlace(…)` og samler dem i én spørring (`somAlias`). Entur godtok
dette i alle kjøringene [Målt].

**Alle grensene er parametere** (`--busM --stasjonM --maksTilgang --perLinje
--nAvg --vindu --knutepunkt --nKnute --bekreft --ledd --fly`). Standardverdiene
er utgangspunktet fra undersøkelsen, ikke produktkrav.

`numberOfDeparturesPerLineAndDestinationDisplay` og `stopPlaces.parent` blir
spurt som prober, med fallback og notat om de avvises. Begge ble godtatt
[Målt].

## Resultater [Målt]

Reisetidspunkt: mandag 2026-11-23 kl. 12:00 (dag) og natt til tirsdag
2026-11-24 kl. 01:30. Tidspunktet kl. 12 hadde passert da målingene ble
kjørt. Entur svarte likevel ut fra rutetabellen, men sanntidsavvik fra den
timen kan mangle. Standardparametrene ble brukt med mindre noe annet står.

| | Mortensrud 12:00 | Mortensrud 01:30 | Nesttun 12:00 | Ranheim 12:00 | Tretten 12:00 |
|---|---|---|---|---|---|
| tilgangspunkter (stasjoner) | 15 (2: Mortensrud T, Hauketo 1 482 m) | 15 (2) | 9 (1: Midtun 1 065 m) | 8 (1: Ranheim st.) | 6 (0) |
| avganger ledd 1 | 110 (101 buss, 4 T, 5 tog) | 12 (alle buss) | 69 (53 buss, 16 bybane) | 50 (48 buss, 2 tog) | 9 (6 buss, 2 bestillingstaxi, 1 ekspressbuss) |
| unike stopp videre, ledd 1 | 296 | 17 | 191 | 128 | 56 |
| knutepunkter valgt | Nationaltheatret, Helsfyr, Ski, Jernbanetorget, Oslo S | **0** | Bergen busstasjon, Arna, Handelshøyskolen, Gamle Bergen, Lyngbø | Trondheim S, Stjørdal, Heimdal, Marienborg, Trondheim lufthavn | Lillehammer, Otta, Ringebu, Oppdal, Trondheim S |
| avganger ledd 2 | 233 | 0 | 141 | 86 | 65 |
| **destinasjoner** | **1 067** | 17 | 783 | 545 | 758 |
| opsjoner etter type (tilbud/retning/forbindelse) | 36 / 25 / 7 | 12 / 3 / 0 | 29 / 17 / 9 | 14 / 11 / 4 | 6 / 4 / 6 |
| rekkevidde (lokal/regional/nasjonal) | 720 / 332 / 15 | 17 / 0 / 0 | 391 / 327 / 65 | 272 / 273 / 0 | 70 / 259 / 429 |
| destinasjoner med flere stier | 982 | — | — | — | — |
| bekreftet av 10 | **10** (9 nå, 1 senere) | 9 (+1 ukjent) | 10 (7 nå, 3 senere) | 10 | 9 (+1 ukjent) |
| uten bekreftelsesbudsjett (beholdt, `not_checked`) | 1 043 | 1 | 765 | 527 | 744 |
| nye destinasjoner mot dagens tavle¹ | 951 | 5 | 601 | 504 | 731 |
| nye retninger mot dagens tavle¹ | 16 | 1 | 7 | 7 | 2 |
| kjente mål funnet | 16 av 19 | 0 av 19 | 7 av 10 | 8 av 9 | 6 av 7 |
| API-kall | **5** | 4 | 5 | 5 | 5 |
| total tid | **6,7 s** | 2,7 s | 6,7 s | 3,5 s | 3,4 s |
| ugyldige opsjoner (`avvik`) | 0 | 0 | 0 | 0 | 0 |

¹ «Dagens tavle» er en tilnærming: de 30 første avgangene i tid fra nærmeste
stopp innen 850 m, uten tak per linje [Kode: `AUTO_BOARD_DEPARTURES`,
`findNearestStation`]. Den simulerer ikke knutepunkt-flettingen (`knutepunkt`,
640 m), så tallet for «nye» er en øvre grense [Hypotese].

### Akseptansemålene for Mortensrud 12:00

| mål | resultat |
|---|---|
| ≥ 12 tilgangspunkter, Hauketo inkludert | **oppfylt**: 15, Hauketo på 1 482 m |
| knutepunkter Helsfyr, Jernbanetorget/Oslo S, Ski | **oppfylt**: alle, pluss Nationaltheatret |
| ≥ 500 destinasjoner etter ledd 2 | **oppfylt**: 1 067 |
| ≥ 8 av 10 bekreftet | **oppfylt**: 10 av 10 |
| ≤ 7 API-kall | **oppfylt**: 5 (geokoder, ledd 1, stoppinfo, ledd 2, reisesøk) |
| ≤ 12 s | **oppfylt**: 6,5–7,9 s over tre kjøringer |
| natt: ingen påstand uten bekreftelse, ærlig om lite tilbud | **oppfylt**: 12 avganger og ingen knutepunkter. «Pasop» står som `unknown` med begrunnelsen «ikke bevis for at ingen finnes». De 9 som står som «nå», er bekreftet med nattbuss kl. 01:30–01:31. |

## Særskilte undersøkelser [Målt]

1. **Fly.**
   - Tavlespørringen bruker `BOARD_MODES_COACH`, som ikke har med fly
     [Kode]. Flyruter blir derfor aldri oppdaget som kandidater.
   - `--fly` legger fly bare til i reisesøket. Med de samme 10 kandidatene
     ga det et identisk resultat.
   - Trondheim S ble ikke oppdaget fra Mortensrud i to ledd uten fly. I
     undersøkelsen ble det nådd via `rail FLY2 → air`.
   - Om fly skal være med, er en produktbeslutning.
2. **Tog som blir borte i et globalt tak.**
   - Med tak per linje (`perLinje 2`): 110 avganger, hvorav 4 T-bane.
   - Uten tak per linje (`nAvg 30` per stopp): 194 avganger, hvorav 8
     T-bane.
   - **Begge ga de samme 296 stoppene videre og de samme 1 067
     destinasjonene.** Til oppdagelse holder to avganger per linje og
     retning, og svaret blir mindre.
   - Undersøkelsen målte at taket på 30 kuttet T-banen ved Mortensrud T. Det
     gjelder for tavla, men ikke for hvilke steder som blir oppdaget her.
3. **Understopp og samlestopp.**
   - Knutepunktene er vurdert på samlestoppet: Helsfyr har 2 understopp,
     Jernbanetorget 4 og Nationaltheatret 3.
   - Ledd 2 spør på samlestoppet og får dermed med søskenstoppene.
   - Destinasjonene fra ledd 2 er **ikke** slått opp med `parent`, fordi det
     ville kostet ett kall til. Dedupliseringen der skjer derfor på
     understoppet, og det samme stedet kan telle to ganger [Kode].
4. **Gangavstand og luftlinje.**
   - Luftlinjen fra Mortensrud til Hauketo stasjon er 1 482 m.
   - Ifølge Enturs reisesøk (`directMode: foot`) er gangveien **2 445 m og
     32 min**, altså 1,65 ganger luftlinjen.
   - I reisesøkene tar brukeren buss 73 til Hauketo i stedet for å gå.
   - Radiusen på 1,5 km sier derfor at stasjonen er en *mulighet*, ikke at
     den er gåbar. Gangtiden må komme fra reisesøket.
5. **Utenfor driftstid.**
   - Kl. 01:30 ble det 0 knutepunkter, og kjente mål ble funnet 0 av 19.
   - Demonstratoren rapporterer dette som tall. Den sier ikke «ingen
     muligheter».
   - Det finnes ennå ikke noe «neste mulige fra døgntilbudet»
     (`timetable: 'not_now'`) [Hypotese: krever `stoppInfoGql`-døgnet].

## Avvik og manglende dekning

- **Mortensrud mangler Kristiansand, Tønsberg og Trondheim S.**
  - Bergen ble funnet via Oslo S (F4, 451 min, `later`).
  - Kristiansand og Tønsberg går fra Oslo S, men falt utenfor
    avgangsvinduet på 60 min og taket på 60 avganger i ledd 2.
  - Trondheim S krever et lengre vindu eller fly.
  - **Søkehorisonten er to ledd og 60 min. Det er en grense i
    demonstratoren** (`--ledd`, `--vindu`), ikke en produktdefinisjon. Ledd 3
    eller et lengre vindu fra knutepunkter med tog er neste forsøk.
- **Kun ledd 1 (`--ledd 1`)** gir 282 destinasjoner og 5 av 19 kjente mål.
  Ledd 2 er altså det som gir regional og nasjonal rekkevidde.
- **Nesttun mangler Bergen stasjon, Voss og Stord.**
  - Knutepunktvalget prioriterer tog, T-bane og båt. Bybanen (tram) teller
    ikke som modusskifte, og «Bergen busstasjon» ble valgt (den har tog i
    linjelista), mens Bergen stasjon ikke ble det.
  - Regelen er Oslo-farget. En regel som teller *nye* transportmidler i
    forhold til tilgangspunktene, ville trolig valgt bedre [Hypotese].
- **Utvelgelsen sprer, men sier ingenting om relevans.**
  - «Lengst unna først» i hver gruppe velger endeholdeplasser som
    Gruvemyra, Veståsen skole og Ullerud.
  - Kontrakten gjør det modellen skal: den er deterministisk og sprer over
    modus og knutepunkt. **Hva som er verdt å bekrefte for brukeren, er ikke
    avgjort.** Det er relevansens ansvar (`mulighetsoppdagelse.js`), ikke
    oppdagerens.
- **Forbindelser** kommer i dag bare fra reiser med bytte i reisesøket, 4–9
  per sted. Oppdageren lager ikke forbindelser fra ledd 2 alene, fordi det
  ville gitt tusenvis uten å si noe om overgangen.

## Det som ikke kan verifiseres herfra

- Om Entur tåler denne lasten fra mange brukere samtidig. Ett reisesøkkall
  med 10 alias tok 1,7–5,1 s og var den tyngste delen.
- Hvordan det oppfører seg i full sanntid. Tidspunktet kl. 12 var passert da
  målingene ble kjørt.
- Om fleksible linjer (bestillingstaxi) faktisk kan bestilles. Tretten fant
  `taxi 5031` til Flåtåmo.

## Kjøre på nytt

```
node scratchpad/nettverksprobe.mjs --sted mortensrud --tid 2026-11-23T12:00:00+01:00
node scratchpad/nettverksprobe.mjs --sted mortensrud --tid 2026-11-24T01:30:00+01:00
node scratchpad/nettverksprobe.mjs --sted nesttun|ranheim|tretten --tid …
  … --utenPerLinje | --fly | --ledd 1 | --json fil
```
