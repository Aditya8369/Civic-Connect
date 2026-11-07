import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyReportsPage } from './MyReportsPage'
import { DashboardPage } from './DashboardPage'
import { Dialog } from '@/components/ui/dialog'
import { createTransactionStore } from '@/firebase/testSupport/transactionStore'
import toast from 'react-hot-toast'

const runtime = vi.hoisted(() => ({ instance: null, store: null, listeners: new Set(), gate: null }))
const fixture = {
  id: 'report-1', title: 'Broken lamp', description: 'Lamp does not light',
  address: 'Market Road', status: 'Pending', reportedBy: 'citizen-1',
  department: 'Electricity', complaintId: 'CMP-2026-0001',
  assignedWorker: { name: 'Worker', phone: '1234567890' }, createdAt: 123,
}
const path = 'issues/report-1'

vi.mock('react', async original => ({
  ...await original(),
  useState(initial) {
    const instance = runtime.instance, index = instance.cursor++
    if (!(index in instance.values)) instance.values[index] = initial
    return [instance.values[index], value => {
      instance.values[index] = typeof value === 'function' ? value(instance.values[index]) : value
    }]
  },
  useRef(initial) {
    const instance = runtime.instance, index = instance.cursor++
    return instance.values[index] ||= { current: initial }
  },
  useEffect(effect) { if (!runtime.instance.mounted) runtime.instance.effects.push(effect) },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'citizen-1', name: 'Citizen' } }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/firebase/services', () => ({ db: {}, auth: { currentUser: { uid: 'citizen-1' } } }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), deleteDoc: vi.fn(),
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: async (...args) => {
    if (runtime.gate) await runtime.gate
    return runtime.store.runTransaction(...args)
  },
  serverTimestamp: () => 'server-time',
  onSnapshot: (_query, _options, callback) => {
    runtime.listeners.add(callback)
    callback(snapshot())
    return () => runtime.listeners.delete(callback)
  },
}))

function snapshot() {
  const data = runtime.store.read(path)
  return { empty: !data, metadata: { fromCache: false }, docs: data ? [{ id: fixture.id, data: () => data }] : [] }
}
function emitSnapshot() {
  for (const listener of runtime.listeners) listener(snapshot())
}
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes)
  return element?.props ? [element, ...nodes(element.props.children)] : []
}
function text(element) {
  if (Array.isArray(element)) return element.map(text).join('')
  return typeof element === 'string' ? element : element?.props ? text(element.props.children) : ''
}
function mount(Page) {
  const instance = { cursor: 0, values: [], effects: [], mounted: false }
  const render = () => {
    instance.cursor = 0
    runtime.instance = instance
    return nodes(Page())
  }
  const button = label => render().find(node => node.props.onClick && text(node).trim() === label)
  const input = id => render().find(node => node.props.id === id)
  render()
  const cleanups = instance.effects.map(effect => effect())
  instance.mounted = true
  button('Edit').props.onClick()
  return {
    button,
    change: (id, value) => input(id).props.onChange({ target: { value } }),
    draft: () => ['edit-title', 'edit-desc', 'edit-addr'].map(id => input(id).props.value),
    isOpen: () => render().find(node => node.type === Dialog && text(node).includes('Edit Complaint')).props.open,
    save: () => button('Save Changes').props.onClick(),
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
    state: instance.values,
  }
}
function pauseSave() {
  let release
  runtime.gate = new Promise(resolve => { release = resolve })
  return release
}
beforeEach(() => {
  vi.clearAllMocks()
  runtime.store = createTransactionStore({ [path]: fixture })
  runtime.listeners = new Set()
  runtime.gate = null
})

const pages = [['My Reports', MyReportsPage], ['Dashboard', DashboardPage]]
const fields = [['edit-title', 'title'], ['edit-desc', 'description'], ['edit-addr', 'address']]

for (const [firstName, First] of pages) for (const [secondName, Second] of pages) {
  it('preserves disjoint edits across ' + firstName + ' → ' + secondName, async () => {
    const first = mount(First), second = mount(Second)
    first.change('edit-addr', '12 Market Road')
    second.change('edit-title', 'Broken lamp beside school')
    await first.save()
    expect(runtime.store.read(path).address).toBe('12 Market Road')
    emitSnapshot()
    expect(second.draft()).toEqual(['Broken lamp beside school', fixture.description, fixture.address])
    await second.save()
    const persisted = runtime.store.read(path)
    expect(persisted).toEqual({ ...fixture, title: 'Broken lamp beside school', address: '12 Market Road', updatedAt: 'server-time' })
    expect(toast.success).toHaveBeenCalledTimes(2)
  })
}

describe.each(pages)('%s editing', (_name, Page) => {
  for (const [id, label] of fields) {
    it.each([null, undefined])('rejects a legacy ' + label + ' of %s', async value => {
      runtime.store = createTransactionStore({ [path]: { ...fixture, [label]: value } })
      const ui = mount(Page), before = ui.draft()
      await ui.save()
      expect(runtime.store.history).toEqual([])
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(label))
      expect(toast.success).not.toHaveBeenCalled()
      expect(ui.isOpen()).toBe(true)
      expect(ui.draft()).toEqual(before)
      expect(ui.button('Save Changes').props.disabled).toBe(false)
    })

    it.each(['', '   ', '\t\n ', ' \t\r\n  '])('blocks blank ' + label + ': %j', async value => {
      const ui = mount(Page)
      ui.change(id, value)
      const before = ui.draft()
      await ui.save()
      expect(runtime.store.history).toEqual([])
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(label))
      expect(toast.success).not.toHaveBeenCalled()
      expect(ui.isOpen()).toBe(true)
      expect(ui.draft()).toEqual(before)
      expect(ui.button('Save Changes').props.disabled).toBe(false)
    })

    it('keeps a conflicting ' + label + ' draft open without writing', async () => {
      const first = mount(Page), second = mount(Page)
      first.change(id, 'First edit')
      second.change(id, 'Second edit')
      await first.save()
      const draft = second.draft()
      vi.clearAllMocks()
      await second.save()
      expect(runtime.store.read(path)[label]).toBe('First edit')
      expect(runtime.store.history).toHaveLength(1)
      expect(second.isOpen()).toBe(true)
      expect(second.draft()).toEqual(draft)
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/changed elsewhere/))
      expect(toast.success).not.toHaveBeenCalled()
    })
  }

  it('normalizes valid edits, preserves metadata and blocks a same-render duplicate', async () => {
    const ui = mount(Page), release = pauseSave()
    ui.change('edit-title', '  Repair lamp  ')
    ui.change('edit-desc', ' \nNew description\t ')
    ui.change('edit-addr', '  New address  ')
    const click = ui.button('Save Changes').props.onClick
    const pending = click()
    const duplicate = click()
    expect(ui.button('Saving...').props.disabled).toBe(true)
    release()
    await Promise.all([pending, duplicate])
    expect(runtime.store.history).toHaveLength(1)
    expect(runtime.store.read(path)).toEqual({
      ...fixture, title: 'Repair lamp', description: 'New description', address: 'New address', updatedAt: 'server-time',
    })
    expect(ui.isOpen()).toBe(false)
    expect(ui.button('Save Changes').props.disabled).toBe(false)
    expect(toast.success).toHaveBeenCalledOnce()
  })

  it('retains the draft after an offline failure and allows retry', async () => {
    const ui = mount(Page)
    ui.change('edit-title', 'New title')
    const before = ui.draft()
    runtime.store.failCommit = Object.assign(new Error('offline'), { code: 'unavailable' })
    await ui.save()
    expect(runtime.store.read(path)).toEqual(fixture)
    expect(runtime.store.history).toEqual([])
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/connection/i))
    expect(toast.success).not.toHaveBeenCalled()
    expect(ui.isOpen()).toBe(true)
    expect(ui.draft()).toEqual(before)
    expect(ui.button('Save Changes').props.disabled).toBe(false)
    runtime.store.failCommit = null
    await ui.save()
    expect(ui.isOpen()).toBe(false)
    expect(runtime.store.read(path).title).toBe('New title')
  })
})

it('does not write from a stale no-op dialog', async () => {
  const ui = mount(MyReportsPage)
  runtime.store.write(path, { ...fixture, address: 'Newer address' })
  await ui.save()
  expect(runtime.store.read(path).address).toBe('Newer address')
  expect(runtime.store.history).toHaveLength(1)
  expect(ui.isOpen()).toBe(false)
})

it('accepts identical edits without writing twice', async () => {
  const first = mount(MyReportsPage), second = mount(DashboardPage)
  first.change('edit-title', 'Same new title')
  second.change('edit-title', 'Same new title')
  await first.save()
  await second.save()
  expect(runtime.store.history).toHaveLength(1)
  expect(second.isOpen()).toBe(false)
})

it('preserves independent writes during simultaneous transactions and retries', async () => {
  const first = mount(MyReportsPage), second = mount(DashboardPage)
  first.change('edit-addr', 'New address')
  second.change('edit-title', 'New title')
  await Promise.all([first.save(), second.save()])
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(path)).toEqual({ ...fixture, title: 'New title', address: 'New address', updatedAt: 'server-time' })
  expect(runtime.store.history).toHaveLength(2)
  expect(toast.success).toHaveBeenCalledTimes(2)
})

it('re-evaluates a field conflict on transaction retry', async () => {
  const ui = mount(DashboardPage)
  ui.change('edit-title', 'My title')
  runtime.store.beforeCommit = () => runtime.store.write(path, { ...fixture, title: 'Newer title' })
  await ui.save()
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(path).title).toBe('Newer title')
  expect(runtime.store.history).toHaveLength(1)
  expect(ui.isOpen()).toBe(true)
  expect(toast.success).not.toHaveBeenCalled()
})

it.each([
  ['status changed', { status: 'Resolved' }, /no longer pending/i],
  ['owner changed', { reportedBy: 'citizen-2' }, /own complaints/i],
  ['required field became blank', { address: '' }, /address/i],
])('preserves the draft when %s', async (_label, patch, message) => {
  const ui = mount(MyReportsPage)
  ui.change('edit-title', 'My title')
  runtime.store.write(path, { ...fixture, ...patch })
  await ui.save()
  expect(runtime.store.read(path)).toEqual({ ...fixture, ...patch })
  expect(runtime.store.history).toHaveLength(1)
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(message))
  expect(ui.isOpen()).toBe(true)
  expect(ui.draft()[0]).toBe('My title')
})

it('does not recreate a deleted complaint', async () => {
  const ui = mount(DashboardPage)
  ui.change('edit-title', 'My title')
  runtime.store.remove(path)
  await ui.save()
  expect(runtime.store.read(path)).toBeUndefined()
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/no longer exists/i))
  expect(ui.isOpen()).toBe(true)
})

it('reports a Firestore permission failure without changing data', async () => {
  const ui = mount(DashboardPage)
  ui.change('edit-title', 'My title')
  runtime.store.failCommit = Object.assign(new Error('denied'), { code: 'permission-denied' })
  await ui.save()
  expect(runtime.store.read(path)).toEqual(fixture)
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/permission/i))
  expect(ui.isOpen()).toBe(true)
})

it('does not publish UI effects after unmount during a save', async () => {
  const ui = mount(MyReportsPage), release = pauseSave()
  ui.change('edit-title', 'My title')
  const pending = ui.save()
  ui.unmount()
  const before = [...ui.state]
  release()
  await pending
  expect(runtime.store.read(path).title).toBe('My title')
  expect(ui.state).toEqual(before)
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).not.toHaveBeenCalled()
})
