# Kartregler — zoom og panorering

Ett sett regler for alle kartene: Auto-reise, Auto-tavle, Rute, avgangsdetaljer,
Underveis, ankomst, plan og utforsk. Målet er det visjonen krever (AGENTS.md):
*hvor er jeg, hvor er stoppet, hvordan kommer jeg dit* — besvart av kartet,
med de rette elementene i fokus og i rett zoom, og med **ro**.

## 1. Hva kartet handler om — én ting om gangen

Hvert kart har til enhver tid **ett tema**. Temaet avgjør hva utsnittet skal
romme. Alt annet kan tegnes, men det får ikke trekke i utsnittet.

| skjerm (fase) | tema når du står/går | tema i fart / om bord |
|---|---|---|
| Auto-reise, Auto-tavle (før valg) | **deg + stoppet** (+ gangen dit) | neste stopp på linja |
| Rute (før valg) | **deg + fra-stoppet** (+ gangen); stoppet lenger ned / nabostoppet når en rad du åpner, går derfra | — (ingen gangdom i fart) |
| avgangsdetaljer (valgt avgang) | **gangen til påstigningen** | hele reisen |
| Underveis | deg + neste stopp | deg + neste stopp |
| ankomst | deg + målet | — |

Temaet bestemmer også rekkefølgen når plassen ikke strekker til: **deg og
stoppet først**, så gangen, så resten. Et punkt som ikke er tema, skal aldri
presse deg eller stoppet ut av rammen.

## 2. Zoomtrinnene — fire navngitte nivåer

Ingen kart velger sin egen `maxZoom`. Alle tar fra én trapp:

| navn | zoom | brukes til |
|---|---|---|
| `PLATTFORM` | 18 | sporet/plattformen og inngangen |
| `GANG` | 17 | deg → stoppet, en gåtur på noen hundre meter |
| `NÆRHET` | 16 | stoppet og naboene; ett punkt alene |
| `REISE` | 15 | hele reisen, flere stopp |
| `RUTER` | 14 | hele linjer med endestasjon (Auto-tavle) |

`maxZoom` er et **tak**, ikke et mål: rammen bestemmer zoomen, taket hindrer
at to punkter tett sammen gir et kart av én bygning. Ett punkt alene får
`NÆRHET`, aldri «maks».

## 3. Marginene — én regel

- Margin fra `fitPadding(kartets høyde)` på alle kart, ikke faste 24/28/32/36/40/44 px.
- Verktøysøylen tar plass på én side: den siden får søylens bredde i tillegg
  (slik `fokusRamme`-kartene alt gjør med `paddingTopLeft/BottomRight`).
- Faste merkelapper (stopp, «PÅ · Lofsrud», endestasjoner) får plass innenfor
  rammen; en lapp som klippes av kanten, regnes som en feil i rammen.

## 4. Når kartet rammes inn — og når det ikke gjør det

Kartet rammer inn **bare når temaet endrer seg**, aldri fordi tiden går:

1. kartet åpnes første gang;
2. stoppet / avgangen / reisen byttes;
3. du trykker på fokusknappen, en rad eller et stopp;
4. kartets form endres (liten/stor/full);
5. du går ut av rammen (prikken er nær kanten) — og ikke har flyttet kartet selv.

Nøkkelen som avgjør «har temaet endret seg» er **én navngitt funksjon per kart**
(som `rammeNøkkel` i Auto). Posisjonen er *ikke* en del av nøkkelen; da ville
kartet hoppe for hver GPS-fiks.

## 5. Brukeren eier kartet når hun har rørt det

- Draging, knipe-zoom, hjul og tastatur = **din justering** (`_aUserMoved`,
  `BRUKER_INPUT_MS`). Appens egne `fitBounds/setView` går gjennom én
  innpakning (`_rammer`) og teller aldri som din.
- Etter din justering rammer appen **ikke** inn av seg selv — heller ikke ved
  nytt stopp eller ute av rammen. Bare en handling du gjør (fokusknapp, rad,
  form) gir rammen tilbake.
- Fokusvalget ditt huskes per kart (v1.218.187) og brukes når kartet rammes inn.

## 6. Fokusknappen — samme syklus overalt

`oversikt → vei → plattform` (+ `hele ruter` i Auto-tavle), fra
`fokusRamme`. Hvert trinn har sitt zoomtrinn fra §2. Avgangsdetaljenes
«utsnitt» er appens valg ut fra fasen, ikke et trinn i syklusen.

## 7. Ro

- Ingen animasjon ved første innramming; animasjon bare når *du* ba om endringen.
- Aldri mer enn én innramming per tegning; tegnes kartet hvert sekund, rammes
  det fortsatt bare ved §4.
- Prikken flytter seg; kartet gjør det ikke.

## Status (v1.218.188)

Gjennomført i `src/ui/kartRamme.js` (`ZOOM`, `marg`, `ramme`):

- Rute, avgangsdetaljer, Underveis, ankomst, plan, utforsk og minnekartet
  rammer inn gjennom `ramme()`; ingen skjerm har egne `maxZoom`-tall eller
  faste px-marginer (test: `tests/kartRamme.test.js`).
- Fokusknappens nivåer (`kartFokus.js`) og Auto-kartets startzoom leser trappen.
- Ankomstkartet med ett punkt står på `REISE` med vilje («hvilket nabolag du
  kommer til»), via `ettPunkt`.
- Egen justering: Auto (`_rammer`, `BRUKER_INPUT_MS`) og Underveis (`_tProg`)
  skiller appens zoom fra din; Rute og avgangsdetaljer teller bare `dragstart`,
  som appens egne rammer aldri utløser.
- Ankomstkartets gangrute rammes nå med tak (`NÆRHET`); før hadde den intet.

Igjen: Auto-kartets egen nærhetszoom (`zoomFor`, `FIT_PAD`) — en egen,
målt regel for «deg i midten» som ikke er en ren innramming; den står.

## 8. Lappene står ved symbolet sitt (v1.218.224)

Bestilt: «Finn proven for hvordan lapper skal ankres til symbolikk i kart.»
Proven (kartografi; Google Maps, Apple Kart):

- **Et punktnavn står inntil symbolet sitt**, på en av plassene rundt det
  (`stoppLappSide`), med spissen mot punktet. Det flyttes aldri løs.
- **Er det ikke plass, utelates lappen**, lavest prioritet først
  (nabostopp og alternativ før stoppet ditt). Den flyttes ikke bort.
- **Ett faktum, ett anker:** stoppnavn, linjer og «gå om» står ved stoppet;
  gangtiden står som en egen pille midt på gangstreken («🚶 12 min»).
- **Linjemerket ved linjas ende** (v1.218.227) har lavest prioritet: bare
  linjenummeret, ankret til endepunktet av den tegnede streken. Det står
  bare der det ikke dekker stopplappen, gangpillen, andre lapper, prikken
  din eller knappene. Ellers står det ikke.

## 9. Fokus per steg og zoom etter fart (v1.218.228)

Proven (Google, Apple, Citymapper, Ruter), i `src/kartSteg.js`:
- **Steget bestemmer rammen** (`stegNøkkel`, `stegRamme`, `STEG_TAK`):
  gå 17, vent 18, om bord 15 (deg + neste stopp), nær avstigning 16 (deg +
  stoppet du skal av på, ≤ 2 stopp eller ≤ 90 s), bytte 18.
- **Rammes bare når steget skifter**, aldri hvert sekund (§4), og aldri etter
  at du har rørt kartet (§5).
- **Om bord følger kartet deg med zoom etter farten** (`zoomEtterFart`):
  < 2 m/s 17, < 6 m/s 16, < 15 m/s 15, ellers 14. Et nytt trinn gjelder først
  når det har vart 8 s (`fartMedRo`). Nær avstigning går foran farten.
- Underveis' fokusrunde: `steg → oversikt → vei → plattform`.

## 10. Lappenes plass — ett register, prioritet, kortform eller skjult (v1.218.233)

Bestilt: «Appen må ha et konsept for å decluttre kartenes symbologi og
lapper så den kritisk viktige infoen blir lesbar.» Proven (Mapbox/MapLibre
symbol collision, Google, Apple, OpenLayers declutter), i `src/ui/lappPlass.js`:

| prio | lapp |
|---|---|
| 1 | stoppet ditt (navn + «gå om»; kortform: bare navnet) |
| 2 | gangtidspillen |
| 3 | plattformen du skal til |
| 4 | nabostopp, alternativ, andre lapper |
| 5 | linjemerker ved endene |
| 6 | andre plattformer |

- Alle lappene måles som de faktisk ble tegnet, og plasseres i rekkefølgen
  over. Første som ikke kolliderer med noe som alt står (eller med prikken
  din og knappene), vinner.
- Taperen får kortform (`.lapp-lang` skjules) om den da får plass, ellers
  skjules den. Den flyttes aldri bort fra ankeret (§8).
- Ro: blant like viktige går den som sto forrige gang først.
- Først i Auto-tavle-kartet; de andre kartene tar samme kjerne.
