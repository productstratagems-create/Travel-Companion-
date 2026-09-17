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
