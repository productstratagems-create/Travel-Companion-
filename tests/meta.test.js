/**
 * The link preview, the install dialog and the search result are all made of
 * metadata that NOTHING in the app reads. Nobody notices when it rots: the
 * page still opens, it just previews as a blank square, or the rich install
 * dialog quietly becomes the narrow "add to home screen" bar.
 *
 * So it is pinned here, against the files it actually points at. The one
 * thing that cannot be checked in this sandbox is how a scraper renders the
 * card — there is no network to Facebook, Slack or Google from here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SITE = 'https://productstratagems-create.github.io/Travel-Companion-/';
const index = fs.readFileSync('index.html', 'utf8');
const install = fs.readFileSync('public/install.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));

/** A PNG says its own size in its header. Nothing else is trusted here. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

const meta = (html, attr, name) =>
  (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1];

describe('link preview', () => {
  // The failure this replaces: og:image was `icons/icon-512.png`, a relative
  // path. Scrapers resolve it against nothing, so a shared board previewed
  // with no picture at all.
  it.each([['index.html', index], ['install.html', install]])(
    '%s points at an absolute image', (_name, html) => {
      const img = meta(html, 'property', 'og:image');
      expect(img.startsWith('https://')).toBe(true);
      expect(meta(html, 'property', 'og:url').startsWith('https://')).toBe(true);
      expect(meta(html, 'name', 'twitter:image').startsWith('https://')).toBe(true);
    });

  it('asks for the wide card, not the small square', () => {
    expect(meta(index, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(meta(install, 'name', 'twitter:card')).toBe('summary_large_image');
  });

  // A card whose declared size does not match the file is a card some
  // scrapers crop and others reject.
  it('declares the size the file actually has', () => {
    const img = meta(index, 'property', 'og:image');
    const local = 'public/' + img.slice(SITE.length);
    expect(fs.existsSync(local)).toBe(true);
    const w = meta(index, 'property', 'og:image:width');
    const h = meta(index, 'property', 'og:image:height');
    expect(pngSize(local)).toBe(`${w}x${h}`);
    // Facebook and Slack both want 1.91:1, and 600px wide at minimum.
    expect(Number(w) / Number(h)).toBeCloseTo(1.905, 2);
    expect(Number(w)).toBeGreaterThanOrEqual(600);
  });

  it('says what the picture shows, for anyone who cannot see it', () => {
    expect(meta(index, 'property', 'og:image:alt').length).toBeGreaterThan(20);
  });
});

describe('manifest screenshots', () => {
  // Without `form_factor` Chrome ignores the whole entry and falls back to
  // the narrow install bar — the exact thing these pictures exist to avoid.
  it('gives every screenshot a form factor and a label', () => {
    expect(manifest.screenshots.length).toBeGreaterThanOrEqual(2);
    manifest.screenshots.forEach(s => {
      expect(['narrow', 'wide']).toContain(s.form_factor);
      expect(s.label).toBeTruthy();
      expect(s.type).toBe('image/png');
    });
    // Android's rich dialog needs at least one narrow one.
    expect(manifest.screenshots.some(s => s.form_factor === 'narrow')).toBe(true);
  });

  it('names files that exist, at the sizes it claims', () => {
    manifest.screenshots.forEach(s => {
      const local = 'public/' + s.src;
      expect(fs.existsSync(local), s.src).toBe(true);
      expect(pngSize(local), s.src).toBe(s.sizes);
    });
  });
});

describe('being findable', () => {
  it('has a canonical address on every page', () => {
    for (const html of [index, install]) {
      expect(/<link rel="canonical" href="https:\/\//.test(html)).toBe(true);
    }
  });

  it('has a title that says what it is and where', () => {
    const title = (index.match(/<title>([^<]*)<\/title>/) || [])[1];
    expect(title).toMatch(/Oslo/);
    expect(title.length).toBeGreaterThan(12);
  });

  // A sitemap that lists a page that 404s is worse than no sitemap.
  it('lists only pages that ship', () => {
    const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    locs.forEach(loc => {
      expect(loc.startsWith(SITE), loc).toBe(true);
      const rel = loc.slice(SITE.length);
      if (rel === '') expect(fs.existsSync('index.html')).toBe(true);
      else expect(fs.existsSync('public/' + rel), rel).toBe(true);
    });
  });

  it('points robots.txt at that same sitemap', () => {
    const robots = fs.readFileSync('public/robots.txt', 'utf8');
    expect(robots).toContain('Sitemap: ' + SITE + 'sitemap.xml');
    expect(robots).toMatch(/Allow: \//);
  });
});
