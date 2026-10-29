export default {
  api: {
    journeyPlanner: 'https://api.entur.io/journey-planner/v3/graphql',
    geocoder: 'https://api.entur.io/geocoder/v1/autocomplete',
    geocoderReverse: 'https://api.entur.io/geocoder/v1/reverse',
    /* Live vehicle positions (SIRI-VM). Separate service from the journey
     * planner, same ET-Client-Name requirement.
     *
     * V2, MED V1 SOM FALLBACK. Appen sto på v1 mens tjenesten er på v2, og
     * v2 er der `occupancyStatus` og `delay` ligger — nettopp feltene som
     * `board.js` ellers regner seg fram til av klokkeslett og stoppnavn.
     * At v1 fortsatt svarer er ikke noe appen kan vite; en v1 kan skrus av
     * uten varsel, og da skal kartet miste sanntid, ikke alt.
     *
     * Hvilken av dem som faktisk svarer kan ikke prøves fra denne
     * sandkassen — den når ikke api.entur.io — så det er en stige, og
     * `vehicles.js` sier i loggen hvilket trinn som svarte. */
    vehicles: 'https://api.entur.io/realtime/v2/vehicles/graphql',
    vehiclesFallback: 'https://api.entur.io/realtime/v1/vehicles/graphql',
    /* Og de samme posisjonene som en strøm.
     *
     * En nettleser kan ikke sette HTTP-hoder på en WebSocket, så
     * `ET-Client-Name` må ligge i `connection_init`-nyttelasten og i
     * spørringsparameteren — begge gjetninger. Derfor er polling ikke en
     * sikkerhetsmargin her, men den forventede stien til noen har prøvd
     * dette på en ekte tur. Se `src/api/strom.js`. */
    vehiclesStream: 'wss://api.entur.io/realtime/v2/vehicles/subscriptions',
    // Geoapify key. Set via VITE_GEOAPIFY_KEY; CI injects it at build time.
    //
    // IT IS NOT A SECRET, and cannot be made one: Vite inlines the value, so
    // it ships as a plaintext string in the bundle on a static host — checked,
    // not assumed (a build with a dummy key contains the literal once).
    // The only real protection is to restrict the key to this domain in the
    // Geoapify console. On a paid plan that restriction is the difference
    // between a quota and a credit card.
    geoapifyKey: import.meta.env.VITE_GEOAPIFY_KEY || '',
  },
  // Fallback line label when a departure carries no publicCode.
  line: '',
  defaultWalkMinutes: 8,
  boardRefreshMs: 20_000,
  trackRefreshMs: 15_000,
  selRefreshMs: 15_000,
  renderTickMs: 1_000,
  journeyMaxAgeMs: 4 * 60 * 60 * 1000,
  // Below this much time to arrival, an arrival forecast says nothing the
  // current conditions don't. One value — it was 15 min in track, 20 in selected.
  arrivalForecastMinMs: 15 * 60_000,
  storage: {
    dir: 't.dir',
    // The active custom route, whole. Only the two names used to be kept, so
    // every start re-derived ids and coordinates from them.
    route: 't.route',
    // The trip home, set in the morning: a route plus a wall-clock departure
    // time. `retSkip` holds the day a switch was declined or overridden, so
    // the decision expires on its own without a timer.
    ret: 't.return',
    // Traffic messages the reader has put away: id → the severity it had at
    // the time, so an escalation can bring it back.
    alertHid: 't.alertHid',
    retSkip: 't.returnSkip',
    journey: 't.jny',
    favs: 't.favs',
  },
  // RegExp fields are intentionally JS (not JSON-serializable)
  dirs: [
    // Neutral central-Oslo fallback pair. Only ever seen if the user reverses
    // direction before setting their own route; dirs[2] holds the real one.
    {
      key: 'out',
      from: 'Jernbanetorget',
      to: 'Nationaltheatret',
      stopId: null,
      toStopId: null,
      filter: null,
      geo: 'Jernbanetorget',
      toGeo: 'Nationaltheatret',
      line: null,
    },
    {
      key: 'in',
      from: 'Nationaltheatret',
      to: 'Jernbanetorget',
      stopId: null,
      toStopId: null,
      filter: null,
      geo: 'Nationaltheatret',
      toGeo: 'Jernbanetorget',
      line: null,
    },
  ],
};
