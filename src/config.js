export default {
  api: {
    journeyPlanner: 'https://api.entur.io/journey-planner/v3/graphql',
    geocoder: 'https://api.entur.io/geocoder/v1/autocomplete',
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
  },
  // RegExp fields are intentionally JS (not JSON-serializable)
  dirs: [
    {
      key: 'out',
      from: 'Mortensrud',
      to: 'Jernbanetorget',
      stopId: 'NSR:StopPlace:5687',
      filter: null,
      geo: null,
      line: '3',
    },
    {
      key: 'in',
      from: 'Jernbanetorget',
      to: 'Mortensrud',
      stopId: null,
      filter: /mortensrud/i,
      geo: 'Jernbanetorget',
      line: '3',
    },
  ],
};
