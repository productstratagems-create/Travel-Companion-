# Tracer: sammenlign to utgangspunkter (eksperiment 1) — og linjeparene

**Dato:** 2026-11-24. **Status:** undersøkelse. Ingen endring i `src/`.

**Skript (i repoet):**
- `scratchpad/tracerLinjepar.mjs`: del A, mot opptakene;
- `scratchpad/tracerSammenlign.mjs`: del B, mot ekte Entur, dagtid (24.11.
  kl. 12), to kjøringer per par.

**Hypotese:** et lite skifte i utgangspunkt gir vesentlig flere
reisemuligheter.

**Bevis som kreves:** konkrete, distinkte muligheter som finnes fra det ene
stedet, men ikke det andre.

## Kort svar

1. **Hypotesen holder ikke i den formen.** Forskjellene i det utforskeren
   oppdager, er for det meste et resultat av *utvalget* (knutepunkt,
   søkevindu), ikke av nettverket. **21 av 24 etterprøvde «bare fra
   A»-mål nås også fra B**, 20 av dem med samme ankomst.
2. **Det som faktisk skiller utgangspunktene, er hvor *enkelt* og hvor
   *fort*, ikke *om*.** Eksempel: fra Oslo S er du på Ål etter 201 min,
   uten bytte. Fra Helsfyr bruker du 318 min, med ett bytte. Fra Oslo S nås
   Myrdal direkte, og fra Helsfyr fant Entur ingen reise.
3. **Kortene antyder linjepar som ikke finnes.** I fasettene «linje» og
   «transport» er 18–70 % av de antydede kombinasjonene ikke observert. I
   «retning» og «knutepunkt» er det nesten ingen (0–4 %), og der er
   avvikene bare «samme linje videre».

---

## Del A — linjeparene

Kortet viser linjer inn og ut som to lister, og antyder dermed |inn| × |ut|
kombinasjoner. Det som er *observert*, er distinkte par linje inn → linje ut
blant veiene bak kortet.

| opptak | retning | knutepunkt | linje | transport |
|---|---|---|---|---|
| Mortensrud dag | 4 % | 2 % | **25 %** | **65 %** |
| Nesttun dag | 3 % | 3 % | **18 %** | **70 %** |
| Ranheim dag | 0 % | 3 % | **35 %** | **60 %** |
| Tretten dag | 0 % | 0 % | 0 % | 0 % |
| Mortensrud natt | 50 % | 50 % | 50 % | 50 % |

Tabellen viser andelen antydede kombinasjoner som ikke er observert.

**Eksempler:**
- **Kortet «T-bane 3»** (Mortensrud) viser linjene inn «74 / T-bane 3» og
  61 linjer ut. Det antyder 183 par, men 90 er observert. «74 → 100» er ikke
  et observert bytte, fordi 74 er med på kortet som et *annet* utgangspunkt
  for T-bane 3-reisene.
- **Kortet «buss»** antyder 330 par, men 94 er observert.
- **Retning og knutepunkt.** Avvikene er bare «74 → 74» og «T-bane 3 →
  T-bane 3». En linje som er både inn og ut, gir et par som ikke er et
  bytte. Natt-tallene (50 %) er utelukkende slike: «71 → 72» og «72 → 71»
  finnes, «71 → 71» gjør ikke.

**Hånd-sjekk** (Mortensrud, nordøst): 2 inn × 7 ut = 14 antydet. 13 er
observert, og det som mangler, er «76 → 76». Det stemmer med skriptet.

**Konklusjon og forslag** (ikke bygget, krever godkjenning):
- **Linjeparet bør være et førsteklasses felt.** `radAv` regner det alt ut
  (`ruter`), men kaster det etter tellingen.
- **Kortet bør vise par, ikke to lister,** i fasettene der lister villeder
  (linje og transport): «T-bane 3 → bytt til 300 (Helsfyr) · tog R14
  (Nationaltheatret) …», og «+N reiseruter» for resten.
- **Retning og knutepunkt kan beholde listene.** Der er det nesten ingen
  avvik.
- **«Sjekk denne»** må fortsatt leses som «Entur foreslår en reise via ett av
  kortets knutepunkter». Det bekrefter ikke det konkrete linjeparet.

**Rettet i v1.218.300** (`docs/auto-tavle-logikk.md`, «Linjeparene»):
- linjeparet er et felt;
- kortet viser par når listene ville villedet;
- «sjekk denne» sier «samme linjer som kortet» eller «med andre linjer».

Effekten er målt med `scratchpad/tracerLinjepar.mjs --etter`: **0 %** påståtte
og ikke observerte par i alle opptak og fasetter.

---

## Del B — to utgangspunkter

**Enheter:**
- område (retning × avstandsbånd, regnet fra *midtpunktet*, så begge måles
  i samme rutenett) og kommune: hovedmålet;
- stoppested: underlag;
- reiserute: forklaring.

**Etterprøving:** reisesøk fra **begge** utgangspunkter til de fjerneste
«bare fra A»-kommunene og til alle «bare fra A»-områdene.

### Mortensrud ↔ Hauketo stasjon (1,5 km, ca. 24 min gange)

| | kjøring 1 | kjøring 2 |
|---|---|---|
| steder A / B / felles | 1 540 / 1 390 / 1 027 | 1 536 / 1 390 / 1 032 |
| kommuner A / B / felles | 72 / 64 / 44 | **63** / 64 / 44 |
| områder felles / bare A / bare B | 31 / 2 / 3 | 30 / 1 / 4 |
| direkte / ett bytte (A) | 117 / 1 423 | |
| direkte / ett bytte (B) | 218 / 1 172 | |

**«Bare fra Mortensrud» ifølge oppdagelsen:** Malmö, København, Arlanda,
Helsingborg, via 74 → Oslo bussterminal → ekspressbuss.
**Etterprøvd:** Entur når alle fra Hauketo også, med samme ankomst og like
mange bytter (via Oslo S i stedet for Grønland).

**«Bare fra Hauketo»:** Bergen, Voss, Gol, Rakkestad og Linås, via tog L2.
**Etterprøvd:** alle nås fra Mortensrud med samme ankomst. Linås krever ett
bytte mer.

**Myrdal:** Entur fant ingen reise fra noen av dem i søkevinduet. Svaret er
**ukjent**, ikke «bare fra B».

**Vurdering:** forskjellene i oppdagelsen er **utvalg**. Mortensrud og
Hauketo når i praksis det samme. Det som skiller, er hvilket knutepunkt du
går via. Det store hoppet i kommunetallet mellom kjøringene (72 → 63) viser
at kommunetelling på oppdagede veier **ikke er et stabilt mål**.

### Helsfyr ↔ Oslo S (2,7 km)

| | kjøring 1 | kjøring 2 |
|---|---|---|
| steder A / B / felles | 1 708 / 4 474 / 1 065 | 1 717 / 4 465 / 1 065 |
| kommuner A / B / felles | 64 / 129 / 63 | 73 / 122 / 65 |
| områder felles / bare A / bare B | 32 / 0 / 5 | 34 / 0 / 3 |
| direkte A / B | 254 / 857 | |

**«Bare fra Oslo S»:** Stockholm, Arlanda, Södertälje, Arvika, Haugesund og
Ål. Etterprøvd fra Helsfyr:
- **Stockholm, Arlanda, Södertälje, Arvika:** nås, **samme ankomst**, med **ett
  bytte** i stedet for direkte (via Jernbanetorget eller Oslo
  bussterminal).
- **Ål:** nås, men **318 min mot 201 min**. Fra Helsfyr rekker du ikke det
  samme toget.
- **Myrdal:** direkte fra Oslo S. **Ingen reise funnet** fra Helsfyr.

**«Bare fra Helsfyr»:** Eidslia (Aurskog-Høland). Nås fra Oslo S med samme
ankomst og færre bytter.

**Vurdering:** Oslo S gir **flere direkte forbindelser** og i enkelte
tilfeller **tidligere ankomst**. Det er en reell og nyttig forskjell, men
den gjelder *hvordan*, ikke *hvilke steder*.

### Samlet etterprøving (kjøring 2)

| par | etterprøvd | den andre når også | ≤ 1 bytte | samme ankomst | ingen reise fra noen |
|---|---|---|---|---|---|
| Mortensrud ↔ Hauketo | 13 | 11 | 7 | 11 | 2 |
| Helsfyr ↔ Oslo S | 11 | 10 | 10 | 9 | 0 |

---

## Hva dette betyr for et «sammenlign»-verktøy

1. **Sammenlign ikke oppdagede mengder.** «Bare fra A» basert på hva
   utforskeren fant, er usant i 21 av 24 etterprøvde tilfeller. Det ville
   vært en påstand appen ikke kan stå inne for, altså det motsatte av
   tillitsgraden.
2. **Sammenlign per mål, etterprøvd.** For et sett mål, for eksempel kortets
   steder eller brukerens favoritter, gir et reisesøk fra hvert utgangspunkt
   tre ting:
   - **ankomst** (samme, eller hvor mye senere);
   - **bytter** (direkte eller ett bytte);
   - **om det finnes** i det hele tatt («ingen reise funnet» skal stå som det
     er, ikke som «umulig»).
3. **Den verdifulle forskjellen** er «fra Oslo S: direkte, fremme 15.21 ·
   fra Helsfyr: ett bytte, fremme 17.18». Det er konkret, det er
   etterprøvd, og det handler om valget brukeren står overfor.
4. **Kostnaden må med.** Reisesøket fra A inkluderer reisen til B. Derfor er
   «samme ankomst» et ærlig svar: det lønner seg ikke å gå til B. Gangtid
   som eget tall trengs ikke når søket starter fra der du står.
5. **Kall-budsjett.** Ett reisesøk per mål per utgangspunkt. 8 mål × 2
   utgangspunkter gir 16 kall. Det er greit på trykk, ikke som en
   bakgrunnsjobb.

**Omformulert hypotese for neste tracer:** *Et nærliggende utgangspunkt gir
oftere enklere eller raskere reiser til de samme målene, ikke flere mål.*
**Bevis:** andelen mål der B gir færre bytter eller tidligere ankomst, og
hvor mye.

## Avgrensninger

- **Fire utgangspunkter i Oslo, én tid** (tirsdag kl. 12). Bygd, ferge og
  natt er ikke undersøkt.
- Etterprøvingen er **utvalgt**: de fjerneste kommunene og alle
  områdeforskjellene. Den er **ikke** representativ for nære mål.
- Reisesøket er Enturs beste mønster innen tre forslag og standard søkevindu.
  «Ingen reise funnet» betyr ikke «finnes ikke».
- Gangtiden er anslått fra luftlinje. Valhalla nås ikke herfra.
- Kommune kommer fra Entur geocoder (`locality`). Utenlandske stopp gir
  grove verdier («Danmark»).
