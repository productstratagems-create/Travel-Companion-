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
