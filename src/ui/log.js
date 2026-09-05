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
  // The board writes about five lines per poll, every ten seconds, so thirty
  // entries was under a minute of history — long enough to lose anything
  // written on another screen before the panel could be opened. Measured
  // twice, on two screenshots that should have carried the answer.
  while (el.children.length > 150) el.removeChild(el.lastChild);
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
    // Read from the store, so it does not matter how long ago the register
    // was filled or which screen filled it.
    //
    // Through a window hook, like _askStopBoard on the line above, and for a
    // concrete reason: hubs.js imports logMsg from THIS file, so importing
    // hubReport here would close a cycle. Harmless today because both are
    // called at click time — and exactly the shape that threw a
    // ReferenceError in the bundle while the unit tests stayed green, in
    // v1.76.0.
    if (open) {
      const h = document.getElementById('dbg-hubs');
      if (h && window._hubReport) h.textContent = window._hubReport();
    }
  };
  document.getElementById('status-dot').addEventListener('click', () => set(!state.debugOpen));
  // On the board the panel is a sheet over the content, so the dot that
  // opened it is underneath — it needs its own way out.
  const close = document.getElementById('dbg-close');
  if (close) close.addEventListener('click', () => set(false));
}
