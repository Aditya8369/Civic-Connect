
import { useCallback, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Loader2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseCoordinates } from '@/utils/geo'
import { useLanguage } from '@/contexts/LanguageContext'

if (typeof window !== 'undefined') {
  window.L = L
}

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DEFAULT_CENTER = [20.5937, 78.9629]
const DEFAULT_ZOOM = 5

function MapCenterController({ coordinates }) {
  const map = useMap()

  useEffect(() => {
    if (!coordinates) return

    map.setView(
      [coordinates.lat, coordinates.lng],
      Math.max(map.getZoom(), 15),
      { animate: true }
    )
  }, [map, coordinates])

  return null
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng)
    },
  })

  return null
}

function SelectedLocationMarker({ position, draggable, onSelect }) {
  const eventHandlers = useMemo(
    () => ({
      dragend(event) {
        const marker = event.target
        const next = marker.getLatLng()
        onSelect(next)
      },
    }),
    [onSelect]
  )

  return (
    <Marker
      position={position}
      draggable={draggable}
      eventHandlers={eventHandlers}
    />
  )
}

/**
 * Reusable OpenStreetMap view for selecting and displaying a complaint location.
 *
 * In selection mode a citizen can click the map or drag the marker. Coordinates
 * are always kept in sync with the marker and the optional reverse-geocoded
 * address. Display mode is read-only and is used on complaint detail pages.
 */
export function ComplaintLocationMapLeaflet({
  latitude,
  longitude,
  address = '',
  onLocationSelect,
  selectable = false,
  height = '280px',
  className = '',
}) {
  const { t } = useLanguage()

  const coordinates = useMemo(
    () => parseCoordinates({ latitude, longitude }),
    [latitude, longitude]
  )

  const [selected, setSelected] = useState(coordinates)
  const [resolvingAddress, setResolvingAddress] = useState(false)
  const [mapError, setMapError] = useState('')

  useEffect(() => {
    setSelected(coordinates)
  }, [coordinates])

  const reverseGeocode = useCallback(
    async ({ lat, lng }) => {
      if (!onLocationSelect) return

      setResolvingAddress(true)
      setMapError('')

      try {
        // Nominatim's public endpoint asks clients to identify themselves and
        // discourages high-volume autocomplete. This is one request per pin move.
        const params = new URLSearchParams({
          format: 'jsonv2',
          lat: String(lat),
          lon: String(lng),
          zoom: '18',
          addressdetails: '1',
        })

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?${params}`,
          {
            headers: { Accept: 'application/json' },
          }
        )

        if (!response.ok) {
          throw new Error('address-lookup')
        }

        const result = await response.json()

        onLocationSelect({
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
          address: result.display_name || '',
        })

        if (!result.display_name) {
          setMapError(t('mapNoStreetAddress'))
        }
      } catch {
        onLocationSelect({
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
          address: '',
        })

        setMapError(t('mapAddressLookupError'))
      } finally {
        setResolvingAddress(false)
      }
    },
    [onLocationSelect, t]
  )

  const handleSelect = useCallback(
    (point) => {
      const next = parseCoordinates(point)

      if (!next) return

      setSelected(next)
      reverseGeocode(next)
    },
    [reverseGeocode]
  )

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMapError(t('mapLocationNotSupported'))
      return
    }

    setMapError('')
    setResolvingAddress(true)

    navigator.geolocation.getCurrentPosition(
      ({ coords: current }) => {
        handleSelect({
          lat: current.latitude,
          lng: current.longitude,
        })
      },
      (error) => {
        setResolvingAddress(false)

        setMapError(
          error.code === error.PERMISSION_DENIED
            ? t('mapLocationPermissionDenied')
            : t('mapLocationRetrievalError')
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }

  if (typeof window === 'undefined') {
    return (
      <div
        className={`rounded-lg bg-gray-100 dark:bg-gray-800 ${className}`}
        style={{ height }}
      />
    )
  }

  const center = coordinates
    ? [coordinates.lat, coordinates.lng]
    : DEFAULT_CENTER

  const zoom = coordinates ? 15 : DEFAULT_ZOOM

  return (
    <section
      className={`complaint-location-map space-y-2 ${className}`}
      aria-label={t('complaintLocationMap')}
    >
      {selectable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('mapSelectLocationInstructions')}
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUseCurrentLocation}
          >
            <Crosshair className="h-4 w-4 mr-2" />
            {t('mapUseCurrentLocation')}
          </Button>
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
        style={{ height }}
      >
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapCenterController coordinates={selected} />

          {selectable && <MapClickHandler onSelect={handleSelect} />}

          {selected && (
            <SelectedLocationMarker
              position={[selected.lat, selected.lng]}
              draggable={selectable}
              onSelect={handleSelect}
            />
          )}
        </MapContainer>
      </div>

      {resolvingAddress && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('mapFindingNearestAddress')}
        </p>
      )}

      {mapError && (
        <p
          role="status"
          className="text-xs text-amber-700 dark:text-amber-400"
        >
          {mapError}
        </p>
      )}

      {!selectable && (
        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />

          <div>
            <p>{address || t('mapAddressNotProvided')}</p>

            {coordinates && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default ComplaintLocationMapLeaflet
