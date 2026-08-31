import L from 'leaflet';

const _BUS_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" fill="white" xmlns="http://www.w3.org/2000/svg">'
  + '<rect x="1" y="3" width="14" height="9" rx="2"/>'
  + '<rect x="3" y="1" width="10" height="3" rx="1" opacity=".8"/>'
  + '<circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/>'
  + '<rect x="2" y="5" width="5" height="3" rx=".5" fill="#c0005e"/>'
  + '<rect x="9" y="5" width="5" height="3" rx=".5" fill="#c0005e"/>'
  + '</svg>';

const _TRAM_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" fill="white" xmlns="http://www.w3.org/2000/svg">'
  + '<rect x="1" y="4" width="14" height="8" rx="2"/>'
  + '<rect x="4" y="2" width="8" height="3" rx="1" opacity=".8"/>'
  + '<circle cx="4.5" cy="13" r="1.5"/><circle cx="11.5" cy="13" r="1.5"/>'
  + '<line x1="1" y1="14.5" x2="15" y2="14.5" stroke="white" stroke-width="1.5" opacity=".4"/>'
  + '<rect x="2" y="5.5" width="5" height="2.5" rx=".4" fill="#5c2b77"/>'
  + '<rect x="9" y="5.5" width="5" height="2.5" rx=".4" fill="#5c2b77"/>'
  + '</svg>';

// A ring in the canvas ink's inverse. Markers carried only a drop shadow,
// which disappears against dark tiles and leaves their edges muddy.
/** The ring that separates a marker from whichever basemap is under it. */
export function mapHalo() { return _halo(); }

function _halo() {
  const ink = (typeof getComputedStyle !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--map-ink') || '').trim()
    : '') || '#05070d';
  // --map-ink is dark on a light canvas, so the halo is its opposite.
  return ink === '#ffffff' ? '#1e293b' : '#ffffff';
}

/**
 * A vehicle, seen from above, with its nose pointing the way it is going.
 *
 * Two earlier shapes are worth knowing about, because this one is answering
 * both. First a 28px saturated disc with the line code stamped across it,
 * pulsing white every 2.4 seconds — an abstract marker, not a train, and the
 * pulse asserted liveness for a position that is usually computed. Then a
 * plain rounded rectangle: honest, oriented, and — reported — boring. Four
 * transport modes rendered as two capsules, metro and rail identical.
 *
 * The old comment here claimed a per-mode pictogram was invisible detail at
 * this size. That was true of a 22×10 capsule. At around 27×12, with the map
 * now drawing about three vehicles instead of fifteen (v1.48.0), it is not: a
 * tapered nose and two cross-lines are the difference between "a pill" and
 * "an articulated vehicle facing that way".
 *
 * PLAN VIEW is forced, not chosen. The marker is rotated to the heading by
 * CSS, so a side-on bus would lie on its side heading east. Everything here
 * is what you would see looking straight down: the roof, the windscreen, and
 * the joints between carriages.
 *
 * Every detail is drawn INSIDE the body's silhouette. `.veh-live` animates
 * `filter: drop-shadow(...)`, which traces the union of everything rendered,
 * so anything sticking out would grow its own halo.
 *
 * @param {string} mode  metro | rail | tram | bus — anything else gets metro
 * @param {string} color line colour; falls back to the mode's own when the
 *   caller has none (track.js passes leg.lineBg, which can be empty)
 * @param {{bearing?:number|null, estimated?:boolean}} [opts]
 *   bearing is degrees clockwise from north; the body is drawn pointing north,
 *   so it maps straight onto a CSS rotation. estimated draws the quieter
 *   variant, for a position derived from the timetable rather than measured.
 */
const _VEH_BOX = 30;   // room for the longest body plus its outline

/**
 * What each mode looks like from above.
 *
 * `long`/`wide` are the body and `rx` rounds its tail. The character is in the
 * other two: `nose` is how far back the front tapers, and `cars` is how many
 * carriages the divider lines cut the body into. A bus is short, wide and
 * blunt with no joints; a train is long, streamlined and in four parts.
 */
const _VEH_SHAPE = {
  //                                     nose = how far back the taper runs
  metro: { long: 27, wide: 11.5, rx: 3,   nose: 6.5, cars: 3 },
  rail:  { long: 28, wide: 11.5, rx: 3,   nose: 9,   cars: 4 },
  tram:  { long: 25, wide: 10.5, rx: 2.5, nose: 4.5, cars: 4 },
  bus:   { long: 19, wide: 13,   rx: 2.5, nose: 2.5, cars: 1 },
};

/**
 * The body: a box with a tapered nose, drawn pointing north.
 *
 * A rounded rectangle was tried first and rejected by looking at it. Both ends
 * were identical, so the only thing saying which way the vehicle faced was a
 * 2.6px band that read as one more joint line — and every mode came out as the
 * same capsule at a different length. Silhouette does at 27px what interior
 * detail cannot: the eye finds a pointed end before it finds anything drawn
 * inside a shape this small.
 *
 * `nose` is how far back the taper runs, and it is most of the character:
 * 9px on rail is streamlined, 2.5px on a bus is a flat front with mirrors'
 * worth of shoulder.
 */
function _bodyPath(x, y, w, long, rx, nose) {
  const r = (n) => Math.round(n * 100) / 100;
  const right = x + w, bottom = y + long;
  return 'M' + r(x + w / 2) + ' ' + r(y)
    + 'Q' + r(right) + ' ' + r(y) + ' ' + r(right) + ' ' + r(y + nose)
    + 'L' + r(right) + ' ' + r(bottom - rx)
    + 'Q' + r(right) + ' ' + r(bottom) + ' ' + r(right - rx) + ' ' + r(bottom)
    + 'L' + r(x + rx) + ' ' + r(bottom)
    + 'Q' + r(x) + ' ' + r(bottom) + ' ' + r(x) + ' ' + r(bottom - rx)
    + 'L' + r(x) + ' ' + r(y + nose)
    + 'Q' + r(x) + ' ' + r(y) + ' ' + r(x + w / 2) + ' ' + r(y)
    + 'Z';
}
export function makeVehicleIcon(mode, color, opts = {}) {
  const { bearing = null, estimated = false } = opts;

  const shape = _VEH_SHAPE[mode] || _VEH_SHAPE.metro;
  const { long, wide, rx, nose, cars } = shape;
  // An empty colour reaches here from track.js, where leg.lineBg is '' for a
  // line with no presentation colour — and `fill=""` renders as black.
  const body = color || _MODE_COLOUR[mode] || _MODE_COLOUR.rail;

  const halo = _halo();
  // Both variants are filled. v1.11.0 drew the estimated one as a hollow
  // dashed outline in the line's own colour, directly on top of a corridor
  // drawn in that same colour: correctly placed, in the DOM, and invisible on
  // a phone. Since metro has no live feed, that was the only variant anyone
  // saw. The distinction is spent on fill strength and the headlights instead,
  // never on whether the thing is drawn at all.
  const fillOpacity = estimated ? 0.72 : 1;

  const x = (_VEH_BOX - wide) / 2;
  const y = (_VEH_BOX - long) / 2;
  const r = (n) => Math.round(n * 100) / 100;

  // The windscreen, sitting in the taper where the cab actually is, and cut to
  // the width the body has at that point so it reads as glass in a nose rather
  // than a stripe laid across a box. On BOTH variants: a timetable position
  // still points somewhere, so it should look like something facing that way.
  // Stripping the front off the estimated variant is what left metro — which
  // has no live feed at all, so is always estimated — with the emptiest marker
  // in the app.
  const wsY = y + nose * 0.55 + 1.4;
  const wsW = wide - 3.6;
  const windscreen = '<rect class="veh-glass" x="' + r(x + (wide - wsW) / 2) + '" y="' + r(wsY) + '"'
    + ' width="' + r(wsW) + '" height="2.9" rx="1.3"'
    + ' fill="' + halo + '" opacity="' + (estimated ? '.72' : '.9') + '"/>';

  // The joints between carriages: thin, and deliberately quieter than the
  // windscreen. When they carried the same weight the marker read as a ladder
  // with no front.
  const jointTop = wsY + 3.6;
  const jointSpan = (y + long) - jointTop - 1.5;
  let joints = '';
  for (let i = 1; i < cars; i++) {
    joints += '<rect class="veh-joint" x="' + r(x + 0.7) + '" y="' + r(jointTop + (jointSpan * i) / cars) + '"'
      + ' width="' + r(wide - 1.4) + '" height="0.9" rx="0.45"'
      + ' fill="' + halo + '" opacity="' + (estimated ? '.32' : '.45') + '"/>';
  }

  // Headlights, and only on a measured position. This is what the nose band
  // used to be — but it is now an ADDITION to a front that both variants have,
  // rather than the only thing separating a vehicle from a capsule.
  const lightW = wide - nose * 0.5 - 4.5;
  const lights = estimated ? ''
    : '<rect class="veh-lamp" x="' + r(x + (wide - lightW) / 2) + '" y="' + r(y + nose * 0.16 + 0.6) + '"'
      + ' width="' + r(lightW) + '" height="1.5" rx="0.75"'
      + ' fill="' + halo + '"/>';

  // The halo outline is what separates the body from the corridor beneath it,
  // which is drawn in the same colour — so it stays solid and full strength
  // for both variants.
  const svg = '<svg width="' + _VEH_BOX + '" height="' + _VEH_BOX + '" viewBox="0 0 ' + _VEH_BOX + ' ' + _VEH_BOX + '"'
    + ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<path class="veh-body" d="' + _bodyPath(x, y, wide, long, rx, nose) + '"'
    + ' fill="' + body + '" fill-opacity="' + fillOpacity + '"'
    + ' stroke="' + halo + '" stroke-width="1.7" stroke-linejoin="round"/>'
    + windscreen
    + joints
    + lights
    + '</svg>';

  // Unrotated when the heading is unknown, rather than snapped north — a
  // confident wrong direction is worse than none.
  const rot = bearing == null ? '' : 'transform:rotate(' + Math.round(bearing) + 'deg);';
  // Only a measured position earns an animation. See the note above.
  const cls = estimated ? 'veh veh-est' : 'veh veh-live';
  const html = '<div class="' + cls + '" style="' + rot
    + 'width:' + _VEH_BOX + 'px;height:' + _VEH_BOX + 'px;line-height:0">' + svg + '</div>';

  return L.divIcon({
    className: '',
    html,
    iconSize: [_VEH_BOX, _VEH_BOX],
    iconAnchor: [_VEH_BOX / 2, _VEH_BOX / 2],
  });
}

// Transit brand colours, kept because they carry meaning rather than style.
const _MODE_COLOUR = {
  metro: '#f5a000',
  tram:  '#7b3999',
  bus:   '#e5006d',
  rail:  '#5a6b7d',
};

/**
 * A stop.
 *
 * This used to be a 28px disc with a white "T" set in Arial for metro, and
 * rounded squares carrying 13px vehicle glyphs for bus and tram — three shape
 * languages, four sizes across the map, and a typeface the app uses nowhere
 * else. The letter told you nothing the colour and the mode filter above the
 * map did not already say.
 *
 * Now it matches the vehicle marker: a filled shape with the same halo
 * outline, no lettering, and one size scale. Mode is carried by colour alone.
 *
 * @param {string} mode  metro | tram | bus | rail
 * @param {number} count how many modes this stop serves
 * @param {{primary?:boolean}} [opts] the stop you are departing from
 */
export function makeStopIcon(mode, count, opts = {}) {
  const colour = _MODE_COLOUR[mode] || _MODE_COLOUR.rail;
  // Your own stop reads a step louder than the ones merely nearby.
  const size = opts.primary ? 15 : 11;
  const halo = _halo();

  const badge = (count > 1)
    ? '<span style="position:absolute;top:-5px;right:-7px;min-width:13px;height:13px;'
      + 'padding:0 2px;background:' + halo + ';color:' + (halo === '#ffffff' ? '#1e293b' : '#f8fafc') + ';'
      + 'border-radius:7px;font-size:9px;font-weight:700;line-height:13px;text-align:center;'
      + 'font-family:\'JetBrains Mono\',ui-monospace,monospace;'
      + 'box-sizing:border-box">' + count + '</span>'
    : '';

  const dot = '<span style="display:block;width:' + size + 'px;height:' + size + 'px;'
    + 'background:' + colour + ';border-radius:50%;'
    + 'border:1.7px solid ' + halo + ';box-sizing:border-box;'
    + 'box-shadow:0 1px 3px rgba(0,0,0,.35)"></span>';

  const html = '<div style="position:relative;display:block;line-height:0">' + dot + badge + '</div>';
  return L.divIcon({ className: '', html, iconSize: [size, size],
                     iconAnchor: [Math.round(size / 2), Math.round(size / 2)] });
}

export function makeRouteStopIcon(color) {
  // Demoted: these are context, not decisions. Smaller and quieter than the
  // markers that answer a question.
  const size = 7;
  const html = '<div style="background:' + color + ';border-radius:50%;width:' + size + 'px;height:' + size + 'px;'
    + 'opacity:.8;border:1.7px solid ' + _halo() + ';box-shadow:0 1px 2px rgba(0,0,0,.35)"></div>';
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [Math.round(size / 2), Math.round(size / 2)] });
}
