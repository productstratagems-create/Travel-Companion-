# Spisesteder med smilefjes (v1.218.328)

Ny kategori «Mat og drikke» i «ett bytte unna», fra Mattilsynets tilsynsdata
(`https://smilefjes.mattilsynet.no/api/tilsyn.csv`).

## Slik er det bygget
- `scripts/bygg-smilefjes.mjs` laster ned CSV-en, tar **siste tilsyn per spisested**,
  geokoder adresser (Kartverkets åpne adresse-API, cache i `data/smilefjes-geokode.json`)
  og skriver 0,1°-ruter til `public/data/smilefjes/{rute}.json` + `indeks.json`.
- `.github/workflows/smilefjes.yml` kjører det ukentlig og åpner en PR med datasettet (aldri direkte til main).
- Appen (`hentSmilefjes`, `src/api/opplevelserKilder.js`) henter bare rutene rundt stoppet.
  Mangler rutene: status `smilefjes: mangler` (datasettet er ikke bygget, eller ingen spisesteder der).
- Rene funksjoner i `src/api/smilefjesData.js`; tester i `tests/smilefjes.test.js`.

## Reglene
- Spisesteder er **trinn 5** i `trinnFor`: de løfter aldri foran en opplevelse, og vises bare når
  det er alt som finnes — eller brukeren har slått av de andre kategoriene.
- Smilefjeset står som faktum med dato («smilefjes: glad · tilsyn 12.03.2025 · Mattilsynet»), aldri som «beste».
- Kategorien kan slås av i «vis opplevelser» (v1.218.326).

## IKKE verifisert (sandkassen når ikke smilefjes.mattilsynet.no)
- Kolonnenavn (parseren leter etter flere navn og **kaster** hvis navn/dato/karakter mangler).
- Om CSV-en har koordinater (ellers geokodes; adresser uten treff telles som `utenPosisjon`).
- **Karakterskala:** `KARAKTER_ORD` (0–1 glad, 2 strek, 3 sur) er en justerbar HYPOTESE.
- Lisens og kreditering (NLOD forventes; «Mattilsynet» står i kilde-linja inntil det er bekreftet).
- Fiksturen `tests/fixtures/smilefjes/tilsyn-konstruert.csv` er konstruert, ikke et ekte utsnitt.
  Første Action-kjøring er proben; bytt fiksturen med et ekte utsnitt og rett hypotesene.
