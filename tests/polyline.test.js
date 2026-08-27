import { describe, it, expect } from 'vitest';
import { decodePolyline } from '../src/ui/polyline.js';

describe('decodePolyline', () => {
  // The sample from Google's own encoded-polyline documentation.
  it('decodes a precision-5 string, which is what OTP returns', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(pts).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });

  // Valhalla uses precision 6. This is the existing walking-route behaviour and
  // must not change when the precision became an argument.
  it('decodes a precision-6 string, which is what Valhalla returns', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 6);
    expect(pts).toEqual([[3.85, -12.02], [4.07, -12.095], [4.3252, -12.6453]]);
  });

  it('defaults to precision 5, the transit case', () => {
    expect(decodePolyline('_p~iF~ps|U')).toEqual(decodePolyline('_p~iF~ps|U', 5));
  });

  // The fallback to stop-to-stop lines is most of what makes this safe to
  // ship without being able to reach the API, so the decoder must not throw
  // its callers into a broken map on a missing or junk value.
  it('returns an empty array rather than throwing on nothing usable', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline(undefined)).toEqual([]);
    expect(decodePolyline(42)).toEqual([]);
  });
});

import { legShape } from '../src/api/adapt.js';

describe('legShape', () => {
  const ENC = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

  it('decodes a raw OTP leg', () => {
    expect(legShape({ pointsOnLink: { points: ENC } })).toHaveLength(3);
  });

  it('decodes a journey leg that persisted the encoded string', () => {
    // loadJny strips stops[] on restore, so without this the underveis map
    // would drop to straight lines after every reload.
    expect(legShape({ shape: ENC })).toHaveLength(3);
  });

  // The render loop runs at 1 Hz and a full metro alignment is a few thousand
  // points, so this must decode once per leg, not once per frame.
  it('caches on the leg rather than decoding every call', () => {
    const leg = { pointsOnLink: { points: ENC } };
    const a = legShape(leg);
    expect(legShape(leg)).toBe(a);
    expect(leg._shape).toBe(a);
  });

  // Every caller reads null as "fall back to stop-to-stop", which is what
  // makes this safe to ship without being able to reach the API.
  it('returns null for anything that is not a drawable line', () => {
    expect(legShape(null)).toBeNull();
    expect(legShape({})).toBeNull();
    expect(legShape({ pointsOnLink: null })).toBeNull();
    expect(legShape({ pointsOnLink: { points: '' } })).toBeNull();
    expect(legShape({ shape: '_p~iF~ps|U' })).toBeNull();   // one point is not a line
  });
});
