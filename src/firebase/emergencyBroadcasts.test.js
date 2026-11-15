import { beforeEach, describe, expect, it, vi } from 'vitest'

const rt = vi.hoisted(() => ({
  batch: null,
  onNext: null,
  onError: null,
  unsubscribe: null,
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ type: 'collection', name })),
  doc: vi.fn((first, second, third) => {
    if (first?.type === 'collection') {
      return {
        type: 'doc',
        id: 'new-broadcast-id',
        collection: first.name,
      }
    }

    return {
      type: 'doc',
      id: third,
      collection: second,
    }
  }),
  where: vi.fn((field, operator, value) => ({ field, operator, value })),
  query: vi.fn((col, ...constraints) => ({ col, constraints })),
  onSnapshot: vi.fn((broadcastsQuery, onNext, onError) => {
    rt.onNext = onNext
    rt.onError = onError
    rt.unsubscribe = vi.fn()
    return rt.unsubscribe
  }),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  writeBatch: vi.fn(() => rt.batch),
  updateDoc: vi.fn(),
}))

vi.mock('./services', () => ({
  db: { name: 'db' },
}))

import {
  BROADCAST_MESSAGE_MAX_LENGTH,
  BROADCAST_TITLE_MAX_LENGTH,
  deactivateEmergencyBroadcast,
  getBroadcastCreatedAtMillis,
  isBroadcastSeverity,
  isEmergencyBroadcastActive,
  listenToActiveEmergencyBroadcast,
  normalizeBroadcastSeverity,
  normalizeEmergencyBroadcast,
  publishEmergencyBroadcast,
} from './emergencyBroadcasts'
import {
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

function snapshotDoc(id, data) {
  return { id, data: () => data }
}

describe('emergency broadcasts', () => {
  beforeEach(() => {
    rt.onNext = null
    rt.onError = null
    rt.unsubscribe = null
    rt.batch = {
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    }
    getDocs.mockResolvedValue({ docs: [] })
  })

  describe('severity helpers', () => {
    it('accepts only the supported severities', () => {
      expect(isBroadcastSeverity('info')).toBe(true)
      expect(isBroadcastSeverity('warning')).toBe(true)
      expect(isBroadcastSeverity('critical')).toBe(true)
      expect(isBroadcastSeverity('urgent')).toBe(false)
      expect(isBroadcastSeverity(undefined)).toBe(false)
    })

    it('falls back to the advisory severity for unknown values', () => {
      expect(normalizeBroadcastSeverity('critical')).toBe('critical')
      expect(normalizeBroadcastSeverity('bogus')).toBe('warning')
      expect(normalizeBroadcastSeverity(null)).toBe('warning')
    })
  })

  describe('normalizeEmergencyBroadcast', () => {
    it('trims input and applies safe defaults', () => {
      expect(
        normalizeEmergencyBroadcast({
          title: '  Water shutdown  ',
          message: '  Supply stops at 10am.  ',
        })
      ).toEqual({
        title: 'Water shutdown',
        message: 'Supply stops at 10am.',
        severity: 'warning',
        active: true,
      })
    })

    it('normalizes a missing severity and preserves an explicit active flag', () => {
      expect(
        normalizeEmergencyBroadcast({
          title: 'Storm advisory',
          message: 'Stay indoors.',
          severity: 'not-real',
          active: false,
        })
      ).toMatchObject({ severity: 'warning', active: false })
    })

    it('rejects missing or whitespace-only titles and messages', () => {
      expect(normalizeEmergencyBroadcast(null)).toBeNull()
      expect(
        normalizeEmergencyBroadcast({ title: '   ', message: 'Body' })
      ).toBeNull()
      expect(
        normalizeEmergencyBroadcast({ title: 'Title', message: '   ' })
      ).toBeNull()
    })

    it('caps the title and message to their maximum lengths', () => {
      const broadcast = normalizeEmergencyBroadcast({
        title: 'x'.repeat(BROADCAST_TITLE_MAX_LENGTH + 25),
        message: 'y'.repeat(BROADCAST_MESSAGE_MAX_LENGTH + 25),
      })

      expect(broadcast.title).toHaveLength(BROADCAST_TITLE_MAX_LENGTH)
      expect(broadcast.message).toHaveLength(BROADCAST_MESSAGE_MAX_LENGTH)
    })
  })

  describe('timestamps and activity', () => {
    it('reads Firestore timestamps, dates, numbers, and ISO strings', () => {
      expect(
        getBroadcastCreatedAtMillis({ createdAt: { toMillis: () => 1234 } })
      ).toBe(1234)
      expect(
        getBroadcastCreatedAtMillis({
          createdAt: new Date('2026-11-14T10:00:00Z'),
        })
      ).toBe(Date.parse('2026-11-14T10:00:00Z'))
      expect(getBroadcastCreatedAtMillis({ createdAt: 5000 })).toBe(5000)
      expect(
        getBroadcastCreatedAtMillis({ createdAt: '2026-11-14T10:00:00Z' })
      ).toBe(Date.parse('2026-11-14T10:00:00Z'))
      expect(getBroadcastCreatedAtMillis({ createdAt: 'not-a-date' })).toBe(0)
      expect(getBroadcastCreatedAtMillis(null)).toBe(0)
    })

    it('treats only populated broadcasts as active', () => {
      expect(
        isEmergencyBroadcastActive({
          title: 'Alert',
          message: 'Details',
          active: true,
        })
      ).toBe(true)
      expect(
        isEmergencyBroadcastActive({
          title: 'Alert',
          message: 'Details',
          active: false,
        })
      ).toBe(false)
      expect(
        isEmergencyBroadcastActive({ title: '', message: 'Details' })
      ).toBe(false)
      expect(isEmergencyBroadcastActive(null)).toBe(false)
    })
  })

  describe('listenToActiveEmergencyBroadcast', () => {
    it('queries only active broadcasts and returns the newest valid alert', () => {
      const onChange = vi.fn()

      const unsubscribe = listenToActiveEmergencyBroadcast(onChange)

      expect(unsubscribe).toBe(rt.unsubscribe)
      expect(where).toHaveBeenCalledWith('active', '==', true)
      expect(onSnapshot).toHaveBeenCalled()

      rt.onNext({
        docs: [
          snapshotDoc('older', {
            title: 'Older alert',
            message: 'Older message',
            severity: 'info',
            active: true,
            createdAt: new Date('2026-11-13T09:00:00Z'),
          }),
          snapshotDoc('newer', {
            title: 'Newer alert',
            message: 'Newer message',
            severity: 'critical',
            active: true,
            createdAt: { toMillis: () => Date.parse('2026-11-14T09:00:00Z') },
          }),
          snapshotDoc('invalid', {
            title: '',
            message: 'Missing title',
            active: true,
          }),
        ],
      })

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'newer',
          title: 'Newer alert',
          severity: 'critical',
        })
      )
    })

    it('reports null when no active broadcast exists', () => {
      const onChange = vi.fn()
      listenToActiveEmergencyBroadcast(onChange)

      rt.onNext({ docs: [] })

      expect(onChange).toHaveBeenCalledWith(null)
    })

    it('forwards listener errors and returns a no-op without a callback', () => {
      const onError = vi.fn()
      listenToActiveEmergencyBroadcast(vi.fn(), { onError })

      const error = new Error('permission denied')
      rt.onError(error)

      expect(onError).toHaveBeenCalledWith(error)
      expect(listenToActiveEmergencyBroadcast(null)).toEqual(expect.any(Function))
    })
  })

  describe('publishEmergencyBroadcast', () => {
    it('deactivates the previous alert and creates the new one atomically', async () => {
      getDocs.mockResolvedValue({
        docs: [{ ref: { id: 'previous-ref' } }],
      })

      const id = await publishEmergencyBroadcast(
        {
          title: '  Water shutdown  ',
          message: '  Supply stops at 10am.  ',
          severity: 'critical',
        },
        { actorUid: 'admin-1' }
      )

      expect(id).toBe('new-broadcast-id')
      expect(collection).toHaveBeenCalledWith(
        { name: 'db' },
        'broadcasts'
      )
      expect(writeBatch).toHaveBeenCalledWith({ name: 'db' })
      expect(rt.batch.update).toHaveBeenCalledWith(
        { id: 'previous-ref' },
        {
          active: false,
          deactivatedAt: 'SERVER_TIMESTAMP',
          deactivatedBy: 'admin-1',
        }
      )
      expect(rt.batch.set).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-broadcast-id' }),
        {
          title: 'Water shutdown',
          message: 'Supply stops at 10am.',
          severity: 'critical',
          active: true,
          createdAt: 'SERVER_TIMESTAMP',
          createdBy: 'admin-1',
        }
      )
      expect(rt.batch.commit).toHaveBeenCalledTimes(1)
      expect(serverTimestamp).toHaveBeenCalled()
    })

    it('omits the audit actor when publishing without a signed-in user', async () => {
      await publishEmergencyBroadcast({
        title: 'Storm advisory',
        message: 'Stay indoors.',
        severity: 'warning',
      })

      expect(rt.batch.update).not.toHaveBeenCalled()
      expect(rt.batch.set.mock.calls[0][1]).not.toHaveProperty('createdBy')
    })

    it('rejects invalid composer input before writing', async () => {
      await expect(
        publishEmergencyBroadcast({ title: ' ', message: 'Body' })
      ).rejects.toThrow('A broadcast title and message are required')

      expect(writeBatch).not.toHaveBeenCalled()
    })
  })

  describe('deactivateEmergencyBroadcast', () => {
    it('marks the broadcast inactive with an audit trail', async () => {
      await deactivateEmergencyBroadcast('live-alert', {
        actorUid: 'admin-2',
      })

      expect(updateDoc).toHaveBeenCalledWith(
        { type: 'doc', id: 'live-alert', collection: 'broadcasts' },
        {
          active: false,
          deactivatedAt: 'SERVER_TIMESTAMP',
          deactivatedBy: 'admin-2',
        }
      )
    })

    it('does nothing without a broadcast id', async () => {
      await deactivateEmergencyBroadcast('')
      expect(updateDoc).not.toHaveBeenCalled()
    })
  })
})
