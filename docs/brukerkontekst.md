# Brukerkontekst — `src/userContext.js` (#809 steg 2, v1.218.330)

**Datagrunnlag, ikke funksjonalitet.** Én struktur for «hva appen vet om brukeren nå», bygget av signaler som alt finnes.
Ingen konsument ennå: ingen rangering, anbefaling eller visning leser den (testet i `tests/userContext.test.js`).

```
{ position:     { available, lat, lon, accuracyM, observedAt, ageMs, kind, usable },
  movement:     { state: 'unknown', fartMS, confidence: null },     // steg 3 gir tilstanden; her bare observert fart
  transit:      { state: 'onboard' | 'uncertain' | 'unknown', confidence: null },
  stopRelation: { state: 'unknown', stopId: null },                 // steg 5
  updatedAt, expiresAt }
```

## Regler
- **Ren og kortlivet:** ingen `state.js`/`geo.js`/DOM/nett (arkitekturvakt i `tests/arkitektur.test.js`: når bare `position.js` og `haversine.js`). Lagres aldri.
- **`unknown` er ikke «nei».** Ombord-svaret `vet-ikke` blir `unknown`, aldri «ikke ombord». `ombord` → `onboard`, `ombord-tvil` → `uncertain`.
- **Posisjonskvaliteter holdes adskilt:** `position.kind` er `posState().kind` uendret (avslatt, utilgjengelig, tidsavbrudd, leter, ikke-spurt, ukjent-alder, borte, gammel, unoyaktig …). `available` følger `posState().usable` og utløpet.
- **Utløp:** `expiresAt = observedAt + KONTEKST_UTLØP_MS`; på utløpet (`nå === expiresAt`) er konteksten utløpt. Utløpt eller ubrukelig posisjon gir en **tom kontekst** (alt `unknown`, årsaken i `position.kind`).
- **`KONTEKST_UTLØP_MS` = 60 s er en FORELØPIG, UMÅLT grense** (samme tall som `POS_STALE_MS`) — ikke empirisk validert (#395). Grenseverdiene (−1 ms, på, +1 ms) er testet.
- **Funn:** `posState` regner både `gammel` (60–300 s) og `unoyaktig` som `usable`; utløpsgrensen her er strengere (60 s).

## Ikke med i steg 2
Bevegelsesinferens (steg 3), gange/annen bevegelse (steg 4), forholdet til stopp (steg 5), skyggemodus (6), rangering (7).

## Steg 3 (v1.218.331): står stille / i bevegelse
`src/bevegelse.js` (`inferBevegelse`) gir `movement.state` = `stationary` | `moving` | `unknown`; `byggUserContext` tar valgfritt `spor` og `forrigeBevegelse`.
`moving` betyr bare «grunnlag for bevegelse», ikke «går». `unknown` (for få/gamle/dårlige/motstridende data) er et fullgodt svar.
Fortsatt **ingen konsument** (ikke `auto.js`, `geo.js`, `pickStop` eller rangering), ingen lagring; hysteresen får forrige resultat inn som parameter.

`movement` = `{ state, fartMS (observert Kalman, uendret), forflytningMps (observert forflytningsfart over vinduet), confidence, windowSeconds, evidenceCount, reason }`.

**Metode:** rens sporet (tid, duplikater, `acc` ≤ 50 m) → robust forflytning D (median over par tidlig→sen halvdel) → støy σ (rms av `acc`, gulv 5 m) → z = D / σD → moving når z ≥ 3,5 og fart ≥ 0,5 m/s; stationary når z ≤ 2 **og** gange kan utelukkes; dødsone i mellom beholder forrige (hysterese). «Urolig» spor (median-steg > 3σ og lav rettlinjethet) og forflytning mot Kalman ≈ 0 ⇒ `unknown`.

**`confidence` er IKKE en sannsynlighet:** `min(dataFaktor, margin)` avrundet til 0,05; `dataFaktor = min(1, n/8)·min(1, spenn/20 s)`, `margin` = avstand fra beslutningsterskelen (0 ved terskel, 1 ved 2×). `unknown` ⇒ 0.

### Funn fra simuleringen (seedet, KONSTRUERT støy — ikke ekte GPS)
- **Dagens `posTrail` (12 fikser ≈ 11 s ved 1 Hz) er for kort**: gir `unknown` nesten alltid. `pushFix` håndhever ikke minimumsavstand i tid (`TRAIL_MIN_MS` gjelder bare `closingRate`), så vinduet varierer med målefrekvensen.
- Med **60 s vindu**: falsk «moving» < 1 % (σ 3–20 m, takt 1–3 s); gange 1,0–1,6 m/s gir «moving» ≥ 90 % (σ ≤ 10 m); stillstand gjenkjennes > 90 % ved σ ≤ 8 m, men ikke ved σ ≈ 20 m (da `unknown` — ikke feil svar).
- **Kalman-farten (`fartNå`) er for urolig til å bevise ro**: den lå over 1 m/s for en som sto stille i over halvparten av tiden. Den brukes derfor bare som veto mot «moving» når den er nær null.
- En senere konsument må mate funksjonen et lengre spor enn dagens `posTrail` (egen beslutning; ikke i steg 3).
- `SIGMA_GULV_M` er i praksis overlappet av «urolig»-vakten og V_OPP-kravet (mutanten ble ikke felt av en egen test); gulvet beholdes som forsvar, og dette er sagt høyt.

**Ikke validert:** målefrekvens, støyfordeling i bykløfter/innendørs, strupet bakgrunnsmodus, tunneler, stillestående busser. Alle terskler (`Z_OPP`, `Z_NED`, `V_OPP`, `MIN_FIKSER`, `MIN_SPENN_MS`, `BEVEGELSE_MAKS_ACC_M`, …) er **hypoteser** kalibrert mot simuleringen.
