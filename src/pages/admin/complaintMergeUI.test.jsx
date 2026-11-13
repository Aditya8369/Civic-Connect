// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { AdminComplaintDetailsPage } from '@/pages/admin/AdminComplaintDetailsPage'
import { ComplaintDetailsPage } from '@/pages/citizen/ComplaintDetailsPage'
import { Dialog } from '@/components/ui/dialog'
import { createTransactionStore } from '@/firebase/testSupport/transactionStore'

vi.mock('@/firebase/complaintReferences', () => ({
  resolveCitizenComplaintDocumentId: async (issueId) => issueId,
}))

const runtime = vi.hoisted(() => ({
  current: null,
  store: null,
  listeners: [],
  notificationId: 0,
  candidates: [],
  auth: { currentUser: { uid: 'admin-1' } },
}))

vi.mock('react', async original => ({
  ...await original(),
  useState(initial) {
    const instance = runtime.current, index = instance.cursor++
    if (!(index in instance.values)) instance.values[index] = initial
    return [
      instance.values[index],
      value => {
        instance.values[index] = typeof value === 'function' ? value(instance.values[index]) : value
      },
    ]
  },
  useRef(initial) {
    const instance = runtime.current, index = instance.cursor++
    return (instance.values[index] ||= { current: initial })
  },
  useEffect(effect) {
    if (!runtime.current.mounted) runtime.current.effects.push(effect)
  },
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'ticket-child' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: runtime.auth?.currentUser || { uid: 'admin-1' } }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: runtime.auth,
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => (parts.length ? parts.join('/') : ref + '/' + ++runtime.notificationId),
  collection: (_db, name) => name,
  query: (col) => col,
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: async () => ({
    docs: runtime.candidates.map((c) => ({
      id: c.id,
      data: () => c,
    })),
  }),
  getDoc: async () => ({ exists: () => false }),
  addDoc: async (key, data) => {
    runtime.store.write(key + '/' + ++runtime.notificationId, data)
  },
  runTransaction: (db, callback) =>
    runtime.store.runTransaction(db, (tx) =>
      callback({
        ...tx,
        get: async (key) => {
          const snap = await tx.get(key)
          return { exists: () => snap.exists(), data: () => snap.data() }
        },
      })
    ),
  updateDoc: async (key, data) =>
    runtime.store.write(key, { ...runtime.store.read(key), ...data }),
  onSnapshot: (_ref, callback) => {
    runtime.listeners.push(callback)
    return vi.fn()
  },
  arrayUnion: (...items) => items,
  serverTimestamp: () => 'server-time',
}))

function mount(Page) {
  const instance = { cursor: 0, values: [], effects: [], mounted: false }
  instance.render = () => {
    instance.cursor = 0
    runtime.current = instance
    return Page()
  }
  instance.render()
  instance.cleanups = instance.effects.map((effect) => effect())
  instance.mounted = true
  return instance
}

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes)
  return element?.props ? [element, ...nodes(element.props.children)] : []
}

function text(element) {
  if (Array.isArray(element)) return element.map(text).join('')
  return typeof element === 'string' || typeof element === 'number'
    ? String(element)
    : element?.props
      ? text(element.props.children)
      : ''
}

const buttons = (tree, label) =>
  nodes(tree).filter((node) => node.props?.onClick && text(node).includes(label))

const childPath = 'issues/ticket-child'
const parentPath = 'issues/ticket-parent'

beforeEach(() => {
  runtime.listeners = []
  runtime.notificationId = 0
  runtime.candidates = [
    {
      id: 'ticket-parent',
      complaintId: 'CMP-2026-0001',
      title: 'Main burst on Highway',
      status: 'In Progress',
      category: 'Water Leakage',
      address: 'Main Highway',
      endorsedBy: ['citizen-1'],
      endorsementCount: 1,
    },
  ]
  runtime.store = createTransactionStore({
    [childPath]: {
      complaintId: 'CMP-2026-0002',
      title: 'Water leak near street',
      status: 'Pending',
      category: 'Water Leakage',
      address: 'Side street',
      reportedBy: 'citizen-child',
      endorsedBy: ['citizen-2'],
      endorsementCount: 1,
    },
    [parentPath]: runtime.candidates[0],
  })
})

it('displays the "Merge into Parent" button for pending complaints and opens the dialog', async () => {
  const instance = mount(AdminComplaintDetailsPage)
  runtime.listeners.at(-1)({
    id: 'ticket-child',
    exists: () => true,
    data: () => runtime.store.read(childPath),
  })

  const tree = instance.render()
  const mergeBtn = buttons(tree, 'Merge into Parent')
  expect(mergeBtn.length).toBeGreaterThan(0)

  // Click "Merge into Parent" to open dialog
  await mergeBtn[0].props.onClick()

  const openTree = instance.render()
  const mergeDialog = nodes(openTree).find(
    (node) => node.type === Dialog && node.props?.open && text(node).includes('Merge into Parent Complaint')
  )
  expect(mergeDialog).toBeTruthy()
  expect(text(mergeDialog)).toContain('CMP-2026-0001')
})

it('does not display the "Merge into Parent" button when complaint is already Merged - Duplicate', () => {
  const instance = mount(AdminComplaintDetailsPage)
  runtime.listeners.at(-1)({
    id: 'ticket-child',
    exists: () => true,
    data: () => ({
      ...runtime.store.read(childPath),
      status: 'Merged - Duplicate',
      mergedInto: 'CMP-2026-0001',
      mergedIntoId: 'ticket-parent',
    }),
  })

  const tree = instance.render()
  const mergeBtn = buttons(tree, 'Merge into Parent')
  expect(mergeBtn.length).toBe(0)

  // Verify merged banner is shown with parent link
  const banner = text(tree)
  expect(banner).toContain('Merged into parent ticket')
  expect(banner).toContain('CMP-2026-0001')
})

it('allows searching and selecting a target parent complaint ID, then confirms merge', async () => {
  const instance = mount(AdminComplaintDetailsPage)
  runtime.listeners.at(-1)({
    id: 'ticket-child',
    exists: () => true,
    data: () => runtime.store.read(childPath),
  })

  // 1. Open merge dialog
  const mergeBtn = buttons(instance.render(), 'Merge into Parent Complaint')
  await mergeBtn[0].props.onClick()

  // 2. Locate search input and search by target parent complaint ID
  const searchInput = nodes(instance.render()).find(
    (node) => node.props?.id === 'search-parent'
  )
  expect(searchInput).toBeTruthy()

  // Type target parent complaint ID
  searchInput.props.onChange({ target: { value: 'CMP-2026-0001' } })

  // 3. Candidate item is present and selectable
  const candidateCard = nodes(instance.render()).find(
    (node) => node.props?.role === 'button' && text(node).includes('CMP-2026-0001')
  )
  expect(candidateCard).toBeTruthy()

  // Click candidate to select
  candidateCard.props.onClick()

  // 4. Submit confirmation
  const confirmBtn = buttons(instance.render(), 'Confirm Merge')
  expect(confirmBtn.length).toBeGreaterThan(0)
  expect(confirmBtn[0].props.disabled).toBe(false)

  await confirmBtn[0].props.onClick()

  // Verify child status was updated to Merged - Duplicate
  const updatedChild = runtime.store.read(childPath)
  expect(updatedChild.status).toBe('Merged - Duplicate')
  expect(updatedChild.mergedInto).toBe('CMP-2026-0001')
})

it('displays the Consolidated Duplicate Complaints card when parent has merged children', () => {
  const instance = mount(AdminComplaintDetailsPage)
  runtime.listeners.at(-1)({
    id: 'ticket-parent',
    exists: () => true,
    data: () => ({
      ...runtime.candidates[0],
      mergedChildIds: ['ticket-child'],
      mergedChildComplaintIds: ['CMP-2026-0002'],
    }),
  })

  const tree = instance.render()
  const treeText = text(tree)
  expect(treeText).toContain('Consolidated Duplicate Complaints (1)')
  expect(treeText).toContain('CMP-2026-0002')
})

it('citizen view displays consolidated banner when ticket is Merged - Duplicate', async () => {
  const instance = mount(ComplaintDetailsPage)

  await Promise.resolve()
  await Promise.resolve()

  runtime.listeners.at(-1)({
    id: 'ticket-child',
    exists: () => true,
    data: () => ({
      ...runtime.store.read(childPath),
      status: 'Merged - Duplicate',
      mergedInto: 'CMP-2026-0001',
      mergedIntoId: 'ticket-parent',
    }),
  })

  const tree = instance.render()
  const treeText = text(tree)
  expect(treeText).toContain('Consolidated with ticket')
  expect(treeText).toContain('CMP-2026-0001')
})

it('citizen view displays primary consolidated ticket banner when viewer is a consolidated reporter', () => {
  runtime.auth.currentUser = { uid: 'citizen-child' }
  const instance = mount(ComplaintDetailsPage)
  runtime.listeners.at(-1)({
    id: 'ticket-parent',
    exists: () => true,
    data: () => ({
      ...runtime.candidates[0],
      reportedBy: 'citizen-parent',
      mergedReporters: ['citizen-child'],
      mergedChildIds: ['ticket-child'],
      mergedChildComplaintIds: ['CMP-2026-0002'],
    }),
  })

  const tree = instance.render()
  const treeText = text(tree)
  expect(treeText).toContain('Primary Consolidated Ticket')
  expect(treeText).toContain('Your reported issue was consolidated into this primary grievance.')
})

