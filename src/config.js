export default {
  api: {
    journeyPlanner: 'https://api.entur.io/journey-planner/v3/graphql',
    geocoder: 'https://api.entur.io/geocoder/v1/autocomplete',
    geocoderReverse: 'https://api.entur.io/geocoder/v1/reverse',
    // Live vehicle positions (SIRI-VM). Separate service from the journey
    // planner, same ET-Client-Name requirement.
    vehicles: 'https://api.entur.io/realtime/v1/vehicles/graphql',
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
  /**
   * Supporting the app is voluntary, and buys nothing.
   *
   * A static host cannot keep a secret or verify anything, so a paywall here
   * would be theatre — every gate would live in a bundle the reader can read
   * and edit. What it CAN do honestly is say what the thing costs to run and
   * offer a way to help. No account, no badge, no unlocked feature: a status
   * the app cannot check is exactly the dishonesty the rest of it removes.
   *
   * Empty by default, and the whole section stays hidden until a link is set.
   */
  support: {
    /**
     * The ways to give, in the order they are offered.
     *
     * A list rather than fixed fields, so adding or swapping one is a config
     * line and not a code change — which matters because the Vipps artefact
     * itself is not settled: WHICH kind of Vipps link is available depends on
     * whether there is an organisation number behind it. Vipps-nummer, Vipps
     * på nett and the business QR all assume a company; without one there is
     * only a personal number or «Min QR», which publishes a private phone
     * number and is written for splitting bills rather than ongoing public
     * collection. Settle that before the link goes live — then paste it here.
     *
     * `qr` is inline SVG for the same URL, and only shown where tapping
     * cannot work. Generate it with:  node scripts/make-qr.mjs "<url>"
     */
    rails: [
      // { id: 'vipps', label: 'Vipps', url: 'https://qr.vipps.no/…', qr: '<svg …>' },
    ],
    // What it actually costs to run, in kroner per month. Concrete beats a
    // generic tip jar, and it is the same honesty as «ikke sanntid nå».
    costs: [
      { what: 'kartfliser', nok: 0 },
      { what: 'steds-oppslag', nok: 0 },
      { what: 'domene', nok: 0 },
    ],
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
