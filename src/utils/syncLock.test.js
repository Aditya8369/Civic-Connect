import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  withOfflineSyncLock,
  isWebLocksSupported,
  OFFLINE_SYNC_LOCK_NAME,
} from './syncLock'

describe('syncLock (Web Locks cross-tab mutex)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('isWebLocksSupported', () => {
    it('returns true when navigator.locks.request is available', () => {
      vi.stubGlobal('navigator', {
        locks: { request: vi.fn() },
      })
      expect(isWebLocksSupported()).toBe(true)
    })

    it('returns false when navigator.locks is missing', () => {
      vi.stubGlobal('navigator', {})
      expect(isWebLocksSupported()).toBe(false)
    })

    it('returns false when navigator is undefined', () => {
      vi.stubGlobal('navigator', undefined)
      expect(isWebLocksSupported()).toBe(false)
    })
  })

  describe('withOfflineSyncLock', () => {
    it('acquires lock, executes callback, and returns result when lock is available', async () => {
      const mockRequest = vi.fn(async (name, options, callback) => {
        expect(name).toBe(OFFLINE_SYNC_LOCK_NAME)
        expect(options).toEqual({ ifAvailable: true })
        return await callback({ name })
      })

      vi.stubGlobal('navigator', {
        locks: { request: mockRequest },
      })

      const work = vi.fn(async () => 'completed')
      const result = await withOfflineSyncLock(work)

      expect(result).toBe('completed')
      expect(work).toHaveBeenCalledTimes(1)
      expect(mockRequest).toHaveBeenCalledTimes(1)
    })

    it('returns false and skips callback when lock is unavailable (held by another tab)', async () => {
      const mockRequest = vi.fn(async (name, options, callback) => {
        // Lock unavailable in Web Locks API delivers null
        return await callback(null)
      })

      vi.stubGlobal('navigator', {
        locks: { request: mockRequest },
      })

      const work = vi.fn(async () => 'should-not-run')
      const result = await withOfflineSyncLock(work)

      expect(result).toBe(false)
      expect(work).not.toHaveBeenCalled()
    })

    it('supports custom lock names', async () => {
      const mockRequest = vi.fn(async (name, options, callback) => {
        return await callback({ name })
      })

      vi.stubGlobal('navigator', {
        locks: { request: mockRequest },
      })

      const work = vi.fn(async () => 'ok')
      await withOfflineSyncLock(work, 'custom_lock_name')

      expect(mockRequest).toHaveBeenCalledWith(
        'custom_lock_name',
        { ifAvailable: true },
        expect.any(Function)
      )
    })

    it('propagates errors thrown inside the callback and releases lock', async () => {
      const mockRequest = vi.fn(async (name, options, callback) => {
        return await callback({ name })
      })

      vi.stubGlobal('navigator', {
        locks: { request: mockRequest },
      })

      const failingWork = vi.fn(async () => {
        throw new Error('Sync upload error')
      })

      await expect(withOfflineSyncLock(failingWork)).rejects.toThrow('Sync upload error')
      expect(failingWork).toHaveBeenCalledTimes(1)
    })

    it('falls back to executing callback directly when Web Locks is unsupported', async () => {
      vi.stubGlobal('navigator', {})

      const work = vi.fn(async () => 'fallback-result')
      const result = await withOfflineSyncLock(work)

      expect(result).toBe('fallback-result')
      expect(work).toHaveBeenCalledTimes(1)
    })
  })
})
