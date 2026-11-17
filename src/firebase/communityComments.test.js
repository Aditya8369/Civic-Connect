// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  subscribeToIssueComments,
  createCommentSubscriptionManager,
  postIssueComment,
} from './communityComments'

const runtime = vi.hoisted(() => ({
  activeListeners: new Map(),
  addedDocs: [],
}))

vi.mock('./services', () => ({ db: {} }))

vi.mock('firebase/firestore', () => {
  return {
    collection: (_db, ...paths) => paths.join('/'),
    query: (ref, ..._ops) => ({ path: ref }),
    orderBy: (field, dir) => ({ field, dir }),
    serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
    addDoc: async (ref, data) => {
      runtime.addedDocs.push({ ref, data })
      return { id: `doc-${runtime.addedDocs.length}` }
    },
    onSnapshot: (queryObj, onNext, onError) => {
      const unsub = vi.fn(() => {
        runtime.activeListeners.delete(queryObj.path)
      })
      runtime.activeListeners.set(queryObj.path, { onNext, onError, unsub })
      return unsub
    },
  }
})

describe('communityComments service (Issue #233)', () => {
  beforeEach(() => {
    runtime.activeListeners.clear()
    runtime.addedDocs = []
    vi.clearAllMocks()
  })

  describe('subscribeToIssueComments', () => {
    it('throws error when issueId is missing', () => {
      expect(() => subscribeToIssueComments('')).toThrow(
        'issueId is required to subscribe to comments'
      )
    })

    it('subscribes to issues/{issueId}/comments and returns unsubscribe handle', () => {
      const onComments = vi.fn()
      const unsubscribe = subscribeToIssueComments('issue-123', onComments)

      expect(typeof unsubscribe).toBe('function')
      expect(runtime.activeListeners.has('issues/issue-123/comments')).toBe(true)

      // Simulate snapshot emission
      const entry = runtime.activeListeners.get('issues/issue-123/comments')
      entry.onNext({
        docs: [
          { id: 'c1', data: () => ({ text: 'First comment', authorName: 'Alice' }) },
          { id: 'c2', data: () => ({ text: 'Second comment', authorName: 'Bob' }) },
        ],
      })

      expect(onComments).toHaveBeenCalledWith([
        { id: 'c1', text: 'First comment', authorName: 'Alice' },
        { id: 'c2', text: 'Second comment', authorName: 'Bob' },
      ])

      // Calling unsubscribe frees the listener
      unsubscribe()
      expect(entry.unsub).toHaveBeenCalled()
      expect(runtime.activeListeners.has('issues/issue-123/comments')).toBe(false)
    })

    it('handles query error gracefully via onError callback', () => {
      const onComments = vi.fn()
      const onError = vi.fn()
      subscribeToIssueComments('issue-err', onComments, onError)

      const entry = runtime.activeListeners.get('issues/issue-err/comments')
      const fakeError = new Error('Permission denied')
      entry.onError(fakeError)

      expect(onError).toHaveBeenCalledWith(fakeError)
    })
  })

  describe('createCommentSubscriptionManager', () => {
    it('manages real-time listeners and prevents duplicate subscriptions', () => {
      const manager = createCommentSubscriptionManager()
      const onComments1 = vi.fn()
      const onComments2 = vi.fn()

      const firstCall = manager.subscribe('issue-1', onComments1)
      expect(firstCall).toBe(true)
      expect(manager.size).toBe(1)
      expect(manager.has('issue-1')).toBe(true)
      expect(manager.getActiveIssueIds()).toEqual(['issue-1'])

      // Attempting to subscribe to the same issue again is a no-op
      const secondCall = manager.subscribe('issue-1', onComments2)
      expect(secondCall).toBe(false)
      expect(manager.size).toBe(1)
    })

    it('unsubscribes and prunes listener on drawer collapse', () => {
      const manager = createCommentSubscriptionManager()
      manager.subscribe('issue-collapse', vi.fn())
      expect(manager.has('issue-collapse')).toBe(true)

      const unsubResult = manager.unsubscribe('issue-collapse')
      expect(unsubResult).toBe(true)
      expect(manager.has('issue-collapse')).toBe(false)
      expect(manager.size).toBe(0)
      expect(runtime.activeListeners.has('issues/issue-collapse/comments')).toBe(false)
    })

    it('returns false when attempting to unsubscribe non-existent listener', () => {
      const manager = createCommentSubscriptionManager()
      expect(manager.unsubscribe('non-existent')).toBe(false)
      expect(manager.unsubscribe('')).toBe(false)
    })

    it('unsubscribes all active listeners cleanly on unmount (unsubscribeAll)', () => {
      const manager = createCommentSubscriptionManager()
      manager.subscribe('issue-a', vi.fn())
      manager.subscribe('issue-b', vi.fn())
      manager.subscribe('issue-c', vi.fn())

      expect(manager.size).toBe(3)
      expect(manager.getActiveIssueIds()).toEqual(['issue-a', 'issue-b', 'issue-c'])

      manager.unsubscribeAll()

      expect(manager.size).toBe(0)
      expect(manager.getActiveIssueIds()).toEqual([])
      expect(runtime.activeListeners.size).toBe(0)
    })

    it('continues cleaning up other listeners if one unsubscribe throws', () => {
      const manager = createCommentSubscriptionManager()
      manager.subscribe('issue-x', vi.fn())
      manager.subscribe('issue-y', vi.fn())

      // Force issue-x unsub to throw
      const entryX = runtime.activeListeners.get('issues/issue-x/comments')
      entryX.unsub.mockImplementationOnce(() => {
        throw new Error('Unsub error')
      })

      expect(() => manager.unsubscribeAll()).not.toThrow()
      expect(manager.size).toBe(0)
      expect(runtime.activeListeners.has('issues/issue-y/comments')).toBe(false)
    })
  })

  describe('postIssueComment', () => {
    it('throws error when required fields are missing or empty', async () => {
      await expect(postIssueComment({ issueId: '', text: 'Hello', authorId: 'u1' })).rejects.toThrow(
        'issueId is required'
      )
      await expect(postIssueComment({ issueId: 'i1', text: '   ', authorId: 'u1' })).rejects.toThrow(
        'Comment text cannot be empty'
      )
      await expect(postIssueComment({ issueId: 'i1', text: 'Hello', authorId: '' })).rejects.toThrow(
        'authorId is required'
      )
    })

    it('persists trimmed comment document with server timestamp', async () => {
      const docRef = await postIssueComment({
        issueId: 'issue-456',
        text: '  Please fix the pothole quickly!  ',
        authorName: 'Concerned Citizen',
        authorId: 'user-789',
      })

      expect(docRef.id).toBe('doc-1')
      expect(runtime.addedDocs).toHaveLength(1)
      expect(runtime.addedDocs[0]).toEqual({
        ref: 'issues/issue-456/comments',
        data: {
          text: 'Please fix the pothole quickly!',
          authorName: 'Concerned Citizen',
          authorId: 'user-789',
          createdAt: 'MOCK_SERVER_TIMESTAMP',
        },
      })
    })
  })
})
