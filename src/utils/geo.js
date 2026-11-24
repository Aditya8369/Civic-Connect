import { WARD_BOUNDARIES_GEOJSON } from './wardBoundaries.js'

/**
 * Earth radius in metres (mean radius WGS-84 / IUGG).
 */
const EARTH_RADIUS_METRES = 6371000

/**
 * Normalises an input coordinate object or primitive values into numeric { lat, lng }.
 * Accepts { latitude, longitude }, { lat, lng }, or coordinate objects with string/numeric values.
 *
 * @param {Object} coord
 * @returns {{ lat: number, lng: number } | null}
 */
export function parseCoordinates(coord) {
  if (!coord) {
    return null
  }

  if (Array.isArray(coord) && coord.length >= 2) {
    const lat = typeof coord[0] === 'number' ? coord[0] : parseFloat(coord[0])
    const lng = typeof coord[1] === 'number' ? coord[1] : parseFloat(coord[1])
    if (
      !Number.isNaN(lat) &&
      !Number.isNaN(lng) &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng }
    }
    return null
  }

  if (typeof coord !== 'object') {
    return null
  }

  const latRaw = coord.latitude !== undefined ? coord.latitude : coord.lat
  const lngRaw = coord.longitude !== undefined ? coord.longitude : coord.lng

  if (
    latRaw === null ||
    latRaw === undefined ||
    latRaw === '' ||
    lngRaw === null ||
    lngRaw === undefined ||
    lngRaw === ''
  ) {
    return null
  }

  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(latRaw)
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(lngRaw)

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null
  }

  // Latitude must be [-90, 90], Longitude must be [-180, 180]
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null
  }

  return { lat, lng }
}

/**
 * Converts degrees to radians.
 *
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180
}

/**
 * Calculates the great-circle distance between two geographical points using the Haversine formula.
 *
 * @param {Object} coord1 - First coordinate ({ latitude, longitude } or { lat, lng })
 * @param {Object} coord2 - Second coordinate ({ latitude, longitude } or { lat, lng })
 * @returns {number | null} Distance in metres, or null if either coordinate is invalid
 */
export function haversineDistance(coord1, coord2) {
  const p1 = parseCoordinates(coord1)
  const p2 = parseCoordinates(coord2)

  if (!p1 || !p2) {
    return null
  }

  const lat1Rad = toRadians(p1.lat)
  const lat2Rad = toRadians(p2.lat)
  const deltaLat = toRadians(p2.lat - p1.lat)
  const deltaLng = toRadians(p2.lng - p1.lng)

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)

  // Clamp to [0, 1] to prevent floating point inaccuracies from producing NaN in Math.sqrt / Math.atan2
  const clampedA = Math.max(0, Math.min(1, a))
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA))

  return EARTH_RADIUS_METRES * c
}

/**
 * Finds and returns all complaints within the specified radius (in metres),
 * sorted by proximity (nearest first).
 *
 * @param {Object} targetCoord - Target coordinate
 * @param {Array<Object>} complaints - List of complaint objects
 * @param {number} [radiusMeters=50] - Proximity threshold in metres
 * @returns {Array<Object>} Array of matching complaints with an attached `distanceMeters` property (rounded to 1 decimal place)
 */
export function findNearbyComplaints(targetCoord, complaints, radiusMeters = 50) {
  const target = parseCoordinates(targetCoord)
  if (!target || !Array.isArray(complaints)) {
    return []
  }

  const results = []

  for (const complaint of complaints) {
    if (!complaint) continue

    const distance = haversineDistance(target, complaint)
    if (distance !== null && distance <= radiusMeters) {
      results.push({
        ...complaint,
        distanceMeters: Math.round(distance * 10) / 10,
      })
    }
  }

  return results.sort((a, b) => a.distanceMeters - b.distanceMeters)
}

/**
 * Computes bounding box [minLng, minLat, maxLng, maxLat] for a GeoJSON coordinate ring.
 *
 * @param {Array<[number, number]>} ring - Array of [lng, lat]
 * @returns {[number, number, number, number] | null}
 */
export function computeBoundingBox(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i]
    if (!Array.isArray(pt) || pt.length < 2) continue
    const lng = Number(pt[0])
    const lat = Number(pt[1])
    if (Number.isNaN(lng) || Number.isNaN(lat)) continue
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  if (minLng === Infinity) return null
  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Checks if a point is on the segment between p1 and p2 (within epsilon).
 *
 * @param {[number, number]} point - [lng, lat]
 * @param {[number, number]} p1 - [lng, lat]
 * @param {[number, number]} p2 - [lng, lat]
 * @param {number} epsilon
 * @returns {boolean}
 */
function isPointOnSegment(point, p1, p2, epsilon = 1e-9) {
  const [px, py] = point
  const [x1, y1] = p1
  const [x2, y2] = p2

  // Bounding box pre-check with tolerance
  const minX = Math.min(x1, x2) - epsilon
  const maxX = Math.max(x1, x2) + epsilon
  const minY = Math.min(y1, y2) - epsilon
  const maxY = Math.max(y1, y2) + epsilon

  if (px < minX || px > maxX || py < minY || py > maxY) {
    return false
  }

  // Cross product (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
  const crossProduct = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
  if (Math.abs(crossProduct) > epsilon) {
    return false
  }

  return true
}

/**
 * Point in single linear ring check using ray casting (Jordan curve)
 * including deterministic boundary/vertex inclusion.
 *
 * Coordinates are GeoJSON order: [lng, lat]
 *
 * @param {[number, number]} point - [lng, lat]
 * @param {Array<[number, number]>} ring - Array of [lng, lat]
 * @returns {boolean}
 */
function pointInRing(point, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false

  const [px, py] = point
  let inside = false
  const n = ring.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const p1 = ring[j]
    const p2 = ring[i]

    if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 2 || p2.length < 2) {
      continue
    }

    const [x1, y1] = p1
    const [x2, y2] = p2

    // Check if point lies directly on edge or vertex
    if (isPointOnSegment(point, p1, p2)) {
      return true
    }

    // Ray casting algorithm (horizontal ray to the right from (px, py))
    // We treat edges with half-open intervals on y to prevent double-counting horizontal vertices
    const intersect =
      y1 > py !== y2 > py &&
      px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1

    if (intersect) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Checks if a point [lng, lat] is inside a GeoJSON Polygon geometry coordinates array.
 * Polygon coordinates: [exteriorRing, hole1, hole2, ...]
 *
 * @param {[number, number]} point - [lng, lat]
 * @param {Array<Array<[number, number]>>} polygonCoordinates
 * @returns {boolean}
 */
export function pointInPolygonCoordinates(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
    return false
  }

  const exterior = polygonCoordinates[0]
  if (!pointInRing(point, exterior)) {
    return false
  }

  // Check holes: if point is inside any hole, it is outside the polygon.
  // A point inside an exterior ring but inside a hole must not be classified as belonging to the polygon.
  for (let h = 1; h < polygonCoordinates.length; h++) {
    const hole = polygonCoordinates[h]
    if (pointInRing(point, hole)) {
      return false
    }
  }

  return true
}

/**
 * High-level Point-in-Polygon check supporting Point and Polygon/MultiPolygon/Feature/FeatureCollection.
 *
 * @param {Object | [number, number]} point - { lat, lng } or { latitude, longitude } or [lng, lat]
 * @param {Object} geojson - Polygon / MultiPolygon geometry, Feature, or FeatureCollection
 * @returns {boolean}
 */
export function pointInPolygon(point, geojson) {
  let pt = null
  if (Array.isArray(point) && point.length >= 2) {
    const [lng, lat] = point
    if (
      typeof lng === 'number' &&
      typeof lat === 'number' &&
      !Number.isNaN(lng) &&
      !Number.isNaN(lat) &&
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      pt = [lng, lat]
    }
  } else {
    const parsed = parseCoordinates(point)
    if (parsed) {
      pt = [parsed.lng, parsed.lat]
    }
  }

  if (!pt || !geojson || typeof geojson !== 'object') {
    return false
  }

  const type = geojson.type

  if (type === 'FeatureCollection') {
    if (!Array.isArray(geojson.features)) return false
    return geojson.features.some((f) => pointInPolygon(pt, f))
  }

  if (type === 'Feature') {
    return pointInPolygon(pt, geojson.geometry)
  }

  if (type === 'Polygon') {
    return pointInPolygonCoordinates(pt, geojson.coordinates)
  }

  if (type === 'MultiPolygon') {
    if (!Array.isArray(geojson.coordinates)) return false
    return geojson.coordinates.some((polyCoords) =>
      pointInPolygonCoordinates(pt, polyCoords)
    )
  }

  return false
}

// WeakMap cache for FeatureCollection / Feature bounding boxes and pre-processed geometries
const BBOX_CACHE = new WeakMap()

/**
 * Pre-processes and caches bounding boxes and geometry rings for a GeoJSON FeatureCollection or array.
 * Pure and does not mutate the input dataset.
 */
function getPrecomputedFeatures(featureCollection) {
  if (!featureCollection || typeof featureCollection !== 'object') return []
  if (BBOX_CACHE.has(featureCollection)) {
    return BBOX_CACHE.get(featureCollection)
  }

  const rawFeatures =
    featureCollection.type === 'FeatureCollection' && Array.isArray(featureCollection.features)
      ? featureCollection.features
      : Array.isArray(featureCollection)
        ? featureCollection
        : featureCollection.type === 'Feature'
          ? [featureCollection]
          : []

  const precomputed = []

  for (let i = 0; i < rawFeatures.length; i++) {
    const f = rawFeatures[i]
    if (!f || !f.geometry) continue

    const geom = f.geometry
    let overallBbox = null
    const polygons = [] // array of { bbox, coordinates }

    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      const bbox = computeBoundingBox(geom.coordinates[0])
      if (bbox) {
        polygons.push({ bbox, coordinates: geom.coordinates })
        overallBbox = bbox
      }
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      let minLng = Infinity
      let minLat = Infinity
      let maxLng = -Infinity
      let maxLat = -Infinity

      for (let p = 0; p < geom.coordinates.length; p++) {
        const polyCoords = geom.coordinates[p]
        if (Array.isArray(polyCoords) && polyCoords[0]) {
          const bbox = computeBoundingBox(polyCoords[0])
          if (bbox) {
            polygons.push({ bbox, coordinates: polyCoords })
            if (bbox[0] < minLng) minLng = bbox[0]
            if (bbox[1] < minLat) minLat = bbox[1]
            if (bbox[2] > maxLng) maxLng = bbox[2]
            if (bbox[3] > maxLat) maxLat = bbox[3]
          }
        }
      }

      if (minLng !== Infinity) {
        overallBbox = [minLng, minLat, maxLng, maxLat]
      }
    }

    if (overallBbox && polygons.length > 0) {
      precomputed.push({
        feature: f,
        overallBbox,
        polygons,
        wardId: f.properties?.wardId || f.id || `WARD-${i + 1}`,
      })
    }
  }

  BBOX_CACHE.set(featureCollection, precomputed)
  return precomputed
}

/**
 * Resolves municipal ward for given coordinates using GeoJSON ward boundaries.
 *
 * @param {Object} coords - { lat, lng } or { latitude, longitude }
 * @param {Object} [wardGeoJson] - GeoJSON FeatureCollection (defaults to WARD_BOUNDARIES_GEOJSON)
 * @returns {Object | null} Resolved ward metadata or null if out of boundaries or invalid coords
 */
export function findWardForCoordinates(coords, wardGeoJson = WARD_BOUNDARIES_GEOJSON) {
  const parsed = parseCoordinates(coords)
  if (!parsed) return null

  const dataset = wardGeoJson || WARD_BOUNDARIES_GEOJSON
  const precomputed = getPrecomputedFeatures(dataset)
  if (precomputed.length === 0) return null

  const ptLng = parsed.lng
  const ptLat = parsed.lat
  const pt = [ptLng, ptLat]

  const matches = []

  for (let i = 0; i < precomputed.length; i++) {
    const item = precomputed[i]
    const [minLng, minLat, maxLng, maxLat] = item.overallBbox

    // Bounding-box pre-check with small epsilon for boundary points
    const eps = 1e-9
    if (
      ptLng < minLng - eps ||
      ptLng > maxLng + eps ||
      ptLat < minLat - eps ||
      ptLat > maxLat + eps
    ) {
      continue
    }

    // Check individual polygons within the geometry
    for (let p = 0; p < item.polygons.length; p++) {
      const poly = item.polygons[p]
      const [pMinLng, pMinLat, pMaxLng, pMaxLat] = poly.bbox
      if (
        ptLng < pMinLng - eps ||
        ptLng > pMaxLng + eps ||
        ptLat < pMinLat - eps ||
        ptLat > pMaxLat + eps
      ) {
        continue
      }

      if (pointInPolygonCoordinates(pt, poly.coordinates)) {
        matches.push(item)
        break
      }
    }
  }

  if (matches.length === 0) {
    return null
  }

  // Deterministic overlap policy: sort by wardId ASC, then return first
  matches.sort((a, b) => String(a.wardId).localeCompare(String(b.wardId)))
  const winner = matches[0].feature
  const props = winner.properties || {}

  return {
    wardId: props.wardId || winner.id,
    wardName: props.wardName || 'Municipal Ward',
    zoneName: props.zoneName || 'Municipal Zone',
    councilorOffice: props.councilorOffice || 'Ward Civic Office',
    zoneSupervisor: props.zoneSupervisor || 'Zone Supervisor',
    helpline: props.helpline || '112',
    accentColor: props.accentColor || '#1d4ed8',
    fillTint: props.fillTint || '#dbeafe',
  }
}

export const BASE32_GEOHASH_CHARS = '0123456789bcdefghjkmnpqrstuvwxyz'

/**
 * Encodes latitude and longitude into a standard Base32 geohash.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} [precision=7] - Number of characters
 * @returns {string}
 */
export function encodeGeohash(lat, lng, precision = 7) {
  let latMin = -90
  let latMax = 90
  let lngMin = -180
  let lngMax = 180
  let hash = ''
  let isEven = true
  let bit = 0
  let ch = 0

  const safePrecision = Math.max(1, Math.min(12, precision))

  while (hash.length < safePrecision) {
    if (isEven) {
      const mid = (lngMin + lngMax) / 2
      if (lng >= mid) {
        ch |= 1 << (4 - bit)
        lngMin = mid
      } else {
        lngMax = mid
      }
    } else {
      const mid = (latMin + latMax) / 2
      if (lat >= mid) {
        ch |= 1 << (4 - bit)
        latMin = mid
      } else {
        latMax = mid
      }
    }
    isEven = !isEven
    if (bit < 4) {
      bit++
    } else {
      hash += BASE32_GEOHASH_CHARS[ch]
      bit = 0
      ch = 0
    }
  }

  return hash
}

/**
 * Decodes a geohash string into latitude and longitude center with errors.
 *
 * @param {string} geohash
 * @returns {{ lat: number, lng: number, latErr: number, lngErr: number } | null}
 */
export function decodeGeohash(geohash) {
  if (typeof geohash !== 'string' || !geohash.trim()) return null
  const clean = geohash.trim().toLowerCase()
  let latMin = -90
  let latMax = 90
  let lngMin = -180
  let lngMax = 180
  let isEven = true

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    const val = BASE32_GEOHASH_CHARS.indexOf(ch)
    if (val === -1) return null

    for (let bit = 4; bit >= 0; bit--) {
      const mask = 1 << bit
      if (isEven) {
        const mid = (lngMin + lngMax) / 2
        if (val & mask) lngMin = mid
        else lngMax = mid
      } else {
        const mid = (latMin + latMax) / 2
        if (val & mask) latMin = mid
        else latMax = mid
      }
      isEven = !isEven
    }
  }

  return {
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2,
    latErr: (latMax - latMin) / 2,
    lngErr: (lngMax - lngMin) / 2,
  }
}

/**
 * Generates hierarchical geohash prefix set for Firestore indexing.
 * E.g. for precision 7 'ttnfucj' -> ['ttnf', 'ttnfu', 'ttnfuc', 'ttnfucj']
 *
 * @param {string} geohash
 * @param {number} [minPrecision=4]
 * @returns {Array<string>}
 */
export function getGeohashPrefixes(geohash, minPrecision = 4) {
  if (!geohash || typeof geohash !== 'string') return []
  const prefixes = []
  for (let len = minPrecision; len <= geohash.length; len++) {
    prefixes.push(geohash.slice(0, len))
  }
  return prefixes
}

/**
 * Checks whether a given geographical point falls within an emergency broadcast's target geofence.
 *
 * @param {Object | [number, number]} point - { lat, lng } or { latitude, longitude } or [lat, lng]
 * @param {Object} broadcast - Stored or active broadcast document
 * @returns {boolean}
 */
export function isPointInBroadcastGeofence(point, broadcast) {
  if (!broadcast || typeof broadcast !== 'object') return false

  const targetType = broadcast.targetType || 'citywide'
  if (targetType === 'citywide') return true

  const coords = parseCoordinates(point)
  if (!coords) return false

  if (targetType === 'ward') {
    if (broadcast.targetWard?.wardId) {
      const ward = findWardForCoordinates(coords)
      if (ward && ward.wardId.toUpperCase() === broadcast.targetWard.wardId.toUpperCase()) {
        return true
      }
    }
    if (Array.isArray(broadcast.targetPolygon) && broadcast.targetPolygon.length >= 3) {
      const ring = broadcast.targetPolygon.map(([lat, lng]) => [lng, lat])
      return pointInPolygon(coords, { type: 'Polygon', coordinates: [ring] })
    }
    return false
  }

  if (targetType === 'radius') {
    const center = parseCoordinates(broadcast.targetCenter)
    if (!center) return false
    const radius = Number(broadcast.targetRadius) || 1000
    const distance = haversineDistance(coords, center)
    return distance !== null && distance <= radius
  }

  if (targetType === 'polygon') {
    if (Array.isArray(broadcast.targetPolygon) && broadcast.targetPolygon.length >= 3) {
      const ring = broadcast.targetPolygon.map(([lat, lng]) => [lng, lat])
      return pointInPolygon(coords, { type: 'Polygon', coordinates: [ring] })
    }
    return false
  }

  return true
}
