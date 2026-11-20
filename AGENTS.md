# Rettesnor for alle endringer

## Visjonen

> Visjonen vi ønsker å realisere for brukere av denne app er å gi dem total
> informasjonsoverlegenhet både før de har valgt avgang eller startet å bevege
> seg mot en holdeplass og når har valgt en spesifikk avgang og når de nærmer
> seg en holdeplass. Det skal alltid være klokkeklart for brukeren hvor denne
> er, hvor stoppet er, hvordan komme seg til stoppet, hvilke avganger som er
> relevant og når og hvor man ankommer. Appen skal skape oversikt og ro hos
> brukeren som alltid har den infoen denne trenger for å komme seg effektivt og
> trygt fra a til b.

Dette er målestokken for hver eneste endring. Den gjelder tre faser, og hver
skjerm hører hjemme i én av dem:

| fase | skjerm | hva som må være klokkeklart |
|---|---|---|
| før valg | tavla, auto-reise | hvor er jeg, hvor er stoppet, hvordan kommer jeg dit, hvilke avganger gjelder meg |
| valgt avgang | avgangsdetaljer | når går den, fra hvilken plattform, når og hvor ankommer jeg |
| underveis / nærmer seg | underveis | hvor er jeg nå, hvilket stopp er neste, når går jeg av |

### Hva visjonen krever i praksis

1. **Relevant, ikke bare riktig.** En opplysning som gjelder en annen linje,
   et annet stopp eller en annen avgang stjeler oppmerksomhet. Hver skjerm
   viser *sitt* — ikke den globale lista. (v1.105.0 finnes fordi et banner
   var globalt.)
2. **Vis det du allerede vet.** Gjentatte ganger har appen regnet ut svaret og
   brukt det på et `title`-attributt, en logglinje eller en sirkel uten tall.
   Er verdien regnet ut, skal den stå på skjermen.
3. **Romlig, ikke bare tekstlig.** «Hvor er jeg» og «hvordan kommer jeg dit»
   besvares av kart, retning og gangavstand — ikke av en liste alene.
4. **Si hva du ikke vet.** «Ikke spurt», «leter», «avslått», «unøyaktig» og
   «gammel» er ikke samme setning. Stillhet leses som «alt er i orden».
5. **Ro.** Ingenting skal hoppe, blafre eller kreve skrolling for å se det
   avgjørende. Knappene som fører videre skal være synlige uten å skrolle.

### Og hvorfor appen finnes i det hele tatt

`docs/produktretning.md` er laget over denne visjonen: hva appen prøver å
være, hva som allerede er bygget, og hva som står igjen. Les den før du
foreslår en ny retning — seks av sju forslag i den forrige eksterne
vurderingen var allerede bygget, og en plan som ber om noe som finnes sender
oss til å bygge det to ganger.

Den bærer to rammeverk, og de svarer på hvert sitt spørsmål:

    PULL                er det noen som drar i dette?   → om vi bygger
    Proven·Better·New   hva slags arbeid er dette?      → hva det koster

Det første portvokter det andre. Et Better-tiltak uten pull er polering.

## Mønstre som er godkjent

### Alternativer hører hjemme på raden de gjelder (2026-11-20)

Bekreftet med skjermbilde: *«dette er måten å integrere alternativer for
bruker!»* Raden «73 → 81 · 19:59 · ank. 20:31 · rekker ikke her — rekk den på
Stenbråten 20:00 · 10 min å gå · 1 min igjen» (v1.218.176).

- **Ikke et kort over kartet.** Kortet «beste holdeplass herfra?» ble opplevd
  som et unaturlig, uforløst tillegg — det svarte på et spørsmål skjermen ikke
  stilte, i et annet format, et annet sted.
- **På raden brukeren alt ser på**, i radens eget språk: samme nedtelling,
  samme ankomst, samme «gå om / igjen». Alternativet *er* avgangen, nådd et
  annet sted.
- **Bare det appen alt vet** (turens egne kall), og bare når det kan handles
  på. Ingen dom om hva brukeren «trenger» — ikke «beste valg», ikke «bedre».
- **Én definisjon** (`rekkeFor`): stripa, raden og avgangsdetaljene sier det
  samme.

Neste alternativer — nabostopp, andre reiser — skal følge samme form: en rad
i lista, ikke en boks over den.

### Posisjonens alder vises på kartet, ikke i tekst (2026-11-20)

Utprøvd (Google, Apple): blå prikk, ring for unøyaktighet, **grå prikk** for
gammel. Tekst bare når det endrer hva brukeren gjør, og da som følgen
(«ca. 12 min gange», dempet), aldri som måling («vet ikke hvor gammel
posisjonen er»). Dette er en allmenn app, ikke et ingeniørverktøy. «Si hva du
ikke vet» betyr å si hva usikkerheten betyr for valget — ikke å beskrive
sensoren. Grå prikk = ingen «rekker / rekker ikke» (`posGrå`, én definisjon).

### Kartene følger `docs/kartregler.md` (2026-11-20)

Zoom og panorering har ett regelsett: ett tema per kart, fem navngitte
zoomtrinn, én margin, innramming bare når temaet endrer seg, og brukeren eier
kartet når hun har rørt det. Les det før du endrer et kart.

## Arbeidsmåten

- **Reproduser før du retter.** Bygg det rapporterte tilfellet som fikstur og
  krev at det feiler mot dagens kode først. Uten før-bildet er rettelsen bare
  en påstand.
- **Mutasjonstest påstanden som bærer korrektheten.** Ødelegg regelen med vilje
  og krev at testen faller. En test som overlever mutanten tester ingenting.
- **Se på den ferdige skjermen**, i lys og mørk modus, på telefonbredde. Flere
  feil denne kodebasen har hatt var usynlige i alle tall og åpenbare i ett
  skjermbilde.
- **Mål det du tror du måler.** Måleinstrumentet har tatt feil like ofte som
  koden: feil element, feil gulv (bunnmenyen er `position:fixed`), feil
  naboskap, fikstur uten innhold, mock som serverte feltet den skulle utelate.
- **Si hva som ikke kan verifiseres herfra.** Sandkassen når ikke
  `api.entur.io`, geokoder, Valhalla, fliser, Geoapify eller Overpass. Felt
  som bare kan prøves mot det ekte API-et spørres om som *probe* med stige og
  fallback — og det sies høyt, framfor å oppdages som en tom liste en morgen.
- **Én navngitt definisjon, ikke to som må være enige.** Den tilbakevendende
  feilformen i denne kodebasen, funnet omtrent femten ganger: to steder skriver
  ned det samme faktum og driver fra hverandre. Rettelsen er alltid den samme —
  ett navn, resten avledet, og en test som binder dem.
- **Ingenting kastes for å rydde.** Kan vi ikke bevise at noe er irrelevant,
  foldes det sammen — det slettes ikke.
