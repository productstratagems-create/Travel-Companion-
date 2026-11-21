# Onboarding — «du er her · hvor skal du?» (forslag, 2026-11-21)

Bestilt: «Lag konkret forslag med skjermskisser for to alternativer. 1. en
førstegangsskjerm vi ikke har nå. 2. At auto-tavlen er innsteget men som
begynner med du er her — hvor skal du? … hvordan fange brukers intensjon …
det er litt av kjernen i en bedre / ny måte å bruke en reiseapp på!»

Grunnlaget er diagnosen i samtalen (2026-11-21) og svarene:
- brukeren er **hvem som helst** som skal et sted med kollektivtrafikk, og har
  gitt lov til posisjon;
- appen spør **så lite som mulig**, men må ane hensikten;
- appen tar **aldri én dom**: det kan finnes flere likeverdige mål,
  avgangssteder og transportmidler, og appen hjelper brukeren å velge.

Skissene er for 414 px telefon.

---

## Kjernen: intensjon = posisjon × hva du vil

Ruter og Google spør «fra / til» og svarer med *én anbefalt* reise. Vi vet
alltid «fra»: det er prikken. Det vi trenger er *hva brukeren vil*, og det kan
uttrykkes på fire måter. Appen bør forstå alle fire:

| hensikt | brukeren sier | appen svarer med |
|---|---|---|
| **sted** | «Jernbanetorget», «Ullevål sykehus» | 2–4 likeverdige reiser dit |
| **retning** | «mot sentrum», «hjemover» | avgangene som går den veien, nærmeste stopp først |
| **ærend** | «apotek», «matbutikk», «svømmehall» | flere *likeverdige mål* (de nærmeste med dette ærendet), hvert med sin reise |
| **tidsfrist** | «være der 08:30», «rekke toget 17:12» | det samme, sortert på *når du må gå*, med «rekker / rekker ikke» |

Det nye er *ærend* og *tidsfrist* som førsteklasses hensikt:
- Ved ærend er målet ikke gitt. «Apotek» har mange likeverdige svar, og
  appen viser dem side om side med gangtid, reisetid og når du er framme. Det
  er nettopp «ikke anta ett beste ankomststed».
- Ved tidsfrist snus spørsmålet: ikke «hva går nå», men «når må jeg gå
  hjemmefra». Det er appens sterkeste regel (`rekkeFor`, «gå om N min») gjort
  til selve svaret.

**Vi spør så lite som mulig.** Ingen skjemaer, ingen hjem/jobb-oppsett.
Hensikten fanges i rekkefølgen:
1. **Ett trykk på et forslag**, uten skriving. Forslagene kommer fra
   posisjonen og klokka:
   - knutepunkt og sentrum nær deg;
   - de tre vanligste ærendene;
   - etter hvert *dine* mål, lært av det du har valgt (`loadFreq('arr')`).
2. **Én setning** i feltet, lest lokalt av `parseAsk`: «til Sandvika fredag
   halv ni», «apotek», «være på Ullevål 08:30».
3. **Ingenting.** «Bare vis hva som går herfra» er alltid ett trykk unna. Da
   får du dagens Auto-tavle.

**Læring uten spørsmål:** målet du velger, blir et vanlig mål. Neste gang står
det først blant forslagene, og Auto-tavle bruker det: ankomst på raden,
hjemover og «rekk den lenger ned».

---

## Alternativ 1 — egen førstegangsskjerm

Vises **én gang**, eller til brukeren har valgt et mål. Deretter lander appen
på Auto-tavle, som før.

### 1a. Før lov til posisjon
```
┌──────────────────────────────────────┐
│                                      │
│   Kom deg dit — fra der du står.     │
│                                      │
│   Appen ser hvor du er, finner       │
│   stoppene rundt deg og viser når    │
│   du må gå for å rekke avgangen.     │
│                                      │
│   ┌──────────────────────────────┐   │
│   │   📍 Bruk posisjonen min      │   │  ← nettleserens spørsmål
│   └──────────────────────────────┘   │
│     posisjonen blir på telefonen     │
│                                      │
│   skriv et sted i stedet →           │  ← uten GPS: «fra» skrives
└──────────────────────────────────────┘
```

### 1b. Posisjon gitt: «hvor skal du?»
```
┌──────────────────────────────────────┐
│  ● du er ved Olasrudveien            │
│    Mortensrud T 10 min · 8 stopp nær │
│ ┌──────────────────────────────────┐ │
│ │ 🔍 Hvor skal du?                  │ │  ← fritekst, parseAsk
│ └──────────────────────────────────┘ │
│  STEDER                              │
│  [ Sentrum ] [ Jernbanetorget ]      │  ← knutepunkt i retning
│  [ Helsfyr ]                         │
│  ÆREND                               │
│  [ 💊 Apotek ] [ 🛒 Mat ] [ 🏥 Lege ] │  ← kategorierFor
│  NÅR                                 │
│  [ må være framme kl … ]             │  ← tidsfrist
│                                      │
│  bare vis hva som går herfra →       │  ← til Auto-tavle
└──────────────────────────────────────┘
```

### 1c. Svar: likeverdige valg, ingen dom
```
┌──────────────────────────────────────┐
│  ← til Jernbanetorget                │
│  ┌ kart: deg, valgt alternativ,     ┐│
│  │ gangen dit og linja — bare den   ││
│  └──────────────────────────────────┘│
│ ┃ 4  [74]  fra Mortensrud T          │
│ ┃ min      gå om 4 min · 12 min gange│
│ ┃          ank. 13:41 · ingen bytte  │  ← valgt (kart over)
│   9  [73]→[81] fra Stenbråten        │
│   min      gå om 1 min · 10 min gange│
│            ank. 13:38 · 1 bytte      │
│   15 [71]  fra Olasrudveien          │
│   min      gå om 13 min · 2 min gange│
│            ank. 13:49 · minst gange  │
│                                      │
│  [ ★ husk Jernbanetorget ]           │  ← valgfritt; læres uansett
└──────────────────────────────────────┘
```
- Radene står i tidsrekkefølge etter når du må gå. Merkene «ingen bytte» og
  «minst gange» er fakta, ikke rangering. Det følger mønsteret «Alternativer
  hører hjemme på raden».
- Trykk på en rad åpner avgangsdetaljene (v1.218.181).

**For:** ren start. Spørsmålet er tydelig, og brukeren lærer først hva appen
gjør, så får hun gjøre det.
**Mot:** en ekstra skjerm å vedlikeholde. Den forsvinner etter første bruk,
så det som læres der, må også finnes på Auto-tavle.

---

## Alternativ 2 — Auto-tavle er innsteget, og begynner med «du er her · hvor skal du?»

Ingen ny skjerm. **Toppen av Auto-tavle** blir intensjonsfeltet. Lista under
er dagens tavle, og den *svarer på det du har skrevet*.

### 2a. Uten hensikt (første gang, eller «bare se»)
```
┌──────────────────────────────────────┐
│  ● du er ved Olasrudveien · 2 min    │  ← ikke «ved» + «10 min»
│ ┌──────────────────────────────────┐ │
│ │ 🔍 Hvor skal du?                  │ │
│ └──────────────────────────────────┘ │
│  [ Sentrum ] [ 💊 Apotek ] [ kl … ]  │  ← én rad forslag, scrolles sidelengs
│ ┌ kart: deg og stoppene, ingen     ┐ │
│ │ linjer før du har valgt          │ │  ← ro (regel 5)
│ └──────────────────────────────────┘ │
│  NESTE AVGANGER HERFRA               │
│  4  [74] Jernbanetorget  gå om 4 min │
│  9  [73] Holmlia         gå om 1 min │  ← lista over kanten
└──────────────────────────────────────┘
```

### 2b. Med hensikt («Jernbanetorget»)
```
┌──────────────────────────────────────┐
│  ● du er ved Olasrudveien · 2 min    │
│ ┌──────────────────────────────────┐ │
│ │ → Jernbanetorget            ✕    │ │  ← hensikten står, kan fjernes
│ └──────────────────────────────────┘ │
│  ┌ kart: valgt alternativ og gangen ┐│
│  └──────────────────────────────────┘│
│  TIL JERNBANETORGET                  │
│ ┃ 4  [74] fra Mortensrud T  ank. 13:41│
│ ┃       gå om 4 min · ingen bytte     │
│   9  [73]→[81] fra Stenbråten ank.13:38│
│         gå om 1 min · 1 bytte         │
│  ▸ 6 avganger herfra som ikke går dit │  ← resten foldet, ikke kastet
└──────────────────────────────────────┘
```

### 2c. Ærend («apotek»): flere likeverdige mål
```
│ │ → apotek                     ✕    │ │
│  3 APOTEK DU KAN NÅ                   │
│ ┃ Apotek 1 Mortensrud   ank. 13:22    │
│ ┃   🚶 bare gange · 9 min             │
│   Vitusapotek Holmlia   ank. 13:31    │
│     [73] fra Stenbråten · gå om 1 min │
│   Boots Bøler           ank. 13:35    │
│     [72] fra Olasrudveien · gå om 3   │
```
Hvert mål er en rad. Trykk gir de likeverdige reisene dit (som 1c).

**For:** ingen ny skjerm. Hensikten er alltid ett trykk unna, ikke bare første
gang. Faste brukere får det samme. Tavla får en jobb («vis det som gjelder
meg») i stedet for å vise alt.
**Mot:** toppen blir tettere. Kartet må vike til fordel for feltet og lista,
og det krever at kartreglene får et «før hensikt»-tema (bare deg og stoppene).

---

## Anbefaling

**Alternativ 2, med 1a foran.**
- Lov til posisjon trenger sin egen forklaring første gang, og det er 1a.
- Alt annet bør bo på Auto-tavle: hensikten er ikke et oppsett man gjør én
  gang, den er spørsmålet hver gang. En førstegangsskjerm lærer bort noe som
  så forsvinner, mens alternativ 2 *er* appen.

**Målt mot PULL:**
- P og U: du skal et sted nå.
- L, vurdert og utilstrekkelig: Ruter og Google gir én anbefalt reise fra et
  «fra» du må fylle ut. Ingen av dem viser likeverdige mål for et ærend, eller
  når du må gå for en tidsfrist, fra der du står.

Proven·Better·New:
- Feltet og forslagene er Proven.
- Rader med likeverdige valg er Better (bygget delvis).
- Ærend som flere mål og tidsfrist som hensikt er New. Det er der
  innovasjonen ligger.

## Gjenbruk — det meste finnes
| trengs | finnes |
|---|---|
| fritekst → sted/tid | `parseAsk` (`src/api/askParse.js`), lokal, uten modell |
| reiser A→B, flere alternativer | `fetchTrip` / `searchDir` (`src/views/explore.js`) |
| rader med «gå om», «rekk den lenger ned», nabostopp, ankomst | `tavleRad`, `rekkeFor`, `naboRader`, `radAnkomst` |
| ærend → kategorier | `kategorierFor` (`src/ui/fmt.js`) og stoppenes kategorier; **steder for ærend (apotek, butikk) finnes ikke** — krever geokoderens POI-søk (Entur geocoder har `venue`-lag), må probes |
| lærte mål | `loadFreq('arr')`, `kjentMål` |
| hjemover | `src/hjemover.js` |

## Rekkefølge, om alternativ 2 velges
1. Toppen av Auto-tavle: «du er ved …» uten selvmotsigelse, feltet og én rad
   forslag. Hensikten «sted» filtrerer lista til reiser dit og folder resten.
2. Likeverdige reiser til stedet som rader (gjenbruk av Utforsk-søket).
3. Tidsfrist som hensikt.
4. Ærend som flere mål (probe av POI-søk først).
5. 1a: posisjonsforklaringen første gang.

## Kan ikke avgjøres herfra
- Om Enturs geokoder gir gode nok steder for ærend (apotek, butikk) i Norge.
- Hvordan ekte brukere leser «ærend» kontra «sted». Det må prøves med folk.
