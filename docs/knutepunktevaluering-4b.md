# Evaluering av knutepunktutvelgelsen etter 4b

Plangrunnlaget, steg 2, trinn 4. Evalueringen gjelder knutepunktvalget i
`src/nettverksutforsker.js` etter commit `93ad8d4`. Ingen kode er endret.

Spørsmålet er om «flest nye linjer, marginalt» er en god nok indikator på *ny
nettverksdekning*, eller om det i praksis definerer hva appen anser som
interessant.

**Merking**

| merke | betyr |
|---|---|
| **[Observert]** | målt i opptak eller i måling M1 nedenfor |
| **[Tolkning]** | faglig vurdering av målingene |
| **[Hypotese]** | ikke prøvd |

## Datagrunnlag

- **Opptakene** i `tests/fixtures/entur/` er tatt for tirsdag 2026-11-24 kl.
  12:00 og natt til onsdag kl. 01:30. De har ledd 2 bare for de knutepunktene
  som ble *spurt*. Det er ikke nok til å sammenligne utvalg.
- **M1, en egen avgrenset måling:** ledd 2 for *alle* knutepunktkandidater
  med nye rutelinjer. Samme tidspunkt, samme parametere
  (`horisontFor`, `perLinje 2`, `avgangerMaks 60`) og samme reserve med
  planlagt stoppliste.
  - 21 kall med 20 knutepunkter i hvert, uten feil.
  - Mortensrud: 105 kandidater, natt 10, Nesttun 142, Ranheim 62 og
    Tretten 26.
  - Skriptene ligger i scratchpad og er ikke en del av repoet.
- **Dimensjonene** er målt mot ledd 1 og summert over ledd 1 + utvalget:

  | dimensjon | hva det er |
  |---|---|
  | transportformer | |
  | områder | 8 kompassretninger × 5 avstandsbånd |
  | linjeretninger | linje + skiltet retning |
  | destinasjoner | samlestopp |
  | nettverksveier | linjeretning inn × knutepunkt × linjeretning ut |
  | linjer | |

**Alternative utvalg**, alle med høyst 15 knutepunkter:

| utvalg | kan brukes før kallet? |
|---|---|
| dagens: marginalt etter nye rutelinjer | ja |
| størrelse: flest rutelinjer | ja |
| nærmeste 15 | ja |
| transportformer først, så nye rutelinjer | ja |
| geografisk spredning: ett knutepunkt per område før det fylles opp | ja |
| **orakel** (grådig på den målte dimensjonen: områder, transportformer, linjeretninger, destinasjoner eller veier) | **nei**. Det krever svaret fra ledd 2, så det er en *øvre grense*, ikke et alternativ som kan bygges. |

Ingen vekter eller samlet poengsum er brukt. Hver dimensjon vises for seg.

## 1. Hva dagens utvalg faktisk dekker [Observert]

Formatet er dagens utvalg / beste orakel / alle kandidater. Kolonnen for veier
viser i stedet dagens / orakelet for veier.

| | områder | transportformer | linjeretninger | destinasjoner | veier |
|---|---|---|---|---|---|
| Mortensrud (15 spurt) | 30 / 30 / 30 | 5 / 5 / 5 | 169 / 173 / 177 | 1 663 / 1 683 / 1 692 | 432 / 568 |
| Nesttun (15) | **30 / 32** / 32 | 3 / 3 / 3 | **106 / 121** / 133 | 1 314 / 1 483 / 1 507 | 180 / 301 |
| Ranheim (15) | **28 / 30** / 30 | 2 / 2 / 2 | 159 / 174 / 191 | 1 393 / 1 485 / 1 490 | 291 / 385 |
| Tretten (**4** spurt) | 26 / 26 / 26 | 3 / 3 / 3 | **36 / 44** / 44 | 591 / 596 / 596 | **49 / 138** |
| Natt (**1** spurt) | 3 / 3 / 3 | 1 / 1 / 1 | 3 / 3 / 3 | 23 / 26 / 26 | 4 / 20 |

**Tallene for M1 avviker noe fra 4b-rapporten.** Destinasjonene teller her med
samme samlestopp-kobling for alle utvalg, så Mortensrud har 1 663 her mot
1 531 i 4b. Sammenligningen innenfor tabellen er likevel rettferdig.

**Mot de enkle utvalgene [Observert]**
- **Størrelse:** dagens utvalg er bedre på linjeretninger alle steder
  (Mortensrud 169 mot 158, Ranheim 159 mot 132). Størrelse ga likevel flere
  områder i Nesttun (32 mot 30) og flere veier.
- **Nærmeste 15** er klart dårligst: Mortensrud fikk 17 områder og 52
  linjeretninger.
- **Transportformer først** og **geografisk spredning** fra Mortensrud: begge
  ga 165 mot 169 linjeretninger, med samme antall områder.
- **Ranheim:** transportformer først ga 132 linjeretninger og geografisk
  spredning 126, mot 159 for dagens utvalg.
- **Nesttun:** transportformer først ga 32 områder (dagens 30), og geografisk
  spredning ga 31 områder, men færre linjeretninger (94 mot 106).

**[Tolkning]** Den store gevinsten (13 → 30 områder ved Mortensrud) kommer fra
å ha ledd 2 i det hele tatt. Hvilke 15 knutepunkter som velges betyr mindre:
0–2 områder og 3–14 % av linjeretningene skiller dagens utvalg fra orakelet.

## 2. Hva som blir oversett eller underrepresentert

**A. Transportformer: ingenting oversett [Observert].**
- Ingen knutepunkt utenfor utvalget tilfører en transportform utvalget
  mangler, på noen av stedene.
- Alle utvalg unntatt «nærmeste» dekker de samme formene.

**[Tolkning]** Transportform er ikke en skillende dimensjon her. Tilbudet har
2–5 former, og de nås tidlig. Det sier ikke at formen er uviktig, bare at den
ikke skiller mellom utvalgene på disse stedene.

**B. Områder: konkrete hull [Observert].**
- **Nesttun:** områdene `SØ|150+` og `Ø|150+` nås bare via Handelshøyskolen
  og Gamle Bergen. Begge har mange rutelinjer (24 og 22), men linjene ble
  regnet som dekket av Bergen busstasjon. Ekspressbussene derfra går andre
  veier enn linjenumrene tilsier.
- **Ranheim:** `NV|15–50` nås via Marienborg stasjon (11 nye rutelinjer), og
  `NØ|5–15` via **Skatval stasjon, med bare 1 ny rutelinje** men 4 nye
  linjeretninger og 36 nye destinasjoner.

  Dette er det tydeligste eksempelet på et knutepunkt med få nye linjer som
  åpner et område ingen andre åpner. Det er nettopp den typen algoritmen
  systematisk forbigår.

**C. Linjeretninger og veier.**
- **Tretten og natt bruker ikke kapasiteten [Observert].**
  - Algoritmen stopper når alle *rutelinjer* er dekket: 4 knutepunkter ved
    Tretten og 1 om natta.
  - Ledd 2 er ett kall uansett om det spørres 4 eller 15 knutepunkter.
  - Hadde alle 15 blitt spurt ved Tretten, ville det gitt 44 mot 36
    linjeretninger og 138 mot 49 veier, uten ekstra kall.
  - Om natta gir det 26 mot 23 destinasjoner.
  - Årsaken er at samme linje gjennom et annet knutepunkt kan ha andre
    retninger og andre veier inn. Rutelinjene sier «dekket», men nettverket
    er det ikke.
- **Veier står i et avveiningsforhold [Observert].** Orakelet for veier ga
  flere veier (Mortensrud 568 mot 432), men *færre* linjeretninger (138 mot
  169) og destinasjoner. Flere alternative veier og bredere dekning trekker i
  hver sin retning.

  **[Tolkning]** «Flere alternative nettverksveier» og «nye områder og
  retninger» er to ulike mål. De kan ikke maksimeres samtidig med samme
  budsjett. Det er et produktvalg, ikke et teknisk valg.

**D. Er antall nye linjer en god indikator? [Observert]**

Rangkorrelasjon (Spearman) for nye rutelinjer per knutepunkt mot målt bidrag
alene mot ledd 1:

| | nye linjeretninger | nye områder | linjer i vinduet |
|---|---|---|---|
| Mortensrud | 0,83 | 0,98 | 0,88 |
| Nesttun | 0,74 | 0,88 | 0,79 |
| Ranheim | 0,90 | 0,88 | 0,95 |
| Tretten | 0,96 | 0,83 | 0,86 |

**[Tolkning]**
- Som *gjennomsnittlig* indikator er antall nye linjer god.
- Den er svakest i Nesttun, der 91 % av avgangene har planlagt stoppliste og
  linjenumrene dekker over at linjene går i flere retninger.
- Avvikene ligger i halen: Skatval, Marienborg, Handelshøyskolen og Gamle
  Bergen. Der er gevinsten geografisk, ikke i antall linjer.

## 3. Mortensrud: hvor mye av de 169 linjeretningene er overlapp?

Grupperingsindeksen fra 4b-opptaket [Observert]:

| mål | antall |
|---|---|
| linjeretninger | 169, fordelt på 95 linjer |
| linjer der begge retninger er med | 55 |
| linjeretninger med minst én destinasjon *ingen andre* når | **101** |
| linjeretninger der alle destinasjonene også nås av andre linjeretninger | **68** |
| linjeretninger som er den *eneste* i et område | **4** |
| grupper med ≥ 50 % felles destinasjoner (Jaccard ≥ 0,5) | 125 |
| bare ledd 1 / bare ledd 2 | 5 / 156 |

Eksempler på linjeretninger som er helt overlappet av andre:
- FB10 mot Oslo lufthavn (36 destinasjoner);
- T-bane 3 mot Stortinget;
- buss 74 mot Jernbanetorget;
- buss 76 mot Helsfyr.

**[Tolkning]**
- **101 av 169** linjeretninger er forskjellige i den forstand at de er
  eneste vei til minst ett stopp.
- **68** dekker bare stopp som også nås andre veier. De er alternativer, ikke
  ny dekning. De er likevel ikke verdiløse: FB10 er en egen ekspresslinje til
  flyplassen, og at stoppene «finnes» andre veier sier ikke at reisen er
  likeverdig.
- Bare **4** linjeretninger er alene om et område. Områdene (8 × 5) er for
  grove til å skille korridorer i en by.
- De 125 gruppene viser at linjeretninger sjelden er nesten like i
  stoppsett. Overlappen er delvis, ikke dublett.
- **Svaret er altså:** omtrent 100 linjeretninger gir noe ingen andre gir, og
  omtrent 70 er alternative veier til kjente stopp. Antallet «reelt
  forskjellige reisemuligheter» kan ikke avgjøres uten en finere
  geografisk enhet enn 8 × 5 og uten reisesøk.

**Svakhet i datagrunnlaget [Observert]:** retningen identifiseres av
skilteksten (`frontText`). Varianter som «Grillstad» og «Grillstad via
Ladeham.-Strindh.» (Ranheim) teller som to linjeretninger. Det blåser opp
tallet noe. Størrelsen er ikke målt.

## 4. Algoritme eller datagrunnlag?

| svakhet | skyldes | belegg |
|---|---|---|
| Stopper før kapasiteten er brukt opp (Tretten 4, natt 1) | **algoritmen**: «rutelinjer dekket» brukes som stoppkriterium | [Observert] +8 linjeretninger og +89 veier ved Tretten uten ekstra kall |
| Forbigår knutepunkter med få nye linjer, men nytt område (Skatval) | **algoritmen**: antall linjer som eneste mål før kallet | [Observert] |
| Linjer regnes som «dekket» selv om de går andre veier via et annet knutepunkt (Handelshøyskolen, Gamle Bergen) | **algoritmen og dataene**: rutelinjer er per linje, ikke per retning eller vei | [Observert] |
| Rutelinjene gjelder hele døgnet, ikke vinduet | **dataene**: `quays.lines` har ingen tid | [Observert] korrelasjon 0,79–0,95 |
| Områdene er for grove til korridorer i by | **evalueringens mål**, ikke algoritmen | [Tolkning] |
| Varianter i skilteksten blåser opp antall linjeretninger | **dataene** | [Observert], størrelse ikke målt |
| Destinasjoner fra ledd 2 kobles bare til samlestopp hvis stoppet var med i stoppinfo fra ledd 1 | **implementasjonen**: ingen stoppinfo-runde for ledd 2 | [Kode] destinasjonene telles delvis på understopp |
| «Nærmeste 15» kunne ikke prøves om natta eller ved Tretten | **dataene**: knutepunkter uten `parent` har ingen koordinater i opptaket | [Observert] |

## 5. Anbefaling

**Behold dagens algoritme som utgangspunkt** [Tolkning]
- Den er nær orakelet på områder: 30/30, 30/32, 28/30 og 26/26.
- Den er klart bedre enn størrelse og nærhet på linjeretninger.
- Den er enkel og koster ingen kall.

**Undersøk to avgrensede justeringer** i et eget deltrinn, etter din
godkjenning. Ingen av dem innfører en relevansscore.
1. **Bruk kapasiteten som ikke koster noe.** Når de marginale rutelinjene er
   brukt opp, men det er plass under `knuteMaks`, kan resten fylles med
   kandidater etter et *annet* nøytralt kriterium. Eksempler er
   knutepunktets eget område eller veier inn som ikke er representert.
   - Målt effekt: Tretten +8 linjeretninger og +89 veier, natt +3
     destinasjoner. Det koster 0 ekstra kall.
   - [Hypotese] Det samme gir noe i byene, men der er kapasiteten allerede
     brukt.
2. **La knutepunktets eget område bryte uavgjort, eller gi det en reservert
   plass.** Skatval-typen (få linjer, nytt område) får da en sjanse.
   - Målt grunnlag: Skatval åpner `NØ|5–15` med 1 rutelinje, og Marienborg
     åpner `NV|15–50`.
   - [Observert] «Geografisk spredning» alene ga færre linjeretninger i
     Nesttun (94 mot 106) og Ranheim (126 mot 159). Derfor bare som
     uavgjortsregel eller reservert plass, ikke som hovedkriterium.
     [Hypotese] Effekten av en uavgjortsregel er ikke målt.

**Ikke gjør nå**
- Ikke optimaliser for veier. Det går ut over bredden, og hvilken av de to
  som skal prioriteres er et produktvalg.
- Ikke bruk transportform som hovedkriterium. Den skiller ikke på disse
  stedene.

**Undersøk videre, uten kode**
- En finere geografisk enhet enn 8 × 5 for byene. Uten den kan ikke
  korridorer og overlapp i en by vurderes.
- Hvor mye variantene i skilteksten blåser opp antall linjeretninger.
- Kobling til samlestopp for destinasjonene i ledd 2. Det koster ett
  stoppinfo-kall til og er et budsjettspørsmål.

**Beslutninger som trengs**
1. Skal justering 1 (bruke ledig kapasitet) inn før 4c?
2. Skal justering 2 (område som uavgjortsregel eller reservert plass)
   prøves?
3. Når budsjettet ikke rekker til begge: bredde (nye områder og
   linjeretninger) eller alternative veier?
