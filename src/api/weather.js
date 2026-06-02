const YR = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const HDR = { 'User-Agent': 'TravelCompanionOslo/1.0' };
const CACHE_MS = 10 * 60 * 1000;
const _cache = new Map();

export function fetchWeather(lat, lon) {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return Promise.resolve(hit.data);

  return fetch(YR + '?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4), { headers: HDR })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      const ts = (j.properties && j.properties.timeseries) || [];
      if (!ts.length) throw new Error('empty');
      const d = ts[0].data;
      const inst = d.instant.details;
      const n1   = d.next_1_hours || d.next_6_hours || {};
      const symbol = (n1.summary && n1.summary.symbol_code) || '';
      const precip  = (n1.details && n1.details.precipitation_amount) || 0;
      const temp    = Math.round(inst.air_temperature);
      const wind    = Math.round(inst.wind_speed);
      const data    = { temp, wind, precip, symbol, icon: weatherIcon(symbol), advice: weatherAdvice(temp, precip, wind) };
      _cache.set(key, { ts: Date.now(), data });
      return data;
    });
}

export function weatherIcon(symbol) {
  if (!symbol)                                        return '';
  if (symbol.includes('thunder'))                    return '⛈';
  if (symbol.includes('heavyrain'))                  return '🌧';
  if (symbol.includes('rain') || symbol.includes('sleet')) return '🌦';
  if (symbol.includes('snow'))                       return '❄️';
  if (symbol.includes('fog'))                        return '🌫';
  if (symbol.includes('partlycloudy'))               return '⛅';
  if (symbol.includes('cloudy'))                     return '☁';
  if (symbol.includes('clearsky') || symbol.includes('fair')) return '☀';
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
