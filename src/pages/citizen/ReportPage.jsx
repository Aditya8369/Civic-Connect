import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Crosshair, Send } from 'lucide-react'
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { generateComplaintId } from '@/firebase/complaintId'
import { addNotificationToBatch } from '@/firebase/notifications'
import { addComplaintEventToBatch } from '@/firebase/complaintEvents'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from 'react-hot-toast'

const categories = [
  'Potholes & Road Damage',
  'Streetlight Issues',
  'Water Leakage',
  'Garbage & Sanitation',
  'Noise Pollution',
  'Illegal Construction',
  'Traffic Issues',
  'Other',
]

export function ReportPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6))
        setLongitude(position.coords.longitude.toFixed(6))
        setLocating(false)
        toast.success('Location retrieved')
      },
      () => {
        setLocating(false)
        toast.error('Could not retrieve location. Please enter coordinates manually.')
      }
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!category || !title || !description || !address) {
      toast.error('Please fill in all required fields')
      return
    }
    setSubmitting(true)
    try {
      const complaintId = await generateComplaintId()
      // Complaint and admin notification commit together, so a failed notification
      // can't leave behind a saved complaint that the citizen then re-submits.
      const batch = writeBatch(db)
      const issueRef = doc(collection(db, 'issues'))
      batch.set(issueRef, {
        complaintId,
        title,
        description,
        category,
        address,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        status: 'Pending',
        department: '',
        reportedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      addComplaintEventToBatch(batch, issueRef.id, {
        actorUid: user.uid,
        action: 'Complaint submitted',
        previousStatus: null,
        newStatus: 'Pending',
        remarks: description || 'Complaint submitted',
      })
      addNotificationToBatch(batch, {
        recipientRole: 'admin',
        senderUid: user.uid,
        issueId: complaintId,
        type: 'new_complaint',
        title: 'New Complaint Submitted',
        message: 'A citizen has submitted a new complaint.',
      })
      await batch.commit()
      toast.success('Complaint submitted successfully!')
      navigate('/my-reports')
    } catch (err) {
      console.error('Complaint submission failed:', err)
      toast.error('Failed to submit complaint. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="New Complaint"
        description="Submit a new civic complaint"
      />

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Complaint Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Pothole on Main Street"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <textarea
                  id="description"
                  rows={4}
                  className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 resize-none"
                  placeholder="Describe the issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="address"
                    className="pl-9"
                    placeholder="e.g. 123 Main Street, Downtown"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    id="latitude"
                    type="text"
                    placeholder="28.6139"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input
                    id="longitude"
                    type="text"
                    placeholder="77.2090"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                  />
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={getCurrentLocation}
                disabled={locating}
              >
                <Crosshair className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} />
                {locating ? 'Getting location...' : 'Use Current Location'}
              </Button>

              <motion.div whileTap={{ scale: 0.98 }}>
                <Button type="submit" className="w-full gap-2 h-11" disabled={submitting}>
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit Complaint'}
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
