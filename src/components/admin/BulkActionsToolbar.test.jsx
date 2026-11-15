// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BulkActionsToolbar } from './BulkActionsToolbar'
import { executeBulkComplaintAction } from '@/firebase/bulkComplaints'
import { LanguageProvider } from '@/contexts/LanguageContext'
import toast from 'react-hot-toast'

vi.mock('@/firebase/services', () => ({ db: {} }))

vi.mock('@/firebase/bulkComplaints', () => ({
  executeBulkComplaintAction: vi.fn(),
  normalizeComplaintsMap: (complaints) =>
    Object.fromEntries(
      complaints.map((complaint) => [complaint.id, complaint])
    ),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

let root
let container
let updateComplaints

const initial = [
  { id: 'c1', title: 'Pothole', status: 'Pending' },
  { id: 'c2', title: 'Lamp', status: 'Resolved' },
]

function Harness() {
  const [selectedIds, setSelectedIds] = useState(['c1', 'c2'])
  const [complaints, setComplaints] = useState(initial)

  useEffect(() => {
    updateComplaints = setComplaints
  }, [])

  return (
    <BulkActionsToolbar
      selectedIds={selectedIds}
      complaints={complaints}
      onClearSelection={() => setSelectedIds([])}
      onSelectionChange={setSelectedIds}
      actorUid="admin-1"
    />
  )
}

function confirmButton() {
  return [...document.querySelectorAll('button')].find(
    (button) =>
      button.textContent.includes('Confirm & Apply') ||
      button.textContent.includes('Applying...')
  )
}

async function openAndWriteRemarks() {
  await act(async () => {
    root.render(
      <LanguageProvider>
        <Harness />
      </LanguageProvider>
    )
  })

  await act(async () => {
    container.querySelector('[aria-label="Bulk mark Resolved"]').click()
  })

  const input = document.querySelector('#bulk-remarks')

  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    ).set.call(input, 'Keep this audit note')

    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})

  localStorage.clear()
  localStorage.setItem('civic-connect-language', 'en')

  container = document.createElement('div')
  document.body.append(container)

  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })

  container.remove()
  document.body.innerHTML = ''
})

it('keeps conflicts selected and remarks intact, then applies only the reviewed remainder', async () => {
  let resolve

  executeBulkComplaintAction.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )

  await openAndWriteRemarks()

  await act(async () => {
    const confirm = confirmButton()
    confirm.click()
    confirm.click()
  })

  expect(executeBulkComplaintAction).toHaveBeenCalledTimes(1)
  expect(confirmButton().disabled).toBe(true)
  expect(document.querySelector('#bulk-remarks').disabled).toBe(true)

  const current = [
    { ...initial[0], status: 'Resolved' },
    { ...initial[1], status: 'Reopened' },
  ]

  await act(async () => {
    updateComplaints(current)

    resolve({
      success: false,
      count: 1,
      conflictIds: ['c2'],
      failedIds: [],
      unchangedIds: [],
    })
  })

  expect(document.querySelector('[role="dialog"]')).not.toBeNull()

  expect(
    document.querySelector('[role="status"]').textContent
  ).toContain('1 updated, 1 changed or unavailable')

  expect(document.querySelector('#bulk-remarks').value).toBe(
    'Keep this audit note'
  )

  expect(
    document.querySelector('[role="dialog"]').textContent
  ).toContain('Affected Complaints (1)')

  expect(
    document.querySelector('[role="dialog"]').textContent
  ).toContain('Reopened')

  expect(toast.success).not.toHaveBeenCalled()

  expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining('1 updated')
  )

  expect(confirmButton().disabled).toBe(false)

  executeBulkComplaintAction.mockResolvedValueOnce({
    success: true,
    count: 1,
    conflictIds: [],
    failedIds: [],
    unchangedIds: [],
  })

  await act(async () => {
    confirmButton().click()
  })

  expect(executeBulkComplaintAction.mock.calls[1][0]).toMatchObject({
    complaintIds: ['c2'],
    complaints: current,
    remarks: 'Keep this audit note',
  })

  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(container.textContent).toBe('')

  expect(toast.success).toHaveBeenCalledWith(
    expect.stringContaining('for 1 report')
  )
})

it('preserves the dialog and draft on failure and allows an explicit retry', async () => {
  executeBulkComplaintAction.mockRejectedValueOnce(
    new Error('Offline')
  )

  await openAndWriteRemarks()

  await act(async () => {
    confirmButton().click()
  })

  expect(document.querySelector('#bulk-remarks').value).toBe(
    'Keep this audit note'
  )

  expect(confirmButton().disabled).toBe(false)

  expect(toast.error).toHaveBeenCalledWith(
    'Failed to perform bulk update. Please try again.'
  )

  expect(toast.success).not.toHaveBeenCalled()

  executeBulkComplaintAction.mockResolvedValueOnce({
    success: true,
    count: 2,
  })

  await act(async () => {
    confirmButton().click()
  })

  expect(executeBulkComplaintAction).toHaveBeenCalledTimes(2)

  expect(
    executeBulkComplaintAction.mock.calls[1][0].remarks
  ).toBe('Keep this audit note')

  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
