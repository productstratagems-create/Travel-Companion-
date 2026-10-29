import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import faktaPlugin from './scripts/injectFakta.mjs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  base: './',
  // Appens adresse bor i `src/origin.js`. De statiske filene bærer merket
  // `%ORIGIN%` og får den satt inn her — også de under `public/`, som Vite
  // ellers kopierer ordrett og utenom enhver transformasjon.
  plugins: [faktaPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // jsdom, not node: storage.js runs its profile migration against
    // localStorage at import time, so any module reaching it needs a DOM.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
