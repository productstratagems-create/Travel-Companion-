# T-bane

Ikke bare når banen går, men når du må gå — og hva som venter deg framme.

**Appen:** https://productstratagems-create.github.io/Travel-Companion-/
**Slik legger du den på hjemskjermen:** https://productstratagems-create.github.io/Travel-Companion-/install.html

A Vite single-page app with no backend. Departures come from
[Entur](https://developer.entur.org/), weather from
[Open-Meteo](https://open-meteo.com/), maps from OpenStreetMap via Stadia Maps.
It installs as a PWA and keeps the last departure board readable underground.

```
npm install
npm run dev      # local dev server
npm test         # vitest, jsdom
npm run build    # production bundle into dist/
```

Pushing to `main` deploys to GitHub Pages.

`public/install.html` is the install guide. It is deliberately self-contained —
its typefaces are subset and inlined as data URIs, so it renders correctly with
no third-party request. Editing its copy beyond the bundled character set means
regenerating those subsets.

## Støtte

Støtte er frivillig og låser ikke opp noe — appen har ingen konto, ingen
server og ingen betalingsmur, og kan ikke ha det: den ligger på GitHub Pages,
der alt er lesbart og alt nettleseren avgjør kan redigeres.

Kanalene settes i `config.support.rails` og er tomme som standard, så
seksjonen vises ikke før noe er fylt ut. En Vipps-lenke er død på en PC, så
oppgi også en QR-kode:

```sh
npm run qr        "https://qr.vipps.no/…"   # lager inline SVG
npm run qr:verify "https://qr.vipps.no/…"   # leser koden tilbake
```

**Merk om Vipps:** bedriftsproduktene (Vipps-nummer, Vipps på nett,
bedrifts-QR) forutsetter organisasjonsnummer. Uten et slikt er alternativet
privat Vipps, som gjør telefonnummeret offentlig og er ment for å splitte
regninger snarere enn løpende innsamling. Sjekk Vipps' egne vilkår før lenka
publiseres.
