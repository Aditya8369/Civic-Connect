
import { useState, useEffect } from 'react'
import { Save, Shield, Bell, Globe, Loader2 } from 'lucide-react'
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/services'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'
import {
  getPushPermissionStatus,
  requestPushPermission,
} from '@/firebase/notifications'
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '@/firebase/notificationPreferences'
import { initializeNotificationAudio } from '@/utils/notificationAudio'
import toast from 'react-hot-toast'

function PreferenceSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />

      <span
        aria-hidden="true"
        className={`relative h-6 w-11 rounded-full transition-colors
          peer-focus-visible:outline peer-focus-visible:outline-2
          peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-600
          peer-disabled:cursor-not-allowed peer-disabled:opacity-50
          ${checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform
            ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </span>
    </label>
  )
}

export function AdminSettingsPage() {
  const { user } = useAuth()

  const [city, setCity] = useState('New York')
  const [email, setEmail] = useState('admin@civicconnect.gov')
  const [autoAssign, setAutoAssign] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [permissionStatus, setPermissionStatus] = useState(() =>
    getPushPermissionStatus()
  )
  const [requestingPush, setRequestingPush] = useState(false)
  const [updatingPreference, setUpdatingPreference] = useState(null)

  const [preferences, setPreferences] = useState({
    sound: true,
    push: false,
    emailDigest: true,
  })
  const [preferencesLoading, setPreferencesLoading] = useState(true)

  // Load general platform settings.
  useEffect(() => {
    let cancelled = false

    getDoc(doc(db, 'settings', 'general'))
      .then((snap) => {
        if (cancelled || !snap.exists()) return

        const data = snap.data()

        if (data.city !== undefined) setCity(data.city)
        if (data.adminEmail !== undefined) setEmail(data.adminEmail)
        if (data.autoAssign !== undefined) setAutoAssign(data.autoAssign)
      })
      .catch((err) => {
        console.error('Settings load error:', err)
        toast.error('Could not load saved settings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Load notification preferences for the signed-in administrator.
  useEffect(() => {
    if (!user?.uid) {
      setPreferencesLoading(false)
      return
    }

    let cancelled = false

    setPreferencesLoading(true)

    loadNotificationPreferences(user.uid)
      .then((savedPreferences) => {
        if (!cancelled) {
          setPreferences(savedPreferences)
        }
      })
      .catch((error) => {
        console.error('Notification preferences load error:', error)
        toast.error('Could not load notification preferences')
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid])

  const handleSave = async (e) => {
    e.preventDefault()

    if (saving) return

    const cleanCity = city.trim()
    const cleanEmail = email.trim()

    if (!cleanCity) {
      toast.error('Please enter the city or municipality')
      return
    }

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      toast.error('Please enter a valid admin email')
      return
    }

    setSaving(true)

    try {
      await setDoc(
        doc(db, 'settings', 'general'),
        {
          city: cleanCity,
          adminEmail: cleanEmail,
          autoAssign,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      toast.success('Settings saved successfully!')
    } catch (err) {
      console.error('Settings save error:', err)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Save sound and email digest preferences.
  const handlePreferenceChange = async (key, enabled) => {
    if (!user?.uid || updatingPreference) return

    setUpdatingPreference(key)

    try {
      if (key === 'sound' && enabled) {
        const audioReady = await initializeNotificationAudio()

        if (!audioReady) {
          toast.error(
            'Sound notifications are not supported or could not be enabled'
          )
          return
        }
      }

      const updatedPreferences = await saveNotificationPreferences(
        user.uid,
        { [key]: enabled }
      )

      setPreferences(updatedPreferences)
      toast.success('Notification preference updated')
    } catch (error) {
      console.error('Notification preference update error:', error)
      toast.error('Could not update notification preference')
    } finally {
      setUpdatingPreference(null)
    }
  }

  // Push notifications require browser permission.
  const handlePushPreferenceChange = async (enabled) => {
    if (!user?.uid || requestingPush || updatingPreference) return

    setRequestingPush(true)
    setUpdatingPreference('push')

    try {
      if (enabled) {
        const result = await requestPushPermission(user.uid)

        setPermissionStatus(getPushPermissionStatus())

        if (result.status !== 'granted') {
          toast.error(
            result.status === 'denied'
              ? 'Browser notification permission was denied'
              : 'Could not enable browser notifications'
          )
          return
        }

        const updatedPreferences = await saveNotificationPreferences(
          user.uid,
          { push: true }
        )

        setPreferences(updatedPreferences)
        toast.success('Browser push notifications enabled')
      } else {
        // Disable push without deleting the saved FCM token.
        const updatedPreferences = await saveNotificationPreferences(
          user.uid,
          { push: false }
        )

        setPreferences(updatedPreferences)
        toast.success('Browser push notifications disabled')
      }
    } catch (error) {
      console.error('Push preference update error:', error)
      toast.error('Could not update browser notification settings')
    } finally {
      setRequestingPush(false)
      setUpdatingPreference(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage platform settings and preferences"
      />

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
                <Globe className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  Configure your municipality details
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="city">City / Municipality</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail">Admin Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Auto-assign Reports
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Automatically assign reports to available officers
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-label="Auto-assign Reports"
                  aria-checked={autoAssign}
                  disabled={loading}
                  onClick={() => setAutoAssign(!autoAssign)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                    autoAssign
                      ? 'bg-primary-600'
                      : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoAssign ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={saving || loading}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Manage your personal notification preferences
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sound Notifications
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Play a sound when supported new notifications arrive
                </p>
              </div>

              <PreferenceSwitch
                label="Sound Notifications"
                checked={preferences.sound}
                disabled={preferencesLoading || updatingPreference !== null}
                onChange={(enabled) =>
                  handlePreferenceChange('sound', enabled)
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Browser Push Notifications
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Receive notifications through your browser
                  {permissionStatus === 'denied' &&
                    ' — permission is blocked in your browser settings'}
                </p>
              </div>

              <PreferenceSwitch
                label="Browser Push Notifications"
                checked={preferences.push}
                disabled={
                  preferencesLoading ||
                  requestingPush ||
                  updatingPreference !== null ||
                  permissionStatus === 'unsupported'
                }
                onChange={handlePushPreferenceChange}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Email Digest
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Save your preference for receiving email notification summaries when available
                </p>
              </div>

              <PreferenceSwitch
                label="Email Digest"
                checked={preferences.emailDigest}
                disabled={preferencesLoading || updatingPreference !== null}
                onChange={(enabled) =>
                  handlePreferenceChange('emailDigest', enabled)
                }
              />
            </div>

            {preferencesLoading && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Loading notification preferences...
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30">
                <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle>Danger Zone</CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Delete all data
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Permanently delete all reports and user data
                </p>
              </div>

              <Button variant="destructive" size="sm">
                Delete All
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
