import { it } from 'vitest';
import { boardGQL } from '../src/api/queries.js';
import { groupDirections } from '../src/views/auto.js';
import { målområder } from '../src/maalomrader.js';
import { stopsAhead } from '../src/ui/stoppVelger.js';
import { hentDelområde, områdeTekster } from '../src/api/omrade.js';
const post = q => fetch('https://api.entur.io/journey-planner/v3/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'ET-Client-Name': 'probe-dev' }, body: JSON.stringify({ query: q }) }).then(r => r.json());
it('live', async () => {
  for (const tekst of ['Mortensrud', 'Nesttun terminal', 'Ranheim', 'Tretten', 'Stenbråten']) {
    const g = await (await fetch('https://api.entur.io/geocoder/v1/autocomplete?text=' + encodeURIComponent(tekst) + '&layers=venue&size=1', { headers: { 'ET-Client-Name': 'probe-dev' } })).json();
    const id = g.features[0].properties.id;
    const sp = (await post(boardGQL(id, 40, Date.now(), true))).data.stopPlace;
    const here = { lat: sp.latitude, lon: sp.longitude };
    const dirs = groupDirections(sp.estimatedCalls, Date.now());
    const omr = målområder(dirs, here, d => stopsAhead(d.call, sp.name, Date.now(), sp.id), d => d.frontText + '|' + (d.lines[0] && d.lines[0].code));
    const her = await hentDelområde(here);
    const stoppMedNavn = o => { for (const d of dirs) { const st = stopsAhead(d.call, sp.name, Date.now(), sp.id).find(x => x.name === o.navn || x.name.startsWith(o.navn)); if (st) return st; } return o.fjern; };
    const navn = await Promise.all(omr.map(o => hentDelområde(stoppMedNavn(o))));
    const t = områdeTekster(omr, new Map(omr.map((o, i) => [o.id, navn[i]])), her);
    console.log(sp.name, '(her: ' + her + ')', '|', omr.map((o, i) => '«mot ' + o.navn + '» → «' + t.get(o.id) + '»').join(' ; ') || '(ingen målområder)');
  }
}, 120000);
