import { storage } from '../storage.js';

const PLAN_KEY = 't.plan';

export function loadPlan() {
  try {
    const v = JSON.parse(storage.get(PLAN_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function savePlan(legs) {
  storage.set(PLAN_KEY, JSON.stringify(legs));
}

export function clearPlan() {
  storage.remove(PLAN_KEY);
}

export function addLegToPlan(c, dir) {
  const legs = loadPlan();
  const depIso = c.expectedDepartureTime;
  const serviceJourneyId = (c.serviceJourney && c.serviceJourney.id) || null;
  if (legs.some(l => serviceJourneyId ? l.serviceJourneyId === serviceJourneyId : l.depIso === depIso)) return false;
  const ln = c.serviceJourney && c.serviceJourney.line;
  const line = (ln && ln.publicCode) || '?';
  const lineColour = (ln && ln.presentation && ln.presentation.colour) || '7c2d12';
  const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || dir.to;
  const arrIso = c._finalArrival || null;
  legs.push({
    id: 'leg_' + Date.now(),
    line, lineColour,
    from: dir.from,
    to: dest,
    depIso,
    arrIso,
    serviceJourneyId,
    addedAt: Date.now(),
  });
  savePlan(legs);
  return true;
}

export function removeLegFromPlan(id) {
  savePlan(loadPlan().filter(l => l.id !== id));
}

/**
 * How long a leg is assumed to last when the board gave no arrival.
 *
 * It was written out as `30 * 60000` here and nowhere else — until the
 * calendar export needed the same number for DTEND. Two hand-written copies
 * of one assumption is the fault this codebase keeps finding, so it has a
 * name before the second reader exists.
 */
export const LEG_FALLBACK_MINS = 30;

export function legStatus(leg, now) {
  const dep = new Date(leg.depIso).getTime();
  const arr = leg.arrIso ? new Date(leg.arrIso).getTime() : dep + LEG_FALLBACK_MINS * 60000;
  if (arr <= now) return 'done';
  if (dep <= now) return 'active';
  return 'future';
}

export function planStatus(legs, now) {
  if (!legs.length) return 'empty';
  if (legs.every(l => legStatus(l, now) === 'done')) return 'done';
  if (new Date(legs[0].depIso).getTime() > now) return 'future';
  return 'active';
}

export function isLegInPlan(depIso, serviceJourneyId) {
  return loadPlan().some(l => serviceJourneyId ? l.serviceJourneyId === serviceJourneyId : l.depIso === depIso);
}
