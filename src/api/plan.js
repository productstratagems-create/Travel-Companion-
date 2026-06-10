const PLAN_KEY = 't.plan';

export function loadPlan() {
  try {
    const v = JSON.parse(localStorage.getItem(PLAN_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function savePlan(legs) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(legs)); } catch {}
}

export function clearPlan() {
  try { localStorage.removeItem(PLAN_KEY); } catch {}
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

export function legStatus(leg, now) {
  const dep = new Date(leg.depIso).getTime();
  const arr = leg.arrIso ? new Date(leg.arrIso).getTime() : dep + 30 * 60000;
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
