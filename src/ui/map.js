import L from 'leaflet';
import { addCompass } from './mapCompass.js';
import { onThemeChange, tokens } from './themeTokens.js';
import { makeRouteStopIcon } from './mapIcons.js';

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
  // ROUND BEADS, WELL APART — not a slightly different dash from a bus.
  // corridorStyle draws a bus as `1 7` at weight 2 and this was `2 7` at
  // weight 3: two faint dotted strings differing by one pixel of dash, which
  // on a phone is no difference at all. A walk is the one leg you make with
  // your own feet, so it is drawn as footsteps: fat round dots with air
  // between them, in the accent rather than a line's colour.
  return drawRoute(layer, latlngs, {
    color: tokens().accent, weight: 4, opacity: 0.9,
    dashArray: '0.1 10', lineCap: 'round',
  });
}

/**
 * How a transit corridor is drawn, per mode.
 *
 * Moved here from board.js, where it was exported but lived among three
 * hundred lines of corridor clipping. It is a pure lookup about how a LINE
 * looks, which belongs beside the function that draws lines — and auto-reise
 * now needs the same answer. Two tables for one idea is the failure shape
 * this codebase has found around a dozen times; board.js re-exports it under
 * its old name so nothing there has to change.
 *
 * A bus is dotted and thin, rail-bound modes are solid: a bus on a road is a
 * weaker claim about where the vehicle actually goes than a train on a track.
 */
export function corridorStyle(mode, color) {
  return mode === 'bus'
    ? { color, weight: 2, opacity: 0.55, dashArray: '1 7', interactive: false }
    : { color, weight: 4, opacity: 0.7, lineCap: 'round', interactive: false };
}

/**
 * Is there room to draw a marker at every stop?
 *
 * The gate is the median gap rather than the smallest: one pair of unusually
 * close stops should not blank a corridor that is otherwise perfectly
 * legible. Three times the 7px marker, so beads never touch.
 *
 * Moved here from board.js because drawStopLine needs the same answer.
 * Measured on auto-reise: an 11 km metro line inside a 140px band put its
 * stops a 9px median apart — right in every number and a solid caterpillar on
 * the screen.
 */
export const ROUTE_STOP_MIN_GAP_PX = 21;

export function stopsReadable(points, minGap) {
  const pts = points || [];
  if (pts.length < 3) return true;      // ends only; nothing to crowd
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    gaps.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median >= (minGap == null ? ROUTE_STOP_MIN_GAP_PX : minGap);
}

/**
 * A line, drawn from the stops it calls at.
 *
 * The pattern — polyline through the stops, then a small dot on each one in
 * between — is written out by hand in board.js, track.js and selected.js.
 * This would have been the fourth copy. Same consolidation `drawWalk` and
 * `userDot` above are: nobody chose three, it accumulated.
 *
 * STRAIGHT SEGMENTS BETWEEN STOPS, AND THAT IS NOT THE REAL ALIGNMENT. The
 * decoded shape (`pointsOnLink`) is only in `tripGQL`; a stop board answer
 * carries coordinates and nothing else, so the line cuts every curve. The app
 * already falls back this way in four places and plan.js draws whole journeys
 * like this — but a chord between platforms is an approximation, and callers
 * that HAVE a shape should pass it as `opts.shape`.
 *
 * Stops with no coordinates are skipped rather than allowed to collapse the
 * line to [0,0] — a missing kink is a small lie, a line through null island
 * is a large one.
 *
 * @param {L.LayerGroup} layer
 * @param {{lat:number, lon:number, name:string}[]} stops  in travel order
 * @param {{color?:string, mode?:string, shape?:number[][], dots?:boolean, project?:Function}} opts
 * @returns {{pts:number[][], drawn:boolean}} the points actually used
 */
/**
 * Markers that would sit on top of each other become one marker.
 *
 * The browser probe drew «BYTT» twice, overlapping, for one change: a 370 m
 * walk between two stops is two real facts and about eight pixels at the zoom
 * a whole journey fits in. Both were correct and the pair was unreadable.
 *
 * NOTHING IS DROPPED — the merged marker keeps every name, so tapping it still
 * tells you both ends of the change. That is the same call `splitSituations`
 * made about messages it could not prove were irrelevant: fold, do not delete.
 *
 * Measured in PIXELS, like stopsReadable beside it, because whether two things
 * touch is a question about the screen and not about the map.
 *
 * @param {Array<{lat: number, lon: number, name?: string}>} items
 * @param {(latlng: Array) => {x: number, y: number}} project
 * @returns {Array} the kept items, each with `names` — every name it stands for
 */
export function mergeNearby(items, project, minGapPx) {
  const gap = minGapPx == null ? ROUTE_STOP_MIN_GAP_PX : minGapPx;
  const kept = [];
  (items || []).forEach(it => {
    if (!it) return;
    const p = project ? project([it.lat, it.lon]) : null;
    const near = p && kept.find(k => {
      const q = project([k.lat, k.lon]);
      return Math.hypot(q.x - p.x, q.y - p.y) < gap;
    });
    if (near) {
      if (it.name && !near.names.includes(it.name)) near.names.push(it.name);
      return;
    }
    kept.push({ ...it, names: it.name ? [it.name] : [] });
  });
  return kept;
}

export function drawStopLine(layer, stops, opts = {}) {
  const { color = '#7c2d12', mode = null, shape = null, dots = true, project = null } = opts;
  const usable = (stops || []).filter(s => s && s.lat != null && s.lon != null);
  const pts = (shape && shape.length >= 2) ? shape : usable.map(s => [s.lat, s.lon]);
  if (pts.length < 2) return { pts: [], drawn: false };

  drawRoute(layer, pts, corridorStyle(mode, color));

  // The ends are the caller's business — it knows which one you board at and
  // which one the line is heading for, and those deserve louder markers than
  // the ones you pass through.
  // Only when there is room. Pass `project` (a map's latLngToContainerPoint)
  // and the beads are dropped when they would touch — the line itself still
  // says where it goes, and the list below already names every stop.
  const room = !project || stopsReadable(usable.map(st => project([st.lat, st.lon])));
  if (dots && room) {
    usable.slice(1, -1).forEach(s => {
      L.marker([s.lat, s.lon], { icon: makeRouteStopIcon(color), keyboard: false })
        .bindTooltip(s.name || '', { className: 'map-label', direction: 'top', offset: [0, -6] })
        .addTo(layer);
    });
  }
  return { pts, drawn: true, dots: !!(dots && room) };
}

/**
 * You, on any map — drawn the one way you are drawn.
 *
 * There were five of these: board.js, two in track.js, selected.js and
 * leisure.js. Three read `tokens().mapYou`; the other two were still
 * hardcoded `#60a5fa` — THE SAME BLUE AS THE DESTINATION PINS. So on two
 * screens the dot saying "you are here" was the same colour as the dot saying
 * "you are going there", which is the one confusion a map about orientation
 * must not have. track.js's own comment says the token was introduced to
 * prevent exactly that; two maps never got the message.
 *
 * Same consolidation `drawWalk` above did for the walking line, and for the
 * same reason: nobody chose five, it accumulated.
 *
 * THE SOURCE IS ALSO ONE CHOICE NOW. Callers disagreed about which position
 * wins — board.js took `walkFromLL || homeLL`, track.js took
 * `homeLL || walkFromLL`. A place the reader set themselves beats a GPS fix,
 * as everywhere else in the app; `userLL()` is that rule, in one place.
 *
 * @param {L.LayerGroup|L.Map} layer
 * @param {{lat:number, lon:number}} ll
 */
export function userDot(layer, ll, opts = {}) {
  const { radius = 7, tooltip = 'Din posisjon' } = opts;
  const m = L.circleMarker([ll.lat, ll.lon], {
    radius, color: tokens().mapInk, fillColor: tokens().mapYou,
    fillOpacity: 1, weight: 2.5,
  });
  if (tooltip) {
    m.bindTooltip(tooltip, { className: 'map-label', direction: 'bottom', offset: [0, 6] });
  }
  return m.addTo(layer);
}

/** Swap every live map onto the tile set matching the current theme. */
export function retileMaps() {
  const url = currentTileUrl();
  _live.forEach(e => { if (e.tiles) e.tiles.setUrl(url); });
}

// Swap basemaps the moment the theme does, so a light canvas never lingers
// under a dark UI.
onThemeChange(retileMaps);
