// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SpotlightSearchModal } from './SpotlightSearchModal'
import * as searchHistory from '@/utils/searchHistory'
import { LanguageProvider } from '@/contexts/LanguageContext'

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

const mockNavigate = vi.fn()
let currentRole = 'citizen'
let currentUid = 'citizen-1'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: currentUid ? { uid: currentUid, role: currentRole, name: 'Test User' } : null,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockReports = [
  {
    id: 'rep-1',
    complaintId: 'CMP-2026-0001',
    title: 'Severe Pothole on Church Street',
    description: 'A 2-foot wide pothole near Metro Station creating hazards.',
    category: 'Potholes & Road Damage',
    priority: 'High',
    status: 'Pending',
    ward: 'Ward 4',
    address: 'Church Street, Ward 4',
    department: 'Roads',
  },
  {
    id: 'rep-2',
    complaintId: 'CMP-2026-0002',
    title: 'Flickering Streetlight in Indiranagar',
    description: 'Streetlight pole 14 is dark at night.',
    category: 'Streetlight Issues',
    priority: 'Low',
    status: 'Resolved',
    ward: 'Ward 2',
    address: '100ft Road, Ward 2',
    department: 'Electricity',
  },
  {
    id: 'rep-3',
    complaintId: 'CMP-2026-0003',
    title: 'Burst Water Pipe leaking heavily',
    description: 'Clean water flooding the pavement since morning.',
    category: 'Water Leakage',
    priority: 'Critical',
    status: 'In Progress',
    ward: 'Ward 4',
    address: 'Residency Road, Ward 4',
    department: 'Water',
  },
]

let container = null
let root = null

function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function renderModal(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(
      <LanguageProvider>
        <SpotlightSearchModal
          isOpen={true}
          onClose={vi.fn()}
          reports={mockReports}
          {...props}
        />
      </LanguageProvider>
    )
  })
}

function cleanupComponent() {
  if (root) {
    act(() => {
      root.unmount()
    })
    root = null
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
    container = null
  }
  document.body.innerHTML = ''
}

describe('SpotlightSearchModal Component', () => {
  beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('civic-connect-language', 'en')

  currentRole = 'citizen'
  currentUid = 'citizen-1'

  mockNavigate.mockReset()
  vi.restoreAllMocks()
})

  afterEach(() => {
    cleanupComponent()
  })

  describe('Modal Rendering and Accessibility', () => {
    it('renders search modal with proper dialog and combobox accessibility roles', async () => {
      await renderModal()

      const dialog = document.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog?.getAttribute('aria-label')).toBe('Spotlight Search')

      const input = document.querySelector('input[type="text"]')
      expect(input).not.toBeNull()
      expect(input?.getAttribute('role')).toBe('combobox')
      expect(input?.getAttribute('placeholder')).toContain('Search reports')
      expect(input?.getAttribute('aria-autocomplete')).toBe('list')
    })

    it('renders clean recent searches empty state when input is empty and no history exists', async () => {
      await renderModal()

      expect(document.body.textContent).toContain('No recent searches')
      expect(document.body.textContent).toContain('Type to search complaints by title')
    })

    it('renders recent searches when available and empty input', async () => {
      searchHistory.saveRecentSearch('citizen-1', 'pothole on church street')
      searchHistory.saveRecentSearch('citizen-1', 'water pipe')

      await renderModal()

      expect(document.body.textContent).toContain('Recent Searches')
      expect(document.body.textContent).toContain('water pipe')
      expect(document.body.textContent).toContain('pothole on church street')
    })

    it('clicking a recent search term populates search input', async () => {
      searchHistory.saveRecentSearch('citizen-1', 'flickering streetlight')
      await renderModal()

      const recentItem = Array.from(document.querySelectorAll('span')).find(
        (el) => el.textContent === 'flickering streetlight'
      )
      expect(recentItem).toBeDefined()

      await act(async () => {
        recentItem?.closest('div')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      const input = document.querySelector('input[type="text"]')
      expect(input?.value).toBe('flickering streetlight')
      expect(document.body.textContent).toContain('Flickering Streetlight in Indiranagar')
    })

    it('clears recent search history when Clear History is clicked', async () => {
      searchHistory.saveRecentSearch('citizen-1', 'sample search')
      await renderModal()

      const clearBtn = document.querySelector('button[aria-label="Clear recent searches"]')
      expect(clearBtn).not.toBeNull()

      await act(async () => {
        clearBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).toContain('No recent searches')
    })
  })

  describe('Text Search Functionality', () => {
    it('searches reports by title case-insensitively', async () => {
      await renderModal()

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'POTHOLE')
      })

      expect(document.body.textContent).toContain('Severe Pothole on Church Street')
      expect(document.body.textContent).not.toContain('Flickering Streetlight')
    })

    it('searches reports by description', async () => {
      await renderModal()

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'clean water flooding')
      })

      expect(document.body.textContent).toContain('Burst Water Pipe leaking heavily')
      expect(document.body.textContent).not.toContain('Severe Pothole')
    })

    it('searches reports by tracking ID (CMP-2026-0002)', async () => {
      await renderModal()

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'CMP-2026-0002')
      })

      expect(document.body.textContent).toContain('Flickering Streetlight in Indiranagar')
      expect(document.body.textContent).not.toContain('Burst Water Pipe')
    })

    it('displays helpful empty state when no matching results are found', async () => {
      await renderModal()

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'nonexistent query 12345')
      })

      expect(document.body.textContent).toContain('No matching reports found')
      expect(document.body.textContent).toContain('Clear search & filters')
    })
  })

  describe('Quick Filter Chips Functionality', () => {
    it('renders all four filter chips: Category, Priority, Ward, and Status', async () => {
      await renderModal()

      expect(document.querySelector('button[aria-label="Filter by Category"]')).not.toBeNull()
      expect(document.querySelector('button[aria-label="Filter by Priority"]')).not.toBeNull()
      expect(document.querySelector('button[aria-label="Filter by Ward"]')).not.toBeNull()
      expect(document.querySelector('button[aria-label="Filter by Status"]')).not.toBeNull()
    })

    it('filters by category chip selection', async () => {
      await renderModal()

      const categoryBtn = document.querySelector('button[aria-label="Filter by Category"]')
      await act(async () => {
        categoryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      // Select "Streetlight Issues"
      const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Streetlight Issues')
      )
      expect(item).toBeDefined()

      await act(async () => {
        item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).toContain('Category: Streetlight Issues')
      expect(document.body.textContent).toContain('Flickering Streetlight in Indiranagar')
      expect(document.body.textContent).not.toContain('Severe Pothole on Church Street')
    })

    it('filters by priority chip selection', async () => {
      await renderModal()

      const priorityBtn = document.querySelector('button[aria-label="Filter by Priority"]')
      await act(async () => {
        priorityBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      const criticalItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Critical')
      )
      expect(criticalItem).toBeDefined()

      await act(async () => {
        criticalItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).toContain('Priority: Critical')
      expect(document.body.textContent).toContain('Burst Water Pipe leaking heavily')
      expect(document.body.textContent).not.toContain('Flickering Streetlight')
    })

    it('filters by ward chip selection', async () => {
      await renderModal()

      const wardBtn = document.querySelector('button[aria-label="Filter by Ward"]')
      await act(async () => {
        wardBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      const ward2Item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Ward 2')
      )
      expect(ward2Item).toBeDefined()

      await act(async () => {
        ward2Item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).toContain('Ward: Ward 2')
      expect(document.body.textContent).toContain('Flickering Streetlight in Indiranagar')
      expect(document.body.textContent).not.toContain('Severe Pothole on Church Street')
    })

    it('filters by status chip selection', async () => {
      await renderModal()

      const statusBtn = document.querySelector('button[aria-label="Filter by Status"]')
      await act(async () => {
        statusBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      const resolvedItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Resolved')
      )
      expect(resolvedItem).toBeDefined()

      await act(async () => {
        resolvedItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).toContain('Status: Resolved')
      expect(document.body.textContent).toContain('Flickering Streetlight in Indiranagar')
      expect(document.body.textContent).not.toContain('Burst Water Pipe')
    })

    it('removes an individual filter using its remove button', async () => {
      await renderModal()

      // Set Priority: Critical
      const priorityBtn = document.querySelector('button[aria-label="Filter by Priority"]')
      await act(async () => {
        priorityBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const criticalItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Critical')
      )
      await act(async () => {
        criticalItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).toContain('Priority: Critical')

      // Click clear priority filter
      const removeBtn = document.querySelector('span[aria-label="Clear priority filter"]')
      expect(removeBtn).not.toBeNull()

      await act(async () => {
        removeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).not.toContain('Priority: Critical')
    })

    it('clears all active filters using Clear Filters action', async () => {
      await renderModal()

      // Activate Category filter
      const categoryBtn = document.querySelector('button[aria-label="Filter by Category"]')
      await act(async () => {
        categoryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Water Leakage')
      )
      await act(async () => {
        item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).toContain('Category: Water Leakage')

      const clearAllBtn = document.querySelector('button[aria-label="Clear all filters"]')
      expect(clearAllBtn).not.toBeNull()

      await act(async () => {
        clearAllBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(document.body.textContent).not.toContain('Category: Water Leakage')
      expect(document.querySelector('button[aria-label="Clear all filters"]')).toBeNull()
    })

    it('combines text search with multiple filters simultaneously', async () => {
      await renderModal()

      // 1. Text search: "pothole"
      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'pothole')
      })

      // 2. Filter Category: Potholes & Road Damage
      const categoryBtn = document.querySelector('button[aria-label="Filter by Category"]')
      await act(async () => {
        categoryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const catItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Potholes & Road Damage')
      )
      await act(async () => {
        catItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      // 3. Filter Priority: High
      const priorityBtn = document.querySelector('button[aria-label="Filter by Priority"]')
      await act(async () => {
        priorityBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const priItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('High')
      )
      await act(async () => {
        priItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      // Result matches
      expect(document.body.textContent).toContain('Severe Pothole on Church Street')

      // 4. Now filter Ward: Ward 2 (mismatch!)
      const wardBtn = document.querySelector('button[aria-label="Filter by Ward"]')
      await act(async () => {
        wardBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const wardItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
        el.textContent?.includes('Ward 2')
      )
      await act(async () => {
        wardItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      // No match should now show empty state
      expect(document.body.textContent).toContain('No matching reports found')
    })
  })

  describe('Keyboard Navigation and Report Selection', () => {
    it('navigates results with Arrow Down and Arrow Up keys', async () => {
      await renderModal()

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'Ward 4')
      })

      // Two results match Ward 4 (rep-1 and rep-3)
      const options = document.querySelectorAll('[role="option"]')
      expect(options).toHaveLength(2)

      // First item selected by default (index 0)
      expect(options[0].getAttribute('aria-selected')).toBe('true')
      expect(options[1].getAttribute('aria-selected')).toBe('false')

      // Press ArrowDown
      const content = document.querySelector('[role="dialog"]')
      await act(async () => {
        content?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      })

      expect(options[0].getAttribute('aria-selected')).toBe('false')
      expect(options[1].getAttribute('aria-selected')).toBe('true')

      // Press ArrowUp to go back
      await act(async () => {
        content?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      })

      expect(options[0].getAttribute('aria-selected')).toBe('true')
    })

    it('pressing Enter on a highlighted report selects it and navigates for citizens', async () => {
      const onClose = vi.fn()
      await renderModal({ onClose })

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'pothole')
      })

      const content = document.querySelector('[role="dialog"]')
      await act(async () => {
        content?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })

      expect(mockNavigate).toHaveBeenCalledWith('/report/rep-1')
      expect(onClose).toHaveBeenCalled()

      // Query saved in recent searches
      expect(searchHistory.getRecentSearches('citizen-1')).toContain('pothole')
    })

    it('pressing Enter on a highlighted report navigates to admin route for admins', async () => {
      currentRole = 'admin'
      currentUid = 'admin-99'
      const onClose = vi.fn()
      await renderModal({ onClose })

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'flickering')
      })

      const content = document.querySelector('[role="dialog"]')
      await act(async () => {
        content?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })

      expect(mockNavigate).toHaveBeenCalledWith('/admin/reports/rep-2')
      expect(onClose).toHaveBeenCalled()
    })

    it('clicking a report item selects it and navigates', async () => {
      const onClose = vi.fn()
      await renderModal({ onClose })

      const input = document.querySelector('input[type="text"]')
      await act(async () => {
        setInputValue(input, 'water')
      })

      const reportOption = document.querySelector('[role="option"]')
      expect(reportOption).not.toBeNull()

      await act(async () => {
        reportOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(mockNavigate).toHaveBeenCalledWith('/report/rep-3')
      expect(onClose).toHaveBeenCalled()
    })

    it('pressing Escape key calls onClose', async () => {
      const onClose = vi.fn()
      await renderModal({ onClose })

      const content = document.querySelector('[role="dialog"]')
      await act(async () => {
        content?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })

      expect(onClose).toHaveBeenCalled()
    })
  })
})
