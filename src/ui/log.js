import { state } from '../state.js';

function ts() {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function pad(n) { return String(n).padStart(2, '0'); }

/**
 * EN LOGGER SOM KAN KASTE ER VERRE ENN INGEN LOGGER.
 *
 * `el.insertBefore` på `null` veltet den som kalte. `logMsg` kalles fra et
 * dusin moduler, og ofte fra en `.catch` — altså nettopp der noe alt har gått
 * galt. Da tok loggelinja med seg feilhåndteringen den skulle rapportere.
 *
 * Funnet ved at `strom.js` logger fra en `setTimeout` som fyrer etter at en
 * prøve har revet ned DOM-en. Men det er ikke bare et prøveproblem: panelet
 * er ikke i DOM-en før `index.html` er parset, og alt som logger fra en
 * tidlig `.catch` eller en tidsutløser treffer det samme.
 *
 * Linja går tapt — det er det ærlige utfallet når det ikke finnes noe sted å
 * skrive den — men ingenting annet gjør det.
 */
export function logMsg(msg, kind) {
  const el = document.getElementById('log');
  if (!el) return;
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
  if (!d) return;            // samme grunn som over
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
