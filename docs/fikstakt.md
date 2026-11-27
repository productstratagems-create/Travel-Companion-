# GPS-fikstakt — diagnostisk måling (#809, v1.218.333)

**Dette er en måling, ikke en produktendring.** Ingen rangering, anbefaling, visning eller `bevegelse.js` leser den. Den skal gi data til en senere, separat beslutning om et eget bevegelsesspor (steg 3b).

## Spørsmålet
Hvor ofte leverer telefonen faktisk GPS-oppdateringer til appen? Dagens `posTrail` holder 12 fikser (≈ 11 s ved 1 Hz); `bevegelse.js` trenger et spor på ca. 45–60 s med tett takt for å gjenkjenne stillstand. Måler: dekker 12 fikser 10/20/30/60 s, og hvor mange fikser kommer siste 60 s?

## Hva som lagres (og ikke)
`t.fikstakt`: **tellere per døgn og per intervallbøtte** (histogrammer), 7 døgn, bak samtykket «appen husker» (av som standard). Per døgn: dato (ikke klokkeslett), antall fikser, histogram over leveringsintervall, enhetens fikstidsstempel-intervall, alder ved levering, tiden de siste 12 fiksene spenner og antall fikser siste 60 s, tellere (gjentatt/bakover/fremtidig tidsstempel, intervall over 5/10/30 s, opphold over 120 s), sum/min/maks.
**Ikke lagret:** breddegrad/lengdegrad, posisjonsobjekt, fart, kurs, høyde, stopp, reisemål, ruter, eksakte tidspunkt, rekkefølge (ingen tidsrekke). Hvitelista er `FIKSTAKT_FELT`; alt som lagres vises som en rad i Innstillinger → hva appen husker (bundet av test).

## Slik fungerer det
- `registrerFiks(pos, nå)` (`src/api/fikstakt.js`) kalles fra `_handleFix` i `geo.js` — **ett kall i try/catch rett etter destruktureringen**, uten å lese noe tilbake. Den leser bare `pos.timestamp`.
- Aggregatene ligger i minnet. **Ingen synkron lagring i GPS-veien:** skriving skjer 60 s etter første endring, og når siden skjules (`visibilitychange`/`pagehide`). Lagringsfeil svelges (data kan gå tapt).
- **Bakgrunn:** appen stopper GPS-watchen i bakgrunnen. Skjult/synlig nullstiller utgangspunktet; et gap > 120 s teller som `avbrudd` og blir aldri et intervall. **Målingen gjelder forgrunnsbruk.**
- Syntetiske fikser (testposisjon) sperres. Tilbaketrekking av samtykket stopper målingen og sletter dataene; «slett alt appen husker» og «slett måling» gjør det samme. Slettes uansett etter 7 dager.

## Uthenting
Innstillinger → hva appen husker → «GPS-takt (måling)» → **kopier måling** (JSON via utklippstavlen) → lim inn. JSON har median/P90/P95 (omtrentlige, bøtteoppløsning), snitt/min/maks (eksakte), tall over 5/10/30 s, andel av 12-fikser-spenn ≥ 10/20/30/60 s, andel av 60 s-vinduer med ≥ 10/20/30 fikser, alder ved levering, histogrammer og merknader. Ingen posisjonsdata.

## Begrensninger (eksplisitte)
- **`pos.timestamp` er ikke validert på faktiske iOS- og Android-enheter.** Semantikken er nettleser-/enhetsspesifikk; modulen lagrer fordelinger, ikke tolkninger.
- **Bare forgrunn.** Takt under skjermlås/bakgrunn måles ikke.
- Bøttekantene (0,25–120 s) er hypoteser; justeres hvis første data viser at de er for grove.
- Målingen krever at «appen husker» er slått på.

## Atferdsnøytralitet (bevist i `tests/fikstaktNoytralitet.test.js`)
Samme lange fikssekvens (stille, gange, støy, hopp, ujevn takt, gjentatt/bakover tidsstempel) gjennom `geo.js` med målingen av, på og kastende gir dypt like `posTrail`, `posTrailLang`, `homeLL`, `posAt`, `posAcc`, `posRejAt`, hopp, nærmeste stopp, geokodekall, `fartNå` og `framskrevetPos`; identiske lagringskall under callbackene; `watchPosition`-alternativene er uendret. Overhead er noen få additions og sammenligninger per fiks — ikke null.

## Beslutning etter målingen
Når det finnes data fra faktiske telefoner, vurderes: faktisk intervallfordeling, variasjon mellom enheter, hvor ofte 12 fikser dekker 10/20/30/60 s, og om `bevegelse.js` får nok observasjoner i sitt 60 s vindu. Først da avgjøres steg 3b. Målingen utløser ingen endring av `posTrail`, `geo.js`-logikk, Auto-tavla eller rangering.
