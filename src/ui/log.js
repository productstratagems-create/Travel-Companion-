import { state } from '../state.js';

function ts() {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function pad(n) { return String(n).padStart(2, '0'); }

export function logMsg(msg, kind) {
  const el = document.getElementById('log');
  const d = document.createElement('div');
  d.className = 'le ' + (kind || '');
  d.innerHTML = '<span class="ts">' + ts() + '</span> ' + msg;
  el.insertBefore(d, el.firstChild);
  while (el.children.length > 30) el.removeChild(el.lastChild);
}

export function setDot(s) {
  const d = document.getElementById('status-dot');
  d.className = 'status-dot' + (s === 'error' ? ' error' : s === 'loading' ? ' loading' : '');
  const label = s === 'error' ? 'systemstatus: feil' : s === 'loading' ? 'systemstatus: laster' : 'systemstatus: tilkoblet';
  d.setAttribute('aria-label', label);
}

export function initDebugToggle() {
  const panel = () => document.getElementById('debug-panel');
  const set = (open) => {
    state.debugOpen = open;
    const p = panel();
    if (p) p.style.display = open ? 'block' : 'none';
    // The stop-board comparison is only asked for while the panel is open, so
    // ask the moment it opens rather than at the next poll twenty seconds on.
    if (open) window._askStopBoard && window._askStopBoard();
  };
  document.getElementById('status-dot').addEventListener('click', () => set(!state.debugOpen));
  // On the board the panel is a sheet over the content, so the dot that
  // opened it is underneath — it needs its own way out.
  const close = document.getElementById('dbg-close');
  if (close) close.addEventListener('click', () => set(false));
}
