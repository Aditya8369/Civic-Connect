import { beforeEach, expect, it, vi } from 'vitest'
import { ReportPage } from './ReportPage'
import { endorseComplaint } from '@/firebase/endorseComplaint'
import toast from 'react-hot-toast'

const runtime = vi.hoisted(() => ({ values: [], cursor: 0 }))
vi.mock('react', async original => ({
  ...await original(),
  useState(initial) {
    const index = runtime.cursor++
    if (!(index in runtime.values)) runtime.values[index] = initial
    return [runtime.values[index], value => {
      runtime.values[index] = typeof value === 'function' ? value(runtime.values[index]) : value
    }]
  },
  useRef(initial) {
    const index = runtime.cursor++
    return runtime.values[index] ||= { current: initial }
  },
  useEffect() {}, useCallback: callback => callback,
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'citizen-1' } }) }))
vi.mock('@/firebase/services', () => ({ db: {} }))
vi.mock('@/firebase/endorseComplaint', () => ({ endorseComplaint: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), Link: () => null }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes)
  return element?.props ? [element, ...nodes(element.props.children)] : []
}
function text(element) {
  if (Array.isArray(element)) return element.map(text).join('')
  return typeof element === 'string' ? element : element?.props ? text(element.props.children) : ''
}
function button() {
  runtime.cursor = 0
  return nodes(ReportPage()).find(node => node.props.onClick && text(node).includes('I also face this'))
}

beforeEach(() => {
  vi.clearAllMocks()
  runtime.values = []
  runtime.values[9] = [{ id: 'report-1', title: 'Lamp', endorsedBy: [], endorsementCount: 0 }]
})

it('prevents overlapping clicks and renders the committed count', async () => {
  let finish
  endorseComplaint.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const click = button().props.onClick
  const first = click()
  await click()
  expect(endorseComplaint).toHaveBeenCalledOnce()
  finish({ added: true, endorsedBy: ['citizen-2', 'citizen-1'], endorsementCount: 2 })
  await first
  expect(runtime.values[9][0]).toMatchObject({ endorsedBy: ['citizen-2', 'citizen-1'], endorsementCount: 2 })
  expect(toast.success).toHaveBeenCalledOnce()
})

it('shows already endorsed when the server has a newer endorsement', async () => {
  endorseComplaint.mockResolvedValue({ added: false, endorsedBy: ['citizen-1'], endorsementCount: 1 })
  await button().props.onClick()
  expect(runtime.values[9][0]).toMatchObject({ endorsedBy: ['citizen-1'], endorsementCount: 1 })
  expect(toast.info).toHaveBeenCalledWith('You have already endorsed this complaint')
  expect(toast.success).not.toHaveBeenCalled()
})

it('keeps the local result unchanged and permits retry after a failed save', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  endorseComplaint.mockRejectedValueOnce(new Error('missing'))
  await button().props.onClick()
  expect(runtime.values[9][0]).toMatchObject({ endorsedBy: [], endorsementCount: 0 })
  expect(toast.error).toHaveBeenCalledOnce()
  expect(toast.success).not.toHaveBeenCalled()
  expect(button().props.disabled).toBe(false)
  vi.restoreAllMocks()
})
