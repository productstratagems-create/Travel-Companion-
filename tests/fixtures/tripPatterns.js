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

// Three transit legs (foot + metro + metro + bus) where bus lacks toEstimatedCall.
// _finalArrival must be computed from dep + duration.
export const threeLegsMetroBus = {
  duration: 2400,
  legs: [
    {
      mode: 'foot',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Mortensrud' },
      serviceJourney: null, fromEstimatedCall: null, toEstimatedCall: null,
    },
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Helsfyr' },
      serviceJourney: { id: 'RUT:ServiceJourney:3-100', line: { publicCode: '3', presentation: { colour: '8B0000' } } },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T09:00:00+02:00',
        aimedDepartureTime:    '2026-05-24T09:00:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Helsfyr' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T09:15:00+02:00',
        aimedArrivalTime:    '2026-05-24T09:15:00+02:00',
      },
    },
    {
      mode: 'metro',
      fromPlace: { name: 'Helsfyr' },
      toPlace: { name: 'Tøyen' },
      serviceJourney: { id: 'RUT:ServiceJourney:5-200', line: { publicCode: '5', presentation: { colour: '006600' } } },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-24T09:20:00+02:00',
        aimedDepartureTime:    '2026-05-24T09:20:00+02:00',
        realtime: false,
        quay: { publicCode: '2' },
        destinationDisplay: { frontText: 'Storo' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-24T09:27:00+02:00',
        aimedArrivalTime:    '2026-05-24T09:27:00+02:00',
      },
    },
    {
      mode: 'bus',
      fromPlace: { name: 'Tøyen' },
      toPlace: { name: 'Manglerud' },
      aimedStartTime:    '2026-05-24T07:32:00Z',
      expectedStartTime: '2026-05-24T07:32:00Z',
      aimedEndTime:      '2026-05-24T07:40:00Z',
      expectedEndTime:   '2026-05-24T07:40:00Z',
      serviceJourney: { id: 'RUT:ServiceJourney:23-300', line: { publicCode: '23', presentation: { colour: '004B87' } } },
      fromEstimatedCall: null,
      toEstimatedCall: null,
    },
  ],
};

// One transit leg followed by a walking leg to the final destination.
// Real-world example: Line 3 to Hellerud, then walk 12 min to Tveita T.
export const metroThenWalk = {
  duration: 1560,
  legs: [
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Hellerud' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-300',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-25T16:03:00+02:00',
        aimedDepartureTime:    '2026-05-25T16:03:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Kolsås' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-25T16:16:00+02:00',
        aimedArrivalTime:    '2026-05-25T16:16:00+02:00',
      },
    },
    {
      mode: 'foot',
      fromPlace: { name: 'Hellerud' },
      toPlace: { name: 'Tveita T' },
      serviceJourney: null,
      fromEstimatedCall: null,
      toEstimatedCall: null,
      aimedStartTime:    '2026-05-25T16:16:00+02:00',
      expectedStartTime: '2026-05-25T16:16:00+02:00',
      aimedEndTime:      '2026-05-25T16:29:00+02:00',
      expectedEndTime:   '2026-05-25T16:29:00+02:00',
    },
  ],
};

// Transit → platform walk → transit.
// Real-world example: Line 3 to Helsfyr, platform walk, Line 2 to Tveita.
export const metroFootBus = {
  duration: 1920,
  legs: [
    {
      mode: 'metro',
      fromPlace: { name: 'Mortensrud' },
      toPlace: { name: 'Helsfyr' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-400',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-25T16:03:00+02:00',
        aimedDepartureTime:    '2026-05-25T16:03:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Kolsås' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-25T16:21:00+02:00',
        aimedArrivalTime:    '2026-05-25T16:21:00+02:00',
      },
    },
    {
      mode: 'foot',
      fromPlace: { name: 'Helsfyr' },
      toPlace: { name: 'Helsfyr' },
      serviceJourney: null,
      fromEstimatedCall: null,
      toEstimatedCall: null,
      aimedStartTime:    '2026-05-25T16:21:00+02:00',
      expectedStartTime: '2026-05-25T16:21:00+02:00',
      aimedEndTime:      '2026-05-25T16:22:00+02:00',
      expectedEndTime:   '2026-05-25T16:22:00+02:00',
    },
    {
      mode: 'bus',
      fromPlace: { name: 'Helsfyr' },
      toPlace: { name: 'Tveita' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:2-500',
        line: { publicCode: '2', presentation: { colour: '00529B' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-25T16:29:00+02:00',
        aimedDepartureTime:    '2026-05-25T16:29:00+02:00',
        realtime: false,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Ellingsrudåsen' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-25T16:35:00+02:00',
        aimedArrivalTime:    '2026-05-25T16:35:00+02:00',
      },
    },
  ],
};

// Two transit legs with a walk at the end — the most complex realistic shape.
export const fullJourney = {
  duration: 2580,
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
      toPlace: { name: 'Helsfyr' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:3-600',
        line: { publicCode: '3', presentation: { colour: '8B0000' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-25T09:00:00+02:00',
        aimedDepartureTime:    '2026-05-25T09:00:00+02:00',
        realtime: true,
        quay: { publicCode: '1' },
        destinationDisplay: { frontText: 'Kolsås' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-25T09:15:00+02:00',
        aimedArrivalTime:    '2026-05-25T09:15:00+02:00',
      },
    },
    {
      mode: 'metro',
      fromPlace: { name: 'Helsfyr' },
      toPlace: { name: 'Tøyen' },
      serviceJourney: {
        id: 'RUT:ServiceJourney:2-700',
        line: { publicCode: '2', presentation: { colour: '00529B' } },
      },
      fromEstimatedCall: {
        expectedDepartureTime: '2026-05-25T09:20:00+02:00',
        aimedDepartureTime:    '2026-05-25T09:20:00+02:00',
        realtime: false,
        quay: { publicCode: '2' },
        destinationDisplay: { frontText: 'Ellingsrudåsen' },
      },
      toEstimatedCall: {
        expectedArrivalTime: '2026-05-25T09:30:00+02:00',
        aimedArrivalTime:    '2026-05-25T09:30:00+02:00',
      },
    },
    {
      mode: 'foot',
      fromPlace: { name: 'Tøyen' },
      toPlace: { name: 'Grønland' },
      serviceJourney: null,
      fromEstimatedCall: null,
      toEstimatedCall: null,
      aimedStartTime:    '2026-05-25T09:30:00+02:00',
      expectedStartTime: '2026-05-25T09:30:00+02:00',
      aimedEndTime:      '2026-05-25T09:43:00+02:00',
      expectedEndTime:   '2026-05-25T09:43:00+02:00',
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
