import config from '../config.js';
import { intervals } from '../state.js';
import { fetchJourneyMeta } from '../api/entur.js';
import { esc } from '../ui/fmt.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

let _open = false;

function _formHtml() {
  return '<div class="spec-form">'
    + '<input class="spec-input" id="spec-input" placeholder="lim inn reise-ID" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">'
    + '<button class="spec-go-btn" id="spec-go" type="button">finn</button>'
    + '</div>'
    + '<div id="spec-result"></div>';
}

function _resultHtml(meta) {
  const rows = meta.calls.map(c => {
    const t = c.expected || c.aimed;
    const delayed = c.aimed && c.expected && c.aimed !== c.expected;
    return '<div class="spec-row' + (c.cancelled ? ' cancelled' : '') + '">'
      + '<span class="spec-time' + (delayed ? ' delayed' : '') + '">' + (t ? clk(t) : '—') + '</span>'
      + '<span class="spec-stop">' + esc(c.name) + '</span>'
      + (c.cancelled ? '<span class="dep-cancelled">innstilt</span>' : '')
      + '</div>';
  }).join('');
  return '<div class="spec-summary">'
    + (meta.lineCode ? '<span class="line-badge" style="background:' + (meta.lineBg || '#7c2d12') + '">' + esc(meta.lineCode) + '</span>' : '')
    + '<span class="tb-dest">' + esc(meta.dest || '') + '</span>'
    + (meta.cancelled
      ? '<span class="dep-cancelled">innstilt</span>'
      : meta.delayMins > 1 ? '<span class="dep-tag">+' + meta.delayMins + ' min</span>' : '')
    + '</div>'
    + '<div class="spec-stops">' + rows + '</div>';
}

function _load(id) {
  fetchJourneyMeta(id)
    .then(meta => {
      const result = document.getElementById('spec-result');
      if (!result) return;
      if (!meta || !meta.calls.length) {
        result.innerHTML = '<div class="status-error-msg">fant ingen reise med denne ID-en (kan være utløpt eller for en annen dag).</div>';
        if (intervals.spectate) { clearInterval(intervals.spectate); intervals.spectate = null; }
        return;
      }
      result.innerHTML = _resultHtml(meta);
    })
    .catch(() => {
      const result = document.getElementById('spec-result');
      if (result) result.innerHTML = '<div class="status-error-msg">kunne ikke hente reise.</div>';
    });
}

function _onSearch() {
  const inp = document.getElementById('spec-input');
  const id = inp && inp.value.trim();
  if (!id) return;
  const result = document.getElementById('spec-result');
  if (result) result.innerHTML = '<div class="hn-loading">søker…</div>';
  if (intervals.spectate) { clearInterval(intervals.spectate); intervals.spectate = null; }
  _load(id);
  intervals.spectate = setInterval(() => _load(id), config.trackRefreshMs);
}

export function toggleSpectatePanel() {
  const panel = document.getElementById('follow-jny-panel');
  if (!panel) return;
  _open = !_open;
  if (_open) {
    panel.style.display = 'block';
    panel.innerHTML = _formHtml();
    document.getElementById('spec-go').addEventListener('click', _onSearch);
    document.getElementById('spec-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') _onSearch();
    });
  } else {
    panel.style.display = 'none';
    panel.innerHTML = '';
    stopSpectate();
  }
}

export function stopSpectate() {
  if (intervals.spectate) { clearInterval(intervals.spectate); intervals.spectate = null; }
}
