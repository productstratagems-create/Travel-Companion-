import config from '../config.js';
import { state, intervals } from '../state.js';
import { fetchJourneyMeta } from '../api/entur.js';
import { joinJourney } from '../journey.js';
import { logMsg } from '../ui/log.js';
import { esc } from '../ui/fmt.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

let _activePanel = null;
let _lastMeta = null;

/**
 * Share your own journey.
 *
 * The reise-ID is not debug output: it exists so someone else can paste it
 * into the form below and follow you. It used to hold a permanent row on the
 * underveis screen showing 24 opaque characters, which is a lot of a screen
 * read while walking for something used once in a while. It lives here now,
 * beside the form it is meant to be pasted into — one place for both
 * directions of the same feature.
 */
function _shareHtml() {
  if (!state.lockedJourneyId) return '';
  return '<div class="spec-share">'
    + '<span class="spec-share-label">del reisen din</span>'
    + '<button class="spec-go-btn" id="spec-share-btn" type="button">kopier reise-ID</button>'
    + '<div id="spec-share-msg" role="status" class="status-ok-msg" style="display:none"></div>'
    + '</div>';
}

/** Copy the reise-ID for someone else to paste into the form below. */
function copyJourneyId(msgId) {
  const jid = state.lockedJourneyId;
  const msg = document.getElementById(msgId || 'spec-share-msg');
  if (!jid || !msg) return;
  const showMsg = text => {
    msg.textContent = text;
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(jid)
      .then(() => showMsg('✓ kopiert'))
      .catch(() => showMsg(jid));
  } else {
    showMsg(jid);
  }
}

function _formHtml() {
  return _shareHtml()
    + '<div class="spec-form">'
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
    + '<button class="spec-track-btn" id="spec-track" type="button">spor denne reisen →</button>'
    + '<div class="spec-stops">' + rows + '</div>';
}

function _load(id) {
  fetchJourneyMeta(id)
    .then(meta => {
      const result = document.getElementById('spec-result');
      if (!result) return;
      if (!meta || !meta.calls.length) {
        _lastMeta = null;
        result.innerHTML = '<div class="status-error-msg">fant ingen reise med denne ID-en (kan være utløpt eller for en annen dag).</div>';
        logMsg('finn reise: ingen treff for ' + id, 'err');
        if (intervals.spectate) { clearInterval(intervals.spectate); intervals.spectate = null; }
        return;
      }
      _lastMeta = meta;
      result.innerHTML = _resultHtml(meta);
    })
    .catch(err => {
      const result = document.getElementById('spec-result');
      if (result) result.innerHTML = '<div class="status-error-msg">kunne ikke hente reise: ' + esc(err.message) + '</div>';
      logMsg('finn reise ✗ ' + err.message, 'err');
      if (intervals.spectate) { clearInterval(intervals.spectate); intervals.spectate = null; }
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

export function closeSpectatePanel() {
  if (_activePanel) {
    _activePanel.style.display = 'none';
    _activePanel.innerHTML = '';
    _activePanel = null;
  }
  _lastMeta = null;
  stopSpectate();
}

function _populatePanel(panel) {
  panel.style.display = 'block';
  panel.innerHTML = _formHtml();
  document.getElementById('spec-go').addEventListener('click', _onSearch);
  const shareBtn = document.getElementById('spec-share-btn');
  if (shareBtn) shareBtn.addEventListener('click', () => copyJourneyId('spec-share-msg'));
  document.getElementById('spec-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _onSearch();
  });
  document.getElementById('spec-result').addEventListener('click', e => {
    if (!e.target.closest('#spec-track') || !_lastMeta) return;
    let toIdx = _lastMeta.calls.length - 1;
    while (toIdx > 0 && _lastMeta.calls[toIdx].cancelled) toIdx--;
    joinJourney(_lastMeta, toIdx);
    closeSpectatePanel();
  });
}

/**
 * Toggle the "finn reise" lookup panel. Each view that offers this shortcut
 * has its own panel container (only one is ever open at a time).
 */
export function toggleSpectatePanel(panelId) {
  const panel = document.getElementById(panelId || 'follow-jny-panel');
  if (!panel) return;
  if (_activePanel === panel) {
    closeSpectatePanel();
    return;
  }
  closeSpectatePanel();
  _activePanel = panel;
  _populatePanel(panel);
}

/**
 * Render the "finn reise" lookup form directly into a container (no toggle).
 * Used by the unified "Lagret" view's "finn reise" tab.
 */
export function renderSpectateInline(containerId) {
  const panel = document.getElementById(containerId);
  if (!panel) return;
  closeSpectatePanel();
  _activePanel = panel;
  _populatePanel(panel);
}

export function stopSpectate() {
  if (intervals.spectate) { clearInterval(intervals.spectate); intervals.spectate = null; }
}
