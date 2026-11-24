# Tracer 2: gir et annet utgangspunkt en bedre reise?

**Dato:** 2026-11-24. **Status:** undersøkelse. Ingen endring i `src/`.

**Skript:** `scratchpad/tracerBedreReise.mjs`, mot ekte Entur.

**Hypotese** (omformulert etter tracer 1,
`docs/tracer-sammenlign-utgangspunkt.md`): *et nærliggende utgangspunkt gir
oftere enklere eller raskere reiser til de samme målene.*

## Kort svar

**Hypotesen holder nesten ikke, og ikke for tid.** Av 352 sammenligninger
(3 par, begge retninger, 4 tidspunkt, 14–15 mål per par):

| utfall for den som står på X og vurderer å gå til Y | andel |
|---|---|
| **å reise herfra er bedre** | **68 %** (median tap ved å gå: **40 min**, kvartiler 30–57) |
| Y er bedre | 12 % |
| ubetydelig (< 5 min, samme antall bytter) | 10 % |
| ingen reise fra noen av dem | 6 % |
| bare herfra / bare via Y | 4 % / 1 % |

**Når Y er «bedre», er det nesten aldri raskere.** I 43 av 44 tilfeller er
du fremme **samtidig**, med **ett bytte færre**. Prisen er **24–44 min
gange** i stedet for en kort bussetappe. Bare én gang var du fremme
tidligere: 11 min, Helsfyr → Oslo S → Måltrostveien.

**Forklaringen:** reisesøket fra der du står, vurderer allerede å gå. Når
målet er kjent, har Entur i praksis valgt utgangspunktet for deg. Å gå til et
annet stoppested på egen hånd slår nesten aldri Enturs eget valg på tid.

## Metode

- **Spørsmålet:** du står på A, avreise t. Er det bedre å gå til B først?
  - «Herfra» er reisesøket fra A ved t.
  - «Via B» er gange fra A til B, anslått som luftlinje × 1,3 ved 80 m/min
    (Valhalla nås ikke herfra), pluss reisesøket fra B ved t + gangtid.
  - Begge retninger er målt: man står på A, og man står på B.
- **Mål:** et representativt utvalg, ikke bare «unike».
  - Stedene begge utgangspunkter når med ett bytte, slått sammen og
    stratifisert på avstandsbånd fra midtpunktet: 0–5, 5–15, 15–50, 50–150 og
    150+ km.
  - Tre per bånd, trukket deterministisk.
- **Tidspunkt:** tirsdag 08, 12 og 22, og lørdag 12.
- **Klasser:**
  - Y er bedre: minst 5 min tidligere, eller færre bytter og høyst 5 min senere.
  - Herfra er bedre: det motsatte.
  - Ubetydelig: resten.
  - «Ingen reise» holdes atskilt og er ikke det samme som «umulig».
- **Alternativer:** ulike linjekombinasjoner fremme innen 30 min etter den
  beste (høyst 3 spurt). Snittet ligger på 1,6–2,3 fra begge, uten noe
  mønster.

## Per par

| par (gange) | står på | herfra bedre | den andre bedre | ubetydelig | ingen reise |
|---|---|---|---|---|---|
| Mortensrud ↔ Hauketo (24 min) | Mortensrud | 47 % | **30 %** | 18 % | 3 % |
| | Hauketo | **87 %** | 0 % | 7 % | — |
| Helsfyr ↔ Oslo S (44 min) | Helsfyr | 62 % | **30 %** | — | 5 % |
| | Oslo S | **92 %** | 0 % | — | 5 % |
| Nesttun ↔ Paradis (31 min) | Nesttun | 73 % | 0 % | 9 % | 11 % |
| | Paradis | 45 % | 14 % | 25 % | 11 % |

**Mønsteret er asymmetrisk.** Fra det sterkere stedet (Hauketo stasjon, Oslo
S) lønner det seg aldri å gå til det svakere. Fra det svakere lønner det seg
i opptil 30 % av tilfellene, men bare som «ett bytte færre, samme ankomst»:
- Mortensrud → Ski: buss 71 og bytte til 515, mot 24 min gange og tog L2
  direkte. Fremme samtidig.
- Helsfyr → Hokksund: T-bane 4 og bytte til R12, mot 44 min gange og R12
  direkte. Fremme samtidig.

**Natt** (tirsdag 22) i Bergen: 5 av 14 mål hadde ingen reise fra noen av
dem.

## Hva dette betyr

1. **«Det beste utgangspunktet» er ikke en tidsgevinst brukeren går glipp av.**
   Når reisemålet er kjent, velger reisesøket allerede utgangspunktet, og å
   overstyre det gjør reisen tregere i to av tre tilfeller. En funksjon som
   anbefaler et annet stoppested for å «komme raskere fram», vil nesten
   alltid ta feil.
2. **Det som finnes, er en avveining:** «gå 24 min og slipp ett bytte, fremme
   samtidig». Den er reell, og noen vil foretrekke den (bagasje, vær,
   usikkerhet ved bytte). Andre vil ikke. Den bør vises som en **avveining**,
   ikke som «bedre».
3. **Formen finnes allerede i appen.** Alternativet på raden det gjelder
   (AGENTS.md: «rekk den på Stenbråten 20:00 · 10 min å gå») er nettopp
   denne avveiningen. Det naturlige neste steget er derfor ikke et
   sammenligningsverktøy. Det er en rad som sier «direkte fra Hauketo
   stasjon · 24 min å gå · fremme samtidig, uten bytte», og bare når den er
   sann.
4. **Der utgangspunktet virkelig betyr noe, er uten kjent mål**
   (utforskning). Fra Oslo S er det flere *direkte* forbindelser. Tracer 1
   viste at det ikke gir flere *steder*, men enklere reiser dit. Det hører
   hjemme i «ett bytte» og «se etter», ikke i reisesøket.

**Konklusjon for prioriteringen:** ikke bygg «hva er det beste
utgangspunktet?» som en egen funksjon. Hvis noe bygges, er det
avveiningsraden («slipp ett bytte mot X min gange»). Først bør brukerbehovet
avklares: går folk 24 min for å slippe et bytte? Det kan ikke måles herfra.

## Avgrensninger

- **Gangtiden er et anslag** (luftlinje × 1,3). Faktisk gangvei kan være
  lengre, for eksempel over E6 eller jernbane.
- **Seks utgangspunkter, fire tidspunkt, én måling per tidspunkt.** Det er
  ikke målt over flere uker.
- **Bygd og ferge er ikke med.** Der er avstanden mellom stoppesteder
  større, og avveiningen kan se annerledes ut.
- **Reisesøket** gir høyst 3 mønstre, i standard søkevindu. «Ingen reise
  funnet» betyr ikke «finnes ikke».
- Mål der ett av utgangspunktene ligger innen 400 m, er utelatt.
