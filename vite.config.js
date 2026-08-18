import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  base: './',
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
