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

const _METRO_GLYPH = '<div style="font-size:8px;font-weight:900;color:#fff;line-height:1;font-family:Arial,sans-serif">T</div>';
function _modeGlyph(mode) {
  if (mode === 'bus') return _BUS_SVG.replace('width="13" height="13"', 'width="9" height="9"');
  if (mode === 'tram') return _TRAM_SVG.replace('width="13" height="13"', 'width="9" height="9"');
  return _METRO_GLYPH;
}

const _VEH_SIZE = 28;
const _VEH_OPACITY = 0.95;
export function makeVehicleIcon(mode, code, color) {
  const size = _VEH_SIZE;
  const opacity = _VEH_OPACITY;
  const fontSize = Math.round(size * 0.4);
  const html = '<div style="position:relative;opacity:' + opacity + '" class="veh-pulse">'
    + '<div style="background:' + color + ';border-radius:50%;width:' + size + 'px;height:' + size + 'px;'
    + 'display:flex;align-items:center;justify-content:center;'
    + 'font-size:' + fontSize + 'px;font-weight:800;color:#fff;font-family:inherit;'
    + 'border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5)">' + code + '</div>'
    + '<div style="position:absolute;bottom:-2px;right:-2px;background:rgba(10,8,6,.85);'
    + 'border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center">'
    + _modeGlyph(mode) + '</div>'
    + '</div>';
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [Math.round(size / 2), Math.round(size / 2)] });
}

export function makeStopIcon(mode, count) {  const badge = (count > 1)
    ? '<span style="position:absolute;top:-5px;right:-5px;background:#fff;color:#111;'
      + 'border-radius:50%;width:14px;height:14px;font-size:8px;font-weight:800;'
      + 'display:flex;align-items:center;justify-content:center;line-height:1;'
      + 'box-shadow:0 1px 3px rgba(0,0,0,.4)">' + count + '</span>'
    : '';
  let inner, w, h;
  if (mode === 'metro') {
    w = 28; h = 28;
    inner = '<div style="background:#f5a000;border-radius:50%;width:28px;height:28px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font-size:15px;font-weight:900;color:#fff;font-family:Arial,sans-serif;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.5)">T</div>';
  } else if (mode === 'bus') {
    w = 26; h = 22;
    inner = '<div style="background:#e5006d;border-radius:5px;width:26px;height:22px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.5)">' + _BUS_SVG + '</div>';
  } else if (mode === 'tram') {
    w = 26; h = 22;
    inner = '<div style="background:#7b3999;border-radius:5px;width:26px;height:22px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'box-shadow:0 1px 4px rgba(0,0,0,.5)">' + _TRAM_SVG + '</div>';
  } else {
    w = 22; h = 22;
    inner = '<div style="background:#555;border-radius:50%;width:22px;height:22px;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font-size:10px;font-weight:700;color:#fff;'
      + 'box-shadow:0 1px 3px rgba(0,0,0,.5)">?</div>';
  }
  const html = '<div style="position:relative;display:inline-block">' + inner + badge + '</div>';
  return L.divIcon({ className: '', html, iconSize: [w, h], iconAnchor: [Math.round(w / 2), Math.round(h / 2)] });
}

// Small dot marking an intermediate stop on the selected line's route corridor.
export function makeRouteStopIcon(color) {
  const size = 10;
  const html = '<div style="background:' + color + ';border-radius:50%;width:' + size + 'px;height:' + size + 'px;'
    + 'border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5)"></div>';
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [Math.round(size / 2), Math.round(size / 2)] });
}
