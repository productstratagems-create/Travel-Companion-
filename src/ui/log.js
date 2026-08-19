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
  document.getElementById('status-dot').addEventListener('click', () => {
    state.debugOpen = !state.debugOpen;
    document.getElementById('debug-panel').style.display = state.debugOpen ? 'block' : 'none';
  });
}
