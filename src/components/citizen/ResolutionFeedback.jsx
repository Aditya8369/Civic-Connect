import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import VoiceRecorder from '@/components/citizen/VoiceRecorder'
import { FEEDBACK_TAGS, submitResolutionFeedback } from '@/firebase/resolutionFeedback'

const REACTIONS = ['Very dissatisfied', 'Dissatisfied', 'Okay', 'Satisfied', 'Very satisfied']

function ReactionFace({ index }) {
  const mouths = ['M11 24 Q18 16 25 24', 'M12 23 Q18 18 24 23', 'M13 22 H23', 'M11 20 Q18 28 25 20', 'M10 19 Q18 21 26 19 Q18 32 10 19']
  return (
    <svg aria-hidden="true" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill={['#F7AA95', '#F9BE82', '#FADB82', '#D5E793', '#A9E3B0'][index]} />
      <circle cx="12" cy="13" r="1.6" fill="#334155" />
      <circle cx="24" cy="13" r="1.6" fill="#334155" />
      <path d={mouths[index]} fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ResolutionFeedback({ issueId, title, feedback }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState([])
  const [comment, setComment] = useState('')
  const [photo, setPhoto] = useState(null)
  const [voice, setVoice] = useState(null)
  const [media, setMedia] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')
  const pending = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (pending.current || feedback || saved || !rating) return
    pending.current = true
    setSaving(true)
    setError('')
    try {
      await submitResolutionFeedback(issueId, { rating, tags, comment, photo, voice })
      setSaved({ rating, tags, comment: comment.trim() })
    } catch (failure) {
      setError(failure.code === 'unavailable' ? 'Couldn’t reach the server. Reconnect and try again.' :
        failure.code ? 'Couldn’t save your feedback. Please try again.' :
          failure.message || 'Couldn’t save your feedback. Please try again.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  const submitted = saving ? null : feedback || saved
  if (submitted && !open) {
    return (
      <div className="space-y-2" role="status">
        <p className="font-semibold">Thank you! Your feedback was submitted.</p>
        {REACTIONS[submitted.rating - 1] && <p>{REACTIONS[submitted.rating - 1]}</p>}
        {submitted.tags?.length > 0 && <p>{submitted.tags.join(' · ')}</p>}
        {submitted.comment && <p className="whitespace-pre-wrap break-words">{submitted.comment}</p>}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending.current) setOpen(next) }}>
      <DialogTrigger asChild><Button>Leave feedback</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto">
        <DialogHeader className="pr-6">
          <DialogTitle>{submitted ? 'Thank you for your feedback!' : 'How did the resolution go?'}</DialogTitle>
          <DialogDescription>
            {submitted ? 'Your feedback was saved.' : `How satisfied are you with the resolution of “${title}”?`}
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <Button onClick={() => setOpen(false)}>Done</Button>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <fieldset disabled={saving} className="min-w-0 space-y-4">
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-semibold">Choose a reaction</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {REACTIONS.map((label, index) => (
                    <label key={label} className="cursor-pointer">
                      <input required type="radio" name="resolution-reaction" checked={rating === index + 1}
                        onChange={() => setRating(index + 1)} className="peer sr-only" />
                      <span className="flex h-full flex-col items-center gap-1 rounded-lg border border-gray-300 p-2 text-center text-xs peer-checked:border-primary-600 peer-checked:bg-primary-100 peer-checked:font-bold peer-checked:text-primary-900 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600">
                        <ReactionFace index={index} />{label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">What went well? (optional)</legend>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_TAGS.map((tag) => (
                    <label key={tag} className="cursor-pointer">
                      <input type="checkbox" checked={tags.includes(tag)} className="peer sr-only"
                        onChange={(event) => setTags(event.target.checked ? [...tags, tag] : tags.filter((item) => item !== tag))} />
                      <span className="inline-block rounded-full border border-gray-300 px-3 py-2 text-sm peer-checked:border-primary-600 peer-checked:bg-primary-100 peer-checked:text-primary-900 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600">{tag}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm">Comment (optional)
                <textarea className="mt-1 block w-full rounded-md border border-gray-300 bg-transparent p-2" rows={2}
                  maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <label className="block text-sm">Add confirmation (optional)
                <select className="ml-2 rounded-md border bg-white p-1 dark:bg-gray-900" value={media}
                  onChange={(event) => { setMedia(event.target.value); setPhoto(null); setVoice(null) }}>
                  <option value="">No attachment</option>
                  <option value="photo">Photo</option>
                  <option value="voice">Voice note</option>
                </select>
              </label>
              {media === 'photo' && <label className="block text-sm">Choose a photo
                <input type="file" accept="image/jpeg,image/png" className="mt-1 block w-full"
                  onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
                {photo && <span>Selected: {photo.name}</span>}
              </label>}
              {media === 'voice' && <VoiceRecorder onRecordingComplete={setVoice} disabled={saving} />}
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
            {saving && <p role="status" className="text-sm">Saving your feedback…</p>}
            <Button type="submit" disabled={saving}>Submit feedback</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
