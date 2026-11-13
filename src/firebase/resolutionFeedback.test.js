import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitResolutionFeedback } from './resolutionFeedback'

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'citizen' } },
  get: vi.fn(),
  update: vi.fn(),
  run: vi.fn(),
  getServer: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('./services', () => ({ db: {}, storage: {}, auth: mocks.auth }))
vi.mock('./storage', () => ({
  validateComplaintAudio: () => ({ valid: true }),
  validateComplaintPhoto: () => ({ valid: true }),
}))
vi.mock('firebase/storage', () => ({
  ref: (_, path) => path,
  uploadBytes: mocks.upload,
  deleteObject: mocks.remove,
}))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDocFromServer: mocks.getServer,
  runTransaction: mocks.run,
  serverTimestamp: () => 'server-time',
}))

const input = { rating: 4, tags: ['Quick response'], comment: ' Thanks ' }
const issue = { reportedBy: 'citizen', status: 'Resolved' }

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'citizen' }
  mocks.get.mockResolvedValue({ data: () => issue })
  mocks.getServer.mockResolvedValue({ data: () => issue })
  mocks.upload.mockResolvedValue(undefined)
  mocks.remove.mockResolvedValue(undefined)
  mocks.run.mockImplementation(async (_, callback) => callback(mocks))
})

describe('resolution feedback', () => {
  it('writes a compatible rating and selected tags', async () => {
    await submitResolutionFeedback('issue', input)
    expect(mocks.update).toHaveBeenCalledWith(undefined, {
      feedback: { rating: 4, tags: input.tags, comment: 'Thanks', attachment: null, submittedAt: 'server-time' },
      updatedAt: 'server-time',
    })
  })

  it.each([
    [{ ...issue, reportedBy: 'other' }, 'Only the citizen'],
    [{ ...issue, status: 'Reopened' }, 'once the issue is resolved'],
    [{ ...issue, feedback: { rating: 5 } }, 'already been submitted'],
  ])('rejects an ineligible issue', async (data, message) => {
    mocks.get.mockResolvedValue({ data: () => data })
    await expect(submitResolutionFeedback('issue', input)).rejects.toThrow(message)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('requires authentication and validates the reaction and tags', async () => {
    await expect(submitResolutionFeedback('issue', { ...input, rating: 0 })).rejects.toThrow('Choose a reaction')
    await expect(submitResolutionFeedback('issue', { ...input, tags: ['unknown'] })).rejects.toThrow('valid feedback tags')
    mocks.auth.currentUser = null
    await expect(submitResolutionFeedback('issue', input)).rejects.toThrow('Sign in')
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('rejects when Firestore does not commit', async () => {
    mocks.run.mockRejectedValueOnce(new Error('Connection lost'))
    await expect(submitResolutionFeedback('issue', input)).rejects.toThrow('Connection lost')
  })

  const voice = { blob: { size: 5 * 1024 * 1024, type: 'audio/webm' }, durationSeconds: 30 }

  it('rejects a voice note one byte over the limit before uploading', async () => {
    await expect(submitResolutionFeedback('issue', {
      ...input, voice: { ...voice, blob: { ...voice.blob, size: voice.blob.size + 1 } },
    })).rejects.toThrow('Voice notes must be 5 MiB or smaller')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('accepts the size boundary and deletes only its upload when another submission wins', async () => {
    const error = new Error('Feedback has already been submitted')
    mocks.run.mockRejectedValueOnce(error)
    mocks.getServer.mockResolvedValueOnce({ data: () => issue }).mockResolvedValueOnce({
      data: () => ({ ...issue, feedback: { attachment: { path: 'another-attempt' } } }),
    })
    await expect(submitResolutionFeedback('issue', { ...input, voice })).rejects.toBe(error)
    const path = mocks.upload.mock.calls[0][0]
    expect(path).toMatch(/^resolution-feedback\/citizen\/issue\//)
    expect(mocks.remove.mock.calls).toEqual([[path]])
  })

  it('preserves its attachment if the server reports that it was saved', async () => {
    const error = new Error('Commit response lost')
    mocks.run.mockRejectedValueOnce(error)
    mocks.getServer.mockResolvedValueOnce({ data: () => issue }).mockResolvedValueOnce({
      data: () => ({ ...issue, feedback: { attachment: { path: mocks.upload.mock.calls[0][0] } } }),
    })
    await expect(submitResolutionFeedback('issue', { ...input, voice })).rejects.toBe(error)
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('keeps the original submission error when deletion fails', async () => {
    const error = new Error('Transaction failed')
    mocks.run.mockRejectedValueOnce(error)
    mocks.remove.mockRejectedValueOnce(new Error('Storage unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(submitResolutionFeedback('issue', { ...input, voice })).rejects.toBe(error)
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('skips deletion if it cannot confirm the current server record', async () => {
    const error = new Error('Transaction failed')
    mocks.run.mockRejectedValueOnce(error)
    mocks.getServer.mockResolvedValueOnce({ data: () => issue }).mockRejectedValueOnce(new Error('Offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(submitResolutionFeedback('issue', { ...input, voice })).rejects.toBe(error)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
