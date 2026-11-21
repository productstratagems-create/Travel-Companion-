/**
 * VELG STED PÅ KARTET — FAST NÅL I MIDTEN (v1.218.198). Spurt: «dersom bruker
 * ikke er fornøyd med appens forslag til hvor bruker er, hva er proven da?»
 * Utprøvd (Uber, Bolt, Google, Apple): kartet i fullskjerm, nåla står fast i
 * midten, du drar kartet under den, adressen under nåla oppdateres, én knapp
 * bekrefter. Søk og stoppene i nærheten står øverst for den som vet navnet.
 * Erstatter lista-først-panelet fra v1.218.197 som døra («stedPanelHtml»
 * står, foldet).
 */
import L from 'leaflet';
import { createMap } from './map.js';
import { esc } from './fmt.js';
import { bindPlaceInput } from './suggest.js';
import { ZOOM } from './kartRamme.js';

/** Teksten under nåla. Ren. */
export function nålTekst(navn, venter) {
  if (venter) return 'finner adressen …';
  return navn || 'punkt i kartet';
}

/**
 * Åpne. `start` {lat,lon}; `gps` {lat,lon}|null; `nære` [{name,lat,lon,distM}];
 * `navnFor(ll, ferdig)` gir navn, undefined mens det hentes, null uten svar;
 * `søk(q)` → Promise<[{label,lat,lon}]>; `onVelg(label, ll)`; `onGps()`.
 */
export function åpneStedKart({ start, acc, gps, nære, manuell, navnFor, søk, onVelg, onGps }) {
  const lag = document.createElement('div');
  lag.className = 'stedkart';
  lag.setAttribute('role', 'dialog');
  lag.setAttribute('aria-label', 'Velg hvor du er');
  lag.innerHTML = '<div class="stedkart-topp">'
    + '<div class="stedkart-rad"><input class="stedkart-sok" type="search" autocomplete="off" placeholder="søk adresse eller sted">'
    + '<button type="button" class="stedkart-lukk" aria-label="lukk">✕</button></div>'
    + '<div class="sugg-list stedkart-sugg" hidden></div>'
    + ((nære || []).length ? '<div class="stedkart-chips">' + nære.slice(0, 4).map((s, i) =>
      '<button type="button" class="stedkart-chip" data-i="' + i + '">' + esc(s.name) + '</button>').join('') + '</div>' : '')
    + '</div>'
    // Nåla INNI kartflaten, midt på den: der kartets midtpunkt er. Sto den
    // midt på hele skjermen, beskrev adressen et annet punkt enn nåla (sett i proben).
    + '<div class="stedkart-flate"><div class="stedkart-kart"></div>'
    + '<div class="stedkart-nal" aria-hidden="true"><span></span></div></div>'
    + '<div class="stedkart-bunn">'
    + '<div class="stedkart-adr" aria-live="polite"></div>'
    + '<div class="stedkart-hint">dra kartet til nåla står der du er</div>'
    + '<button type="button" class="stedkart-ok">Bekreft — jeg er her</button>'
    + (gps ? '<button type="button" class="stedkart-gps">◎ ' + (manuell ? 'bruk GPS igjen' : 'tilbake til GPS-punktet') + '</button>' : '')
    + '</div>';
  document.body.appendChild(lag);
  const kart = createMap(lag.querySelector('.stedkart-kart'), {});
  kart.setView([start.lat, start.lon], ZOOM.GANG, { animate: false });
  if (gps && Number.isFinite(acc) && acc > 20) {
    L.circle([gps.lat, gps.lon], { radius: acc, weight: 1, color: '#4285f4', fillOpacity: 0.08, interactive: false }).addTo(kart);
  }
  const adr = lag.querySelector('.stedkart-adr');
  let valgtNavn = null;
  const oppdater = () => {
    const c = kart.getCenter();
    const n = navnFor({ lat: c.lat, lon: c.lng }, () => { if (lag.isConnected) oppdater(); });
    valgtNavn = n || null;
    adr.textContent = nålTekst(n, n === undefined);
  };
  kart.on('movestart', () => { adr.textContent = '…'; valgtNavn = null; });
  kart.on('moveend', oppdater);
  setTimeout(() => { kart.invalidateSize(); oppdater(); }, 60);

  const lukk = () => { kart.remove(); lag.remove(); };
  const flytt = ll => kart.setView([ll.lat, ll.lon], ZOOM.GANG);
  lag.querySelector('.stedkart-lukk').addEventListener('click', lukk);
  lag.querySelector('.stedkart-ok').addEventListener('click', () => {
    const c = kart.getCenter();
    lukk();
    onVelg(valgtNavn || 'punkt i kartet', { lat: c.lat, lon: c.lng });
  });
  const g = lag.querySelector('.stedkart-gps');
  if (g) g.addEventListener('click', () => { if (manuell) { lukk(); onGps(); } else flytt(gps); });
  lag.querySelectorAll('.stedkart-chip').forEach(b => b.addEventListener('click', () => { const s = nære[Number(b.dataset.i)]; if (s) flytt(s); }));
  bindPlaceInput(lag.querySelector('.stedkart-sok'), lag.querySelector('.stedkart-sugg'), søk, r => flytt(r));
  return { lukk, kart };
}
