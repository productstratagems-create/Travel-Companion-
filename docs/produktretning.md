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

Fire ting, ikke sju:

1. **Rad → kart.** Trykk på en avgang navigerer bort. Den kunne i stedet
   framheve linja, holdeplassen og ruta på tavlekartet — koblingen finnes
   alt på linjenivå (`_lineOn`), ikke på avgangsnivå.
2. **Ett navngitt fasebegrep.** I dag er fasen `show('v-…')`. Tabellen over
   og skjermbyttene er to steder som skriver ned samme faktum.
3. **Tillitsgraden som signatur.** Vokabularene finnes; det som mangler er å
   behandle dem som produktet framfor som rydding.
4. **En rest:** `track.js:928` bruker `#60a5fa` — fargen «deg» ble flyttet
   vekk fra nettopp fordi den kolliderte med destinasjonsnålene.

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
