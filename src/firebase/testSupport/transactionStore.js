// Optimistic transaction simulator: overlapping callbacks, versioned read sets,
// staged writes, atomic commit and conflict retries. Not a Firestore emulator.
export function createTransactionStore(initial = {}) {
  const documents = new Map(Object.entries(initial).map(([key, data]) => [key, structuredClone(data)]))
  const versions = new Map()
  const history = []
  const store = {
    history, attempts: 0, conflicts: 0, beforeCommit: null, failCommit: null,
    read: key => structuredClone(documents.get(key)),
    write(key, data) {
      documents.set(key, structuredClone(data))
      versions.set(key, (versions.get(key) || 0) + 1)
      history.push({ key, data: structuredClone(data) })
    },
    remove(key) { documents.delete(key); versions.set(key, (versions.get(key) || 0) + 1) },
    async runTransaction(_db, callback) {
      for (let attempt = 0; attempt < 20; attempt++) {
        store.attempts++
        const reads = new Map(), writes = []
        const result = await callback({
          async get(key) {
            if (writes.length) throw new Error('Transaction read after write')
            if (!reads.has(key)) reads.set(key, { version: versions.get(key) || 0, data: store.read(key) })
            const data = reads.get(key).data
            return { exists: () => data !== undefined, data: () => structuredClone(data) }
          },
          set(key, data, options) { writes.push({ key, data, merge: options?.merge }) },
          update(key, data) { writes.push({ key, data, merge: true, update: true }) },
        })
        if (store.beforeCommit) { const hook = store.beforeCommit; store.beforeCommit = null; hook() }
        if ([...reads].some(([key, read]) => read.version !== (versions.get(key) || 0))) {
          store.conflicts++
          continue
        }
        if (store.failCommit) throw store.failCommit
        // Validate the complete batch before applying any writes.
        if (writes.some(write => write.update && !documents.has(write.key))) throw new Error('not-found')
        for (const { key, data, merge } of writes) {
          store.write(key, merge ? { ...store.read(key), ...data } : data)
        }
        return result
      }
      throw new Error('aborted: retry limit')
    },
  }
  return store
}
