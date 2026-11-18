import { describe, it, expect } from 'vitest'
import {
  parseCoordinates,
  computeBoundingBox,
  pointInPolygonCoordinates,
  pointInPolygon,
  findWardForCoordinates,
} from './geo'
import {
  getWardById,
  getWardsByZone,
  getAllZones,
  getNormalizedWards,
} from './wardBoundaries'

describe('parseCoordinates & coordinate validation', () => {
  it('parses valid numeric latitude and longitude', () => {
    expect(parseCoordinates({ latitude: 28.6139, longitude: 77.209 })).toEqual({
      lat: 28.6139,
      lng: 77.209,
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

  it('returns null for missing, null, undefined or empty coordinates', () => {
    expect(parseCoordinates(null)).toBeNull()
    expect(parseCoordinates(undefined)).toBeNull()
    expect(parseCoordinates({})).toBeNull()
    expect(parseCoordinates({ latitude: null, longitude: 77.209 })).toBeNull()
    expect(parseCoordinates({ latitude: 28.61, longitude: undefined })).toBeNull()
    expect(parseCoordinates({ latitude: '', longitude: '77.2' })).toBeNull()
  })

  it('rejects NaN, Infinity, and non-numeric strings', () => {
    expect(parseCoordinates({ latitude: 'invalid', longitude: 77.209 })).toBeNull()
    expect(parseCoordinates({ latitude: NaN, longitude: 77.209 })).toBeNull()
    expect(parseCoordinates({ latitude: Infinity, longitude: 77.209 })).toBeNull()
    expect(parseCoordinates({ latitude: 28.61, longitude: -Infinity })).toBeNull()
  })

  it('enforces latitude and longitude range constraints [-90, 90] and [-180, 180]', () => {
    expect(parseCoordinates({ latitude: 90.0001, longitude: 77 })).toBeNull()
    expect(parseCoordinates({ latitude: -90.0001, longitude: 77 })).toBeNull()
    expect(parseCoordinates({ latitude: 28, longitude: 180.0001 })).toBeNull()
    expect(parseCoordinates({ latitude: 28, longitude: -180.0001 })).toBeNull()
    expect(parseCoordinates({ latitude: 90, longitude: 180 })).toEqual({ lat: 90, lng: 180 })
    expect(parseCoordinates({ latitude: -90, longitude: -180 })).toEqual({ lat: -90, lng: -180 })
  })

  it('does not silently convert invalid coordinates to (0,0)', () => {
    expect(parseCoordinates({ latitude: 'bad', longitude: 'bad' })).not.toEqual({ lat: 0, lng: 0 })
    expect(parseCoordinates({ latitude: 'bad', longitude: 'bad' })).toBeNull()
  })
})

describe('computeBoundingBox', () => {
  it('computes correct [minLng, minLat, maxLng, maxLat] bounding box', () => {
    const ring = [
      [77.202, 28.61],
      [77.216, 28.61],
      [77.216, 28.622],
      [77.202, 28.622],
      [77.202, 28.61],
    ]
    expect(computeBoundingBox(ring)).toEqual([77.202, 28.61, 77.216, 28.622])
  })

  it('returns null for empty or invalid ring', () => {
    expect(computeBoundingBox([])).toBeNull()
    expect(computeBoundingBox(null)).toBeNull()
    expect(computeBoundingBox([['invalid', 'data']])).toBeNull()
  })
})

describe('pointInPolygon & pointInPolygonCoordinates algorithms', () => {
  // Simple square: [0, 0] to [10, 10]
  const squareRing = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]

  it('identifies points strictly inside a polygon', () => {
    expect(pointInPolygonCoordinates([5, 5], [squareRing])).toBe(true)
  })

  it('identifies points strictly outside a polygon', () => {
    expect(pointInPolygonCoordinates([15, 5], [squareRing])).toBe(false)
    expect(pointInPolygonCoordinates([-1, 5], [squareRing])).toBe(false)
    expect(pointInPolygonCoordinates([5, 12], [squareRing])).toBe(false)
    expect(pointInPolygonCoordinates([5, -2], [squareRing])).toBe(false)
  })

  it('handles horizontal and vertical boundaries deterministically', () => {
    // On horizontal edge y = 0
    expect(pointInPolygonCoordinates([5, 0], [squareRing])).toBe(true)
    // On vertical edge x = 10
    expect(pointInPolygonCoordinates([10, 5], [squareRing])).toBe(true)
  })

  it('handles vertices deterministically', () => {
    expect(pointInPolygonCoordinates([0, 0], [squareRing])).toBe(true)
    expect(pointInPolygonCoordinates([10, 10], [squareRing])).toBe(true)
  })

  it('handles repeated closing coordinates without division by zero or errors', () => {
    const closedRepeatedRing = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
      [0, 0],
    ]
    expect(pointInPolygonCoordinates([5, 5], [closedRepeatedRing])).toBe(true)
    expect(pointInPolygonCoordinates([15, 5], [closedRepeatedRing])).toBe(false)
  })

  it('handles concave polygon (L-shaped or arrowhead)', () => {
    // Arrowhead / V-shape polygon:
    // (0,0) -> (10,5) -> (0,10) -> (4,5) -> (0,0)
    const concaveRing = [
      [0, 0],
      [10, 5],
      [0, 10],
      [4, 5],
      [0, 0],
    ]
    // (2, 5) is in the indentation (outside)
    expect(pointInPolygonCoordinates([2, 5], [concaveRing])).toBe(false)
    // (6, 5) is inside the body
    expect(pointInPolygonCoordinates([6, 5], [concaveRing])).toBe(true)
  })

  it('handles polygon interior holes correctly (donut polygon)', () => {
    // Exterior square [0,0] to [10,10], interior hole [3,3] to [7,7]
    const exterior = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]
    const hole = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ]
    const donut = [exterior, hole]

    // Point in donut body
    expect(pointInPolygonCoordinates([1, 1], donut)).toBe(true)
    expect(pointInPolygonCoordinates([8, 8], donut)).toBe(true)
    // Point inside the hole must NOT belong to polygon
    expect(pointInPolygonCoordinates([5, 5], donut)).toBe(false)
    // Point outside exterior
    expect(pointInPolygonCoordinates([12, 12], donut)).toBe(false)
  })

  it('supports Polygon GeoJSON geometry type', () => {
    const polygonGeom = {
      type: 'Polygon',
      coordinates: [squareRing],
    }
    expect(pointInPolygon({ lat: 5, lng: 5 }, polygonGeom)).toBe(true)
    expect(pointInPolygon({ lat: 15, lng: 5 }, polygonGeom)).toBe(false)
  })

  it('supports MultiPolygon GeoJSON geometry type', () => {
    const multiPolygonGeom = {
      type: 'MultiPolygon',
      coordinates: [
        [squareRing], // square [0,0] to [10,10]
        [
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 30],
            [20, 20],
          ],
        ], // square [20,20] to [30,30]
      ],
    }
    expect(pointInPolygon({ lat: 5, lng: 5 }, multiPolygonGeom)).toBe(true)
    expect(pointInPolygon({ lat: 25, lng: 25 }, multiPolygonGeom)).toBe(true)
    expect(pointInPolygon({ lat: 15, lng: 15 }, multiPolygonGeom)).toBe(false)
  })

  it('supports Feature and FeatureCollection types', () => {
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [squareRing],
      },
    }
    const collection = {
      type: 'FeatureCollection',
      features: [feature],
    }
    expect(pointInPolygon({ lat: 5, lng: 5 }, feature)).toBe(true)
    expect(pointInPolygon({ lat: 5, lng: 5 }, collection)).toBe(true)
    expect(pointInPolygon({ lat: 15, lng: 5 }, collection)).toBe(false)
  })

  it('gracefully handles empty, invalid or malformed geometry', () => {
    expect(pointInPolygon({ lat: 5, lng: 5 }, null)).toBe(false)
    expect(pointInPolygon({ lat: 5, lng: 5 }, {})).toBe(false)
    expect(pointInPolygon({ lat: 5, lng: 5 }, { type: 'Unknown' })).toBe(false)
    expect(pointInPolygon({ lat: 5, lng: 5 }, { type: 'Polygon', coordinates: [] })).toBe(false)
    expect(pointInPolygon({ lat: 5, lng: 5 }, { type: 'FeatureCollection', features: null })).toBe(false)
  })
})

describe('findWardForCoordinates with real WARD_BOUNDARIES_GEOJSON', () => {
  it('correctly resolves interior points to their corresponding wards', () => {
    // WARD-01: [77.202, 28.610] to [77.216, 28.622]
    const ward1 = findWardForCoordinates({ lat: 28.616, lng: 77.209 })
    expect(ward1).not.toBeNull()
    expect(ward1.wardId).toBe('WARD-01')
    expect(ward1.wardName).toBe('Central Civic Core & Connaught Ward')
    expect(ward1.zoneName).toBe('New Delhi Central Zone (Zone A)')
    expect(ward1.zoneSupervisor).toBe('Rajeshwar Kulkarni (Zonal Dy. Commissioner)')
    expect(ward1.helpline).toBe('1800-11-2201')

    // WARD-02: [77.216, 28.610] to [77.232, 28.622]
    const ward2 = findWardForCoordinates({ lat: 28.616, lng: 77.224 })
    expect(ward2).not.toBeNull()
    expect(ward2.wardId).toBe('WARD-02')
    expect(ward2.wardName).toBe('India Gate & Pragati Heritage Ward')

    // WARD-03: [77.188, 28.596] to [77.209, 28.610]
    const ward3 = findWardForCoordinates({ lat: 28.603, lng: 77.198 })
    expect(ward3).not.toBeNull()
    expect(ward3.wardId).toBe('WARD-03')
    expect(ward3.wardName).toBe('Chanakyapuri & Diplomatic Enclave Ward')

    // WARD-04: [77.209, 28.596] to [77.232, 28.610]
    const ward4 = findWardForCoordinates({ lat: 28.603, lng: 77.220 })
    expect(ward4).not.toBeNull()
    expect(ward4.wardId).toBe('WARD-04')
    expect(ward4.wardName).toBe('Lodhi Gardens & Khan Market Ward')
  })

  it('returns null for coordinates outside municipal boundaries', () => {
    // Far north in Delhi or Gurgaon
    expect(findWardForCoordinates({ lat: 28.7041, lng: 77.1025 })).toBeNull()
    // Bangalore
    expect(findWardForCoordinates({ lat: 12.9716, lng: 77.5946 })).toBeNull()
  })

  it('returns null for invalid coordinate inputs', () => {
    expect(findWardForCoordinates(null)).toBeNull()
    expect(findWardForCoordinates({ lat: 'not-a-number', lng: 77.209 })).toBeNull()
    expect(findWardForCoordinates({ lat: 95, lng: 77.209 })).toBeNull()
  })

  it('produces deterministic resolution for points on shared ward boundaries', () => {
    // Point on boundary between WARD-01 and WARD-02: lng = 77.216, lat = 28.616
    const r1 = findWardForCoordinates({ lat: 28.616, lng: 77.216 })
    const r2 = findWardForCoordinates({ lat: 28.616, lng: 77.216 })
    expect(r1).toEqual(r2)
    // Deterministic policy sorts wardId ASC: WARD-01 takes precedence
    expect(r1.wardId).toBe('WARD-01')
  })

  it('resolves deterministically across 100 repeated lookups without cache divergence', () => {
    const coords = { lat: 28.615, lng: 77.210 }
    const initial = findWardForCoordinates(coords)
    for (let i = 0; i < 100; i++) {
      expect(findWardForCoordinates(coords)).toEqual(initial)
    }
  })

  it('bounding-box optimization rejects out-of-range points before ring checks', () => {
    // Points far away shouldn't trigger extensive polygon tests
    expect(findWardForCoordinates({ lat: 0, lng: 0 })).toBeNull()
    expect(findWardForCoordinates({ lat: 28.615, lng: 85.0 })).toBeNull()
  })
})

describe('wardBoundaries helpers', () => {
  it('getWardById returns full ward metadata for existing ward IDs', () => {
    const ward1 = getWardById('WARD-01')
    expect(ward1).not.toBeNull()
    expect(ward1.wardName).toBe('Central Civic Core & Connaught Ward')
    expect(ward1.zoneName).toBe('New Delhi Central Zone (Zone A)')

    // Case-insensitivity
    const ward2 = getWardById('ward-02')
    expect(ward2).not.toBeNull()
    expect(ward2.wardId).toBe('WARD-02')
  })

  it('getWardById returns null for nonexistent ward ID', () => {
    expect(getWardById('WARD-999')).toBeNull()
    expect(getWardById('')).toBeNull()
    expect(getWardById(null)).toBeNull()
  })

  it('getWardsByZone returns all wards belonging to a zone', () => {
    const centralWards = getWardsByZone('New Delhi Central Zone (Zone A)')
    expect(centralWards).toHaveLength(1)
    expect(centralWards[0].wardId).toBe('WARD-01')

    expect(getWardsByZone('Unknown Zone')).toEqual([])
  })

  it('getAllZones returns all unique zone names in the dataset', () => {
    const zones = getAllZones()
    expect(zones).toContain('New Delhi Central Zone (Zone A)')
    expect(zones).toContain('East Civic Heritage Zone (Zone B)')
    expect(zones).toContain('South-West Civic Zone (Zone C)')
    expect(zones).toContain('South-East Civic Zone (Zone D)')
    expect(zones).toHaveLength(4)
  })

  it('getNormalizedWards ensures backward compatibility with positions and centers', () => {
    const normalized = getNormalizedWards()
    expect(normalized).toHaveLength(4)
    normalized.forEach((w) => {
      expect(w.wardId).toBeDefined()
      expect(w.positions).toBeInstanceOf(Array)
      expect(w.positions[0]).toHaveLength(2)
      // Leaflet [lat, lng]
      expect(w.positions[0][0]).toBeGreaterThan(28)
      expect(w.positions[0][1]).toBeGreaterThan(77)
    })
  })
})
