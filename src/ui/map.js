import L from 'leaflet';
import { addCompass } from './mapCompass.js';
import { onThemeChange, tokens } from './themeTokens.js';

/**
 * One place that owns basemap tiles, map init options and the live-map
 * registry. Seven maps used to copy-paste this, which is how they drifted
 * into three different zoom-control positions and a light basemap in dark
 * themes.
 *
 * Only data-theme picks the tile set. The palette axis (standard/blågrå)
 * doesn't need its own imagery — a neutral canvas suits both.
 */
/**
 * Stadia's Alidade Smooth, light and dark.
 *
 * This used to be CARTO Positron / Dark Matter. CARTO began requiring an API
 * key on basemaps.cartocdn.com and stamps keyless requests with a repeating
 * "API key required" watermark, which is what the maps were showing; they are
 * retiring those raster endpoints besides. Alidade Smooth is the same idea —
 * a neutral canvas so the app's own colours are the only saturated thing on
 * it — so the design from v1.8.0 survives the move intact.
 *
 * Authentication is by registered domain, which is why no key appears here.
 * VITE_STADIA_KEY exists as a fallback for a context the domain allow-list
 * cannot cover; it is optional and normally unset.
 */
const TILE = {
  light: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
  dark:  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
};

const KEY = (typeof import.meta !== 'undefined' && import.meta.env
  && import.meta.env.VITE_STADIA_KEY) || '';

// Stadia, OpenMapTiles and OpenStreetMap all require attribution. Every map
// used to set attributionControl:false, so none was ever shown.
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a>';

export function currentTileUrl() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const base = dark ? TILE.dark : TILE.light;
  return KEY ? base + '?api_key=' + encodeURIComponent(KEY) : base;
}

function tileLayer() {
  return L.tileLayer(currentTileUrl(), {
    // The URL carries {r}; without detectRetina Leaflet substitutes an empty
    // string and every phone gets 1x tiles. This is the single biggest
    // sharpness win available.
    detectRetina: true,
    maxZoom: 20,
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
    // Matches the tile layer above; leaving this at 19 would cap the map one
    // level below the imagery it can actually serve.
    maxZoom: 20,
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

/**
 * A walk, drawn the one way a walk is drawn.
 *
 * There were five places drawing a walking line, between them two routers
 * (Entur's `directMode:foot` and Valhalla), two copies of the polyline
 * decoder, and four dash patterns — `'5 5'`, `'6 6'`, `'6 7'`, `'7 6'` — at
 * three weights and four opacities. Nobody chose that; it accumulated. The
 * same walk looked like a different thing depending on which map you were on.
 *
 * Dashed on purpose, and lighter than a transit corridor: this is the part of
 * the journey you cover yourself, and it should read as the connective tissue
 * between the lines rather than as another line.
 */
export function drawWalk(layer, latlngs) {
  return drawRoute(layer, latlngs, {
    color: tokens().accent, weight: 3, opacity: 0.85, dashArray: '2 7',
  });
}

/** Swap every live map onto the tile set matching the current theme. */
export function retileMaps() {
  const url = currentTileUrl();
  _live.forEach(e => { if (e.tiles) e.tiles.setUrl(url); });
}

// Swap basemaps the moment the theme does, so a light canvas never lingers
// under a dark UI.
onThemeChange(retileMaps);
