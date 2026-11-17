export const OFFLINE_SYNC_LOCK_NAME = 'civic_connect_offline_sync_lock'

/**
 * Checks if the Web Locks API is available in the current environment.
 * @returns {boolean}
 */
export function isWebLocksSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.locks?.request)
}

/**
 * Executes a callback within a cross-tab synchronization lock using the Web Locks API.
 * If another tab currently holds the lock, this function resolves immediately with false
 * instead of queuing or blocking, preventing duplicate storage uploads and uncoordinated
 * background sync races across multiple open tabs.
 *
 * Falls back to executing the callback if Web Locks API is unavailable in the environment.
 *
 * @param {() => Promise<any>|any} callback - Async work to run exclusively while holding the lock.
 * @param {string} [lockName=OFFLINE_SYNC_LOCK_NAME] - The unique lock identifier.
 * @returns {Promise<any|false>} The result of callback() if acquired; false if lock is held by another tab.
 */
export async function withOfflineSyncLock(callback, lockName = OFFLINE_SYNC_LOCK_NAME) {
  if (isWebLocksSupported()) {
    return await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        // Lock unavailable: another browser tab is currently syncing offline grievances
        return false
      }
      return await callback()
    })
  }

  // Graceful fallback for environments/browsers without navigator.locks
  return await callback()
}
