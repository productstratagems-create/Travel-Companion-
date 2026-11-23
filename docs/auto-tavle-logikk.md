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
- **Rekk den lenger ned** (v1.218.185): en avgang du ikke rekker her, men
  rekker på et senere stopp på samme tur, flyttes opp med det stoppets tid
  og gangtid.
- **Rekkefølge**: etter når du må gå (avgang − gange) — «gå om N» /
  «GÅ NÅ». Stopp bak deg sist.
- **Reiser med bytte** (`kombiRader`): for «mot sentrum» og målområdene ett
  reisesøk per stopp og retning (gyldig `KOMBI_GYLDIG_MS = 3 min`, innenfor
  et hentebudsjett). Med bytte vises de som er framme før beste direkte,
  eller er eneste vei. Flettet inn etter «gå om».
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
