import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyReportsPage } from './MyReportsPage'
import { DashboardPage } from './DashboardPage'
import { Dialog } from '@/components/ui/dialog'
import { updateDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'

// Handler-level tests: keep the pages and their JSX event bindings real, while
// controlling hooks and Firebase. This needs no DOM or extra test dependencies.
const hooks = vi.hoisted(() => ({ values: [], cursor: 0, effects: [], mounted: false }))
const fixture = vi.hoisted(() => ({
  id: 'report-1', title: 'Broken lamp', description: 'Lamp does not light',
  address: 'Market Road', status: 'Pending', reportedBy: 'citizen-1',
  department: 'Electricity', complaintId: 'CMP-2026-0001',
}))
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(),
  useState(initial) {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = initial
    return [hooks.values[index], value => {
      hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value
    }]
  },
  useEffect(effect) { if (!hooks.mounted) hooks.effects.push(effect) },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'citizen-1', name: 'Citizen' } }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/firebase/services', () => ({ db: {} }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), deleteDoc: vi.fn(),
  doc: (_db, collection, id) => ({ collection, id }),
  updateDoc: vi.fn(), serverTimestamp: () => 'server-time',
  onSnapshot: (_query, _options, callback) => {
    callback({ empty: false, metadata: { fromCache: false }, docs: [{ id: fixture.id, data: () => ({ ...fixture }) }] })
    return () => {}
  },
}))

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes)
  if (!element || typeof element !== 'object' || !element.props) return []
  return [element, ...nodes(element.props.children)]
}
function text(element) {
  if (Array.isArray(element)) return element.map(text).join('')
  return typeof element === 'string' ? element : element?.props ? text(element.props.children) : ''
}

describe.each([['My Reports', MyReportsPage], ['Dashboard', DashboardPage]])('%s editing', (_name, Page) => {
  let tree
  const render = () => { hooks.cursor = 0; tree = Page(); return tree }
  const button = label => nodes(tree).find(node => node.props.onClick && text(node).trim() === label)
  const input = id => nodes(tree).find(node => node.props.id === id)
  const dialog = () => nodes(tree).find(node => node.type === Dialog && text(node).includes('Edit Complaint'))
  const draft = () => ['edit-title', 'edit-desc', 'edit-addr'].map(id => input(id).props.value)

  const mount = () => {
    vi.clearAllMocks()
    hooks.values = []; hooks.effects = []; hooks.mounted = false
    updateDoc.mockResolvedValue(undefined)
    render()
    hooks.effects.forEach(effect => effect())
    hooks.mounted = true
    render()
    button('Edit').props.onClick()
    render()
  }
  beforeEach(mount)

  for (const field of ['title', 'description', 'address']) {
    it.each([null, undefined])(`rejects a legacy record with ${field}=%s without throwing`, async value => {
      const original = fixture[field]
      try {
        fixture[field] = value
        mount()
        const before = draft()
        await button('Save Changes').props.onClick()
        render()
        expect(updateDoc).not.toHaveBeenCalled()
        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(field))
        expect(dialog().props.open).toBe(true)
        expect(draft()).toEqual(before)
        expect(button('Save Changes').props.disabled).toBe(false)
      } finally {
        fixture[field] = original
      }
    })
  }

  for (const [id, label] of [['edit-title', 'title'], ['edit-desc', 'description'], ['edit-addr', 'address']]) {
    it.each(['', '   ', '\t\n ', ' \t\r\n  '])(`blocks blank ${label}: %j and preserves the draft`, async value => {
      input(id).props.onChange({ target: { value } })
      render()
      const before = draft()
      await button('Save Changes').props.onClick()
      render()
      expect(updateDoc).not.toHaveBeenCalled()
      expect(toast.success).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(new RegExp(label, 'i')))
      expect(dialog().props.open).toBe(true)
      expect(draft()).toEqual(before)
      expect(button('Save Changes').props.disabled).toBe(false)
    })
  }

  it('normalizes valid edits, preserves metadata and resets saving state', async () => {
    let resolve
    updateDoc.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    input('edit-title').props.onChange({ target: { value: '  Repair lamp  ' } })
    input('edit-desc').props.onChange({ target: { value: ` \n${fixture.description}\t ` } })
    input('edit-addr').props.onChange({ target: { value: `  ${fixture.address}  ` } })
    render()
    const saving = button('Save Changes').props.onClick()
    render()
    expect(button('Saving...').props.disabled).toBe(true)
    await button('Saving...').props.onClick()
    expect(updateDoc).toHaveBeenCalledOnce()
    resolve()
    await saving
    render()
    expect(updateDoc).toHaveBeenCalledExactlyOnceWith({ collection: 'issues', id: fixture.id }, {
      title: 'Repair lamp', description: fixture.description, address: fixture.address, updatedAt: 'server-time',
    })
    const persisted = { ...fixture, ...updateDoc.mock.calls[0][1] }
    expect(persisted.status).toBe('Pending')
    expect(persisted.department).toBe(fixture.department)
    expect(persisted.reportedBy).toBe(fixture.reportedBy)
    expect(persisted.complaintId).toBe(fixture.complaintId)
    expect(dialog().props.open).toBe(false)
    expect(button('Save Changes').props.disabled).toBe(false)
    expect(toast.success).toHaveBeenCalledOnce()
  })

  it('retains the draft and dialog on Firestore failure, then allows retry', async () => {
    updateDoc.mockRejectedValueOnce(new Error('offline'))
    const before = draft()
    await button('Save Changes').props.onClick()
    render()
    expect(toast.error).toHaveBeenCalledWith('Failed to update complaint')
    expect(toast.success).not.toHaveBeenCalled()
    expect(dialog().props.open).toBe(true)
    expect(draft()).toEqual(before)
    expect(button('Save Changes').props.disabled).toBe(false)
    await button('Save Changes').props.onClick()
    render()
    expect(dialog().props.open).toBe(false)
  })
})
