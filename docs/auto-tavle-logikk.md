# Auto-tavle: hvordan appen velger stopp, linjer og avganger

Gjelder v1.218.280. Tallene i dette dokumentet er bundet til koden av
`tests/autoTavleLogikk.test.js`: endres et tall i koden uten at det endres
her, faller testen. Les dette før du endrer utvalget i Auto-tavle.

---

## Kort fortalt

Auto-tavle svarer på «hva kan jeg reise med herfra nå?» i sju trinn:

1. **Hvor er du?** GPS, eller et sted du har valgt selv («Du har valgt: …»).
2. **Hvilke stopp er i nærheten?** Alle holdeplasser innen 850 m. Finnes
   ingen, letes det videre ut til 2 og 5 km.
3. **Hvilke er viktigst?** Stoppet du står ved først; deretter de du går mot
   eller pleier å bruke; deretter *tilbudet* (T-bane/tog foran trikk foran
   buss, så avganger neste time) innenfor et gangbånd, og avstand utenfor det.
4. **Hvilket står i overskriften?** Det øverste — med ro: et annet stopp må
   være klart bedre, og lista kan bare flytte overskriften når et annet stopp
   har klart flest av avgangene du rekker. Med et hurtigvalg som
   «mot sentrum» brukes Enturs reisesøk: stoppet der du er tidligst framme.
5. **Hvilke avganger hentes?** Fra stoppet i overskriften og opptil fem
   nabostopp innen 8 min gange fra det, flettet til én liste — hver tur én
   gang.
6. **Hvilke rader vises?** De du rekker, sortert etter når du må gå
   («gå om N»); de du ikke rekker samlet under. Hurtigvalg filtrerer
   retningen. Reiser med bytte som er raskere enn de direkte flettes inn.
7. **Hva tegnes på kartet?** Én strek per retning fra stoppet, de første
   seks stoppene tydelig og resten dempet; gangveien til stoppet; lapper
   som ryddes etter viktighet.

---

## 1. Hvor er du

| Regel | Tall | Hvor |
|---|---|---|
| Søkepunktet er valgt sted hvis du har valgt ett, ellers GPS | — | `søkePunkt` (`src/geo.js`), `_settSted` (`auto.js`) |
| En posisjon med dårligere nøyaktighet enn grensen godtas ikke (bortsett fra den første) | `ACC_GATE = 40` m | `src/position.js` |
| Stoppsøket gjøres på nytt først når du har flyttet deg | `STATION_REFRESH_M = 200` m | `src/geo.js` |

## 2. Hvilke stopp er i nærheten

| Regel | Tall | Hvor |
|---|---|---|
| Geokoderen spørres om holdeplasser innen radius | `NEAR_STOP_MAX_M = 850` m | `findNearestStation` (`src/geo.js`) |
| Finnes ingen, utvides søket trinnvis (v1.218.253, «hele dekningsområdet») | `SØK_TRINN_KM = [0.85, 2, 5]` | samme |

## 3. Rangering av stoppene (`_stops()`)

Rekkefølgen, øverst vinner:

1. **Bånd** (`stopBand`): 0 = du står ved det (`CLOSE_M = 100` m); 1 = du
   har brukt det før eller går mot det; 2 = resten.
2. **Gåretning** (utenfor bånd 0): stopp du går mot før stopp du går fra.
3. **Bruk** (i bånd 1): mest brukt først.
4. **Tilbud innen gangbåndet, ellers avstand** (`nærViktigFørst`,
   `src/api/stops.js`). Gangbåndet skalerer med stedet:
   `båndFor(nærmeste) = max(VIKTIG_GANG_M, 1,5 × nærmeste)`,
   `VIKTIG_GANG_M = 400` m. Tilbud sammenlignes (`sammenlignViktighet`) på:
   transportmiddel (`MODUS_VEKT`, se «Transportmidlene» under),
   avganger neste time, avganger i døgnet, linjer, plattformer.
5. **Hurtigvalg** (v1.218.274): med et annet valg enn «alle» telles
   avganger neste time *i den retningen* i stedet for alle
   (`retningsViktig`).
6. **Faste stopp** (`fastFørst`, `src/fasteStopp.js`): hverdager om morgenen
   løftes morgenstoppet øverst, om ettermiddagen stoppet du reiser hjem
   fra — når det er innen gangavstand (`FAST_MAKS_M = 640` m eller
   gangbåndet), og ikke når du står ved et annet stopp.

## 4. Stoppet i overskriften

**Avklaring først** (v1.218.273). Til posisjonen er god nok
(`AVKLAR_ACC_M = 50` m) og tilbudet for de nærmeste er kjent — eller
`AVKLAR_MAKS_MS = 8 s` har gått — er valget foreløpig: «nærmeste stopp ·
finner beste stopp …». Avgangene hentes bare for første kandidat i den
tiden.

**Så ro.** `pickStop` bytter bare når det øverste stoppet er i et bedre bånd,
eller minst `PICK_MARGIN_M = 40` m nærmere. Et stopp du har valgt selv
står til du velger annet.

**Listeregelen** (v1.218.243): overskriften følger stoppet lista faktisk
bruker. Blant de første `LISTE_TOPP = 5` avgangene du rekker telles hvert
stopps andel; et annet stopp må ha minst 2 flere, ha ledet i
`LISTE_RO_MS = 90 s`, og det må ha gått `LISTE_MIN_MELLOM_MS = 5 min` siden
forrige bytte. Valget holdes til du er `LISTE_HOLD_M = 800` m unna. Ikke når
du står ved stoppet.

**Med hurtigvalg** (v1.218.274/278): et trykk gir svar straks. For
«mot sentrum» og målområdene velges påstigningen på reisen som er
tidligst framme i Enturs reisesøk fra der du er (`besteFraReiser`,
`src/reiseTil.js`) — slik Entur selv velger. Telleregelen over er
reserven («hjemover», «alle», eller før reisesøket har svart).

**Overskriften flyttes, tavla står** (v1.218.283): når overskriften flyttes
til et stopp hvis avganger allerede er flettet inn (`byttUtenNyTavle`), hentes
ingenting på nytt. Hurtigvalg, målområder, reisesøk og «fra …» regnes fra
stoppet tavla ble hentet for (`_tavle()`), ikke fra overskriften — ellers
endret et hurtigvalg sitt eget grunnlag, og knappene byttet under fingeren.
Et hurtigvalg flytter overskriften bare til stopp som er i tavla
(`kanVisesHer`, v1.218.284); peker reisesøket på et stopp utenfor, står
overskriften, og reisen vises som rad («fra Kantarellen · 15 min å gå»).

**Om bord** (`velgStoppIFart`): overskriften blir neste stopp på linja.

**Merkelappen** (`whereLabel`):

| Merkelapp | Når |
|---|---|
| «du er ved» | innen `AT_STOP_M = 120` m (og står til 120 + `MERKE_UT_M = 30` m) |
| «nærmeste stopp» | lenger unna, eller under avklaring |
| «beste stopp herfra» | et annet stopp er minst 30 m nærmere, men dette er valgt |
| «beste stopp mot sentrum / hjemover / for …» | samme, med hurtigvalg |
| «neste stopp på …» | om bord |

## 5. Hvilke avganger hentes

- **Stoppet i overskriften**: `AUTO_BOARD_DEPARTURES = 30` avganger.
- **Nabostopp** (`knutepunkt`): opptil `TAVLE_NABO_MAKS = 5`, innen
  `TAVLE_GANG_MAKS_MIN = 8` min gange (× 80 m = 640 m) **fra stoppet i
  overskriften**. Nytt transportmiddel først, så tilbud, så avstand.
  Hvert nabostopp får `KNUTEPUNKT_VENT_MS = 2,5 s`; svarer det senere, er det
  ikke med denne gangen.
- **Flettet** (`slåSammenKall`): hver tur én gang — fra stoppet ditt hvis
  den går derfra, ellers fra første nabostopp. Hver rad vet hvilket stopp
  den går fra (`_fra`).
- **Når hentes det?** Når skjermen åpnes, når stoppet i overskriften
  endres, ved ↻, ved hurtigvalg og ved valgt tidspunkt. Ellers telles
  tidene ned hvert sekund uten ny henting.

## 6. Radene

- **Hurtigvalg** (`filtrerRetning`): «alle», «mot sentrum» (går turen
  nærmere byens sentrum, `sentrumFor`), «hjemover» (når turen et av
  hjemover-stoppene — eget valg, ellers morgenstoppet og stoppene rundt),
  målområder (hvor linjene ender, `src/maalomrader.js`) og «andre
  retninger». Knappene vises bare når det finnes noe å skille. Hver knapp
  viser linjene den gjelder (høyst fire, ellers «+N»), «mot sentrum» sier
  byen («mot Bergen sentrum»), og et valg uten linjer herfra står ikke —
  unntatt «hjemover», som er veien til å velge hjemover-stopp (v1.218.282).
- **Rekker / rekker ikke** (`tavleDel`, `canCatch`): gangtiden er til
  radens eget stopp. De du ikke rekker samles under lista.
- **Reiseoppgavene** (v1.218.287): «mot sentrum» og «hjemover» beregnes i
  `src/reiseoppgaver.js` (`motSentrum`, `hjemover`, `gårMotSentrum`,
  `hjemoverDom`); felles regler som «rekker du den» i `src/reiseberegning.js`.
- **Rekk den lenger ned** (v1.218.185): en avgang du ikke rekker her, men
  rekker på et senere stopp på samme tur, flyttes opp med det stoppets tid
  og gangtid.
- **Tre tall med faste plasser** (v1.218.286): venstre «gå om N» (når du må
  gå); høyre **«framme HH:MM»** når turen stopper ved et kjent mål, med «går
  HH:MM» smått under; ellers avgangen. I en blandet liste står «går» over
  avgangen, så tallet aldri leses som ankomst. Midten sier «til <mål>».
- **Rekkefølge**: etter når du må gå (avgang − gange) — «gå om N» /
  «GÅ NÅ». Stopp bak deg sist.
- **Reiser med bytte** (`kombiRader`): for «mot sentrum» og målområdene ett
  reisesøk per stopp og retning (gyldig `KOMBI_GYLDIG_MS = 3 min`, innenfor
  et hentebudsjett). Med bytte vises de som er framme minst
  `KOMBI_MIN_GEVINST_MIN = 3` min før den tidligste direkte raden du rekker
  i lista (v1.218.285; uten ankomst i lista: før søkesvarets beste direkte),
  eller er eneste vei. «N min raskere» måles mot det samme. Flettet inn etter
  «gå om».
- **Mer ved rulling**: `TAVLE_SIDE = 12` rader om gangen; tom lokal liste
  henter neste side. Stopper etter `AT_TOM_MAKS = 3` utvidelser som ikke
  gir flere synlige rader (v1.218.272).
- **Bestilling**: fleksible linjer merkes på raden.

## 7. Kartet

- **Streker** (`edderkoppBein`): én per retning (etter hurtigvalg og
  kartets filtre), fra første avgang du rekker med kjente stopp. De første
  `EDDERKOPP_STOPP = 6` stoppene tydelig, resten dempet. Streken starter
  ved plattformen avgangen går fra, ellers i stoppets midtpunkt, og følger
  veien bussen kjører når formen er hentet (`turForm`).
- **Gangvei** til stoppet i overskriften (og til et nabostopp når du har
  trykket på en rad derfra).
- **Lapper** ryddes etter prioritet (`ryddLapper`): stopp, gang, din
  plattform, andre, linje, plattform. Den som taper får kortform eller
  skjules.
- **Innramming og zoom** følger `docs/kartregler.md`; har du rørt kartet,
  eier du det.

## Transportmidlene

Målt mot Enturs API 2026-11-23: `TransportMode` i skjemaet til Journey
Planner v3, antall linjer per transportmiddel (`lines`), og kategoriene
geokoderen gir holdeplasser (prøvd i Oslo, Bergen, Trondheim, Tromsø,
Kristiansand, Moss, Sogndal, Gardermoen og Narvik).

| Transportmiddel (Entur) | Linjer i dag | Holdeplassen finnes som | Avganger hentes | Vekt | Merknad |
|---|---|---|---|---|---|
| `bus` buss | 4117 | `onstreetBus`, `busStation` | ja | 2 | |
| `coach` ekspressbuss | 48 | (som buss) | ja, følger buss | 2 | regnes som buss (`normMode`) |
| `taxi` bestillingstransport | 97 | (vanlig holdeplass) | ja, følger buss (v1.218.279) | 2 | `communalTaxi`, mest på bygda; merkes «må bestilles» |
| `water` båt og ferje | 248 | `ferryStop`, `harbourPort` | ja | 2 | |
| `rail` tog | 45 | `railStation` | ja | 4 | |
| `metro` T-bane | 5 | `metroStation` | ja | 4 | |
| `tram` trikk og bybane | 9 | `onstreetTram`, `tramStation`, `tramStop` | ja | 3 | |
| `air` fly | 97 | `airport` | nei | 1 | flyplassen finnes som stopp (for bussen dit), flyavganger vises ikke |
| `cableway` taubane | 1 | — | nei | 1 | én linje (gondol, vinter) |
| `funicular` kabelbane | 0 | `funicular` (Fløibanen) | nei | 1 | stoppet finnes, uten egne avganger i Entur |
| `lift`, `trolleybus`, `monorail`, `snowAndIce`, `carpool` | 0 | — | nei | 1–4 | i skjemaet, uten linjer i dag |

`BOARD_MODES_COACH` (`src/api/queries.js`) er lista som spørres om. Når
buss er på, følger `BUSS_FØLGER = ['coach', 'taxi']` med — både i
avgangsspørringen og i reisesøket (`transportModesGql`, v1.218.280).
Målt: fra Tretten sentrum til Tingberg ga reisesøket uten taxi bare buss
141; med taxi kom bestillingstaxi 5030 og 5031 med.

## Hva du styrer selv

Valgt sted · stopp valgt fra «N ▾» · hurtigvalg · faste stopp og hjemover ·
valgt tidspunkt · kartets filter for transportmiddel og linje.

## Kjente begrensninger

- **Fly og taubane** hentes ikke som avganger (valg 2026-11-23).

- **850 m-grensen.** Finnes det holdeplasser innen 850 m, blir et stopp
  lenger unna aldri hentet — også en T-banestasjon på ~1 km (forsøkt
  utvidet i v1.218.275, tatt ut igjen i v1.218.277).
- **Nabostopp måles fra stoppet i overskriften**, ikke fra deg. Et
  annerledes valg i overskriften gir andre naboer.
- **Et nabostopp som svarer etter 2,5 s** er ikke med før neste henting.
- **Neste side ved rulling** hentes bare fra stoppet i overskriften.
- **Strekene på kartet starter i stoppet i overskriften**, også for en
  avgang fra et nabostopp (forsøkt rettet i v1.218.276, tatt ut igjen).
- **Reisesøket som velger overskriften** gjelder bare «mot sentrum» og
  målområder, og bare stopp som alt er i lista.
- **Ingen jevnlig ny henting.** Står du på skjermen, telles tidene ned,
  men nye forsinkelser kommer først ved ↻, nytt stopp eller nytt
  hurtigvalg.

## Ordliste

| Ord | Betyr |
|---|---|
| bånd | stopp du står ved / går mot eller bruker / resten |
| gangbånd | avstanden der tilbud teller foran avstand: `båndFor` |
| avklaring | de første sekundene, før valget av stopp låses |
| listeregelen | overskriften følger stoppet lista bruker mest |
| hurtigvalg | knappene «alle», «mot sentrum», «hjemover», målområder |
| målområde | hvor en gruppe linjer ender, som egen knapp |
| knutepunkt | stoppet i overskriften pluss nabostoppene som flettes inn |
| edderkoppbein | strekene ut fra stoppet på kartet |
| kombirad | en rad for en reise med bytte |

## «Ett bytte» (eksperiment, v1.218.289)

Et ekstra hurtigvalg, **«ett bytte»**, står sist blant hurtigvalgene når tavla
har et stopp med posisjon. Det viser hvilke områder du når med **ett bytte**,
én rad per **himmelretning**: nord, nordøst, øst, sørøst, sør, sørvest, vest og
nordvest. Målet er så mange ulike retninger som mulig.

**Kilde:** nettverksutforskeren (`src/nettverksutforsker.js`), som hentes
først når valget trykkes. Den har sin egen cache på 10 min og 200 m, og koster
5–6 kall første gang.

**Utvalget** (`src/ettBytte.js`, `ettByttePerRetning`):
- bare veier med **to ledd** i **ordinært** søkevindu, med et reelt bytte
  (samme linje videre er ikke et bytte);
- gruppert etter himmelretningen til destinasjonens område. Sentrum (under
  1 km) er ingen retning;
- **ett knutepunkt per retning:** det som når flest ulike områder i den
  retningen, så flest steder, så id. Det er spredning, ikke relevans;
- linjene inn og ut slås sammen per linje. Plattform- og skiltvarianter blir
  ett valg. Høyst 4 linjer ut vises, resten som «+N»;
- 3 eksempelsteder (de lengst unna) og antallet til.

**Hva raden *ikke* sier:**
- ingen reisetid;
- ingen «rekker»;
- ingen bekreftelse.

Overskriften sier: «mulig med ett bytte — ikke sjekket mot reisesøket, og
byttet er ikke tidskontrollert».

**Når noe mangler:**

| situasjon | teksten |
|---|---|
| utforskeren leter | «ser etter hvor du kommer med ett bytte …» |
| nettfeil | «fant ikke svar på bytter herfra nå» |
| ingen treff | «fant ingen bytter herfra nå — det betyr ikke at det ikke finnes» |

**Valget huskes ikke.** Etter omlasting står tavla på et kjent valg. Avgangslista,
«mot sentrum», «hjemover» og målområdene er uendret.

### Kartet (v1.218.290)

Når svaret er kommet, viser kartet det samme som radene
(`ettBytteKart` i `src/views/ettBytteVisning.js`, eget Leaflet-lag):

- **deg** som fylt prikk, og en stiplet strek til hvert **knutepunkt** (ring);
- fra knutepunktet en tynn strek til hvert **sted** du når derfra. Høyst 8
  steder per retning (`KART_STEDER`), jevnt fordelt fra lengst unna til
  nærmest (`spredt`), så både nærområdet og rekkevidden vises;
- strekene er **skjematiske** — rette linjer, ikke traséer.

**Ett tema** (`docs/kartregler.md`): tavlas eget lag (stopp, linjer, lapper)
skjules mens «ett bytte» vises, og kommer tilbake når valget går av.

**Rammen**, én gang per sted mens valget står:
- deg, alle knutepunktene og de 3 nærmeste stedene per retning
  (`RAMME_NÆRMESTE`);
- et sted tas bare med innenfor `rammeGrense`: 2 × medianavstanden til
  knutepunktene, minst 5 km. Det skalerer med stedet, men ett fjernt
  knutepunkt (Oslo lufthavn) drar ikke med seg Lesja. Langdistanse peker ut
  av kartet som retninger.

Et nytt svar på samme sted flytter ikke kartet. Rører du kartet, er det ditt.
Tavla regner kartet som «justert» mens laget vises, og får tilbake din egen
tilstand når valget går av, så en justering du gjorde før, ikke slettes.

### Knutepunktene som bobler (v1.218.292)

Strekene fra knutepunkt til sted er fjernet. Knutepunktene **veies mot
hverandre** med en Proven kartform, proporsjonale symboler:

- **Én boble per knutepunkt.** Arealet følger antallet steder knutepunktet
  betjener (summen over retningene det bærer), så radien er ∝ √antall
  (`bobleRadius`). Den største er 22 px, og ingen er under 6 px, så alle kan
  trykkes.
- **Tallet står i boblen.**
- **Oversikten** viser deg, en stiplet strek til hvert knutepunkt og boblene.
  Steder vises ikke. Rammen er deg og knutepunktene, med plass til den største
  boblen og navnelappen (`RAMME_VALG`).
- **Trykk et kort:** knutepunktet fremheves, de andre boblene dempes, og
  kortets steder vises som prikker (høyst 60, `KART_STEDER_VALGT`). Det er
  stedene som betjenes fra det knutepunktet i den retningen.
- **Trykk en boble:** den velger retningen den bærer.
- **Navnelapper og tall er markører, ikke faste Leaflet-lapper.** Tavlas
  lapprydding (`ryddKart`, `src/ui/lappPlass.js`) skjuler lapper som krasjer,
  og den skjulte både tallene og «Helsfyr», som var alene (sett i
  nettleseren). Ett bytte rydder sine egne: navn som ville krasje, slås sammen
  til én lapp (`samleEtiketter`, `lappRekt`).

**Kjent begrensning:** når tre knutepunkter står tett, får oversikten én samlet
lapp («Oslo bussterminal · Nationaltheatret · Helsfyr»). Hvilket navn som
hører til hvilken boble, ser du ved å trykke på boblen eller kortet.

### Retningskortene (v1.218.291)

Hver rad er et **kort du kan trykke på**. Det er Proven: liste ↔ kart, som i
andre kartapper og som når en åpnet avgang rammer inn linja. Det nye er
innholdet, ikke måten du trykker på.

- **Trykk et kort:** kortet markeres (`aria-pressed`). Kartet viser den
  retningen i full styrke, med opptil 20 steder (`KART_STEDER_VALGT`) og
  knutepunktets navn. De andre retningene står igjen dempet og uten etikett:
  fremhev, ikke skjul.
- **Ny ramme:** deg, knutepunktet og retningens steder innenfor `rammeGrense`
  for dette knutepunktet. Langdistanse peker fortsatt ut av kartet.
- **Samme kort igjen** gir oversikten og oversiktsrammen tilbake. Et annet kort
  bytter valget.
- **Trykk på et sted i kartet** velger retningen det hører til, og ruller
  kortet fram.
- **Kortvalget glemmes** når du flytter deg (nytt sted), når valget «ett bytte»
  går av, og når retningen ikke finnes i et nytt svar.
- **Kartet flyttes bare når temaet endres** (nytt sted eller nytt kortvalg).
  Et nytt svar med samme valg flytter ikke kartet.

Kortene håndteres av én delegert lytter i `ettBytteVisning.js`. Det er ingen
ny linje i `auto.js`.

**Etiketter:** knutepunkter som står nærmere hverandre enn 48 px på skjermen,
deler én etikett («Oslo bussterminal · Helsfyr · Nationaltheatret»).
Knutepunktet med flest retninger bærer den (`samleEtiketter`). Etikettene
regnes ut ved innrammingen, ikke på nytt når du zoomer.

**Tilbakerulling:** sett `ETT_BYTTE = false` i
`src/views/ettBytteVisning.js`. Alternativt fjerner du de to modulene,
`src/style/ettBytte.css` og de seks linjene merket «ETT BYTTE (eksperiment)» i
`src/views/auto.js` (fem for lista, én for kartet). Testen
`tests/ettBytte.test.js` binder at det er nøyaktig seks slike linjer.
