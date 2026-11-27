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
