# Produktretning

Hva appen prøver å være, hva som allerede finnes, og hva som står igjen.

Bygget på en ekstern vurdering av skjermbildene, revidert mot kildekoden.
**Revisjonen er det viktigste i dokumentet**: seks av vurderingens sju
prioriteringer var allerede bygget, og en strategi som ber om noe som finnes
sender oss til å bygge det to ganger.

---

## Posisjonen

> Ikke det beste geografiske kartet. Det beste kartet for å **forstå og
> gjennomføre** en kollektivreise.

Fra å vise hvor kollektivtransporten går, til å hjelpe mennesker med å
forstå og gjennomføre reisen sin.

Det er en posisjon Google Maps ikke konkurrerer om, og den gir føringer for
kartdesign, informasjonsarkitektur og hva som er verdt å bygge.

---

## Proven · Better · New, med status

### Proven — beholdes uten innovasjonsbudsjett

Mørkt kart med geografi, zoom, posisjonsmarkør, rute tegnet på kartet,
holdeplasser og linjer, fargekoder per transportmiddel, avgangs- og
ankomsttider, plattform. Dette er konvensjoner lesere forventer. Å finne dem
opp på nytt er sløsing.

### Better — nesten alt er bygget

| vurderingens prioritet | status |
|---|---|
| kart og liste som koblede visninger | **delvis** — koblet på LINJE (`_lineOn` leses av kart, stripe og liste), ikke på enkeltavgang. Stripe→rad finnes (`_bindStrip` blinker og ruller). Rad→kart finnes ikke; raden navigerer bort. |
| kartet prioriterer etter reisefase | **finnes** — tre skjermer, tre kartoppgaver. Men fasen har ikke noe navn. |
| appen forstår om en avgang kan nås | **finnes** — `reachCls` har hatt en `missed`-bøtte hele tiden, og `canCatch`/`catchable` filtrerer på den |
| bytter og gangetapper | **finnes** — `drawLeg({dim})` demper etapper etter den du sitter på, `js-done` fyller skinna, `legStatus` gir `done`/`active`/`future` |
| handlingsorientert navigasjon | **finnes** — `alightEyebrow`: «Gå av nå», «Bytt her», «Av ved neste stopp» |
| dynamisk kart gjennom reisens tilstand | **finnes** — og `trainPosition.js` har til og med en kildekaskade: din GPS → sanntid → rutetid |
| prediktiv reiseassistent | **finnes** — `smart.js` (vanebøtter per ukedag), `returnTrip.js` (hjemreise), `usual.js` («din vanlige 08:12») |

### New — og her tok vurderingen feil om hva som er nytt

Vurderingen foreslo en prediktiv assistent. Den finnes.

Det som faktisk er særpreget, er noe et skjermbilde ikke kan vise: appen har
**tolv navngitte domsvokabularer**, og nesten alle skiller **målt** fra
**anslag** fra **vet ikke**.

```
reachCls      r-far · r-ok · r-soon · r-now · missed
belegg        målt · anslag · vet-ikke
posState      ok · leter · unøyaktig · framskrevet · gammel · borte · …
liveness      fersk · venter · gammel · tapt · borte · frakoblet
seksjon       ikke-spurt · henter · feilet · tomt · ok
trinnfri      trinnfri · ikke-trinnfri · vet-ikke
stripeKilde   målt · rutetid
legStatus · planStatus · usualState · tripTime · alightEyebrow
```

På skjermen blir det til setninger ingen annen reiseapp sier:

- «anslått posisjon (±83 m)»
- «neste avganger · etter rutetid»
- «ca. travelt» mot «travelt»
- «uten trasé, tegnet som rette strek»
- «posisjonen er unøyaktig (±120 m)»

**Det er ikke en funksjon. Det er en holdning**, bygget over sytti
utgivelser — og de store aktørene kan strukturelt ikke kopiere den, fordi å
si «jeg vet ikke» undergraver et produkt som selger sikkerhet.

Retningen for New er derfor ikke mer prediksjon. Det er å gjøre
**tillitsgraden** til appens signatur: brukeren skal alltid vite hvor mye
hun kan stole på tallet hun ser.

---

## Fasen, med ett navn

Vurderingen foreslo fem tilstander. `AGENTS.md` har tre. Appen har tolv
vokabularer og **ingen** som sier hvilken fase leseren er i — den er
implisitt i hvilken skjerm som er oppe.

To modeller for én idé er kodebasens signaturfeil, hevet ett nivå.

| fase | skjerm | hva som må være klokkeklart |
|---|---|---|
| før valg | tavla, auto-reise | hvor er jeg, hvor er stoppet, hvordan kommer jeg dit, hvilke avganger gjelder meg |
| valgt avgang | avgangsdetaljer | når går den, fra hvilken plattform, når og hvor ankommer jeg |
| underveis | underveis | hvor er jeg nå, hvilket stopp er neste, når går jeg av |

Vurderingens fem er en **underinndeling av «underveis»** — på vei til
holdeplassen, om bord, bytte, ankomst. De er ikke et konkurrerende sett, og
skal ikke bli det. Trenger vi dem, utvides raden; vi lager ikke en andre
tabell.

**Konsekvens, og den er konkret:** tavla og auto-reise er samme fase, og
skal svare likt på samme spørsmål. De gjorde det ikke. Se v1.189.0.

---

## Hva som står igjen

Fire ting, ikke sju — men de hører ikke til samme spørsmål, og rekkefølgen
under er satt av PULL, ikke av hvor interessante de er å bygge.

1. **Tillitsgraden som signatur.** Vokabularene finnes; det som mangler er å
   behandle dem som produktet framfor som rydding. *Den eneste av de fire
   som går gjennom PULL.*
2. **Rad → kart.** Trykk på en avgang navigerer bort. Den kunne i stedet
   framheve linja, holdeplassen og ruta på tavlekartet — koblingen finnes
   alt på linjenivå (`_lineOn`), ikke på avgangsnivå. *Faller på siste L:
   Google Maps gjør dette, og gjør det godt.*
3. **Ett navngitt fasebegrep.** I dag er fasen `show('v-…')`. Tabellen over
   og skjermbyttene er to steder som skriver ned samme faktum. *Vedlikehold,
   ikke etterspørsel — begrunnes av «én navngitt definisjon», ikke av PULL.*
4. **En rest:** `track.js:928` bruker `#60a5fa` — fargen «deg» ble flyttet
   vekk fra nettopp fordi den kolliderte med destinasjonsnålene.
   *Korrekthet. Trenger ingen ramme.*

---

## PULL — er det noen som drar?

Rob Snyders rammeverk fra *Physics of Startups*, for å finne blokkert
etterspørsel framfor å pitche til folk som bare er høflige:

| | |
|---|---|
| **P**rioritert prosjekt | kunden jobber alt mot et mål med høy prioritet |
| **U**unngåelig situasjon | det finnes en frist, et press, en tvungen endring |
| **L**ooked at alternatives | hun har alt prøvd det som finnes |
| **L**imitations are severe | det hun prøvde er utilstrekkelig |

### Oversettelsen må være eksplisitt

PULL er laget for å finne **kunder i kjøpssituasjon**. Denne appen har én
bruker og ingen kjøpere, så uten en oversettelse diskriminerer rammeverket
ikke mellom noe som helst.

Oversettelsen: **kunden er den reisende på perrongen, og «kjøpet» er å åpne
denne appen framfor Ruter eller Google Maps.**

### P og U er oppfylt for hele appen — L-ene er det som skiller

Å rekke jobben er et høyt prioritert, daglig gjentatt prosjekt. En avgang som
går 08:48 er en absolutt frist. Det gjelder alt appen gjør, og skiller derfor
ingenting.

| | P | U | L · vurdert | L · alvorlig |
|---|---|---|---|---|
| tillitsgraden | ja | ja | ja, daglig | **ja** |
| rad → kart | ja | middels | ja, daglig | **nei** |
| fasebegrepet | — | — | — | — |
| `#60a5fa` | — | — | — | — |

**Rad → kart faller på siste L.** Google Maps gjør nettopp dette, og gjør det
godt: trykk en rute, se den på kartet. Alternativet er altså ikke
utilstrekkelig — det er tilstrekkelig. PULL sier da: ikke invester her.

**Tillitsgraden går hele veien.** Ruter og Google viser et tall uten opphav. I
en tunnel teller Google videre med full selvtillit på rutetid og sier det
ikke. Du handler på tallet — går ut døra, lar være å løpe — og oppdager først
etterpå at det var gjettet. Alvorlig begrensning, uunngåelig situasjon, og
**ingen av alternativene kan adressere den**: å si «jeg vet ikke»
undergraver et produkt som selger sikkerhet.

**De to siste er ikke etterspørselsspørsmål.** Å måle dem mot PULL er å bruke
feil instrument. De begrunnes av arbeidsmåten i AGENTS.md, ikke av et marked.

### Hvordan de to rammeverkene henger sammen

De svarer på ulike spørsmål, og det ene skal **portvokte** det andre:

```
PULL               er det noen som drar i dette?        → om vi bygger
Proven·Better·New  hva slags arbeid er dette?           → hvor mye det koster
```

Et Better-tiltak uten pull er polering. Et New-tiltak med pull er en
posisjon. Rekkefølgen i lista over er satt av den første kolonnen.

### Og innvendingen mot dokumentet selv

Rammeverkets poeng er å slutte å pitche til folk som bare er høflige.
Påstanden over om at Ruter og Google er «alvorlig begrenset» er **ikke
testet** — den er hentet fra hukommelsen, og sandkassen kan ikke sjekke den.

PULL foreskriver derfor én konkret handling før mer bygging: **finn fem
mennesker som har mistet et tog fordi en app løy selvsikkert**, og hør om de
kjenner seg igjen. Gjør de ikke det, er «tillitsgrad» forfatterens interesse
og ikke leserens etterspørsel — og da er dette dokumentet nettopp den kalde
pitchen det advarer mot.

---

## Forbeholdet

Vurderingen sier det om seg selv, og det gjelder dette dokumentet også:

> Dette er en vurdering av skjermbildene og den synlige funksjonaliteten,
> ikke en brukertest. Jeg ville validert særlig handlingsorientert
> navigasjon og den sammenkoblede kart-/avgangsvisningen med faktiske
> reisende før større investeringer.

Og én ting til, som revisjonen la til: **vurderingen er i seg selv en
måling.** En oppmerksom leser studerte skjermbildene og konkluderte med at
appen ikke forstår om en avgang kan nås — mens den har visst det i sytti
utgivelser. Det var ikke funksjonen som manglet. Det var ordene.
