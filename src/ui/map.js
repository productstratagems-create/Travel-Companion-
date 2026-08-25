import L from 'leaflet';
import { addCompass } from './mapCompass.js';
import { onThemeChange } from './themeTokens.js';

/**
 * One place that owns basemap tiles, map init options and the live-map
 * registry. Seven maps used to copy-paste this, which is how they drifted
 * into three different zoom-control positions and a light basemap in dark
 * themes.
 *
 * Only data-theme picks the tile set. The palette axis (standard/blågrå)
 * doesn't need its own imagery — a neutral canvas suits both.
 */
const TILE = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

// CARTO and OpenStreetMap both require attribution. Every map used to set
// attributionControl:false, so none was ever shown.
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

export function currentTileUrl() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return dark ? TILE.dark : TILE.light;
}

function tileLayer() {
  return L.tileLayer(currentTileUrl(), {
    subdomains: 'abcd',
    // The URL carries {r}; without detectRetina Leaflet substitutes an empty
    // string and every phone gets 1x tiles. This is the single biggest
    // sharpness win available.
    detectRetina: true,
    maxZoom: 19,
    attribution: ATTRIBUTION,
    className: 'basemap-tiles',
  });
}

// Live maps, so a theme change can re-tile them all.
const _live = new Set();

/**
 * Create a map with the app's standard options.
 * @param {HTMLElement} el
 * @param {{zoom?:boolean, scale?:boolean, compass?:boolean}} opts
 */
export function createMap(el, opts = {}) {
  const { zoom = true, scale = false, compass = true } = opts;
  const map = L.map(el, {
    zoomControl: false,          // added below so every map agrees on position
    attributionControl: true,
    rotate: true,
    touchRotate: true,
    rotateControl: false,
    maxZoom: 19,
  });
  const tiles = tileLayer().addTo(map);
  // Bottom-right on every map: thumb reach on a phone, and out of the way of
  // the expand button and filter pills that live top-left/top-right.
  if (zoom) L.control.zoom({ position: 'bottomright' }).addTo(map);
  if (scale) L.control.scale({ imperial: false, maxWidth: 100, position: 'bottomleft' }).addTo(map);
  if (compass) addCompass(map, el);
  map.attributionControl.setPrefix('');

  const entry = { map, tiles };
  _live.add(entry);
  const remove = map.remove.bind(map);
  map.remove = function () { _live.delete(entry); return remove(); };
  return map;
}

/**
 * Draw a route line with a casing — a wider stroke in the canvas ink colour
 * underneath the coloured line. Without it a coloured line over a busy
 * basemap loses its edges and reads as part of the map.
 */
export function drawRoute(layer, latlngs, opts = {}) {
  const { color, weight = 4, opacity = 0.85, dashArray = null, interactive = false } = opts;
  const ink = (getComputedStyle(document.documentElement)
    .getPropertyValue('--map-ink') || '').trim() || '#05070d';
  L.polyline(latlngs, {
    color: ink, weight: weight + 3, opacity: 0.35,
    lineCap: 'round', lineJoin: 'round', interactive: false,
  }).addTo(layer);
  return L.polyline(latlngs, {
    color, weight, opacity, dashArray,
    lineCap: 'round', lineJoin: 'round', interactive,
  }).addTo(layer);
}

/** Swap every live map onto the tile set matching the current theme. */
export function retileMaps() {
  const url = currentTileUrl();
  _live.forEach(e => { if (e.tiles) e.tiles.setUrl(url); });
}

// Swap basemaps the moment the theme does, so a light canvas never lingers
// under a dark UI.
onThemeChange(retileMaps);
