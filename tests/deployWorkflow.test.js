/**
 * Utrullingen tåler å kjøres om igjen.
 *
 * v1.134.0 og v1.135.0 ble slått sammen til main og ble aldri publisert.
 * Bygget var grønt hele veien; deploy-steget sto og feilet:
 *
 *   Found 2 artifact(s)
 *   Error: Multiple artifacts named "github-pages" were unexpectedly found
 *          for this workflow run
 *
 * Å kjøre om en arbeidsflyt BEHOLDER forrige forsøks artefakter og laster
 * opp en ny. Med `upload-pages-artifact`s standardnavn holder kjøringen da
 * to som heter det samme, og `deploy-pages` nekter å velge. Enhver omkjøring
 * av en Pages-arbeidsflyt går rett i den.
 *
 * MIN FØRSTE DIAGNOSE VAR FEIL. Jeg så to kjøringer som ventet på
 * `concurrency: group: pages` og kalte det en lås som måtte ryddes.
 * Jobbloggen sa noe helt annet. Jeg hadde ikke lest den før jeg forklarte
 * hvorfor det hang.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const wf = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

describe('artefaktnavnet', () => {
  // ONE name, derived in both places. The uploader and the deployer must
  // agree, and two literals that must match is the shape this repo keeps
  // finding — here it would mean a deploy that cannot find its own build.
  it('står ett sted og leses begge steder', () => {
    expect(wf).toMatch(/PAGES_ARTIFACT:\s*github-pages-\$\{\{\s*github\.run_attempt\s*\}\}/);
    expect((wf.match(/\$\{\{\s*env\.PAGES_ARTIFACT\s*\}\}/g) || []).length).toBe(2);
  });

  it('gis til både opplasteren og utrulleren', () => {
    const upload = wf.slice(wf.indexOf('upload-pages-artifact'), wf.indexOf('deploy:'));
    expect(upload).toMatch(/name:\s*\$\{\{\s*env\.PAGES_ARTIFACT\s*\}\}/);
    const deploy = wf.slice(wf.indexOf('deploy-pages@'));
    expect(deploy).toMatch(/artifact_name:\s*\$\{\{\s*env\.PAGES_ARTIFACT\s*\}\}/);
  });

  // THE POINT: it has to differ between attempts, or a re-run collides with
  // the artifact the previous attempt left behind.
  it('skiller forsøkene fra hverandre', () => {
    expect(wf).toMatch(/github\.run_attempt/);
  });

  // The bare default is what produced the collision — but only as a STEP
  // INPUT. `environment: name: github-pages` two lines below is a different
  // thing with the same word in it, and the first version of this case
  // matched that instead. The instrument, not the workflow.
  it('gir aldri standardnavnet som steg-parameter', () => {
    for (const block of wf.matchAll(/with:\n((?:\s{10,}\S.*\n)+)/g)) {
      expect(block[1]).not.toMatch(/^\s*(?:artifact_)?name:\s*github-pages\s*$/m);
    }
  });

  // The environment is a different thing with the same word in it, and it
  // must keep its own name — `environment: name: github-pages` is what
  // binds the job to the Pages environment.
  it('rører ikke miljønavnet, som er noe annet', () => {
    expect(wf).toMatch(/environment:\s*\n\s*name:\s*github-pages/);
  });
});
