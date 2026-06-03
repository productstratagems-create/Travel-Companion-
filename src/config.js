export default {
  api: {
    journeyPlanner: 'https://api.entur.io/journey-planner/v3/graphql',
    geocoder: 'https://api.entur.io/geocoder/v1/autocomplete',
    geocoderReverse: 'https://api.entur.io/geocoder/v1/reverse',
    // Free Geoapify key — sign up at geoapify.com (no credit card, 3 000 req/day)
    geoapifyKey: '',
  },
  line: '3',
  home: {
    query: 'Stenbråtveien 81 Oslo',
    label: 'Stenbråtveien 81',
  },
  defaultWalkMinutes: 8,
  boardRefreshMs: 20_000,
  trackRefreshMs: 15_000,
  selRefreshMs: 15_000,
  renderTickMs: 1_000,
  journeyMaxAgeMs: 4 * 60 * 60 * 1000,
  storage: {
    dir: 't.dir',
    journey: 't.jny',
    favs: 't.favs',
  },
  // RegExp fields are intentionally JS (not JSON-serializable)
  dirs: [
    {
      key: 'out',
      from: 'Mortensrud',
      to: 'Jernbanetorget',
      stopId: 'NSR:StopPlace:58228',
      toStopId: null,
      filter: null,
      geo: null,
      toGeo: null,
      line: '3',
    },
    {
      key: 'in',
      from: 'Jernbanetorget',
      to: 'Mortensrud',
      stopId: null,
      toStopId: null,
      filter: /mortensrud/i,
      geo: 'Jernbanetorget',
      toGeo: null,
      line: '3',
    },
  ],
};
