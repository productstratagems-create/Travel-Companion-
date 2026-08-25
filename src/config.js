export default {
  api: {
    journeyPlanner: 'https://api.entur.io/journey-planner/v3/graphql',
    geocoder: 'https://api.entur.io/geocoder/v1/autocomplete',
    geocoderReverse: 'https://api.entur.io/geocoder/v1/reverse',
    // Free Geoapify key — sign up at geoapify.com (no credit card, 3 000 req/day)
    // Set via VITE_GEOAPIFY_KEY env var (or replace '' here, but don't commit the key)
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
