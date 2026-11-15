
import { useState, useEffect } from 'react'
import { Save, Shield, Bell, Globe, Loader2, MessageSquareText, Pencil, Trash2, Plus, X } from 'lucide-react'
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
import { useLanguage } from '@/contexts/LanguageContext'
import {
  getPushPermissionStatus,
  requestPushPermission,
} from '@/firebase/notifications'
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '@/firebase/notificationPreferences'
import { initializeNotificationAudio } from '@/utils/notificationAudio'
import {
  RESOLUTION_TEMPLATE_BODY_MAX_LENGTH,
  RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH,
  createResolutionTemplateId,
  loadResolutionTemplates,
  saveResolutionTemplates,
} from '@/firebase/resolutionTemplates'
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
  const { t } = useLanguage()

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

  const [resolutionTemplates, setResolutionTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateTitle, setTemplateTitle] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [templateError, setTemplateError] = useState('')

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
        toast.error(t('adminSettingsLoadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [t])

  // Load canned resolution templates used by municipal officers.
  useEffect(() => {
    let cancelled = false

    loadResolutionTemplates()
      .then((templates) => {
        if (!cancelled) setResolutionTemplates(templates)
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
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
        toast.error(t('adminNotificationPreferencesLoadError'))
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid, t])

  const handleSave = async (e) => {
    e.preventDefault()

    if (saving) return

    const cleanCity = city.trim()
    const cleanEmail = email.trim()

    if (!cleanCity) {
      toast.error(t('adminEnterCity'))
      return
    }

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      toast.error(t('adminEnterValidEmail'))
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

      toast.success(t('adminSettingsSaved'))
    } catch (err) {
      console.error('Settings save error:', err)
      toast.error(t('adminSettingsSaveError'))
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
          toast.error(t('adminSoundNotificationsUnavailable'))
          return
        }
      }

      const updatedPreferences = await saveNotificationPreferences(
        user.uid,
        { [key]: enabled }
      )

      setPreferences(updatedPreferences)
      toast.success(t('adminNotificationPreferenceUpdated'))
    } catch (error) {
      console.error('Notification preference update error:', error)
      toast.error(t('adminNotificationPreferenceUpdateError'))
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
              ? t('adminBrowserPermissionDenied')
              : t('adminBrowserNotificationsEnableError')
          )
          return
        }

        const updatedPreferences = await saveNotificationPreferences(
          user.uid,
          { push: true }
        )

        setPreferences(updatedPreferences)
        toast.success(t('adminBrowserPushEnabled'))
      } else {
        // Disable push without deleting the saved FCM token.
        const updatedPreferences = await saveNotificationPreferences(
          user.uid,
          { push: false }
        )

        setPreferences(updatedPreferences)
        toast.success(t('adminBrowserPushDisabled'))
      }
    } catch (error) {
      console.error('Push preference update error:', error)
      toast.error(t('adminBrowserNotificationSettingsError'))
    } finally {
      setRequestingPush(false)
      setUpdatingPreference(null)
    }
  }

  const resetTemplateForm = () => {
    setTemplateTitle('')
    setTemplateBody('')
    setEditingTemplateId(null)
    setTemplateError('')
  }

  const persistResolutionTemplates = async (nextTemplates) => {
    setTemplateSaving(true)
    try {
      const saved = await saveResolutionTemplates(nextTemplates, user?.uid)
      setResolutionTemplates(saved)
      return true
    } catch (error) {
      console.error('Resolution template save error:', error)
      toast.error('Could not save resolution templates')
      return false
    } finally {
      setTemplateSaving(false)
    }
  }

  const handleTemplateSubmit = async (event) => {
    event.preventDefault()
    if (templateSaving) return

    const title = templateTitle.trim()
    const body = templateBody.trim()

    if (!title) {
      setTemplateError('Please enter a template title')
      return
    }
    if (!body) {
      setTemplateError('Please enter the resolution message')
      return
    }

    const nextTemplates = editingTemplateId
      ? resolutionTemplates.map((template) =>
          template.id === editingTemplateId
            ? { ...template, title, body }
            : template
        )
      : [
          ...resolutionTemplates,
          {
            id: createResolutionTemplateId(
              title,
              resolutionTemplates.map((template) => template.id)
            ),
            title,
            body,
          },
        ]

    const saved = await persistResolutionTemplates(nextTemplates)
    if (!saved) return

    toast.success(
      editingTemplateId
        ? 'Resolution template updated'
        : 'Resolution template added'
    )
    resetTemplateForm()
  }

  const handleEditTemplate = (template) => {
    setEditingTemplateId(template.id)
    setTemplateTitle(template.title)
    setTemplateBody(template.body)
    setTemplateError('')
  }

  const handleDeleteTemplate = async (template) => {
    if (templateSaving) return

    if (
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm(`Delete the "${template.title}" resolution template?`)
    ) {
      return
    }

    const saved = await persistResolutionTemplates(
      resolutionTemplates.filter((item) => item.id !== template.id)
    )
    if (!saved) return

    if (editingTemplateId === template.id) resetTemplateForm()
    toast.success('Resolution template deleted')
  }

  return (
    <div>
      <PageHeader
        title={t('settings')}
        description={t('adminSettingsDescription')}
      />

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
                <Globe className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <CardTitle>{t('adminGeneralSettings')}</CardTitle>
                <CardDescription>
                  {t('adminMunicipalityDetailsDescription')}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="city">{t('adminCityMunicipality')}</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail">{t('adminEmail')}</Label>
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
                    {t('adminAutoAssignReports')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('adminAutoAssignDescription')}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-label={t('adminAutoAssignReports')}
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
                  {saving ? t('saving') : t('adminSaveSettings')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                <MessageSquareText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle>Resolution Templates</CardTitle>
                <CardDescription>
                  Create canned responses for officers to use when closing complaints
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {templatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading resolution templates...
              </div>
            ) : resolutionTemplates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No templates yet. Add your first canned response below.
              </div>
            ) : (
              <div className="space-y-2" aria-label="Resolution templates">
                {resolutionTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {template.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          {template.body}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${template.title}`}
                          onClick={() => handleEditTemplate(template)}
                          disabled={templateSaving}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${template.title}`}
                          onClick={() => handleDeleteTemplate(template)}
                          disabled={templateSaving}
                          className="text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleTemplateSubmit} className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <div className="space-y-2">
                <Label htmlFor="resolution-template-title">
                  {editingTemplateId ? 'Edit template title' : 'Template title'}
                </Label>
                <Input
                  id="resolution-template-title"
                  value={templateTitle}
                  maxLength={RESOLUTION_TEMPLATE_TITLE_MAX_LENGTH}
                  onChange={(event) => {
                    setTemplateTitle(event.target.value)
                    setTemplateError('')
                  }}
                  placeholder="e.g. Pothole filled"
                  disabled={templateSaving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resolution-template-body">
                  Resolution message
                </Label>
                <textarea
                  id="resolution-template-body"
                  rows={3}
                  value={templateBody}
                  maxLength={RESOLUTION_TEMPLATE_BODY_MAX_LENGTH}
                  onChange={(event) => {
                    setTemplateBody(event.target.value)
                    setTemplateError('')
                  }}
                  placeholder="Describe the completed work for citizens..."
                  disabled={templateSaving}
                  className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>

              {templateError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {templateError}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {editingTemplateId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetTemplateForm}
                    disabled={templateSaving}
                    className="gap-1.5"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={templateSaving || templatesLoading}
                  className="gap-1.5"
                >
                  {templateSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingTemplateId ? (
                    <Save className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {templateSaving
                    ? 'Saving...'
                    : editingTemplateId
                      ? 'Save Changes'
                      : 'Add Template'}
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
                <CardTitle>{t('notifications')}</CardTitle>
                <CardDescription>
                  {t('adminNotificationPreferencesDescription')}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('adminSoundNotifications')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('adminSoundNotificationsDescription')}
                </p>
              </div>

              <PreferenceSwitch
                label={t('adminSoundNotifications')}
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
                  {t('adminBrowserPushNotifications')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('adminBrowserPushDescription')}
                  {permissionStatus === 'denied' &&
                    ` — ${t('adminBrowserPermissionBlocked')}`}
                </p>
              </div>

              <PreferenceSwitch
                label={t('adminBrowserPushNotifications')}
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
                  {t('adminEmailDigest')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('adminEmailDigestDescription')}
                </p>
              </div>

              <PreferenceSwitch
                label={t('adminEmailDigest')}
                checked={preferences.emailDigest}
                disabled={preferencesLoading || updatingPreference !== null}
                onChange={(enabled) =>
                  handlePreferenceChange('emailDigest', enabled)
                }
              />
            </div>

            {preferencesLoading && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('adminLoadingNotificationPreferences')}
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
                <CardTitle>{t('adminDangerZone')}</CardTitle>
                <CardDescription>
                  {t('adminIrreversibleActions')}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('adminDeleteAllData')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('adminDeleteAllDataDescription')}
                </p>
              </div>

              <Button variant="destructive" size="sm">
                {t('adminDeleteAll')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
