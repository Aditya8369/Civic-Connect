

import { useState, useEffect } from 'react'
import { Camera, Save, Loader2, BellRing, Trophy } from 'lucide-react'
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
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/firebase/notificationPreferences'
import { useCivicGamification } from '@/hooks/useCivicGamification'
import { BadgesShowcaseCard } from '@/components/citizen/BadgesShowcaseCard'
import { CivicChampionLeaderboardCard } from '@/components/citizen/CivicChampionLeaderboardCard'
import { useLanguage } from '@/contexts/LanguageContext'
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
  const { t } = useLanguage()

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
  const [preferences, setPreferences] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const [preferencesLoading, setPreferencesLoading] = useState(true)

  // Live Civic Gamification & Leaderboard State
  const {
    badges,
    score,
    level,
    stats: gamificationStats,
    leaderboard,
    currentUserRank,
    loading: gamificationLoading,
  } = useCivicGamification(user)

  const handleEnablePush = async () => {
    setRequestingPush(true)

    try {
      const res = await requestPushPermission(user?.uid)
      setPermissionStatus(res.status)

      if (res.status === 'granted') {
        toast.success(t('profilePushEnabled'))
      } else if (res.status === 'denied') {
        toast(t('profilePushNotEnabled'), { icon: 'ℹ️' })
      }
    } catch (err) {
      console.error('Error enabling push notifications:', err)
      toast.error(t('profilePushError'))
    } finally {
      setRequestingPush(false)
    }
  }

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
        toast.error(t('profileLoadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid, t])

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
        toast.error(t('profilePreferencesLoadError'))
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid, t])

  // Save sound and email digest preferences.
  const handlePreferenceChange = async (key, value) => {
    if (!user?.uid || updatingPreference) return

    setUpdatingPreference(key)

    try {
      if (key === 'sound' && value) {
        const initialized = await initializeNotificationAudio()

        if (!initialized) {
          toast.error(t('profileAudioInitError'))
          return
        }
      }

      const updatedPreferences = await saveNotificationPreferences(
        user.uid,
        { [key]: value }
      )

      setPreferences(updatedPreferences)
      toast.success(t('profilePreferencesUpdated'))
    } catch (error) {
      console.error('Could not update notification preferences:', error)
      toast.error(t('profilePreferencesUpdateError'))
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
            toast.error(t('profilePushBlocked'))
          } else if (result.status === 'unsupported') {
            toast.error(t('profilePushUnsupported'))
          } else {
            toast.error(t('profilePushEnableError'))
          }

          return
        }

        const updatedPreferences = await saveNotificationPreferences(
          user.uid,
          { push: true }
        )

        setPreferences(updatedPreferences)
        toast.success(t('profilePushTurnedOn'))
        return
      }

      // Disable push without deleting the saved FCM token.
      const updatedPreferences = await saveNotificationPreferences(
        user.uid,
        { push: false }
      )

      setPreferences(updatedPreferences)
      toast.success(t('profilePushTurnedOff'))
    } catch (error) {
      console.error('Could not update push notifications:', error)
      toast.error(t('profilePushSettingsError'))
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
      toast.error(t('profileEnterName'))
      return
    }

    if (cleanPhone && !/^[\d\s()+.-]{7,20}$/.test(cleanPhone)) {
      toast.error(t('profileInvalidPhone'))
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
      toast.success(t('profileUpdated'))
    } catch (err) {
      console.error('Profile save error:', err)
      toast.error(t('profileUpdateError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('profile')}
        description={t('profileDescription')}
      />

      <div className="max-w-3xl space-y-6">
        {/* User Identity Header Card */}
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
                  aria-label={t('profileUploadPhoto')}
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

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 capitalize">
                    {user?.role}
                  </span>

                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <Trophy className="h-3 w-3 text-amber-500" />
                    {level?.title || t('profileCivicExplorer')}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Badges & Gamification Showcase Card */}
        <BadgesShowcaseCard
          badges={badges}
          score={score}
          level={level}
          stats={gamificationStats}
          loading={gamificationLoading}
        />

        {/* Civic Champions Monthly Leaderboard Card */}
        <CivicChampionLeaderboardCard
          leaderboard={leaderboard}
          currentUserRank={currentUserRank}
          currentUserId={user?.uid}
          monthName={score?.monthName || t('profileThisMonth')}
          loading={gamificationLoading}
        />

        {/* Personal Information Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t('profilePersonalInformation')}</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('fullName')}</Label>
                <Input
                  id="fullName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  value={email}
                  disabled
                  className="bg-gray-50 dark:bg-gray-800/50"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="phone">{t('phoneNumber')}</Label>
                <Input
                  id="phone"
                  placeholder={t('profilePhonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">{t('address')}</Label>
                <Input
                  id="address"
                  placeholder={t('profileAddressPlaceholder')}
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

                  {saving ? t('saving') : t('saveChanges')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Notification Preferences Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              {t('profileNotificationPreferences')}
            </CardTitle>

            <CardDescription>
              {t('profileNotificationDescription')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Sound notifications */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('profileSoundNotifications')}
                </p>

                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t('profileSoundDescription')}
                </p>
              </div>

              <PreferenceSwitch
                label={t('profileSoundNotifications')}
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
                  {t('profileBrowserPush')}
                </p>

                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t('profileBrowserPushDescription')}
                </p>

                {permissionStatus === 'denied' && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    {t('profileBrowserPermissionBlocked')}
                  </p>
                )}

                {permissionStatus === 'unsupported' && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    {t('profileBrowserPushUnsupported')}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {requestingPush && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                )}

                <PreferenceSwitch
                  label={t('profileBrowserPush')}
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
                  {t('profileEmailDigest')}
                </p>

                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t('profileEmailDigestDescription')}
                </p>
              </div>

              <PreferenceSwitch
                label={t('profileEmailDigest')}
                checked={preferences.emailDigest}
                onChange={(value) =>
                  handlePreferenceChange('emailDigest', value)
                }
                disabled={preferencesLoading || updatingPreference !== null}
              />
            </div>

            {preferencesLoading && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('profileLoadingPreferences')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
