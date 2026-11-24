# To bytter — måling (2026-11-23)

**Spørsmål:** Har vi data for hva som er innen rekkevidde med to bytter?

**Svar:** nei, ikke i appen. Nettverksutforskeren stopper ved ledd 2
(`PARAMETRE.ledd = 2`), og to bytter ble valgt bort uten måling (3.5 §8:
«gir flere stopp, ikke flere handlinger»). Denne målingen prøver den
antakelsen. **Appen er ikke endret.**

## Metode

`scratchpad/toBytterMaling.mjs`, mot ekte Entur:

1. **Ett bytte:** `utforsk()` som i dag, med ledd 1 og ledd 2.
2. **Ledd 3, bygget i skriptet:**
   - kandidatene er stedene som bare ledd 2 når;
   - utvalget følger samme marginale regel som utforskeren: flest linjer som
     verken ledd 1, ledd 2 eller en valgt knute dekker, høyst 15;
   - én aliased avgangsspørring fra de valgte knutepunktene.
3. **Mål:** ulike muligheter, ikke treff. Det betyr nye **områder** (8
   retninger × 5 avstandsbånd, `områdeFor`) og nye **himmelretninger**, ikke
   flere steder.

**Kjøretider:**
- «Kveld» er to kjøringer kl. 23.34 og 23.37. Det var det tidspunktet målingen
  ble gjort, så **dagtid er ikke målt**.
- «Natt» er Mortensrud kl. 01.30.

## Resultat

| sted | ett bytte: steder / områder / retninger | to bytter: nye steder | **nye områder** | **nye retninger** | ekstra kall |
|---|---|---|---|---|---|
| Mortensrud, kveld (×2) | 1 173 / 23 / 7 | 703 | **5** | **0** | 11 + 1 |
| Mortensrud, natt | 162 / 15 / 7 | 100 | **0** | **0** | 1 + 1 |
| Nesttun, kveld (×2) | 600 / 21 / 7 | 140 | **0** | **0** | 5 + 1 |
| Ranheim, kveld (×2) | 430 / 21 / 7 | 812 | **0** | **0** | 4 + 1 |
| Tretten, kveld | 451 / 24 / 8 | 76 | **0** | **0** | 1 + 1 |
| Tretten, kveld (2. kjøring) | 251 / 19 / 8 | 0 (ingen kandidater) | **0** | **0** | 0 |

«Ekstra kall» er linjeoppslag ved kandidatene (stopPlaces i biter à 100) pluss
én avgangsspørring.

**Ingen sted fikk en ny himmelretning.** Ett bytte når allerede 7 av 8
retninger overalt, og 8 av 8 på Tretten.

To bytter gir mange nye **steder**, 700–800 i Oslo og Trondheim. Nesten
ingen av dem lander i et **område** ett bytte ikke allerede dekker.

## De fem nye områdene på Mortensrud er ikke egentlig «to bytter»

| område | eksempel | via |
|---|---|---|
| N 50–150 km | Lillehammer stasjon | Oslo S, RE10 |
| NØ 50–150 km | Kongsvinger stasjon | Oslo S, R14 |
| S 50–150 km | Fredrikstad stasjon | Oslo S, RE20 |
| V 50–150 km | Kongsberg stasjon | Oslo S, R12 |
| NV 150+ km | Førde rutebilstasjon | Hønefoss sentrum, VY170 |

Fire av fem går via **Oslo S**. Oslo S ligger **194 m** fra Jernbanetorget,
som ledd 1 når og som allerede er et knutepunkt i ett bytte. Men Oslo S er et
eget stoppested hos Entur (NSR:StopPlace:337), så togene der blir aldri spurt
om i ett bytte.

For en reisende er dette **ett bytte med en kort gåtur**, ikke to bytter. Bare
Førde (via Hønefoss) er et reelt andre bytte.

## Konklusjon og anbefaling

1. **Ikke bygg et generelt «to bytter» nå.**
   - Det gir ingen nye retninger noe sted.
   - Det gir nye områder bare ett sted, og der skyldes nesten alt en
     gangovergang.
   - Det koster 2–12 kall ekstra.
   - Tiden er enda dårligere kontrollert enn for ett bytte, der ledd 2 regnes
     fra nå.

   Antakelsen fra 3.5 holder for retninger. For områder holder den med ett
   unntak, som har en annen forklaring.
2. **Det målingen faktisk peker på, er gangoverganger ved knutepunktene:**
   Jernbanetorget ↔ Oslo S, og trolig Bergen busstasjon ↔ Bergen stasjon,
   Trondheim S ↔ sentrum osv.
   - Behandles stoppesteder innen noen hundre meter av et knutepunkt som samme
     knutepunkt i ett bytte, nås Lillehammer, Kongsvinger, Fredrikstad og
     Kongsberg med **ett bytte og en gåtur**.
   - Det er sannsynligvis uten ekstra kall, fordi de kan gå i samme
     ledd-2-spørring.
   - 3.5 nevnte «oppdagelse av gangoverganger» som utelatt. Dette er
     målingen som viser hva det koster å la det være.

   Gangtid og gangvei må vises på raden. Det er en egen beslutning.

## Usikkerhet

- **Bare kveld og natt er målt, ikke dagtid.** Dagtid gir flere avganger og
  trolig flere nye steder. Om det gir nye *områder*, er ikke målt.
- **Fire steder er målt.** Kystbygd, ferge og fleksible linjer er ikke med.
- **Områdeinndelingen er grov.** Med 40 ruter dekker ett bytte allerede
  50–60 %. Et finere rutenett ville vist flere «nye» områder, men da måler vi
  avstand og ikke ulike valg.
- **Tretten varierer mye mellom kjøringene** (451 og 251 steder), fordi
  avgangene på kvelden er få.
