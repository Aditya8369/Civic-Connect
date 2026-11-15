import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Megaphone,
  Radio,
  Send,
  XCircle,
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

const selectClassName =
  'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

export function AdminBroadcastPage() {
  const { user } = useAuth()

  const [activeBroadcast, setActiveBroadcast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState(DEFAULT_BROADCAST_SEVERITY)
  const [formError, setFormError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [ending, setEnding] = useState(false)

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

    setPublishing(true)
    setFormError('')

    try {
      await publishEmergencyBroadcast(
        { title: cleanTitle, message: cleanMessage, severity },
        { actorUid: user?.uid }
      )

      setTitle('')
      setMessage('')
      setSeverity(DEFAULT_BROADCAST_SEVERITY)
      toast.success('Emergency alert published to all citizens')
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

  return (
    <div>
      <PageHeader
        title="Emergency Broadcasts"
        description="Publish citywide announcements to every active citizen"
      />

      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30">
                <Radio className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle>Active citywide alert</CardTitle>
                <CardDescription>
                  The banner citizens currently see in their portal
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
                    Live for all citizens
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
                No citywide alert is active. Use the composer below to publish
                one.
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
                <CardTitle>Compose broadcast</CardTitle>
                <CardDescription>
                  Publishing a new alert replaces the currently active one
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handlePublish} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="broadcast-title">Alert title</Label>
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
                  placeholder="e.g. Water supply shutdown in Ward 4"
                  disabled={publishing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="broadcast-severity">Severity</Label>
                <select
                  id="broadcast-severity"
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value)}
                  disabled={publishing}
                  className={selectClassName}
                >
                  {BROADCAST_SEVERITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedSeverity.description}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="broadcast-message">Message</Label>
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
                  placeholder="Explain what is happening, which areas are affected, and any action residents should take..."
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
                <CardTitle>Citizen preview</CardTitle>
                <CardDescription>
                  How the banner will look in the citizen portal
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
                  'Your citywide message will appear here for every active citizen.',
                severity,
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
