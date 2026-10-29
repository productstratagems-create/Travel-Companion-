/**
 * En forespørsel som henger, henger for alltid.
 *
 * Det var den første hypotesen om «laster vær…» som aldri ga seg. Den var
 * feil om NETTOPP den feilen — årsaken var en TypeError som drepte kjeden
 * før nettverket ble spurt — men den var sann om koden: ingen av de tre
 * klientene hadde et tidsavbrudd.
 *
 * `fetch` uten `signal` avvises aldri når forbindelsen henger. Verken
 * `.then` eller `.catch` fyrer, og kallestedet står og venter til siden
 * lastes på nytt. Det eneste stedet i appen som hadde et tidsavbrudd var
 * gangruteren, og tallet sto skrevet ut der.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { REQUEST_TIMEOUT_MS, fetchMedFrist } from '../src/api/http.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchMedFrist', () => {
  it('gir fetch et signal som gir opp', async () => {
    const spion = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', spion);
    await fetchMedFrist('https://eksempel.no/x');
    const opts = spion.mock.calls[0][1];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('beholder det kalleren selv sendte med', async () => {
    const spion = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', spion);
    await fetchMedFrist('https://eksempel.no/x', {
      method: 'POST', body: 'data=1', headers: { 'Content-Type': 'text/plain' },
    });
    const opts = spion.mock.calls[0][1];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe('data=1');
    expect(opts.headers['Content-Type']).toBe('text/plain');
  });

  /* ETT NAVN, TRE LESERE.
   *
   * Tallet sto som `10000` inne i `route.js` og fantes ingen andre steder.
   * Bundet på kildeteksten og ikke bare på verdien, fordi det er WIRINGEN
   * som manglet: konstanten kunne finnes og være perfekt uten at været og
   * stedene noensinne leste den. */
  it('er det ene tallet alle tre leser', () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    for (const f of ['src/api/weather.js', 'src/api/places.js', 'src/api/route.js']) {
      const t = fs.readFileSync(f, 'utf8');
      expect(t, f).toMatch(/from '\.\/http\.js'/);
      // Og ingen av dem har sitt eget tall igjen.
      expect(t, f).not.toMatch(/AbortSignal\.timeout\(\s*\d/);
    }
  });

  it('lar vær og steder faktisk bruke den', () => {
    for (const f of ['src/api/weather.js', 'src/api/places.js']) {
      const t = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      expect(t, f).toMatch(/fetchMedFrist\(/);
      // En bar `fetch(` igjen ville vært en klient uten frist.
      expect(t, f).not.toMatch(/[^a-zA-Z]fetch\(/);
    }
  });
});
