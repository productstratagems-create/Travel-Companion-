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
   («gå om N»); de du ikke rekker samlet **øverst, lukket** (v1.218.301). Hurtigvalg filtrerer
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
  radens eget stopp. De du ikke rekker samles i en lukket linje **over**
  lista, «N avganger du ikke rekker» (v1.218.301). Bestilt: de er ofte innen
  rekkevidde likevel, fordi du løper eller bussen er sen. v1.218.245 hadde
  flyttet den under lista for å få første kort over kanten. Lukket er den én
  linje, så det holder fortsatt.
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

## Hjemover: hele reisen i to etapper (v1.218.303)

Hjemover-raden viste første etappe og hvor du bytter: «23 · bytt på
Brynseng T». Den viste ikke hva du bytter til eller når du er hjemme, selv
om reisesøket hjem hadde svart (skjermbilde fra Økern, hjem = Mortensrud).
Nå står hele reisen når søket har akkurat denne avgangen:

    bytt på Brynseng T til T-bane 3 · hjemme 18:04

- **Kilde:** reisesøket hjem som alt kjøres (`_hjemSøkOppdater`, uten nye
  kall). `hjemReiser` tar vare på alle reisene i svaret, én per avgang.
- **Treff** (`hjemReiseFor`): samme linje, samme byttested og avgang innen
  1 min (`HJEM_SAMME_AVGANG_MS`). Senere avganger enn de søket dekker står
  som før, «bytt på Brynseng T», uten påstått ankomst.
- **Bare nøyaktig ett bytte** gir «til …». Ellers ville «til» hoppet over et
  bytte.
- **Ikke en løfte om byttet:** byttet er planlagt av Entur, og raden sier
  ikke at det rekkes.
- **Uendret regel:** hva som regnes som hjemover (`hjemDom`, «bare gode
  forslag») er det samme.
- **Én tekst** (`byttTekst` / `byttTillegg`) for tavla og Auto-reise.

**Hele reisen i avgangsdetaljer (v1.218.304).** En hjemover-rad med treff
(den som sier «… · hjemme HH:MM») åpner hele reisen, ikke bare første
avgang: `hjemReiser` tar vare på reisemønsteret (`tp`), og klikket sender
`kombiKall(x.hjemReise)`, slik kombinasjonsradene gjør. Detaljene viser da
begge etappene, byttet og ankomst hjemme. En rad uten treff åpner som før.
Auto-reise er uendret: raden der åpner stopplista, ikke avgangsdetaljer.

**Avganger utenfor hjemsøket (v1.218.306).** Rapportert fra Tåsen: «5 Ringen
via Majorstuen · bytt på Majorstuen» åpnet bare én etappe. Hjemsøket gir
Enturs beste reiser, ikke hver avgang. Trykk på en rad med bytte uten treff
henter reisen for akkurat den turen (`_hjemReiseVedTrykk`):
- ett søk per hjemstopp, med bare radens linje og linjene du bytter til på
  samme sted (`videreLinjer`) og de andre turene på linja i lista utelatt
  (`tripMedLinjerGQL`). Uten utelatelsen svarte Entur med en raskere tur på
  samme linje (sett live fra Nydalen);
- reisen velges på turens id (`reiseForTur`). Byttet i avgangsdetaljene er
  Enturs, og kan være et annet enn raden sa;
- uten svar innen 4 s (`HJEM_TRYKK_MS`) eller uten treff åpnes raden som før.

## «Gå lenger, færre bytter» (eksperiment, v1.218.302)

**Bakgrunn:**
- Tracer 2 (`docs/tracer-bedre-reise.md`) fant en avveining: gå til et annet
  stopp og få færre bytter, med omtrent samme ankomst.
- I brukertesten gikk grensen for gangtid ved 15–17 min.
- Brukeren setter selv grensen i innstillinger: «gå lenger for færre bytter
  · lengste gange», med valgene av, 10, 15 (standard), 20 og 25 min
  (`t.gangAlternativ`).

**Regelen** (`gangAlternativRader` og `medGangAlternativ` i
`src/gangAlternativ.js`): reisesøket Auto-tavla alt gjør for et valgt område,
uten nye kall. I tillegg til kombinasjonsradene vises en reise som
- har **færre bytter** enn en kombinasjonsrad som **vises**;
- starter fra et **annet stopp** enn den;
- er fremme innenfor **± 5 min** (`SAMME_ANKOMST_MIN`);
- har **gange til første stopp** innenfor brukerens grense.

**Raden** har samme form som kombinasjonsradene og sier hva den sammenlignes
med: «fra Helsfyr T · 1 min å gå · uten bytte · 3 min senere enn 3 → L1». Den
sier aldri «bedre». Ett minutt regnes som «samme ankomst». Raden står bare én
gang, selv om den også er en kombinasjonsrad. Kombinasjonsradene sier nå
«2 bytter», ikke «2 bytte».

**Hva ekte data viste** (2026-11-24, appens egne funksjoner mot Entur):
- Tracerens tilfelle, 24 min gange til Hauketo og så L2, kom **ikke** i
  reisesøket. Entur valgte buss 73X og så L2.
- Over 33 søk (Mortensrud, Helsfyr, Nesttun; tre tidspunkt) ga 2 en
  avveiningsrad, begge med kort gange: buss 100 direkte fra Helsfyr T mot
  T-bane og tog til Lillestrøm.
- Raden er altså **sjelden**, og avveiningen er oftere «direkte, litt senere»
  enn «gå lenger». Den er ikke sett i tavla, fordi Helsfyr ikke tilbød
  Lillestrøm som valg den dagen.

**Tilbakerulling:** sett `GANG_ALTERNATIV = false`, eller fjern modulen, de
to linjene merket «GÅ LENGER (eksperiment)» i `src/views/auto.js` og
innstillingen. Testen binder at det er nøyaktig to linjer.

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

### Se etter — reiseruter med noe til felles (v1.218.299)

Over kortene står «se etter: retning · knutepunkt · linje · transport ·
kommune». De samme oppdagede veiene grupperes etter det de har til felles
(`ettByttePer` og `FASETTER` i `src/ettBytte.js`):

| fasett | ett kort = | eksempel |
|---|---|---|
| retning | himmelretning, ett knutepunkt per retning (dagens kort, uendret) | «nordøst via Helsfyr» |
| knutepunkt | alle ruter som bytter der | «Helsfyr · 22 reiseruter» |
| linje | alle ruter med linja inn **eller** ut (en vei hører til begge) | «T-bane 3 · 92 reiseruter» |
| transport | ut-linjas transportmiddel | «tog · via Nationaltheatret, Oslo lufthavn +2» |
| kommune | stedets kommune. Vises når kommunedataene er kommet | «Bærum» |

**De tre egenskapene:**
- **Distinkt:** en **reiserute** er linje inn → knutepunkt → linje ut. Mange
  stopp på samme reiserute er ett valg. Kortet teller reiseruter og steder.
- **Forståelig:** én fasett om gangen, i kortenes vanlige språk. Rekkefølgen
  følger en synlig regel: retning går med klokka, ellers flest steder først.
  Ingen skjult score. Over 10 grupper (`GRUPPER_VIST`) foldes til «vis alle N
  (de neste har færre steder)». De slettes ikke.
- **Etterprøvbar:** grunnlagslinja står som før. «Sjekk denne» regner hvert av
  kortets knutepunkter som «vår vei». Kortet sier hvilke knutepunkter og
  hvor mange reiseruter det gjelder.

**Gjenbruk:** gruppene har samme form som retningskortene. Kort, valg,
kart, frekvens, stedstyper, ytterpunkt og «sjekk denne» er derfor uendret.
`ettByttePer(…, 'retning')` er felt for felt lik de gamle retningskortene i
alle fem opptakene. Testen binder det.

**Kartet:**
- Et valgt gruppekort fremhever **alle** gruppens knutepunkter.
- Boblene teller ulike steder per knutepunkt, så overlappende grupper (linje)
  ikke telles dobbelt.

Fasetten huskes ikke etter omlasting. Bytter du fasett, nullstilles valgt
kort.

**Ikke med nå:**
- ruter uten bytte (ledd 1);
- kombinerte fasetter (tog **og** via Helsfyr);
- ruter i det utvidede vinduet. «Ett bytte» bruker bare det ordinære.

### Linjeparene — kortet påstår bare det som er observert (v1.218.300)

**Bakgrunn:** tracer del A (`docs/tracer-sammenlign-utgangspunkt.md`) viste at
to lister med linjer inn og ut antyder kombinasjoner som ikke er observert:
18–70 % i fasettene linje og transport. Listene lagde forbindelser
datagrunnlaget ikke dokumenterer.

**Linjeparet er førsteklasses** (`linjepar` i hver rad,
`src/ettBytte.js`): linje inn → knutepunkt → linje ut, med antall steder.
`reiseruter` er antallet par. Én definisjon.

**Én regel, avgjort av dataene** (`listerHolder`):
- **Listene vises** bare når hver kombinasjon av en inn-linje og en annen
  ut-linje er observert: «FB10 → bytt til 100, 110 …». «74 → 74» er ikke et
  bytte og telles ikke.
- **Ellers vises parene:** «T-bane 3 → 100 på Helsfyr · T-bane 3 → 31 på
  Jernbanetorget · +89 reiseruter». Høyst 3 vises (`PAR_VIST`), de med flest
  steder.
- **Effekt** målt med `scratchpad/tracerLinjepar.mjs --etter`: 0 % påståtte
  og ikke observerte par i alle fem opptak og fire fasetter, mot 0–70 % før.
  Testen «kortet påstår bare observerte par» binder dette.

**Observert er ikke bekreftet.** Et par er sett i avgangene nå. Det er ikke
en tidsbekreftet overgang, og grunnlagslinja sier fortsatt «ikke
tidskontrollert». «Sjekk denne» skiller nå tre svar:
- «bytt på Helsfyr · **samme linjer som kortet**»: Entur bekrefter paret,
  med linje og byttested;
- «bytt på Helsfyr, **med andre linjer** (T-bane 2 → 300)»: byttestedet
  stemmer, paret gjør det ikke;
- «Entur foreslår via X»: en annen vei.

### Opplevelser på stedsradene (v1.218.313, steg 1)

Grunnlaget: `docs/tracer-opplevelser.md` (§16, implementasjonsplanen).

Når et kort velges, hentes opplevelsene for de samme 8 stedene som reisene.
Det er tre åpne kilder uten nøkkel, i 3 kall per sted, cachet et døgn
(`src/api/opplevelserKilder.js`):
- Kartverkets turrutebase (alle rutetyper i ett WFS-kall);
- Miljødirektoratets kartlagte friluftslivsområder;
- Wikidata.

Under hver stedsrad står **høyst to** linjer, for eksempel
«Pilegrimsleden-Gudbrandsdalsleden · nasjonal turrute · historisk
ferdselsvei · ved stoppet».

**Regler** (`src/opplevelser.js`, én definisjon med traceren):
- **Bare reisemål** (`erReisemål`), innen 1,5 km til stedets nærmeste punkt
  eller kant.
- **Ruteledd med samme navn er én rute** («Storkjølla» sto tre ganger før
  regelen).
- **Rekkefølge** (`velgVisning`):
  1. nasjonal turrute (ikke sykkelrute);
  2. regional turrute eller sterkt reisemål;
  3. andre ruter og friluftsområder;
  4. resten;
  5. kirker.

  Innen samme trinn kommer de med flest språkversjoner i Wikidata først,
  deretter de nærmeste. Høyst én rute vises når det finnes noe annet.
  Sykkelruter står ikke øverst: «Pilegrimsruta · nasjonal sykkelrute» sto ved
  tre bystopp i Oslo.
- **Avstand:** gangtid bare når Valhalla har målt den, ellers «ca. N m».
  Aldri en påstått gangtid.
- **Fasiliteter** fra turrutebasen innen 300 m står som fakta: «parkering,
  benker ved».
- **Uten funn:** ingen linje. Stedet står som før.
- **Kilder:** «turruter © Kartverket · friluftsområder Miljødirektoratet ·
  Wikidata» står under lista (CC BY 4.0).
- **Turruter på kartet:** valgfritt og av som standard (`t.turruteLag`).
  Kartverkets WMS-tjeneste (`wms.friluftsruter2`) legges oppå dagens kart.
  Dagens kart beholdes (beslutning 24.11).

### Unike beste opplevelser på tvers av kortene (v1.218.323)

Samme opplevelse skal ikke være «beste» på to kort. Kortene velger i
visningsrekkefølge (nær → langt, `unikeBeste`), og en opplevelse et tidligere
kort har tatt, er ikke tilgjengelig for de neste. Er alt tatt, står kortet
uten boks. Identitet (`opplevelseNøkkel`): Wikidata-id, ellers navnet (ikke
posisjon: kanten på en flate er ulik fra hvert stopp). Samme tilstand gir
samme valg.

### «Ett bytte unna» er en modus i menylinjen (v1.218.321)

Bestilt: «Ett bytte unna er en modus og knappen skal flyttes ned til menylinjen
ved siden av Auto-tavla.»
- Menypunktet `v-bytte` («ett bytte unna») står rett til høyre for
  Auto-tavla og følger samme valg (`navSynlig`). Det er en modus av
  Auto-tavla, ikke en egen skjerm: `navTo` setter modusen
  (`window._settEttBytte`), og menyen lyser for den (`navActive`).
- Knappen er tatt ut av retningsknappene på tavla. Valget huskes ikke, som før.
- Auto-tavle og Auto-reise slår modusen av igjen.

### «Ett bytte unna» (v1.218.320)

- Knappen heter **«ett bytte unna»**.
- Raden «hvor langt» (nært, regionalt, nasjonalt) er tatt bort der.
  **Alt rangeres fra nær til langt unna:** kortene etter det nærmeste stedet
  de dekker (`nærmesteM`), og stedene inni et valgt kort nærmest først.
  «Hvor langt» står fortsatt for «alle» og målområdene.
- Bare **retning** og **kommune** er knapper (`FASETTER_VIST`). Knutepunkt,
  linje og transport er fortsatt kode (tester og kommuneoppslaget), men ikke
  valg.

### Opplevelsen hører til kortet (v1.218.319)

Rapportert (skjermbilde): opplevelsesboksen lå over kortoverskriften og leste
som en del av kortet over. Utprøvd gruppering (nærhet, felles område,
overskrift først, binding med ord):
- hvert kort er **én ramme** med luft mellom kortene;
- **tittelen kommer først**, og opplevelsen henger under som en innrykket del
  med venstrekant;
- etiketten er «beste opplevelse i **nord**» (kortets eget navn);
- «ett av 3 steder kortet dekker» skiller opplevelsens stopp fra endestoppet
  («helt til …»).

### Beste opplevelse øverst på kortet (v1.218.318)

Bestilt: kortene under «ett bytte» pakker stopp inn etter en linse (retning,
knutepunkt, linje, transport, kommune), men **opplevelsen** er hovedtingen:
«Hvilke opplevelser er innen min rekkevidde, og hvordan kommer jeg dit?»

- Hvert kort viser **sin beste opplevelse** øverst: «beste opplevelse her»,
  navn, hva, ved hvilket stopp og avstand. Stoppene («via …», eksempler) står
  under som før.
- Valget er `besteForKort`: `velgVisning` over de forhåndshentede stedene
  (regelen er uendret). Uten funn står kortet som før, uten tom boks.
- Oppslagene går i en kø (`FORHÅND_SAMTIDIG` = 3) og gjelder bare
  `FORHÅND_STEDER` = 3 steder per kort (de lengst unna først, `spredt`),
  i «lett» modus uten gange og bilde. Velges kortet, fylles gange, bilde og
  ingress ut for stedene som vises (`fyllUt`). Cache per stopp i et døgn.
- Bilde av den beste hentes (`hentBerikelse`) og vises lite til høyre når det
  finnes, med samme krav som ellers (aldri uten fotograf og lisens).
- Reisen dit står som før når kortet velges: reiseraden, tilgangsordet med
  verdiene og «framme ca.».
- Ikke med ennå: en flat opplevelsesliste på tvers av kort, og et
  forhåndsberegnet landsdatasett (steg 3), som gir opplevelser for alle
  stedene uten kall.

### Stedet skilt fra reisen, og solgt (v1.218.315)

Bestilt: «skille bedre på selve reisen til og severdigheten i nærheten av
stoppestedet», og «severdigheten må selges mer».

**Reisen og stedet:**
- Hver stedsblokk har overskriften «reisen til <stopp>» med reiseraden.
- Under står en egen del, «Ved <stopp> · N ting å oppleve», med innrykk og
  egen bakgrunn.
- Opplevelseskortet viser ikke reisen lenger. Den står i reiseraden, og
  «Hele turen: <tilgang> (verdier) · framme ca.» står nederst på kortet, skilt
  med strek.

**Utprøvd kortmønster** (Google Maps, Tripadvisor, Airbnb, Komoot):
- **Bilde først,** fra Wikimedia Commons (Wikidata `P18`), med «Foto: N.N. ·
  lisens · Wikimedia Commons». **Aldri bilde uten fotograf og lisens**
  (`parseBildeinfo`).
- **Navn og kategori,** i inngangens farge.
- **Én setning om hvorfor** (`hvorforTekst`), i rekkefølgen:
  1. Wikipedia-ingress (Tekst: Wikipedia);
  2. Wikidata-beskrivelse;
  3. turrutebasens `informasjon`;
  4. Miljødirektoratets områdebeskrivelse;
  5. verdi.
- **Faktaknapper:** aktiviteter, «N min å gå fra stoppet» og fasiliteter.
- **Handlinger:** «Les mer» (Wikipedia) og «Vis på kart».

**Henting:** bilde og ingress hentes bare for de viste (`hentBerikelse`, 2
kall per opplevelse, cache per Wikidata-id i et døgn).

**Turrutebasens `informasjon`** er ofte en setning. Navnet er det før « - »
(`infoNavn`), og resten blir «hvorfor».

Ikke med: lengden på turruter. Svaret dekker bare ± 800 m, så tallet ville
vært misvisende.

### Opplevelseskort (v1.218.314)

Plan og regler: `docs/tracer-opplevelser.md` §18. Linjen fra v1.218.313 er
erstattet av kort (variant B, med tilgangsordene fra C). Mekanismen som
finner stedene er uendret.

- **Over lista:** «reisetider gjelder søk onsdag 25.11. kl. 12.30 fra der du
  står», med dato og klokkeslett (`søkTekst`).
- **Kortet:**
  - navn, og hva · aktiviteter;
  - beskrivelse fra Wikidata når den finnes og sier mer enn typen;
  - tre verdier, hver med etikett:
    - «reise til stoppet»: varighet og bytter fra den valgte reiseplanen;
    - «gange fra stopp, målt» (Valhalla), eller «luftlinje, ikke gangtid»;
    - «framme ca.», bare etter regelen;
  - tilgangsordet med verdiene;
  - fasiliteter og kilder.
- **`grunnlag()`** kontrollerer det kortet leser:
  - startpunkt og søketidspunkt (lagret på oppslaget i `sjekkSted`);
  - målestopp (planen må ende ved stedet);
  - valgt reiseplan (samme `tp` som reiseraden);
  - transportmidler (fly eller annet utenfor søket avvises);
  - gangmåling.

  Ved avvik er verdien tom.
- **«Framme ca.»** (`samletTid`) er planens faktiske ankomst pluss målt
  gange fra samme stopp, rundet opp. Mangler en del, vises den ikke. Det står
  aldri et samlet antall minutter.
- **Tilgang** (`TILGANG_GRENSER`, hypotese): enkel er inntil 45 min, ≤ 1
  bytte og ≤ 15 min gange. Mulig er inntil 120 min, ≤ 2 bytter og ≤ 25 min.
  Ellers er den krevende, og uten reise eller målt gange er den «ukjent».
  Tilgangen leses aldri i `velgVisning`.
- **Bestillingstransport** (`taxi`, som reisesøket tar med via
  `BUSS_FØLGER`) står som «bestillingstransport · må bestilles», og
  tilgangen blir «ukjent».
- **Ingen reise:** «ingen kollektivreise i søket <dato kl.> — det betyr ikke
  at stedet ikke kan nås». Har Entur en gangrute, kommer «gange hele veien:
  N min (X km, Entur)», med ett ekstra kall bare da.
- **Kart og liste:** prikkene (`opplevelsePrikker`) og kortene leser de samme
  kortdataene og én tilstand (`velgOpplevelse`). Et trykk på en prikk velger
  kortet og ruller det fram, og kartet flyttes ikke. Nytt kort nullstiller
  valget.

### Tidsvinduet (v1.218.310)

Spurt: «Hva er tidsperspektivet for reisene i "ett bytte"?» Kortene bygges av
avgangstavler hentet fra **nå**, med vindu per transportmiddel
(`PARAMETRE.horisontMin`): 60 min for buss, T-bane og trikk, og 180 min for
tog, ekspressbuss og båt. Det gjelder også knutepunktene, så etappe 2 regnes
fra nå og ikke fra når du er framme der. Overskriften sier vinduet, regnet av
svaret (`vinduTekst`): «mulig med ett bytte · avganger fra nå og 1–3 timer
fram — …». Radene under et valgt kort er ekte reisesøk fra nå, og de er
tidskontrollert.

### Sjekk denne (v1.218.298, forslag 5)

Under det valgte kortet står en liste med opptil 8 steder (`SJEKK_STEDER`),
fra lengst unna til nærmest. Hvert sted har «sjekk». Et trykk på «sjekk», eller
på stedet i kartet, kjører **ett reisesøk** fra posisjonen til stedet. Det er
samme spørring som reisebekreftelsen bruker (`reisesøkGql`,
`src/reisebekreftelse.js`). Svaret står på raden i radens språk
(`reiseSammendrag`):
- «fremme 13.07 · bytt på Helsfyr»: Entur bytter der vi oppdaget byttet;
- «fremme 12.45 · Entur foreslår via Hauketo stasjon og Oslo S»: Entur velger
  en annen vei. Det sies, og det er nyttig, ikke en feil;
- «uten bytte», «til fots» og «fant ingen reise nå».

Mønsteret som er fremme først, brukes. Søket gjøres bare på trykk, og bare for
det ene stedet. Svaret caches i 10 min. Feil gir «fikk ikke svar — prøv
igjen», og kan prøves igjen med en gang. Nytt sted eller nytt svar tømmer
svarene.

Dette er broen fra «mulig, ikke sjekket» til en reise. Raden sier ikke
«rekker» og påstår ingen tidskontroll av byttet. Den gjengir det Entur
svarte.

**Reisene som rader (v1.218.305).** Bestilt: «Hver enkelt reise under
seksjonen bør listes som de andre reiseforslagene under Auto-tavle.»
- Velger du et kort, kjøres reisesøket for stedene med en gang (opptil 8 kall,
  bare på trykk, cache 10 min). «sjekk» trengs ikke lenger på tavla.
- Hvert sted står som overskrift med **første reise** som rad, tegnet med
  Auto-tavlas egen kombinasjonsrad (`_kombiRadHtml`, sendt inn som `radHtml`):
  gå om, linjemerker, «fra … · N min å gå», bytter, framme og går.
- Raden sier når Entur går en annen vei enn kortet: «andre byttested enn
  kortet» eller «andre linjer enn kortet». «minst gange» står ikke, fordi det
  ville sammenlignet med reiser som ikke vises.
- Trykk åpner hele reisen i avgangsdetaljer (`sjekkReise` → `kombiKall`).
- Uten reise: «ingen reise funnet i søket». Feil: «fikk ikke svar — prøv
  igjen», med trykk for nytt søk.

### Hvor ofte det går (v1.218.297, forslag 4)

Kortet har én linje: «går inn ca. hvert 15. min · ut ca. hvert 7. min». Den
viser det oftest gående inn (ved stoppet du går til) og ut (ved
knutepunktet).

**Kilde:** avgangene utforskeren alt har hentet, uten ny spørring. Et rent
tilleggsfelt i `src/nettverksutforsker.js` tar vare på dem:
`grupper.linjeretning[dir].avgangerVed[stopp]`. Det gjelder bare det
ordinære vinduet, og høyst `perLinje` per skilt.

**Beregningen:** `frekvensMin` tar medianen av avstanden mellom ulike
avganger. `frekvensTekst` runder den lesbart.
- Avganger under 2 min fra hverandre er samme tur (`SAMME_TUR_MIN`). Sett:
  trikk 17 ble «hvert minutt» fordi turen gikk fra to plattformer.
- Hver linjeretning og hvert stopp regnes for seg. Tider fra to skilt eller to
  stopp er ikke en frekvens.
- Ut-frekvensen gjelder ved knutepunktet, ikke ved andre stopp linja går fra.
- Teksten sier **«ca.»**. Det er et anslag fra 2–3 avganger.

**Én avgang gir ingen tekst.** Med høyst to avganger per skilt sier én avgang
ikke at linja går sjelden. Sett: buss 74 ved Oslo bussterminal, som går hvert
10. minutt, ble merket «sjelden». Planens «1 avgang neste time» ble derfor
ikke bygget. Av samme grunn finnes det ingen «ikke nå»: radene bruker bare
veier i det ordinære vinduet.

**Kartet:** med et kort valgt droppes et dempet knutepunktnavn som ikke har
plass (`tvunget` i `plasserNavn`). Sett: fire knutepunkter i Oslo sentrum lå
oppå hverandre. Det valgte navnet og alle navn i oversikten vises alltid.

### Kommuner, ikke stopp (v1.218.296, forslag 3)

Entur gir **kommunen** til et stoppested, ikke tettstedet. Kortet sier derfor
«kommuner», ikke «steder»: «Eidsvoll, Stange, Hamar og 2 kommuner til».

**Proben (stigen fra planen):**
1. Stoppestedsregisteret (`stop-places/v1`) svarer «Access not allowed».
2. Geokoderens `layers=locality` gir tomt svar. Geokoderens
   `place?ids=` med stopp-id-er gir `locality` = kommune. Det var 50 treff per
   kall og 100 % dekning for Mortensrud, Nesttun og Tretten (målt
   2026-11-24). Det koster 3–4 kall, hentet *etter* svaret, så kortene står med
   stopp til kommunene kommer.
3. Kommunen du står i, hentes med ett `reverse`-oppslag og telles ikke.

**Når kommuner vises:**
- Retningen må nå minst `KOMMUNER_MIN` (2) andre kommuner. I byen blir mange
  retninger i din egen kommune (Bergen nord: 65 stopp, 0 andre kommuner), og
  da sier stoppnavnene mer.
- Mindre enn 80 % kommunedata (`KOMMUNE_DEKNING`) gir stoppene som før.
- Når oppslaget feiler, står stoppene som før.

**Boblene teller fortsatt stopp.** Med kommuner ville knutepunktene i Oslo
krympe til nesten ingenting, og boblen ville svart på et annet spørsmål
(«hvor mange kommuner», ikke «hvor mye nås herfra»).

### Stedstyper (v1.218.295, forslag 2)

Kortet teller stedene som inviterer til en reise ut: «· 13 togstasjoner ·
1 kai». Typen er **transportmiddelet til linja som når stedet** (ut-linja,
`velgStedstype`). Den sier hvordan du kommer dit, ikke hva stedet er.
- Når flere linjer når samme sted, vinner tog, så båt, T-bane, trikk,
  ekspressbuss og buss (`STEDSTYPE_REKKE`).
- Buss telles ikke, den er standarden. Flyplass skilles ikke ut, fordi det
  ville kreve gjetting på navn.
- Med kortet valgt er tog- og båtstedene fylte, litt større prikker i kartet.

### Lengst du kommer (v1.218.294, forslag 1)

Hvert kort sier hvor langt retningen når: «helt til Lillehammer stasjon ·
142 km». Det er det fjerneste stedet i retningen (`ytterpunkt` i
`src/ettBytte.js`), og avstanden er luftlinje i hele km.
- Eksempelstedene under er de *neste*. Ytterpunktet gjentas ikke, og «og N
  steder til» regner det med.
- Med kortet valgt får ytterpunktet en egen prikk og navnelapp i kartet, også
  når det ligger utenfor rammen.

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
  nettleseren). Ett bytte rydder sine egne.
- **Hvert knutepunkt har sitt eget navn ved boblen** (v1.218.293). Det står
  helst under boblen (`plasserNavn`). Største boble plasseres først. Krasjer
  navnet med et navn som alt står, eller med en annen boble, prøves neste plass
  i `NAVN_PLASSER`: en linje ned (høyst tre linjer), så til høyre, så til
  venstre. Er alt opptatt, vises navnet likevel rett under. Med et kort valgt
  står de andre navnene dempet. Rammen har plass til navnene under boblene.

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
Knutepunktet med flest retninger bar den. Erstattet i v1.218.293 av ett navn
per boble, se «Knutepunktene som bobler». Etikettene
regnes ut ved innrammingen, ikke på nytt når du zoomer.

**Tilbakerulling:** sett `ETT_BYTTE = false` i
`src/views/ettBytteVisning.js`. Alternativt fjerner du de to modulene,
`src/style/ettBytte.css` og de seks linjene merket «ETT BYTTE (eksperiment)» i
`src/views/auto.js` (fem for lista, én for kartet). Testen
`tests/ettBytte.test.js` binder at det er nøyaktig seks slike linjer.

## Hvor langt: nært · regionalt · nasjonalt (v1.218.308)

Bestilt: «Hvordan kan vi legge kategoriene lokalt, regionalt og nasjonalt
utenpå de eksisterende kategoriene?» Valgt: en egen rad «hvor langt» under
kategoriknappene, og grensen satt etter kommune og fylke.

**Regelen** (`rekkeviddeFor`, `src/rekkevidde.js`), fra stedet du står:
- **nært:** samme kommune, eller under 15 km. Avstanden står i for
  «nabokommune», fordi appen ikke vet hvilke kommuner som grenser til
  hverandre. Ski er 14 km fra Mortensrud;
- **regionalt:** samme fylke, eller under 120 km;
- **nasjonalt:** annet fylke og minst 120 km unna, også utlandet.

Fylket alene gjorde Drammen og Moss nasjonale fra Oslo. Plangrunnlaget §3.2
kaller dem regionale, og testen viste avviket. Derfor kom 120 km-grensen til
(`SCOPE_GRENSER_M`). Den gjør et eget unntak for Oslo og Akershus overflødig.
Følgen er at Hamar og Brumunddal (115 km) blir regionale fra Mortensrud, og
Lillehammer (142 km) nasjonal.

**Hvor den gjelder:** for «alle», målområdene og «ett bytte». Den gjelder ikke
for reiseoppgavene «mot sentrum» og «hjemover».
- **ett bytte:** stedene filtreres før kortene bygges.
- **alle og mot X:** en avgang regnes etter endestoppet sitt, som er siste
  kall på turen.

Knappene viser antallet. En knapp med 0 er dempet. Er alt filtrert bort, sier
lista det: «ingen avganger herfra går nasjonalt nå».

**Kildene:** kommune og fylke kommer fra Enturs geocoder (`src/api/kommuner.js`,
`locality` og `county`). Mangler de, avgjøres rekkevidden etter luftlinje, og
raden sier «N anslått etter avstand».

Valget huskes i `t.rekkevidde`. Et nytt trykk på samme knapp slår det av.
