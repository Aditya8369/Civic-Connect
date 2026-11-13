import { beforeEach, expect, it, vi } from 'vitest'
import { AdminComplaintDetailsPage } from '@/pages/admin/AdminComplaintDetailsPage'
import { ComplaintDetailsPage } from '@/pages/citizen/ComplaintDetailsPage'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import toast from 'react-hot-toast'
import { createTransactionStore } from '@/firebase/testSupport/transactionStore'

vi.mock('@/firebase/complaintReferences', () => ({
  resolveCitizenComplaintDocumentId: async (issueId) => issueId,
}))

const runtime = vi.hoisted(() => ({ current: null, store: null, listeners: [], notificationId: 0, auth: { currentUser: null } }))
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
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'citizen-1' } }) }))
vi.mock('@/firebase/services', () => ({ db: {}, auth: runtime.auth }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => parts.length ? parts.join('/') : ref + '/' + ++runtime.notificationId,
  collection: (_db, name) => name,
  addDoc: async (key, data) => {
    if (runtime.store.failCommit) throw runtime.store.failCommit
    runtime.store.write(key + '/' + ++runtime.notificationId, data)
  },
  runTransaction: (db, callback) =>
    runtime.store.runTransaction(db, tx => callback({
      ...tx,
      get: async key => {
        const snap = await tx.get(key)
        return { ...snap, data: () => withTimestamp(snap.data()) }
      },
    })),
  updateDoc: async (key, data) => runtime.store.write(key, { ...runtime.store.read(key), ...data }),
  onSnapshot: (_ref, callback) => {
    runtime.listeners.push(callback)
    return vi.fn()
  },
  getDoc: async () => ({ exists: () => false }),
  serverTimestamp: () => 'server-time',
}))

function mount(Page) {
  const instance = { cursor: 0, values: [], effects: [], mounted: false }
  instance.render = () => { instance.cursor = 0; runtime.current = instance; return Page() }
  instance.render()
  instance.cleanups = instance.effects.map(effect => effect())
  instance.mounted = true
  return instance
}
function withTimestamp(data) {
  if (typeof data?.resolvedAt !== 'number') return data
  return { ...data, resolvedAt: { toDate: () => new Date(data.resolvedAt) } }
}
function snapshot(data) { return { id: 'legacy', exists: () => true, data: () => withTimestamp(data) } }
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes)
  return element?.props ? [element, ...nodes(element.props.children)] : []
}
function text(element) {
  if (Array.isArray(element)) return element.map(text).join('')
  return typeof element === 'string' ? element : element?.props ? text(element.props.children) : ''
}

const path = 'issues/legacy'
const actions = [
  { label: 'progression', Page: AdminComplaintDetailsPage, from: 'In Progress', to: 'Resolved', submit: 'Mark Resolved', title: 'Complaint Status Updated' },
  { label: 'rejection', Page: AdminComplaintDetailsPage, from: 'Pending', to: 'Rejected', open: 'Reject', submit: 'Reject', title: 'Complaint Rejected', reason: 'rejectionReason' },
  { label: 'reopening', Page: ComplaintDetailsPage, from: 'Resolved', to: 'Reopened', open: 'Reopen Issue', submit: 'Reopen', title: 'Complaint Reopened', reason: 'reopenReason' },
]
const buttons = (tree, label) => nodes(tree).filter(node => node.props.onClick && text(node).trim() === label)
const dialog = (tree, action) => nodes(tree).find(node => node.type === Dialog && node.props.open && text(node).includes(action.open))
const notices = () => runtime.store.history.filter(entry => entry.key.startsWith('notifications/')).map(entry => entry.data)
const events = () => runtime.store.history.filter(entry => entry.key.startsWith(`${path}/events/`)).map(entry => entry.data)
const departmentSelect = ui => nodes(ui.instance.render()).find(node => node.type === Select && node.props.onValueChange)

function setup(action) {
  const original = {
    title: 'Lamp',
    status: action.from,
    reportedBy: 'citizen-1',
    complaintId: 'CMP-2026-0001',
    department: 'Roads',
    resolvedAt: Date.now() - 1000,
  }

  runtime.store = createTransactionStore({ [path]: original })
  const instance = mount(action.Page)

  const finishSetup = () => {
    runtime.listeners.at(-1)(snapshot(original))

    if (action.open) {
      buttons(instance.render(), action.open)[0].props.onClick()
    }

    return {
      original,
      instance,
      fill(value) {
        nodes(dialog(instance.render(), action))
          .find(node => node.type === 'textarea')
          .props.onChange({ target: { value } })
      },
      submit() {
        const tree = instance.render()
        return buttons(
          action.open ? dialog(tree, action) : tree,
          action.submit,
        )[0].props.onClick
      },
    }
  }

  // Citizen complaint loading now resolves asynchronously.
  if (action.Page === ComplaintDetailsPage) {
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(finishSetup)
  }

  return finishSetup()
}

beforeEach(() => {
  vi.clearAllMocks()
  runtime.auth.currentUser = { uid: 'citizen-1' }
  runtime.listeners = []
  runtime.notificationId = 0
})

it('keeps the department, event and notice unchanged on a rejected assignment and allows retry', async () => {
  const ui = setup(actions[0])
  runtime.store.failCommit = new Error('permission-denied')
  await departmentSelect(ui).props.onValueChange('Electricity')
  expect(runtime.store.read(path)).toEqual(ui.original)
  expect(runtime.store.history).toEqual([])
  expect(departmentSelect(ui).props).toMatchObject({ value: 'Roads', disabled: false })
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledWith('Failed to assign department')

  runtime.store.failCommit = null
  await departmentSelect(ui).props.onValueChange('Electricity')
  expect(runtime.store.read(path)).toEqual({ ...ui.original, department: 'Electricity', updatedAt: 'server-time' })
  expect(events()).toEqual([{
    action: 'Department assigned', actorUid: 'citizen-1', previousStatus: 'In Progress', newStatus: 'In Progress',
    remarks: 'Department assigned: Electricity', timestamp: 'server-time',
  }])
  expect(notices()).toEqual([{
    recipientUid: 'citizen-1', recipientRole: 'citizen', senderUid: 'citizen-1', issueId: ui.original.complaintId,
    type: 'department_assigned', title: 'Department Assigned', message: 'Your complaint has been assigned to the Electricity department.',
    read: false, createdAt: 'server-time',
  }])
  runtime.listeners.at(-1)(snapshot(runtime.store.read(path)))
  expect(departmentSelect(ui).props.value).toBe('Electricity')
  expect(toast.success).toHaveBeenCalledOnce()
})

it('uses the current complaint after an assignment transaction retries', async () => {
  const ui = setup(actions[0])
  runtime.store.beforeCommit = () => runtime.store.write(path, {
    ...ui.original, status: 'Resolved', reportedBy: 'citizen-2', complaintId: 'CMP-2026-0002',
  })
  await departmentSelect(ui).props.onValueChange('Water')
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(path)).toMatchObject({ status: 'Resolved', department: 'Water' })
  expect(events()).toEqual([expect.objectContaining({ previousStatus: 'Resolved', newStatus: 'Resolved' })])
  expect(notices()).toEqual([expect.objectContaining({ recipientUid: 'citizen-2', issueId: 'CMP-2026-0002' })])
})

it('blocks duplicate clicks and leaves a committed assignment unchanged on replay', async () => {
  const ui = setup(actions[0])
  const assign = departmentSelect(ui).props.onValueChange
  await Promise.all([assign('Water'), assign('Water')])
  expect(runtime.store.attempts).toBe(1)
  await assign('Water')
  expect(runtime.store.attempts).toBe(2)
  expect(runtime.store.history).toHaveLength(3)
  expect(events()).toHaveLength(1)
  expect(notices()).toHaveLength(1)
  expect(toast.success).toHaveBeenCalledOnce()
})

it('creates one event and notice when two tabs select the same department concurrently', async () => {
  const first = setup(actions[0])
  const second = { instance: mount(AdminComplaintDetailsPage) }
  runtime.listeners.at(-1)(snapshot(first.original))
  await Promise.all([
    departmentSelect(first).props.onValueChange('Water'),
    departmentSelect(second).props.onValueChange('Water'),
  ])
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(path).department).toBe('Water')
  expect(events()).toHaveLength(1)
  expect(notices()).toHaveLength(1)
  expect(toast.success).toHaveBeenCalledOnce()
})

it('assigns a legacy complaint without a recipient and writes only its audit event', async () => {
  const ui = setup(actions[0])
  runtime.store.write(path, { ...ui.original, reportedBy: null })
  await departmentSelect(ui).props.onValueChange('Water')
  expect(runtime.store.read(path).department).toBe('Water')
  expect(events()).toHaveLength(1)
  expect(notices()).toEqual([])
})

it('rejects an assignment if the complaint was deleted after the first read', async () => {
  const ui = setup(actions[0])
  runtime.store.beforeCommit = () => runtime.store.remove(path)
  await departmentSelect(ui).props.onValueChange('Water')
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(path)).toBeUndefined()
  expect(runtime.store.history).toEqual([])
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledOnce()
})

it('rejects an assignment retry after a new sign-in with the same UID', async () => {
  const ui = setup(actions[0])
  runtime.store.beforeCommit = () => {
    runtime.store.write(path, { ...ui.original, title: 'Updated lamp' })
    runtime.auth.currentUser = { uid: 'citizen-1' }
  }
  await departmentSelect(ui).props.onValueChange('Water')
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(path)).toEqual({ ...ui.original, title: 'Updated lamp' })
  expect(runtime.store.history).toHaveLength(1)
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledOnce()
})

for (const action of actions) {
  it.each(['permission-denied', 'unavailable'])(action.label + ' keeps both documents unchanged on %s, then retries', async code => {
    const ui = await setup(action)
    if (action.reason) ui.fill('  Needs follow-up  ')
    runtime.store.failCommit = new Error(code)
    await ui.submit()()
    expect(runtime.store.read(path)).toEqual(ui.original)
    expect(notices()).toEqual([])
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledOnce()
    if (action.reason) {
      const draft = nodes(dialog(ui.instance.render(), action)).find(node => node.type === 'textarea')
      expect(draft.props.value).toBe('  Needs follow-up  ')
    }
    runtime.store.failCommit = null
    await ui.submit()()
    expect(runtime.store.read(path)).toEqual({
      ...ui.original, status: action.to, updatedAt: 'server-time',
      ...(action.label === 'progression' && { resolvedAt: 'server-time' }),
      ...(action.label === 'reopening' && { reopenedAt: 'server-time' }),
      ...(action.reason && { [action.reason]: 'Needs follow-up' }),
    })
    expect(notices()).toEqual([{
      title: action.title, type: 'status_update', issueId: ui.original.complaintId,
      recipientUid: action.label === 'reopening' ? null : 'citizen-1',
      recipientRole: action.label === 'reopening' ? 'admin' : 'citizen',
      senderUid: action.label === 'reopening' ? 'citizen-1' : '',
      read: false, createdAt: 'server-time', message: expect.stringContaining(
        action.label === 'progression' ? 'Resolved' : 'Needs follow-up',
      ),
    }])
    expect(toast.success).toHaveBeenCalledOnce()
    if (action.reason) expect(dialog(ui.instance.render(), action)).toBeUndefined()
  })

  if (action.reason) {
    it(action.label + ' rejects blank input', async () => {
      const ui = await setup(action)
      ui.fill(' \t ')
      await ui.submit()()
      expect(runtime.store.history).toEqual([])
      expect(toast.error).toHaveBeenCalledOnce()
    })
  }
}

it('does not fabricate timeline history when no audit events exist', async () => {
  const ui = await setup(actions[2])
  runtime.listeners[0]({ docs: [] })

  const rendered = text(ui.instance.render())
  expect(rendered).toContain('Timeline history is unavailable for this complaint')
  expect(rendered).not.toContain('Status changed')
})

it('does not duplicate a progression submitted twice from the same render', async () => {
  const ui = setup({ ...actions[0], from: 'Pending', to: 'In Progress', submit: 'Mark In Progress' })
  const submit = ui.submit()
  await Promise.all([submit(), submit()])
  expect(runtime.store.read(path).status).toBe('In Progress')
  expect(notices()).toHaveLength(1)
  expect(toast.error).not.toHaveBeenCalled()
})

it('does not apply a stale transition over a concurrently changed status', async () => {
  const ui = setup(actions[0])
  runtime.store.beforeCommit = () => runtime.store.write(path, { ...ui.original, status: 'Rejected' })
  await ui.submit()()
  expect(runtime.store.read(path).status).toBe('Rejected')
  expect(notices()).toEqual([])
  expect(toast.error).toHaveBeenCalledOnce()
})

it('rejects replay of a committed action from the old snapshot', async () => {
  const ui = setup({ ...actions[0], from: 'Pending', submit: 'Mark In Progress' })
  const submit = ui.submit()
  await submit()
  await submit()
  expect(runtime.store.read(path).status).toBe('In Progress')
  expect(notices()).toHaveLength(1)
  expect(toast.success).toHaveBeenCalledOnce()
})

it('checks reopening eligibility again against the stored resolution date', async () => {
  const ui = await setup(actions[2])
  ui.fill('Still broken')
  const expired = { ...ui.original, resolvedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }
  runtime.store.write(path, expired)
  await ui.submit()()
  expect(runtime.store.read(path)).toEqual(expired)
  expect(notices()).toEqual([])
  expect(dialog(ui.instance.render(), actions[2])).toBeDefined()
  expect(toast.error).toHaveBeenCalledOnce()
})

it('preserves progression for a legacy complaint without a notification recipient', async () => {
  const ui = setup(actions[0])
  runtime.store.write(path, { ...ui.original, reportedBy: null })
  await ui.submit()()
  expect(runtime.store.read(path).status).toBe('Resolved')
  expect(notices()).toEqual([])
  expect(toast.success).toHaveBeenCalledOnce()
})

it.each([
  ['rejection', actions[1], { status: 'Resolved' }],
  ['reopening', actions[2], { resolvedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }],
])('explains why a stale %s dialog cannot submit after a newer snapshot', async (_label, action, patch) => {
  const ui = await setup(action)
  ui.fill('Still broken')
  const latest = { ...ui.original, ...patch }
  runtime.store.write(path, latest)
  runtime.listeners.at(-1)(snapshot(latest))
  await ui.submit()()
  expect(runtime.store.read(path)).toEqual(latest)
  expect(notices()).toEqual([])
  expect(toast.error).toHaveBeenCalledOnce()
  expect(nodes(dialog(ui.instance.render(), action)).find(node => node.type === 'textarea').props.value).toBe('Still broken')
})
