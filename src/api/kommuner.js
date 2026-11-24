/**
 * Kommune og fylke fra Enturs geocoder — én definisjon for «ett bytte»
 * (kommunene på kortene) og «hvor langt» (v1.218.308, src/rekkevidde.js).
 * `place` i biter på KOMMUNE_BIT (målt: 50 treff per kall), og `reverse` for
 * der du står. Feiler stille per bit: et sted uten svar mangler bare i kartet.
 */
import { enturFetch } from './http.js';

const GEO = 'https://api.entur.io/geocoder/v1';
export const KOMMUNE_BIT = 50;
const geoJson = url => enturFetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

/** Stopp-id → kommune og → fylke. */
export async function hentStedsinfo(ider) {
  const kommuneAv = new Map(), fylkeAv = new Map();
  for (let i = 0; i < (ider || []).length; i += KOMMUNE_BIT) {
    const j = await geoJson(GEO + '/place?ids=' + ider.slice(i, i + KOMMUNE_BIT).map(encodeURIComponent).join(','));
    for (const f of (j && j.features) || []) {
      const p = f.properties || {};
      if (p.id && p.locality) kommuneAv.set(p.id, p.locality);
      if (p.id && p.county) fylkeAv.set(p.id, p.county);
    }
  }
  return { kommuneAv, fylkeAv };
}

/** Kommunen og fylket du står i. */
export async function hentHerInfo(pos) {
  const her = await geoJson(GEO + '/reverse?point.lat=' + pos.lat + '&point.lon=' + pos.lon + '&size=1&boundary.circle.radius=2');
  const p = (her && her.features && her.features[0] && her.features[0].properties) || {};
  return { kommune: p.locality || null, fylke: p.county || null };
}
