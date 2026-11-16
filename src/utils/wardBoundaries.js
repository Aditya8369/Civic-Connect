/**
 * Municipal Ward Boundaries & Administrative Zone Metadata (GeoJSON)
 *
 * Provides simplified polygonal ward boundaries with tactile civic cartography
 * styling, ward councilor offices, zone supervisors, and citizen helplines.
 */

export const WARD_BOUNDARIES_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'WARD-01',
      properties: {
        wardId: 'WARD-01',
        wardName: 'Central Civic Core & Connaught Ward',
        zoneName: 'New Delhi Central Zone (Zone A)',
        councilorOffice: 'Ward 01 Civic Kendra, Sansad Marg, Block B',
        zoneSupervisor: 'Rajeshwar Kulkarni (Zonal Dy. Commissioner)',
        helpline: '1800-11-2201',
        accentColor: '#1d4ed8',
        fillTint: '#dbeafe',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.202, 28.610],
            [77.216, 28.610],
            [77.216, 28.622],
            [77.202, 28.622],
            [77.202, 28.610],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'WARD-02',
      properties: {
        wardId: 'WARD-02',
        wardName: 'India Gate & Pragati Heritage Ward',
        zoneName: 'East Civic Heritage Zone (Zone B)',
        councilorOffice: 'Ward 02 Municipal Sub-Office, Tilak Marg',
        zoneSupervisor: 'Meenakshi Deshmukh (Zonal Dy. Commissioner)',
        helpline: '1800-11-2202',
        accentColor: '#047857',
        fillTint: '#d1fae5',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.216, 28.610],
            [77.232, 28.610],
            [77.232, 28.622],
            [77.216, 28.622],
            [77.216, 28.610],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'WARD-03',
      properties: {
        wardId: 'WARD-03',
        wardName: 'Chanakyapuri & Diplomatic Enclave Ward',
        zoneName: 'South-West Civic Zone (Zone C)',
        councilorOffice: 'Ward 03 Nagar Nigam Bhawan, Vinay Marg',
        zoneSupervisor: 'Vikramaditya Nair (Zonal Dy. Commissioner)',
        helpline: '1800-11-2203',
        accentColor: '#b45309',
        fillTint: '#fef3c7',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.188, 28.596],
            [77.209, 28.596],
            [77.209, 28.610],
            [77.188, 28.610],
            [77.188, 28.596],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'WARD-04',
      properties: {
        wardId: 'WARD-04',
        wardName: 'Lodhi Gardens & Khan Market Ward',
        zoneName: 'South-East Civic Zone (Zone D)',
        councilorOffice: 'Ward 04 Citizen Facilitation Center, Lodhi Road',
        zoneSupervisor: 'Ananya Chatterjee (Zonal Dy. Commissioner)',
        helpline: '1800-11-2204',
        accentColor: '#6d28d9',
        fillTint: '#ede9fe',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.209, 28.596],
            [77.232, 28.596],
            [77.232, 28.610],
            [77.209, 28.610],
            [77.209, 28.596],
          ],
        ],
      },
    },
  ],
}

/**
 * Converts GeoJSON [lng, lat] polygon rings into Leaflet [lat, lng] positions
 * and returns normalized ward metadata for rendering.
 */
export function getNormalizedWards(featureCollection = WARD_BOUNDARIES_GEOJSON) {
  const features = featureCollection?.features
  if (!Array.isArray(features)) return []

  return features
    .filter((f) => f?.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates?.[0]))
    .map((feature, index) => {
      const props = feature.properties || {}
      const ring = feature.geometry.coordinates[0]
      const positions = ring.map(([lng, lat]) => [lat, lng])

      const latSum = positions.reduce((sum, pt) => sum + pt[0], 0)
      const lngSum = positions.reduce((sum, pt) => sum + pt[1], 0)
      const center =
        positions.length > 0
          ? [latSum / positions.length, lngSum / positions.length]
          : [28.6139, 77.209]

      return {
        wardId: props.wardId || feature.id || `WARD-${index + 1}`,
        wardName: props.wardName || `Municipal Ward ${index + 1}`,
        zoneName: props.zoneName || 'Municipal Zone',
        councilorOffice: props.councilorOffice || 'Ward Civic Office',
        zoneSupervisor: props.zoneSupervisor || 'Zone Supervisor',
        helpline: props.helpline || '112',
        accentColor: props.accentColor || '#1d4ed8',
        fillTint: props.fillTint || '#dbeafe',
        positions,
        center,
      }
    })
}

/**
 * Computes tactile SVG path options for a ward polygon based on active selection state.
 */
export function getWardPolygonStyle(ward, isSelected = false) {
  const color = ward?.accentColor || '#1d4ed8'
  const fillColor = ward?.fillTint || '#dbeafe'

  if (isSelected) {
    return {
      color,
      weight: 3.5,
      opacity: 1,
      dashArray: '10 5',
      fillColor,
      fillOpacity: 0.34,
    }
  }

  return {
    color,
    weight: 2,
    opacity: 0.85,
    dashArray: '7 6',
    fillColor,
    fillOpacity: 0.14,
  }
}