import './leafletGlobal.js';
import 'leaflet-rotate';
import { leggTilØverst, sett } from './kartVerktoy.js';

// Needle pointing "up" at bearing 0 — red tip = north, grey tail = south.
const _NEEDLE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M12 2 L16 12 L12 10 L8 12 Z" fill="#e5006d"/>'
  + '<path d="M12 22 L16 12 L12 14 L8 12 Z" fill="#9c9690"/>'
  + '</svg>';

// Adds a north-indicator button to a rotatable Leaflet map. The needle always
// points to true north regardless of the map's current rotation; the button
// is only shown once the map has been rotated away from north-up, and tapping
// it resets the bearing back to 0 — the conventional "compass" pattern from
// Google/Apple Maps.
export function addCompass(map, mapEl) {
  // I VERKTØYSØYLEN (v1.218.72): kompasset var en 28 px knapp oppe til
  // høyre, posisjonert mot innpakningen (og klatret ut av den der den ikke var
  // posisjonert). Nå er det en knapp i søylen, vist bare når kartet er rotert.
  if (!mapEl) return;
  // Øverst til høyre (v1.218.79), ikke i søylen.
  const btn = leggTilØverst(map, 'kompass', { ikon: _NEEDLE_SVG, tekst: 'Nord opp', påTrykk: () => map.setBearing(0) });
  const update = () => {
    const bearing = map.getBearing ? map.getBearing() : 0;
    sett(map, 'kompass', { skjult: Math.abs(bearing) < 0.5 });
    const needle = btn.querySelector('svg');
    if (needle) needle.style.transform = 'rotate(' + (-bearing) + 'deg)';
  };
  map.on('rotate', update);
  update();
}
