/**
 * Testruter: foreslår appen gode reiser på tvers av transportmidler?
 *
 * Hver rute er et spørsmål en ekte bruker stiller, med det et rimelig svar
 * må inneholde. Stoppested-ID-ene er slått opp i Enturs geokoder
 * (2026-11-03) og skrevet inn, så rutene ikke avhenger av geokoderen.
 *
 * `forventer`: minst ett av disse transportmidlene på reisen som kommer
 * først fram. Ekspressbuss står som `bus`, fordi `adaptTripPattern` gjør
 * `coach` om til `bus` før tavla ser den.
 *
 * Tidene er faste, så avspillingen er stabil: en hverdag i rushet og en
 * lørdagskveld. Lørdagen er der fordi glisne kvelder er der appen oftest
 * ville mistet en reise uten å si det.
 */
export const HVERDAG = Date.parse('2026-11-04T07:00:00Z');   // onsdag 08:00
export const LØRDAG = Date.parse('2026-11-07T21:00:00Z');    // lørdag 22:00

export const RUTER = [
  /* Buss 71 er raskere enn T-banen om morgenen (21 mot 25 min, målt mot
   * Entur 2026-11-03). Den raskeste er det riktige svaret, så begge
   * godtas. Regelen «ikke dårligere enn Entur» passer på at T-banen ikke
   * forsvinner når den ER raskest. */
  { id: 'mortensrud-jernbanetorget', navn: 'Mortensrud → Jernbanetorget', tester: 'T-bane eller buss, direkte',
    fra: { stopId: 'NSR:StopPlace:58228' }, til: { toStopId: 'NSR:StopPlace:58366' },
    forventer: ['metro', 'bus'], maxBytter: 0, maxGangM: 300 },
  { id: 'oslos-lillestrom', navn: 'Oslo S → Lillestrøm', tester: 'tog',
    fra: { stopId: 'NSR:StopPlace:59872' }, til: { toStopId: 'NSR:StopPlace:62339' },
    forventer: ['rail'], maxBytter: 0, maxGangM: 300 },
  { id: 'jernbanetorget-torshov', navn: 'Jernbanetorget → Torshov', tester: 'trikk',
    fra: { stopId: 'NSR:StopPlace:58366' }, til: { toStopId: 'NSR:StopPlace:58256' },
    forventer: ['tram', 'bus'], maxBytter: 0, maxGangM: 300 },
  /* IT Fornebu, ikke «Fornebu» (NSR:StopPlace:3625): det har ingen
   * avganger, så Entur lot deg gå 500–800 m det siste stykket. Målt. */
  { id: 'lysaker-fornebu', navn: 'Lysaker → IT Fornebu', tester: 'buss',
    fra: { stopId: 'NSR:StopPlace:58856' }, til: { toStopId: 'NSR:StopPlace:3609' },
    forventer: ['bus'], maxBytter: 1, maxGangM: 500 },
  { id: 'akerbrygge-nesoddtangen', navn: 'Aker brygge → Nesoddtangen', tester: 'båt',
    fra: { stopId: 'NSR:StopPlace:58382' }, til: { toStopId: 'NSR:StopPlace:58368' },
    forventer: ['water'], maxBytter: 0, maxGangM: 300 },
  { id: 'mortensrud-torshov', navn: 'Mortensrud → Torshov', tester: 'bytte mellom transportmidler',
    fra: { stopId: 'NSR:StopPlace:58228' }, til: { toStopId: 'NSR:StopPlace:58256' },
    forventer: ['metro', 'bus', 'tram'], maxBytter: 2, maxGangM: 800 },
  { id: 'oslos-gardermoen', navn: 'Oslo S → Oslo lufthavn', tester: 'tog til flyplass',
    fra: { stopId: 'NSR:StopPlace:59872' }, til: { toStopId: 'NSR:StopPlace:58211' },
    forventer: ['rail'], maxBytter: 0, maxGangM: 300 },
  { id: 'bergen-stavanger', navn: 'Bergen busstasjon → Stavanger bussterminal', tester: 'ekspressbuss (coach)',
    fra: { stopId: 'NSR:StopPlace:62356' }, til: { toStopId: 'NSR:StopPlace:59853' },
    forventer: ['bus'], maxBytter: 2, maxGangM: 800 },
  { id: 'bergen-flesland', navn: 'Bergen stasjon → Bergen lufthavn', tester: 'bybane',
    fra: { stopId: 'NSR:StopPlace:59983' }, til: { toStopId: 'NSR:StopPlace:58536' },
    forventer: ['tram', 'bus'], maxBytter: 1, maxGangM: 600 },
  { id: 'trondheim-vaernes', navn: 'Trondheim S → Trondheim lufthavn', tester: 'tog eller flybuss',
    fra: { stopId: 'NSR:StopPlace:59977' }, til: { toStopId: 'NSR:StopPlace:59261' },
    forventer: ['rail', 'bus'], maxBytter: 1, maxGangM: 500 },
  { id: 'tasen-oslos', navn: 'Adresse på Tåsen → Oslo S', tester: 'koordinat som start, gange inn',
    fra: { _fromLat: 59.9530, _fromLon: 10.7480 }, til: { toStopId: 'NSR:StopPlace:59872' },
    forventer: ['metro', 'bus', 'tram', 'rail'], maxBytter: 2, maxGangM: 1500 },
  { id: 'hareid-alesund', navn: 'Hareid kai → Ålesund sentrum', tester: 'distrikt, båt og buss, koordinat som mål',
    fra: { stopId: 'NSR:StopPlace:60039' }, til: { _toLat: 62.4723, _toLon: 6.1549 },
    forventer: ['water', 'bus'], maxBytter: 2, maxGangM: 1500 },
  /* «OGSÅ VIA» (v1.213.0). Brukerens egen rute: 3 → Hellerud → 2 → Tveita →
   * 69. Entur foreslår den aldri av seg selv (samme ankomst som reiser med
   * færre bytter), men den finnes via Hellerud. Med `viaOgså` skal både den
   * og Enturs beste uten via være med. Torsdag 08:05, da den ble målt. */
  { id: 'mortensrud-lutvann-via', navn: 'Mortensrud → Lutvann skole, også via Hellerud', tester: 'via som ønske, ikke krav',
    fra: { stopId: 'NSR:StopPlace:58228' }, til: { toStopId: 'NSR:StopPlace:6207' },
    ekstra: { via: 'Hellerud', viaStopId: 'NSR:StopPlace:58198', viaOgså: true },
    tider: [['torsdag', Date.parse('2026-11-05T07:05:00Z')]],
    forventer: ['metro', 'bus'], maxBytter: 2, maxGangM: 800,
    måHa: ['metro:3>metro:2>bus:69'] },
];
