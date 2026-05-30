import config from './config.js';
import { state, intervals } from './state.js';
import { findArr } from './geo.js';
import { logMsg } from './ui/log.js';
import { updateOnboardChip } from './ui/chip.js';
import { show } from './ui/nav.js';
import { startBoard, stopBoard } from './views/board.js';
import { renderSelected, startSelRefresh, stopSelRefresh } from './views/selected.js';
import { buildTrackBar, startTracking } from './views/track.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

export function tap(i) {
  state.sel = state.deps[i];
  if (!state.sel) return;
  stopBoard();
  show('v-selected');
  const old = document.getElementById('s-ctas');
  if (old) old.remove();
  startSelRefresh();
  renderSelected();
}

export function doBoard() {
  const c = state.sel;
  if (!c) return;
  window._stopWalk && window._stopWalk();
  const dir = config.dirs[state.dIdx];
  const sj = c.serviceJourney;
  const lbg = sj && sj.line && sj.line.presentation && sj.line.presentation.colour;

  // Build legs[] from trip-planner legs, or fall back to single-leg board data
  const legs = [];
  if (c._legs && c._legs.length) {
    c._legs.forEach((leg, i) => {
      const legSj = leg.serviceJourney;
      const legLine = legSj && legSj.line;
      const legLbg = legLine && legLine.presentation && legLine.presentation.colour;
      const depT = leg.fromEstimatedCall && (leg.fromEstimatedCall.expectedDepartureTime || leg.fromEstimatedCall.aimedDepartureTime);
      const arrT = leg.toEstimatedCall && (leg.toEstimatedCall.expectedArrivalTime || leg.toEstimatedCall.aimedArrivalTime);
      const tr = c._transfers && c._transfers[i];
      legs.push({
        lineCode:    (legLine && legLine.publicCode) || '?',
        lineBg:      legLbg ? '#' + legLbg : '#7c2d12',
        frontText:   (leg.fromEstimatedCall && leg.fromEstimatedCall.destinationDisplay && leg.fromEstimatedCall.destinationDisplay.frontText) || leg.toPlace.name,
        journeyId:   legSj && legSj.id,
        fromStation: i === 0 ? dir.from : (c._transfers[i-1] && c._transfers[i-1].at) || dir.from,
        toStation:   tr ? tr.at : dir.to,
        depTime:     depT ? { time: depT, clk: clk(depT) } : null,
        arrTime:     arrT ? { time: arrT, clk: clk(arrT) } : null,
        quay:        (leg.fromEstimatedCall && leg.fromEstimatedCall.quay && leg.fromEstimatedCall.quay.publicCode) || null,
        stops:       [],
      });
    });
  } else {
    // Board route (single-leg, no trip planner)
    const sjc = sj && sj.estimatedCalls;
    const arr = findArr(sjc, dir.to);
    const arrT = arr && (arr.expectedArrivalTime || arr.aimedArrivalTime);
    const depT = c.expectedDepartureTime || c.aimedDepartureTime;
    legs.push({
      lineCode:    (sj && sj.line && sj.line.publicCode) || config.line,
      lineBg:      lbg ? '#' + lbg : '#7c2d12',
      frontText:   (c.destinationDisplay && c.destinationDisplay.frontText) || dir.to,
      journeyId:   sj && sj.id,
      fromStation: dir.from,
      toStation:   dir.to,
      depTime:     depT ? { time: depT, clk: clk(depT) } : null,
      arrTime:     arrT ? { time: arrT, clk: clk(arrT) } : null,
      quay:        (c.quay && c.quay.publicCode !== '?' && c.quay.publicCode) || null,
      stops:       sjc || [],
    });
  }

  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const finalArrival = lastLeg.arrTime || (c._finalArrival ? { time: c._finalArrival, clk: clk(c._finalArrival) } : null);

  state.jny = {
    dest:              dir.to,
    from:              dir.from,
    boardedAt:         Date.now(),
    lineCode:          firstLeg.lineCode,
    lineBg:            firstLeg.lineBg,
    frontText:         (c.destinationDisplay && c.destinationDisplay.frontText) || dir.to,
    firstLegFrontText: firstLeg.frontText,
    arrival:           finalArrival,
    legs,
  };
  saveJny();
  activateTracking();
}

export function activateTracking() {
  stopSelRefresh();
  buildTrackBar();
  logMsg('ombord L' + state.jny.lineCode + ' → ' + state.jny.dest + (state.jny.arrival ? ' (' + state.jny.arrival.clk + ')' : ''));
  state.sel = null;
  show('v-track');
  startTracking();
  updateOnboardChip();
}

export function saveJny() {
  try {
    localStorage.setItem(config.storage.journey, JSON.stringify({
      dest:              state.jny.dest,
      from:              state.jny.from,
      boardedAt:         state.jny.boardedAt,
      lineCode:          state.jny.lineCode,
      lineBg:            state.jny.lineBg,
      frontText:         state.jny.frontText,
      firstLegFrontText: state.jny.firstLegFrontText || null,
      arrival:           state.jny.arrival,
      legs: state.jny.legs.map(leg => ({
        lineCode:    leg.lineCode,
        lineBg:      leg.lineBg,
        frontText:   leg.frontText,
        journeyId:   leg.journeyId,
        fromStation: leg.fromStation,
        toStation:   leg.toStation,
        depTime:     leg.depTime,
        arrTime:     leg.arrTime,
        quay:        leg.quay,
      })),
    }));
  } catch {}
}

export function loadJny() {
  try {
    const raw = localStorage.getItem(config.storage.journey);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j.boardedAt || Date.now() - j.boardedAt > config.journeyMaxAgeMs) {
      localStorage.removeItem(config.storage.journey);
      return null;
    }
    // Old journeys without legs[] are incompatible — drop them
    if (!j.legs || !j.legs.length) {
      localStorage.removeItem(config.storage.journey);
      return null;
    }
    j.legs = j.legs.map(leg => ({ ...leg, stops: [] }));
    return j;
  } catch { return null; }
}

export function clearJny() {
  state.jny = null;
  try { localStorage.removeItem(config.storage.journey); } catch {}
}

// Window bridges used by HTML inline handlers and nav.js
window.tap = tap;
window.doBoard = doBoard;
window._clearJny = clearJny;
window._updateOnboardChip = updateOnboardChip;
window.jnyGoTracking = activateTracking;
