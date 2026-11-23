// Live-probe (kjøres manuelt: kopier til tests/ og `STOPP=<id,id> npx vitest run …`). Teller retninger, bein og grunner per stopp mot ekte Entur.
import { it } from 'vitest';
import { boardGQL } from '../src/api/queries.js';
import { groupDirections, edderkoppBein } from '../src/views/auto.js';
import { stopsAhead } from '../src/ui/stoppVelger.js';
const STOPP = (process.env.STOPP || 'NSR:StopPlace:58368').split(',');
it('live', async () => {
  for (const id of STOPP) {
    const r = await fetch('https://api.entur.io/journey-planner/v3/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'ET-Client-Name': 'probe-dev' }, body: JSON.stringify({ query: boardGQL(id, 30, Date.now(), true) }) });
    const j = await r.json();
    const sp = j.data.stopPlace; const calls = sp.estimatedCalls;
    const dirs = groupDirections(calls, Date.now());
    const teller = {};
    const bein = edderkoppBein(dirs, sp.name, Date.now(), null, null, Infinity, { stopId: sp.id, teller });
    const c = calls.find(x => x.serviceJourney.line.transportMode === (process.env.MODUS || 'water')) || calls[0];
    const ec = (c.serviceJourney.estimatedCalls || []);
    console.log(sp.name, id, '| retninger', dirs.length, '| bein', bein.length, '| grunn', JSON.stringify(teller));
    console.log('  første kall:', c.serviceJourney.line.transportMode, c.serviceJourney.line.publicCode, '→', c.destinationDisplay.frontText, '| turens stopp:', ec.length, ec.slice(0, 4).map(x => x.quay ? ((x.quay.stopPlace && x.quay.stopPlace.name) || '?') + ' q=' + x.quay.latitude + ' sp=' + (x.quay.stopPlace && x.quay.stopPlace.latitude) : '(uten quay)').join(', '));
    console.log('  stopsAhead:', stopsAhead(c, sp.name, Date.now(), sp.id).length);
  }
}, 60000);
