/**
 * Stoppet selv — fra Nasjonalt stoppestedsregister.
 *
 * Appen kjenner i dag et stopp som et NAVN og en KOORDINAT. Alt annet om det
 * er utledet av strenger:
 *
 *     board.js:209   c.quay.name.replace(/^.*?\s/, '')
 *
 * Det er «hvilken plattform» besvart med et regulært uttrykk på et navn.
 * «Jernbanetorget 2» blir «2», som er riktig; «Oslo S spor 5» blir «S spor
 * 5», som ikke er det. Og `queries.js` sier det rett ut om reiseplanleggeren:
 * «`quays` and `transportMode` on StopPlace cannot be checked from here».
 *
 * Registeret har svaret — kaier med sin egen `publicCode`, og en
 * tilgjengelighetsvurdering per stopp.
 *
 * TRINNFRI ADKOMST ER DEN OPPLYSNINGEN APPEN MANGLER MEST, målt mot
 * visjonens egen fase-tabell: «hvor er stoppet, hvordan kommer jeg dit» er
 * den fasen med minst data bak seg. En som triller barnevogn eller rullestol
 * trenger å vite det FØR hun går fjorten minutter.
 *
 * SKJEMAET KAN IKKE LESES HERFRA. `api.entur.io` og `developer.entur.no`
 * svarer 403 gjennom denne sandkassens proxy. Feltnavnene under er fra
 * NeTEx' egen modell, som registeret er bygd på — men det er modellen, ikke
 * skjemaet. Derfor: ett forsøk, avslag husket for økta, og «vet-ikke» som
 * det ærlige svaret. Appen er nøyaktig der den var før, om det slår feil.
 */
import config from '../config.js';
import { enturFetch } from './http.js';
import { logMsg } from '../ui/log.js';

/**
 *   trinnfri       registeret sier at du kommer inn uten trapp
 *   ikke-trinnfri  registeret sier at du ikke gjør det
 *   vet-ikke       ikke spurt, ikke svart, eller svart «ukjent»
 *
 * «vet-ikke» og «ikke-trinnfri» er IKKE samme setning, og det er hele
 * grunnen til at dette er en navngitt dom og ikke en boolsk verdi. Å vise
 * «ikke trinnfri» for et stopp ingen har vurdert ville vært en påstand appen
 * ikke har dekning for — og den ville sendt noen en helt annen vei.
 */
export const KINDS = ['trinnfri', 'ikke-trinnfri', 'vet-ikke'];

/**
 * NeTEx' `LimitationStatusEnumeration`, som en dom.
 *
 * `unknown` er et eget svar i modellen, og det betyr «ingen har vurdert
 * dette» — ikke «nei». De to må ikke slås sammen.
 */
export function tilgang(a) {
  const l = a && a.limitations && (Array.isArray(a.limitations) ? a.limitations[0] : a.limitations);
  const v = l && (l.stepFreeAccess || l.wheelchairAccess);
  if (v === 'TRUE' || v === 'true') return { kind: 'trinnfri', ord: 'trinnfri' };
  if (v === 'FALSE' || v === 'false') return { kind: 'ikke-trinnfri', ord: 'ikke trinnfri' };
  return { kind: 'vet-ikke', ord: '' };
}

export function stoppestedGQL(stopId) {
  return '{stopPlace(id:"' + stopId + '"){'
    + 'id name{value} '
    + 'quays{id publicCode} '
    + 'accessibilityAssessment{limitations{wheelchairAccess stepFreeAccess}}'
    + '}}';
}

/**
 * Svaret, normalisert.
 *
 * `quays` som et oppslag id → publicCode, fordi det er det ENE spørsmålet
 * `_rowQuay` stiller. En rå liste ville tvunget hvert kallested til å lete
 * selv, og to steder som leter på hver sin måte er feilformen dette repoet
 * har rettet rundt tjuefem ganger.
 */
export function parseStoppested(json) {
  const sp = json && json.data && json.data.stopPlace;
  const liste = Array.isArray(sp) ? sp[0] : sp;
  if (!liste) return null;
  const kaier = new Map();
  (liste.quays || []).forEach(q => {
    if (q && q.id && q.publicCode) kaier.set(q.id, String(q.publicCode));
  });
  return { kaier, tilgang: tilgang(liste.accessibilityAssessment) };
}

const _cache = new Map();      // stopId -> {kaier, tilgang} | null
const _underveis = new Map();
let _avslått = false;

/** Det vi vet om stoppet nå, eller `undefined` om det aldri er spurt. */
export function stoppestedKjent(stopId) { return _cache.get(stopId); }

/** For prøvene: glem alt, inkludert at registeret sa nei. */
export function _resetStoppested() {
  _cache.clear(); _underveis.clear(); _avslått = false;
}

/**
 * @param {string} stopId  NSR:StopPlace:…
 * @returns {Promise<object|null>} aldri avvist; `null` betyr «vet ikke»
 */
export function hentStoppested(stopId) {
  if (!stopId || !config.api.stopPlaces) return Promise.resolve(null);
  if (_cache.has(stopId)) return Promise.resolve(_cache.get(stopId));
  if (_underveis.has(stopId)) return _underveis.get(stopId);
  // Avslag huskes for ØKTA, ikke for alltid: en ny innlasting prøver igjen,
  // så den dagen registeret svarer begynner det å virke uten at noen rører
  // koden. Samme form som `_perLineRejected` og `_shapeUnsupported`.
  if (_avslått) return Promise.resolve(null);

  const p = enturFetch(config.api.stopPlaces, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: stoppestedGQL(stopId) }),
  })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => {
      // Et ukjent felt gir HTTP 200 med `{errors, data:null}`. Det er ikke
      // «stoppet finnes ikke», det er «spørsmålet gikk ikke inn».
      if (j && !j.data && j.errors) throw new Error('gql');
      const ut = parseStoppested(j);
      if (ut) logMsg('stoppested: ' + ut.kaier.size + ' kaier, adkomst '
        + (ut.tilgang.ord || 'ukjent'), 'ok');
      return ut;
    })
    .catch(() => {
      if (!_avslått) {
        _avslått = true;
        logMsg('stoppestedsregisteret svarer ikke — plattform og adkomst som før', 'err');
      }
      return null;
    })
    .then(ut => { _cache.set(stopId, ut); _underveis.delete(stopId); return ut; });

  _underveis.set(stopId, p);
  return p;
}
