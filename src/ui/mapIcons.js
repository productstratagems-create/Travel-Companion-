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
  const long = mode === 'bus' ? 17 : mode === 'tram' ? 18 : 21;
  const wide = mode === 'bus' ? 10 : 9;
  const radius = mode === 'bus' ? 3 : wide / 2;

  const halo = _halo();
  const fill = estimated ? 'none' : color;
  const bodyOpacity = estimated ? 0.9 : 1;

  // The leading end carries a band in the halo colour — dark on a light
  // canvas, light on a dark one — so the front reads at a glance whichever
  // basemap is under it. That is the whole point of orienting the body.
  const nose = estimated
    ? ''
    : '<rect x="' + ((_VEH_BOX - wide) / 2 + 1.4) + '" y="' + ((_VEH_BOX - long) / 2 + 2)
      + '" width="' + (wide - 2.8) + '" height="3.2" rx="1.2" fill="' + halo + '" opacity=".85"/>';

  const svg = '<svg width="' + _VEH_BOX + '" height="' + _VEH_BOX + '" viewBox="0 0 ' + _VEH_BOX + ' ' + _VEH_BOX + '"'
    + ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<rect x="' + ((_VEH_BOX - wide) / 2) + '" y="' + ((_VEH_BOX - long) / 2) + '"'
    + ' width="' + wide + '" height="' + long + '" rx="' + radius + '"'
    + ' fill="' + fill + '" fill-opacity="' + (estimated ? 0 : 1) + '"'
    + ' stroke="' + (estimated ? color : halo) + '" stroke-width="' + (estimated ? 1.6 : 1.4) + '"'
    + (estimated ? ' stroke-dasharray="3 2"' : '') + ' opacity="' + bodyOpacity + '"/>'
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

export function makeStopIcon(mode, count) {  const badge = (count > 1)
    ? '<span style="position:absolute;top:-6px;right:-6px;background:' + _halo() + ';color:#111;'
      + 'border-radius:50%;width:16px;height:16px;font-size:10px;font-weight:800;'
      + 'display:flex;align-items:center;justify-content:center;line-height:1;'
      + 'box-shadow:0 1px 3px rgba(0,0,0,.4)">' + count + '</span>'
    : '';
  let inner, w, h;
  if (mode === 'metro') {
    w = 28; h = 28;
    inner = '<div style="background:#f5a000;border:2px solid ' + _halo() + ';border-radius:50%;width:28px;height:28px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font-size:15px;font-weight:900;color:#fff;font-family:Arial,sans-serif;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.5)">T</div>';
  } else if (mode === 'bus') {
    w = 26; h = 22;
    inner = '<div style="background:#e5006d;border:2px solid ' + _halo() + ';border-radius:5px;width:26px;height:22px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.5)">' + _BUS_SVG + '</div>';
  } else if (mode === 'tram') {
    w = 26; h = 22;
    inner = '<div style="background:#7b3999;border:2px solid ' + _halo() + ';border-radius:5px;width:26px;height:22px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.5)">' + _TRAM_SVG + '</div>';
  } else {
    w = 22; h = 22;
    inner = '<div style="background:#555;border:2px solid ' + _halo() + ';border-radius:50%;width:22px;height:22px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font-size:10px;font-weight:700;color:#fff;'
      + 'box-shadow:0 1px 3px rgba(0,0,0,.5)">?</div>';
  }
  const html = '<div style="position:relative;display:inline-block">' + inner + badge + '</div>';
  return L.divIcon({ className: '', html, iconSize: [w, h], iconAnchor: [Math.round(w / 2), Math.round(h / 2)] });
}

// Small dot marking an intermediate stop on the selected line's route corridor.
export function makeRouteStopIcon(color) {
  // Demoted: these are context, not decisions. Smaller and quieter than the
  // markers that answer a question.
  const size = 7;
  const html = '<div style="background:' + color + ';border-radius:50%;width:' + size + 'px;height:' + size + 'px;'
    + 'opacity:.75;border:1.5px solid ' + _halo() + ';box-shadow:0 1px 2px rgba(0,0,0,.4)"></div>';
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [Math.round(size / 2), Math.round(size / 2)] });
}
