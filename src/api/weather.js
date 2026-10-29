import { fetchMedFrist } from './http.js';
import { logMsg } from '../ui/log.js';

/**
 * Open-Meteo: free, no API key, no User-Agent requirement, browser-safe.
 *
 * OG DET VALGET ER IKKE EN SMAKSSAK — det er det eneste som virker herfra.
 *
 * MET Norway (api.met.no) er den norske kilden, og den er utforsket: deres
 * egen HOWTO sier at en forespørsel uten en identifiserende `User-Agent` med
 * kontaktinfo får **403 Forbidden**, og at nettleser-JavaScript IKKE KAN
 * SETTE DEN — nettleseren sender `Origin` i stedet. Den vanlige løsningen er
 * en liten server-proxy som setter headeren og cacher.
 *
 * Denne appen har ingen server, med vilje, og `public/privacy.html` lover det
 * offentlig. Så MET direkte er ikke et teknisk valg, det er et produktvalg om
 * en publisert forpliktelse.
 *
 * HVA SOM DA BLE VALGT BORT, så ingen trenger å utrede dette på nytt:
 *
 *   Nowcast      radarbasert nedbør, ~2 min oppløsning, 90 min fram. Det er
 *                svaret på «blir jeg våt på de fjorten minuttene jeg går»,
 *                og ingen annen kilde har det for Norden.
 *   MET Alerts   offisielle farevarsler. Storm, is og flom er det som
 *                faktisk stopper kollektivtrafikken.
 *
 * Begge krever en proxy. Begge er verdt å ta den dagen «ingen server» blir
 * en avveining framfor et løfte.
 *
 * MEN MODELLEN FÅR VI LIKEVEL. Open-Meteo bruker MET Nordic som regionmodell
 * for Norge og Skandinavia, så tallene under er MET sine — servert fra en
 * vert nettleseren får snakke med.
 */
const OM = 'https://api.open-meteo.com/v1/forecast';

/**
 * MET Nordic, bedt om VED NAVN.
 *
 * Uten denne parameteren velger Open-Meteo «best match», og at best match
 * for Oslo er MET Nordic er en ANTAKELSE om en annen tjenestes valg — den
 * kan endres uten at noe her sier fra, og da ville appen stille byttet
 * værkilde. Det er nøyaktig den feilformen dette repoet har rettet rundt
 * tjuefem ganger: et faktum som står to steder og driver fra hverandre, der
 * det ene stedet er noen andres kode.
 *
 * STIGEN FINNES FORDI NAVNET IKKE KAN SJEKKES HERFRA. Sandkassen når ikke
 * api.open-meteo.com. Blir modellnavnet avvist, spørres det om igjen uten —
 * altså nøyaktig dagens oppførsel — framfor å miste været.
 */
export const MODELL = 'metno_seamless';
const CACHE_MS = 10 * 60 * 1000;
const _cache = new Map();
let _modellLogget = false;

/** For prøvene. */
export function _resetVær() { _cache.clear(); _modellLogget = false; }

export function fetchWeather(lat, lon) {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  const url = (modell) => OM
    + '?latitude=' + lat.toFixed(4)
    + '&longitude=' + lon.toFixed(4)
    + '&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code,is_day'
    + '&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m'
    + '&daily=sunrise,sunset'
    + '&forecast_hours=12'
    + '&wind_speed_unit=ms&timezone=auto'
    // SIST, ETTER `?`. Første utgave la den foran spørsmålstegnet og bygde
    // `.../forecast&models=…?latitude=…` — en adresse som ikke er en
    // adresse. Ingen test falt, fordi ingenting bandt URL-en; det gjør
    // `tests/vaermodell.test.js` nå.
    + (modell ? '&models=' + modell : '');

  /* Open-Meteo EKKOER IKKE modellnavnet i svaret.
   *
   * Så appen kan si hva den BA OM, og ingenting mer. «MET Nordic (bedt om)»
   * og «MET Nordic (bekreftet)» er ikke samme setning, og å skrive den andre
   * ville vært å gjenta vår egen konstant tilbake til oss selv og kalle det
   * et bevis. Det eneste tjenesten faktisk forteller oss er om navnet ble
   * AVVIST — og det er det stigen lytter etter. */
  const spør = (modell) => fetchMedFrist(url(modell))
    .then(r => {
      if (!r.ok) {
        if (modell) {
          logMsg('vær: modellen «' + modell + '» avvist — bruker Open-Meteos valg', 'err');
          return spør(null);
        }
        throw new Error(r.status);
      }
      if (modell && !_modellLogget) {
        _modellLogget = true;
        logMsg('vær: ber om ' + modell + ' (MET Nordic)', 'ok');
      }
      return r.json();
    });

  return spør(MODELL)
    .then(j => {
      const c = j.current;
      if (!c) throw new Error('empty');
      const temp   = Math.round(c.temperature_2m);
      const feels  = c.apparent_temperature != null ? Math.round(c.apparent_temperature) : null;
      const wind   = Math.round(c.wind_speed_10m);
      const precip = c.precipitation || 0;
      const code   = c.weather_code || 0;
      const isDay  = c.is_day == null ? null : !!c.is_day;

      // Parse hourly forecast
      const h = j.hourly || {};
      const times = h.time || [];
      const forecast = times.map((t, i) => {
        const fc = Math.round((h.temperature_2m || [])[i] ?? temp);
        const fp = (h.precipitation || [])[i] ?? 0;
        const fcode = (h.weather_code || [])[i] ?? code;
        const fw = Math.round((h.wind_speed_10m || [])[i] ?? wind);
        const fprob = (h.precipitation_probability || [])[i] ?? null;
        const ffeels = (h.apparent_temperature || [])[i];
        return {
          isoTime: t, temp: fc, precip: fp, code: fcode, wind: fw,
          precipProb: fprob,
          feels: ffeels != null ? Math.round(ffeels) : null,
          icon: weatherIcon(fcode),
        };
      });

      // Daylight: Open-Meteo returns one entry per forecast day.
      const dly = j.daily || {};
      const sunrise = (dly.sunrise || [])[0] || null;
      const sunset  = (dly.sunset  || [])[0] || null;

      const data = {
        temp, feels, wind, precip, code, isDay, sunrise, sunset,
        icon: weatherIcon(code),
        advice: weatherAdvice(temp, precip, wind, { feels }),
        forecast,
      };
      _cache.set(key, { ts: Date.now(), data });
      return data;
    });
}

// Returns the forecast entry closest in time to isoTime
export function forecastAt(forecast, isoTime) {
  if (!forecast || !forecast.length || !isoTime) return null;
  const target = new Date(isoTime).getTime();
  return forecast.reduce((best, entry) => {
    const d = Math.abs(new Date(entry.isoTime).getTime() - target);
    const bd = Math.abs(new Date(best.isoTime).getTime() - target);
    return d < bd ? entry : best;
  });
}

export function weatherIcon(code) {
  if (code === 0)                        return '☀';
  if (code <= 2)                         return '⛅';
  if (code === 3)                        return '☁';
  if (code <= 48)                        return '🌫';
  if (code <= 57)                        return '🌦';  // drizzle
  if (code <= 67)                        return code >= 65 ? '🌧' : '🌦';  // rain
  if (code <= 77)                        return '❄️';  // snow
  if (code <= 82)                        return '🌦';  // showers
  if (code <= 86)                        return '❄️';  // snow showers
  if (code >= 95)                        return '⛈';  // thunderstorm
  return '';
}

/**
 * Clothing advice. `opts.precipProb` lets callers avoid the umbrella line when
 * rain is forecast but unlikely; `opts.feels` drives the layer choice off
 * apparent temperature, which is what you actually feel waiting on a platform.
 */
export function weatherAdvice(temp, precip, wind, opts = {}) {
  const parts = [];
  const prob = opts.precipProb;
  const t = opts.feels != null ? opts.feels : temp;
  if (precip >= 0.3 && (prob == null || prob >= 30)) parts.push('ta med paraply');
  if (t < 0)       parts.push('vinterjakke og lue');
  else if (t < 8)  parts.push('vinterjakke');
  else if (t < 14) parts.push('jakke');
  else if (t < 19) parts.push('lett jakke');
  if (wind >= 12)  parts.push('vindjakke');
  return parts.join(' · ') || null;
}

/** "mørkt fra 16:12" when the sun sets before/soon after the given time. */
export function darknessNote(w, isoTime) {
  if (!w || !w.sunset || !isoTime) return null;
  const at = new Date(isoTime).getTime();
  const set = new Date(w.sunset).getTime();
  if (isNaN(at) || isNaN(set)) return null;
  const pad = n => String(n).padStart(2, '0');
  const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (at >= set) return 'mørkt';
  if (set - at <= 90 * 60000) return 'mørkt fra ' + hhmm(new Date(set));
  return null;
}
