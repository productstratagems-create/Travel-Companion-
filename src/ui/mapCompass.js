import './leafletGlobal.js';
import 'leaflet-rotate';

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
  const wrap = mapEl.parentElement;
  if (!wrap) return;

  let btn = wrap.querySelector('.map-compass');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-compass';
    btn.setAttribute('aria-label', 'Vis nord opp');
    btn.title = 'Nord opp';
    btn.innerHTML = _NEEDLE_SVG;
    wrap.appendChild(btn);
  }
  btn.onclick = () => map.setBearing(0);

  const update = () => {
    const bearing = map.getBearing();
    btn.style.display = Math.abs(bearing) < 0.5 ? 'none' : 'flex';
    const needle = btn.querySelector('svg');
    if (needle) needle.style.transform = 'rotate(' + (-bearing) + 'deg)';
  };
  map.on('rotate', update);
  update();
}
