
import { useState, useEffect } from 'react'
import { Camera, Save, Loader2, BellRing } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

export function ProfilePage() {
  const { user, updateUserProfile } = useAuth()

  const [name, setName] = useState(user?.name || '')
  const [email] = useState(user?.email || '')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
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

  // Load the user's personal profile information.
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }

    let cancelled = false

    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled || !snap.exists()) return

        const data = snap.data()

        if (data.name) setName(data.name)
        setPhone(data.phone || '')
        setAddress(data.address || '')
      })
      .catch((err) => {
        console.error('Profile load error:', err)
        toast.error('Could not load your saved profile')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid])

  // Load the user's saved notification preferences.
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
        console.error('Could not load notification preferences:', error)
        toast.error('Could not load notification preferences')
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid])

  // Save sound and email digest preferences.
  const handlePreferenceChange = async (key, value) => {
    if (!user?.uid || updatingPreference) return

    setUpdatingPreference(key)

    try {
      if (key === 'sound' && value) {
        const initialized = await initializeNotificationAudio()

        if (!initialized) {
          toast.error(
            'Your browser could not initialize notification audio'
          )
          return
        }
      }

      const updatedPreferences = await saveNotificationPreferences(
        user.uid,
        { [key]: value }
      )

      setPreferences(updatedPreferences)
      toast.success('Notification preferences updated')
    } catch (error) {
      console.error('Could not update notification preferences:', error)
      toast.error('Could not update notification preferences')
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

        setPermissionStatus(result.status)

        if (result.status !== 'granted') {
          if (result.status === 'denied') {
            toast.error(
              'Push notifications are blocked in your browser settings.'
            )
          } else if (result.status === 'unsupported') {
            toast.error(
              'Your browser does not support push notifications.'
            )
          } else {
            toast.error('Could not enable push notifications.')
          }

          return
        }

        const updatedPreferences = await saveNotificationPreferences(
          user.uid,
          { push: true }
        )

        setPreferences(updatedPreferences)
        toast.success('Push notifications enabled!')
        return
      }

      // Disable push without deleting the saved FCM token.
      const updatedPreferences = await saveNotificationPreferences(
        user.uid,
        { push: false }
      )

      setPreferences(updatedPreferences)
      toast.success('Push notifications disabled')
    } catch (error) {
      console.error('Could not update push notifications:', error)
      toast.error('Could not update push notification settings')
    } finally {
      setRequestingPush(false)
      setUpdatingPreference(null)
    }
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U'

  const handleSave = async (e) => {
    e.preventDefault()

    if (saving) return

    const cleanName = name.trim()
    const cleanPhone = phone.trim()

    if (!cleanName) {
      toast.error('Please enter your name')
      return
    }

    if (cleanPhone && !/^[\d\s()+.-]{7,20}$/.test(cleanPhone)) {
      toast.error('Please enter a valid phone number')
      return
    }

    setSaving(true)

    try {
      await updateUserProfile({
        name: cleanName,
        phone: cleanPhone,
        address: address.trim(),
      })

      setName(cleanName)
      toast.success('Profile updated successfully!')
    } catch (err) {
      console.error('Profile save error:', err)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Manage your account settings"
      />

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-xl font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <button
                  type="button"
                  aria-label="Change profile photo"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm hover:bg-primary-700 transition-colors"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {user?.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user?.email}
                </p>
                <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 mt-1 capitalize">
                  {user?.role}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={email}
                  disabled
                  className="bg-gray-50 dark:bg-gray-800/50"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="123 Main Street, City"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={loading}
                />
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
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              Notification Preferences
            </CardTitle>

            <CardDescription>
              Choose how you want to receive complaint updates and other notifications.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Sound notifications */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sound Notifications
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Play a sound when new complaint or status update notifications arrive.
                </p>
              </div>

              <PreferenceSwitch
                label="Sound notifications"
                checked={preferences.sound}
                onChange={(value) =>
                  handlePreferenceChange('sound', value)
                }
                disabled={preferencesLoading || updatingPreference !== null}
              />
            </div>

            {/* Browser push notifications */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Browser Push Notifications
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Receive browser alerts about complaint updates, assignments, and resolutions.
                </p>

                {permissionStatus === 'denied' && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Browser permission is blocked. Change notification permissions in your browser&apos;s site settings before enabling this option.
                  </p>
                )}

                {permissionStatus === 'unsupported' && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    This browser does not support push notifications.
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {requestingPush && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                )}

                <PreferenceSwitch
                  label="Browser push notifications"
                  checked={preferences.push}
                  onChange={handlePushPreferenceChange}
                  disabled={
                    preferencesLoading ||
                    requestingPush ||
                    updatingPreference !== null ||
                    permissionStatus === 'unsupported'
                  }
                />
              </div>
            </div>

            {/* Email digest notifications */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Email Digest
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Save your preference for receiving complaint summaries by email when digest delivery is available.
                </p>
              </div>

              <PreferenceSwitch
                label="Email digest notifications"
                checked={preferences.emailDigest}
                onChange={(value) =>
                  handlePreferenceChange('emailDigest', value)
                }
                disabled={preferencesLoading || updatingPreference !== null}
              />
            </div>

            {preferencesLoading && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Loading your notification preferences...
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
