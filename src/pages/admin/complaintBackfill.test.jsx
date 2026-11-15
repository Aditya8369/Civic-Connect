import { beforeEach, expect, it, vi } from 'vitest'
import { AdminComplaintDetailsPage } from './AdminComplaintDetailsPage'
import { createTransactionStore } from '@/firebase/testSupport/transactionStore'

const runtime = vi.hoisted(() => ({ current: null, store: null, listeners: [], delivery: null }))
vi.mock('react', async original => ({
  ...await original(),
  useState(initial) {
    const instance = runtime.current, index = instance.cursor++
    if (!(index in instance.values)) instance.values[index] = initial
    return [instance.values[index], value => {
      instance.values[index] = typeof value === 'function' ? value(instance.values[index]) : value
    }]
  },
  useRef(initial) {
    const instance = runtime.current, index = instance.cursor++
    return instance.values[index] ||= { current: initial }
  },
  useEffect(effect) { if (!runtime.current.mounted) runtime.current.effects.push(effect) },
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'legacy' }), useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'admin-1' } }) }))
vi.mock('@/firebase/services', () => ({ db: {}, auth: { currentUser: { uid: 'admin-1' } } }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: async (...args) => {
    const result = await runtime.store.runTransaction(...args)
    if (runtime.delivery) await runtime.delivery
    return result
  },
  updateDoc: async (key, data) => runtime.store.write(key, { ...runtime.store.read(key), ...data }),
  onSnapshot: (_ref, callback) => {
    runtime.listeners.push(callback)
    return vi.fn()
  },
  getDoc: async () => ({ exists: () => false }),
  serverTimestamp: vi.fn(), collection: vi.fn(), addDoc: vi.fn(),
}))
vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    t: (key) => {
      const translations = {
        retryTicketId: 'Retry ticket ID',
      }

      return translations[key] ?? key
    },
  }),
}))
const flush = () => new Promise(resolve => setImmediate(resolve))
function mount() {
  const instance = { cursor: 0, values: [], effects: [], mounted: false }
  instance.render = () => { instance.cursor = 0; runtime.current = instance; return AdminComplaintDetailsPage() }
  instance.render()
  instance.cleanups = instance.effects.map(effect => effect())
  instance.mounted = true
  return instance
}
function snapshot(data) { return { id: 'legacy', exists: () => true, data: () => ({ ...data }) } }
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes)
  return element?.props ? [element, ...nodes(element.props.children)] : []
}
function text(element) {
  if (Array.isArray(element)) return element.map(text).join('')
  return typeof element === 'string' ? element : element?.props ? text(element.props.children) : ''
}
beforeEach(() => {
  runtime.listeners = []
  runtime.delivery = null
  runtime.store = createTransactionStore({ 'issues/legacy': { title: 'Lamp', status: 'Pending' } })
})

it('does not replace newer snapshot metadata with a delayed transaction result', async () => {
  let release
  runtime.delivery = new Promise(resolve => { release = resolve })
  const instance = mount()
  runtime.listeners[0](snapshot(runtime.store.read('issues/legacy')))
  await flush()
  const committed = runtime.store.read('issues/legacy')
  runtime.listeners[0](snapshot({ ...committed, title: 'Updated lamp', status: 'In Progress' }))
  release()
  await flush()
  const rendered = text(instance.render())
  expect(rendered).toContain('Updated lamp')
  expect(rendered).toContain('In Progress')
  expect(rendered).toContain(committed.complaintId)
})

it('ignores async completion and queued snapshots after unmount', async () => {
  let release
  runtime.delivery = new Promise(resolve => { release = resolve })
  const instance = mount()
  runtime.listeners[0](snapshot(runtime.store.read('issues/legacy')))
  await flush()
  instance.cleanups.forEach(cleanup => cleanup?.())
  const before = structuredClone(instance.values)
  release()
  runtime.listeners[0](snapshot({ title: 'Stale callback', status: 'Resolved' }))
  await flush()
  expect(instance.values).toEqual(before)
})

it('two admin instances and a delayed missing-ID snapshot cannot renumber a ticket', async () => {
  const first = mount(), second = mount()
  const initial = runtime.store.read('issues/legacy')
  runtime.listeners.forEach(listener => listener(snapshot(initial)))
  await flush()
  const writes = runtime.store.history.filter(entry => entry.key === 'issues/legacy')
  console.log('Backfill writes:', writes.map(entry => entry.data.complaintId))
  expect(writes).toHaveLength(1)
  const persisted = runtime.store.read('issues/legacy').complaintId
  runtime.listeners.forEach(listener => listener(snapshot(initial)))
  await flush()
  expect(text(first.render())).toContain(persisted)
  expect(text(second.render())).toContain(persisted)
  expect(runtime.store.read('issues/legacy').complaintId).toBe(persisted)
})

it('offers explicit retry after failure without a snapshot retry loop', async () => {
  runtime.store.failCommit = new Error('permission-denied')
  const instance = mount(), initial = runtime.store.read('issues/legacy')
  runtime.listeners[0](snapshot(initial))
  await flush()
  const attempts = runtime.store.attempts
  runtime.listeners[0](snapshot(initial))
  await flush()
  expect(runtime.store.attempts).toBe(attempts)
  const retry = nodes(instance.render()).find(node => node.props.onClick && text(node).includes('Retry ticket ID'))
  expect(retry).toBeDefined()
  runtime.store.failCommit = null
  retry.props.onClick()
  // Model React cleaning up and rerunning the effect on the retry dependency.
  instance.cleanups.forEach(cleanup => cleanup?.())
  instance.mounted = false; instance.effects = []; instance.render()
  instance.cleanups = instance.effects.map(effect => effect()); instance.mounted = true
  runtime.listeners.at(-1)(snapshot(initial))
  await flush()
  expect(runtime.store.read('issues/legacy').complaintId).toMatch(/^CMP-\d{4}-0001$/)
})
