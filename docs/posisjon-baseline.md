# Posisjonsforståelse — baseline (#809 steg 1, v1.218.329)

Målestokken for senere steg: **hva stoppvalget gjør i dag**, pinnet av `tests/posisjonBaseline.test.js`
med forløp fra `tests/fixtures/posisjon/baseline.js`. Steg 1 endrer ingen produksjonslogikk, UI eller rangering.

## Hva som er målt — og ikke
- **Målt (rent, uten nett):** `rankStops` (topp fem med avstand, retning og bånd), `pickStop` (valget når Stenbråten er valgt og ikke festet), `approach`/`closingRate`, `ombord()` (`src/api/ombord.js`).
- **Ikke målt (krever Valhalla/Entur):** gangtid og reiseforslag. Rangeringen bruker i dag bare luftlinje (`distM`), retning og bruk.
- **Forløpene er konstruert**, ikke innspilt GPS (sandkassen har ingen ekte GPS; samme begrensning som #395). Rett linje østover langs 59,9° N, fem stopp på linja, faste tidsstempler. Ekte opptak kan legges til fra reiseloggen.

## Forløp og dagens utfall (stopp: Granebakken −250 m · Stenbråten 0 · Maikollen 300 · Olasrudveien 600 · Mortensrud 900)
| forløp | førstevalg i dag | `pickStop` fra Stenbråten | `ombord()` |
|---|---|---|---|
| står stille ved stopp | Stenbråten (20 m, bånd 0) | beholdt | vet ikke |
| går mot Granebakken (110 m) | Granebakken (mot, bånd 1) | byttet til Granebakken | vet ikke |
| går bort fra Stenbråten, 82 m | Stenbråten (**fra**, bånd 0) | beholdt | vet ikke |
| går bort fra Stenbråten, 180 m | Maikollen (mot) | byttet til Maikollen | vet ikke |
| buss, 10 m/s | Maikollen (0 m, bånd 0) | byttet til Maikollen | **ombord** |
| T-bane, 18 m/s | Olasrudveien (60 m, bånd 0) | byttet til Olasrudveien | **ombord** |
| GPS-hopp (2 km, 300 m nøyaktighet) | Stenbråten, lik «står stille» | beholdt | vet ikke |

Fullstendig topp fem per forløp står i `FORVENTET` i testen.

## Svake punkter i dag (dokumentert, ikke rettet)
- **S1 — ombord ignoreres.** I buss/T-bane får stopp du passerer «du er ved»-bånd 0 og valget byttes. `ombord()` kan alt si «ombord»; rangeringen bruker det ikke.
- **S2 — bånd 0 gir aldri etter.** Går du bort fra et stopp innenfor 100 m (`CLOSE_M`), står det fortsatt først; først ved 180 m tar stoppet foran over.
- **S3 — ingen gangtid/reise i rangeringen.** Bare luftlinje, retning og bruk.
- Robust i dag: GPS-hopp midt i sporet påvirker ikke utfallet (endepunktene avgjør) — men det er en egenskap ved konstruert spor, ikke bevist for ekte støy.

## Målekriterier senere steg skal sammenligne mot (fra #809)
Førstevalg (mer relevant stopp?) · topp tre (flere relevante med?) · gangtid (mer realistisk?) · retning (unngår stopp du går bort fra?) · stabilitet (hvor ofte endres førstevalget?) · usikkerhet (hvor ofte avstår modellen?).

## Mutasjonskontroll (steg 1)
`CLOSE_M` 100→50, `PICK_MARGIN_M` 40→4000 og `STILL_MS` 0,4→0 feller hver sin del av baselinen (4, 1 og 2 tester).

## Hypoteser for senere evaluering (fra gjennomgangen etter steg 1) — IKKE krav
| hypotese | hva en senere endring skal dokumentere |
|---|---|
| Ombord-status bør påvirke holdeplassrangeringen | at passerende holdeplasser ikke behandles som om brukeren står ved dem |
| Bevegelsesretning bør påvirke rangeringen | at stopp brukeren går bort fra mister relevans tidligere |
| Reisemuligheter bør påvirke rangeringen | at nyttige avganger og realistisk gangtid kan veie tyngre enn luftlinje (nærmeste holdeplass er ikke gitt best) |

## To varsler
1. **Syntetiske forløp er ikke GPS-sannhet.** De dokumenterer deterministisk logikk, ikke støy, varierende målefrekvens, tunneler eller stillestående busser. Skillet mot senere opptak fra reelle reiser beholdes.
2. **Baseline-forventningene er referanse, ikke produktkrav.** De beskriver hva appen gjør nå, også svakhetene S1–S3. Når rangeringen forbedres, skal de gamle forventningene ikke tvinge oss til å bevare feil oppførsel: baseline-testene beholdes som referanse, og ønsket oppførsel får egne tester ved siden av.
