import { useEffect, useState, useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Megaphone,
  Radio,
  Send,
  XCircle,
  MapPin,
  Compass,
  CircleDot,
  Pentagon,
  Globe,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '@/components/common/PageHeader'
import { EmergencyAlertBannerView } from '@/components/citizen/EmergencyAlertBanner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import {
  BROADCAST_MESSAGE_MAX_LENGTH,
  BROADCAST_SEVERITIES,
  BROADCAST_TITLE_MAX_LENGTH,
  DEFAULT_BROADCAST_SEVERITY,
  deactivateEmergencyBroadcast,
  listenToActiveEmergencyBroadcast,
  publishEmergencyBroadcast,
} from '@/firebase/emergencyBroadcasts'
import { getNormalizedWards } from '@/utils/wardBoundaries'
import { MapContainer, TileLayer, Polygon, Circle, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const selectClassName =
  'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

function AdminMapEvents({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      if (onMapClick && e?.latlng) {
        onMapClick(e.latlng)
      }
    },
  })
  return null
}

export function AdminBroadcastPage() {
  const { user } = useAuth()

  const [activeBroadcast, setActiveBroadcast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState(DEFAULT_BROADCAST_SEVERITY)
  const [targetType, setTargetType] = useState('citywide')
  const [selectedWardId, setSelectedWardId] = useState('WARD-01')
  const [targetRadius, setTargetRadius] = useState(1000)
  const [targetCenter, setTargetCenter] = useState({ lat: 28.6139, lng: 77.209 })
  const [customPolygonPoints, setCustomPolygonPoints] = useState([])

  const [formError, setFormError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [ending, setEnding] = useState(false)

  const wards = useMemo(() => getNormalizedWards(), [])
  const selectedWard = useMemo(
    () => wards.find((w) => w.wardId === selectedWardId) || wards[0],
    [wards, selectedWardId]
  )

  useEffect(() => {
    const unsubscribe = listenToActiveEmergencyBroadcast(
      (broadcast) => {
        setActiveBroadcast(broadcast)
        setLoading(false)
        setLoadError('')
      },
      {
        onError: (error) => {
          console.error('Active broadcast listener error:', error)
          setLoadError('Could not load the current citywide alert.')
          setLoading(false)
        },
      }
    )

    return typeof unsubscribe === 'function' ? unsubscribe : () => {}
  }, [])

  const selectedSeverity =
    BROADCAST_SEVERITIES.find((option) => option.value === severity) ||
    BROADCAST_SEVERITIES[0]

  const handleMapClick = (latlng) => {
    if (targetType === 'radius') {
      setTargetCenter({ lat: Number(latlng.lat.toFixed(5)), lng: Number(latlng.lng.toFixed(5)) })
    } else if (targetType === 'polygon') {
      setCustomPolygonPoints((prev) => [
        ...prev,
        [Number(latlng.lat.toFixed(5)), Number(latlng.lng.toFixed(5))],
      ])
    }
  }

  const handlePublish = async (event) => {
    event.preventDefault()
    if (publishing) return

    const cleanTitle = title.trim()
    const cleanMessage = message.trim()

    if (!cleanTitle) {
      setFormError('Enter a short alert title')
      return
    }

    if (!cleanMessage) {
      setFormError('Enter the message citizens should see')
      return
    }

    if (targetType === 'polygon' && customPolygonPoints.length < 3) {
      setFormError('Click on the map preview to define at least 3 points for the polygon geofence')
      return
    }

    setPublishing(true)
    setFormError('')

    try {
      const payload = {
        title: cleanTitle,
        message: cleanMessage,
        severity,
        ...(targetType !== 'citywide' ? { targetType } : {}),
      }

      if (targetType === 'ward' && selectedWard) {
        payload.targetWard = {
          wardId: selectedWard.wardId,
          wardName: selectedWard.wardName,
          zoneName: selectedWard.zoneName,
        }
        payload.targetPolygon = selectedWard.positions
        payload.targetCenter = {
          lat: selectedWard.center[0],
          lng: selectedWard.center[1],
        }
      } else if (targetType === 'radius') {
        payload.targetCenter = targetCenter
        payload.targetRadius = targetRadius
      } else if (targetType === 'polygon') {
        payload.targetPolygon = customPolygonPoints
        const latSum = customPolygonPoints.reduce((sum, pt) => sum + pt[0], 0)
        const lngSum = customPolygonPoints.reduce((sum, pt) => sum + pt[1], 0)
        payload.targetCenter = {
          lat: latSum / customPolygonPoints.length,
          lng: lngSum / customPolygonPoints.length,
        }
      }

      await publishEmergencyBroadcast(payload, { actorUid: user?.uid })

      setTitle('')
      setMessage('')
      setSeverity(DEFAULT_BROADCAST_SEVERITY)
      setCustomPolygonPoints([])
      if (targetType === 'citywide') {
        toast.success('Emergency alert published to all citizens')
      } else {
        toast.success('Municipal alert published with geofenced targeting')
      }
    } catch (error) {
      console.error('Broadcast publish error:', error)
      toast.error('Could not publish the emergency alert')
    } finally {
      setPublishing(false)
    }
  }

  const handleEndBroadcast = async () => {
    if (!activeBroadcast?.id || ending) return

    setEnding(true)

    try {
      await deactivateEmergencyBroadcast(activeBroadcast.id, {
        actorUid: user?.uid,
      })
      setActiveBroadcast(null)
      toast.success('Citywide alert ended')
    } catch (error) {
      console.error('Broadcast deactivate error:', error)
      toast.error('Could not end the citywide alert')
    } finally {
      setEnding(false)
    }
  }

  const mapCenter =
    targetType === 'ward' && selectedWard
      ? selectedWard.center
      : [targetCenter.lat, targetCenter.lng]

  return (
    <div>
      <PageHeader
        title="Municipal Broadcasts & Alert Center"
        description="Publish geofenced announcements, ward advisories, and emergency alerts across municipal jurisdictions"
      />

      <div className="max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30">
                <Radio className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle>Active municipal alert</CardTitle>
                <CardDescription>
                  The broadcast citizens currently see in their affected jurisdiction
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading the current alert...
              </div>
            ) : loadError ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {loadError}
              </p>
            ) : activeBroadcast ? (
              <div>
                <EmergencyAlertBannerView
                  broadcast={activeBroadcast}
                  preview
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Live for {activeBroadcast.targetType === 'ward'
                      ? `Ward ${activeBroadcast.targetWard?.wardName || activeBroadcast.targetWard?.wardId}`
                      : activeBroadcast.targetType === 'radius'
                        ? `${activeBroadcast.targetRadius}m radius geofence`
                        : activeBroadcast.targetType === 'polygon'
                          ? 'targeted polygon geofence'
                          : 'all citizens'}
                  </p>

                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleEndBroadcast}
                    disabled={ending}
                    className="gap-1.5"
                  >
                    {ending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {ending ? 'Ending...' : 'End Broadcast'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No citywide alert is active. Use the composer below to publish one.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
                <Megaphone className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <CardTitle>Compose Broadcast</CardTitle>
                <CardDescription>
                  Configure severity, targeting boundaries, and broadcast message
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handlePublish} className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="broadcast-title">Alert Title</Label>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {title.length}/{BROADCAST_TITLE_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  id="broadcast-title"
                  value={title}
                  maxLength={BROADCAST_TITLE_MAX_LENGTH}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    setFormError('')
                  }}
                  placeholder="e.g. Water Pipeline Repair & Service Disruption"
                  disabled={publishing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="broadcast-severity">Alert Severity</Label>
                <select
                  id="broadcast-severity"
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value)}
                  disabled={publishing}
                  className={selectClassName}
                >
                  {BROADCAST_SEVERITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.value})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedSeverity.description}
                </p>
              </div>

              {/* Geofence Targeting Section */}
              <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-4">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  Target Geofence Boundary
                </Label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('ward')}
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition ${
                      targetType === 'ward'
                        ? 'border-primary-600 bg-primary-50 text-primary-900 dark:bg-primary-950/60 dark:text-primary-200 dark:border-primary-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <Compass className="h-3.5 w-3.5" />
                    Municipal Ward
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('radius')}
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition ${
                      targetType === 'radius'
                        ? 'border-primary-600 bg-primary-50 text-primary-900 dark:bg-primary-950/60 dark:text-primary-200 dark:border-primary-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <CircleDot className="h-3.5 w-3.5" />
                    Target Radius
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('polygon')}
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition ${
                      targetType === 'polygon'
                        ? 'border-primary-600 bg-primary-50 text-primary-900 dark:bg-primary-950/60 dark:text-primary-200 dark:border-primary-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <Pentagon className="h-3.5 w-3.5" />
                    Draw Polygon
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('citywide')}
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition ${
                      targetType === 'citywide'
                        ? 'border-primary-600 bg-primary-50 text-primary-900 dark:bg-primary-950/60 dark:text-primary-200 dark:border-primary-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Citywide
                  </button>
                </div>

                {targetType === 'ward' && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="broadcast-ward" className="text-xs">
                      Select Municipal Ward
                    </Label>
                    <select
                      id="broadcast-ward"
                      data-testid="broadcast-ward-select"
                      value={selectedWardId}
                      onChange={(e) => setSelectedWardId(e.target.value)}
                      className={selectClassName}
                    >
                      {wards.map((ward) => (
                        <option key={ward.wardId} value={ward.wardId}>
                          {ward.wardId}: {ward.wardName} ({ward.zoneName})
                        </option>
                      ))}
                    </select>
                    {selectedWard && (
                      <div className="text-xs text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-stone-800/60 p-2.5 rounded-md flex items-center justify-between">
                        <span>Office: {selectedWard.councilorOffice}</span>
                        <span>Helpline: {selectedWard.helpline}</span>
                      </div>
                    )}
                  </div>
                )}

                {targetType === 'radius' && (
                  <div className="space-y-2 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="broadcast-radius" className="text-xs">
                          Radius (metres)
                        </Label>
                        <select
                          id="broadcast-radius"
                          data-testid="broadcast-radius-select"
                          value={targetRadius}
                          onChange={(e) => setTargetRadius(Number(e.target.value))}
                          className={selectClassName}
                        >
                          <option value={500}>500 metres (Neighbourhood)</option>
                          <option value={1000}>1,000 metres (1 km)</option>
                          <option value={2000}>2,000 metres (2 km)</option>
                          <option value={5000}>5,000 metres (5 km Zonal)</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Center Point (Lat / Lng)</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            data-testid="broadcast-center-lat"
                            type="number"
                            step="0.0001"
                            value={targetCenter.lat}
                            onChange={(e) =>
                              setTargetCenter((prev) => ({
                                ...prev,
                                lat: parseFloat(e.target.value) || prev.lat,
                              }))
                            }
                            placeholder="Lat"
                          />
                          <Input
                            data-testid="broadcast-center-lng"
                            type="number"
                            step="0.0001"
                            value={targetCenter.lng}
                            onChange={(e) =>
                              setTargetCenter((prev) => ({
                                ...prev,
                                lng: parseFloat(e.target.value) || prev.lng,
                              }))
                            }
                            placeholder="Lng"
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Click anywhere on the map preview below to set the geofence radius center.
                    </p>
                  </div>
                )}

                {targetType === 'polygon' && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <span
                        data-testid="polygon-vertex-count"
                        className="text-xs font-medium text-stone-700 dark:text-stone-300"
                      >
                        {customPolygonPoints.length} polygon vertices placed (min 3 required)
                      </span>
                      {customPolygonPoints.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid="clear-polygon-btn"
                          onClick={() => setCustomPolygonPoints([])}
                          className="h-7 text-xs text-red-600 gap-1 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                          Clear Points
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Click consecutive points on the map preview below to draw the targeted boundary polygon.
                    </p>
                  </div>
                )}

                {targetType === 'citywide' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                    Citywide broadcast: Alert will be shown to every active citizen across all wards.
                  </p>
                )}

                {/* Leaflet Map Preview */}
                <div
                  data-testid="broadcast-map-preview"
                  className="relative h-64 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mt-3"
                >
                  <MapContainer
                    center={mapCenter}
                    zoom={targetType === 'ward' ? 13 : 12}
                    scrollWheelZoom={false}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <AdminMapEvents onMapClick={handleMapClick} />

                    {targetType === 'ward' && selectedWard && (
                      <Polygon
                        positions={selectedWard.positions}
                        pathOptions={{
                          color: selectedWard.accentColor,
                          fillColor: selectedWard.fillTint,
                          fillOpacity: 0.35,
                          weight: 3,
                        }}
                      />
                    )}

                    {targetType === 'radius' && (
                      <>
                        <Circle
                          center={[targetCenter.lat, targetCenter.lng]}
                          radius={targetRadius}
                          pathOptions={{
                            color: '#dc2626',
                            fillColor: '#ef4444',
                            fillOpacity: 0.22,
                            weight: 2,
                            dashArray: '6 4',
                          }}
                        />
                        <Marker position={[targetCenter.lat, targetCenter.lng]} />
                      </>
                    )}

                    {targetType === 'polygon' && customPolygonPoints.length > 0 && (
                      <>
                        {customPolygonPoints.length >= 3 && (
                          <Polygon
                            positions={customPolygonPoints}
                            pathOptions={{
                              color: '#7c3aed',
                              fillColor: '#8b5cf6',
                              fillOpacity: 0.25,
                              weight: 2.5,
                              dashArray: '6 4',
                            }}
                          />
                        )}
                        {customPolygonPoints.map((pt, idx) => (
                          <Marker key={idx} position={pt} />
                        ))}
                      </>
                    )}
                  </MapContainer>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="broadcast-message">Alert Message</Label>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {message.length}/{BROADCAST_MESSAGE_MAX_LENGTH}
                  </span>
                </div>
                <textarea
                  id="broadcast-message"
                  rows={4}
                  value={message}
                  maxLength={BROADCAST_MESSAGE_MAX_LENGTH}
                  onChange={(event) => {
                    setMessage(event.target.value)
                    setFormError('')
                  }}
                  placeholder="Explain what is happening, which areas are affected, and any emergency actions residents should take..."
                  disabled={publishing}
                  className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>

              {formError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {formError}
                </p>
              )}

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  disabled={publishing}
                  className="gap-1.5"
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {publishing
                    ? 'Publishing...'
                    : activeBroadcast
                      ? 'Replace Active Alert'
                      : 'Publish Alert'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Citizen Preview</CardTitle>
                <CardDescription>
                  How the banner will appear to citizens in the targeted area
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <EmergencyAlertBannerView
              broadcast={{
                title: title.trim() || 'Your alert title',
                message:
                  message.trim() ||
                  'Your geofenced municipal message will appear here for affected citizens.',
                severity,
                targetType,
                ...(targetType === 'ward' && selectedWard
                  ? {
                      targetWard: {
                        wardId: selectedWard.wardId,
                        wardName: selectedWard.wardName,
                      },
                    }
                  : {}),
                ...(targetType === 'radius' ? { targetRadius } : {}),
              }}
              preview
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default AdminBroadcastPage
