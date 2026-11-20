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

## Avvik i koden i dag (2026-11-20)

| hvor | avvik fra reglene |
|---|---|
| `selected.js` 326/594/621/762/765/781 | `maxZoom` 18/15/15/17/15/15 skrevet inn for hånd; ikke fra trappen |
| `board.js` 632/844/845/873 | `setView(…, 14/15)` og `padding: [36]`/`[44]`, `maxZoom` 16/17 |
| `track.js` 332/400/1030/1134/2793 | `padding: [28]`/`[24]`; 1134 uten `maxZoom`; 2793 uten sjekk av egen justering |
| `plan.js`, `leisure.js`, `settings.js` | egne faste marginer og zoomnivåer |
| Rute, avgangsdetaljer, Underveis | ingen felles `_rammer`-innpakning: en programmatisk zoom kan telle som din |
| Rute | innrammingen har ingen navngitt nøkkel; flere steder bestemmer selv |

Neste steg er én modul (`src/ui/kartRamme.js`): trappen, marginen,
nøkkelen og innpakningen — og en test som binder hvert kart til den.
