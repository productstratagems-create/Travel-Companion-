// leaflet-rotate's source patches the global `L` object directly rather than
// importing it as an ES module, so it must find `window.L` set before it
// evaluates. Importing this module first (before 'leaflet-rotate') guarantees
// that, while still giving every other module the normal `L` singleton.
import L from 'leaflet';
if (typeof window !== 'undefined' && !window.L) window.L = L;
export default L;
