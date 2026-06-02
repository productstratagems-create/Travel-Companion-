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
    + '&current=temperature_2m,precipitation,wind_speed_10m,weather_code'
    + '&wind_speed_unit=ms&timezone=auto';

  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      const c = j.current;
      if (!c) throw new Error('empty');
      const temp   = Math.round(c.temperature_2m);
      const wind   = Math.round(c.wind_speed_10m);
      const precip = c.precipitation || 0;
      const code   = c.weather_code || 0;
      const data   = { temp, wind, precip, code, icon: weatherIcon(code), advice: weatherAdvice(temp, precip, wind) };
      _cache.set(key, { ts: Date.now(), data });
      return data;
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

export function weatherAdvice(temp, precip, wind) {
  const parts = [];
  if (precip >= 0.3)  parts.push('ta med paraply');
  if (temp < 0)       parts.push('vinterjakke og lue');
  else if (temp < 8)  parts.push('vinterjakke');
  else if (temp < 14) parts.push('jakke');
  else if (temp < 19) parts.push('lett jakke');
  if (wind >= 12)     parts.push('vindjakke');
  return parts.join(' · ') || null;
}
