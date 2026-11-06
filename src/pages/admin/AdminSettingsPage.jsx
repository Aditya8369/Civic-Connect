import { useState, useEffect } from 'react'
import { Save, Shield, Bell, Globe, Loader2 } from 'lucide-react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'

export function AdminSettingsPage() {
  const [city, setCity] = useState('New York')
  const [email, setEmail] = useState('admin@civicconnect.gov')
  const [autoAssign, setAutoAssign] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
        { city: cleanCity, adminEmail: cleanEmail, autoAssign, updatedAt: serverTimestamp() },
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
                <CardDescription>Configure your municipality details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="city">City / Municipality</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Admin Email</Label>
                <Input id="adminEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-assign Reports</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Automatically assign reports to available officers</p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setAutoAssign(!autoAssign)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${autoAssign ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoAssign ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" className="gap-2" disabled={saving || loading}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
                <CardDescription>Configure alert preferences</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {['New Report Submitted', 'Report Status Changed', 'Escalated Reports', 'Daily Digest'].map((item) => (
              <div key={item} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-primary-600">
                  <span className="inline-block h-4 w-4 translate-x-6 transform rounded-full bg-white" />
                </div>
              </div>
            ))}
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
                <p className="text-sm font-medium text-gray-900 dark:text-white">Delete all data</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Permanently delete all reports and user data</p>
              </div>
              <Button variant="destructive" size="sm">Delete All</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}