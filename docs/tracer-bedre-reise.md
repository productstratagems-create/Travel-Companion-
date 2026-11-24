# Tracer 2: gir et annet utgangspunkt en bedre reise?

**Dato:** 2026-11-24. **Status:** undersøkelse. Ingen endring i `src/`.

**Skript:** `scratchpad/tracerBedreReise.mjs`, mot ekte Entur. To
kjøringer.

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

Hver kjøring har 352 sammenligninger.

**Hvor stor forskjellen er** (kjøring 2, ankomst; positivt betyr at B er
fremme tidligere): median **−30 min**. Persentil 10–90 går fra −60 til 0, og
høyeste verdi er +11 min (én gang).

**Konklusjon:**
- **Hypotesen holder ikke for tid.** Å gå til et annet utgangspunkt gjør deg
  nesten aldri tidligere fremme.
- **Den holder delvis for enkelhet.** I 12 % kommer du fram samtidig med ett
  bytte færre, mot 24–44 min gange i stedet for en kort etappe.
- **Forklaring:** når målet er kjent, vurderer reisesøket fra der du står
  allerede å gå til et annet stopp. Å overstyre det gjør reisen tregere i tre
  av fem tilfeller.

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
   - Stedene stratifiseres på avstandsbånd fra midtpunktet (0–5, 5–15, 15–50,
     50–150 og 150+ km), med 3 per bånd trukket deterministisk. Det gir 14–15
     mål per par.
   - **Samme mål på alle tidspunkt.**
   - **Kjent skjevhet:** utvalget arver utforskerens grenser (ett bytte,
     ordinært søkevindu, høyst 15 knutepunkter). Mål som bare nås med to
     bytter eller utenfor vinduet, er ikke med.
   - Mål innen 400 m fra et av utgangspunktene er utelatt.
4. **Ingen reise funnet er ikke det samme som utilgjengelig.**
   - «Uavklart» betyr at reisesøket ikke ga noen reise innen standard
     søkevindu og 3 mønstre. Det betyr ikke at målet ikke kan nås.
   - Ingen søk feilet med nettfeil.

## Mønstre (kjøring 2)

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
  fire tidspunkt (10–12). Kvelden har flere uavklarte (18 mot 6–7).
- **Transportmiddel** (alternativets reise): gevinsten finnes nesten bare når
  alternativet starter med **tog** (28) eller **buss** (13), og aldri med
  T-bane.

| alternativet reiser med | samme, færre bytter | langsommere |
|---|---|---|
| tog | 28 | 76 |
| buss | 13 | 83 |
| trikk/bybane | 2 | 22 |
| T-bane | 0 | 29 |

- **Typisk eksempel:** Mortensrud → Holmlia stasjon, kl. 08. Enten buss 73X
  og så tog L2, eller 24 min gange til Hauketo og så L2 direkte. Du er fremme
  samtidig. Gangturen erstatter bussetappen og bytter et bytte mot 24 min
  gange.
- **Direkte reiser:** i 14 av 43 tilfeller blir reisen direkte via
  alternativet. I resten blir den ett bytte kortere, for eksempel L2 → RE30
  i stedet for 73 → L2 → RE30.

## Hva dette betyr

1. **Ikke bygg «hva er det beste utgangspunktet?» for å komme raskere fram.**
   Funksjonen ville nesten alltid ta feil, fordi reisesøket allerede velger
   utgangspunkt når målet er kjent.
2. **Det som finnes, er en avveining:** «gå 24 min og slipp ett bytte, fremme
   samtidig». Den er reell i ca. 12 % av tilfellene og nesten bare fra
   et svakere sted mot en togstasjon eller et større knutepunkt. Den skal
   vises som en **avveining**, ikke som «bedre». Formen finnes i appen:
   alternativet på raden det gjelder (AGENTS.md: «rekk den på Stenbråten ·
   10 min å gå»).
3. **Det åpne spørsmålet er brukerbehovet,** og det kan ikke måles herfra:
   går folk 24–44 min for å slippe ett bytte? Det må avklares i en brukertest
   før noe bygges.

## Avgrensninger

- Seks utgangspunkter (to byer) og fire tidspunkt, med to kjøringer samme
  dag. Ikke målt over flere uker.
- Bygd og ferge er ikke med. Der er avstanden mellom stoppesteder større, og
  avveiningen kan se annerledes ut.
- Gangtiden er et anslag fra luftlinje. Faktisk gangvei kan være lengre.
- Reisesøket gir høyst 3 mønstre per søk. Antall alternativer er derfor en
  nedre grense.
