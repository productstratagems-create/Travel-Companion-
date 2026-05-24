// Raw Entur tripPattern objects as returned by the journey planner API.
// Used as fixtures for adaptTripPattern tests.

export const oneLeMetro = {
  duration: 1320,
  legs: [
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Jernbanetorget' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-123456',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T08:00:00+02:00',
        aimedDepartureTime:    '2026-05-24T08:00:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Jernbanetorget' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T08:22:00+02:00',
        aimedArrivalTime:    '2026-05-24T08:22:00+02:00',
      },
    },
  ],
};

// Two transit legs separated by a foot leg (which must be stripped)
export const twoLegTransfer = {
  duration: 1800,
  legs: [
    {
      mode: 'foot',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Mortensrud' },
      serviceJourney: null,
      fromEstimatedCall: null,
      toEstimatedCall: null,
    },
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Brynseng' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-111',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T08:00:00+02:00',
        aimedDepartureTime:    '2026-05-24T08:00:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Ellingsrudåsen' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T08:10:00+02:00',
        aimedArrivalTime:    '2026-05-24T08:10:00+02:00',
      },
    },
    {
      mode: 'metro',
      fromPlace: { name: 'Brynseng' },
      toPlace: { name: 'Jernbanetorget' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:2-222',
        line: { publicCode: '2', presentation: { colour: '00529B' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T08:15:00+02:00',
        aimedDepartureTime:    '2026-05-24T08:15:00+02:00',
        realtime: false,
        quay: { publicCode: '2' },
        destinationDisplay: { frontText: 'Østerås' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T08:30:00+02:00',
        aimedArrivalTime:    '2026-05-24T08:30:00+02:00',
      },
    },
  ],
};

// fromEstimatedCall is null — real Entur data gap; must return null
export const noFromEstimatedCall = {
  duration: 1200,
  legs: [
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Jernbanetorget' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-000',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: null,
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T08:22:00+02:00',
        aimedArrivalTime:    '2026-05-24T08:22:00+02:00',
      },
    },
  ],
};

// toPlace is null — can occur on some Entur routes; must return null
export const noToPlace = {
  duration: 1200,
  legs: [
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: null,
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-001',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T08:00:00+02:00',
        aimedDepartureTime:    '2026-05-24T08:00:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Jernbanetorget' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T08:22:00+02:00',
        aimedArrivalTime:    '2026-05-24T08:22:00+02:00',
      },
    },
  ],
};

// toPlace exists but name is undefined AND toEstimatedCall is null — must return null
export const toPlaceNameUndefined = {
  duration: 1200,
  legs: [
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: undefined },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-002',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T08:00:00+02:00',
        aimedDepartureTime:    '2026-05-24T08:00:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Jernbanetorget' },
      },
      toEstimatedCall: null,
    },
  ],
};

// Transfer where the first transit leg's toPlace.name is undefined — must return null
// This is the crash that caused t.at.toLowerCase() TypeError in renderBoard
export const transferWithUndefinedAt = {
  duration: 1500,
  legs: [
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: undefined },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-010',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T08:00:00+02:00',
        aimedDepartureTime:    '2026-05-24T08:00:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Brynseng' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T08:10:00+02:00',
        aimedArrivalTime:    '2026-05-24T08:10:00+02:00',
      },
    },
    {
      mode: 'metro',
      fromPlace: { name: 'Brynseng' },
      toPlace: { name: 'Jernbanetorget' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:2-020',
        line: { publicCode: '2', presentation: { colour: '00529B' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T08:15:00+02:00',
        aimedDepartureTime:    '2026-05-24T08:15:00+02:00',
        realtime: false,
        quay: { publicCode: '2' },
        destinationDisplay: { frontText: 'Østerås' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T08:30:00+02:00',
        aimedArrivalTime:    '2026-05-24T08:30:00+02:00',
      },
    },
  ],
};

// All foot — must return null
export const allFoot = {
  duration: 300,
  legs: [
    {
      mode: 'foot',
      fromPlace: { name: 'A' },
      toPlace: { name: 'B' },
      serviceJourney: null,
      fromEstimatedCall: null,
      toEstimatedCall: null,
    },
  ],
};
