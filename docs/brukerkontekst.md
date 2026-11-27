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

**Metode:** rens sporet (tid, duplikater, `acc` ≤ 50 m) → robust forflytning D (median over par tidlig→sen halvdel) → støy σ (rms av `acc`, gulv 5 m) → z = D / σD → moving når z ≥ 4,5 og fart ≥ 0,5 m/s; stationary når z ≤ 2 **og** gange kan utelukkes; i dødsonen i mellom videreføres en **bekreftet** forrige tilstand høyst `HOLD_MS` (10 s, hypotese) etter siste positive evidens (`bekreftetVed`, fornyes ikke av å holde) — deretter `unknown`. «Urolig» spor (median-steg > 3σ og lav rettlinjethet) og forflytning mot Kalman ≈ 0 ⇒ `unknown`.

**`confidence` er IKKE en sannsynlighet:** `min(dataFaktor, margin)` avrundet til 0,05; `dataFaktor = min(1, n/8)·min(1, spenn/20 s)`, `margin` = avstand fra beslutningsterskelen (0 ved terskel, 1 ved 2×). `unknown` ⇒ 0.

### KORRIGERT i v1.218.332 (steg 3a): hysterese uten utløp var en feil
v1.218.331 holdt forrige tilstand i dødsonen **uten tidsgrense**. En sjelden falsk «moving» (~0,2 % per vindu) **låste seg** fordi «stationary» ikke kunne bevises igjen ved sparsom/støyete data: med hysterese var falsk «moving» 4–32 % mot ~0,1–0,25 % per vindu. Min påstand «falsk moving < 1 %» (steg 3) var feil — kalibreringen brukte en svak LCG og få seeds.
Rettelse: `bekreftetVed` + `HOLD_MS`; kalibrering på nytt med **mulberry32 og 30 seeds**, målt **både per vindu og over lange sekvenser med hysterese**, og **varighet** av feilaktige tilstander. `Z_OPP` 3,5 → 4,5 og `HOLD_MS` 10 s (20 s ga 2,4 % falsk moving ved σ8/takt 1 s/30 s vindu; 10 s + Z 4,5 ga ~0 %). Begge er hypoteser kalibrert mot konstruert støy.

### Funn fra simuleringen (seedet, KONSTRUERT støy — ikke ekte GPS)
- **Dagens `posTrail` (12 fikser ≈ 11 s ved 1 Hz) er for kort**: ikke et riktig grunnlag for stillstand (se analysen i #809). `pushFix` håndhever ikke minimumsavstand i tid (`TRAIL_MIN_MS` gjelder bare `closingRate`), så vinduet varierer med målefrekvensen. `trail.js` sier «about a minute at one fix a second», men 12 fikser ved 1 Hz er 12 s. Beslutning om eget bevegelsesspor (steg 3b) er utsatt.
- 30 seeds, vindu 30/60 s, σ 3–20 m, takt 1–5 s: falsk «moving» < 1 % per vindu **og** med hysterese; gange 1,0–1,6 m/s gir «moving» ≥ 90 % (σ ≤ 10, takt ≤ 3, vindu 60 s); hver falsk episode varer høyst 2·`HOLD_MS`.
- **Etter at bevegelsen opphører** varer «moving» typisk ~43 s og høyst ~44–52 s (vinduet på 60 s må først renses for bevegelsen) — det er vindulengden, ikke hysteresen, som styrer.
- Stillstand gjenkjennes først ved ~45–60 s med tett takt (≈1 s) og σ ≲ 8 m; ved takt 5 s aldri (for få punkter) — `unknown` er da det ærlige svaret.
- **Kalman-farten (`fartNå`) er for urolig til å bevise ro** (over 1 m/s for en som står stille i over halvparten av tiden): brukes bare som veto mot «moving» når den er nær null.
- `SIGMA_GULV_M` er i praksis overlappet av «urolig»-vakten og V_OPP-kravet (mutanten felles ikke av en egen test); gulvet beholdes som forsvar.

**Ikke validert:** målefrekvens, støyfordeling i bykløfter/innendørs, strupet bakgrunnsmodus, tunneler, stillestående busser. Alle terskler (`Z_OPP`, `Z_NED`, `V_OPP`, `HOLD_MS`, `MIN_FIKSER`, `MIN_SPENN_MS`, `BEVEGELSE_MAKS_ACC_M`, …) er **hypoteser** kalibrert mot simuleringen. Faktisk GPS-fikstakt er ikke målt (egen diagnostikk via reiseloggen kommer før historikkens lengde låses).
