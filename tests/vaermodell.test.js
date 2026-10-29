/**
 * Hvilken værmodell tallene kommer fra var noen andres valg.
 *
 * `weather.js` sendte ingen `models=`-parameter, så Open-Meteo valgte «best
 * match». At best match for Oslo er MET Nordic er en ANTAKELSE om en annen
 * tjenestes beslutning — den kan endres uten at noe her sier fra, og da
 * bytter appen stille værkilde.
 *
 * Det er feilformen dette repoet har rettet rundt tjuefem ganger: et faktum
 * som står to steder og driver fra hverandre. Det spesielle her er at det
 * andre stedet er noen andres kode.
 *
 * OG MET DIREKTE ER UTFORSKET OG FORKASTET, med grunn. api.met.no krever en
 * `User-Agent` med kontaktinfo; deres egen HOWTO sier at nettleser-
 * JavaScript ikke kan sette den, og at svaret da er 403. Det eneste som
 * løser det er en proxy, og `public/privacy.html` lover offentlig «ingen
 * server». Begrunnelsen står nå i `weather.js`, der valget ble tatt.
 *
 * «BEDT OM» OG «BEKREFTET» ER IKKE SAMME SETNING. Open-Meteo ekkoer ikke
 * modellnavnet, så appen kan si hva den ba om og ingenting mer. Å skrive
 * «bekreftet» ville vært å gjenta vår egen konstant tilbake til oss selv og
 * kalle det et bevis.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { MODELL, fetchWeather, _resetVær } from '../src/api/weather.js';

const kilde = fs.readFileSync('src/api/weather.js', 'utf8');

beforeEach(() => { _resetVær(); vi.unstubAllGlobals(); });

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten et modellnavn ville hver påstand under vært
  // grønn uten å ha prøvd noe.
  it('har en modell å binde mot', () => {
    expect(MODELL).toBeTruthy();
    expect(MODELL).toMatch(/metno/);
  });
});

describe('modellen bes om ved navn', () => {
  /** Fanger URL-en uten å gå på nett. */
  function fang(svar) {
    const sett = [];
    vi.stubGlobal('fetch', (u) => {
      sett.push(String(u));
      return Promise.resolve(svar(String(u)));
    });
    return sett;
  }
  const ok = () => ({ ok: true, json: () => Promise.resolve({
    current: { temperature_2m: 4, wind_speed_10m: 2, precipitation: 0, weather_code: 0, is_day: 1 },
    hourly: {}, daily: {},
  }) });

  /* FØR-BILDET. Mot dagens kode fantes ingen `models=` i adressen. */
  it('står i adressen', async () => {
    const sett = fang(ok);
    await fetchWeather(59.9139, 10.7522);
    expect(sett[0]).toContain('models=' + MODELL);
  });

  /* OG ADRESSEN ER EN ADRESSE.
   *
   * Første utgave la parameteren FØR spørsmålstegnet og bygde
   * `.../forecast&models=…?latitude=…`. Ingen test falt — ingenting bandt
   * URL-en — og feilen ville bare meldt seg som «været laster ikke», som er
   * nøyaktig den rapporten denne appen har fått før. */
  it('og den er velformet, med parameteren etter spørsmålstegnet', async () => {
    const sett = fang(ok);
    await fetchWeather(59.9139, 10.7522);
    const u = sett[0];
    expect(u.indexOf('?')).toBeGreaterThan(-1);
    expect(u.indexOf('models=')).toBeGreaterThan(u.indexOf('?'));
    expect(u).not.toMatch(/forecast&/);
    // Og den kan faktisk parses, som er den eneste ærlige prøven på en URL.
    expect(() => new URL(u)).not.toThrow();
    expect(new URL(u).searchParams.get('models')).toBe(MODELL);
  });

  it('og alt det som ble spurt om før står urørt', async () => {
    const sett = fang(ok);
    await fetchWeather(59.9139, 10.7522);
    const p = new URL(sett[0]).searchParams;
    expect(p.get('latitude')).toBe('59.9139');
    expect(p.get('current')).toContain('temperature_2m');
    expect(p.get('hourly')).toContain('precipitation_probability');
    expect(p.get('daily')).toContain('sunrise');
  });
});

describe('stigen, fordi navnet ikke kan sjekkes herfra', () => {
  /* PÅSTANDEN SOM GJØR DET TRYGT Å BE OM NOE UBEKREFTET.
   *
   * Blir modellnavnet avvist, skal appen miste MODELLEN — ikke VÆRET. */
  it('spør om igjen uten modellen når den avvises', async () => {
    const sett = [];
    vi.stubGlobal('fetch', (u) => {
      sett.push(String(u));
      if (String(u).includes('models=')) return Promise.resolve({ ok: false, status: 400 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        current: { temperature_2m: 4, wind_speed_10m: 2, precipitation: 0, weather_code: 0, is_day: 1 },
        hourly: {}, daily: {},
      }) });
    });
    const v = await fetchWeather(59.9139, 10.7522);
    expect(sett).toHaveLength(2);
    expect(sett[1]).not.toContain('models=');
    expect(v.temp).toBe(4);          // ← været overlevde
  });

  // Men en feil som ikke handler om modellen skal fortsatt være en feil.
  it('og maser ikke når tjenesten er nede uansett', async () => {
    let n = 0;
    vi.stubGlobal('fetch', () => { n++; return Promise.resolve({ ok: false, status: 503 }); });
    await expect(fetchWeather(59.9139, 10.7522)).rejects.toThrow();
    expect(n).toBe(2);               // ett forsøk med modell, ett uten
  });
});

describe('begrunnelsen står der valget ble tatt', () => {
  /* Dette er en test mot at noen — meg selv inkludert — utreder api.met.no
   * på nytt om et halvår og kommer til samme svar en gang til. Den binder at
   * BEGRUNNELSEN står i fila, ikke bare i en commit-melding ingen leser. */
  it('weather.js sier hvorfor met.no ikke brukes', () => {
    expect(kilde).toMatch(/api\.met\.no/);
    expect(kilde).toMatch(/User-Agent/);
    expect(kilde).toMatch(/403/);
  });

  it('og hva som da ble valgt bort', () => {
    expect(kilde).toMatch(/Nowcast/i);
    expect(kilde).toMatch(/Alerts/i);
  });
});
