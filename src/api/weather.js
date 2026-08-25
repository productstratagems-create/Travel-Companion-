// Open-Meteo: free, no API key, no User-Agent requirement, browser-safe
const OM = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 10 * 60 * 1000;
const _cache = new Map();

export function fetchWeather(lat, lon) {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  const url = OM
    + '?latitude=' + lat.toFixed(4)
    + '&longitude=' + lon.toFixed(4)
    + '&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code,is_day'
    + '&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m'
    + '&daily=sunrise,sunset'
    + '&forecast_hours=12'
    + '&wind_speed_unit=ms&timezone=auto';

  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
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
