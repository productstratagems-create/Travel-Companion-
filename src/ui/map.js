import L from 'leaflet';
import { addCompass } from './mapCompass.js';
import { onThemeChange, tokens } from './themeTokens.js';
import { makeRouteStopIcon, makeJourneyPointIcon } from './mapIcons.js';

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
 * @param {{expandable?:boolean, zoom?:boolean, scale?:boolean, compass?:boolean}} opts
 */
export function createMap(el, opts = {}) {
  // ONE RULE FOR THE CONTROLS, stated rather than accumulated.
  //
  // Before: zoom on five maps and missing on two, a scale bar on three of
  // seven, and no pattern joining them — the board and the plan had a scale,
  // underveis and the detail screen did not, and they are the same kind of map.
  //
  // The rule is what the map is FOR. A map you can open full-screen is a place
  // you explore, so it carries the controls exploring needs. A band you cannot
  // open is a glance the app has already framed for you, and a zoom button on
  // it is an invitation to do something the screen is not for.
  //
  // `expandable` says which, and the caller passes the same answer it passes
  // to bindMapExpand — so the controls cannot disagree with the button.
  const { expandable = false, compass = true } = opts;
  const zoom = opts.zoom === undefined ? expandable : opts.zoom;
  const scale = opts.scale === undefined ? expandable : opts.scale;
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
 * How much air to leave around what a map is framing.
 *
 * A constant 40px was asked for on every fit, and on the 130px detail band
 * that is 62% of the height spent on margin: the journey filled THREE PER CENT
 * of the map. A line you cannot see is not less crowded than a line with beads
 * on it — it is a different failure, and one the crowding fix uncovered rather
 * than caused.
 *
 * Proportional, so the same call is right on a 130px band and on a 220px map,
 * and floored so a very short one still has an edge.
 */
export function fitPadding(heightPx) {
  const h = Number.isFinite(heightPx) ? heightPx : 0;
  return Math.max(8, Math.round(h * 0.12)) || 12;
}

/**
 * Open the map full-screen, and close it again — ONE behaviour.
 *
 * Reported: «maps across the app look and feel different». This button was
 * written four times, in board.js, selected.js, track.js and plan.js, and the
 * four had drifted:
 *
 *   tavla    toggles `map-open` on <html> and updates `title`
 *   detalj   neither
 *   underveis  neither
 *   plan     keeps its own boolean instead of reading the class back
 *
 * So the same control did three different things depending on which screen you
 * pressed it on, and only one of them told a hovering cursor what it would do.
 * Nobody chose that either; it was copied and then edited in one place.
 *
 * `map-open` is set on every screen now. Its CSS is scoped to
 * `html.view-board` — the board is the one screen with a fixed layout that has
 * to yield — so setting it elsewhere changes nothing today and stops the
 * handler from being four handlers.
 *
 * @param {object} map   the Leaflet map, so it can be told its size changed
 * @param {HTMLElement} el   the map container that grows
 * @param {HTMLElement} btn  the button
 */
export function bindMapExpand(map, el, btn) {
  if (!el || !btn) return;
  btn.onclick = () => {
    const open = el.classList.toggle('expanded');
    document.documentElement.classList.toggle('map-open', open);
    btn.textContent = open ? '\u2715' : '\u2922';
    const label = open ? 'Minimer kart' : 'Utvid kart';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    // The hovering cursor gets told too. Three of the four forgot this.
    btn.title = label;
    // After the CSS transition, not before it: Leaflet measures the container.
    setTimeout(() => map && map.invalidateSize(), 320);
  };
  btn.setAttribute('aria-expanded', el.classList.contains('expanded') ? 'true' : 'false');
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
 * ONE LEG, DRAWN THE ONE WAY A LEG IS DRAWN.
 *
 * Reported: «maps across the app look and feel different». The same journey
 * really was drawn three ways, and the difference was not a choice anyone made:
 *
 *   tavla        corridorStyle — a bus dotted and thin, rail solid and thick
 *   underveis    drawRoute at weight 4, solid, WHATEVER THE MODE — plus a
 *                fourth hand-rolled style, `1,8` at opacity .35, for the legs
 *                after the one you are riding
 *   avgangsdetaljer  drawRoute at weight 4, solid, mode never consulted
 *
 * So a bus was dotted on one screen and solid on the next two, and a reader
 * moving between them had to re-learn the picture. corridorStyle already
 * existed and already knew the answer; two of the three maps simply never
 * asked it.
 *
 * `dim` is kept because it is a real distinction and not a stylistic one:
 * underveis draws the leg you are ON and the legs still to come, and those are
 * different facts. It fades the same stroke rather than drawing another kind.
 *
 * @param {object} leg  {mode, colour, shape|pts, stops}
 * @returns {Array} the points drawn, so callers can fit and snap to them
 */
export function drawLeg(layer, leg, opts = {}) {
  const { dim = false, dots = true, project = null, onStopTap = null } = opts;
  const l = leg || {};
  const pts = (l.pts && l.pts.length >= 2) ? l.pts
    : (l.stops || []).filter(s => s && s.lat != null).map(s => [s.lat, s.lon]);
  if (pts.length < 2) return [];

  if (l.mode === 'foot') {
    drawWalk(layer, pts);
    return pts;
  }

  const base = corridorStyle(l.mode, l.colour || '#7c2d12');
  const style = dim ? { ...base, opacity: base.opacity * 0.45 } : base;
  drawRoute(layer, pts, style);

  // The beads, on the same terms everywhere: only the stops you pass through,
  // only when there is room to read them, and named on tap rather than always.
  const stops = (l.stops || []).filter(s => s && s.lat != null);
  const room = !project || stopsReadable(stops.map(st => project([st.lat, st.lon])));
  if (dots && room && stops.length > 2) {
    stops.slice(1, -1).forEach(st => {
      const m = L.marker([st.lat, st.lon],
        { icon: makeRouteStopIcon(l.colour || '#7c2d12'), keyboard: false }).addTo(layer);
      if (onStopTap) onStopTap(m, st);
      else m.bindTooltip(st.name || '', { className: 'map-label', direction: 'top', offset: [0, -6] });
    });
  }
  return pts;
}

/**
 * «På», «bytt», «av» — wherever a journey is drawn.
 *
 * v1.113.0 gave the board these three words. Underveis marked the same three
 * places with unlabelled white-ringed circles, and avgangsdetaljer marked none
 * of them — so a change was a word on one screen, a dot on another and nothing
 * on the third. That is a fifth vocabulary for one idea.
 *
 * Takes the points rather than the legs, because the three screens hold their
 * legs in three different shapes; `journeyPoints` is still the one rule that
 * decides WHICH points, and each caller feeds it what it has.
 */
export function drawJourneyPoints(layer, points, opts = {}) {
  const { colour = '#7c2d12', project = null, minPoints = 3 } = opts;
  const pts = points || [];
  // Two points is a single leg: boarding is where you already are and
  // alighting sits under a destination marker that is drawn anyway.
  if (pts.length < minPoints) return [];
  const kept = mergeNearby(pts, project);
  kept.forEach(pt => {
    L.marker([pt.lat, pt.lon], {
      icon: makeJourneyPointIcon(pt.kind, colour),
      zIndexOffset: 400,
      keyboard: false,
    })
      .bindTooltip(pt.names.join(' \u2192 ') || pt.name || '',
        { className: 'map-label', direction: 'top', offset: [0, -10] })
      .addTo(layer);
  });
  return kept;
}

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
