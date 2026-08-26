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
 * A vehicle, not a map pin.
 *
 * This used to be a 28px saturated disc with the line code stamped across it,
 * pulsing white every 2.4 seconds. Three things were wrong with that: it read
 * as an abstract marker rather than a train, several departures on one line
 * rendered as a string of identical beads, and the pulse asserted liveness for
 * a position that is usually computed from a timetable.
 *
 * The code is gone from the marker because it is redundant by construction —
 * the board only ever draws vehicles for the selected line, and the track map
 * only ever draws the leg being ridden. It still appears in the tooltip.
 *
 * @param {string} mode  metro | rail | tram | bus
 * @param {string} color line colour
 * @param {{bearing?:number|null, estimated?:boolean}} [opts]
 *   bearing is degrees clockwise from north; the body is drawn pointing north,
 *   so it maps straight onto a CSS rotation. estimated draws the hollow
 *   variant, for a position derived from the timetable rather than measured.
 */
const _VEH_BOX = 26;   // room for the body plus its rotation

export function makeVehicleIcon(mode, color, opts = {}) {
  const { bearing = null, estimated = false } = opts;

  // Proportions only — at this size a per-mode pictogram is invisible detail.
  const long = mode === 'bus' ? 18 : mode === 'tram' ? 19 : 22;
  const wide = mode === 'bus' ? 11 : 10;
  const radius = mode === 'bus' ? 3 : wide / 2;

  const halo = _halo();
  // Both variants are filled. v1.11.0 drew the estimated one as a hollow
  // dashed outline in the line's own colour, directly on top of a corridor
  // drawn in that same colour: correctly placed, in the DOM, and invisible on
  // a phone. Since metro has no live feed, that was the only variant anyone
  // saw. The distinction is spent on fill strength and the nose band instead,
  // never on whether the thing is drawn at all.
  const fillOpacity = estimated ? 0.7 : 1;

  // The leading end carries a band in the halo colour — dark on a light
  // canvas, light on a dark one — so the front reads at a glance whichever
  // basemap is under it. That is the whole point of orienting the body.
  const nose = estimated
    ? ''
    : '<rect x="' + ((_VEH_BOX - wide) / 2 + 1.4) + '" y="' + ((_VEH_BOX - long) / 2 + 2)
      + '" width="' + (wide - 2.8) + '" height="3.2" rx="1.2" fill="' + halo + '" opacity=".85"/>';

  // The halo outline is what separates the body from the corridor beneath it,
  // which is drawn in the same colour — so it stays solid and full strength
  // for both variants.
  const svg = '<svg width="' + _VEH_BOX + '" height="' + _VEH_BOX + '" viewBox="0 0 ' + _VEH_BOX + ' ' + _VEH_BOX + '"'
    + ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<rect x="' + ((_VEH_BOX - wide) / 2) + '" y="' + ((_VEH_BOX - long) / 2) + '"'
    + ' width="' + wide + '" height="' + long + '" rx="' + radius + '"'
    + ' fill="' + color + '" fill-opacity="' + fillOpacity + '"'
    + ' stroke="' + halo + '" stroke-width="1.7"/>'
    + nose
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
