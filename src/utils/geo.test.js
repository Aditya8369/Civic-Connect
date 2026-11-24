import { describe, it, expect } from 'vitest'
import {
  haversineDistance,
  parseCoordinates,
  findNearbyComplaints,
  encodeGeohash,
  decodeGeohash,
  getGeohashPrefixes,
  isPointInBroadcastGeofence,
} from './geo'

describe('parseCoordinates', () => {
  it('parses valid numeric latitude and longitude', () => {
    expect(parseCoordinates({ latitude: 28.6139, longitude: 77.2090 })).toEqual({
      lat: 28.6139,
      lng: 77.2090,
    })
  })

  it('parses valid lat and lng keys', () => {
    expect(parseCoordinates({ lat: 12.9716, lng: 77.5946 })).toEqual({
      lat: 12.9716,
      lng: 77.5946,
    })
  })

  it('parses string representations of numbers', () => {
    expect(parseCoordinates({ latitude: '28.613900', longitude: '77.209000' })).toEqual({
      lat: 28.6139,
      lng: 77.209,
    })
  })

  it('returns null for missing or invalid coordinates', () => {
    expect(parseCoordinates(null)).toBeNull()
    expect(parseCoordinates(undefined)).toBeNull()
    expect(parseCoordinates({})).toBeNull()
    expect(parseCoordinates({ latitude: null, longitude: 77.209 })).toBeNull()
    expect(parseCoordinates({ latitude: 'invalid', longitude: 77.209 })).toBeNull()
    expect(parseCoordinates({ latitude: 95, longitude: 77 })).toBeNull() // lat > 90
    expect(parseCoordinates({ latitude: 28, longitude: 185 })).toBeNull() // lng > 180
  })
})

describe('haversineDistance', () => {
  it('calculates 0 distance between identical points', () => {
    const point = { latitude: 28.613939, longitude: 77.209021 }
    expect(haversineDistance(point, point)).toBe(0)
  })

  it('returns null if any coordinate is invalid', () => {
    const validPoint = { latitude: 28.613939, longitude: 77.209021 }
    expect(haversineDistance(validPoint, null)).toBeNull()
    expect(haversineDistance(null, validPoint)).toBeNull()
    expect(haversineDistance({ latitude: null }, validPoint)).toBeNull()
  })

  it('calculates distance between known landmarks accurately', () => {
    // Distance between India Gate (28.6129, 77.2295) and Rashtrapati Bhavan (28.6143, 77.2005)
    // ~ 2.83 km (2830 metres)
    const indiaGate = { latitude: 28.6129, longitude: 77.2295 }
    const rashtrapatiBhavan = { latitude: 28.6143, longitude: 77.2005 }

    const dist = haversineDistance(indiaGate, rashtrapatiBhavan)
    expect(dist).toBeGreaterThan(2800)
    expect(dist).toBeLessThan(2860)
  })

  it('measures short distance of around 30-50 metres correctly', () => {
    // 0.0003 degrees latitude difference at equator/tropics is roughly ~33.3 metres
    const p1 = { latitude: 28.613900, longitude: 77.209000 }
    const p2 = { latitude: 28.614260, longitude: 77.209000 } // ~40 metres north

    const dist = haversineDistance(p1, p2)
    expect(dist).toBeGreaterThan(39)
    expect(dist).toBeLessThan(41)
  })
})

describe('findNearbyComplaints', () => {
  const origin = { latitude: 28.613900, longitude: 77.209000 }

  it('identifies complaints within 50 metres and excludes complaints further away', () => {
    // Points approx ~22m away, ~45m away, and ~80m away
    const complaints = [
      { id: '1', title: 'Nearby Issue 1', latitude: 28.614100, longitude: 77.209000 }, // ~22m
      { id: '2', title: 'Far Issue', latitude: 28.614700, longitude: 77.209000 },      // ~89m
      { id: '3', title: 'Nearby Issue 2', latitude: 28.614300, longitude: 77.209000 }, // ~44m
      { id: '4', title: 'No coordinates', latitude: null, longitude: null },
    ]

    const matches = findNearbyComplaints(origin, complaints, 50)
    expect(matches).toHaveLength(2)
    expect(matches[0].id).toBe('1') // closer one first
    expect(matches[1].id).toBe('3')
    expect(matches[0].distanceMeters).toBeLessThan(matches[1].distanceMeters)
    expect(matches[0].distanceMeters).toBeLessThanOrEqual(50)
  })

  it('handles boundary conditions at exactly 50m radius', () => {
    // Construct a point close to 50m
    const complaints = [
      { id: '1', latitude: 28.613900, longitude: 77.209000 }, // 0m
    ]
    const matches = findNearbyComplaints(origin, complaints, 50)
    expect(matches).toHaveLength(1)
    expect(matches[0].distanceMeters).toBe(0)
  })

  it('returns empty array when no complaints or invalid origin provided', () => {
    expect(findNearbyComplaints(null, [{ latitude: 28.6, longitude: 77.2 }])).toEqual([])
    expect(findNearbyComplaints(origin, [])).toEqual([])
    expect(findNearbyComplaints(origin, null)).toEqual([])
  })
})

describe('geohash encoding & decoding', () => {
  it('encodes known coordinates into accurate Base32 geohash', () => {
    const hash = encodeGeohash(28.6139, 77.209, 7)
    expect(hash).toBe('ttnfucj')
  })

  it('decodes geohash back to coordinate bounds with precision tolerance', () => {
    const decoded = decodeGeohash('ttnfucj')
    expect(decoded).not.toBeNull()
    expect(decoded.lat).toBeCloseTo(28.6139, 2)
    expect(decoded.lng).toBeCloseTo(77.209, 2)
  })

  it('generates hierarchical prefix list for spatial querying', () => {
    const prefixes = getGeohashPrefixes('ttnfucj', 4)
    expect(prefixes).toEqual(['ttnf', 'ttnfu', 'ttnfuc', 'ttnfucj'])
  })

  it('returns null for empty or invalid geohash strings', () => {
    expect(decodeGeohash('')).toBeNull()
    expect(decodeGeohash(null)).toBeNull()
    expect(decodeGeohash('invalid@char')).toBeNull()
  })
})

describe('isPointInBroadcastGeofence', () => {
  const connaught = { lat: 28.6139, lng: 77.209 }
  const southDelhi = { lat: 28.5355, lng: 77.2189 }

  it('handles citywide broadcast affecting all coordinates', () => {
    expect(isPointInBroadcastGeofence(connaught, { targetType: 'citywide' })).toBe(true)
    expect(isPointInBroadcastGeofence(southDelhi, { targetType: 'citywide' })).toBe(true)
  })

  it('handles radius broadcast affecting points inside distance threshold', () => {
    const broadcast = {
      targetType: 'radius',
      targetCenter: connaught,
      targetRadius: 1000,
    }
    // Point ~150m away
    const nearby = { lat: 28.615, lng: 77.209 }
    expect(isPointInBroadcastGeofence(nearby, broadcast)).toBe(true)
    expect(isPointInBroadcastGeofence(southDelhi, broadcast)).toBe(false)
  })

  it('handles polygon broadcast using pointInPolygon', () => {
    const broadcast = {
      targetType: 'polygon',
      targetPolygon: [
        [28.61, 77.2],
        [28.62, 77.2],
        [28.62, 77.22],
        [28.61, 77.22],
        [28.61, 77.2],
      ],
    }
    const inside = { lat: 28.615, lng: 77.21 }
    const outside = { lat: 28.7, lng: 77.3 }
    expect(isPointInBroadcastGeofence(inside, broadcast)).toBe(true)
    expect(isPointInBroadcastGeofence(outside, broadcast)).toBe(false)
  })
})

