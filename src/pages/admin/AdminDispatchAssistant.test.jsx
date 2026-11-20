// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminComplaintDetailsPage } from '@/pages/admin/AdminComplaintDetailsPage'
import { createTransactionStore } from '@/firebase/testSupport/transactionStore'
import * as officerDispatch from '@/firebase/officerDispatch'
import * as complaintLifecycle from '@/firebase/complaintLifecycle'
import toast from 'react-hot-toast'

vi.mock('@/firebase/complaintReferences', () => ({
  resolveCitizenComplaintDocumentId: async (issueId) => issueId,
}))

const runtime = vi.hoisted(() => ({
  current: null,
  store: null,
  listeners: [],
  notificationId: 0,
  auth: { currentUser: { uid: 'admin-1', role: 'admin', name: 'Admin Jane' } },
}))

vi.mock('react', async (original) => ({
  ...(await original()),
  useState(initial) {
    const instance = runtime.current,
      index = instance.cursor++
    if (!(index in instance.values)) instance.values[index] = initial
    const setter = (value) => {
      instance.values[index] =
        typeof value === 'function' ? value(instance.values[index]) : value
    }
    instance.setters[index] = setter
    return [instance.values[index], setter]
  },
  useRef(initial) {
    const instance = runtime.current,
      index = instance.cursor++
    return (instance.values[index] ||= { current: initial })
  },
  useEffect(effect) {
    if (!runtime.current.mounted) runtime.current.effects.push(effect)
  },
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'ticket-1' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: runtime.auth?.currentUser }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: runtime.auth,
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) =>
    parts.length ? parts.join('/') : ref + '/' + ++runtime.notificationId,
  collection: (_db, name) => name,
  query: (col) => col,
  orderBy: () => ({}),
  limit: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: [] }),
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
  serverTimestamp: () => 'server-time',
}))

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    t: (key) => key,
  }),
}))

vi.mock('@/components/common/ComplaintLocationMap', () => ({
  ComplaintLocationMap: () => null,
}))

vi.mock('@/components/admin/ComplaintAuditTimeline', () => ({
  ComplaintAuditTimeline: () => null,
}))

vi.mock('@/components/admin/ResolutionTemplateSelector', () => ({
  ResolutionTemplateSelector: () => null,
}))

function mount(Page) {
  const instance = { cursor: 0, values: [], setters: [], effects: [], mounted: false }
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

describe('Admin Intelligent Dispatch Assistant UI Integration', () => {
  const sampleOfficers = [
    {
      id: 'off-1',
      name: 'Inspector Rajesh',
      department: 'Roads',
      specializations: ['Potholes & Road Damage'],
      active: true,
      activeComplaints: 1,
      maxCapacity: 10,
    },
    {
      id: 'off-2',
      name: 'Officer Sunita',
      department: 'Roads',
      active: true,
      activeComplaints: 4,
      maxCapacity: 8,
    },
    {
      id: 'off-busy',
      name: 'Officer Full',
      department: 'Roads',
      active: true,
      activeComplaints: 10,
      maxCapacity: 10,
    },
  ]

  const originalComplaint = {
    title: 'Pothole on Main Rd',
    status: 'Pending',
    department: 'Roads',
    category: 'Potholes & Road Damage',
    reportedBy: 'citizen-1',
    complaintId: 'CMP-2026-0001',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    runtime.listeners = []
    runtime.notificationId = 0
    runtime.store = createTransactionStore({
      'issues/ticket-1': originalComplaint,
    })
    vi.spyOn(officerDispatch, 'fetchOfficerCandidates').mockResolvedValue(sampleOfficers)
  })

  it('renders Intelligent Dispatch Assistant and shows top recommended officer', async () => {
    const instance = mount(AdminComplaintDetailsPage)
    // First listener is events, second is complaint doc
    const complaintListener = runtime.listeners.at(-1)
    complaintListener({
      exists: () => true,
      data: () => originalComplaint,
      id: 'ticket-1',
    })

    // Set officer candidates into instance state (Index 30)
    const candidatesSetter = instance.setters[30]
    if (typeof candidatesSetter === 'function') {
      candidatesSetter(sampleOfficers)
    }

    const rendered = instance.render()
    const content = text(rendered)

    expect(content).toContain('Intelligent Dispatch Assistant')
    expect(content).toContain('Inspector Rajesh')
    expect(content).toContain('Officer Sunita')
    // Full-capacity officer should NOT be displayed as recommendation
    expect(content).not.toContain('Officer Full')
  })

  it('handles empty eligible officer state gracefully', () => {
    const instance = mount(AdminComplaintDetailsPage)
    const complaintListener = runtime.listeners.at(-1)
    complaintListener({
      exists: () => true,
      data: () => originalComplaint,
      id: 'ticket-1',
    })

    // Set only full-capacity or inactive candidates (Index 30)
    const candidatesSetter = instance.setters[30]
    if (typeof candidatesSetter === 'function') {
      candidatesSetter([
        { id: 'off-busy', name: 'Officer Full', active: true, activeComplaints: 10, maxCapacity: 10 },
      ])
    }

    const rendered = instance.render()
    const content = text(rendered)
    expect(content).toContain('No Eligible Officers Available')
  })

  it('calls dispatchComplaintToOfficer and triggers toast on confirm dispatch', async () => {
    const dispatchSpy = vi.spyOn(complaintLifecycle, 'dispatchComplaintToOfficer').mockResolvedValue({
      success: true,
      complaintId: 'ticket-1',
      officerId: 'off-1',
    })

    const instance = mount(AdminComplaintDetailsPage)
    const complaintListener = runtime.listeners.at(-1)
    complaintListener({
      exists: () => true,
      data: () => originalComplaint,
      id: 'ticket-1',
    })

    // Set candidates and selected candidate
    const candidatesSetter = instance.setters[30]
    candidatesSetter(sampleOfficers)

    const selectedOfficerSetter = instance.setters[33]
    selectedOfficerSetter({
      officerId: 'off-1',
      name: 'Inspector Rajesh',
      score: 95,
    })

    const rendered = instance.render()
    const confirmButtons = buttons(rendered, 'Confirm Dispatch')
    expect(confirmButtons.length).toBeGreaterThan(0)

    // Click confirm dispatch
    await confirmButtons[0].props.onClick()

    expect(dispatchSpy).toHaveBeenCalledWith(
      'ticket-1',
      'off-1',
      expect.objectContaining({ uid: 'admin-1', role: 'admin' }),
      expect.any(Object)
    )
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Inspector Rajesh'))
  })
})
